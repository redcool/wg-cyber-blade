// ============================================================
// loot.test.js — LootSystem 单元测试
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LootSystem } from '../../src/engine/loot.js';

// ============================================================
// Mock data
// ============================================================
const MOCK_WEAPONS = [
    { id: 'plasma', name: '等离子刀', tag: 'melee', cost: 10, damageMult: 1.5, slots: 1, behavior: 'melee_sweep', desc: '挥动180°', icon: '🗡️' },
    { id: 'rifle', name: '突击步枪', tag: 'ranged', cost: 12, damageMult: 1.2, slots: 1, behavior: 'bullet', desc: '连射', icon: '🔫' },
    { id: 'staff', name: '法杖', tag: 'fire', cost: 14, damageMult: 1.4, slots: 1, behavior: 'projectile', desc: '火球', icon: '🔮' },
];

const MOCK_ITEMS = [
    { id: 'hpUp', name: '生命核心', cost: 6, icon: '❤️', unique: false, rarity: 'common', tags: [], statMods: { maxHp: 30 } },
    { id: 'critUp', name: '暴击芯片', cost: 8, icon: '💥', unique: false, rarity: 'common', tags: ['crit'], statMods: { critChance: 0.04 } },
    { id: 'regen', name: '再生芯片', cost: 5, icon: '💚', unique: false, rarity: 'common', tags: [], statMods: { hpRegen: 1.0 } },
    { id: 'pierce_ring', name: '穿透戒指', cost: 12, icon: '➡️', unique: false, rarity: 'rare', tags: ['ranged'], statMods: { projectilePierce: 1 } },
    { id: 'replicator', name: '子弹复制器', cost: 14, icon: '🖨️', unique: true, rarity: 'epic', tags: ['ranged'], statMods: {} },
    { id: 'nirvana', name: '涅槃', cost: 50, icon: '🔥', unique: true, rarity: 'legendary', tags: ['fire'], statMods: { maxHp: 50 } },
];

// Mock DataLoader
global.DataLoader = {
    _cache: { weapons: MOCK_WEAPONS },
    async load(name) {
        if (name === 'weapons') return MOCK_WEAPONS;
        if (name === 'items') return MOCK_ITEMS;
        return [];
    },
};

// Mock TagSystem
global.TagSystem = {
    getAllTagIds: () => ['melee', 'ranged', 'fire', 'explosive', 'crit', 'tech', 'economy'],
    normalizeTag: (t) => t,
    getTags: (obj) => {
        if (!obj) return [];
        if (Array.isArray(obj.tags)) return obj.tags;
        if (typeof obj.tag === 'string') return [obj.tag];
        return [];
    },
    countWeaponTags: (weapons) => {
        const counts = { melee: 0, ranged: 0, fire: 0, explosive: 0, crit: 0, tech: 0, economy: 0 };
        for (const w of weapons || []) {
            if (counts[w.tag] !== undefined) counts[w.tag]++;
        }
        return counts;
    },
    countItemTags: (items) => {
        const counts = { melee: 0, ranged: 0, fire: 0, explosive: 0, crit: 0, tech: 0, economy: 0 };
        for (const item of items || []) {
            for (const t of (item.tags || [])) {
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
};

// Mock ItemSystem
global.ItemSystem = {
    allItems: MOCK_ITEMS,
    getItemDef: (id) => MOCK_ITEMS.find(i => i.id === id) || null,
    buyItem: vi.fn((id, player) => {
        const item = MOCK_ITEMS.find(i => i.id === id);
        if (!item) return false;
        if (item.statMods) {
            for (const [stat, value] of Object.entries(item.statMods)) {
                if (player[stat] !== undefined) player[stat] += value;
                else player[stat] = value;
            }
        }
        return true;
    }),
    hasItem: (id) => false,
};

// Mock ShopSystem
global.ShopSystem = {
    qualityDefs: { T1: { name: '普通', damageMult: 1.0, minWave: 1, rollWeight: 45, costMult: 1.0 } },
    biasedSelect: (pool, biasWeights) => {
        if (!pool || pool.length === 0) return null;
        // Weighted random selection similar to real implementation
        const weightedPool = pool.map(item => {
            const tags = TagSystem.getTags(item);
            let weight = 1.0;
            if (tags.length > 0 && biasWeights) {
                for (const tag of tags) {
                    if (biasWeights[tag] !== undefined) {
                        weight += (biasWeights[tag] - 1.0) / tags.length;
                    }
                }
            }
            return { item, weight: Math.max(0.01, weight) };
        });
        const total = weightedPool.reduce((s, w) => s + w.weight, 0);
        let r = Math.random() * total;
        for (const entry of weightedPool) {
            r -= entry.weight;
            if (r <= 0) return entry.item;
        }
        return weightedPool[weightedPool.length - 1].item;
    },
    _initWeaponAffixes: vi.fn(),
    _updateWeaponParams: vi.fn(),
};

function makePlayer(overrides) {
    return {
        weapons: [],
        items: [],
        materials: 0,
        weaponSlots: 4,
        maxHp: 100,
        hp: 100,
        armor: 0,
        ...overrides,
    };
}

// ============================================================
// Tests
// ============================================================

describe('LootSystem - 宝箱生成', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        LootSystem.reset();
    });

    it('LT1: spawnChest 创建宝箱并加入 pending', () => {
        const chest = LootSystem.spawnChest(100, 200, 'elite');
        expect(chest).toBeDefined();
        expect(chest.x).toBe(100);
        expect(chest.y).toBe(200);
        expect(chest.type).toBe('elite');
        expect(chest.alive).toBe(true);
        expect(LootSystem.pendingChests.length).toBe(1);
    });

    it('LT2: spawnChest 默认 type=normal', () => {
        LootSystem.spawnChest(0, 0);
        expect(LootSystem.pendingChests[0].type).toBe('normal');
    });

    it('LT3: 多个宝箱排队', () => {
        LootSystem.spawnChest(10, 20, 'normal');
        LootSystem.spawnChest(30, 40, 'elite');
        LootSystem.spawnChest(50, 60, 'legendary');
        expect(LootSystem.pendingChests.length).toBe(3);
    });

    it('LT4: pickupChest 标记宝箱为不可用', () => {
        const chest = LootSystem.spawnChest(100, 200, 'elite');
        const player = makePlayer();
        LootSystem.pickupChest(chest, player);
        expect(chest.alive).toBe(false);
    });

    it('LT5: pickupChest 生成奖励', () => {
        const chest = LootSystem.spawnChest(100, 200, 'elite');
        const player = makePlayer();

        LootSystem.pickupChest(chest, player);
        expect(LootSystem.currentRewards.length).toBeGreaterThanOrEqual(2);
        expect(LootSystem.currentRewards.length).toBeLessThanOrEqual(3);
    });
});

describe('LootSystem - 奖励生成', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        LootSystem.reset();
    });

    it('LT6: generateRewards 返回正确数量的选项', () => {
        const player = makePlayer();
        const elite = LootSystem.generateRewards('elite', player);
        expect(elite.length).toBe(3);

        const normal = LootSystem.generateRewards('normal', player);
        expect(normal.length).toBe(2);

        const legendary = LootSystem.generateRewards('legendary', player);
        expect(legendary.length).toBe(3);
    });

    it('LT7: 未知 chestType 返回空数组', () => {
        const player = makePlayer();
        expect(LootSystem.generateRewards('unknown', player)).toEqual([]);
    });

    it('LT8: 奖励选项有正确结构', () => {
        const player = makePlayer();
        const rewards = LootSystem.generateRewards('elite', player);

        for (const reward of rewards) {
            expect(reward).toHaveProperty('type');
            expect(reward).toHaveProperty('id');
            expect(reward).toHaveProperty('rarity');
            expect(reward).toHaveProperty('rarityColor');
            expect(['item', 'weapon', 'gold']).toContain(reward.type);

            if (reward.type === 'gold') {
                expect(reward).toHaveProperty('goldAmount');
                expect(reward.goldAmount).toBeGreaterThan(0);
            } else {
                expect(reward).toHaveProperty('name');
            }
        }
    });

    it('LT9: 金币选项 goldAmount 在 range 内', () => {
        const player = makePlayer();
        // 多次生成精英宝箱验证金币范围
        for (let i = 0; i < 50; i++) {
            const rewards = LootSystem.generateRewards('elite', player);
            for (const r of rewards) {
                if (r.type === 'gold') {
                    expect(r.goldAmount).toBeGreaterThanOrEqual(25);
                    expect(r.goldAmount).toBeLessThanOrEqual(50);
                }
            }
        }
    });

    it('LT10: 稀有度颜色映射正确', () => {
        const player = makePlayer();
        // common #aaaaaa, rare #4488ff, epic #aa44ff, legendary #ff6600
        const rewards = LootSystem.generateRewards('legendary', player);
        for (const r of rewards) {
            const colorMap = { common: '#aaaaaa', rare: '#4488ff', epic: '#aa44ff', legendary: '#ff6600' };
            if (r.type !== 'gold') {
                expect(r.rarityColor).toBe(colorMap[r.rarity]);
            }
        }
    });
});

describe('LootSystem - 选择奖励', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        LootSystem.reset();
    });

    it('LT11: selectReward 道具 — 属性生效', () => {
        const player = makePlayer({ maxHp: 100 });
        // 预设奖励为道具
        LootSystem.currentRewards = [
            { type: 'item', id: 'hpUp', name: '生命核心', rarity: 'common', rarityColor: '#aaaaaa', tags: [], desc: 'hp+30' },
        ];

        LootSystem.selectReward(0, player);
        expect(player.maxHp).toBe(130); // base 100 + 30
        expect(player.items.includes('hpUp')).toBe(true);
    });

    it('LT12: selectReward 武器 — 加入武器槽', () => {
        const player = makePlayer();
        LootSystem.currentRewards = [
            { type: 'weapon', id: 'plasma', name: '等离子刀', rarity: 'rare', rarityColor: '#4488ff', tags: ['melee'], quality: 'T1' },
        ];

        LootSystem.selectReward(0, player);
        expect(player.weapons.length).toBe(1);
        expect(player.weapons[0].id).toBe('plasma');
        expect(player.weapons[0].level).toBe(1);

        // 验证调用 ShopSystem 方法初始化词条和参数
        expect(global.ShopSystem._initWeaponAffixes).toHaveBeenCalled();
        expect(global.ShopSystem._updateWeaponParams).toHaveBeenCalled();
    });

    it('LT13: selectReward 金币 — 增加 materials', () => {
        const player = makePlayer({ materials: 10 });
        LootSystem.currentRewards = [
            { type: 'gold', id: 'gold', name: '30 金币', rarity: 'common', rarityColor: '#ffd700', goldAmount: 30 },
        ];

        LootSystem.selectReward(0, player);
        expect(player.materials).toBe(40);
    });

    it('LT14: selectReward 无效索引返回 null', () => {
        const player = makePlayer();
        LootSystem.currentRewards = [
            { type: 'gold', id: 'gold', goldAmount: 10 },
        ];
        expect(LootSystem.selectReward(-1, player)).toBeNull();
        expect(LootSystem.selectReward(5, player)).toBeNull();
    });

    it('LT15: selectReward 无 player 返回 null', () => {
        LootSystem.currentRewards = [
            { type: 'gold', id: 'gold', goldAmount: 10 },
        ];
        expect(LootSystem.selectReward(0, null)).toBeNull();
    });

    it('LT16: 选择后清空 currentRewards', () => {
        const player = makePlayer({ materials: 10 });
        LootSystem.currentRewards = [
            { type: 'gold', id: 'gold', goldAmount: 30 },
        ];

        LootSystem.selectReward(0, player);
        expect(LootSystem.currentRewards).toEqual([]);
    });

    it('LT17: 选择后移除 pendingChests 中的对应宝箱', () => {
        const player = makePlayer({ materials: 100 });

        // 手动设置状态：宝箱已拾取，奖励已就绪
        LootSystem.pendingChests = [
            { x: 100, y: 200, type: 'elite', alive: false },
        ];
        LootSystem.currentRewards = [
            { type: 'gold', id: 'gold', name: '30 金币', rarity: 'common', rarityColor: '#ffd700', goldAmount: 30 },
        ];

        expect(LootSystem.pendingChests.length).toBe(1);
        LootSystem.selectReward(0, player);

        // selectReward 移除 dead chest
        expect(LootSystem.pendingChests.length).toBe(0);
    });
});

describe('LootSystem - 队列与查询', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        LootSystem.reset();
    });

    it('LT18: hasPendingChests 检查存活宝箱', () => {
        expect(LootSystem.hasPendingChests()).toBe(false);

        LootSystem.spawnChest(100, 200, 'elite');
        expect(LootSystem.hasPendingChests()).toBe(true);
    });

    it('LT19: 拾取后宝箱不再算 pending', () => {
        const chest = LootSystem.spawnChest(100, 200, 'elite');
        const player = makePlayer();

        expect(LootSystem.hasPendingChests()).toBe(true);
        LootSystem.pickupChest(chest, player);
        // alive=false, but still in pendingChests array
        // hasPendingChests checks for alive chests
        expect(LootSystem.hasPendingChests()).toBe(false);
    });

    it('LT20: getCurrentRewards 返回当前奖励', () => {
        const player = makePlayer();
        const chest = LootSystem.spawnChest(0, 0, 'elite');

        expect(LootSystem.getCurrentRewards()).toEqual([]);
        LootSystem.pickupChest(chest, player);
        expect(LootSystem.getCurrentRewards().length).toBeGreaterThan(0);
    });

    it('LT21: 拾取未存活的宝箱无效果', () => {
        const player = makePlayer();
        const chest = LootSystem.spawnChest(0, 0, 'elite');
        chest.alive = false;

        LootSystem.pickupChest(chest, player);
        expect(LootSystem.currentRewards).toEqual([]);
    });
});

describe('LootSystem - 重置', () => {
    it('LT22: reset 清空所有状态', () => {
        LootSystem.spawnChest(0, 0, 'elite');
        LootSystem.spawnChest(10, 20, 'legendary');
        LootSystem.currentRewards = [{ type: 'gold', id: 'gold', goldAmount: 10 }];

        LootSystem.reset();
        expect(LootSystem.pendingChests).toEqual([]);
        expect(LootSystem.currentRewards).toEqual([]);
    });
});
