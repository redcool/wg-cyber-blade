// 验证冷气喷射器(以及动态加载所有武器的 icon 都已加载)
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
const failed = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', msg => {
  if (msg.type() === 'error') failed.push(msg.text());
});
page.on('requestfailed', req => failed.push(`${req.url()} - ${req.failure()?.errorText}`));

await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500); // 等所有 icon 加载完

const r = await page.evaluate(async () => {
  // 等 AssetSystem 完成
  await new Promise(r => setTimeout(r, 200));
  const allIds = ShopSystem.allWeapons.map(w => w.id);
  const loaded = Object.keys(AssetSystem.weaponIcons);
  const missing = allIds.filter(id => !AssetSystem.weaponIcons[id]);
  const coldSprayExists = !!AssetSystem.weaponIcons['cold_spray'];
  const flameSprayExists = !!AssetSystem.weaponIcons['flame_spray'];
  const poisonSprayExists = !!AssetSystem.weaponIcons['poison_spray'];
  // 调 weaponIconHTML 看返回 (string 包含 .png src 还是 'W' fallback)
  const coldSprayHTML = AssetSystem.weaponIconHTML('cold_spray', 48);
  const isFallback = coldSprayHTML.includes('weapon-fallback');
  return {
    totalAllWeapons: allIds.length,
    totalLoadedIcons: loaded.length,
    missing,
    coldSprayExists,
    flameSprayExists,
    poisonSprayExists,
    coldSprayHTML: coldSprayHTML.substring(0, 200),
    isFallback,
  };
});

console.log('--- 武器 icon 加载验证 ---');
console.log('ShopSystem.allWeapons 总数:', r.totalAllWeapons);
console.log('AssetSystem.weaponIcons 已加载:', r.totalLoadedIcons);
console.log('缺失 icon:', r.missing.length, '个');
if (r.missing.length > 0) console.log('  →', r.missing);
console.log('cold_spray 已加载:', r.coldSprayExists);
console.log('flame_spray 已加载:', r.flameSprayExists);
console.log('poison_spray 已加载:', r.poisonSprayExists);
console.log('cold_spray HTML (前200字符):', r.coldSprayHTML);
console.log('是 fallback 占位:', r.isFallback);
console.log('Network 失败:', failed);
console.log('Errors:', errors);
await browser.close();
