// ============================================================
// shop.js - 黑市商店系统（武器+道具双轨制）
// 标签: melee / gun / bow / magic / medic
// ============================================================
const ShopSystem = {
    items: [],          // 当前出售列表
    lockedItems: [],    // 玩家锁定的物品（跨黑市保留）
    refreshCost: 1,     // 刷新消耗（每次+1：1,2,3...）
    _boughtUniqueItems: [],  // 已购买的独特道具ID列表

    /* ==================== 配置表 ==================== */
    config: {
        // 武器始终与道具一同出现
    },

    /* ==================== 词条系统（武器属性词条） ==================== */
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

    /** 生成指定等级的随机词条 */
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

    /** 选取一个不重复的词条ID */
    _rollNewAffixId(existingIds) {
        const pool = Object.keys(this.affixDefs).filter(id => !existingIds.includes(id));
        if (pool.length === 0) return null;
        return pool[Math.floor(Math.random() * pool.length)];
    },

    /** 初始化新武器的词条（1级→1个词条） */
    _initWeaponAffixes(weapon) {
        const level = weapon.level || 1;
        weapon.affixes = [this._rollAffix(level)];
    },

    /** 合并时增加现有词条的数值 */
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

    /** 获取重随费用 */
    getRerollCost(weapon) {
        const level = weapon.level || 1;
        const quality = weapon.quality || 'T1';
        const baseCosts = { T1: 5, T2: 8, T3: 14, T4: 22 };
        const base = baseCosts[quality] || 5;
        // 每次已重随过 +2 费用（防无限白嫖）
        const rerollPenalty = (weapon._rerollCount || 0) * 2;
        return base + (level - 1) * 3 + rerollPenalty;
    },

    /** 花费金币重随武器所有词条 */
    rerollAffixes(weapon, player) {
        const cost = this.getRerollCost(weapon);
        if (player.materials < cost) return false;
        player.materials -= cost;
        weapon._rerollCount = (weapon._rerollCount || 0) + 1;
        // 完全重新生成词条（保持数量不变）
        const level = weapon.level || 1;
        const expectedCount = 1 + Math.floor((level - 1) / 3);
        weapon.affixes = [];
        const existingIds = [];
        for (let i = 0; i < expectedCount; i++) {
            const newId = this._rollNewAffixId(existingIds);
            if (!newId) {
                // 词条池耗尽，允许重复
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
        // 重新应用词条加成
        this._updateWeaponParams(player, weapon.id);
        PlayerSystem._updateSynergies();
        return { cost, newAffixes: weapon.affixes };
    },

    /** 应用合并升级并标记高亮词条（新增/数值提升） */
    _applyMergeWithHighlights(weapon, fromLevel) {
        // 快照合并前的词条状态
        const before = (weapon.affixes || []).map(a => ({ id: a.id, value: a.value }));

        // 执行合并逻辑
        this._increaseAffixesOnMerge(weapon, fromLevel);
        this._ensureAffixCount(weapon);

        // 比较并标记高亮
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

        // 3秒后自动清除高亮
        if (weapon._highlightTimer) clearTimeout(weapon._highlightTimer);
        weapon._highlightTimer = setTimeout(() => {
            delete weapon._affixHighlights;
            delete weapon._highlightTimer;
        }, 3000);
    },

    /** 确保词条数量达到当前等级应有的数量（每3级+1个） */
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

    /* ==================== 品质系统（T1~T4） ==================== */
    qualityDefs: {
        T1: { name: '普通', color: '#aaaaaa', bg: 'rgba(170,170,170,0.12)', damageMult: 1.0,  costMult: 1.0,  minWave: 1,  rollWeight: 45 },
        T2: { name: '优秀', color: '#4488ff', bg: 'rgba(68,136,255,0.12)', damageMult: 1.3,  costMult: 1.8,  minWave: 3,  rollWeight: 30 },
        T3: { name: '稀有', color: '#aa44ff', bg: 'rgba(170,68,255,0.12)', damageMult: 1.6,  costMult: 2.8,  minWave: 6,  rollWeight: 18 },
        T4: { name: '传说', color: '#ff6600', bg: 'rgba(255,102,0,0.15)', damageMult: 2.0,  costMult: 4.0,  minWave: 10, rollWeight: 7 },
    },

    /** 根据当前关卡 roll 武器品质 */
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

    /* ==================== 武器标签与羁绊定义 ==================== */
    tagInfo: {
        melee: { name: '近战', icon: '⚔️', desc: '吸血/暴伤流派' },
        gun:   { name: '枪械', icon: '🔫', desc: '射程/弹速流派' },
        bow:   { name: '弓箭', icon: '🏹', desc: '暴击/穿透流派' },
        magic: { name: '元素', icon: '🔮', desc: '元素伤害/特效流派' },
        medic: { name: '医疗', icon: '💊', desc: '回复/吸血流派' },
        lance: { name: '骑枪', icon: '🔱', desc: '长距离突刺流派' },
    },

    // 羁绊加成定义（4档完整）
    synergyDefs: {
        melee: {
            1: { lifeStealAdd: 0.05, critMultiplierAdd: 0.50 },
            2: { lifeStealAdd: 0.10, critMultiplierAdd: 1.0 },
            3: { lifeStealAdd: 0.15, critMultiplierAdd: 1.5, armorAdd: 3 },
        },
        gun: {
            2: { attackRangeMult: 0.15 },
            3: { attackRangeMult: 0.30, bulletSpeedMult: 0.15 },
            4: { attackRangeMult: 0.45, bulletSpeedMult: 0.30, bulletCountAdd: 1 },
        },
        bow: {
            2: { critChanceAdd: 0.10 },
            3: { critChanceAdd: 0.15, critMultiplierAdd: 0.20 },
            4: { critChanceAdd: 0.20, critMultiplierAdd: 0.40, bulletPierceAdd: 1 },
        },
        magic: {
            2: { damageMult: 0.15 },
            3: { damageMult: 0.25, slowAmountAdd: 0.20 },
            4: { damageMult: 0.35, slowAmountAdd: 0.30, chainCountAdd: 1 },
        },
        medic: {
            2: { hpRegenAdd: 1.0 },
            3: { hpRegenAdd: 2.0, lifeStealAdd: 0.05 },
            4: { hpRegenAdd: 3.0, lifeStealAdd: 0.10, maxHpAdd: 20 },
        },
        lance: {
            2: { attackRangeMult: 0.10, bulletPierceAdd: 1 },
            3: { attackRangeMult: 0.20, bulletPierceAdd: 2, critChanceAdd: 0.10 },
        },
    },

    /* ==================== 武器定义（48种） ==================== */
    allWeapons: [
        // ==============================
        // 近战 (melee) × 10
        // ==============================
        { id: 'plasma',   name: '等离子刀',  desc: '挥动180° +50%伤害',
          icon: '🗡️', slots: 1, cost: 10,
          tag: 'melee', mods: { damageMult: 0.5 }, behavior: 'melee_sweep',
          bulletCount: 1, bulletSpeed: 0, damageMult: 1.5, attackSpeedMult: 0.50, spread: 0, pierce: 0, meleeRange: 60 },
        { id: 'axe',      name: '能量斧',    desc: '挥动180° +20%暴伤 -15%攻速',
          icon: '🪓', slots: 2, cost: 12,
          tag: 'melee', mods: { attackSpeedMult: -0.15, critMultiplierAdd: 0.5 }, behavior: 'melee_sweep',
          bulletCount: 1, bulletSpeed: 0, damageMult: 2.0, attackSpeedMult: 1.00, spread: 0, pierce: 0, meleeRange: 100 },
        { id: 'dagger',   name: '双持匕首',  desc: '双挥180° +10%攻速 -30%射程',
          icon: '🔪', slots: 1, cost: 8,
          tag: 'melee', mods: { attackSpeedMult: 0.1, attackRangeMult: 0.7 }, behavior: 'melee_sweep',
          bulletCount: 2, bulletSpeed: 0, damageMult: 1.3, attackSpeedMult: 0.38, spread: 0, pierce: 0, meleeRange: 40 },
        { id: 'chainsaw', name: '链锯剑',    desc: '挥动 灼烧5/s×3层 +20%伤害 -10%移速',
          icon: '⚙️', slots: 2, cost: 14,
          tag: 'melee', mods: { damageMult: 0.2, speedMult: -0.1 }, behavior: 'melee_sweep',
          bulletCount: 1, bulletSpeed: 0, damageMult: 1.8, attackSpeedMult: 0.55, spread: 0, pierce: 0, meleeRange: 70, burnDps: 5, burnMaxStacks: 3 },
        { id: 'sword',    name: '能量剑',    desc: '突刺穿透3 +15%伤害',
          icon: '⚔️', slots: 1, cost: 11,
          tag: 'melee', mods: { damageMult: 0.15, attackRangeMult: 1.15 }, behavior: 'melee_thrust',
          bulletCount: 1, bulletSpeed: 0, damageMult: 1.6, attackSpeedMult: 0.60, spread: 0, pierce: 3, meleeRange: 85 },
        { id: 'katana',   name: '武士刀',    desc: '突刺穿透3 暴击伤害×3 +5%暴率',
          icon: '🗡️', slots: 2, cost: 15,
          tag: 'melee', mods: { critChanceAdd: 0.05 }, behavior: 'melee_thrust',
          bulletCount: 1, bulletSpeed: 0, damageMult: 2.2, attackSpeedMult: 0.70, spread: 0, pierce: 3, meleeRange: 80 },
        { id: 'hammer',   name: '重锤',      desc: '挥动击退400 +15%伤害 -25%攻速',
          icon: '🔨', slots: 3, cost: 16,
          tag: 'melee', mods: { damageMult: 0.15, attackSpeedMult: -0.25 }, behavior: 'melee_sweep',
          bulletCount: 1, bulletSpeed: 0, damageMult: 3.0, attackSpeedMult: 1.40, spread: 0, pierce: 0, meleeRange: 90 },
        { id: 'spear',    name: '能量矛',    desc: '突刺穿透3 -10%攻速',
          icon: '🔱', slots: 2, cost: 13,
          tag: 'melee', mods: { attackSpeedMult: -0.1 }, behavior: 'melee_thrust',
          bulletCount: 1, bulletSpeed: 0, damageMult: 1.8, attackSpeedMult: 0.85, spread: 0, pierce: 3, meleeRange: 120 },
        { id: 'claws',    name: '利爪',      desc: '挥动三连击180° +15%攻速 -20%伤害',
          icon: '🐾', slots: 1, cost: 7,
          tag: 'melee', mods: { attackSpeedMult: 0.15, damageMult: -0.2 }, behavior: 'melee_sweep',
          bulletCount: 3, bulletSpeed: 0, damageMult: 1.2, attackSpeedMult: 0.30, spread: 0, pierce: 0, meleeRange: 50 },
        { id: 'whip',     name: '能量鞭',    desc: '挥动范围大 +10%射程 -10%伤害',
          icon: '🪢', slots: 2, cost: 14,
          tag: 'melee', mods: { attackRangeMult: 1.1, damageMult: -0.1 }, behavior: 'melee_sweep',
          bulletCount: 1, bulletSpeed: 0, damageMult: 1.4, attackSpeedMult: 1.25, spread: 0, pierce: 0, meleeRange: 150 },

        // ==============================
        // 枪械 (gun) × 10
        // ==============================
        { id: 'pistol',   name: '基础手枪',  desc: '平衡型标准武器',
          icon: '🔫', slots: 1, cost: 0,
          tag: 'gun', mods: {}, behavior: 'bullet',
          bulletCount: 1, bulletSpeed: 500, damageMult: 1.0, attackSpeedMult: 1.0, spread: 0.1, pierce: 0 },
        { id: 'smg',      name: '冲锋枪',    desc: '极快射速 -25%伤害 +5%移速',
          icon: '🔫', slots: 2, cost: 12,
          tag: 'gun', mods: { damageMult: -0.25, speedMult: 0.05 }, behavior: 'spread',
          bulletCount: 2, bulletSpeed: 700, damageMult: 0.6, attackSpeedMult: 0.3, spread: 0.12, pierce: 0 },
        { id: 'shotgun',  name: '散弹枪',    desc: '4发散弹 -20%伤害 -25%攻速',
          icon: '💥', slots: 2, cost: 10,
          tag: 'gun', mods: { damageMult: -0.2, attackSpeedMult: -0.25 }, behavior: 'spread',
          bulletCount: 4, bulletSpeed: 400, damageMult: 0.8, attackSpeedMult: 1.0, spread: 0.35, pierce: 0 },
        { id: 'sniper',   name: '狙击枪',    desc: '穿透+2 +150%伤害 -40%攻速',
          icon: '🎯', slots: 2, cost: 12,
          tag: 'gun', mods: { damageMult: 1.5, attackSpeedMult: -0.4 }, behavior: 'bullet',
          bulletCount: 1, bulletSpeed: 1200, damageMult: 2.5, attackSpeedMult: 1.0, spread: 0.02, pierce: 2 },
        { id: 'gatling',  name: '加特林',    desc: '2发 +100%攻速 -30%伤害 -10%移速',
          icon: '⚡', slots: 3, cost: 14,
          tag: 'gun', mods: { damageMult: -0.3, speedMult: -0.1 }, behavior: 'spread',
          bulletCount: 2, bulletSpeed: 600, damageMult: 0.7, attackSpeedMult: 0.4, spread: 0.15, pierce: 0 },
        { id: 'revolver', name: '左轮手枪',  desc: '高伤害单发 +10%暴率',
          icon: '🔫', slots: 1, cost: 9,
          tag: 'gun', mods: { critChanceAdd: 0.1 }, behavior: 'bullet',
          bulletCount: 1, bulletSpeed: 550, damageMult: 1.8, attackSpeedMult: 1.0, spread: 0.05, pierce: 0 },
        { id: 'rifle',    name: '突击步枪',  desc: '3发连射 +5%伤害',
          icon: '🔫', slots: 2, cost: 13,
          tag: 'gun', mods: { damageMult: 0.05 }, behavior: 'spread',
          bulletCount: 3, bulletSpeed: 800, damageMult: 1.2, attackSpeedMult: 0.9, spread: 0.08, pierce: 0 },
        { id: 'rifle2',   name: '战斗步枪',  desc: '2发连射 +30%伤害 穿透+1',
          icon: '🔫', slots: 2, cost: 15,
          tag: 'gun', mods: { damageMult: 0.3 }, behavior: 'spread',
          bulletCount: 2, bulletSpeed: 900, damageMult: 1.6, attackSpeedMult: 1.0, spread: 0.06, pierce: 1 },
        { id: 'shotgun_double', name: '双管散弹', desc: '8发散弹 -30%攻速',
          icon: '💥', slots: 3, cost: 16,
          tag: 'gun', mods: { attackSpeedMult: -0.3 }, behavior: 'spread',
          bulletCount: 8, bulletSpeed: 350, damageMult: 1.5, attackSpeedMult: 1.0, spread: 0.4, pierce: 0 },
        { id: 'magnum',   name: '马格南',    desc: '穿透+3 +50%伤害 -50%攻速',
          icon: '🔫', slots: 2, cost: 18,
          tag: 'gun', mods: { damageMult: 0.5, attackSpeedMult: -0.5 }, behavior: 'bullet',
          bulletCount: 1, bulletSpeed: 600, damageMult: 3.5, attackSpeedMult: 1.0, spread: 0.02, pierce: 3 },
        { id: 'minigun',  name: '迷你机枪',  desc: '3发极速 -30%伤害 -5%移速',
          icon: '⚡', slots: 3, cost: 20,
          tag: 'gun', mods: { damageMult: -0.3, speedMult: -0.05 }, behavior: 'spread',
          bulletCount: 3, bulletSpeed: 650, damageMult: 0.4, attackSpeedMult: 0.2, spread: 0.15, pierce: 0 },

        // ==============================
        // 弓箭 (bow) × 10
        // ==============================
        { id: 'bow',      name: '长弓',      desc: '标准射击 +5%暴率',
          icon: '🏹', slots: 1, cost: 8,
          tag: 'bow', mods: { critChanceAdd: 0.05 }, behavior: 'bullet',
          bulletCount: 1, bulletSpeed: 600, damageMult: 1.4, attackSpeedMult: 0.9, spread: 0.02, pierce: 0 },
        { id: 'crossbow', name: '弩',        desc: '穿透+1 +30%暴伤',
          icon: '🏹', slots: 2, cost: 12,
          tag: 'bow', mods: { critMultiplierAdd: 0.3 }, behavior: 'bullet',
          bulletCount: 1, bulletSpeed: 900, damageMult: 2.0, attackSpeedMult: 1.0, spread: 0.01, pierce: 1 },
        { id: 'longbow',  name: '强弓',      desc: '穿透+2 +20%伤害 -20%攻速',
          icon: '🏹', slots: 2, cost: 14,
          tag: 'bow', mods: { damageMult: 0.2, attackSpeedMult: -0.2 }, behavior: 'bullet',
          bulletCount: 1, bulletSpeed: 700, damageMult: 2.5, attackSpeedMult: 1.0, spread: 0.01, pierce: 2 },
        { id: 'recurve',  name: '反曲弓',    desc: '攻速较快 +15%攻速',
          icon: '🏹', slots: 1, cost: 10,
          tag: 'bow', mods: { attackSpeedMult: 0.15 }, behavior: 'bullet',
          bulletCount: 1, bulletSpeed: 500, damageMult: 1.2, attackSpeedMult: 0.7, spread: 0.04, pierce: 0 },
        { id: 'explosive_arrow', name: '爆裂箭', desc: '爆炸40px +20%伤害',
          icon: '💣', slots: 2, cost: 16,
          tag: 'bow', mods: { damageMult: 0.2 }, behavior: 'explode',
          bulletCount: 1, bulletSpeed: 400, damageMult: 1.8, attackSpeedMult: 1.0, spread: 0.03, pierce: 0, splashRadius: 40 },
        { id: 'frost_arrow', name: '冰霜箭', desc: '减速50% 2s -15%伤害',
          icon: '❄️', slots: 2, cost: 12,
          tag: 'bow', mods: { damageMult: -0.15 }, behavior: 'frost',
          bulletCount: 1, bulletSpeed: 550, damageMult: 1.0, attackSpeedMult: 1.0, spread: 0.03, pierce: 0, slowAmount: 0.5, slowDuration: 2.0 },
        { id: 'poison_arrow', name: '毒箭', desc: '中毒8/s×3s -10%伤害',
          icon: '☠️', slots: 1, cost: 10,
          tag: 'bow', mods: { damageMult: -0.1 }, behavior: 'bullet',
          bulletCount: 1, bulletSpeed: 500, damageMult: 0.8, attackSpeedMult: 0.9, spread: 0.03, pierce: 0, burnDps: 8, burnMaxStacks: 3 },
        { id: 'triple_shot', name: '三连弓', desc: '3发散弹 -10%伤害',
          icon: '🏹', slots: 2, cost: 14,
          tag: 'bow', mods: { damageMult: -0.1 }, behavior: 'spread',
          bulletCount: 3, bulletSpeed: 600, damageMult: 1.0, attackSpeedMult: 0.9, spread: 0.15, pierce: 0 },
        { id: 'piercing_shot', name: '穿甲箭', desc: '穿透+4 +15%伤害 -15%攻速',
          icon: '🎯', slots: 2, cost: 15,
          tag: 'bow', mods: { damageMult: 0.15, attackSpeedMult: -0.15 }, behavior: 'bullet',
          bulletCount: 1, bulletSpeed: 850, damageMult: 2.2, attackSpeedMult: 1.0, spread: 0.01, pierce: 4 },
        { id: 'homing_bow', name: '追踪弓', desc: '自动追踪 -10%伤害',
          icon: '🎯', slots: 2, cost: 16,
          tag: 'bow', mods: { damageMult: -0.1 }, behavior: 'homing',
          bulletCount: 1, bulletSpeed: 300, damageMult: 1.3, attackSpeedMult: 0.8, spread: 0.05, pierce: 0, homingStrength: 3 },

        // ==============================
        // 元素 (magic) × 10
        // ==============================
        { id: 'fire_staff',   name: '火球杖',   desc: '爆炸45px+灼烧5/s -15%伤害',
          icon: '🔥', slots: 2, cost: 12,
          tag: 'magic', mods: { damageMult: -0.15 }, behavior: 'explode',
          bulletCount: 1, bulletSpeed: 400, damageMult: 1.5, attackSpeedMult: 0.9, spread: 0.05, pierce: 0, splashRadius: 45, burnDps: 5, burnMaxStacks: 3 },
        { id: 'frost_staff',  name: '冰霜杖',   desc: '减速60% 3s -10%攻速',
          icon: '❄️', slots: 2, cost: 14,
          tag: 'magic', mods: { attackSpeedMult: -0.1 }, behavior: 'frost',
          bulletCount: 1, bulletSpeed: 500, damageMult: 1.2, attackSpeedMult: 0.9, spread: 0.05, pierce: 0, slowAmount: 0.6, slowDuration: 3.0 },
        { id: 'thunder_staff', name: '雷电杖',  desc: '连锁+3目标 -5%伤害',
          icon: '⚡', slots: 2, cost: 16,
          tag: 'magic', mods: { damageMult: -0.05 }, behavior: 'shock',
          bulletCount: 1, bulletSpeed: 800, damageMult: 1.8, attackSpeedMult: 1.0, spread: 0.05, pierce: 0, chainCount: 3 },
        { id: 'energy_staff', name: '能量杖',   desc: '穿透+2 -10%攻速',
          icon: '🔮', slots: 2, cost: 15,
          tag: 'magic', mods: { attackSpeedMult: -0.1 }, behavior: 'bullet',
          bulletCount: 1, bulletSpeed: 700, damageMult: 2.0, attackSpeedMult: 1.0, spread: 0.02, pierce: 2 },
        { id: 'magic_orb',    name: '魔法弹',   desc: '自动追踪 -5%伤害',
          icon: '🔮', slots: 1, cost: 9,
          tag: 'magic', mods: { damageMult: -0.05 }, behavior: 'homing',
          bulletCount: 1, bulletSpeed: 250, damageMult: 1.3, attackSpeedMult: 0.8, spread: 0.08, pierce: 0, homingStrength: 3 },
        { id: 'poison_staff', name: '毒杖',     desc: '中毒12/s×3s',
          icon: '☠️', slots: 2, cost: 13,
          tag: 'magic', mods: {}, behavior: 'frost',
          bulletCount: 1, bulletSpeed: 450, damageMult: 0.9, attackSpeedMult: 1.0, spread: 0.06, pierce: 0, burnDps: 12, burnMaxStacks: 3 },
        { id: 'void_staff',   name: '虚空杖',   desc: '范围80px吸取 +5%吸血',
          icon: '🕳️', slots: 3, cost: 18,
          tag: 'magic', mods: { lifeStealAdd: 0.05 }, behavior: 'explode',
          bulletCount: 1, bulletSpeed: 300, damageMult: 2.5, attackSpeedMult: 1.2, spread: 0.04, pierce: 0, splashRadius: 80 },
        { id: 'lightning_staff', name: '闪电杖', desc: '暴击连锁+5 +10%暴率',
          icon: '⚡', slots: 2, cost: 14,
          tag: 'magic', mods: { critChanceAdd: 0.1 }, behavior: 'shock',
          bulletCount: 1, bulletSpeed: 900, damageMult: 1.6, attackSpeedMult: 0.9, spread: 0.04, pierce: 0, chainCount: 5 },
        { id: 'fire_wand',    name: '火焰魔棒', desc: '灼烧3/s×2s +10%攻速',
          icon: '🪄', slots: 1, cost: 8,
          tag: 'magic', mods: { attackSpeedMult: 0.1 }, behavior: 'bullet',
          bulletCount: 1, bulletSpeed: 450, damageMult: 1.1, attackSpeedMult: 0.7, spread: 0.06, pierce: 0, burnDps: 3, burnMaxStacks: 2 },
        { id: 'arcane_orb',   name: '奥术球',   desc: '3发追踪弹 +10%射程',
          icon: '🔮', slots: 2, cost: 17,
          tag: 'magic', mods: { attackRangeMult: 1.1 }, behavior: 'homing',
          bulletCount: 3, bulletSpeed: 250, damageMult: 2.2, attackSpeedMult: 0.9, spread: 0.1, pierce: 0, homingStrength: 3 },

        // ==============================
        // 喷射类 (magic) × 3
        // ==============================
        { id: 'flame_spray',  name: '火焰喷射器', desc: '锥形火焰 穿透3 灼烧6/s×3s',
          icon: '🔥', slots: 2, cost: 14,
          tag: 'magic', mods: {}, behavior: 'spray',
          bulletCount: 1, bulletSpeed: 300, damageMult: 1.2, attackSpeedMult: 0.6, spread: 0.5, pierce: 3, burnDps: 6, burnMaxStacks: 3, sprayCone: 0.8 },
        { id: 'poison_spray', name: '毒雾喷射器', desc: '锥形毒雾 穿透3 中毒10/s×3s',
          icon: '☠️', slots: 2, cost: 13,
          tag: 'magic', mods: {}, behavior: 'spray',
          bulletCount: 1, bulletSpeed: 280, damageMult: 1.0, attackSpeedMult: 0.7, spread: 0.6, pierce: 3, burnDps: 10, burnMaxStacks: 3, sprayCone: 0.8 },
        { id: 'cold_spray',   name: '冷气喷射器', desc: '锥形冷气 穿透3 减速50%/2s 冰爆40px',
          icon: '❄️', slots: 2, cost: 15,
          tag: 'magic', mods: {}, behavior: 'spray',
          bulletCount: 1, bulletSpeed: 320, damageMult: 1.1, attackSpeedMult: 0.7, spread: 0.55, pierce: 3, slowAmount: 0.5, slowDuration: 2.0, splashRadius: 40 },

        // ==============================
        // 医疗 (medic) × 5
        // ==============================
        { id: 'heal_gun', name: '治愈枪',    desc: '攻击回血+3 -20%伤害 +2回复',
          icon: '💉', slots: 1, cost: 10,
          tag: 'medic', mods: { damageMult: -0.2, hpRegenAdd: 2.0 }, behavior: 'heal_bullet',
          bulletCount: 1, bulletSpeed: 500, damageMult: 0.6, attackSpeedMult: 0.9, spread: 0.05, pierce: 0, healOnHit: 3 },
        { id: 'shield',   name: '圣光盾',    desc: '治疗光环5/s r100 -50%伤害 +3护甲',
          icon: '✨', slots: 2, cost: 16,
          tag: 'medic', mods: { damageMult: -0.5, armorAdd: 3, speedMult: -0.15 }, behavior: 'shield_aura',
          bulletCount: 0, bulletSpeed: 0, damageMult: 0.3, attackSpeedMult: 1.5, spread: 0, pierce: 0, auraHeal: 5, auraRadius: 100 },
        { id: 'holy_staff', name: '圣光杖',  desc: '20%回血+5 -10%伤害 +1回复',
          icon: '✨', slots: 2, cost: 14,
          tag: 'medic', mods: { damageMult: -0.1, hpRegenAdd: 1.0 }, behavior: 'bullet',
          bulletCount: 1, bulletSpeed: 500, damageMult: 1.0, attackSpeedMult: 0.9, spread: 0.04, pierce: 0, healOnHit: 5 },
        { id: 'life_wand', name: '生命魔棒', desc: '击杀回血+8 -15%伤害 +5HP',
          icon: '💚', slots: 1, cost: 9,
          tag: 'medic', mods: { damageMult: -0.15, maxHpAdd: 5 }, behavior: 'bullet',
          bulletCount: 1, bulletSpeed: 450, damageMult: 0.8, attackSpeedMult: 0.8, spread: 0.06, pierce: 0 },
        { id: 'blessing', name: '祝福盾',    desc: '减伤光环 -30%伤害 +2护甲',
          icon: '🛡️', slots: 2, cost: 15,
          tag: 'medic', mods: { damageMult: -0.3, armorAdd: 2 }, behavior: 'shield_aura',
          bulletCount: 0, bulletSpeed: 0, damageMult: 0.5, attackSpeedMult: 1.2, spread: 0, pierce: 0, auraHeal: 3, auraRadius: 80 },
        // ==============================
        // 骑枪 (lance) × 3
        // ==============================
        { id: 'pike',      name: '长枪',      desc: '超长距突刺 穿透+4 射程200',
          icon: '🔱', slots: 1, cost: 12,
          tag: 'lance', mods: { attackRangeMult: 1.15 }, behavior: 'melee_thrust',
          bulletCount: 1, bulletSpeed: 0, damageMult: 2.0, attackSpeedMult: 0.80, spread: 0, pierce: 4, meleeRange: 200 },
        { id: 'cavalry_lance', name: '骑枪',   desc: '超长距突刺 穿透+5 +30%伤害 -25%攻速',
          icon: '🔱', slots: 2, cost: 16,
          tag: 'lance', mods: { damageMult: 0.3, attackSpeedMult: -0.25 }, behavior: 'melee_thrust',
          bulletCount: 1, bulletSpeed: 0, damageMult: 3.2, attackSpeedMult: 1.10, spread: 0, pierce: 5, meleeRange: 250 },
        { id: 'trident',   name: '三叉戟',    desc: '三叉突刺 穿透+6 -10%伤害 +15%射程',
          icon: '🔱', slots: 2, cost: 14,
          tag: 'lance', mods: { damageMult: -0.1, attackRangeMult: 1.15 }, behavior: 'melee_thrust',
          bulletCount: 1, bulletSpeed: 0, damageMult: 1.6, attackSpeedMult: 0.85, spread: 0, pierce: 6, meleeRange: 180 },
    ],

    /* ==================== 道具定义（22种不变） ==================== */
    allItems: [
        // ======== 生存类 (Survival) ========
        { id: 'hpUp',          name: '生命核心',       desc: '最大生命 +30',               cost: 6,  icon: '❤️', apply: (p) => { p.maxHp += 30; p.hp += 30; } },
        { id: 'regen',         name: '再生芯片',       desc: '生命回复 +1/秒',             cost: 5,  icon: '💚', apply: (p) => p.hpRegen += 1.0 },
        { id: 'armorUp',       name: '合金装甲',       desc: '护甲 +3',                   cost: 7,  icon: '🛡️', apply: (p) => p.armor += 3 },
        { id: 'dodgeUp',       name: '幽影斗篷',       desc: '闪避 +3%（上限60%）',        cost: 8,  icon: '💨', apply: (p) => p.dodge = Math.min(0.6, p.dodge + 0.03) },
        { id: 'lifesteal',     name: '吸血鬼之牙',     desc: '生命偷取 +3%',               cost: 8,  icon: '🩸', apply: (p) => p.lifeSteal += 0.03 },
        { id: 'energy_shield', name: '能量屏障',       desc: '每8秒抵挡1次伤害',           cost: 12, icon: '🛡️', unique: true, apply: (p) => { p.energyShieldCD = 8; p.energyShieldTimer = 0; p.energyShieldReady = true; } },
        { id: 'thorn',         name: '荆棘装甲',       desc: '反弹30%伤害给攻击者',        cost: 8,  icon: '🌵', unique: true, apply: (p) => { p.thornDamage = 0.3; } },
        { id: 'reactive_armor', name: '反应装甲',      desc: '受伤后50%概率回5HP(冷却3s)',  cost: 10, icon: '⚙️', unique: true, apply: (p) => { p.reactiveArmor = true; } },

        // ======== 进攻类 (Offensive) ========
        { id: 'critUp',        name: '精准目镜',       desc: '暴击率 +5%',                 cost: 7,  icon: '💥', apply: (p) => p.critChance += 0.05 },
        { id: 'critDmg',       name: '暴伤增幅器',     desc: '暴击伤害 +50%',              cost: 9,  icon: '🔥', apply: (p) => p.critMultiplier += 0.5 },
        { id: 'speedUp',       name: '战术推进器',     desc: '移动速度 +15%',              cost: 6,  icon: '⚡', apply: (p) => p.speed *= 1.15 },
        { id: 'rangeUp',       name: '全息瞄准镜',     desc: '攻击范围 +15%',              cost: 6,  icon: '🎯', apply: (p) => p.attackRange *= 1.15 },
        { id: 'stim',          name: '战斗兴奋剂',     desc: '+25%攻速 +25%受伤',          cost: 8,  icon: '💉', apply: (p) => { p.attackSpeed = Math.min(5.0, p.attackSpeed * 1.25); p.takenDmgMult = (p.takenDmgMult || 1.0) * 1.25; } },
        { id: 'penetrator',    name: '穿甲弹头',       desc: '穿透 +1',                   cost: 10, icon: '🔩', apply: (p) => { p.bulletPierce = (p.bulletPierce || 0) + 1; } },
        { id: 'heavy_bullets', name: '重型弹丸',       desc: '+30%伤害 -10%攻速',          cost: 12, icon: '🔫', apply: (p) => { p.damage = Math.floor(p.damage * 1.30); p.attackSpeed = Math.max(0.5, p.attackSpeed * 0.9); } },
        { id: 'replicator',    name: '子弹复制器',     desc: '20%概率射出双倍子弹',        cost: 14, icon: '🖨️', unique: true, apply: (p) => { p.replicatorChance = (p.replicatorChance || 0) + 0.2; } },

        // ======== 经济类 (Economy) ========
        { id: 'harvestUp',     name: '贪婪芯片',       desc: '材料收获 +25%',              cost: 5,  icon: '💰', apply: (p) => p.harvesting += 25 },
        { id: 'luckUp',        name: '四叶幸运草',     desc: '幸运 +3',                   cost: 5,  icon: '🍀', apply: (p) => p.luck += 3 },
        { id: 'pickupUp',      name: '磁力场',         desc: '拾取范围 +40',               cost: 4,  icon: '🧲', apply: (p) => p.pickupRange += 40 },
        { id: 'piggy',         name: '存钱罐',         desc: '每波获得15%金币利息',        cost: 6,  icon: '🐷', unique: true, apply: (p) => { p.piggyBank = true; } },
        { id: 'coupon',        name: '折扣券',         desc: '商店价格-2（最低1金）',       cost: 6,  icon: '🎫', unique: true, apply: (p) => { p.coupon = (p.coupon || 0) + 1; } },
        { id: 'hunting_trophy', name: '狩猎勋章',      desc: '精英掉落材料+50%',           cost: 8,  icon: '🏆', unique: true, apply: (p) => { p.huntingTrophy = true; } },

        // ======== 特殊类 (Special) ========
        { id: 'blood_pact',    name: '献血契约',       desc: '-2HP/秒 +40%伤害',           cost: 6,  icon: '🩸', unique: true, apply: (p) => { p.bloodPactDrain = 2; p.damage = Math.floor(p.damage * 1.4); } },
        { id: 'scope',         name: '高倍望远镜',     desc: '+50%射程 -15%伤害',          cost: 8,  icon: '🔭', apply: (p) => { p.attackRange = Math.min(800, p.attackRange * 1.5); p.damage = Math.floor(p.damage * 0.85); } },
        { id: 'glass_cannon',  name: '玻璃大炮',       desc: '+35%伤害 -3护甲',            cost: 10, icon: '💎', unique: true, apply: (p) => { p.damage = Math.floor(p.damage * 1.35); p.armor = Math.max(0, p.armor - 3); } },
        { id: 'magnet',        name: '磁暴线圈',       desc: '周围2秒15伤(半径120)',       cost: 10, icon: '🧲', unique: true, apply: (p) => { p.magnetDmg = 15; p.magnetTimer = 0; p.magnetRadius = 120; } },
        { id: 'burn_spreader', name: '燃烧扩散器',     desc: '燃烧死亡传播(范围200)',      cost: 12, icon: '🔥', unique: true, apply: (p) => { p._burnSpreadLevel = (p._burnSpreadLevel || 0) + 1; p._burnSpreadRange = 200; } },
        { id: 'ice_core',      name: '极寒之核',       desc: '冰爆范围+50% 伤害+50%',      cost: 12, icon: '❄️', unique: true, apply: (p) => { p._iceExplosionMult = (p._iceExplosionMult || 1.0) * 1.5; p._iceExplosionRadiusAdd = (p._iceExplosionRadiusAdd || 0) + 0.5; } },
        { id: 'element_amp',   name: '元素增幅器',     desc: '喷射穿透+2 伤害+20%',        cost: 14, icon: '⚡', unique: true, apply: (p) => { p._sprayPierceAdd = (p._sprayPierceAdd || 0) + 2; p._sprayDamageMult = (p._sprayDamageMult || 1.0) * 1.2; } },
        { id: 'berserker',     name: '狂战士之血',     desc: '低血量+50%攻速+30%伤害',     cost: 10, icon: '💢', unique: true, apply: (p) => { p.berserkerBlood = true; } },
    ],

    /* ==================== 核心逻辑 ==================== */

    /** 生成商店列表（保留锁定物品 + 角色武器适配过滤） */
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

    /** 填充商店剩余槽位（带品质roll + unique道具过滤 + 角色适配过滤） */
    _generateShopItems() {
        const player = PlayerSystem.player;
        if (!player) return;
        const currentWave = WaveSystem.currentLevel || 1;
        const affinities = CharacterSystem.getAffinities();

        // ====== 武器区（根据角色适配标签生成，始终出现） ======
        const existingWeaponIds = this.items.filter(it => it.type === 'weapon').map(it => it.id);
        const weaponPool = this.allWeapons.filter(w => {
            if (w.id === 'pistol') return false;
            if (existingWeaponIds.includes(w.id)) return false;
            if (!affinities.includes(w.tag)) return false;
            const unlocked = UnlockSystem.isWeaponUnlocked(w.id);
            return unlocked;
        });
        const shuffledWeapons = [...weaponPool].sort(() => Math.random() - 0.5);
        const weaponCount = Math.min(3 + Math.floor(Math.random() * 2), shuffledWeapons.length);
        for (let i = 0; i < weaponCount && this.items.filter(it => it.type === 'weapon').length < 4; i++) {
            const base = shuffledWeapons[i];
            const quality = this.rollQuality(currentWave);
            const qDef = this.qualityDefs[quality];
            const cost = Math.max(1, Math.round(base.cost * qDef.costMult));
            this.items.push({ ...base, type: 'weapon', locked: false, quality: quality, cost: cost });
        }

        // ====== 道具区（始终出现） ======
        const existingItemIds = this.items.filter(it => it.type === 'item').map(it => it.id);
        const itemPool = [...this.allItems].filter(it => {
            if (it.unique && this._boughtUniqueItems.includes(it.id)) return false;
            if (existingItemIds.includes(it.id)) return false;
            return true;
        });
        const shuffledItems = itemPool.sort(() => Math.random() - 0.5);
        const itemCount = Math.min(3 + Math.floor(Math.random() * 2), shuffledItems.length, 5);
        for (let i = 0; i < itemCount && this.items.filter(it => it.type === 'item').length < 5; i++) {
            this.items.push({ ...shuffledItems[i], type: 'item', locked: false });
        }
    },

    /** 刷新商店 */
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

    /** 切换物品锁定状态 */
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

    /** 购买物品/武器 */
    buyItem(itemIndex) {
        const item = this.items[itemIndex];
        if (!item) return false;
        const player = PlayerSystem.player;
        if (!player || player.materials < item.cost) return false;

        if (item.unique && this._boughtUniqueItems.includes(item.id)) return false;

        if (item.type === 'weapon') {
            if (!player.weapons) player.weapons = [{ id: 'pistol', level: 1, quality: 'T1' }];
            const quality = item.quality || 'T1';

            // 折扣券优惠
            let actualCost = item.cost;
            if (player.coupon > 0) {
                actualCost = Math.max(1, item.cost - player.coupon * 2);
            }
            if (player.materials < actualCost) return false;

            // 检查是否已有同名武器 → 合并升级
            const existingWeapon = player.weapons.find(w => w.id === item.id);
            if (existingWeapon) {
                player.materials -= actualCost;
                existingWeapon.level = (existingWeapon.level || 1) + 1;
                const qOrder = ['T1', 'T2', 'T3', 'T4'];
                if (qOrder.indexOf(quality) > qOrder.indexOf(existingWeapon.quality || 'T1')) {
                    existingWeapon.quality = quality;
                }
                // 合并升级：提升词条数值 + 检查是否新增词条（带高亮动画）
                this._applyMergeWithHighlights(existingWeapon, 1);
                this._updateWeaponParams(player, item.id);
                PlayerSystem._updateSynergies();
                UnlockSystem.recordWeaponBought(item.id);
                this.items.splice(itemIndex, 1);
                this.lockedItems = this.lockedItems.filter(li => !(li.id === item.id && li.type === item.type));
                return true;
            }

            // 检查槽位
            const usedSlots = player.weapons.reduce((sum, w) => {
                const def = this.allWeapons.find(d => d.id === w.id);
                return sum + (def ? def.slots : 1);
            }, 0);
            const maxSlots = player.weaponSlots || 6;

            if (usedSlots + item.slots > maxSlots) {
                this._lastBuyError = '武器槽位已满，无法购买新武器';
                return false;
            }

            // 有空位：放入新槽位
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
            // 折扣券优惠
            let actualCost = item.cost;
            if (player.coupon > 0) {
                actualCost = Math.max(1, item.cost - player.coupon * 2);
            }
            if (player.materials < actualCost) return false;
            player.materials -= actualCost;
            player.items.push(item.id);
            if (item.unique) this._boughtUniqueItems.push(item.id);
            item.apply(player);
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

    /** 卖出指定槽位的武器 */
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

        // 逆向武器属性修正
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

    /** 合并两个同名武器 */
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
        // 合并：提升词条 + 检查新增词条（带高亮动画）
        this._applyMergeWithHighlights(to, fromLevel);
        const actualFromIdx = player.weapons.indexOf(from);
        if (actualFromIdx !== -1) player.weapons.splice(actualFromIdx, 1);
        this._updateWeaponParams(player, to.id);
        PlayerSystem._updateSynergies();
        return true;
    },

    /** 更新武器参数（含品质+等级加成） */
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
        const qDef = this.qualityDefs[bestQuality];
        const qualityBonus = qDef ? qDef.damageMult : 1.0;
        const levelBonus = 1 + (maxLevel - 1) * 0.25;

        player.weaponParams[weaponId] = {
            behavior: def.behavior || 'bullet',
            bulletCount: def.bulletCount || 1,
            bulletSpeed: def.bulletSpeed || 500,
            damageMult: (def.damageMult || 1.0) * qualityBonus * levelBonus,
            attackSpeedMult: def.attackSpeedMult || 1.0,
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
            sprayCone: def.sprayCone || 0,
            iceExplosionRadius: def.iceExplosionRadius || 0,
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
        const qDef = this.qualityDefs[quality];
        const qualityBonus = qDef ? qDef.damageMult : 1.0;
        player.weaponParams[weapon.id] = {
            behavior: weapon.behavior || 'bullet',
            bulletCount: weapon.bulletCount || 1,
            bulletSpeed: weapon.bulletSpeed || 500,
            damageMult: (weapon.damageMult || 1.0) * qualityBonus,
            attackSpeedMult: weapon.attackSpeedMult || 1.0,
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
            quality: quality,
        };
    },

    /* ==================== 羁绊系统 ==================== */
    getTagCounts(weapons) {
        const counts = {};
        for (const w of weapons) {
            const def = this.allWeapons.find(d => d.id === w.id);
            if (def && def.tag) counts[def.tag] = (counts[def.tag] || 0) + 1;
        }
        return counts;
    },

    getActiveSynergies(weapons) {
        const counts = this.getTagCounts(weapons);
        const active = [];
        for (const [tagId, count] of Object.entries(counts)) {
            const defs = this.synergyDefs[tagId];
            if (!defs) continue;
            let threshold = 0;
            let bonus = null;
            for (const [t, b] of Object.entries(defs)) {
                const tNum = parseInt(t);
                if (count >= tNum && tNum > threshold) { threshold = tNum; bonus = b; }
            }
            if (bonus) {
                const tagInfo = this.tagInfo[tagId];
                active.push({
                    tagId, tagName: tagInfo ? tagInfo.name : tagId, tagIcon: tagInfo ? tagInfo.icon : '🏷️',
                    count, threshold, bonus
                });
            }
        }
        return active;
    },

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
