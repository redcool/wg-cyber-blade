// ============================================================
// src/engine/animator.js — 通用动画播放类 (呼吸 / 攻击 / 死亡 / sprite 切换)
//
// 用法:
//   const anim = Animator.create({ phase: enemy._uid * 0.7 });
//   Animator.setState(anim, 'attack');
//   // 每帧:
//   Animator.update(anim, dt);
//   const t = Animator.getTransform(anim);
//   // t.scale: 缩放系数 (1.0 ± 振幅 或 渐变)
//   // t.rotation: 旋转 (度, 默认 0)
//   // t.frame: 当前帧 (用于 sprite 切换, 0 = 默认, 1..N = 状态专属)
//
// 状态: idle (正常呼吸) | attack (快速震动) | death (渐缩 0)
// 未来: walk (走路), hurt (受击) 等可扩展.
//       sprite 切换: 在 getTransform 中根据 t.frame 返回对应 sprite index.
// ============================================================

const Animator = {
    /**
     * 状态定义 (缩放/震动参数)
     * - freq: 周期 (ms)
     * - amp:  振幅 (相对 baseScale)
     * - baseScale: 基础缩放
     * - shrink: 是否渐缩 (death)
     * - shrinkDur: 渐缩时长 (ms)
     */
    STATES: {
        idle:   { freq: 500, amp: 0.04,  baseScale: 1.0 },
        attack: { freq: 130, amp: 0.13,  baseScale: 1.0 },
        death:  { freq: 200, amp: 0.0,   baseScale: 1.0, shrink: true, shrinkDur: 600 },
    },

    /**
     * 创建动画实例
     * @param {Object} [opts]
     * @param {number} [opts.phase=0]      错相位 (避免群体齐整呼吸)
     * @param {string} [opts.state='idle'] 初始状态
     * @returns {Object} 动画状态对象
     */
    create(opts = {}) {
        return {
            current: opts.state || 'idle',
            phase: opts.phase || 0,
            time: 0,             // 累积 ms (用于 sin 周期)
            stateTime: 0,        // 当前状态已持续 ms (用于 shrink 进度)
        };
    },

    /**
     * 切换状态 (自动重置 stateTime)
     */
    setState(anim, name) {
        if (!anim || anim.current === name) return;
        if (!this.STATES[name]) {
            console.warn('[Animator] 未知状态:', name);
            return;
        }
        anim.current = name;
        anim.stateTime = 0;
    },

    /**
     * 每帧更新
     * @param {Object} anim 动画实例
     * @param {number} dt 秒
     */
    update(anim, dt) {
        if (!anim) return;
        anim.time += dt * 1000;
        anim.stateTime += dt * 1000;
    },

    /**
     * 获取当前帧变换参数
     * @param {Object} anim 动画实例
     * @returns {{ scale: number, rotation: number, frame: number }}
     */
    getTransform(anim) {
        if (!anim) return { scale: 1.0, rotation: 0, frame: 0 };
        const def = this.STATES[anim.current] || this.STATES.idle;

        let scale = def.baseScale + def.amp * Math.sin(anim.time / def.freq + anim.phase);

        // death: 渐缩到 0
        if (def.shrink) {
            const t = Math.min(1, anim.stateTime / def.shrinkDur);
            const ease = 1 - Math.pow(1 - t, 2);  // easeOutQuad
            scale = def.baseScale * (1 - ease);
        }

        return { scale, rotation: 0, frame: 0 };
    },
};

// 全局可用 (浏览器 <script> 加载模式 + Node vitest 都通过 globalThis 访问)
// 注: 浏览器 <script> 不支持 export 语句, 严禁添加 `export { Animator }`
if (typeof globalThis !== 'undefined') {
    globalThis.Animator = Animator;
    if (typeof window !== 'undefined') window.Animator = Animator;
    if (typeof global !== 'undefined' && global !== window) global.Animator = Animator;
}
