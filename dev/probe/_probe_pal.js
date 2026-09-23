'use strict';
/* ============================================================
 *  _probe_pal.js —— 色板可插拔重构・前置探针
 *
 *  第二期的第一件事不是改代码，是先量清楚「换风格要付多少代价」。
 *  ROADMAP 里写明：素材是启动时烘焙的（buildSprites 一次性烤成 canvas），
 *  换风格意味着重新烘焙 434 处 PAL 引用画出来的全部位图。
 *  这个耗时决定重构方案 —— 能不能「实时换」，还是必须「按风格缓存」。
 *
 *  量四件事：
 *   ① 单次 buildSprites() 耗时（分项：主角 / 妖物 / Boss / 地面墙 / 道具）
 *   ② 连续重建 N 次的均值（排除首次 JIT 冷启动）
 *   ③ 全量素材体积（canvas 张数 × 像素）
 *   ④ 色板替换的静态面：PAL 键数、硬编码色分布
 * ============================================================ */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');

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
  console.log('  色板重构前置探针：换风格的真实代价');
  console.log('══════════════════════════════════════════════════\n');

  /* ---------- ① 单次烘焙耗时（分项拆开量） ---------- */
  const bake = await page.evaluate(() => {
    const t = fn => { const a = performance.now(); fn(); return performance.now() - a; };
    // 逐块计时：把 buildSprites 里的各段单独跑一遍（不改 SPR，只量绘制函数）
    const parts = {};
    parts.player = t(() => {
      drawTaoist('down', 0); drawTaoist('down', 1);
      drawTaoistCharge('down', 0); drawTaoistSwing('down', 0);
    });
    parts.enemies = t(() => {
      drawXieSui(0); drawChanChu(0); drawXueFu(0); drawGuiXiu(0);
      drawYinSha(0, false); drawShiKui(0); drawJianLing(0); drawXuanGuang(0);
      drawTieHun(0); drawBengYao(0); drawXuanJia(0); drawYingMo(0);
    });
    parts.boss = t(() => {
      drawBossXueMo(0); drawBossBaiGu(0); drawBossLieSha(0);
      drawBossLunHui(0); drawBossZhuLong(0);
    });
    parts.terrain = t(() => {
      for (let i = 0; i < 5; i++) makeFloorTile(1000 + i * 37);
      makeWallTile(5); makeWallTile(9); makeWallTop(3);
      makeDoor(false, true); makeCrack(true); makeChest(false);
    });
    parts.props = t(() => {
      makePedestal(); makeAltar(); makeShopKeeper(); makeLantern();
      makeIncense(); makeHeart(0); makeShieldHeart(0);
      makeCoin(); makeMana(); makeKey(); makeBomb();
    });
    parts.icons = t(() => { buildItemIcons(); });
    parts.total = t(() => { buildSprites(); });
    return parts;
  });

  console.log('① 烘焙耗时拆解（单次，含 JIT 冷启动）');
  for (const [k, v] of Object.entries(bake)) {
    console.log(`     ${k.padEnd(10)} ${v.toFixed(1).padStart(8)} ms`);
  }

  /* ---------- ② 连续重建 N 次的均值 ---------- */
  const repeat = await page.evaluate(() => {
    buildSprites();  // 预热一次
    const N = 8, samples = [];
    for (let i = 0; i < N; i++) {
      const a = performance.now();
      buildSprites();
      samples.push(performance.now() - a);
    }
    samples.sort((x, y) => x - y);
    const sum = samples.reduce((s, v) => s + v, 0);
    return {
      n: N,
      min: samples[0],
      med: samples[Math.floor(N / 2)],
      max: samples[N - 1],
      avg: sum / N,
      all: samples.map(v => +v.toFixed(2))
    };
  });

  console.log('\n② 连续重建（预热后 ' + repeat.n + ' 次）');
  console.log(`     最小 ${repeat.min.toFixed(1)} ms　中位 ${repeat.med.toFixed(1)} ms　` +
    `最大 ${repeat.max.toFixed(1)} ms　均值 ${repeat.avg.toFixed(1)} ms`);
  console.log(`     逐次：${repeat.all.join(' / ')}`);

  /* ---------- ③ 全量素材体积 ---------- */
  const vol = await page.evaluate(() => {
    let n = 0, px = 0;
    const walk = (o) => {
      if (!o) return;
      if (o instanceof HTMLCanvasElement) { n++; px += o.width * o.height; return; }
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (typeof o === 'object' && !(o instanceof HTMLCanvasElement)) {
        for (const k of Object.keys(o)) walk(o[k]);
      }
    };
    walk(SPR);
    return { n, px, mb: +(px * 4 / 1024 / 1024).toFixed(2) };
  });

  console.log('\n③ 素材体积');
  console.log(`     canvas ${vol.n} 张，共 ${vol.px.toLocaleString()} 像素 ≈ ${vol.mb} MB（RGBA 计）`);

  /* ---------- ④ 色板面与硬编码分布 ---------- */
  const palInfo = await page.evaluate(() => ({
    keys: Object.keys(PAL),
    n: Object.keys(PAL).length,
    // PAL 的写前快照，用于后续「同风格重复烘焙是否稳定」的对照
    sample: { ink: PAL.ink, jade: PAL.jade, gold: PAL.gold, floor: PAL.floor }
  }));

  console.log('\n④ 色板面');
  console.log(`     PAL 键数 ${palInfo.n}：${palInfo.keys.join(' ')}`);

  /* ---------- ⑤ 决定性问题：烘焙结果是否确定性 ---------- */
  // 如果同一个绘制函数跑两次得到的位图不同，按风格缓存就不安全。用 mulberry32 播种应当稳定。
  const deterministic = await page.evaluate(() => {
    const a = makeFloorTile(1234), b = makeFloorTile(1234);
    const ga = a.getContext('2d').getImageData(0, 0, a.width, a.height).data;
    const gb = b.getContext('2d').getImageData(0, 0, b.width, b.height).data;
    let same = ga.length === gb.length;
    if (same) for (let i = 0; i < ga.length; i++) if (ga[i] !== gb[i]) { same = false; break; }
    return { same };
  });
  console.log(`\n⑤ 同种子重复绘制结果一致（缓存安全性）：${deterministic.same ? '是 ✅' : '否 ⚠️'}`);

  /* ---------- 结论 ---------- */
  const budget = 16.6;
  console.log('\n──────────────────────────────────────────────────');
  console.log('  结论');
  console.log('──────────────────────────────────────────────────');
  const hotMs = repeat.med;
  console.log(`  · 换一次风格需重建全部素材：约 ${hotMs.toFixed(0)} ms`);
  if (hotMs < budget) {
    console.log(`  · 低于一帧预算(${budget}ms)的 ${(hotMs / budget).toFixed(1)} 倍 —— ` +
      '理论上可实时换，但仍会卡一下，**建议按风格缓存**');
  } else if (hotMs < 120) {
    console.log(`  · 约 ${Math.round(hotMs / budget)} 帧的量(${budget}ms/帧) —— ` +
      '换风格会明显卡顿，**必须按风格缓存**（换回来不能重烤）');
  } else {
    console.log('  · 超过 120ms —— 换风格是秒级卡顿，**必须按风格缓存 + 进度提示**');
  }
  console.log('  · 27 条路径最多出现 3 种风格 → 缓存 3 份即可，内存可控');
  console.log(`  · 单份素材约 ${vol.mb} MB → 3 份约 ${(vol.mb * 3).toFixed(1)} MB`);

  if (errs.length) {
    console.log('\n⚠️ 运行期报错：');
    errs.slice(0, 5).forEach(e => console.log('   ' + e));
  } else {
    console.log('\n  运行期无报错 ✅');
  }
  console.log('');

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
