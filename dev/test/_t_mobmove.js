'use strict';
/* 妖物「招式」框架自检（2026-10-15 样板怪 = 蟾蜍妖）。
   钉四件事：① 动作三段的推进与**生效时刻** ② 段位解锁与距离适用性
             ③ 三招各自真的做了什么 ④ 没进表的怪行为一个字节都没变 */
const { chromium } = require('playwright');
const path = require('path');
const BASE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '   ' + extra : '')); } else { fail++; console.log('  FAIL  ' + name + '   ' + (extra || '')); } };

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1200, height: 820 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  /* ============ ① 表本身：三段齐全、字段合法 ============ */
  console.log('=== ① MOB_ACT 表结构 ===');
  const t1 = await p.evaluate(() => {
    const T = MOB_ACT.chanchu;
    const acts = Object.keys(T).filter(k => k !== 'idle');
    return {
      hasIdle: !!T.idle, idleF: T.idle ? T.idle.f.length : 0,
      acts: acts,
      bad: acts.filter(k => ['wind', 'fire', 'back'].some(s => !T[k][s] || !(T[k][s].t > 0))),
      noExec: acts.filter(k => typeof T[k].fire.exec !== 'function'),
      noFrames: acts.filter(k => ['wind', 'fire', 'back'].some(s => !T[k][s].f || !T[k][s].f.length)),
      segs: acts.map(k => k + '=' + T[k].seg).join(' ')
    };
  });
  ok('有 idle 待机序列（3 帧）', t1.hasIdle && t1.idleF === 3, t1.idleF + ' 帧');
  ok('共 3 个招式，且每个都是 wind/fire/back 三段齐全', t1.acts.length === 3 && t1.bad.length === 0,
    t1.acts.join(',') + (t1.bad.length ? ' 缺段:' + t1.bad.join(',') : ''));
  ok('每招都有 fire.exec（生效点）与每段的帧序列', t1.noExec.length === 0 && t1.noFrames.length === 0,
    '缺 exec:' + t1.noExec.join(',') + ' 缺帧:' + t1.noFrames.join(','));
  ok('段位分配：三连弹=段一 / 毒沼=段二 / 黏舌=段三', t1.segs === 'spit3=0 venom=1 tongue=2', t1.segs);

  /* ============ ② 生效时刻：前摇真的在，且 cd 没被扣 ============ */
  console.log('=== ② 动作推进与生效时刻 ===');
  const t2 = await p.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    G.state = 'play';
    G.enemies.length = 0; G.bullets.length = 0; G.hazards.length = 0;
    G.player.x = 240; G.player.y = 120; G.player.vx = 0; G.player.vy = 0;
    const e = new Enemy('chanchu', 240, 200, 1);
    e.spawnT = 0;
    G.enemies.push(e);
    /* 用真实 AI 走一遍：cd 归零那帧会 startAct，而不是直接发弹 */
    e.cd = 1;
    const before = G.bullets.length;
    e.update(G);
    const started = !!e.act;
    const bulletsAtStart = G.bullets.length - before;
    /* 记下 cd 被设成了多少（补前摇**不扣 cd** → 仍应落在 95~135） */
    const cdSet = e.cd;
    /* 手动推进动作，记录子弹第一次出现的 tick */
    let firstFire = -1;
    for (let i = 1; i <= 40; i++) {
      const n0 = G.bullets.length;
      e.actTick(G);
      if (firstFire < 0 && G.bullets.length > n0) firstFire = i;
      if (!e.act) break;
    }
    return { started: started, bulletsAtStart: bulletsAtStart, cdSet: cdSet, firstFire: firstFire, windT: MOB_ACT.chanchu.spit3.wind.t };
  });
  ok('★ 出手不再"当帧发弹"：cd 归零那帧只进入动作，子弹数不变',
    t2.started === true && t2.bulletsAtStart === 0, '本帧发弹 ' + t2.bulletsAtStart + ' 发');
  ok('★ 前摇确实存在：第 ' + t2.windT + ' 帧（wind 段走完）才真正发弹',
    t2.firstFire === t2.windT + 1, '首发在第 ' + t2.firstFire + ' 次推进');
  ok('★ 补前摇**没有扣 cd**（用户选的 ①：发弹整体后推，玩家更从容）',
    t2.cdSet >= 95 && t2.cdSet <= 135, 'cd = ' + t2.cdSet);

  /* ============ ③ 段推进：总帧数 = wind+fire+back，且形变有压有拉 ============ */
  const t3 = await p.evaluate(() => {
    const G = window.Game;
    const e = new Enemy('chanchu', 240, 200, 1);
    e.spawnT = 0;
    const A = MOB_ACT.chanchu.venom;
    const total = A.wind.t + A.fire.t + A.back.t;
    e.startAct('venom');
    const seen = [];
    const sys = [];
    for (let i = 0; i < total + 2; i++) {
      if (!e.act) break;
      e.actTick(G);
      seen.push(e.act ? e.act.seg : 'done');
      sys.push(e.actSY);
    }
    return {
      len: seen.length, total: total,
      segs: Array.from(new Set(seen)).join('>'),
      maxSY: Math.max(...sys), minSY: Math.min(...sys), last: seen[seen.length - 1]
    };
  });
  ok('动作总帧数 = wind + fire + back', t3.len === t3.total, t3.len + ' / ' + t3.total);
  ok('三段依次推进 wind > fire > back 后结束', t3.segs === 'wind>fire>back>done', t3.segs);
  ok('★ 形变两头都有：预备被压扁、出手被拉长（不是只改帧不改形状）',
    t3.minSY < 1 && t3.maxSY > 1, 'sy ' + t3.minSY + ' ~ ' + t3.maxSY);

  /* ============ ④ 待机三帧 & 与动作不打架 ============ */
  const t4 = await p.evaluate(() => {
    const G = window.Game;
    const e = new Enemy('chanchu', 240, 200, 1);
    e.spawnT = 0;
    const pick = t => { e.t = t; e.act = null; e.update(G); return e.frame; };
    const a = pick(0), bb = pick(24), c = pick(48);
    /* 动作期间不许被待机帧覆盖 */
    e.startAct('spit3');
    e.t = 0; e.update(G);
    const during = e.frame;
    return { a: a, b: bb, c: c, during: during };
  });
  ok('待机是 3 帧循环（0 / 1 / 2），不再是两帧平移', t4.a === 0 && t4.b === 1 && t4.c === 2,
    [t4.a, t4.b, t4.c].join('/'));
  ok('★ 出手期间待机帧不会覆盖动作帧（否则动作会抖）',
    t4.during === 0 || t4.during === 3, '出手首帧 = ' + t4.during);

  /* ============ ⑤ 段位解锁 + 距离适用性 ============ */
  const t5 = await p.evaluate(() => {
    const G = window.Game;
    /* ⚠️ 采样距离必须落在黏舌的 range（0~110）以内，否则段三也抽不到它 ——
       第一版用 120 就这么假失败了。玩家放 (240,120)、怪放其正下方 dist 处（都在房间内）。 */
    const sample = (depth, dist) => {
      G.depth = depth;
      G.player.x = 240; G.player.y = 120;
      const e = new Enemy('chanchu', 240, 120 + dist, 1);
      e.spawnT = 0;
      const cnt = {};
      for (let i = 0; i < 600; i++) {
        e.lastAct = null;                 // 关掉"刚用过不重复"的权重，纯看解锁
        const n = pickMobAct(e, G);
        cnt[n] = (cnt[n] || 0) + 1;
      }
      return cnt;
    };
    return { seg1: sample(1, 90), seg2: sample(7, 90), seg3: sample(13, 90), far: sample(13, 260) };
  });
  ok('段一：只会三连弹（毒沼 / 黏舌都还没解锁）',
    t5.seg1.spit3 > 0 && !t5.seg1.venom && !t5.seg1.tongue, JSON.stringify(t5.seg1));
  ok('段二：解锁毒沼', t5.seg2.spit3 > 0 && t5.seg2.venom > 0 && !t5.seg2.tongue, JSON.stringify(t5.seg2));
  ok('段三：三招齐（含黏舌）',
    t5.seg3.spit3 > 0 && t5.seg3.venom > 0 && t5.seg3.tongue > 0, JSON.stringify(t5.seg3));
  ok('★ 黏舌是近距招：260px 外抽不到（range 生效）',
    !t5.far.tongue && t5.far.spit3 > 0, JSON.stringify(t5.far));

  /* 连招抑制：刚用过的招权重降到 0.15 */
  const t6 = await p.evaluate(() => {
    const G = window.Game;
    G.depth = 13; G.player.x = 240; G.player.y = 120;
    const e = new Enemy('chanchu', 240, 120 + 300, 1); e.spawnT = 0;
    const cnt = {};
    for (let i = 0; i < 600; i++) { e.lastAct = 'spit3'; const n = pickMobAct(e, G); cnt[n] = (cnt[n] || 0) + 1; }
    return cnt;
  });
  ok('★ 刚用过的招权重被压低（同一招连发是"单调感"最直接的来源）',
    t6.spit3 / 600 < 0.35, 'spit3 占比 ' + (t6.spit3 / 600 * 100).toFixed(0) + '%（未压低时约 33%，压低后应明显更低）');

  /* ============ ⑥ 三招各自做了什么 ============ */
  console.log('=== ⑥ 三招实效 ===');
  const t7 = await p.evaluate(() => {
    const G = window.Game;
    const out = {};
    /* ① 三连弹：3 发 */
    G.enemies.length = 0; G.bullets.length = 0; G.hazards.length = 0;
    G.player.x = 240; G.player.y = 120;
    let e = new Enemy('chanchu', 240, 200, 1); e.spawnT = 0; e.frame = 4;
    actSpitThree.call(e, G);
    out.spit3 = G.bullets.length;

    /* ② 毒沼：3 发弹 + 1 片毒沼，且落点在**玩家速度方向的前方**（退路） */
    G.bullets.length = 0; G.hazards.length = 0;
    G.player.x = 240; G.player.y = 120; G.player.vx = 3; G.player.vy = 0;
    e = new Enemy('chanchu', 240, 200, 1); e.spawnT = 0;
    actVenom.call(e, G);
    const h = G.hazards[G.hazards.length - 1];
    out.venom = {
      bullets: G.bullets.length, hazards: G.hazards.length,
      dx: h ? Math.round(h.x - G.player.x) : null,
      dy: h ? Math.round(h.y - G.player.y) : null,
      warn: h ? h.warn : null, life: h ? h.life : null, r: h ? h.r : null
    };

    /* ③ 黏舌：近距命中 → 拉近 + 封技；远距 → 只出动作 */
    G.player.x = 240; G.player.y = 120; G.player.vx = 0; G.player.vy = 0;
    G.player.skillCd = [0, 0, 0]; G.player.slotIdx = 1;
    e = new Enemy('chanchu', 240, 200, 1); e.spawnT = 0;   // 距离 80 < 110
    const d0 = Math.hypot(G.player.x - e.x, G.player.y - e.y);
    actTongue.call(e, G);
    const d1 = Math.hypot(G.player.x - e.x, G.player.y - e.y);
    out.tongue = {
      d0: Math.round(d0), d1: Math.round(d1),
      cd1: G.player.skillCd[1], tongueFx: e.tongue,
      /* 拉近后不许被拽进墙里 */
      inWall: G.player.x < WALL_L + 16 || G.player.x > WALL_R - 16 || G.player.y < WALL_T + 16 || G.player.y > WALL_B - 16
    };
    /* 远距：不动人、不封技 */
    G.player.x = 240; G.player.y = 120; G.player.skillCd = [0, 0, 0];
    const far = new Enemy('chanchu', 240, 120 + 300, 1); far.spawnT = 0;
    actTongue.call(far, G);
    out.tongueFar = { cd: G.player.skillCd[1], moved: Math.round(Math.hypot(G.player.x - 240, G.player.y - 120)) };
    return out;
  });
  ok('三连弹还是 3 发（原来的手感没变）', t7.spit3 === 3, t7.spit3 + ' 发');
  ok('★ 毒沼：弹照旧 3 发 + 多出 1 片沼，参数与精英"万毒蟾尊"一致（r30/warn26/life200）',
    t7.venom.bullets === 3 && t7.venom.hazards === 1 && t7.venom.r === 30 && t7.venom.warn === 26 && t7.venom.life === 200,
    JSON.stringify(t7.venom));
  ok('★★ 毒沼落在**玩家的退路上**（速度方向前方约 48px），不是随机落点 —— 这才是「封退路」',
    Math.abs(t7.venom.dx - 48) <= 1 && Math.abs(t7.venom.dy) <= 1,
    '相对玩家 (' + t7.venom.dx + ',' + t7.venom.dy + ')');
  ok('★ 黏舌近距命中：把玩家拽近（距离变小）',
    t7.tongue.d1 < t7.tongue.d0, t7.tongue.d0 + ' → ' + t7.tongue.d1 + ' px');
  ok('★ 黏舌命中还会**封掉当前槽位的技能 2 秒**（120 帧）',
    t7.tongue.cd1 >= 120, 'skillCd[1] = ' + t7.tongue.cd1);
  ok('黏舌把玩家拽回来时不会拽进墙里（走的是擒龙手那套 clamp）', t7.tongue.inWall === false);
  ok('黏舌够不着时只出动作、不生效（读得出来的空挥）',
    t7.tongueFar.cd === 0 && t7.tongueFar.moved === 0, JSON.stringify(t7.tongueFar));

  /* ============ ⑦ 没进表的怪：行为一个字节都没变 ============ */
  console.log('=== ⑦ 回归：未改造的怪 ===');
  const t8 = await p.evaluate(() => {
    const G = window.Game;
    const e = new Enemy('xiesui', 240, 200, 1);
    e.spawnT = 0;
    /* ⚠️ `update()` 开头会 `this.t++`，所以要**先减一**才能命中 `t % 16 === 0` 那一帧
       （第一版直接传 0/16/32，全都对不上，看起来像"帧没变"）。 */
    const frames = [16, 32, 48].map(t => { e.t = t - 1; e.update(G); return e.frame; });
    let acts = 0;
    for (let i = 0; i < 300; i++) { e.update(G); if (e.act) acts++; }
    return { frames: frames, acts: acts, hasTable: !!mobActOf(e) };
  });
  ok('邪祟没有动作表，仍走原来的两帧翻转', t8.hasTable === false && t8.frames.join('/') === '1/0/1',
    t8.frames.join('/'));
  ok('未改造的怪永远不会进入"出手"状态', t8.acts === 0, t8.acts + ' 帧在出手');

  /* 数值没被顺手改掉 */
  const t9 = await p.evaluate(() => {
    const d = ENEMY_DEF.chanchu;
    return { hp: d.hp, speed: d.speed, r: d.r, touch: d.touch, coins: d.coins, score: d.score, ai: d.ai };
  });
  ok('★ 蟾蜍的数值一个都没动（本方案只管"做什么"，不管"多强"）',
    t9.hp === 18 && t9.speed === 0.45 && t9.r === 8 && t9.touch === 1 && t9.coins === 2 && t9.score === 14 && t9.ai === 'spit',
    JSON.stringify(t9));

  ok('全程无 pageerror', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL', (e && e.stack) || e); process.exit(1); });
