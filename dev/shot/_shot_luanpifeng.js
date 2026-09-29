'use strict';
/* 乱披风在舞剑流下的「乱弧」验收图。
   2026-09-29 之前：Fusion.spreadArcOf 只在飞剑流调用，舞剑流的挥砍弧度是固定的
   —— 这件法宝对近战只剩 spread/fireRate 两条普通加成，招牌机制整条是哑的。
   图里左右对照：同一次挥砍动作各做 6 遍，左边弧度恒定、右边每次都不同。 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 760, height: 400 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(FILE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const data = await p.evaluate(() => {
    const G = window.Game;
    G.newRun('wujian');
    G.newFloor(1);
    G.state = 'play';
    const pl = G.player;
    G.enemies.length = 0;
    if (G.room && G.room.obstacles) G.room.obstacles.length = 0;
    const sample = () => {
      const arcs = [];
      for (let k = 0; k < 6; k++) {
        G.slashes.length = 0;
        pl.shootCd = 0;
        STYLES.wujian.attack(pl, G, { shooting: true, aiming: true, aimAngle: -Math.PI / 2 });
        arcs.push(+(G.slashes[0] ? G.slashes[0].arc : 0).toFixed(3));
      }
      return arcs;
    };
    pl.items.length = 0; pl.recomputeStats('wujian');
    const plain = sample();
    pl.give('luanpifeng', G); G.itemPopup = null;
    const wild = sample();
    return { plain, wild, spread: +pl.stats.spread.toFixed(2) };
  });

  const deg = r => (r * 180 / Math.PI).toFixed(0);
  const W = 700, H = 352, PANEL = 330;
  const svg = (() => {
    const panel = (ox, arcs, title, col) => {
      const cx = ox + PANEL / 2, cy = 150, R = 96;
      let s = '<text x="' + (ox + 16) + '" y="28" font-family="sans-serif" font-size="14" fill="#c9c4e0">' + title + '</text>';
      s += '<rect x="' + (ox + 14) + '" y="44" width="' + (PANEL - 28) + '" height="238" rx="10" fill="#141126" stroke="#2e2748" stroke-width="1"/>';
      arcs.forEach((a2, i) => {
        const half = a2 / 2, base = -Math.PI / 2;
        const x1 = cx + Math.cos(base - half) * R, y1 = cy + Math.sin(base - half) * R;
        const x2 = cx + Math.cos(base + half) * R, y2 = cy + Math.sin(base + half) * R;
        s += '<path d="M' + cx + ' ' + cy + ' L' + x1.toFixed(1) + ' ' + y1.toFixed(1)
          + ' A' + R + ' ' + R + ' 0 0 1 ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + ' Z" fill="' + col
          + '" fill-opacity="0.16" stroke="' + col + '" stroke-opacity="0.75" stroke-width="1"/>';
      });
      s += '<circle cx="' + cx + '" cy="' + cy + '" r="6" fill="#e8e6f5"/>';
      s += '<text x="' + (ox + 26) + '" y="272" font-family="sans-serif" font-size="12" fill="#8f8ba8">6 次挥砍的弧度：</text>';
      s += '<text x="' + (ox + 26) + '" y="292" font-family="monospace" font-size="13" fill="' + col + '">'
        + arcs.map(x => deg(x) + '°').join('  ') + '</text>';
      return s;
    };
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" xmlns="http://www.w3.org/2000/svg">'
      + '<rect width="' + W + '" height="' + H + '" fill="#0e0a1a"/>'
      + panel(16, data.plain, '没有乱披风 · 挥砍弧度固定', '#7f8b9e')
      + panel(354, data.wild, '有乱披风 · 每次弧度都不同', '#5fd6b0')
      + '<text x="16" y="318" font-family="sans-serif" font-size="12" fill="#8f8ba8">'
      + '两侧同为舞剑流的一次普通挥砍；spread = ' + data.spread + '（乱披风 +2）。</text>'
      + '<text x="16" y="336" font-family="sans-serif" font-size="12" fill="#8f8ba8">'
      + '命中数仍受「基础 3 + pierce」封顶，扫得再宽也不会变成无脑清场。</text>'
      + '</svg>';
  })();
  fs.writeFileSync(path.join(OUT, '_preview_luanpifeng.svg'), svg);
  console.log('saved _preview_luanpifeng.svg');
  console.log('  无乱披风：' + data.plain.map(deg).join('/'));
  console.log('  有乱披风：' + data.wild.map(deg).join('/'));
  await b.close();
})();
