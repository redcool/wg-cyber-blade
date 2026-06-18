// ============================================================
// src/engine/levelup.js — 升级抽卡系统 v2（Brotato 风格）
// 4张固定选择、无限堆叠、Tier解锁、可重掷
// 依赖: data.js (DataLoader), tags.js (TagSystem), stats.js (StatsSystem)
// ============================================================

/**
 * LevelUpSystem v2 — Brotato 风格升级抽卡
 *
 * API:
 *   loadCards()                       从 DataLoader 加载 levelUpCards
 *   generateCards(player, playerLv)   生成 4 张升级卡（按等级+Tier过滤）
 *   applyCard(cardId, player)         应用选中的升级卡
 *   rerollCards(player, playerLv)     重掷（消耗材料）
 *   getCurrentCards()                 获取当前可选卡牌
 *   getRerollCost()                   获取当前重掷消耗
 *   reset()                           重置
 *
 * 核心规则:
 *   1. 每次升级固定出 4 张卡
 *   2. 卡牌可反复出现（不消耗），无限堆叠同一属性
 *   3. Tier I/II/III/IV 根据角色等级解锁（Lv1/5/10/20）
 *   4. Tier 权重随等级上升（高等级高Tier概率更高）
 *   5. 流派标签过滤（硬过滤：没对应武器不出该类卡）
 *   6. 可重掷：消耗材料，每次升级限 1 次免费 + 收费重掷
 */

// ============================================================
// Tier 保底/权重 规则（Brotato 官方机制）
//
// 保底等级（该级 4 张卡 100% 为该 Tier）:
//   Lv 1:   100% Tier I
//   Lv 5:   100% Tier II
//   Lv 10/15/20: 100% Tier III
//   Lv 25+ 每 5 级（25,30,35...）: 100% Tier IV
//
// 非保底等级：在已解锁 Tier 内按权重随机
// ============================================================
const TIER_LEVELS = ['I', 'II', 'III', 'IV'];

/** 懒加载 Tier 解锁等级（避免模块加载时 SystemConfig 未就绪） */
function getTierUnlock() {
    return {
        I: SystemConfig.get('levelUpTierIUnlock'),
        II: SystemConfig.get('levelUpTierIIUnlock'),
        III: SystemConfig.get('levelUpTierIIIUnlock'),
        IV: SystemConfig.get('levelUpTierIVUnlock'),
    };
}

/** 懒加载 Tier 基础权重 */
function getTierWeights() {
    return {
        I: SystemConfig.get('levelUpTierIWeight'),
        II: SystemConfig.get('levelUpTierIIWeight'),
        III: SystemConfig.get('levelUpTierIIIWeight'),
        IV: SystemConfig.get('levelUpTierIVWeight'),
    };
}

/** 判断当前等级是否有保底 Tier，有则返回该 Tier 名，否则返回 null */
function getGuaranteedTier(playerLevel) {
    const interval = SystemConfig.get('levelUpGuaranteedThreshold');
    if (playerLevel === 1) return 'I';
    if (playerLevel === SystemConfig.get('levelUpTierIIUnlock')) return 'II';
    if (playerLevel % interval === 0 && playerLevel >= SystemConfig.get('levelUpTierIIIUnlock') && playerLevel <= SystemConfig.get('levelUpTierIVUnlock') - interval) return 'III';
    if (playerLevel % interval === 0 && playerLevel >= SystemConfig.get('levelUpTierIVUnlock')) return 'IV';
    return null;
}

/** 获取当前等级下各 Tier 的权重（非保底等级时使用） */
function getTierWeightsByLevel(playerLevel) {
    const tierUnlock = getTierUnlock();
    const unlocked = TIER_LEVELS.filter(t => playerLevel >= tierUnlock[t]);
    if (unlocked.length === 0) return { I: 100 };

    const tierWeights = getTierWeights();
    const weights = {};
    for (const t of unlocked) {
        let w = tierWeights[t] || 10;
        if (t === 'III') w *= Math.min(SystemConfig.get('levelUpTierIIIscaleMax'), 1 + (playerLevel - SystemConfig.get('levelUpTierIIIscaleStart')) * SystemConfig.get('levelUpTierIIIscaleMult'));
        if (t === 'IV') w *= Math.min(SystemConfig.get('levelUpTierIVscaleMax'), 1 + (playerLevel - SystemConfig.get('levelUpTierIVscaleStart')) * SystemConfig.get('levelUpTierIVscaleMult'));
        weights[t] = Math.round(w);
    }

    const total = Object.values(weights).reduce((s, v) => s + v, 0);
    for (const t of unlocked) {
        weights[t] = weights[t] / total;
    }
    return weights;
}

const LevelUpSystem = {
    // -------------------------------------------------------
    // 状态
    // -------------------------------------------------------

    /** 所有卡牌定义（从 levelUpCards.json 加载） */
    allCards: [],

    /** 当前可选的 4 张卡 */
    currentCards: [],

    /** 当前升级的重掷次数（0=免费, 1+=收费） */
    _rerollCount: 0,

    /** 已生成的卡牌 ID 集合（跨 generateCards 调用去重） */
    _generatedIds: new Set(),

    /** 卡牌 tag 名称到玩家武器 tag 的映射 */
    TAG_MAP: {
        melee: 'melee',
        ranged: 'ranged',
        fire: 'fire',
        explosive: 'explosive',
        tech: 'tech',
        crit: 'crit',
        economy: 'economy',
    },

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
    // 7.2 卡牌生成（Brotato 4卡制）
    // -------------------------------------------------------

    /**
     * 生成 4 张升级卡
     * @param {Object} player - 玩家对象
     * @param {number} playerLevel - 当前角色等级
     * @returns {Object[]} 4 张可选卡牌
     *
     * 算法:
     * 1. 获取玩家流派标签（武器+物品的 tag 统计）
     * 2. 筛选可用卡池：
     *    a. card.unlockLevel ≤ playerLevel（Tier 解锁）
     *    b. 有 tags 的卡，必须有对应流派标签才出现（硬过滤）
     * 3. 按 Tier 权重加权选 4 张
     * 4. 重置重掷计数
     */
    generateCards(player, playerLevel) {
        this.currentCards = [];
        this._rerollCount = 0;

        // 获取玩家流派标签
        let playerTags = new Set();
        if (typeof TagSystem !== 'undefined' && player) {
            const weaponTags = TagSystem.countWeaponTags(player.weapons || []);
            const itemTags = TagSystem.countItemTags(player.items || []);
            for (const [tag, count] of Object.entries(weaponTags)) {
                if (count > 0) playerTags.add(tag);
            }
            for (const [tag, count] of Object.entries(itemTags)) {
                if (count > 0) playerTags.add(tag);
            }
        }

        // 构建可用池
        const pool = this.allCards.filter(c => {
            // Tier 解锁检查
            if (c.unlockLevel && c.unlockLevel > playerLevel) return false;
            // 已在上次 generateCards 出现过的卡不再出现（同一次升级内去重）
            if (this._generatedIds.has(c.id)) return false;
            // 标签过滤（硬过滤）
            if (c.tags && c.tags.length > 0) {
                // 只要有一个匹配标签就算通过
                const hasTag = c.tags.some(t => playerTags.has(t) || playerTags.has(this.TAG_MAP[t]));
                if (!hasTag) return false;
            }
            return true;
        });

        if (pool.length === 0) return [];

        // 检查是否有保底 Tier
        const guaranteedTier = getGuaranteedTier(playerLevel);

        if (guaranteedTier) {
            // 保底等级：只出该 Tier 的卡
            const tierPool = pool.filter(c => c.tier === guaranteedTier);
            if (tierPool.length === 0) return [];

            // 简单随机选 4 张
            const shuffled = [...tierPool].sort(() => Math.random() - 0.5);
            this.currentCards = shuffled.slice(0, Math.min(SystemConfig.get('levelUpDefaultCardCount'), shuffled.length));
        } else {
            // 非保底等级：按 Tier 权重加权选择
            const tierWeights = getTierWeightsByLevel(playerLevel);

            // 选 4 张（不重复）
            const used = new Set();
            const count = Math.min(SystemConfig.get('levelUpDefaultCardCount'), pool.length);
            for (let i = 0; i < count; i++) {
                const selected = this._weightedSelect(pool, tierWeights, used);
                if (!selected) break;
                used.add(selected.id);
                this.currentCards.push(selected);
            }
        }

        // 记录已生成的 ID（跨调用去重）
        this._generatedIds = new Set(this.currentCards.map(c => c.id));

        return this.currentCards;
    },

    /**
     * 加权选择一张卡
     * @param {Object[]} pool
     * @param {Object} tierWeights - Tier 权重映射 {I: 0.5, II: 0.3, III: 0.15, IV: 0.05}
     * @param {Set} used - 已选的 id 集合
     * @returns {Object|null}
     *
     * 算法:
     * 1. 按 Tier 分组
     * 2. 每张卡基础权重 = tierWeights[tier] / 该 tier 的卡数
     * 3. 加权随机
     */
    _weightedSelect(pool, tierWeights, used) {
        // 按 Tier 分组计数
        const tierCounts = {};
        const tierCards = {};
        for (const c of pool) {
            if (used.has(c.id)) continue;
            const t = c.tier || 'I';
            if (!tierCounts[t]) { tierCounts[t] = 0; tierCards[t] = []; }
            tierCounts[t]++;
            tierCards[t].push(c);
        }

        if (Object.keys(tierCounts).length === 0) return null;

        // 计算每张卡的权重
        const weighted = [];
        for (const [tier, cards] of Object.entries(tierCards)) {
            const tierWeight = tierWeights[tier] || 0;
            const perCardWeight = tierWeight / cards.length;
            for (const card of cards) {
                weighted.push({ card, weight: Math.max(0.01, perCardWeight) });
            }
        }

        if (weighted.length === 0) return null;

        const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
        let r = Math.random() * totalWeight;
        for (const entry of weighted) {
            r -= entry.weight;
            if (r <= 0) return entry.card;
        }
        return weighted[weighted.length - 1].card;
    },

    // -------------------------------------------------------
    // 7.3 应用卡牌
    // -------------------------------------------------------

    /**
     * 应用选中的升级卡
     * @param {string} cardId - 卡牌 ID
     * @param {Object} player - 玩家对象
     * @returns {boolean}
     *
     * 算法:
     * 1. 查找卡牌定义
     * 2. 有 statField/statValue → player[statField] += statValue
     * 3. 有 actionType → 分发特殊动作
     * 4. StatsSystem.clampPlayer
     */
    /**
     * 应用 statMods 格式的卡牌属性修改
     * @param {Object} statMods - { statId: { type: 'add'|'mult', value: number }, ... }
     * @param {Object} player
     */
    _applyStatMods(statMods, player) {
        if (!statMods || !player) return;
        for (const [key, mod] of Object.entries(statMods)) {
            const current = player[key] !== undefined ? player[key] : 0;
            if (mod.type === 'mult') {
                player[key] = current * (1 + mod.value);
            } else {
                // add 模式（默认）
                player[key] = current + mod.value;
            }
        }
    },

    applyCard(cardId, player) {
        if (!player) return false;
        const card = (this.allCards || []).find(c => c.id === cardId);
        if (!card) return false;

        // 应用 statField + statValue（CSV/JSON 数据格式）
        if (card.statField && card.statValue) {
            const current = player[card.statField] !== undefined ? player[card.statField] : 0;
            player[card.statField] = current + card.statValue;
        }

        // 应用 statMods（旧格式兼容）
        if (card.statMods) {
            this._applyStatMods(card.statMods, player);
        }

        // 应用 action（支持 actionType 和 action.type 两种格式）
        const actionType = card.actionType || (card.action && card.action.type);
        if (actionType) {
            switch (actionType) {
                case 'weaponLevelUp':
                    this._applyWeaponLevelUp(player);
                    break;
                case 'weaponQualityUp':
                    this._applyWeaponQualityUp(player);
                    break;
                case 'addPassive': {
                    const passiveId = card.action ? card.action.passiveId : null;
                    if (passiveId && typeof PassiveSystem !== 'undefined' && PassiveSystem.register) {
                        PassiveSystem.register(passiveId, 'levelup', player);
                    }
                    break;
                }
                default:
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
     * 重掷升级卡
     * @param {Object} player - 玩家对象
     * @param {number} playerLevel - 当前角色等级
     * @returns {Object[]} 新卡列表（失败返回 []）
     *
     * 算法:
     * 1. 首次重掷免费，后续每次消耗递增材料
     *    cost = 5 + _rerollCount * 10（第1次5, 第2次15, 第3次25...）
     * 2. 检查玩家材料是否充足
     * 3. 扣除材料，重新生成
     */
    rerollCards(player, playerLevel) {
        if (!player) return [];

        const cost = this.getRerollCost();
        if (cost > 0 && (player.materials || 0) < cost) return [];

        // 扣除材料
        if (cost > 0) {
            player.materials -= cost;
        }

        this._rerollCount++;

        // 重新生成（排除当前已选的卡避免完全重复）
        return this.generateCards(player, playerLevel);
    },

    /** 获取当前重掷消耗（土豆兄弟公式：按波次动态定价）
     *  cost = floor(wave * 0.75) + rerollCount * increase
     *  increase = max(1, floor(wave * 0.40))
     *  计数器在每次 generateCards 时重置（每级独立）
     *  升级重掷与商店重掷计数器互不影响
     *  （参考: brotato.wiki.spellsandguns.com/Shop#Rerolling） */
    getRerollCost() {
        // 获取当前波次
        let wave = 1;
        if (typeof WaveSystem !== 'undefined' && WaveSystem.currentLevel !== undefined) {
            wave = Math.max(1, WaveSystem.currentLevel || 1);
        }

        const base = Math.floor(wave * SystemConfig.get('levelUpRerollWaveMult'));
        const increase = Math.max(1, Math.floor(wave * SystemConfig.get('levelUpRerollIncMult')));
        // _rerollCount: 0 = 第一次重掷, 1 = 第二次...
        const cost = base + increase * (this._rerollCount + 1);
        return Math.min(cost, SystemConfig.get('levelUpRerollMaxCost')); // 上限防止溢出
    },

    // -------------------------------------------------------
    // 7.4 特殊动作
    // -------------------------------------------------------

    _applyWeaponLevelUp(player) {
        if (!player || !player.weapons || player.weapons.length === 0) return;
        const idx = Math.floor(Math.random() * player.weapons.length);
        const weapon = player.weapons[idx];
        weapon.level = (weapon.level || 1) + 1;
        if (typeof ShopSystem !== 'undefined' && ShopSystem._updateWeaponParams) {
            ShopSystem._updateWeaponParams(player, weapon.id);
        }
    },

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
        if (typeof ShopSystem !== 'undefined' && ShopSystem._updateWeaponParams) {
            ShopSystem._updateWeaponParams(player, weapon.id);
        }
    },

    // -------------------------------------------------------
    // 7.5 查询/重置
    // -------------------------------------------------------

    getCurrentCards() {
        return this.currentCards;
    },

    reset() {
        this.currentCards = [];
        this._rerollCount = 0;
        if (this._generatedIds) {
            this._generatedIds.clear();
        }
    },
};

if (typeof module !== 'undefined') {
    module.exports = { LevelUpSystem };
}
