'use strict';
/* 三张验收图：
   ① 血条压缩（20 颗心 + 5 盾 → 会不会顶到右上角计数）
   ② Boss 贴身泛红读数
   ③ 传送阵避障（中央有石柱时阵图落在哪） */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1020, height: 420 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(FILE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const dataURL = await p.evaluate(() => {
    const G = window.Game;
    const src = document.getElementById('game');
    const cells = [];
    const shot = (tag, setup) => {
      G.newRun('feijian');
      G.stylePath = ['cn']; G.seg = 0; G.applySegmentPalette();
      G.newFloor(1); G.state = 'play';
      G.player.x = 240; G.player.y = 160;
      G.enemies.length = 0; G.bullets.length = 0;
      G.room.obstacles.length = 0;
      setup();
      G.draw();
      cells.push({ tag: tag });
      return;
    };
    /* ① 正常血量（4 颗心） */
    shot('① 常态：4 颗心 + 3 盾', () => { G.player.maxHP = 8; G.player.hp = 7; G.player.shield = 3; });
    /* ② 超长血量（20 颗心 + 5 盾）—— 修之前画满 25 个图标会顶到右上角 */
    shot('② 修前会顶到右上角：20 颗心 + 5 盾', () => {
      G.player.maxHP = 40; G.player.hp = 33; G.player.shield = 5;
    });
    /* ③ 被巨物贴身 */
    shot('③ 贴身泛红读数（Boss 挤压中）', () => {
      G.player.maxHP = 8; G.player.hp = 5; G.player.shield = 0;
      G.contactHurtT = 16;
    });

    /* 血条那一行单独放大 3 倍看清；红边用整屏半尺寸展示 */
    const HW = 260, HH = 22, Z = 3;        // 截 HUD 左半 + 放大
    const cells2 = cells.slice(0, 2);
    const c = document.createElement('canvas');
    const rowH = HH * Z + 22;
    c.width = HW * Z;
    c.height = rowH * cells2.length + 320;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0a0812'; g.fillRect(0, 0, c.width, c.height);
    cells2.forEach((cell, i) => {
      const y = i * rowH;
      g.font = '12px sans-serif'; g.fillStyle = '#8fd8c4';
      g.fillText(cell.tag, 6, y + 14);
      g.drawImage(src, 0, 6, HW, HH, 0, y + 18, HW * Z, HH * Z);
    });
    /* 红边：重新布一次景，截整屏 */
    G.newRun('feijian');
    G.stylePath = ['cn']; G.seg = 0; G.applySegmentPalette();
    G.newFloor(1); G.state = 'play';
    G.player.x = 240; G.player.y = 160; G.player.shield = 0;
    G.enemies.length = 0; G.bullets.length = 0; G.room.obstacles.length = 0;
    G.contactHurtT = 16;
    G.draw();
    const bx = c.height - 320;
    g.fillStyle = '#8fd8c4'; g.font = '12px sans-serif';
    g.fillText('③ 贴身泛红读数（四边渐晕，不是整屏糊红 —— 视野仍然清楚）', 6, bx - 4);
    g.drawImage(src, 0, 0, 480, 320, 0, bx, 480, 320);
    return c.toDataURL('image/png');
  });
  fs.writeFileSync(path.join(OUT, '_preview_hud_fix.png'),
    Buffer.from(dataURL.split(',')[1], 'base64'));
  console.log('saved _preview_hud_fix.png');
  await b.close();
})();
