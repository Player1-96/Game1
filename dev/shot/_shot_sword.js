'use strict';
/* 出图：四种单位并排对比，用于分辨「精英死后生成的小剑灵」与「阴煞分裂的小阴煞」。
   从左到右：普通剑灵 · 普通阴煞 · 精英死后的小剑灵 · 阴煞死后的小阴煞 */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 820 }, deviceScaleFactor: 2 });
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(250);

  const info = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    G.state = 'play';
    const p = G.player;
    p.x = 240; p.y = 285; p.invuln = 99999;
    G.enemies.length = 0; G.bullets.length = 0; G.hazards.length = 0;

    const mk = (type, x, y, small) => {
      const e = new Enemy(type, x, y, 1);
      e.spawnT = 0; e.speed = 0; e.cd = 99999; e.touch = 0; e.eCd = 99999;
      if (small) { e.small = true; e.maxHp = 6; e.hp = 6; }
      G.enemies.push(e);
      return { type, small: !!small, spr: e.def.spr, ai: e.def.ai, r: e.r, x: e.x, y: e.y };
    };

    const list = [
      mk('jianling', 96, 96, false),
      mk('yinsha', 192, 96, false),
      mk('jianling', 288, 96, true),
      mk('yinsha', 384, 96, true)
    ];
    for (let i = 0; i < 40; i++) G.update();
    G.input.mouseDown = false;
    G.draw();
    return list;
  });

  const cv = await page.$('#game');
  await cv.screenshot({ path: path.join(OUT, '_preview_sword_compare.png') });

  console.log('已出图: _preview_sword_compare.png');
  console.log('画面从左到右：');
  info.forEach((e, i) => {
    console.log(`  ${i + 1}. ${e.type}${e.small ? '（small）' : ''}  spr=${e.spr}  ai=${e.ai}  r=${e.r}  世界坐标 x=${e.x}`);
  });

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
