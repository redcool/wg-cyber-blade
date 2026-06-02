// ============================================================
// formula.js — 伤害/冷却计算公式系统
// 所有公式集中存放, 便于调整平衡
// ============================================================

/** Weapon Tag → Flat Stat 映射表 */
const TAG_TO_FLAT_STAT = {
    melee:     'meleeDamage',
    gun:       'rangedDamage',
    bow:       'rangedDamage',
    magic:     'elementalDamage',
    medic:     null,
    lance:     'meleeDamage',
};

const FormulaSystem = {
    // -------------------------------------------------------
    // 设计模式开关
    //   'A' = 旧版: 武器 damageMult × 角色 _baseDamage
    //   'B' = 新版: 武器 per-level 基础 + 角色 flat stat
    // -------------------------------------------------------
    TYPE: 'B',

    setType(type) {
        this.TYPE = type;
    },

    /**
     * 获取武器指定等级的 Base Damage（来源于 CSV 的 damage_lv1~lv4 列）
     * 如果该武器最低等级 > 请求等级, 使用其最低可用等级的数值
     */
    getWeaponBaseDamage(weaponDef, level) {
        if (this.TYPE !== 'B') return 0; // TYPE A 不走此路径

        // 优先: 精确匹配 level
        for (let lv = level; lv >= 1; lv--) {
            const field = `damage_lv${lv}`;
            if (weaponDef[field] !== undefined && weaponDef[field] !== null && weaponDef[field] > 0) {
                return weaponDef[field];
            }
        }
        // 如果所有 lv 都为空, 尝试用 damageMult 回退 (兼容旧数据)
        return 0;
    },

    /**
     * 获取武器指定等级的 Base Cooldown（秒）
     */
    getWeaponBaseCooldown(weaponDef, level) {
        if (this.TYPE !== 'B') return 1.0;

        for (let lv = level; lv >= 1; lv--) {
            const field = `cooldown_lv${lv}`;
            if (weaponDef[field] !== undefined && weaponDef[field] !== null && weaponDef[field] > 0) {
                return weaponDef[field];
            }
        }
        return 1.0;
    },

    // -------------------------------------------------------
    // B 层: 基础伤害
    //   TYPE A: B = player._baseDamage × weapon.damageMult
    //   TYPE B: B = weaponBaseDamage(level) + flatStat
    // -------------------------------------------------------
    _calcBaseDamage(weaponDef, player, level) {
        level = level || 1;
        if (this.TYPE === 'B') {
            const weaponBase = this.getWeaponBaseDamage(weaponDef, level);
            const tag = weaponDef.tag || '';
            const flatStatId = TAG_TO_FLAT_STAT[tag];
            const flat = (flatStatId && player[flatStatId]) || 0;
            return weaponBase + flat;
        }
        // TYPE A — 旧版兼容
        const baseAtk = player._baseDamage || 15;
        const mult = weaponDef.damageMult || 1.0;
        return baseAtk * mult;
    },

    // -------------------------------------------------------
    // F 层: Flat stat (按 Tag 取对应角色属性)
    //   注意: TYPE B 中 F 层已合并进 B 层, 此函数仅用于 TYPE A
    // -------------------------------------------------------
    _calcFlatDamage(weaponDef, player) {
        if (this.TYPE === 'B') return 0; // B 层已包含 flat
        const tag = weaponDef.tag || '';
        const flatStat = TAG_TO_FLAT_STAT[tag];
        if (!flatStat) return 0;
        return player[flatStat] || 0;
    },

    // -------------------------------------------------------
    // P 层: 百分比倍率
    //   P = 1 + player.damagePercent
    // -------------------------------------------------------
    _calcPercentMultiplier(player) {
        if (player.damagePercent !== undefined && player.damagePercent !== null) {
            return 1 + player.damagePercent;
        }
        return 1.0;
    },

    // -------------------------------------------------------
    // C 层: 暴击倍率（单次随机判定）
    // -------------------------------------------------------
    _calcCritMultiplier(player, weaponParams) {
        const weaponCrit = weaponParams ? (weaponParams.critChanceAdd || 0) : 0;
        const critChance = Math.min(0.8, (player.critChance || 0) + weaponCrit);
        const isCrit = Math.random() < critChance;
        player._lastCrit = isCrit;

        if (!isCrit) return 1.0;

        // critDamage=0 视为未设置, 走默认 2.0
        let cd = player.critDamage;
        if (cd === undefined || cd === null || cd === 0) {
            cd = player.critMultiplier || 2.0;
        }
        // 武器独立暴击伤害加成
        if (weaponParams && weaponParams.critDamageAdd) {
            cd += weaponParams.critDamageAdd;
        }
        return cd;
    },

    // -------------------------------------------------------
    // S 层: 特殊倍率
    // -------------------------------------------------------
    _getSpecialModifier(player, target) {
        let S = 1.0;
        if (player.berserkerBlood && player.hp !== undefined && player.maxHp !== undefined) {
            if (player.hp < player.maxHp * 0.3) S *= 1.30;
        }
        return S;
    },

    // -------------------------------------------------------
    // 武器攻击冷却 (秒)
    //   TYPE A: cd = (1/p.attackSpeed) × atkSpeedMult
    //   TYPE B: cd = weaponBaseCooldown(level) / p.attackSpeed
    // -------------------------------------------------------
    calcWeaponCooldown(weaponDef, player, level) {
        level = level || 1;
        const atkSpd = player.attackSpeed || 1.0;
        if (this.TYPE === 'B') {
            const baseCD = this.getWeaponBaseCooldown(weaponDef, level);
            return baseCD / atkSpd;
        }
        // TYPE A
        const mult = weaponDef.attackSpeedMult || 1.0;
        return (1.0 / atkSpd) * Math.max(0.2, mult);
    },

    // -------------------------------------------------------
    // 完整伤害计算 (含暴击随机判定)
    //   params: 武器参数对象 (含 _weaponDef, _weaponLevel 等)
    // -------------------------------------------------------
    calcDamage(weaponDef, player, target, weaponParams) {
        // weaponDef 和 weaponParams 可能是同一个对象(当前 _fire* 调用方式)
        // 新设计: 从 weaponParams 中取 _weaponDef, _weaponLevel
        const rawDef = (weaponParams && weaponParams._weaponDef) ? weaponParams._weaponDef : weaponDef;
        const level = (weaponParams && weaponParams._weaponLevel) ? weaponParams._weaponLevel : 1;

        const B = this._calcBaseDamage(rawDef, player, level);
        const F = (this.TYPE === 'A') ? this._calcFlatDamage(rawDef, player) : 0;
        const P = this._calcPercentMultiplier(player);
        const C = this._calcCritMultiplier(player, weaponParams);
        const S = this._getSpecialModifier(player, target);

        const result = Math.round((B + F) * P * C * S);
        return result;
    },

    // -------------------------------------------------------
    // DPS 期望值（用于面板显示）
    // -------------------------------------------------------
    calcDPS(weaponDef, player, weaponParams) {
        const rawDef = (weaponParams && weaponParams._weaponDef) ? weaponParams._weaponDef : weaponDef;
        const level = (weaponParams && weaponParams._weaponLevel) ? weaponParams._weaponLevel : 1;

        const B = this._calcBaseDamage(rawDef, player, level);
        const F = (this.TYPE === 'A') ? this._calcFlatDamage(rawDef, player) : 0;
        const P = this._calcPercentMultiplier(player);

        const weaponCrit = weaponParams ? (weaponParams.critChanceAdd || 0) : 0;
        let cd = player.critDamage;
        if (cd === undefined || cd === null || cd === 0) {
            cd = player.critMultiplier || 2.0;
        }
        if (weaponParams && weaponParams.critDamageAdd) {
            cd += weaponParams.critDamageAdd;
        }
        const critChance = Math.min(0.8, (player.critChance || 0) + weaponCrit);
        const C_exp = 1 + critChance * (cd - 1);

        const avgDamage = (B + F) * P * C_exp;

        const cooldown = this.calcWeaponCooldown(rawDef, player, level);
        const atkSpeed = cooldown > 0 ? 1.0 / cooldown : 1.0;

        return avgDamage * atkSpeed;
    },

    // -------------------------------------------------------
    // 武器升级后属性预览（用于 Shop 面板）
    // -------------------------------------------------------
    calcWeaponPreview(weaponDef, player, currentLevel, targetLevel) {
        const currentDmg = this._calcBaseDamage(weaponDef, player, currentLevel);
        const newDmg = this._calcBaseDamage(weaponDef, player, targetLevel);
        const currentCD = this.calcWeaponCooldown(weaponDef, player, currentLevel);
        const newCD = this.calcWeaponCooldown(weaponDef, player, targetLevel);

        return {
            damage: { current: currentDmg, new: newDmg, change: newDmg - currentDmg },
            cooldown: { current: currentCD, new: newCD, change: newCD - currentCD },
        };
    },

    // -------------------------------------------------------
    // 四种伤害结果模拟（最小/非暴/暴击/最大）
    // -------------------------------------------------------
    calcDamageRange(weaponDef, player, target, weaponParams) {
        const rawDef = (weaponParams && weaponParams._weaponDef) ? weaponParams._weaponDef : weaponDef;
        const level = (weaponParams && weaponParams._weaponLevel) ? weaponParams._weaponLevel : 1;

        const B = this._calcBaseDamage(rawDef, player, level);
        const F = (this.TYPE === 'A') ? this._calcFlatDamage(rawDef, player) : 0;
        const P = this._calcPercentMultiplier(player);
        const S = this._getSpecialModifier(player, target);

        const weaponCrit = weaponParams ? (weaponParams.critChanceAdd || 0) : 0;
        let cd = player.critDamage;
        if (cd === undefined || cd === null || cd === 0) {
            cd = player.critMultiplier || 2.0;
        }
        if (weaponParams && weaponParams.critDamageAdd) {
            cd += weaponParams.critDamageAdd;
        }

        const base = (B + F) * P * S;
        const critDmg = Math.round(base * (cd || 1.0));

        return {
            min: Math.round(base),
            normal: Math.round(base),
            crit: critDmg,
            critChance: Math.min(0.8, (player.critChance || 0) + weaponCrit),
        };
    },
    // -------------------------------------------------------
    // 角色等级成长（characterLevel.csv 驱动）
    // -------------------------------------------------------

    /** characterLevel 缓存 */
    _levelTable: null,

    /** 可被等级成长的属性列表 */
    _GROWTH_FIELDS: [
        'maxHp', 'hpRegen', 'speed', 'attackSpeed', 'attackRange',
        'armor', 'dodge', 'critChance', 'critDamage',
        'lifeSteal', 'meleeDamage', 'rangedDamage',
        'elementalDamage', 'engineering', 'harvesting', 'luck',
        'xpGain', 'pickupRange',
    ],

    /** 整数字段（需要 Math.round） */
    _INT_FIELDS: new Set([
        'maxHp', 'speed', 'attackRange', 'armor', 'pickupRange',
        'meleeDamage', 'rangedDamage', 'elementalDamage', 'engineering',
    ]),

    /**
     * 加载等级成长表
     * @param {Object[]} rows - characterLevel.json 数据
     */
    loadLevelTable(rows) {
        this._levelTable = (rows || []).sort((a, b) => a.level - b.level);
    },

    /**
     * 获取指定等级的成长倍率（含随机偏移）
     * @param {number} level - 当前等级 (>=1)
     * @returns {{ growth: number, rawGrowth: number, offset: number, variance: number }}
     */
    getLevelGrowth(level) {
        const table = this._levelTable || [];
        const idx = Math.min(Math.max(level - 1, 0), table.length - 1);
        const row = table[idx] || { growth: 1.0, offset: 0 };
        const variance = row.offset > 0 ? (Math.random() - 0.5) * 2 * row.offset : 0;
        return {
            growth: +(row.growth + variance).toFixed(4),
            rawGrowth: row.growth,
            offset: row.offset,
            variance: +variance.toFixed(4),
        };
    },

    /**
     * 对玩家属性应用等级成长
     * 注意：会读取 player._baseCharStats 作为原始值
     *       如果不存在，则从 player 当前值创建快照（仅第一次）
     * @param {Object} player - 玩家对象（会被原地修改）
     * @param {number} level - 当前等级
     */
    applyLevelGrowth(player, level) {
        // 首次调用时创建基础值快照
        if (!player._baseCharStats) {
            player._baseCharStats = {};
            for (const key of this._GROWTH_FIELDS) {
                if (typeof player[key] === 'number') {
                    player._baseCharStats[key] = player[key];
                }
            }
        }

        const { growth } = this.getLevelGrowth(level);
        for (const key of this._GROWTH_FIELDS) {
            const base = player._baseCharStats[key];
            if (base === undefined) continue;
            const scaled = base * growth;
            player[key] = this._INT_FIELDS.has(key) ? Math.round(scaled) : +scaled.toFixed(2);
        }
        player.maxHp = Math.max(1, player.maxHp);

        // 同步当前 HP 比例（血量按比例缩放而非固定值）
        if (player._prevMaxHp && player.maxHp !== player._prevMaxHp) {
            const ratio = player.hp / player._prevMaxHp;
            player.hp = Math.round(player.maxHp * ratio);
            player.hp = Math.max(1, Math.min(player.hp, player.maxHp));
        }
        player._prevMaxHp = player.maxHp;
    },
};

// CJS 导出 + 全局注册（确保 Node/测试环境可用）
if (typeof module !== 'undefined') {
    globalThis.FormulaSystem = FormulaSystem;
    module.exports = { FormulaSystem, TAG_TO_FLAT_STAT };
}
