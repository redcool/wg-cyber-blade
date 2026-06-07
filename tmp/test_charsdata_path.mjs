// 验证 charsData 文件从 src/charsData/ 加载
import { chromium } from 'playwright';
const URL = 'http://localhost:8000/index.html';
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('[console] '+m.text()); });
try {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  // 测试所有 11 个 charsData 加载
  const names = ['character_charsData','enemy_charsData','engine-shop_charsData','loot_charsData','rarityColors_charsData','save_charsData','shop_charsData','stats_charsData','tags_charsData','ui_charsData','wave_charsData'];
  for (const n of names) {
    const r = await page.evaluate(async (n) => {
      DataLoader.clearCache();
      const d = await DataLoader.load(n);
      return { ok: !!d, len: Array.isArray(d) ? d.length : (typeof d === 'object' ? Object.keys(d).length : 0) };
    }, n);
    console.log(n, JSON.stringify(r));
    if (!r.ok || r.len === 0) throw new Error(`${n} not loaded: ${JSON.stringify(r)}`);
  }
  console.log('✅ ALL PASS');
  if (errs.length) {
    console.log('--- ERRORS ---');
    errs.forEach(e => console.log(e));
  }
} catch (e) {
  console.log('❌', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
