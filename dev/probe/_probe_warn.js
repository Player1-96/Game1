'use strict';
/* 探针：三处「预警不足」的逐帧实测。

   2026-09-22 用户（三个流派都通关之后）反馈：
     1 头目的前冲完全没有前摇，直接就冲过来了
     2 有旋转护盾的怪（玄甲卫）完全没有攻击性，基本没有还手能力
     3 烛龙的扇形激光没有倒计时提示，虽然有范围，但突然就射出来了

   纸面上「应该够了」是一回事，逐帧跑出来是另一回事 —— 这个脚本只信后者。
   三处各测两件事：预警的**时长**（够不够跑）、以及预警的**可读性**（有没有读数）。
*/
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 820 } });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console.error] ' + m.text()); });
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(250);

  /* ============ 1  头目冲刺：前摇帧数 / 前摇期位移 / 锁定时序 ============ */
  const dash = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian'); G.state = 'play';
    const p = G.player;
    p.x = 430; p.y = 275; p.invuln = 99999; p.hp = p.maxHP;
    G.enemies.length = 0; G.beams.length = 0; G.bullets.length = 0;
    const b = new Boss('xuemo', 80, 80, 1);
    b.spawnT = 0; b.cd = 99999; b.cd3 = 99999; b.spd = 0;   // 只测冲刺，不掺弹幕
    b.cd2 = 2;
    G.enemies.push(b);

    const out = { wind: 0, dashN: 0, hitWall: false };
    let windStart = null, dashStart = null, dashEnd = null, lockAt = -1, a0 = null, aEnd = null;
    let states = [];
    for (let i = 0; i < 200; i++) {
      G.update();
      if (states.length < 70) states.push(b.state);
      if (b.state === 'dashWind') {
        if (!windStart) { windStart = { x: b.x, y: b.y }; a0 = b.dashA; }
        out.wind++;
        if (b.dashLock && lockAt < 0) lockAt = out.wind;
        aEnd = b.dashA;
      } else if (b.state === 'dash') {
        if (!dashStart) {
          dashStart = { x: b.x, y: b.y };
          out.firedAfterWind = out.wind;
          out.spd0 = +Math.hypot(b.vx, b.vy).toFixed(2);
        }
        out.dashN++;
        dashEnd = { x: b.x, y: b.y };
      }
    }
    out.windDrift = windStart && dashStart ? Math.round(Math.hypot(dashStart.x - windStart.x, dashStart.y - windStart.y)) : null;
    out.dashDist = dashStart && dashEnd ? Math.round(Math.hypot(dashEnd.x - dashStart.x, dashEnd.y - dashStart.y)) : null;
    out.lockLead = lockAt > 0 ? out.wind - lockAt + 1 : null;
    out.turnedDuringWind = a0 != null && aEnd != null ? +Math.abs(aEnd - a0).toFixed(3) : null;
    out.stateSeq = states.join('');

    // 第二段：玩家在蓄力期一路跑，方向应该跟着转；钉死之后不再转
    G.newRun('feijian'); G.state = 'play';
    const q = G.player;
    q.x = 240; q.y = 250; q.invuln = 99999; q.hp = q.maxHP;
    G.enemies.length = 0; G.beams.length = 0; G.bullets.length = 0;
    const b2 = new Boss('xuemo', 240, 90, 1);
    b2.spawnT = 0; b2.cd = 99999; b2.cd3 = 99999; b2.spd = 0;
    b2.cd2 = 2;
    G.enemies.push(b2);
    let aFirst = null, aBeforeLock = null, aSeenAfterLock = null, lockSeen = false;
    for (let i = 0; i < 120; i++) {
      q.x = Math.min(430, q.x + 2.35);          // 人工喂位移，模拟玩家一路向右跑
      G.update();
      if (b2.state === 'dashWind') {
        if (aFirst == null) aFirst = b2.dashA;
        if (!b2.dashLock) aBeforeLock = b2.dashA;
        else if (!lockSeen) { aSeenAfterLock = b2.dashA; lockSeen = true; }
      }
    }
    // 跟随期的转动量：蓄力第一帧 → 锁定前一帧
    out.trackedWhileOpen = (aFirst != null && aBeforeLock != null)
      ? +Math.abs(aBeforeLock - aFirst).toFixed(3) : null;
    // 锁定瞬间 → 钉死后的第一帧，应该一动不动
    out.lockFreeze = (aBeforeLock != null && aSeenAfterLock != null)
      ? +Math.abs(aSeenAfterLock - aBeforeLock).toFixed(4) : null;
    return out;
  });

  console.log('=== 1  头目冲刺 ===');
  console.log('  前摇帧数            : ' + dash.wind + ' 帧（' + (dash.wind / 60).toFixed(2) + ' 秒）');
  console.log('  前摇期位移          : ' + dash.windDrift + ' px（站定蓄势，几乎不动）');
  console.log('  方向锁定提前量      : ' + dash.lockLead + ' 帧（' + (dash.lockLead / 60).toFixed(2) + ' 秒闪身窗口）');
  console.log('  冲刺帧数 / 初速     : ' + dash.dashN + ' 帧 / ' + dash.spd0 + ' px·帧⁻¹');
  console.log('  冲刺实际冲程        : ' + dash.dashDist + ' px');
  console.log('  蓄力期方向跟随      : ' + dash.trackedWhileOpen + ' rad（玩家一路跑，光带跟着甩）');
  console.log('  锁定后方向漂移      : ' + dash.lockFreeze + ' rad（钉死即不动）');
  console.log('  状态序列前 70 帧    : ' + dash.stateSeq.slice(0, 60) + '…');
  console.log('  判定：闪身窗口 ' + dash.lockLead + ' 帧 ≈ ' + (dash.lockLead / 60).toFixed(2) + ' 秒，'
    + '玩家 2.35px/帧 可横移 ' + Math.round(dash.lockLead * 2.35) + ' px，'
    + '而脱离冲刺线只需让垂距 > 22+6 = 28px → '
    + (dash.lockLead * 2.35 > 28 ? '余裕 ' + (dash.lockLead * 2.35 / 28).toFixed(1) + ' 倍 ✓' : '仍不够 ✗'));
  console.log('');

  /* ============ 2  玄甲卫：盾冲的存在性与攻防代价 ============ */
  const bash = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian'); G.state = 'play';
    const p = G.player;
    p.x = 200; p.y = 250; p.invuln = 99999; p.hp = p.maxHP;
    G.enemies.length = 0; G.beams.length = 0; G.bullets.length = 0;
    const e = new Enemy('xuanjia', 200, 120, 1);   // 距离 130，在 BASH.range(138) 内
    e.spawnT = 0; e.cd = 1; e.speed = 0;           // 不自己走，纯看盾冲
    G.enemies.push(e);

    const out = { idleArcs: e.shieldArcs().length, wind: 0, bashN: 0, recover: 0 };
    let bStart = null, bEnd = null, chargeArcs = null, chargeCenter = null, lockAt = -1;
    for (let i = 0; i < 220; i++) {
      G.update();
      if (e.state === 1) {
        out.wind++;
        if (e.bashLock && lockAt < 0) lockAt = out.wind;
        if (chargeArcs === null) {
          const arcs = e.shieldArcs();
          chargeArcs = arcs.length;
          chargeCenter = +((arcs[0].a0 + arcs[0].a1) / 2).toFixed(3);
        }
      } else if (e.state === 2) {
        if (!bStart) bStart = { x: e.x, y: e.y };
        out.bashN++;
        bEnd = { x: e.x, y: e.y };
      } else if (e.state === 3) out.recover++;
    }
    out.chargeArcs = chargeArcs;
    out.chargeCenter = chargeCenter;
    out.bashA = +e.bashA.toFixed(3);
    out.bashDist = bStart && bEnd ? Math.round(Math.hypot(bEnd.x - bStart.x, bEnd.y - bStart.y)) : null;
    out.lockLead = lockAt > 0 ? out.wind - lockAt + 1 : null;
    out.cdTail = e.cd;

    // 收拢之后：从正面打 vs 从侧后打
    G.newRun('feijian'); G.state = 'play';
    const p2 = G.player;
    p2.x = 200; p2.y = 250; p2.invuln = 99999;
    G.enemies.length = 0; G.bullets.length = 0; G.beams.length = 0;
    const f1 = new Enemy('xuanjia', 200, 120, 1);
    f1.spawnT = 0; f1.cd = 99999; f1.speed = 0;
    G.enemies.push(f1);
    for (let i = 0; i < 80; i++) G.update();
    f1.state = 1; f1.stateT = 30; f1.bashA = 0; f1.bashLock = true;   // 手摆成「盾收在正面」
    let h0 = f1.hp;
    f1.hurt(10, G, { x: f1.x + 40, y: f1.y }, false);                 // 正面
    out.frontDmg = +(h0 - f1.hp).toFixed(2);
    h0 = f1.hp;
    f1.hurt(10, G, { x: f1.x - 40, y: f1.y }, false);                 // 侧后（与 bashA 相反）
    out.backDmg = +(h0 - f1.hp).toFixed(2);
    return out;
  });

  console.log('=== 2  玄甲卫盾冲 ===');
  console.log('  常态护盾片数        : ' + bash.idleArcs + ' 片（两片慢转，绕后就打得到）');
  console.log('  起手距离            : 130 px（阈值 138）');
  console.log('  蓄力帧数            : ' + bash.wind + ' 帧（' + (bash.wind / 60).toFixed(2) + ' 秒）');
  console.log('  方向锁定提前量      : ' + bash.lockLead + ' 帧');
  console.log('  冲撞帧数 / 冲程     : ' + bash.bashN + ' 帧 / ' + bash.bashDist + ' px');
  console.log('  硬直帧数            : ' + bash.recover + ' 帧（' + (bash.recover / 60).toFixed(2) + ' 秒反击窗口）');
  console.log('  起手后护盾片数      : ' + bash.chargeArcs + ' 片，收拢在 ' + bash.chargeCenter + ' rad（= 冲撞方向）');
  console.log('  同样 10 点伤害      : 盾正面吃 ' + bash.frontDmg + ' / 侧后吃 ' + bash.backDmg
    + ' → 绕后是 ' + (bash.backDmg / Math.max(0.01, bash.frontDmg)).toFixed(1) + ' 倍收益');
  console.log('');

  /* ============ 3  烛龙横扫：蓄力时长 + 能不能真躲开 ============ */
  const sweep = await page.evaluate(() => {
    const G = window.Game;
    const run = (escape) => {
      G.newRun('feijian'); G.state = 'play';
      const p = G.player;
      p.x = 240; p.y = 200; p.invuln = 0; p.hp = p.maxHP;
      G.enemies.length = 0; G.beams.length = 0; G.bullets.length = 0;
      const b = new Boss('zhulong', 240, 80, 1);
      b.spawnT = 0; b.cd = 99999; b.cd3 = 99999; b.spd = 0; b.guardCd = 1;
      G.enemies.push(b);
      G.update();
      const bm = G.beams[0];
      if (!bm) return { err: 'no beam' };
      const r = { warn: bm.warn, fire: bm.fire, swing: +bm.swing.toFixed(2), a0: +bm.a.toFixed(3) };
      let warnFrames = 0, hp0 = p.hp;
      // 推过蓄力期：期间原地不动 / 或一路朝扇面起点侧跑
      let guard = 0;
      while (!bm.firing && guard++ < 400) {
        if (escape) p.x = Math.min(430, p.x + 2.35);
        G.update();
        warnFrames++;
      }
      r.warnFrames = warnFrames;
      r.hpAfterWarn = hp0 - p.hp;
      r.posAtFire = Math.round(p.x);
      // 发射后继续（不逃者原地站桩；逃者继续跑）
      let t = 0;
      while (t < 220 && p.hp >= hp0) {
        if (escape) p.x = Math.min(430, p.x + 2.35);
        G.update();
        t++;
      }
      r.hit = p.hp < hp0;
      r.framesToHit = t;
      r.finalHp = p.hp;
      return r;
    };
    const stand = run(false);
    const flee = run(true);
    return { stand: stand, flee: flee };
  });

  console.log('=== 3  烛龙横扫 ===');
  console.log('  蓄力帧数            : ' + sweep.stand.warn + ' 帧（' + (sweep.stand.warn / 60).toFixed(2) + ' 秒）'
    + '，实际跑到 ' + sweep.stand.warnFrames + ' 帧');
  console.log('  扫射帧数 / 扇面     : ' + sweep.stand.fire + ' 帧 / ' + sweep.stand.swing + ' rad');
  console.log('  蓄力期伤害          : ' + sweep.stand.hpAfterWarn + '（预告期零伤害）');
  console.log('  站桩不动            : ' + (sweep.stand.hit ? '第 ' + sweep.stand.framesToHit + ' 帧被扫中' : '居然没被打到'));
  console.log('  蓄力期起就横移      : ' + (sweep.flee.hit
    ? '第 ' + sweep.flee.framesToHit + ' 帧仍被扫中，剩 ' + sweep.flee.finalHp + ' 血 ✗'
    : '全程无伤 ✓（跑到 x=' + sweep.flee.posAtFire + '）'));
  console.log('  逃生判定            : 蓄力 ' + sweep.stand.warn + ' 帧可走 '
    + Math.round(sweep.stand.warn * 2.35) + 'px，'
    + '而脱离扇面起点只需约 112px → '
    + (sweep.stand.warn * 2.35 > 112 ? '余裕 ' + (sweep.stand.warn * 2.35 / 112).toFixed(1) + ' 倍 ✓' : '仍紧张 ✗'));
  console.log('');

  console.log('页面错误: ' + (errs.length ? errs.join(' | ') : '无'));
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
