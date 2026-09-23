/* ============================================================
 *  _shot_settings.js —— 设置面板现场图
 *
 *  出四张：标题界面打开（含各行当前值）、选中行高亮、清档二次确认、
 *  以及游戏内暂停时的面板（底下垫着暂停遮罩）。
 *  跑法：node dev/shot/_shot_settings.js
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
  const page = await browser.newPage({ viewport: { width: 1100, height: 860 }, deviceScaleFactor: 2 });
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.keyboard.press('o');
  await page.waitForTimeout(150);

  const box = await page.locator('#stage').boundingBox();
  const clip = { x: box.x, y: box.y, width: box.width, height: box.height };

  /* 1. 标题界面 + 设置面板（默认第 0 行选中） */
  await page.evaluate(() => { Game.setIdx = 0; renderSettings(); updateOverlay(); });
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(OUT, '_preview_settings_title.png'), clip });
  console.log('  已出 _preview_settings_title.png');

  /* 2. 选中「清空存档」并上膛 —— 演示 warn 态与二次确认 */
  await page.evaluate(() => {
    Game.newRun('feijian');
    Game.state = 'play';
    Game.saveGame();                        // 造一份档，让「清空存档」显示「有存档」
    Game.setIdx = 5;
    Game.setClearArm = true;
    renderSettings(); updateOverlay();
  });
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(OUT, '_preview_settings_clear.png'), clip });
  console.log('  已出 _preview_settings_clear.png');

  /* 3. 游戏内暂停时打开设置（底下垫着 PAUSED 遮罩） */
  await page.evaluate(() => {
    Game.setClearArm = false;
    Game.setIdx = 1;                        // 背景音乐
    Game.settingsOpen = false;
    Game.paused = true;                     // 先真暂停，再开设置
    Game.draw();
    Game.settingsOpen = true;
    renderSettings(); updateOverlay();
  });
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(OUT, '_preview_settings_inplay.png'), clip });
  console.log('  已出 _preview_settings_inplay.png');

  /* 4. 单独的暂停画面（确认多了 O OPTIONS 一行） */
  await page.evaluate(() => {
    Game.settingsOpen = false;
    Game.paused = true;
    Game.draw();
  });
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(OUT, '_preview_paused.png'), clip });
  console.log('  已出 _preview_paused.png（已更新，含 O OPTIONS）');

  console.log('');
  console.log('提示：暂停画面里 O OPTIONS 是画布像素字，设置面板是 DOM 浮层，两者都覆盖到了。');

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 2000))]);
  process.exit(0);
})();
