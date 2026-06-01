# 敌人数值表
# 格式: CSV (逗号分隔), 以 # 开头的行为注释行
#
# 列顺序 (15列):
# id, name, behavior, hp, speed, damage, radius, color, glowColor,
# xpValue, materialValue, attackCooldown,
# params,
# isElite, isBoss
#
# params: JSON 格式, 存放行为专属参数。
#   单属性直接写JSON(无逗号), 多属性用""包裹并内部""转义
#   各 behavior 的参数:
#     chase : (无)
#     ranged: preferredDist, bulletSpeed
#     explode: explosionRadius, explosionDamageMult
#     heal: preferredDist, healCooldown, healRadius, healAmount
#     mortar: preferredDist, mortarCooldown, mortarSpeed
#     blink: blinkCooldown, blinkDist, dodgeChance
# isElite / isBoss: true = 是, 空 = 否
#
# 注意: 难度缩放(每关+12%HP/+10%DMG/+4%SPD) 在代码 enemy.js 中实现,
# 此表为基础值。精英额外加成(10关起每关+10%), Boss额外加成(15关起) 见代码。

# ====== 普通敌人 ======
basic,无人机兵,chase,30,80,8,14,#ff4444,#ff0044,5,2,1.5,,,
fast,疾行者,chase,20,160,6,10,#ff8800,#ff6600,6,2,1.2,,,
tank,重装机兵,chase,120,45,15,22,#8844ff,#6622ff,12,5,2.0,,,
ranged,狙击手,ranged,25,55,12,12,#ff00aa,#ff0088,8,3,2.0,\"{\"\"preferredDist\"\":250,\"\"bulletSpeed\"\":350}\",,

# ====== 特殊行为敌人 ======
exploder,自爆者,explode,40,120,12,16,#ff5500,#ff2200,7,2,0,\"{\"\"explosionRadius\"\":80,\"\"explosionDamageMult\"\":1.5}\",,
healer,修复者,heal,35,65,5,14,#44ff88,#22ff66,9,3,2.5,\"{\"\"preferredDist\"\":250,\"\"healCooldown\"\":3.0,\"\"healRadius\"\":120,\"\"healAmount\"\":10}\",,
mortar,迫击者,mortar,30,40,18,14,#aa44ff,#8822ff,10,4,3.0,\"{\"\"preferredDist\"\":350,\"\"mortarCooldown\"\":3.0,\"\"mortarSpeed\"\":180}\",,
blinker,闪现者,blink,25,90,14,12,#ff44ff,#ff00ff,8,3,1.5,\"{\"\"blinkCooldown\"\":2.0,\"\"blinkDist\"\":100,\"\"dodgeChance\"\":0.3}\",,

# ====== 精英/Boss ======
elite,精英猎手,chase,250,70,20,24,#ffcc00,#ffaa00,30,15,1.0,,true,
boss,BOSS·毁灭者,chase,800,55,30,36,#ff0044,#ff0000,80,40,0.8,,,true
