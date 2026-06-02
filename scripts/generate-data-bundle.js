// ============================================================
// scripts/generate-data-bundle.js
// 生成 src/data/data-bundle.js（用于 file:// 离线运行）
// 用法: node scripts/generate-data-bundle.js
// ============================================================
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'src', 'data');
const FILES = [
    'characters', 'characterLevel', 'weapons', 'items', 'enemies',
    'bosses', 'waves', 'passives', 'levelUpCards', 'weaponStats', 'charStats', 'difficulty', 'debug', 'rarityColors',
];
const OUTPUT = join(DATA_DIR, 'data-bundle.js');

let lines = [
    '// ============================================================',
    '// src/data/data-bundle.js — 内联数据包（用于 file:// 离线运行）',
    '// 自动生成: node scripts/generate-data-bundle.js',
    '// 修改 JSON 文件后请重新生成此文件',
    '// ============================================================',
    '',
    'window.__DATA_BUNDLE__ = window.__DATA_BUNDLE__ || {};',
    '',
];

for (const name of FILES) {
    const filePath = join(DATA_DIR, `${name}.json`);
    const content = readFileSync(filePath, 'utf8');
    lines.push(`__DATA_BUNDLE__['${name}'] = ${content};`);
    lines.push('');
}

const output = lines.join('\n');
writeFileSync(OUTPUT, output, 'utf8');
console.log(`✓ Generated: ${OUTPUT} (${(output.length / 1024).toFixed(0)} KB)`);
