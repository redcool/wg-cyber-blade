// ============================================================
// src/engine/passives.js — 被动技能引擎（数据驱动触发器）
// 角色被动与道具触发器共享此引擎
// ============================================================

/**
 * PassiveSystem — 被动技能系统
 *
 * 数据流:
 *   passives.json → loadPassives() → allPassives[]
 *   register(id) → activePassives[] (去重)
 *   onEvent(type) / update(dt) → 遍历 activePassives → EffectEngine.execute()
 *
 * 触发类型:
 *   Passive       — 永久生效 statMod，注册时立即应用
 *   OnHit         — 攻击命中，context.target
 *   OnKill        — 击杀时，context.target
 *   OnCrit        — 暴击时，context.target
 *   OnDamageTaken — 受伤时，context.attacker
 *   OnDodge       — 闪避时，context.attacker
 *   PerSecond     — 每秒 tick，无 context
 *   OnLowHP       — HP < 30%，无 context
 *   OnLevelUp     — 升级时，无 context
 */
const PassiveSystem = {
    // -------------------------------------------------------
    // 状态
    // -------------------------------------------------------
    allPassives: [],
    activePassives: [],
    _cooldowns: {},
    _timers: {},
    _lowHpTriggeredSet: {},

    // -------------------------------------------------------
    // 1. 数据加载
    // -------------------------------------------------------

    /**
     * 加载被动技能数据
     * 算法: await DataLoader.load('passives') → this.allPassives
     */
    async loadPassives() {
        let passives = [];
        if (typeof DataLoader !== 'undefined' && DataLoader.load) {
            passives = await DataLoader.load('passives');
        }
        if (!passives || passives.length === 0) {
            console.warn('[PassiveSystem] passives.json 加载失败，使用空列表');
            passives = [];
        }
        this.allPassives = passives;
    },

    // -------------------------------------------------------
    // 2. 注册/注销
    // -------------------------------------------------------

    /**
     * 注册被动技能
     * @param {string} passiveId
     * @param {string} source - 'character' | 'item'
     * @returns {boolean}
     *
     * 算法:
     * 1. 查找被动定义
     * 2. 如果 triggerType === 'Passive' → 立即应用 statMod
     * 3. 否则加入 activePassives
     * 4. 去重: 同一 passiveId + source 不重复
     */
    register(passiveId, source, player) {
        const def = this.getDef(passiveId);
        if (!def) return false;

        const key = `${passiveId}_${source || ''}`;
        if (this.activePassives.some(p => p._regKey === key)) return false;

        const entry = { ...def, _regKey: key, _source: source || 'unknown' };

        if (def.triggerType === 'Passive' && player) {
            if (typeof EffectEngine !== 'undefined') {
                EffectEngine.execute(def.effect, player, {});
            }
        }

        this.activePassives.push(entry);
        return true;
    },

    /**
     * 批量注册
     * @param {string[]} passiveIds
     * @param {string} source
     */
    registerMany(passiveIds, source, player) {
        if (!passiveIds || !passiveIds.length) return;
        for (const id of passiveIds) {
            this.register(id, source, player);
        }
    },

    /**
     * 注销被动技能
     * @param {string} passiveId
     *
     * 算法:
     * 1. 从 activePassives 移除
     * 2. 如果是 Passive 类型 → 撤消 statMod
     */
    unregister(passiveId) {
        const idx = this.activePassives.findIndex(p => p.id === passiveId);
        if (idx === -1) return;

        const entry = this.activePassives[idx];

        if (entry.triggerType === 'Passive' && entry.effect && entry.effect.type === 'statMod') {
            const reverse = {};
            for (const [key, val] of Object.entries(entry.effect)) {
                if (key === 'type') continue;
                reverse[key] = -val;
            }
            if (typeof EffectEngine !== 'undefined') {
                EffectEngine.execute({ type: 'statMod', ...reverse }, null, {});
            }
        }

        this.activePassives.splice(idx, 1);
    },

    /**
     * 批量注销
     * @param {string[]} passiveIds
     */
    unregisterMany(passiveIds) {
        if (!passiveIds || !passiveIds.length) return;
        for (const id of passiveIds) {
            this.unregister(id);
        }
    },

    // -------------------------------------------------------
    // 3. 每帧更新
    // -------------------------------------------------------

    /**
     * 每帧更新，处理 PerSecond / OnLowHP
     * @param {number} dt
     * @param {Object} player
     *
     * 算法:
     * 1. 遍历 activePassives
     * 2. PerSecond: 用 _timers 累加 dt, 间隔触发
     * 3. OnLowHP: 检查 player.hp < maxHp × 0.3
     */
    update(dt, player) {
        if (!player || !this.activePassives.length) return;

        for (const entry of this.activePassives) {
            if (!entry || entry.triggerType === 'Passive') continue;

            if (entry.triggerType === 'PerSecond') {
                this._handlePerSecond(dt, entry, player);
            } else if (entry.triggerType === 'OnLowHP') {
                if (this._isOnCooldown(entry.id)) continue;
                this._handleOnLowHP(entry, player);
            }
        }
    },

    /**
     * PerSecond 处理
     * 使用独立的 _timers 存储（不与冷却系统冲突）
     */
    _handlePerSecond(dt, entry, player) {
        const interval = entry.cooldown || 1.0;
        const key = entry._regKey || entry.id;
        this._timers[key] = (this._timers[key] || 0) + dt;

        if (this._timers[key] >= interval) {
            this._timers[key] -= interval;
            this._trigger(entry, player, {}, true);
        }
    },

    /**
     * OnLowHP 处理
     */
    _handleOnLowHP(entry, player) {
        const hpPct = player.maxHp > 0 ? (player.hp || 0) / player.maxHp : 0;
        const flagKey = entry._regKey || entry.id;

        if (hpPct < 0.3 && !this._lowHpTriggeredSet[flagKey]) {
            this._lowHpTriggeredSet[flagKey] = true;
            this._trigger(entry, player, {});
        } else if (hpPct >= 0.3) {
            this._lowHpTriggeredSet[flagKey] = false;
        }
    },

    // -------------------------------------------------------
    // 4. 事件驱动触发
    // -------------------------------------------------------

    /**
     * 由外部事件调用
     * @param {string} triggerType - 'OnHit'|'OnKill'|'OnCrit'|'OnDamageTaken'|'OnDodge'
     * @param {Object} player
     * @param {Object} context - { target, attacker, damage, ... }
     *
     * 算法:
     * 1. 筛选 activePassives 中 triggerType 匹配的
     * 2. 对每个: cooldown + chance 检查 → _trigger
     */
    onEvent(triggerType, player, context) {
        if (!player || !this.activePassives.length) return;

        for (const entry of this.activePassives) {
            if (!entry || entry.triggerType !== triggerType) continue;
            if (this._isOnCooldown(entry.id)) continue;

            const chance = entry.chance !== undefined ? entry.chance : 1.0;
            if (Math.random() >= chance) continue;

            this._trigger(entry, player, context || {});
        }
    },

    // -------------------------------------------------------
    // 5. 触发执行
    // -------------------------------------------------------

    /**
     * 触发被动效果
     * @param {Object} entry
     * @param {Object} player
     * @param {Object} context
     * @param {boolean} skipCooldown - PerSecond 跳过冷却
     */
    _trigger(entry, player, context, skipCooldown) {
        if (!skipCooldown && entry.cooldown > 0) {
            this._cooldowns[entry.id] = Date.now();
        }

        if (entry.effect && typeof EffectEngine !== 'undefined') {
            EffectEngine.execute(entry.effect, player, context);
        }
    },

    // -------------------------------------------------------
    // 6. 查询
    // -------------------------------------------------------

    /**
     * 检查冷却
     */
    _isOnCooldown(passiveId) {
        if (!this._cooldowns[passiveId]) return false;
        const def = this.getDef(passiveId);
        const cd = def?.cooldown || 0;
        if (cd <= 0) return false;
        return (Date.now() - this._cooldowns[passiveId]) < cd * 1000;
    },

    /** 按标签过滤当前激活的被动 */
    getByTag(tagId) {
        return this.activePassives.filter(p => p.tags && p.tags.includes(tagId));
    },

    /** 获取被动定义 */
    getDef(passiveId) {
        return this.allPassives.find(p => p.id === passiveId) || null;
    },

    /** 清空注册（不清理数据） */
    reset() {
        this.activePassives = [];
        this._cooldowns = {};
        this._timers = {};
        this._lowHpTriggeredSet = {};
    },

    /** 完全重置 */
    resetAll() {
        this.allPassives = [];
        this.reset();
    },
};

// CJS 导出
if (typeof module !== 'undefined') {
    module.exports = { PassiveSystem };
}
