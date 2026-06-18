// ============================================================
// touch-joystick.js - 移动端虚拟摇杆（单手持 · 竖屏）
// 在屏幕底部中央创建一个固定摇杆，驱动 Input.joystickDir
// ============================================================
const TouchJoystick = {
    /** @type {HTMLDivElement|null} */
    _base: null,
    /** @type {HTMLDivElement|null} */
    _knob: null,
    /** 摇杆圆心坐标 (viewport) */
    _cx: 0,
    _cy: 0,
    /** 摇杆半径 (px) */
    _radius: 50,
    /** 当前触摸 identifier */
    _touchId: -1,
    /** 是否活跃（手指按下中） */
    active: false,

    /** 配置 */
    CONFIG: {
        /** 摇杆距离屏幕底部的距离 (px) */
        bottomOffset: 70,
        /** 外环直径 (px) */
        baseSize: 120,
        /** 内圈直径 (px) */
        knobSize: 44,
        /** 死区半径比例 (0~1, 半径的百分比) */
        deadZone: 0.15,
    },

    init() {
        if (this._base) return; // 已初始化

        const cfg = this.CONFIG;
        const baseSize = cfg.baseSize;
        const knobSize = cfg.knobSize;
        this._radius = baseSize / 2;

        // ── 创建外环 ──
        const base = document.createElement('div');
        base.className = 'touch-joystick-base';
        base.style.cssText = `
            position: fixed;
            left: 50%;
            bottom: ${cfg.bottomOffset}px;
            width: ${baseSize}px;
            height: ${baseSize}px;
            border-radius: 50%;
            background: rgba(255,255,255,0.08);
            border: 2px solid rgba(255,255,255,0.15);
            transform: translateX(-50%);
            z-index: 1000;
            pointer-events: none;
            box-sizing: border-box;
            touch-action: none;
        `;
        document.body.appendChild(base);
        this._base = base;

        // ── 创建内圈 ──
        const knob = document.createElement('div');
        knob.className = 'touch-joystick-knob';
        knob.style.cssText = `
            position: absolute;
            width: ${knobSize}px;
            height: ${knobSize}px;
            border-radius: 50%;
            background: rgba(255,136,68,0.5);
            border: 2px solid rgba(255,136,68,0.7);
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            pointer-events: none;
            box-sizing: border-box;
            transition: none;
        `;
        base.appendChild(knob);
        this._knob = knob;

        // ── 缓存圆心坐标 ──
        this._updateCenter();

        // ── 全局 touch 监听 ──
        this._bindEvents();

        // 窗口变化时重新计算圆心
        window.addEventListener('resize', () => this._updateCenter());
    },

    /** 重新计算摇杆圆心在 viewport 中的位置 */
    _updateCenter() {
        const rect = this._base.getBoundingClientRect();
        this._cx = rect.left + rect.width / 2;
        this._cy = rect.top + rect.height / 2;
    },

    _bindEvents() {
        // 使用 document 级别 touch 事件，不阻止默认（保留页面滚动等）
        document.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: true });
        document.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: true });
        document.addEventListener('touchend', (e) => this._onTouchEnd(e), { passive: true });
        document.addEventListener('touchcancel', (e) => this._onTouchEnd(e), { passive: true });
    },

    /** 判断触摸点是否在摇杆范围内 */
    _isInBase(touch) {
        const dx = touch.clientX - this._cx;
        const dy = touch.clientY - this._cy;
        return (dx * dx + dy * dy) <= (this._radius + 20) * (this._radius + 20);
    },

    _onTouchStart(e) {
        if (this._touchId >= 0) return; // 已有激活触控
        for (const touch of e.changedTouches) {
            if (this._isInBase(touch)) {
                this._touchId = touch.identifier;
                this.active = true;
                this._updateKnob(touch);
                break;
            }
        }
    },

    _onTouchMove(e) {
        if (this._touchId < 0) return;
        for (const touch of e.changedTouches) {
            if (touch.identifier === this._touchId) {
                this._updateKnob(touch);
                break;
            }
        }
    },

    _onTouchEnd(e) {
        if (this._touchId < 0) return;
        for (const touch of e.changedTouches) {
            if (touch.identifier === this._touchId) {
                this._touchId = -1;
                this.active = false;
                this._resetKnob();
                // 清除摇杆方向
                if (window.Input) Input.joystickDir = null;
                break;
            }
        }
    },

    /** 根据触摸位置更新摇杆内圈和方向 */
    _updateKnob(touch) {
        const dx = touch.clientX - this._cx;
        const dy = touch.clientY - this._cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = this._radius;

        // 限制内圈不超出外环
        let knobDx = dx, knobDy = dy;
        if (dist > maxDist) {
            knobDx = (dx / dist) * maxDist;
            knobDy = (dy / dist) * maxDist;
        }

        // 更新内圈位置
        this._knob.style.transform = `translate(calc(-50% + ${knobDx}px), calc(-50% + ${knobDy}px))`;

        // 计算方向向量 (归一化, 含死区)
        const cfg = this.CONFIG;
        let nx = 0, ny = 0;
        const dz = cfg.deadZone * maxDist;
        if (dist > dz) {
            nx = knobDx / maxDist; // [-1, 1]
            ny = knobDy / maxDist;
            // 二次归一化（对角线方向）
            const len = Math.sqrt(nx * nx + ny * ny);
            if (len > 1) {
                nx /= len;
                ny /= len;
            }
        }

        if (window.Input) {
            Input.joystickDir = { x: nx, y: ny };
        }
    },

    /** 重置内圈到中心 */
    _resetKnob() {
        this._knob.style.transform = 'translate(-50%, -50%)';
    },

    /** 销毁摇杆 */
    destroy() {
        if (this._base && this._base.parentNode) {
            this._base.parentNode.removeChild(this._base);
        }
        this._base = null;
        this._knob = null;
        this._touchId = -1;
        this.active = false;
        if (window.Input) Input.joystickDir = null;
    },
};

// 模块导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TouchJoystick;
} else if (typeof window !== 'undefined') {
    window.TouchJoystick = TouchJoystick;
}
