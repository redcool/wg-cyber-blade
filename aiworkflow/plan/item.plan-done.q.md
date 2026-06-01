# item.plan-done.q.md — Pro 审核

---

## **[通过]** ✅ 架构设计

- 四层结构完整：StatMods + Triggers + Tags + Rarity
- `loadItems()` 合并 JSON 与 `_itemDefs` 的策略合理
- `buyItem()` / `removeItem()` 的 statMods 正向/逆向操作干净
- `update()` / `onEvent()` 的混合轮询+事件驱动正确
- 29 个测试通过

---

## **[通过]** ✅ Phase 1 `_itemDefs` 硬编码策略

items.json 缺少 statMods → `_itemDefs` 桥接。这是 Phase 1 的必要妥协。Phase 2 移到 CSV 时删除。

---

## 🟡 Q1: EFFECT_TYPES 的标记模式 — 消费方未定义

`explosion`、`spreadBurn`、`duplicateBullet` 等效果使用标记模式（`context._explosion`、`player._duplicateNext` 等）。**当前没有代码消费这些标记**——它们被设置了但没人读取。

**Pro 决定：Phase 1 接受。** 标记模式是正确的架构（item.js 零依赖），但需要在 plan 中明确标记消费方：

| 标记 | 消费方 | Phase |
|------|--------|-------|
| `player._duplicateNext` | `player.js._fireBullet` 读取 + 重置 | Phase 2 |
| `context._explosion` | `main.js` 碰撞循环读取 + 执行 AoE | Phase 2 |
| `context._spreadBurn` | `enemy.js` 死亡钩子读取 + 执行传播 | Phase 2 |

**追加要求：** `item.plan-review.md` 的第 2 点确认标记模式正确，请在 `item.js` 头部注释中补充标记消费方表。

---

## 🟡 Q2: `applyBurn` / `applySlow` 字段名与旧系统不一致

```js
// item.js EFFECT_TYPES:
target._burnDps, target._burnDuration, target._burnMaxStacks, target._burnTimer
target._slowAmount, target._slowDuration, target._slowTimer

// 旧 enemy.js 实际使用的字段:
enemy.burnStacks[] → { dps, remaining }
enemy.slowTimer, enemy.slowFactor
```

两个系统互不认识。如果 item.js 设置 `_burnDps`，旧 enemy update 不会读取它，燃烧不会生效。

**Pro 决定：暂不改。** item.js 设置新字段（`_burnDps` 等），在 enemy.js Phase 3 重做时统一迁移到新字段名。Phase 2 集成期间如果需要燃烧生效，在 `enemy.js.update()` 中加兼容读取：

```js
// enemy.js update 中临时兼容（Phase 2）:
if (enemy._burnDps > 0 && !enemy.burnStacks) {
    enemy.burnStacks = [{ dps: enemy._burnDps, remaining: enemy._burnDuration }];
}
```

---

## 🔴 Q3: `reflectDamage` 直接修改 attacker.hp

```js
// item.js L64-66
if (context.attacker.hp !== undefined) {
    context.attacker.hp -= dmg;
}
```

应通过 `EnemySystem.takeDamage()` 调用，否则跳过护甲/护盾/击杀处理。

**修复：**

```js
reflectDamage: (effect, player, context) => {
    if (!context || !context.attacker) return;
    const pct = effect.percent || 0.3;
    const dmg = Math.floor((context.damage || 0) * pct);
    if (typeof EnemySystem !== 'undefined' && EnemySystem.takeDamage) {
        EnemySystem.takeDamage(context.attacker, dmg);
    } else {
        context.attacker.hp -= dmg; // 降级
    }
},
```

---

## 🟡 Q4: `blood_pact` 用 negative heal 做扣血

```js
blood_pact: { triggers: [{ type: 'PerSecond', interval: 1.0, effect: { type: 'heal', value: -5 } }] }
```

负值回血的语义可读性差。**接受但不推荐。** Phase 2 建议加一个 `damageSelf` 效果类型。

---

## 🟡 Q5: `berserker` 道具效果偏离设计

旧 berserker 道具：设置 `berserkerBlood = true` → `stats.js._getSpecialModifier` 读取 → 低血时 +30% 伤害。

新 `_itemDefs`：`critChance +0.05` + `OnLowHP → heal 30`。与旧行为完全不同。

**Pro 决定：** Phase 1 保留 Flash 的设计（简化），因为：
- `stats.js._getSpecialModifier` 已经处理 `berserkerBlood` 标志
- 但该标志现在由 **角色 berserker** 携带（character.js 重构后）
- 道具 berserker 不应该再设置这个标志

当前实现 `critChance + 低血回血` 是合理的独立道具设计。后续数值平衡时调整。

---

## **[通过]** ✅ 4 个确认问题的回答

| Flash 问题 | Pro 答复 |
|-----------|---------|
| 1. `_itemDefs` 硬编码策略 | ✅ 接受，Phase 2 移到 CSV |
| 2. 触发器引擎粒度（标记模式） | ✅ 接受，补充消费方文档 |
| 3. onEvent 调用方 | ✅ 由战斗系统（main.js / player.js）调用，Phase 2 集成 |
| 4. PerSecond dt 累积 | ✅ 正确，interval 粒度合理 |

---

## 总结

| 项 | 结果 |
|----|------|
| 架构（四层结构） | ✅ 通过 |
| buyItem / removeItem | ✅ 通过 |
| update / onEvent 触发引擎 | ✅ 通过 |
| _itemDefs 硬编码桥接 | ✅ 通过（Phase 1 妥协） |
| 标记消费方文档 | 📋 追加注释 |
| _burnDps / _slowAmount 字段不一致 | 🟡 接受，Phase 3 统一 |
| reflectDamage 直接改 hp | 🔴 需改为 EnemySystem.takeDamage() |
| blood_pact negative heal | 🟡 接受 |
| 测试覆盖 | ✅ 通过 |

**下一步：** Flash 修复 Q3（reflectDamage），补充标记消费方注释。完成后重命名为 `item.plan-done.q.done.md`。