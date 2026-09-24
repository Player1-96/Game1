'use strict';
/* ============================================================
 *  _probe_fusion_cls.js —— 融合面板「谁亮谁灰」的类名探针
 *
 *  为什么需要它：截图能看出「大致样子」，但看不出某个格子到底是 can 还是 no
 *  （两档都偏暗，肉眼容易看错）。这里直接把 #fusion .fusItem 的 className 打出来。
 *  ⚠️ 「可融性必须永远可见」是这一期的硬边界，所以它值得一条专门的探针。
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
    const G = window.Game;
    const out = {};
    const setup = () => {
      G.newRun('feijian');
      const pl = G.player;
      pl.items.length = 0; pl.recomputeStats('feijian');
      ['qingfeng', 'leifu', 'hanbing', 'chiyan', 'hunyuan', 'fenying', 'jingang']
        .forEach(id => pl.give(id, G));
      G.itemPopup = null;
      G.state = 'play';
      G.openFusion(null);
    };
    const dump = () => [...document.querySelectorAll('#fusion .fusItem')].map(el => ({
      t: el.textContent.trim(),
      k: el.className.indexOf('on') >= 0 ? 'on' : (el.className.indexOf('can') >= 0 ? 'can' : 'no')
    }));

    setup();
    out.pool = G.fusion.pool.slice();
    out.noneSelected = dump();

    const take = id => { G.fusion.idx = G.fusion.pool.indexOf(id); G.fusionTake(); };
    take('qingfeng');
    out.afterQingfeng = { slots: G.fusion.slots.slice(), items: dump() };

    take('leifu');
    out.afterBoth = {
      slots: G.fusion.slots.slice(), items: dump(),
      recipe: G.fusionCurrent() ? G.fusionCurrent().id : null,
      productText: (document.querySelector('#fusion .fusProd') || {}).textContent
    };

    return out;
  });

  const fmt = rows => rows.map(x => '[' + x.k + '] ' + x.t).join('   ');
  console.log('可融池：' + r.pool.join(', '));
  console.log('\n未选料  ：' + fmt(r.noneSelected));
  console.log('选青锋剑：' + fmt(r.afterQingfeng.items));
  console.log('  已选槽：' + JSON.stringify(r.afterQingfeng.slots));
  console.log('两件齐  ：' + fmt(r.afterBoth.items));
  console.log('  已选槽：' + JSON.stringify(r.afterBoth.slots) + '　配方=' + r.afterBoth.recipe);
  console.log('  产物格：' + (r.afterBoth.productText || '').trim());

  const q = r.afterQingfeng.items;
  const wrong = q.filter(x => x.k === 'can' && x.t.indexOf('引雷符') < 0);
  console.log('\n结论：选中青锋剑后，只有「引雷符」该亮为 can。'
    + (wrong.length ? '\n  ❌ 不该亮的：' + wrong.map(x => x.t).join(',') : '\n  ✅ 正确'));
  await browser.close();
  process.exit(wrong.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
