'use strict';
/* 舞剑流劈裂缝墙：北墙的符文裂缝墙，近战剑锋三刀劈开。
   两张图 —— 砍到一半（墙上亮起青框 = 已有裂痕）/ 第三刀劈开（SECRET 浮字 + 门洞）。 */
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname);

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

  /* 只认真实鼠标输入的 attack 拿不到合成按键，所以按帧手动喂一份；
     shootCd 仍在把关节奏，收尾那一刀强制清零，好把剑光留在画面上。 */
  const swing = (hp, frames) => page.evaluate(({ hp, frames }) => {
    const G = window.Game;
    G.newRun('wujian');
    G.state = 'play';
    G.room.cleared = true;
    G.enemies.length = 0; G.bullets.length = 0; G.hazards.length = 0;
    G.floaters.length = 0; G.particles.length = 0;
    G.itemPopup = null;                 // 收起开局那张「剑影三叠」浮层，别挡住现场
    if (G.updateOverlay) G.updateOverlay();
    const p = G.player;
    p.invuln = 9999; p.hp = p.maxHP;
    p.x = 240; p.y = 46;
    const rm = G.room;
    rm.doors[0] = true; rm.doorHidden[0] = true; rm.doorOpen[0] = false; rm.doorHp[0] = hp;
    const inp = { shooting: true, aiming: true, aimAngle: -Math.PI / 2 };
    for (let i = 0; i < frames; i++) { G.update(); STYLES.wujian.attack(p, G, inp); }
    p.shootCd = 0; STYLES.wujian.attack(p, G, inp);
    G.draw();
    return { 门耐久: rm.doorHp[0], 门已开: rm.doorOpen[0] };
  }, { hp, frames });

  console.log('砍到一半：', JSON.stringify(await swing(3, 20)));
  await shot('_preview_crack_wujian.png');

  console.log('第三刀劈开：', JSON.stringify(await swing(1, 6)));
  await shot('_preview_crack_open.png');

  await Promise.race([browser.close(), new Promise(x => setTimeout(x, 3000))]);
  process.exit(0);
})();
