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
    if (difficulty) {
        WaveSystem.difficultyOffset = difficulty;
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
        }
    }
    // 兜底：如果没有任何武器，根据角色标签选择适合的初始武器
    if (!p.weapons || p.weapons.length === 0) {
        const charTags = CharacterSystem.getCharacterDef
            ? (CharacterSystem.getCharacterDef(CharacterSystem.selectedCharacterId) || {}).tags || []
            : [];
        const tagWeaponMap = {
            'melee': 'sword',
            'lance': 'pike',
            'ranged': 'pistol',
            'fire': 'fire_wand',
            'tech': 'heal_gun',
        };
        let defaultId = 'pistol';
        for (const tag of charTags) {
            if (tagWeaponMap[tag]) {
                defaultId = tagWeaponMap[tag];
                break;
            }
        }
        const def = ShopSystem.getWeaponDef(defaultId);
        if (def) {
            p.weapons = [{ id: defaultId, level: 1, quality: 'T1' }];
        } else {
            p.weapons = [{ id: 'pistol', level: 1, quality: 'T1' }];
        }
    }
    // 初始化初始武器的词条
    for (const w of p.weapons) {
        if (!w.affixes) ShopSystem._initWeaponAffixes(w);
    }
    // 初始化武器参数
    if (!p.weaponParams) p.weaponParams = {};
    for (const w of p.weapons) {
        ShopSystem._updateWeaponParams(p, w.id);
    }

    // 6. 计算初始羁绊加成
    const synergies = TagSystem.getActiveSynergies(p.weapons);
    const bonuses = TagSystem.mergeSynergyBonuses(synergies);
    TagSystem.applyBonuses(p, bonuses);

    // 7. 设置 LootSystem 回调：宝箱开完后流转到升级/商店
    LootSystem.onAllChestsOpened = () => {
        const pp = PlayerSystem.player;
        if (pp && pp.xp >= pp.xpToNext) {
            pp.xp -= pp.xpToNext;
            pp.level++;
            pp.xpToNext = StatsSystem.xpForLevel(pp.level);
        }
        if (GameEngine.levelUpPending) {
            GameEngine.levelUpPending = false;
            GameEngine.state = 'levelup';
            LevelUpSystem.generateCards(pp);
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
        ShopSystem.generateItems(player, WaveSystem.currentLevel);
        for (const li of lockedItems) {
            if (!ShopSystem.items.some(it => it.id === li.id && it.type === li.type)) {
                ShopSystem.items.push({ ...li, locked: true });
            }
        }

        // 流程：宝箱 → 升级 → 商店
        if (LootSystem.hasPendingChests && LootSystem.hasPendingChests()) {
            this.state = 'loot';
            if (typeof AudioSystem !== 'undefined') AudioSystem.pauseBGM();
            UISystem.showChestReward();
        } else if (this.levelUpPending) {
            this.levelUpPending = false;
            this.state = 'levelup';
            if (typeof AudioSystem !== 'undefined') AudioSystem.pauseBGM();
            LevelUpSystem.generateCards(player);
            UISystem.showLevelUp();
        } else {
            this.state = 'shopping';
            if (typeof AudioSystem !== 'undefined') AudioSystem.pauseBGM();
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
    for (let i = BulletSystem.bullets.length - 1; i >= 0; i--) {
        const b = BulletSystem.bullets[i];
        if (!b.isPlayer) {
            if (b.isMortar) continue;
            const dx = b.x - player.x, dy = b.y - player.y;
            if (dx * dx + dy * dy < (b.radius + player.radius) * (b.radius + player.radius)) {
                const actualDmg = PlayerSystem.takeDamage(b.damage);
                // 触发 OnDamageTaken 事件
                ItemSystem.onEvent('OnDamageTaken', player, { attacker: null, damage: actualDmg });
                PassiveSystem.onEvent('OnDamageTaken', player, { attacker: null, damage: actualDmg });
                BulletSystem.pool.push(b);
                BulletSystem.bullets.splice(i, 1);
            }
            continue;
        }

        let bulletUsed = false;
        for (const enemy of EnemySystem.enemies) {
            if (!enemy.alive) continue;
            if (b.hits.includes(enemy)) continue;
            const dx = b.x - enemy.x, dy = b.y - enemy.y;
            if (dx * dx + dy * dy < (b.radius + enemy.radius) * (b.radius + enemy.radius)) {
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
                    for (const other of EnemySystem.enemies) {
                        if (!other.alive || other === enemy) continue;
                        const dx = other.x - enemy.x, dy = other.y - enemy.y;
                        if (Math.sqrt(dx*dx + dy*dy) < iceRadius) {
                            const iceDmg = Math.floor(b.damage * 0.5);
                            EnemySystem.takeDamage(other, Math.max(1, iceDmg));
                            other.slowTimer = 1.5;
                            other.slowFactor = 0.5;
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

                if (b.pierce <= 0 && b.chainCount <= 0) {
                    bulletUsed = true;
                    break;
                }
                b.pierce--;
            }
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

GameEngine.closeShop = function() {
    UISystem.hideShop();
    this.levelUpPending = false;

    const p = PlayerSystem.player;

    // 重新计算羁绊加成
    if (p && p.weapons) {
        const synergies = TagSystem.getActiveSynergies(p.weapons);
        const bonuses = TagSystem.mergeSynergyBonuses(synergies);
        TagSystem.applyBonuses(p, bonuses);
    }

    if (p && p.piggyBank && p.materials > 0) {
        const interest = Math.max(1, Math.floor(p.materials * 0.15));
        p.materials += interest;
    }

    WaveSystem.startNextLevel();
    this.state = 'playing';
    if (typeof AudioSystem !== 'undefined') AudioSystem.resumeBGM();
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
        LevelUpSystem.generateCards(p);
        UISystem.showLevelUp();
        return;
    }
    this.state = 'shopping';
    UISystem.showShop();
};


