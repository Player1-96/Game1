'use strict';
/* 融合「件数 → 阶位」验收图：同一对材料，1+1 / 1+2 / 2+2 各出一张面板。
   要一眼看出三件事：消耗的件数写明了、产物阶位跟着涨、枢纽件警告在。
   2026-09-29 用户拍板的新规则（产物继承材料各自的件数）。 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 900, height: 760 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(FILE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const cases = [
    { a: 1, b: 1, tag: '① 青锋剑 ×1　＋　引雷符 ×1　→　Lv1' },
    { a: 1, b: 2, tag: '② 青锋剑 ×1　＋　引雷符 ×2　→　Lv2' },
    { a: 2, b: 2, tag: '③ 青锋剑 ×2　＋　引雷符 ×2　→　Lv2（数值比 ② 更高）' }
  ];
  const shots = [];
  for (const c of cases) {
    /* 把面板摆好：给材料 → 直接构出 fusion 状态 → 让 updateOverlay 渲染 */
    await p.evaluate((c) => {
      const G = window.Game;
      FusionCodex.unlock('leiji');            // 验收图看已解锁的样子（首融仍是 ？？？）
      G.newRun('feijian');
      G.newFloor(1);
      const pl = G.player;
      pl.items.length = 0; pl.recomputeStats('feijian');
      for (let k = 0; k < c.a; k++) pl.give('qingfeng', G);
      for (let k = 0; k < c.b; k++) pl.give('leifu', G);
      G.itemPopup = null;
      G.fusion = { forge: null, pool: G.fusionPool(), idx: 0, slots: ['qingfeng', 'leifu'], msg: '' };
      G.state = 'fusion';
      updateOverlay();
    }, c);
    await p.waitForTimeout(120);
    const el = await p.$('#fusion');
    const buf = await el.screenshot();
    shots.push({ tag: c.tag, b64: buf.toString('base64') });
  }

  /* 拼成竖排长图：标签条 + 面板 */
  const dataURL = await p.evaluate((shots) => {
    return new Promise(resolve => {
      const c = document.createElement('canvas');
      const W = 760, GAP = 30, PAD = 14;
      const imgs = [];
      let done = 0;
      shots.forEach((s, i) => {
        const im = new Image();
        im.onload = () => {
          imgs[i] = im;
          if (++done === shots.length) {
            let y = 0;
            const H = shots.reduce((acc, _, k) => acc + GAP + 26 + imgs[k].height * (W / imgs[k].width), 0) + GAP;
            c.width = W; c.height = H;
            const g = c.getContext('2d');
            g.fillStyle = '#0e0a1a'; g.fillRect(0, 0, c.width, c.height);
            shots.forEach((s, k) => {
              y += GAP;
              g.font = '15px sans-serif'; g.fillStyle = '#f2c761';
              g.fillText(s.tag, PAD, y + 14);
              y += 26;
              const ih = imgs[k].height * (W / imgs[k].width);
              g.drawImage(imgs[k], 0, y, W, ih);
              y += ih;
            });
            resolve(c.toDataURL('image/png'));
          }
        };
        im.src = 'data:image/png;base64,' + s.b64;
      });
    });
  }, shots);
  fs.writeFileSync(path.join(OUT, '_preview_fusion_lv.png'), Buffer.from(dataURL.split(',')[1], 'base64'));
  console.log('saved _preview_fusion_lv.png');
  await b.close();
})();
