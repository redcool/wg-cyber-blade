# Module: enemy-boss-wave-optimization

**依赖**: csv2json.cjs (数据链), data.js (DataLoader), DataBundle
**执行顺序**: Step 1→2→3→4→5 顺序执行，每步可独立验证

## Step 1: 修复 wave 系统 `availableBehaviors` → `availableTiers` 映射

**问题**: `_buildTypePool(config)` 读 `config.availableTiers`，但 waves.csv 输出的是 `config.availableBehaviors`（行为名数组）。
结果：`availableTiers = undefined` → 回退 `[1]` → 只生成 basic+fast 两种敌人。

**修复**: 给 `ENEMY_TIERS` 增加从 behavior 到 tier 的反查表，在 `_buildTypePool` 中通过 behavior 名称匹配 tier。

```js
// 新增：behavior → tier 映射
const BEHAVIOR_TIER_MAP = {
    'chase': 1, 'fast': 1,
    'tank': 2, 'ranged': 2, 'explode': 2,
    'heal': 3, 'mortar': 3, 'blink': 3, 'elite': 3,
    'swarm': 1, 'summoner': 3,
};

// 修改 _buildTypePool:
// If config.availableTiers exists → use it (backward compat)
// Else if config.availableBehaviors exists → resolve to tiers from BEHAVIOR_TIER_MAP
// Else → [1] fallback
```

## Step 2: 新增敌人类型到 enemies.csv

### 2a. swarm + summoner（已有 BEHAVIORS 代码但未入 CSV）

```csv
swarm,虫群,swarm,8,110,2,8,#88ff44,#66ff22,2,1,0.8,,,
summoner,召唤者,summoner,20,55,5,16,#ff88ff,#ff66ff,5,2,4.0,,{preferredDist:300}
```

### 2b. 特殊机制敌人类型（作为独立类型，与 random mechanic 二选一）

```csv
splitter,分裂者,chase,18,75,4,14,#ffaa44,#ff8822,3,1,1.5,,,splitter
shielded,护盾者,chase,15,60,3,16,#4488ff,#2266ff,3,1,1.5,,,shielded
leech,吸血者,chase,12,85,4,14,#ff4488,#ff2266,3,1,1.5,,,leech
reflect,反伤者,chase,14,70,5,14,#cc44ff,#aa22ff,3,1,1.5,,,reflect
freezer,冰冻者,chase,12,75,3,14,#44ccff,#22aaff,3,1,1.5,,,freeze
```

### 2c. 更新 ENEMY_TIERS

```js
const ENEMY_TIERS = {
    1: { cost: 1, types: ['basic', 'fast', 'swarm'] },
    2: { cost: 3, types: ['tank', 'ranged', 'exploder'] },
    3: { cost: 5, types: ['healer', 'mortar', 'blinker', 'summoner', 'elite'] },
    4: { cost: 4, types: ['splitter', 'shielded', 'leech', 'reflect', 'freezer'] },
};
```

## Step 3: 修复 heal/blink/mortar 行为

### 3a. Heal（治疗者）
healer 需要：
- 保持距离（preferredDist=250）
- 每 healCooldown 检查附近 120px 内是否有受伤友军
- 如果有，治疗 healAmount HP
- 如果没有受伤友军，正常向玩家移动（作为炮灰）

```js
healer: {
    update(enemy, dt, player) {
        // 保持距离逻辑
        // 每 healCooldown 寻找附近受伤友军并治疗
        // 无治疗目标则当 chaser
    },
},
```

### 3b. Blink（闪现者）
blinker 需要：
- 朝玩家移动（chaser 逻辑）
- 每 blinkCooldown 瞬移到玩家附近随机位置（blinkDist 范围内）
- 闪烁后短暂无敌（0.1s）
- 有 dodgeChance 概率闪避子弹

```js
blinker: {
    update(enemy, dt, player) {
        // 移动 + 闪烁逻辑
        // 闪烁冷却计时
    },
},
```

### 3c. Mortar（迫击者）
mortar 需要：
- 保持距离（preferredDist=350）
- 每 mortarCooldown 发射一枚抛物弹
- 炮弹在目标位置爆炸，范围伤害

```js
mortar: {
    update(enemy, dt, player) {
        // 保持距离 + 发射迫击弹
        // 使用 BulletSystem 或直接范围攻击
    },
},
```

## Step 4: 更新 waves.csv + 波次主题

每一波增加 theme 标签和 new types：

| 波次 | 主题 | 新增 |
|------|------|------|
| 1-2 | 基础波 | basic, fast |
| 3-4 | 混合波 | +ranged, circle 阵型 |
| 5 | 环围波 | circle 阵型 |
| 6-7 | 特殊行为 | +explode, +heal |
| 8-9 | 远程压制 | +mortar, +blink |
| 10 | 分裂波 | +splitter, shielded |
| 11-12 | 精英波 | +swarm, leech |
| 13-14 | 死亡波 | +reflect, summoner |
| 15 | Boss 波 | freeze, Boss |
| 16-20 | 混沌波 | 全类型 |

`availableBehaviors` 列调整：补充 swarm, summoner

## Step 5: Boss 系统扩展

### 5a. 新增 2 个 Boss

**冰霜领主（frostLord）**：
- Phase 1: 近战 sweep + 召唤冰霜小兵
- Phase 2: 冰冻吐息（减速玩家）+ 冰刺 AOE
- Phase 3: 全屏暴风雪（持续伤害）+ 冲锋

**暗影刺客（shadowAssassin）**：
- Phase 1: 快速近战 + 瞬移（blink）
- Phase 2: 投掷暗影匕首（远程）+ 分身
- Phase 3: 全屏暗影爆发 + 吸血模式

### 5b. Boss 随机选择

在 `spawnBoss` 中随机从可用 Boss 列表中选择：

```js
spawnBoss(player) {
    const bossIds = ['fireLord', 'frostLord', 'shadowAssassin'];
    const selected = bossIds[Math.floor(Math.random() * bossIds.length)];
    BossSystem.create(selected, x, y, this.effectiveLevel);
},
```

### 5c. Boss 关门机制

Brotato 风格：Boss 波时，屏幕边缘出现红色屏障，阻止玩家逃出战斗区域。

```js
// 在 renderer.js 中:
// bossWaveActive && 绘制红色屏障边框
// Boss 未死亡则 barrier 持续
// Boss 死亡 → 屏障消失 → 波次结束
```
