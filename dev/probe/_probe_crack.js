'use strict';
/* 探针：舞剑流近战劈裂缝墙，逐帧看攻击到底有没有发生。
   关注三个量：挥砍特效（G.slashes）、玩家后摇（p.shootCd）、门的血量（room.doorHp[0]）。 */
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(200);

  const out = await page.evaluate(() => {
    const G = window.Game;
    const res = {};
    G.newRun('wujian');
    G.state = 'play';
    G.room.cleared = true;
    G.enemies.length = 0; G.bullets.length = 0; G.hazards.length = 0;
    const p = G.player;
    p.invuln = 9999; p.hp = p.maxHP;
    const rm = G.room;
    rm.doors[0] = true; rm.doorHidden[0] = true; rm.doorOpen[0] = false; rm.doorHp[0] = 3;
    p.x = 240; p.y = 40;
    res.time = G.tick;
    res.doorRect = G.floor.doorRect(0);
    res.playerPos = [Math.round(p.x), Math.round(p.y)];
    res.reach = STYLES.wujian.consts.reach + (p.stats.range - 210) * STYLES.wujian.consts.rangePer;
    res.arc = STYLES.wujian.consts.arc + p.stats.spread * STYLES.wujian.consts.spreadArc;
    res.crackDirFacingWall = G.crackHitSwing(p.x, p.y, res.reach, -Math.PI / 2, res.arc);
    res.crackDirBackToWall = G.crackHitSwing(p.x, p.y, res.reach, Math.PI / 2, res.arc);
    res.doorHpAfterProbe = rm.doorHp[0];

    /* 主循环里的 attack 只认真实鼠标事件（input.shooting 会被 computeAim 当场清掉），
       所以按帧喂一份合成输入；节奏仍由 shootCd 把关。 */
    const swing = (frames, ang) => {
      const trace = [];
      const inp = { shooting: true, aiming: true, aimAngle: ang };
      for (let i = 0; i < frames; i++) {
        G.update();
        const hpBefore = rm.doorHp[0];
        STYLES.wujian.attack(p, G, inp);
        if (rm.doorHp[0] !== hpBefore || i % 10 === 0) {
          trace.push([i, hpBefore + '→' + rm.doorHp[0], G.slashes.length]);
        }
      }
      return trace;
    };
    res.wujianTrace = swing(100, -Math.PI / 2);
    res.wujianHp = rm.doorHp[0];
    res.wujianOpen = rm.doorOpen[0];

    /* 飞剑流：子弹有没有生成、有没有打到门 */
    G.newRun('feijian');
    G.state = 'play'; G.room.cleared = true;
    G.enemies.length = 0; G.bullets.length = 0;
    const q = G.player;
    q.invuln = 9999; q.hp = q.maxHP; q.x = 240; q.y = 60;
    const rm2 = G.room;
    rm2.doors[0] = true; rm2.doorHidden[0] = true; rm2.doorOpen[0] = false; rm2.doorHp[0] = 3;
    const t2 = [];
    const finp = { shooting: true, aiming: true, aimAngle: -Math.PI / 2 };
    for (let i = 0; i < 120; i++) {
      G.update();
      STYLES.feijian.attack(q, G, finp);
      if (i % 20 === 0) t2.push([i, G.bullets.length, rm2.doorHp[0]]);
    }
    res.fei = { trace: t2, hp: rm2.doorHp[0], open: rm2.doorOpen[0] };
    return res;
  });
  console.log(JSON.stringify(out, null, 1));

  await Promise.race([browser.close(), new Promise(x => setTimeout(x, 3000))]);
  process.exit(0);
})();
