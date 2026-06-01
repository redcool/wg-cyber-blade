// ============================================================
// src/engine/effects.js — 共享效果引擎
// item.js 和 passives.js 共用此模块
// ============================================================

/**
 * EFFECT_HANDLERS — 效果处理器注册表
 *
 * 每个 handler 签名: (effect, player, context) => void
 *   effect  — { type, value, dps, duration, ... }
 *   player  — 玩家对象
 *   context — { target, attacker, damage, ... }
 *
 * 效果类型列表:
 *   heal, applyBurn, applySlow, duplicateBullet, explosion,
 *   reflectDamage, spreadBurn, damagePercentBoost, speedBoost,
 *   statMod, conditionalStatMod
 */
const EFFECT_HANDLERS = {
    /** 回复 HP: { value } - 不超出 maxHp */
    heal: (effect, player, context) => {
        const value = effect.value || 0;
        if (player && player.hp !== undefined && player.maxHp !== undefined) {
            player.hp = Math.min(player.maxHp, player.hp + value);
        }
    },

    /** 施加燃烧标记: { dps, duration, maxStacks } */
    applyBurn: (effect, player, context) => {
        if (!context || !context.target) return;
        const target = context.target;
        target._burnDps = (target._burnDps || 0) + (effect.dps || 0);
        target._burnDuration = effect.duration || 3.0;
        target._burnMaxStacks = effect.maxStacks || 3;
        target._burnTimer = target._burnDuration;
    },

    /** 施加减速标记: { amount, duration } */
    applySlow: (effect, player, context) => {
        if (!context || !context.target) return;
        const target = context.target;
        target._slowAmount = (target._slowAmount || 0) + (effect.amount || 0.5);
        target._slowDuration = effect.duration || 2.0;
        target._slowTimer = target._slowDuration;
    },

    /** 标记下颗子弹复制: { chance } — 由 bullet.js 读取标记 */
    duplicateBullet: (effect, player, context) => {
        if (player) {
            player._duplicateNext = true;
        }
    },

    /** 标记目标位置爆炸: { radius, damagePercent } — 由 combat 系统处理 AoE */
    explosion: (effect, player, context) => {
        if (!context || !context.target) return;
        context._explosion = {
            radius: effect.radius || 100,
            damagePercent: effect.damagePercent || 1.0,
            x: context.target.x,
            y: context.target.y,
        };
    },

    /** 反弹伤害给攻击者: { percent } — 优先使用 EnemySystem 以正确触发护甲/击杀处理 */
    reflectDamage: (effect, player, context) => {
        if (!context || !context.attacker) return;
        const pct = effect.percent || 0.3;
        const dmg = Math.floor((context.damage || 0) * pct);
        if (typeof EnemySystem !== 'undefined' && EnemySystem.takeDamage) {
            EnemySystem.takeDamage(context.attacker, dmg);
        } else if (context.attacker.hp !== undefined) {
            context.attacker.hp -= dmg;
        }
    },

    /** 标记燃烧传播: { range, layers } — 由 combat 系统处理 */
    spreadBurn: (effect, player, context) => {
        if (!context || !context.target) return;
        context._spreadBurn = {
            range: effect.range || 100,
            layers: effect.layers || 1,
            x: context.target.x,
            y: context.target.y,
        };
    },

    /** 临时伤害百分比加成: { value, duration } — 在 player._tempBuffs 标记 */
    damagePercentBoost: (effect, player, context) => {
        if (!player) return;
        if (!player._tempBuffs) player._tempBuffs = [];
        player._tempBuffs.push({
            stat: 'damagePercent',
            value: effect.value || 0,
            remaining: effect.duration || 999,
        });
    },

    /** 临时移速加成: { value, duration } */
    speedBoost: (effect, player, context) => {
        if (!player) return;
        if (!player._tempBuffs) player._tempBuffs = [];
        player._tempBuffs.push({
            stat: 'speed',
            value: effect.value || 0,
            remaining: effect.duration || 999,
        });
    },

    /** 永久 stat 修正 (Passive 类型): { statField: value, ... } */
    statMod: (effect, player, context) => {
        if (!player) return;
        for (const [stat, val] of Object.entries(effect)) {
            if (stat === 'type') continue;
            if (player[stat] !== undefined) {
                player[stat] += val;
            } else {
                player[stat] = val;
            }
        }
    },

    /** 条件 stat 修正: { stat, formula, contextKey } — 每帧或事件时重新计算 */
    conditionalStatMod: (effect, player, context) => {
        if (!player || !effect.formula) return;
        try {
            const ctx = { ...player, ...(context || {}) };
            // 构建安全的公式函数：将 ctx 属性作为局部变量注入
            const keys = Object.keys(ctx).filter(k => {
                const v = ctx[k];
                return typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean';
            });
            const varDefs = keys.map(k => `var ${k}=${JSON.stringify(ctx[k])};`).join('');
            const fn = new Function(varDefs + `return (${effect.formula});`);
            const value = fn();
            if (typeof value === 'number' && isFinite(value)) {
                player[effect.stat] = (player[effect.stat] || 0) + value;
            }
        } catch (e) {
            // 公式求值失败静默忽略
        }
    },
};

/**
 * EffectEngine — 共享效果执行引擎
 *
 * 用法:
 *   EffectEngine.execute({ type: 'heal', value: 30 }, player, context);
 */
const EffectEngine = {
    /**
     * 执行一个效果
     * @param {Object} effect - { type, ...params }
     * @param {Object} player
     * @param {Object} context
     */
    execute(effect, player, context) {
        if (!effect || !effect.type) return;
        const handler = EFFECT_HANDLERS[effect.type];
        if (handler) {
            handler(effect, player, context || {});
        }
    },
};

// CJS 导出
if (typeof module !== 'undefined') {
    module.exports = { EffectEngine, EFFECT_HANDLERS };
}
