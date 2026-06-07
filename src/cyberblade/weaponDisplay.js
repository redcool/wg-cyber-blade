// ============================================================
// src/cyberblade/weaponDisplay.js — 武器详情显示纯函数工具
// 依赖: 无 (无 DOM, 浏览器/Node 双端通用)
// ============================================================

/**
 * 武器属性的 tier 解析
 * Bug1 修复: 部分武器 minLevel=2/3, damage_lv1=0 是占位符
 * 详情显示应读 lv{minLevel} 才能看到真实伤害
 * 例: pike (minLevel=2) → damage_lv2=35, 不是 damage_lv1=0
 * @param {Object} weapon
 * @param {string} key - e.g. 'damage_lv1', 'cooldown_lv1'
 * @returns {number}
 */
function getWeaponTierValue(weapon, key) {
    if (!weapon || !key) return 0;
    const tierMatch = key.match(/^(damage|cooldown)_lv(\d+)$/);
    if (!tierMatch) return weapon[key] || 0;
    // 武器自身 tier (默认 1) → 实际显示应跳到 lv{minLevel}
    const minLevel = (typeof weapon.minLevel === 'number' && weapon.minLevel >= 1 && weapon.minLevel <= 4)
        ? weapon.minLevel : 1;
    const targetKey = `${tierMatch[1]}_lv${minLevel}`;
    const v = weapon[targetKey];
    return (typeof v === 'number') ? v : 0;
}

/**
 * 角色 + 武器 适配判定
 *  返回 true = 不在偏好范围 (应显示警告)
 *  规则: weapon.class ∉ ch.preferredClasses
 *      AND weapon.class_2 ∉ ch.preferredClasses_2
 *  注: weapon.tag 已被前置过滤, 此函数不重复判断
 *  防御: 武器 class / class_2 缺失 → 不警告 (不误报, 保守)
 * @param {Object} weapon - { class, class_2, ... }
 * @param {Object} ch    - { preferredClasses, preferredClasses_2, ... }
 * @returns {boolean}
 */
function isWeaponNotPreferred(weapon, ch) {
    return getWeaponFitScore(weapon, ch) === 0;
}

/**
 * 适配分数 0/0.5/1 — 进度条 3 档
 * 0   = 0/2 命中 (无偏好, 红色 + ⚠ 警告)
 * 0.5 = 1/2 命中 (部分偏好, 黄色, 例如 class 命中但 class_2 未命中)
 * 1   = 2/2 命中 (完美适配, 绿色)
 * 防御: 武器/角色任一缺失 → 0.5 (中庸默认)
 *       class/class_2 缺失 → 0.5 (信息不足, 不极端)
 * @param {Object} weapon
 * @param {Object} ch
 * @returns {number} 0 | 0.5 | 1
 */
function getWeaponFitScore(weapon, ch) {
    if (!weapon || !ch) return 0.5;
    const pref1 = ch.preferredClasses || [];
    const pref2 = ch.preferredClasses_2 || [];
    const hasClass = !!(weapon.class || weapon.class_2);
    if (!hasClass) return 0.5;  // 信息不足
    const inPref1 = weapon.class && pref1.includes(weapon.class);
    const inPref2 = weapon.class_2 && pref2.includes(weapon.class_2);
    const hits = (inPref1 ? 1 : 0) + (inPref2 ? 1 : 0);
    if (hits === 0) return 0;
    if (hits === 1) return 0.5;
    return 1;
}

// 浏览器全局 (script 标签加载)
const WeaponDisplay = { getWeaponTierValue, isWeaponNotPreferred, getWeaponFitScore };

// Node 模块 (vitest 导入)
if (typeof module !== 'undefined') {
    module.exports = { WeaponDisplay, getWeaponTierValue, isWeaponNotPreferred, getWeaponFitScore };
}
