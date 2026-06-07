// 剑客 + 等离子刀 360° 环带测试 (8怪, 验证 300 范围是否覆盖)
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

const r = await page.evaluate(async () => {
  CharacterSystem.selectedCharacterId = 'swordsman';
  PlayerSystem.create(640, 450);
  const p = PlayerSystem.player;
  p.weapons = [{ id: 'plasma', level: 1, quality: 'T1' }];
  for (const w of p.weapons) ShopSystem._updateWeaponParams(p, w.id);

  // 8 怪, 8 方向, 距离 100 (近于 135 sweep 阈值)
  EnemySystem.enemies = [
    { x: p.x + 100, y: p.y, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff' },
    { x: p.x + 71, y: p.y - 71, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff' },
    { x: p.x, y: p.y - 100, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff' },
    { x: p.x - 71, y: p.y - 71, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff' },
    { x: p.x - 100, y: p.y, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff' },
    { x: p.x - 71, y: p.y + 71, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff' },
    { x: p.x, y: p.y + 100, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff' },
    { x: p.x + 71, y: p.y + 71, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff' },
  ];

  // 拦截 _executeMeleeSweep 看每帧选了哪个目标
  const origExec = PlayerSystem._executeMeleeSweep;
  const sweepTrace = [];
  const fireTrace = [];
  PlayerSystem._executeMeleeSweep = function(player, sweepPending) {
    sweepTrace.push({
      frame: sweepTrace.length,
      angle: sweepPending ? sweepPending.angle : null,
      weaponX: sweepPending ? sweepPending.weaponX : null,
      weaponY: sweepPending ? sweepPending.weaponY : null,
      timer: sweepPending ? sweepPending.timer : null,
    });
    return origExec.call(this, player, sweepPending);
  };
  const origFire = PlayerSystem._fireMeleeSweep;
  PlayerSystem._fireMeleeSweep = function(angle, params, target, weaponId, weaponPos, weaponDef) {
    fireTrace.push({ angle, targetId: target ? target.id : null, dist: target ? Math.round(Math.hypot(target.x - p.x, target.y - p.y)) : null });
    return origFire.call(this, angle, params, target, weaponId, weaponPos, weaponDef);
  };
  // 检查 _findNearestTarget 选谁
  const origFind = PlayerSystem._findNearestTarget;
  PlayerSystem._findNearestTarget = function(p, weaponPos, range, params) {
    const t = origFind.call(this, p, weaponPos, range, params);
    if (t) {
      const dist = Math.round(Math.hypot(t.x - p.x, t.y - p.y));
      const ang = Math.round(Math.atan2(t.y - p.y, t.x - p.x) * 180 / Math.PI);
      // 只记录 plasma 的
      if (params && params.id === 'plasma') {
        fireTrace.push({ findTarget: { id: t.id, dist, ang } });
      }
    }
    return t;
  };

  for (let f = 0; f < 300; f++) {
    PlayerSystem.update(1/60, EnemySystem.enemies);
    BulletSystem.update(1/60);
    GameEngine._checkBulletCollisions(p);
  }

  return {
    pAttackRange: p.attackRange,
    pParamsRange: p.weaponParams['plasma'].attackRange,
    paramsBehavior: p.weaponParams['plasma'].behavior,
    sweepPendingCount: p._sweepPending ? 1 : 0,
    sweepTrace: sweepTrace.slice(0, 15),
    fireTrace: fireTrace.slice(0, 15),
    finalEnemyHps: EnemySystem.enemies.map(e => {
      const dx = e.x - p.x, dy = e.y - p.y;
      return {
        angle: Math.round(Math.atan2(dy, dx) * 180 / Math.PI) + '°',
        distFromPlayer: Math.round(Math.hypot(dx, dy)),
        hp: e.hp,
      };
    }),
  };
});

console.log('--- 剑客 + 等离子刀 8怪 5秒测试 ---');
console.log('Player.attackRange:', r.pAttackRange, 'Plasma attackRange:', r.pParamsRange, 'behavior:', r.paramsBehavior);
console.log('Sweep pending at end:', r.sweepPendingCount);
console.log('Sweep trace (前15次 _executeMeleeSweep 触发):');
for (const s of r.sweepTrace) console.log(' ', JSON.stringify(s));
console.log('Fire trace (前15次 _fireMeleeSweep 触发 + find target):');
for (const s of r.fireTrace) console.log(' ', JSON.stringify(s));
console.log('Final HPs:');
for (const e of r.finalEnemyHps) console.log(' ', e);
console.log('Errors:', errors);
await browser.close();
