'use strict';
/* 顶栏「分区重叠」体检：把所有画在顶栏（canvas y<60）上的东西和 DOM 元素的位置都量出来，
   两两检测重叠。用户 2026-10-08/09 连报两次「遮挡」，与其一个个猜，不如做成一条可复跑的检查。

   复现用户截图的状态：舞剑流 · 专属技 Lv5 · 段位 1 · 第 8 层 · 北欧二段。 */
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1019, height: 752 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(FILE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const r = await p.evaluate(() => {
    const G = window.Game;
    G.newRun('wujian');
    G.stylePath = ['cn', 'cn', 'nordic'];
    G.seg = 2;
    G.applySegmentPalette();
    G.newFloor(8);
    G.state = 'play';
    const pl = G.player;
    pl.maxHP = 22; pl.hp = 22; pl.shield = 6; pl.tShield = 0; pl.mp = 100; pl.maxMP = 100;
    /* 专属技 Lv5（用户截图右上角写着 L51 → L5 + 段位 1） */
    pl.ult = { style: 'wujian', lv: 5 };
    pl.ultCd = 0; pl.wjStage = 0; pl.wjChainT = 0;
    G.itemPopup = null;
    updateOverlay();

    const cv = document.getElementById('game');
    const ctx = cv.getContext('2d');
    const log = [];
    const names = new Map();
    for (const k of Object.keys(SPR)) {
      const v = SPR[k];
      if (Array.isArray(v)) v.forEach((s, i) => { if (s && s.getContext) names.set(s, k + '[' + i + ']'); });
      else if (v && v.getContext) names.set(v, k);
    }
    const origImg = ctx.drawImage.bind(ctx);
    ctx.drawImage = function (img) {
      const a = Array.prototype.slice.call(arguments, 1);
      const isScaled = a.length >= 4;
      let nm = names.get(img);
      if (!nm) {
        /* 不在 SPR 里的：多半是离屏 canvas。导出前几个看看到底是什么。 */
        nm = '?canvas(' + (img.width || 0) + 'x' + (img.height || 0) + ')';
        if (window.__dumps === undefined) window.__dumps = [];
        if (window.__dumps.length < 6 && img.toDataURL) {
          try { window.__dumps.push({ at: a.length >= 4 ? a[0] + ',' + a[1] : String(a[0]),
                                      url: img.toDataURL('image/png') }); } catch (e) {}
        }
      }
      log.push({
        name: nm,
        x: Math.round(isScaled ? a[0] : a[0]), y: Math.round(isScaled ? a[1] : a[1]),
        w: Math.round(isScaled ? a[2] : (img.width || 0)),
        h: Math.round(isScaled ? a[3] : (img.height || 0)),
        scaled: isScaled
      });
      return origImg.apply(ctx, arguments);
    };
    G.draw();
    ctx.drawImage = origImg;

    /* 画在顶栏（y < 60）的东西 */
    const top = log.filter(e => e.y < 60 && e.w < 470 && e.h < 60);

    /* DOM：楼层名换算到 canvas 坐标 */
    const scale = cv.getBoundingClientRect().width / 480;
    const cwRect = cv.getBoundingClientRect();
    const fn = document.getElementById('floorName');
    const fr = fn.getBoundingClientRect();
    const domFloor = {
      name: 'ASCII:#floorName',
      x: Math.round((fr.left - cwRect.left) / scale),
      y: Math.round((fr.top - cwRect.top) / scale),
      w: Math.round(fr.width / scale), h: Math.round(fr.height / scale),
      text: fn.textContent
    };

    return { top: top, domFloor: domFloor, scale: +scale.toFixed(2), dumps: window.__dumps || [] };
  });

  /* 归纳成「区」，再两两检测 */
  const zones = [];
  const push = (name, items) => {
    if (!items.length) return;
    const x0 = Math.min.apply(null, items.map(i => i.x));
    const y0 = Math.min.apply(null, items.map(i => i.y));
    const x1 = Math.max.apply(null, items.map(i => i.x + i.w));
    const y1 = Math.max.apply(null, items.map(i => i.y + i.h));
    zones.push({ name: name, x0: x0, y0: y0, x1: x1, y1: y1, n: items.length });
  };
  const t = r.top;
  push('心/护甲/灵力条(左)', t.filter(e => e.x < 180));
  push('消耗品计数', t.filter(e => e.x >= 180 && e.x < 440));
  push('专属技格子(右上)', t.filter(e => e.x >= 440));
  zones.push({ name: '楼层名(DOM)', x0: r.domFloor.x, y0: r.domFloor.y, x1: r.domFloor.x + r.domFloor.w, y1: r.domFloor.y + r.domFloor.h, n: 1 });

  console.log('缩放 ' + r.scale + ' 倍（canvas 坐标，480x320）');
  console.log('楼层名文本: ' + JSON.stringify(r.domFloor.text));
  console.log('\n--- 顶栏各分区（canvas 坐标）---');
  zones.forEach(z => console.log('  ' + z.name.padEnd(20) + ' x ' + String(z.x0).padStart(4) + '~' + String(z.x1).padStart(4)
    + '  y ' + String(z.y0).padStart(3) + '~' + String(z.y1).padStart(3) + '  (' + z.n + ' 项)'));

  console.log('\n--- 两两重叠检测 ---');
  let bad = 0;
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const a = zones[i], c = zones[j];
      const ox = Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0);
      const oy = Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0);
      if (ox > 0 && oy > 0) {
        bad++;
        console.log('  ❌ ' + a.name + '  ×  ' + c.name + '   重叠 ' + ox + '×' + oy + ' px');
      }
    }
  }
  if (!bad) {
    console.log('  （无重叠）');
    /* 顺便把最紧的一对间距报出来 */
    let tight = null;
    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        const a = zones[i], c = zones[j];
        const gap = Math.max(a.x0, c.x0) - Math.min(a.x1, c.x1);
        if (gap > 0 && (!tight || gap < tight.gap)) tight = { a: a.name, c: c.name, gap: gap };
      }
    }
    if (tight) console.log('  最紧的一对：' + tight.a + ' ↔ ' + tight.c + '  间距 ' + tight.gap + ' px');
  }

  console.log('\n--- 顶栏 y<60 的每一项 drawImage（明细）---');
  t.forEach(e => console.log('  ' + e.name.padEnd(16)
    + ' x ' + String(e.x).padStart(4) + '~' + String(e.x + e.w).padStart(4)
    + '  y ' + String(e.y).padStart(3) + '~' + String(e.y + e.h).padStart(3)
    + (e.scaled ? '  (缩放)' : '')));

  console.log('\n--- 专属技格子里的元素（它们之间最容易叠）---');
  t.filter(e => e.x >= 440).forEach(e => console.log('  ' + e.name.padEnd(14)
    + ' x ' + String(e.x).padStart(4) + '~' + String(e.x + e.w).padStart(4)
    + '  y ' + String(e.y).padStart(3) + '~' + String(e.y + e.h).padStart(3)
    + (e.scaled ? '  (缩放绘制)' : '')));
  const fs2 = require('fs');
  (r.dumps || []).forEach((d, i) => {
    const p2 = path.resolve(__dirname, '..', 'preview', '_dbg_unknown' + i + '.png');
    fs2.writeFileSync(p2, Buffer.from(d.url.split(',')[1], 'base64'));
    console.log('  unknown#' + i + ' 画在 (' + d.at + ') → _dbg_unknown' + i + '.png');
  });
  await p.screenshot({ path: path.resolve(__dirname, '..', 'preview', '_dbg_hud_zones.png') });
  console.log('\nsaved _dbg_hud_zones.png');
  await b.close();
})();
