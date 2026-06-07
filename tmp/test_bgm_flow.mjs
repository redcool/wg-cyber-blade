// 验证 BGM 全流程: 进入游戏 → 升级/宝箱/商店出现时不停止 BGM
import { chromium } from 'playwright';

const URL = 'http://localhost:8000/index.html';
const log = [];
const errors = [];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on('console', m => {
  const t = m.text();
  if (m.type() === 'error') errors.push(`[console] ${t}`);
  if (t.includes('[AudioSystem]')) log.push(`  ${t}`);
});
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));

try {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  log.push('=== 1) 模拟 startGame (进入第一关) ===');
  // 直接调 startGame 模拟用户点击"开始战斗"按钮
  await page.evaluate(() => {
    AudioSystem.init();
    AudioSystem.stopBGM();
    AudioSystem.startBGM();
  });
  await page.waitForTimeout(2500);
  const playing = await page.evaluate(() => ({
    playing: AudioSystem._bgmPlaying,
    paused: AudioSystem._bgmPaused,
    state: AudioSystem._ctx ? AudioSystem._ctx.state : null,
    currentTrack: AudioSystem._currentTrackId,
    gain: AudioSystem._bgmGain ? AudioSystem._bgmGain.gain.value : null,
  }));
  log.push('  ' + JSON.stringify(playing));
  if (!playing.playing) throw new Error('BGM should be playing after startGame');
  if (playing.state !== 'running') throw new Error(`AudioContext state: ${playing.state}, expected running`);
  if (Math.abs(playing.gain - 0.8) > 0.05) throw new Error(`gain=${playing.gain}, expected 0.8`);

  log.push('=== 2) 触发 duckBGM(0.5) 模拟升级/宝箱界面 ===');
  await page.evaluate(() => AudioSystem.duckBGM(0.5));
  await page.waitForTimeout(500);
  const ducked = await page.evaluate(() => ({
    playing: AudioSystem._bgmPlaying,
    paused: AudioSystem._bgmPaused,
    ducked: AudioSystem._bgmDucked,
    gain: AudioSystem._bgmGain.gain.value,
  }));
  log.push('  ' + JSON.stringify(ducked));
  if (!ducked.playing) throw new Error('BGM still playing flag lost on duck');
  if (ducked.paused) throw new Error('BGM should NOT be paused (paused = stopped)');
  if (!ducked.ducked) throw new Error('duck flag missing');
  if (Math.abs(ducked.gain - 0.4) > 0.05) throw new Error(`gain=${ducked.gain}, expected 0.4`);

  log.push('=== 3) unduckBGM 模拟关闭升级/商店 ===');
  await page.evaluate(() => AudioSystem.unduckBGM());
  await page.waitForTimeout(500);
  const unducked = await page.evaluate(() => ({
    playing: AudioSystem._bgmPlaying,
    paused: AudioSystem._bgmPaused,
    ducked: AudioSystem._bgmDucked,
    gain: AudioSystem._bgmGain.gain.value,
  }));
  log.push('  ' + JSON.stringify(unducked));
  if (unducked.paused) throw new Error('BGM should not be paused after unduck');
  if (unducked.ducked) throw new Error('duck flag should be cleared');
  if (Math.abs(unducked.gain - 0.8) > 0.05) throw new Error(`gain=${unducked.gain}, expected 0.8`);

  log.push('=== 4) 多次 duck/unduck 仍不破坏播放 ===');
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => AudioSystem.duckBGM(0.5));
    await page.waitForTimeout(200);
    await page.evaluate(() => AudioSystem.unduckBGM());
    await page.waitForTimeout(200);
  }
  const stillOk = await page.evaluate(() => ({
    playing: AudioSystem._bgmPlaying,
    paused: AudioSystem._bgmPaused,
    hasSource: !!AudioSystem._bgmSourceNode,
  }));
  log.push('  ' + JSON.stringify(stillOk));
  if (!stillOk.playing || stillOk.paused || !stillOk.hasSource) throw new Error('BGM broken after repeated duck/unduck');

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
