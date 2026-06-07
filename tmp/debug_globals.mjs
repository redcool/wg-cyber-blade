// 详细 debug: 看 page load 时所有 error
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
const consoleMsgs = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => consoleMsgs.push(m.type() + ': ' + m.text().slice(0, 200)));
page.on('requestfailed', r => errors.push('requestfailed: ' + r.url() + ' ' + r.failure()?.errorText));

await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

const r = await page.evaluate(() => ({
  hasEnemy: typeof EnemySystem,
  hasPlayer: typeof PlayerSystem,
  hasShop: typeof ShopSystem,
  hasChar: typeof CharacterSystem,
  hasWave: typeof WaveSystem,
  hasData: typeof DataLoader,
  hasEnemyData: typeof window.EnemySystem,
}));
console.log('Globals:', JSON.stringify(r, null, 2));
console.log('\nPage errors:');
for (const e of errors) console.log(' ', e);
console.log('\nConsole msgs (last 10):');
for (const m of consoleMsgs.slice(-10)) console.log(' ', m);
await browser.close();
