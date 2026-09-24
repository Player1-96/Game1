'use strict';
/* 弗雷之剑 vs 混元珠 vs 普通飞剑 —— 三条弹道叠在同一张图上。
   想说明的只有一句：同是「不用瞄准」，一条是**折**、一条是**弯**、一条是**直**。 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 760, height: 620 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(FILE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const data = await p.evaluate(() => {
    const G = window.Game;
    const trace = (itemId) => {
      G.newRun('feijian');
      G.stylePath = ['cn']; G.seg = 0; G.applySegmentPalette();
      const pl = G.player;
      if (itemId) { pl.give(itemId, G); pl.stats.range += 260; }   // 让剑飞得够远，折角才看得全
      G.newFloor(1); G.state = 'play';
      G.enemies.length = 0; G.bullets.length = 0;
      pl.x = 240; pl.y = 250;
      const e = new Enemy('xiesui', pl.x + 120, pl.y - 40, 1);
      e.spawnT = 0; e.speed = 0; e.maxHp = 99999; e.hp = 99999; e.touch = 0; e.cd = 999999;
      G.enemies.push(e);
      pl.shootCd = 0;
      STYLES.feijian.attack(pl, G, { shooting: true, aiming: true, aimAngle: -Math.PI / 2 });
      const bl = G.bullets[0];
      const pts = [];
      if (bl) {
        for (let f = 0; f < 90 && !bl.dead; f++) {
          G.update();
          pts.push([+bl.x.toFixed(1), +bl.y.toFixed(1)]);
        }
      }
      return { pts: pts, target: { x: e.x, y: e.y }, player: { x: pl.x, y: pl.y } };
    };
    return { plain: trace(null), hunyuan: trace('hunyuan'), freyr: trace('freyr_sword') };
  });

  /* 用返回的坐标自己画一张 SVG —— 比截游戏画面清楚得多 */
  const W = 620, H = 420, PAD = 30;
  const toX = x => (PAD + (x / 480) * (W - PAD * 2)).toFixed(1);
  const toY = y => (PAD + (y / 320) * (H - PAD * 2)).toFixed(1);
  const line = (pts, col) => pts.length < 2 ? '' :
    '<polyline points="' + pts.map(q => toX(q[0]) + ',' + toY(q[1])).join(' ') +
    '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round"/>';
  const dot = (q, col, r) => '<circle cx="' + toX(q[0]) + '" cy="' + toY(q[1]) +
    '" r="' + (r || 4) + '" fill="' + col + '"/>';
  const p0 = data.plain.player, tg = data.plain.target;
  const L = [];
  L.push('<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" xmlns="http://www.w3.org/2000/svg">');
  L.push('<rect x="' + PAD + '" y="' + PAD + '" width="' + (W - PAD * 2) + '" height="' + (H - PAD * 2) +
    '" fill="#12101f" stroke="#2e2748" stroke-width="1"/>');
  L.push(line(data.plain.pts, '#7f8b9e'));
  L.push(line(data.hunyuan.pts, '#5fd6b0'));
  L.push(line(data.freyr.pts, '#ffcc55'));
  L.push('<circle cx="' + toX(p0[0]) + '" cy="' + toY(p0[1]) + '" r="6" fill="none" stroke="#e8e6f5" stroke-width="2"/>');
  L.push('<circle cx="' + toX(tg[0]) + '" cy="' + toY(tg[1]) + '" r="8" fill="none" stroke="#e0525f" stroke-width="2"/>');
  L.push(dot(tg, '#e0525f', 3));
  L.push('<text x="' + (Number(toX(p0[0])) + 10) + '" y="' + (Number(toY(p0[1])) + 4) +
    '" font-family="sans-serif" font-size="12" fill="#c9c4e0">玩家</text>');
  L.push('<text x="' + (Number(toX(tg[0])) - 34) + '" y="' + (Number(toY(tg[1])) - 10) +
    '" font-family="sans-serif" font-size="12" fill="#ff9d8a">妖物</text>');
  L.push('<text x="40" y="20" font-family="sans-serif" font-size="13" fill="#8fd8c4">' +
    '同朝正上方射出，妖物在右前方</text>');
  L.push('<g font-family="sans-serif" font-size="12">');
  L.push('<rect x="' + (PAD + 8) + '" y="' + (H - 62) + '" width="10" height="10" fill="#7f8b9e"/>' +
    '<text x="' + (PAD + 24) + '" y="' + (H - 53) + '" fill="#c9c4e0">普通飞剑（直）</text>');
  L.push('<rect x="' + (PAD + 130) + '" y="' + (H - 62) + '" width="10" height="10" fill="#5fd6b0"/>' +
    '<text x="' + (PAD + 146) + '" y="' + (H - 53) + '" fill="#c9c4e0">混元珠 · homing（弯，一路黏着）</text>');
  L.push('<rect x="' + (PAD + 340) + '" y="' + (H - 62) + '" width="10" height="10" fill="#ffcc55"/>' +
    '<text x="' + (PAD + 356) + '" y="' + (H - 53) + '" fill="#c9c4e0">弗雷之剑 · reAim（折一道）</text>');
  L.push('</g></svg>');
  fs.writeFileSync(path.join(OUT, '_preview_freyr_reaim.svg'), L.join('\n'));
  console.log('saved _preview_freyr_reaim.svg');
  console.log('  普通剑 ' + data.plain.pts.length + ' 点　混元珠 ' + data.hunyuan.pts.length +
    ' 点　弗雷之剑 ' + data.freyr.pts.length + ' 点');
  await b.close();
})();
