// ============================================================
// cyberblade/player.js - 玩家系统（多武器支持）
// ============================================================
const PlayerSystem = {
    player: null,

    create(startX, startY) {
        const p = {
            x: startX,
            y: startY,
            radius: 18,
            // 当前战斗属性（基础值，会被角色+武器修正）
            hp: 100,
            maxHp: 100,
            speed: 200,
            damage: 15,
            attackSpeed: 1.0,
            attackRange: 300,
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
        p._affixMods = {};
        p._lastClassBonuses = {};
        p._lastClassCounts = {};
        // 计算初始羁绊加成
        this._updateSynergies();
        this.player = p;
        return p;
    },

    /** BroTato-style Weapon Class 套装加成定义
     *  key = 武器类别, value = { stat: perWeaponBonus }
     *  每装备一件同类别武器, 该属性获得一次线性叠加
     */
    _CLASS_BONUSES: {
        'Blade':     { attackSpeed: 0.03 },           // +3% 攻速/件
        'Blunt':     { damagePercent: 0.05 },          // +5% 伤害/件
        'Precise':   { critChance: 0.03 },             // +3% 暴击率/件
        'Elemental': { elementalDamage: 5 },           // +5 元素伤害/件
        'Heavy':     { damagePercent: 0.05, speed: -0.02 }, // +5%伤害 -2%移速/件
        'Medical':   { hpRegen: 2 },                   // +2 HP回复/件
        'Support':   { attackRange: 0.03 },            // +3% 攻击范围/件
        'Primitive': { damagePercent: 0.02, attackSpeed: 0.02 }, // +2%伤害 +2%攻速/件
    },

    /** 统计玩家装备中各武器类别的数量
     *  @param {Object} player
     *  @returns {Object} { 'Blade': 2, 'Blunt': 1, ... }
     */
    _countWeaponClasses(player) {
        const counts = {};
        if (!player || !player.weapons) return counts;
        const weaponPool = (typeof ShopSystem !== 'undefined' ? ShopSystem.allWeapons : []) || [];
        for (const w of player.weapons) {
            const def = weaponPool.find(d => d.id === w.id);
            const cls = (def && def.class) || (player.weaponParams[w.id] && player.weaponParams[w.id].class) || 'Primitive';
            counts[cls] = (counts[cls] || 0) + 1;
        }
        return counts;
    },

    /** 计算武器类别套装加成总值
     *  @param {Object} classCounts - _countWeaponClasses 返回值
     *  @returns {Object} { stat: value, ... }
     */
    _computeClassBonuses(classCounts) {
        const bonuses = {};
        for (const [cls, count] of Object.entries(classCounts)) {
            const clsBonuses = this._CLASS_BONUSES[cls];
            if (!clsBonuses) continue;
            for (const [stat, perUnit] of Object.entries(clsBonuses)) {
                bonuses[stat] = (bonuses[stat] || 0) + perUnit * count;
            }
        }
        return bonuses;
    },

    /** 词条ID → 玩家属性映射 */
    _AFFIX_MAP: {
        damagePct: { stat: 'damage', op: 'mult' },
        attackSpeedPct: { stat: 'attackSpeed', op: 'mult' },
        critChancePct: { stat: 'critChance', op: 'add' },
        critMultiplierAdd: { stat: 'critMultiplier', op: 'add' },
        lifeStealPct: { stat: 'lifeSteal', op: 'add' },
        armor: { stat: 'armor', op: 'add' },
        hpRegenPct: { stat: 'hpRegen', op: 'add' },
        maxHp: { stat: 'maxHp', op: 'add' },
        attackRangePct: { stat: 'attackRange', op: 'mult' },
        bulletSpeedPct: { stat: 'bulletSpeed', op: 'mult' },
        bulletPierceAdd: { stat: 'bulletPierce', op: 'add' },
    },

    /** 计算所有武器词条加成总和 */
    _computeAffixBonuses(p) {
        const bonuses = {};
        for (const w of (p.weapons || [])) {
            for (const aff of (w.affixes || [])) {
                bonuses[aff.id] = (bonuses[aff.id] || 0) + aff.value;
            }
        }
        return bonuses;
    },

    /** 重新计算武器羁绊加成 */
    _updateSynergies() {
        const p = this.player;
        if (!p || !p.weapons) return;

        // 1) 反转之前应用的羁绊修正
        const prev = p._synergyMods || {};
        // 旧 ShopSystem keys
        if (prev.damageMult) p.damage /= (1 + prev.damageMult);
        if (prev.attackSpeedMult) p.attackSpeed /= (1 + prev.attackSpeedMult);
        if (prev.bulletSpeedMult) p.bulletSpeed /= (1 + prev.bulletSpeedMult);
        if (prev.bulletPierceAdd) p.bulletPierce = Math.max(0, p.bulletPierce - prev.bulletPierceAdd);
        if (prev.critChanceAdd) p.critChance = Math.max(0, p.critChance - prev.critChanceAdd);
        if (prev.lifeStealAdd) p.lifeSteal = Math.max(0, p.lifeSteal - prev.lifeStealAdd);
        if (prev.critMultiplierAdd) p.critMultiplier = Math.max(1, p.critMultiplier - prev.critMultiplierAdd);
        if (prev.hpRegenAdd) p.hpRegen = Math.max(0, p.hpRegen - prev.hpRegenAdd);
        if (prev.maxHpAdd) { p.maxHp -= prev.maxHpAdd; p.hp = Math.min(p.hp, p.maxHp); }
        if (prev.armorAdd) p.armor = Math.max(0, p.armor - prev.armorAdd);
        if (prev.bulletCountAdd) p.bulletCount = Math.max(1, (p.bulletCount || 1) - prev.bulletCountAdd);
        if (prev.splashRadiusAdd) delete p._splashRadiusBonus;
        if (prev.attackRangeMult) p.attackRange /= (1 + prev.attackRangeMult);
        // 新 TagSystem keys
        if (prev.damagePercent) p.damage /= (1 + prev.damagePercent);
        if (prev.attackRange) p.attackRange /= (1 + prev.attackRange);
        if (prev.bulletSpeed) p.bulletSpeed /= (1 + prev.bulletSpeed);
        if (prev.critChance) p.critChance = Math.max(0, p.critChance - prev.critChance);
        if (prev.critDamage) p.critMultiplier = Math.max(1, p.critMultiplier - prev.critDamage);
        if (prev.lifeSteal) p.lifeSteal = Math.max(0, p.lifeSteal - prev.lifeSteal);
        if (prev.bulletCount) p.bulletCount = Math.max(1, (p.bulletCount || 1) - prev.bulletCount);
        if (prev.armor) p.armor = Math.max(0, p.armor - prev.armor);

        // 2) 计算新的羁绊
        const synergies = TagSystem.getActiveSynergies(p.weapons);
        const newMods = {};
        for (const syn of synergies) {
            for (const [key, val] of Object.entries(syn.bonus)) {
                newMods[key] = (newMods[key] || 0) + val;
            }
        }

        // 3) 应用新的羁绊修正
        if (newMods.damageMult) p.damage *= (1 + newMods.damageMult);
        if (newMods.attackSpeedMult) p.attackSpeed *= (1 + newMods.attackSpeedMult);
        if (newMods.bulletSpeedMult) p.bulletSpeed *= (1 + newMods.bulletSpeedMult);
        if (newMods.bulletPierceAdd) p.bulletPierce += newMods.bulletPierceAdd;
        if (newMods.critChanceAdd) p.critChance = Math.min(0.9, p.critChance + newMods.critChanceAdd);
        if (newMods.lifeStealAdd) p.lifeSteal += newMods.lifeStealAdd;
        if (newMods.critMultiplierAdd) p.critMultiplier += newMods.critMultiplierAdd;
        if (newMods.hpRegenAdd) p.hpRegen += newMods.hpRegenAdd;
        if (newMods.maxHpAdd) { p.maxHp += newMods.maxHpAdd; p.hp = Math.min(p.hp + newMods.maxHpAdd, p.maxHp); }
        if (newMods.armorAdd) p.armor = StatsSystem.clampStat('armor', p.armor + newMods.armorAdd);
        if (newMods.bulletCountAdd) p.bulletCount = Math.min(20, (p.bulletCount || 1) + newMods.bulletCountAdd);
        if (newMods.splashRadiusAdd) p._splashRadiusBonus = (p._splashRadiusBonus || 0) + newMods.splashRadiusAdd;
        if (newMods.attackRangeMult) p.attackRange = StatsSystem.clampStat('attackRange', p.attackRange * (1 + newMods.attackRangeMult));
        // 新 TagSystem keys
        if (newMods.damagePercent) p.damage *= (1 + newMods.damagePercent);
        if (newMods.attackRange) p.attackRange = StatsSystem.clampStat('attackRange', p.attackRange * (1 + newMods.attackRange));
        if (newMods.bulletSpeed) p.bulletSpeed *= (1 + newMods.bulletSpeed);
        if (newMods.critChance) p.critChance = Math.min(0.9, p.critChance + newMods.critChance);
        if (newMods.critDamage) p.critMultiplier += newMods.critDamage;
        if (newMods.lifeSteal) p.lifeSteal += newMods.lifeSteal;
        if (newMods.bulletCount) p.bulletCount = Math.min(20, (p.bulletCount || 1) + newMods.bulletCount);
        if (newMods.armor) p.armor = StatsSystem.clampStat('armor', p.armor + newMods.armor);

        // 4) 存储当前羁绊状态
        p._synergyMods = newMods;
        p._activeSynergies = synergies;

        // 4.25) Weapon Class 套装加成 — 反转旧 + 计算新
        const prevClass = p._lastClassBonuses || {};
        if (prevClass.damagePercent) p.damage /= (1 + prevClass.damagePercent);
        if (prevClass.attackSpeed) p.attackSpeed /= (1 + prevClass.attackSpeed);
        if (prevClass.critChance) p.critChance = Math.max(0, p.critChance - prevClass.critChance);
        if (prevClass.speed) p.speed = Math.max(50, p.speed - prevClass.speed);
        if (prevClass.hpRegen) p.hpRegen = Math.max(0, p.hpRegen - prevClass.hpRegen);
        if (prevClass.attackRange) p.attackRange = StatsSystem.clampStat('attackRange', p.attackRange / (1 + prevClass.attackRange));
        if (prevClass.elementalDamage) p.elementalDamage = Math.max(0, p.elementalDamage - prevClass.elementalDamage);

        const classCounts = this._countWeaponClasses(p);
        const classBonuses = this._computeClassBonuses(classCounts);
        if (classBonuses.damagePercent) p.damage *= (1 + classBonuses.damagePercent);
        if (classBonuses.attackSpeed) p.attackSpeed *= (1 + classBonuses.attackSpeed);
        if (classBonuses.critChance) p.critChance = Math.min(0.8, p.critChance + classBonuses.critChance);
        if (classBonuses.speed) p.speed = Math.max(50, p.speed + classBonuses.speed);
        if (classBonuses.hpRegen) p.hpRegen += classBonuses.hpRegen;
        if (classBonuses.attackRange) p.attackRange = StatsSystem.clampStat('attackRange', p.attackRange * (1 + classBonuses.attackRange));
        if (classBonuses.elementalDamage) p.elementalDamage += classBonuses.elementalDamage;
        p._lastClassBonuses = classBonuses;
        p._lastClassCounts = classCounts;

        // 4.5) 反转之前的词条加成
        const prevAffix = p._affixMods || {};
        for (const [key, val] of Object.entries(prevAffix)) {
            const map = this._AFFIX_MAP[key];
            if (!map) continue;
            if (map.op === 'mult') {
                p[map.stat] /= (1 + val);
            } else if (map.op === 'add') {
                if (map.stat === 'maxHp') {
                    p.maxHp -= val;
                    p.hp = Math.min(p.hp, p.maxHp);
                } else {
                    p[map.stat] -= val;
                }
            }
        }

        // 5.5) 计算新的词条加成
        const newAffix = this._computeAffixBonuses(p);
        for (const [key, val] of Object.entries(newAffix)) {
            const map = this._AFFIX_MAP[key];
            if (!map) continue;
            if (map.op === 'mult') {
                p[map.stat] *= (1 + val);
            } else if (map.op === 'add') {
                if (map.stat === 'maxHp') {
                    p.maxHp += val;
                    p.hp = Math.min(p.hp + val, p.maxHp);
                } else {
                    p[map.stat] += val;
                }
            }
        }
        p._affixMods = newAffix;

        // 6) 钳制所有属性到合法范围
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
                const quality = w.quality || 'T1';
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
                    quality: quality,
                    healOnHit: def.healOnHit || 0,
                    auraHeal: def.auraHeal || 0,
                    auraRadius: def.auraRadius || 0,
                    burnDps: def.burnDps || 0,
                    burnMaxStacks: def.burnMaxStacks || 0,
                    meleeRange: def.meleeRange || 0,
                    critBounce: def.critBounce || 0,
                    attackRange: def.attackRange || 0,
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
                    _weaponQuality: quality,
                };
                p.weaponParams[w.id] = params;
                // 圣光盾光环参数写到玩家身上，供 update 使用
                if (params.behavior === 'shield_aura' && params.auraRadius > 0 && params.auraHeal > 0) {
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
    },

    /** 移动：WASD + 击退衰减 + 边界钳制 */
    _updateMovement(dt, p) {
        let dx = 0, dy = 0;
        if (Input.isDown('w') || Input.isDown('W') || Input.isDown('ArrowUp')) dy = -1;
        if (Input.isDown('s') || Input.isDown('S') || Input.isDown('ArrowDown')) dy = 1;
        if (Input.isDown('a') || Input.isDown('A') || Input.isDown('ArrowLeft')) dx = -1;
        if (Input.isDown('d') || Input.isDown('D') || Input.isDown('ArrowRight')) dx = 1;

        const isMoving = dx !== 0 || dy !== 0;
        p.isMoving = isMoving;
        if (isMoving) {
            p.facingAngle = Math.atan2(dy, dx);
            if (dx !== 0 && dy !== 0) {
                const len = Math.sqrt(dx * dx + dy * dy);
                dx /= len; dy /= len;
            }
        }
        p.x += dx * p.speed * dt;
        p.y += dy * p.speed * dt;

        // 击退
        p.x += p.knockbackX * dt;
        p.y += p.knockbackY * dt;
        p.knockbackX *= 0.9;
        p.knockbackY *= 0.9;

        // 边界钳制
        p.x = Math.max(30, Math.min(GameWorld.width - 30, p.x));
        p.y = Math.max(30, Math.min(GameWorld.height - 30, p.y));
        if (p.invincibleTimer > 0) p.invincibleTimer -= dt;
    },

    /** 自动攻击：每个武器独立冷却 + 独立搜索目标 */
    _updateAutoAttack(dt, p) {
        const enemiesArray = EnemySystem.enemies || [];
        const positions = this._getWeaponOrbitalPositions(p);
        for (let i = 0; i < p.weapons.length; i++) {
            const w = p.weapons[i];
            const params = p.weaponParams[w.id];
            if (!params) continue;

            if (w.cooldownTimer == null) w.cooldownTimer = 0;
            w.cooldownTimer -= dt;
            if (w.cooldownTimer > 0) continue;

            const isMelee = params.behavior === 'melee' || params.behavior === 'melee_sweep' || params.behavior === 'melee_thrust';
            // Range 系统: attackRange stat 作为全武器射程乘数 (300 = 1.0x)
            const rangeMult = (p.attackRange || 300) / 300;
            const range = isMelee 
                ? (params.meleeRange || 60) * rangeMult
                : (params.attackRange || p.attackRange) * rangeMult;

            // 找范围内最近敌人
            let nearest = null;
            let nearDist = Infinity;
            for (const e of enemiesArray) {
                if (!e.alive) continue;
                const dx2 = e.x - p.x, dy2 = e.y - p.y;
                const dist = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                if (dist < range && dist < nearDist) {
                    nearDist = dist;
                    nearest = e;
                }
            }

            // 无敌人时自动攻击医药箱
            if (!nearest && typeof MedkitSystem !== 'undefined' && MedkitSystem.crates.length > 0) {
                for (const crate of MedkitSystem.crates) {
                    if (!crate.alive) continue;
                    const dx2 = crate.x - p.x, dy2 = crate.y - p.y;
                    const dist = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                    const crateRange = isMelee ? (range + (crate.radius || 18)) : range;
                    if (dist < crateRange && dist < nearDist) {
                        nearDist = dist;
                        nearest = crate;
                    }
                }
            }

            if (nearest) {
                const targetAngle = Math.atan2(nearest.y - p.y, nearest.x - p.x);
                p.facingAngle = targetAngle;
                p._attackTargetAngle = targetAngle;
                p.spriteAttackEndTime = Date.now() + 480;

                // 冷却公式: 委托给 FormulaSystem (Design B = baseCooldown(lv) / p.attackSpeed)
                const rawDef = params._weaponDef;
                const weaponLv = params._weaponLevel || w.level || 1;
                let cd = FormulaSystem.calcWeaponCooldown(rawDef, p, weaponLv);
                if (p.berserkerBlood && p.hp < p.maxHp * 0.3) cd *= 0.667;

                // 弹匣/换弹机制
                const magSize = rawDef.magSize || 0;
                if (magSize > 0) {
                    if (w.shotsFired == null) w.shotsFired = 0;
                    w.cooldownTimer = cd; // 先设置正常 CD
                    const wPos = positions[i] || { x: p.x, y: p.y };
                    this._fireWeapon(w.id, params, nearest, wPos, nearDist);
                    w.shotsFired++;
                    if (w.shotsFired >= magSize) {
                        w.cooldownTimer = rawDef.reloadTime || 1.0; // 换弹冷却
                        w.shotsFired = 0;
                    }
                } else {
                    // 无弹匣武器: 保持原有行为
                    w.cooldownTimer = cd;
                    const wPos = positions[i] || { x: p.x, y: p.y };
                    this._fireWeapon(w.id, params, nearest, wPos, nearDist);
                }
            }
        }
    },

    /** 延迟攻击：突刺冲刺 + 横扫蓄力（150ms瞄准延迟） */
    _updateDelayedAttacks(dt, p) {
        // 突刺延迟冲刺
        if (p._thrustDashTimer != null) {
            p._thrustDashTimer -= dt;
            if (p._thrustDashTimer <= 0) {
                p.knockbackX += p._thrustDashX || 0;
                p.knockbackY += p._thrustDashY || 0;
                p._thrustDashX = 0;
                p._thrustDashY = 0;
                p._thrustDashTimer = null;
            }
        }
        // 横扫延迟攻击
        if (p._sweepPending && p._sweepPending.timer != null) {
            p._sweepPending.timer -= dt;
            if (p._sweepPending.timer <= 0) {
                this._executeMeleeSweep(p, p._sweepPending);
                p._sweepPending = null;
            }
        }
        // 武器攻击动画计时器
        if (p.weaponParams) {
            for (const key of Object.keys(p.weaponParams)) {
                const wp = p.weaponParams[key];
                if (wp._attackAnimTimer && wp._attackAnimTimer > 0) {
                    wp._attackAnimTimer -= dt;
                }
            }
        }

        // 清理过期的攻击动画
        if (p.weaponAnimations) {
            const now = Date.now();
            p.weaponAnimations = p.weaponAnimations.filter(a => (now - a.startTime) < a.duration);
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
     * 计算各武器的轨道位置（与渲染器逻辑保持一致）
     */
    _getWeaponOrbitalPositions(player) {
        const x = player.x, y = player.y, r = player.radius;
        const weapons = player.weapons || [];
        const count = Math.min(weapons.length, 6);
        if (count === 0) return [];
        const positions = [];
        for (let i = 0; i < count; i++) {
            const w = weapons[i];
            const weaponDef = ShopSystem.allWeapons.find(d => d.id === w.id);
            // 360° 均匀分布，从上方开始
            const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
            const slots = weaponDef ? (weaponDef.slots || 1) : 1;
            const dist = r + 8 + slots * 5;
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

        // 近战武器：根据目标距离动态选择横扫(近)或突刺(远)
        // 骑枪/长枪专属：始终使用突刺（不切换为横扫）
        let actualBehavior = params.behavior;
        if (actualBehavior === 'melee' || actualBehavior === 'melee_sweep' || actualBehavior === 'melee_thrust') {
            const weaponDef = ShopSystem.allWeapons.find(d => d.id === weaponId);
            if (weaponDef && weaponDef.tag === 'lance') {
                actualBehavior = 'melee_thrust';
            } else {
                const meleeRange = params.meleeRange || 60;
                actualBehavior = (targetDist < meleeRange * 0.45) ? 'melee_sweep' : 'melee_thrust';
            }
        }

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

        // 近战：用 player→target 角度（扫/刺以玩家为中心）
        // 远程：用 weaponPos→target 精确角度（子弹对准目标）
        const attackAngle = isMeleeAttack ? angle : fireAngle;

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
        // 开火音效：按武器行为类型分发最合适的音效
        if (typeof AudioSystem !== 'undefined') {
            const soundMap = {
                'melee_sweep': 'melee_slash',
                'melee_thrust': 'melee_heavy',
                'explode':     'explosion',
                'spread':      'heavy_gun',
                'laser':       'laser',
                'shock':       'lightning',
                'frost':       'ice',
                'homing':      'magic',
                'spray':       'fire',
                'heal_bullet': 'pistol',
                'shield_aura': 'pistol',
                'bullet':     'pistol'
            };
            AudioSystem.play(soundMap[actualBehavior] || 'pistol');
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
        const range = params.meleeRange || 120;
        const pierceCount = params.pierce || 3;
        const halfWidth = 15; // 窄宽度 ~30px
        let hits = 0;

        // 先瞄准目标（150ms），再冲刺
        // 骑枪/长枪：武器够长，无需冲刺；非骑枪近战需要冲刺贴脸
        const isLance = weaponDef && weaponDef.tag === 'lance';
        if (!isLance) {
            p.knockbackX = 0;
            p.knockbackY = 0;
            const dashStr = range * 4;
            p._thrustDashX = Math.cos(angle) * dashStr;
            p._thrustDashY = Math.sin(angle) * dashStr;
            p._thrustDashTimer = 0.15;
        }

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

            // 击退（使用武器自身击退值, 默认骑枪600/其他400）
            const kbStr = params.knockback > 0 ? params.knockback : (isLance ? 600 : 400);
            e.knockbackX += dx / dist * kbStr;
            e.knockbackY += dy / dist * kbStr;

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
        const dmg = StatsSystem.calcDamage(weaponDef, p, target, params);
        const totalPierce = (params.pierce || 0) + (p.bulletPierce || 0);
        const bulletRange = params.bulletMaxRange > 0 ? params.bulletMaxRange : (params.attackRange || p.attackRange || 300);
        const splashR = params.splashRadius || 0;
        const startAngle = angle - params.spread * (params.bulletCount - 1) / 2;
        for (let i = 0; i < params.bulletCount; i++) {
            const a = startAngle + params.spread * i;
            BulletSystem.create(
                spawnX, spawnY,
                a, dmg, params.bulletSpeed, totalPierce, true, weaponId,
                { slowAmount: 0.5, slowDuration: 2.0, splashRadius: splashR, range: bulletRange }
            );
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
        const dmg = Math.round(StatsSystem.calcDamage(weaponDef, p, target, params) * dmgMult);
        const totalPierce = (params.pierce || 0) + pierceAdd + (p.bulletPierce || 0);
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
            };
            BulletSystem.create(
                spawnX, spawnY,
                a, dmg, params.bulletSpeed || 300, totalPierce, true, weaponId, extra
            );
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

    /** 近战横扫 - 扇面攻击 */
    _fireMeleeSweep(angle, params, target, weaponId, weaponPos, weaponDef) {
        const p = this.player;
        const dmg = StatsSystem.calcDamage(weaponDef, p, target, params);
        const meleeRange = params.meleeRange || (weaponDef ? weaponDef.meleeRange : 60) || 60;
        // 延迟执行，配合动画
        p._sweepPending = {
            damage: dmg,
            range: meleeRange,
            angle: angle,
            weaponId: weaponId,
            params: params,
            timer: 0.15
        };
        // 起手粒子特效
        const sx = weaponPos ? weaponPos.x : p.x + Math.cos(angle) * 20;
        const sy = weaponPos ? weaponPos.y : p.y + Math.sin(angle) * 20;
        ParticleSystem.emit(sx, sy, 6, { speed: 60, color: '#88ccff', life: 0.2, size: 3, type: 'spark' });
    },

    /** 近战突刺 - 直线穿透 */
    _fireMeleeThrust(angle, params, target, weaponId, weaponPos, weaponDef) {
        const p = this.player;
        const dmg = StatsSystem.calcDamage(weaponDef, p, target, params);
        const meleeRange = params.meleeRange || (weaponDef ? weaponDef.meleeRange : 60) || 60;
        const pierceCount = params.pierce || (weaponDef ? weaponDef.pierce : 0) || 3;
        const halfWidth = 15;
        let hits = 0;

        // 非骑枪冲刺贴脸
        const isLance = weaponDef && weaponDef.tag === 'lance';
        if (!isLance) {
            p.knockbackX = 0; p.knockbackY = 0;
            const dashStr = meleeRange * 4;
            p._thrustDashX = Math.cos(angle) * dashStr;
            p._thrustDashY = Math.sin(angle) * dashStr;
            p._thrustDashTimer = 0.15;
        }

        // 按距离排序
        const enemiesInRange = EnemySystem.enemies.filter(e => e.alive);
        enemiesInRange.sort((a, b) => {
            const da = (a.x - p.x) ** 2 + (a.y - p.y) ** 2;
            const db = (b.x - p.x) ** 2 + (b.y - p.y) ** 2;
            return da - db;
        });

        for (const e of enemiesInRange) {
            if (hits >= pierceCount) break;
            const dx = e.x - p.x, dy = e.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > meleeRange) continue;

            const enemyAngle = Math.atan2(dy, dx);
            let diff = enemyAngle - angle;
            if (diff > Math.PI) diff -= Math.PI * 2;
            if (diff < -Math.PI) diff += Math.PI * 2;
            const perpendicularDist = Math.abs(Math.sin(diff) * dist);
            if (perpendicularDist > halfWidth && Math.abs(diff) > 0.25) continue;

            hits++;
            if (typeof CombatLogSystem !== 'undefined') {
                if (p._lastCrit) { CombatLogSystem.addCritDamage(e.x, e.y, dmg); CombatLogSystem.logCrit(dmg); }
                else { CombatLogSystem.addDamage(e.x, e.y, dmg); }
            }
            const result = EnemySystem.takeDamage(e, dmg);

            const kbStr = params.knockback > 0 ? params.knockback : (isLance ? 600 : 400);
            e.knockbackX += dx / dist * kbStr;
            e.knockbackY += dy / dist * kbStr;

            if (params.burnDps > 0 && e.alive) {
                this._applyBurn(e, params.burnDps, 3.0, params.burnMaxStacks || 3);
            }

            const hitColor = isLance ? '#ff88ff' : '#00ccff';
            ParticleSystem.emit(e.x, e.y, 5, { speed: 80, color: hitColor, life: 0.2, size: 4, type: 'spark' });
            ParticleSystem.emit(e.x, e.y, 3, { speed: 50, color: '#ffffff', life: 0.15, size: 6, type: 'glow' });

            if (result === -1 && typeof GameEngine !== 'undefined') {
                GameEngine._handleEnemyKill(e, dmg);
            }
        }

        // 突刺起手特效
        const sx = weaponPos ? weaponPos.x : p.x + Math.cos(angle) * 25;
        const sy = weaponPos ? weaponPos.y : p.y + Math.sin(angle) * 25;
        ParticleSystem.emit(sx, sy, 5, { speed: 100, color: '#ff88ff', life: 0.2, size: 4, type: 'spark' });
    },

    /** 延迟横扫执行（由 _fireMeleeSweep 触发） */
    _executeMeleeSweep(player, sweepPending) {
        if (!sweepPending) return;
        const dmg = sweepPending.damage || 10;
        const meleeRange = sweepPending.range || 60;
        const angle = sweepPending.angle || 0;
        const spreadAngle = Math.PI;
        const weaponId = sweepPending.weaponId || 'sword';
        let hits = 0;

        const enemiesInRange = EnemySystem.enemies.filter(e => e.alive);
        for (const e of enemiesInRange) {
            const dx = e.x - player.x, dy = e.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > meleeRange) continue;

            const enemyAngle = Math.atan2(dy, dx);
            let diff = enemyAngle - angle;
            if (diff > Math.PI) diff -= Math.PI * 2;
            if (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) > spreadAngle / 2) continue;

            hits++;
            if (typeof CombatLogSystem !== 'undefined') {
                CombatLogSystem.addDamage(e.x, e.y, dmg);
            }
            const result = EnemySystem.takeDamage(e, dmg);

            const sweepKb = sweepPending.params && sweepPending.params.knockback > 0 ? sweepPending.params.knockback : 350;
            e.knockbackX += dx / dist * sweepKb;
            e.knockbackY += dy / dist * sweepKb;

            ParticleSystem.emit(e.x, e.y, 4, { speed: 60, color: '#88ccff', life: 0.2, size: 3, type: 'spark' });
            ParticleSystem.emit(e.x, e.y, 2, { speed: 40, color: '#ffffff', life: 0.15, size: 5, type: 'glow' });

            if (result === -1 && typeof GameEngine !== 'undefined') {
                GameEngine._handleEnemyKill(e, dmg);
            }
        }

        // 横扫大弧面特效
        const step = spreadAngle / 10;
        for (let i = 0; i <= 10; i++) {
            const a = angle - spreadAngle / 2 + step * i;
            ParticleSystem.emit(
                player.x + Math.cos(a) * meleeRange * 0.6,
                player.y + Math.sin(a) * meleeRange * 0.6,
                2, { speed: 40, color: '#88ccff', life: 0.3, size: 3, type: 'spark' }
            );
        }
        ParticleSystem.emit(player.x, player.y, 8, { speed: 80, color: '#88ccff', life: 0.4, size: 5, type: 'spark' });
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
