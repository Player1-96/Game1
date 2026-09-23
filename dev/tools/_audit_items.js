/* ============================================================
 *  _audit_items.js —— 盘点全部法宝：收益落在哪
 *
 *  一件法宝的价值要么落在**数值**（持续改 stats），要么落在**机制**
 *  （byStyle 分流派 / func 进阶 / 设置新的状态字段）。
 *  两样都不沾的，就是「只做一次性的事」—— 像改造前的太虚护盾那样，
 *  给完那一刻起这件法宝就不存在了。
 *
 *  用运行时快照而不是读源码：apply 里真正改了什么，跑一遍最准。
 *  **加新法宝后跑一次**，对照 E / D 两栏自查（两栏都空才是常态）。
 *
 *  跑法（在仓库根目录）：node dev/tools/_audit_items.js
 * ============================================================ */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const pad = (s, n) => {                     // 中文按两个宽度算，否则列对不齐
  s = String(s);
  let w = 0;
  for (const ch of s) w += /[\u4e00-\u9fa5]/.test(ch) ? 2 : 1;
  return s + ' '.repeat(Math.max(0, n - w));
};

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const rows = await page.evaluate(() => {
    const out = [];
    const G = window.Game;
    for (const def of ITEM_DEFS) {
      if (def.type !== 'fabao') continue;
      G.newRun('feijian');
      G.state = 'play';
      const p = G.player;
      p.items.length = 0;
      const baseStats = Object.assign({}, p.stats);
      const baseKeys = new Set(Object.keys(p));
      const pre = {
        shield: p.shield, tShield: p.tShield, maxHP: p.maxHP, hp: p.hp,
        mp: p.mp, maxMP: p.maxMP, coins: G.coins, keys: G.keys, bombs: G.bombs
      };
      p.give(def.id, G);
      const statKeys = [];
      for (const k of Object.keys(p.stats)) if (p.stats[k] !== baseStats[k]) statKeys.push(k);
      const resKeys = [];
      if (p.shield !== pre.shield) resKeys.push('shield');
      if (p.tShield !== pre.tShield) resKeys.push('tShield');
      if (p.maxHP !== pre.maxHP) resKeys.push('maxHP');
      if (p.hp !== pre.hp) resKeys.push('hp');
      if (p.mp !== pre.mp) resKeys.push('mp');
      if (p.maxMP !== pre.maxMP) resKeys.push('maxMP');
      if (G.coins !== pre.coins) resKeys.push('coins');
      if (G.keys !== pre.keys) resKeys.push('keys');
      if (G.bombs !== pre.bombs) resKeys.push('bombs');
      // give 自己会 push items / itemPopup / floaters，这些不算「机制」
      const skip = new Set(['items', 'itemPopup', 'floaters', 'stats']);
      const newKeys = Object.keys(p).filter(k => !baseKeys.has(k) && !skip.has(k));
      // 跨流派是否同一份文案
      const byStyleKeys = def.byStyle ? Object.keys(def.byStyle) : [];
      out.push({
        id: def.id, name: def.name, rare: !!def.rare,
        byStyle: byStyleKeys.length, byStyleN: byStyleKeys.length,
        func: !!def.func, up: def.up ? def.up.length : 0,
        statKeys, resKeys, newKeys,
        desc: def.desc
      });
    }
    return out;
  });

  const INVISIBLE = ['luck', 'greed'];      // 只在掉落结算时生效
  const kind = r => {
    if (r.newKeys.length || r.func || r.byStyle) return 'MECH';
    const givesShield = r.resKeys.includes('shield') || r.resKeys.includes('tShield');
    if (r.statKeys.length) {
      // 数值 + 一次性资源：护盾会被打光且不会长回来，所以那部分等于「用完就没」
      if (givesShield) return 'MIXED';
      return r.statKeys.every(k => INVISIBLE.includes(k)) ? 'SOFT' : 'NUM';
    }
    if (givesShield) return 'ONESHOT';
    return 'DEAD';
  };

  const groups = { MECH: [], NUM: [], SOFT: [], MIXED: [], ONESHOT: [], DEAD: [] };
  rows.forEach(r => groups[kind(r)].push(r));

  const line = r => {
    const tags = [];
    if (r.byStyle) tags.push('byStyle×' + r.byStyleN);
    if (r.func) tags.push('func/up' + r.up);
    if (r.newKeys.length) tags.push('新字段[' + r.newKeys.join(',') + ']');
    if (r.statKeys.length) tags.push('数值[' + r.statKeys.join(',') + ']');
    if (r.resKeys.length) tags.push('资源[' + r.resKeys.join(',') + ']');
    return '  ' + pad(r.id, 10) + pad(r.name, 16) + (r.rare ? '◆ ' : '  ') + tags.join('　');
  };

  console.log('共 ' + rows.length + ' 件法宝（◆ = 珍稀）\n');

  console.log('════ A. 带机制（分流派 / 进阶 / 新增状态）—— ' + groups.MECH.length + ' 件 ════');
  groups.MECH.forEach(r => console.log(line(r)));

  console.log('\n════ B. 纯数值（持续生效，战中可感）—— ' + groups.NUM.length + ' 件 ════');
  groups.NUM.forEach(r => console.log(line(r)));

  console.log('\n════ C. 数值隐形（只在掉落结算时生效）—— ' + groups.SOFT.length + ' 件 ════');
  groups.SOFT.forEach(r => console.log(line(r) + '\n      ' + r.desc));

  console.log('\n════ D. 数值 + 一次性资源（护盾打光就不长回来）—— ' + groups.MIXED.length + ' 件 ════');
  groups.MIXED.forEach(r => console.log(line(r) + '\n      ' + r.desc));

  console.log('\n════ E. 纯一次性资源 —— ' + groups.ONESHOT.length + ' 件 ════');
  if (!groups.ONESHOT.length) console.log('  （无）');
  groups.ONESHOT.forEach(r => console.log(line(r) + '\n      ' + r.desc));

  console.log('\n════ F. 什么都不加 —— ' + groups.DEAD.length + ' 件 ════');
  if (!groups.DEAD.length) console.log('  （无）');
  groups.DEAD.forEach(r => console.log(line(r) + '\n      ' + r.desc));

  console.log('\n统计：机制 ' + groups.MECH.length + ' / 数值 ' + groups.NUM.length
    + ' / 隐形数值 ' + groups.SOFT.length + ' / 数值+一次性 ' + groups.MIXED.length
    + ' / 纯一次性 ' + groups.ONESHOT.length + ' / 空 ' + groups.DEAD.length);

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 2000))]);
  process.exit(0);
})();
