'use strict';
/* 出图：标题界面的「续前缘」提示。
   流程与真实使用一致 —— 先玩一会儿（自动写档），关掉页面，再打开。 */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });

  const p1 = await ctx.newPage();
  await p1.goto(FILE);
  await p1.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p1.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await p1.evaluate(() => {
    const G = window.Game;
    G.newRun('wujian');
    G.state = 'play';
    let ts = 1000;
    for (let i = 0; i < 40; i++) { ts += 17; G.frame(ts); }
    G.player.hp = 4; G.player.maxHP = 8; G.coins = 37; G.keys = 2; G.depth = 3;
    G.saveGame();
  });
  await p1.close();                       // 关掉页面

  const p2 = await ctx.newPage();         // 重新打开
  await p2.goto(FILE);
  await p2.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p2.waitForTimeout(600);
  await p2.screenshot({ path: path.join(OUT, '_preview_continue.png') });
  console.log('已出图: _preview_continue.png（标题界面 · 续前缘）');

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
