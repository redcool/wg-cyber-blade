// ============================================================
// stats.js — 属性系统 + statDefs 定义
// 伤害公式已移至 formula.js (FormulaSystem)
// 使用 FormulaSystem.TAG_TO_FLAT_STAT 获取武器-属性映射
// ============================================================
// 从 stats_charsData.json 加载中文显示字符串，运行时会被 DataLoader 数据覆盖
const _STAT_STR = {
    label_maxHp: '最大生命', label_hpRegen: '生命回复', label_lifeSteal: '生命偷取', label_armor: '护甲', label_dodge: '闪避',
    label_healingModifier: '治疗加成', label_damagePercent: '伤害加成', label_meleeDamage: '近战伤害', label_rangedDamage: '远程伤害',
    label_elementalDamage: '元素伤害', label_attackSpeed: '攻击速度', label_attackRange: '攻击范围', label_critChance: '暴击率',
    label_critDamage: '暴击伤害', label_engineering: '工程', label_speed: '移动速度', label_knockback: '击退', label_luck: '幸运',
    label_harvesting: '收获加成', label_xpGain: '经验加成', label_materialGain: '材料加成', label_explosionDamage: '爆炸伤害',
    label_explosionSize: '爆炸范围', label_burningSpread: '燃烧传播', label_turretDamage: '炮塔伤害', label_turretCount: '炮塔数量',
    label_projectilePierce: '穿透', label_weaponTypeLimit: '武器限制', label_statLock: '属性锁定',
    label_pickupRange: '拾取范围',
    desc_maxHp: '最大生命 {0}', desc_hpRegen: '每秒生命回复 +{0}', desc_lifeSteal: '生命偷取 +{0}%（上限 50%）',
    desc_armor: '护甲 +{0}（减伤 {1}%）', desc_dodge: '闪避率 +{0}%（上限 60%）', desc_healingModifier: '治疗加成 +{0}%',
    desc_damagePercent: '伤害 +{0}%', desc_meleeDamage: '近战伤害 +{0}', desc_rangedDamage: '远程伤害 +{0}',
    desc_elementalDamage: '元素伤害 +{0}', desc_attackSpeed: '攻击速度 +{0}%', desc_attackRange: '攻击范围 +{0}%',
    desc_critChance: '暴击率 +{0}%（上限 80%）', desc_critDamage: '暴击伤害 {0} 倍', desc_engineering: '工程 +{0}',
    desc_speed: '移动速度 +{0}%', desc_knockback: '击退 +{0}', desc_luck: '幸运 +{0}', desc_harvesting: '材料收获 +{0}%',
    desc_xpGain: '经验加成 +{0}%', desc_materialGain: '材料加成 +{0}%', desc_explosionDamage: '爆炸伤害 +{0}%',
    desc_explosionSize: '爆炸范围 +{0}%', desc_burningSpread: '燃烧传播 +{0}', desc_turretDamage: '炮塔伤害 +{0}%',
    desc_turretCount: '炮塔数量 +{0}', desc_projectilePierce: '穿透 +{0}', desc_weaponTypeLimit: '武器限制',
    desc_statLock: '属性锁定', desc_pickupRange: '拾取范围 +{0}',
    cap_near: '⚠️ 接近上限', cap_used: '已使用 {0}% 上限',
    armor_note: '减伤 {0}%',
    lvl_maxHp_name: '生命强化', lvl_maxHp_desc: '最大生命 +20%',
    lvl_hpRegen_name: '生命恢复', lvl_hpRegen_desc: '回复 +0.5/秒',
    lvl_damage_name: '攻击强化', lvl_damage_desc: '攻击力 +22%',
    lvl_attackSpeed_name: '攻速提升', lvl_attackSpeed_desc: '攻速 +18%',
    lvl_attackRange_name: '射程提升', lvl_attackRange_desc: '射程 +15%',
    lvl_armor_name: '护甲强化', lvl_armor_desc: '护甲 +3',
    lvl_dodge_name: '闪避强化', lvl_dodge_desc: '闪避 +3%',
    lvl_critChance_name: '暴击强化', lvl_critChance_desc: '暴击 +4%',
    lvl_critMultiplier_name: '暴伤提升', lvl_critMultiplier_desc: '暴伤 +0.5x',
    lvl_speed_name: '机动强化', lvl_speed_desc: '移速 +10%',
    lvl_bulletCount_name: '多重射击', lvl_bulletCount_desc: '子弹 +1',
    lvl_bulletPierce_name: '穿透弹', lvl_bulletPierce_desc: '穿透 +1',
    lvl_lifeSteal_name: '生命偷取', lvl_lifeSteal_desc: '偷取 +3%',
    lvl_bulletSpeed_name: '弹速提升', lvl_bulletSpeed_desc: '弹速 +15%',
    lvl_harvesting_name: '丰收', lvl_harvesting_desc: '收获 +20%',
    lvl_pickupRange_name: '引力场', lvl_pickupRange_desc: '拾取范围 +20',
    lvl_luck_name: '幸运提升', lvl_luck_desc: '幸运 +2',
};
if (typeof DataLoader !== 'undefined') {
    DataLoader.load('stats_charsData').then(d => { if (d) Object.assign(_STAT_STR, d); }).catch(() => {});
}

const StatsSystem = {
    // -------------------------------------------------------
    // 1. 属性定义（六类 ~35 属性）
    // -------------------------------------------------------
    statDefs: {
        // --- 生存 (Survival) ---
        maxHp:          { category: 'survival', label: _STAT_STR.label_maxHp, icon: '❤️', min: 1,   max: null, fmt: 'int',     desc: (v) => _STAT_STR.desc_maxHp.replace('{0}', v) },
        hpRegen:        { category: 'survival', label: _STAT_STR.label_hpRegen, icon: '💚', min: 0,   max: null, fmt: 'float1', desc: (v) => _STAT_STR.desc_hpRegen.replace('{0}', v.toFixed(1)) },
        lifeSteal:      { category: 'survival', label: _STAT_STR.label_lifeSteal, icon: '🩸', min: 0,   max: 0.5,  fmt: 'percent', desc: (v) => _STAT_STR.desc_lifeSteal.replace('{0}', Math.round(v * 100)) },
        armor:          { category: 'survival', label: _STAT_STR.label_armor, icon: '🛡️', min: 0,   max: null, fmt: 'int',     desc: (v) => _STAT_STR.desc_armor.replace('{0}', v).replace('{1}', Math.round(v / (v + 50) * 100)) },
        dodge:          { category: 'survival', label: _STAT_STR.label_dodge, icon: '💨', min: 0,   max: 0.6,  fmt: 'percent', desc: (v) => _STAT_STR.desc_dodge.replace('{0}', Math.round(v * 100)) },
        healingModifier:{ category: 'survival', label: _STAT_STR.label_healingModifier, icon: '💚', min: 0,   max: null, fmt: 'percent', desc: (v) => _STAT_STR.desc_healingModifier.replace('{0}', Math.round(v * 100)) },

        // --- 输出 (Offense) ---
        damagePercent:  { category: 'offense', label: _STAT_STR.label_damagePercent, icon: '🗡️', min: -0.99, max: null, fmt: 'percent', desc: (v) => _STAT_STR.desc_damagePercent.replace('{0}', Math.round(v * 100)) },
        meleeDamage:    { category: 'offense', label: _STAT_STR.label_meleeDamage, icon: '⚔️', min: 0,    max: null, fmt: 'int',     desc: (v) => _STAT_STR.desc_meleeDamage.replace('{0}', v) },
        rangedDamage:   { category: 'offense', label: _STAT_STR.label_rangedDamage, icon: '🏹', min: 0,    max: null, fmt: 'int',     desc: (v) => _STAT_STR.desc_rangedDamage.replace('{0}', v) },
        elementalDamage:{ category: 'offense', label: _STAT_STR.label_elementalDamage, icon: '🔮', min: 0,    max: null, fmt: 'int',     desc: (v) => _STAT_STR.desc_elementalDamage.replace('{0}', v) },
        attackSpeed:    { category: 'offense', label: _STAT_STR.label_attackSpeed, icon: '⚡', min: 0.2,  max: 5.0,  fmt: 'float2', desc: (v) => _STAT_STR.desc_attackSpeed.replace('{0}', Math.round(v * 100)) },
        attackRange:    { category: 'offense', label: _STAT_STR.label_attackRange, icon: '🎯', min: 0,    max: 500,  fmt: 'int',     desc: (v) => _STAT_STR.desc_attackRange.replace('{0}', v) },
        critChance:     { category: 'offense', label: _STAT_STR.label_critChance, icon: '💥', min: 0,    max: 0.8,  fmt: 'percent', desc: (v) => _STAT_STR.desc_critChance.replace('{0}', Math.round(v * 100)) },
        critDamage:     { category: 'offense', label: _STAT_STR.label_critDamage, icon: '🔥', min: 1.0,  max: null, fmt: 'float1', desc: (v) => _STAT_STR.desc_critDamage.replace('{0}', v.toFixed(1)) },
        engineering:    { category: 'offense', label: _STAT_STR.label_engineering, icon: '🤖', min: 0,    max: null, fmt: 'int',     desc: (v) => _STAT_STR.desc_engineering.replace('{0}', v) },

        // --- 机动 (Mobility) ---
        speed:          { category: 'mobility', label: _STAT_STR.label_speed, icon: '⚡', min: 50,  max: 800, fmt: 'int',     desc: (v) => _STAT_STR.desc_speed.replace('{0}', Math.round(v * 100)) },
        knockback:      { category: 'mobility', label: _STAT_STR.label_knockback, icon: '💨', min: 0,   max: null, fmt: 'int',     desc: (v) => _STAT_STR.desc_knockback.replace('{0}', v) },

        // --- 经济 (Economy) ---
        luck:           { category: 'economy', label: _STAT_STR.label_luck, icon: '🍀', min: 0,   max: 50,   fmt: 'int',     desc: (v) => _STAT_STR.desc_luck.replace('{0}', v) },
        harvesting:     { category: 'economy', label: _STAT_STR.label_harvesting, icon: '💰', min: 0,   max: 500,  fmt: 'percent', desc: (v) => _STAT_STR.desc_harvesting.replace('{0}', v) },
        xpGain:         { category: 'economy', label: _STAT_STR.label_xpGain, icon: '📈', min: 0,   max: null, fmt: 'percent', desc: (v) => _STAT_STR.desc_xpGain.replace('{0}', Math.round(v * 100)) },
        materialGain:   { category: 'economy', label: _STAT_STR.label_materialGain, icon: '💎', min: 0,   max: null, fmt: 'percent', desc: (v) => _STAT_STR.desc_materialGain.replace('{0}', Math.round(v * 100)) },

        // --- 特殊 (Special) ---
        explosionDamage:{ category: 'special', label: _STAT_STR.label_explosionDamage, icon: '💥', min: 0,   max: null, fmt: 'percent', desc: (v) => _STAT_STR.desc_explosionDamage.replace('{0}', Math.round(v * 100)) },
        explosionSize:  { category: 'special', label: _STAT_STR.label_explosionSize, icon: '💥', min: 0,   max: null, fmt: 'percent', desc: (v) => _STAT_STR.desc_explosionSize.replace('{0}', Math.round(v * 100)) },
        burningSpread:  { category: 'special', label: _STAT_STR.label_burningSpread, icon: '🔥', min: 0,   max: null, fmt: 'int',     desc: (v) => _STAT_STR.desc_burningSpread.replace('{0}', v) },
        turretDamage:   { category: 'special', label: _STAT_STR.label_turretDamage, icon: '🤖', min: 0,   max: null, fmt: 'percent', desc: (v) => _STAT_STR.desc_turretDamage.replace('{0}', Math.round(v * 100)) },
        turretCount:    { category: 'special', label: _STAT_STR.label_turretCount, icon: '🤖', min: 0,   max: null, fmt: 'int',     desc: (v) => _STAT_STR.desc_turretCount.replace('{0}', v) },
        projectilePierce:{category: 'special', label: _STAT_STR.label_projectilePierce, icon: '➡️', min: 0,   max: 10,   fmt: 'int',     desc: (v) => _STAT_STR.desc_projectilePierce.replace('{0}', v) },

        // --- 限制 (Restriction) — 角色代价专用 ---
        weaponTypeLimit:{ category: 'restriction', label: _STAT_STR.label_weaponTypeLimit, icon: '🔒', min: 0, max: null, fmt: 'int', desc: (v) => _STAT_STR.desc_weaponTypeLimit },
        statLock:       { category: 'restriction', label: _STAT_STR.label_statLock, icon: '🔒', min: 0, max: null, fmt: 'int', desc: (v) => _STAT_STR.desc_statLock },

        pickupRange:    { category: 'mobility', label: _STAT_STR.label_pickupRange, icon: '🧲', min: 10, max: 300, fmt: 'int', desc: (v) => _STAT_STR.desc_pickupRange.replace('{0}', v) },
    },

    // -------------------------------------------------------
    // 2. 伤害公式 → 委托给 FormulaSystem
    // -------------------------------------------------------

    /** 伤害公式类别顺序 */
    DAMAGE_LAYERS: ['B', 'F', 'P', 'C', 'S'],

    /**
     * @deprecated 请使用 FormulaSystem._calcBaseDamage
     */
    _calcBaseDamage(weapon, player) {
        return FormulaSystem._calcBaseDamage(weapon, player, 1);
    },

    /**
     * @deprecated 请使用 FormulaSystem._calcFlatDamage
     */
    _calcFlatDamage(weapon, player) {
        return FormulaSystem._calcFlatDamage(weapon, player);
    },

    /**
     * @deprecated 请使用 FormulaSystem._calcPercentMultiplier
     */
    _calcPercentMultiplier(player) {
        return FormulaSystem._calcPercentMultiplier(player);
    },

    /**
     * @deprecated 请使用 FormulaSystem._calcCritMultiplier
     */
    _calcCritMultiplier(player, weaponParams) {
        return FormulaSystem._calcCritMultiplier(player, weaponParams);
    },

    /**
     * @deprecated 请使用 FormulaSystem._getSpecialModifier
     */
    _getSpecialModifier(player, target) {
        return FormulaSystem._getSpecialModifier(player, target);
    },

    /**
     * 计算单次打击的最终伤害
     * 委托给 FormulaSystem.calcDamage
     */
    calcDamage(weapon, player, target, weaponParams) {
        return FormulaSystem.calcDamage(weapon, player, target, weaponParams);
    },

    /**
     * 计算 DPS 期望
     * 委托给 FormulaSystem.calcDPS
     */
    calcDPS(weapon, player, weaponParams) {
        return FormulaSystem.calcDPS(weapon, player, weaponParams);
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
        if (pct >= 90) return _STAT_STR.cap_near;
        if (pct >= 70) return _STAT_STR.cap_used.replace('{0}', pct);
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
                note = _STAT_STR.armor_note.replace('{0}', Math.round(dr * 100));
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
    // 4. 经验系统（characterLevel.csv xpRequired 驱动）
    // -------------------------------------------------------

    /** characterLevel 缓存（按 level 升序） */
    _xpTable: null,

    /**
     * 加载等级成长表并提取 xpRequired 为 _xpTable
     * @param {Object[]} rows - characterLevel.json 数据
     */
    loadXpTable(rows) {
        rows = (rows || []).sort((a, b) => a.level - b.level);
        this._xpTable = rows;
    },

    /** 从 table 获取累计 XP，level >=1 */
    _cumulativeFromTable(level) {
        if (!this._xpTable || this._xpTable.length === 0) return 0;
        const idx = Math.min(Math.max(level - 1, 0), this._xpTable.length - 1);
        return this._xpTable[idx].xpRequired || 0;
    },

    /**
     * 获取当前等级 → 下一级所需经验值
     * @param {number} level - 当前等级 (>=1)
     * @returns {number} 需要经验值
     */
    xpForLevel(level) {
        if (level < 1) level = 1;
        if (this._xpTable && this._xpTable.length > 0) {
            const next = this._cumulativeFromTable(level + 1);
            const curr = this._cumulativeFromTable(level);
            return Math.max(1, next - curr);
        }
        // 无表回退: 原始公式
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
        { id: 'maxHp',         name: _STAT_STR.lvl_maxHp_name, desc: _STAT_STR.lvl_maxHp_desc, icon: '❤️',
          apply: (p) => { p.maxHp = Math.floor(p.maxHp * 1.20); } },
        { id: 'hpRegen',       name: _STAT_STR.lvl_hpRegen_name, desc: _STAT_STR.lvl_hpRegen_desc, icon: '💚',
          apply: (p) => { p.hpRegen += 0.5; } },
        { id: 'damage',        name: _STAT_STR.lvl_damage_name, desc: _STAT_STR.lvl_damage_desc, icon: '🗡️',
          apply: (p) => { p.damage = Math.floor(p.damage * 1.22); p.damagePercent = p.damage; } },
        { id: 'attackSpeed',   name: _STAT_STR.lvl_attackSpeed_name, desc: _STAT_STR.lvl_attackSpeed_desc, icon: '⚡',
          apply: (p) => { p.attackSpeed = Math.min(5.0, p.attackSpeed * 1.18); } },
        { id: 'attackRange',   name: _STAT_STR.lvl_attackRange_name, desc: _STAT_STR.lvl_attackRange_desc, icon: '🎯',
          apply: (p) => { p.attackRange = Math.min(500, p.attackRange + 15); } },  // Brotato 加法: +15 像素/级
        { id: 'armor',         name: _STAT_STR.lvl_armor_name, desc: _STAT_STR.lvl_armor_desc, icon: '🛡️',
          apply: (p) => { p.armor = Math.min(100, p.armor + 3); } },
        { id: 'dodge',         name: _STAT_STR.lvl_dodge_name, desc: _STAT_STR.lvl_dodge_desc, icon: '💨',
          apply: (p) => { p.dodge = Math.min(0.6, p.dodge + 0.03); } },
        { id: 'critChance',    name: _STAT_STR.lvl_critChance_name, desc: _STAT_STR.lvl_critChance_desc, icon: '💥',
          apply: (p) => { p.critChance = Math.min(0.8, p.critChance + 0.04); } },
        { id: 'critMultiplier',name: _STAT_STR.lvl_critMultiplier_name, desc: _STAT_STR.lvl_critMultiplier_desc, icon: '🔥',
          apply: (p) => { p.critMultiplier = Math.min(6.0, p.critMultiplier + 0.5); p.critDamage = p.critMultiplier; } },
        { id: 'speed',         name: _STAT_STR.lvl_speed_name, desc: _STAT_STR.lvl_speed_desc, icon: '⚡',
          apply: (p) => { p.speed = Math.min(800, p.speed * 1.10); } },
        { id: 'bulletCount',   name: _STAT_STR.lvl_bulletCount_name, desc: _STAT_STR.lvl_bulletCount_desc, icon: '🔫',
          apply: (p) => { p.bulletCount = Math.min(20, p.bulletCount + 1); } },
        { id: 'bulletPierce',  name: _STAT_STR.lvl_bulletPierce_name, desc: _STAT_STR.lvl_bulletPierce_desc, icon: '➡️',
          apply: (p) => { p.bulletPierce = Math.min(10, p.bulletPierce + 1); } },
        { id: 'lifeSteal',     name: _STAT_STR.lvl_lifeSteal_name, desc: _STAT_STR.lvl_lifeSteal_desc, icon: '🩸',
          apply: (p) => { p.lifeSteal = Math.min(0.5, p.lifeSteal + 0.03); } },
        { id: 'bulletSpeed',   name: _STAT_STR.lvl_bulletSpeed_name, desc: _STAT_STR.lvl_bulletSpeed_desc, icon: '➡️',
          apply: (p) => { p.bulletSpeed = Math.min(2000, p.bulletSpeed * 1.15); } },
        { id: 'harvesting',    name: _STAT_STR.lvl_harvesting_name, desc: _STAT_STR.lvl_harvesting_desc, icon: '💰',
          apply: (p) => { p.harvesting = Math.min(500, p.harvesting + 20); } },
        { id: 'pickupRange',   name: _STAT_STR.lvl_pickupRange_name, desc: _STAT_STR.lvl_pickupRange_desc, icon: '🧲',
          apply: (p) => { p.pickupRange = Math.min(300, p.pickupRange + 20); } },
        { id: 'luck',          name: _STAT_STR.lvl_luck_name, desc: _STAT_STR.lvl_luck_desc, icon: '🍀',
          apply: (p) => { p.luck = Math.min(50, p.luck + 2); } },
    ],
};

// CJS 导出（浏览器中 module 为 undefined，不生效；Node 中生效）
if (typeof module !== 'undefined') {
    module.exports = { StatsSystem };
}
