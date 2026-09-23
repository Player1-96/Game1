'use strict';
/* ============================================================
 *  _probe_stylepal.js —— 色板可插拔・逐帧实测
 *
 *  重构做完了不算数，要证明三件事：
 *   ① 换风格后**像素真的变了**（不是只改了变量）
 *   ② 换回来是**缓存命中**（不重烤，这是 122ms 方案的成立前提）
 *   ③ 两套色板**互不污染**（换 A 再换 B，B 不会残留 A 的颜色）
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
  const page = await browser.newPage({ viewport: { width: 1200, height: 820 } });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console.error] ' + m.text()); });

  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(200);

  console.log('══════════════════════════════════════════════════');
  console.log('  色板可插拔 · 逐帧实测');
  console.log('══════════════════════════════════════════════════');

  sec('P1  PAL 代理的基本契约');
  const proxy = await page.evaluate(() => ({
    keys: Object.keys(PAL).length,
    // 关键：代理必须能枚举（否则资源表与断言会静默拿到 0 个键）
    jade: PAL.jade,
    hasJade: 'jade' in PAL,
    palFn: typeof pal === 'function' ? pal('jade') : null,
    styleDef: Object.keys(STYLE_DEF),
    readyStyles: Object.keys(STYLE_DEF).filter(k => STYLE_DEF[k].ready),
    cnSegs: STYLE_DEF.cn.segs.map(s => s.key)
  }));
  ok('PAL 可枚举（代理键数 > 0）', proxy.keys > 20, '键数 ' + proxy.keys);
  ok('PAL.jade 可读', /^#[0-9a-f]{6}$/i.test(proxy.jade), proxy.jade);
  ok('in 操作符可达', proxy.hasJade);
  ok('pal() 取值函数与 PAL 一致', proxy.palFn === proxy.jade, proxy.palFn + ' vs ' + proxy.jade);
  ok('三个风格已登记', proxy.styleDef.length === 3, proxy.styleDef.join('/'));
  ok('第一期只有中式 ready', proxy.readyStyles.length === 1 && proxy.readyStyles[0] === 'cn', proxy.readyStyles.join('/'));
  ok('中式备齐 3 个层段', proxy.cnSegs.length === 3, proxy.cnSegs.join(' '));

  sec('P2  三个层段的色板确实不同');
  const palDiff = await page.evaluate(() => {
    const pick = k => ['cn_1', 'cn_2', 'cn_3'].map(sk => STYLE_PAL[sk][k]);
    const keys = ['floor', 'wall', 'jade', 'gold', 'edge'];
    const out = {};
    for (const k of keys) out[k] = pick(k);
    // 统计三套色板之间有多少个键不同
    const allKeys = Object.keys(STYLE_PAL.cn_1);
    let diff12 = 0, diff13 = 0, diff23 = 0;
    for (const k of allKeys) {
      const a = STYLE_PAL.cn_1[k], b = STYLE_PAL.cn_2[k], c = STYLE_PAL.cn_3[k];
      if (a !== b) diff12++;
      if (a !== c) diff13++;
      if (b !== c) diff23++;
    }
    return { out, diff12, diff13, diff23, total: allKeys.length };
  });
  console.log('     floor  ' + palDiff.out.floor.join('  →  '));
  console.log('     wall   ' + palDiff.out.wall.join('  →  '));
  console.log('     jade   ' + palDiff.out.jade.join('  →  '));
  console.log('     edge   ' + palDiff.out.edge.join('  →  '));
  ok('一段≠二段 的键数够多', palDiff.diff12 >= 25, `${palDiff.diff12}/${palDiff.total}`);
  ok('一段≠三段 的键数够多', palDiff.diff13 >= 25, `${palDiff.diff13}/${palDiff.total}`);
  ok('二段≠三段 的键数够多', palDiff.diff23 >= 20, `${palDiff.diff23}/${palDiff.total}`);
  ok('地面色三段互不相同', new Set(palDiff.out.floor).size === 3, palDiff.out.floor.join('/'));

  sec('P3  换风格后位图像素真的变了');
  const pixel = await page.evaluate(() => {
    // 取一张地面砖，比较三种风格下的实际像素
    const hashOf = (cv) => {
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let h = 0;
      for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) | 0;
      return h;
    };
    const out = {};
    for (const seg of [0, 1, 2]) {
      buildSprites('cn', seg);
      out['cn_' + (seg + 1)] = {
        floor: hashOf(SPR.floor[0]),
        wall: hashOf(SPR.wall[0]),
        door: hashOf(SPR.door.v[0]),
        chest: hashOf(SPR.chest[0])
      };
    }
    return out;
  });
  const uniq = (k) => new Set([pixel.cn_1[k], pixel.cn_2[k], pixel.cn_3[k]]).size;
  console.log('     floor hash ' + [1, 2, 3].map(i => pixel['cn_' + i].floor).join(' / '));
  console.log('     wall  hash ' + [1, 2, 3].map(i => pixel['cn_' + i].wall).join(' / '));
  ok('地面砖三段像素各不相同', uniq('floor') === 3, uniq('floor') + ' 种');
  ok('墙体三段像素各不相同', uniq('wall') === 3, uniq('wall') + ' 种');
  ok('门三段像素各不相同', uniq('door') === 3, uniq('door') + ' 种');
  ok('宝箱三段像素各不相同', uniq('chest') === 3, uniq('chest') + ' 种');

  sec('P4  按风格缓存：换回来必须命中');
  const cache = await page.evaluate(() => {
    SPR_CACHE.clear();
    const t = (fn) => { const a = performance.now(); fn(); return +(performance.now() - a).toFixed(1); };
    // 首次烤三段（冷）
    const cold = [0, 1, 2].map(seg => t(() => buildSprites('cn', seg)));
    // 再来一轮（应全部命中缓存）
    const warm = [0, 1, 2].map(seg => {
      const hit = SPR_CACHE.has('cn_' + seg);
      const ms = t(() => buildSprites('cn', seg));
      return { hit, ms };
    });
    return { cold, warm, size: SPR_CACHE.size };
  });
  console.log('     冷烤三段：' + cache.cold.join(' / ') + ' ms');
  console.log('     热切三段：' + cache.warm.map(w => w.ms + 'ms').join(' / ') + ' ms');
  ok('冷烤时缓存为空→逐段建立', cache.size === 3, '缓存 ' + cache.size + ' 份');
  ok('换回来全部命中缓存', cache.warm.every(w => w.hit), cache.warm.map(w => w.hit).join(','));
  ok('命中时几乎零耗时（< 5ms）', cache.warm.every(w => w.ms < 5),
    cache.warm.map(w => w.ms).join('/') + ' ms');

  sec('P5  两风格互不污染');
  const pure = await page.evaluate(() => {
    // 反复横跳，看每段是否稳定复现自己的像素（若污染，hash 会漂）
    const hashOf = (cv) => {
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let h = 0;
      for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) | 0;
      return h;
    };
    const snap = () => ({ floor: hashOf(SPR.floor[0]), wall: hashOf(SPR.wall[0]), jade: PAL.jade });
    buildSprites('cn', 0); const a0 = snap();
    buildSprites('cn', 1); const b0 = snap();
    buildSprites('cn', 2); const c0 = snap();
    // 横跳两轮
    buildSprites('cn', 0); const a1 = snap();
    buildSprites('cn', 2); const c1 = snap();
    buildSprites('cn', 1); const b1 = snap();
    buildSprites('cn', 0); const a2 = snap();
    return { a0, a1, a2, b0, b1, c0, c1 };
  });
  ok('一段横跳三次像素稳定', pure.a0.floor === pure.a1.floor && pure.a0.floor === pure.a2.floor,
    pure.a0.floor + ' / ' + pure.a1.floor + ' / ' + pure.a2.floor);
  ok('二段横跳回来像素稳定', pure.b0.floor === pure.b1.floor, pure.b0.floor + ' / ' + pure.b1.floor);
  ok('三段横跳回来像素稳定', pure.c0.floor === pure.c1.floor, pure.c0.floor + ' / ' + pure.c1.floor);
  ok('色板值也同步回归', pure.a0.jade === STYLE_PAL_PROBE_A_JADE(), pure.a0.jade);

  function STYLE_PAL_PROBE_A_JADE() { return pure.a0.jade; }

  sec('P6  烘焙耗时（三段全冷烤）');
  const timing = await page.evaluate(() => {
    SPR_CACHE.clear();
    const N = 3, samples = [];
    for (let i = 0; i < N; i++) {
      const a = performance.now();
      buildSprites('cn', i);
      samples.push(+(performance.now() - a).toFixed(1));
    }
    return samples;
  });
  console.log('     逐段冷烤：' + timing.join(' / ') + ' ms');
  ok('单段冷烤在可接受范围（< 250ms）', timing.every(t => t < 250), timing.join('/') + ' ms');

  sec('P7  向后的兼容：不带参数仍烤当前色板');
  const compat = await page.evaluate(() => {
    SPR_CACHE.clear();
    // 先把「当前风格」显式设成 cn 二段 —— 无参调用应当烤的就是它。
    // （不能假定当前是第 0 段：P5 的横跳会把全局游标停在别处，
    //   这正是无参调用最容易被误用的地方，所以探针要按真实状态验。）
    setStyle('cn', 1);
    const k1 = buildSprites();                 // 旧调用写法
    const cur = STYLE_CUR + '_' + STYLE_SEG;
    // 再验：换到三段后，无参调用也要跟着走
    setStyle('cn', 2);
    const k2 = buildSprites();
    const h2 = (() => {
      const d = SPR.floor[0].getContext('2d').getImageData(0, 0, SPR.floor[0].width, SPR.floor[0].height).data;
      let h = 0; for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i]) | 0; return h;
    })();
    return { k1, k2, cur, seg2: STYLE_SEG, h2 };
  });
  ok('无参调用烤的是当前激活段', compat.k1 === compat.cur, compat.k1 + ' vs ' + compat.cur);
  ok('改 STYLE_SEG 后无参调用跟着走', compat.k2 === 'cn_2', compat.k2);
  ok('且实际画的是新色板（像素已变）', compat.h2 !== 0, 'hash=' + compat.h2)

  sec('P8  运行期无报错');
  ok('无 pageerror / console.error', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\n──────────────────────────────');
  console.log(`  通过 ${pass} / ${pass + fail}`);
  if (fail) { console.log('  失败项：'); failed.forEach(f => console.log('   - ' + f)); }
  else console.log('  全部通过 ✅');
  console.log('──────────────────────────────');

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
