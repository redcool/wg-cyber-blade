// ============================================================
// src/engine/healthPickup.js — 医疗包拾取系统 (Brotato 水果机制)
// 依赖: renderer.js (drawHealthPickup), player.js (health/pickupRange)
// ============================================================

/**
 * HealthPickupSystem — 医疗包拾取
 *
 * 容器击破后掉落医疗包, 自动吸引 + 拾取回血.
 * 医疗包有生命计时器, 过期消失.
 *
 * API:
 *   spawn(x, y)          生成医疗包 (1-2 个)
 *   update(dt, player)   每帧更新 (吸引/拾取/过期)
 *   reset()              重置
 */

const HealthPickupSystem = {
    pickups: [],

    /** 容器击破后生成医疗包 (1-2 个) */
    spawn(x, y) {
        const count = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) {
            this.pickups.push({
                x: x + (Math.random() - 0.5) * 30,
                y: y + (Math.random() - 0.5) * 30,
                healAmount: 15 + Math.floor(Math.random() * 11),  // 15-25
                lifeTimer: 8.0,  // 8 秒后消失
                radius: 8,
            });
        }
    },

    /** 每帧更新: 过期 / 吸引 / 拾取 */
    update(dt, player) {
        if (!player) return;

        const attractSpeed = 250;  // px/s
        const collectDist = 12;

        for (let i = this.pickups.length - 1; i >= 0; i--) {
            const pk = this.pickups[i];

            // 过期
            pk.lifeTimer -= dt;
            if (pk.lifeTimer <= 0) {
                this.pickups.splice(i, 1);
                continue;
            }

            // 距离
            const dx = pk.x - player.x;
            const dy = pk.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // 拾取
            if (dist < collectDist + pk.radius) {
                player.hp = Math.min(player.maxHp, player.hp + pk.healAmount);
                // 拾取特效
                if (typeof ParticleSystem !== 'undefined') {
                    ParticleSystem.emit(player.x, player.y, 8, {
                        speed: 60, color: '#44ff88', life: 0.4, size: 5, type: 'glow'
                    });
                }
                if (typeof CombatLogSystem !== 'undefined') {
                    CombatLogSystem.addEventText(
                        player.x, player.y - 10,
                        '❤️ +' + pk.healAmount, '#44ff88', 13
                    );
                }
                this.pickups.splice(i, 1);
                continue;
            }

            // 吸引 (进入 pickupRange 后)
            const pickupRange = player.pickupRange || 100;
            if (dist < pickupRange + pk.radius) {
                const factor = dt * attractSpeed / Math.max(1, dist);
                pk.x -= dx * factor;
                pk.y -= dy * factor;
            }
        }
    },

    /** 重置 */
    reset() {
        this.pickups = [];
    },
};

if (typeof module !== 'undefined') {
    module.exports = { HealthPickupSystem };
}