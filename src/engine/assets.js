// ============================================================
// assets.js - 资源图标系统（从ComfyUI生成的PNG文件加载）
// 武器大图标(large)、道具小暗图标(small/dim)、角色头像(round)
// ============================================================

// ============================================================
// 资源文件名映射：游戏逻辑 ID → 磁盘上实际的 PNG 文件 slug
// 解决代码 ID 与 ComfyUI 生成的 PNG 文件名不一致的问题
// ============================================================

// 敌人 sprite 帧文件夹名映射（仅缺失的 ID 需要映射）
// 磁盘上存在的帧文件夹: basic, boss, elite, fast, ranged, tank
// 缺失的: exploder, healer, mortar, blinker —— 退回到视觉接近的敌人类型
const ENEMY_SPRITE_SLUG = {
    exploder: 'basic',   // 爆炸怪 → 用基础怪 sprite
    healer:   'elite',   // 治疗怪 → 用精英怪 sprite（视觉接近）
    mortar:   'ranged',  // 迫击炮 → 用远程怪 sprite
    blinker:  'fast',    // 闪烁怪 → 用快速怪 sprite
};

// 道具图标文件名 slug 映射
// 磁盘上实际存在的文件（23 个）：
//   snake_case: blood_pact, burn_spreader, element_amp, energy_shield,
//               ice_core, lifesteal, magnet, piggy, regen, replicator,
//               scope, stim, thorn, critDmg
//   camelCase:  armorUp, critUp, dodgeUp, harvestUp, hpUp, luckUp,
//               pickupUp, rangeUp, speedUp
const ITEM_FILE_SLUG = {
    // snake_case → camelCase
    hp_up: 'hpUp',
    armor_up: 'armorUp',
    speed_up: 'speedUp',
    luck_up: 'luckUp',
    harvest_up: 'harvestUp',
    pickup_up: 'pickupUp',
    range_up: 'rangeUp',
    crit_up: 'critUp',
    dodge_up: 'dodgeUp',
    // snake_case → snake_case
    life_steal: 'lifesteal',
    // 以下道具在磁盘上不存在，使用替代品
    melee_dmg: 'critDmg',          // 近战伤害 → 暴击伤害（同为伤害类）
    ranged_dmg: 'critDmg',         // 远程伤害 → 暴击伤害
    heavy_bullets: 'magnet',       // 重弹 → 磁铁（占位）
    penetrator: 'magnet',
    medkit: 'regen',
    war_helm: 'armorUp',
    adrenaline: 'speedUp',
    thieves_blade: 'critUp',
    elemental_ring: 'element_amp',
    xp_boost: 'harvestUp',
    hunting_trophy: 'luckUp',
    coupon: 'piggy',
    glass_cannon: 'critDmg',
    reactive_armor: 'armorUp',
    life_stealer: 'lifesteal',
    iron_will: 'armorUp',
    berserker: 'critDmg',
    tardigrade: 'regen',
    ricochet: 'magnet',
    titan_heart: 'hpUp',
    ghost_cloak: 'dodgeUp',
    kings_crown: 'luckUp',
    baby_eagle: 'critUp',
    bloody_hand: 'lifesteal',
    lightning_core: 'element_amp',
    anvil: 'critDmg',
};

// 角色头像文件名 slug 映射 (已废弃, 改用 charIconHTML emoji 兜底)
// 留空对象以保持向后兼容, 新代码请直接用 id 加载
const CHAR_FILE_SLUG = {};

const AssetSystem = {
    // 图标缓存: { id: HTMLImageElement }
    weaponIcons: {},
    itemIcons: {},
    characterIcons: {},
    enemyIcons: {},
    // 角色头像加载失败的 ID 集合 (用于 charIconHTML 退到 emoji 兜底)
    _charFailedIds: new Set(),
    // Sprite 帧序列缓存: { entityId: [HTMLImageElement, ...] }
    enemySpriteFrames: {},
    // 方向帧缓存: { entityId: { down: [img,img,img,img], left: [...], right: [...], up: [...] } }
    enemyWalkFrames: {},

    _loaded: false,
    _loadQueue: [],
    _onReady: null,

    init() {
        if (this._loaded) return Promise.resolve();
        return (async () => {
            // 资产依赖 csv 数据(武器 id / 怪 id / 角色 id), 必须先等 DataLoader 预热
            if (typeof DataLoader !== 'undefined' && DataLoader.preloadAll) {
                await DataLoader.preloadAll();
            }
            return new Promise((resolve) => {
                this._onReady = resolve;
                this._preloadAll();
            });
        })();
    },

    /**
     * 把游戏逻辑 ID 转换为磁盘上实际的资源 slug
     * @param {string} kind - 'sprite' | 'item' | 'char'
     * @param {string} id - 游戏 ID
     * @returns {string} 磁盘文件名 slug
     */
    _slug(kind, id) {
        if (kind === 'sprite') return ENEMY_SPRITE_SLUG[id] || id;
        if (kind === 'item') return ITEM_FILE_SLUG[id] || id;
        if (kind === 'char') return CHAR_FILE_SLUG[id] || id;
        return id;
    },

    _preloadAll() {
        // 武器 ID 动态从 csv 派生(避免硬编码白名单遗漏新武器如 cold_spray/flame_spray/poison_spray 等)
        let weaponIds = [];
        if (typeof ShopSystem !== 'undefined' && Array.isArray(ShopSystem.allWeapons) && ShopSystem.allWeapons.length > 0) {
            weaponIds = ShopSystem.allWeapons.map(w => w.id).filter(Boolean);
        } else if (typeof DataLoader !== 'undefined' && DataLoader._cache && Array.isArray(DataLoader._cache.weapons)) {
            weaponIds = DataLoader._cache.weapons.map(w => w.id).filter(Boolean);
        }
        const ids = {
            weapon: weaponIds,
            item: ['hp_up','regen','armor_up','speed_up','luck_up','harvest_up','pickup_up','range_up','crit_up','life_steal','melee_dmg','ranged_dmg',
            'stim','heavy_bullets','penetrator','medkit','war_helm','adrenaline','thieves_blade','elemental_ring','xp_boost','hunting_trophy','coupon','magnet',
            'glass_cannon','energy_shield','blood_pact','replicator','scope','reactive_armor','life_stealer','iron_will','berserker','ice_core','burn_spreader','element_amp',
            'tardigrade','ricochet','titan_heart','ghost_cloak','kings_crown','baby_eagle','bloody_hand','lightning_core','anvil'],
            char: ['swordsman','gunslinger','fire_mage','archer','mech','assassin','medic','paladin','engineer','berserker','dragon_knight','crossbowman','boxer','axeman','lancer','blade_wielder','ninja','ji_master','teng_pai_guard'],
            enemy: ['basic','fast','exploder','tank','healer','ranged','mortar','blinker','elite','boss'],
        };

        const spriteFrameCount = 4;
        const _v = Date.now();
        let total = 0;
        let loaded = 0;
        const onLoad = () => {
            loaded++;
            if (loaded >= total) {
                this._loaded = true;
                if (this._onReady) this._onReady();
            }
        };

        // 预加载敌人待机 sprite 帧（用 slug 映射）
        for (const id of ids.enemy) {
            const slug = this._slug('sprite', id);
            this.enemySpriteFrames[id] = [];
            for (let f = 1; f <= spriteFrameCount; f++) {
                total++;
                const frameIdx = f;
                this._loadImage(`assets/sprites/enemies/${slug}/idle-${frameIdx}.png?v=${_v}`, (img) => {
                    const arr = this.enemySpriteFrames[id];
                    if (arr) arr[frameIdx - 1] = img;
                    onLoad();
                }, true);
            }
        }

        // 预加载敌人方向行走帧（用 slug 映射）
        const walkDirs = ['down', 'left', 'right', 'up'];
        for (const id of ids.enemy) {
            const slug = this._slug('sprite', id);
            this.enemyWalkFrames[id] = {};
            for (const dir of walkDirs) {
                this.enemyWalkFrames[id][dir] = [];
                for (let f = 1; f <= spriteFrameCount; f++) {
                    total++;
                    const frameIdx = f;
                    this._loadImage(`assets/sprites/enemies/${slug}/${dir}-${frameIdx}.png?v=${_v}`, (img) => {
                        const dirArr = this.enemyWalkFrames[id] ? this.enemyWalkFrames[id][dir] : null;
                        if (dirArr) dirArr[frameIdx - 1] = img;
                        onLoad();
                    }, true);
                }
            }
        }

        for (const id of ids.weapon) {
            total++;
            this._loadImage(`assets/weapons/cb_weapon_${id}_00001_.png?v=${_v}`, (img) => {
                this.weaponIcons[id] = img;
                onLoad();
            });
        }
        for (const id of ids.item) {
            const slug = this._slug('item', id);
            total++;
            this._loadImage(`assets/items/cb_item_${slug}_00001_.png?v=${_v}`, (img) => {
                this.itemIcons[id] = img;
                onLoad();
            });
        }
        for (const id of ids.char) {
            total++;
            // v1.2 双路径兜底: 优先 <id>.png (新约定), 失败回退 cb_char_<id>_00001_.png (旧约定)
            this._loadImage(`assets/chars/${id}.png?v=${_v}`, (img) => {
                this.characterIcons[id] = img;
                onLoad();
            }, false, () => {
                // 新路径 404, 尝试旧约定 (10 个旧角色 cb_char_*_00001_.png)
                this._loadImage(`assets/chars/cb_char_${id}_00001_.png?v=${_v}`, (img) => {
                    this.characterIcons[id] = img;
                    onLoad();
                }, false, () => {
                    // 两条路径都失败, 标记为 failed, charIconHTML 退到 emoji 兜底
                    this._charFailedIds.add(id);
                });
            });
        }
        for (const id of ids.enemy) {
            total++;
            this._loadImage(`assets/enemies/cb_enemy_${id}_00001_.png?v=${_v}`, (img) => {
                this.enemyIcons[id] = img;
                onLoad();
            });
        }

        if (total === 0) {
            this._loaded = true;
            if (this._onReady) this._onReady();
        }
    },

    _loadImage(src, callback, skipCleanup, onError) {
        const img = new Image();
        img.onload = () => {
            if (skipCleanup) {
                callback(img);
            } else {
                const cleaned = this._removeBlackBg(img);
                if (cleaned && cleaned.toDataURL) {
                    // 把清理后的 Canvas 转成 data URL，再包装成 Image，
                    // 这样 img.src 是有效字符串（不再返回 Canvas，导致 src="undefined"）
                    const cleanedImg = new Image();
                    cleanedImg.onload = () => callback(cleanedImg);
                    cleanedImg.onerror = () => callback(cleanedImg);
                    cleanedImg.src = cleaned.toDataURL();
                } else {
                    callback(img);
                }
            }
        };
        img.onerror = () => {
            console.warn(`[AssetSystem] Failed to load: ${src}`);
            if (onError) onError();
            const fallback = this._createFallback();
            fallback.onload = () => callback(fallback);
            fallback.onerror = () => callback(fallback);
        };
        img.src = src;
    },

    _removeBlackBg(img) {
        try {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth || img.width;
            c.height = img.naturalHeight || img.height;
            if (c.width === 0 || c.height === 0) return null;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, c.width, c.height);
            const data = imageData.data;

            const corners = [
                { r: data[0], g: data[1], b: data[2] },
                { r: data[(c.width - 1) * 4], g: data[(c.width - 1) * 4 + 1], b: data[(c.width - 1) * 4 + 2] },
                { r: data[(c.height - 1) * c.width * 4], g: data[(c.height - 1) * c.width * 4 + 1], b: data[(c.height - 1) * c.width * 4 + 2] },
                { r: data[(c.height - 1) * c.width * 4 + (c.width - 1) * 4], g: data[(c.height - 1) * c.width * 4 + (c.width - 1) * 4 + 1], b: data[(c.height - 1) * c.width * 4 + (c.width - 1) * 4 + 2] },
            ];
            const avgBrightness = corners.reduce((sum, p) => sum + p.r + p.g + p.b, 0) / 12;

            const threshold = 60;

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i], g = data[i+1], b = data[i+2];

                if (avgBrightness > 128) {
                    if (r > 255 - threshold && g > 255 - threshold && b > 255 - threshold) {
                        data[i+3] = 0;
                    }
                } else {
                    if (r + g + b < 50) {
                        data[i+3] = 0;
                    }
                }
            }
            ctx.putImageData(imageData, 0, 0);
            return c;
        } catch (e) {
            console.warn('[AssetSystem] _removeBlackBg failed:', e);
            return null;
        }
    },

    _createFallback() {
        const canvas = document.createElement('canvas');
        canvas.width = 48;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#333';
        ctx.fillRect(0, 0, 48, 48);
        ctx.fillStyle = '#666';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', 24, 24);
        const fallback = new Image();
        fallback.src = canvas.toDataURL();
        return fallback;
    },

    weaponIconHTML(id, size) {
        const img = this.weaponIcons[id];
        const s = size || 48;
        if (!img) return `<div class="icon-fallback weapon-fallback" style="width:${s}px;height:${s}px">W</div>`;
        return `<img class="asset-icon weapon-icon" src="${img.src}" alt="${id}" width="${s}" height="${s}" style="object-fit:contain;" >`;
    },

    itemIconHTML(id, size) {
        const img = this.itemIcons[id];
        const s = size || 28;
        if (!img) return `<div class="icon-fallback item-fallback" style="width:${s}px;height:${s}px">I</div>`;
        return `<img class="asset-icon item-icon" src="${img.src}" alt="${id}" width="${s}" height="${s}" style="object-fit:contain;" >`;
    },

    charIconHTML(id, size) {
        const s = size || 64;
        // v1.1 资源兜底策略: 如果头像资源加载失败, 显示角色 emoji 图标
        if (this._charFailedIds && this._charFailedIds.has(id)) {
            const charData = (typeof DataLoader !== 'undefined' && DataLoader._cache && DataLoader._cache.characters)
                ? DataLoader._cache.characters.find(c => c.id === id)
                : null;
            const emoji = (charData && charData.icon) ? charData.icon : '👤';
            return `<div class="icon-fallback char-fallback" style="width:${s}px;height:${s}px;font-size:${Math.round(s * 0.6)}px;line-height:${s}px;text-align:center">${emoji}</div>`;
        }
        const img = this.characterIcons[id];
        if (!img) return `<div class="icon-fallback char-fallback" style="width:${s}px;height:${s}px">C</div>`;
        return `<img class="asset-icon char-icon" src="${img.src}" alt="${id}" width="${s}" height="${s}" style="object-fit:contain;" >`;
    },

    enemyIconHTML(id, size) {
        const img = this.enemyIcons[id];
        const s = size || 48;
        if (!img) return `<div class="icon-fallback enemy-fallback" style="width:${s}px;height:${s}px">E</div>`;
        return `<img class="asset-icon enemy-icon" src="${img.src}" alt="${id}" width="${s}" height="${s}" style="object-fit:contain;" >`;
    },
};
