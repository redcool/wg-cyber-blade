// ============================================================
// src/engine/wave.js — 波次系统（Budget 制 + 4 SpawnPattern + 难度曲线）
// 依赖: data.js (DataLoader), enemy.js (EnemySystem), tags.js (TagSystem)
// ============================================================

/**
 * WaveSystem — 波次系统
 *
 * API:
 *   async loadWaves()                  加载波次配置
 *   startNextLevel()                   开始下一波
 *   endWave()                          结束当前波
 *   update(dt, player)                 每帧更新
 *   getAliveCount()                    存活敌人数
 *   getRemainingTime()                 剩余时间
 *   isBossWave()                       是否 Boss 波
 *   reset()                            重置
 *
 * 4 种生成模式: random / circle / fixed / wave
 * Budget 制: budget = waveNumber × 10 × budgetMul
 */

// ============================================================
// 4 种 SpawnPattern
// ============================================================
const SPAWN_PATTERNS = {
    /** 随机分散生成 */
    random: {
        getPositions(count, player) {
            const positions = [];
            const cx = player ? player.x : 480;
            const cy = player ? player.y : 300;
            for (let i = 0; i < count; i++) {
                let x, y, valid;
                let attempts = 0;
                do {
                    const angle = Math.random() * Math.PI * 2;
                    const dist = 350 + Math.random() * 200; // 350~550
                    x = cx + Math.cos(angle) * dist;
                    y = cy + Math.sin(angle) * dist;
                    valid = true;
                    // 保证间距 ≥ 80
                    for (const pos of positions) {
                        const dx = x - pos.x;
                        const dy = y - pos.y;
                        if (Math.sqrt(dx * dx + dy * dy) < 80) {
                            valid = false;
                            break;
                        }
                    }
                    attempts++;
                } while (!valid && attempts < 10);
                positions.push({ x, y });
            }
            return positions;
        },
    },

    /** 环形包围 */
    circle: {
        getPositions(count, player) {
            const positions = [];
            const cx = player ? player.x : 480;
            const cy = player ? player.y : 300;
            const dist = 400; // 350~450 中间值
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.52; // ±15°
                const x = cx + Math.cos(angle) * (dist + (Math.random() - 0.5) * 100);
                const y = cy + Math.sin(angle) * (dist + (Math.random() - 0.5) * 100);
                positions.push({ x, y });
            }
            return positions;
        },
    },

    /** 定点刷怪（地图边缘/角落） */
    fixed: {
        getPositions(count, player) {
            const FIXED_POINTS = [
                { x: 30, y: 30 }, { x: 930, y: 30 },
                { x: 30, y: 570 }, { x: 930, y: 570 },
                { x: 480, y: 30 }, { x: 480, y: 570 },
                { x: 30, y: 300 }, { x: 930, y: 300 },
            ];
            // 随机选 count 个不重复
            const shuffled = [...FIXED_POINTS].sort(() => Math.random() - 0.5);
            return shuffled.slice(0, Math.min(count, shuffled.length));
        },
    },

    /** 波浪推进（同一边连续生成） */
    wave: {
        getPositions(count, player) {
            const positions = [];
            const directions = [
                { x: 480, y: 10 },   // 上
                { x: 480, y: 590 },  // 下
                { x: 10, y: 300 },   // 左
                { x: 950, y: 300 },  // 右
            ];
            const dir = directions[Math.floor(Math.random() * directions.length)];

            // 沿该方向边界均匀分布
            const isHorizontal = dir.y === 10 || dir.y === 590;
            const minC = isHorizontal ? 60 : 60;
            const maxC = isHorizontal ? 900 : 540;
            for (let i = 0; i < count; i++) {
                const t = (i + 0.5) / count;
                const pos = {
                    x: isHorizontal ? minC + t * (maxC - minC) : dir.x,
                    y: isHorizontal ? dir.y : minC + t * (maxC - minC),
                };
                pos.delay = i * 0.3; // 间隔 0.3s 激活
                positions.push(pos);
            }
            return positions;
        },
    },
};

// ============================================================
// 敌人 Cost 分级
// ============================================================
const ENEMY_TIERS = {
    1: { cost: 1, types: ['basic', 'fast'] },
    2: { cost: 3, types: ['tank', 'ranged', 'exploder'] },
    3: { cost: 5, types: ['healer', 'mortar', 'blinker', 'elite'] },
};

// ============================================================
// 波次难度曲线
// ============================================================
const WAVE_INTERVALS = {
    1:  { budgetMul: 1.0,  availableTiers: [1],         pattern: 'random' },
    2:  { budgetMul: 1.2,  availableTiers: [1],         pattern: 'random' },
    3:  { budgetMul: 1.4,  availableTiers: [1],         pattern: 'random' },
    4:  { budgetMul: 1.6,  availableTiers: [1, 2],     pattern: 'circle' },
    5:  { budgetMul: 2.0,  availableTiers: [1, 2],     pattern: 'circle' },
    6:  { budgetMul: 1.8,  availableTiers: [1, 2],     pattern: 'random' },
    7:  { budgetMul: 2.0,  availableTiers: [1, 2],     pattern: 'random' },
    8:  { budgetMul: 2.2,  availableTiers: [1, 2],     pattern: 'circle' },
    9:  { budgetMul: 2.4,  availableTiers: [1, 2, 3],  pattern: 'circle' },
    10: { budgetMul: 3.0,  availableTiers: [1, 2, 3],  pattern: 'wave' },
    11: { budgetMul: 2.6,  availableTiers: [1, 2, 3],  pattern: 'random' },
    12: { budgetMul: 2.8,  availableTiers: [1, 2, 3],  pattern: 'fixed' },
    13: { budgetMul: 3.0,  availableTiers: [1, 2, 3],  pattern: 'circle' },
    14: { budgetMul: 3.2,  availableTiers: [1, 2, 3],  pattern: 'wave' },
    15: { budgetMul: 4.0,  availableTiers: [1, 2, 3],  pattern: 'wave' },
};

// ============================================================
// WaveSystem 主对象
// ============================================================
const WaveSystem = {
    /** 当前波次 */
    currentLevel: 0,

    /** 难度偏移(0-10)，叠加到波次缩放 */
    difficultyOffset: 0,

    /** 有效波次等级（含难度偏移） */
    get effectiveLevel() { return this.currentLevel + (this.difficultyOffset || 0); },

    /** 波次持续时间（秒）——从 level_duration.json 加载，默认 30 */
    get levelDuration() {
        return this._durationMap[this.currentLevel] || this._defaultDuration;
    },
    _durationMap: {},
    _defaultDuration: 30,

    /** 波次计时器 */
    waveTimer: 0,

    /** 生成计时器 */
    spawnTimer: 0,

    /** 波次激活 */
    waveActive: false,

    /** 波次过渡中 */
    waveTransitioning: false,

    /** 本波余下预算 */
    _remainingBudget: 0,

    /** Boss 已生成 */
    _bossSpawned: false,

    /** 为 Boss 预留的预算 */
    _bossWaveBudget: 0,

    /** 波次配置 */
    _waveConfigs: [],

    // -------------------------------------------------------
    // 数据加载
    // -------------------------------------------------------

    /**
     * 加载波次配置
     */
    async loadWaves() {
        try {
            const data = await DataLoader.load('waves');
            this._waveConfigs = data;
        } catch (e) {
            console.warn('[WaveSystem] 加载波次配置失败:', e.message);
            this._waveConfigs = [];
        }
        // 加载关卡限时：找到配置数据则使用，否则使用 default 项
        try {
            const durData = await DataLoader.load('level_duration');
            this._durationMap = {};
            this._defaultDuration = 30;
            for (const entry of durData) {
                if (entry.level === 'default') {
                    this._defaultDuration = entry.duration;
                } else {
                    this._durationMap[entry.level] = entry.duration;
                }
            }
        } catch (e) {
            console.warn('[WaveSystem] 加载关卡限时失败:', e.message);
        }
    },

    // -------------------------------------------------------
    // 计算属性
    // -------------------------------------------------------

    /** 生成间隔（随波次递减） */
    get spawnInterval() {
        return Math.max(0.3, 1.5 - (this.currentLevel - 1) * 0.03);
    },

    /** 每批生成数量 */
    get spawnsPerBatch() {
        const lv = this.currentLevel;
        if (lv <= 3) return 2;
        if (lv <= 6) return 3;
        if (lv <= 10) return 4;
        if (lv <= 15) return 5;
        return 6;
    },

    /** 同屏上限 */
    get maxSimultaneous() {
        return Math.min(40, 8 + Math.floor(this.currentLevel * 1.5));
    },

    // -------------------------------------------------------
    // 波次控制
    // -------------------------------------------------------

    /**
     * 开始下一波
     */
    startNextLevel() {
        this.currentLevel++;
        const config = this._getConfig();

        // 支持两种配置格式：WAVE_INTERVALS 用 budgetMul，waves.json 用 minBudget/maxBudget
        if (config && config.minBudget !== undefined && config.maxBudget !== undefined) {
            const avgBudget = (config.minBudget + config.maxBudget) / 2;
            this._remainingBudget = Math.floor(avgBudget * this.effectiveLevel);
        } else {
            const baseBudget = 10;
            const budgetMul = config ? config.budgetMul : 1.0;
            this._remainingBudget = Math.floor(baseBudget * budgetMul * this.effectiveLevel);
        }

        // Boss 波: 预留 10 budget
        this._bossSpawned = false;
        this._bossWaveBudget = 0;
        if (this.isBossWave()) {
            this._bossWaveBudget = 10;
            this._remainingBudget -= 10;
        }

        this.waveActive = true;
        this.waveTimer = 0;
        this.spawnTimer = 0;
        this.waveTransitioning = false;
        return true;
    },

    /**
     * 波次结束
     */
    endWave() {
        this.waveActive = false;
        this.waveTransitioning = true;
        this._remainingBudget = 0;
        this._bossSpawned = false;

        // 清理场上敌人（不掉材料）
        if (typeof EnemySystem !== 'undefined') {
            EnemySystem.enemies = [];
        }
    },

    // -------------------------------------------------------
    // 每帧更新
    // -------------------------------------------------------

    /**
     * 更新波次
     */
    update(dt, player) {
        if (!this.waveActive) return;

        this.waveTimer += dt;
        this.spawnTimer += dt;

        // Boss 波: 4s 后生成 Boss
        if (this.isBossWave() && this.waveTimer > 4 && !this._bossSpawned) {
            this.spawnBoss(player);
            this._bossSpawned = true;
        }

        // 生成敌人
        if (this.spawnTimer >= this.spawnInterval) {
            this.spawnTimer = 0;
            const alive = (typeof EnemySystem !== 'undefined')
                ? EnemySystem.enemies.filter(e => e.alive).length
                : 0;
            if (this._remainingBudget > 0 && alive < this.maxSimultaneous) {
                this._spawnBatch(player);
            }
        }

        // 检查结束条件
        const aliveCount = (typeof EnemySystem !== 'undefined')
            ? EnemySystem.enemies.filter(e => e.alive).length
            : 0;
        if (this._remainingBudget <= 0 && aliveCount === 0) {
            this.endWave();
        } else if (this.waveTimer >= this.levelDuration) {
            // 安全超时
            this.endWave();
        }
    },

    // -------------------------------------------------------
    // 敌人生成
    // -------------------------------------------------------

    /**
     * 生成一批敌人
     */
    _spawnBatch(player) {
        const config = this._getConfig();
        if (!config) return;

        const count = Math.min(this.spawnsPerBatch, Math.ceil(this._remainingBudget));
        if (count <= 0) return;

        const pattern = config.pattern || 'random';
        const positions = SPAWN_PATTERNS[pattern].getPositions(count, player);
        const spawnList = [];

        // 计算 Build 克制类型
        let counterTypes = [];
        if (typeof TagSystem !== 'undefined' && typeof EnemySystem !== 'undefined' && player) {
            const weaponCounts = TagSystem.countWeaponTags(player.weapons || []);
            const itemCounts = TagSystem.countItemTags(player.items || []);
            const tagCounts = TagSystem.mergeTagCounts(weaponCounts, itemCounts);
            counterTypes = EnemySystem.getCounterTypes(tagCounts);
        }

        for (let i = 0; i < positions.length; i++) {
            if (this._remainingBudget <= 0) break;

            let typeId = null;
            const useCounter = counterTypes.length > 0 && Math.random() < 0.3;

            if (useCounter) {
                typeId = counterTypes[Math.floor(Math.random() * counterTypes.length)];
            }

            if (!typeId) {
                // 从可用 Tier 中选
                const tiers = config.availableTiers || [1];
                const tier = tiers[Math.floor(Math.random() * tiers.length)];
                const tierDef = ENEMY_TIERS[tier];
                if (tierDef) {
                    typeId = tierDef.types[Math.floor(Math.random() * tierDef.types.length)];
                }
            }

            if (typeId) {
                const cost = this._getCostForType(typeId);
                if (cost > 0 && this._remainingBudget >= cost) {
                    spawnList.push({ typeId, x: positions[i].x, y: positions[i].y });
                    this._remainingBudget -= cost;
                }
            }
        }

        if (spawnList.length > 0 && typeof EnemySystem !== 'undefined') {
            EnemySystem.createBatch(spawnList, this.effectiveLevel);
        }
    },

    /**
     * 生成 Boss（由波次系统调用）
     */
    spawnBoss(player) {
        if (typeof EnemySystem === 'undefined') return;
        // 使用 Boss 配置：在 Boss 波使用 'boss' 类型
        const x = player ? player.x + (Math.random() - 0.5) * 200 : 480;
        const y = player ? player.y - 200 : 100;
            EnemySystem.create('boss', x, y, this.effectiveLevel);
    },

    /**
     * 获取敌人类型的 cost
     */
    _getCostForType(typeId) {
        for (const tier of Object.values(ENEMY_TIERS)) {
            if (tier.types.includes(typeId)) return tier.cost;
        }
        return 1; // 默认 cost
    },

    /**
     * 获取当前波次配置
     */
    _getConfig() {
        // 优先从配置文件获取
        if (this._waveConfigs && this._waveConfigs.length > 0) {
            const idx = this.currentLevel - 1;
            if (idx >= 0 && idx < this._waveConfigs.length) {
                return this._waveConfigs[idx];
            }
        }
        // 从难度曲线获取
        const interval = WAVE_INTERVALS[this.currentLevel];
        if (interval) return interval;
        // 16+ 公式
        return {
            budgetMul: 4 + (this.currentLevel - 15) * 0.5,
            availableTiers: [1, 2, 3],
            pattern: 'random',
        };
    },

    // -------------------------------------------------------
    // 查询
    // -------------------------------------------------------

    /** 存活敌人总数 */
    getAliveCount() {
        if (typeof EnemySystem === 'undefined') return 0;
        return EnemySystem.enemies.filter(e => e.alive).length;
    },

    /** 波次剩余时间（60s 上限） */
    getRemainingTime() {
        return Math.max(0, 60 - this.waveTimer);
    },

    /** 是否 Boss 波 */
    isBossWave() {
        return this.currentLevel > 0 && this.currentLevel % 5 === 0;
    },

    // -------------------------------------------------------
    // 重置
    // -------------------------------------------------------

    reset() {
        this.currentLevel = 0;
        this.difficultyOffset = 0;
        this.waveActive = false;
        this.waveTransitioning = false;
        this.waveTimer = 0;
        this.spawnTimer = 0;
        this._bossSpawned = false;
        this._remainingBudget = 0;
        this._bossWaveBudget = 0;
    },
};

// ============================================================
// 导出
// ============================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WaveSystem, SPAWN_PATTERNS, ENEMY_TIERS, WAVE_INTERVALS };
}
