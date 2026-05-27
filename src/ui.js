// ============================================================
// ui.js - UI系统（角色选择+商店+结算）
// ============================================================
const UISystem = {
    init() {
        // 开始按钮 → 先打开武器选择界面
        document.getElementById('startBtn').addEventListener('click', () => {
            if (!CharacterSystem.selectedCharacterId) {
                CharacterSystem.selectedCharacterId = 'swordsman';
            }
            this._showWeaponSelect();
        });
        // 重新开始（回到角色选择菜单）
        document.getElementById('restartBtn').addEventListener('click', () => {
            this.showMenu();
        });
        // 继续战斗（商店）
        document.getElementById('shopContinueBtn').addEventListener('click', () => {
            GameEngine.closeShop();
        });

        // 角色选择卡片点击事件（委托）
        document.getElementById('charList').addEventListener('click', (e) => {
            const card = e.target.closest('.char-card');
            if (!card) return;
            const id = card.dataset.charId;
            if (!card.classList.contains('locked') && CharacterSystem.select(id)) {
                // 取消其他选中
                document.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                document.getElementById('startBtn').disabled = false;
            }
        });

        // 武器选择 - 点击卡片
        document.getElementById('weaponSelectGrid').addEventListener('click', (e) => {
            const card = e.target.closest('.weapon-select-card');
            if (!card) return;
            const wid = card.dataset.weaponId;
            if (wid) this._confirmWeapon(wid);
        });
        // 武器选择 - 跳过按钮
        document.getElementById('weaponSelectSkip').addEventListener('click', () => {
            this._confirmWeapon('pistol');
        });

        this.updateHUD();
    },

    /** 显示武器选择界面 */
    _showWeaponSelect() {
        const charId = CharacterSystem.selectedCharacterId || 'swordsman';
        const ch = CharacterSystem.allCharacters.find(c => c.id === charId);
        if (!ch) return;

        // 隐藏角色选择，显示武器选择
        document.getElementById('charSelectOverlay').classList.add('hidden');
        document.getElementById('weaponSelectOverlay').classList.remove('hidden');

        // 提示文字
        document.getElementById('weaponSelectHint').textContent =
            `${ch.name} · 选择一个初始武器`;

        // 获取适配的基础武器
        const affinities = ch.weaponAffinities;
        const basicWeapons = ShopSystem.allWeapons.filter(w =>
            affinities.includes(w.tag) && UnlockSystem.basicWeaponIds.has(w.id)
        );

        // 按标签分组排序显示
        const tagOrder = ['melee', 'gun', 'bow', 'magic', 'medic', 'lance'];
        basicWeapons.sort((a, b) => tagOrder.indexOf(a.tag) - tagOrder.indexOf(b.tag));

        const grid = document.getElementById('weaponSelectGrid');
        grid.innerHTML = '';

        if (basicWeapons.length === 0) {
            // 兜底：显示基础手枪
            const pistol = ShopSystem.allWeapons.find(w => w.id === 'pistol');
            if (pistol) this._renderWeaponCard(grid, pistol);
        } else {
            for (const w of basicWeapons) {
                this._renderWeaponCard(grid, w);
            }
        }
    },

    /** 渲染单个武器选择卡片 */
    _renderWeaponCard(container, weapon) {
        const card = document.createElement('div');
        card.className = 'weapon-select-card';
        card.dataset.weaponId = weapon.id;

        const tagDef = ShopSystem.tagInfo[weapon.tag];
        const tagHtml = tagDef ? `<span class="ws-tag" style="color:${this._tagColor(weapon.tag)}">${tagDef.icon}${tagDef.name}</span>` : '';

        // 武器基本数值
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

    /** 确认选择武器，开始游戏 */
    _confirmWeapon(weaponId) {
        document.getElementById('weaponSelectOverlay').classList.add('hidden');
        GameEngine.startGame(weaponId);
    },

    showMenu() {
        document.getElementById('menuOverlay').classList.remove('hidden');
        document.getElementById('gameOverOverlay').classList.add('hidden');
        document.getElementById('shopOverlay').classList.add('hidden');
        document.getElementById('levelUpOverlay').classList.add('hidden');
        document.getElementById('weaponSelectOverlay').classList.add('hidden');
        document.getElementById('charSelectOverlay').classList.remove('hidden');
        document.getElementById('hud').classList.add('hidden');
        // 渲染角色列表
        this._renderCharSelect();
    },

    showMenu() {
        document.getElementById('menuOverlay').classList.remove('hidden');
        document.getElementById('gameOverOverlay').classList.add('hidden');
        document.getElementById('shopOverlay').classList.add('hidden');
        document.getElementById('levelUpOverlay').classList.add('hidden');
        document.getElementById('charSelectOverlay').classList.remove('hidden');
        document.getElementById('hud').classList.add('hidden');
        // 渲染角色列表
        this._renderCharSelect();
    },

    _renderCharSelect() {
        const container = document.getElementById('charList');
        container.innerHTML = '';
        const chars = CharacterSystem.allCharacters;

        for (const ch of chars) {
            const unlocked = ch.unlocked || UnlockSystem.isCharacterUnlocked(ch.id);
            const card = document.createElement('div');
            card.className = `char-card ${unlocked ? 'unlocked' : 'locked'} ${ch.id === CharacterSystem.selectedCharacterId ? 'selected' : ''}`;
            card.dataset.charId = ch.id;

            if (!unlocked) {
                // 锁定状态
                let unlockDesc = '';
                if (ch.unlockCondition) {
                    if (ch.unlockCondition.type === 'maxLevel') {
                        unlockDesc = `通关第 ${ch.unlockCondition.value} 关解锁`;
                    } else if (ch.unlockCondition.type === 'totalKills') {
                        unlockDesc = `累计击杀 ${ch.unlockCondition.value} 解锁`;
                    }
                }
                card.innerHTML = `
                    <div class="char-icon">🔒</div>
                    <div class="char-name">???</div>
                    <div class="char-desc">${unlockDesc}</div>
                `;
            } else {
                card.innerHTML = `
                    <div class="char-icon">${AssetSystem.charIconHTML(ch.id)}</div>
                    <div class="char-name">${ch.name}</div>
                    <div class="char-desc">${ch.desc}</div>
                    <div class="char-stats">
                        <span>❤️${ch.stats.maxHp}</span>
                        <span>⚡${ch.stats.speed}</span>
                        <span>🗡️${ch.stats.damage}</span>
                        <span>🛡️${ch.stats.armor}</span>
                    </div>
                `;
            }

            container.appendChild(card);
        }
    },

    showGameOver() {
        const p = PlayerSystem.player;
        const result = UnlockSystem.endSession();

        document.getElementById('menuOverlay').classList.add('hidden');
        document.getElementById('gameOverOverlay').classList.remove('hidden');
        document.getElementById('shopOverlay').classList.add('hidden');
        document.getElementById('levelUpOverlay').classList.add('hidden');
        document.getElementById('charSelectOverlay').classList.add('hidden');
        document.getElementById('weaponSelectOverlay').classList.add('hidden');
        document.getElementById('hud').classList.add('hidden');

        // 基础统计
        document.getElementById('finalLevel').textContent = WaveSystem.currentLevel;
        document.getElementById('finalKills').textContent = p ? p.kills : 0;
        document.getElementById('finalMaterials').textContent = p ? p.materials : 0;
        document.getElementById('finalChar').textContent = CharacterSystem.selectedCharacterId ?
            CharacterSystem.allCharacters.find(c => c.id === CharacterSystem.selectedCharacterId)?.name || '赛博游侠' : '赛博游侠';

        // 本局武器
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

        // 新解锁
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
                // 解锁动画
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

        // 显示角色名 + 关卡
        const char = CharacterSystem.allCharacters.find(c => c.id === CharacterSystem.selectedCharacterId);
        document.getElementById('shopCharInfo').innerHTML = `${char ? AssetSystem.charIconHTML(char.id) + ' ' + char.name : AssetSystem.charIconHTML('swordsman') + ' 剑客'}`;
        document.getElementById('shopLevel').textContent = WaveSystem.currentLevel;

        this.updateShop(p);
    },

    /** 获取标签颜色 */
    _tagColor(tagId) {
        const colors = { rapid: '#ffcc00', heavy: '#ff6600', tech: '#00ffff', melee: '#00ff88', lance: '#ff88ff' };
        return colors[tagId] || '#ffffff';
    },

    /** 格式化羁绊加成文本 */
    _formatSynergyBonus(bonus) {
        const parts = [];
        for (const [key, val] of Object.entries(bonus)) {
            switch (key) {
                case 'damageMult': parts.push(`伤害+${Math.round(val * 100)}%`); break;
                case 'attackSpeedMult': parts.push(`攻速+${Math.round(val * 100)}%`); break;
                case 'bulletSpeedMult': parts.push(`弹速+${Math.round(val * 100)}%`); break;
                case 'bulletPierceAdd': parts.push(`穿透+${val}`); break;
                case 'critChanceAdd': parts.push(`暴击+${Math.round(val * 100)}%`); break;
                case 'lifeStealAdd': parts.push(`吸血+${Math.round(val * 100)}%`); break;
                case 'critMultiplierAdd': parts.push(`暴伤+${Math.round(val * 100)}%`); break;
                default: parts.push(`${key}:${val}`);
            }
        }
        return parts.join('  ');
    },

    hideShop() {
        document.getElementById('shopOverlay').classList.add('hidden');
    },

    /** 显示优惠后价格（折扣券） */
    _getDisplayCost(player, baseCost) {
        if (player.coupon > 0) {
            const discCost = Math.max(1, baseCost - player.coupon * 2);
            return `<span style="text-decoration:line-through;opacity:0.5">🪙${baseCost}</span> 🪙${discCost}`;
        }
        return `<span>🪙 ${baseCost}</span>`;
    },

    /** ==================== Brotato 风格商店渲染 ==================== */

    updateShop(player) {
        // 更新金币
        document.getElementById('shopMaterials').textContent = player.materials;

        // 装备武器条
        this._renderEquippedWeapons(player);
        // 左：属性面板
        this._renderPlayerStatsCompact(player);
        // 右：商店混合网格
        this._renderShopGrid(player);
        // 已购道具
        this._renderOwnedItems(player);
        // 羁绊
        this._renderSynergies(player);

        // 刷新按钮事件
        this._bindRefreshBtn(player);
    },

    /** 装备武器条（6格，带等级/卖出/合并） */
    _renderEquippedWeapons(player) {
        const container = document.getElementById('equippedWeapons');
        container.innerHTML = '';
        const ownedWeapons = player.weapons || [{ id: 'pistol', level: 1 }];
        const allWeapons = ShopSystem.allWeapons;
        const maxSlots = player.weaponSlots || 6;

        // 填充已有武器（保留原始引用用于索引）
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

            const tagKey = def.tag;
            const tagDef = ShopSystem.tagInfo[tagKey];
            const tagHtml = tagDef ? `<span class="slot-tag" style="color:${this._tagColor(tagKey)}">${tagDef.icon}</span>` : '';

            // 词条HTML（按品质着色 + 合并升级高亮动画）
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

            // 重随按钮
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

            // 卖出按钮
            const sellBtn = div.querySelector('.slot-sell');
            sellBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._sellWeapon(parseInt(sellBtn.dataset.idx), player);
            });

            // 点击武器 → 合并选择 / 触发合并
            div.addEventListener('click', (e) => {
                if (e.target.classList.contains('slot-sell')) return;
                this._handleWeaponClick(idx, ownedWeapons, player);
            });

            container.appendChild(div);
        }

        // 填充空槽位
        const usedCount = ownedWeapons.length;
        for (let i = usedCount; i < maxSlots; i++) {
            const div = document.createElement('div');
            div.className = 'equipped-weapon-slot empty';
            // 点击空槽位取消合并选择
            div.addEventListener('click', () => {
                this._mergeSourceIdx = -1;
                this.updateShop(player);
            });
            container.appendChild(div);
        }
    },

    /** 处理武器点击（合并选择/触发合并） */
    _handleWeaponClick(idx, ownedWeapons, player) {
        if (this._mergeSourceIdx === -1 || this._mergeSourceIdx === undefined) {
            // 第一次点击：设为合并源
            this._mergeSourceIdx = idx;
            this.updateShop(player);
        } else if (this._mergeSourceIdx === idx) {
            // 点击同一个：取消选择
            this._mergeSourceIdx = -1;
            this.updateShop(player);
        } else {
            // 尝试合并
            const from = ownedWeapons[this._mergeSourceIdx];
            const to = ownedWeapons[idx];
            if (from && to && from.id === to.id) {
                // 执行合并 — 使用原始索引在 player.weapons 中的位置
                if (ShopSystem.mergeWeapons(this._mergeSourceIdx, idx)) {
                    this._mergeSourceIdx = -1;
                    this.updateShop(player);
                    ParticleSystem.pickup(player.x, player.y);
                    return;
                }
            }
            // 不同武器或合并失败 → 切换选择
            this._mergeSourceIdx = idx;
            this.updateShop(player);
        }
    },

    /** 卖出武器 */
    _sellWeapon(idx, player) {
        // 先获取武器信息再卖出
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

    /** 显示商店提示信息（自动消失） */
    _showShopError(msg) {
        const el = document.getElementById('shopError');
        if (!el) return;
        el.textContent = msg;
        el.classList.remove('hidden');
        clearTimeout(this._errorTimer);
        this._errorTimer = setTimeout(() => {
            el.classList.add('hidden');
        }, 2500);
    },

    /** 右：紧凑属性面板（Brotato 数值顺序） */
    _renderPlayerStatsCompact(player) {
        const container = document.getElementById('playerStats');
        container.innerHTML = '';

        const statList = StatsSystem.getDisplayStats(player);

        // HP（Current/Max）
        const hpDiv = document.createElement('div');
        hpDiv.className = 'stat-item stat-item-hp';
        hpDiv.innerHTML = `
            <span class="stat-icon">❤️</span>
            <span class="stat-label">生命</span>
            <span class="stat-value danger">${Math.round(player.hp)}/${Math.round(player.maxHp)}</span>
        `;
        container.appendChild(hpDiv);

        // Brotato 数值顺序：HP回复->速度->护甲->伤害->攻速->射程->暴率->暴伤->吸血->闪避->收获->幸运
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

        // 等级
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

    /** 左：商店混合网格（武器+道具混合排列，无上限可重复购买） */
    _renderShopGrid(player) {
        const container = document.getElementById('shopItemsGrid');
        container.innerHTML = '';

        const items = ShopSystem.items;
        if (items.length === 0) {
            container.innerHTML = '<div class="items-empty">暂无商品，点击刷新</div>';
            return;
        }

        // 统计道具持有数量
        const ownedWeaponIds = (player.weapons || []).map(w => w.id);
        const itemCounts = {};
        for (const id of (player.items || [])) {
            itemCounts[id] = (itemCounts[id] || 0) + 1;
        }

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

            // 品质边框颜色 + 品质标签
            let qualityBadgeHtml = '';
            if (isWeapon) {
                const quality = item.quality || 'T1';
                const qDef = ShopSystem.qualityDefs[quality];
                if (qDef) {
                    const col = qDef.color;
                    div.style.borderColor = col;
                    div.style.boxShadow = `0 0 10px ${col}22, inset 0 0 6px ${col}11`;
                    qualityBadgeHtml = `<span class="mc-quality-badge" style="color:${col}">${qDef.name}</span>`;
                }
            }

            const typeLabel = isWeapon ? '武器' : '道具';
            const iconHtml = isWeapon ? AssetSystem.weaponIconHTML(item.id) : AssetSystem.itemIconHTML(item.id, 44);

            const tagKey = item.tag;
            const tagDef = ShopSystem.tagInfo[tagKey];
            const tagHtml = tagDef ? `<div class="mc-tag" style="color:${this._tagColor(tagKey)}">${tagDef.icon}${tagDef.name}</div>` : '';

            const slotHtml = isWeapon && item.slots > 1 ? `<span class="mc-slots">📦×${item.slots}</span>` : '';

            // 数量角标
            const countBadge = !isWeapon && count > 0 ? `<span class="mc-count-badge">×${count}</span>` : '';

            // 属性修正
            const modParts = [];
            if (item.mods) {
                if (item.mods.damageMult) modParts.push(`${item.mods.damageMult > 0 ? '+' : ''}${Math.round(item.mods.damageMult * 100)}%伤害`);
                if (item.mods.attackSpeedMult) modParts.push(`${item.mods.attackSpeedMult > 0 ? '+' : ''}${Math.round(item.mods.attackSpeedMult * 100)}%攻速`);
                if (item.mods.speedMult) modParts.push(`${item.mods.speedMult > 0 ? '+' : ''}${Math.round(item.mods.speedMult * 100)}%移速`);
                if (item.mods.attackRangeMult) modParts.push(`${item.mods.attackRangeMult > 0 ? '+' : ''}${Math.round((item.mods.attackRangeMult - 1) * 100)}%射程`);
            }
            const descText = modParts.length > 0 ? modParts.join(' · ') : item.desc;
            const ownedText = isWeapon ? (ownedHas ? `<div class="mc-owned">已装备</div>` : '') : (count > 0 ? `<div class="mc-owned">已持 ×${count}</div>` : '');

            // 商店中武器没有实际 affixes 数据（商店物品是模板），显示「1个词条」占位提示
            const affixHint = isWeapon ? '<div class="weapon-affixes"><span class="weapon-affix">📋购买后生成1个随机词条</span></div>' : '';

            div.innerHTML = `
                <span class="mc-type-badge">${typeLabel}</span>
                ${qualityBadgeHtml}
                ${countBadge}
                <div class="mc-icon">${iconHtml}</div>
                <div class="mc-name">${item.name}</div>
                ${tagHtml}
                ${slotHtml}
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

            // 锁定按钮
            const lockEl = div.querySelector('.mc-lock');
            if (lockEl) {
                lockEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    ShopSystem.toggleLock(idx);
                    this.updateShop(player);
                });
            }

            // 购买
            div.addEventListener('click', () => {
                const result = ShopSystem.buyItem(idx);
                if (result) {
                    this.updateShop(player);
                    ParticleSystem.pickup(player.x, player.y);
                } else if (ShopSystem._lastBuyError) {
                    this._showShopError(ShopSystem._lastBuyError);
                    ShopSystem._lastBuyError = '';
                }
            });

            container.appendChild(div);
        }
    },

    /** 刷新按钮绑定（替换旧监听器，防止累积） */
    _bindRefreshBtn(player) {
        const refreshBtn = document.getElementById('refreshShopBtn');
        if (!refreshBtn) return;
        const canRefresh = player.materials >= ShopSystem.refreshCost;
        refreshBtn.textContent = `🔄 🪙${ShopSystem.refreshCost}`;
        refreshBtn.className = `refresh-btn ${canRefresh ? '' : 'disabled'}`;
        // 克隆旧按钮替换自身，清除所有已绑定的监听器
        const newBtn = refreshBtn.cloneNode(true);
        refreshBtn.parentNode.replaceChild(newBtn, refreshBtn);
        newBtn.addEventListener('click', () => {
            if (ShopSystem.refresh()) {
                this.updateShop(player);
                ParticleSystem.pickup(player.x, player.y);
            }
        });
    },

    /** 已购道具条（按道具ID分组，右上角显示数量） */
    _renderOwnedItems(player) {
        const container = document.getElementById('ownedItems');
        container.innerHTML = '';

        if (!player.items || player.items.length === 0) {
            container.innerHTML = '<span class="owned-empty">暂无</span>';
            return;
        }

        // 按道具ID分组统计数量
        const countMap = {};
        for (const id of player.items) {
            countMap[id] = (countMap[id] || 0) + 1;
        }

        // 按道具在 allItems 中的顺序排序
        const order = ShopSystem.allItems.map(i => i.id);
        const sortedIds = Object.keys(countMap).sort((a, b) => order.indexOf(a) - order.indexOf(b));

        for (const id of sortedIds) {
            const def = ShopSystem.allItems.find(i => i.id === id);
            if (!def) continue;
            const count = countMap[id];
            const badge = document.createElement('span');
            badge.className = 'owned-item-badge';
            const iconHtml = AssetSystem.itemIconHTML(def.id);
            badge.innerHTML = `${iconHtml} ${def.name}<span class="owned-item-count">×${count}</span>`;
            container.appendChild(badge);
        }
    },

    /** 羁绊行 */
    _renderSynergies(player) {
        const container = document.getElementById('synergyDisplay');
        if (!container) return;
        container.innerHTML = '';

        const synergies = player._activeSynergies || [];
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

        const options = [...StatsSystem.levelUpOptions]
            .sort(() => Math.random() - 0.5)
            .slice(0, 3);

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

    /** 渲染HUD上的羁绊指示器 */
    _renderHudSynergies(player) {
        const container = document.getElementById('hudSynergies');
        if (!container) return;
        container.innerHTML = '';

        const synergies = player._activeSynergies || [];
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

        // 角色名
        const char = CharacterSystem.allCharacters.find(c => c.id === CharacterSystem.selectedCharacterId);
        document.getElementById('hudCharName').textContent = char ? char.name : '';

        // HP
        const hpPct = Math.max(0, (p.hp / p.maxHp) * 100);
        document.getElementById('healthBar').style.width = hpPct + '%';
        document.getElementById('healthText').textContent = `${Math.ceil(p.hp)}/${Math.ceil(p.maxHp)}`;

        // EXP
        const xpPct = p.xpToNext > 0 ? (p.xp / p.xpToNext) * 100 : 0;
        document.getElementById('xpBar').style.width = Math.min(100, xpPct) + '%';

        // 等级图标
        document.getElementById('hudLevelNum').textContent = p.level;

        // 宝箱计数
        document.getElementById('hudChestCount').textContent = ChestSystem.collectedCount || 0;

        // 材料金币
        document.getElementById('materialCount').textContent = p.materials;

        // 关卡
        document.getElementById('levelCount').textContent = WaveSystem.currentLevel;

        // 击杀
        document.getElementById('killCount').textContent = p.kills;

        // 更新倒计时
        if (WaveSystem.waveActive) {
            const remaining = Math.max(0, WaveSystem.levelDuration - WaveSystem.waveTimer);
            const timerEl = document.getElementById('waveTimer');
            const display = Math.ceil(remaining);
            timerEl.textContent = `${display}`;
            timerEl.className = 'hud-timer';
            if (display <= 10) timerEl.classList.add('urgent');
            if (display <= 5) {
                timerEl.classList.add('critical');
                timerEl.classList.remove('urgent');
            }
        }

        // 渲染HUD羁绊
        this._renderHudSynergies(p);
    },

    /** 显示宝箱奖励选择 */
    showChestReward() {
        if (!ChestSystem.pendingReward) return;
        const overlay = document.getElementById('chestRewardOverlay');
        if (!overlay) return;

        overlay.classList.remove('hidden');
        const container = document.getElementById('chestRewardChoices');
        container.innerHTML = '';

        const { options, onChoose } = ChestSystem.pendingReward;

        for (const opt of options) {
            const div = document.createElement('div');
            div.className = 'chest-reward-choice';
            div.innerHTML = `
                <div class="chest-reward-choice-icon">${opt.icon}</div>
                <div class="chest-reward-choice-text">
                    <div class="chest-reward-choice-name">${opt.name}</div>
                    <div class="chest-reward-choice-desc">${opt.desc}</div>
                </div>
            `;
            div.addEventListener('click', () => {
                overlay.classList.add('hidden');
                onChoose(opt.id);
                this.updateHUD();
            });
            container.appendChild(div);
        }
    },

    /** 隐藏宝箱奖励（外部调用） */
    hideChestReward() {
        document.getElementById('chestRewardOverlay').classList.add('hidden');
    }
};
