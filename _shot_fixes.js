'use strict';
/* 本轮修复的视觉验证：精英环形技前摇、死亡危险预警、长按 R 进度条 */
const { chromium } = require('playwright');
const path = require('path');
const OUT = __dirname;
const FILE = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 820 } });
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(200);

  const stage = await page.$('#stage');
  const shot = async f => { await stage.screenshot({ path: path.join(OUT, f) }); console.log('saved', f); };

  // 精英环形技前摇（血煞厉鬼扩圈预警）
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    G.enemies.length = 0; G.props.length = 0; G.hazards.length = 0; G.bullets.length = 0;
    const e = new Enemy('shikui', 240, 150, 1, 'xiesha');
    e.spawnT = 0; e.perkT = 18;                 // 前摇进行到一半
    G.enemies.push(e);
    G.player.x = 150; G.player.y = 220; G.player.invuln = 9999;
    G.draw();
  });
  await shot('_preview_fix_windup.png');

  // 精英死亡危险预警圈（warn 阶段）
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    G.enemies.length = 0; G.props.length = 0; G.hazards.length = 0; G.bullets.length = 0; G.timers = [];
    const e = new Enemy('chanchu', 240, 150, 1, 'wandu');
    e.eliteDeath(G);
    G.player.x = 170; G.player.y = 220; G.player.invuln = 9999;
    for (let i = 0; i < 12; i++) { G.player.invuln = 9999; G.update(); }
    G.draw();
  });
  await shot('_preview_fix_deathwarn.png');

  // 长按 R 重开进度条
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('jujian');
    G.enemies.length = 0;
    G.state = 'play'; G.restartHold = 42;
    G.draw();
  });
  await shot('_preview_fix_restart.png');

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})().catch(e => { console.log('FATAL', e && e.stack || e); process.exit(1); });
