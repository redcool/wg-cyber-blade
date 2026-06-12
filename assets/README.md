# Assets 目录结构

本目录存放游戏运行时的静态资源（图片/图标/精灵帧）。

```
assets/
├── enemies/              ← 敌人图标（每个敌人一张 PNG）
│   ├── basic.png
│   ├── fast.png
│   ├── tank.png
│   ├── ...
│   └── shadowAssassin.png
├── sprites/enemies/      ← 敌人精灵动画帧（每个敌人一个子目录）
│   ├── basic/
│   │   ├── idle-1.png     静帧 1~4
│   │   ├── idle-2.png
│   │   ├── idle-3.png
│   │   ├── idle-4.png
│   │   ├── down-1~4.png   下方向行走 4 帧
│   │   ├── left-1~4.png   左方向行走 4 帧
│   │   ├── right-1~4.png  右方向行走 4 帧
│   │   └── up-1~4.png     上方向行走 4 帧
│   ├── fast/
│   ├── tank/
│   ├── boss/
│   ├── elite/
│   └── ranged/
├── weapons/              ← 武器图标（按武器 ID 命名）
│   ├── pistol.png
│   ├── smg.png
│   ├── fire_staff.png
│   └── ...
├── items/                ← 道具图标（按道具 ID 命名）
│   ├── hp_up.png
│   ├── speed_boots.png
│   └── ...
├── chars/                ← 角色头像（按角色 ID 命名）
│   ├── swordsman.png
│   ├── fire_mage.png
│   └── ...
├── bulletTypes/          ← 弹道视觉 PNG（渲染子弹用）
│   ├── spread_gun.png
│   ├── flame.png
│   └── ...
├── sceneItems/           ← 场景道具（炮塔等，按名+等级命名）
│   ├── turret1.png
│   ├── turret2.png
│   └── turret3.png
└── levelUpCards/         ← 升级卡牌背景图
    └── ...
```

## 命名约定

- **文件名 = CSV 中的 `id` 列**（大小写敏感），如 `csv/enemies.csv` 中 `fireLord` → `assets/enemies/fireLord.png`
- **精灵帧目录** = 敌人 ID 或 `ENEMY_SPRITE_SLUG` 映射名，见 `src/engine/assets.js:8` 中 `ENEMY_SPRITE_SLUG` 表
- **精灵帧数量**：每个方向固定 4 帧 (`{dir}-1.png` ~ `{dir}-4.png`)
- **方向**：`idle` / `down` / `left` / `right` / `up`
- **子弹类型图片**：由 `csv/bulletTypes.csv` 驱动，渲染时用 `assets/bulletTypes/{name}.png`
- **场景道具**：炮塔等用 `assets/sceneItems/{name}{level}.png`

## 文件要求

- 格式：**PNG**，支持透明通道
- 图标（enemies/weapons/items/chars）：建议 32~64px 居中，透明背景
- 精灵帧：与现有帧尺寸一致（参考 `basic/` 目录），透明背景
- 文件大小：一般 8~25KB（不要放大尺寸图）

## 加载规则

- 图标文件不存在 → 回退绘制彩色圆形 + glow 效果（`renderer.js:drawEnemy` 的 else 分支）
- 精灵帧不存在 → 回退静态图标呼吸动画（仍然可见，只是没动画）
- 新增敌人必须**同时**有 `assets/enemies/{id}.png`，否则仅显示彩色圆形
- 如果暂时不想做精灵动画，在 `src/engine/assets.js` 的 `ENEMY_SPRITE_SLUG` 中映射到现有目录即可（如 `swarm: 'basic'`）
- 资源带缓存版本号（`?v=...`），更新图片时强制刷新浏览器缓存

## 新增资源流程

```
1. CSV 中添加数据行（enemies.csv / weapons.csv / items.csv 等）
2. 运行 node scripts/csv2json.cjs          → 生成 JSON
3. node scripts/generate-data-bundle.js    → 生成 data-bundle.js
4. 将 PNG 放入对应 assets/ 子目录
5. 如需要精灵动画，创建 sprites/enemies/{id}/ 并放入帧
   否则在 ENEMY_SPRITE_SLUG 加映射复用现有动画
6. 自增 src/engine/cache-version.js 中 CACHE_VER
7. 刷新页面验证
```
