// e2e: 验证武器详情 Modal (替代旧 dropdown 测试)
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const URL = 'http://localhost:8000/index.html';
const SHOTS = [];

function shot(page, name) {
    return page.screenshot({ path: `tmp/shot_${name}.png`, fullPage: true }).then(() => SHOTS.push(name));
}

const log = [];
const errors = [];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

page.on('console', msg => { if (msg.type() === 'error') errors.push(`[console.${msg.type()}] ${msg.text()}`); });
page.on('pageerror', err => errors.push(`[pageerror] ${err.message}`));

try {
    log.push('1) 打开主页');
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    log.push('2) 启动游戏 + 进 shopping');
    await page.evaluate(() => {
        GameEngine.startGame('pistol', 'normal');
        GameEngine.state = 'shopping';
        UISystem.showShop();
    });
    await page.waitForTimeout(400);

    log.push('3) 注入 3 把武器: pistol Lv1, pistol Lv1, sword Lv2');
    await page.evaluate(() => {
        const p = PlayerSystem.player;
        p.weapons = [
            { id: 'pistol', level: 1, quality: 'T1' },
            { id: 'pistol', level: 1, quality: 'T1' },
            { id: 'sword', level: 2, quality: 'T1' },
        ];
        UISystem.updateShop(p);
    });
    await page.waitForTimeout(300);
    await shot(page, '01_shop_open');

    // 验证下拉按钮数量 = 3
    const dropdownCount = await page.locator('.slot-dropdown-btn').count();
    log.push(`4) ▾ 按钮数量 = ${dropdownCount}（预期 3）`);
    if (dropdownCount !== 3) throw new Error(`expected 3 dropdowns, got ${dropdownCount}`);

    log.push('5) 打开第 1 把 pistol modal');
    await page.locator('.slot-dropdown-btn').nth(0).click();
    await page.waitForTimeout(250);
    const modalOpen = await page.evaluate(() =>
        !document.getElementById('weaponDetailModal').classList.contains('hidden'));
    log.push(`   Modal hidden = ${!modalOpen}（预期 false）`);
    if (!modalOpen) throw new Error('modal not open after click ▾');

    // 验证 modal 字段填充
    const modalContent = await page.evaluate(() => ({
        name: document.getElementById('wdName')?.textContent,
        level: document.getElementById('wdLevel')?.textContent,
        quality: document.getElementById('wdQuality')?.textContent,
        statsRows: document.querySelectorAll('#wdStats .wd-stat-row').length,
        specialHasContent: (document.getElementById('wdSpecial')?.textContent.trim().length || 0) > 0,
    }));
    log.push(`   Name: ${modalContent.name}, Level: ${modalContent.level}, Quality: ${modalContent.quality}`);
    log.push(`   Stats rows: ${modalContent.statsRows}（预期 >= 4）, Special: ${modalContent.specialHasContent}`);
    if (modalContent.statsRows < 4) throw new Error(`stats rows too few: ${modalContent.statsRows}`);
    if (!modalContent.specialHasContent) throw new Error('special section empty');
    await shot(page, '02_modal_open');

    // 验证 pistol Lv1 有合并伙伴 → Merge 启用
    const mergeDisabled_1pistol = await page.evaluate(() =>
        document.getElementById('wdBtnMerge').disabled);
    log.push(`   Merge 按钮 (1 pistol + 1 同 level pistol) disabled = ${mergeDisabled_1pistol}（预期 false）`);
    if (mergeDisabled_1pistol) throw new Error('merge should be enabled for 2 same-id same-level pistols');

    log.push('6) 点 🪙 卖出 → 第 1 把 pistol 卖出 + 武器 -1');
    const beforeSell = await page.evaluate(() => PlayerSystem.player.weapons.length);
    await page.locator('#wdBtnSell').click();
    await page.waitForTimeout(300);
    const afterSell = await page.evaluate(() => PlayerSystem.player.weapons.length);
    const modalHiddenAfterSell = await page.evaluate(() =>
        document.getElementById('weaponDetailModal').classList.contains('hidden'));
    log.push(`   卖出前 ${beforeSell} → 卖出后 ${afterSell}（预期 ${beforeSell - 1}）`);
    log.push(`   Modal hidden = ${modalHiddenAfterSell}（预期 true）`);
    if (afterSell !== beforeSell - 1) throw new Error(`sell failed: ${beforeSell} -> ${afterSell}`);
    if (!modalHiddenAfterSell) throw new Error('modal not closed after sell');
    await shot(page, '03_after_sell');

    // 验证剩下的武器: 1 pistol Lv1 + 1 sword Lv2
    const remaining = await page.evaluate(() => PlayerSystem.player.weapons.map(w => `${w.id} Lv${w.level||1}`));
    log.push(`   剩余武器 = [${remaining.join(', ')}]（预期含 pistol Lv1, sword Lv2）`);
    if (remaining.length !== 2) throw new Error(`expected 2 remaining, got ${remaining.length}`);

    log.push('7) 打开 sword Lv2 modal → 验证 Merge 禁用 (无同 level 伙伴)');
    await page.locator('.slot-dropdown-btn').nth(1).click();
    await page.waitForTimeout(200);
    const swordMergeDisabled = await page.evaluate(() =>
        document.getElementById('wdBtnMerge').disabled);
    log.push(`   sword Lv2 merge disabled = ${swordMergeDisabled}（预期 true）`);
    if (!swordMergeDisabled) throw new Error('merge should be disabled for sword Lv2 (no partner)');

    log.push('8) 点取消 → Modal 关闭 + 武器不变');
    const beforeCancel = await page.evaluate(() => PlayerSystem.player.weapons.length);
    await page.locator('#wdBtnCancel').click();
    await page.waitForTimeout(200);
    const afterCancel = await page.evaluate(() => PlayerSystem.player.weapons.length);
    const modalHiddenAfterCancel = await page.evaluate(() =>
        document.getElementById('weaponDetailModal').classList.contains('hidden'));
    log.push(`   武器数 ${beforeCancel} → ${afterCancel}（预期不变）, Modal hidden = ${modalHiddenAfterCancel}（预期 true）`);
    if (beforeCancel !== afterCancel) throw new Error('weapons changed on cancel!');
    if (!modalHiddenAfterCancel) throw new Error('modal not closed on cancel');
    await shot(page, '04_after_cancel');

    log.push('9) 注入同 id 同 level 武器 → 验证合并流程');
    await page.evaluate(() => {
        const p = PlayerSystem.player;
        p.weapons = [
            { id: 'pistol', level: 1, quality: 'T1' },
            { id: 'pistol', level: 1, quality: 'T1' },
        ];
        UISystem.updateShop(p);
    });
    await page.waitForTimeout(200);
    await page.locator('.slot-dropdown-btn').nth(0).click();
    await page.waitForTimeout(200);
    const mergeEnabled = await page.evaluate(() =>
        !document.getElementById('wdBtnMerge').disabled);
    log.push(`   Merge 按钮启用 = ${mergeEnabled}（预期 true）`);
    if (!mergeEnabled) throw new Error('merge should be enabled');
    await page.locator('#wdBtnMerge').click();
    await page.waitForTimeout(300);
    const afterMerge = await page.evaluate(() => PlayerSystem.player.weapons.map(w => `${w.id} Lv${w.level||1}`));
    log.push(`   合并后武器 = [${afterMerge.join(', ')}]（预期 [pistol Lv2]）`);
    if (afterMerge.length !== 1 || afterMerge[0] !== 'pistol Lv2') {
        throw new Error(`merge failed: ${afterMerge.join(', ')}`);
    }
    await shot(page, '05_after_merge');

    log.push('10) 验证 × 关闭按钮');
    await page.locator('.slot-dropdown-btn').nth(0).click();
    await page.waitForTimeout(200);
    await page.locator('#wdClose').click();
    await page.waitForTimeout(200);
    const xCloseHidden = await page.evaluate(() =>
        document.getElementById('weaponDetailModal').classList.contains('hidden'));
    log.push(`   × 关闭后 Modal hidden = ${xCloseHidden}（预期 true）`);
    if (!xCloseHidden) throw new Error('modal not closed on × button');

    log.push('✅ ALL PASS');
} catch (e) {
    log.push(`❌ FAIL: ${e.message}`);
    await shot(page, '99_fail');
    process.exitCode = 1;
} finally {
    console.log('--- LOG ---');
    for (const l of log) console.log(l);
    if (errors.length) {
        console.log('--- CONSOLE ERRORS ---');
        for (const e of errors) console.log(e);
    }
    writeFileSync('tmp/e2e_modal_log.txt', log.join('\n') + '\n\nERRORS:\n' + errors.join('\n'));
    await browser.close();
}
