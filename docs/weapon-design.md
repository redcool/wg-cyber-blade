# 剑牢 武器系统设计分析文档

> Brotato-like幸存者游戏 | 当前版本: 19角色 / ~45武器

---

## 1. 现状全景

### 角色体系 (19个)

| ID | 名称 | HP | 速度 | 攻速 | 护甲 | 闪避 | 暴击 | 吸血 | 武器位 | 标签 |
|---|---|---|---|---|---|---|---|---|---|---|
| swordsman | 剑客 | 30 | 120 | 1.2 | 1 | 3% | 5% | 2% | 6 | melee,lance |
| gunslinger | 枪手 | 23 | 110 | 1.3 | 0 | 2% | 8% | 0 | 6 | gun |
| fire_mage | 火焰法师 | 20 | 100 | 0.9 | 0 | 2% | 5% | 0 | 6 | magic |
| archer | 弓箭游侠 | 24 | 115 | 1.1 | 0 | 3% | 10% | 0 | 6 | bow |
| mech | 重型机甲 | 45 | 70 | 0.8 | 2 | 0 | 3% | 0 | 5 | gun,melee,lance |
| assassin | 疾影刺客 | 18 | 140 | 1.5 | 0 | 12% | 12% | 3% | 4 | melee,bow,lance |
| medic | 医疗兵 | 25 | 100 | 1.0 | 1 | 4% | 5% | 2% | 6 | medic |
| paladin | 圣骑士 | 35 | 90 | 0.9 | 1 | 2% | 5% | 3% | 6 | melee,medic,lance |
| engineer | 工程师 | 23 | 105 | 1.1 | 1 | 3% | 12% | 0 | 6 | gun,magic |
| berserker | 狂战士 | 15 | 130 | 1.6 | 0 | 5% | 8% | 8% | 5 | ALL TAGS |
| dragon_knight | 龙骑士 | 38 | 120 | 1.0 | 1 | 2% | 6% | 2% | 5 | lance |
| crossbowman | 弩手 | 25 | 100 | 0.9 | 1 | 4% | 8% | 2% | 6 | bow |
| boxer | 拳手 | 22 | 130 | 1.4 | 0 | 5% | 10% | 3% | 4 | melee,crit |
| axeman | 斧战士 | 32 | 95 | 0.85 | 2 | 2% | 4% | 0 | 5 | melee |
| lancer | 枪兵 | 28 | 110 | 1.0 | 1 | 3% | 6% | 0 | 5 | melee,lance |
| blade_wielder | 刀客 | 20 | 125 | 1.3 | 0 | 6% | 10% | 2% | 4 | melee,crit |
| ninja | 忍者 | 16 | 150 | 1.5 | 0 | 15% | 12% | 4% | 5 | melee,bow,crit |
| ji_master | 武斗家 | 22 | 105 | 1.0 | 0 | 5% | 5% | 2% | 6 | magic |
| teng_pai_guard | 盾卫 | 36 | 95 | 0.95 | 3 | 8% | 4% | 0 | 6 | melee,medic,lance |

### ✅ 已修复: 伤害属性 + 被动填充 (2026-06-08 阶段1)

```
meleeDamage:     2~5 (各角色差异化)
rangedDamage:    2~5 (各角色差异化)
elementalDamage: 1~5 (各角色差异化)
engineering:     1~5 (各角色差异化)
passives:       每个角色至少1个专属被动, 共18个被动定义
```

**每个角色现在拥有**: 差异化伤害属性 + 专属被动能力。伤害通过 `FormulaSystem.TYPE B` 公式(`weaponBase(level) + flatStat`)接入战斗计算, 被动通过 `statMod` effect 在 `applyToPlayer` 时自动注册生效。

### 武器体系 (~45个)

武器按 `class` (大类) 和 `class_2` (小类) 分类:
- **Blade**: plasma(20/0.5), dagger(15/0.38×2), claws(15/0.3×3), sword(20/0.6/pierce3), katana(25/0.7/pierce3/+5%crit)
- **Heavy**: axe(20/1.0/+50%critD), chainsaw(20/0.55/burn5×3), hammer(30/1.4/knock600), spear(20/0.85/pierce3), pike(0/0.8/pierce4 minLv2), cavalry_lance(0/1.1/pierce5 minLv3), trident(20/0.85/pierce6)
- **Gun**: pistol(12/1.0), smg(5/0.3), shotgun(5/1.0×3pellets), sniper(30/1.0), gatling(5/0.4×2), revolver(20/0.5/+10%crit), rifle(15/0.9×3burst), magnum(0/0.93 minLv2), minigun(0/0.19 minLv2)
- **Bow**: bow(15/0.9/+5%crit), crossbow(20/1.0/+30%critD), longbow(30/1.0/pierce2), recurve(15/0.7), explosive_arrow(20/1.0/explode40), frost_arrow(10/1.0/slow), poison_arrow(5/0.9/poison8), homing_bow(15/0.8/homing), piercing_shot(25/1.0/pierce4)
- **Crossbow**: crossbow, triple_shot, piercing_shot (与Bow有重叠但自成一类)
- **Elemental**: fire_staff(20/0.9/explode45+burn), frost_staff(15/0.9/slow), thunder_staff(20/1.0/chain3), energy_staff(20/1.0/pierce2), magic_orb(15/0.8/homing), poison_staff(10/1.0/poison12), void_staff(0/1.12 minLv2/+5%lifeSteal), lightning_staff(20/0.9/chain5/+10%crit), fire_wand(10/0.7/burn3), arcane_orb(25/0.9/homing3×3), flame_spray(15/0.6/spray), poison_spray(10/0.7/spray), cold_spray(10/0.7/spray/slow)
- **Medical**: heal_gun(5/0.9/heal3), shield(5/1.5/aura+3armor), holy_staff(10/0.9/heal5), life_wand(5/0.8/killHeal8+5HP), blessing(5/1.2/dmgReductionAura+2armor)
- **Lance**: pike, cavalry_lance, trident (class=Heavy，由tag:lance区分)

---

## 2. Brotato 对比分析

### 2.1 角色被动系统

| 维度 | Brotato | 剑牢 (当前) |
|---|---|---|
| 角色被动 | 每个角色有独特被动 | ❌ 无任何被动 |
| 例子 | Brawler:+100%近战伤害+3标签, Mage:+60%元素, Ranger:+100%远程但禁近战 | 所有角色passives=[] |
| 策略深度 | 被动决定构筑方向 | 无构筑方向指引 |
| 角色区分度 | 完全不同玩法 | 仅HP/速度等数值差异 |

### 2.2 武器类叠加加成

**Brotato核心机制**: 同武器类每持2/3/4/5/6把获得递增加成
- Blade: (2) +1近战+1%吸血 → (6) +5近战+5%吸血
- Gun: (2) +10%射程 → (6) +50%射程+50%攻速
- Blunt: (2) +1护甲 → (6) +3护甲+30HP

**剑牢现状**: `preferredClasses` 数组存在于角色数据中，`class`字段存在于武器数据中，但**游戏从未检查或应用类叠加加成**。这是构筑驱动的核心缺失。

### 2.3 伤害类型体系

| Brotato | 剑牢 |
|---|---|
| 近战/远程/元素/工程 四种独立面板 | 有四个字段(meleeDamage/rangedDamage/elementalDamage/engineering)但全为0 |
| 武器基础面板 × 对应加成 | 武器伤害为固定值，无百分比缩放 |
| 通过升级和道具叠加 | 无伤害类型成长路径 |

### 2.4 商店与升级

| Brotato | 剑牢 |
|---|---|
| 15%概率刷新持有武器类的同系武器 | 未见类刷新权重实现 |
| 前2波各2个保底武器位 | 未见保底逻辑 |
| 4级Tier体系(T1→T2→T3→T4) | weapons.json有damage_lv1~lv4数据，但升级路径未知 |
| 合成升级(3个低级→1个高级) | 未见合成机制 |

---

## 3. 20关通关构建可行性分析

### 波次结构 (典型幸存者模式)
- **W1-5 前期**: 低密度，小型敌人
- **W6-10 中期**: 密度↑, 敌人HP↑
- **W11-15 中后期**: 精英出现，敌人强化
- **W16-20 终局**: BOSS波，极限密度，高HP

### 通关要求
- 清场能力 (AOE) — 应对波次密度
- 单体爆发 — 应对精英/BOSS
- 续航 (吸血/回血/治疗)
- 生存 (HP/护甲/闪避)

### 按角色类型的可行性评估

#### A) 近战生存型 — 机甲/斧战士/盾卫/圣骑士

| 项目 | 详情 |
|---|---|
| 优势 | HP 32-45, 护甲1-3, 天生肉盾 |
| 劣势 | 速度70-95, 攻速低, 武器位5-6 |
| 最优武器 | Heavy类(锤/斧/链锯) 堆击退和AOE横扫; Blade类堆吸血 |
| 后期挑战 | 高密度敌人淹没, 缺少AOE清场 |
| **结论** | ✅ **可行** — 需要针对性道具构建(闪避+吸血) |

#### B) 远程火力型 — 枪手/弩手/弓箭游侠

| 项目 | 详情 |
|---|---|
| 优势 | 速度100-115, 远程安全, 暴击协同 |
| 劣势 | HP 23-25, 无护甲, 无续航 |
| 最优武器 | Gun/Bow类堆叠远程火力 |
| 后期挑战 | 无法站撸, 需要走位和闪避 |
| **结论** | ✅ **可行** — 上限高下限低, 依赖操作 |

#### C) 暴击流 — 刀客/拳手/工程师/忍者

| 项目 | 详情 |
|---|---|
| 优势 | 基础暴率10-12%, 刀客+50%暴伤, 忍者15%闪避 |
| 劣势 | HP 16-22, 武器位4-5 |
| 最优武器 | katana(+5%crit), revolver(+10%crit), lightning_staff(+10%crit), crossbow(+30%critD) |
| 后期挑战 | 极脆, 失误即死 |
| **结论** | ⚠️ **高风险高回报** — 后期暴击伤害可观, 但生存极紧 |

#### D) 元素法系型 — 火焰法师/武斗家/工程师

| 项目 | 详情 |
|---|---|
| 优势 | 优秀AOE(爆炸/连锁/喷射), 控制(减速) |
| 劣势 | HP 20-23, 速度100-105 |
| 最优武器 | Elemental类堆叠(连锁闪电/火焰爆炸/冰霜喷射) |
| 后期挑战 | **elementalDamage=0 — 无法伤缩放路径!** |
| **结论** | ❌ **根本性缺陷** — 没有元素伤害加成, 法术后期伤害严重不足 |

#### E) 医疗回复型 — 医疗兵/圣骑士/盾卫

| 项目 | 详情 |
|---|---|
| 优势 | 内置续航(hpRegen 0.2-1.0), 部分有吸血 |
| 劣势 | 输出极低 |
| 最优武器 | Medical类(治疗枪/光环/盾) |
| 后期挑战 | 续航无限但输出不足以击杀20波精英 |
| **结论** | ❌ **无法单通** — 生存无限但伤害不够 |

#### F) 狂战士 — 狂战士

| 项目 | 详情 |
|---|---|
| 优势 | ALL武器标签, 1.6攻速, 8%吸血, 130速度 |
| 劣势 | 15HP(最低), 0护甲, 5武器位 |
| 最优武器 | Blade类堆吸血或重型高伤武器 |
| 后期挑战 | 纸一样脆, 容错率极低 |
| **结论** | ⚠️ **最高操作上限** — 吸血×攻速×暴击理论上可行, 但失误成本极高 |

---

## 4. 核心问题诊断

### 问题1: 无角色被动能力 (CRITICAL)
- 所有角色只是"属性包", 无改变游戏规则的被动
- 选择角色的理由仅限于数值差异, 无策略深度
- `passives: []` 字段存在但永远为空

### 问题2: 武器类叠加加成未实现 (CRITICAL)
- `characters.json` 中有 `preferredClasses`, `weapons.json` 中有 `class`
- 但游戏**从未**检查或应用同武器类的叠加加成
- 这是Brotato构筑驱动的核心——缺少它意味着无构筑身份

### 问题3: 伤害类型属性全为0 (CRITICAL)
```
meleeDamage: 0, rangedDamage: 0, elementalDamage: 0, engineering: 0
```
- 所有角色该项均为0
- 武器伤害是固定面板值, 不随任何属性缩放
- 无法通过道具或升级实现伤害类型专精

### 问题4: 无升级/合成路径 (MAJOR)
- weapons.json 已包含 damage_lv1~lv4 数据, 但升级路径不明
- 缺少武器合并(3合1)机制
- 缺少Tier升级触发逻辑

### 问题5: 商店经济不完整 (MAJOR)
- 未见同武器类刷新权重调整(类似Brotato 15%规则)
- 未见前期保底武器槽位
- 角色 `preferredClasses` 未被商店系统利用

---

## 5. 设计建议 (优先级排序)

### Priority S — 核心循环 (必须)

#### S1. 实现武器类叠加加成
利用现有 `class` 字段, 为每个武器类创建叠加加成表(详见第7节)。

**实现要点**:
- 在角色装备栏/状态中统计同 `class` 武器的数量
- 每2/3/4/5/6把触发对应档位的加成
- 所有加成实时更新面板
- 需要有UI指示当前激活的套装加成

#### S2. 为每个角色实现被动能力
`passives` 字段已存在, 但为空。改为使用配置驱动:
```json
"passives": [{
  "id": "sword_intent",
  "name": "剑意",
  "desc": "Blade类武器每持一把+8%近战伤害和+3%攻速",
  "type": "class_bonus_multiplier",
  "class": "Blade",
  "perWeaponDmg": 0.08,
  "perWeaponSpeed": 0.03
}]
```

### Priority A — 构筑身份 (应该)

#### A1. 实现伤害类型缩放
让 `meleeDamage` / `rangedDamage` / `elementalDamage` / `engineering` 实际作用于武器伤害:
- 最终伤害 = 武器面板 × (1 + 对应伤害加成%)
- 道具和角色被动提供伤害加成来源
- 商店中增加伤害类型加成的道具

#### A2. 添加商店类刷新权重
- 读取角色 `preferredClasses` 数组
- 商店刷新时, 有15%概率额外出现同系武器(同类优先取 `class`)
- `preferredClasses_2` 用于进一步细化(具体的武器小类)

### Priority B — 深度 (建议)

#### B1. 武器升级系统
- 利用已有 `damage_lv1~lv4` 数据
- 商店可购买同武器升级(低级→高级)
- 每升一级: 伤害↑, 冷却↓, 特殊效果增强

#### B2. 武器合并机制
- 3个同武器同等级 → 1个下一等级
- 提供材料 + 金币的合成路径

#### B3. 角色专属起始武器
- 每个角色开局带一把符合其 `preferredClasses` 的起始武器
- 如剑客→等离子刀, 枪手→手枪

### Priority C — 品质 (锦上添花)

- UI显示当前激活的武器类套装加成
- 角色选择界面显示被动描述
- 伤害面板细分(基础伤害 vs 加成后伤害)
- 商店中同系武器高亮标注

---

## 6. 角色重设计示例

### 剑客 Before / After

**当前**:
```
HP:30  speed:120  atkSpd:1.2  armor:1  dodge:3%  crit:5%  lifeSteal:2%
preferredClasses: Blade, Heavy, Precise
passives: []
```

**重新设计**:
```
HP:30  speed:120  atkSpd:1.2  armor:1  dodge:3%  crit:5%  lifeSteal:2%
preferredClasses: Blade, Heavy, Precise
passives: [{
  name: "剑意",
  desc: "Blade类武器每持一把+8%近战伤害和+3%攻速，最多6层"
}]
起始武器: 等离子刀 (Blade)
```
**构筑思路**: 堆6把Blade武器 → 被动: +48%近战伤+18%攻速 + 套装: +12meleeDmg+8%吸血 → 持续作战王者

---

### 狂战士 Before / After

**当前**:
```
HP:15  speed:130  atkSpd:1.6  armor:0  dodge:5%  crit:8%  lifeSteal:8%
preferredClasses: ALL
passives: []
```

**重新设计**:
```
HP:15  speed:130  atkSpd:1.6  armor:0  dodge:5%  crit:8%  lifeSteal:8%
preferredClasses: Blade, Heavy, Precise
passives: [{
  name: "血怒",
  desc: "每损失10%HP,+15%近战伤害,+5%攻速。低于30%HP时,+50%暴击伤害。"
}]
起始武器: 利爪 或 能量斧
```
**构筑思路**: 保持低血量→高输出, 利用高吸血维持生存。高风险高回报。

---

### 火焰法师 Before / After

**当前**:
```
HP:20  speed:100  atkSpd:0.9  armor:0  dodge:2%  crit:5%
preferredClasses: Elemental, Explosive
passives: []
```

**重新设计**:
```
HP:20  speed:100  atkSpd:0.9  armor:0  dodge:2%  crit:5%
preferredClasses: Elemental, Explosive
passives: [{
  name: "烈焰掌控",
  desc: "Elemental类武器+2连锁/+25%爆炸范围。灼烧伤害+100%。"
}]
起始武器: 火球杖
```
**构筑思路**: 6Elemental → +12elementalDmg +25%范围 + 被动翻倍灼烧和增加连锁 → 清屏机器

---

### 重型机甲 Before / After

**当前**:
```
HP:45  speed:70  atkSpd:0.8  armor:2  dodge:0  crit:3%
preferredClasses: Heavy, Gun
passives: []
```

**重新设计**:
```
HP:45  speed:70  atkSpd:0.8  armor:2  dodge:0  crit:3%
preferredClasses: Heavy, Gun
passives: [{
  name: "重装堡垒",
  desc: "每持一把Heavy类武器+2护甲和+5%击退。不可闪避但获得20%伤害减免。"
}]
起始武器: 能量斧
```
**构筑思路**: 5Heavy = 5armor+50%knockback + 被动10护甲+20%减伤 → 站撸无视大部分伤害

---

### 医疗兵 Before / After

**当前**:
```
HP:25  speed:100  atkSpd:1.0  armor:1  dodge:4%  crit:5%  lifeSteal:2%
preferredClasses: Medical, Elemental
passives: []
```

**重新设计**:
```
HP:25  speed:100  atkSpd:1.0  armor:1  dodge:4%  crit:5%  lifeSteal:2%
preferredClasses: Medical, Elemental
passives: [{
  name: "战场医疗",
  desc: "Medical类武器的治疗效果翻倍。每把Medical武器+3hp/s回复。"
}]
起始武器: 治愈枪
```

---

### 忍者 Before / After

**当前**:
```
HP:16  speed:150  atkSpd:1.5  armor:0  dodge:15%  crit:12%  lifeSteal:4%
preferredClasses: Precise, Blade
passives: []
```

**重新设计**:
```
HP:16  speed:150  atkSpd:1.5  armor:0  dodge:15%  crit:12%  lifeSteal:4%
preferredClasses: Precise, Blade
passives: [{
  name: "影袭",
  desc: "暴击时额外造成30%伤害并重置闪避冷却。每点闪避率转化为1%暴击率。"
}]
起始武器: 双持匕首
```

---

### 龙骑士 Before / After

**当前**:
```
HP:38  speed:120  atkSpd:1.0  armor:1  dodge:2%  crit:6%  lifeSteal:2%
preferredClasses: Heavy
passives: []
```

**重新设计**:
```
HP:38  speed:120  atkSpd:1.0  armor:1  dodge:2%  crit:6%  lifeSteal:2%
preferredClasses: Heavy, Lance (新增Lance类)
passives: [{
  name: "龙骑冲锋",
  desc: "穿透类武器穿透+2, 伤害+20%。每穿透一个敌人回复2HP。"
}]
起始武器: 能量矛
```
**构筑思路**: 堆长柄穿透武器(pike/cavalry_lance/trident), 利用穿透造成毁灭性直线伤害

---

## 7. 武器类叠加加成表 (设计提案)

每个武器类根据持有数量(2~6把)提供递增加成。仅统计 `class` 字段。

| 类 | 2把 | 3把 | 4把 | 5把 | 6把 |
|---|---|---|---|---|---|
| **Blade** | +2 meleeDmg, 2%吸血 | +4 meleeDmg, 3%吸血 | +6 meleeDmg, 4%吸血 | +8 meleeDmg, 5%吸血 | +12 meleeDmg, 8%吸血 |
| **Heavy** | +1护甲, -5%速度 | +2护甲, 20%击退 | +3护甲, 30%击退 | +4护甲, 40%击退 | +5护甲, 50%击退 |
| **Gun** | +15射程 | +30射程, 5%攻速 | +45射程, 10%攻速 | +60射程, 15%攻速 | +80射程, 20%攻速 |
| **Bow** | +5%暴率 | +10%暴率, 5%暴伤 | +15%暴率, 10%暴伤 | +20%暴率, 15%暴伤 | +25%暴率, 25%暴伤 |
| **Crossbow** | +2穿透 | +3穿透, 10%暴伤 | +4穿透, 20%暴伤 | +5穿透, 30%暴伤 | +6穿透, 50%暴伤 |
| **Elemental** | +2 elementalDmg | +4 elementalDmg, 5%范围 | +6 elementalDmg, 10%范围 | +8 elementalDmg, 15%范围 | +12 elementalDmg, 25%范围 |
| **Medical** | +2 hpRegen | +4 hpRegen, 3%吸血 | +6 hpRegen, 5%吸血 | +8 hpRegen, 8%吸血 | +12 hpRegen, 12%吸血 |
| **Precise** | +3%闪避 | +6%闪避, 5%暴率 | +9%闪避, 10%暴率 | +12%闪避, 15%暴率 | +15%闪避, 20%暴率 |
| **Lance** (新增) | +2穿透, +10%伤害 | +3穿透, +15%伤害 | +4穿透, +20%伤害 | +5穿透, +25%伤害 | +6穿透, +35%伤害 |

**规则**:
- 同种武器多把只统计一次(武器位上的武器各算一把, 无论ID是否相同)
- 装备中的武器才计入统计
- 最多触发6把的加成(武器位上限)
- 如果角色武器位<6(如刺客4位), 最高只能触发4把档位
- Lance类目前武器的class=Heavy, 建议将lance武器独立为Lance类, 或新增字段支持跨类叠加

---

## 8. 推荐构建 (按上述修改后)

### S级 (强烈推荐, 通关率高)

| 构建 | 角色 | 武器配置 | 核心优势 |
|---|---|---|---|
| **剑刃风暴** | 剑客 | 6×Blade (等离子刀/能量剑/武士刀/双持匕首/利爪) | 被动48%近战伤+18%攻速 + 套装12meleeDmg+8%吸血 → 持续作战和清场兼备 |
| **影之舞** | 忍者 | 6×Precise | 15%闪避(被动) + 15%闪避(套装) + 20%暴率 → 几乎不死, 暴击不断 |

### A级 (可行, 特定图通关)

| 构建 | 角色 | 武器配置 | 核心优势 |
|---|---|---|---|
| **铁壁** | 重型机甲 | 5×Heavy + 1×Medical | 5Heavy=5armor+50%knockback + 被动10护甲+20%减伤 → 站撸一切 |
| **烈焰风暴** | 火焰法师 | 6×Elemental | 12elementalDmg+25%范围 + 被动翻倍灼烧+连锁 → 清屏机器 |
| **枪林弹雨** | 枪手 | 6×Gun | 80射程+20%攻速, 远程安全距离输出 |

### B级 (可行但需操作)

| 构建 | 角色 | 武器配置 | 核心优势 |
|---|---|---|---|
| **狂暴** | 狂战士 | 5×Blade 或 Heavy混搭 | 利用被动低血量狂暴机制, 高吸血维持 |
| **混合医疗** | 医疗兵 | 3×Medical + 3×Gun | 续航+远程, 但输出不足 |
| **龙骑穿刺** | 龙骑士 | 5×Lance (pike/cavalry_lance/trident) | 超高穿透 + 被动回血, 直线上万伤害 |

---

## 9. 实施路线图

### 📌 阶段1 — 数据层 ✅ (已完成 2026-06-08)
1. ✅ `passives.json` 扩展: 新增11个角色专属被动 (共18个被动定义)
2. ✅ `characters.json` 填充: 19角色全部填入差异化 `meleeDamage/rangedDamage/elementalDamage/engineering` 值
3. ✅ `characters.json` 分配被动: 每个角色至少1个, 部分角色复用通用被动 (assassin_crit_boost, hunter_ranged_boost, pyro_*, engineer_turret_boost, berserker_rage)
4. ✅ `FormulaSystem.TYPE B` 公式已验证: `damage = weaponBaseDamage(level) + player[flatStat]`, `TAG_TO_FLAT_STAT` 映射完备
5. ✅ `data-bundle.js` 重新生成

### 📌 阶段2 — 逻辑层 ✅ (已完成 2026-06-08)
1. ✅ 移除 `tagWeaponMap` 硬编码: `main.js` 改用 `CharacterSystem.getStartingWeapons()` 数据驱动
2. ✅ `characters.json` 新增 `startingWeapons` 字段: 19角色各2把起始武器 (匹配 `preferredClasses`)
3. ✅ 商店类偏向: `engine-shop.js` 注入角色标签为隐式0.5权重, 空手开局即有流派偏向
4. ✅ `CharacterSystem.getStartingWeapons()` 新方法
5. ✅ 测试全绿 (465/465)

### 阶段3 — 商店/UI层 (待实施)
1. 商店同系刷新权重完善 (当前: 纯build驱动 + character标签注入)
2. 羁绊/套装加成UI指示器
3. 被动描述显示
4. 面板伤害细分显示

### 阶段4 — 平衡/内容 (待实施, 持续)
1. 数值调整和测试 (羁绊阈值当前为 `[PLACEHOLDER]` 占位符)
2. 武器升级/合成系统
3. 新增更多武器填充各类

---

## 附录: 数据字段使用现状 (2026-06-08 更新)

| 字段 | 位置 | 当前使用状态 |
|---|---|---|
| `class` | weapons.json | ✅ 已定义, 用于 `preferredClasses` 筛选起始武器 |
| `class_2` | weapons.json | ✅ 已定义, 用于 `preferredClasses_2` 筛选起始武器 |
| `preferredClasses` | characters.json | ✅ 已用于 `startingWeapons` 选择 |
| `preferredClasses_2` | characters.json | ✅ 已用于 `startingWeapons` 选择 |
| `startingWeapons` | characters.json | ✅ **新增字段**, 19角色各2把, 被 `main.js` 使用 (替代硬编码 tagWeaponMap) |
| `passives` | characters.json | ✅ **已填充**, 18个被动定义, 通过 `applyToPlayer` → `PassiveSystem.registerMany` 注册生效 |
| `meleeDamage` | characters.json | ✅ **已填充并生效**, 通过 `FormulaSystem.TYPE B` 公式接入伤害计算 |
| `rangedDamage` | characters.json | ✅ 同上 |
| `elementalDamage` | characters.json | ✅ 同上 |
| `engineering` | characters.json | ✅ 同上 |
| `damage_lv1~4` | weapons.json | ✅ 已定义, 被 `FormulaSystem.getWeaponDamage` 使用 |
| `cooldown_lv1~4` | weapons.json | ✅ 已定义, 用于武器冷却计算 |

> **当前进展**: 阶段1(数据填充)和阶段2(逻辑引擎)已完成。核心机制——角色被动、伤害类型缩放、角色专属起始武器——均已实现并接入游戏流程。测试全绿(465/465)。阶段3(商店/UI层)和阶段4(平衡调参)待实施。
