/**
 * 测试用武器 fixture
 */
export const meleeWeapon = {
    id: 'test_melee',
    name: '测试近战',
    damageMult: 1.0,
    tag: 'melee',
};

export const rangedWeapon = {
    id: 'test_ranged',
    name: '测试远程',
    damageMult: 1.0,
    tag: 'ranged',
};

export const fireWeapon = {
    id: 'test_fire',
    name: '测试火焰',
    damageMult: 1.2,
    tag: 'fire',
};

/**
 * 带旧标签的武器（测试映射层）
 */
export const legacyGunWeapon = {
    id: 'test_gun',
    name: '旧标签枪',
    damageMult: 1.0,
    tag: 'gun',
};

export const legacyLanceWeapon = {
    id: 'test_lance',
    name: '旧标签骑枪',
    damageMult: 1.0,
    tag: 'lance',
};

export const allTestWeapons = [
    meleeWeapon,
    rangedWeapon,
    fireWeapon,
    legacyGunWeapon,
    legacyLanceWeapon,
];
