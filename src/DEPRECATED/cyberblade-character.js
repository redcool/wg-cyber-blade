// ============================================================
// cyberblade/character.js - 角色系统（从 data/characterTable.md 加载）
// ============================================================
const _CHAR_STR = {
    char_swordsman_name: '剑客',
    char_swordsman_desc: '近战达人，擅长用剑/斧类武器',
    char_gunslinger_name: '枪手',
    char_gunslinger_desc: '远程火力，枪械精通',
    char_fire_mage_name: '火焰法师',
    char_fire_mage_desc: '元素掌控者，魔法大师',
    char_archer_name: '弓箭游侠',
    char_archer_desc: '远程精准打击，暴击穿透流派',
    char_mech_name: '重型机甲',
    char_mech_desc: '血厚防高，但移速较慢',
    char_assassin_name: '疾影刺客',
    char_assassin_desc: '极速高伤，但非常脆弱',
    char_medic_name: '医疗兵',
    char_medic_desc: '回复支援型，擅长医疗武器',
    char_paladin_name: '圣骑士',
    char_paladin_desc: '攻守兼备，近战医疗双修',
    char_engineer_name: '工程师',
    char_engineer_desc: '科技暴击流，枪械元素双修',
    char_berserker_name: '狂战士',
    char_berserker_desc: '低血高伤，嗜血狂暴',
    char_dragon_knight_name: '龙骑士',
    char_dragon_knight_desc: '龙骑无双，骑枪专精'
};
if (typeof DataLoader !== 'undefined') {
    DataLoader.load('character_charsData').then(d => { if (d) Object.assign(_CHAR_STR, d); }).catch(() => {});
}
const CharacterSystem = {
    // 所有角色定义（由 loadFromTable 填充）
    allCharacters: [],

    selectedCharacterId: 'swordsman',

    /** ====== 从 data/characterTable.md 加载角色数据 ====== */
    async loadFromTable() {
        try {
            const resp = await fetch('data/characterTable.md');
            const text = await resp.text();
            this.allCharacters = this._parseCSV(text);
            if (this.allCharacters.length === 0) {
                console.warn('[CharacterSystem] CSV 加载成功但无有效数据');
            } else {
                console.log('[CharacterSystem] 从 CSV 加载', this.allCharacters.length, '个角色');
            }
        } catch (e) {
            console.error('[CharacterSystem] CSV 加载失败，使用硬编码回退:', e);
            this._fallbackToHardcoded();
        }
    },

    /** 解析 CSV 文本 → 角色对象数组 */
    _parseCSV(text) {
        const lines = text.split(/\r?\n/);
        const chars = [];
        for (const rawLine of lines) {
            const trimmed = rawLine.trim();
            if (trimmed === '' || trimmed.startsWith('#')) continue;

            // 解析逗号分隔，支持 "" 引号字段
            const fields = this._splitCSVLine(trimmed);
            if (fields.length < 25) continue; // 至少 26 列

            const [
                id, name, desc, icon, unlockedStr, weaponSlotsStr, affinitiesStr,
                maxHpStr, hpRegenStr, speedStr, damageStr, attackSpeedStr,
                attackRangeStr, armorStr, dodgeStr, critChanceStr, critMultiplierStr,
                bulletCountStr, bulletPierceStr, bulletSpeedStr, lifeStealStr,
                pickupRangeStr, harvestingStr, luckStr,
                unlockType, unlockValueStr,
                ...extraFields
            ] = fields;

            // 数值转换
            const toNum = (s) => { const v = parseFloat(s); return isNaN(v) ? 0 : v; };
            const toBool = (s) => s.trim().toLowerCase() === 'true';

            // 新属性（来自新 CSV 格式: xpGain, meleeDamage, rangedDamage, elementalDamage, engineering, passives）
            const xpGainStr = extraFields[0] || '0';
            const meleeDamageStr = extraFields[1] || '0';
            const rangedDamageStr = extraFields[2] || '0';
            const elementalDamageStr = extraFields[3] || '0';
            const engineeringStr = extraFields[4] || '0';
            const passivesStr = extraFields[5] || '';

            const stats = {
                maxHp: toNum(maxHpStr),
                hpRegen: toNum(hpRegenStr),
                speed: toNum(speedStr),
                damage: toNum(damageStr),
                attackSpeed: toNum(attackSpeedStr),
                attackRange: toNum(attackRangeStr),
                armor: toNum(armorStr),
                dodge: toNum(dodgeStr),
                critChance: toNum(critChanceStr),
                critMultiplier: toNum(critMultiplierStr),
                bulletCount: toNum(bulletCountStr),
                bulletPierce: toNum(bulletPierceStr),
                bulletSpeed: toNum(bulletSpeedStr),
                lifeSteal: toNum(lifeStealStr),
                pickupRange: toNum(pickupRangeStr),
                harvesting: toNum(harvestingStr),
                luck: toNum(luckStr),
                // 新属性
                xpGain: toNum(xpGainStr),
                meleeDamage: toNum(meleeDamageStr),
                rangedDamage: toNum(rangedDamageStr),
                elementalDamage: toNum(elementalDamageStr),
                engineering: toNum(engineeringStr),
            };

            const weaponSlots = toNum(weaponSlotsStr) || 6;

            // affinities: pipe-separated
            const weaponAffinities = affinitiesStr
                ? affinitiesStr.split('|').map(s => s.trim()).filter(Boolean)
                : [];

            // unlockCondition
            let unlockCondition = null;
            const ut = unlockType ? unlockType.trim() : '';
            const uv = unlockValueStr ? unlockValueStr.trim() : '';
            if (ut && uv) {
                const uvNum = toNum(uv);
                unlockCondition = { type: ut, value: uvNum };
            }

            chars.push({
                id,
                name,
                desc,
                icon,
                unlocked: toBool(unlockedStr),
                weaponSlots,
                weaponAffinities,
                stats,
                unlockCondition,
                passives: passivesStr ? passivesStr.split('|').map(s => s.trim()).filter(Boolean) : [],
            });
        }
        return chars;
    },

    /** 拆分 CSV 行（支持双引号字段） */
    _splitCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        result.push(current.trim());
        return result;
    },

    /** 硬编码回退（CSV 加载失败时使用） */
    _fallbackToHardcoded() {
        this.allCharacters = [
            {
                id: 'swordsman', name: _CHAR_STR.char_swordsman_name, desc: _CHAR_STR.char_swordsman_desc, icon: '⚔️',
                unlocked: true, weaponSlots: 6, weaponAffinities: ['melee', 'lance'],
                stats: { maxHp:120, hpRegen:0.6, speed:240, damage:18, attackSpeed:1.2, attackRange:200, armor:3, dodge:0.03, critChance:0.05, critMultiplier:2.0, bulletCount:1, bulletPierce:0, bulletSpeed:400, lifeSteal:0.02, pickupRange:40, harvesting:0, luck:0 },
                unlockCondition: null
            },
            {
                id: 'gunslinger', name: _CHAR_STR.char_gunslinger_name, desc: _CHAR_STR.char_gunslinger_desc, icon: '🔫',
                unlocked: true, weaponSlots: 6, weaponAffinities: ['gun'],
                stats: { maxHp:90, hpRegen:0.4, speed:220, damage:20, attackSpeed:1.3, attackRange:350, armor:1, dodge:0.02, critChance:0.08, critMultiplier:2.2, bulletCount:1, bulletPierce:0, bulletSpeed:600, lifeSteal:0, pickupRange:60, harvesting:0, luck:1 },
                unlockCondition: null
            },
            {
                id: 'fire_mage', name: _CHAR_STR.char_fire_mage_name, desc: _CHAR_STR.char_fire_mage_desc, icon: '🔥',
                unlocked: true, weaponSlots: 6, weaponAffinities: ['magic'],
                stats: { maxHp:80, hpRegen:0.5, speed:200, damage:15, attackSpeed:0.9, attackRange:320, armor:0, dodge:0.02, critChance:0.05, critMultiplier:2.5, bulletCount:1, bulletPierce:0, bulletSpeed:450, lifeSteal:0, pickupRange:50, harvesting:0, luck:2 },
                unlockCondition: null
            },
            {
                id: 'archer', name: _CHAR_STR.char_archer_name, desc: _CHAR_STR.char_archer_desc, icon: '🏹',
                unlocked: true, weaponSlots: 6, weaponAffinities: ['bow'],
                stats: { maxHp:95, hpRegen:0.5, speed:230, damage:16, attackSpeed:1.1, attackRange:360, armor:1, dodge:0.03, critChance:0.10, critMultiplier:2.3, bulletCount:1, bulletPierce:0, bulletSpeed:550, lifeSteal:0, pickupRange:55, harvesting:0, luck:1 },
                unlockCondition: null
            },
            {
                id: 'mech', name: _CHAR_STR.char_mech_name, desc: _CHAR_STR.char_mech_desc, icon: '🦾',
                unlocked: false, weaponSlots: 5, weaponAffinities: ['gun', 'melee', 'lance'],
                stats: { maxHp:180, hpRegen:0.3, speed:140, damage:12, attackSpeed:0.8, attackRange:280, armor:8, dodge:0, critChance:0.03, critMultiplier:1.8, bulletCount:1, bulletPierce:1, bulletSpeed:450, lifeSteal:0, pickupRange:40, harvesting:0, luck:0 },
                unlockCondition: { type: 'maxLevel', value: 5 }
            },
            {
                id: 'assassin', name: _CHAR_STR.char_assassin_name, desc: _CHAR_STR.char_assassin_desc, icon: '🗡️',
                unlocked: false, weaponSlots: 4, weaponAffinities: ['melee', 'bow', 'lance'],
                stats: { maxHp:70, hpRegen:0.8, speed:280, damage:22, attackSpeed:1.5, attackRange:220, armor:0, dodge:0.12, critChance:0.12, critMultiplier:2.8, bulletCount:1, bulletPierce:0, bulletSpeed:550, lifeSteal:0.03, pickupRange:60, harvesting:0, luck:2 },
                unlockCondition: { type: 'totalKills', value: 100 }
            },
            {
                id: 'medic', name: _CHAR_STR.char_medic_name, desc: _CHAR_STR.char_medic_desc, icon: '💊',
                unlocked: false, weaponSlots: 6, weaponAffinities: ['medic'],
                stats: { maxHp:100, hpRegen:2.0, speed:200, damage:12, attackSpeed:1.0, attackRange:280, armor:2, dodge:0.04, critChance:0.05, critMultiplier:2.0, bulletCount:1, bulletPierce:0, bulletSpeed:500, lifeSteal:0.02, pickupRange:70, harvesting:0, luck:1 },
                unlockCondition: { type: 'totalKills', value: 80 }
            },
            {
                id: 'paladin', name: _CHAR_STR.char_paladin_name, desc: _CHAR_STR.char_paladin_desc, icon: '✨',
                unlocked: false, weaponSlots: 6, weaponAffinities: ['melee', 'medic', 'lance'],
                stats: { maxHp:140, hpRegen:1.0, speed:180, damage:16, attackSpeed:0.9, attackRange:220, armor:5, dodge:0.02, critChance:0.05, critMultiplier:2.0, bulletCount:1, bulletPierce:0, bulletSpeed:400, lifeSteal:0.03, pickupRange:50, harvesting:0, luck:0 },
                unlockCondition: { type: 'maxLevel', value: 10 }
            },
            {
                id: 'engineer', name: _CHAR_STR.char_engineer_name, desc: _CHAR_STR.char_engineer_desc, icon: '🔧',
                unlocked: false, weaponSlots: 6, weaponAffinities: ['gun', 'magic'],
                stats: { maxHp:90, hpRegen:0.5, speed:210, damage:14, attackSpeed:1.1, attackRange:320, armor:2, dodge:0.03, critChance:0.12, critMultiplier:3.0, bulletCount:2, bulletPierce:0, bulletSpeed:550, lifeSteal:0, pickupRange:60, harvesting:0, luck:2 },
                unlockCondition: { type: 'totalKills', value: 200 }
            },
            {
                id: 'berserker', name: _CHAR_STR.char_berserker_name, desc: _CHAR_STR.char_berserker_desc, icon: '💢',
                unlocked: false, weaponSlots: 5, weaponAffinities: ['melee', 'gun', 'bow', 'magic', 'medic', 'lance'],
                stats: { maxHp:60, hpRegen:0.3, speed:260, damage:25, attackSpeed:1.6, attackRange:180, armor:0, dodge:0.05, critChance:0.08, critMultiplier:2.5, bulletCount:1, bulletPierce:0, bulletSpeed:450, lifeSteal:0.08, pickupRange:45, harvesting:0, luck:0 },
                unlockCondition: { type: 'maxLevel', value: 15 }
            },
            {
                id: 'dragon_knight', name: _CHAR_STR.char_dragon_knight_name, desc: _CHAR_STR.char_dragon_knight_desc, icon: '🐉',
                unlocked: false, weaponSlots: 5, weaponAffinities: ['lance'],
                stats: { maxHp:150, hpRegen:0.6, speed:240, damage:22, attackSpeed:1.0, attackRange:280, armor:4, dodge:0.02, critChance:0.06, critMultiplier:2.2, bulletCount:1, bulletPierce:0, bulletSpeed:0, lifeSteal:0.02, pickupRange:50, harvesting:0, luck:1 },
                unlockCondition: { type: 'totalKills', value: 300 }
            },
        ];
    },

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
            xpGain: s.xpGain || 0,
            meleeDamage: s.meleeDamage || 0,
            rangedDamage: s.rangedDamage || 0,
            elementalDamage: s.elementalDamage || 0,
            engineering: s.engineering || 0,
            weaponSlots: ch.weaponSlots,
            usedSlots: 0,
        });
        // 分配角色被动
        player.passives = ch.passives || [];
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
