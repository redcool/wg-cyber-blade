// scripts/patch-data-bundle.cjs — 通用数据同步工具
// 同步 src/data/<name>.json → src/data/data-bundle.js 中对应的 __DATA_BUNDLE__['<name>'] 块
// 用法: node scripts/patch-data-bundle.cjs [data-name]    (默认: characters)
//
// 工作流: 编辑 csv/xxx.csv → node scripts/csv2json.cjs → node scripts/patch-data-bundle.cjs [name] → bump ?v= in index.html
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const bundlePath = path.join(ROOT, 'src/data/data-bundle.js');
const dataName = process.argv[2] || 'characters';
const jsonPath = path.join(ROOT, 'src/data', `${dataName}.json`);

if (!fs.existsSync(jsonPath)) {
    console.error(`❌ JSON 不存在: ${jsonPath}`);
    process.exit(1);
}

let bundle = fs.readFileSync(bundlePath, 'utf-8');
const dataJson = fs.readFileSync(jsonPath, 'utf-8');

// 找到 __DATA_BUNDLE__['<name>'] = [ 块
const startMarker = `__DATA_BUNDLE__['${dataName}'] = [`;
const startIdx = bundle.indexOf(startMarker);
if (startIdx === -1) {
    console.error(`❌ 找不到 ${dataName} 块起始标记: ${startMarker}`);
    process.exit(1);
}

// 从 [ 开始扫描, 找匹配的 ] (支持字符串内 ] 不计数)
let bracketDepth = 0;
let i = startIdx + startMarker.length - 1; // 在 [ 处
let inString = false;
let escape = false;
let endIdx = -1;
for (; i < bundle.length; i++) {
    const c = bundle[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '[') bracketDepth++;
    if (c === ']') {
        bracketDepth--;
        if (bracketDepth === 0) { endIdx = i; break; }
    }
}
if (endIdx === -1) {
    console.error(`❌ 找不到 ${dataName} 块结束 ]`);
    process.exit(1);
}

// 检查 ] 后是否有 ;
let afterEnd = endIdx + 1;
while (afterEnd < bundle.length && /\s/.test(bundle[afterEnd])) afterEnd++;
const hasSemi = bundle[afterEnd] === ';';
const replaceEnd = hasSemi ? afterEnd + 1 : endIdx + 1;

const before = bundle.substring(0, startIdx);
const after = bundle.substring(replaceEnd);
const newBlock = `__DATA_BUNDLE__['${dataName}'] = ${dataJson}`;

bundle = before + newBlock + after;
fs.writeFileSync(bundlePath, bundle, 'utf-8');

const records = JSON.parse(dataJson);
console.log(`✓ data-bundle.js [${dataName}] 块已替换`);
console.log(`  ${endIdx - startIdx + 1} → ${newBlock.length} chars (${Array.isArray(records) ? records.length + ' 记录' : '非数组'})`);

