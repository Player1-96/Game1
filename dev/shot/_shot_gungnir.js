'use strict';
/* 冈格尼尔「贯穿即钉住」视觉验收：三格对比 ——
   ① 一发贯穿 3 个的瞬间　② 钉住中（插着金枪、脚下钉光）　③ 解除后恢复移动 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 980, height: 360 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(FILE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const shots = [
    { f: 10, tag: '钉住中（放大 4 倍）· 插着金枪 + 脚下钉光' },
    { f: 40, tag: '解除后（同一位置、放大 4 倍）· 枪消失、恢复移动' }
  ];
  const dataURL = await p.evaluate((shots) => {
    const G = window.Game;
    const src = document.getElementById('game');
    const CW = 440, CH = 300, SX = 150, SY = 60, ZOOM = 2;
    const c = document.createElement('canvas');
    c.width = CW * shots.length; c.height = CH + 26;
    const g = c.getContext('2d');
    g.fillStyle = '#0a0812'; g.fillRect(0, 0, c.width, c.height);
    g.font = '12px sans-serif';
    shots.forEach((s, i) => {
      G.newRun('feijian');
      G.stylePath = ['cn']; G.seg = 0; G.applySegmentPalette();
      const pl = G.player;
      pl.give('gungnir', G);
      G.newFloor(1); G.state = 'play';
      G.enemies.length = 0; G.bullets.length = 0;
      /* ⚠️ 清石柱；玩家要站在可行区（WALL_T=34 / WALL_B=254）之内 */
      G.room.obstacles.length = 0;
      pl.x = 240; pl.y = 240;
      const foes = [0, 1, 2].map(k => {
        const e = new Enemy('xiesui', pl.x, pl.y - 40 - k * 26, 1);
        e.spawnT = 0; e.speed = 1.05; e.maxHp = 99999; e.hp = 99999; e.touch = 0; e.cd = 999999;
        G.enemies.push(e); return e;
      });
      pl.shootCd = 0;
      STYLES.feijian.attack(pl, G, { shooting: true, aiming: true, aimAngle: -Math.PI / 2 });
      for (let k = 0; k < s.f; k++) G.update();
      G.draw();
      const dx = i * CW;
      g.drawImage(src, SX, SY, CW / ZOOM, CH / ZOOM, dx, 20, CW, CH);
      g.fillStyle = '#8fd8c4'; g.fillText(s.tag, dx + 6, 14);
      g.fillStyle = '#9a94b8';
      g.fillText('pin 余 ' + foes.map(e => e.pin).join('/') + ' 帧', dx + 6, CH + 20);
    });
    return c.toDataURL('image/png');
  }, shots);
  fs.writeFileSync(path.join(OUT, '_preview_gungnir_pin.png'),
    Buffer.from(dataURL.split(',')[1], 'base64'));
  console.log('saved _preview_gungnir_pin.png');
  await b.close();
})();
