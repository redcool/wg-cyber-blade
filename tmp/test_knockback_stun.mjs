// B 方案验证: 击退改距离模式 + stun + mass 抗性
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
  // 剑客 attackSpeed=1.2 已在 characters

  // 1) basic 怪 (radius=14, mass=1) 在正北 200 距离
  EnemySystem.enemies = [{
    id: 'basic', x: p.x, y: p.y - 200, alive: true, radius: 14,
    hp: 999, maxHp: 999, behavior: 'chaser', speed: 80, damage: 5, attackCooldown: 1.5,
    color: '#ff4444', glowColor: '#ff0044',
  }];

  // 测 1: 单次击退,看剩余距离+stun
  const startX = EnemySystem.enemies[0].x;
  const startY = EnemySystem.enemies[0].y;
  EnemySystem.applyKnockback(EnemySystem.enemies[0], 0, 200, 200, 120);  // (dx=0, dy=200, dist=200) → 推北
  const afterKb = {
    remaining: EnemySystem.enemies[0].knockbackRemaining,
    dirX: EnemySystem.enemies[0].knockbackDirX,
    dirY: EnemySystem.enemies[0].knockbackDirY,
    stun: EnemySystem.enemies[0].stunTimer,
    x: EnemySystem.enemies[0].x,
    y: EnemySystem.enemies[0].y,
  };

  // 测 2: tank 怪 (radius=22, mass≈2.5) 受同等击退
  EnemySystem.enemies.push({
    id: 'tank', x: p.x, y: p.y - 200, alive: true, radius: 22,
    hp: 999, maxHp: 999, behavior: 'chaser', speed: 45, damage: 8, attackCooldown: 2.0,
    color: '#8844ff', glowColor: '#6622ff',
  });
  const tank = EnemySystem.enemies[1];
  const tankBefore = { x: tank.x, y: tank.y };
  EnemySystem.applyKnockback(tank, 0, 200, 200, 120);
  const tankKb = {
    remaining: tank.knockbackRemaining,
    stun: tank.stunTimer,
  };

  // 测 3: elite (isElite=true) 免疫击退
  EnemySystem.enemies.push({
    id: 'elite', x: p.x, y: p.y - 200, alive: true, radius: 24,
    hp: 999, maxHp: 999, behavior: 'chaser', speed: 70, damage: 10, attackCooldown: 1.0,
    color: '#ffcc00', glowColor: '#ffaa00', isElite: true,
  });
  const elite = EnemySystem.enemies[2];
  const eliteBefore = { x: elite.x, y: elite.y };
  const eliteKbResult = EnemySystem.applyKnockback(elite, 0, 200, 200, 120);
  const eliteKb = { remaining: elite.knockbackRemaining, result: eliteKbResult };

  // 测 4: stun 期间怪不动,跑 10 帧
  // 测 5: stun 完,怪能追玩家
  const dist1Before = Math.hypot(EnemySystem.enemies[0].x - p.x, EnemySystem.enemies[0].y - p.y);

  for (let f = 0; f < 60; f++) {
    EnemySystem.update(1/60, p);
  }

  const dist1After = Math.hypot(EnemySystem.enemies[0].x - p.x, EnemySystem.enemies[0].y - p.y);
  const distTankAfter = Math.hypot(tank.x - p.x, tank.y - p.y);

  return {
    afterKb,
    tankKb, tankBefore,
    eliteKb, eliteBefore,
    dist1Before, dist1After,
    distTankAfter,
    basicStill: EnemySystem.enemies[0].knockbackRemaining,
  };
});

console.log('--- B 方案击退重构验证 ---');
console.log('1) basic (r=14, mass=1) 单次击退 kb=120:');
console.log('   起始位置:', r.tankBefore);  // reuse
console.log('   afterKb:', r.afterKb);
console.log('   期望: remaining≈120, stun≈0.25, dirY≈1 (推北)');
console.log();
console.log('2) tank (r=22, mass≈2.47) 同样 kb=120:');
console.log('   tankKb:', r.tankKb);
console.log('   期望: remaining≈48.6 (120/2.47)');
console.log();
console.log('3) elite (isElite=true) 免疫:');
console.log('   eliteBefore:', r.eliteBefore);
console.log('   eliteKb:', r.eliteKb);
console.log('   期望: result=0, remaining=0');
console.log();
console.log('4) 60 帧后怪位置:');
console.log('   basic 起始 dist:', Math.round(r.dist1Before), '→ 60帧后:', Math.round(r.dist1After));
console.log('   tank  60帧后:', Math.round(r.distTankAfter));
console.log('   期望: basic dist 减小 (能追玩家), knockbackRemaining = 0');
console.log('   basic 剩余 knockbackRemaining:', r.basicStill);
console.log();
console.log('Errors:', errors);
await browser.close();
