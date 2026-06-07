// 验证 SystemConfig + 武器轨道配置
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });

await page.goto('http://localhost:8000/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

const r = await page.evaluate(async () => {
  await DataLoader.preloadAll();
  return {
    systemLoaded: SystemConfig.isLoaded(),
    rawCount: SystemConfig._raw ? SystemConfig._raw.length : 0,
    weaponOrbitDistance: SystemConfig.get('weaponOrbitDistance', 999),
    weaponOrbitExtraPerSlot: SystemConfig.get('weaponOrbitExtraPerSlot', 999),
    fallbackTest: SystemConfig.get('nonexistent_key', 'fallback_default'),
  };
});

console.log('--- SystemConfig + 武器轨道 ---');
console.log(JSON.stringify(r, null, 2));
console.log('Errors:', errors);

// 进一步: 在游戏中验证轨道距离
await page.evaluate(() => {
  PlayerSystem.create(640, 450);
});
const orb = await page.evaluate(() => {
  const p = PlayerSystem.player;
  return PlayerSystem._getWeaponOrbitalPositions(p);
});
console.log('Orbital positions (player has 1 weapon):');
for (const pos of orb) {
  const dx = pos.x - 640, dy = pos.y - 450;
  const dist = Math.sqrt(dx*dx + dy*dy);
  console.log(`  ${pos.weaponId} dist=${Math.round(dist)} (expected 128)`);
}
await browser.close();
