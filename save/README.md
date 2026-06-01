# 存档目录

本目录用于存放游戏的存档文件（JSON 格式）。

## 存档系统说明

- **自动存档**: 游戏通过 `localStorage` 自动保存解锁进度
- **手动存档**: 可在主菜单中手动保存/加载
- **导出存档**: 可导出为 `.json` 文件备份或分享
- **导入存档**: 可从 `.json` 文件恢复存档

## 文件说明

| 文件 | 说明 |
|------|------|
| `*.json` | 导出的存档备份文件 |

## 存档数据结构

```json
{
  "version": 1,
  "timestamp": 1717000000000,
  "stats": {
    "totalKills": 150,
    "totalMaterials": 5000,
    "totalLevels": 25,
    "maxLevel": 15,
    "highestLevel": 15,
    "totalPlayTime": 3600
  },
  "unlockedWeapons": ["plasma", "axe", ...],
  "unlockedCharacters": ["mech", "assassin", ...]
}
```
