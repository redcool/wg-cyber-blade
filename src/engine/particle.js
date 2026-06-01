// ============================================================
// particle.js - 粒子特效系统
// ============================================================
const ParticleSystem = {
    particles: [],
    pool: [],

    _get() {
        return this.pool.pop() || { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0, color: '', alpha: 1, type: 'circle' };
    },

    _recycle(p) {
        this.pool.push(p);
    },

    emit(x, y, count, config) {
        const defaults = {
            speed: 100,
            color: '#00ffff',
            life: 0.5,
            size: 4,
            spread: Math.PI * 2,
            type: 'circle'
        };
        const cfg = { ...defaults, ...config };
        for (let i = 0; i < count; i++) {
            const p = this._get();
            const angle = Math.random() * cfg.spread;
            const speed = (0.3 + Math.random() * 0.7) * cfg.speed;
            p.x = x + (Math.random() - 0.5) * 6;
            p.y = y + (Math.random() - 0.5) * 6;
            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed;
            p.life = cfg.life * (0.5 + Math.random() * 0.5);
            p.maxLife = p.life;
            p.size = cfg.size * (0.5 + Math.random() * 0.5);
            p.color = cfg.color;
            p.alpha = 1;
            p.type = cfg.type;
            this.particles.push(p);
        }
    },

    // 爆炸特效
    explosion(x, y, color = '#ff6600', count = 20) {
        this.emit(x, y, count, {
            speed: 200,
            color,
            life: 0.6,
            size: 5,
            type: 'circle'
        });
        this.emit(x, y, Math.floor(count / 3), {
            speed: 300,
            color: '#ffff00',
            life: 0.3,
            size: 2,
            type: 'spark'
        });
    },

    // 敌人死亡特效
    enemyDeath(x, y, color = '#ff0044') {
        this.explosion(x, y, color, 15);
        this.emit(x, y, 8, {
            speed: 80,
            color: '#ffffff',
            life: 0.4,
            size: 3,
            type: 'glow'
        });
    },

    // 拾取材料特效
    pickup(x, y) {
        this.emit(x, y, 8, {
            speed: 80,
            color: '#ffcc00',
            life: 0.35,
            size: 4,
            type: 'spark'
        });
        this.emit(x, y, 4, {
            speed: 40,
            color: '#ffdd44',
            life: 0.4,
            size: 6,
            type: 'glow'
        });
        this.emit(x, y, 3, {
            speed: 30,
            color: '#ffffff',
            life: 0.15,
            size: 3,
            type: 'circle'
        });
    },

    // 升级特效
    levelUp(x, y) {
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                this.emit(x, y, 15, {
                    speed: 150,
                    color: '#00ff88',
                    life: 0.7,
                    size: 6,
                    spread: Math.PI * 2,
                    type: 'glow'
                });
            }, i * 200);
        }
    },

    // 合并伤害扩散光晕
    mergeGlow(x, y, color = '#ffffff') {
        this.emit(x, y, 8, {
            speed: 180,
            color: color,
            life: 0.35,
            size: 6,
            spread: Math.PI * 2,
            type: 'glow'
        });
        this.emit(x, y, 4, {
            speed: 40,
            color: '#ffffff',
            life: 0.2,
            size: 3,
            spread: Math.PI * 2,
            type: 'spark'
        });
    },

    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            p.alpha = Math.max(0, p.life / p.maxLife);
            p.vx *= 0.95;
            p.vy *= 0.95;
            if (p.life <= 0) {
                this._recycle(p);
                this.particles.splice(i, 1);
            }
        }
    },

    clear() {
        while (this.particles.length) {
            this._recycle(this.particles.pop());
        }
    }
};
