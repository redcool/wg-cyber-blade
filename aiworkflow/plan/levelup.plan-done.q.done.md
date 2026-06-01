# levelup 实现审核请求

## 实现摘要

按 levelup.plan.md 规格完成 LevelUpSystem，数据驱动 + 流派偏向。

### 新增文件
- `src/data/levelUpCards.json` — 33 张卡（生存8 + 输出11 + 机动4 + 经济4 + 特殊5 + 武器3 + 被动3）
- `src/engine/levelup.js` — LevelUpSystem (~280 行)
- `test/unit/levelup.test.js` — 23 用例

### 运行状态
- `npx vitest run test/unit/` — **266 全部通过**（23 levelup + 22 loot + 221 已有）
- `node -c src/engine/levelup.js` — 语法检查通过

---

## 实现对照

| 验收标准 | 状态 | 说明 |
|----------|------|------|
| `levelUpCards.json` 30+ 张，覆盖 6 类属性 | ✅ | 33 张卡：survival 8, offense 11, mobility 4, economy 4, special 5, weapon 3, passive 3 |
| `generateCards()` 返回 3~5 张不重复 | ✅ | L3~L5 验证数量范围 + 唯一性 |
| 流派偏向：流派卡概率 +25% | ✅ | `_selectCard` 用 `biasStrength=0.25` 计算 `baseWeight × avgBias` |
| `applyCard()` statMods add/mult | ✅ | L9~L12 验证两种模式 |
| 武器等级升级 | ✅ | L14 验证 `weapon.level++` + `ShopSystem._updateWeaponParams` |
| 被动技能注册到 PassiveSystem | ✅ | L16 验证 `PassiveSystem.register` 被调用 |
| 稀有度正确 | ✅ | RARITY_WEIGHT 常量控制，卡 JSON 有 rarity 字段 |
| stats.js `levelUpOptions` 保留 `@deprecated` | ✅ | 未删除，仅新增 LevelUpSystem |

---

## 模块架构

```
LevelUpSystem
├── 数据加载: loadCards() → DataLoader.load('levelUpCards')
├── 卡牌生成: generateCards(player) → 3~5 加权选择
│   ├── _selectCard(pool, biasWeights)  ← TagSystem.getBiasWeights(0.25)
│   └── RARITY_WEIGHT { common:60, rare:25, epic:10, legendary:5 }
├── 应用: applyCard(cardId, player)
│   ├── _applyStatMods(statMods, player)  ← add / mult
│   ├── _applyWeaponLevelUp(player)       ← 随机武器 level++
│   ├── _applyWeaponQualityUp(player)     ← 随机武器 T1→T2→T3→T4
│   ├── _applyWeaponSlotUp(player)        ← weaponSlots++
│   └── _applyAddPassive(id, player)      ← PassiveSystem.register
├── 查询: getCurrentCards()
└── 重置: reset()
```

---

## 待确认问题

### Q1: 卡牌选择权重公式——通用卡 vs 流派卡的计算是否合理？

当前：
- 通用卡 (tags=[])：`weight = RARITY_WEIGHT[rarity]`（仅稀有度权重）
- 流派卡 (tags 非空)：`weight = RARITY_WEIGHT[rarity] × avg(biasWeights[tags])`

biasWeights 中匹配标签的为 1.0~1.25，因此流派卡权重 ≈ 1.125 × 稀有度权重。这确保流派卡出现概率略高但不会压倒性的。

### Q2: `_generatedIds` 使用 Set 记录本局已生成的卡——何时重置？

当前设计：`generateCards()` 每次调用前不清空 Set，确保本局内不重复出现同一张卡。`reset()` 清空 Set（通常在新游戏时调用）。这符合"本局内不重复"的需求。

如需要"波次内不重复"而非"整局不重复"，需改为 generateCards 调用前清空。

---

## 审核请求

1. 卡牌池 33 张是否足够？需增加？
2. `_generatedIds` 生命周期策略是否合适？（整局不重复 vs 波次不重复）
3. 被动技能集成方式是否合理？（`PassiveSystem.register(id, 'levelup', player)`）
