'use strict';
/* 本轮两项改动：
   1) 伤害数字 —— 暴击朱红大字（带弹跳 / 描边 / 命中环 / 「!」），普通清色小字
   2) Boss 房小怪不掉灵石（无限召唤不再是刷钱口子） */
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

  /* 搭场景：一排厚靶落在剑罡的扇面里（弧半角 ~53°、射程 46+体型） */
  const setup = crit => page.evaluate(c => {
    const G = window.Game;
    G.newRun('wujian');
    const p = G.player;
    p.x = 200; p.y = 170; p.invuln = 99999;
    p.stats.crit = c;                       // 1 = 必定暴击；0 = 永不暴击
    p.stats.damage = c ? 8 : 5;
    G.enemies.length = 0;
    [[244, 170], [232, 142], [232, 198], [216, 152]].forEach(([x, y]) => {
      const e = new Enemy('guixiu', x, y, 1);
      e.spawnT = 0; e.maxHp = 99999; e.hp = 99999;
      e.speed = 0; e.cd = 99999; e.touch = 0;
      G.enemies.push(e);
    });
    input.mouseSeen = true; input.mx = 430; input.my = 170;
    input.mouseDown = true;
    return true;
  }, crit);

  /* ---- 1. 暴击：朱红大字 ---- */
  await setup(1);
  const crit = await page.evaluate(() => {
    const G = window.Game;
    for (let i = 0; i < 16; i++) { G.player.invuln = 99999; G.update(); }
    G.draw();
    return { 数字: G.dnums.length, 暴击: G.dnums.filter(d => d.crit).length };
  });
  console.log('暴击场面：', JSON.stringify(crit));
  await shot('_preview_dnum_crit.png');

  /* ---- 2. 对照：同一场景不暴击，只有清色小字 ---- */
  await setup(0);
  const plain = await page.evaluate(() => {
    const G = window.Game;
    for (let i = 0; i < 14; i++) { G.player.invuln = 99999; G.update(); }
    G.draw();
    return { 数字: G.dnums.length, 暴击: G.dnums.filter(d => d.crit).length };
  });
  console.log('普通对照：', JSON.stringify(plain));
  await shot('_preview_dnum_plain.png');

  /* ---- 4. Boss 房：斩杀召唤小怪，地上不该有灵石 ---- */
  const boss = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    let br = null;
    for (const r of G.floor.rooms.values()) if (r.type === 'boss') br = r;
    G.enterRoom(br, null);
    G.doorLock = 0;
    G.player.x = 120; G.player.y = 250; G.player.invuln = 99999;
    G.player.stats.greed = 8;                     // 连「贪心」这条额外产出口一起验
    const pool0 = G.room.coinPool;
    for (let i = 0; i < 14; i++) {                // 复刻尊者的无限召唤
      const e = new Enemy('yinsha', 110 + (i % 5) * 55, 90 + ((i / 5) | 0) * 40, 1);
      e.spawnT = 0; G.enemies.push(e); e.die(G);
    }
    for (let i = 0; i < 10; i++) G.update();
    G.draw();
    return {
      配额: pool0, 配额剩余: G.room.coinPool,
      场上灵石: G.pickups.filter(k => k.kind === 'coin').reduce((s, k) => s + k.value, 0),
      灵力珠: G.pickups.filter(k => k.kind === 'mp').length
    };
  });
  console.log('Boss 房：', JSON.stringify(boss));
  await shot('_preview_boss_nocoin.png');

  await Promise.race([browser.close(), new Promise(x => setTimeout(x, 3000))]);
  process.exit(0);
})();
