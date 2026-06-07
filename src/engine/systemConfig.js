// ============================================================
// src/engine/systemConfig.js — 系统参数配置 (来源: csv/system.csv)
// ============================================================
// 运行时从 DataLoader.load('system') 加载,转成 { key: value } 字典
// value 按 csv 中 valueType 字段解析为 number/string/boolean
// 默认值兜底,数据未加载时仍能跑(降级)
// ============================================================

const SystemConfig = {
    _raw: null,
    _cache: {},
    _loaded: false,

    /**
     * 加载并解析 csv/system.csv
     * @returns {Promise<void>}
     */
    async load() {
        const data = await DataLoader.load('system');
        this._raw = Array.isArray(data) ? data : [];
        this._cache = this._parseRows(this._raw);
        this._loaded = true;
    },

    /**
     * 解析原始行为: [{ key, value, valueType, ... }] → { key: typedValue }
     */
    _parseRows(rows) {
        const out = {};
        for (const row of rows) {
            if (!row || !row.key) continue;
            out[row.key] = this._cast(row.value, row.valueType);
        }
        return out;
    },

    _cast(raw, type) {
        if (raw === null || raw === undefined) return null;
        switch (type) {
            case 'number': {
                const v = parseFloat(raw);
                return isNaN(v) ? 0 : v;
            }
            case 'boolean':
                return String(raw).toLowerCase() === 'true' || raw === '1';
            default:
                return String(raw);
        }
    },

    /**
     * 取参数(带默认值兜底,加载失败/未配时使用)
     * @param {string} key
     * @param {*} fallback
     */
    get(key, fallback) {
        if (this._cache[key] !== undefined && this._cache[key] !== null) {
            return this._cache[key];
        }
        return fallback;
    },

    /** 是否已加载完成 */
    isLoaded() { return this._loaded; },
};

// 双导出: Node 测试 (vitest) + 浏览器 (window.SystemConfig)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SystemConfig;
} else if (typeof window !== 'undefined') {
    window.SystemConfig = SystemConfig;
}
