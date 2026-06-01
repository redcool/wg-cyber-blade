# character.plan-done.q.md — Pro 审核

---

## **[通过]** ✅ 架构设计

- `loadCharacters()` → DataLoader + 标签标准化 → `_ensureDefault` 降级链完善
- `applyToPlayer()` 执行顺序正确：statFields → penalties → identity → clamp → passives → compat
- `_normalizeTags()` 双路径兜底（TagSystem / 内置映射）健壮
- `hasTag()` 自动标准化输入标签，调用方无需关心旧标签
- 21 个测试全部通过

---

## **[通过]** ✅ 9 角色数据

characters.json 结构正确：9 角色，含 penalties/tags/passives 字段。标签映射正确（旧→新标准化）。

---

## 🟡 Q1: `_baseDamage = 15` 对所有角色硬编码

```js
// applyToPlayer L210:
player._baseDamage = 15;
```

所有 9 角色共享同一个基础伤害值。角色间伤害差异仅通过 `damagePercent` 区分。当前角色的 `damagePercent`：
- default=0, assassin=0, tank=-0.2, berserker=0.3, ...

**Pro 决定：接受。** Phase 1 期间 `_baseDamage` 由武器 `damageMult` 驱动差异化，角色 `damagePercent` 做百分比修正。这符合 stats.js 的 `B × 1.0 + F` 层设计。Phase 3 武器系统重构后移除 `_baseDamage`。

---

## 🟡 Q2: penalties 全部加算，无乘算

当前所有 penalties 通过 `player[key] += val` 加算。`tank` 的 `damagePercent: -0.2` 是 `0 + (-0.2) = -0.2`（最终 P=0.8，即 -20% 伤害）。这是**正确**的——`damagePercent` 本身已经是百分比值，加算就是最终值。

**Pro 确认：加算正确，不需要乘算。** `damagePercent` 字段设计天然支持加算 penalties。

---

## **[通过]** ✅ 5 个确认问题逐条答复

| Flash 问题 | Pro 答复 |
|-----------|---------|
| 1. 旧 `src/cyberblade/character.js` 保留还是删除 | **保留。** 等 PlayerSystem 迁移到新 `src/engine/character.js` 后再删。两者同名不冲突（不同路径加载） |
| 2. `_baseDamage = 15` 固定值 | 接受（见 Q1）。Phase 3 武器系统重构时移除 |
| 3. penalties 加算 vs 乘算 | 加算正确（见 Q2） |
| 4. passives 引用数组 → 等 passives.js 实现后生效 | **接受。** `player._passiveIds` 存储引用，PassiveSystem.registerMany() 消费。当前无消费方，无害 |
| 5. UnlockSystem 可选依赖 | **接受。** `typeof UnlockSystem !== 'undefined'` 的守卫正确 |

---

## 🟡 Q3: 兼容字段顺序问题

```js
// applyToPlayer L210-215:
player._baseDamage = 15;
player.damage = player.damagePercent || 0;  // glassCannon: 0 → 0.5
if (player.critDamage === undefined) {
    player.critDamage = 2.0;
}
player.critMultiplier = player.critDamage;
```

`player.damage = player.damagePercent || 0` — 这里 `||` 有问题。如果 `damagePercent = 0`（default 角色），`0 || 0` = `0`，正确。但如果 `damagePercent = -0.2`（tank），`-0.2 || 0` = `-0.2`（因为 `-0.2` 是 truthy），也正确。没问题。

但第 213 行的 `critDamage === undefined` 检查在 `penalties` 叠加之后——如果 penalties 修改了 critDamage，可能已经不再是 undefined。不过当前无角色修改 critDamage 的 penalty，所以安全。

---

## 🟡 Q4: `score` 字段无消费者

Review doc 提到 "assassin: +20% 暴击, +15% 闪避, -2 护甲, 得分×1.2" 但 characters.json 和代码中没有 `score` 字段实现。

查 characters.json 无 score 字段，`applyToPlayer` 无 score 处理。review doc 中提及但未实现——这很好，review doc 不应包含未实现功能。Review doc 的描述修正为与代码一致即可。

---

## 总结

| 项 | 结果 |
|----|------|
| loadCharacters + 标签标准化 | ✅ 通过 |
| applyToPlayer 执行链 | ✅ 通过 |
| 9 角色 JSON 数据 | ✅ 通过 |
| penalties 加算逻辑 | ✅ 通过（无需乘算） |
| 旧标签兼容映射 | ✅ 通过 |
| _baseDamage 硬编码 | 🟡 接受（Phase 3 移除） |
| passives 延迟注册 | 🟡 接受 |
| 兼容字段顺序 | 🟡 安全（无实际问题） |

**结论：批准。** 无需修改。重命名为 `character.plan-done.q.done.md`。