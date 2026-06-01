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
    }
};
