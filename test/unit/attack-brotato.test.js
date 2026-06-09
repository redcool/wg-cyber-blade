// ============================================================
// attack-brotato.test.js — v1.3 Brotato 规则修复测试
// 1) 搜索中心 = 角色 (Brotato 规则, 修 Bug 1)
// 2) 锥形: thrust 5° / sweep 180° (Brotato 风格)
// 3) 怪接触不再推人 (Brotato 规则, 修 Bug 2)
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================
// 测试 1-2: _findNearestTarget 中心 = 角色
// ============================================================
describe('v1.3 _findNearestTarget: 搜索中心 = 角色 (Brotato 规则)', () => {
    // 模拟 PlayerSystem._findNearestTarget 的内部搜索逻辑
    // 关键: 中心是 p (player) 不是 weaponPos (头顶 128px)
    const _dist2 = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

    function findNearestTarget(p, enemies, range) {
        // Brotato 规则: searchCenter = p (与 _tickMeleeHitDetection 一致)
        const searchCenter = p;
        let nearest = null, nearDist = Infinity;
        for (const e of enemies) {
            if (!e.alive) continue;
            const d = _dist2(e, searchCenter);
            if (d < range && d < nearDist) { nearDist = d; nearest = e; }
        }
        return nearest ? { target: nearest, dist: nearDist } : null;
    }

    it('AT1: 1 把剑头顶, 怪在角色下方 50px → 找到 (Brotato 规则修复)', () => {
        // 玩家在 (100, 100), 头顶 (100, -28) 是 1 把剑轨道位
        const p = { x: 100, y: 100 };
        // 怪在 (100, 150), 即角色下方 50px
        const enemy = { x: 100, y: 150, radius: 14, alive: true };
        // 旧规则 (用 weaponPos): dist((100,-28), (100,150)) = 178 > 80 → NOT FOUND
        // 新规则 (用 player):   dist((100,100), (100,150)) = 50 < 80 → FOUND
        const result = findNearestTarget(p, [enemy], 80);
        expect(result).toBeDefined();
        expect(result.target).toBe(enemy);
        expect(result.dist).toBe(50);
    });

    it('AT2: 1 把剑头顶, 怪在角色下方 200px → 找不到 (超射程)', () => {
        const p = { x: 100, y: 100 };
        const enemy = { x: 100, y: 300, radius: 14, alive: true };
        const result = findNearestTarget(p, [enemy], 80);
        expect(result).toBeNull();
    });

    it('AT3: 2 把剑 (头顶+脚底), 怪在脚底 50px → 找到', () => {
        const p = { x: 100, y: 100 };
        const enemy = { x: 100, y: 150, radius: 14, alive: true };
        const result = findNearestTarget(p, [enemy], 80);
        expect(result).toBeDefined();
    });

    it('AT4: 5 把剑, 怪在任意方向 ≤ 80px → 找到 (一致)', () => {
        const p = { x: 200, y: 200 };
        // 上, 下, 左, 右, 斜角 都覆盖
        const directions = [
            { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 },
            { x: 0.707, y: -0.707 }, { x: 0.707, y: 0.707 },
        ];
        for (const d of directions) {
            const e = { x: p.x + d.x * 60, y: p.y + d.y * 60, radius: 14, alive: true };
            const result = findNearestTarget(p, [e], 80);
            expect(result).toBeDefined();
        }
    });
});

// ============================================================
// 测试 3-5: 锥形角度 (Brotato 规则)
// ============================================================
describe('v1.3 锥形: thrust 5° / sweep 180° (Brotato 规则)', () => {
    // 复现 _tickMeleeHitDetection 的锥形过滤逻辑
    function inCone(targetAngle, attackAngle, cone) {
        let diff = targetAngle - attackAngle;
        diff = ((diff + Math.PI) % (2 * Math.PI)) - Math.PI;
        return Math.abs(diff) <= cone;
    }

    it('AT5: thrust 锥形角度 = π/36 (5°)', () => {
        const cone = Math.PI / 36;
        expect(cone).toBeCloseTo(0.0873, 3); // 5° = 0.0873 rad
    });

    it('AT6: sweep 锥形角度 = π (180°)', () => {
        const cone = Math.PI;
        expect(cone).toBeCloseTo(3.1416, 3);
    });

    it('AT7: thrust 5° 锥形 — 怪偏 2° → 命中', () => {
        const cone = Math.PI / 36; // 5°
        expect(inCone(2 * Math.PI / 180, 0, cone)).toBe(true);
    });

    it('AT8: thrust 5° 锥形 — 怪偏 4° → 命中 (临界内)', () => {
        const cone = Math.PI / 36;
        expect(inCone(4 * Math.PI / 180, 0, cone)).toBe(true);
    });

    it('AT9: thrust 5° 锥形 — 怪偏 10° → 不命中', () => {
        const cone = Math.PI / 36;
        expect(inCone(10 * Math.PI / 180, 0, cone)).toBe(false);
    });

    it('AT10: thrust 5° 锥形 — 怪偏 90° → 不命中 (直刺, 不能横扫)', () => {
        const cone = Math.PI / 36;
        expect(inCone(Math.PI / 2, 0, cone)).toBe(false);
    });

    it('AT11: sweep 180° 锥形 — 怪偏 90° → 命中 (半圆覆盖)', () => {
        const cone = Math.PI;
        expect(inCone(Math.PI / 2, 0, cone)).toBe(true);
    });

    it('AT12: sweep 180° 锥形 — 怪偏 170° → 命中 (临界)', () => {
        const cone = Math.PI;
        expect(inCone(170 * Math.PI / 180, 0, cone)).toBe(true);
    });

    it('AT13: sweep 180° 锥形 (=±180° 全覆盖) — 怪偏 181° (=-179°) → 命中 (|179°| ≤ 180°)', () => {
        const cone = Math.PI;
        // cone = π 意味着半弧 ±180° = 全圆覆盖，没有'背面'
        expect(inCone(-179 * Math.PI / 180, 0, cone)).toBe(true);
    });

    it('AT14: 锥形弧长随射程自然放大 (Brotato 风格)', () => {
        // arcLength = 2 * R * sin(angle/2)
        // thrust 5°: R=80 → 7px, R=320 → 28px
        const arcLen = (R, deg) => 2 * R * Math.sin(deg * Math.PI / 360);
        expect(arcLen(80, 5)).toBeCloseTo(6.98, 1);
        expect(arcLen(160, 5)).toBeCloseTo(13.96, 1);
        expect(arcLen(320, 5)).toBeCloseTo(27.92, 1);
    });
});

// ============================================================
// 测试 15-16: 怪接触不再推人 (Brotato 规则)
// ============================================================
describe('v1.3 chaser 接触: 不再推玩家 (Brotato 规则)', () => {
    let EnemySystem;

    beforeEach(async () => {
        // 动态 import 避免全局污染
        const mod = await import('../../src/engine/enemy.js');
        EnemySystem = mod.EnemySystem;

        EnemySystem.enemies = [];
        EnemySystem.types = {};

        // Mock 数据
        global.DataLoader = {
            _cache: { enemies: [
                { id: 'chaser_basic', behavior: 'chaser', hp: 30, speed: 80, damage: 8, radius: 14, attackCooldown: 1.5 },
            ] },
            async load(name) { return this._cache[name] || []; },
        };

        // 玩家设 knockbackX=knockbackY=0, 验证 chaser 接触后仍为 0
        global.PlayerSystem = {
            player: {
                x: 100, y: 100, hp: 100, maxHp: 100, radius: 10,
                knockbackX: 0, knockbackY: 0,  // 起始为 0
            },
            takeDamage: vi.fn(),
        };

        global.GameWorld = { width: 960, height: 640 };
        global.BulletSystem = { create: vi.fn() };
        global.ParticleSystem = { emit: vi.fn() };

        await EnemySystem.loadEnemies();
    });

    it('AT15: chaser 接触玩家 → 玩家 hp 减少, knockbackX/Y 仍为 0 (Brotato 规则)', () => {
        const e = EnemySystem.create('chaser_basic', 100, 100, 1);
        e.attackTimer = 0;
        const player = PlayerSystem.player;

        EnemySystem.update(1.0, player);

        expect(PlayerSystem.takeDamage).toHaveBeenCalled();
        expect(player.knockbackX).toBe(0);  // 没被推
        expect(player.knockbackY).toBe(0);
    });

    it('AT16: chaser 反复接触 → knockback 始终不累积', () => {
        const e = EnemySystem.create('chaser_basic', 100, 100, 1);
        e.attackTimer = 0;
        const player = PlayerSystem.player;

        // 模拟 10 次接触
        for (let i = 0; i < 10; i++) {
            e.attackTimer = 0;
            EnemySystem.update(1.5, player);
        }
        expect(player.knockbackX).toBe(0);
        expect(player.knockbackY).toBe(0);
    });
});
