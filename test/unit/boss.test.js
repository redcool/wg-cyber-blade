// ============================================================
// test/unit/boss.test.js — BossSystem 单元测试
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BossSystem, BOSS_BEHAVIORS, BOSS_SKILLS } from '../../src/engine/boss.js';

// ============================================================
// 测试数据
// ============================================================

const MOCK_BOSS_TYPE = {
    id: 'fire_dragon',
    name: '火龙',
    baseHp: 1500,
    baseDamage: 30,
    baseSpeed: 40,
    radius: 45,
    color: '#ff4400',
    glowColor: '#ff2200',
    phases: [
        {
            name: 'P1 烈焰',
            hpPercent: 100,
            behavior: 'boss_chase',
            moveSpeed: 40,
            attackInterval: 1.5,
            skills: [
                { type: 'melee_sweep', range: 100, damageMult: 1.0 },
                { type: 'fire_breath', range: 200, damageMult: 1.5, burnDps: 5, burnDuration: 3 },
            ],
        },
        {
            name: 'P2 狂暴',
            hpPercent: 50,
            behavior: 'boss_rage',
            moveSpeed: 55,
            attackInterval: 1.0,
            skills: [
                { type: 'charge', range: 300, damageMult: 2.5 },
                { type: 'fire_storm', damageMult: 2.0, radius: 250, projectiles: 12 },
                { type: 'summon', count: 3, enemyType: 'chaser_basic' },
            ],
        },
        {
            name: 'P3 末日',
            hpPercent: 20,
            behavior: 'boss_rage',
            moveSpeed: 60,
            attackInterval: 0.8,
            skills: [
                { type: 'charge', range: 350, damageMult: 3.0 },
                { type: 'fire_storm', damageMult: 3.0, radius: 300, projectiles: 18 },
                { type: 'summon', count: 5, enemyType: 'tank_basic' },
            ],
        },
    ],
};

const MOCK_BOSS_TYPE_NO_PHASE = {
    id: 'simple_boss',
    name: '简单Boss',
    baseHp: 1000,
    baseDamage: 20,
    baseSpeed: 35,
    color: '#ff0000',
    phases: [],
};

// ============================================================
// Mock 全局依赖
// ============================================================
const mockPlayer = {
    x: 0, y: 0, radius: 10, hp: 100, maxHp: 100,
    knockbackX: 0, knockbackY: 0,
};

function setupGlobals() {
    global.DataLoader = {
        load: vi.fn(),
    };
    global.ParticleSystem = { emit: vi.fn() };
    global.LootSystem = { spawnChest: vi.fn() };
    global.EnemySystem = { createBatch: vi.fn() };
    global.PlayerSystem = {
        player: mockPlayer,
        takeDamage: vi.fn(),
    };
    global.EffectEngine = { applyBurn: vi.fn() };
}

function clearGlobals() {
    delete global.DataLoader;
    delete global.ParticleSystem;
    delete global.LootSystem;
    delete global.EnemySystem;
    delete global.PlayerSystem;
    delete global.EffectEngine;
}

// ============================================================
// 辅助
// ============================================================
function createMockBoss(bossId, waveLevel) {
    const boss = BossSystem.create(bossId, 200, 200, waveLevel);
    BossSystem.activeBoss = boss;
    return boss;
}

describe('BossSystem - 配置', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupGlobals();
        BossSystem.activeBoss = null;
        BossSystem.types = {};
    });
    afterEach(() => { clearGlobals(); });

    it('B1: loadBosses 加载数据', async () => {
        DataLoader.load.mockResolvedValue([MOCK_BOSS_TYPE, MOCK_BOSS_TYPE_NO_PHASE]);
        await BossSystem.loadBosses();
        expect(BossSystem.types.fire_dragon).toBeDefined();
        expect(BossSystem.types.simple_boss).toBeDefined();
        expect(BossSystem.types.fire_dragon.name).toBe('火龙');
    });

    it('B2: loadBosses 加载失败时部分填充', async () => {
        DataLoader.load.mockRejectedValue(new Error('no file'));
        await BossSystem.loadBosses();
        expect(Object.keys(BossSystem.types).length).toBe(0);
    });

    it('B3: loadBosses 第二次调用覆盖已有数据', async () => {
        DataLoader.load.mockResolvedValue([MOCK_BOSS_TYPE]);
        await BossSystem.loadBosses();
        expect(Object.keys(BossSystem.types).length).toBe(1);
        DataLoader.load.mockResolvedValue([MOCK_BOSS_TYPE_NO_PHASE]);
        await BossSystem.loadBosses();
        expect(Object.keys(BossSystem.types).length).toBe(1);
        expect(BossSystem.types.fire_dragon).toBeUndefined();
        expect(BossSystem.types.simple_boss).toBeDefined();
    });
});

describe('BossSystem - 创建', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupGlobals();
        BossSystem.activeBoss = null;
        BossSystem.types = { fire_dragon: MOCK_BOSS_TYPE, simple_boss: MOCK_BOSS_TYPE_NO_PHASE };
    });
    afterEach(() => { clearGlobals(); });

    it('B4: 正常创建 Boss', () => {
        const boss = createMockBoss('fire_dragon', 5);
        expect(boss).not.toBeNull();
        expect(boss.id).toBe('fire_dragon');
        expect(boss.name).toBe('火龙');
        expect(boss.alive).toBe(true);
        expect(boss.x).toBe(200);
        expect(boss.y).toBe(200);
    });

    it('B5: 属性随 waveLevel 缩放', () => {
        const boss = createMockBoss('fire_dragon', 10);
        expect(boss.level).toBe(10);
        // HP = 1500 * (1 + 10 * 0.15) = 1500 * 2.5 = 3750
        expect(boss.maxHp).toBe(3750);
        expect(boss.hp).toBe(3750);
        // dmg = 30 * (1 + 10 * 0.12) = 30 * 2.2 = 66
        expect(boss.damage).toBe(66);
        // spd = 40 * (1 + 10 * 0.05) = 40 * 1.5 = 60
        expect(boss.speed).toBe(60);
    });

    it('B6: 未知类型返回 null', () => {
        const boss = BossSystem.create('unknown', 100, 100);
        expect(boss).toBeNull();
    });

    it('B7: 初始阶段参数', () => {
        const boss = createMockBoss('fire_dragon', 1);
        expect(boss._currentPhase).toBe(0);
        expect(boss.behavior).toBe('boss_chase');
    });

    it('B8: 无阶段 Boss 也能创建', () => {
        const boss = createMockBoss('simple_boss', 1);
        expect(boss).not.toBeNull();
        expect(boss.phases).toEqual([]);
        expect(boss._currentPhase).toBe(0);
    });

    it('B9: 设置 activeBoss', () => {
        const boss = createMockBoss('fire_dragon', 1);
        expect(BossSystem.activeBoss).toBe(boss);
    });

    it('B10: create 不覆盖已有 Boss', () => {
        const boss1 = createMockBoss('fire_dragon', 1);
        const boss2 = createMockBoss('simple_boss', 1);
        expect(BossSystem.activeBoss).toBe(boss2);
        expect(BossSystem.activeBoss.id).toBe('simple_boss');
    });
});

describe('BossSystem - 受击与死亡', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupGlobals();
        BossSystem.activeBoss = null;
        BossSystem.types = { fire_dragon: MOCK_BOSS_TYPE, simple_boss: MOCK_BOSS_TYPE_NO_PHASE };
    });
    afterEach(() => { clearGlobals(); });

    it('B11: takeDamage 扣血', () => {
        const boss = createMockBoss('fire_dragon', 1);
        const prev = boss.hp;
        BossSystem.takeDamage(boss, 100);
        expect(boss.hp).toBe(prev - 100);
    });

    it('B12: takeDamage 设置 flashTimer', () => {
        const boss = createMockBoss('fire_dragon', 1);
        BossSystem.takeDamage(boss, 50);
        expect(boss.flashTimer).toBeGreaterThan(0);
    });

    it('B13: takeDamage 返回 0 表示存活', () => {
        const boss = createMockBoss('fire_dragon', 1);
        const result = BossSystem.takeDamage(boss, 50);
        expect(result).toBe(0);
    });

    it('B14: takeDamage 击杀后调用 destroy', () => {
        const boss = createMockBoss('fire_dragon', 1);
        const result = BossSystem.takeDamage(boss, boss.hp);
        expect(result).toBe(-1);
        expect(boss.alive).toBe(false);
        expect(LootSystem.spawnChest).toHaveBeenCalledWith(
            expect.any(Number), expect.any(Number), 'legendary'
        );
    });

    it('B15: 无敌期间取伤害返回 1', () => {
        const boss = createMockBoss('fire_dragon', 1);
        boss._invulnerable = true;
        const result = BossSystem.takeDamage(boss, 9999);
        expect(result).toBe(1);
        expect(boss.alive).toBe(true);
    });

    it('B16: 击杀 Boss 触发死亡特效', () => {
        const boss = createMockBoss('fire_dragon', 1);
        BossSystem.takeDamage(boss, boss.hp);
        expect(ParticleSystem.emit).toHaveBeenCalledTimes(2);
    });

    it('B17: 击杀后 activeBoss 被清空', () => {
        const boss = createMockBoss('fire_dragon', 1);
        BossSystem.takeDamage(boss, boss.hp);
        expect(BossSystem.activeBoss).toBeNull();
    });

    it('B18: destroy 无 Boss 不报错', () => {
        expect(() => BossSystem.destroy(null)).not.toThrow();
        expect(() => BossSystem.destroy({ alive: false })).not.toThrow();
    });
});

describe('BossSystem - 阶段切换', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupGlobals();
        BossSystem.activeBoss = null;
        BossSystem.types = { fire_dragon: MOCK_BOSS_TYPE, simple_boss: MOCK_BOSS_TYPE_NO_PHASE };
    });
    afterEach(() => { clearGlobals(); });

    it('B19: 满血在 P1', () => {
        const boss = createMockBoss('fire_dragon', 1);
        BossSystem.checkPhaseTransition(boss);
        expect(boss._currentPhase).toBe(0);
    });

    it('B20: HP 降到 50% 切换到 P2', () => {
        const boss = createMockBoss('fire_dragon', 1);
        boss.hp = boss.maxHp * 0.5;
        BossSystem.checkPhaseTransition(boss);
        expect(boss._currentPhase).toBe(1);
        expect(boss.behavior).toBe('boss_rage');
        expect(boss._invulnerable).toBe(true);
        expect(boss._invulnTimer).toBeGreaterThan(0);
    });

    it('B21: HP 降到 20% 切换到 P3', () => {
        const boss = createMockBoss('fire_dragon', 1);
        boss.hp = boss.maxHp * 0.19;
        BossSystem.checkPhaseTransition(boss);
        expect(boss._currentPhase).toBe(2);
        expect(boss.behavior).toBe('boss_rage');
    });

    it('B22: 血量在 50%-100% 之间保持 P1', () => {
        const boss = createMockBoss('fire_dragon', 1);
        boss.hp = boss.maxHp * 0.75;
        BossSystem.checkPhaseTransition(boss);
        expect(boss._currentPhase).toBe(0);
    });

    it('B23: 血量在 20%-50% 之间保持 P2', () => {
        const boss = createMockBoss('fire_dragon', 1);
        boss.hp = boss.maxHp * 0.35;
        BossSystem.checkPhaseTransition(boss);
        expect(boss._currentPhase).toBe(1);
    });

    it('B24: 无阶段 Boss 不切换', () => {
        const boss = createMockBoss('simple_boss', 1);
        boss.hp = 1;
        BossSystem.checkPhaseTransition(boss);
        expect(boss._currentPhase).toBe(0);
    });

    it('B25: 阶段切换触发粒子特效', () => {
        const boss = createMockBoss('fire_dragon', 1);
        boss.hp = boss.maxHp * 0.5;
        BossSystem.checkPhaseTransition(boss);
        expect(ParticleSystem.emit).toHaveBeenCalled();
    });

    it('B26: repeated 阶段检查不再触发已切换的阶段', () => {
        const boss = createMockBoss('fire_dragon', 1);
        boss.hp = boss.maxHp * 0.5;
        BossSystem.checkPhaseTransition(boss);
        expect(boss._currentPhase).toBe(1);
        const particleCallCount = ParticleSystem.emit.mock.calls.length;
        BossSystem.checkPhaseTransition(boss);
        expect(boss._currentPhase).toBe(1);
        expect(ParticleSystem.emit.mock.calls.length).toBe(particleCallCount);
    });
});

describe('BossSystem - 更新', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupGlobals();
        BossSystem.activeBoss = null;
        BossSystem.types = { fire_dragon: MOCK_BOSS_TYPE, simple_boss: MOCK_BOSS_TYPE_NO_PHASE };
    });
    afterEach(() => { clearGlobals(); });

    it('B27: 无 Boss 时不更新', () => {
        expect(() => BossSystem.update(0.016, mockPlayer)).not.toThrow();
    });

    it('B28: Boss 死后不更新', () => {
        const boss = createMockBoss('fire_dragon', 1);
        boss.alive = false;
        expect(() => BossSystem.update(0.016, mockPlayer)).not.toThrow();
    });

    it('B29: 击杀击退衰减正常', () => {
        const boss = createMockBoss('fire_dragon', 1);
        boss.knockbackX = 100;
        boss.knockbackY = -50;
        BossSystem.update(0.016, mockPlayer);
        expect(boss.knockbackX).toBe(90);
        expect(boss.knockbackY).toBe(-45);
    });

    it('B30: Boss 朝玩家移动', () => {
        const boss = createMockBoss('fire_dragon', 1);
        mockPlayer.x = 300;
        mockPlayer.y = 300;
        BossSystem.update(0.016, mockPlayer);
        expect(boss.x).toBeGreaterThan(200);
        expect(boss.y).toBeGreaterThan(200);
    });

    it('B31: update 触发技能', () => {
        const boss = createMockBoss('fire_dragon', 1);
        boss._skillCooldown = 0;
        BossSystem.update(0.016, mockPlayer);
        expect(boss._skillIndex).toBeGreaterThan(0);
    });

    it('B32: checkPhaseTransition 在 update 阶段切换时触发', () => {
        const boss = createMockBoss('fire_dragon', 1);
        boss.hp = boss.maxHp * 0.5;
        BossSystem.update(0.016, mockPlayer);
        expect(boss._currentPhase).toBe(1);
    });

    it('B33: Boss 朝远处移动', () => {
        const boss = createMockBoss('fire_dragon', 1);
        mockPlayer.x = 9999;
        mockPlayer.y = 9999;
        const prevX = boss.x;
        const prevY = boss.y;
        BossSystem.update(0.016, mockPlayer);
        expect(boss.x).toBeGreaterThan(prevX);
        expect(boss.y).toBeGreaterThan(prevY);
    });
});

describe('BOSS_SKILLS', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupGlobals();
    });
    afterEach(() => { clearGlobals(); });

    it('B34: melee_sweep 范围内造成伤害', () => {
        const mockBoss = { x: 0, y: 0, damage: 30 };
        const skill = { type: 'melee_sweep', range: 100, damageMult: 2.0 };
        BOSS_SKILLS.melee_sweep.execute(mockBoss, { x: 50, y: 0, radius: 10 }, skill);
        expect(PlayerSystem.takeDamage).toHaveBeenCalledWith(60);
    });

    it('B35: melee_sweep 范围外不造成伤害', () => {
        const mockBoss = { x: 0, y: 0, damage: 30 };
        const skill = { type: 'melee_sweep', range: 100, damageMult: 1.0 };
        BOSS_SKILLS.melee_sweep.execute(mockBoss, { x: 500, y: 0, radius: 10 }, skill);
        expect(PlayerSystem.takeDamage).not.toHaveBeenCalled();
    });

    it('B36: fire_breath 造成燃烧效果', () => {
        const mockBoss = { x: 0, y: 0, damage: 25 };
        const skill = { type: 'fire_breath', range: 200, damageMult: 1.5, burnDps: 5, burnDuration: 3.0 };
        BOSS_SKILLS.fire_breath.execute(mockBoss, { x: 100, y: 0, radius: 10 }, skill);
        expect(PlayerSystem.takeDamage).toHaveBeenCalled();
        expect(EffectEngine.applyBurn).toHaveBeenCalledWith(mockPlayer, 5, 3.0, 3);
    });

    it('B37: charge 范围内造成击退', () => {
        const mockBoss = { x: 0, y: 0, damage: 30 };
        const skill = { type: 'charge', range: 300, damageMult: 2.0 };
        BOSS_SKILLS.charge.execute(mockBoss, { x: 150, y: 0, radius: 10 }, skill);
        expect(PlayerSystem.takeDamage).toHaveBeenCalledWith(60);
        expect(mockPlayer.knockbackX).not.toBe(0);
    });

    it('B38: summons 调用 EnemySystem.createBatch', () => {
        const mockBoss = { x: 200, y: 200, level: 5 };
        const skill = { type: 'summon', count: 3, enemyType: 'chaser_basic' };
        BOSS_SKILLS.summon.execute(mockBoss, mockPlayer, skill);
        expect(EnemySystem.createBatch).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ typeId: 'chaser_basic' }),
            ]),
            5
        );
        expect(EnemySystem.createBatch.mock.calls[0][0].length).toBe(3);
    });

    it('B39: fire_storm 全屏伤害', () => {
        const mockBoss = { x: 0, y: 0, damage: 25 };
        const skill = { type: 'fire_storm', damageMult: 2.0, radius: 250, projectiles: 12 };
        BOSS_SKILLS.fire_storm.execute(mockBoss, { x: 100, y: 0, radius: 10 }, skill);
        expect(PlayerSystem.takeDamage).toHaveBeenCalledWith(50);
    });

    it('B40: 无 PlayerSystem 时技能不报错', () => {
        delete global.PlayerSystem;
        const mockBoss = { x: 0, y: 0, damage: 25 };
        const skill = { type: 'melee_sweep', range: 100, damageMult: 1.0 };
        expect(() => BOSS_SKILLS.melee_sweep.execute(mockBoss, { x: 50, y: 0, radius: 10 }, skill)).not.toThrow();
    });

    it('B41: 无 EnemySystem 时 summon 不报错', () => {
        delete global.EnemySystem;
        const mockBoss = { x: 200, y: 200, level: 5 };
        const skill = { type: 'summon', count: 3, enemyType: 'chaser_basic' };
        expect(() => BOSS_SKILLS.summon.execute(mockBoss, mockPlayer, skill)).not.toThrow();
    });
});

describe('BOSS_BEHAVIORS', () => {
    it('B42: boss_chase 追击', () => {
        const boss = { x: 200, y: 200, speed: 40, knockbackX: 0, knockbackY: 0 };
        const player = { x: 100, y: 100 };
        BOSS_BEHAVIORS.boss_chase.update(boss, 0.1, player);
        expect(boss.x).toBeLessThan(200);
        expect(boss.y).toBeLessThan(200);
    });

    it('B43: boss_ranged 远离时靠近', () => {
        const boss = { x: 200, y: 200, speed: 35, knockbackX: 0, knockbackY: 0 };
        const player = { x: 600, y: 600 };
        BOSS_BEHAVIORS.boss_ranged.update(boss, 0.1, player);
        expect(boss.x).toBeGreaterThan(200);
        expect(boss.y).toBeGreaterThan(200);
    });

    it('B44: boss_ranged 很近时位置不变（范围 < preferred-50）', () => {
        const boss = { x: 210, y: 210, speed: 35, knockbackX: 0, knockbackY: 0 };
        const player = { x: 200, y: 200 };
        BOSS_BEHAVIORS.boss_ranged.update(boss, 0.1, player);
        // 距离 14px < 200 (preferred-50)，应后退
        // x: 210, y: 210, dx=-10, dy=-10, dist~14 → 后退方向: dx/dist=负, dy/dist=负
        // speed*dt=3.5 → boss.x += -(-10/14)*3.5 ≈ +2.5 → 所以会远离
        expect(boss.x).toBeGreaterThan(210);
    });

    it('B45: boss_rage 1.5× 速度', () => {
        const boss = { x: 300, y: 300, speed: 55, knockbackX: 0, knockbackY: 0 };
        const player = { x: 100, y: 100 };
        BOSS_BEHAVIORS.boss_rage.update(boss, 0.1, player);
        expect(boss.x).toBeLessThan(300);
        expect(boss.y).toBeLessThan(300);
    });

    it('B46: boss_ranged 超出范围时前进', () => {
        const boss = { x: 250, y: 250, speed: 35, knockbackX: 0, knockbackY: 0 };
        const player = { x: 0, y: 0 };
        BOSS_BEHAVIORS.boss_ranged.update(boss, 0.1, player);
        // 距离 ~353 > 300, 应前进靠近玩家
        expect(boss.x).toBeLessThan(250);
        expect(boss.y).toBeLessThan(250);
    });
});

describe('BossSystem - UI', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupGlobals();
        BossSystem.activeBoss = null;
        BossSystem.types = { fire_dragon: MOCK_BOSS_TYPE, simple_boss: MOCK_BOSS_TYPE_NO_PHASE };
    });
    afterEach(() => { clearGlobals(); });

    it('B47: getHpBarData Boss 活跃时返回数据', () => {
        const boss = createMockBoss('fire_dragon', 1);
        const data = BossSystem.getHpBarData();
        expect(data).not.toBeNull();
        expect(data.name).toBe('火龙');
        expect(data.hp).toBe(boss.hp);
        expect(data.maxHp).toBe(boss.maxHp);
        expect(data.phaseName).toBe('P1 烈焰');
    });

    it('B48: 无活跃 Boss 时返回 null', () => {
        const data = BossSystem.getHpBarData();
        expect(data).toBeNull();
    });

    it('B49: isActive 正确', () => {
        expect(BossSystem.isActive()).toBe(false);
        createMockBoss('fire_dragon', 1);
        expect(BossSystem.isActive()).toBe(true);
        BossSystem.activeBoss.hp = 0;
        expect(BossSystem.isActive()).toBe(false);
    });

    it('B50: clear 清空', () => {
        createMockBoss('fire_dragon', 1);
        BossSystem.clear();
        expect(BossSystem.activeBoss).toBeNull();
    });
});
