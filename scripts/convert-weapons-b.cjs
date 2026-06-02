// ============================================================
// convert-weapons-b.js
// 将旧版 weapons.csv (damageMult/attackSpeedMult) 转为
// 新版 Design B (damage_lv1~4 / cooldown_lv1~4)
// BroTato-inspired 平衡参数
// ============================================================

const fs = require('fs');
const path = require('path');

// ---------- BroTato-inspired 等级缩放 ----------
// 参考 BroTato 不同武器类型: T1→T4 约 3x~5x 成长
const SCALE = {
    // 每级伤害成长倍率
    dmg: { lv2: 1.7, lv3: 1.6, lv4: 1.5 },
    // 每级冷却缩减 (越低越快)
    cd:  { lv2: 0.93, lv3: 0.93, lv4: 0.92 },
};

// 读取旧 CSV
const oldCsv = fs.readFileSync(path.resolve(__dirname, '..', 'csv', 'weapons.csv'), 'utf-8');
const lines = oldCsv.split(/\r?\n/);

// 解析旧列名行（第22行）
const headerLine = lines.find(l => l.startsWith('id,name,desc,icon'));
const oldHeaders = headerLine.split(',');

// 找到 key 列的索引
const idx = {};
oldHeaders.forEach((h, i) => idx[h.trim()] = i);

// 生成新 CSV 行
const newLines = [];
let inHeader = false;

for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed === '') { newLines.push(''); continue; }
    
    if (trimmed.startsWith('#') && trimmed.includes('列顺序')) {
        // 更新列顺序注释
        newLines.push('# 列顺序 (45列):');
        newLines.push('# id, name, desc, icon, slots, cost, tag, minLevel,');
        newLines.push('# damage_lv1, damage_lv2, damage_lv3, damage_lv4,');
        newLines.push('# cooldown_lv1, cooldown_lv2, cooldown_lv3, cooldown_lv4,');
        newLines.push('# attackRangeMult, speedMult,');
        newLines.push('# critChanceAdd, critDamageAdd, armorAdd, hpRegenAdd, maxHpAdd, lifeStealAdd,');
        newLines.push('# bulletCount, bulletSpeed, attackRange, spread, pierce, meleeRange,');
        newLines.push('# burnDps, burnMaxStacks, chainCount, splashRadius, homingStrength,');
        newLines.push('# slowAmount, slowDuration, healOnHit, auraHeal, auraRadius, sprayCone,');
        newLines.push('# behavior, class, knockback');
        continue;
    }
    
    if (trimmed.startsWith('#')) { newLines.push(trimmed); continue; }
    
    const fields = trimmed.split(',');
    if (fields.length < 2) { newLines.push(trimmed); continue; }
    
    // 跳过旧列名行
    if (fields[0] === 'id') {
        // 输出新列名行
        newLines.push([
            'id', 'name', 'desc', 'icon', 'slots', 'cost', 'tag', 'minLevel',
            'damage_lv1', 'damage_lv2', 'damage_lv3', 'damage_lv4',
            'cooldown_lv1', 'cooldown_lv2', 'cooldown_lv3', 'cooldown_lv4',
            'attackRangeMult', 'speedMult',
            'critChanceAdd', 'critDamageAdd', 'armorAdd', 'hpRegenAdd', 'maxHpAdd', 'lifeStealAdd',
            'bulletCount', 'bulletSpeed', 'attackRange', 'spread', 'pierce', 'meleeRange',
            'burnDps', 'burnMaxStacks', 'chainCount', 'splashRadius', 'homingStrength',
            'slowAmount', 'slowDuration', 'healOnHit', 'auraHeal', 'auraRadius', 'sprayCone',
            'behavior', 'class', 'knockback',
        ].join(','));
        continue;
    }
    
    // --- 解析旧字段 ---
    const getF = (name) => {
        const i = idx[name];
        return i !== undefined && i < fields.length ? fields[i] : '';
    };
    const getN = (name, def) => {
        const v = parseFloat(getF(name));
        return isNaN(v) ? def : v;
    };
    
    const id = getF('id');
    const name = getF('name');
    const desc = getF('desc');
    const icon = getF('icon');
    const slots = getF('slots');
    const cost = getF('cost');
    const tag = getF('tag');
    
    const damageMult = getN('damageMult', 1.0);
    const atkSpdMult = getN('attackSpeedMult', 1.0);
    
    const attackRangeMult = getN('attackRangeMult', 0);
    const speedMult = getN('speedMult', 0);
    const critChanceAdd = getF('critChanceAdd');
    const critDamageAdd = getF('critDamageAdd');
    const armorAdd = getF('armorAdd');
    const hpRegenAdd = getF('hpRegenAdd');
    const maxHpAdd = getF('maxHpAdd');
    const lifeStealAdd = getF('lifeStealAdd');
    const bulletCount = getF('bulletCount');
    const bulletSpeed = getF('bulletSpeed');
    const attackRange = getF('attackRange');
    const spread = getF('spread');
    const pierce = getF('pierce');
    const meleeRange = getF('meleeRange');
    const burnDps = getF('burnDps');
    const burnMaxStacks = getF('burnMaxStacks');
    const chainCount = getF('chainCount');
    const splashRadius = getF('splashRadius');
    const homingStrength = getF('homingStrength');
    const slowAmount = getF('slowAmount');
    const slowDuration = getF('slowDuration');
    const healOnHit = getF('healOnHit');
    const auraHeal = getF('auraHeal');
    const auraRadius = getF('auraRadius');
    const sprayCone = getF('sprayCone');
    const behavior = getF('behavior');
    const weaponClass = getF('class');
    const knockback = getF('knockback');
    
    // --- BroTato 调优: 计算 per-level 数值 ---
    
    // 基础伤害: 旧版 effective = damageMult × 15
    // 新版 L1 = round(旧/5)*5, 保持接近
    const oldEffDmg = damageMult * 15;
    let dmgL1 = Math.round(oldEffDmg / 5) * 5;
    if (dmgL1 < 5) dmgL1 = Math.round(oldEffDmg); // 极小值武器保留精确值
    
    // BroTato 参考调优: 根据武器类型微调成长率
    // 远程/快速武器: 高成长 (升级收益明显)
    // 近战/重武器: 中成长
    // 医疗/辅助: 低成长 (功能性为主)
    let dmgScale;
    if (tag === 'medic') {
        dmgScale = { lv2: 1.5, lv3: 1.4, lv4: 1.3 };
    } else if (tag === 'magic') {
        dmgScale = { lv2: 1.6, lv3: 1.5, lv4: 1.4 };
    } else if (behavior === 'spray') {
        dmgScale = { lv2: 1.5, lv3: 1.4, lv4: 1.3 };
    } else {
        dmgScale = SCALE.dmg;
    }
    
    const dmgL2 = Math.round(dmgL1 * dmgScale.lv2 / 5) * 5 || dmgL1 + 5;
    const dmgL3 = Math.round(dmgL2 * dmgScale.lv3 / 5) * 5 || dmgL2 + 5;
    const dmgL4 = Math.round(dmgL3 * dmgScale.lv4 / 5) * 5 || dmgL3 + 5;
    
    // Cooldown: 旧版 attackSpeedMult (秒). 保持 L1 一致
    const cdL1 = atkSpdMult;
    const cdL2 = Math.round(atkSpdMult * SCALE.cd.lv2 * 100) / 100;
    const cdL3 = Math.round(cdL2 * SCALE.cd.lv3 * 100) / 100;
    const cdL4 = Math.round(cdL3 * SCALE.cd.lv4 * 100) / 100;
    
    // minLevel: 高成本武器从 L2 起步 (cost ≥ 18)
    const minLevel = (parseInt(cost) >= 18 || id === 'minigun') ? 2 : 1;
    
    // 输出新行
    // 如果 minLevel ≥ 2, L1 留空
    const d1 = minLevel >= 2 ? '' : dmgL1;
    const c1 = minLevel >= 2 ? '' : cdL1;
    
    const newRow = [
        id, name, desc, icon, slots, cost, tag, minLevel,
        d1, dmgL2, dmgL3, dmgL4,
        c1, cdL2, cdL3, cdL4,
        attackRangeMult, speedMult,
        critChanceAdd, critDamageAdd, armorAdd, hpRegenAdd, maxHpAdd, lifeStealAdd,
        bulletCount, bulletSpeed, attackRange, spread, pierce, meleeRange,
        burnDps, burnMaxStacks, chainCount, splashRadius, homingStrength,
        slowAmount, slowDuration, healOnHit, auraHeal, auraRadius, sprayCone,
        behavior, weaponClass, knockback,
    ];
    newLines.push(newRow.join(','));
}

// 输出到 weapons.csv (覆盖原文件)
const outPath = path.resolve(__dirname, '..', 'csv', 'weapons.csv');
fs.writeFileSync(outPath, newLines.join('\n'), 'utf-8');
console.log(`✓ 已生成新 ${outPath}`);
console.log(`  共处理 ${lines.filter(l => l.trim() && !l.trim().startsWith('#') && !l.startsWith('id')).length} 行武器数据`);

// 打印几个样例
console.log('\n--- 样例对比 ---');
const sampleIds = ['plasma', 'dagger', 'pistol', 'hammer', 'smg', 'heal_gun'];
const newData = fs.readFileSync(outPath, 'utf-8');
for (const sid of sampleIds) {
    const line = newData.split('\n').find(l => l.startsWith(sid));
    if (line) {
        const f = line.split(',');
        console.log(`\n${f[0]} (${f[1]}):`);
        console.log(`  minLevel=${f[7]}, dmg=[${f[8]},${f[9]},${f[10]},${f[11]}], cd=[${f[12]},${f[13]},${f[14]},${f[15]}]`);
    }
}
