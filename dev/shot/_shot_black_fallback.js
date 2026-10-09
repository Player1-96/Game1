'use strict';
/* 出图：黑屏兜底的效果 —— 渲染失败时玩家看到的不再是一片黑，
   而是画布上的错误文字 + 底部红色报错条 + 一键复制按钮。 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1019, height: 752 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(FILE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  /* 制造「渲染持续失败」——用真实的 frame 调用，走玩家那条路径 */
  const info = await p.evaluate(() => {
    const G = window.Game;
    G.newRun('wujian');
    G.stylePath = ['cn', 'nordic', 'nordic'];
    G.seg = 1; G.applySegmentPalette();
    G.newFloor(10);
    G.state = 'play';
    G.floor.renderBG = function () { return undefined; };   // 让背景永远重建不出来
    G.room.bg = null;
    G.drawErrN = 0;
    const t0 = window.performance.now();
    for (let i = 0; i < 30; i++) G.frame(t0 + i * 17);
    const banner = document.getElementById('crashBanner');
    /* 实测：画布上到底有没有画出错误条？（别只看截图猜） */
    const d = document.getElementById('game').getContext('2d').getImageData(0, 128, 480, 64).data;
    let nonBlack = 0, brightest = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 40 || d[i + 1] > 30 || d[i + 2] > 40) {
        nonBlack++;
        if (d[i] > brightest[0]) brightest = [d[i], d[i + 1], d[i + 2]];
      }
    }
    return { bannerShown: !!banner, text: banner ? banner.textContent.split('\n')[0] : '',
             drawErrN: G.drawErrN, bandNonBlack: nonBlack, brightest: brightest };
  });
  await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(OUT, '_preview_black_fallback.png') });
  console.log('saved _preview_black_fallback.png');
  console.log('  报错条出现: ' + info.bannerShown);
  console.log('  文案: ' + info.text);
  console.log('  drawErrN = ' + info.drawErrN + '　错误条区域非黑像素 = ' + info.bandNonBlack
    + '　最亮 ' + JSON.stringify(info.brightest));
  await b.close();
})();
