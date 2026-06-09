# Brotato 游戏系统玩法与数值设计文档

## 目录
1. [游戏概述](#游戏概述)
2. [核心玩法机制](#核心玩法机制)
3. [属性系统](#属性系统)
4. [武器系统](#武器系统)
5. [角色系统](#角色系统)
6. [物品系统](#物品系统)
7. [难度系统](#难度系统)
8. [敌人系统](#敌人系统)
9. [商店与经济系统](#商店与经济系统)
10. [升级系统](#升级系统)
11. [进度与解锁系统](#进度与解锁系统)

---

## 游戏概述

**Brotato** 是一款俯视角竞技场射击 Roguelite 游戏，玩家扮演一颗可以同时使用最多6把武器的土豆，抵御外星人的攻击。

### 核心特点
- **Roguelite机制**: 每局游戏都是全新的体验，通过解锁新角色和道具增加可玩性
- **波次生存**: 共20波敌人，每波持续时间从20秒逐渐增加到90秒
- **Build构筑**: 通过武器、道具、升级构建独特的属性组合
- **无局外养成**: 除了解锁内容，不会提升单局游戏内的强度

---

## 核心玩法机制

### 基础流程
1. 选择角色和初始武器
2. 在20波敌人攻击中生存
3. 每波结束后进入商店购买/刷新物品
4. 击杀敌人获取材料（货币）和经验
5. 升级时选择属性强化
6. 第20波面对Boss

### 资源管理
- **材料(Materials)**: 用于购买武器和道具
- **经验(Experience)**: 用于升级获得属性点
- **拾取机制**: 未及时拾取的材料会累积到下一波并双倍返还

### 地图元素
- **树木**: 摧毁后掉落箱子和材料，是道具主要来源之一
- **箱子**: 包含随机道具或武器

---

## 属性系统

### 主要属性 (Primary Stats)

| 属性名称 | 效果说明 | 上限 | 负面效果 |
|---------|---------|------|---------|
| **最大生命值(Max HP)** | 可承受的伤害总量 | 无限制 | 视为1 |
| **生命恢复(HP Regeneration)** | 被动治疗，第一点提供0.20 HP/s，后续每点+0.089 HP/s | 无限制 | 视为0 |
| **生命窃取(Life Steal)** | 攻击有x%几率恢复1HP，每0.1秒最多触发一次(最高10HP/s) | 最多10HP/s | 武器生命窃取降至0 |
| **伤害(Damage)** | 所有伤害增加1%/点 | 无限制 | 每点减少1%伤害，最低1点 |
| **近战伤害(Melee Damage)** | 影响近战武器基础伤害 | 无限制 | 降低基础伤害，最低1点 |
| **远程伤害(Ranged Damage)** | 影响远程武器基础伤害 | 无限制 | 降低基础伤害，最低1点 |
| **元素伤害(Elemental Damage)** | 影响元素武器基础伤害 | 无限制 | 降低基础伤害，最低1点 |
| **攻击速度(Attack Speed)** | 攻击速度增加x%，远程武器也适用 | 最高12次/秒，近战更低 | 攻击变慢，负值计算方式不同 |
| **暴击率(Crit Chance)** | 武器暴击几率增加x% | 最高100% | 从基础暴击率中扣除，最低0% |
| **工程学(Engineering)** | 增强建筑类结构威力 | 无限制 | 结构威力降低，最低1 |
| **范围(Range)** | 武器射程增加x，近战武器范围减半且增加冷却 | 无限制 | 射程减少，最低25 |
| **护甲(Armor)** | 减少x%受到的伤害，每点需要多6.66%伤害才能击杀 | 无限制 | 受到的伤害增加x% |
| **闪避(Dodge)** | 有x%几率躲避攻击 | 60%(Cryptid 70%, Ghost 90%) | 视为0 |
| **速度(Speed)** | 移动速度增加x% | 无限制 | 移动变慢，-100%时停止 |
| **幸运(Luck)** | 增加掉落物品/消耗品几率，提升商店和升级稀有度 | 无限制 | 降低掉落几率和稀有度 |
| **收获(Harvesting)** | 每波结束时获得x材料和XP，每次激活增加5%(向上取整) | 无限制 | 每波损失x材料和XP |

### DLC属性 - 诅咒(Curse)
- 使敌人生成时有几率被诅咒（紫色轮廓）
- 诅咒敌人: +25%伤害, +15%速度, +150%HP (+2%/诅咒点)
- 诅咒敌人掉落+33%材料
- 商店物品有几率生成诅咒强化版
- 上限: 50%诅咒敌人生成几率, 15%诅咒物品生成几率, 300诅咒HP缩放

### 次要属性 (Secondary Stats)

| 属性 | 描述 | 相关标签 |
|-----|------|---------|
| 消耗品治疗 | 增加/减少消耗品治疗效果 | Consumable |
| 材料治疗% | 拾取材料时恢复1HP的几率 | Pickup |
| XP增益% | 增加/减少所有经验获取 | XP Gain |
| 拾取范围% | 增加/减少拾取范围 | Pickup |
| 物品价格% | 增加/减少商店价格 | Economy |
| 爆炸伤害% | 增加/减少爆炸伤害 | Explosive |
| 爆炸范围% | 增加/减少爆炸范围 | Economy |
| 弹跳(Bounces) | 投射物额外弹跳次数 | Ranged Damage |
| 穿透(Piercing) | 投射物穿透目标数 | Ranged Damage |
| 穿透伤害% | 穿透伤害衰减 | Ranged Damage |
| Boss伤害% | 对Boss和精英的伤害倍率 | Damage |
| 结构攻速% | 炮塔攻击速度等 | Structure |
| 燃烧速度% | 燃烧伤害频率 | Elemental Damage |
| 燃烧传播 | 燃烧扩散次数 | Elemental Damage |
| 击退(Knockback) | 敌人被击退距离 | Knockback |
| 双倍材料% | 拾取材料时获得双倍的几率 | Economy, Pickup |
| 免费刷新 | 每波开始时的免费刷新次数 | Economy |
| 树木数量 | 生成的树木数量 | Exploration |
| 敌人数量% | 增加/减少敌人生成数量 | More/Less Enemies |
| 敌人速度% | 增加/减少敌人速度 | Less Enemy Speed |
| 刷新价格% | 增加/减少刷新价格 | - |

---

## 武器系统

### 武器分类

#### 1. 近战武器 (Melee Weapons)
- **攻击方式**: 
  - 突刺(Thrust): 直线攻击（如长矛）
  - 挥砍(Sweep): 弧形范围攻击（如幽灵斧）
- **特点**: 可同时击中多个敌人，攻击后短暂延迟返回
- **范围影响**: 范围仅改变一半，增加范围会略微降低攻速
- **伤害类型**: 受近战伤害属性影响

#### 2. 远程武器 (Ranged Weapons)
- **攻击方式**: 发射投射物，通常只能击中一个敌人
- **特点**: 单目标DPS更高，攻击速度更快
- **特殊效果**: 可获得弹跳(Bounce)和穿透(Piercing)能力
- **伤害类型**: 受远程伤害属性影响

### 武器稀有度

| 等级 | 名称 | 说明 |
|-----|------|------|
| Tier 1 | Common (普通) | 基础武器 |
| Tier 2 | Uncommon (非普通) | 可从Wave 2+出现 |
| Tier 3 | Rare (稀有) | 可从Wave 4+出现 |
| Tier 4 | Legendary (传奇) | 可从Wave 8+出现 |

**合成机制**: 两把相同类型和等级的武器可合成为一把高一级的武器（最高Tier 4）

### 武器属性缩放

武器伤害可通过以下属性进行缩放：
- 🗡️ = 近战伤害缩放
- 🔫 = 远程伤害缩放  
- ✨ = 元素伤害缩放
- 🛡️ = 护甲缩放
- ⚙️ = 工程学缩放
- 📏 = 范围缩放
- ⚡ = 攻击速度缩放
- 📊 = 等级缩放

**缩放计算公式**:
```
最终伤害 = 基础伤害 + (属性值 × 缩放百分比)
```

**示例**: 
- Tier 4 Knife: 20(80%) 表示基础伤害20，近战伤害缩放80%
- 如果近战伤害为30: 20 + (30 × 0.8) = 44伤害

### 武器类别 (Weapon Classes)

部分武器属于特定类别，某些角色会有特殊加成：
- Naval (海军)
- Heavy (重型)
- Blunt (钝器)
- Primitive (原始)
- Blade (刀刃)
- Tool (工具)
- Medical (医疗)
- Unarmed (徒手)
- Precise (精准)
- Ethereal (以太)
- Explosive (爆炸)
- Legendary (传奇)
- Medieval (中世纪)
- Elemental (元素)
- Support (支援)

---

## 角色系统

### 角色概览

游戏共有**62个角色**，其中5个默认解锁，其余通过完成挑战解锁。

每个角色具有：
- 独特的初始属性加成
- 起始武器
- 特殊机制
- 物品标签偏好（影响商店生成）

### 默认角色

| 角色 | 特性 | 起始武器 |
|-----|------|---------|
| Well Rounded | +5 Max HP, +5% Speed, +8 Harvesting | 无 |
| Brawler | +50%徒手武器攻速, +15% Dodge, -50 Range | Fist |
| Crazy | +100 Range精准武器, +25% Attack Speed, -30% Dodge | Knife |
| Ranger | +50 Range, 远程伤害+50%, 不能装备近战武器 | Pistol |
| Mage | 元素伤害+25%, 近战/远程伤害-100% | Snake, Scared Sausage |

### 角色解锁示例

| 角色 | 解锁条件 | 解锁奖励 |
|-----|---------|---------|
| Chunky | 首次死亡 | Potato Thrower |
| Old | 击杀300敌人 | Snail |
| Lucky | 收集300材料 | Lucky Charm |
| Mutant | 击杀2000敌人 | Octopus |
| Multitasker | 收集5000材料 | Chopper |
| Gladiator | 击杀20000敌人 | Spider |
| Pacifist | 收集10000材料 | Panda |

### 特殊角色机制

**Multitasker**: 可装备最多12把武器，但每把武器-5%伤害

**One Armed**: 只能装备1把武器

**Bull**: 不能使用武器

**Baby**: 可装备最多24把武器（每级1把）

**Pacifist**: -100%伤害，每波结束时每个存活敌人获得0.65材料和XP

---

## 物品系统

### 物品分类

游戏共有**201个基础物品** + **36个DLC物品** = **237个总物品**

### 物品稀有度

与武器相同，分为4个等级：
- Tier 1 (Common)
- Tier 2 (Uncommon) - Wave 2+
- Tier 3 (Rare) - Wave 4+
- Tier 4 (Legendary) - Wave 8+

### 物品设计特点

**重要设计原则**: Brotato的物品很少提供纯粹的主要属性加成，大多数物品在提供正面属性的同时会有负面效果。

**示例物品**:

| 物品 | 稀有度 | 效果 | 标签 |
|-----|-------|------|------|
| Acid | Tier 2 | +8 Max HP, -2% Dodge, -2 Knockback | Max HP |
| Alloy | Tier 3 | +3 Melee/Ranged/Elemental Damage, +3 Engineering, +5% Crit, -6% Dodge | 多种 |
| Coffee | Tier 1 | +10% Attack Speed, -2% Damage | Attack Speed |
| Ball and Chain | Tier 3 | +15% Damage, +3 Armor, +5 Knockback, -3% Speed, 最小冷却0.75秒 | Damage, Armor |
| Bloody Hand | Tier 4 | +10% Life Steal, +2%伤害/1%生命窃取, 每秒受到1伤害 | Life Steal |

### 物品标签系统

物品标签影响角色商店生成权重：

**统计标签**:
- Max HP, Melee Damage, Ranged Damage, Elemental Damage
- Attack Speed, Crit Chance, Dodge, Speed, Luck
- Harvesting, Life Steal, HP Regeneration, Armor, Range
- Engineering, Damage, Knockback, Pickup, Economy
- XP Gain, Structure, Explosive, Consumable, Exploration
- Stand Still, More/Less Enemies, Less Enemy Speed, Curse

**特殊标签**:
- 每个角色有特定的标签偏好
- 例如: Ranger偏好"Ranged Damage, Range"
- Mage偏好"Elemental Damage"

---

## 难度系统

### 危险等级 (Danger Levels)

| 等级 | 修改器 | 解锁角色 |
|-----|--------|---------|
| Danger 0 | 无修改器 | One Armed |
| Danger 1 | 新敌人出现 | Bull |
| Danger 2 | 新敌人 + 精英和群体出现(第11或12波) | Soldier |
| Danger 3 | 敌人更强(+12%伤害和HP) | Masochist |
| Danger 4 | 更多精英和群体(第11-18波), 敌人+26%伤害和HP | Knight |
| Danger 5 | 两个Boss同时出现(第20波, Boss HP -25%), 敌人+40%伤害和HP | Demon |

### 无障碍滑块 (Accessibility Sliders)

可在设置中调整：
- **敌人伤害**: 25% - 200%
- **敌人生命值**: 25% - 200%
- **敌人速度**: 25% - 150%

**难度计算**: 几何平均数 = (伤害 × HP × 速度)^(1/3)

- 最低难度: 25% (三个滑块都25%)
- 最高难度: 182% (200%伤害, 200%HP, 150%速度)

**注意**: 无障碍滑块与危险等级相乘
- Danger 5 + 25%伤害 = 140% × 25% = 35%敌人伤害
- Danger 5 + 200%伤害 = 140% × 200% = 280%敌人伤害

### 精英敌人特性

- 从Danger 2开始在精英波次出现
- 掉落传奇箱子（ guaranteed Tier 4物品）
- 箱子拾取时恢复100 HP（普通箱子恢复3 HP）
- 第11-12波的精英只有75% HP

---

## 敌人系统

### 敌人最大数量

- 屏幕上最多同时存在**100个敌人**
- 超出时随机非精英/Boss敌人死亡且不掉落战利品
- Pacifist角色仍会为每个消失的敌人获得0.65材料

### 敌人基础数据

**参考速度**: 玩家基础速度为450

**敌人成长公式**:
```
当前HP = 基础HP + (波次-1) × 每波HP增长
当前伤害 = 基础伤害 + (波次-1) × 每波伤害增长
```

### 普通敌人示例

| 敌人 | 行为 | 基础HP | HP/波 | 速度 | 基础伤害 | 掉落材料 |
|-----|------|-------|-------|------|---------|---------|
| Tree | 中立，死亡掉落果实/箱子+3材料 | 10 | 5 | 0 | 0 | 3 |
| Baby Alien | 追击，接触伤害 | 3 | 2 | 200-300 | 1 | 1 |
| Chaser | 追击，群体生成 | 1 | 1 | 380 | 1 | 1 |
| Spitter | 远离时发射投射物 | 8 | 1 | 200 | 1 | 1 |
| Charger | 追击，可冲锋(2.5-3.5秒冷却) | 4 | 2.5 | 400 | 1 | 1 |
| Pursuer | 追击，每秒加速 | 10 | 24 | 150→600 | 1 | 3 |
| Bruiser | 追击，可冲锋 | 20 | 11 | 300 | 2 | 3 |
| Buffer | 远离，增益其他敌人(HP+150%, 伤害+25%, 速度+50%) | 20 | 3 | 150 | 1 | 2 |
| Fly | 环绕移动，被击中时发射随机投射物 | 15 | 4 | 325-375 | 1 | 1 |
| Healer | 治疗周围敌人(+100 HP/波+10) | 10 | 8 | 400 | 1 | 2 |
| Looter | 逃跑，死亡掉落传奇箱子+8材料 | 5 | 30 | 300-400 | 1 | 8 |

### 精英敌人 (Elites)

精英敌人在达到HP阈值或时间限制时会变异：

| 精英 | 变异0 | 变异1 | 变异2 |
|-----|-------|-------|-------|
| Rhino | 每2秒冲锋并发射两侧投射物 | 60%HP/25秒: 每1.3秒短距离冲锋，开始时额外2投射物 | - |
| Butcher | 每1.25秒 Slash 4次 | 70%HP/25秒: 每秒 Slash 8次 | 40%HP/40秒: 每0.75秒 Slash 3次(伤害-33%) |
| Monk | 生成15个Slasher Eggs | 10秒: 每秒5投射物 | 30秒: 最后10秒逃跑并生成Tentacles |
| Croc | 每秒冲锋并创造2道Slash | 60%HP/25秒: 冲锋时创造一圈投射物 | - |
| Colossus | 追击，每秒50个随机投射物 | 60%HP/25秒: 随机移动，每0.5秒生成投射物圈 | - |

### Boss敌人 (第20波)

- Danger 0-4: 随机出现1个Boss
- Danger 5: 同时出现2个Boss（各75% HP，但+40%总HP = 105% HP）

---

## 商店与经济系统

### 商店机制

**进入时机**: 每波结束后自动进入商店

**商品数量**: 最多4个随机物品（武器+道具）

**稀有度出现波次**:
- Tier 1: Wave 1+
- Tier 2: Wave 2+
- Tier 3: Wave 4+
- Tier 4: Wave 8+

### 刷新机制 (Rerolling)

**刷新价格公式**:
```
刷新增量 = floor(0.40 × 波次) (最小1)
首次刷新价格 = floor(波次 × 0.75) + 刷新增量
每次额外刷新增加相同的增量
```

**示例 - Wave 5**:
- 刷新增量 = floor(0.40 × 5) = 2
- 首次价格 = floor(5 × 0.75) + 2 = 3 + 2 = 5
- 第二次 = 7, 第三次 = 9, 以此类推

**刷新价格表**:

| 波次 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 |
|-----|---|---|---|---|---|---|---|---|---|----|----|----|----|----|----|----|----|----|----|----|
| 首次价格 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 9 | 9 | 11 | 12 | 13 | 14 | 15 | 17 | 18 | 18 | 20 | 21 | 23 |
| 每次增加 | 1 | 1 | 1 | 1 | 2 | 2 | 2 | 3 | 3 | 4 | 4 | 4 | 5 | 5 | 6 | 6 | 6 | 7 | 7 | 8 |

**特殊刷新**:
- Dangerous Bunny: 每个提供1次免费刷新
- 购买全部4个物品: 获得1次免费刷新
- Spyglass: 最多减少90%刷新价格

### 锁定机制 (Locking)

- 点击物品下方的锁图标可免费锁定
- 锁定物品在刷新时保留且价格不变
- 锁定物品不会出现在其他槽位
- 锁定唯一物品时，该物品不会从箱子中掉落

### 合成机制 (Combining)

- 两把相同类型和等级的武器可合成为高一级武器
- 武器栏满时购买相同武器会自动合成
- 最高只能合成到Tier 4

### 回收机制 (Recycling)

- 默认回收价值: 25%
- Recycling Machine: +35% → 总计60%
- Entrepreneur角色: +25% → 总计85%（与机器叠加）
- 基于当前价格（含通胀）

### 价格通胀公式

```
最终价格 = (基础价格 + 波次 + 基础价格 × 0.1 × 波次) × 价格系数
```

**示例**:
- SMG (基础价格20) 在第1波: (20 + 1 + 20×0.1×1) × 100% = 23
- Cyclops Worm (基础价格45) 在第5波: (45 + 5 + 45×0.1×5) × 100% = 72.5

**价格影响因素**:
- Coupon: 减少物品价格
- 角色修正: 如Mutant +50%物品价格, Arms Dealer -95%武器价格
- Endless Mode: 价格随Endless Factor急剧增加

### 幸运对稀有度的影响

幸运值影响商店物品和升级的稀有度分布：

**0幸运时的分布** (示例):
- Tier 1: 较高比例
- Tier 2: 中等比例
- Tier 3: 较低比例
- Tier 4: 很低比例

**100幸运时的分布**:
- Tier 1: 降低
- Tier 4: 显著提高

---

## 升级系统

### 升级机制

每次升级时提供4个随机属性选项，可选择其一提升。

### 升级属性表格

| 属性 | Tier I | Tier II | Tier III | Tier IV |
|-----|--------|---------|----------|---------|
| Max HP | +3 | +6 | +9 | +12 |
| HP Regeneration | +2 | +3 | +4 | +5 |
| Life Steal | +1 | +2 | +3 | +4 |
| Damage | +5 | +8 | +12 | +16 |
| Melee Damage | +2 | +4 | +6 | +8 |
| Ranged Damage | +1 | +2 | +3 | +4 |
| Elemental Damage | +1 | +2 | +3 | +4 |
| Attack Speed | +5 | +10 | +15 | +20 |
| Crit Chance | +3 | +5 | +7 | +9 |
| Engineering | +2 | +3 | +4 | +5 |
| Range | +15 | +30 | +45 | +60 |
| Armor | +1 | +2 | +3 | +4 |
| Dodge | +3 | +6 | +9 | +12 |
| Speed | +3 | +6 | +9 | +12 |
| Luck | +5 | +10 | +15 | +20 |
| Harvesting | +5 | +8 | +10 | +12 |

### 保证稀有度等级

- Level 1: 100% Tier 1
- Level 5: 100% Tier 2
- Level 10, 15, 20: 100% Tier 3
- Level 25及之后每5级: 100% Tier 4

其他等级的稀有度受角色等级和幸运值影响（类似商店机制）。

---

## 进度与解锁系统

### 游戏挑战 (Game Challenges)

#### 危险等级挑战

| 挑战 | 条件 | 解锁 |
|-----|------|------|
| Danger 0 | 在Danger 0获胜 | One Armed |
| Danger 1 | 在Danger 1获胜 | Bull |
| Danger 2 | 在Danger 2获胜 | Soldier |
| Danger 3 | 在Danger 3获胜 | Masochist |
| Danger 4 | 在Danger 4获胜 | Knight |
| Danger 5 | 在Danger 5获胜 | Demon |

#### 幸存者挑战

| 挑战 | 条件 | 解锁 |
|-----|------|------|
| Survivor 1 | 击杀300敌人 | Old |
| Survivor 2 | 击杀2000敌人 | Mutant |
| Survivor 3 | 击杀5000敌人 | Loud |
| Survivor 4 | 击杀10000敌人 | Wildling |
| Survivor 5 | 击杀20000敌人 | Gladiator |

#### 收集者挑战

| 挑战 | 条件 | 解锁 |
|-----|------|------|
| Gatherer 1 | 收集300材料 | Lucky |
| Gatherer 2 | 收集2000材料 | Generalist |
| Gatherer 3 | 收集5000材料 | Multitasker |
| Gatherer 4 | 收集10000材料 | Pacifist |
| Gatherer 5 | 收集20000材料 | Saver |

#### 特殊挑战

| 挑战 | 条件 | 解锁 | 提示 |
|-----|------|------|------|
| Rookie | 首次死亡 | Chunky | - |
| Dying | 达到-5 HP Regeneration | Sick | 购买负生命恢复物品 |
| Agriculture | 达到+200 Harvesting | Farmer | Pacifist或Entrepreneur适合 |
| Hallucination | 达到+60% Dodge | Ghost | - |
| Fast | 达到+50% Speed | Speedy | - |
| Hoarder | 持有3000材料 | Entrepreneur | Saver擅长此挑战 |
| Builder | 同时拥有5个炮塔 | Engineer | - |
| Lumberjack | 击杀50棵树 | Explorer | - |
| Medicine | 一波内治疗200 HP | Doctor | - |
| Perfect Vision | 达到+300 Range | Hunter | Ranger有优势 |
| Fireworks | 单次爆炸击杀15敌人 | Artificer | Bull最简单 |
| Recycling | 一局回收12把武器 | Arms Dealer | 故意购买并回收 |
| Giant Slayer | 15秒内击杀Boss或精英 | Jack | 高爆发远程Build |
| Robust | 达到+100 Max HP | Lich | - |
| Bourgeoisie | 同时拥有3把Tier 4武器 | King | - |
| Student | 达到20级 | Apprentice | - |
| Reckless | 以1 HP完成一波 | Golem | - |
| Fast Learner | 第6波前达到10级 | Baby | 用Mutant玩几波 |
| Blood Drinker | 达到+40% Life Steal | Vampire | 用Sick角色 |

### New Dawn挑战

| 挑战 | 条件 | 解锁 |
|-----|------|------|
| Ew, what's that smell?! | 在Danger 3+获胜 | Ban System (禁止8个物品) |
| Let's try this wave again | 波次最后5秒返回主菜单再恢复 | Hourglass |
| Trick or Treat? | 不锁定任何物品获胜 | Candy Bag |
| Mmm, so juicy! | 满血时收集100个水果 | Fruit Basket |
| Smells like something's burning? | 单波燃烧击杀30敌人 | Will-o'-Wisp |
| BooOOooOoo~ | 达到70%闪避 | Ghost Outfit |
| Crit Happens | 达到100%暴击率 | Vorpal Sword |

### 角色挑战

每个角色通关后可解锁专属物品或武器，例如：
- Brawler通关 → Power Fist
- Ranger通关 → Night Goggles
- Mage通关 → Thunder Sword
- King通关 → Excalibur
- Gladiator通关 → Spider

---

## 游戏设计要点总结

### 核心设计理念

1. **轻量化数值Build**: 将道具收益转化为简单的数值取舍，降低选择复杂度
2. **紧密的系统关联**: 角色、武器、道具、属性之间深度联动
3. **极端角色差异化**: 每个角色都有独特的玩法和Build路线
4. **经济运营维度**: 材料和幸运的管理类似于自走棋策略
5. **高随机性与爽感**: 更随机的结果带来"胡了"时的强烈满足感

### 平衡设计

1. **道具权衡**: 大多数道具同时提供正负面属性，需要玩家抉择
2. **稀有度节奏**: 高等级物品随波次和幸运逐步开放，控制游戏节奏
3. **武器专精**: 武器面板决定Build方向，降低单一角色玩法深度但提高专一性
4. **难度曲线**: 适中的难度保持玩家心流状态

### 重复可玩性

1. **62个独特角色**: 每个角色完全不同的游戏体验
2. **237个物品**: 近乎无限的搭配可能
3. **无局外养成**: 每局都是全新开始，依赖技巧和策略
4. **成就解锁系统**: 持续提供目标和动力

---

*文档版本: 1.0*  
*数据来源: Brotato Wiki (Patch 1.1.6.3 - 1.1.10.9)*  
*最后更新: 2026年6月*
