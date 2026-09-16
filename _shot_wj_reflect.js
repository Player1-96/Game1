'use strict';
/* 照影镜的反弹方向按镜阶分流：一、二重 180° 原路回敬，满三重才自寻最近的妖物 */
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

  /* ---- 1. 照影：靶子全在右侧、术法自左侧飞来 —— 追不追敌一眼可辨 ---- */
  const reflectCase = rank => page.evaluate(r => {
    const G = window.Game;
    G.newRun('wujian');
    const p = G.player;
    p.x = 200; p.y = 168; p.invuln = 99999;
    G.enemies.length = 0;
    [[402, 80], [398, 252], [344, 168]].forEach(([x, y]) => {
      const e = new Enemy('guixiu', x, y, 1);
      e.spawnT = 0; e.maxHp = 9999; e.hp = 9999; e.speed = 0; e.cd = 99999; e.touch = 0;
      G.enemies.push(e);
    });
    for (let i = 0; i < r; i++) p.give('xuanyuan', G);   // 玄元镜 → 舞剑流下即「照影镜」
    // 自左侧朝玩家飞来的术法，全在斩落圈（52px）内
    [[-26, -6], [-22, 12], [-24, -20]].forEach(([dx, dy]) => {
      G.bullets.push(new Bullet(p.x + dx, p.y + dy, 2.4, 1, { friendly: false, r: 4, dmg: 2, life: 300 }));
    });
    input.mouseSeen = true; input.mx = 440; input.my = 168;
    input.mouseDown = true;
    G.update();
    input.mouseDown = false;
    const dirs = G.bullets.filter(b => b.reflected).map(b => [+b.vx.toFixed(1), +b.vy.toFixed(1)]);
    for (let i = 0; i < 16; i++) { G.player.invuln = 99999; G.update(); }
    G.draw();
    // 反弹后跑一段，看它们落在玩家哪一侧：x 比玩家小 = 原路飞走，x 大 = 折回来追敌
    return {
      rank: r, reflect: p.stats.reflect, dirs,
      side: G.bullets.filter(b => b.reflected && !b.dead).map(b => b.x < p.x ? '原路' : '追敌')
    };
  }, rank);

  const lv1 = await reflectCase(1);
  console.log('一重照影：', JSON.stringify(lv1));
  await shot('_preview_wj_reflect_lv1.png');

  const lv3 = await reflectCase(3);
  console.log('三重照影：', JSON.stringify(lv3));
  await shot('_preview_wj_reflect_lv3.png');

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
