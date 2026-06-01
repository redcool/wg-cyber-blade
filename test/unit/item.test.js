// ============================================================
// item.test.js — ItemSystem 单元测试
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ItemSystem } from '../../src/engine/item.js';
import { EffectEngine } from '../../src/engine/effects.js';
global.EffectEngine = EffectEngine;

// --------------- fixtures ---------------
import { basePlayer } from '../fixtures/player.base.js';

// Mock DataLoader for loadItems test
global.DataLoader = {
    async load(name) {
        if (name === 'items') {
            return [
                { id: 'hpUp', name: '生命核心', desc: '最大生命 +30', cost: 6, icon: '❤️', unique: false, rarity: 'common', tags: [], triggers: [], effects: null },
                { id: 'replicator', name: '子弹复制器', desc: '20%概率射出双倍子弹', cost: 14, icon: '🖨️', unique: true, rarity: 'epic', tags: [], triggers: ['OnHit'], effects: [{ type: 'duplicateBullet', chance: 0.2 }] },
                { id: 'nirvana', name: '涅槃', desc: '测试用 unique', cost: 50, icon: '🔥', unique: true, rarity: 'legendary', tags: [], triggers: [], effects: null },
            ];
        }
        return [];
    },
};

describe('ItemSystem - 数据加载', () => {
    beforeEach(() => {
        ItemSystem.reset();
        ItemSystem.allItems = [];
    });

    it('I1: loadItems 加载并用 _itemDefs 增强', async () => {
        await ItemSystem.loadItems();
        expect(ItemSystem.allItems.length).toBeGreaterThan(0);

        // hpUp 从 _itemDefs 获取 statMods
        const hpUp = ItemSystem.getItemDef('hpUp');
        expect(hpUp).toBeDefined();
        expect(hpUp.statMods).toBeDefined();
        expect(hpUp.statMods.maxHp).toBe(30);
        expect(hpUp.tags).toEqual([]);

        // replicator 从 JSON 的 triggers/effects 合并
        const repl = ItemSystem.getItemDef('replicator');
        expect(repl).toBeDefined();
        expect(repl.triggers).toHaveLength(1);
        expect(repl.triggers[0].type).toBe('OnHit');
        expect(repl.triggers[0].effect.type).toBe('duplicateBullet');
    });

    it('I2: getItemDef 返回 null 对于不存在道具', () => {
        expect(ItemSystem.getItemDef('nonexistent')).toBeNull();
    });
});

describe('ItemSystem - 购买/移除', () => {
    beforeEach(() => {
        ItemSystem.reset();
        ItemSystem.allItems = [
            { id: 'hpUp', name: '生命核心', statMods: { maxHp: 30 }, tags: [], unique: false, rarity: 'common' },
            { id: 'nirvana', name: '涅槃', statMods: { maxHp: 50 }, tags: [], unique: true, rarity: 'legendary' },
            { id: 'glass_cannon', name: '玻璃大炮', statMods: { damagePercent: 0.50, armor: -5 }, tags: ['ranged'], unique: false, rarity: 'rare' },
        ];
    });

    it('I3: buyItem 应用 statMods', () => {
        const p = { ...basePlayer, maxHp: 100 };
        const ok = ItemSystem.buyItem('hpUp', p);
        expect(ok).toBe(true);
        expect(p.maxHp).toBe(130);
        expect(ItemSystem.hasItem('hpUp')).toBe(true);
    });

    it('I4: buyItem unique 重复购买返回 false', () => {
        const p = { ...basePlayer, maxHp: 100 };
        expect(ItemSystem.buyItem('nirvana', p)).toBe(true);
        expect(ItemSystem.buyItem('nirvana', p)).toBe(false); // 第二次失败
        expect(p.maxHp).toBe(150); // 只应用一次
    });

    it('I5: buyItem 不存在返回 false', () => {
        expect(ItemSystem.buyItem('nonexistent', {})).toBe(false);
    });

    it('I6: buyItem 多属性修正', () => {
        const p = { ...basePlayer, damagePercent: 0, armor: 10 };
        ItemSystem.buyItem('glass_cannon', p);
        expect(p.damagePercent).toBe(0.50);
        expect(p.armor).toBe(5); // 10 - 5
    });

    it('I7: removeItem 撤消 statMods', () => {
        const p = { ...basePlayer, maxHp: 100 };
        ItemSystem.buyItem('hpUp', p);
        expect(p.maxHp).toBe(130);
        ItemSystem.removeItem('hpUp', p);
        expect(p.maxHp).toBe(100);
        expect(ItemSystem.hasItem('hpUp')).toBe(false);
    });

    it('I8: removeItem 不存在不报错', () => {
        ItemSystem.removeItem('nonexistent', {});
        // Should not throw
    });

    it('I9: reset 清空状态', () => {
        const p = { ...basePlayer };
        ItemSystem.buyItem('hpUp', p);
        expect(ItemSystem.ownedItems.length).toBe(1);
        ItemSystem.reset();
        expect(ItemSystem.ownedItems.length).toBe(0);
    });
});

describe('ItemSystem - 查询', () => {
    beforeEach(() => {
        ItemSystem.reset();
        ItemSystem.allItems = [
            { id: 'hpUp', statMods: { maxHp: 30 }, tags: [], rarity: 'common', unique: false },
            { id: 'replicator', statMods: {}, tags: ['ranged'], rarity: 'epic', unique: true },
            { id: 'burn_spreader', statMods: { burningSpread: 1 }, tags: ['fire'], rarity: 'epic', unique: false },
        ];
    });

    it('I10: getByRarity 过滤正确', () => {
        const common = ItemSystem.getByRarity('common');
        expect(common).toHaveLength(1);
        expect(common[0].id).toBe('hpUp');
    });

    it('I11: getByTag 过滤正确', () => {
        const fire = ItemSystem.getByTag('fire');
        expect(fire).toHaveLength(1);
        expect(fire[0].id).toBe('burn_spreader');
    });

    it('I12: getBuyablePool 排除已持有 unique', () => {
        const p = { ...basePlayer };
        ItemSystem.buyItem('replicator', p);
        const pool = ItemSystem.getBuyablePool();
        expect(pool.find(i => i.id === 'replicator')).toBeUndefined();
        expect(pool.find(i => i.id === 'hpUp')).toBeDefined();
    });

    it('I13: hasItem 正确', () => {
        expect(ItemSystem.hasItem('hpUp')).toBe(false);
        const p = { ...basePlayer };
        ItemSystem.buyItem('hpUp', p);
        expect(ItemSystem.hasItem('hpUp')).toBe(true);
    });
});

describe('ItemSystem - onEvent 触发器', () => {
    beforeEach(() => {
        ItemSystem.reset();
        vi.restoreAllMocks();
    });

    it('I14: onEvent 触发匹配的道具效果', () => {
        ItemSystem.allItems = [
            { id: 'thorn', statMods: {}, tags: [], triggers: [{ type: 'OnDamageTaken', chance: 1.0, effect: { type: 'reflectDamage', percent: 0.3 } }] },
        ];
        const p = { ...basePlayer };
        ItemSystem.ownedItems = ['thorn'];

        const attacker = { hp: 100 };
        const context = { attacker, damage: 50 };
        ItemSystem.onEvent('OnDamageTaken', p, context);
        expect(attacker.hp).toBe(100 - Math.floor(50 * 0.3)); // 85
    });

    it('I15: onEvent 不触发不匹配类型', () => {
        ItemSystem.allItems = [
            { id: 'thorn', statMods: {}, tags: [], triggers: [{ type: 'OnDamageTaken', chance: 1.0, effect: { type: 'reflectDamage', percent: 0.3 } }] },
        ];
        const p = { ...basePlayer };
        ItemSystem.ownedItems = ['thorn'];

        const attacker = { hp: 100 };
        ItemSystem.onEvent('OnKill', p, { attacker, damage: 50 });
        expect(attacker.hp).toBe(100); // 未触发
    });

    it('I16: onEvent 概率检查', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.9); // 高值 → 不触发

        ItemSystem.allItems = [
            { id: 'thorn', statMods: {}, tags: [], triggers: [{ type: 'OnDamageTaken', chance: 0.3, effect: { type: 'reflectDamage', percent: 0.3 } }] },
        ];
        const p = { ...basePlayer };
        ItemSystem.ownedItems = ['thorn'];

        const attacker = { hp: 100 };
        ItemSystem.onEvent('OnDamageTaken', p, { attacker, damage: 50 });
        expect(attacker.hp).toBe(100); // 概率没中
    });

    it('I17: onEvent ownedItems 为空不报错', () => {
        ItemSystem.onEvent('OnHit', { ...basePlayer }, {});
        // Should not throw
    });
});

describe('ItemSystem - update 帧更新', () => {
    beforeEach(() => {
        ItemSystem.reset();
        vi.restoreAllMocks();
    });

    it('I18: update PerSecond 触发器按间隔触发', () => {
        const healEffect = { type: 'heal', value: 5 };
        ItemSystem.allItems = [
            { id: 'regen_trigger', statMods: {}, tags: [], triggers: [{ type: 'PerSecond', chance: 1.0, interval: 2.0, effect: healEffect }] },
        ];
        const p = { ...basePlayer, hp: 50, maxHp: 100 };
        ItemSystem.ownedItems = ['regen_trigger'];

        // dt 累积不足间隔
        ItemSystem.update(1.0, p);
        expect(p.hp).toBe(50);

        // 第二次 update 累积超过间隔
        ItemSystem.update(1.5, p);
        expect(p.hp).toBe(55); // 回血 5
    });

    it('I19: update OnLowHP 低血量触发', () => {
        ItemSystem.allItems = [
            { id: 'berserker', statMods: {}, tags: ['melee'], triggers: [{ type: 'OnLowHP', chance: 1.0, effect: { type: 'heal', value: 30 } }] },
        ];
        const p = { ...basePlayer, hp: 20, maxHp: 100 };
        ItemSystem.ownedItems = ['berserker'];

        // HP < 30% 时触发
        ItemSystem.update(1.0, p);
        expect(p.hp).toBe(50); // 20 + 30
    });

    it('I20: update OnLowHP 只触发一次', () => {
        ItemSystem.allItems = [
            { id: 'berserker', statMods: {}, tags: ['melee'], triggers: [{ type: 'OnLowHP', chance: 1.0, effect: { type: 'heal', value: 30 } }] },
        ];
        const p = { ...basePlayer, hp: 20, maxHp: 100 };
        ItemSystem.ownedItems = ['berserker'];

        ItemSystem.update(1.0, p);
        expect(p.hp).toBe(50); // 第一次触发

        // 仍低于 30%，不应再次触发
        ItemSystem.update(1.0, p);
        expect(p.hp).toBe(50); // 未变
    });

    it('I21: update OnLowHP 恢复后重置', () => {
        ItemSystem.allItems = [
            { id: 'berserker', statMods: {}, tags: ['melee'], triggers: [{ type: 'OnLowHP', chance: 1.0, effect: { type: 'heal', value: 30 } }] },
        ];
        const p = { ...basePlayer, hp: 20, maxHp: 100 };
        ItemSystem.ownedItems = ['berserker'];

        ItemSystem.update(1.0, p);
        expect(p.hp).toBe(50);

        // 恢复血量到 30% 以上
        p.hp = 80;
        ItemSystem.update(1.0, p);
        expect(p.hp).toBe(80); // 无变化

        // 再降到 30% 以下应再次触发
        p.hp = 20;
        ItemSystem.update(1.0, p);
        expect(p.hp).toBe(50);
    });
});


