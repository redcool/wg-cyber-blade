# csv2json.plan-review.md — 实现完成，请求 Pro 审核

## 实现范围

| 文件 | 状态 | 说明 |
|------|------|------|
| `scripts/csv2json.js` | ✅ 完成 | CSV→JSON 转换引擎，含 6 个 Schema 定义 |
| `src/engine/data.js` | ✅ 完成 | 运行时统一数据加载器（fetch JSON） |
| `csv/characters.csv` | ✅ 完成 | 11 角色，按 Pro 修正方案 (damagePercent=0, critDamage=0) |
| `csv/weapons.csv` | ✅ 完成 | 52 武器，mods 已摊平为独立列 |
| `csv/items.csv` | ✅ 完成 | 30 道具，effects JSON 子列 |
| `csv/enemies.csv` | ✅ 完成 | 10 敌人，isElite/isBoss 在 paramsJson 之前 |
| `csv/bosses.csv` | ✅ 完成 | 1 Boss (fireLord)，phasesJson 示例 |
| `csv/waves.csv` | ✅ 完成 | 20 波，按难度曲线从 budget 8~10 到 200~220 |
| `src/data/*.json` | ✅ 完成 | 一键 `node scripts/csv2json.js` 生成，6/6 无警告 |

## 验收结果

| 验收项 | 结果 |
|--------|------|
| `node scripts/csv2json.js` 无报错运行 | ✅ 6/6 成功，0 警告 |
| 生成的 JSON 可 `JSON.parse()` 无损还原 | ✅ 验证通过 |
| `damagePercent` / `critDamage` = 0 | ✅ 按 Pro 修正 |
| JSON 子列 (effects/paramsJson/phasesJson) 正确解析 | ✅ |
| waves 1~20 全部有行 | ✅ |

## 待确认

- 是否删除旧的 `src/engine/csv.js`？（Plan 说「删除或保留为空壳」）
- 是否在 `index.html` 中添加 `src/engine/data.js` 的 `<script>` 标签？
- 是否需要更新 game code 中的 `loadFromTable()` → `DataLoader.load()` 调用？（这是后续 Phase 的工作）

## 请求审核

请 Pro 审核实现代码和 CSV 数据，如有问题请写 `csv2json.plan-done.q.md`。
