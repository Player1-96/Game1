'use strict';
/* 角色属性面板（C / Tab）自检：
   面板要真的反映角色数值、要把世界停住、要在三种流派下都说人话，
   并且**不能**和设置面板/暂停状态互相污染。 */
const { chromium } = require('playwright');
const path = require('path');
const BASE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '   ' + extra : '')); } else { fail++; console.log('  FAIL  ' + name + '   ' + (extra || '')); } };

/* ⚠️ 每节开头都把面板强制关掉。
   面板是「按 C 翻转」的，测试里漏关一次，后面每一节的开/关就全部反相 ——
   第一版就是这么假失败的（⑤ 报「设置开着还能开出属性面板」，其实上一节就开着）。 */
const resetSheet = p => p.evaluate(() => { if (window.Game && window.Game.sheetOpen) window.Game.closeSheet(); });

/* 把面板读成「标签 → 数值」的表：csK / csV 在 grid 里是成对出现的 */
const READ_PANEL = () => {
  const out = { secs: [], pairs: {} };
  document.querySelectorAll('#csBody .csSec').forEach(s => out.secs.push(s.querySelector('h3').textContent.trim()));
  document.querySelectorAll('#csBody .csGrid').forEach(grid => {
    const ch = Array.from(grid.children);
    for (let i = 0; i < ch.length; i++) {
      if (ch[i].classList.contains('csK') && ch[i + 1] && ch[i + 1].classList.contains('csV')) {
        out.pairs[ch[i].textContent.trim()] = ch[i + 1].textContent.trim();
      }
    }
  });
  out.text = document.getElementById('csBody').textContent;
  out.display = getComputedStyle(document.getElementById('charSheet')).display;
  /* 特殊效果那一节的「已显示项」与「其余 N 项为 0」的说明，用来查文案自相矛盾 */
  const secEl = Array.from(document.querySelectorAll('#csBody .csSec'))
    .find(s => /特 殊/.test(s.querySelector('h3').textContent));
  if (secEl) {
    out.specShown = Array.from(secEl.querySelectorAll('.csK')).map(k => k.textContent.trim());
    out.specNotes = Array.from(secEl.querySelectorAll('.csNote')).map(k => k.textContent.trim());
  } else { out.specShown = []; out.specNotes = []; }
  return out;
};

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1200, height: 820 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.waitForTimeout(200);

  /* ---- ① 标题页：不该开得出来（那时还没有角色） ---- */
  console.log('=== ① 标题页 ===');
  await p.keyboard.press('c');
  await p.waitForTimeout(150);
  const t0 = await p.evaluate(() => ({ open: window.Game.sheetOpen, disp: getComputedStyle(document.getElementById('charSheet')).display }));
  ok('标题页按 C 不开面板（还没有角色）', t0.open === false && t0.disp === 'none', JSON.stringify(t0));

  /* ---- ② 局内开合 + 世界停住 ---- */
  console.log('=== ② 局内（C / Tab / Esc） ===');
  await p.evaluate(() => { window.Game.newRun('feijian'); window.Game.state = 'play'; });
  await p.waitForTimeout(200);
  await p.keyboard.press('c');
  await p.waitForTimeout(200);
  const t1 = await p.evaluate(READ_PANEL);
  ok('★★ 按 C 打开面板', t1.display === 'flex' && /角 色 属 性/.test(t1.text), t1.display);
  ok('面板分了「身体 / 攻伐 / 特殊 / 流派 / 专属技 / 融合」几块',
    t1.secs.length >= 5, t1.secs.join(' | '));
  ok('凉装时 0 值的特殊效果不占版面（只给一句说明）',
    /尚无可用的特殊效果/.test(t1.text) && !('霜冻' in t1.pairs), Object.keys(t1.pairs).join(','));

  /* 世界停住：面板开着时 tick 不再涨 */
  const f0 = await p.evaluate(() => window.Game.tick);
  await p.waitForTimeout(420);
  const f1 = await p.evaluate(() => window.Game.tick);
  ok('★★ 打开时世界停住（这几秒不会挨打）', f1 === f0, f0 + ' → ' + f1);
  /* 按键也不许喂给游戏 */
  await p.keyboard.down('d');
  await p.waitForTimeout(80);
  const inp = await p.evaluate(() => ({ right: input.right }));
  await p.keyboard.up('d');
  ok('面板开着时按键不喂给游戏（按 D 不会让角色移动）', inp.right === false, JSON.stringify(inp));

  /* 关掉：继续推进，且**不留下**一个「暂停」状态 */
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const t2 = await p.evaluate(() => ({ open: window.Game.sheetOpen, paused: window.Game.paused, tick: window.Game.tick }));
  ok('Esc 关闭，且不会顺手留下「暂停」状态', t2.open === false && t2.paused === false, JSON.stringify(t2));
  await p.waitForTimeout(320);
  const t3 = await p.evaluate(() => window.Game.tick);
  ok('关掉后世界恢复推进', t3 > t2.tick, t2.tick + ' → ' + t3);
  await p.keyboard.press('Tab');
  await p.waitForTimeout(200);
  const t4 = await p.evaluate(() => window.Game.sheetOpen);
  ok('Tab 也能开（与 C 等价）', t4 === true);
  await p.keyboard.press('c');
  await p.waitForTimeout(150);

  /* ---- ③ 数值必须与角色真实数值一致 ---- */
  await resetSheet(p);
  console.log('=== ③ 数值取自角色本身 ===');
  await p.evaluate(() => {
    const G = window.Game;
    G.player.items.length = 0;
    /* 用探针 _probe_stats.js 里验过的那一批：既改核心数值，又挂了融合机制 */
    ['hanbing', 'jindan', 'luanpifeng', 'hunyuan', 'leifu', 'mjolnir', 'yggdrasil_seed',
      'jotun_plate', 'idunn_apple', 'freyr_sword', 'wangfu', 'jianying', 'huiming']
      .forEach(id => G.player.give(id, G));
    G.itemPopup = null;
  });
  await p.keyboard.press('c');
  await p.waitForTimeout(200);
  const t5 = await p.evaluate(READ_PANEL);
  const real = await p.evaluate(() => ({
    dmg: window.Game.player.stats.damage, fire: window.Game.player.stats.fireRate,
    pierce: window.Game.player.stats.pierce, spread: window.Game.player.stats.spread,
    hp: window.Game.player.hp, maxHP: window.Game.player.maxHP,
    base: baseStats().damage
  }));
  ok('★★ 面板里的「伤害」= 角色真实伤害',
    t5.pairs['伤害'] && t5.pairs['伤害'].indexOf(String(Math.round(real.dmg * 100) / 100)) === 0,
    '面板 ' + t5.pairs['伤害'] + '　实际 ' + real.dmg);
  ok('★★ 改过的数值旁边标出「裸装基准」（分得清是法宝给的还是本来就有）',
    /裸 3\.5/.test(t5.pairs['伤害'] || ''), t5.pairs['伤害']);
  ok('气血显示 hp / maxHP 与折合心数',
    t5.pairs['气血'].indexOf(real.hp + ' / ' + real.maxHP) === 0 && /颗心/.test(t5.pairs['气血']),
    t5.pairs['气血']);
  ok('核心攻伐数值一项不漏（8 项都在）',
    ['伤害', '射速/秒', '弹速', '射程', '穿透', '散射', '击退', '暴击率'].every(k => k in t5.pairs),
    Object.keys(t5.pairs).join(','));
  ok('★ 有值之后特殊效果才出现（霜冻 / 斩落这类）', /霜冻/.test(t5.text), '');
  const zeroNote = (t5.specNotes || []).find(x => x.indexOf('其余 ') === 0) || '';
  ok('★「其余 N 项为 0」列的是真没拿到的那几项，不跟上面已显示的重复（防自相矛盾的文案）',
    zeroNote.length > 0 && !t5.specShown.some(l => zeroNote.indexOf(l) >= 0),
    zeroNote.slice(0, 70) + '　已显示：' + t5.specShown.join('、'));
  ok('机制键列出来了（法宝带的字面机制）', /wildArc|boom/.test(t5.text), '');
  ok('融合产物列出名字与阶位', /乱披风|往复梭/.test(t5.text), '');

  /* ---- ④ 三种流派各说各的话 ---- */
  await resetSheet(p);
  console.log('=== ④ 流派差异 ===');
  const perStyle = {};
  for (const st of ['jujian', 'wujian', 'feijian']) {
    await resetSheet(p);
    await p.evaluate(s => {
      const G = window.Game;
      G.newRun(s); G.state = 'play';
      if (s === 'jujian') { G.player.chargeT = 25; G.player.charging = true; }
      if (s === 'wujian') { G.player.wjStage = 1; G.player.wjChainT = 40; }
    }, st);
    await p.keyboard.press('c');
    await p.waitForTimeout(160);
    perStyle[st] = await p.evaluate(READ_PANEL);
    await p.keyboard.press('c');
    await p.waitForTimeout(120);
  }
  ok('巨剑流显示蓄力与段位', /蓄力/.test(perStyle.jujian.text) && /段/.test(perStyle.jujian.text),
    perStyle.jujian.pairs['当前段位'] || (perStyle.jujian.text.match(/蓄力[^\n]{0,20}/) || [''])[0]);
  ok('舞剑流显示连段与窗口', /连段/.test(perStyle.wujian.text) && /窗口/.test(perStyle.wujian.text),
    perStyle.wujian.pairs['连段']);
  ok('飞剑流显示每轮剑数（1 + 散射）', /每轮剑数/.test(perStyle.feijian.text), perStyle.feijian.pairs['每轮剑数']);
  ok('专属技未获得时给的是人话，不是空白', /尚未获得/.test(perStyle.feijian.text), '');

  /* ---- ⑤ 不和设置面板 / 暂停 互相污染 ---- */
  await resetSheet(p);
  console.log('=== ⑤ 不与其它面板打架 ===');
  const t6 = await p.evaluate(() => {
    const G = window.Game;
    G.openSettings();
    return { sheetBefore: G.sheetOpen, settings: G.settingsOpen };
  });
  await p.keyboard.press('c');
  await p.waitForTimeout(150);
  const t7 = await p.evaluate(() => ({ sheet: window.Game.sheetOpen, settings: window.Game.settingsOpen }));
  ok('设置面板开着时按 C 不会叠出属性面板',
    t6.sheetBefore === false && t6.settings === true && t7.sheet === false && t7.settings === true,
    JSON.stringify(t6) + ' → ' + JSON.stringify(t7));
  await p.evaluate(() => window.Game.closeSettings());
  await p.waitForTimeout(120);
  /* 暂停 + 属性面板：关掉属性面板后应仍是暂停（各管各的） */
  await resetSheet(p);
  await p.evaluate(() => { window.Game.togglePause(); });
  await p.waitForTimeout(120);
  await p.keyboard.press('c');
  await p.waitForTimeout(150);
  await p.keyboard.press('c');
  await p.waitForTimeout(150);
  const t8 = await p.evaluate(() => ({ sheet: window.Game.sheetOpen, paused: window.Game.paused }));
  ok('原本就暂停时，开关属性面板不会把暂停弄丢', t8.sheet === false && t8.paused === true, JSON.stringify(t8));
  await p.evaluate(() => { window.Game.togglePause(); });

  ok('全程无 pageerror', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL', (e && e.stack) || e); process.exit(1); });
