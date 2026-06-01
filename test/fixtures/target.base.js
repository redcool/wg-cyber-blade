/**
 * 基础目标（敌人）fixture
 */
export const baseTarget = {
    hp: 100,
    maxHp: 100,
    burning: false,
    slowed: false,
    isElite: false,
};

export const burningTarget = {
    hp: 100,
    maxHp: 100,
    burning: true,
    slowed: false,
    isElite: false,
};

export const eliteTarget = {
    hp: 200,
    maxHp: 200,
    burning: false,
    slowed: false,
    isElite: true,
};
