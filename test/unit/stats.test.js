// ============================================================
// stats.test.js — StatsSystem v3 单元测试
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../../src/engine/formula.js'; // 必须先注册 FormulaSystem 全局
import { StatsSystem } from '../../src/engine/stats.js';

// --------------- fixtures ---------------
import { meleeWeapon, rangedWeapon } from '../fixtures/weapons.simple.js';
import { basePlayer } from '../fixtures/player.base.js';
import { baseTarget, burningTarget, eliteTarget } from '../fixtures/target.base.js';

// ============================================================
// 3.1 四层伤害公式 — 内部方法（无随机性）
// ============================================================
describe('StatsSystem - 四层伤害公式（内部方法）', () => {
    const player = { ...basePlayer };

    it('S1: _calcBaseDamage 纯 Base: 15', () => {
        const d = StatsSystem._calcBaseDamage(meleeWeapon, { ...player, _baseDamage: 15 });
        expect(d).toBe(15); // 15 × 1.0
    });

    it('S2: _calcBaseDamage 带 damageMult', () => {
        const d = StatsSystem._calcBaseDamage({ damageMult: 2.0 }, { ...player, _baseDamage: 15 });
        expect(d).toBe(30);
    });

    it('S3: _calcFlatDamage 按 Tag 映射 melee → meleeDamage', () => {
        const p = { ...player, meleeDamage: 10, rangedDamage: 5 };
        expect(StatsSystem._calcFlatDamage(meleeWeapon, p)).toBe(10);
    });

    it('S4: _calcFlatDamage 按 Tag 映射 ranged → rangedDamage', () => {
        const p = { ...player, meleeDamage: 10, rangedDamage: 5 };
        expect(StatsSystem._calcFlatDamage(rangedWeapon, p)).toBe(5);
    });

    it('S5: _calcFlatDamage Tag 无映射（如 economy）返回 0', () => {
        const p = { ...player, meleeDamage: 10 };
        expect(StatsSystem._calcFlatDamage({ tag: 'economy' }, p)).toBe(0);
    });

    it('S6: _calcPercentMultiplier 0% → 1.0', () => {
        expect(StatsSystem._calcPercentMultiplier({ damagePercent: 0 })).toBe(1.0);
    });

    it('S7: _calcPercentMultiplier 50% → 1.5', () => {
        expect(StatsSystem._calcPercentMultiplier({ damagePercent: 0.5 })).toBe(1.5);
    });

    it('S8: _calcPercentMultiplier 兼容旧字段 damage（非百分比，返回 1.0）', () => {
        // player.damage 是绝对值，不是百分比 → P 层默认 1.0
        expect(StatsSystem._calcPercentMultiplier({ damage: 0.5 })).toBe(1.0);
    });

    it('S9: _calcPercentMultiplier 优先使用 damagePercent', () => {
        expect(StatsSystem._calcPercentMultiplier({ damagePercent: 0.3, damage: 0.5 })).toBe(1.3);
    });

    it('S10: calcDPS 纯 Base 无加成', () => {
        const p = { ...player, attackSpeed: 1.0 };
        const dps = StatsSystem.calcDPS(meleeWeapon, p);
        // B=15, F=0, P=1, C_exp=1, avg=15, atkSpeed=1.0 → 15
        expect(dps).toBe(15);
    });

    it('S11: calcDPS 攻速加成', () => {
        const p = { ...player, attackSpeed: 1.5 };
        const dps = StatsSystem.calcDPS(meleeWeapon, p);
        // B=15, avg=15, atkSpeed=1.5 → 22.5
        expect(dps).toBe(22.5);
    });

    it('S12: calcDPS 暴击期望', () => {
        const p = { ...player, attackSpeed: 1.0, critChance: 0.5, critDamage: 2.0 };
        const dps = StatsSystem.calcDPS(meleeWeapon, p);
        // B=15, C_exp=1+0.5*(2-1)=1.5, avg=22.5, atkSpeed=1.0 → 22.5
        expect(dps).toBe(22.5);
    });

    it('S13: calcDPS 不应用 S 层条件倍率', () => {
        const p = { ...player, attackSpeed: 1.0, berserkerBlood: true, hp: 10, maxHp: 100 };
        const dps = StatsSystem.calcDPS(meleeWeapon, p);
        // S_default=1.0，不应有 1.3 倍
        expect(dps).toBe(15);
    });

    it('S14: calcDPS 兼容旧字段 critMultiplier', () => {
        const p = { ...player, attackSpeed: 1.0, critChance: 0.5 };
        delete p.critDamage;
        p.critMultiplier = 2.0;
        const dps = StatsSystem.calcDPS(meleeWeapon, p);
        expect(dps).toBe(22.5);
    });
});

// ============================================================
// 3.1b calcDamage 集成测试（Mock Math.random）
// ============================================================
describe('StatsSystem - calcDamage（Math.random mock）', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const p = { ...basePlayer };

    it('S15: calcDamage 无暴击（critChance=0）', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5); // 不应影响
        const p2 = { ...p, _baseDamage: 15, critChance: 0 };
        const dmg = StatsSystem.calcDamage(meleeWeapon, p2, baseTarget);
        // B=15, F=0, P=1, C=1(未暴击), S=1 → 15
        expect(dmg).toBe(15);
    });

    it('S16: calcDamage 必暴击（critChance=1.0）', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0); // 保证暴击
        const p2 = { ...p, _baseDamage: 15, critChance: 1.0, critDamage: 2.0 };
        const dmg = StatsSystem.calcDamage(meleeWeapon, p2, baseTarget);
        // B=15, F=0, P=1, C=2.0, S=1 → 30
        expect(dmg).toBe(30);
    });

    it('S17: calcDamage Base+Flat', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5); // 不暴击
        const p2 = { ...p, _baseDamage: 15, meleeDamage: 10, critChance: 0 };
        const dmg = StatsSystem.calcDamage(meleeWeapon, p2, baseTarget);
        // B=15, F=10, P=1, C=1, S=1 → 25
        expect(dmg).toBe(25);
    });

    it('S18: calcDamage Percent 层 50%', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const p2 = { ...p, _baseDamage: 15, damagePercent: 0.5, critChance: 0 };
        const dmg = StatsSystem.calcDamage(meleeWeapon, p2, baseTarget);
        // B=15, F=0, P=1.5, C=1, S=1 → round(22.5)=23
        expect(dmg).toBe(23);
    });

    it('S19: calcDamage 暴击+Percent', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0); // 暴击
        const p2 = { ...p, _baseDamage: 15, damagePercent: 0.5, critChance: 1.0, critDamage: 2.0 };
        const dmg = StatsSystem.calcDamage(meleeWeapon, p2, baseTarget);
        // B=15, F=0, P=1.5, C=2.0, S=1 → round(45)=45
        expect(dmg).toBe(45);
    });

    it('S20: calcDamage 四层全满', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0); // 暴击
        const p2 = { ...p, _baseDamage: 15, meleeDamage: 5, damagePercent: 0.5, critChance: 1.0, critDamage: 2.0, berserkerBlood: true, hp: 10, maxHp: 100 };
        const dmg = StatsSystem.calcDamage(meleeWeapon, p2, baseTarget);
        // B=15, F=5, P=1.5, C=2.0, S=1.3 → round(20×1.5×2.0×1.3)=round(78)=78
        expect(dmg).toBe(78);
    });

    it('S21: calcDamage 触发 _lastCrit', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.01); // 暴击
        const p2 = { ...p, critChance: 0.5, critDamage: 2.0 };
        StatsSystem.calcDamage(meleeWeapon, p2, baseTarget);
        expect(p2._lastCrit).toBe(true);
    });

    it('S22: calcDamage 兼容旧字段 damage（非百分比，P 层 1.0）', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const p2 = { _baseDamage: 15, damage: 0.5, critChance: 0 }; // 无 damagePercent
        const dmg = StatsSystem.calcDamage(meleeWeapon, p2, baseTarget);
        // B=15, F=0, P=1.0(damage非百分比), C=1, S=1 → 15
        expect(dmg).toBe(15);
    });

    it('S23: calcDamage 兼容旧字段 critMultiplier', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0); // 暴击
        const p2 = { ...p, _baseDamage: 15, critChance: 1.0 };
        delete p2.critDamage;
        p2.critMultiplier = 3.0;
        const dmg = StatsSystem.calcDamage(meleeWeapon, p2, baseTarget);
        // B=15, C=3.0 → 45
        expect(dmg).toBe(45);
    });

    it('S24: calcDamage berserkerBlood 低血量触发', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        // 测试 berserkerBlood 触发 vs 不触发
        const pTrigger = { ...p, _baseDamage: 15, critChance: 0, berserkerBlood: true, hp: 20, maxHp: 100 };
        const pNoTrigger = { ...p, _baseDamage: 15, critChance: 0, berserkerBlood: true, hp: 50, maxHp: 100 };
        const dmgTrigger = StatsSystem.calcDamage(meleeWeapon, pTrigger, baseTarget);
        const dmgNoTrigger = StatsSystem.calcDamage(meleeWeapon, pNoTrigger, baseTarget);
        // Trigger: S=1.3 → 15×1.3=19.5→20
        // No trigger: S=1.0 → 15
        expect(dmgTrigger).toBe(20);
        expect(dmgNoTrigger).toBe(15);
    });
});

// ============================================================
// 3.3 护甲/减伤
// ============================================================
describe('StatsSystem - 护甲/减伤', () => {
    it('S25: armorDR(0) = 0', () => {
        expect(StatsSystem.armorDR(0)).toBe(0);
    });

    it('S26: armorDR(50) = 0.5', () => {
        expect(StatsSystem.armorDR(50)).toBeCloseTo(0.5);
    });

    it('S27: armorDR(100) ≈ 0.6667', () => {
        expect(StatsSystem.armorDR(100)).toBeCloseTo(100 / 150);
    });

    it('S28: calcDamageReduction(100, 50) = 50', () => {
        expect(StatsSystem.calcDamageReduction(100, 50)).toBe(50);
    });

    it('S29: calcDamageReduction 最小 1', () => {
        expect(StatsSystem.calcDamageReduction(1, 0)).toBe(1);
    });
});

// ============================================================
// 3.4 属性分类与格式化
// ============================================================
describe('StatsSystem - 属性分类与格式化', () => {
    it('S30: getStatsByCategory("survival") 返回 6 属性', () => {
        const stats = StatsSystem.getStatsByCategory('survival');
        expect(stats).toHaveLength(6);
        const ids = stats.map(s => s.id);
        expect(ids).toContain('maxHp');
        expect(ids).toContain('hpRegen');
        expect(ids).toContain('armor');
    });

    it('S31: getStatsByCategory 不包含 deprecated 属性', () => {
        const stats = StatsSystem.getStatsByCategory('offense');
        const ids = stats.map(s => s.id);
        expect(ids).not.toContain('damage'); // 旧字段
        expect(ids).not.toContain('critMultiplier');
    });

    it('S32: getStatsByCategory("invalid") 返回空数组', () => {
        expect(StatsSystem.getStatsByCategory('invalid')).toEqual([]);
    });

    it('S33: formatStat int', () => {
        expect(StatsSystem.formatStat('maxHp', 100)).toBe('100');
    });

    it('S34: formatStat float1', () => {
        expect(StatsSystem.formatStat('hpRegen', 0.5)).toBe('0.5');
    });

    it('S35: formatStat float2', () => {
        expect(StatsSystem.formatStat('attackSpeed', 1.55)).toBe('1.55');
    });

    it('S36: formatStat percent', () => {
        expect(StatsSystem.formatStat('critChance', 0.25)).toBe('25%');
    });

    it('S37: formatStat 无定义返回原文', () => {
        expect(StatsSystem.formatStat('nonexistent', 10)).toBe('10');
    });
});

// ============================================================
// 3.5 属性钳制
// ============================================================
describe('StatsSystem - 属性钳制', () => {
    it('S38: clampStat dodge 超 max 钳为 0.6', () => {
        expect(StatsSystem.clampStat('dodge', 0.7)).toBe(0.6);
    });

    it('S39: clampStat attackSpeed 低于 min 钳为 0.2', () => {
        expect(StatsSystem.clampStat('attackSpeed', 0.1)).toBe(0.2);
    });

    it('S40: clampStat maxHp 在范围内不变', () => {
        expect(StatsSystem.clampStat('maxHp', 100)).toBe(100);
    });

    it('S41: clampStat armor 负数钳为 0', () => {
        expect(StatsSystem.clampStat('armor', -5)).toBe(0);
    });

    it('S42: clampPlayer HP 超上限', () => {
        const p = { hp: 200, maxHp: 100, dodge: 0.7, attackSpeed: 0.5 };
        StatsSystem.clampPlayer(p);
        expect(p.hp).toBe(100);
        expect(p.dodge).toBe(0.6);
    });
});

// ============================================================
// 3.6 getDisplayStats
// ============================================================
describe('StatsSystem - getDisplayStats', () => {
    it('S43: getDisplayStats(null) 返回 []', () => {
        expect(StatsSystem.getDisplayStats(null)).toEqual([]);
    });

    it('S44: getDisplayStats({}) 返回空列表（无属性匹配）', () => {
        const result = StatsSystem.getDisplayStats({});
        expect(result).toEqual([]);
    });

    it('S45: getDisplayStats 包含 armor 减伤率 note', () => {
        const p = { ...basePlayer, armor: 50 };
        const result = StatsSystem.getDisplayStats(p);
        const armorEntry = result.find(r => r.id === 'armor');
        expect(armorEntry).toBeDefined();
        expect(armorEntry.note).toContain('减伤');
    });

    it('S46: getDisplayStats 不显示 deprecated 零值字段', () => {
        const p = { ...basePlayer, maxHp: 100 };
        const result = StatsSystem.getDisplayStats(p);
        // basePlayer 中 damage=0, bulletPierce=0 → 应被隐藏
        // critMultiplier=2.0, bulletCount=1, bulletSpeed=500, pickupRange=60 → 非零，仍会显示
        const zeroDeprecated = result.filter(r =>
            (r.id === 'damage' || r.id === 'bulletPierce') && r.raw === 0
        );
        expect(zeroDeprecated).toHaveLength(0);
        // 非零 deprecated 字段仍然显示
        expect(result.find(r => r.id === 'critMultiplier')).toBeDefined();
    });

    it('S47: getDisplayStats deprecated 非零值仍显示', () => {
        const p = { ...basePlayer, maxHp: 100, damage: 0.5 };
        const result = StatsSystem.getDisplayStats(p);
        const dmgEntry = result.find(r => r.id === 'damage');
        expect(dmgEntry).toBeDefined();
    });

    it('S48: getDisplayStats 按 category 顺序排序', () => {
        const p = { ...basePlayer, maxHp: 100, speed: 200, damagePercent: 0.5, luck: 5, explosionDamage: 0.3 };
        const result = StatsSystem.getDisplayStats(p);
        const categories = result.map(r => r.category);
        // 应该是 survival, offense, mobility, economy, special, restriction 的顺序
        const survivalIdx = categories.indexOf('survival');
        const offenseIdx = categories.indexOf('offense');
        const mobilityIdx = categories.indexOf('mobility');
        expect(survivalIdx).toBeLessThan(offenseIdx);
        expect(offenseIdx).toBeLessThan(mobilityIdx);
    });
});

// ============================================================
// 3.7 经验系统（不变）
// ============================================================
describe('StatsSystem - 经验系统', () => {
    it('S49: xpForLevel(1) = 20', () => {
        expect(StatsSystem.xpForLevel(1)).toBe(20);
    });

    it('S50: xpForLevel(3) = 50', () => {
        expect(StatsSystem.xpForLevel(3)).toBe(50); // 20 + (3-1)*15
    });

    it('S51: xpForLevel(6) = 110', () => {
        expect(StatsSystem.xpForLevel(6)).toBe(110); // 80 + (6-5)*30
    });

    it('S52: xpForLevel(15) = 530', () => {
        expect(StatsSystem.xpForLevel(15)).toBe(530); // 230 + (15-10)*60
    });

    it('S53: xpForLevel(25) = 1430', () => {
        expect(StatsSystem.xpForLevel(25)).toBe(1430); // 830 + (25-20)*120
    });
});
