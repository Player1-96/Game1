'use strict';
/* 最小验证：draw() 抛异常后，在 catch 里往同一个 context 画东西，能不能落在画布上？ */
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(FILE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const r = await p.evaluate(() => {
    const G = window.Game;
    G.newRun('wujian');
    G.newFloor(10);
    G.state = 'play';
    const out = {};

    /* 先确认正常 draw 之后的像素（基线） */
    out.sameCtx = G.g === document.getElementById('game').getContext('2d');

    /* 破坏 bg */
    const keep = G.floor.renderBG;
    G.floor.renderBG = function () { return undefined; };
    G.room.bg = null;

    let thrown = null, paintedAfterThrow = null;
    try { G.draw(); } catch (e) { thrown = e.message; }

    if (thrown) {
      const g2 = G.g;
      out.transformAtCatch = (() => { const m = g2.getTransform(); return { a: m.a, e: m.e, f: m.f }; })();
      g2.setTransform(1, 0, 0, 1, 0, 0);
      g2.globalAlpha = 1;
      g2.fillStyle = '#ff0000';
      g2.fillRect(0, 130, 480, 60);
      const d = g2.getImageData(0, 130, 480, 60).data;
      let red = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 60) red++;
      paintedAfterThrow = red;
    }
    G.floor.renderBG = keep;
    G.room.bg = null;

    return { sameCtx: out.sameCtx, thrown: thrown, transformAtCatch: out.transformAtCatch,
             redPixels: paintedAfterThrow };
  });

  console.log('同一个 context? ' + r.sameCtx);
  console.log('draw 抛出的异常: ' + (r.thrown || '(没抛！)'));
  if (r.transformAtCatch) console.log('异常时的变换矩阵: ' + JSON.stringify(r.transformAtCatch));
  console.log('catch 里画红条后读到的红像素: ' + r.redPixels);
  await b.close();
})();
