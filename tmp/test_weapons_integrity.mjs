// tmp/test_weapons_integrity.mjs
// 验证 weapons.json 数据完整性: 每个武器的字段类型正确, 关键字段语义合理
import { strict as A } from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const weapons = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/data/weapons.json'), 'utf-8'));

console.log(`Loaded ${weapons.length} weapons`);

const VALID_BEHAVIORS = new Set([
    'bullet', 'spread', 'melee_sweep', 'melee_thrust',
    'explode', 'frost', 'shock', 'homing', 'spray',
    'heal_bullet', 'shield_aura'
]);

const VALID_CLASSES = new Set([
    'Blade', 'Blunt', 'Precise', 'Elemental', 'Heavy',
    'Medical', 'Support', 'Primitive'
]);

let errors = [];

for (const w of weapons) {
    // id
    if (typeof w.id !== 'string' || !w.id) errors.push(`${w.id || '?'}: invalid id`);
    // behavior must be a known string, not a number
    if (typeof w.behavior !== 'string') errors.push(`${w.id}: behavior is ${typeof w.behavior} "${w.behavior}" (expected string)`);
    else if (!VALID_BEHAVIORS.has(w.behavior)) errors.push(`${w.id}: unknown behavior "${w.behavior}"`);
    // class must be a known string, not a number
    if (typeof w.class !== 'string') errors.push(`${w.id}: class is ${typeof w.class} "${w.class}" (expected string)`);
    else if (!VALID_CLASSES.has(w.class)) errors.push(`${w.id}: unknown class "${w.class}"`);
    // knockback must be a number
    if (typeof w.knockback !== 'number') errors.push(`${w.id}: knockback is ${typeof w.knockback} "${w.knockback}" (expected number)`);
    // magSize must be a number
    if (typeof w.magSize !== 'number') errors.push(`${w.id}: magSize is ${typeof w.magSize} "${w.magSize}"`);
    // reloadTime must be a number
    if (typeof w.reloadTime !== 'number') errors.push(`${w.id}: reloadTime is ${typeof w.reloadTime} "${w.reloadTime}"`);
    // damageReductionAura, killHeal, auraHeal, auraRadius, healOnHit must be numbers
    for (const k of ['damageReductionAura', 'killHeal', 'auraHeal', 'auraRadius', 'healOnHit', 'sprayCone']) {
        if (typeof w[k] !== 'number') errors.push(`${w.id}: ${k} is ${typeof w[k]} "${w[k]}"`);
    }
    // damage_lv1 must be > 0 (except for weapons with minLevel > 1, which start at higher levels)
    if (typeof w.damage_lv1 !== 'number') errors.push(`${w.id}: damage_lv1 is not a number`);
    else if (w.damage_lv1 <= 0 && (w.minLevel || 1) === 1) errors.push(`${w.id}: damage_lv1 is ${w.damage_lv1} (and minLevel=${w.minLevel})`);
    // Medic weapons should have auraHeal or killHeal or damageReductionAura > 0
    if (w.class === 'Medical') {
        const hasEffect = w.auraHeal > 0 || w.killHeal > 0 || w.damageReductionAura > 0 || w.healOnHit > 0;
        if (!hasEffect) errors.push(`${w.id}: Medical weapon but no auraHeal/killHeal/damageReductionAura/healOnHit`);
    }
}

if (errors.length) {
    console.error(`✗ ${errors.length} integrity errors:`);
    for (const e of errors) console.error('  -', e);
    process.exit(1);
}

console.log(`✓ All ${weapons.length} weapons pass integrity checks`);
console.log(`  - All behaviors are valid strings (no numeric shifts)`);
console.log(`  - All classes are valid strings (no numeric shifts)`);
console.log(`  - All numeric fields are numbers`);
console.log(`  - All Medical weapons have healing effects`);

// Print medic weapons summary
const medicWeapons = weapons.filter(w => w.class === 'Medical');
console.log(`\nMedical weapons (${medicWeapons.length}):`);
for (const w of medicWeapons) {
    const effects = [];
    if (w.auraHeal > 0) effects.push(`auraHeal=${w.auraHeal}/s`);
    if (w.damageReductionAura > 0) effects.push(`dRAura=${w.damageReductionAura}`);
    if (w.killHeal > 0) effects.push(`killHeal=${w.killHeal}`);
    if (w.healOnHit > 0) effects.push(`healOnHit=${w.healOnHit}`);
    console.log(`  - ${w.id} (${w.behavior}): ${effects.join(', ')}`);
}

console.log('\nALL PASS');
