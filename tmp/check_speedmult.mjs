import {readFileSync} from 'fs';
const w = JSON.parse(readFileSync('H:/ai_works/buffPrj1/src/data/weapons.json','utf8'));
for (const id of ['shield','blessing','heal_gun','life_wand','holy_staff']) {
  const x = w.find(y=>y.id===id);
  console.log(`[${x.id}] desc='${x.desc}' speedMult=${x.speedMult||0}`);
}
