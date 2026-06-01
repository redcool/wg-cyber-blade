// ============================================================
// enemy.test.js — EnemySystem 单元测试
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnemySystem } from '../../src/engine/enemy.js';

// ============================================================
// Mock data
// ============================================================
const MOCK_ENEMIES = [
    { id: 'chaser_basic', name: '追击者', behavior: 'chaser', hp: 30, speed: 80, damage: 8, radius: 14, color: '#ff4444', glowColor: '#ff0044', attackCooldown: 1.5, xpValue: 5, materialValue: 2 },
    { id: 'runner', name: '疾行者', behavior: 'runner', hp: 20, speed: 160, damage: 6, radius: 10, color: '#ff8800', glowColor: '#ff6600', attackCooldown: 1.2, xpValue: 6, materialValue: 2 },
    { id: 'tank', name: '重装机兵', behavior: 'tank', hp: 120, speed: 45, damage: 15, radius: 22, color: '#8844ff', glowColor: '#6622ff', attackCooldown: 2.0, xpValue: 12, materialValue: 5 },
    { id: 'shooter', name: '狙击手', behavior: 'shooter', hp: 25, speed: 55, damage: 12, radius: 12, color: '#ff00aa', glowColor: '#ff0088', attackCooldown: 2.0, xpValue: 8, materialValue: 3, preferredDist: 200, bulletSpeed: 350 },
    { id: 'bomber', name: '自爆者', behavior: 'bomber', hp: 40, speed: 120, damage: 12, radius: 16, color: '#ff5500', glowColor: '#ff2200', attackCooldown: 0, xpValue: 7, materialValue: 2, explosionRadius: 80, explosionDamageMult: 1.5 },
    { id: 'swarm', name: '虫群', behavior: 'swarm', hp: 10, speed: 100, damage: 4, radius: 8, color: '#44ff44', glowColor: '#22ff22', attackCooldown: 0.8, xpValue: 2, materialValue: 1 },
    { id: 'summoner', name: '召唤者', behavior: 'summoner', hp: 50, speed: 65, damage: 5, radius: 14, color: '#aa44ff', glowColor: '#8822ff', attackCooldown: 2.5, summonCooldown: 4.0, maxSummons: 5, xpValue: 15, materialValue: 5 },
    { id: 'splitter_enemy', name: '分裂者', behavior: 'chaser', specialMechanic: 'splitter', hp: 60, speed: 70, damage: 10, radius: 14, color: '#ff44ff', glowColor: '#ff00ff', attackCooldown: 1.5, xpValue: 8, materialValue: 3 },
    { id: 'shielded_enemy', name: '护盾者', behavior: 'chaser', specialMechanic: 'shielded', hp: 80, speed: 50, damage: 8, radius: 18, color: '#4488ff', glowColor: '#2266ff', attackCooldown: 2.0, xpValue: 10, materialValue: 4 },
    { id: 'leech_enemy', name: '吸血者', behavior: 'chaser', specialMechanic: 'leech', hp: 50, speed: 90, damage: 10, radius: 14, color: '#ff0044', glowColor: '#ff0044', attackCooldown: 1.5, xpValue: 10, materialValue: 4 },
    { id: 'reflect_enemy', name: '反伤者', behavior: 'chaser', specialMechanic: 'reflect', hp: 40, speed: 70, damage: 8, radius: 14, color: '#ffaa00', glowColor: '#ff8800', attackCooldown: 1.5, xpValue: 10, materialValue: 4 },
    { id: 'freezer_enemy', name: '冰冻者', behavior: 'chaser', specialMechanic: 'freezer', hp: 35, speed: 75, damage: 6, radius: 12, color: '#44ddff', glowColor: '#22bbff', attackCooldown: 1.5, xpValue: 8, materialValue: 3 },
    { id: 'elite', name: '精英', behavior: 'chaser', hp: 250, speed: 70, damage: 20, radius: 24, color: '#ffcc00', glowColor: '#ffaa00', attackCooldown: 1.0, xpValue: 30, materialValue: 15, isElite: true },
];

// ============================================================
// Setup / Teardown
// ============================================================
beforeEach(() => {
    EnemySystem.enemies = [];
    EnemySystem.types = {};

    // Mock globals
    global.DataLoader = {
        _cache: { enemies: MOCK_ENEMIES },
        async load(name) {
            if (name === 'enemies') return MOCK_ENEMIES;
            return [];
        },
    };

    global.PlayerSystem = {
        player: { x: 200, y: 200, hp: 100, maxHp: 100, radius: 10 },
        takeDamage: vi.fn(),
    };

    global.GameWorld = { width: 960, height: 640 };

    global.BulletSystem = {
        create: vi.fn(),
    };

    global.ParticleSystem = {
        emit: vi.fn(),
    };
});

// ============================================================
// 1. 数据加载
// ============================================================
describe('EnemySystem - 数据加载', () => {
    it('E1: loadEnemies 加载并索引', async () => {
        await EnemySystem.loadEnemies();
        expect(EnemySystem.types['chaser_basic']).toBeDefined();
        expect(EnemySystem.types['runner']).toBeDefined();
        expect(EnemySystem.types['tank']).toBeDefined();
        expect(EnemySystem.types['shooter']).toBeDefined();
        expect(Object.keys(EnemySystem.types).length).toBe(MOCK_ENEMIES.length);
    });

    it('E2: loadEnemies 失败不抛出', async () => {
        global.DataLoader.load = async () => { throw new Error('fail'); };
        await EnemySystem.loadEnemies();
        expect(Object.keys(EnemySystem.types).length).toBe(0);
    });
});

// ============================================================
// 2. 敌人创建
// ============================================================
describe('EnemySystem - 创建', () => {
    beforeEach(async () => {
        await EnemySystem.loadEnemies();
    });

    it('E3: create 返回敌人实例', () => {
        const e = EnemySystem.create('chaser_basic', 100, 100, 1);
        expect(e).toBeDefined();
        expect(e.typeId).toBe('chaser_basic');
        expect(e.x).toBe(100);
        expect(e.y).toBe(100);
        expect(e.alive).toBe(true);
        expect(EnemySystem.enemies.length).toBe(1);
    });

    it('E4: create 未知类型返回 null', () => {
        const e = EnemySystem.create('nonexistent', 100, 100, 1);
        expect(e).toBeNull();
    });

    it('E5: create 应用波次缩放 wave=1', () => {
        const e = EnemySystem.create('chaser_basic', 100, 100, 1);
        // hp = 30 * (1 + 1*0.12) = 33.6 → 33
        expect(e.hp).toBe(33);
        expect(e.maxHp).toBe(33);
        // damage = 8 * (1 + 1*0.10) = 8.8 → 8
        expect(e.damage).toBe(8);
    });

    it('E6: create 应用波次缩放 wave=5', () => {
        const e = EnemySystem.create('chaser_basic', 100, 100, 5);
        // hp = 30 * (1 + 5*0.12) = 30 * 1.6 = 48
        expect(e.hp).toBe(48);
        // damage = 8 * (1 + 5*0.10) = 8 * 1.5 = 12
        expect(e.damage).toBe(12);
    });

    it('E7: create 精英额外缩放 wave=10', () => {
        const e = EnemySystem.create('elite', 100, 100, 10);
        // hp = 250 * (1 + 10*0.12 + (10-10)*0.10) = 250 * 2.2 = 550
        expect(e.hp).toBe(550);
        // damage = 20 * (1 + 10*0.10 + (10-10)*0.10) = 20 * 2.0 = 40
        expect(e.damage).toBe(40);
    });

    it('E8: create 精英 wave=12 额外缩放', () => {
        const e = EnemySystem.create('elite', 100, 100, 12);
        // hp = 250 * (1 + 12*0.12 + (12-10)*0.10) = 250 * (1 + 1.44 + 0.20) = 250 * 2.64 = 660
        expect(e.hp).toBe(660);
        // damage = 20 * (1 + 12*0.10 + (12-10)*0.10) = 20 * (1 + 1.2 + 0.2) = 20 * 2.4 = 48
        expect(e.damage).toBe(48);
    });

    it('E9: createBatch 批量创建', () => {
        const list = [
            { typeId: 'chaser_basic', x: 100, y: 100 },
            { typeId: 'runner', x: 200, y: 200 },
        ];
        const results = EnemySystem.createBatch(list, 1);
        expect(results.length).toBe(2);
        expect(EnemySystem.enemies.length).toBe(2);
    });

    it('E10: createBatch 空列表返回空数组', () => {
        const results = EnemySystem.createBatch([], 1);
        expect(results).toEqual([]);
    });
});

// ============================================================
// 3. 行为测试
// ============================================================
describe('EnemySystem - 行为', () => {
    beforeEach(async () => {
        await EnemySystem.loadEnemies();
    });

    it('E11: chaser 朝玩家移动', () => {
        const e = EnemySystem.create('chaser_basic', 100, 100, 1);
        const px = 200, py = 200;
        const player = { x: px, y: py, hp: 100, maxHp: 100, radius: 10 };
        const oldDist = Math.sqrt((px - e.x) ** 2 + (py - e.y) ** 2);
        EnemySystem.update(1.0, player);
        const newDist = Math.sqrt((px - e.x) ** 2 + (py - e.y) ** 2);
        expect(newDist).toBeLessThan(oldDist);
    });

    it('E12: runner 半血以上追击，半血以下逃离', () => {
        const e = EnemySystem.create('runner', 100, 100, 1);
        const player = { x: 200, y: 200, hp: 100, maxHp: 100, radius: 10 };
        // 满血：追击
        const oldDist = Math.sqrt((200 - e.x) ** 2 + (200 - e.y) ** 2);
        EnemySystem.update(1.0, player);
        const afterChase = Math.sqrt((200 - e.x) ** 2 + (200 - e.y) ** 2);
        expect(afterChase).toBeLessThan(oldDist);

        // 半血以下：逃离
        e.hp = 5;
        e.maxHp = 20;
        const distBeforeFlee = Math.sqrt((200 - e.x) ** 2 + (200 - e.y) ** 2);
        EnemySystem.update(1.0, player);
        const afterFlee = Math.sqrt((200 - e.x) ** 2 + (200 - e.y) ** 2);
        expect(afterFlee).toBeGreaterThan(distBeforeFlee);
    });

    it('E13: tank 正常慢速接近', () => {
        const e = EnemySystem.create('tank', 100, 100, 1);
        const player = { x: 200, y: 200, hp: 100, maxHp: 100, radius: 10 };
        const oldDist = Math.sqrt((200 - e.x) ** 2 + (200 - e.y) ** 2);
        EnemySystem.update(1.0, player);
        const newDist = Math.sqrt((200 - e.x) ** 2 + (200 - e.y) ** 2);
        expect(newDist).toBeLessThan(oldDist);
    });

    it('E14: shooter 射击时调用 BulletSystem', () => {
        const e = EnemySystem.create('shooter', 100, 100, 1);
        e.attackTimer = 0; // 立即射击
        const player = { x: 200, y: 200, hp: 100, maxHp: 100, radius: 10 };
        EnemySystem.update(1.0, player);
        expect(BulletSystem.create).toHaveBeenCalled();
    });

    it('E15: shooter 保持距离', () => {
        const e = EnemySystem.create('shooter', 110, 200, 1);
        const player = { x: 200, y: 200, hp: 100, maxHp: 100, radius: 10 };
        // 距离 < preferredDist(200) - 50，应后退
        const oldDist = Math.sqrt((200 - e.x) ** 2 + (200 - e.y) ** 2);
        expect(oldDist).toBeLessThan(150);
        EnemySystem.update(1.0, player);
        const newDist = Math.sqrt((200 - e.x) ** 2 + (200 - e.y) ** 2);
        expect(newDist).toBeGreaterThan(oldDist);
    });

    it('E16: bomber 接近后爆炸', () => {
        const e = EnemySystem.create('bomber', 195, 200, 1);
        const player = { x: 200, y: 200, hp: 100, maxHp: 100, radius: 10 };
        EnemySystem.update(0.5, player);
        // 触发自爆计时器
        expect(e._bombTimer).toBeGreaterThan(0);
        // 倒计时结束触发爆炸
        EnemySystem.update(0.9, player);
        expect(e.alive).toBe(false);
    });

    it('E17: swarm 朝玩家移动', () => {
        const e = EnemySystem.create('swarm', 100, 100, 1);
        const player = { x: 200, y: 200, hp: 100, maxHp: 100, radius: 10 };
        const oldDist = Math.sqrt((200 - e.x) ** 2 + (200 - e.y) ** 2);
        EnemySystem.update(1.0, player);
        const newDist = Math.sqrt((200 - e.x) ** 2 + (200 - e.y) ** 2);
        expect(newDist).toBeLessThan(oldDist);
    });

    it('E18: summoner 召唤 chaser', () => {
        const e = EnemySystem.create('summoner', 300, 300, 1);
        e.summonTimer = 0; // 立即召唤
        const player = { x: 200, y: 200, hp: 100, maxHp: 100, radius: 10 };
        const before = EnemySystem.enemies.length;
        EnemySystem.update(1.0, player);
        const after = EnemySystem.enemies.length;
        expect(after).toBeGreaterThan(before);
    });

    it('E19: summoner 保持距离（远离玩家）', () => {
        const e = EnemySystem.create('summoner', 100, 100, 1);
        const player = { x: 200, y: 200, hp: 100, maxHp: 100, radius: 10 };
        // 距离 < 200 应后退
        const oldDist = Math.sqrt((200 - e.x) ** 2 + (200 - e.y) ** 2);
        expect(oldDist).toBeLessThan(200);
        EnemySystem.update(1.0, player);
        const newDist = Math.sqrt((200 - e.x) ** 2 + (200 - e.y) ** 2);
        expect(newDist).toBeGreaterThan(oldDist);
    });
});

// ============================================================
// 4. 特殊机制测试
// ============================================================
describe('EnemySystem - 特殊机制', () => {
    beforeEach(async () => {
        await EnemySystem.loadEnemies();
    });

    it('E20: shielded 初始化护盾', () => {
        const e = EnemySystem.create('shielded_enemy', 100, 100, 1);
        expect(e.shieldHp).toBe(e.maxHp * 0.5);
    });

    it('E21: shielded 先扣盾再扣血', () => {
        const e = EnemySystem.create('shielded_enemy', 100, 100, 1);
        const shieldBefore = e.shieldHp;
        EnemySystem.takeDamage(e, 30);
        // 护盾减少
        expect(e.shieldHp).toBeLessThan(shieldBefore);
        // HP 减少少于 30（部分被护盾吸收）
        expect(e.hp).toBeGreaterThan(e.maxHp - 30);
    });

    it('E22: shielded 护盾耗尽后正常扣血', () => {
        const e = EnemySystem.create('shielded_enemy', 100, 100, 1);
        // 耗尽护盾
        EnemySystem.takeDamage(e, 999);
        expect(e.shieldHp).toBe(0);
    });

    it('E23: splitter 死亡后分裂', () => {
        const e = EnemySystem.create('splitter_enemy', 100, 100, 1);
        const before = EnemySystem.enemies.length; // 1
        EnemySystem.takeDamage(e, 9999); // 击杀
        const after = EnemySystem.enemies.length;
        // 敌人 alive=false 仍留在数组 + 分裂 2~3 只 = 3~4 总
        expect(after).toBeGreaterThanOrEqual(3);
        expect(after).toBeLessThanOrEqual(4);
        expect(e.alive).toBe(false);
    });

    it('E24: reflect 反弹伤害给玩家', () => {
        const e = EnemySystem.create('reflect_enemy', 100, 100, 1);
        EnemySystem.takeDamage(e, 50);
        // 20% 反弹 = 10
        expect(PlayerSystem.takeDamage).toHaveBeenCalledWith(10);
    });

    it('E25: leech onAttack 回血 — 通过接触伤害触发', () => {
        const e = EnemySystem.create('leech_enemy', 100, 100, 1);
        e.hp = 10; // 低血量
        const player = { x: 102, y: 100, hp: 100, maxHp: 100, radius: 10 }; // 紧贴
        e.attackTimer = 0; // 立即攻击
        EnemySystem.update(1.0, player);
        // 攻击后应该回血（30% of damage）
        expect(e.hp).toBeGreaterThan(10);
    });

    it('E26: freezer onAttack 减慢目标', () => {
        const e = EnemySystem.create('freezer_enemy', 100, 100, 1);
        const player = { x: 102, y: 100, hp: 100, maxHp: 100, radius: 10 };
        e.attackTimer = 0; // 立即攻击
        EnemySystem.update(1.0, player);
        // player 的 slowTimer 应被设置
        expect(player.slowTimer).toBe(1.5);
        expect(player.slowFactor).toBe(0.5);
    });
});

// ============================================================
// 5. 受击与销毁
// ============================================================
describe('EnemySystem - 受击与销毁', () => {
    beforeEach(async () => {
        await EnemySystem.loadEnemies();
    });

    it('E27: takeDamage 正常扣血', () => {
        const e = EnemySystem.create('chaser_basic', 100, 100, 1);
        const hpBefore = e.hp;
        const result = EnemySystem.takeDamage(e, 10);
        expect(e.hp).toBe(hpBefore - 10);
        expect(result).toBe(0);
    });

    it('E28: takeDamage 击杀返回 -1', () => {
        const e = EnemySystem.create('chaser_basic', 100, 100, 1);
        const result = EnemySystem.takeDamage(e, 9999);
        expect(result).toBe(-1);
        expect(e.alive).toBe(false);
    });

    it('E29: takeDamage 不存活返回 1', () => {
        const e = EnemySystem.create('chaser_basic', 100, 100, 1);
        e.alive = false;
        const result = EnemySystem.takeDamage(e, 10);
        expect(result).toBe(1);
    });

    it('E30: destroy 清除敌人', () => {
        const e = EnemySystem.create('chaser_basic', 100, 100, 1);
        expect(e.alive).toBe(true);
        EnemySystem.destroy(e);
        expect(e.alive).toBe(false);
    });

    it('E31: destroy 触发 splitter onDeath', () => {
        const e = EnemySystem.create('splitter_enemy', 100, 100, 1);
        const before = EnemySystem.enemies.length;
        EnemySystem.destroy(e);
        const after = EnemySystem.enemies.length;
        expect(after).toBeGreaterThan(before);
    });

    it('E32: update 清理 dead 敌人', () => {
        const e = EnemySystem.create('chaser_basic', 100, 100, 1);
        EnemySystem.takeDamage(e, 9999);
        expect(e.alive).toBe(false);
        const player = { x: 200, y: 200, hp: 100, maxHp: 100, radius: 10 };
        EnemySystem.update(1.0, player);
        expect(EnemySystem.enemies.includes(e)).toBe(false);
    });
});

// ============================================================
// 6. 缩放与克制
// ============================================================
describe('EnemySystem - scaleByWave', () => {
    it('E33: wave=1 基础缩放', () => {
        const result = EnemySystem.scaleByWave({ hp: 30, damage: 8, speed: 80 }, 1);
        expect(result.hp).toBe(33); // 30 * 1.12 = 33.6 → 33
        expect(result.damage).toBe(8); // 8 * 1.10 = 8.8 → 8
        expect(result.speed).toBe(83); // 80 * 1.04 = 83.2 → 83
    });

    it('E34: wave=10 精英额外缩放', () => {
        const result = EnemySystem.scaleByWave({ hp: 250, damage: 20, speed: 70, isElite: true }, 10);
        // hp = 250 * (1 + 10*0.12 + 0) = 250 * 2.2 = 550
        expect(result.hp).toBe(550);
        // damage = 20 * (1 + 10*0.10 + 0) = 20 * 2.0 = 40
        expect(result.damage).toBe(40);
    });

    it('E35: wave=12 精英额外缩放', () => {
        const result = EnemySystem.scaleByWave({ hp: 250, damage: 20, speed: 70, isElite: true }, 12);
        // hp = 250 * (1 + 12*0.12 + (12-10)*0.10) = 250 * (1 + 1.44 + 0.20) = 250 * 2.64 = 660
        expect(result.hp).toBe(660);
        // damage = 20 * (1 + 12*0.10 + (12-10)*0.10) = 20 * 2.4 = 48
        expect(result.damage).toBe(48);
    });

    it('E36: wave=15 boss 额外缩放', () => {
        const result = EnemySystem.scaleByWave({ hp: 800, damage: 30, speed: 55, isBoss: true }, 15);
        // hp = 800 * (1 + 15*0.12 + (15-15)*0.15) = 800 * 2.8 = 2240
        expect(result.hp).toBe(2240);
    });

    it('E37: wave=20 boss 额外缩放', () => {
        const result = EnemySystem.scaleByWave({ hp: 800, damage: 30, speed: 55, isBoss: true }, 20);
        // hp = 800 * (1 + 20*0.12 + (20-15)*0.15) = 800 * (1 + 2.4 + 0.75) = 800 * 4.15 = 3320
        expect(result.hp).toBe(3320);
    });
});

describe('EnemySystem - getCounterTypes', () => {
    it('E38: fire+explosive → tank', () => {
        const result = EnemySystem.getCounterTypes({ fire: 2, explosive: 1 });
        expect(result).toContain('tank');
    });

    it('E39: crit → swarm', () => {
        const result = EnemySystem.getCounterTypes({ crit: 2 });
        expect(result).toContain('swarm');
    });

    it('E40: tech → bomber', () => {
        const result = EnemySystem.getCounterTypes({ tech: 2 });
        expect(result).toContain('bomber');
    });

    it('E41: melee → shooter + freezer_chaser', () => {
        const result = EnemySystem.getCounterTypes({ melee: 2 });
        expect(result).toContain('shooter');
        expect(result).toContain('freezer_chaser');
    });

    it('E42: 空返回空数组', () => {
        const result = EnemySystem.getCounterTypes({});
        expect(result).toEqual([]);
    });

    it('E43: null 返回空数组', () => {
        const result = EnemySystem.getCounterTypes(null);
        expect(result).toEqual([]);
    });
});

// ============================================================
// 7. 查询工具
// ============================================================
describe('EnemySystem - 查询', () => {
    beforeEach(async () => {
        await EnemySystem.loadEnemies();
    });

    it('E44: countAlive 正确统计', () => {
        EnemySystem.create('chaser_basic', 100, 100, 1);
        EnemySystem.create('chaser_basic', 200, 200, 1);
        EnemySystem.create('runner', 300, 300, 1);
        expect(EnemySystem.countAlive('chaser_basic')).toBe(2);
        expect(EnemySystem.countAlive('runner')).toBe(1);
        expect(EnemySystem.countAlive('nonexistent')).toBe(0);
    });

    it('E45: clear 清空所有', () => {
        EnemySystem.create('chaser_basic', 100, 100, 1);
        EnemySystem.create('runner', 200, 200, 1);
        EnemySystem.clear();
        expect(EnemySystem.enemies.length).toBe(0);
    });

    it('E46: fireBullet 调用 BulletSystem', () => {
        const e = EnemySystem.create('shooter', 100, 100, 1);
        const player = { x: 200, y: 200 };
        EnemySystem.fireBullet(e, player);
        expect(BulletSystem.create).toHaveBeenCalled();
    });
});

// ============================================================
// 8. 边界情况
// ============================================================
describe('EnemySystem - 边界情况', () => {
    beforeEach(async () => {
        await EnemySystem.loadEnemies();
    });

    it('E47: update 无 player 不报错', () => {
        EnemySystem.create('chaser_basic', 100, 100, 1);
        expect(() => EnemySystem.update(1.0, null)).not.toThrow();
    });

    it('E48: takeDamage 无 enemy 不报错', () => {
        expect(() => EnemySystem.takeDamage(null, 10)).not.toThrow();
    });

    it('E49: 无 BulletSystem 时 shooter 不报错', () => {
        global.BulletSystem = undefined;
        const e = EnemySystem.create('shooter', 100, 100, 1);
        e.attackTimer = 0;
        const player = { x: 200, y: 200, hp: 100, maxHp: 100, radius: 10 };
        expect(() => EnemySystem.update(1.0, player)).not.toThrow();
    });

    it('E50: 无 PlayerSystem 时 takeDamage 不报错', () => {
        global.PlayerSystem = undefined;
        const e = EnemySystem.create('chaser_basic', 100, 100, 1);
        expect(() => EnemySystem.takeDamage(e, 10)).not.toThrow();
    });

    it('E51: chaser 接触玩家造成伤害', () => {
        const e = EnemySystem.create('chaser_basic', 100, 100, 1);
        const player = { x: 100, y: 100, hp: 100, maxHp: 100, radius: 10 }; // 同一位置
        e.attackTimer = 0;
        EnemySystem.update(1.0, player);
        expect(PlayerSystem.takeDamage).toHaveBeenCalledWith(8);
    });
});
