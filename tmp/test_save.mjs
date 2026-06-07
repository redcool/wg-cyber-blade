// 验证 SaveSystem: localStorage 存档 + 文件导入导出 + UnlockSystem 还原
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const URL = 'http://localhost:8000/index.html';
const log = [];
const errors = [];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  acceptDownloads: true,
});
const page = await ctx.newPage();
page.on('console', m => {
  if (m.type() === 'error') errors.push(`[console] ${m.text()}`);
});
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));

const dumpUnlockState = (label) => page.evaluate((label) => ({
  label,
  stats: { ...UnlockSystem.stats },
  unlockedWeapons: [...UnlockSystem.unlockedWeapons],
  unlockedCharacters: [...UnlockSystem.unlockedCharacters],
  lsHas: !!localStorage.getItem('cyberblade_save'),
}), label);

try {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // 0) 清空 localStorage 保证干净环境
  log.push('=== 0) clean state ===');
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // 1) SaveSystem 应为空
  log.push('=== 1) no save on fresh load ===');
  const r1 = await page.evaluate(() => ({
    hasSave: SaveSystem.hasSave(),
    weapons: UnlockSystem.unlockedWeapons.size,
    chars: UnlockSystem.unlockedCharacters.size,
  }));
  log.push('  ' + JSON.stringify(r1));
  if (r1.hasSave) throw new Error('expected no save on fresh load');
  // 21 是默认基础武器集(UnlockSystem.unlockedWeapons 初值)
  if (r1.weapons !== 21) throw new Error(`expected 21 default weapons, got ${r1.weapons}`);

  // 2) 模拟解锁数据 + save
  log.push('=== 2) mutate UnlockSystem + save ===');
  await page.evaluate(() => {
    UnlockSystem.stats.totalKills = 42;
    UnlockSystem.stats.totalMaterials = 999;
    UnlockSystem.stats.maxLevel = 5;
    UnlockSystem.stats.highestLevel = 5;
    UnlockSystem.stats.totalPlayTime = 123.4;
    UnlockSystem.unlockedWeapons.add('holy_staff');
    UnlockSystem.unlockedWeapons.add('fireball');
    UnlockSystem.unlockedCharacters.add('mage');
    SaveSystem.save();
  });
  const r2 = await page.evaluate(() => ({
    hasSave: SaveSystem.hasSave(),
    raw: localStorage.getItem('cyberblade_save'),
  }));
  log.push('  hasSave=' + r2.hasSave + ' rawLen=' + (r2.raw?.length || 0));
  if (!r2.hasSave) throw new Error('save failed');
  const savedData = JSON.parse(r2.raw);
  if (savedData.stats.totalKills !== 42) throw new Error('totalKills not saved');
  if (!savedData.unlockedWeapons.includes('holy_staff')) throw new Error('holy_staff not saved');
  if (savedData.version !== 1) throw new Error('version missing');

  // 3) 重新加载页面 → UnlockSystem 应还原
  log.push('=== 3) reload page → restore from save ===');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const r3 = await dumpUnlockState('after reload');
  log.push('  ' + JSON.stringify(r3));
  if (r3.stats.totalKills !== 42) throw new Error(`totalKills not restored: got ${r3.stats.totalKills}`);
  if (r3.stats.totalMaterials !== 999) throw new Error('totalMaterials not restored');
  if (!r3.unlockedWeapons.includes('holy_staff')) throw new Error('holy_staff not restored');
  if (!r3.unlockedCharacters.includes('mage')) throw new Error('mage not restored');

  // 4) load() 合并行为 — 已解锁武器不应消失
  log.push('=== 4) load() merges with existing ===');
  await page.evaluate(() => {
    UnlockSystem.unlockedWeapons.add('heal_gun'); // 当前内存有
    UnlockSystem.stats.totalKills = 100; // 当前内存有
  });
  await page.evaluate(() => SaveSystem.load());
  const r4 = await dumpUnlockState('after merge load');
  log.push('  ' + JSON.stringify(r4));
  if (!r4.unlockedWeapons.includes('holy_staff')) throw new Error('merge: holy_staff lost');
  if (!r4.unlockedWeapons.includes('heal_gun')) throw new Error('merge: heal_gun lost');
  // _applySaveData 直接覆盖 stats,不会合并（这是设计）
  if (r4.stats.totalKills !== 42) throw new Error(`stats should be replaced not merged: got ${r4.stats.totalKills}`);

  // 5) 导出到文件
  log.push('=== 5) exportToFile ===');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => SaveSystem.exportToFile()),
  ]);
  const savePath = path.join(process.env.TEMP || '.', 'cyberblade_save_test.json');
  await download.saveAs(savePath);
  const fileContent = await fs.readFile(savePath, 'utf-8');
  const fileData = JSON.parse(fileContent);
  log.push('  fileSize=' + fileContent.length + ' version=' + fileData.version);
  if (fileData.version !== 1) throw new Error('exported file missing version');
  if (fileData.stats.totalKills !== 42) throw new Error('exported file has wrong totalKills');

  // 6) 清空 + 导入文件 → 应还原
  log.push('=== 6) importFromFile round-trip ===');
  await page.evaluate(() => {
    UnlockSystem.unlockedWeapons.clear();
    UnlockSystem.unlockedCharacters.clear();
    UnlockSystem.stats.totalKills = 0;
  });
  // 改写文件把 kills 改成 777 验证导入
  fileData.stats.totalKills = 777;
  await fs.writeFile(savePath, JSON.stringify(fileData));
  const fileBuffer = await fs.readFile(savePath, 'utf-8');
  const importResult = await page.evaluate(async ({ content, fname }) => {
    const file = new File([content], fname, { type: 'application/json' });
    return await SaveSystem.importFromFile(file);
  }, { content: fileBuffer, fname: 'save.json' });
  log.push('  result=' + JSON.stringify(importResult));
  if (!importResult.success) throw new Error('import failed: ' + importResult.message);
  const r6 = await dumpUnlockState('after import');
  log.push('  ' + JSON.stringify(r6));
  if (r6.stats.totalKills !== 777) throw new Error(`import: totalKills should be 777, got ${r6.stats.totalKills}`);
  if (!r6.unlockedWeapons.includes('holy_staff')) throw new Error('import: holy_staff not restored');
  if (!r6.lsHas) throw new Error('import: localStorage not synced');

  // 7) 损坏的存档数据
  log.push('=== 7) corrupt save rejected ===');
  await page.evaluate(() => localStorage.setItem('cyberblade_save', 'this is not json {{{'));
  const r7 = await page.evaluate(() => {
    // 不抛错,返回 false
    return { ok: SaveSystem.load() };
  });
  log.push('  ' + JSON.stringify(r7));
  if (r7.ok !== false) throw new Error('corrupt save should return false');

  // 8) 无 version 字段
  log.push('=== 8) save without version rejected ===');
  await page.evaluate(() => localStorage.setItem('cyberblade_save', JSON.stringify({ foo: 'bar' })));
  const r8 = await page.evaluate(() => ({ ok: SaveSystem.load() }));
  log.push('  ' + JSON.stringify(r8));
  if (r8.ok !== false) throw new Error('save without version should return false');

  // 9) clear() 清除存档
  log.push('=== 9) clear() ===');
  await page.evaluate(() => {
    SaveSystem.save();
    SaveSystem.clear();
  });
  const r9 = await page.evaluate(() => SaveSystem.hasSave());
  log.push('  hasSave=' + r9);
  if (r9) throw new Error('clear failed');

  log.push('✅ ALL PASS');
} catch (e) {
  log.push(`❌ FAIL: ${e.message}\n${e.stack}`);
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
