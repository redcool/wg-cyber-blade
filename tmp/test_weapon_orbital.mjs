// 验证武器距离 + 渲染
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto('http://localhost:8000/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

const r = await page.evaluate(() => {
  PlayerSystem.create(640, 450);
  const p = PlayerSystem.player;
  p.weapons = [
    { id: 'pistol', level: 1, quality: 'T1' },     // slots=1
    { id: 'bow', level: 1, quality: 'T1' },         // slots=1
    { id: 'fire_staff', level: 1, quality: 'T1' },  // slots=2
    { id: 'pike', level: 1, quality: 'T1' },        // slots=2
    { id: 'heal_gun', level: 1, quality: 'T1' },    // slots=1
  ];
  for (const w of p.weapons) ShopSystem._updateWeaponParams(p, w.id);
  // 计算轨道
  const positions = PlayerSystem._getWeaponOrbitalPositions(p);
  return {
    playerRadius: p.radius,
    weapons: positions.map(pos => {
      const dx = pos.x - p.x;
      const dy = pos.y - p.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const wpDef = ShopSystem.allWeapons.find(d => d.id === pos.weaponId);
      return {
        id: pos.weaponId,
        slots: wpDef ? wpDef.slots : 1,
        centerDist: Math.round(dist),
        expected: 128 + Math.max(0, (wpDef ? wpDef.slots : 1) - 1) * 6,
        match: Math.abs(dist - (128 + Math.max(0, (wpDef ? wpDef.slots : 1) - 1) * 6)) < 1,
      };
    }),
  };
});

console.log('--- Weapon orbital positions ---');
console.log('Player radius:', r.playerRadius);
for (const w of r.weapons) {
  console.log(`  ${w.id} (slots=${w.slots}) dist=${w.centerDist} expected=${w.expected} ${w.match ? '✅' : '❌'}`);
}

if (errors.length) console.log('ERRORS:', errors);
await page.screenshot({ path: 'tmp/weapon_orbital_128.png' });
console.log('Screenshot: tmp/weapon_orbital_128.png');
await browser.close();
