# 角色 class 偏好系统 v1.0

> **配合**: [`武器分类体系.md`](./武器分类体系.md) 4 元阶梯 + `src/engine/character.js` + `src/engine/formula.js`
>
> **目标**: 让"剑客拿武士刀 1.0 / 拿长剑 0.85 / 拿斧 0.50 / 拿枪 0.10" 4 元伤害阶梯落地
>
> **版本**: v1.0 · 2026-06-07

---

## 一、现有 19 角色 → class 偏好映射

> **v1.1 新增**: 弩手 `crossbowman` (累计击杀≥60 解锁) + 7 角色补全 (boxer/axeman/lancer/blade_wielder/ninja/ji_master/teng_pai_guard)
>
> **无破坏**: 旧字段 `tags` 保留,新增 `preferredClasses` / `preferredClasses_2`。
>
> **槽位简化**: 所有武器占 1 槽,角色 `maxWeapons` 4-6 (替代旧 `weaponSlots`)。

### 1.1 默认解锁 (4 个)

| 角色 | ID | tags (旧,保留) | preferredClasses (新) | preferredClasses_2 (新) | maxWeapons | 设计意图 |
|------|----|----------------|----------------------|------------------------|------------|---------|
| 剑客 | `swordsman` | `['melee', 'lance']` | `['Blade', 'Heavy', 'Precise']` | `['katana', 'longsword', 'rapier', 'lance', 'halberd']` | **6** | 刀剑+骑枪全能 |
| 枪手 | `gunslinger` | `['gun']` | `['Gun']` | `['pistol', 'revolver', 'rifle', 'sniper']` | **6** | 全部枪械,专精 4 种 |
| 火焰法师 | `fire_mage` | `['magic', 'fire']` | `['Elemental', 'Explosive']` | `['fire', 'lightning', 'force']` | **6** | 火/雷/能量 3 元素 |
| 弓箭游侠 | `archer` | `['bow']` | `['Bow', 'Crossbow']` | `['longbow', 'recurve', 'handcrossbow', 'heavycrossbow']` | **6** | 弓+弩双系 |

### 1.2 解锁角色 (15 个) ⭐ v1.1 新增 8 角色 (弩手 + 7 补全)

| 角色 | ID | tags (旧,保留) | preferredClasses (新) | preferredClasses_2 (新) | maxWeapons | 解锁条件 | 设计意图 |
|------|----|----------------|----------------------|------------------------|------------|---------|---------|
| 重型机甲 | `mech` | `['gun', 'melee', 'lance']` | `['Heavy', 'Gun']` | `['warhammer', 'greataxe', 'lmg', 'hmg', 'lance']` | **5** | 最高等级≥5 | 重型+重火力 |
| 疾影刺客 | `assassin` | `['melee', 'bow', 'lance']` | `['Precise', 'Blade']` | `['dagger', 'rapier', 'kris', 'stiletto', 'composite']` | **4** | 累计击杀≥100 | 匕首+精准 |
| 医疗兵 | `medic` | `['medic']` | `['Medical', 'Elemental']` | `['heal', 'regen', 'holy', 'force']` | **6** | 累计击杀≥80 | 治疗+神圣 |
| 圣骑士 | `paladin` | `['melee', 'medic', 'lance']` | `['Blade', 'Medical', 'Heavy']` | `['longsword', 'holy', 'heal', 'lance', 'halberd']` | **6** | 最高等级≥10 | 剑+神圣+骑枪 |
| 工程师 | `engineer` | `['gun', 'magic']` | `['Gun', 'Elemental', 'Explosive']` | `['rifle', 'sniper', 'force', 'lightning', 'grenade', 'rocket']` | **6** | 累计击杀≥200 | 科技+火药+元素 |
| **弩手** ⭐ | `crossbowman` | `['bow']` | `['Crossbow', 'Bow']` | `['handcrossbow', 'heavycrossbow', 'repeating', 'longbow']` | **6** | 累计击杀≥60 | 弩系专精 (3 弩 + 1 弓 fallback) |
| **拳手** ⭐ | `boxer` | `['melee', 'crit']` | `['Heavy', 'Blunt']` | `['fist', 'gauntlet', 'tonfa', 'flail', 'war_staff']` | **4** | 累计击杀≥30 | 拳拳到肉的格斗家 |
| **斧战士** ⭐ | `axeman` | `['melee']` | `['Heavy']` | `['greataxe', 'battleaxe', 'halberd', 'warhammer']` | **5** | 累计击杀≥50 | 重斧挥击的破坏者 |
| **枪兵** ⭐ | `lancer` | `['melee', 'lance']` | `['Heavy']` | `['lance', 'pike', 'halberd', 'trident']` | **5** | 最高等级≥3 | 长枪阵的破甲兵 |
| **剑圣** ⭐ | `blade_wielder` | `['melee', 'crit']` | `['Blade', 'Precise']` | `['katana', 'longsword', 'rapier', 'saber', 'scimitar']` | **4** | 累计击杀≥80 | 剑意无双的刀锋大师 |
| **忍者** ⭐ | `ninja` | `['melee', 'bow', 'crit']` | `['Precise', 'Blade']` | `['dagger', 'kris', 'stiletto', 'shuriken', 'composite', 'longbow']` | **5** | 累计击杀≥150 | 影中潜行的暗影杀手 |
| **气功师** ⭐ | `ji_master` | `['magic']` | `['Elemental', 'Medical']` | `['force', 'wind', 'holy', 'heal', 'regen']` | **6** | 最高等级≥8 | 内气外放的武学宗师 |
| **藤牌兵** ⭐ | `teng_pai_guard` | `['melee', 'medic', 'lance']` | `['Medical', 'Heavy']` | `['shield', 'regen', 'lance', 'halberd']` | **6** | 累计击杀≥120 | 藤牌护身的坚守者 |
| 龙骑士 | `dragon_knight` | `['lance']` | `['Heavy']` | `['lance', 'pike', 'trident']` | **5** | 累计击杀≥300 | 骑枪专精 |
| 狂战士 | `berserker` | (全部 tag) | (全部 12 class) | (全部 30 class_2) | **5** | 最高等级≥15 | 真正万能,但每把都打 0.85 折 |

---

## 二、4 元阶梯实测矩阵 (10 角色 × 12 武器类型)

> 取 4 个典型角色 + 12 把代表武器,展示 4 元阶梯效果。

### 2.1 剑客 swordsman (Blade/Heavy/Precise + 5 class_2)

| 武器 | class | class_2 | tag | 阶梯 | 倍率 |
|------|-------|---------|-----|------|------|
| katana | Blade | katana | melee | ✓2级 | **1.00** |
| sword | Blade | longsword | melee | ✓1级 | 0.85 |
| dagger | Blade/Precise | dagger | melee | ✓2级 | 1.00 |
| halberd | Heavy | halberd | melee | ✓2级 | 1.00 |
| pike | Heavy | pike | lance | ✓2级 | 1.00 |
| axe | Heavy | greataxe | melee | ✓1级 | 0.85 |
| hammer | Blunt | hammer | melee | ✓tag | 0.50 |
| bow | Bow | longbow | bow | ✓tag | 0.50 |
| pistol | Gun | pistol | gun | ✗ | 0.10 |
| fire_staff | Elemental | fire | magic | ✗ | 0.10 |
| heal_gun | Medical | heal | medic | ✗ | 0.10 |
| shield | Support | shield | — | ✗ | 0.10 |

### 2.2 枪手 gunslinger (Gun + 4 class_2)

| 武器 | class | class_2 | 阶梯 | 倍率 |
|------|-------|---------|------|------|
| sniper | Gun | sniper | ✓2级 | **1.00** |
| pistol | Gun | pistol | ✓2级 | 1.00 |
| rifle | Gun | rifle | ✓2级 | 1.00 |
| revolver | Gun | revolver | ✓2级 | 1.00 |
| shotgun | Gun | shotgun | ✓1级 | 0.85 |
| smg | Gun | smg | ✓1级 | 0.85 |
| bow | Bow | longbow | ✓tag(bow) | 0.50 |
| crossbow | Crossbow | handcrossbow | ✓tag(bow) | 0.50 |
| sword | Blade | longsword | ✓tag(melee) | 0.50 |
| katana | Blade | katana | ✓tag(melee) | 0.50 |
| fire_staff | Elemental | fire | ✗ | 0.10 |
| heal_gun | Medical | heal | ✗ | 0.10 |

### 2.3 火焰法师 fire_mage (Elemental/Explosive + fire/lightning/force)

| 武器 | class | class_2 | 阶梯 | 倍率 |
|------|-------|---------|------|------|
| fire_staff | Elemental | fire | ✓2级 | **1.00** |
| thunder_staff | Elemental | lightning | ✓2级 | 1.00 |
| energy_staff | Elemental | force | ✓2级 | 1.00 |
| void_staff | Elemental | shadow | ✓1级 | 0.85 |
| frost_staff | Elemental | ice | ✓1级 | 0.85 |
| magic_orb | Elemental | force | ✓2级 | 1.00 |
| explosive_arrow | Explosive | (grenade) | ✓1级 | 0.85 |
| katana | Blade | katana | ✓tag(melee) | 0.50 |
| pistol | Gun | pistol | ✗ | 0.10 |
| bow | Bow | longbow | ✗ | 0.10 |
| shield | Support | shield | ✗ | 0.10 |
| heal_gun | Medical | heal | ✗ | 0.10 |

### 2.4 医疗兵 medic (Medical/Elemental + heal/regen/holy/force)

| 武器 | class | class_2 | 阶梯 | 倍率 |
|------|-------|---------|------|------|
| heal_gun | Medical | heal | ✓2级 | **1.00** |
| life_wand | Medical | heal | ✓2级 | 1.00 |
| shield | Medical/Support | shield | ✓2级 | 1.00 |
| holy_staff | Medical/Elemental | holy | ✓2级 | 1.00 |
| blessing | Medical/Support | regen | ✓2级 | 1.00 |
| energy_staff | Elemental | force | ✓2级 | 1.00 |
| fire_staff | Elemental | fire | ✓1级 | 0.85 |
| void_staff | Elemental | shadow | ✓1级 | 0.85 |
| sword | Blade | longsword | ✗ | 0.10 |
| pistol | Gun | pistol | ✗ | 0.10 |
| bow | Bow | longbow | ✗ | 0.10 |
| dagger | Blade | dagger | ✗ | 0.10 |

### 2.5 弩手 crossbowman ⭐ v1.1 新增 (Crossbow/Bow + handcrossbow/heavycrossbow/repeating/longbow)

| 武器 | class | class_2 | 阶梯 | 倍率 |
|------|-------|---------|------|------|
| crossbow | Crossbow | handcrossbow | ✓2级 | **1.00** |
| piercing_shot | Crossbow | heavycrossbow | ✓2级 | 1.00 |
| triple_shot | Crossbow | repeating | ✓2级 | 1.00 |
| bow | Bow | longbow | ✓2级 | 1.00 |
| recurve | Bow | recurve | ✓1级 | 0.85 |
| composite | Bow | composite | ✓1级 | 0.85 |
| pistol | Gun | pistol | ✗ (无 ranged/bow tag 匹配) | 0.10 |
| sniper | Gun | sniper | ✗ | 0.10 |
| katana | Blade | katana | ✗ | 0.10 |
| hammer | Blunt | hammer | ✗ | 0.10 |
| fire_staff | Elemental | fire | ✗ | 0.10 |
| heal_gun | Medical | heal | ✗ | 0.10 |

> **设计要点**:
> - 弩手 vs 弓箭游侠 都用 `tags: ['bow']`,但 `preferredClasses_2` 区分:
>   - 弓箭游侠 2级偏好: longbow / recurve / handcrossbow / heavycrossbow (4 个,bow 2 + crossbow 2)
>   - 弩手 2级偏好: handcrossbow / heavycrossbow / repeating / longbow (4 个,crossbow 3 + bow 1)
> - 结果: 弩手拿 crossbow 类到 1.0,弓箭游侠拿 bow 类到 1.0,交叉各降 0.85
> - 弩手弱武器占比高 (5/12 = 42%),需要通过 1.0 武器的高伤害补偿

---

## 三、特殊角色机制

### 3.1 狂战士 berserker (全偏好)

```js
{
  id: 'berserker',
  preferredClasses: ['Blade', 'Blunt', 'Heavy', 'Precise', 'Bow', 'Crossbow', 'Gun', 'Explosive', 'Elemental', 'Medical', 'Support', 'Primitive'],
  preferredClasses_2: (全部 30 个),
}
```

**效果**: 任何武器都至少 0.85 (1 级匹配),但**永远不会到 1.0** (因为没有"最擅长")。

| 武器 | 阶梯 | 倍率 |
|------|------|------|
| 任意武器 | ✓1级 (至少) | **0.85** |
| (无 2 级匹配) | — | 0.85 |

> **设计意图**: 狂战士是"啥都能用但啥都不精"的角色,适合**新手**或**喜欢杂技 build** 的玩家。

### 3.2 圣骑士 paladin (双系 + 双元素)

圣骑士同时偏好 `Blade` + `Medical` + `Heavy` 3 个 1 级 class,**并且** 2 级偏好包含 `holy` (神圣元素)。

**实战效果**:
- 拿 holy_staff: 1.0 (2 级 holy 匹配) ✓
- 拿 longsword: 1.0 (2 级 longsword 匹配) ✓
- 拿 heal_gun: 1.0 (2 级 heal 匹配) ✓
- 拿 lance: 1.0 (2 级 lance 匹配) ✓
- 拿 fire_staff: 0.85 (1 级匹配, class_2 fire 不在偏好)
- 拿 pistol: 0.10 (无任何匹配)

> **设计意图**: 圣骑士是"全能 + 偏神圣"的进阶角色,3 个 1 级 class 给了广泛武器池,2 级偏好让玩家有 Build 方向。

---

## 四、UI 提示 (前端展示)

### 4.1 角色选择面板 (characterSelect)

在每个角色卡片下加擅长 class 图标:

```
剑客 ⚔️
  擅长: Blade / Heavy / Precise
  最擅: Katana, Longsword, Rapier, Lance, Halberd
  
枪手 🔫
  擅长: Gun
  最擅: Pistol, Revolver, Rifle, Sniper
```

### 4.2 武器 modal 提示 (weaponCard)

每把武器展示擅长度图标,影响玩家购买决策:

| 阶梯 | 图标 | 文案 | 颜色 |
|------|------|------|------|
| ✓2级 | ★★★ | "完美匹配" | 绿 |
| ✓1级 | ★★☆ | "次擅长" | 蓝 |
| ✓tag | ★☆☆ | "同流派(半效)" | 黄 |
| ✗ | ☆☆☆ | "严重惩罚" | 红 |

### 4.3 商店过滤 (ShopSystem)

基于 `preferredClasses` 决定是否在商店显示:

```js
// 简化版 (不直接过滤,只调权重)
ShopSystem._weaponMatchScore(weapon, character) {
  if (character.preferredClasses_2?.includes(weapon.class_2)) return 1.0;
  if (character.preferredClasses?.includes(weapon.class)) return 0.7;
  if (character.tags?.includes(weapon.tag)) return 0.4;
  return 0.1;  // 严重惩罚的武器权重极低
}
```

> **设计选择**: 不直接过滤,而是调权重。保留所有武器的可见性,让玩家有机会"探索"。

---

## 五、数据迁移 (无破坏)

### 5.1 character.json 字段扩展

```diff
 {
   "id": "swordsman",
   "tags": ["melee", "lance"],
+  "preferredClasses": ["Blade", "Heavy", "Precise"],
+  "preferredClasses_2": ["katana", "longsword", "rapier", "lance", "halberd"],
   "weaponAffinities": ["melee", "lance"],
   "baseStats": { ... }
 }
```

### 5.2 公式修改 (formula.js)

```js
// 旧 (保留, 兼容)
function _isTagMatched(weaponTag, characterTags) {
  return characterTags.includes(weaponTag) || ...;
}

// 新 (优先用)
function _matchWeaponClass(weapon, character) {
  // 4 元阶梯 (见 武器分类体系 §五)
}
```

### 5.3 优先级

1. 新公式 `_matchWeaponClass` 优先
2. 旧公式 `_isTagMatched` 兜底 (处理没有 `preferredClasses` 字段的旧角色数据)
3. `tags` 字段保留,用于 synergy / 商店偏向 / UI 显示

---

## 六、平衡性检查表

| 角色 | 1 级偏好数 | 2 级偏好数 | 强武器占比 (>=0.85) | 弱武器占比 (0.10) | 平衡度 |
|------|-----------|-----------|---------------------|---------------------|--------|
| 剑客 | 3 | 5 | ~30% (10 武器) | ~10% (3 武器) | ★★★★★ |
| 枪手 | 1 | 4 | ~25% (8 枪) | ~20% (8 非枪) | ★★★★ |
| 火焰法师 | 2 | 3 | ~22% (7 元素) | ~25% (10 非元素) | ★★★★ |
| 弓箭游侠 | 2 | 4 | ~28% (9 弓/弩) | ~15% (5 非) | ★★★★★ |
| 重型机甲 | 2 | 5 | ~25% (8 重型) | ~20% (8 轻) | ★★★★ |
| 疾影刺客 | 2 | 5 | ~25% (8 匕首) | ~15% (5) | ★★★★ |
| 医疗兵 | 2 | 4 | ~22% (7 医疗) | ~25% (10 非医疗) | ★★★★ |
| 圣骑士 | 3 | 5 | ~30% (10) | ~10% (3) | ★★★★★ |
| 工程师 | 3 | 6 | ~30% (10) | ~15% (5) | ★★★★ |
| **弩手** ⭐ v1.1 | 2 | 4 | ~50% (6 弩/弓) | ~42% (5) | ★★★★ (略偏 Crossbow/Bow) |
| **拳手** ⭐ v1.1 | 2 | 5 | ~25% (8 重/钝) | ~15% (5) | ★★★★ (近战格斗) |
| **斧战士** ⭐ v1.1 | 1 | 4 | ~20% (7 重型) | ~25% (10 非重型) | ★★★ (偏科) |
| **枪兵** ⭐ v1.1 | 1 | 4 | ~22% (7 长柄) | ~25% (10 非长柄) | ★★★ (偏科) |
| **剑圣** ⭐ v1.1 | 2 | 5 | ~28% (9 剑系) | ~15% (5) | ★★★★ (剑系专精) |
| **忍者** ⭐ v1.1 | 2 | 6 | ~25% (8 匕首) | ~15% (5) | ★★★★ (极速脆皮) |
| **气功师** ⭐ v1.1 | 2 | 5 | ~25% (8 内气) | ~20% (8) | ★★★★ (内气外放) |
| **藤牌兵** ⭐ v1.1 | 2 | 4 | ~25% (8 盾/长) | ~20% (8) | ★★★★ (坚守者) |
| 龙骑士 | 1 | 3 | ~15% (5 骑枪) | ~30% (10 非骑枪) | ★★★ (极偏科) |
| 狂战士 | 12 | 30 | 100% (全 0.85) | 0% | ★★★ (啥都不精) |

> **平衡目标**: 强武器占比 20~30%, 弱武器占比 10~25%。剑客/圣骑士最强 (3 个 1 级), 狂战士最弱 (0.85 封顶)。
>
> **弩手例外**: 强武器占比 50% (高于目标 30%), 因 crossbow + bow 武器池较小,需要更高占比补偿。如果实测过强, 移除 `longbow` 2级偏好即可降至 ~33%。

---

## 七、与现有文档的关系

- `docs/design/武器与道具策划文档.md` §五 给出 10 角色的 `weaponAffinities` (商店过滤),本系统**新增** `preferredClasses` / `preferredClasses_2` (伤害阶梯)
- `docs/design/武器系统设计文档_v2.md` §三 给出 10 角色基础属性,本系统**复用**这些属性
- `src/engine/character.js` `_normalizeTags` 已存在 (gun→ranged 等归一化),本系统**不修改**该函数

---

*文档版本: v1.0 · 2026-06-07*
*源: 现有 10 角色 + 武器分类体系 v1.0 + BroTato Wiki 角色表*
