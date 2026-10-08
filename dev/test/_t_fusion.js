'use strict';
/* ============================================================
 *  _t_fusion.js —— 法宝融合（第 3 期）・回归
 *
 *  覆盖：
 *    T1 配方表结构：材料/产物都存在、产物在 ITEM_MAP、无重覆、无自环
 *    T2 「真融合」判据：每条产物都必须带至少一个**新机制**（不是纯数值）
 *    T3 融合产物不进随机池（金匣/坊市/宝箱都抽不到）
 *    T4 ⭐ 属性重算：扣掉材料后 stats 必须回到「只剩持有物」的正确值
 *    T5 执行：材料消耗 / 产物入袋 / 图鉴收录 / 首次标记
 *    T6 拒绝：材料不足、两件无配方
 *    T7 图鉴：落盘、跨局保留、挑战与无尽配装不解锁
 *    T8 融合阵生成：段末必出、每层至多一座
 *    T9 面板交互：开关 / 选料 / 退料 / 确认
 *    T10 运行期无报错
 * ============================================================ */
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console.error] ' + m.text()); });

  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(200);

  console.log('══════════════════════════════════════════════════');
  console.log('  法宝融合（第 3 期）　回归');
  console.log('══════════════════════════════════════════════════');

  /* ---------------------------------------------------------------
   *  T1 配方表结构
   * ------------------------------------------------------------- */
  sec('T1  配方表结构');
  const t1 = await page.evaluate(() => {
    const rows = FUSION_DEF.map(r => {
      const a = ITEM_MAP[r.a], b = ITEM_MAP[r.b], out = ITEM_MAP[r.id];
      return {
        id: r.id, a: r.a, b: r.b,
        aOk: !!a, bOk: !!b, outOk: !!out,
        outFabao: !!out && out.type === 'fabao',
        outFusion: !!out && out.fusion === true,
        selfLoop: r.a === r.id || r.b === r.id
      };
    });
    const ids = FUSION_DEF.map(r => r.id);
    const pairs = FUSION_DEF.map(r => [r.a, r.b].sort().join('+'));
    return {
      n: FUSION_DEF.length,
      rows: rows,
      itemCount: ITEM_DEFS.length,
      poolCount: poolByType('fabao').length,
      dupIds: ids.length !== new Set(ids).size,
      dupPairs: pairs.length !== new Set(pairs).size
    };
  });
  console.log('    配方 ' + t1.n + ' 条；道具总数 ' + t1.itemCount + '；随机法宝池 ' + t1.poolCount);
  t1.rows.forEach(r => console.log('      ' + r.a + ' + ' + r.b + ' → ' + r.id));
  /* 第三批（北欧内部 4 + 跨世界 5）之后是 25 条。上限放宽到 40 ——
     这条断言的本意是「别做组合爆炸」，不是卡死一个数字。 */
  ok('配方数在 10~40 之间（防组合爆炸）', t1.n >= 10 && t1.n <= 40, String(t1.n));
  ok('每条配方的两件材料都存在于道具表', t1.rows.every(r => r.aOk && r.bOk));
  ok('每条配方的产物都存在于道具表', t1.rows.every(r => r.outOk));
  ok('产物都是法宝且带 fusion 标记', t1.rows.every(r => r.outFabao && r.outFusion));
  ok('没有自环（产物不能再当自己的材料）', t1.rows.every(r => !r.selfLoop));
  ok('配方 id 不重复', !t1.dupIds);
  ok('配方「材料对」不重复', !t1.dupPairs);

  /* ---------------------------------------------------------------
   *  T1b ⭐「一对多」结构
   *     一件法宝只有一条配方 = 凑齐即唯一解 = 没有决策。
   *     必须有若干件能通向 2~3 条不同的产物，「融哪个」才成立。
   * ------------------------------------------------------------- */
  sec('T1b  一对多结构（同一个法宝有多条路可选）');
  const t1b = await page.evaluate(() => {
    const pool = poolByType('fabao');
    const deg = pool.map(id => ({ id, name: (ITEM_MAP[id] || {}).name, n: fusionsWith(id).length }))
      .sort((a, b) => b.n - a.n);
    const covered = deg.filter(d => d.n > 0);
    /* 配方之间不能是同一条材料对（否则就是重复定义，玩家看不出区别） */
    const pairKey = r => [r.a, r.b].sort().join('+');
    const keys = FUSION_DEF.map(pairKey);
    return {
      deg: deg,
      maxDeg: deg[0] ? deg[0].n : 0,
      twoPlus: covered.filter(d => d.n >= 2).length,
      threePlus: covered.filter(d => d.n >= 3).length,
      coveredCount: covered.length,
      poolSize: pool.length,
      orphans: deg.filter(d => d.n === 0).map(d => d.name),
      dupPair: keys.length !== new Set(keys).size
    };
  });
  console.log('    度数最高的几件：' + t1b.deg.slice(0, 8)
    .map(d => d.name + '×' + d.n).join('　'));
  console.log('    覆盖 ' + t1b.coveredCount + '/' + t1b.poolSize + ' 件；'
    + '≥2 条路的有 ' + t1b.twoPlus + ' 件；≥3 条路的有 ' + t1b.threePlus + ' 件');
  if (t1b.orphans.length) console.log('    仍无配方：' + t1b.orphans.join('、'));
  ok('存在能通向 3 条不同产物的法宝（真正的枢纽）',
    t1b.threePlus >= 2, t1b.threePlus + ' 件');
  ok('有相当一批法宝能通向 2 条以上（不是「一对一定死」）',
    t1b.twoPlus >= 5, t1b.twoPlus + ' 件');
  ok('覆盖率过半（大部分法宝都有机缘）',
    t1b.coveredCount / t1b.poolSize > 0.7,
    t1b.coveredCount + '/' + t1b.poolSize);
  ok('没有任何两条配方共用同一对材料', !t1b.dupPair);

  /* ---------------------------------------------------------------
   *  T2 「真融合」判据 —— 如果说明能用「伤害 +X%」写完，它就是假的
   * ------------------------------------------------------------- */
  sec('T2  真融合判据：每条产物都要带新机制');
  const t2 = await page.evaluate(() => {
    const out = [];
    for (const r of FUSION_DEF) {
      const p = new Player(100, 100);
      const def = ITEM_MAP[r.id];
      def.apply(p, 0, 'feijian');
      const mech = Object.keys(p.stats.fus || {}).filter(k => p.stats.fus[k]);
      out.push({ id: r.id, name: def.name, mech: mech, desc: def.desc });
    }
    return out;
  });
  t2.forEach(r => console.log('      ' + r.name + '：' + (r.mech.join(',') || '（无）') + '　「' + r.desc + '」'));
  ok('每条产物都注入了至少一个融合机制（不是纯数值法宝）',
    t2.every(r => r.mech.length > 0),
    t2.filter(r => !r.mech.length).map(r => r.id).join(',') || '');
  ok('产物说明里不出现「伤害 +N」这种纯数值写法',
    t2.every(r => !/伤害\s*\+/.test(r.desc) && !/^伤害/.test(r.desc)),
    t2.filter(r => /伤害\s*\+/.test(r.desc)).map(r => r.id).join(',') || '');

  /* ---------------------------------------------------------------
   *  T2b ⭐「融合不许变弱」不变式
   *      产物必须**逐字段 ≥「两件材料都留着」**。
   *      用户 2026-09-24 问「有没有融合完反而变弱的」，一查真有 5 处：
   *      两条「太虚」丢了 shieldCap（等于没了自动回盾）、
   *      万剑归宗追敌 0.14→0.10、洞冥珠暴击 0.20→0.12、
   *      灵脉把 mpRegen 写成 regen（丢了每秒回灵，还白送一个回血）。
   *      ⚠️ 加新配方必过这一关：融一次要吃掉两件法宝，只要有一处净亏，
   *         玩家就会开始「不敢融」——玩法的信任是一次性资产。
   * ------------------------------------------------------------- */
  sec('T2b  融合不许变弱：产物必须逐字段 ≥ 两件材料之和');
  const t2b = await page.evaluate(() => {
    /* 把 stats 上的字段列全 —— 第一版探针漏了 mpRegen，真 bug 就从眼皮下溜过去了 */
    const NUM = ['damage', 'fireRate', 'speed', 'shotSpeed', 'range', 'pierce', 'spread',
      'homing', 'homingRange', 'knockback', 'luck', 'burn', 'frost', 'chain', 'iframe',
      'greed', 'crit', 'poison', 'regen', 'mpRegen', 'soul', 'deflect', 'reflect'];
    const PLR = ['shield', 'shieldCap'];
    const grab = p => {
      const o = {};
      for (const k of NUM) o[k] = +(+p.stats[k]).toFixed(6);
      for (const k of PLR) o[k] = +((p[k] === undefined ? 0 : p[k])).toFixed(6);
      return o;
    };
    const rows = [];
    for (const rec of FUSION_DEF) {
      const keep = new Player(0, 0);                  // 不融：两件都留着
      ITEM_MAP[rec.a].apply(keep, 0, 'feijian');
      ITEM_MAP[rec.b].apply(keep, 0, 'feijian');
      const fused = new Player(0, 0);                 // 融掉：只剩产物
      ITEM_MAP[rec.id].apply(fused, 0, 'feijian');
      const k = grab(keep), f = grab(fused);
      const worse = [];
      for (const key of Object.keys(k)) {
        if (f[key] < k[key] - 1e-9) worse.push(key + ' ' + k[key] + '→' + f[key]);
      }
      rows.push({ out: ITEM_MAP[rec.id].name, worse: worse });
    }
    /* FUS_SHIELD 是写在 fusion.js 里的字面量（因为它要先于 items.js 加载，
       不能引 TAIXU）—— 用断言把两边钉在一起，改了一边忘另一边会红。 */
    const shieldAligned = FUS_SHIELD.cap === TAIXU.caps[0] && FUS_SHIELD.gap === TAIXU.gaps[0]
      && FUS_SHIELD.capBig === TAIXU.caps[1] && FUS_SHIELD.gapBig === TAIXU.gaps[1];
    return { rows: rows, shieldAligned: shieldAligned };
  });
  const weak = t2b.rows.filter(r => r.worse.length);
  if (weak.length) weak.forEach(r => console.log('      ❌ ' + r.out + '：' + r.worse.join('，')));
  ok('16 条产物没有任何一条比「两件材料都留着」更弱',
    weak.length === 0,
    weak.length ? weak.map(r => r.out).join('、') : '全部逐字段 ≥');
  ok('FUS_SHIELD 与 items.js 的 TAIXU 对齐（防两边漂移）', t2b.shieldAligned === true);


  /* ----------------------------------------------------------------
   *  T2c ⭐ 融合不许变弱（扩到「件数组合」）+ 产物阶位 + 整条线消耗
   *
   *      T2b 只验了「两件各 1 件」这一种输入。2026-09-29 起产物继承的是
   *      材料**各自的件数**（逐侧继承，见 recomputeStats），于是不变式必须在
   *      全部输入上成立 —— 只要有一处净亏，玩家就会开始不敢融。
   *
   *      ⚠️ 这里刻意**不用**「给产物一个标量倍率」的做法：产物是一件东西，
   *         按 L 倍对称放大时两侧份量一样多，要逐字段不亏就得 L ≥ max(a,b)，
   *         于是 min 会亏、平均在差 ≥ 2 时也会亏（引雷符×3 + 青锋剑×1 → Lv2 < 3）。
   *         逐侧继承 = 数值精确等于材料之和，永远不会亏。
   * ------------------------------------------------------------- */
  sec('T2c  ★ 件数组合扫描：产物阶位 / 逐字段不变弱 / 整条线消耗 / 掉出本局池');
  const t2c = await page.evaluate(() => {
    const NUM = ['damage', 'fireRate', 'speed', 'shotSpeed', 'range', 'pierce', 'spread',
      'homing', 'homingRange', 'knockback', 'luck', 'burn', 'frost', 'chain', 'iframe',
      'greed', 'crit', 'poison', 'regen', 'mpRegen', 'soul', 'deflect', 'reflect'];
    const grab = p => { const o = {}; for (const k of NUM) o[k] = +(+p.stats[k]).toFixed(6); return o; };
    /* 材料之和（含数值型每多一件的 +0.5 伤害精炼补偿） */
    const matSum = (rec, a, b) => {
      const q = new Player(0, 0);
      for (let k = 0; k < a; k++) ITEM_MAP[rec.a].apply(q, k, 'feijian');
      for (let k = 0; k < b; k++) ITEM_MAP[rec.b].apply(q, k, 'feijian');
      q.stats.damage += 0.5 * ((a - 1) + (b - 1));
      return grab(q);
    };
    const G = window.Game;
    const weak = [], stray = [], badLv = [];
    let pairs = 0;
    for (const rec of FUSION_DEF) {
      for (let a = 1; a <= 4; a++) {
        for (let b = 1; b <= 4; b++) {
          pairs++;
          G.newRun('feijian');
          const pl = G.player;
          for (let k = 0; k < a; k++) pl.give(rec.a, G);
          for (let k = 0; k < b; k++) pl.give(rec.b, G);
          const want = matSum(rec, a, b);
          const res = fusionExecute(G, rec.a, rec.b);
          if (!res.ok) { weak.push(rec.id + '(' + a + ',' + b + ') 融合失败'); continue; }
          if (res.lv !== fusionLevel(a, b)) badLv.push(rec.id + '(' + a + ',' + b + ') → lv' + res.lv);
          const got = grab(pl);
          for (const k of NUM) {
            if (got[k] < want[k] - 1e-9) {
              weak.push(rec.id + '(' + a + ',' + b + ') ' + k + ' ' + want[k] + '→' + got[k]);
              break;
            }
          }
          const left = pl.items.filter(x => x === rec.a || x === rec.b).length;
          if (left || pl.items.length !== 1) {
            stray.push(rec.id + '(' + a + ',' + b + ') 残留 ' + left + ' / 背包 ' + pl.items.length);
          }
          if (!pl.usedMats[rec.a] || !pl.usedMats[rec.b]) stray.push(rec.id + '(' + a + ',' + b + ') 未禁抽');
        }
      }
    }
    const lv = { '1+1': fusionLevel(1, 1), '1+2': fusionLevel(1, 2), '2+2': fusionLevel(2, 2),
      '3+3': fusionLevel(3, 3), '3+1': fusionLevel(3, 1), '9+9封顶': fusionLevel(9, 9) };
    /* 禁抽：真抽 3000 次，看材料还会不会冒出来 */
    let leak = 0;
    const ban = {};
    ban[FUSION_DEF[0].a] = true; ban[FUSION_DEF[0].b] = true;
    for (let i = 0; i < 3000; i++) if (ban[rollFabaoId(Math.random, [], 'cn', ban)]) leak++;
    return { pairs: pairs, weak: weak.slice(0, 6), weakN: weak.length,
      stray: stray.slice(0, 6), strayN: stray.length,
      badLv: badLv.slice(0, 6), badLvN: badLv.length, lv: lv, leak: leak };
  });
  ok('件数组合扫描：' + t2c.pairs + ' 种输入一条都没变弱', t2c.weakN === 0, t2c.weak.join('；'));
  ok('★ 整条线被消耗：融完背包里只剩产物（材料一件不留）', t2c.strayN === 0, t2c.stray.join('；'));
  ok('产物阶位 = 两件件数的平均（向上取整）', t2c.badLvN === 0, t2c.badLv.join('；'));
  ok('阶位表 1+1=1 / 1+2=2 / 2+2=2 / 3+3=3 / 3+1=2 / 封顶 9+9=5',
    t2c.lv['1+1'] === 1 && t2c.lv['1+2'] === 2 && t2c.lv['2+2'] === 2
    && t2c.lv['3+3'] === 3 && t2c.lv['3+1'] === 2 && t2c.lv['9+9封顶'] === 5,
    JSON.stringify(t2c.lv));
  ok('★ 材料喂过融合阵后不再从掉落池出现（抽 3000 次 0 泄漏）', t2c.leak === 0, String(t2c.leak));

  sec('T3  融合产物不进随机池');
  const t3 = await page.evaluate(() => {
    const fusionIds = FUSION_DEF.map(r => r.id);
    let hit = 0;
    for (let i = 0; i < 3000; i++) {
      const id = rollFabaoId(Math.random, []);
      if (fusionIds.indexOf(id) >= 0) hit++;
    }
    const rareHit = (() => {
      let h = 0;
      for (let i = 0; i < 2000; i++) {
        const id = rollRareFabaoId(Math.random, []);
        if (fusionIds.indexOf(id) >= 0) h++;
      }
      return h;
    })();
    return { hit: hit, rareHit: rareHit, poolHas: poolByType('fabao').filter(i => fusionIds.indexOf(i) >= 0) };
  });
  ok('普通抽取 3000 次没吐出过融合产物', t3.hit === 0, '命中 ' + t3.hit);
  ok('珍稀抽取（金匣）2000 次也没吐出过', t3.rareHit === 0, '命中 ' + t3.rareHit);
  ok('随机池里不含任何融合产物', t3.poolHas.length === 0, t3.poolHas.join(',') || '');

  /* ---------------------------------------------------------------
   *  T4 ⭐ 属性重算（本次唯一的架构级改动）
   *     材料被吃掉，它加过的 stats 必须撤销，否则越融越高、材料白送。
   * ------------------------------------------------------------- */
  sec('T4  属性重算：扣材料后 stats 必须归位');
  const t4 = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    const p = G.player;
    const base = baseStats();
    const baseDamage = base.damage, baseFire = base.fireRate;

    /* 手里再放一件「无关法宝」，重算时必须原样保留 */
    p.items.length = 0;
    p.recomputeStats('feijian');
    const clean = { damage: p.stats.damage, fireRate: p.stats.fireRate };

    p.give('qingfeng', G);                  // damage +1
    p.give('leifu', G);                     // chain +1      ← 这两个要被融掉
    p.give('xuantie', G);                   // damage +3.5 / fireRate ×0.8 ← 这个要留着
    const before = { damage: p.stats.damage, fireRate: p.stats.fireRate, chain: p.stats.chain };

    const res = fusionExecute(G, 'qingfeng', 'leifu');

    const after = {
      damage: p.stats.damage, fireRate: p.stats.fireRate, chain: p.stats.chain,
      items: p.items.slice(),
      hasMatA: p.items.indexOf('qingfeng') >= 0,
      hasMatB: p.items.indexOf('leifu') >= 0,
      hasProduct: p.items.indexOf('leiji') >= 0
    };
    /* 手工推导：只剩 xuantie(+3.5/×0.8) + leiji(+1 伤害 +1 连锁) */
    const wantDamage = baseDamage + 3.5 + 1;
    const wantFire = baseFire * 0.8;

    /* 幂等性：连算两次结果必须一致（重算不能是「再叠一次」） */
    p.recomputeStats('feijian');
    const again = { damage: p.stats.damage, fireRate: p.stats.fireRate, chain: p.stats.chain };

    return {
      clean: clean, before: before, after: after, again: again,
      ok: res.ok, first: res.first,
      baseDamage: baseDamage, baseFire: baseFire,
      wantDamage: wantDamage, wantFire: wantFire
    };
  });
  console.log('    基础：伤害 ' + t4.baseDamage + '　射速 ' + t4.baseFire.toFixed(2));
  console.log('    融合前：伤害 ' + t4.before.damage.toFixed(2) + '　射速 ' + t4.before.fireRate.toFixed(2)
    + '　连锁 ' + t4.before.chain);
  console.log('    融合后：伤害 ' + t4.after.damage.toFixed(2) + '　射速 ' + t4.after.fireRate.toFixed(2)
    + '　连锁 ' + t4.after.chain);
  ok('融合执行成功', t4.ok === true);
  ok('两件材料都从持有列表消失', !t4.after.hasMatA && !t4.after.hasMatB);
  ok('产物进入了持有列表', t4.after.hasProduct);
  ok('无关法宝（玄铁重剑）的效果被保留', Math.abs(t4.after.fireRate - t4.wantFire) < 1e-9,
    t4.after.fireRate.toFixed(3) + ' vs ' + t4.wantFire.toFixed(3));
  ok('⭐ 伤害归位到「只剩持有物」的正确值（没有把材料白送）',
    Math.abs(t4.after.damage - t4.wantDamage) < 1e-9,
    '实际 ' + t4.after.damage + '　应为 ' + t4.wantDamage
    + '　（若没重算会是 ' + (t4.wantDamage + 1) + '）');
  ok('重算幂等：连算两次结果不变',
    Math.abs(t4.again.damage - t4.after.damage) < 1e-9
    && Math.abs(t4.again.fireRate - t4.after.fireRate) < 1e-9
    && t4.again.chain === t4.after.chain,
    '第二次 ' + t4.again.damage + ' / ' + t4.again.fireRate.toFixed(3));
  ok('清空持有列表后属性回到基础值',
    Math.abs(t4.clean.damage - t4.baseDamage) < 1e-9,
    t4.clean.damage + ' vs ' + t4.baseDamage);

  /* ---------------------------------------------------------------
   *  T5 / T6 执行与拒绝
   * ------------------------------------------------------------- */
  sec('T5/T6  执行细节与拒绝条件');
  const t56 = await page.evaluate(() => {
    const G = window.Game;
    FusionCodex.reset();
    G.newRun('feijian');
    const p = G.player;
    p.items.length = 0; p.recomputeStats('feijian');

    /* 只有一件材料 → 必须拒绝 */
    p.give('hanbing', G);
    const only1 = fusionExecute(G, 'hanbing', 'chiyan');

    p.give('chiyan', G);
    const noRecipe = fusionExecute(G, 'hanbing', 'qingfeng');   // 有 qingfeng 吗？没有 → 材料不足
    const okRun = fusionExecute(G, 'hanbing', 'chiyan');        // 这条才是对的

    const cntAfter = p.items.filter(i => i === 'binghuo').length;
    const again = fusionExecute(G, 'hanbing', 'chiyan');        // 材料已空 → 再融必须失败

    return {
      only1: only1, noRecipe: noRecipe, okRun: okRun,
      cntAfter: cntAfter, again: again,
      codex: FusionCodex.count(),
      has: FusionCodex.has('binghuo')
    };
  });
  ok('只有一件材料时拒绝融合', t56.only1.ok === false, t56.only1.why || '');
  ok('两件没有配方的法宝会被拒绝', t56.noRecipe.ok === false, t56.noRecipe.why || '');
  ok('有配方且材料足够时成功', t56.okRun.ok === true);
  ok('首次融合被标记为 first', t56.okRun.first === true);
  ok('产物只入袋 1 件', t56.cntAfter === 1, String(t56.cntAfter));
  ok('材料耗尽后再融同一配方失败（不可逆、无重复白拿）', t56.again.ok === false, t56.again.why || '');
  ok('图鉴收录了这条配方', t56.has === true, '共 ' + t56.codex + ' 条');

  /* ---------------------------------------------------------------
   *  T7 图鉴：落盘 / 跨局 / 配装不解锁
   * ------------------------------------------------------------- */
  sec('T7  图鉴落盘、跨局保留、配装不解锁');
  const t7 = await page.evaluate(() => {
    const G = window.Game;
    FusionCodex.reset();
    G.newRun('feijian');
    const p = G.player;
    p.items.length = 0; p.recomputeStats('feijian');
    p.give('zhenhun', G); p.give('shehun', G);

    const before = FusionCodex.count();
    const r1 = fusionExecute(G, 'zhenhun', 'shehun');
    const after1 = FusionCodex.count();
    const stored = (() => { try { return JSON.parse(localStorage.getItem(FUSION_KEY) || '[]'); } catch (e) { return []; } })();

    /* 二次获得同一产物（材料再来一套）→ 不该再报「首次」 */
    p.give('zhenhun', G); p.give('shehun', G);
    const r2 = fusionExecute(G, 'zhenhun', 'shehun');

    /* 挑战 / 无尽的初始配装走随机 give —— 绝不能解锁图鉴。
       （不直接调 giveChallengeLoadout：它依赖 this.chall.d，脱离挑战流程会炸；
        这里复刻它的行为 —— 随机 give 一串法宝，这正是那条不变量的内核。） */
    const nBefore = FusionCodex.count();
    for (let i = 0; i < 20; i++) p.give(rollFabaoId(Math.random, p.items), G);
    const nAfterChallenge = FusionCodex.count();

    /* 模拟「跨局」：清内存缓存，从 localStorage 重新读 */
    FusionCodex._c = null;
    const afterReload = FusionCodex.count();

    return {
      before: before, after1: after1, stored: stored,
      first1: r1.first, first2: r2.first,
      nBefore: nBefore, nAfterChallenge: nAfterChallenge,
      afterReload: afterReload
    };
  });
  ok('融合前图鉴为空', t7.before === 0);
  ok('首次融合后图鉴 +1', t7.after1 === 1, String(t7.after1));
  ok('落盘到 localStorage', Array.isArray(t7.stored) && t7.stored.length === 1, JSON.stringify(t7.stored));
  ok('首次标记：第一次是 true、第二次是 false', t7.first1 === true && t7.first2 === false);
  ok('⚠️ 随机配装（连 give 20 件）不会解锁图鉴', t7.nAfterChallenge === t7.nBefore,
    t7.nBefore + ' → ' + t7.nAfterChallenge);
  ok('跨局（清缓存重读）仍然记得', t7.afterReload === 1, String(t7.afterReload));

  /* ---------------------------------------------------------------
   *  T8 融合阵生成
   * ------------------------------------------------------------- */
  sec('T8  融合阵生成：段末必出、每层至多一座');
  const t8 = await page.evaluate(() => {
    const G = window.Game;
    const segEnd = [SEG_FLOORS, SEG_FLOORS * 2, SEG_FLOORS * 3];      // 5 / 10 / 15
    const mid = [];
    for (let d = 1; d <= STYLE_SYS.totalFloors; d++) if (segEnd.indexOf(d) < 0) mid.push(d);

    /* ⚠️ 要扫整层的 rooms，不能看 G.props —— 那是「当前所处房间」的实例列表，
       而 newFloor 之后玩家还在起始石室（里面不可能有融合阵）。
       融合阵是房间生成期就写进 r.props 的，所以只能从楼层数据里数。 */
    const countAt = (d, times) => {
      const out = [];
      for (let i = 0; i < times; i++) {
        G.newRun('feijian');
        G.newFloor(d);
        let n = 0;
        for (const r of G.floor.rooms.values()) {
          n += r.props.filter(p => p.kind === 'forge').length;
        }
        out.push(n);
      }
      return out;
    };

    const endRuns = {};
    for (const d of segEnd) endRuns[d] = countAt(d, 12);
    /* 出现率要按「层」统计：一层一掷，样本量得给够才看得出 33% */
    const midRuns = [];
    for (const d of mid) midRuns.push(...countAt(d, 20));

    return {
      segEnd: segEnd,
      endRuns: endRuns,
      midTotal: midRuns.length,
      midWith: midRuns.filter(n => n > 0).length,
      midRate: midRuns.filter(n => n > 0).length / midRuns.length,
      midMax: Math.max.apply(null, midRuns),
      chance: forgeFloorChance(segEnd[0]),
      midChance: FORGE_CHANCE
    };
  });
  t8.segEnd.forEach(d => console.log('      段末第 ' + d + ' 层：' + t8.endRuns[d].join(',') + ' 座'));
  console.log('      非段末：' + t8.midWith + '/' + t8.midTotal + ' 次有阵（'
    + (t8.midRate * 100).toFixed(1) + '%），最多 ' + t8.midMax + ' 座');
  ok('段末（Boss 层）每层必出融合阵',
    t8.segEnd.every(d => t8.endRuns[d].every(n => n === 1)),
    t8.segEnd.map(d => d + ':' + t8.endRuns[d].join('')).join(' '));
  ok('每层至多一座融合阵', t8.midMax <= 1 && t8.segEnd.every(d => t8.endRuns[d].every(n => n <= 1)),
    '最多 ' + t8.midMax);
  /* ⚠️ 这条曾经写成「既非必有、也非从不」——那个断言太松，
     把「每个房间各掷一次骰子」（实际 87%）也放过去了。
     改成直接对出现率设区间：一层一掷，样本够，就该贴着设计值。 */
  ok('非段末层的出现率贴着设计值 ' + (t8.midChance * 100).toFixed(0) + '%（容差 0.10）',
    Math.abs(t8.midRate - t8.midChance) < 0.10,
    (t8.midRate * 100).toFixed(1) + '%　样本 ' + t8.midTotal);
  ok('段末概率函数返回 1', t8.chance === 1, String(t8.chance));

  /* ---------------------------------------------------------------
   *  T9 面板交互
   * ------------------------------------------------------------- */
  sec('T9  面板交互：开关 / 选料 / 退料 / 确认');
  const t9 = await page.evaluate(() => {
    const G = window.Game;
    FusionCodex.reset();
    G.newRun('feijian');
    const p = G.player;
    p.items.length = 0; p.recomputeStats('feijian');
    p.give('hunyuan', G); p.give('fenying', G);
    G.state = 'play';

    const pool = G.fusionPool();
    const noMat = (() => {                       // 手里没有可融组合 → 不弹面板
      const saved = p.items.slice();
      p.items.length = 0; p.items.push('jingang');
      const st0 = G.state;
      G.openFusion(null);
      const res = { state: G.state, fusion: G.fusion, same: G.state === st0 };
      p.items.length = 0; saved.forEach(i => p.items.push(i));
      p.recomputeStats('feijian');
      return res;
    })();

    G.openFusion(null);
    const opened = { state: G.state, pool: (G.fusion ? G.fusion.pool.slice() : null) };

    /* 选料：把 hunyuan 与 fenying 放进两槽 */
    const put = id => {
      const i = G.fusion.pool.indexOf(id);
      if (i < 0) return false;
      G.fusion.idx = i; G.fusionTake(); return true;
    };
    const a = put('hunyuan'), b = put('fenying');
    const cur = G.fusionCurrent();
    const slotsFull = G.fusion.slots.slice();

    /* 退料：按一次退第二槽 */
    G.fusionDrop();
    const afterDrop = G.fusion.slots.slice();
    put('fenying');

    /* 确认 */
    G.fusionConfirm();
    const done = {
      state: G.state, fusion: G.fusion,
      hasProduct: p.items.indexOf('wangui') >= 0,
      leftMats: p.items.filter(i => i === 'hunyuan' || i === 'fenying').length
    };

    return {
      pool: pool, noMat: noMat, opened: opened, a: a, b: b,
      cur: cur ? cur.id : null, slotsFull: slotsFull,
      afterDrop: afterDrop, done: done
    };
  });
  console.log('    可融池：' + (t9.pool || []).join(', '));
  ok('手里没有可融组合时不弹面板、也不消耗',
    t9.noMat.fusion === null && t9.noMat.same === true);
  ok('有可融组合时开启面板并切到 fusion 状态', t9.opened.state === 'fusion');
  ok('面板只列「参与过配方」的法宝', t9.opened.pool && t9.opened.pool.indexOf('hunyuan') >= 0
    && t9.opened.pool.indexOf('fenying') >= 0, (t9.opened.pool || []).join(','));
  ok('两槽放齐后能查出配方', t9.cur === 'wangui', String(t9.cur));
  ok('退料按一次只退第二槽', t9.afterDrop[0] === 'hunyuan' && t9.afterDrop[1] === null,
    JSON.stringify(t9.afterDrop));
  ok('确认后回到 play 状态且面板关闭', t9.done.state === 'play' && t9.done.fusion === null);
  ok('产物入袋、材料清空', t9.done.hasProduct && t9.done.leftMats === 0,
    '残余材料 ' + t9.done.leftMats);

  /* ---------------------------------------------------------------
   *  T9b 机制实效：每条新机制都要真的「发生」
   *      T2 只验了 stats.fus 上挂着键 —— 键存在 ≠ 钩子接上了。
   *      这一节逐个钩子打一遍，看它有没有真的改变游戏状态。
   * ------------------------------------------------------------- */
  sec('T9b  机制实效（逐个钩子真的生效）');
  const t9b = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    const p = G.player;
    const ek = Object.keys(ENEMY_DEF)[0];
    const out = {};

    /* 金刚玄镜：受创 → 场上多出一片 friendly 罡气 */
    p.stats.fus = { revenge: 1 };
    G.hazards.length = 0; p.invuln = 0;
    p.takeDamage(1, G);
    out.revenge = G.hazards.filter(h => h.friendly).length;

    /* 灵脉：拾取灵石 → 回灵力 */
    p.stats.fus = { coinMp: 1 };
    p.mp = 0;
    Fusion.onCoin(G, 3);
    out.coinMp = p.mp;

    /* 聚宝盆：概率性，跑多次看有没有出过钥匙 */
    p.stats.fus = { coinKey: 1 };
    const k0 = G.keys;
    for (let i = 0; i < 60; i++) Fusion.onCoin(G, 1);
    out.coinKey = G.keys - k0;

    /* 御风踏云：移动积攒 → 可取用；不满则取不到 */
    p.stats.fus = { wind: 1 }; p.windT = 0;
    Fusion.onMove(p, 100);
    const notFull = Fusion.takeWind(p);
    Fusion.onMove(p, 400);
    const full = Fusion.takeWind(p);
    out.wind = { notFull: notFull, full: full, left: p.windT };

    /* 太虚镜：击落 → 补盾，且同一拍内限流 */
    p.stats.fus = { deflectShield: 1 };
    p.shield = 0; p._deflectShieldCd = 0;
    Fusion.onDeflect(p, G);
    const s1 = p.shield;
    Fusion.onDeflect(p, G);
    out.deflect = { first: s1, second: p.shield };

    /* 霜雷 / 雷火焚天 / 洞冥珠：都给同一只目标上状态，逐条验 */
    const mk = (fus, crit) => {
      G.enemies.length = 0;
      const e = new Enemy(ek, 240, 180, 1);
      const nb = new Enemy(ek, 262, 180, 1);      // 贴着主目标，用来验「周围也冻住」
      G.enemies.push(e); G.enemies.push(nb);
      const b = new Bullet(240, 180, 0, 0, { friendly: true, dmg: 4, r: 5, fus: fus, crit: !!crit });
      Fusion.onHit(e, b, G);
      return { e: e, nb: nb, haz: G.hazards.filter(h => h.friendly).length };
    };

    G.hazards.length = 0;
    const fr = mk({ frostBolt: 1 });
    out.frostBolt = { main: fr.e.frost > 0, near: fr.nb.frost > 0 };

    G.hazards.length = 0;
    const bb = mk({ boltBurn: 1 });
    out.boltBurn = bb.e.burn > 0;

    const cb = mk({ critBurn: 1 }, false);
    const cb2 = mk({ critBurn: 1 }, true);
    out.critBurn = { normal: cb.e.burn > 0, crit: cb2.e.burn > 0 };

    /* 焚毒：击杀 → 场上多出一片火色 friendly Hazard（需要 player 带毒） */
    p.stats.poison = 1;
    p.stats.fus = { ignitePoison: 1 };
    G.hazards.length = 0;
    const victim = new Enemy(ek, 240, 180, 1);
    G.enemies.push(victim);
    Fusion.onKill(victim, G);
    out.ignitePoison = G.hazards.filter(h => h.friendly).length;

    /* 乱披风：弧度必须真的随机（跑 40 次看有没有出现不同值） */
    const arcs = {};
    for (let i = 0; i < 40; i++) {
      arcs[Fusion.spreadArcOf({ wildArc: 1 }, 0.16).toFixed(3)] = 1;
    }
    out.wildArc = Object.keys(arcs).length;
    out.wildArcOff = Fusion.spreadArcOf({}, 0.16);
    return out;
  });
  console.log('    ' + JSON.stringify(t9b));
  ok('金刚玄镜：受创后场上出现反震罡气', t9b.revenge >= 1, String(t9b.revenge));
  ok('灵脉：拾取 3 灵石回 3 点灵力', t9b.coinMp === 3, String(t9b.coinMp));
  ok('聚宝盆：60 颗灵石里真的出过钥匙', t9b.coinKey > 0, '+' + t9b.coinKey);
  ok('御风踏云：不满时取不到风势', t9b.wind.notFull === false);
  ok('御风踏云：攒满后取得到、且取走即清零',
    t9b.wind.full === true && t9b.wind.left === 0, '剩 ' + t9b.wind.left);
  ok('太虚镜：击落补 1 格护盾', t9b.deflect.first === 1, String(t9b.deflect.first));
  ok('太虚镜：同一拍内连击落只补 1 格（有限流）', t9b.deflect.second === 1, String(t9b.deflect.second));
  ok('霜雷：主目标被冻', t9b.frostBolt.main === true);
  ok('霜雷：**周围**的妖物也被冻（这正是它和玄冰符的区别）', t9b.frostBolt.near === true);
  ok('雷火焚天：命中即点燃（不需要暴击）', t9b.boltBurn === true);
  ok('洞冥珠：普通命中不点燃、暴击命中才点燃',
    t9b.critBurn.normal === false && t9b.critBurn.crit === true,
    JSON.stringify(t9b.critBurn));
  ok('焚毒：击杀时炸出火海', t9b.ignitePoison >= 1, String(t9b.ignitePoison));
  ok('乱披风：弧度真的随机（40 次出多个不同值）', t9b.wildArc >= 8, t9b.wildArc + ' 种');
  ok('乱披风：没这件法宝时弧度仍是固定值', t9b.wildArcOff === 0.16, String(t9b.wildArcOff));

  /* ---------------------------------------------------------------
   *  T10 运行期无报错
   * ------------------------------------------------------------- */
  /* ---------------------------------------------------------------
   *  T9c 第三批：北欧内部 4 条 + 跨世界 5 条
   *  用户 2026-09-24：「中式和北欧的神器可以融合吗？如果不行乐趣会少很多」。
   *  做之前查过两件事：
   *   ① 融合阵**不分世界**生成（dungeon.js 里没有 world 判断）→ 北欧局也有阵；
   *   ② 但前两批配方材料全是中式法宝 → **全北欧路径的阵是纯摆设**（凑不齐）。
   *  所以这一批必须同时补「北欧内部」和「跨世界」两组。
   * ------------------------------------------------------------- */
  sec('T9c 跨世界融合：中式 × 北欧 + 北欧内部');
  const t9c = await page.evaluate(() => {
    const w = d => d.world || 'cn';
    const NEW = ['thor_plate', 'wolf_spear', 'wisdom_ring', 'world_shade',
                 'cross_thunder', 'twin_blade', 'aegis_wall', 'endless_wealth', 'frost_seed'];
    const rows = NEW.map(id => {
      const rec = FUSION_DEF.filter(r => r.id === id)[0];
      if (!rec) return { id: id, missing: true };
      const A = ITEM_MAP[rec.a], B = ITEM_MAP[rec.b], O = ITEM_MAP[rec.id];
      /* 配方不能是死的：材料必须真的能在「它所属的那个世界」的池子里抽到 */
      const aInPool = poolByType('fabao', w(A)).indexOf(rec.a) >= 0;
      const bInPool = poolByType('fabao', w(B)).indexOf(rec.b) >= 0;
      /* 产物本身绝不能进随机池（否则金匣能直接开出「混血」产物，独占性没了） */
      const outInPool = poolByType('fabao', w(O)).indexOf(rec.id) >= 0;
      return { id: id, name: O.name, kind: w(A) + '×' + w(B),
               a: A.name, b: B.name, aInPool: aInPool, bInPool: bInPool, outInPool: outInPool };
    });
    /* 七个新机制要在钩子里真的找得到（写了键名却没接线 = 玩家的法宝是哑的） */
    const mechKeys = ['shieldShock', 'pinCrit', 'mpOnKill', 'hurtRegen',
                      'chainPin', 'coinOnHit', 'frostSpread', 'foldCrit'];
    const hookSrc = [Fusion.onHit, Fusion.onHurt, Fusion.onShieldBreak,
                     Fusion.onKill, Fusion.tick, Fusion.aimMul].map(f => f.toString()).join('\n');
    const unwired = mechKeys.filter(k => hookSrc.indexOf(k) < 0);
    /* 图鉴自动收录：新增产物应当都在 FUSION_ITEMS 里、且 count 跟着涨 */
    return { rows: rows, total: FUSION_DEF.length, unwired: unwired,
             codexTotal: (typeof FUSION_ITEMS !== 'undefined' ? FUSION_ITEMS.length : 0) };
  });
  t9c.rows.forEach(r => console.log('      ' + (r.name || r.id) + '  [' + r.kind + ']  '
    + r.a + ' + ' + r.b));
  ok('第三批 9 条配方都登记齐全（4 北欧内部 + 5 跨世界）',
    t9c.rows.every(r => !r.missing) && t9c.rows.length === 9,
    t9c.rows.filter(r => r.missing).map(r => r.id).join(',') || '9/9');
  ok('★ 跨世界 5 条确实是「中式 × 北欧」（不是又一批中式内部配方）',
    t9c.rows.filter(r => r.kind === 'cn×nordic').length === 5,
    t9c.rows.filter(r => r.kind === 'cn×nordic').length + ' 条');
  ok('★ 北欧内部 4 条确实是「北欧 × 北欧」（补上全北欧路径没融合可用的洞）',
    t9c.rows.filter(r => r.kind === 'nordic×nordic').length === 4,
    t9c.rows.filter(r => r.kind === 'nordic×nordic').length + ' 条');
  ok('★ 每条配方的材料都真能在它所属世界的池子里抽到（配方不是死的）',
    t9c.rows.every(r => r.aInPool && r.bInPool),
    t9c.rows.filter(r => !(r.aInPool && r.bInPool)).map(r => r.name).join('、') || '全部可达');
  ok('融合产物不进随机池（混血法宝只能靠融出来）',
    t9c.rows.every(r => !r.outInPool));
  ok('★ 7 个新机制都真的接到钩子上了（没接线的话法宝是哑的）',
    t9c.unwired.length === 0, t9c.unwired.join(',') || '全部接线');
  ok('产物总数 = 配方总数（一条配一条产物，图鉴会跟着涨）',
    t9c.codexTotal === t9c.total, t9c.codexTotal + ' / ' + t9c.total);

  /* ----------------------------------------------------------------
   *  T9d ⭐ 第四批「弹道形状」三条（2026-09-29 用户挑的 A1 / A2 / A3）
   *      全部是**行为断言**，不是「有没有这个属性」——
   *      属性断言拦不住「接线接了一半」（spreadArcOf 那次就是这么漏的）。
   * ------------------------------------------------------------- */
  sec('T9d  ★ 往复梭（原路折返）/ 回鸣镜（撞墙弹开）/ 剑影环（命中充能）');
  const t9d = await page.evaluate(() => {
    const G = window.Game;
    const clean = (style, items) => {
      G.newRun(style); G.newFloor(1); G.state = 'play';
      const pl = G.player;
      G.enemies.length = 0; G.bullets.length = 0; G.orbits.length = 0; G.hazards.length = 0;
      if (G.room && G.room.obstacles) G.room.obstacles.length = 0;
      (items || []).forEach(id => { pl.give(id, G); G.itemPopup = null; });
      G.orbits.length = 0;
      pl.x = 240; pl.y = 150; pl.shootCd = 0;
      return pl;
    };
    const mkFoe = (x, y) => {
      const e = new Enemy('xiesui', x, y, 1);
      e.spawnT = 0; e.speed = 0; e.maxHp = 99999; e.hp = 99999; e.touch = 0; e.cd = 999999;
      G.enemies.push(e); return e;
    };

    /* ---------- 往复梭 ---------- */
    const pl1 = clean('feijian', ['wangfu']);
    const foe = mkFoe(240, 80);
    STYLES.feijian.attack(pl1, G, { shooting: true, aiming: true, aimAngle: -Math.PI / 2 });
    const b1 = G.bullets[0];
    const vy0 = b1 ? b1.vy : 0;
    let turned = -1, hits = 0, prev = foe.hp, pierceAtTurn = null;
    for (let f = 0; f < 140; f++) {
      G.update();
      if (foe.hp < prev - 0.01) { hits++; prev = foe.hp; }
      if (turned < 0 && b1 && b1.vy * vy0 < 0) {
        turned = f;
        /* ⚠️ 穿透只能在**折返那一帧**采样：跑完再看的话回程又打了两遍，
           数值早就被消耗掉了（第一版就是这么假失败的）。 */
        pierceAtTurn = (b1.pierce === b1.pierceMax);
      }
      if (!b1 || b1.dead) break;
    }
    const boom = { turned: turned, hits: hits, back: b1 ? b1.boomBack : false,
                   pierceReset: pierceAtTurn === true };

    /* ---------- 回鸣镜：撞墙 ---------- */
    const pl2 = clean('feijian', ['huiming']);
    const b2 = new Bullet(420, 150, 8, 0, { friendly: true, dmg: 3, r: 5, life: 120, fus: pl2.stats.fus, kind: 'sword', sprite: SPR.sword });
    G.bullets.push(b2);
    const d0 = b2.dmg, n0 = b2.bounce;
    let flipped = -1;
    for (let f = 0; f < 60; f++) { G.update(); if (b2.vx < 0) { flipped = f; break; } if (b2.dead) break; }
    const wall = { flipped: flipped, alive: !b2.dead, dmgUp: +(b2.dmg / d0).toFixed(3), used: n0 - b2.bounce };

    /* ---------- 回鸣镜：撞石柱（选轴要用速度主导，不能用重叠深度） ---------- */
    const pl3 = clean('feijian', ['huiming']);
    G.room.obstacles.push({ x: 300, y: 140, w: 20, h: 20 });
    const b3 = new Bullet(250, 150, 6, 0, { friendly: true, dmg: 2, r: 5, life: 120, fus: pl3.stats.fus, kind: 'sword', sprite: SPR.sword });
    G.bullets.push(b3);
    let obFlip = -1;
    for (let f = 0; f < 40; f++) { G.update(); if (b3.vx < 0) { obFlip = f; break; } if (b3.dead) break; }
    const stone = { flipped: obFlip, vx: +b3.vx.toFixed(1), alive: !b3.dead };
    /* 没有回鸣镜的对照：应该撞碎 */
    const plc = clean('feijian', []);
    G.room.obstacles.push({ x: 300, y: 140, w: 20, h: 20 });
    const bc = new Bullet(250, 150, 6, 0, { friendly: true, dmg: 2, r: 5, life: 120, fus: plc.stats.fus, kind: 'sword', sprite: SPR.sword });
    G.bullets.push(bc);
    for (let f = 0; f < 40; f++) { G.update(); if (bc.dead) break; }
    const stoneCtl = { dead: bc.dead };

    /* ---------- 剑影环：命中充能 ---------- */
    const pl4 = clean('feijian', ['jianying']);
    const timeline = [];
    for (let n = 1; n <= ORBIT_NEED * 4; n++) {
      const e = mkFoe(pl4.x, pl4.y - 40);
      Fusion.onHit(e, { fus: pl4.stats.fus, dmg: 3, chain: 0, crit: false }, G);
      timeline.push(G.orbits.length);
      G.enemies.length = 0;
    }
    /* 环剑真的会砍：放一只在环上跑一段 */
    const pl5 = clean('feijian', ['jianying']);
    for (let n = 0; n < ORBIT_NEED; n++) {
      const e = mkFoe(pl5.x, pl5.y - 40);
      Fusion.onHit(e, { fus: pl5.stats.fus, dmg: 3, chain: 0, crit: false }, G);
      G.enemies.length = 0;
    }
    const target = mkFoe(pl5.x + ORBIT_R, pl5.y);
    const hp0 = target.hp;
    for (let f = 0; f < 240; f++) G.update();
    const orbitDmg = +(hp0 - target.hp).toFixed(2);
    const orbitLeft = G.orbits.length;
    for (let f = 0; f < ORBIT_LIFE + 20; f++) G.update();
    const orbitGone = G.orbits.length;

    /* ---------- 舞剑流：近战命中也要触发 onHit（雷火焚天 = 命中即点燃） ---------- */
    const pl6 = clean('wujian', ['leihuo']);
    const foe6 = mkFoe(pl6.x + 40, pl6.y);
    STYLES.wujian.attack(pl6, G, { shooting: true, aiming: true, aimAngle: 0 });
    const melee = { burn: foe6.burn, burnDmg: +(foe6.burnDmg || 0).toFixed(2) };

    return { boom: boom, wall: wall, stone: stone, stoneCtl: stoneCtl,
             orbit: { timeline: timeline.join(''), cap: ORBIT_MAX, need: ORBIT_NEED,
                      dmg: orbitDmg, left: orbitLeft, gone: orbitGone },
             melee: melee };
  });
  ok('往复梭：飞到一半**原路折返**（vy 取反）', t9d.boom.turned >= 0, '第 ' + t9d.boom.turned + ' 帧折返');
  ok('★ 往复梭：同一只妖物被**穿两遍**（去一遍、回一遍）', t9d.boom.hits === 2, t9d.boom.hits + ' 次');
  ok('往复梭：回程清空命中记录 + 重置穿透（否则「再穿一遍」是假的）',
    t9d.boom.back === true && t9d.boom.pierceReset === true);
  ok('回鸣镜：撞墙不碎、按原路弹开、每弹一次重四成',
    t9d.wall.flipped >= 0 && t9d.wall.alive && t9d.wall.dmgUp >= 1.39,
    '第 ' + t9d.wall.flipped + ' 帧弹开，伤害 ×' + t9d.wall.dmgUp);
  ok('★ 回鸣镜：撞石柱也会弹（选轴走「速度主导」，不是「重叠深度」）',
    t9d.stone.flipped >= 0 && t9d.stone.vx < 0 && t9d.stone.alive,
    '第 ' + t9d.stone.flipped + ' 帧，vx ' + t9d.stone.vx);
  ok('对照组：没有回鸣镜时撞石柱会碎（证明上面那条不是白过）', t9d.stoneCtl.dead === true);
  /* ⚠️ timeline 是 join('') 之后的**字符串**：索引拿到的是字符 '1' 不是数字 1，
     直接跟数字比会永远 false（第一版就是这么假失败的）。 */
  const tl = t9d.orbit.timeline, need = t9d.orbit.need;
  ok('★ 剑影环：每命中 ' + need + ' 次生一柄，封顶 ' + t9d.orbit.cap + ' 柄',
    tl[0] === '0' && tl[need - 1] === '1' && tl[need * 2 - 1] === '2'
    && tl[need * 3 - 1] === '3' && tl[need * 4 - 1] === '3',
    '柄数序列 ' + tl);
  ok('剑影环：环剑真的会砍（贴着的妖物掉血）', t9d.orbit.dmg > 0, t9d.orbit.dmg + ' 点');
  ok('剑影环：到期会消失（不是永久挂件）', t9d.orbit.gone === 0, t9d.orbit.gone + ' 柄');
  ok('★ 舞剑流的近战命中也会触发 onHit 机制（雷火焚天当场点燃）',
    t9d.melee.burn > 0 && t9d.melee.burnDmg > 0,
    'burn ' + t9d.melee.burn + ' / burnDmg ' + t9d.melee.burnDmg);

  /* ----------------------------------------------------------------
   *  T9e ⭐ 融合阵「什么时候才算用掉」（2026-09-30 用户报的 bug）
   *      症状：走进去只放了两件、没确认，退出后阵就失效了（变暗、无提示、按 E 无反应）。
   *      根因：used 被写在 openFusion 里 —— 一开面板就消耗。
   *      正确语义：**只有真正融成一次才消耗**；打开/放件/退出都不算。
   * ------------------------------------------------------------- */
  sec('T9e  ★ 融合阵的「用掉」时机：融成才算，看一眼不算');
  const t9e = await page.evaluate(() => {
    const G = window.Game;
    const build = (items) => {
      G.newRun('feijian'); G.state = 'play';
      const pl = G.player;
      G.enemies.length = 0; G.bullets.length = 0;
      (items || []).forEach(id => { pl.give(id, G); G.itemPopup = null; });
      G.room.obstacles.length = 0;
      const spot = G.spotForProp(ROOM_W / 2, ROOM_H / 2, 16);
      const prop = new Prop('forge', spot.x, spot.y, { kind: 'forge' });
      G.props.push(prop);
      const stand = () => { pl.x = prop.x; pl.y = prop.y; };
      const press = () => { G.input.interact = true; prop.update(G); G.input.interact = false; };
      return { pl: pl, prop: prop, stand: stand, press: press };
    };
    const close = () => { let g = 0; while (G.state === 'fusion' && g++ < 8) G.fusionBack(); };
    const out = {};

    /* ---- ① 打开面板 → 不该消耗；退出 → 还能再交互 ---- */
    let t = build(['qingfeng', 'leifu']);
    t.stand(); t.press();
    out.openPanel = (G.state === 'fusion');
    out.usedAfterOpen = !!t.prop.used;
    G.fusionTake(); G.fusionMove(1); G.fusionTake();     // 放两件（不确认）
    out.slotsFilled = !!(G.fusion.slots[0] && G.fusion.slots[1]);
    close();
    out.stateAfterExit = G.state;
    out.usedAfterExit = !!t.prop.used;
    t.stand(); G.forgeHint = null; t.prop.update(G);
    out.hintBack = !!G.forgeHint;
    t.press();
    out.canReopen = (G.state === 'fusion');
    close();

    /* ---- ② 真心动一次 → 才消耗，之后不再响应 ---- */
    t.stand(); t.press();
    G.fusionTake(); G.fusionMove(1); G.fusionTake();
    G.fusionConfirm();
    out.fused = (G.player.items.length === 1 && G.player.items[0] === 'leiji');
    out.usedAfterFuse = !!t.prop.used;
    t.stand(); G.forgeHint = null; t.prop.update(G);
    out.hintAfterFuse = !!G.forgeHint;

    /* ---- ③ 配不成对（两件都在池里但彼此无配方）：报错、不消耗 ---- */
    const t2 = build(['qingfeng', 'hanbing', 'leifu']);
    t2.stand(); t2.press();
    /* 池里挑出「青锋剑 + 玄冰符」这一对（它们之间没有配方） */
    const pool = G.fusion.pool;
    const qi = pool.indexOf('qingfeng'), hi = pool.indexOf('hanbing');
    G.fusion.slots = ['qingfeng', 'hanbing'];
    out.badPairReady = (qi >= 0 && hi >= 0);
    G.fusionConfirm();
    out.badPairMsg = G.fusion ? G.fusion.msg : '(面板关了)';
    out.stillOpen = (G.state === 'fusion');
    out.usedAfterBad = !!t2.prop.used;
    out.itemsIntact = (G.player.items.filter(x => x === 'qingfeng').length === 1
      && G.player.items.filter(x => x === 'hanbing').length === 1);

    /* ---- ④ 手里根本凑不出可融组合：不弹面板、也不消耗 ---- */
    const t3 = build(['qingfeng']);                 // 单独一件凑不出任何配方
    t3.stand(); G.forgeHint = null; t3.press();
    out.noPairPanel = (G.state === 'fusion');
    out.noPairUsed = !!t3.prop.used;

    return out;
  });
  ok('★ 打开融合面板不消耗阵（看一眼不算）', t9e.openPanel === true && t9e.usedAfterOpen === false);
  ok('★ 只放材料后退出：阵仍然完好（提示回来、还能再开）',
    t9e.slotsFilled === true && t9e.stateAfterExit === 'play'
    && t9e.usedAfterExit === false && t9e.hintBack === true && t9e.canReopen === true,
    '退出后提示=' + t9e.hintBack + ' 可重开=' + t9e.canReopen);
  ok('★ 真正融成一次之后，阵才算用掉、并不再响应',
    t9e.fused === true && t9e.usedAfterFuse === true && t9e.hintAfterFuse === false,
    '产物=' + (t9e.fused ? '雷殛剑' : '×') + ' used=' + t9e.usedAfterFuse);
  ok('配不成对：面板报「没有机缘」、不消耗阵、材料不被扣',
    t9e.stillOpen === true && t9e.usedAfterBad === false && t9e.itemsIntact === true,
    'msg=' + t9e.badPairMsg);
  ok('手里凑不出可融组合：面板不弹、阵也不消耗',
    t9e.noPairPanel === false && t9e.noPairUsed === false);

  /* ----------------------------------------------------------------
   *  T9f ⭐ 融合面板的光标只停在「能融的」上面（2026-09-30 用户反馈）
   *      症状：选完第一个材料后，一圈配不上的法宝照样能被光标选中，
   *            从池子这头挪到那头要按十几次方向键。
   *      验收指标是**按键次数**，不是「有没有 fusionCursor 这个方法」——
   *      属性断言拦不住「算出来了但没接到 fusionMove 上」。
   * ------------------------------------------------------------- */
  sec('T9f  ★ 融合光标：跳过配不上的（按键次数从「整池」降到「候选数」）');
  const t9f = await page.evaluate(() => {
    const G = window.Game;
    const nameOf = id => (ITEM_MAP[id] || {}).name || id;
    const close = () => { let g = 0; while (G.state === 'fusion' && g++ < 12) G.fusionBack(); };

    /* 从配方表取 10 件材料当手牌 —— 池子够大才看得出「按很多次」 */
    const mats = [];
    for (const rec of FUSION_DEF) {
      if (mats.indexOf(rec.a) < 0) mats.push(rec.a);
      if (mats.indexOf(rec.b) < 0) mats.push(rec.b);
      if (mats.length >= 10) break;
    }
    const setup = (hand) => {
      G.newRun('feijian'); G.state = 'play';
      const pl = G.player;
      pl.items.length = 0; pl.recomputeStats('feijian');
      for (const id of (hand || mats)) pl.give(id, G);
      G.itemPopup = null;
      G.room.obstacles.length = 0;
      const spot = G.spotForProp(ROOM_W / 2, ROOM_H / 2, 16);
      const prop = new Prop('forge', spot.x, spot.y, { kind: 'forge' });
      G.props.push(prop);
      pl.x = prop.x; pl.y = prop.y;
      G.openFusion(prop);
      return prop;
    };
    const out = {};

    /* ---- ① 第一槽空：候选 = 全部；放完之后 = 只有配得上的 ---- */
    close(); setup();
    out.opened = G.state === 'fusion' && !!G.fusion;
    if (!out.opened) return out;
    const pool = G.fusion.pool, N = pool.length;
    out.poolSize = N;
    out.cursorBefore = G.fusionCursor().length;

    /* 挑一个「有伙伴、且伙伴数最少」的当第一槽 —— 那正是收益最大的情形 */
    const partners = id => pool.filter(x => x !== id && !!fusionRecipeOf(id, x)).length;
    let pickAt = -1, best = Infinity;
    pool.forEach((id, i) => { const n = partners(id); if (n >= 1 && n < best) { best = n; pickAt = i; } });
    const idxA = pickAt, pickId = pool[pickAt];
    G.fusion.idx = idxA;
    G.fusionTake();
    const cand = G.fusionCursor();
    out.pickName = nameOf(pickId);
    out.cursorAfter = cand.length;
    out.allCan = cand.every(i => !!fusionRecipeOf(pickId, pool[i]));
    out.snapIsCand = cand.indexOf(G.fusion.idx) >= 0;

    /* ---- ② 实走一圈：落点全亮 + 圈长 = 候选数（这就是「按几下」） ---- */
    G.fusion.idx = cand[0];
    const walk = [];
    for (let k = 0; k < N + 2; k++) { G.fusionMove(1); walk.push(G.fusion.idx); }
    out.grayHits = walk.filter(i => !fusionRecipeOf(pickId, pool[i])).length;
    out.cycle = (() => { const s = {}; for (let k = 0; k < walk.length; k++) { if (s[walk[k]]) return k; s[walk[k]] = 1; } return walk.length; })();
    /* 反向环绕：从第一个往左应落到最后一个候选 */
    G.fusion.idx = cand[0]; G.fusionMove(-1);
    out.backWrap = G.fusion.idx === cand[cand.length - 1];

    /* ---- ③ 最坏目标：修前按索引环形距离，修后只在候选圈里走 ---- */
    const worst = cand.map(i => ({ i: i, d: (i - idxA + N) % N })).sort((a, b) => b.d - a.d)[0];
    out.worstBefore = worst.d;
    out.worstAfter = cand.indexOf(worst.i);
    out.iterBefore = N;
    out.iterAfter = cand.length;

    /* ---- ④ 点灰格：不放入，但给一句人话 ---- */
    const cells = Array.from(document.querySelectorAll('#fusion .fusItem'));
    const grayIdx = [...Array(N).keys()].filter(i => !fusionRecipeOf(pickId, pool[i]))[0];
    out.hasGrayCell = grayIdx !== undefined;
    if (out.hasGrayCell && cells[grayIdx]) {
      cells[grayIdx].click();
      out.grayMsg = G.fusion ? G.fusion.msg : '(面板关了)';
      out.graySlot1 = G.fusion && G.fusion.slots[1] ? nameOf(G.fusion.slots[1]) : null;
    }
    out.tipHasNote = /只停在能融的上面/.test((document.querySelector('#fusion .pickTip') || {}).textContent || '');

    /* ---- ⑤ 取回第一件 → 候选恢复全部 ---- */
    G.fusionDrop();
    out.afterDrop = G.fusionCursor().length;

    /* ---- ⑥ 第一槽选了「谁都配不上」的：不锁死 + 明说 ---- */
    close();
    const rec0 = FUSION_DEF[0];
    const A = rec0.a, B = rec0.b;
    const allMats = [];
    for (const rc of FUSION_DEF) {
      if (allMats.indexOf(rc.a) < 0) allMats.push(rc.a);
      if (allMats.indexOf(rc.b) < 0) allMats.push(rc.b);
    }
    const C = allMats.filter(c => c !== A && c !== B
      && !fusionRecipeOf(A, c) && !fusionRecipeOf(B, c))[0];
    out.hasLone = !!C;
    if (C) {
      setup([A, B, C]);
      const p2 = G.fusion.pool;
      out.lonePoolN = p2.length;
      G.fusion.idx = p2.indexOf(C);
      G.fusionTake();
      out.loneMsg = G.fusion.msg || '';
      out.loneCursorN = G.fusionCursor().length;      // 不锁死 → 放开为全部
      const b0 = G.fusion.idx; G.fusionMove(1);
      out.loneMovable = G.fusion.idx !== b0;
      /* 兜底只是「能走」，格子仍然全是灰的 —— 所以必须给提示，不然玩家白按 */
      out.loneStillGray = p2.every(x => !fusionRecipeOf(C, x));
    }
    close();
    return out;
  });
  ok('第一槽空着时，整池都能选（此时都可融）',
    t9f.opened === true && t9f.cursorBefore === t9f.poolSize, t9f.cursorBefore + ' / ' + t9f.poolSize);
  ok('★ 放入第一件后，候选项只剩「与它有配方」的',
    t9f.cursorAfter >= 1 && t9f.cursorAfter < t9f.poolSize && t9f.allCan === true,
    '池 ' + t9f.poolSize + ' -> 候选 ' + t9f.cursorAfter);
  ok('★ 放完第一件，光标**自动吸附**到候选上（不留在刚放进去的灰格里）',
    t9f.snapIsCand === true);
  ok('★ 方向键走一圈：不会落在任何配不上的格子上',
    t9f.grayHits === 0, '灰格命中 ' + t9f.grayHits + ' 次');
  ok('★ 走一圈的步数 = 候选数（修前是整池大小）',
    t9f.cycle === t9f.cursorAfter && t9f.iterAfter < t9f.iterBefore,
    '修前 ' + t9f.iterBefore + ' 步 -> 修后 ' + t9f.iterAfter + ' 步（实走 ' + t9f.cycle + '）');
  ok('★ 到最坏目标只需在候选圈里走（修前按索引硬绕）',
    t9f.worstAfter < t9f.worstBefore,
    '修前 ' + t9f.worstBefore + ' 步 -> 修后 ' + t9f.worstAfter + ' 步');
  ok('反向也能环绕（左键从第一个绕到最后一个候选）', t9f.backWrap === true);
  ok('点配不上的格子：不放入，只回一句「这两件之间没有机缘」',
    t9f.hasGrayCell === false || (t9f.graySlot1 === null && /没有机缘/.test(String(t9f.grayMsg))),
    String(t9f.grayMsg));
  ok('两槽齐了才在提示里写明「只停在能融的上面」', t9f.tipHasNote === true);
  ok('取回第一件后，候选恢复为整池', t9f.afterDrop === t9f.poolSize,
    t9f.afterDrop + ' / ' + t9f.poolSize);
  ok('第一槽选了「谁都配不上」的：光标不锁死（还能退件/换件）',
    t9f.hasLone === false || (t9f.loneCursorN === t9f.lonePoolN && t9f.loneMovable === true),
    '候选 ' + t9f.loneCursorN + ' / 池 ' + t9f.lonePoolN);
  ok('★ 但这时必须明说「与手中其余之物都配不上」（否则玩家只会白按方向键）',
    t9f.hasLone === false || /配不上/.test(String(t9f.loneMsg)), String(t9f.loneMsg));

  sec('T10  运行期无报错');
  ok('没有页面错误', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\n' + '─'.repeat(50));
  console.log('  通过 ' + pass + ' / 失败 ' + fail);
  if (failed.length) { console.log('  失败项：'); failed.forEach(f => console.log('   - ' + f)); }
  else console.log('  全部通过 ✅');
  console.log('─'.repeat(50));

  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
