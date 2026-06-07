// Task A: 验证怪子弹大红色
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

  // 1) 怪射击 → 创建怪子弹, 检查 bullet.isPlayer = false + drawBullet 颜色逻辑
  EnemySystem.enemies = [{
    id: 'sniper', x: p.x, y: p.y - 300, alive: true, radius: 12,
    hp: 999, maxHp: 999, behavior: 'ranged', speed: 55, damage: 4, attackCooldown: 2.0,
    color: '#ff00aa', glowColor: '#ff0088',
    preferredDist: 250, bulletSpeed: 350, attackTimer: 0,
  }];
  const sniper = EnemySystem.enemies[0];
  // 强制触发一次射击
  sniper.attackTimer = 0;
  for (let f = 0; f < 5; f++) EnemySystem.update(1/60, p);

  // 找怪创建的子弹
  const enemyBullets = BulletSystem.bullets.filter(b => !b.isPlayer);

  // 测 drawBullet 颜色逻辑: 直接用真实 canvas context
  const canvas = document.createElement('canvas');
  canvas.width = 100; canvas.height = 100;
  const ctx2 = canvas.getContext('2d');

  // 临时替换 renderer.ctx
  const origCtx = Renderer.ctx;
  Renderer.ctx = ctx2;

  let enemyBulletColor = null;
  let enemyBulletStrokeColor = null;
  let enemyBulletInfo = null;
  if (enemyBullets.length > 0) {
    const b = enemyBullets[0];
    enemyBulletInfo = {
      isPlayer: b.isPlayer,
      weaponTag: b.weaponTag,
      color: b.color,
      burnDps: b.burnDps,
      slowAmount: b.slowAmount,
      chainCount: b.chainCount,
      isMortar: b.isMortar,
    };
    // 探针:在 fillStyle set 时捕获
    const realSet = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'fillStyle')?.set;
    let fillStyleAtDraw = null;
    if (realSet) {
      Object.defineProperty(ctx2, 'fillStyle', {
        set(v) {
          if (fillStyleAtDraw === null) fillStyleAtDraw = v;
          realSet.call(this, v);
        },
        get() { return this._fillStyle_cache || '#000000'; }
      });
    }
    Renderer.drawBullet(b);
    enemyBulletColor = ctx2.fillStyle;
    fillStyleAtDraw !== null && (enemyBulletColor = fillStyleAtDraw);
    enemyBulletStrokeColor = ctx2.strokeStyle;
  }

  Renderer.ctx = origCtx;

  return {
    enemyBulletCount: enemyBullets.length,
    enemyBulletInfo,
    enemyBulletColor,
    enemyBulletStrokeColor,
  };
});

console.log('--- Task A: 怪子弹大红色 ---');
console.log('怪子弹数:', r.enemyBulletCount);
console.log('怪子弹信息:', JSON.stringify(r.enemyBulletInfo));
console.log('怪子弹 fillStyle (首次set):', r.enemyBulletColor, '(期望 #ff0000)');
console.log('怪子弹 strokeStyle:', r.enemyBulletStrokeColor);
console.log('Errors:', errors);
await browser.close();
