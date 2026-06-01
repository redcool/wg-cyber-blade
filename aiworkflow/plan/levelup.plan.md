# Module: levelup — 升级抽卡系统（流派偏向 + 数据驱动）

**依赖**: data.js, tags.js, stats.js
**执行顺序**: 9（等 stats.js + tags.js + shop.js 就绪）

---

## 一、从硬编码到数据驱动

### 旧架构（stats.js `levelUpOptions`）

```js
// 17 张固定卡，apply 直接修改 player 属性
{ id: 'maxHp', name: '生命强化', desc: '最大生命 +20%',
  apply: (p) => { p.maxHp = Math.floor(p.maxHp * 1.20); } },
```

问题：
- 无流派偏向
- 无稀有度
- 卡池固定 17 张
- apply 函数写死在代码里

### 新架构

```js
// 来自 levelUpCards.json
{
    id: 'maxHp_20',
    name: '生命强化',
    desc: '最大生命 +20%',
    icon: '❤️',
    rarity: 'common',
    category: 'survival',
    tags: [],               // 空的 = 通用卡，不为空 = 流派专属卡
    statMods: {
        maxHp: { type: 'mult', value: 0.2 }  // × 1.2
    },
}
```

---

## 二、卡牌类型

| 类型 | 示例 | 说明 |
|------|------|------|
| **属性加成** | `maxHp +20%`, `armor +3` | 直接修改属性 |
| **武器增强** | `当前武器等级 +1`, `品质升级` | 操作武器 |
| **特殊机制** | `暴击时 +50% 伤害`, `击杀回血` | 添加被动（注册到 PassiveSystem） |

---

## 三、数据模型

### 属性卡

```json
{
    "id": "critChance_5",
    "name": "精准强化",
    "desc": "暴击率 +5%",
    "icon": "💥",
    "rarity": "common",
    "category": "offense",
    "tags": ["crit"],
    "statMods": {
        "critChance": { "type": "add", "value": 0.05 }
    }
}
```

### 武器增强卡

```json
{
    "id": "weapon_level_up",
    "name": "武器精炼",
    "desc": "随机一把武器等级 +1",
    "icon": "⚔️",
    "rarity": "rare",
    "category": "weapon",
    "tags": [],
    "action": {
        "type": "weaponLevelUp",
        "count": 1,
        "target": "random"
    }
}
```

### 被动技能卡

```json
{
    "id": "passive_on_kill_explode",
    "name": "杀戮快感",
    "desc": "击杀时 100% 产生爆炸",
    "icon": "💥",
    "rarity": "epic",
    "category": "special",
    "tags": ["explosive"],
    "action": {
        "type": "addPassive",
        "passiveId": "on_kill_explosion"
    }
}
```

---

## 四、流派偏向

```js
/**
 * 生成升级卡选项（3~5 张）
 * @param {Object} player
 * @returns {Object[]}
 *
 * 算法:
 * 1. 获取流派偏向权重 (TagSystem.getBiasWeights, biasStrength=0.25)
 * 2. 从 levelUpCards.json 的卡池中加权选择:
 *    a. 通用卡 (tags=[]): 基础权重 = rarity 权重
 *    b. 流派卡 (tags 非空): 基础权重 × 流派偏向
 *    c. 如果某张卡已被选过 → 排除（本次升级不重复）
 * 3. 不包含保底（升级卡本身就是奖励，没有保底的必要）
 * 4. 返回 3~5 张卡
 */
generateCards(player) {}
```

---

## 五、应用执行

```js
/**
 * 应用选中的升级卡
 * @param {string} cardId
 * @param {Object} player
 *
 * 算法:
 * 1. 查找卡牌定义
 * 2. 根据 action.type 分发:
 *    a. 'statMod' → 应用 statMods 到 player（add/mult）
 *    b. 'weaponLevelUp' → ShopSystem._levelUpWeapon(targetWeapon)
 *    c. 'addPassive' → PassiveSystem.register(passiveId, 'levelup')
 * 3. 调用 StatsSystem.clampPlayer(player)
 */
applyCard(cardId, player) {}
```

---

## 六、卡池规模

```json
// levelUpCards.json 预计 30+ 张卡
[
    // === 生存 (Survival) ===
    { id: 'maxHp_20', rarity: 'common', category: 'survival', tags: [], statMods: { maxHp: { type: 'mult', value: 0.2 } } },
    { id: 'maxHp_40', rarity: 'rare',   category: 'survival', tags: [], statMods: { maxHp: { type: 'mult', value: 0.4 } } },
    { id: 'armor_3',  rarity: 'common', category: 'survival', tags: [], statMods: { armor:  { type: 'add',  value: 3 } } },
    { id: 'armor_6',  rarity: 'rare',   category: 'survival', tags: ['melee'], statMods: { armor: { type: 'add', value: 6 } } },
    { id: 'dodge_3',  rarity: 'common', category: 'survival', tags: [], statMods: { dodge:  { type: 'add',  value: 0.03 } } },
    { id: 'hpRegen_1',rarity: 'common', category: 'survival', tags: [], statMods: { hpRegen:{ type: 'add',  value: 1.0 } } },

    // === 输出 (Offense) ===
    { id: 'damage_10',   rarity: 'common', category: 'offense', tags: [], statMods: { damagePercent: { type: 'add', value: 0.10 } } },
    { id: 'damage_25',   rarity: 'rare',   category: 'offense', tags: [], statMods: { damagePercent: { type: 'add', value: 0.25 } } },
    { id: 'attackSpeed_15', rarity: 'common', category: 'offense', tags: [], statMods: { attackSpeed: { type: 'mult', value: 0.15 } } },
    { id: 'critChance_5',   rarity: 'common', category: 'offense', tags: ['crit'], statMods: { critChance: { type: 'add', value: 0.05 } } },
    { id: 'critDamage_50',  rarity: 'rare',   category: 'offense', tags: ['crit'], statMods: { critDamage: { type: 'add', value: 0.5 } } },
    { id: 'melee_flat_5',   rarity: 'common', category: 'offense', tags: ['melee'], statMods: { meleeDamage: { type: 'add', value: 5 } } },
    { id: 'ranged_flat_5',  rarity: 'common', category: 'offense', tags: ['ranged'], statMods: { rangedDamage: { type: 'add', value: 5 } } },
    { id: 'elemental_flat_5',rarity: 'common', category: 'offense', tags: ['fire','explosive'], statMods: { elementalDamage: { type: 'add', value: 5 } } },
    { id: 'eng_flat_5',     rarity: 'common', category: 'offense', tags: ['tech'], statMods: { engineering: { type: 'add', value: 5 } } },

    // === 机动 (Mobility) ===
    { id: 'speed_10', rarity: 'common', category: 'mobility', tags: [], statMods: { speed: { type: 'mult', value: 0.10 } } },
    { id: 'range_15', rarity: 'common', category: 'mobility', tags: ['ranged'], statMods: { attackRange: { type: 'mult', value: 0.15 } } },

    // === 经济 (Economy) ===
    { id: 'luck_2',   rarity: 'common', category: 'economy', tags: ['economy'], statMods: { luck: { type: 'add', value: 2 } } },
    { id: 'harvest_25', rarity: 'common', category: 'economy', tags: ['economy'], statMods: { harvesting: { type: 'add', value: 25 } } },
    { id: 'xpGain_15',  rarity: 'rare',   category: 'economy', tags: ['economy'], statMods: { xpGain: { type: 'add', value: 0.15 } } },

    // === 特殊 (Special) ===
    { id: 'explosionSize_20', rarity: 'rare', category: 'special', tags: ['explosive'], statMods: { explosionSize: { type: 'add', value: 0.2 } } },
    { id: 'explosionDmg_25',  rarity: 'rare', category: 'special', tags: ['explosive'], statMods: { explosionDamage: { type: 'add', value: 0.25 } } },
    { id: 'pierce_1',  rarity: 'rare', category: 'special', tags: ['ranged'], statMods: { projectilePierce: { type: 'add', value: 1 } } },
    { id: 'turretDmg_25', rarity: 'epic', category: 'special', tags: ['tech'], statMods: { turretDamage: { type: 'add', value: 0.25 } } },

    // === 武器增强 ===
    { id: 'weapon_level_up', rarity: 'rare', category: 'weapon', tags: [], action: { type: 'weaponLevelUp' } },
    { id: 'weapon_quality_up', rarity: 'epic', category: 'weapon', tags: [], action: { type: 'weaponQualityUp' } },
    { id: 'weapon_slot_1', rarity: 'legendary', category: 'weapon', tags: [], action: { type: 'addWeaponSlot' } },

    // === 被动技能 ===
    { id: 'passive_kill_explode', rarity: 'epic', category: 'special', tags: ['explosive'], action: { type: 'addPassive', passiveId: 'on_kill_explosion' } },
    { id: 'passive_burn_spread',  rarity: 'epic', category: 'special', tags: ['fire'],      action: { type: 'addPassive', passiveId: 'burn_spread' } },
    { id: 'passive_lifesteal',    rarity: 'legendary', category: 'survival', tags: ['melee'], action: { type: 'addPassive', passiveId: 'life_on_hit' } },
]
```

---

## 七、接口定义

```js
const LevelUpSystem = {
    /** 卡牌定义（从 levelUpCards.json 加载） */
    allCards: [],

    /** 当前可选的卡牌 */
    currentCards: [],

    /** 本次升级已生成的卡 ID 集合（避免重复） */
    _generatedIds: new Set(),


    // -------------------------------------------------------
    // 7.1 数据加载
    // -------------------------------------------------------

    async loadCards() {
        // await DataLoader.load('levelUpCards')
        // this.allCards = data
    },


    // -------------------------------------------------------
    // 7.2 卡牌生成
    // -------------------------------------------------------

    /**
     * 生成升级卡选项
     *
     * 算法: 见"四、流派偏向"
     */
    generateCards(player) {},

    /**
     * 加权选择一张卡
     */
    _selectCard(pool, biasWeights) {},


    // -------------------------------------------------------
    // 7.3 应用
    // -------------------------------------------------------

    /**
     * 应用选中的卡
     */
    applyCard(cardId, player) {},

    /**
     * 应用 statMods
     */
    _applyStatMods(statMods, player) {},

    /**
     * 武器升级
     */
    _applyWeaponLevelUp(player) {},

    /**
     * 武器品质升级
     */
    _applyWeaponQualityUp(player) {},

    /**
     * 添加武器槽
     */
    _applyWeaponSlotUp(player) {},

    /**
     * 添加被动
     */
    _applyPassive(passiveId, player) {},


    // -------------------------------------------------------
    // 7.4 查询/重置
    // -------------------------------------------------------

    getCurrentCards() {},
    reset() {
        this.currentCards = [];
        this._generatedIds = new Set();
    },
};
```

---

## 八、与 stats.js 旧 levelUpOptions 的关系

| Phase | 动作 |
|-------|------|
| Phase 2 | 新增 `LevelUpSystem` + `src/data/levelUpCards.json` |
| Phase 2 | `stats.js.levelUpOptions` 保留并标记 `@deprecated` |
| Phase 3 | `main.js` 和 `ui.js` 改用 `LevelUpSystem` |
| Phase 3 | 删除 `stats.js.levelUpOptions` |

---

## 九、验收标准

- [ ] `levelUpCards.json` 包含 30+ 张卡，覆盖全部 6 类属性
- [ ] `generateCards()` 返回 3~5 张卡，不重复
- [ ] 流派偏向：用 fire 武器 → fire Tag 卡概率 +25%
- [ ] `applyCard()` statMods 正确生效（add/mult 两种模式）
- [ ] 武器等级升级工作正常
- [ ] 被动技能卡正确注册到 PassiveSystem
- [ ] 稀有度颜色在 UI 上正确显示
- [ ] 旧 `levelUpOptions` 保留但标记 deprecated