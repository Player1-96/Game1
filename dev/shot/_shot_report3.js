/* ============================================================
 *  _shot_report3.js —— 2026-09-23 三条修复的现场图
 *   ① 挑战菜单三级（新增「择流派」）
 *   ② 小地图：平时半透明 / 换房时提亮 / 妖物在右上角
 *   ③ Boss 血条：阶段刻度 + 转阶段时的 PHASE 读数
 * ============================================================ */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 820 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(250);

  const freeze = () => page.evaluate(() => { Game.draw(); window.requestAnimationFrame = () => 0; });

  /* ---- ①a 挑战菜单：择流派 ---- */
  await page.evaluate(() => { Game.openChallMenu(); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '_preview_chall_style.png') });

  /* ---- ①b 择魔头（副标题里能看到已选流派）---- */
  await page.evaluate(() => { Game.challPick(2); Game.challConfirm(); Game.challPick(4); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '_preview_chall_boss2.png') });

  /* ---- ①c 择难度（顶部带流派名）---- */
  await page.evaluate(() => { Game.challConfirm(); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '_preview_chall_diff2.png') });

  /* ---- ② 小地图：平时（半透明） ---- */
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian'); G.state = 'play';
    G.minimapT = 0;                     // 平时状态
    G.enemies.length = 0; G.bullets.length = 0;
    const p = G.player; p.x = 130; p.y = 210; p.invuln = 999999;
    for (let i = 0; i < 3; i++) {
      // 摆在小地图正中央 —— 这正是「怪被地图挡住」的那个位置
      const e = new Enemy('xiesui', 424 + i * 18, 34 + (i % 2) * 14, 1);
      e.spawnT = 0; e.hp = e.maxHp = 99999; e.speed = 0; e.cd = 99999; e.touch = 0;
      G.enemies.push(e);
    }
    G.draw();
    window.requestAnimationFrame = () => 0;
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, '_preview_minimap_dim.png') });

  /* ---- ②b 同一场景，换房高亮态 ---- */
  await page.evaluate(() => {
    Game.minimapT = 150;
    Game.draw();
    window.requestAnimationFrame = () => 0;
  });
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(OUT, '_preview_minimap_hot.png') });

  /* ---- ③ Boss 血条：转阶段 PHASE 读数 ---- */
  await page.evaluate(() => {
    const G = window.Game;
    G.openChallMenu();
    G.challMenu.step = 'diff'; G.challMenu.bossId = 'zhulong'; G.challMenu.idx = 1;
    G.challMenu.style = 'feijian';
    G.challConfirm();
    G.chall.upgrades = 0; G.pick = null;
    const b = G.bossRef;
    b.spawnT = 0;
    G.player.invuln = 999999;
    b.hp = b.maxHp * 0.55;               // 打到二阶段
    b.invuln = 0;
    b.hurt(1, G, null, false);           // 触发 setPhase(2)
    b.invuln = 26;                        // 停在闪白的那一帧
    G.draw();
    window.requestAnimationFrame = () => 0;
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, '_preview_bosswarn_phase.png') });

  console.log('已出图：');
  ['_preview_chall_style.png', '_preview_chall_boss2.png', '_preview_chall_diff2.png',
    '_preview_minimap_dim.png', '_preview_minimap_hot.png', '_preview_bosswarn_phase.png']
    .forEach(f => console.log('  ' + f));

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
