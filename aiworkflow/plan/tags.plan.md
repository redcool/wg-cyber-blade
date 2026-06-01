# Module: tags — Tag 注册/计数/流派判定/偏向权重

**依赖**: data.js（需武器/道具数据加载完成）
**执行顺序**: 2（等 data.js 就绪后实现）

---

## 一、模块定位

`tags.js` 是所有"流派联动"的**唯一权威中心**。商店、掉落、升级卡、道具触发、被动技能——全部通过本模块查询 Tag 信息，不存在分散定义。

```
tags.js
  │
  ├──→ shop.js      (流派偏向: +20% 权重)
  ├──→ loot.js      (宝箱流派偏向)
  ├──→ ui.js        (升级卡流派偏向)
  ├──→ item.js      (OnHit/OnKill 按 Tag 触发)
  ├──→ passives.js  (角色被动绑定 Tag)
  └──→ player.js    (synergy 加成计算)
```

---

## 二、7 标签定义

```js
// 重构后的标签体系
const TAG_DEFS = {
    melee:   { id: 'melee',   name: '近战',   icon: '⚔️' },
    ranged:  { id: 'ranged',  name: '远程',   icon: '🏹' },
    fire:    { id: 'fire',    name: '火焰',   icon: '🔥' },
    explosive:{ id: 'explosive', name: '爆炸', icon: '💥' },
    crit:    { id: 'crit',    name: '暴击',   icon: '💢' },
    tech:    { id: 'tech',    name: '工程',   icon: '🤖' },
    economy: { id: 'economy', name: '经济',   icon: '💰' },
};
```

**与旧标签的映射**（数据迁移用，不进入运行时代码）：

| 旧标签 | 新标签 |
|--------|--------|
| melee | melee |
| gun, bow | ranged |
| magic → fire | fire |
| — | explosive (新增) |
| — | crit (新增) |
| — | tech (新增) |
| — | economy (新增) |
| medic, lance | **移除** |

---

## 三、接口定义

```js
const TagSystem = {

    // -------------------------------------------------------
    // 3.1 标签元数据
    // -------------------------------------------------------

    /** 获取标签定义 */
    getTagDef(tagId) {},

    /** 获取所有标签ID列表 */
    getAllTagIds() {},


    // -------------------------------------------------------
    // 3.2 标签计数
    // -------------------------------------------------------

    /**
     * 统计武器数组的标签分布
     * @param {Object[]} weapons - [{ id: 'pistol' }, ...]
     * @returns {Object} - { melee: 2, ranged: 1, fire: 0, ... }
     *
     * 算法:
     * 1. 初始化 7 标签计数器为 0
     * 2. 遍历 weapons, 查每个武器的 tag 字段
     * 3. 对应标签计数器 +1
     * 4. 返回计数对象
     */
    countWeaponTags(weapons) {},

    /**
     * 统计道具数组的标签分布
     * @param {Object[]} items - [{ tags: ['fire','ranged'] }, ...]
     * @returns {Object}
     *
     * 算法:
     * 1. 初始化 7 标签计数器为 0
     * 2. 遍历 items, 遍历每个 item.tags 数组
     * 3. 对应标签计数器 +1
     * 4. 返回计数对象
     */
    countItemTags(items) {},

    /**
     * 合并武器+道具标签计数
     * @param {Object} weaponCounts
     * @param {Object} itemCounts
     * @returns {Object} - 合并后的计数
     *
     * 算法:
     * 1. 初始化合并计数器
     * 2. weaponCounts 直接加, itemCounts 按权重 0.5 加
     *    （道具标签影响力弱于武器）
     * 3. 返回合并结果
     */
    mergeTagCounts(weaponCounts, itemCounts) {},


    // -------------------------------------------------------
    // 3.3 流派判定
    // -------------------------------------------------------

    /**
     * 根据标签计数判定玩家的主要流派
     * @param {Object} tagCounts - 合并后的计数
     * @returns {Object} - { primary: 'fire', secondary: 'ranged', counts: {...} }
     *
     * 算法:
     * 1. 取计数最高的标签为 primary
     * 2. 取计数第二高（且 >0）为 secondary
     * 3. 如果并列取先定义的值
     * 4. 如果所有标签都是 0, primary=null
     */
    determineBuild(tagCounts) {},


    // -------------------------------------------------------
    // 3.4 Synergy 加成
    // -------------------------------------------------------

    /**
     * Synergy 阈值定义（每个标签的羁绊层数）
     *
     * 结构:
     * {
     *   melee: {
     *     2: { damagePercent: 0.15, lifeSteal: 0.05 },
     *     4: { damagePercent: 0.30, lifeSteal: 0.10, armor: 3 },
     *     6: { damagePercent: 0.50, lifeSteal: 0.15, armor: 5, knockback: 200 },
     *   },
     *   ranged: { ... },
     *   ...
     * }
     */
    synergyThresholds: {},

    /**
     * 计算当前激活的所有 synergy
     * @param {Object[]} weapons
     * @returns {Object[]} - [{ tagId, tagIcon, count, threshold, bonus }, ...]
     *
     * 算法:
     * 1. 调用 countWeaponTags(weapons)
     * 2. 遍历每个标签，查找满足的最高阈值
     * 3. 返回激活的 synergy 列表
     */
    getActiveSynergies(weapons) {},

    /**
     * 合并所有激活 synergy 的加成到一个对象
     * @param {Object[]} activeSynergies
     * @returns {Object} - { damagePercent: 0.45, lifeSteal: 0.10, ... }
     *
     * 算法:
     * 1. 遍历 activeSynergies
     * 2. 对于每个 bonus 中的 key, 累加值
     * 3. 返回合并结果
     */
    mergeSynergyBonuses(activeSynergies) {},


    // -------------------------------------------------------
    // 3.5 流派偏向（用于商店/掉落/升级卡）
    // -------------------------------------------------------

    /**
     * 计算流派偏向权重
     * @param {Object} tagCounts - 合并后的标签计数
     * @param {number} biasStrength - 偏向强度 (默认 0.2 = +20%)
     * @returns {Object} - { melee: 1.2, ranged: 1.0, fire: 0.8, ... }
     *
     * 算法:
     * 1. 每个标签基础权重 = 1.0
     * 2. 统计总标签数 totalTags
     * 3. 对于每个有计数的标签: weight += biasStrength × (count / totalTags)
     * 4. 返回权重对象
     *
     * 示例: 玩家有 3 把 fire 武器, 1 把 ranged
     *   fire 权重 = 1.0 + 0.2 × (3/4) = 1.15
     *   ranged 权重 = 1.0 + 0.2 × (1/4) = 1.05
     */
    getBiasWeights(tagCounts, biasStrength) {},


    // -------------------------------------------------------
    // 3.6 过滤和查询
    // -------------------------------------------------------

    /**
     * 按标签过滤数组
     * @param {Object[]} items - 带 tags 字段的数组
     * @param {string} tagId
     * @returns {Object[]}
     */
    filterByTag(items, tagId) {},

    /**
     * 检查对象是否包含指定标签
     * @param {Object} obj - { tags: ['fire','ranged'] }
     * @param {string} tagId
     * @returns {boolean}
     */
    hasTag(obj, tagId) {},

    /**
     * 获取对象的所有标签
     * @param {Object} obj
     * @returns {string[]}
     */
    getTags(obj) {},
};
```

---

## 四、Synergy 阈值数据

当前 shop.js 的 `synergyDefs` 需要迁移并重新设计（6 标签 → 7 标签，数值需重新平衡）：

```js
TagSystem.synergyThresholds = {
    melee: {
        2: { damagePercent: 0.10, lifeSteal: 0.03 },
        4: { damagePercent: 0.25, lifeSteal: 0.06, armor: 2 },
        6: { damagePercent: 0.40, lifeSteal: 0.10, armor: 5, knockback: 150 },
    },
    ranged: {
        2: { attackRange: 0.15 },
        4: { attackRange: 0.30, bulletSpeed: 0.20 },
        6: { attackRange: 0.50, bulletSpeed: 0.35, bulletCount: 1 },
    },
    fire: {
        2: { elementalDamage: 0.15 },
        4: { elementalDamage: 0.30, burnDps: 3 },
        6: { elementalDamage: 0.50, burnDps: 6, burningSpread: true },
    },
    explosive: {
        2: { explosionSize: 0.20 },
        4: { explosionSize: 0.40, explosionDamage: 0.30 },
        6: { explosionSize: 0.60, explosionDamage: 0.50, chainExplosion: true },
    },
    crit: {
        2: { critChance: 0.05 },
        4: { critChance: 0.10, critDamage: 0.50 },
        6: { critChance: 0.15, critDamage: 1.00, onCritLightning: true },
    },
    tech: {
        2: { engineering: 5 },
        4: { engineering: 10, turretCount: 1 },
        6: { engineering: 20, turretCount: 2, turretDamage: 0.30 },
    },
    economy: {
        2: { luck: 3, xpGain: 0.15 },
        4: { luck: 6, xpGain: 0.30, materialGain: 0.25 },
        6: { luck: 10, xpGain: 0.50, materialGain: 0.50, goldToDamage: true },
    },
};
```

（具体数值标记为 `[PLACEHOLDER]`，后续需策划调优。）

---

## 五、迁移影响范围

| 文件 | 旧代码 | 新代码 |
|------|--------|--------|
| `shop.js` | `tagInfo`, `synergyDefs`, `getTagCounts()`, `getActiveSynergies()` | **删除**，改为调用 `TagSystem.*` |
| `player.js` | `_updateSynergies()` 调用 `ShopSystem.getActiveSynergies()` | 改为 `TagSystem.getActiveSynergies()` |
| `ui.js` | 读取 `synergyDisplay` 时调 `ShopSystem.getActiveSynergies()` | 改为 `TagSystem.getActiveSynergies()` |
| `shop.js` | `generateItems()` 无流派偏向 | 调用 `TagSystem.getBiasWeights()` |
| `character.js` | `affinities` 字段 (旧 6 标签) | 改为 `tags` 字段 (新 7 标签) |

---

## 六、验收标准

- [ ] 7 标签 ID/name/icon 正确定义
- [ ] `countWeaponTags([{id:'pistol'}, {id:'axe'}])` → 正确计数（pistol 是 ranged, axe 是 melee）
- [ ] `determineBuild({melee:3, ranged:1})` → `{ primary: 'melee', secondary: 'ranged' }`
- [ ] `getActiveSynergies()` 返回正确的 synergy 列表
- [ ] `getBiasWeights()` 为正，总和合理
- [ ] shop.js / player.js / ui.js / character.js 不再包含 Tag 硬编码
- [ ] 旧标签 medic/lance → 映射到新标签（或在数据迁移时处理）