// ============================================================
// src/engine/boss.js — Boss 系统（多阶段 + 技能组合 + 强制移动）
// 依赖: data.js (DataLoader), enemy.js (EnemySystem), stats.js (StatsSystem)
// ============================================================

/**
 * BossSystem — Boss 系统
 *
 * API:
 *   async loadBosses()                加载 Boss 类型数据
 *   create(bossId, x, y, waveLevel)   创建 Boss 实例
 *   destroy(boss)                     销毁 Boss（掉落传奇宝箱）
 *   update(dt, player)                每帧更新
 *   takeDamage(boss, damage)          受击处理
 *   getHpBarData()                    HP 条数据
 *   clear()                           清空
 *   isActive()                        是否有活跃 Boss
 *
 * 3 种行为: boss_chase / boss_ranged / boss_rage
 * 5 种技能: melee_sweep / fire_breath / fire_storm / charge / summon
 */

// ============================================================
// 3 种 Boss 行为
// ============================================================
const BOSS_BEHAVIORS = {
    /** 追击 + 周期性近战技能 */
    boss_chase: {
        update(boss, dt, player) {
            const dx = player.x - boss.x;
            const dy = player.y - boss.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 5) {
                const speed = (boss.speed || 40) * dt;
                boss.x += (dx / dist) * speed + boss.knockbackX * dt;
                boss.y += (dy / dist) * speed + boss.knockbackY * dt;
            } else {
                boss.x += boss.knockbackX * dt;
                boss.y += boss.knockbackY * dt;
            }
        },
    },

    /** 保持距离 + 远程技能 */
    boss_ranged: {
        update(boss, dt, player) {
            const dx = player.x - boss.x;
            const dy = player.y - boss.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const preferred = 250;

            if (dist < preferred - 50) {
                const speed = (boss.speed || 35) * dt;
                boss.x -= (dx / dist) * speed + boss.knockbackX * dt;
                boss.y -= (dy / dist) * speed + boss.knockbackY * dt;
            } else if (dist > preferred + 50) {
                const speed = (boss.speed || 35) * dt;
                boss.x += (dx / dist) * speed + boss.knockbackX * dt;
                boss.y += (dy / dist) * speed + boss.knockbackY * dt;
            } else {
                boss.x += boss.knockbackX * dt;
                boss.y += boss.knockbackY * dt;
            }
        },
    },

    /** 狂暴追击 + 全屏技能 */
    boss_rage: {
        update(boss, dt, player) {
            const dx = player.x - boss.x;
            const dy = player.y - boss.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // 1.5× 加速
            if (dist > 5) {
                const speed = (boss.speed || 55) * 1.5 * dt;
                boss.x += (dx / dist) * speed + boss.knockbackX * dt;
                boss.y += (dy / dist) * speed + boss.knockbackY * dt;
            } else {
                boss.x += boss.knockbackX * dt;
                boss.y += boss.knockbackY * dt;
            }
        },
    },
};

// ============================================================
// 5 种 Boss 技能
// ============================================================
const BOSS_SKILLS = {
    /** 扇形近战攻击 */
    melee_sweep: {
        execute(boss, player, skill) {
            const dx = player.x - boss.x;
            const dy = player.y - boss.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const range = skill.range || 100;

            if (dist <= range + (player.radius || 10)) {
                const dmg = Math.floor((boss.damage || 25) * (skill.damageMult || 1.0));
                if (typeof PlayerSystem !== 'undefined') {
                    PlayerSystem.takeDamage(dmg);
                    const angle = Math.atan2(dy, dx);
                    PlayerSystem.player.knockbackX = Math.cos(angle) * 300;
                    PlayerSystem.player.knockbackY = Math.sin(angle) * 300;
                }
            }
        },
    },

    /** 锥形火焰喷射 */
    fire_breath: {
        execute(boss, player, skill) {
            const dx = player.x - boss.x;
            const dy = player.y - boss.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const range = skill.range || 200;

            if (dist <= range) {
                const dmg = Math.floor((boss.damage || 25) * (skill.damageMult || 1.5));
                if (typeof PlayerSystem !== 'undefined') {
                    PlayerSystem.takeDamage(dmg);
                }
                // 燃烧效果
                if (skill.burnDps && typeof EffectEngine !== 'undefined') {
                    if (EffectEngine.applyBurn) {
                        EffectEngine.applyBurn(PlayerSystem.player, skill.burnDps, skill.burnDuration || 3.0, 3);
                    }
                }
            }
        },
    },

    /** 全屏火雨 */
    fire_storm: {
        execute(boss, player, skill) {
            const projectiles = skill.projectiles || 12;
            const radius = skill.radius || 250;
            const dmg = Math.floor((boss.damage || 25) * (skill.damageMult || 2.0));

            // 投掷多个火球向四周扩散
            const dx = player.x - boss.x;
            const dy = player.y - boss.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= radius + (player.radius || 10)) {
                if (typeof PlayerSystem !== 'undefined') {
                    PlayerSystem.takeDamage(dmg);
                }
            }

            // 粒子特效
            if (typeof ParticleSystem !== 'undefined') {
                for (let i = 0; i < Math.min(projectiles, 6); i++) {
                    const angle = (i / Math.min(projectiles, 6)) * Math.PI * 2;
                    ParticleSystem.emit(
                        boss.x + Math.cos(angle) * 60,
                        boss.y + Math.sin(angle) * 60,
                        3, { speed: 80, color: '#ff4400', life: 0.4, size: 5, type: 'spark' }
                    );
                }
            }
        },
    },

    /** 蓄力冲锋 */
    charge: {
        execute(boss, player, skill) {
            const dx = player.x - boss.x;
            const dy = player.y - boss.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const range = skill.range || 300;

            if (dist <= range) {
                const dmg = Math.floor((boss.damage || 25) * (skill.damageMult || 2.5));
                if (typeof PlayerSystem !== 'undefined') {
                    PlayerSystem.takeDamage(dmg);
                    const angle = Math.atan2(dy, dx);
                    PlayerSystem.player.knockbackX = Math.cos(angle) * 500;
                    PlayerSystem.player.knockbackY = Math.sin(angle) * 500;
                }
            }
        },
    },

    /** 召唤小怪 */
    summon: {
        execute(boss, player, skill) {
            const count = skill.count || 3;
            const enemyType = skill.enemyType || 'chaser_basic';
            if (typeof EnemySystem === 'undefined') return;

            // 在 Boss 周围召唤
            const spawnList = [];
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const sx = boss.x + Math.cos(angle) * 80;
                const sy = boss.y + Math.sin(angle) * 80;
                spawnList.push({ typeId: enemyType, x: sx, y: sy });
            }
            EnemySystem.createBatch(spawnList, boss.level || 1);
        },
    },
};

// ============================================================
// BossSystem 主对象
// ============================================================
const BossSystem = {
    /** 当前活跃的 Boss 实例 */
    activeBoss: null,

    /** Boss 类型定义（从 bosses.json 加载） */
    types: {},

    // -------------------------------------------------------
    // 数据加载
    // -------------------------------------------------------

    async loadBosses() {
        try {
            const data = await DataLoader.load('bosses');
            this.types = {};
            for (const def of data) {
                this.types[def.id] = def;
            }
        } catch (e) {
            console.warn('[BossSystem] 加载Boss数据失败:', e.message);
        }
    },

    // -------------------------------------------------------
    // 创建/销毁
    // -------------------------------------------------------

    /**
     * 创建 Boss 实例
     */
    create(bossId, x, y, waveLevel) {
        const type = this.types[bossId];
        if (!type) return null;

        const level = Math.max(1, waveLevel || 1);
        const scaledHp = Math.floor((type.baseHp || 1500) * (1 + level * 0.15));
        const scaledDmg = Math.floor((type.baseDamage || 25) * (1 + level * 0.12));
        const scaledSpd = Math.floor((type.baseSpeed || 40) * (1 + level * 0.05));

        // 取初始阶段配置
        const initialPhase = type.phases && type.phases.length > 0 ? type.phases[0] : null;

        const boss = {
            id: bossId,
            name: type.name || 'Boss',
            x, y,
            hp: scaledHp,
            maxHp: scaledHp,
            speed: scaledSpd,
            damage: scaledDmg,
            radius: type.radius || 40,
            color: type.color || '#ff4400',
            glowColor: type.glowColor || '#ff2200',
            level,
            alive: true,
            phases: type.phases || [],
            _currentPhase: 0,
            _phaseTimer: 0,
            _skillCooldown: 0,
            _skillIndex: 0,
            _invulnerable: false,
            _invulnTimer: 0,
            flashTimer: 0,
            knockbackX: 0, knockbackY: 0,
            behavior: initialPhase ? initialPhase.behavior : 'boss_chase',
        };

        this.activeBoss = boss;
        return boss;
    },

    /**
     * Boss 死亡
     */
    destroy(boss) {
        if (!boss || !boss.alive) return;
        boss.alive = false;

        // 掉落传奇宝箱
        if (typeof LootSystem !== 'undefined') {
            LootSystem.spawnChest(boss.x, boss.y, 'legendary');
        }

        // 大爆炸特效
        if (typeof ParticleSystem !== 'undefined') {
            ParticleSystem.emit(boss.x, boss.y, 30, {
                speed: 200, color: '#ff4400', life: 0.6, size: 10, type: 'explosion',
            });
            ParticleSystem.emit(boss.x, boss.y, 20, {
                speed: 100, color: '#ffcc00', life: 0.8, size: 15, type: 'glow',
            });
        }

        this.activeBoss = null;
    },

    // -------------------------------------------------------
    // 每帧更新
    // -------------------------------------------------------

    /**
     * 更新 Boss
     */
    update(dt, player) {
        if (!this.activeBoss || !this.activeBoss.alive) return;
        const boss = this.activeBoss;

        // 无敌计时
        if (boss._invulnerable) {
            boss._invulnTimer -= dt;
            if (boss._invulnTimer <= 0) {
                boss._invulnerable = false;
            }
        }

        // 阶段检查
        this.checkPhaseTransition(boss);

        // 击退衰减
        boss.knockbackX *= 0.9;
        boss.knockbackY *= 0.9;

        // 技能冷却
        boss._skillCooldown -= dt;

        // 执行技能
        const currentPhase = boss.phases[boss._currentPhase];
        if (boss._skillCooldown <= 0 && currentPhase && currentPhase.skills && currentPhase.skills.length > 0) {
            const skill = currentPhase.skills[boss._skillIndex % currentPhase.skills.length];
            this._executeSkill(boss, player, skill);
            boss._skillIndex++;
            boss._skillCooldown = currentPhase.attackInterval || 1.5;
        }

        // 行为移动
        const behaviorFn = BOSS_BEHAVIORS[boss.behavior];
        if (behaviorFn && !boss._invulnerable) {
            behaviorFn.update(boss, dt, player);
        } else if (!boss._invulnerable) {
            // 默认: 应用击退
            boss.x += boss.knockbackX * dt;
            boss.y += boss.knockbackY * dt;
        }

        // Flash 计时
        if (boss.flashTimer > 0) boss.flashTimer -= dt;
    },

    /**
     * 执行技能
     */
    _executeSkill(boss, player, skill) {
        if (!skill || !skill.type) return;
        const skillFn = BOSS_SKILLS[skill.type];
        if (skillFn) {
            skillFn.execute(boss, player, skill);
        }
    },

    /**
     * 检查并执行阶段切换
     */
    checkPhaseTransition(boss) {
        if (!boss || !boss.alive || !boss.phases || boss.phases.length === 0) return;

        const hpPct = (boss.hp / boss.maxHp) * 100;

        // 从后往前检查最符合的 phase
        let newPhase = 0;
        for (let i = boss.phases.length - 1; i >= 0; i--) {
            if (hpPct <= boss.phases[i].hpPercent) {
                newPhase = i;
                break;
            }
        }

        if (newPhase !== boss._currentPhase) {
            this._transitionPhase(boss, newPhase);
        }
    },

    /**
     * 执行阶段切换
     */
    _transitionPhase(boss, newPhase) {
        boss._currentPhase = newPhase;
        const phase = boss.phases[newPhase];
        if (!phase) return;

        // 短暂无敌
        boss._invulnerable = true;
        boss._invulnTimer = 1.0;

        // 更新属性
        if (phase.moveSpeed) boss.speed = phase.moveSpeed;
        boss.behavior = phase.behavior || boss.behavior;
        boss._skillCooldown = 0;
        boss._skillIndex = 0;

        // 特效
        if (typeof ParticleSystem !== 'undefined') {
            ParticleSystem.emit(boss.x, boss.y, 20, {
                speed: 100, color: '#ff4400', life: 0.5, size: 8, type: 'explosion',
            });
        }
    },

    // -------------------------------------------------------
    // 受击
    // -------------------------------------------------------

    /**
     * Boss 受击
     * @returns {number} -1=击杀, 0=存活, 1=未命中(无敌)
     */
    takeDamage(boss, damage) {
        if (!boss || !boss.alive) return 1;
        if (boss._invulnerable) return 1;

        boss.hp -= damage;
        boss.flashTimer = 0.1;

        if (boss.hp <= 0) {
            boss.hp = 0;
            this.destroy(boss);
            return -1;
        }

        // 受击后检查阶段切换
        this.checkPhaseTransition(boss);
        return 0;
    },

    // -------------------------------------------------------
    // UI
    // -------------------------------------------------------

    /**
     * Boss HP 条数据
     */
    getHpBarData() {
        if (!this.activeBoss || !this.activeBoss.alive) return null;
        const boss = this.activeBoss;
        const phase = boss.phases[boss._currentPhase];
        return {
            name: boss.name,
            hp: boss.hp,
            maxHp: boss.maxHp,
            phaseName: phase ? phase.name : '',
            phaseIndex: boss._currentPhase,
            phaseCount: boss.phases.length,
        };
    },

    // -------------------------------------------------------
    // 清理
    // -------------------------------------------------------

    clear() {
        this.activeBoss = null;
    },

    /** 是否有活跃 Boss */
    isActive() {
        return this.activeBoss !== null && this.activeBoss.alive && this.activeBoss.hp > 0;
    },
};

// ============================================================
// 导出
// ============================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BossSystem, BOSS_BEHAVIORS, BOSS_SKILLS };
}
