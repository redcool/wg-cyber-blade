# Module: item — 道具系统重做（四层：Stats + Triggers + Tags + Rarity）

**依赖**: tags.js, data.js, stats.js
**执行顺序**: 4（等 tags.js + data.js 就绪）

---

## 一、从硬编码到数据驱动

### 旧架构（shop.js `_itemApplyFunctions`）

```js
// 每个道具一个硬编码函数，手动操作 player 属性
hpUp: (p) => { p.maxHp += 30; p.hp += 30; },
thorn: (p) => { p.thornDamage = 0.3; },
burn_spreader: (p) => { p._burnSpreadLevel = (p._burnSpreadLevel || 0) + 1; ... },
```

问题：
- 新增道具需要改代码
- 触发器（OnHit/OnKill）完全缺失
- 无稀有度/标签概念
- 复杂道具往 player 上挂 `_xxx` 私有字段，污染玩家对象

### 新架构

```
Item = {
    id, name, desc, cost, icon, rarity, unique,
    tags: ['fire', 'ranged'],        // 用于流派偏向
    statMods: {                       // 属性修正（购买时一次性应用）
        maxHp: 30,
        damagePercent: 0.2,
    },
    triggers: [                       // 触发器数组（运行时持续检查）
        { type: 'OnKill', chance: 1.0, effect: { type: 'heal', value: 5 } },
        { type: 'OnHit', chance: 0.3, effect: { type: 'applyBurn', dps: 10, duration: 3.0, maxStacks: 3 } },
    ],
};
```

---

## 二、四层结构详解

### 2.1 Stats 层：属性修正

购买时直接修改 player 属性，后续永久生效：

```js
statMods: {
    maxHp: 30,           // +30 HP
    damagePercent: 0.2,  // +20% 伤害
    armor: 3,            // +3 护甲
    critChance: 0.05,    // +5% 暴击率
    lifeSteal: 0.03,     // +3% 吸血
    meleeDamage: 5,      // +5 近战伤害
    // ... 任意 StatsSystem.statDefs 中的属性
}
```

### 2.2 Triggers 层：运行时触发器

取代所有 `p._xxx` 私有字段和 `_updateItems` 中的硬编码逻辑：

| 触发器类型 | 检查时机 | 示例效果 |
|-----------|---------|---------|
| OnHit | 玩家攻击命中敌人 | 30% 概率点燃 |
| OnKill | 敌人被击杀 | 爆炸、回血 |
| OnCrit | 暴击时 | 释放闪电链 |
| OnDamageTaken | 玩家受伤 | 反弹伤害 |
| OnDodge | 玩家闪避 | 回血 |
| PerSecond | 每秒 tick | 持续回血、AoE伤害 |
| OnLowHP | 玩家 HP < 30% | 伤害翻倍 |

### 2.3 Tags 层：流派标签

```js
tags: ['fire', 'ranged']
```

用途：
- 商店偏向（`TagSystem.getBiasWeights`）
- 道具分类筛选

### 2.4 Rarity 层：稀有度

| 稀有度 | 权重 | 特点 |
|--------|------|------|
| common | 60% | 纯数值 (statMods only) |
| rare | 25% | 数值 + 小机制 (1个触发器) |
| epic | 10% | 强机制 (1-2个触发器) |
| legendary | 5% | 改变玩法/核心件 |

---

## 三、效果类型（EffectType）枚举

触发器触发后执行的效果：

```js
const EFFECT_TYPES = {
    // 数值修改
    heal:             { desc: '回复 HP',           params: ['value'] },
    damagePercent:    { desc: '临时伤害加成',        params: ['value', 'duration'] },
    speedBoost:       { desc: '临时移速加成',        params: ['value', 'duration'] },
    attackSpeedBoost: { desc: '临时攻速加成',        params: ['value', 'duration'] },

    // 状态效果
    applyBurn:        { desc: '施加燃烧',           params: ['dps', 'duration', 'maxStacks'] },
    applySlow:        { desc: '施加减速',           params: ['amount', 'duration'] },
    applyFreeze:      { desc: '冻结',              params: ['duration'] },

    // 伤害效果
    explosion:        { desc: '爆炸',              params: ['radius', 'damagePercent'] },
    chainLightning:   { desc: '连锁闪电',           params: ['count', 'range', 'damagePercent'] },
    reflectDamage:    { desc: '反弹伤害',           params: ['percent'] },

    // 特殊效果
    duplicateBullet:  { desc: '复制子弹',           params: ['chance'] },
    spawnTurret:      { desc: '召唤炮塔',           params: ['count', 'duration'] },
    spreadBurn:       { desc: '燃烧传播',           params: ['range', 'layers'] },
};
```

---

## 四、接口定义

```js
const ItemSystem = {
    /** 所有道具定义（从 items.json 加载） */
    allItems: [],

    /** 已持有的被动道具列表 */
    ownedItems: [],


    // -------------------------------------------------------
    // 4.1 数据加载
    // -------------------------------------------------------

    /**
     * 从 DataLoader 加载道具数据
     *
     * 算法:
     * 1. await DataLoader.load('items')
     * 2. 存入 this.allItems
     * 3. 校验每个道具的 triggers 格式
     */
    async loadItems() {},


    // -------------------------------------------------------
    // 4.2 购买/移除
    // -------------------------------------------------------

    /**
     * 购买道具（应用 statMods + 注册 triggers）
     * @param {string} itemId
     * @param {Object} player
     * @returns {boolean} 是否成功
     *
     * 算法:
     * 1. 查找道具定义
     * 2. 如果 unique 且已持有 → 返回 false
     * 3. 应用 statMods → PlayerSystem 属性
     * 4. 将道具加入 ownedItems
     * 5. 如果有 triggers → 注册到触发器引擎
     * 6. 返回 true
     */
    buyItem(itemId, player) {},

    /**
     * 移除道具
     * @param {string} itemId
     * @param {Object} player
     *
     * 算法:
     * 1. 撤消 statMods（反向操作）
     * 2. 从 ownedItems 移除
     * 3. 从触发器引擎注销
     */
    removeItem(itemId, player) {},


    // -------------------------------------------------------
    // 4.3 触发器引擎（集成到 game loop）
    // -------------------------------------------------------

    /**
     * 每帧更新，检查所有已注册触发器
     * @param {number} dt
     * @param {Object} player
     *
     * 算法:
     * 1. 遍历 ownedItems 中所有带 triggers 的道具
     * 2. 对每个 trigger:
     *    - PerSecond: 累加 timer, 触发时重置
     *    - OnLowHP: 检查 player.hp < maxHp × 0.3
     *    - OnHit/OnKill/OnCrit/OnDodge: 由外部事件调用（不在此方法轮询）
     * 3. 触发时调用 _executeEffect
     */
    update(dt, player) {},

    /**
     * 由外部事件调用的触发器入口
     * @param {string} triggerType - 'OnHit'|'OnKill'|'OnCrit'|'OnDamageTaken'|'OnDodge'
     * @param {Object} player
     * @param {Object} context - { target: enemy, damage: number, ... }
     *
     * 算法:
     * 1. 遍历 ownedItems 中 trigger.type 匹配的道具
     * 2. 对每个 trigger: Math.random() < trigger.chance → _executeEffect
     */
    onEvent(triggerType, player, context) {},

    /**
     * 执行单个效果
     * @param {Object} effect - { type, value, ... }
     * @param {Object} player
     * @param {Object} context
     *
     * 算法:
     * 1. 根据 effect.type 分发到对应处理函数
     * 2. heal → PlayerSystem.heal(value)
     * 3. applyBurn → PlayerSystem._applyBurn(context.target, dps, duration, maxStacks)
     * 4. explosion → 对周围敌人造成范围伤害
     * 5. ...
     */
    _executeEffect(effect, player, context) {},


    // -------------------------------------------------------
    // 4.4 查询
    // -------------------------------------------------------

    /** 按稀有度过滤 */
    getByRarity(rarity) {},

    /** 按标签过滤 */
    getByTag(tagId) {},

    /** 获取可购买道具列表（已持有 unique 的排除） */
    getBuyablePool() {},

    /** 检查是否已持有 */
    hasItem(itemId) {},
};
```

---

## 五、与现有代码的集成

### 5.1 替换 shop.js `_itemApplyFunctions`

```js
// 旧: _itemApplyFunctions[id](player)
// 新: ItemSystem.buyItem(id, player)

// shop.js 的 buyItem() 方法改为:
ShopSystem.buyItem = function(itemId) {
    const p = PlayerSystem.player;
    const item = this.items.find(i => i.id === itemId);
    if (!item) return false;
    if (p.materials < item.cost) return false;

    const success = ItemSystem.buyItem(itemId, p);
    if (!success) return false;

    p.materials -= item.cost;
    return true;
};
```

### 5.2 替换 player.js `_updateItems` 中的硬编码逻辑

```js
// 旧: player.js _updateItems() 中的分散逻辑
//     p.magnetTimer, p.bloodPactDrain, p.energyShieldCD, ...

// 新: 所有持续效果由 ItemSystem.update(dt, player) 统一处理
//     player.js 只保留 HP regen + pickup（这些不是道具效果，是基础机制）

PlayerSystem._updateBaseStats = function(dt, p) {
    // HP regen（基础机制，不属于道具）
    if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.hpRegen * dt);
};
```

### 5.3 事件钩子

```js
// main.js 碰撞检测中:
if (result === -1) {  // 敌人被击杀
    ItemSystem.onEvent('OnKill', player, { target: enemy, damage: b.damage });
}

// player.js 受击中:
PlayerSystem.takeDamage = function(rawDmg, attacker) {
    // ...
    if (actualDmg > 0) {
        ItemSystem.onEvent('OnDamageTaken', this.player, { attacker, damage: actualDmg });
    }
    if (dodged) {
        ItemSystem.onEvent('OnDodge', this.player, { attacker });
    }
    // ...
};
```

---

## 六、旧字段清理

重构后从 player 对象移除的私有字段（功能已迁移到 item triggers）：

| 旧字段 | 迁移到 |
|--------|--------|
| `p.thornDamage` | OnDamageTaken trigger → reflectDamage effect |
| `p.energyShieldCD/Ready/Timer` | PerSecond trigger + 条件判断 |
| `p.takenDmgMult` | statMods（或临时 buff） |
| `p.replicatorChance` | OnHit trigger → duplicateBullet effect |
| `p.magnetDmg/Timer/Radius` | PerSecond trigger → AoE damage effect |
| `p.piggyBank` | PerSecond trigger → 利息计算 |
| `p.bloodPactDrain` | PerSecond trigger → 扣血 + statMods（伤害加成） |
| `p._burnSpreadLevel/Range` | OnKill trigger → spreadBurn effect |
| `p._iceExplosionMult/RadiusAdd` | statMods（explosionDamage, explosionSize） |
| `p._sprayPierceAdd/DamageMult` | statMods（projectilePierce, damagePercent） |
| `p.berserkerBlood` | OnLowHP trigger → damagePercent boost effect |
| `p.reactiveArmor` | OnDamageTaken trigger → heal effect (with cooldown) |
| `p.huntingTrophy` | statMods（materialGain） |
| `p.coupon` | statMods（特殊：商店折扣，不在此系统处理） |

---

## 七、验收标准

- [ ] `items.json` 中所有道具都有 statMods + triggers（至少一项非空）
- [ ] `ItemSystem.buyItem()` 正确应用 statMods
- [ ] `ItemSystem.update()` 处理 PerSecond/OnLowHP 触发器
- [ ] `ItemSystem.onEvent()` 处理 OnHit/OnKill/OnCrit/OnDamageTaken/OnDodge
- [ ] 所有旧 `_itemApplyFunctions` 的功能被正确迁移
- [ ] 所有 `p._xxx` 私有字段被删除或注释标记 deprecated
- [ ] shop.js 的 buyItem 走 ItemSystem
- [ ] 道具稀有度在 UI 上正确显示颜色