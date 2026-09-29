/* ============================================================
 *  _shot_title.js —— 标题页两级菜单现场图
 *
 *  2026-09-29 用户要求重排：① 开始游戏（普通/Boss/无尽）② 加载游戏 ③ 设置。
 *  出三张：主菜单、开始游戏二级、设置二级（并演示 BGM 关掉时的「关」读数）。
 *  跑法：node dev/shot/_shot_title.js
 * ============================================================ */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');

(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const box = await page.locator('#stage').boundingBox();
  const clip = { x: box.x, y: box.y, width: box.width, height: box.height };

  const shots = [
    { file: '_preview_title_root.png', step: 'root', idx: 0, note: '主菜单' },
    { file: '_preview_title_start.png', step: 'start', idx: 0, note: '开始游戏二级' },
    { file: '_preview_title_settings.png', step: 'settings', idx: 1, note: '设置二级（光标在背景音乐）' }
  ];
  for (const s of shots) {
    await page.evaluate((s) => {
      Game.titleMenu = { step: s.step, idx: s.idx };
      updateOverlay();
    }, s);
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(OUT, s.file), clip });
    console.log('  已出 ' + s.file + '（' + s.note + '）');
  }

  /* 有存档时「加载游戏」不再是灰的 —— 顺手也出一张 */
  await page.evaluate(() => {
    Game.newRun('feijian');
    Game.state = 'play';
    Game.saveGame();
    Game.state = 'title';
    Game.titleMenu = { step: 'root', idx: 1 };
    Game._hasSave = null;
    updateOverlay();
  });
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(OUT, '_preview_title_save.png'), clip });
  console.log('  已出 _preview_title_save.png（有存档：加载游戏点亮）');

  await browser.close();
})();
