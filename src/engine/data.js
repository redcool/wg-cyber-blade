// ============================================================
// src/engine/data.js — 运行时统一数据加载器
// 替代分散的 CSV 解析（csv.js），直接从 JSON 加载
// ============================================================

const DataLoader = {
    /** 内部缓存，避免重复 fetch */
    _cache: {},

    /** 数据文件基路径 (CSV 生成的 JSON) */
    _basePath: 'src/data/',
    /** UI 字符表路径 (i18n 字符串,非 CSV 生成) */
    _charsDataPath: 'src/charsData/',
    /** 数据版本（改数据时 +1 强制刷新） */
    _dataVersion: '7.11',

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

        // 2. 选择路径：charsData 文件 vs 普通数据
        const base = name.endsWith('_charsData') ? this._charsDataPath : this._basePath;

        // 3. fetch 数据文件（带版本号强制刷新）
        try {
            const resp = await fetch(base + name + '.json?v=' + this._dataVersion);
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
            }
            const data = await resp.json();

            // 4. 存入 _cache
            this._cache[name] = data;

            // 5. 返回
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
        const names = ['characters', 'characterLevel', 'weapons', 'items', 'enemies', 'bosses', 'waves', 'passives', 'level_duration', 'weaponStats', 'charStats', 'difficulty', 'debug', 'levelUpCards', 'rarityColors', 'rarity', 'audio', 'classes', 'system'];
        await Promise.all(names.map(n => this.load(n)));
        if (typeof SystemConfig !== 'undefined') await SystemConfig.load();
        console.log('[DataLoader] 全部数据预加载完成');
    },

    /**
     * 清除缓存（用于热重载场景）
     */
    clearCache() {
        this._cache = {};
    },
};
