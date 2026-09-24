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
