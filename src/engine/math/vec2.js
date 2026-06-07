// ============================================================
// src/engine/math/vec2.js - 2D 向量工具 (KISS, 纯函数, 无依赖)
// ============================================================
// 设计: 不修改入参, 返回新对象.  调用方负责 GC.
// 所有函数接受 {x, y} 形式的对象, 数字 + 数字形式也支持 (add/sub/scale).
// ============================================================

const Vec2 = {
    /** 创建向量对象 (工厂) */
    create(x = 0, y = 0) { return { x, y }; },

    /** a + b */
    add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; },

    /** a - b */
    sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; },

    /** a * s 标量乘 */
    scale(a, s) { return { x: a.x * s, y: a.y * s }; },

    /** 点积 */
    dot(a, b) { return a.x * b.x + a.y * b.y; },

    /** 长度 (欧几里得距离) */
    length(a) { return Math.sqrt(a.x * a.x + a.y * a.y); },

    /** 长度平方 (避免 sqrt, 距离比较用) */
    lengthSq(a) { return a.x * a.x + a.y * a.y; },

    /** 两点距离 */
    dist(a, b) {
        const dx = a.x - b.x, dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    },

    /** 两点距离平方 */
    distSq(a, b) {
        const dx = a.x - b.x, dy = a.y - b.y;
        return dx * dx + dy * dy;
    },

    /** 距离差向量 (a → b, 不归一化) */
    diff(a, b) { return { x: b.x - a.x, y: b.y - a.y }; },

    /** 单位向量 (零向量返回 {x:0, y:0}) */
    normalize(a) {
        const len = Math.sqrt(a.x * a.x + a.y * a.y);
        if (len < 1e-9) return { x: 0, y: 0 };
        return { x: a.x / len, y: a.y / len };
    },

    /** 限制长度不超过 max */
    clampLength(a, max) {
        const lenSq = a.x * a.x + a.y * a.y;
        if (lenSq <= max * max) return { x: a.x, y: a.y };
        const len = Math.sqrt(lenSq);
        return { x: (a.x / len) * max, y: (a.y / len) * max };
    },
};

// CommonJS / global 双导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Vec2;
} else if (typeof window !== 'undefined') {
    window.Vec2 = Vec2;
}
