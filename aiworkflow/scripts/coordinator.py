#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI Workflow Coordinator - Pro & Flash 自动化协调脚本
监控 aiworkflow/plan/ 目录，自动检测状态变化并写入下一步指令到文件
"""

import os
import time
import json
import hashlib
from pathlib import Path
from datetime import datetime
import sys

# 配置
SCRIPT_DIR = Path(__file__).parent
WORKFLOW_DIR = SCRIPT_DIR.parent / "plan"
STATE_FILE = SCRIPT_DIR / "coordinator_state.json"

# 所有生成的文件都写在监控器所在目录
LATEST_ACTION_FILE = SCRIPT_DIR / "latest_action.txt"
HISTORY_FILE = SCRIPT_DIR / "action_history.log"

# Windows 颜色支持
try:
    from colorama import init, Fore, Style
    init()
except ImportError:
    class Fore:
        CYAN = YELLOW = GREEN = BLUE = MAGENTA = WHITE = RED = ''
    class Style:
        RESET_ALL = ''


class WorkflowCoordinator:
    """工作流协调器"""

    def __init__(self):
        self.state = self.load_state()
        self.initialized = False  # 首次扫描标志

    def load_state(self):
        """加载上次的状态"""
        if STATE_FILE.exists():
            try:
                with open(STATE_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                pass
        return {"files": {}, "filenames": [], "last_notification": {}}

    def save_state(self):
        """保存当前状态"""
        with open(STATE_FILE, 'w', encoding='utf-8') as f:
            json.dump(self.state, f, ensure_ascii=False, indent=2)

    def log(self, message):
        """写入历史日志"""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with open(HISTORY_FILE, 'a', encoding='utf-8') as f:
            f.write(f"[{timestamp}] {message}\n")

    def write_latest_action(self, target, instruction):
        """写入最新指令到文件（覆盖模式），同时追加到历史"""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # 格式：时间戳, 对象, 指令内容
        line = f"{timestamp}, {target}, {instruction}\n"
        
        # 写入最新指令文件（覆盖）
        with open(LATEST_ACTION_FILE, 'w', encoding='utf-8') as f:
            f.write(line)
        
        # 追加到历史文件
        with open(HISTORY_FILE, 'a', encoding='utf-8') as f:
            f.write(f"{timestamp}, {target}, {instruction}\n")
        
        return line.strip()

    def get_file_hash(self, filepath):
        """计算文件哈希"""
        try:
            with open(filepath, 'rb') as f:
                return hashlib.md5(f.read()).hexdigest()
        except:
            return None

    def print_header(self, text):
        """打印标题"""
        print(f"\n{Fore.CYAN}{'='*60}{Style.RESET_ALL}")
        print(f"{Fore.CYAN}{text}{Style.RESET_ALL}")
        print(f"{Fore.CYAN}{'='*60}{Style.RESET_ALL}\n")

    def print_action(self, action, target="", instruction=""):
        """打印行动指令并写入文件"""
        print(f"{Fore.YELLOW}⚡ 行动指令:{Style.RESET_ALL}")
        print(f"{Fore.GREEN}   {action}{Style.RESET_ALL}")
        if target:
            print(f"{Fore.WHITE}   目标: {target}{Style.RESET_ALL}")
        
        # 写入文件
        if target and instruction:
            written_line = self.write_latest_action(target, instruction)
            print(f"{Fore.BLUE}   ✅ 指令已写入:{Style.RESET_ALL}")
            print(f"{Fore.WHITE}     最新: {LATEST_ACTION_FILE}{Style.RESET_ALL}")
            print(f"{Fore.WHITE}     历史: {HISTORY_FILE}{Style.RESET_ALL}")
            self.log(f"写入指令: {target} <- {instruction[:50]}...")
        
        print()

    def print_preview(self, content, max_lines=5):
        """显示内容预览"""
        lines = content.split('\n')
        print(f"{Fore.BLUE}   预览 (前{max_lines}行):{Style.RESET_ALL}")
        for i, line in enumerate(lines[:max_lines]):
            if line.strip():
                truncated = line[:80] + '...' if len(line) > 80 else line
                print(f"{Fore.WHITE}   > {truncated}{Style.RESET_ALL}")
        if len(lines) > max_lines:
            print(f"{Fore.WHITE}   ... (共 {len(lines)} 行){Style.RESET_ALL}")
        print()

    def generate_instruction(self, filepath, action_type):
        """根据文件类型生成指令内容"""
        filename = filepath.name
        rel_path = str(filepath.relative_to(WORKFLOW_DIR))

        instructions = {
            "flash_read_plan": f"请阅读 plan/{rel_path}，理解计划内容。如果有任何疑问，请写在 plan/{rel_path.replace('.plan.md', '.plan.q.md')} 文件中。",

            "pro_answer_question": f"Flash 对计划提出了疑问，请阅读 plan/{rel_path} 并逐条回答。回答后请将对应的疑问标记为 [已回复]。",

            "flash_implement": f"计划已确认，请开始实现代码。参考 plan/{rel_path.replace('.plan.q.done.md', '.plan.md')} 中的设计。实现完成后请写测试并生成 plan-review.md。",

            "pro_review": f"Flash 已完成实现，请审核代码并查看 plan/{rel_path}。如果发现问题，请写在 plan/{rel_path.replace('plan-review.md', 'plan-done.q.md')} 中。",

            "flash_fix": f"Pro 提出了审核问题，请阅读 plan/{rel_path} 并修复代码。修复后请在该文件中标记为 [已解决]。",

            "flash_run_test": f"请按照 plan/TEST_PLAN.md 中的测试用例，执行测试并报告结果。",
        }

        return instructions.get(action_type, f"请处理 plan/{rel_path}")

    def check_unresolved(self, content):
        """检查是否还有未解决的问题"""
        lines = content.split('\n')
        for line in lines:
            # 检查列表项是否没有标记已解决
            if line.strip().startswith(('- ', '* ', '1. ', '2. ', '3. ', '4. ', '5. ')):
                if '**[已回复]**' not in line and '**[已明确]**' not in line and '**[已解决]**' not in line:
                    return True
        return False

    def analyze_file(self, filepath):
        """分析文件内容，给出行动建议"""
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            return False

        filename = filepath.name
        rel_path = str(filepath.relative_to(WORKFLOW_DIR))

        # 判断文件类型和下一步行动
        if filename.endswith('.plan.q.md'):
            # Flash 提问文件
            has_unresolved = self.check_unresolved(content)
            if has_unresolved:
                self.print_header(f"📝 Flash 已提问: {filename}")
                instruction = self.generate_instruction(filepath, "pro_answer_question")
                self.print_action(
                    f"请让 **Pro** 读取并回答这个问题",
                    target="Pro",
                    instruction=instruction
                )
                self.print_preview(content)
                return True
            else:
                self.print_header(f"✅ Flash 的提问已全部解决: {filename}")
                self.print_action(
                    f"✅ 已全部解决，继续实现",
                    target="Flash",
                    instruction=f"计划继续，{filename} 已明确"
                )
                return False

        elif filename.endswith('.plan.q.done.md'):
            self.print_header(f"✅ 计划阶段完成: {filename.replace('.done', '')}")
            self.print_action(
                f"✅ 进入实现阶段",
                target="Flash",
                instruction=f"计划完成，可以实现"
            )
            return True

        elif filename == 'TEST_PLAN.md':
            self.print_header(f"🧪 Pro 已产出测试计划: {filename}")
            instruction = self.generate_instruction(filepath, "flash_run_test")
            self.print_action(
                f"请让 **Flash** 根据 TEST_PLAN.md 实现测试代码",
                target="Flash",
                instruction=instruction
            )
            self.print_preview(content, 10)
            return True

        elif filename.endswith('plan-review.md'):
            self.print_header(f"🔍 Flash 实现完成: {filename}")
            instruction = self.generate_instruction(filepath, "pro_review")
            self.print_action(
                f"请让 **Pro** 审核实现代码",
                target="Pro",
                instruction=instruction
            )
            return True

        elif filename.endswith('.plan-done.q.md'):
            # Pro 审核问题
            has_unresolved = self.check_unresolved(content)
            if has_unresolved:
                self.print_header(f"❌ Pro 提出审核问题: {filename}")
                instruction = self.generate_instruction(filepath, "flash_fix")
                self.print_action(
                    f"请让 **Flash** 修复这些问题",
                    target="Flash",
                    instruction=instruction
                )
                self.print_preview(content)
                return True
            else:
                self.print_header(f"✅ Pro 的审核问题已全部解决: {filename}")
                self.print_action(
                    f"✅ 审核问题已修复",
                    target="Flash",
                    instruction=f"审核通过，继续下一模块"
                )
                return False

        elif filename.endswith('.plan-done.q.done.md'):
            self.print_header(f"🎉 模块审核通过: {filename.replace('.done', '')}")
            self.print_action(
                f"🎉 模块完成，进入下一个",
                target="Flash",
                instruction=f"模块 {filename} 审核通过"
            )
            return True

        elif filename.endswith('.plan.md') and '.q.' not in filename:
            self.print_header(f"📋 新计划文档: {filename}")
            instruction = self.generate_instruction(filepath, "flash_read_plan")
            self.print_action(
                f"请让 **Flash** 阅读并提问",
                target="Flash",
                instruction=instruction
            )
            self.print_preview(content, 10)
            return True

        return False

    def scan_once(self, trigger_actions=True):
        """扫描一次目录，检测变化（包括文件名变化）
        
        Args:
            trigger_actions: 是否触发动作（首次扫描设为 False，只记录状态）
        """
        has_changes = False
        current_files = {}
        current_filenames = []

        # 扫描所有文件
        for f in WORKFLOW_DIR.glob("*.md"):
            rel_path = str(f.relative_to(WORKFLOW_DIR))
            current_filenames.append(rel_path)
            file_hash = self.get_file_hash(f)
            current_files[rel_path] = file_hash

            # 如果是首次扫描且已存在状态，跳过动作触发
            if not trigger_actions and self.state.get("files"):
                continue

            # 新文件（文件名不在旧列表中）
            if rel_path not in self.state.get("filenames", []):
                print(f"{Fore.MAGENTA}📄 检测到新文件: {rel_path}{Style.RESET_ALL}")
                if self.analyze_file(f):
                    has_changes = True

            # 文件内容修改（文件名在旧列表中，但哈希变了）
            elif rel_path in self.state.get("files", {}):
                if self.state["files"][rel_path] != file_hash:
                    print(f"{Fore.MAGENTA}✏️  检测到文件修改: {rel_path}{Style.RESET_ALL}")
                    if self.analyze_file(f):
                        has_changes = True

        # 检测文件名变化（重命名）
        # 只有当 trigger_actions=True 时才检测（首次扫描跳过）
        if trigger_actions or not self.state.get("files"):
            old_filenames = set(self.state.get("filenames", []))
            new_filenames = set(current_filenames)
            
            # 删除的文件（文件名不在新列表中）
            deleted_files = old_filenames - new_filenames
            for deleted in deleted_files:
                # 检查是否是新文件改名过来的（通过哈希判断）
                # 如果旧文件的哈希等于某个新文件的哈希，说明是重命名
                if deleted in self.state.get("files", {}):
                    old_hash = self.state["files"][deleted]
                    # 查找是否有新文件的哈希等于旧文件的哈希
                    renamed_to = None
                    for new_file in current_files:
                        if current_files[new_file] == old_hash and new_file not in old_filenames:
                            renamed_to = new_file
                            break
                    
                    if renamed_to:
                        print(f"{Fore.CYAN}📝 检测到重命名: {deleted} → {renamed_to}{Style.RESET_ALL}")
                        self.log(f"检测到重命名: {deleted} -> {renamed_to}")
                    else:
                        print(f"{Fore.RED}🗑️  检测到文件删除: {deleted}{Style.RESET_ALL}")
                        self.log(f"检测到文件删除: {deleted}")
                    has_changes = True

        # 更新状态
        self.state["files"] = current_files
        self.state["filenames"] = current_filenames
        self.state["last_check"] = datetime.now().isoformat()
        self.save_state()

        return has_changes

    def run(self):
        """主循环"""
        self.print_header("🤖 AI Workflow Coordinator 启动")
        print(f"{Fore.CYAN}📁 监控目录: {WORKFLOW_DIR}{Style.RESET_ALL}")
        print(f"{Fore.CYAN}💾 状态文件: {STATE_FILE}{Style.RESET_ALL}")
        print(f"{Fore.CYAN}📜 历史日志: {HISTORY_FILE}{Style.RESET_ALL}")
        print(f"{Fore.CYAN}📌 最新指令: {LATEST_ACTION_FILE}{Style.RESET_ALL}")
        print(f"\n{Fore.YELLOW}按 Ctrl+C 停止监控{Style.RESET_ALL}")
        print(f"{Fore.YELLOW}监控: 文件创建 + 内容修改 + 重命名 + 删除{Style.RESET_ALL}")
        print(f"\n{Fore.BLUE}等待文件变化...{Style.RESET_ALL}\n")

        # 首次扫描：只记录状态，不触发动作
        print(f"{Fore.MAGENTA}▶️  执行首次扫描（仅记录状态）...{Style.RESET_ALL}\n")
        self.scan_once(trigger_actions=False)
        self.initialized = True
        print(f"{Fore.GREEN}✅ 首次扫描完成，开始监控变化...\n{Style.RESET_ALL}")

        # 主循环：正常检测变化并触发动作
        try:
            while True:
                time.sleep(3)
                if self.scan_once(trigger_actions=True):
                    print(f"{Fore.BLUE}{'='*60}{Style.RESET_ALL}\n")

        except KeyboardInterrupt:
            self.print_header("👋 协调器已停止")
            self.log("协调器已停止")
            sys.exit(0)


def main():
    """主函数"""
    # 检查依赖
    try:
        from colorama import init
        print("✅ colorama 已安装，将使用彩色输出\n")
    except ImportError:
        print("⚠️  建议安装 colorama 以获得更好的显示效果:")
        print("   pip install colorama")
        print("继续运行（无颜色输出）...\n")

    # 检查监控目录
    if not WORKFLOW_DIR.exists():
        print(f"❌ 监控目录不存在: {WORKFLOW_DIR}")
        print(f"   请先创建 aiworkflow/plan/ 目录")
        sys.exit(1)

    # 运行协调器
    coordinator = WorkflowCoordinator()
    coordinator.run()


if __name__ == "__main__":
    main()
