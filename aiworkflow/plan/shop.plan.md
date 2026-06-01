# Module: shop — 商店重做（稀有度+保底+流派偏向）

**依赖**: data.js, tags.js, item.js, stats.js
**执行顺序**: 7（等 item.js + tags.js 就绪）

---

## 一、核心变更

| 维度 | 旧 | 新 |
|------|----|----|
| 商品类型 | 武器 + 道具（混在一起） | 分开 Tab（武器 / 道具） |
| 稀有度 | T1~T4（仅武器，颜色硬编码） | common/rare/epic/legendary（武器+道具统一，Tag 驱动） |
| 保底 | 无 | 每 3 次必 Rare，每 10 次必 Epic，每 20 次必 Legendary |
| 流派偏向 | 无 | 当前 Build Tag 商品 +20% 权重 |
| 道具购买 | 硬编码 `_itemApplyFunctions` | ItemSystem.buyItem() |
| 武器数据源 | `_parseWeaponCSV` | DataLoader.load('weapons') |
| 刷新成本 | `refreshCost` 递增 | 固定 2 金币（稀有度本身已控制成本） |

---

## 二、商品生成算法

```js
/**
 * 生成商店商品
 *
 * 算法:
 * 1. 获取玩家当前 Build（TagSystem.determineBuild）
 * 2. 获取流派偏向权重（TagSystem.getBiasWeights, biasStrength=0.2）
 * 3. 清空上一轮商品
 * 4. 武器池: 从 DataLoader 缓存中取 weapons 数组
 * 5. 道具池: 从 DataLoader 缓存中取 items 数组
 * 6. 生成 3~5 件武器:
 *    a. 从武器池中按权重随机选取（基础权重 1.0 × 流派偏向 × 稀有度权重）
 *    b. 稀有度由 rollQuality() 决定
 *    c. 检查保底：计数不够 → 强制升级稀有度
 * 7. 生成 3~5 件道具:
 *    a. 从道具池中按权重随机选取（基础权重 1.0 × 流派偏向 × 稀有度权重）
 *    b. 已持有 unique 道具 → 排除
 *    c. 稀有度同理
 *    d. 保底同理
 * 8. 增加保底计数器
 */
```

---

## 三、稀有度系统

### 3.1 统一稀有度定义

```js
const RARITY = {
    common:    { name: '普通', color: '#aaaaaa', weight: 60, minWave: 1, costMult: 1.0 },
    rare:      { name: '稀有', color: '#4488ff', weight: 25, minWave: 3, costMult: 1.5 },
    epic:      { name: '史诗', color: '#aa44ff', weight: 10, minWave: 6, costMult: 2.5 },
    legendary: { name: '传说', color: '#ff6600', weight: 5,  minWave: 10, costMult: 4.0 },
};
```

### 3.2 稀有度投掷

```js
/**
 * 投掷稀有度
 * @param {number} currentWave
 * @returns {string} - 'common'|'rare'|'epic'|'legendary'
 *
 * 算法:
 * 1. 筛选 minWave ≤ currentWave 的稀有度
 * 2. 按 weight 加权随机
 * 3. 返回结果
 */
rollRarity(currentWave) {}
```

### 3.3 保底机制

```js
// 商店例子系统
_pity: {
    weapons: { totalRolls: 0, sinceLastRare: 0, sinceLastEpic: 0, sinceLastLegendary: 0 },
    items:   { totalRolls: 0, sinceLastRare: 0, sinceLastEpic: 0, sinceLastLegendary: 0 },
},

/**
 * 检查保底并可能升级稀有度
 * @param {string} rolledRarity
 * @param {Object} pityTracker
 * @returns {string} 最终稀有度
 *
 * 算法:
 * 1. sinceLastLegendary >= 20 → 强制 legendary
 * 2. sinceLastEpic >= 10 → 至少 epic
 * 3. sinceLastRare >= 3 → 至少 rare
 * 4. 更新计数器: 如果结果为 rare+ → 重置 sinceLastRare; 以此类推
 */
applyPity(rolledRarity, pityTracker) {},
```

---

## 四、流派偏向

```js
/**
 * 流派偏向加权选择
 * @param {Object[]} pool - 可选物品数组
 * @param {Object} biasWeights - TagSystem.getBiasWeights() 的结果
 * @param {string} field - pool 中物品的标签字段名 ('tags' 或 'tag')
 * @returns {Object} 选中的物品
 *
 * 算法:
 * 1. 为 pool 中每个物品计算 finalWeight:
 *    finalWeight = 1.0
 *    遍历物品的 tags:
 *      如果 biasWeights[tagId] 存在 → finalWeight += (biasWeights[tagId] - 1.0) / tagsCount
 *    如果物品没有任何标签 → finalWeight = 1.0
 * 2. 按 finalWeight 加权随机选择
 * 3. 返回选中的物品 + { weightedPool: [...] } 供 UI 使用
 */
biasedSelect(pool, biasWeights, field) {},
```

---

## 五、商品结构

```js
// 单件商品
{
    id: 'flame_sword',
    type: 'weapon',          // 'weapon' | 'item'
    name: '火焰剑',
    desc: '近战 + 燃烧',
    icon: '🔥',
    cost: 15,               // 基础成本 × 稀有度系数
    rarity: 'epic',
    rarityColor: '#aa44ff',
    tags: ['melee', 'fire'], // 用于流派偏向
    isPity: false,           // 是否保底产出

    // 武器专属
    level: 1,
    quality: 'T1',           // 兼容旧 qualityDefs（后续可统一为 rarity）

    // 道具专属
    unique: false,
    owned: false,
}
```

---

## 六、接口定义

```js
const ShopSystem = {
    /** 当前商品 */
    items: [],

    /** 刷新成本 */
    refreshCost: 2,

    /** 保底计数器 */
    _pity: {
        weapons: { totalRolls: 0, sinceLastRare: 0, sinceLastEpic: 0, sinceLastLegendary: 0 },
        items:   { totalRolls: 0, sinceLastRare: 0, sinceLastEpic: 0, sinceLastLegendary: 0 },
    },

    /** 已购买 unique 道具 ID 集合 */
    _boughtUniqueItems: [],


    // -------------------------------------------------------
    // 6.1 数据加载
    // -------------------------------------------------------

    /**
     * 加载武器和道具数据
     *
     * 算法:
     * 1. await Promise.all([DataLoader.load('weapons'), DataLoader.load('items')])
     * 2. 存入 this.allWeapons / ItemSystem.allItems
     */
    async loadData() {},


    // -------------------------------------------------------
    // 6.2 商品生成
    // -------------------------------------------------------

    /**
     * 生成一轮商店商品
     *
     * 算法: 见"二、商品生成算法"
     */
    generateItems() {},

    /**
     * 刷新商店（扣金币，重新生成）
     * @param {Object} player
     * @returns {boolean} 是否成功
     */
    reroll(player) {},


    // -------------------------------------------------------
    // 6.3 购买
    // -------------------------------------------------------

    /**
     * 购买商品
     * @param {number} index - 商品索引
     * @param {Object} player
     * @returns {Object|boolean} - 购买结果或 false
     *
     * 算法:
     * 1. 检查材料和商品是否存在
     * 2. 如果 type === 'weapon':
     *    a. 检查武器槽位 (player.weapons.length < player.weaponSlots)
     *    b. 如果槽满 → 弹合并选项（现有逻辑保留）
     *    c. 否则 → 加入 weapons 数组
     *    d. 重新计算 weaponParams
     *    e. 调用 PlayerSystem._updateSynergies()
     * 3. 如果 type === 'item':
     *    a. 调用 ItemSystem.buyItem(itemId, player)
     *    b. 如果 unique → 加入 _boughtUniqueItems
     * 4. 扣费
     * 5. 从商品列表移除该商品
     * 6. 返回购买结果对象（含 toast 消息）
     */
    buyItem(index, player) {},


    // -------------------------------------------------------
    // 6.4 武器管理（保留现有逻辑）
    // -------------------------------------------------------

    /**
     * 获取武器定义
     */
    getWeaponDef(weaponId) {},

    /**
     * 品质定义（T1~T4，后续逐步迁移到 rarity）
     */
    qualityDefs: { /* 保持不变 */ },

    /**
     * 投掷品质
     */
    rollQuality(currentWave) { /* 保持不变 */ },

    /**
     * 武器词条系统（保留）
     */
    affixDefs: { /* 保持不变 */ },
    _rollAffix(level) { /* 保持不变 */ },

    /**
     * 武器合并
     */
    mergeWeapons(targetId, sourceId, player) { /* 保留现有逻辑 */ },


    // -------------------------------------------------------
    // 6.5 重置
    // -------------------------------------------------------

    reset() {
        this.items = [];
        this.refreshCost = 2;
        this._boughtUniqueItems = [];
        this._pity = {
            weapons: { totalRolls: 0, sinceLastRare: 0, sinceLastEpic: 0, sinceLastLegendary: 0 },
            items:   { totalRolls: 0, sinceLastRare: 0, sinceLastEpic: 0, sinceLastLegendary: 0 },
        };
    },
};
```

---

## 七、清理清单

删除的旧代码：

| 代码 | 位置 | 原因 |
|------|------|------|
| `tagInfo` (6 旧标签) | shop.js:261 | 迁移到 tags.js |
| `synergyDefs` (6 旧羁绊) | shop.js:270 | 迁移到 tags.js |
| `getTagCounts()` | shop.js:732 | 迁移到 tags.js |
| `getActiveSynergies()` | shop.js:741 | 迁移到 tags.js |
| `_itemApplyFunctions` | shop.js:228 | 迁移到 item.js |
| `loadWeaponTable()` | shop.js:302 | 迁移到 DataLoader |
| `_parseWeaponCSV()` | shop.js:319 | 不再需要 |
| `splitCSVLine()` (全局) | shop.js:8 | 迁移到 csv2json.js (Node 端) |
| `generateItems()` 旧逻辑 | shop.js | 重写 |

---

## 八、验收标准

- [ ] 商店正确显示 3~5 武器 + 3~5 道具
- [ ] 稀有度颜色在 UI 上正确显示（common 灰 / rare 蓝 / epic 紫 / legendary 橙）
- [ ] 保底机制工作：3 次不出 rare → 第 4 次强制 rare；10 次不出 epic → 第 11 次强制 epic
- [ ] 流派偏向：用 fire 武器时，fire Tag 道具出现概率 +20%
- [ ] 购买道具 → ItemSystem.buyItem() 被正确调用
- [ ] 购买武器 → 正确加入武器槽，重新计算 synergy
- [ ] 刷新成本固定为 2 金币
- [ ] 旧 CSV 解析代码全部删除
- [ ] 旧标签/羁绊代码全部删除