// ============================================================
// assets.js - 资源图标系统（从ComfyUI生成的PNG文件加载）
// 武器大图标(large)、道具小暗图标(small/dim)、角色头像(round)
// ============================================================
const AssetSystem = {
    // 图标缓存: { id: HTMLImageElement }
    weaponIcons: {},
    itemIcons: {},
    characterIcons: {},
    enemyIcons: {},
    // Sprite 帧序列缓存: { entityId: [HTMLImageElement, ...] }
    enemySpriteFrames: {},
    // 方向帧缓存: { entityId: { down: [img,img,img,img], left: [...], right: [...], up: [...] } }
    enemyWalkFrames: {},

    _loaded: false,
    _loadQueue: [],
    _onReady: null,

    init() {
        if (this._loaded) return Promise.resolve();
        return new Promise((resolve) => {
            this._onReady = resolve;
            this._preloadAll();
        });
    },

    _preloadAll() {
        const ids = {
            weapon: [
                'pistol','smg','shotgun','sniper','gatling','revolver','rifle','rifle2','shotgun_double','magnum','minigun',
                'bow','crossbow','longbow','recurve','explosive_arrow','frost_arrow','poison_arrow','triple_shot','piercing_shot','homing_bow',
                'plasma','axe','dagger','chainsaw','sword','katana','hammer','spear','claws','whip',
                'fire_staff','frost_staff','thunder_staff','energy_staff','magic_orb','poison_staff','void_staff','lightning_staff','fire_wand','arcane_orb',
                'heal_gun','shield','holy_staff','life_wand','blessing',
                'pike','cavalry_lance','trident',
            ],
            item: ['hpUp','regen','armorUp','dodgeUp','critUp','critDmg','speedUp','lifesteal','rangeUp','harvestUp','pickupUp','luckUp','thorn','energy_shield','stim','replicator','magnet','piggy','blood_pact','scope','burn_spreader','ice_core','element_amp',
            'reactive_armor','penetrator','heavy_bullets','coupon','hunting_trophy','glass_cannon','berserker'],
            char: ['swordsman','gunslinger','fire_mage','archer','mech','assassin','medic','paladin','engineer','berserker','dragon_knight'],
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

        // 预加载敌人待机 sprite 帧
        for (const id of ids.enemy) {
            this.enemySpriteFrames[id] = [];
            for (let f = 1; f <= spriteFrameCount; f++) {
                total++;
                const frameIdx = f;
                this._loadImage(`assets/sprites/enemies/${id}/idle-${frameIdx}.png?v=${_v}`, (img) => {
                    const arr = this.enemySpriteFrames[id];
                    if (arr) arr[frameIdx - 1] = img;
                    onLoad();
                }, true);
            }
        }

        // 预加载敌人方向行走帧
        const walkDirs = ['down', 'left', 'right', 'up'];
        for (const id of ids.enemy) {
            this.enemyWalkFrames[id] = {};
            for (const dir of walkDirs) {
                this.enemyWalkFrames[id][dir] = [];
                for (let f = 1; f <= spriteFrameCount; f++) {
                    total++;
                    const frameIdx = f;
                    this._loadImage(`assets/sprites/enemies/${id}/${dir}-${frameIdx}.png?v=${_v}`, (img) => {
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
            total++;
            this._loadImage(`assets/items/cb_item_${id}_00001_.png?v=${_v}`, (img) => {
                this.itemIcons[id] = img;
                onLoad();
            });
        }
        for (const id of ids.char) {
            total++;
            this._loadImage(`assets/chars/cb_char_${id}_00001_.png?v=${_v}`, (img) => {
                this.characterIcons[id] = img;
                onLoad();
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

    _loadImage(src, callback, skipCleanup) {
        const img = new Image();
        img.onload = () => {
            if (skipCleanup) {
                callback(img);
            } else {
                const cleaned = this._removeBlackBg(img);
                callback(cleaned || img);
            }
        };
        img.onerror = () => {
            console.warn(`[AssetSystem] Failed to load: ${src}`);
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
        return `<img class="asset-icon weapon-icon" src="${img.src}" alt="${id}" width="${s}" height="${s}" >`;
    },

    itemIconHTML(id, size) {
        const img = this.itemIcons[id];
        const s = size || 28;
        if (!img) return `<div class="icon-fallback item-fallback" style="width:${s}px;height:${s}px">I</div>`;
        return `<img class="asset-icon item-icon" src="${img.src}" alt="${id}" width="${s}" height="${s}" >`;
    },

    charIconHTML(id, size) {
        const img = this.characterIcons[id];
        const s = size || 64;
        if (!img) return `<div class="icon-fallback char-fallback" style="width:${s}px;height:${s}px">C</div>`;
        return `<img class="asset-icon char-icon" src="${img.src}" alt="${id}" width="${s}" height="${s}" >`;
    },

    enemyIconHTML(id, size) {
        const img = this.enemyIcons[id];
        const s = size || 48;
        if (!img) return `<div class="icon-fallback enemy-fallback" style="width:${s}px;height:${s}px">E</div>`;
        return `<img class="asset-icon enemy-icon" src="${img.src}" alt="${id}" width="${s}" height="${s}" >`;
    },
};
