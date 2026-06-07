# DEPRECATED

已废弃的代码,保留供参考,不再被加载或维护。

## 目录

| 文件 | 替换为 | 说明 |
|---|---|---|
| `cyberblade-character.js` | `src/engine/character.js` | 角色系统(旧 CSV 解析版,字段顺序已错) |
| `cyberblade-enemy.js` | `src/engine/enemy.js` | 敌人系统(旧版,字段/方法签名不匹配) |
| `cyberblade-wave.js` | `src/engine/wave.js` | 关卡系统(旧版,数据驱动) |
| `cyberblade-shop.js` | `src/engine/engine-shop.js` | 商店系统(旧版,数据驱动) |

## 状态

- 所有文件均已在 `index.html` 中注释(不加载)。
- 无 git 追踪历史(本地遗留)。
- 不再维护,如需查阅请直接读 `src/engine/` 下对应文件。
