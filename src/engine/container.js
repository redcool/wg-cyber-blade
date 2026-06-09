// ============================================================
// src/engine/container.js — 可击破容器系统 (Brotato 树木机制)
// 依赖: renderer.js (drawCrate), healthPickup.js (HealthPickupSystem)
// ============================================================

/**
 * ContainerSystem — 可击破容器 (医疗箱/树木)
 *
 * 每波生成 2-4 个固定容器, 被玩家子弹击破后掉落医疗包.
 * 容器本身不攻击, 不移动, 不是敌人.
 *
 * API:
 *   spawnCrates(count, player)    每波生成容器
 *   takeDamage(crate, damage)     受击扣血 → 死亡触发掉落
 *   update(dt)                    每帧更新 (未来可加呼吸动画)
 *   reset()                       重置
 */

const ContainerSystem = {
    crates: [],

    /** 每波生成可击破容器 */
    spawnCrates(count, player) {
        this.crates = [];
        const worldW = (typeof GameWorld !== 'undefined' && GameWorld.width) || 1200;
        const worldH = (typeof GameWorld !== 'undefined' && GameWorld.height) || 900;
        const margin = 80;
        const minDistFromPlayer = 150;

        for (let i = 0; i < count; i++) {
            let x, y, tries = 0;
            do {
                x = margin + Math.random() * (worldW - margin * 2);
                y = margin + Math.random() * (worldH - margin * 2);
                tries++;
            } while (
                player &&
                tries < 50 &&
                Math.hypot(x - player.x, y - player.y) < minDistFromPlayer
            );

            this.crates.push({
                x,
                y,
                hp: 30 + Math.floor(Math.random() * 20),
                maxHp: 30 + Math.floor(Math.random() * 20),
                radius: 18,
                alive: true,
            });
        }
    },

    /** 容器受击 (子弹命中) */
    takeDamage(crate, damage) {
        if (!crate.alive) return false;
        crate.hp -= damage;

        // 击破特效
        if (typeof ParticleSystem !== 'undefined') {
            ParticleSystem.emit(crate.x, crate.y, 6, {
                speed: 80, color: '#44ff88', life: 0.3, size: 4, type: 'spark'
            });
        }

        if (crate.hp <= 0) {
            crate.alive = false;
            // 掉落医疗包
            if (typeof HealthPickupSystem !== 'undefined') {
                HealthPickupSystem.spawn(crate.x, crate.y);
            }
            // 爆炸特效
            if (typeof ParticleSystem !== 'undefined') {
                ParticleSystem.emit(crate.x, crate.y, 12, {
                    speed: 120, color: '#44ff88', life: 0.5, size: 6, type: 'glow'
                });
            }
            return true;
        }
        return false;
    },

    /** 每帧更新 */
    update(dt) {
        // 容器本身无逻辑 (未来可加呼吸/抖动)
    },

    /** 重置 */
    reset() {
        this.crates = [];
    },
};

if (typeof module !== 'undefined') {
    module.exports = { ContainerSystem };
}