# TEST_PLAN.md — 测试规划：tags + stats 模块

## 一、测试策略

### 整体方案

| 决策 | 选择 | 理由 |
|------|------|------|
| 测试框架 | **Vitest** | 零配置、运行快、支持 ESM/CJS、与浏览器代码兼容 |
| 运行环境 | Node.js <sup>1</sup> | tags.js / stats.js 均为纯逻辑，无 DOM 依赖 |
| 断言风格 | Vitest built-in `expect` | 无需额外依赖 |
| 覆盖率 | `@vitest/coverage-v8` | 可选，不强制 |
| 测试文件位置 | `test/unit/tags.test.js`, `test/unit/stats.test.js` | 按模块分文件 |
| 数据文件位置 | `test/fixtures/` | 存放测试用武器/道具/玩家 fixture 数据 |

> <sup>1</sup> 如果将来需测试 DOM/WebGL 模块，用 `jsdom` 或 `happy-dom` 环境。

### setup 步骤

```bash
# 1. 初始化 package.json（如尚未存在）
echo '{"type":"module","scripts":{"test":"vitest run","test:watch":"vitest"}}' > package.json

# 2. 安装 vitest
npm install -D vitest

# 3. 运行测试
npm test
```

或使用 `node:test`（Node 18+ 内置，零依赖）作为备选方案——Vitest 优先。

---

## 二、tags 模块测试用例

### 2.1 标签元数据

| # | 测试 | 输入 | 期望 | 优先级 |
|---|------|------|------|--------|
| T1 | `getTagDef('melee')` | 'melee' | `{ id:'melee', name:'近战', icon:'⚔️' }` | P0 |
| T2 | `getTagDef('gun')` | 'gun' (旧标签) | 应映射为 `{ id:'ranged', ... }` | P0 |
| T3 | `getTagDef('nonexistent')` | 'nonexistent' | `null` | P0 |
| T4 | `getAllTagIds()` | — | `['melee','ranged','fire','explosive','crit','tech','economy']` | P0 |
| T5 | `normalizeTag('gun')` | 'gun' | `'ranged'` | P0 |
| T6 | `normalizeTag('melee')` | 'melee' | `'melee'`（已在 7 标签内→不变） | P0 |

### 2.2 标签计数

| # | 测试 | 输入 | 期望 | 优先级 |
|---|------|------|------|--------|
| T7 | `countWeaponTags([])` | 空数组 | `{melee:0, ranged:0, fire:0, explosive:0, crit:0, tech:0, economy:0}` | P0 |
| T8 | `countWeaponTags([{tag:'melee'}, {tag:'melee'}, {tag:'ranged'}])` | 3 武器 | `{melee:2, ranged:1, ...}` | P0 |
| T9 | `countWeaponTags([{tag:'gun'}])` | gun（旧标签） | `{..., ranged:1, ...}` | P0 |
| T10 | `countWeaponTags([{tag:'medic'}])` | medic（旧标签） | `{..., tech:1, ...}` | P0 |
| T11 | `countItemTags([])` | 空数组 | 同上全零 | P0 |
| T12 | `countItemTags([{tags:['fire','ranged']}, {tags:['melee']}])` | 2 道具 | `{melee:1, ranged:1, fire:1, ...}` | P0 |
| T13 | `countItemTags([{tags:['fire','fire']}])` | 重复标签 | `{..., fire:2, ...}`（道具允许多标签） | P1 |
| T14 | `mergeTagCounts({melee:3}, {melee:2})` | 武器3+道具2 | `{melee: 3 + 2×0.5 = 4, ...}` | P0 |
| T15 | `mergeTagCounts({}, {})` | 空对象 | 全部为 0 | P0 |

### 2.3 流派判定

| # | 测试 | 输入 | 期望 | 优先级 |
|---|------|------|------|--------|
| T16 | `determineBuild({melee:3, ranged:1})` | 近战多 | `{primary:'melee', secondary:'ranged'}` | P0 |
| T17 | `determineBuild({melee:3, fire:3, ranged:1})` | 并列 | `{primary:'melee', secondary:'ranged'}`（先定义者优先） | P0 |
| T18 | `determineBuild({})` | 全零 | `{primary:null, secondary:null}` | P0 |
| T19 | `determineBuild({melee:1})` | 单一流派 | `{primary:'melee', secondary:null}` | P0 |

### 2.4 Synergy 加成

| # | 测试 | 输入 | 期望 | 优先级 |
|---|------|------|------|--------|
| T20 | `getActiveSynergies([])` | 无武器 | `[]` | P0 |
| T21 | `getActiveSynergies([{tag:'melee'}, {tag:'melee'}])` | 2 近战 | 触发 melee 2 层 synergy | P0 |
| T22 | `getActiveSynergies([{tag:'melee'}]*4)` | 4 近战 | 触发 melee 4 层 synergy（含 2 层 + 4 层） | P0 |
| T23 | `getActiveSynergies([...6 melee])` | 6 近战 | 触发 melee 6 层 synergy | P0 |
| T24 | `mergeSynergyBonuses(...)` | 多 synergy | 加成正确合并加算 | P0 |
| T25 | `mergeSynergyBonuses([])` | 空 | `{}` | P0 |

### 2.5 流派偏向

| # | 测试 | 输入 | 期望 | 优先级 |
|---|------|------|------|--------|
| T26 | `getBiasWeights({})` | 无计数 | 全部 1.0 | P0 |
| T27 | `getBiasWeights({melee:3, ranged:1})` | 有流派 | melee > ranged > 其他 | P0 |
| T28 | `getBiasWeights({melee:3}, 0.5)` | 高偏向强度 | melee 权重更高 | P1 |

### 2.6 过滤查询

| # | 测试 | 输入 | 期望 | 优先级 |
|---|------|------|------|--------|
| T29 | `filterByTag([{tag:'melee'},{tag:'ranged'}], 'melee')` | 过滤 melee | 返回第一个对象 | P0 |
| T30 | `hasTag({tag:'melee'}, 'melee')` | 武器格式 | `true` | P0 |
| T31 | `hasTag({tags:['fire']}, 'fire')` | 道具格式 | `true` | P0 |
| T32 | `hasTag({tag:'gun'}, 'ranged')` | 旧标签映射 | `true` | P0 |
| T33 | `getTags({tag:'melee'})` | 武器 | `['melee']` | P0 |
| T34 | `getTags({tags:['fire','ranged']})` | 道具 | `['fire','ranged']` | P0 |
| T35 | `getTags(null)` | null | `[]` | P0 |

---

## 三、stats 模块测试用例

### 3.1 四层伤害公式

#### 测试数据约定

```js
// 基础武器 fixture
const baseWeapon = {
    id: 'test_weapon',
    damageMult: 1.0,   // Phase 1 兼容
    tag: 'melee',
};
// 基础玩家 fixture
const basePlayer = {
    _baseDamage: 15,
    damagePercent: 0,
    meleeDamage: 0,
    rangedDamage: 0,
    elementalDamage: 0,
    engineering: 0,
    critChance: 0,
    critDamage: 2.0,
};
// 基础敌人 fixture
const baseTarget = {
    hp: 100,
    burning: false,
    slowed: false,
    isElite: false,
};
```

#### 测试用例

| # | 测试 | 输入 | 公式验证 | 期望 | 优先级 |
|---|------|------|---------|------|--------|
| S1 | 纯 Base 层 | weapon={damageMult:1.0}, player={_baseDamage:15} | B=15×1.0=15, F=0, P=1, C=1(未暴击), S=1 | `calcDamage → 15` | P0 |
| S2 | Base + Flat | weapon={damageMult:1.0, tag:'melee'}, player={_baseDamage:15, meleeDamage:10} | B=15, F=10, total=25 | `calcDamage → 25` | P0 |
| S3 | Flat 按 Tag 映射 | weapon={damageMult:1.0, tag:'ranged'}, player={_baseDamage:15, meleeDamage:10, rangedDamage:5} | F=5 (rangedDamage) | `calcDamage → 20` | P0 |
| S4 | Percent 层 | +50% | B=15, F=0, P=1.5, total=22.5 | `calcDamage → 23` (round) | P0 |
| S5 | 暴击命中 | critChance=1.0 (必暴) | C=critDamage=2.0 | `calcDamage → 30` | P0 |
| S6 | 暴击未命中 | critChance=0 | C=1.0 | `calcDamage → 15` | P0 |
| S7 | 四层全满 | meleeDamage=5, damagePercent=0.5, crit, berserker | (15+5)×1.5×2.0×1.3=78 | `calcDamage → 78` | P0 |
| S8 | berserkerBlood 触发 | player.hp < maxHp×0.3, player.berserkerBlood=true | S×=1.3 | 比不触发时高 30% | P0 |
| S9 | berserkerBlood 不触发 | player.hp >= maxHp×0.3 | S=1.0 | 比触发时低 | P0 |
| S10 | 旧兼容：damage 代替 damagePercent | player={_baseDamage:15, damage:0.5, damagePercent:undefined} | 用 damage 回退 | 结果 = S4 相同 | P0 |
| S11 | 旧兼容：critMultiplier 代替 critDamage | 类似 S10 | | 结果正确 | P0 |

### 3.2 DPS 计算

| # | 测试 | 输入 | 期望 | 优先级 |
|---|------|------|------|--------|
| S12 | `calcDPS` 纯 Base | weapon={damageMult:1.0}, player={_baseDamage:15, attackSpeed:1.0} | avg=15, DPS=15×1.0=15 | P0 |
| S13 | `calcDPS` 攻速加成 | attackSpeed=1.5 | DPS=avg×1.5 | P0 |
| S14 | `calcDPS` 暴击期望 | critChance=0.5, critDamage=2.0 | C_exp=1+0.5×(2-1)=1.5, DPS=15×1.5×1.0=22.5 | P0 |
| S15 | `calcDPS` 不应用 S 层 | 即使有 berserkerBlood 条件 | S_default=1.0 | P0 |

### 3.3 护甲/减伤

| # | 测试 | 输入 | 期望 | 优先级 |
|---|------|------|------|--------|
| S16 | `armorDR(0)` | 0 | 0 | P0 |
| S17 | `armorDR(50)` | 50 | 0.5 | P0 |
| S18 | `armorDR(100)` | 100 | 100/150 ≈ 0.6667 | P0 |
| S19 | `calcDamageReduction(100, 50)` | 100 damage vs 50 armor | max(1, floor(100×0.5))=50 | P0 |

### 3.4 属性分类与格式化

| # | 测试 | 输入 | 期望 | 优先级 |
|---|------|------|------|--------|
| S20 | `getStatsByCategory('survival')` | — | 返回生存类 6 属性定义 | P0 |
| S21 | `getStatsByCategory('invalid')` | — | `[]` | P0 |
| S22 | `formatStat('maxHp', 100)` | int | `'100'` | P0 |
| S23 | `formatStat('hpRegen', 0.5)` | float1 | `'0.5'` | P0 |
| S24 | `formatStat('attackSpeed', 1.55)` | float2 | `'1.55'` | P0 |
| S25 | `formatStat('critChance', 0.25)` | percent | `'25%'` | P0 |
| S26 | `formatStat('nonexistent', 10)` | 无定义 | `'10'` | P1 |

### 3.5 属性钳制

| # | 测试 | 输入 | 期望 | 优先级 |
|---|------|------|------|--------|
| S27 | `clampStat('dodge', 0.7)` | 超 max | 0.6 | P0 |
| S28 | `clampStat('attackSpeed', 0.1)` | 低于 min | 0.2 | P0 |
| S29 | `clampStat('maxHp', 100)` | 在范围内 | 100 | P0 |
| S30 | `clampPlayer({hp:200, maxHp:100})` | HP 超上限 | hp 钳为 100 | P0 |

### 3.6 getDisplayStats 结构化输出

| # | 测试 | 输入 | 期望 | 优先级 |
|---|------|------|------|--------|
| S31 | `getDisplayStats(null)` | null | `[]` | P0 |
| S32 | `getDisplayStats({})` | 空对象 | 默认值列表（非 0 属性） | P0 |
| S33 | `getDisplayStats({maxHp:100})` | 部分属性 | 含 maxHp 行, icon/label/value/raw/extra 结构正确 | P0 |
| S34 | armor 显示额外含减伤率 | 同上 | note 字段含减伤百分比 | P0 |

### 3.7 经验系统（不变）

| # | 测试 | 输入 | 期望 | 优先级 |
|---|------|------|------|--------|
| S35 | `xpForLevel(1)` | 1 | 20 | P0 |
| S36 | `xpForLevel(3)` | 3 | 20+2×15=50 | P0 |
| S37 | `xpForLevel(6)` | 6 | `floor(80+1×30)=110` | P0 |
| S38 | `xpForLevel(15)` | 15 | `floor(230+5×60)=530` | P0 |
| S39 | `xpForLevel(25)` | 25 | `floor(830+5×120)=1430` | P0 |

---

## 四、Fixtures 文件清单

```
test/fixtures/
  weapons.simple.js    — 3~5 把测试用武器（含旧标签、新标签）
  items.simple.js      — 3~5 个测试用道具
  player.base.js       — 基础玩家属性对象
  target.base.js       — 基础敌人对象
```

### fixture 示例 (`player.base.js`)

```js
export const basePlayer = {
    _baseDamage: 15,
    hp: 100,  maxHp: 100,
    damagePercent: 0,
    meleeDamage: 0,  rangedDamage: 0,
    elementalDamage: 0,  engineering: 0,
    critChance: 0,  critDamage: 2.0,
    attackSpeed: 1.0,
    armor: 0,  dodge: 0,
    lifeSteal: 0,
    speed: 200,
    luck: 0,  harvesting: 0,  xpGain: 0,  materialGain: 0,
    // 兼容层旧字段
    damage: 0,
    critMultiplier: 2.0,
};
```

---

## 五、运行方式

```bash
# 1. 安装
npm install -D vitest

# 2. 运行全部测试
npm test                   # vitest run

# 3. 带 UI 模式（可选）
npx vitest --ui

# 4. 按模块运行
npx vitest test/unit/tags.test.js
npx vitest test/unit/stats.test.js
```

---

## 六、验收标准

- [ ] `npm test` 全部通过（tags + stats）
- [ ] tags 测试覆盖 7 标签元数据、计数、流派判定、synergy、偏向、过滤查询
- [ ] stats 测试覆盖四层伤害公式（B/F/P/C/S 各层 + 组合）、DPS、护甲、属性分类、格式化、钳制
- [ ] 兼容层测试覆盖旧字段 `damage` / `critMultiplier` 回退
- [ ] `getDisplayStats` 输出结构被测试验证
- [ ] `xpForLevel` 保持与旧代码一致
- [ ] fixtures 数据可复用于后续模块测试
