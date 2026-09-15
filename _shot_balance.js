'use strict';
/* 出剑后摇美术验证：蓄力满 vs 后摇初段 vs 后摇过半（回气条） */
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
  const canvas = await page.$('#game');
  const shot = async f => { await canvas.screenshot({ path: path.join(OUT, f) }); console.log('saved', f); };

  // 蓄力至二段满
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('jujian');
    const inp = G.input;
    G.player.x = 240; G.player.y = 170;
    inp.mx = 430; inp.my = 170;
    for (let i = 0; i < 70; i++) {
      inp.mouseT = performance.now(); inp.mouseDown = true;
      G.player.hp = G.player.maxHP; G.player.invuln = 9999;
      G.update();
    }
    G.draw();
  });
  await shot('_preview_cd_charge.png');

  // 点射（后摇 30 帧，便于看清回气过程）
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('jujian');
    const inp = G.input;
    G.player.x = 240; G.player.y = 170;
    inp.mx = 430; inp.my = 170;
    inp.mouseT = performance.now(); inp.mouseDown = true;
    G.player.invuln = 9999; G.update();
    inp.mouseDown = false;
    G.update();                       // 释放 → 后摇起算
    for (let i = 0; i < 3; i++) { G.player.invuln = 9999; G.update(); }
    G.draw();
  });
  await shot('_preview_cd_early.png');

  // 后摇过半
  await page.evaluate(() => {
    const G = window.Game;
    for (let i = 0; i < 12; i++) { G.player.invuln = 9999; G.update(); }
    G.draw();
  });
  await shot('_preview_cd_half.png');

  const info = await page.evaluate(() => ({
    cd: window.Game.player.shootCd, max: window.Game.player.chargeCdMax
  }));
  console.log('后摇剩余/总长 =', info.cd + '/' + info.max);

  // browser.close() 在本机常挂死，限时收尾即可
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
