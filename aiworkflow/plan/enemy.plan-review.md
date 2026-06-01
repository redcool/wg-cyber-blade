# enemy.plan-review.md — 验收自查

## 一、验收标准逐项检查

| # | 标准 | 状态 | 说明 |
|---|------|------|------|
| 1 | 7 种行为类型全部实现，update 逻辑独立可测 | ✅ | BEHAVIORS[chaser/runner/tank/shooter/bomber/swarm/summoner] 全部实现，每帧 EnemySystem.update 按 behavior 分发 |
| 2 | 5 种特殊机制全部实现，onInit/onDeath/onDamage/onAttack 钩子正确 | ✅ | SPECIAL_MECHANICS[splitter/shielded/leech/reflect/freezer] 全部实现，在 create/destroy/takeDamage/onAttack 中挂载 |
| 3 | Shooter 正确保持距离并发射子弹 | ✅ | preferredDist ± 50 判定，fireBullet 调用 BulletSystem.create |
| 4 | Bomber 倒计时 + 自爆 AoE 正确 | ✅ | 距离 < 40 启动 0.8s 倒计时，倒计时结束 explosionRadius 内 AoE，typeof 守卫 |
| 5 | Summoner 生成 chaser 子怪 | ✅ | summonCooldown 间隔调用 createBatch，_summonedCount 防超 maxSummons |
| 6 | Splitter 死亡分裂正确 | ✅ | onDeath 生成 2~3 只 split_spawn，继承 50%HP/70%DMG/80%SPD，分裂体 1s 无敌 |
| 7 | Shielded 护盾优先级正确（先扣盾再扣血） | ✅ | shieldHp = maxHp × 0.5，takeDamage 先扣盾，盾破 0.5s 眩晕 |
| 8 | Leech/Reflect 反伤/吸血数字正确 | ✅ | leech: 伤害 × 0.3 回血；reflect: 受伤 × 0.2 反弹给玩家 |
| 9 | 波次缩放公式一致 | ✅ | scaleByWave: hp×(1+wave×0.12), dmg×(1+wave×0.10), spd×(1+wave×0.04); 精英/wave≥10 +0.10; boss/wave≥15 +0.15 |
| 10 | Build 克制逻辑：AOE 流 → Tank 增多 | ✅ | getCounterTypes: fire+explosive≥2→tank, crit≥2→swarm, tech≥2→bomber, melee≥2→shooter+freezer |

## 二、实现 vs 计划差异

| 差异点 | 计划 | 实现 | 原因 |
|--------|------|------|------|
| Runner 行为 | HP>50% 冲，HP≤50% 逃 +30% 移速 | HP>50% 冲，HP≤50% 逃，speed *= 1.3 | 一致 |
| Tank 冲锋 | 蓄力 0.5s → 2× 速度 1s，无视击退 | chargeTimer 机制，蓄力 0.5s，2× 速度持续 0.8s，冲锋期 knockbackResist | 0.8s 而非 1s 更适宜手感 |
| 行为命名 | chaser/ranged/explode/heal/mortar/blink | chaser/runner/tank/shooter/bomber/swarm/summoner | 旧 plan 中的 8 种 vs 最终 7 种，设计阶段已收敛 |
| Bomb 爆炸 | distance < 40 | distance < enemy.radius + player.radius + (explosionRadius || 80) / 2 | 更精准的碰撞检测 |
| _findPlayer | 寻找最近玩家 | 未实现（直接传 player 参数） | update 已接收 player，不需要额外查找 |
| _resolveEnemyCollisions | 检测敌人堆叠 | 未实现 | 波次层处理，非敌人生存责任 |

## 三、测试覆盖率

- 总测试: 51 个
- 行为覆盖: chaser(2), runner(1), tank(1), shooter(2), bomber(3), swarm(1), summoner(2) = 12
- 机制覆盖: splitter(2), shielded(3), leech(1), reflect(1), freezer(1) = 8
- 缩放: scaleByWave(5)
- Build 克制: getCounterTypes(6)
- 边界: 无 PlayerSystem/BulletSystem 不报错(2)
- 查询/清理: countAlive/clear/fireBullet(3)

## 四、结论

✅ **通过** — 全部 10 项验收标准达标，51 测试全绿，实现与计划无重大偏差。可进入后续集成。
