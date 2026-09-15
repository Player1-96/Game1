'use strict';
/* 出生保护美术验证：截「刚进房 / 第二波刚刷出」的定格，
 * 好肉眼确认凝形淡入与脚下法阵的效果。 */
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
  const canvas = await page.$('#game');

  // 刚进门的头几帧：妖物正在凝形
  async function shotEnter(file, n) {
    await page.evaluate(k => {
      const G = window.Game;
      G.newRun('feijian');
      let target = null;
      for (const rr of G.floor.rooms.values()) {
        if (rr.waves && rr.waves.length && rr.waves[0].length >= 3) { target = rr; break; }
      }
      if (!target) for (const rr of G.floor.rooms.values()) if (rr.waves && rr.waves.length) { target = rr; break; }
      G.enterRoom(target, null);
      for (let i = 0; i < k; i++) G.update();
      G.draw();
    }, n);
    await canvas.screenshot({ path: file });
    console.log('saved', file);
  }

  await shotEnter('_spawn_frame2.png', 2);
  await shotEnter('_spawn_frame24.png', 24);
  await shotEnter('_spawn_frame60.png', 60);

  // 第二波刷新：把玩家挪到生成点上，看是否被推开 + 凝形
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('jujian');
    for (const rr of G.floor.rooms.values()) {
      if (!rr.waves || rr.waves.length < 2) continue;
      G.enterRoom(rr, null);
      const s = rr.waves[1].find(v => v.type !== 'boss') || rr.waves[1][0];
      G.player.x = s.x; G.player.y = s.y;
      G.enemies.length = 0;
      G.update();                 // 触发第二波
      for (let i = 0; i < 6; i++) G.update();
      G.draw();
      return;
    }
  });
  await canvas.screenshot({ path: '_spawn_wave2.png' });
  console.log('saved _spawn_wave2.png');

  // browser.close() 在本机常挂死，限时收尾即可
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
