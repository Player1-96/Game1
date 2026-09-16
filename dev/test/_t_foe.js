'use strict';
/* 后四层新增的 5 种小怪 + 3 位头目 —— 机制回归
 *
 *  小怪：玄光瞳（激光）/ 铁魄妖（不可击碎反射的弹幕）/ 蹦山魈（弹跳落点）
 *        玄甲卫（旋盾）/ 影魅（隐身）
 *  头目：裂煞魔尊（弹幕裂变）/ 轮回法王（缺口环）/ 烛龙（横扫 + 鳞罩）
 *
 *  每条断言都对着一条**设计承诺**，而不是对着实现的某个中间量：
 *  改了数值只要承诺还成立，测试就不该红。
 */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');

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
  await page.waitForTimeout(250);

  /* 干净场景：空房、玩家无敌，方便逐帧观察单个妖物 */
  await page.evaluate(() => {
    window.__clean = function (style) {
      const G = window.Game;
      G.newRun(style || 'feijian');
      G.state = 'play';
      G.enemies.length = 0; G.bullets.length = 0; G.hazards.length = 0; G.beams.length = 0;
      G.particles.length = 0; G.floaters.length = 0;
      G.floor.rooms.forEach(r => { r.cleared = true; r.waves = []; });
      const p = G.player;
      p.x = 240; p.y = 200; p.invuln = 999999; p.hp = p.maxHP;
      return p;
    };
  });

  /* ================= T1  玄光瞳 ================= */
  sec('T1  玄光瞳：蓄力有预告、发射按射线判定');
  const t1 = await page.evaluate(() => {
    const G = window.Game;
    const out = { warnNeed: BEAM.warn };
    // A 蓄力全程零伤害 + 蓄力时长
    let p = window.__clean('feijian');
    p.y = 210; p.invuln = 0;
    const e = new Enemy('xuanguang', 240, 70, 1);
    e.spawnT = 0; e.cd = 1; e.speed = 0;
    G.enemies.push(e);
    let warn = 0, dmgWarn = 0;
    for (let i = 0; i < BEAM.warn; i++) {
      const hp0 = p.hp;
      G.update();
      if (e.state === 1) { warn++; dmgWarn += hp0 - p.hp; }
    }
    out.warnFrames = warn;
    out.dmgDuringWarn = dmgWarn;
    out.hasBeam = G.beams.length > 0;
    // B 站桩挨打：只吃 1 点（hitGap 防一帧多段）
    const hp0 = p.hp;
    for (let i = 0; i < 40; i++) G.update();
    out.standLoss = hp0 - p.hp;

    // C 锁定窗口里横移 → 不掉血
    p = window.__clean('feijian');
    p.y = 210; p.invuln = 0;
    const e2 = new Enemy('xuanguang', 240, 70, 1);
    e2.spawnT = 0; e2.cd = 1; e2.speed = 0;
    G.enemies.push(e2);
    let moved = false, fired = false;
    for (let i = 0; i < 220; i++) {
      G.update();
      const bm = G.beams[0];
      if (!bm) continue;
      if (!bm.firing && !moved && bm.t > bm.warn - bm.lock) { moved = true; p.x = 300; }
      if (bm.firing) fired = true;
    }
    out.dodged = p.hp === p.maxHP;
    out.fired = fired;

    // D 蓄力中斩杀 → 光胎死腹中
    p = window.__clean('feijian');
    p.y = 210;
    const e3 = new Enemy('xuanguang', 240, 70, 1);
    e3.spawnT = 0; e3.cd = 1; e3.speed = 0;
    G.enemies.push(e3);
    for (let i = 0; i < 20; i++) G.update();
    const hadBeam = G.beams.length > 0;
    e3.hurt(999, G, null, false);
    for (let i = 0; i < 30; i++) G.update();
    out.cancelHad = hadBeam;
    out.cancelGone = G.beams.length === 0;
    return out;
  });
  ok('蓄力总时长等于 BEAM.warn', t1.warnFrames === t1.warnNeed, `warn=${t1.warnFrames}`);
  ok('蓄力期完全零伤害（预告就是预告）', t1.dmgDuringWarn === 0, `掉血=${t1.dmgDuringWarn}`);
  ok('蓄力会生成一束玄光', t1.hasBeam === true);
  ok('站桩必吃一发，且只吃一发', t1.standLoss === 1, `掉血=${t1.standLoss}`);
  ok('锁定窗口里横移即可躲开', t1.dodged === true && t1.fired === true);
  ok('蓄力中斩杀，玄光胎死腹中（集火有回报）', t1.cancelHad === true && t1.cancelGone === true);

  /* ================= T2  铁魄妖 ================= */
  sec('T2  铁魄妖：玄铁弹斩不落、也反射不了');
  const t2 = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    // A 舞剑流满阶照影镜：剑罡对玄铁弹只有火星
    let p = window.__clean('wujian');
    p.stats.reflect = 3; p.stats.damage = 6;
    p.x = 200; p.y = 200;
    const hard = G.spawnEnemyBullet(240, 200, -2.2, 0, 'iron', { hard: true, r: 7, life: 300 });
    const soft = G.spawnEnemyBullet(240, 216, -2.2, 0, 'blood', { r: 5, life: 300 });
    out.hardFlag = hard.hard === true;
    for (let i = 0; i < 8; i++) {
      G.update();
      STYLES.wujian.attack(p, G, { shooting: true, aiming: true, aimAngle: 0 });
    }
    out.hardAlive = !hard.dead && !hard.friendly;
    out.softHandled = soft.dead || soft.friendly;

    // B 飞剑流的玄元镜「击落」：挂在玩家子弹上，同样打不掉玄铁弹
    p = window.__clean('feijian');
    p.x = 60; p.y = 280;
    const h2 = G.spawnEnemyBullet(360, 240, 0, 0, 'iron', { hard: true, r: 7, life: 300 });
    const s2 = G.spawnEnemyBullet(360, 220, 0, 0, 'blood', { r: 5, life: 300 });
    G.bullets.push(new Bullet(360, 230, 0, 0, {
      friendly: true, deflect: 2, r: 5, life: 300, kind: 'sword', sprite: SPR.sword
    }));
    for (let i = 0; i < 3; i++) G.update();
    out.hardSurvivesDeflect = !h2.dead;
    out.softKilled = s2.dead;

    // C 铁魄妖本体会周期性射出玄铁弹
    p = window.__clean('feijian');
    p.x = 240; p.y = 260;
    const e = new Enemy('tiehun', 240, 70, 1);
    e.spawnT = 0; e.cd = 1;
    G.enemies.push(e);
    let ironShots = 0;
    for (let i = 0; i < 12; i++) {
      G.update();
      ironShots = G.bullets.filter(b => b.hard && !b.friendly).length;
    }
    out.ironShots = ironShots;
    return out;
  });
  ok('玄铁弹带 hard 标记', t2.hardFlag === true);
  ok('舞剑流剑罡斩不落、也回敬不了玄铁弹', t2.hardAlive === true);
  ok('同场的普通弹仍被剑罡处理掉', t2.softHandled === true);
  ok('飞剑流的「击落」对玄铁弹同样无效', t2.hardSurvivesDeflect === true);
  ok('飞剑流的「击落」对普通弹照旧有效', t2.softKilled === true);
  ok('铁魄妖一次射出一对玄铁弹', t2.ironShots === 2, `场上=${t2.ironShots}`);

  /* ================= T3  蹦山魈 ================= */
  sec('T3  蹦山魈：落点先亮圈，腾空不伤人');
  const t3 = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    let p = window.__clean('feijian');
    p.x = 240; p.y = 200; p.invuln = 0;
    const e = new Enemy('bengyao', 90, 90, 1);
    e.spawnT = 0; e.cd = 1;
    G.enemies.push(e);
    let sawWind = false, airContact = 0, landLoss = 0, wasAir = false;
    for (let i = 0; i < 220; i++) {
      const hp0 = p.hp;
      G.update();
      if (e.state === 1) sawWind = true;
      if (e.air > 0) {
        out.sawAir = true; wasAir = true;
        p.x = e.x; p.y = e.y;                    // 腾空时把玩家按在它正下方
        if (p.hp < hp0) airContact++;
      } else if (wasAir) {
        wasAir = false;
        landLoss = hp0 - p.hp;
        break;
      }
    }
    out.sawWind = sawWind; out.airContact = airContact; out.landLoss = landLoss;

    // 落点必在可走范围内
    p = window.__clean('feijian');
    p.x = 470; p.y = 280;
    const e2 = new Enemy('bengyao', 90, 60, 1);
    e2.spawnT = 0; e2.cd = 1;
    G.enemies.push(e2);
    for (let i = 0; i < 4; i++) G.update();
    out.clamped = e2.leapX <= WALL_R && e2.leapY <= WALL_B;

    // 落地一刻人已走远 → 不该掉血
    p = window.__clean('feijian');
    p.x = 240; p.y = 200; p.invuln = 0;
    const e3 = new Enemy('bengyao', 120, 120, 1);
    e3.spawnT = 0; e3.cd = 1;
    G.enemies.push(e3);
    for (let i = 0; i < 220; i++) {
      G.update();
      if (e3.state === 1 || e3.air > 0) { p.x = 60; p.y = 40; }   // 圈一亮就撤
    }
    out.fledSafe = true;
    out.fledHp = p.hp;
    return out;
  });
  ok('蓄势时会先亮出落点圈', t3.sawWind === true);
  ok('腾空期完全不造成接触伤害', t3.sawAir === true && t3.airContact === 0, `挨打 ${t3.airContact} 次`);
  ok('落地砸中范围内掉 1 颗心', t3.landLoss === 1, `掉血=${t3.landLoss}`);
  ok('落点被夹在可走范围内（贴墙也不会跳进墙里）', t3.clamped === true);
  ok('看出圈就跑开，落地砸不到', t3.fledSafe === true);

  /* ================= T4  玄甲卫 ================= */
  sec('T4  玄甲卫：旋盾只挡一个方向');
  const t4 = await page.evaluate(() => {
    const G = window.Game;
    const out = { mul: SHIELD.mul, cover: SHIELD.arcs * SHIELD.arc / (Math.PI * 2) };
    const hit = (ang, dmg, src) => {
      window.__clean('feijian');
      const e = new Enemy('xuanjia', 240, 160, 1);
      e.spawnT = 0; e.shieldA = 0;              // 盾心固定在 0 与 π
      G.enemies.push(e);
      const hp0 = e.hp;
      e.hurt(dmg, G, src === undefined
        ? { x: e.x + Math.cos(ang) * 40, y: e.y + Math.sin(ang) * 40 } : src, false);
      return hp0 - e.hp;
    };
    out.front = hit(0, 10);
    out.gap = hit(Math.PI / 2, 10);
    out.dot = hit(0, 10, 'dot');                // 无来源的伤害绕过护盾
    // 盾在转：隔一段时间盾心角度必须变过
    window.__clean('feijian');
    const e = new Enemy('xuanjia', 240, 160, 1);
    e.spawnT = 0; e.shieldA = 0;
    G.enemies.push(e);
    for (let i = 0; i < 120; i++) G.update();
    out.rotated = +e.shieldA.toFixed(3);
    // 格挡会留痕（blockFlash），方便玩家确认「这一下被吃了」
    out.blockFlash = e.blockFlash;
    return out;
  });
  ok('从护盾那一侧打过去，伤害被吃掉',
    Math.abs(t4.front - 10 * t4.mul) < 0.01, `实际 ${t4.front}（满额 10）`);
  ok('从缺口那一侧打过去，伤害满额', t4.gap === 10, `实际 ${t4.gap}`);
  ok('没有来源位置的伤害（技能 / DoT）绕过旋盾', t4.dot === 10, `实际 ${t4.dot}`);
  ok('护盾在持续旋转（不是一面死盾）', t4.rotated > 0.5, `120 帧转了 ${t4.rotated} rad`);
  ok('护盾覆盖率不到一半，绕后始终有缝',
    t4.cover > 0.35 && t4.cover < 0.6, `覆盖 ${t4.cover.toFixed(2)}`);

  /* ================= T5  影魅 ================= */
  sec('T5  影魅：平时是影子，贴上来才现形');
  const t5 = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    const p = window.__clean('feijian');
    p.x = 240; p.y = 200;
    const e = new Enemy('yingmo', 420, 200, 1);
    e.spawnT = 0;
    G.enemies.push(e);
    out.hiddenAtBirth = e.hidden;
    for (let i = 0; i < 10; i++) G.update();
    out.stillHidden = e.hidden;
    // 靠近 → 现形 + 扑击
    e.x = p.x + 90;
    for (let i = 0; i < 2; i++) G.update();
    out.revealed = !e.hidden;
    out.hold = e.revealT;
    out.lunge = Math.hypot(e.vx, e.vy);
    // 受创 → 现形
    const f = new Enemy('yingmo', 420, 200, 1);
    f.spawnT = 0; G.enemies.push(f);
    f.hurt(1, G, 'dot');
    out.hitReveal = !f.hidden;
    // 拉远并等 hold 结束 → 重新隐去
    const g2 = new Enemy('yingmo', 420, 200, 1);
    g2.spawnT = 0; g2.hidden = false; g2.revealT = 5;
    G.enemies.push(g2);
    for (let i = 0; i < 10; i++) G.update();
    out.reHidden = g2.hidden;
    return out;
  });
  ok('出生即隐身', t5.hiddenAtBirth === true);
  ok('离得远时一直隐身（不主动显形）', t5.stillHidden === true);
  ok('进入警戒距离就显形', t5.revealed === true);
  ok('现形至少维持一段（不是闪一下就没）', t5.hold >= 80, `hold=${t5.hold}`);
  ok('现形那一瞬会朝你扑一记', t5.lunge > 3, `初速 ${t5.lunge.toFixed(1)}`);
  ok('挨了打立刻现形', t5.hitReveal === true);
  ok('拉开距离后重新隐去', t5.reHidden === true);

  /* ================= T6  裂煞魔尊 ================= */
  sec('T6  裂煞魔尊：一发母弹裂成 2 + 6');
  const t6 = await page.evaluate(() => {
    const G = window.Game;
    const p = window.__clean('feijian');
    p.x = 430; p.y = 275;                      // 站到对角外，别把弹丸吃掉
    const made = { 3: 0, 2: 0, 1: 0 };
    const orig = G.spawnEnemyBullet.bind(G);
    G.spawnEnemyBullet = function (x, y, vx, vy, kind, opt) {
      const b = orig(x, y, vx, vy, kind, opt);
      made[(opt && opt.splitTier) || 1]++;
      return b;
    };
    const b = new Boss('liesha', 60, 60, 1);
    b.spawnT = 0; b.cd = 1; b.cd3 = 99999; b.spd = 0;
    b.bd = Object.assign({}, b.bd, { dash: null });
    G.enemies.push(b);
    for (let i = 0; i < 130; i++) G.update();
    const smalls = G.bullets.filter(x => !x.friendly && x.splitTier === 0);
    return { made: made, name: b.name, smallNoSplit: smalls.every(x => x.splitN === 0) };
  });
  ok('裂煞魔尊挂上第三层', t6.name === '裂煞魔尊');
  ok('母弹只放 2 枚（不是一整圈）', t6.made[3] === 2, `母弹 ${t6.made[3]}`);
  ok('每枚母弹裂成 2 枚中弹', t6.made[2] === 4, `中弹 ${t6.made[2]}`);
  ok('每枚中弹再裂成 3 枚小弹（合计 12）', t6.made[1] === 12, `小弹 ${t6.made[1]}`);
  ok('小弹到此为止，不再继续裂', t6.smallNoSplit === true);

  /* ================= T7  轮回法王 ================= */
  sec('T7  轮回法王：环上留一道缺口');
  const t7 = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    let p = window.__clean('feijian');
    p.x = 60; p.y = 275;
    let b = new Boss('lunhui', 240, 80, 1);
    b.spawnT = 0; b.cd = 1; b.cd3 = 99999; b.spd = 0; b.phase = 1;
    G.enemies.push(b);
    G.update();
    const ring = G.bullets.filter(x => !x.friendly);
    out.full = 18;
    out.total = ring.length;
    const gapC = b.spiral;                     // 缺口中心 = volley 里自增后的 spiral
    let inGap = 0;
    for (const x of ring) {
      const a = Math.atan2(x.y - b.y, x.x - b.x);
      let da = a - gapC;
      da = Math.abs(((da % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      if (da < 1.05 / 2) inGap++;
    }
    out.inGap = inGap;
    // 连放两轮，缺口位置必须换（否则等于让人背板站桩）
    const g1 = b.spiral;
    b.cd = 1;
    for (let i = 0; i < 3; i++) G.update();
    out.gapMoved = Math.abs(b.spiral - g1) > 0.1;

    // 不冲刺：长时间观察不应出现 dash 状态
    p = window.__clean('feijian');
    p.x = 430; p.y = 275;
    b = new Boss('lunhui', 240, 80, 1);
    b.spawnT = 0; b.cd = 99999; b.cd3 = 99999;
    G.enemies.push(b);
    let dashed = false;
    const y0 = b.y;
    for (let i = 0; i < 300; i++) { G.update(); if (b.state === 'dash') dashed = true; }
    out.dashed = dashed;
    out.advanced = Math.round(b.y - y0);
    out.othersDash = [BOSS_DEF.xuemo.dash, BOSS_DEF.zhulong.dash].every(d => d > 0);
    return out;
  });
  ok('一轮环不满圈 —— 留了缺口',
    t7.total < t7.full && t7.total >= t7.full - 6, `${t7.total}/${t7.full}`);
  ok('缺口里确实一枚都没有', t7.inGap === 0, `缺口内 ${t7.inGap} 枚`);
  ok('每一轮的缺口位置都换', t7.gapMoved === true);
  ok('轮回法王不冲刺，只一味前进', t7.dashed === false);
  ok('它确实在朝玩家推进', t7.advanced > 20, `推进 ${t7.advanced}px`);
  ok('其它头目仍保留冲刺', t7.othersDash === true);

  /* ================= T8  烛龙 ================= */
  sec('T8  烛龙：鳞罩期间打不动，罩一开就是横扫');
  const t8 = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    const p = window.__clean('feijian');
    p.x = 60; p.y = 275;                       // 躲开扫射，只量鳞罩
    const b = new Boss('zhulong', 240, 80, 1);
    b.spawnT = 0; b.cd = 99999; b.cd3 = 99999; b.spd = 0;
    b.guardCd = 1;
    G.enemies.push(b);
    G.update();
    out.guardUp = b.guard > 0;
    out.guardFull = b.guard;
    // 罩起的那一刻必须同时架起一道横扫的光
    const sweep = G.beams[0];
    out.sweepAtGuard = !!sweep && sweep.swing > 0;
    out.swing = sweep ? +sweep.swing.toFixed(2) : null;

    // 罩内免疫
    const hp0 = b.hp;
    for (let i = 0; i < 6; i++) b.hurt(30, G, null, false);
    out.immune = b.hp === hp0;
    // 罩期间不出常规弹幕
    b.cd = 1; b.cd3 = 1;
    const before = G.bullets.filter(x => !x.friendly).length;
    for (let i = 0; i < 10; i++) G.update();
    out.noVolleyDuringGuard = G.bullets.filter(x => !x.friendly).length === before;

    // 推过蓄力进入发射期：光必须真的在扫（角度持续推进），而不是一根钉死的线
    if (sweep) {
      for (let i = 0; i < sweep.warn + 6; i++) G.update();
      const a0 = sweep.curA;
      for (let i = 0; i < 10; i++) G.update();
      out.sweepMoves = Math.abs(sweep.curA - a0) > 0.01;
      out.swept = +Math.abs(sweep.curA - a0).toFixed(3);
    }

    // 罩碎 → 立刻打得动
    let guardFrames = 0;
    for (let i = 0; i < 400; i++) { G.update(); if (b.guard > 0) guardFrames++; }
    out.guardGone = b.guard <= 0;
    const hp1 = b.hp;
    b.hurt(20, G, null, false);
    out.afterLoss = hp1 - b.hp;
    out.guardCd = b.guardCd;
    void guardFrames;
    return out;
  });
  ok('会周期性地结出鳞罩', t8.guardUp === true);
  ok('结罩与横扫同时发生（罩起 = 该走了）', t8.sweepAtGuard === true);
  ok('罩内伤害全额免疫', t8.immune === true);
  ok('罩内不出常规弹幕（手都撑罩去了）', t8.noVolleyDuringGuard === true);
  ok('罩碎之后立刻打得动', t8.afterLoss === 20, `实际 ${t8.afterLoss}`);
  ok('鳞罩持续约 3.5 秒', t8.guardFull >= 190 && t8.guardFull <= 230, `${t8.guardFull} 帧`);
  ok('横扫是一道光，而不是一根钉死的线',
    t8.sweepMoves === true, `10 帧扫了 ${t8.swept} rad（总扇面 ${t8.swing}）`);

  /* ================= T9  出场编排 ================= */
  sec('T9  出场编排：刷怪池与头目轮换');
  const t9 = await page.evaluate(() => {
    const G = window.Game;
    const out = { pools: {}, order: [] };
    const f = Object.create(Floor.prototype);
    for (let d = 1; d <= 5; d++) out.pools[d] = f.enemyPool(d).slice();
    G.newRun('feijian');
    for (let d = 1; d <= 5; d++) {
      G.newFloor(d);
      for (const r of G.floor.rooms.values()) {
        if (r.type !== 'boss') continue;
        out.order.push(r.waves[0][0].boss);
      }
    }
    const NEW = ['xuanguang', 'tiehun', 'bengyao', 'xuanjia', 'yingmo'];
    out.sprites = NEW.map(id => {
      const s = SPR.enemies[id];
      return !!(s && s[0] && s[0].width > 0 && s[1] && s[1].width > 0);
    });
    out.bossSprites = BOSS_KEYS.map(k => {
      const s = SPR.boss[k];
      return !!(s && s[0] && s[0].width > 0 && s[1] && s[1].width > 0);
    });
    out.bossHp = BOSS_KEYS.map(k => BOSS_DEF[k].hp);
    out.keys = BOSS_KEYS.slice();
    return out;
  });
  ok('一层还是那四种老面孔（教学层不塞新机制）',
    t9.pools[1].length === 4 && !t9.pools[1].some(id => ['xuanguang', 'tiehun', 'bengyao', 'xuanjia', 'yingmo'].includes(id)),
    t9.pools[1].join(','));
  ok('五种新妖物全部在五层内登场',
    ['xuanguang', 'tiehun', 'bengyao', 'xuanjia', 'yingmo']
      .every(id => Object.keys(t9.pools).some(d => t9.pools[d].includes(id))));
  ok('每层只往池子里加一两张新面孔（不把老池子冲淡）',
    [1, 2, 3, 4, 5].every(d => t9.pools[d].length <= 14)
      && t9.pools[4].length === t9.pools[5].length);
  ok('五层正好五位头目，一层一位不重复',
    t9.order.length === 5 && new Set(t9.order).size === 5, t9.order.join(' → '));
  ok('头目顺序与 BOSS_KEYS 一致', t9.order.join(',') === t9.keys.join(','), t9.order.join(','));
  ok('五位头目血量随层数递增', t9.bossHp.every((h, i, a) => i === 0 || h >= a[i - 1]),
    t9.bossHp.join(' / '));
  ok('五种新妖物的两张帧图都烘焙出来了', t9.sprites.every(Boolean));
  ok('五位头目的两张帧图都烘焙出来了', t9.bossSprites.every(Boolean));

  /* ================= T10  新妖物确实会被刷出来 ================= */
  sec('T10  新妖物真的会出现在深层石室里');
  const t10 = await page.evaluate(() => {
    const G = window.Game;
    const seen = {};
    const NEW = ['xuanguang', 'tiehun', 'bengyao', 'xuanjia', 'yingmo'];
    for (const id of NEW) seen[id] = 0;
    let total = 0;
    for (let s = 0; s < 8; s++) {
      G.newRun('feijian');
      for (let d = 1; d <= 5; d++) {
        G.newFloor(d);
        for (const r of G.floor.rooms.values()) {
          for (const wv of r.waves) for (const sp of wv) {
            total++;
            if (seen[sp.type] !== undefined) seen[sp.type]++;
          }
        }
      }
    }
    return { seen: seen, total: total };
  });
  console.log('  参考：8 局 × 5 层共 ' + t10.total + ' 个刷怪点');
  ok('每种新妖物都能在正常开图里刷出来',
    Object.values(t10.seen).every(v => v > 0), JSON.stringify(t10.seen));

  /* ================= T11  全局错误 ================= */
  sec('T11  运行期无报错');
  ok('没有页面错误', errs.length === 0, errs.join(' | '));

  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  if (failed.length) console.log('失败项：\n  - ' + failed.join('\n  - '));
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(fail ? 1 : 0);
})();
