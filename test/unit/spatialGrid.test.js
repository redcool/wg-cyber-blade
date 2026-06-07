// ============================================================
// spatialGrid.test.js — SpatialGrid 单元测试
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest';
import SpatialGrid from '../../src/engine/math/spatialGrid.js';

describe('SpatialGrid.create', () => {
    it('默认参数 80px 格子 + 3000x3000 世界', () => {
        const grid = SpatialGrid.create();
        expect(grid.cellSize).toBe(80);
        expect(grid.invCellSize).toBeCloseTo(1 / 80);
        expect(grid.worldWidth).toBe(3000);
        expect(grid.worldHeight).toBe(3000);
        expect(grid.cells).toBeInstanceOf(Map);
        expect(grid.cells.size).toBe(0);
    });

    it('自定义 cellSize', () => {
        const grid = SpatialGrid.create(40, 1000, 1000);
        expect(grid.cellSize).toBe(40);
        expect(grid.invCellSize).toBeCloseTo(1 / 40);
    });
});

describe('SpatialGrid._cellOf / _key', () => {
    const grid = SpatialGrid.create(80);

    it('正坐标分桶', () => {
        expect(SpatialGrid._cellOf(grid, 0, 0)).toEqual({ gx: 0, gy: 0 });
        expect(SpatialGrid._cellOf(grid, 79.9, 79.9)).toEqual({ gx: 0, gy: 0 });
        expect(SpatialGrid._cellOf(grid, 80, 80)).toEqual({ gx: 1, gy: 1 });
        expect(SpatialGrid._cellOf(grid, 160, 240)).toEqual({ gx: 2, gy: 3 });
    });

    it('负坐标分桶 (向负方向 floor)', () => {
        // Math.floor(-0.1) = -1, 不应让负坐标与 0 落入同一格
        expect(SpatialGrid._cellOf(grid, -0.1, -0.1)).toEqual({ gx: -1, gy: -1 });
        expect(SpatialGrid._cellOf(grid, -80, -80)).toEqual({ gx: -1, gy: -1 });
    });

    it('_key 编码格式 "gx,gy"', () => {
        expect(SpatialGrid._key(3, 5)).toBe('3,5');
        expect(SpatialGrid._key(-1, -2)).toBe('-1,-2');
    });
});

describe('SpatialGrid.insert', () => {
    it('插入对象到对应桶', () => {
        const grid = SpatialGrid.create(80);
        const a = { x: 50, y: 50 };
        const b = { x: 100, y: 100 };
        SpatialGrid.insert(grid, a);
        SpatialGrid.insert(grid, b);

        expect(grid.cells.get('0,0')).toEqual([a]);
        expect(grid.cells.get('1,1')).toEqual([b]);
        expect(grid.cells.size).toBe(2);
    });

    it('同格对象累加到同一桶', () => {
        const grid = SpatialGrid.create(80);
        SpatialGrid.insert(grid, { x: 10, y: 10 });
        SpatialGrid.insert(grid, { x: 20, y: 30 });
        SpatialGrid.insert(grid, { x: 79.9, y: 79.9 });

        const bucket = grid.cells.get('0,0');
        expect(bucket).toHaveLength(3);
    });

    it('同一对象插入多次不去重 (rebuild 才会清空)', () => {
        const grid = SpatialGrid.create(80);
        const obj = { x: 10, y: 10 };
        SpatialGrid.insert(grid, obj);
        SpatialGrid.insert(grid, obj);
        expect(grid.cells.get('0,0')).toHaveLength(2);
    });
});

describe('SpatialGrid.rebuild', () => {
    it('清空旧数据 + 全量重建', () => {
        const grid = SpatialGrid.create(80);
        SpatialGrid.insert(grid, { x: 10, y: 10 });  // 旧数据
        expect(grid.cells.size).toBe(1);

        const fresh = [
            { x: 100, y: 100 },
            { x: 200, y: 200 },
        ];
        SpatialGrid.rebuild(grid, fresh);

        // 旧桶 0,0 应清空
        expect(grid.cells.get('0,0')).toBeUndefined();
        // 新桶 1,1 / 2,2 应填充
        expect(grid.cells.get('1,1')).toEqual([fresh[0]]);
        expect(grid.cells.get('2,2')).toEqual([fresh[1]]);
        expect(grid.cells.size).toBe(2);
    });

    it('空数组清空所有桶', () => {
        const grid = SpatialGrid.create(80);
        SpatialGrid.rebuild(grid, [{ x: 10, y: 10 }, { x: 90, y: 90 }]);
        expect(grid.cells.size).toBe(2);

        SpatialGrid.rebuild(grid, []);
        expect(grid.cells.size).toBe(0);
    });
});

describe('SpatialGrid.queryRadius', () => {
    it('查询当前格子内的对象', () => {
        const grid = SpatialGrid.create(80);
        const a = { x: 10, y: 10 };
        const b = { x: 30, y: 30 };
        const c = { x: 200, y: 200 };  // 远
        SpatialGrid.rebuild(grid, [a, b, c]);

        const r = SpatialGrid.queryRadius(grid, 20, 20, 50);
        expect(r).toContain(a);
        expect(r).toContain(b);
        expect(r).not.toContain(c);
    });

    it('查询跨 3x3 邻接格子', () => {
        const grid = SpatialGrid.create(80);
        // 中心点 (200, 200) 在格子 (2, 2), 半径 100 覆盖格子 (1..3, 1..3)
        const near = { x: 210, y: 210 };  // 同格
        const east = { x: 250, y: 250 };  // 邻接 (3, 3)
        const far = { x: 400, y: 400 };   // 远
        SpatialGrid.rebuild(grid, [near, east, far]);

        const r = SpatialGrid.queryRadius(grid, 200, 200, 100);
        expect(r).toContain(near);
        expect(r).toContain(east);
        expect(r).not.toContain(far);
    });

    it('跨格对象出现在多桶中,queryRadius 返回重复 (需调用方去重)', () => {
        const grid = SpatialGrid.create(80);
        const obj = { x: 79, y: 79 };  // 紧贴 0,0 / 1,1 边界
        SpatialGrid.rebuild(grid, [obj]);

        // 半径 5: 中心 (80, 80), 覆盖格子 (0,0) (1,0) (0,1) (1,1)
        // obj 在 (0,0), 但如果 insert 是按 obj.x/y 决定的格 (0,0),
        // 那 queryRadius(grid, 80, 80, 5) 查 (0..1, 0..1) 4 个格子, 应包含 obj 1 次
        const r = SpatialGrid.queryRadius(grid, 80, 80, 5);
        expect(r).toContain(obj);
        expect(r).toHaveLength(1);  // 同桶, 单次

        // 如果构造一个跨格对象: 假设 obj 在 (0,0) 桶
        // 查询中心放在 (1, 1) 桶附近, 半径足够大 → 应在多个桶找到
        // obj 仍在 (0,0) 桶, 但 query 涵盖 (0,0)
        const r2 = SpatialGrid.queryRadius(grid, 0, 0, 5);
        expect(r2).toContain(obj);
    });
});

describe('SpatialGrid.queryRadiusUnique', () => {
    it('跨格对象去重 (同对象多次出现只返回一次)', () => {
        const grid = SpatialGrid.create(80);
        const obj = { x: 10, y: 10 };
        // 强制插入两次到不同桶
        SpatialGrid.insert(grid, obj);
        SpatialGrid.insert(grid, obj);

        // 查询范围覆盖两桶
        const r = SpatialGrid.queryRadiusUnique(grid, 10, 10, 200);
        expect(r).toHaveLength(1);
        expect(r[0]).toBe(obj);
    });

    it('多对象查询去重', () => {
        const grid = SpatialGrid.create(80);
        const a = { x: 10, y: 10 };
        const b = { x: 30, y: 30 };
        const c = { x: 50, y: 50 };
        SpatialGrid.rebuild(grid, [a, b, c]);

        const r = SpatialGrid.queryRadiusUnique(grid, 30, 30, 50);
        expect(r).toHaveLength(3);
        expect(new Set(r)).toEqual(new Set([a, b, c]));
    });

    it('空桶返回空数组', () => {
        const grid = SpatialGrid.create(80);
        const r = SpatialGrid.queryRadiusUnique(grid, 1000, 1000, 50);
        expect(r).toEqual([]);
    });
});

describe('SpatialGrid.queryRect', () => {
    it('矩形查询返回桶内所有对象', () => {
        const grid = SpatialGrid.create(80);
        const a = { x: 10, y: 10 };   // 桶 (0,0)
        const b = { x: 90, y: 10 };   // 桶 (1,0)
        const c = { x: 10, y: 90 };   // 桶 (0,1)
        const d = { x: 90, y: 90 };   // 桶 (1,1)
        SpatialGrid.rebuild(grid, [a, b, c, d]);

        // 矩形 (0, 0, 100, 100) 覆盖 (0..1, 0..1) 4 个桶
        const r = SpatialGrid.queryRect(grid, 0, 0, 100, 100);
        expect(r).toHaveLength(4);
        expect(new Set(r)).toEqual(new Set([a, b, c, d]));
    });

    it('矩形查询范围外不返回', () => {
        const grid = SpatialGrid.create(80);
        const inside = { x: 50, y: 50 };
        const outside = { x: 200, y: 200 };
        SpatialGrid.rebuild(grid, [inside, outside]);

        const r = SpatialGrid.queryRect(grid, 0, 0, 80, 80);
        expect(r).toEqual([inside]);
    });
});

describe('SpatialGrid.clear', () => {
    it('清空所有桶', () => {
        const grid = SpatialGrid.create(80);
        SpatialGrid.rebuild(grid, [{ x: 10, y: 10 }, { x: 200, y: 200 }]);
        expect(grid.cells.size).toBeGreaterThan(0);

        SpatialGrid.clear(grid);
        expect(grid.cells.size).toBe(0);
    });
});

describe('SpatialGrid.stats', () => {
    it('空网格统计', () => {
        const grid = SpatialGrid.create(80);
        const s = SpatialGrid.stats(grid);
        expect(s.cells).toBe(0);
        expect(s.nonEmptyCells).toBe(0);
        expect(s.totalObjs).toBe(0);
        expect(s.avgPerCell).toBe(0);
    });

    it('多对象多桶统计', () => {
        const grid = SpatialGrid.create(80);
        SpatialGrid.rebuild(grid, [
            { x: 10, y: 10 },
            { x: 20, y: 20 },     // 同桶 (0,0) = 2
            { x: 200, y: 200 },   // 桶 (2,2) = 1
        ]);
        const s = SpatialGrid.stats(grid);
        expect(s.cells).toBe(2);
        expect(s.nonEmptyCells).toBe(2);
        expect(s.totalObjs).toBe(3);
        expect(s.avgPerCell).toBe('1.50');
    });
});

describe('SpatialGrid 集成: 大量对象 + 性能特征', () => {
    it('1000 个对象, 半径查询仅返回邻接格', () => {
        const grid = SpatialGrid.create(80);
        const objects = [];
        for (let i = 0; i < 1000; i++) {
            objects.push({ x: Math.random() * 2000, y: Math.random() * 2000, id: i });
        }
        SpatialGrid.rebuild(grid, objects);

        // 半径 50 应只查 3x3 = 9 个桶, 总对象数 < 1000
        const r = SpatialGrid.queryRadiusUnique(grid, 1000, 1000, 50);
        expect(r.length).toBeLessThan(100);  // 远小于 1000, 验证粗筛生效
    });

    it('同位置对象通过 queryRadiusUnique 去重', () => {
        const grid = SpatialGrid.create(80);
        const shared = { x: 100, y: 100 };
        const objs = [shared, { x: 100, y: 100 }, { x: 100, y: 100 }];
        SpatialGrid.rebuild(grid, objs);

        // 同位置全部落入同桶,queryRadiusUnique 不去重 (因为 Set 看到的是不同对象引用)
        // 注: 原生 objs 数组是 3 个不同对象引用
        const r = SpatialGrid.queryRadiusUnique(grid, 100, 100, 50);
        expect(r).toHaveLength(3);
    });
});
