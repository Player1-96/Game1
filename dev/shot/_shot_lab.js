'use strict';
/* 实验室的现场图：左边是游戏，右边是面板。
   为了让一张图里同时看到「环剑 + 回旋剑 + 靶子」，这里把状态摆好再截。 */
const { chromium } = require('playwright');
const path = require('path');
const BASE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1400, height: 860 }, deviceScaleFactor: 1.5 });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(BASE + '?lab=1');
  await p.waitForFunction(() => window.Game && window.Lab, null, { timeout: 15000 });
  await p.waitForTimeout(400);

  await p.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian'); G.state = 'play';
    const pl = G.player;
    ['wangfu', 'jianying', 'huiming'].forEach(id => {
      pl.give(id, G); G.itemPopup = null;
      pl.fusionMem[id] = { a: 2, b: 2 };
    });
    pl.recomputeStats(G.style);
    G.orbits.length = 0; pl.orbitChg = 0;
    /* 直接喂命中，把 3 柄环剑攒出来（等价于在游戏里打 24 下） */
    for (let i = 0; i < 24; i++) {
      const e = new Enemy('xiesui', pl.x, pl.y - 60, 1);
      e.spawnT = 0; e.hp = 99999; e.maxHp = 99999;
      G.enemies.push(e);
      Fusion.onHit(e, { fus: pl.stats.fus, dmg: 3, chain: 0, crit: false }, G);
      G.enemies.length = 0;
    }
    /* 靶子：一排（看穿透 / 回旋） */
    G.room.obstacles.length = 0;
    for (let i = 0; i < 4; i++) {
      const e = new Enemy('xiesui', 200 + i * 55, 120, 1);
      e.spawnT = 0; e.speed = 0; e.touch = 0; e.cd = 999999;
      e.maxHp = 99999; e.hp = 99999; e.dummy = true;
      G.enemies.push(e);
    }
    pl.x = 120; pl.y = 190; pl.orbitChg = 5;
    /* 打一发回旋梭，让它正好在去程中途 */
    pl.shootCd = 0;
    STYLES.feijian.attack(pl, G, { shooting: true, aiming: true, aimAngle: 0 });
  });

  /* 手动推进 8 帧：子弹在去程、环剑在转 */
  await p.evaluate(() => { for (let i = 0; i < 8; i++) window.Game.update(); window.Game.draw(); });
  await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(OUT, '_preview_lab.png') });
  console.log('saved _preview_lab.png');
  await b.close();
})();
