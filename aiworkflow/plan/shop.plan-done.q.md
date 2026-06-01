# shop.plan-done.q.md — Pro 审核

---

## **[通过]** ✅ 全部验收标准

| 标准 | 验证 |
|------|------|
| 稀有度系统 (RARITY + rollRarity) | ✅ 4 级，minWave 门槛正确 |
| 保底机制 (applyPity) | ✅ 三层阈值按优先级检查，计数器更新正确 |
| 流派偏向 (biasedSelect) | ✅ 公式 `1.0 + Σ((bw[tag]-1.0)/n)` 正确 |
| 购买道具 → ItemSystem.buyItem | ✅ |
| 购买武器 → 合并/新增 | ✅ |
| 旧 CSV/标签/羁绊代码 | ✅ 全部删除 |
| 221 测试全部通过 | ✅ |

---

## Q1: `generateItems(player, wave)` 是否封装为内部状态免传参？

**[已回复] Pro 决定：保持当前设计。** 显式传参优于隐式状态。

理由：
- `this._player` 和 `this._wave` 引入隐式依赖，容易在异步/重入场景下出错
- 当前签名 `generateItems(player, wave)` 语义清晰——调用方明确知道需要什么
- 调用方（main.js）已经持有这两个值，不需要额外状态管理

---

## Q2: `_affixHighlights` + `setTimeout` 已移除——UI 层替代方案？

**[已回复] Pro 决定：正确。** UI 关注点不应在 ShopSystem 中。

替代方案：
- 武器合并后，`buyItem` 返回 `{ action: 'merged', weaponId, ... }` — UI 读取 `action` 字段决定是否显示合并动画
- 词条变化的视觉反馈由 UI 层比较 `player.weapons` 前后差异实现
- 如果必须有时效性动画，在 UI 层用 `requestAnimationFrame` 或 CSS transition

---

## Q3: 武器槽位简化为 `weapons.length >= weaponSlots`

**[已回复] Pro 决定：接受。** weapons.json 当前所有武器 `slots=1`，简化无实际影响。

后续需要时改回累加检查：
```js
const usedSlots = player.weapons.reduce((sum, w) => {
    const def = this.getWeaponDef(w.id);
    return sum + (def ? def.slots : 1);
}, 0);
```

---

## 额外确认

### applyPity() 阈值逻辑 ✅

```js
sinceLastLegendary >= 20 → legendary
sinceLastEpic >= 10      → at least epic (unless already legendary)
sinceLastRare >= 3       → at least rare (unless already epic+)
```

优先级从高到低检查，高稀有度触发时低阈值不降级。正确。

### biasedSelect() 权重公式 ✅

```
weight = 1.0 + Σ((biasWeight[tag] - 1.0) / tags.length)
```

多标签物品每个标签贡献相等份额。单标签物品：`weight = 1.0 + (biasWeight[tag] - 1.0) = biasWeight[tag]`。正确。

---

## 无遗漏边缘情况

快速检查：
- [x] `biasedSelect` pool 为空 → 返回 null ✅
- [x] `rollRarity` 无可用稀有度 → 返回 'common' ✅
- [x] `applyPity` 计数器初始化处理 (`|| 0`) ✅
- [x] `generateItems` 武器池消耗后去重 ✅
- [x] `buyItem` unique 重复购买拦截 ✅
- [x] `reroll` 金币不足拦截 ✅

---

## 总结

| 项 | 结果 |
|----|------|
| Q1 显式传参 | ✅ 保持 |
| Q2 highlight 移除 | ✅ UI 层替代 |
| Q3 槽位简化 | ✅ 接受 |
| applyPity 逻辑 | ✅ 正确 |
| biasedSelect 公式 | ✅ 正确 |
| 边缘情况 | ✅ 无遗漏 |

**批准。** 无需修改。重命名为 `shop.plan-done.q.done.md`，继续推进 levelup.js。