# Module: csv2json — CSV→JSON 数据适配层

**依赖**: 无（独立模块，可立即实现）
**执行顺序**: 1（最先实现，所有 Phase 都依赖它）

---

## 一、目录结构

```
项目根/
├── csv/                        ← [NEW] 人工编辑源, Excel/Sheets 友好
│   ├── characters.csv          ← 角色数据
│   ├── weapons.csv             ← 武器数据
│   ├── items.csv               ← 道具数据
│   ├── enemies.csv             ← 敌人数据
│   ├── bosses.csv              ← Boss 数据（含 JSON 子列）
│   └── waves.csv               ← 波次配置
│
├── scripts/                    ← [NEW] 构建工具
│   └── csv2json.js             ← 转换脚本 (Node.js)
│
├── src/
│   └── data/                   ← [NEW] 运行时 JSON（由 csv2json.js 生成）
│       ├── characters.json
│       ├── weapons.json
│       ├── items.json
│       ├── enemies.json
│       ├── bosses.json
│       └── waves.json
│
├── src/engine/
│   └── data.js                 ← [NEW] 统一数据加载器（fetch JSON）
│
├── data/                       ← [OLD] 当前 .md 表格（重构完成后删除）
│   ├── characterTable.md
│   ├── weaponTable.md
│   ├── itemTable.md
│   └── enemyTable.md
│
└── aiworkflow/plan/           ← Pro-Flash 协作文档（本文件）
    └── csv2json.plan.md
```

---

## 二、核心设计决策

### 2.1 CSV 是源，JSON 是产物

```
策划编辑 csv/*.csv (Excel/Google Sheets)
         │
         ▼
   scripts/csv2json.js (Node 端运行)
         │
         ▼
   src/data/*.json (静态文件，提交到 Git)
         │
         ▼
   src/engine/data.js 在运行时 fetch JSON
```

### 2.2 什么时候用纯 CSV，什么时候 CSV 里嵌 JSON

| 数据类型 | 格式 | 原因 |
|---------|------|------|
| characters, enemies, weapons, items, waves | **纯 CSV** | 行=实体，列=属性，天然扁平 |
| bosses（多阶段技能） | **CSV + JSON 子列** | 每阶段有 N 个技能，CSV 列会爆炸，用 JSON 列收容 |

### 2.3 转换脚本不侵入运行时

`scripts/csv2json.js` 是纯 Node 脚本，**不进入浏览器 bundle**。它只是开发工具。
双击 `index.html` 时，`src/data/*.json` 已经生成好了，零依赖。

---

## 三、CSV Schema 设计

### 3.1 characters.csv

```csv
id,name,desc,icon,unlocked,weaponSlots,maxHp,hpRegen,speed,damagePercent,attackSpeed,attackRange,armor,dodge,critChance,critDamage,lifeSteal,harvesting,luck,xpGain,meleeDamage,rangedDamage,elementalDamage,engineering,tags,unlockType,unlockValue,passives
default,默认,均衡型,,true,6,100,0.5,200,0,1.0,300,3,0.03,0.05,2.0,0,0,0,0,0,0,0,0,,,
glassCannon,玻璃大炮,+50%伤害 -5护甲,,true,6,80,0.3,200,0.5,1.0,300,-2,0.03,0.05,2.0,0,0,0,0,0,0,0,0,,,
tank,坦克,+10护甲 +50HP -20%伤害 -5速,,true,6,150,0.5,155,-0.2,1.0,280,13,0.02,0.05,1.8,0,0,0,0,0,0,0,0,,,
...
```

**列说明：** 27 列，完全扁平。`tags` 用 `|` 分隔（如 `melee|fire`）。`passives` 引用 `passives.json` 中的 passive ID，多个用 `|` 分隔。

### 3.2 weapons.csv

```csv
id,name,desc,icon,slots,cost,tag,damageMult,attackSpeedMult,attackRangeMult,speedMult,critChanceAdd,critDamageAdd,armorAdd,hpRegenAdd,maxHpAdd,lifeStealAdd,bulletCount,bulletSpeed,attackRange,spread,pierce,meleeRange,burnDps,burnMaxStacks,chainCount,splashRadius,homingStrength,slowAmount,slowDuration,healOnHit,auraHeal,auraRadius,sprayCone,behavior
pistol,基础手枪,平衡型,,1,0,gun,0,0,0,0,0,0,0,0,0,0,1,500,320,0.1,0,,,,,,,,,,,bullet
...
```

**列说明：** 比现有 weaponTable.md 更扁——原 JSON 内嵌的 mods 对象摊平为独立列（`damageMult` → 独立列），不再有 JSON 嵌套在 CSV 中。

### 3.3 items.csv

```csv
id,name,desc,cost,icon,unique,rarity,tags,triggers,effects
hpUp,生命核心,最大生命+30,6,❤️,false,common,,,
replicator,子弹复制器,20%概率射出双倍子弹,14,🖨️,true,epic,gun|ranged,OnHit,"[{\"type\":\"duplicateBullet\",\"chance\":0.2}]"
```

**列说明：** `triggers` 列用 `|` 分隔多个触发器（`OnHit|OnKill`）。`effects` 列存 JSON 数组——因为道具效果本质上是结构化的链，强行摊平成 CSV 列得不偿失。`tags` 用 `|` 分隔。

### 3.4 enemies.csv

```csv
id,name,behavior,hp,speed,damage,radius,color,glowColor,xpValue,materialValue,attackCooldown,isElite,isBoss,paramsJson,specialMechanic
basic,无人机兵,chaser,30,80,8,14,#ff4444,#ff0044,5,2,1.5,false,false,,
runner,疾行者,runner,20,160,6,10,#ff8800,#ff6600,6,2,1.2,false,false,,
tank,重装机兵,tank,120,45,15,22,#8844ff,#6622ff,12,5,2.0,false,false,,
shooter,狙击手,shooter,25,55,12,12,#ff00aa,#ff0088,8,3,2.0,false,false,"{""preferredDist"":250,""bulletSpeed"":350}",
splitter,分裂者,chaser,35,70,10,14,#44ff44,#22ff66,8,3,1.5,false,false,,splitOnDeath
shielded,护盾兵,chaser,60,50,12,18,#8888ff,#6666ff,10,4,2.0,false,false,,shield
...
```

**列说明：** `paramsJson` 列存 JSON 对象（行为专属参数，如射击距离）。`specialMechanic` 用枚举值（`splitOnDeath`, `shield`, `leech`, `reflect`, `freeze`）或空。

### 3.5 bosses.csv

```csv
id,name,baseHp,baseSpeed,baseDamage,radius,color,glowColor,xpValue,materialValue,phaseCount,phasesJson
fireLord,火焰领主,1500,40,25,40,#ff4400,#ff2200,200,100,3,"[{""hpPercent"":100,""skills"":[{""type"":""melee_sweep"",""damageMult"":1.0},{""type"":""summon"",""count"":3}]},{""hpPercent"":70,""skills"":[{""type"":""fire_breath"",""damageMult"":1.5},{""type"":""summon"",""count"":5}]},{""hpPercent"":30,""skills"":[{""type"":""fire_storm"",""damageMult"":2.0},{""type"":""charge"",""damageMult"":2.5}]}]"
```

**列说明：** `phasesJson` 是嵌套 JSON——Boss 的多阶段行为本身就是结构化数据，CSV 列无法合理表达。JSON 在 CSV 列中，转换脚本解析它合并进输出。

### 3.6 waves.csv

```csv
waveNumber,minBudget,maxBudget,availableBehaviors,availableMechanics,spawnPattern,specialRule
1,8,10,chaser,,random,
2,12,14,chaser,,random,
3,16,18,chaser|runner,,random,
4,20,22,chaser|runner|shooter,,random,
5,24,26,chaser|runner|shooter,,circle,
...
10,50,55,chaser|runner|tank|shooter|bomber,splitter|shielded,random,
15,80,90,chaser|runner|tank|shooter|bomber|swarm|summoner,splitter|shielded|leech|reflect,random,bossEvery5
```

**列说明：** `availableBehaviors` 和 `availableMechanics` 用 `|` 分隔。转换脚本转成 JSON 数组。

---

## 四、csv2json.js 接口设计

```js
// scripts/csv2json.js
// Node.js 脚本，不进入浏览器

const CSV2JSON = {
    /**
     * 解析 CSV 文本 → 对象数组
     * @param {string} text - CSV 原始文本
     * @param {Object} schema - 列定义 { 列名: 类型 }
     *   类型: 'string' | 'number' | 'boolean' | 'json' | 'array'
     * @returns {Object[]}
     */
    parse(text, schema) {},

    /**
     * 转换单个 CSV 文件 → 写入 JSON 文件
     * @param {string} csvPath - csv/xxx.csv
     * @param {string} jsonPath - src/data/xxx.json
     * @param {Object} schema - 列定义
     */
    convert(csvPath, jsonPath, schema) {},

    /**
     * 一键转换全部
     */
    convertAll() {},
};

// 入口：node scripts/csv2json.js
CSV2JSON.convertAll();
```

### Schema 示例

```js
// characters 的 schema
const characterSchema = {
    id: 'string',
    name: 'string',
    desc: 'string',
    icon: 'string',
    unlocked: 'boolean',
    weaponSlots: 'number',
    maxHp: 'number',
    hpRegen: 'number',
    speed: 'number',
    damagePercent: 'number',
    attackSpeed: 'number',
    attackRange: 'number',
    armor: 'number',
    dodge: 'number',
    critChance: 'number',
    critDamage: 'number',
    lifeSteal: 'number',
    harvesting: 'number',
    luck: 'number',
    xpGain: 'number',
    meleeDamage: 'number',
    rangedDamage: 'number',
    elementalDamage: 'number',
    engineering: 'number',
    tags: 'array',          // "melee|fire" → ["melee","fire"]
    unlockType: 'string',
    unlockValue: 'number',
    passives: 'array',
};
```

---

## 五、data.js 统一加载器

```js
// src/engine/data.js
// 运行时加载器，替代分散的 CSV 解析

const DataLoader = {
    /** 内部缓存，避免重复 fetch */
    _cache: {},

    /**
     * 加载 JSON 数据文件
     * @param {string} name - 文件名 (不含 .json)
     * @returns {Promise<Object>}
     */
    async load(name) {
        // 算法:
        // 1. 检查 _cache，命中直接返回
        // 2. fetch('src/data/{name}.json') 
        // 3. 存入 _cache
        // 4. 返回解析后的对象
    },

    /**
     * 预加载全部数据
     * @returns {Promise<void>}
     */
    async preloadAll() {
        // 在游戏启动时并行 fetch 所有 JSON
        // await Promise.all([load('characters'), load('weapons'), ...])
    },
};
```

### 使用方式

```js
// 旧方式（删除）：
// const raw = await fetch('data/characterTable.md').then(r => r.text());
// const chars = parseCSVTable(raw);

// 新方式：
const chars = await DataLoader.load('characters');
// chars = [{ id: "default", name: "默认", maxHp: 100, ... }, ...]
```

---

## 六、与现有 csv.js 的关系

现有 `src/engine/csv.js` 只含一个 `splitCSVLine()` 函数。

**重构后：**

| 文件 | 用途 | 状态 |
|------|------|------|
| `src/engine/csv.js` | 旧的运行时 CSV 解析 | **删除**（或保留为空壳待清理） |
| `scripts/csv2json.js` | 构建时 CSV→JSON 转换 | **新增** |
| `src/engine/data.js` | 运行时 JSON 加载 | **新增** |

---

## 七、验收标准

- [ ] `csv/` 下有 6 个 CSV 文件，格式符合 Schema，可在 Excel 中打开编辑
- [ ] `node scripts/csv2json.js` 无报错运行，生成 `src/data/*.json`
- [ ] 生成的 JSON 可以 `JSON.parse()` 无损还原
- [ ] `data.js` 的 `load()` 方法可在浏览器 console 中成功 fetch 并返回结构化数据
- [ ] 现有 `data/*.md` 文件被标记为 deprecated（但不立即删除）
- [ ] 每个 CSV 文件头部有注释行说明列定义