// ============================================================
// src/engine/tags.js — Tag 注册/计数/流派判定/偏向权重
// 所有"流派联动"的唯一权威中心
// ============================================================

/**
 * 7 标签定义
 *
 * 旧→新映射（数据迁移用）:
 *   melee → melee
 *   gun   → ranged
 *   bow   → ranged
 *   magic → fire
 *   medic → tech    (最佳匹配：辅助/治疗→工程)
 *   lance → melee   (最佳匹配：骑枪→近战)
 */
const TAG_DEFS = {
    melee:     { id: 'melee',     name: '近战',   icon: '⚔️' },
    ranged:    { id: 'ranged',    name: '远程',   icon: '🏹' },
    fire:      { id: 'fire',      name: '火焰',   icon: '🔥' },
    explosive: { id: 'explosive', name: '爆炸',   icon: '💥' },
    crit:      { id: 'crit',      name: '暴击',   icon: '💢' },
    tech:      { id: 'tech',      name: '工程',   icon: '🤖' },
    economy:   { id: 'economy',   name: '经济',   icon: '💰' },
};

/** 旧→新标签名映射表 */
const OLD_TAG_MAP = {
    melee:  'melee',
    gun:    'ranged',
    bow:    'ranged',
    magic:  'fire',
    medic:  'tech',
    lance:  'melee',
};

const TagSystem = {
    // -------------------------------------------------------
    // 3.1 标签元数据
    // -------------------------------------------------------

    /** 获取标签定义 */
    getTagDef(tagId) {
        const mapped = OLD_TAG_MAP[tagId] || tagId;
        return TAG_DEFS[mapped] || null;
    },

    /** 获取所有标签ID列表 */
    getAllTagIds() {
        return Object.keys(TAG_DEFS);
    },

    /** 获取所有标签定义 */
    getAllTagDefs() {
        return Object.values(TAG_DEFS);
    },

    /**
     * 标准化标签：旧标签名 → 新标签名
     * @param {string} tagId
     * @returns {string}
     */
    normalizeTag(tagId) {
        return OLD_TAG_MAP[tagId] || tagId;
    },

    // -------------------------------------------------------
    // 3.2 标签计数
    // -------------------------------------------------------

    /**
     * 统计武器数组的标签分布
     * @param {Object[]} weapons - [{ tag: 'melee' }, ...]
     * @returns {Object} - { melee: 2, ranged: 1, fire: 0, ... }
     *
     * 算法:
     * 1. 初始化 7 标签计数器为 0
     * 2. 遍历 weapons, 查每个武器的 tag 字段
     * 3. 映射旧→新标签名
     * 4. 对应标签计数器 +1
     * 5. 返回计数对象
     */
    countWeaponTags(weapons) {
        const counts = {};
        for (const id of Object.keys(TAG_DEFS)) {
            counts[id] = 0;
        }
        for (const w of weapons || []) {
            if (w.tag) {
                const normalized = this.normalizeTag(w.tag);
                if (counts[normalized] !== undefined) {
                    counts[normalized]++;
                }
            }
        }
        return counts;
    },

    /**
     * 统计道具数组的标签分布
     * @param {Object[]} items - [{ tags: ['fire','ranged'] }, ...]
     * @returns {Object}
     *
     * 算法:
     * 1. 初始化 7 标签计数器为 0
     * 2. 遍历 items, 遍历每个 item.tags 数组
     * 3. 对应标签计数器 +1
     * 4. 返回计数对象
     */
    countItemTags(items) {
        const counts = {};
        for (const id of Object.keys(TAG_DEFS)) {
            counts[id] = 0;
        }
        for (const item of items || []) {
            const tags = this.getTags(item);
            for (const t of tags) {
                const normalized = this.normalizeTag(t);
                if (counts[normalized] !== undefined) {
                    counts[normalized]++;
                }
            }
        }
        return counts;
    },

    /**
     * 合并武器+道具标签计数
     * @param {Object} weaponCounts
     * @param {Object} itemCounts
     * @returns {Object} - 合并后的计数
     *
     * 算法:
     * 1. 初始化合并计数器
     * 2. weaponCounts 直接加, itemCounts 按权重 0.5 加
     * 3. 返回合并结果
     */
    mergeTagCounts(weaponCounts, itemCounts) {
        const merged = {};
        const allKeys = new Set([
            ...Object.keys(weaponCounts || {}),
            ...Object.keys(itemCounts || {}),
        ]);
        for (const key of allKeys) {
            merged[key] = (weaponCounts[key] || 0) + (itemCounts[key] || 0) * 0.5;
        }
        return merged;
    },

    // -------------------------------------------------------
    // 3.3 流派判定
    // -------------------------------------------------------

    /**
     * 根据标签计数判定玩家的主要流派
     * @param {Object} tagCounts - 合并后的计数
     * @returns {Object} - { primary: 'fire', secondary: 'ranged', counts: {...} }
     *
     * 算法:
     * 1. 取计数最高的标签为 primary
     * 2. 取计数第二高（且 >0）为 secondary
     * 3. 如果并列取先定义的值
     * 4. 如果所有标签都是 0, primary=null
     */
    determineBuild(tagCounts) {
        const sorted = Object.entries(tagCounts || {})
            .sort((a, b) => b[1] - a[1]); // 按计数降序

        const primary = sorted[0] && sorted[0][1] > 0 ? sorted[0][0] : null;
        const secondary = sorted[1] && sorted[1][1] > 0 ? sorted[1][0] : null;

        return { primary, secondary, counts: { ...tagCounts } };
    },

    // -------------------------------------------------------
    // 3.4 Synergy 加成
    // -------------------------------------------------------

    /**
     * Synergy 阈值定义（每个标签的羁绊层数）
     *
     * 结构:
     * { tagId: { threshold: { statId: value, ... }, ... }, ... }
     *
     * 注意: 数值为 [PLACEHOLDER]，后续需策划调优
     */
    synergyThresholds: {
        melee: {
            2: { damagePercent: 0.10, lifeSteal: 0.03 },
            4: { damagePercent: 0.25, lifeSteal: 0.06, armor: 2 },
            6: { damagePercent: 0.40, lifeSteal: 0.10, armor: 5, knockback: 150 },
        },
        ranged: {
            2: { attackRange: 0.15 },
            4: { attackRange: 0.30, bulletSpeed: 0.20 },
            6: { attackRange: 0.50, bulletSpeed: 0.35, bulletCount: 1 },
        },
        fire: {
            2: { elementalDamage: 0.15 },
            4: { elementalDamage: 0.30, burnDps: 3 },
            6: { elementalDamage: 0.50, burnDps: 6, burningSpread: true },
        },
        explosive: {
            2: { explosionSize: 0.20 },
            4: { explosionSize: 0.40, explosionDamage: 0.30 },
            6: { explosionSize: 0.60, explosionDamage: 0.50, chainExplosion: true },
        },
        crit: {
            2: { critChance: 0.05 },
            4: { critChance: 0.10, critDamage: 0.50 },
            6: { critChance: 0.15, critDamage: 1.00, onCritLightning: true },
        },
        tech: {
            2: { engineering: 5 },
            4: { engineering: 10, turretCount: 1 },
            6: { engineering: 20, turretCount: 2, turretDamage: 0.30 },
        },
        economy: {
            2: { luck: 3, xpGain: 0.15 },
            4: { luck: 6, xpGain: 0.30, materialGain: 0.25 },
            6: { luck: 10, xpGain: 0.50, materialGain: 0.50, goldToDamage: true },
        },
    },

    /**
     * 计算当前激活的所有 synergy
     * @param {Object[]} weapons
     * @returns {Object[]} - [{ tagId, tagIcon, tagName, count, threshold, bonus }, ...]
     *
     * 算法:
     * 1. 调用 countWeaponTags(weapons)
     * 2. 遍历每个标签，查找满足的最高阈值
     * 3. 返回激活的 synergy 列表
     */
    getActiveSynergies(weapons) {
        const counts = this.countWeaponTags(weapons);
        const active = [];

        for (const [tagId, count] of Object.entries(counts)) {
            if (count === 0) continue;

            const defs = this.synergyThresholds[tagId];
            if (!defs) continue;

            let threshold = 0;
            let bonus = null;
            for (const [t, b] of Object.entries(defs)) {
                const tNum = parseInt(t, 10);
                if (count >= tNum && tNum > threshold) {
                    threshold = tNum;
                    bonus = b;
                }
            }

            if (bonus) {
                const tagDef = TAG_DEFS[tagId];
                active.push({
                    tagId,
                    tagName: tagDef ? tagDef.name : tagId,
                    tagIcon: tagDef ? tagDef.icon : '🏷️',
                    count,
                    threshold,
                    bonus,
                });
            }
        }

        return active;
    },

    /**
     * 合并所有激活 synergy 的加成到一个对象
     * @param {Object[]} activeSynergies
     * @returns {Object} - { damagePercent: 0.45, lifeSteal: 0.10, ... }
     *
     * 算法:
     * 1. 遍历 activeSynergies
     * 2. 对于每个 bonus 中的 key, 累加值
     * 3. 返回合并结果
     */
    mergeSynergyBonuses(activeSynergies) {
        const merged = {};
        for (const syn of activeSynergies || []) {
            for (const [key, val] of Object.entries(syn.bonus)) {
                merged[key] = (merged[key] || 0) + val;
            }
        }
        return merged;
    },

    // -------------------------------------------------------
    // 3.5 应用羁绊加成
    // -------------------------------------------------------

    /**
     * 将 synergy bonuses 应用到玩家属性
     * @param {Object} player - 玩家对象
     * @param {Object} bonuses - 合并后的羁绊加成 { statId: value, ... }
     */
    applyBonuses(player, bonuses) {
        if (!player || !bonuses) return;
        for (const [key, val] of Object.entries(bonuses)) {
            switch (key) {
                case 'damagePercent': player.damage *= (1 + val); break;
                case 'lifeSteal': player.lifeSteal = (player.lifeSteal || 0) + val; break;
                case 'armor': {
                    const v = (player.armor || 0) + val;
                    player.armor = typeof StatsSystem !== 'undefined' ? StatsSystem.clampStat('armor', v) : v;
                    break;
                }
                case 'knockback': player.knockback = (player.knockback || 0) + val; break;
                case 'attackRange': {
                    const v = (player.attackRange || 100) * (1 + val);
                    player.attackRange = typeof StatsSystem !== 'undefined' ? StatsSystem.clampStat('attackRange', v) : v;
                    break;
                }
                case 'bulletSpeed': player.bulletSpeed *= (1 + val); break;
                case 'bulletCount': player.bulletCount = Math.min(20, (player.bulletCount || 1) + val); break;
                case 'elementalDamage': player.elementalDamage = (player.elementalDamage || 1) * (1 + val); break;
                case 'burnDps': player.burnDps = (player.burnDps || 0) + val; break;
                case 'burningSpread': player.burningSpread = true; break;
                case 'explosionSize': player.explosionSize = (player.explosionSize || 1) * (1 + val); break;
                case 'explosionDamage': player.explosionDamage = (player.explosionDamage || 1) * (1 + val); break;
                case 'chainExplosion': player.chainExplosion = true; break;
                case 'critChance': player.critChance = Math.min(0.9, (player.critChance || 0) + val); break;
                case 'critDamage': player.critMultiplier = (player.critMultiplier || 2.0) + val; break;
                case 'onCritLightning': player.onCritLightning = true; break;
                case 'engineering': player.engineering = (player.engineering || 0) + val; break;
                case 'turretCount': player.turretCount = (player.turretCount || 0) + val; break;
                case 'turretDamage': player.turretDamage = (player.turretDamage || 1) * (1 + val); break;
                case 'luck': player.luck = (player.luck || 0) + val; break;
                case 'xpGain': player.xpGain = (player.xpGain || 1.0) * (1 + val); break;
                case 'materialGain': player.materialGain = (player.materialGain || 1.0) * (1 + val); break;
                case 'goldToDamage': player.goldToDamage = true; break;
            }
        }
        // 同步 _activeSynergies 供 UI 显示
        if (player.weapons) {
            player._activeSynergies = this.getActiveSynergies(player.weapons);
        }
    },

    // -------------------------------------------------------
    // 3.6 流派偏向（用于商店/掉落/升级卡）
    // -------------------------------------------------------

    /**
     * 计算流派偏向权重
     * @param {Object} tagCounts - 合并后的标签计数
     * @param {number} biasStrength - 偏向强度 (默认 0.2 = +20%)
     * @returns {Object} - { melee: 1.2, ranged: 1.0, fire: 0.8, ... }
     *
     * 算法:
     * 1. 每个标签基础权重 = 1.0
     * 2. 统计总标签数 totalTags
     * 3. 对于每个有计数的标签: weight += biasStrength × (count / totalTags)
     * 4. 返回权重对象
     */
    getBiasWeights(tagCounts, biasStrength) {
        biasStrength = biasStrength !== undefined ? biasStrength : 0.2;
        const weights = {};

        // 所有标签基础权重 1.0
        for (const id of Object.keys(TAG_DEFS)) {
            weights[id] = 1.0;
        }

        // 统计总标签数
        let totalTags = 0;
        for (const count of Object.values(tagCounts || {})) {
            totalTags += count;
        }

        if (totalTags === 0) return weights;

        // 有计数的标签加偏向权重
        for (const [tagId, count] of Object.entries(tagCounts || {})) {
            if (count > 0 && weights[tagId] !== undefined) {
                weights[tagId] += biasStrength * (count / totalTags);
            }
        }

        return weights;
    },

    // -------------------------------------------------------
    // 3.6 过滤和查询
    // -------------------------------------------------------

    /**
     * 按标签过滤数组
     * @param {Object[]} items - 带 tags 字段的数组
     * @param {string} tagId
     * @returns {Object[]}
     */
    filterByTag(items, tagId) {
        const normalized = this.normalizeTag(tagId);
        return (items || []).filter(item => this.hasTag(item, normalized));
    },

    /**
     * 检查对象是否包含指定标签
     * @param {Object} obj - { tag: 'melee' } 或 { tags: ['fire','ranged'] }
     * @param {string} tagId
     * @returns {boolean}
     */
    hasTag(obj, tagId) {
        if (!obj) return false;
        const normalized = this.normalizeTag(tagId);
        const tags = this.getTags(obj);
        return tags.includes(normalized);
    },

    /**
     * 获取对象的所有标签（标准化后）
     * @param {Object} obj - 武器或道具对象
     * @returns {string[]}
     *
     * 兼容:
     * - 武器: { tag: 'melee' } → ['melee']
     * - 道具: { tags: ['fire','ranged'] } → ['fire','ranged']
     */
    getTags(obj) {
        if (!obj) return [];

        let rawTags = [];

        if (Array.isArray(obj.tags)) {
            // 道具格式: { tags: ['fire', 'melee'] }
            rawTags = obj.tags;
        } else if (typeof obj.tag === 'string') {
            // 武器格式: { tag: 'melee' }
            rawTags = [obj.tag];
        }

        // 标准化旧标签
        return rawTags.map(t => this.normalizeTag(t)).filter(Boolean);
    },
};

// CJS 导出（浏览器中 module 为 undefined，不生效；Node 中生效）
if (typeof module !== 'undefined') {
    module.exports = { TagSystem, TAG_DEFS, OLD_TAG_MAP };
}
