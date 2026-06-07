// ============================================================
// cyberblade/player.js - 玩家系统（多武器支持）
// ============================================================

// Animator 双环境兼容: 浏览器依赖 globalThis.Animator (index.html 先加载 animator.js);
// vitest/Node 依赖 global.Animator (顶层 import 由调用方保证). 都用 null 兜底.
// 注: 浏览器 <script> 共享全局 lexical scope, 不能用 const (跨文件重名冲突); 用 var 允许重复声明
var _Animator = (typeof globalThis !== 'undefined' && globalThis.Animator) || null;

// 敌人 _uid 计数器 (供 _tickMeleeHitDetection 同次攻击内去重)
let _uidCounter = 0;

const PlayerSystem = {
    player: null,

    create(startX, startY) {
        const p = {
            x: startX,
            y: startY,
            // 动画状态 (Animator 类)
            animator: _Animator ? _Animator.create({ phase: 0 }) : null,
            radius: 18,
            // 当前战斗属性（基础值，会被角色+武器修正）
            hp: 100,
            maxHp: 100,
            speed: 800,  // px/s, 加倍 (旧 500 偏慢)
            damage: 15,
            attackSpeed: 1.0,
            attackRange: 0,  // 加法风格: 武器 + 角色(由 csv 加载)
            armor: 0,
            dodge: 0,
            critChance: 0.05,
            critMultiplier: 2.0,
            luck: 0,
            harvesting: 0,
            pickupRange: 15,
            bulletCount: 1,
            bulletPierce: 0,
            bulletSpeed: 500,
            lifeSteal: 0,
            knockback: 0,
            hpRegen: 0.5,
            // 新属性
            xpGain: 0,
            meleeDamage: 0,
            rangedDamage: 0,
            elementalDamage: 0,
            engineering: 0,
            passives: [],
            // 游戏数据
            level: 1,
            xp: 0,
            xpToNext: 25,
            materials: 0,
            kills: 0,
            totalDamage: 0,
            // 无敌帧
            invincibleTimer: 0,
            invincibleDuration: 0.5,
            // 击退
            knockbackX: 0,
            knockbackY: 0,
            glowColor: '#00ffff',
            alive: true,
            // 多武器系统
            weapons: [{ id: 'pistol', level: 1, quality: 'T1' }],
            // 独特道具状态
            thornDamage: 0,
            energyShieldCD: 0,
            energyShieldTimer: 0,
            energyShieldReady: false,
            takenDmgMult: 1.0,
            replicatorChance: 0,
            magnetDmg: 0,
            magnetTimer: 0,
            magnetRadius: 0,
            piggyBank: false,
            bloodPactDrain: 0,
            compressionVuln: false,
            weaponParams: {},
            weaponSlots: 6,
            // 面向方向（替代鼠标）
            facingAngle: 0,
            // 武器攻击动画队列
            weaponAnimations: [],
            // Sprite 攻击帧结束时间（确保至少播放完整4帧 = 480ms）
            spriteAttackEndTime: 0,

            // 升级卡等级追踪（CSV 数据驱动）
            cardLevels: {},
            // 已购买道具追踪
            items: [],
            // 当前武器索引（用于渲染/切换显示）
            currentWeaponIdx: 0,
        };
        // 从角色系统应用基础属性
        p._baseDamage = p.damage;
        CharacterSystem.applyToPlayer(p, CharacterSystem.selectedCharacterId);
        p._baseDamage = p.damage;
        // 初始化武器参数
        this._initWeaponParams(p);
        // 初始化羁绊状态
        p._synergyMods = {};
        p._activeSynergies = [];
        // 计算初始羁绊加成
        this._updateSynergies();
        this.player = p;
        return p;
    },

    /** 重新计算武器羁绊加成 */
    _updateSynergies() {
        const p = this.player;
        if (!p || !p.weapons) return;

        // 1) 反转之前应用的羁绊修正
        const prev = p._synergyMods || {};
        // 新 TagSystem keys (唯一来源)
        if (prev.damagePercent) p.damage /= (1 + prev.damagePercent);
        if (prev.attackRange) p.attackRange -= prev.attackRange;  // 加法 rollback
        if (prev.bulletSpeed) p.bulletSpeed /= (1 + prev.bulletSpeed);
        if (prev.critChance) p.critChance = Math.max(0, p.critChance - prev.critChance);
        if (prev.critDamage) p.critMultiplier = Math.max(1, p.critMultiplier - prev.critDamage);
        if (prev.lifeSteal) p.lifeSteal = Math.max(0, p.lifeSteal - prev.lifeSteal);
        if (prev.bulletCount) p.bulletCount = Math.max(1, (p.bulletCount || 1) - prev.bulletCount);
        if (prev.armor) p.armor = Math.max(0, p.armor - prev.armor);
        if (prev.knockback) p.knockback = Math.max(0, p.knockback - prev.knockback);
        if (prev.engineering) p.engineering = Math.max(0, p.engineering - prev.engineering);
        if (prev.luck) p.luck = Math.max(0, p.luck - prev.luck);
        if (prev.xpGain) p.xpGain /= (1 + prev.xpGain);
        if (prev.elementalDamage) p.elementalDamage = Math.max(0, p.elementalDamage - prev.elementalDamage);
        if (prev.meleeDamage) p.meleeDamage = Math.max(0, p.meleeDamage - prev.meleeDamage);
        if (prev.rangedDamage) p.rangedDamage = Math.max(0, p.rangedDamage - prev.rangedDamage);

        // 2) 计算新的羁绊
        const synergies = TagSystem.getActiveSynergies(p.weapons);
        const newMods = {};
        for (const syn of synergies) {
            for (const [key, val] of Object.entries(syn.bonus)) {
                newMods[key] = (newMods[key] || 0) + val;
            }
        }

        // 3) 应用新的羁绊修正
        if (newMods.damagePercent) p.damage *= (1 + newMods.damagePercent);
        if (newMods.attackRange) p.attackRange = StatsSystem.clampStat('attackRange', p.attackRange + newMods.attackRange);  // 加法
        if (newMods.bulletSpeed) p.bulletSpeed *= (1 + newMods.bulletSpeed);
        if (newMods.critChance) p.critChance = Math.min(0.9, p.critChance + newMods.critChance);
        if (newMods.critDamage) p.critMultiplier += newMods.critDamage;
        if (newMods.lifeSteal) p.lifeSteal += newMods.lifeSteal;
        if (newMods.bulletCount) p.bulletCount = Math.min(20, (p.bulletCount || 1) + newMods.bulletCount);
        if (newMods.armor) p.armor = StatsSystem.clampStat('armor', p.armor + newMods.armor);
        if (newMods.knockback) p.knockback = (p.knockback || 0) + newMods.knockback;
        if (newMods.engineering) p.engineering = (p.engineering || 0) + newMods.engineering;
        if (newMods.luck) p.luck = (p.luck || 0) + newMods.luck;
        if (newMods.xpGain) p.xpGain *= (1 + newMods.xpGain);
        if (newMods.elementalDamage) p.elementalDamage = (p.elementalDamage || 0) + newMods.elementalDamage;
        if (newMods.meleeDamage) p.meleeDamage = (p.meleeDamage || 0) + newMods.meleeDamage;
        if (newMods.rangedDamage) p.rangedDamage = (p.rangedDamage || 0) + newMods.rangedDamage;

        // 4) 存储当前羁绊状态
        p._synergyMods = newMods;
        p._activeSynergies = synergies;

        // 5) 钳制所有属性到合法范围
        StatsSystem.clampPlayer(p);
    },

    /** 初始化所有装备武器的参数（含品质加成 + 等级加成） */
    _initWeaponParams(p) {
        if (!p.weaponParams) p.weaponParams = {};
        // 重置光环参数
        p.auraRadius = 0;
        p.auraHeal = 0;
        const weaponPool = ShopSystem.allWeapons || [];
        for (const w of p.weapons) {
            const def = weaponPool.find(d => d.id === w.id);
            if (def) {
                const level = w.level || 1;
                const params = {
                    behavior: def.behavior || 'bullet',
                    bulletCount: def.bulletCount || 1,
                    bulletSpeed: def.bulletSpeed || 500,
                    spread: def.spread || 0.1,
                    pierce: def.pierce || 0,
                    chainCount: def.chainCount || 0,
                    splashRadius: def.splashRadius || 0,
                    homingStrength: def.homingStrength || 0,
                    level: level,
                    healOnHit: def.healOnHit || 0,
                    auraHeal: def.auraHeal || 0,
                    auraRadius: def.auraRadius || 0,
                    burnDps: def.burnDps || 0,
                    burnMaxStacks: def.burnMaxStacks || 0,
                    critBounce: def.critBounce || 0,
                    attackRange: def.attackRange || 0,
                    bulletMaxRange: def.bulletMaxRange || 0,
                    meleeRange: def.meleeRange || 0,
                    tag: def.tag || '',
                    // 新字段: 暴击独立面板
                    critChanceAdd: def.critChanceAdd || 0,
                    critDamageAdd: def.critDamageAdd || 0,
                    // 新字段: 武器类别（BroTato Class 系统）
                    class: def.class || 'Primitive',
                    // 新字段: 击退力度
                    knockback: (def.knockback !== undefined && def.knockback !== null) ? def.knockback : 0,
                    // 存储原始 def 引用和等级, 供 FormulaSystem 使用
                    _weaponDef: def,
                    _weaponLevel: level,
                };
                p.weaponParams[w.id] = params;
                // 光环治疗：任何装备了 auraHeal/auraRadius 的武器都触发(不依赖 behavior)
                if (params.auraRadius > 0 && params.auraHeal > 0) {
                    p.auraRadius = Math.max(p.auraRadius, params.auraRadius);
                    p.auraHeal = Math.max(p.auraHeal, params.auraHeal);
                }
            }
        }
    },

    // ================================================================
    // 更新入口：按顺序调用各单一职责子方法
    // ================================================================
    update(dt, enemies) {
        const p = this.player;
        if (!p || !p.alive) return;

        this._updateMovement(dt, p);
        this._updateAutoAttack(dt, p);
        this._updateDelayedAttacks(dt, p);
        this._updateItems(dt, p);

        // 动画状态推进 (Animator)
        if (_Animator && p.animator) {
            _Animator.update(p.animator, dt);
        }
    },

    /** 移动：WASD + 击退衰减 + 边界钳制 */
    _updateMovement(dt, p) {
        const dir = Input.getInputDir();
        const isMoving = dir.x !== 0 || dir.y !== 0;
        p.isMoving = isMoving;
        if (isMoving) {
            p.facingAngle = Math.atan2(dir.y, dir.x);
            p.x += dir.x * p.speed * dt;
            p.y += dir.y * p.speed * dt;
        }

        // 击退
        p.x += p.knockbackX * dt;
        p.y += p.knockbackY * dt;
        p.knockbackX *= 0.9;
        p.knockbackY *= 0.9;

        // ====== 20260606 修复: 怪聚集阻挡玩家移动 → Brotato 风格 separation ======
        // 玩家身上重叠的怪被推开, 怪不会"合体"在玩家位置.
        // 同时也避免多只怪都判定 dist < _touchDist 都打玩家.
        if (typeof EnemySystem !== 'undefined' && EnemySystem.enemies) {
            const pR = p.radius || 10;
            for (let i = 0; i < EnemySystem.enemies.length; i++) {
                const e = EnemySystem.enemies[i];
                if (!e.alive) continue;
                const eR = e.radius || 14;
                const minD = eR + pR;
                const dx = e.x - p.x;
                const dy = e.y - p.y;
                const d = Math.hypot(dx, dy);
                if (d < minD && d > 0.01) {
                    const push = (minD - d) + 4; // 多推 4px 留缓冲, 怪会主动追
                    e.x += (dx / d) * push;
                    e.y += (dy / d) * push;
                }
            }
        }

        // 边界钳制
        p.x = Math.max(30, Math.min(GameWorld.width - 30, p.x));
        p.y = Math.max(30, Math.min(GameWorld.height - 30, p.y));
        if (p.invincibleTimer > 0) p.invincibleTimer -= dt;
    },

    /** 自动攻击：每个武器独立冷却 + 独立搜索目标 */
    /**
     * 自动攻击:每个武器独立 CD + 找最近目标 + 开火
     * KISS: 拆为 _tickCooldown / _getAttackRange / _findNearestTarget / _performAttack 四个单职责方法
     */
    _updateAutoAttack(dt, p) {
        const positions = this._getWeaponOrbitalPositions(p);
        for (let i = 0; i < p.weapons.length; i++) {
            const w = p.weapons[i];
            const params = p.weaponParams[w.id];
            if (!params) continue;
            if (!this._tickCooldown(w, dt)) continue;

            const weaponPos = positions[i] || { x: p.x, y: p.y, dist: 0 };
            const range = this._getAttackRange(p, params, weaponPos.dist || 0);
            const target = this._findNearestTarget(p, weaponPos, range, params);
            if (target) this._performAttack(p, w, params, target, weaponPos);
        }
    },

    /** 冷却计时(到 0 即允许攻击);返回是否冷却完毕 */
    _tickCooldown(weapon, dt) {
        if (weapon.cooldownTimer == null) weapon.cooldownTimer = 0;
        weapon.cooldownTimer -= dt;
        return weapon.cooldownTimer <= 0;
    },

    /**
     * 计算武器有效射程
     * - p.attackRange 设计是 1.0x 乘数(300=1.0x, 200=0.667x, 800=2.67x)
     * - 武器基础射程 params.attackRange(近战~80, 远程 300~400) 才是直接射程
     * - 加 weaponOrbitDistance 补偿: 武器在角色外 orbitDist 像素,敌人到武器远端距离
     *   = 敌人到角色 + orbitDist,所以射程要 + orbitDist
     */
    /**
     * 计算武器有效射程
     * - p.attackRange 是 1.0x 乘数 (300=1.0x, 200=0.667x, 800=2.67x)
     * - weaponRange 是 params.attackRange (近战~80, 远程 300~400)
     * - 触发范围 = 命中范围 (都是 weaponRange + p.attackRange), 不再加 orbitDist
     *   确保 _findNearestTarget 触发的怪都能被命中
     */
    _getAttackRange(p, params, orbitDist) {
        const isMelee = params.behavior === 'melee' || params.behavior === 'melee_sweep' || params.behavior === 'melee_thrust';
        // Brotato 加法风格: 武器 + 角色(无乘数, 默认武器 attackRange × 1)
        const weaponRange = params.attackRange || (isMelee ? 80 : 320);
        return weaponRange + (p.attackRange || 0);  // 关键: 不再加 orbitDist
    },

    /**
     * 找最近目标(敌人优先, 没敌人时退到医药箱)
     * - 距离以 weaponPos 为圆心
     * - 医药箱特殊: 远程严格按 range, 近战放宽到 range + 箱子半径
     */
    _findNearestTarget(p, weaponPos, range, params) {
        const isMelee = params.behavior === 'melee' || params.behavior === 'melee_sweep' || params.behavior === 'melee_thrust';
        // Brotato 规则: 搜索中心 = 角色 (与 _tickMeleeHitDetection 一致)
        // 之前用 weaponPos (头顶 128px 轨道) 导致 1 把剑的剑客搜不到下方怪
        const searchCenter = p;
        let nearest = null, nearDist = Infinity;
        for (const e of (EnemySystem.enemies || [])) {
            if (!e.alive) continue;
            const d = this._dist2(e, searchCenter);
            if (d < range && d < nearDist) { nearDist = d; nearest = e; }
        }
        if (!nearest && typeof MedkitSystem !== 'undefined' && MedkitSystem.crates.length > 0) {
            const crateRange = isMelee ? range + 18 : range;
            for (const c of MedkitSystem.crates) {
                if (!c.alive) continue;
                const d = this._dist2(c, searchCenter);
                if (d < crateRange && d < nearDist) { nearDist = d; nearest = c; }
            }
        }
        return nearest ? { target: nearest, dist: nearDist } : null;
    },

    /** 欧氏距离 */
    _dist2(a, b) {
        const dx = a.x - b.x, dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    },

    /**
     * 查询 (x,y) 半径 radius 内的敌人 (网格粗筛 + alive 过滤 + 去重)
     * 优先用 EnemySystem._grid, 不可用时回退到全量扫描
     */
    _queryEnemiesNear(x, y, radius) {
        let raw;
        if (typeof SpatialGrid !== 'undefined' && EnemySystem._grid) {
            raw = SpatialGrid.queryRadius(EnemySystem._grid, x, y, radius);
            // queryRadius 可能返回重复 (跨桶), 去重
            const seen = new Set();
            const result = [];
            for (let i = 0; i < raw.length; i++) {
                const e = raw[i];
                if (!e.alive || seen.has(e)) continue;
                seen.add(e);
                result.push(e);
            }
            return result;
        }
        // 回退: 全量扫描
        return EnemySystem.enemies.filter(e => e.alive);
    },

    /**
     * 执行一次攻击: 设置朝向 + 计算冷却 + 开火
     * 弹匣机制: magSize > 0 时累计 shotsFired, 到 magSize 触发换弹
     */
    _performAttack(p, weapon, params, targetInfo, weaponPos) {
        const { target, dist } = targetInfo;
        const targetAngle = Math.atan2(target.y - p.y, target.x - p.x);
        p.facingAngle = targetAngle;
        p._attackTargetAngle = targetAngle;
        p.spriteAttackEndTime = Date.now() + 480;

        const cd = this._calcWeaponCooldown(weapon, params, p);
        const magSize = (params._weaponDef && params._weaponDef.magSize) || 0;

        if (magSize > 0) {
            // 弹匣模式: 先开火再判断是否换弹
            weapon.cooldownTimer = cd;
            this._fireWeapon(weapon.id, params, target, weaponPos, dist);
            weapon.shotsFired = (weapon.shotsFired || 0) + 1;
            if (weapon.shotsFired >= magSize) {
                weapon.cooldownTimer = params._weaponDef.reloadTime || 1.0;
                weapon.shotsFired = 0;
            }
        } else {
            // 普通模式
            weapon.cooldownTimer = cd;
            this._fireWeapon(weapon.id, params, target, weaponPos, dist);
        }
    },

    /** 计算武器冷却(含狂暴血脉 < 30% HP 加成 + Brotato 范围平衡: 范围大→cd 增加) */
    _calcWeaponCooldown(weapon, params, p) {
        const rawDef = params._weaponDef;
        const lv = params._weaponLevel || weapon.level || 1;
        let cd = FormulaSystem.calcWeaponCooldown(rawDef, p, lv);
        if (p.berserkerBlood && p.hp < p.maxHp * 0.3) cd *= 0.667;
        // Brotato 平衡: 范围加成越大, 近战/所有武器冷却越长 (200 像素 ≈ +100% cd)
        if (p.attackRange) cd *= 1 + Math.max(0, p.attackRange) / 200;
        return cd;
    },

    /**
     * 武器攻击动画计时器 + 每帧近战碰撞检测
     * - 计时器: _attackAnimTimer 倒计时
     * - 每帧碰撞: 正在攻击的近战武器 (sweep/thrust) 用 _tickMeleeHitDetection 检测武器 sprite 圆 vs 怪
     *   命中: 扣血 + 击退 + 粒子, 同一怪同次攻击内不重复扣血
     */
    _updateDelayedAttacks(dt, p) {
        // 注: 突刺冲刺(前冲)效果已移除,玩家可随时 WASD 走位不受攻击影响
        // 武器攻击动画计时器
        if (p.weaponParams) {
            for (const key of Object.keys(p.weaponParams)) {
                const wp = p.weaponParams[key];
                if (wp._attackAnimTimer && wp._attackAnimTimer > 0) {
                    wp._attackAnimTimer -= dt;
                }
            }
        }

        // 每帧: 近战武器 sprite 圆形碰撞检测
        this._tickMeleeHitDetection(p);

        // 清理过期的攻击动画
        if (p.weaponAnimations) {
            const now = Date.now();
            p.weaponAnimations = p.weaponAnimations.filter(a => (now - a.startTime) < a.duration);
        }
    },

    /**
     * 计算武器 sprite 当前位置 + 半径 (复现 renderer.js 算法)
     * 用于每帧碰撞检测
     */
    _getWeaponSpritePos(p, wp, i, count) {
        const baseDist = (typeof SystemConfig !== 'undefined' ? SystemConfig.get('weaponOrbitDistance', 128) : 128);
        const extraPerSlot = (typeof SystemConfig !== 'undefined' ? SystemConfig.get('weaponOrbitExtraPerSlot', 6) : 6);
        const dist = baseDist + Math.max(0, (wp.slots || 1) - 1) * extraPerSlot;
        let angle, drawDist = dist;
        if (wp._attackAnimTimer && wp._attackAnimTimer > 0 && wp._attackAnimDuration > 0) {
            const progress = 1 - (wp._attackAnimTimer / wp._attackAnimDuration);
            const aa = wp._attackAngle;
            if (wp._attackBehavior === 'melee_thrust') {
                // Brotato 加法: 刺击距离 = 武器 + 角色加成
                const maxDist = dist + ((wp.attackRange || 60) + (p.attackRange || 0)) * 0.7;
                drawDist = dist + (maxDist - dist) * Math.sin(progress * Math.PI);
                angle = aa;
            } else if (wp._attackBehavior === 'melee_sweep') {
                angle = aa - Math.PI / 2 + progress * Math.PI;
            } else {
                angle = aa;
            }
        } else {
            angle = (i / count) * Math.PI * 2 - Math.PI / 2;
        }
        return {
            x: p.x + Math.cos(angle) * drawDist,
            y: p.y + Math.sin(angle) * drawDist,
            // 武器 sprite 半径: 32~64 像素, 与数据驱动 attackRange 挂钩
            radius: Math.max(32, ((wp.attackRange || 60) + (p.attackRange || 0)) * 0.4),
        };
    },

    /**
     * 每帧: 对所有正在攻击的近战武器 (sweep/thrust) 检测命中
     * 算法: 角色 + 锥形 (Brotato 风格)
     *   - 判定中心 = 角色位置 (Brotato: "角色挥剑/刺击", sprite 视觉)
     *   - 范围 = weaponRange (Brotato 加法: weapon.attackRange + player.attackRange)
     *   - 锥形: thrust 60° / sweep 180° (朝 attackAngle 方向)
     *   - 怪距角色 ≤ weaponRange + eR + 在锥内 = 命中
     * 命中: 扣血 + 击退 + 粒子, pierce 限制 (_meleeHit_<uid> 标记)
     *
     * 修复历史:
     *  v1: sprite 圆心 + 32 半径 → 长枪轨道 128px 外打不到聚集怪
     *  v2: 角色 + 大圆 → 无方向感, 攻击"上"下怪也命中
     *  v3: sprite 中心 + 大圆 + 60° 锥形 → 锥形方向跟怪相对 sprite 方向相反, 永远过不了
     *  v4: sprite 中心 + 线段碰撞 (不 clamp t) → 远怪 + 反方向怪都命中
     *  v5 ✓: 角色 + 锥形 → 方向感 + 距离感 + 聚集怪 3 个都满足
     */
    _tickMeleeHitDetection(p) {
        if (!p.weaponParams || typeof EnemySystem === 'undefined') return;
        const weapons = p.weapons || [];
        const count = weapons.length;
        if (count === 0) return;

        for (let i = 0; i < count; i++) {
            const w = weapons[i];
            const wp = p.weaponParams[w.id];
            if (!wp) continue;
            if (wp._attackBehavior !== 'melee_sweep' && wp._attackBehavior !== 'melee_thrust') continue;
            if (!wp._attackAnimTimer || wp._attackAnimTimer <= 0) continue;

            // Brotato 加法: 武器 + 角色
            const weaponRange = (wp.attackRange || 60) + (p.attackRange || 0);
            const aa = wp._attackAngle;
            // 锥形: Brotato 风格 (总角 = 2 * 半角)
            //   thrust 总角 5°  → 半角 2.5° = π/72
            //   sweep  总角 180° → 半角 90°  = π/2
            // 角度固定, 弧长随射程自动放大, 不需要公式
            const cone = (wp._attackBehavior === 'melee_sweep') ? Math.PI / 2 : Math.PI / 72;

            // 武器 sprite 当前帧中心 (用于击退方向, 不参与判定)
            const sprite = this._getWeaponSpritePos(p, wp, i, count);

            // 直接遍历 EnemySystem.enemies
            const enemies = EnemySystem.enemies;
            for (let j = 0; j < enemies.length; j++) {
                const e = enemies[j];
                if (!e.alive) continue;
                // 1) 距离过滤: 怪距角色 ≤ weaponRange + eR
                const dx = e.x - p.x, dy = e.y - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const eR = e.radius || 14;
                if (dist > weaponRange + eR) continue;

                // 2) 锥形过滤: 怪在 attackAngle ± cone/2 范围内
                const ang = Math.atan2(dy, dx);
                let diff = ang - aa;
                // normalize to [-π, π]
                diff = ((diff + Math.PI) % (2 * Math.PI)) - Math.PI;
                if (Math.abs(diff) > cone) continue;

                // 3) pierce 限制 (修复: 武士刀 pierce:3 之前被忽略, 只命中第一怪)
                //    - pierce = 0: 一次只打一怪 (用 _meleeHit_uid 标记)
                //    - pierce > 0: 累计命中, 超过 pierce 后 _meleeHit_uid 标记防重扣
                const pierceCount = wp.pierce || 0;
                const hitKey = '_meleeHit_' + (e._uid || (e._uid = ++_uidCounter));
                if (wp[hitKey]) continue;
                if (pierceCount > 0) {
                    if (!wp._hitCount) wp._hitCount = 0;
                    if (wp._hitCount >= pierceCount) {
                        wp[hitKey] = true;
                        continue;
                    }
                }
                wp[hitKey] = true;
                if (pierceCount > 0) wp._hitCount = (wp._hitCount || 0) + 1;

                // 扣血
                const dmg = StatsSystem.calcDamage(wp._weaponDef, p, e, wp);
                const result = EnemySystem.takeDamage(e, dmg);

                // 击退方向 (从 sprite 中心指向怪, 用 sprite→e 计算)
                const kbStat = (wp.knockback || (wp._attackBehavior === 'melee_thrust' && wp.tag === 'lance' ? 45 : 30)) + (p.knockback || 0);
                const kdx = e.x - sprite.x, kdy = e.y - sprite.y;
                const kdist = Math.sqrt(kdx * kdx + kdy * kdy);
                EnemySystem.applyKnockback(e, kdx, kdy, kdist, kbStat);

                // combat log
                if (typeof CombatLogSystem !== 'undefined') {
                    if (p._lastCrit) { CombatLogSystem.addCritDamage(e.x, e.y, dmg); }
                    else { CombatLogSystem.addDamage(e.x, e.y, dmg); }
                }

                // 燃烧
                if (wp.burnDps > 0 && e.alive) {
                    this._applyBurn(e, wp.burnDps, 3.0, wp.burnMaxStacks || 3);
                }

                // 粒子
                if (typeof ParticleSystem !== 'undefined') {
                    ParticleSystem.emit(e.x, e.y, 4, { speed: 60, color: '#88ccff', life: 0.2, size: 3, type: 'spark' });
                    ParticleSystem.emit(e.x, e.y, 2, { speed: 40, color: '#ffffff', life: 0.15, size: 5, type: 'glow' });
                }

                // 击杀
                if (result === -1 && typeof GameEngine !== 'undefined') {
                    GameEngine._handleEnemyKill(e, dmg);
                }
            }
        }

        // 清理过期的 _meleeHit_* 标记和 _hitCount (sweep/thrust 结束后)
        for (let i = 0; i < count; i++) {
            const w = weapons[i];
            const wp = p.weaponParams[w.id];
            if (!wp) continue;
            if (wp._attackAnimTimer && wp._attackAnimTimer > 0) continue;  // 还在攻击, 保留
            for (const k of Object.keys(wp)) {
                if (k.startsWith('_meleeHit_')) delete wp[k];
            }
            if (wp._hitCount) wp._hitCount = 0;
        }
    },

    /** 道具效果 + 恢复 + 拾取（全部被动持续效果） */
    _updateItems(dt, p) {
        // 生命恢复
        if (p.hp < p.maxHp) {
            p.hp = Math.min(p.maxHp, p.hp + p.hpRegen * dt);
        }
        // 圣光盾光环治疗
        if (p.auraRadius && p.auraHeal) {
            p._auraTimer = (p._auraTimer || 0) + dt;
            if (p._auraTimer >= 1.0) {
                p._auraTimer = 0;
                this.heal(p.auraHeal);
            }
        }
        // 磁暴线圈
        if (p.magnetDmg > 0 && p.magnetRadius > 0) {
            p.magnetTimer = (p.magnetTimer || 0) + dt;
            if (p.magnetTimer >= 2.0) {
                p.magnetTimer = 0;
                for (const e of (EnemySystem.enemies || [])) {
                    if (!e.alive) continue;
                    const dx = e.x - p.x, dy = e.y - p.y;
                    if (Math.sqrt(dx * dx + dy * dy) < p.magnetRadius) {
                        EnemySystem.takeDamage(e, p.magnetDmg);
                        ParticleSystem.emit(e.x, e.y, 3, {
                            speed: 30, color: '#8866ff', life: 0.3, size: 4, type: 'glow'
                        });
                    }
                }
            }
        }
        // 献血契约扣血
        if (p.bloodPactDrain > 0) {
            p._bloodPactTimer = (p._bloodPactTimer || 0) + dt;
            if (p._bloodPactTimer >= 1.0) {
                p._bloodPactTimer = 0;
                p.hp = Math.max(1, p.hp - p.bloodPactDrain);
            }
        }
        // 能量盾冷却
        this.updateEnergyShield(dt);
        // 拾取材料
        this._pickupMaterials();
    },

    /**
     * 计算各武器的轨道位置(与渲染器逻辑保持一致)
     * 距离公式: SystemConfig.weaponOrbitDistance(默认 128) + (slots-1) * weaponOrbitExtraPerSlot(默认 6)
     * 数据来源: csv/system.csv → src/data/system.json
     */
    _getWeaponOrbitalPositions(player) {
        const x = player.x, y = player.y;
        const weapons = player.weapons || [];
        const count = Math.min(weapons.length, 6);
        if (count === 0) return [];
        // 距离配置(系统参数,允许运行时调整,csv/system.csv)
        const baseDist = SystemConfig.get('weaponOrbitDistance', 128);
        const extraPerSlot = SystemConfig.get('weaponOrbitExtraPerSlot', 6);
        const positions = [];
        for (let i = 0; i < count; i++) {
            const w = weapons[i];
            const weaponDef = ShopSystem.allWeapons.find(d => d.id === w.id);
            // 360° 均匀分布，从上方开始
            const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
            const slots = weaponDef ? (weaponDef.slots || 1) : 1;
            const dist = baseDist + Math.max(0, slots - 1) * extraPerSlot;
            positions.push({
                x: x + Math.cos(angle) * dist,
                y: y + Math.sin(angle) * dist,
                orbitAngle: angle,
                weaponId: w.id,
                iconSize: 10 + slots * 4,
                dist: dist
            });
        }
        return positions;
    },

    /** 根据武器类型开火（近战按距离动态选择横扫/突刺） */
    _fireWeapon(weaponId, params, target, weaponPos, targetDist) {
        const p = this.player;
        const weaponDef = ShopSystem.getWeaponDef(weaponId);
        // player→target 夹角（用于近战攻击方向、角色朝向）
        const angle = Math.atan2(target.y - p.y, target.x - p.x);
        const spawnX = weaponPos ? weaponPos.x : p.x + Math.cos(angle) * 25;
        const spawnY = weaponPos ? weaponPos.y : p.y + Math.sin(angle) * 25;

        // weaponPos→target 精确夹角（用于远程子弹飞行方向、武器图标指向）
        const fireAngle = Math.atan2(target.y - spawnY, target.x - spawnX);

        // 近战武器 behavior 选择 (3 条规则):
        // 1) melee_sweep 武器 (等离子刀/能量斧): 默认 thrust, 仅周围怪数 ≥3 才用 sweep
        //    (修复: 之前 sweep 武器永远 sweep, 视觉上无差别. 现在 sweep 是"群怪时大招")
        // 2) melee (无明确): lance 永远 thrust, 其他按距离
        // 3) melee_thrust (武士刀/能量剑): 永远 thrust
        let actualBehavior = params.behavior;
        const meleeRange = (params.attackRange || 60) + (p.attackRange || 0);
        if (actualBehavior === 'melee_sweep') {
            // 周围 attackRange 内怪数 ≥3 才用 sweep
            let nearCount = 0;
            if (typeof EnemySystem !== 'undefined' && EnemySystem.enemies) {
                const enemies = EnemySystem.enemies;
                for (let j = 0; j < enemies.length; j++) {
                    const e = enemies[j];
                    if (!e.alive) continue;
                    const dx = e.x - p.x, dy = e.y - p.y;
                    if (dx * dx + dy * dy <= meleeRange * meleeRange) nearCount++;
                }
            }
            actualBehavior = (nearCount >= 3) ? 'melee_sweep' : 'melee_thrust';
        } else if (actualBehavior === 'melee') {
            const weaponDef = ShopSystem.allWeapons.find(d => d.id === weaponId);
            if (weaponDef && weaponDef.tag === 'lance') {
                actualBehavior = 'melee_thrust';
            } else {
                actualBehavior = (targetDist < meleeRange * 0.45) ? 'melee_sweep' : 'melee_thrust';
            }
        }
        // melee_thrust: 保持原样

        // 近战/远程判定
        const isMeleeAttack = actualBehavior === 'melee' || actualBehavior === 'melee_sweep' || actualBehavior === 'melee_thrust';

        // 设置武器动画状态（供渲染器使用）
        if (isMeleeAttack) {
            params._attackAnimTimer = actualBehavior === 'melee_sweep' ? 0.35 : 0.25;
            params._attackAnimDuration = params._attackAnimTimer;
            params._attackAngle = angle;
            params._attackBehavior = actualBehavior;
            params._attackTargetDist = targetDist;
        } else {
            // 远程武器：枪口旋转瞄准目标（fireAngle = weaponPos→target）
            params._attackAnimTimer = 0.3;
            params._attackAnimDuration = 0.3;
            params._attackAngle = fireAngle;
            params._attackBehavior = 'ranged';
        }

        // 记录攻击动画（非近战存 fireAngle 供渲染器使用）
        if (p.weaponAnimations) {
            p.weaponAnimations.push({
                weaponId: weaponId,
                behavior: actualBehavior,
                angle: angle,
                fireAngle: isMeleeAttack ? undefined : fireAngle,
                startTime: Date.now(),
                duration: actualBehavior === 'melee_sweep' ? 350 :
                          actualBehavior === 'melee_thrust' ? 250 : 200
            });
        }

        // 近战：扫/刺以武器轨道位置为圆心，用 weaponPos→target 角度
        // 远程：用 weaponPos→target 精确角度（子弹对准目标）
        const attackAngle = fireAngle;

        switch (actualBehavior) {
            case 'spread':
                this._fireSpread(attackAngle, params, target, weaponId, spawnX, spawnY, weaponDef);
                break;
            case 'laser':
                this._fireLaser(attackAngle, params, target, weaponId, spawnX, spawnY, weaponDef);
                break;
            case 'shock':
                this._fireShock(attackAngle, params, target, weaponId, spawnX, spawnY, weaponDef);
                break;
            case 'melee':
            case 'melee_sweep':
                this._fireMeleeSweep(attackAngle, params, target, weaponId, weaponPos, weaponDef);
                break;
            case 'melee_thrust':
                this._fireMeleeThrust(attackAngle, params, target, weaponId, weaponPos, weaponDef);
                break;
            case 'explode':
                this._fireExplode(attackAngle, params, target, weaponId, spawnX, spawnY, weaponDef);
                break;
            case 'frost':
                this._fireFrost(attackAngle, params, target, weaponId, spawnX, spawnY, weaponDef);
                break;
            case 'homing':
                this._fireHoming(attackAngle, params, target, weaponId, spawnX, spawnY, weaponDef);
                break;
            case 'heal_bullet':
                this._fireHealBullet(attackAngle, params, target, weaponId, spawnX, spawnY, weaponDef);
                break;
            case 'shield_aura':
                this._fireBullet(attackAngle, params, target, weaponId, spawnX, spawnY, weaponDef);
                break;
            case 'spray':
                this._fireSpray(attackAngle, params, target, weaponId, spawnX, spawnY, weaponDef);
                break;
            default:
                this._fireBullet(attackAngle, params, target, weaponId, spawnX, spawnY, weaponDef);
        }

        // 开火粒子特效
        const color = actualBehavior === 'melee_sweep' ? '#ff8800' :
                      actualBehavior === 'melee_thrust' ? '#00ccff' :
                      actualBehavior === 'spray' ? '#ff6600' : '#00ffff';
        ParticleSystem.emit(p.x, p.y, 2, {
            speed: 40,
            color: color,
            life: 0.12,
            size: actualBehavior === 'spray' ? 5 : 3,
            spread: 0.3,
            type: 'spark'
        });
        // 开火音效:按武器 tag(枪械/魔法/近战) + behavior(具体行为)综合决定
        // 区分目标:枪械听起来"实弹";魔法听起来"奥术";近战"挥砍"
        if (typeof AudioSystem !== 'undefined') {
            const tag = weaponDef ? weaponDef.tag : null;
            let sound = null;
            // 1) 元素类特殊行为:跨 tag 优先(冰/火/雷元素听感强烈)
            if (actualBehavior === 'shock')      sound = 'lightning';
            else if (actualBehavior === 'frost')  sound = 'ice';
            else if (actualBehavior === 'spray')  sound = 'fire';
            else if (actualBehavior === 'explode') {
                // 枪械爆炸(cannon)用 cannon;魔法爆炸用 explosion
                sound = tag === 'gun' ? 'cannon' : 'explosion';
            }
            // 2) 近战
            else if (actualBehavior === 'melee_sweep')  sound = 'melee_slash';
            else if (actualBehavior === 'melee_thrust') sound = 'melee_heavy';
            // 3) 远程:按 tag 区分
            else if (tag === 'gun' || tag === 'bow') {
                if (actualBehavior === 'spread' || actualBehavior === 'laser') sound = 'heavy_gun';
                else sound = 'gunshot';  // 普通弹
            }
            else if (tag === 'magic') {
                if (actualBehavior === 'homing')  sound = 'magic';
                else if (actualBehavior === 'bullet') sound = 'magic';
                else if (actualBehavior === 'spread') sound = 'magic';
                else sound = 'magic';
            }
            else if (tag === 'medic') sound = 'pistol';
            // 4) 兜底
            if (!sound) {
                if (actualBehavior === 'bullet')       sound = tag === 'magic' ? 'magic' : 'pistol';
                else if (actualBehavior === 'spread')  sound = tag === 'magic' ? 'magic' : 'heavy_gun';
                else if (actualBehavior === 'homing')  sound = 'magic';
                else if (actualBehavior === 'laser')   sound = 'laser';
                else if (actualBehavior === 'heal_bullet') sound = 'pistol';
                else sound = 'pistol';
            }
            AudioSystem.play(sound);
        }
    },

    /** ====== 以下是各武器类型的具体开火函数 ====== */

    /** 标准子弹 */
    _fireBullet(angle, params, target, weaponId, spawnX, spawnY, weaponDef) {
        const p = this.player;
        const dmg = StatsSystem.calcDamage(weaponDef, p, target, params);
        const totalPierce = (params.pierce || 0) + (p.bulletPierce || 0);
        const bulletRange = params.bulletMaxRange > 0 ? params.bulletMaxRange : (params.attackRange || p.attackRange || 300);
        const startAngle = angle - params.spread * (params.bulletCount - 1) / 2;
        for (let i = 0; i < params.bulletCount; i++) {
            const a = startAngle + params.spread * i;
            BulletSystem.create(
                spawnX, spawnY,
                a, dmg, params.bulletSpeed, totalPierce, true, weaponId,
                { range: bulletRange }
            );
        }
    },

    /** 散射 */
    _fireSpread(angle, params, target, weaponId, spawnX, spawnY, weaponDef) {
        const p = this.player;
        const dmg = StatsSystem.calcDamage(weaponDef, p, target, params);
        const totalPierce = (params.pierce || 0) + (p.bulletPierce || 0);
        const bulletRange = params.bulletMaxRange > 0 ? params.bulletMaxRange : (params.attackRange || p.attackRange || 300);
        const spreadAngle = params.spread || 0.3;
        const startAngle = angle - spreadAngle * (params.bulletCount - 1) / 2;
        for (let i = 0; i < params.bulletCount; i++) {
            const a = startAngle + spreadAngle * i + (Math.random() - 0.5) * 0.1;
            BulletSystem.create(
                spawnX, spawnY,
                a, dmg, params.bulletSpeed, totalPierce, true, weaponId,
                { range: bulletRange }
            );
        }
    },

    /** 激光（快速直线） */
    _fireLaser(angle, params, target, weaponId, spawnX, spawnY, weaponDef) {
        const p = this.player;
        const dmg = StatsSystem.calcDamage(weaponDef, p, target, params);
        const totalPierce = (params.pierce || 0) + (p.bulletPierce || 0);
        const bulletRange = params.bulletMaxRange > 0 ? params.bulletMaxRange : (params.attackRange || p.attackRange || 300);
        for (let i = 0; i < 3; i++) {
            const a = angle + (Math.random() - 0.5) * 0.05;
            BulletSystem.create(
                spawnX, spawnY,
                a, dmg, params.bulletSpeed * (1 + i * 0.3), totalPierce, true, weaponId,
                { range: bulletRange }
            );
        }
    },

    /** 电击（连锁） */
    _fireShock(angle, params, target, weaponId, spawnX, spawnY, weaponDef) {
        const p = this.player;
        const dmg = StatsSystem.calcDamage(weaponDef, p, target, params);
        const range = params.attackRange || 120;
        const pierceCount = params.pierce || 3;
        const halfWidth = 15; // 窄宽度 ~30px
        let hits = 0;

        // 注: 突刺冲刺(前冲)效果已移除,玩家可随时 WASD 走位
        const isLance = weaponDef && weaponDef.tag === 'lance';

        // 按距离排序敌人
        const enemiesInRange = EnemySystem.enemies.filter(e => e.alive);
        enemiesInRange.sort((a, b) => {
            const da = (a.x - p.x) ** 2 + (a.y - p.y) ** 2;
            const db = (b.x - p.x) ** 2 + (b.y - p.y) ** 2;
            return da - db;
        });

        for (const e of enemiesInRange) {
            if (hits > pierceCount) break;
            const dx = e.x - p.x, dy = e.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > range) continue;

            // 检查敌人是否在突刺方向窄扇形内
            const enemyAngle = Math.atan2(dy, dx);
            let diff = enemyAngle - angle;
            if (diff > Math.PI) diff -= Math.PI * 2;
            if (diff < -Math.PI) diff += Math.PI * 2;
            const perpendicularDist = Math.abs(Math.sin(diff) * dist);
            if (perpendicularDist > halfWidth && Math.abs(diff) > 0.25) continue;

            hits++;
            // 浮动伤害数字
            if (typeof CombatLogSystem !== 'undefined') {
                if (p._lastCrit) {
                    CombatLogSystem.addCritDamage(e.x, e.y, dmg);
                    CombatLogSystem.logCrit(dmg);
                } else {
                    CombatLogSystem.addDamage(e.x, e.y, dmg);
                }
            }
            const result = EnemySystem.takeDamage(e, dmg);

            // 击退（使用武器自身击退值, 默认骑枪600/其他400；精英/Boss 免疫）
            const kbStr = (params.knockback > 0 ? params.knockback : (isLance ? 600 : 400)) + (p.knockback || 0);
            EnemySystem.applyKnockback(e, dx, dy, dist, kbStr);

            // 燃烧效果
            if (params.burnDps > 0 && e.alive) {
                this._applyBurn(e, params.burnDps, 3.0, params.burnMaxStacks || 3);
            }

            // 突刺命中特效（骑枪用紫色，其他用蓝色）
            const hitColor = isLance ? '#ff88ff' : '#00ccff';
            if (typeof ParticleSystem !== 'undefined') {
                ParticleSystem.emit(e.x, e.y, 6, {
                    speed: 100, color: hitColor, life: 0.2, size: 4, type: 'spark'
                });
                ParticleSystem.emit(e.x, e.y, 4, {
                    speed: 60, color: '#ffffff', life: 0.15, size: 7, type: 'glow'
                });
            }

            if (result === -1) {
                if (typeof GameEngine !== 'undefined') GameEngine._handleEnemyKill(e, dmg);
            }
        }

        // ---- 攻击医药箱（突刺直线穿透） ----
        if (typeof MedkitSystem !== 'undefined') {
            for (const crate of MedkitSystem.crates) {
                if (!crate.alive) continue;
                const dx = crate.x - p.x, dy = crate.y - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > range + crate.radius) continue;
                // 检查是否在突刺方向窄扇形内
                const crateAngle = Math.atan2(dy, dx);
                let diff = crateAngle - angle;
                if (diff > Math.PI) diff -= Math.PI * 2;
                if (diff < -Math.PI) diff += Math.PI * 2;
                const perpendicularDist = Math.abs(Math.sin(diff) * dist);
                if (perpendicularDist > halfWidth && Math.abs(diff) > 0.25) continue;
                MedkitSystem.takeDamage(crate, dmg);
                break; // 突刺穿透攻击，打中一个医药箱即可
            }
        }

        // 剑气视觉特效（在攻击路径上）
        const fxDist = Math.min(range * 0.4, 60);
        const trailColor = isLance ? '#ff88ff' : '#00ccff';
        ParticleSystem.emit(
            p.x + Math.cos(angle) * fxDist,
            p.y + Math.sin(angle) * fxDist,
            5, { speed: 80, color: trailColor, life: 0.15, size: 5, type: 'spark' }
        );

    },

    /** 爆炸 */
    _fireExplode(angle, params, target, weaponId, spawnX, spawnY, weaponDef) {
        const range = (params.bulletMaxRange > 0 ? params.bulletMaxRange : params.attackRange) || this.player.attackRange || 300;
        const dmg = StatsSystem.calcDamage(weaponDef, this.player, target, params);
        const b = BulletSystem.create(
            spawnX, spawnY,
            angle, dmg, params.bulletSpeed, 0, true, weaponId,
            { splashRadius: params.splashRadius || 60, range }
        );
        b.splashRadius = params.splashRadius || 60;
    },

    /** 冰霜（含冰爆半径传递） */
    _fireFrost(angle, params, target, weaponId, spawnX, spawnY, weaponDef) {
        const p = this.player;
        const dmg = Math.max(1, StatsSystem.calcDamage(weaponDef, p, target, params));
        const totalPierce = (params.pierce || 0) + (p.bulletPierce || 0);
        const bulletRange = params.bulletMaxRange > 0 ? params.bulletMaxRange : (params.attackRange || p.attackRange || 300);
        const splashR = params.splashRadius || 0;
        const startAngle = angle - params.spread * (params.bulletCount - 1) / 2;
        for (let i = 0; i < params.bulletCount; i++) {
            const a = startAngle + params.spread * i;
            const b = BulletSystem.create(
                spawnX, spawnY,
                a, dmg, params.bulletSpeed, totalPierce, true, weaponId,
                { slowAmount: 0.5, slowDuration: 2.0, splashRadius: splashR, range: bulletRange }
            );
            b.splashOnHitOnly = true; // 冰霜命中才冰爆
        }
    },

    /** 跟踪 */
    _fireHoming(angle, params, target, weaponId, spawnX, spawnY, weaponDef) {
        const p = this.player;
        const dmg = StatsSystem.calcDamage(weaponDef, p, target, params);
        const totalPierce = (params.pierce || 0) + (p.bulletPierce || 0);
        const bulletRange = params.bulletMaxRange > 0 ? params.bulletMaxRange : (params.attackRange || p.attackRange || 300);
        BulletSystem.create(
            spawnX, spawnY,
            angle, dmg, params.bulletSpeed, totalPierce, true, weaponId,
            { homingStrength: params.homingStrength || 3, range: bulletRange }
        );
    },

    /** 喷射 - 锥形多弹体穿透攻击 */
    _fireSpray(angle, params, target, weaponId, spawnX, spawnY, weaponDef) {
        const p = this.player;
        const sprayCone = params.sprayCone || 0.8;
        const bulletCount = Math.max(3, Math.floor(params.bulletCount * 3));
        const dmgMult = p._sprayDamageMult || 1.0;
        const pierceAdd = p._sprayPierceAdd || 0;
        const dmg = Math.max(1, Math.round(StatsSystem.calcDamage(weaponDef, p, target, params) * dmgMult));
        const totalPierce = (params.pierce || 0) + pierceAdd + (p.bulletPierce || 0);
        const bulletRange = (params.bulletMaxRange > 0 ? params.bulletMaxRange : params.attackRange) || 320;
        const startAngle = angle - sprayCone / 2;
        // 分成多个弹体覆盖锥形范围
        for (let i = 0; i < bulletCount; i++) {
            const a = startAngle + (sprayCone / (bulletCount - 1 || 1)) * i + (Math.random() - 0.5) * 0.15;
            const extra = {
                slowAmount: params.slowAmount || 0,
                slowDuration: params.slowDuration || 0,
                burnDps: params.burnDps || 0,
                burnMaxStacks: params.burnMaxStacks || 0,
                splashRadius: params.splashRadius || 0,
                range: bulletRange, // 喷射击中后冰爆,需正确射程判断消失
            };
            const b = BulletSystem.create(
                spawnX, spawnY,
                a, dmg, params.bulletSpeed || 300, totalPierce, true, weaponId, extra
            );
            b.splashOnHitOnly = true; // 喷射击中才触发冰爆,不是飞行超时爆炸
        }
        // 喷射口火焰特效
        for (let i = 0; i < 4; i++) {
            const a = angle + (Math.random() - 0.5) * 0.8;
            ParticleSystem.emit(
                p.x + Math.cos(a) * 30, p.y + Math.sin(a) * 30,
                3, { speed: 100, color: '#ff6600', life: 0.2, size: 5, type: 'glow' }
            );
        }
    },

    /** 治愈弹（治疗队友） */
    _fireHealBullet(angle, params, target, weaponId, spawnX, spawnY, weaponDef) {
        const p = this.player;
        const dmg = StatsSystem.calcDamage(weaponDef, p, target, params);
        const totalPierce = (params.pierce || 0) + (p.bulletPierce || 0);
        BulletSystem.create(
            spawnX, spawnY,
            angle, dmg, params.bulletSpeed, totalPierce, true, weaponId,
            { healOnHit: params.healOnHit || 3 }
        );
    },

    /** 近战横扫 - 仅触发挥动特效; 伤害/击退/燃烧 全部交给 _tickMeleeHitDetection */
    _fireMeleeSweep(angle, params, target, weaponId, weaponPos, weaponDef) {
        const p = this.player;
        const meleeRange = (params.attackRange || (weaponDef ? weaponDef.attackRange : 60) || 60) + (p.attackRange || 0);
        const originX = p.x;
        const originY = p.y;

        // 挥动大弧面特效 (180° 扇形视觉)
        const spreadAngle = Math.PI;
        const sweepR = meleeRange * 0.6;
        const step = spreadAngle / 10;
        for (let i = 0; i <= 10; i++) {
            const a = angle - spreadAngle / 2 + step * i;
            ParticleSystem.emit(
                originX + Math.cos(a) * sweepR,
                originY + Math.sin(a) * sweepR,
                2, { speed: 40, color: '#88ccff', life: 0.3, size: 3, type: 'spark' }
            );
        }
        ParticleSystem.emit(originX, originY, 8, { speed: 80, color: '#88ccff', life: 0.4, size: 5, type: 'spark' });
    },

    /** 近战突刺 - 仅触发起手特效; 伤害/击退/燃烧 全部交给 _tickMeleeHitDetection */
    _fireMeleeThrust(angle, params, target, weaponId, weaponPos, weaponDef) {
        const p = this.player;
        // 突刺起手特效 (沿用 angle 视觉方向)
        const sx = weaponPos ? weaponPos.x : p.x + Math.cos(angle) * 25;
        const sy = weaponPos ? weaponPos.y : p.y + Math.sin(angle) * 25;
        ParticleSystem.emit(sx, sy, 5, { speed: 100, color: '#ff88ff', life: 0.2, size: 4, type: 'spark' });
    },

    /** 对敌人施加燃烧效果 */
    _applyBurn(enemy, dps, duration, maxStacks) {
        if (!enemy || !enemy.alive) return;
        if (!enemy.burnStacks) enemy.burnStacks = [];
        if (enemy.burnStacks.length >= (maxStacks || 3)) {
            // 已满层，刷新最久的一层
            enemy.burnStacks.sort((a, b) => a.remaining - b.remaining);
            enemy.burnStacks[0] = { dps: dps, remaining: duration };
        } else {
            enemy.burnStacks.push({ dps: dps, remaining: duration });
        }
    },

    /** 施加冰爆效果（敌人死亡时触发） */
    _triggerIceExplosion(enemy) {
        const p = this.player;
        if (!p) return;
        const radius = 50 * (p._iceExplosionRadiusAdd ? (1 + p._iceExplosionRadiusAdd) : 1);
        let baseDmg = p.damage * 0.5;
        if (p._iceExplosionMult) baseDmg *= p._iceExplosionMult;
        for (const e of EnemySystem.enemies) {
            if (!e.alive || e === enemy) continue;
            const dx = e.x - enemy.x, dy = e.y - enemy.y;
            if (Math.sqrt(dx * dx + dy * dy) < radius) {
                EnemySystem.takeDamage(e, Math.floor(baseDmg));
                // 冰爆减速
                e.slowTimer = 2.0;
                e.slowFactor = 0.4;
            }
        }
        ParticleSystem.explosion(enemy.x, enemy.y, '#44ccff', 15);
        if (typeof AudioSystem !== 'undefined') AudioSystem.play('explosion');
    },

    /** 燃烧传播（燃烧扩散器） */
    _spreadBurn(enemy) {
        const p = this.player;
        if (!p || !p._burnSpreadLevel) return;
        const range = p._burnSpreadRange || 200;
        const spreadLayers = Math.min(p._burnSpreadLevel, 3);
        for (const e of EnemySystem.enemies) {
            if (!e.alive || e === enemy) continue;
            const dx = e.x - enemy.x, dy = e.y - enemy.y;
            if (Math.sqrt(dx * dx + dy * dy) < range) {
                for (let i = 0; i < spreadLayers; i++) {
                    if (enemy.burnStacks && enemy.burnStacks.length > 0) {
                        const src = enemy.burnStacks[Math.min(i, enemy.burnStacks.length - 1)];
                        this._applyBurn(e, src.dps, 3.0, 3);
                    }
                }
            }
        }
    },

    _pickupMaterials() {
        const p = this.player;
        const range = p.pickupRange + 80;
        for (let i = GameWorld.materials.length - 1; i >= 0; i--) {
            const m = GameWorld.materials[i];
            const dx = m.x - p.x, dy = m.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < range) {
                const pullStrength = Math.min(0.25, 8 / Math.max(dist, 1));
                m.x -= dx * pullStrength;
                m.y -= dy * pullStrength;
                const newDx = m.x - p.x, newDy = m.y - p.y;
                const newDist = Math.sqrt(newDx * newDx + newDy * newDy);
                if (newDist < p.pickupRange + 10) {
                    const value = Math.floor(m.value * (1 + p.harvesting / 100));
                    p.materials += value;
                    ParticleSystem.pickup(p.x, p.y);
                    if (typeof AudioSystem !== 'undefined') AudioSystem.play('coin');
                    GameWorld.materials.splice(i, 1);
                }
            }
        }
    },

    /** 敌人碰撞伤害回调（从enemy.js调用），可选传参 attacker */
    takeDamage(rawDmg, attacker) {
        const p = this.player;
        if (p.invincibleTimer > 0) return 0;

        // ====== 能量盾：每8秒格挡一次 ======
        if (p.energyShieldReady && p.energyShieldCD > 0) {
            p.energyShieldReady = false;
            p.energyShieldTimer = p.energyShieldCD;
            // 格挡特效
            ParticleSystem.emit(p.x, p.y, 12, {
                speed: 100, color: '#00ffff', life: 0.4, size: 8, type: 'circle'
            });
            return 0;
        }

        // 闪避判定
        if (Math.random() < p.dodge) {
            ParticleSystem.emit(p.x, p.y, 5, {
                speed: 80,
                color: '#ffffff',
                life: 0.2,
                size: 3,
                type: 'glow'
            });
            return 0;
        }

        // ====== 受伤倍率（兴奋剂） ======
        let finalRawDmg = rawDmg;
        if (p.takenDmgMult && p.takenDmgMult > 1.0) {
            finalRawDmg = Math.round(rawDmg * p.takenDmgMult);
        }

        // ====== 压缩靴：被击中额外伤害50%*2s ======
        if (p.compressionVuln) {
            finalRawDmg = Math.round(finalRawDmg * 1.5);
            p.compressionVuln = false; // 单次生效，实际持续2秒debuff, 简化为固定1.5倍
        }

        // ====== 减伤光环（武器 damageReductionAura 字段） ======
        let drAuraTotal = 0;
        if (p.weaponParams) {
            for (const w of (p.weapons || [])) {
                const params = p.weaponParams[w.id];
                if (params && params.damageReductionAura > 0) {
                    drAuraTotal += params.damageReductionAura;
                }
            }
        }
        if (drAuraTotal > 0) {
            // 多个祝福盾叠加：取最大（避免线性叠加破坏平衡）
            drAuraTotal = Math.min(0.9, Math.max(drAuraTotal, 0));
            finalRawDmg = Math.round(finalRawDmg * (1 - drAuraTotal));
        }

        // 护甲减伤（递减曲线）
        const finalDmg = StatsSystem.calcDamageReduction(finalRawDmg, p.armor);
        p.hp -= finalDmg;
        p.invincibleTimer = p.invincibleDuration;

        // 受伤音效
        if (typeof AudioSystem !== 'undefined') AudioSystem.play('hurt');

        // ====== 反应装甲：受击50%概率回5HP(冷却3s) ======
        if (p.reactiveArmor) {
            const now = Date.now();
            if (!p._reactiveArmorLastProc) p._reactiveArmorLastProc = 0;
            if (now - p._reactiveArmorLastProc > 3000 && Math.random() < 0.5) {
                p._reactiveArmorLastProc = now;
                const healAmt = Math.min(5, p.maxHp - p.hp);
                if (healAmt > 0) {
                    p.hp += healAmt;
                    ParticleSystem.emit(p.x, p.y, 6, {
                        speed: 50, color: '#44ff88', life: 0.4, size: 6, type: 'glow'
                    });
                }
            }
        }

        // ====== 荆棘甲：反弹30%伤害给攻击者 ======
        if (p.thornDamage > 0 && attacker && attacker.alive) {
            const reflectDmg = Math.max(1, Math.floor(finalDmg * p.thornDamage));
            EnemySystem.takeDamage(attacker, reflectDmg);
            ParticleSystem.emit(attacker.x, attacker.y, 5, {
                speed: 50, color: '#ff4400', life: 0.3, size: 4, type: 'spark'
            });
        }

        ParticleSystem.emit(p.x, p.y, 8, {
            speed: 100,
            color: '#ff0044',
            life: 0.3,
            size: 5,
            type: 'circle'
        });

        if (p.hp <= 0) {
            p.hp = 0;
            p.alive = false;
            // 死亡动画: 渐缩为 0
            if (_Animator && p.animator) {
                _Animator.setState(p.animator, 'death');
            }
        }
        return finalDmg;
    },

    /** 更新能量盾冷却 */
    updateEnergyShield(dt) {
        const p = this.player;
        if (!p || !p.energyShieldCD) return;
        if (!p.energyShieldReady) {
            p.energyShieldTimer -= dt;
            if (p.energyShieldTimer <= 0) {
                p.energyShieldTimer = 0;
                p.energyShieldReady = true;
                ParticleSystem.emit(p.x, p.y, 6, {
                    speed: 60, color: '#00ffff', life: 0.3, size: 5, type: 'circle'
                });
            }
        }
    },

    addXP(amount) {
        const p = this.player;
        p.xp += amount;
        if (p.xp >= p.xpToNext) {
            p.xp -= p.xpToNext;
            p.level++;
            p.xpToNext = StatsSystem.xpForLevel(p.level);
            // 升级时重新计算角色属性成长
            if (typeof CharacterSystem !== 'undefined' && CharacterSystem.recalcLevelStats) {
                CharacterSystem.recalcLevelStats(p);
            }
            if (typeof CombatLogSystem !== 'undefined') {
                CombatLogSystem.logLevelUp(p.level);
            }
            return true;
        }
        return false;
    },

    applyLevelUp(optionId) {
        const p = this.player;
        const option = StatsSystem.levelUpOptions.find(o => o.id === optionId);
        if (option) {
            option.apply(p);
            // 钳制所有属性到合法范围
            StatsSystem.clampPlayer(p);
            // 升级额外回复 10% 生命
            if (p.hp > 0) {
                p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.1));
            }
            // 升级音效
            if (typeof AudioSystem !== 'undefined') AudioSystem.play('levelup');
        }
    },

    heal(amount) {
        const p = this.player;
        if (!p || amount <= 0) return;
        const before = p.hp;
        p.hp = Math.min(p.maxHp, p.hp + amount);
        const healed = p.hp - before;
        if (healed > 0 && typeof CombatLogSystem !== 'undefined') {
            CombatLogSystem.addHeal(p.x, p.y, healed);
        }
    },

    reset() {
        this.player = null;
    }
};
