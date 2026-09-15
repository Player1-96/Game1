'use strict';
/* 精英妖物美术验证：精英窟全景、精英凝形、神通释放瞬间 */
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
  const canvas = await page.$('#game');
  const shot = async f => { await canvas.screenshot({ path: path.join(OUT, f) }); console.log('saved', f); };

  // 精英窟全景（含地板符阵、精英 + 随从）
  const info = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('jujian');
    const el = [...G.floor.rooms.values()].find(r => r.elite);
    if (!el) return null;
    G.enterRoom(el, null);
    G.player.x = 150; G.player.y = 210;
    for (let i = 0; i < 70; i++) { G.player.invuln = 9999; G.update(); }
    G.draw();
    return { key: el.elite, name: ELITE_DEF[el.elite].name, mult: G.eliteMult, pool: el.coinPool };
  });
  console.log('精英窟：', JSON.stringify(info));
  await shot('_preview_elite_room.png');

  // 五只精英各自的神通瞬间（清场后单独摆放，避免其它怪干扰取景）
  const keys = await page.evaluate(() => ELITE_KEYS.map(k => [k, ELITE_DEF[k].base, ELITE_DEF[k].name]));
  for (const [key, base, name] of keys) {
    await page.evaluate(([b, ek]) => {
      const G = window.Game;
      G.newRun('jujian');
      G.enemies.length = 0; G.props.length = 0; G.hazards.length = 0; G.bullets.length = 0;
      const e = new Enemy(b, 240, 168, 1, ek);
      e.spawnT = 0; e.eCd = 1;
      G.enemies.push(e);
      G.player.x = 150; G.player.y = 242;
      for (let i = 0; i < 9; i++) { G.player.invuln = 9999; G.update(); }
      G.draw();
    }, [base, key]);
    console.log('  ' + name + ' (' + key + ')');
    await shot('_preview_elite_' + key + '.png');
  }

  // browser.close() 在本机常挂死，限时收尾即可
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
