'use strict';
/* 无尽试炼的现场截图（4 张）
   图一：开战瞬间（竞技场 + 第 1 波 + 左下成绩板）
   图二：带词缀的一波（HUD 右侧挂出词缀标签）
   图三：结算界面（击杀 / 存活 / 波次 三个大数字）
   只负责「把状态摆好再按一帧」，不做断言 —— 判定归 _probe_endless.js / _t_endless.js。 */
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(250);
  const stage = await page.$('#stage');
  const shot = async f => { await stage.screenshot({ path: path.join(OUT, f) }); console.log('saved', f); };
  const settle = (ms) => page.waitForTimeout(ms || 260);

  /* ---------- 图一：开战瞬间 ---------- */
  await page.evaluate(() => {
    const G = window.Game;
    localStorage.removeItem(ENDLESS_BEST_KEY);
    G.startEndless('feijian');
    G.player.invuln = 99999;
    for (let i = 0; i < 30; i++) G.update();
    G.draw();
  });
  await settle();
  const s1 = await page.evaluate(() => {
    const G = window.Game;
    return { wave: G.endless.wave, alive: G.enemies.filter(e => !e.dead).length,
      hp: G.player.hp + '/' + G.player.maxHP };
  });
  console.log('  第 ' + s1.wave + ' 波，场上 ' + s1.alive + ' 只，气血 ' + s1.hp);
  await shot('_preview_endless_wave1.png');

  /* ---------- 图二：带词缀的一波 ---------- */
  await page.evaluate(() => {
    const G = window.Game;
    G.player.invuln = 99999;
    // 推到第 11 波（2 条词缀），再定住画面
    for (let i = 0; i < 4000 && G.endless.wave < 11; i++) {
      G.update();
      if (i % 40 === 0) for (const e of G.enemies) if (!e.dead) { e.dead = true; G.endless.kills++; }
    }
    G.spawnEndlessWave();               // 保证场上有活怪可看
    for (let i = 0; i < 20; i++) G.update();
    G.draw();
  });
  await settle(200);
  const s2 = await page.evaluate(() => {
    const G = window.Game;
    return { wave: G.endless.wave, mods: G.endless.mods, kills: G.endless.kills,
      secs: Math.floor(G.endless.frames / 60), alive: G.enemies.filter(e => !e.dead).length };
  });
  console.log('  第 ' + s2.wave + ' 波，词缀 [' + s2.mods.join(',') + ']，'
    + s2.alive + ' 只，击杀 ' + s2.kills + '，存活 ' + s2.secs + ' 秒');
  await shot('_preview_endless_mods.png');

  /* ---------- 图三：结算界面 ---------- */
  await page.evaluate(() => {
    const G = window.Game;
    G.endless.wave = 14;
    G.endless.kills = 268;
    G.endless.frames = 60 * 372;
    const p = G.player;
    p.invuln = 0; p.shield = 0; p.tShield = 0; p.hp = 1;
    p.takeDamage(99, G, 0, 0);
    if (!p.dead) p.takeDamage(99, G, 0, 0);
    G.draw();
  });
  await settle(300);
  const s3 = await page.evaluate(() => {
    const G = window.Game;
    return { state: G.state, secs: G.endless.secs, kills: G.endless.kills,
      wave: G.endless.wave, best: G.endless.bestPending };
  });
  console.log('  结算：' + s3.kills + ' 击杀 / ' + Math.floor(s3.secs / 60) + ' 分 '
    + (s3.secs % 60) + ' 秒 / 第 ' + s3.wave + ' 波，破纪录 ' + s3.best);
  await shot('_preview_endless_result.png');

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
