'use strict';
/* ============================================================
 *  _probe_fusion_power.js —— 融合到底有没有「越融越弱」
 *
 *  做法：对每条配方，把「保留两件材料」与「换成产物」两条路的属性各算一遍，
 *  逐字段对比。产物**低于**材料之和的字段就是潜在的「变弱」。
 *
 *  ⚠️ 为什么不靠人眼读代码：材料里有乘性效果（speed ×1.25、fireRate ×1.35），
 *     还有 TAIXU / 尸毒珠 这种按 rank 派生的，肉眼看很容易漏。
 *     而且「感觉变弱」往往来自**说明没写全**，不是数值真的弱 —— 所以还要比对文案。
 *
 *  跑法：node dev/probe/_probe_fusion_power.js
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
    /* ⚠️ mpRegen 必须在内 —— 第一版漏了它，于是「灵脉把 mpRegen 写成 regen，
       丢了每秒回灵」这个真 bug 从探针眼皮底下溜过去了（用户先发现的）。
       凡是 stats 上的字段都要列进来，别只挑眼熟的。 */
    const NUM = ['damage', 'fireRate', 'speed', 'shotSpeed', 'range', 'pierce', 'spread',
      'homing', 'homingRange', 'knockback', 'luck', 'burn', 'frost', 'chain', 'iframe',
      'greed', 'crit', 'poison', 'regen', 'mpRegen', 'soul', 'deflect', 'reflect'];
    const PLR = ['shield', 'shieldCap'];
    const grab = p => {
      const out = {};
      for (const k of NUM) out[k] = +(+p.stats[k]).toFixed(4);
      for (const k of PLR) out[k] = +((p[k] === undefined ? 0 : p[k])).toFixed(4);
      out._fus = Object.keys(p.stats.fus || {}).filter(x => p.stats.fus[x]).sort().join('+');
      return out;
    };
    const rows = [];
    for (const rec of FUSION_DEF) {
      const A = ITEM_MAP[rec.a], B = ITEM_MAP[rec.b], O = ITEM_MAP[rec.id];
      const keep = new Player(0, 0);          // 不融：两件材料都留着
      A.apply(keep, 0, 'feijian');
      B.apply(keep, 0, 'feijian');
      const fused = new Player(0, 0);         // 融掉：只剩产物
      O.apply(fused, 0, 'feijian');
      const k = grab(keep), f = grab(fused);
      const worse = [], better = [];
      for (const key of Object.keys(k)) {
        if (key === '_fus') { if (f._fus) better.push('新机制{' + f._fus + '}'); continue; }
        const d = +(f[key] - k[key]).toFixed(4);
        if (Math.abs(d) < 1e-9) continue;
        if (d < 0) worse.push({ key: key, keep: k[key], fused: f[key], d: d });
        else better.push(key + ' +' + d);
      }
      rows.push({ id: rec.id, out: O.name, a: A.name, b: B.name, worse: worse, better: better,
                  keepDesc: A.desc + '　‖　' + B.desc, outDesc: O.desc });
    }
    return rows;
  });

  console.log('══════════════════════════════════════════════════');
  console.log('  融合的强弱审计：产物 vs 「两件材料都留着」');
  console.log('══════════════════════════════════════════════════\n');
  let bad = 0;
  r.forEach(x => {
    if (x.worse.length) bad++;
    console.log((x.worse.length ? '❌ 有字段变低' : '✅ 全面不弱') + '　' + x.a + ' + ' + x.b + ' → ' + x.out);
    if (x.worse.length) {
      x.worse.forEach(w => console.log('        变低：' + w.key
        + '　保留 ' + w.keep + ' → 产物 ' + w.fused + '（' + w.d + '）'));
    }
    console.log('        提升：' + (x.better.join('　') || '（无数值提升）'));
  });
  console.log('\n──────────────────────────────────────────────');
  console.log('  全面不弱：' + (r.length - bad) + ' / ' + r.length + '　有字段变低：' + bad + ' 条');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
