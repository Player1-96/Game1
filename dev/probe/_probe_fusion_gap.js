'use strict';
/* ============================================================
 *  _probe_fusion_gap.js —— 融合配方的「覆盖缺口」探针
 *
 *  回答三个问题：
 *  1) 25 件法宝里，哪些**完全没有任何配方**（永远等不到共鸣光晕）？
 *  2) 玩家手里攒到 N 件时，「凑得出一对可融」的概率是多少？
 *     —— 这个数直接决定「发现」这一层有没有用。太低 = 光晕几乎不亮 = 白做。
 *  3) 一件法宝参与的配方数分布。
 *
 *  纯统计，不改游戏状态。跑法：node dev/probe/_probe_fusion_gap.js
 * ============================================================ */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const r = await page.evaluate(() => {
    const pool = poolByType('fabao');                       // 25 件普通法宝（已排除融合产物）
    const used = {};
    for (const d of FUSION_DEF) { used[d.a] = 1; used[d.b] = 1; }

    const covered = pool.filter(id => used[id]);
    const orphans = pool.filter(id => !used[id]);

    /* 每件参与的配方数 */
    const degree = pool.map(id => ({ id, n: fusionsWith(id).length }));

    /* 蒙特卡洛：从池里随机抽 N 件（不重复），看能不能凑出一对可融 */
    const draw = (n, rng) => {
      const a = pool.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
      return a.slice(0, n);
    };
    const hasPair = hand => {
      for (const d of FUSION_DEF) {
        if (hand.indexOf(d.a) >= 0 && hand.indexOf(d.b) >= 0) {
          if (d.a !== d.b) return true;
          if (hand.filter(x => x === d.a).length >= 2) return true;
        }
      }
      return false;
    };
    const TRIALS = 4000;
    const rate = {};
    for (const n of [4, 5, 6, 7, 8, 10, 12, 15, 20]) {
      let hit = 0;
      for (let i = 0; i < TRIALS; i++) if (hasPair(draw(n, Math.random))) hit++;
      rate[n] = hit / TRIALS;
    }

    /* 「再加 4 条配方」的模拟：用剩下的孤儿法宝凑 4 条，
       看配对概率能涨多少 —— 这个数直接决定「值不值得再加」。 */
    const HYPOTHETICAL = [
      ['jingang', 'xuanyuan'],
      ['tianyan', 'shidu'],
      ['fengxing', 'xiangyun'],
      ['huiling', 'juling']
    ];
    const ratePlus = {};
    const hasPair2 = hand => {
      const all = FUSION_DEF.concat(HYPOTHETICAL.map((p, i) => ({ id: 'hyp' + i, a: p[0], b: p[1] })));
      for (const d of all) {
        if (hand.indexOf(d.a) >= 0 && hand.indexOf(d.b) >= 0) {
          if (d.a !== d.b) return true;
          if (hand.filter(x => x === d.a).length >= 2) return true;
        }
      }
      return false;
    };
    for (const n of [6, 8, 10, 12, 15]) {
      let hit = 0;
      for (let i = 0; i < TRIALS; i++) if (hasPair2(draw(n, Math.random))) hit++;
      ratePlus[n] = hit / TRIALS;
    }

    return {
      poolSize: pool.length,
      defs: FUSION_DEF.length,
      pairsTotal: pool.length * (pool.length - 1) / 2,
      covered: covered,
      orphans: orphans.map(id => ({ id, name: (ITEM_MAP[id] || {}).name, desc: (ITEM_MAP[id] || {}).desc })),
      coveredNames: covered.map(id => (ITEM_MAP[id] || {}).name),
      orphansCount: orphans.length,
      coveredCount: covered.length,
      hypCovered: HYPOTHETICAL.reduce((acc, p) => acc.concat(p), []).length,
      degree: degree.map(d => ({ id: d.id, name: (ITEM_MAP[d.id] || {}).name, n: d.n }))
        .sort((a, b) => b.n - a.n),
      rate: rate,
      ratePlus: ratePlus
    };
  });

  console.log('══════════════════════════════════════════════════');
  console.log('  融合配方的覆盖缺口');
  console.log('══════════════════════════════════════════════════\n');
  console.log('普通法宝池：' + r.poolSize + ' 件　配方：' + r.defs + ' 条');
  console.log('理论组合数：C(' + r.poolSize + ',2) = ' + r.pairsTotal + ' 种');
  console.log('有配方的法宝：' + r.coveredCount + ' 件 / ' + r.poolSize + ' 件　'
    + '→ ' + r.coveredNames.join('、'));

  console.log('\n─── 完全没有配方的法宝（' + r.orphansCount + ' 件）───');
  r.orphans.forEach(o => console.log('  ' + o.name.padEnd(7, '　') + '　' + (o.desc || '')));

  console.log('\n─── 每件参与的配方数 ───');
  console.log('  ' + r.degree.map(d => d.name + ':' + d.n).join('　'));
  console.log('  ⚠️ 全部是 1 —— 没有任何一件是「枢纽」，也没有任何一件参与两条配方');

  console.log('\n─── 手里有 N 件时，凑得出一对可融的概率 ───');
  console.log('   N  | 现在(6条) | 加4条(10条) | 提升');
  console.log('  ----+-----------+-------------+------');
  Object.keys(r.rate).forEach(n => {
    const a = r.rate[n], b = r.ratePlus[n];
    if (b === undefined) return;
    console.log('  ' + String(n).padStart(3) + ' | ' + (a * 100).toFixed(1).padStart(8) + '% | '
      + (b * 100).toFixed(1).padStart(10) + '% | +'
      + ((b - a) * 100).toFixed(1) + 'pt');
  });
  console.log('\n  （一局 15 层大约能拿到 24 件法宝，但同时在手的一般只有 6~10 件）');

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
