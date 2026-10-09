'use strict';
/* 诊断：顶栏左上那一排（心 / 护盾）区域，到底还画了别的东西吗？
   做法：monkey-patch ctx.drawImage，记录每一次落点，
   然后挑出落在 x∈[90,190]、y∈[0,26] 里的调用（护盾那一段）。
   用户 2026-10-09：「护甲的展示还是遮挡到流派的图标了」。 */
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
    /* 复现用户截图里的状态：7 心 + 余数 4 → 11 颗心；护盾 6 格 */
    G.newRun('feijian');
    G.newFloor(8);
    G.state = 'play';
    const pl = G.player;
    pl.maxHP = 22; pl.hp = 22; pl.shield = 6; pl.tShield = 0;
    pl.mp = 100; pl.maxMP = 100;

    const cv = document.getElementById('game');
    const ctx = cv.getContext('2d');
    const log = [];
    /* 给每个精灵起个名字，方便认领 */
    const names = new Map();
    for (const k of Object.keys(SPR)) {
      const v = SPR[k];
      if (Array.isArray(v)) v.forEach((s, i) => { if (s && s.getContext) names.set(s, k + '[' + i + ']'); });
      else if (v && v.getContext) names.set(v, k);
    }
    const orig = ctx.drawImage.bind(ctx);
    ctx.drawImage = function (img) {
      const a = Array.prototype.slice.call(arguments, 1);
      const x = a.length >= 4 ? a[0] : a[0], y = a.length >= 4 ? a[1] : a[1];
      log.push({
        name: names.get(img) || (img && img.tagName ? 'CANVAS' : '?'),
        x: Math.round(x), y: Math.round(y),
        w: Math.round(a.length >= 4 ? a[2] : (img.width || 0)),
        h: Math.round(a.length >= 4 ? a[3] : (img.height || 0)),
        args: a.length
      });
      return orig.apply(ctx, arguments);
    };
    G.draw();
    ctx.drawImage = orig;

    /* 顶栏整条：x < 340, y < 40 */
    const topLeft = log.filter(e => e.x < 340 && e.y < 40);   // 放宽：楼层名在页面居中，换算回 canvas 约 x=250
    /* 把「绘制顺序 + 名字」按 x 排序打印，重叠的一眼能看出来 */
    topLeft.sort((a, b2) => (a.x - b2.x) || (a.y - b2.y));

    /* 顺便看看 HUD 里的文字 */
    const texts = [];
    const origText = drawPixelText;
    window.drawPixelText = function (g, t, x, y, sc, c) { texts.push({ t: String(t), x: Math.round(x), y: Math.round(y) }); return origText(g, t, x, y, sc, c); };
    G.drawHUD(ctx);
    window.drawPixelText = origText;

    /* 顶栏还有哪些 DOM 元素 */
    const doms = [];
    for (const id of ['floorName', 'stats', 'hint', 'title']) {
      const el = document.getElementById(id);
      if (!el) continue;
      const r2 = el.getBoundingClientRect();
      doms.push({ id: id, x: Math.round(r2.left), y: Math.round(r2.top), w: Math.round(r2.width), h: Math.round(r2.height) });
    }
    return { topLeft: topLeft, textTop: texts.filter(t => t.y < 40), allTexts: texts.slice(), doms: doms,
             canvasW: cv.width, canvasH: cv.height };
  });

  console.log('canvas', r.canvasW + 'x' + r.canvasH);
  console.log('\n--- 顶栏 (x<340, y<40) 的 drawImage 调用（按 x 排序）---');
  r.topLeft.forEach(e => console.log('  x=' + String(e.x).padStart(4) + ' y=' + String(e.y).padStart(3)
    + '  ' + (e.w + 'x' + e.h).padStart(8) + '  ' + e.name + (e.args === 5 ? '  (5参=缩放)' : '')));
  console.log('\n--- 同一区域的像素文字 ---');
  r.textTop.forEach(t => console.log('  x=' + String(t.x).padStart(4) + ' y=' + String(t.y).padStart(3) + '  ' + JSON.stringify(t.t)));
  console.log('\n--- canvas 上画出的全部文字（找「第八层 · 冰原」这类）---');
  (r.allTexts || []).forEach(t => console.log('  x=' + String(t.x).padStart(4) + ' y=' + String(t.y).padStart(3) + '  ' + JSON.stringify(t.t)));
  console.log('\n--- 相关 DOM 元素 ---');
  r.doms.forEach(d => console.log('  #' + d.id + '  x=' + d.x + ' y=' + d.y + '  ' + d.w + 'x' + d.h));
  await b.close();
})();
