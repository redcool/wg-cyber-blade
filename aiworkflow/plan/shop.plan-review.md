# shop 实现审核请求

## 实现摘要

按 shop.plan.md 规格完成 ShopSystem v2，保留旧版武器品质/词条/合并逻辑，新增稀有度/保底/流派偏向。

### 新增文件
- `src/engine/shop.js` — ShopSystem (约 680 行)
- `test/unit/shop.test.js` — 53 用例

### 运行状态
- `npx vitest run test/unit/` — **221 全部通过**（53 shop + 168 已有）
- `node -c src/engine/shop.js` — 语法检查通过

---

## 实现对照

| 验收标准 | 状态 | 说明 |
|----------|------|------|
| 商店正确显示 3~5 武器 + 3~5 道具 | ✅ | `generateItems(player, wave)` 随机 3~5 件/类 |
| 稀有度颜色正确（灰/蓝/紫/橙） | ✅ | `RARITY.color` 定义完整 |
| 保底机制：3次必rare, 10次必epic, 20次必legendary | ✅ | `applyPity()` 三层阈值按优先级检查 |
| 流派偏向：Build Tag 权重 +20% | ✅ | `biasedSelect()` + `TagSystem.getBiasWeights()` |
| 购买道具 → `ItemSystem.buyItem()` 被调用 | ✅ | S36 验证 spy 调用 |
| 购买武器 → 正确加入武器槽/合并 | ✅ | S33 (新增) + S34 (合并) 验证 |
| 刷新成本固定为 2 金币 | ✅ | S25 + S29 验证 |
| 旧 CSV 解析代码全部删除 | ✅ | `splitCSVLine, loadWeaponTable, _parseWeaponCSV, loadItemTable, _parseItemCSV` 全部移除 |
| 旧标签/羁绊代码全部删除 | ✅ | `_itemApplyFunctions, tagInfo, synergyDefs, getTagCounts, getActiveSynergies` 全部移除 |

---

## 模块架构

```
ShopSystem
├── 稀有度系统: RARITY, rollRarity(), applyPity()
├── 流派偏向: biasedSelect()
├── 数据加载: loadData()
├── 商品生成: generateItems(), reroll()
├── 购买: buyItem()
├── 武器管理: getWeaponDef(), mergeWeapons(), sellWeapon()
│   ├── qualityDefs, rollQuality() — 保留旧 T1~T4
│   └── affixDefs, _rollAffix() — 保留旧词条系统
└── 重置: reset()
```

### 保留的旧代码
- `qualityDefs` + `rollQuality()` (T1~T4 内部品质)
- `affixDefs` + `_rollAffix()` (武器词条)
- `mergeWeapons()` + `_updateWeaponParams()` (武器管理)
- `getRerollCost()`, `rerollAffixes()` (词条重铸)

### 删除的旧代码
- `splitCSVLine()`, `loadWeaponTable()`, `_parseWeaponCSV()`, `loadItemTable()`, `_parseItemCSV()`
- `_itemApplyFunctions`, `tagInfo`, `synergyDefs`, `getTagCounts()`, `getActiveSynergies()`

---

## 待确认问题

### Q1: `generateItems()` 当前需传入 `player` 和 `currentWave` 参数，reroll 也需 wave 参数。是否建议封装为内部状态免传参？

当前设计：
```js
ShopSystem.generateItems(player, currentWave);
// 获取 player.weapons/player.items 计算流派偏向
// 使用 currentWave 决定稀有度可用范围
```

备选方案：在 `reroll(player, currentWave)` 内部存储 `this._player` 和 `this._wave`，`generateItems()` 读取内部状态。这样做的好处是 `generateItems()` 签名更简洁，坏处是增加了隐式状态。

### Q2: `_applyMergeWithHighlights()` 中的 highlight 逻辑（setTimeout）已移除——这是 UI 关注点，需在游戏层绑定替代方案？

当前实现仅保留数值合并逻辑，删除了 `_affixHighlights` 和 `setTimeout`。UI 层如需合并动画，应监听 `player.weapons` 变化来实现。

### Q3: 武器槽位检查逻辑——每个武器占 1 槽（slot=1），与旧 shop.js 的 `def.slots` 字段不完全一致？

当前实现简化为 `weapons.length >= weaponSlots`。旧代码检查 `def.slots` 累加和。考虑到 weapons.json 中 `slots` 字段存在但始终为 1（目前所有武器 slots=1），建议后续需要多样插槽时再精确实现。

---

## 审核请求

1. Q1/Q2/Q3 的回复
2. `applyPity()` 的阈值逻辑是否正确？（sinceLastRare≥3 / sinceLastEpic≥10 / sinceLastLegendary≥20）
3. `biasedSelect()` 权重公式是否符合预期？（weight = 1.0 + Σ((biasWeight[tag] - 1.0) / tags.length)）
4. 是否有遗漏的边缘情况？
