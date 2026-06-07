import { readFileSync } from 'fs';
const w = JSON.parse(readFileSync('H:/ai_works/buffPrj1/src/data/weapons.json', 'utf8'));
const meds = w.filter(x => x.tag === 'medic');
for (const m of meds) {
  const aura = (m.auraHeal||0) > 0 && (m.auraRadius||0) > 0;
  const bugAura = (m.auraHeal > 0 && m.auraRadius === 0) || (m.auraHeal === 0 && m.auraRadius > 0);
  const hasLifeStealDesc = m.desc && (m.desc.includes('回血') || m.desc.includes('吸血') || m.desc.includes('生命偷取'));
  const lifeStealMismatch = hasLifeStealDesc && !(m.lifeStealAdd > 0);
  const hasAuraDesc = m.desc && (m.desc.includes('光环') || m.desc.includes('aura'));
  const auraMismatch = hasAuraDesc && !aura;
  const bug = bugAura || lifeStealMismatch || auraMismatch;
  console.log(`[${m.id}] ${m.name}  ${bug?'[BUG]':''}`);
  console.log(`  desc: ${m.desc}`);
  console.log(`  auraHeal=${m.auraHeal||0}  auraRadius=${m.auraRadius||0}  ${bugAura?'⚠️ aura mismatch':''}  ${hasAuraDesc && !aura?'⚠️ desc mentions aura but broken':''}`);
  console.log(`  lifeStealAdd=${m.lifeStealAdd||0}  ${lifeStealMismatch?'⚠️ desc says lifeSteal but data is 0':''}`);
  console.log(`  hpRegen=${m.hpRegenAdd||0}  maxHp=${m.maxHpAdd||0}  armor=${m.armorAdd||0}  speedMult=${m.speedMult||0}`);
  console.log(`  damage=${m.damage_lv1} cd=${m.cooldown_lv1} range=${m.attackRange} behavior=${m.behavior}`);
  console.log();
}
