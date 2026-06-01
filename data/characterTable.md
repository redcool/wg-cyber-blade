# 角色数值表
# 格式: CSV (逗号分隔), 以 # 开头的行为注释行
#
# 列顺序:
# id, name, desc, icon, unlocked, weaponSlots, affinities,
# maxHp, hpRegen, speed, damage, attackSpeed, attackRange, armor, dodge,
# critChance, critMultiplier, bulletCount, bulletPierce, bulletSpeed, lifeSteal,
# pickupRange, harvesting, luck,
# unlockType, unlockValue
#
# unlockType / unlockValue:
#   空/空 = 默认解锁
#   maxLevel / N = 通关第 N 关解锁
#   totalKills / N = 累计击杀 N 解锁
# affinities: 用 | 分隔多个标签 (melee|gun|bow|magic|medic|lance)

# ======== 默认解锁角色 ========
swordsman,剑客,"近战达人，擅长用剑/斧类武器",⚔️,true,6,melee|lance,120,0.6,240,18,1.2,200,3,0.03,0.05,2.0,1,0,400,0.02,40,0,0,,
gunslinger,枪手,"远程火力，枪械精通",🔫,true,6,gun,90,0.4,220,20,1.3,350,1,0.02,0.08,2.2,1,0,600,0,60,0,1,,
fire_mage,火焰法师,"元素掌控者，魔法大师",🔥,true,6,magic,80,0.5,200,15,0.9,320,0,0.02,0.05,2.5,1,0,450,0,50,0,2,,
archer,弓箭游侠,"远程精准打击，暴击穿透流派",🏹,true,6,bow,95,0.5,230,16,1.1,360,1,0.03,0.10,2.3,1,0,550,0,55,0,1,,

# ======== 解锁角色 ========
mech,重型机甲,"血厚防高，但移速较慢",🦾,false,5,gun|melee|lance,180,0.3,140,12,0.8,280,8,0,0.03,1.8,1,1,450,0,40,0,0,maxLevel,5
assassin,疾影刺客,"极速高伤，但非常脆弱",🗡️,false,4,melee|bow|lance,70,0.8,280,22,1.5,220,0,0.12,0.12,2.8,1,0,550,0.03,60,0,2,totalKills,100
medic,医疗兵,"回复支援型，擅长医疗武器",💊,false,6,medic,100,2.0,200,12,1.0,280,2,0.04,0.05,2.0,1,0,500,0.02,70,0,1,totalKills,80
paladin,圣骑士,"攻守兼备，近战医疗双修",✨,false,6,melee|medic|lance,140,1.0,180,16,0.9,220,5,0.02,0.05,2.0,1,0,400,0.03,50,0,0,maxLevel,10
engineer,工程师,"科技暴击流，枪械元素双修",🔧,false,6,gun|magic,90,0.5,210,14,1.1,320,2,0.03,0.12,3.0,2,0,550,0,60,0,2,totalKills,200
berserker,狂战士,"低血高伤，嗜血狂暴",💢,false,5,melee|gun|bow|magic|medic|lance,60,0.3,260,25,1.6,180,0,0.05,0.08,2.5,1,0,450,0.08,45,0,0,maxLevel,15
dragon_knight,龙骑士,"龙骑无双，骑枪专精",🐉,false,5,lance,150,0.6,240,22,1.0,280,4,0.02,0.06,2.2,1,0,0,0.02,50,0,1,totalKills,300
