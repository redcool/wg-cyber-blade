// 验证: 任何武器进范围至少 1 dmg (floor),冷气喷射器 5 秒能扣血
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

const r = await page.evaluate(async () => {
  PlayerSystem.create(640, 450);
  const p = PlayerSystem.player;
  p.weapons = [{ id: 'cold_spray', level: 1, quality: 'T1' }];
  for (const w of p.weapons) ShopSystem._updateWeaponParams(p, w.id);
  // 强制 cd 满, 让 attackRange 多一点
  p.weapons[0].cooldownTimer = 0;
  // 看 params.attackRange 是不是真的 320
  console.log('  attackRange:', p.weaponParams['cold_spray'].attackRange);

  // 3 怪在正前方
  EnemySystem.enemies = [
    { x: p.x + 180, y: p.y, alive: true, radius: 18, hp: 9999, maxHp: 9999, color: '#ff00ff', behavior: 'chase' },
    { x: p.x + 250, y: p.y - 50, alive: true, radius: 18, hp: 9999, maxHp: 9999, color: '#ff00ff', behavior: 'chase' },
    { x: p.x + 250, y: p.y + 50, alive: true, radius: 18, hp: 9999, maxHp: 9999, color: '#ff00ff', behavior: 'chase' },
  ];

  // 5 秒
  let maxBulletsEver = 0;
  let fireCount = 0;
  // 拦截 _fireSpray 看调用次数
  const origFireSpray = PlayerSystem._fireSpray;
  PlayerSystem._fireSpray = function(...args) { fireCount++; return origFireSpray.apply(this, args); };

  // 1 帧诊断: _findNearestTarget 找到谁
  const range = PlayerSystem._getAttackRange(p, p.weaponParams['cold_spray'], 0);
  const targetResult = PlayerSystem._findNearestTarget(p, p, range, p.weaponParams['cold_spray']);
  const targetInfo = targetResult ? { x: targetResult.target.x, y: targetResult.target.y, dist: Math.round(targetResult.dist) } : null;

  for (let f = 0; f < 300; f++) {
    PlayerSystem.update(1/60, EnemySystem.enemies);
    BulletSystem.update(1/60);
    // 看每帧子弹位置
    for (const b of BulletSystem.bullets) {
      if (b.isPlayer) {
        for (const e of EnemySystem.enemies) {
          if (!e.alive) continue;
          const dx = e.x - b.x, dy = e.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < b.radius + e.radius) {
            // 命中!
            console.log(`Frame ${f}: bullet(${b.x.toFixed(0)},${b.y.toFixed(0)}) dist=${dist.toFixed(1)} enemy(${e.x},${e.y}) hp=${e.hp}`);
          }
        }
      }
    }
    GameEngine._checkBulletCollisions(p);
    maxBulletsEver = Math.max(maxBulletsEver, BulletSystem.bullets.length);
  }

  return {
    finalHps: EnemySystem.enemies.map(e => Math.round(e.hp)),
    finalPlayerBullets: BulletSystem.bullets.filter(b => b.isPlayer).length,
    maxBulletsEver,
    fireCount,
    targetInfo,
    range,
    // 手动算一次
    params: p.weaponParams['cold_spray'],
    def: ShopSystem.allWeapons.find(w => w.id === 'cold_spray'),
  };
});

console.log('--- 冷气喷射器 5 秒 floor 测试 ---');
console.log('3 怪初始 HP: 9999');
console.log('attackRange:', r.range);
console.log('_findNearestTarget 找到的目标:', JSON.stringify(r.targetInfo));
console.log('5 秒内 _fireSpray 调用次数:', r.fireCount);
console.log('5 秒内最大子弹数:', r.maxBulletsEver);
console.log('3 怪最终 HP:', r.finalHps);
console.log('玩家子弹残留:', r.finalPlayerBullets);
console.log('总伤害:', 9999*3 - r.finalHps.reduce((a,b)=>a+b,0));
console.log('Errors:', errors);
await browser.close();
