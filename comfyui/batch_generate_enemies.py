#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CYBER BLADE - Enemy Static Icon Generator (256px)
==================================================
为所有 10 种敌人生成静态图标（256x256），纯绿色背景 → 透明 RGBA PNG。

用法:
  1. 确保 ComfyUI 已启动（http://127.0.0.1:8188）
  2. python comfyui/batch_generate_enemies.py
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
ASSETS_ENEMIES_DIR = "H:/ai_works/buffPrj1/assets/enemies"

# ====== 敌人定义（10种）= ======
# (id, 名称, 方向约束 + 外观描述 + 标准后缀)
ENEMY_PROMPTS = [
    ("basic", "无人机兵",
     "敌人图标，画面中只有这一只敌人，居中构图，无其他物体，无多余元素。"
     "小型飞行无人机，深灰色金属机身，红色LED眼睛，四个小旋翼在顶部，底部探照灯。"
     "正方向朝上，俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),

    ("fast", "疾行者",
     "敌人图标，画面中只有这一只敌人，居中构图，无其他物体，无多余元素。"
     "流线型四足高速机器人，橙色黑色机身，形似机械猎豹，长轮距，"
     "四条细长有力的腿带爪状脚，单一黄色光学扫描仪在流线型头部。"
     "正方向朝上，俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),

    ("exploder", "自爆者",
     "敌人图标，画面中只有这一只敌人，居中构图，无其他物体，无多余元素。"
     "橘红色自爆机器人，圆胖的炸弹状身体，闪烁红色警示灯，"
     "身上布满裂纹状能量纹路，短小机械腿，身体中心可见橙色高能核心。"
     "正方向朝上，俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),

    ("tank", "重装机兵",
     "敌人图标，画面中只有这一只敌人，居中构图，无其他物体，无多余元素。"
     "紫色重型装甲机甲，厚重加固装甲板，短而宽的矮胖坦克状身体，"
     "两条巨大的履带式脚，肩扛式加农炮，单一红色观察缝，背部排气口。"
     "正方向朝上，俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),

    ("healer", "修复者",
     "敌人图标，画面中只有这一只敌人，居中构图，无其他物体，无多余元素。"
     "翠绿色治疗机器人，圆润的白色和绿色机身，绿色十字标志在胸前，"
     "两只机械臂托着绿色能量球，背部有医疗物资舱。"
     "正方向朝上，俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),

    ("ranged", "狙击手",
     "敌人图标，画面中只有这一只敌人，居中构图，无其他物体，无多余元素。"
     "粉色双足狙击机器人，一只超大的光学瞄准眼，"
     "长管狙击步枪集成在右臂，细长昆虫状腿，背部雷达碟形天线。"
     "正方向朝上，俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),

    ("mortar", "迫击者",
     "敌人图标，画面中只有这一只敌人，居中构图，无其他物体，无多余元素。"
     "紫色重型远程炮击机器人，方形重型底盘，四个短粗支撑腿，"
     "背部巨大的迫击炮管朝上倾斜，炮管带有能量线圈，传感器阵列在顶部。"
     "正方向朝上，俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),

    ("blinker", "闪现者",
     "敌人图标，画面中只有这一只敌人，居中构图，无其他物体，无多余元素。"
     "品红色高机动暗杀机器人，纤细敏捷的流线型身体，"
     "两把能量匕首作为手臂，半透明闪烁能量装甲，独眼紫色光学传感器。"
     "正方向朝上，俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),

    ("elite", "精英猎手",
     "敌人图标，画面中只有这一只敌人，居中构图，无其他物体，无多余元素。"
     "金色精英猎人机器，类人上半身连接四根蜘蛛腿，"
     "头部两个弯曲角，金色能量光环闪烁，双臂为双能量刃，"
     "胸口有发光的金色核心。"
     "正方向朝上，俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),

    ("boss", "BOSS·毁灭者",
     "敌人图标，画面中只有这一只敌人，居中构图，无其他物体，无多余元素。"
     "巨大深红色Boss怪物——类人恶魔形态，两个大弯曲角，"
     "燃烧的红色眼睛，獠牙大口，肌肉发达身体深红色皮肤，"
     "肩部黑色装甲板，右手持巨大能量斧，左手红色闪电缠绕。"
     "正方向朝上，俯视图，纯绿色背景 #00FF00，游戏图标，PBR渲染，游戏资产"),
]

# ====== 种子分配 ======
SEED_BASE = 200000


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
    构建 Z-Image-Turbo 工作流提示，生成 256x256 敌人图标
    使用 z_image_turbo 子蓝图展开节点
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
                "width": 256,
                "height": 256,
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


def chroma_key_to_transparent(pil_img, target_color=(0, 255, 0), threshold=60):
    """
    将纯绿色背景 (#00FF00) 抠除为透明通道
    使用平方距离避免 sqrt() 计算，大幅提升性能。
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


def generate_enemies():
    """生成所有敌人图标"""
    count = len(ENEMY_PROMPTS)
    print(f"\n{'='*55}")
    print(f"  CYBER BLADE - 敌人图标生成器")
    print(f"  模型: z_image_turbo_bf16 | 256x256 | steps=4 | CFG=1.0")
    print(f"  共 {count} 个敌人")
    print(f"{'='*55}")

    generated = []

    for i, (e_id, e_name, e_prompt) in enumerate(ENEMY_PROMPTS):
        prefix = f"cb_enemy_{e_id}"
        seed = SEED_BASE + i

        full_prompt = f"{e_prompt}"

        print(f"\n  [{i+1}/{count}] {e_name:<12} ({e_id})", end="", flush=True)
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
            generated.append((e_id, prefix, full_prompt))
        else:
            print("  ✗ 超时/失败")

    return generated


def save_prompt_txt(e_id, prefix, prompt_text, dst_dir):
    """保存敌人的描述提示词到同名 .txt 文件"""
    txt_name = f"{prefix}_00001_.txt"
    txt_path = os.path.join(dst_dir, txt_name)
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(prompt_text)
    print(f"  [TX] {e_id:<12} -> {txt_name}")


def copy_to_assets(generated):
    """将生成的图标复制到 assets/enemies/，清理绿色背景为透明，并保存对应 .txt 描述文件"""
    print(f"\n{'='*55}")
    print(f"  复制到 assets/enemies/ + 绿色抠图 + .txt 描述文件")
    print(f"{'='*55}")

    os.makedirs(ASSETS_ENEMIES_DIR, exist_ok=True)

    copied = 0
    for e_id, prefix, full_prompt in generated:
        # 查找输出目录中匹配的文件
        output_files = [f for f in os.listdir(OUTPUT_DIR)
                        if f.startswith(f"{prefix}_") and f.endswith(".png")]

        if not output_files:
            print(f"  [--] {e_id}: 未找到输出文件")
            continue

        # 取最新生成的文件
        output_files.sort(key=lambda x: os.path.getmtime(
            os.path.join(OUTPUT_DIR, x)
        ), reverse=True)
        src = os.path.join(OUTPUT_DIR, output_files[0])

        # 目标文件名: cb_enemy_{id}_00001_.png
        dst_name = f"{prefix}_00001_.png"
        dst = os.path.join(ASSETS_ENEMIES_DIR, dst_name)

        # 使用 PIL 抠除绿色背景（如果可用）
        if HAS_PIL:
            try:
                pil_img = Image.open(src).convert("RGBA")
                transparent_img = chroma_key_to_transparent(pil_img)
                transparent_img.save(dst, "PNG")
                print(f"  [OK] {e_id:<12} -> {dst_name} (透明背景)")
            except Exception as e:
                print(f"  [!!] {e_id}: PIL 处理失败 ({e})，回退到直接复制")
                shutil.copy2(src, dst)
                print(f"  [OK] {e_id:<12} -> {dst_name} (直接复制)")
        else:
            shutil.copy2(src, dst)
            print(f"  [OK] {e_id:<12} -> {dst_name} (直接复制，非透明)")

        # 保存同名 .txt 描述文件
        save_prompt_txt(e_id, prefix, full_prompt, ASSETS_ENEMIES_DIR)

        copied += 1

    return copied


def main():
    print("=" * 55)
    print("  CYBER BLADE - 敌人图标批量生成")
    print("  10种敌人 | 256x256 | 绿色背景→透明RGBA")
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

    # 生成所有敌人图标
    generated = generate_enemies()

    if not generated:
        print("\n  [ERR] 没有成功生成任何图标")
        sys.exit(1)

    # 复制到 assets（透明抠图 + 保存 .txt）
    copied = copy_to_assets(generated)

    print(f"\n{'='*55}")
    print(f"  完成！成功生成 {len(generated)} 个敌人图标")
    print(f"  已复制 {copied} 个到 assets/enemies/")
    print(f"{'='*55}")

    print(f"\n  ✅ 每个敌人附带同名 .txt 描述文件")
    print(f"  ✅ 纯绿色背景 → 透明 RGBA PNG")
    print(f"  ✅ 256x256 分辨率")


if __name__ == "__main__":
    main()
