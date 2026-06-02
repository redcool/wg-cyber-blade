// ============================================================
// cyberblade/shop.js - 黑市商店系统（武器+道具双轨制）
// 标签: melee / gun / bow / magic / medic / lance
// ============================================================

/** 拆分 CSV 行（支持 "" 双引号字段 + "" 转义）
 *  作为全局工具函数，供 ShopSystem 和 AudioSystem 共用 */
function splitCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current.trim());
    return result;
}

const ShopSystem = {
    items: [],
    lockedItems: [],
    refreshCost: 1,
    _boughtUniqueItems: [],

    config: {},

    affixDefs: {
        damagePct: {
            name: '攻击力', icon: '🗡️',
            desc: (v) => `+${Math.round(v * 100)}% 攻击力`,
            baseValue: [0.08, 0.15], perLevel: [0.02, 0.04],
        },
        attackSpeedPct: {
            name: '攻速', icon: '⚡',
            desc: (v) => `+${Math.round(v * 100)}% 攻速`,
            baseValue: [0.05, 0.10], perLevel: [0.01, 0.03],
        },
        critChancePct: {
            name: '暴击率', icon: '💥',
            desc: (v) => `+${Math.round(v * 100)}% 暴击率`,
            baseValue: [0.02, 0.04], perLevel: [0.005, 0.01],
        },
        critMultiplierAdd: {
            name: '暴击伤害', icon: '🔥',
            desc: (v) => `+${v.toFixed(1)}x 暴击伤害`,
            baseValue: [0.15, 0.30], perLevel: [0.05, 0.10],
        },
        lifeStealPct: {
            name: '生命偷取', icon: '🩸',
            desc: (v) => `+${Math.round(v * 100)}% 生命偷取`,
            baseValue: [0.01, 0.03], perLevel: [0.005, 0.01],
        },
        armor: {
            name: '护甲', icon: '🛡️',
            desc: (v) => `+${v} 护甲`,
            baseValue: [1, 3], perLevel: [1, 1],
            isInt: true,
        },
        hpRegenPct: {
            name: '生命回复', icon: '💚',
            desc: (v) => `+${v.toFixed(1)} 回复/秒`,
            baseValue: [0.3, 0.8], perLevel: [0.1, 0.2],
        },
        maxHp: {
            name: '最大生命', icon: '❤️',
            desc: (v) => `+${v} 最大HP`,
            baseValue: [5, 15], perLevel: [3, 5],
            isInt: true,
        },
        attackRangePct: {
            name: '射程', icon: '🎯',
            desc: (v) => `+${Math.round(v * 100)}% 射程`,
            baseValue: [0.05, 0.10], perLevel: [0.015, 0.03],
        },
        bulletSpeedPct: {
            name: '弹速', icon: '➡️',
            desc: (v) => `+${Math.round(v * 100)}% 弹速`,
            baseValue: [0.05, 0.10], perLevel: [0.015, 0.03],
        },
        bulletPierceAdd: {
            name: '穿透', icon: '🔱',
            desc: (v) => `+${v} 穿透`,
            baseValue: [1, 1], perLevel: [0, 0],
            isInt: true,
        },
    },

    _rollAffix(level) {
        const ids = Object.keys(this.affixDefs);
        const id = ids[Math.floor(Math.random() * ids.length)];
        const def = this.affixDefs[id];
        const base = def.baseValue[0] + Math.random() * (def.baseValue[1] - def.baseValue[0]);
        const perLvl = def.perLevel[0] + Math.random() * (def.perLevel[1] - def.perLevel[0]);
        let value = base + (level - 1) * perLvl;
        if (def.isInt) value = Math.round(value);
        else value = Math.round(value * 100) / 100;
        return { id, value };
    },

    _rollNewAffixId(existingIds) {
        const pool = Object.keys(this.affixDefs).filter(id => !existingIds.includes(id));
        if (pool.length === 0) return null;
        return pool[Math.floor(Math.random() * pool.length)];
    },

    _initWeaponAffixes(weapon) {
        const level = weapon.level || 1;
        weapon.affixes = [this._rollAffix(level)];
    },

    _increaseAffixesOnMerge(weapon, fromLevel) {
        const levelIncrease = fromLevel || 1;
        for (const aff of (weapon.affixes || [])) {
            const def = this.affixDefs[aff.id];
            if (!def) continue;
            const inc = def.perLevel[0] + Math.random() * (def.perLevel[1] - def.perLevel[0]) * levelIncrease;
            if (def.isInt) aff.value += Math.round(inc);
            else aff.value = Math.round((aff.value + inc) * 100) / 100;
        }
    },

    getRerollCost(weapon) {
        const level = weapon.level || 1;
        const quality = weapon.quality || 'T1';
        const baseCosts = { T1: 5, T2: 8, T3: 14, T4: 22 };
        const base = baseCosts[quality] || 5;
        const rerollPenalty = (weapon._rerollCount || 0) * 2;
        return base + (level - 1) * 3 + rerollPenalty;
    },

    rerollAffixes(weapon, player) {
        const cost = this.getRerollCost(weapon);
        if (player.materials < cost) return false;
        player.materials -= cost;
        weapon._rerollCount = (weapon._rerollCount || 0) + 1;
        const level = weapon.level || 1;
        const expectedCount = 1 + Math.floor((level - 1) / 3);
        weapon.affixes = [];
        const existingIds = [];
        for (let i = 0; i < expectedCount; i++) {
            const newId = this._rollNewAffixId(existingIds);
            if (!newId) {
                const ids = Object.keys(this.affixDefs);
                const anyId = ids[Math.floor(Math.random() * ids.length)];
                const aff = this._rollAffix(level);
                aff.id = anyId;
                weapon.affixes.push(aff);
            } else {
                const aff = this._rollAffix(level);
                aff.id = newId;
                weapon.affixes.push(aff);
                existingIds.push(newId);
            }
        }
        this._updateWeaponParams(player, weapon.id);
        PlayerSystem._updateSynergies();
        return { cost, newAffixes: weapon.affixes };
    },

    _applyMergeWithHighlights(weapon, fromLevel) {
        const before = (weapon.affixes || []).map(a => ({ id: a.id, value: a.value }));
        this._increaseAffixesOnMerge(weapon, fromLevel);
        this._ensureAffixCount(weapon);
        const highlights = {};
        for (const a of (weapon.affixes || [])) {
            const prev = before.find(b => b.id === a.id);
            if (!prev) {
                highlights[a.id] = 'new';
            } else if (prev.value !== a.value) {
                highlights[a.id] = 'upgraded';
            }
        }
        weapon._affixHighlights = highlights;
        if (weapon._highlightTimer) clearTimeout(weapon._highlightTimer);
        weapon._highlightTimer = setTimeout(() => {
            delete weapon._affixHighlights;
            delete weapon._highlightTimer;
        }, 3000);
    },

    _ensureAffixCount(weapon) {
        const level = weapon.level || 1;
        const expected = 1 + Math.floor((level - 1) / 3);
        const existingIds = (weapon.affixes || []).map(a => a.id);
        while ((weapon.affixes || []).length < expected) {
            const newId = this._rollNewAffixId(existingIds);
            if (!newId) break;
            const newAff = this._rollAffix(level);
            newAff.id = newId;
            weapon.affixes.push(newAff);
            existingIds.push(newId);
        }
    },

    qualityDefs: {
        T1: { name: '普通', color: '#aaaaaa', bg: 'rgba(170,170,170,0.12)', damageMult: 1.0,  costMult: 1.0,  minWave: 1,  rollWeight: 45 },
        T2: { name: '优秀', color: '#4488ff', bg: 'rgba(68,136,255,0.12)', damageMult: 1.3,  costMult: 1.8,  minWave: 3,  rollWeight: 30 },
        T3: { name: '稀有', color: '#aa44ff', bg: 'rgba(170,68,255,0.12)', damageMult: 1.6,  costMult: 2.8,  minWave: 6,  rollWeight: 18 },
        T4: { name: '传说', color: '#ff6600', bg: 'rgba(255,102,0,0.15)', damageMult: 2.0,  costMult: 4.0,  minWave: 10, rollWeight: 7 },
    },

    rollQuality(currentWave) {
        const pool = Object.entries(this.qualityDefs)
            .filter(([_, q]) => currentWave >= q.minWave);
        if (pool.length === 0) return 'T1';
        const totalWeight = pool.reduce((sum, [_, q]) => sum + q.rollWeight, 0);
        let r = Math.random() * totalWeight;
        for (const [key, q] of pool) {
            r -= q.rollWeight;
            if (r <= 0) return key;
        }
        return pool[pool.length - 1][0];
    },

    _itemApplyFunctions: {
        // statMods 来自 CSV，下方仅保留需要特殊逻辑的道具
        energy_shield: (p) => { p.energyShieldCD = 8; p.energyShieldTimer = 0; p.energyShieldReady = true; },
        reactive_armor: (p) => { p.reactiveArmor = true; },
        stim: (p) => { p.takenDmgMult = (p.takenDmgMult || 1.0) * 1.25; },
        replicator: (p) => { p.replicatorChance = (p.replicatorChance || 0) + 0.2; },
        coupon: (p) => { p.coupon = (p.coupon || 0) + 1; },
        hunting_trophy: (p) => { p.huntingTrophy = true; },
        magnet: (p) => { p.magnetDmg = 15; p.magnetTimer = 0; p.magnetRadius = 120; },
        burn_spreader: (p) => { p._burnSpreadLevel = (p._burnSpreadLevel || 0) + 1; p._burnSpreadRange = 200; },
        ice_core: (p) => { p._iceExplosionMult = (p._iceExplosionMult || 1.0) * 1.5; p._iceExplosionRadiusAdd = (p._iceExplosionRadiusAdd || 0) + 0.5; },
        element_amp: (p) => { p._sprayPierceAdd = (p._sprayPierceAdd || 0) + 2; p._sprayDamageMult = (p._sprayDamageMult || 1.0) * 1.2; },
        berserker: (p) => { p.berserkerBlood = true; },
        tardigrade: (p) => { p.tardigradeBlock = true; },
        ricochet: (p) => { p.ricochetCount = (p.ricochetCount || 0) + 1; },
        anvil: (p) => { p.anvilUpgrade = true; },
    },

    // 标签系统已迁移至 TagSystem (src/engine/tags.js)
    // — TAG_DEFS, synergyThresholds, countWeaponTags, getActiveSynergies 均在该模块中

    async loadWeaponTable() {
        try {
            const resp = await fetch('data/weaponTable.md');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const text = await resp.text();
            const weapons = this._parseWeaponCSV(text);
            if (weapons.length === 0) {
                console.warn('[ShopSystem] CSV 加载成功但无有效武器数据');
            } else {
                console.log('[ShopSystem] 从 CSV 加载', weapons.length, '种武器');
                this.allWeapons = weapons;
            }
        } catch (e) {
            console.error('[ShopSystem] 武器CSV加载失败:', e.message);
        }
    },

    _parseWeaponCSV(text) {
        const lines = text.split(/\r?\n/);
        const weapons = [];
        for (const rawLine of lines) {
            const trimmed = rawLine.trim();
            if (trimmed === '' || trimmed.startsWith('#')) continue;

            const fields = this._splitCSVLine(trimmed);
            if (fields.length < 28) continue;

            const [
                id, name, desc, icon, slotsStr, costStr, tag,
                modsStr, behavior,
                bulletCountStr, bulletSpeedStr, damageMultStr, attackSpeedMultStr, spreadStr, pierceStr,
                meleeRangeStr, attackRangeStr,
                burnDpsStr, burnMaxStacksStr, chainCountStr, splashRadiusStr, homingStrengthStr,
                slowAmountStr, slowDurationStr,
                healOnHitStr, auraHealStr, auraRadiusStr, sprayConeStr
            ] = fields;

            const toNum = (s) => { const v = parseFloat(s); return isNaN(v) ? 0 : v; };

            let mods = {};
            try {
                if (modsStr && modsStr !== '{}') {
                    mods = JSON.parse(modsStr);
                }
            } catch (e) {
                console.warn('[ShopSystem] mods 解析失败 (' + id + '):', modsStr);
            }

            weapons.push({
                id, name, desc, icon,
                slots: toNum(slotsStr) || 1,
                cost: toNum(costStr) || 0,
                tag,
                mods,
                behavior: behavior || 'bullet',
                bulletCount: toNum(bulletCountStr) || 1,
                bulletSpeed: toNum(bulletSpeedStr) || 500,
                damageMult: toNum(damageMultStr) || 1.0,
                attackSpeedMult: toNum(attackSpeedMultStr) || 1.0,
                spread: toNum(spreadStr) || 0.1,
                pierce: toNum(pierceStr) || 0,
                meleeRange: toNum(meleeRangeStr) || 0,
                attackRange: toNum(attackRangeStr) || 0,
                burnDps: toNum(burnDpsStr) || 0,
                burnMaxStacks: toNum(burnMaxStacksStr) || 0,
                chainCount: toNum(chainCountStr) || 0,
                splashRadius: toNum(splashRadiusStr) || 0,
                homingStrength: toNum(homingStrengthStr) || 0,
                slowAmount: toNum(slowAmountStr) || 0,
                slowDuration: toNum(slowDurationStr) || 0,
                healOnHit: toNum(healOnHitStr) || 0,
                auraHeal: toNum(auraHealStr) || 0,
                auraRadius: toNum(auraRadiusStr) || 0,
                sprayCone: toNum(sprayConeStr) || 0,
            });
        }
        return weapons;
    },

    _splitCSVLine(line) {
        return splitCSVLine(line);
    },

    allWeapons: [],

    async loadItemTable() {
        try {
            const resp = await fetch('data/itemTable.md');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const text = await resp.text();
            const items = this._parseItemCSV(text);
            if (items.length === 0) {
                console.warn('[ShopSystem] 道具CSV 加载成功但无有效数据');
            } else {
                console.log('[ShopSystem] 从 CSV 加载', items.length, '种道具');
                this.allItems = items;
            }
        } catch (e) {
            console.error('[ShopSystem] 道具CSV加载失败:', e.message);
        }
    },

    _parseItemCSV(text) {
        const lines = text.split(/\r?\n/);
        const items = [];
        for (const rawLine of lines) {
            const trimmed = rawLine.trim();
            if (trimmed === '' || trimmed.startsWith('#')) continue;

            const fields = this._splitCSVLine(trimmed);
            if (fields.length < 6) continue;

            const [id, name, desc, costStr, icon, uniqueStr] = fields;
            const cost = parseInt(costStr);
            if (isNaN(cost)) continue;

            const unique = uniqueStr.trim().toLowerCase() === 'true';
            const apply = this._itemApplyFunctions[id] || function() {};

            items.push({ id, name, desc, cost, icon, unique, apply });
        }
        return items;
    },

    allItems: [],

    generateItems() {
        const prevLocked = this.items.filter(it => it.locked);
        for (const li of this.lockedItems) {
            if (!prevLocked.some(it => it.id === li.id && it.type === li.type)) {
                prevLocked.push({ ...li, locked: true, type: li.type });
            }
        }
        this.items = [];
        for (const li of prevLocked) {
            this.items.push({ ...li, locked: true });
        }
        this._generateShopItems();
    },

    _generateShopItems() {
        const player = PlayerSystem.player;
        if (!player) return;
        const currentWave = WaveSystem.currentLevel || 1;
        const affinities = CharacterSystem.getAffinities();

        const existingWeaponIds = this.items.filter(it => it.type === 'weapon').map(it => it.id);
        const weaponPool = this.allWeapons.filter(w => {
            if (w.id === 'pistol') return false;
            if (existingWeaponIds.includes(w.id)) return false;
            return UnlockSystem.isWeaponUnlocked(w.id);
        });
        const shuffledWeapons = [...weaponPool].sort(() => Math.random() - 0.5);
        const weaponCount = Math.min(2, shuffledWeapons.length);
        for (let i = 0; i < weaponCount && this.items.filter(it => it.type === 'weapon').length < 2; i++) {
            const base = shuffledWeapons[i];
            const quality = this.rollQuality(currentWave);
            const qDef = this.qualityDefs[quality];
            const inflationCost = Math.round(base.cost + currentWave + base.cost * 0.1 * currentWave);
            const cost = Math.max(1, Math.round(inflationCost * qDef.costMult));
            this.items.push({ ...base, type: 'weapon', locked: false, quality: quality, cost: cost });
        }

        const existingItemIds = this.items.filter(it => it.type === 'item').map(it => it.id);
        const itemPool = [...this.allItems].filter(it => {
            if (it.unique && this._boughtUniqueItems.includes(it.id)) return false;
            if (existingItemIds.includes(it.id)) return false;
            return true;
        });
        const shuffledItems = itemPool.sort(() => Math.random() - 0.5);
        const itemCount = Math.min(3 + Math.floor(Math.random() * 2), shuffledItems.length, 5);
        for (let i = 0; i < itemCount && this.items.filter(it => it.type === 'item').length < 5; i++) {
            const baseItem = shuffledItems[i];
            const inflationCost = Math.round(baseItem.cost + currentWave + baseItem.cost * 0.1 * currentWave);
            const cost = Math.max(1, inflationCost);
            this.items.push({ ...baseItem, type: 'item', locked: false, cost: cost });
        }

        // 确保每次生成 + 已锁定物品 ≥ 4 个
        if (this.items.length < 4) {
            const need = 4 - this.items.length;
            const fillPool = [...this.allItems].filter(it => {
                if (it.unique && this._boughtUniqueItems.includes(it.id)) return false;
                return !this.items.some(ex => ex.id === it.id && ex.type === 'item');
            }).sort(() => Math.random() - 0.5);
            for (let i = 0; i < need && i < fillPool.length; i++) {
                const baseItem = fillPool[i];
                const inflationCost = Math.round(baseItem.cost + currentWave + baseItem.cost * 0.1 * currentWave);
                const cost = Math.max(1, inflationCost);
                this.items.push({ ...baseItem, type: 'item', locked: false, cost: cost });
            }
        }
    },

    refresh(free = false) {
        const player = PlayerSystem.player;
        if (!player) return false;
        if (!free) {
            if (player.materials < this.refreshCost) return false;
            player.materials -= this.refreshCost;
            this.refreshCost += 1;
        }
        const lockedItems = this.items.filter(it => it.locked);
        this.items = lockedItems.map(it => ({ ...it, locked: true }));
        this._generateShopItems();
        return true;
    },

    toggleLock(itemIndex) {
        const item = this.items[itemIndex];
        if (!item) return;
        item.locked = !item.locked;
        if (item.locked) {
            if (!this.lockedItems.some(li => li.id === item.id && li.type === item.type)) {
                this.lockedItems.push({ ...item });
            }
        } else {
            this.lockedItems = this.lockedItems.filter(li => !(li.id === item.id && li.type === item.type));
        }
    },

    buyItem(itemIndex) {
        const item = this.items[itemIndex];
        if (!item) return false;
        const player = PlayerSystem.player;
        if (!player || player.materials < item.cost) return false;

        if (item.unique && this._boughtUniqueItems.includes(item.id)) return false;

        if (item.type === 'weapon') {
            if (!player.weapons) player.weapons = [{ id: 'pistol', level: 1, quality: 'T1' }];
            const quality = item.quality || 'T1';

            let actualCost = item.cost;
            if (player.coupon > 0) {
                actualCost = Math.max(1, item.cost - player.coupon * 2);
            }
            if (player.materials < actualCost) return false;

            const existingWeapon = player.weapons.find(w => w.id === item.id);
            if (existingWeapon) {
                player.materials -= actualCost;
                existingWeapon.level = (existingWeapon.level || 1) + 1;
                const qOrder = ['T1', 'T2', 'T3', 'T4'];
                if (qOrder.indexOf(quality) > qOrder.indexOf(existingWeapon.quality || 'T1')) {
                    existingWeapon.quality = quality;
                }
                this._applyMergeWithHighlights(existingWeapon, 1);
                this._updateWeaponParams(player, item.id);
                PlayerSystem._updateSynergies();
                UnlockSystem.recordWeaponBought(item.id);
                this.items.splice(itemIndex, 1);
                this.lockedItems = this.lockedItems.filter(li => !(li.id === item.id && li.type === item.type));
                return true;
            }

            const usedSlots = player.weapons.reduce((sum, w) => {
                const def = this.allWeapons.find(d => d.id === w.id);
                return sum + (def ? def.slots : 1);
            }, 0);
            const maxSlots = player.weaponSlots || 6;

            if (usedSlots + item.slots > maxSlots) {
                this._lastBuyError = '武器槽位已满，无法购买新武器';
                return false;
            }

            player.materials -= actualCost;
            const newWeapon = { id: item.id, level: 1, quality: quality };
            this._initWeaponAffixes(newWeapon);
            player.weapons.push(newWeapon);
            this._applyWeaponMods(player, item.mods);
            this._applyWeaponBehaviors(player, item);
            PlayerSystem._updateSynergies();
            UnlockSystem.recordWeaponBought(item.id);
        } else {
            if (!player.items) player.items = [];
            let actualCost = item.cost;
            if (player.coupon > 0) {
                actualCost = Math.max(1, item.cost - player.coupon * 2);
            }
            if (player.materials < actualCost) return false;
            player.materials -= actualCost;
            player.items.push(item.id);
            if (item.unique) this._boughtUniqueItems.push(item.id);
            // 应用 statMods (来自 CSV) + 注册触发器
            if (typeof ItemSystem !== 'undefined') {
                ItemSystem.buyItem(item.id, player);
            }
            // 应用自定义特殊逻辑（if any）
            if (this._itemApplyFunctions[item.id]) {
                this._itemApplyFunctions[item.id](player);
            }
            StatsSystem.clampPlayer(player);
            UnlockSystem.recordItemBought(item.id);
        }

        this.items.splice(itemIndex, 1);
        this.lockedItems = this.lockedItems.filter(li => !(li.id === item.id && li.type === item.type));

        if (item.type === 'item') {
            const remainingItems = this.items.filter(it => it.type === 'item');
            if (remainingItems.length === 0) this.refresh(true);
        }
        this._lastBuyError = '';
        return true;
    },

    sellWeapon(slotIdx) {
        const player = PlayerSystem.player;
        if (!player || !player.weapons || slotIdx < 0 || slotIdx >= player.weapons.length) return false;
        const weapon = player.weapons[slotIdx];
        const def = this.allWeapons.find(d => d.id === weapon.id);
        if (!def) return false;

        const quality = weapon.quality || 'T1';
        const qDef = this.qualityDefs[quality];
        const qualityCostMult = qDef ? qDef.costMult : 1.0;
        const refund = Math.floor((def.cost * qualityCostMult) / 2) + 1;
        player.materials += refund;

        if (def.mods) {
            if (def.mods.damageMult) player.damage = Math.floor(player.damage / (1 + def.mods.damageMult));
            if (def.mods.attackSpeedMult) player.attackSpeed = player.attackSpeed / (1 + def.mods.attackSpeedMult);
            if (def.mods.attackRangeMult) player.attackRange = player.attackRange / def.mods.attackRangeMult;
            if (def.mods.bulletSpeedMult) player.bulletSpeed = player.bulletSpeed / def.mods.bulletSpeedMult;
            if (def.mods.speedMult) player.speed = player.speed / (1 + def.mods.speedMult);
            if (def.mods.hpRegenAdd) player.hpRegen -= def.mods.hpRegenAdd;
            if (def.mods.armorAdd) player.armor -= def.mods.armorAdd;
            if (def.mods.critChanceAdd) player.critChance -= def.mods.critChanceAdd;
            if (def.mods.critMultiplierAdd) player.critMultiplier -= def.mods.critMultiplierAdd;
            if (def.mods.dodgeAdd) player.dodge -= def.mods.dodgeAdd;
            if (def.mods.maxHpAdd) { player.maxHp -= def.mods.maxHpAdd; player.hp = Math.min(player.hp, player.maxHp); }
        }
        StatsSystem.clampPlayer(player);

        player.weapons.splice(slotIdx, 1);
        const remaining = player.weapons.filter(w => w.id === weapon.id);
        if (remaining.length === 0) delete player.weaponParams[weapon.id];
        else this._updateWeaponParams(player, weapon.id);

        PlayerSystem._initWeaponParams(player);
        PlayerSystem._updateSynergies();
        return true;
    },

    mergeWeapons(fromIdx, toIdx) {
        const player = PlayerSystem.player;
        if (!player || !player.weapons) return false;
        const from = player.weapons[fromIdx];
        const to = player.weapons[toIdx];
        if (!from || !to || from.id !== to.id) return false;
        if (fromIdx === toIdx) return false;

        const fromLevel = from.level || 1;
        to.level = (to.level || 1) + fromLevel;
        const qOrder = ['T1', 'T2', 'T3', 'T4'];
        if (qOrder.indexOf(from.quality || 'T1') > qOrder.indexOf(to.quality || 'T1')) {
            to.quality = from.quality;
        }
        this._applyMergeWithHighlights(to, fromLevel);
        const actualFromIdx = player.weapons.indexOf(from);
        if (actualFromIdx !== -1) player.weapons.splice(actualFromIdx, 1);
        this._updateWeaponParams(player, to.id);
        PlayerSystem._updateSynergies();
        return true;
    },

    _updateWeaponParams(player, weaponId) {
        const weapons = player.weapons.filter(w => w.id === weaponId);
        if (weapons.length === 0) { delete player.weaponParams[weaponId]; return; }
        const def = this.allWeapons.find(d => d.id === weaponId);
        if (!def) return;

        const maxLevel = Math.max(...weapons.map(w => w.level || 1));
        const qualities = weapons.map(w => w.quality || 'T1');
        const qualityOrder = ['T1', 'T2', 'T3', 'T4'];
        let bestQuality = 'T1';
        for (const q of qualities) {
            if (qualityOrder.indexOf(q) > qualityOrder.indexOf(bestQuality)) bestQuality = q;
        }

        player.weaponParams[weaponId] = {
            behavior: def.behavior || 'bullet',
            bulletCount: def.bulletCount || 1,
            bulletSpeed: def.bulletSpeed || 500,
            spread: def.spread || 0.1,
            pierce: def.pierce || 0,
            chainCount: def.chainCount || 0,
            splashRadius: def.splashRadius || 0,
            homingStrength: def.homingStrength || 0,
            level: maxLevel,
            quality: bestQuality,
            healOnHit: def.healOnHit || 0,
            auraHeal: def.auraHeal || 0,
            auraRadius: def.auraRadius || 0,
            burnDps: def.burnDps || 0,
            burnMaxStacks: def.burnMaxStacks || 0,
            meleeRange: def.meleeRange || 0,
            critBounce: def.critBounce || 0,
            attackRange: def.attackRange || 0,
            bulletMaxRange: def.bulletMaxRange || 0,
            sprayCone: def.sprayCone || 0,
            iceExplosionRadius: def.iceExplosionRadius || 0,
            tag: def.tag || '',
            // FormulaSystem 引用
            _weaponDef: def,
            _weaponLevel: maxLevel,
            _weaponQuality: bestQuality,
        };
    },

    _applyWeaponMods(player, mods) {
        if (mods.damageMult) player.damage = StatsSystem.clampStat('damage', Math.floor(player.damage * (1 + mods.damageMult)));
        if (mods.attackSpeedMult) player.attackSpeed = StatsSystem.clampStat('attackSpeed', player.attackSpeed * (1 + mods.attackSpeedMult));
        if (mods.attackRangeMult) player.attackRange = StatsSystem.clampStat('attackRange', player.attackRange * mods.attackRangeMult);
        if (mods.bulletSpeedMult) player.bulletSpeed = StatsSystem.clampStat('bulletSpeed', player.bulletSpeed * mods.bulletSpeedMult);
        if (mods.speedMult) player.speed = StatsSystem.clampStat('speed', player.speed * (1 + mods.speedMult));
        if (mods.hpRegenAdd) player.hpRegen += mods.hpRegenAdd;
        if (mods.armorAdd) player.armor = StatsSystem.clampStat('armor', player.armor + mods.armorAdd);
        if (mods.critChanceAdd) player.critChance = StatsSystem.clampStat('critChance', player.critChance + mods.critChanceAdd);
        if (mods.critMultiplierAdd) player.critMultiplier = StatsSystem.clampStat('critMultiplier', player.critMultiplier + mods.critMultiplierAdd);
        if (mods.dodgeAdd) player.dodge = StatsSystem.clampStat('dodge', player.dodge + mods.dodgeAdd);
        if (mods.maxHpAdd) { player.maxHp += mods.maxHpAdd; player.hp += mods.maxHpAdd; }
    },

    _applyWeaponBehaviors(player, weapon) {
        if (!player.weaponParams) player.weaponParams = {};
        const quality = weapon.quality || 'T1';
        player.weaponParams[weapon.id] = {
            behavior: weapon.behavior || 'bullet',
            bulletCount: weapon.bulletCount || 1,
            bulletSpeed: weapon.bulletSpeed || 500,
            spread: weapon.spread || 0.1,
            pierce: weapon.pierce || 0,
            chainCount: weapon.chainCount || 0,
            splashRadius: weapon.splashRadius || 0,
            homingStrength: weapon.homingStrength || 0,
            healOnHit: weapon.healOnHit || 0,
            auraHeal: weapon.auraHeal || 0,
            auraRadius: weapon.auraRadius || 0,
            burnDps: weapon.burnDps || 0,
            burnMaxStacks: weapon.burnMaxStacks || 0,
            meleeRange: weapon.meleeRange || 0,
            critBounce: weapon.critBounce || 0,
            attackRange: weapon.attackRange || 0,
            bulletMaxRange: weapon.bulletMaxRange || 0,
            tag: weapon.tag || '',
            level: (player.weapons.find(w => w.id === weapon.id) || {}).level || 1,
            quality: quality,
            // FormulaSystem 引用
            _weaponDef: weapon,
            _weaponLevel: (player.weapons.find(w => w.id === weapon.id) || {}).level || 1,
            _weaponQuality: quality,
        };
    },

    // getTagCounts/getActiveSynergies 已迁移至 TagSystem (src/engine/tags.js)

    getOwnedItems(player) {
        if (!player || !player.items) return [];
        return player.items.map(id => this.allItems.find(i => i.id === id)).filter(Boolean);
    },

    getOwnedWeapons(player) {
        if (!player || !player.weapons) return [];
        return player.weapons.map(w => this.allWeapons.find(d => d.id === w.id)).filter(Boolean);
    },

    reset() {
        this.items = [];
        this.lockedItems = [];
        this.refreshCost = 1;
        this._boughtUniqueItems = [];
    }
};
