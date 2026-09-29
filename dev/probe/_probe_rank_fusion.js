'use strict';
/* 探针：法宝的「等级」这条轴到底值多少？融合认不认它？
   背景 —— 用户问「未合成的技能有等级、合成之后的没等级」，导致
   ① 高级的低阶法宝没用 ② 低阶和高阶同时存在、能力集中且同质化。
   这里把两件事量成数字，别靠印象。 */
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(FILE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const r = await p.evaluate(() => {
    const G = window.Game;
    const out = {};

    /* ① 叠同一件低阶法宝，逐重看属性 —— 有没有递减 / 封顶？ */
    G.newRun('feijian');
    const pl = G.player;
    const snap = () => ({ damage: +pl.stats.damage.toFixed(2), pierce: pl.stats.pierce,
                          spread: pl.stats.spread, speed: +pl.stats.speed.toFixed(2) });
    out['青锋剑(伤害+1)_逐重'] = [snap()];
    for (let i = 0; i < 4; i++) { pl.give('qingfeng', G); out['青锋剑(伤害+1)_逐重'].push(snap()); }
    /* ⚠️ 每一列都要**重开一局** —— 否则第二列会带着第一列的属性，数字全串味 */
    G.newRun('feijian');
    const pl2 = G.player;
    const snap2 = () => ({ damage: +pl2.stats.damage.toFixed(2), pierce: pl2.stats.pierce });
    out['穿云梭(穿透+2)_逐重'] = [snap2()];
    for (let i = 0; i < 3; i++) { pl2.give('chuanyun', G); out['穿云梭(穿透+2)_逐重'].push(snap2()); }

    /* ② 融合认不认材料的等级？材料 1 件 vs 3 件，产物与结果是否一样 */
    const fuse = (reps) => {
      G.newRun('feijian');
      const q = G.player;
      for (let i = 0; i < reps; i++) q.give('qingfeng', G);
      q.give('leifu', G);
      const before = { items: q.items.slice(), damage: +q.stats.damage.toFixed(2) };
      const res = fusionExecute(G, 'qingfeng', 'leifu');
      return { 材料件数: reps, ok: res.ok, 产物: res.out,
               融合前: before, 融合后: { items: q.items.slice(), damage: +q.stats.damage.toFixed(2) } };
    };
    out['融合_材料1件'] = fuse(1);
    out['融合_材料3件'] = fuse(3);
    const rec = FUSION_DEF.filter(x => x.id === 'leiji')[0];
    out['配方需求量'] = { need_a: fusionNeed(rec, 'qingfeng'), need_b: fusionNeed(rec, 'leifu') };

    /* ③ 产物本身有没有 func / up[]（能否成长） —— 对比一件普通功能型法宝 */
    out['条目成长字段'] = ['hunyuan', 'leiji', 'twin_blade', 'thor_plate'].map(id => {
      const d = ITEM_MAP[id];
      return { id: id, 名字: d.name, func: !!d.func, up条数: d.up ? d.up.length : 0, fusion: !!d.fusion };
    });

    /* ④ 产物会不会意外从掉落池里冒出来（应恒为 0） */
    let hit = 0;
    for (let i = 0; i < 3000; i++) { const id = G.rollFabao(); if (ITEM_MAP[id] && ITEM_MAP[id].fusion) hit++; }
    out['抽3000次掉出产物'] = hit;

    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
