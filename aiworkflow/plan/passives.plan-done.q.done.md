# passives.plan-done.q.md — Pro 审核

---

## **[通过]** ✅ 架构设计

- effects.js 抽取为共享模块 — item.js / passives.js 共用 EffectEngine ✅
- EFFECT_HANDLERS 11 种效果类型完整 ✅
- PassiveSystem 注册/注销/更新/事件链清晰 ✅
- 168 测试全部通过 ✅

---

## 🔴 Q1: `register()` Passive 类型传 `player=null`，statMod 不生效 — [已解决] ✅

**修复：** `register(passiveId, source, player)` 增加第三个 `player` 参数，Passive 类型时传入 `player` 而非 `null`。`registerMany(ids, source, player)` 同步转发。

---

## 🔴 Q2: `reflectDamage` 仍未改用 `EnemySystem.takeDamage()` — [已解决] ✅

**修复：** 优先调用 `EnemySystem.takeDamage()` 以正确触发护甲/击杀处理，降级时直接 `hp -= dmg`。

---

## 🟡 Q3: `conditionalStatMod` 使用 `new Function()` — 安全风险

```js
// effects.js L132:
const fn = new Function(varDefs + `return (${effect.formula});`);
```

`passives.json` 中的 `merchant_gold_damage` 公式 `Math.floor(materials/50)*0.05` 通过 `new Function` 执行。虽然当前注入的变量经过类型过滤（只注入 number/string/boolean），但 `new Function` 本质上是 `eval`，是 XSS 入口。

**Pro 决定：Phase 1 接受，** 因为：
1. passives.json 是本地静态文件，不会被用户篡改
2. 注入变量经过类型白名单过滤
3. 浏览器环境无文件系统访问

**Phase 2 要求：** 替换为表达式解析器（如 `expr-eval` 或自实现四则运算 + Math 函数白名单）。

---

## 🟡 Q4: 冷却系统用 `Date.now()` 而非游戏时间

```js
// passives.js L240:
this._cooldowns[entry.id] = Date.now();
// L260:
return (Date.now() - this._cooldowns[passiveId]) < cd * 1000;
```

`Date.now()` 不受游戏暂停/帧率影响。如果游戏暂停（商店界面），冷却仍在走。对于单人游戏影响小，但不如 dt 精确。

**Pro 决定：Phase 1 接受。** 后续改为 dt 累积。

---

## **[通过]** ✅ 5 个确认问题逐条答复

| Flash 问题 | Pro 答复 |
|-----------|---------|
| 1. conditionalStatMod `new Function` 沙箱 | 接受（见 Q3） |
| 2. Passive 类型 player 引用 | 🔴 需修复（见 Q1） |
| 3. Item.js 需要 global.EffectEngine | 浏览器环境自动全局，无需额外机制 ✅ |
| 4. PerSecond 使用 `_timers` 独立于冷却 | 正确。cooldown 字段作 interval 复用合理 ✅ |
| 5. unregister statMod 反转负值风险 | 当前无字符串/布尔 stat，接受 ✅ |

---

## **[通过]** ✅ 其余检查

- `registerMany` → `register` 逐个调用，去重正确 ✅
- `unregister` 负值反转逻辑正确 ✅
- `onEvent` chance + cooldown 双重检查 ✅
- `_handleOnLowHP` 防抖标记正确 ✅
- `getByTag` / `getDef` 查询简洁 ✅
- `reset` / `resetAll` 完整 ✅

---

## 总结

| 项 | 结果 |
|----|------|
| 共享效果引擎架构 | ✅ 通过 |
| EFFECT_HANDLERS 11 种类型 | ✅ 通过（Q2 已修复） |
| register/unregister 生命周期 | ✅ Q1 已修复：register(id, source, player) |
| update/onEvent 事件系统 | ✅ 通过 |
| reflectDamage | ✅ Q2 已修复：优先 EnemySystem.takeDamage() |
| conditionalStatMod eval | 🟡 Q3: 接受，Phase 2 替换 |
| Date.now 冷却 | 🟡 Q4: 接受 |
| 测试覆盖 | ✅ 168 测试通过 |