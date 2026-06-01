// ============================================================
// wave.test.js — WaveSystem 单元测试
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WaveSystem, SPAWN_PATTERNS, ENEMY_TIERS, WAVE_INTERVALS } from '../../src/engine/wave.js';

// ============================================================
// Mock globals
// ============================================================
const mockEnemies = [];

beforeEach(() => {
    // Reset WaveSystem
    WaveSystem.reset();
    WaveSystem._waveConfigs = [];

    // Clear mock enemies
    mockEnemies.length = 0;

    global.EnemySystem = {
        enemies: mockEnemies,
        createBatch: vi.fn(),
        getCounterTypes: vi.fn(() => []),
        create: vi.fn(),
    };

    global.TagSystem = {
        countWeaponTags: vi.fn(() => ({})),
        countItemTags: vi.fn(() => ({})),
        mergeTagCounts: vi.fn(() => ({})),
    };

    global.DataLoader = {
        async load(name) {
            if (name === 'waves') return [];
            return [];
        },
    };

    global.GameWorld = { width: 960, height: 640 };

    // Mock Math.random for deterministic tests
    vi.spyOn(Math, 'random').mockRestore();
});

// ============================================================
// 1. 波次配置
// ============================================================
describe('WaveSystem - 配置', () => {
    it('W1: startNextLevel 第1波有正确预算', () => {
        WaveSystem.startNextLevel();
        // budget = 10 * 1.0 * 1 = 10
        expect(WaveSystem.currentLevel).toBe(1);
        expect(WaveSystem._remainingBudget).toBe(10);
        expect(WaveSystem.waveActive).toBe(true);
    });

    it('W2: startNextLevel 第5波（Boss）预留预算', () => {
        WaveSystem.currentLevel = 4;
        WaveSystem.startNextLevel(); // 第5波
        expect(WaveSystem.currentLevel).toBe(5);
        // budget = 10 * 2.0 * 5 = 100, minus 10 for boss = 90
        expect(WaveSystem._remainingBudget).toBe(90);
        expect(WaveSystem._bossWaveBudget).toBe(10);
        expect(WaveSystem._bossSpawned).toBe(false);
    });

    it('W3: 第16波用公式计算', () => {
        WaveSystem.currentLevel = 15;
        WaveSystem.startNextLevel(); // 第16波
        // budgetMul = 4 + (16-15) * 0.5 = 4.5
        // budget = 10 * 4.5 * 16 = 720
        expect(WaveSystem._remainingBudget).toBe(720);
    });

    it('W4: 从 _waveConfigs 读取配置', async () => {
        WaveSystem._waveConfigs = [
            { budgetMul: 2.0, availableTiers: [1, 2], pattern: 'circle' },
        ];
        WaveSystem.startNextLevel();
        // budget = 10 * 2.0 * 1 = 20
        expect(WaveSystem._remainingBudget).toBe(20);
    });
});

// ============================================================
// 2. 计算属性
// ============================================================
describe('WaveSystem - 计算属性', () => {
    it('W5: spawnInterval 随波次递减', () => {
        WaveSystem.currentLevel = 1;
        const interval1 = WaveSystem.spawnInterval;
        expect(interval1).toBeCloseTo(1.5, 1);
        WaveSystem.currentLevel = 10;
        const interval10 = WaveSystem.spawnInterval;
        expect(interval10).toBeLessThan(interval1);
        expect(interval10).toBeGreaterThanOrEqual(0.3);
        WaveSystem.currentLevel = 50;
        expect(WaveSystem.spawnInterval).toBe(0.3);
    });

    it('W6: spawnsPerBatch 随波次递增', () => {
        WaveSystem.currentLevel = 1;
        expect(WaveSystem.spawnsPerBatch).toBe(2);
        WaveSystem.currentLevel = 5;
        expect(WaveSystem.spawnsPerBatch).toBe(3);
        WaveSystem.currentLevel = 8;
        expect(WaveSystem.spawnsPerBatch).toBe(4);
        WaveSystem.currentLevel = 12;
        expect(WaveSystem.spawnsPerBatch).toBe(5);
        WaveSystem.currentLevel = 20;
        expect(WaveSystem.spawnsPerBatch).toBe(6);
    });

    it('W7: maxSimultaneous 递增', () => {
        WaveSystem.currentLevel = 1;
        expect(WaveSystem.maxSimultaneous).toBe(9);
        WaveSystem.currentLevel = 10;
        expect(WaveSystem.maxSimultaneous).toBe(23);
        WaveSystem.currentLevel = 30;
        expect(WaveSystem.maxSimultaneous).toBe(40);
    });
});

// ============================================================
// 3. SpawnPatterns
// ============================================================
describe('SPAWN_PATTERNS', () => {
    const player = { x: 480, y: 300 };

    it('W8: random 返回正确数量的位置', () => {
        const positions = SPAWN_PATTERNS.random.getPositions(5, player);
        expect(positions.length).toBe(5);
        for (const pos of positions) {
            expect(pos.x).toBeDefined();
            expect(pos.y).toBeDefined();
        }
    });

    it('W9: random 位置距离玩家 350~550', () => {
        const positions = SPAWN_PATTERNS.random.getPositions(20, player);
        for (const pos of positions) {
            const dist = Math.sqrt((pos.x - 480) ** 2 + (pos.y - 300) ** 2);
            expect(dist).toBeGreaterThanOrEqual(300); // 350-allow-slight-variance
            expect(dist).toBeLessThanOrEqual(600);
        }
    });

    it('W10: circle 返回正确数量的位置', () => {
        const positions = SPAWN_PATTERNS.circle.getPositions(8, player);
        expect(positions.length).toBe(8);
    });

    it('W11: fixed 返回不重复位置', () => {
        const positions = SPAWN_PATTERNS.fixed.getPositions(4, player);
        expect(positions.length).toBe(4);
        // 应在固定点列表中
        for (const pos of positions) {
            const isFixed = pos.x === 30 || pos.x === 930 || pos.x === 480;
            const isFixedY = pos.y === 30 || pos.y === 570 || pos.y === 300;
            expect(isFixed || isFixedY).toBe(true);
        }
    });

    it('W12: wave 返回正确数量的位置', () => {
        const positions = SPAWN_PATTERNS.wave.getPositions(6, player);
        expect(positions.length).toBe(6);
        for (const pos of positions) {
            expect(pos.delay).toBeDefined();
            // 所有位置在同一边缘
            const sameEdge = (
                (pos.y === 10 || pos.y === 590) ||
                (pos.x === 10 || pos.x === 950)
            );
            expect(sameEdge).toBe(true);
        }
    });

    it('W13: random 无 player 不报错', () => {
        const positions = SPAWN_PATTERNS.random.getPositions(3, null);
        expect(positions.length).toBe(3);
    });
});

// ============================================================
// 4. ENEMY_TIERS
// ============================================================
describe('ENEMY_TIERS', () => {
    it('W14: 层级 cost 正确', () => {
        expect(ENEMY_TIERS[1].cost).toBe(1);
        expect(ENEMY_TIERS[2].cost).toBe(3);
        expect(ENEMY_TIERS[3].cost).toBe(5);
        expect(ENEMY_TIERS[4].cost).toBe(10);
    });

    it('W15: 层级包含正确类型', () => {
        expect(ENEMY_TIERS[1].types).toContain('chaser_basic');
        expect(ENEMY_TIERS[2].types).toContain('tank');
        expect(ENEMY_TIERS[3].types).toContain('swarm');
        expect(ENEMY_TIERS[4].types).toContain('boss');
    });
});

// ============================================================
// 5. 波次控制
// ============================================================
describe('WaveSystem - 波次控制', () => {
    it('W16: 开始波次重置 state', () => {
        WaveSystem.currentLevel = 0;
        WaveSystem.startNextLevel();
        expect(WaveSystem.waveTimer).toBe(0);
        expect(WaveSystem.spawnTimer).toBe(0);
        expect(WaveSystem.waveTransitioning).toBe(false);
        expect(WaveSystem._bossSpawned).toBe(false);
    });

    it('W17: endWave 清理状态', () => {
        WaveSystem.startNextLevel();
        WaveSystem.endWave();
        expect(WaveSystem.waveActive).toBe(false);
        expect(WaveSystem.waveTransitioning).toBe(true);
        // enemies 被清空
        expect(EnemySystem.enemies.length).toBe(0);
    });

    it('W18: isBossWave 第5波', () => {
        WaveSystem.currentLevel = 5;
        expect(WaveSystem.isBossWave()).toBe(true);
        WaveSystem.currentLevel = 10;
        expect(WaveSystem.isBossWave()).toBe(true);
    });

    it('W19: isBossWave 非 Boss 波', () => {
        WaveSystem.currentLevel = 1;
        expect(WaveSystem.isBossWave()).toBe(false);
        WaveSystem.currentLevel = 4;
        expect(WaveSystem.isBossWave()).toBe(false);
        WaveSystem.currentLevel = 6;
        expect(WaveSystem.isBossWave()).toBe(false);
    });

    it('W20: getAliveCount 正确', () => {
        mockEnemies.push({ alive: true });
        mockEnemies.push({ alive: true });
        mockEnemies.push({ alive: false });
        expect(WaveSystem.getAliveCount()).toBe(2);
    });

    it('W21: getRemainingTime 正确', () => {
        WaveSystem.waveTimer = 10;
        expect(WaveSystem.getRemainingTime()).toBe(50);
    });
});

// ============================================================
// 6. 更新循环
// ============================================================
describe('WaveSystem - 更新', () => {
    it('W22: 波次不活跃时 update 返回', () => {
        expect(() => WaveSystem.update(1.0, { x: 200, y: 200 })).not.toThrow();
    });

    it('W23: update 增加 timer', () => {
        WaveSystem.startNextLevel();
        WaveSystem.update(0.5, { x: 200, y: 200 });
        expect(WaveSystem.waveTimer).toBeCloseTo(0.5, 1);
        expect(WaveSystem.spawnTimer).toBeCloseTo(0.5, 1);
    });

    it('W24: Boss 波 4s 后生成 Boss', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        WaveSystem.currentLevel = 4;
        WaveSystem.startNextLevel(); // 第5波
        expect(WaveSystem._bossSpawned).toBe(false);
        WaveSystem.update(5.0, { x: 200, y: 200 });
        expect(WaveSystem._bossSpawned).toBe(true);
        expect(EnemySystem.create).toHaveBeenCalled();
    });

    it('W25: 预算耗尽 + 敌人全灭 → endWave', () => {
        WaveSystem.startNextLevel();
        expect(WaveSystem._remainingBudget).toBeGreaterThan(0);
        WaveSystem._remainingBudget = 0;
        // 敌人全灭
        expect(WaveSystem.waveActive).toBe(true);
        WaveSystem.update(1.0, { x: 200, y: 200 });
        expect(WaveSystem.waveActive).toBe(false);
    });

    it('W26: 超时 60s → endWave', () => {
        WaveSystem.startNextLevel();
        WaveSystem.waveTimer = 61;
        WaveSystem._remainingBudget = 999; // 有预算但超时
        WaveSystem.update(0.1, { x: 200, y: 200 });
        expect(WaveSystem.waveActive).toBe(false);
    });
});

// ============================================================
// 7. _getConfig
// ============================================================
describe('WaveSystem - _getConfig', () => {
    it('W27: 第1波返回 random', () => {
        WaveSystem.currentLevel = 1;
        const config = WaveSystem._getConfig();
        expect(config.pattern).toBe('random');
        expect(config.availableTiers).toEqual([1]);
    });

    it('W28: 第15波返回 wave pattern', () => {
        WaveSystem.currentLevel = 15;
        const config = WaveSystem._getConfig();
        expect(config.pattern).toBe('wave');
        expect(config.availableTiers).toEqual([1, 2, 3]);
    });

    it('W29: 16+ 使用公式', () => {
        WaveSystem.currentLevel = 20;
        const config = WaveSystem._getConfig();
        // budgetMul = 4 + (20-15) * 0.5 = 6.5
        expect(config.budgetMul).toBe(6.5);
        expect(config.pattern).toBe('random');
    });
});

// ============================================================
// 8. _spawnBatch
// ============================================================
describe('WaveSystem - _spawnBatch', () => {
    it('W30: _spawnBatch 创建敌人并扣除预算', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.9); // 不使用 counter
        WaveSystem.currentLevel = 5;
        WaveSystem.startNextLevel();
        const budgetBefore = WaveSystem._remainingBudget;
        WaveSystem._spawnBatch({ x: 200, y: 200 });
        expect(EnemySystem.createBatch).toHaveBeenCalled();
        expect(WaveSystem._remainingBudget).toBeLessThan(budgetBefore);
    });

    it('W31: _spawnBatch 预算不足时停止', () => {
        WaveSystem.currentLevel = 1;
        WaveSystem.startNextLevel();
        WaveSystem._remainingBudget = 0;
        WaveSystem._spawnBatch({ x: 200, y: 200 });
        expect(EnemySystem.createBatch).not.toHaveBeenCalled();
    });

    it('W32: _getCostForType 正确', () => {
        expect(WaveSystem._getCostForType('chaser_basic')).toBe(1);
        expect(WaveSystem._getCostForType('tank')).toBe(3);
        expect(WaveSystem._getCostForType('swarm')).toBe(5);
        expect(WaveSystem._getCostForType('boss')).toBe(10);
        expect(WaveSystem._getCostForType('unknown')).toBe(1);
    });
});

// ============================================================
// 9. 重置
// ============================================================
describe('WaveSystem - 重置', () => {
    it('W33: reset 清空所有状态', () => {
        WaveSystem.startNextLevel();
        WaveSystem.reset();
        expect(WaveSystem.currentLevel).toBe(0);
        expect(WaveSystem.waveActive).toBe(false);
        expect(WaveSystem._remainingBudget).toBe(0);
        expect(WaveSystem._bossSpawned).toBe(false);
        expect(WaveSystem.waveTimer).toBe(0);
        expect(WaveSystem.spawnTimer).toBe(0);
    });
});
