'use strict';
/* 追根：用户第 10 层黑屏。已知「bg 失效 → draw 抛异常 → 每帧黑」成立，
   这里查 **bg 为什么会失效**：renderBG 依赖 SPR.floor / SPR.wall 等精灵，
   如果某个风格段烘焙出来的 SPR 是空的（或部分为空），renderBG 就会抛异常。
   顺带验证刚加的两道兜底（bg 自愈 / 错误可见化）真的生效。 */
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(FILE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const r = await p.evaluate(() => {
    const G = window.Game;
    const out = { combos: [] };
    const need = ['floor', 'wall', 'floorRune', 'stone', 'door', 'wallHi'];
    const dump = () => {
      const o = {};
      for (const k of need) {
        const v = SPR[k];
        o[k] = Array.isArray(v) ? v.length : (v ? 1 : 0);
      }
      return o;
    };

    /* 遍历「三段 × 各风格组合」，每一步都试渲染一次背景 */
    for (const path3 of [['cn', 'cn', 'cn'], ['nordic', 'nordic', 'nordic'], ['cn', 'nordic', 'nordic'],
                         ['cn', 'cn', 'nordic'], ['nordic', 'cn', 'cn']]) {
      for (let seg = 0; seg < 3; seg++) {
        const row = { path: path3.join('>'), seg: seg };
        try {
          G.newRun('wujian');
          G.stylePath = path3.slice();
          G.seg = seg;
          G.applySegmentPalette();
          G.newFloor(seg * 5 + 1);
          G.state = 'play';
          row.sprites = dump();
          row.spritesOk = need.every(k => (Array.isArray(SPR[k]) ? SPR[k].length > 0 : !!SPR[k]));
          /* 直接试渲染一张背景 */
          const room = G.room;
          const keep = room.bg;
          room.bg = null;
          try { const bg = G.floor.renderBG(room); row.renderOk = !!bg; }
          catch (e) { row.renderErr = e.message; }
          room.bg = keep;
          /* 正常 draw 一次 */
          try { G.draw(); row.drawOk = true; } catch (e) { row.drawErr = e.message; }
        } catch (e) { row.setupErr = e.message; }
        out.combos.push(row);
      }
    }

    /* ---- 验证兜底 ①：bg 被清空后 draw 能不能自愈 ---- */
    G.newRun('wujian');
    G.stylePath = ['cn', 'nordic', 'nordic']; G.seg = 1; G.applySegmentPalette();
    G.newFloor(10); G.state = 'play';
    const beforeBg = !!G.room.bg;
    G.room.bg = null;
    let healErr = null;
    try { G.draw(); } catch (e) { healErr = e.message; }
    out.heal = { hadBg: beforeBg, afterDrawBg: !!G.room.bg, err: healErr };

    /* ---- 验证兜底 ③：catch 里画的错误条到底有没有落在画布上 ---- */
    G.floor.renderBG = function () { return undefined; };
    G.room.bg = null;
    try { G.draw(); } catch (e) {
      const g3 = G.g;
      g3.setTransform(1, 0, 0, 1, 0, 0); g3.globalAlpha = 1;
      g3.fillStyle = '#ff0000'; g3.fillRect(0, 130, 480, 60);
      const dd = G.g.getImageData(0, 130, 480, 60).data;
      let n = 0; for (let i = 0; i < dd.length; i += 4) if (dd[i] > 200) n++;
      out.paint = { redPixels: n };
    }
    G.floor.renderBG = keepRender;

    /* ---- 验证兜底 ②：draw 真的修不好时，连续失败会不会弹提示 ---- */
    const keepRender = G.floor.renderBG;
    G.floor.renderBG = function () { return undefined; };   // 让它永远重建失败
    G.room.bg = null;
    let n = 0;
    for (let i = 0; i < 25; i++) {
      try { G.draw(); G.drawErrN = 0; } catch (e) {
        G.drawErrN = (G.drawErrN || 0) + 1;
        if (G.drawErrN === 20 && typeof showCrashBanner === 'function') showCrashBanner(e);
        n++;
      }
    }
    out.banner = { failures: n, shown: !!document.getElementById('crashBanner'),
                   text: (document.getElementById('crashBanner') || {}).textContent || '' };
    G.floor.renderBG = keepRender;
    if (typeof hideCrashBanner === 'function') hideCrashBanner();
    return out;
  });

  console.log('--- 各「风格 × 段」下 SPR 精灵与背景渲染 ---');
  r.combos.forEach(c => {
    const bad = !c.spritesOk || c.renderErr || c.drawErr || c.setupErr;
    console.log('  ' + (bad ? '❌' : '✅') + ' ' + c.path.padEnd(22) + ' seg' + c.seg
      + '  精灵 ' + JSON.stringify(c.sprites || {})
      + (c.renderErr ? '  背景渲染失败: ' + c.renderErr : '')
      + (c.drawErr ? '  draw 失败: ' + c.drawErr : '')
      + (c.setupErr ? '  setup 失败: ' + c.setupErr : ''));
  });
  console.log('\n--- 兜底 ①：bg 被清空后能否自愈 ---');
  console.log('  画之前有 bg: ' + r.heal.hadBg + '　画之后有 bg: ' + r.heal.afterDrawBg
    + (r.heal.err ? '　❌ 仍抛异常: ' + r.heal.err : '　✅ 没抛异常'));
  console.log('\n--- 兜底 ②：修不好时提示条 ---');
  console.log('  连续失败 ' + r.banner.failures + ' 次，提示条出现: ' + r.banner.shown);
  if (r.paint) console.log('  兜底 ③：catch 里画的红条，画布上读到 ' + r.paint.redPixels + ' 个红像素');
  if (r.banner.text) console.log('  内容: ' + r.banner.text.replace(/\n/g, ' / '));
  if (errs.length) console.log('\n页面错误: ' + errs.slice(0, 4).join(' | '));
  await b.close();
})();
