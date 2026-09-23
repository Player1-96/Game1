'use strict';
/* ============================================================
 *  px.js —— 像素绘制引擎
 *  所有美术素材均由代码在离屏画布上以「像素」为单位绘制，
 *  最后统一放大渲染（image-rendering: pixelated），保证像素质感。
 * ============================================================ */

/* ============================================================
 *  风格色板（Style.pal 可插拔重构）
 *
 *  原状：PAL 是一个全局单例，812 处 `PAL.jade` 直接引用它。
 *  为了「换风格」，最省事也最安全的做法不是把这 812 处全改成
 *  `pal('jade')`（改错一处就是静默的配色错乱），而是让 **PAL 本身
 *  变成一个指向「当前激活色板」的代理** —— 引用写法一个字都不用动，
 *  换风格只要把 `STYLE_CUR` 指到另一套色板即可。
 *
 *  三条硬约束（都是这类「代理式重构」的坑）：
 *   ① 代理要能 `Object.keys()` —— 资源表与断言会遍历色板键名，
 *      只做 getter 代理会让 keys 变空。用 Proxy 同时挂 get/ownKeys。
 *   ② 中性色（白 / 黑 / 半透明遮罩）**不跟着风格变** —— 它们不是
 *      风格表达，是画面基础。涂上风格色会让所有遮罩一起变色。
 *   ③ `sprites.js` 的烘焙是**读 PAL 画位图**，所以换风格必须重建
 *      烘焙缓存（实测约 122 ms），见 `buildSprites(style)` 的按风格缓存。
 * ============================================================ */

/* ============================================================
 *  色板分层的判据（**改配色前先读这一段**）
 *
 *  182 处硬编码色不是全都该收进色板的，它们分三类，处理方式不同：
 *
 *  ① 环境色（**已收进色板**）
 *     地面 / 墙 / 门 / 宝箱 / 图标底 / HUD 面版 / 小地图 / 描边 / 道具环境色。
 *     这些是「这个世界的底色」，换风格必须一起变。
 *     落在 `wall / wallHi / wallLo / rune / moss / edge / edgeSoft / edgeWarm`。
 *
 *  ② 妖物固有色（**故意不收，见 sprites.js 各 draw* 函数的 `const C = '#...'`**）
 *     邪祟的紫、尸傀的绿、血蝠的红、玄甲卫的青灰……
 *     这些是**敌人的辨识特征** —— 血蝠在哪个风格里都该是血红。
 *     收进色板会导致「换个风格敌人认不出来了」，是负收益。
 *     ⚠️ 想让同一敌人跨风格有变化，**不要改这里**，走 ROADMAP 技巧 1 的
 *     「`c1`/`c2` 双色参数化」：给 `drawXxx(c1, c2)` 加形参，由风格表注入。
 *     三期做北欧时会需要，现在留位。
 *
 *  ③ 中性色（**不收**）
 *     `#fff` / `#000` / `rgba(...,0.x)` 遮罩 / 高光 / 描白。
 *     它们不表达风格，只表达「亮」与「暗」。涂上风格色会让所有遮罩一起变色，
 *     是典型的越改越糟。
 *
 *  2026-09-23 第二期落地时的实测口径：
 *    改前 182 处 → 改后剩余 30 处（②的妖物固有色 18 处 + ③的中性色 12 处）
 * ============================================================ */
const PAL_KEYS = [
  'ink', 'ink2', 'stone', 'stone2', 'stoneHi', 'stoneLo',
  'floor', 'floor2', 'floor3', 'floorLine',
  'jade', 'jadeD', 'jadeL',
  'gold', 'goldD', 'goldL',
  'red', 'redD', 'redL',
  'purple', 'purpleD', 'purpleL',
  'white', 'grey', 'greyD', 'greyL',
  'skin', 'skinD', 'hair', 'hairL',
  'blood', 'bone',
  'green', 'greenD', 'cyan', 'cyanD',
  'orange', 'fire',
  'shadow',
  /* 风格专属扩展位（各风格可覆盖，也可以新增自己的键） */
  'wall', 'wallHi', 'wallLo', 'moss', 'rune',
  /* 描边：妖物 / Boss 的外轮廓。跟风格走 —— 换风格时轮廓色要一起沉下去，
     否则原版近乎纯黑的描边在赤铜 / 玄墨底色上会「跳」出来 */
  'edge', 'edgeSoft', 'edgeWarm'
];

/* ---------- 中式 · 3 个层段 ----------
 *  同一个风格按「层段」换色，零新绘制（ROADMAP 技巧 1）。
 *  三段应当「一眼看出是同一个世界，但天色变了」：
 *    一（1~5 层） 青玉 —— 原版配色，夜色为底
 *    二（5~10 层）赤铜 —— 暮色，朱金转主调，暖而燥
 *    三（10~15 层）玄墨 —— 劫雷将至，青转电紫，冷而危
 */
const STYLE_PAL = {
  /* 中式 · 一段「青玉」—— 沿用原版配色，一字不改，保证老存档观感一致 */
  cn_1: {
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
    shadow: 'rgba(8,5,18,0.35)',
    wall: '#2a2340', wallHi: '#4d4478', wallLo: '#1d1832',
    moss: '#3fd68a', rune: '#5a5478',
    edge: '#07050f', edgeSoft: '#0a0308', edgeWarm: '#0a0812'
  },

  /* 中式 · 二段「赤铜」—— 暮色。石转褐、玉转铜、地砖转暖，五行属火 */
  cn_2: {
    ink: '#1a0f0c', ink2: '#2a1a14',
    stone: '#54403a', stone2: '#66504a', stoneHi: '#8a6e60', stoneLo: '#3a2a24',
    floor: '#3e2c26', floor2: '#47332c', floor3: '#503a32', floorLine: '#33221c',
    jade: '#e0a24c', jadeD: '#a86a22', jadeL: '#f7d998',
    gold: '#ffd166', goldD: '#c98a20', goldL: '#fff0b8',
    red: '#f0623c', redD: '#a83218', redL: '#ffa285',
    purple: '#b0553c', purpleD: '#6e2a1c', purpleL: '#e0a08a',
    white: '#f6ece0', grey: '#b09a8a', greyD: '#7a6558', greyL: '#e0d0c2',
    skin: '#f2c096', skinD: '#c98a5e',
    hair: '#2c1a12', hairL: '#4a2e20',
    blood: '#d43a2a', bone: '#ecdfc8',
    green: '#a8b84a', greenD: '#6e7a24',
    cyan: '#6cc2c8', cyanD: '#33727a',
    orange: '#f59a3c', fire: '#ff7a2d',
    shadow: 'rgba(20,8,4,0.42)',
    wall: '#3e2c26', wallHi: '#7a5a48', wallLo: '#2a1a14',
    moss: '#c8a04a', rune: '#8a6e60',
    edge: '#140905', edgeSoft: '#180b06', edgeWarm: '#1a0c04'
  },

  /* 中式 · 三段「玄墨」—— 劫雷将至。青转电紫、夜色更重，五行属雷 */
  cn_3: {
    ink: '#0a0a18', ink2: '#161632',
    stone: '#33325c', stone2: '#43406e', stoneHi: '#6a63a0', stoneLo: '#221f40',
    floor: '#222244', floor2: '#282850', floor3: '#303058', floorLine: '#1a1a3a',
    jade: '#7c9cf5', jadeD: '#3f52b8', jadeL: '#c8dcff',
    gold: '#e8c84a', goldD: '#a8861c', goldL: '#fff2a0',
    red: '#f0566e', redD: '#a81e38', redL: '#ff96ac',
    purple: '#b48cff', purpleD: '#6a3fd0', purpleL: '#ded0ff',
    white: '#f0eeff', grey: '#a09cc8', greyD: '#6a6698', greyL: '#d6d2f0',
    skin: '#e8c4a0', skinD: '#b88a6a',
    hair: '#181428', hairL: '#302a4c',
    blood: '#c02a52', bone: '#e0dcf0',
    green: '#4ad8b0', greenD: '#1e8a6e',
    cyan: '#8ce0ff', cyanD: '#3f8fc8',
    orange: '#f08a4a', fire: '#ff5a6a',
    shadow: 'rgba(4,4,20,0.46)',
    wall: '#222244', wallHi: '#5a5488', wallLo: '#14142c',
    moss: '#5ec8e8', rune: '#7c9cf5',
    edge: '#050510', edgeSoft: '#070714', edgeWarm: '#04040e'
  }
};

/* 风格定义表：每项是一棵「风格 → 层段 → 色板」的树。
 * 第一期中式 3 段全部就绪；北欧 / 克苏鲁留位（ROADMAP 第 4 / 5 期）。 */
const STYLE_DEF = {
  cn: {
    name: '中式仙侠', cn: '中式', ready: true,
    segs: [
      { key: 'cn_1', name: '青玉', cn: '一重·青玉', desc: '夜色为底，青玉为骨' },
      { key: 'cn_2', name: '赤铜', cn: '二重·赤铜', desc: '暮色四合，丹火腾空' },
      { key: 'cn_3', name: '玄墨', cn: '三重·玄墨', desc: '玄墨压境，劫雷在望' }
    ]
  },
  nordic: { name: '北欧神话', cn: '北欧', ready: false, segs: [] },
  cthulhu: { name: '克苏鲁', cn: '克苏鲁', ready: false, segs: [] }
};

/* 当前激活的风格与层段（0-based 层段号） */
let STYLE_CUR = 'cn';
let STYLE_SEG = 0;

/* 取某个风格的某个层段的色板（缺省回落到中式一段，永不返回 undefined） */
function palOf(style, seg) {
  const d = STYLE_DEF[style];
  if (!d || !d.segs || !d.segs.length) return STYLE_PAL.cn_1;
  const s = d.segs[clamp(seg | 0, 0, d.segs.length - 1)];
  return STYLE_PAL[s.key] || STYLE_PAL.cn_1;
}
/* 当前激活色板 */
function curPal() { return palOf(STYLE_CUR, STYLE_SEG); }

/* 切风格：只改指针。**重建烘焙是调用方的责任**（见 buildSprites(style)） */
function setStyle(style, seg) {
  if (STYLE_DEF[style]) STYLE_CUR = style;
  STYLE_SEG = Math.max(0, seg | 0);
  PAL_ACTIVE = curPal();
  return PAL_ACTIVE;
}

/* 供跨风格取色用：pal('jade') 当前风格 / pal('jade', 'cn_2') 指定色板 */
function pal(key, palKey) {
  const p = palKey ? (STYLE_PAL[palKey] || curPal()) : curPal();
  return p[key] !== undefined ? p[key] : (PAL_ACTIVE[key] !== undefined ? PAL_ACTIVE[key] : key);
}

/* 实际色板对象（setStyle 时被换掉） */
let PAL_ACTIVE = STYLE_PAL.cn_1;

/* ---------- PAL 代理 ----------
 * 让 812 处 `PAL.jade` 的写法在重构后**一个字都不用改**。
 * 必须同时实现 get 与 ownKeys（见硬约束 ①），否则 `Object.keys(PAL)` 变空，
 * 资源表导出与色板断言会静默拿到 0 个键。 */
const PAL = new Proxy({}, {
  get(_, k) {
    if (k === '__isProxy') return true;
    if (k === '__pal') return PAL_ACTIVE;
    return PAL_ACTIVE[k];
  },
  set(_, k, v) { PAL_ACTIVE[k] = v; return true; },
  has(_, k) { return k in PAL_ACTIVE; },
  ownKeys() { return Object.keys(PAL_ACTIVE); },
  getOwnPropertyDescriptor(_, k) {
    if (!(k in PAL_ACTIVE)) return undefined;
    return { enumerable: true, configurable: true, value: PAL_ACTIVE[k], writable: true };
  }
});

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
