"""
===============================================================================
PNG 图片缩放工具
用法:
    python scripts/resize_assets.py [目录] [--max-size 128]

功能:
    - 递归扫描指定目录下所有 .png 文件
    - 如果图片宽或高 > max_size，按宽高比缩放到最长边 = max_size
    - 小于等于 max_size 的图片保持不变
    - 默认目录 = assets/（相对于项目根目录）
    - 默认 max_size = 128

示例:
    python scripts/resize_assets.py
    python scripts/resize_assets.py assets/chars
    python scripts/resize_assets.py assets/sprites -m 64

依赖: pip install Pillow
===============================================================================
"""
import argparse
import os
import sys
from pathlib import Path

# Fix Unicode print on Windows console (GBK)
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = open(sys.stdout.fileno(), mode="w", encoding="utf-8", buffering=1, closefd=False)

try:
    from PIL import Image
except ImportError:
    print("错误: 需要 Pillow 库，请运行: pip install Pillow")
    sys.exit(1)

# 项目根目录（脚本所在目录的上一级）
PROJECT_ROOT = Path(__file__).resolve().parent.parent


def resize_png(filepath: Path, max_size: int) -> bool:
    """缩放单张 PNG，如果尺寸超过 max_size 则按宽高比缩小。
    返回 True 表示已修改，False 表示无需修改。
    """
    try:
        img = Image.open(filepath)
    except Exception as e:
        print(f"  ⚠ 打开失败: {filepath.name} — {e}")
        return False

    w, h = img.size

    # 小于等于阈值 → 跳过
    if w <= max_size and h <= max_size:
        return False

    # 计算缩放比例（最长边 = max_size）
    scale = max_size / max(w, h)
    new_w = round(w * scale)
    new_h = round(h * scale)

    try:
        resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        resized.save(filepath, optimize=True)
        print(f"  ✓ {filepath.name}: {w}×{h} → {new_w}×{new_h}")
        return True
    except Exception as e:
        print(f"  ✗ 缩放失败: {filepath.name} — {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="缩放目录下的 PNG 图片，最长边不超过指定像素"
    )
    parser.add_argument(
        "directory",
        nargs="?",
        default="assets",
        help="要扫描的目录（相对于项目根目录，默认 assets）"
    )
    parser.add_argument(
        "--max-size", "-m",
        type=int,
        default=128,
        help="最长边阈值（默认 128），超过此值则等比缩小"
    )
    parser.add_argument(
        "--dry-run", "-n",
        action="store_true",
        help="仅预览，不实际写入"
    )
    args = parser.parse_args()

    max_size = args.max_size
    dry_run = args.dry_run
    target_dir = (PROJECT_ROOT / args.directory).resolve()

    if not target_dir.is_dir():
        print(f"错误: 目录不存在: {target_dir}")
        sys.exit(1)

    print(f"{'='*60}")
    print(f"  资源图片缩放工具")
    print(f"  目录: {target_dir}")
    print(f"  最长边上限: {max_size}px")
    if dry_run:
        print(f"  模式: 预览 (不写入)")
    print(f"{'='*60}")

    png_files = sorted(target_dir.rglob("*.png"))
    if not png_files:
        print("未找到任何 .png 文件")
        return

    modified = 0
    skipped = 0
    failed = 0

    for fp in png_files:
        rel_path = fp.relative_to(PROJECT_ROOT)
        try:
            img = Image.open(fp)
            w, h = img.size
            img.close()
        except Exception as e:
            print(f"  ⚠ 读取失败: {rel_path} — {e}")
            failed += 1
            continue

        if w <= max_size and h <= max_size:
            skipped += 1
            continue

        if dry_run:
            scale = max_size / max(w, h)
            new_w = round(w * scale)
            new_h = round(h * scale)
            print(f"  ○ {rel_path}: {w}×{h} → {new_w}×{new_h}")
            modified += 1
        else:
            if resize_png(fp, max_size):
                modified += 1
            else:
                failed += 1

    print(f"\n{'='*60}")
    print(f"  完成: 已修改 {modified} 个, 跳过 {skipped} 个, 失败 {failed} 个")
    if not dry_run:
        print(f"  提示: 按 Ctrl+F5 刷新浏览器即可看到新尺寸")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
