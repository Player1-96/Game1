'use strict';
/* 版面自检：默认折叠说明后，画布在多种视口下都必须完整可见 */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname);
const VIEWPORTS = [
  { w: 1920, h: 1080, tag: '1920x1080' },
  { w: 1600, h: 900, tag: '1600x900' },
  { w: 1440, h: 780, tag: '1440x780' },
  { w: 1366, h: 700, tag: '1366x700' },
  { w: 1280, h: 620, tag: '1280x620' }
];

let pass = 0, fail = 0;
const failed = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '   ' + extra : '')); }
  else { fail++; failed.push(name); console.log('  FAIL  ' + name + (extra ? '   ' + extra : '')); }
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const results = [];
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(FILE);
    await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
    await page.waitForTimeout(300);

    const collapsed = await page.evaluate(() => {
      const c = document.getElementById('game').getBoundingClientRect();
      const h = document.getElementById('help');
      return {
        top: c.top, bottom: c.bottom, left: c.left, right: c.right, w: c.width, h: c.height,
        vh: innerHeight, vw: innerWidth,
        helpTop: h.getBoundingClientRect().top,
        open: h.open,
        docH: document.documentElement.scrollHeight
      };
    });
    const fullyVisible = collapsed.top >= -1 && collapsed.bottom <= collapsed.vh + 1
      && collapsed.left >= -1 && collapsed.right <= collapsed.vw + 1;
    ok(`${vp.tag} 折叠态画布完整可见`, fullyVisible,
      `画布 ${Math.round(collapsed.w)}x${Math.round(collapsed.h)}，视口 ${collapsed.vw}x${collapsed.vh}，bottom=${Math.round(collapsed.bottom)}`);
    ok(`${vp.tag} 说明默认折叠、不占版面`, collapsed.open === false && collapsed.helpTop <= collapsed.vh + 1,
      `helpTop=${Math.round(collapsed.helpTop)}`);
    ok(`${vp.tag} 页面无溢出滚动`, collapsed.docH <= collapsed.vh + 2, `docH=${Math.round(collapsed.docH)}`);

    // 展开：画布仍应完整（页面可滚动，但画布本身不被压扁）
    const opened = await page.evaluate(() => {
      document.getElementById('help').open = true;
      return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => {
        const c = document.getElementById('game').getBoundingClientRect();
        const b = document.querySelector('#help .body').getBoundingClientRect();
        r({ h: c.height, w: c.width, ratio: c.width / c.height, bodyH: b.height, bodyMax: 320 });
      })));
    });
    ok(`${vp.tag} 展开后画布比例不变`, Math.abs(opened.ratio - 1.5) < 0.01,
      `w/h=${opened.ratio.toFixed(3)}`);
    ok(`${vp.tag} 说明区内部限高滚动`, opened.bodyH <= opened.bodyMax + 1, `bodyH=${Math.round(opened.bodyH)}`);
    ok(`${vp.tag} 无报错`, errs.length === 0, errs[0] || '');

    if (vp.tag === '1440x780') {
      await page.evaluate(() => { document.getElementById('help').open = false; });
      await page.waitForTimeout(120);
      await page.screenshot({ path: path.join(OUT, '_preview_layout.png'), fullPage: true });
      console.log('  saved _preview_layout.png');
    }
    results.push(vp.tag);
    await page.close();
  }

  console.log('\n──────────────────────────────');
  console.log(`  通过 ${pass} / 失败 ${fail}`);
  if (fail) failed.forEach(f => console.log('   - ' + f)); else console.log('  全部通过 ✅');
  console.log('──────────────────────────────');
  // browser.close() 在本机常挂死，限时收尾即可
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(fail ? 1 : 0);
})();
