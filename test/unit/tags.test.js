// ============================================================
// tags.test.js — TagSystem 单元测试
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { TagSystem } from '../../src/engine/tags.js';

// --------------- fixtures ---------------
import { meleeWeapon, rangedWeapon, fireWeapon, legacyGunWeapon, legacyLanceWeapon, allTestWeapons } from '../fixtures/weapons.simple.js';
import { fireItem, rangedItem, economyItem, multiTagItem, genericItem, allTestItems } from '../fixtures/items.simple.js';

// ============================================================
// 2.1 标签元数据
// ============================================================
describe('TagSystem - 标签元数据', () => {
    it('T1: getTagDef("melee") 返回近战定义', () => {
        const def = TagSystem.getTagDef('melee');
        expect(def).toEqual({ id: 'melee', name: '近战', icon: '⚔️' });
    });

    it('T2: getTagDef("gun") 旧标签映射为 ranged', () => {
        const def = TagSystem.getTagDef('gun');
        expect(def).toEqual({ id: 'ranged', name: '远程', icon: '🏹' });
    });

    it('T3: getTagDef("nonexistent") 返回 null', () => {
        expect(TagSystem.getTagDef('nonexistent')).toBeNull();
    });

    it('T4: getAllTagIds() 返回 7 个标签 ID', () => {
        const ids = TagSystem.getAllTagIds();
        expect(ids).toEqual(['melee', 'ranged', 'fire', 'explosive', 'crit', 'tech', 'economy']);
    });

    it('T5: normalizeTag("gun") → "ranged"', () => {
        expect(TagSystem.normalizeTag('gun')).toBe('ranged');
    });

    it('T6: normalizeTag("melee") → "melee"（已在 7 标签内不变）', () => {
        expect(TagSystem.normalizeTag('melee')).toBe('melee');
    });
});

// ============================================================
// 2.2 标签计数
// ============================================================
describe('TagSystem - 标签计数', () => {
    const zeroCounts = { melee: 0, ranged: 0, fire: 0, explosive: 0, crit: 0, tech: 0, economy: 0 };

    it('T7: countWeaponTags([]) 返回全零', () => {
        expect(TagSystem.countWeaponTags([])).toEqual(zeroCounts);
    });

    it('T8: countWeaponTags 正确计数多标签', () => {
        const result = TagSystem.countWeaponTags([meleeWeapon, meleeWeapon, rangedWeapon]);
        expect(result.melee).toBe(2);
        expect(result.ranged).toBe(1);
        expect(result.fire).toBe(0);
    });

    it('T9: countWeaponTags 旧标签 gun → ranged', () => {
        const result = TagSystem.countWeaponTags([legacyGunWeapon]);
        expect(result.ranged).toBe(1);
        expect(result.melee).toBe(0);
    });

    it('T10: countWeaponTags 旧标签 medic → tech', () => {
        // 模拟 medic 标签武器
        const result = TagSystem.countWeaponTags([{ tag: 'medic' }]);
        expect(result.tech).toBe(1);
    });

    it('T11: countItemTags([]) 返回全零', () => {
        expect(TagSystem.countItemTags([])).toEqual(zeroCounts);
    });

    it('T12: countItemTags 正确计数多标签道具', () => {
        const result = TagSystem.countItemTags([multiTagItem, meleeWeapon]);
        // multiTagItem has ['fire','explosive'], meleeWeapon is a weapon format (tag)
        // but items use { tags: [...] }, meleeWeapon has { tag: 'melee' } not { tags: [...] }
        // So meleeWeapon is an item with tag property, not tags array
        const result2 = TagSystem.countItemTags([multiTagItem, fireItem]);
        expect(result2.fire).toBe(2);
        expect(result2.explosive).toBe(1);
    });

    it('T13: countItemTags 道具重复标签正确计数', () => {
        const result = TagSystem.countItemTags([{ tags: ['fire', 'fire'] }]);
        expect(result.fire).toBe(2);
    });

    it('T14: mergeTagCounts 武器权重 1.0，道具权重 0.5', () => {
        const result = TagSystem.mergeTagCounts({ melee: 3 }, { melee: 2 });
        expect(result.melee).toBe(3 + 2 * 0.5); // 4
    });

    it('T15: mergeTagCounts 空对象返回全零', () => {
        const result = TagSystem.mergeTagCounts({}, {});
        expect(Object.values(result).every(v => v === 0)).toBe(true);
    });
});

// ============================================================
// 2.3 流派判定
// ============================================================
describe('TagSystem - 流派判定', () => {
    it('T16: determineBuild 正确识别主副流派', () => {
        const build = TagSystem.determineBuild({ melee: 3, ranged: 1, fire: 0, explosive: 0, crit: 0, tech: 0, economy: 0 });
        expect(build.primary).toBe('melee');
        expect(build.secondary).toBe('ranged');
    });

    it('T17: determineBuild 并列取先定义的值', () => {
        const build = TagSystem.determineBuild({ melee: 3, fire: 3, ranged: 1, explosive: 0, crit: 0, tech: 0, economy: 0 });
        expect(build.primary).toBe('melee');
        // secondary 取 count 第二高（fire:3），不是 count=1 的 ranged
        expect(build.secondary).toBe('fire');
    });

    it('T18: determineBuild 全零返回 null', () => {
        const build = TagSystem.determineBuild({ melee: 0, ranged: 0, fire: 0, explosive: 0, crit: 0, tech: 0, economy: 0 });
        expect(build.primary).toBeNull();
        expect(build.secondary).toBeNull();
    });

    it('T19: determineBuild 单一流派 secondary 为 null', () => {
        const build = TagSystem.determineBuild({ melee: 1, ranged: 0, fire: 0, explosive: 0, crit: 0, tech: 0, economy: 0 });
        expect(build.primary).toBe('melee');
        expect(build.secondary).toBeNull();
    });
});

// ============================================================
// 2.4 Synergy 加成
// ============================================================
describe('TagSystem - Synergy 加成', () => {
    it('T20: getActiveSynergies([]) 返回空数组', () => {
        expect(TagSystem.getActiveSynergies([])).toEqual([]);
    });

    it('T21: 2 近战触发 melee 2 层 synergy', () => {
        const active = TagSystem.getActiveSynergies([meleeWeapon, meleeWeapon]);
        const meleeSyn = active.find(s => s.tagId === 'melee');
        expect(meleeSyn).toBeDefined();
        expect(meleeSyn.count).toBe(2);
        expect(meleeSyn.threshold).toBe(2);
        expect(meleeSyn.bonus.damagePercent).toBe(0.10);
    });

    it('T22: 4 近战触发 melee 4 层 synergy', () => {
        const weapons = Array(4).fill(null).map(() => ({ ...meleeWeapon }));
        const active = TagSystem.getActiveSynergies(weapons);
        const meleeSyn = active.find(s => s.tagId === 'melee');
        expect(meleeSyn.count).toBe(4);
        expect(meleeSyn.threshold).toBe(4);
    });

    it('T23: 6 近战触发 melee 6 层 synergy', () => {
        const weapons = Array(6).fill(null).map(() => ({ ...meleeWeapon }));
        const active = TagSystem.getActiveSynergies(weapons);
        const meleeSyn = active.find(s => s.tagId === 'melee');
        expect(meleeSyn.count).toBe(6);
        expect(meleeSyn.threshold).toBe(6);
    });

    it('T24: mergeSynergyBonuses 正确合并加算', () => {
        const synergies = [
            { tagId: 'melee', bonus: { damagePercent: 0.10, lifeSteal: 0.03 } },
            { tagId: 'ranged', bonus: { attackRange: 0.15 } },
        ];
        const merged = TagSystem.mergeSynergyBonuses(synergies);
        expect(merged.damagePercent).toBe(0.10);
        expect(merged.lifeSteal).toBe(0.03);
        expect(merged.attackRange).toBe(0.15);
    });

    it('T25: mergeSynergyBonuses([]) 返回空对象', () => {
        expect(TagSystem.mergeSynergyBonuses([])).toEqual({});
    });
});

// ============================================================
// 2.5 流派偏向
// ============================================================
describe('TagSystem - 流派偏向', () => {
    it('T26: getBiasWeights({}) 全部 1.0', () => {
        const weights = TagSystem.getBiasWeights({});
        expect(Object.values(weights).every(w => w === 1.0)).toBe(true);
    });

    it('T27: getBiasWeights 有流派时对应标签权重更高', () => {
        const weights = TagSystem.getBiasWeights({ melee: 3, ranged: 1 });
        expect(weights.melee).toBeGreaterThan(weights.ranged);
        expect(weights.melee).toBe(1.0 + 0.2 * (3 / 4)); // 1.15
        expect(weights.ranged).toBe(1.0 + 0.2 * (1 / 4)); // 1.05
    });

    it('T28: getBiasWeights 自定义偏向强度', () => {
        const weights = TagSystem.getBiasWeights({ melee: 1 }, 0.5);
        expect(weights.melee).toBe(1.0 + 0.5 * (1 / 1)); // 1.5
    });
});

// ============================================================
// 2.6 过滤查询
// ============================================================
describe('TagSystem - 过滤查询', () => {
    it('T29: filterByTag 正确过滤', () => {
        const result = TagSystem.filterByTag([meleeWeapon, rangedWeapon], 'melee');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('test_melee');
    });

    it('T30: hasTag 武器格式 { tag: "melee" }', () => {
        expect(TagSystem.hasTag(meleeWeapon, 'melee')).toBe(true);
        expect(TagSystem.hasTag(meleeWeapon, 'ranged')).toBe(false);
    });

    it('T31: hasTag 道具格式 { tags: [...] }', () => {
        expect(TagSystem.hasTag(fireItem, 'fire')).toBe(true);
    });

    it('T32: hasTag 旧标签 gun → ranged 映射', () => {
        expect(TagSystem.hasTag(legacyGunWeapon, 'ranged')).toBe(true);
    });

    it('T33: getTags 武器返回 [tag]', () => {
        expect(TagSystem.getTags(meleeWeapon)).toEqual(['melee']);
    });

    it('T34: getTags 道具返回 tags 数组', () => {
        expect(TagSystem.getTags(multiTagItem)).toEqual(['fire', 'explosive']);
    });

    it('T35: getTags(null) 返回 []', () => {
        expect(TagSystem.getTags(null)).toEqual([]);
    });
});
