/* ② 流派选择：用真实主循环时序复核（上一次探针冻结了 rAF，读数无效） */
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 820 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.waitForTimeout(400);

  const read = () => page.evaluate(() => ({
    state: window.Game.state,
    title: getComputedStyle(document.getElementById('title')).display,
    choose: getComputedStyle(document.getElementById('choose')).display,
    chall: document.getElementById('chall') ? getComputedStyle(document.getElementById('chall')).display : '(无)',
    settings: window.Game.settingsOpen,
    cards: [...document.querySelectorAll('#choose .pickCard')].map(c => c.style.display),
    hasSave: window.Game.hasSave()
  }));

  console.log('=== 初始（title）===');
  console.log('  ' + JSON.stringify(await read()));

  // 按一个普通键
  await page.keyboard.press('x');
  await page.waitForTimeout(500);
  console.log('=== 按 X 后 500ms ===');
  console.log('  ' + JSON.stringify(await read()));

  // 再按回车
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({
    state: window.Game.state, style: window.Game.style,
    title: getComputedStyle(document.getElementById('title')).display,
    choose: getComputedStyle(document.getElementById('choose')).display
  }));
  console.log('=== 再按 Enter 后 500ms ===');
  console.log('  ' + JSON.stringify(after));

  // 回到标题，试挑战菜单的往返
  await page.evaluate(() => { window.Game.state = 'title'; window.Game.player = null; updateOverlay(); });
  await page.waitForTimeout(200);
  await page.keyboard.press('b');
  await page.waitForTimeout(400);
  const inChall = await page.evaluate(() => ({
    state: window.Game.state,
    chall: getComputedStyle(document.getElementById('chall')).display,
    style: window.Game.style
  }));
  console.log('=== 按 B 进挑战菜单 ===');
  console.log('  ' + JSON.stringify(inChall));

  // 挑战菜单里 Esc（在 boss 步骤）
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  console.log('=== 挑战菜单按 Esc ===');
  console.log('  ' + JSON.stringify(await read()));

  // 挑战模式里的 style 从哪来
  const styleSrc = await page.evaluate(() => {
    const G = window.Game;
    return { gameStyle: G.style, playable: PLAYABLE_STYLES.slice() };
  });
  console.log('=== 挑战模式的流派来源 ===');
  console.log('  Game.style = ' + styleSrc.gameStyle + '   PLAYABLE = ' + JSON.stringify(styleSrc.playable));

  console.log('\n页面错误: ' + (errs.length ? errs.join(' | ') : '无'));
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
