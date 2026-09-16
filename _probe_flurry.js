'use strict';
/* 探针：三段「剑影三叠」的抗打断。
   用户反馈「五刀砍出来之前有可能会被打断，伤害打不出来」。
   实测发现根因不在五连斩（那段本来就全程无敌），而在「蓄势半秒」：
   接招时人已贴在怪堆里，被杂兵摸一下就是剑势溃散 + 技能进完整冷却，第三段根本放不出来。
   本脚本对照三条路径：
     A 起手蓄势（wjStage = 0）挨打 —— 应保留赌注：溃散、技能进 CD
     B 接招蓄势（wjStage = 1）挨打 —— 应免伤、不溃散
     C 第三段接招中连续挨打后松手 —— 五连斩应完整砍出 5 刀
   另附空旷 / 贴墙两种落点，确认突进撞墙也照样接得上五连斩。 */
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
  await page.waitForTimeout(200);

  /* ---- A：起手蓄势挨打（赌注应保留） ---- */
  const a = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('wujian');
    const p = G.player;
    p.giveUlt('wujian'); p.ultCd = 0; p.invuln = 0;
    p.wjStage = 0; p.wjChainT = 0;
    G.enemies.length = 0;
    input.mouseSeen = true; input.mx = 300; input.my = 160;
    G.useUlt();
    const was = p.wjCharging;
    p.takeDamage(1, G);
    return { wasCharging: was, charging: p.wjCharging, cd: Math.round(p.ultCd), stage: p.wjStage };
  });
  console.log('A 起手蓄势挨打：', JSON.stringify(a), '（期望 charging=false、cd=900、stage=0 —— 赌注保留）');

  /* ---- B：接招蓄势（第二段待发）挨打若干次 ---- */
  const b = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('wujian');
    const p = G.player;
    p.giveUlt('wujian'); p.ultCd = 0; p.invuln = 0;
    G.enemies.length = 0;
    p.wjStage = 1; p.wjChainT = 999;
    input.mouseSeen = true; input.mx = 300; input.my = 160;
    G.useUlt();
    const invs = [], hps = [];
    for (let i = 0; i < 12; i++) {
      G.update();                         // 玩家 tick 先跑（含续无敌）
      p.takeDamage(1, G);                 // 敌人在其后结算伤害
      invs.push(p.invuln); hps.push(p.hp);
    }
    return { invs, hps, charging: p.wjCharging, cd: Math.round(p.ultCd), stage: p.wjStage };
  });
  console.log('B 接招蓄势挨打：', `蓄势中=${b.charging} 段位=${b.stage} cd=${b.cd}`,
    `| 蓄势期 invuln=${b.invs.join(',')}（期望恒 > 0）`,
    `| 血量 ${b.hps[0]}→${b.hps[b.hps.length - 1]}（期望不掉）`);

  /* ---- C：第三段接招中连续挨打，仍要砍满五刀 ---- */
  for (const [label, nearWall] of [['空旷处', false], ['贴墙（突进撞墙收势）', true]]) {
    const c = await page.evaluate(({ nearWall }) => {
      const G = window.Game;
      G.newRun('wujian');
      const p = G.player;
      p.giveUlt('wujian'); p.ultCd = 0; p.invuln = 0;
      p.x = nearWall ? 430 : 150; p.y = 160;
      G.enemies.length = 0;
      const tg = new Enemy('guixiu', p.x + 70, 160, 1);     // 厚靶：数五连斩刀数
      tg.spawnT = 0; tg.maxHp = 999999; tg.hp = 999999;
      tg.speed = 0; tg.cd = 99999; tg.touch = 0;
      G.enemies.push(tg);
      p.wjStage = 2; p.wjChainT = 999;                      // 第三段待发
      input.mouseSeen = true; input.mx = nearWall ? 470 : 300; input.my = 160;
      G.useUlt();
      for (let i = 0; i < 30; i++) { G.update(); p.takeDamage(1, G); }   // 蓄势全程持续挨打
      const stillCharging = p.wjCharging, hpMid = p.hp;
      G.ultUp();
      const dashStage = p.dashStage, dashT0 = p.dashT;
      let prev = tg.hp, hits = 0, risk = 0;
      for (let i = 0; i < 90; i++) {
        G.update();
        if ((p.dashing || p.dashFlurry > 0) && p.invuln <= 0) risk++;
        tg.x = p.x + 34; tg.y = p.y;
        if (tg.hp < prev) { hits++; prev = tg.hp; }
        if (!p.dashing && p.dashFlurry <= 0) break;
      }
      return { stillCharging, hpMid, dashStage, dashT0, hits, risk, graceInv: p.invuln, stage: p.wjStage };
    }, { nearWall });
    console.log(`C 第三段接招（${label}）：蓄势中=${c.stillCharging} 中途血=${c.hpMid} · 突进段位 ${c.dashStage} / ${c.dashT0} 帧`);
    console.log(`   五连斩砍出 ${c.hits} 刀（期望 5）· 技能期 invuln<=0 的帧 ${c.risk}（期望 0）· 收招余韵 ${c.graceInv} 帧 · 收招段位 ${c.stage}`);
  }

  await Promise.race([browser.close(), new Promise(x => setTimeout(x, 3000))]);
  process.exit(0);
})();
