// ============================================================
// src/engine/character.js — CharacterSystem (9角色 + 代价 + 被动)
// 从 DataLoader.load('characters') 加载 JSON 数据
// ============================================================

/**
 * CharacterSystem — 角色系统
 *
 * API:
 *   loadCharacters()         从 DataLoader 加载角色 JSON
 *   applyToPlayer(p, id)    应用角色属性 + 代价到玩家
 *   getCharacterDef(id)      获取角色定义
 *   getCurrent()             获取当前选中的角色
 *   getTags()                当前角色的标签列表
 *   hasTag(tagId)            检查当前角色是否适配某标签
 *   getUnlocked()            获取已解锁角色
 *   select(id)               选择角色
 *   reset()                  重置状态
 *
 * 设计要点:
 *   - Phase 1 硬编码 9 角色在 characters.json，无需 CSV 解析
 *   - 代价 (penalties) 在 applyToPlayer 时叠加到玩家属性上
 *   - 被动技能通过 player._passiveIds 注册，由 PassiveSystem 消费
 *   - 兼容层: _baseDamage, damage, critMultiplier 映射新字段
 */
const CharacterSystem = {
    // -------------------------------------------------------
    // 状态
    // -------------------------------------------------------
    allCharacters: [],
    selectedCharacterId: null,

    // -------------------------------------------------------
    // 1. 数据加载
    // -------------------------------------------------------

    /**
     * 从 DataLoader 加载角色数据
     *
     * 算法:
     * 1. 调用 DataLoader.load('characters')
     * 2. 标准化旧标签为 7 新标签
     * 3. 写入 this.allCharacters
     *
     * @returns {Promise<void>}
     */
    async loadCharacters() {
        let chars = [];

        if (typeof DataLoader !== 'undefined' && DataLoader.load) {
            chars = await DataLoader.load('characters');
        }

        if (!chars || chars.length === 0) {
            console.warn('[CharacterSystem] characters.json 加载失败，使用默认角色');
            chars = [{
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
            }];
        }

        // 标准化标签（旧 → 新 7 标签）
        this.allCharacters = chars.map(ch => ({
            ...ch,
            tags: this._normalizeTags(ch.tags || []),
            penalties: ch.penalties || {},
            passives: ch.passives || [],
        }));

        // 自动选中第一个已解锁角色（如 'default'）
        const firstUnlocked = this.allCharacters.find(c => c.unlocked);
        if (firstUnlocked) {
            this.selectedCharacterId = firstUnlocked.id;
        }
    },

    /**
     * 标准化标签数组（当前是 identity, 保留函数以备未来扩展）
     * 旧版: 旧→新 7 标签映射 (gun→ranged 等). 现已删除, csv 直接写精确 tag.
     * @param {string[]} tags
     * @returns {string[]}
     */
    _normalizeTags(tags) {
        if (typeof TagSystem !== 'undefined' && TagSystem.normalizeTag) {
            return tags.map(t => TagSystem.normalizeTag(t));
        }
        return [...tags];
    },

    // -------------------------------------------------------
    // 2. 应用到玩家
    // -------------------------------------------------------

    /**
     * 应用角色属性 + 代价到玩家对象
     * @param {Object} player - 玩家属性对象
     * @param {string} characterId - 角色 ID
     * @returns {boolean} 是否成功
     *
     * 算法:
     * 1. 查找角色定义
     * 2. 复制 statFields（无默认值，只有角色有定义的字段）
     * 3. 叠加 penalties 到对应属性
     * 4. 设置 player.weaponSlots, characterId, tags
     * 5. 设置 hp = maxHp
     * 6. 调用 StatsSystem.clampPlayer
     * 7. 注册被动技能到 _passiveIds
     * 8. 设置兼容字段 (_baseDamage, damage, critMultiplier)
     */
    applyToPlayer(player, characterId) {
        const ch = this.getCharacterDef(characterId);
        if (!ch) return false;

        // 1. 复制所有 stat 字段
        const statFields = [
            'maxHp', 'hpRegen', 'speed', 'attackSpeed', 'attackRange',
            'armor', 'dodge', 'critChance', 'critDamage', 'lifeSteal',
            'pickupRange',
            'damagePercent', 'meleeDamage', 'rangedDamage', 'elementalDamage',
            'engineering', 'harvesting', 'luck', 'xpGain', 'materialGain',
            // 核心战斗属性
            'bulletCount', 'bulletPierce', 'bulletSpeed',
        ];
        for (const field of statFields) {
            if (ch[field] !== undefined) {
                player[field] = ch[field];
            }
        }

        // 2. 叠加 penalties
        if (ch.penalties) {
            for (const [key, val] of Object.entries(ch.penalties)) {
                if (player[key] !== undefined) {
                    player[key] += val;
                }
            }
        }

        // 3. 设置身份字段
        player.weaponSlots = ch.weaponSlots || 6;
        player.characterId = characterId;
        player.tags = [...(ch.tags || [])];
        // 存储 class 亲和偏好（供伤害公式 class 匹配倍率用）
        player.preferredClasses = [...(ch.preferredClasses || [])];
        player.preferredClasses_2 = [...(ch.preferredClasses_2 || [])];

        // 4. 重置 HP
        player.hp = player.maxHp;

        // 5. 钳制属性
        if (typeof StatsSystem !== 'undefined' && StatsSystem.clampPlayer) {
            StatsSystem.clampPlayer(player);
        }

        // 6. 注册被动技能 ID
        if (ch.passives && ch.passives.length > 0) {
            player._passiveIds = [...ch.passives];
        } else if (player._passiveIds) {
            delete player._passiveIds;
        }

        // 7. 应用等级成长（level >= 1）
        player._characterLevel = player.level || 1;
        if (typeof FormulaSystem !== 'undefined' && FormulaSystem.applyLevelGrowth) {
            FormulaSystem.applyLevelGrowth(player, player._characterLevel);
        }

        // 8. 兼容字段
        player._baseDamage = 15;
        // damagePercent 是百分比加成（如 0.15 = +15%），不是 base damage
        player.damage = 15 + (player.meleeDamage || 0) + (player.rangedDamage || 0) + (player.elementalDamage || 0);
        // critDamage 为 0 表示"使用默认 2.0"（角色 CSV 中未填暴伤加成）
        if (player.critDamage === undefined || player.critDamage === null || player.critDamage === 0) {
            player.critDamage = 2.0;
        }
        player.critMultiplier = player.critDamage;

        return true;
    },

    /**
     * 重新计算等级成长的属性（升级时调用）
     * 保留武器/道具带来的额外加成，仅重新应用等级倍率
     * @param {Object} player
     */
    recalcLevelStats(player) {
        if (!player || !player._baseCharStats) return;
        if (typeof FormulaSystem !== 'undefined' && FormulaSystem.applyLevelGrowth) {
            FormulaSystem.applyLevelGrowth(player, player.level || 1);
        }
        // 重新钳制
        if (typeof StatsSystem !== 'undefined' && StatsSystem.clampPlayer) {
            StatsSystem.clampPlayer(player);
        }
    },

    // -------------------------------------------------------
    // 3. 查询
    // -------------------------------------------------------

    /**
     * 获取角色定义
     * @param {string} id
     * @returns {Object|null}
     */
    getCharacterDef(id) {
        return this.allCharacters.find(c => c.id === id) || null;
    },

    /**
     * 获取当前角色
     * @returns {Object|null}
     */
    getCurrent() {
        return this.getCharacterDef(this.selectedCharacterId);
    },

    /**
     * 获取当前角色标签列表
     * @returns {string[]}
     */
    getTags() {
        const ch = this.getCurrent();
        return ch ? [...ch.tags] : [];
    },

    /**
     * 检查当前角色是否适配指定标签
     * @param {string} tagId
     * @returns {boolean}
     */
    hasTag(tagId) {
        const tags = this.getTags();
        const normalized = this._normalizeTags([tagId])[0];
        return tags.includes(normalized);
    },

    /**
     * 获取已解锁角色
     * @returns {Object[]}
     */
    getUnlocked() {
        return this.allCharacters.filter(c => {
            if (c.unlocked) return true;
            if (typeof UnlockSystem !== 'undefined' && typeof UnlockSystem.isCharacterUnlocked === 'function') {
                return UnlockSystem.isCharacterUnlocked(c.id);
            }
            return false;
        });
    },

    /**
     * 选择角色
     * @param {string} id - 角色 ID
     * @returns {boolean} 是否选择成功
     */
    select(id) {
        const ch = this.getCharacterDef(id);
        if (!ch) return false;
        if (ch.unlocked) {
            this.selectedCharacterId = id;
            return true;
        }
        if (typeof UnlockSystem !== 'undefined' && typeof UnlockSystem.isCharacterUnlocked === 'function') {
            if (UnlockSystem.isCharacterUnlocked(id)) {
                this.selectedCharacterId = id;
                return true;
            }
        }
        return false;
    },

    /**
     * 获取角色的初始武器列表
     * @param {string} characterId
     * @returns {string[]} 武器 ID 数组（可能为空）
     */
    getStartingWeapons(characterId) {
        const ch = this.getCharacterDef(characterId);
        if (!ch || !ch.startingWeapons) return [];
        return [...ch.startingWeapons];
    },

    /**
     * 重置状态
     */
    reset() {
        this.allCharacters = [];
        this.selectedCharacterId = null;
    },
};

// CJS 导出
if (typeof module !== 'undefined') {
    module.exports = { CharacterSystem };
}
