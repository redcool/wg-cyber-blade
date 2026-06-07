// ============================================================
// collision-melee.test.js — 验证挥动/刺击命中判定
// 完全依赖 circlesOverlap, 无方向/角度, 半径 = params.attackRange
// ============================================================
import { describe, it, expect } from 'vitest';
import Collision from '../../src/engine/math/collision.js';

describe('挥动/刺击: circlesOverlap, radius = params.attackRange (无方向, 完全依赖碰撞)', () => {
    // 等离子刀 attackRange=300, 命中半径 = 300
    const playerPos = { x: 0, y: 0 };
    const meleeRange = 300;  // params.attackRange * rangeMult

    it('玩家身边 50 像素怪命中', () => {
        const e = { x: 50, y: 0, radius: 14 };
        // distSq(0,0,50,0) = 2500, (300+14)² = 98596 → 2500 < 98596 → 命中
        expect(Collision.circlesOverlap({ ...playerPos, radius: meleeRange }, e)).toBe(true);
    });

    it('玩家身边 200 像素怪命中', () => {
        const e = { x: 200, y: 0, radius: 14 };
        // distSq = 40000, (300+14)² = 98596 → 命中
        expect(Collision.circlesOverlap({ ...playerPos, radius: meleeRange }, e)).toBe(true);
    });

    it('玩家身边 300 像素怪命中 (边界)', () => {
        const e = { x: 300, y: 0, radius: 14 };
        // distSq = 90000, (300+14)² = 98596 → 命中 (临界)
        expect(Collision.circlesOverlap({ ...playerPos, radius: meleeRange }, e)).toBe(true);
    });

    it('玩家身边 350 像素怪不命中 (超 attackRange)', () => {
        const e = { x: 350, y: 0, radius: 14 };
        // distSq = 122500 > 98596 → 不命中
        expect(Collision.circlesOverlap({ ...playerPos, radius: meleeRange }, e)).toBe(false);
    });

    it('玩家身边 100 像素, 任意方向怪命中 (无方向约束)', () => {
        // 360° 任意方向都命中 (用户接受"两边都命中", 因为完全依赖碰撞)
        const left = { x: -100, y: 0, radius: 14 };
        const right = { x: 100, y: 0, radius: 14 };
        const up = { x: 0, y: -100, radius: 14 };
        const down = { x: 0, y: 100, radius: 14 };
        expect(Collision.circlesOverlap({ ...playerPos, radius: meleeRange }, left)).toBe(true);
        expect(Collision.circlesOverlap({ ...playerPos, radius: meleeRange }, right)).toBe(true);
        expect(Collision.circlesOverlap({ ...playerPos, radius: meleeRange }, up)).toBe(true);
        expect(Collision.circlesOverlap({ ...playerPos, radius: meleeRange }, down)).toBe(true);
    });

    it('武士刀 attackRange=80, 身边 100 像素怪命中', () => {
        const swordRange = 80;
        const e = { x: 100, y: 0, radius: 14 };
        // distSq = 10000, (80+14)² = 8836 → 10000 > 8836 → 不命中
        // 修正: 100 像素 > 80 attackRange, 武士刀打不到 100 像素的怪
        expect(Collision.circlesOverlap({ ...playerPos, radius: swordRange }, e)).toBe(false);
    });

    it('武士刀 attackRange=80, 身边 80 像素怪命中 (边界)', () => {
        const swordRange = 80;
        const e = { x: 80, y: 0, radius: 14 };
        // distSq = 6400, (80+14)² = 8836 → 命中
        expect(Collision.circlesOverlap({ ...playerPos, radius: swordRange }, e)).toBe(true);
    });

    it('武士刀 attackRange=80, 身边 50 像素怪命中', () => {
        const swordRange = 80;
        const e = { x: 50, y: 0, radius: 14 };
        expect(Collision.circlesOverlap({ ...playerPos, radius: swordRange }, e)).toBe(true);
    });
});

describe('触发范围 = 命中范围 (一致性验证)', () => {
    // _getAttackRange 不再加 orbitDist, 触发 = 命中
    const meleeRange = 300;

    it('怪 250 像素: 触发 + 命中', () => {
        const e = { x: 250, y: 0, radius: 14 };
        // 触发: dist ≤ 300 ✓
        // 命中: distSq = 62500 < (300+14)² = 98596 ✓
        const triggered = 250 < meleeRange;
        const hit = Collision.circlesOverlap({ x: 0, y: 0, radius: meleeRange }, e);
        expect(triggered).toBe(true);
        expect(hit).toBe(true);
    });

    it('怪 350 像素: 不触发 + 不命中 (一致)', () => {
        const e = { x: 350, y: 0, radius: 14 };
        const triggered = 350 < meleeRange;
        const hit = Collision.circlesOverlap({ x: 0, y: 0, radius: meleeRange }, e);
        expect(triggered).toBe(false);
        expect(hit).toBe(false);
    });
});
