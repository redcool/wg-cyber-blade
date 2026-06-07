// ============================================================
// src/engine/math/collision.js - 碰撞工具 (KISS, 纯函数, 无依赖)
// ============================================================
// 设计: 纯静态方法, 接受坐标/对象两种形式, 不修改入参.
// 所有"碰撞半径"取入参对象的 .radius 字段 (默认 0).
// 命名空间: window.Collision / module.exports
// ============================================================

const Collision = {
    // --------------------------------------------------------
    // 基础: 距离
    // --------------------------------------------------------

    /** 两点距离平方 (避 sqrt, 用于距离比较) */
    distSq(x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        return dx * dx + dy * dy;
    },

    /** 两点距离 (欧几里得) */
    dist(x1, y1, x2, y2) {
        return Math.sqrt(Collision.distSq(x1, y1, x2, y2));
    },

    /** 两点距离平方 — {x,y} 对象形式 */
    pointsDistSq(a, b) {
        return Collision.distSq(a.x, a.y, b.x, b.y);
    },

    // --------------------------------------------------------
    // 圆 vs 圆 (核心接口: "两个圆形碰撞了 = 扣血")
    // --------------------------------------------------------

    /**
     * 圆 vs 圆 — 数值形式
     * @param {number} ax ay ar bx by br — 两圆圆心+半径
     * @returns {boolean} 两圆重叠或刚好接触
     */
    circleVsCircle(ax, ay, ar, bx, by, br) {
        const r = ar + br;
        return Collision.distSq(ax, ay, bx, by) <= r * r;
    },

    /**
     * 圆 vs 圆 — 对象形式 (推荐接口)
     * @param {{x,y,radius}} a — 支持 radius 缺省
     * @param {{x,y,radius}} b
     * @returns {boolean}
     */
    circlesOverlap(a, b) {
        const r = (a.radius || 0) + (b.radius || 0);
        return Collision.distSq(a.x, a.y, b.x, b.y) <= r * r;
    },

    /**
     * 圆 vs 圆 — 接收额外 r2 偏移 (用于玩家 + 武器半径 等)
     * @param {{x,y,radius}} a
     * @param {{x,y}} b 目标点
     * @param {number} extraR b 的有效半径(非圆对象, 缺省 0)
     */
    pointInCircle(a, b, extraR = 0) {
        const r = (a.radius || 0) + extraR;
        return Collision.distSq(a.x, a.y, b.x, b.y) <= r * r;
    },

    // --------------------------------------------------------
    // 胶囊体 (运动线段) vs 圆 — 高速子弹扫掠碰撞
    // --------------------------------------------------------

    /**
     * 胶囊体 vs 圆 — 用于"上一帧位置 → 本帧位置"扫掠, 防止高速穿模
     * @param {number} x1 y1 — 上一帧位置
     * @param {number} x2 y2 — 本帧位置
     * @param {number} capR — 胶囊体半径 (子弹半径)
     * @param {number} cx cy cR — 目标圆心 + 半径
     * @returns {boolean}
     */
    capsuleVsCircle(x1, y1, x2, y2, capR, cx, cy, cR) {
        // 退化: 上一帧 = 本帧 (本帧位移为 0)
        const dx = x2 - x1, dy = y2 - y1;
        const segLenSq = dx * dx + dy * dy;
        if (segLenSq < 1e-9) {
            return Collision.circleVsCircle(x1, y1, capR, cx, cy, cR);
        }
        // 圆心到线段最近点
        let t = ((cx - x1) * dx + (cy - y1) * dy) / segLenSq;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const px = x1 + dx * t, py = y1 + dy * t;
        return Collision.circleVsCircle(px, py, capR, cx, cy, cR);
    },

    /**
     * 胶囊体 vs 圆 — 对象形式
     * @param {{x1,y1,x2,y2,radius}} cap — 胶囊体 (子弹)
     * @param {{x,y,radius}} c — 目标圆 (敌人)
     */
    capsuleCircleOverlap(cap, c) {
        return Collision.capsuleVsCircle(
            cap.x1, cap.y1, cap.x2, cap.y2, cap.radius || 0,
            c.x, c.y, c.radius || 0
        );
    },

    // --------------------------------------------------------
    // 扇形 (锥形) vs 圆 — 近战武器方向+圆形
    // --------------------------------------------------------

    /**
     * 扇形 vs 圆 — 用于近战横扫/突刺 (有方向的圆形碰撞)
     * @param {{x,y,radius,angle,halfAngle}} cone — 锥形
     *   - x,y: 锥形圆心
     *   - radius: 锥形半径
     *   - angle: 锥形中心方向 (弧度)
     *   - halfAngle: 半角 (弧度), PI = 180° 横扫, PI/12 = 15° 突刺
     * @param {{x,y,radius}} c — 目标圆
     * @returns {boolean}
     */
    coneVsCircle(cone, c) {
        const r = (cone.radius || 0) + (c.radius || 0);
        const dx = c.x - cone.x, dy = c.y - cone.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > r * r) return false;
        // 距离 0 / 极小: 视为在锥心
        if (distSq < 1e-9) return true;
        // 角度检查
        const targetAngle = Math.atan2(dy, dx);
        let diff = targetAngle - cone.angle;
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;
        return Math.abs(diff) <= (cone.halfAngle || Math.PI);
    },

    // --------------------------------------------------------
    // 玩家-怪接触距离 (Brotato 风格: 30 像素走位缓冲)
    // --------------------------------------------------------

    /**
     * 玩家-怪接触距离: 怪 + 玩家半径 + 30 像素缓冲
     * 怪到了这个距离就停止前进, 玩家能走位脱离
     */
    touchDist(e, p) {
        return (e.radius || 14) + (p.radius || 10) + 30;
    },
};

// CommonJS / global 双导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Collision;
} else if (typeof window !== 'undefined') {
    window.Collision = Collision;
}
