# Phase 4: 整合 + 打磨 — 集成计划

**依赖**: 全部 15 个模块实现完成
**执行顺序**: 16（先改 index.html → 再改 main.js → 再改 player.js → 再改 ui.js → 清理旧文件）

---

## 一、加载顺序（index.html）

### 1.1 当前状态

```html
<!-- engine/ (12 files) -->
<script src="src/engine/save.js"></script>
<script src="src/engine/time.js"></script>
<script src="src/engine/input.js"></script>
<script src="src/engine/stats.js"></script>       <!-- v3 已覆盖 -->
<script src="src/engine/data.js"></script>        <!-- v3 已覆盖 -->
<script src="src/engine/assets.js"></script>
<script src="src/engine/audio.js"></script>
<script src="src/engine/particle.js"></script>
<script src="src/engine/bullet.js"></script>
<script src="src/engine/combatlog.js"></script>
<script src="src/engine/renderer.js"></script>
<script src="src/engine/engine.js"></script>

<!-- cyberblade/ (8 files) -->
<script src="src/cyberblade/unlock.js"></script>
<script src="src/cyberblade/character.js"></script>   <!-- 旧，需替换 -->
<script src="src/cyberblade/player.js"></script>
<script src="src/cyberblade/enemy.js"></script>       <!-- 旧，需替换 -->
<script src="src/cyberblade/wave.js"></script>         <!-- 旧，需替换 -->
<script src="src/cyberblade/shop.js"></script>         <!-- 旧，需替换 -->
<script src="src/cyberblade/ui.js"></script>
<script src="src/cyberblade/main.js"></script>
```

### 1.2 目标状态

```html
<!-- engine/ — 基础层 -->
<script src="src/engine/save.js"></script>
<script src="src/engine/time.js"></script>
<script src="src/engine/input.js"></script>
<script src="src/engine/data.js"></script>
<script src="src/engine/stats.js"></script>

<!-- engine/ — 系统层（按依赖顺序） -->
<script src="src/engine/tags.js"></script>
<script src="src/engine/effects.js"></script>
<script src="src/engine/passives.js"></script>
<script src="src/engine/character.js"></script>
<script src="src/engine/item.js"></script>
<script src="src/engine/shop.js"></script>
<script src="src/engine/levelup.js"></script>
<script src="src/engine/loot.js"></script>
<script src="src/engine/enemy.js"></script>
<script src="src/engine/wave.js"></script>
<script src="src/engine/boss.js"></script>

<!-- engine/ — 渲染层 -->
<script src="src/engine/assets.js"></script>
<script src="src/engine/audio.js"></script>
<script src="src/engine/particle.js"></script>
<script src="src/engine/bullet.js"></script>
<script src="src/engine/combatlog.js"></script>
<script src="src/engine/renderer.js"></script>
<script src="src/engine/engine.js"></script>

<!-- cyberblade/ — 游戏层 -->
<script src="src/cyberblade/unlock.js"></script>
<!-- 旧 character.js 不再加载 -->
<script src="src/cyberblade/player.js"></script>
<!-- 旧 enemy.js 不再加载 -->
<!-- 旧 wave.js 不再加载 -->
<!-- 旧 shop.js 不再加载 -->
<script src="src/cyberblade/ui.js"></script>
<script src="src/cyberblade/main.js"></script>
```

**执行：** 在 index.html 中：
1. stats.js 之后插入 12 个新 `<script>` 标签
2. 注释掉 4 个旧 cyberblade 引用（保留标签便于回滚）
3. 版本号统一 bump 到 `v=7.0`

---

## 二、main.js 集成点

### 2.1 数据预加载

```js
// startGame 之前调用:
await DataLoader.preloadAll();                      // 加载全部 JSON
await Promise.all([
    CharacterSystem.loadCharacters(),               // 角色数据
    ItemSystem.loadItems(),                         // 道具数据
    PassiveSystem.loadPassives(),                   // 被动数据
    LevelUpSystem.loadCards(),                      // 升级卡数据
    ShopSystem.loadData(),                          // 武器+道具
    EnemySystem.loadEnemies(),                      // 敌人数据
    WaveSystem.loadWaves(),                         // 波次数据
    BossSystem.loadBosses(),                        // Boss 数据
]);
```

### 2.2 游戏启动流程

```js
GameEngine.startGame = function(startWeaponId) {
    // 1. 重置所有新系统
    PlayerSystem.reset();
    EnemySystem.clear();       // → 新 EnemySystem
    WaveSystem.reset();        // → 新 WaveSystem
    BossSystem.clear();        // → 新 BossSystem
    ItemSystem.reset();
    PassiveSystem.reset();
    ShopSystem.reset();
    LevelUpSystem.reset();
    LootSystem.reset();
    BulletSystem.clear();
    ParticleSystem.clear();
    CombatLogSystem.clear();
    GameWorld.materials = [];
    this.levelUpPending = false;

    // 2. 创建玩家
    PlayerSystem.create(GameWorld.width / 2, GameWorld.height / 2);
    const p = PlayerSystem.player;

    // 3. 应用角色属性（新 CharacterSystem）
    CharacterSystem.applyToPlayer(p, CharacterSystem.selectedCharacterId);

    // 4. 注册角色被动
    if (p._passiveIds && p._passiveIds.length > 0) {
        PassiveSystem.registerMany(p._passiveIds, 'character', p);
    }

    // 5. 装备初始武器
    if (startWeaponId) {
        const def = ShopSystem.getWeaponDef(startWeaponId);
        if (def) {
            p.weapons = [{ id: startWeaponId, level: 1, quality: 'T1' }];
            ShopSystem._initWeaponAffixes(p.weapons[0]);
            ShopSystem._updateWeaponParams(p, startWeaponId);
        }
    }

    // 6. 计算初始羁绊
    const synergies = TagSystem.getActiveSynergies(p.weapons);
    const merged = TagSystem.mergeSynergyBonuses(synergies);
    // 应用 merged 到 player（复用旧 _updateSynergies 逻辑或直接调 TagSystem 内方法）

    // 7. 开始第一波
    WaveSystem.startNextLevel();
    this.state = 'playing';
    this.announceTimer = 1.5;
    UISystem.showHUD();

    // 8. 启动音频
    AudioSystem.init();
    AudioSystem.stopBGM();
    AudioSystem.startBGM();

    // 9. UI 切换
    document.getElementById('menuOverlay').classList.add('hidden');
    document.getElementById('gameOverOverlay').classList.add('hidden');
    UISystem.hideShop();
    UISystem.hideLevelUp();
};
```

### 2.3 游戏更新循环

```js
GameEngine._updatePlaying = function(dt) {
    const player = PlayerSystem.player;
    if (!player) return;

    Input.clearJustPressed();

    // 1. 被动 + 道具系统更新（每帧 tick）
    PassiveSystem.update(dt, player);
    ItemSystem.update(dt, player);

    // 2. 玩家更新
    PlayerSystem.update(dt, EnemySystem.enemies);

    // 3. 死亡检查
    if (!player.alive) {
        ParticleSystem.explosion(player.x, player.y, '#00ffff', 30);
        this.state = 'gameover';
        setTimeout(() => UISystem.showGameOver(), 500);
        return;
    }

    // 4. 敌人 + Boss 更新
    EnemySystem.update(dt, player);
    BossSystem.update(dt, player);

    // 5. 子弹 + 碰撞
    BulletSystem.update(dt);
    this._checkBulletCollisions(player);

    // 6. 波次更新
    WaveSystem.update(dt, player);

    // 7. 其他
    ParticleSystem.update(dt);
    CombatLogSystem.update(dt);
    UISystem.updateHUD();

    // 8. 波次过渡
    if (WaveSystem.waveTransitioning) {
        // 商店/升级/宝箱 流转逻辑
        ShopSystem.generateItems(player, WaveSystem.currentLevel);
        if (LootSystem.hasPendingChests()) {
            this.state = 'loot';
            // LootSystem 展示下一个宝箱
        } else if (this.levelUpPending) {
            this.levelUpPending = false;
            this.state = 'levelup';
            LevelUpSystem.generateCards(player);
            UISystem.showLevelUp();
        } else {
            this.state = 'shopping';
            UISystem.showShop();
        }
    }
};
```

### 2.4 击杀处理

```js
GameEngine._handleEnemyKill = function(enemy, damage) {
    const p = PlayerSystem.player;
    if (!p) return;

    p.kills++;

    // 触发 OnKill 事件
    ItemSystem.onEvent('OnKill', p, { target: enemy, damage });
    PassiveSystem.onEvent('OnKill', p, { target: enemy, damage });

    // XP
    if (PlayerSystem.addXP(enemy.xpValue)) {
        this.levelUpPending = true;
    }

    // 吸血
    if (p.lifeSteal > 0) {
        PlayerSystem.heal(Math.floor(damage * p.lifeSteal));
    }

    // 掉落
    this._dropMaterials(enemy);

    // 宝箱
    if (enemy.isBoss) {
        LootSystem.spawnChest(enemy.x, enemy.y, 'legendary');
    } else if (enemy.isElite) {
        LootSystem.spawnChest(enemy.x, enemy.y, 'elite');
    }

    CombatLogSystem.logKill(enemy.name);
    ParticleSystem.enemyDeath(enemy.x, enemy.y, enemy.glowColor);
};
```

---

## 三、player.js 集成点

### 3.1 calcDamage 迁移

11 处 `this._calcDamage(params.damageMult)` → `StatsSystem.calcDamage(weaponDef, p, target)`

每个 `_fireXXX` 方法需要接收 `weaponDef` 参数。`_updateAutoAttack` / `_fireWeapon` 调用时传入。

### 3.2 事件触发

```js
// 攻击命中时:
ItemSystem.onEvent('OnHit', p, { target: enemy, damage: dmg });
PassiveSystem.onEvent('OnHit', p, { target: enemy, damage: dmg });

// 暴击时:
if (p._lastCrit) {
    ItemSystem.onEvent('OnCrit', p, { target: enemy, damage: dmg });
    PassiveSystem.onEvent('OnCrit', p, { target: enemy, damage: dmg });
}

// 玩家受击时:
ItemSystem.onEvent('OnDamageTaken', p, { attacker, damage: actualDmg });
PassiveSystem.onEvent('OnDamageTaken', p, { attacker, damage: actualDmg });

// 闪避时:
ItemSystem.onEvent('OnDodge', p, { attacker });
PassiveSystem.onEvent('OnDodge', p, { attacker });
```

### 3.3 移除旧 _updateItems 逻辑

`PlayerSystem._updateItems` 中的私有字段逻辑（magnetTimer, bloodPactDrain, energyShield 等）已迁移到 ItemSystem.update / onEvent，可删除或标记 deprecated。

---

## 四、ui.js 集成点

### 4.1 稀有度颜色

商店/宝箱/升级卡渲染时使用 `ShopSystem.RARITY[rarity].color`。

### 4.2 Boss HP 条

渲染 loop 中：
```js
if (BossSystem.isActive()) {
    const hpData = BossSystem.getHpBarData();
    // 渲染顶部 Boss HP 条: 名称 | 阶段 | HP 百分比
}
```

### 4.3 流派指示器

```js
const synergies = TagSystem.getActiveSynergies(player.weapons);
// 渲染 HUD 上的激活羁绊图标
```

---

## 五、清理清单

| 文件 | 操作 |
|------|------|
| `src/cyberblade/character.js` | 注释 `<script>` 标签（不再加载），文件保留做参考 |
| `src/cyberblade/enemy.js` | 注释 `<script>` 标签 |
| `src/cyberblade/wave.js` | 注释 `<script>` 标签 |
| `src/cyberblade/shop.js` | 注释 `<script>` 标签 |
| `src/engine/csv.js` | 直接删除 |
| `data/*.md` | 标记 deprecated（新建 `data/DEPRECATED.md`） |
| `src/data/*.json` | 保持不变（运行时数据） |
| `csv/*.csv` | 保持不变（策划编辑源） |

---

## 六、验收标准

- [ ] 游戏从菜单到战斗正常启动（无 JS 错误）
- [ ] 所有 15 个新模块的数据加载完成
- [ ] 新伤害公式生效（`StatsSystem.calcDamage`）
- [ ] 道具购买/效果触发正常
- [ ] 被动技能在角色选择后激活
- [ ] 波次 Budget 制替换旧时间制
- [ ] Boss 多阶段切换正确
- [ ] 宝箱掉落 + 3 选 1 正常
- [ ] 商店稀有度颜色正确
- [ ] 升级卡流派偏向生效
- [ ] 旧 cyberblade 模块不再加载
- [ ] 266+134=400 测试全部通过（无回归）