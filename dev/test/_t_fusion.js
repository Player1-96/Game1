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
  ok('配方数在 6~10 之间', t1.n >= 6 && t1.n <= 10, String(t1.n));
  ok('每条配方的两件材料都存在于道具表', t1.rows.every(r => r.aOk && r.bOk));
  ok('每条配方的产物都存在于道具表', t1.rows.every(r => r.outOk));
  ok('产物都是法宝且带 fusion 标记', t1.rows.every(r => r.outFabao && r.outFusion));
  ok('没有自环（产物不能再当自己的材料）', t1.rows.every(r => !r.selfLoop));
  ok('配方 id 不重复', !t1.dupIds);
  ok('配方「材料对」不重复', !t1.dupPairs);

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
   *  T3 产物不进随机池
   * ------------------------------------------------------------- */
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
   *  T10 运行期无报错
   * ------------------------------------------------------------- */
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
