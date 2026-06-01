# stats.plan-review.md — 实现完成，请求 Pro 审核

## 实现范围

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/engine/stats.js` (v3) | ✅ 完成 | 旧 v2 → v3 升级：四层伤害公式 + 六类属性 + 兼容层 |
| `src/engine/tags.js` | ✅ 已存在 | 之前已实现，本次仅添加 CJS 导出以便测试 |
| `test/unit/tags.test.js` | ✅ 完成 | 35 个测试用例（T1~T35） |
| `test/unit/stats.test.js` | ✅ 完成 | 53 个测试用例（S1~S53） |
| `test/fixtures/*.js` | ✅ 完成 | 4 个 fixture 文件 |
| `package.json` | ✅ 完成 | vitest 测试框架 |
| `vitest.config.js` | ✅ 完成 | vitest 配置 |

## v3 变更摘要

### 新增
- **`calcDamage(weapon, player, target)`** — 四层公式 `(B+F)×P×C×S`
- **`calcDPS(weapon, player)`** — DPS 期望计算（不应用 S 层）
- **`getStatsByCategory(category)`** — 6 类属性分类查询
- **`_calcBaseDamage`** / **`_calcFlatDamage`** / **`_calcPercentMultiplier`** / **`_calcCritMultiplier`** / **`_getSpecialModifier`** — 各层内部方法
- **`TAG_TO_FLAT_STAT`** 映射表（weapon tag → flat stat）
- 23 个新属性定义 + 6 个旧字段兼容层

### 保留不变
- `armorDR()`, `calcDamageReduction()` — 护甲系统
- `xpForLevel()` — 经验系统
- `clampStat()`, `clampPlayer()` — 数值钳制（扩展支持新属性）
- `formatStat()`, `getCapInfo()` — 格式化（扩展支持新属性）
- `levelUpOptions` — 等级可选项（Phase 2 再迁移）
- `getDisplayStats()` — 扩展为按 category 排序，支持 deprecated 过滤

### 兼容层
- 旧 `damage` → `damagePercent` 回退
- 旧 `critMultiplier` → `critDamage` 回退
- statDefs 中旧字段标记 `_deprecated: true`
- `getDisplayStats` 自动隐藏 deprecated 零值字段

### tags.js 变更
- 文件尾添加 `if (typeof module !== 'undefined') module.exports = ...`（仅在 Node 环境生效）

## 测试结果

```bash
npm test
# → 2 files, 88 tests, all passed
```

| 测试模块 | 用例数 | 结果 |
|---------|--------|------|
| tags — 标签元数据 | 6 | ✅ |
| tags — 标签计数 | 9 | ✅ |
| tags — 流派判定 | 4 | ✅ |
| tags — Synergy 加成 | 6 | ✅ |
| tags — 流派偏向 | 3 | ✅ |
| tags — 过滤查询 | 7 | ✅ |
| stats — 四层伤害公式（内部方法）| 14 | ✅ |
| stats — calcDamage 集成测试（Math.random mock）| 10 | ✅ |
| stats — 护甲/减伤 | 5 | ✅ |
| stats — 属性分类与格式化 | 8 | ✅ |
| stats — 属性钳制 | 5 | ✅ |
| stats — getDisplayStats | 6 | ✅ |
| stats — 经验系统 | 5 | ✅ |

## 需确认

- `stats.js` 中 `levelUpOptions` 的 `damage` 和 `critMultiplier` 升级卡已同步更新 `damagePercent` 和 `critDamage`（兼容层双向同步）
- tags.js 仅加了 CJS 导出，API 行为未变

## 请求审核

请 Pro 审核实现代码和测试，如有问题请写 `stats.plan-done.q.md`。
