'use strict';
/* 量：专属技格子里「流派图标」与「L5 / 段位数字」的真实重叠量。
   ⚠️ 不用公式推算 —— 用 ctx.getTransform() 把 drawImage 的参数换算成**绝对坐标**，
      这样改了源码里的 translate/scale 之后，这里量到的就是真实值。 */
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

  const out = await p.evaluate(() => {
    const G = window.Game;
    const res = {};
    for (const st of ['feijian', 'jujian', 'wujian']) {
      G.newRun(st);
      G.newFloor(1);
      G.state = 'play';
      const pl = G.player;
      pl.ult = { style: st, lv: 5 };
      pl.ultCd = 0;
      if (st === 'wujian') { pl.wjStage = 0; pl.wjChainT = 0; }

      const cv = document.getElementById('game');
      const ctx = cv.getContext('2d');
      const ic = styleIcon(st);
      const hit = { icon: null, textY: [] };
      const orig = ctx.drawImage.bind(ctx);
      ctx.drawImage = function (img) {
        if (img === ic) {
          const a = Array.prototype.slice.call(arguments, 1);
          const m = ctx.getTransform();       // 当前变换矩阵
          const ax = m.a * a[0] + m.c * a[1] + m.e;
          const ay = m.b * a[0] + m.d * a[1] + m.f;
          hit.icon = {
            x: +ax.toFixed(1), y: +ay.toFixed(1),
            w: +(m.a * ic.width).toFixed(1), h: +(m.d * ic.height).toFixed(1)
          };
        }
        return orig.apply(ctx, arguments);
      };
      /* 记录「L5」和段位数字的落点 */
      const origText = window.drawPixelText;
      window.drawPixelText = function (g, t, x, y, sc, c) {
        const s = String(t);
        /* 等级文字是 'L'+lv（等级随流派不同），段位数字只有舞剑流有 */
        /* ⚠️ 必须限定在格子区域内（x>=452）—— 顶栏的消耗品数字是单个数字，
           不加这个条件会被当成「段位数字」误报（第一版就是这么假报的）。 */
        if (x >= 452 && (/^L\d$/.test(s) || /^\d$/.test(s))) hit.textY.push({ t: s, x: x, y: y });
        return origText(g, t, x, y, sc, c);
      };
      G.draw();
      ctx.drawImage = orig;
      window.drawPixelText = origText;

      const texTop = hit.textY.length ? Math.min.apply(null, hit.textY.map(t => t.y)) : null;
      const texBot = texTop === null ? null : texTop + 7;      // FONT5 行高 7
      const ov = (hit.icon && texTop !== null)
        ? +(Math.min(hit.icon.y + hit.icon.h, texBot) - Math.max(hit.icon.y, texTop)).toFixed(2) : null;
      res[st] = { ic: ic.width + 'x' + ic.height, icon: hit.icon, texts: hit.textY,
                  texTop: texTop, texBot: texBot, overlap: ov };
    }
    return res;
  });

  console.log('（绝对 canvas 坐标；格子 ux=452, uy=4, 24x24）\n');
  let bad = 0;
  for (const [st, v] of Object.entries(out)) {
    console.log(st.padEnd(9) + ' 图标 ' + v.ic.padEnd(7)
      + ' 实测 y ' + v.icon.y + '~' + (v.icon.y + v.icon.h).toFixed(1)
      + (v.texTop !== null ? '　文字 y ' + v.texTop + '~' + v.texBot : ''));
    if (v.overlap !== null) {
      if (v.overlap > 0) { bad++; console.log('           ❌ 仍重叠 ' + v.overlap + 'px'); }
      else console.log('           ✅ 不重叠（间距 ' + (-v.overlap).toFixed(1) + 'px）');
    }
  }
  console.log(bad ? '\n' + bad + ' 个流派仍有重叠' : '\n三个流派全部不再重叠 ✓');
  await b.close();
})();
