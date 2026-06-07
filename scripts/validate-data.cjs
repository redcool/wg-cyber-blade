// scripts/validate-data.cjs — 一次性验证脚本
// 扫描 src/data/*.json 检测两类数据健康问题:
//   1. CSV 空行遗留 → 记录所有字段均为空 (id/key/level 等关键字段都空)
//   2. 显式 id 字段为空字符串/null/undefined (CSV 编辑时丢值)
const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '..', 'src', 'data');
const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json')).sort();

let issues = 0;
for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8'));
    if (!Array.isArray(d)) { console.log(`[skip] ${f}: non-array, skipped`); continue; }
    // 检测 1: id 字段显式为空 (排除数字 0 / false 等合法 falsy 值)
    const noId = d.filter(r => r && r.id !== undefined && (
        r.id === null || (typeof r.id === 'string' && !r.id.trim())
    ));
    // 检测 2: 所有字段均为空 (CSV ",,,,," 空行典型症状)
    const allEmpty = d.filter(r => r && typeof r === 'object' &&
        Object.values(r).every(v => v === null || v === undefined ||
            (typeof v === 'string' && !v.trim()) ||
            (Array.isArray(v) && v.length === 0)));
    const bad = noId.length + allEmpty.length;
    if (bad > 0) {
        issues++;
        console.log(`[BAD]  ${f}: ${d.length} records, ${noId.length} empty id, ${allEmpty.length} all-empty`);
        [...noId, ...allEmpty].slice(0, 3).forEach((r, i) => console.log('     #' + i + ':', JSON.stringify(r).substring(0, 120)));
    } else {
        console.log(`[OK]   ${f.padEnd(22)} ${String(d.length).padStart(3)} records`);
    }
}
console.log('---');
console.log(issues === 0 ? 'PASS: all JSON data healthy' : `FAIL: ${issues} file(s) have issues`);
process.exit(issues === 0 ? 0 : 1);
