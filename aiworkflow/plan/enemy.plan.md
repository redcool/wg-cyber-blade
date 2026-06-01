# Module: enemy — 敌人 AI 重做（7 行为 + 5 机制 + Build 克制）

**依赖**: data.js, stats.js
**执行顺序**: 10（等 enemies.json 数据就绪）

---

## 一、核心变更

| 维度 | 旧 | 新 |
|------|----|----|
| 行为类型 | 8 种（chase/ranged/explode/heal/mortar/blink + elite/boss） | 7 种行为 + 5 种特殊机制（分离设计） |
| 数据源 | `data/enemyTable.md` (CSV 内嵌) | `DataLoader.load('enemies')` (JSON) |
| AI 设计 | 行为函数混杂在 update 中 | 每种行为独立方法，hash dispatch |
| Build 克制 | 无 | 按玩家流派选克制型敌人 |
| 特殊机制 | 无（elite/Boss 只是数值放大） | Splitter/Shielded/Leech/Reflect/Freezer |

---

## 二、7 种行为类型

```js
const BEHAVIORS = {
    chaser: {
        desc: '追击玩家，直线移动',
        update(enemy, dt, player) {
            // 算法:
            // 1. 计算方向: angle = atan2(player.y - enemy.y, player.x - enemy.x)
            // 2. 移动: enemy.x += cos(angle) * enemy.speed * dt
            // 3. 碰撞检测: 距离 < enemy.radius + player.radius → 造成伤害
        }
    },
    runner: {
        desc: '高速低血量，冲向玩家后逃离',
        update(enemy, dt, player) {
            // 算法:
            // 1. 如果 hp > 50% → 冲向玩家（同 chaser）
            // 2. 如果 hp <= 50% → 逃离玩家（反向移动）
            // 3. 移速在逃离时 +30%
        }
    },
    tank: {
        desc: '高血量低移速，优先移动 + 周期性冲锋',
        update(enemy, dt, player) {
            // 算法:
            // 1. 默认慢速接近玩家
            // 2. 每隔 3 秒: 蓄力 0.5s → 直线冲锋 2× 速度持续 1s
            // 3. 冲锋期间无视击退
        }
    },
    shooter: {
        desc: '保持距离射击，距离 < preferredDist 时后退',
        update(enemy, dt, player) {
            // 算法:
            // 1. 计算距离
            // 2. 距离 < preferredDist - 50: 后退（远离玩家）
            // 3. 距离 > preferredDist + 50: 接近玩家
            // 4. preferredDist ± 50 范围内: 停止移动，射击
            // 5. 射击冷却: attackCooldown 间隔发射子弹
        }
    },
    bomber: {
        desc: '接近玩家 → 自爆（范围伤害）',
        update(enemy, dt, player) {
            // 算法:
            // 1. 直线冲向玩家（无视其他敌人）
            // 2. 距离 < 40: 启动自爆倒计时 0.8s
            // 3. 倒计时期间闪烁变红
            // 4. 倒计时结束: 范围内 AoE 伤害 + 自毁
        }
    },
    swarm: {
        desc: '极低血量 × 极多数量，围攻',
        update(enemy, dt, player) {
            // 算法:
            // 1. 群体生成时分散分布
            // 2. 每个个体独立冲向玩家
            // 3. 如果周围有 ≥3 个同类 → 移速 ×1.3（群聚奖励）
            // 4. 碰撞伤害低但数量多
        }
    },
    summoner: {
        desc: '召唤小怪，远离玩家',
        update(enemy, dt, player) {
            // 算法:
            // 1. 尽量远离玩家（距离 < 200 时后退）
            // 2. 每隔 summonCooldown 秒: 在周围生成 2~3 只 chaser
            // 3. 同时在场召唤物上限 = maxSummons
            // 4. 召唤物死亡时掉落减半
        }
    },
};
```

---

## 三、5 种特殊机制

```js
const SPECIAL_MECHANICS = {
    splitter: {
        desc: '死亡后分裂为 2~3 只小型版',
        onDeath(enemy) {
            // 算法:
            // 1. 在死亡位置生成 2~3 只 split_spawn
            // 2. split_spawn 继承原敌人 50% HP, 70% 伤害, 80% 速度
            // 3. 分裂体 1 秒无敌（防止连锁分裂）
        }
    },
    shielded: {
        desc: '必须先打破护盾才能伤血',
        onInit(enemy) {
            // 算法:
            // 1. 初始化 shieldHp = maxHp × 0.5
            // 2. 护盾存在时: 头顶显示蓝色护盾条
            // 3. 护盾破裂时: 短晕眩 0.5s, 护盾不再恢复
        },
        onDamage(enemy, damage, actualDamage) {
            // 算法:
            // 1. 如果 shieldHp > 0: 伤害先扣盾
            //    shieldHp -= damage
            //    实际掉血 = max(0, damage - shieldHp_before)
            // 2. 如果 shieldHp == 0: 正常扣血
        }
    },
    leech: {
        desc: '攻击时回复 HP',
        onAttack(enemy, damageDealt) {
            // 算法:
            // 1. 每次造成伤害时: heal = damageDealt × 0.3
            // 2. enemy.hp = min(enemy.maxHp, enemy.hp + heal)
            // 3. 显示绿色回复数字
        }
    },
    reflect: {
        desc: '反弹部分伤害给玩家',
        onDamage(enemy, damage, attacker) {
            // 算法:
            // 1. 每次受伤时: reflectDmg = damage × 0.2
            // 2. PlayerSystem.takeDamage(reflectDmg, enemy)
            // 3. 显示红色反伤数字
        }
    },
    freezer: {
        desc: '攻击附带减速/冻结',
        onAttack(enemy, target) {
            // 算法:
            // 1. 攻击命中时: target.slowTimer = 1.5s, target.slowFactor = 0.5
            // 2. 如果 target 已经被减速: 额外冻结 0.5s（完全无法移动）
            // 3. 显示蓝色减速特效
        }
    },
};
```

---

## 四、Build 克制系统

```js
/**
 * 根据玩家当前 Build 选择克制型敌人
 * @param {Object} tagCounts - TagSystem 计数结果
 * @returns {string[]} 优先生成的敌人类型
 *
 * 克制关系:
 *   AOE 流 (fire/explosive) → 优先生成 Tank
 *   单体流 (crit)           → 优先生成 Swarm
 *   站桩流 (tech)           → 优先生成 Bomber
 *   高速流 (melee)          → 优先生成 Shooter + Freezer
 *   吸血流 (melee + 高 lifesteal) → 优先生成 Leech（反吸血）
 */
getCounterTypes(tagCounts) {
    const counters = [];
    const p = tagCounts;

    if ((p.fire || 0) + (p.explosive || 0) >= 2) counters.push('tank');
    if ((p.crit || 0) >= 2) counters.push('swarm');
    if ((p.tech || 0) >= 2) counters.push('bomber');
    if ((p.melee || 0) >= 2) counters.push('shooter', 'freezer');

    // 每波至少 1 种克制型 + 若干随机型
    return counters;
}
```

---

## 五、接口定义

```js
const EnemySystem = {
    /** 敌人实例数组 */
    enemies: [],

    /** 敌人类型定义（从 enemies.json 加载） */
    types: {},

    // -------------------------------------------------------
    // 5.1 数据加载
    // -------------------------------------------------------

    /**
     * 加载敌人类型数据
     *
     * 算法:
     * 1. await DataLoader.load('enemies')
     * 2. 按 id 索引存入 this.types
     * 3. 对每个类型: 如果 specialMechanic 非空 → 注册特殊机制
     */
    async loadEnemies() {},


    // -------------------------------------------------------
    // 5.2 创建/销毁
    // -------------------------------------------------------

    /**
     * 创建敌人实例
     * @param {string} typeId - 敌人类型 ID
     * @param {number} x, y - 生成位置
     * @param {number} waveLevel - 当前波次（用于难度缩放）
     * @returns {Object} 敌人实例
     *
     * 算法:
     * 1. 查找敌人类型定义
     * 2. 应用波次缩放: hp × (1 + waveLevel × 0.12), damage × (1 + waveLevel × 0.10), speed × (1 + waveLevel × 0.04)
     *    精英额外 +10%/关(10关起), Boss额外(15关起)
     * 3. 创建实例对象: { typeId, x, y, hp, maxHp, speed, damage, radius, color, glowColor, alive: true, ... }
     * 4. 如果有 specialMechanic → 调用机制 onInit
     * 5. 加入 enemies 数组
     * 6. 返回实例
     */
    create(typeId, x, y, waveLevel) {},

    /**
     * 批量创建（波次系统调用）
     * @param {Object[]} spawnList - [{ typeId, x, y }, ...]
     * @param {number} waveLevel
     */
    createBatch(spawnList, waveLevel) {},

    /**
     * 移除敌人
     * @param {Object} enemy
     *
     * 算法:
     * 1. 如果有 specialMechanic → 调用机制 onDeath
     * 2. enemy.alive = false
     * 3. 从 enemies 数组移除（或标记后由 update 统一清除）
     */
    destroy(enemy) {},


    // -------------------------------------------------------
    // 5.3 每帧更新
    // -------------------------------------------------------

    /**
     * 更新所有敌人
     * @param {number} dt
     * @param {Object} player
     *
     * 算法:
     * 1. 遍历 enemies（倒序，避免 splice 问题）
     * 2. 跳过 !alive
     * 3. 根据 behavior 分发到对应 update 函数
     *    BEHAVIORS[enemy.behavior].update(enemy, dt, player)
     * 4. 处理击退衰减: knockbackX ×= 0.9, knockbackY ×= 0.9
     * 5. 应用减速: if slowTimer > 0: slowTimer -= dt, 实际速度 = speed × slowFactor
     * 6. 边界钳制
     * 7. 处理燃烧 tick
     * 8. 清理 dead 敌人
     */
    update(dt, player) {},

    /**
     * 受击处理
     * @param {Object} enemy
     * @param {number} damage
     * @returns {number} -1 = 击杀, 0 = 存活, 1 = 未命中
     *
     * 算法:
     * 1. 如果 !alive → 返回 1
     * 2. 如果有 specialMechanic='shielded' → 先扣盾
     * 3. 如果有 specialMechanic='reflect' → 反弹伤害
     * 4. enemy.hp -= damage
     * 5. 打击特效（受击闪烁）
     * 6. HP <= 0 → destroy(enemy) + 返回 -1
     * 7. HP > 0 → 返回 0
     */
    takeDamage(enemy, damage) {},


    // -------------------------------------------------------
    // 5.4 子弹发射（Shooter 类型专用）
    // -------------------------------------------------------

    /**
     * 敌人发射子弹
     * @param {Object} enemy
     * @param {Object} player
     *
     * 算法:
     * 1. 计算 angle = atan2(player.y - enemy.y, player.x - enemy.x)
     * 2. BulletSystem.create(enemy.x, enemy.y, angle, enemy.damage, bulletSpeed, 0, false)
     */
    fireBullet(enemy, player) {},


    // -------------------------------------------------------
    // 5.5 AI 辅助
    // -------------------------------------------------------

    /**
     * 寻找最近的玩家
     */
    _findPlayer(enemy) {},

    /**
     * 检测与其他敌人的碰撞（避免堆叠）
     */
    _resolveEnemyCollisions() {},

    /**
     * 获取指定类型在场上存活的数量
     */
    countAlive(typeId) {},


    // -------------------------------------------------------
    // 5.6 清理
    // -------------------------------------------------------

    clear() {
        this.enemies = [];
    },
};
```

---

## 六、难度缩放公式

```js
/**
 * 波次难度缩放
 *
 * 普通敌人: hp × (1 + wave × 0.12), damage × (1 + wave × 0.10), speed × (1 + wave × 0.04)
 * 精英敌人: 基础缩放 + 额外 (wave - 10) × 0.10（10关起）
 * Boss: 基础缩放 + 额外 (wave - 15) × 0.15（15关起）
 */
scaleByWave(type, waveLevel) {
    const hpMult = 1 + waveLevel * 0.12;
    const dmgMult = 1 + waveLevel * 0.10;
    const spdMult = 1 + waveLevel * 0.04;

    let extraHp = 0, extraDmg = 0;
    if (type.isElite && waveLevel >= 10) {
        extraHp = (waveLevel - 10) * 0.10;
        extraDmg = (waveLevel - 10) * 0.10;
    }
    if (type.isBoss && waveLevel >= 15) {
        extraHp = (waveLevel - 15) * 0.15;
        extraDmg = (waveLevel - 15) * 0.15;
    }

    return {
        hp: Math.floor(type.hp * (hpMult + extraHp)),
        damage: Math.floor(type.damage * (dmgMult + extraDmg)),
        speed: Math.floor(type.speed * spdMult),
    };
}
```

---

## 七、验收标准

- [ ] 7 种行为类型全部实现，update 逻辑独立可测
- [ ] 5 种特殊机制全部实现，onInit/onDeath/onDamage/onAttack 钩子正确
- [ ] Shooter 正确保持距离并发射子弹
- [ ] Bomber 倒计时 + 自爆 AoE 正确
- [ ] Summoner 生成 chaser 子怪
- [ ] Splitter 死亡分裂正确
- [ ] Shielded 护盾优先级正确（先扣盾再扣血）
- [ ] Leech/Reflect 反伤/吸血数字正确
- [ ] 波次缩放公式一致（与旧系统输出相同）
- [ ] Build 克制逻辑：AOE 流 → Tank 增多