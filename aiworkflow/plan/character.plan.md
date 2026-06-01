# Module: character — 角色系统重做（9角色 + 代价 + 被动）

**依赖**: data.js, tags.js, stats.js
**执行顺序**: 5（等 tags.js + stats.js 就绪）

---

## 一、核心变更

| 维度 | 旧 | 新 |
|------|----|----|
| 数据源 | `data/characterTable.md` (CSV 内嵌) | `DataLoader.load('characters')` (JSON) |
| 标签 | 6 个旧标签 (gun/bow/magic/medic/lance) | 7 个新标签 |
| stats 对象 | `stats.damage` (绝对值) | `damagePercent` + `meleeDamage` + `rangedDamage` + ... |
| 代价系统 | 无 | 每个角色 优势 + 代价 |
| 被动技能 | 无 | 引用 `passives.json` 中的 passive ID |
| 硬编码回退 | `_fallbackToHardcoded()` 11角色全手写 | 删除，JSON 加载失败 → 报错 |

---

## 二、角色定义

按重构计划 v2 的 9 角色设计：

| id | 名称 | 优势 | 代价 | 被动 |
|----|------|------|------|------|
| default | 默认 | 均衡 | 无 | 无 |
| glassCannon | 玻璃大炮 | +50% 伤害 | -5 护甲 | — |
| tank | 坦克 | +10 护甲, +50 HP | -20% 伤害, -5 速度 | — |
| berserker | 狂战士 | +30% 伤害, +0.5 攻速 | HP Regen=0 | 低血时 +30% 伤害 |
| engineer | 工程师 | Engineering+10 | -10% 伤害, -0.1 攻速 | 工程物 +50% 伤害 |
| pyromancer | 火法 | +20% 伤害, 攻击附加燃烧 | — | 火焰 +20% 伤害 |
| hunter | 猎人 | +10% 暴击, +10 射程 | — | 远程 +5 伤害 |
| merchant | 商人 | +20% 金币获取 | -10% 伤害 | 每 50 金币 +5% 伤害 |
| assassin | 刺客 | +20% 暴击, +15% 闪避 | -2 护甲 | 暴击时 +50% 伤害 |

**注意：** 当前已有 11 个角色（swordsman, gunslinger, fire_mage, archer, mech, assassin, medic, paladin, engineer, berserker, dragon_knight）。Phase 2 需要按新设计重做 9 角色。旧角色中 medic, paladin, dragon_knight, mech, swordsman, gunslinger, fire_mage, archer — 需映射到新角色或移除。

---

## 三、字符数据结构

```js
// 从 characters.json 加载的角色定义
{
    id: 'pyromancer',
    name: '火法',
    desc: '+20% 伤害，攻击附加燃烧',
    icon: '🔥',
    unlocked: false,

    // 基础属性（替代旧的 stats 子对象）
    maxHp: 80,
    hpRegen: 0.5,
    speed: 200,
    attackSpeed: 0.9,
    attackRange: 320,
    armor: 0,
    dodge: 0.02,
    critChance: 0.05,
    critDamage: 2.5,       // 绝对值（不是加算，因为角色基础暴伤是 2.5x）

    // 百分比修正（替代旧的 damage 绝对值）
    damagePercent: 0.2,     // +20%
    meleeDamage: 0,
    rangedDamage: 0,
    elementalDamage: 0,
    engineering: 0,

    // 经济
    harvesting: 0,
    luck: 0,
    xpGain: 0,
    materialGain: 0,
    lifeSteal: 0,

    // 武器限制
    weaponSlots: 6,
    weaponTypeLimit: 0,     // 0 = 无限制

    // 标签（新 7 标签体系）
    tags: ['fire', 'ranged'],

    // 代价（加到 player 的 penalty 字段组）
    penalties: {
        armor: 0,           // 负值 = 惩罚
        damagePercent: 0,
        speed: 0,
        hpRegen: 0,
    },

    // 被动技能引用
    passives: ['pyro_burn_on_hit', 'pyro_fire_damage_boost'],

    // 解锁条件
    unlockType: 'totalKills',
    unlockValue: 150,
}
```

---

## 四、接口定义

```js
const CharacterSystem = {
    /** 所有角色（从 JSON 加载） */
    allCharacters: [],

    /** 当前选中的角色 ID */
    selectedCharacterId: 'default',


    // -------------------------------------------------------
    // 4.1 数据加载
    // -------------------------------------------------------

    /**
     * 从 DataLoader 加载角色数据
     *
     * 算法:
     * 1. await DataLoader.load('characters')
     * 2. 存入 this.allCharacters
     * 3. 如果没有 default 角色 → 从 swordsman 映射
     */
    async loadCharacters() {},


    // -------------------------------------------------------
    // 4.2 应用到玩家
    // -------------------------------------------------------

    /**
     * 应用角色属性 + 代价到玩家对象
     * @param {Object} player
     * @param {string} characterId
     *
     * 算法:
     * 1. 查找角色定义
     * 2. 复制所有基础属性字段到 player（maxHp, speed, armor, ...）
     * 3. 应用百分比修正（damagePercent, meleeDamage, ...）
     * 4. 应用代价（penalties 字段加到属性上）
     * 5. 设置 player.weaponSlots = ch.weaponSlots
     * 6. 设置 player.characterId = characterId
     * 7. 设置 player.tags = ch.tags
     * 8. 调用 StatsSystem.clampPlayer(player)
     * 9. 如果有 passives → 注册到 PassiveSystem
     *
     * 注意: 不分配武器，由 startGame 的武器选择决定
     */
    applyToPlayer(player, characterId) {},


    // -------------------------------------------------------
    // 4.3 查询
    // -------------------------------------------------------

    /**
     * 获取当前角色的标签列表
     * （替代旧的 getAffinities）
     * @returns {string[]}
     */
    getTags() {},

    /**
     * 检查当前角色是否适配指定标签
     * （替代旧的 isAffinity）
     * @param {string} tagId
     * @returns {boolean}
     */
    hasTag(tagId) {},

    /** 获取已解锁角色 */
    getUnlocked() {},

    /** 选择角色 */
    select(id) {},

    /** 获取当前角色 */
    getCurrent() {},
};
```

---

## 五、与 player.js 的集成

### 5.1 PlayerSystem.create() 变更

```js
PlayerSystem.create = function(startX, startY) {
    const p = {
        // 基础
        x: startX, y: startY,
        radius: 18, hp: 100, maxHp: 100, alive: true,

        // 属性（由 CharacterSystem.applyToPlayer 填充）
        // ... 所有 stats.js statDefs 中的属性 + 旧兼容字段

        // 游戏数据
        level: 1, xp: 0, xpToNext: 20,
        materials: 0, kills: 0,
        invincibleTimer: 0, invincibleDuration: 0.5,
        knockbackX: 0, knockbackY: 0,
        glowColor: '#00ffff',

        // 武器系统
        weapons: [],
        weaponParams: {},
        weaponSlots: 6,
        weaponAnimations: [],
        facingAngle: 0,

        // 道具
        items: [],

        // Tag/Synergy
        characterId: null,
        tags: [],
        _synergyMods: {},
        _activeSynergies: [],
        _affixMods: {},

        // 兼容层（逐步删除）
        _baseDamage: 15,    // Phase 2 保留，Phase 3 删除
        damage: 15,          // Phase 2 映射到 damagePercent, Phase 3 删除
        critMultiplier: 2.0, // Phase 2 映射到 critDamage, Phase 3 删除
    };

    // 应用角色属性
    CharacterSystem.applyToPlayer(p, CharacterSystem.selectedCharacterId);

    // 存储基础伤害引用（兼容）
    p._baseDamage = p.damage;

    // 初始化武器参数
    this._initWeaponParams(p);

    // 计算初始羁绊
    this._updateSynergies();

    this.player = p;
    return p;
};
```

### 5.2 删除旧 applyToPlayer 中的逐字段拷贝

不再需要 `Object.assign(player, { maxHp, hpRegen, speed, damage, ... })`——新 `applyToPlayer` 直接使用角色 JSON 中的所有属性字段。

---

## 六、旧数据迁移

| 旧角色 ID | 新角色 ID | 说明 |
|-----------|-----------|------|
| swordsman | (移除) | 旧均衡型 → 用 default |
| gunslinger | hunter | 远程输出型 |
| fire_mage | pyromancer | 火焰系 |
| archer | hunter | 合并到 hunter（远程标签统一为 ranged） |
| mech | tank | 高防型 |
| assassin | assassin | 保留 |
| medic | (移除) | medic 标签移除 |
| paladin | (移除) | medic+lance 标签不存在 |
| engineer | engineer | 保留并增强 |
| berserker | berserker | 保留 |
| dragon_knight | (移除) | lance 标签移除 |

---

## 七、验收标准

- [ ] 从 `characters.json` 成功加载 9 角色
- [ ] `applyToPlayer()` 正确应用所有属性 + 代价
- [ ] `getTags()` 返回新 7 标签（melee/ranged/fire/explosive/crit/tech/economy）
- [ ] 旧 `_fallbackToHardcoded()` 删除
- [ ] 旧 `loadFromTable()` / `_parseCSV()` / `_splitCSVLine()` 删除
- [ ] `character.js` 不再包含 CSV 解析代码
- [ ] PlayerSystem.create() 通过 CharacterSystem 初始化属性
- [ ] 兼容层存在（旧 damage/critMultiplier 映射到新字段）