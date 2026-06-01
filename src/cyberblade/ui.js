// ============================================================
// cyberblade/ui.js - UI系统（角色选择+商店+结算）
// ============================================================
const UISystem = {
    _selectedDifficulty: 0,

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
            if (card.classList.contains('locked')) {
                this._showCharDetail(id);
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
            if (wid) this._confirmWeapon(wid);
        });
        document.getElementById('weaponSelectSkip').addEventListener('click', () => {
            this._confirmWeapon('pistol');
        });
        document.getElementById('weaponSelectBack').addEventListener('click', () => {
            this.showMenu();
        });

        // 难度选择
        document.getElementById('diffGrid').addEventListener('click', (e) => {
            const card = e.target.closest('.diff-card');
            if (!card) return;
            const level = parseInt(card.dataset.diff, 10);
            this._confirmDifficulty(level);
        });
        document.getElementById('diffBack').addEventListener('click', () => {
            this._showWeaponSelect();
        });

        this.updateHUD();
    },

    _showWeaponSelect() {
        const charId = CharacterSystem.selectedCharacterId || 'default';
        const ch = CharacterSystem.allCharacters.find(c => c.id === charId);
        if (!ch) return;

        document.getElementById('charSelectOverlay').classList.add('hidden');
        document.getElementById('weaponSelectOverlay').classList.remove('hidden');

        document.getElementById('weaponSelectHint').textContent =
            `${ch.name} · 选择一个初始武器`;

        const affinities = ch.tags || ch.weaponAffinities || [];
        // 武器标签是旧体系(gun/bow/magic/medic/lance)，将其归一化后与角色标签匹配
        const normalizeWeaponTag = (t) => ({ gun: 'ranged', bow: 'ranged', magic: 'fire', medic: 'tech', lance: 'melee' }[t] || t);
        const basicWeapons = ShopSystem.allWeapons.filter(w =>
            affinities.includes(normalizeWeaponTag(w.tag)) && UnlockSystem.basicWeaponIds.has(w.id)
        );

        const tagOrder = ['melee', 'ranged', 'fire', 'explosive', 'crit', 'tech', 'economy'];
        basicWeapons.sort((a, b) => tagOrder.indexOf(a.tag) - tagOrder.indexOf(b.tag));

        const grid = document.getElementById('weaponSelectGrid');
        grid.innerHTML = '';

        if (basicWeapons.length === 0) {
            const pistol = ShopSystem.allWeapons.find(w => w.id === 'pistol');
            if (pistol) this._renderWeaponCard(grid, pistol);
        } else {
            for (const w of basicWeapons) {
                this._renderWeaponCard(grid, w);
            }
        }
    },

    _renderWeaponCard(container, weapon) {
        const card = document.createElement('div');
        card.className = 'weapon-select-card';
        card.dataset.weaponId = weapon.id;

        const tagDef = TagSystem.getTagDef(weapon.tag);
        const tagHtml = tagDef ? `<span class="ws-tag" style="color:${this._tagColor(tagDef.id)}">${tagDef.icon}${tagDef.name}</span>` : '';

        const statsHtml = `
            <span>⚔️${weapon.damageMult || 1.0}</span>
            <span>⚡${(weapon.attackSpeedMult || 1.0).toFixed(1)}</span>
            <span>🎯${weapon.bulletSpeed || '—'}</span>
            ${weapon.pierce > 0 ? `<span>🔱${weapon.pierce}</span>` : ''}
        `;

        card.innerHTML = `
            <div class="ws-icon">${AssetSystem.weaponIconHTML(weapon.id, 48)}</div>
            <div class="ws-name">${weapon.name}</div>
            ${tagHtml}
            <div class="ws-desc">${weapon.desc}</div>
            <div class="ws-stats">${statsHtml}</div>
        `;

        container.appendChild(card);
    },

    _confirmWeapon(weaponId) {
        this._selectedWeapon = weaponId;
        document.getElementById('weaponSelectOverlay').classList.add('hidden');
        this._showDifficultySelect();
    },

    _showDifficultySelect() {
        document.getElementById('difficultyOverlay').classList.remove('hidden');
        const grid = document.getElementById('diffGrid');
        grid.innerHTML = '';
        for (let i = 0; i < 10; i++) {
            const card = document.createElement('div');
            card.className = `diff-card ${i === this._selectedDifficulty ? 'selected' : ''}`;
            card.dataset.diff = i;
            const labels = ['标准', '★1', '★2', '★3', '★4', '★5', '★6', '★7', '★8', '★9'];
            card.innerHTML = `<div class="diff-num">${i}</div><div class="diff-label">${labels[i]}</div>`;
            grid.appendChild(card);
        }
    },

    _confirmDifficulty(level) {
        this._selectedDifficulty = level;
        document.getElementById('difficultyOverlay').classList.add('hidden');
        GameEngine.startGame(this._selectedWeapon, level);
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

    /** 在详情面板中显示指定角色的信息（含解锁状态） */
    _showCharDetail(id) {
        const ch = CharacterSystem.allCharacters.find(c => c.id === id);
        const detail = document.getElementById('charDetail');
        if (!ch || !detail) return;

        const unlocked = ch.unlocked || UnlockSystem.isCharacterUnlocked(ch.id);
        if (unlocked) {
            const s = ch.stats || {};
            detail.innerHTML = `
                <div class="char-detail-avatar">${AssetSystem.charIconHTML(ch.id, 80)}</div>
                <div class="char-detail-info">
                    <div class="char-detail-name">${ch.name}</div>
                    <div class="char-detail-desc">${ch.desc}</div>
                    <div class="char-detail-stats">
                        <span class="stat-item"><b>HP</b> ${s.maxHp}</span>
                        <span class="stat-item"><b>速度</b> ${s.speed}</span>
                        <span class="stat-item"><b>攻速</b> ${s.attackSpeed}</span>
                        <span class="stat-item"><b>护甲</b> ${s.armor}</span>
                        <span class="stat-item"><b>闪避</b> ${((s.dodge || 0) * 100).toFixed(0)}%</span>
                        <span class="stat-item"><b>暴击</b> ${((s.critChance || 0) * 100).toFixed(0)}%</span>
                        <span class="stat-item"><b>暴伤</b> ${(s.critMultiplier || 2.0).toFixed(1)}x</span>
                        <span class="stat-item"><b>近战</b> ${s.meleeDamage || 0}</span>
                        <span class="stat-item"><b>远攻</b> ${s.rangedDamage || 0}</span>
                        <span class="stat-item"><b>元素</b> ${s.elementalDamage || 0}</span>
                        <span class="stat-item"><b>工程</b> ${s.engineering || 0}</span>
                    </div>
                </div>
            `;
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
        const statList = StatsSystem.getDisplayStats(player);

        const hpDiv = document.createElement('div');
        hpDiv.className = 'stat-item stat-item-hp';
        hpDiv.innerHTML = `
            <span class="stat-icon">❤️</span>
            <span class="stat-label">生命</span>
            <span class="stat-value danger">${Math.round(player.hp)}/${Math.round(player.maxHp)}</span>
        `;
        container.appendChild(hpDiv);

        const compactOrder = ['hpRegen', 'speed', 'armor', 'damage', 'attackSpeed', 'attackRange', 'critChance', 'critMultiplier', 'lifeSteal', 'dodge', 'harvesting', 'luck'];
        for (const id of compactOrder) {
            const st = statList.find(s => s.id === id);
            if (!st) continue;
            const div = document.createElement('div');
            let cls = '';
            if (st.pctToCap !== null && st.pctToCap >= 85) cls = 'at-cap';
            else if (['dodge', 'critChance', 'lifeSteal', 'hpRegen'].includes(st.id)) cls = 'positive';
            else if (st.id === 'harvesting') cls = 'warning';
            div.className = 'stat-item';
            div.innerHTML = `
                <span class="stat-icon">${st.icon}</span>
                <span class="stat-label">${st.label}</span>
                <span class="stat-value ${cls}">${st.value}</span>
            `;
            container.appendChild(div);
        }

        const lvDiv = document.createElement('div');
        lvDiv.className = 'stat-item stat-level-row';
        lvDiv.innerHTML = `
            <span class="stat-icon">⬆️</span>
            <span class="stat-label">等级</span>
            <span class="stat-value warning">Lv.${player.level}</span>
            <span class="stat-xp">XP ${Math.round(player.xp)}/${player.xpToNext}</span>
        `;
        container.appendChild(lvDiv);
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
            const descText = modParts.length > 0 ? modParts.join(' · ') : item.desc;
            const ownedText = isWeapon ? (ownedHas ? `<div class="mc-owned">已装备</div>` : '') : (count > 0 ? `<div class="mc-owned">已持 ×${count}</div>` : '');
            const affixHint = isWeapon ? '<div class="weapon-affixes"><span class="weapon-affix">📋购买后生成1个随机词条</span></div>' : '';

            div.innerHTML = `
                <span class="mc-type-badge">${typeLabel}</span>
                ${qualityBadgeHtml}
                ${countBadge}
                <div class="mc-icon">${iconHtml}</div>
                <div class="mc-name">${item.name}</div>
                ${tagHtml}
                <div class="mc-desc">${descText}</div>
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

        // 升级数量（可升级次数）
        const levelUpCount = GameEngine.levelUpPending ? 1 : 0;
        const el = document.getElementById('hudStatLevelUp');
        if (levelUpCount > 0) {
            el.classList.remove('hidden');
            document.getElementById('hudLevelUpCount').textContent = levelUpCount;
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

        // 调试：敌人生成状态
        const debugEl = document.getElementById('hudDebug');
        if (debugEl) {
            const eTypes = typeof EnemySystem !== 'undefined' ? Object.keys(EnemySystem.types).join(',') : 'N/A';
            const eCount = typeof EnemySystem !== 'undefined' ? EnemySystem.enemies.filter(e => e.alive).length : 0;
            debugEl.textContent = [
                `波次:${WaveSystem.currentLevel} 激活:${WaveSystem.waveActive} 预算:${WaveSystem._remainingBudget}`,
                `倒计时:${Math.ceil(Math.max(0, WaveSystem.levelDuration - WaveSystem.waveTimer))}s`,
                `敌人数:${eCount} 类型数:${Object.keys(EnemySystem.types).length}`,
                `敌人类型:[${eTypes}]`,
            ].join('\n');
        }
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
