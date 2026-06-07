// 单怪在 200 距离正东,看是否命中
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto('http://localhost:8000/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const r = await page.evaluate(async () => {
  PlayerSystem.create(640, 450);
  const p = PlayerSystem.player;

  // 单怪在 200 距离正东
  EnemySystem.enemies = [
    { x: p.x + 200, y: p.y, alive: true, radius: 18, hp: 1000, maxHp: 1000, color: '#ff00ff' },
  ];

  // 看 _findNearestTarget 选中谁
  const positions = PlayerSystem._getWeaponOrbitalPositions(p);
  const range = PlayerSystem._getAttackRange(p, p.weaponParams['pistol'], 128);
  const target = PlayerSystem._findNearestTarget(p, positions[0], range, p.weaponParams['pistol']);

  // 跑 90 帧
  const hitLog = [];
  for (let f = 0; f < 90; f++) {
    PlayerSystem.update(1/60, EnemySystem.enemies);
    for (let i = BulletSystem.bullets.length - 1; i >= 0; i--) {
      const b = BulletSystem.bullets[i];
      if (!b.isPlayer) continue;
      for (const e of EnemySystem.enemies) {
        if (!e.alive || b.hits.includes(e)) continue;
        const dx = b.x - e.x, dy = b.y - e.y;
        if (dx*dx + dy*dy < (b.radius + e.radius) ** 2) {
          e.hp -= b.damage;
          b.hits.push(e);
          hitLog.push({ frame: f, weaponId: b.weaponId, bDist: Math.sqrt(dx*dx+dy*dy) });
        }
      }
    }
    BulletSystem.update(1/60);
  }

  return {
    weaponPos: positions[0],
    range,
    target,
    enemy: { ...EnemySystem.enemies[0], hp: EnemySystem.enemies[0].hp },
    hitLog,
  };
});

console.log('--- Single enemy at 200 east ---');
console.log('Weapon pos:', r.weaponPos);
console.log('Range:', r.range);
console.log('Target found:', r.target);
console.log('Final enemy:', r.enemy);
console.log('Hits:', r.hitLog);
console.log('Errors:', errors);
await browser.close();
