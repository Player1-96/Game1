'use strict';
/* 跨世界融合配方的示意图：中式法宝 + 北欧神器 → 混血产物 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 800, height: 700 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(FILE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });
  const data = await p.evaluate(() => {
    const w = d => d.world || 'cn';
    const NEW = ['thor_plate', 'wolf_spear', 'wisdom_ring', 'world_shade',
                 'cross_thunder', 'twin_blade', 'aegis_wall', 'endless_wealth', 'frost_seed'];
    return NEW.map(id => {
      const rec = FUSION_DEF.filter(r => r.id === id)[0];
      const A = ITEM_MAP[rec.a], B = ITEM_MAP[rec.b], O = ITEM_MAP[rec.id];
      return { name: O.name, desc: O.desc, a: A.name, aW: w(A), b: B.name, bW: w(B),
               kind: w(A) + '-' + w(B) };
    });
  });
  fs.writeFileSync(path.join(OUT, '_preview_crossfusion.json'), JSON.stringify(data, null, 1));
  console.log('saved json, ' + data.length + ' 条');
  await b.close();
})();
