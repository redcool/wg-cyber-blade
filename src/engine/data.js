// ============================================================
// src/engine/data.js — 运行时统一数据加载器
// 替代分散的 CSV 解析（csv.js），直接从 JSON 加载
// ============================================================

const DataLoader = {
    /** 内部缓存，避免重复 fetch */
    _cache: {},

    /** 数据文件基路径 */
    _basePath: 'src/data/',

    /**
     * 加载 JSON 数据文件
     * @param {string} name - 文件名 (不含 .json)
     * @returns {Promise<Object[]>} 数据对象数组
     */
    async load(name) {
        // 1. 检查 _cache，命中直接返回
        if (this._cache[name]) {
            return this._cache[name];
        }

        // 2. fetch 数据文件
        try {
            const resp = await fetch(this._basePath + name + '.json');
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
            }
            const data = await resp.json();

            // 3. 存入 _cache
            this._cache[name] = data;

            // 4. 返回
            return data;
        } catch (e) {
            console.warn(`[DataLoader] fetch 失败 "${name}", 尝试内联数据...`);
            // 检查 window.__DATA_BUNDLE__（用于 file:// 离线运行）
            const bundle = typeof window !== 'undefined' && window.__DATA_BUNDLE__;
            if (bundle && bundle[name]) {
                this._cache[name] = bundle[name];
                return bundle[name];
            }
            console.error(`[DataLoader] 加载 "${name}" 失败:`, e.message);
            // 返回空数组而不是崩溃
            this._cache[name] = [];
            return [];
        }
    },

    /**
     * 预加载全部数据
     * @returns {Promise<void>}
     */
    async preloadAll() {
        const names = ['characters', 'characterLevel', 'weapons', 'items', 'enemies', 'bosses', 'waves', 'level_duration', 'weaponStats', 'charStats', 'difficulty', 'debug', 'levelUpCards', 'rarityColors'];
        await Promise.all(names.map(n => this.load(n)));
        console.log('[DataLoader] 全部数据预加载完成');
    },

    /**
     * 清除缓存（用于热重载场景）
     */
    clearCache() {
        this._cache = {};
    },
};
