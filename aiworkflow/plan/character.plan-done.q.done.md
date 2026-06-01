# character.plan-review.md — 实现完成，请求 Pro 审核

## 实现范围

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/data/characters.json` | ✅ 重写 | 旧 11 角色 → 新 9 角色（含 penalties/tags/passives） |
| `src/engine/character.js` | ✅ 新建 | CharacterSystem：加载 + applyToPlayer + 查询 |
| `test/unit/character.test.js` | ✅ 完成 | 21 个测试用例（C1~C21） |
| `src/cyberblade/character.js` | ⏳ 待废弃 | 旧 CSV 解析 + 11 硬编码角色（保留兼容，未删除） |

## CharacterSystem API 摘要

### 核心方法

| 方法 | 签名 | 说明 |
|------|------|------|
| `loadCharacters()` | `async () → void` | DataLoader.load('characters')，标准化旧标签，确保 default |
| `applyToPlayer(player, id)` | `(Object, string) → boolean` | 应用属性 + penalties + tags + passives |
| `getCharacterDef(id)` | `(string) → Object\|null` | 查询角色定义 |
| `getCurrent()` | `() → Object\|null` | 当前选中角色 |
| `getTags()` | `() → string[]` | 当前角色标签（新 7 标签） |
| `hasTag(tagId)` | `(string) → boolean` | 是否适配标签（含旧标签 normalize） |
| `getUnlocked()` | `() → Object[]` | 已解锁角色（支持 UnlockSystem） |
| `select(id)` | `(string) → boolean` | 选择角色（检查解锁状态） |
| `reset()` | `() → void` | 重置状态 |

### 新 9 角色

| id | 优势 | 代价 | 被动 |
|----|------|------|------|
| default | 均衡 | 无 | — |
| glassCannon | +50% 伤害 | -5 护甲 | — |
| tank | +10 护甲, +50 HP | -20% 伤害, -40 移速 | — |
| berserker | +30% 伤害, +0.5 攻速 | 无 HP 回复 | berserker_rage |
| engineer | 工程 +10 | -10% 伤害, -0.1 攻速 | engineer_turret_boost |
| pyromancer | +20% 伤害, 燃烧 | — | pyro_burn_on_hit, pyro_fire_damage_boost |
| hunter | +10% 暴击, +10 射程 | — | hunter_ranged_boost |
| merchant | +20% 金币获取 | -10% 伤害 | merchant_gold_damage |
| assassin | +20% 暴击, +15% 闪避 | -2 护甲 | assassin_crit_boost |

## 关键设计决策

### 1. applyToPlayer 行为

按顺序执行：
1. **复制 statFields** — 只复制角色 JSON 定义的字段（maxHp, speed, armor 等）
2. **叠加 penalties** — 在角色基础属性上累加（如 glassCannon: armor=5, penalty=-5 → 最终 0）
3. **设置身份** — weaponSlots, characterId, tags
4. **重置 HP** — `player.hp = player.maxHp`
5. **钳制** — `StatsSystem.clampPlayer(player)`
6. **注册被动** — `player._passiveIds = [...ch.passives]`（由 PassiveSystem 消费）
7. **兼容层** — `_baseDamage=15, damage=damagePercent, critMultiplier=critDamage`

### 2. 旧标签兼容

`_normalizeTags()` 在加载时自动标准化旧标签名：
- gun/bow → ranged
- magic → fire
- medic → tech
- lance → melee

无 TagSystem 时使用内置映射表作为最低兼容。

### 3. characters.json 数据迁移

| 旧角色 | 新角色 | 说明 |
|--------|--------|------|
| swordsman | → default | 均衡型 |
| gunslinger, archer | → hunter | 合并为远程+暴击 |
| fire_mage | → pyromancer | 火焰系 |
| mech | → tank | 高防型 |
| assassin | → assassin | 保留并增强 |
| medic, paladin, dragon_knight | (移除) | 旧标签不存在 |
| engineer | → engineer | 保留并增强 |
| berserker | → berserker | 保留 |

### 4. 旧 CSV 解析代码保留

`src/cyberblade/character.js` 保留未删除，避免破坏现有游戏逻辑。Phase 2 集成时由 PlayerSystem 统一迁移。

## 测试结果

```bash
npm test
# → 4 files, 138 tests, all passed
```

| 测试模块 | 用例数 | 结果 |
|---------|--------|------|
| character — 数据加载 | 3 | ✅ |
| character — applyToPlayer | 8 | ✅ |
| character — 查询 | 9 | ✅ |
| character — 旧标签兼容 | 1 | ✅ |
| item — 全部 | 29 | ✅（无变更） |
| tags — 全部 | 35 | ✅（无变更） |
| stats — 全部 | 53 | ✅（无变更） |

## 需 Pro 确认

1. **旧 `src/cyberblade/character.js`**：保留还是删除？当前保留以兼容现有 game code。如果需要完全切换到新系统，需要一并更新 PlayerSystem.create() 的引用。
2. **`_baseDamage = 15`**：这是对所有角色的固定值。是否应该从 default 的 `_baseDamage` 计算派生（如角色基值 × weaponMult）？当前 `_calcBaseDamage` 使用 `_baseDamage × weapon.damageMult`。
3. **penalties 以加算方式应用**：当前如 glassCannon 的 armor=5 + penalty(-5)=0。是否期望某些 penalty 为乘算（如 "伤害 -20%" 应为 ×0.8）？
4. **passives 引用数组**：当前只存储 `player._passiveIds`，实际被动效果需等 passives.js 实现后生效。是否在 character 阶段就开始注册 passive 回调，还是等 passives 模块 ready？
5. **角色 unlock 逻辑**：当前使用 `UnlockSystem.isCharacterUnlocked()` 作为可选依赖。如果 UnlockSystem 不存在，未解锁角色不可选。是否接受这个设计？

## 请求审核

请 Pro 审核实现代码和测试，如有问题请写 `character.plan-done.q.md`。
