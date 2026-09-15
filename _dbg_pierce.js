'use strict';
/* 只跑 T5 场景并输出全部细节，用于定位「巨剑没打中敌人」 */
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(250);

  const out = await page.evaluate(() => {
    const G = window.Game;
    const inp = G.input;
    G.newRun('jujian');
    let target = null;
    for (const rr of G.floor.rooms.values()) if (rr.waves && rr.waves.length) { target = rr; break; }
    if (target) G.enterRoom(target, null);

    const protoE = G.enemies[0] ? Object.getPrototypeOf(G.enemies[0]).constructor : null;
    if (!protoE) return { err: 'no Enemy proto' };

    G.enemies.length = 0; G.bullets.length = 0;
    G.room.obstacles = [];
    for (let i = 0; i < 5; i++) {
      const e = new protoE('xiesui', 130 + i * 42, 160, 1);
      e.update = () => {};
      G.enemies.push(e);
    }
    const before = G.enemies.map(e => e.hp);
    const list = G.enemies.slice();
    const enemyInfo = list.map(e => ({ x: e.x, y: e.y, r: e.r, hp: e.hp }));

    G.player.x = 60; G.player.y = 160; G.player.vx = 0; G.player.vy = 0;
    G.room.cleared = true;

    inp.mouseDown = true; inp.mouseT = performance.now(); inp.mx = 460; inp.my = 160;
    for (let i = 0; i < 75; i++) G.update();
    const chargeT = G.player.chargeT;
    const tier = window.chargeTier(chargeT);
    inp.mouseDown = false;
    G.update();

    const bs = G.bullets.filter(b => b.kind === 'jujian');
    const info = bs.length ? {
      n: bs.length, x: +bs[0].x.toFixed(1), y: +bs[0].y.toFixed(1),
      vx: +bs[0].vx.toFixed(2), vy: +bs[0].vy.toFixed(2), r: bs[0].r,
      pierce: bs[0].pierce, life: bs[0].life
    } : null;
    if (!bs.length) return { err: 'no bullet', chargeT, tier, enemyInfo, bulletsTotal: G.bullets.length };

    // 逐步跟踪，看它在哪里消失、打到了什么
    const track = [];
    let step = 0;
    while (G.bullets.includes(bs[0]) && step < 200) {
      G.update(); step++;
      if (step <= 40) {
        track.push({ step, x: +bs[0].x.toFixed(0), y: +bs[0].y.toFixed(0), dead: bs[0].dead, hits: bs[0].hit.size });
      }
      if (bs[0].dead) break;
    }
    const after = list.map(e => ({ hp: e.hp, dead: e.dead }));
    const hurt = list.filter((e, i) => e.dead || e.hp < before[i]).length;
    return { chargeT, tier, enemyInfo, info, track: track.slice(0, 24), after, hurt, step, leftInRoom: G.enemies.length };
  });

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  process.exit(0);
})();
