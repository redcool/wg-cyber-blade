// ============================================================
// src/engine/enemy.js — 敌人 AI 系统：行为 + 5 机制 + Build 克制
// 依赖: data.js (DataLoader), stats.js (StatsSystem), animator.js
// ============================================================

// Animator 双环境兼容(浏览器: index.html 先加载 animator.js → globalThis.Animator;
// vitest/Node: 调用方需保证 global.Animator 已设;否则 null 兜底跳过动画)
// 注意: 浏览器 <script> 共享全局 lexical scope, 不能用 const (跨文件重名冲突); 用 var 允许重复声明
var _Animator = (typeof globalThis !== 'undefined' && globalThis.Animator) || null;

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

/** 敌人 _uid 计数器(供呼吸动画错相位 / 击中去重) */
let _enemyUidCounter = 0;

/** 接触距离: 敌半径 + 玩家半径 + 15px 走位缓冲 (默认30, 减半让怪靠得更近) */
const _touchDist = (e, p) => (e.radius || 14) + (p.radius || 10) + 15;

/** 怪到玩家距离 (用 Vec2.dist 替代手写 sqrt, 演示 math 模块) */
const _distToPlayer = (e, p) => {
    if (typeof Vec2 !== 'undefined') return Vec2.dist(e, p);
    return Math.hypot(e.x - p.x, e.y - p.y);
};

const BEHAVIORS = {
    /** 追击玩家，直线移动 + 接触伤害 */
    chaser: {
        update(enemy, dt, player) {
            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > _touchDist(enemy, player)) {
                const speed = (enemy.speed || 80) * dt;
                enemy.x += (dx / dist) * speed;
                enemy.y += (dy / dist) * speed;
            }

            enemy.attackTimer -= dt;
            if (enemy.attackTimer <= 0 && dist < _touchDist(enemy, player)) {
                if (typeof PlayerSystem !== 'undefined') {
                    PlayerSystem.takeDamage(enemy.damage || 8);
                    // 触发特殊机制（leech / freezer）
                    EnemySystem._triggerMechanicsOnAttack(enemy, enemy.damage || 8, player);
                    // v1.3: 移除接触击退 (Brotato 规则): 怪只造成伤害, 不推玩家
                    // 多怪围攻时击退叠加会压过玩家输入速度, 导致无法移动
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
            const touchDist = _touchDist(enemy, player);

            if (dir > 0) {
                // 追击: 距离玩家 > _touchDist 才推动(避免合体)
                if (dist > touchDist) {
                    enemy.x += (dx / dist) * speed * dir;
                    enemy.y += (dy / dist) * speed * dir;
                }
            } else {
                // 逃离: 忽略 _touchDist, 持续远离玩家
                enemy.x += (dx / dist) * speed * dir;
                enemy.y += (dy / dist) * speed * dir;
            }

            enemy.attackTimer -= dt;
            if (enemy.attackTimer <= 0 && dist < _touchDist(enemy, player)) {
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
                if (dist > _touchDist(enemy, player)) {
                    const speed = (enemy.speed || 45) * 2 * dt;
                    enemy.x += (dx / dist) * speed;
                    enemy.y += (dy / dist) * speed;
                }
                // 冲锋中无视击退
                enemy.knockbackRemaining = 0;
            } else {
                // 正常慢速接近
                if (dist > _touchDist(enemy, player)) {
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
            if (enemy.attackTimer <= 0 && dist < _touchDist(enemy, player)) {
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
                if (dist > _touchDist(enemy, player)) {
                    const boostDist = SystemConfig.get('bomberChargeBoostDist');
                    const chargeSpeed = (enemy.speed || 120) * (1 + 0.5 * Math.min(1, boostDist / Math.max(1, dist))) * dt;
                        enemy.x += (dx / dist) * chargeSpeed;
                        enemy.y += (dy / dist) * chargeSpeed;
                }

                if (dist < SystemConfig.get('bomberProximityDist') && !enemy._bombTimer) {
                    enemy._bombTimer = SystemConfig.get('bomberFuseTime');
                    enemy.flashTimer = SystemConfig.get('bomberFuseTime');
                }
            }

            if (enemy._bombTimer > 0) {
                enemy._bombTimer -= dt;
                if (enemy._bombTimer <= 0 && !enemy._exploded) {
                    enemy._exploded = true;
                    // 爆炸伤害
                    const radius = enemy.explosionRadius || SystemConfig.get('bomberExplosionRadius');
                    const dmg = enemy.damage * (enemy.explosionDamageMult || SystemConfig.get('bomberExplosionDmgMult'));

                    if (typeof PlayerSystem !== 'undefined' && PlayerSystem.player) {
                        const pDist = Math.sqrt(
                            (PlayerSystem.player.x - enemy.x) ** 2 + (PlayerSystem.player.y - enemy.y) ** 2
                        );
                        if (pDist < radius + (PlayerSystem.player.radius || 10)) {
                            const falloff = Math.max(0.5, 1 - pDist / (radius + 10) * 0.5);
                            PlayerSystem.takeDamage(Math.floor(dmg * falloff));
                            const angle = Math.atan2(PlayerSystem.player.y - enemy.y, PlayerSystem.player.x - enemy.x);
                            const kbForce = SystemConfig.get('bomberKbForce');
                            PlayerSystem.player.knockbackX = Math.cos(angle) * kbForce * falloff;
                            PlayerSystem.player.knockbackY = Math.sin(angle) * kbForce * falloff;
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
                            other.hp -= Math.floor(dmg * SystemConfig.get('bomberEnemyDmgPct') * falloff);
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

            // 群聚奖励：周围 packRadius 内 ≥packCount 同类则加速
            const packRadius = SystemConfig.get('swarmPackRadius');
            const packCount = SystemConfig.get('swarmPackCount');
            const packSpeedMult = SystemConfig.get('swarmPackSpeedMult');
            let nearbySwarm = 0;
            for (const other of EnemySystem.enemies) {
                if (other === enemy || !other.alive) continue;
                if (other.behavior === 'swarm') {
                    const ox = other.x - enemy.x;
                    const oy = other.y - enemy.y;
                    if (Math.sqrt(ox * ox + oy * oy) < packRadius) nearbySwarm++;
                }
            }
            const packMult = nearbySwarm >= packCount ? packSpeedMult : 1.0;

            if (dist > _touchDist(enemy, player)) {
                const speed = (enemy.speed || 100) * packMult * dt;
                enemy.x += (dx / dist) * speed;
                enemy.y += (dy / dist) * speed;
            }

            enemy.attackTimer -= dt;
            if (enemy.attackTimer <= 0 && dist < _touchDist(enemy, player)) {
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
                const maxSummons = enemy.maxSummons || SystemConfig.get('summonerMaxSummons');
                const count = EnemySystem.countAlive('summoner');
                let chaserCount = 0;
                for (const e of EnemySystem.enemies) {
                    if (e.alive && e._isSummoned) chaserCount++;
                }
                if (chaserCount < maxSummons) {
                    const spawnCount = Math.min(SystemConfig.get('summonerSpawnCount'), maxSummons - chaserCount);
                    for (let i = 0; i < spawnCount; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const sx = enemy.x + Math.cos(angle) * SystemConfig.get('summonerSpawnOffset');
                        const sy = enemy.y + Math.sin(angle) * SystemConfig.get('summonerSpawnOffset');
                        const spawned = EnemySystem.create('chaser_basic', sx, sy, enemy.level || 1);
                        if (spawned) {
                            spawned._isSummoned = true;
                            spawned.materialValue = Math.floor((spawned.materialValue || 2) * SystemConfig.get('summonerMatMult'));
                        }
                    }
                }
                enemy.summonTimer = enemy.summonCooldown || SystemConfig.get('summonerCooldown');
            }
        },
    },

    /** 治疗者：保持距离，治疗受伤友军 */
    healer: {
        update(enemy, dt, player) {
            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const preferred = enemy.preferredDist || 250;

            // 保持距离
            if (dist < preferred - 60) {
                const speed = (enemy.speed || 60) * dt;
                enemy.x -= (dx / dist) * speed;
                enemy.y -= (dy / dist) * speed;
            } else if (dist > preferred + 60) {
                const speed = (enemy.speed || 60) * dt;
                enemy.x += (dx / dist) * speed;
                enemy.y += (dy / dist) * speed;
            }

            // 治疗近处受伤友军
            enemy.healTimer = enemy.healTimer || 0;
            enemy.healTimer -= dt;
            if (enemy.healTimer <= 0) {
                const healRange = enemy.healRange || 120;
                const healAmount = enemy.healAmount || 10;
                let healed = false;
                for (const other of EnemySystem.enemies) {
                    if (other === enemy || !other.alive) continue;
                    const odx = other.x - enemy.x;
                    const ody = other.y - enemy.y;
                    const oDist = Math.sqrt(odx * odx + ody * ody);
                    if (oDist < healRange && other.hp < other.maxHp) {
                        other.hp = Math.min(other.maxHp, other.hp + healAmount);
                        if (typeof ParticleSystem !== 'undefined') {
                            ParticleSystem.emit(other.x, other.y, 2, {
                                speed: 30, color: '#44ff44', life: 0.3, size: 4, type: 'spark',
                            });
                        }
                        healed = true;
                        break;
                    }
                }
                // 无治疗目标时当 chaser
                if (!healed && dist > _touchDist(enemy, player)) {
                    const speed = (enemy.speed || 60) * dt;
                    enemy.x += (dx / dist) * speed;
                    enemy.y += (dy / dist) * speed;
                }
                enemy.healTimer = enemy.healCooldown || 2.0;
            }

            // 接触伤害（被近身时自卫）
            enemy.attackTimer -= dt;
            if (enemy.attackTimer <= 0 && dist < _touchDist(enemy, player)) {
                if (typeof PlayerSystem !== 'undefined') {
                    PlayerSystem.takeDamage(enemy.damage || 6);
                    EnemySystem._triggerMechanicsOnAttack(enemy, enemy.damage || 6, player);
                }
                enemy.attackTimer = enemy.attackCooldown || 2.0;
            }
        },
    },

    /** 闪现者：周期性瞬移靠近玩家 */
    blinker: {
        update(enemy, dt, player) {
            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // 普通移动（chaser 逻辑）
            if (dist > _touchDist(enemy, player)) {
                const speed = (enemy.speed || 80) * dt;
                enemy.x += (dx / dist) * speed;
                enemy.y += (dy / dist) * speed;
            }

            // 冷却递减
            enemy.blinkTimer = enemy.blinkTimer || 0;
            enemy.blinkTimer -= dt;

            // 闪烁瞬移
            if (enemy.blinkTimer <= 0 && dist > 100) {
                const blinkDist = enemy.blinkDist || 150;
                const angle = Math.atan2(dy, dx);
                // 瞬移到玩家附近的随机偏移位置
                const offsetAngle = angle + (Math.random() - 0.5) * 1.0;
                const offsetDist = Math.min(blinkDist, dist - 60) * (0.5 + Math.random() * 0.5);
                enemy.x = player.x - Math.cos(offsetAngle) * offsetDist;
                enemy.y = player.y - Math.sin(offsetAngle) * offsetDist;
                // 闪烁后短暂无敌
                enemy.invulnTimer = enemy.invulnTimer || 0;
                enemy.invulnTimer += 0.15;

                if (typeof ParticleSystem !== 'undefined') {
                    ParticleSystem.emit(enemy.x, enemy.y, 8, {
                        speed: 80, color: '#aa66ff', life: 0.3, size: 8, type: 'glow',
                    });
                }
                enemy.blinkTimer = enemy.blinkCooldown || 3.0;
            }

            // 接触伤害
            enemy.attackTimer -= dt;
            if (enemy.attackTimer <= 0 && dist < _touchDist(enemy, player)) {
                if (typeof PlayerSystem !== 'undefined') {
                    PlayerSystem.takeDamage(enemy.damage || 10);
                    EnemySystem._triggerMechanicsOnAttack(enemy, enemy.damage || 10, player);
                }
                enemy.attackTimer = enemy.attackCooldown || 1.2;
            }
        },
    },

    /** 迫击者：保持距离，抛射范围炮弹 */
    mortar: {
        update(enemy, dt, player) {
            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const preferred = enemy.preferredDist || 350;

            // 保持距离
            if (dist < preferred - 80) {
                const speed = (enemy.speed || 50) * dt;
                enemy.x -= (dx / dist) * speed;
                enemy.y -= (dy / dist) * speed;
            } else if (dist > preferred + 80) {
                const speed = (enemy.speed || 50) * dt;
                enemy.x += (dx / dist) * speed;
                enemy.y += (dy / dist) * speed;
            }

            // 发射迫击炮弹
            enemy.mortarTimer = enemy.mortarTimer || 0;
            enemy.mortarTimer -= dt;
            if (enemy.mortarTimer <= 0 && dist < 600) {
                const angle = Math.atan2(dy, dx);
                const mortarDmg = enemy.mortarDamage || (enemy.damage || 15) * 2;
                const mortarSpeed = enemy.mortarSpeed || 200;
                const mortarRadius = enemy.mortarRadius || 60;
                if (typeof BulletSystem !== 'undefined') {
                    BulletSystem.create(enemy.x, enemy.y, angle, mortarDmg, mortarSpeed, 0, false, 'mortar', { isMortar: true, splashRadius: mortarRadius });
                }
                enemy.mortarTimer = enemy.mortarCooldown || 4.0;
            }

            // 接触伤害（被近身时自卫）
            enemy.attackTimer -= dt;
            if (enemy.attackTimer <= 0 && dist < _touchDist(enemy, player)) {
                if (typeof PlayerSystem !== 'undefined') {
                    PlayerSystem.takeDamage(enemy.damage || 6);
                    EnemySystem._triggerMechanicsOnAttack(enemy, enemy.damage || 6, player);
                }
                enemy.attackTimer = enemy.attackCooldown || 2.0;
            }
        },
    },
};

// ============================================================
// 5 种特殊机制
// ============================================================
const SPECIAL_MECHANICS = {
    /** 死亡后分裂 2~3 个 */
    splitter: {
        onDeath(enemy) {
            const count = SystemConfig.get('splitCount') + Math.floor(Math.random() * SystemConfig.get('splitRandomExtra'));
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const sx = enemy.x + Math.cos(angle) * SystemConfig.get('splitSpawnOffset');
                const sy = enemy.y + Math.sin(angle) * SystemConfig.get('splitSpawnOffset');
                const split = {
                    typeId: 'split_spawn',
                    x: sx, y: sy,
                    hp: Math.floor((enemy.maxHp || 100) * SystemConfig.get('splitHpPct')),
                    maxHp: Math.floor((enemy.maxHp || 100) * SystemConfig.get('splitHpPct')),
                    speed: (enemy.speed || 80) * SystemConfig.get('splitSpeedMult'),
                    damage: Math.floor((enemy.damage || 10) * SystemConfig.get('splitDmgMult')),
                    radius: (enemy.radius || 14) * SystemConfig.get('splitRadiusMult'),
                    color: enemy.color,
                    glowColor: enemy.glowColor,
                    level: enemy.level || 1,
                    alive: true,
                    aliveTimer: SystemConfig.get('splitInvulnTime'),
                    behavior: 'chaser',
                    attackCooldown: (enemy.attackCooldown || 1.5) * SystemConfig.get('splitAtkCdMult'),
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
            enemy.shieldHp = enemy.maxHp * SystemConfig.get('shieldHpPct');
        },
    },

    /** 攻击回血 */
    leech: {
        onAttack(enemy, damageDealt, target) {
            const heal = Math.floor(damageDealt * SystemConfig.get('leechPct'));
            enemy.hp = Math.min(enemy.maxHp, enemy.hp + heal);
        },
    },

    /** 反弹部分伤害给玩家 */
    reflect: {
        onDamage(enemy, damage) {
            const reflectDmg = Math.floor(damage * SystemConfig.get('reflectPct'));
            if (reflectDmg > 0 && typeof PlayerSystem !== 'undefined') {
                PlayerSystem.takeDamage(reflectDmg);
            }
        },
    },

    /** 攻击减速 冻结 */
    freezer: {
        onAttack(enemy, damageDealt, target) {
            if (target) {
                target.slowTimer = SystemConfig.get('freezeSlowDuration');
                target.slowFactor = SystemConfig.get('freezeSlowFactor');
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
        // 从 SystemConfig 读取难度缩放系数（如有）
        const hpScale = SystemConfig.get('hpScale');
        const dmgScale = SystemConfig.get('dmgScale');
        const spdScale = SystemConfig.get('spdScale');
        const spdMultFactor = SystemConfig.get('spdMult');
        const eliteStart = SystemConfig.get('eliteStartWave');
        const eliteExtra = SystemConfig.get('eliteExtraScale');
        const bossStart = SystemConfig.get('bossStartWave');
        const bossExtra = SystemConfig.get('bossExtraScale');

        const hpMult = 1 + level * hpScale;
        const dmgMult = 1 + level * dmgScale;
        const spdMult = 1 + level * spdScale * spdMultFactor;

        let extraHp = 0;
        let extraDmg = 0;
        // 精英从指定波次开始额外缩放
        if (type.isElite && level >= eliteStart) {
            extraHp = (level - eliteStart) * eliteExtra;
            extraDmg = (level - eliteStart) * eliteExtra;
        }
        // Boss从指定波次开始额外缩放
        if (type.isBoss && level >= bossStart) {
            extraHp = (level - bossStart) * bossExtra;
            extraDmg = (level - bossStart) * bossExtra;
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
            _uid: ++_enemyUidCounter,
            typeId,
            x, y,
            animator: _Animator ? _Animator.create({ phase: _enemyUidCounter * 0.7 }) : null,
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
            knockbackX: 0, knockbackY: 0,  // 兼容旧字段(主循环不再用)
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

            // 无敌计时（分裂体用）
            if (e.aliveTimer > 0) {
                e.aliveTimer -= dt;
            }

            // 通用状态更新
            if (e.flashTimer > 0) e.flashTimer -= dt;
            // 击退 i-frame 衰减 (0.3s 免疫)
            if (e.kbImmuneTimer > 0) e.kbImmuneTimer -= dt;

            // 击退位移 (一次性推 N 像素, kbSpeed 600 px/s 推完)
            if (e.knockbackRemaining > 0) {
                const kbSpeed = 600;
                const step = Math.min(e.knockbackRemaining, kbSpeed * dt);
                e.x += (e.knockbackDirX || 0) * step;
                e.y += (e.knockbackDirY || 0) * step;
                e.knockbackRemaining -= step;
            }

            // 击退 stun (AI 暂停, 不追不攻)
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

            // 动画状态切换: 怪在攻击 cd 中(attackTimer > 0) 是 attack, 否则 idle
            if (_Animator && e.animator) {
                _Animator.update(e.animator, dt);
                if (e.inAttackRange && e.attackTimer > 0) {
                    _Animator.setState(e.animator, 'attack');
                } else {
                    _Animator.setState(e.animator, 'idle');
                }
            }

            // 边界钳制
            if (typeof GameWorld !== 'undefined') {
                e.x = Math.max(10, Math.min(GameWorld.width - 10, e.x));
                e.y = Math.max(10, Math.min(GameWorld.height - 10, e.y));
            }
        }

        // ====== 重建空间网格 (供武器碰撞粗筛用) ======
        if (typeof SpatialGrid !== 'undefined') {
            if (!this._grid) {
                const w = (typeof GameWorld !== 'undefined' && GameWorld.width)  || 3000;
                const h = (typeof GameWorld !== 'undefined' && GameWorld.height) || 3000;
                this._grid = SpatialGrid.create(80, w, h);
            }
            SpatialGrid.rebuild(this._grid, this.enemies);
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
        // behavior 别名映射（enemies.json/C SV 命名 → BEHAVIORS 键）
        const BEHAVIOR_ALIAS = {
            'chase': 'chaser',
            'ranged': 'shooter',
            'explode': 'bomber',
            'heal': 'healer',
            'mortar': 'mortar',
            'blink': 'blinker',
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
    // 击退 (Brotato 风格: 近战强/ 射击弱 + 大体型抗性)
    // -------------------------------------------------------

    /**
     * 应用击退到敌人
     * @param {Object} e     敌人实例
     * @param {number} dx    方向 X（朝向敌人的反向,或击退方向）
     * @param {number} dy    方向 Y
     * @param {number} dist  距离
     * @param {number} kbStr 武器击退强度（无单位,与武器定义对应）
     * @param {Object} [opts] { ranged:bool=false, mass:number=auto }
     *   - ranged=true  是远程武器(子弹/魔法),击退效果 ×0.2
     *   - mass         是自定义质量倍数(基于radius=14基准,1.0=basic)
     *   - 精英/Boss    是免疫击退
     */
    /**
     * 应用击退（距离 + 方向 + stun，Brotato 风格）
     * 击退本质: 一次性推 N 像素(非累加速度)，同时 stun 0.15-0.25s
     * @param {Object} e          敌人
     * @param {number} dx         方向 X (e→攻击者)
     * @param {number} dy         方向 Y
     * @param {number} dist       |dx,dy| 距离(>0)
     * @param {number} kbStr      击退力度
     * @param {Object} [opts]     { ranged, mass }
     *   - ranged=true    远程武器击退更弱 + 短 stun
     *   - mass           自定义质量:默认 auto = (radius/14)²)
     */
    /**
     * 击退系统 (Brotato 风格)
     * - kbStr 是 Brotato 单位值(hand=30, trident=-30, 范围 ±100)
     *   单位换算: 1 单位 = 2.5 像素 (30 单位 = 75 像素)
     * - i-frame: 敌人 0.3s 免疫再次击退, 防止反复推
     * - 不累加: 多次击退取 cap, 避免过远
     * - cap: 150 像素, 防止极端
     * - mass: (radius/14)² 体型抗性: 远程 ×0.2 弱化
     * - 负 kbStr = 拉近 (Trident 风格)
     */
    applyKnockback(e, dx, dy, dist, kbStr, opts = {}) {
        if (!e || !e.alive) return 0;
        if (e.isElite || e.isBoss) return 0;
        if (!kbStr) return 0;

        // 从 SystemConfig 读取击退参数（如有）
        const PIXELS_PER_UNIT = SystemConfig.get('knockbackPixelsPerUnit');
        const MAX_KB_PIXELS = SystemConfig.get('maxKbPixels');
        const kbImmuneTime = SystemConfig.get('kbImmuneTime');
        const stunRanged = SystemConfig.get('stunRanged');
        const stunMelee = SystemConfig.get('stunMelee');
        const kbSpeed = SystemConfig.get('kbSpeed');

        // i-frame 免疫 (防止反复推)
        if ((e.kbImmuneTimer || 0) > 0) return 0;

        const rangedFactor = opts.ranged ? 0.2 : 1.0;
        const radius = e.radius || 14;
        const mass = opts.mass != null ? opts.mass : Math.pow(radius / 14, 2);

        // 单位 转 像素 (Brotato: 1 单位 = 2.5px; 30 单位 = 75 像素 ≈ 1/8 屏)
        const final = (kbStr * rangedFactor * PIXELS_PER_UNIT) / mass;
        // [DEBUG] 击退日志 — 需要时可取消注释
        // const tag = opts.ranged ? 'KB-RANGED' : 'KB';
        // console.warn(
        //     `[${tag}] src=${new Error().stack.split('\n')[2]?.trim()||'?'} `+
        //     `enemy="${e.name||e.type||e._uid||'?'}" r=${radius} mass=${mass.toFixed(2)} `+
        //     `kbRaw=${kbStr} ranged=${!!opts.ranged} rf=${rangedFactor} `+
        //     `final=${final.toFixed(0)} capped=${Math.min(MAX_KB_PIXELS,Math.abs(final))} `+
        //     `playerKb=${typeof PlayerSystem!=='undefined'&&PlayerSystem.player?(PlayerSystem.player.knockback||0):'?'}`
        // );

        if (Math.abs(final) < 0.1) return 0;

        // cap (防止过远, 包括负向拉近)
        const capped = Math.max(-MAX_KB_PIXELS, Math.min(MAX_KB_PIXELS, final));
        const norm = dist > 0 ? 1 / dist : 0;

        // 不再累加: 直接覆盖, 但保留 i-frame 期间的防护(防抖)
        e.knockbackRemaining = capped;
        e.knockbackDirX = dx * norm;
        e.knockbackDirY = dy * norm;
        // i-frame: kbImmuneTime 秒免疫再次击退
        e.kbImmuneTimer = kbImmuneTime;

        // stun (远程 stunRanged s, 近战 stunMelee s, 取长)
        const stunDur = opts.ranged ? stunRanged : stunMelee;
        e.stunTimer = Math.max(e.stunTimer || 0, stunDur);
        return capped;
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
