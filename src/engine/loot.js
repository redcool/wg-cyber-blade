// ============================================================
// src/engine/loot.js — 宝箱掉落系统（稀有度+类型+分支选择）
// 依赖: data.js (DataLoader), tags.js (TagSystem), item.js (ItemSystem)
// ============================================================

/**
 * LootSystem — 宝箱掉落系统
 *
 * API:
 *   spawnChest(x, y, type)      生成宝箱（敌人死亡时调用）
 *   pickupChest(chest, player)  拾取宝箱，生成奖励选项
 *   generateRewards(type, p)    生成宝箱奖励选项
 *   selectReward(index, player) 玩家选择奖励
 *   getCurrentRewards()         获取当前可选奖励
 *   hasPendingChests()          是否还有待拾取的宝箱
 *   reset()                     重置状态
 *
 * 设计要点:
 *   - 普通敌人不掉落，精英必掉 elite，Boss 必掉 legendary
 *   - 宝箱打开显示 2~3 个选项（40% 道具 / 40% 武器 / 20% 金币）
 *   - 道具/武器按稀有度权重投掷 + 流派偏向
 *   - 道具奖励调用 ItemSystem.buyItem（免费）
 *   - 武器奖励直接加入武器槽
 *   - 宝箱可排队依次显示
 */

const CHEST_TYPES = {
    normal: {
        name: '普通宝箱',
        color: '#aaaaaa',  // 运行时从 RarityColorSystem 覆盖
        rarityWeights: { common: 70, rare: 25, epic: 5, legendary: 0 },
        itemCount: 2,
        goldRange: [10, 25],
    },
    elite: {
        name: '精英宝箱',
        color: '#aa44ff',  // 运行时从 RarityColorSystem 覆盖
        rarityWeights: { common: 40, rare: 35, epic: 20, legendary: 5 },
        itemCount: 3,
        goldRange: [25, 50],
    },
    legendary: {
        name: '传奇宝箱',
        color: '#ff6600',  // 运行时从 RarityColorSystem 覆盖
        rarityWeights: { common: 10, rare: 20, epic: 30, legendary: 40 },
        itemCount: 3,
        goldRange: [50, 100],
    },
};

/** 宝箱类型 → 稀有度 key 映射（用于 RarityColorSystem 取色） */
const CHEST_RARITY_KEY = {
    normal: 'common',
    elite: 'rare',
    legendary: 'legendary',
};

/**
 * 获取稀有度颜色（优先从 RarityColorSystem，fallback 到硬编码）
 */
function _getRarityColor(rarity) {
    if (typeof RarityColorSystem !== 'undefined' && RarityColorSystem.getColor) {
        const col = RarityColorSystem.getColor(rarity);
        if (col) return col;
    }
    const fallback = {
        common: '#aaaaaa',
        rare: '#4488ff',
        epic: '#aa44ff',
        legendary: '#ff6600',
    };
    return fallback[rarity] || '#aaaaaa';
}

/** 宝箱类型 → 武器初始 quality 映射 */
const CHEST_QUALITY_MAP = {
    normal: 'T1',
    elite: 'T2',
    legendary: 'T3',
};

const LootSystem = {
    // -------------------------------------------------------
    // 状态
    // -------------------------------------------------------

    /** 当前待开启的宝箱队列 */
    pendingChests: [],

    /**
     * 从 RarityColorSystem 同步宝箱颜色
     * 在 init 阶段 DataLoader 加载完成后调用
     */
    _syncRarityColors() {
        if (typeof RarityColorSystem === 'undefined') return;
        for (const [chestType, def] of Object.entries(CHEST_TYPES)) {
            const rarityKey = CHEST_RARITY_KEY[chestType] || 'common';
            const col = RarityColorSystem.getColor(rarityKey);
            if (col) def.color = col;
        }
    },

    /** 当前可选的奖励 */
    currentRewards: [],

    // -------------------------------------------------------
    // 4.1 宝箱生成
    // -------------------------------------------------------

    /**
     * 生成宝箱（敌人死亡时调用）
     * @param {number} x - 掉落 X 坐标
     * @param {number} y - 掉落 Y 坐标
     * @param {string} type - 'normal'|'elite'|'legendary'
     *
     * 算法:
     * 1. 创建宝箱对象 { x, y, type, alive: true }
     * 2. 加入 pendingChests
     */
    spawnChest(x, y, type) {
        const chest = {
            x,
            y,
            type: type || 'normal',
            alive: true,
        };
        this.pendingChests.push(chest);
        return chest;
    },

    /**
     * 玩家拾取宝箱
     * @param {Object} chest - 宝箱对象
     * @param {Object} player
     *
     * 算法:
     * 1. chest.alive = false
     * 2. 调用 generateRewards(chest.type, player)
     * 3. 将生成的奖励存入 currentRewards
     */
    pickupChest(chest, player) {
        if (!chest || !chest.alive) return;
        chest.alive = false;
        this.currentRewards = this.generateRewards(chest.type, player);
    },

    // -------------------------------------------------------
    // 4.2 奖励生成
    // -------------------------------------------------------

    /**
     * 生成宝箱奖励选项
     * @param {string} chestType - 'normal'|'elite'|'legendary'
     * @param {Object} player
     * @returns {Object[]} 奖励选项数组
     *
     * 算法:
     * 1. 获取 chest type 定义
     * 2. 获取流派偏向权重 (biasStrength=0.3)
     * 3. 按 chest.itemCount 生成选项:
     *    a. 随机选择类型: 40% 道具 / 40% 武器 / 20% 金币
     *    b. 道具/武器: rollRarity + biasedSelect
     *    c. 金币: goldRange 随机
     */
    generateRewards(chestType, player) {
        const typeDef = CHEST_TYPES[chestType];
        if (!typeDef) return [];

        // 流派偏向
        let biasWeights = {};
        if (typeof TagSystem !== 'undefined' && player) {
            const weaponCounts = TagSystem.countWeaponTags(player.weapons || []);
            const itemCounts = TagSystem.countItemTags(player.items || []);
            const tagCounts = TagSystem.mergeTagCounts(weaponCounts, itemCounts);
            biasWeights = TagSystem.getBiasWeights(tagCounts, 0.3);
        }

        const rewards = [];
        const count = typeDef.itemCount;
        const baseQuality = CHEST_QUALITY_MAP[chestType] || 'T1';

        for (let i = 0; i < count; i++) {
            const reward = this._generateSingleReward(typeDef, biasWeights, baseQuality);
            if (reward) rewards.push(reward);
        }

        return rewards;
    },

    /**
     * 生成单个奖励选项
     * @param {Object} typeDef - CHEST_TYPES 中的定义
     * @param {Object} biasWeights
     * @returns {Object|null}
     *
     * 算法:
     * 1. 随机决定类型 (40% item / 40% weapon / 20% gold)
     * 2. 按 rarityWeights 投掷稀有度
     * 3. 分发到对应生成方法
     */
    _generateSingleReward(typeDef, biasWeights, baseQuality) {
        const roll = Math.random();

        // 决定奖励类型
        let rewardType;
        if (roll < 0.40) {
            rewardType = 'item';
        } else if (roll < 0.80) {
            rewardType = 'weapon';
        } else {
            rewardType = 'gold';
        }

        // 投掷稀有度
        const rarity = this._rollRarityFromWeights(typeDef.rarityWeights);

        switch (rewardType) {
            case 'item':
                return this._generateItemOption(rarity, biasWeights);
            case 'weapon':
                return this._generateWeaponOption(rarity, biasWeights, baseQuality);
            case 'gold':
                return this._generateGoldOption(typeDef.goldRange);
            default:
                return null;
        }
    },

    /**
     * 从权重表投掷稀有度
     * @param {Object} rarityWeights - { common: N, rare: N, ... }
     * @returns {string}
     */
    _rollRarityFromWeights(rarityWeights) {
        const entries = Object.entries(rarityWeights).filter(([_, w]) => w > 0);
        if (entries.length === 0) return 'common';

        const totalWeight = entries.reduce((s, [_, w]) => s + w, 0);
        let r = Math.random() * totalWeight;
        for (const [key, weight] of entries) {
            r -= weight;
            if (r <= 0) return key;
        }
        return entries[entries.length - 1][0];
    },

    /**
     * 生成单个道具选项
     * @param {string} rarity
     * @param {Object} biasWeights
     * @returns {Object|null}
     *
     * 算法:
     * 1. 从 ItemSystem 获取道具池
     * 2. 按稀有度过滤
     * 3. 流派偏向选择
     */
    _generateItemOption(rarity, biasWeights) {
        const allItems = (typeof ItemSystem !== 'undefined' && ItemSystem.allItems) || [];
        const pool = allItems.filter(item => item.rarity === rarity);

        if (pool.length === 0) return null;

        const selected = typeof ShopSystem !== 'undefined' && ShopSystem.biasedSelect
            ? ShopSystem.biasedSelect(pool, biasWeights)
            : pool[Math.floor(Math.random() * pool.length)];

        if (!selected) return null;

        return {
            type: 'item',
            id: selected.id,
            name: selected.name,
            desc: selected.desc,
            icon: selected.icon || '📦',
            rarity,
            rarityColor: _getRarityColor(rarity),
            tags: typeof TagSystem !== 'undefined' ? TagSystem.getTags(selected) : [],
        };
    },

    /**
     * 生成单个武器选项
     * @param {string} rarity
     * @param {Object} biasWeights
     * @returns {Object|null}
     *
     * 算法:
     * 1. 从武器池中随机选择
     * 2. 流派偏向选择
     */
    _generateWeaponOption(rarity, biasWeights, baseQuality) {
        const cache = (typeof DataLoader !== 'undefined' && DataLoader._cache)
            ? DataLoader._cache.weapons
            : null;
        if (!cache || cache.length === 0) return null;

        const selected = typeof ShopSystem !== 'undefined' && ShopSystem.biasedSelect
            ? ShopSystem.biasedSelect(cache, biasWeights)
            : cache[Math.floor(Math.random() * cache.length)];

        if (!selected) return null;

        // 按宝箱类型预设 quality（normal=T1, elite=T2, legendary=T3）
        const quality = baseQuality || 'T1';

        return {
            type: 'weapon',
            id: selected.id,
            name: selected.name,
            desc: selected.desc,
            icon: selected.icon || '🗡️',
            rarity,
            rarityColor: _getRarityColor(rarity),
            tags: typeof TagSystem !== 'undefined' ? TagSystem.getTags(selected) : [],
            quality,
        };
    },

    /**
     * 生成金币选项
     * @param {number[]} goldRange - [min, max]
     * @returns {Object}
     */
    _generateGoldOption(goldRange) {
        const min = goldRange[0] || 10;
        const max = goldRange[1] || 25;
        const amount = min + Math.floor(Math.random() * (max - min + 1));

        return {
            type: 'gold',
            id: 'gold',
            name: `${amount} 金币`,
            desc: `获得 ${amount} 金币`,
            icon: '💰',
            rarity: 'common',
            rarityColor: '#ffd700',
            goldAmount: amount,
        };
    },

    // -------------------------------------------------------
    // 4.3 玩家选择
    // -------------------------------------------------------

    /**
     * 玩家选择一个奖励
     * @param {number} index - 奖励索引
     * @param {Object} player
     * @returns {Object|null} 应用结果
     *
     * 算法:
     * 1. 获取选中的选项
     * 2. type='item': ItemSystem.buyItem(id, player)（免费）
     * 3. type='weapon': 加入武器槽（同 shop 逻辑）
     * 4. type='gold': player.materials += goldAmount
     * 5. 从 pendingChests 移除该宝箱
     * 6. 清空 currentRewards
     */
    selectReward(index, player) {
        const reward = this.currentRewards[index];
        if (!reward) return null;
        if (!player) return null;

        let result = null;

        switch (reward.type) {
            case 'item': {
                if (typeof ItemSystem !== 'undefined') {
                    // 通过 ItemSystem.buyItem 免费获取（标记 unique + 应用 statMods）
                    ItemSystem.buyItem(reward.id, player);
                }
                // 记录玩家持有（用于流派偏向计算）
                if (!player.items) player.items = [];
                if (!player.items.includes(reward.id)) {
                    player.items.push(reward.id);
                }
                result = { type: 'item', id: reward.id };
                break;
            }

            case 'weapon': {
                if (!player.weapons) player.weapons = [];
                const newWeapon = {
                    id: reward.id,
                    level: 1,
                    quality: reward.quality || 'T1',
                };
                player.weapons.push(newWeapon);

                // 初始化词条并更新参数
                if (typeof ShopSystem !== 'undefined') {
                    if (ShopSystem._initWeaponAffixes) {
                        ShopSystem._initWeaponAffixes(newWeapon);
                    }
                    if (ShopSystem._updateWeaponParams) {
                        ShopSystem._updateWeaponParams(player, reward.id);
                    }
                }
                result = { type: 'weapon', id: reward.id };
                break;
            }

            case 'gold': {
                player.materials = (player.materials || 0) + (reward.goldAmount || 0);
                result = { type: 'gold', amount: reward.goldAmount };
                break;
            }

            default:
                return null;
        }

        // 从 pendingChests 移除已处理的宝箱
        // （找到第一个 alive=false 的 chest）
        const deadIndex = this.pendingChests.findIndex(c => !c.alive);
        if (deadIndex !== -1) {
            this.pendingChests.splice(deadIndex, 1);
        }

        // 清空当前奖励
        this.currentRewards = [];

        return result;
    },

    // -------------------------------------------------------
    // 4.4 查询
    // -------------------------------------------------------

    /** 获取当前可选的奖励 */
    getCurrentRewards() {
        return this.currentRewards;
    },

    /** 是否还有待拾取的宝箱 */
    hasPendingChests() {
        return this.pendingChests.some(c => c.alive);
    },

    // -------------------------------------------------------
    // 4.5 重置
    // -------------------------------------------------------

    reset() {
        this.pendingChests = [];
        this.currentRewards = [];
    },
};

if (typeof module !== 'undefined') {
    module.exports = { LootSystem };
}
