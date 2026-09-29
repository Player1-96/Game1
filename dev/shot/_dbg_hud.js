'use strict';
/* 复现用户截图里的 HUD 状态（7 心 + 4 盾 + 灵力满），把左上角放大 8 倍看清楚。
   排查「ui 挡住了」到底挡在哪。 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 900, height: 500 }, deviceScaleFactor: 2 });
  await p.goto(FILE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  await p.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    G.stylePath = ['cn']; G.seg = 0; G.applySegmentPalette();
    G.newFloor(1);
    G.state = 'play';
    const pl = G.player;
    pl.maxHP = 14; pl.hp = 14;        // 7 颗满心
    pl.shield = 4; pl.tShield = 0;    // 4 个盾
    pl.mp = 100; pl.maxMP = 100;
    G.draw();
    const src = document.getElementById('game');
    /* 把左上 (0,0)-(190,34) 放大 8 倍 */
    const c = document.createElement('canvas');
    c.width = 190 * 8; c.height = 34 * 8;
    const g = c.getContext('2d');
    g.fillStyle = '#101018'; g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, 0, 190, 34, 0, 0, c.width, c.height);
    /* 逐行画出 y=8/19/20/30 的参考线，看有没有贴到一起 */
    g.strokeStyle = '#ff2d55'; g.lineWidth = 1;
    for (const y of [8, 19, 20, 30]) {
      g.beginPath(); g.moveTo(0, y * 8 + 0.5); g.lineTo(c.width, y * 8 + 0.5); g.stroke();
    }
    window.__dbg = c.toDataURL('image/png');
  });
  const dataURL = await p.evaluate(() => window.__dbg);
  fs.writeFileSync(path.join(OUT, '_dbg_hud_zoom.png'), Buffer.from(dataURL.split(',')[1], 'base64'));
  console.log('saved _dbg_hud_zoom.png');
  await b.close();
})();
