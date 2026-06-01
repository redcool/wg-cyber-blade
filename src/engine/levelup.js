// ============================================================
// src/engine/levelup.js — 升级抽卡系统（流派偏向 + 数据驱动）
// 依赖: data.js (DataLoader), tags.js (TagSystem), stats.js (StatsSystem)
// ============================================================

/**
 * LevelUpSystem — 升级抽卡系统
 *
 * API:
 *   loadCards()                   从 DataLoader 加载 levelUpCards.json
 *   generateCards(player)         生成 3~5 张升级卡
 *   applyCard(cardId, player)     应用选中的升级卡
 *   getCurrentCards()             获取当前可选卡牌
 *   reset()                       重置状态
 *
 * 设计要点:
 *   - statMods 支持 add/mult 两种模式
 *   - action 支持 weaponLevelUp / weaponQualityUp / addWeaponSlot / addPassive
 *   - 流派偏向: TagSystem.getBiasWeights(biasStrength=0.25)
 *   - 通用卡 tags=[] 基础权重 = 稀有度权重
 *   - 流派卡 tags 非空: 基础权重 × 流派偏向
 *   - 本次升级已生成的卡不重复
 *   - 无保底（升级卡本身就是奖励）
 */

const RARITY_WEIGHT = {
    common: 60,
    rare: 25,
    epic: 10,
    legendary: 5,
};

const LevelUpSystem = {
    // -------------------------------------------------------
    // 状态
    // -------------------------------------------------------

    /** 卡牌定义（从 levelUpCards.json 加载） */
    allCards: [],

    /** 当前可选的卡牌 */
    currentCards: [],

    /** 本次升级已生成的卡 ID 集合（避免重复） */
    _generatedIds: new Set(),

    // -------------------------------------------------------
    // 7.1 数据加载
    // -------------------------------------------------------

    /**
     * 加载升级卡数据
     *
     * 算法:
     * 1. await DataLoader.load('levelUpCards')
     * 2. 存入 this.allCards
     */
    async loadCards() {
        if (typeof DataLoader !== 'undefined' && DataLoader.load) {
            const data = await DataLoader.load('levelUpCards');
            this.allCards = data || [];
        }
    },

    // -------------------------------------------------------
    // 7.2 卡牌生成
    // -------------------------------------------------------

    /**
     * 生成升级卡选项（3~5 张）
     * @param {Object} player - 玩家对象
     * @returns {Object[]} 可选卡牌数组
     *
     * 算法:
     * 1. 获取流派偏向权重 (biasStrength=0.25)
     * 2. 从 allCards 中加权选择 3~5 张:
     *    a. 通用卡 (tags=[]): 基础权重 = RARITY_WEIGHT[rarity]
     *    b. 流派卡 (tags 非空): 基础权重 × 流派偏向权重均值
     *    c. 已生成过的卡排除（本局不重复）
     * 3. 清除 currentCards，填入新选项
     * 4. 返回 currentCards
     */
    generateCards(player) {
        const biasStrength = 0.25;
        let biasWeights = {};

        if (typeof TagSystem !== 'undefined' && player) {
            const weaponCounts = TagSystem.countWeaponTags(player.weapons || []);
            const itemCounts = TagSystem.countItemTags(player.items || []);
            const tagCounts = TagSystem.mergeTagCounts(weaponCounts, itemCounts);
            biasWeights = TagSystem.getBiasWeights(tagCounts, biasStrength);
        }

        // 构建加权池
        const cardCount = 3 + Math.floor(Math.random() * 3); // 3~5
        this.currentCards = [];

        // 可用的卡池（排除已生成的）
        const pool = this.allCards.filter(c => !this._generatedIds.has(c.id));

        for (let i = 0; i < cardCount && pool.length > 0; i++) {
            const selected = this._selectCard(pool, biasWeights);
            if (!selected) break;

            // 标记已生成 + 从池中移除
            this._generatedIds.add(selected.id);
            const idx = pool.indexOf(selected);
            if (idx !== -1) pool.splice(idx, 1);

            this.currentCards.push(selected);
        }

        return this.currentCards;
    },

    /**
     * 加权选择一张卡
     * @param {Object[]} pool - 可用卡池
     * @param {Object} biasWeights - 流派偏向权重
     * @returns {Object|null}
     *
     * 算法:
     * 1. 对每张卡计算 finalWeight:
     *    - 通用卡 (tags=[]): baseWeight = RARITY_WEIGHT[rarity]
     *    - 流派卡 (tags 非空):
     *      avgBias = tags 对应 biasWeights 的平均值
     *      baseWeight = RARITY_WEIGHT[rarity] × avgBias
     * 2. 加权随机选择
     */
    _selectCard(pool, biasWeights) {
        if (!pool || pool.length === 0) return null;

        const weightedPool = pool.map(card => {
            const baseWeight = RARITY_WEIGHT[card.rarity] || 50;
            const tags = card.tags || [];

            let weight = baseWeight;

            if (tags.length > 0 && biasWeights) {
                // 计算 tags 对应的平均偏向权重
                let sum = 0;
                let count = 0;
                for (const tag of tags) {
                    if (biasWeights[tag] !== undefined) {
                        sum += biasWeights[tag];
                        count++;
                    }
                }
                if (count > 0) {
                    const avgBias = sum / count;
                    weight = baseWeight * avgBias;
                }
            }

            return { item: card, weight: Math.max(0.01, weight) };
        });

        const totalWeight = weightedPool.reduce((s, w) => s + w.weight, 0);
        let r = Math.random() * totalWeight;
        for (const entry of weightedPool) {
            r -= entry.weight;
            if (r <= 0) return entry.item;
        }
        return weightedPool[weightedPool.length - 1].item;
    },

    // -------------------------------------------------------
    // 7.3 应用
    // -------------------------------------------------------

    /**
     * 应用选中的升级卡
     * @param {string} cardId
     * @param {Object} player
     * @returns {boolean} 是否成功
     *
     * 算法:
     * 1. 查找卡牌定义
     * 2. 有 statMods → _applyStatMods
     * 3. 有 action → 按 action.type 分发:
     *    a. 'weaponLevelUp' → _applyWeaponLevelUp
     *    b. 'weaponQualityUp' → _applyWeaponQualityUp
     *    c. 'addWeaponSlot' → player.weaponSlots++
     *    d. 'addPassive' → _applyAddPassive
     * 4. StatsSystem.clampPlayer(player)
     */
    applyCard(cardId, player) {
        const card = (this.allCards || []).find(c => c.id === cardId);
        if (!card) return false;
        if (!player) return false;

        // 应用 statMods
        if (card.statMods) {
            this._applyStatMods(card.statMods, player);
        }

        // 应用 action
        if (card.action) {
            switch (card.action.type) {
                case 'weaponLevelUp':
                    this._applyWeaponLevelUp(player);
                    break;
                case 'weaponQualityUp':
                    this._applyWeaponQualityUp(player);
                    break;
                case 'addWeaponSlot':
                    this._applyWeaponSlotUp(player);
                    break;
                case 'addPassive':
                    this._applyAddPassive(card.action.passiveId, player);
                    break;
                default:
                    // 未知 action 类型
                    break;
            }
        }

        // 限制属性
        if (typeof StatsSystem !== 'undefined' && StatsSystem.clampPlayer) {
            StatsSystem.clampPlayer(player);
        }

        return true;
    },

    /**
     * 应用 statMods
     * @param {Object} statMods - { statId: { type: 'add'|'mult', value: N }, ... }
     * @param {Object} player
     *
     * 算法:
     * 1. 遍历 statMods
     * 2. type='add': player[stat] += value
     * 3. type='mult': player[stat] *= (1 + value)
     * 4. 如果 player 没有该属性，直接设置
     */
    _applyStatMods(statMods, player) {
        if (!statMods || !player) return;

        for (const [stat, mod] of Object.entries(statMods)) {
            const current = player[stat] !== undefined ? player[stat] : 0;

            if (mod.type === 'add') {
                player[stat] = current + mod.value;
            } else if (mod.type === 'mult') {
                player[stat] = current * (1 + mod.value);
            }
        }
    },

    /**
     * 武器等级升级
     * @param {Object} player
     *
     * 算法:
     * 1. 获取玩家武器列表
     * 2. 随机选择一把武器
     * 3. weapon.level++
     * 4. 重新计算 weaponParams
     */
    _applyWeaponLevelUp(player) {
        if (!player || !player.weapons || player.weapons.length === 0) return;

        const idx = Math.floor(Math.random() * player.weapons.length);
        const weapon = player.weapons[idx];
        weapon.level = (weapon.level || 1) + 1;

        // 更新 weaponParams
        if (typeof ShopSystem !== 'undefined' && ShopSystem._updateWeaponParams) {
            ShopSystem._updateWeaponParams(player, weapon.id);
        }
    },

    /**
     * 武器品质升级
     * @param {Object} player
     *
     * 算法:
     * 1. 随机选择一把武器
     * 2. quality 提升一级: T1→T2, T2→T3, T3→T4
     * 3. 已经是 T4 不再提升
     */
    _applyWeaponQualityUp(player) {
        if (!player || !player.weapons || player.weapons.length === 0) return;

        const qOrder = ['T1', 'T2', 'T3', 'T4'];
        const idx = Math.floor(Math.random() * player.weapons.length);
        const weapon = player.weapons[idx];
        const currentQ = weapon.quality || 'T1';
        const currentIdx = qOrder.indexOf(currentQ);

        if (currentIdx < qOrder.length - 1) {
            weapon.quality = qOrder[currentIdx + 1];
        }

        // 更新 weaponParams
        if (typeof ShopSystem !== 'undefined' && ShopSystem._updateWeaponParams) {
            ShopSystem._updateWeaponParams(player, weapon.id);
        }
    },

    /**
     * 添加武器槽
     * @param {Object} player
     */
    _applyWeaponSlotUp(player) {
        if (!player) return;
        player.weaponSlots = (player.weaponSlots || 4) + 1;
    },

    /**
     * 添加被动技能
     * @param {string} passiveId
     * @param {Object} player
     *
     * 算法:
     * 1. 调用 PassiveSystem.register(passiveId, 'levelup', player)
     */
    _applyAddPassive(passiveId, player) {
        if (!passiveId || !player) return;

        if (typeof PassiveSystem !== 'undefined') {
            PassiveSystem.register(passiveId, 'levelup', player);
        }
    },

    // -------------------------------------------------------
    // 7.4 查询/重置
    // -------------------------------------------------------

    /** 获取当前可选的卡牌 */
    getCurrentCards() {
        return this.currentCards;
    },

    reset() {
        this.currentCards = [];
        this._generatedIds = new Set();
    },
};

if (typeof module !== 'undefined') {
    module.exports = { LevelUpSystem };
}
