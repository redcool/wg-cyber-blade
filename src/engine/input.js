// ============================================================
// input.js - 纯键盘输入系统（WASD 移动，自动射击）
// ============================================================
const Input = {
    keys: {},
    keyJustPressed: {},

    init() {
        window.addEventListener('keydown', (e) => {
            if (!this.keys[e.key]) this.keyJustPressed[e.key] = true;
            this.keys[e.key] = true;
            e.preventDefault();
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
            e.preventDefault();
        });
        window.addEventListener('contextmenu', (e) => e.preventDefault());
    },

    isDown(key) {
        return this.keys[key] === true;
    },

    isJustPressed(key) {
        return this.keyJustPressed[key] === true;
    },

    clearJustPressed() {
        this.keyJustPressed = {};
    },

    /**
     * 获取玩家输入方向向量 (归一化)
     * @returns {{x: number, y: number}} x:[-1,1], y:[-1,1], 对角线归一化
     */
    getInputDir() {
        let dx = 0, dy = 0;
        if (this.isDown('w') || this.isDown('W') || this.isDown('ArrowUp')) dy = -1;
        if (this.isDown('s') || this.isDown('S') || this.isDown('ArrowDown')) dy = 1;
        if (this.isDown('a') || this.isDown('A') || this.isDown('ArrowLeft')) dx = -1;
        if (this.isDown('d') || this.isDown('D') || this.isDown('ArrowRight')) dx = 1;

        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
            dx /= len;
            dy /= len;
        }
        return { x: dx, y: dy };
    },

    /** 是否正在移动 */
    isMoving() {
        const dir = this.getInputDir();
        return dir.x !== 0 || dir.y !== 0;
    }
};

// CommonJS / global 双导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Input;
} else if (typeof window !== 'undefined') {
    window.Input = Input;
}
