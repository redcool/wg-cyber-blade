// ============================================================
// src/engine/rarityColors.js — 等级颜色配置系统 (Brotato 风格)
// 依赖: data.js (DataLoader)
// ============================================================

/**
 * RarityColorSystem — 全游戏统一等级/稀有度颜色配置
 *
 * 数据驱动: csv/rarityColors.csv → src/data/rarityColors.json
 *
 * 提供:
 *   load()                          从 DataLoader 加载配置
 *   getColor(key)                   根据 key 返回 color (#ffffff)
 *   getBg(key)                      根据 key 返回 bg (rgba)
 *   getName(key)                    根据 key 返回显示名
 *   getByLevel(level)               根据 level (1-5) 返回整条记录
 *   getMap()                        返回 { key: {color, bg, name} } 映射表
 *   T1~T4 兼容: getColor('T1') = getColor('common')
 *
 * 使用示例:
 *   await RarityColorSystem.load();
 *   const col = RarityColorSystem.getColor('epic');  // '#FF3B3B'
 *   const bg  = RarityColorSystem.getBg('legendary'); // 'rgba(255,215,0,0.15)'
 *
 * 颜色参考 (Brotato 土豆兄弟):
 *   Level 1 / common:    白色 #ffffff
 *   Level 2 / uncommon:  蓝色 #4A9BD1
 *   Level 3 / rare:      紫色 #AD5AFF
 *   Level 4 / epic:      红色 #FF3B3B
 *   Level 5 / legendary: 金色 #FFD700
 */
const RarityColorSystem = {
    /** 原始数据（从 DataLoader 加载） */
    _data: [],

    /** { key: { color, bg, name } } 查找映射 */
    _map: {},

    /** T1~T4 到 key 的映射（兼容武器品质） */
    _qualityToKey: {
        T1: 'common',
        T2: 'uncommon',
        T3: 'rare',
        T4: 'epic',
    },

    /**
     * 从 DataLoader 加载稀有度颜色配置
     */
    async load() {
        if (typeof DataLoader !== 'undefined' && DataLoader.load) {
            const data = await DataLoader.load('rarityColors');
            this._data = data || [];
            this._buildMap();
        }
    },

    /**
     * 构建 _map 查找表
     */
    _buildMap() {
        this._map = {};
        for (const entry of this._data) {
            this._map[entry.key] = {
                color: entry.color,
                bg: entry.bg,
                name: entry.name,
                level: entry.level,
            };
        }
    },

    /**
     * 将 T1-T4 或任意 key 解析为标准 key
     */
    _resolveKey(key) {
        if (!key) return 'common';
        // T1~T4 映射
        if (this._qualityToKey[key]) return this._qualityToKey[key];
        return key;
    },

    /**
     * 获取颜色代码
     * @param {string} key - rarity key 或 T1~T4
     * @returns {string} 颜色 hex，找不到返回 #ffffff
     */
    getColor(key) {
        const resolved = this._resolveKey(key);
        const entry = this._map[resolved];
        return entry ? entry.color : '#ffffff';
    },

    /**
     * 获取背景色
     * @param {string} key - rarity key 或 T1~T4
     * @returns {string} 背景 rgba，找不到返回 rgba(255,255,255,0.12)
     */
    getBg(key) {
        const resolved = this._resolveKey(key);
        const entry = this._map[resolved];
        return entry ? entry.bg : 'rgba(255,255,255,0.12)';
    },

    /**
     * 获取显示名称
     * @param {string} key - rarity key 或 T1~T4
     * @returns {string} 显示名，找不到返回 '普通'
     */
    getName(key) {
        const resolved = this._resolveKey(key);
        const entry = this._map[resolved];
        return entry ? entry.name : '普通';
    },

    /**
     * 根据数值等级获取整条记录
     * @param {number} level - 1-5
     * @returns {Object|null}
     */
    getByLevel(level) {
        for (const entry of this._data) {
            if (entry.level === level) return entry;
        }
        return null;
    },

    /**
     * 获取完整映射表
     * @returns {Object} { key: { color, bg, name, level } }
     */
    getMap() {
        return this._map;
    },
};

if (typeof module !== 'undefined') {
    module.exports = { RarityColorSystem };
}
