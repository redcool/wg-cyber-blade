// ============================================================
// time.js - 时间系统（支持 timeScale 加速/减速）
// ============================================================

/**
 * Time 对象管理游戏时间倍率。
 *
 * 所有游戏逻辑的时间增量 (dt) 通过 Time.scale(dt) 进行缩放，
 * 以实现加速（timeScale > 1）或减速（timeScale < 1）效果。
 *
 * timeScale 默认从 data/gameConfig.json 加载，也可运行时动态修改。
 */
const Time = {
    /** 当前时间倍率（1 = 正常速度，2 = 双倍速度，0.5 = 半速） */
    timeScale: 1,

    /** 是否已从配置文件加载 */
    _loaded: false,

    /**
     * 从 data/gameConfig.json 加载 timeScale 配置
     * 如果加载失败则保持默认值 1
     */
    async loadConfig() {
        if (this._loaded) return;
        this._loaded = true;
        try {
            const resp = await fetch('data/gameConfig.json');
            if (resp.ok) {
                const cfg = await resp.json();
                if (cfg && cfg.Time && typeof cfg.Time.timeScale === 'number') {
                    this.timeScale = cfg.Time.timeScale;
                    console.log('[Time] 已从 gameConfig.json 加载 timeScale =', this.timeScale);
                }
            }
        } catch (e) {
            console.log('[Time] 无法加载 gameConfig.json，使用默认 timeScale = 1');
        }
    },

    /**
     * 对原始 dt 应用 timeScale
     * @param {number} dt - 原始帧时间（秒）
     * @returns {number} 缩放后的帧时间
     */
    scale(dt) {
        return dt * this.timeScale;
    },

    /**
     * 设置新的 timeScale（运行时动态调整）
     * @param {number} scale - 新的时间倍率
     */
    setScale(scale) {
        const old = this.timeScale;
        this.timeScale = Math.max(0.1, Math.min(10, scale));
        if (old !== this.timeScale) {
            console.log(`[Time] timeScale: ${old} → ${this.timeScale}`);
        }
    }
};
