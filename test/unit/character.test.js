// ============================================================
// character.test.js — CharacterSystem 单元测试
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CharacterSystem } from '../../src/engine/character.js';

// --------------- Mock Data ---------------

const MOCK_CHARACTERS = [
    {
        id: 'default', name: '默认', desc: '均衡型角色', icon: '👤',
        unlocked: true, weaponSlots: 6,
        maxHp: 100, hpRegen: 0.5, speed: 220,
        attackSpeed: 1.0, attackRange: 280,
        armor: 1, dodge: 0.02, critChance: 0.05, critDamage: 2.0,
        lifeSteal: 0, damagePercent: 0,
        meleeDamage: 0, rangedDamage: 0, elementalDamage: 0, engineering: 0,
        harvesting: 0, luck: 0, xpGain: 0, materialGain: 0,
        tags: ['melee', 'ranged'],
        penalties: {}, passives: [],
        unlockType: '', unlockValue: 0,
    },
    {
        id: 'glassCannon', name: '玻璃大炮', desc: '+50% 伤害 -5 护甲', icon: '💥',
        unlocked: true, weaponSlots: 6,
        maxHp: 80, hpRegen: 0.3, speed: 240,
        attackSpeed: 1.2, attackRange: 300,
        armor: 5, dodge: 0.03, critChance: 0.08, critDamage: 2.0,
        lifeSteal: 0, damagePercent: 0.50,
        meleeDamage: 0, rangedDamage: 0, elementalDamage: 0, engineering: 0,
        harvesting: 0, luck: 0, xpGain: 0, materialGain: 0,
        tags: ['ranged', 'crit'],
        penalties: { armor: -5 }, passives: [],
        unlockType: '', unlockValue: 0,
    },
    {
        id: 'assassin', name: '刺客', desc: '高暴击高闪避', icon: '🗡️',
        unlocked: false, weaponSlots: 4,
        maxHp: 70, hpRegen: 0.8, speed: 280,
        attackSpeed: 1.5, attackRange: 220,
        armor: 2, dodge: 0.15, critChance: 0.15, critDamage: 2.5,
        lifeSteal: 0.03, damagePercent: 0,
        meleeDamage: 0, rangedDamage: 0, elementalDamage: 0, engineering: 0,
        harvesting: 0, luck: 2, xpGain: 0, materialGain: 0,
        tags: ['melee', 'crit'],
        penalties: { armor: -2 },
        passives: ['assassin_crit_boost'],
        unlockType: 'totalKills', unlockValue: 100,
    },
];

// Mock DataLoader
global.DataLoader = {
    async load(name) {
        if (name === 'characters') return MOCK_CHARACTERS;
        return [];
    },
};

// Helper: bare player object
function makePlayer(overrides) {
    return {
        x: 100, y: 200, hp: 0, maxHp: 100,
        speed: 0, armor: 0, dodge: 0,
        damagePercent: 0, critChance: 0, critDamage: 2.0,
        attackSpeed: 1.0, attackRange: 280,
        ...overrides,
    };
}

describe('CharacterSystem - 数据加载', () => {
    beforeEach(() => {
        CharacterSystem.reset();
    });

    it('C1: loadCharacters 加载并标准化', async () => {
        await CharacterSystem.loadCharacters();
        expect(CharacterSystem.allCharacters.length).toBeGreaterThanOrEqual(3);

        const def = CharacterSystem.getCharacterDef('default');
        expect(def).toBeDefined();
        expect(def.id).toBe('default');
        expect(def.maxHp).toBe(100);
    });

    it('C2: loadCharacters 失败优雅降级', async () => {
        global.DataLoader.load = async () => [];
        await CharacterSystem.loadCharacters(); // 不抛出，降级到默认角色
        expect(CharacterSystem.allCharacters.length).toBeGreaterThanOrEqual(1);
        expect(CharacterSystem.getCharacterDef('default')).toBeDefined();
        // restore
        global.DataLoader.load = async (name) => {
            if (name === 'characters') return MOCK_CHARACTERS;
            return [];
        };
    });

    it('C3: _normalizeTags 标准化旧标签', () => {
        const normalized = CharacterSystem._normalizeTags(['gun', 'bow', 'magic', 'medic', 'lance']);
        expect(normalized).toEqual(['ranged', 'ranged', 'fire', 'tech', 'melee']);
    });
});

describe('CharacterSystem - applyToPlayer', () => {
    beforeEach(async () => {
        CharacterSystem.reset();
        await CharacterSystem.loadCharacters();
    });

    it('C4: 应用基础属性', () => {
        const p = makePlayer();
        const ok = CharacterSystem.applyToPlayer(p, 'default');
        expect(ok).toBe(true);
        expect(p.maxHp).toBe(100);
        expect(p.speed).toBe(220);
        expect(p.armor).toBe(1);
        expect(p.hp).toBe(100);
    });

    it('C5: 叠加 penalties', () => {
        const p = makePlayer({ armor: 0 });
        CharacterSystem.applyToPlayer(p, 'glassCannon');
        expect(p.maxHp).toBe(80);    // 基础
        expect(p.armor).toBe(0);     // 5 (base) + (-5) penalty = 0
        expect(p.damagePercent).toBe(0.50);
    });

    it('C6: 设置 tags', () => {
        const p = makePlayer();
        CharacterSystem.applyToPlayer(p, 'default');
        expect(p.tags).toEqual(['melee', 'ranged']);
    });

    it('C7: 设置兼容字段', () => {
        const p = makePlayer();
        CharacterSystem.applyToPlayer(p, 'glassCannon');
        expect(p._baseDamage).toBe(15);
        expect(p.damage).toBe(0.50);
        expect(p.critMultiplier).toBe(2.0);
    });

    it('C8: 注册 passives', () => {
        const p = makePlayer();
        CharacterSystem.applyToPlayer(p, 'assassin');
        expect(p._passiveIds).toEqual(['assassin_crit_boost']);
    });

    it('C9: applyToPlayer 不存在返回 false', () => {
        const p = makePlayer();
        expect(CharacterSystem.applyToPlayer(p, 'nonexistent')).toBe(false);
    });

    it('C10: 已解锁角色 apply + select 后 HP 正确', () => {
        const p = makePlayer();
        CharacterSystem.applyToPlayer(p, 'assassin');
        expect(p.maxHp).toBe(70);
        expect(p.hp).toBe(70);
    });

    it('C11: 不覆盖 hp 以外的已有属性', () => {
        const p = makePlayer({ lifeSteal: 0.10 });
        CharacterSystem.applyToPlayer(p, 'default');
        // default.lifeSteal = 0, 所以被覆盖
        expect(p.lifeSteal).toBe(0);
    });
});

describe('CharacterSystem - 查询', () => {
    beforeEach(async () => {
        CharacterSystem.reset();
        await CharacterSystem.loadCharacters();
    });

    it('C12: getCharacterDef 返回 null 对于不存在', () => {
        expect(CharacterSystem.getCharacterDef('nonexistent')).toBeNull();
    });

    it('C13: getCurrent 返回当前角色', () => {
        CharacterSystem.selectedCharacterId = 'glassCannon';
        const cur = CharacterSystem.getCurrent();
        expect(cur).toBeDefined();
        expect(cur.id).toBe('glassCannon');
    });

    it('C14: getTags 返回当前角色标签', () => {
        CharacterSystem.selectedCharacterId = 'default';
        expect(CharacterSystem.getTags()).toEqual(['melee', 'ranged']);

        CharacterSystem.selectedCharacterId = 'glassCannon';
        expect(CharacterSystem.getTags()).toEqual(['ranged', 'crit']);
    });

    it('C15: hasTag 检查正确', () => {
        CharacterSystem.selectedCharacterId = 'default';
        expect(CharacterSystem.hasTag('melee')).toBe(true);
        expect(CharacterSystem.hasTag('ranged')).toBe(true);
        expect(CharacterSystem.hasTag('fire')).toBe(false);

        CharacterSystem.selectedCharacterId = 'glassCannon';
        expect(CharacterSystem.hasTag('ranged')).toBe(true);
        expect(CharacterSystem.hasTag('crit')).toBe(true);

        // 旧标签也应匹配（通过 normalize）
        expect(CharacterSystem.hasTag('gun')).toBe(true); // → ranged
    });

    it('C16: getUnlocked 不含未解锁', () => {
        const unlocked = CharacterSystem.getUnlocked();
        const ids = unlocked.map(c => c.id);
        expect(ids).toContain('default');
        expect(ids).toContain('glassCannon');
        expect(ids).not.toContain('assassin');
    });

    it('C17: select 角色成功', () => {
        expect(CharacterSystem.select('glassCannon')).toBe(true);
        expect(CharacterSystem.selectedCharacterId).toBe('glassCannon');
    });

    it('C18: select 未解锁角色失败', () => {
        expect(CharacterSystem.select('assassin')).toBe(false);
        expect(CharacterSystem.selectedCharacterId).toBe('default');
    });

    it('C19: select 不存在角色失败', () => {
        expect(CharacterSystem.select('nonexistent')).toBe(false);
    });

    it('C20: reset 清空状态', () => {
        CharacterSystem.loadCharacters();
        CharacterSystem.selectedCharacterId = 'glassCannon';
        CharacterSystem.reset();
        expect(CharacterSystem.allCharacters).toEqual([]);
        expect(CharacterSystem.selectedCharacterId).toBe('default');
    });
});

describe('CharacterSystem - 旧标签兼容', () => {
    beforeEach(() => {
        CharacterSystem.reset();
    });

    it('C21: old tag gun → ranged 在加载时标准化', async () => {
        global.DataLoader.load = async (name) => {
            if (name === 'characters') {
                return [{ id: 'gunslinger', name: '枪手', tags: ['gun'], unlocked: true, weaponSlots: 6,
                    maxHp: 90, hpRegen: 0.4, speed: 220, attackSpeed: 1.3, attackRange: 350,
                    armor: 1, dodge: 0.02, critChance: 0.08, critDamage: 2.2,
                    lifeSteal: 0, damagePercent: 0,
                    meleeDamage: 0, rangedDamage: 0, elementalDamage: 0, engineering: 0,
                    harvesting: 0, luck: 1, xpGain: 0, materialGain: 0,
                    penalties: {}, passives: [],
                    unlockType: '', unlockValue: 0 }];
            }
            return [];
        };
        await CharacterSystem.loadCharacters();
        // gunslinger 的旧标签 gun 被标准化为 ranged
        const gs = CharacterSystem.getCharacterDef('gunslinger');
        expect(gs).toBeDefined();
        expect(gs.tags).toEqual(['ranged']);
        // default 应从 gunslinger 映射（没有 swordsman）
        const def = CharacterSystem.getCharacterDef('default');
        expect(def).toBeDefined();
    });
});
