// ============================================================
// assets.js — 资源图标系统
// 委托 ResourceLoader 按约定加载 assets/{dir}/{id}.png
// 每个 CSV 对应一个 assets/ 子目录
// ============================================================

// 敌人 sprite 帧文件夹名映射（缺失 sprite 目录的 ID 映射到现有目录）
const ENEMY_SPRITE_SLUG = {
    exploder:         'basic',
    healer:           'elite',
    mortar:           'ranged',
    blinker:          'fast',
    swarm:            'basic',
    summoner:         'elite',
    splitter:         'basic',
    shielded:         'tank',
    leech:            'fast',
    reflect:          'ranged',
    freezer:          'ranged',
    fireLord:         'boss',
    frostLord:        'boss',
    shadowAssassin:   'boss',
};

const AssetSystem = {
    /** @type {ResourceLoader} */
    weaponLoader: null,
    /** @type {ResourceLoader} */
    itemLoader: null,
    /** @type {ResourceLoader} */
    charLoader: null,
    /** @type {ResourceLoader} */
    enemyLoader: null,

    // 向后兼容缓存引用（renderer 通过 AssetSystem.weaponIcons[id] 直接访问）
    weaponIcons: {},
    itemIcons: {},
    characterIcons: {},
    enemyIcons: {},

    // 角色头像加载失败 ID（用于 charIconHTML emoji 兜底）
    _charFailedIds: new Set(),

    // 敌人 sprite 帧（不受 ResourceLoader 管理，结构特殊：frames + 方向）
    enemySpriteFrames: {},
    enemyWalkFrames: {},

    _loaded: false,
    _onReady: null,

    init() {
        if (this._loaded) return Promise.resolve();
        return (async () => {
            if (typeof DataLoader !== 'undefined' && DataLoader.preloadAll) {
                await DataLoader.preloadAll();
            }
            return new Promise((resolve) => {
                this._onReady = resolve;
                this._preloadAll();
            });
        })();
    },

    _preloadAll() {
        // 创建 ResourceLoader 实例，共享外部 cache 以便保持引用透明
        this.weaponLoader = new ResourceLoader({
            csvName: 'weapons',
            assetDir: 'weapons',
            fallbackText: 'W',
            skipCleanup: false,
        });
        this.itemLoader = new ResourceLoader({
            csvName: 'items',
            assetDir: 'items',
            fallbackText: 'I',
            skipCleanup: false,
        });
        this.charLoader = new ResourceLoader({
            csvName: 'characters',
            assetDir: 'chars',
            fallbackText: '👤',
            skipCleanup: false,
        });
        this.enemyLoader = new ResourceLoader({
            csvName: 'enemies',
            assetDir: 'enemies',
            fallbackText: 'E',
            skipCleanup: false,
        });

        // 共享 cache 引用 → renderer 通过 AssetSystem.weaponIcons[id] 仍可访问
        this.weaponIcons = this.weaponLoader.cache;
        this.itemIcons = this.itemLoader.cache;
        this.characterIcons = this.charLoader.cache;
        this.enemyIcons = this.enemyLoader.cache;
        this._charFailedIds = this.charLoader.failedIds;

        // 并行加载所有资源类型
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

        // ---------- 武器 ----------
        let weaponIds = [];
        if (typeof ShopSystem !== 'undefined' && Array.isArray(ShopSystem.allWeapons) && ShopSystem.allWeapons.length > 0) {
            weaponIds = ShopSystem.allWeapons.map(w => w.id).filter(Boolean);
        } else if (typeof DataLoader !== 'undefined' && DataLoader._cache && Array.isArray(DataLoader._cache.weapons)) {
            weaponIds = DataLoader._cache.weapons.map(w => w.id).filter(Boolean);
        }
        for (const id of weaponIds) {
            total++;
            this._loadImage(`assets/weapons/${id}.png?v=${_v}`, (img) => {
                this.weaponLoader.cache[id] = img;
                onLoad();
            });
        }

        // ---------- 道具（图片缺失是正常的，只缓存存在的 PNG，不缓存 fallback） ----------
        const itemIds = (typeof DataLoader !== 'undefined' && DataLoader._cache && Array.isArray(DataLoader._cache.items))
            ? DataLoader._cache.items.map(i => i.id).filter(Boolean) : [];
        for (const id of itemIds) {
            total++;
            this._loadImage(`assets/items/${id}.png?v=${_v}`, (img) => {
                this.itemLoader.cache[id] = img;
                onLoad();
            }, false, () => {
                // 不缓存 fallback → itemIconHTML 显示 'I' 文本兜底
                onLoad();
            });
        }

        // ---------- 角色 ----------
        const charIds = (typeof DataLoader !== 'undefined' && DataLoader._cache && Array.isArray(DataLoader._cache.characters))
            ? DataLoader._cache.characters.map(c => c.id).filter(Boolean) : [];
        for (const id of charIds) {
            total++;
            this._loadImage(`assets/chars/${id}.png?v=${_v}`, (img) => {
                this.charLoader.cache[id] = img;
                onLoad();
            }, false, () => {
                // 图片缺失 → charIconHTML 显示 emoji 兜底
                this.charLoader.failedIds.add(id);
                onLoad();
            });
        }

        // ---------- 敌人 ----------
        const enemyIds = (typeof DataLoader !== 'undefined' && DataLoader._cache && Array.isArray(DataLoader._cache.enemies))
            ? DataLoader._cache.enemies.map(e => e.id).filter(Boolean) : [];
        for (const id of enemyIds) {
            total++;
            this._loadImage(`assets/enemies/${id}.png?v=${_v}`, (img) => {
                this.enemyLoader.cache[id] = img;
                onLoad();
            });
        }

        // ---------- 敌人 sprite 帧（结构特殊，不走 ResourceLoader） ----------
        const allEnemyIds = enemyIds;
        const spriteFrameCount = 4;
        for (const id of allEnemyIds) {
            const slug = ENEMY_SPRITE_SLUG[id] || id;
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

        const walkDirs = ['down', 'left', 'right', 'up'];
        for (const id of allEnemyIds) {
            const slug = ENEMY_SPRITE_SLUG[id] || id;
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
            // 静默降级: 文件不存在是正常情况（只有部分资源有 PNG）
            // iconHTML 会被类型特定的兜底文本（I / W / C / E / emoji）
            if (onError) {
                onError();
            } else if (callback) {
                // 无 onError 时仍需通过 callback 确保计数推进
                const fallback = this._createFallback();
                fallback.onload = () => callback(fallback);
                fallback.onerror = () => callback(fallback);
            }
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
            console.warn('[AssetSystem] _removeBlackBg 失败:', e);
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

    // ===== HTML 生成器（委托 ResourceLoader，加类型特定兜底逻辑） =====

    weaponIconHTML(id, size) {
        const s = size || 48;
        const img = this.weaponIcons[id];
        if (!img) return `<div class="icon-fallback weapon-fallback" style="width:${s}px;height:${s}px">W</div>`;
        return `<img class="asset-icon weapon-icon" src="${img.src}" alt="${id}" width="${s}" height="${s}" style="object-fit:contain;" >`;
    },

    itemIconHTML(id, size) {
        const s = size || 28;
        const img = this.itemIcons[id];
        if (!img) return `<div class="icon-fallback item-fallback" style="width:${s}px;height:${s}px">I</div>`;
        return `<img class="asset-icon item-icon" src="${img.src}" alt="${id}" width="${s}" height="${s}" style="object-fit:contain;" >`;
    },

    charIconHTML(id, size) {
        const s = size || 64;
        // 角色特有：加载失败时显示 CSV 中的 emoji
        if (this._charFailedIds.has(id)) {
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
        const s = size || 48;
        const img = this.enemyIcons[id];
        if (!img) return `<div class="icon-fallback enemy-fallback" style="width:${s}px;height:${s}px">E</div>`;
        return `<img class="asset-icon enemy-icon" src="${img.src}" alt="${id}" width="${s}" height="${s}" style="object-fit:contain;" >`;
    },
};
