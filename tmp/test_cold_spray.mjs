// 排查冷气喷射器 - 直接调 _fireSpray 看子弹和伤害
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
  p.weapons[0].cooldownTimer = 0;

  // 5 怪
  EnemySystem.enemies = [
    { x: p.x + 200, y: p.y, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff', behavior: 'chase' },
    { x: p.x + 250, y: p.y - 100, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff', behavior: 'chase' },
    { x: p.x + 150, y: p.y - 100, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff', behavior: 'chase' },
    { x: p.x + 250, y: p.y + 100, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff', behavior: 'chase' },
    { x: p.x + 150, y: p.y + 100, alive: true, radius: 18, hp: 999, maxHp: 999, color: '#ff00ff', behavior: 'chase' },
  ];

  const params = p.weaponParams['cold_spray'];
  const target = EnemySystem.enemies[0];
  const angle = 0;
  const weaponId = 'cold_spray';
  const weaponDef = ShopSystem.allWeapons.find(w => w.id === 'cold_spray');
  const spawnX = p.x + Math.cos(angle) * 25;
  const spawnY = p.y + Math.sin(angle) * 25;

  // 诊断: damage 怎么算的
  const coldDefDamage = weaponDef.damage_lv1;
  const coldDefTag = weaponDef.tag;
  const coldParamsDmg = params.damageMult;
  const calcDmg = StatsSystem.calcDamage(weaponDef, p, target, params);
  const swordTags = p.tags;
  const swordMelee = p.meleeDamage;
  const swordRanged = p.rangedDamage;
  const swordElem = p.elementalDamage;
  const swordBaseDmg = p._baseDamage;

  const beforeCount = BulletSystem.bullets.length;
  PlayerSystem._fireSpray(angle, params, target, weaponId, spawnX, spawnY, weaponDef);
  const afterCount = BulletSystem.bullets.length;
  const bulletsAfterFire = BulletSystem.bullets.filter(b => b.isPlayer).map(b => ({
    x: Math.round(b.x), y: Math.round(b.y),
    vx: Math.round(b.vx), vy: Math.round(b.vy),
    radius: b.radius,
    damage: b.damage,
    pierce: b.pierce,
    weaponTag: b.weaponTag,
    isPlayer: b.isPlayer,
  }));

  BulletSystem.update(1/60);
  const bulletsAfterUpdate = BulletSystem.bullets.filter(b => b.isPlayer).map(b => ({
    x: Math.round(b.x), y: Math.round(b.y),
    distance: Math.round(Math.hypot(b.x - p.x, b.y - p.y)),
  }));

  GameEngine._checkBulletCollisions(p);
  const afterCol = EnemySystem.enemies.map((e, i) => ({ i, hp: e.hp, dx: e.x - p.x, dy: e.y - p.y }));

  return {
    totalAllWeapons: ShopSystem.allWeapons.length,
    coldSprayParams: {
      behavior: params.behavior,
      pierce: params.pierce,
      slowAmount: params.slowAmount,
      attackRange: params.attackRange,
      bulletCount: params.bulletCount,
      sprayCone: params.sprayCone,
      bulletSpeed: params.bulletSpeed,
      bulletMaxRange: params.bulletMaxRange,
    },
    diag: {
      coldDefDamage,
      coldDefTag,
      coldParamsDmg,
      calcDmg,
      swordTags,
      swordMelee,
      swordRanged,
      swordElem,
      swordBaseDmg,
    },
    bulletsCreated: afterCount - beforeCount,
    bulletsAfterFire,
    bulletsAfterUpdate,
    afterCol,
  };
});

console.log('--- 冷气喷射器 (cold_spray) ---');
console.log('总武器数:', r.totalAllWeapons);
console.log('冷气喷射器参数:', JSON.stringify(r.coldSprayParams));
console.log('诊断: def.damage_lv1 =', r.diag.coldDefDamage, '| def.tag =', r.diag.coldDefTag, '| params.damageMult =', r.diag.coldParamsDmg);
console.log('诊断: calcDamage 返回 =', r.diag.calcDmg);
console.log('诊断: 剑客 tags =', JSON.stringify(r.diag.swordTags));
console.log('诊断: 剑客 melee/ranged/elem/baseDmg =', r.diag.swordMelee, '/', r.diag.swordRanged, '/', r.diag.swordElem, '/', r.diag.swordBaseDmg);
console.log('单次 _fireSpray 创建子弹数:', r.bulletsCreated);
console.log('子弹发射后:');
for (const b of r.bulletsAfterFire) console.log(' ', JSON.stringify(b));
console.log('1 帧后位置+距离:');
for (const b of r.bulletsAfterUpdate) console.log(' ', JSON.stringify(b));
console.log('碰撞后 5 怪 HP:');
for (const e of r.afterCol) console.log(' ', e);
console.log('Errors:', errors);
await browser.close();
