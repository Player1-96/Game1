'use strict';
/* 难度梯度改造的美术 / 表现验证：
   精英窟（墙上有裂缝）、Boss 法器二选一、法宝进阶弹窗 */
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

  // 1) 精英窟：清场后墙上的裂缝（密室入口）
  const info = await page.evaluate(() => {
    const G = window.Game;
    for (let i = 0; i < 60; i++) {
      G.newRun('jujian');
      G.newFloor(3);
      const el = [...G.floor.rooms.values()].find(r => r.elite);
      const sec = [...G.floor.rooms.values()].find(r => r.type === RT.SECRET);
      if (!el || !sec) continue;
      G.enterRoom(el, null);
      G.player.x = 240; G.player.y = 210;
      for (const e of G.enemies) { e.spawnT = 0; e.hurt(99999, G); }
      G.enemies.length = 0;
      for (let k = 0; k < 10; k++) { G.player.invuln = 9999; G.update(); }
      // 站在裂缝墙那侧，让裂缝进入取景
      const d = [0, 1, 2, 3].find(d => el.doorHidden[d]);
      if (d === 0) { G.player.x = 240; G.player.y = 60; }
      if (d === 2) { G.player.x = 240; G.player.y = 260; }
      if (d === 3) { G.player.x = 60; G.player.y = 160; }
      if (d === 1) { G.player.x = 420; G.player.y = 160; }
      G.draw();
      return { elite: el.elite, name: ELITE_DEF[el.elite].name, crackDir: d, secret: sec.key };
    }
    return null;
  });
  console.log('精英窟 / 密室裂缝：', JSON.stringify(info));
  await shot('_preview_dyn_elite_crack.png');

  // 2) Boss 法器二选一
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    G.enemies.length = 0; G.props.length = 0;
    G.onBossDead();
    G.player.x = 240; G.player.y = 120; G.player.invuln = 99999;
    for (let i = 0; i < 40; i++) G.update();
    G.draw();
  });
  await shot('_preview_dyn_boss_pick.png');

  // 3) 法宝进阶弹窗（混元珠·二重）
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    const p = G.player;
    p.give('hunyuan', G);
    p.give('hunyuan', G);
    G.itemPopup = { def: ITEM_MAP.hunyuan, t: 160, rank: 1 };
    for (let i = 0; i < 6; i++) G.update();
    G.draw();
  });
  await page.evaluate(() => new Promise(r => setTimeout(r, 160)));
  await shot('_preview_dyn_rank2.png');

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
