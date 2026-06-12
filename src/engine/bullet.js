// ============================================================
// engine/bullet.js - 子弹/投射物系统（多种弹道支持）
// ============================================================
const BulletSystem = {
    bullets: [],
    pool: [],

    create(x, y, angle, damage, speed, pierce, isPlayer = true, weaponId = 'pistol', extra = {}) {
        let b = this.pool.pop();
        if (!b) {
            b = { x: 0, y: 0, vx: 0, vy: 0, damage: 0, pierce: 0, life: 0, isPlayer: true, hits: [], weaponId: '' };
        }
        b.x = x;
        b.y = y;
        b.startX = x;
        b.startY = y;
        b.vx = Math.cos(angle) * speed;
        b.vy = Math.sin(angle) * speed;
        b.damage = damage;
        b.pierce = pierce;
        b.life = 3.0;
        b.maxRange = extra.range || 0;
        b.isPlayer = isPlayer;
        b.hits = [];
        b.radius = isPlayer ? 3 : 4;
        b.weaponId = weaponId || 'pistol';
        // 武器分类(用于子弹颜色 + 元素判定):从 ShopSystem 查 def
        // 注意:仅查一次,在 _fireXxx 调用时缓存,避免每帧多武器同时开火时的重复查询
        if (isPlayer && weaponId && !b._cachedWeaponId) {
            // 不缓存 — 池复用时 weaponId 改变,需重新查
        }
        if (isPlayer && weaponId && typeof ShopSystem !== 'undefined' && ShopSystem.getWeaponDef) {
            const def = ShopSystem.getWeaponDef(weaponId);
            b.weaponTag = def ? def.tag : null;
            b.weaponClass2 = def ? (def.class_2 || null) : null;
            b.knockback = def ? (def.knockback || 0) : 0;
            b.behavior = def ? (def.behavior || 'bullet') : (extra.behavior || 'bullet');
        } else {
            b.weaponTag = null;
            b.weaponClass2 = null;
            b.knockback = 0;
            b.behavior = extra.behavior || 'bullet';
        }
        // 清除池复用污染（强制重置所有特殊属性，防止上一轮残留）
        b.isMortar = extra.isMortar || false;
        b.cosmetic = extra.cosmetic || false;  // true = 纯视觉子弹, 不检测碰撞不造成伤害
        b.splashOnHitOnly = false; // true = 命中敌人才触发溅射(冰爆/冰霜), false = 飞行超时爆炸(火箭筒)
        // 特殊属性
        b.chainCount = extra.chainCount || 0;
        b.chainRange = extra.chainRange || 150;
        b.splashRadius = extra.splashRadius || 0;
        b.homingStrength = extra.homingStrength || 0;
        b.slowAmount = extra.slowAmount || 0;
        b.slowDuration = extra.slowDuration || 0;
        b.healOnHit = extra.healOnHit || 0;
        // 燃烧/毒属性
        b.burnDps = extra.burnDps || 0;
        b.burnMaxStacks = extra.burnMaxStacks || 0;
        // 冰爆
        b.iceExplosionRadius = extra.iceExplosionRadius || 0;
        // 跟踪用
        b.targetEnemy = null;
        this.bullets.push(b);
        return b;
    },

    update(dt) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];

            // 跟踪弹
            if (b.homingStrength > 0 && b.isPlayer) {
                this._updateHoming(b, dt);
            }

            // 记录本帧起点(供碰撞扫掠, 防高速穿模)
            b._prevX = b.x;
            b._prevY = b.y;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.life -= dt;

            // ====== 迫击弹：寿命结束 → 范围爆炸（伤害玩家） ======
            if (b.isMortar) {
                // NaN 位置：修复后直接清除
                if (!isFinite(b.x) || !isFinite(b.y)) {
                    this.pool.push(b);
                    this.bullets.splice(i, 1);
                    continue;
                }
                if (b.life <= 0 || b.x < -50 || b.x > GameWorld.width + 50 ||
                    b.y < -50 || b.y > GameWorld.height + 50) {
                    // 伤害玩家（范围衰减）
                    const p = typeof PlayerSystem !== 'undefined' ? PlayerSystem.player : null;
                    if (p && p.alive) {
                        const pdx = p.x - b.x, pdy = p.y - b.y;
                        const pDist = Math.sqrt(pdx * pdx + pdy * pdy);
                        if (pDist < b.splashRadius + p.radius) {
                            const falloff = Math.max(0.5, 1 - pDist / (b.splashRadius + p.radius) * 0.5);
                            PlayerSystem.takeDamage(Math.floor(b.damage * falloff));
                            // 击退玩家
                            const angle = Math.atan2(p.y - b.y, p.x - b.x);
                            p.knockbackX = Math.cos(angle) * 300 * falloff;
                            p.knockbackY = Math.sin(angle) * 300 * falloff;
                        }
                    }
                    // 紫色爆炸特效
                    ParticleSystem.explosion(b.x, b.y, '#aa44ff', 15);
                    ParticleSystem.emit(b.x, b.y, 8, {
                        speed: 60, color: '#4400aa', life: 0.4, size: 8, type: 'glow'
                    });
                    this.pool.push(b);
                    this.bullets.splice(i, 1);
                    continue;
                }
                // 迫击弹飞行尾迹
                if (Math.random() < 0.3) {
                    ParticleSystem.emit(b.x, b.y, 1, {
                        speed: 10, color: '#8866ff', life: 0.15, size: 3, type: 'glow'
                    });
                }
                continue;
            }

            // ====== 玩家子弹命中检测 (修复: 之前普通子弹飞到死不扣血) ======
            if (b.isPlayer && !b.cosmetic) {
                const hit = this._checkHit(b);
                if (hit) {
                    const killed = EnemySystem.takeDamage(hit, b.damage);
                    // 击退 (用武器 def 的 knockback, 远程模式)
                    if (b.knockback > 0) {
                        const dx = hit.x - b.x, dy = hit.y - b.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        EnemySystem.applyKnockback(hit, dx, dy, dist, b.knockback, { ranged: true });
                    }
                    // 燃烧
                    if (b.burnDps > 0 && hit.alive && typeof PlayerSystem !== 'undefined' && PlayerSystem._applyBurn) {
                        PlayerSystem._applyBurn(hit, b.burnDps, 3.0, b.burnMaxStacks || 3);
                    }
                    // combat log
                    if (typeof CombatLogSystem !== 'undefined') {
                        const p = typeof PlayerSystem !== 'undefined' ? PlayerSystem.player : null;
                        if (p && p._lastCrit) CombatLogSystem.addCritDamage(hit.x, hit.y, b.damage);
                        else CombatLogSystem.addDamage(hit.x, hit.y, b.damage);
                    }
                    // 命中才炸 (splashOnHitOnly, 如冰爆/冰霜)
                    if (b.splashOnHitOnly && b.splashRadius > 0) {
                        this._checkSplash(b);
                    }
                    // 连锁电击 (闪电杖/雷电杖等 chainCount>0 武器, 暴击时触发)
                    // 注: 必须在子弹消失前调用 (后续 pierce 分支可能 pool.push)
                    if (b.chainCount > 0) {
                        const p = typeof PlayerSystem !== 'undefined' ? PlayerSystem.player : null;
                        if (p && p._lastCrit) {
                            this.chainLightning(b, hit);
                        }
                    }
                    // 击杀奖励
                    if (killed === -1 && typeof GameEngine !== 'undefined' && GameEngine._handleEnemyKill) {
                        GameEngine._handleEnemyKill(hit, b.damage);
                    }
                    // pierce 处理
                    if (b.pierce > 0) {
                        b.pierce--;
                        if (!b.hits) b.hits = [];
                        b.hits.push(hit);
                    } else {
                        // 爆炸类: 命中消失时爆炸 (非 splashOnHitOnly, 即飞行超时爆炸类)
                        if (b.splashRadius > 0 && !b.splashOnHitOnly) {
                            this._checkSplash(b);
                        }
                        // 子弹消失
                        this.pool.push(b);
                        this.bullets.splice(i, 1);
                        continue;
                    }
                }
            }

            // 越界清除
            if (b.x < -100 || b.x > GameWorld.width + 100 ||
                b.y < -100 || b.y > GameWorld.height + 100) {
                this.pool.push(b);
                this.bullets.splice(i, 1);
                continue;
            }

            // 超出武器射程 → 爆炸或消失
            if (b.maxRange > 0) {
                const dx = b.x - b.startX;
                const dy = b.y - b.startY;
                if (dx * dx + dy * dy > b.maxRange * b.maxRange) {
                    // 爆炸类: 到达射程极限时爆炸
                    if (b.splashRadius > 0 && !b.splashOnHitOnly) {
                        this._checkSplash(b);
                    }
                    this.pool.push(b);
                    this.bullets.splice(i, 1);
                    continue;
                }
            }

            // 寿命耗尽 → 爆炸或消失
            if (b.life <= 0) {
                // 爆炸类: 寿命耗尽时爆炸
                if (b.splashRadius > 0 && !b.splashOnHitOnly) {
                    this._checkSplash(b);
                }
                this.pool.push(b);
                this.bullets.splice(i, 1);
            }
        }
    },

    /** 跟踪弹更新 */
    _updateHoming(b, dt) {
        // 寻找最近敌人
        if (!b.targetEnemy || !b.targetEnemy.alive) {
            let nearest = null, nearDist = Infinity;
            for (const e of EnemySystem.enemies) {
                if (!e.alive) continue;
                const dx = e.x - b.x, dy = e.y - b.y;
                const dist = dx * dx + dy * dy;
                if (dist < nearDist) {
                    nearDist = dist;
                    nearest = e;
                }
            }
            b.targetEnemy = nearest;
        }

        if (b.targetEnemy) {
            const dx = b.targetEnemy.x - b.x;
            const dy = b.targetEnemy.y - b.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 5) {
                const targetAngle = Math.atan2(dy, dx);
                const currentAngle = Math.atan2(b.vy, b.vx);
                let diff = targetAngle - currentAngle;
                if (diff > Math.PI) diff -= Math.PI * 2;
                if (diff < -Math.PI) diff += Math.PI * 2;
                const newAngle = currentAngle + diff * Math.min(1, b.homingStrength * dt);
                const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
                b.vx = Math.cos(newAngle) * speed;
                b.vy = Math.sin(newAngle) * speed;
            }
        }
    },

    /** 玩家子弹命中检测 (返回第一个未命中过的怪, 否则 null) */
    _checkHit(b) {
        if (typeof EnemySystem === 'undefined' || !EnemySystem.enemies) return null;
        const enemies = EnemySystem.enemies;
        const br = b.radius || 3;
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (!e.alive) continue;
            if (b.hits && b.hits.indexOf(e) !== -1) continue;
            const er = e.radius || 14;
            const dx = e.x - b.x, dy = e.y - b.y;
            const r = br + er;
            if (dx * dx + dy * dy < r * r) return e;
        }
        return null;
    },

    /** 爆炸范围伤害 */
    _checkSplash(b) {
        if (typeof EnemySystem === 'undefined' || !EnemySystem.enemies) return;
        const enemies = EnemySystem.enemies;
        const radius = b.splashRadius;
        // 击退用武器 def.knockback (修复: 之前硬编码 200, 远程 0.2 倍 → 40 像素过强)
        // 兜底: 没武器定义时用 60 (合理爆炸击退)
        const kb = b.knockback || 60;
        let hitCount = 0;
        for (const e of enemies) {
            if (!e.alive) continue;
            const dx = e.x - b.x, dy = e.y - b.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < radius) {
                const atEdge = dist > radius * 0.3; // 边缘伤害衰减
                const dmg = atEdge ? Math.floor(b.damage * 0.5) : b.damage;
                EnemySystem.takeDamage(e, dmg);
                // 爆炸击退（远程类,弱化,大体型抗性）
                EnemySystem.applyKnockback(e, dx, dy, dist, kb, { ranged: true });
                hitCount++;
            }
        }
        if (hitCount > 0) {
            // 爆炸特效
            if (typeof ParticleSystem !== 'undefined') {
                ParticleSystem.explosion(b.x, b.y, '#ff6600', 20);
            }
        }
    },

    /** 连锁电击 - 由碰撞检测调用 */
    chainLightning(b, hitEnemy) {
        if (b.chainCount <= 0) return;
        if (typeof EnemySystem === 'undefined' || !EnemySystem.enemies) return;
        const enemies = EnemySystem.enemies.filter(e => e.alive && e !== hitEnemy && !b.hits.includes(e));
        let current = hitEnemy;
        let remaining = b.chainCount;
        while (remaining > 0 && enemies.length > 0) {
            // 找最近的下一个目标
            let nearest = null, nearDist = Infinity;
            for (const e of enemies) {
                if (b.hits.includes(e)) continue;
                const dx = e.x - current.x, dy = e.y - current.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < b.chainRange && dist < nearDist) {
                    nearDist = dist;
                    nearest = e;
                }
            }
            if (!nearest) break;
            // 连锁伤害（递减）
            const chainDmg = Math.floor(b.damage * (1 - (b.chainCount - remaining) * 0.2));
            EnemySystem.takeDamage(nearest, Math.max(1, chainDmg));
            b.hits.push(nearest);
            // 连锁闪电特效
            ParticleSystem.emit(nearest.x, nearest.y, 3, {
                speed: 40,
                color: '#00ffff',
                life: 0.15,
                size: 4,
                type: 'spark'
            });
            current = nearest;
            remaining--;
        }
    },

    /** 创建迫击弹 - 飞向目标位置，到达后范围爆炸 */
    createMortar(x, y, targetX, targetY, damage, explosionRadius) {
        // NaN 守卫：防止预测计算产生 NaN 导致无限飞行
        if (!isFinite(x) || !isFinite(y) || !isFinite(targetX) || !isFinite(targetY)) return null;
        const dx = targetX - x;
        const dy = targetY - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 5 || !isFinite(dist)) return null; // 太近或无效距离不生成
        const speed = 150 + Math.random() * 30;
        const travelTime = dist / speed + 0.3;

        let b = this.pool.pop();
        if (!b) {
            b = { x: 0, y: 0, vx: 0, vy: 0, damage: 0, pierce: 0, life: 0, isPlayer: true, hits: [], weaponId: '' };
        }
        b.x = x;
        b.y = y;
        b.vx = (dx / dist) * speed + (Math.random() - 0.5) * 20;
        b.vy = (dy / dist) * speed + (Math.random() - 0.5) * 20;
        b.damage = damage;
        b.pierce = 0;
        b.life = travelTime;
        b.isPlayer = false;
        b.hits = [];
        b.radius = 5;
        b.weaponId = 'mortar';
        b.splashRadius = explosionRadius || 60;
        b.isMortar = true;
        this.bullets.push(b);
        return b;
    },

    clear() {
        while (this.bullets.length) {
            this.pool.push(this.bullets.pop());
        }
    }
};

if (typeof module !== 'undefined') {
    module.exports = { BulletSystem };
}
