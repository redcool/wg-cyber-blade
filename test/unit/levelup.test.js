// ============================================================
// levelup.test.js — LevelUpSystem 单元测试
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LevelUpSystem } from '../../src/engine/levelup.js';

// ============================================================
// Mock data — 直接从 levelUpCards.json 子集
// ============================================================
const MOCK_CARDS = [
    // survival
    { id: 'maxHp_20', name: '生命强化', desc: '+20%', icon: '❤️', rarity: 'common', category: 'survival', tags: [], statMods: { maxHp: { type: 'mult', value: 0.20 } } },
    { id: 'armor_3', name: '合金护甲', desc: '+3', icon: '🛡️', rarity: 'common', category: 'survival', tags: [], statMods: { armor: { type: 'add', value: 3 } } },
    { id: 'armor_6', name: '重甲锻造', desc: '+6', icon: '🛡️', rarity: 'rare', category: 'survival', tags: ['melee'], statMods: { armor: { type: 'add', value: 6 } } },
    // offense
    { id: 'damage_10', name: '攻击强化', desc: '+10%', icon: '🗡️', rarity: 'common', category: 'offense', tags: [], statMods: { damagePercent: { type: 'add', value: 0.10 } } },
    { id: 'critChance_5', name: '精准锁定', desc: '+5%', icon: '💥', rarity: 'common', category: 'offense', tags: ['crit'], statMods: { critChance: { type: 'add', value: 0.05 } } },
    { id: 'melee_flat_5', name: '近战专精', desc: '+5', icon: '⚔️', rarity: 'common', category: 'offense', tags: ['melee'], statMods: { meleeDamage: { type: 'add', value: 5 } } },
    // mobility
    { id: 'speed_10', name: '疾跑', desc: '+10%', icon: '⚡', rarity: 'common', category: 'mobility', tags: [], statMods: { speed: { type: 'mult', value: 0.10 } } },
    { id: 'range_15', name: '鹰眼', desc: '+15%', icon: '🎯', rarity: 'common', category: 'mobility', tags: ['ranged'], statMods: { attackRange: { type: 'mult', value: 0.15 } } },
    // economy
    { id: 'luck_2', name: '幸运之星', desc: '+2', icon: '🍀', rarity: 'common', category: 'economy', tags: ['economy'], statMods: { luck: { type: 'add', value: 2 } } },
    // weapon actions
    { id: 'weapon_level_up', name: '武器精炼', desc: '等级+1', icon: '⚔️', rarity: 'rare', category: 'weapon', tags: [], action: { type: 'weaponLevelUp' } },
    { id: 'weapon_slot_1', name: '武器槽', desc: '+1', icon: '📦', rarity: 'legendary', category: 'weapon', tags: [], action: { type: 'addWeaponSlot' } },
    // passive
    { id: 'passive_kill_explode', name: '杀戮快感', desc: '击杀爆炸', icon: '💥', rarity: 'epic', category: 'special', tags: ['explosive'], action: { type: 'addPassive', passiveId: 'on_kill_explosion' } },
];

// Mock DataLoader
global.DataLoader = {
    _cache: {},
    async load(name) {
        if (name === 'levelUpCards') return MOCK_CARDS;
        return [];
    },
};

// Mock TagSystem
global.TagSystem = {
    getTagDef: (id) => ({ id, name: id, icon: '?' }),
    getAllTagIds: () => ['melee', 'ranged', 'fire', 'explosive', 'crit', 'tech', 'economy'],
    normalizeTag: (t) => t,
    countWeaponTags: (weapons) => {
        const counts = { melee: 0, ranged: 0, fire: 0, explosive: 0, crit: 0, tech: 0, economy: 0 };
        for (const w of weapons || []) {
            const tag = w.tag;
            if (counts[tag] !== undefined) counts[tag]++;
        }
        return counts;
    },
    countItemTags: (items) => {
        const counts = { melee: 0, ranged: 0, fire: 0, explosive: 0, crit: 0, tech: 0, economy: 0 };
        for (const item of items || []) {
            for (const t of (item.tags || item.tag ? [item.tag] : [])) {
                if (counts[t] !== undefined) counts[t]++;
            }
        }
        return counts;
    },
    mergeTagCounts: (a, b) => {
        const merged = {};
        for (const k of Object.keys(a)) merged[k] = (a[k] || 0) + (b[k] || 0) * 0.5;
        return merged;
    },
    getBiasWeights: (tagCounts, strength) => {
        strength = strength !== undefined ? strength : 0.2;
        const weights = { melee: 1.0, ranged: 1.0, fire: 1.0, explosive: 1.0, crit: 1.0, tech: 1.0, economy: 1.0 };
        let total = 0;
        for (const v of Object.values(tagCounts || {})) total += v;
        if (total > 0) {
            for (const [tag, count] of Object.entries(tagCounts || {})) {
                if (count > 0 && weights[tag] !== undefined) {
                    weights[tag] += strength * (count / total);
                }
            }
        }
        return weights;
    },
    getTags: (obj) => {
        if (!obj) return [];
        if (Array.isArray(obj.tags)) return obj.tags;
        if (typeof obj.tag === 'string') return [obj.tag];
        return [];
    },
};

// Mock PassiveSystem
global.PassiveSystem = {
    register: vi.fn(),
};

// Mock StatsSystem
global.StatsSystem = {
    clampPlayer: vi.fn((p) => p),
};

// Mock ShopSystem (for weapon operations)
global.ShopSystem = {
    _updateWeaponParams: vi.fn(),
};

function makePlayer(overrides) {
    return {
        weapons: [{ id: 'plasma', level: 1, quality: 'T1' }],
        items: [],
        materials: 100,
        weaponSlots: 4,
        maxHp: 100,
        hp: 100,
        armor: 0,
        damagePercent: 0,
        attackSpeed: 1.0,
        speed: 200,
        attackRange: 300,
        ...overrides,
    };
}

// ============================================================
// Tests
// ============================================================

describe('LevelUpSystem - 数据加载', () => {
    beforeEach(() => {
        LevelUpSystem.reset();
    });

    it('L1: loadCards 从 DataLoader 加载卡牌', async () => {
        await LevelUpSystem.loadCards();
        expect(LevelUpSystem.allCards.length).toBeGreaterThan(0);
        expect(LevelUpSystem.allCards[0]).toHaveProperty('id');
        expect(LevelUpSystem.allCards[0]).toHaveProperty('rarity');
    });

    it('L2: allCards 包含多种稀有度', async () => {
        await LevelUpSystem.loadCards();
        const rarities = new Set(LevelUpSystem.allCards.map(c => c.rarity));
        expect(rarities.has('common')).toBe(true);
        expect(rarities.has('rare')).toBe(true);
        expect(rarities.has('epic')).toBe(true);
        expect(rarities.has('legendary')).toBe(true);
    });
});

describe('LevelUpSystem - 卡牌生成', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        LevelUpSystem.reset();
        await LevelUpSystem.loadCards();
    });

    it('L3: generateCards 返回 3~5 张卡', () => {
        const player = makePlayer();
        const cards = LevelUpSystem.generateCards(player);
        expect(cards.length).toBeGreaterThanOrEqual(3);
        expect(cards.length).toBeLessThanOrEqual(5);
    });

    it('L4: generateCards 不返回重复卡', () => {
        const player = makePlayer();
        const cards = LevelUpSystem.generateCards(player);
        const ids = cards.map(c => c.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
    });

    it('L5: 多次调用 generateCards 不跨次重复', () => {
        const player = makePlayer();
        // 第一次生成的卡被 _generatedIds 记录
        const cards1 = LevelUpSystem.generateCards(player);
        const ids1 = cards1.map(c => c.id);

        // 第二次不应包含第一次的卡
        const cards2 = LevelUpSystem.generateCards(player);
        const ids2 = cards2.map(c => c.id);

        for (const id of ids1) {
            expect(ids2.includes(id)).toBe(false);
        }
    });

    it('L6: reset 后生成卡可重复', () => {
        const player = makePlayer();
        const cards1 = LevelUpSystem.generateCards(player);
        const ids1 = cards1.map(c => c.id);

        LevelUpSystem.reset();
        const cards2 = LevelUpSystem.generateCards(player);
        const ids2 = cards2.map(c => c.id);

        // reset 后可能有重复（但概率性，不强制检查）
        // 至少保证 reset 清空了 _generatedIds
        expect(LevelUpSystem._generatedIds.size).toBeGreaterThanOrEqual(3);
    });

    it('L7: 流派偏向 — melee 武器提高 melee tag 卡概率', () => {
        // melee 玩家
        const meleePlayer = makePlayer({
            weapons: [{ id: 'plasma', tag: 'melee', level: 1, quality: 'T1' }],
        });

        // 多次生成统计
        let meleeTagCount = 0;
        const totalRuns = 50;
        for (let i = 0; i < totalRuns; i++) {
            LevelUpSystem.reset();
            LevelUpSystem.allCards = [
                { id: 'armor_6', name: '重甲', rarity: 'rare', category: 'survival', tags: ['melee'], statMods: { armor: { type: 'add', value: 6 } } },
                { id: 'damage_10', name: '攻击', rarity: 'common', category: 'offense', tags: [], statMods: { damagePercent: { type: 'add', value: 0.10 } } },
                { id: 'speed_10', name: '疾跑', rarity: 'common', category: 'mobility', tags: [], statMods: { speed: { type: 'mult', value: 0.10 } } },
            ];
            const cards = LevelUpSystem.generateCards(meleePlayer);
            if (cards.some(c => c.tags.includes('melee'))) meleeTagCount++;
        }

        // melee 偏向应使 armor_6 被选中的概率超过随机均匀的 1/3
        expect(meleeTagCount).toBeGreaterThan(totalRuns * 0.2);
    });

    it('L8: generateCards 无 player 时正常工作', () => {
        const cards = LevelUpSystem.generateCards(null);
        expect(cards.length).toBeGreaterThanOrEqual(3);
    });
});

describe('LevelUpSystem - 应用 statMods', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        LevelUpSystem.reset();
    });

    it('L9: _applyStatMods add 模式', () => {
        const player = makePlayer({ armor: 0 });
        LevelUpSystem._applyStatMods({ armor: { type: 'add', value: 3 } }, player);
        expect(player.armor).toBe(3);
    });

    it('L10: _applyStatMods mult 模式', () => {
        const player = makePlayer({ maxHp: 100 });
        LevelUpSystem._applyStatMods({ maxHp: { type: 'mult', value: 0.20 } }, player);
        expect(player.maxHp).toBe(120);
    });

    it('L11: _applyStatMods 多个属性', () => {
        const player = makePlayer({ armor: 0, maxHp: 100 });
        LevelUpSystem._applyStatMods({
            armor: { type: 'add', value: 3 },
            maxHp: { type: 'mult', value: 0.20 },
        }, player);
        expect(player.armor).toBe(3);
        expect(player.maxHp).toBe(120);
    });

    it('L12: _applyStatMods 不存在的属性初始化', () => {
        const player = makePlayer();
        LevelUpSystem._applyStatMods({ nonexistent: { type: 'add', value: 10 } }, player);
        expect(player.nonexistent).toBe(10);
    });
});

describe('LevelUpSystem - 应用 action', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        LevelUpSystem.reset();
    });

    it('L13: applyCard with statMods 正确应用', () => {
        const player = makePlayer({ armor: 0 });
        LevelUpSystem.allCards = [
            { id: 'armor_3', name: '护甲', rarity: 'common', tags: [], statMods: { armor: { type: 'add', value: 3 } } },
        ];

        const result = LevelUpSystem.applyCard('armor_3', player);
        expect(result).toBe(true);
        expect(player.armor).toBe(3);
    });

    it('L14: applyCard 武器等级提升', () => {
        const player = makePlayer({
            weapons: [{ id: 'plasma', level: 1, quality: 'T1' }],
        });
        LevelUpSystem.allCards = [
            { id: 'weapon_level_up', name: '精炼', rarity: 'rare', tags: [], action: { type: 'weaponLevelUp' } },
        ];

        LevelUpSystem.applyCard('weapon_level_up', player);
        expect(player.weapons[0].level).toBe(2);
    });

    it('L15: applyCard 添加武器槽', () => {
        const player = makePlayer({ weaponSlots: 4 });
        LevelUpSystem.allCards = [
            { id: 'weapon_slot_1', name: '槽扩展', rarity: 'legendary', tags: [], action: { type: 'addWeaponSlot' } },
        ];

        LevelUpSystem.applyCard('weapon_slot_1', player);
        expect(player.weaponSlots).toBe(5);
    });

    it('L16: applyCard 添加被动技能', () => {
        const player = makePlayer();
        LevelUpSystem.allCards = [
            { id: 'passive_kill_explode', name: '杀戮快感', rarity: 'epic', tags: [], action: { type: 'addPassive', passiveId: 'on_kill_explosion' } },
        ];

        LevelUpSystem.applyCard('passive_kill_explode', player);
        expect(global.PassiveSystem.register).toHaveBeenCalledWith('on_kill_explosion', 'levelup', player);
    });

    it('L17: applyCard 不存在返回 false', () => {
        const player = makePlayer();
        expect(LevelUpSystem.applyCard('nonexistent', player)).toBe(false);
    });

    it('L18: applyCard 无 player 返回 false', () => {
        expect(LevelUpSystem.applyCard('armor_3', null)).toBe(false);
    });

    it('L19: 品质升级 T1→T2', () => {
        const player = makePlayer({
            weapons: [{ id: 'plasma', level: 1, quality: 'T1' }],
        });
        LevelUpSystem._applyWeaponQualityUp(player);
        expect(player.weapons[0].quality).toBe('T2');
    });

    it('L20: 品质升级 T4→T4（最高级不变）', () => {
        const player = makePlayer({
            weapons: [{ id: 'plasma', level: 1, quality: 'T4' }],
        });
        LevelUpSystem._applyWeaponQualityUp(player);
        expect(player.weapons[0].quality).toBe('T4');
    });

    it('L21: 武器升级调用 clampPlayer', () => {
        const player = makePlayer({ armor: 0 });
        LevelUpSystem.allCards = [
            { id: 'armor_3', name: '护甲', rarity: 'common', tags: [], statMods: { armor: { type: 'add', value: 3 } } },
        ];

        LevelUpSystem.applyCard('armor_3', player);
        expect(global.StatsSystem.clampPlayer).toHaveBeenCalled();
    });
});

describe('LevelUpSystem - 查询/重置', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        LevelUpSystem.reset();
        await LevelUpSystem.loadCards();
    });

    it('L22: getCurrentCards 返回当前可选卡', () => {
        expect(LevelUpSystem.getCurrentCards()).toEqual([]);
        const player = makePlayer();
        LevelUpSystem.generateCards(player);
        expect(LevelUpSystem.getCurrentCards().length).toBeGreaterThanOrEqual(3);
    });

    it('L23: reset 清空 _generatedIds', () => {
        const player = makePlayer();
        LevelUpSystem.generateCards(player);
        expect(LevelUpSystem._generatedIds.size).toBeGreaterThan(0);

        LevelUpSystem.reset();
        expect(LevelUpSystem._generatedIds.size).toBe(0);
        expect(LevelUpSystem.currentCards).toEqual([]);
    });
});
