#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CYBER BLADE - Weapon Icon Upward Generator (v2 - 强化方向约束)
=============================================================
批量重新生成所有武器图标，正方向严格朝上（upward）。

v2 改进:
  - 提示词开篇即明确武器尖端指向正上方，握把朝下
  - 强调"单件孤立武器，无其他物品"
  - 每个武器提示词都包含具体的方向和位置描述
  - 确保生成图片只有一把武器，没有多余的像素

用法:
  1. 确保 ComfyUI 已启动（http://127.0.0.1:8188）
  2. python comfyui/batch_generate_weapons.py
"""

import json
import time
import os
import sys
import shutil
import urllib.request
import urllib.error

# ====== 透明度处理（PIL 绿色背景抠图） ======
try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print("[WARN] PIL (Pillow) 未安装，透明背景处理将跳过。")
    print("       执行: pip install Pillow")

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

COMFYUI_URL = "http://127.0.0.1:8188"
OUTPUT_DIR = "H:/AI/ComfyUI_windows_portable/ComfyUI/output"
ASSETS_WEAPONS_DIR = "H:/ai_works/buffPrj1/assets/weapons"

# ====== 强化提示词模板 ======
#
# 每个提示词的固定结构:
#   1. [方向强制] 武器尖端严格指向正上方，笔直朝上，握把/底座在下方
#   2. [单件约束] 单件孤立武器，居中构图，画面中只有这一件物品，无其他物体，无多余元素
#   3. [武器具体描述] 根据每种武器定制
#   4. [标准后缀] 俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产

WEAPON_PROMPTS = [
    # ==============================
    # 近战 (melee) × 10
    # ==============================
    ("plasma", "等离子刀",
     "武器尖端严格指向正上方，笔直朝上，握把朝下。单件孤立武器，居中构图，画面中只有这一把武器，无其他物体。"
     "未来等离子军刀，能量剑刃，金属握柄。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("axe", "能量斧",
     "武器尖端严格指向正上方，笔直朝上，握把朝下。单件孤立武器，居中构图，画面中只有这一把武器，无其他物体。"
     "未来能量战斧，厚重金属斧刃，能量光效。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("dagger", "双持匕首",
     "武器尖端严格指向正上方，笔直朝上，握把朝下。单件孤立武器，居中构图，画面中只有这一把武器，无其他物体。"
     "未来匕首，短小锋利，能量刀刃，单把匕首。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("chainsaw", "链锯剑",
     "武器尖端严格指向正上方，笔直朝上，握把朝下。单件孤立武器，居中构图，画面中只有这一把武器，无其他物体。"
     "链锯剑，旋转锯齿，金属机械构造。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("sword", "能量剑",
     "刀刃尖端严格指向正上方，笔直朝上，剑柄朝下。单件孤立武器，居中构图，画面中只有这一把剑，无其他物体。"
     "未来能量剑，修长剑身，发光能量刃，金属护手。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("katana", "武士刀",
     "刀刃尖端严格指向正上方，笔直朝上，刀柄朝下。单件孤立武器，居中构图，画面中只有这一把刀，无其他物体。"
     "未来武士刀，长而弯曲的能量刀刃，传统刀柄带现代元素。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("hammer", "重锤",
     "锤头严格指向正上方，笔直朝上，握柄朝下。单件孤立武器，居中构图，画面中只有这一把战锤，无其他物体。"
     "巨大战锤，厚重的金属锤头，能量核心脉冲。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("spear", "能量矛",
     "矛尖严格指向正上方，笔直朝上，握柄朝下。单件孤立武器，居中构图，画面中只有这一根长矛，无其他物体。"
     "能量长矛，锐利矛尖附能量光效，长握柄。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("claws", "利爪",
     "爪刃尖端严格指向正上方，笔直朝上。单件孤立武器，居中构图，画面中只有这一副利爪，无其他物体。"
     "机械利爪，三根弯曲的金属爪刃，装配在手套上，朝上展开。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("whip", "能量鞭",
     "鞭身笔直朝上延伸，握柄在下方。单件孤立武器，居中构图，画面中只有这一条鞭子，无其他物体。"
     "能量鞭子，分段式能量光带，握柄在下方，鞭身朝上延伸。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),

    # ==============================
    # 枪械 (gun) × 10
    # ==============================
    ("pistol", "基础手枪",
     "枪管严格指向正上方，笔直朝上，握把朝下。单件孤立武器，居中构图，画面中只有这一把手枪，无其他物体。"
     "未来手枪，紧凑枪身，枪管朝上，机械构造。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("smg", "冲锋枪",
     "枪管严格指向正上方，笔直朝上，握把朝下。单件孤立武器，居中构图，画面中只有这一把冲锋枪，无其他物体。"
     "未来冲锋枪，较长弹匣，双握把，枪管朝上。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("shotgun", "散弹枪",
     "枪管严格指向正上方，笔直朝上，握把朝下。单件孤立武器，居中构图，画面中只有这一把散弹枪，无其他物体。"
     "未来散弹枪，短而粗的双枪管朝上，泵动机构。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("sniper", "狙击枪",
     "枪管严格指向正上方，笔直朝上，握把朝下。单件孤立武器，居中构图，画面中只有这一把狙击枪，无其他物体。"
     "未来狙击枪，超长枪管朝上，瞄准镜，精密构造。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("gatling", "加特林",
     "多根枪管严格指向正上方，笔直朝上，握把朝下。单件孤立武器，居中构图，画面中只有这一把加特林，无其他物体。"
     "未来加特林机枪，多管旋转枪管朝上，重型构造。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("revolver", "左轮手枪",
     "枪管严格指向正上方，笔直朝上，握把朝下。单件孤立武器，居中构图，画面中只有这一把左轮手枪，无其他物体。"
     "未来左轮手枪，旋转弹巢，枪管朝上，经典造型。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("rifle", "突击步枪",
     "枪管严格指向正上方，笔直朝上，握把朝下。单件孤立武器，居中构图，画面中只有这一把步枪，无其他物体。"
     "未来突击步枪，中等长度枪管朝上，战术导轨。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("shotgun_double", "双管散弹",
     "双枪管严格指向正上方，笔直朝上，握把朝下。单件孤立武器，居中构图，画面中只有这一把双管散弹枪，无其他物体。"
     "未来双管散弹枪，两根并排枪管朝上，重型构造。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("magnum", "马格南",
     "枪管严格指向正上方，笔直朝上，握把朝下。单件孤立武器，居中构图，画面中只有这一把马格南手枪，无其他物体。"
     "未来马格南手枪，大口径枪管朝上，强力构造，大型握把。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("minigun", "迷你机枪",
     "多根枪管严格指向正上方，笔直朝上，握把朝下。单件孤立武器，居中构图，画面中只有这一把迷你机枪，无其他物体。"
     "未来迷你机枪，多管旋转枪管朝上，紧凑型构造。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),

    # ==============================
    # 弓箭 (bow) × 10
    # ==============================
    ("bow", "长弓",
     "弓臂上端严格指向正上方，笔直朝上，弓臂下端朝下。单件孤立武器，居中构图，画面中只有这一把弓，无其他物体。"
     "未来长弓，弓臂朝上弯曲，弓弦绷紧，科技感设计。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("crossbow", "弩",
     "箭矢尖端严格指向正上方，笔直朝上，弩托朝下。单件孤立武器，居中构图，画面中只有这一把弩，无其他物体。"
     "未来十字弩，弩臂水平展开，箭矢朝上，机械构造。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("longbow", "强弓",
     "弓臂上端严格指向正上方，笔直朝上，弓臂下端朝下。单件孤立武器，居中构图，画面中只有这一把弓，无其他物体。"
     "强化长弓，厚重弓臂朝上，能量弓弦发光，科技感设计。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("recurve", "反曲弓",
     "弓臂上端严格指向正上方，笔直朝上，弓臂下端朝下。单件孤立武器，居中构图，画面中只有这一把弓，无其他物体。"
     "反曲弓，弓臂两端向外弯曲朝上，紧凑设计。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("explosive_arrow", "爆裂箭",
     "箭尖严格指向正上方，笔直朝上，箭羽朝下。单件孤立武器，居中构图，画面中只有这一支箭，无其他物体。"
     "爆炸箭矢，箭头带有爆炸弹头，红色标记，箭杆笔直朝上。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("frost_arrow", "冰霜箭",
     "箭尖严格指向正上方，笔直朝上，箭羽朝下。单件孤立武器，居中构图，画面中只有这一支箭，无其他物体。"
     "冰霜箭矢，冰蓝色能量箭头，冰晶装饰，箭杆朝上。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("poison_arrow", "毒箭",
     "箭尖严格指向正上方，笔直朝上，箭羽朝下。单件孤立武器，居中构图，画面中只有这一支箭，无其他物体。"
     "剧毒箭矢，绿色毒液箭头，腐蚀效果，箭杆笔直朝上。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("triple_shot", "三连弓",
     "弓臂上端严格指向正上方，笔直朝上。单件孤立武器，居中构图，画面中只有这一把弓，无其他物体。"
     "三连发弓，弓臂带三个箭槽，可同时发射三箭。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("piercing_shot", "穿甲箭",
     "箭尖严格指向正上方，笔直朝上，箭羽朝下。单件孤立武器，居中构图，画面中只有这一支箭，无其他物体。"
     "穿甲箭矢，箭头尖锐金属，螺旋纹路，红色能量，笔直朝上。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("homing_bow", "追踪弓",
     "弓臂上端严格指向正上方，笔直朝上，弓臂下端朝下。单件孤立武器，居中构图，画面中只有这一把弓，无其他物体。"
     "追踪弓，弓臂带有追踪瞄准器，能量瞄准光效。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),

    # ==============================
    # 元素 (magic) × 13
    # ==============================
    ("fire_staff", "火球杖",
     "法杖上端严格指向正上方，笔直朝上，杖尾朝下。单件孤立武器，居中构图，画面中只有这一根法杖，无其他物体。"
     "火焰法杖，杖顶燃烧火焰球，金属杖身。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("frost_staff", "冰霜杖",
     "法杖上端严格指向正上方，笔直朝上，杖尾朝下。单件孤立武器，居中构图，画面中只有这一根法杖，无其他物体。"
     "冰霜法杖，杖顶冰晶凝结，冰蓝色宝石，冰冻能量。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("thunder_staff", "雷电杖",
     "法杖上端严格指向正上方，笔直朝上，杖尾朝下。单件孤立武器，居中构图，画面中只有这一根法杖，无其他物体。"
     "雷电法杖，杖顶闪电环绕，黄色能量光球。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("energy_staff", "能量杖",
     "法杖上端严格指向正上方，笔直朝上，杖尾朝下。单件孤立武器，居中构图，画面中只有这一根法杖，无其他物体。"
     "能量法杖，蓝色能量核心，杖身发光纹路，科技感。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("magic_orb", "魔法弹",
     "单件孤立物品，居中构图，画面中只有这一个宝珠，无其他物体。"
     "魔法宝珠，球体内流动能量，漂浮光环环绕。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("poison_staff", "毒杖",
     "法杖上端严格指向正上方，笔直朝上，杖尾朝下。单件孤立武器，居中构图，画面中只有这一根法杖，无其他物体。"
     "剧毒法杖，绿色毒雾环绕杖顶，腐蚀纹路。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("void_staff", "虚空杖",
     "法杖上端严格指向正上方，笔直朝上，杖尾朝下。单件孤立武器，居中构图，画面中只有这一根法杖，无其他物体。"
     "虚空法杖，暗紫色虚空能量，黑洞效果在杖顶。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("lightning_staff", "闪电杖",
     "法杖上端严格指向正上方，笔直朝上，杖尾朝下。单件孤立武器，居中构图，画面中只有这一根法杖，无其他物体。"
     "闪电法杖，白色电光闪烁，杖顶叉形闪电。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("fire_wand", "火焰魔棒",
     "魔棒尖端严格指向正上方，笔直朝上，握柄朝下。单件孤立武器，居中构图，画面中只有这一根魔棒，无其他物体。"
     "火焰魔棒，短小精致，尖端燃烧火焰。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("arcane_orb", "奥术球",
     "单件孤立物品，居中构图，画面中只有这一个宝珠，无其他物体。"
     "奥术宝珠，紫粉色能量球体，魔法符文环绕。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("flame_spray", "火焰喷射器",
     "喷管严格指向正上方，笔直朝上，燃料罐在下方。单件孤立武器，居中构图，画面中只有这一个喷射器，无其他物体。"
     "火焰喷射器，燃料罐和喷管朝上，喷射口火焰效果。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("poison_spray", "毒雾喷射器",
     "喷管严格指向正上方，笔直朝上，燃料罐在下方。单件孤立武器，居中构图，画面中只有这一个喷射器，无其他物体。"
     "毒雾喷射器，绿色燃料罐，喷管朝上，毒雾效果。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("cold_spray", "冷气喷射器",
     "喷管严格指向正上方，笔直朝上，燃料罐在下方。单件孤立武器，居中构图，画面中只有这一个喷射器，无其他物体。"
     "冷气喷射器，冰蓝色燃料罐，喷管朝上，冰冻雾气。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),

    # ==============================
    # 医疗 (medic) × 5
    # ==============================
    ("heal_gun", "治愈枪",
     "发射口严格指向正上方，笔直朝上，握把朝下。单件孤立武器，居中构图，画面中只有这一把治疗枪，无其他物体。"
     "治疗手枪，白色医疗风格，绿色十字标志，发射口朝上。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("shield", "圣光盾",
     "盾牌正面朝上，盾面朝上。单件孤立武器，居中构图，画面中只有这一面盾牌，无其他物体。"
     "圣光盾牌，金色盾面发光，神圣符文。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("holy_staff", "圣光杖",
     "法杖上端严格指向正上方，笔直朝上，杖尾朝下。单件孤立武器，居中构图，画面中只有这一根法杖，无其他物体。"
     "圣光法杖，金色杖身，天使羽翼装饰，神圣光芒。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("life_wand", "生命魔棒",
     "魔棒尖端严格指向正上方，笔直朝上，握柄朝下。单件孤立武器，居中构图，画面中只有这一根魔棒，无其他物体。"
     "生命魔棒，翠绿色能量，叶片装饰，治愈光芒。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("blessing", "祝福盾",
     "盾牌正面朝上，盾面朝上。单件孤立武器，居中构图，画面中只有这一面盾牌，无其他物体。"
     "祝福盾牌，银色盾面，蓝色发光的祝福符文。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),

    # ==============================
    # 骑枪 (lance) × 3
    # ==============================
    ("pike", "长枪",
     "枪尖严格指向正上方，笔直朝上，枪尾朝下。单件孤立武器，居中构图，画面中只有这一把长枪，无其他物体。"
     "未来长枪，超长枪身笔直朝上，锐利枪尖，金属构造。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("cavalry_lance", "骑枪",
     "枪尖严格指向正上方，笔直朝上，枪尾朝下。单件孤立武器，居中构图，画面中只有这一把骑枪，无其他物体。"
     "重型骑枪，粗大枪身朝上，宽刃枪尖，能量光效。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
    ("trident", "三叉戟",
     "三个戟尖严格指向正上方，笔直朝上，握柄朝下。单件孤立武器，居中构图，画面中只有这一把三叉戟，无其他物体。"
     "三叉戟，三个锋利戟尖朝上，长握柄，银色金属。"
     "俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
]

# ====== 种子分配 ======
# 重新生成使用新种子段: 100000+
SEED_BASE = 100000


def submit_prompt(prompt_data):
    """提交提示到 ComfyUI API"""
    data = json.dumps({"prompt": prompt_data}).encode("utf-8")
    req = urllib.request.Request(
        f"{COMFYUI_URL}/prompt",
        data=data,
        headers={"Content-Type": "application/json"}
    )
    try:
        resp = urllib.request.urlopen(req, timeout=60)
        result = json.loads(resp.read())
        return result.get("prompt_id")
    except Exception as e:
        print(f"  FAILED: {e}")
        return None


def wait_for_completion(prompt_id, timeout=120):
    """等待 ComfyUI 生成完成"""
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = urllib.request.Request(f"{COMFYUI_URL}/history/{prompt_id}")
            resp = urllib.request.urlopen(req, timeout=5)
            data = json.loads(resp.read())
            if prompt_id in data:
                return data[prompt_id].get("outputs", {})
        except urllib.error.HTTPError:
            pass
        except urllib.error.URLError:
            pass
        time.sleep(1)
    return None


def make_icon_prompt(positive_text, seed, prefix):
    """
    构建 Z-Image-Turbo 工作流提示，生成 1024x1024 武器图标
    使用 doc 中定义的 z_image_turbo 子蓝图展开节点
    """
    return {
        "1": {
            "class_type": "CLIPLoader",
            "inputs": {
                "clip_name": "qwen_3_4b.safetensors",
                "type": "lumina2",
                "device": "default"
            }
        },
        "2": {
            "class_type": "VAELoader",
            "inputs": {
                "vae_name": "ae.safetensors"
            }
        },
        "3": {
            "class_type": "UNETLoader",
            "inputs": {
                "unet_name": "z_image_turbo_bf16.safetensors",
                "weight_dtype": "default"
            }
        },
        "model_sampling": {
            "class_type": "ModelSamplingAuraFlow",
            "inputs": {
                "model": ["3", 0],
                "shift": 3.0
            }
        },
        "pos_encode": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": positive_text,
                "clip": ["1", 0]
            }
        },
        "neg_encode": {
            "class_type": "ConditioningZeroOut",
            "inputs": {
                "conditioning": ["pos_encode", 0]
            }
        },
        "empty_latent": {
            "class_type": "EmptySD3LatentImage",
            "inputs": {
                "width": 1024,
                "height": 1024,
                "batch_size": 1
            }
        },
        "ksampler": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": 4,
                "cfg": 1.0,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1.0,
                "model": ["model_sampling", 0],
                "positive": ["pos_encode", 0],
                "negative": ["neg_encode", 0],
                "latent_image": ["empty_latent", 0]
            }
        },
        "vae_decode": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["ksampler", 0],
                "vae": ["2", 0]
            }
        },
        "save_image": {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": prefix,
                "images": ["vae_decode", 0]
            }
        }
    }


def generate_weapons():
    """生成所有武器图标"""
    count = len(WEAPON_PROMPTS)
    print(f"\n{'='*55}")
    print(f"  CYBER BLADE - 武器图标朝上生成器 v2")
    print(f"  模型: z_image_turbo_bf16 | 1024x1024 | steps=4 | CFG=1.0")
    print(f"  提示词: 强化方向约束 + 单武器隔离")
    print(f"  共 {count} 个武器")
    print(f"{'='*55}")

    generated = []

    for i, (w_id, w_name, w_prompt) in enumerate(WEAPON_PROMPTS):
        prefix = f"cb_weapon_{w_id}"
        seed = SEED_BASE + i

        full_prompt = f"{w_prompt}"

        print(f"\n  [{i+1}/{count}] {w_name:<12} ({w_id})", end="", flush=True)
        print(f"  seed={seed}")

        prompt = make_icon_prompt(full_prompt, seed, prefix)
        prompt_id = submit_prompt(prompt)

        if not prompt_id:
            print(f"  ✗ 提交失败")
            continue

        print(f"     prompt_id={prompt_id}", end="", flush=True)

        outputs = wait_for_completion(prompt_id)
        if outputs:
            print("  ✓ 生成成功")
            generated.append((w_id, prefix, full_prompt))
        else:
            print("  ✗ 超时/失败")

    return generated


def chroma_key_to_transparent(pil_img, target_color=(0, 255, 0), threshold=60):
    """
    将纯绿色背景 (#00FF00) 抠除为透明通道
    使用平方距离避免 sqrt() 计算，大幅提升性能。
    target_color: 目标绿色 RGB
    threshold: 颜色容差（0~255），越大保留越多的边缘半透明过渡
    """
    img = pil_img.convert("RGBA")
    pixels = img.load()
    w, h = img.size
    rt, gt, bt = target_color
    thresh_sq = threshold * threshold        # 完全透明的阈值（平方）
    thresh2_sq = (threshold * 2) ** 2         # 过渡区上限（平方）

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue  # 已透明
            # 平方距离（避免 sqrt 开销）
            dr = r - rt
            dg = g - gt
            db = b - bt
            dist_sq = dr * dr + dg * dg + db * db
            if dist_sq < thresh_sq:
                # 完全透明
                pixels[x, y] = (r, g, b, 0)
            elif dist_sq < thresh2_sq:
                # 边缘渐变过渡（仅过渡区才计算 sqrt）
                dist = dist_sq ** 0.5
                alpha_factor = (dist - threshold) / threshold
                new_alpha = int(a * min(1.0, alpha_factor))
                pixels[x, y] = (r, g, b, new_alpha)

    return img


def save_prompt_txt(w_id, prefix, prompt_text, dst_dir):
    """保存武器的描述提示词到同名 .txt 文件"""
    txt_name = f"{prefix}_00001_.txt"
    txt_path = os.path.join(dst_dir, txt_name)
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(prompt_text)
    print(f"  [TX] {w_id:<12} -> {txt_name}")


def copy_to_assets(generated):
    """将生成的图标复制到 assets/weapons/，清理绿色背景为透明，并保存对应 .txt 描述文件"""
    print(f"\n{'='*55}")
    print(f"  复制到 assets/weapons/ + 绿色抠图 + .txt 描述文件")
    print(f"{'='*55}")

    os.makedirs(ASSETS_WEAPONS_DIR, exist_ok=True)

    copied = 0
    for w_id, prefix, full_prompt in generated:
        # 查找输出目录中匹配的文件
        output_files = [f for f in os.listdir(OUTPUT_DIR)
                        if f.startswith(f"{prefix}_") and f.endswith(".png")]

        if not output_files:
            print(f"  [--] {w_id}: 未找到输出文件")
            continue

        # 取最新生成的文件
        output_files.sort(key=lambda x: os.path.getmtime(
            os.path.join(OUTPUT_DIR, x)
        ), reverse=True)
        src = os.path.join(OUTPUT_DIR, output_files[0])

        # 目标文件名: cb_weapon_{id}_00001_.png
        dst_name = f"{prefix}_00001_.png"
        dst = os.path.join(ASSETS_WEAPONS_DIR, dst_name)

        # 1. 使用 PIL 抠除绿色背景（如果可用）
        if HAS_PIL:
            try:
                pil_img = Image.open(src).convert("RGBA")
                transparent_img = chroma_key_to_transparent(pil_img)
                transparent_img.save(dst, "PNG")
                print(f"  [OK] {w_id:<12} -> {dst_name} (透明背景)")
            except Exception as e:
                print(f"  [!!] {w_id}: PIL 处理失败 ({e})，回退到直接复制")
                shutil.copy2(src, dst)
                print(f"  [OK] {w_id:<12} -> {dst_name} (直接复制)")
        else:
            shutil.copy2(src, dst)
            print(f"  [OK] {w_id:<12} -> {dst_name} (直接复制，非透明)")

        # 2. 保存同名 .txt 描述文件
        save_prompt_txt(w_id, prefix, full_prompt, ASSETS_WEAPONS_DIR)

        copied += 1

    return copied


def main():
    print("=" * 55)
    print("  CYBER BLADE - 武器图标批量生成 v2")
    print("  强化提示词：方向严格朝上 + 单武器孤立")
    print("=" * 55)

    # 测试 ComfyUI 连接
    try:
        req = urllib.request.Request(f"{COMFYUI_URL}/prompt", method="GET")
        urllib.request.urlopen(req, timeout=5)
        print("  [OK] ComfyUI 连接成功")
    except Exception as e:
        print(f"  [ERR] ComfyUI 连接失败: {e}")
        print("  请先启动 ComfyUI，再运行此脚本")
        sys.exit(1)

    # 生成所有武器图标
    generated = generate_weapons()

    if not generated:
        print("\n  [ERR] 没有成功生成任何图标")
        sys.exit(1)

    # 复制到 assets（透明抠图 + 保存 .txt）
    copied = copy_to_assets(generated)

    print(f"\n{'='*55}")
    print(f"  完成！成功生成 {len(generated)} 个武器图标")
    print(f"  已复制 {copied} 个到 assets/weapons/")
    print(f"{'='*55}")

    print(f"\n  v3 改进：")
    print(f"    • 纯绿色背景 #00FF00 → PIL 抠图 → 透明 RGBA PNG")
    print(f"    • 每个武器附带同名 .txt 描述文件")
    print(f"    • 提示词强化方向约束 + 单武器隔离")


if __name__ == "__main__":
    main()
