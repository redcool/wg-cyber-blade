// 跑真实 main.js _checkBulletCollisions (用 sweep test 看是否穿透)
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

const r = await page.evaluate(async () => {
  PlayerSystem.create(640, 450);
  const p = PlayerSystem.player;

  // 三个敌人, 200 距离, 100 距离怪立即死
  EnemySystem.enemies = [
    { x: p.x + 200, y: p.y, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff' },  // 200 距离
    { x: p.x + 100, y: p.y, alive: true, radius: 18, hp: 1, maxHp: 1, color: '#ff00ff' },  // 100 距离 (1 hp, 1 hit 死)
  ];

  // 跑真实 main.js 流程 180 帧
  const trace = [];
  for (let f = 0; f < 180; f++) {
    PlayerSystem.update(1/60, EnemySystem.enemies);
    BulletSystem.update(1/60);
    GameEngine._checkBulletCollisions(p);
    if (f < 5 || f % 30 === 0) {
      const w = p.weapons[0];
      const orb = PlayerSystem._getWeaponOrbitalPositions(p)[0];
      const range = PlayerSystem._getAttackRange(p, p.weaponParams['pistol'], orb.dist);
      trace.push({
        frame: f,
        weapon: w ? { id: w.id, cd: w.cooldownTimer } : null,
        range,
        bulletCount: BulletSystem.bullets.length,
      });
    }
  }

  return {
    finalEnemyHps: EnemySystem.enemies.map(e => ({ distFromPlayer: Math.round(Math.hypot(e.x - p.x, e.y - p.y)), hp: e.hp })),
    attackRange: p.attackRange,
    weaponPos: PlayerSystem._getWeaponOrbitalPositions(p)[0],
    debugRange: PlayerSystem._getAttackRange(p, p.weaponParams['pistol'], 64),
    debugParamsRange: p.weaponParams['pistol'].attackRange,
    bulletsCreated: BulletSystem.bullets.length,
    trace,
  };
});

console.log('--- 真实 game loop 180 frames ---');
console.log('Trace:');
for (const t of r.trace) console.log(' ', JSON.stringify(t));
console.log('Final:', JSON.stringify(r.finalEnemyHps));
console.log('Errors:', errors);
await browser.close();
