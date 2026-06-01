# Module: loot — 宝箱掉落系统（稀有度+类型+分支选择）

**依赖**: data.js, tags.js, item.js
**执行顺序**: 8（等 shop.js 就绪，共享稀有度/保底逻辑）

---

## 一、核心设计

```
敌人死亡
  │
  ├── 普通敌人 → 不产生宝箱
  ├── 精英敌人 → 必掉 精英宝箱 (epic 20%)
  └── Boss     → 必掉 传奇宝箱 (legendary 40%)
                    │
                    ▼
              打开宝箱 → 3 选 1（武器/道具/金币）
                    │
                    ▼
              道具 → ItemSystem.buyItem()
              武器 → 加入武器槽
              金币 → player.materials += N
```

---

## 二、宝箱类型

```js
const CHEST_TYPES = {
    normal: {
        name: '普通宝箱',
        color: '#aaaaaa',
        rarityWeights: { common: 70, rare: 25, epic: 5, legendary: 0 },
        itemCount: 2,     // 2 个选项
        goldRange: [10, 25],
    },
    elite: {
        name: '精英宝箱',
        color: '#aa44ff',
        rarityWeights: { common: 40, rare: 35, epic: 20, legendary: 5 },
        itemCount: 3,
        goldRange: [25, 50],
    },
    legendary: {
        name: '传奇宝箱',
        color: '#ff6600',
        rarityWeights: { common: 10, rare: 20, epic: 30, legendary: 40 },
        itemCount: 3,
        goldRange: [50, 100],
    },
};
```

---

## 三、宝箱奖励生成

```js
/**
 * 生成宝箱奖励选项
 * @param {string} chestType - 'normal'|'elite'|'legendary'
 * @param {Object} player
 * @returns {Object[]} - 2~3 个选项
 *
 * 算法:
 * 1. 获取流派偏向权重 (TagSystem.getBiasWeights, biasStrength=0.3)
 * 2. 生成 2~3 张卡:
 *    a. 随机选择类型: 40% 道具 / 40% 武器 / 20% 金币
 *    b. 如果是道具/武器: 按稀有度权重 roll 稀有度 + 流派偏向选择
 *    c. 如果是金币: roll 金币范围
 * 3. 返回选项数组
 */
generateRewards(chestType, player) {}
```

### 奖励选项结构

```js
{
    type: 'item',          // 'item' | 'weapon' | 'gold'
    id: 'burn_spreader',   // 道具/武器 ID
    name: '燃烧扩散器',
    icon: '🔥',
    desc: '燃烧死亡传播(范围200)',
    rarity: 'epic',
    rarityColor: '#aa44ff',
    tags: ['fire'],
    // 金币选项:
    goldAmount: null,      // 只有 type='gold' 时有值
}
```

---

## 四、接口定义

```js
const LootSystem = {
    /** 当前待开启的宝箱队列 */
    pendingChests: [],

    /** 当前可选的奖励 */
    currentRewards: [],


    // -------------------------------------------------------
    // 4.1 宝箱生成
    // -------------------------------------------------------

    /**
     * 生成宝箱（敌人死亡时调用）
     * @param {number} x, y - 掉落坐标
     * @param {string} type - 'normal'|'elite'|'legendary'
     *
     * 算法:
     * 1. 创建宝箱对象 { x, y, type, alive: true }
     * 2. 加入 pendingChests
     */
    spawnChest(x, y, type) {},

    /**
     * 玩家拾取宝箱（碰撞检测触发）
     * @param {Object} chest
     *
     * 算法:
     * 1. chest.alive = false
     * 2. 调用 generateRewards(chest.type, player)
     * 3. 推入 currentRewards
     * 4. 通知 UI 显示选择界面
     * 5. 设置 gameState = 'loot'
     */
    pickupChest(chest) {},


    // -------------------------------------------------------
    // 4.2 奖励生成
    // -------------------------------------------------------

    /**
     * 生成宝箱奖励选项
     */
    generateRewards(chestType, player) {},

    /**
     * 生成单个道具选项
     */
    _generateItemOption(rarity, biasWeights) {},

    /**
     * 生成单个武器选项
     */
    _generateWeaponOption(rarity, biasWeights) {},

    /**
     * 生成金币选项
     */
    _generateGoldOption(goldRange) {},


    // -------------------------------------------------------
    // 4.3 玩家选择
    // -------------------------------------------------------

    /**
     * 玩家选择一个奖励
     * @param {number} index
     * @param {Object} player
     *
     * 算法:
     * 1. 获取选中的选项
     * 2. 如果 type='item': ItemSystem.buyItem(id, player)（免费，cost=0）
     * 3. 如果 type='weapon': 加入武器槽（同 shop 逻辑）
     * 4. 如果 type='gold': player.materials += amount
     * 5. 从 pendingChests 移除该宝箱
     * 6. 如果有更多宝箱 → 继续显示；否则 → gameState = 'playing' 或 'levelup'/'shopping'
     */
    selectReward(index, player) {},


    // -------------------------------------------------------
    // 4.4 查询
    // -------------------------------------------------------

    /** 获取当前可选的奖励 */
    getCurrentRewards() {},

    /** 是否还有待拾取的宝箱 */
    hasPendingChests() {},


    // -------------------------------------------------------
    // 4.5 重置
    // -------------------------------------------------------

    reset() {
        this.pendingChests = [];
        this.currentRewards = [];
    },
};
```

---

## 五、与 main.js 的集成

### 5.1 敌人死亡 → 宝箱掉落

```js
// main.js _handleEnemyKill 中:
if (enemy.isBoss) {
    LootSystem.spawnChest(enemy.x, enemy.y, 'legendary');
} else if (enemy.isElite) {
    LootSystem.spawnChest(enemy.x, enemy.y, 'elite');
}
```

### 5.2 宝箱拾取

```js
// 在 update loop 中检查玩家与宝箱的碰撞:
_updateChestCollisions(player) {
    for (const chest of LootSystem.pendingChests) {
        if (!chest.alive) continue;
        const dx = chest.x - player.x;
        const dy = chest.y - player.y;
        if (Math.sqrt(dx*dx + dy*dy) < player.radius + 20) {
            LootSystem.pickupChest(chest);
        }
    }
}
```

### 5.3 状态流转

```js
// 当前流程: 波次结束 → chestreward → levelup → shopping
// 宝箱奖励选完后:
GameEngine.onLootComplete = function() {
    const p = PlayerSystem.player;
    if (p && p.xp >= p.xpToNext) { /* level up */ }
    else { /* show shop */ }
};
```

---

## 六、验收标准

- [ ] 精英敌人死亡 → 掉精英宝箱
- [ ] Boss 死亡 → 掉传奇宝箱
- [ ] 走近宝箱 → 显示 2~3 个选项
- [ ] 选项稀有度颜色正确
- [ ] 选择道具 → 免费获得（不扣金币）
- [ ] 选择武器 → 正确加入武器槽
- [ ] 选择金币 → materials 增加
- [ ] 多个宝箱排队 → 依次显示
- [ ] 宝箱生成后可见（renderer 绘制）