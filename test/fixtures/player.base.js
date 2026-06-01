/**
 * 基础玩家属性 fixture
 * 同时包含新旧字段（兼容层）
 */
export const basePlayer = {
    // 旧字段（兼容层，逐步移除）
    damage: 0,
    critMultiplier: 2.0,
    bulletCount: 1,
    bulletPierce: 0,
    bulletSpeed: 500,
    pickupRange: 60,

    // 基础
    _baseDamage: 15,
    hp: 100,
    maxHp: 100,

    // 生存 (Survival)
    hpRegen: 0,
    lifeSteal: 0,
    armor: 0,
    dodge: 0,
    healingModifier: 0,

    // 输出 (Offense)
    damagePercent: 0,
    meleeDamage: 0,
    rangedDamage: 0,
    elementalDamage: 0,
    attackSpeed: 1.0,
    attackRange: 300,
    critChance: 0,
    critDamage: 2.0,
    engineering: 0,

    // 机动 (Mobility)
    speed: 200,
    knockback: 0,

    // 经济 (Economy)
    luck: 0,
    harvesting: 0,
    xpGain: 0,
    materialGain: 0,

    // 特殊 (Special)
    explosionDamage: 0,
    explosionSize: 0,
    burningSpread: 0,
    turretDamage: 0,
    turretCount: 0,
    projectilePierce: 0,

    // 限制 (Restriction)
    weaponTypeLimit: 0,
    statLock: 0,
};
