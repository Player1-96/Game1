'use strict';
/* 「每样装一件」到底能装上多少件？—— 探针先问清楚，再写断言。
   （`give()` 对不同 type 的处理不一样：丹药是当场生效、不进背包。） */
const { chromium } = require('playwright');
const path = require('path');
const BASE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(BASE + '?lab=1');
  await p.waitForFunction(() => window.Game && window.Game.state === 'title' && window.Lab, null, { timeout: 15000 });
  await p.evaluate(() => { window.Game.newRun('feijian'); window.Game.state = 'play'; });
  await p.click('[data-a="itemall"]');
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const G = window.Game;
    const byType = {};
    ITEM_DEFS.forEach(d => { byType[d.type] = (byType[d.type] || 0) + 1; });
    const have = {};
    G.player.items.forEach(i => { have[i] = (have[i] || 0) + 1; });
    const missing = ITEM_DEFS.filter(d => !have[d.id]).map(d => d.type + ':' + d.id);
    return {
      defTotal: ITEM_DEFS.length, byType: byType,
      items: G.player.items.length, missing: missing,
      hp: G.player.hp, maxHP: G.player.maxHP, state: G.state,
      stats: { dmg: +G.player.stats.damage.toFixed(1), fire: +G.player.stats.fireRate.toFixed(2), pierce: G.player.stats.pierce }
    };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
  process.exit(0);
})().catch(e => { console.log('FATAL', (e && e.stack) || e); process.exit(1); });
