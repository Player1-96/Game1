'use strict';
/* 经济改动美术验证：藏珍阁（木箱 + 金匣）、坊市 4 件货、清房掉落（钥匙/雷符） */
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
  const canvas = await page.$('#game');
  const shot = async f => { await canvas.screenshot({ path: path.join(OUT, f) }); console.log('saved', f); };

  // 藏珍阁：木箱 + 上锁金匣
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    let tr = null;
    for (const r of G.floor.rooms.values()) if (r.type === 'treasure') { tr = r; break; }
    tr.unlocked = true;
    G.enterRoom(tr, null);
    G.keys = 1; G.coins = 40;
    G.player.x = 240; G.player.y = 210;
    for (let i = 0; i < 40; i++) G.update();
    G.draw();
  });
  await shot('_preview_treasure.png');

  // 坊市：4 件货
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    let sh = null;
    for (const r of G.floor.rooms.values()) if (r.type === 'shop') { sh = r; break; }
    G.enterRoom(sh, null);
    G.coins = 38;
    G.player.x = 240; G.player.y = 215;
    for (let i = 0; i < 40; i++) G.update();
    G.draw();
  });
  await shot('_preview_shop.png');

  // 清房掉落：钥匙 + 雷符 + 灵石
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    for (const r of G.floor.rooms.values()) {
      if (!r.keyDrop) continue;
      G.enterRoom(r, null);
      G.doorLock = 0;
      for (const e of G.enemies) { e.spawnT = 0; e.hurt(9999, G); }
      G.enemies.length = 0;
      for (let i = 0; i < 6; i++) G.update();
      G.player.x = 240; G.player.y = 120;
      for (let i = 0; i < 20; i++) G.update();
      G.draw();
      return;
    }
  });
  await shot('_preview_drop.png');

  // browser.close() 在本机常挂死，限时收尾即可
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
