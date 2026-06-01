# Module: boss — Boss 系统（多阶段 + 技能组合 + 强制移动）

**依赖**: data.js, enemy.js, stats.js
**执行顺序**: 12（等 enemy.js + wave.js 就绪）

---

## 一、核心设计

```
Boss = {
    base stats (HP, speed, damage, radius),
    3 phases (每个阶段独立行为 + 技能),
    HP 阈值触发阶段切换,
    每阶段结束 → 强制全场 AoE + 短暂无敌,
    死亡 → 必掉传奇宝箱,
}
```

---

## 二、Boss 阶段模型

```json
// bosses.json 中的 fireLord
{
    "id": "fireLord",
    "name": "火焰领主",
    "baseHp": 1500,
    "baseSpeed": 40,
    "baseDamage": 25,
    "radius": 40,
    "color": "#ff4400",
    "glowColor": "#ff2200",
    "xpValue": 200,
    "materialValue": 100,
    "phaseCount": 3,
    "phases": [
        {
            "hpPercent": 100,
            "name": "烈焰之息",
            "behavior": "boss_chase",
            "skills": [
                { "type": "melee_sweep", "damageMult": 1.0, "range": 100 },
                { "type": "summon", "count": 3, "enemyType": "chaser_basic" }
            ],
            "moveSpeed": 40,
            "attackInterval": 1.5,
            "transitions": {
                "enterFx": { "type": "explosion", "color": "#ff4400", "radius": 120 }
            }
        },
        {
            "hpPercent": 70,
            "name": "地狱之火",
            "behavior": "boss_ranged",
            "skills": [
                { "type": "fire_breath", "damageMult": 1.5, "coneAngle": 0.8, "range": 200, "burnDps": 10, "burnDuration": 3.0 },
                { "type": "summon", "count": 5, "enemyType": "runner" }
            ],
            "moveSpeed": 35,
            "attackInterval": 1.2,
            "transitions": {
                "enterFx": { "type": "screenFlash", "color": "#ff2200" }
            }
        },
        {
            "hpPercent": 30,
            "name": "焚天灭世",
            "behavior": "boss_rage",
            "skills": [
                { "type": "fire_storm", "damageMult": 2.0, "radius": 250, "projectiles": 12 },
                { "type": "charge", "damageMult": 2.5, "range": 300, "speed": 500 }
            ],
            "moveSpeed": 55,
            "attackInterval": 0.8,
            "transitions": {
                "enterFx": { "type": "arenaFire", "color": "#ff0000" }
            }
        }
    ]
}
```

---

## 三、Boss 行为类型

区别于普通敌人，Boss 有专属行为：

```js
const BOSS_BEHAVIORS = {
    boss_chase: {
        desc: '追击 + 周期性近战技能',
        update(boss, dt, player) {
            // 1. 朝玩家移动
            // 2. 技能冷却到期 → 执行技能队列中的下一个技能
            // 3. 技能之间间隔 0.3~0.5s
        }
    },
    boss_ranged: {
        desc: '保持距离 + 远程技能',
        update(boss, dt, player) {
            // 1. 保持 preferredDist = 200~300 的距离
            // 2. 距离合适时释放远程技能
            // 3. 玩家靠近时短暂后退
        }
    },
    boss_rage: {
        desc: '狂暴追击 + 全屏技能',
        update(boss, dt, player) {
            // 1. 移速 ×1.5
            // 2. 攻击间隔 ×0.6
            // 3. 周期性释放大范围 AoE
            // 4. 低于 10% HP 时: 每 2 秒额外释放一次 fire_storm
        }
    },
};
```

---

## 四、Boss 技能类型

```js
const BOSS_SKILLS = {
    melee_sweep: {
        desc: '扇形近战攻击',
        execute(boss, player, skill) {
            // 1. 以 Boss 为中心，朝玩家方向 180° 扇形
            // 2. 伤害 = boss.damage × skill.damageMult
            // 3. 击退玩家: knockbackX += cos(angle) × 300
            // 4. 显示红色扇形特效
        }
    },
    fire_breath: {
        desc: '锥形火焰喷射',
        execute(boss, player, skill) {
            // 1. 朝玩家方向喷射锥形火焰 (angle ± coneAngle/2)
            // 2. 持续 1.5s，每 0.15s 判定一次伤害
            // 3. 每击附加燃烧: applyBurn(player, burnDps, burnDuration, 3)
            // 4. 显示橙色锥形粒子特效
        }
    },
    fire_storm: {
        desc: '全屏火雨',
        execute(boss, player, skill) {
            // 1. 在 Boss 周围 radius 范围内生成 projectiles 个火球
            // 2. 火球从 Boss 位置向外扩散
            // 3. 每个火球伤害 = boss.damage × damageMult
            // 4. 火球击中玩家或边界后消失
            // 5. 显示红色弹幕特效
        }
    },
    charge: {
        desc: '蓄力冲锋',
        execute(boss, player, skill) {
            // 1. 蓄力 0.8s（Boss 变大 + 闪烁）
            // 2. 朝玩家方向高速冲刺 range 距离
            // 3. 路径上造成伤害
            // 4. 冲刺结束后短暂硬直 0.3s
            // 5. 显示冲击波特效
        }
    },
    summon: {
        desc: '召唤小怪',
        execute(boss, player, skill) {
            // 1. 在 Boss 周围随机位置生成 count 个 enemyType
            // 2. 召唤物不超同屏上限
            // 3. 显示召唤特效
        }
    },
};
```

---

## 五、阶段切换机制

```js
/**
 * 检查并执行阶段切换
 *
 * 算法:
 * 1. 遍历 phases（从后往前，当前阶段 = 满足 HP 条件的最大 hpPercent）
 * 2. 如果当前阶段 ≠ 上一帧的阶段:
 *    a. 播放 enterFx 特效
 *    b. 短暂无敌 1.0s（防止阶段切换时被秒杀）
 *    c. 更新 behavior, skills, moveSpeed, attackInterval
 *    d. 清除所有召唤物（可选）
 *    e. 显示阶段名称
 * 3. 如果所有阶段都通过且 HP > 0 → 保持最后阶段
 */
checkPhaseTransition(boss) {
    const hpPct = boss.hp / boss.maxHp * 100;
    let newPhase = boss.phases.length - 1;
    for (let i = 0; i < boss.phases.length; i++) {
        if (hpPct > boss.phases[i].hpPercent) {
            newPhase = Math.max(0, i - 1);
            break;
        }
    }
    if (newPhase < 0) newPhase = boss.phases.length - 1;

    if (newPhase !== boss._currentPhase) {
        this._transitionPhase(boss, newPhase);
    }
}
```

---

## 六、接口定义

```js
const BossSystem = {
    /** 当前活跃的 Boss 实例 */
    activeBoss: null,

    /** Boss 类型定义（从 bosses.json 加载） */
    types: {},


    // -------------------------------------------------------
    // 6.1 数据加载
    // -------------------------------------------------------

    async loadBosses() {
        // const data = await DataLoader.load('bosses')
        // this.types = Object.fromEntries(data.map(b => [b.id, b]))
    },


    // -------------------------------------------------------
    // 6.2 创建/销毁
    // -------------------------------------------------------

    /**
     * 创建 Boss 实例
     * @param {string} bossId
     * @param {number} x, y
     * @param {number} waveLevel
     * @returns {Object}
     *
     * 算法:
     * 1. 查找 Boss 类型定义
     * 2. 应用波次缩放
     * 3. 创建实例: { ...baseStats, phases, _currentPhase: 0, _phaseTimer: 0, _skillQueue: [], _skillCooldown: 0, ... }
     * 4. 设置初始阶段的 behavior/skills
     * 5. activeBoss = 实例
     */
    create(bossId, x, y, waveLevel) {},

    /**
     * Boss 死亡
     *
     * 算法:
     * 1. 大爆炸特效
     * 2. 掉落传奇宝箱: LootSystem.spawnChest(boss.x, boss.y, 'legendary')
     * 3. activeBoss = null
     * 4. 通知波次系统: WaveSystem.onBossDefeated()
     */
    destroy(boss) {},


    // -------------------------------------------------------
    // 6.3 每帧更新
    // -------------------------------------------------------

    /**
     * 更新 Boss
     * @param {number} dt
     * @param {Object} player
     *
     * 算法:
     * 1. if !activeBoss → 返回
     * 2. 阶段检查: checkPhaseTransition(boss)
     * 3. 技能冷却: _skillCooldown -= dt
     * 4. 如果 _skillCooldown <= 0:
     *    a. 从 _skillQueue 取下一个技能（循环队列）
     *    b. 执行技能
     *    c. _skillCooldown = attackInterval
     * 5. 按当前 behavior 移动: BOSS_BEHAVIORS[boss.behavior].update(boss, dt, player)
     * 6. 更新技能视觉效果（如火雨子弹、火焰喷射粒子）
     * 7. 击退衰减
     */
    update(dt, player) {},

    /**
     * 执行阶段切换
     */
    _transitionPhase(boss, newPhase) {},


    // -------------------------------------------------------
    // 6.4 受击
    // -------------------------------------------------------

    /**
     * 受击（Boss 专属，含阶段检查）
     *
     * 算法:
     * 1. 同 enemy.takeDamage
     * 2. 额外: 受击后检查阶段切换
     * 3. Boss 受击时全屏微震
     */
    takeDamage(boss, damage) {},


    // -------------------------------------------------------
    // 6.5 UI
    // -------------------------------------------------------

    /** Boss HP 条数据（供 UI 渲染） */
    getHpBarData() {
        // 返回 { name, hp, maxHp, phaseName, phaseIndex, phaseCount }
    },


    // -------------------------------------------------------
    // 6.6 清理
    // -------------------------------------------------------

    clear() {
        this.activeBoss = null;
    },

    /** 是否有活跃 Boss */
    isActive() {
        return this.activeBoss !== null && this.activeBoss.hp > 0;
    },
};
```

---

## 七、与 EnemySystem 的关系

BossSystem 独立于 EnemySystem，但共享：
- `stats.js` 的 `calcDamageReduction`（护甲计算）
- 击退/减速机制
- 燃烧 tick 处理

Boss 实例**不进入** `EnemySystem.enemies` 数组，由 `BossSystem.activeBoss` 单独管理。原因：
- Boss 的技能和阶段逻辑与普通敌人完全不同
- Boss 的渲染需要独立的 HP 条和特效
- 避免污染 EnemySystem 的更新循环

---

## 八、特效系统扩展

Boss 需要以下新特效类型：

```js
// 屏幕闪白
ParticleSystem.screenFlash(color, duration) {}

// 场景火焰（地面持续伤害区域）
ParticleSystem.arenaFire(x, y, radius, duration, dps) {}

// Boss 冲击波
ParticleSystem.shockwave(x, y, radius, color) {}

// 锥形喷射
ParticleSystem.coneAttack(x, y, angle, coneAngle, range, color) {}
```

（特效实现可以暂时简化——先用现有的 `explosion` / `emit` 模拟，Phase 4 再精细。）

---

## 九、验收标准

- [ ] Boss 3 阶段切换正确（HP 70%/30% 阈值触发）
- [ ] 阶段切换 1.0s 无敌 + 特效
- [ ] 5 种技能全部实现（melee_sweep/fire_breath/fire_storm/charge/summon）
- [ ] Boss 死亡 → 传奇宝箱掉落
- [ ] Boss HP 条 UI 正确显示阶段名称
- [ ] Boss 渲染与普通敌人区分（更大的 sprite/glow）
- [ ] Boss 不进入 EnemySystem.enemies 数组
- [ ] Boss 受击时屏幕微震