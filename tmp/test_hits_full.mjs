// 完整模拟 main.js 流程,看真实命中
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });

await page.goto('http://localhost:8000/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const r = await page.evaluate(async () => {
  PlayerSystem.create(640, 450);
  const p = PlayerSystem.player;
  // 装两把武器: pistol + bow (1 在上方,1 在下方)
  p.weapons = [
    { id: 'pistol', level: 1, quality: 'T1' },
    { id: 'bow', level: 1, quality: 'T1' },
  ];
  for (const w of p.weapons) ShopSystem._updateWeaponParams(p, w.id);

  // 敌人在不同距离 + 角度
  EnemySystem.enemies = [
    { x: p.x + 200, y: p.y, alive: true, radius: 18, hp: 1000, maxHp: 1000, color: '#ff00ff' },  // 东, 200 距离
    { x: p.x + 100, y: p.y - 100, alive: true, radius: 18, hp: 1000, maxHp: 1000, color: '#ff00ff' }, // 东北, 141 距离
    { x: p.x, y: p.y + 100, alive: true, radius: 18, hp: 1000, maxHp: 1000, color: '#ff00ff' }, // 南, 100 距离
    { x: p.x + 50, y: p.y, alive: true, radius: 18, hp: 1000, maxHp: 1000, color: '#ff00ff' }, // 东, 50 距离 (很近)
  ];

  // 跑 120 帧,每帧都跑 main.js 实际的 bullet 命中
  const hitLog = [];
  for (let f = 0; f < 120; f++) {
    PlayerSystem.update(1/60, EnemySystem.enemies);

    // 真实 main.js 命中模拟
    for (let i = BulletSystem.bullets.length - 1; i >= 0; i--) {
      const b = BulletSystem.bullets[i];
      if (!b.isPlayer) continue;
      for (const e of EnemySystem.enemies) {
        if (!e.alive || b.hits.includes(e)) continue;
        const dx = b.x - e.x, dy = b.y - e.y;
        if (dx*dx + dy*dy < (b.radius + e.radius) ** 2) {
          e.hp -= b.damage;
          b.hits.push(e);
          hitLog.push({
            frame: f,
            weaponId: b.weaponId,
            bX: Math.round(b.x), bY: Math.round(b.y),
            eX: e.x, eY: e.y,
            eHpAfter: e.hp,
            bStartX: Math.round(b.startX), bStartY: Math.round(b.startY),
            bMaxRange: b.maxRange,
          });
        }
      }
    }
    BulletSystem.update(1/60);
  }

  return {
    finalEnemyHps: EnemySystem.enemies.map(e => ({ hp: e.hp, alive: e.alive, x: e.x, y: e.y })),
    hits: hitLog,
    weaponOrbit: PlayerSystem._getWeaponOrbitalPositions(p),
  };
});

console.log('--- 120-frame hit simulation ---');
console.log('Final enemy HPs:');
for (const e of r.finalEnemyHps) console.log(' ', JSON.stringify(e));
console.log('Hits:');
for (const h of r.hits) console.log(' ', JSON.stringify(h));
console.log('Errors:', errors);
await browser.close();
