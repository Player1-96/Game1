'use strict';
/* 纯 Node 探针：核实地宫「藏珍阁是否落在死胡同」与精英/Boss 危险区逃逸几何。
   只加载地宫生成所需的最小上下文，不依赖浏览器。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = ['px.js', 'items.js', 'dungeon.js', 'entities.js'];
const files = {};
for (const f of SRC) files[f] = fs.readFileSync(path.join(__dirname, '..', '..', 'src', f), 'utf8');

// ---- 最小 DOM / 画布桩 ----
const ctxStub = new Proxy({}, { get: () => () => {} });
function mkCanvasStub() { return { width: 0, height: 0, getContext: () => ctxStub }; }
const documentStub = {
  createElement: (t) => (t === 'canvas' ? mkCanvasStub() : {}),
  getElementById: () => null, addEventListener: () => {}
};
const SPRStub = new Proxy({}, { get: () => new Proxy({}, { get: () => ({ width: 1, height: 1 }) }) });

const sandbox = {
  console, Math, Date, JSON, Object, Array, Number, String, Boolean, isNaN, parseInt, parseFloat, Proxy, Map, Set,
  window: {}, document: documentStub, performance: { now: () => 0 },
  SPR: SPRStub, requestAnimationFrame: () => 0, setTimeout, clearTimeout
};
sandbox.window = sandbox;
vm.createContext(sandbox);

let code = '';
for (const f of SRC) code += '\n//# ' + f + '\n' + files[f] + '\n';
code += '\nglobalThis.Floor = Floor; globalThis.RT = RT; globalThis.DIRS = DIRS;\n';
vm.runInContext(code, sandbox, { filename: 'game-src.js' });

const { Floor, RT, DIRS } = sandbox;

/* ---------- 核实 3：藏珍阁是否总在死胡同 ---------- */
function degree(r) { return r.doors.reduce((s, d) => s + (d ? 1 : 0), 0); }

let floors = 0, badDeg = 0, badReach = 0, maxBlocked = 0;
const samples = [];
for (let i = 0; i < 400; i++) {
  const seed = (Math.random() * 0xffffffff) >>> 0;
  const depth = 1 + (i % 5);
  let fl;
  try { fl = new Floor(depth, seed); } catch (e) { if (floors === 0 && !global.__errShown) { global.__errShown = 1; console.log('构造失败:', e.message, e.stack.split('\n')[1]); } continue; }
  floors++;
  const rooms = [...fl.rooms.values()];
  const tre = rooms.find(r => r.type === RT.TREASURE);
  if (!tre) continue;
  if (degree(tre) !== 1) {
    badDeg++;
    if (samples.length < 5) samples.push({ depth, degree: degree(tre), rooms: rooms.length });
  }
  // 挖掉藏珍阁后：Boss 是否仍可达、有多少房间变不可达
  const boss = rooms.find(r => r.type === RT.BOSS);
  const start = rooms.find(r => r.type === RT.START);
  if (!boss || !start) continue;
  const seen = new Set([start.key]);
  const q = [start];
  while (q.length) {
    const cur = q.shift();
    for (let d = 0; d < 4; d++) {
      const nk = cur.neighbors[d];
      if (!nk || nk === tre.key || seen.has(nk)) continue;
      const n = fl.rooms.get(nk); if (!n) continue;
      seen.add(nk); q.push(n);
    }
  }
  if (!seen.has(boss.key)) badReach++;
  let blocked = 0;
  for (const r of rooms) if (r !== tre && !seen.has(r.key)) blocked++;
  if (blocked > 0) maxBlocked = Math.max(maxBlocked, blocked);
}
console.log('=== 核实3：藏珍阁死胡同 ===');
console.log('采样层数            :', floors);
console.log('藏珍阁非死胡同层数  :', badDeg, '(' + (badDeg / floors * 100).toFixed(2) + '%)');
console.log('挖掉后 Boss 不可达  :', badReach);
console.log('挖掉后有人被挡      :', maxBlocked > 0 ? '最多 ' + maxBlocked + ' 间' : '无');
console.log('样例(非死胡同)      :', JSON.stringify(samples));

/* ---------- 核实 4：精英死亡地面危险能否走出 ---------- */
/* Hazard 命中判定：dist < r*0.8 + p.r（p.r=7）；预警 warn 帧内不生效。
   玩家从危险区圆心原地逃逸，直线全速（含 0.28 加速度插值）。 */
const PSPD = 2.35, PR = 7;
const hazards = [
  { key: 'blood 血箭沼', r: 34, warn: 45 },
  { key: 'volley 火圈', r: 40, warn: 45 },
  { key: 'venom 毒沼', r: 52, warn: 50 },
  { key: 'boss 天罚', r: 40, warn: 50 },
  { key: 'boss 阶2', r: 30, warn: 45 }
];
function escapeRun(r, warn) {
  const hitR = r * 0.8 + PR;
  let x = 0, v = 0, dist = 0;
  for (let t = 0; t < warn + 1; t++) {         // t=warn+1 帧首次结算
    v = v + (PSPD - v) * 0.28;                 // lerp 加速
    x += v; dist = x;
    if (t >= warn && dist < hitR) return { hit: true, dist };
  }
  return { hit: false, dist };
}
console.log('\n=== 核实4：精英死亡危险区（圆心起跑）===');
for (const h of hazards) {
  const need = ((h.r * 0.8 + PR) / h.warn).toFixed(2);
  const e = escapeRun(h.r, h.warn);
  console.log(`${h.key.padEnd(12)} r=${String(h.r).padStart(2)} warn=${String(h.warn).padStart(2)} ` +
    `命中半径=${(h.r * 0.8 + PR).toFixed(1).padStart(4)} 理论需=${need}px/帧 实跑=${e.dist.toFixed(1).padStart(5)}px → ${e.hit ? '必吃' : '可走出'}`);
}

/* ---------- 核实 S5：贴身 8 向环有无缝隙 ---------- */
/* 环以玩家方向为 0° 起算（castPerk 用 atan2(player-elite)），故必有一发正对玩家。
   弹 r=5、速 2.8；玩家 r=7、速 2.35。玩家用恒定方向全速逃逸，暴力搜索最佳方向。 */
const BR = 5, BSPD = 2.8;
function ringDodge(d0) {
  const N = 8, need = 2 * (BR + PR);            // 通过相邻弹所需弦距
  // 几何阈值：2R·sin(π/8) > need → R > need/(2 sin(π/8))
  const rMin = need / (2 * Math.sin(Math.PI / N));
  let best = null;
  for (let deg = 0; deg < 360; deg += 1) {
    const ma = deg * Math.PI / 180;
    let px = 0, py = d0, vx = 0, vy = 0, hit = false;
    for (let t = 0; t < 90; t++) {
      vx = vx + (Math.cos(ma) * PSPD - vx) * 0.28;
      vy = vy + (Math.sin(ma) * PSPD - vy) * 0.28;
      px += vx; py += vy;
      for (let i = 0; i < N; i++) {
        const a = i / N * Math.PI * 2;          // 0° 正对玩家（玩家初始在 +y 方向）
        const bx = Math.cos(a) * BSPD * t, by = Math.sin(a) * BSPD * t;
        const dd = Math.hypot(px - bx, py - by);
        if (dd < BR + PR) { hit = true; break; }
      }
      if (hit) break;
    }
    if (!hit) { best = deg; break; }
  }
  return { rMin, best };
}
console.log('\n=== 核实S5：贴身 8 向环弹幕 ===');
console.log('出现缝隙的最小半径（弦距判据）:', (2 * (BR + PR) / (2 * Math.sin(Math.PI / 8))).toFixed(1), 'px');
for (const d0 of [15, 19, 25, 32, 40]) {
  const r = ringDodge(d0);
  console.log(`施放时贴近 ${String(d0).padStart(2)}px → 存在可逃方向? ${r.best === null ? '否（无缝隙）' : '是（约 ' + r.best + '°）'}`);
}
