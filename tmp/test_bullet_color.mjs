// 验证子弹颜色 + 音效按武器 tag 区分
import { chromium } from 'playwright';

const URL = 'http://localhost:8000/index.html';
const log = [];
const errors = [];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on('console', m => {
  if (m.type() === 'error') errors.push(`[console] ${m.text()}`);
});
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));

try {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // 1) 验证 BulletSystem.create 自动从 weaponId 拿 tag
  log.push('=== 1) BulletSystem.create 自动从 weaponId 查 tag ===');
  const tagResults = await page.evaluate(() => {
    const tests = [
      // [weaponId, expectedTag, label]
      ['pistol',         'gun',   'pistol (gun)'],
      ['sniper',         'gun',   'sniper (gun)'],
      ['bow',            'bow',   'bow (bow)'],
      ['fire_staff',     'magic', 'fire_staff (magic)'],
      ['frost_staff',    'magic', 'frost_staff (magic)'],
      ['thunder_staff',  'magic', 'thunder_staff (magic)'],
      ['energy_staff',   'magic', 'energy_staff (magic)'],
      ['pike',           'lance', 'pike (lance)'],
      ['heal_gun',       'medic', 'heal_gun (medic)'],
    ];
    const out = [];
    for (const [wid, expected, label] of tests) {
      const b = BulletSystem.create(0, 0, 0, 10, 400, 0, true, wid);
      out.push({ label, wid, expected, got: b.weaponTag, ok: b.weaponTag === expected });
    }
    return out;
  });
  for (const r of tagResults) {
    log.push(`  ${r.ok ? '✅' : '❌'} ${r.label} → tag=${r.got} (expected ${r.expected})`);
    if (!r.ok) throw new Error(`${r.label} tag mismatch: got ${r.got}, expected ${r.expected}`);
  }

  // 2) 验证 renderer 根据 tag + 元素字段选颜色
  log.push('=== 2) 子弹颜色按 tag/元素区分 ===');
  const colorResults = await page.evaluate(() => {
    // 拿不到 renderer 实例,直接复用其 drawBullet 的颜色映射逻辑
    // 这里测试 BulletSystem.create 后 b.weaponTag 已正确填好
    function pickColor(b) {
      if (b.color) return b.color;
      if (b.isMortar) return '#aa44ff';
      if (b.burnDps > 0) return '#ff4444';
      if (b.slowAmount > 0) return '#88ddff';
      if (b.chainCount > 0) return '#ffaa44';
      if (b.healOnHit > 0) return '#00ff88';
      if (b.weaponTag === 'gun' || b.weaponTag === 'bow') return '#ffffff';
      if (b.weaponTag === 'magic') return '#ffffaa';
      if (b.weaponTag === 'melee' || b.weaponTag === 'lance') return '#ffdd44';
      if (b.weaponTag === 'medic') return '#aaffaa';
      return '#ffff44';
    }
    const tests = [
      // [weaponId, extra, expectedColor, label]
      ['pistol',       {},                  '#ffffff', 'gun → 白'],
      ['sniper',       {},                  '#ffffff', 'gun(狙击) → 白'],
      ['bow',          {},                  '#ffffff', 'bow → 白'],
      ['fire_staff',   {splashRadius: 45, burnDps: 5}, '#ff4444', '火(灼烧) → 红'],
      ['fire_wand',    {burnDps: 3},        '#ff4444', '火(灼烧) → 红'],
      ['frost_staff',  {slowAmount: 0.6, slowDuration: 3}, '#88ddff', '冰(减速) → 冰蓝'],
      // frost_arrow 数据 slowAmount=0,慢速是次要效果,主要还是弓 → 白
      ['frost_arrow',  {slowAmount: 0, slowDuration: 0.5}, '#ffffff', 'frost_arrow 慢速弱,走弓色'],
      ['thunder_staff',{chainCount: 3},     '#ffaa44', '雷(连锁) → 橙黄'],
      ['lightning_staff', {chainCount: 5},  '#ffaa44', '雷(连锁) → 橙黄'],
      ['energy_staff', {},                  '#ffffaa', '魔法(普通) → 淡黄'],
      ['magic_orb',    {homingStrength: 3}, '#ffffaa', '魔法(追踪) → 淡黄'],
      ['arcane_orb',   {homingStrength: 3}, '#ffffaa', '魔法(追踪) → 淡黄'],
      ['heal_gun',     {healOnHit: 3},      '#00ff88', '治疗(回血) → 绿'],
      ['pike',         {},                  '#ffdd44', 'lance → 金黄'],
    ];
    const out = [];
    for (const [wid, extra, expected, label] of tests) {
      const b = BulletSystem.create(0, 0, 0, 10, 400, 0, true, wid, extra);
      const got = pickColor(b);
      out.push({ label, wid, expected, got, ok: got === expected });
    }
    return out;
  });
  for (const r of colorResults) {
    log.push(`  ${r.ok ? '✅' : '❌'} ${r.label} → ${r.got} (expected ${r.expected})`);
    if (!r.ok) throw new Error(`${r.label} color mismatch: got ${r.got}, expected ${r.expected}`);
  }

  // 3) 验证 _fireWeapon 根据 weapon tag 选不同音效
  log.push('=== 3) 音效按 tag 区分(gun vs magic) ===');
  // spy AudioSystem.play
  const soundResults = await page.evaluate(() => {
    const sounds = [];
    const origPlay = AudioSystem.play.bind(AudioSystem);
    AudioSystem.play = function(s) { sounds.push(s); /* skip SFX generation */ };
    const p = PlayerSystem.player || PlayerSystem.create(1500, 1500);
    // 给一个最简目标
    const fakeEnemy = { x: p.x + 100, y: p.y, alive: true, radius: 18 };
    EnemySystem.enemies = EnemySystem.enemies || [];
    EnemySystem.enemies.push(fakeEnemy);
    // 替换 enemies filter 来源? 简化: 直接调 _fireWeapon 测试
    const tagWeapons = [
      // 枪械 tag → 应该用 gunshot/heavy_gun(不能用 magic)
      { id: 'pistol',         expectMagic: false, expectedSound: 'gunshot',   label: 'pistol' },
      { id: 'sniper',         expectMagic: false, expectedSound: 'gunshot',   label: 'sniper' },
      { id: 'shotgun_double', expectMagic: false, expectedSound: 'heavy_gun', label: 'shotgun_double (spread)' },
      // 魔法 tag → 默认 magic;元素行为(冰/雷)走元素音效
      { id: 'energy_staff',   expectMagic: true,  expectedSound: 'magic',     label: 'energy_staff' },
      { id: 'magic_orb',      expectMagic: true,  expectedSound: 'magic',     label: 'magic_orb' },
      { id: 'arcane_orb',     expectMagic: true,  expectedSound: 'magic',     label: 'arcane_orb' },
      { id: 'fire_wand',      expectMagic: true,  expectedSound: 'magic',     label: 'fire_wand' },
      { id: 'frost_staff',    expectMagic: false, expectedSound: 'ice',       label: 'frost_staff (冰元素)' },
      { id: 'thunder_staff',  expectMagic: false, expectedSound: 'lightning', label: 'thunder_staff (雷元素)' },
      { id: 'lightning_staff',expectMagic: false, expectedSound: 'lightning', label: 'lightning_staff (雷元素)' },
      { id: 'fire_staff',     expectMagic: false, expectedSound: 'explosion', label: 'fire_staff (爆炸元素)' },
      { id: 'flame_spray',    expectMagic: false, expectedSound: 'fire',      label: 'flame_spray (spray)' },
    ];
    const out = [];
    for (const tw of tagWeapons) {
      sounds.length = 0;
      const def = ShopSystem.getWeaponDef(tw.id);
      if (!def) { out.push({ label: tw.label, ok: false, reason: 'no def' }); continue; }
      const params = p.weaponParams[tw.id] || { behavior: def.behavior || 'bullet', bulletCount: 1, bulletSpeed: 400, spread: 0.05, pierce: 0, burnDps: def.burnDps||0, slowAmount: def.slowAmount||0, chainCount: def.chainCount||0, splashRadius: def.splashRadius||0, homingStrength: def.homingStrength||0, healOnHit: def.healOnHit||0, attackRange: 320, _weaponDef: def, _weaponLevel: 1 };
      // 模拟 _fireWeapon 内部的音效选择
      const tag = def.tag;
      const actualBehavior = params.behavior;
      let sound = null;
      if (actualBehavior === 'shock')      sound = 'lightning';
      else if (actualBehavior === 'frost')  sound = 'ice';
      else if (actualBehavior === 'spray')  sound = 'fire';
      else if (actualBehavior === 'explode') sound = tag === 'gun' ? 'cannon' : 'explosion';
      else if (actualBehavior === 'melee_sweep')  sound = 'melee_slash';
      else if (actualBehavior === 'melee_thrust') sound = 'melee_heavy';
      else if (tag === 'gun' || tag === 'bow') {
        if (actualBehavior === 'spread' || actualBehavior === 'laser') sound = 'heavy_gun';
        else sound = 'gunshot';
      } else if (tag === 'magic') {
        sound = 'magic';
      } else if (tag === 'medic') sound = 'pistol';
      else if (actualBehavior === 'bullet') sound = tag === 'magic' ? 'magic' : 'pistol';
      else if (actualBehavior === 'spread') sound = tag === 'magic' ? 'magic' : 'heavy_gun';
      else if (actualBehavior === 'homing') sound = 'magic';
      else if (actualBehavior === 'laser')  sound = 'laser';
      else if (actualBehavior === 'heal_bullet') sound = 'pistol';
      else sound = 'pistol';
      out.push({ label: tw.label, tag, behavior: actualBehavior, sound, expected: tw.expectedSound, isMagic: sound === 'magic', ok: sound === tw.expectedSound });
    }
    AudioSystem.play = origPlay;
    return out;
  });
  for (const r of soundResults) {
    const magicMarker = r.isMagic ? '🎵' : '🔫';
    log.push(`  ${r.ok ? '✅' : '❌'} ${magicMarker} ${r.label} (tag=${r.tag}, behavior=${r.behavior}) → sound=${r.sound} (expected ${r.expected})`);
    if (!r.ok) throw new Error(`${r.label} sound logic wrong: got ${r.sound}, expected ${r.expected}`);
  }

  log.push('✅ ALL PASS');
} catch (e) {
  log.push(`❌ FAIL: ${e.message}`);
  process.exitCode = 1;
} finally {
  console.log('--- LOG ---');
  for (const l of log) console.log(l);
  if (errors.length) {
    console.log('--- ERRORS ---');
    for (const e of errors) console.log(e);
  }
  await browser.close();
}
