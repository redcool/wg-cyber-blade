# Module: passives — 被动技能引擎（数据驱动触发器）

**依赖**: data.js, stats.js
**执行顺序**: 6（等 character.js + item.js 就绪）

---

## 一、模块定位

被动技能引擎是角色和道具的**共享触发层**。角色自带被动、道具带触发器——两者通过同一引擎执行。

```
passives.js (触发器引擎)
  │
  ├── character.js → 角色被动 (permanent)
  ├── item.js      → 道具触发器 (conditional)
  └── player.js    → 每帧 update(dt) + onEvent()
```

---

## 二、被动技能数据模型

```js
// 来自 passives.json 的单条被动定义
{
    id: 'pyro_burn_on_hit',
    name: '火焰之触',
    desc: '攻击命中时 100% 施加燃烧',
    icon: '🔥',

    triggerType: 'OnHit',      // 触发时机
    condition: null,            // 额外条件（可选）
    chance: 1.0,               // 触发概率 0~1

    // 效果定义（与 item.js 共用 EFFECT_TYPES）
    effect: {
        type: 'applyBurn',
        dps: 8,
        duration: 3.0,
        maxStacks: 3,
    },

    target: 'enemy',            // 目标: 'enemy' | 'player' | 'both'
    tags: ['fire'],             // 绑定的标签（用于流派判定）
}
```

### 触发类型

| TriggerType | 触发时机 | 说明 |
|-------------|---------|------|
| Passive | 永久生效 | 不触发事件，直接修改属性（视为 statMods） |
| OnHit | 攻击命中时 | context.target = 被击中敌人 |
| OnKill | 击杀时 | context.target = 被击杀敌人 |
| OnCrit | 暴击时 | context.target = 被暴击敌人 |
| OnDamageTaken | 受伤时 | context.attacker = 攻击者 |
| OnDodge | 闪避时 | context.attacker = 攻击者 |
| PerSecond | 每秒 tick | 无 context |
| OnLowHP | HP < 30% | 无 context |
| OnLevelUp | 升级时 | 无 context |

### 条件类型

```js
// condition 字段: { type, operator, value }
// 示例:
condition: { type: 'tag', operator: 'eq', value: 'melee' }
// → 只有使用 melee 标签武器攻击时才触发

condition: { type: 'hpPercent', operator: 'lt', value: 0.3 }
// → 只有 HP < 30% 时才触发（可替代 OnLowHP 触发器）

condition: null
// → 无额外条件，仅触发器决定
```

---

## 三、接口定义

```js
const PassiveSystem = {
    /** 所有被动技能定义（从 passives.json 加载） */
    allPassives: [],

    /** 当前已激活的被动列表（角色被动 + 道具触发器） */
    activePassives: [],

    /** 共享冷却追踪（防止同一效果过快重复触发） */
    _cooldowns: {},


    // -------------------------------------------------------
    // 3.1 数据加载
    // -------------------------------------------------------

    /**
     * 加载被动技能数据
     *
     * 算法:
     * 1. await DataLoader.load('passives')
     * 2. 存入 this.allPassives
     */
    async loadPassives() {},


    // -------------------------------------------------------
    // 3.2 注册/注销
    // -------------------------------------------------------

    /**
     * 注册被动技能（角色选择时、道具购买时调用）
     * @param {string} passiveId
     * @param {string} source - 'character' | 'item'
     *
     * 算法:
     * 1. 查找被动定义
     * 2. 如果 triggerType === 'Passive' → 立即应用 statMods
     * 3. 否则 → 加入 activePassives 列表
     * 4. 去重：同一 passiveId + source 不重复注册
     */
    register(passiveId, source) {},

    /**
     * 注销被动技能（角色切换时、道具移除时调用）
     * @param {string} passiveId
     *
     * 算法:
     * 1. 从 activePassives 移除
     * 2. 如果是 Passive 类型 → 撤消 statMods
     */
    unregister(passiveId) {},

    /**
     * 批量注册
     * @param {string[]} passiveIds
     * @param {string} source
     */
    registerMany(passiveIds, source) {},

    /**
     * 批量注销
     * @param {string[]} passiveIds
     */
    unregisterMany(passiveIds) {},


    // -------------------------------------------------------
    // 3.3 每帧更新
    // -------------------------------------------------------

    /**
     * 每帧 tick，处理 PerSecond 和 OnLowHP 类型
     * @param {number} dt
     * @param {Object} player
     *
     * 算法:
     * 1. 遍历 activePassives
     * 2. PerSecond: 累加 timer, 每秒触发
     * 3. OnLowHP: 检查 player.hp < maxHp × 0.3
     * 4. 触发时: 检查 chance → _execute(passive, player, null)
     */
    update(dt, player) {},


    // -------------------------------------------------------
    // 3.4 事件驱动触发
    // -------------------------------------------------------

    /**
     * 由外部事件调用
     * @param {string} triggerType - 'OnHit'|'OnKill'|'OnCrit'|'OnDamageTaken'|'OnDodge'
     * @param {Object} player
     * @param {Object} context - { target, attacker, damage, ... }
     *
     * 算法:
     * 1. 筛选 activePassives 中 triggerType 匹配的被动
     * 2. 对每个被动:
     *    a. 检查条件（condition 不为 null 时）
     *    b. 检查 CD（_cooldowns 中有记录且未冷却 → 跳过）
     *    c. Math.random() < chance → _execute
     *    d. 设置 CD（如果效果定义了 cd）
     */
    onEvent(triggerType, player, context) {},


    // -------------------------------------------------------
    // 3.5 效果执行
    // -------------------------------------------------------

    /**
     * 执行被动效果（与 ItemSystem._executeEffect 共用同一效果引擎）
     * @param {Object} passive - 被动定义
     * @param {Object} player
     * @param {Object} context
     *
     * 算法:
     * 1. 根据 passive.effect.type 分发
     * 2. 调用对应的效果执行函数
     * 3. 目标根据 passive.target 决定：
     *    'enemy' → context.target
     *    'player' → player
     *    'both' → 两者都应用
     *
     * 效果分发:
     * - heal → PlayerSystem.heal(value)
     * - applyBurn → 对 target 施加燃烧
     * - applySlow → 对 target 施加减速
     * - explosion → 对 target 周围造成 AoE
     * - chainLightning → 连锁
     * - damagePercent → 临时 buff
     * - speedBoost → 临时 buff
     * - duplicateBullet → 子弹复制
     * - etc...
     */
    _execute(passive, player, context) {},

    /**
     * 共享的效果执行函数（item.js 和 passives.js 共用）
     *
     * 设计为全局函数，放在 stats.js 或独立文件:
     * EffectEngine.execute(effect, player, context)
     */
    _effectEngine: null,  // 指向 EffectEngine


    // -------------------------------------------------------
    // 3.6 查询
    // -------------------------------------------------------

    /** 按标签获取当前激活的被动 */
    getByTag(tagId) {},

    /** 获取被动定义 */
    getDef(passiveId) {},

    /** 清空所有注册（游戏结束时调用） */
    reset() {},
};
```

---

## 四、效果引擎（EffectEngine）

由于 item.js 和 passives.js 共用同一效果执行逻辑，抽取为独立模块：

```js
const EffectEngine = {
    /**
     * 执行效果
     * @param {Object} effect - { type, ...params }
     * @param {Object} player
     * @param {Object} context - { target, ... }
     *
     * 算法:
     * 1. 查找 EFFECT_HANDLERS[effect.type]
     * 2. 调用对应 handler
     * 3. handler 无副作用（不直接修改全局状态，通过系统 API 操作）
     */
    execute(effect, player, context) {},

    /**
     * 效果处理器注册表
     */
    _handlers: {
        heal: (effect, player, ctx) => {
            PlayerSystem.heal(effect.value);
        },
        applyBurn: (effect, player, ctx) => {
            if (!ctx || !ctx.target) return;
            PlayerSystem._applyBurn(ctx.target, effect.dps, effect.duration, effect.maxStacks);
        },
        applySlow: (effect, player, ctx) => {
            if (!ctx || !ctx.target) return;
            ctx.target.slowTimer = effect.duration;
            ctx.target.slowFactor = 1 - effect.amount;
        },
        explosion: (effect, player, ctx) => {
            if (!ctx || !ctx.target) return;
            const cx = ctx.target.x, cy = ctx.target.y;
            const dmg = Math.floor(player.damage * (effect.damagePercent || 0.5));
            for (const e of EnemySystem.enemies) {
                if (!e.alive) continue;
                const dx = e.x - cx, dy = e.y - cy;
                if (Math.sqrt(dx*dx + dy*dy) < effect.radius) {
                    EnemySystem.takeDamage(e, dmg);
                }
            }
            ParticleSystem.explosion(cx, cy, '#ff6600', 15);
        },
        chainLightning: (effect, player, ctx) => {
            if (!ctx || !ctx.target) return;
            BulletSystem.chainLightning_direct(ctx.target, effect.count, effect.range, effect.damagePercent);
        },
        damagePercentBoost: (effect, player, ctx) => {
            // 临时 buff，持续 effect.duration 秒
            if (!player._tempBuffs) player._tempBuffs = [];
            player._tempBuffs.push({
                stat: 'damagePercent',
                value: effect.value,
                remaining: effect.duration,
            });
        },
        speedBoost: (effect, player, ctx) => {
            if (!player._tempBuffs) player._tempBuffs = [];
            player._tempBuffs.push({
                stat: 'speed',
                value: effect.value,
                remaining: effect.duration,
            });
        },
        duplicateBullet: (effect, player, ctx) => {
            // 由 ItemSystem.onEvent('OnHit') 触发时，
            // 强行多发射一颗子弹。最简单的实现：
            // 在 player.js 的碰撞处理中检查此标记
            player._duplicateBullet = true;
        },
        reflectDamage: (effect, player, ctx) => {
            if (!ctx || !ctx.attacker) return;
            const reflectDmg = Math.max(1, Math.floor(ctx.damage * effect.percent));
            EnemySystem.takeDamage(ctx.attacker, reflectDmg);
        },
        spreadBurn: (effect, player, ctx) => {
            if (!ctx || !ctx.target) return;
            PlayerSystem._spreadBurn(ctx.target);
        },
    },
};
```

---

## 五、与 item.js 的关系

| 概念 | item.js | passives.js |
|------|---------|-------------|
| 效果执行 | `_executeEffect()` | `_execute()` |
| 效果引擎 | 指向 `EffectEngine` | 指向 `EffectEngine` |
| 注册 | `buyItem()` 时注册 triggers | `register()` 注册角色被动 |
| 来源 | `source='item'` | `source='character'` |

两者共享：
- 效果类型枚举（EFFECT_TYPES）
- 效果引擎（EffectEngine）
- 触发逻辑模式（chance + condition + cooldown）

建议 `EffectEngine` 放在一个新的 `src/engine/effects.js` 中，或在 `passives.js` 中定义，由 `item.js` import。

---

## 六、passives.json 数据结构

```json
[
    {
        "id": "pyro_burn_on_hit",
        "name": "火焰之触",
        "desc": "攻击命中时施加燃烧",
        "icon": "🔥",
        "triggerType": "OnHit",
        "condition": null,
        "chance": 1.0,
        "effect": {
            "type": "applyBurn",
            "dps": 8,
            "duration": 3.0,
            "maxStacks": 3
        },
        "target": "enemy",
        "tags": ["fire"]
    },
    {
        "id": "berserker_low_hp",
        "name": "嗜血狂暴",
        "desc": "低血量时 +30% 伤害",
        "icon": "💢",
        "triggerType": "OnLowHP",
        "condition": null,
        "chance": 1.0,
        "effect": {
            "type": "damagePercentBoost",
            "value": 0.3,
            "duration": 999
        },
        "target": "player",
        "tags": ["melee"]
    },
    {
        "id": "engineer_passive",
        "name": "工程精通",
        "desc": "工程物 +50% 伤害",
        "icon": "🤖",
        "triggerType": "Passive",
        "condition": null,
        "chance": 1.0,
        "effect": {
            "type": "statMod",
            "turretDamage": 0.5
        },
        "target": "player",
        "tags": ["tech"]
    },
    {
        "id": "hunter_ranged_flat",
        "name": "精准射击",
        "desc": "远程 +5 伤害",
        "icon": "🏹",
        "triggerType": "Passive",
        "condition": null,
        "chance": 1.0,
        "effect": {
            "type": "statMod",
            "rangedDamage": 5
        },
        "target": "player",
        "tags": ["ranged"]
    },
    {
        "id": "merchant_gold_to_damage",
        "name": "金钱之力",
        "desc": "每 50 金币 +5% 伤害",
        "icon": "💰",
        "triggerType": "PerSecond",
        "condition": null,
        "chance": 1.0,
        "effect": {
            "type": "conditionalStatMod",
            "stat": "damagePercent",
            "formula": "floor(materials / 50) * 0.05"
        },
        "target": "player",
        "tags": ["economy"]
    },
    {
        "id": "assassin_crit_boost",
        "name": "致命一击",
        "desc": "暴击时 +50% 伤害",
        "icon": "💥",
        "triggerType": "OnCrit",
        "condition": null,
        "chance": 1.0,
        "effect": {
            "type": "damagePercentBoost",
            "value": 0.5,
            "duration": 0.5
        },
        "target": "player",
        "tags": ["crit"]
    }
]
```

---

## 七、验收标准

- [ ] `passives.json` 包含至少 6 条被动技能定义
- [ ] `PassiveSystem.register()` 正确注册并激活
- [ ] `PassiveSystem.update()` 处理 PerSecond/OnLowHP
- [ ] `PassiveSystem.onEvent()` 处理 OnHit/OnKill/OnCrit/OnDamageTaken/OnDodge
- [ ] `EffectEngine.execute()` 所有 handler 正常工作
- [ ] 角色被动通过 `registerMany()` 批量激活
- [ ] 道具触发器通过 `register()` 激活
- [ ] `PassiveSystem.reset()` 完全清空状态
- [ ] 共享冷却机制正常工作