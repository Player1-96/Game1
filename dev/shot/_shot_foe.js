'use strict';
/* 后四层新增的 5 种小怪 + 3 位头目 —— 现场截图（2 张）
   图一：五种小怪各自的机制同时亮着（激光蓄力 / 玄铁弹 / 落点圈 / 旋盾 / 影魅现形）
   图二：三位新头目各自的名场面（裂变母弹 / 缺口环 / 鳞罩 + 横扫）
   只负责「把状态摆好再按一帧」，不做断言 —— 判定归 _t_foe.js。 */
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
  const stage = await page.$('#stage');
  const shot = async f => { await stage.screenshot({ path: path.join(OUT, f) }); console.log('saved', f); };

  const clean = () => page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    G.state = 'play';
    G.room.cleared = true;
    G.enemies.length = 0; G.bullets.length = 0; G.hazards.length = 0; G.beams.length = 0;
    G.particles.length = 0; G.floaters.length = 0; G.dnums.length = 0;
    G.itemPopup = null;
    if (G.updateOverlay) G.updateOverlay();
    const p = G.player;
    p.invuln = 9999; p.hp = p.maxHP;
    p.x = 240; p.y = 230;
  });

  /* ---------- 图一：五种小怪机制同框 ---------- */
  await clean();
  const foes = await page.evaluate(() => {
    const G = window.Game;
    const log = [];
    // 玄光瞳：推到最后锁定前夕，光路已经很亮但尚未出膛
    const a = new Enemy('xuanguang', 96, 90, 1);
    a.spawnT = 0; a.cd = 1; a.speed = 0;
    G.enemies.push(a);
    for (let i = 0; i < BEAM.warn - BEAM.lock - 4; i++) G.update();
    // 铁魄妖：先架好两枚玄铁弹在身前
    const b = new Enemy('tiehun', 384, 74, 1);
    b.spawnT = 0; b.cd = 99999; b.speed = 0;
    G.enemies.push(b);
    G.bullets.push(G.spawnEnemyBullet(352, 128, -1.6, 0.5, 'iron', { hard: true, r: 7, life: 300 }));
    G.bullets.push(G.spawnEnemyBullet(348, 152, -1.6, 1.0, 'iron', { hard: true, r: 7, life: 300 }));
    // 蹦山魈：停在蓄势里，落点圈正收紧
    const c = new Enemy('bengyao', 176, 250, 1);
    c.spawnT = 0; c.cd = 1;
    G.enemies.push(c);
    for (let i = 0; i < 6; i++) G.update();
    c.stateT = 14;                                // 圈收到一半，读得清「还剩多久」
    // 玄甲卫：两片护盾转到斜角，缺口朝下
    const d = new Enemy('xuanjia', 300, 232, 1);
    d.spawnT = 0; d.shieldA = -0.75;
    G.enemies.push(d);
    // 影魅：一只已现形扑来、一只仍在隐身处只留一点幽火
    const e = new Enemy('yingmo', 172, 130, 1);
    e.spawnT = 0; e.hidden = false; e.revealT = 80;
    G.enemies.push(e);
    const f = new Enemy('yingmo', 420, 262, 1);
    f.spawnT = 0;
    G.enemies.push(f);
    for (let i = 0; i < 3; i++) G.update();
    a.state = 1; a.stateT = BEAM.lock - 3;         // 钉回「即将发射」
    for (const x of G.beams) x.t = x.warn - 3;
    G.draw();
    for (const x of G.enemies) log.push(x.type + (x.hidden ? '(隐)' : ''));
    return log;
  });
  console.log('图一场上：', foes.join(' / '));
  await shot('_preview_foes.png');

  /* ---------- 图二：三位新头目 ---------- */
  const bossShot = async (kind, file, setup) => {
    await clean();
    const info = await page.evaluate(({ kind, setup }) => {
      const G = window.Game;
      G.state = 'play';
      G.room.type = 'boss';
      const b = new Boss(kind, 240, 92, 1);
      b.spawnT = 0;
      b.cd = 99999; b.cd3 = 99999; b.spd = 0;
      G.enemies.push(b);
      G.bossRef = b;
      b.maxHp = b.hp = 999;                        // 只取一张定妆照，别让血条空着
      const out = { kind: b.kind, name: b.name };
      eval(setup);                                  // 每个头目自己的摆拍脚本
      G.draw();
      out.notes = window.__notes || [];
      return out;
    }, { kind, setup });
    console.log(file + ' →', info.name, info.notes.join(' / '));
    await shot(file);
  };

  await bossShot('liesha', '_preview_boss_liesha.png', `
    b.cd = 99999;
    // 手摆三档弹幕：母弹刚裂出中弹，中弹中又裂出小弹
    const base = Math.atan2(G.player.y - b.y, G.player.x - b.x);
    G.spawnEnemyBullet(b.x, b.y - 10, Math.cos(base + 0.5) * 1.9, Math.sin(base + 0.5) * 1.9, 'flame',
      { r: 9, scale: 1.9, life: 300, splitN: 2, splitTier: 3, splitT: 40 });
    G.spawnEnemyBullet(b.x, b.y - 10, Math.cos(base - 0.4) * 1.9, Math.sin(base - 0.4) * 1.9, 'flame',
      { r: 9, scale: 1.9, life: 300, splitN: 2, splitTier: 3, splitT: 44 });
    for (const [dx, dy] of [[-74, 86], [72, 88], [-40, 118], [44, 116]]) {
      const a2 = Math.atan2(dy, dx);
      G.bullets.push(G.spawnEnemyBullet(b.x + dx * 0.4, b.y + dy * 0.4,
        Math.cos(a2) * 2.4, Math.sin(a2) * 2.4, 'blood',
        { r: 6, scale: 1.2, life: 240, splitN: 3, splitTier: 2, splitT: 30 }));
    }
    for (const [dx, dy] of [[-120, 70], [-98, 100], [104, 74], [126, 98]]) {
      const a3 = Math.atan2(dy, dx);
      G.spawnEnemyBullet(b.x + dx * 0.55, b.y + dy * 0.5, Math.cos(a3) * 2.8, Math.sin(a3) * 2.8, 'orb',
        { r: 4, scale: 0.8, life: 200 });
    }
    window.__notes = ['母弹 2 → 中弹 4 → 小弹 12'];
  `);

  await bossShot('lunhui', '_preview_boss_lunhui.png', `
    b.spiral = -Math.PI / 2;
    b.cd = 1; b.cd3 = 99999;
    G.update();                                    // 走一次 volley：放出一轮带缺口的环
    for (let k = 0; k < 26; k++) G.update();        // 让环散开一点，缺口看得清
    b.cd = 99999;
    window.__notes = ['环上留一道缺口，跑到缺口处才过得去'];
  `);

  await bossShot('zhulong', '_preview_boss_zhulong.png', `
    b.guard = 210; b.guardCd = 99999;
    b.state = 'sweep'; b.stateT = 200;
    b.startSweep(G, G.player);                     // 鳞罩 + 横扫同时架起
    const bm = G.beams[0];
    bm.t = bm.warn + Math.round(bm.fire * 0.45);   // 停在扫到一半，扇面与光都看得见
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      G.spawnEnemyBullet(b.x, b.y, Math.cos(a) * 2.6, Math.sin(a) * 2.6, 'flame', { r: 5, life: 260 });
    }
    window.__notes = ['鳞罩期间打不动，罩起即横扫'];
  `);

  await Promise.race([browser.close(), new Promise(x => setTimeout(x, 3000))]);
  process.exit(0);
})();
