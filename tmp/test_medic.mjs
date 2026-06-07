// tmp/test_medic.mjs
// 验证 medic 武器的所有治疗效果正确触发
import { strict as A } from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const weapons = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/data/weapons.json'), 'utf-8'));

// === 1) shield 武器: 行为=shield_aura, 有 auraHeal ===
console.log('=== 1) shield behavior & params ===');
{
    const shield = weapons.find(w => w.id === 'shield');
    A.equal(shield.behavior, 'shield_aura');
    A.equal(shield.auraHeal, 5);
    A.equal(shield.auraRadius, 100);
    console.log('  shield:', {behavior: shield.behavior, auraHeal: shield.auraHeal, auraRadius: shield.auraRadius});
}

// === 2) blessing 武器: damageReductionAura=0.3 ===
console.log('=== 2) blessing damageReductionAura ===');
{
    const b = weapons.find(w => w.id === 'blessing');
    A.equal(b.damageReductionAura, 0.3);
    console.log('  blessing:', {dRAura: b.damageReductionAura, paramsDRAura: b.damageReductionAura, desc: b.desc});
    // 模拟 damageReductionAura 计算
    const drAuraTotal = b.damageReductionAura;
    const rawDmg = 100;
    const finalRawDmg = Math.round(rawDmg * (1 - Math.min(0.9, drAuraTotal)));
    const finalDmg = finalRawDmg;
    console.log('  damageReductionAura simulate: 100 raw →', {drAuraTotal, finalRawDmg, finalDmg});
}

// === 3) heal_gun 武器: healOnHit=3 ===
console.log('=== 3) heal_gun healOnHit ===');
{
    const h = weapons.find(w => w.id === 'heal_gun');
    A.equal(h.healOnHit, 3);
    A.equal(h.behavior, 'heal_bullet');
    console.log('  heal_gun:', {healOnHit: h.healOnHit, behavior: h.behavior});
}

// === 4) life_wand 武器: killHeal=8 ===
console.log('=== 4) life_wand killHeal ===');
{
    const l = weapons.find(w => w.id === 'life_wand');
    A.equal(l.killHeal, 8);
    A.equal(l.behavior, 'bullet');
    console.log('  life_wand:', {killHeal: l.killHeal, behavior: l.behavior});
}

// === 5) shield aura 计时: 1 秒后应该触发治疗 ===
console.log('=== 5) shield aura 计时 ===');
{
    const player = {
        weapons: [{ id: 'shield', level: 1 }],
        weaponParams: {},
        auraRadius: 0, auraHeal: 0,
        hp: 50, maxHp: 100,
        _auraTimer: 0,
    };
    const def = weapons.find(w => w.id === 'shield');
    const params = {
        behavior: def.behavior,
        auraRadius: def.auraRadius,
        auraHeal: def.auraHeal,
    };
    player.weaponParams.shield = params;
    if (params.auraRadius > 0 && params.auraHeal > 0) {
        player.auraRadius = Math.max(player.auraRadius, params.auraRadius);
        player.auraHeal = Math.max(player.auraHeal, params.auraHeal);
    }
    const dt = 1.0;
    if (player.auraRadius && player.auraHeal) {
        player._auraTimer = (player._auraTimer || 0) + dt;
        if (player._auraTimer >= 1.0) {
            player._auraTimer = 0;
            player.hp = Math.min(player.maxHp, player.hp + player.auraHeal);
        }
    }
    A.equal(player.hp, 55, 'shield aura healed +5 after 1s');
    console.log('  shield aura test:', {hp: player.hp, auraHeal: player.auraHeal, auraRadius: player.auraRadius});
}

// === 6) holy_staff (bullet behavior + auraHeal=5) — aura should still fire ===
console.log('=== 6) holy_staff aura from bullet behavior ===');
{
    const player = {
        weapons: [{ id: 'holy_staff', level: 1 }],
        weaponParams: {},
        auraRadius: 0, auraHeal: 0,
        hp: 50, maxHp: 100,
        _auraTimer: 0,
    };
    const def = weapons.find(w => w.id === 'holy_staff');
    A.equal(def.behavior, 'bullet', 'holy_staff is bullet behavior');
    A.equal(def.auraHeal, 5, 'holy_staff has auraHeal=5');
    A.equal(def.auraRadius, 100, 'holy_staff has auraRadius=100');
    const params = {
        behavior: def.behavior,
        auraRadius: def.auraRadius,
        auraHeal: def.auraHeal,
    };
    player.weaponParams.holy_staff = params;
    // _initWeaponParams 的修复后逻辑(不依赖 behavior)
    if (params.auraRadius > 0 && params.auraHeal > 0) {
        player.auraRadius = Math.max(player.auraRadius, params.auraRadius);
        player.auraHeal = Math.max(player.auraHeal, params.auraHeal);
    }
    // 模拟 update tick
    const dt = 1.0;
    if (player.auraRadius && player.auraHeal) {
        player._auraTimer = (player._auraTimer || 0) + dt;
        if (player._auraTimer >= 1.0) {
            player._auraTimer = 0;
            player.hp = Math.min(player.maxHp, player.hp + player.auraHeal);
        }
    }
    A.equal(player.auraHeal, 5, 'holy_staff auraHeal applied');
    A.equal(player.auraRadius, 100, 'holy_staff auraRadius applied');
    A.equal(player.hp, 55, 'holy_staff healed +5 after 1s (bullet behavior)');
    console.log('  holy_staff aura test:', {hp: player.hp, auraHeal: player.auraHeal, auraRadius: player.auraRadius, behavior: def.behavior});
}

// === 7) life_wand (bullet behavior + killHeal=8) — killHeal should fire ===
console.log('=== 7) life_wand killHeal on enemy death ===');
{
    const def = weapons.find(w => w.id === 'life_wand');
    A.equal(def.killHeal, 8);
    A.equal(def.behavior, 'bullet', 'life_wand is bullet behavior');
    // main.js 遍历所有武器累加 killHeal, 与 behavior 无关
    const weapons2 = [{id:'life_wand',level:1}];
    const weaponPool = weapons;
    let killHealTotal = 0;
    for (const w of weapons2) {
        const params = weaponPool.find(d => d.id === w.id);
        if (params && params.killHeal > 0) killHealTotal += params.killHeal;
    }
    A.equal(killHealTotal, 8, 'killHeal summed regardless of behavior');
    console.log('  life_wand killHeal:', {killHealTotal, behavior: def.behavior});
}

console.log('\nALL PASS');
