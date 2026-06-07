// 验证击退系统：Brotato 风格（近战强/射击弱 + 大体型抗性）
import { chromium } from 'playwright';

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
  await page.waitForTimeout(600);

  // 工具: 在页面上调用 applyKnockback 测试
  const callKnockback = (enemySpec, kbStr, opts) => page.evaluate(({ s, k, o }) => {
    const e = {
      x: 0, y: 0, alive: true,
      radius: s.radius,
      isElite: s.isElite || false,
      isBoss: s.isBoss || false,
      knockbackX: 0, knockbackY: 0,
    };
    const final = EnemySystem.applyKnockback(e, 100, 0, 100, k, o);
    return { kbx: e.knockbackX, kby: e.knockbackY, final };
  }, { s: enemySpec, k: kbStr, o: opts || {} });

  // 1) 基础敌人(半径14) + 近战击退 400 = 应得 400
  log.push('=== 1) basic enemy melee 400 ===');
  const r1 = await callKnockback({ radius: 14 }, 400, {});
  log.push('  ' + JSON.stringify(r1));
  if (Math.abs(r1.kbx - 400) > 1) throw new Error(`expected kbx=400, got ${r1.kbx}`);
  if (Math.abs(r1.kby) > 1) throw new Error(`expected kby=0, got ${r1.kby}`);

  // 2) 基础敌人 + 远程击退 400 = 应得 80 (×0.2)
  log.push('=== 2) basic enemy ranged 400 = 80 ===');
  const r2 = await callKnockback({ radius: 14 }, 400, { ranged: true });
  log.push('  ' + JSON.stringify(r2));
  if (Math.abs(r2.kbx - 80) > 1) throw new Error(`expected kbx=80, got ${r2.kbx}`);

  // 3) 远程击退 80 = 16
  log.push('=== 3) basic enemy ranged 80 = 16 ===');
  const r3 = await callKnockback({ radius: 14 }, 80, { ranged: true });
  log.push('  ' + JSON.stringify(r3));
  if (Math.abs(r3.kbx - 16) > 1) throw new Error(`expected kbx=16, got ${r3.kbx}`);

  // 4) 大体型 tank(半径22) + 近战击退 400 = 400 / (22/14)^2 = 400/2.47 = 162
  log.push('=== 4) tank enemy melee 400 = ~162 ===');
  const r4 = await callKnockback({ radius: 22 }, 400, {});
  log.push('  ' + JSON.stringify(r4));
  const expected4 = 400 / Math.pow(22/14, 2);
  if (Math.abs(r4.kbx - expected4) > 1) throw new Error(`expected kbx=${expected4.toFixed(1)}, got ${r4.kbx}`);
  if (r4.kbx >= 200) throw new Error('tank should have less knockback than basic');

  // 5) tank + 远程 = expected4 * 0.2 ≈ 32
  log.push('=== 5) tank enemy ranged 400 = ~32 ===');
  const r5 = await callKnockback({ radius: 22 }, 400, { ranged: true });
  log.push('  ' + JSON.stringify(r5));
  const expected5 = expected4 * 0.2;
  if (Math.abs(r5.kbx - expected5) > 1) throw new Error(`expected kbx=${expected5.toFixed(1)}, got ${r5.kbx}`);

  // 6) Elite 免疫
  log.push('=== 6) elite enemy immune ===');
  const r6 = await callKnockback({ radius: 24, isElite: true }, 1000, {});
  log.push('  ' + JSON.stringify(r6));
  if (r6.kbx !== 0) throw new Error('elite should be immune');

  // 7) Boss 免疫
  log.push('=== 7) boss immune ===');
  const r7 = await callKnockback({ radius: 36, isBoss: true }, 1000, {});
  log.push('  ' + JSON.stringify(r7));
  if (r7.kbx !== 0) throw new Error('boss should be immune');

  // 8) 0 击退无效
  log.push('=== 8) kb=0 = no effect ===');
  const r8 = await callKnockback({ radius: 14 }, 0, {});
  log.push('  ' + JSON.stringify(r8));
  if (r8.kbx !== 0) throw new Error('kb=0 should not apply');

  // 9) 小体型 fast(半径10) 抗性 = (10/14)^2 = 0.51, 所以 400 击退 = 400/0.51 = 784 (更易推)
  log.push('=== 9) small enemy (r=10) gets MORE knockback ===');
  const r9 = await callKnockback({ radius: 10 }, 400, {});
  log.push('  ' + JSON.stringify(r9));
  if (r9.kbx <= 400) throw new Error('small enemy should be pushed more than basic');

  // 10) 斜向击退
  log.push('=== 10) diagonal direction ===');
  const r10 = await page.evaluate(() => {
    const e = { x: 0, y: 0, alive: true, radius: 14, knockbackX: 0, knockbackY: 0 };
    const dist = Math.sqrt(3*3 + 4*4); // 5
    EnemySystem.applyKnockback(e, 3, 4, dist, 500, {});
    return { kbx: e.knockbackX, kby: e.knockbackY };
  });
  log.push('  ' + JSON.stringify(r10));
  if (Math.abs(r10.kbx - 300) > 1) throw new Error(`expected kbx=300, got ${r10.kbx}`);
  if (Math.abs(r10.kby - 400) > 1) throw new Error(`expected kby=400, got ${r10.kby}`);

  // 11) 死亡敌人不接收
  log.push('=== 11) dead enemy ignored ===');
  const r11 = await page.evaluate(() => {
    const e = { x: 0, y: 0, alive: false, radius: 14, knockbackX: 0, knockbackY: 0 };
    EnemySystem.applyKnockback(e, 1, 0, 1, 500, {});
    return { kbx: e.knockbackX };
  });
  log.push('  ' + JSON.stringify(r11));
  if (r11.kbx !== 0) throw new Error('dead enemy should be ignored');

  // 12) Brotato 风格场景对比: 同等基础击退,近战 vs 远程
  log.push('=== 12) melee vs ranged comparison ===');
  const melee = await callKnockback({ radius: 14 }, 400, {});
  const ranged = await callKnockback({ radius: 14 }, 400, { ranged: true });
  log.push(`  melee=${melee.kbx} ranged=${ranged.kbx} ratio=${(ranged.kbx/melee.kbx).toFixed(2)}`);
  if (ranged.kbx >= melee.kbx) throw new Error('ranged should be weaker than melee');

  log.push('✅ ALL PASS');
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
