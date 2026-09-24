'use strict';
/* ============================================================
 *  _shot_fusion.js —— 法宝融合（第 3 期）截图验收
 *
 *  为什么必须出图：这一期的核心是**「？？？→ 揭示」的信息梯度**，
 *  那是纯粹的「看起来对不对」，断言只能验「codex.has() 返回什么」，
 *  验不了「玩家眼里是不是真的一无所知 / 是不是真的揭示了」。
 *
 *  出 6 张：
 *   ① 融合阵（房间里的阵图本体）
 *   ② 面板 · 刚打开（全都可选）
 *   ③ 面板 · 选了一件（只亮「有缘分的」）
 *   ④ 面板 · 两件齐了但未解锁 → ？？？
 *   ⑤ 面板 · 已解锁 → 真名 + 效果
 *   ⑥ HUD 共鸣光晕（法宝图标行上「这一对能融」的提示）
 * ============================================================ */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(250);

  const shot = async (name, note) => {
    await page.waitForTimeout(160);
    await page.screenshot({ path: path.join(OUT, name) });
    console.log('  ✓ ' + name + (note ? '   ' + note : ''));
  };

  console.log('══════════════════════════════════════════════════');
  console.log('  法宝融合 · 截图验收');
  console.log('══════════════════════════════════════════════════\n');

  /* ---------- ① 融合阵本体 ---------- */
  console.log('① 房间里的融合阵');
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    /* 直接把一座阵摆到房间中央 —— 走地图找它太随机 */
    G.props.push(new Prop('forge', 240, 180, {}));
    G.player.x = 240; G.player.y = 210;
    updateOverlay();
    G.draw();
  });
  await shot('_preview_fusion_forge.png', '地面法阵 + 金芯');

  /* ---------- ② 面板 · 刚打开 ---------- */
  console.log('\n② 面板 · 刚打开（全都可选）');
  await page.evaluate(() => {
    const G = window.Game;
    FusionCodex.reset();
    G.newRun('feijian');
    const p = G.player;
    p.items.length = 0; p.recomputeStats('feijian');
    ['qingfeng', 'leifu', 'hanbing', 'chiyan', 'hunyuan', 'fenying', 'jingang']
      .forEach(id => p.give(id, G));
    G.itemPopup = null;
    G.state = 'play';
    G.openFusion(null);
    G.draw();
  });
  await shot('_preview_fusion_empty.png', '未选料 · 全部可选');

  /* ---------- ③ 面板 · 选中枢纽（一对多） ---------- */
  console.log('\n③ 面板 · 选中枢纽「引雷符」（三条路同时亮起）');
  await page.evaluate(() => {
    const G = window.Game;
    const i = G.fusion.pool.indexOf('leifu');    // 引雷符：通 青锋剑 / 玄冰符 / 赤焰符
    G.fusion.idx = i; G.fusionTake();
    G.draw();
  });
  await shot('_preview_fusion_one.png', '引雷符 → 三条路可选（枢纽）');

  /* ---------- ④ 两件齐了但未解锁 → ？？？ ---------- */
  console.log('\n④ 两件齐了但未解锁 → ？？？');
  await page.evaluate(() => {
    const G = window.Game;
    const i = G.fusion.pool.indexOf('chiyan');
    G.fusion.idx = i; G.fusionTake();
    G.draw();
  });
  await shot('_preview_fusion_unknown.png', '产物名与数值全藏');

  /* ---------- ⑤ 已解锁 → 真名 + 效果 ---------- */
  console.log('\n⑤ 已解锁 → 真名 + 效果');
  await page.evaluate(() => {
    const G = window.Game;
    FusionCodex.unlock('leiji');
    updateOverlay();
    G.draw();
  });
  await shot('_preview_fusion_known.png', '解锁后完整显示');

  /* ---------- ⑥ HUD 共鸣光晕 ---------- */
  console.log('\n⑥ HUD 共鸣光晕（发现是白送的）');
  await page.evaluate(() => {
    const G = window.Game;
    G.fusion = null; G.state = 'play';
    const p = G.player;
    p.items.length = 0; p.recomputeStats('feijian');
    ['qingfeng', 'leifu', 'jingang', 'xuantie'].forEach(id => p.give(id, G));
    G.itemPopup = null;
    G.tick = 12;                    // 停在光晕最亮的那一帧
    updateOverlay(); G.draw();
  });
  await shot('_preview_fusion_resonance.png', '可融的一对浮起光晕');

  console.log('\n  运行期无报错 ' + (errs.length ? '❌ ' + errs.slice(0, 2).join(' | ') : '✅'));
  console.log('\n截图输出目录：' + OUT + '\n');

  await browser.close();
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
