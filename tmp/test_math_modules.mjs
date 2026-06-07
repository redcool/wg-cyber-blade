// 验证 Vec2 / Angle 模块加载 + 函数正确
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

const r = await page.evaluate(() => {
    const v = window.Vec2;
    const a = window.Angle;
    return {
        vec2: {
            loaded: !!v,
            // 基础
            add: v.add({x:1,y:2}, {x:3,y:4}),
            sub: v.sub({x:5,y:5}, {x:1,y:1}),
            scale: v.scale({x:2,y:3}, 4),
            dot: v.dot({x:2,y:3}, {x:4,y:1}),
            length: v.length({x:3,y:4}),
            lengthSq: v.lengthSq({x:3,y:4}),
            dist: v.dist({x:0,y:0}, {x:3,y:4}),
            distSq: v.distSq({x:0,y:0}, {x:3,y:4}),
            diff: v.diff({x:1,y:2}, {x:5,y:6}),
            normalize: v.normalize({x:3,y:4}),
            normalizeZero: v.normalize({x:0,y:0}),
            clampLength: v.clampLength({x:3,y:4}, 2.5),
        },
        angle: {
            loaded: !!a,
            fromPoints: a.fromPoints({x:0,y:0}, {x:1,y:0}),  // 0
            fromPointsUp: a.fromPoints({x:0,y:0}, {x:0,y:-1}), // -π/2
            fromPointsLeft: a.fromPoints({x:0,y:0}, {x:-1,y:0}), // π
            toDeg: a.toDeg(Math.PI),
            toRad: a.toRad(180),
            normalize: a.normalize(3 * Math.PI),   // -π
            normalizeNeg: a.normalize(-3 * Math.PI), // π
            shortestDiff: a.shortestDiff(0, Math.PI),    // π
            shortestDiff2: a.shortestDiff(0, -Math.PI),  // -π
            shortestDiffShort: a.shortestDiff(0, 3 * Math.PI / 2), // -π/2 (短弧)
            inConeYes: a.inCone(0, 0, Math.PI/4),        // true
            inConeNo: a.inCone(Math.PI, 0, Math.PI/4),   // false
            inConeYes2: a.inCone(Math.PI/2, Math.PI/2 + 6 * Math.PI, Math.PI/4), // true (normalized)
            lerp: a.lerp(0, Math.PI, 0.5),                // π/2
        },
    };
});

console.log('--- Vec2 模块 ---');
console.log('  loaded:', r.vec2.loaded);
console.log('  add(1,2 + 3,4):', r.vec2.add);
console.log('  sub(5,5 - 1,1):', r.vec2.sub);
console.log('  scale(2,3 * 4):', r.vec2.scale);
console.log('  dot(2,3 · 4,1):', r.vec2.dot);
console.log('  length(3,4) =', r.vec2.length, '(期望 5)');
console.log('  lengthSq(3,4) =', r.vec2.lengthSq, '(期望 25)');
console.log('  dist(0,0 → 3,4) =', r.vec2.dist, '(期望 5)');
console.log('  distSq(0,0 → 3,4) =', r.vec2.distSq, '(期望 25)');
console.log('  diff(1,2 → 5,6):', r.vec2.diff);
console.log('  normalize(3,4):', r.vec2.normalize, '(期望 0.6, 0.8)');
console.log('  normalizeZero(0,0):', r.vec2.normalizeZero, '(期望 0,0)');
console.log('  clampLength(3,4, 2.5):', r.vec2.clampLength, '(期望 1.5, 2.0)');

console.log('\n--- Angle 模块 ---');
console.log('  loaded:', r.angle.loaded);
console.log('  fromPoints(0,0 → 1,0):', r.angle.fromPoints.toFixed(3), '(期望 0)');
console.log('  fromPoints(0,0 → 0,-1):', r.angle.fromPointsUp.toFixed(3), '(期望 -1.571)');
console.log('  fromPoints(0,0 → -1,0):', r.angle.fromPointsLeft.toFixed(3), '(期望 3.142 或 -3.142)');
console.log('  toDeg(π):', r.angle.toDeg, '(期望 180)');
console.log('  toRad(180):', r.angle.toRad.toFixed(3), '(期望 3.142)');
console.log('  normalize(3π):', r.angle.normalize.toFixed(3), '(期望 -3.142 = -π)');
console.log('  normalize(-3π):', r.angle.normalizeNeg.toFixed(3), '(期望 3.142 = π)');
console.log('  shortestDiff(0, π):', r.angle.shortestDiff.toFixed(3), '(期望 ±3.142)');
console.log('  shortestDiff(0, -π):', r.angle.shortestDiff2.toFixed(3), '(期望 ±3.142)');
console.log('  shortestDiff(0, 3π/2):', r.angle.shortestDiffShort.toFixed(3), '(期望 -1.571 短弧)');
console.log('  inCone(0, 0, π/4):', r.angle.inConeYes, '(期望 true)');
console.log('  inCone(π, 0, π/4):', r.angle.inConeNo, '(期望 false)');
console.log('  inCone(π/2, π/2+6π, π/4):', r.angle.inConeYes2, '(期望 true)');
console.log('  lerp(0, π, 0.5):', r.angle.lerp.toFixed(3), '(期望 1.571 = π/2)');

console.log('\nErrors:', errors);
await browser.close();
