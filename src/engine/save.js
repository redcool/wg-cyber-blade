// ============================================================
// save.js - 存档系统（localStorage 自动存档 + 文件导入导出）
// ============================================================
const SAVE_SAVE_KEY = 'cyberblade_save';

const SaveSystem = {
    /** 存档数据版本 */
    VERSION: 1,

    /** 获取存档数据（从 UnlockSystem 实时读取） */
    _collectSaveData() {
        const us = UnlockSystem;
        return {
            version: this.VERSION,
            timestamp: Date.now(),
            stats: {
                totalKills: us.stats.totalKills,
                totalMaterials: us.stats.totalMaterials,
                totalLevels: us.stats.totalLevels,
                maxLevel: us.stats.maxLevel,
                highestLevel: us.stats.highestLevel,
                totalPlayTime: us.stats.totalPlayTime,
            },
            unlockedWeapons: [...us.unlockedWeapons],
            unlockedCharacters: [...us.unlockedCharacters],
        };
    },

    /** 将存档数据应用到 UnlockSystem */
    _applySaveData(data) {
        const us = UnlockSystem;
        us.stats = data.stats || us.stats;
        us.unlockedWeapons = new Set([...us.unlockedWeapons, ...(data.unlockedWeapons || [])]);
        us.unlockedCharacters = new Set([...us.unlockedCharacters, ...(data.unlockedCharacters || [])]);
    },

    /** 保存到 localStorage */
    save() {
        try {
            const data = this._collectSaveData();
            localStorage.setItem(SAVE_SAVE_KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            console.warn('[SaveSystem] 保存失败:', e);
            return false;
        }
    },

    /** 从 localStorage 加载 */
    load() {
        try {
            const raw = localStorage.getItem(SAVE_SAVE_KEY);
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (!data || !data.version) return false;
            this._applySaveData(data);
            return true;
        } catch (e) {
            console.warn('[SaveSystem] 加载失败:', e);
            return false;
        }
    },

    /** 检查是否有存档 */
    hasSave() {
        try {
            return !!localStorage.getItem(SAVE_SAVE_KEY);
        } catch (e) {
            return false;
        }
    },

    /** 清除存档 */
    clear() {
        try {
            localStorage.removeItem(SAVE_SAVE_KEY);
            return true;
        } catch (e) {
            return false;
        }
    },

    /** 导出存档为文件（下载 .json） */
    exportToFile() {
        const data = this._collectSaveData();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cyberblade_save_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
    },

    /** 从文件导入存档（返回成功/失败信息） */
    importFromFile(file) {
        return new Promise((resolve) => {
            if (!file) {
                resolve({ success: false, message: '未选择文件' });
                return;
            }
            if (!file.name.endsWith('.json')) {
                resolve({ success: false, message: '请选择 .json 存档文件' });
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (!data || !data.version) {
                        resolve({ success: false, message: '无效的存档文件' });
                        return;
                    }
                    this._applySaveData(data);
                    this.save(); // 同步到 localStorage
                    resolve({ success: true, message: `存档已导入 (${Object.keys(data.stats || {}).length} 项数据)` });
                } catch (err) {
                    resolve({ success: false, message: '文件解析失败: ' + err.message });
                }
            };
            reader.onerror = () => {
                resolve({ success: false, message: '文件读取失败' });
            };
            reader.readAsText(file);
        });
    },
};
