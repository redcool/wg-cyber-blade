// ============================================================
// cyberblade/ui.js - UI系统（角色选择+商店+结算）
// ============================================================
// 角色属性格式化映射（代码逻辑，不在数据层）
const _CHAR_FMT = {
    dodge: v => `${(v * 100).toFixed(0)}%`,
    critChance: v => `${(v * 100).toFixed(0)}%`,
    critDamage: v => `${v.toFixed(1)}x`,
    hpRegen: v => `${v.toFixed(1)}/s`,
    damagePercent: v => `${(v * 100).toFixed(0)}%`,
    attackSpeed: v => `${v.toFixed(1)}`,
    attackRange: v => `${v}`,
    lifeSteal: v => `${(v * 100).toFixed(0)}%`,
    speed: v => `${v}`,
    harvesting: v => `${v}`,
    luck: v => `${v}`,
    xpGain: v => `${(v * 100).toFixed(0)}%`,
    engineering: v => `${v}`,
    meleeDamage: v => `${v}`,
    rangedDamage: v => `${v}`,
    elementalDamage: v => `${v}`,
    armor: v => `${v}`,
    maxHp: v => `${v}`,
};

// 武器属性格式化映射（代码逻辑，不在数据层）
const _WPN_FMT = {
    cooldown_lv1: v => `${v.toFixed(2)}s`,
    slowDuration: v => `${v}s`,
    burnDps: v => `${v}/s`,
    homingStrength: v => `${Math.round(v * 100)}%`,
    slowAmount: v => `${Math.round(v * 100)}%`,
    critChanceAdd: v => `+${Math.round(v * 100)}%`,
    critDamageAdd: v => `+${(v * 100).toFixed(0)}%`,
    speedMult: v => `+${Math.round(v * 100)}%`,
    lifeStealAdd: v => `+${Math.round(v * 100)}%`,
    sprayCone: v => `${v}`,
};
const _WPN_COND = {
    slots: v => v > 1,
};

const UISystem = {
    _selectedDifficulty: 0,
    _selectedWeaponId: null,
    _weaponStatDefs: [],
    _charStatDefs: [],

    init() {
        document.getElementById('startBtn').addEventListener('click', () => {
            if (!CharacterSystem.selectedCharacterId) {
                CharacterSystem.selectedCharacterId = 'default';
            }
            this._showWeaponSelect();
        });
        document.getElementById('restartBtn').addEventListener('click', () => {
            this.showMenu();
        });

        this._bindSaveButtons();

        if (typeof SaveSystem !== 'undefined' && SaveSystem.hasSave()) {
            SaveSystem.load();
        }
        document.getElementById('shopContinueBtn').addEventListener('click', () => {
            GameEngine.closeShop();
        });

        document.getElementById('charGrid').addEventListener('click', (e) => {
            const card = e.target.closest('.char-icon-card');
            if (!card) return;
            const id = card.dataset.charId;
            // 锁定角色点击也可以选中（预览详情 + 显示选择框）
            if (card.classList.contains('locked')) {
                this._showCharDetail(id);
                if (CharacterSystem.selectedCharacterId !== id) {
                    CharacterSystem.selectedCharacterId = id;
                    this._renderCharSelect(); // 重新渲染网格以显示选择框
                }
                return;
            }
            if (CharacterSystem.select(id)) {
                this._renderCharSelect();
            }
        });

        document.getElementById('weaponSelectGrid').addEventListener('click', (e) => {
            const card = e.target.closest('.weapon-select-card');
            if (!card) return;
            const wid = card.dataset.weaponId;
            if (wid) {
                this._selectWeapon(wid);
            }
        });
        document.getElementById('weaponSelectConfirm').addEventListener('click', () => {
            if (this._selectedWeaponId) {
                this._confirmWeapon(this._selectedWeaponId);
            }
        });
        document.getElementById('weaponSelectBack').addEventListener('click', () => {
            this.showMenu();
        });

        // 调试窗口折叠切换
        document.getElementById('hudDebug').addEventListener('click', (e) => {
            if (e.target.closest('.debug-header')) {
                document.getElementById('hudDebug').classList.toggle('collapsed');
            }
        });

        // 难度选择：点击图标 → 预览详情（不开始游戏）
        document.getElementById('diffGrid').addEventListener('click', (e) => {
            const card = e.target.closest('.diff-card');
            if (!card) return;
            const level = parseInt(card.dataset.diff, 10);
            this._selectDifficulty(level);
        });
        document.getElementById('startBattleBtn').addEventListener('click', () => {
            this._startBattle();
        });
        document.getElementById('diffBack').addEventListener('click', () => {
            this._showWeaponSelect();
        });

        this.updateHUD();
        // 加载属性标签表
        const cache = typeof DataLoader !== 'undefined' && DataLoader._cache;
        const bundle = typeof window !== 'undefined' && window.__DATA_BUNDLE__;
        this._weaponStatDefs = (cache && cache.weaponStats) || (bundle && bundle.weaponStats) || [];
        this._charStatDefs = (cache && cache.charStats) || (bundle && bundle.charStats) || [];
        this._debugDefs = (cache && cache.debug) || (bundle && bundle.debug) || [];
        this._debugEnabled = this._debugDefs.filter(d => d.enabled);
    },

    _showWeaponSelect() {
        const charId = CharacterSystem.selectedCharacterId || 'default';
        const ch = CharacterSystem.allCharacters.find(c => c.id === charId);
        if (!ch) return;

        document.getElementById('charSelectOverlay').classList.add('hidden');
        document.getElementById('difficultyOverlay').classList.add('hidden');
        document.getElementById('weaponSelectOverlay').classList.remove('hidden');

        document.getElementById('weaponSelectHint').textContent =
            `${ch.name} · 选择一个初始武器`;

        const affinities = ch.tags || ch.weaponAffinities || [];
        const normalizeWeaponTag = (t) => ({ gun: 'ranged', bow: 'ranged', magic: 'fire', medic: 'tech', lance: 'melee' }[t] || t);
        const basicWeapons = ShopSystem.allWeapons.filter(w =>
            affinities.includes(normalizeWeaponTag(w.tag)) && UnlockSystem.basicWeaponIds.has(w.id)
        );

        const tagOrder = ['melee', 'ranged', 'fire', 'explosive', 'crit', 'tech', 'economy'];
        basicWeapons.sort((a, b) => tagOrder.indexOf(a.tag) - tagOrder.indexOf(b.tag));

        // 选中第一个武器
        this._selectedWeaponId = basicWeapons.length > 0 ? basicWeapons[0].id : 'pistol';

        // 顶部详情面板
        this._showWeaponDetail(this._selectedWeaponId);

        // 底部武器图标网格（点击图标 → 查看详情）
        const grid = document.getElementById('weaponSelectGrid');
        grid.innerHTML = '';

        if (basicWeapons.length === 0) {
            const pistol = ShopSystem.allWeapons.find(w => w.id === 'pistol');
            if (pistol) this._renderWeaponIcon(grid, pistol, true);
        } else {
            for (const w of basicWeapons) {
                this._renderWeaponIcon(grid, w, w.id === this._selectedWeaponId);
            }
        }
    },

    _showWeaponDetail(weaponId) {
        const weapon = ShopSystem.allWeapons.find(w => w.id === weaponId);
        const detail = document.getElementById('weaponDetail');
        if (!weapon || !detail) return;

        const tagDef = TagSystem.getTagDef(weapon.tag);
        const tagStr = tagDef ? `${tagDef.icon} ${tagDef.name}` : weapon.tag || '—';
        const tagColor = tagDef ? this._tagColor(tagDef.id) : '#ffffff';

        // 构建属性列表（数据驱动，非0即显示，2列）
        const statLines = [];
        for (const def of this._weaponStatDefs) {
            const val = weapon[def.key];
            const cond = _WPN_COND[def.key];
            const shouldShow = cond ? cond(val) : (val !== undefined && val !== 0 && val !== null && val !== '');
            if (!shouldShow) continue;
            const fmt = _WPN_FMT[def.key] || (v => v);
            statLines.push(`<span class="stat-item"><b>${def['中文名']}</b> ${fmt(val)}</span>`);
        }

        detail.innerHTML = `
            <div class="weapon-detail-avatar">${AssetSystem.weaponIconHTML(weapon.id, 72)}</div>
            <div class="weapon-detail-info">
                <div class="weapon-detail-name">${weapon.name}</div>
                <div class="weapon-detail-tag" style="color:${tagColor}">${tagStr}</div>
                <div class="weapon-detail-desc">${weapon.desc || ''}</div>
                <div class="weapon-detail-stats">
                    ${statLines.join('\n')}
                </div>
            </div>
            <div class="weapon-detail-radar" id="weaponRadarContainer"></div>
        `;
        const radarContainer = document.getElementById('weaponRadarContainer');
        if (radarContainer) {
            radarContainer.appendChild(this._renderWeaponRadarChart(weapon));
        }
    },

    _selectWeapon(weaponId) {
        this._selectedWeaponId = weaponId;
        this._showWeaponDetail(weaponId);
        // 更新网格高亮
        const cards = document.querySelectorAll('#weaponSelectGrid .weapon-select-card');
        for (const card of cards) {
            card.classList.toggle('selected', card.dataset.weaponId === weaponId);
        }
    },

    /** 渲染武器图标卡片（纯图标，点击后详情面板展示属性） */
    _renderWeaponIcon(container, weapon, selected) {
        const card = document.createElement('div');
        card.className = `weapon-select-card ${selected ? 'selected' : ''}`;
        card.dataset.weaponId = weapon.id;
        card.innerHTML = `<div class="ws-icon">${AssetSystem.weaponIconHTML(weapon.id, 42)}</div>`;
        container.appendChild(card);
    },

    _confirmWeapon(weaponId) {
        this._selectedWeapon = weaponId;
        document.getElementById('weaponSelectOverlay').classList.add('hidden');
        this._showDifficultySelect();
    },

    /** 获取难度配置表（数据驱动） */
    _getDifficultyDefs() {
        const cache = typeof DataLoader !== 'undefined' && DataLoader._cache;
        const bundle = typeof window !== 'undefined' && window.__DATA_BUNDLE__;
        return (cache && cache.difficulty) || (bundle && bundle.difficulty) || [];
    },

    /** 获取敌人配置表 */
    _getEnemyDefs() {
        const cache = typeof DataLoader !== 'undefined' && DataLoader._cache;
        const bundle = typeof window !== 'undefined' && window.__DATA_BUNDLE__;
        return (cache && cache.enemies) || (bundle && bundle.enemies) || [];
    },

    _showDifficultySelect() {
        document.getElementById('difficultyOverlay').classList.remove('hidden');
        const defs = this._getDifficultyDefs();
        const selected = this._selectedDifficulty;

        // 更新顶部详情面板
        this._renderDiffDetail(defs, selected);

        // 渲染底部难度图标网格
        const grid = document.getElementById('diffGrid');
        grid.innerHTML = '';
        for (const d of defs) {
            const card = document.createElement('div');
            card.className = `diff-card ${d.id === selected ? 'selected' : ''}`;
            card.dataset.diff = d.id;
            card.textContent = d.id;
            grid.appendChild(card);
        }
    },

    /** 渲染难度详情面板 */
    _renderDiffDetail(defs, selectedId) {
        const d = defs.find(x => x.id === selectedId) || defs[0];
        if (!d) return;
        const detail = document.getElementById('diffDetail');
        if (!detail) return;

        const badge = detail.querySelector('.diff-detail-badge');
        const nameEl = detail.querySelector('.diff-detail-name');
        const descEl = detail.querySelector('.diff-detail-desc');
        const bonusesEl = detail.querySelector('.diff-detail-bonuses');
        if (badge) badge.textContent = d.id;
        if (nameEl) nameEl.textContent = d['中文名'] + ' · ' + d['英文名'];
        if (descEl) descEl.textContent = d.desc || '';

        // 构建属性标签
        const bonuses = [];
        if (d.enemyMult > 1) bonuses.push(`怪物属性 ×${d.enemyMult.toFixed(1)}`);
        if (d.spawnRate > 1) bonuses.push(`生成速率 ×${d.spawnRate.toFixed(1)}`);
        if (d.eliteInterval > 0) bonuses.push(`精英每${d.eliteInterval}关`);
        if (d.bossWaves && d.bossWaves.length > 0) bonuses.push(`Boss: ${d.bossWaves.join('、')}关`);
        if (d.newEnemyTypes && d.newEnemyTypes.length > 0) {
            // 从 enemies 数据查找中文名
            const enemyDefs = this._getEnemyDefs();
            const names = d.newEnemyTypes.map(eid => {
                const def = enemyDefs.find(e => e.id === eid);
                return def ? def.name : eid;
            });
            bonuses.push(`新敌人: ${names.join('、')}`);
        }
        if (bonuses.length === 0) bonuses.push('无额外加成');

        if (bonusesEl) bonusesEl.innerHTML = bonuses.map(b => `<span class="diff-detail-bonus">${b}</span>`).join('');
    },

    /** 选择难度：更新详情 + 选中态（不开始游戏） */
    _selectDifficulty(level) {
        this._selectedDifficulty = level;

        // 更新详情面板
        const defs = this._getDifficultyDefs();
        this._renderDiffDetail(defs, level);

        // 更新网格选中态
        const cards = document.querySelectorAll('#diffGrid .diff-card');
        for (const c of cards) {
            c.classList.toggle('selected', parseInt(c.dataset.diff, 10) === level);
        }
    },

    /** 开始战斗：隐藏难度面板 → 启动游戏 */
    _startBattle() {
        const level = this._selectedDifficulty;
        if (level === -1) return;
        document.getElementById('difficultyOverlay').classList.add('hidden');
        GameEngine.startGame(this._selectedWeaponId, level);
    },

    showMenu() {
        document.getElementById('menuOverlay').classList.remove('hidden');
        document.getElementById('gameOverOverlay').classList.add('hidden');
        document.getElementById('shopOverlay').classList.add('hidden');
        document.getElementById('levelUpOverlay').classList.add('hidden');
        document.getElementById('weaponSelectOverlay').classList.add('hidden');
        document.getElementById('difficultyOverlay').classList.add('hidden');
        document.getElementById('charSelectOverlay').classList.remove('hidden');
        document.getElementById('hud').classList.add('hidden');
        this._renderCharSelect();

        if (typeof SaveSystem !== 'undefined' && SaveSystem.hasSave()) {
            const us = typeof UnlockSystem !== 'undefined' ? UnlockSystem : null;
            if (us && us.stats.totalKills === 0 && us.stats.totalLevels === 0) {
                SaveSystem.load();
                this._renderCharSelect();
            }
        }
    },

    _bindSaveButtons() {
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                if (typeof SaveSystem !== 'undefined' && SaveSystem.save()) {
                    this._showToast('💾 存档保存成功');
                } else {
                    this._showToast('❌ 保存失败');
                }
            });
        }

        const loadBtn = document.getElementById('loadBtn');
        if (loadBtn) {
            loadBtn.addEventListener('click', () => {
                if (typeof SaveSystem !== 'undefined' && SaveSystem.load()) {
                    this._renderCharSelect();
                    this._showToast('📂 存档加载成功');
                } else {
                    this._showToast('📂 没有找到存档');
                }
            });
        }

        const exportBtn = document.getElementById('exportSaveBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                if (typeof SaveSystem !== 'undefined') {
                    SaveSystem.exportToFile();
                    this._showToast('📤 存档已导出');
                }
            });
        }

        const importBtn = document.getElementById('importSaveBtn');
        const importInput = document.getElementById('importFileInput');
        if (importBtn && importInput) {
            importBtn.addEventListener('click', () => { importInput.click(); });
            importInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file || typeof SaveSystem === 'undefined') return;
                const result = await SaveSystem.importFromFile(file);
                if (result.success) this._renderCharSelect();
                this._showToast(result.message);
                importInput.value = '';
            });
        }
    },

    _showToast(msg) {
        let toast = document.getElementById('saveToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'saveToast';
            toast.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);z-index:9999;background:rgba(0,200,100,0.9);color:#fff;padding:10px 24px;border-radius:8px;font:16px/1.4 sans-serif;pointer-events:none;transition:opacity 0.3s;box-shadow:0 4px 20px rgba(0,0,0,0.5)';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.style.opacity = '1';
        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
    },

    _renderCharSelect() {
        const chars = CharacterSystem.allCharacters;
        if (!chars || chars.length === 0) return;

        // 确保有选中的角色
        let selected = CharacterSystem.selectedCharacterId;
        if (!chars.some(c => c.id === selected)) {
            const first = chars.find(c => c.unlocked || UnlockSystem.isCharacterUnlocked(c.id));
            if (first) {
                CharacterSystem.selectedCharacterId = first.id;
                selected = first.id;
            }
        }

        // --- 顶部详情面板 ---
        this._showCharDetail(selected);

        // --- 底部角色图标网格 ---
        const grid = document.getElementById('charGrid');
        grid.innerHTML = '';
        for (const ch of chars) {
            const unlocked = ch.unlocked || UnlockSystem.isCharacterUnlocked(ch.id);
            const card = document.createElement('div');
            card.className = `char-icon-card ${unlocked ? '' : 'locked'} ${ch.id === selected ? 'selected' : ''}`;
            card.dataset.charId = ch.id;

            if (unlocked) {
                card.innerHTML = AssetSystem.charIconHTML(ch.id);
            } else {
                card.innerHTML = `<div class="icon-fallback char-fallback">🔒</div>`;
            }
            grid.appendChild(card);
        }
    },

    /** 在详情面板中显示指定角色的信息（含解锁状态 + 雷达图） */
    _showCharDetail(id) {
        const ch = CharacterSystem.allCharacters.find(c => c.id === id);
        const detail = document.getElementById('charDetail');
        if (!ch || !detail) return;

        const unlocked = ch.unlocked || UnlockSystem.isCharacterUnlocked(ch.id);
        if (unlocked) {
            const s = ch;
            detail.innerHTML = `
                <div class="char-detail-avatar">${AssetSystem.charIconHTML(ch.id, 80)}</div>
                <div class="char-detail-info">
                    <div class="char-detail-name">${ch.name}</div>
                    <div class="char-detail-desc">${ch.desc}</div>
                    <div class="char-detail-stats">
                        ${this._buildCharStatLines(ch)}
                    </div>
                </div>
                <div class="char-detail-radar" id="charRadarContainer"></div>
            `;
            // 雷达图追加到右侧容器
            const radarContainer = document.getElementById('charRadarContainer');
            if (radarContainer) {
                radarContainer.appendChild(this._renderRadarChart(ch));
            }
        } else {
            let unlockDesc = '';
            const cond = ch.unlockCondition;
            if (cond) {
                if (cond.type === 'maxLevel') unlockDesc = `通关第 ${cond.value} 关解锁`;
                else if (cond.type === 'totalKills') unlockDesc = `累计击杀 ${cond.value} 解锁`;
            }
            detail.innerHTML = `
                <div class="char-detail-avatar locked">🔒</div>
                <div class="char-detail-info">
                    <div class="char-detail-name locked">???</div>
                    <div class="char-detail-desc">${unlockDesc || '未解锁'}</div>
                </div>
            `;
        }
        // 只有已解锁角色才能开始
        document.getElementById('startBtn').disabled = !unlocked;
    },

    /** 根据 charStats 数据驱动生成角色属性 HTML（仅显示非0值） */
    _buildCharStatLines(ch) {
        return (this._charStatDefs || []).map(def => {
            const val = ch[def.key];
            if (val === undefined || val === null || val === 0) return '';
            const fmt = _CHAR_FMT[def.key] || (v => v);
            return `<span class="stat-item"><b>${def['中文名']}</b> ${fmt(val)}</span>`;
        }).filter(Boolean).join('\n');
    },

    // ─── 雷达图 ───────────────────────────────────────────────

    /** 雷达图用 8 维属性键（与模板字符一致） */
    _RADAR_KEYS: ['maxHp', 'speed', 'attackSpeed', 'armor', 'meleeDamage', 'rangedDamage', 'elementalDamage', 'engineering'],

    /** 从 charStats 数据驱动获取角色雷达图轴标签 */
    _getRadarLabels() {
        return this._RADAR_KEYS.map(k => {
            const d = (this._charStatDefs || []).find(def => def.key === k);
            return d ? d['中文名'] : k;
        });
    },

    /** 计算全角色各属性的平均值 */
    _calcRadarAverages() {
        const chars = CharacterSystem.allCharacters;
        const sums = {}, counts = {};
        for (const key of this._RADAR_KEYS) { sums[key] = 0; counts[key] = 0; }
        for (const ch of chars) {
            for (const key of this._RADAR_KEYS) {
                if (typeof ch[key] === 'number') {
                    sums[key] += ch[key];
                    counts[key]++;
                }
            }
        }
        const avgs = {};
        for (const key of this._RADAR_KEYS) {
            avgs[key] = counts[key] > 0 ? sums[key] / counts[key] : 1;
        }
        return avgs;
    },

    /**
     * 生成角色属性雷达图 Canvas
     * 参考系: 外圈 = 2x 全角色平均值 (平均值在半径 50% 位置)
     * @param {Object} ch - 角色数据对象
     * @returns {HTMLCanvasElement}
     */
    _renderRadarChart(ch) {
        const W = 180, H = 180, CX = 90, CY = 90, R = 64;
        const dpr = window.devicePixelRatio || 1;
        const canvas = document.createElement('canvas');
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const keys = this._RADAR_KEYS;
        const labels = this._getRadarLabels();
        const n = keys.length;
        const angleStep = (Math.PI * 2) / n;
        const startAngle = -Math.PI / 2; // 12 点钟方向开始

        // 计算该角色的归一化比值 (value / (avg * 2), 封顶 1.0)
        const avgs = this._calcRadarAverages();
        const ratios = {};
        for (const key of keys) {
            const val = typeof ch[key] === 'number' ? ch[key] : 0;
            const avg = avgs[key] || 1;
            ratios[key] = Math.min(1, val / (avg * 2));
        }

        ctx.clearRect(0, 0, W, H);

        // ── 网格: 25% / 50% / 75% / 100% ──
        for (let lv = 0.25; lv <= 1; lv += 0.25) {
            ctx.beginPath();
            for (let i = 0; i <= n; i++) {
                const angle = startAngle + i * angleStep;
                const x = CX + Math.cos(angle) * R * lv;
                const y = CY + Math.sin(angle) * R * lv;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.strokeStyle = lv === 1 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
            ctx.lineWidth = lv === 1 ? 1 : 0.5;
            ctx.stroke();
        }

        // ── 轴线 ──
        for (let i = 0; i < n; i++) {
            const angle = startAngle + i * angleStep;
            const x = CX + Math.cos(angle) * R;
            const y = CY + Math.sin(angle) * R;
            ctx.beginPath();
            ctx.moveTo(CX, CY);
            ctx.lineTo(x, y);
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }

        // ── 数据多边形 ──
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
            const key = keys[i % n];
            const angle = startAngle + i * angleStep;
            const r = R * ratios[key];
            const x = CX + Math.cos(angle) * r;
            const y = CY + Math.sin(angle) * r;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 255, 200, 0.12)';
        ctx.fill();
        ctx.strokeStyle = '#00ffc8';
        ctx.lineWidth = 2;
        ctx.stroke();

        // ── 数据点 ──
        for (let i = 0; i < n; i++) {
            const key = keys[i];
            const angle = startAngle + i * angleStep;
            const r = R * ratios[key];
            const x = CX + Math.cos(angle) * r;
            const y = CY + Math.sin(angle) * r;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#00ffc8';
            ctx.fill();
        }

        // ── 轴标签（根据左右半区分对齐方向，避免文字被画布裁剪） ──
        for (let i = 0; i < n; i++) {
            const angle = startAngle + i * angleStep;
            const lx = CX + Math.cos(angle) * (R + 15);
            const ly = CY + Math.sin(angle) * (R + 15);
            ctx.textAlign = lx > CX + 2 ? 'left' : lx < CX - 2 ? 'right' : 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.fillText(labels[i], lx, ly);
        }

        return canvas;
    },

    // ─── 武器雷达图 ───────────────────────────────────────────

    /** 雷达图用 6 维属性键 */
    _WEAPON_RADAR_KEYS: ['damage', 'attackSpeed', 'bulletSpeed', 'range', 'pierce', 'bulletCount'],

    /** 从 weaponStats 数据驱动获取武器雷达图轴标签 */
    _getWeaponRadarLabels() {
        return this._WEAPON_RADAR_KEYS.map(k => {
            const d = (this._weaponStatDefs || []).find(def => def.key === k);
            return d ? d['中文名'] : k;
        });
    },

    /**
     * 从武器对象中提取各维度原始值
     * 攻速 = 1/cooldown (高=快), 射程 = max(attackRange, meleeRange)
     */
    _getWeaponRadarValues(w) {
        return {
            damage:      w.damage_lv1 || w.damage_lv2 || 0,
            attackSpeed: w.cooldown_lv1 > 0 ? +(1 / w.cooldown_lv1).toFixed(2) : 1,
            bulletSpeed: w.bulletSpeed || 0,
            range:       Math.max(w.attackRange || 0, w.meleeRange || 0),
            pierce:      w.pierce || 0,
            bulletCount: w.bulletCount || 1,
        };
    },

    /** 计算全武器各维度的平均值 */
    _calcWeaponRadarAverages() {
        const weapons = ShopSystem.allWeapons;
        const keys = this._WEAPON_RADAR_KEYS;
        const sums = {}, counts = {};
        for (const k of keys) { sums[k] = 0; counts[k] = 0; }
        for (const w of weapons) {
            const vals = this._getWeaponRadarValues(w);
            for (const k of keys) {
                if (typeof vals[k] === 'number') {
                    sums[k] += vals[k];
                    counts[k]++;
                }
            }
        }
        const avgs = {};
        for (const k of keys) {
            avgs[k] = counts[k] > 0 ? sums[k] / counts[k] : 1;
        }
        return avgs;
    },

    /**
     * 生成武器属性雷达图 Canvas
     * 参考系: 外圈 = 2x 全武器平均值
     * @param {Object} weapon - 武器数据对象
     * @returns {HTMLCanvasElement}
     */
    _renderWeaponRadarChart(weapon) {
        const W = 220, H = 220, CX = 110, CY = 110, R = 75;
        const dpr = window.devicePixelRatio || 1;
        const canvas = document.createElement('canvas');
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const keys = this._WEAPON_RADAR_KEYS;
        const labels = this._getWeaponRadarLabels();
        const n = keys.length;
        const angleStep = (Math.PI * 2) / n;
        const startAngle = -Math.PI / 2;

        // 归一化比值 (value / (avg * 2), 封顶 1.0)
        const avgs = this._calcWeaponRadarAverages();
        const vals = this._getWeaponRadarValues(weapon);
        const ratios = {};
        for (const k of keys) {
            const avg = avgs[k] || 1;
            ratios[k] = Math.min(1, (vals[k] || 0) / (avg * 2));
        }

        ctx.clearRect(0, 0, W, H);

        // 网格
        for (let lv = 0.25; lv <= 1; lv += 0.25) {
            ctx.beginPath();
            for (let i = 0; i <= n; i++) {
                const angle = startAngle + i * angleStep;
                const x = CX + Math.cos(angle) * R * lv;
                const y = CY + Math.sin(angle) * R * lv;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.strokeStyle = lv === 1 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
            ctx.lineWidth = lv === 1 ? 1 : 0.5;
            ctx.stroke();
        }

        // 轴线
        for (let i = 0; i < n; i++) {
            const angle = startAngle + i * angleStep;
            const x = CX + Math.cos(angle) * R;
            const y = CY + Math.sin(angle) * R;
            ctx.beginPath();
            ctx.moveTo(CX, CY);
            ctx.lineTo(x, y);
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }

        // 数据多边形
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
            const k = keys[i % n];
            const angle = startAngle + i * angleStep;
            const r = R * (ratios[k] || 0);
            const x = CX + Math.cos(angle) * r;
            const y = CY + Math.sin(angle) * r;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 200, 0, 0.12)';
        ctx.fill();
        ctx.strokeStyle = '#ffc800';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 数据点
        for (let i = 0; i < n; i++) {
            const k = keys[i];
            const angle = startAngle + i * angleStep;
            const r = R * (ratios[k] || 0);
            const x = CX + Math.cos(angle) * r;
            const y = CY + Math.sin(angle) * r;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#ffc800';
            ctx.fill();
        }

        // 轴标签（根据左右半区分对齐方向）
        for (let i = 0; i < n; i++) {
            const angle = startAngle + i * angleStep;
            const lx = CX + Math.cos(angle) * (R + 14);
            const ly = CY + Math.sin(angle) * (R + 14);
            ctx.textAlign = lx > CX + 2 ? 'left' : lx < CX - 2 ? 'right' : 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.fillText(labels[i], lx, ly);
        }

        return canvas;
    },

    showGameOver() {
        const p = PlayerSystem.player;
        const result = UnlockSystem.endSession();

        document.getElementById('menuOverlay').classList.add('hidden');
        document.getElementById('gameOverOverlay').classList.remove('hidden');
        document.getElementById('shopOverlay').classList.add('hidden');
        document.getElementById('levelUpOverlay').classList.add('hidden');
        document.getElementById('charSelectOverlay').classList.add('hidden');
        document.getElementById('difficultyOverlay').classList.add('hidden');
        document.getElementById('weaponSelectOverlay').classList.add('hidden');
        document.getElementById('hud').classList.add('hidden');

        document.getElementById('finalLevel').textContent = WaveSystem.currentLevel;
        document.getElementById('finalKills').textContent = p ? p.kills : 0;
        document.getElementById('finalMaterials').textContent = p ? p.materials : 0;
        document.getElementById('finalChar').textContent = CharacterSystem.selectedCharacterId ?
            CharacterSystem.allCharacters.find(c => c.id === CharacterSystem.selectedCharacterId)?.name || '赛博游侠' : '赛博游侠';

        const weaponContainer = document.getElementById('finalWeapons');
        weaponContainer.innerHTML = '';
        const usedWeapons = result.weaponsUsed || (p && p.weapons ? p.weapons.map(w => w.id) : ['pistol']);
        for (const wid of usedWeapons) {
            const def = ShopSystem.allWeapons.find(w => w.id === wid);
            if (def) {
                const span = document.createElement('span');
                span.className = 'final-weapon';
                span.innerHTML = `${AssetSystem.weaponIconHTML(def.id)} ${def.name}`;
                weaponContainer.appendChild(span);
            }
        }

        const unlockContainer = document.getElementById('newUnlocks');
        unlockContainer.innerHTML = '';
        if (result.newUnlocks && result.newUnlocks.length > 0) {
            unlockContainer.parentElement.classList.remove('hidden');
            for (const ul of result.newUnlocks) {
                const div = document.createElement('div');
                div.className = 'new-unlock';
                if (ul.type === 'weapon') {
                    const def = ShopSystem.allWeapons.find(w => w.id === ul.id);
                    div.innerHTML = `🔓 新武器: ${def ? AssetSystem.weaponIconHTML(def.id) + ' ' + def.name : ul.id}`;
                } else if (ul.type === 'character') {
                    const def = CharacterSystem.allCharacters.find(c => c.id === ul.id);
                    div.innerHTML = `🔓 新角色: ${def ? AssetSystem.charIconHTML(def.id) + ' ' + def.name : ul.id}`;
                }
                unlockContainer.appendChild(div);
                setTimeout(() => div.classList.add('show'), 100);
            }
        } else {
            unlockContainer.parentElement.classList.add('hidden');
        }
    },

    showHUD() {
        document.getElementById('hud').classList.remove('hidden');
    },

    showShop() {
        const p = PlayerSystem.player;
        if (!p) return;

        document.getElementById('shopOverlay').classList.remove('hidden');
        this._mergeSourceIdx = -1;
        this._errorTimer = null;

        const char = CharacterSystem.allCharacters.find(c => c.id === CharacterSystem.selectedCharacterId);
        document.getElementById('shopCharInfo').innerHTML = `${char ? AssetSystem.charIconHTML(char.id) + ' ' + char.name : '⚔️ 赛博游侠'}`;
        document.getElementById('shopLevel').textContent = WaveSystem.currentLevel;

        this.updateShop(p);
    },

    _tagColor(tagId) {
        const colors = {
            melee: '#00ff88', ranged: '#ffcc00', fire: '#ff6600',
            explosive: '#ff4444', crit: '#ff88ff', tech: '#00ffff',
            economy: '#ffd700',
        };
        return colors[tagId] || '#ffffff';
    },

    _formatSynergyBonus(bonus) {
        const parts = [];
        for (const [key, val] of Object.entries(bonus)) {
            switch (key) {
                // 新标签系统（TagSystem）
                case 'damagePercent': parts.push(`伤害+${Math.round(val * 100)}%`); break;
                case 'lifeSteal': parts.push(`吸血+${Math.round(val * 100)}%`); break;
                case 'armor': parts.push(`护甲+${val}`); break;
                case 'knockback': parts.push(`击退+${val}`); break;
                case 'attackRange': parts.push(`射程+${Math.round(val * 100)}%`); break;
                case 'bulletSpeed': parts.push(`弹速+${Math.round(val * 100)}%`); break;
                case 'bulletCount': parts.push(`子弹+${val}`); break;
                case 'elementalDamage': parts.push(`元素伤+${Math.round(val * 100)}%`); break;
                case 'burnDps': parts.push(`灼烧+${val}/s`); break;
                case 'burningSpread': parts.push('灼烧扩散'); break;
                case 'explosionSize': parts.push(`爆炸范围+${Math.round(val * 100)}%`); break;
                case 'explosionDamage': parts.push(`爆炸伤+${Math.round(val * 100)}%`); break;
                case 'chainExplosion': parts.push('连锁爆炸'); break;
                case 'critChance': parts.push(`暴击+${Math.round(val * 100)}%`); break;
                case 'critDamage': parts.push(`暴伤+${Math.round(val * 100)}%`); break;
                case 'onCritLightning': parts.push('暴击落雷'); break;
                case 'engineering': parts.push(`工程+${val}`); break;
                case 'turretCount': parts.push(`炮塔+${val}`); break;
                case 'turretDamage': parts.push(`炮塔伤+${Math.round(val * 100)}%`); break;
                case 'luck': parts.push(`运气+${val}`); break;
                case 'xpGain': parts.push(`经验+${Math.round(val * 100)}%`); break;
                case 'materialGain': parts.push(`材料+${Math.round(val * 100)}%`); break;
                case 'goldToDamage': parts.push('金币转伤害'); break;
                // 旧兼容
                case 'damageMult': parts.push(`伤害+${Math.round(val * 100)}%`); break;
                case 'attackSpeedMult': parts.push(`攻速+${Math.round(val * 100)}%`); break;
                case 'bulletSpeedMult': parts.push(`弹速+${Math.round(val * 100)}%`); break;
                case 'bulletPierceAdd': parts.push(`穿透+${val}`); break;
                case 'critChanceAdd': parts.push(`暴击+${Math.round(val * 100)}%`); break;
                case 'lifeStealAdd': parts.push(`吸血+${Math.round(val * 100)}%`); break;
                case 'critMultiplierAdd': parts.push(`暴伤+${Math.round(val * 100)}%`); break;
                default:
                    if (typeof val === 'boolean') {
                        parts.push(val ? key : '');
                    } else if (typeof val === 'number') {
                        parts.push(`${key}:${val}`);
                    }
                    break;
            }
        }
        return parts.filter(Boolean).join('  ');
    },

    hideShop() {
        document.getElementById('shopOverlay').classList.add('hidden');
    },

    _getDisplayCost(player, baseCost) {
        if (player.coupon > 0) {
            const discCost = Math.max(1, baseCost - player.coupon * 2);
            return `<span style="text-decoration:line-through;opacity:0.5">🪙${baseCost}</span> 🪙${discCost}`;
        }
        return `<span>🪙 ${baseCost}</span>`;
    },

    updateShop(player) {
        document.getElementById('shopMaterials').textContent = player.materials;
        this._renderEquippedWeapons(player);
        this._renderPlayerStatsCompact(player);
        this._renderShopGrid(player);
        this._renderOwnedItems(player);
        this._renderSynergies(player);
        this._bindRefreshBtn(player);
    },

    _renderEquippedWeapons(player) {
        const container = document.getElementById('equippedWeapons');
        container.innerHTML = '';
        const ownedWeapons = player.weapons || [{ id: 'pistol', level: 1 }];
        const allWeapons = ShopSystem.allWeapons;
        const maxSlots = player.weaponSlots || 6;

        for (let idx = 0; idx < ownedWeapons.length; idx++) {
            const w = ownedWeapons[idx];
            const def = allWeapons.find(d => d.id === w.id);
            if (!def) continue;
            const level = w.level || 1;
            const isMergeSource = this._mergeSourceIdx === idx;
            const canMergeTarget = isMergeSource ? false : (
                this._mergeSourceIdx !== -1 && this._mergeSourceIdx !== undefined &&
                ownedWeapons[this._mergeSourceIdx] && ownedWeapons[this._mergeSourceIdx].id === w.id
            );

            const div = document.createElement('div');
            div.className = `equipped-weapon-slot filled ${isMergeSource ? 'merge-source' : ''} ${canMergeTarget ? 'merge-target' : ''}`;

            const tagDef = TagSystem.getTagDef(def.tag);
            const tagHtml = tagDef ? `<span class="slot-tag" style="color:${this._tagColor(tagDef.id)}">${tagDef.icon}</span>` : '';

            const quality = w.quality || 'T1';
            const qColor = ShopSystem.qualityDefs[quality] ? ShopSystem.qualityDefs[quality].color : '#aaaaaa';
            const affixHtml = (w.affixes || []).map(a => {
                const adef = ShopSystem.affixDefs[a.id];
                const hlType = w._affixHighlights && w._affixHighlights[a.id];
                const hlClass = hlType ? ` weapon-affix-${hlType}` : '';
                return `<span class="weapon-affix weapon-affix-${quality}${hlClass}" style="border-left: 2px solid ${qColor};">${adef ? adef.icon : '📋'} ${adef ? adef.desc(a.value) : a.id}</span>`;
            }).join('');

            div.innerHTML = `
                ${AssetSystem.weaponIconHTML(def.id)}
                ${tagHtml}
                <span class="slot-level">Lv.${level}</span>
                <span class="slot-reroll" data-idx="${idx}">🔄</span>
                <span class="slot-sell" data-idx="${idx}">✕</span>
                ${affixHtml ? `<div class="weapon-affixes">
                    <div class="weapon-affix-reroll">🔄 重随: 🪙${ShopSystem.getRerollCost(w)}</div>
                    ${affixHtml}
                </div>` : ''}
            `;

            const rerollBtn = div.querySelector('.slot-reroll');
            rerollBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const result = ShopSystem.rerollAffixes(w, player);
                if (result) {
                    this.updateShop(player);
                    this._showShopError(`🔄 词条已重随: 🪙${result.cost}`);
                    ParticleSystem.pickup(player.x, player.y);
                } else {
                    const cost = ShopSystem.getRerollCost(w);
                    this._showShopError(`🪙 金币不足，需要 ${cost}`);
                }
            });

            const sellBtn = div.querySelector('.slot-sell');
            sellBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._sellWeapon(parseInt(sellBtn.dataset.idx), player);
            });

            div.addEventListener('click', (e) => {
                if (e.target.classList.contains('slot-sell')) return;
                this._handleWeaponClick(idx, ownedWeapons, player);
            });

            container.appendChild(div);
        }

        const usedCount = ownedWeapons.length;
        for (let i = usedCount; i < maxSlots; i++) {
            const div = document.createElement('div');
            div.className = 'equipped-weapon-slot empty';
            div.addEventListener('click', () => {
                this._mergeSourceIdx = -1;
                this.updateShop(player);
            });
            container.appendChild(div);
        }
    },

    _handleWeaponClick(idx, ownedWeapons, player) {
        if (this._mergeSourceIdx === -1 || this._mergeSourceIdx === undefined) {
            this._mergeSourceIdx = idx;
            this.updateShop(player);
        } else if (this._mergeSourceIdx === idx) {
            this._mergeSourceIdx = -1;
            this.updateShop(player);
        } else {
            const from = ownedWeapons[this._mergeSourceIdx];
            const to = ownedWeapons[idx];
            if (from && to && from.id === to.id) {
                if (ShopSystem.mergeWeapons(this._mergeSourceIdx, idx)) {
                    this._mergeSourceIdx = -1;
                    this.updateShop(player);
                    ParticleSystem.pickup(player.x, player.y);
                    return;
                }
            }
            this._mergeSourceIdx = idx;
            this.updateShop(player);
        }
    },

    _sellWeapon(idx, player) {
        const weapon = player.weapons[idx];
        const def = weapon ? ShopSystem.allWeapons.find(d => d.id === weapon.id) : null;
        if (ShopSystem.sellWeapon(idx)) {
            this._mergeSourceIdx = -1;
            this.updateShop(player);
            ParticleSystem.pickup(player.x, player.y);
            const refund = def ? Math.floor(def.cost / 2) + 1 : 0;
            this._showShopError(`🗑️ 已卖出 ${def ? def.name : ''}，退款 ${refund} 🪙`);
        }
    },

    _showShopError(msg) {
        const el = document.getElementById('shopError');
        if (!el) return;
        el.textContent = msg;
        el.classList.remove('hidden');
        clearTimeout(this._errorTimer);
        this._errorTimer = setTimeout(() => { el.classList.add('hidden'); }, 2500);
    },

    _renderPlayerStatsCompact(player) {
        const container = document.getElementById('playerStats');
        container.innerHTML = '';
        const titleEl = container.parentElement.querySelector('.panel-title');
        const statList = StatsSystem.getDisplayStats(player);

        // --- 将所有条目（等级、HP、属性）合并为一个数组，一起分页 ---
        const PER_PAGE = 14;
        const allItems = [];

        // 等级（特殊行，带 XP）
        allItems.push({
            _type: 'level',
            icon: '⬆️',
            label: '等级',
            valueHtml: `<span class="stat-value warning">Lv.${player.level}</span><span class="stat-xp">XP ${Math.round(player.xp)}/${player.xpToNext}</span>`
        });

        // HP
        allItems.push({
            _type: 'hp',
            icon: '❤️',
            label: '生命',
            valueHtml: `<span class="stat-value danger">${Math.round(player.hp)}/${Math.round(player.maxHp)}</span>`
        });

        // 其他属性（getDisplayStats 已过滤 deprecated=0）
        for (const st of statList) {
            if (st.id === 'maxHp') continue;
            allItems.push(st);
        }

        // 分页
        const pages = [];
        let cur = [];
        for (const item of allItems) {
            cur.push(item);
            if (cur.length >= PER_PAGE) {
                pages.push(cur);
                cur = [];
            }
        }
        if (cur.length > 0) pages.push(cur);

        // Tab 按钮放入 panel-title，左对齐
        if (titleEl) {
            titleEl.querySelectorAll('.stat-tab-btn').forEach(b => b.remove());
            for (let i = 0; i < pages.length; i++) {
                const btn = document.createElement('button');
                btn.className = 'stat-tab-btn' + (i === 0 ? ' active' : '');
                btn.textContent = (i + 1).toString();
                btn.dataset.tab = String(i);
                btn.addEventListener('click', () => {
                    titleEl.querySelectorAll('.stat-tab-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    body.querySelectorAll('.stat-tab-page').forEach(p => p.classList.remove('active'));
                    body.querySelector(`.stat-tab-page[data-tab="${i}"]`).classList.add('active');
                });
                titleEl.appendChild(btn);
            }
        }

        // 渲染分页内容
        const body = document.createElement('div');
        body.className = 'stat-tab-body';

        for (let ti = 0; ti < pages.length; ti++) {
            const pg = document.createElement('div');
            pg.className = 'stat-tab-page' + (ti === 0 ? ' active' : '');
            pg.dataset.tab = String(ti);

            for (const item of pages[ti]) {
                if (item._type === 'level' || item._type === 'hp') {
                    // 特殊行（等级 / HP）
                    const cls = item._type === 'level' ? 'stat-level-row' : 'stat-item-hp';
                    const div = document.createElement('div');
                    div.className = `stat-item ${cls}`;
                    div.innerHTML = `
                        <span class="stat-icon">${item.icon}</span>
                        <span class="stat-label">${item.label}</span>
                        ${item.valueHtml}
                    `;
                    pg.appendChild(div);
                } else {
                    // 普通属性行
                    const div = document.createElement('div');
                    let cls = '';
                    if (item.pctToCap !== null && item.pctToCap >= 85) cls = 'at-cap';
                    else if (['dodge', 'critChance', 'lifeSteal', 'hpRegen'].includes(item.id)) cls = 'positive';
                    else if (item.id === 'harvesting') cls = 'warning';
                    div.className = 'stat-item';
                    let valueHtml = `<span class="stat-value ${cls}">${item.value}</span>`;
                    if (item.note) valueHtml += `<span class="stat-note">${item.note}</span>`;
                    div.innerHTML = `
                        <span class="stat-icon">${item.icon}</span>
                        <span class="stat-label">${item.label}</span>
                        ${valueHtml}
                    `;
                    pg.appendChild(div);
                }
            }

            body.appendChild(pg);
        }

        container.appendChild(body);
    },

    _renderShopGrid(player) {
        const container = document.getElementById('shopItemsGrid');
        container.innerHTML = '';
        const items = ShopSystem.items;
        if (items.length === 0) {
            container.innerHTML = '<div class="items-empty">暂无商品，点击刷新</div>';
            return;
        }

        const ownedWeaponIds = (player.weapons || []).map(w => w.id);
        const itemCounts = {};
        for (const id of (player.items || [])) { itemCounts[id] = (itemCounts[id] || 0) + 1; }

        for (let idx = 0; idx < items.length; idx++) {
            const item = items[idx];
            const isWeapon = item.type === 'weapon';
            const ownedHas = isWeapon ? ownedWeaponIds.includes(item.id) : (itemCounts[item.id] || 0) > 0;
            const count = isWeapon ? 1 : (itemCounts[item.id] || 0);
            const canAfford = player.materials >= item.cost;

            const div = document.createElement('div');
            div.className = `mixed-card ${isWeapon ? 'weapon-card' : 'item-card'}`;
            if (!canAfford) div.classList.add('too-expensive');
            if (item.locked) div.classList.add('locked-card');

            let qualityBadgeHtml = '';
            if (isWeapon) {
                const rarity = item.rarity || 'common';
                const rDef = ShopSystem.RARITY[rarity];
                if (rDef) {
                    const col = rDef.color;
                    div.style.borderColor = col;
                    div.style.boxShadow = `0 0 10px ${col}22, inset 0 0 6px ${col}11`;
                    qualityBadgeHtml = `<span class="mc-quality-badge" style="color:${col}">${rDef.name}</span>`;
                }
            }

            const typeLabel = isWeapon ? '武器' : '道具';
            const iconHtml = isWeapon ? AssetSystem.weaponIconHTML(item.id) : AssetSystem.itemIconHTML(item.id, 44);
            const tagDef = TagSystem.getTagDef(item.tag);
            const tagHtml = tagDef ? `<div class="mc-tag" style="color:${this._tagColor(tagDef.id)}">${tagDef.icon}${tagDef.name}</div>` : '';
            const countBadge = !isWeapon && count > 0 ? `<span class="mc-count-badge">×${count}</span>` : '';

            const modParts = [];
            if (item.mods) {
                if (item.mods.damageMult) modParts.push(`${item.mods.damageMult > 0 ? '+' : ''}${Math.round(item.mods.damageMult * 100)}%伤害`);
                if (item.mods.attackSpeedMult) modParts.push(`${item.mods.attackSpeedMult > 0 ? '+' : ''}${Math.round(item.mods.attackSpeedMult * 100)}%攻速`);
                if (item.mods.speedMult) modParts.push(`${item.mods.speedMult > 0 ? '+' : ''}${Math.round(item.mods.speedMult * 100)}%移速`);
                if (item.mods.attackRangeMult) modParts.push(`${item.mods.attackRangeMult > 0 ? '+' : ''}${Math.round((item.mods.attackRangeMult - 1) * 100)}%射程`);
            }
            let descText, isStatsGrid;
            if (isWeapon) {
                // 数据驱动武器属性显示（仅非0值，CSS grid 2列，竖直对齐）
                const statParts = [];
                const shopKeys = ['damage_lv1', 'cooldown_lv1', 'attackRange', 'meleeRange', 'bulletCount', 'pierce', 'splashRadius', 'homingStrength', 'burnDps', 'chainCount', 'critChanceAdd', 'critDamageAdd', 'speedMult', 'lifeStealAdd', 'armorAdd', 'maxHpAdd', 'hpRegenAdd', 'knockback', 'sprayCone', 'slowAmount', 'slowDuration', 'healOnHit'];
                for (const key of shopKeys) {
                    const val = item[key];
                    if (val === undefined || val === null || val === 0 || val === '') continue;
                    const def = this._weaponStatDefs.find(d => d.key === key);
                    if (!def) continue;
                    const fmt = _WPN_FMT[key] || (v => v);
                    statParts.push(`<span class="stat-item"><b>${def['中文名']}</b> ${fmt(val)}</span>`);
                }
                isStatsGrid = true;
                descText = `<div class="stats-grid">${statParts.join('\n')}</div>`;
            } else {
                isStatsGrid = false;
                descText = modParts.length > 0 ? modParts.join(' · ') : item.desc;
            }
            const ownedText = isWeapon ? (ownedHas ? `<div class="mc-owned">已装备</div>` : '') : (count > 0 ? `<div class="mc-owned">已持 ×${count}</div>` : '');
            const affixHint = isWeapon ? '<div class="weapon-affixes"><span class="weapon-affix">📋购买后生成1个随机词条</span></div>' : '';

            div.innerHTML = `
                <span class="mc-type-badge">${typeLabel}</span>
                ${qualityBadgeHtml}
                ${countBadge}
                <div class="mc-icon">${iconHtml}</div>
                <div class="mc-name">${item.name}</div>
                ${tagHtml}
                <div class="${isStatsGrid ? 'mc-stats-grid' : 'mc-desc'}">${descText}</div>
                ${ownedText}
                ${affixHint}
                <div class="mc-price-row">
                    <span class="mc-cost">${this._getDisplayCost(player, item.cost)}</span>
                </div>
                <div class="mc-lock-row">
                    <span class="mc-lock ${item.locked ? 'locked' : ''}">${item.locked ? '🔒 已锁定' : '🔓 锁定'}</span>
                </div>
            `;

            const lockEl = div.querySelector('.mc-lock');
            if (lockEl) {
                lockEl.addEventListener('click', (e) => { e.stopPropagation(); ShopSystem.toggleLock(idx); this.updateShop(player); });
            }

            div.addEventListener('click', () => {
                const result = ShopSystem.buyItem(idx, player);
                if (result) { this.updateShop(player); ParticleSystem.pickup(player.x, player.y); }
                else if (ShopSystem._lastBuyError) { this._showShopError(ShopSystem._lastBuyError); ShopSystem._lastBuyError = ''; }
            });

            container.appendChild(div);
        }
    },

    _bindRefreshBtn(player) {
        const refreshBtn = document.getElementById('refreshShopBtn');
        if (!refreshBtn) return;
        const canRefresh = player.materials >= ShopSystem.refreshCost;
        refreshBtn.textContent = `🔄 🪙${ShopSystem.refreshCost}`;
        refreshBtn.className = `refresh-btn ${canRefresh ? '' : 'disabled'}`;
        const newBtn = refreshBtn.cloneNode(true);
        refreshBtn.parentNode.replaceChild(newBtn, refreshBtn);
        newBtn.addEventListener('click', () => {
            if (ShopSystem.refresh()) { this.updateShop(player); ParticleSystem.pickup(player.x, player.y); }
        });
    },

    _renderOwnedItems(player) {
        const container = document.getElementById('ownedItems');
        container.innerHTML = '';
        if (!player.items || player.items.length === 0) {
            container.innerHTML = '<span class="owned-empty">暂无</span>';
            return;
        }
        const countMap = {};
        for (const id of player.items) { countMap[id] = (countMap[id] || 0) + 1; }
        const order = ShopSystem.allItems.map(i => i.id);
        const sortedIds = Object.keys(countMap).sort((a, b) => order.indexOf(a) - order.indexOf(b));
        for (const id of sortedIds) {
            const def = ShopSystem.allItems.find(i => i.id === id);
            if (!def) continue;
            const count = countMap[id];
            const badge = document.createElement('span');
            badge.className = 'owned-item-badge';
            badge.innerHTML = `${AssetSystem.itemIconHTML(def.id)} ${def.name}<span class="owned-item-count">×${count}</span>`;
            container.appendChild(badge);
        }
    },

    _renderSynergies(player) {
        const container = document.getElementById('synergyDisplay');
        if (!container) return;
        container.innerHTML = '';
        const synergies = player._activeSynergies || (player.weapons ? TagSystem.getActiveSynergies(player.weapons) : []);
        if (synergies.length === 0) {
            container.innerHTML = '<span class="shop-synergy-empty">⚡ 暂无激活羁绊</span>';
            return;
        }
        for (const syn of synergies) {
            const div = document.createElement('div');
            div.className = 'shop-synergy-item';
            const color = this._tagColor(syn.tagId);
            div.style.borderColor = color + '44';
            div.innerHTML = `
                <span class="synergy-icon" style="color:${color}">${syn.tagIcon}</span>
                <span class="synergy-name" style="color:${color}">${syn.tagName}</span>
                <span class="synergy-count">${syn.count}/${syn.threshold}</span>
                <span style="color:rgba(255,255,255,0.5);font-size:0.9em">${this._formatSynergyBonus(syn.bonus)}</span>
            `;
            container.appendChild(div);
        }
    },

    showLevelUp() {
        document.getElementById('levelUpOverlay').classList.remove('hidden');
        const p = PlayerSystem.player;
        document.getElementById('levelNum').textContent = p.level;
        const container = document.getElementById('levelUpChoices');
        container.innerHTML = '';
        const options = [...StatsSystem.levelUpOptions].sort(() => Math.random() - 0.5).slice(0, 3);
        for (const opt of options) {
            const div = document.createElement('div');
            div.className = 'levelup-choice';
            div.innerHTML = `
                <div class="levelup-choice-name">${opt.icon} ${opt.name}</div>
                <div class="levelup-choice-desc">${opt.desc}</div>
            `;
            div.addEventListener('click', () => {
                PlayerSystem.applyLevelUp(opt.id);
                document.getElementById('levelUpOverlay').classList.add('hidden');
                ParticleSystem.levelUp(p.x, p.y);
                GameEngine.onLevelUpClosed();
            });
            container.appendChild(div);
        }
    },

    hideLevelUp() {
        document.getElementById('levelUpOverlay').classList.add('hidden');
    },

    _renderHudSynergies(player) {
        const container = document.getElementById('hudSynergies');
        if (!container) return;
        container.innerHTML = '';
        const synergies = player._activeSynergies || (player.weapons ? TagSystem.getActiveSynergies(player.weapons) : []);
        if (synergies.length === 0) return;
        for (const syn of synergies) {
            const div = document.createElement('div');
            div.className = 'hud-synergy-item';
            const color = this._tagColor(syn.tagId);
            div.innerHTML = `
                <span class="synergy-icon" style="color:${color}">${syn.tagIcon}</span>
                <span style="color:${color}">${syn.tagName}</span>
                <span class="synergy-count">${syn.count}/${syn.threshold}</span>
            `;
            container.appendChild(div);
        }
    },

    updateHUD() {
        const p = PlayerSystem.player;
        if (!p) return;

        // HP
        document.getElementById('healthText').textContent = `${Math.ceil(p.hp)}/${Math.ceil(p.maxHp)}`;
        const hpPct = Math.max(0, (p.hp / p.maxHp) * 100);
        document.getElementById('healthBar').style.width = hpPct + '%';

        // EXP
        const xpPct = p.xpToNext > 0 ? (p.xp / p.xpToNext) * 100 : 0;
        document.getElementById('xpBar').style.width = Math.min(100, xpPct) + '%';
        document.getElementById('hudExpPct').textContent = Math.floor(xpPct) + '%';

        // 资源
        document.getElementById('materialCount').textContent = p.materials;

        // 角色等级标识（当前等级数 badge，有可升级时高亮）
        const levelBadge = p.level > 1 ? p.level : 0;
        const el = document.getElementById('hudStatLevelUp');
        if (levelBadge > 0) {
            el.classList.remove('hidden');
            document.getElementById('hudLevelUpCount').textContent = levelBadge;
            // 有可用升级时添加脉冲高亮
            el.classList.toggle('levelup-pending', !!GameEngine.levelUpPending);
        } else {
            el.classList.add('hidden');
        }

        // 宝箱计数（按类型）
        let normalChests = 0, rareChests = 0;
        if (typeof LootSystem !== 'undefined') {
            for (const c of LootSystem.pendingChests) {
                if (!c.alive) continue;
                if (c.type === 'normal') normalChests++;
                else rareChests++;
            }
        }
        const elN = document.getElementById('hudStatChestN');
        if (normalChests > 0) {
            elN.classList.remove('hidden');
            document.getElementById('hudChestNormal').textContent = normalChests;
        } else {
            elN.classList.add('hidden');
        }
        const elR = document.getElementById('hudStatChestR');
        if (rareChests > 0) {
            elR.classList.remove('hidden');
            document.getElementById('hudChestRare').textContent = rareChests;
        } else {
            elR.classList.add('hidden');
        }

        // 关卡
        document.getElementById('levelCount').textContent = WaveSystem.currentLevel;
        // 击杀
        document.getElementById('killCount').textContent = p.kills;

        // 倒计时
        if (WaveSystem.waveActive) {
            const remaining = Math.max(0, WaveSystem.levelDuration - WaveSystem.waveTimer);
            const timerEl = document.getElementById('waveTimer');
            const display = Math.ceil(remaining);
            timerEl.textContent = `${display}`;
            timerEl.className = 'hud-timer';
            if (display <= 10) timerEl.classList.add('urgent');
            if (display <= 5) { timerEl.classList.add('critical'); timerEl.classList.remove('urgent'); }
        }
        this._renderBossBar();
        this._renderHudSynergies(p);

        // 调试面板（数据驱动，由 debug.csv 控制）
        this._renderDebug();
    },

    /** 调试面板：按 group 分组，遍历 debug.csv 中 enabled 的条目并求值显示 */
    _renderDebug() {
        const body = document.querySelector('#hudDebug .debug-body');
        if (!body) return;

        const groups = {};
        for (const d of this._debugEnabled) {
            if (!groups[d.group]) groups[d.group] = [];
            let value = '—';
            try {
                // 在全局作用域中安全求值（WaveSystem / EnemySystem 等都在 window 上）
                value = new Function('return (' + d.expr + ')')();
            } catch (e) {
                value = 'err';
            }
            groups[d.group].push({ label: d.label, value, desc: d.desc });
        }

        const lines = [];
        for (const [groupName, items] of Object.entries(groups)) {
            lines.push(`[${groupName}]`);
            for (const item of items) {
                lines.push(`  ${item.label}: ${item.value}`);
            }
        }
        body.textContent = lines.join('\n');
    },

    /** Boss HP 条 */
    _renderBossBar() {
        const bar = document.getElementById('bossBar');
        if (!bar) return;
        if (typeof BossSystem === 'undefined' || !BossSystem.isActive()) {
            bar.classList.add('hidden');
            return;
        }
        const data = BossSystem.getHpBarData();
        if (!data) { bar.classList.add('hidden'); return; }
        bar.classList.remove('hidden');
        document.getElementById('bossName').textContent = data.name;
        const phaseLabel = data.phaseCount > 1 ? ` (P${data.phaseIndex + 1}/${data.phaseCount} · ${data.phaseName})` : '';
        document.getElementById('bossPhase').textContent = phaseLabel;
        const pct = data.maxHp > 0 ? (data.hp / data.maxHp) * 100 : 0;
        document.getElementById('bossHpFill').style.width = pct + '%';
        document.getElementById('bossHpText').textContent = `${data.hp}/${data.maxHp}`;
    },

    showChestReward() {
        if (typeof LootSystem === 'undefined') return;
        const p = PlayerSystem.player;
        if (!p) return;
        // 找到第一个待拾取宝箱并生成奖励
        const firstChest = LootSystem.pendingChests.find(c => c.alive);
        if (!firstChest) return;
        LootSystem.pickupChest(firstChest, p);
        const rewards = LootSystem.getCurrentRewards();
        if (!rewards || rewards.length === 0) return;

        const overlay = document.getElementById('chestRewardOverlay');
        if (!overlay) return;
        overlay.classList.remove('hidden');
        const container = document.getElementById('chestRewardChoices');
        container.innerHTML = '';
        for (let i = 0; i < rewards.length; i++) {
            const opt = rewards[i];
            const div = document.createElement('div');
            div.className = 'chest-reward-choice';
            let icon = '📦', name = opt.name || opt.id || '奖励', desc = opt.desc || '';
            if (opt.type === 'weapon') { icon = '🗡️'; name = opt.id; }
            else if (opt.type === 'gold') { icon = '🪙'; name = `金币 ×${opt.goldAmount || 0}`; desc = ''; }
            div.innerHTML = `
                <div class="chest-reward-choice-icon">${icon}</div>
                <div class="chest-reward-choice-text">
                    <div class="chest-reward-choice-name">${name}</div>
                    <div class="chest-reward-choice-desc">${desc}</div>
                </div>
            `;
            div.addEventListener('click', () => {
                overlay.classList.add('hidden');
                LootSystem.selectReward(i, p);
                this.updateHUD();
            });
            container.appendChild(div);
        }
    },

    hideChestReward() {
        document.getElementById('chestRewardOverlay').classList.add('hidden');
    }
};
