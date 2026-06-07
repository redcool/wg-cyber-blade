// BLOCKER 1 验证: 选完宝箱奖励后状态流转
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

  // 手动设 onAllChestsOpened 回调 (同 main.js L87-103)
  LootSystem.onAllChestsOpened = () => {
    if (GameEngine.levelUpPending) {
      GameEngine.levelUpPending = false;
      GameEngine.state = 'levelup';
      if (typeof LevelUpSystem !== 'undefined') LevelUpSystem.generateCards(PlayerSystem.player, PlayerSystem.player.level || 1);
      if (typeof UISystem !== 'undefined') UISystem.showLevelUp();
    } else {
      GameEngine.state = 'shopping';
      if (typeof UISystem !== 'undefined') UISystem.showShop();
    }
  };

  // 模拟 21 关结束, 推 1 个 normal chest
  LootSystem.reset();
  LootSystem.spawnChest(640, 350, 'normal');
  GameEngine.state = 'loot';
  GameEngine.levelUpPending = false;  // 直接走 shopping 分支

  // 模拟点宝箱奖励 (选第一个)
  const initialState = GameEngine.state;
  const initialPending = LootSystem.pendingChests.length;
  const initialRewards = LootSystem.currentRewards.length;

  // 模拟 ui.js modal click handler
  UISystem.showChestReward();
  const stateAfterShow = GameEngine.state;
  const rewardsAfterShow = LootSystem.currentRewards.length;

  // 模拟 selectReward(0, p)
  LootSystem.selectReward(0, p);
  const stateAfterSelect = GameEngine.state;
  const pendingAfterSelect = LootSystem.pendingChests.length;

  return {
    initialState,
    initialPending,
    initialRewards,
    stateAfterShow,
    rewardsAfterShow,
    stateAfterSelect,
    pendingAfterSelect,
  };
});

console.log('--- BLOCKER 1 验证: 宝箱抽卡后状态流转 ---');
console.log('1) 初始 (loot 状态, 1 chest):', r.initialState, 'pending:', r.initialPending);
console.log('2) showChestReward 后: state =', r.stateAfterShow, 'rewards =', r.rewardsAfterShow);
console.log('3) selectReward(0) 后:');
console.log('   state =', r.stateAfterSelect, '(期望: levelup 或 shopping)');
console.log('   pending chests =', r.pendingAfterSelect, '(期望: 0)');
console.log('Errors:', errors);
await browser.close();
