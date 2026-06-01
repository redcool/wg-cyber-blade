# DEPRECATED — 旧数据文件

本目录下的 `.md` 文件已不再作为运行时数据源使用。

## 新数据位置

| 旧位置 | 新位置 |
|--------|--------|
| `data/*Table.md` | `csv/*.csv`（源数据）→ `src/data/*.json`（构建时生成） |

## 迁移说明

- **源数据**: `csv/*.csv` — 可直接在 Excel/Google Sheets 中编辑
- **构建**: 运行 `node scripts/csv2json.js` 将 CSV 转换为 JSON
- **运行时加载**: `src/engine/data.js` 的 `load(name)` 从 `src/data/` 加载 JSON

## 删除计划

等所有模块完成迁移后删除此目录中的 `.md` 文件。
