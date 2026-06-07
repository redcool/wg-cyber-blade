// 重平衡 weapons.csv 击退值
const fs = require('fs');
const path = require('path');
const csvPath = path.join('csv', 'weapons.csv');
const lines = fs.readFileSync(csvPath, 'utf8').split('\n');

// 找表头行
let headerLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith('id,name,')) { headerLine = i; break; }
}
console.log('Header at line', headerLine + 1, 'header length:', lines[headerLine].split(',').length);
const header = lines[headerLine].split(',');
const kbIdx = header.indexOf('knockback');
const tagIdx = header.indexOf('tag');
const clsIdx = header.indexOf('class');
const idIdx = header.indexOf('id');
const nameIdx = header.indexOf('name');
console.log('Indices: id=', idIdx, 'name=', nameIdx, 'tag=', tagIdx, 'class=', clsIdx, 'knockback=', kbIdx);

// 新击退规则:
// 远程 (tag = ranged/bow/gun/precise/elemental/support/medical/primitive): 25-100 → 30-50
// 近战 (tag = melee/blade/blunt/heavy): 200-600 → 80-180
// 重型 (lance, hammer, chainsaw): 200-400 → 150-200

function newKb(tag, cls, oldKb, id) {
  if (id === 'hammer') return 200;       // 重武器 200
  if (id === 'lance') return 200;        // 长枪 200
  if (id === 'chainsaw') return 180;     // 链锯 180 (燃烧惩罚)
  if (id === 'plasma') return 120;       // 等离子刀 120
  // 远程 tag
  if (tag === 'ranged' || tag === 'gun' || tag === 'bow') {
    return Math.max(20, Math.min(50, oldKb > 60 ? 50 : oldKb));
  }
  // 元素/医疗/支持
  if (tag === 'elemental' || tag === 'medical' || tag === 'support') {
    return Math.max(20, Math.min(50, oldKb > 70 ? 50 : oldKb));
  }
  // 远程 primitive
  if (tag === 'primitive' && cls !== 'Heavy') {
    return Math.max(20, Math.min(50, oldKb > 70 ? 50 : oldKb));
  }
  // 近战
  if (tag === 'melee' || tag === 'blade' || tag === 'blunt') {
    if (oldKb > 400) return 150;
    if (oldKb > 300) return 130;
    if (oldKb > 200) return 100;
    if (oldKb > 100) return 80;
    return Math.max(50, oldKb);
  }
  return oldKb;
}

let changedCount = 0;
let processedCount = 0;
const out = lines.map((line, idx) => {
  if (idx <= headerLine || line.startsWith('#') || !line.trim()) return line;
  const cols = line.split(',');
  if (cols.length < 44) return line;
  processedCount++;
  const tag = cols[tagIdx];
  const cls = cols[clsIdx];
  const id = cols[idIdx];
  const name = cols[nameIdx];
  const oldKb = parseInt(cols[kbIdx]) || 0;
  const nk = newKb(tag, cls, oldKb, id);
  if (nk !== oldKb) {
    cols[kbIdx] = String(nk);
    changedCount++;
    console.log(`  ${id} (${name}) tag=${tag} cls=${cls}: ${oldKb} → ${nk}`);
  }
  return cols.join(',');
});
console.log(`Processed ${processedCount} weapons.`);

fs.writeFileSync(csvPath, out.join('\n'), 'utf8');
console.log(`\nUpdated ${changedCount} weapons.`);
