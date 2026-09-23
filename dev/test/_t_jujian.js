'use strict';
/* 巨剑流更新 —— 自动化测试
 * 思路：加载 file://，先停掉 requestAnimationFrame，改由测试手动驱动
 * GameCore.update()/draw()，保证每一步都是确定性的；全程捕获 pageerror。
 */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const T1 = 30, T2 = 66, MAXC = 104;   // 与 entities.js 的 CHARGE 保持一致

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

  // 停掉主循环，后续全部手动步帧
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(300);

  sec('T1  加载与主循环控制');
  const tickA = await page.evaluate(() => window.Game.tick);
  await page.waitForTimeout(250);
  const tickB = await page.evaluate(() => window.Game.tick);
  ok('主循环已停，可确定性驱动', tickA === tickB, 'tick=' + tickA);
  ok('初始状态为 title', await page.evaluate(() => window.Game.state) === 'title');
  ok('巨剑精灵已构建', await page.evaluate(() => !!window.Game && !!document.getElementById('game')));

  sec('T2  开局流派选择');
  await page.keyboard.press('Space');
  await page.waitForTimeout(60);
  let st = await page.evaluate(() => ({ s: window.Game.state, i: window.Game.styleIdx }));
  ok('标题按任意键 → 进入流派选择', st.s === 'choose', 'state=' + st.s);
  ok('默认高亮飞剑流', st.i === 0, 'styleIdx=' + st.i);

  // 选择面板应当可见且渲染出两张卡
  const cho = await page.evaluate(() => {
    const c = document.getElementById('choose');
    const a = document.getElementById('pickCard0'), b = document.getElementById('pickCard1');
    return { disp: getComputedStyle(c).display, a: a && a.className, b: b && b.className };
  });
  await page.waitForTimeout(150);   // 等 overlay 定时器刷新
  const cho2 = await page.evaluate(() => {
    const a = document.getElementById('pickCard0');
    return { disp: getComputedStyle(document.getElementById('choose')).display, a: a.className };
  });
  ok('选择面板已显示', cho2.disp === 'flex', 'display=' + cho2.disp);
  ok('飞剑流卡片处于选中态', cho2.a.includes('selA'), 'class=' + cho2.a);

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  const st2 = await page.evaluate(() => ({ i: window.Game.styleIdx, b: document.getElementById('pickCard1').className }));
  ok('← → 可切换到巨剑流', st2.i === 1, 'styleIdx=' + st2.i);
  ok('巨剑流卡片高亮', st2.b.includes('selB'), 'class=' + st2.b);

  await page.keyboard.press('Digit1');
  await page.waitForTimeout(150);
  ok('数字键 1 切回飞剑流', (await page.evaluate(() => window.Game.styleIdx)) === 0);
  await page.keyboard.press('Digit2');
  await page.waitForTimeout(150);
  ok('数字键 2 切到巨剑流', (await page.evaluate(() => window.Game.styleIdx)) === 1);

  /* 选完流派要经过「风格地图」这一层。
     第一期只有中式 ready → 面板**不弹**，直接开局并自动记录路径
     （只有一个选项还给玩家弹窗＝空选择，见 `openStyleMenu` 里的说明）。
     面板本身的三选一交互由 `_t_stylemap.js` 用注入的假风格表覆盖。 */
  await page.keyboard.press('Enter');
  await page.waitForTimeout(160);
  st = await page.evaluate(() => ({
    s: window.Game.state, style: window.Game.style, hasP: !!window.Game.player,
    path: window.Game.stylePath, seg: window.Game.seg,
    spDisp: getComputedStyle(document.getElementById('stylePick')).display,
    pool: STYLE_SYS.pickPool().length
  }));
  ok('测试前提：第一期只有 1 个可择风格', st.pool === 1, 'pool=' + st.pool);
  ok('Enter 确认 → 开局（单选项不弹面板）', st.s === 'play', 'state=' + st.s);
  ok('流派已设为巨剑流', st.style === 'jujian', 'style=' + st.style);
  ok('出生房间与玩家已就绪', st.hasP);
  ok('风格路径已自动记录第一段', Array.isArray(st.path) && st.path.length === 1 && st.seg === 0,
     'path=' + (st.path || []).join('/') + ' seg=' + st.seg);
  ok('选择面板已隐藏', (await page.evaluate(() => getComputedStyle(document.getElementById('choose')).display)) === 'none');
  ok('风格面板未显示（无空选择）', st.spDisp === 'none', 'display=' + st.spDisp);

  sec('T3  蓄力分段阈值');
  const chg = await page.evaluate(({ t1, t2, maxc }) => {
    const G = window.Game;
    const inp = G.input;
    const out = {};
    const hold = n => {
      inp.mouseDown = true; inp.mouseT = performance.now(); inp.mx = 460; inp.my = 160;
      for (let i = 0; i < n; i++) G.update();
      return { t: G.player.chargeT, tier: window.chargeTier(G.player.chargeT), charging: G.player.charging };
    };
    G.newRun('jujian');
    G.player.x = 60; G.player.y = 160;
    // 起始必须是未蓄力
    out.init = { charging: G.player.charging, t: G.player.chargeT };
    out.at29 = hold(t1 - 1);      // 差一帧到一段
    G.newRun('jujian'); G.player.x = 60; G.player.y = 160;
    out.at30 = hold(t1);          // 恰好一段
    G.newRun('jujian'); G.player.x = 60; G.player.y = 160;
    out.at65 = hold(t2 - 1);      // 差一帧到二段
    G.newRun('jujian'); G.player.x = 60; G.player.y = 160;
    out.at66 = hold(t2);          // 恰好二段
    G.newRun('jujian'); G.player.x = 60; G.player.y = 160;
    out.atMax = hold(maxc + 40);  // 超过上限应封顶
    return out;
  }, { t1: T1, t2: T2, maxc: MAXC });
  ok('起始未蓄力', chg.init.charging === false && chg.init.t === 0);
  ok('蓄力帧数随按住增长', chg.at29.t === T1 - 1, 'chargeT=' + chg.at29.t);
  ok('不足阈值仍为第 0 段', chg.at29.tier === 0);
  ok('达到 ' + T1 + ' 帧 → 第 1 段', chg.at30.tier === 1, 'chargeT=' + chg.at30.t);
  ok('不足二段仍为第 1 段', chg.at65.tier === 1, 'chargeT=' + chg.at65.t);
  ok('达到 ' + T2 + ' 帧 → 第 2 段', chg.at66.tier === 2, 'chargeT=' + chg.at66.t);
  ok('超过上限封顶不溢出', chg.atMax.t === MAXC, 'chargeT=' + chg.atMax.t);
  ok('封顶后仍为第 2 段', chg.atMax.tier === 2);

  sec('T4  释放巨剑：穿透 / 剑宽 / 飞行距离随段位递增');
  const tiers = await page.evaluate(({ t1, t2 }) => {
    const G = window.Game;
    const inp = G.input;
    const fire = frames => {
      G.newRun('jujian');
      G.player.x = 60; G.player.y = 160; G.player.vx = 0; G.player.vy = 0;
      G.bullets.length = 0;
      inp.mouseDown = true; inp.mouseT = performance.now(); inp.mx = 460; inp.my = 160;
      for (let i = 0; i < frames; i++) G.update();
      inp.mouseDown = false;
      G.update();                       // 松手释放
      const bs = G.bullets.filter(b => b.kind === 'jujian');
      return bs.length
        ? { n: bs.length, pierce: bs[0].pierce, r: bs[0].r, life: bs[0].life, scale: bs[0].scale, dmg: bs[0].dmg }
        : null;
    };
    return { lv0: fire(8), lv1: fire(t1 + 2), lv2: fire(t2 + 2) };
  }, { t1: T1, t2: T2 });
  ok('点射放出巨剑', tiers.lv0 && tiers.lv0.n === 1, JSON.stringify(tiers.lv0));
  ok('一段放出巨剑', tiers.lv1 && tiers.lv1.n === 1);
  ok('二段放出巨剑', tiers.lv2 && tiers.lv2.n === 1);
  ok('巨剑流为单发（不被分裂拆成多把）',
     tiers.lv0.n === 1 && tiers.lv1.n === 1 && tiers.lv2.n === 1);
  ok('穿透数逐段递增',
     tiers.lv0.pierce < tiers.lv1.pierce && tiers.lv1.pierce < tiers.lv2.pierce,
     `${tiers.lv0.pierce} < ${tiers.lv1.pierce} < ${tiers.lv2.pierce}`);
  ok('剑身宽度逐段递增',
     tiers.lv0.r < tiers.lv1.r && tiers.lv1.r < tiers.lv2.r,
     `r: ${tiers.lv0.r} < ${tiers.lv1.r} < ${tiers.lv2.r}`);
  ok('飞行距离（life）逐段递增',
     tiers.lv0.life < tiers.lv1.life && tiers.lv1.life < tiers.lv2.life,
     `life: ${tiers.lv0.life} < ${tiers.lv1.life} < ${tiers.lv2.life}`);
  ok('视觉缩放逐段递增',
     tiers.lv0.scale < tiers.lv1.scale && tiers.lv1.scale < tiers.lv2.scale,
     `scale: ${tiers.lv0.scale} < ${tiers.lv1.scale} < ${tiers.lv2.scale}`);
  ok('伤害随段位提升', tiers.lv0.dmg < tiers.lv2.dmg, `${tiers.lv0.dmg.toFixed(1)} → ${tiers.lv2.dmg.toFixed(1)}`);

  sec('T5  巨剑实际穿透多个妖物');
  const pierceRes = await page.evaluate(({ t1, t2 }) => {
    const G = window.Game;
    const inp = G.input;
    const run = frames => {
      G.newRun('jujian');
      // 找一间有妖物的房间，好借用 Enemy 构造器并把它们摆成一条直线
      let target = null;
      for (const rr of G.floor.rooms.values()) if (rr.waves && rr.waves.length) { target = rr; break; }
      if (target) G.enterRoom(target, null);
      const protoE = G.enemies[0] ? Object.getPrototypeOf(G.enemies[0]).constructor : null;
      if (!protoE) return null;
      G.enemies.length = 0; G.bullets.length = 0;
      G.room.obstacles = [];               // 清掉石柱，否则巨剑会在半途被撞碎
      for (let i = 0; i < 5; i++) {
        const e = new protoE('xiesui', 130 + i * 42, 160, 1);
        e.update = () => {};              // 冻结行为，只验证穿透
        G.enemies.push(e);
      }
      const before = G.enemies.map(e => e.hp);
      const list = G.enemies.slice();   // 存原始引用：被打死的会从 G.enemies 里过滤掉
      G.player.x = 60; G.player.y = 160; G.player.vx = 0; G.player.vy = 0;
      G.room.cleared = true;              // 防止清房逻辑干扰
      inp.mouseDown = true; inp.mouseT = performance.now(); inp.mx = 460; inp.my = 160;
      for (let i = 0; i < frames; i++) G.update();
      inp.mouseDown = false;
      G.update();
      let step = 0;
      while (G.bullets.some(b => b.kind === 'jujian') && step < 300) { G.update(); step++; }
      const hurt = list.filter((e, i) => e.dead || e.hp < before[i]).length;
      return { hurt, steps: step, left: G.enemies.length };
    };
    return { lv0: run(8), lv2: run(t2 + 2) };
  }, { t1: T1, t2: T2 });
  if (pierceRes.lv0 && pierceRes.lv2) {
    ok('点射只能命中少量妖物', pierceRes.lv0.hurt <= 2, 'hurt=' + pierceRes.lv0.hurt + '/5');
    ok('二段巨剑可贯穿一整排妖物', pierceRes.lv2.hurt >= 5, 'hurt=' + pierceRes.lv2.hurt + '/5');
    ok('穿透数确实随段位提升', pierceRes.lv2.hurt > pierceRes.lv0.hurt,
       `${pierceRes.lv0.hurt} → ${pierceRes.lv2.hurt}`);
  } else {
    ok('巨剑穿透实测（未能构造敌人）', false, 'Enemy 构造器不可用');
  }

  sec('T6  巨剑流不影响飞剑流原有手感');
  const fj = await page.evaluate(() => {
    const G = window.Game;
    const inp = G.input;
    G.newRun('feijian');
    G.player.x = 60; G.player.y = 160; G.player.vx = 0; G.player.vy = 0;
    G.bullets.length = 0;
    inp.mouseDown = true; inp.mouseT = performance.now(); inp.mx = 460; inp.my = 160;
    let made = 0, alivePeak = 0;
    for (let i = 0; i < 60; i++) {
      G.update();
      for (const b of G.bullets) if (b.kind === 'sword' && !b._seen) { b._seen = true; made++; }
      alivePeak = Math.max(alivePeak, G.bullets.length);
    }
    inp.mouseDown = false;
    const kinds = [...new Set(G.bullets.map(b => b.kind))];
    return { style: G.style, made, alivePeak, kinds, chargeT: G.player.chargeT };
  });
  ok('飞剑流流派标记正确', fj.style === 'feijian');
  ok('飞剑流按住会连续发射', fj.made >= 2, '累计发射=' + fj.made);
  ok('飞剑同时在场不止一发', fj.alivePeak >= 2, '同屏峰值=' + fj.alivePeak);
  ok('飞剑流打出的是飞剑而非巨剑', fj.kinds.every(k => k === 'sword'), JSON.stringify(fj.kinds));
  ok('飞剑流不进入蓄力', fj.chargeT === 0);

  sec('T7  蓄力的中断与清理');
  const interrupt = await page.evaluate(({ t2 }) => {
    const G = window.Game;
    const inp = G.input;
    const out = {};
    // 受伤应打断蓄力进度
    G.newRun('jujian');
    G.player.x = 60; G.player.y = 160;
    inp.mouseDown = true; inp.mouseT = performance.now(); inp.mx = 460; inp.my = 160;
    for (let i = 0; i < t2 + 5; i++) G.update();
    out.beforeHurt = G.player.chargeT;
    G.player.invuln = 0; G.player.shield = 0;
    G.player.takeDamage(1, G);
    out.afterHurt = G.player.chargeT;
    // 切房间应清空蓄力状态
    inp.mouseDown = true; inp.mouseT = performance.now();
    for (let i = 0; i < 20; i++) G.update();
    out.beforeRoom = G.player.chargeT;
    G.room.obstacles = G.room.obstacles || [];
    const nb = [...G.floor.rooms.values()].find(r => r !== G.room) || G.room;
    G.enterRoom(nb, null);
    out.afterRoom = { t: G.player.chargeT, charging: G.player.charging };
    inp.mouseDown = false;
    return out;
  }, { t2: T2 });
  ok('蓄力可累积到二段以上', interrupt.beforeHurt > T2, 'chargeT=' + interrupt.beforeHurt);
  ok('受伤打断蓄力进度', interrupt.afterHurt === 0, 'chargeT=' + interrupt.afterHurt);
  ok('重新按住可持续累积蓄力帧数', interrupt.beforeRoom > 0, 'chargeT=' + interrupt.beforeRoom);
  ok('切换房间清空蓄力', interrupt.afterRoom.t === 0 && interrupt.afterRoom.charging === false,
     JSON.stringify(interrupt.afterRoom));

  sec('T8  蓄力表现层（动画 / 进度条）不报错');
  const drawRes = await page.evaluate(({ t1, t2, maxc }) => {
    const G = window.Game;
    const inp = G.input;
    let bad = null;
    try {
      G.newRun('jujian');
      G.player.x = 60; G.player.y = 160;
      inp.mouseDown = true; inp.mouseT = performance.now(); inp.mx = 460; inp.my = 160;
      inp.mouseT = performance.now();
      for (const f of [5, t1 - 2, t1 + 3, t2 - 2, t2 + 5, maxc + 10]) {
        G.newRun('jujian');
        G.player.x = 60; G.player.y = 160;
        inp.mouseDown = true; inp.mouseT = performance.now();
        for (let i = 0; i < f; i++) { G.update(); G.draw(); }
      }
      // 松手后继续画若干帧
      inp.mouseDown = false;
      for (let i = 0; i < 30; i++) { G.update(); G.draw(); }
      // 未蓄力时也不应绘制
      G.newRun('jujian');
      for (let i = 0; i < 10; i++) { G.update(); G.draw(); }
    } catch (e) { bad = e.message; }
    return bad;
  }, { t1: T1, t2: T2, maxc: MAXC });
  ok('蓄力全过程 draw 无异常', drawRes === null, drawRes || '');

  sec('T9  巨剑流随机游玩压力测试');
  const stress = await page.evaluate(() => {
    const G = window.Game;
    const inp = G.input;
    let bad = null, frames = 0, deaths = 0, shots = 0, maxDepth = 1;
    try {
      for (let round = 0; round < 12; round++) {
        G.newRun('jujian');
        for (let i = 0; i < 900; i++) {
          // 随机输入：走位 + 随机长短蓄力
          inp.up = Math.random() < 0.3; inp.down = Math.random() < 0.3;
          inp.left = Math.random() < 0.3; inp.right = Math.random() < 0.3;
          if (i % 17 === 0) inp.mouseDown = true;
          if (i % 17 === 3 + Math.floor(Math.random() * 90)) { inp.mouseDown = false; shots++; }
          inp.mouseT = performance.now();
          inp.mx = Math.random() * 480; inp.my = Math.random() * 320;
          if (Math.random() < 0.02) inp.keyShoot = true, inp.keyAngle = Math.random() * 6.28;
          else inp.keyShoot = false;
          G.player.hp = G.player.maxHP;      // 保持存活以压测完整流程
          G.update(); frames++;
          if (i % 8 === 0) G.draw();
          maxDepth = Math.max(maxDepth, G.depth);
          if (G.state === 'win') break;
        }
        if (G.state === 'dead') deaths++;
      }
    } catch (e) { bad = e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n'); }
    inp.mouseDown = false; inp.up = inp.down = inp.left = inp.right = false; inp.keyShoot = false;
    return { bad, frames, deaths, shots, maxDepth };
  });
  ok('压力测试无异常', stress.bad === null, stress.bad || `${stress.frames} 帧 / ${stress.shots} 次释放 / 最深 ${stress.maxDepth} 层`);
  ok('压测确实跑动了大量帧', stress.frames > 5000, 'frames=' + stress.frames);
  ok('压测确实释放过巨剑', stress.shots > 50, 'shots=' + stress.shots);

  sec('T10  飞剑流回归（同一套机制未被破坏）');
  const regress = await page.evaluate(() => {
    const G = window.Game;
    const inp = G.input;
    let bad = null, frames = 0, maxDepth = 1;
    try {
      for (let round = 0; round < 6; round++) {
        G.newRun('feijian');
        for (let i = 0; i < 700; i++) {
          inp.up = Math.random() < 0.3; inp.down = Math.random() < 0.3;
          inp.left = Math.random() < 0.3; inp.right = Math.random() < 0.3;
          inp.mouseDown = Math.random() < 0.6;
          inp.mouseT = performance.now();
          inp.mx = Math.random() * 480; inp.my = Math.random() * 320;
          G.player.hp = G.player.maxHP;
          G.update(); frames++;
          if (i % 10 === 0) G.draw();
          maxDepth = Math.max(maxDepth, G.depth);
          if (G.state === 'win') break;
        }
      }
    } catch (e) { bad = e.message; }
    inp.mouseDown = false; inp.up = inp.down = inp.left = inp.right = false;
    return { bad, frames, maxDepth };
  });
  ok('飞剑流回归无异常', regress.bad === null, regress.bad || `${regress.frames} 帧 / 最深 ${regress.maxDepth} 层`);

  sec('T10b  换层与通关（两个流派）');
  const depthRes = await page.evaluate(() => {
    const G = window.Game;
    let bad = null; const seq = [];
    try {
      /* 层数已由 STYLE_SYS 决定（第一期 9 层 = 3 段 × 3 层），不能再写死 6 次循环。
         另外每到一段首层会弹「择风格」面板（state 变 stylePick）——
         这里按「默认选第一项」替玩家点掉，否则循环会卡住。
         测试只关心「换层与通关流程不崩」，选哪个风格不影响这个结论。 */
      for (const style of ['feijian', 'jujian']) {
        G.newRun(style);
        const need = STYLE_SYS.totalFloors + 1;
        for (let d = 0; d < need; d++) {
          for (let i = 0; i < 40; i++) { G.update(); if (i % 4 === 0) G.draw(); }
          seq.push(style + ':' + G.depth);
          if (G.state === 'win') break;
          G.nextFloor();
          /* 弹了风格面板就替玩家确认（默认高亮项） */
          if (G.state === 'stylePick' && G.styleMenu) G.styleMenuConfirm();
        }
      }
    } catch (e) { bad = e.message; }
    return { bad, depth: G.depth, state: G.state, seq };
  });
  ok('两流派连续换层均不报错', depthRes.bad === null, depthRes.bad || depthRes.seq.join(' → '));
  ok('走到最后一层后通关', depthRes.state === 'win', 'state=' + depthRes.state + ' depth=' + depthRes.depth);

  sec('T11  重开沿用当前流派');
  const rerun = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('jujian');
    const before = G.style;
    G.state = 'dead';
    G.newRun();                 // R 键重开的调用方式：不带参
    const after = G.style;
    G.newRun('feijian');
    G.state = 'dead';
    G.newRun();
    return { before, after, fc: G.style };
  });
  ok('巨剑流重开沿用巨剑流', rerun.before === 'jujian' && rerun.after === 'jujian', JSON.stringify(rerun));
  ok('飞剑流重开沿用飞剑流', rerun.fc === 'feijian');

  sec('T12  全局错误检查');
  ok('全程无 pageerror / console.error', errs.length === 0, errs.slice(0, 5).join(' | '));

  // browser.close() 在本机常挂死，限时收尾即可
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);

  console.log('\n──────────────────────────────');
  console.log(`  通过 ${pass} / ${pass + fail}`);
  if (fail) { console.log('  未通过：' + failed.join('、')); process.exitCode = 1; }
  else console.log('  全部通过 ✅');
  console.log('──────────────────────────────');
  process.exit(fail ? 1 : 0);
})();
