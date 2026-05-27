// ============================================================
// character.js - 角色系统（10个角色 + 武器适配）
// ============================================================
const CharacterSystem = {
    // 所有角色定义
    allCharacters: [
        // ======== 默认解锁 (4个) ========
        {
            id: 'swordsman',
            name: '剑客',
            desc: '近战达人，擅长用剑/斧类武器',
            icon: '⚔️',
            unlocked: true,
            stats: {
                maxHp: 120, hpRegen: 0.6, speed: 240, damage: 18,
                attackSpeed: 1.2, attackRange: 200, armor: 3, dodge: 0.03,
                critChance: 0.05, critMultiplier: 2.0, bulletCount: 1,
                bulletPierce: 0, bulletSpeed: 400, lifeSteal: 0.02,
                pickupRange: 40, harvesting: 0, luck: 0,
            },
            weaponSlots: 6,
            weaponAffinities: ['melee', 'lance'],
            unlockCondition: null
        },
        {
            id: 'gunslinger',
            name: '枪手',
            desc: '远程火力，枪械精通',
            icon: '🔫',
            unlocked: true,
            stats: {
                maxHp: 90, hpRegen: 0.4, speed: 220, damage: 20,
                attackSpeed: 1.3, attackRange: 350, armor: 1, dodge: 0.02,
                critChance: 0.08, critMultiplier: 2.2, bulletCount: 1,
                bulletPierce: 0, bulletSpeed: 600, lifeSteal: 0,
                pickupRange: 60, harvesting: 0, luck: 1,
            },
            weaponSlots: 6,
            weaponAffinities: ['gun'],
            unlockCondition: null
        },
        {
            id: 'fire_mage',
            name: '火焰法师',
            desc: '元素掌控者，魔法大师',
            icon: '🔥',
            unlocked: true,
            stats: {
                maxHp: 80, hpRegen: 0.5, speed: 200, damage: 15,
                attackSpeed: 0.9, attackRange: 320, armor: 0, dodge: 0.02,
                critChance: 0.05, critMultiplier: 2.5, bulletCount: 1,
                bulletPierce: 0, bulletSpeed: 450, lifeSteal: 0,
                pickupRange: 50, harvesting: 0, luck: 2,
            },
            weaponSlots: 6,
            weaponAffinities: ['magic'],
            unlockCondition: null
        },
        {
            id: 'archer',
            name: '弓箭游侠',
            desc: '远程精准打击，暴击穿透流派',
            icon: '🏹',
            unlocked: true,
            stats: {
                maxHp: 95, hpRegen: 0.5, speed: 230, damage: 16,
                attackSpeed: 1.1, attackRange: 360, armor: 1, dodge: 0.03,
                critChance: 0.10, critMultiplier: 2.3, bulletCount: 1,
                bulletPierce: 0, bulletSpeed: 550, lifeSteal: 0,
                pickupRange: 55, harvesting: 0, luck: 1,
            },
            weaponSlots: 6,
            weaponAffinities: ['bow'],
            unlockCondition: null
        },

        // ======== 解锁角色 (8个) ========
        {
            id: 'mech',
            name: '重型机甲',
            desc: '血厚防高，但移速较慢',
            icon: '🦾',
            unlocked: false,
            stats: {
                maxHp: 180, hpRegen: 0.3, speed: 140, damage: 12,
                attackSpeed: 0.8, attackRange: 280, armor: 8, dodge: 0,
                critChance: 0.03, critMultiplier: 1.8, bulletCount: 1,
                bulletPierce: 1, bulletSpeed: 450, lifeSteal: 0,
                pickupRange: 40, harvesting: 0, luck: 0,
            },
            weaponSlots: 5,
            weaponAffinities: ['gun', 'melee', 'lance'],
            unlockCondition: { type: 'maxLevel', value: 5 }
        },
        {
            id: 'assassin',
            name: '疾影刺客',
            desc: '极速高伤，但非常脆弱',
            icon: '🗡️',
            unlocked: false,
            stats: {
                maxHp: 70, hpRegen: 0.8, speed: 280, damage: 22,
                attackSpeed: 1.5, attackRange: 220, armor: 0, dodge: 0.12,
                critChance: 0.12, critMultiplier: 2.8, bulletCount: 1,
                bulletPierce: 0, bulletSpeed: 550, lifeSteal: 0.03,
                pickupRange: 60, harvesting: 0, luck: 2,
            },
            weaponSlots: 4,
            weaponAffinities: ['melee', 'bow', 'lance'],
            unlockCondition: { type: 'totalKills', value: 100 }
        },
        {
            id: 'medic',
            name: '医疗兵',
            desc: '回复支援型，擅长医疗武器',
            icon: '💊',
            unlocked: false,
            stats: {
                maxHp: 100, hpRegen: 2.0, speed: 200, damage: 12,
                attackSpeed: 1.0, attackRange: 280, armor: 2, dodge: 0.04,
                critChance: 0.05, critMultiplier: 2.0, bulletCount: 1,
                bulletPierce: 0, bulletSpeed: 500, lifeSteal: 0.02,
                pickupRange: 70, harvesting: 0, luck: 1,
            },
            weaponSlots: 6,
            weaponAffinities: ['medic'],
            unlockCondition: { type: 'totalKills', value: 80 }
        },
        {
            id: 'paladin',
            name: '圣骑士',
            desc: '攻守兼备，近战医疗双修',
            icon: '✨',
            unlocked: false,
            stats: {
                maxHp: 140, hpRegen: 1.0, speed: 180, damage: 16,
                attackSpeed: 0.9, attackRange: 220, armor: 5, dodge: 0.02,
                critChance: 0.05, critMultiplier: 2.0, bulletCount: 1,
                bulletPierce: 0, bulletSpeed: 400, lifeSteal: 0.03,
                pickupRange: 50, harvesting: 0, luck: 0,
            },
            weaponSlots: 6,
            weaponAffinities: ['melee', 'medic', 'lance'],
            unlockCondition: { type: 'maxLevel', value: 10 }
        },
        {
            id: 'engineer',
            name: '工程师',
            desc: '科技暴击流，枪械元素双修',
            icon: '🔧',
            unlocked: false,
            stats: {
                maxHp: 90, hpRegen: 0.5, speed: 210, damage: 14,
                attackSpeed: 1.1, attackRange: 320, armor: 2, dodge: 0.03,
                critChance: 0.12, critMultiplier: 3.0, bulletCount: 2,
                bulletPierce: 0, bulletSpeed: 550, lifeSteal: 0,
                pickupRange: 60, harvesting: 0, luck: 2,
            },
            weaponSlots: 6,
            weaponAffinities: ['gun', 'magic'],
            unlockCondition: { type: 'totalKills', value: 200 }
        },
        {
            id: 'berserker',
            name: '狂战士',
            desc: '低血高伤，嗜血狂暴',
            icon: '💢',
            unlocked: false,
            stats: {
                maxHp: 60, hpRegen: 0.3, speed: 260, damage: 25,
                attackSpeed: 1.6, attackRange: 180, armor: 0, dodge: 0.05,
                critChance: 0.08, critMultiplier: 2.5, bulletCount: 1,
                bulletPierce: 0, bulletSpeed: 450, lifeSteal: 0.08,
                pickupRange: 45, harvesting: 0, luck: 0,
            },
            weaponSlots: 5,
            weaponAffinities: ['melee', 'gun', 'bow', 'magic', 'medic', 'lance'],
            unlockCondition: { type: 'maxLevel', value: 15 }
        },
        // ======== 骑枪专属角色 ========
        {
            id: 'dragon_knight',
            name: '龙骑士',
            desc: '龙骑无双，骑枪专精',
            icon: '🐉',
            unlocked: false,
            stats: {
                maxHp: 150, hpRegen: 0.6, speed: 240, damage: 22,
                attackSpeed: 1.0, attackRange: 280, armor: 4, dodge: 0.02,
                critChance: 0.06, critMultiplier: 2.2, bulletCount: 1,
                bulletPierce: 0, bulletSpeed: 0, lifeSteal: 0.02,
                pickupRange: 50, harvesting: 0, luck: 1,
            },
            weaponSlots: 5,
            weaponAffinities: ['lance'],
            unlockCondition: { type: 'totalKills', value: 300 }
        },
    ],

    selectedCharacterId: 'swordsman',

    /** 获取当前角色的武器适配列表 */
    getAffinities() {
        const ch = this.allCharacters.find(c => c.id === this.selectedCharacterId);
        return ch ? ch.weaponAffinities : ['melee', 'gun', 'bow', 'magic', 'medic'];
    },

    /** 检查某标签武器是否对当前角色适配 */
    isAffinity(tagId) {
        const affinities = this.getAffinities();
        return affinities.includes(tagId);
    },

    /** 应用角色属性到玩家 */
    applyToPlayer(player, characterId) {
        const ch = this.allCharacters.find(c => c.id === characterId);
        if (!ch) return;
        const s = ch.stats;
        Object.assign(player, {
            maxHp: s.maxHp,
            hp: s.maxHp,
            hpRegen: s.hpRegen,
            speed: s.speed,
            damage: s.damage,
            attackSpeed: s.attackSpeed,
            attackRange: s.attackRange,
            armor: s.armor,
            dodge: s.dodge,
            critChance: s.critChance,
            critMultiplier: s.critMultiplier,
            bulletCount: s.bulletCount,
            bulletPierce: s.bulletPierce,
            bulletSpeed: s.bulletSpeed,
            lifeSteal: s.lifeSteal,
            pickupRange: s.pickupRange,
            harvesting: s.harvesting,
            luck: s.luck,
            weaponSlots: ch.weaponSlots,
            usedSlots: 0,
        });
        // 不分配默认武器 — 由武器选择界面决定
        player.weapons = [];
        return ch;
    },

    /** 获取已解锁的角色 */
    getUnlocked() {
        return this.allCharacters.filter(c => c.unlocked || UnlockSystem.isCharacterUnlocked(c.id));
    },

    /** 设置选择的角色 */
    select(id) {
        if (this.allCharacters.some(c => c.id === id && (c.unlocked || UnlockSystem.isCharacterUnlocked(id)))) {
            this.selectedCharacterId = id;
            return true;
        }
        return false;
    }
};
