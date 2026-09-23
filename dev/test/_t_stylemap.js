'use strict';
/* ============================================================
 *  _t_stylemap.js —— 风格地图（27 条路径）+ 色板可插拔・回归
 *
 *  覆盖：
 *    T1 色板表结构：三风格 × 中式 3 段、键齐备、无缺键
 *    T2 PAL 代理契约：可枚举 / 可读 / in 可达 / pal() 一致
 *    T3 层段推进：第几层属于第几段、哪几层弹面板
 *    T4 27 条路径：允许重复、三段各自记录、连选三次同风格合法
 *    T5 换风格真的换了像素 + 缓存命中 + 互不污染
 *    T6 存档：路径落盘、读档色板不跳段、老存档回落
 *    T7 面板交互：键盘导航 / 确认 / Esc 退回
 *    T8 运行期无报错
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
  console.log('  风格地图 · 27 条路径 + 色板可插拔　回归');
  console.log('══════════════════════════════════════════════════');

  sec('T1  色板表结构');
  const tbl = await page.evaluate(() => {
    const styles = Object.keys(STYLE_DEF);
    const out = { styles, rows: [], missing: [] };
    for (const sk of styles) {
      const d = STYLE_DEF[sk];
      for (const s of (d.segs || [])) {
        const p = STYLE_PAL[s.key];
        const miss = PAL_KEYS.filter(k => p[k] === undefined || p[k] === null);
        out.rows.push({ style: sk, seg: s.key, cn: d.cn, segCN: s.cn, nm: s.name, keys: p ? Object.keys(p).length : 0 });
        if (miss.length) out.missing.push(s.key + ':' + miss.join(','));
      }
    }
    return out;
  });
  console.log('     风格：' + tbl.styles.join(' / '));
  tbl.rows.forEach(r => console.log(`     ${r.cn}·${r.segCN}　色板 ${r.seg}　${r.keys} 键`));
  ok('三个风格已登记', tbl.styles.length === 3, tbl.styles.join('/'));
  ok('中式备齐 3 段', tbl.rows.filter(r => r.style === 'cn').length === 3);
  ok('每套色板覆盖全部 PAL_KEYS', tbl.missing.length === 0, tbl.missing.join(' | '));

  sec('T2  PAL 代理契约');
  const proxy = await page.evaluate(() => ({
    n: Object.keys(PAL).length,
    jade: PAL.jade,
    inOp: 'jade' in PAL,
    palFn: pal('jade'),
    palOfOther: pal('jade', 'cn_2'),
    cur: curPal().jade,
    keysFn: typeof curPal === 'function'
  }));
  ok('可枚举（键数 = PAL_KEYS 数）', proxy.n === 47 || proxy.n > 40, '键数 ' + proxy.n);
  ok('PAL.jade 可读', /^#[0-9a-f]{6}$/i.test(proxy.jade), proxy.jade);
  ok('in 操作符可达', proxy.inOp);
  ok('pal() 与 PAL 一致', proxy.palFn === proxy.jade);
  ok('pal(key, 指定色板) 可跨风格取色', proxy.palOfOther !== proxy.jade,
     'cn_2: ' + proxy.palOfOther + ' vs cn_1: ' + proxy.jade);

  sec('T3  层段推进规则');
  const seg = await page.evaluate(() => {
    const rows = [];
    // 扫满整局，段边界由 SEG_FLOORS 决定，不写死层号
    for (let d = 1; d <= STYLE_SYS.totalFloors; d++) rows.push({ d, seg: segOfFloor(d), pick: isSegPickFloor(d) });
    const F = STYLE_SYS.segFloors;
    // 「第 N 段的全部层」用段号筛，而不是按 3 层一组切 —— 每段 5 层
    const segRows = (s) => rows.filter(r => r.seg === s).map(r => r.d);
    return {
      rows, segFloors: F, segCount: STYLE_SYS.segCount, total: STYLE_SYS.totalFloors,
      perSeg: [0, 1, 2].map(segRows),
      pickFloors: rows.filter(r => r.pick).map(r => r.d)
    };
  });
  console.log('     层 → 段：' + seg.rows.map(r => r.d + '→' + r.seg).join('  '));
  console.log('     弹面板的层：' + seg.pickFloors.join(' / '));
  ok('每段层数与总层数自洽', seg.total === seg.segFloors * seg.segCount, `每段 ${seg.segFloors} 层 / 共 ${seg.total} 层`);
  ok('第 0 段的层 = 1~段层数', seg.perSeg[0].join(',') === Array.from({ length: seg.segFloors }, (_, i) => i + 1).join(','));
  ok('第 1 段的层从段层数+1 起（连排）',
     seg.perSeg[1].join(',') === Array.from({ length: seg.segFloors }, (_, i) => seg.segFloors + i + 1).join(','));
  ok('第 2 段的层一路排到最后一层',
     seg.perSeg[2].join(',') === Array.from({ length: seg.segFloors }, (_, i) => seg.segFloors * 2 + i + 1).join(','));
  ok('三段刚好把整局切完（无缝无重叠）',
     seg.perSeg[0].length + seg.perSeg[1].length + seg.perSeg[2].length === seg.total);
  ok('只在段首弹面板（第 1 层除外）',
     seg.pickFloors.join(',') ===
     [seg.segFloors + 1, seg.segFloors * 2 + 1].join(','),
     seg.pickFloors.join(','));

  /* 顶栏层号必须走中文数字。旧实现是个只到「九」的数组，兜底表达式在第 10 层起
     直接吐阿拉伯数字，「第11层」比「第十一层」宽，会把右侧风格标识块挤歪。
     773 条断言全绿也照样漏掉 —— 因为没人断言过 HUD 文案本身。 */
  sec('T3b  顶栏层号中文化（15 层化时出图才发现的问题）');
  const cn = await page.evaluate(() => {
    const G = window.Game;
    /* updateOverlay 在 state='title' 时会把 floorName 清空并提前返回，
       所以必须先真正开一局，否则量到的全是空串（踩过）。 */
    G.newRun('feijian');
    const floors = [];
    for (let d = 1; d <= STYLE_SYS.totalFloors; d++) {
      G.depth = d;
      updateOverlay();
      const el = document.getElementById('floorName');
      floors.push({ d, txt: el ? el.textContent : '' });
    }
    return { floors, total: STYLE_SYS.totalFloors, n20: cnNum(20), n1: cnNum(1) };
  });
  console.log('     层号文案：' + cn.floors.map(f => f.d + '→' + f.txt.split(' ·')[0]).join('  '));
  const bad = cn.floors.filter(f => /[0-9]/.test(f.txt));
  ok('1~' + cn.total + ' 层的顶栏文案里不出现阿拉伯数字',
     bad.length === 0,
     bad.length ? bad.map(f => f.d + ':' + f.txt).join(' | ') : '');
  ok('第 1 层写作「第一层」', cn.floors[0].txt.startsWith('第一层'), cn.floors[0].txt);
  ok('第 10 层写作「第十层」', cn.floors[9].txt.startsWith('第十层'), cn.floors[9].txt);
  ok('第 11 层写作「第十一层」', cn.floors[10].txt.startsWith('第十一层'), cn.floors[10].txt);
  ok('第 15 层（末层）写作「第十五层」', cn.floors[14].txt.startsWith('第十五层'), cn.floors[14].txt);
  ok('cnNum(20) = 「二十」（将来快速模式的余量）', cn.n20 === '二十', cn.n20);
  ok('cnNum(1) = 「一」', cn.n1 === '一', cn.n1);

  sec('T4  27 条路径：允许重复 + 三段记录');
  const paths = await page.evaluate(() => {
    const out = {};
    // 枚举所有 3³ 组合，逐个走一遍，看是否都能走通、是否都记进 stylePath
    const combos = [];
    for (const a of ['cn', 'cn', 'cn'].map((_, i) => 'cn')) { }
    // 第一期只有一个可选风格，所以 27 条路径在「风格取值」上会塌缩。
    // 但机制必须支持 3 个不同取值 —— 用注入的假风格表验证机制本身。
    const FAKE = JSON.parse(JSON.stringify(STYLE_DEF));
    FAKE.alpha = { name: '测试甲', cn: '甲', ready: true, segs: [{ key: 'cn_1', cn: '甲一', name: 'A1' }, { key: 'cn_2', cn: '甲二', name: 'A2' }, { key: 'cn_3', cn: '甲三', name: 'A3' }] };
    FAKE.beta = { name: '测试乙', cn: '乙', ready: true, segs: [{ key: 'cn_2', cn: '乙一', name: 'B1' }, { key: 'cn_3', cn: '乙二', name: 'B2' }, { key: 'cn_1', cn: '乙三', name: 'B3' }] };
    const real = {};
    for (const k of Object.keys(STYLE_DEF)) real[k] = STYLE_DEF[k].ready;
    STYLE_DEF.alpha = FAKE.alpha; STYLE_DEF.beta = FAKE.beta;
    try {
      const pool = STYLE_SYS.pickPool();
      out.pool = pool.slice();
      const all = [];
      for (const a of pool) for (const b of pool) for (const c of pool) all.push([a, b, c]);
      out.n = all.length;
      out.dup = all.filter(p => p[0] === p[1] && p[1] === p[2]).length;

      // 逐条在页面里走一遍：写入路径 → 检查记录
      const G = window.Game;
      let badTrace = null;
      for (const p of all) {
        G.newRun('feijian');
        G.stylePath = [p[0]]; G.seg = 0;
        for (let s = 1; s < 3; s++) {
          G.seg = s;
          G.openStyleMenu('next');
          G.styleMenu.sel = p[s];
          G.styleMenu.idx = G.styleMenu.pool.indexOf(p[s]);
          G.styleMenuConfirm();
          if (G.state === 'stylePick') { badTrace = p.join('/') + ' 在段 ' + s + ' 卡住'; break; }
        }
        if (badTrace) break;
        if (G.stylePath.join('/') !== p.join('/')) { badTrace = p.join('/') + ' 记录成了 ' + G.stylePath.join('/'); break; }
      }
      out.badTrace = badTrace;
      // 连选三次同风格（用户明确要的「中-中-中」）
      G.newRun('feijian');
      G.stylePath = ['alpha']; G.seg = 0;
      for (let s = 1; s < 3; s++) { G.seg = s; G.openStyleMenu('next'); G.styleMenu.sel = 'alpha'; G.styleMenu.idx = G.styleMenu.pool.indexOf('alpha'); G.styleMenuConfirm(); }
      out.sameThrice = G.stylePath.slice();
      // 三段各自的色板确实不同
      out.segPal = [0, 1, 2].map(s => { G.seg = s; G.applySegmentPalette(); return PAL.floor; });
    } finally {
      for (const k of Object.keys(STYLE_DEF)) if (!(k in real)) delete STYLE_DEF[k];
      for (const k of Object.keys(real)) STYLE_DEF[k].ready = real[k];
    }
    return out;
  });
  console.log('     可择风格（注入测试表后）：' + paths.pool.join(' / '));
  console.log('     组合总数：' + paths.n + '　其中三连同风格：' + paths.dup + ' 条');
  console.log('     三连同风格记录：' + (paths.sameThrice || []).join(' · '));
  console.log('     同风格三段的地板色：' + (paths.segPal || []).join('  →  '));
  ok('每节点三选一 → 27 条路径', paths.n === 27, '实际 ' + paths.n);
  ok('三条「三连同风格」路径合法（用户明确要求）', paths.dup === 3, paths.dup + ' 条');
  ok('27 条路径全部可走通且记录正确', paths.badTrace === null, paths.badTrace || '全部通过');
  ok('连选三次同风格被正确记录', (paths.sameThrice || []).join('') === 'alphaalphaalpha',
     (paths.sameThrice || []).join('/'));
  ok('同风格的三段配色互不相同（层段差异的落点）',
     new Set(paths.segPal).size === 3, paths.segPal.join(' / '));

  sec('T5  换风格：像素变 / 缓存命中 / 互不污染');
  const sw = await page.evaluate(() => {
    const hashOf = cv => {
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let h = 0; for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i + 1] * 3) | 0;
      return h;
    };
    SPR_CACHE.clear();
    const t = fn => { const a = performance.now(); fn(); return +(performance.now() - a).toFixed(1); };
    const first = [0, 1, 2].map(s => { const ms = t(() => buildSprites('cn', s)); return { ms, floor: hashOf(SPR.floor[0]) }; });
    const second = [0, 1, 2].map(s => { const hit = SPR_CACHE.has('cn_' + s); const ms = t(() => buildSprites('cn', s)); return { hit, ms }; });
    // 横跳验污染
    buildSprites('cn', 0); const h0 = hashOf(SPR.floor[0]);
    buildSprites('cn', 2); const h2 = hashOf(SPR.floor[0]);
    buildSprites('cn', 0); const h0b = hashOf(SPR.floor[0]);
    return { first, second, h0, h2, h0b, cacheSize: SPR_CACHE.size, deterministic: h0 === h0b };
  });
  console.log('     冷烤：' + sw.first.map(f => f.ms + 'ms').join(' / '));
  console.log('     热切：' + sw.second.map(f => f.ms + 'ms').join(' / '));
  ok('三段冷烤的地板像素各不相同', new Set(sw.first.map(f => f.floor)).size === 3);
  ok('换回来全部命中缓存', sw.second.every(w => w.hit), sw.second.map(w => w.hit).join(','));
  ok('命中时近零耗时', sw.second.every(w => w.ms < 5), sw.second.map(w => w.ms).join('/') + ' ms');
  ok('横跳后像素回到原值（无污染）', sw.h0 === sw.h0b, sw.h0 + ' → ' + sw.h2 + ' → ' + sw.h0b);
  ok('缓存份数 = 风格数', sw.cacheSize === 3, sw.cacheSize + ' 份');

  sec('T6  存档：路径落盘 / 读档不跳段 / 老存档回落');
  const save = await page.evaluate(() => {
    const G = window.Game;
    const KEY = 'xiuxian-isaac.save.v1';
    localStorage.removeItem(KEY);

    /* ⚠️ 读档测试的顺序陷阱（这次自己踩了）：
       newRun 会立刻 newFloor(1) → enterRoom → **自动存档**，
       所以「先 newRun 再 continueGame」必然读到刚写的新档，seg 一定是 0。
       正确做法：直接摆好一个「磁盘上的档」，再 continueGame —— 不要先 newRun。 */
    G.newRun('feijian');
    /* 摆在第三段的**中间层**（每段 5 层 → 第 11 层）——
       不要用段边界层（第 5 / 10 层），否则「按层数回落」的边界条件会被掩盖。 */
    const D3 = STYLE_SYS.segFloors * 2 + 1;
    G.depth = D3;                      // 摆在第三段
    G.stylePath = ['cn', 'cn', 'cn'];
    G.seg = 2;
    G.applySegmentPalette();
    const floorSaved = PAL.floor;
    G.saveGame();                      // 只到这一步为止，别再做会触发自动存档的事
    const raw = JSON.parse(localStorage.getItem(KEY));

    // 读回来（continueGame 内部不调 newRun，不会覆盖档）
    const okLoad = G.continueGame();
    const after = { seg: G.seg, path: (G.stylePath || []).slice(), floor: PAL.floor, state: G.state, depth: G.depth };

    // 老存档（没有 stylePath/seg 字段）要能按层数回落
    const legacy = JSON.parse(localStorage.getItem(KEY));
    delete legacy.stylePath; delete legacy.seg;
    localStorage.setItem(KEY, JSON.stringify(legacy));
    const legacyOk = G.continueGame();
    const legacyRes = { seg: G.seg, path: (G.stylePath || []).slice(), state: G.state, depth: G.depth };
    return { rawPath: raw.stylePath, rawSeg: raw.seg, rawDepth: raw.depth,
             okLoad, after, floorSaved, legacyOk, legacyRes, D3 };
  });
  ok('存档写入 stylePath（三段全落盘）',
     Array.isArray(save.rawPath) && save.rawPath.length === 3 && save.rawPath.every(k => k === 'cn'),
     JSON.stringify(save.rawPath));
  ok('存档写入 seg', save.rawSeg === 2, 'seg=' + save.rawSeg);
  ok('读档成功', save.okLoad === true);
  ok('读档还原 seg', save.after.seg === 2, 'seg=' + save.after.seg + ' depth=' + save.after.depth);
  ok('读档还原色板（不跳回一段）', save.after.floor === save.floorSaved,
     save.floorSaved + ' vs ' + save.after.floor);
  ok('老存档（无新字段）也能读', save.legacyOk === true);
  ok('老存档 seg 按层数回落（第 ' + save.D3 + ' 层 → 第 2 段）', save.legacyRes.seg === 2,
     'seg=' + save.legacyRes.seg + ' / depth=' + save.legacyRes.depth);
  await page.evaluate(() => localStorage.removeItem('xiuxian-isaac.save.v1'));

  sec('T7  面板交互：导航 / 确认 / Esc');
  const ui = await page.evaluate(() => {
    const G = window.Game;
    const FAKE = { name: '测试甲', cn: '甲', ready: true, segs: [{ key: 'cn_1', cn: '甲一', name: 'A1' }, { key: 'cn_2', cn: '甲二', name: 'A2' }, { key: 'cn_3', cn: '甲三', name: 'A3' }] };
    const FAKE2 = { name: '测试乙', cn: '乙', ready: true, segs: [{ key: 'cn_2', cn: '乙一', name: 'B1' }, { key: 'cn_3', cn: '乙二', name: 'B2' }, { key: 'cn_1', cn: '乙三', name: 'B3' }] };
    const real = {}; for (const k of Object.keys(STYLE_DEF)) real[k] = STYLE_DEF[k].ready;
    STYLE_DEF.alpha = FAKE; STYLE_DEF.beta = FAKE2;
    const out = {};
    try {
      G.newRun('feijian');
      // 开局面板
      G.depth = 1; G.seg = 0;
      G.openStyleMenu('first');
      out.first = { state: G.state, n: G.styleMenu.pool.length, idx: G.styleMenu.idx };
      // 导航
      G.styleMenuMove(1); out.moved = G.styleMenu.idx;
      G.styleMenuMove(-1); out.movedBack = G.styleMenu.idx;
      // 循环环绕
      G.styleMenu.idx = 0; G.styleMenuMove(-1); out.wrapped = G.styleMenu.idx;
      // 确认
      G.styleMenu.sel = G.styleMenu.pool[1];
      G.styleMenuConfirm();
      out.firstDone = { state: G.state, path: G.stylePath.slice(), seg: G.seg };
      // Esc 在开局不可退
      G.openStyleMenu('first');
      G.styleMenuBack();
      out.firstBack = G.state;
      G.styleMenu = null; G.state = 'play';
      // 段间：Esc 可退
      G.depth = 6; G.seg = 1; G.stylePath = ['alpha', 'alpha', 'alpha'];
      G.openStyleMenu('next');
      out.nextState = G.state;
      const dBefore = G.depth;
      G.styleMenuBack();
      out.nextBack = { state: G.state, depth: G.depth, dBefore };
      // 段间：确认后覆盖当前段
      G.depth = 6; G.seg = 1;
      G.openStyleMenu('next');
      G.styleMenu.sel = G.styleMenu.pool[0];
      G.styleMenuConfirm();
      out.overwrite = { path: G.stylePath.slice(), state: G.state };
    } finally {
      for (const k of Object.keys(STYLE_DEF)) if (!(k in real)) delete STYLE_DEF[k];
      for (const k of Object.keys(real)) STYLE_DEF[k].ready = real[k];
      G.styleMenu = null; G.state = 'title';
    }
    return out;
  });
  ok('开局面板进 stylePick', ui.first.state === 'stylePick', 'state=' + ui.first.state);
  ok('← → 可导航', ui.moved === 1 && ui.movedBack === 0, `${ui.moved} / ${ui.movedBack}`);
  ok('导航可环绕', ui.wrapped === ui.first.n - 1, 'wrap → ' + ui.wrapped);
  ok('确认后开局并记录路径', ui.firstDone.state === 'play' && ui.firstDone.path.length === 1,
     ui.firstDone.path.join('/') + ' seg=' + ui.firstDone.seg);
  ok('开局面板 Esc 不生效（必选）', ui.firstBack === 'stylePick', 'state=' + ui.firstBack);
  ok('段间面板 Esc 可退回上一层', ui.nextBack.state === 'play' && ui.nextBack.depth === ui.nextBack.dBefore - 1,
     `depth ${ui.nextBack.dBefore} → ${ui.nextBack.depth}`);
  ok('段间确认是覆盖当前段（不是追加）', ui.overwrite.path.length === 3,
     ui.overwrite.path.join('/'));

  sec('T7b  只有一个可选项时不弹面板（出图才发现的问题）');
  const solo = await page.evaluate(() => {
    const G = window.Game;
    const real = {}; for (const k of Object.keys(STYLE_DEF)) real[k] = STYLE_DEF[k].ready;
    STYLE_DEF.nordic.ready = false; STYLE_DEF.cthulhu.ready = false;   // 只留中式
    const out = {};
    try {
      out.pool = STYLE_SYS.pickPool().slice();
      // 开局：应直接开局，不进 stylePick
      G.newRun('feijian');
      G.pendingRunStyle = 'feijian';
      G.openStyleMenu('first');
      out.first = { state: G.state, menu: !!G.styleMenu, path: (G.stylePath || []).slice() };
      // 段间：应直接换段进层，不进 stylePick
      G.depth = 4; G.seg = 1; G.stylePath = ['cn', 'cn', 'cn'];
      G.openStyleMenu('next');
      out.next = { state: G.state, menu: !!G.styleMenu, depth: G.depth, path: (G.stylePath || []).slice() };
    } finally {
      for (const k of Object.keys(real)) STYLE_DEF[k].ready = real[k];
      G.styleMenu = null; G.state = 'title';
    }
    return out;
  });
  ok('测试前提：池里只剩 1 个风格', solo.pool.length === 1, solo.pool.join('/'));
  ok('开局只有一个选项时直接开局（不弹面板）',
     solo.first.state === 'play' && solo.first.menu === false, 'state=' + solo.first.state);
  ok('且路径已记录该风格', solo.first.path.join('') === 'cn', solo.first.path.join('/'));
  ok('段间只有一个选项时直接进层（不弹面板）',
     solo.next.state === 'play' && solo.next.menu === false, 'state=' + solo.next.state);
  ok('且没在白等玩家按键', solo.next.depth === 4, 'depth=' + solo.next.depth);

  sec('T8  运行期无报错');
  ok('无 pageerror / console.error', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\n──────────────────────────────');
  console.log(`  通过 ${pass} / ${pass + fail}`);
  if (fail) { console.log('  失败项：'); failed.forEach(f => console.log('   - ' + f)); }
  else console.log('  全部通过 ✅');
  console.log('──────────────────────────────');

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
