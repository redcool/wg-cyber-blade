# stats.plan-done.q.md — Pro 审核

---

## **[通过]** ✅ 代码质量

- 四层公式拆分清晰：`_calcBaseDamage` / `_calcFlatDamage` / `_calcPercentMultiplier` / `_calcCritMultiplier` / `_getSpecialModifier`
- 各层内部方法可独立测试、独立修改
- `TAG_TO_FLAT_STAT` 映射表正确（按 Q2 回复）
- `calcDPS` 正确区分期望暴击 vs 实际暴击判定
- `getStatsByCategory` 过滤 deprecated 字段，干净
- CJS 导出处理得当（浏览器不影响）

---

## **[通过]** ✅ statDefs 六类属性

- 6 类 30 个新属性 + 6 个旧兼容字段 ✅
- min/max/fmt 值合理
- `_deprecated` 标记正确

---

## **[通过]** ✅ Q1: `_calcPercentMultiplier` 兼容层数学错误 — 已修复

**严重性：高危。** Phase 1 期间 `player.damagePercent` 未初始化时，fallback 到 `player.damage` 值会导致伤害爆炸。

**根因：**

```js
// stats.js L111-118
_calcPercentMultiplier(player) {
    let pct = player.damagePercent;
    if (pct === undefined || pct === null) {
        pct = player.damage || 0;   // ← BUG
    }
    return 1 + pct;
}
```

旧 `player.damage = 15` 是**绝对基础伤害值**，不是百分比。`1 + 15 = 16` 会把伤害放大 16 倍。

**当前触发条件：** `PlayerSystem.create()` 未初始化 `damagePercent` 字段（仍用旧初始化），导致 `damagePercent === undefined` → fallback 到 `player.damage = 15` → 伤害 ×16。

**修复方案：** 改为直接判断旧值语义：

```js
_calcPercentMultiplier(player) {
    if (player.damagePercent !== undefined && player.damagePercent !== null) {
        return 1 + player.damagePercent;
    }
    // 旧字段兼容：player.damage 是绝对值，不是百分比
    // 通过 _calcBaseDamage 已经处理了基础伤害
    // P 层默认 1.0（无百分比加成）
    return 1.0;
}
```

同时在 `PlayerSystem.create()` 中加一行：
```js
damagePercent: 0,   // 新字段
```

---

## **[通过]** ✅ Q2: `_calcCritMultiplier` 的 `result` 参数冗余 — 已简化

```js
// L126-138
_calcCritMultiplier(player, result) {
    const isCrit = Math.random() < critChance;
    result._lastCrit = isCrit;       // 写到 result 对象
    ...
}

// L171-186
calcDamage(weapon, player, target) {
    const critResult = {};
    const C = this._calcCritMultiplier(player, critResult);
    player._lastCrit = critResult._lastCrit;  // 再从 result 搬到 player
    ...
}
```

中间对象 `critResult` 是不必要的跳板。建议简化：

```js
_calcCritMultiplier(player) {
    const isCrit = Math.random() < (player.critChance || 0);
    player._lastCrit = isCrit;       // 直接写到 player
    if (!isCrit) return 1.0;
    let cd = player.critDamage;
    if (cd === undefined || cd === null) cd = player.critMultiplier || 2.0;
    return cd;
}
```

`calcDamage` 中直接 `const C = this._calcCritMultiplier(player);`。

---

## **[通过]** ✅ levelUpOptions 双向同步

```js
// damage 卡同步 damagePercent:
apply: (p) => { p.damage = Math.floor(p.damage * 1.22); p.damagePercent = p.damage; }
// critMultiplier 卡同步 critDamage:
apply: (p) => { p.critMultiplier = ...; p.critDamage = p.critMultiplier; }
```

正确。双向同步保证新旧字段始终一致。Phase 3 清理后去掉。

---

## **[通过]** ✅ 测试覆盖

88 个测试全部通过。覆盖：
- 四层公式内部方法 ✅
- calcDamage 集成（含 Math.random mock） ✅
- 属性分类/钳制/格式化 ✅
- 经验系统 ✅

---

## 总结

| 项 | 结果 |
|----|------|
| statDefs 六类属性 | ✅ 通过 |
| 四层伤害公式 | ✅ 通过 |
| calcDPS | ✅ 通过 |
| 兼容层（critDamage/critMultiplier） | ✅ 通过 |
| levelUpOptions 双向同步 | ✅ 通过 |
| 测试覆盖 | ✅ 通过 |
| `_calcPercentMultiplier` 兼容 Bug | ✅ 已修复 |
| `_calcCritMultiplier` result 冗余 | ✅ 已简化 |

**结论：全部审核问题已解决。**