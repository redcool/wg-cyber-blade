// 验证打折券: 卖了后 player.shopDiscount=0.8, _getDisplayCost 算 8 折
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
  p.materials = 999;
  p.weapons = [];
  p.items = [];

  // 1) 卖打折券
  const buyResult = ItemSystem.buyItem('coupon_item', p);
  const afterBuy = {
    shopDiscount: p.shopDiscount,
    items: p.items.slice(),
    ItemSystem_ownedItems: ItemSystem.ownedItems.slice(),
  };

  // 2) 调用 _getDisplayCost 看是否 8 折
  const baseCost = 30;
  const htmlDiscount = UISystem._getDisplayCost(p, baseCost);

  // 3) 对比无券 vs 有券
  const p2 = { ...p, shopDiscount: undefined };
  const htmlNoDisc = UISystem._getDisplayCost(p2, baseCost);

  // 4) 也测 5 折 (模拟叠加)
  const p3 = { ...p, shopDiscount: 0.5 };
  const htmlHalf = UISystem._getDisplayCost(p3, baseCost);

  return {
    buyResult,
    afterBuy,
    htmlDiscount,
    htmlNoDisc,
    htmlHalf,
  };
});

console.log('--- 打折券测试 ---');
console.log('buyItem result:', r.buyResult);
console.log('afterBuy:', JSON.stringify(r.afterBuy));
console.log('htmlNoDisc (30, no coupon):', r.htmlNoDisc);
console.log('htmlDiscount (30, 8折):', r.htmlDiscount);
console.log('htmlHalf (30, 5折):', r.htmlHalf);
console.log('Errors:', errors);
await browser.close();
