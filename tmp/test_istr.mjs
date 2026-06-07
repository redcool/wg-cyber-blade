import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext()).newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
await p.goto('http://localhost:8000/index.html', { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
const names = ['character_charsData','enemy_charsData','engine-shop_charsData','loot_charsData','rarityColors_charsData','save_charsData','shop_charsData','stats_charsData','tags_charsData','ui_charsData','wave_charsData'];
let allOk = true;
for (const n of names) {
  const r = await p.evaluate(async (n) => {
    DataLoader.clearCache();
    const d = await DataLoader.load(n);
    return { ok: !!d, len: d ? (Array.isArray(d) ? d.length : Object.keys(d).length) : 0 };
  }, n);
  if (!r.ok || r.len === 0) { allOk = false; console.log('FAIL', n, JSON.stringify(r)); }
  else console.log('OK ', n, 'len=' + r.len);
}
console.log(allOk ? 'ALL CHARS-DATA OK' : 'SOME FAILED');
if (errs.length) { console.log('ERRORS:'); errs.forEach((e) => console.log(e)); }
await b.close();
process.exitCode = allOk ? 0 : 1;
