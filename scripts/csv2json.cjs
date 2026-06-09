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
        const schemaKeys = Object.keys(schema);

        // 收集所有非空非注释行
        const dataLines = [];
        for (const rawLine of lines) {
            const trimmed = rawLine.trim();
            if (trimmed === '' || trimmed.startsWith('#')) continue;
            dataLines.push(trimmed);
        }
        if (dataLines.length === 0) return result;

        // 检查首行是否为 header(以 schema 第一个列名开头, 而非数据)
        const firstFields = this._splitLine(dataLines[0]);
        const isHeaderRow = firstFields[0] === schemaKeys[0];

        // 决定 header 索引映射: header 行 → 列名
        // 如果首行就是 header, 使用它; 否则回退到 schema 顺序(positional)
        let headerIndex = null;
        let dataStart = 0;
        if (isHeaderRow) {
            headerIndex = {};
            firstFields.forEach((name, i) => {
                headerIndex[name.trim()] = i;
            });
            dataStart = 1;
        }

        for (let li = dataStart; li < dataLines.length; li++) {
            const fields = this._splitLine(dataLines[li]);
            if (fields.length < 2) continue; // 至少要有 id + 一个字段

            // 防御: 跳过 id 为空的行(常见于 CSV 编辑时空行未被察觉)
            //   例: ",,,,,," 会被解析成 31 个空字段, 触发"角色未解锁"兜底卡
            // 仅对 schema 含 'id' 列的表生效 (characterLevel 等表无 id 字段)
            if (schemaKeys.includes('id')) {
                const idIdx = headerIndex ? headerIndex['id'] : schemaKeys.indexOf('id');
                if (idIdx === undefined || idIdx < 0 || !fields[idIdx] || !fields[idIdx].trim()) {
                    console.warn(`[csv2json] 跳过空 id 行 (行 ${li + 1}): "${dataLines[li].substring(0, 50)}..."`);
                    continue;
                }
            }

            const obj = {};
            for (const colName of schemaKeys) {
                const colType = schema[colName];
                let rawVal = '';
                if (headerIndex) {
                    // header-based: 按列名找索引, 找不到 → 空
                    const idx = headerIndex[colName];
                    rawVal = (idx !== undefined && idx < fields.length) ? fields[idx] : '';
                } else {
                    // positional fallback: 旧 CSV 无 header, 按 schema 顺序
                    // 此分支不再使用, 但保留以防万一
                    const i = schemaKeys.indexOf(colName);
                    rawVal = i < fields.length ? fields[i] : '';
                }
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
            { name: 'rarity',csv: 'csv/rarity.csv',json: 'src/data/rarity.json',schema: raritySchema },
            { name: 'audio',csv: 'csv/audio.csv',json: 'src/data/audio.json',schema: audioSchema },
            { name: 'classes',csv: 'csv/classes.csv',json: 'src/data/classes.json',schema: classSchema },
            { name: 'level_duration',csv: 'csv/level_duration.csv',json: 'src/data/level_duration.json',schema: levelDurationSchema },
            { name: 'system',csv: 'csv/system.csv',json: 'src/data/system.json',schema: systemSchema },
            { name: 'passives',csv: 'csv/passives.csv',json: 'src/data/passives.json',schema: passivesSchema },
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
 * 列: id,name,desc,icon,unlocked,maxWeapons,maxHp,hpRegen,speed,
 *     damagePercent,attackSpeed,attackRange,armor,dodge,critChance,critDamage,
 *     lifeSteal,harvesting,luck,xpGain,meleeDamage,rangedDamage,
 *     elementalDamage,engineering,tags,unlockType,unlockValue,passives,
 *     preferredClasses,preferredClasses_2
 * 注: v1.1 武器槽位=1, weaponSlots 改 maxWeapons (角色可装备武器总数 4-6)
 *     preferredClasses = 1级分类偏好, preferredClasses_2 = 2级细分类偏好
 */
const characterSchema = {
    id: 'string',
    name: 'string',
    desc: 'string',
    icon: 'string',
    unlocked: 'boolean',
    maxWeapons: 'number',
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
    preferredClasses: 'array',
    preferredClasses_2: 'array',
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
 * 列: id,name,desc,icon,cost,tag,minLevel,
 *     damage_lv1,damage_lv2,damage_lv3,damage_lv4,
 *     cooldown_lv1,cooldown_lv2,cooldown_lv3,cooldown_lv4,
 *     speedMult,
 *     critChanceAdd,critDamageAdd,armorAdd,hpRegenAdd,maxHpAdd,lifeStealAdd,
 *     bulletCount,bulletSpeed,bulletMaxRange,attackRange,spread,pierce,
 *     burnDps,burnMaxStacks,chainCount,splashRadius,homingStrength,
 *     slowAmount,slowDuration,healOnHit,auraHeal,auraRadius,
 *     sprayCone,
 *     behavior,class,class_2,knockback,magSize,reloadTime
 * 注: v1.1 移除 slots 字段 (武器槽位=1), 新增 class_2 二级分类 (在 class 后面)
 *     damageReductionAura / killHeal 尚未在 CSV 中, 解析时默认填 0
 * v1.3 移除 attackRangeMult 字段 (死字段, 引擎不用, 角色 attackRange 已归 0)
 */
const weaponSchema = {
    id: 'string',
    name: 'string',
    desc: 'string',
    icon: 'string',
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
    class_2: 'string',
    knockback: 'number',
    magSize: 'number',
    reloadTime: 'number',
    damageReductionAura: 'number',
    killHeal: 'number',
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
 * levelUpCards.csv Schema v2 (Brotato-style)
 * 每行 = 一张独立卡片（可反复出现）
 * tier: I|II|III|IV — 卡片等级
 * statField: 属性字段名
 * statValue: 属性增加值
 * tags: 管道符分隔的流派标签
 * unlockLevel: 角色等级解锁条件
 * actionType: weaponLevelUp|weaponQualityUp|addWeaponSlot
 */
const levelUpCardsSchema = {
    id: 'string',
    name: 'string',
    desc: 'string',
    icon: 'string',
    tier: 'string',
    statField: 'string',
    statValue: 'number',
    tags: 'array',
    unlockLevel: 'number',
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

/**
 * rarity.csv Schema
 * 列: id,weight,minWave,costMult
 * 商店稀有度数值参数，颜色/名称由 rarityColors.csv 单独提供
 */
const raritySchema = {
    id: 'string',
    weight: 'number',
    minWave: 'number',
    costMult: 'number',
};

/**
 * audio.csv Schema
 * 列: category,id,type,file,name,categoryTag
 * category: bgm=BGM曲目, sfx_type=type→seId映射, sfx_file=seId→文件名映射
 */
const audioSchema = {
    category: 'string',
    id: 'string',
    type: 'string',
    file: 'string',
    name: 'string',
    categoryTag: 'string',
};

/**
 * classes.csv Schema
 * 列: id,中文名,英文名,描述
 * 武器类别（Class）定义表，前端 UI 通过 id 查找对应的显示名和描述
 */
const classSchema = {
    id: 'string',
    '中文名': 'string',
    '英文名': 'string',
    '描述': 'string',
};

/**
 * level_duration.csv Schema
 * 列: level,duration
 *  - level: 关卡(整数) 或 "default"
 *  - duration: 该关卡波次持续时间(秒)
 */
const levelDurationSchema = {
    level: 'string',  // 接受 "default" / "1" / "2" 等
    duration: 'number',
};

/**
 * passives.csv Schema
 * 列: id,name,desc,icon,triggerType,condition,chance,effect,target,tags,cooldown
 * 被动技能数据表，每个角色对应的专属被动
 * effect 为 JSON 对象，按 type 字段区分不同的效果结构
 */
const passivesSchema = {
    id: 'string',
    name: 'string',
    desc: 'string',
    icon: 'string',
    triggerType: 'string',
    condition: 'json',
    chance: 'number',
    effect: 'json',
    target: 'string',
    tags: 'array',
    cooldown: 'number',
};

/**
 * system.csv Schema
 * 列: key,value,valueType,desc,group
 *  - key: 参数唯一标识 (英文)
 *  - value: 数值或字符串值
 *  - valueType: number|string|boolean
 *  - desc: 中文说明
 *  - group: orbit|combat|render|debug
 */
const systemSchema = {
    key: 'string',
    value: 'string',  // CSV 全是字符串,运行时再 cast
    valueType: 'string',
    desc: 'string',
    group: 'string',
};

// ============================================================
// 入口
// ============================================================
if (require.main === module) {
    const ok = CSV2JSON.convertAll();
    process.exit(ok ? 0 : 1);
}

module.exports = { CSV2JSON, characterSchema, characterLevelSchema, weaponSchema, itemSchema, enemySchema, bossSchema, waveSchema, weaponStatSchema, charStatSchema, difficultySchema, debugSchema, levelUpCardsSchema, rarityColorsSchema, audioSchema, classSchema, levelDurationSchema, passivesSchema };

/**
 * level_duration.csv Schema
 * 列: level,duration
 *  - level: 关卡(整数) 或 "default"
 *  - duration: 该关卡波次持续时间(秒)
 */
