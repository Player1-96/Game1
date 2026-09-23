/* ============================================================
 *  _shot_taixu.js —— 太虚护盾的两个现场
 *    1. 补回一格的瞬间（SHIELD 飘字 + 绿光）
 *    2. 三重满盾 4 格（看 HUD 上的护盾读数）
 *  跑法：node dev/shot/_shot_taixu.js
 * ============================================================ */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 860 }, deviceScaleFactor: 2 });
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const box = await page.locator('#stage').boundingBox();
  const clip = { x: box.x, y: box.y, width: box.width, height: box.height };

  const setup = () => page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    G.state = 'play';
    G.pick = null; G.paused = false; G.settingsOpen = false;
    const p = G.player;
    G.enemies.length = 0; G.bullets.length = 0; G.hazards.length = 0;
    // 一只不动、不还手的靶子：只为满足「房内还有敌人」这个回盾前提
    const e = new Enemy('xiesui', 386, 96, 1);
    e.spawnT = 0; e.maxHp = 99999; e.hp = 99999;
    e.speed = 0; e.cd = 999999; e.touch = 0;
    G.enemies.push(e);
    p.invuln = 999999;
    p.give('taixu', G);
    return { cap: p.shieldCap, gap: p.shieldGap };
  });

  /* 1. 补回一格的瞬间 */
  const info = await setup();
  await page.evaluate(() => {
    const G = window.Game, p = G.player;
    p.shield = 1;                              // 先打掉一格
    p.shieldReviveT = p.shieldGap - 1;         // 计时差一帧
    p.x = 180; p.y = 150;
    G.update();                                // 这一帧补回 → 飘字 + 绿光
    G.draw();
    window.requestAnimationFrame = () => 0;
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(OUT, '_preview_taixu_regen.png'), clip });
  console.log('  已出 _preview_taixu_regen.png（护盾 %d/%d 格，间隔 %d 帧）',
    await page.evaluate(() => window.Game.player.shield), info.cap, info.gap);

  /* 2. 三重满盾：HUD 上的读数是 4 格 */
  await setup();
  const t3 = await page.evaluate(() => {
    const G = window.Game, p = G.player;
    p.give('taixu', G); p.give('taixu', G);    // 升到三重
    p.x = 240; p.y = 150;
    for (let i = 0; i < 3; i++) { p.invuln = 999999; G.update(); }
    G.draw();
    window.requestAnimationFrame = () => 0;
    return { shield: p.shield, cap: p.shieldCap, gapSec: +(p.shieldGap / 60).toFixed(1) };
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(OUT, '_preview_taixu_t3.png'), clip });
  console.log('  已出 _preview_taixu_t3.png（护盾 %d/%d 格，间隔 %s 秒）',
    t3.shield, t3.cap, t3.gapSec);

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 2000))]);
  process.exit(0);
})();
