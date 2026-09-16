'use strict';
/* 探针：击杀返还的结算时机。
   问题：专属技能的 CD 是「进冷却之后击杀才减」，还是「连斩击杀的当下就已经在减」？
   做法：把「蓄势 → 松手突进 → 收招」逐帧跑完，记录每帧的 ultCd，
        看返还在哪一帧到账、又被哪一行赋值抹掉。
   当前行为：只有第一段写 ultCd（释放即入冷却），二/三段不重置也不清零，
        所以连招全程斩获的返还一路累积；就绪时击杀不返还也不预存。 */
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

  const out = await page.evaluate(() => {
    const G = window.Game;
    const R = {};
    const now = () => Math.round(G.player.ultCd);

    const mob = (x, y) => {
      const e = new Enemy('guixiu', x, y, 1);
      e.spawnT = 0; e.maxHp = 1; e.hp = 1; e.speed = 0; e.cd = 99999; e.touch = 0;
      G.enemies.push(e);
      return e;
    };
    const fresh = (lv) => {
      G.newRun('wujian');
      const p = G.player;
      p.x = 150; p.y = 170; p.invuln = 999999;
      for (let i = 0; i < lv; i++) p.learnPath('haste');
      G.enemies.length = 0;
      input.mouseSeen = true; input.mx = 470; input.my = 170; input.mouseDown = false;
      return p;
    };
    /* 按住 → 蓄满 → 松手，跑完「突进 + 收招五连斩」，逐帧记 ultCd */
    const swing = (p) => {
      const tr = [];
      input.mouseDown = true; G.useUlt();
      let g = 0;
      while (!p.wjFull && g++ < 300) { p.invuln = 999999; G.update(); }
      input.mouseDown = false; G.ultUp();
      tr.push(['突进起', now()]);
      let f = 0;
      while ((p.dashing || p.dashFlurry > 0) && f++ < 400) {
        p.invuln = 999999;
        G.update();
        tr.push([f, now(), p.wjStage]);
      }
      tr.push(['毕', now(), p.wjStage]);
      return tr;
    };

    R.state = G.state;

    /* ---------- A. 一段：突进路径上 2 只小怪 ---------- */
    let p = fresh(3);
    R.perKill = ultKillRefund(p.ult, 'wujian');
    R.A_cdAtRest = now();
    mob(240, 170); mob(290, 170);
    R.A = swing(p);
    // 突进结束后（一段命中会把 CD 清 0）再杀一只，看还会不会返
    mob(210, 130).die(G);
    R.A_cdAfterCombo = now();

    /* ---------- B. 就绪 / 剩余不足时的结算 ---------- */
    p = fresh(3);
    p.ultCd = 0; mob(210, 130).die(G);
    R.B_ready = now();                       // 技能就绪时击杀
    p.ultCd = 60; mob(210, 130).die(G); mob(210, 130).die(G);
    R.B_short = now();                       // 只剩 60 帧时连杀 2 只（每只 240）

    /* ---------- C. 完整三段，三段收招时周围摆 3 只 ---------- */
    p = fresh(3);
    mob(240, 170);
    R.C1 = swing(p);
    R.C1_end = { cd: now(), stage: p.wjStage, chain: p.wjChainT };

    p.x = 150; p.y = 170; G.enemies.length = 0;
    mob(240, 170);
    R.C2 = swing(p);
    R.C2_end = { cd: now(), stage: p.wjStage, chain: p.wjChainT };

    p.x = 150; p.y = 170; G.enemies.length = 0;
    mob(320, 150); mob(340, 190); mob(310, 180);
    R.C3 = swing(p);
    R.C3_end = { cd: now(), stage: p.wjStage, 存活: G.enemies.filter(e => !e.dead).length };

    /* ---------- D. 连招结束后 CD 正在走的时候击杀 ---------- */
    p.ultCd = 900; mob(210, 130).die(G);
    R.D = now();

    return R;
  });

  console.log('state =', out.state, ' 满级每杀返还 =', out.perKill, '帧');
  console.log('\n【A】一段：突进路径上 2 只小怪');
  console.log('  释放前 CD =', out.A_cdAtRest);
  console.log('  逐帧 [帧, CD, 段数]：', JSON.stringify(out.A));
  console.log('  收招后再杀 1 只 → CD =', out.A_cdAfterCombo);

  console.log('\n【B】就绪 / 剩余不足时击杀');
  console.log('  CD=0 时击杀 →', out.B_ready, '（0 = 不预存）');
  console.log('  CD=60 时连杀 2 只 →', out.B_short, '（0 = 不透支）');

  console.log('\n【C】完整三段');
  console.log('  一段后:', JSON.stringify(out.C1_end), JSON.stringify(out.C1));
  console.log('  二段后:', JSON.stringify(out.C2_end), JSON.stringify(out.C2));
  console.log('  三段后:', JSON.stringify(out.C3_end));
  console.log('  三段逐帧：', JSON.stringify(out.C3));

  console.log('\n【D】连招结束后（CD=900）击杀 1 只 →', out.D);

  await Promise.race([browser.close(), new Promise(x => setTimeout(x, 3000))]);
  process.exit(0);
})();
