'use strict';
/* 蓄势期的取舍：接招（第三段待发）与起手（第一段待发）一样会被贴脸的小怪摸断，
   两张图的蓄势条都会当场清空 —— 无敌只留在五连斩的收招余韵上，不在蓄势里。 */
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

  const run = (stageNo, tag) => page.evaluate(({ stageNo, tag }) => {
    const G = window.Game;
    G.newRun('wujian');
    const p = G.player;
    p.giveUlt('wujian'); p.ultCd = 0; p.invuln = 0;
    p.x = 240; p.y = 160;
    G.enemies.length = 0;
    // 四只贴身小怪：短冷却 + 碰撞伤害，条件反射地一直摸你
    [[-20, -20], [20, -20], [-20, 20], [20, 20]].forEach(([dx, dy]) => {
      const e = new Enemy('xiesui', p.x + dx, p.y + dy, 1);
      e.spawnT = 0; e.maxHp = 99999; e.hp = 99999;
      e.speed = 0; e.cd = 20; e.touch = 1;
      G.enemies.push(e);
    });
    p.wjStage = stageNo; p.wjChainT = 999;
    input.mouseSeen = true; input.mx = 400; input.my = 160;
    G.useUlt();
    for (let i = 0; i < 14; i++) { G.update(); p.takeDamage(1, G); }   // 边蓄边挨打
    G.draw();
    return {
      tag, 段位待发: p.wjStage + 1, 蓄势: +p.wjChargeT.toFixed(1),
      蓄势中: p.wjCharging, 血量: p.hp, invuln: p.invuln, 冷却: Math.round(p.ultCd)
    };
  }, { stageNo, tag });

  console.log('接招期（第三段待发）挨打：', JSON.stringify(await run(2, 'chain')));
  await shot('_preview_flurry_chain.png');

  console.log('起手（第一段待发）挨打：', JSON.stringify(await run(0, 'opening')));
  await shot('_preview_flurry_opening.png');

  await Promise.race([browser.close(), new Promise(x => setTimeout(x, 3000))]);
  process.exit(0);
})();
