// 剑客 (swordsman) + 等离子刀 (plasma) 测试
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

const r = await page.evaluate(async () => {
  // 选 swordsman
  CharacterSystem.selectedCharacterId = 'swordsman';
  PlayerSystem.create(640, 450);
  const p = PlayerSystem.player;

  // 装备等离子刀
  p.weapons = [
    { id: 'plasma', level: 1, quality: 'T1' },
  ];
  for (const w of p.weapons) ShopSystem._updateWeaponParams(p, w.id);

  // 5 个怪, 4 个方向 + 1 个近
  EnemySystem.enemies = [
    { x: p.x + 200, y: p.y, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff' },  // 东 200
    { x: p.x - 200, y: p.y, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff' },  // 西 200
    { x: p.x, y: p.y + 200, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff' },  // 南 200
    { x: p.x, y: p.y - 200, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff' },  // 北 200
    { x: p.x + 50, y: p.y, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff' },  // 东 50 (最近)
  ];

  // 跑 240 帧 (4 秒)
  for (let f = 0; f < 240; f++) {
    PlayerSystem.update(1/60, EnemySystem.enemies);
    // 模拟 main.js sweep 延迟执行
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

  const positions = PlayerSystem._getWeaponOrbitalPositions(p);
  return {
    pStats: { attackRange: p.attackRange, x: p.x, y: p.y },
    weaponOrbit: positions,
    debugRange: PlayerSystem._getAttackRange(p, p.weaponParams['plasma'], positions[0] ? positions[0].dist : 0),
    paramsBehavior: p.weaponParams['plasma'].behavior,
    paramsRange: p.weaponParams['plasma'].attackRange,
    finalEnemyHps: EnemySystem.enemies.map(e => ({
      dx: e.x - p.x, dy: e.y - p.y,
      distFromPlayer: Math.round(Math.hypot(e.x - p.x, e.y - p.y)),
      hp: e.hp, alive: e.alive,
    })),
  };
});

console.log('--- 剑客 + 等离子刀 240 帧测试 ---');
console.log('Player stats:', r.pStats);
console.log('Weapon orbit:', r.weaponOrbit);
console.log('Debug range:', r.debugRange, 'paramsRange:', r.paramsRange, 'behavior:', r.paramsBehavior);
console.log('Final HPs:');
for (const e of r.finalEnemyHps) console.log(' ', e);
console.log('Errors:', errors);
await browser.close();
