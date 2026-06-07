// ============================================================
// shop.test.js — ShopSystem 单元测试
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShopSystem } from '../../src/engine/engine-shop.js';
import { TagSystem } from '../../src/engine/tags.js';
import { ItemSystem } from '../../src/engine/item.js';
import { EffectEngine } from '../../src/engine/effects.js';
global.EffectEngine = EffectEngine;
global.TagSystem = TagSystem;
global.ItemSystem = ItemSystem;

// ============================================================
// Mock data
// ============================================================

const MOCK_WEAPONS = [
    { id: 'plasma', name: '等离子刀', tag: 'melee', cost: 10, damageMult: 1.5, slots: 1, behavior: 'melee_sweep' },
    { id: 'rifle', name: '突击步枪', tag: 'ranged', cost: 12, damageMult: 1.2, slots: 1, behavior: 'bullet' },
    { id: 'fire_sword', name: '火焰剑', tag: 'melee', cost: 15, damageMult: 1.3, slots: 1, behavior: 'melee_sweep' },
    { id: 'staff', name: '法杖', tag: 'fire', cost: 14, damageMult: 1.4, slots: 1, behavior: 'projectile' },
    { id: 'bow', name: '长弓', tag: 'ranged', cost: 8, damageMult: 1.0, slots: 1, behavior: 'bullet' },
    { id: 'dagger', name: '匕首', tag: 'melee', cost: 6, damageMult: 0.8, slots: 1, behavior: 'melee_sweep' },
];

const MOCK_ITEMS = [
    { id: 'hpUp', name: '生命核心', cost: 6, icon: '❤️', unique: false, rarity: 'common', tags: [], statMods: { maxHp: 30 } },
    { id: 'critUp', name: '暴击芯片', cost: 8, icon: '💥', unique: false, rarity: 'common', tags: ['crit'], statMods: { critChance: 0.04 } },
    { id: 'replicator', name: '子弹复制器', cost: 14, icon: '🖨️', unique: true, rarity: 'epic', tags: ['ranged'], statMods: {} },
    { id: 'regen', name: '再生芯片', cost: 5, icon: '💚', unique: false, rarity: 'common', tags: [], statMods: { hpRegen: 1.0 } },
    { id: 'lifesteal', name: '吸血鬼之牙', cost: 8, icon: '🩸', unique: false, rarity: 'common', tags: [], statMods: { lifeSteal: 0.03 } },
    { id: 'harvestUp', name: '丰收之角', cost: 7, icon: '💰', unique: false, rarity: 'common', tags: ['economy'], statMods: { harvesting: 20 } },
    { id: 'nirvana', name: '涅槃', cost: 50, icon: '🔥', unique: true, rarity: 'legendary', tags: ['fire'], statMods: { maxHp: 50 } },
];

// DataLoader mock with _cache
global.DataLoader = {
    _cache: {
        weapons: MOCK_WEAPONS,
        items: MOCK_ITEMS,
    },
    async load(name) {
        if (name === 'weapons') return MOCK_WEAPONS;
        if (name === 'items') return MOCK_ITEMS;
        return [];
    },
};

// TagSystem already loaded from src/engine/tags.js
// ItemSystem already loaded from src/engine/item.js

// ItemSystem setup with test items
function setupItemSystem() {
    ItemSystem.reset();
    ItemSystem.allItems = MOCK_ITEMS.map(item => ({
        ...item,
        // Ensure statMods for items that need them
        statMods: item.statMods || {},
        triggers: item.triggers || [],
    }));
}

// Helper: deterministic random
function setRandomSequence(sequence) {
    let calls = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => {
        if (calls < sequence.length) {
            return sequence[calls++];
        }
        return 0.5; // default fallback
    });
}

function makePlayer(overrides) {
    return {
        weapons: [],
        items: [],
        materials: 100,
        weaponSlots: 4,
        weaponParams: {},
        maxHp: 100,
        hp: 100,
        ...overrides,
    };
}

// ============================================================
// Tests
// ============================================================

describe('ShopSystem - 稀有度投掷', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('S1: rollRarity 仅返回有效稀有度', () => {
        // 模拟随机序列覆盖所有权值
        const rarities = new Set();
        for (let i = 0; i < 200; i++) {
            const rarity = ShopSystem.rollRarity(20);
            expect(['common', 'uncommon', 'rare', 'epic', 'legendary']).toContain(rarity);
            rarities.add(rarity);
        }
        // 大样本应覆盖全部 5 种
        expect(rarities.size).toBe(5);
    });

    it('S2: rollRarity 尊重 minWave — wave=1 仅 common', () => {
        for (let i = 0; i < 100; i++) {
            expect(ShopSystem.rollRarity(1)).toBe('common');
        }
    });

    it('S3: rollRarity wave=5 可出 common 或 rare', () => {
        const rarities = new Set();
        for (let i = 0; i < 100; i++) {
            rarities.add(ShopSystem.rollRarity(5));
        }
        expect(rarities.has('common')).toBe(true);
        expect(rarities.has('rare')).toBe(true);
        expect(rarities.has('epic')).toBe(false); // minWave=6
        expect(rarities.has('legendary')).toBe(false); // minWave=10
    });

    it('S4: rollRarity wave=6 可出 epic', () => {
        const rarities = new Set();
        for (let i = 0; i < 200; i++) {
            rarities.add(ShopSystem.rollRarity(6));
        }
        expect(rarities.has('epic')).toBe(true);
    });

    it('S5: rollRarity wave=10 可出 legendary', () => {
        const rarities = new Set();
        for (let i = 0; i < 500; i++) {
            rarities.add(ShopSystem.rollRarity(10));
        }
        expect(rarities.has('legendary')).toBe(true);
    });
});

describe('ShopSystem - 保底系统', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('S6: applyPity — sinceLastRare>=3 时 common 升 rare', () => {
        const pt = { totalRolls: 0, sinceLastRare: 3, sinceLastEpic: 0, sinceLastLegendary: 0 };
        const result = ShopSystem.applyPity('common', pt);
        expect(result.rarity).toBe('rare');
        expect(result.wasPity).toBe(true);
        expect(pt.sinceLastRare).toBe(0); // 重置
    });

    it('S7: applyPity — sinceLastEpic>=10 时 rare 升 epic', () => {
        const pt = { totalRolls: 0, sinceLastRare: 10, sinceLastEpic: 10, sinceLastLegendary: 0 };
        const result = ShopSystem.applyPity('rare', pt);
        expect(result.rarity).toBe('epic');
        expect(result.wasPity).toBe(true);
        expect(pt.sinceLastEpic).toBe(0);
        expect(pt.sinceLastRare).toBe(0); // epic 也重置 rare
    });

    it('S8: applyPity — sinceLastLegendary>=20 时 epic 升 legendary', () => {
        const pt = { totalRolls: 0, sinceLastRare: 0, sinceLastEpic: 0, sinceLastLegendary: 20 };
        const result = ShopSystem.applyPity('epic', pt);
        expect(result.rarity).toBe('legendary');
        expect(result.wasPity).toBe(true);
        expect(pt.sinceLastLegendary).toBe(0);
    });

    it('S9: applyPity — legendary 不触发保底', () => {
        const pt = { totalRolls: 0, sinceLastRare: 5, sinceLastEpic: 0, sinceLastLegendary: 0 };
        const result = ShopSystem.applyPity('legendary', pt);
        expect(result.rarity).toBe('legendary');
        expect(result.wasPity).toBe(false);
        // legendary 重置所有计数器
        expect(pt.sinceLastRare).toBe(0);
        expect(pt.sinceLastEpic).toBe(0);
        expect(pt.sinceLastLegendary).toBe(0);
    });

    it('S10: applyPity — 不足阈值时不改变', () => {
        const pt = { totalRolls: 0, sinceLastRare: 2, sinceLastEpic: 0, sinceLastLegendary: 0 };
        const result = ShopSystem.applyPity('common', pt);
        expect(result.rarity).toBe('common');
        expect(result.wasPity).toBe(false);
        expect(pt.sinceLastRare).toBe(3); // +1
    });

    it('S11: applyPity — 长期不触发 legendary 保底强制 legendary', () => {
        const pt = { totalRolls: 25, sinceLastRare: 25, sinceLastEpic: 25, sinceLastLegendary: 25 };
        const result = ShopSystem.applyPity('common', pt);
        expect(result.rarity).toBe('legendary');
        expect(result.wasPity).toBe(true);
        expect(pt.sinceLastLegendary).toBe(0);
        expect(pt.sinceLastEpic).toBe(0);
        expect(pt.sinceLastRare).toBe(0);
    });

    it('S12: applyPity — epic 保底优先级高于 rare 保底', () => {
        const pt = { totalRolls: 0, sinceLastRare: 15, sinceLastEpic: 10, sinceLastLegendary: 0 };
        const result = ShopSystem.applyPity('common', pt);
        expect(result.rarity).toBe('epic'); // epic 保底优先
        expect(result.wasPity).toBe(true);
        expect(pt.sinceLastEpic).toBe(0);
        expect(pt.sinceLastRare).toBe(0);
    });
});

describe('ShopSystem - 流派偏向选择', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('S13: biasedSelect 空池返回 null', () => {
        expect(ShopSystem.biasedSelect([], {})).toBeNull();
        expect(ShopSystem.biasedSelect(null, {})).toBeNull();
    });

    it('S14: biasedSelect 单元素池返回该元素', () => {
        const pool = [{ id: 'test', tag: 'melee' }];
        const selected = ShopSystem.biasedSelect(pool, {});
        expect(selected).toBe(pool[0]);
    });

    it('S15: biasedSelect 不改变池内容', () => {
        const pool = [
            { id: 'a', tag: 'melee' },
            { id: 'b', tag: 'ranged' },
        ];
        const selected = ShopSystem.biasedSelect(pool, {});
        expect(pool).toContain(selected);
        expect(pool.length).toBe(2);
    });

    it('S16: biasedSelect 偏向权重使匹配标签物品被选中', () => {
        // melee 权重极高 → 应选中 melee 物品
        const pool = [
            { id: 'melee_item', tag: 'melee' },
            { id: 'ranged_item', tag: 'ranged' },
        ];
        const biasWeights = { melee: 100, ranged: 1.0 };

        let meleeCount = 0;
        const trials = 100;
        for (let i = 0; i < trials; i++) {
            const sel = ShopSystem.biasedSelect(pool, biasWeights);
            if (sel.id === 'melee_item') meleeCount++;
        }

        // melee 权重 100 远大于 ranged 1.0 → 几乎总是选中 melee
        expect(meleeCount).toBeGreaterThan(trials * 0.8);
    });

    it('S17: biasedSelect 道具多标签权重叠加', () => {
        const pool = [
            { id: 'fire_melee', tags: ['fire', 'melee'] },
            { id: 'plain', tags: [] },
        ];
        // 大权重差使多标签叠加效应更明显
        const biasWeights = { fire: 5.0, melee: 5.0 };

        let fireMeleeCount = 0;
        const trials = 200;
        for (let i = 0; i < trials; i++) {
            const sel = ShopSystem.biasedSelect(pool, biasWeights);
            if (sel.id === 'fire_melee') fireMeleeCount++;
        }

        // fire_melee 权重: 1.0 + 4.0/2 + 4.0/2 = 5.0, plain 权重: 1.0 → 期望 ≈ 83%
        expect(fireMeleeCount).toBeGreaterThan(trials * 0.5);
    });

    it('S18: biasedSelect 无标签物品权重=1.0', () => {
        const pool = [
            { id: 'no_tag', tags: [] },
            { id: 'has_tag', tags: ['fire'] },
        ];
        const biasWeights = { fire: 1.0 }; // 无偏向
        // 两者权重相同 → 各有约 50%
        let noTagCount = 0;
        const trials = 200;
        for (let i = 0; i < trials; i++) {
            const sel = ShopSystem.biasedSelect(pool, biasWeights);
            if (sel.id === 'no_tag') noTagCount++;
        }
        expect(noTagCount).toBeGreaterThan(trials * 0.2);
        expect(noTagCount).toBeLessThan(trials * 0.8);
    });
});

describe('ShopSystem - 商品生成', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        ShopSystem.reset();
        setupItemSystem();
        // Mock DataLoader._cache to have weapons
        global.DataLoader._cache = { weapons: MOCK_WEAPONS };
    });

    it('S19: generateItems 4 槽独立 roll, 至少 1 件道具 (Brotato 风格防 0 道具)', () => {
        const player = makePlayer({ weapons: [{ id: 'plasma', level: 1, quality: 'T1' }] });

        // 跑多次以覆盖各种概率分布, 验证硬约束
        for (let trial = 0; trial < 50; trial++) {
            ShopSystem.generateItems(player, 5);
            const weapons = ShopSystem.items.filter(it => it.type === 'weapon');
            const items = ShopSystem.items.filter(it => it.type === 'item');

            // 4 槽总 = 4
            expect(weapons.length + items.length).toBe(4);
            // 至少 1 件道具 (硬约束, 即使 4 槽全 roll 武器也强制最后一槽改 item)
            expect(items.length).toBeGreaterThanOrEqual(1);
        }
    });

    it('S20: 生成的武器有完整字段', () => {
        const player = makePlayer();
        ShopSystem.generateItems(player, 5);

        const weapon = ShopSystem.items.find(it => it.type === 'weapon');
        expect(weapon).toBeDefined();
        expect(weapon).toHaveProperty('id');
        expect(weapon).toHaveProperty('rarity');
        expect(weapon).toHaveProperty('rarityColor');
        expect(weapon).toHaveProperty('quality');
        expect(weapon).toHaveProperty('cost');
        expect(weapon).toHaveProperty('type', 'weapon');
        expect(weapon).toHaveProperty('level');
        expect(['common', 'uncommon', 'rare', 'epic', 'legendary']).toContain(weapon.rarity);
    });

    it('S21: 生成的道具有完整字段', () => {
        const player = makePlayer();
        ShopSystem.generateItems(player, 5);

        const item = ShopSystem.items.find(it => it.type === 'item');
        expect(item).toBeDefined();
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('rarity');
        expect(item).toHaveProperty('rarityColor');
        expect(item).toHaveProperty('cost');
        expect(item).toHaveProperty('type', 'item');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('unique');
        expect(['common', 'uncommon', 'rare', 'epic', 'legendary']).toContain(item.rarity);
    });

    it('S22: 不生成重复武器 ID', () => {
        const player = makePlayer();
        // 使用固定随机序列确保测试一致性
        vi.spyOn(Math, 'random').mockReturnValue(0.3);

        ShopSystem.generateItems(player, 10);
        const weaponIds = ShopSystem.items
            .filter(it => it.type === 'weapon')
            .map(it => it.id);
        const uniqueIds = new Set(weaponIds);
        expect(uniqueIds.size).toBe(weaponIds.length);
    });

    it('S23: 已购 unique 道具被排除', () => {
        const player = makePlayer();
        ShopSystem._boughtUniqueItems = ['replicator'];

        // 只保留少量道具确保 unique 排除可观测
        global.DataLoader._cache = { weapons: MOCK_WEAPONS };

        ShopSystem.generateItems(player, 10);

        const itemIds = ShopSystem.items
            .filter(it => it.type === 'item')
            .map(it => it.id);
        expect(itemIds.includes('replicator')).toBe(false);
    });

    it('S24: 武器池/道具池为空时生成空列表', () => {
        const player = makePlayer();
        global.DataLoader._cache = { weapons: [] };
        // ItemSystem.allItems 为空
        ItemSystem.allItems = [];

        ShopSystem.generateItems(player, 5);
        expect(ShopSystem.items.length).toBe(0);
    });
});

describe('ShopSystem - 刷新', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        ShopSystem.reset();
        setupItemSystem();
        global.DataLoader._cache = { weapons: MOCK_WEAPONS };
    });

    it('S25: reroll 扣除 refreshCost (2)', () => {
        const player = makePlayer({ materials: 10 });
        ShopSystem.generateItems(player, 5);
        expect(ShopSystem.items.length).toBeGreaterThan(0);

        const cost = ShopSystem.refreshCost;

        ShopSystem.reroll(player, 5);
        expect(player.materials).toBe(10 - cost);
    });

    it('S26: reroll 材料不足返回 false', () => {
        const player = makePlayer({ materials: 1 });
        expect(ShopSystem.reroll(player, 5)).toBe(false);
    });

    it('S27: reroll 成功返回 true 并生成新商品', () => {
        const player = makePlayer({ materials: 10 });
        ShopSystem.generateItems(player, 5);
        const oldItems = [...ShopSystem.items];

        const result = ShopSystem.reroll(player, 5);
        expect(result).toBe(true);
        expect(ShopSystem.items).not.toEqual(oldItems);
    });

    it('S28: reroll 无 player 返回 false', () => {
        expect(ShopSystem.reroll(null, 5)).toBe(false);
    });

    it('S29: reroll 递增 refreshCost (Brotato 风格, 限制无限刷新)', () => {
        const player = makePlayer({ materials: 100 });
        const initialCost = ShopSystem.refreshCost; // 2

        for (let i = 0; i < 5; i++) {
            ShopSystem.reroll(player, 5);
        }
        // 5 次 reroll 后 refreshCost 应 +5 (与 refresh() 行为一致)
        expect(ShopSystem.refreshCost).toBe(initialCost + 5);
    });
});

describe('ShopSystem - 购买', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        ShopSystem.reset();
        setupItemSystem();
        global.DataLoader._cache = { weapons: MOCK_WEAPONS };

        // populate shop with known items for deterministic test
        ShopSystem.items = [
            {
                id: 'plasma', type: 'weapon', name: '等离子刀',
                cost: 10, rarity: 'rare', rarityColor: '#4488ff',
                quality: 'T2', level: 1, tag: 'melee',
                slots: 1, damageMult: 1.5, tags: ['melee'],
                behavior: 'melee_sweep',
            },
            {
                id: 'staff', type: 'weapon', name: '法杖',
                cost: 15, rarity: 'epic', rarityColor: '#aa44ff',
                quality: 'T3', level: 1, tag: 'fire',
                slots: 1, damageMult: 1.4, tags: ['fire'],
                behavior: 'projectile',
            },
            {
                id: 'hpUp', type: 'item', name: '生命核心',
                cost: 6, rarity: 'common', rarityColor: '#aaaaaa',
                unique: false, tags: [],
            },
            {
                id: 'replicator', type: 'item', name: '子弹复制器',
                cost: 20, rarity: 'epic', rarityColor: '#aa44ff',
                unique: true, tags: ['ranged'],
            },
            {
                id: 'nirvana', type: 'item', name: '涅槃',
                cost: 99, rarity: 'legendary', rarityColor: '#ff6600',
                unique: true, tags: ['fire'],
            },
        ];
    });

    it('S30: buyItem 无效索引返回 null', () => {
        const player = makePlayer();
        expect(ShopSystem.buyItem(-1, player)).toBeNull();
        expect(ShopSystem.buyItem(99, player)).toBeNull();
    });

    it('S31: buyItem 材料不足返回 null', () => {
        const player = makePlayer({ materials: 1 });
        expect(ShopSystem.buyItem(0, player)).toBeNull();
    });

    it('S32: buyItem 无 player 返回 null', () => {
        expect(ShopSystem.buyItem(0, null)).toBeNull();
    });

    it('S33: 购买武器—新增至武器槽', () => {
        const player = makePlayer({ weapons: [], weaponSlots: 4 });

        const result = ShopSystem.buyItem(0, player); // plasma
        expect(result).not.toBeNull();
        expect(result.action).toBe('bought');
        expect(player.materials).toBe(100 - 10);
        expect(player.weapons.length).toBe(1);
        expect(player.weapons[0].id).toBe('plasma');
        expect(player.weapons[0].quality).toBe('T1'); // 品质已锁定为 T1
        expect(player.weapons[0].level).toBe(1);
    });

    it('S34: 购买武器—槽位未满时同 ID 不合并 (加新槽位)', () => {
        // 新设计: 槽位未满 (1/4), 即使有同 id 也不升级, 而是开新槽位
        const player = makePlayer({
            weapons: [{ id: 'plasma', level: 1, quality: 'T1' }],
            weaponSlots: 4,
        });

        const result = ShopSystem.buyItem(0, player); // plasma (quality T1)
        expect(result).not.toBeNull();
        expect(result.action).toBe('bought');
        expect(player.weapons.length).toBe(2); // 多开一槽
        expect(player.weapons[1].level).toBe(1); // 新武器 1 级, 不升级
        expect(player.weapons[0].level).toBe(1); // 原武器不动
    });

    it('S34b: 购买武器—槽位已满时同 ID 合并升级', () => {
        // 设计: 槽位已满 (4/4), 同 id 武器合并升级 (merged)
        const player = makePlayer({
            weapons: [
                { id: 'plasma', level: 1, quality: 'T1' },
                { id: 'axe', level: 1, quality: 'T1' },
                { id: 'hammer', level: 1, quality: 'T1' },
                { id: 'spear', level: 1, quality: 'T1' },
            ],
            weaponSlots: 4,
        });

        // 找 plasma 索引
        const plasmaIdx = ShopSystem.items.findIndex(it => it.id === 'plasma');
        const result = ShopSystem.buyItem(plasmaIdx, player);
        expect(result).not.toBeNull();
        expect(result.action).toBe('merged');
        expect(player.weapons.length).toBe(4); // 数量不变
        const plasma = player.weapons.find(w => w.id === 'plasma');
        expect(plasma.level).toBe(2); // 升级
    });

    it('S35: 购买武器—槽满返回 null', () => {
        // Player has 4 unique weapons, filling all 4 slots.
        // Shop has 'rifle' which player doesn't own → should fail as slot-full.
        const player = makePlayer({
            weapons: [
                { id: 'axe', level: 1, quality: 'T1' },
                { id: 'hammer', level: 1, quality: 'T1' },
                { id: 'spear', level: 1, quality: 'T1' },
                { id: 'scythe', level: 1, quality: 'T1' },
            ],
            weaponSlots: 4,
        });

        // Need a shop weapon the player doesn't own.
        // Shop items[0] is plasma (player doesn't have → new weapon).
        // But let's add a different weapon to shop and try buying it.
        ShopSystem.items.push({
            id: 'rifle', type: 'weapon', name: '突击步枪',
            cost: 12, rarity: 'rare', rarityColor: '#4488ff',
            quality: 'T1', level: 1, tag: 'ranged', tags: ['ranged'],
            slots: 1, damageMult: 1.2, behavior: 'bullet',
        });

        const rifleIdx = ShopSystem.items.length - 1;
        const result = ShopSystem.buyItem(rifleIdx, player);
        expect(result).toBeNull();
        expect(player.weapons.length).toBe(4); // unchanged
    });

    it('S36: 购买道具—调用 ItemSystem', () => {
        const player = makePlayer();
        const hpBefore = player.maxHp;

        // Spy on ItemSystem.buyItem
        const spy = vi.spyOn(ItemSystem, 'buyItem');

        const result = ShopSystem.buyItem(2, player); // hpUp
        expect(result).not.toBeNull();
        expect(result.action).toBe('bought');
        expect(spy).toHaveBeenCalledWith('hpUp', player);
        expect(player.items.includes('hpUp')).toBe(true);

        spy.mockRestore();
    });

    it('S37: 购买 unique 道具加入 _boughtUniqueItems', () => {
        const player = makePlayer();
        expect(ShopSystem._boughtUniqueItems.includes('replicator')).toBe(false);

        const result = ShopSystem.buyItem(3, player); // replicator (unique)
        expect(result).not.toBeNull();
        expect(ShopSystem._boughtUniqueItems.includes('replicator')).toBe(true);
    });

    it('S38: 购买后商品从列表移除', () => {
        const player = makePlayer();
        const beforeCount = ShopSystem.items.length;

        ShopSystem.buyItem(2, player); // hpUp
        expect(ShopSystem.items.length).toBe(beforeCount - 1);
        expect(ShopSystem.items.find(it => it.id === 'hpUp')).toBeUndefined();
    });

    it('S39: 不能重复购买 unique 道具', () => {
        const player = makePlayer();

        // 第一次购买
        ShopSystem.buyItem(3, player); // replicator

        // 手动放回商品列表（模拟新生成后再次出现）
        ShopSystem.items.push({
            id: 'replicator', type: 'item', name: '子弹复制器',
            cost: 20, rarity: 'epic', unique: true, tags: ['ranged'],
        });

        const result = ShopSystem.buyItem(ShopSystem.items.length - 1, player);
        expect(result).toBeNull();
    });

    it('S40: 购买扣减材料', () => {
        const player = makePlayer({ materials: 50 });
        const cost = ShopSystem.items[2].cost; // hpUp cost=6

        ShopSystem.buyItem(2, player);
        expect(player.materials).toBe(50 - cost);
    });
});

describe('ShopSystem - 武器管理', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        ShopSystem.reset();
        global.DataLoader._cache = { weapons: MOCK_WEAPONS };
    });

    it('S41: getWeaponDef 有效查询', () => {
        const def = ShopSystem.getWeaponDef('plasma');
        expect(def).not.toBeNull();
        expect(def.id).toBe('plasma');
    });

    it('S42: getWeaponDef 不存在返回 null', () => {
        expect(ShopSystem.getWeaponDef('nonexistent')).toBeNull();
    });

    it('S43: mergeWeapons 相同 ID 合并', () => {
        const player = makePlayer({
            weapons: [
                { id: 'plasma', level: 1, quality: 'T1' },
                { id: 'plasma', level: 1, quality: 'T1' },
            ],
        });
        player.weaponParams = {};

        const result = ShopSystem.mergeWeapons(0, 1, player);
        expect(result).toBe(true);
        expect(player.weapons.length).toBe(1);
        expect(player.weapons[0].level).toBe(2);
    });

    it('S44: mergeWeapons 不同 ID 返回 false', () => {
        const player = makePlayer({
            weapons: [
                { id: 'plasma', level: 1, quality: 'T1' },
                { id: 'rifle', level: 1, quality: 'T1' },
            ],
        });

        expect(ShopSystem.mergeWeapons(0, 1, player)).toBe(false);
        expect(player.weapons.length).toBe(2);
    });

    it('S45: _updateWeaponParams 正确计算', () => {
        const player = makePlayer({
            weapons: [
                { id: 'plasma', level: 2, quality: 'T2' },
            ],
            weaponParams: {},
        });

        ShopSystem._updateWeaponParams(player, 'plasma');
        expect(player.weaponParams.plasma).toBeDefined();
        expect(player.weaponParams.plasma.damageMult).toBeGreaterThan(1.0);
        expect(player.weaponParams.plasma.behavior).toBe('melee_sweep');
        expect(player.weaponParams.plasma.level).toBe(2);
    });

    // === S46-S47: sellWeapon 出售武器 + 至少保留 1 把武器 安全检查 ===
    it('S46: sellWeapon 成功出售第 2 把武器,保留 1 把', () => {
        const player = makePlayer({
            weapons: [
                { id: 'plasma', level: 1, quality: 'T1' },
                { id: 'rifle', level: 1, quality: 'T1' },
            ],
            materials: 0,
        });
        player.weaponParams = {};
        // sellWeapon 通过 global PlayerSystem 拿 player
        global.PlayerSystem = { player };

        const result = ShopSystem.sellWeapon(1);
        expect(result).toBe(true);
        expect(player.weapons.length).toBe(1);
        expect(player.weapons[0].id).toBe('plasma');
        // 退款 = floor(cost/2)+1 = floor(12/2)+1 = 7
        expect(player.materials).toBe(7);

        delete global.PlayerSystem;
    });

    it('S47: sellWeapon 武器只剩 1 把时拒绝 (返回 false,保持 1 把)', () => {
        const player = makePlayer({
            weapons: [{ id: 'plasma', level: 1, quality: 'T1' }],
            materials: 0,
        });
        player.weaponParams = {};
        global.PlayerSystem = { player };

        const result = ShopSystem.sellWeapon(0);
        expect(result).toBe(false);
        expect(player.weapons.length).toBe(1);  // 仍保留 1 把
        expect(player.materials).toBe(0);       // 没有退款

        delete global.PlayerSystem;
    });
});

describe('ShopSystem - 重置', () => {
    beforeEach(() => {
        ShopSystem.reset();
    });

    it('S46: reset 清空商品', () => {
        ShopSystem.items = [{ id: 'test', type: 'weapon' }];
        ShopSystem.reset();
        expect(ShopSystem.items).toEqual([]);
    });

    it('S47: reset 重置 refreshCost', () => {
        ShopSystem.refreshCost = 999;
        ShopSystem.reset();
        expect(ShopSystem.refreshCost).toBe(2);
    });

    it('S48: reset 清空 _boughtUniqueItems', () => {
        ShopSystem._boughtUniqueItems = ['replicator', 'nirvana'];
        ShopSystem.reset();
        expect(ShopSystem._boughtUniqueItems).toEqual([]);
    });

    it('S49: reset 重置保底计数器', () => {
        ShopSystem._pity.weapons = { totalRolls: 50, sinceLastRare: 5, sinceLastEpic: 10, sinceLastLegendary: 15 };
        ShopSystem._pity.items = { totalRolls: 30, sinceLastRare: 3, sinceLastEpic: 8, sinceLastLegendary: 12 };
        ShopSystem.reset();

        expect(ShopSystem._pity.weapons).toEqual({ totalRolls: 0, sinceLastRare: 0, sinceLastEpic: 0, sinceLastLegendary: 0 });
        expect(ShopSystem._pity.items).toEqual({ totalRolls: 0, sinceLastRare: 0, sinceLastEpic: 0, sinceLastLegendary: 0 });
    });
});

describe('ShopSystem - 集成', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        ShopSystem.reset();
        setupItemSystem();
        global.DataLoader._cache = { weapons: MOCK_WEAPONS };
    });

    it('S50: 完整流程 — 生成 → 刷新 → 购买 → 重置', () => {
        const player = makePlayer({ materials: 100 });

        // 1. 生成
        ShopSystem.generateItems(player, 3);
        expect(ShopSystem.items.length).toBeGreaterThanOrEqual(2); // 2~3w + 0~1i
        expect(ShopSystem.items.length).toBeLessThanOrEqual(4);

        // 2. 刷新
        ShopSystem.reroll(player, 3);
        expect(ShopSystem.items.length).toBeGreaterThanOrEqual(2);

        // 3. 购买道具
        const itemIndex = ShopSystem.items.findIndex(it => it.type === 'item');
        if (itemIndex !== -1) {
            const preCount = ShopSystem.items.length;
            const result = ShopSystem.buyItem(itemIndex, player);
            expect(result).not.toBeNull();
            expect(ShopSystem.items.length).toBe(preCount - 1);
        }

        // 4. 重置
        ShopSystem.reset();
        expect(ShopSystem.items).toEqual([]);
        expect(ShopSystem.refreshCost).toBe(2);
    });

    it('S51: RARITY 定义完整', () => {
        const expectedKeys = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
        for (const key of expectedKeys) {
            const def = ShopSystem.RARITY[key];
            expect(def).toBeDefined();
            expect(def).toHaveProperty('name');
            expect(def).toHaveProperty('color');
            expect(def).toHaveProperty('weight');
            expect(def).toHaveProperty('minWave');
            expect(def).toHaveProperty('costMult');
            expect(def.weight).toBeGreaterThan(0);
            expect(def.costMult).toBeGreaterThan(0);
        }
    });

    it('S52: 保底计数器在多次生成后累计', () => {
        const player = makePlayer();

        // 多次生成，保底计数器应增加
        for (let i = 0; i < 5; i++) {
            ShopSystem.generateItems(player, 3 + i);
        }

        expect(ShopSystem._pity.weapons.totalRolls).toBeGreaterThanOrEqual(5);
        expect(ShopSystem._pity.items.totalRolls).toBeGreaterThanOrEqual(5);
    });
});

// ============================================================
// Bug1/Bug2 修复测试: 武器 tier-aware 解析 + 适配警告
// ============================================================
import { WeaponDisplay } from '../../src/cyberblade/weaponDisplay.js';

describe('WeaponDisplay - Bug1 tier + Bug2 适配判定', () => {
    test('Bug1 S53: getWeaponTierValue picks lv{minLevel}, not lv1', () => {
        // pike-like: minLevel=2, damage_lv1=0(占位), damage_lv2=35
        const pike = { id: 'pike', minLevel: 2, damage_lv1: 0, damage_lv2: 35, damage_lv3: 55, cooldown_lv1: 0.8, cooldown_lv2: 0.74, attackRange: 160 };
        expect(WeaponDisplay.getWeaponTierValue(pike, 'damage_lv1')).toBe(35);
        expect(WeaponDisplay.getWeaponTierValue(pike, 'cooldown_lv1')).toBe(0.74);

        // cavalry_lance-like: minLevel=3
        const cl = { id: 'cavalry_lance', minLevel: 3, damage_lv1: 0, damage_lv3: 95, cooldown_lv1: 1.1 };
        expect(WeaponDisplay.getWeaponTierValue(cl, 'damage_lv1')).toBe(95);

        // sword-like: minLevel=1, 正常
        const sword = { id: 'sword', minLevel: 1, damage_lv1: 12, damage_lv2: 18 };
        expect(WeaponDisplay.getWeaponTierValue(sword, 'damage_lv1')).toBe(12);

        // 防御: 非 tier 字段应原样读取
        expect(WeaponDisplay.getWeaponTierValue(pike, 'attackRange')).toBe(160);

        // 防御: null 武器/键 → 0
        expect(WeaponDisplay.getWeaponTierValue(null, 'damage_lv1')).toBe(0);
        expect(WeaponDisplay.getWeaponTierValue(pike, null)).toBe(0);
        expect(WeaponDisplay.getWeaponTierValue(pike, '')).toBe(0);

        // 防御: 无 minLevel (缺失字段) → 默认 1
        const noMin = { id: 'x', damage_lv1: 5 };
        expect(WeaponDisplay.getWeaponTierValue(noMin, 'damage_lv1')).toBe(5);

        // 防御: minLevel 越界 → 默认 1
        const bad = { id: 'x', minLevel: 9, damage_lv1: 7 };
        expect(WeaponDisplay.getWeaponTierValue(bad, 'damage_lv1')).toBe(7);
    });

    test('Bug1 S54: 真实数据中 5 把高解锁级武器详情可显示伤害', () => {
        // 验证真实 weapons.json 中受影响武器的 tier 跳转
        // 走 dataLoader 路径 (通过 ShopSystem.allWeapons 在 beforeAll 加载)
        const dataLoader = global.DataLoader;
        // shop.test.js 用 MOCK data, 这里直接 require 真实 JSON
        const fs = require('fs');
        const path = require('path');
        const realWeapons = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../src/data/weapons.json'), 'utf-8'));
        const affectedIds = ['magnum', 'minigun', 'void_staff', 'pike', 'cavalry_lance'];
        for (const id of affectedIds) {
            const w = realWeapons.find(x => x.id === id);
            expect(w).toBeDefined();
            const dmg = WeaponDisplay.getWeaponTierValue(w, 'damage_lv1');
            expect(dmg).toBeGreaterThan(0);
        }
    });

    test('Bug2 S55: isWeaponNotPreferred detects char+weapon mismatch', () => {
        // 刺客: 偏好 Blade/Precise + dagger/rapier...
        const assassin = { id: 'assassin', preferredClasses: ['Precise', 'Blade'], preferredClasses_2: ['dagger', 'rapier', 'kris', 'stiletto', 'composite'] };
        // 长枪: class=Heavy, class_2=pike → 不适配
        const pike = { id: 'pike', class: 'Heavy', class_2: 'pike' };
        expect(WeaponDisplay.isWeaponNotPreferred(pike, assassin)).toBe(true);

        // 圣骑士: 偏好 Blade+Medical+Heavy + lance/halberd
        const paladin = { id: 'paladin', preferredClasses: ['Blade', 'Medical', 'Heavy'], preferredClasses_2: ['longsword', 'holy', 'heal', 'lance', 'halberd'] };
        // cavalry_lance 真实数据: class=Heavy, class_2=lance
        const lance = { id: 'cavalry_lance', class: 'Heavy', class_2: 'lance' };
        expect(WeaponDisplay.isWeaponNotPreferred(lance, paladin)).toBe(false);

        // class 1 命中 (Blade 配 Blade)
        const dagger = { id: 'dagger', class: 'Blade', class_2: 'dagger' };
        expect(WeaponDisplay.isWeaponNotPreferred(dagger, assassin)).toBe(false);

        // 防御: 武器 class 缺失时应返回 false (不误报)
        expect(WeaponDisplay.isWeaponNotPreferred({ id: 'fake' }, assassin)).toBe(false);
        expect(WeaponDisplay.isWeaponNotPreferred(pike, null)).toBe(false);
        expect(WeaponDisplay.isWeaponNotPreferred(null, assassin)).toBe(false);
    });

    test('S56: getWeaponFitScore returns 0/0.5/1 (Report 3 progress bar)', () => {
        // 0/2 → 0 (红)
        const assassin = { id: 'assassin', preferredClasses: ['Precise', 'Blade'], preferredClasses_2: ['dagger', 'rapier', 'kris', 'stiletto', 'composite'] };
        const pike = { id: 'pike', class: 'Heavy', class_2: 'pike' };
        expect(WeaponDisplay.getWeaponFitScore(pike, assassin)).toBe(0);

        // 1/2 (class 命中) → 0.5 (黄)
        const sword = { id: 'sword', class: 'Blade', class_2: 'something_else' };
        expect(WeaponDisplay.getWeaponFitScore(sword, assassin)).toBe(0.5);

        // 2/2 → 1 (绿)
        const dagger = { id: 'dagger', class: 'Blade', class_2: 'dagger' };
        expect(WeaponDisplay.getWeaponFitScore(dagger, assassin)).toBe(1);

        // 1/2 (class_2 命中) → 0.5 (黄)
        const rapier = { id: 'rapier', class: 'Heavy', class_2: 'rapier' };  // 刺客 pref2 含 rapier, pref1 不含 Heavy
        expect(WeaponDisplay.getWeaponFitScore(rapier, assassin)).toBe(0.5);

        // 防御: class/class_2 缺失 → 0.5 (信息不足)
        const noInfo = { id: 'x' };
        expect(WeaponDisplay.getWeaponFitScore(noInfo, assassin)).toBe(0.5);

        // 防御: null → 0.5
        expect(WeaponDisplay.getWeaponFitScore(null, assassin)).toBe(0.5);
        expect(WeaponDisplay.getWeaponFitScore(pike, null)).toBe(0.5);
    });
});

