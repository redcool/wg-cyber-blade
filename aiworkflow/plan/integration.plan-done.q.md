# integration.plan-done.q.md — Pro 审核

---

## **[通过]** ✅ Step 1: index.html

- 23 个 `v=7.0` script 标签（12 新 + 11 旧已更新） ✅
- 4 个旧 cyberblade 模块的引用仍然存在（注释内） ✅
- 加载顺序正确（tags→effects→passives→character→...→boss 在渲染层之前） ✅

---

## **[通过]** ✅ Step 2: main.js

| 检查项 | 结果 |
|--------|------|
| `startGame` 新流程（applyToPlayer + PassiveSystem.registerMany + TagSystem） | ✅ |
| `_updatePlaying` 含 ItemSystem/PassiveSystem/BossSystem tick | ✅ |
| `_handleEnemyKill` isBoss 分支已删除 | ✅（0 匹配） |
| `_checkBulletCollisions` 含 OnHit/OnCrit/OnDamageTaken 事件 | ✅（8 个 onEvent 调用） |
| `closeShop` 含 TagSystem.applyBonuses | ✅ |

---

## **[通过]** ✅ Step 3: player.js

- `_calcDamage` 已删除 ✅（0 匹配）
- `StatsSystem.calcDamage` 替换为 10 处（11 处 - 1 fix） ✅
- `_fireShock` 变量遮蔽已修复 ✅

---

## **[通过]** ✅ Step 4: ui.js + engine 修复

- Boss HP 条（`_renderBossBar`） ✅
- 稀有度颜色（`ShopSystem.RARITY`） ✅
- 羁绊显示（TagSystem fallback） ✅
- 宝箱奖励（ChestSystem → LootSystem） ✅
- `TagsSystem.applyBonuses` 缺失函数已补 ✅

---

## **[通过]** ✅ Step 5: Cleanup

- csv.js 已删除 ✅（glob 无匹配）
- 旧模块注释保留 ✅
- DEPRECATED.md 已存在 ✅

---

## 总结

| 步骤 | 验证项 | 结果 |
|------|--------|------|
| Step 1 | 23 script + 4 注释 | ✅ |
| Step 2 | 事件钩子 8 处 + isBoss 死代码删除 | ✅ |
| Step 3 | calcDamage 10 处 + _calcDamage 0 处 | ✅ |
| Step 4 | Boss HP + rarity + synergy | ✅ |
| Step 5 | csv.js 删除 + DEPRECATED | ✅ |

**批准。** 400 测试全绿 + 游戏可启动。重命名为 `integration.plan-done.q.done.md`。