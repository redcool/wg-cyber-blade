// ============================================================
// cyberblade/shop.js - 黑市商店系统（武器+道具双轨制）
// 标签: melee / gun / bow / magic / medic / lance
// ============================================================

const _SHOP_STR = {
    error_slotFull: '武器槽位已满，无法购买新武器',
    log_csvNoData: 'CSV 加载成功但无有效武器数据',
    log_csvLoaded: '从 CSV 加载',
    log_csvWeapons: '种武器',
    log_csvFail: '武器CSV加载失败:',
    log_itemCsvNoData: '道具CSV 加载成功但无有效数据',
    log_itemCsvItems: '种道具',
    log_itemCsvFail: '道具CSV加载失败:',
    log_modsParseFail: 'mods 解析失败',
};
if (typeof DataLoader !== 'undefined') {
    DataLoader.load('shop_charsData').then(d => { if (d) Object.assign(_SHOP_STR, d); }).catch(() => {});
}

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
    _lastBuyError: '',

    config: {},

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
                console.warn('[ShopSystem] ' + _SHOP_STR.log_csvNoData);
            } else {
                console.log('[ShopSystem] ' + _SHOP_STR.log_csvLoaded, weapons.length, _SHOP_STR.log_csvWeapons);
                this.allWeapons = weapons;
            }
        } catch (e) {
            console.error('[ShopSystem] ' + _SHOP_STR.log_csvFail, e.message);
        }
    },

    _parseWeaponCSV(text) {
        const lines = text.split(/\r?\n/);
        const weapons = [];
        for (const rawLine of lines) {
            const trimmed = rawLine.trim();
            if (trimmed === '' || trimmed.startsWith('#')) continue;

            const fields = this._splitCSVLine(trimmed);
            if (fields.length < 43) continue;

            const toNum = (s) => { const v = parseFloat(s); return isNaN(v) ? 0 : v; };

            const [
                id, name, desc, icon, slotsStr, costStr, tag,
                minLevelStr,
                d1, d2, d3, d4,                                 // damage_lv1~4
                c1, c2, c3, c4,                                 // cooldown_lv1~4
                atkRangeMultStr, speedMultStr,
                critChAddStr, critDmgAddStr, armorAddStr, hpRegAddStr, maxHpAddStr, lifestealAddStr,
                bulletCountStr, bulletSpeedStr, bulletMaxRangeStr,
                attackRangeStr, spreadStr, pierceStr, meleeRangeStr,
                burnDpsStr, burnMaxStacksStr, chainCountStr, splashRadiusStr, homingStr,
                slowAmtStr, slowDurStr,
                healOnHitStr, auraHealStr, auraRadiusStr, sprayConeStr,
                behavior, classStr, knockbackStr, magSizeStr, reloadTimeStr
            ] = fields;

            weapons.push({
                id, name, desc, icon,
                slots: toNum(slotsStr) || 1,
                cost: toNum(costStr) || 0,
                tag,
                minLevel: toNum(minLevelStr) || 1,
                damage_lv1: toNum(d1), damage_lv2: toNum(d2),
                damage_lv3: toNum(d3), damage_lv4: toNum(d4),
                cooldown_lv1: toNum(c1), cooldown_lv2: toNum(c2),
                cooldown_lv3: toNum(c3), cooldown_lv4: toNum(c4),
                attackRangeMult: toNum(atkRangeMultStr) || 0,
                speedMult: toNum(speedMultStr) || 0,
                critChanceAdd: toNum(critChAddStr) || 0,
                critDamageAdd: toNum(critDmgAddStr) || 0,
                armorAdd: toNum(armorAddStr) || 0,
                hpRegenAdd: toNum(hpRegAddStr) || 0,
                maxHpAdd: toNum(maxHpAddStr) || 0,
                lifeStealAdd: toNum(lifestealAddStr) || 0,
                bulletCount: toNum(bulletCountStr) || 1,
                bulletSpeed: toNum(bulletSpeedStr) || 500,
                bulletMaxRange: toNum(bulletMaxRangeStr) || 0,
                attackRange: toNum(attackRangeStr) || 0,
                spread: toNum(spreadStr) || 0.1,
                pierce: toNum(pierceStr) || 0,
                meleeRange: toNum(meleeRangeStr) || 0,
                burnDps: toNum(burnDpsStr) || 0,
                burnMaxStacks: toNum(burnMaxStacksStr) || 0,
                chainCount: toNum(chainCountStr) || 0,
                splashRadius: toNum(splashRadiusStr) || 0,
                homingStrength: toNum(homingStr) || 0,
                slowAmount: toNum(slowAmtStr) || 0,
                slowDuration: toNum(slowDurStr) || 0,
                healOnHit: toNum(healOnHitStr) || 0,
                auraHeal: toNum(auraHealStr) || 0,
                auraRadius: toNum(auraRadiusStr) || 0,
                sprayCone: toNum(sprayConeStr) || 0,
                behavior: behavior || 'bullet',
                class: classStr || 'Primitive',
                knockback: toNum(knockbackStr) || 0,
                magSize: toNum(magSizeStr) || 0,
                reloadTime: toNum(reloadTimeStr) || 0,
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
                console.warn('[ShopSystem] ' + _SHOP_STR.log_itemCsvNoData);
            } else {
                console.log('[ShopSystem] ' + _SHOP_STR.log_csvLoaded, items.length, _SHOP_STR.log_itemCsvItems);
                this.allItems = items;
            }
        } catch (e) {
            console.error('[ShopSystem] ' + _SHOP_STR.log_itemCsvFail, e.message);
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
            const inflationCost = Math.round(base.cost + currentWave + base.cost * 0.1 * currentWave);
            const cost = Math.max(1, inflationCost);
            this.items.push({ ...base, type: 'weapon', locked: false, quality: 'T1', cost: cost });
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
                this._lastBuyError = _SHOP_STR.error_slotFull;
                return false;
            }

            player.materials -= actualCost;
            const newWeapon = { id: item.id, level: 1, quality: quality };
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

        const refund = Math.floor(def.cost / 2) + 1;
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
