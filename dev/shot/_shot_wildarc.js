'use strict';
/* 乱披风的「乱弧」视觉验收 —— 直接截游戏画面。
   想说明的只有一句：有乱披风的那一刀，画面上**看得出是碎的**，不是一条光滑的弧。
   三行 = 普通 / 乱披风 Lv1 / 乱披风 Lv3（Lv3 多一层金边）。
   三列 = 起手(2帧) / 中段(5帧) / 扫满(9帧)。 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 900, height: 520 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(FILE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const ROWS = [
    { item: null,         tier: 0, tag: '① 普通挥砍　一条平滑的弧（数值在变，画面上看不出来）' },
    { item: 'luanpifeng', tier: 1, tag: '② 乱披风 Lv1　碎弧 + 每帧重摇 + 碎星' },
    { item: 'luanpifeng', tier: 3, tag: '③ 乱披风 Lv3　再叠一层金边（高级融合法器）' }
  ];
  const FRAMES = [2, 5, 9];

  /* 逐格布景 → 截 canvas 上玩家周围那一块 → 拼成一张总图 */
  const dataURL = await p.evaluate((cfg) => {
    const G = window.Game;
    const src = document.getElementById('game');
    const CW = 156, CH = 138, Z = 2.6, GAP = 8, PADX = 14, HDR = 22;
    const colW = CW * Z, rowH = CH * Z + HDR;
    const c = document.createElement('canvas');
    c.width = PADX * 2 + colW * 3 + GAP * 2;
    c.height = rowH * 3 + 30;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0a0812'; g.fillRect(0, 0, c.width, c.height);
    g.font = '13px sans-serif';

    const fuseTier = (pl, id, tier) => {
      pl.fusionMem = pl.fusionMem || {};
      pl.fusionMem[id] = { a: tier, b: tier };
      pl.recomputeStats(G.style);
    };

    cfg.ROWS.forEach((row, ri) => {
      const y0 = 22 + ri * rowH;
      g.fillStyle = ['#c9c4e0', '#a9f2dd', '#f7d998'][ri];
      g.fillText(row.tag, PADX, y0 - 6);
      cfg.FRAMES.forEach((f, ci) => {
        G.newRun('wujian');
        G.stylePath = ['cn']; G.seg = 0; G.applySegmentPalette();
        G.newFloor(1); G.state = 'play';
        const pl = G.player;
        G.enemies.length = 0; G.slashes.length = 0;
        if (G.room && G.room.obstacles) G.room.obstacles.length = 0;
        pl.x = 240; pl.y = 150;
        if (row.item) { pl.give(row.item, G); if (row.tier > 1) fuseTier(pl, row.item, row.tier); }
        pl.shootCd = 0;
        STYLES.wujian.attack(pl, G, { shooting: true, aiming: true, aimAngle: 0 });
        for (let k = 0; k < f; k++) G.update();
        G.draw();
        const dx = PADX + ci * (colW + GAP);
        g.drawImage(src, 240 - 78, 150 - 69, CW, CH, dx, y0 + 4, colW, CH * Z);
        g.fillStyle = '#6d6889'; g.font = '11px sans-serif';
        g.fillText(['起手', '中段', '扫满'][ci], dx + 2, y0 + 4 + CH * Z + 13);
        g.font = '13px sans-serif';
      });
    });
    g.fillStyle = '#8f8ba8'; g.font = '12px sans-serif';
    g.fillText('同一把刀、同一个朝向：②③ 的刃光是**断的、抖的、带火星的** —— 一眼就能看出这是法宝在起作用',
      PADX, c.height - 10);
    return c.toDataURL('image/png');
  }, { ROWS: ROWS, FRAMES: FRAMES });

  fs.writeFileSync(path.join(OUT, '_preview_wildarc.png'),
    Buffer.from(dataURL.split(',')[1], 'base64'));
  console.log('saved _preview_wildarc.png');
  await b.close();
})();
