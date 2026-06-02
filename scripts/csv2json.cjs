// ============================================================
// scripts/csv2json.js — CSV→JSON 构建时转换脚本
// Node.js 脚本，不进入浏览器 bundle
// 用法: node scripts/csv2json.js
// ============================================================

const fs = require('fs');
const path = require('path');

// ============================================================
// CSV 解析器
// ============================================================
const CSV2JSON = {
    /**
     * 拆分 CSV 行（支持双引号字段）
     * @param {string} line
     * @returns {string[]}
     */
    _splitLine(line) {
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
    },

    /**
     * 按 schema 类型转换单个字段值
     * @param {string} raw - CSV 原始字段值
     * @param {string} type - 'string'|'number'|'boolean'|'json'|'array'
     * @returns {*}
     */
    _castValue(raw, type) {
        if (raw === '' || raw === undefined || raw === null) {
            switch (type) {
                case 'number': return 0;
                case 'boolean': return false;
                case 'array': return [];
                case 'json': return null;
                default: return '';
            }
        }
        switch (type) {
            case 'number': {
                const v = parseFloat(raw);
                return isNaN(v) ? 0 : v;
            }
            case 'boolean':
                return raw.toLowerCase() === 'true' || raw === '1';
            case 'json': {
                try {
                    return JSON.parse(raw);
                } catch {
                    // 如果 raw 不是合法 JSON 但以 { 或 [ 开头，尝试修复引号包裹
                    try {
                        return JSON.parse(raw.replace(/([{,])\s*(\w+)\s*:/g, '$1"$2":'));
                    } catch {
                        console.warn('[csv2json] JSON parse failed for:', raw.substring(0, 60));
                        return null;
                    }
                }
            }
            case 'array': {
                // 管道符分隔: "a|b|c" → ["a","b","c"]
                if (raw.includes('|')) {
                    return raw.split('|').map(s => s.trim()).filter(Boolean);
                }
                return [raw.trim()].filter(Boolean);
            }
            default: // 'string'
                return raw;
        }
    },

    /**
     * 解析 CSV 文本 → 对象数组
     * @param {string} text - CSV 原始文本
     * @param {Object} schema - 列定义 { 列名: 类型 }
     *   类型: 'string' | 'number' | 'boolean' | 'json' | 'array'
     * @returns {Object[]}
     */
    parse(text, schema) {
        const lines = text.split(/\r?\n/);
        const result = [];
        const columnNames = Object.keys(schema);

        // 跳过首行（列名行）
        let firstNonCommentSkipped = false;

        for (const rawLine of lines) {
            const trimmed = rawLine.trim();
            // 跳过空行和注释行
            if (trimmed === '' || trimmed.startsWith('#')) continue;

            const fields = this._splitLine(trimmed);
            if (fields.length < 2) continue; // 至少要有 id + 一个字段

            // 跳过列名行（第一个字段等于 schema 的第一个列名）
            if (!firstNonCommentSkipped && fields[0] === columnNames[0]) {
                firstNonCommentSkipped = true;
                continue;
            }
            firstNonCommentSkipped = true;

            const obj = {};
            for (let i = 0; i < columnNames.length; i++) {
                const colName = columnNames[i];
                const colType = schema[colName];
                const rawVal = i < fields.length ? fields[i] : '';
                obj[colName] = this._castValue(rawVal, colType);
            }
            result.push(obj);
        }
        return result;
    },

    /**
     * 转换单个 CSV 文件 → 写入 JSON 文件
     * @param {string} csvPath - csv/xxx.csv (相对项目根)
     * @param {string} jsonPath - src/data/xxx.json (相对项目根)
     * @param {Object} schema - 列定义
     * @returns {boolean} 是否成功
     */
    convert(csvPath, jsonPath, schema) {
        try {
            const csvText = fs.readFileSync(csvPath, 'utf-8');
            const data = this.parse(csvText, schema);
            const jsonStr = JSON.stringify(data, null, 2);
            const dir = path.dirname(jsonPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(jsonPath, jsonStr, 'utf-8');
            console.log(`  ✓ ${path.basename(jsonPath)} (${data.length} 条记录)`);
            return true;
        } catch (e) {
            console.error(`  ✗ ${path.basename(jsonPath)} 失败:`, e.message);
            return false;
        }
    },

    /**
     * 一键转换全部
     */
    convertAll() {
        const rootDir = path.resolve(__dirname, '..');
        console.log('[csv2json] 开始转换所有数据...\n');

        const tasks = [
            { name: 'characters',    csv: 'csv/characters.csv',       json: 'src/data/characters.json',      schema: characterSchema },
            { name: 'characterLevel',csv: 'csv/characterLevel.csv',   json: 'src/data/characterLevel.json',  schema: characterLevelSchema },
            { name: 'weapons',       csv: 'csv/weapons.csv',          json: 'src/data/weapons.json',         schema: weaponSchema },
            { name: 'items',      csv: 'csv/items.csv',      json: 'src/data/items.json',      schema: itemSchema },
            { name: 'enemies',    csv: 'csv/enemies.csv',    json: 'src/data/enemies.json',    schema: enemySchema },
            { name: 'bosses',     csv: 'csv/bosses.csv',     json: 'src/data/bosses.json',     schema: bossSchema },
            { name: 'waves',      csv: 'csv/waves.csv',      json: 'src/data/waves.json',      schema: waveSchema },
            { name: 'weaponStats',csv: 'csv/weaponStats.csv',json: 'src/data/weaponStats.json',schema: weaponStatSchema },
            { name: 'charStats',csv: 'csv/charStats.csv',json: 'src/data/charStats.json',schema: charStatSchema },
            { name: 'difficulty',csv: 'csv/difficulty.csv',json: 'src/data/difficulty.json',schema: difficultySchema },
            { name: 'debug',csv: 'csv/debug.csv',json: 'src/data/debug.json',schema: debugSchema },
            { name: 'levelUpCards',csv: 'csv/levelUpCards.csv',json: 'src/data/levelUpCards.json',schema: levelUpCardsSchema },
            { name: 'rarityColors',csv: 'csv/rarityColors.csv',json: 'src/data/rarityColors.json',schema: rarityColorsSchema },
        ];

        let success = 0;
        let fail = 0;
        for (const t of tasks) {
            const csvPath = path.join(rootDir, t.csv);
            const jsonPath = path.join(rootDir, t.json);

            if (!fs.existsSync(csvPath)) {
                console.log(`  - ${t.name}: CSV 文件不存在 (${t.csv})，跳过`);
                continue;
            }
            const ok = this.convert(csvPath, jsonPath, t.schema);
            if (ok) success++; else fail++;
        }

        console.log(`\n[csv2json] 完成: ${success} 成功, ${fail} 失败`);
        return fail === 0;
    },
};

// ============================================================
// Schema 定义
// ============================================================

/**
 * characters.csv Schema
 * 列: id,name,desc,icon,unlocked,weaponSlots,maxHp,hpRegen,speed,
 *     damagePercent,attackSpeed,attackRange,armor,dodge,critChance,critDamage,
 *     lifeSteal,harvesting,luck,xpGain,meleeDamage,rangedDamage,
 *     elementalDamage,engineering,tags,unlockType,unlockValue,passives
 */
const characterSchema = {
    id: 'string',
    name: 'string',
    desc: 'string',
    icon: 'string',
    unlocked: 'boolean',
    weaponSlots: 'number',
    maxHp: 'number',
    hpRegen: 'number',
    speed: 'number',
    damagePercent: 'number',
    attackSpeed: 'number',
    attackRange: 'number',
    armor: 'number',
    dodge: 'number',
    critChance: 'number',
    critDamage: 'number',
    lifeSteal: 'number',
    pickupRange: 'number',
    harvesting: 'number',
    luck: 'number',
    xpGain: 'number',
    meleeDamage: 'number',
    rangedDamage: 'number',
    elementalDamage: 'number',
    engineering: 'number',
    tags: 'array',
    unlockType: 'string',
    unlockValue: 'number',
    passives: 'array',
};

/**
 * characterLevel.csv Schema
 * 列: level, xpRequired, growth, offset
 */
const characterLevelSchema = {
    level: 'number',
    xpRequired: 'number',
    growth: 'number',
    offset: 'number',
};

/**
 * weapons.csv Schema
 * 列: id,name,desc,icon,slots,cost,tag,minLevel,
 *     damage_lv1,damage_lv2,damage_lv3,damage_lv4,
 *     cooldown_lv1,cooldown_lv2,cooldown_lv3,cooldown_lv4,
 *     attackRangeMult,speedMult,
 *     critChanceAdd,critDamageAdd,armorAdd,hpRegenAdd,maxHpAdd,lifeStealAdd,
 *     bulletCount,bulletSpeed,attackRange,spread,pierce,meleeRange,
 *     burnDps,burnMaxStacks,chainCount,splashRadius,homingStrength,
 *     slowAmount,slowDuration,healOnHit,auraHeal,auraRadius,sprayCone,
 *     behavior,class,knockback
 */
const weaponSchema = {
    id: 'string',
    name: 'string',
    desc: 'string',
    icon: 'string',
    slots: 'number',
    cost: 'number',
    tag: 'string',
    minLevel: 'number',
    damage_lv1: 'number',
    damage_lv2: 'number',
    damage_lv3: 'number',
    damage_lv4: 'number',
    cooldown_lv1: 'number',
    cooldown_lv2: 'number',
    cooldown_lv3: 'number',
    cooldown_lv4: 'number',
    attackRangeMult: 'number',
    speedMult: 'number',
    critChanceAdd: 'number',
    critDamageAdd: 'number',
    armorAdd: 'number',
    hpRegenAdd: 'number',
    maxHpAdd: 'number',
    lifeStealAdd: 'number',
    bulletCount: 'number',
    bulletSpeed: 'number',
    bulletMaxRange: 'number',
    attackRange: 'number',
    spread: 'number',
    pierce: 'number',
    meleeRange: 'number',
    burnDps: 'number',
    burnMaxStacks: 'number',
    chainCount: 'number',
    splashRadius: 'number',
    homingStrength: 'number',
    slowAmount: 'number',
    slowDuration: 'number',
    healOnHit: 'number',
    auraHeal: 'number',
    auraRadius: 'number',
    sprayCone: 'number',
    behavior: 'string',
    class: 'string',
    knockback: 'number',
    magSize: 'number',
    reloadTime: 'number',
};

/**
 * items.csv Schema
 * 列: id,name,desc,cost,icon,unique,rarity,tags,triggers,effects
 */
const itemSchema = {
    id: 'string',
    name: 'string',
    desc: 'string',
    cost: 'number',
    icon: 'string',
    unique: 'boolean',
    rarity: 'string',
    tags: 'array',
    triggers: 'array',
    effects: 'json',
    statMods: 'json',
};

/**
 * enemies.csv Schema
 * 列: id,name,behavior,hp,speed,damage,radius,color,glowColor,
 *     xpValue,materialValue,attackCooldown,isElite,isBoss,
 *     paramsJson,specialMechanic
 */
const enemySchema = {
    id: 'string',
    name: 'string',
    behavior: 'string',
    hp: 'number',
    speed: 'number',
    damage: 'number',
    radius: 'number',
    color: 'string',
    glowColor: 'string',
    xpValue: 'number',
    materialValue: 'number',
    attackCooldown: 'number',
    isElite: 'boolean',
    isBoss: 'boolean',
    paramsJson: 'json',
    specialMechanic: 'string',
};

/**
 * bosses.csv Schema
 * 列: id,name,baseHp,baseSpeed,baseDamage,radius,color,glowColor,
 *     xpValue,materialValue,phaseCount,phasesJson
 */
const bossSchema = {
    id: 'string',
    name: 'string',
    baseHp: 'number',
    baseSpeed: 'number',
    baseDamage: 'number',
    radius: 'number',
    color: 'string',
    glowColor: 'string',
    xpValue: 'number',
    materialValue: 'number',
    phaseCount: 'number',
    phasesJson: 'json',
};

/**
 * waves.csv Schema
 * 列: waveNumber,minBudget,maxBudget,availableBehaviors,availableMechanics,
 *     spawnPattern,specialRule
 */
const waveSchema = {
    waveNumber: 'number',
    minBudget: 'number',
    maxBudget: 'number',
    availableBehaviors: 'array',
    availableMechanics: 'array',
    spawnPattern: 'string',
    specialRule: 'string',
};

/**
 * weaponStats.csv Schema
 * 列: key,中文名,英文名
 * 武器属性标签映射表，前端 UI 通过 key 查找对应的显示名
 */
const weaponStatSchema = {
    key: 'string',
    '中文名': 'string',
    '英文名': 'string',
};

/**
 * charStats.csv Schema
 * 列: key,中文名,英文名
 * 角色属性标签映射表，前端 UI 通过 key 查找对应的显示名
 */
const charStatSchema = {
    key: 'string',
    '中文名': 'string',
    '英文名': 'string',
};

/**
 * difficulty.csv Schema
 * 列: id,中文名,英文名,enemyMult,spawnRate,eliteInterval,bossWaves,newEnemyTypes,desc
 * 难度配置表
 */
const difficultySchema = {
    id: 'number',
    '中文名': 'string',
    '英文名': 'string',
    enemyMult: 'number',
    spawnRate: 'number',
    eliteInterval: 'number',
    bossWaves: 'json',
    newEnemyTypes: 'array',
    desc: 'string',
};

/**
 * debug.csv Schema
 * 列: key,label,desc,group,expr,enabled
 * 调试信息显示配置表
 */
const debugSchema = {
    key: 'string',
    label: 'string',
    desc: 'string',
    group: 'string',
    expr: 'string',
    enabled: 'boolean',
};

/**
 * levelUpCards.csv Schema
 * 升级抽卡配置表（每行 = 一个卡牌的一个等级）
 * statAdd/statMult: 管道符分隔的 key:value 对
 * tags: 管道符分隔的流派标签
 * actionType: weaponLevelUp|weaponQualityUp|addWeaponSlot|addPassive
 */
const levelUpCardsSchema = {
    id: 'string',
    level: 'number',
    name: 'string',
    desc: 'string',
    icon: 'string',
    rarity: 'string',
    category: 'string',
    tags: 'array',
    statAdd: 'string',
    statMult: 'string',
    actionType: 'string',
    actionValue: 'string',
};

/**
 * rarityColors.csv Schema
 * 土豆兄弟风格等级颜色配置表
 * level: 等级 1-5
 * key: 程序内部标识 (common/uncommon/rare/epic/legendary)
 * name: 显示名称
 * color: 前景色
 * bg: 半透明背景色
 */
const rarityColorsSchema = {
    level: 'number',
    key: 'string',
    name: 'string',
    color: 'string',
    bg: 'string',
};

// ============================================================
// 入口
// ============================================================
if (require.main === module) {
    const ok = CSV2JSON.convertAll();
    process.exit(ok ? 0 : 1);
}

module.exports = { CSV2JSON, characterSchema, characterLevelSchema, weaponSchema, itemSchema, enemySchema, bossSchema, waveSchema, weaponStatSchema, charStatSchema, difficultySchema, debugSchema, levelUpCardsSchema, rarityColorsSchema };
