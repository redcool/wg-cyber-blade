// ============================================================
// bullet.test.js — BulletSystem 单元测试
// 重点: 闪电杖/雷电杖 chainCount>0 + 暴击时 chainLightning 触发
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BulletSystem } from '../../src/engine/bullet.js';

// Mock 全局依赖
global.EnemySystem = {
    enemies: [],
    takeDamage: vi.fn((e, dmg) => {
        e.hp -= dmg;
        if (e.hp <= 0) { e.alive = false; return -1; }
        return 0;
    }),
};
global.ParticleSystem = { emit: vi.fn() };
global.PlayerSystem = { player: { _lastCrit: false } };

describe('BulletSystem - 连锁电击 (闪电杖/雷电杖 Report 2)', () => {
    beforeEach(() => {
        EnemySystem.enemies = [];
        EnemySystem.takeDamage.mockClear();
        ParticleSystem.emit.mockClear();
        PlayerSystem.player._lastCrit = false;
    });

    it('B1: chainLightning chainCount<=0 时立即返回 (无伤害)', () => {
        const b = { chainCount: 0, chainRange: 150, hits: [], damage: 100 };
        const hit = { x: 0, y: 0, hp: 50, alive: true };
        BulletSystem.chainLightning(b, hit);
        expect(EnemySystem.takeDamage).not.toHaveBeenCalled();
        expect(ParticleSystem.emit).not.toHaveBeenCalled();
    });

    it('B2: chainLightning 无其他敌人时只命中原始目标,不再连锁', () => {
        const b = { chainCount: 5, chainRange: 150, hits: [], damage: 100 };
        const hit = { x: 0, y: 0, hp: 50, alive: true };
        // 不再把 hit 加入 enemies (避免被 chain 再次命中)
        BulletSystem.chainLightning(b, hit);
        // hit 本身不在 enemies 列表里 → chain 找不到下一个目标
        expect(EnemySystem.takeDamage).not.toHaveBeenCalled();
    });

    it('B3: chainLightning 链到最近敌人,最多 chainCount 次', () => {
        // 5 个候选敌人, chainCount=3 → 只能链 3 次
        const b = { chainCount: 3, chainRange: 200, hits: [], damage: 100 };
        const hit = { x: 0, y: 0, hp: 50, alive: true };
        const enemies = [
            { x: 50, y: 0, hp: 50, alive: true },   // e1
            { x: 70, y: 0, hp: 50, alive: true },   // e2 - 离 e1 较近
            { x: 100, y: 0, hp: 50, alive: true },  // e3
            { x: 130, y: 0, hp: 50, alive: true },  // e4
            { x: 160, y: 0, hp: 50, alive: true },  // e5
        ];
        EnemySystem.enemies = enemies;

        BulletSystem.chainLightning(b, hit);
        // 期望: chainCount=3 限制 → 只链 3 次
        expect(EnemySystem.takeDamage).toHaveBeenCalledTimes(3);
        // 伤害递减: 第 1 次 (3-3)*0.2=0 → 100; 第 2 次 (3-2)*0.2=0.2 → 80; 第 3 次 (3-1)*0.2=0.4 → 60
        const damages = EnemySystem.takeDamage.mock.calls.map(c => c[1]);
        expect(damages).toEqual([100, 80, 60]);
        // 特效调用 3 次
        expect(ParticleSystem.emit).toHaveBeenCalledTimes(3);
    });

    it('B4: chainLightning 不会重复命中已在 hits 列表的目标', () => {
        // 所有候选敌人都已在 hits → 不应再命中任何
        const hit = { x: 0, y: 0, hp: 50, alive: true };
        const e1 = { x: 50, y: 0, hp: 50, alive: true };
        const e2 = { x: 80, y: 0, hp: 50, alive: true };
        EnemySystem.enemies = [e1, e2];
        const b = { chainCount: 5, chainRange: 200, hits: [e1, e2], damage: 100 };

        BulletSystem.chainLightning(b, hit);
        // 期望: 0 次 takeDamage (filter 排除了 e1 和 e2)
        expect(EnemySystem.takeDamage).not.toHaveBeenCalled();
        expect(ParticleSystem.emit).not.toHaveBeenCalled();
    });

    it('B5: lightning_staff 真实数据 chainCount=5 (Report 2 数据契约)', () => {
        // 数据驱动验证: 闪电杖必须有 chainCount>0
        // 这里直接 import 真实 JSON
        const fs = require('fs');
        const path = require('path');
        const weapons = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../src/data/weapons.json'), 'utf-8'));
        const ls = weapons.find(w => w.id === 'lightning_staff');
        expect(ls).toBeDefined();
        expect(ls.chainCount).toBeGreaterThan(0);
        expect(ls.behavior).toBe('shock');
        expect(ls.critChanceAdd).toBeGreaterThan(0);  // 必须有暴击率加成才能配合 chain
    });
});
