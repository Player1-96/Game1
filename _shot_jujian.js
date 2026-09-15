'use strict';
/* 巨剑流美术验证：把几个蓄力阶段与飞行中的巨剑截图，
 * 好肉眼确认像素画和合成动画的效果。 */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(250);

  const canvas = await page.$('#game');

  // 某个蓄力帧数的定格
  async function shotCharge(file, frames) {
    await page.evaluate(n => {
      const G = window.Game;
      G.newRun('jujian');
      const inp = G.input;
      G.player.x = 240; G.player.y = 170;
      inp.mouseDown = true; inp.mouseT = performance.now(); inp.mx = 430; inp.my = 170;
      for (let i = 0; i < n; i++) G.update();
      G.draw();
    }, frames);
    await canvas.screenshot({ path: file });
    console.log('saved', file);
  }

  await shotCharge('_ju_charge_lv0.png', 12);
  await shotCharge('_ju_charge_lv1.png', 36);
  await shotCharge('_ju_charge_lv2.png', 75);

  // 释放后巨剑飞行中的样子
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('jujian');
    const inp = G.input;
    G.player.x = 150; G.player.y = 170;
    inp.mouseDown = true; inp.mouseT = performance.now(); inp.mx = 430; inp.my = 170;
    for (let i = 0; i < 75; i++) G.update();
    inp.mouseDown = false;
    G.update();                 // 释放
    for (let i = 0; i < 12; i++) G.update();   // 飞行一会儿
    G.draw();
  });
  await canvas.screenshot({ path: '_ju_flying.png' });
  console.log('saved _ju_flying.png');

  // 飞剑流定格做对照
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    const inp = G.input;
    G.player.x = 240; G.player.y = 170;
    inp.mouseDown = true; inp.mouseT = performance.now(); inp.mx = 430; inp.my = 170;
    for (let i = 0; i < 20; i++) G.update();
    G.draw();
  });
  await canvas.screenshot({ path: '_ju_feijian_ref.png' });
  console.log('saved _ju_feijian_ref.png');

  // browser.close() 在本机常挂死，限时收尾即可
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
