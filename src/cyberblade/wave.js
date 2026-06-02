// ============================================================
// wave.js - 关卡系统（无限关卡，难度逐关递增）
// ============================================================
const WaveSystem = {
    currentLevel: 0,
    waveTimer: 0,
    spawnTimer: 0,
    waveActive: false,
    waveTransitioning: false,
    _bossSpawned: false,

    /** 当前关卡时长（Boss关40s，标准30s） */
    get levelDuration() {
        return (this.currentLevel % 5 === 0) ? 40 : 30;
    },

    // 敌人类型池（10种敌人，随关卡数解锁）
    get _availableTypes() {
        const lv = this.currentLevel;
        const types = ['basic'];
        if (lv >= 2) types.push('fast');
        if (lv >= 3) types.push('exploder');
        if (lv >= 4) types.push('tank');
        if (lv >= 5) types.push('healer');
        if (lv >= 6) types.push('ranged');
        if (lv >= 7) types.push('mortar');
        if (lv >= 8) types.push('blinker');
        if (lv >= 10) types.push('elite');
        if (lv >= 15 && lv % 5 === 0) types.push('boss');
        return types;
    },

    /** 获取生成间隔（随关卡递增变快）：2.0s → 0.5s */
    get _spawnInterval() {
        return Math.max(0.5, 2.0 - (this.currentLevel - 1) * 0.05);
    },

    /** 获取每次生成操作的怪物数量（按关卡区间划分） */
    get _spawnsPerTick() {
        const lv = this.currentLevel;
        if (lv <= 0) return 0;
        if (lv === 1) return 1;
        if (lv <= 3) return Math.random() < 0.5 ? 2 : 1;
        if (lv <= 6) return 2 + Math.floor(Math.random() * 2);
        if (lv <= 9) return 3 + Math.floor(Math.random() * 2);
        if (lv <= 14) return 3 + Math.floor(Math.random() * 3);
        if (lv <= 19) return 4 + Math.floor(Math.random() * 3);
        return 5 + Math.floor(Math.random() * 4);
    },

    /** 同时在场敌人上限 */
    get _maxSimultaneous() {
        return Math.min(30, 6 + Math.floor(this.currentLevel * 0.8));
    },

    /** 开始下一关 */
    startNextLevel() {
        this.currentLevel++;
        this.waveActive = true;
        this.waveTimer = 0;
        this.spawnTimer = 0;
        this.waveTransitioning = false;
        this._bossSpawned = false;
        ChestSystem.collectedCount = 0;
        const medkitCount = 2 + Math.floor(Math.random() * 2);
        MedkitSystem.spawnCrates(medkitCount);
        return true;
    },

    update(dt, player) {
        if (!this.waveActive) return;

        this.waveTimer += dt;
        this.spawnTimer += dt;

        const maxAlive = this._maxSimultaneous;
        const interval = this._spawnInterval;

        if (this.spawnTimer >= interval) {
            this.spawnTimer = 0;
            const count = this._spawnsPerTick;
            const types = this._availableTypes;

            for (let i = 0; i < count; i++) {
                const aliveCount = EnemySystem.enemies.filter(e => e.alive).length;
                if (aliveCount >= maxAlive) break;

                let type = this._pickWeightedType(types);
                if (type === 'elite' && EnemySystem.enemies.some(e => e.alive && e.isElite)) {
                    type = 'basic';
                }
                const pos = this._getSpawnPosition(player);
                EnemySystem.create(type, pos.x, pos.y, this.currentLevel);
            }
        }

        if (this.currentLevel % 5 === 0 && this.waveTimer > 4 && !this._bossSpawned) {
            this._bossSpawned = true;
            const bossType = this.currentLevel >= 15 ? 'boss' : 'elite';
            const pos = this._getSpawnPosition(player);
            EnemySystem.create(bossType, pos.x, pos.y, this.currentLevel);
        }

        if (this.waveTimer >= this.levelDuration) {
            this.waveActive = false;
            this.waveTransitioning = true;
            this._cleanupWave();
        }
    },

    /** 加权随机选择敌人类型 */
    _pickWeightedType(types) {
        const level = this.currentLevel;
        const weights = {};
        for (const t of types) {
            if (t === 'elite' || t === 'boss') { weights[t] = 0; continue; }
            switch (t) {
                case 'basic':    weights[t] = level <= 5 ? 35 : 20; break;
                case 'fast':     weights[t] = 25; break;
                case 'exploder': weights[t] = level <= 10 ? 18 : 10; break;
                case 'tank':     weights[t] = level <= 6 ? 8 : 14; break;
                case 'healer':   weights[t] = level <= 8 ? 0 : 12; break;
                case 'ranged':   weights[t] = level <= 8 ? 0 : 12; break;
                case 'mortar':   weights[t] = level <= 10 ? 0 : 8; break;
                case 'blinker':  weights[t] = level <= 10 ? 0 : 8; break;
                default:         weights[t] = 10;
            }
        }
        const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
        if (totalWeight <= 0) return 'basic';
        let r = Math.random() * totalWeight;
        for (const [type, w] of Object.entries(weights)) {
            r -= w;
            if (r <= 0) return type;
        }
        return 'basic';
    },

    _getSpawnPosition(player) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 350 + Math.random() * 200;
        let x = player.x + Math.cos(angle) * dist;
        let y = player.y + Math.sin(angle) * dist;
        x = Math.max(30, Math.min(GameWorld.width - 30, x));
        y = Math.max(30, Math.min(GameWorld.height - 30, y));
        return { x, y };
    },

    /** 清理场景：敌人消失（不掉材料）+ 子弹清除 + 金币清除 + 角色待机 */
    _cleanupWave() {
        for (const e of EnemySystem.enemies) {
            if (e.alive) {
                e.alive = false;
                ParticleSystem.emit(e.x, e.y, 6, {
                    speed: 50, color: e.color, life: 0.3, size: 4, type: 'glow'
                });
            }
        }
        BulletSystem.clear();
        GameWorld.materials = [];
        // 角色重置到待机状态
        this._resetPlayerIdle();
    },

    /** 重置角色攻击动画 → 待机 */
    _resetPlayerIdle() {
        const p = typeof PlayerSystem !== 'undefined' ? PlayerSystem.player : null;
        if (!p) return;
        if (p.weaponParams) {
            for (const key of Object.keys(p.weaponParams)) {
                const wp = p.weaponParams[key];
                wp._attackAnimTimer = 0;
                wp._attackAnimDuration = 0;
            }
        }
        p.weaponAnimations = [];
        p._sweepPending = null;
    },

    reset() {
        this.currentLevel = 0;
        this.waveActive = false;
        this.waveTransitioning = false;
        this._bossSpawned = false;
    }
};

// ============================================================
// MedkitSystem - 医药箱系统（可击破→掉落医疗包→拾取回血）
// ============================================================
const MedkitSystem = {
    crates: [],
    pickups: [],

    /** 每关生成医药箱 */
    spawnCrates(count) {
        this.crates = [];
        this.pickups = [];
        for (let i = 0; i < count; i++) {
            const x = 100 + Math.random() * (GameWorld.width - 200);
            const y = 100 + Math.random() * (GameWorld.height - 200);
            this.crates.push({
                x, y,
                hp: 30 + Math.floor(Math.random() * 20),
                maxHp: 30 + Math.floor(Math.random() * 20),
                radius: 18,
                alive: true,
            });
        }
    },

    /** 医药箱受击 */
    takeDamage(crate, damage) {
        if (!crate.alive) return false;
        crate.hp -= damage;
        ParticleSystem.emit(crate.x, crate.y, 4, {
            speed: 60, color: '#00ff88', life: 0.2, size: 3, type: 'spark'
        });
        if (crate.hp <= 0) {
            crate.alive = false;
            this._spawnPickups(crate);
            ParticleSystem.explosion(crate.x, crate.y, '#00ff88', 12);
            if (typeof CombatLogSystem !== 'undefined') {
                CombatLogSystem.logCrateBroken();
                CombatLogSystem.addEventText(crate.x, crate.y - 10, '❤️ 医药箱', '#00ff88', 13);
            }
            return true;
        }
        return false;
    },

    /** 击破后掉落医疗包 */
    _spawnPickups(crate) {
        const count = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) {
            this.pickups.push({
                x: crate.x + (Math.random() - 0.5) * 30,
                y: crate.y + (Math.random() - 0.5) * 30,
                healAmount: 15 + Math.floor(Math.random() * 11),
                lifeTimer: 8.0,
                radius: 8,
            });
        }
    },

    /** 更新医疗包生命周期 + 吸引 + 拾取检测 */
    update(dt, player) {
        const attractSpeed = 250;
        const collectDist = 10;
        for (let i = this.pickups.length - 1; i >= 0; i--) {
            const pk = this.pickups[i];
            pk.lifeTimer -= dt;
            if (pk.lifeTimer <= 0) {
                this.pickups.splice(i, 1);
                continue;
            }
            const dx = pk.x - player.x;
            const dy = pk.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < collectDist) {
                PlayerSystem.heal(pk.healAmount);
                ParticleSystem.emit(player.x, player.y, 8, {
                    speed: 60, color: '#00ff88', life: 0.4, size: 5, type: 'glow'
                });
                if (typeof AudioSystem !== 'undefined') AudioSystem.play('pickup');
                this.pickups.splice(i, 1);
            } else if (dist < player.pickupRange + pk.radius) {
                const factor = dt * attractSpeed / Math.max(1, dist);
                pk.x -= dx * factor;
                pk.y -= dy * factor;
            }
        }
    },

    clear() {
        this.crates = [];
        this.pickups = [];
    }
};

// ============================================================
// ChestSystem - 精英掉落宝箱系统（拾取→选择奖励）
// ============================================================
const ChestSystem = {
    chests: [],
    collectedCount: 0,
    pendingReward: null,
    pendingChests: [],

    /** 精英怪/ Boss 死亡时掉落宝箱（tier 1=精英, 2=Boss） */
    spawnChest(x, y, tier = 1) {
        this.chests.push({
            x, y,
            alive: true,
            radius: 16,
            tier: tier,
            bobPhase: Math.random() * Math.PI * 2
        });
        if (typeof CombatLogSystem !== 'undefined') {
            const tierName = tier === 2 ? '二级' : '一级';
            CombatLogSystem.addLog('📦', `掉落${tierName}宝箱`, '#ffcc00');
            CombatLogSystem.addEventText(x, y - 15, '📦 宝箱!', '#ffcc00', 14);
        }
    },

    /** 玩家拾取宝箱（战斗期间仅累加，关卡结束后统一选择奖励） */
    pickupChest(chest) {
        if (!chest.alive) return;
        chest.alive = false;
        this.collectedCount++;
        this.pendingChests.push({
            tier: chest.tier || 1,
            x: chest.x,
            y: chest.y
        });
        ParticleSystem.explosion(chest.x, chest.y, '#ffcc00', 15);
    },

    /** 展示下一个待处理的宝箱奖励 */
    showNextPendingReward() {
        if (this.pendingChests.length === 0) {
            if (typeof GameEngine !== 'undefined') {
                GameEngine.onChestRewardBatchComplete();
            }
            return;
        }

        const chest = this.pendingChests.shift();
        const options = this._generateRewardOptions(chest.tier);

        this.pendingReward = {
            options: options,
            chestTier: chest.tier,
            onChoose: (selectedId) => {
                const opt = options.find(o => o.id === selectedId);
                if (opt && opt.apply) opt.apply();
                this.pendingReward = null;
                this.showNextPendingReward();
                ParticleSystem.levelUp(PlayerSystem.player.x, PlayerSystem.player.y);
            }
        };

        if (typeof GameEngine !== 'undefined') {
            GameEngine.state = 'chestreward';
            UISystem.showChestReward();
        }
    },

    /** 生成3个随机奖励选项（tier 1=精英奖励, tier 2=Boss高级奖励） */
    _generateRewardOptions(tier) {
        const p = PlayerSystem.player;
        if (!p) return [];

        const isBossTier = tier === 2;

        const baseOptions = [
            { id: 'materials', name: '金币袋', desc: isBossTier ? '获得 50~80 金币' : '获得 20~40 金币', icon: '🪙',
              apply: () => { p.materials += isBossTier ? (50 + Math.floor(Math.random() * 31)) : (20 + Math.floor(Math.random() * 21)); StatsSystem.clampPlayer(p); } },
            { id: 'hpHeal', name: '生命恢复', desc: isBossTier ? '恢复 50% 最大生命' : '恢复 35% 最大生命', icon: '❤️',
              apply: () => { PlayerSystem.heal(Math.floor(p.maxHp * (isBossTier ? 0.50 : 0.35))); } },
            { id: 'armorUp', name: '护甲提升', desc: isBossTier ? '护甲 +8' : '护甲 +5', icon: '🛡️',
              apply: () => { p.armor = Math.min(100, p.armor + (isBossTier ? 8 : 5)); } },
            { id: 'speedUp', name: '疾风', desc: isBossTier ? '移速 +40' : '移速 +25', icon: '⚡',
              apply: () => { p.speed = Math.min(400, p.speed + (isBossTier ? 40 : 25)); } },
            { id: 'attackSpeed', name: '攻速提升', desc: '攻速 +15%', icon: '⚡',
              apply: () => { p.attackSpeed = Math.min(5.0, p.attackSpeed * 1.15); } },
            { id: 'regen', name: '再生', desc: isBossTier ? '生命回复 +2/秒' : '生命回复 +1/秒', icon: '💚',
              apply: () => { p.hpRegen += isBossTier ? 2.0 : 1.0; } },
        ];

        const bossOptions = [
            { id: 'tempDamage', name: '狂怒', desc: '攻击力 +30% 持续本关', icon: '🗡️',
              apply: () => { p.damage = Math.floor(p.damage * 1.30); StatsSystem.clampPlayer(p); } },
            { id: 'xpBoost', name: '经验加成', desc: '获得大量经验值', icon: '⬆️',
              apply: () => {
                  const xpGain = Math.floor(StatsSystem.xpForLevel(p.level) * 0.35);
                  if (PlayerSystem.addXP(xpGain)) {
                      if (typeof GameEngine !== 'undefined') GameEngine.levelUpPending = true;
                  }
              } },
            { id: 'critBoost', name: '暴击强化', desc: '暴击 +6%', icon: '💥',
              apply: () => { p.critChance = Math.min(0.8, p.critChance + 0.06); } },
            { id: 'lifeSteal', name: '生命偷取', desc: '偷取 +4%', icon: '🩸',
              apply: () => { p.lifeSteal = Math.min(0.5, p.lifeSteal + 0.04); } },
        ];

        if (isBossTier) {
            return [...baseOptions, ...bossOptions].sort(() => Math.random() - 0.5).slice(0, 3);
        }

        const mixed = [...baseOptions].sort(() => Math.random() - 0.5).slice(0, 2);
        const bossPick = [...bossOptions].sort(() => Math.random() - 0.5).slice(0, 1);
        return [...mixed, ...bossPick].sort(() => Math.random() - 0.5);
    },

    /** 每帧更新：宝箱吸引 + 拾取检测 */
    update(dt, player) {
        const attractSpeed = 180;
        const collectDist = 12;
        for (let i = this.chests.length - 1; i >= 0; i--) {
            const ch = this.chests[i];
            if (!ch.alive) {
                this.chests.splice(i, 1);
                continue;
            }
            const dx = ch.x - player.x;
            const dy = ch.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < collectDist) {
                this.pickupChest(ch);
                if (typeof AudioSystem !== 'undefined') AudioSystem.play('pickup');
            } else if (dist < player.pickupRange + ch.radius) {
                const factor = dt * attractSpeed / Math.max(1, dist);
                ch.x -= dx * factor;
                ch.y -= dy * factor;
                ch.bobPhase += dt * 8;
            }
        }
    },

    clear() {
        this.chests = [];
        this.collectedCount = 0;
        this.pendingReward = null;
        this.pendingChests = [];
    }
};
