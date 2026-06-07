// 深度调试: 每帧记录为什么没触发
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });

await page.goto('http://localhost:8000/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

const r = await page.evaluate(async () => {
  PlayerSystem.create(640, 450);
  const p = PlayerSystem.player;

  // 直接走 5 帧, 在 _updateAutoAttack 中插入 trace
  const orig = PlayerSystem._updateAutoAttack;
  const trace = [];
  const positions = PlayerSystem._getWeaponOrbitalPositions(p);
  const enemiesArr = EnemySystem.enemies || [];
  PlayerSystem._updateAutoAttack = function(dt, p) {
    const params = p.weaponParams['pistol'];
    const rangeMult = (p.attackRange || 300) / 300;
    const isMelee = params.behavior === 'melee' || params.behavior === 'melee_sweep' || params.behavior === 'melee_thrust';
    const range = isMelee
      ? (params.attackRange || 60) * rangeMult
      : (params.attackRange || p.attackRange) * rangeMult;
    const weaponPos = positions[0] || { x: p.x, y: p.y };
    let nearest = null, nearDist = Infinity;
    for (const e of enemiesArr) {
      if (!e.alive) continue;
      const dx2 = e.x - weaponPos.x, dy2 = e.y - weaponPos.y;
      const dist = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      if (dist < range && dist < nearDist) {
        nearDist = dist; nearest = e;
      }
    }
    trace.push({
      frame: trace.length,
      p: { x: p.x, y: p.y, attackRange: p.attackRange },
      weaponPos,
      range,
      rangeMult,
      enemyAlive: enemiesArr[0] && enemiesArr[0].alive,
      enemyPos: enemiesArr[0] && { x: enemiesArr[0].x, y: enemiesArr[0].y },
      enemyDistToWeapon: nearest ? nearDist : null,
      cd: p.weapons[0].cooldownTimer,
    });
    orig.call(this, dt, p);
  };

  // 找一个敌人在 200 距离
  EnemySystem.enemies = [{ x: p.x + 200, y: p.y, alive: true, radius: 18, hp: 1000, maxHp: 1000, color: '#ff00ff' }];

  for (let i = 0; i < 3; i++) PlayerSystem.update(1/60, EnemySystem.enemies);

  return {
    trace,
    bullets: BulletSystem.bullets.length,
    weaponOrbit: positions[0] || null,
    p: { x: p.x, y: p.y },
    enemy: enemiesArr[0] || null,
  };
});

console.log('--- 3-frame deep trace ---');
console.log('Trace:', JSON.stringify(r.trace, null, 2));
console.log('Weapon orbit pos:', r.weaponOrbit);
console.log('Player pos:', r.p);
console.log('Enemy:', r.enemy);
console.log('Bullets after:', r.bullets);
console.log('ERRORS:', errors);
await browser.close();
