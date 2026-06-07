// ============================================================
// engine/audio.js - 音频系统（Web Audio API 程序化音效 + 文件 BGM）
// ============================================================

/**
 * BGM 曲目列表（从 data/audio.json 动态加载，参见 _loadAudioConfig）
 * init() 会预填充默认曲目，异步加载 audio.json 后会替换
 */
const BGM_TRACKS = [
    // 默认曲目（立即可用，异步加载 audio.json 后会替换）
    { id: 'combat1', file: 'sounds/bgm_1.m4a', name: '战斗主题1' }
];

const AudioSystem = {
    _ctx: null,
    _bgmGain: null,
    _sfxGain: null,
    _bgmPlaying: false,
    _bgmPaused: false,
    _bgmNodes: [],
    _bgmTimer: null,

    // ---- 音量配置（默认值，会被 gameConfig.json 覆盖） ----
    _bgmVolume: 0.8,
    _sfxVolume: 0.5,

    // ---- BGM duck（商店场景的音量缩放） ----
    _bgmDucked: false,
    _bgmDuckMultiplier: 1.0,

    // ---- BGM 列表循环 ----
    _bgmPlaylistIndex: 0,

    // ---- BGM 文件播放 ----
    _bgmBuffer: null,      // 当前解码后的 AudioBuffer
    _bgmSourceNode: null,  // 当前 BufferSourceNode
    _currentTrackId: null, // 当前曲目 ID
    _tracksLoaded: false,  // 是否已加载清单

    // ---- 数据驱动配置 ----
    _sfxTypeMap: {},       // { type: seId } 从 audio.json sfx_type 行构建
    _sfxFileMap: {},       // { seId: {file, categoryTag} } 从 audio.json sfx_file 行构建

    // ---- SFX 文件音效 ----
    _sfxBuffers: {},       // { seId: AudioBuffer }
    _sfxTableLoaded: false, // 音效表是否已加载

    /** 初始化 AudioContext（需用户交互后才能创建） */
    init() {
        if (this._ctx) {
            // 重复 init 时也尝试 resume,覆盖"自动挂起"场景（如切窗口/切 tab 后回来）
            if (this._ctx.state === 'suspended') {
                this._ctx.resume().catch(() => {});
            }
            return;
        }
        try {
            this._ctx = new (window.AudioContext || window.webkitAudioContext)();

            this._bgmGain = this._ctx.createGain();
            this._bgmGain.gain.value = this._bgmVolume;
            this._bgmGain.connect(this._ctx.destination);

            this._sfxGain = this._ctx.createGain();
            this._sfxGain.gain.value = this._sfxVolume;
            this._sfxGain.connect(this._ctx.destination);

            // 关键：创建后立即尝试 resume,不要等 startBGM 才 resume
            // 浏览器(Safari/iOS 最严格)要求 ctx.resume() 必须在用户手势栈内调用,
            // 否则即便后续处于手势中,音频仍处于 suspended 不可听。
            // init() 由 startGame(按钮 click handler)同步触发,处于手势栈内。
            if (this._ctx.state === 'suspended') {
                this._ctx.resume().catch(() => {});
            }

            // 从配置文件加载音量设置
            this._loadVolumeConfig();

            // 统一加载音频配置（BGM 清单 + SFX type→seId 映射 + SFX 文件预缓冲）
            this._loadAudioConfig();
        } catch (e) {
            console.warn('[AudioSystem] Web Audio API 不可用:', e);
        }
    },

    /** 从 data/gameConfig.json 加载音量设置 */
    async _loadVolumeConfig() {
        try {
            const resp = await fetch('data/gameConfig.json');
            if (resp.ok) {
                const cfg = await resp.json();
                if (cfg && cfg.Audio) {
                    if (typeof cfg.Audio.bgmVolume === 'number') {
                        this._bgmVolume = Math.max(0, Math.min(1, cfg.Audio.bgmVolume));
                    }
                    if (typeof cfg.Audio.sfxVolume === 'number') {
                        this._sfxVolume = Math.max(0, Math.min(1, cfg.Audio.sfxVolume));
                    }
                    // 如果 GainNode 已创建，立即应用（走 _applyBGMVolume 以保留 duck）
                    if (this._bgmGain) this._applyBGMVolume();
                    if (this._sfxGain) this._sfxGain.gain.value = this._sfxVolume;
                    console.log('[AudioSystem] 已加载音量配置: BGM', this._bgmVolume, 'SFX', this._sfxVolume);
                }
            }
        } catch (e) {
            console.log('[AudioSystem] 无法加载 gameConfig.json，使用默认音量');
        }
    },

    /** 设置 BGM 音量（0~1），运行时生效 */
    setBGMVolume(vol) {
        this._bgmVolume = Math.max(0, Math.min(1, vol));
        if (this._bgmGain) this._applyBGMVolume();
    },

    /** 设置 SFX 音量（0~1），运行时生效 */
    setSFXVolume(vol) {
        this._sfxVolume = Math.max(0, Math.min(1, vol));
        if (this._sfxGain) this._sfxGain.gain.value = this._sfxVolume;
    },

    /**
     * 从 audio.json 统一加载音频配置
     * 包括: BGM 曲目清单、SFX type→seId 映射、SFX 文件预缓冲
     */
    async _loadAudioConfig() {
        try {
            let data;
            if (typeof DataLoader !== 'undefined') {
                data = await DataLoader.load('audio');
            }
            if (!data || data.length === 0) {
                const resp = await fetch('src/data/audio.json');
                if (resp.ok) data = await resp.json();
            }
            if (!data || data.length === 0) return;

            // 清空旧数据
            BGM_TRACKS.length = 0;
            this._sfxTypeMap = {};
            this._sfxFileMap = {};

            // 按 category 分类处理
            for (const entry of data) {
                if (entry.category === 'bgm') {
                    BGM_TRACKS.push({ id: entry.id, file: entry.file, name: entry.name });
                } else if (entry.category === 'sfx_type') {
                    this._sfxTypeMap[entry.type] = entry.id;
                } else if (entry.category === 'sfx_file') {
                    this._sfxFileMap[entry.id] = { file: entry.file, category: entry.categoryTag };
                }
            }

            this._tracksLoaded = true;
            this._sfxTableLoaded = true;
            console.log('[AudioSystem] 音频配置已加载:',
                BGM_TRACKS.length, 'BGM,',
                Object.keys(this._sfxTypeMap).length, 'SFX 类型,',
                Object.keys(this._sfxFileMap).length, 'SFX 文件');

            // 预缓冲 SFX 文件
            for (const [seId, info] of Object.entries(this._sfxFileMap)) {
                if (info.file) this._preloadSFX(seId, info.file);
            }
        } catch (e) {
            console.warn('[AudioSystem] 无法加载音频配置:', e.message);
        }
    },

    /** 确保 AudioContext 已创建并恢复（同步检查，fire-and-forget resume） */
    _ensure() {
        if (!this._ctx) this.init();
        if (this._ctx && this._ctx.state === 'suspended') {
            this._ctx.resume();
        }
        return !!this._ctx;
    },

    // ============================================================
    // 音效播放
    // ============================================================
    /** play type → 音效表 seId 映射（从 audio.json 数据驱动） */
    _getSEId(type) {
        return this._sfxTypeMap[type] || null;
    },

    /**
     * 播放音效
     * 优先使用预缓冲的 wav 文件，无可用文件时回退到程序化生成
     */
    play(type) {
        if (!this._ensure()) return;

        // 尝试播放 wav 文件
        const seId = this._getSEId(type);
        if (seId && this._sfxBuffers[seId]) {
            // 对于非 combat 类音效（如 pickup），若有 wav 则直接使用
            this._playBuffer(seId);
            return;
        }

        // 回退到程序化音效
        switch (type) {
            case 'shoot':     this._shoot(); break;
            case 'pickup':    this._pickup(); break;
            case 'coin':      this._coin(); break;
            case 'explosion': this._explosion(); break;
            case 'levelup':   this._levelup(); break;
            case 'enemy_hit': this._enemyHit(); break;
            case 'enemy_die': this._enemyDie(); break;
            case 'hurt':      this._hurt(); break;
            case 'melee_slash':  this._meleeSlash(); break;
            case 'melee_heavy':  this._meleeHeavy(); break;
            case 'cannon':       this._cannon(); break;
            case 'cannon_shot':  this._cannonShot(); break;
            // ---- 新增武器音效回退 ----
            case 'gunshot':    this._gunshot(); break;
            case 'pistol':     this._pistol(); break;
            case 'heavy_gun':  this._heavyGun(); break;
            case 'arrow':      this._arrow(); break;
            case 'fire':       this._fire(); break;
            case 'ice':        this._ice(); break;
            case 'lightning':  this._lightning(); break;
            case 'magic':      this._magic(); break;
            case 'spear':      this._spear(); break;
            case 'axe':        this._axeSlash(); break;
            // 激光回退到射击音效
            case 'laser':      this._shoot(); break;
            default: break;
        }
    },

    // ---- 射击音效 ----
    _shoot() {
        const ctx = this._ctx;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(800 + Math.random() * 200, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);
        gain.gain.setValueAtTime(this._sfxGain.gain.value * 0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 0.08);
    },

    // ---- 命中敌人音效 ----
    _enemyHit() {
        const ctx = this._ctx;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400 + Math.random() * 100, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.06);
        gain.gain.setValueAtTime(this._sfxGain.gain.value * 0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.connect(gain);
        gain.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 0.06);
    },

    // ---- 敌人死亡音效 ----
    _enemyDie() {
        const ctx = this._ctx;
        const now = ctx.currentTime;
        const bufferSize = ctx.sampleRate * 0.15;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / bufferSize);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(this._sfxGain.gain.value * 0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.exponentialRampToValueAtTime(100, now + 0.15);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this._sfxGain);
        noise.start(now);
        noise.stop(now + 0.15);
    },

    // ---- 玩家受伤 ----
    _hurt() {
        const ctx = this._ctx;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);
        gain.gain.setValueAtTime(this._sfxGain.gain.value * 0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 0.15);
    },

    // ---- 拾取掉落物 ----
    _pickup() {
        const ctx = this._ctx;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.1);
        gain.gain.setValueAtTime(this._sfxGain.gain.value * 0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 0.15);
    },

    // ---- 金币收集 ----
    _coin() {
        const ctx = this._ctx;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(1800, now + 0.08);
        gain.gain.setValueAtTime(this._sfxGain.gain.value * 0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 0.1);
    },

    // ---- 爆炸 ----
    _explosion() {
        const ctx = this._ctx;
        const now = ctx.currentTime;
        const bufferSize = ctx.sampleRate * 0.3;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / bufferSize);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(this._sfxGain.gain.value * 1.0, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, now);
        filter.frequency.exponentialRampToValueAtTime(50, now + 0.3);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this._sfxGain);
        noise.start(now);
        noise.stop(now + 0.3);

        const osc = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(60, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.3);
        g2.gain.setValueAtTime(this._sfxGain.gain.value * 0.6, now);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(g2);
        g2.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 0.3);
    },

    // ---- 近战轻击(横扫) ----
    _meleeSlash() {
        const ctx = this._ctx;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.1);
        gain.gain.setValueAtTime(this._sfxGain.gain.value * 0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 0.1);

        // 加一点噪声尾音
        const bufSize = ctx.sampleRate * 0.05;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
            d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / bufSize);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(this._sfxGain.gain.value * 0.3, now + 0.08);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        noise.connect(g2);
        g2.connect(this._sfxGain);
        noise.start(now + 0.08);
        noise.stop(now + 0.12);
    },

    // ---- 近战重击(突刺) ----
    _meleeHeavy() {
        const ctx = this._ctx;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.18);
        gain.gain.setValueAtTime(this._sfxGain.gain.value * 0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 0.18);

        // 重击低频噪声
        const bufSize = ctx.sampleRate * 0.12;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
            d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / bufSize);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(this._sfxGain.gain.value * 0.5, now + 0.05);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, now);
        filter.frequency.exponentialRampToValueAtTime(60, now + 0.17);
        noise.connect(filter);
        filter.connect(g2);
        g2.connect(this._sfxGain);
        noise.start(now + 0.05);
        noise.stop(now + 0.17);
    },

    // ---- 火炮 ----
    _cannon() {
        const ctx = this._ctx;
        const now = ctx.currentTime;
        const bufferSize = ctx.sampleRate * 0.25;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / bufferSize);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(this._sfxGain.gain.value * 0.9, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, now);
        filter.frequency.exponentialRampToValueAtTime(60, now + 0.25);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this._sfxGain);
        noise.start(now);
        noise.stop(now + 0.25);

        const osc = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.25);
        g2.gain.setValueAtTime(this._sfxGain.gain.value * 0.5, now);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(g2);
        g2.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 0.25);
    },

    // ---- 火炮射击 ----
    _cannonShot() {
        const ctx = this._ctx;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.06);
        gain.gain.setValueAtTime(this._sfxGain.gain.value * 0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.connect(gain);
        gain.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 0.06);
    },

    // ---- 标准枪声(步枪/狙击) ----
    _gunshot() {
        const ctx = this._ctx;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);
        gain.gain.setValueAtTime(this._sfxGain.gain.value * 0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 0.1);

        // 短噪声尾音
        const bufSize = ctx.sampleRate * 0.04;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / bufSize);
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(this._sfxGain.gain.value * 0.3, now);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        noise.connect(g2);
        g2.connect(this._sfxGain);
        noise.start(now);
        noise.stop(now + 0.04);
    },

    // ---- 手枪射击 ----
    _pistol() {
        const ctx = this._ctx;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(900, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.06);
        gain.gain.setValueAtTime(this._sfxGain.gain.value * 0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.connect(gain);
        gain.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 0.06);
    },

    // ---- 重型枪声(霰弹/加特林) ----
    _heavyGun() {
        const ctx = this._ctx;
        const now = ctx.currentTime;
        // 低频轰鸣
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);
        gain.gain.setValueAtTime(this._sfxGain.gain.value * 0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 0.12);

        // 噪声层
        const bufSize = ctx.sampleRate * 0.1;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / bufSize);
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(this._sfxGain.gain.value * 0.5, now);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        noise.connect(g2);
        g2.connect(this._sfxGain);
        noise.start(now);
        noise.stop(now + 0.1);
    },

    // ---- 弓箭 ----
    _arrow() {
        const ctx = this._ctx;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(1200, now + 0.08);
        gain.gain.setValueAtTime(this._sfxGain.gain.value * 0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 0.15);

        // 空气嘶声
        const bufSize = ctx.sampleRate * 0.06;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / bufSize);
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(this._sfxGain.gain.value * 0.2, now + 0.05);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 2000;
        noise.connect(filter);
        filter.connect(g2);
        g2.connect(this._sfxGain);
        noise.start(now + 0.05);
        noise.stop(now + 0.11);
    },

    // ---- 火焰喷射 ----
    _fire() {
        const ctx = this._ctx;
        const now = ctx.currentTime;
        // 持续火焰噪声
        const bufSize = ctx.sampleRate * 0.2;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
            d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / bufSize);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(this._sfxGain.gain.value * 0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 600;
        filter.Q.value = 0.5;
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this._sfxGain);
        noise.start(now);
        noise.stop(now + 0.2);

        // 低频脉动
        const osc = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.2);
        g2.gain.setValueAtTime(this._sfxGain.gain.value * 0.4, now);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(g2);
        g2.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 0.2);
    },

    // ---- 冰霜魔法 ----
    _ice() {
        const ctx = this._ctx;
        const now = ctx.currentTime;
        // 冰晶般的高频声响
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1500, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.15);
        gain.gain.setValueAtTime(this._sfxGain.gain.value * 0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 0.15);

        // 碎裂噪声
        const bufSize = ctx.sampleRate * 0.1;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const dd = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) dd[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / bufSize);
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(this._sfxGain.gain.value * 0.3, now + 0.05);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 3000;
        noise.connect(filter);
        filter.connect(g2);
        g2.connect(this._sfxGain);
        noise.start(now + 0.05);
        noise.stop(now + 0.1);
    },

    // ---- 闪电/连锁 ----
    _lightning() {
        const ctx = this._ctx;
        const now = ctx.currentTime;
        // 噼啪噪声
        const bufSize = ctx.sampleRate * 0.12;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / bufSize);
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(this._sfxGain.gain.value * 0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 2000;
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this._sfxGain);
        noise.start(now);
        noise.stop(now + 0.12);

        // 低频震尾
        const osc = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(100, now + 0.05);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.12);
        g2.gain.setValueAtTime(0, now);
        g2.gain.linearRampToValueAtTime(this._sfxGain.gain.value * 0.4, now + 0.06);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(g2);
        g2.connect(this._sfxGain);
        osc.start(now + 0.05);
        osc.stop(now + 0.15);
    },

    // ---- 魔法发射(追踪弹) ----
    _magic() {
        const ctx = this._ctx;
        const now = ctx.currentTime;
        // 上飘音高
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(1800, now + 0.1);
        gain.gain.setValueAtTime(this._sfxGain.gain.value * 0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 0.18);

        // 闪烁高频
        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(2200, now);
        osc2.frequency.setValueAtTime(1800, now + 0.05);
        osc2.frequency.setValueAtTime(2400, now + 0.1);
        g2.gain.setValueAtTime(this._sfxGain.gain.value * 0.2, now);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc2.connect(g2);
        g2.connect(this._sfxGain);
        osc2.start(now);
        osc2.stop(now + 0.12);
    },

    // ---- 长枪突刺 ----
    _spear() {
        const ctx = this._ctx;
        const now = ctx.currentTime;
        // 高音冲刺声
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.linearRampToValueAtTime(1800, now + 0.05);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.12);
        gain.gain.setValueAtTime(this._sfxGain.gain.value * 0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 0.12);

        // 尖锐瞬态
        const bufSize = ctx.sampleRate * 0.03;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / bufSize);
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(this._sfxGain.gain.value * 0.4, now);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
        noise.connect(g2);
        g2.connect(this._sfxGain);
        noise.start(now);
        noise.stop(now + 0.03);
    },

    // ---- 斧头挥砍 ----
    _axeSlash() {
        const ctx = this._ctx;
        const now = ctx.currentTime;
        // 沉重砍劈
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(350, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.14);
        gain.gain.setValueAtTime(this._sfxGain.gain.value * 0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        gain.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 0.14);

        // 砍劈噪声
        const bufSize = ctx.sampleRate * 0.06;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / bufSize);
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(this._sfxGain.gain.value * 0.5, now + 0.03);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        noise.connect(g2);
        g2.connect(this._sfxGain);
        noise.start(now + 0.03);
        noise.stop(now + 0.1);
    },

    // ---- 升级 ----
    _levelup() {
        const ctx = this._ctx;
        const now = ctx.currentTime;
        const notes = [523, 659, 784, 1047];
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            const t = now + i * 0.08;
            osc.frequency.setValueAtTime(freq, t);
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(this._sfxGain.gain.value * 0.4, t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
            osc.connect(gain);
            gain.connect(this._sfxGain);
            osc.start(t);
            osc.stop(t + 0.2);
        });
    },

    // ============================================================
    // 背景音乐：从 data/audio.json 动态加载曲目列表
    // 设计：单首 source.loop=true 内部循环 + 监听 ended 切换到下一首
    // ============================================================

    /**
     * 播放背景音乐
     * - BGM_TRACKS 长度 = 1: 单曲循环
     * - BGM_TRACKS 长度 ≥ 2: 列表循环（每首内部单曲循环，播完切下一首）
     * @param {string} [trackId] - 起始曲目 ID，默认第一首
     */
    async startBGM(trackId) {
        if (!this._ensure()) return;
        if (this._bgmPlaying) return;

        if (this._ctx && this._ctx.state === 'suspended') {
            await this._ctx.resume();
        }

        // 确定起始曲目
        const startIdx = trackId
            ? Math.max(0, BGM_TRACKS.findIndex(t => t.id === trackId))
            : 0;
        this._bgmPlaylistIndex = startIdx >= 0 ? startIdx : 0;
        this._bgmPlaying = true;
        this._bgmPaused = false;
        this._bgmDucked = false;
        this._bgmDuckMultiplier = 1.0;  // 1.0 = 满音量
        this._bgmCurrentEndHandler = null;

        const track = BGM_TRACKS[this._bgmPlaylistIndex];
        if (!track) {
            this._fallbackToProgrammatic();
            return;
        }
        this._currentTrackId = track.id;
        await this._playFileBGM(track);
    },

    /**
     * 静音但不停止（用于商店等"仍在播放但降低音量"场景）
     * 通过 GainNode 平滑过渡到 50% 音量，停止时再恢复
     * @param {number} multiplier - 0~1 缩放系数（1.0=满音量，0.5=50%）
     */
    duckBGM(multiplier) {
        if (!this._bgmPlaying) return;
        const m = (typeof multiplier === 'number') ? Math.max(0, Math.min(1, multiplier)) : 0.5;
        this._bgmDucked = true;
        this._bgmDuckMultiplier = m;
        this._applyBGMVolume();
    },

    /** 恢复 duck 之前的音量 */
    unduckBGM() {
        if (!this._bgmDucked) return;
        this._bgmDucked = false;
        this._bgmDuckMultiplier = 1.0;
        this._applyBGMVolume();
    },

    /**
     * 把 BGM 音量应用到 GainNode（含 duck 系数）
     * 用 linearRampToValueAtTime 做平滑过渡（避免咔哒声）
     */
    _applyBGMVolume() {
        if (!this._bgmGain || !this._ctx) return;
        const target = this._bgmVolume * this._bgmDuckMultiplier;
        const now = this._ctx.currentTime;
        try {
            this._bgmGain.gain.cancelScheduledValues(now);
            this._bgmGain.gain.setValueAtTime(this._bgmGain.gain.value, now);
            this._bgmGain.gain.linearRampToValueAtTime(target, now + 0.25);
        } catch (e) {
            this._bgmGain.gain.value = target;
        }
    },

    /**
     * 完整停止 BGM（释放所有节点，清状态）
     * 用于退出游戏、关卡切换等"真的不要了"场景
     */
    pauseBGM() {
        if (!this._bgmPlaying) return;
        // 真正停止节点（与 duckBGM 不同）
        if (this._bgmSourceNode) {
            try { this._bgmSourceNode.onended = null; this._bgmSourceNode.stop(); this._bgmSourceNode.disconnect(); } catch(e) {}
            this._bgmSourceNode = null;
        }
        if (this._bgmNodes.length > 0) {
            for (const n of this._bgmNodes) {
                try { n.stop(); n.disconnect(); } catch(e) {}
            }
            this._bgmNodes = [];
        }
        if (this._bgmTimer) {
            clearTimeout(this._bgmTimer);
            this._bgmTimer = null;
        }
        this._bgmPaused = true;
        this._bgmPlaying = false;
    },

    /**
     * 恢复 BGM（从暂停/duck 状态恢复）
     * - 暂停过：重新启动当前曲目
     * - 仅 duck：恢复音量，不重启（保持当前播放位置）
     */
    resumeBGM() {
        if (this._bgmDucked) this.unduckBGM();
        if (!this._bgmPaused) return;
        this._bgmPaused = false;
        // 重新播放当前曲目
        this.startBGM(this._currentTrackId);
    },

    /** 播放下一个曲目（手动切歌） */
    nextBGM() {
        if (BGM_TRACKS.length <= 1) return;
        const nextIdx = (this._bgmPlaylistIndex + 1) % BGM_TRACKS.length;
        this._switchToTrack(nextIdx);
    },

    /** 内部：切到指定曲目（停止当前，启动下一首） */
    _switchToTrack(idx) {
        if (idx < 0 || idx >= BGM_TRACKS.length) return;
        this._bgmPlaylistIndex = idx;
        const track = BGM_TRACKS[idx];
        this._currentTrackId = track.id;
        // 停当前节点（保留 _bgmPlaying = true 让 _playFileBGM 能继续）
        if (this._bgmSourceNode) {
            try { this._bgmSourceNode.onended = null; this._bgmSourceNode.stop(); this._bgmSourceNode.disconnect(); } catch(e) {}
            this._bgmSourceNode = null;
        }
        this._bgmBuffer = null;
        this._playFileBGM(track);
    },

    /** 尝试播放文件 BGM（使用 fetch + decodeAudioData） */
    async _playFileBGM(track) {
        try {
            console.log('[AudioSystem] 加载 BGM 文件:', track.file);

            const response = await fetch(track.file);
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            const arrayBuffer = await response.arrayBuffer();

            const buffer = await this._ctx.decodeAudioData(arrayBuffer);
            console.log('[AudioSystem] BGM 解码成功:', track.file, `(${buffer.duration.toFixed(1)}s)`);

            // 异步完成期间用户可能已经切歌或停止，检查当前索引
            // 注:比较 id 而非对象引用 — _loadAudioConfig 异步完成时会重建 BGM_TRACKS(对象引用变化)
            const currentTrack = BGM_TRACKS[this._bgmPlaylistIndex];
            if (!this._bgmPlaying || !currentTrack || currentTrack.id !== track.id) {
                console.log('[AudioSystem] 解码完成时曲目已变更/已停止，丢弃');
                return;
            }
            this._bgmBuffer = buffer;
            this._scheduleFileBGM();
        } catch (e) {
            if (!this._bgmPlaying) return;
            console.warn('[AudioSystem] BGM 文件加载/解码失败:', e.message);
            this._bgmBuffer = null;
            this._fallbackToProgrammatic();
        }
    },

    /**
     * 调度文件 BGM 播放
     * - 单首时：source.loop = true 无限循环
     * - 多首时：单次播放 + 监听 ended 自动切下一首
     */
    _scheduleFileBGM() {
        if (!this._bgmPlaying || !this._ctx || !this._bgmBuffer) return;

        const source = this._ctx.createBufferSource();
        source.buffer = this._bgmBuffer;

        if (BGM_TRACKS.length > 1) {
            // 列表循环：单次播放，播完切下一首
            source.loop = false;
            const myIdx = this._bgmPlaylistIndex;
            source.onended = () => {
                // 保险：检查是否还是当前曲目、是否还在播放
                if (!this._bgmPlaying) return;
                if (this._bgmPlaylistIndex !== myIdx) return;  // 已被切换
                if (this._bgmPaused) return;
                if (this._bgmSourceNode !== source) return;     // 已被替换
                const nextIdx = (myIdx + 1) % BGM_TRACKS.length;
                console.log('[AudioSystem] 曲目结束，切换到下一首:', BGM_TRACKS[nextIdx].id);
                this._switchToTrack(nextIdx);
            };
        } else {
            // 单曲循环
            source.loop = true;
        }

        // 应用当前 duck 状态
        this._applyBGMVolume();

        source.connect(this._bgmGain);
        source.start(0);
        this._bgmSourceNode = source;
        console.log('[AudioSystem] ▶ 文件 BGM 开始播放:', BGM_TRACKS[this._bgmPlaylistIndex].id);
    },

    /** 回退到程序化生成的 BGM */
    _fallbackToProgrammatic() {
        console.log('[AudioSystem] 回退到程序化 BGM');
        this._bgmPlaying = true;
        this._playBGMLoop();
    },

    /** 程序化 BGM 循环 */
    _playBGMLoop() {
        if (!this._bgmPlaying || !this._ctx) return;
        const ctx = this._ctx;
        const now = ctx.currentTime;
        const bpm = 120;
        const beatDuration = 60 / bpm;
        const loopBeats = 8;
        const loopDuration = loopBeats * beatDuration;

        const bassNotes = [65.41, 73.42, 82.41, 73.42];
        const bass = ctx.createOscillator();
        const bassGain = ctx.createGain();
        bass.type = 'sawtooth';
        bass.frequency.setValueAtTime(bassNotes[0], now);
        bassNotes.forEach((freq, i) => {
            const beatTime = i * beatDuration;
            bass.frequency.setValueAtTime(freq, now + beatTime);
            bassGain.gain.setValueAtTime(0, now + beatTime);
            bassGain.gain.linearRampToValueAtTime(this._bgmGain.gain.value * 0.8, now + beatTime + 0.02);
            bassGain.gain.linearRampToValueAtTime(0.1, now + beatTime + beatDuration * 0.8);
            bassGain.gain.linearRampToValueAtTime(0, now + beatTime + beatDuration - 0.01);
        });
        bassGain.gain.setValueAtTime(0, now + loopDuration - 0.01);

        const bassFilter = ctx.createBiquadFilter();
        bassFilter.type = 'lowpass';
        bassFilter.frequency.value = 200;

        bass.connect(bassFilter);
        bassFilter.connect(bassGain);
        bassGain.connect(this._bgmGain);

        bass.start(now);
        bass.stop(now + loopDuration);

        for (let i = 0; i < loopBeats; i++) {
            const t = now + i * beatDuration;
            const noiseLen = 0.05;
            const bufSize = ctx.sampleRate * noiseLen;
            const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let j = 0; j < bufSize; j++) {
                d[j] = (Math.random() * 2 - 1) * Math.max(0, 1 - j / bufSize);
            }
            const source = ctx.createBufferSource();
            source.buffer = buf;
            const g = ctx.createGain();
            g.gain.setValueAtTime(this._bgmGain.gain.value * 0.4, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + noiseLen);

            const f = ctx.createBiquadFilter();
            f.type = 'highpass';
            f.frequency.value = 3000;

            source.connect(f);
            f.connect(g);
            g.connect(this._bgmGain);
            source.start(t);
            source.stop(t + noiseLen);
        }

        this._bgmNodes = [bass];

        this._bgmTimer = setTimeout(() => {
            this._playBGMLoop();
        }, loopDuration * 1000 - 50);
    },

    /** 停止 BGM */
    stopBGM() {
        this._bgmPlaying = false;
        this._bgmPaused = false;

        if (this._bgmSourceNode) {
            try { this._bgmSourceNode.stop(); this._bgmSourceNode.disconnect(); } catch(e) {}
            this._bgmSourceNode = null;
        }
        this._bgmBuffer = null;

        if (this._bgmNodes.length > 0) {
            for (const n of this._bgmNodes) {
                try { n.stop(); n.disconnect(); } catch(e) {}
            }
            this._bgmNodes = [];
        }
        if (this._bgmTimer) {
            clearTimeout(this._bgmTimer);
            this._bgmTimer = null;
        }
    },

    // ============================================================
    // 文件音效：加载 + 播放
    // ============================================================

    /** 预缓冲单个音效文件 */
    async _preloadSFX(seId, file) {
        try {
            const resp = await fetch('sounds/' + file);
            if (!resp.ok) return;
            const arrayBuffer = await resp.arrayBuffer();
            const audioBuffer = await this._ctx.decodeAudioData(arrayBuffer);
            this._sfxBuffers[seId] = audioBuffer;
        } catch (e) {
            // 单个音效加载失败不影响整体
        }
    },

    /** 播放已缓冲的音效（返回 true 表示成功播放） */
    _playBuffer(seId) {
        const buffer = this._sfxBuffers[seId];
        if (!buffer || !this._ctx) return false;
        try {
            const source = this._ctx.createBufferSource();
            source.buffer = buffer;
            const gain = this._ctx.createGain();
            gain.gain.value = this._sfxGain.gain.value;
            source.connect(gain);
            gain.connect(this._sfxGain);
            source.start(0);
            return true;
        } catch (e) {
            return false;
        }
    },

    /** 切换 BGM 播放/暂停 */
    toggleBGM() {
        if (this._bgmPlaying && !this._bgmPaused) {
            this.pauseBGM();
        } else {
            this.resumeBGM();
        }
    },

    /** 切换到指定 BGM 曲目 */
    switchBGM(trackId) {
        if (trackId === this._currentTrackId && this._bgmPlaying && !this._bgmPaused) return;
        const wasPlaying = this._bgmPlaying;
        this.stopBGM();
        if (wasPlaying) {
            this.startBGM(trackId);
        }
    },

    /** 获取当前曲目 ID */
    getCurrentTrackId() {
        return this._currentTrackId;
    },

    /** 获取所有可用 BGM 曲目 */
    getAvailableTracks() {
        return BGM_TRACKS.map(t => ({ id: t.id, name: t.name }));
    }
};
