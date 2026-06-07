// 验证自动攻击是否触发
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
  // 关键: 初始武器已经在 weapons 里
  const before = {
    weapons: p.weapons.map(w => ({ id: w.id, cd: w.cooldownTimer })),
    paramsKeys: Object.keys(p.weaponParams || {}),
    attackRange: p.attackRange,
  };

  // 找一个敌人在 200 距离
  EnemySystem.enemies = [{ x: p.x + 200, y: p.y, alive: true, radius: 18, hp: 1000, maxHp: 1000, color: '#ff00ff' }];

  // 跑 60 帧
  for (let i = 0; i < 60; i++) {
    PlayerSystem.update(1/60, EnemySystem.enemies);
  }

  // 验证: 玩家武器应该开火 (至少有 1 颗子弹)
  const fired = BulletSystem.bullets.length > 0;
  if (!fired) {
    errors.push('武器没有开火,没有任何子弹被创建');
  }

  return {
    before,
    after: {
      weapons: p.weapons.map(w => ({ id: w.id, cd: w.cooldownTimer })),
      bullets: BulletSystem.bullets.length,
      enemyHp: EnemySystem.enemies[0] ? EnemySystem.enemies[0].hp : null,
      enemyAlive: EnemySystem.enemies[0] ? EnemySystem.enemies[0].alive : null,
    },
    fired,
  };
});

console.log('--- 60-frame auto-attack test ---');
console.log('BEFORE:', JSON.stringify(r.before, null, 2));
console.log('AFTER:', JSON.stringify(r.after, null, 2));
console.log('Fired weapon:', r.fired ? '✅' : '❌');
console.log('ERRORS:', errors);
process.exit(r.fired && errors.length === 0 ? 0 : 1);
await browser.close();
