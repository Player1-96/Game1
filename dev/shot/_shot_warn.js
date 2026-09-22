'use strict';
/* 三处「预警不足」修复后的现场截图（5 张）
   图一 / 图二：头目冲刺的前摇 —— 跟随期（光带跟着玩家甩）/ 锁定后（转亮 + 推进光点）
   图三：      玄甲卫盾冲的蓄力 —— 地面冲程带 + 旋盾并成一片收拢到正面
   图四~六：   烛龙横扫的倒计时递进（约 1/4、1/2、9/10），看亮度与进度弧怎么走
   只负责「把状态摆好再按一帧」，不做断言 —— 判定归 _probe_warn.js / _t_foe.js。 */
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

  const clean = (px, py) => page.evaluate(({ px, py }) => {
    const G = window.Game;
    G.newRun('feijian');
    G.state = 'play';
    G.room.cleared = true;
    G.enemies.length = 0; G.bullets.length = 0; G.hazards.length = 0; G.beams.length = 0;
    G.particles.length = 0; G.floaters.length = 0; G.dnums.length = 0;
    G.itemPopup = null;
    if (G.updateOverlay) G.updateOverlay();
    G.player.invuln = 99999; G.player.hp = G.player.maxHP;
    G.player.x = px; G.player.y = py;
  }, { px: px, py: py });

  const freeze = () => page.evaluate(() => {
    window.Game.draw();
    window.requestAnimationFrame = () => 0;
  });

  /* ---------- 图一 / 二：头目冲刺的前摇 ---------- */
  await clean(340, 240);
  await page.evaluate(() => {
    const G = window.Game;
    const b = new Boss('xuemo', 130, 110, 1);
    b.spawnT = 0; b.cd = 99999; b.cd3 = 99999; b.spd = 0;
    b.cd2 = 1;
    G.enemies.push(b);
    for (let i = 0; i < 10; i++) G.update();     // 跟随期：光带还朝着玩家甩
  });
  await freeze();
  await shot('_preview_warn_dash_open.png');

  await page.evaluate(() => {
    const G = window.Game;
    for (let i = 0; i < 20; i++) G.update();     // 推进到钉死之后、临近出膛
  });
  await freeze();
  await shot('_preview_warn_dash_lock.png');

  /* ---------- 图三：玄甲卫盾冲的蓄力 ---------- */
  await clean(200, 258);
  await page.evaluate(() => {
    const G = window.Game;
    const e = new Enemy('xuanjia', 200, 120, 1);
    e.spawnT = 0; e.cd = 1; e.speed = 0;
    G.enemies.push(e);
    for (let i = 0; i < 30; i++) G.update();     // 蓄力 30 帧（方向已钉死）
  });
  await freeze();
  await shot('_preview_warn_bash.png');

  /* ---------- 图四~六：横扫倒计时的三个时刻 ---------- */
  const phases = [[19, '_preview_warn_sweep_a.png'], [23, '_preview_warn_sweep_b.png'], [27, '_preview_warn_sweep_c.png']];
  await clean(240, 200);
  await page.evaluate(() => {
    const G = window.Game;
    const b = new Boss('zhulong', 240, 80, 1);
    b.spawnT = 0; b.cd = 99999; b.cd3 = 99999; b.spd = 0; b.guardCd = 1;
    G.enemies.push(b);
    G.update();                                  // 罩起 + 架起横扫
  });
  for (const [n, f] of phases) {
    await page.evaluate((n) => {
      const G = window.Game;
      for (let i = 0; i < n; i++) G.update();
    }, n);
    await freeze();
    const k = await page.evaluate(() => {
      const bm = window.Game.beams[0];
      return bm ? +(bm.t / bm.warn).toFixed(2) : -1;
    });
    console.log('  ' + f + ' → 蓄力进度 k = ' + k);
    await shot(f);
  }

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
