// 完整子弹飞行 + 命中测试
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

  // 敌人在 200 距离正东
  EnemySystem.enemies = [
    { x: p.x + 200, y: p.y, alive: true, radius: 18, hp: 1000, maxHp: 1000, color: '#ff00ff' },
  ];

  // 跑 90 帧 (~1.5 秒) 看是否能命中
  const log = [];
  for (let f = 0; f < 90; f++) {
    PlayerSystem.update(1/60, EnemySystem.enemies);
    // 模拟 main.js 中的子弹命中
    for (let i = BulletSystem.bullets.length - 1; i >= 0; i--) {
      const b = BulletSystem.bullets[i];
      // 玩家子弹 → 命中检测
      if (b.isPlayer) {
        for (const e of EnemySystem.enemies) {
          if (!e.alive || b.hits.includes(e)) continue;
          const dx = b.x - e.x, dy = b.y - e.y;
          if (dx*dx + dy*dy < (b.radius + e.radius) ** 2) {
            // 命中
            e.hp -= b.damage;
            b.hits.push(e);
          }
        }
      }
    }
    BulletSystem.update(1/60);
    if (f === 0 || f === 5 || f === 10 || f === 15 || f === 20 || f === 25 || f === 30 || f === 35 || f === 60 || f === 89) {
      const b = BulletSystem.bullets[0];
      // 距离敌人
      const e = EnemySystem.enemies[0];
      const dx = b ? b.x - e.x : 0, dy = b ? b.y - e.y : 0;
      const distToEnemy = b ? Math.sqrt(dx*dx + dy*dy) : null;
      log.push({
        frame: f,
        bullet: b ? { x: Math.round(b.x), y: Math.round(b.y), maxRange: b.maxRange, life: b.life.toFixed(2) } : null,
        distToEnemy: distToEnemy !== null ? Math.round(distToEnemy * 10) / 10 : null,
        enemy: { x: e.x, y: e.y, hp: e.hp, alive: e.alive },
        attackRange: p.attackRange,
      });
    }
  }
  return log;
});

console.log('--- 90-frame bullet + hit test ---');
for (const l of r) {
  console.log(JSON.stringify(l, null, 2));
}
console.log('Errors:', errors);
await browser.close();
