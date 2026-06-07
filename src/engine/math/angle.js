// ============================================================
// src/engine/math/angle.js - 角度工具 (KISS, 纯函数, 无依赖)
// ============================================================
// 设计: 内部用弧度 (Math.atan2 风格), 公开 API 接受/返回弧度.
//   fromXY / fromPoints / toDeg / toRad / normalize /
//   shortestDiff / inCone / lerp
// ============================================================

const Angle = {
    /** 两点角度: a → b 的方向 (弧度) */
    fromPoints(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); },

    /** 单位向量 → 角度 */
    fromXY(x, y) { return Math.atan2(y, x); },

    /** 弧度 → 度数 */
    toDeg(rad) { return rad * 180 / Math.PI; },

    /** 度数 → 弧度 */
    toRad(deg) { return deg * Math.PI / 180; },

    /** 归一化到 [-π, π] */
    normalize(a) {
        while (a > Math.PI) a -= 2 * Math.PI;
        while (a < -Math.PI) a += 2 * Math.PI;
        return a;
    },

    /** 最短角度差: a → b 的有向最短路径 (弧度, 范围 [-π, π]) */
    shortestDiff(a, b) {
        return Angle.normalize(b - a);
    },

    /** 目标 angle 是否在 [center - halfCone, center + halfCone] 扇区内 (含边界) */
    inCone(target, center, halfCone) {
        const diff = Angle.shortestDiff(center, target);
        return Math.abs(diff) <= halfCone;
    },

    /** 线性插值: 短弧路径从 a → b 按 t (0..1) */
    lerp(a, b, t) {
        const diff = Angle.shortestDiff(a, b);
        return Angle.normalize(a + diff * t);
    },
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Angle;
} else if (typeof window !== 'undefined') {
    window.Angle = Angle;
}
