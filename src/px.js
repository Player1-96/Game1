'use strict';
/* ============================================================
 *  px.js —— 像素绘制引擎
 *  所有美术素材均由代码在离屏画布上以「像素」为单位绘制，
 *  最后统一放大渲染（image-rendering: pixelated），保证像素质感。
 * ============================================================ */

/* 修仙色板：夜色为底，青玉为骨，朱金点睛 */
const PAL = {
  ink: '#100c1c', ink2: '#1d1730',
  stone: '#3b3654', stone2: '#4a4468', stoneHi: '#635c86', stoneLo: '#282338',
  floor: '#2a2942', floor2: '#31304c', floor3: '#38364f', floorLine: '#221f36',
  jade: '#57d6b0', jadeD: '#2b9b82', jadeL: '#a9f2dd',
  gold: '#f2c761', goldD: '#b8862c', goldL: '#ffe9a8',
  red: '#e05a62', redD: '#a02b3c', redL: '#ff9d8a',
  purple: '#8f5cf0', purpleD: '#5432a0', purpleL: '#c9a8ff',
  white: '#f4f1ea', grey: '#a09cb8', greyD: '#6d688a', greyL: '#d8d5e6',
  skin: '#f0c39a', skinD: '#c98f66',
  hair: '#241d33', hairL: '#3f3559',
  blood: '#c8324a', bone: '#e8e2cf',
  green: '#6cc24a', greenD: '#3d7a29',
  cyan: '#5ec8e8', cyanD: '#2b7fa5',
  orange: '#f0913c', fire: '#ff6a3d',
  shadow: 'rgba(8,5,18,0.35)'
};

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { c, g };
}

/* 确定性随机（同一种子 → 同一张图） */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
function rndRange(rng, a, b) { return a + rng() * (b - a); }
function rndInt(rng, a, b) { return Math.floor(a + rng() * (b - a + 1)); }
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }

class Px {
  constructor(w, h) {
    const o = mkCanvas(w, h);
    this.c = o.c; this.g = o.g; this.w = w; this.h = h;
  }
  clear() { this.g.clearRect(0, 0, this.w, this.h); return this; }
  set(x, y, col) { if (!col) return this; this.g.fillStyle = col; this.g.fillRect(x | 0, y | 0, 1, 1); return this; }
  rect(x, y, w, h, col) { if (!col) return this; this.g.fillStyle = col; this.g.fillRect(x | 0, y | 0, w | 0, h | 0); return this; }
  box(x, y, w, h, col) {
    this.rect(x, y, w, 1, col); this.rect(x, y + h - 1, w, 1, col);
    this.rect(x, y, 1, h, col); this.rect(x + w - 1, y, 1, h, col); return this;
  }
  disc(cx, cy, r, col) {
    const rr = r * r + r * 0.45, R = Math.ceil(r);
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++)
      if (x * x + y * y <= rr) this.set(cx + x, cy + y, col);
    return this;
  }
  ell(cx, cy, rx, ry, col) {
    for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++)
      for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) {
        const v = (x * x) / (rx * rx) + (y * y) / (ry * ry);
        if (v <= 1.08) this.set(cx + x, cy + y, col);
      }
    return this;
  }
  ring(cx, cy, r, col) {
    const R = Math.ceil(r), rr = r * r + r * 0.45, ir = (r - 1) * (r - 1) + (r - 1) * 0.45;
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      const d = x * x + y * y;
      if (d <= rr && d > ir) this.set(cx + x, cy + y, col);
    }
    return this;
  }
  line(x0, y0, x1, y1, col, thick) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, t = thick || 1;
    for (;;) {
      if (t <= 1) this.set(x0, y0, col);
      else this.rect(x0 - ((t / 2) | 0), y0 - ((t / 2) | 0), t, t, col);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    return this;
  }
  /* 对称点绘制，用于八卦、法阵等 */
  sym8(cx, cy, x, y, col) {
    this.set(cx + x, cy + y, col); this.set(cx - x, cy + y, col);
    this.set(cx + x, cy - y, col); this.set(cx - x, cy - y, col);
    this.set(cx + y, cy + x, col); this.set(cx - y, cy + x, col);
    this.set(cx + y, cy - x, col); this.set(cx - y, cy - x, col);
    return this;
  }
  /* 自动描边：为所有不透明像素外缘补一圈深色，统一像素画质感 */
  outline(col) {
    const g = this.g, w = this.w, h = this.h;
    const img = g.getImageData(0, 0, w, h); const d = img.data;
    const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 8;
    const out = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) out.push(x, y);
    }
    g.fillStyle = col || PAL.ink;
    for (let i = 0; i < out.length; i += 2) g.fillRect(out[i], out[i + 1], 1, 1);
    return this;
  }
  /* 在上方叠加一层高光/阴影，增加体积感 */
  tint(x, y, w, h, col) {
    const g = this.g;
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = col; g.fillRect(x, y, w, h);
    g.globalCompositeOperation = 'source-over';
    return this;
  }
  flipH() {
    const o = mkCanvas(this.w, this.h);
    o.g.translate(this.w, 0); o.g.scale(-1, 1); o.g.drawImage(this.c, 0, 0);
    this.c = o.c; this.g = o.g; this.g.imageSmoothingEnabled = false;
    return this;
  }
  clone() {
    const o = mkCanvas(this.w, this.h); o.g.drawImage(this.c, 0, 0); return o.c;
  }
  done() { return this.c; }
}

/* 缓存：把绘制函数的结果缓存成 canvas */
function cached(fn) {
  let v = null;
  return function () { if (!v) v = fn(); return v; };
}
