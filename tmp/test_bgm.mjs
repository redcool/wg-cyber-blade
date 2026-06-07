// 验证 BGM: 列表循环 + duck 商店场景
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

  // 1) AudioContext 初始化
  log.push('=== 1) init AudioSystem ===');
  await page.evaluate(() => AudioSystem.init());
  // 等待异步 _loadAudioConfig 完成
  for (let i = 0; i < 30; i++) {
    const loaded = await page.evaluate(() => AudioSystem._tracksLoaded);
    if (loaded) break;
    await page.waitForTimeout(200);
  }
  const initRes = await page.evaluate(() => ({
    hasCtx: !!AudioSystem._ctx,
    bgmVolume: AudioSystem._bgmVolume,
    tracks: AudioSystem.getAvailableTracks(),
  }));
  log.push('  ' + JSON.stringify(initRes));
  if (!initRes.hasCtx) throw new Error('AudioContext not created');
  if (initRes.tracks.length !== 2) throw new Error(`expected 2 tracks, got ${initRes.tracks.length}`);

  // 2) startBGM
  log.push('=== 2) startBGM ===');
  await page.evaluate(() => AudioSystem.startBGM());
  await page.waitForTimeout(2500); // 等待解码 + 播放
  const playing = await page.evaluate(() => ({
    playing: AudioSystem._bgmPlaying,
    paused: AudioSystem._bgmPaused,
    ducked: AudioSystem._bgmDucked,
    currentTrack: AudioSystem._currentTrackId,
    gainVal: AudioSystem._bgmGain ? AudioSystem._bgmGain.gain.value : null,
    duckMult: AudioSystem._bgmDuckMultiplier,
  }));
  log.push('  ' + JSON.stringify(playing));
  if (!playing.playing) throw new Error('BGM not playing');
  if (playing.paused) throw new Error('BGM should not be paused');
  if (Math.abs(playing.gainVal - 0.8) > 0.05) throw new Error(`expected gain 0.8, got ${playing.gainVal}`);

  // 3) duckBGM(0.5)
  log.push('=== 3) duckBGM(0.5) ===');
  await page.evaluate(() => AudioSystem.duckBGM(0.5));
  await page.waitForTimeout(500); // 等待 ramp
  const ducked = await page.evaluate(() => ({
    ducked: AudioSystem._bgmDucked,
    gainVal: AudioSystem._bgmGain.gain.value,
    duckMult: AudioSystem._bgmDuckMultiplier,
    stillPlaying: AudioSystem._bgmPlaying,
    stillHasSource: !!AudioSystem._bgmSourceNode,
  }));
  log.push('  ' + JSON.stringify(ducked));
  if (!ducked.ducked) throw new Error('not ducked');
  if (Math.abs(ducked.gainVal - 0.4) > 0.05) throw new Error(`expected gain 0.4 (0.8*0.5), got ${ducked.gainVal}`);
  if (!ducked.stillPlaying) throw new Error('BGM should still be playing');
  if (!ducked.stillHasSource) throw new Error('BGM source should still exist (not stopped)');

  // 4) unduckBGM
  log.push('=== 4) unduckBGM ===');
  await page.evaluate(() => AudioSystem.unduckBGM());
  await page.waitForTimeout(500);
  const unducked = await page.evaluate(() => ({
    ducked: AudioSystem._bgmDucked,
    gainVal: AudioSystem._bgmGain.gain.value,
  }));
  log.push('  ' + JSON.stringify(unducked));
  if (unducked.ducked) throw new Error('still ducked');
  if (Math.abs(unducked.gainVal - 0.8) > 0.05) throw new Error(`expected gain 0.8, got ${unducked.gainVal}`);

  // 5) nextBGM (切歌)
  log.push('=== 5) nextBGM ===');
  await page.evaluate(() => AudioSystem.nextBGM());
  await page.waitForTimeout(2000); // 等待新曲目解码
  const nextState = await page.evaluate(() => ({
    currentTrack: AudioSystem._currentTrackId,
    playlistIndex: AudioSystem._bgmPlaylistIndex,
    stillPlaying: AudioSystem._bgmPlaying,
  }));
  log.push('  ' + JSON.stringify(nextState));
  if (nextState.playlistIndex !== 1) throw new Error(`expected index 1, got ${nextState.playlistIndex}`);
  if (nextState.currentTrack !== initRes.tracks[1].id) throw new Error(`expected track ${initRes.tracks[1].id}, got ${nextState.currentTrack}`);

  // 6) 模拟到 end 自动切下一首 (伪造 ended)
  log.push('=== 6) auto next on ended ===');
  await page.evaluate(() => {
    // 切回第 0 首
    AudioSystem._switchToTrack(0);
  });
  await page.waitForTimeout(2000);
  const before = await page.evaluate(() => AudioSystem._currentTrackId);
  log.push('  before end: ' + before);
  // 触发 onended 模拟 (短延时强制结束)
  await page.evaluate(() => {
    // 直接调用 onended 模拟
    if (AudioSystem._bgmSourceNode && AudioSystem._bgmSourceNode.onended) {
      // 构造一个事件对象
      const fakeEvent = { type: 'ended', target: AudioSystem._bgmSourceNode };
      AudioSystem._bgmSourceNode.onended(fakeEvent);
    }
  });
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => AudioSystem._currentTrackId);
  log.push('  after onended: ' + after);
  if (after === before) throw new Error('auto-next failed: track did not change');

  // 7) pauseBGM 真的停止
  log.push('=== 7) pauseBGM 真正停止 ===');
  await page.evaluate(() => AudioSystem.pauseBGM());
  await page.waitForTimeout(300);
  const stopped = await page.evaluate(() => ({
    playing: AudioSystem._bgmPlaying,
    paused: AudioSystem._bgmPaused,
    hasSource: !!AudioSystem._bgmSourceNode,
  }));
  log.push('  ' + JSON.stringify(stopped));
  if (stopped.playing) throw new Error('pauseBGM should set playing=false');
  if (!stopped.paused) throw new Error('pauseBGM should set paused=true');
  if (stopped.hasSource) throw new Error('pauseBGM should disconnect source');

  // 8) resumeBGM 重启
  log.push('=== 8) resumeBGM 重启 ===');
  await page.evaluate(() => AudioSystem.resumeBGM());
  await page.waitForTimeout(2000);
  const resumed = await page.evaluate(() => ({
    playing: AudioSystem._bgmPlaying,
    paused: AudioSystem._bgmPaused,
    hasSource: !!AudioSystem._bgmSourceNode,
    currentTrack: AudioSystem._currentTrackId,
  }));
  log.push('  ' + JSON.stringify(resumed));
  if (!resumed.playing) throw new Error('resumeBGM should set playing=true');
  if (resumed.paused) throw new Error('resumeBGM should set paused=false');

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
