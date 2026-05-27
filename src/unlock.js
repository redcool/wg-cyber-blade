// ============================================================
// unlock.js - 解锁进度系统（localStorage跨局保存）
// ============================================================
const STORAGE_KEY = 'cyberblade_unlocks';

const UnlockSystem = {
    // 跨局统计
    stats: {
        totalKills: 0,
        totalMaterials: 0,
        totalLevels: 0,     // 累计通关关卡数
        maxLevel: 0,         // 单局最高关卡
        highestLevel: 0,
        totalPlayTime: 0,
    },
    // 解锁集 — 基础武器默认全解锁
    unlockedWeapons: new Set([
        // 近战基础 (5)
        'plasma', 'dagger', 'claws', 'axe', 'whip',
        // 枪械基础 (4)
        'pistol', 'smg', 'revolver', 'shotgun',
        // 弓箭基础 (3)
        'bow', 'recurve', 'crossbow',
        // 元素基础 (4)
        'magic_orb', 'fire_wand', 'fire_staff', 'frost_staff',
        // 医疗基础 (2)
        'heal_gun', 'life_wand',
        // 骑枪基础 (3)
        'pike', 'cavalry_lance', 'trident',
    ]),
    // 基础武器ID列表（用于武器选择界面）
    basicWeaponIds: new Set([
        'plasma', 'dagger', 'claws', 'axe', 'whip',
        'pistol', 'smg', 'revolver', 'shotgun',
        'bow', 'recurve', 'crossbow',
        'magic_orb', 'fire_wand', 'fire_staff', 'frost_staff',
        'heal_gun', 'life_wand',
        'pike', 'cavalry_lance', 'trident',
    ]),
    unlockedCharacters: new Set(),

    // 本局记录（仅用于结算时更新跨局统计）
    sessionStats: {
        weapons: [],   // 装备过的武器id
        items: [],     // 购买过的道具id
        levelsCleared: 0,
        kills: 0,
        materials: 0,
    },

    /** 初始化 - 从localStorage读取（合并默认值，防止丢失基础武器） */
    init() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                this.stats = data.stats || this.stats;
                // 合并保存数据与默认解锁集（确保基础武器永远可用）
                if (data.unlockedWeapons) {
                    this.unlockedWeapons = new Set([...this.unlockedWeapons, ...data.unlockedWeapons]);
                }
                if (data.unlockedCharacters) {
                    this.unlockedCharacters = new Set([...this.unlockedCharacters, ...data.unlockedCharacters]);
                }
            }
        } catch (e) {
            console.warn('UnlockSystem: Failed to load saves', e);
        }
    },

    /** 保存到localStorage */
    _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                stats: this.stats,
                unlockedWeapons: [...this.unlockedWeapons],
                unlockedCharacters: [...this.unlockedCharacters],
            }));
        } catch (e) {
            console.warn('UnlockSystem: Failed to save', e);
        }
    },

    /** 重置本局记录 */
    resetSession() {
        this.sessionStats = { weapons: [], items: [], levelsCleared: 0, kills: 0, materials: 0 };
    },

    /** 记录本局购买的武器 */
    recordWeaponBought(weaponId) {
        if (!this.sessionStats.weapons.includes(weaponId)) {
            this.sessionStats.weapons.push(weaponId);
        }
    },

    /** 记录本局购买的道具 */
    recordItemBought(itemId) {
        if (!this.sessionStats.items.includes(itemId)) {
            this.sessionStats.items.push(itemId);
        }
    },

    /** 本局结束 - 结算并检查新解锁 */
    endSession() {
        const ss = this.sessionStats;

        // 更新跨局统计
        this.stats.totalKills += ss.kills;
        this.stats.totalMaterials += ss.materials;
        this.stats.totalLevels += ss.levelsCleared;
        if (ss.levelsCleared > this.stats.maxLevel) {
            this.stats.maxLevel = ss.levelsCleared;
        }
        if (ss.levelsCleared > this.stats.highestLevel) {
            this.stats.highestLevel = ss.levelsCleared;
        }

        // 检查新解锁
        const newUnlocks = this._checkUnlocks();

        this._save();
        return {
            newUnlocks,
            weaponsUsed: [...ss.weapons],
            itemsUsed: [...ss.items],
        };
    },

    /** 检查解锁条件 */
    _checkUnlocks() {
        const newUnlocks = [];

        // ====== 武器解锁条件（48种武器逐步解锁） ======
        const weaponUnlocks = [
            // 近战 (melee)
            { id: 'plasma', condition: () => this.stats.totalLevels >= 1 },
            { id: 'axe', condition: () => this.stats.totalKills >= 20 },
            { id: 'dagger', condition: () => this.stats.totalLevels >= 2 },
            { id: 'chainsaw', condition: () => this.stats.totalKills >= 50 },
            { id: 'sword', condition: () => this.stats.totalLevels >= 3 },
            { id: 'katana', condition: () => this.stats.totalKills >= 100 },
            { id: 'hammer', condition: () => this.stats.totalLevels >= 5 },
            { id: 'spear', condition: () => this.stats.totalLevels >= 4 },
            { id: 'claws', condition: () => this.stats.totalKills >= 30 },
            { id: 'whip', condition: () => this.stats.totalKills >= 80 },
            // 枪械 (gun)
            { id: 'pistol', condition: () => true },
            { id: 'smg', condition: () => this.stats.totalLevels >= 2 },
            { id: 'shotgun', condition: () => this.stats.totalLevels >= 3 },
            { id: 'sniper', condition: () => this.stats.totalLevels >= 6 },
            { id: 'gatling', condition: () => this.stats.totalKills >= 50 },
            { id: 'revolver', condition: () => this.stats.totalLevels >= 2 },
            { id: 'rifle', condition: () => this.stats.totalLevels >= 4 },
            { id: 'rifle2', condition: () => this.stats.totalKills >= 120 },
            { id: 'shotgun_double', condition: () => this.stats.totalKills >= 120 },
            { id: 'magnum', condition: () => this.stats.totalKills >= 200 },
            { id: 'minigun', condition: () => this.stats.totalLevels >= 12 },
            // 弓箭 (bow)
            { id: 'bow', condition: () => this.stats.totalLevels >= 1 },
            { id: 'crossbow', condition: () => this.stats.totalKills >= 40 },
            { id: 'longbow', condition: () => this.stats.totalLevels >= 5 },
            { id: 'recurve', condition: () => this.stats.totalLevels >= 3 },
            { id: 'explosive_arrow', condition: () => this.stats.totalKills >= 100 },
            { id: 'frost_arrow', condition: () => this.stats.totalLevels >= 8 },
            { id: 'poison_arrow', condition: () => this.stats.totalKills >= 60 },
            { id: 'triple_shot', condition: () => this.stats.totalKills >= 150 },
            { id: 'piercing_shot', condition: () => this.stats.totalLevels >= 10 },
            { id: 'homing_bow', condition: () => this.stats.totalKills >= 250 },
            // 元素 (magic)
            { id: 'fire_staff', condition: () => this.stats.totalLevels >= 2 },
            { id: 'frost_staff', condition: () => this.stats.totalLevels >= 5 },
            { id: 'thunder_staff', condition: () => this.stats.totalKills >= 80 },
            { id: 'energy_staff', condition: () => this.stats.totalLevels >= 8 },
            { id: 'magic_orb', condition: () => this.stats.totalLevels >= 1 },
            { id: 'poison_staff', condition: () => this.stats.totalKills >= 120 },
            { id: 'void_staff', condition: () => this.stats.totalLevels >= 12 },
            { id: 'lightning_staff', condition: () => this.stats.totalKills >= 180 },
            { id: 'fire_wand', condition: () => this.stats.totalLevels >= 4 },
            { id: 'arcane_orb', condition: () => this.stats.totalLevels >= 15 },
            // 医疗 (medic)
            { id: 'heal_gun', condition: () => this.stats.totalLevels >= 3 },
            { id: 'shield', condition: () => this.stats.totalLevels >= 8 },
            { id: 'holy_staff', condition: () => this.stats.totalKills >= 60 },
            { id: 'life_wand', condition: () => this.stats.totalLevels >= 5 },
            { id: 'blessing', condition: () => this.stats.totalLevels >= 10 },
            // 骑枪 (lance)
            { id: 'pike', condition: () => this.stats.totalLevels >= 7 },
            { id: 'cavalry_lance', condition: () => this.stats.totalKills >= 150 },
            { id: 'trident', condition: () => this.stats.totalLevels >= 10 },
        ];

        for (const wu of weaponUnlocks) {
            if (!this.unlockedWeapons.has(wu.id) && wu.condition()) {
                this.unlockedWeapons.add(wu.id);
                newUnlocks.push({ type: 'weapon', id: wu.id });
            }
        }

        // ====== 角色解锁条件 ======
        const charUnlocks = [
            { id: 'mech', condition: () => this.stats.maxLevel >= 5 },
            { id: 'assassin', condition: () => this.stats.totalKills >= 100 },
            { id: 'medic', condition: () => this.stats.totalKills >= 80 },
            { id: 'paladin', condition: () => this.stats.maxLevel >= 10 },
            { id: 'engineer', condition: () => this.stats.totalKills >= 200 },
            { id: 'berserker', condition: () => this.stats.maxLevel >= 15 },
            { id: 'dragon_knight', condition: () => this.stats.totalKills >= 300 },
        ];

        for (const cu of charUnlocks) {
            if (!this.unlockedCharacters.has(cu.id) && cu.condition()) {
                this.unlockedCharacters.add(cu.id);
                newUnlocks.push({ type: 'character', id: cu.id });
            }
        }

        return newUnlocks;
    },

    /** 检查是否已解锁武器 */
    isWeaponUnlocked(id) {
        return this.unlockedWeapons.has(id);
    },

    /** 检查是否已解锁角色 */
    isCharacterUnlocked(id) {
        return this.unlockedCharacters.has(id);
    },
};

// 自动初始化
UnlockSystem.init();
