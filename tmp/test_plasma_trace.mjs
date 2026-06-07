// 等离子刀: 详细 trace 每次 sweep 打中哪些怪
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

  // 8 怪 8 方向
  EnemySystem.enemies = [
    { id: 'E',  x: p.x + 200, y: p.y, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff' },
    { id: 'NE', x: p.x + 141, y: p.y - 141, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff' },
    { id: 'N',  x: p.x, y: p.y - 200, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff' },
    { id: 'NW', x: p.x - 141, y: p.y - 141, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff' },
    { id: 'W',  x: p.x - 200, y: p.y, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff' },
    { id: 'SW', x: p.x - 141, y: p.y + 141, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff' },
    { id: 'S',  x: p.x, y: p.y + 200, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff' },
    { id: 'SE', x: p.x + 141, y: p.y + 141, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff' },
  ];

  // 拦截 takeDamage 看每次命中
  const origTakeDmg = EnemySystem.takeDamage;
  const dmgLog = [];
  EnemySystem.takeDamage = function(e, dmg) {
    if (e.id) dmgLog.push({ enemyId: e.id, hpBefore: e.hp, dmg });
    return origTakeDmg.call(this, e, dmg);
  };

  // 拦 _fireMeleeSweep 看是否触发
  const origFire = PlayerSystem._fireMeleeSweep;
  const fireLog = [];
  PlayerSystem._fireMeleeSweep = function(angle, params, target, weaponId, weaponPos, weaponDef) {
    fireLog.push({
      angle: Math.round(angle * 100) / 100,
      targetX: target.x, targetY: target.y,
      weaponX: weaponPos ? weaponPos.x : null,
      weaponY: weaponPos ? weaponPos.y : null,
    });
    origFire.call(this, angle, params, target, weaponId, weaponPos, weaponDef);
  };

  // 拦 _executeMeleeSweep 看每次 sweep 朝哪
  const origExec = PlayerSystem._executeMeleeSweep;
  const sweepLog = [];
  PlayerSystem._executeMeleeSweep = function(player, sweepPending) {
    sweepLog.push({
      angle: sweepPending.angle,
      originX: sweepPending.weaponX,
      originY: sweepPending.weaponY,
    });
    origExec.call(this, player, sweepPending);
  };

  for (let f = 0; f < 600; f++) {  // 10 秒
    PlayerSystem.update(1/60, EnemySystem.enemies);
    if (p._sweepPending && p._sweepPending.timer != null) {
      p._sweepPending.timer -= 1/60;
      if (p._sweepPending.timer <= 0) {
        PlayerSystem._executeMeleeSweep(p, p._sweepPending);
        p._sweepPending = null;
      }
    }
    BulletSystem.update(1/60);
    GameEngine._checkBulletCollisions(p);
  }

  return {
    fireCount: fireLog.length,
    fireLog: fireLog,
    sweepCount: sweepLog.length,
    sweepLog: sweepLog,
    dmgCount: dmgLog.length,
    finalHps: EnemySystem.enemies.map(e => ({ id: e.id, hp: e.hp })),
  };
});

console.log('--- 剑客 + 等离子刀 8怪 10秒详细 trace ---');
console.log('Fire count:', r.fireCount);
console.log('Fire log (前 12):');
for (const f of r.fireLog.slice(0, 12)) console.log(' ', JSON.stringify(f));
console.log('Sweep count:', r.sweepCount);
console.log('Sweep log (前 12):');
for (const s of r.sweepLog.slice(0, 12)) console.log(' ', JSON.stringify(s));
console.log('Total damage events:', r.dmgCount);
console.log('Final HPs:', JSON.stringify(r.finalHps));
console.log('Errors:', errors);
await browser.close();
