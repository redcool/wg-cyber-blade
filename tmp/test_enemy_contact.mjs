// Task C 验证: 怪靠边停 + 接触伤害 + cooldown
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
const logs = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'log') logs.push(m.text()); });

await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

const r = await page.evaluate(async () => {
  PlayerSystem.create(640, 450);
  const p = PlayerSystem.player;
  // 设大血量避免被秒杀
  p.maxHp = 99999;
  p.hp = 99999;

  // 1 个 chaser, 距离 200 - 手 push 但初始化 attackTimer
  EnemySystem.enemies = [];
  const chaser = {
    x: p.x + 200, y: p.y, alive: true, radius: 18, hp: 9999, maxHp: 9999,
    speed: 80, damage: 5, attackCooldown: 1.5, behavior: 'chaser', color: '#ff00ff',
    attackTimer: 0, // 初始化: 第一帧就能触发接触伤害
    flashTimer: 0, knockbackX: 0, knockbackY: 0, knockbackRemaining: 0,
  };
  EnemySystem.enemies.push(chaser);
  const touchDist = (chaser.radius || 14) + (p.radius || 10) + 5; // 41
  // 看 p.radius 实际值
  console.log('p.radius:', p.radius, 'p.x:', p.x, 'p.y:', p.y);
  console.log('p.attackRange:', p.attackRange, 'p.hp:', p.hp);
  console.log('PlayerSystem.takeDamage type:', typeof PlayerSystem.takeDamage);

  // 跑 2 秒
  const positions = [];
  const initialPlayerHp = p.hp;
  for (let f = 0; f < 360; f++) {
    if (f >= 115 && f <= 130 || f >= 205 && f <= 215 || f >= 295 && f <= 305) {
      console.log(`Pre f=${f}: dist=${Math.hypot(chaser.x - p.x, chaser.y - p.y).toFixed(1)} attackTimer=${chaser.attackTimer.toFixed(3)} playerHp=${p.hp}`);
    }
    EnemySystem.update(1/60, p);
    if (f >= 115 && f <= 130 || f >= 205 && f <= 215 || f >= 295 && f <= 305) {
      console.log(`Post f=${f}: dist=${Math.hypot(chaser.x - p.x, chaser.y - p.y).toFixed(1)} attackTimer=${chaser.attackTimer.toFixed(3)} playerHp=${p.hp}`);
    }
    if (f % 6 === 0) {
      const dx2 = chaser.x - p.x, dy2 = chaser.y - p.y;
      const dist2 = Math.hypot(dx2, dy2);
      positions.push({ f, dist: Math.round(dist2 * 10) / 10, chaserX: Math.round(chaser.x), playerHp: p.hp });
    }
  }
  const finalDist = Math.hypot(chaser.x - p.x, chaser.y - p.y);
  const totalDmg = initialPlayerHp - p.hp;
  return {
    touchDist,
    initialPlayerHp,
    finalPlayerHp: p.hp,
    totalDamage: totalDmg,
    finalDist: Math.round(finalDist * 10) / 10,
    samplePositions: positions.filter((_, i) => i % 5 === 0), // 每 30 帧
    hitCount: positions.filter(p => p.playerHp < 99999).length,
  };
});

console.log('--- Task C: 怪靠边停 + 接触伤害 + cooldown ---');
console.log('contact stop dist:', r.touchDist);
console.log('玩家初始 HP:', r.initialPlayerHp, '→ 最终 HP:', r.finalPlayerHp);
console.log('玩家受总伤害:', r.totalDamage, '(2秒内, cooldown 1.5s)');
console.log('怪最终距离玩家:', r.finalDist, '(期望 ~', r.touchDist, '停止)');
console.log('样本位置 (每 30 帧):');
for (const s of r.samplePositions) console.log(' ', s);
console.log('--- Page logs ---');
for (const l of logs) console.log(' ', l);
console.log('Errors:', errors);
await browser.close();
