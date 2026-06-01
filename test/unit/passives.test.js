// ============================================================
// passives.test.js — PassiveSystem 单元测试
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PassiveSystem } from '../../src/engine/passives.js';
import { EffectEngine } from '../../src/engine/effects.js';
global.EffectEngine = EffectEngine;

// Mock DataLoader
const MOCK_PASSIVES = [
    {
        id: 'hunter_ranged_boost', name: '精准射击', desc: '远程伤害 +5', icon: '🏹',
        triggerType: 'Passive', condition: null, chance: 1.0,
        effect: { type: 'statMod', rangedDamage: 5 },
        target: 'player', tags: ['ranged'], cooldown: 0,
    },
    {
        id: 'pyro_burn_on_hit', name: '火焰之触', desc: '攻击命中燃烧', icon: '🔥',
        triggerType: 'OnHit', condition: null, chance: 1.0,
        effect: { type: 'applyBurn', dps: 8, duration: 3.0, maxStacks: 3 },
        target: 'enemy', tags: ['fire'], cooldown: 0.5,
    },
    {
        id: 'berserker_rage', name: '嗜血狂暴', desc: '低血量 +30% 伤害', icon: '💢',
        triggerType: 'OnLowHP', condition: null, chance: 1.0,
        effect: { type: 'damagePercentBoost', value: 0.3, duration: 999 },
        target: 'player', tags: ['melee'], cooldown: 5.0,
    },
    {
        id: 'assassin_crit_boost', name: '致命一击', desc: '暴击 +50% 伤害', icon: '💥',
        triggerType: 'OnCrit', condition: null, chance: 1.0,
        effect: { type: 'damagePercentBoost', value: 0.5, duration: 0.5 },
        target: 'player', tags: ['crit'], cooldown: 0,
    },
    {
        id: 'merchant_gold_damage', name: '金钱之力', desc: '每 50 金币 +5% 伤害', icon: '💰',
        triggerType: 'PerSecond', condition: null, chance: 1.0,
        effect: { type: 'conditionalStatMod', stat: 'damagePercent', formula: 'Math.floor(materials / 50) * 0.05' },
        target: 'player', tags: ['economy'], cooldown: 1.0,
    },
];

global.DataLoader = {
    async load(name) {
        if (name === 'passives') return MOCK_PASSIVES;
        return [];
    },
};

function makePlayer(overrides) {
    return {
        hp: 100, maxHp: 100, damagePercent: 0, materials: 0,
        ...overrides,
    };
}

describe('PassiveSystem - 数据加载', () => {
    beforeEach(() => {
        PassiveSystem.resetAll();
    });

    it('P1: loadPassives 加载成功', async () => {
        await PassiveSystem.loadPassives();
        expect(PassiveSystem.allPassives.length).toBe(5);
    });

    it('P2: loadPassives 失败优雅降级', async () => {
        global.DataLoader.load = async () => [];
        await PassiveSystem.loadPassives(); // 不抛出，降级到空列表
        expect(PassiveSystem.allPassives.length).toBe(0);
        global.DataLoader.load = async (name) => {
            if (name === 'passives') return MOCK_PASSIVES;
            return [];
        };
    });

    it('P3: getDef 返回定义或 null', async () => {
        await PassiveSystem.loadPassives();
        const def = PassiveSystem.getDef('pyro_burn_on_hit');
        expect(def).toBeDefined();
        expect(def.triggerType).toBe('OnHit');
        expect(PassiveSystem.getDef('nonexistent')).toBeNull();
    });
});

describe('PassiveSystem - 注册/注销', () => {
    beforeEach(async () => {
        PassiveSystem.resetAll();
        await PassiveSystem.loadPassives();
    });

    it('P4: register Passive 类型', () => {
        // EffectEngine needs to be available for Passive type
        // In test context, it won't be, so the passive is still added to active list
        // but statMod won't be applied (no global EffectEngine)
        const ok = PassiveSystem.register('hunter_ranged_boost', 'character');
        expect(ok).toBe(true);
        expect(PassiveSystem.activePassives).toHaveLength(1);
        expect(PassiveSystem.activePassives[0].id).toBe('hunter_ranged_boost');
    });

    it('P5: register 去重', () => {
        PassiveSystem.register('hunter_ranged_boost', 'character');
        PassiveSystem.register('hunter_ranged_boost', 'character');
        expect(PassiveSystem.activePassives).toHaveLength(1);
    });

    it('P6: register 不存在返回 false', () => {
        expect(PassiveSystem.register('nonexistent', 'character')).toBe(false);
        expect(PassiveSystem.activePassives).toHaveLength(0);
    });

    it('P7: unregister 移除', () => {
        PassiveSystem.register('pyro_burn_on_hit', 'character');
        expect(PassiveSystem.activePassives).toHaveLength(1);
        PassiveSystem.unregister('pyro_burn_on_hit');
        expect(PassiveSystem.activePassives).toHaveLength(0);
    });

    it('P8: unregister 不存在不报错', () => {
        PassiveSystem.unregister('nonexistent');
        // Should not throw
    });

    it('P9: registerMany 批量注册', () => {
        PassiveSystem.registerMany(['pyro_burn_on_hit', 'assassin_crit_boost'], 'character');
        expect(PassiveSystem.activePassives).toHaveLength(2);
    });

    it('P10: unregisterMany 批量注销', () => {
        PassiveSystem.registerMany(['pyro_burn_on_hit', 'assassin_crit_boost'], 'character');
        PassiveSystem.unregisterMany(['pyro_burn_on_hit', 'assassin_crit_boost']);
        expect(PassiveSystem.activePassives).toHaveLength(0);
    });
});

describe('PassiveSystem - onEvent 触发', () => {
    beforeEach(async () => {
        PassiveSystem.resetAll();
        vi.restoreAllMocks();
        await PassiveSystem.loadPassives();
    });

    it('P11: onEvent OnHit 触发', () => {
        PassiveSystem.register('pyro_burn_on_hit', 'character');
        const target = {};
        PassiveSystem.onEvent('OnHit', makePlayer(), { target });
        expect(target._burnDps).toBe(8);
    });

    it('P12: onEvent OnCrit 触发', () => {
        PassiveSystem.register('assassin_crit_boost', 'character');
        const player = makePlayer();
        PassiveSystem.onEvent('OnCrit', player, { target: {} });
        expect(player._tempBuffs).toBeDefined();
        expect(player._tempBuffs).toHaveLength(1);
        expect(player._tempBuffs[0].stat).toBe('damagePercent');
    });

    it('P13: onEvent 不触发不匹配类型', () => {
        PassiveSystem.register('pyro_burn_on_hit', 'character');
        const target = {};
        PassiveSystem.onEvent('OnKill', makePlayer(), { target });
        expect(target._burnDps).toBeUndefined();
    });

    it('P14: onEvent 概率检查', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.9);
        // 注册一个 chance=0.3 的被动（模拟）
        const entry = PassiveSystem.getDef('pyro_burn_on_hit');
        const lowChanceEntry = { ...entry, chance: 0.3, _regKey: 'pyro_low_test' };
        PassiveSystem.activePassives.push(lowChanceEntry);
        const target = {};
        PassiveSystem.onEvent('OnHit', makePlayer(), { target });
        expect(target._burnDps).toBeUndefined();
    });

    it('P15: onEvent 空 activePassives 不报错', () => {
        PassiveSystem.onEvent('OnHit', makePlayer(), { target: {} });
        // Should not throw
    });
});

describe('PassiveSystem - update 帧更新', () => {
    beforeEach(async () => {
        PassiveSystem.resetAll();
        await PassiveSystem.loadPassives();
    });

    it('P16: update OnLowHP 触发', () => {
        PassiveSystem.register('berserker_rage', 'character');
        const player = makePlayer({ hp: 20, maxHp: 100 });
        PassiveSystem.update(1.0, player);
        expect(player._tempBuffs).toBeDefined();
        expect(player._tempBuffs[0].value).toBe(0.3);
    });

    it('P17: update OnLowHP 只触发一次', () => {
        PassiveSystem.register('berserker_rage', 'character');
        const player = makePlayer({ hp: 20, maxHp: 100 });
        PassiveSystem.update(1.0, player);
        expect(player._tempBuffs).toHaveLength(1);

        PassiveSystem.update(1.0, player);
        expect(player._tempBuffs).toHaveLength(1); // 未重复触发
    });

    it('P18: update OnLowHP 恢复后重置', () => {
        // 使用 cooldown=0 的 OnLowHP passive（绕过冷却限制）
        const def = PassiveSystem.getDef('berserker_rage');
        const noCdEntry = { ...def, cooldown: 0, _regKey: 'berserker_nocd' };
        PassiveSystem.activePassives.push(noCdEntry);
        const player = makePlayer({ hp: 20, maxHp: 100 });
        PassiveSystem.update(1.0, player);
        expect(player._tempBuffs).toHaveLength(1);

        player.hp = 80;
        PassiveSystem.update(1.0, player);
        expect(player._tempBuffs).toHaveLength(1); // 无新增

        player.hp = 20;
        PassiveSystem.update(1.0, player);
        expect(player._tempBuffs).toHaveLength(2); // 再次触发
    });

    it('P19: update PerSecond 间隔触发', () => {
        PassiveSystem.register('merchant_gold_damage', 'character');
        const player = makePlayer({ materials: 100, damagePercent: 0 });

        // dt 累积不足 1s
        PassiveSystem.update(0.5, player);
        expect(player.damagePercent).toBe(0);

        // 累积超过 1s
        PassiveSystem.update(0.6, player);
        // damagePercent 应该被 formula 更新：floor(100/50)*0.05 = 2*0.05 = 0.10
        // 注意: conditionalStatMod 是累加（+=），已有 0 + 0.10 = 0.10
        expect(player.damagePercent).toBe(0.10);
    });
});

describe('PassiveSystem - 查询/重置', () => {
    beforeEach(async () => {
        PassiveSystem.resetAll();
        await PassiveSystem.loadPassives();
    });

    it('P20: getByTag 过滤正确', () => {
        PassiveSystem.registerMany(['pyro_burn_on_hit', 'hunter_ranged_boost', 'assassin_crit_boost'], 'character');
        const fire = PassiveSystem.getByTag('fire');
        expect(fire).toHaveLength(1);
        expect(fire[0].id).toBe('pyro_burn_on_hit');

        const crit = PassiveSystem.getByTag('crit');
        expect(crit).toHaveLength(1);
        expect(crit[0].id).toBe('assassin_crit_boost');
    });

    it('P21: reset 清空 active', () => {
        PassiveSystem.register('pyro_burn_on_hit', 'character');
        PassiveSystem.reset();
        expect(PassiveSystem.activePassives).toHaveLength(0);
        expect(PassiveSystem.allPassives.length).toBeGreaterThan(0); // data preserved
    });

    it('P22: resetAll 完全重置', () => {
        PassiveSystem.register('pyro_burn_on_hit', 'character');
        PassiveSystem.resetAll();
        expect(PassiveSystem.allPassives).toHaveLength(0);
        expect(PassiveSystem.activePassives).toHaveLength(0);
    });
});
