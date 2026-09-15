'use strict';
/* 舞剑流挥剑动作：三帧姿态对照 + 实战连拍 + 斩落术法 */
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

  /* ---- 1. 三帧姿态本身：down / up / side 各三帧，放大 4 倍拼一张 ---- */
  await page.evaluate(() => {
    const S = 4, W = 16 * S, H = 17 * S, PAD = 6;
    const c = document.createElement('canvas');
    c.id = '_swingSheet';
    c.width = 3 * W + 4 * PAD; c.height = 3 * H + 4 * PAD;
    c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#1d1730;image-rendering:pixelated';
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#1d1730'; g.fillRect(0, 0, c.width, c.height);
    ['down', 'up', 'side'].forEach((d, r) => {
      for (let f = 0; f < 3; f++) {
        g.drawImage(SPR.playerSwing[d][f], PAD + f * (W + PAD), PAD + r * (H + PAD), W, H);
      }
    });
    document.body.appendChild(c);
  });
  const sheet = await page.$('#_swingSheet');
  await sheet.screenshot({ path: path.join(OUT, '_preview_wj_swing.png') });
  console.log('saved _preview_wj_swing.png');
  await page.evaluate(() => { const e = document.getElementById('_swingSheet'); if (e) e.remove(); });

  /* ---- 2. 实战连拍：出刀 → 力劈 → 收势 ---- */
  const prep = () => page.evaluate(() => {
    const G = window.Game;
    G.newRun('wujian');
    const p = G.player;
    p.x = 190; p.y = 168; p.invuln = 99999;
    G.enemies.length = 0;
    for (let i = 0; i < 3; i++) {
      const e = new Enemy('xiesui', 236 + i * 34, 150 + i * 18, 1);
      e.spawnT = 0; e.maxHp = 9999; e.hp = 9999; e.speed = 0; e.cd = 99999; e.touch = 0;
      G.enemies.push(e);
    }
    input.mouseSeen = true; input.mx = 430; input.my = 168;
    input.mouseDown = true;
    G.update();                                  // 出刀当帧
    G.draw();
    return { swingT: p.swingT };
  });
  const step = n => page.evaluate(k => {
    const G = window.Game;
    for (let i = 0; i < k; i++) { G.player.invuln = 99999; G.update(); }
    G.draw();
    return { swingT: G.player.swingT };
  }, n);

  console.log('起手', await prep()); await shot('_preview_wj_swing_0.png');
  console.log('力劈', await step(4)); await shot('_preview_wj_swing_1.png');
  console.log('收势', await step(4)); await shot('_preview_wj_swing_2.png');

  /* ---- 3. 斩落术法：贴身的两颗敌弹被一剑扫掉 ---- */
  const deflect = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('wujian');
    const p = G.player;
    p.x = 190; p.y = 168; p.invuln = 99999;
    G.enemies.length = 0;
    for (let i = 0; i < 2; i++) {
      const e = new Enemy('guixiu', 300 + i * 40, 120 + i * 90, 1);
      e.spawnT = 0; e.speed = 0; e.cd = 99999; G.enemies.push(e);
    }
    // 贴着玩家飞来的敌方术法（22 / 40px，都在斩落圈 52px 内）
    G.bullets.push(new Bullet(p.x + 22, p.y - 10, 0, 0, { friendly: false, r: 4, dmg: 1 }));
    G.bullets.push(new Bullet(p.x + 40, p.y + 12, 0, 0, { friendly: false, r: 4, dmg: 1 }));
    const before = G.bullets.length;
    input.mouseSeen = true; input.mx = 430; input.my = 168;
    input.mouseDown = true;
    G.update();
    G.draw();
    return { before: before, after: G.bullets.filter(b => !b.dead).length };
  });
  console.log('斩落：', deflect.before, '颗 →', deflect.after, '颗');
  await shot('_preview_wj_deflect.png');

  await Promise.race([browser.close(), new Promise(x => setTimeout(x, 3000))]);
  process.exit(0);
})();
