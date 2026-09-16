'use strict';
/* 舞剑流视觉验证：流派选择界面 / 蓄势姿态 / 突进斩击 / 五连斩 / 近战 HUD */
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

  /* 1) 流派选择：三张卡片 */
  await page.evaluate(() => {
    const G = window.Game;
    G.state = 'choose'; G.styleIdx = 2;
    updateOverlay();
  });
  await page.waitForTimeout(120);
  await shot('_preview_style_choose.png');

  /* 2) 蓄势：坐胯按剑的蓄力姿态 + 聚气光晕 + 头顶蓄势槽 */
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('wujian');
    const p = G.player;
    p.giveUlt('wujian'); p.ultCd = 0;
    p.x = 200; p.y = 170; p.invuln = 99999;
    p.wjStage = 1;                       // 已接一段，蓄势槽标出 S2
    input.mouseSeen = true; input.mx = 420; input.my = 170;
    G.enemies.length = 0;
    for (let i = 0; i < 4; i++) {
      const e = new Enemy('xiesui', 90 + i * 62, 110 + (i % 2) * 90, 1);
      e.spawnT = 0; e.speed = 0; G.enemies.push(e);
    }
    p.items.push('qingfeng', 'chuanyun', 'lingxi');
    p.addSkill('qinlong'); p.addSkill('liekong');
    G.useUlt();
    for (let i = 0; i < 26; i++) { p.invuln = 99999; G.update(); }
    G.draw();
  });
  await shot('_preview_wj_charge.png');

  /* 3) 突进：残影 + 斩击刃光 */
  await page.evaluate(() => {
    const G = window.Game;
    const p = G.player;
    input.aiming = true; input.aimAngle = 0.1; input.mouseSeen = true;
    input.mx = 440; input.my = 190;
    G.ultUp();
    for (let i = 0; i < 8; i++) { p.invuln = 99999; G.update(); }
    G.draw();
  });
  await shot('_preview_wj_dash.png');

  /* 4) 三段 · 五连斩：全向刃光 */
  await page.evaluate(() => {
    const G = window.Game;
    const p = G.player;
    p.wjStage = 2;
    for (let i = 0; i < 40; i++) { p.invuln = 99999; G.update(); }
    G.useUlt();
    for (let i = 0; i < 26; i++) { p.invuln = 99999; G.update(); }
    input.aiming = true; input.mouseSeen = true; input.mx = 430; input.my = 200;
    G.ultUp();
    for (let i = 0; i < 20; i++) { p.invuln = 99999; G.update(); }
    G.draw();
  });
  await shot('_preview_wj_flurry.png');

  /* 5) 近战 HUD：弯刀流派标 + 段数角标 + 两门新功法入槽 */
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('wujian');
    const p = G.player;
    p.addSkill('tianlei'); p.addSkill('qinlong'); p.addSkill('liekong');
    p.slots[0].lv = 3; p.slots[1].lv = 5; p.selectSlot(2);
    p.giveUlt('wujian'); p.learnPath('power'); p.learnPath('chain');
    p.mp = 74; p.ultCd = 0; p.wjStage = 1; p.wjChainT = 60;
    p.items.push('qingfeng', 'chuanyun', 'lingxi', 'hunyuan', '回灵符'.length ? 'huiling' : 'huiling');
    p.addShield(2);
    G.enemies.length = 0;
    for (let i = 0; i < 5; i++) {
      const e = new Enemy('xiesui', 120 + i * 58, 120 + (i % 2) * 66, 1);
      e.spawnT = 0; e.speed = 0; G.enemies.push(e);
    }
    for (let i = 0; i < 10; i++) { p.invuln = 99999; G.update(); }
    G.draw();
  });
  await shot('_preview_wj_hud.png');

  await Promise.race([browser.close(), new Promise(x => setTimeout(x, 3000))]);
  process.exit(0);
})();
