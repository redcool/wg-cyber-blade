// ============================================================
// cyberblade/main.js - 游戏专用逻辑（初始化、碰撞、掉落、状态流转）
// ============================================================
// 本文件扩展 GameEngine（定义于 engine/engine.js），添加游戏专用方法

// ======================== 启动游戏 ========================

GameEngine.startGame = function(startWeaponId, difficulty) {
    // 1. 重置所有新系统
    PlayerSystem.reset();
    EnemySystem.clear();
    WaveSystem.reset();
    // 加载难度配置（数据驱动）
    const diffDefs = (typeof DataLoader !== 'undefined' && DataLoader._cache && DataLoader._cache.difficulty)
        || (typeof window !== 'undefined' && window.__DATA_BUNDLE__ && window.__DATA_BUNDLE__.difficulty)
        || [];
    const diffCfg = diffDefs.find(d => d.id === difficulty) || null;
    if (diffCfg) {
        WaveSystem.difficultyOffset = difficulty;
        WaveSystem.difficultyConfig = diffCfg;
    }
    BossSystem.clear();
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
    UnlockSystem.resetSession();
    this.endlessMode = false;  // 普通模式新开,重置无尽标志

    // 2. 创建玩家（内部已调用 applyToPlayer）
    PlayerSystem.create(GameWorld.width / 2, GameWorld.height / 2);
    const p = PlayerSystem.player;

    // 3. 注册角色被动
    if (p._passiveIds && p._passiveIds.length > 0) {
        PassiveSystem.registerMany(p._passiveIds, 'character', p);
    }

    // 4. 装备初始武器
    if (startWeaponId) {
        const def = ShopSystem.getWeaponDef(startWeaponId);
        if (def) {
            p.weapons = [{ id: startWeaponId, level: 1, quality: 'T1' }];
        }
    }
    // 兜底：如果没有任何武器，优先使用角色数据驱动的 startingWeapons
    if (!p.weapons || p.weapons.length === 0) {
        const startWeapons = CharacterSystem.getStartingWeapons
            ? CharacterSystem.getStartingWeapons(CharacterSystem.selectedCharacterId)
            : [];
        const weaponIds = startWeapons.length > 0 ? startWeapons : ['pistol'];
        p.weapons = [];
        for (const wid of weaponIds) {
            const def = ShopSystem.getWeaponDef(wid);
            if (def) {
                p.weapons.push({ id: wid, level: 1, quality: 'T1' });
            }
        }
        if (p.weapons.length === 0) {
            const fallbackDef = ShopSystem.getWeaponDef('pistol');
            if (fallbackDef) {
                p.weapons = [{ id: 'pistol', level: 1, quality: 'T1' }];
            }
        }
    }
    // 初始化武器参数
    if (!p.weaponParams) p.weaponParams = {};
    for (const w of p.weapons) {
        ShopSystem._updateWeaponParams(p, w.id);
    }

    // 5. 计算初始羁绊加成（_updateSynergies 内部已调用 TagSystem 计算并应用）
    PlayerSystem._updateSynergies();

    // 6. 设置 LootSystem 回调：宝箱开完后流转到升级/商店/通关
    LootSystem.onAllChestsOpened = () => {
        const pp = PlayerSystem.player;
        if (pp && pp.xp >= pp.xpToNext) {
            pp.xp -= pp.xpToNext;
            pp.level++;
            pp.xpToNext = StatsSystem.xpForLevel(pp.level);
        }
        // 通关判定: 第 20 关 boss 死亡 + 宝箱开完 + 非无尽模式 → 结算界面
        if (WaveSystem.isFinalLevel() && !GameEngine.endlessMode) {
            GameEngine.state = 'victory';
            if (typeof AudioSystem !== 'undefined') {
                if (AudioSystem._bgmPaused) AudioSystem.resumeBGM();
                else AudioSystem.unduckBGM();
            }
            UISystem.showVictory();
            return;
        }
        if (GameEngine.levelUpPending) {
            GameEngine.levelUpPending = false;
            GameEngine.state = 'levelup';
            LevelUpSystem.generateCards(pp, pp.level || 1);
            UISystem.showLevelUp();
        } else {
            GameEngine.state = 'shopping';
            UISystem.showShop();
        }
    };

    // 8. 开始第一波
    WaveSystem.startNextLevel();
    this.state = 'playing';
    this.announceTimer = 1.5;
    UISystem.showHUD();

    // 9. 启动背景音乐
    if (typeof AudioSystem !== 'undefined') {
        AudioSystem.init();
        AudioSystem.stopBGM();
        AudioSystem.startBGM();
    }
    document.getElementById('menuOverlay').classList.add('hidden');
    document.getElementById('gameOverOverlay').classList.add('hidden');
    document.getElementById('charSelectOverlay').classList.add('hidden');
    UISystem.hideShop();
    UISystem.hideLevelUp();
};

// ======================== 游戏更新循环 ========================

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
        BulletSystem.clear();
        WaveSystem._resetPlayerIdle();
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
    this._updateMaterials(dt, player);
    ParticleSystem.update(dt);
    CombatLogSystem.update(dt);
    UISystem.updateHUD();

    // 8. 波次过渡
    if (WaveSystem.waveTransitioning) {
        // 掉落剩余敌人材料
        for (const e of EnemySystem.enemies) {
            if (e.alive) this._dropMaterials(e);
        }
        EnemySystem.clear();
        GameWorld.materials = [];

        // 记录通关关卡数
        UnlockSystem.sessionStats.levelsCleared = WaveSystem.currentLevel;

        // 先生成商店物品（保留锁定商品）
        const lockedItems = [...ShopSystem.lockedItems];
        ShopSystem.generateItems(player, WaveSystem.currentLevel, Math.max(0, 4 - lockedItems.length));
        for (const li of lockedItems) {
            if (!ShopSystem.items.some(it => it.id === li.id && it.type === li.type)) {
                ShopSystem.items.push({ ...li, locked: true });
            }
        }

        // 流程：宝箱 → 升级 → 商店
        // 三个场景都让 BGM 继续播放(不停),只把音量降低 50%
        if (LootSystem.hasPendingChests && LootSystem.hasPendingChests()) {
            this.state = 'loot';
            if (typeof AudioSystem !== 'undefined') AudioSystem.duckBGM(0.5);
            UISystem.showChestReward();
        } else if (this.levelUpPending) {
            this.levelUpPending = false;
            this.state = 'levelup';
            if (typeof AudioSystem !== 'undefined') AudioSystem.duckBGM(0.5);
            LevelUpSystem.generateCards(player, player.level || 1);
            UISystem.showLevelUp();
        } else {
            this.state = 'shopping';
            // 商店场景：BGM 继续播放但音量降 50%（不要停止）
            if (typeof AudioSystem !== 'undefined') AudioSystem.duckBGM(0.5);
            UISystem.showShop();
        }
    }

    if (this.announceTimer > 0) this.announceTimer -= dt;
};

GameEngine._updateShopping = function(dt) {
    Input.clearJustPressed();
    ParticleSystem.update(dt);
    CombatLogSystem.update(dt);
};

// ======================== 碰撞检测 ========================

GameEngine._checkBulletCollisions = function(player) {
    const enemyGrid = EnemySystem._grid;
    const useGrid = (typeof SpatialGrid !== 'undefined') && enemyGrid;

    for (let i = BulletSystem.bullets.length - 1; i >= 0; i--) {
        const b = BulletSystem.bullets[i];
        if (!b.isPlayer) {
            if (b.isMortar) continue;
            // 扫掠碰撞: 子弹胶囊体(本帧移动线段) vs 玩家圆
            if (Collision.capsuleVsCircle(
                b._prevX ?? b.x, b._prevY ?? b.y,
                b.x, b.y,
                b.radius,
                player.x, player.y, player.radius
            )) {
                const actualDmg = PlayerSystem.takeDamage(b.damage);
                // 触发 OnDamageTaken 事件
                ItemSystem.onEvent('OnDamageTaken', player, { attacker: null, damage: actualDmg });
                PassiveSystem.onEvent('OnDamageTaken', player, { attacker: null, damage: actualDmg });
                BulletSystem.pool.push(b);
                BulletSystem.bullets.splice(i, 1);
            }
            continue;
        }

        // 网格粗筛: 用子弹当前位置 + 最大碰撞范围查候选怪
        // 范围 = b.radius + 最大怪半径(20 像素) + 上一帧位移上限(50 像素防穿模)
        const queryRadius = b.radius + 30 + 50;
        const candidateEnemies = useGrid
            ? SpatialGrid.queryRadiusUnique(enemyGrid, b.x, b.y, queryRadius)
            : EnemySystem.enemies;

        let bulletUsed = false;
        for (const enemy of candidateEnemies) {
            if (!enemy.alive) continue;
            if (b.hits.includes(enemy)) continue;
            // 圆形碰撞 + 扫掠(防高速穿模): 子弹胶囊体 vs 敌人圆
            if (!Collision.capsuleVsCircle(
                b._prevX ?? b.x, b._prevY ?? b.y,
                b.x, b.y,
                b.radius,
                enemy.x, enemy.y, enemy.radius
            )) continue;

            if (enemy.alive) {
                CombatLogSystem.addDamage(enemy.x, enemy.y, b.damage);
            }
            if (typeof AudioSystem !== 'undefined') AudioSystem.play('enemy_hit');
            const result = EnemySystem.takeDamage(enemy, b.damage);
            b.hits.push(enemy);

            // 触发 OnHit 事件
            ItemSystem.onEvent('OnHit', player, { target: enemy, damage: b.damage });
            PassiveSystem.onEvent('OnHit', player, { target: enemy, damage: b.damage });
            // 暴击事件
            if (player._lastCrit) {
                ItemSystem.onEvent('OnCrit', player, { target: enemy, damage: b.damage });
                PassiveSystem.onEvent('OnCrit', player, { target: enemy, damage: b.damage });
            }

            // 减速效果
            if (b.slowAmount > 0) {
                enemy.slowTimer = b.slowDuration;
                enemy.slowFactor = 1 - b.slowAmount;
            }

            // 燃烧效果
            if (b.burnDps > 0 && enemy.alive) {
                PlayerSystem._applyBurn(enemy, b.burnDps, 3.0, b.burnMaxStacks || 3);
            }

            // 冰爆效果
            if (b.iceExplosionRadius > 0 || (b.splashRadius > 0 && b.slowAmount > 0)) {
                const iceRadius = b.splashRadius || b.iceExplosionRadius || 40;
                if (useGrid) {
                    const nearbyIce = SpatialGrid.queryRadiusUnique(enemyGrid, enemy.x, enemy.y, iceRadius);
                    for (const other of nearbyIce) {
                        if (!other.alive || other === enemy) continue;
                        const iceDmg = Math.floor(b.damage * 0.5);
                        EnemySystem.takeDamage(other, Math.max(1, iceDmg));
                        other.slowTimer = 1.5;
                        other.slowFactor = 0.5;
                    }
                } else {
                    for (const other of EnemySystem.enemies) {
                        if (!other.alive || other === enemy) continue;
                        if (Collision.circlesOverlap(
                            { x: enemy.x, y: enemy.y, radius: iceRadius },
                            other
                        )) {
                            const iceDmg = Math.floor(b.damage * 0.5);
                            EnemySystem.takeDamage(other, Math.max(1, iceDmg));
                            other.slowTimer = 1.5;
                            other.slowFactor = 0.5;
                        }
                    }
                }
                ParticleSystem.explosion(enemy.x, enemy.y, '#44ccff', 10);
            }

            // 连锁电击
            if (b.chainCount > 0) {
                BulletSystem.chainLightning(b, enemy);
            }

            // 治愈弹
            if (b.healOnHit > 0) {
                PlayerSystem.heal(b.healOnHit);
                ParticleSystem.emit(player.x, player.y, 4, {
                    speed: 40, color: '#00ff88', life: 0.25, size: 5, type: 'glow'
                });
            }

            if (result === -1) {
                this._handleEnemyKill(enemy, b.damage);
            }

            // 远程击退(很弱 + 大体型抗性)
            EnemySystem.applyKnockback(enemy, b.x - enemy.x, b.y - enemy.y, 0, b.knockback || 80, { ranged: true });

            if (b.pierce <= 0 && b.chainCount <= 0) {
                bulletUsed = true;
                break;
            }
            b.pierce--;
        }

        if (bulletUsed) {
            BulletSystem.pool.push(b);
            BulletSystem.bullets.splice(i, 1);
        }
    }
};

// ======================== 掉落系统 ========================

GameEngine._dropMaterials = function(enemy) {
    const p = PlayerSystem.player;
    if (!p) return;
    const count = Math.random() < 0.1 ? 2 : 1;
    let totalValue = 0;
    for (let i = 0; i < count; i++) {
        let value = Math.max(1, Math.floor(enemy.materialValue * (0.8 + Math.random() * 0.4)));
        if (enemy.isElite && p.huntingTrophy) {
            value = Math.floor(value * 1.5);
        }
        totalValue += value;
        GameWorld.materials.push({
            x: enemy.x + (Math.random() - 0.5) * 30,
            y: enemy.y + (Math.random() - 0.5) * 30,
            value: value,
            life: 30
        });
    }
    CombatLogSystem.logDrop(totalValue);
};

GameEngine._updateMaterials = function(dt, player) {
    const pickupRange = player.pickupRange + 8;
    const attractSpeed = 300;
    const collectDist = 10;
    for (let i = GameWorld.materials.length - 1; i >= 0; i--) {
        const mat = GameWorld.materials[i];
        mat.life -= dt;
        if (mat.life <= 0) {
            GameWorld.materials.splice(i, 1);
            continue;
        }
        const dx = mat.x - player.x;
        const dy = mat.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < collectDist) {
            player.materials += mat.value;
            ParticleSystem.pickup(mat.x, mat.y);
            if (typeof AudioSystem !== 'undefined') AudioSystem.play('coin');
            GameWorld.materials.splice(i, 1);
        } else if (dist < pickupRange) {
            const factor = dt * attractSpeed / Math.max(1, dist);
            mat.x -= dx * factor;
            mat.y -= dy * factor;
        }
    }
};

GameEngine._checkMedkitCollisions = function(player) {
    for (let i = BulletSystem.bullets.length - 1; i >= 0; i--) {
        const b = BulletSystem.bullets[i];
        if (!b.isPlayer) continue;
        for (const crate of MedkitSystem.crates) {
            if (!crate.alive) continue;
            const dx = b.x - crate.x, dy = b.y - crate.y;
            if (dx * dx + dy * dy < (b.radius + crate.radius) * (b.radius + crate.radius)) {
                MedkitSystem.takeDamage(crate, b.damage);
                BulletSystem.pool.push(b);
                BulletSystem.bullets.splice(i, 1);
                break;
            }
        }
    }
};

// ======================== 击杀处理 ========================

GameEngine._handleEnemyKill = function(enemy, damage) {
    const p = PlayerSystem.player;
    if (!p) return;

    p.kills++;
    if (typeof UnlockSystem !== 'undefined') UnlockSystem.sessionStats.kills++;

    // 触发 OnKill 事件
    ItemSystem.onEvent('OnKill', p, { target: enemy, damage: damage });
    PassiveSystem.onEvent('OnKill', p, { target: enemy, damage: damage });

    if (PlayerSystem.addXP(enemy.xpValue)) {
        this.levelUpPending = true;
    }

    if (p.lifeSteal > 0) {
        const healAmt = damage * p.lifeSteal;
        PlayerSystem.heal(healAmt);
        if (typeof CombatLogSystem !== 'undefined') CombatLogSystem.logLifeSteal(healAmt);
    }

    // 击杀回血（武器 killHeal 字段）
    let killHealTotal = 0;
    if (p.weaponParams) {
        for (const w of (p.weapons || [])) {
            const params = p.weaponParams[w.id];
            if (params && params.killHeal > 0) killHealTotal += params.killHeal;
        }
    }
    if (killHealTotal > 0) PlayerSystem.heal(killHealTotal);

    this._dropMaterials(enemy);

    // 宝箱掉落（Boss 宝箱由 BossSystem.destroy 管理，不在此处处理）
    if (enemy.isElite) {
        LootSystem.spawnChest(enemy.x, enemy.y, 'elite');
    }

    if (typeof CombatLogSystem !== 'undefined') CombatLogSystem.logKill(enemy.name);
    if (typeof ParticleSystem !== 'undefined') ParticleSystem.enemyDeath(enemy.x, enemy.y, enemy.glowColor);
    if (typeof AudioSystem !== 'undefined') AudioSystem.play('enemy_die');
};

// ======================== 商店/状态流转 ========================

GameEngine.closeShop = function(endless = false) {
    // endless: true=无尽模式, false=普通模式(第 20 关会触发通关)
    // 显式默认 false:避免历史 endlessMode 泄漏到普通路径
    GameEngine.endlessMode = !!endless;
    UISystem.hideShop();
    this.levelUpPending = false;

    const p = PlayerSystem.player;

    // 重新计算羁绊加成
    if (p && p.weapons) {
        PlayerSystem._updateSynergies();
    }

    if (p && p.piggyBank && p.materials > 0) {
        const interest = Math.max(1, Math.floor(p.materials * 0.15));
        p.materials += interest;
    }

    WaveSystem.startNextLevel();
    this.state = 'playing';
    // 出商店/升级:从 duck 状态恢复(因为进入 playing,需要满音量 BGM)
    if (typeof AudioSystem !== 'undefined') {
        if (AudioSystem._bgmPaused) {
            AudioSystem.resumeBGM();  // 兼容未来真停止 BGM 的场景
        } else {
            AudioSystem.unduckBGM();
        }
    }
    this.announceTimer = 1.5;
    UISystem.updateHUD();
};

GameEngine.onLevelUpClosed = function() {
    const p = PlayerSystem.player;
    if (p && p.xp >= p.xpToNext) {
        p.xp -= p.xpToNext;
        p.level++;
        p.xpToNext = StatsSystem.xpForLevel(p.level);
        this.state = 'levelup';
        LevelUpSystem.generateCards(p, p.level || 1);
        UISystem.showLevelUp();
        return;
    }
    this.state = 'shopping';
    UISystem.showShop();
};

// ======================== 暂停 / 中止界面 ========================

GameEngine.pauseGame = function() {
    if (this.state !== 'playing') return;
    this._prevStateBeforePause = 'playing';
    this.state = 'paused';
    UISystem.showPause();
    if (typeof AudioSystem !== 'undefined') AudioSystem.pauseBGM();
};

GameEngine.resumeGame = function() {
    if (this.state !== 'paused') return;
    this.state = this._prevStateBeforePause || 'playing';
    this._prevStateBeforePause = null;
    UISystem.hidePause();
    if (typeof AudioSystem !== 'undefined') AudioSystem.resumeBGM();
};

GameEngine.newGameFromPause = function() {
    // 从中止界面 → 新开: 回到角色/武器选择
    this.state = 'menu';
    this._prevStateBeforePause = null;
    UISystem.hidePause();
    if (typeof AudioSystem !== 'undefined') AudioSystem.stopBGM();
    UISystem.showMenu();
};

GameEngine.exitGame = function() {
    UISystem.hidePause();
    if (typeof AudioSystem !== 'undefined') AudioSystem.stopBGM();
    // 关闭当前标签页;若浏览器拒绝则回退到菜单
    try { window.close(); } catch (e) { /* ignore */ }
    setTimeout(() => {
        // 如果 window.close 没生效,回退到主菜单
        this.state = 'menu';
        UISystem.showMenu();
    }, 100);
};

GameEngine.togglePause = function() {
    if (this.state === 'playing') this.pauseGame();
    else if (this.state === 'paused') this.resumeGame();
};


