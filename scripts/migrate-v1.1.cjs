// scripts/migrate-v1.1.cjs — 一次性数据迁移脚本 (修订版)
// 2026-06-07 v1.1 武器分类体系升级
// 转换 weapons.csv 和 characters.csv
//
// 用法: node scripts/migrate-v1.1.cjs
// 影响: csv/weapons.csv, csv/characters.csv (无破坏,只加字段+调整列顺序)

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ============================================================
// weapon 1级 class 映射 (旧 BroTato 8 → 新 12 class)
// ============================================================
const WEAPON_CLASS_MAP = {
    // 保持不变
    plasma: 'Blade',
    dagger: 'Blade',
    chainsaw: 'Heavy',
    sword: 'Blade',
    hammer: 'Heavy',
    claws: 'Blade',
    whip: 'Blunt',
    fire_staff: 'Elemental',
    frost_staff: 'Elemental',
    thunder_staff: 'Elemental',
    energy_staff: 'Elemental',
    magic_orb: 'Elemental',
    poison_staff: 'Elemental',
    void_staff: 'Elemental',
    lightning_staff: 'Elemental',
    fire_wand: 'Elemental',
    arcane_orb: 'Elemental',
    flame_spray: 'Elemental',
    poison_spray: 'Elemental',
    cold_spray: 'Elemental',
    heal_gun: 'Medical',
    shield: 'Medical',
    holy_staff: 'Medical',
    life_wand: 'Medical',
    blessing: 'Medical',
    cavalry_lance: 'Heavy',
    // 改变
    axe: 'Heavy',
    katana: 'Blade',
    spear: 'Heavy',
    pistol: 'Gun',
    smg: 'Gun',
    shotgun: 'Gun',
    sniper: 'Gun',
    gatling: 'Gun',
    revolver: 'Gun',
    rifle: 'Gun',
    rifle2: 'Gun',
    shotgun_double: 'Gun',
    magnum: 'Gun',
    minigun: 'Gun',
    bow: 'Bow',
    crossbow: 'Crossbow',
    longbow: 'Bow',
    recurve: 'Bow',
    explosive_arrow: 'Bow',
    frost_arrow: 'Bow',
    poison_arrow: 'Bow',
    triple_shot: 'Crossbow',
    piercing_shot: 'Crossbow',
    homing_bow: 'Bow',
    pike: 'Heavy',
    trident: 'Heavy',
};

// ============================================================
// weapon 2级 class_2 映射
// ============================================================
const WEAPON_CLASS_2_MAP = {
    plasma: 'longsword',
    axe: 'greataxe',
    dagger: 'dagger',
    chainsaw: 'greataxe',
    sword: 'longsword',
    katana: 'katana',
    hammer: 'hammer',
    spear: 'pike',
    claws: 'dagger',
    whip: 'flail',
    pistol: 'pistol',
    smg: 'smg',
    shotgun: 'shotgun',
    sniper: 'sniper',
    gatling: 'lmg',
    revolver: 'revolver',
    rifle: 'rifle',
    rifle2: 'rifle',
    shotgun_double: 'shotgun',
    magnum: 'revolver',
    minigun: 'hmg',
    bow: 'longbow',
    crossbow: 'handcrossbow',
    longbow: 'longbow',
    recurve: 'recurve',
    explosive_arrow: 'grenade',
    frost_arrow: 'ice',
    poison_arrow: 'shadow',
    triple_shot: 'repeating',
    piercing_shot: 'heavycrossbow',
    homing_bow: 'longbow',
    fire_staff: 'fire',
    frost_staff: 'ice',
    thunder_staff: 'lightning',
    energy_staff: 'force',
    magic_orb: 'force',
    poison_staff: 'shadow',
    void_staff: 'shadow',
    lightning_staff: 'lightning',
    fire_wand: 'fire',
    arcane_orb: 'force',
    flame_spray: 'fire',
    poison_spray: 'shadow',
    cold_spray: 'ice',
    heal_gun: 'heal',
    shield: 'regen',
    holy_staff: 'holy',
    life_wand: 'heal',
    blessing: 'regen',
    pike: 'pike',
    cavalry_lance: 'lance',
    trident: 'trident',
};

// ============================================================
// 角色 preferredClasses / preferredClasses_2 映射
// (来自 docs/系统设计/角色-class偏好.md)
// ============================================================
const CHARACTER_PREFS = {
    swordsman: {
        preferredClasses: 'Blade|Heavy|Precise',
        preferredClasses_2: 'katana|longsword|rapier|lance|halberd',
    },
    gunslinger: {
        preferredClasses: 'Gun',
        preferredClasses_2: 'pistol|revolver|rifle|sniper',
    },
    fire_mage: {
        preferredClasses: 'Elemental|Explosive',
        preferredClasses_2: 'fire|lightning|force',
    },
    archer: {
        preferredClasses: 'Bow|Crossbow',
        preferredClasses_2: 'longbow|recurve|handcrossbow|heavycrossbow',
    },
    mech: {
        preferredClasses: 'Heavy|Gun',
        preferredClasses_2: 'warhammer|greataxe|lmg|hmg|lance',
    },
    assassin: {
        preferredClasses: 'Precise|Blade',
        preferredClasses_2: 'dagger|rapier|kris|stiletto|composite',
    },
    medic: {
        preferredClasses: 'Medical|Elemental',
        preferredClasses_2: 'heal|regen|holy|force',
    },
    paladin: {
        preferredClasses: 'Blade|Medical|Heavy',
        preferredClasses_2: 'longsword|holy|heal|lance|halberd',
    },
    engineer: {
        preferredClasses: 'Gun|Elemental|Explosive',
        preferredClasses_2: 'rifle|sniper|force|lightning|grenade|rocket',
    },
    dragon_knight: {
        preferredClasses: 'Heavy',
        preferredClasses_2: 'lance|pike|trident',
    },
    berserker: {
        preferredClasses: 'Blade|Blunt|Heavy|Precise|Bow|Crossbow|Gun|Explosive|Elemental|Medical|Support|Primitive',
        preferredClasses_2: 'longsword|katana|saber|scimitar|dagger|rapier|machete|mace|hammer|club|staff|flail|war_staff|greataxe|warhammer|halberd|pike|lance|trident|greataxe|kris|stiletto|longbow|recurve|composite|handcrossbow|heavycrossbow|repeating|pistol|revolver|smg|rifle|sniper|shotgun|lmg|hmg|grenade|rocket|mine|bomb|fire|ice|lightning|wind|force|shadow|earth|holy|chaos|heal|regen|buff|cleanse|shield|aegis|barrier|stone|bone|wood',
    },
    // v1.1 新增
    crossbowman: {
        preferredClasses: 'Crossbow|Bow',
        preferredClasses_2: 'handcrossbow|heavycrossbow|repeating|longbow',
    },
    // 7 角色补全 (v1.1 启用之前注释的角色)
    boxer: {
        preferredClasses: 'Heavy|Blunt',
        preferredClasses_2: 'fist|gauntlet|tonfa|flail|war_staff',
    },
    axeman: {
        preferredClasses: 'Heavy',
        preferredClasses_2: 'greataxe|battleaxe|halberd|warhammer',
    },
    lancer: {
        preferredClasses: 'Heavy',
        preferredClasses_2: 'lance|pike|halberd|trident',
    },
    blade_wielder: {
        preferredClasses: 'Blade|Precise',
        preferredClasses_2: 'katana|longsword|rapier|saber|scimitar',
    },
    ninja: {
        preferredClasses: 'Precise|Blade',
        preferredClasses_2: 'dagger|kris|stiletto|shuriken|composite|longbow',
    },
    ji_master: {
        preferredClasses: 'Elemental|Medical',
        preferredClasses_2: 'force|wind|holy|heal|regen',
    },
    teng_pai_guard: {
        preferredClasses: 'Medical|Heavy',
        preferredClasses_2: 'shield|regen|lance|halberd',
    },
};

// ============================================================
// 转换 weapons.csv
// 旧: 46 cols, slots at 4, class at 42
// 新: 46 cols, no slots, class at 41, class_2 at 42
// ============================================================
function transformWeaponsCsv() {
    const csvPath = path.join(ROOT, 'csv/weapons.csv');
    const original = fs.readFileSync(csvPath, 'utf-8');
    // 幂等检查: 如果 header 已含 class_2, 说明已迁移过
    if (original.split(/\r?\n/).some(l => l.startsWith('id,') && l.includes(',class_2,'))) {
        console.log(`- weapons.csv 已迁移过, 跳过`);
        return;
    }
    const lines = original.split(/\r?\n/);
    const out = [];

    for (const line of lines) {
        if (line.trim() === '' || line.startsWith('#')) {
            out.push(line);
            continue;
        }
        if (line.startsWith('id,')) {
            // header: 移除 slots, 在 class 后加 class_2
            // 旧: id,name,desc,icon,slots,cost,tag,...,class,knockback,...,reloadTime
            // 新: id,name,desc,icon,cost,tag,...,class,class_2,knockback,...,reloadTime
            const newHeader = line
                .replace(',slots,', ',')          // 移除 slots
                .replace(',class,', ',class,class_2,');  // 在 class 后加 class_2
            out.push(newHeader);
            continue;
        }
        // data row
        const fields = line.split(',');
        const id = fields[0];
        if (!id) { out.push(line); continue; }
        // 移除 slots (原 index 4)
        fields.splice(4, 1);
        // 此时 fields 长度 45, class 在 index 41
        // 更新 class 字段 (新 12 类)
        if (WEAPON_CLASS_MAP[id]) {
            fields[41] = WEAPON_CLASS_MAP[id];
        }
        // 插入 class_2 在 class 后 (index 42)
        const class2 = WEAPON_CLASS_2_MAP[id] || '';
        fields.splice(42, 0, class2);
        // 此时 fields 长度 46, class at 41, class_2 at 42
        out.push(fields.join(','));
    }
    fs.writeFileSync(csvPath, out.join('\n'), 'utf-8');
    console.log(`✓ weapons.csv 已转换 (52 把武器更新 class/class_2, 移除 slots)`);
}

// ============================================================
// 转换 characters.csv
// 旧: 29 cols, weaponSlots at 5, ends with passives at 28
// 新: 31 cols, maxWeapons at 5, passives at 28, preferredClasses at 29, preferredClasses_2 at 30
// ============================================================
function transformCharactersCsv() {
    const csvPath = path.join(ROOT, 'csv/characters.csv');
    const original = fs.readFileSync(csvPath, 'utf-8');
    const lines = original.split(/\r?\n/);
    const out = [];

    for (const line of lines) {
        if (line.trim() === '' || line.startsWith('#')) {
            out.push(line);
            continue;
        }
        if (line.startsWith('id,')) {
            // header: weaponSlots → maxWeapons, 末尾加 preferredClasses, preferredClasses_2
            const newHeader = line
                .replace(',weaponSlots,', ',maxWeapons,')
                .replace(/,passives$/, ',passives,preferredClasses,preferredClasses_2');
            out.push(newHeader);
            continue;
        }
        // data row
        const fields = line.split(',');
        const id = fields[0];
        if (!id) { out.push(line); continue; }
        // 追加 preferredClasses + preferredClasses_2
        const prefs = CHARACTER_PREFS[id];
        if (prefs) {
            fields.push(prefs.preferredClasses);
            fields.push(prefs.preferredClasses_2);
        } else {
            fields.push('');
            fields.push('');
        }
        out.push(fields.join(','));
    }

    // 记录已存在 id (用于幂等检查)
    const existingIds = new Set();
    for (const line of out) {
        const t = line.trim();
        if (t.startsWith('#') || t === '' || t.startsWith('id,')) continue;
        const id = t.split(',')[0];
        if (id) existingIds.add(id);
    }

    // 追加 crossbowman 行 (v1.1 新增, 幂等)
    // desc 使用 ';' 分隔避免与 CSV 逗号冲突
    if (!existingIds.has('crossbowman')) {
        const cx = CHARACTER_PREFS.crossbowman;
        const crossbowmanRow = [
            'crossbowman',                // id
            '弩手',                        // name
            '弩系专精;中距高穿透;跨弩弓双系',  // desc (用;代替,)
            '🎯',                          // icon
            'false',                       // unlocked
            '6',                           // maxWeapons
            '25',                          // maxHp
            '0.1',                         // hpRegen
            '100',                         // speed
            '0',                           // damagePercent
            '0.9',                         // attackSpeed
            '380',                         // attackRange
            '1',                           // armor
            '0.04',                        // dodge
            '0.08',                        // critChance
            '0',                           // critDamage
            '0.02',                        // lifeSteal
            '20',                          // pickupRange
            '0',                           // harvesting
            '0',                           // luck
            '0',                           // xpGain
            '0',                           // meleeDamage
            '0',                           // rangedDamage
            '0',                           // elementalDamage
            '0',                           // engineering
            'bow',                         // tags
            'totalKills',                  // unlockType
            '60',                          // unlockValue
            '',                            // passives
            cx.preferredClasses,           // preferredClasses
            cx.preferredClasses_2,         // preferredClasses_2
        ];
        out.push(crossbowmanRow.join(','));
        existingIds.add('crossbowman');
    }

    // 追加 7 个之前注释角色 (v1.1 启用, 幂等)
    // desc 使用 ';' 分隔避免与 CSV 逗号冲突
    const newChars = [
        {
            id: 'boxer',
            name: '拳手',
            desc: '拳拳到肉的近战格斗家',
            icon: '🥊',
            maxWeapons: 4,
            maxHp: 22, hpRegen: 0.15, speed: 130,
            damagePercent: 0, attackSpeed: 1.4, attackRange: 180,
            armor: 0, dodge: 0.05, critChance: 0.10, critDamage: 0,
            lifeSteal: 0.03, pickupRange: 18,
            tags: 'melee|crit',
            unlockType: 'totalKills', unlockValue: 30,
        },
        {
            id: 'axeman',
            name: '斧战士',
            desc: '重斧挥击的破坏者',
            icon: '🪓',
            maxWeapons: 5,
            maxHp: 32, hpRegen: 0.05, speed: 95,
            damagePercent: 0, attackSpeed: 0.85, attackRange: 200,
            armor: 2, dodge: 0.02, critChance: 0.04, critDamage: 0,
            lifeSteal: 0, pickupRange: 15,
            tags: 'melee',
            unlockType: 'totalKills', unlockValue: 50,
        },
        {
            id: 'lancer',
            name: '枪兵',
            desc: '长枪阵的破甲兵',
            icon: '🔱',
            maxWeapons: 5,
            maxHp: 28, hpRegen: 0.08, speed: 110,
            damagePercent: 0, attackSpeed: 1.0, attackRange: 260,
            armor: 1, dodge: 0.03, critChance: 0.06, critDamage: 0,
            lifeSteal: 0, pickupRange: 18,
            tags: 'melee|lance',
            unlockType: 'maxLevel', unlockValue: 3,
        },
        {
            id: 'blade_wielder',
            name: '剑圣',
            desc: '剑意无双的刀锋大师',
            icon: '🗡️',
            maxWeapons: 4,
            maxHp: 20, hpRegen: 0.12, speed: 125,
            damagePercent: 0, attackSpeed: 1.3, attackRange: 200,
            armor: 0, dodge: 0.06, critChance: 0.10, critDamage: 0.5,
            lifeSteal: 0.02, pickupRange: 18,
            tags: 'melee|crit',
            unlockType: 'totalKills', unlockValue: 80,
        },
        {
            id: 'ninja',
            name: '忍者',
            desc: '影中潜行的暗影杀手',
            icon: '🥷',
            maxWeapons: 5,
            maxHp: 16, hpRegen: 0.15, speed: 150,
            damagePercent: 0, attackSpeed: 1.5, attackRange: 240,
            armor: 0, dodge: 0.15, critChance: 0.12, critDamage: 0,
            lifeSteal: 0.04, pickupRange: 20,
            tags: 'melee|bow|crit',
            unlockType: 'totalKills', unlockValue: 150,
        },
        {
            id: 'ji_master',
            name: '气功师',
            desc: '内气外放的武学宗师',
            icon: '☯️',
            maxWeapons: 6,
            maxHp: 22, hpRegen: 0.3, speed: 105,
            damagePercent: 0, attackSpeed: 1.0, attackRange: 320,
            armor: 0, dodge: 0.05, critChance: 0.05, critDamage: 0,
            lifeSteal: 0.02, pickupRange: 20,
            tags: 'magic',
            unlockType: 'maxLevel', unlockValue: 8,
        },
        {
            id: 'teng_pai_guard',
            name: '藤牌兵',
            desc: '藤牌护身的坚守者',
            icon: '🛡️',
            maxWeapons: 6,
            maxHp: 36, hpRegen: 0.2, speed: 95,
            damagePercent: 0, attackSpeed: 0.95, attackRange: 180,
            armor: 3, dodge: 0.08, critChance: 0.04, critDamage: 0,
            lifeSteal: 0, pickupRange: 18,
            tags: 'melee|medic|lance',
            unlockType: 'totalKills', unlockValue: 120,
        },
    ];
    for (const ch of newChars) {
        if (existingIds.has(ch.id)) continue;  // 幂等
        const prefs = CHARACTER_PREFS[ch.id];
        const row = [
            ch.id, ch.name, ch.desc, ch.icon,
            'false',                    // unlocked
            ch.maxWeapons.toString(),
            ch.maxHp.toString(),
            ch.hpRegen.toString(),
            ch.speed.toString(),
            ch.damagePercent.toString(),
            ch.attackSpeed.toString(),
            ch.attackRange.toString(),
            ch.armor.toString(),
            ch.dodge.toString(),
            ch.critChance.toString(),
            ch.critDamage.toString(),
            ch.lifeSteal.toString(),
            ch.pickupRange.toString(),
            '0',                        // harvesting
            '0',                        // luck
            '0',                        // xpGain
            '0',                        // meleeDamage
            '0',                        // rangedDamage
            '0',                        // elementalDamage
            '0',                        // engineering
            ch.tags,
            ch.unlockType,
            ch.unlockValue.toString(),
            '',                         // passives
            prefs.preferredClasses,
            prefs.preferredClasses_2,
        ];
        out.push(row.join(','));
        existingIds.add(ch.id);
    }
    fs.writeFileSync(csvPath, out.join('\n'), 'utf-8');
    console.log(`✓ characters.csv 已转换 (11 角色加偏好, 1 新增 crossbowman, 7 启用注释角色, weaponSlots → maxWeapons)`);
}

// ============================================================
// 入口
// ============================================================
console.log('[migrate-v1.1] 开始迁移...\n');
transformWeaponsCsv();
transformCharactersCsv();
console.log('\n[migrate-v1.1] 完成');
console.log('  下一步: 改 scripts/csv2json.cjs schema, 然后 node scripts/csv2json.cjs');
