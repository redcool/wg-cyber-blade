# tags.plan.q.md — Flash 疑问

## Q1: 武器 CSV 的 tag 迁移策略

**[已回复]** Pro 决定：**方案 1（直接改 CSV）**，但在 tags.js 中同时提供旧→新映射层兜底。

映射表：
```js
const TAG_LEGACY_MAP = {
    gun: 'ranged', bow: 'ranged',
    magic: 'fire',
    medic: 'tech',
    lance: 'melee',
};
```

**具体执行：**
1. weapons.csv 中直接替换：`gun→ranged`, `bow→ranged`, `magic→fire`, `medic→tech`, `lance→melee`
2. `countWeaponTags()` 中加 normalize 逻辑：如果 tag 不在 7 新标签中 → 查映射表
3. 映射层是**纯兜底**，CSV 改完后理论上不会被触发

---

## Q2: 武器是否支持多标签？

**[已回复]** Pro 确认：**方案 1，单标签。** 后续需要再加。

但 `countWeaponTags()` 的实现要预留扩展性——如果将来 tag 字段包含 `|`，自动按多标签计数。
```js
// 实现时:
const tags = weapon.tag.includes('|')
    ? weapon.tag.split('|').map(s => s.trim()).filter(Boolean)
    : [weapon.tag];
```

---

## Q3: 道具 tags 数据何时填充？

**[已回复]** **现在填充。** Phase 1 就给每个道具赋标签，基于道具的实际效果：

```
hpUp, regen, armorUp, dodgeUp, lifesteal, energy_shield, thorn, reactive_armor → 无标签（通用生存道具）
critUp, critDmg → crit
speedUp, rangeUp → 无标签（通用机动道具）
stim → melee
penetrator, heavy_bullets → ranged
replicator → ranged
harvestUp, luckUp, pickupUp, piggy, coupon → economy
hunting_trophy → economy
blood_pact → melee
scope → ranged
glass_cannon → melee
magnet → tech
burn_spreader → fire
ice_core → fire|explosive
element_amp → fire
berserker → melee
```

只填有明确流派的道具，通用道具留空（不影响 `getBiasWeights` 计算）。

---

## Q4: medic/lance 旧标签武器的去向

**[已回复]** Pro 确认：
- **medic → tech**（医疗本质是辅助/科技，且未来工程流派可包含治疗向）
- **lance → melee**（骑枪本质是近战突刺）

直接改 weapons.csv，同时 `TAG_LEGACY_MAP` 兜底。

---

## Q5: Synergy 阈值用 Plan 值还是旧值？

**[已回复]** 用 Plan 新值。旧值基于 6 标签体系，与新 7 标签不兼容。Plan 阈值标记 `[PLACEHOLDER]` 但结构正确——数值留到后续平衡调优。

---

## Q6: 迁移现有代码的范围

**[已回复]** 同意你的建议：**Phase 1 只实现 tags.js 独立模块，不改动旧代码。** 

Phase 2（shop/item 模块实现时）再：
- `player.js._updateSynergies()` → 改调 `TagSystem.*`
- `ui.js` synergy 渲染 → 改调 `TagSystem.*`
- `shop.js` 删除旧 tagInfo/synergyDefs

Phase 1 的 tags.js 要在文件尾添加注释标记哪些旧代码将被替代，方便后续查找。

---

## 已明确的条目

- **Q1~Q6**: 全部 **[已回复]** ✅
- **tags.js 独立实现**: 已明确 ✅