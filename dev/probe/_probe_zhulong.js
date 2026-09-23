/* ① 完整战斗实测：模拟玩家持续输出，把烛龙从满血打到死，记录 phase / state / guard / age 全序列 */
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 820 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(200);

  const run = async (diffIdx) => page.evaluate((di) => {
    const G = window.Game;
    const out = { events: [], sweeps: 0, guardFrames: 0, aliveFrames: 0 };
    G.openChallMenu();
    G.challMenu.step = 'diff'; G.challMenu.bossId = 'zhulong'; G.challMenu.idx = di;
    G.challConfirm();
    G.chall.upgrades = 0; G.pick = null;
    const b = G.bossRef;
    b.spawnT = 0;
    out.maxHp = b.maxHp;
    const origSP = b.setPhase.bind(b);
    b.setPhase = function (np, g) {
      out.events.push({ t: b.t, from: b.phase, to: np, hpPct: +(b.hp / b.maxHp).toFixed(3), age: b.age, guard: b.guard });
      return origSP(np, g);
    };
    const origSweep = b.startSweep.bind(b);
    b.startSweep = function (g, p) { out.sweeps++; out.events.push({ t: b.t, ev: 'sweep', hpPct: +(b.hp / b.maxHp).toFixed(3), age: b.age }); return origSweep(g, p); };
    // 模拟玩家输出：每帧扣 dps/60 血，避开无敌帧（用 hurt 走正常通道）
    const dps = di === 2 ? 120 : 90;
    let per = dps / 60;
    let lastPhase = 1;
    for (let i = 0; i < 9000; i++) {
      G.player.invuln = 999999;              // 玩家别死，专心测 Boss
      per = dps / 60;
      b.invuln = 0;                          // 跳过转阶段无敌，模拟玩家等无敌结束再打
      if (!b.dead && b.guard <= 0) b.hurt(per, G, null, false);
      G.update();
      if (b.guard > 0) out.guardFrames++;
      if (!b.dead) aliveFramesPlus(out);
      if (b.phase !== lastPhase) { out.events.push({ t: b.t, ev: 'phaseChange', from: lastPhase, to: b.phase, hpPct: +(b.hp / b.maxHp).toFixed(3), age: b.age }); lastPhase = b.phase; }
      if (b.dead) break;
    }
    function aliveFramesPlus(o) { o.aliveFrames++; }
    out.final = { dead: b.dead, hp: Math.round(b.hp), t: b.t, age: b.age, phase: b.phase };
    out.guardPct = +(out.guardFrames / Math.max(1, out.aliveFrames)).toFixed(3);
    return out;
  }, diffIdx);

  for (const di of [0, 2]) {
    const r = await run(di);
    console.log('=== 难度 ' + ['险', '危', '绝'][di] + ' ===');
    console.log('  maxHp=' + r.maxHp + '  存活 ' + r.aliveFrames + ' 帧  ' +
      '结罩占 ' + r.guardFrames + ' 帧 (' + (r.guardPct * 100).toFixed(0) + '%)  结罩次数 ' + r.sweeps);
    console.log('  final: ' + JSON.stringify(r.final));
    console.log('  事件序列:');
    r.events.slice(0, 24).forEach(e => console.log('     ' + JSON.stringify(e)));
    if (r.events.length > 24) console.log('     ...共 ' + r.events.length + ' 条');
    console.log('');
  }
  console.log('页面错误: ' + (errs.length ? errs.join(' | ') : '无'));
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
