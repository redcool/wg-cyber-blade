// 查看 weapons.csv 中 3 个 spray 武器的实际解析后字段
const fs = require('fs');
const csv = fs.readFileSync('csv/weapons.csv', 'utf8');
const lines = csv.split('\n');
const headerLine = lines.findIndex(l => l.startsWith('id,'));
const header = lines[headerLine].split(',').map(s=>s.trim());
console.log('Header total cols:', header.length);
console.log('Header fields:', header.join('|'));

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuote = false;
  for (let i=0; i<line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuote = !inQuote; continue; }
    if (c === ',' && !inQuote) { result.push(cur.trim()); cur=''; continue; }
    cur += c;
  }
  result.push(cur.trim());
  return result;
}

const dataLines = lines.slice(headerLine+1).filter(l => l && !l.startsWith('#'));
for (const l of dataLines) {
  if (l.startsWith('flame_spray,') || l.startsWith('poison_spray,') || l.startsWith('cold_spray,') || l.startsWith('plasma,')) {
    const cols = parseCSVLine(l);
    const obj = {};
    header.forEach((h,i) => obj[h] = cols[i]);
    console.log('---', obj.id, '---');
    console.log('  bulletCount:', obj.bulletCount, '| bulletSpeed:', obj.bulletSpeed, '| bulletMaxRange:', obj.bulletMaxRange);
    console.log('  attackRange:', obj.attackRange, '| spread:', obj.spread, '| pierce:', obj.pierce);
    console.log('  burnDps:', obj.burnDps, '| burnMaxStacks:', obj.burnMaxStacks, '| chainCount:', obj.chainCount);
    console.log('  splashRadius:', obj.splashRadius, '| slowAmount:', obj.slowAmount, '| slowDuration:', obj.slowDuration);
    console.log('  sprayCone:', obj.sprayCone, '| behavior:', obj.behavior, '| class:', obj.class, '| knockback:', obj.knockback);
    console.log('  desc:', obj.desc);
  }
}
