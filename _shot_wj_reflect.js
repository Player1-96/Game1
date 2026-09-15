'use strict';
/* 本轮两项改动：照影反弹（玄元镜·舞剑流形态）+ 开局自带专属技（15 秒冷却） */
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

  /* ---- 1. 照影：四颗贴身术法被一剑斩中后掉头，各奔最近的妖物 ---- */
  const reflect = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('wujian');
    const p = G.player;
    p.x = 170; p.y = 168; p.invuln = 99999;
    G.enemies.length = 0;
    // 三个方向的靶子：反弹的术法会各挑最近的一个飞回去
    [[330, 110], [120, 250], [320, 236]].forEach(([x, y], i) => {
      const e = new Enemy('guixiu', x, y, 1);
      e.spawnT = 0; e.maxHp = 9999; e.hp = 9999; e.speed = 0; e.cd = 99999; e.touch = 0;
      G.enemies.push(e);
    });
    p.give('xuanyuan', G);                      // 玄元镜 → 舞剑流下即「照影镜」
    // 贴着玩家飞来的敌方术法，四颗全在斩落圈（52px）内
    [[+24, -8], [-18, -14], [+30, +14], [-12, +20]].forEach(([dx, dy]) => {
      G.bullets.push(new Bullet(p.x + dx, p.y + dy, -2, 1, { friendly: false, r: 4, dmg: 2, life: 300 }));
    });
    const before = G.bullets.length;
    input.mouseSeen = true; input.mx = 430; input.my = 168;
    input.mouseDown = true;
    G.update();
    G.draw();
    const alive = G.bullets.filter(b => !b.dead);
    return {
      before: before,
      alive: alive.length,
      reflected: alive.filter(b => b.reflected).length,
      reflectStat: p.stats.reflect, deflectStat: p.stats.deflect
    };
  });
  console.log('照影：', JSON.stringify(reflect));
  await shot('_preview_wj_reflect.png');

  // 让反弹的术法飞一段，看它们奔着妖物去
  await page.evaluate(() => {
    const G = window.Game;
    input.mouseDown = false;
    for (let i = 0; i < 14; i++) { G.player.invuln = 99999; G.update(); }
    G.draw();
  });
  await shot('_preview_wj_reflect_2.png');

  /* ---- 2. 对照：同一场景没拿镜子，术法就地湮灭 ---- */
  const plain = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('wujian');
    const p = G.player;
    p.x = 170; p.y = 168; p.invuln = 99999;
    G.enemies.length = 0;
    [[330, 110], [120, 250], [320, 236]].forEach(([x, y]) => {
      const e = new Enemy('guixiu', x, y, 1);
      e.spawnT = 0; e.speed = 0; e.cd = 99999; e.touch = 0; G.enemies.push(e);
    });
    [[+24, -8], [-18, -14], [+30, +14], [-12, +20]].forEach(([dx, dy]) => {
      G.bullets.push(new Bullet(p.x + dx, p.y + dy, -2, 1, { friendly: false, r: 4, dmg: 2, life: 300 }));
    });
    const before = G.bullets.length;
    input.mouseSeen = true; input.mx = 430; input.my = 168;
    input.mouseDown = true;
    G.update();
    G.draw();
    return { before: before, alive: G.bullets.filter(b => !b.dead).length };
  });
  console.log('无镜对照：', JSON.stringify(plain), '（应全数湮灭）');
  await shot('_preview_wj_plain.png');

  /* ---- 3. 开局自带专属技：不手动 giveUlt，看 HUD 是否已就绪 ---- */
  const boot = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('wujian');                          // 不做任何额外操作
    const p = G.player;
    for (let i = 0; i < 12; i++) G.update();     // 让「已备」飘字刚好升到头顶
    G.draw();
    return { hasUlt: !!p.ult, name: p.ult ? ULT_DEF.wujian.name : '', cd: p.ultCd };
  });
  console.log('开局：', JSON.stringify(boot));
  await shot('_preview_wj_boot.png');

  /* ---- 4. 施展一次后的 HUD：冷却条按 15 秒走 ---- */
  const cast = await page.evaluate(() => {
    const G = window.Game;
    const p = G.player;
    p.invuln = 99999; G.enemies.length = 0;
    input.mouseSeen = true; input.mx = 430; input.my = 168;
    G.useUlt();
    for (let i = 0; i < 30; i++) G.update();     // 蓄满
    G.ultUp();
    for (let i = 0; i < 20; i++) { p.invuln = 99999; G.update(); }
    G.draw();
    return { cd: Math.round(p.ultCd), sec: +(p.ultCd / 60).toFixed(1) };
  });
  console.log('施展后：', JSON.stringify(cast));
  await shot('_preview_wj_cooldown.png');

  await Promise.race([browser.close(), new Promise(x => setTimeout(x, 3000))]);
  process.exit(0);
})();
