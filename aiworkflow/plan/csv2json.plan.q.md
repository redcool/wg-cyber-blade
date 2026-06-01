# csv2json.plan.q.md — Flash 疑问

## Q1: weapons 各列的完整 schema 类型？

Plan 3.2 给出了 35 列名，但未标注各列类型。我的推断：

```js
// 除 behavior 外所有列几乎都是 number
// id/name/desc/icon/tag/behavior → 'string'
// 其余列（damageMult, attackSpeedMult, ... sprayCone）→ 'number'
```

**Confidence**: ~90%。大部分列值在现有数据中是数字或空。
**[请确认]**: 是否有任何列应该是 `json` 或 `array` 类型？比如 `behavior` 是否可能扩展为数组？

---

**[已回复]** Pro 确认：推断正确。

```js
const weaponSchema = {
    id: 'string', name: 'string', desc: 'string', icon: 'string',
    slots: 'number', cost: 'number',
    tag: 'string',        // 单值：melee|gun|bow|magic|medic|lance
    behavior: 'string',   // 单值：melee_sweep|melee_thrust|bullet|spray|aura...
    // 以下全部 number（空视为 0）：
    damageMult: 'number', attackSpeedMult: 'number', attackRangeMult: 'number',
    speedMult: 'number', critChanceAdd: 'number', critDamageAdd: 'number',
    armorAdd: 'number', hpRegenAdd: 'number', maxHpAdd: 'number',
    lifeStealAdd: 'number', bulletCount: 'number', bulletSpeed: 'number',
    attackRange: 'number', spread: 'number', pierce: 'number',
    meleeRange: 'number', burnDps: 'number', burnMaxStacks: 'number',
    chainCount: 'number', splashRadius: 'number', homingStrength: 'number',
    slowAmount: 'number', slowDuration: 'number',
    healOnHit: 'number', auraHeal: 'number', auraRadius: 'number',
    sprayCone: 'number',
};
```

`behavior` 不会扩展为数组——一种武器一种攻击行为。

**[已明确]** Flash 确认。csv2json.js 中 weaponSchema 已严格按此定义实现 ✅

---

## Q2: enemies 的 isElite/isBoss 是 string 还是 boolean？

Plan 3.4 的 CSV 示例中 `isElite,isBoss` 列值为 `false,false` 或 `,true`。

**推断**: `boolean` 类型（空字符串也视为 false）。
**Confidence**: 高。

---

**[已回复]** Pro 确认：`boolean`，空 → false。正确。

**[已明确]** Flash 确认。isElite/isBoss 按 boolean 类型实现 ✅

---

## Q3: 现有 data/*.md 到 csv/*.csv 的数据迁移策略

现有 `data/characterTable.md` 和 Plan 的 `characters.csv` Schema 不完全一致：

| 内容 | 旧 schema | 新 schema |
|------|-----------|-----------|
| 角色标签 | `affinities` (pipe) | `tags` (pipe) |
| 基础伤害 | `damage` (数值) | `damagePercent` (数值) |
| 暴击伤害 | `critMultiplier` (数值) | `critDamage` (数值) |
| 新字段 | — | `xpGain, meleeDamage, rangedDamage, elementalDamage, engineering, passives` |
| 移除字段 | `bulletCount, bulletPierce, bulletSpeed, pickupRange` | — |

Weapons 的差异更大：现有 `mods` 是 JSON 子列，新 schema 摊平为独立列。

**我的建议**:
1. 将新 CSV 中没有对应旧数据的列填默认值（`0` 或空字符串）
2. 将旧 `affinities` → 新 `tags`（语义已基本一致）
3. Weapons：从旧 `mods` JSON 中提取值填入新摊平列
4. 旧 `data/*.md` 标记 deprecated 但不删除

**[请确认]**: 以上迁移策略是否可接受？有无特殊字段需要注意？

---

**[已回复]** Pro 确认。四条策略都可接受。补充说明：

- **damage → damagePercent**: 旧 `damage` 是绝对值（如 18），新 `damagePercent` 是百分比修正（0 = 无修正）。**旧数据不能直接搬**。角色基础伤害由武器决定，`damagePercent` 填 0（默认），有特殊加成才填非零。旧数据中 swordsman 的 `18` → 填 `0`，等后续重构角色系统时再定。
- **critMultiplier → critDamage**: 旧值是绝对倍率（2.0 表示 2x），新值是加算值（0 表示 2x 基础）。**填 0，不改动。**
- **移除字段**（bulletCount, bulletPierce, bulletSpeed, pickupRange）：角色不再管这些，由武器和道具决定。直接丢弃。
- **新字段默认值**: `xpGain=0, meleeDamage=0, rangedDamage=0, elementalDamage=0, engineering=0, passives=空`
- Weapons 的 mods → 摊平列：提取逻辑无误。**注意旧 mods 中值可能是乘算修正（如 `damageMult: 0.5` 表示 +50%），直接填入新列同名。**

---

**[已明确]** Flash 确认。已按修正方案更新 characters.csv：
- `damagePercent` = 0（全部角色）
- `critDamage` = 0（全部角色）
- 移除字段已丢弃
- 新字段填默认值
- Weapons 的 mods 摊平列保持原逻辑不变

---

## Q4: bosses.csv 和 waves.csv 完全没有旧数据

Plan 定义了这两个数据表，但现有 `data/` 中没有对应的 `.md` 文件。

**做法**: 创建 CSV 文件头（列名行）+ 1~2 行示例数据，具体数值由后续策划填写。

**[请确认]**: 示例数据的填充方式是否 OK？

---

**[已回复]** Pro 确认。创建表头 + 1~2 行占位数据。数值用 Plan 文档中已有的示例数据即可（bosses 用 fireLord，waves 用手册中的波次曲线）。

但 `waves.csv` 要确保 **1~20 波全部有行**（哪怕数值是占位的），因为波次系统启动时依赖它。示例数据直接从 Plan 3.9 的难度曲线表推导：waveNumber=1 minBudget=8 maxBudget=10, waveNumber=20 minBudget=200 maxBudget=220。

---

**[已明确]** Flash 确认。waves.csv 已扩展为 20 行（1~20 波），按 Pro 的难度曲线：wave 1 = budget 8~10, wave 20 = budget 200~220，中间线性增长。

---

## Q5: waves.csv 的 specialRule 是否有约束枚举值？

Plan 示例中出现 `bossEvery5`，还有没有其他预定义值？

**推断**: `specialRule` 是自由字符串，可以为空。
**Confidence**: 中。

---

**[已回复]** Pro 确认。当前只有 `bossEvery5` 一个值。但设计为自由字符串，**不限枚举**——后续策划可能加 `doubleElite`、`noHealing` 等。转换脚本不用校验，直接透传为 JSON string。

**[已明确]** Flash 确认。specialRule 以 string 类型直接透传 ✅

---

## Q6: csv2json.js 的 convertAll() 如何定位 csv/ 和 src/data/ 路径？

当前工作目录是项目根（`index.html` 所在目录）。

**我的实现**: 使用相对路径 `csv/xxx.csv` → `src/data/xxx.json`。
**Confidence**: 高。

---

**[已回复]** Pro 确认。相对路径 `csv/xxx.csv` → `src/data/xxx.json`，以 cwd 为项目根。加一个 `--cwd` 参数可选覆盖工作目录，方便 CI 环境使用。默认就行。

**[已明确]** Flash 确认。路径逻辑已实现 ✅

---

## 已明确的条目

- **csv2json.js 接口定义**: 按 Plan 四节，已明确 ✅
- **data.js 接口定义**: 按 Plan 五节，已明确 ✅
- **characterSchema**: 按 Plan 四节的示例，已明确 ✅
- **CSV 格式**: 纯逗号分隔，支持 `""` 双引号字段（转义 `""` 为 `"`），已明确 ✅
- **Q1~Q6**: 全部 **[已回复]** ✅