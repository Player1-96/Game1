'use strict';
/* ============================================================
 *  _shot_stylemap.js —— 风格地图截图验收
 *
 *  为什么必须出图：这一期改的全是**配色与面板文案**，
 *  探针只能验「值对不对」，验不了「看起来对不对」。
 *  （上一轮太虚护盾的卡片文案错位就是只有出图才发现。）
 *
 *  出 6 张：三段竞技场实景（同一间房、三套配色）+ 开局面板 + 段间面板 + 通关
 * ============================================================ */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(250);

  const shot = async (name, note) => {
    await page.waitForTimeout(160);
    await page.screenshot({ path: path.join(OUT, name) });
    console.log('  ✓ ' + name + (note ? '   ' + note : ''));
  };

  console.log('══════════════════════════════════════════════════');
  console.log('  风格地图截图验收');
  console.log('══════════════════════════════════════════════════\n');

  /* ---------- ① 三段竞技场实景（同一间房，三套配色） ---------- */
  console.log('① 同一间房的三个层段（配色对比）');
  for (const [i, label] of [[0, '一重·青玉'], [1, '二重·赤铜'], [2, '三重·玄墨']]) {
    await page.evaluate((seg) => {
      const G = window.Game;
      G.newRun('feijian');
      G.seg = seg; G.stylePath = ['cn']; G.applySegmentPalette();
      /* 用【各段首层】而不是 seg*3 —— 每段层数由 SEG_FLOORS 决定（现在 5），
         写死 3 的话截图会拍到上一段的尾巴。 */
      G.newFloor(1 + seg * SEG_FLOORS);
      // 摆几只妖物 + 一点掉落，让画面有内容可比
      G.enemies.length = 0;
      const keys = ['xiesui', 'chanchu', 'guixiu'];
      keys.forEach((k, j) => {
        try { G.enemies.push(new Enemy(k, 130 + j * 90, 130, 1)); } catch (e) { }
      });
      G.enemies.forEach(e => { e.spawnT = 0; e.speed = 0; e.touch = 0; });
      for (let f = 0; f < 30; f++) G.update();
      for (let f = 0; f < 6; f++) G.draw();
    }, i);
    await shot(`_preview_stylemap_seg${i + 1}.png`, label);
  }

  /* ---------- ② 开局面板 ---------- */
  console.log('\n② 开局三选一面板');
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    G.depth = 1; G.seg = 0;
    G.openStyleMenu('first');
  });
  await shot('_preview_stylemap_first.png', '开局择一方天地');

  /* ---------- ③ 段间面板（第三段，路径已定两段） ---------- */
  console.log('\n③ 段间面板（已走过两段）');
  const d3 = await page.evaluate(() => SEG_FLOORS * 2 + 1);
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    /* 段间面板出现在第三段首层 = SEG_FLOORS*2+1（现在 11 层） */
    G.depth = SEG_FLOORS * 2 + 1; G.seg = 2;
    G.stylePath = ['cn', 'cn', 'cn'];
    G.applySegmentPalette();
    G.openStyleMenu('next');
  });
  await shot('_preview_stylemap_next.png', '第 ' + d3 + ' 层 · 再择前路');

  /* ---------- ④ 顶栏风格标识 ---------- */
  console.log('\n④ HUD 顶栏的风格标识');
  await page.evaluate(() => {
    const G = window.Game;
    G.styleMenu = null; G.state = 'play';
    G.newRun('feijian');
    G.depth = SEG_FLOORS + 1; G.seg = 1;      // 第二段首层（现在 6 层）
    G.stylePath = ['cn', 'cn', 'cn'];
    G.applySegmentPalette();
    G.newFloor(SEG_FLOORS + 1);
    for (let f = 0; f < 20; f++) G.update();
    for (let f = 0; f < 5; f++) G.draw();
  });
  await page.waitForTimeout(200);
  await shot('_preview_stylemap_hud.png', '顶栏「第X层 · 房型　中·二」');

  if (errs.length) {
    console.log('\n⚠️ 运行期报错：');
    errs.slice(0, 5).forEach(e => console.log('   ' + e));
  } else {
    console.log('\n  运行期无报错 ✅');
  }
  console.log('\n截图输出目录：' + OUT + '\n');

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
