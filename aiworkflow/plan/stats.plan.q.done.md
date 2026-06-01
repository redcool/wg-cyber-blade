# stats.plan.q.md — Flash 疑问

## Q1: baseDamage 数据来源

**[已回复]** Pro 确认：**选项 1。**

Phase 1 兼容方案：
```js
// calcDamage() 中:
const baseDamage = player._baseDamage || 15;  // 硬编码基线
const B = baseDamage * (weapon.damageMult || 1.0);
```

Phase 3（武器系统独立重构时）在 weapons.csv 加 `baseDamage` 列，不再依赖 `player._baseDamage`。

---

## Q2: Flat 层 Tag → Flat Stat 映射

**[已回复]** Pro 确认你的映射方案：

```js
const TAG_TO_FLAT_STAT = {
    melee:     'meleeDamage',
    ranged:    'rangedDamage',
    fire:      'elementalDamage',
    explosive: 'elementalDamage',
    crit:      null,           // 不加 flat
    tech:      'engineering',
    economy:   null,           // 不加 flat
};
```

`calcDamage` 中的实现：
```js
// F 层:
const flatStat = TAG_TO_FLAT_STAT[weapon.tag];
const F = flatStat ? (player[flatStat] || 0) : 0;
```

如果武器有旧标签（gun/bow/magic 等），先通过 `TagSystem` normalize 再查映射。

---

## Q3: `critDamage` 基准值

**[已回复]** Pro 确认：**critDamage 默认 = 2.0**（兼容旧 `critMultiplier`）。

实现：
```js
// player 初始化:
critDamage: 2.0,       // 新字段
critMultiplier: 2.0,   // 旧字段（兼容层）

// calcDamage 中:
const C = isCrit ? player.critDamage : 1.0;
// 等效旧逻辑: isCrit ? player.critMultiplier : 1.0
```

Phase 1 同时维护两个字段，更新一个时同步另一个。Phase 3 清理。

---

## Q4: Special 层条件数据来源

**[已回复]** Pro 确认你的建议：**Phase 1 只迁移 berserkerBlood。**

```js
/**
 * 获取特殊倍率
 * @returns {number} S 层乘数
 *
 * Phase 1: 只检查 berserkerBlood (lowHp)
 * Phase 2+: 从道具/角色/被动数据加载条件
 */
function _getSpecialModifier(player, target) {
    let S = 1.0;

    // berserkerBlood → lowHp 条件
    if (player.berserkerBlood && player.hp < player.maxHp * 0.3) {
        S *= 1.30;
    }

    // TODO Phase 2: 从 items.json / passives.json 加载 specialConditions
    // TODO Phase 2: 检查 target 状态 (burning/slowed/elite)

    return S;
}
```

---

## Q5: `_fireXXX` 的 weaponDef 传递

**[已回复]** Pro 确认：**选项 1。**

所有 `_fireXXX` 方法增加 `weaponDef` 参数：
```js
// 旧:
_fireBullet(angle, params, target, weaponId, spawnX, spawnY) {
    const dmg = this._calcDamage(params.damageMult);

// 新:
_fireBullet(angle, params, target, weaponDef, weaponId, spawnX, spawnY) {
    const dmg = StatsSystem.calcDamage(weaponDef, p, target);
```

调用方（`_fireWeapon` 和 `_updateAutoAttack`）已持有 `weaponDef`（通过 `ShopSystem.allWeapons.find()`），无需额外查询。

---

## Q6: 旧的 stats.js 中代码保留范围

**[已回复]** Pro 确认：**增量改动，不完全重写。**

保留：
- `armorDR()`, `calcDamageReduction()` — 不变
- `xpForLevel()` — 不变
- `levelUpOptions` — 暂时保留（Phase 2 移到 levelUpCards.json）
- `clampStat()`, `formatStat()` — 保留但扩展属性和类别

新增：
- `calcDamage(weapon, player, target)` — 四层公式
- `calcDPS(weapon, player)` — DPS 期望
- `getStatsByCategory(category)` — 按类别查询
- 扩展 `statDefs` 到 6 类 ~35 属性

新增运行模式：新旧属性共存。
```js
statDefs: {
    // 旧属性（兼容层，标记 deprecated）
    damage: { ..., _deprecated: true },
    critMultiplier: { ..., _deprecated: true },
    bulletCount: { ..., _deprecated: true },
    bulletPierce: { ..., _deprecated: true },
    bulletSpeed: { ..., _deprecated: true },
    pickupRange: { ..., _deprecated: true },

    // 新属性（正式）
    damagePercent: { ... },
    critDamage: { ... },
    projectilePierce: { ... },
    meleeDamage: { ... },
    // ... etc
},
```

---

## 已明确的条目

- **Q1~Q6**: 全部 **[已回复]** ✅
- **baseDamage 兼容方案**: 已明确 ✅
- **Flat 层 Tag 映射**: 已明确 ✅
- **Special 层 Phase 1 范围**: 已明确 ✅
- **增量改动策略**: 已明确 ✅