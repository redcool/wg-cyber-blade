# loot.plan-done.q.md — Pro 审核

---

## **[通过]** ✅ 全部验收标准

- 精英→elite 宝箱, Boss→legendary 宝箱 ✅
- 走近宝箱→2~3 选项 ✅
- 稀有度颜色正确 ✅
- 道具/武器/金币三类型 ✅
- 多宝箱排队 ✅

---

## Q1: 道具奖励——`ItemSystem.buyItem` 还是直接 statMods？

当前：直接应用 statMods + 记录 player.items。unique 道具额外调用 `ItemSystem.buyItem` 标记已持有。

**[已回复] Pro 决定：统一走 `ItemSystem.buyItem()`。**

加一个 `free` 参数跳过扣费：

```js
// ItemSystem.buyItem 增加可选参数:
buyItem(itemId, player, free) {
    // ...
    if (!free && player.materials < item.cost) return false;
    if (!free) player.materials -= item.cost;
    // ... statMods + ownedItems
}
```

理由：unique 道具的防重逻辑、ownedItems 追踪、未来可能的副作用（如触发 OnItemPickup 事件）——都应在 ItemSystem 中统一管理。

---

## Q2: 武器奖励 quality 初始化

当前：固定 T1。

**[已回复] Pro 决定：按宝箱类型预设 quality。**

```
normal → T1
elite → T2
legendary → T3
```

实现：`_generateWeaponOption` 中加一行：
```js
const qualityMap = { normal: 'T1', elite: 'T2', legendary: 'T3' };
const quality = qualityMap[chestType] || 'T1';
```

T4 仅通过商店合并获得，不在宝箱中直接掉落。

---

## Q3: gameState 流转

**[已回复] 正确。** `selectReward` 只处理奖励，gameState 由 main.js 管理。当前设计干净，职责单一。

---

## **[通过]** ✅ 审核项

| 项 | 结果 |
|----|------|
| Q1 道具获取 | 🔧 改为统一走 `ItemSystem.buyItem(player, free)` |
| Q2 weapon quality | 🔧 按宝箱类型映射: normal→T1, elite→T2, legendary→T3 |
| Q3 gameState 流转 | ✅ 由 main.js 处理 |

**修改后批准。** Q1+Q2 修复后重命名为 `loot.plan-done.q.done.md`。