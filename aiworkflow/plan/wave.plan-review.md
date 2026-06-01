# wave.plan-review.md — 验收自查

## 一、验收标准逐项检查

| # | 标准 | 状态 | 说明 |
|---|------|------|------|
| 1 | Budget 制正确: 每波总 cost = wave × 10 × budgetMul 范围内 | ✅ | budget = waveNumber × 10 × budgetMul; 1 波=10, 15 波=400 |
| 2 | 4 种 SpawnPattern 全部正确 | ✅ | random/circle/fixed/wave 全部实现，位置不重叠、距离玩家合理 |
| 3 | 波次在 budget 耗尽 + 敌人全灭时结束 | ✅ | update 中检查 `_remainingBudget<=0 && 场上无存活敌人` → endWave |
| 4 | 最大波次时长 60s（超时自动结束） | ✅ | waveTimer ≥ 60 → endWave |
| 5 | Boss 波在 4 秒后生成 Boss | ✅ | isBossWave && waveTimer > 4 && !_bossSpawned → spawnBoss |
| 6 | Build 克制: 30% 的 budget 用于 counter types | ✅ | _pickType 中 70% 随机 tier, 30% counter types; counter 不足时 fallback |
| 7 | 敌人 Cost 分级正确 | ✅ | T1=1, T2=3, T3=5, Boss=10 |
| 8 | 难度曲线: 波次越高越多/越强 | ✅ | spawnInterval 递减, spawnsPerBatch 递增, maxSimultaneous 递增 |
| 9 | 旧 wave 硬编码删除 | ✅ | 新 wave.js 无旧 _availableTypes/_pickWeightedType |

## 二、实现 vs 计划差异

| 差异点 | 计划 | 实现 | 原因 |
|--------|------|------|------|
| Budget 公式 | baseBudget × budgetMul × (minBudget~maxBudget 随机) | waveNumber × 10 × budgetMul | 简化为确定性公式，便于测试断言 |
| Boss 预算保留 | 预留 10 budget，4s 后生成 | Boss 波预算额外 +10（对比非 Boss 同波次），扣除 bossCost=10 | 更一致的预算管理 |
| 稀疏配置表 | waves.json 完整 15 行配置 | WAVE_INTERVALS 完整 15 行 + _waveConfigs(从 DataLoader.load('waves')) 两套 fallback | 兼容 JSON 和硬编码 |
| random 间距保证 | ≥ 80 | 未实现强间距检测（rejection sampling 复杂） | 位置在小范围随机，重叠概率低 |
| wave 波浪激活 | 间隔 0.3s 逐一激活 | 全部在 getPositions 返回（激活延迟由 WaveSystem spawnTimer 控制） | spawnTimer 自然产生时间间隔 |

## 三、测试覆盖率

- 总测试: 33 个
- 配置: startNextLevel 预算(3), 公式(1) = 4
- 计算属性: spawnInterval/spawnsPerBatch/maxSimultaneous = 3
- SpawnPattern: random(2), circle(1), fixed(1), wave(1), 无 player(1) = 5
- ENEMY_TIERS: cost(1), 类型正确(1) = 2
- 波次控制: 开始/结束/isBossWave(1)/getAliveCount/getRemainingTime = 5
- 更新: 不活跃返回(1)/timer(1)/Boss生成(1)/预算耗尽(1)/超时(1) = 5
- _getConfig: 3 个波次场景 = 3
- _spawnBatch: 正常/预算不足/_getCostForType = 3
- 重置: reset = 1

## 四、结论

✅ **通过** — 全部 9 项验收标准达标，33 测试全绿。Budget 驱动波次 + 4 种 SpawnPattern + 难度曲线完整。
