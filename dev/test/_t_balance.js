'use strict';
/* 巨剑流出手频率平衡 —— 自动化测试
 * 背景：release() 原先不设 shootCd，玩家可以「按一帧松一帧」疯狂点射，
 *       约 30 发/秒，远快于飞剑流的 2.6 发/秒，附魔特效（灼烧/引雷/暴击）刷屏。
 * 修复：出剑后摇 shootCd，按段位递减，并同样受 fireRate 折算。
 * 本测试实测两流派的可持续出手周期与单体/群战 DPS，验证平衡关系成立。
 */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const T1 = 30, T2 = 66;   // 与 entities.js 的 CHARGE 保持一致

let pass = 0, fail = 0;
const failed = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '   ' + extra : '')); }
  else { fail++; failed.push(name); console.log('  FAIL  ' + name + (extra ? '   ' + extra : '')); }
}
function sec(t) { console.log('\n=== ' + t + ' ==='); }

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 820 } });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console.error] ' + m.text()); });

  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(300);

  /* 在页面里注入通用测量器：
     hold = 蓄力帧数（按住多少帧后松手），返回可持续攻击周期与单发伤害 */
  await page.evaluate(() => {
    window.__cycle = function (style, hold, frames) {
      const G = window.Game;
      G.newRun(style);
      const inp = G.input;
      const p = G.player;
      p.x = 60; p.y = 160; p.vx = p.vy = 0;
      G.bullets.length = 0;
      inp.mx = 460; inp.my = 160; inp.mouseT = performance.now();
      let shots = 0, t = 0, dmg = 0, pierce = 0;
      /* 三态机：press 蓄力 → release 松手一帧（放出）→ wait 等后摇
         松手必须独占一帧，否则同一帧内又按下，永远触发不了释放 */
      let phase = 'press';
      for (let i = 0; i < frames; i++) {
        inp.mouseT = performance.now();
        inp.mouseDown = (phase === 'press');
        // 隔离干扰：受伤会打断蓄力，敌方弹幕会污染计数
        p.hp = p.maxHP; p.invuln = 9999;
        const before = G.bullets.filter(b => b.friendly).length;
        G.update();
        const mine = G.bullets.filter(b => b.friendly);
        if (mine.length > before) {
          const b = mine[mine.length - 1];
          dmg = b.dmg; pierce = b.pierce;
          shots++;
        }
        for (let k = G.bullets.length - 1; k >= 0; k--) {
          if (G.bullets[k].friendly) G.bullets.splice(k, 1);   // 只清己方，避免堆积干扰计数
        }
        if (phase === 'press') { t++; if (t >= hold) phase = 'release'; }
        else if (phase === 'release') phase = 'wait';
        else if (p.shootCd <= 0) { phase = 'press'; t = 0; }
      }
      inp.mouseDown = false;
      return { shots, period: shots ? frames / shots : Infinity, dmg, pierce };
    };
    window.__fireOnce = function (style, hold, rateMul) {
      const G = window.Game;
      G.newRun(style);
      if (rateMul) G.player.stats.fireRate = 2.6 * rateMul;   // 必须在 newRun 之后设
      const inp = G.input;
      G.player.x = 60; G.player.y = 160; G.player.vx = G.player.vy = 0;
      G.bullets.length = 0;
      inp.mx = 460; inp.my = 160; inp.mouseT = performance.now();
      inp.mouseDown = true;
      for (let i = 0; i < hold; i++) {
        inp.mouseT = performance.now();
        G.player.hp = G.player.maxHP; G.player.invuln = 9999;   // 防止被打断蓄力
        G.update();
      }
      inp.mouseDown = false;
      G.update();                       // 松手释放
      const b = G.bullets.filter(x => x.kind === 'jujian' || x.kind === 'sword')[0];
      return b ? { dmg: b.dmg, pierce: b.pierce, cd: G.player.shootCd, cdMax: G.player.chargeCdMax } : null;
    };
  });

  sec('T1  点射不再快过飞剑流（核心修复）');
  const base = await page.evaluate(() => ({
    fj: window.__cycle('feijian', 9999, 900),
    j0: window.__cycle('jujian', 1, 900),
    j1: window.__cycle('jujian', 32, 900),
    j2: window.__cycle('jujian', 68, 900)
  }));
  console.log('    飞剑流 hold=∞  周期 ' + base.fj.period.toFixed(1) + ' 帧/发');
  console.log('    巨剑流 点射     周期 ' + base.j0.period.toFixed(1) + ' 帧/发');
  console.log('    巨剑流 一段     周期 ' + base.j1.period.toFixed(1) + ' 帧/发');
  console.log('    巨剑流 二段     周期 ' + base.j2.period.toFixed(1) + ' 帧/发');

  ok('点射出手间隔明显慢于飞剑流',
    base.j0.period > base.fj.period,
    `巨剑 ${base.j0.period.toFixed(1)} vs 飞剑 ${base.fj.period.toFixed(1)}`);
  ok('点射周期落在 28~36 帧（不再每 2 帧一发）',
    base.j0.period >= 28 && base.j0.period <= 36, base.j0.period.toFixed(1));
  ok('一段周期落在 46~62 帧', base.j1.period >= 46 && base.j1.period <= 62, base.j1.period.toFixed(1));
  ok('二段周期落在 72~90 帧', base.j2.period >= 72 && base.j2.period <= 90, base.j2.period.toFixed(1));
  ok('周期随段位递增（蓄得越久，一击越沉）',
    base.j0.period < base.j1.period && base.j1.period < base.j2.period);
  ok('每秒出剑数已降到合理区间（点射 ≤ 2.2 发/秒）',
    60 / base.j0.period <= 2.2, (60 / base.j0.period).toFixed(2) + ' 发/秒');

  sec('T2  出剑后摇：存在、随段位递减、期间凝不住剑');
  const cds = await page.evaluate(() => ({
    c0: window.__fireOnce('jujian', 1),
    c1: window.__fireOnce('jujian', 32),
    c2: window.__fireOnce('jujian', 68)
  }));
  ok('点射留下后摇', cds.c0 && cds.c0.cd > 0, 'shootCd=' + (cds.c0 && cds.c0.cd));
  ok('后摇随段位递减',
    cds.c0.cd > cds.c1.cd && cds.c1.cd > cds.c2.cd,
    `${cds.c0.cd} > ${cds.c1.cd} > ${cds.c2.cd}`);
  ok('后摇总长已记录（供回气条绘制）',
    cds.c0.cdMax === cds.c0.cd && cds.c2.cdMax === cds.c2.cd);

  const lock = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('jujian');
    const inp = G.input;
    G.player.x = 60; G.player.y = 160;
    inp.mx = 460; inp.my = 160; inp.mouseT = performance.now();
    inp.mouseDown = true;
    G.update();                 // 起手
    inp.mouseDown = false;
    G.update();                 // 释放 → 后摇
    const cd0 = G.player.shootCd;
    inp.mouseDown = true;
    let maxT = 0;
    for (let i = 0; i < cd0 - 2; i++) { G.update(); maxT = Math.max(maxT, G.player.chargeT); }
    return { cd0, maxT, charging: G.player.charging };
  });
  ok('后摇期间按住无法累积蓄力', lock.maxT === 0, 'chargeT 峰值=' + lock.maxT);
  ok('后摇期间不处于蓄力态', lock.charging === false);

  const after = await page.evaluate(() => {
    const G = window.Game;
    const inp = G.input;
    for (let i = 0; i < 40; i++) G.update();     // 等后摇走完
    const before = G.bullets.length;
    for (let i = 0; i < 3; i++) G.update();      // 仍在按住 → 应恢复蓄力
    return { shootCd: G.player.shootCd, chargeT: G.player.chargeT, before };
  });
  ok('后摇结束后恢复可蓄力', after.shootCd === 0 && after.chargeT > 0,
    'chargeT=' + after.chargeT);

  sec('T3  单体 DPS：飞剑流仍是单体最优');
  const dps = await page.evaluate(() => {
    const G = window.Game;
    const one = {};
    for (const [k, st, hold] of [['fj', 'feijian', 9999], ['j0', 'jujian', 1], ['j1', 'jujian', 32], ['j2', 'jujian', 68]]) {
      const r = window.__cycle(st, hold, 900);
      one[k] = { dmg: r.dmg, period: r.period, pierce: r.pierce, dps: r.dmg / r.period };
    }
    return one;
  });
  for (const k of ['fj', 'j0', 'j1', 'j2']) {
    console.log(`    ${k}: 单发 ${dps[k].dmg.toFixed(2)} / 周期 ${dps[k].period.toFixed(1)} 帧 / 单体 DPS ${dps[k].dps.toFixed(4)}`);
  }
  ok('飞剑流单体 DPS 高于巨剑流全部段位',
    dps.fj.dps > dps.j0.dps && dps.fj.dps > dps.j1.dps && dps.fj.dps > dps.j2.dps,
    `飞剑 ${dps.fj.dps.toFixed(4)}`);
  ok('二段单体 DPS 高于点射（蓄力不吃亏太多）', dps.j2.dps > dps.j0.dps);
  ok('二段单体 DPS 未落后飞剑超过 25%',
    dps.j2.dps / dps.fj.dps >= 0.75, (dps.j2.dps / dps.fj.dps * 100).toFixed(0) + '%');

  sec('T4  群战 DPS：巨剑凭借穿透碾压');
  const grp = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    for (const [k, st, hold] of [['fj', 'feijian', 9999], ['j0', 'jujian', 1], ['j1', 'jujian', 32], ['j2', 'jujian', 68]]) {
      const r = window.__cycle(st, hold, 900);
      const hit = n => r.dmg * Math.min(n, r.pierce + 1) / r.period;
      out[k] = { n3: hit(3), n5: hit(5), n8: hit(8), pierce: r.pierce };
    }
    return out;
  });
  console.log('    5 目标 DPS：飞剑 ' + grp.fj.n5.toFixed(3) +
    ' / 点射 ' + grp.j0.n5.toFixed(3) +
    ' / 一段 ' + grp.j1.n5.toFixed(3) +
    ' / 二段 ' + grp.j2.n5.toFixed(3));
  ok('3 目标起巨剑二段已优于飞剑流', grp.j2.n3 > grp.fj.n3);
  ok('5 目标时二段 ≥ 飞剑流 2 倍', grp.j2.n5 >= grp.fj.n5 * 2,
    (grp.j2.n5 / grp.fj.n5).toFixed(2) + 'x');
  ok('群战收益随段位递增', grp.j0.n8 < grp.j1.n8 && grp.j1.n8 < grp.j2.n8);

  sec('T5  射速法宝：蓄力与后摇同步受影响');
  const rate = await page.evaluate(() => {
    const G = window.Game;
    const run = mul => window.__fireOnce('jujian', 68, mul);   // 二段后摇
    return { base: run(1), fast: run(1.35), slow: run(0.8) };
  });
  ok('射速 +35% → 后摇缩短', rate.fast.cd < rate.base.cd,
    `${rate.fast.cd} < ${rate.base.cd}`);
  ok('射速 -20% → 后摇变长', rate.slow.cd > rate.base.cd,
    `${rate.slow.cd} > ${rate.base.cd}`);
  ok('后摇有下限保护（不会为 0）', rate.slow.cd >= 4, 'cd=' + rate.slow.cd);

  sec('T6  换房间清除后摇');
  const roomReset = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('jujian');
    const inp = G.input;
    inp.mouseDown = true; inp.mouseT = performance.now(); inp.mx = 460; inp.my = 160;
    G.update();
    inp.mouseDown = false;
    G.update();                       // 释放 → 后摇
    const before = G.player.shootCd;
    const other = [...G.floor.rooms.values()].find(r => r !== G.room);
    G.enterRoom(other, null);
    return { before, after: G.player.shootCd, chargeT: G.player.chargeT };
  });
  ok('换房前确有后摇', roomReset.before > 0, 'cd=' + roomReset.before);
  ok('换房后后摇被清除', roomReset.after === 0, 'cd=' + roomReset.after);

  sec('T7  回气条绘制与全流程无异常');
  const drawRes = await page.evaluate(() => {
    const G = window.Game;
    const inp = G.input;
    let bad = null;
    try {
      G.newRun('jujian');
      G.player.x = 60; G.player.y = 160;
      inp.mx = 460; inp.my = 160; inp.mouseT = performance.now();
      inp.mouseDown = true;
      for (let i = 0; i < 5; i++) { G.update(); G.draw(); }
      inp.mouseDown = false;
      for (let i = 0; i < 40; i++) { G.update(); G.draw(); }   // 松手 → 后摇 → 回气条
      // 强制一个极端后摇值，确认回气条不炸
      G.player.shootCd = 999; G.player.chargeCdMax = 30;
      G.draw();
      G.player.chargeCdMax = 0; G.player.shootCd = 5;
      G.draw();
    } catch (e) { bad = e.message; }
    return bad;
  });
  ok('后摇期间 draw 无异常', drawRes === null, drawRes || '');

  sec('T8  回归：巨剑流实战推进无异常');
  for (const style of ['jujian', 'feijian']) {
    const r = await page.evaluate(st => {
      const G = window.Game;
      G.newRun(st);
      const inp = G.input;
      let bad = null, frames = 0, maxDepth = 1, shots = 0;
      try {
        for (let i = 0; i < 3600; i++) {
          inp.up = i % 60 < 15; inp.down = i % 60 >= 15 && i % 60 < 30;
          inp.left = i % 80 < 25; inp.right = i % 80 >= 25 && i % 80 < 50;
          if (i % 40 === 0) inp.mouseDown = true;
          if (i % 40 === 20) { inp.mouseDown = false; shots++; }
          inp.mouseT = performance.now();
          inp.mx = 240 + Math.sin(i / 11) * 160; inp.my = 170 + Math.cos(i / 13) * 90;
          G.player.hp = G.player.maxHP;
          G.update(); frames++;
          if (i % 6 === 0) G.draw();
          maxDepth = Math.max(maxDepth, G.depth);
          if (G.state === 'win') break;
          if (i % 200 === 0) G.enemies.length = 0;
          if (i % 240 === 0 && G.depth < 5) G.nextFloor();   // 保证能推到第 5 层
        }
      } catch (e) { bad = e.message; }
      G.input.mouseDown = false;
      G.input.up = G.input.down = G.input.left = G.input.right = false;
      return { bad, frames, maxDepth, shots, state: G.state };
    }, style);
    ok(`${style} 推进无异常`, r.bad === null, r.bad || `${r.frames} 帧 / 最深 ${r.maxDepth} 层`);
  }

  sec('汇总');
  ok('全程无 pageerror / console.error', errs.length === 0, errs.slice(0, 3).join(' | '));

  // browser.close() 在本机常挂死，限时收尾即可
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  console.log('\n──────────────────────────────');
  console.log(`  通过 ${pass} / 失败 ${fail}`);
  if (failed.length) console.log('  失败项：\n   - ' + failed.join('\n   - '));
  else console.log('  全部通过 ✅');
  console.log('──────────────────────────────');
  process.exit(fail ? 1 : 0);
})();
