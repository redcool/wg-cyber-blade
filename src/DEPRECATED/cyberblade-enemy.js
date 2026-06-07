// ============================================================
// cyberblade/enemy.js - 敌人系统（每种行为独立方法）
// ============================================================
const _ENEMY_STR = {
    enemy_basic_name: '无人机兵',
    enemy_fast_name: '疾行者',
    enemy_tank_name: '重装机兵',
    enemy_ranged_name: '狙击手',
    enemy_exploder_name: '自爆者',
    enemy_healer_name: '修复者',
    enemy_mortar_name: '迫击者',
    enemy_blinker_name: '闪现者',
    enemy_elite_name: '精英猎手',
    enemy_boss_name: 'BOSS·毁灭者'
};
if (typeof DataLoader !== 'undefined') {
    DataLoader.load('enemy_charsData').then(d => { if (d) Object.assign(_ENEMY_STR, d); }).catch(() => {});
}
const EnemySystem = {
    enemies: [],

    /* ==================== 从 CSV 加载敌人数据 ==================== */
    async loadEnemyTable() {
        try {
            const resp = await fetch('data/enemyTable.md');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const text = await resp.text();
            const types = this._parseEnemyCSV(text);
            if (Object.keys(types).length > 0) {
                console.log('[EnemySystem] 从 CSV 加载', Object.keys(types).length, '种敌人');
                Object.assign(this.types, types);
            }
        } catch (e) {
            console.warn('[EnemySystem] 敌人CSV加载失败，使用硬编码:', e.message);
        }
    },

    /** 解析敌人 CSV 文本 → types 对象 */
    _parseEnemyCSV(text) {
        const lines = text.split(/\r?\n/);
        const types = {};
        for (const rawLine of lines) {
            const trimmed = rawLine.trim();
            if (trimmed === '' || trimmed.startsWith('#')) continue;

            const fields = splitCSVLine(trimmed);
            if (fields.length < 15) continue;

            const [
                id, name, behavior,
                hpStr, speedStr, damageStr, radiusStr,
                color, glowColor,
                xpStr, matStr, attackCDStr,
                paramsStr, isEliteStr, isBossStr
            ] = fields;

            if (!id || !name) continue;

            const toNum = (s) => { const v = parseFloat(s); return isNaN(v) ? 0 : v; };

            const type = {
                name,
                hp: toNum(hpStr),
                speed: toNum(speedStr),
                damage: toNum(damageStr),
                radius: toNum(radiusStr),
                color: color || '#ff4444',
                glowColor: glowColor || '#ff0044',
                xpValue: toNum(xpStr),
                materialValue: toNum(matStr),
                attackCooldown: toNum(attackCDStr) || 1.5,
                behavior: behavior || 'chase'
            };

            if (paramsStr && paramsStr !== '{}') {
                try {
                    const params = JSON.parse(paramsStr);
                    Object.assign(type, params);
                } catch (e) {}
            }

            if (isEliteStr && isEliteStr.trim().toLowerCase() === 'true') {
                type.isElite = true;
            }
            if (isBossStr && isBossStr.trim().toLowerCase() === 'true') {
                type.isBoss = true;
            }

            types[id] = type;
        }
        return types;
    },

    // 敌人类型定义（硬编码兜底）
    types: {
        basic: { name: _ENEMY_STR.enemy_basic_name, hp: 30, speed: 200, damage: 8, radius: 14, color: '#ff4444', glowColor: '#ff0044', xpValue: 5, materialValue: 2, attackCooldown: 1.5, behavior: 'chase' },
        fast: { name: _ENEMY_STR.enemy_fast_name, hp: 20, speed: 400, damage: 6, radius: 10, color: '#ff8800', glowColor: '#ff6600', xpValue: 6, materialValue: 2, attackCooldown: 1.2, behavior: 'chase' },
        tank: { name: _ENEMY_STR.enemy_tank_name, hp: 120, speed: 110, damage: 15, radius: 22, color: '#8844ff', glowColor: '#6622ff', xpValue: 12, materialValue: 5, attackCooldown: 2.0, behavior: 'chase' },
        ranged: { name: _ENEMY_STR.enemy_ranged_name, hp: 25, speed: 140, damage: 12, radius: 12, color: '#ff00aa', glowColor: '#ff0088', xpValue: 8, materialValue: 3, attackCooldown: 2.0, behavior: 'ranged', preferredDist: 250, bulletSpeed: 350 },
        exploder: { name: _ENEMY_STR.enemy_exploder_name, hp: 40, speed: 300, damage: 12, radius: 16, color: '#ff5500', glowColor: '#ff2200', xpValue: 7, materialValue: 2, attackCooldown: 0, behavior: 'explode', explosionRadius: 80, explosionDamageMult: 1.5 },
        healer: { name: _ENEMY_STR.enemy_healer_name, hp: 35, speed: 160, damage: 5, radius: 14, color: '#44ff88', glowColor: '#22ff66', xpValue: 9, materialValue: 3, attackCooldown: 2.5, behavior: 'heal', preferredDist: 250, healCooldown: 3.0, healRadius: 120, healAmount: 10 },
        mortar: { name: _ENEMY_STR.enemy_mortar_name, hp: 30, speed: 100, damage: 18, radius: 14, color: '#aa44ff', glowColor: '#8822ff', xpValue: 10, materialValue: 4, attackCooldown: 3.0, behavior: 'mortar', preferredDist: 350, mortarCooldown: 3.0, mortarSpeed: 180 },
        blinker: { name: _ENEMY_STR.enemy_blinker_name, hp: 25, speed: 230, damage: 14, radius: 12, color: '#ff44ff', glowColor: '#ff00ff', xpValue: 8, materialValue: 3, attackCooldown: 1.5, behavior: 'blink', blinkCooldown: 2.0, blinkDist: 100, dodgeChance: 0.3 },
        elite: { name: _ENEMY_STR.enemy_elite_name, hp: 250, speed: 180, damage: 20, radius: 24, color: '#ffcc00', glowColor: '#ffaa00', xpValue: 30, materialValue: 15, attackCooldown: 1.0, behavior: 'chase', isElite: true },
        boss: { name: _ENEMY_STR.enemy_boss_name, hp: 800, speed: 140, damage: 30, radius: 36, color: '#ff0044', glowColor: '#ff0000', xpValue: 80, materialValue: 40, attackCooldown: 0.8, behavior: 'chase', isBoss: true }
    },

    create(type, x, y, waveLevel = 1) {
        const t = this.types[type];
        if (!t) return null;

        const level = Math.max(1, waveLevel);
        const hpMult  = 1 + (level - 1) * 0.12;
        const dmgMult = 1 + (level - 1) * 0.10;
        const spdMult = 1 + (level - 1) * 0.04;
        const xpMult  = 1 + (level - 1) * 0.10;
        const matMult = 1 + (level - 1) * 0.08;

        const eliteExtra = (t.isElite || t.isBoss) ? Math.max(0, level - 10) * 0.10 : 0;
        const bossExtraHP  = t.isBoss ? Math.max(0, level - 15) * 0.15 : 0;
        const bossExtraDMG = t.isBoss ? Math.max(0, level - 15) * 0.12 : 0;
        const bossExtraSPD = t.isBoss ? Math.max(0, level - 15) * 0.05 : 0;

        const e = {
            x, y, type, name: t.name, level,
            hp: t.hp * hpMult * (1 + eliteExtra + bossExtraHP),
            maxHp: t.hp * hpMult * (1 + eliteExtra + bossExtraHP),
            speed: t.speed * spdMult * (1 + bossExtraSPD),
            damage: t.damage * dmgMult * (1 + eliteExtra + bossExtraDMG),
            radius: t.radius, color: t.color, glowColor: t.glowColor,
            xpValue: Math.floor(t.xpValue * xpMult),
            materialValue: Math.floor(t.materialValue * matMult),
            attackCooldown: t.attackCooldown, behavior: t.behavior,
            preferredDist: t.preferredDist || 200, bulletSpeed: t.bulletSpeed || 300,
            explosionRadius: t.explosionRadius || 80, explosionDamageMult: t.explosionDamageMult || 1.5,
            healCooldown: t.healCooldown || 3.0, healRadius: t.healRadius || 120, healAmount: t.healAmount || 10,
            mortarCooldown: t.mortarCooldown || 3.0, mortarSpeed: t.mortarSpeed || 180,
            blinkCooldown: t.blinkCooldown || 2.0, blinkDist: t.blinkDist || 100, dodgeChance: t.dodgeChance || 0,
            isElite: t.isElite || false, isBoss: t.isBoss || false,
            alive: true, attackTimer: Math.random() * t.attackCooldown,
            flashTimer: 0, knockbackX: 0, knockbackY: 0,
            healTimer: Math.random() * (t.healCooldown || 3.0),
            mortarTimer: Math.random() * (t.mortarCooldown || 3.0),
            blinkTimer: Math.random() * (t.blinkCooldown || 2.0),
            _exploded: false, prevX: x, prevY: y, moveAngle: 0, isMovingEnemy: false,
            slowTimer: 0, slowFactor: 0.5, speedMult: 1.0
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
            this._updateEnemyState(e, dt);
            if (!e.alive) continue;
            this._updateEnemyAI(e, dt, player);
            this._updateEnemyBounds(e);
            this._updateEnemyDirection(e);
        }
    },

    _updateEnemyState(e, dt) {
        if (e.flashTimer > 0) e.flashTimer -= dt;
        e.knockbackX *= 0.9;
        e.knockbackY *= 0.9;
        if (e.slowTimer > 0) {
            e.slowTimer -= dt;
            e.speedMult = e.slowFactor || 0.5;
        } else {
            e.speedMult = 1.0;
        }
        this._updateBurnDOT(e, dt);
    },

    _updateBurnDOT(e, dt) {
        if (!e.burnStacks || e.burnStacks.length === 0) return;
        for (let si = e.burnStacks.length - 1; si >= 0; si--) {
            const stack = e.burnStacks[si];
            stack.remaining -= dt;
            if (stack.remaining <= 0) {
                e.burnStacks.splice(si, 1);
                continue;
            }
            const dotDmg = stack.dps * dt;
            e.hp -= dotDmg;
            if (e.hp <= 0) break;
        }

        e._burnLogTimer = (e._burnLogTimer || 0) + dt;
        if (e._burnLogTimer >= 1.0) {
            e._burnLogTimer = 0;
            const totalBurnDmg = e.burnStacks.reduce((sum, s) => sum + s.dps, 0);
            if (totalBurnDmg > 0 && typeof CombatLogSystem !== 'undefined') {
                CombatLogSystem.addEventText(e.x, e.y - 15, `🔥${Math.round(totalBurnDmg)}`, '#ff8800', 12);
                CombatLogSystem.logBurnDamage(totalBurnDmg);
            }
        }

        if (e.burnStacks.length > 0 && Math.random() < 0.3) {
            ParticleSystem.emit(e.x + (Math.random() - 0.5) * 10, e.y + (Math.random() - 0.5) * 10, 1, {
                speed: 20, color: '#ff4400', life: 0.3, size: 3, type: 'glow'
            });
        }

        if (e.hp <= 0 && e.alive) {
            e.hp = 0;
            e.alive = false;
            if (e.behavior === 'explode' && !e._exploded) {
                this._explodeDamage(e, PlayerSystem.player);
            }
            if (PlayerSystem.player && PlayerSystem.player._burnSpreadLevel) {
                PlayerSystem._spreadBurn(e);
            }
            if (e.slowTimer > 0 && PlayerSystem.player) {
                PlayerSystem._triggerIceExplosion(e);
            }
        }
    },

    _updateEnemyAI(e, dt, player) {
        const dx = player.x - e.x;
        const dy = player.y - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        switch (e.behavior) {
            case 'chase':   this._updateChase(e, dt, player, dx, dy, dist); break;
            case 'ranged':  this._updateRanged(e, dt, player, dx, dy, dist); break;
            case 'explode': this._updateExplode(e, dt, player, dx, dy, dist); break;
            case 'heal':    this._updateHeal(e, dt, player, dx, dy, dist); break;
            case 'mortar':  this._updateMortar(e, dt, player, dx, dy, dist); break;
            case 'blink':   this._updateBlink(e, dt, player, dx, dy, dist); break;
        }
    },

    _updateChase(e, dt, player, dx, dy, dist) {
        if (dist > 5) {
            const speed = e.speed * e.speedMult * dt;
            e.x += (dx / dist) * speed + e.knockbackX * dt;
            e.y += (dy / dist) * speed + e.knockbackY * dt;
        }
        e.attackTimer -= dt;
        if (e.attackTimer <= 0 && dist < e.radius + player.radius + 5) {
            if (typeof PlayerSystem !== 'undefined' && PlayerSystem.player) {
                PlayerSystem.takeDamage(e.damage);
            }
            e.attackTimer = e.attackCooldown;
            player.knockbackX = -dx / dist * 200;
            player.knockbackY = -dy / dist * 200;
        }
    },

    _updateRanged(e, dt, player, dx, dy, dist) {
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

        e.attackTimer -= dt;
        if (e.attackTimer <= 0 && dist < 500) {
            const angle = Math.atan2(dy, dx);
            BulletSystem.create(e.x, e.y, angle, e.damage, e.bulletSpeed, 0, false);
            e.attackTimer = e.attackCooldown;
            ParticleSystem.emit(e.x, e.y, 3, {
                speed: 30, color: e.color, life: 0.2, size: 3, type: 'spark'
            });
        }
    },

    _updateExplode(e, dt, player, dx, dy, dist) {
        if (dist > 5) {
            const chargeMult = 1 + 0.5 * Math.min(1, 250 / Math.max(1, dist));
            const chargeSpeed = e.speed * e.speedMult * chargeMult * dt;
            e.x += (dx / dist) * chargeSpeed + e.knockbackX * dt;
            e.y += (dy / dist) * chargeSpeed + e.knockbackY * dt;
        }
        if (dist < e.radius + player.radius + 15 && e.alive && !e._exploded) {
            this._explodeDamage(e, player);
            e.alive = false;
        }
    },

    _updateHeal(e, dt, player, dx, dy, dist) {
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

        e.healTimer -= dt;
        if (e.healTimer <= 0) {
            let healedAny = false;
            for (const other of EnemySystem.enemies) {
                if (!other.alive || other === e || other.hp >= other.maxHp) continue;
                const hx = other.x - e.x, hy = other.y - e.y;
                if (Math.sqrt(hx * hx + hy * hy) < e.healRadius) {
                    const healAmt = Math.floor(e.healAmount * (0.8 + Math.random() * 0.4));
                    other.hp = Math.min(other.maxHp, other.hp + healAmt);
                    healedAny = true;
                    ParticleSystem.emit(other.x, other.y, 3, {
                        speed: 30, color: '#44ff88', life: 0.3, size: 4, type: 'glow'
                    });
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
    },

    _updateMortar(e, dt, player, dx, dy, dist) {
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

        e.mortarTimer -= dt;
        if (e.mortarTimer <= 0 && dist < 600) {
            const predictFactor = dist * 0.003;
            const targetX = player.x + (player.x - player.prevX || 0) * predictFactor * 20;
            const targetY = player.y + (player.y - player.prevY || 0) * predictFactor * 20;
            BulletSystem.createMortar(e.x, e.y, targetX, targetY, e.damage, e.explosionRadius || 60);
            e.mortarTimer = e.mortarCooldown;
            ParticleSystem.emit(e.x, e.y, 5, {
                speed: 30, color: '#aa44ff', life: 0.3, size: 4, type: 'glow'
            });
        }
    },

    _updateBlink(e, dt, player, dx, dy, dist) {
        e.blinkTimer -= dt;
        if (e.blinkTimer <= 0) {
            if (dist > 150) {
                const blinkAngle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.4;
                e.x = player.x + Math.cos(blinkAngle) * e.blinkDist;
                e.y = player.y + Math.sin(blinkAngle) * e.blinkDist;
                ParticleSystem.emit(player.x + Math.cos(blinkAngle) * e.blinkDist,
                    player.y + Math.sin(blinkAngle) * e.blinkDist, 8, {
                    speed: 80, color: '#ff44ff', life: 0.3, size: 5, type: 'glow'
                });
            }
            e.blinkTimer = e.blinkCooldown;
        }
        if (dist < e.radius + player.radius + 10) {
            if (typeof PlayerSystem !== 'undefined' && PlayerSystem.player) {
                PlayerSystem.takeDamage(e.damage);
            }
            const retreatAngle = Math.atan2(dy, dx) + Math.PI + (Math.random() - 0.5) * 0.3;
            e.x = e.x + Math.cos(retreatAngle) * e.blinkDist * 0.8;
            e.y = e.y + Math.sin(retreatAngle) * e.blinkDist * 0.8;
            e.blinkTimer = e.blinkCooldown * 0.6;
            ParticleSystem.emit(e.x, e.y, 8, {
                speed: 80, color: '#ff44ff', life: 0.3, size: 5, type: 'glow'
            });
        }
    },

    _updateEnemyBounds(e) {
        e.x = Math.max(10, Math.min(GameWorld.width - 10, e.x));
        e.y = Math.max(10, Math.min(GameWorld.height - 10, e.y));
    },

    _updateEnemyDirection(e) {
        const moveDx = e.x - e.prevX;
        const moveDy = e.y - e.prevY;
        const moveDist = Math.sqrt(moveDx * moveDx + moveDy * moveDy);
        e.isMovingEnemy = moveDist > 0.5;
        if (e.isMovingEnemy) {
            e.moveAngle = Math.atan2(moveDy, moveDx);
        }
        e.prevX = e.x;
        e.prevY = e.y;
    },

    takeDamage(enemy, damage) {
        if (!enemy.alive) return 0;
        enemy.hp -= damage;
        enemy.flashTimer = 0.1;

        const p = PlayerSystem.player;
        if (p && !enemy.isElite && !enemy.isBoss) {
            const dx = enemy.x - p.x;
            const dy = enemy.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            enemy.knockbackX += dx / dist * 300;
            enemy.knockbackY += dy / dist * 300;
        }

        ParticleSystem.emit(enemy.x, enemy.y, 4, {
            speed: 60, color: enemy.color, life: 0.2, size: 3, type: 'spark'
        });

        if (enemy.hp <= 0) {
            enemy.alive = false;
            if (enemy.behavior === 'explode' && !enemy._exploded && p) {
                this._explodeDamage(enemy, p);
            }
            return -1;
        }
        return 0;
    },

    _explodeDamage(enemy, player) {
        enemy._exploded = true;
        const dmg = enemy.damage * (enemy.explosionDamageMult || 1.5);
        const radius = enemy.explosionRadius || 80;

        const pDist = Math.sqrt(
            (player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2
        );
        if (pDist < radius + player.radius) {
            const falloff = Math.max(0.5, 1 - pDist / (radius + player.radius) * 0.5);
            if (typeof PlayerSystem !== 'undefined' && PlayerSystem.player) {
                PlayerSystem.takeDamage(Math.floor(dmg * falloff));
            }
            const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
            const kbStr = 400 * falloff;
            player.knockbackX = Math.cos(angle) * kbStr;
            player.knockbackY = Math.sin(angle) * kbStr;
        }

        for (const other of EnemySystem.enemies) {
            if (!other.alive || other === enemy) continue;
            const odx = other.x - enemy.x, ody = other.y - enemy.y;
            const oDist = Math.sqrt(odx * odx + ody * ody);
            if (oDist < radius + other.radius) {
                const falloff = Math.max(0.5, 1 - oDist / (radius + other.radius) * 0.5);
                other.hp -= Math.floor(dmg * 0.5 * falloff);
                if (!other.isElite && !other.isBoss) {
                    const oDistSafe = oDist || 1;
                    other.knockbackX += odx / oDistSafe * 300 * falloff;
                    other.knockbackY += ody / oDistSafe * 300 * falloff;
                }
                other.flashTimer = 0.1;
                if (other.hp <= 0) other.alive = false;
            }
        }

        if (typeof AudioSystem !== 'undefined') AudioSystem.play('explosion');

        ParticleSystem.emit(enemy.x, enemy.y, 20, {
            speed: 150, color: '#ff5500', life: 0.4, size: 6, type: 'spark'
        });
        ParticleSystem.emit(enemy.x, enemy.y, 10, {
            speed: 80, color: '#ffcc00', life: 0.5, size: 12, type: 'glow'
        });
        ParticleSystem.emit(enemy.x, enemy.y, 5, {
            speed: 60, color: '#ffffff', life: 0.3, size: 8, type: 'glow'
        });

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
