# loot 实现审核请求

## 实现摘要

按 loot.plan.md 规格完成 LootSystem，含 CHEST_TYPES、流派偏向、三类型奖励（道具/武器/金币）。

### 新增文件
- `src/engine/loot.js` — LootSystem (~280 行)
- `test/unit/loot.test.js` — 22 用例

### 运行状态
- `npx vitest run test/unit/` — **266 全部通过**（22 loot + 23 levelup + 221 已有）
- `node -c src/engine/loot.js` — 语法检查通过

---

## 实现对照

| 验收标准 | 状态 | 说明 |
|----------|------|------|
| 精英敌人→精英宝箱 | ✅ | `spawnChest(x, y, 'elite')` |
| Boss→传奇宝箱 | ✅ | `spawnChest(x, y, 'legendary')` |
| 走近宝箱→2~3 选项 | ✅ | `pickupChest` → `generateRewards` (2/3 个) |
| 稀有度颜色正确 | ✅ | `RARITY_COLORS` + LT10 验证 |
| 选择道具→免费获得 | ✅ | `selectReward` type='item' 不扣费 |
| 选择武器→加入武器槽 | ✅ | `selectReward` type='weapon' 调用 ShopSystem 初始化 |
| 选择金币→materials 增加 | ✅ | LT13 验证 |
| 多个宝箱排队→依次显示 | ✅ | `pendingChests` 数组 + `hasPendingChests` |

---

## 模块架构

```
LootSystem
├── 宝箱生成: spawnChest(x, y, type) → pendingChests[]
├── 拾取: pickupChest(chest, player) → generateRewards()
├── 奖励生成: generateRewards(chestType, player)
│   ├── CHEST_TYPES { normal/elite/legendary }
│   │   ├── rarityWeights { common, rare, epic, legendary }
│   │   ├── itemCount (2/3/3)
│   │   └── goldRange [10-25]/[25-50]/[50-100]
│   ├── _rollRarityFromWeights(weights)
│   ├── _generateItemOption(rarity, biasWeights) ← ShopSystem.biasedSelect
│   ├── _generateWeaponOption(rarity, biasWeights) ← ShopSystem.biasedSelect
│   └── _generateGoldOption(goldRange)
├── 选择: selectReward(index, player)
│   ├── item  → ItemSystem.getItemDef → 应用 statMods
│   ├── weapon → player.weapons.push + ShopSystem 初始化
│   └── gold  → player.materials += goldAmount
├── 查询: getCurrentRewards(), hasPendingChests()
└── 重置: reset()
```

---

## 待确认问题

### Q1: 道具奖励调用 `ItemSystem.buyItem` 还是直接应用 statMods？

当前实现直接应用 statMods 并记录到 player.items，不通过 `ItemSystem.buyItem`（因为无需扣费检查）。对于 unique 道具额外调用 `ItemSystem.buyItem` 来标记已持有。

这样做是否合适？或者完全绕过 ItemSystem，全部手动管理？

### Q2: 武器奖励的 quality 初始化逻辑？

当前所有宝箱武器 reward 的 quality 固定为 'T1'，因为宝箱没有波次概念，无法用 `rollQuality(wave)`。建议：

1. 根据宝箱稀有度预设 quality：normal→T1, elite→T2, legendary→T3
2. 或统一为 T1，quality 仅通过升级获得

### Q3: 宝箱拾取后的 gameState 切换？

当前 `selectReward` 只处理奖励应用，不负责状态切换。`gameState = 'loot'` → `'playing'|'levelup'|'shopping'` 切换应由游戏层（main.js）处理。

---

## 审核请求

1. Q1 道具获取方式是否合理？
2. Q2 武器初始 quality 策略选择？
3. Q3 gameState 流转归属是否合适？
