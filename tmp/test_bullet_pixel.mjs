// 验证子弹实际渲染颜色(在 canvas 上采样像素)
import { chromium } from 'playwright';
import fs from 'fs';

const URL = 'http://localhost:8000/index.html';
const log = [];
const errors = [];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));

try {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // 让玩家装备 pistol,模拟开火
  log.push('=== 1) 创建 pistol 子弹并查询 ===');
  const result = await page.evaluate(() => {
    PlayerSystem.create(640, 450);
    const p = PlayerSystem.player;
    p.weapons = [{ id: 'pistol', level: 1, quality: 'T1' }];
    ShopSystem._updateWeaponParams(p, 'pistol');
    // 创建一个 fake enemy 让自动攻击有目标
    EnemySystem.enemies = EnemySystem.enemies || [];
    EnemySystem.enemies.push({ x: p.x + 200, y: p.y, alive: true, radius: 18, isElite: false, isBoss: false, x: 0, y: 0, hp: 100, maxHp: 100, color: '#ff00ff' });
    // 创建子弹
    const b = BulletSystem.create(p.x, p.y, 0, 10, 400, 0, true, 'pistol', { range: 320 });
    return {
      weaponTag: b.weaponTag,
      radius: b.radius,
      color: b.color || null,
      // 用 renderer 内部逻辑预测
      predictedColor: (function() {
        if (b.color) return b.color;
        if (b.burnDps > 0) return '#ff4444';
        if (b.slowAmount > 0) return '#88ddff';
        if (b.chainCount > 0) return '#ffaa44';
        if (b.healOnHit > 0) return '#00ff88';
        if (b.weaponTag === 'gun' || b.weaponTag === 'bow') return '#ffffff';
        if (b.weaponTag === 'magic') return '#ffffaa';
        return '#ffff44';
      })(),
    };
  });
  log.push('  ' + JSON.stringify(result));

  // 推进一帧让 bullet 渲染
  await page.waitForTimeout(100);

  // 2) 截屏 + 采样子弹中心像素
  log.push('=== 2) 采样子弹中心像素颜色 + 周围像素 ===');
  const sample = await page.evaluate(() => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const b = BulletSystem.bullets.find(x => x.isPlayer);
    if (!b) return { error: 'no bullet' };
    const cam = (typeof Renderer !== 'undefined' && Renderer._camera) ? Renderer._camera : { x: 0, y: 0 };
    const sx = Math.round(b.x - cam.x);
    const sy = Math.round(b.y - cam.y);
    // 采样 5x5 区域
    const data = ctx.getImageData(sx - 2, sy - 2, 5, 5).data;
    const pixels = [];
    for (let i = 0; i < 25; i++) {
      pixels.push([data[i*4], data[i*1], data[i*2], data[i*3]]);
    }
    return {
      bx: b.x, by: b.y, sx, sy, radius: b.radius,
      // 中心像素
      center: 'rgb(' + data[12] + ',' + data[13] + ',' + data[14] + ')',
      centerHex: '#' + [data[12], data[13], data[14]].map(c => c.toString(16).padStart(2, '0')).join(''),
      // 周围 24 像素中最亮的
      maxBrightness: Math.max(...Array.from({length:25}, (_, i) => data[i*4] + data[i*4+1] + data[i*4+2])),
      pixels
    };
  });
  log.push('  ' + JSON.stringify(sample, null, 2));

  // 3) 截图保存
  await page.screenshot({ path: 'tmp/bullet_screenshot.png', fullPage: false });
  log.push('  screenshot saved: tmp/bullet_screenshot.png');

  log.push('✅ SAMPLING DONE');
} catch (e) {
  log.push(`❌ FAIL: ${e.message}`);
  process.exitCode = 1;
} finally {
  console.log('--- LOG ---');
  for (const l of log) console.log(l);
  if (errors.length) {
    console.log('--- ERRORS ---');
    for (const e of errors) console.log(e);
  }
  await browser.close();
}
