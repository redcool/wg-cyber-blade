// ============================================================
// src/engine/item.js — 道具系统 v3（数据驱动）
// 四层：Stats + Triggers + Tags + Rarity
// 效果引擎委托给 src/engine/effects.js
// ============================================================

const ItemSystem = {
    /** 所有道具定义（从 items.json 加载） */
    allItems: [],

    /** 已持有的道具列表 */
    ownedItems: [],

    // -------------------------------------------------------
    // 4.1 数据加载
    // -------------------------------------------------------

    /**
     * 从 DataLoader 加载道具数据
     * Phase 1: 从 items.json 加载后，用 _itemDefs 覆盖增强
     *
     * 算法:
     * 1. await DataLoader.load('items')
     * 2. 用 _itemDefs 的 statMods/tags/triggers 覆盖
     * 3. 校验每个道具的 triggers 格式
     */
    async loadItems() {
        // 使用全局 DataLoader（浏览器环境）
        let items = [];
        if (typeof DataLoader !== 'undefined' && DataLoader.load) {
            items = await DataLoader.load('items');
        }
        if (!items || items.length === 0) {
            items = [];
        }

        // 标准化：statMods 默认 {}，triggers 从 CSV triggers+effects 解析
        this.allItems = items.map(item => ({
            ...item,
            statMods: item.statMods || {},
            tags: item.tags || [],
            triggers: (item.triggers && item.triggers.length > 0)
                ? this._parseTriggers(item.triggers, item.effects)
                : [],
        }));
    },

    /**
     * 解析 JSON 中的 triggers + effects → 内部触发器格式
     * items.json 的 triggers 是 string[]（触发器类型列表），
     * effects 是 JSON 数组（效果列表），两者需合并。
     * @param {string[]} triggerTypes
     * @param {Object[]} effectArray
     * @returns {Object[]}
     */
    _parseTriggers(triggerTypes, effectArray) {
        if (!triggerTypes || triggerTypes.length === 0) return [];
        if (!effectArray || !Array.isArray(effectArray)) return [];

        return triggerTypes.map((type, i) => ({
            type,
            chance: 1.0,
            effect: effectArray[i] || effectArray[0] || null,
        })).filter(t => t.effect !== null);
    },

    // -------------------------------------------------------
    // 4.2 购买/移除
    // -------------------------------------------------------

    /**
     * 获取道具的完整定义（合并 JSON + _itemDefs）
     * @param {string} itemId
     * @returns {Object|null}
     */
    getItemDef(itemId) {
        return this.allItems.find(i => i.id === itemId) || null;
    },

    /**
     * 购买道具（应用 statMods + 注册 triggers）
     * @param {string} itemId
     * @param {Object} player
     * @returns {boolean} 是否成功
     *
     * 算法:
     * 1. 查找道具定义
     * 2. 如果 unique 且已持有 → 返回 false
     * 3. 应用 statMods → player 属性
     * 4. 将道具加入 ownedItems
     * 5. 返回 true
     */
    buyItem(itemId, player) {
        const item = this.getItemDef(itemId);
        if (!item) return false;

        // unique 检查
        if (item.unique && this.hasItem(itemId)) return false;

        // 应用 statMods
        if (item.statMods) {
            for (const [stat, value] of Object.entries(item.statMods)) {
                if (player[stat] !== undefined) {
                    player[stat] += value;
                } else {
                    player[stat] = value;
                }
            }
        }

        // 加入持有列表
        this.ownedItems.push(itemId);

        return true;
    },

    /**
     * 移除道具（撤消 statMods）
     * @param {string} itemId
     * @param {Object} player
     *
     * 算法:
     * 1. 撤消 statMods（反向操作）
     * 2. 从 ownedItems 移除
     */
    removeItem(itemId, player) {
        const item = this.getItemDef(itemId);
        if (!item) return;

        const idx = this.ownedItems.indexOf(itemId);
        if (idx === -1) return;

        // 撤消 statMods
        if (item.statMods) {
            for (const [stat, value] of Object.entries(item.statMods)) {
                if (player[stat] !== undefined) {
                    player[stat] -= value;
                }
            }
        }

        this.ownedItems.splice(idx, 1);
    },

    // -------------------------------------------------------
    // 4.3 触发器引擎
    // -------------------------------------------------------

    /** PerSecond 计时器 */
    _timers: {},

    /**
     * 每帧更新，检查 PerSecond / OnLowHP 触发器
     * @param {number} dt - 帧时间（秒）
     * @param {Object} player
     */
    update(dt, player) {
        if (!player || !this.ownedItems.length) return;

        for (const itemId of this.ownedItems) {
            const item = this.getItemDef(itemId);
            if (!item || !item.triggers) continue;

            for (const trigger of item.triggers) {
                // PerSecond: 计时器触发
                if (trigger.type === 'PerSecond') {
                    const interval = trigger.interval || 1.0;
                    const key = `${itemId}_${trigger.effect ? trigger.effect.type : 'default'}`;
                    this._timers[key] = (this._timers[key] || 0) + dt;
                    if (this._timers[key] >= interval) {
                        this._timers[key] -= interval;
                        this._executeEffect(trigger.effect, player, {});
                    }
                }

                // OnLowHP: 检查血量
                if (trigger.type === 'OnLowHP') {
                    const hpPct = player.maxHp > 0 ? (player.hp || 0) / player.maxHp : 0;
                    if (hpPct < 0.3 && !this._lowHpTriggered) {
                        this._lowHpTriggered = true;
                        this._executeEffect(trigger.effect, player, {});
                    } else if (hpPct >= 0.3) {
                        this._lowHpTriggered = false;
                    }
                }
            }
        }
    },

    /**
     * 由外部事件调用的触发器入口
     * @param {string} triggerType - 'OnHit'|'OnKill'|'OnCrit'|'OnDamageTaken'|'OnDodge'
     * @param {Object} player
     * @param {Object} context - { target, damage, attacker, ... }
     *
     * 算法:
     * 1. 遍历 ownedItems 中 trigger.type 匹配的道具
     * 2. 对每个 trigger: Math.random() < trigger.chance → _executeEffect
     */
    onEvent(triggerType, player, context) {
        if (!player || !this.ownedItems.length) return;

        for (const itemId of this.ownedItems) {
            const item = this.getItemDef(itemId);
            if (!item || !item.triggers) continue;

            for (const trigger of item.triggers) {
                if (trigger.type !== triggerType) continue;

                // 概率检查
                const chance = trigger.chance !== undefined ? trigger.chance : 1.0;
                if (Math.random() >= chance) continue;

                this._executeEffect(trigger.effect, player, context);
            }
        }
    },

    /**
     * 执行单个效果
     * @param {Object} effect - { type, value, ... }
     * @param {Object} player
     * @param {Object} context
     */
    _executeEffect(effect, player, context) {
        if (typeof EffectEngine !== 'undefined') {
            EffectEngine.execute(effect, player, context || {});
        }
    },

    // -------------------------------------------------------
    // 4.4 查询
    // -------------------------------------------------------

    /** 按稀有度过滤 */
    getByRarity(rarity) {
        return this.allItems.filter(i => i.rarity === rarity);
    },

    /** 按标签过滤 */
    getByTag(tagId) {
        return this.allItems.filter(i => i.tags && i.tags.includes(tagId));
    },

    /** 获取可购买道具列表（已持有 unique 的排除） */
    getBuyablePool() {
        return this.allItems.filter(i => {
            if (i.unique && this.hasItem(i.id)) return false;
            return true;
        });
    },

    /** 检查是否已持有 */
    hasItem(itemId) {
        return this.ownedItems.includes(itemId);
    },

    /** 清空持有（用于重置） */
    reset() {
        this.ownedItems = [];
        this._timers = {};
        this._lowHpTriggered = false;
    },
};

// CJS 导出
if (typeof module !== 'undefined') {
    module.exports = { ItemSystem };
}
