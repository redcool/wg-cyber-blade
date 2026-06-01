# Module: stats — 新四层伤害公式 + 六类属性系统

**依赖**: tags.js（Special 层用到 Tag 判定）、data.js（属性从数据加载）
**执行顺序**: 3（等 tags.js 就绪后实现）

---

## 一、核心变更

| 维度 | 旧 (stats.js v2) | 新 (stats.js v3) |
|------|-----------------|-------------------|
| 伤害公式 | `damage × damageMult` 单层 | `(Base+Flat) × (1+Percent) × Crit × Special` 四层 |
| 属性分类 | 无分类，扁平 17 个 | 6 大类（生存/输出/机动/经济/特殊/限制） |
| 属性数量 | 17 个 | ~35 个 |
| AttackSpeed | 混在伤害公式里 | **不进单次伤害公式**，DPS 独立计算 |
| 属性定义 | 硬编码 `statDefs` | 数据驱动，可从 JSON 加载 |

---

## 二、四层伤害公式

### 2.1 公式定义

```
FinalDamage = round( (Base + Flat) × (1 + Percent) × Crit × Special )
```

### 2.2 各层说明

```js
/**
 * B 层 (Base): 武器基础伤害
 *   来源: weapons.json 的 baseDamage 字段（新字段，当前 weapons 用 damageMult）
 *   计算: 直接取值
 *   注意: 需在 weapons.csv 中新增 baseDamage 列。
 *         Phase 1 期间: 保持 damageMult 兼容，baseDamage = player._baseDamage × damageMult
 */

/**
 * F 层 (Flat): 固定加成
 *   来源: items.json 的 flatDamage 字段 + meleeDamage/rangedDamage 属性
 *   计算: sum of all flat bonuses (MeleeDamage, RangedDamage, ElementalDamage, Engineering)
 *         → 每个来源按玩家当前武器 Tag 决定是否生效
 *         算法: 发 melee 武器攻击 → 用 MeleeDamage；发 ranged → 用 RangedDamage
 */

/**
 * P 层 (Percent): 全局百分比
 *   来源: items.json 的 damagePercent 字段 + synergy 加成
 *   计算: 1 + sum of all damagePercent bonuses
 *   示例: 装备 Damage+50% → P = 1.5
 */

/**
 * C 层 (Crit): 暴击期望
 *   来源: critChance + critDamage + items/synergy 加成
 *   计算: 1 + critChance × (critDamage - 1)
 *   示例: 50% 暴击率, 3x 暴伤 → C = 1 + 0.5×(3-1) = 2.0
 *   注意: 只用于 DPS 期望计算。实际每击独立判定暴击（Math.random < critChance）
 */

/**
 * S 层 (Special): 特殊倍率
 *   来源: 条件触发加成 (vs burning +20%, full HP +30%, 低血量 +30% 等)
 *   计算: 1 × (1 + special1) × (1 + special2) × ...（乘算，每个条件独立判定）
 *   示例: 对燃烧敌人 +20%, 满血 +30% → S = 1 × 1.2 × 1.3 = 1.56
 *
 *   条件类型:
 *   - vsBurning: 目标有燃烧状态 → 乘 1+value
 *   - vsSlowed: 目标被减速 → 乘 1+value
 *   - fullHp: 玩家满血 → 乘 1+value
 *   - lowHp: 玩家 HP < 30% → 乘 1+value
 *   - vsElite: 精英/Boss → 乘 1+value
 *   - distance: 距离越远伤害越高 → 线性插值
 */
```

### 2.3 接口

```js
const StatsSystem = {
    // --- 伤害公式 ---

    /**
     * 计算单次打击的最终伤害（实际暴击判定）
     * @param {Object} weapon - 武器数据对象
     * @param {Object} player - 玩家属性对象
     * @param {Object} target - 目标对象（敌人，含状态）
     * @returns {number} 最终伤害（整数）
     *
     * 算法:
     * 1. B = weapon.baseDamage || (player._baseDamage × weapon.damageMult)
     * 2. F = 根据 weapon.tag 选择 flat 加成 (melee→MeleeDamage, ranged→RangedDamage, etc.)
     * 3. P = 1 + player.damagePercent
     * 4. 暴击判定: isCrit = Math.random() < player.critChance
     *    暴击时: C = player.critDamage
     *    未暴击: C = 1.0
     * 5. S = 计算特殊倍率（遍历 target/player 状态，叠乘所有条件满足的倍率）
     * 6. result = Math.round((B + F) × P × C × S)
     * 7. 设置 player._lastCrit = isCrit（兼容日志系统）
     * 8. 返回 result
     */
    calcDamage(weapon, player, target) {},

    /**
     * 计算 DPS 期望（用于属性面板显示）
     * @param {Object} weapon - 武器数据
     * @param {Object} player - 玩家属性
     * @returns {number} - 期望每秒伤害
     *
     * 算法:
     * 1. avgDamage = (B+F) × P × (1 + critChance × (critDamage-1)) × S_default
     *    S_default = 1.0 (不应用条件倍率)
     * 2. attackSpeed = player.attackSpeed × weapon.attackSpeedMult
     * 3. dps = avgDamage × attackSpeed
     * 4. 返回 dps
     */
    calcDPS(weapon, player) {},

    /**
     * 计算护甲减伤
     * @param {number} armor
     * @returns {number} - 减伤比例 (0~1)
     *
     * 公式: armor / (armor + 50)   [保持不变]
     */
    armorDR(armor) {},

    /**
     * 应用护甲后的实际承伤
     * @param {number} rawDamage
     * @param {number} armor
     * @returns {number}
     *
     * 算法: Math.max(1, Math.floor(rawDamage × (1 - armorDR(armor))))
     */
    calcDamageReduction(rawDamage, armor) {},


    // --- 属性体系 ---

    /**
     * 六类属性定义
     *
     * 每项属性: { id, category, label, icon, min, max, fmt, desc }
     */
    statDefs: {
        // 生存 (Survival)
        maxHp:          { category: 'survival', label: '最大生命', icon: '❤️', min: 1, max: null, fmt: 'int' },
        hpRegen:        { category: 'survival', label: '生命回复', icon: '💚', min: 0, max: null, fmt: 'float1' },
        lifeSteal:      { category: 'survival', label: '生命偷取', icon: '🩸', min: 0, max: 0.5, fmt: 'percent' },
        armor:          { category: 'survival', label: '护甲', icon: '🛡️', min: 0, max: null, fmt: 'int' },
        dodge:          { category: 'survival', label: '闪避', icon: '💨', min: 0, max: 0.6, fmt: 'percent' },
        healingModifier:{ category: 'survival', label: '治疗加成', icon: '💚', min: 0, max: null, fmt: 'percent' },

        // 输出 (Offense)
        damagePercent:  { category: 'offense', label: '伤害加成', icon: '🗡️', min: -0.99, max: null, fmt: 'percent' },
        meleeDamage:    { category: 'offense', label: '近战伤害', icon: '⚔️', min: 0, max: null, fmt: 'int' },
        rangedDamage:   { category: 'offense', label: '远程伤害', icon: '🏹', min: 0, max: null, fmt: 'int' },
        elementalDamage:{ category: 'offense', label: '元素伤害', icon: '🔮', min: 0, max: null, fmt: 'int' },
        attackSpeed:    { category: 'offense', label: '攻击速度', icon: '⚡', min: 0.2, max: 5.0, fmt: 'float2' },
        attackRange:    { category: 'offense', label: '攻击范围', icon: '🎯', min: 20, max: 800, fmt: 'int' },
        critChance:     { category: 'offense', label: '暴击率', icon: '💥', min: 0, max: 0.8, fmt: 'percent' },
        critDamage:     { category: 'offense', label: '暴击伤害', icon: '🔥', min: 1.0, max: null, fmt: 'float1' },
        engineering:    { category: 'offense', label: '工程', icon: '🤖', min: 0, max: null, fmt: 'int' },

        // 机动 (Mobility)
        speed:          { category: 'mobility', label: '移动速度', icon: '⚡', min: 50, max: 400, fmt: 'int' },
        knockback:      { category: 'mobility', label: '击退', icon: '💨', min: 0, max: null, fmt: 'int' },

        // 经济 (Economy)
        luck:           { category: 'economy', label: '幸运', icon: '🍀', min: 0, max: 50, fmt: 'int' },
        harvesting:     { category: 'economy', label: '收获加成', icon: '💰', min: 0, max: 500, fmt: 'percent' },
        xpGain:         { category: 'economy', label: '经验加成', icon: '📈', min: 0, max: null, fmt: 'percent' },
        materialGain:   { category: 'economy', label: '材料加成', icon: '💎', min: 0, max: null, fmt: 'percent' },

        // 特殊 (Special)
        explosionDamage:{ category: 'special', label: '爆炸伤害', icon: '💥', min: 0, max: null, fmt: 'percent' },
        explosionSize:  { category: 'special', label: '爆炸范围', icon: '💥', min: 0, max: null, fmt: 'percent' },
        burningSpread:  { category: 'special', label: '燃烧传播', icon: '🔥', min: 0, max: null, fmt: 'int' },
        turretDamage:   { category: 'special', label: '炮塔伤害', icon: '🤖', min: 0, max: null, fmt: 'percent' },
        turretCount:    { category: 'special', label: '炮塔数量', icon: '🤖', min: 0, max: null, fmt: 'int' },
        projectilePierce:{ category: 'special', label: '穿透', icon: '➡️', min: 0, max: 10, fmt: 'int' },

        // 限制 (Restriction) — 角色代价专用
        weaponTypeLimit:{ category: 'restriction', label: '武器限制', icon: '🔒', min: 0, max: null, fmt: 'int' },
        statLock:       { category: 'restriction', label: '属性锁定', icon: '🔒', min: 0, max: null, fmt: 'int' },
    },


    // --- 工具方法 ---

    /**
     * 钳制单个属性值到合法范围
     * @param {string} statId
     * @param {number} value
     * @returns {number}
     *
     * 算法: 检查 statDefs[statId].min/max, 钳制
     */
    clampStat(statId, value) {},

    /**
     * 钳制玩家全部属性
     * @param {Object} player
     *
     * 算法: 遍历 statDefs 的 key, 对 player 上存在的属性调用 clampStat
     *       额外: clamp HP 到 [0, maxHp]
     */
    clampPlayer(player) {},

    /**
     * 按类别获取属性列表
     * @param {string} category - 'survival'|'offense'|'mobility'|'economy'|'special'|'restriction'
     * @returns {Object[]} - 该类别的 statDef 数组
     */
    getStatsByCategory(category) {},

    /**
     * 格式化属性显示值
     * @param {string} statId
     * @param {number} value
     * @returns {string}
     *
     * 算法: 根据 statDefs[statId].fmt 格式化
     *   'int' → String(Math.round(value))
     *   'float1' → value.toFixed(1)
     *   'float2' → value.toFixed(2)
     *   'percent' → Math.round(value * 100) + '%'
     */
    formatStat(statId, value) {},

    /**
     * 获取属性上限提示
     * @param {string} statId
     * @param {number} value
     * @returns {string} - 空字符串或警告文本
     */
    getCapInfo(statId, value) {},

    /**
     * 获取玩家显示用属性列表（结构化，供 UI 使用）
     * @param {Object} player
     * @returns {Object[]} - [{ id, category, icon, label, value, raw, extra, cap, note, pctToCap }, ...]
     *
     * 算法:
     * 1. 遍历 statDefs
     * 2. 只包含 player 上存在的属性
     * 3. armor 额外计算减伤率
     * 4. 按 category 分组排序
     */
    getDisplayStats(player) {},


    // --- 经验系统（不变） ---

    /**
     * 升级所需经验
     * @param {number} level
     * @returns {number}
     */
    xpForLevel(level) {
        // 算法不变: 分段递增
        // 1: 20, 2-5: 20+lv×15, 6-10: 80+lv×30, 11-20: 230+lv×60, 21+: 830+lv×120
    },
};
```

---

## 三、与旧代码的兼容

### 3.1 属性名变更对照

| 旧属性名 | 新属性名 | 说明 |
|---------|---------|------|
| `damage` | `damagePercent` | 旧 `damage` 其实是百分比（如武器 damageMult） |
| `critMultiplier` | `critDamage` | 重命名 |
| `bulletCount` | `projectileCount` (移入 weaponParams) | 不入属性面板 |
| `bulletPierce` | `projectilePierce` | 移到特殊类 |
| `bulletSpeed` | (移入 weaponParams) | 不入属性面板 |
| `pickupRange` | (移入 weaponParams) | 不入属性面板 |
| — | `meleeDamage, rangedDamage, elementalDamage` | 新增 |
| — | `engineering, healingModifier, knockback` | 新增 |
| — | `explosionDamage, explosionSize, burningSpread` | 新增 |

### 3.2 兼容方案

Phase 1 期间不删除旧属性名，`calcDamage` 内部做映射：

```js
// 内部兼容：旧 damage 当作 damagePercent 使用
// 旧 critMultiplier 当作 critDamage 使用
// 等所有模块迁移完成后删除兼容层
```

---

## 四、玩家属性初始化（player.js 新版）

重构后 `PlayerSystem.create()` 需初始化新属性字段：

```js
// Phase 1 transition: 同时保留旧字段（兼容）+ 新字段
const p = {
    // 旧字段（兼容，逐步移除）
    damage: 15,              // → damagePercent: 0
    critMultiplier: 2.0,     // → critDamage: 2.0

    // 新字段
    damagePercent: 0,
    meleeDamage: 0,
    rangedDamage: 0,
    elementalDamage: 0,
    engineering: 0,
    healingModifier: 0,
    knockback: 0,
    explosionDamage: 0,
    explosionSize: 0,
    burningSpread: 0,
    turretDamage: 0,
    turretCount: 0,
    projectilePierce: 0,
    xpGain: 0,
    materialGain: 0,
    // 限制类
    weaponTypeLimit: 0,
    statLock: 0,
};
```

---

## 五、`_calcDamage` → `calcDamage` 迁移

### 旧代码（player.js:989-1000）

```js
_calcDamage(damageMult) {
    const p = this.player;
    let dmg = p.damage * (damageMult || 1.0);
    if (p.berserkerBlood && p.hp < p.maxHp * 0.3) dmg *= 1.30;
    let isCrit = Math.random() < p.critChance;
    if (isCrit) dmg *= p.critMultiplier;
    p._lastCrit = isCrit;
    return dmg;
}
```

### 新代码（调用 StatsSystem）

```js
// player.js 中的每个 _fireXXX 方法
// 旧: const dmg = this._calcDamage(params.damageMult);
// 新: const dmg = StatsSystem.calcDamage(weaponDef, p, target);
//
// 注意: calcDamage 需要 target 参数（用于 S 层特殊倍率判断）
//       当前 _fireXXX 方法中 target 已经可用（传入参数）
```

### 影响范围

所有 `player.js` 中的 `_fireXXX` 方法：
- `_fireBullet` (L578)
- `_fireSpread` (L593)
- `_fireLaser` (L609)
- `_fireShock` (L622)
- `_fireMeleeSweep` → `_executeMeleeSweep` (L650)
- `_fireMeleeThrust` (L735)
- `_fireExplode` (L846)
- `_fireFrost` (L857)
- `_fireHoming` (L874)
- `_fireSpray` (L886)
- `_fireHealBullet` (L924)

共 11 处 `this._calcDamage()` 调用 → 改为 `StatsSystem.calcDamage()`。

---

## 六、验收标准

- [ ] 四层 `calcDamage()` 计算正确（与手算结果一致）
- [ ] `calcDPS()` 返回合理的期望 DPS
- [ ] 六类属性在 `statDefs` 中完整定义，`getStatsByCategory()` 正确分类
- [ ] `getDisplayStats()` 返回结构化数据，UI 可以正确渲染
- [ ] `armorDR()` / `calcDamageReduction()` 保持原有行为
- [ ] `xpForLevel()` 不变
- [ ] 所有 `_fireXXX` 方法成功切换到 `StatsSystem.calcDamage()`
- [ ] 兼容层存在（旧属性名 `damage`/`critMultiplier` 仍然工作）
- [ ] 玩家属性初始化包含所有新字段