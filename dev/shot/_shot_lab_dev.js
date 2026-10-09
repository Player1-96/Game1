'use strict';
/* 出图：设计调试台长什么样（法宝总表 + 怪物总表都在一栏里）。
   验收 UI 不能只看断言 —— 断言说得清「有没有」，说不清「挤不挤、看不看得懂」。
   产物：dev/preview/_preview_lab_dev.png */
const { chromium } = require('playwright');
const path = require('path');
const BASE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview', '_preview_lab_dev.png');

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(BASE + '?dev=1');
  await p.waitForFunction(() => window.Game && window.Game.state === 'title' && window.Lab, null, { timeout: 15000 });
  await p.waitForTimeout(400);

  /* 摆一个「北欧段 + 若干法宝 + 几只怪 + 碰撞圈」的典型设计现场 */
  await p.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    G.stylePath = ['cn', 'nordic', 'nordic'];
    G.seg = 1;
    G.applySegmentPalette();
    G.newFloor(10, null, { boss: 'jormungandr' });
    const br = [...G.floor.rooms.values()].find(r => r.type === RT.BOSS);
    G.enterRoom(br, null);
    G.state = 'play';
    G.enemies.length = 0;
    G.player.x = 240; G.player.y = 200;
  });
  await p.click('#labFoes button[data-id="draugr"]');
  await p.click('#labFoes button[data-id="volva"]');
  await p.click('#labFoes button[data-id="runestone"]');
  await p.click('#labFoes button[data-id="frost_jarl"]');
  await p.click('#labAllItems button[data-id="luanpifeng"]');
  await p.click('#labAllItems button[data-id="dongming"]');
  await p.click('#labAllItems button[data-id="mjolnir"]');
  await p.click('[data-a="hitbox"]');                 // 打开碰撞圈
  await p.evaluate(() => { window.Lab.refreshFoeArt(); });
  await p.waitForTimeout(900);

  await p.screenshot({ path: OUT, fullPage: false });
  console.log('已出图 → ' + OUT);

  /* 再来两张「只有右栏」的放大图：面板本身才是这次要验的东西，
     整屏截图里它只有 340px 宽，字看不清。上/下各一张。 */
  const panel = await p.$('#lab');
  if (panel) {
    const P2 = path.resolve(__dirname, '..', 'preview', '_preview_lab_dev_panel.png');
    const P3 = path.resolve(__dirname, '..', 'preview', '_preview_lab_dev_panel2.png');
    await p.evaluate(() => { document.getElementById('lab').scrollTop = 0; });
    await p.waitForTimeout(200);
    await panel.screenshot({ path: P2 });
    await p.evaluate(() => { document.getElementById('lab').scrollTop = 560; });
    await p.waitForTimeout(200);
    await panel.screenshot({ path: P3 });
    console.log('已出图 → ' + P2 + ' / ' + P3 + '（右栏上 / 下）');
  }
  await Promise.race([b.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})().catch(e => { console.log('FATAL', (e && e.stack) || e); process.exit(1); });
