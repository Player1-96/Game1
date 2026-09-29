'use strict';
/* 探针：融合「逐侧继承」规则（2026-09-29）。
   要坐实三件事：
   ① 阶位 = ceil((a+b)/2)，所以 1+1=1、1+2=2、2+2=2
   ② 产物数值**逐字段 ≥ 两件材料的全部件数之和**（含数值型的精炼补偿）
      —— 全组合扫描，一个配方一个 (a,b)
   ③ 消耗的是整条线（件数全烧），且材料进 usedMats、不再从掉落池出 */
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
    const NUM = ['damage', 'fireRate', 'speed', 'shotSpeed', 'range', 'pierce', 'spread',
      'homing', 'homingRange', 'knockback', 'luck', 'burn', 'frost', 'chain', 'iframe',
      'greed', 'crit', 'poison', 'regen', 'mpRegen', 'soul', 'deflect', 'reflect'];

    /* 材料之和（含数值型每多一件的 +0.5 伤害精炼补偿） */
    const matSum = (rec, a, b2) => {
      const q = new Player(0, 0);
      for (let k = 0; k < a; k++) ITEM_MAP[rec.a].apply(q, k, 'feijian');
      for (let k = 0; k < b2; k++) ITEM_MAP[rec.b].apply(q, k, 'feijian');
      q.stats.damage += 0.5 * ((a - 1) + (b2 - 1));
      return q.stats;
    };

    /* 真的走一遍融合：给 a 件 A + b 件 B，融，返回产物状态 */
    const run = (rec, a, b2) => {
      G.newRun('feijian');
      const pl = G.player;
      for (let k = 0; k < a; k++) pl.give(rec.a, G);
      for (let k = 0; k < b2; k++) pl.give(rec.b, G);
      const res = fusionExecute(G, rec.a, rec.b);
      return { res: res, pl: pl };
    };

    /* ① 阶位表 */
    const lvTable = {};
    for (const [a, b2] of [[1, 1], [1, 2], [2, 2], [1, 3], [2, 3], [3, 3], [3, 1], [5, 5], [9, 9]]) {
      lvTable[a + '+' + b2] = fusionLevel(a, b2);
    }

    /* ② 全组合扫「不许变弱」+ ③ 消耗与禁抽 */
    const failures = [];
    let pairs = 0;
    let exact = 0;
    for (const rec of FUSION_DEF) {
      for (let a = 1; a <= 4; a++) {
        for (let b2 = 1; b2 <= 4; b2++) {
          pairs++;
          const out = run(rec, a, b2);
          if (!out.res.ok) { failures.push(rec.id + '(' + a + ',' + b2 + ') 融合失败'); continue; }
          const prod = out.pl.stats;
          const want = matSum(rec, a, b2);

          /* 不许变弱 */
          const worse = [];
          for (const k of NUM) {
            const w = +(+want[k]).toFixed(6), g2 = +(+prod[k]).toFixed(6);
            if (g2 < w - 1e-9) worse.push(k + ' ' + w + '→' + g2);
          }
          if (worse.length) failures.push(rec.id + '(' + a + ',' + b2 + ') 变弱: ' + worse.join(','));

          /* 件数必须被整条烧掉、材料必须进 usedMats */
          const left = out.pl.items.filter(x => x === rec.a || x === rec.b).length;
          if (left) failures.push(rec.id + '(' + a + ',' + b2 + ') 材料残留 ' + left + ' 件');
          if (!out.pl.usedMats[rec.a] || !out.pl.usedMats[rec.b]) {
            failures.push(rec.id + '(' + a + ',' + b2 + ') 未记入 usedMats');
          }
          if (out.pl.items.length !== 1) failures.push(rec.id + '(' + a + ',' + b2 + ') 背包剩 ' + out.pl.items.length);

          /* 逐字段完全相等 = 这条规则的最强承诺，统计一下命中率 */
          let same = true;
          for (const k of NUM) {
            if (Math.abs((+prod[k]) - (+want[k])) > 1e-9) { same = false; break; }
          }
          if (same) exact++;
        }
      }
    }

    /* ③b 真的抽 3000 次，看材料还会不会冒出来 */
    G.newRun('feijian');
    const pl2 = G.player;
    pl2.usedMats = { qingfeng: true, leifu: true };
    const banned = { qingfeng: true, leifu: true };
    let leak = 0;
    for (let i = 0; i < 3000; i++) {
      const id = rollFabaoId(Math.random, [], 'cn', banned);
      if (id === 'qingfeng' || id === 'leifu') leak++;
    }

    return { lvTable: lvTable, pairs: pairs, exact: exact, failures: failures.slice(0, 12),
             failCount: failures.length, leak3000: leak,
             sample: run(FUSION_DEF.filter(x => x.id === 'leiji')[0], 2, 2).res };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
