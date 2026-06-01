# SKILL.md 问题清单与修复计划

## 问题 1: YAML frontmatter 字段名 `od:` 疑似错误

**位置**: L19
**现状**: `od:` 作为顶层 YAML key，包含 `mode/prototype/surface/platform/scenario` 子字段。
**问题**: `od` 不是 OpenCode 技能规范中的标准 frontmatter 字段。可能是 `options` 的缩写误写，或应直接内联到顶层。
**修复**: 将 `od:` 下的子字段提升到顶层，删除 `od:` 包装。

```yaml
# 修复前 (L19-23):
od:
  mode: prototype
  surface: code
  platform: desktop
  scenario: coding

# 修复后:
mode: prototype
surface: code
platform: desktop
scenario: coding
```

---

## 问题 2: L56 文件名不一致 — `plan-done.md` vs `plan-review.md`

**位置**: L56
**现状**: `代码通过后写 {module}.plan-done.md`
**问题**: 文档命名规范表（L69）和实际工作流中使用的文件名是 `{module}.plan-review.md`，而非 `{module}.plan-done.md`。L56 与 L69 矛盾。
**修复**: L56 改为 `{module}.plan-review.md`。

---

## 问题 3: 文件清单表（L199-207）缺少 `plan-review.md` 的 done 流程

**位置**: L199-207
**现状**: 表中有 `plan-review.md`（Flash→Pro），但没有说明审核通过后该文件如何处理。
**问题**: 实际流程中，Pro 审核通过后写 `plan-done.q.md`（即使无问题也写），Flash 修复后重命名为 `plan-done.q.done.md`。但 `plan-review.md` 本身没有明确的"关闭"状态。
**修复**: 在表下方增加说明：

```
审核通过后，Pro 产出 `plan-done.q.md`（即使无问题也标记全部 [通过]）。
Flash 修复后重命名为 `plan-done.q.done.md`。
plan-review.md 保留作为审核请求的原始记录。
```

---

## 问题 4: `plan-done.q.done.md` 写作者标注错误

**位置**: L206
**现状**: 标注写作者为 `Pro`
**问题**: 实际流程中，Flash 修复问题后执行重命名操作（`plan-done.q.md` → `plan-done.q.done.md`）。写作者应为 Flash。
**修复**: 写作者改为 `Flash`。

---

## 问题 5: `plan.q.md` 缺少 Pro 作为共同写作者

**位置**: L201
**现状**: 写作者标注为 `Flash`，读者为 `Pro`
**问题**: Pro 在 `plan.q.md` 中原地回复问题（标记 `[已回复]`），也是写作者。文件是 Flash 和 Pro 共同编辑的。
**修复**: 写作者改为 `Flash → Pro（回复）`，读者改为 `Flash → Pro → Flash`。

---

## 问题 6: 工作流中缺少 `TEST_PLAN.md` 的实际使用指导

**位置**: L116-117
**现状**: 步骤 6 说 Pro 产出 `TEST_PLAN.md`，但未说明何时产出、如何消费。
**问题**: 实际项目中，Pro 从未单独产出 `TEST_PLAN.md`。Flash 在实现模块时直接编写测试，测试用例由 Flash 根据 plan 中的接口定义自行设计。`TEST_PLAN.md` 在当前规模的项目中引入了不必要的文档开销。
**修复**: 增加说明：

```
TEST_PLAN.md 为可选产出。当项目模块数 > 5 或测试策略复杂时，Pro 产出此文件。
小型项目（< 5 模块）中，Flash 可自行设计测试用例，Pro 在审核时验证测试覆盖。
```

---

## 问题 7: 缺少 `test/` 目录约定

**位置**: 整个文档
**现状**: 文档未提及测试文件的存放位置。
**问题**: 实际项目中，测试文件统一放在 `test/unit/` 下，命名格式为 `{module}.test.js`。这是重要的工程约定，应在文档中体现。
**修复**: 在文档命名规范后增加一节：

```
## 测试文件约定

测试文件存放在 `test/unit/` 目录：
  test/unit/{module}.test.js   # Flash 产出：模块单元测试
  test/fixtures/*.js            # 测试数据

Flash 在实现阶段同步编写测试，Pro 审核时验证测试覆盖率。
测试框架使用 vitest（Node 端运行，不进入浏览器 bundle）。
```

---

## 问题 8: 缺少 `scripts/` 目录说明

**位置**: 整个文档
**现状**: 文档未提及构建脚本的存放位置。
**问题**: 实际项目中有 `scripts/csv2json.js` 等构建工具脚本。应在文档中约定其位置。
**修复**: 在文件结构部分增加：

```
scripts/                  # 构建工具（Node 端运行，不进入浏览器）
  csv2json.js             # CSV→JSON 数据转换
```

---

## 问题 9: 工作流步骤 8 与表 L69 命名不一致

**位置**: L126
**现状**: `产出 {module}.plan-review.md`
**问题**: 与表 L69 一致，但步骤 8 下方没有说明"Pro 审核通过后如何关闭"。流程在步骤 9 才进入审核，但步骤 8 本身没有闭环。
**修复**: 步骤 8 后增加注释：

```
→ 8.5. Pro 审核通过后写 plan-done.q.md（全部标记 [通过]）
→ 8.6. Flash 确认后重命名为 plan-done.q.done.md
```

---

## 问题 10: 缺少 `plan-review.md` 的"无问题直接通过"快速路径

**位置**: L134-146
**现状**: 审核闭环只有"有问题 → 修复 → 重审"路径，没有"无问题 → 直接 done"路径。
**问题**: 实际项目中，约 50% 的审核是无问题直接通过的。当前流程暗示每次审核都必须有 `plan-done.q.md` 文件。
**修复**: 步骤 9 改为：

```
9. Pro 审核实现代码
    → 无问题：写 plan-done.q.md（全部标记 [通过]），Flash 直接重命名为 plan-done.q.done.md
    → 有问题：写 plan-done.q.md（含 Q 项），Flash 修复后重命名
```

---

## 修复优先级

| 优先级 | 问题 | 影响 |
|--------|------|------|
| 🔴 P0 | #1 YAML frontmatter `od:` 错误 | 可能导致技能解析失败 |
| 🔴 P0 | #2 L56 文件名矛盾 | 导致 Flash 产出错误文件名 |
| 🟡 P1 | #4 `plan-done.q.done.md` 写作者 | 角色职责不清 |
| 🟡 P1 | #5 `plan.q.md` 共同写作者 | 角色职责不清 |
| 🟡 P1 | #9 步骤 8 闭环缺失 | 流程不完整 |
| 🟡 P1 | #10 快速通过路径缺失 | 增加不必要的文档开销 |
| 🟢 P2 | #3 `plan-review.md` 关闭说明 | 文档完整性 |
| 🟢 P2 | #6 TEST_PLAN.md 可选说明 | 减少不必要文档 |
| 🟢 P2 | #7 缺少 `test/` 约定 | 工程规范 |
| 🟢 P2 | #8 缺少 `scripts/` 约定 | 工程规范 |