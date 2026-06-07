// 验证武器详情 Modal: ▾ 点击 → 详情 + 3 按钮 → 取消/卖出/合并
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });

await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

// 1) 启动游戏
const initCheck = await page.evaluate(() => {
    return {
        hasGameEngine: typeof GameEngine !== 'undefined',
        hasPlayerSystem: typeof PlayerSystem !== 'undefined',
        hasUISystem: typeof UISystem !== 'undefined',
        hasShopSystem: typeof ShopSystem !== 'undefined',
    };
});
console.log('Globals check:', initCheck);

const startResult = await page.evaluate(() => {
    try {
        GameEngine.startGame('pistol', 'normal');
        return { ok: true, state: GameEngine.state, weapons: PlayerSystem.player?.weapons };
    } catch (e) {
        return { ok: false, err: e.message };
    }
});
console.log('Start game:', startResult);
await page.waitForTimeout(500);

// 2) 强制进 shopping + 渲染
await page.evaluate(() => {
    GameEngine.state = 'shopping';
    UISystem.showShop();
});
await page.waitForTimeout(400);

console.log('\n--- Test 1: ▾ 点击 → 打开 Modal ---');
const click1 = await page.evaluate(() => {
    const btn = document.querySelector('.slot-dropdown-btn');
    if (!btn) return { ok: false, why: 'no .slot-dropdown-btn (weapons可能为空)' };
    btn.click();
    return { ok: true, idx: btn.dataset.idx };
});
console.log('Click:', click1);
await page.waitForTimeout(300);

const afterOpen = await page.evaluate(() => {
    const modal = document.getElementById('weaponDetailModal');
    return {
        hidden: modal?.classList.contains('hidden'),
        iconHasContent: !!document.getElementById('wdIcon')?.querySelector('img,canvas'),
        name: document.getElementById('wdName')?.textContent,
        level: document.getElementById('wdLevel')?.textContent,
        quality: document.getElementById('wdQuality')?.textContent,
        qualityColor: document.getElementById('wdQuality')?.style.color,
        statsCount: document.querySelectorAll('#wdStats .wd-stat-row').length,
        specialText: document.getElementById('wdSpecial')?.textContent.trim().slice(0, 60),
        sellDisabled: document.getElementById('wdBtnSell')?.disabled,
        mergeDisabled: document.getElementById('wdBtnMerge')?.disabled,
    };
});
console.log('Modal hidden:', afterOpen.hidden, '(期望 false)');
console.log('Icon has content:', afterOpen.iconHasContent, '(期望 true)');
console.log('Name:', afterOpen.name);
console.log('Level:', afterOpen.level, '(期望 Lv.1)');
console.log('Quality:', afterOpen.quality, '(期望 普通)');
console.log('Quality color:', afterOpen.qualityColor, '(期望非空)');
console.log('Stats rows:', afterOpen.statsCount, '(期望 >= 4)');
console.log('Special text:', afterOpen.specialText);
console.log('Sell disabled:', afterOpen.sellDisabled, '(期望 false)');
console.log('Merge disabled (1 pistol):', afterOpen.mergeDisabled, '(期望 true)');

console.log('\n--- Test 2: 取消关闭 ---');
await page.evaluate(() => document.getElementById('wdBtnCancel').click());
await page.waitForTimeout(200);
const afterCancel = await page.evaluate(() =>
    document.getElementById('weaponDetailModal')?.classList.contains('hidden'));
console.log('Modal hidden after cancel:', afterCancel, '(期望 true)');

console.log('\n--- Test 3: 注入 2 把 pistol → Merge 按钮启用 ---');
await page.evaluate(() => {
    const p = PlayerSystem.player;
    p.weapons = [{ id: 'pistol', level: 1, quality: 'T1' }, { id: 'pistol', level: 1, quality: 'T1' }];
    UISystem.updateShop(p);
    UISystem._showWeaponDetailModal(0, p, p.weapons);
});
await page.waitForTimeout(200);
const mergeState = await page.evaluate(() => ({
    modalOpen: !document.getElementById('weaponDetailModal').classList.contains('hidden'),
    mergeDisabled: document.getElementById('wdBtnMerge').disabled,
}));
console.log('Modal open:', mergeState.modalOpen, '(期望 true)');
console.log('Merge disabled (2 pistol 同 level):', mergeState.mergeDisabled, '(期望 false)');

console.log('\n--- Test 4: 🪙 卖出 → 武器 -1 + Modal 关闭 ---');
const before4 = await page.evaluate(() => {
    const p = PlayerSystem.player;
    p.weapons = [{ id: 'pistol', level: 1, quality: 'T1' }];
    UISystem.updateShop(p);
    UISystem._showWeaponDetailModal(0, p, p.weapons);
    return { weapons: p.weapons.length, gold: p.gold || 0 };
});
console.log('Before sell:', before4);
await page.waitForTimeout(200);
const sellResult = await page.evaluate(() => {
    const before = PlayerSystem.player.weapons.length;
    document.getElementById('wdBtnSell').click();
    return {
        weaponsAfter: PlayerSystem.player.weapons.length,
        modalHidden: document.getElementById('weaponDetailModal').classList.contains('hidden'),
    };
});
console.log('After sell:', sellResult, '(期望 weapons-1, modal hidden)');

console.log('\n--- Test 5: × 关闭 ---');
const before5 = await page.evaluate(() => {
    const p = PlayerSystem.player;
    p.weapons = [{ id: 'pistol', level: 1, quality: 'T1' }];
    UISystem.updateShop(p);
    UISystem._showWeaponDetailModal(0, p, p.weapons);
    return { weapons: p.weapons.length };
});
await page.waitForTimeout(200);
const closeResult = await page.evaluate(() => {
    document.getElementById('wdClose').click();
    return {
        modalHidden: document.getElementById('weaponDetailModal').classList.contains('hidden'),
        weaponsSame: PlayerSystem.player.weapons.length,
    };
});
console.log('× click:', closeResult, '(期望 modal hidden, weapons 数量不变)');

console.log('\n--- Errors ---');
console.log(errors.length ? errors : 'none');

await browser.close();
