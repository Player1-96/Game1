'use strict';
/* 符文护壁视觉验收：三格 ——
   ① 释放瞬间（击退 + 护盾 + 立壁）　② 壁内敌弹被抹掉（剩 2 秒）　③ 壁散去 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1000, height: 380 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(FILE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const shots = [
    { f: 2,   tag: '① 释放瞬间：震退 + 结盾 + 立壁' },
    { f: 90,  tag: '② 壁内敌弹被抹掉（剩余 3.5 秒）' },
    { f: 320, tag: '③ 壁已散去' }
  ];
  const dataURL = await p.evaluate((shots) => {
    const G = window.Game;
    const src = document.getElementById('game');
    const CW = 330, CH = 250, SX = 90, SY = 20;
    const c = document.createElement('canvas');
    c.width = CW * shots.length; c.height = CH + 30;
    const g = c.getContext('2d');
    g.fillStyle = '#0a0812'; g.fillRect(0, 0, c.width, c.height);
    g.font = '12px sans-serif';
    shots.forEach((s, i) => {
      G.newRun('feijian');
      G.stylePath = ['nordic', 'nordic', 'nordic']; G.seg = 0; G.applySegmentPalette();
      G.newRun('feijian'); G.state = 'play';
      const pl = G.player;
      pl.addSkill('runeward'); pl.selectSlot(0);
      pl.mp = pl.maxMP; pl.skillGcd = 0; pl.skillCd[0] = 0;
      G.enemies.length = 0; G.bullets.length = 0;
      G.room.obstacles.length = 0;
      pl.x = 240; pl.y = 160;
      G.useSkill();
      /* 壁内塞几颗敌弹，看它们被抹掉的过程（远离玩家，避免撞到玩家而死） */
      const spots = [[300, 100], [180, 220], [300, 220], [180, 100]];
      spots.forEach(q => G.bullets.push(
        new Bullet(q[0], q[1], 0.6, 0.4, { friendly: false, dmg: 1, r: 5, life: 400 })));
      for (let k = 0; k < s.f; k++) G.update();
      G.draw();
      const dx = i * CW;
      g.drawImage(src, SX, SY, CW, CH, dx, 20, CW, CH);
      g.fillStyle = '#8fd8c4'; g.fillText(s.tag, dx + 6, 14);
      const wall = G.runeWall;
      const alive = G.bullets.filter(x => !x.friendly && !x.dead).length;
      g.fillStyle = '#9a94b8';
      g.fillText('壁 ' + (wall ? '在（' + (wall.t / 60).toFixed(1) + 's）' : '已散')
        + '　壁内敌弹剩 ' + alive, dx + 6, CH + 22);
    });
    return c.toDataURL('image/png');
  }, shots);
  fs.writeFileSync(path.join(OUT, '_preview_runewall.png'),
    Buffer.from(dataURL.split(',')[1], 'base64'));
  console.log('saved _preview_runewall.png');
  await b.close();
})();
