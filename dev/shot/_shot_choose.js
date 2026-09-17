'use strict';
/* 出图 + 测量：流派选择界面的实际布局。
   用途：定位「舞剑流展示不全」到底是溢出、裁切还是挤压。 */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  for (const vp of [{ w: 1440, h: 900, tag: '1440' }, { w: 1280, h: 720, tag: '1280' }]) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    await page.goto(FILE);
    await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
    await page.evaluate(() => { window.Game.state = 'choose'; window.Game.styleIdx = 2; updateOverlay(); });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `_preview_choose_${vp.tag}.png`) });

    const geo = await page.evaluate(() => {
      const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { t: Math.round(r.top), b: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width) }; };
      const cards = [];
      for (let i = 0; i < 3; i++) {
        const el = document.getElementById('pickCard' + i);
        if (!el) continue;
        const d = el.querySelector('.dsc');
        cards.push({
          i, box: box(el), dsc: box(d),
          dscScrollH: d ? d.scrollHeight : null,
          clipped: d ? (d.scrollHeight > d.clientHeight + 1) : null
        });
      }
      const ch = document.getElementById('choose');
      return {
        viewport: { w: innerWidth, h: innerHeight },
        choose: box(ch),
        chooseScrollH: ch ? ch.scrollHeight : null,
        row: box(document.querySelector('.pickRow')),
        cards
      };
    });
    console.log('=== viewport ' + vp.tag + ' ===');
    console.log(JSON.stringify(geo, null, 1));
    console.log();
    await Promise.race([page.close(), new Promise(r => setTimeout(r, 2000))]);
  }
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
