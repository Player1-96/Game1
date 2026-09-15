'use strict';
/* 本轮两项改动：
   1) 舞剑流「剑意不绝」改为击杀返还冷却（2/3/4 秒）+ HUD 上的返还反馈
   2) 头目一阶段 45 秒软时限（到点强制转二阶段） */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname);

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  // deviceScaleFactor 拉高，专供右上角专属格的特写（element.screenshot 会忽略 clip）
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 3 });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(250);
  const stage = await page.$('#stage');
  const box = await stage.boundingBox();
  const shot = async (f, clip) => {
    if (clip) await page.screenshot({ path: path.join(OUT, f), clip });
    else await stage.screenshot({ path: path.join(OUT, f) });
    console.log('saved', f);
  };
  /* 右上角专属格特写：图标在 480×320 的 (452,4)，取右侧 12% 宽、上侧 17% 高 */
  const iconClip = {
    x: box.x + box.width * 0.88, y: box.y,
    width: box.width * 0.12, height: box.height * 0.17
  };

  /* ---- 搭场景：一只靶妖站在剑罡范围内，击杀前把专属冷却停在图标中段 ---- */
  const setup = lv => page.evaluate(l => {
    const G = window.Game;
    G.newRun('wujian');
    const p = G.player;
    p.x = 200; p.y = 170; p.invuln = 99999;
    for (let i = 0; i < l; i++) p.learnPath('haste');   // 学满 3 级 = 每杀返 240 帧
    p.ultCd = 600;                                       // 停在冷却条中段，好看出「跳了一截」
    G.enemies.length = 0;
    const e = new Enemy('guixiu', 232, 170, 1);
    e.spawnT = 0; e.maxHp = 99999; e.hp = 99999;
    e.speed = 0; e.cd = 99999; e.touch = 0;
    G.enemies.push(e);
    input.mouseSeen = true; input.mx = 430; input.my = 170;
    input.mouseDown = true;
    return { refund: ultKillRefund(p.ult, 'wujian'), cd: p.ultCd };
  }, lv);

  /* ---- 1. 击杀返还：冷却条缩掉一截 + 青线 + 「−4 秒」 ---- */
  await setup(3);
  const on = await page.evaluate(() => {
    const G = window.Game;
    G.enemies[0].hurt(99999, G);            // 一刀斩了
    G.draw();
    return { 冷却: Math.round(G.player.ultCd), 高亮: G.player.ultCdFlash };
  });
  console.log('击杀返还：', JSON.stringify(on));
  await shot('_preview_killcd_on.png');
  await shot('_preview_killcd_icon.png', iconClip);

  /* ---- 2. 对照：没学这条线，击杀后冷却条纹丝不动 ---- */
  await setup(0);
  const off = await page.evaluate(() => {
    const G = window.Game;
    G.enemies[0].hurt(99999, G);
    G.draw();
    return { 冷却: Math.round(G.player.ultCd), 高亮: G.player.ultCdFlash };
  });
  console.log('无这条线：', JSON.stringify(off));
  await shot('_preview_killcd_off.png');
  await shot('_preview_killcd_icon_off.png', iconClip);

  /* ---- 3. 魔窟：不打尊者，站到第 45 秒，一阶段被强制掀掉 ---- */
  const p1 = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('wujian');
    let br = null;
    for (const r of G.floor.rooms.values()) if (r.type === 'boss') br = r;
    G.enterRoom(br, null);
    G.doorLock = 0;
    G.player.invuln = 999999;
    const b = G.enemies.find(e => e.hp !== undefined && e.phase !== undefined);
    if (!b) return { 无头目: true };
    const limit = BOSS_P1_LIMIT;
    let f = 0;
    while (b.phase === 1 && f < limit + 400) { G.update(); G.player.invuln = 999999; f++; }
    G.draw();
    return { 限时: limit, 实际帧: f, 秒: +(f / 60).toFixed(1), 阶段: b.phase, 状态: b.state,
             无敌: b.invuln, 爪牙: G.enemies.filter(e => e !== b && !e.dead).length,
             灵力珠: G.pickups.filter(k => k.kind === 'mp').length };
  });
  console.log('一阶段软时限：', JSON.stringify(p1));
  await shot('_preview_boss_p1limit.png');

  await Promise.race([browser.close(), new Promise(x => setTimeout(x, 3000))]);
  process.exit(0);
})();
