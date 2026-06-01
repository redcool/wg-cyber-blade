# item.plan-review.md — 实现完成，请求 Pro 审核

## 实现范围

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/engine/item.js` | ✅ 完成 | 全新模块：ItemSystem + EFFECT_TYPES |
| `test/unit/item.test.js` | ✅ 完成 | 29 个测试用例（I1~I21 + E1~E8） |
| `test/fixtures/player.base.js` | ✅ 已有 | 测试用基础玩家属性 |
| `src/data/items.json` | ✅ 已有 | 30 条道具数据（tags/triggers 字段多数为空） |
| `package.json` | ✅ 已有 | vitest 测试框架 |

## ItemSystem API 摘要

### 核心方法

| 方法 | 签名 | 说明 |
|------|------|------|
| `loadItems()` | `async () → void` | 从 DataLoader 加载 items.json，合并 _itemDefs 映射 |
| `getItemDef(id)` | `(string) → object\|null` | 查询道具定义 |
| `buyItem(id, player)` | `(string, Player) → boolean` | 购买道具，应用 statMods，unique 防重 |
| `removeItem(id, player)` | `(string, Player) → void` | 移除道具，撤消 statMods |
| `hasItem(id)` | `(string) → boolean` | 是否持有 |
| `getByRarity(rarity)` | `(string) → array` | 按稀有度过滤 |
| `getByTag(tag)` | `(string) → array` | 按标签过滤 |
| `getBuyablePool()` | `() → array` | 可购买列表（排除已持有 unique） |
| `onEvent(eventType, player, context)` | `(string, Player, object) → void` | 事件触发：匹配道具的 trigger type + chance |
| `update(dt, player)` | `(number, Player) → void` | 帧更新：PerSecond 计时器 + OnLowHP 检查 |
| `reset()` | `() → void` | 重置所有状态 |

### EFFECT_TYPES

| 效果类型 | 参数 | 说明 |
|---------|------|------|
| `heal` | `{ value }` | 回血（不超过 maxHp） |
| `applyBurn` | `{ dps, duration, maxStacks }` | 标记燃烧效果 |
| `applySlow` | `{ amount, duration }` | 标记减速效果 |
| `duplicateBullet` | `{ chance }` | 标记下颗子弹复制 |
| `explosion` | `{ radius, damagePercent }` | 标记爆炸 |
| `reflectDamage` | `{ percent }` | 反弹伤害给攻击者 |
| `spreadBurn` | `{ range, layers }` | 标记燃烧传播 |

## 关键设计决策

### 1. _itemDefs 硬编码 statMods 映射

items.json 的 statMods 字段当前为空 → Phase 1 由 `_itemDefs` 提供 30 项道具的属性修正映射。Phase 2 可迁移到 CSV。

### 2. 数据合并优先级

`loadItems()` 将 items.json 数据与 `_itemDefs` 合并：
- JSON 数据优先保留（tags, triggers, effects）
- `_itemDefs` 补充 `statMods` + `_weight` + 默认 tag
- 当 JSON 中 `triggers` 已有内容时不覆盖

### 3. 触发器引擎仅设置标记

`EFFECT_TYPES` 不直接修改游戏循环状态（bullet、explosion等），而是在 player/context 上设置标记（如 `player._duplicateNext`），由战斗系统消费这些标记。保持 item.js 对其他系统的零依赖。

### 4. OnLowHP 双重防抖

- `_lowHpTriggered` 标记：防止一次触发多次
- 当 HP 恢复到 30% 以上时自动清除标记，允许再次触发

### 5. 事件驱动 vs 帧轮询混合

- `onEvent()`：被战斗系统调用（OnHit, OnKill, OnDamageTaken）
- `update()`：帧更新轮询（PerSecond 间隔计时, OnLowHP 条件检查）

## 测试结果

```bash
npm test
# → 3 files, 117 tests, all passed
```

| 测试模块 | 用例数 | 结果 |
|---------|--------|------|
| item — 数据加载 | 2 | ✅ |
| item — 购买/移除 | 7 | ✅ |
| item — 查询 | 4 | ✅ |
| item — onEvent 触发器 | 4 | ✅ |
| item — update 帧更新 | 4 | ✅ |
| EFFECT_TYPES — 效果函数 | 8 | ✅ |
| tags — 全部 | 35 | ✅（无变更） |
| stats — 全部 | 53 | ✅（无变更） |

## 需 Pro 确认

1. **Phase 1 `_itemDefs` 映射策略**：硬编码 statMods 是否符合预期？还是希望直接完善 items.json 的 statMods 字段？
2. **触发器引擎粒度**：当前 EFFECT_TYPES 仅设置标记（如 `_duplicateNext`），不做实际弹道/爆炸创建。实际的子弹复制和爆炸逻辑是否由战斗系统处理？
3. **onEvent 调用方**：当前无模块调用 `onEvent()` — 这是由 character.js 或战斗系统调用吗？是否需要 item.js 自行 hook 到 stats.js 的 calcDamage 里？
4. **PerSecond 间隔触发**：regen_trigger 等道具的 interval 建议使用 game loop 的 dt 累积（当前实现），是否对？

## 请求审核

请 Pro 审核实现代码和测试，如有问题请写 `item.plan-done.q.md`。
