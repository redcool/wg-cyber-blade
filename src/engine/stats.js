// ============================================================
// stats.js — v3 新四层伤害公式 + 六类属性系统
// ============================================================

/** Weapon Tag → Flat Stat 映射表 */
const TAG_TO_FLAT_STAT = {
    melee:     'meleeDamage',
    ranged:    'rangedDamage',
    fire:      'elementalDamage',
    explosive: 'elementalDamage',
    crit:      null,
    tech:      'engineering',
    economy:   null,
};

const StatsSystem = {
    // -------------------------------------------------------
    // 1. 属性定义（六类 ~35 属性）
    // -------------------------------------------------------
    statDefs: {
        // --- 生存 (Survival) ---
        maxHp:          { category: 'survival', label: '最大生命', icon: '❤️', min: 1,   max: null, fmt: 'int',     desc: (v) => `最大生命 ${v}` },
        hpRegen:        { category: 'survival', label: '生命回复', icon: '💚', min: 0,   max: null, fmt: 'float1', desc: (v) => `每秒生命回复 +${v.toFixed(1)}` },
        lifeSteal:      { category: 'survival', label: '生命偷取', icon: '🩸', min: 0,   max: 0.5,  fmt: 'percent', desc: (v) => `生命偷取 +${Math.round(v * 100)}%（上限 50%）` },
        armor:          { category: 'survival', label: '护甲',     icon: '🛡️', min: 0,   max: null, fmt: 'int',     desc: (v) => `护甲 +${v}（减伤 ${Math.round(v / (v + 50) * 100)}%）` },
        dodge:          { category: 'survival', label: '闪避',     icon: '💨', min: 0,   max: 0.6,  fmt: 'percent', desc: (v) => `闪避率 +${Math.round(v * 100)}%（上限 60%）` },
        healingModifier:{ category: 'survival', label: '治疗加成', icon: '💚', min: 0,   max: null, fmt: 'percent', desc: (v) => `治疗加成 +${Math.round(v * 100)}%` },

        // --- 输出 (Offense) ---
        damagePercent:  { category: 'offense', label: '伤害加成',   icon: '🗡️', min: -0.99, max: null, fmt: 'percent', desc: (v) => `伤害 +${Math.round(v * 100)}%` },
        meleeDamage:    { category: 'offense', label: '近战伤害',   icon: '⚔️', min: 0,    max: null, fmt: 'int',     desc: (v) => `近战伤害 +${v}` },
        rangedDamage:   { category: 'offense', label: '远程伤害',   icon: '🏹', min: 0,    max: null, fmt: 'int',     desc: (v) => `远程伤害 +${v}` },
        elementalDamage:{ category: 'offense', label: '元素伤害',   icon: '🔮', min: 0,    max: null, fmt: 'int',     desc: (v) => `元素伤害 +${v}` },
        attackSpeed:    { category: 'offense', label: '攻击速度',   icon: '⚡', min: 0.2,  max: 5.0,  fmt: 'float2', desc: (v) => `攻击速度 +${Math.round(v * 100)}%` },
        attackRange:    { category: 'offense', label: '攻击范围',   icon: '🎯', min: 20,   max: 800,  fmt: 'int',     desc: (v) => `攻击范围 +${Math.round(v * 100)}%` },
        critChance:     { category: 'offense', label: '暴击率',     icon: '💥', min: 0,    max: 0.8,  fmt: 'percent', desc: (v) => `暴击率 +${Math.round(v * 100)}%（上限 80%）` },
        critDamage:     { category: 'offense', label: '暴击伤害',   icon: '🔥', min: 1.0,  max: null, fmt: 'float1', desc: (v) => `暴击伤害 ${v.toFixed(1)} 倍` },
        engineering:    { category: 'offense', label: '工程',       icon: '🤖', min: 0,    max: null, fmt: 'int',     desc: (v) => `工程 +${v}` },

        // --- 机动 (Mobility) ---
        speed:          { category: 'mobility', label: '移动速度', icon: '⚡', min: 50,  max: 400, fmt: 'int',     desc: (v) => `移动速度 +${Math.round(v * 100)}%` },
        knockback:      { category: 'mobility', label: '击退',     icon: '💨', min: 0,   max: null, fmt: 'int',     desc: (v) => `击退 +${v}` },

        // --- 经济 (Economy) ---
        luck:           { category: 'economy', label: '幸运',       icon: '🍀', min: 0,   max: 50,   fmt: 'int',     desc: (v) => `幸运 +${v}` },
        harvesting:     { category: 'economy', label: '收获加成',   icon: '💰', min: 0,   max: 500,  fmt: 'percent', desc: (v) => `材料收获 +${v}%` },
        xpGain:         { category: 'economy', label: '经验加成',   icon: '📈', min: 0,   max: null, fmt: 'percent', desc: (v) => `经验加成 +${Math.round(v * 100)}%` },
        materialGain:   { category: 'economy', label: '材料加成',   icon: '💎', min: 0,   max: null, fmt: 'percent', desc: (v) => `材料加成 +${Math.round(v * 100)}%` },

        // --- 特殊 (Special) ---
        explosionDamage:{ category: 'special', label: '爆炸伤害',   icon: '💥', min: 0,   max: null, fmt: 'percent', desc: (v) => `爆炸伤害 +${Math.round(v * 100)}%` },
        explosionSize:  { category: 'special', label: '爆炸范围',   icon: '💥', min: 0,   max: null, fmt: 'percent', desc: (v) => `爆炸范围 +${Math.round(v * 100)}%` },
        burningSpread:  { category: 'special', label: '燃烧传播',   icon: '🔥', min: 0,   max: null, fmt: 'int',     desc: (v) => `燃烧传播 +${v}` },
        turretDamage:   { category: 'special', label: '炮塔伤害',   icon: '🤖', min: 0,   max: null, fmt: 'percent', desc: (v) => `炮塔伤害 +${Math.round(v * 100)}%` },
        turretCount:    { category: 'special', label: '炮塔数量',   icon: '🤖', min: 0,   max: null, fmt: 'int',     desc: (v) => `炮塔数量 +${v}` },
        projectilePierce:{category: 'special', label: '穿透',       icon: '➡️', min: 0,   max: 10,   fmt: 'int',     desc: (v) => `穿透 +${v}` },

        // --- 限制 (Restriction) — 角色代价专用 ---
        weaponTypeLimit:{ category: 'restriction', label: '武器限制', icon: '🔒', min: 0, max: null, fmt: 'int', desc: (v) => `武器限制` },
        statLock:       { category: 'restriction', label: '属性锁定', icon: '🔒', min: 0, max: null, fmt: 'int', desc: (v) => `属性锁定` },

        // --- 旧字段兼容层（标记 _deprecated） ---
        damage:         { category: 'offense', label: '攻击力（旧）', icon: '🗡️', min: 1, max: null, fmt: 'percent', _deprecated: true, desc: (v) => `攻击力 +${Math.round(v * 100)}%` },
        critMultiplier: { category: 'offense', label: '暴伤（旧）',   icon: '🔥', min: 1.0, max: 6.0, fmt: 'float1', _deprecated: true, desc: (v) => `暴击伤害 ${v.toFixed(1)} 倍` },
        bulletCount:    { category: 'offense', label: '子弹数量（旧）', icon: '🔫', min: 1, max: 20, fmt: 'int', _deprecated: true, desc: (v) => `子弹 +${v}` },
        bulletPierce:   { category: 'special', label: '穿透（旧）',   icon: '➡️', min: 0, max: 10, fmt: 'int', _deprecated: true, desc: (v) => `穿透 +${v}` },
        bulletSpeed:    { category: 'offense', label: '弹速（旧）',   icon: '➡️', min: 100, max: 2000, fmt: 'int', _deprecated: true, desc: (v) => `弹道速度 +${Math.round(v * 100)}%` },
        pickupRange:    { category: 'mobility', label: '拾取范围（旧）', icon: '🧲', min: 10, max: 300, fmt: 'int', _deprecated: true, desc: (v) => `拾取范围 +${v}` },
    },

    // -------------------------------------------------------
    // 2. 四层伤害公式
    // -------------------------------------------------------

    /** 伤害公式类别顺序 */
    DAMAGE_LAYERS: ['B', 'F', 'P', 'C', 'S'],

    /**
     * 获取 Base 层伤害
     * B = weapon.baseDamage || (player._baseDamage × weapon.damageMult)
     * @param {Object} weapon
     * @param {Object} player
     * @returns {number}
     */
    _calcBaseDamage(weapon, player) {
        const baseAtk = player._baseDamage || 15;
        const mult = weapon.damageMult || 1.0;
        return baseAtk * mult;
    },

    /**
     * 获取 Flat 层伤害：按武器 Tag 选择对应 flat stat
     * @param {Object} weapon
     * @param {Object} player
     * @returns {number}
     */
    _calcFlatDamage(weapon, player) {
        const tag = weapon.tag || '';
        const flatStat = TAG_TO_FLAT_STAT[tag];
        if (!flatStat) return 0;
        return player[flatStat] || 0;
    },

    /**
     * 获取 Percent 层倍率
     * P = 1 + player.damagePercent
     *
     * 兼容旧字段: player.damage 是绝对基础伤害值（非百分比），不能用作 P 层。
     * 如果 damagePercent 未定义，返回 1.0（无百分比加成），
     * 基础伤害由 _calcBaseDamage 处理。
     * @param {Object} player
     * @returns {number}
     */
    _calcPercentMultiplier(player) {
        if (player.damagePercent !== undefined && player.damagePercent !== null) {
            return 1 + player.damagePercent;
        }
        // 旧字段 player.damage 是绝对值，不是百分比
        // P 层默认 1.0（无百分比加成）
        return 1.0;
    },

    /**
     * 获取 Crit 层倍率（单次暴击判定）
     * 直接设置 player._lastCrit
     * @param {Object} player
     * @returns {number}
     */
    _calcCritMultiplier(player) {
        const critChance = player.critChance || 0;
        const isCrit = Math.random() < critChance;
        player._lastCrit = isCrit;

        if (!isCrit) return 1.0;

        let cd = player.critDamage;
        if (cd === undefined || cd === null) {
            cd = player.critMultiplier || 2.0; // 兼容旧字段
        }
        return cd;
    },

    /**
     * 获取 Special 层倍率（Phase 1: 仅 berserkerBlood）
     * @param {Object} player
     * @param {Object} target
     * @returns {number}
     */
    _getSpecialModifier(player, target) {
        let S = 1.0;

        // berserkerBlood → lowHp 条件
        if (player.berserkerBlood && player.hp !== undefined && player.maxHp !== undefined) {
            if (player.hp < player.maxHp * 0.3) {
                S *= 1.30;
            }
        }

        // TODO Phase 2: 从 items.json / passives.json 加载 specialConditions
        // TODO Phase 2: 检查 target 状态 (burning/slowed/elite)

        return S;
    },

    /**
     * 计算单次打击的最终伤害（含实际暴击判定）
     * @param {Object} weapon - 武器数据对象
     * @param {Object} player - 玩家属性对象
     * @param {Object} target - 目标对象（敌人，含状态）
     * @returns {number} 最终伤害（整数）
     *
     * 算法: FinalDamage = round( (B + F) × P × C × S )
     */
    calcDamage(weapon, player, target) {
        const B = this._calcBaseDamage(weapon, player);
        const F = this._calcFlatDamage(weapon, player);
        const P = this._calcPercentMultiplier(player);

        // Crit 层含随机判定，_calcCritMultiplier 直接设置 player._lastCrit
        const C = this._calcCritMultiplier(player);

        const S = this._getSpecialModifier(player, target);

        const result = Math.round((B + F) * P * C * S);
        return result;
    },

    /**
     * 计算 DPS 期望（用于属性面板显示）
     * @param {Object} weapon - 武器数据
     * @param {Object} player - 玩家属性
     * @returns {number} - 期望每秒伤害
     *
     * 算法:
     * 1. avgDamage = (B+F) × P × (1 + critChance × (critDamage-1)) × S_default
     *    S_default = 1.0 (不应用条件倍率)
     * 2. attackSpeed = player.attackSpeed × weapon.attackSpeedMult
     * 3. dps = avgDamage × attackSpeed
     */
    calcDPS(weapon, player) {
        const B = this._calcBaseDamage(weapon, player);
        const F = this._calcFlatDamage(weapon, player);
        const P = this._calcPercentMultiplier(player);

        let cd = player.critDamage;
        if (cd === undefined || cd === null) {
            cd = player.critMultiplier || 2.0;
        }
        const critChance = player.critChance || 0;
        const C_exp = 1 + critChance * (cd - 1);

        // DPS 不应用 Special 层条件倍率
        const avgDamage = (B + F) * P * C_exp;

        const weaponSpeedMult = weapon.attackSpeedMult || 1.0;
        const atkSpeed = (player.attackSpeed || 1.0) * weaponSpeedMult;

        return avgDamage * atkSpeed;
    },

    /**
     * 计算护甲减伤
     * @param {number} armor
     * @returns {number} 减伤比例 (0~1)
     */
    armorDR(armor) {
        return armor / (armor + 50);
    },

    /**
     * 应用护甲后的实际承伤
     * @param {number} rawDamage
     * @param {number} armor
     * @returns {number}
     */
    calcDamageReduction(rawDamage, armor) {
        const dr = this.armorDR(armor);
        return Math.max(1, Math.floor(rawDamage * (1 - dr)));
    },

    // -------------------------------------------------------
    // 3. 属性工具
    // -------------------------------------------------------

    /**
     * 钳制单个属性值到合法范围
     * @param {string} statId
     * @param {number} value
     * @returns {number}
     */
    clampStat(statId, value) {
        const def = this.statDefs[statId];
        if (!def) return value;
        if (def.min !== null && def.min !== undefined) value = Math.max(def.min, value);
        if (def.max !== null && def.max !== undefined) value = Math.min(def.max, value);
        return value;
    },

    /**
     * 钳制玩家全部属性
     * @param {Object} player
     */
    clampPlayer(player) {
        if (!player) return;
        for (const statId of Object.keys(this.statDefs)) {
            if (player[statId] !== undefined) {
                player[statId] = this.clampStat(statId, player[statId]);
            }
        }
        if (player.hp !== undefined && player.maxHp !== undefined) {
            player.hp = Math.min(player.maxHp, Math.max(0, player.hp));
        }
    },

    /**
     * 按类别获取属性列表
     * @param {string} category - 'survival'|'offense'|'mobility'|'economy'|'special'|'restriction'
     * @returns {Object[]}
     */
    getStatsByCategory(category) {
        const result = [];
        for (const [id, def] of Object.entries(this.statDefs)) {
            if (def.category === category && !def._deprecated) {
                result.push({ id, ...def });
            }
        }
        return result;
    },

    /**
     * 格式化属性显示值
     * @param {string} statId
     * @param {number} value
     * @returns {string}
     */
    formatStat(statId, value) {
        const def = this.statDefs[statId];
        if (!def) return String(value);
        switch (def.fmt) {
            case 'int': return String(Math.round(value));
            case 'float1': return value.toFixed(1);
            case 'float2': return value.toFixed(2);
            case 'percent': return Math.round(value * 100) + '%';
            default: return String(value);
        }
    },

    /**
     * 获取属性上限提示
     * @param {string} statId
     * @param {number} value
     * @returns {string}
     */
    getCapInfo(statId, value) {
        const def = this.statDefs[statId];
        if (!def) return '';
        if (def.max === null || def.max === undefined) return '';
        const pct = Math.round((value / def.max) * 100);
        if (pct >= 90) return '⚠️ 接近上限';
        if (pct >= 70) return `已使用 ${pct}% 上限`;
        return '';
    },

    /**
     * 获取玩家显示用属性列表（结构化，供 UI 使用）
     * @param {Object} player
     * @returns {Object[]} - [{ id, category, icon, label, value, raw, extra, cap, note, pctToCap }, ...]
     *
     * 算法:
     * 1. 遍历 statDefs
     * 2. 只包含 player 上存在的属性（含兼容层旧字段）
     * 3. armor 额外计算减伤率
     * 4. 按 category 分组排序
     */
    getDisplayStats(player) {
        if (!player) return [];

        const categoryOrder = ['survival', 'offense', 'mobility', 'economy', 'special', 'restriction'];
        const result = [];

        for (const [id, def] of Object.entries(this.statDefs)) {
            // 跳过 deprecated 属性（但如果在 player 上存在值且非零，仍显示）
            const rawValue = player[id];
            if (rawValue === undefined || rawValue === null) continue;
            if (def._deprecated && rawValue === 0) continue; // 旧字段为 0 时隐藏

            const displayValue = this.formatStat(id, rawValue);
            const extra = this.getCapInfo(id, rawValue);
            let note = '';
            if (id === 'armor') {
                const dr = this.armorDR(rawValue);
                note = `减伤 ${Math.round(dr * 100)}%`;
            }

            result.push({
                id,
                category: def.category,
                icon: def.icon,
                label: def.label,
                value: displayValue,
                raw: rawValue,
                extra,
                note,
                cap: def.max,
                pctToCap: def.max ? Math.min(100, Math.round((rawValue / def.max) * 100)) : null,
            });
        }

        // 按 category 顺序排序
        result.sort((a, b) => {
            const ai = categoryOrder.indexOf(a.category);
            const bi = categoryOrder.indexOf(b.category);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });

        return result;
    },

    // -------------------------------------------------------
    // 4. 经验系统（不变）
    // -------------------------------------------------------

    xpForLevel(level) {
        if (level <= 1) return 20;
        if (level <= 5) return Math.floor(20 + (level - 1) * 15);
        if (level <= 10) return Math.floor(80 + (level - 5) * 30);
        if (level <= 20) return Math.floor(230 + (level - 10) * 60);
        return Math.floor(830 + (level - 20) * 120);
    },

    // -------------------------------------------------------
    // 5. 等级可选项（Phase 2 移到 levelUpCards.json）
    // -------------------------------------------------------
    levelUpOptions: [
        { id: 'maxHp',         name: '生命强化',    desc: '最大生命 +20%',   icon: '❤️',
          apply: (p) => { p.maxHp = Math.floor(p.maxHp * 1.20); } },
        { id: 'hpRegen',       name: '生命恢复',    desc: '回复 +0.5/秒',   icon: '💚',
          apply: (p) => { p.hpRegen += 0.5; } },
        { id: 'damage',        name: '攻击强化',    desc: '攻击力 +22%',    icon: '🗡️',
          apply: (p) => { p.damage = Math.floor(p.damage * 1.22); p.damagePercent = p.damage; } },
        { id: 'attackSpeed',   name: '攻速提升',    desc: '攻速 +18%',     icon: '⚡',
          apply: (p) => { p.attackSpeed = Math.min(5.0, p.attackSpeed * 1.18); } },
        { id: 'attackRange',   name: '射程提升',    desc: '射程 +15%',     icon: '🎯',
          apply: (p) => { p.attackRange = Math.min(800, p.attackRange * 1.15); } },
        { id: 'armor',         name: '护甲强化',    desc: '护甲 +3',       icon: '🛡️',
          apply: (p) => { p.armor = Math.min(100, p.armor + 3); } },
        { id: 'dodge',         name: '闪避强化',    desc: '闪避 +3%',      icon: '💨',
          apply: (p) => { p.dodge = Math.min(0.6, p.dodge + 0.03); } },
        { id: 'critChance',    name: '暴击强化',    desc: '暴击 +4%',      icon: '💥',
          apply: (p) => { p.critChance = Math.min(0.8, p.critChance + 0.04); } },
        { id: 'critMultiplier',name: '暴伤提升',    desc: '暴伤 +0.5x',    icon: '🔥',
          apply: (p) => { p.critMultiplier = Math.min(6.0, p.critMultiplier + 0.5); p.critDamage = p.critMultiplier; } },
        { id: 'speed',         name: '机动强化',    desc: '移速 +10%',     icon: '⚡',
          apply: (p) => { p.speed = Math.min(400, p.speed * 1.10); } },
        { id: 'bulletCount',   name: '多重射击',    desc: '子弹 +1',       icon: '🔫',
          apply: (p) => { p.bulletCount = Math.min(20, p.bulletCount + 1); } },
        { id: 'bulletPierce',  name: '穿透弹',      desc: '穿透 +1',       icon: '➡️',
          apply: (p) => { p.bulletPierce = Math.min(10, p.bulletPierce + 1); } },
        { id: 'lifeSteal',     name: '生命偷取',    desc: '偷取 +3%',      icon: '🩸',
          apply: (p) => { p.lifeSteal = Math.min(0.5, p.lifeSteal + 0.03); } },
        { id: 'bulletSpeed',   name: '弹速提升',    desc: '弹速 +15%',     icon: '➡️',
          apply: (p) => { p.bulletSpeed = Math.min(2000, p.bulletSpeed * 1.15); } },
        { id: 'harvesting',    name: '丰收',        desc: '收获 +20%',     icon: '💰',
          apply: (p) => { p.harvesting = Math.min(500, p.harvesting + 20); } },
        { id: 'pickupRange',   name: '引力场',      desc: '拾取范围 +20',  icon: '🧲',
          apply: (p) => { p.pickupRange = Math.min(300, p.pickupRange + 20); } },
        { id: 'luck',          name: '幸运提升',    desc: '幸运 +2',       icon: '🍀',
          apply: (p) => { p.luck = Math.min(50, p.luck + 2); } },
    ],
};

// CJS 导出（浏览器中 module 为 undefined，不生效；Node 中生效）
if (typeof module !== 'undefined') {
    module.exports = { StatsSystem, TAG_TO_FLAT_STAT };
}
