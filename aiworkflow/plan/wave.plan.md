# Module: wave — 波次系统重做（Budget 制 + 4 种 SpawnPattern + 难度曲线）

**依赖**: data.js, enemy.js, tags.js
**执行顺序**: 11（等 enemy.js 就绪）

---

## 一、从时间驱动到预算驱动

### 旧系统

```
每波固定时长 (30s/40s)，按 spawnInterval 定时生成，spawnsPerTick 控制数量
```

问题：
- 时长固定，玩家流派不同但无差异化
- 生成模式单一（纯随机位置）
- 敌人类型由硬编码 unlock 表决定
- 无 Build 克制逻辑

### 新系统

```
每波分配 budget = WaveNumber × 10
每个敌人类型有 cost（Tier 1=1, Tier 2=3, Tier 3=5, Boss=10）
while remainingBudget > 0: 选敌人 → spawn → budget -= cost
按 SpawnPattern 决定生成位置
每波至少 30% enemy budget 留给克制型敌人
```

---

## 二、SpawnPattern（4 种生成模式）

```js
const SPAWN_PATTERNS = {
    random: {
        desc: '随机分散生成（默认）',
        getPositions(count, player) {
            // 算法:
            // 1. 生成 count 个位置
            // 2. 每个位置: 距离玩家 350~550，随机角度
            // 3. 保证两两间距 ≥ 80（避免堆叠）
        }
    },
    circle: {
        desc: '环形包围',
        getPositions(count, player) {
            // 算法:
            // 1. count 个位置均匀分布在玩家周围 360° 圆环上
            // 2. 距离: 350~450
            // 3. 角度: i/count × 360° + 随机偏移 ±15°
        }
    },
    fixed: {
        desc: '定点刷怪（从地图边缘/角落生成）',
        getPositions(count, player) {
            // 算法:
            // 1. 从预定义的 8 个固定点（4 角 + 4 边中点）随机选 count 个
            // 2. 固定点: [{x:30,y:30}, {x:930,y:30}, {x:30,y:570}, ...]
        }
    },
    wave: {
        desc: '波浪推进（同一边连续生成）',
        getPositions(count, player) {
            // 算法:
            // 1. 随机选一个方向（上/下/左/右）
            // 2. 沿该方向边界均匀分布 count 个位置
            // 3. 生成后间隔 0.3s 逐一激活（波浪效果）
        }
    },
};
```

---

## 三、敌人 Cost 分级

```js
const ENEMY_TIERS = {
    1: { cost: 1, types: ['chaser_basic', 'runner'] },         // chaser, runner
    2: { cost: 3, types: ['tank', 'shooter', 'bomber'] },       // tank, shooter, bomber
    3: { cost: 5, types: ['swarm', 'summoner', 'elite'] },      // swarm, summoner, elite
    4: { cost: 10, types: ['boss'] },                            // 仅 Boss
};
```

---

## 四、难度曲线

```js
const WAVE_CONFIG = {
    // 每 5 波的配置
    intervals: {
        1:  { budgetMul: 1.0,  availableTiers: [1],         pattern: 'random' },
        2:  { budgetMul: 1.2,  availableTiers: [1],         pattern: 'random' },
        3:  { budgetMul: 1.4,  availableTiers: [1],         pattern: 'random' },
        4:  { budgetMul: 1.6,  availableTiers: [1, 2],     pattern: 'circle' },
        5:  { budgetMul: 2.0,  availableTiers: [1, 2],     pattern: 'circle' },     // Boss 波
        6:  { budgetMul: 1.8,  availableTiers: [1, 2],     pattern: 'random' },
        7:  { budgetMul: 2.0,  availableTiers: [1, 2],     pattern: 'random' },
        8:  { budgetMul: 2.2,  availableTiers: [1, 2],     pattern: 'circle' },
        9:  { budgetMul: 2.4,  availableTiers: [1, 2, 3],  pattern: 'circle' },
        10: { budgetMul: 3.0,  availableTiers: [1, 2, 3],  pattern: 'wave' },       // Boss 波
        11: { budgetMul: 2.6,  availableTiers: [1, 2, 3],  pattern: 'random' },
        12: { budgetMul: 2.8,  availableTiers: [1, 2, 3],  pattern: 'fixed' },
        13: { budgetMul: 3.0,  availableTiers: [1, 2, 3],  pattern: 'circle' },
        14: { budgetMul: 3.2,  availableTiers: [1, 2, 3],  pattern: 'wave' },
        15: { budgetMul: 4.0,  availableTiers: [1, 2, 3],  pattern: 'wave' },       // Boss 波
        // 16+ 使用公式: budgetMul = 4 + (wave - 15) × 0.5
    },

    /** 每波基础预算 */
    baseBudget: 10,
};
```

---

## 五、波次数据结构（waves.json）

```json
{
    "waveNumber": 5,
    "minBudget": 40,
    "maxBudget": 55,
    "availableBehaviors": ["chaser", "runner", "tank", "shooter"],
    "availableMechanics": [],
    "spawnPattern": "circle",
    "specialRule": ""
}
```

（来自 csv2json 转换结果）

---

## 六、接口定义

```js
const WaveSystem = {
    /** 当前波次 */
    currentLevel: 0,

    /** 波次计时器 */
    waveTimer: 0,

    /** 生成计时器 */
    spawnTimer: 0,

    /** 波次激活状态 */
    waveActive: false,

    /** 波次过渡中 */
    waveTransitioning: false,

    /** 本波余下预算 */
    _remainingBudget: 0,

    /** Boss 是否已生成 */
    _bossSpawned: false,

    /** 波次配置（从 waves.json 加载） */
    _waveConfigs: [],


    // -------------------------------------------------------
    // 6.1 数据加载
    // -------------------------------------------------------

    async loadWaves() {
        // const data = await DataLoader.load('waves')
        // this._waveConfigs = data
    },


    // -------------------------------------------------------
    // 6.2 波次控制
    // -------------------------------------------------------

    /**
     * 开始下一波
     *
     * 算法:
     * 1. currentLevel++
     * 2. 查找波次配置（_waveConfigs[waveNumber-1]）
     * 3. 计算预算: baseBudget × budgetMul × (minBudget 到 maxBudget 之间随机)
     * 4. _remainingBudget = 计算后的预算
     * 5. 如果 specialRule === 'bossEvery5' 且 waveNumber % 5 === 0:
     *    预留 10 budget 给 Boss（在波次开始 4 秒后生成）
     * 6. 初始化 waveActive, waveTimer, spawnTimer, _bossSpawned
     * 7. 生成医药箱（保持旧逻辑: 2 + random(0~1) 个）
     * 8. 返回 true
     */
    startNextLevel() {},

    /**
     * 波次结束
     *
     * 算法:
     * 1. waveActive = false, waveTransitioning = true
     * 2. 清理场上敌人（不掉材料）
     * 3. 清理子弹
     * 4. 清理金币（main.js 中已有 _cleanupWave）
     */
    endWave() {},


    // -------------------------------------------------------
    // 6.3 每帧更新
    // -------------------------------------------------------

    /**
     * 更新波次
     * @param {number} dt
     * @param {Object} player
     *
     * 算法:
     * 1. if !waveActive → 返回
     * 2. waveTimer += dt
     * 3. spawnTimer += dt
     * 4. 检查 Boss 生成条件:
     *    if Boss波 && waveTimer > 4s && !_bossSpawned:
     *      spawnBoss(), _bossSpawned = true
     * 5. 如果 spawnTimer >= spawnInterval:
     *    if _remainingBudget > 0 && 场上敌人 < maxSimultaneous:
     *      _spawnBatch()
     *      spawnTimer = 0
     * 6. 检查波次结束条件:
     *    if _remainingBudget == 0 && 场上敌人全部死亡:
     *      endWave()
     *    OR
     *    if waveTimer >= maxWaveTime (60s):
     *      endWave() // 避免无限卡波
     */
    update(dt, player) {},


    // -------------------------------------------------------
    // 6.4 敌人生成
    // -------------------------------------------------------

    /**
     * 生成一批敌人
     *
     * 算法:
     * 1. 获取当前波次配置
     * 2. 确定生成数量: min(spawnsPerBatch, budget能买几个)
     * 3. 选敌人类型:
     *    a. 70% 概率: 从 availableBehaviors 中加权随机选
     *    b. 30% 概率: 从 counter types 中选（Build 克制）
     *    c. 如果有 availableMechanics: 20% 概率选 mechanism 敌人
     * 4. 获取生成位置: SPAWN_PATTERNS[pattern].getPositions(count, player)
     * 5. EnemySystem.createBatch(spawnList, currentLevel)
     * 6. _remainingBudget -= usedCost
     */
    _spawnBatch() {},

    /**
     * 生成 Boss
     *
     * 算法:
     * 1. 获取 Boss 配置
     * 2. 生成在波次配置中指定的位置（默认为随机位置）
     * 3. BossSystem.create(bossId, x, y, currentLevel)
     */
    spawnBoss() {},


    // -------------------------------------------------------
    // 6.5 查询
    // -------------------------------------------------------

    /** 获取场上存活敌人总数 */
    getAliveCount() {},

    /** 获取波次剩余时间 */
    getRemainingTime() {},

    /** 是否 Boss 波 */
    isBossWave() {
        return this.currentLevel % 5 === 0;
    },


    // -------------------------------------------------------
    // 6.6 重置
    // -------------------------------------------------------

    reset() {
        this.currentLevel = 0;
        this.waveActive = false;
        this.waveTransitioning = false;
        this._bossSpawned = false;
        this._remainingBudget = 0;
    },
};
```

---

## 七、生成间隔与同屏上限

```js
// 生成间隔（随波次递减）:
get spawnInterval() {
    return Math.max(0.3, 1.5 - (this.currentLevel - 1) * 0.03);
}

// 每批生成数量:
get spawnsPerBatch() {
    const lv = this.currentLevel;
    if (lv <= 3) return 2;
    if (lv <= 6) return 3;
    if (lv <= 10) return 4;
    if (lv <= 15) return 5;
    return 6;
}

// 同屏上限:
get maxSimultaneous() {
    return Math.min(40, 8 + Math.floor(this.currentLevel * 1.5));
}
```

---

## 八、验收标准

- [ ] Budget 制正确: 每波总 cost = wave × 10 × budgetMul 范围内
- [ ] 4 种 SpawnPattern 全部正确（位置不重叠、不离玩家太近）
- [ ] 波次在 budget 耗尽 + 敌人全灭时结束（非固定时间）
- [ ] 最大波次时长 60s（超时自动结束，防止卡关）
- [ ] Boss 波在 4 秒后生成 Boss
- [ ] Build 克制: 30% 的 budget 用于 counter types
- [ ] 敌人 Cost 分级正确（T1=1, T2=3, T3=5, Boss=10）
- [ ] 难度曲线: 波次越高，敌人越多/越强
- [ ] 旧 wave.js 的硬编码 _availableTypes/_pickWeightedType 被删除