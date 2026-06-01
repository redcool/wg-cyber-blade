// ============================================================
// effects.test.js — EffectEngine 单元测试
// ============================================================
import { describe, it, expect, vi } from 'vitest';
import { EffectEngine, EFFECT_HANDLERS } from '../../src/engine/effects.js';

describe('EffectEngine - heal', () => {
    it('E1: 回复 HP', () => {
        const p = { hp: 50, maxHp: 100 };
        EffectEngine.execute({ type: 'heal', value: 30 }, p, {});
        expect(p.hp).toBe(80);
    });

    it('E2: 不超过 maxHp', () => {
        const p = { hp: 90, maxHp: 100 };
        EffectEngine.execute({ type: 'heal', value: 30 }, p, {});
        expect(p.hp).toBe(100);
    });

    it('E3: 负值等于伤害', () => {
        const p = { hp: 50, maxHp: 100 };
        EffectEngine.execute({ type: 'heal', value: -20 }, p, {});
        expect(p.hp).toBe(30);
    });
});

describe('EffectEngine - reflectDamage', () => {
    it('E4: 反弹伤害给攻击者', () => {
        const attacker = { hp: 100 };
        EffectEngine.execute({ type: 'reflectDamage', percent: 0.5 }, {}, { attacker, damage: 40 });
        expect(attacker.hp).toBe(80); // 40 * 0.5 = 20
    });

    it('E5: 无 attacker 不报错', () => {
        EffectEngine.execute({ type: 'reflectDamage', percent: 0.5 }, {}, { damage: 40 });
        // Should not throw
    });
});

describe('EffectEngine - applyBurn', () => {
    it('E6: 施加燃烧标记', () => {
        const target = {};
        EffectEngine.execute({ type: 'applyBurn', dps: 10, duration: 3.0, maxStacks: 3 }, {}, { target });
        expect(target._burnDps).toBe(10);
        expect(target._burnDuration).toBe(3.0);
        expect(target._burnTimer).toBe(3.0);
    });

    it('E7: 叠层燃烧', () => {
        const target = { _burnDps: 5, _burnDuration: 2.0, _burnTimer: 2.0 };
        EffectEngine.execute({ type: 'applyBurn', dps: 8, duration: 3.0, maxStacks: 5 }, {}, { target });
        expect(target._burnDps).toBe(13); // 5 + 8
        expect(target._burnDuration).toBe(3.0);
    });
});

describe('EffectEngine - applySlow', () => {
    it('E8: 施加减速标记', () => {
        const target = {};
        EffectEngine.execute({ type: 'applySlow', amount: 0.4, duration: 2.0 }, {}, { target });
        expect(target._slowAmount).toBe(0.4);
        expect(target._slowDuration).toBe(2.0);
    });
});

describe('EffectEngine - duplicateBullet', () => {
    it('E9: 设置子弹复制标记', () => {
        const player = {};
        EffectEngine.execute({ type: 'duplicateBullet', chance: 0.2 }, player, {});
        expect(player._duplicateNext).toBe(true);
    });
});

describe('EffectEngine - explosion', () => {
    it('E10: 设置爆炸标记', () => {
        const context = { target: { x: 100, y: 200 } };
        EffectEngine.execute({ type: 'explosion', radius: 80, damagePercent: 1.5 }, {}, context);
        expect(context._explosion).toBeDefined();
        expect(context._explosion.radius).toBe(80);
        expect(context._explosion.damagePercent).toBe(1.5);
        expect(context._explosion.x).toBe(100);
    });
});

describe('EffectEngine - spreadBurn', () => {
    it('E11: 设置传播标记', () => {
        const context = { target: { x: 100, y: 200 } };
        EffectEngine.execute({ type: 'spreadBurn', range: 80, layers: 2 }, {}, context);
        expect(context._spreadBurn).toBeDefined();
        expect(context._spreadBurn.range).toBe(80);
        expect(context._spreadBurn.layers).toBe(2);
    });
});

describe('EffectEngine - damagePercentBoost', () => {
    it('E12: 添加临时 buff', () => {
        const player = {};
        EffectEngine.execute({ type: 'damagePercentBoost', value: 0.3, duration: 5.0 }, player, {});
        expect(player._tempBuffs).toHaveLength(1);
        expect(player._tempBuffs[0].stat).toBe('damagePercent');
        expect(player._tempBuffs[0].value).toBe(0.3);
        expect(player._tempBuffs[0].remaining).toBe(5.0);
    });
});

describe('EffectEngine - speedBoost', () => {
    it('E13: 添加移速 buff', () => {
        const player = {};
        EffectEngine.execute({ type: 'speedBoost', value: 50, duration: 3.0 }, player, {});
        expect(player._tempBuffs).toHaveLength(1);
        expect(player._tempBuffs[0].stat).toBe('speed');
        expect(player._tempBuffs[0].value).toBe(50);
    });
});

describe('EffectEngine - statMod', () => {
    it('E14: 永久属性修正', () => {
        const player = { rangedDamage: 0, maxHp: 100 };
        EffectEngine.execute({ type: 'statMod', rangedDamage: 5 }, player, {});
        expect(player.rangedDamage).toBe(5);
        expect(player.maxHp).toBe(100); // unchanged
    });
});

describe('EffectEngine - 未知类型', () => {
    it('E15: 不存在的类型不报错', () => {
        EffectEngine.execute({ type: 'nonexistent' }, {}, {});
        // Should not throw
    });

    it('E16: effect 为 null 不报错', () => {
        EffectEngine.execute(null, {}, {});
        // Should not throw
    });
});
