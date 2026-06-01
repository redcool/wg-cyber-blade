# integration.plan.q.md — 疑问清单

## Q1: DataLoader.preloadAll() 与 loadXxx() 是否重复？

**[已回复]** Pro 确认：不会重复。

`DataLoader.preloadAll()` 的内部实现是 `Promise.all(['characters','weapons','items','enemies','bosses','waves'].map(n => this.load(n)))`。`load()` 方法第一步检查 `_cache[name]`，命中直接返回 Promise.resolve。

所以后续 8 个模块的 `loadXxx()` 调用 `DataLoader.load('characters')` 时，全部命中缓存，零网络请求。**preloadAll 的作用是并行预热，loadXxx 只是取缓存。** 不冲突。

---

## Q2: CharacterSystem.selectedCharacterId 从哪来？

**[已回复]** Pro 确认：已存在。

`engine/character.js` L31：
```js
selectedCharacterId: 'default',
```

UI 选角界面调用 `CharacterSystem.select(id)` 修改此值。`applyToPlayer` 读取此值作为默认角色。流程：

```
UI 选角 → CharacterSystem.select('pyromancer')
        → selectedCharacterId = 'pyromancer'
startGame → CharacterSystem.applyToPlayer(p, CharacterSystem.selectedCharacterId)
```

---

## Q3: ShopSystem.getWeaponDef / _initWeaponAffixes 存在吗？

**[已回复]** Pro 确认：两个方法都存在。

- `getWeaponDef(id)` → `engine/shop.js` L467，从 `DataLoader._cache.weapons` 查找
- `_initWeaponAffixes(weapon)` → `engine/shop.js` L591，给武器加随机词缀

startGame 中从外部调用 `_initWeaponAffixes` 是因为武器初始化需要随机词缀——虽然前缀 `_` 表示私有，但模块间调用在 JS 全局命名空间模式下是常见的。后续如果要严格封装，可以暴露一个 `initWeapon(weapon)` 公共方法。

---

## Q4: 同步加成应用的具体方案？

**[已回复]** Pro 确认：需要写辅助函数。旧逻辑在 `cyberblade/player.js._updateSynergies()`。

**实现方案：**

1. 在 `engine/stats.js` 或 `engine/tags.js` 中新增一个 `applyBonuses(player, bonuses)` 方法
2. 将旧的 `_updateSynergies` 中的加/乘逻辑提取到该方法
3. startGame 流程中调用：

```js
const synergies = TagSystem.getActiveSynergies(p.weapons);
const bonuses = TagSystem.mergeSynergyBonuses(synergies);
TagsSystem.applyBonuses(p, bonuses);  // 或写在 stats.js
```

具体执行时参考旧 `_updateSynergies` 中的逻辑（`damageMult` → `p.damage *= (1+val)`, `armorAdd` → `p.armor += val` 等）。

**注意：** Phase 4 保留旧 `_updateSynergies` 不动（仍被旧代码路径调用），新增 `applyBonuses` 供新流程使用。等全部稳定后统一清理。

---

## Q5: 宝箱开完后如何回到流转逻辑？

**[已回复]** Pro 决定：LootSystem 加回调。

当前 `LootSystem.selectReward` 应用奖励后只是把当前宝箱从队列移除。开完最后一个宝箱后没有通知。

**方案：** 在 `LootSystem` 中加 `onAllChestsOpened` 回调：

```js
// LootSystem:
onAllChestsOpened: null,  // 由 main.js 设置

selectReward(index, player) {
    // ... 应用奖励 ...
    if (this.pendingChests.length === 0 && this.onAllChestsOpened) {
        this.onAllChestsOpened();
    }
}
```

main.js 中：
```js
LootSystem.onAllChestsOpened = () => {
    if (GameEngine.levelUpPending) {
        GameEngine.state = 'levelup';
        LevelUpSystem.generateCards(PlayerSystem.player);
        UISystem.showLevelUp();
    } else {
        GameEngine.state = 'shopping';
        UISystem.showShop();
    }
};
```

---

## Q6: Boss 死亡双重掉落风险？

**[已回复]** Pro 确认：你的分析完全正确。Boss 不进入 `EnemySystem.enemies` 数组，`_handleEnemyKill` 中的 `isBoss` 分支永远走不到。

**Pro 决定：删除 `_handleEnemyKill` 中的 isBoss 分支。** 理由：
- 死代码，永远不会执行
- 保留会造成代码阅读误解
- Boss 宝箱由 `BossSystem.destroy()` 统一管理

---

## Q7: StatsSystem.calcDamage 签名和返回格式？

**[已回复]** Pro 确认：

```js
// engine/stats.js L174:
calcDamage(weapon, player, target)
// weapon  — 武器定义对象 { damageMult, tag, ... }
// player  — 玩家属性对象
// target  — 目标对象（可为 null，不传 S 层特殊倍率）

// 返回: number（整数伤害）
// 副作用: 设置 player._lastCrit = true/false
```

11 处 `_fireXXX` 迁移时：
```js
// 旧:
const dmg = this._calcDamage(params.damageMult);
// 新:
const dmg = StatsSystem.calcDamage(weaponDef, p, target);

// weaponDef 从 _updateAutoAttack / _fireWeapon 传入
// target 已经是现有参数
```

---

## Q8: PlayerSystem.update 参数兼容？

**[已回复]** Pro 确认：Phase 4 **不改** `PlayerSystem.update(dt, enemies)` 签名。

当前 `cyberblade/player.js` 的 `update(dt, enemies)` 签名保持不变——它只是在这个文件里，而我们在 Phase 4 只修改 player.js 的内部实现（calcDamage 迁移 + 事件钩子），不改外部签名。

main.js 中调用 `PlayerSystem.update(dt, EnemySystem.enemies)` 也是兼容的——新 `EnemySystem.enemies` 仍然是数组，类型不变。

---

## Q9: csv.js 删除是否安全？

**[已回复]** Pro 确认：安全，但有前提条件。

`splitCSVLine` 当前在 3 个旧模块中被引用：
- `cyberblade/character.js` — 将被注释
- `cyberblade/enemy.js` — 将被注释
- `cyberblade/shop.js` — 将被注释

**删除顺序：** 先注释 4 个旧 cyberblade 模块的 `<script>` 标签（index.html 第一步），再删除 `csv.js`。不能反过来——如果先删 csv.js 但旧模块还在加载，会报 `splitCSVLine is not defined`。

---

## Q10: 4 个文件改动的执行顺序？

**[已回复] Pro 决定：分步执行。**

| 步骤 | 文件 | 原因 |
|------|------|------|
| 1 | `index.html` | 先加载新模块，注释旧模块。此时游戏不崩（新模块只是 loaded，未被调用） |
| 2 | `main.js` | 接入新系统。此时 player.js/ui.js 仍用旧逻辑，可能部分功能不正确但不会 JS 报错 |
| 3 | `player.js` | calcDamage 迁移 + 事件钩子 |
| 4 | `ui.js` | 稀有度颜色 + Boss HP + 羁绊渲染 |

**每步完成后测试：** `npm test`（单元测试已覆盖全部模块），然后手动打开 index.html 验证游戏启动。

**不可一次改完最后测**——4 个文件改动量大，一次改完出问题很难定位是哪个文件的错。

---

## Q11: 旧文件回滚策略？

**[已回复] Pro 决定：index.html 中注释保持原样。**

```html
<!-- [DEPRECATED Phase 4] 旧模块，已替换为 engine/ 下同名模块 -->
<!-- <script src="src/cyberblade/character.js?v=7.0"></script> -->
<!-- <script src="src/cyberblade/enemy.js?v=7.0"></script> -->
<!-- <script src="src/cyberblade/wave.js?v=7.0"></script> -->
<!-- <script src="src/cyberblade/shop.js?v=7.0"></script> -->
```

不回滚到 `old/` 目录——注释在 HTML 中即可翻看、即可取消注释回滚。简单高效。等 Phase 4 稳定运行一周后再清理文件。

---

## 已明确的条目

- **Q1~Q11**: 全部 **[已回复]** ✅