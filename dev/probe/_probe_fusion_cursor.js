'use strict';
/* 探针：融合面板里，方向键到底要走几步才能摸到想融的那件？
   用户 2026-09-30 反馈：选完第一个材料后，配不上的法宝照样能被光标选中，
   得按十几次方向键才挪到目标。

   这个探针量的是**真实体验指标**（走一圈要按几下 / 有没有踩到灰格），
   而不是「有没有 fusionCursor 这个方法」—— 属性断言拦不住「接线接了一半」。

   手牌不写死：直接从 FUSION_DEF 取材料，保证池子够大；
   并跑两组对照 —— 第一槽选「伙伴最少」与「伙伴最多」的件（收益的两端）。 */
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(FILE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const r = await p.evaluate(() => {
    const G = window.Game;
    const out = {};
    const nameOf = id => (ITEM_MAP[id] || {}).name || id;
    const close = () => { let g = 0; while (G.state === 'fusion' && g++ < 12) G.fusionBack(); };

    const mats = [];
    for (const rec of FUSION_DEF) {
      if (mats.indexOf(rec.a) < 0) mats.push(rec.a);
      if (mats.indexOf(rec.b) < 0) mats.push(rec.b);
      if (mats.length >= 10) break;
    }
    out.hand = mats.map(nameOf).join(' / ');

    const setup = () => {
      G.newRun('feijian'); G.state = 'play';
      const pl = G.player;
      pl.items.length = 0; pl.recomputeStats('feijian');
      for (const id of mats) pl.give(id, G);
      G.itemPopup = null;
      G.room.obstacles.length = 0;
      const spot = G.spotForProp(ROOM_W / 2, ROOM_H / 2, 16);
      const prop = new Prop('forge', spot.x, spot.y, { kind: 'forge' });
      G.props.push(prop);
      pl.x = prop.x; pl.y = prop.y;
      G.openFusion(prop);
      return prop;
    };

    /* 跑一组：第一槽放谁由 rule 决定（min = 伙伴最少，max = 伙伴最多） */
    const runCase = (rule) => {
      close();
      setup();
      if (G.state !== 'fusion' || !G.fusion) return { err: '面板没开' };
      const pool = G.fusion.pool, N = pool.length;
      const partnersOf = id => pool.filter(x => x !== id && !!fusionRecipeOf(id, x)).length;
      const pats = pool.map(partnersOf);
      let pickAt = -1, best = rule === 'min' ? Infinity : -1;
      pool.forEach((id, i) => {
        const n = pats[i];
        if (n < 1) return;
        if (rule === 'min' ? n < best : n > best) { best = n; pickAt = i; }
      });
      const pickId = pool[pickAt];
      const idxA = pickAt;

      G.fusion.idx = idxA;
      G.fusionTake();
      const cand = G.fusionCursor();
      const snappedIdx = G.fusion.idx;

      /* 最坏目标：候选里「离第一槽池内环形距离最远」的那件 */
      const worst = cand.map(i => ({ i: i, d: (i - idxA + N) % N })).sort((a, b) => b.d - a.d)[0];
      /* 修后走到同一件要几步：从吸附位置在候选圈里走 */
      const posSnap = cand.indexOf(snappedIdx);
      const posWorst = cand.indexOf(worst.i);
      const afterSteps = (posWorst - posSnap + cand.length) % cand.length;

      /* 实走一圈：验落点全亮、且圈长 = 候选数（不是池大小） */
      G.fusion.idx = snappedIdx;
      const walk = [];
      for (let k = 0; k < N + 2; k++) { G.fusionMove(1); walk.push(G.fusion.idx); }
      const gray = walk.filter(i => !fusionRecipeOf(G.fusion.slots[0], pool[i])).length;
      const cycle = (() => { const s = {}; for (let k = 0; k < walk.length; k++) { if (s[walk[k]]) return k; s[walk[k]] = 1; } return walk.length; })();

      const res = {
        第一槽: nameOf(pickId),
        它的伙伴数: cand.length,
        池大小: N,
        光标吸附到: nameOf(pool[snappedIdx]),
        走一圈步数_修前: N,
        走一圈步数_修后: cycle,
        最坏目标: nameOf(pool[worst.i]),
        到最坏目标步数_修前: worst.d,
        到最坏目标步数_修后: afterSteps,
        灰格命中数: gray,
        兜底消息: G.fusion.msg || '(无)'
      };

      /* 点灰格：不放入，但给一句人话 */
      const cells = Array.from(document.querySelectorAll('#fusion .fusItem'));
      const grayIdx = [...Array(N).keys()].filter(i => !fusionRecipeOf(G.fusion.slots[0], pool[i]))[0];
      if (grayIdx !== undefined && cells[grayIdx]) {
        cells[grayIdx].click();
        res.点灰格 = { 提示: G.fusion ? G.fusion.msg : '(面板关了)', 二槽: G.fusion && G.fusion.slots[1] ? nameOf(G.fusion.slots[1]) : null };
      }
      if (rule === 'min') {
        res.说明面板 = (document.querySelector('#fusion .pickTip') || {}).textContent || '';
      }
      G.fusionDrop();
      res.取回后候选数 = G.fusionCursor().length;
      return res;
    };

    try {
      out['A 第一槽选伙伴最少的'] = runCase('min');
      out['B 第一槽选伙伴最多的（枢纽件）'] = runCase('max');
    } catch (e) { out.errAt1 = e.message; }

    /* ---------- ② 第一槽选了「谁都配不上」的那件：不锁死 + 明说 ---------- */
    try {
      close();
      /* 手牌：一对能融的 + 一件「也参与配方、但和这一对都配不上」的。
         这样面板开得出来（有 ready 组合），但玩家第一槽可以选错。
         ⚠️ 这件要**动态找** —— 写死「玄冰符」是错的：它和引雷符其实是配的
            （冰 + 雷 = 霜雷），第一版探针就是因为这个没构造出场景。 */
      const rec0 = FUSION_DEF[0];
      const A = rec0.a, B = rec0.b;
      const allMats = [];
      for (const rc of FUSION_DEF) {
        if (allMats.indexOf(rc.a) < 0) allMats.push(rc.a);
        if (allMats.indexOf(rc.b) < 0) allMats.push(rc.b);
      }
      const C = allMats.filter(c => c !== A && c !== B
        && !fusionRecipeOf(A, c) && !fusionRecipeOf(B, c))[0];
      out.lonePair = nameOf(A) + ' + ' + nameOf(B);
      out.loneTry = C ? nameOf(C) : '(找不到)';
      mats.length = 0;
      mats.push(A, B, C);
      setup();
      const pool = G.fusion.pool;
      out.lonePool = pool.map(nameOf).join(' / ');
      const lone = pool.filter(id => pool.filter(x => x !== id && !!fusionRecipeOf(id, x)).length === 0);
      out.loneCells = lone.map(nameOf).join(' / ');
      if (G.fusion && lone.length) {
        G.fusion.idx = pool.indexOf(lone[0]);
        G.fusionTake();
        out.lone_选了 = nameOf(lone[0]);
        out.lone_msg = G.fusion.msg;
        out.lone_cursorN = G.fusionCursor().length;
        const b0 = G.fusion.idx;
        G.fusionMove(1);
        out.lone_movable = G.fusion.idx !== b0;
        G.fusionDrop();
      }
    } catch (e) { out.errAt2 = e.message; }

    return out;
  });

  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
