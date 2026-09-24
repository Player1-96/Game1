'use strict';
/* ============================================================
 *  _probe_dup_audit.js —— 北欧内容 vs 中式内容：换皮 / 描述不符 全量体检
 *
 *  背景：北欧那批是照着中式「镜像」做出来的，已经发现两件是换皮
 *  （弗雷之剑=混元珠、冈格尼尔=穿透+2 加大号），且冈格尼尔的描述在撒谎。
 *  这个探针把**全部**北欧条目与中式条目做一次机械对照，输出：
 *    ① 每件道具的「效果签名」= 跑一遍 apply 之后 stats / hp / 护盾 的增量
 *    ② 签名撞车表（北欧某件与中式某件的效果字段高度重叠 → 换皮嫌疑）
 *    ③ 描述里出现比较级（越…越… / 递增 / 每次 / 叠加 / 按 N）的条目
 *       —— 这类描述必须人工核对，因为自动化测不出「语义真伪」
 *
 *  用法：node dev/probe/_probe_dup_audit.js
 * ============================================================ */
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
    /* 效果签名：跑一遍 apply，把所有可能被改到的量都 diff 出来 */
    const SIG_KEYS = ['maxHP', 'hp', 'shield', 'tShield', 'mp', 'maxMP', 'invuln'];
    const sign = (def, rank) => {
      const q = new Player(0, 0);
      const s0 = JSON.parse(JSON.stringify(q.stats));
      const v0 = {};
      for (const k of SIG_KEYS) v0[k] = q[k];
      try { def.apply(q, rank === undefined ? 0 : rank, 'feijian'); }
      catch (e) { return { err: String(e.message).slice(0, 40) }; }
      const out = {};
      for (const k of Object.keys(q.stats)) {
        const a = s0[k], c = q.stats[k];
        if (typeof c === 'number' && typeof a === 'number') {
          if (c !== a) out['stats.' + k] = +(c - a).toFixed(4);
        } else if (typeof c === 'boolean' && c !== a) {
          // ⚠️ 布尔型开关也要抓：只 diff 数字的话，layerHeal / fly 这类
          // 「有/无」型效果会被漏掉，看起来就像两件道具完全一样。
          out['stats.' + k] = true;
        }
      }
      /* fus 是对象（融合机制），单独列键名 */
      const fus = q.stats.fus || {};
      for (const k of Object.keys(fus)) if (fus[k] && !(s0.fus && s0.fus[k])) out['fus.' + k] = true;
      for (const k of SIG_KEYS) if (q[k] !== v0[k]) out[k] = +(q[k] - v0[k]).toFixed(2);
      /* 只有形状没有数值的（如解冻、免疫）也要记一笔 */
      if (!Object.keys(out).length) out['(无数值)'] = true;
      return out;
    };
    const rows = ITEM_DEFS
      .filter(d => d.type === 'fabao' || d.type === 'dan')
      .map(d => ({ id: d.id, name: d.name, world: d.world || 'cn', type: d.type,
                   func: !!d.func, desc: d.desc, sig: sign(d), up: (d.up || []).slice() }));

    /* 撞车检测：两件道具的签名键集合相同（数值可以不同）→ 同一种效果，只是大小不同 */
    const keysOf = s => Object.keys(s).filter(k => k !== '(无数值)').sort().join(',');
    const dups = [];
    const cn = rows.filter(x => x.world === 'cn' && !x.sig.err);
    for (const n of rows.filter(x => x.world === 'nordic' && !x.sig.err)) {
      for (const c of cn) {
        const kn = keysOf(n.sig), kc = keysOf(c.sig);
        if (!kn || kn !== kc) continue;
        /* 键相同 = 同一类效果；再看数值是否也只差一点（差得越多越像「加大号」） */
        const shared = Object.keys(n.sig).filter(k => k !== '(无数值)');
        const same = shared.every(k => Math.abs(n.sig[k] - c.sig[k]) < 1e-6);
        dups.push({ nordic: n.name, cn: c.name, keys: kc, 完全相同: same,
                    nVal: JSON.stringify(n.sig), cVal: JSON.stringify(c.sig) });
      }
    }

    /* 描述里含「比较级 / 累计」措辞的条目：这些描述必须人工核对真伪 */
    const CMP = /越.*越|递增|每次|叠加|累计|按.*计算|随之|每多|逐|再涨|翻倍/;
    const claims = rows.filter(x => CMP.test(x.desc) || (x.up || []).some(u => CMP.test(u)))
      .map(x => ({ id: x.id, name: x.name, world: x.world, desc: x.desc, up: x.up }));

    /* 权能（北欧 5 门）与中式功法的效果类型对照 */
    const skillSig = id => {
      const d = SKILL_DEF[id];
      const src = d.cast.toString();
      const tags = [];
      if (/\.hurt\(/.test(src)) tags.push('伤害');
      if (/\.frost\s*=/.test(src)) tags.push('冰封');
      if (/\.burn\s*=/.test(src)) tags.push('灼烧');
      if (/invuln/.test(src)) tags.push('无敌');
      if (/addShield|tShield/.test(src)) tags.push('护盾');
      if (/\.pin\s*=/.test(src)) tags.push('钉住');
      if (/heal\(|\.hp\s*\+=/.test(src)) tags.push('回复');
      if (/bullets\.push|new Bullet/.test(src)) tags.push('弹幕');
      if (/spdMul|speed/.test(src)) tags.push('移速');
      if (/zaps\.push|chainLightning/.test(src)) tags.push('雷击');
      if (/burn\s*=|Floater/.test(src)) tags.push('文本');
      return tags;
    };
    const skills = Object.keys(SKILL_DEF).map(id => ({
      id: id, name: SKILL_DEF[id].name, world: SKILL_DEF[id].world || 'cn',
      cost: SKILL_DEF[id].cost, tags: skillSig(id), desc: SKILL_DEF[id].desc(1)
    }));
    return { rows: rows, dups: dups, claims: claims, skills: skills };
  });

  const W = r.rows.filter(x => x.world === 'nordic');
  const C = r.rows.filter(x => x.world === 'cn');
  console.log('══════ 北欧 vs 中式 · 换皮体检 ══════\n');
  console.log('【北欧 ' + W.length + ' 件】');
  for (const x of W) {
    console.log('  ' + x.name + '（' + x.id + '）  ' + JSON.stringify(x.sig));
    console.log('     desc: ' + x.desc);
    if (x.up && x.up.length) console.log('     up  : ' + x.up.join(' / '));
  }
  console.log('\n【中式 ' + C.length + ' 件 · 只列 fabao/dan】');
  for (const x of C) console.log('  ' + x.name + '（' + x.id + '）  ' + JSON.stringify(x.sig));

  console.log('\n══ 撞车（效果字段集合完全相同 = 同一类效果）══');
  if (!r.dups.length) console.log('  （无）');
  for (const d of r.dups) {
    console.log('  ⚠ ' + d.nordic + '  ↔  ' + d.cn + '   字段[' + d.keys + ']'
      + (d.完全相同 ? '  **数值也完全一样**' : ''));
    console.log('      北欧 ' + d.nVal + '\n      中式 ' + d.cVal);
  }

  console.log('\n══ 描述含比较级 / 累计措辞（必须人工核对真伪）══');
  for (const c of r.claims) {
    console.log('  [' + (c.world === 'nordic' ? '北欧' : '中式') + '] ' + c.name + '：' + c.desc);
    if (c.up && c.up.length) console.log('        up: ' + c.up.join(' / '));
  }

  console.log('\n══ 权能 / 功法 效果类型对照 ══');
  for (const s of r.skills) {
    console.log('  [' + (s.world === 'nordic' ? '北欧' : '中式') + '] ' + s.name
      + '（' + s.cost + '灵力）  ' + s.tags.join('·'));
  }

  await b.close();
})();
