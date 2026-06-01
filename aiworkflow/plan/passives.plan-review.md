# passives.plan-review.md — 实现完成，请求 Pro 审核

## 实现范围

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/engine/effects.js` | ✅ 新建 | EffectEngine + EFFECT_HANDLERS（共享效果引擎） |
| `src/engine/passives.js` | ✅ 新建 | PassiveSystem（注册/更新/事件/查询） |
| `src/data/passives.json` | ✅ 新建 | 7 条被动技能定义 |
| `src/engine/item.js` | ✅ 重构 | 移除 EFFECT_TYPES，委托 EffectEngine 执行效果 |
| `test/unit/effects.test.js` | ✅ 新建 | 16 个测试用例（E1~E16） |
| `test/unit/passives.test.js` | ✅ 新建 | 22 个测试用例（P1~P22） |
| `test/unit/item.test.js` | ✅ 更新 | 移除 EFFECT_TYPES 测试，21 用例 |

## 架构变更

### 效果引擎抽取

```
src/engine/item.js          src/engine/effects.js           src/engine/passives.js
  ┌──────────────────┐       ┌────────────────────┐        ┌─────────────────────┐
  │ ItemSystem        │ ──→  │ EffectEngine       │ ←── ─ │ PassiveSystem        │
  │  _executeEffect() │ 可    │  execute()          │ 共    │  register()          │
  │  buyItem()        │ 调    │  EFFECT_HANDLERS    │ 享    │  onEvent()           │
  │  update/onEvent() │ 用    │  (heal/applyBurn/   │ 引    │  update(dt)          │
  └──────────────────┘       │   reflectDamage/   │ 用    │  _trigger()          │
                              │   statMod/...)     │        └─────────────────────┘
                              └────────────────────┘
```

### EFFECT_HANDLERS

| 效果类型 | 参数 | 说明 |
|---------|------|------|
| `heal` | `{ value }` | 回复 HP（不超出 maxHp） |
| `applyBurn` | `{ dps, duration, maxStacks }` | 标记燃烧 |
| `applySlow` | `{ amount, duration }` | 标记减速 |
| `duplicateBullet` | `{ chance }` | 标记子弹复制 |
| `explosion` | `{ radius, damagePercent }` | 标记爆炸 |
| `reflectDamage` | `{ percent }` | 反弹给攻击者 |
| `spreadBurn` | `{ range, layers }` | 标记燃烧传播 |
| `damagePercentBoost` | `{ value, duration }` | 临时 buff |
| `speedBoost` | `{ value, duration }` | 临时 buff |
| `statMod` | `{ statField: value }` | 永久属性修正（Passive 类型） |
| `conditionalStatMod` | `{ stat, formula }` | 公式驱动的条件修正 |

## PassiveSystem API

| 方法 | 说明 |
|------|------|
| `loadPassives()` | 从 DataLoader 加载 passives.json |
| `register(id, source)` | 注册被动（去重，Passive 类型立即应用 statMod） |
| `registerMany(ids, source)` | 批量注册 |
| `unregister(id)` | 注销（Passive 类型撤消 statMod） |
| `unregisterMany(ids)` | 批量注销 |
| `update(dt, player)` | 帧更新：PerSecond（_timers 累加）+ OnLowHP |
| `onEvent(type, player, context)` | 事件触发：OnHit/OnKill/OnCrit/OnDamageTaken/OnDodge |
| `getByTag(tagId)` | 按标签过滤激活中的被动 |
| `getDef(passiveId)` | 查询定义 |
| `reset()` | 清空注册 |
| `resetAll()` | 完全重置 |

## passives.json 7 条被动

| 被动 ID | 类型 | 效果 | 绑定角色 |
|---------|------|------|---------|
| `berserker_rage` | OnLowHP | +30% damage，CD 5s | 狂战士 |
| `engineer_turret_boost` | Passive | turretDamage +50% | 工程师 |
| `pyro_burn_on_hit` | OnHit | 100% 施加燃烧，CD 0.5s | 火法 |
| `pyro_fire_damage_boost` | Passive | elementalDamage +4 | 火法 |
| `hunter_ranged_boost` | Passive | rangedDamage +5 | 猎人 |
| `merchant_gold_damage` | PerSecond | Math.floor(materials/50)*0.05 伤害 | 商人 |
| `assassin_crit_boost` | OnCrit | +50% damage，持续 0.5s | 刺客 |

## 测试结果

```bash
npm test
# → 6 files, 168 tests, all passed
```

| 测试模块 | 用例数 | 结果 |
|---------|--------|------|
| effects — 16 | heal/reflect/applyBurn/applySlow/... | ✅ |
| passives — 22 | 加载/注册/onEvent/update/查询 | ✅ |
| item — 21 | 数据加载/购买/查询/onEvent/update | ✅（重构后） |
| tags — 35 | 元数据/计数/流派/synergy | ✅（无变更） |
| stats — 53 | 四层伤害/护甲/属性/经验 | ✅（无变更） |
| character — 21 | 加载/apply/查询/旧标签兼容 | ✅（无变更） |

## 需 Pro 确认

1. **conditionalStatMod 公式求值**：当前使用 `new Function` 注入 ctx 属性作为局部变量后 eval 公式。安全性取决于注入的变量类型（仅数字/字符串/布尔）。是否需要在生产环境加强沙箱？
2. **Passive 类型 statMod 应用目标**：当前 `register` 中 Passive 类型调用 `EffectEngine.execute(def.effect, null, {})`。由于 statMod 效果只修改 player 属性，但注册时 player 可能还未就绪。是否改为传入 player 引用？
3. **item.js 效果执行委托**：EffectEngine 现在作为全局引用，item.js 和 passives.js 共用。item.test.js 需要通过 `global.EffectEngine = EffectEngine` 设置全局。是否需要添加自动导入/注册机制？
4. **冷却与 PerSecond 隔离**：PerSecond 使用独立的 `_timers` 存储，不与 `_cooldowns` 冲突。但 PerSecond 被动上的 cooldown 字段同时作为 interval 使用。是否符合预期？
5. **unregister 的 statMod 反转**：Passive 类型 unregister 时通过创建负值 `statMod` 来反转效果。如果 stat 值是字符串或布尔类型会出问题。是否接受这个限制？

## 请求审核

请 Pro 审核实现代码和测试，如有问题请写 `passives.plan-done.q.md`。
