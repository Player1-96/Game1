'use strict';
/* 舞剑流蓄势档位对照：刚够下限（3 帧）vs 蓄满（24 帧）的落点预览与蓄势槽 */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname);

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(250);
  const stage = await page.$('#stage');
  const shot = async f => { await stage.screenshot({ path: path.join(OUT, f) }); console.log('saved', f); };

  /* 蓄到指定帧数就停手，画一帧看落点预览能铺多远 */
  const chargeTo = frames => page.evaluate(n => {
    const G = window.Game;
    G.newRun('wujian');
    const p = G.player;
    p.giveUlt('wujian'); p.ultCd = 0;
    p.x = 120; p.y = 170; p.invuln = 99999;
    input.mouseSeen = true; input.mx = 430; input.my = 170;
    G.enemies.length = 0;
    for (let i = 0; i < 4; i++) {
      const e = new Enemy('xiesui', 250 + i * 52, 112 + (i % 2) * 112, 1);
      e.spawnT = 0; e.speed = 0; G.enemies.push(e);
    }
    p.items.push('qingfeng');
    G.useUlt();
    const lim = Math.min(n, WJ.charge);
    for (let i = 0; i < 120 && p.wjCharging && p.wjChargeT < lim; i++) { p.invuln = 99999; G.update(); }
    G.draw();
    return Math.round(p.wjChargeT);
  }, frames);

  console.log('短蓄势 =', await chargeTo(3), '帧');
  await shot('_preview_wj_tap.png');
  console.log('满蓄势 =', await chargeTo(24), '帧');
  await shot('_preview_wj_full.png');

  await Promise.race([browser.close(), new Promise(x => setTimeout(x, 3000))]);
  process.exit(0);
})();
