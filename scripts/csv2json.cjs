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
            { name: 'characters', csv: 'csv/characters.csv', json: 'src/data/characters.json', schema: characterSchema },
            { name: 'weapons',    csv: 'csv/weapons.csv',    json: 'src/data/weapons.json',    schema: weaponSchema },
            { name: 'items',      csv: 'csv/items.csv',      json: 'src/data/items.json',      schema: itemSchema },
            { name: 'enemies',    csv: 'csv/enemies.csv',    json: 'src/data/enemies.json',    schema: enemySchema },
            { name: 'bosses',     csv: 'csv/bosses.csv',     json: 'src/data/bosses.json',     schema: bossSchema },
            { name: 'waves',      csv: 'csv/waves.csv',      json: 'src/data/waves.json',      schema: waveSchema },
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
 * weapons.csv Schema
 * 列: id,name,desc,icon,slots,cost,tag,
 *     damageMult,attackSpeedMult,attackRangeMult,speedMult,
 *     critChanceAdd,critDamageAdd,armorAdd,hpRegenAdd,maxHpAdd,lifeStealAdd,
 *     bulletCount,bulletSpeed,attackRange,spread,pierce,meleeRange,
 *     burnDps,burnMaxStacks,chainCount,splashRadius,homingStrength,
 *     slowAmount,slowDuration,healOnHit,auraHeal,auraRadius,sprayCone,
 *     behavior
 */
const weaponSchema = {
    id: 'string',
    name: 'string',
    desc: 'string',
    icon: 'string',
    slots: 'number',
    cost: 'number',
    tag: 'string',
    damageMult: 'number',
    attackSpeedMult: 'number',
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

// ============================================================
// 入口
// ============================================================
if (require.main === module) {
    const ok = CSV2JSON.convertAll();
    process.exit(ok ? 0 : 1);
}

module.exports = { CSV2JSON, characterSchema, weaponSchema, itemSchema, enemySchema, bossSchema, waveSchema };
