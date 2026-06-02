// ============================================================
// src/engine/levelup.js — 升级抽卡系统（流派偏向 + 数据驱动）
// 依赖: data.js (DataLoader), tags.js (TagSystem), stats.js (StatsSystem)
// ============================================================

/**
 * LevelUpSystem — 升级抽卡系统（CSV 数据驱动 + 等级链）
 *
 * API:
 *   loadCards()                   从 DataLoader 加载 levelUpCards
 *   generateCards(player, wave)   生成 3~5 张升级卡（按玩家进度过滤等级）
 *   applyCard(cardId, player)     应用选中的升级卡
 *   getCurrentCards()             获取当前可选卡牌
 *   reset()                       重置状态
 *
 * 数据驱动: csv/levelUpCards.csv → src/data/levelUpCards.json
 *   每行 = 一张卡的一个等级 (id + level 联合主键)
 *   statAdd/statMult: 管道符分隔的 key:value 对
 *   actionType: weaponLevelUp|weaponQualityUp|addWeaponSlot|addPassive
 *
 * 等级链:
 *   player.cardLevels[id] 记录当前等级
 *   抽卡池只显示 (id, player.cardLevels[id]+1) 的下一级
 *   稀有度随等级提升，高稀有度在后期波次概率递增
 *
 * 概率:
 *   基础权重: common=60, rare=25, epic=10, legendary=5
 *   波次 >=6:  epic ×1.3, legendary ×1.5
 *   波次 >=11: epic ×1.8, legendary ×2.5
 *   波次 >=16: epic ×2.5, legendary ×4
 *   流派偏向: TagSystem.getBiasWeights(biasStrength=0.25)
 */

const RARITY_WEIGHT = {
    common: 60,
    rare: 25,
    epic: 10,
    legendary: 5,
};

/**
 * 根据波次获取调整后的稀有度权重（后期高稀有度提升）
 */
function getScaledRarityWeights(waveLevel) {
    let epicScale = 1, legScale = 1;
    if (waveLevel >= 6)  { epicScale = 1.3; legScale = 1.5; }
    if (waveLevel >= 11) { epicScale = 1.8; legScale = 2.5; }
    if (waveLevel >= 16) { epicScale = 2.5; legScale = 4.0; }
    if (waveLevel >= 21) { epicScale = 3.5; legScale = 5.5; }
    return {
        common: 60,
        rare: 25,
        epic: Math.round(RARITY_WEIGHT.epic * epicScale),
        legendary: Math.round(RARITY_WEIGHT.legendary * legScale),
    };
}

const LevelUpSystem = {
    // -------------------------------------------------------
    // 状态
    // -------------------------------------------------------

    /** 卡牌定义（从 levelUpCards.json 加载，每行 = 一张卡的一个等级） */
    allCards: [],

    /** 当前可选的卡牌 */
    currentCards: [],

    // -------------------------------------------------------
    // 7.1 数据加载
    // -------------------------------------------------------

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
     * @param {Object} player - 玩家对象（需有 cardLevels 字段）
     * @param {number} [waveLevel=1] - 当前波次（用于稀有度缩放）
     * @returns {Object[]} 可选卡牌数组
     *
     * 算法:
     * 1. 确保玩家 cardLevels 初始化
     * 2. 获取流派偏向权重
     * 3. 按波次缩放稀有度权重
     * 4. 从 allCards 中筛选可用的下一级卡:
     *    pool = { card | card.level === (player.cardLevels[card.id] || 0) + 1 }
     * 5. 加权选择 3~5 张:
     *    a. 通用卡 (tags=[]): 基础权重 = 稀有度权重[rarity]
     *    b. 流派卡 (tags 非空): 基础权重 × 流派偏向权重均值
     * 6. 清除 currentCards，填入新选项
     */
    generateCards(player, waveLevel) {
        // 初始化等级的player状态
        if (player && !player.cardLevels) player.cardLevels = {};

        const biasStrength = 0.25;
        let biasWeights = {};

        if (typeof TagSystem !== 'undefined' && player) {
            const weaponCounts = TagSystem.countWeaponTags(player.weapons || []);
            const itemCounts = TagSystem.countItemTags(player.items || []);
            const tagCounts = TagSystem.mergeTagCounts(weaponCounts, itemCounts);
            biasWeights = TagSystem.getBiasWeights(tagCounts, biasStrength);
        }

        // 根据波次缩放稀有度权重
        const rarityWeights = getScaledRarityWeights(waveLevel || 1);

        // 构建可用池：只显示玩家下一个未获得的等级
        const pool = this.allCards.filter(c => {
            const currentLv = player.cardLevels[c.id] || 0;
            return c.level === currentLv + 1;
        });

        // 加权选择 3~5 张
        const cardCount = Math.min(pool.length, 3 + Math.floor(Math.random() * 3));
        this.currentCards = [];

        const used = new Set();
        for (let i = 0; i < cardCount && pool.length > 0; i++) {
            const selected = this._selectCard(pool, biasWeights, rarityWeights);
            if (!selected) break;

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
     * @param {Object} rarityWeights - 波次缩放后的稀有度权重
     * @returns {Object|null}
     *
     * 算法:
     * 1. 对每张卡计算 finalWeight:
     *    - 通用卡 (tags=[]): baseWeight = rarityWeights[rarity]
     *    - 流派卡 (tags 非空):
     *      avgBias = tags 对应 biasWeights 的平均值
     *      baseWeight = rarityWeights[rarity] × avgBias
     * 2. 加权随机选择
     */
    _selectCard(pool, biasWeights, rarityWeights) {
        if (!pool || pool.length === 0) return null;

        const rw = rarityWeights || RARITY_WEIGHT;
        const weightedPool = pool.map(card => {
            const baseWeight = rw[card.rarity] || 50;
            const tags = card.tags || [];

            let weight = baseWeight;

            if (tags.length > 0 && biasWeights) {
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
     * @param {string} cardId - 卡牌 ID
     * @param {Object} player - 玩家对象
     * @returns {boolean} 是否成功
     *
     * 算法:
     * 1. 根据 player.cardLevels 查找下一级卡定义
     * 2. 解析 statAdd/statMult → 临时 statMods 并应用
     * 3. 有 actionType → 分发:
     *    a. 'weaponLevelUp' → _applyWeaponLevelUp
     *    b. 'weaponQualityUp' → _applyWeaponQualityUp
     *    c. 'addWeaponSlot' → player.weaponSlots++
     *    d. 'addPassive' → _applyAddPassive(actionValue)
     * 4. player.cardLevels[cardId]++ (升级)
     * 5. StatsSystem.clampPlayer(player)
     */
    applyCard(cardId, player) {
        if (!player) return false;
        const currentLv = player.cardLevels[cardId] || 0;
        const nextLv = currentLv + 1;

        // 查找下一级的卡定义
        const card = (this.allCards || []).find(c => c.id === cardId && c.level === nextLv);
        if (!card) return false;

        // 解析并应用 statAdd / statMult
        this._applyStringStatMods(card, player);

        // 应用 action
        if (card.actionType) {
            switch (card.actionType) {
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
                    this._applyAddPassive(card.actionValue, player);
                    break;
                default:
                    break;
            }
        }

        // 升级等级
        player.cardLevels[cardId] = nextLv;

        // 限制属性
        if (typeof StatsSystem !== 'undefined' && StatsSystem.clampPlayer) {
            StatsSystem.clampPlayer(player);
        }

        return true;
    },

    /**
     * 解析 card.statAdd/statMult 并应用到玩家
     * statAdd: "armor:3|dodge:0.03" → player.armor += 3, player.dodge += 0.03
     * statMult: "maxHp:0.20" → player.maxHp *= 1.20
     */
    _applyStringStatMods(card, player) {
        if (!card || !player) return;

        const parseAndApply = (str, isMult) => {
            if (!str) return;
            for (const pair of str.split('|')) {
                const parts = pair.split(':');
                if (parts.length !== 2) continue;
                const stat = parts[0].trim();
                const value = parseFloat(parts[1].trim());
                if (isNaN(value)) continue;
                const current = player[stat] !== undefined ? player[stat] : 0;
                if (isMult) {
                    player[stat] = current * (1 + value);
                } else {
                    player[stat] = current + value;
                }
            }
        };

        parseAndApply(card.statAdd, false);
        parseAndApply(card.statMult, true);
    },

    /** @deprecated 已由 _applyStringStatMods 替代 */
    _applyStatMods(statMods, player) {
        // 保留兼容空桩
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
    },
};

if (typeof module !== 'undefined') {
    module.exports = { LevelUpSystem };
}
