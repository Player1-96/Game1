'use strict';
/* 出图：角色属性面板（C / Tab）。
   验收 UI 不能只看断言 —— 面板信息密度很高，挤不挤、哪一行读不出来，只有看图才知道。
   产物：dev/preview/_preview_sheet_feijian.png / _preview_sheet_jujian.png */
const { chromium } = require('playwright');
const path = require('path');
const BASE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = n => path.resolve(__dirname, '..', 'preview', '_preview_sheet_' + n + '.png');

const SETUP = (style, items) => {
  const G = window.Game;
  G.newRun(style);
  G.stylePath = ['cn', 'nordic', 'nordic']; G.seg = 1; G.applySegmentPalette();
  G.newFloor(10, null, { boss: 'jormungandr' });
  G.state = 'play';
  const pl = G.player;
  pl.items.length = 0;
  items.forEach(id => pl.give(id, G));
  pl.shield = 3; pl.mp = 62;
  pl.ult = { style: style, paths: { lv1: 2 } };
  pl.ultCd = 300;
  if (style === 'jujian') { pl.chargeT = 26; pl.charging = true; pl.chargeCdMax = 20; }
  if (style === 'wujian') { pl.wjStage = 1; pl.wjChainT = 42; }
  G.itemPopup = null;
};

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1200, height: 1080 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(BASE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.waitForTimeout(300);

  const CASES = [
    ['feijian', ['hanbing', 'jindan', 'luanpifeng', 'hunyuan', 'leifu', 'mjolnir',
      'yggdrasil_seed', 'jotun_plate', 'idunn_apple', 'freyr_sword', 'wangfu', 'jianying', 'huiming']],
    ['jujian', ['xuantie', 'qiankun', 'jindan', 'yujian', 'yuyi', 'leifu', 'hunyuan', 'dongming']]
  ];
  for (const [style, items] of CASES) {
    await p.evaluate(`(${SETUP.toString()})(${JSON.stringify(style)}, ${JSON.stringify(items)})`);
    await p.waitForTimeout(200);
    await p.keyboard.press('c');
    await p.waitForTimeout(500);
    await p.screenshot({ path: OUT(style), fullPage: false });
    console.log('已出图 → ' + OUT(style));
    await p.keyboard.press('Escape');
    await p.waitForTimeout(200);
  }
  await Promise.race([b.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})().catch(e => { console.log('FATAL', (e && e.stack) || e); process.exit(1); });
