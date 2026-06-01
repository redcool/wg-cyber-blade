# 武器数值表
# 格式: CSV (逗号分隔), 以 # 开头的行为注释行
#
# 网格换算: 1网格 = 80px
#   近战武器范围: 1~2网格 (80~160px)
#   长矛类武器范围: 1~3网格 (80~240px)
#   远程武器范围: 1~4网格 (80~320px)
#
# 列顺序 (28列):
# id, name, desc, icon, slots, cost, tag,
# mods, behavior,
# bulletCount, bulletSpeed, damageMult, attackSpeedMult, spread, pierce,
# meleeRange, attackRange,
# burnDps, burnMaxStacks, chainCount, splashRadius, homingStrength,
# slowAmount, slowDuration,
# healOnHit, auraHeal, auraRadius, sprayCone
#
# mods: 武器属性修正。单属性直接写JSON(无逗号), 多属性用""包裹并内部""转义
#   单属性: {"damageMult":0.5}          = +50%伤害
#   多属性: "{""damageMult"":0.5,""attackSpeedMult"":-0.25}"
#          = +50%伤害 -25%攻速
#   空: {} = 无修正
#   key含义:
#     damageMult: 伤害修正(乘算), attackSpeedMult: 攻速修正(乘算)
#     attackRangeMult: 射程修正(乘算), speedMult: 移速修正(乘算)
#     critChanceAdd: 暴率(加算), critMultiplierAdd: 暴伤(加算)
#     armorAdd: 护甲(加算), hpRegenAdd: 回复/秒(加算)
#     maxHpAdd: 最大HP(加算), lifeStealAdd: 吸血(加算)
#     bulletSpeedMult: 弹速修正(乘算)
#
# 注: meleeRange 仅近战武器使用, attackRange 仅远程武器使用

# ==============================
# 近战 (melee) × 10
# ==============================
plasma,等离子刀,"挥动180° +50%伤害",🗡️,1,10,melee,{"damageMult":0.5},melee_sweep,1,0,1.5,0.50,0,0,100,,0,0,0,0,0,,,,,,
axe,能量斧,"挥动180° +20%暴伤 -15%攻速",🪓,1,12,melee,"{""attackSpeedMult"":-0.15,""critMultiplierAdd"":0.5}",melee_sweep,1,0,2.0,1.00,0,0,100,,0,0,0,0,0,,,,,,
dagger,双持匕首,"双挥180° +10%攻速 -30%射程",🔪,1,8,melee,"{""attackSpeedMult"":0.1,""attackRangeMult"":0.7}",melee_sweep,2,0,1.3,0.38,0,0,90,,0,0,0,0,0,,,,,,
chainsaw,链锯剑,"挥动 灼烧5/s×3层 +20%伤害 -10%移速",⚙️,1,14,melee,"{""damageMult"":0.2,""speedMult"":-0.1}",melee_sweep,1,0,1.8,0.55,0,0,110,,5,3,0,0,0,,,,,,
sword,能量剑,"突刺穿透3 +15%伤害",⚔️,1,11,melee,"{""damageMult"":0.15,""attackRangeMult"":1.15}",melee_thrust,1,0,1.6,0.60,0,3,120,,0,0,0,0,0,,,,,,
katana,武士刀,"突刺穿透3 暴击伤害×3 +5%暴率",🗡️,1,15,melee,{"critChanceAdd":0.05},melee_thrust,1,0,2.2,0.70,0,3,120,,0,0,0,0,0,,,,,,
hammer,重锤,"挥动击退400 +15%伤害 -25%攻速",🔨,1,16,melee,"{""damageMult"":0.15,""attackSpeedMult"":-0.25}",melee_sweep,1,0,3.0,1.40,0,0,90,,0,0,0,0,0,,,,,,
spear,能量矛,"突刺穿透3 -10%攻速",🔱,1,13,melee,{"attackSpeedMult":-0.1},melee_thrust,1,0,1.8,0.85,0,3,160,,0,0,0,0,0,,,,,,
claws,利爪,"挥动三连击180° +15%攻速 -20%伤害",🐾,1,7,melee,"{""attackSpeedMult"":0.15,""damageMult"":-0.2}",melee_sweep,3,0,1.2,0.30,0,0,80,,0,0,0,0,0,,,,,,
whip,能量鞭,"挥动范围大 +10%射程 -10%伤害",🪢,1,14,melee,"{""attackRangeMult"":1.1,""damageMult"":-0.1}",melee_sweep,1,0,1.4,1.25,0,0,160,,0,0,0,0,0,,,,,,

# ==============================
# 枪械 (gun) × 11
# ==============================
pistol,基础手枪,"平衡型标准武器",🔫,1,0,gun,{},bullet,1,500,1.0,1.0,0.1,0,,320,0,0,0,0,0,,,,,,
smg,冲锋枪,"极快射速 -25%伤害 +5%移速",🔫,1,12,gun,"{""damageMult"":-0.25,""speedMult"":0.05}",spread,1,700,0.6,0.3,0.12,0,,320,0,0,0,0,0,,,,,,
shotgun,散弹枪,"4发散弹 -20%伤害 -25%攻速",💥,1,10,gun,"{""damageMult"":-0.2,""attackSpeedMult"":-0.25}",spread,1,400,0.8,1.0,0.35,0,,320,0,0,0,0,0,,,,,,
sniper,狙击枪,"穿透+2 +150%伤害 -40%攻速",🎯,1,12,gun,"{""damageMult"":1.5,""attackSpeedMult"":-0.4}",bullet,1,1200,2.5,1.0,0.02,2,,320,0,0,0,0,0,,,,,,
gatling,加特林,"2发 +100%攻速 -30%伤害 -10%移速",⚡,1,14,gun,"{""damageMult"":-0.3,""speedMult"":-0.1}",spread,1,600,0.7,0.4,0.15,0,,320,0,0,0,0,0,,,,,,
revolver,左轮手枪,"高伤害单发 +10%暴率",🔫,1,9,gun,{"critChanceAdd":0.1},bullet,1,550,1.8,1.0,0.05,0,,320,0,0,0,0,0,,,,,,
rifle,突击步枪,"3发连射 +5%伤害",🔫,1,13,gun,{"damageMult":0.05},spread,1,800,1.2,0.9,0.08,0,,320,0,0,0,0,0,,,,,,
rifle2,战斗步枪,"2发连射 +30%伤害 穿透+1",🔫,1,15,gun,{"damageMult":0.3},spread,1,900,1.6,1.0,0.06,1,,320,0,0,0,0,0,,,,,,
shotgun_double,双管散弹,"8发散弹 -30%攻速",💥,1,16,gun,{"attackSpeedMult":-0.3},spread,1,350,1.5,1.0,0.4,0,,320,0,0,0,0,0,,,,,,
magnum,马格南,"穿透+3 +50%伤害 -50%攻速",🔫,1,18,gun,"{""damageMult"":0.5,""attackSpeedMult"":-0.5}",bullet,1,600,3.5,1.0,0.02,3,,320,0,0,0,0,0,,,,,,
minigun,迷你机枪,"3发极速 -30%伤害 -5%移速",⚡,1,20,gun,"{""damageMult"":-0.3,""speedMult"":-0.05}",spread,1,650,0.4,0.2,0.15,0,,320,0,0,0,0,0,,,,,,

# ==============================
# 弓箭 (bow) × 10
# ==============================
bow,长弓,"标准射击 +5%暴率",🏹,1,8,bow,{"critChanceAdd":0.05},bullet,1,600,1.4,0.9,0.02,0,,320,0,0,0,0,0,,,,,,
crossbow,弩,"穿透+1 +30%暴伤",🏹,1,12,bow,{"critMultiplierAdd":0.3},bullet,1,900,2.0,1.0,0.01,1,,320,0,0,0,0,0,,,,,,
longbow,强弓,"穿透+2 +20%伤害 -20%攻速",🏹,1,14,bow,"{""damageMult"":0.2,""attackSpeedMult"":-0.2}",bullet,1,700,2.5,1.0,0.01,2,,320,0,0,0,0,0,,,,,,
recurve,反曲弓,"攻速较快 +15%攻速",🏹,1,10,bow,{"attackSpeedMult":0.15},bullet,1,500,1.2,0.7,0.04,0,,320,0,0,0,0,0,,,,,,
explosive_arrow,爆裂箭,"爆炸40px +20%伤害",💣,1,16,bow,{"damageMult":0.2},explode,1,400,1.8,1.0,0.03,0,,320,0,0,0,40,0,,,,,,
frost_arrow,冰霜箭,"减速50% 2s -15%伤害",❄️,1,12,bow,{"damageMult":-0.15},frost,1,550,1.0,1.0,0.03,0,,320,0,0,0,0,0,0.5,2.0,,,,
poison_arrow,毒箭,"中毒8/s×3s -10%伤害",☠️,1,10,bow,{"damageMult":-0.1},bullet,1,500,0.8,0.9,0.03,0,,320,8,3,0,0,0,,,,,,
triple_shot,三连弓,"3发散弹 -10%伤害",🏹,1,14,bow,{"damageMult":-0.1},spread,1,600,1.0,0.9,0.15,0,,320,0,0,0,0,0,,,,,,
piercing_shot,穿甲箭,"穿透+4 +15%伤害 -15%攻速",🎯,1,15,bow,"{""damageMult"":0.15,""attackSpeedMult"":-0.15}",bullet,1,850,2.2,1.0,0.01,4,,320,0,0,0,0,0,,,,,,
homing_bow,追踪弓,"自动追踪 -10%伤害",🎯,1,16,bow,{"damageMult":-0.1},homing,1,300,1.3,0.8,0.05,0,,320,0,0,0,0,3,,,,,,

# ==============================
# 元素 (magic) × 10
# ==============================
fire_staff,火球杖,"爆炸45px+灼烧5/s -15%伤害",🔥,1,12,magic,{"damageMult":-0.15},explode,1,400,1.5,0.9,0.05,0,,320,5,3,0,45,0,,,,,,
frost_staff,冰霜杖,"减速60% 3s -10%攻速",❄️,1,14,magic,{"attackSpeedMult":-0.1},frost,1,500,1.2,0.9,0.05,0,,320,0,0,0,0,0,0.6,3.0,,,,
thunder_staff,雷电杖,"连锁+3目标 -5%伤害",⚡,1,16,magic,{"damageMult":-0.05},shock,1,800,1.8,1.0,0.05,0,,320,0,0,3,0,0,,,,,,
energy_staff,能量杖,"穿透+2 -10%攻速",🔮,1,15,magic,{"attackSpeedMult":-0.1},bullet,1,700,2.0,1.0,0.02,2,,320,0,0,0,0,0,,,,,,
magic_orb,魔法弹,"自动追踪 -5%伤害",🔮,1,9,magic,{"damageMult":-0.05},homing,1,250,1.3,0.8,0.08,0,,320,0,0,0,0,3,,,,,,
poison_staff,毒杖,"中毒12/s×3s",☠️,1,13,magic,{},frost,1,450,0.9,1.0,0.06,0,,320,12,3,0,0,0,,,,,,
void_staff,虚空杖,"范围80px吸取 +5%吸血",🕳️,1,18,magic,{"lifeStealAdd":0.05},explode,1,300,2.5,1.2,0.04,0,,320,0,0,0,80,0,,,,,,
lightning_staff,闪电杖,"暴击连锁+5 +10%暴率",⚡,1,14,magic,{"critChanceAdd":0.1},shock,1,900,1.6,0.9,0.04,0,,320,0,0,5,0,0,,,,,,
fire_wand,火焰魔棒,"灼烧3/s×2s +10%攻速",🪄,1,8,magic,{"attackSpeedMult":0.1},bullet,1,450,1.1,0.7,0.06,0,,320,3,2,0,0,0,,,,,,
arcane_orb,奥术球,"3发追踪弹 +10%射程",🔮,1,17,magic,{"attackRangeMult":1.1},homing,1,250,2.2,0.9,0.1,0,,320,0,0,0,0,3,,,,,,

# ==============================
# 喷射类 (magic) × 3
# ==============================
flame_spray,火焰喷射器,"锥形火焰 穿透3 灼烧6/s×3s",🔥,1,14,magic,{},spray,1,300,1.2,0.6,0.5,3,,320,6,3,0,0,0,,,,,,0.8
poison_spray,毒雾喷射器,"锥形毒雾 穿透3 中毒10/s×3s",☠️,1,13,magic,{},spray,1,280,1.0,0.7,0.6,3,,320,10,3,0,0,0,,,,,,0.8
cold_spray,冷气喷射器,"锥形冷气 穿透3 减速50%/2s 冰爆40px",❄️,1,15,magic,{},spray,1,320,1.1,0.7,0.55,3,,320,0,0,0,40,0,0.5,2.0,,,,0.8

# ==============================
# 医疗 (medic) × 5
# ==============================
heal_gun,治愈枪,"攻击回血+3 -20%伤害 +2回复",💉,1,10,medic,"{""damageMult"":-0.2,""hpRegenAdd"":2.0}",heal_bullet,1,500,0.6,0.9,0.05,0,,320,0,0,0,0,0,,,,3,,,
shield,圣光盾,"治疗光环5/s r100 -50%伤害 +3护甲",✨,1,16,medic,"{""damageMult"":-0.5,""armorAdd"":3,""speedMult"":-0.15}",shield_aura,0,0,0.3,1.5,0,0,,300,0,0,0,0,0,,,,,5,100,
holy_staff,圣光杖,"20%回血+5 -10%伤害 +1回复",✨,1,14,medic,"{""damageMult"":-0.1,""hpRegenAdd"":1.0}",bullet,1,500,1.0,0.9,0.04,0,,320,0,0,0,0,0,,,,5,,,
life_wand,生命魔棒,"击杀回血+8 -15%伤害 +5HP",💚,1,9,medic,"{""damageMult"":-0.15,""maxHpAdd"":5}",bullet,1,450,0.8,0.8,0.06,0,,310,0,0,0,0,0,,,,,,
blessing,祝福盾,"减伤光环 -30%伤害 +2护甲",🛡️,1,15,medic,"{""damageMult"":-0.3,""armorAdd"":2}",shield_aura,0,0,0.5,1.2,0,0,,300,0,0,0,0,0,,,,,3,80,

# ==============================
# 骑枪 (lance) × 3
# ==============================
pike,长枪,"超长距突刺 穿透+4 射程200",🔱,1,12,lance,{"attackRangeMult":1.15},melee_thrust,1,0,2.0,0.80,0,4,200,,0,0,0,0,0,,,,,,
cavalry_lance,骑枪,"超长距突刺 穿透+5 +30%伤害 -25%攻速",🔱,1,16,lance,"{""damageMult"":0.3,""attackSpeedMult"":-0.25}",melee_thrust,1,0,3.2,1.10,0,5,220,,0,0,0,0,0,,,,,,
trident,三叉戟,"三叉突刺 穿透+6 -10%伤害 +15%射程",🔱,1,14,lance,"{""damageMult"":-0.1,""attackRangeMult"":1.15}",melee_thrust,1,0,1.6,0.85,0,6,180,,0,0,0,0,0,,,,,,
