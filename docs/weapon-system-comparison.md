# 武器系统对比：BuffPrj1 vs 土豆兄弟 (BroTato)

> 对比日期: 2026-06-01
> 对比范围: `csv/weapons.csv` (BuffPrj1) × BroTato v1.1.x 武器系统

---

## 一、总体设计

| 维度 | BuffPrj1 (当前) | BroTato |
|------|-----------------|---------|
| 武器槽位 | 由角色决定 (4~6 格) | 通常 6 格，特殊角色例外 (1/12/24) |
| 武器品质 | T1~T4 (普通→传说) | Tier I~IV (同品质合并升级) |
| 武器合并 | 同 ID 武器叠加 level + affix | 同 ID+同 Tier 合并升一阶 (I+II=II) |
| 武器标签 | `tag` 字段 (melee/gun/bow/magic/medic/lance) | 武器所属 Class (Blade/Blunt/Precise 等) |
| 标签/Class 加成 | 角色 `weaponAffinities` 控制能否装备 | 同 Class 武器数量 → 线性 Stat 奖励 |
| 流派偏向 | TagSystem.getBiasWeights() 加权 shop 生成 | 商店 15% 概率匹配已持有武器的 Class |
| 攻击方式 | behavior (bullet/spread/melee_sweep/melee_thrust 等) | 近战 thrust/sweep 两类, 远程 projectile |
| 武器数量 | ~55 种 | ~77 种 (含 DLC) |

---

## 二、属性对比 (逐字段)

### 2.1 基础属性

| BuffPrj1 字段 | BroTato 对应 | 对比说明 |
|---|---|---|
| `damageMult` | 武器面板 `base damage` | BuffPrj1 用乘算修正 (1.0=基准)，BroTato 是固定基础值。BuffPrj1 设计中 damageMult 影响 weaponParams.damageMult，作用于武器最终伤害 |
| `attackSpeedMult` | `Attack Speed` 面板 | BuffPrj1 乘算修正 cooldown (越小越快)；BroTato 是攻速 Stat (%) 全局叠加。BuffPrj1 更接近武器级的修正 |
| `attackRangeMult` | `Range` Stat + 武器 base range | BuffPrj1 只有乘算修正。BroTato 分 base range (武器固定) + Range Stat (全局加成) |
| `speedMult` | `Speed` Stat | BroTato 是全局 % Stat，BuffPrj1 放在武器级乘算修正 (影响面窄) |
| `slot` | 无 (所有武器占 1 格) | BuffPrj1 引入了 slots 概念，多格武器更强但也更占槽位 |
| `cost` | `Base price` | 功能一致 |
| `tag` | `Class` (如 melee → Blade/Blunt/Primitive) | BroTato 的 Class 系统更丰富，一个武器可以有 2 个 Class，且 Class 之间有 set bonus 联动 |

### 2.2 战斗属性

| BuffPrj1 字段 | BroTato 对应 | 对比说明 |
|---|---|---|
| `critChanceAdd` | `Crit Chance` Stat + 武器 base crit | BuffPrj1 加算修正 (直接加武器上)；BroTato 分武器 base (如 x2, 3%) + 全局 Stat |
| `critDamageAdd` | 武器面板 `Crit Damage/Chance` | BroTato 的 crit 是乘算倍率 (x1.5/x2/x2.5) + 概率 (3%~50%)，BuffPrj1 是加算修正 |
| `armorAdd` | `Armor` Stat | BroTato 全局 Stat，BuffPrj1 放在武器级修正 |
| `hpRegenAdd` | `HP Regeneration` Stat | BroTato 全局 Stat，BuffPrj1 武器级加算 |
| `maxHpAdd` | `Max HP` Stat | 同上 |
| `lifeStealAdd` | `Life Steal` Stat | BroTato 全局 Stat 加武器 base；BuffPrj1 武器级加算 |

### 2.3 弹道属性

| BuffPrj1 字段 | BroTato 对应 | 对比说明 |
|---|---|---|
| `bulletCount` | 武器面板 hits/弹数 | 一致。BroTato 某些武器有明确 hits 数 (如 6×1) |
| `bulletSpeed` | 武器面板 projectile speed | BuffPrj1 用具体数值 (500/700/1200)，BroTato 也用数值 (300~1000) |
| `attackRange` | `Range` Stat + 武器 base range | BuffPrj1 固定值 (320/200/300 等)，BroTato 远程直接加 Range Stat |
| `spread` | 武器面板 spread/accuracy | BroTato 某些武器有明确 spread (散弹)，BuffPrj1 用角度系数 |
| `pierce` | `Piercing` Stat + 武器 base pierce | BuffPrj1 武器级固定值，BroTato 有 Stat + 武器 base + % Piercing Damage |
| `meleeRange` | 武器攻击距离 (近战) | BroTato 近战受 Range Stat 影响 (50% 效果)，BuffPrj1 固定值 (80/160) |

### 2.4 特殊效果

| BuffPrj1 字段 | BroTato 对应 | 对比说明 |
|---|---|---|
| `burnDps` | `Burning` DoT (烧灼) | 一致。BroTato 有 % Elemental Damage 修正燃烧伤害 |
| `burnMaxStacks` | Burning 叠层上限 | BroTato 默认 1 层 (可通过特定物品叠加) |
| `chainCount` | `Bounces` (连锁/弹射) | BroTato 叫 Bounces，每次弹射可触发 crit + lifesteal |
| `splashRadius` | `% Explosion Size` + 武器 base radius | BroTato 有专门的 Explosion 系统 + % Explosion Damage Stat |
| `homingStrength` | 追踪弹 | BroTato 部分武器有追踪属性 |
| `slowAmount` / `slowDuration` | Slow 效果 | 一致。BroTato 有具体数值 (%) |
| `healOnHit` | `Life Steal` 变体 | BuffPrj1 专门用于 medic tag 武器 |
| `auraHeal` / `auraRadius` | Healing Aura | BroTato 部分武器 / 物品有光环效果 |
| `sprayCone` | Spray/锥形 | BroTato 部分武器有锥形散射 |

---

## 三、体系差异分析

### 3.1 BroTato 有但 BuffPrj1 没有的

| 特性 | BroTato 做法 | 建议优先级 |
|------|------------|-----------|
| **武器 Class 系统** | 每个武器属于 1~2 个 Class，同 Class 武器数量 → 线性 Stat 加成 (如 Blade: +Melee Damage +Life Steal) | ⭐⭐⭐ 高 — 大幅增加 Build 深度 |
| **Tier 合并升级** | 同 ID + 同 Tier → 合并升阶 (I→II→III→IV)，各阶属性独立设计 | ⭐⭐⭐ 高 — 减少随机性，更可控的成长 |
| **Damage 分系 Scaling** | Melee/Ranged/Elemental/Engineering 四种 Stat，武器标注 N% 对应 Stat 加成 | ⭐⭐⭐ 高 — 与角色属性关联，形成差异化 Build |
| **范围系统 (Range)** | 远程 Stat 直接加 range，近战 Stat 50% 加 range (同时降低攻速) | ⭐⭐ 中 — 增加战术选择 |
| **击退 (Knockback)** | 武器有 base knockback，物品可转化 knockback → damage | ⭐⭐ 中 — 增加操作感 |
| **暴击独立面板** | 每个武器有 base crit dmg × crit chance | ⭐⭐ 中 — 暴击更有差异性 |
| **特殊解锁条件** | 武器有解锁条件 (用特定角色通关等) | ⭐ 低 — 非核心 |
| **Curse 系统 (DLC)** | 诅咒 Stat 强化敌人 + 掉落 | ⭐ 低 — 可后续扩展 |
| **Harvesting 利息** | 每波结束 Harvesting +5% (复利) | ⭐ 低 — 经济深度 |

### 3.2 BuffPrj1 有但 BroTato 没有的

| 特性 | BuffPrj1 做法 | 说明 |
|------|--------------|------|
| **武器 slots 占用率** | 不同武器占用 1~2+ slots | 平衡武器强度与搭配灵活性 |
| **Slots 系统** | 武器占槽位权重不同 | 可再平衡，复杂度适中 |
| **Lance tag** | 骑枪独立分支 (超长距近战) | 特色武器类型 |
| **Spray behavior** | 锥形喷射 (火焰/毒雾/冷气) | BroTato 无这类机制 |
| **Medic tag 分支** | 回复 / 治疗光环类武器 | BroTato 的医疗通过 items 实现 |

### 3.3 核心设计差异总结

```
BroTato 的设计哲学:
  "少而精的武器 × 全局 Stat 叠加 × Class 协同"
  
  - 武器本身有固定 base damage + scaling %
  - Melee/Ranged/Elemental 三类 Stat 是成长主线
  - 同类武器越多 → 越强 (线性加成)
  - 每件武器 1 格，专注堆叠

BuffPrj1 的设计方向:
  "多标签分支 × 武器级修正 × 角色绑定"
  
  - 武器属性通过乘算/加算修正叠加
  - 角色 affinities 限制武器池，强化角色特色
  - Slots 权重提供另一层平衡
  - 多 behavior 类型 (spray/medic/lance)
```

---

## 四、建议调整

### 4.1 优先接入 (对应 BroTato 已验证的成熟设计)

1. **引入 Melee/Ranged/Elemental 三系 Stat**
   - 角色 CSV 已有 `meleeDamage`, `rangedDamage`, `elementalDamage` 字段
   - 武器标注 `scalingType: 'melee'|'ranged'|'elemental'` + `scalingPct: 0.5~1.0`
   - 伤害公式: `finalDamage = baseDamage * (1 + damageStat/100) + scalingStat * scalingPct`
   
2. **武器升级采用 Tier 合并制 (替代当前 level + affix)**
   - 同 ID 武器合并升 Tier (I+II=III, II+III=IV)
   - 每 Tier 固定属性 (不再随机 affix)
   - 减少随机性，策略更明确

3. **简化 Stat 修正体系**
   - 当前武器同时持有 damageMult + 各种 Add 修正 (armorAdd/hpRegenAdd 等)
   - 建议: 武器只影响 `damageScaling` + `attackSpeed` + 特殊效果，全局 Stat 由物品/升级提供

### 4.2 中期接入

4. **武器 Class 系统 (简化版)**
   - 引入 4~6 个 Class (Blade/Blunt/Precise/Elemental/Heavy/Support)
   - 同 Class 武器数量 → 线性 Stat 加成
   - 替代或补充当前 tag 系统

5. **Range Stat 双机制**
   - 远程: +x range 直接加射程
   - 近战: +x/2 range 加范围但轻微降低攻速

### 4.3 长期考虑

6. **击退系统**
   - 武器 base knockback → 物品可转化 → damage

7. **暴击分武器设计**
   - 每个武器独立 base crit dmg × crit chance

---

## 五、当前 CSV 字段评分 (与 BroTato 对标)

| 字段 | 保留/改进/废弃 | 理由 |
|------|---------------|------|
| `damageMult` | ⚠️ 改进 → 改为 baseDamage + scalingPct | BroTato 体系更清晰 |
| `attackSpeedMult` | ✅ 保留 | 乘算冷却修正合理 |
| `attackRangeMult` | ⚠️ 改进 → 整合到 Range Stat | 全局 Stat 更有深度 |
| `speedMult` | ⚠️ 改进 → 移出武器，作为全局 Stat | 武器不应直接影响移速 |
| `critChanceAdd/critDamageAdd` | ⚠️ 改进 → 武器级独立面板 | 区分度更高 |
| `armorAdd/hpRegenAdd/maxHpAdd/lifeStealAdd` | ⚠️ 改进 → 移出武器，作为全局 Stat | 武器影响面收窄，Stat 更清晰 |
| `bulletCount/bulletSpeed/spread/pierce` | ✅ 保留 | 合理的武器弹道属性 |
| `meleeRange` | ✅ 保留 (grid 制) | 1 grid=80px 设计合理 |
| `burnDps/burnMaxStacks` | ✅ 保留 | 与 Elemental Damage 联动 |
| `chainCount/splashRadius/homingStrength` | ✅ 保留 | 特殊效果差异化 |
| `slowAmount/slowDuration` | ✅ 保留 | 控制效果 |
| `healOnHit/auraHeal/auraRadius` | ✅ 保留 | 医疗标签特色 |
| `sprayCone` | ✅ 保留 | 特色机制 |
| `behavior` | ✅ 保留 | 核心攻击方式 |
| `tag` | ⚠️ 改进 → 增加 Class 维度 | tag 沿用，Class 作为补充 |

---

## 六、总结

BuffPrj1 当前武器设计已经具备不错的广度 (55 种武器，7 个 tag，多种 behavior)，与 BroTato 的核心差异在于 **Stat 成长体系的深度**：

- BroTato 的精髓是 **Melee/Ranged/Elemental 三系 Stat + Class 协同**，形成清晰的 Build 路线
- BuffPrj1 当前属性偏平 (所有属性都在武器级修正)，缺少全局 Stat 维度

**建议优先补齐三系 Scaling 体系** (角色 CSV 已有字段，只需对接武器)，这是最核心的深度提升点。Tier 合并升级次之，Class 系统最后考虑。
