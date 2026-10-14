'use strict';
/* 「清空身上法宝」到底要复位哪些东西？—— 先量一遍残留，再写按钮。
   `recomputeStats()` 只重建 stats（+shieldCap 那几个），
   但法宝还会**直接写 Player 的字段**（加血上限、加灵力上限…）——
   只把 items 清空是清不干净的。 */
const { chromium } = require('playwright');
const path = require('path');
const BASE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(BASE + '?dev=1');
  await p.waitForFunction(() => window.Game && window.Game.state === 'title' && window.Lab, null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const r = await p.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');

    /* ① 裸装快照（同一个 Player 对象，先量一遍底） */
    const snap = () => {
      const o = {};
      Object.keys(G.player).forEach(k => {
        const v = G.player[k];
        if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') o[k] = v;
      });
      o.__stats = JSON.parse(JSON.stringify(G.player.stats));
      return o;
    };
    G.player.items.length = 0;
    G.player.recomputeStats(G.style);
    const naked = snap();

    /* ② 装一批会写 Player 字段的：加血上限 / 加灵力上限 / 护盾上限 / 道具池里那几件 */
    const ids = ['yggdrasil_seed', 'yggdrasil_seed', 'jotun_plate', 'idunn_apple', 'taixu',
      'hanbing', 'jindan', 'hunyuan', 'mjolnir', 'freyr_sword', 'wangfu', 'lianqi'];
    const given = [];
    ids.forEach(id => {
      if (!ITEM_MAP[id]) return;
      try { G.player.give(id, G); given.push(id); } catch (e) { given.push(id + '!ERR'); }
    });
    G.itemPopup = null;
    const loaded = snap();

    /* ③ 按「清空法宝」按钮的真身复位（走调试台那个函数，不另写一份） */
    window.Lab.resetLoadout();
    const stripped = snap();

    /* ④ 比对：哪些字段没回到裸装 */
    const leak = [];
    Object.keys(naked).forEach(k => {
      if (k === '__stats') return;
      if (JSON.stringify(stripped[k]) !== JSON.stringify(naked[k])) {
        leak.push({ k, naked: naked[k], loaded: loaded[k], after: stripped[k] });
      }
    });
    const statLeak = [];
    Object.keys(naked.__stats).forEach(k => {
      if (JSON.stringify(stripped.__stats[k]) !== JSON.stringify(naked.__stats[k])) {
        statLeak.push({ k, naked: naked.__stats[k], after: stripped.__stats[k] });
      }
    });
    return { given, leak, statLeak, nakedHP: naked.maxHP, afterHP: stripped.maxHP, nakedMP: naked.maxMP, afterMP: stripped.maxMP };
  });

  console.log('装过：' + r.given.join(','));
  console.log('裸装 maxHP/maxMP：' + r.nakedHP + ' / ' + r.nakedMP + '　清空后：' + r.afterHP + ' / ' + r.afterMP);
  console.log('\n== Player 上没复位的字段 ==');
  r.leak.forEach(x => console.log('  ' + x.k + '：裸 ' + JSON.stringify(x.naked) + ' → 装后 ' + JSON.stringify(x.loaded) + ' → 清空后 ' + JSON.stringify(x.after)));
  console.log('\n== stats 里没复位的键 ==');
  r.statLeak.forEach(x => console.log('  ' + x.k + '：裸 ' + JSON.stringify(x.naked) + ' → 清空后 ' + JSON.stringify(x.after)));
  await b.close();
  process.exit(0);
})().catch(e => { console.log('FATAL', (e && e.stack) || e); process.exit(1); });
