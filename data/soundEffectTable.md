# 音效表 soundEffectTable.md
# 将音效类型映射到对应的 wav 文件
# 列顺序: id, file, name, category
# - id: audio.js play(type) 中使用的类型标识
# - file: sounds/ 目录下的 wav 文件名（留空 = 使用程序化生成）
# - name: 中文描述
# - category: combat=战斗, ui=界面, pickup=拾取, system=系统

se_shoot,se_Shoot.wav,射击,combat
se_laser,se_Laser.wav,激光,combat
se_enemy_hit,se_Hit1.wav,命中敌人,combat
se_hurt,se_Hit1.wav,玩家受伤,combat
se_enemy_die,se_Hit1.wav,敌人死亡,combat
se_explosion,se_explosion.m4a,爆炸,combat
se_coin,se_Coin.wav,金币收集,pickup
se_pickup,se_PowerUp3.wav,拾取物品,pickup
se_levelup,se_levelUp.wav,升级,system
se_click,se_Click.wav,界面点击,ui
se_melee_slash,se_lightSwordSlice1.m4a,近战轻击(横扫),combat
se_melee_heavy,se_violentSwordSlice.m4a,近战重击(突刺),combat
se_cannon,se_cannonFire.m4a,火炮(爆炸武器),combat
se_cannon_shot,se_cannonShot02.m4a,火炮射击,combat
se_gunshot,se_gunShot.m4a,标准枪声,combat
se_pistol,se_pistolShot.m4a,手枪射击(默认),combat
se_heavy_gun,se_heavy-gunshot.m4a,重型枪声(霰弹),combat
se_arrow,se-arrowSwish.m4a,弓箭,combat
se_fire,se_fireball.m4a,火焰喷射,combat
se_ice,se_iced-magic.m4a,冰霜魔法,combat
se_lightning,se_lightning.m4a,闪电(连锁),combat
se_magic,se_sci-fi-launch.m4a,魔法发射(追踪),combat
se_spear,se_spearThrust.m4a,长枪突刺,combat
se_axe,se_axeSlash.m4a,斧头挥砍,combat
