// ============================================================
// main.js - 游戏主入口（无限关卡循环）
// ============================================================

// 游戏世界
const GameWorld = {
    width: 3000,
    height: 3000,
    materials: []
};

// 游戏引擎
const GameEngine = {
    running: false,
    state: 'menu', // menu, playing, shopping, levelup, gameover
    lastTime: 0,
    announceTimer: 0,
    levelUpPending: false,

    async init() {
        await AssetSystem.init();
        Input.init();
        Renderer.init();
        UISystem.init();
        this._respawn();
        UISystem.showMenu();
        this.running = true;
        this.lastTime = performance.now();
        this._loop();
    },

    startGame(startWeaponId) {
        // 重置所有状态
        PlayerSystem.reset();
        EnemySystem.clear();
        BulletSystem.clear();
        ParticleSystem.clear();
        WaveSystem.reset();
        ShopSystem.reset();
        MedkitSystem.clear();
        ChestSystem.clear();
        CombatLogSystem.clear();
        GameWorld.materials = [];
        this.levelUpPending = false;
        UnlockSystem.resetSession();

        // 创建玩家（应用角色属性，不带武器）
        PlayerSystem.create(GameWorld.width / 2, GameWorld.height / 2);

        // 装备选择的初始武器
        const p = PlayerSystem.player;
        if (startWeaponId) {
            const def = ShopSystem.allWeapons.find(w => w.id === startWeaponId);
            if (def) {
                p.weapons = [{ id: startWeaponId, level: 1, quality: 'T1' }];
            }
        }
        // 兜底：如果没有任何武器，给基础手枪
        if (!p.weapons || p.weapons.length === 0) {
            p.weapons = [{ id: 'pistol', level: 1, quality: 'T1' }];
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
        // 重新计算羁绊+词条加成（create()中的计算已基于旧武器数据）
        PlayerSystem._updateSynergies();

        // 开始第一关
        WaveSystem.startNextLevel();
        this.state = 'playing';
        this.announceTimer = 1.5;
        UISystem.showHUD();
        document.getElementById('menuOverlay').classList.add('hidden');
        document.getElementById('gameOverOverlay').classList.add('hidden');
        document.getElementById('charSelectOverlay').classList.add('hidden');
        UISystem.hideShop();
        UISystem.hideLevelUp();
    },

    _respawn() {
        PlayerSystem.create(GameWorld.width / 2, GameWorld.height / 2);
    },

    _loop() {
        if (!this.running) return;

        try {
            const now = performance.now();
            const rawDt = (now - this.lastTime) / 1000;
            const dt = Math.min(rawDt, 0.05);
            this.lastTime = now;

            if (this.state === 'playing') {
                this._updatePlaying(dt);
            } else if (this.state === 'shopping') {
                this._updateShopping(dt);
            }

            this._render();
        } catch (e) {
            console.error('[GameEngine] 游戏循环异常:', e);
            // 在屏幕右上角显示错误信息（方便用户看到）
            const errDiv = document.getElementById('gameErrorDisplay');
            if (errDiv) {
                errDiv.textContent = '⚠ ' + (e.message || e);
                errDiv.style.display = 'block';
            } else {
                // 动态创建错误显示
                const el = document.createElement('div');
                el.id = 'gameErrorDisplay';
                el.style.cssText = 'position:fixed;top:10px;right:10px;z-index:9999;background:rgba(255,0,68,0.85);color:#fff;padding:10px 16px;border-radius:6px;font:14px monospace;max-width:400px;word-break:break-all';
                el.textContent = '⚠ ' + (e.message || e);
                document.body.appendChild(el);
            }
            // 继续运行（不要因为一次错误就冻结整个游戏）
        }

        requestAnimationFrame(() => this._loop());
    },

    _updatePlaying(dt) {
        const player = PlayerSystem.player;
        if (!player) return;

        Input.clearJustPressed();
        PlayerSystem.update(dt, EnemySystem.enemies);

        if (!player.alive) {
            ParticleSystem.explosion(player.x, player.y, '#00ffff', 30);
            this.state = 'gameover';
            setTimeout(() => UISystem.showGameOver(), 500);
            return;
        }

        EnemySystem.update(dt, player);
        BulletSystem.update(dt);
        this._checkBulletCollisions(player);
        this._checkMedkitCollisions(player);
        MedkitSystem.update(dt, player);
        ChestSystem.update(dt, player);
        this._updateMaterials(dt, player);
        ParticleSystem.update(dt);
        CombatLogSystem.update(dt);
        WaveSystem.update(dt, player);

        // 关卡结束 → 清理场景 → 先升级，后商店
        if (WaveSystem.waveTransitioning) {
            // 掉落剩余敌人材料
            for (const e of EnemySystem.enemies) {
                if (e.alive) this._dropMaterials(e);
            }
            EnemySystem.clear();
            // 清理场景上的金币
            GameWorld.materials = [];

            // 记录通关关卡数
            UnlockSystem.sessionStats.levelsCleared = WaveSystem.currentLevel;

            // 先生成商店物品
            ShopSystem.generateItems();

            // 流程：宝箱奖励 → 升级 → 商店
            if (ChestSystem.pendingChests && ChestSystem.pendingChests.length > 0) {
                this.state = 'chestreward';
                ChestSystem.showNextPendingReward();
            } else if (this.levelUpPending) {
                this.levelUpPending = false;
                this.state = 'levelup';
                UISystem.showLevelUp();
            } else {
                this.state = 'shopping';
                UISystem.showShop();
            }
        }

        if (this.announceTimer > 0) this.announceTimer -= dt;
        UISystem.updateHUD();
    },

    _updateShopping(dt) {
        Input.clearJustPressed();
        ParticleSystem.update(dt);
        CombatLogSystem.update(dt);
    },

    _checkBulletCollisions(player) {
        for (let i = BulletSystem.bullets.length - 1; i >= 0; i--) {
            const b = BulletSystem.bullets[i];
            if (!b.isPlayer) {
                // 迫击弹不直接碰撞，由寿命结束触发范围爆炸
                if (b.isMortar) continue;
                // 敌人子弹 vs 玩家
                const dx = b.x - player.x, dy = b.y - player.y;
                if (dx * dx + dy * dy < (b.radius + player.radius) * (b.radius + player.radius)) {
                    PlayerSystem.takeDamage(b.damage);
                    BulletSystem.pool.push(b);
                    BulletSystem.bullets.splice(i, 1);
                }
                continue;
            }

            // 玩家子弹 vs 敌人
            let bulletUsed = false;
            for (const enemy of EnemySystem.enemies) {
                if (!enemy.alive) continue;
                if (b.hits.includes(enemy)) continue;
                const dx = b.x - enemy.x, dy = b.y - enemy.y;
                if (dx * dx + dy * dy < (b.radius + enemy.radius) * (b.radius + enemy.radius)) {
                    // 浮动伤害数字
                    if (enemy.alive) {
                        CombatLogSystem.addDamage(enemy.x, enemy.y, b.damage);
                    }
                    const result = EnemySystem.takeDamage(enemy, b.damage);
                    b.hits.push(enemy);

                    // 减速效果
                    if (b.slowAmount > 0) {
                        enemy.slowTimer = b.slowDuration;
                        enemy.slowFactor = 1 - b.slowAmount;
                    }

                    // 燃烧效果
                    if (b.burnDps > 0 && enemy.alive) {
                        PlayerSystem._applyBurn(enemy, b.burnDps, 3.0, b.burnMaxStacks || 3);
                    }

                    // 冰爆效果（冰弹/冷气击中时触发范围冰爆）
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

                    // 治愈弹：击中回血
                    if (b.healOnHit > 0) {
                        PlayerSystem.heal(b.healOnHit);
                        ParticleSystem.emit(player.x, player.y, 4, {
                            speed: 40, color: '#00ff88', life: 0.25, size: 5, type: 'glow'
                        });
                    }

                    if (result === -1) {
                        // 敌人死亡
                        player.kills++;
                        UnlockSystem.sessionStats.kills++;

                        if (PlayerSystem.addXP(enemy.xpValue)) {
                            this.levelUpPending = true;
                        }
                        if (player.lifeSteal > 0) {
                            const healAmt = b.damage * player.lifeSteal;
                            PlayerSystem.heal(healAmt);
                            CombatLogSystem.logLifeSteal(healAmt);
                        }
                        this._dropMaterials(enemy);
                        // 精英/Boss 掉落宝箱
                        if (typeof ChestSystem !== 'undefined') {
                            if (enemy.isBoss) ChestSystem.spawnChest(enemy.x, enemy.y, 2);
                            else if (enemy.isElite) ChestSystem.spawnChest(enemy.x, enemy.y, 1);
                        }
                        CombatLogSystem.logKill(enemy.name);
                        ParticleSystem.enemyDeath(enemy.x, enemy.y, enemy.glowColor);
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
    },

    _dropMaterials(enemy) {
        const p = PlayerSystem.player;
        if (!p) return;
        const count = 1 + Math.floor(Math.random() * 2);
        let totalValue = 0;
        for (let i = 0; i < count; i++) {
            let value = Math.max(1, Math.floor(enemy.materialValue * (0.8 + Math.random() * 0.4)));
            // 狩猎勋章：精英怪掉落材料+50%
            if (enemy.isElite && p.huntingTrophy) {
                value = Math.floor(value * 1.5);
            }
            totalValue += value;
            GameWorld.materials.push({
                x: enemy.x + (Math.random() - 0.5) * 30,
                y: enemy.y + (Math.random() - 0.5) * 30,
                value: value,
                life: 30 // 30秒后自动消失，防止无限堆积
            });
        }
        CombatLogSystem.logDrop(totalValue);
    },

    /** 金币自动拾取 + 生命周期（防止无限堆积导致卡死） */
    _updateMaterials(dt, player) {
        const pickupRange = player.pickupRange + 8; // 同chest/medkit拾取范围
        for (let i = GameWorld.materials.length - 1; i >= 0; i--) {
            const mat = GameWorld.materials[i];
            // 生命周期递减
            mat.life -= dt;
            if (mat.life <= 0) {
                GameWorld.materials.splice(i, 1);
                continue;
            }
            // 玩家靠近自动拾取
            const dx = mat.x - player.x;
            const dy = mat.y - player.y;
            if (Math.sqrt(dx * dx + dy * dy) < pickupRange) {
                player.materials += mat.value;
                ParticleSystem.pickup(mat.x, mat.y);
                GameWorld.materials.splice(i, 1);
            }
        }
    },

    /** 玩家子弹检测医药箱碰撞 */
    _checkMedkitCollisions(player) {
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
    },

    /** 关闭商店，进入下一关 */
    closeShop() {
        UISystem.hideShop();

        // 升级计数清零
        this.levelUpPending = false;

        // ====== 存钱罐：每波获得15%金币利息 ======
        const p = PlayerSystem.player;
        if (p && p.piggyBank && p.materials > 0) {
            const interest = Math.max(1, Math.floor(p.materials * 0.15));
            p.materials += interest;
        }

        // 无限关卡：继续下一关
        WaveSystem.startNextLevel();
        this.state = 'playing';
        this.announceTimer = 1.5;
        UISystem.updateHUD();
    },

    /** 所有宝箱奖励展示完成后触发（宝箱→升级→商店） */
    onChestRewardBatchComplete() {
        const p = PlayerSystem.player;
        if (p && p.xp >= p.xpToNext) {
            p.xp -= p.xpToNext;
            p.level++;
            p.xpToNext = StatsSystem.xpForLevel(p.level);
            this.levelUpPending = true;
        }
        if (this.levelUpPending) {
            this.levelUpPending = false;
            this.state = 'levelup';
            UISystem.showLevelUp();
        } else {
            this.state = 'shopping';
            UISystem.showShop();
        }
    },

    onLevelUpClosed() {
        // 检查是否还有未处理的连续升级
        const p = PlayerSystem.player;
        if (p && p.xp >= p.xpToNext) {
            p.xp -= p.xpToNext;
            p.level++;
            p.xpToNext = StatsSystem.xpForLevel(p.level);
            this.state = 'levelup';
            UISystem.showLevelUp();
            return;
        }
        // 升级后总是显示商店
        this.state = 'shopping';
        UISystem.showShop();
    },

    _render() {
        const player = PlayerSystem.player;
        Renderer.beginFrame(player);

        Renderer.drawBackground();
        Renderer.drawWorldBounds();

        for (const mat of GameWorld.materials) Renderer.drawMaterial(mat);
        for (const crate of MedkitSystem.crates) Renderer.drawCrate(crate);
        for (const pk of MedkitSystem.pickups) Renderer.drawHealthPickup(pk);
        for (const chest of ChestSystem.chests) Renderer.drawChest(chest);
        for (const enemy of EnemySystem.enemies) Renderer.drawEnemy(enemy);
        for (const p of ParticleSystem.particles) Renderer.drawParticle(p);
        Renderer.drawPlayer(player);
        for (const b of BulletSystem.bullets) Renderer.drawBullet(b);

        if (this.state === 'playing' && this.announceTimer > 0) {
            Renderer.drawWaveAnnouncement(WaveSystem.currentLevel);
        }

        Renderer.endFrame();
        Renderer.drawHUDEffects(player);
    }
};

// 游戏启动
window.addEventListener('DOMContentLoaded', () => GameEngine.init());
