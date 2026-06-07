// ============================================================
// src/engine/math/spatialGrid.js - 空间网格 (Spatial Hash Grid)
// ============================================================
// 设计: 80×80 网格, 按对象 .x/.y 自动分桶.
//   - insert(grid, obj): 插入到对应桶 (obj 需有 x, y, radius)
//   - remove(grid, obj): 移除 (按引用比较)
//   - rebuild(grid, objects): 全量重建 (每帧 EnemySystem.update 后)
//   - queryRadius(grid, x, y, radius): 返回半径内的所有对象 (粗筛)
//   - queryRect(grid, x, y, w, h): 矩形查询
//
// 用法: 近战/子弹碰撞先 queryRadius 粗筛, 再 circlesOverlap 精筛.
// 性能: O(N) 重建 + O(K) 查询, K=网格内对象数 << N.
// ============================================================

const SpatialGrid = {
    /** 默认格子大小 (像素) */
    DEFAULT_CELL_SIZE: 80,

    /**
     * 创建空间网格
     * @param {number} cellSize - 格子边长 (像素)
     * @param {number} worldWidth - 世界宽度 (可选, 用于裁剪)
     * @param {number} worldHeight - 世界高度
     * @returns {Object} { cellSize, worldWidth, worldHeight, cells: Map<key, Array<obj>> }
     */
    create(cellSize = 80, worldWidth = 3000, worldHeight = 3000) {
        return {
            cellSize,
            invCellSize: 1 / cellSize,
            worldWidth,
            worldHeight,
            cells: new Map(),  // "x,y" -> [obj, ...]
        };
    },

    /**
     * 计算 (x,y) 所在的格子坐标
     * @returns {{gx:number, gy:number}}
     */
    _cellOf(grid, x, y) {
        return {
            gx: Math.floor(x * grid.invCellSize),
            gy: Math.floor(y * grid.invCellSize),
        };
    },

    /** 格子 key: "gx,gy" */
    _key(gx, gy) {
        return gx + ',' + gy;
    },

    /**
     * 插入对象到网格 (按 x,y 自动分桶, 不去重)
     * @param {Object} grid
     * @param {Object} obj - 必须有 x, y 字段 (radius 可选)
     */
    insert(grid, obj) {
        const { gx, gy } = SpatialGrid._cellOf(grid, obj.x, obj.y);
        const key = SpatialGrid._key(gx, gy);
        let bucket = grid.cells.get(key);
        if (!bucket) {
            bucket = [];
            grid.cells.set(key, bucket);
        }
        bucket.push(obj);
    },

    /**
     * 全量重建: 清空 + 重新插入
     * @param {Object} grid
     * @param {Array<Object>} objects - 对象数组
     */
    rebuild(grid, objects) {
        grid.cells.clear();
        for (const obj of objects) {
            SpatialGrid.insert(grid, obj);
        }
    },

    /**
     * 半径查询: 返回 (x,y) 半径 radius 内所有对象
     * 自动扩展到 3x3 邻接格子 (含当前格子)
     * @param {Object} grid
     * @param {number} x
     * @param {number} y
     * @param {number} radius
     * @returns {Array<Object>} - 可能重复 (同一对象在多个桶), 调用方需去重
     */
    queryRadius(grid, x, y, radius) {
        const minGx = Math.floor((x - radius) * grid.invCellSize);
        const maxGx = Math.floor((x + radius) * grid.invCellSize);
        const minGy = Math.floor((y - radius) * grid.invCellSize);
        const maxGy = Math.floor((y + radius) * grid.invCellSize);

        const result = [];
        for (let gx = minGx; gx <= maxGx; gx++) {
            for (let gy = minGy; gy <= maxGy; gy++) {
                const bucket = grid.cells.get(SpatialGrid._key(gx, gy));
                if (bucket) {
                    for (let i = 0; i < bucket.length; i++) {
                        result.push(bucket[i]);
                    }
                }
            }
        }
        return result;
    },

    /**
     * 半径查询: 返回 (x,y) 半径 radius 内的去重对象数组
     * (用 Map 临时去重, 适用于大查询)
     * @param {Object} grid
     * @param {number} x
     * @param {number} y
     * @param {number} radius
     * @returns {Array<Object>}
     */
    queryRadiusUnique(grid, x, y, radius) {
        const minGx = Math.floor((x - radius) * grid.invCellSize);
        const maxGx = Math.floor((x + radius) * grid.invCellSize);
        const minGy = Math.floor((y - radius) * grid.invCellSize);
        const maxGy = Math.floor((y + radius) * grid.invCellSize);

        const seen = new Set();
        const result = [];
        for (let gx = minGx; gx <= maxGx; gx++) {
            for (let gy = minGy; gy <= maxGy; gy++) {
                const bucket = grid.cells.get(SpatialGrid._key(gx, gy));
                if (bucket) {
                    for (let i = 0; i < bucket.length; i++) {
                        const obj = bucket[i];
                        if (!seen.has(obj)) {
                            seen.add(obj);
                            result.push(obj);
                        }
                    }
                }
            }
        }
        return result;
    },

    /**
     * 矩形查询
     * @param {Object} grid
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @returns {Array<Object>}
     */
    queryRect(grid, x, y, w, h) {
        const minGx = Math.floor(x * grid.invCellSize);
        const maxGx = Math.floor((x + w) * grid.invCellSize);
        const minGy = Math.floor(y * grid.invCellSize);
        const maxGy = Math.floor((y + h) * grid.invCellSize);

        const result = [];
        for (let gx = minGx; gx <= maxGx; gx++) {
            for (let gy = minGy; gy <= maxGy; gy++) {
                const bucket = grid.cells.get(SpatialGrid._key(gx, gy));
                if (bucket) {
                    for (let i = 0; i < bucket.length; i++) {
                        result.push(bucket[i]);
                    }
                }
            }
        }
        return result;
    },

    /**
     * 清空网格
     */
    clear(grid) {
        grid.cells.clear();
    },

    /**
     * 调试: 统计信息
     */
    stats(grid) {
        let totalObjs = 0;
        let nonEmptyCells = 0;
        for (const bucket of grid.cells.values()) {
            if (bucket.length > 0) {
                nonEmptyCells++;
                totalObjs += bucket.length;
            }
        }
        return {
            cells: grid.cells.size,
            nonEmptyCells,
            totalObjs,
            avgPerCell: nonEmptyCells > 0 ? (totalObjs / nonEmptyCells).toFixed(2) : 0,
        };
    },
};

// CommonJS / global 双导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SpatialGrid;
} else if (typeof window !== 'undefined') {
    window.SpatialGrid = SpatialGrid;
}
