// ============================================================
// enemy.js - 敌人系统
// ============================================================
const EnemySystem = {
    enemies: [],

    // 敌人类型定义
    types: {
        basic: {
            name: '无人机兵',
            hp: 30,
            speed: 80,
            damage: 8,
            radius: 14,
            color: '#ff4444',
            glowColor: '#ff0044',
            xpValue: 5,
            materialValue: 2,
            attackCooldown: 1.5,
            behavior: 'chase'  // 直接追玩家
        },
        fast: {
            name: '疾行者',
            hp: 20,
            speed: 160,
            damage: 6,
            radius: 10,
            color: '#ff8800',
            glowColor: '#ff6600',
            xpValue: 6,
            materialValue: 2,
            attackCooldown: 1.2,
            behavior: 'chase'
        },
        tank: {
            name: '重装机兵',
            hp: 120,
            speed: 45,
            damage: 15,
            radius: 22,
            color: '#8844ff',
            glowColor: '#6622ff',
            xpValue: 12,
            materialValue: 5,
            attackCooldown: 2.0,
            behavior: 'chase'
        },
        ranged: {
            name: '狙击手',
            hp: 25,
            speed: 55,
            damage: 12,
            radius: 12,
            color: '#ff00aa',
            glowColor: '#ff0088',
            xpValue: 8,
            materialValue: 3,
            attackCooldown: 2.0,
            behavior: 'ranged',
            preferredDist: 250,
            bulletSpeed: 350
        },
        // ====== 新增敌人（4种） ======
        exploder: {
            name: '自爆者',
            hp: 40,
            speed: 120,
            damage: 12,
            radius: 16,
            color: '#ff5500',
            glowColor: '#ff2200',
            xpValue: 7,
            materialValue: 2,
            attackCooldown: 0,
            behavior: 'explode',
            explosionRadius: 80,
            explosionDamageMult: 1.5
        },
        healer: {
            name: '修复者',
            hp: 35,
            speed: 65,
            damage: 5,
            radius: 14,
            color: '#44ff88',
            glowColor: '#22ff66',
            xpValue: 9,
            materialValue: 3,
            attackCooldown: 2.5,
            behavior: 'heal',
            preferredDist: 250,
            healCooldown: 3.0,
            healRadius: 120,
            healAmount: 10
        },
        mortar: {
            name: '迫击者',
            hp: 30,
            speed: 40,
            damage: 18,
            radius: 14,
            color: '#aa44ff',
            glowColor: '#8822ff',
            xpValue: 10,
            materialValue: 4,
            attackCooldown: 3.0,
            behavior: 'mortar',
            preferredDist: 350,
            mortarCooldown: 3.0,
            mortarSpeed: 180
        },
        blinker: {
            name: '闪现者',
            hp: 25,
            speed: 90,
            damage: 14,
            radius: 12,
            color: '#ff44ff',
            glowColor: '#ff00ff',
            xpValue: 8,
            materialValue: 3,
            attackCooldown: 1.5,
            behavior: 'blink',
            blinkCooldown: 2.0,
            blinkDist: 100,
            dodgeChance: 0.3
        },
        elite: {
            name: '精英猎手',
            hp: 250,
            speed: 70,
            damage: 20,
            radius: 24,
            color: '#ffcc00',
            glowColor: '#ffaa00',
            xpValue: 30,
            materialValue: 15,
            attackCooldown: 1.0,
            behavior: 'chase',
            isElite: true
        },
        boss: {
            name: 'BOSS·毁灭者',
            hp: 800,
            speed: 55,
            damage: 30,
            radius: 36,
            color: '#ff0044',
            glowColor: '#ff0000',
            xpValue: 80,
            materialValue: 40,
            attackCooldown: 0.8,
            behavior: 'chase',
            isBoss: true
        }
    },

    /**
     * 创建敌人实例
     * @param {string} type - 敌人类型ID
     * @param {number} x, y - 生成坐标
     * @param {number} waveLevel - 关卡等级（用于难度缩放）
     */
    create(type, x, y, waveLevel = 1) {
        const t = this.types[type];
        if (!t) return null;

        // ====== 难度缩放系数（基于关卡等级） ======
        const level = Math.max(1, waveLevel);
        const hpMult  = 1 + (level - 1) * 0.12;
        const dmgMult = 1 + (level - 1) * 0.10;
        const spdMult = 1 + (level - 1) * 0.04;
        const xpMult  = 1 + (level - 1) * 0.10;
        const matMult = 1 + (level - 1) * 0.08;

        // 精英额外加成（从第10关起每关+10%）
        const eliteExtra = (t.isElite || t.isBoss) ? Math.max(0, level - 10) * 0.10 : 0;
        // Boss额外加成（从第15关起每关+15% HP, +12% DMG, +5% Speed）
        const bossExtraHP  = t.isBoss ? Math.max(0, level - 15) * 0.15 : 0;
        const bossExtraDMG = t.isBoss ? Math.max(0, level - 15) * 0.12 : 0;
        const bossExtraSPD = t.isBoss ? Math.max(0, level - 15) * 0.05 : 0;

        const e = {
            x, y,
            type: type,
            name: t.name,
            level: level,
            hp: t.hp * hpMult * (1 + eliteExtra + bossExtraHP),
            maxHp: t.hp * hpMult * (1 + eliteExtra + bossExtraHP),
            speed: t.speed * spdMult * (1 + bossExtraSPD),
            damage: t.damage * dmgMult * (1 + eliteExtra + bossExtraDMG),
            radius: t.radius,
            color: t.color,
            glowColor: t.glowColor,
            xpValue: Math.floor(t.xpValue * xpMult),
            materialValue: Math.floor(t.materialValue * matMult),
            attackCooldown: t.attackCooldown,
            behavior: t.behavior,
            preferredDist: t.preferredDist || 200,
            bulletSpeed: t.bulletSpeed || 300,
            // 新增敌人专用属性
            explosionRadius: t.explosionRadius || 80,
            explosionDamageMult: t.explosionDamageMult || 1.5,
            healCooldown: t.healCooldown || 3.0,
            healRadius: t.healRadius || 120,
            healAmount: t.healAmount || 10,
            mortarCooldown: t.mortarCooldown || 3.0,
            mortarSpeed: t.mortarSpeed || 180,
            blinkCooldown: t.blinkCooldown || 2.0,
            blinkDist: t.blinkDist || 100,
            dodgeChance: t.dodgeChance || 0,
            isElite: t.isElite || false,
            isBoss: t.isBoss || false,
            alive: true,
            attackTimer: Math.random() * t.attackCooldown,
            flashTimer: 0,
            knockbackX: 0,
            knockbackY: 0,
            // 特殊计时器
            healTimer: Math.random() * (t.healCooldown || 3.0),
            mortarTimer: Math.random() * (t.mortarCooldown || 3.0),
            blinkTimer: Math.random() * (t.blinkCooldown || 2.0),
            // 自爆标记
            _exploded: false,
            // 行走方向跟踪（用于方向帧动画）
            prevX: x,
            prevY: y,
            moveAngle: 0,
            isMovingEnemy: false,
            // 减速
            slowTimer: 0,
            slowFactor: 0.5,
            speedMult: 1.0
        };
        this.enemies.push(e);
        return e;
    },

    update(dt, player) {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (!e.alive) {
                this.enemies.splice(i, 1);
                continue;
            }

            // 闪避效果计时
            if (e.flashTimer > 0) e.flashTimer -= dt;

            // 击退衰减
            e.knockbackX *= 0.9;
            e.knockbackY *= 0.9;

            // 减速效果
            if (e.slowTimer > 0) {
                e.slowTimer -= dt;
                e.speedMult = e.slowFactor || 0.5;
            } else {
                e.speedMult = 1.0;
            }

            // ====== 燃烧DOT处理 ======
            if (e.burnStacks && e.burnStacks.length > 0) {
                for (let si = e.burnStacks.length - 1; si >= 0; si--) {
                    const stack = e.burnStacks[si];
                    stack.remaining -= dt;
                    if (stack.remaining <= 0) {
                        e.burnStacks.splice(si, 1);
                        continue;
                    }
                    // 每秒伤害
                    const dotDmg = stack.dps * dt;
                    e.hp -= dotDmg;
                    if (e.hp <= 0) break;
                }                    // 燃烧DOT日志（每秒记录一次）
                    e._burnLogTimer = (e._burnLogTimer || 0) + dt;
                    if (e._burnLogTimer >= 1.0) {
                        e._burnLogTimer = 0;
                        const totalBurnDmg = e.burnStacks.reduce((sum, s) => sum + s.dps, 0);
                    if (totalBurnDmg > 0 && typeof CombatLogSystem !== 'undefined') {
                        CombatLogSystem.addEventText(e.x, e.y - 15, `🔥${Math.round(totalBurnDmg)}`, '#ff8800', 12);
                        CombatLogSystem.logBurnDamage(totalBurnDmg);
                    }
                    }
                    // 燃烧粒子特效
                    if (e.burnStacks.length > 0 && Math.random() < 0.3) {
                    ParticleSystem.emit(e.x + (Math.random()-0.5)*10, e.y + (Math.random()-0.5)*10, 1, {
                        speed: 20, color: '#ff4400', life: 0.3, size: 3, type: 'glow'
                    });
                }
                // 检查燃烧DOT击杀
                if (e.hp <= 0 && e.alive) {
                    e.hp = 0;
                    e.alive = false;
                    // 燃烧传播（如果有扩散器）
                    if (PlayerSystem.player && PlayerSystem.player._burnSpreadLevel) {
                        PlayerSystem._spreadBurn(e);
                    }
                    // 冰爆触发（如果敌人有冰缓效果且死亡）
                    if (e.slowTimer > 0 && PlayerSystem.player) {
                        PlayerSystem._triggerIceExplosion(e);
                    }
                    continue;
                }
            }

            // AI行为
            const dx = player.x - e.x;
            const dy = player.y - e.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (e.behavior === 'chase') {
                // 追逐玩家
                if (dist > 5) {
                    const speed = e.speed * e.speedMult * dt;
                    e.x += (dx / dist) * speed + e.knockbackX * dt;
                    e.y += (dy / dist) * speed + e.knockbackY * dt;
                }
                // 碰撞伤害
                e.attackTimer -= dt;
                if (e.attackTimer <= 0 && dist < e.radius + player.radius + 5) {
                    if (typeof PlayerSystem !== 'undefined' && PlayerSystem.player) {
                        PlayerSystem.takeDamage(e.damage);
                    }
                    e.attackTimer = e.attackCooldown;
                    // 击退玩家
                    player.knockbackX = -dx / dist * 200;
                    player.knockbackY = -dy / dist * 200;
                }
            } else if (e.behavior === 'ranged') {
                // 保持距离射击
                if (dist < e.preferredDist - 30) {
                    const speed = e.speed * e.speedMult * dt;
                    e.x -= (dx / dist) * speed;
                    e.y -= (dy / dist) * speed;
                } else if (dist > e.preferredDist + 30) {
                    const speed = e.speed * e.speedMult * dt;
                    e.x += (dx / dist) * speed;
                    e.y += (dy / dist) * speed;
                }
                e.x += e.knockbackX * dt;
                e.y += e.knockbackY * dt;

                // 远程攻击
                e.attackTimer -= dt;
                if (e.attackTimer <= 0 && dist < 500) {
                    const angle = Math.atan2(dy, dx);
                    BulletSystem.create(
                        e.x, e.y, angle,
                        e.damage, e.bulletSpeed, 0, false
                    );
                    e.attackTimer = e.attackCooldown;
                    ParticleSystem.emit(e.x, e.y, 3, {
                        speed: 30,
                        color: e.color,
                        life: 0.2,
                        size: 3,
                        type: 'spark'
                    });
                }
            } else if (e.behavior === 'explode') {
                // ====== 自爆者：冲向玩家，接近即爆炸 ======
                if (dist > 5) {
                    // 距离越近速度越快
                    const chargeMult = 1 + 0.5 * Math.min(1, 250 / Math.max(1, dist));
                    const chargeSpeed = e.speed * e.speedMult * chargeMult * dt;
                    e.x += (dx / dist) * chargeSpeed + e.knockbackX * dt;
                    e.y += (dy / dist) * chargeSpeed + e.knockbackY * dt;
                }
                // 接近玩家即自爆
                if (dist < e.radius + player.radius + 15 && e.alive) {
                    this._explodeDamage(e, player);
                    e.alive = false;
                }
                // 死亡时也爆炸（在update外部takeDamage时检测）
            } else if (e.behavior === 'heal') {
                // ====== 修复者：保持距离，治疗友军 ======
                if (dist < e.preferredDist - 30) {
                    const speed = e.speed * e.speedMult * dt;
                    e.x -= (dx / dist) * speed;
                    e.y -= (dy / dist) * speed;
                } else if (dist > e.preferredDist + 30) {
                    const speed = e.speed * e.speedMult * dt;
                    e.x += (dx / dist) * speed;
                    e.y += (dy / dist) * speed;
                }
                e.x += e.knockbackX * dt;
                e.y += e.knockbackY * dt;

                // 治疗附近友军
                e.healTimer -= dt;
                if (e.healTimer <= 0) {
                    let healedAny = false;
                    for (const other of EnemySystem.enemies) {
                        if (!other.alive || other === e || other.hp >= other.maxHp) continue;
                        const hx = other.x - e.x, hy = other.y - e.y;
                        if (Math.sqrt(hx*hx + hy*hy) < e.healRadius) {
                            const healAmt = Math.floor(e.healAmount * (0.8 + Math.random() * 0.4));
                            other.hp = Math.min(other.maxHp, other.hp + healAmt);
                            healedAny = true;
                            ParticleSystem.emit(other.x, other.y, 3, {
                                speed: 30, color: '#44ff88', life: 0.3, size: 4, type: 'glow'
                            });
                            // 绿色治疗链粒子
                            const lx = (e.x + other.x) / 2, ly = (e.y + other.y) / 2;
                            ParticleSystem.emit(lx, ly, 2, {
                                speed: 20, color: '#44ff88', life: 0.2, size: 3, type: 'glow'
                            });
                        }
                    }
                    if (healedAny) {
                        ParticleSystem.emit(e.x, e.y, 4, {
                            speed: 40, color: '#44ff88', life: 0.4, size: 5, type: 'glow'
                        });
                    }
                    e.healTimer = e.healCooldown;
                }
            } else if (e.behavior === 'mortar') {
                // ====== 迫击者：极远距离发射抛物线弹 ======
                if (dist < e.preferredDist - 50) {
                    const speed = e.speed * e.speedMult * dt;
                    e.x -= (dx / dist) * speed;
                    e.y -= (dy / dist) * speed;
                } else if (dist > e.preferredDist + 50) {
                    const speed = e.speed * e.speedMult * dt;
                    e.x += (dx / dist) * speed;
                    e.y += (dy / dist) * speed;
                }
                e.x += e.knockbackX * dt;
                e.y += e.knockbackY * dt;

                // 发射迫击弹
                e.mortarTimer -= dt;
                if (e.mortarTimer <= 0 && dist < 600) {
                    // 预判玩家位置
                    const predictFactor = dist * 0.003;
                    const targetX = player.x + (player.x - player.prevX || 0) * predictFactor * 20;
                    const targetY = player.y + (player.y - player.prevY || 0) * predictFactor * 20;
                    // 创建迫击弹（延迟范围爆炸）
                    BulletSystem.createMortar(e.x, e.y, targetX, targetY, e.damage, e.explosionRadius || 60);
                    e.mortarTimer = e.mortarCooldown;
                    // 发射闪光
                    ParticleSystem.emit(e.x, e.y, 5, {
                        speed: 30, color: '#aa44ff', life: 0.3, size: 4, type: 'glow'
                    });
                }
            } else if (e.behavior === 'blink') {
                // ====== 闪现者：周期性瞬移突进 ======
                e.blinkTimer -= dt;
                if (e.blinkTimer <= 0) {
                    if (dist > 150) {
                        // 瞬移到玩家附近
                        const blinkAngle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.4;
                        e.x = player.x + Math.cos(blinkAngle) * e.blinkDist;
                        e.y = player.y + Math.sin(blinkAngle) * e.blinkDist;
                        // 闪现进入粒子
                        ParticleSystem.emit(player.x + Math.cos(blinkAngle) * e.blinkDist,
                            player.y + Math.sin(blinkAngle) * e.blinkDist, 8, {
                            speed: 80, color: '#ff44ff', life: 0.3, size: 5, type: 'glow'
                        });
                    }
                    e.blinkTimer = e.blinkCooldown;
                }
                // 靠近时攻击
                if (dist < e.radius + player.radius + 10) {
                    if (typeof PlayerSystem !== 'undefined' && PlayerSystem.player) {
                        PlayerSystem.takeDamage(e.damage);
                    }
                    // 攻击后闪现撤退
                    const retreatAngle = Math.atan2(dy, dx) + Math.PI + (Math.random() - 0.5) * 0.3;
                    e.x = e.x + Math.cos(retreatAngle) * e.blinkDist * 0.8;
                    e.y = e.y + Math.sin(retreatAngle) * e.blinkDist * 0.8;
                    e.blinkTimer = e.blinkCooldown * 0.6;
                    ParticleSystem.emit(e.x, e.y, 8, {
                        speed: 80, color: '#ff44ff', life: 0.3, size: 5, type: 'glow'
                    });
                }
            }

            // 边界
            e.x = Math.max(10, Math.min(GameWorld.width - 10, e.x));
            e.y = Math.max(10, Math.min(GameWorld.height - 10, e.y));

            // 更新移动方向（用于方向帧动画）
            const moveDx = e.x - e.prevX;
            const moveDy = e.y - e.prevY;
            const moveDist = Math.sqrt(moveDx * moveDx + moveDy * moveDy);
            e.isMovingEnemy = moveDist > 0.5;
            if (e.isMovingEnemy) {
                e.moveAngle = Math.atan2(moveDy, moveDx);
            }
            e.prevX = e.x;
            e.prevY = e.y;
        }
    },

    takeDamage(enemy, damage) {
        if (!enemy.alive) return 0;
        enemy.hp -= damage;
        enemy.flashTimer = 0.1;

        // 击退
        const p = PlayerSystem.player;
        if (p) {
            const dx = enemy.x - p.x;
            const dy = enemy.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            enemy.knockbackX += dx / dist * 300;
            enemy.knockbackY += dy / dist * 300;
        }

        // 受击粒子
        ParticleSystem.emit(enemy.x, enemy.y, 4, {
            speed: 60,
            color: enemy.color,
            life: 0.2,
            size: 3,
            type: 'spark'
        });

        if (enemy.hp <= 0) {
            enemy.alive = false;
            return -1; // 死亡
        }
        return 0; // 受伤
    },

    /** 自爆者范围爆炸伤害 */
    _explodeDamage(enemy, player) {
        const dmg = enemy.damage * (enemy.explosionDamageMult || 1.5);
        const radius = enemy.explosionRadius || 80;

        // 伤害玩家
        const pDist = Math.sqrt(
            (player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2
        );
        if (pDist < radius + player.radius) {
            const falloff = Math.max(0.5, 1 - pDist / (radius + player.radius) * 0.5);
            if (typeof PlayerSystem !== 'undefined' && PlayerSystem.player) {
                PlayerSystem.takeDamage(Math.floor(dmg * falloff));
            }
            // 击退玩家
            const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
            const kbStr = 400 * falloff;
            player.knockbackX = Math.cos(angle) * kbStr;
            player.knockbackY = Math.sin(angle) * kbStr;
        }

        // 伤害范围内其他敌人
        for (const other of EnemySystem.enemies) {
            if (!other.alive || other === enemy) continue;
            const odx = other.x - enemy.x, ody = other.y - enemy.y;
            const oDist = Math.sqrt(odx * odx + ody * ody);
            if (oDist < radius + other.radius) {
                const falloff = Math.max(0.5, 1 - oDist / (radius + other.radius) * 0.5);
                other.hp -= Math.floor(dmg * 0.5 * falloff);
                const oDistSafe = oDist || 1;
                other.knockbackX += odx / oDistSafe * 300 * falloff;
                other.knockbackY += ody / oDistSafe * 300 * falloff;
                other.flashTimer = 0.1;
                if (other.hp <= 0) other.alive = false;
            }
        }

        // 爆炸粒子特效
        ParticleSystem.emit(enemy.x, enemy.y, 20, {
            speed: 150, color: '#ff5500', life: 0.4, size: 6, type: 'spark'
        });
        ParticleSystem.emit(enemy.x, enemy.y, 10, {
            speed: 80, color: '#ffcc00', life: 0.5, size: 12, type: 'glow'
        });
        ParticleSystem.emit(enemy.x, enemy.y, 5, {
            speed: 60, color: '#ffffff', life: 0.3, size: 8, type: 'glow'
        });

        // 屏幕震动（小半径内）
        const screenDist = pDist || 200;
        if (screenDist < 300 && typeof GameEngine !== 'undefined') {
            GameEngine._screenShakeTimer = 0.15;
        }

        if (typeof CombatLogSystem !== 'undefined') {
            CombatLogSystem.addEventText(enemy.x, enemy.y - 10, '💥 自爆!', '#ff8800', 16);
            CombatLogSystem.addLog('💥', `自爆造成 ${Math.floor(dmg)} 范围伤害`, '#ff8800');
        }
    },

    clear() {
        this.enemies = [];
    }
};
