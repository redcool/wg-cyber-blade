// ============================================================
// src/engine/engine-shop.js — 商店系统 v2（稀有度+保底+流派偏向）
// 依赖: data.js (DataLoader), tags.js (TagSystem), item.js (ItemSystem)
// ============================================================

// 引擎商店中文表（从 engine-shop_charsData.json 加载，运行时覆盖）
const _ESHOP_STR = {
    rarity_common:'普通', rarity_uncommon:'优秀', rarity_rare:'稀有', rarity_epic:'史诗', rarity_legendary:'传说',

    error_no_item:'商品不存在', error_no_player:'玩家不存在', error_unique_bought:'该独特道具已购买',
    error_slot_full:'武器槽位已满，无法购买新武器', error_buy_failed:'购买道具失败', error_no_gold:'🪙 金币不足，需要 {0}',
};
if (typeof DataLoader !== 'undefined') {
    DataLoader.load('engine-shop_charsData').then(d => { if (d) Object.assign(_ESHOP_STR, d); }).catch(() => {});
}

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
 *   - 武器品质 T1~T4 已移除，伤害纯等级驱动
 *   - 词条系统已禁用（代码移至 affixes.js）
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
        common:    { name: _ESHOP_STR.rarity_common,    color: '#aaaaaa', weight: 60, minWave: 1,  costMult: 1.0 },
        uncommon:  { name: _ESHOP_STR.rarity_uncommon,  color: '#4A9BD1', weight: 40, minWave: 2,  costMult: 1.2 },
        rare:      { name: _ESHOP_STR.rarity_rare,      color: '#4488ff', weight: 25, minWave: 3,  costMult: 1.5 },
        epic:      { name: _ESHOP_STR.rarity_epic,      color: '#aa44ff', weight: 10, minWave: 6,  costMult: 2.5 },
        legendary: { name: _ESHOP_STR.rarity_legendary, color: '#ff6600', weight: 5,  minWave: 10, costMult: 4.0 },
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
     * 按波次决定单槽 weapon / item 概率（Brotato 风格）
     * @param {number} currentWave
     * @returns {number} 武器概率（0~1），道具概率 = 1 - 该值
     *
     * 公式: p_weapon = max(0.35, 0.85 - wave * 0.04)
     *   wave  1 → 0.81  (81% 武器 / 19% 道具)
     *   wave  3 → 0.73
     *   wave  5 → 0.65
     *   wave  8 → 0.53
     *   wave 10 → 0.45
     *   wave 13 → 0.37
     *   wave 15+→ 0.35  (35% 武器 / 65% 道具)
     */
    pickSlotType(currentWave) {
        const wave = currentWave || 1;
        const pWeapon = Math.max(0.35, 0.85 - wave * 0.04);
        return Math.random() < pWeapon ? 'weapon' : 'item';
    },

    /**
     * 生成一轮商店商品
     * @param {Object} player - 玩家对象（含 weapons/items）
     * @param {number} currentWave - 当前波次
     * @param {number} [availableSlots] - 限额（默认 4）。刷新/换波时由调用方传
     *   `(4 - lockedCount)`，确保总商品数（包含 locked）不超过 4。
     *
     * 算法（Brotato 风格 — 每槽独立 roll）:
     * 1. 获取玩家 Build 标签计数 + 流派偏向权重
     * 2. 清空商品列表
     * 3. 武器池：流派过滤（持有≥2 同 tag 武器后只刷对应 tag）
     * 4. 道具池：排除已购 unique
     * 5. 循环 maxSlots 次, 每槽:
     *    a. pickSlotType(wave) 决定本槽 weapon / item
     *       - pWeapon = max(0.35, 0.85 - wave * 0.04)
     *       - wave 1 → 81% 武器, wave 10 → 45% 武器, wave 15+ → 35% 武器
     *    b. 至少 1 件道具约束: 若 4 槽全 roll 武器, 把最后一槽改为 item
     *    c. 从对应池子 biasedSelect → 去重
     *    d. rollRarity + applyPity → 单独累加 weapons / items 保底计数
     *    e. 某个池子空了则该轮不填, 不补另一类 (避免 weapon/item 配比失衡)
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

        // 4. 武器池（流派过滤：持有≥2件同tag后只刷对应tag武器）
        let weaponPool = (typeof DataLoader !== 'undefined' && DataLoader._cache && DataLoader._cache.weapons)
            ? [...DataLoader._cache.weapons]
            : [];

        // 找出玩家持有多件（≥2）的 dominant tag
        const dominantTags = [];
        for (const [tag, count] of Object.entries(tagCounts || {})) {
            if (count >= 2) dominantTags.push(tag);
        }
        if (dominantTags.length > 0) {
            const filtered = weaponPool.filter(w => {
                const wt = typeof TagSystem !== 'undefined' ? TagSystem.getTags(w) : [];
                return wt.some(t => dominantTags.includes(t));
            });
            if (filtered.length > 0) weaponPool = filtered;
        }

        // 5. 道具池（排除已购 unique）
        const allItems = (typeof ItemSystem !== 'undefined' && ItemSystem.allItems)
            ? ItemSystem.allItems
            : [];

        const itemPool = allItems.filter(item => {
            if (item.unique && this._boughtUniqueItems.includes(item.id)) return false;
            return true;
        });

        // 6. 4 槽独立 roll (Brotato 风格, 按波次概率决定 weapon/item)
        let weaponRolls = 0;
        let itemRolls = 0;
        for (let i = 0; i < maxSlots; i++) {
            if (this.pickSlotType(currentWave) === 'weapon') {
                weaponRolls++;
            } else {
                itemRolls++;
            }
        }
        // 至少 1 件道具约束: 4 槽全 roll 武器时, 把最后一槽改为 item
        // 防止早期运气差时完全没有道具可选 (玩家无从补 buff)
        if (itemRolls === 0 && maxSlots > 0) {
            weaponRolls = Math.max(0, weaponRolls - 1);
            itemRolls = 1;
        }

        // 7. 生成武器
        for (let i = 0; i < weaponRolls && weaponPool.length > 0; i++) {
            const selected = this.biasedSelect(weaponPool, biasWeights);
            if (!selected) continue;

            // 去重
            const selIdx = weaponPool.indexOf(selected);
            if (selIdx !== -1) weaponPool.splice(selIdx, 1);

            // 稀有度 + 保底
            const baseRarity = this.rollRarity(currentWave || 1);
            const { rarity, wasPity } = this.applyPity(baseRarity, this._pity.weapons);
            const rDef = this.RARITY[rarity];

            // 价格 = 基础成本 × 稀有度系数
            const baseCost = selected.cost || 10;
            const cost = Math.max(1, Math.round(baseCost * rDef.costMult));

            this.items.push({
                ...selected,
                type: 'weapon',
                rarity,
                rarityColor: rDef.color,
                quality: 'T1',
                level: 1,
                cost,
                isPity: wasPity,
                tags: typeof TagSystem !== 'undefined' ? TagSystem.getTags(selected) : [],
            });
        }

        // 8. 生成道具
        for (let i = 0; i < itemRolls && itemPool.length > 0; i++) {
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
     * 刷新商店（扣金币，重新生成 + 价格递增）
     * @param {Object} player
     * @param {number} currentWave
     * @returns {boolean} 是否成功
     *
     * Brotato 风格: 每次刷新后 refreshCost +1, 限制无限刷新。
     * 与 refresh() 行为一致。
     */
    reroll(player, currentWave) {
        if (!player) return false;
        if ((player.materials || 0) < this.refreshCost) return false;

        player.materials -= this.refreshCost;
        this.refreshCost += 1;  // 每次刷新价格递增 (Brotato 风格)
        const lockedCount = (this.lockedItems || []).length;
        this.generateItems(player, currentWave || 1, Math.max(0, 4 - lockedCount));
        // 重新加回锁定商品
        for (const li of (this.lockedItems || [])) {
            if (!this.items.some(it => it.id === li.id && it.type === li.type)) {
                this.items.push({ ...li, locked: true });
            }
        }
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
        if (!shopItem) { this._lastBuyError = _ESHOP_STR.error_no_item; return null; }
        if (!player) { this._lastBuyError = _ESHOP_STR.error_no_player; return null; }

        // 检查材料
        if ((player.materials || 0) < shopItem.cost) {
            this._lastBuyError = _ESHOP_STR.error_no_gold.replace('{0}', shopItem.cost);
            return null;
        }

        // 检查 unique 重复购买
        if (shopItem.type === 'item' && shopItem.unique &&
            this._boughtUniqueItems.includes(shopItem.id)) {
            this._lastBuyError = _ESHOP_STR.error_unique_bought;
            return null;
        }

        let result = null;

        if (shopItem.type === 'weapon') {
            // ---- 武器购买 ----
            if (!player.weapons) player.weapons = [];
            if (!player.weaponSlots) player.weaponSlots = 4;
            const usedSlots = player.weapons.length; // 简单处理: 每个武器占 1

            // 设计: 槽位未满 → 加新槽位 (不自动升级)
            //      槽位已满 → 找同 id 升级 (action='merged'), 否则失败
            if (usedSlots < player.weaponSlots) {
                // 1) 槽位未满, 总是加新武器 (即使有同 id 也不合并)
                const newWeapon = {
                    id: shopItem.id,
                    level: 1,
                    quality: 'T1',
                };
                player.weapons.push(newWeapon);
                this._updateWeaponParams(player, shopItem.id);
                result = { item: shopItem, cost: shopItem.cost, action: 'bought', weaponId: shopItem.id };
            } else {
                // 2) 槽位已满, 找同 id 升级; 没同 id 失败
                const existingIdx = player.weapons.findIndex(w => w.id === shopItem.id);
                if (existingIdx !== -1) {
                    const existing = player.weapons[existingIdx];
                    existing.level = (existing.level || 1) + 1;
                    this._updateWeaponParams(player, shopItem.id);
                    result = { item: shopItem, cost: shopItem.cost, action: 'merged', weaponId: shopItem.id };
                } else {
                    this._lastBuyError = _ESHOP_STR.error_slot_full;
                    return null;
                }
            }
        } else {
            // ---- 道具购买 ----
            if (typeof ItemSystem !== 'undefined') {
                const success = ItemSystem.buyItem(shopItem.id, player);
                if (!success) {
                    this._lastBuyError = _ESHOP_STR.error_buy_failed;
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

    /** 同步 RarityColor（品质系统已移除，仅保留 RARITY 同步） */
    _syncRarityColors() {
        if (typeof RarityColorSystem === 'undefined') return;
        for (const [key, def] of Object.entries(this.RARITY)) {
            const col = RarityColorSystem.getColor(key);
            const name = RarityColorSystem.getName(key);
            if (col) def.color = col;
            if (name) def.name = name;
        }
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

        // 移除来源武器
        const actualSrcIdx = player.weapons.indexOf(source);
        if (actualSrcIdx !== -1) player.weapons.splice(actualSrcIdx, 1);

        this._updateWeaponParams(player, target.id);
        // 合并会改变武器组成，刷新协同
        if (typeof PlayerSystem !== 'undefined' && PlayerSystem._updateSynergies) {
            PlayerSystem._updateSynergies();
        }
        // 合并后被消掉的两把同级武器的 locked 引用都已失效，清掉
        this.lockedItems = (this.lockedItems || []).filter(li => li.id !== target.id);
        return true;
    },

    /**
     * 一键合并：给定一把武器的 idx，自动找一把 同 id + 同 level 的伙伴，
     * 合并后保留 target（等级 +1），删除 source。（Brotato 风格快捷合并）
     * @param {number} idx
     * @param {Object} player
     * @returns {boolean} 成功合并返回 true，无伙伴返回 false
     */
    mergeWeaponWithAny(idx, player) {
        if (!player || !player.weapons) return false;
        const w = player.weapons[idx];
        if (!w) return false;
        const myLevel = w.level || 1;
        const myId = w.id;

        // 找一把 同 id + 同 level 且 idx !== idx 的伙伴
        let partnerIdx = -1;
        for (let i = 0; i < player.weapons.length; i++) {
            if (i === idx) continue;
            const o = player.weapons[i];
            if (o.id === myId && (o.level || 1) === myLevel) {
                partnerIdx = i;
                break;
            }
        }
        if (partnerIdx === -1) return false;

        // 用 mergeWeapons：idx 当 target, partner 当 source
        return this.mergeWeapons(idx, partnerIdx, player);
    },

    /**
     * 出售武器
     * @param {number} slotIdx
     * @returns {boolean} 成功返回 true
     */
    sellWeapon(slotIdx) {
        const player = (typeof PlayerSystem !== 'undefined') ? PlayerSystem.player : null;
        if (!player || !player.weapons || slotIdx < 0 || slotIdx >= player.weapons.length) return false;
        // 安全检查: 至少保留 1 把武器（防止空武器状态）
        if (player.weapons.length <= 1) return false;
        const weapon = player.weapons[slotIdx];
        if (!weapon) return false;
        const def = this.getWeaponDef(weapon.id);
        if (!def) return false;

        // 半价退款 + 1（与旧实现保持一致）
        const refund = Math.floor((def.cost || 0) / 2) + 1;
        player.materials = (player.materials || 0) + refund;

        // 移除武器并清理参数
        player.weapons.splice(slotIdx, 1);
        const remaining = player.weapons.filter(w => w.id === weapon.id);
        if (remaining.length === 0) {
            delete player.weaponParams[weapon.id];
        } else {
            this._updateWeaponParams(player, weapon.id);
        }

        // 关键：把 lockedItems 里对这把武器的引用也清掉
        //  否则下次刷新会把已经卖掉的武器以"locked"形式塞回商店
        this.lockedItems = (this.lockedItems || []).filter(
            li => !(li.id === weapon.id && li.type === 'weapon')
        );

        // 刷新所有剩余武器的 params（保证 quality/level 重新计算）+ 同步协同
        for (const w of player.weapons) {
            if (player.weaponParams[w.id]) this._updateWeaponParams(player, w.id);
        }
        if (typeof PlayerSystem !== 'undefined' && PlayerSystem._updateSynergies) {
            PlayerSystem._updateSynergies();
        }
        if (typeof StatsSystem !== 'undefined' && StatsSystem.clampPlayer) {
            StatsSystem.clampPlayer(player);
        }

        return true;
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
        const levelBonus = 1 + (maxLevel - 1) * 0.25;

        player.weaponParams[weaponId] = {
            behavior: def.behavior || 'bullet',
            tag: def.tag || '',
            slots: def.slots || 1,
            bulletCount: def.bulletCount || 1,
            bulletSpeed: def.bulletSpeed || 500,
            damageMult: (def.damageMult || 1.0) * levelBonus,
            attackSpeedMult: def.attackSpeedMult || 1.0,
            spread: def.spread || 0.1,
            pierce: def.pierce || 0,
            chainCount: def.chainCount || 0,
            splashRadius: def.splashRadius || 0,
            homingStrength: def.homingStrength || 0,
            level: maxLevel,
            healOnHit: def.healOnHit || 0,
            killHeal: def.killHeal || 0,
            auraHeal: def.auraHeal || 0,
            auraRadius: def.auraRadius || 0,
            damageReductionAura: def.damageReductionAura || 0,
            burnDps: def.burnDps || 0,
            burnMaxStacks: def.burnMaxStacks || 0,
            sprayCone: def.sprayCone || 0,
            attackRange: def.attackRange || 0,
            bulletMaxRange: def.bulletMaxRange || 0,
            iceExplosionRadius: def.iceExplosionRadius || 0,
            critBounce: def.critBounce || 0,
            // 新字段: 暴击独立面板
            critChanceAdd: def.critChanceAdd || 0,
            critDamageAdd: def.critDamageAdd || 0,
            // 新字段: 武器类别（BroTato Class 系统）
            class: def.class || 'Primitive',
            // 新字段: 击退力度
            knockback: (def.knockback !== undefined && def.knockback !== null) ? def.knockback : 0,
            // FormulaSystem 引用
            _weaponDef: def,
            _weaponLevel: maxLevel,
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
