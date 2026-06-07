// ============================================================
// src/engine/enemy.js — 敌人 AI 系统（7 行为 + 5 机制 + Build 克制）
// 依赖: data.js (DataLoader), stats.js (StatsSystem)
// ============================================================

/**
 * EnemySystem — 敌人 AI 系统
 *
 * API:
 *   async loadEnemies()               加载敌人类型数据
 *   create(typeId, x, y, waveLevel)   创建敌人实例
 *   createBatch(spawnList, waveLevel) 批量创建
 *   destroy(enemy)                    移除敌人（触发 onDeath 机制）
 *   update(dt, player)                每帧更新所有敌人
 *   takeDamage(enemy, damage)         受击处理
 *   fireBullet(enemy, player)         Shooter 发射子弹
 *   clear()                           清空所有敌人
 *   countAlive(typeId)                统计存活敌人数量
 *   scaleByWave(type, waveLevel)      波次难度缩放
 *   getCounterTypes(tagCounts)        Build 克制类型
 *
 * 7 种行为: chaser / runner / tank / shooter / bomber / swarm / summoner
 * 5 种机制: splitter / shielded / leech / reflect / freezer
 */

// ============================================================
// 7 种行为类型
// ============================================================
const BEHAVIORS = {
    /** 追击玩家，直线移动 + 接触伤害 */
    chaser: {
        update(enemy, dt, player) {
            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 5) {
                const speed = (enemy.speed || 80) * dt;
                enemy.x += (dx / dist) * speed;
                enemy.y += (dy / dist) * speed;
            }

            enemy.attackTimer -= dt;
            if (enemy.attackTimer <= 0 && dist < (enemy.radius || 14) + (player.radius || 10) + 5) {
                if (typeof PlayerSystem !== 'undefined') {
                    PlayerSystem.takeDamage(enemy.damage || 8);
                    // 触发特殊机制（leech / freezer）
                    EnemySystem._triggerMechanicsOnAttack(enemy, enemy.damage || 8, player);
                    const angle = Math.atan2(dy, dx);
                    player.knockbackX = -Math.cos(angle) * 200;
                    player.knockbackY = -Math.sin(angle) * 200;
                }
                enemy.attackTimer = enemy.attackCooldown || 1.5;
            }
        },
    },

    /** 高速低血量，半血后逃离 */
    runner: {
        update(enemy, dt, player) {
            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const hpPct = (enemy.hp || 1) / (enemy.maxHp || 1);

            const speedMult = hpPct <= 0.5 ? 1.3 : 1.0;
            const dir = hpPct <= 0.5 ? -1 : 1; // flee when low HP
            const speed = (enemy.speed || 160) * speedMult * dt;

            if (dist > 5) {
                    enemy.x += (dx / dist) * speed * dir;
                    enemy.y += (dy / dist) * speed * dir;
            }

            enemy.attackTimer -= dt;
            if (enemy.attackTimer <= 0 && dist < (enemy.radius || 10) + (player.radius || 10) + 5) {
                if (typeof PlayerSystem !== 'undefined') {
                    PlayerSystem.takeDamage(enemy.damage || 6);
                    EnemySystem._triggerMechanicsOnAttack(enemy, enemy.damage || 6, player);
                }
                enemy.attackTimer = enemy.attackCooldown || 1.2;
            }
        },
    },

    /** 高血量低移速，周期性冲锋 */
    tank: {
        update(enemy, dt, player) {
            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            enemy.chargeTimer = enemy.chargeTimer || 0;
            enemy.charging = enemy.charging || false;
            enemy.chargeDuration = enemy.chargeDuration || 0;

            if (enemy.charging) {
                // 冲锋中
                enemy.chargeDuration -= dt;
                if (enemy.chargeDuration <= 0) {
                    enemy.charging = false;
                    enemy.chargeTimer = 3.0;
                }
                if (dist > 5) {
                    const speed = (enemy.speed || 45) * 2 * dt;
                    enemy.x += (dx / dist) * speed;
                    enemy.y += (dy / dist) * speed;
                }
                // 冲锋中无视击退
                enemy.knockbackRemaining = 0;
            } else {
                // 正常慢速接近
                if (dist > 5) {
                    const speed = (enemy.speed || 45) * dt;
                enemy.x += (dx / dist) * speed;
                enemy.y += (dy / dist) * speed;
                }

                enemy.chargeTimer -= dt;
                if (enemy.chargeTimer <= 0) {
                    // 蓄力 0.5s 后冲锋
                    enemy.charging = true;
                    enemy.chargeDuration = 1.0;
                    enemy.flashTimer = 0.5;
                }
            }

            // 接触伤害
            enemy.attackTimer -= dt;
            if (enemy.attackTimer <= 0 && dist < (enemy.radius || 22) + (player.radius || 10) + 5) {
                if (typeof PlayerSystem !== 'undefined') {
                    PlayerSystem.takeDamage(enemy.damage || 15);
                    EnemySystem._triggerMechanicsOnAttack(enemy, enemy.damage || 15, player);
                }
                enemy.attackTimer = enemy.attackCooldown || 2.0;
            }
        },
    },

    /** 保持距离射击 */
    shooter: {
        update(enemy, dt, player) {
            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const preferred = enemy.preferredDist || 200;

            if (dist < preferred - 50) {
                const speed = (enemy.speed || 55) * dt;
                enemy.x -= (dx / dist) * speed;
                enemy.y -= (dy / dist) * speed;
            } else if (dist > preferred + 50) {
                const speed = (enemy.speed || 55) * dt;
                    enemy.x += (dx / dist) * speed;
                    enemy.y += (dy / dist) * speed;
                }
                enemy.x += 0;  // 击退由主循环处理
                enemy.y += 0;
            }

            enemy.attackTimer -= dt;
            if (enemy.attackTimer <= 0 && dist < 500) {
                if (typeof BulletSystem !== 'undefined') {
                    const angle = Math.atan2(dy, dx);
                    BulletSystem.create(enemy.x, enemy.y, angle, enemy.damage || 12, enemy.bulletSpeed || 350, 0, false);
                }
                enemy.attackTimer = enemy.attackCooldown || 2.0;
            }
        },
    },

    /** 接近后自爆（范围伤害） */
    bomber: {
        update(enemy, dt, player) {
            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (!enemy._bombTimer && !enemy._exploded) {
                // 冲向玩家
                if (dist > 5) {
                    const chargeSpeed = (enemy.speed || 120) * (1 + 0.5 * Math.min(1, 250 / Math.max(1, dist))) * dt;
                        enemy.x += (dx / dist) * chargeSpeed;
                        enemy.y += (dy / dist) * chargeSpeed;
                }

                if (dist < 40 && !enemy._bombTimer) {
                    enemy._bombTimer = 0.8;
                    enemy.flashTimer = 0.8;
                }
            }

            if (enemy._bombTimer > 0) {
                enemy._bombTimer -= dt;
                if (enemy._bombTimer <= 0 && !enemy._exploded) {
                    enemy._exploded = true;
                    // 爆炸伤害
                    const radius = enemy.explosionRadius || 80;
                    const dmg = enemy.damage * (enemy.explosionDamageMult || 1.5);

                    if (typeof PlayerSystem !== 'undefined' && PlayerSystem.player) {
                        const pDist = Math.sqrt(
                            (PlayerSystem.player.x - enemy.x) ** 2 + (PlayerSystem.player.y - enemy.y) ** 2
                        );
                        if (pDist < radius + (PlayerSystem.player.radius || 10)) {
                            const falloff = Math.max(0.5, 1 - pDist / (radius + 10) * 0.5);
                            PlayerSystem.takeDamage(Math.floor(dmg * falloff));
                            const angle = Math.atan2(PlayerSystem.player.y - enemy.y, PlayerSystem.player.x - enemy.x);
                            PlayerSystem.player.knockbackX = Math.cos(angle) * 400 * falloff;
                            PlayerSystem.player.knockbackY = Math.sin(angle) * 400 * falloff;
                        }
                    }

                    // 对其他敌人造成伤害
                    for (const other of EnemySystem.enemies) {
                        if (!other.alive || other === enemy) continue;
                        const odx = other.x - enemy.x;
                        const ody = other.y - enemy.y;
                        const oDist = Math.sqrt(odx * odx + ody * ody);
                        if (oDist < radius + (other.radius || 14)) {
                            const falloff = Math.max(0.5, 1 - oDist / (radius + 14) * 0.5);
                            other.hp -= Math.floor(dmg * 0.5 * falloff);
                            other.flashTimer = 0.1;
                        }
                    }

                    if (typeof ParticleSystem !== 'undefined') {
                        ParticleSystem.emit(enemy.x, enemy.y, 20, {
                            speed: 150, color: '#ff5500', life: 0.4, size: 6, type: 'spark',
                        });
                        ParticleSystem.emit(enemy.x, enemy.y, 10, {
                            speed: 80, color: '#ffcc00', life: 0.5, size: 12, type: 'glow',
                        });
                    }

                    enemy.hp = 0;
                    enemy.alive = false;
                }
            }
        },
    },

    /** 极低血量 × 极多数量，围攻 */
    swarm: {
        update(enemy, dt, player) {
            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // 群聚奖励：周围 100 内 ≥3 同类则加速
            let nearbySwarm = 0;
            for (const other of EnemySystem.enemies) {
                if (other === enemy || !other.alive) continue;
                if (other.behavior === 'swarm') {
                    const ox = other.x - enemy.x;
                    const oy = other.y - enemy.y;
                    if (Math.sqrt(ox * ox + oy * oy) < 100) nearbySwarm++;
                }
            }
            const packMult = nearbySwarm >= 3 ? 1.3 : 1.0;

            if (dist > 5) {
                const speed = (enemy.speed || 100) * packMult * dt;
                enemy.x += (dx / dist) * speed;
                enemy.y += (dy / dist) * speed;
            }

            enemy.attackTimer -= dt;
            if (enemy.attackTimer <= 0 && dist < (enemy.radius || 8) + (player.radius || 10) + 3) {
                if (typeof PlayerSystem !== 'undefined') {
                    PlayerSystem.takeDamage(enemy.damage || 4);
                    EnemySystem._triggerMechanicsOnAttack(enemy, enemy.damage || 4, player);
                }
                enemy.attackTimer = enemy.attackCooldown || 0.8;
            }
        },
    },

    /** 召唤小怪，远离玩家 */
    summoner: {
        update(enemy, dt, player) {
            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 200) {
                const speed = (enemy.speed || 65) * dt;
                enemy.x -= (dx / dist) * speed;
                enemy.y -= (dy / dist) * speed;
            } else {
                enemy.x += enemy.knockbackX * dt;
                enemy.y += enemy.knockbackY * dt;
            }

            enemy.summonTimer = enemy.summonTimer || 0;
            enemy.summonTimer -= dt;
            if (enemy.summonTimer <= 0) {
                const maxSummons = enemy.maxSummons || 5;
                const count = EnemySystem.countAlive('summoner');
                let chaserCount = 0;
                for (const e of EnemySystem.enemies) {
                    if (e.alive && e._isSummoned) chaserCount++;
                }
                if (chaserCount < maxSummons) {
                    const spawnCount = Math.min(3, maxSummons - chaserCount);
                    for (let i = 0; i < spawnCount; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const sx = enemy.x + Math.cos(angle) * 60;
                        const sy = enemy.y + Math.sin(angle) * 60;
                        const spawned = EnemySystem.create('chaser_basic', sx, sy, enemy.level || 1);
                        if (spawned) {
                            spawned._isSummoned = true;
                            spawned.materialValue = Math.floor((spawned.materialValue || 2) * 0.5);
                        }
                    }
                }
                enemy.summonTimer = enemy.summonCooldown || 4.0;
            }
        },
    },
};

// ============================================================
// 5 种特殊机制
// ============================================================
const SPECIAL_MECHANICS = {
    /** 死亡后分裂 2~3 只 */
    splitter: {
        onDeath(enemy) {
            const count = 2 + Math.floor(Math.random() * 2); // 2~3
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const sx = enemy.x + Math.cos(angle) * 20;
                const sy = enemy.y + Math.sin(angle) * 20;
                const split = {
                    typeId: 'split_spawn',
                    x: sx, y: sy,
                    hp: Math.floor((enemy.maxHp || 100) * 0.5),
                    maxHp: Math.floor((enemy.maxHp || 100) * 0.5),
                    speed: (enemy.speed || 80) * 0.8,
                    damage: Math.floor((enemy.damage || 10) * 0.7),
                    radius: (enemy.radius || 14) * 0.7,
                    color: enemy.color,
                    glowColor: enemy.glowColor,
                    level: enemy.level || 1,
                    alive: true,
                    aliveTimer: 1.0, // 1 秒无敌（防连锁分裂）
                    behavior: 'chaser',
                    attackCooldown: (enemy.attackCooldown || 1.5) * 0.8,
                    attackTimer: 0,
                    flashTimer: 0,
            knockbackRemaining: 0, knockbackDirX: 0, knockbackDirY: 0, stunTimer: 0,
                    slowTimer: 0, slowFactor: 0.5,
                    burnStacks: [],
                    preferredDist: 200,
                    _isSummoned: true,
                };
                EnemySystem.enemies.push(split);
            }
        },
    },

    /** 护盾（先扣盾再扣血） */
    shielded: {
        onInit(enemy) {
            enemy.shieldHp = enemy.maxHp * 0.5;
        },
    },

    /** 攻击回血 */
    leech: {
        onAttack(enemy, damageDealt, target) {
            const heal = Math.floor(damageDealt * 0.3);
            enemy.hp = Math.min(enemy.maxHp, enemy.hp + heal);
        },
    },

    /** 反弹部分伤害给玩家 */
    reflect: {
        onDamage(enemy, damage) {
            const reflectDmg = Math.floor(damage * 0.2);
            if (reflectDmg > 0 && typeof PlayerSystem !== 'undefined') {
                PlayerSystem.takeDamage(reflectDmg);
            }
        },
    },

    /** 攻击减速/冻结 */
    freezer: {
        onAttack(enemy, damageDealt, target) {
            if (target) {
                target.slowTimer = 1.5;
                target.slowFactor = 0.5;
            }
        },
    },
};

// ============================================================
// EnemySystem 主对象
// ============================================================

const EnemySystem = {
    /** 敌人实例数组 */
    enemies: [],

    /** 敌人类型定义（从 enemies.json 加载） */
    types: {},

    // -------------------------------------------------------
    // 数据加载
    // -------------------------------------------------------

    /**
     * 加载敌人类型数据
     */
    async loadEnemies() {
        try {
            const data = await DataLoader.load('enemies');
            this.types = {};
            for (const def of data) {
                this.types[def.id] = def;
                // 注册特殊机制
                if (def.specialMechanic && SPECIAL_MECHANICS[def.specialMechanic]) {
                    def._mechanicHandlers = SPECIAL_MECHANICS[def.specialMechanic];
                }
            }
        } catch (e) {
            console.warn('[EnemySystem] 加载敌人数据失败:', e.message);
        }
    },

    // -------------------------------------------------------
    // 创建/销毁
    // -------------------------------------------------------

    /**
     * 波次难度缩放
     * @param {Object} type - 敌人类型定义
     * @param {number} waveLevel
     * @returns {{ hp: number, damage: number, speed: number }}
     */
    scaleByWave(type, waveLevel, difficultyMult) {
        const level = Math.max(1, waveLevel || 1);
        // 难度曲线: 每波 +15%HP +15%DMG +5%SPD（增强玩家危险感）
        const hpMult = 1 + level * 0.15;
        const dmgMult = 1 + level * 0.15;
        const spdMult = 1 + level * 0.05;

        let extraHp = 0;
        let extraDmg = 0;
        // 精英从第8波开始额外 +15%/级
        if (type.isElite && level >= 8) {
            extraHp = (level - 8) * 0.15;
            extraDmg = (level - 8) * 0.15;
        }
        // Boss从第12波开始额外 +20%/级
        if (type.isBoss && level >= 12) {
            extraHp = (level - 12) * 0.20;
            extraDmg = (level - 12) * 0.20;
        }

        const diffMult = difficultyMult || 1;
        return {
            hp: Math.floor((type.hp || 30) * (hpMult + extraHp) * diffMult),
            damage: Math.floor((type.damage || 8) * (dmgMult + extraDmg) * diffMult),
            speed: Math.floor((type.speed || 80) * spdMult * (1 + (diffMult - 1) * 0.5)), // 速度缩放减半，避免太极端
        };
    },

    /**
     * 创建敌人实例
     */
    create(typeId, x, y, waveLevel, difficultyMult) {
        const type = this.types[typeId];
        if (!type) {
            console.warn('[EnemySystem] 未知敌人类型:', typeId, '已有类型:', Object.keys(this.types));
            return null;
        }

        const level = Math.max(1, waveLevel || 1);
        const scaled = this.scaleByWave(type, level, difficultyMult);

        const enemy = {
            typeId,
            x, y,
            hp: scaled.hp,
            maxHp: scaled.hp,
            speed: scaled.speed,
            damage: scaled.damage,
            radius: type.radius || 14,
            color: type.color || '#ff4444',
            glowColor: type.glowColor || '#ff0044',
            level,
            behavior: type.behavior || 'chaser',
            specialMechanic: type.specialMechanic || null,
            alive: true,
            // 状态
            attackTimer: Math.random() * (type.attackCooldown || 1.5),
            flashTimer: 0,
            knockbackX: 0, knockbackY: 0,  // 兼容旧字段 (主循环不再用)
            slowTimer: 0, slowFactor: 0.5,
            burnStacks: [],
            // 行为参数
            preferredDist: type.preferredDist || 200,
            bulletSpeed: type.bulletSpeed || 300,
            attackCooldown: type.attackCooldown || 1.5,
            explosionRadius: type.explosionRadius || 80,
            explosionDamageMult: type.explosionDamageMult || 1.5,
            summonCooldown: type.summonCooldown || 4.0,
            maxSummons: type.maxSummons || 5,
            // 稀有度/经验/掉落
            xpValue: type.xpValue || 5,
            materialValue: type.materialValue || 2,
            isElite: type.isElite || false,
            isBoss: type.isBoss || false,
        };

        // 初始化特殊机制
        if (enemy.specialMechanic && SPECIAL_MECHANICS[enemy.specialMechanic]) {
            const handlers = SPECIAL_MECHANICS[enemy.specialMechanic];
            if (handlers.onInit) handlers.onInit(enemy);
        }

        this.enemies.push(enemy);
        return enemy;
    },

    /**
     * 批量创建（波次系统调用）
     */
    createBatch(spawnList, waveLevel, difficultyMult) {
        if (!spawnList || spawnList.length === 0) return [];
        const results = [];
        for (const item of spawnList) {
            const e = this.create(item.typeId, item.x, item.y, waveLevel, difficultyMult);
            if (e) results.push(e);
        }
        return results;
    },

    /**
     * 移除敌人（触发 onDeath 机制）
     */
    destroy(enemy) {
        if (!enemy || !enemy.alive) return;
        enemy.alive = false;

        // 触发 onDeath 特殊机制
        if (enemy.specialMechanic && SPECIAL_MECHANICS[enemy.specialMechanic]) {
            const handlers = SPECIAL_MECHANICS[enemy.specialMechanic];
            if (handlers.onDeath) handlers.onDeath(enemy);
        }
    },

    // -------------------------------------------------------
    // 每帧更新
    // -------------------------------------------------------

    /**
     * 更新所有敌人
     */
    update(dt, player) {
        if (!player) return;

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (!e.alive) {
                this.enemies.splice(i, 1);
                continue;
            }

            // 无敌计时（分裂体）
            if (e.aliveTimer > 0) {
                e.aliveTimer -= dt;
            }

            // 通用状态更新
            if (e.flashTimer > 0) e.flashTimer -= dt;

            // 击退位移 (一次性推 N 像素, kbSpeed 600 px/s 推完)
            if (e.knockbackRemaining > 0) {
                const kbSpeed = 600;
                const step = Math.min(e.knockbackRemaining, kbSpeed * dt);
                e.x += (e.knockbackDirX || 0) * step;
                e.y += (e.knockbackDirY || 0) * step;
                e.knockbackRemaining -= step;
            }

            // 击退 stun (AI 暂停, 不追不攻击)
            if (e.stunTimer > 0) {
                e.stunTimer -= dt;
                if (e.stunTimer > 0) continue;
            }

            // 减速
            if (e.slowTimer > 0) {
                e.slowTimer -= dt;
                // 减速已被应用到 speed 计算中
            }

            // 燃烧 DOT
            this._updateBurnDOT(e, dt);

            // 行为 AI
            this._updateEnemyAI(e, dt, player);

            // 边界钳制
            if (typeof GameWorld !== 'undefined') {
                e.x = Math.max(10, Math.min(GameWorld.width - 10, e.x));
                e.y = Math.max(10, Math.min(GameWorld.height - 10, e.y));
            }
        }
    },

    /**
     * 燃烧 DOT 更新
     */
    _updateBurnDOT(e, dt) {
        if (!e.burnStacks || e.burnStacks.length === 0) return;
        for (let si = e.burnStacks.length - 1; si >= 0; si--) {
            const stack = e.burnStacks[si];
            stack.remaining -= dt;
            if (stack.remaining <= 0) {
                e.burnStacks.splice(si, 1);
                continue;
            }
            e.hp -= stack.dps * dt;
        }
        if (e.hp <= 0 && e.alive) {
            e.hp = 0;
            this.destroy(e);
        }
    },

    /**
     * 根据 behavior 分发 AI 更新
     */
    _updateEnemyAI(e, dt, player) {
        // behavior 别名映射（enemies.json 命名 → BEHAVIORS 键）
        const BEHAVIOR_ALIAS = {
            'chase': 'chaser',
            'ranged': 'shooter',
            'explode': 'bomber',
            'heal': 'chaser',
            'mortar': 'shooter',
            'blink': 'chaser',
        };
        const behaviorKey = BEHAVIOR_ALIAS[e.behavior] || e.behavior;
        const behaviorFn = BEHAVIORS[behaviorKey];
        if (behaviorFn) {
            behaviorFn.update(e, dt, player);
        }

        // HP 检查（行为中可能设置了 alive=false，如 bomber 自爆）
        if (e.hp <= 0 && e.alive) {
            e.hp = 0;
            this.destroy(e);
        }
    },

    /**
     * 触发攻击类特殊机制（leech / freezer）
     * 在行为造成伤害后由 BEHAVIORS 调用
     */
    _triggerMechanicsOnAttack(enemy, damageDealt, target) {
        if (!enemy.specialMechanic) return;
        const handlers = SPECIAL_MECHANICS[enemy.specialMechanic];
        if (!handlers) return;

        if (handlers.onAttack && damageDealt > 0) {
            handlers.onAttack(enemy, damageDealt, target);
        }
    },

    /**
     * 受击处理
     * @returns {number} -1=击杀, 0=存活, 1=未命中
     */
    takeDamage(enemy, damage) {
        if (!enemy || !enemy.alive) return 1;

        // 无敌
        if (enemy.aliveTimer > 0) return 1;

        let actualDamage = damage;

        // Shielded: 先扣盾
        if (enemy.specialMechanic === 'shielded' && enemy.shieldHp > 0) {
            const shieldDmg = Math.min(enemy.shieldHp, actualDamage);
            enemy.shieldHp -= shieldDmg;
            actualDamage -= shieldDmg;
        }

        // Reflect: 反弹伤害
        if (enemy.specialMechanic === 'reflect' && actualDamage > 0) {
            const handlers = SPECIAL_MECHANICS.reflect;
            if (handlers.onDamage) handlers.onDamage(enemy, actualDamage);
        }

        if (actualDamage <= 0) return 0;

        enemy.hp -= actualDamage;
        enemy.flashTimer = 0.1;

        // 击退
        if (typeof PlayerSystem !== 'undefined' && PlayerSystem.player) {
            const p = PlayerSystem.player;
            const dx = enemy.x - p.x;
            const dy = enemy.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            this.applyKnockback(enemy, dx, dy, dist, 300);
        }

        // 受击特效
        if (typeof ParticleSystem !== 'undefined') {
            ParticleSystem.emit(enemy.x, enemy.y, 4, {
                speed: 60, color: enemy.color, life: 0.2, size: 3, type: 'spark',
            });
        }

        if (enemy.hp <= 0) {
            enemy.hp = 0;
            this.destroy(enemy);
            return -1;
        }
        return 0;
    },

    // -------------------------------------------------------
    // 击退 (Brotato 风格: 近战强 / 射击弱 + 大体型抗性)
    // -------------------------------------------------------

    /**
     * 应用击退到敌人
     * @param {Object} e     敌人实例
     * @param {number} dx    方向 X（朝向敌人的反向,或击退方向）
     * @param {number} dy    方向 Y
     * @param {number} dist  距离
     * @param {number} kbStr 武器击退强度（无单位,与武器定义对应）
     * @param {Object} [opts] { ranged:bool=false, mass:number=auto }
     *   - ranged=true  → 远程武器(子弹/箭/魔法),击退效果 ×0.2
     *   - mass         → 自定义质量倍数(基于radius=14基准,1.0=basic)
     *   - 精英/Boss    → 免疫击退
     */
    /**
     * 应用击退（距离 + 方向 + stun，Brotato 风格）
     * 击退本质: 一次性推 N 像素(非累加速度)，同时 stun 0.15-0.25s
     * @param {Object} e          敌人
     * @param {number} dx         方向 X (e-攻击者)
     * @param {number} dy         方向 Y
     * @param {number} dist       |dx,dy| 距离(>0)
     * @param {number} kbStr      击退力度
     * @param {Object} [opts]     { ranged, mass }
     *   - ranged=true    远程武器击退更弱 + 短 stun
     *   - mass           自定义质量(默认 auto = (radius/14)²)
     */
    applyKnockback(e, dx, dy, dist, kbStr, opts = {}) {
        if (!e || !e.alive) return 0;
        if (e.isElite || e.isBoss) return 0;
        if (!kbStr || kbStr <= 0) return 0;

        const rangedFactor = opts.ranged ? 0.2 : 1.0;
        const radius = e.radius || 14;
        const mass = opts.mass != null ? opts.mass : Math.pow(radius / 14, 2);
        const final = (kbStr * rangedFactor) / mass;
        if (final < 0.1) return 0;

        const norm = dist > 0 ? 1 / dist : 0;
        // 累加: 多次击退(如穿刺多弹) 累加剩余距离
        e.knockbackRemaining = (e.knockbackRemaining || 0) + final;
        e.knockbackDirX = dx * norm;
        e.knockbackDirY = dy * norm;
        // stun (远程 0.15s, 近战 0.25s, 取长)
        const stunDur = opts.ranged ? 0.15 : 0.25;
        e.stunTimer = Math.max(e.stunTimer || 0, stunDur);
        return final;
    },

    // -------------------------------------------------------
    // 子弹发射
    // -------------------------------------------------------

    /**
     * 敌人发射子弹
     */
    fireBullet(enemy, player) {
        if (!enemy || !player) return;
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const angle = Math.atan2(dy, dx);
        if (typeof BulletSystem !== 'undefined') {
            BulletSystem.create(enemy.x, enemy.y, angle, enemy.damage || 12, enemy.bulletSpeed || 350, 0, false);
        }
    },

    // -------------------------------------------------------
    // AI 辅助
    // -------------------------------------------------------

    /**
     * 获取 Build 克制类型
     */
    getCounterTypes(tagCounts) {
        if (!tagCounts) return [];
        const counters = [];
        if ((tagCounts.fire || 0) + (tagCounts.explosive || 0) >= 2) counters.push('tank');
        if ((tagCounts.crit || 0) >= 2) counters.push('swarm');
        if ((tagCounts.tech || 0) >= 2) counters.push('bomber');
        if ((tagCounts.melee || 0) >= 2) counters.push('shooter');
        if ((tagCounts.melee || 0) >= 2) counters.push('freezer_chaser');
        return counters;
    },

    /**
     * 统计指定类型存活数量
     */
    countAlive(typeId) {
        return this.enemies.filter(e => e.alive && e.typeId === typeId).length;
    },

    // -------------------------------------------------------
    // 清理
    // -------------------------------------------------------

    clear() {
        this.enemies = [];
    },
};

// ============================================================
// 导出
// ============================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EnemySystem, BEHAVIORS, SPECIAL_MECHANICS };
}
