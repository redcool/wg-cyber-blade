// ============================================================
// 统一缓存版本号
// 修改 JS/CSS/数据文件后, 递增此值强制浏览器重新加载
//
// 【下次更新步骤】
// 1. 改这里的 CACHE_VER
// 2. 运行 scripts/sync-version.ps1 自动同步 index.html
//    (powershell -File scripts/sync-version.ps1)
// 3. data.js 会自动使用 CACHE_VER
// ============================================================
const CACHE_VER = '2026061120';
