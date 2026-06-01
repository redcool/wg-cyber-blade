// ============================================================
// src/engine/shop.js — 商店系统 v2（稀有度+保底+流派偏向）
// 依赖: data.js (DataLoader), tags.js (TagSystem), item.js (ItemSystem)
// ============================================================

/**
 * ShopSystem — 黑市商店系统
 *
 * API:
 *   loadData()                   从 DataLoader 加载武器+道具数据
 *   rollRarity(currentWave)      投掷稀有度 (common/rare/epic/legendary)
 *   applyPity(rolledRarity, pt)  保底机制
 *   biasedSelect(pool, weights)  流派偏向加权选择
 *   generateItems(player, wave)  生成一轮商店商品
 *   reroll(player, wave)         刷新商店（扣金币）
 *   buyItem(index, player)       购买商品
 *   getWeaponDef(weaponId)       获取武器定义
 *   rollQuality(currentWave)     投掷武器品质 T1~T4（保留旧逻辑）
 *   mergeWeapons(tgt, src, p)    武器合并
 *   sellWeapon(slotIdx)          出售武器
 *   reset()                      重置状态
 *
 * 设计要点:
 *   - 稀有度系统: common/rare/epic/legendary 统一武器+道具
 *   - 保底: 每3次必rare, 每10次必epic, 每20次必legendary
 *   - 流派偏向: TagSystem.getBiasWeights 加权
 *   - 武器内部品质 T1~T4 保留 (qualityDefs) 用于 damageMult 计算
 *   - 词条系统 (affixDefs) 保留旧逻辑
 *   - 购买道具委托给 ItemSystem.buyItem()
 */

const ShopSystem = {
    // -------------------------------------------------------
    // 商品状态
    // -------------------------------------------------------

    /** 武器数据池（从 DataLoader 加载） */
    allWeapons: [],

    /** 道具数据池（从 DataLoader 加载） */
    allItems: [],

    /** 当前商品列表 */
    items: [],

    /** 锁定商品列表（刷新时保留） */
    lockedItems: [],

    /** 刷新成本（固定 2 金币） */
    refreshCost: 2,

    /** 上次购买错误信息 */
    _lastBuyError: '',

    /** 保底计数器 */
    _pity: {
        weapons: { totalRolls: 0, sinceLastRare: 0, sinceLastEpic: 0, sinceLastLegendary: 0 },
        items:   { totalRolls: 0, sinceLastRare: 0, sinceLastEpic: 0, sinceLastLegendary: 0 },
    },

    /** 已购买的 unique 道具 ID */
    _boughtUniqueItems: [],

    // -------------------------------------------------------
    // 稀有度系统（统一武器+道具）
    // -------------------------------------------------------

    /**
     * 稀有度定义
     *
     * 算法:
     * - rollWeight 越高出现概率越大
     * - minWave 限制波次门槛
     * - costMult 影响商品价格
     */
    RARITY: {
        common:    { name: '普通', color: '#aaaaaa', weight: 60, minWave: 1,  costMult: 1.0 },
        rare:      { name: '稀有', color: '#4488ff', weight: 25, minWave: 3,  costMult: 1.5 },
        epic:      { name: '史诗', color: '#aa44ff', weight: 10, minWave: 6,  costMult: 2.5 },
        legendary: { name: '传说', color: '#ff6600', weight: 5,  minWave: 10, costMult: 4.0 },
    },

    /**
     * 投掷稀有度
     * @param {number} currentWave - 当前波次
     * @returns {string} - 'common'|'rare'|'epic'|'legendary'
     *
     * 算法:
     * 1. 筛选 minWave ≤ currentWave 的稀有度
     * 2. 按 weight 加权随机
     * 3. 返回结果
     */
    rollRarity(currentWave) {
        const pool = Object.entries(this.RARITY)
            .filter(([_, r]) => currentWave >= r.minWave);
        if (pool.length === 0) return 'common';

        const totalWeight = pool.reduce((sum, [_, r]) => sum + r.weight, 0);
        let r = Math.random() * totalWeight;
        for (const [key, def] of pool) {
            r -= def.weight;
            if (r <= 0) return key;
        }
        return pool[pool.length - 1][0];
    },

    // -------------------------------------------------------
    // 保底机制
    // -------------------------------------------------------

    /**
     * 检查保底并可能升级稀有度
     * @param {string} rolledRarity - 投掷出的稀有度
     * @param {Object} pityTracker - 保底计数器
     * @returns {{ rarity: string, wasPity: boolean }} 最终稀有度 + 是否保底
     *
     * 算法:
     * 1. 按优先级检查保底阈值:
     *    - sinceLastLegendary >= 20 → 强制 legendary
     *    - sinceLastEpic >= 10      → 至少 epic
     *    - sinceLastRare >= 3       → 至少 rare
     * 2. 更新计数器: 获得稀有以上重置对应计数器
     */
    applyPity(rolledRarity, pityTracker) {
        let finalRarity = rolledRarity;

        // 从高到低检查保底
        if (pityTracker.sinceLastLegendary >= 20) {
            finalRarity = 'legendary';
        } else if (pityTracker.sinceLastEpic >= 10) {
            if (rolledRarity !== 'legendary') {
                finalRarity = 'epic';
            }
        } else if (pityTracker.sinceLastRare >= 3) {
            if (rolledRarity === 'common') {
                finalRarity = 'rare';
            }
        }

        // 更新计数器
        pityTracker.totalRolls = (pityTracker.totalRolls || 0) + 1;
        pityTracker.sinceLastRare = (pityTracker.sinceLastRare || 0) + 1;
        pityTracker.sinceLastEpic = (pityTracker.sinceLastEpic || 0) + 1;
        pityTracker.sinceLastLegendary = (pityTracker.sinceLastLegendary || 0) + 1;

        if (finalRarity === 'rare' || finalRarity === 'epic' || finalRarity === 'legendary') {
            pityTracker.sinceLastRare = 0;
        }
        if (finalRarity === 'epic' || finalRarity === 'legendary') {
            pityTracker.sinceLastEpic = 0;
        }
        if (finalRarity === 'legendary') {
            pityTracker.sinceLastLegendary = 0;
        }

        return { rarity: finalRarity, wasPity: finalRarity !== rolledRarity };
    },

    // -------------------------------------------------------
    // 流派偏向
    // -------------------------------------------------------

    /**
     * 流派偏向加权选择
     * @param {Object[]} pool - 可选物品数组
     * @param {Object} biasWeights - TagSystem.getBiasWeights() 的结果
     * @returns {Object|null} 选中的物品，池空返回 null
     *
     * 算法:
     * 1. 为 pool 中每个物品计算 finalWeight:
     *    - 获取物品标签 (TagSystem.getTags)
     *    - 有标签: finalWeight = 1.0 + sum((biasWeight[tag] - 1.0) / tags.length)
     *    - 无标签: finalWeight = 1.0
     * 2. 按 finalWeight 加权随机选择
     * 3. 返回选中的物品
     */
    biasedSelect(pool, biasWeights) {
        if (!pool || pool.length === 0) return null;

        const weightedPool = pool.map(item => {
            const tags = typeof TagSystem !== 'undefined'
                ? TagSystem.getTags(item)
                : [];
            let weight = 1.0;

            if (tags.length > 0 && biasWeights) {
                for (const tag of tags) {
                    if (biasWeights[tag] !== undefined) {
                        weight += (biasWeights[tag] - 1.0) / tags.length;
                    }
                }
            }

            return { item, weight: Math.max(0.01, weight) };
        });

        const totalWeight = weightedPool.reduce((sum, w) => sum + w.weight, 0);
        let r = Math.random() * totalWeight;
        for (const entry of weightedPool) {
            r -= entry.weight;
            if (r <= 0) return entry.item;
        }
        return weightedPool[weightedPool.length - 1].item;
    },

    // -------------------------------------------------------
    // 数据加载
    // -------------------------------------------------------

    /**
     * 加载武器和道具数据
     *
     * 算法:
     * 1. await Promise.all([DataLoader.load('weapons'), DataLoader.load('items')])
     * 2. 数据存入 DataLoader._cache 即可，无需额外存储
     */
    async loadData() {
        if (typeof DataLoader !== 'undefined' && DataLoader.load) {
            await Promise.all([
                DataLoader.load('weapons'),
                DataLoader.load('items'),
            ]);
            // 从 DataLoader 缓存读取数据
            this.allWeapons = (DataLoader._cache && DataLoader._cache.weapons) || [];
            this.allItems = (DataLoader._cache && DataLoader._cache.items) || [];
        }
    },

    // -------------------------------------------------------
    // 商品生成
    // -------------------------------------------------------

    /**
     * 生成一轮商店商品
     * @param {Object} player - 玩家对象（含 weapons/items）
     * @param {number} currentWave - 当前波次
     *
     * 算法:
     * 1. 获取玩家 Build 标签计数 + 偏向权重
     * 2. 清空商品列表
     * 3. 从武器池生成 3~5 件武器:
     *    a. biasedSelect 加权选取 → 排除重复
     *    b. rollRarity 投掷稀有度
     *    c. applyPity 检查保底
     *    d. rollQuality 投掷内部品质 (T1-T4)
     * 4. 从道具池生成 3~5 件道具:
     *    a. 已购 unique 排除
     *    b. biasedSelect 加权选取
     *    c. 稀有度和保底同理
     */
    generateItems(player, currentWave, availableSlots) {
        // 1. 流派偏向权重
        const weaponCounts = typeof TagSystem !== 'undefined'
            ? TagSystem.countWeaponTags(player && player.weapons || [])
            : {};
        const itemCounts = typeof TagSystem !== 'undefined'
            ? TagSystem.countItemTags(player && player.items || [])
            : {};
        const tagCounts = typeof TagSystem !== 'undefined'
            ? TagSystem.mergeTagCounts(weaponCounts, itemCounts)
            : {};
        const biasWeights = typeof TagSystem !== 'undefined'
            ? TagSystem.getBiasWeights(tagCounts)
            : {};

        // 2. 清空
        this.items = [];

        // 3. 限位：最多生成 availableSlots 个新商品（默认 4）
        const maxSlots = (availableSlots !== undefined) ? availableSlots : 4;
        if (maxSlots <= 0) return;

        // 4. 武器池
        const weaponPool = (typeof DataLoader !== 'undefined' && DataLoader._cache && DataLoader._cache.weapons)
            ? [...DataLoader._cache.weapons]
            : [];

        const weaponCount = Math.min(Math.min(2 + Math.floor(Math.random() * 2), 3), maxSlots); // 2~3，不超过上限
        for (let i = 0; i < weaponCount && weaponPool.length > 0; i++) {
            const selected = this.biasedSelect(weaponPool, biasWeights);
            if (!selected) continue;

            // 去重
            const selIdx = weaponPool.indexOf(selected);
            if (selIdx !== -1) weaponPool.splice(selIdx, 1);

            // 稀有度 + 保底
            const baseRarity = this.rollRarity(currentWave || 1);
            const { rarity, wasPity } = this.applyPity(baseRarity, this._pity.weapons);
            const rDef = this.RARITY[rarity];

            // 内部品质 (T1-T4)
            const quality = this.rollQuality(currentWave || 1);
            const qDef = this.qualityDefs[quality];

            // 价格 = 基础成本 × 稀有度系数
            const baseCost = selected.cost || 10;
            const cost = Math.max(1, Math.round(baseCost * rDef.costMult));

            this.items.push({
                ...selected,
                type: 'weapon',
                rarity,
                rarityColor: rDef.color,
                quality,
                level: 1,
                cost,
                isPity: wasPity,
                tags: typeof TagSystem !== 'undefined' ? TagSystem.getTags(selected) : [],
            });
        }

        // 4. 道具池（排除已购 unique）
        const allItems = (typeof ItemSystem !== 'undefined' && ItemSystem.allItems)
            ? ItemSystem.allItems
            : [];

        const itemPool = allItems.filter(item => {
            if (item.unique && this._boughtUniqueItems.includes(item.id)) return false;
            return true;
        });

        const itemCount = Math.min(1, maxSlots - this.items.length); // 不超过上限
        for (let i = 0; i < itemCount && itemPool.length > 0; i++) {
            const selected = this.biasedSelect(itemPool, biasWeights);
            if (!selected) continue;

            const selIdx = itemPool.indexOf(selected);
            if (selIdx !== -1) itemPool.splice(selIdx, 1);

            const baseRarity = this.rollRarity(currentWave || 1);
            const { rarity, wasPity } = this.applyPity(baseRarity, this._pity.items);
            const rDef = this.RARITY[rarity];

            const baseCost = selected.cost || 5;
            const cost = Math.max(1, Math.round(baseCost * rDef.costMult));

            this.items.push({
                id: selected.id,
                type: 'item',
                name: selected.name,
                desc: selected.desc,
                icon: selected.icon,
                cost,
                rarity,
                rarityColor: rDef.color,
                tags: typeof TagSystem !== 'undefined' ? TagSystem.getTags(selected) : [],
                isPity: wasPity,
                unique: !!selected.unique,
                owned: !!(selected.unique && typeof ItemSystem !== 'undefined' && ItemSystem.hasItem(selected.id)),
            });
        }
    },

    /**
     * 刷新商店（扣金币，重新生成）
     * @param {Object} player
     * @param {number} currentWave
     * @returns {boolean} 是否成功
     */
    reroll(player, currentWave) {
        if (!player) return false;
        if ((player.materials || 0) < this.refreshCost) return false;

        player.materials -= this.refreshCost;
        this.generateItems(player, currentWave || 1);
        return true;
    },

    /**
     * 刷新商店（UI 入口，无参数版本）
     * @returns {boolean}
     */
    refresh() {
        const player = typeof PlayerSystem !== 'undefined' ? PlayerSystem.player : null;
        if (!player) return false;

        const isFree = this.refreshCost === 0;
        if (!isFree) {
            if (player.materials < this.refreshCost) return false;
            player.materials -= this.refreshCost;
            this.refreshCost += 1;
        }

        // 保留锁定商品（生成新商品后重新加入）
        const lockedItems = this.items.filter(it => it.locked);
        // 只生成 4 - 锁定数 个新商品，确保总数不超过 4
        this.generateItems(player, (typeof WaveSystem !== 'undefined' ? WaveSystem.currentLevel : 1) || 1, 4 - lockedItems.length);
        // 将锁定商品追加到新商品列表
        for (const li of lockedItems) {
            if (!this.items.some(it => it.id === li.id && it.type === li.type)) {
                this.items.push({ ...li, locked: true });
            }
        }

        // 免费刷新后恢复默认费用
        if (isFree) {
            this.refreshCost = 2;
        }

        return true;
    },

    /**
     * 切换商品锁定状态（刷新时保留）
     * @param {number} itemIndex
     */
    toggleLock(itemIndex) {
        const item = this.items[itemIndex];
        if (!item) return;
        item.locked = !item.locked;
        if (item.locked) {
            if (!this.lockedItems.some(li => li.id === item.id && li.type === item.type)) {
                this.lockedItems.push({ ...item });
            }
        } else {
            this.lockedItems = this.lockedItems.filter(li => !(li.id === item.id && li.type === item.type));
        }
    },

    // -------------------------------------------------------
    // 购买
    // -------------------------------------------------------

    /**
     * 购买商品
     * @param {number} index - 商品索引
     * @param {Object} player - 玩家对象
     * @returns {Object|null} - 购买结果 { item, cost } 或 null（失败）
     *
     * 算法:
     * 1. 检查材料和商品是否存在
     * 2. type === 'weapon':
     *    a. 检查已有同 ID 武器 → 合并 (level +1, affix 升级)
     *    b. 否则检查槽位 → 添加新武器
     *    c. 更新 weaponParams
     * 3. type === 'item':
     *    a. 调用 ItemSystem.buyItem(itemId, player)
     *    b. 如果 unique → 加入 _boughtUniqueItems
     * 4. 扣费
     * 5. 从商品列表移除
     * 6. 返回购买结果
     */
    buyItem(index, player) {
        const shopItem = this.items[index];
        if (!shopItem) { this._lastBuyError = '商品不存在'; return null; }
        if (!player) { this._lastBuyError = '玩家不存在'; return null; }

        // 检查材料
        if ((player.materials || 0) < shopItem.cost) {
            this._lastBuyError = `🪙 金币不足，需要 ${shopItem.cost}`;
            return null;
        }

        // 检查 unique 重复购买
        if (shopItem.type === 'item' && shopItem.unique &&
            this._boughtUniqueItems.includes(shopItem.id)) {
            this._lastBuyError = '该独特道具已购买';
            return null;
        }

        let result = null;

        if (shopItem.type === 'weapon') {
            // ---- 武器购买 ----
            if (!player.weapons) player.weapons = [];

            // 查找是否已有同 ID 武器（合并）
            const existingIdx = player.weapons.findIndex(w => w.id === shopItem.id);
            if (existingIdx !== -1) {
                // 合并升级
                const existing = player.weapons[existingIdx];
                existing.level = (existing.level || 1) + 1;

                // 品质升级
                const qOrder = ['T1', 'T2', 'T3', 'T4'];
                if (qOrder.indexOf(shopItem.quality) > qOrder.indexOf(existing.quality || 'T1')) {
                    existing.quality = shopItem.quality;
                }

                this._increaseAffixesOnMerge(existing, 1);
                this._ensureAffixCount(existing);
                this._updateWeaponParams(player, shopItem.id);

                result = { item: shopItem, cost: shopItem.cost, action: 'merged', weaponId: shopItem.id };
            } else {
                // 检查槽位
                if (!player.weaponSlots) player.weaponSlots = 4;
                // 计算已使用槽位
                const usedSlots = player.weapons.length; // 简单处理: 每个武器占1槽
                if (usedSlots >= player.weaponSlots) {
                    this._lastBuyError = '武器槽位已满，无法购买新武器';
                    return null;
                }

                // 添加新武器
                const newWeapon = {
                    id: shopItem.id,
                    level: 1,
                    quality: shopItem.quality || 'T1',
                };
                this._initWeaponAffixes(newWeapon);
                player.weapons.push(newWeapon);
                this._updateWeaponParams(player, shopItem.id);

                result = { item: shopItem, cost: shopItem.cost, action: 'bought', weaponId: shopItem.id };
            }
        } else {
            // ---- 道具购买 ----
            if (typeof ItemSystem !== 'undefined') {
                const success = ItemSystem.buyItem(shopItem.id, player);
                if (!success) {
                    this._lastBuyError = '购买道具失败';
                    return null;
                }
            }

            if (shopItem.unique) {
                this._boughtUniqueItems.push(shopItem.id);
            }

            // 如果还没有 items 数组，初始化
            if (!player.items) player.items = [];
            if (!player.items.includes(shopItem.id)) {
                player.items.push(shopItem.id);
            }

            result = { item: shopItem, cost: shopItem.cost, action: 'bought' };
        }

        // 扣费
        player.materials -= shopItem.cost;

        // 从商品列表移除
        this.items.splice(index, 1);
        // 从锁定列表移除
        this.lockedItems = this.lockedItems.filter(li => !(li.id === shopItem.id && li.type === shopItem.type));

        // 商店空了 → 免费刷新一次
        if (this.items.length === 0) {
            this.refreshCost = 0;
        }

        this._lastBuyError = '';
        return result;
    },

    // -------------------------------------------------------
    // 武器定义查询（保留旧逻辑）
    // -------------------------------------------------------

    /**
     * 获取武器定义
     * @param {string} weaponId
     * @returns {Object|null}
     */
    getWeaponDef(weaponId) {
        const cache = typeof DataLoader !== 'undefined' && DataLoader._cache
            ? DataLoader._cache.weapons
            : null;
        if (!cache) return null;
        return cache.find(w => w.id === weaponId) || null;
    },

    // -------------------------------------------------------
    // 武器品质系统（保留旧 T1~T4 逻辑）
    // -------------------------------------------------------

    qualityDefs: {
        T1: { name: '普通', color: '#aaaaaa', bg: 'rgba(170,170,170,0.12)', damageMult: 1.0,  costMult: 1.0,  minWave: 1,  rollWeight: 45 },
        T2: { name: '优秀', color: '#4488ff', bg: 'rgba(68,136,255,0.12)', damageMult: 1.3,  costMult: 1.8,  minWave: 3,  rollWeight: 30 },
        T3: { name: '稀有', color: '#aa44ff', bg: 'rgba(170,68,255,0.12)', damageMult: 1.6,  costMult: 2.8,  minWave: 6,  rollWeight: 18 },
        T4: { name: '传说', color: '#ff6600', bg: 'rgba(255,102,0,0.15)', damageMult: 2.0,  costMult: 4.0,  minWave: 10, rollWeight: 7 },
    },

    /**
     * 投掷武器品质 (T1~T4)
     * @param {number} currentWave
     * @returns {string} 'T1'|'T2'|'T3'|'T4'
     *
     * 算法:
     * 1. 筛选 minWave ≤ currentWave 的品质
     * 2. 按 rollWeight 加权随机
     */
    rollQuality(currentWave) {
        const pool = Object.entries(this.qualityDefs)
            .filter(([_, q]) => currentWave >= q.minWave);
        if (pool.length === 0) return 'T1';
        const totalWeight = pool.reduce((sum, [_, q]) => sum + q.rollWeight, 0);
        let r = Math.random() * totalWeight;
        for (const [key, q] of pool) {
            r -= q.rollWeight;
            if (r <= 0) return key;
        }
        return pool[pool.length - 1][0];
    },

    // -------------------------------------------------------
    // 武器词条系统（保留旧逻辑）
    // -------------------------------------------------------

    affixDefs: {
        damagePct: {
            name: '攻击力', icon: '🗡️',
            desc: (v) => `+${Math.round(v * 100)}% 攻击力`,
            baseValue: [0.08, 0.15], perLevel: [0.02, 0.04],
        },
        attackSpeedPct: {
            name: '攻速', icon: '⚡',
            desc: (v) => `+${Math.round(v * 100)}% 攻速`,
            baseValue: [0.05, 0.10], perLevel: [0.01, 0.03],
        },
        critChancePct: {
            name: '暴击率', icon: '💥',
            desc: (v) => `+${Math.round(v * 100)}% 暴击率`,
            baseValue: [0.02, 0.04], perLevel: [0.005, 0.01],
        },
        critMultiplierAdd: {
            name: '暴击伤害', icon: '🔥',
            desc: (v) => `+${v.toFixed(1)}x 暴击伤害`,
            baseValue: [0.15, 0.30], perLevel: [0.05, 0.10],
        },
        lifeStealPct: {
            name: '生命偷取', icon: '🩸',
            desc: (v) => `+${Math.round(v * 100)}% 生命偷取`,
            baseValue: [0.01, 0.03], perLevel: [0.005, 0.01],
        },
        armor: {
            name: '护甲', icon: '🛡️',
            desc: (v) => `+${v} 护甲`,
            baseValue: [1, 3], perLevel: [1, 1],
            isInt: true,
        },
        hpRegenPct: {
            name: '生命回复', icon: '💚',
            desc: (v) => `${v.toFixed(1)} 回复/秒`,
            baseValue: [0.3, 0.8], perLevel: [0.1, 0.2],
        },
        maxHp: {
            name: '最大生命', icon: '❤️',
            desc: (v) => `+${v} 最大HP`,
            baseValue: [5, 15], perLevel: [3, 5],
            isInt: true,
        },
        attackRangePct: {
            name: '射程', icon: '🎯',
            desc: (v) => `+${Math.round(v * 100)}% 射程`,
            baseValue: [0.05, 0.10], perLevel: [0.015, 0.03],
        },
        bulletSpeedPct: {
            name: '弹速', icon: '➡️',
            desc: (v) => `+${Math.round(v * 100)}% 弹速`,
            baseValue: [0.05, 0.10], perLevel: [0.015, 0.03],
        },
        bulletPierceAdd: {
            name: '穿透', icon: '🔱',
            desc: (v) => `+${v} 穿透`,
            baseValue: [1, 1], perLevel: [0, 0],
            isInt: true,
        },
    },

    _rollAffix(level) {
        const ids = Object.keys(this.affixDefs);
        const id = ids[Math.floor(Math.random() * ids.length)];
        const def = this.affixDefs[id];
        const base = def.baseValue[0] + Math.random() * (def.baseValue[1] - def.baseValue[0]);
        const perLvl = def.perLevel[0] + Math.random() * (def.perLevel[1] - def.perLevel[0]);
        let value = base + (level - 1) * perLvl;
        if (def.isInt) value = Math.round(value);
        else value = Math.round(value * 100) / 100;
        return { id, value };
    },

    _rollNewAffixId(existingIds) {
        const pool = Object.keys(this.affixDefs).filter(id => !existingIds.includes(id));
        if (pool.length === 0) return null;
        return pool[Math.floor(Math.random() * pool.length)];
    },

    _initWeaponAffixes(weapon) {
        const level = weapon.level || 1;
        weapon.affixes = [this._rollAffix(level)];
    },

    _increaseAffixesOnMerge(weapon, fromLevel) {
        const levelIncrease = fromLevel || 1;
        for (const aff of (weapon.affixes || [])) {
            const def = this.affixDefs[aff.id];
            if (!def) continue;
            const inc = def.perLevel[0] + Math.random() * (def.perLevel[1] - def.perLevel[0]) * levelIncrease;
            if (def.isInt) aff.value += Math.round(inc);
            else aff.value = Math.round((aff.value + inc) * 100) / 100;
        }
    },

    _ensureAffixCount(weapon) {
        if (!weapon.affixes) weapon.affixes = [];
        const level = weapon.level || 1;
        const expected = 1 + Math.floor((level - 1) / 3);
        const existingIds = weapon.affixes.map(a => a.id);
        while (weapon.affixes.length < expected) {
            const newId = this._rollNewAffixId(existingIds);
            if (!newId) break;
            const newAff = this._rollAffix(level);
            newAff.id = newId;
            weapon.affixes.push(newAff);
            existingIds.push(newId);
        }
    },

    _applyMergeWithHighlights(weapon, fromLevel) {
        const before = (weapon.affixes || []).map(a => ({ id: a.id, value: a.value }));
        this._increaseAffixesOnMerge(weapon, fromLevel);
        this._ensureAffixCount(weapon);
        // highlight diff removed (was UI concern)
    },

    getRerollCost(weapon) {
        const level = weapon.level || 1;
        const quality = weapon.quality || 'T1';
        const baseCosts = { T1: 5, T2: 8, T3: 14, T4: 22 };
        const base = baseCosts[quality] || 5;
        const rerollPenalty = (weapon._rerollCount || 0) * 2;
        return base + (level - 1) * 3 + rerollPenalty;
    },

    rerollAffixes(weapon, player) {
        const cost = this.getRerollCost(weapon);
        if ((player.materials || 0) < cost) return false;
        player.materials -= cost;
        weapon._rerollCount = (weapon._rerollCount || 0) + 1;
        const level = weapon.level || 1;
        const expectedCount = 1 + Math.floor((level - 1) / 3);
        weapon.affixes = [];
        const existingIds = [];
        for (let i = 0; i < expectedCount; i++) {
            const newId = this._rollNewAffixId(existingIds);
            const aff = this._rollAffix(level);
            aff.id = newId || Object.keys(this.affixDefs)[Math.floor(Math.random() * Object.keys(this.affixDefs).length)];
            weapon.affixes.push(aff);
            if (newId) existingIds.push(newId);
        }
        this._updateWeaponParams(player, weapon.id);
        return { cost, newAffixes: weapon.affixes };
    },

    // -------------------------------------------------------
    // 武器管理
    // -------------------------------------------------------

    /**
     * 武器合并
     * @param {number} targetIdx - 目标武器索引
     * @param {number} sourceIdx - 来源武器索引
     * @param {Object} player
     * @returns {boolean}
     */
    mergeWeapons(targetIdx, sourceIdx, player) {
        if (!player || !player.weapons) return false;
        const target = player.weapons[targetIdx];
        const source = player.weapons[sourceIdx];
        if (!target || !source || target.id !== source.id) return false;
        if (targetIdx === sourceIdx) return false;

        const fromLevel = source.level || 1;
        target.level = (target.level || 1) + fromLevel;

        const qOrder = ['T1', 'T2', 'T3', 'T4'];
        if (qOrder.indexOf(source.quality || 'T1') > qOrder.indexOf(target.quality || 'T1')) {
            target.quality = source.quality;
        }

        this._applyMergeWithHighlights(target, fromLevel);

        // 移除来源武器
        const actualSrcIdx = player.weapons.indexOf(source);
        if (actualSrcIdx !== -1) player.weapons.splice(actualSrcIdx, 1);

        this._updateWeaponParams(player, target.id);
        return true;
    },

    /**
     * 出售武器
     * @param {number} slotIdx
     * @returns {boolean}
     */
    sellWeapon(slotIdx) {
        // 简化版：由游戏层实现具体出售逻辑
        return false;
    },

    _updateWeaponParams(player, weaponId) {
        if (!player.weaponParams) player.weaponParams = {};
        const weapons = player.weapons.filter(w => w.id === weaponId);
        if (weapons.length === 0) {
            delete player.weaponParams[weaponId];
            return;
        }

        const def = this.getWeaponDef(weaponId);
        if (!def) return;

        const maxLevel = Math.max(...weapons.map(w => w.level || 1));
        const qualities = weapons.map(w => w.quality || 'T1');
        const qualityOrder = ['T1', 'T2', 'T3', 'T4'];
        let bestQuality = 'T1';
        for (const q of qualities) {
            if (qualityOrder.indexOf(q) > qualityOrder.indexOf(bestQuality)) bestQuality = q;
        }
        const qDef = this.qualityDefs[bestQuality];
        const qualityBonus = qDef ? qDef.damageMult : 1.0;
        const levelBonus = 1 + (maxLevel - 1) * 0.25;

        player.weaponParams[weaponId] = {
            behavior: def.behavior || 'bullet',
            tag: def.tag || '',
            slots: def.slots || 1,
            bulletCount: def.bulletCount || 1,
            bulletSpeed: def.bulletSpeed || 500,
            damageMult: (def.damageMult || 1.0) * qualityBonus * levelBonus,
            attackSpeedMult: def.attackSpeedMult || 1.0,
            spread: def.spread || 0.1,
            pierce: def.pierce || 0,
            chainCount: def.chainCount || 0,
            splashRadius: def.splashRadius || 0,
            homingStrength: def.homingStrength || 0,
            level: maxLevel,
            quality: bestQuality,
            healOnHit: def.healOnHit || 0,
            auraHeal: def.auraHeal || 0,
            auraRadius: def.auraRadius || 0,
            burnDps: def.burnDps || 0,
            burnMaxStacks: def.burnMaxStacks || 0,
            meleeRange: def.meleeRange || 0,
            sprayCone: def.sprayCone || 0,
        };
    },

    getOwnedItems(player) {
        if (!player || !player.items) return [];
        return player.items.map(id => {
            if (typeof ItemSystem !== 'undefined') {
                return ItemSystem.getItemDef(id);
            }
            return null;
        }).filter(Boolean);
    },

    getOwnedWeapons(player) {
        if (!player || !player.weapons) return [];
        return player.weapons.map(w => this.getWeaponDef(w.id)).filter(Boolean);
    },

    // -------------------------------------------------------
    // 重置
    // -------------------------------------------------------

    reset() {
        this.items = [];
        this.lockedItems = [];
        this.refreshCost = 2;
        this._boughtUniqueItems = [];
        this._pity = {
            weapons: { totalRolls: 0, sinceLastRare: 0, sinceLastEpic: 0, sinceLastLegendary: 0 },
            items:   { totalRolls: 0, sinceLastRare: 0, sinceLastEpic: 0, sinceLastLegendary: 0 },
        };
    },
};

if (typeof module !== 'undefined') {
    module.exports = { ShopSystem };
}
