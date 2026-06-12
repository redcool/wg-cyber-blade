// ============================================================
// engine/engine.js - 游戏引擎主循环（通用框架）
// ============================================================

// 游戏世界（通用）
const GameWorld = {
    width: 3000,
    height: 3000,
    materials: []
};

// 游戏引擎主循环（骨架 — 具体游戏逻辑在 cyberblade/main.js 中补充）
const GameEngine = {
    running: false,
    state: 'menu', // menu, playing, shopping, levelup, gameover, loot, pause, victory
    lastTime: 0,
    announceTimer: 0,
    levelUpPending: false,
    /**
     * 无尽模式标志: 第 19 关商店选择"无尽模式"后置 true,关卡无上限
     * 非无尽模式: 第 20 关 boss 死亡 → 通关结算 (state='victory')
     * 无尽模式: 第 20 关 boss 死亡 → 掉高级宝箱 → 继续 21+
     */
    endlessMode: false,

    async init() {
        // AssetSystem.init 内部已经 await DataLoader.preloadAll (asset 依赖 csv 列表)
        await AssetSystem.init();
        // 加载等级成长表到 FormulaSystem + StatsSystem
        if (typeof FormulaSystem !== 'undefined' && FormulaSystem.loadLevelTable) {
            const levelData = (typeof DataLoader !== 'undefined' && DataLoader._cache && DataLoader._cache.characterLevel)
                ? DataLoader._cache.characterLevel : [];
            FormulaSystem.loadLevelTable(levelData);
            if (typeof StatsSystem !== 'undefined' && StatsSystem.loadXpTable) {
                StatsSystem.loadXpTable(levelData);
            }
        }
        // 并行加载各系统数据
        await Promise.all([
            CharacterSystem.loadCharacters ? CharacterSystem.loadCharacters() : Promise.resolve(),
            typeof ItemSystem !== 'undefined' && ItemSystem.loadItems ? ItemSystem.loadItems() : Promise.resolve(),
            typeof PassiveSystem !== 'undefined' && PassiveSystem.loadPassives ? PassiveSystem.loadPassives() : Promise.resolve(),
            typeof LevelUpSystem !== 'undefined' && LevelUpSystem.loadCards ? LevelUpSystem.loadCards() : Promise.resolve(),
            typeof RarityColorSystem !== 'undefined' && RarityColorSystem.load ? RarityColorSystem.load() : Promise.resolve(),
            ShopSystem.loadData ? ShopSystem.loadData() : Promise.resolve(),
            EnemySystem.loadEnemies ? EnemySystem.loadEnemies() : Promise.resolve(),
            typeof WaveSystem !== 'undefined' && WaveSystem.loadWaves ? WaveSystem.loadWaves() : Promise.resolve(),
            typeof BossSystem !== 'undefined' && BossSystem.loadBosses ? BossSystem.loadBosses() : Promise.resolve(),
        ]);
        // 同步稀有度颜色配置到各系统
        if (typeof ShopSystem !== 'undefined' && ShopSystem._syncRarityColors) {
            ShopSystem._syncRarityColors();
        }
        if (typeof LootSystem !== 'undefined' && LootSystem._syncRarityColors) {
            LootSystem._syncRarityColors();
        }
        await Time.loadConfig();
        Input.init();
        Renderer.init();
        UISystem.init();
        if (typeof UnlockSystem !== 'undefined' && UnlockSystem.loadData) {
            UnlockSystem.loadData();
        }
        this._respawn();
        UISystem.showMenu();
        this.running = true;
        this.lastTime = performance.now();
        this._loop();
    },

    _respawn() {
        PlayerSystem.create(GameWorld.width / 2, GameWorld.height / 2);
    },

    _loop() {
        if (!this.running) return;

        try {
            const now = performance.now();
            const rawDt = (now - this.lastTime) / 1000;
            const dt = Math.min(rawDt, 0.05);
            this.lastTime = now;

            // 应用时间倍率（用于调试/加速测试）
            const scaledDt = Time.scale(dt);

            if (this.state === 'playing') {
                this._updatePlaying(scaledDt);
            } else if (this.state === 'shopping') {
                this._updateShopping(scaledDt);
            }
            // 'paused' / 'menu' / 'levelup' / 'gameover' / 'loot': 跳过 update, 渲染继续 (overlay 在上层)

            this._render();
        } catch (e) {
            console.error('[GameEngine] 游戏循环异常:', e);
            const errDiv = document.getElementById('gameErrorDisplay');
            if (errDiv) {
                errDiv.textContent = '⚠ ' + (e.message || e);
                errDiv.style.display = 'block';
            } else {
                const el = document.createElement('div');
                el.id = 'gameErrorDisplay';
                el.style.cssText = 'position:fixed;top:10px;right:10px;z-index:9999;background:rgba(255,0,68,0.85);color:#fff;padding:10px 16px;border-radius:6px;font:14px monospace;max-width:400px;word-break:break-all';
                el.textContent = '⚠ ' + (e.message || e);
                document.body.appendChild(el);
            }
        }

        requestAnimationFrame(() => this._loop());
    },

    _render() {
        const player = PlayerSystem.player;
        Renderer.beginFrame(player);

        Renderer.drawBackground();
        Renderer.drawWorldBounds();

        for (const mat of GameWorld.materials) Renderer.drawMaterial(mat);
        if (typeof ContainerSystem !== 'undefined') {
            for (const crate of ContainerSystem.crates) Renderer.drawCrate(crate);
        }
        if (typeof HealthPickupSystem !== 'undefined') {
            for (const pk of HealthPickupSystem.pickups) Renderer.drawHealthPickup(pk);
        }
        if (typeof LootSystem !== 'undefined') {
            for (const chest of LootSystem.pendingChests) {
                if (chest.alive) Renderer.drawChest(chest);
            }
        }
        for (const enemy of EnemySystem.enemies) Renderer.drawEnemy(enemy);
        for (const p of ParticleSystem.particles) Renderer.drawParticle(p);
        Renderer.drawPlayer(player);

        // Boss 波红色关门屏障（Brotato 风格）
        const hasActiveBoss = EnemySystem.enemies.some(e => e.alive && e.isBoss);
        if (hasActiveBoss) Renderer.drawBossBarrier();
        for (const b of BulletSystem.bullets) Renderer.drawBullet(b);
        if (typeof TurretSystem !== 'undefined') {
            // 先画激光（在炮塔下方），再画炮塔，最后画子弹
            for (const t of TurretSystem.turrets) Renderer.drawTurretBeam(t);
            for (const t of TurretSystem.turrets) Renderer.drawTurret(t);
            for (const b of TurretSystem.bullets) Renderer.drawTurretBullet(b);
        }

        if (this.state === 'playing' && this.announceTimer > 0) {
            Renderer.drawWaveAnnouncement(WaveSystem.currentLevel);
        }

        Renderer.endFrame();
        Renderer.drawHUDEffects(player);
    }
};

// 启动入口（延迟到 DOM 就绪）
window.addEventListener('DOMContentLoaded', () => GameEngine.init());
