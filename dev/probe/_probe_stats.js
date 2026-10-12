'use strict';
/* 「角色属性面板」要显示什么？—— 先把玩家身上真实存在的字段问全，再写面板。
   （免得面板里写了一个字段名，实际叫别的，显示成 undefined。） */
const { chromium } = require('playwright');
const path = require('path');
const BASE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(BASE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });
  const r = await p.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    G.stylePath = ['cn', 'nordic', 'nordic']; G.seg = 1; G.applySegmentPalette();
    G.newFloor(10, null, { boss: 'jormungandr' });
    G.state = 'play';
    const pl = G.player;
    /* 装一批有代表性的：数值型 + 功能型 + 融合产物 + 北欧 */
    ['hanbing', 'jindan', 'luanpifeng', 'hunyuan', 'leifu', 'mjolnir', 'yggdrasil_seed',
      'jotun_plate', 'idunn_apple', 'freyr_sword', 'wangfu', 'jianying', 'huiming']
      .forEach(id => { try { pl.give(id, G); } catch (e) { console.log('give fail ' + id + ': ' + e.message); } });
    pl.mp = 40;
    const base = baseStats();
    const statKeys = Object.keys(pl.stats).sort();
    const diff = {};
    statKeys.forEach(k => {
      const b0 = base[k];
      const v = pl.stats[k];
      if (JSON.stringify(b0) !== JSON.stringify(v)) diff[k] = { base: b0, now: v };
    });
    const playerOwn = {};
    Object.keys(pl).forEach(k => {
      const v = pl[k];
      if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') playerOwn[k] = v;
    });
    return {
      statsAll: JSON.parse(JSON.stringify(pl.stats)),
      statKeys: statKeys,
      changed: diff,
      fusKeys: Object.keys(pl.stats.fus || {}),
      playerOwn: playerOwn,
      ult: pl.ult,
      fusionMem: pl.fusionMem,
      items: pl.items.slice(),
      slots: pl.slots, slotIdx: pl.slotIdx, skillCd: pl.skillCd,
      shieldCap: pl.shieldCap, shieldGap: pl.shieldGap, maxMP: pl.maxMP,
      style: G.style, depth: G.depth, seg: G.seg, stylePath: G.stylePath
    };
  });
  console.log('== stats 全键 ==');
  console.log(r.statKeys.join(', '));
  console.log('\n== 与裸装的差异 ==');
  console.log(JSON.stringify(r.changed, null, 1));
  console.log('\n== stats.fus ==');
  console.log(JSON.stringify(r.statsAll.fus));
  console.log('\n== 玩家自有数值字段 ==');
  console.log(JSON.stringify(r.playerOwn, null, 1));
  console.log('\n== ult / 融合 / 槽位 ==');
  console.log(JSON.stringify({ ult: r.ult, fusionMem: r.fusionMem, slots: r.slots, slotIdx: r.slotIdx, skillCd: r.skillCd }, null, 1));
  console.log('\n== 装备 ==');
  console.log(r.items.join(','));
  await b.close();
  process.exit(0);
})().catch(e => { console.log('FATAL', (e && e.stack) || e); process.exit(1); });
