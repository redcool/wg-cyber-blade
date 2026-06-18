// ============================================================
// cyberblade/ui.js - UI系统（角色选择+商店+结算）
// ============================================================
// UI中文显示字符串（从 ui_charsData.json 加载，运行时覆盖）
const _UI_STR = {
    // 右侧属性面板前两行专用 label（必须有 fallback，否则 file:// 协议下 JSON 加载失败时显示 undefined）
    stat_label_level: '等级',
    stat_label_hp: '生命',
    toast_save_ok:'💾 存档保存成功', toast_save_fail:'❌ 保存失败',
    toast_load_ok:'📂 存档加载成功', toast_load_none:'📂 没有找到存档',
    toast_export_ok:'📤 存档已导出',
    weapon_select_hint:'{0} · 选择一个初始武器',
    char_fallback_name:'赛博游侠',
    unlock_new_weapon:'🔓 新武器: {0} {1}',
    unlock_new_char:'🔓 新角色: {0} {1}',
    shop_char_info:'⚔️ 赛博游侠',
    shop_empty:'暂无商品，点击刷新',
    type_weapon:'武器', type_item:'道具',
    owned_equipped:'已装备', owned_held:'已持 ×{0}',
    lock_locked:'🔒 已锁定', lock_unlock:'🔓 锁定',
    owned_empty:'暂无',
    synergy_empty:'⚡ 暂无激活羁绊',

    shop_no_gold:'🪙 金币不足，需要 {0}',
    shop_sold:'🗑️ 已卖出 {0}，退款 {1} 🪙',
    shop_no_merge_partner:'无同 id 同级武器可合并',
    reroll_btn:'🔄 重掷',
    levelup_reroll_cost:'（{0} 材料）', levelup_reroll_free:'（免费）',
    mod_damage:'{0}%伤害', mod_attackSpeed:'{0}%攻速',
    mod_moveSpeed:'{0}%移速', mod_range:'{0}%射程',
    gold_label:'金币',
    chest_reward_fallback:'奖励',
    diff_bonus_enemy:'怪物属性 ×{0}',
    diff_bonus_spawn:'刷新速度 ×{0}',
    diff_bonus_elite:'精英每{0}关',
    diff_bonus_boss:'Boss: {0}关',
    diff_bonus_new_enemy:'新增敌人: {0}',
    diff_bonus_none:'无特殊加成',
};
if (typeof DataLoader !== 'undefined') {
    DataLoader.load('ui_charsData').then(d => { if (d) Object.assign(_UI_STR, d); }).catch(() => {});
}

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
            GameEngine.closeShop(false);
        });
        // 无尽模式按钮 (仅第 19 关商店可见)
        const shopEndlessBtn = document.getElementById('shopEndlessBtn');
        if (shopEndlessBtn) {
            shopEndlessBtn.addEventListener('click', () => {
                GameEngine.closeShop(true);  // 标志: 进入无尽模式
            });
        }

        // ESC 暂停 / 继续
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (typeof GameEngine !== 'undefined' && GameEngine.togglePause) {
                    GameEngine.togglePause();
                    e.preventDefault();
                }
            }
        });

        // 中止界面按钮
        document.getElementById('pauseResumeBtn').addEventListener('click', () => {
            if (typeof GameEngine !== 'undefined') GameEngine.resumeGame();
        });
        document.getElementById('pauseNewGameBtn').addEventListener('click', () => {
            if (typeof GameEngine !== 'undefined') GameEngine.newGameFromPause();
        });
        document.getElementById('pauseExitBtn').addEventListener('click', () => {
            if (typeof GameEngine !== 'undefined') GameEngine.exitGame();
        });

        // 通关结算按钮
        document.getElementById('victoryRestartBtn').addEventListener('click', () => {
            // 再来一局 → 复用"新开游戏"路径 (回到角色/武器选择)
            if (typeof GameEngine !== 'undefined' && GameEngine.newGameFromPause) {
                GameEngine.newGameFromPause();
            } else {
                this.showMenu();
            }
        });
        document.getElementById('victoryMenuBtn').addEventListener('click', () => {
            this.showMenu();
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
        // 详情按钮事件（点击武器名字旁边的📊按钮）
        document.getElementById('weaponDetail').addEventListener('click', (e) => {
            const btn = e.target.closest('.wpn-detail-btn');
            if (!btn) return;
            const wid = btn.dataset.weaponId;
            if (wid) this._showWeaponFitPopup(wid);
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
        const charId = CharacterSystem.selectedCharacterId;
        const ch = CharacterSystem.allCharacters.find(c => c.id === charId);
        if (!ch) return;

        document.getElementById('charSelectOverlay').classList.add('hidden');
        document.getElementById('difficultyOverlay').classList.add('hidden');
        document.getElementById('weaponSelectOverlay').classList.remove('hidden');

        document.getElementById('weaponSelectHint').textContent =
            _UI_STR.weapon_select_hint.replace('{0}', ch.name);

        // 安全兜底：如果 basicWeaponIds 为空（UnlockSystem 数据可能尚未加载），尝试重新加载
        if (UnlockSystem.basicWeaponIds.size === 0 && typeof UnlockSystem.loadData === 'function') {
            UnlockSystem.loadData();
        }

        // 标签归一化函数（武器 tag 是原始值如 gun/bow/magic，角色 tags 已在 character.js 被 normalizeTag 转换）
        const normTag = typeof TagSystem !== 'undefined' && TagSystem.normalizeTag
            ? (t) => TagSystem.normalizeTag(t) : (t) => t;

        // 收集所有基础武器
        this._weaponNormTag = normTag;
        this._weaponAllBasic = ShopSystem.allWeapons.filter(w =>
            UnlockSystem.basicWeaponIds.has(w.id)
        );

        // 收集基础武器的所有规范标签（作为过滤选项）
        const allTags = [...new Set(this._weaponAllBasic.map(w => normTag(w.tag)).filter(Boolean))];
        allTags.sort((a, b) => {
            const order = ['melee', 'ranged', 'fire', 'explosive', 'crit', 'tech', 'economy'];
            return order.indexOf(a) - order.indexOf(b);
        });
        this._weaponFilterTags = ['all', ...allTags];
        this._weaponFilterTag = 'all';

        // 优先选中角色初始武器（从全量基础武器中找）
        const startWp = ch.startingWeapons && ch.startingWeapons.length > 0 ? ch.startingWeapons[0] : null;
        const pickFrom = this._weaponAllBasic;
        this._selectedWeaponId = startWp && pickFrom.some(w => w.id === startWp)
            ? startWp
            : pickFrom.length > 0 ? pickFrom[0].id : 'pistol';

        // 顶部详情面板
        this._showWeaponDetail(this._selectedWeaponId);

        // 渲染过滤标签栏
        this._renderWeaponFilterTabs();

        // 渲染武器网格
        this._refreshWeaponGrid();
    },

    /** 渲染武器过滤标签栏 */
    _renderWeaponFilterTabs() {
        const container = document.getElementById('weaponFilterTabs');
        if (!container) return;
        container.innerHTML = '';
        for (const tag of this._weaponFilterTags) {
            const label = tag === 'all' ? '全部'
                : (TagSystem.getTagDef ? TagSystem.getTagDef(tag)?.name || tag : tag);
            const el = document.createElement('span');
            el.className = 'weapon-filter-tab' + (tag === this._weaponFilterTag ? ' active' : '');
            el.dataset.tag = tag;
            el.textContent = label;
            el.addEventListener('click', () => {
                this._weaponFilterTag = tag;
                this._refreshWeaponGrid();
            });
            container.appendChild(el);
        }
    },

    /** 根据当前过滤标签刷新武器网格 */
    _refreshWeaponGrid() {
        const grid = document.getElementById('weaponSelectGrid');
        if (!grid) return;
        grid.innerHTML = '';

        // 应用过滤
        let weapons = this._weaponAllBasic || [];
        if (this._weaponFilterTag && this._weaponFilterTag !== 'all') {
            const normTag = this._weaponNormTag;
            weapons = weapons.filter(w => normTag(w.tag) === this._weaponFilterTag);
        }

        // 按规范标签排序（分组显示）
        const tagOrder = ['melee', 'ranged', 'fire', 'explosive', 'crit', 'tech', 'economy'];
        weapons.sort((a, b) => {
            const ai = tagOrder.indexOf(this._weaponNormTag(a.tag));
            const bi = tagOrder.indexOf(this._weaponNormTag(b.tag));
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });

        // 如果当前选中武器不在列表中，重置到第一个
        if (this._selectedWeaponId && !weapons.some(w => w.id === this._selectedWeaponId)) {
            this._selectedWeaponId = weapons.length > 0 ? weapons[0].id : 'pistol';
            this._showWeaponDetail(this._selectedWeaponId);
        }

        // 渲染网格
        if (weapons.length === 0) {
            const pistol = ShopSystem.allWeapons.find(w => w.id === 'pistol');
            if (pistol) this._renderWeaponIcon(grid, pistol, true);
        } else {
            for (const w of weapons) {
                this._renderWeaponIcon(grid, w, w.id === this._selectedWeaponId);
            }
        }

        // 更新标签栏高亮
        document.querySelectorAll('.weapon-filter-tab').forEach(el => {
            el.classList.toggle('active', el.dataset.tag === this._weaponFilterTag);
        });
    },

    /**
     * 武器属性的 tier 解析 (代理 WeaponDisplay.getWeaponTierValue)
     * 保留为 UISystem 方法以便旧代码可继续调用
     */
    _getWeaponTierValue(weapon, key) {
        return WeaponDisplay.getWeaponTierValue(weapon, key);
    },

    /** 适配判定 (代理 WeaponDisplay.isWeaponNotPreferred) */
    _isWeaponNotPreferred(weapon, ch) {
        return WeaponDisplay.isWeaponNotPreferred(weapon, ch);
    },

    _showWeaponDetail(weaponId) {
        const weapon = ShopSystem.allWeapons.find(w => w.id === weaponId);
        const detail = document.getElementById('weaponDetail');
        if (!weapon || !detail) return;

        const tagDef = TagSystem.getTagDef(weapon.tag);
        const tagStr = tagDef ? `${tagDef.icon} ${tagDef.name}` : weapon.tag || '—';
        const tagColor = tagDef ? this._tagColor(tagDef.id) : '#ffffff';

        // 武器类别 Class 显示
        const cache = typeof DataLoader !== 'undefined' && DataLoader._cache;
        const classDefs = (cache && cache.classes) || [];
        const weaponClass = classDefs.find(c => c.id === weapon.class);
        const classStr = weaponClass ? `⚜ ${weaponClass['中文名']}` : weapon.class || '';

        // Bug2: 适配警告 — 刺客(偏好 Blade/Precise) + 长枪(Heavy/pike) 之类
        const charId = CharacterSystem.selectedCharacterId;
        const ch = CharacterSystem.allCharacters.find(c => c.id === charId);
        const notPreferred = ch ? WeaponDisplay.isWeaponNotPreferred(weapon, ch) : false;
        const fitScore = ch ? WeaponDisplay.getWeaponFitScore(weapon, ch) : 0.5;
        // fit-0/50/100 → CSS 类
        const fitCls = `fit-${fitScore === 1 ? '100' : (fitScore === 0.5 ? '50' : '0')}`;
        const warnBadge = notPreferred
            ? `<span class="warn-badge" title="${_UI_STR.weapon_not_preferred || '非偏好武器'}">⚠ ${_UI_STR.weapon_not_preferred || '非偏好武器'}</span>`
            : '';

        // 构建属性列表（数据驱动，非0即显示，2列）
        const statLines = [];
        for (const def of this._weaponStatDefs) {
            // Bug1 修复: damage_lv1 / cooldown_lv1 用 tier-aware 解析
            const val = (def.key === 'damage_lv1' || def.key === 'cooldown_lv1')
                ? WeaponDisplay.getWeaponTierValue(weapon, def.key)
                : weapon[def.key];
            const cond = _WPN_COND[def.key];
            const shouldShow = cond ? cond(val) : (val !== undefined && val !== 0 && val !== null && val !== '');
            if (!shouldShow) continue;
            const fmt = _WPN_FMT[def.key] || (v => v);
            statLines.push(`<span class="stat-item"><b>${def['中文名']}</b> ${fmt(val)}</span>`);
        }
        // 适配度进度条
        const fitPct = fitScore === 1 ? '100' : (fitScore === 0.5 ? '50' : '0');
        const fitColors = { '0': '#ff4444', '50': '#ffaa00', '100': '#44cc44' };
        const fitLabel = { '0': '不推荐', '50': '部分适配', '100': '完美适配' };
        const fitBar = `
            <div style="margin-top:6px">
                <div class="wd-fit-label">角色适配度 <span class="fit-${fitPct}" style="color:${fitColors[fitPct]}">${fitLabel[fitPct]}</span></div>
                <div class="wd-fit-bar"><div class="wd-fit-fill fit-${fitPct}"></div></div>
            </div>`;

        const wsLvl = weapon.minLevel || 1;
        const wsLvlEntry = RarityColorSystem.getByLevel(wsLvl);
        const wsLvlColor = wsLvlEntry ? wsLvlEntry.color : '#00ffff';
        const wsRgb = this._hexToRgb(wsLvlColor);
        const wsBorder = `rgba(${wsRgb.r},${wsRgb.g},${wsRgb.b},0.5)`;
        const wsBg = `rgba(${wsRgb.r},${wsRgb.g},${wsRgb.b},0.12)`;

        detail.innerHTML = `
            <div class="weapon-detail-avatar" style="border-color:${wsBorder};background:${wsBg}">${AssetSystem.weaponIconHTML(weapon.id, 72)}</div>
            <div class="weapon-detail-info">
                <div class="weapon-detail-name">${weapon.name}<span class="ws-level-badge">${wsLvl}</span><span class="wpn-detail-btn" data-weapon-id="${weapon.id}" title="查看详细属性与适配度">📊</span></div>
                <div class="weapon-detail-tag" style="color:${tagColor}">${tagStr}${classStr ? ' · ' + classStr : ''}${warnBadge}</div>
                ${fitBar}
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

    /** 武器选择界面：弹出详细属性+适配度面板 (复用 weaponDetailModal) */
    _showWeaponFitPopup(weaponId) {
        const weapon = ShopSystem.allWeapons.find(w => w.id === weaponId);
        if (!weapon) return;

        // 填充 Icon + 名称
        document.getElementById('wdIcon').innerHTML = AssetSystem.weaponIconHTML(weapon.id, 48);
        document.getElementById('wdName').textContent = weapon.name;

        // 品质
        const tagDef = TagSystem.getTagDef(weapon.tag);
        const qualityColors = {
            common: { c: '#9e9e9e', label: '普通' }, uncommon: { c: '#4caf50', label: '罕见' },
            rare: { c: '#2196f3', label: '稀有' }, epic: { c: '#9c27b0', label: '史诗' },
            legendary: { c: '#ff9800', label: '传说' },
        };
        const qKey = weapon.rarity || weapon.quality || 'common';
        const q = qualityColors[qKey] || qualityColors.common;
        const qEl = document.getElementById('wdQuality');
        qEl.textContent = q.label;
        qEl.style.color = q.c;
        qEl.style.borderColor = q.c;
        const fitLvl = weapon.minLevel || 1;
        const fitLvlEntry = RarityColorSystem.getByLevel(fitLvl);
        const fitLvlEl = document.getElementById('wdLevel');
        fitLvlEl.textContent = `Lv.${fitLvl}`;
        fitLvlEl.style.color = fitLvlEntry ? fitLvlEntry.color : '#ffd54f';

        // 统计属性
        const statsRows = [];
        const fmt = (v, suffix = '') => v == null || v === '—' ? '—' : `${v}${suffix}`;
        const dmg = WeaponDisplay.getWeaponTierValue(weapon, 'damage_lv1');
        const cd  = WeaponDisplay.getWeaponTierValue(weapon, 'cooldown_lv1');
        const rng = weapon.attackRange || 0;
        const kbg = weapon.knockback != null ? weapon.knockback : '—';
        statsRows.push(`<div class="wd-stat-row"><span class="wd-stat-label">⚔️ 伤害</span><span class="wd-stat-value dmg">${fmt(dmg)}</span></div>`);
        statsRows.push(`<div class="wd-stat-row"><span class="wd-stat-label">⏱ 冷却</span><span class="wd-stat-value cd">${fmt(cd, 's')}</span></div>`);
        statsRows.push(`<div class="wd-stat-row"><span class="wd-stat-label">📏 射程</span><span class="wd-stat-value rng">${fmt(rng)}</span></div>`);
        statsRows.push(`<div class="wd-stat-row"><span class="wd-stat-label">💥 击退</span><span class="wd-stat-value">${fmt(kbg)}</span></div>`);
        if (weapon.bulletSpeed) statsRows.push(`<div class="wd-stat-row"><span class="wd-stat-label">🚀 弹速</span><span class="wd-stat-value spd">${fmt(weapon.bulletSpeed)}</span></div>`);
        if (weapon.bulletCount) statsRows.push(`<div class="wd-stat-row"><span class="wd-stat-label">🔢 弹数</span><span class="wd-stat-value">${fmt(weapon.bulletCount)}</span></div>`);
        if (weapon.pierce) statsRows.push(`<div class="wd-stat-row"><span class="wd-stat-label">🎯 穿透</span><span class="wd-stat-value">${fmt(weapon.pierce)}</span></div>`);
        if (tagDef) statsRows.push(`<div class="wd-stat-row"><span class="wd-stat-label">🏷 标签</span><span class="wd-stat-value tag">${tagDef.icon} ${tagDef.name || weapon.tag}</span></div>`);
        document.getElementById('wdStats').innerHTML = statsRows.join('');

        // 特殊效果区域 → 改为显示适配度
        const charId = CharacterSystem.selectedCharacterId;
        const ch = CharacterSystem.getCharacterDef(charId);
        let specialHtml = '';
        if (ch) {
            const score = WeaponDisplay.getWeaponFitScore(weapon, ch);
            const pct = score === 1 ? '100' : (score === 0.5 ? '50' : '0');
            const fitColors = { '0': '#ff4444', '50': '#ffaa00', '100': '#44cc44' };
            const fitLabel = { '0': '不推荐', '50': '部分适配', '100': '完美适配' };
            // Class 显示
            const classDefs = (typeof DataLoader !== 'undefined' && DataLoader._cache && DataLoader._cache.classes) || [];
            const wClass = classDefs.find(c => c.id === weapon.class);
            const c2Def = classDefs.find(c => c.id === weapon.class_2);
            const classInfo = [];
            if (wClass) classInfo.push(`⚜ ${wClass['中文名']} (${weapon.class})`);
            if (c2Def) classInfo.push(`└ ${c2Def['中文名']} (${weapon.class_2})`);
            const prefer1 = ch.preferredClasses || [];
            const prefer2 = ch.preferredClasses_2 || [];
            const classMatch = weapon.class && prefer1.includes(weapon.class) ? '✅' : '❌';
            const subMatch  = weapon.class_2 && prefer2.includes(weapon.class_2) ? '✅' : '❌';

            specialHtml = `
                <div style="margin:8px 0 0;padding:8px;background:rgba(255,255,255,0.03);border-radius:6px">
                    <div style="display:flex;justify-content:space-between;font-size:0.85em;margin-bottom:4px">
                        <span>角色适配度</span>
                        <span style="color:${fitColors[pct]};font-weight:600">${fitLabel[pct]}</span>
                    </div>
                    <div class="wd-fit-bar"><div class="wd-fit-fill fit-${pct}"></div></div>
                    <div style="margin-top:6px;font-size:0.8em;color:rgba(255,255,255,0.6)">
                        ${classMatch} 主分类 ${weapon.class || '—'} ${prefer1.length ? `(偏好: ${prefer1.join(', ')})` : ''}<br>
                        ${subMatch} 细分类 ${weapon.class_2 || '—'} ${prefer2.length ? `(偏好: ${prefer2.join(', ')})` : ''}
                    </div>
                </div>`;
        }
        document.getElementById('wdSpecial').innerHTML = specialHtml;

        // 隐藏商店按钮，显示取消
        document.getElementById('wdBtnSell').style.display = 'none';
        document.getElementById('wdBtnMerge').style.display = 'none';
        document.getElementById('wdBtnCancel').textContent = '关闭';
        document.getElementById('wdBtnCancel').style.display = '';

        // === 伤害计算（从角色定义构建临时玩家对象） ===
        const playerProxy = {
            tags: ch && ch.tags ? ch.tags : [],
            preferredClasses: ch && ch.preferredClasses ? ch.preferredClasses : [],
            preferredClasses_2: ch && ch.preferredClasses_2 ? ch.preferredClasses_2 : [],
            damagePercent: ch ? (ch.damagePercent || 0) : 0,
            meleeDamage: ch ? (ch.meleeDamage || 0) : 0,
            rangedDamage: ch ? (ch.rangedDamage || 0) : 0,
            elementalDamage: ch ? (ch.elementalDamage || 0) : 0,
        };
        this._renderDamageBreakdown(weapon, playerProxy, weapon.minLevel || 1);

        // 绑定关闭
        const modal = document.getElementById('weaponDetailModal');
        const closeModal = () => modal.classList.add('hidden');
        document.getElementById('wdBtnCancel').onclick = closeModal;
        document.getElementById('wdClose').onclick = closeModal;

        modal.classList.remove('hidden');
    },

    /** 伤害计算细分面板（共享方法，商店/选择界面共用） */
    _renderDamageBreakdown(def, player, level) {
        const old = document.getElementById('wdDmgBreakdown');
        if (old) old.remove();
        if (typeof FormulaSystem === 'undefined' || !FormulaSystem._calcBaseDamage) return;
        try {
            const bDmg = FormulaSystem._calcBaseDamage(def, player, level || 1);
            const fDmg = 0;
            const pMult = FormulaSystem._calcPercentMultiplier(player);
            const tag = def ? (def.tag || '') : '';
            const tagMatched = FormulaSystem._isTagMatched(player, tag);
            const tagMult = tagMatched ? 1.0 : FormulaSystem.UNMATCHED_MULT;
            const classMult = FormulaSystem._calcClassFitMult(player, def);
            const combinedMult = pMult * tagMult * classMult;
            const effDmg = Math.max(1, Math.round((bDmg + fDmg) * combinedMult));
            if (bDmg <= 0 && fDmg <= 0) return;
            const el = document.getElementById('wdStats');
            if (!el) return;
            el.insertAdjacentHTML('afterend',
                `<div id="wdDmgBreakdown" class="wd-dmg-breakdown"><div class="wd-dmg-breakdown-title">📐 伤害计算</div>
                <div class="wd-dmg-breakdown-row"><span>武器基础</span><span>${bDmg.toFixed(1)}</span></div>
                ${fDmg > 0 ? `<div class="wd-dmg-breakdown-row"><span>角色加成</span><span class="dmg">+${fDmg.toFixed(1)}</span></div>` : ''}
                <div class="wd-dmg-breakdown-row"><span>伤害倍率</span><span>×${(pMult * 100).toFixed(0)}%</span></div>
                ${!tagMatched ? `<div class="wd-dmg-breakdown-row" style="color:#f88"><span>标签惩罚</span><span>×${(tagMult * 100).toFixed(0)}%</span></div>` : ''}
                ${classMult < 1.0 ? `<div class="wd-dmg-breakdown-row" style="color:#f88"><span>职业适配</span><span>×${(classMult * 100).toFixed(0)}%</span></div>` : ''}
                <div class="wd-dmg-breakdown-row wd-dmg-breakdown-total"><span>有效伤害</span><span class="dmg">${effDmg}</span></div>
                </div>`
            );
        } catch (e) {
            // 静默跳过
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

    /** 工具: 将 #RRGGBB 颜色解析为 {r,g,b} 对象 */
    _hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b };
    },

    /** 渲染武器图标卡片（纯图标，点击后详情面板展示属性） */
    _renderWeaponIcon(container, weapon, selected) {
        const card = document.createElement('div');
        card.className = `weapon-select-card ${selected ? 'selected' : ''}`;
        card.dataset.weaponId = weapon.id;
        const cardLvl = weapon.minLevel || 1;
        const cardLvlEntry = RarityColorSystem.getByLevel(cardLvl);
        const cardLvlColor = cardLvlEntry ? cardLvlEntry.color : '#ffffff';
        const rgb = this._hexToRgb(cardLvlColor);
        card.innerHTML = `<div class="ws-icon">${AssetSystem.weaponIconHTML(weapon.id, 42)}</div><span class="ws-card-level">${cardLvl}</span>`;
        card.style.background = `rgba(${rgb.r},${rgb.g},${rgb.b},0.08)`;
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
        if (d.enemyMult > 1) bonuses.push(_UI_STR.diff_bonus_enemy.replace('{0}', d.enemyMult.toFixed(1)));
        if (d.spawnRate > 1) bonuses.push(_UI_STR.diff_bonus_spawn.replace('{0}', d.spawnRate.toFixed(1)));
        if (d.eliteInterval > 0) bonuses.push(_UI_STR.diff_bonus_elite.replace('{0}', d.eliteInterval));
        if (d.bossWaves && d.bossWaves.length > 0) bonuses.push(_UI_STR.diff_bonus_boss.replace('{0}', d.bossWaves.join('、')));
        if (d.newEnemyTypes && d.newEnemyTypes.length > 0) {
            // 从 enemies 数据查找中文名
            const enemyDefs = this._getEnemyDefs();
            const names = d.newEnemyTypes.map(eid => {
                const def = enemyDefs.find(e => e.id === eid);
                return def ? def.name : eid;
            });
            bonuses.push(_UI_STR.diff_bonus_new_enemy.replace('{0}', names.join('、')));
        }
        if (bonuses.length === 0) bonuses.push(_UI_STR.diff_bonus_none);

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
        document.getElementById('pauseOverlay').classList.add('hidden');
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
                    this._showToast(_UI_STR.toast_save_ok);
                } else {
                    this._showToast(_UI_STR.toast_save_fail);
                }
            });
        }

        const loadBtn = document.getElementById('loadBtn');
        if (loadBtn) {
            loadBtn.addEventListener('click', () => {
                if (typeof SaveSystem !== 'undefined' && SaveSystem.load()) {
                    this._renderCharSelect();
                    this._showToast(_UI_STR.toast_load_ok);
                } else {
                    this._showToast(_UI_STR.toast_load_none);
                }
            });
        }

        const exportBtn = document.getElementById('exportSaveBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                if (typeof SaveSystem !== 'undefined') {
                    SaveSystem.exportToFile();
                    this._showToast(_UI_STR.toast_export_ok);
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
            // 载入被动数据
            const cache = typeof DataLoader !== 'undefined' && DataLoader._cache;
            const bundle = typeof window !== 'undefined' && window.__DATA_BUNDLE__;
            const passivesData = (bundle && bundle.passives) || (cache && cache.passives) || [];
            const passiveMap = {};
            for (const p of passivesData) passiveMap[p.id] = p;
            const passiveHTML = (ch.passives || []).map(pId => {
                const pDef = passiveMap[pId];
                if (!pDef) return '';
                return `<div class="char-passive-item"><span class="char-passive-icon">${pDef.icon}</span><span class="char-passive-name">${pDef.name}</span><span class="char-passive-desc">${pDef.desc}</span></div>`;
            }).filter(Boolean).join('');
            const passivesSection = passiveHTML ? `<div class="char-detail-passives"><div class="char-detail-section-title">被动技能</div>${passiveHTML}</div>` : '';

            // 构建武器适配度展示（截断长列表防撑高布局）
            const classDefs = (cache && cache.classes) || (bundle && bundle.classes) || [];
            const prefClasses = ch.preferredClasses || [];
            const prefSubs = ch.preferredClasses_2 || [];
            const MAX_SUBS = 12;
            let affinityHTML = '';
            if (prefClasses.length > 0 || prefSubs.length > 0) {
                const classNames = prefClasses.map(cId => {
                    const d = classDefs.find(c => c.id === cId);
                    return d ? `${d['中文名']}(${cId})` : cId;
                }).join(' / ');
                const subsDisplay = prefSubs.length > MAX_SUBS
                    ? prefSubs.slice(0, MAX_SUBS).join(' · ') + ` … 共${prefSubs.length}种`
                    : prefSubs.join(' · ');
                affinityHTML = `<div class="char-detail-affinities"><div class="char-detail-section-title">适配武器</div>
                    <div class="char-affinity-item"><span style="color:#ffcc66">${classNames}</span></div>
                    ${subsDisplay ? `<div class="char-affinity-item" style="font-size:0.85em;color:rgba(255,255,255,0.5);margin-top:2px">${subsDisplay}</div>` : ''}
                </div>`;
            }

            detail.innerHTML = `
                <div class="char-detail-avatar">${AssetSystem.charIconHTML(ch.id, 80)}</div>
                <div class="char-detail-info">
                    <div class="char-detail-name">${ch.name}</div>
                    <div class="char-detail-desc">${ch.desc}</div>
                    <div class="char-detail-stats">
                        ${this._buildCharStatLines(ch)}
                    </div>
                    ${affinityHTML}
                    ${passivesSection}
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
                if (cond.type === 'maxLevel') unlockDesc = _UI_STR.unlock_level.replace('{0}', cond.value);
                else if (cond.type === 'totalKills') unlockDesc = _UI_STR.unlock_kills.replace('{0}', cond.value);
            }
            detail.innerHTML = `
                <div class="char-detail-avatar locked">🔒</div>
                <div class="char-detail-info">
                    <div class="char-detail-name locked">???</div>
                    <div class="char-detail-desc">${unlockDesc || _UI_STR.unlock_locked}</div>
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
     * 攻速 = 1/cooldown (高=快), 射程 = attackRange
     */
    _getWeaponRadarValues(w) {
        const radarDmg   = WeaponDisplay.getWeaponTierValue(w, 'damage_lv1');
        const radarCd    = WeaponDisplay.getWeaponTierValue(w, 'cooldown_lv1');
        return {
            damage:      radarDmg,
            attackSpeed: radarCd > 0 ? +(1 / radarCd).toFixed(2) : 1,
            bulletSpeed: w.bulletSpeed || 0,
            range:       w.attackRange || 0,
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
            CharacterSystem.allCharacters.find(c => c.id === CharacterSystem.selectedCharacterId)?.name || _UI_STR.char_fallback_name : _UI_STR.char_fallback_name;

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
                    const iconHtml = def ? AssetSystem.weaponIconHTML(def.id) : '';
                    const wName = def ? def.name : ul.id;
                    div.innerHTML = _UI_STR.unlock_new_weapon.replace('{0}', iconHtml).replace('{1}', wName);
                } else if (ul.type === 'character') {
                    const def = CharacterSystem.allCharacters.find(c => c.id === ul.id);
                    const iconHtml = def ? AssetSystem.charIconHTML(def.id) : '';
                    const cName = def ? def.name : ul.id;
                    div.innerHTML = _UI_STR.unlock_new_char.replace('{0}', iconHtml).replace('{1}', cName);
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

    /**
     * 通关结算界面 (第 20 关 boss 死亡 + 非无尽模式)
     * 复用 gameOverOverlay 风格的 finalWeapons / finalKills / finalMaterials 展示
     * 不同点: 标题"系统通关!"、绿色胜利色、"再来一局"+"返回主菜单" 双按钮
     */
    showVictory() {
        const p = PlayerSystem.player;
        const result = UnlockSystem.endSession();

        // 隐藏所有其他 overlay
        ['menuOverlay', 'gameOverOverlay', 'shopOverlay', 'levelUpOverlay',
         'charSelectOverlay', 'difficultyOverlay', 'weaponSelectOverlay',
         'pauseOverlay', 'victoryOverlay', 'chestRewardOverlay'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });

        const overlay = document.getElementById('victoryOverlay');
        if (overlay) overlay.classList.remove('hidden');
        document.getElementById('hud').classList.add('hidden');

        // 填充统计
        document.getElementById('victoryLevel').textContent = WaveSystem.currentLevel || 20;
        document.getElementById('victoryKills').textContent = p ? p.kills : 0;
        document.getElementById('victoryMaterials').textContent = p ? p.materials : 0;
        document.getElementById('victoryChar').textContent = CharacterSystem.selectedCharacterId ?
            CharacterSystem.allCharacters.find(c => c.id === CharacterSystem.selectedCharacterId)?.name || _UI_STR.char_fallback_name : _UI_STR.char_fallback_name;

        // 武器展示
        const weaponContainer = document.getElementById('victoryWeapons');
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

        // 新解锁
        const unlockContainer = document.getElementById('victoryUnlocks');
        unlockContainer.innerHTML = '';
        if (result.newUnlocks && result.newUnlocks.length > 0) {
            unlockContainer.parentElement.classList.remove('hidden');
            for (const ul of result.newUnlocks) {
                const div = document.createElement('div');
                div.className = 'new-unlock';
                if (ul.type === 'weapon') {
                    const def = ShopSystem.allWeapons.find(w => w.id === ul.id);
                    const iconHtml = def ? AssetSystem.weaponIconHTML(def.id) : '';
                    const wName = def ? def.name : ul.id;
                    div.innerHTML = _UI_STR.unlock_new_weapon.replace('{0}', iconHtml).replace('{1}', wName);
                } else if (ul.type === 'character') {
                    const def = CharacterSystem.allCharacters.find(c => c.id === ul.id);
                    const iconHtml = def ? AssetSystem.charIconHTML(def.id) : '';
                    const cName = def ? def.name : ul.id;
                    div.innerHTML = _UI_STR.unlock_new_char.replace('{0}', iconHtml).replace('{1}', cName);
                }
                unlockContainer.appendChild(div);
                setTimeout(() => div.classList.add('show'), 100);
            }
        } else {
            unlockContainer.parentElement.classList.add('hidden');
        }
    },

    showShop() {
        const p = PlayerSystem.player;
        if (!p) return;

        document.getElementById('shopOverlay').classList.remove('hidden');
        this._mergeSourceIdx = -1;
        this._errorTimer = null;

        const char = CharacterSystem.allCharacters.find(c => c.id === CharacterSystem.selectedCharacterId);
        document.getElementById('shopCharInfo').innerHTML = `${char ? AssetSystem.charIconHTML(char.id) + ' ' + char.name : _UI_STR.shop_char_info}`;
        document.getElementById('shopLevel').textContent = WaveSystem.currentLevel || 1;

        // 第 19 关商店: 显示"无尽模式"按钮 (允许跳过 20 关的通关判定,进入无尽挑战)
        const endlessBtn = document.getElementById('shopEndlessBtn');
        if (endlessBtn) {
            if (WaveSystem.currentLevel === WaveSystem.MAX_LEVEL - 1) {
                endlessBtn.classList.remove('hidden');
            } else {
                endlessBtn.classList.add('hidden');
            }
        }

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
                case 'damagePercent': parts.push(_UI_STR.synergy_damagePercent.replace('{0}', Math.round(val * 100))); break;
                case 'lifeSteal': parts.push(_UI_STR.synergy_lifeSteal.replace('{0}', Math.round(val * 100))); break;
                case 'armor': parts.push(_UI_STR.synergy_armor.replace('{0}', val)); break;
                case 'knockback': parts.push(_UI_STR.synergy_knockback.replace('{0}', val)); break;
                case 'attackRange': parts.push(_UI_STR.synergy_attackRange.replace('{0}', Math.round(val * 100))); break;
                case 'bulletSpeed': parts.push(_UI_STR.synergy_bulletSpeed.replace('{0}', Math.round(val * 100))); break;
                case 'bulletCount': parts.push(_UI_STR.synergy_bulletCount.replace('{0}', val)); break;
                case 'elementalDamage': parts.push(_UI_STR.synergy_elementalDamage.replace('{0}', Math.round(val * 100))); break;
                case 'burnDps': parts.push(_UI_STR.synergy_burnDps.replace('{0}', val)); break;
                case 'burningSpread': parts.push(_UI_STR.synergy_burningSpread); break;
                case 'explosionSize': parts.push(_UI_STR.synergy_explosionSize.replace('{0}', Math.round(val * 100))); break;
                case 'explosionDamage': parts.push(_UI_STR.synergy_explosionDamage.replace('{0}', Math.round(val * 100))); break;
                case 'chainExplosion': parts.push(_UI_STR.synergy_chainExplosion); break;
                case 'critChance': parts.push(_UI_STR.synergy_critChance.replace('{0}', Math.round(val * 100))); break;
                case 'critDamage': parts.push(_UI_STR.synergy_critDamage.replace('{0}', Math.round(val * 100))); break;
                case 'onCritLightning': parts.push(_UI_STR.synergy_onCritLightning); break;
                case 'engineering': parts.push(_UI_STR.synergy_engineering.replace('{0}', val)); break;
                case 'turretCount': parts.push(_UI_STR.synergy_turretCount.replace('{0}', val)); break;
                case 'turretDamage': parts.push(_UI_STR.synergy_turretDamage.replace('{0}', Math.round(val * 100))); break;
                case 'luck': parts.push(_UI_STR.synergy_luck.replace('{0}', val)); break;
                case 'xpGain': parts.push(_UI_STR.synergy_xpGain.replace('{0}', Math.round(val * 100))); break;
                case 'materialGain': parts.push(_UI_STR.synergy_materialGain.replace('{0}', Math.round(val * 100))); break;
                case 'goldToDamage': parts.push(_UI_STR.synergy_goldToDamage); break;
                // 旧兼容
                case 'damageMult': parts.push(_UI_STR.synergy_damageMult.replace('{0}', Math.round(val * 100))); break;
                case 'attackSpeedMult': parts.push(_UI_STR.synergy_attackSpeedMult.replace('{0}', Math.round(val * 100))); break;
                case 'bulletSpeedMult': parts.push(_UI_STR.synergy_bulletSpeedMult.replace('{0}', Math.round(val * 100))); break;
                case 'bulletPierceAdd': parts.push(_UI_STR.synergy_bulletPierceAdd.replace('{0}', val)); break;
                case 'critChanceAdd': parts.push(_UI_STR.synergy_critChanceAdd.replace('{0}', Math.round(val * 100))); break;
                case 'lifeStealAdd': parts.push(_UI_STR.synergy_lifeStealAdd.replace('{0}', Math.round(val * 100))); break;
                case 'critMultiplierAdd': parts.push(_UI_STR.synergy_critMultiplierAdd.replace('{0}', Math.round(val * 100))); break;
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

    showPause() {
        document.getElementById('pauseOverlay').classList.remove('hidden');
    },

    hidePause() {
        document.getElementById('pauseOverlay').classList.add('hidden');
    },

    _getDisplayCost(player, baseCost) {
        // 打折券: player.shopDiscount (1.0=无折扣, 0.8=8折, 取最低折扣叠加)
        const disc = (typeof player.shopDiscount === 'number' && player.shopDiscount > 0 && player.shopDiscount < 1)
            ? player.shopDiscount : 1;
        if (disc < 1) {
            const discCost = Math.max(1, Math.ceil(baseCost * disc));
            return `<span style="text-decoration:line-through;opacity:0.5">🪙${baseCost}</span> <span style="color:#7fff7f">🪙${discCost}</span>`;
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

            // 是否存在可合并伙伴（同 id + 同 level）
            const canQuickMerge = !isMergeSource && ownedWeapons.some((o, j) =>
                j !== idx && o.id === w.id && (o.level || 1) === level
            );

            const div = document.createElement('div');
            div.className = `equipped-weapon-slot filled ${isMergeSource ? 'merge-source' : ''} ${canMergeTarget ? 'merge-target' : ''}`;

            const tagDef = TagSystem.getTagDef(def.tag);
            const tagHtml = tagDef ? `<span class="slot-tag" style="color:${this._tagColor(tagDef.id)}">${tagDef.icon}</span>` : '';
            const lvlEntry = RarityColorSystem.getByLevel(level);
            const lvlColor = lvlEntry ? lvlEntry.color : '#ffcc00';
            const lvlBg    = lvlEntry ? lvlEntry.bg : 'rgba(0,0,0,0.85)';

            div.innerHTML = `
                ${AssetSystem.weaponIconHTML(def.id)}
                ${tagHtml}
                <span class="slot-level" style="color:${lvlColor};border-color:${lvlColor};background:${lvlBg}">Lv.${level}</span>
                <span class="slot-actions" data-idx="${idx}">
                    <button class="slot-dropdown-btn" data-idx="${idx}" title="查看详情">▾</button>
                </span>
            `;

            // ▾ 点击 → 打开武器详情 Modal
            const dropdownBtn = div.querySelector('.slot-dropdown-btn');
            dropdownBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._showWeaponDetailModal(idx, player, ownedWeapons);
            });

            div.addEventListener('click', (e) => {
                if (e.target.closest('.slot-actions')) return;
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

    /**
     * 显示武器详情 Modal (上半详情 + 下半 卖出/合并/取消 按钮)
     * @param {number} idx - 武器在 ownedWeapons 中的索引
     * @param {object} player
     * @param {Array} ownedWeapons - 玩家当前持有的武器列表
     */
    _showWeaponDetailModal(idx, player, ownedWeapons) {
        if (idx < 0 || idx >= ownedWeapons.length) return;
        const w = ownedWeapons[idx];
        const def = ShopSystem.allWeapons.find(d => d.id === w.id);
        if (!def) return;

        const level = w.level || 1;
        // 用 FormulasSystem 计算当前等级的 dmg/cooldown/range/knockback/special
        const stats = (typeof FormulasSystem !== 'undefined' && FormulasSystem.computeWeaponStats)
            ? FormulasSystem.computeWeaponStats(def, level, player)
            : null;

        // === 填充上半详情 ===
        document.getElementById('wdIcon').innerHTML = AssetSystem.weaponIconHTML(def.id, 48);
        document.getElementById('wdName').textContent = def.name;
        const detailLvlEntry = RarityColorSystem.getByLevel(level);
        const detailLvlEl = document.getElementById('wdLevel');
        detailLvlEl.textContent = `Lv.${level}`;
        detailLvlEl.style.color = detailLvlEntry ? detailLvlEntry.color : '#ffd54f';

        // 品质: 从 tagDef 颜色推断 (com/common/rare/epic/legendary)
        const tagDef = TagSystem.getTagDef(def.tag);
        const qualityColors = {
            common:    { c: '#9e9e9e', label: '普通' },
            uncommon:  { c: '#4caf50', label: '罕见' },
            rare:      { c: '#2196f3', label: '稀有' },
            epic:      { c: '#9c27b0', label: '史诗' },
            legendary: { c: '#ff9800', label: '传说' },
        };
        const qKey = def.rarity || def.quality || 'common';
        const q = qualityColors[qKey] || qualityColors.common;
        const qEl = document.getElementById('wdQuality');
        qEl.textContent = q.label;
        qEl.style.color = q.c;
        qEl.style.borderColor = q.c;

        // === 填充 stats 表格 ===
        const statsRows = [];
        const fmt = (v, suffix = '') => v == null || v === '—' ? '—' : `${v}${suffix}`;
        // def 可能字段名不一致:damage / damage_lv1 / baseDamage 等
        const dmgVal = stats?.damage ?? WeaponDisplay.getWeaponTierValue(def, 'damage_lv1') ?? def.damage ?? def.baseDamage ?? 0;
        const cdVal  = stats?.cooldown ?? WeaponDisplay.getWeaponTierValue(def, 'cooldown_lv1') ?? def.cooldown ?? 0;
        const rngVal = stats?.range ?? def.attackRange ?? def.range ?? 0;
        const kbgVal = def.knockback != null ? def.knockback : '—';
        const spdVal = def.bulletSpeed || '—';
        const cntVal = def.bulletCount != null ? def.bulletCount : '—';
        const pieVal = def.pierce != null ? def.pierce : '—';
        const kbRadVal = def.splashRadius || '—';

        statsRows.push(`<div class="wd-stat-row"><span class="wd-stat-label">⚔️ 伤害</span><span class="wd-stat-value dmg">${fmt(dmgVal)}</span></div>`);
        statsRows.push(`<div class="wd-stat-row"><span class="wd-stat-label">⏱ 冷却</span><span class="wd-stat-value cd">${fmt(cdVal, 's')}</span></div>`);
        statsRows.push(`<div class="wd-stat-row"><span class="wd-stat-label">📏 射程</span><span class="wd-stat-value rng">${fmt(rngVal)}</span></div>`);
        statsRows.push(`<div class="wd-stat-row"><span class="wd-stat-label">💥 击退</span><span class="wd-stat-value">${fmt(kbgVal)}</span></div>`);
        if (spdVal !== '—') statsRows.push(`<div class="wd-stat-row"><span class="wd-stat-label">🚀 弹速</span><span class="wd-stat-value spd">${fmt(spdVal)}</span></div>`);
        if (cntVal !== '—') statsRows.push(`<div class="wd-stat-row"><span class="wd-stat-label">🔢 弹数</span><span class="wd-stat-value">${fmt(cntVal)}</span></div>`);
        if (pieVal !== '—') statsRows.push(`<div class="wd-stat-row"><span class="wd-stat-label">🎯 穿透</span><span class="wd-stat-value">${fmt(pieVal)}</span></div>`);
        if (kbRadVal !== '—') statsRows.push(`<div class="wd-stat-row"><span class="wd-stat-label">💣 溅射</span><span class="wd-stat-value">${fmt(kbRadVal)}</span></div>`);
        if (tagDef) statsRows.push(`<div class="wd-stat-row"><span class="wd-stat-label">🏷 标签</span><span class="wd-stat-value tag">${tagDef.icon} ${tagDef.name || def.tag}</span></div>`);
        if (def.behavior) statsRows.push(`<div class="wd-stat-row"><span class="wd-stat-label">🎬 行为</span><span class="wd-stat-value">${def.behavior}</span></div>`);
        document.getElementById('wdStats').innerHTML = statsRows.join('');

        // === 伤害细分 ===
        this._renderDamageBreakdown(def, player, level);

        // === 羁绊加成（先清理旧实例） ===
        const oldSyn = document.getElementById('wdSynergy');
        if (oldSyn) oldSyn.remove();
        const synTag = (typeof TagSystem !== 'undefined' && TagSystem.normalizeTag)
            ? TagSystem.normalizeTag(def.tag) : def.tag;
        const synThresholds = (typeof TagSystem !== 'undefined' && TagSystem.synergyThresholds)
            ? TagSystem.synergyThresholds[synTag] : null;
        if (synThresholds) {
            const weaponTags = player && player.weapons ? TagSystem.countWeaponTags(player.weapons) : {};
            const currentCount = weaponTags[synTag] || 0;
            const synTagDef = TagSystem.getTagDef(synTag);
            const synIcon = synTagDef ? synTagDef.icon : '🏷️';
            const synName = synTagDef ? synTagDef.name : synTag;
            const tierRows = Object.entries(synThresholds)
                .sort(([a], [b]) => parseInt(a) - parseInt(b))
                .map(([tier, bonus]) => {
                    const t = parseInt(tier);
                    const active = currentCount >= t;
                    const bonusText = this._formatSynergyBonus(bonus);
                    return `<div class="wd-syn-tier ${active ? 'wd-syn-active' : 'wd-syn-inactive'}">
                        <span class="wd-syn-tier-label">${tier}件</span>
                        <span class="wd-syn-tier-bonus">${bonusText}</span>
                        ${active ? '<span class="wd-syn-tier-check">✓</span>' : ''}
                    </div>`;
                }).join('');
            // 插入到 wdSpecial 之前
            const specialEl = document.getElementById('wdSpecial');
            if (specialEl) {
                const synDiv = document.createElement('div');
                synDiv.id = 'wdSynergy';
                synDiv.className = 'wd-synergy-block';
                synDiv.innerHTML = `
                    <div class="wd-synergy-title"><span style="color:${this._tagColor(synTag)}">${synIcon} ${synName}</span></div>
                    ${tierRows}
                `;
                specialEl.parentNode.insertBefore(synDiv, specialEl);
            }
        }

        // === 特殊属性 ===
        const specials = [];
        if (def.critChance) specials.push(`💥 暴击率 ${(def.critChance * 100).toFixed(0)}%`);
        if (def.critMultiplier) specials.push(`💢 暴击伤害 ×${def.critMultiplier}`);
        if (def.slowAmount) specials.push(`❄️ 减速 ${(def.slowAmount * 100).toFixed(0)}%/${def.slowDuration || 1}s`);
        if (def.burnDPS) specials.push(`🔥 燃烧 ${def.burnDPS}/s×${def.burnDuration || 1}s`);
        if (def.poisonDPS) specials.push(`☠️ 中毒 ${def.poisonDPS}/s×${def.poisonDuration || 1}s`);
        if (def.lifesteal) specials.push(`🩸 吸血 ${(def.lifesteal * 100).toFixed(0)}%`);
        if (def.splashOnHitOnly) specials.push(`⏱ 击中才炸(不自动爆)`);
        if (def.sprayCone) specials.push(`🌫 扇形锥 ${def.sprayCone}rad`);
        if (def.chainTargets) specials.push(`⚡ 弹射 ${def.chainTargets}目标`);
        if (def.explodeOnDeath) specials.push(`💀 死亡爆炸`);
        if (def.desc) specials.push(def.desc);
        document.getElementById('wdSpecial').innerHTML = specials.length
            ? specials.map(s => `<div>• ${s}</div>`).join('')
            : '<div style="opacity:0.5">无特殊效果</div>';

        // === 适配度进度条 ===
        const charId = CharacterSystem.selectedCharacterId;
        const chDef = CharacterSystem.getCharacterDef(charId);
        if (chDef) {
            const score = WeaponDisplay.getWeaponFitScore(def, chDef);
            const pct = score === 1 ? '100' : (score === 0.5 ? '50' : '0');
            const fitColors = { '0': '#ff4444', '50': '#ffaa00', '100': '#44cc44' };
            const fitLabel = { '0': '不推荐', '50': '部分适配', '100': '完美适配' };
            const existingFit = document.getElementById('wdFitBar');
            if (existingFit) existingFit.remove();
            const fitDiv = document.createElement('div');
            fitDiv.id = 'wdFitBar';
            fitDiv.style.cssText = 'margin:6px 0 0;padding:4px 0;border-top:1px solid rgba(120,200,255,0.1)';
            fitDiv.innerHTML = `
                <div style="display:flex;justify-content:space-between;font-size:0.8em;margin-bottom:2px">
                    <span style="color:rgba(255,255,255,0.5)">角色适配度</span>
                    <span style="color:${fitColors[pct]};font-weight:600">${fitLabel[pct]}</span>
                </div>
                <div class="wd-fit-bar"><div class="wd-fit-fill fit-${pct}"></div></div>
            `;
            const specialEl = document.getElementById('wdSpecial');
            if (specialEl) {
                specialEl.parentNode.insertBefore(fitDiv, specialEl);
            }
        }

        // === 按钮可用性 ===
        const canQuickMerge = ownedWeapons.some((o, j) =>
            j !== idx && o.id === w.id && (o.level || 1) === level);
        // 至少保留 1 把武器 (防 0 武器状态)
        const canSell = ownedWeapons.length > 1;
        const sellBtn = document.getElementById('wdBtnSell');
        const mergeBtn = document.getElementById('wdBtnMerge');
        sellBtn.disabled = !canSell;
        if (!canSell) {
            sellBtn.title = _UI_STR.shop_sell_min || '至少保留 1 把武器';
        } else {
            sellBtn.title = '';
        }
        mergeBtn.disabled = !canQuickMerge;

        // === 绑定按钮事件 (一次性,每次 open 覆盖) ===
        const modal = document.getElementById('weaponDetailModal');
        const closeModal = () => {
            modal.classList.add('hidden');
            sellBtn.onclick = null;
            mergeBtn.onclick = null;
            document.getElementById('wdBtnCancel').onclick = null;
            document.getElementById('wdClose').onclick = null;
        };
        sellBtn.onclick = () => { closeModal(); this._sellWeapon(idx, player); };
        mergeBtn.onclick = () => {
            if (canQuickMerge) { closeModal(); this._quickMergeWeapon(idx, player); }
        };
        document.getElementById('wdBtnCancel').onclick = closeModal;
        document.getElementById('wdClose').onclick = closeModal;

        // === 打开 ===
        modal.classList.remove('hidden');
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
        // 安全检查: ShopSystem.sellWeapon 是单点权威 (防 0 武器状态), 此处不重复检查
        if (ShopSystem.sellWeapon(idx)) {
            this._mergeSourceIdx = -1;
            this.updateShop(player);
            ParticleSystem.pickup(player.x, player.y);
            const refund = def ? Math.floor(def.cost / 2) + 1 : 0;
            this._showShopError(_UI_STR.shop_sold.replace('{0}', def ? def.name : '').replace('{1}', refund));
        }
    },

    /**
     * 一键合并：把 idx 这把武器与任意 同 id + 同 level 的伙伴合并（Brotato 风格）
     */
    _quickMergeWeapon(idx, player) {
        if (ShopSystem.mergeWeaponWithAny(idx, player)) {
            this._mergeSourceIdx = -1;
            this.updateShop(player);
            ParticleSystem.pickup(player.x, player.y);
        } else {
            this._showShopError(_UI_STR.shop_no_merge_partner || '无合并伙伴');
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
        if (!player) return;
        const container = document.getElementById('playerStats');
        container.innerHTML = '';
        const titleEl = container.parentElement.querySelector('.panel-title');
        const statList = StatsSystem.getDisplayStats(player);

        // --- 将所有条目（等级、HP、属性）合并为一个数组，一起分页 ---
        const PER_PAGE = 14;
        const allItems = [];

        // 等级（特殊行，带 XP）— 防御性取值，防止 undefined 显示
        const lv = player.level ?? 1;
        const xpCur = Math.round(player.xp ?? 0);
        const xpNeed = player.xpToNext ?? 25;
        allItems.push({
            _type: 'level',
            icon: '⬆️',
            label: _UI_STR.stat_label_level,
            valueHtml: `<span class="stat-value warning">Lv.${lv}</span><span class="stat-xp">XP ${xpCur}/${xpNeed}</span>`
        });

        // HP — 防御性取值
        const hpCur = Math.round(player.hp ?? player.maxHp ?? 0);
        const hpMax = Math.round(player.maxHp ?? player.hp ?? 1);
        allItems.push({
            _type: 'hp',
            icon: '❤️',
            label: _UI_STR.stat_label_hp,
            valueHtml: `<span class="stat-value danger">${hpCur}/${hpMax}</span>`
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
            container.innerHTML = `<div class="items-empty">${_UI_STR.shop_empty}</div>`;
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

            let rarityBadgeHtml = '';
            if (isWeapon) {
                const rarity = item.rarity || 'common';
                const rDef = ShopSystem.RARITY[rarity];
                if (rDef) {
                    const col = rDef.color;
                    div.style.borderColor = col;
                    div.style.boxShadow = `0 0 10px ${col}22, inset 0 0 6px ${col}11`;
                    rarityBadgeHtml = `<span class="mc-quality-badge" style="color:${col}">${rDef.name}</span>`;
                }
            }

            const typeLabel = isWeapon ? _UI_STR.type_weapon : _UI_STR.type_item;
            const iconHtml = isWeapon ? AssetSystem.weaponIconHTML(item.id) : AssetSystem.itemIconHTML(item.id, 44);
            // 标签统一归一化（确保武器卡片布局一致）
            let tagHtml = '';
            if (isWeapon) {
                const displayTag = (typeof TagSystem !== 'undefined' && TagSystem.normalizeTag)
                    ? TagSystem.normalizeTag(item.tag) : item.tag;
                const tDef = TagSystem.getTagDef(displayTag);
                const tCol = tDef ? this._tagColor(tDef.id) : '#ffffff';
                const tIcn = tDef ? tDef.icon : '🏷️';
                const tNme = tDef ? tDef.name : displayTag;
                tagHtml = `<div class="mc-tag" style="color:${tCol}">${tIcn}${tNme}</div>`;
                const classDefs = (typeof DataLoader !== 'undefined' && DataLoader._cache && DataLoader._cache.classes) || [];
                const wClass = classDefs.find(c => c.id === item.class);
                if (wClass) tagHtml += `<span class="mc-class-badge">⚜${wClass['中文名']}</span>`;
            } else {
                const tDef = TagSystem.getTagDef(item.tag);
                if (tDef) tagHtml = `<div class="mc-tag" style="color:${this._tagColor(tDef.id)}">${tDef.icon}${tDef.name}</div>`;
            }
            const countBadge = !isWeapon && count > 0 ? `<span class="mc-count-badge">×${count}</span>` : '';

            const modParts = [];
            if (item.mods) {
                if (item.mods.damageMult) modParts.push((item.mods.damageMult > 0 ? '+' : '') + _UI_STR.mod_damage.replace('{0}', Math.round(Math.abs(item.mods.damageMult * 100))));
                if (item.mods.attackSpeedMult) modParts.push((item.mods.attackSpeedMult > 0 ? '+' : '') + _UI_STR.mod_attackSpeed.replace('{0}', Math.round(Math.abs(item.mods.attackSpeedMult * 100))));
                if (item.mods.speedMult) modParts.push((item.mods.speedMult > 0 ? '+' : '') + _UI_STR.mod_moveSpeed.replace('{0}', Math.round(Math.abs(item.mods.speedMult * 100))));
                if (item.mods.attackRangeMult) modParts.push((item.mods.attackRangeMult > 0 ? '+' : '') + _UI_STR.mod_range.replace('{0}', Math.round(Math.abs((item.mods.attackRangeMult - 1) * 100))));
            }
            let descText, isStatsGrid;
            if (isWeapon) {
                // 数据驱动武器属性显示（仅非0值，CSS grid 2列，竖直对齐）
                const statParts = [];
                const shopKeys = ['damage_lv1', 'cooldown_lv1', 'attackRange', 'bulletCount', 'pierce', 'splashRadius', 'homingStrength', 'burnDps', 'chainCount', 'critChanceAdd', 'critDamageAdd', 'speedMult', 'lifeStealAdd', 'armorAdd', 'maxHpAdd', 'hpRegenAdd', 'knockback', 'sprayCone', 'slowAmount', 'slowDuration', 'healOnHit', 'killHeal', 'damageReductionAura', 'auraHeal', 'auraRadius'];
                for (const key of shopKeys) {
                    // Bug1 修复: damage_lv1 / cooldown_lv1 用 tier-aware 解析
                    //   例: pike (minLevel=2) damage_lv1=0 是占位, 真实伤害在 damage_lv2=35
                    const val = (key === 'damage_lv1' || key === 'cooldown_lv1')
                        ? WeaponDisplay.getWeaponTierValue(item, key)
                        : item[key];
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
            const ownedText = isWeapon ? (ownedHas ? `<div class="mc-owned">${_UI_STR.owned_equipped}</div>` : '') : (count > 0 ? `<div class="mc-owned">${_UI_STR.owned_held.replace('{0}', count)}</div>` : '');
            // 适配度进度条 (仅武器)
            let fitBarHtml = '';
            if (isWeapon) {
                const charId = CharacterSystem.selectedCharacterId;
                const ch = CharacterSystem.getCharacterDef(charId);
                if (ch) {
                    const score = WeaponDisplay.getWeaponFitScore(item, ch);
                    const pct = score === 1 ? '100' : (score === 0.5 ? '50' : '0');
                    fitBarHtml = `<div class="mc-fit-bar" title="角色适配度 ${pct}%"><div class="mc-fit-fill fit-${pct}"></div></div>`;
                }
            }

            div.innerHTML = `
                <span class="mc-type-badge">${typeLabel}</span>
                ${rarityBadgeHtml}
                ${countBadge}
                <div class="mc-icon">${iconHtml}</div>
                <div class="mc-tag-row">${tagHtml}</div>
                <div class="mc-name">${item.name}</div>
                ${fitBarHtml}
                <div class="${isStatsGrid ? 'mc-stats-grid' : 'mc-desc'}">${descText}</div>
                ${ownedText}
                <div class="mc-price-row">
                    <span class="mc-cost">${this._getDisplayCost(player, item.cost)}</span>
                </div>
                <div class="mc-lock-row">
                    <span class="mc-lock ${item.locked ? 'locked' : ''}">${item.locked ? _UI_STR.lock_locked : _UI_STR.lock_unlock}</span>
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
            container.innerHTML = `<span class="owned-empty">${_UI_STR.owned_empty}</span>`;
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
            container.innerHTML = `<span class="shop-synergy-empty">${_UI_STR.synergy_empty}</span>`;
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
        const cards = LevelUpSystem.getCurrentCards();
        for (const card of cards) {
            const div = document.createElement('div');
            div.className = `levelup-choice tier-${card.tier}`;
            div.dataset.cardId = card.id;

            // 卡片图标：从 levelUpCards 资产目录加载 PNG
            const iconField = card.iconName || card.statField || card.actionType || 'damagePercent';
            const iconWrap = document.createElement('div');
            iconWrap.className = 'levelup-card-icon-wrap';
            const img = document.createElement('img');
            img.className = 'levelup-card-icon';
            img.src = `assets/levelUpCards/${iconField}.png?${typeof CACHE_VER !== 'undefined' ? CACHE_VER : ''}`;
            img.alt = card.name;
            iconWrap.appendChild(img);

            // 卡片内容：左图标 + 右侧信息区（2行）
            div.appendChild(iconWrap);

            const infoWrap = document.createElement('div');
            infoWrap.className = 'levelup-card-info';

            const header = document.createElement('div');
            header.className = 'levelup-card-header';
            const tierBadge = document.createElement('span');
            tierBadge.className = 'levelup-card-tier';
            tierBadge.textContent = card.tier;
            const nameSpan = document.createElement('span');
            nameSpan.className = 'levelup-choice-name';
            nameSpan.textContent = card.name;
            header.appendChild(tierBadge);
            header.appendChild(nameSpan);

            const desc = document.createElement('div');
            desc.className = 'levelup-choice-desc';
            desc.textContent = card.desc || '';

            infoWrap.appendChild(header);
            infoWrap.appendChild(desc);
            div.appendChild(infoWrap);
            div.addEventListener('click', () => {
                LevelUpSystem.applyCard(card.id, p);
                // 10% 生命回复
                if (p.hp > 0) {
                    p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.1));
                }
                StatsSystem.clampPlayer(p);
                document.getElementById('levelUpOverlay').classList.add('hidden');
                if (typeof ParticleSystem !== 'undefined') ParticleSystem.levelUp(p.x, p.y);
                if (typeof AudioSystem !== 'undefined') AudioSystem.play('levelup');
                GameEngine.onLevelUpClosed();
            });
            container.appendChild(div);
        }
        // 重掷按钮
        const rerollDiv = document.createElement('div');
        rerollDiv.className = 'levelup-reroll';
        const rerollCost = LevelUpSystem.getRerollCost();
        const costText = rerollCost > 0 ? _UI_STR.levelup_reroll_cost.replace('{0}', rerollCost) : _UI_STR.levelup_reroll_free;
        rerollDiv.innerHTML = `
            <button class="reroll-btn" id="rerollBtn">
                ${_UI_STR.reroll_btn} ${costText}
            </button>
        `;
        rerollDiv.addEventListener('click', () => {
            const pp = PlayerSystem.player;
            if (!pp) return;
            const cost = LevelUpSystem.getRerollCost();
            if (cost > 0 && (pp.materials || 0) < cost) return;
            const newCards = LevelUpSystem.rerollCards(pp, pp.level);
            if (newCards.length > 0) {
                this.showLevelUp();
            }
        });
        container.appendChild(rerollDiv);
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
                <span class="synergy-name" style="color:${color}">${syn.tagName}</span>
                <span class="synergy-count">${syn.count}/${syn.threshold}</span>
                <span class="hud-synergy-bonus">${this._formatSynergyBonus(syn.bonus)}</span>
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
        document.getElementById('hudLevelDisplay').textContent = 'Lv ' + p.level;

        // 资源
        document.getElementById('materialCount').textContent = p.materials;

        // 角色等级标识（已获得的升级次数 = 累计抽卡奖励数）
        const levelBadge = p.level > 1 ? p.level - 1 : 0;
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
            let icon = '📦', name = opt.name || opt.id || _UI_STR.chest_reward_fallback, desc = opt.desc || '';
            if (opt.type === 'weapon') { icon = '🗡️'; name = opt.id; }
            else if (opt.type === 'gold') { icon = '🪙'; name = `${_UI_STR.gold_label} ×${opt.goldAmount || 0}`; desc = ''; }
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
