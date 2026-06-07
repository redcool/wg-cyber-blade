# Cyber Blade 项目问题解决记录

> 记录日期: 2026-06-05
> 范围: BGM 不播放 + 攻击前冲效果移除

---

## 一、项目理解

### 1.1 项目概览

- **项目名**: Cyber Blade(赛博土豆)
- **类型**: 浏览器 2D Canvas 俯视角 Roguelite
- **入口**: `index.html`(静态) → `index.bat`(启动 Python HTTP server `localhost:8000`)
- **核心模式**: 角色选择 → 武器选择 → 难度选择 → 自动攻击 + WASD 走位 → 击杀拾金 → 商店构筑 → 循环挑战

### 1.2 目录结构

```
buffPrj1/
├── index.html / index.bat       # 入口 + HTTP server 启动
├── src/
│   ├── engine/                   # 引擎层（与游戏无关的通用框架）
│   │   ├── audio.js              # 音频系统（BGM 列表循环 + SFX 程序化回退）
│   │   ├── engine.js             # 主循环 GameEngine
│   │   ├── data.js               # DataLoader（统一 JSON 加载 + __DATA_BUNDLE__ 离线兜底）
│   │   ├── input.js              # 输入
│   │   ├── renderer.js           # Canvas 渲染
│   │   ├── bullet.js / particle.js / effects.js
│   │   ├── enemy.js / wave.js / boss.js
│   │   ├── formula.js / stats.js # 公式与属性
│   │   └── ...（其余通用系统）
│   ├── cyberblade/               # 游戏层（cyberblade 专用）
│   │   ├── main.js               # startGame / 关卡流转
│   │   ├── player.js             # PlayerSystem（多武器、自动攻击、突刺/横扫）
│   │   ├── ui.js                 # 菜单/商店/HUD
│   │   └── unlock.js             # 解锁追踪
│   ├── data/                     # JSON 数据（CSV 生成 + 手工）
│   │   ├── audio.json            # BGM/SFX 清单
│   │   ├── weapons.json / weaponStats.json
│   │   ├── characters.json / charStats.json
│   │   └── ... data-bundle.js    # 离线打包兜底
│   ├── charsData/                # i18n 字符串
│   └── DEPRECATED/               # 旧代码
├── sounds/                       # 音频文件
│   ├── bgm_1.m4a, bgm_2.m4a      # BGM 2 首
│   └── se_*.m4a / se_*.wav       # SFX（按需）
├── data/                         # gameConfig.json 等运行时配置
├── test/                         # vitest 单元测试
├── tmp/                          # Puppeteer E2E（含 test_bgm.mjs）
├── docs/                         # 文档
└── agent-sprite-forge / aiworkflow / ...
```

### 1.3 关键调用链

```
用户点击 "开始挑战" / "开始战斗"
  └─ UISystem._bindStartButtons (cyberblade/ui.js)
      └─ GameEngine.startGame (cyberblade/main.js:8)
          ├─ PlayerSystem.create / WaveSystem.startNextLevel
          ├─ AudioSystem.init()              ← 创建 AudioContext
          ├─ AudioSystem.stopBGM()           ← 清残留
          └─ AudioSystem.startBGM()          ← 异步启动 BGM
```

```
游戏主循环
  └─ GameEngine._updatePlaying
      └─ PlayerSystem.update
          ├─ _updateMovement           ← WASD 移动
          ├─ _updateAutoAttack         ← 每个武器独立冷却
          ├─ _updateDelayedAttacks     ← 处理 _thrustDashTimer / _sweepPending
          └─ _updateItems
```

---

## 二、BGM 不播放

### 2.1 现象

- HTTP 启动后进入游戏,BGM 应自动播放(`AudioSystem.startBGM()`)
- 实际无声;Playwright 单元测试 8/8 通过(API 层面 OK),浏览器中失败

### 2.2 根因分析

**嫌疑 1:AudioContext 仍 suspended**

- `init()` 创建 ctx 但不主动 resume
- `startBGM()` 中 `await this._ctx.resume()` 依赖"用户手势调用链"
- `startGame` 是从按钮 click 触发的,理论上处于用户手势栈内
- **但** startGame 内调了多个 `await`(`AssetSystem.init` 之类),这些 await 会让浏览器把后续代码判定为"非手势栈" — 这在 Safari/移动端尤其严格

**嫌疑 2:`_playFileBGM` 失败后,程序化回退也被破坏**

```js
// engine/audio.js:986-1011
async _playFileBGM(track) {
    ...
    const response = await fetch(track.file);
    ...
    const buffer = await this._ctx.decodeAudioData(arrayBuffer);
    ...
    if (!this._bgmPlaying || BGM_TRACKS[this._bgmPlaylistIndex] !== track) {
        console.log('[AudioSystem] 解码完成时曲目已变更/已停止，丢弃');
        return;  // ← 直接返回, 没回退!
    }
    ...
} catch (e) {
    if (!this._bgmPlaying) return;
    ...
    this._fallbackToProgrammatic();  // ← 文件级错误才会回退
}
```

- 若 `fetch` + `decode` 都成功(只是 `await` 中途 `_bgmPlaying` 翻 false,例如 `stopBGM` 在切换关卡时触发),会走"丢弃"分支,无声音也无回退
- 但首次进入游戏不应触发 stopBGM,此嫌疑较弱

**嫌疑 3:浏览器 autoplay policy 严格(Safari/移动)**

- Chrome 桌面版对"用户点击后立即创建 + resume"较宽松
- Safari iOS 必须"click handler 内"首次 resume,且不允许任何 await 跨出
- 目前的 `init() → startBGM() → await ctx.resume()` 链路如果跨越 await,会被拒

**嫌疑 4:fetch 路径大小写/编码**

- `sounds/bgm_1.m4a` 文件存在(`Test-Path` True)
- `audio.json` 中 `file: "sounds/bgm_1.m4a"` 与 fetch 路径一致

### 2.3 修复方案(最小改动,KISS)

1. **init() 内同步 resume AudioContext**
   - init() 由 startGame(用户手势链)调用,可直接 `ctx.resume()`(fire-and-forget)
   - 把"resume 时机"前移到 init,避免在 startBGM 内部才 resume
2. **startBGM 内增加 `_bgmPlaying` 守卫的错误回退**
   - 即便 `await` 中途被 stopBGM,也要保证至少有日志/回退
3. **缓存版本号 +1**(`audio.js?v=7.9 → ?v=7.10`),强制浏览器重载

### 2.4 验证清单

- [ ] 打开 `http://localhost:8000/index.html`(通过 `index.bat` 启动)
- [ ] 角色选择 → 武器选择 → 难度选择 → 开始战斗
- [ ] 应能听到 BGM 1 循环
- [ ] 进商店 → 音量降 50%(`AudioSystem._bgmDucked = true`)
- [ ] 出商店 → 音量恢复 100%
- [ ] 完成第一关 → 自动切到 BGM 2(若有)
- [ ] Console 无 `[AudioSystem]` 警告/错误

---

## 三、角色攻击前冲效果移除

### 3.1 现象

- 近战武器(剑/锤/斧/矛等)攻击时,角色会朝目标方向"突刺"一段距离(前冲)
- 玩家在突刺途中无法用 WASD 改变走位(被前冲位移"覆盖"了)
- 骑枪(`tag === 'lance'`)的突刺不前冲,只是长距离判定

### 3.2 根因(代码定位)

**位置 1**:`cyberblade/player.js:870-878` (`_fireMeleeThrust`)

```js
// 突刺冲刺距离（固定值，不随 attackRange 缩放）
const isLance = weaponDef && weaponDef.tag === 'lance';
if (!isLance) {
    p.knockbackX = 0; p.knockbackY = 0;
    const dashStr = Math.min(meleeRange * 1.5, 300);
    p._thrustDashX = Math.cos(angle) * dashStr;
    p._thrustDashY = Math.sin(angle) * dashStr;
    p._thrustDashTimer = 0.15;  // ← 150ms 后冲量
}
```

**位置 2**:`cyberblade/player.js:642-650` (`_fireShock`,电击/连锁)

```js
if (!isLance) {
    p.knockbackX = 0; p.knockbackY = 0;
    const dashStr = range * 4;
    p._thrustDashX = Math.cos(angle) * dashStr;
    p._thrustDashY = Math.sin(angle) * dashStr;
    p._thrustDashTimer = 0.15;
}
```

**执行点**:`_updateDelayedAttacks` (L336-371)

```js
if (p._thrustDashTimer != null) {
    p._thrustDashTimer -= dt;
    if (p._thrustDashTimer <= 0) {
        p.knockbackX += p._thrustDashX || 0;  // ← 加到 knockback
        p.knockbackY += p._thrustDashY || 0;
        ...
    }
}
```

- `_thrustDashX/Y` 在 150ms 延迟后转写到 `knockbackX/Y`
- `_updateMovement` (L224-253) 每帧用 knockback 位移玩家:`p.x += p.knockbackX * dt`
- 这就是"前冲覆盖 WASD 走位"的来源

### 3.3 修复方案(KISS)

- **直接删除**两处 `_thrustDashX/Y` 的写入 + `_thrustDashTimer` 触发逻辑
- `_updateDelayedAttacks` 中保留 `_thrustDashTimer` 守卫段(无害;保险起见一并删除)
- `_fireMeleeSweep` 中**没有**前冲设置,不需要改
- 骑枪本来就不前冲,无需改

### 3.4 验证清单

- [ ] 近战(剑)攻击:角色不动,只有挥砍动画 + 命中判定
- [ ] 近战(枪/矛)突刺:角色不动,只有突刺动画 + 命中判定
- [ ] WASD 走位期间攻击:攻击与走位完全独立,可同时进行
- [ ] 视觉特效(粒子、拖尾)正常

---

## 四、相关文件清单

| 路径 | 用途 | 状态 |
|------|------|------|
| `src/engine/audio.js` | BGM 引擎 | 待修(7.9 → 7.10) |
| `src/cyberblade/player.js` | 玩家/武器/前冲 | 待修 |
| `index.html` | 脚本版本号 | 需同步更新 |
| `src/cyberblade/main.js` | startGame 入口 | 不动 |
| `src/data/audio.json` | BGM/SFX 配置 | 不动 |
| `sounds/bgm_1.m4a / bgm_2.m4a` | BGM 素材 | 不动 |
| `tmp/test_bgm.mjs` | Puppeteer E2E | 不动(可加新 case) |
