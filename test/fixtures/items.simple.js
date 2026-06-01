/**
 * 测试用道具 fixture
 */
export const fireItem = {
    id: 'burn_spreader',
    name: '燃烧扩散',
    tags: ['fire'],
};

export const rangedItem = {
    id: 'replicator',
    name: '子弹复制器',
    tags: ['ranged'],
};

export const economyItem = {
    id: 'piggy',
    name: '存钱罐',
    tags: ['economy'],
};

export const multiTagItem = {
    id: 'ice_core',
    name: '冰核',
    tags: ['fire', 'explosive'],
};

export const genericItem = {
    id: 'hpUp',
    name: '生命核心',
    tags: [],
};

export const allTestItems = [
    fireItem,
    rangedItem,
    economyItem,
    multiTagItem,
    genericItem,
];
