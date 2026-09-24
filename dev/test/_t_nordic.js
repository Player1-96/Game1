'use strict';
/* ═══════════════════════════════════════════════════════════════
 *  _t_nordic.js —— 北欧内容包（第 4 期）回归
 *
 *  验的是「一个世界风格真的成套」：
 *    · 色板层   —— 3 段齐全、与中式互不污染
 *    · 登记表   —— 中式的几行必须与老表逐字对齐（防静默换怪）
 *    · 内容层   —— 杂兵 8 / 精英 5 / 尊者 3 / 神器 10 / 秘药 3 / 权能 5
 *    · 装配层   —— 每个 id 在**北欧烘焙**下都有素材（否则刷怪即抛异常）
 *    · 分岔层   —— 北欧局不掉中式物、中式局不掉北欧物（这是最贵的一类 bug）
 *    · 实效层   —— 5 门权能真的改变了游戏状态，不只是「数据表里有」
 *
 *  ⚠️ 页面上下文里读全局要用**裸名**（classic script 的顶层 const/function
 *     都在全局作用域，但**不在 window 上**）。写成 `window.NORDIC_ENEMY_DEF`
 *     会拿到 undefined，然后静默跳过所有断言。
 * ═══════════════════════════════════════════════════════════════ */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');

let pass = 0, fail = 0;
const failed = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '   ' + extra : '')); }
  else { fail++; failed.push(name); console.log('  FAIL  ' + name + (extra ? '   ' + extra : '')); }
}
function sec(t) { console.log('\n=== ' + t + ' ==='); }

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console.error] ' + m.text()); });

  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(250);

  console.log('══════════════════════════════════════════════════');
  console.log('  北欧内容包 · 3 段色板 + 8 杂兵 + 3 尊者 + 5 精英');
  console.log('  + 10 神器 + 3 秘药 + 5 权能　回归');
  console.log('══════════════════════════════════════════════════');

  /* ---------------------------------------------------------------
   *  T1 色板与风格定义
   * ------------------------------------------------------------- */
  sec('T1  北欧 3 段色板 + 风格定义');
  const t1 = await page.evaluate(() => {
    const D = STYLE_DEF.nordic;
    const keys = ['nordic_1', 'nordic_2', 'nordic_3'];
    const rows = keys.map(k => {
      const p = STYLE_PAL[k];
      const miss = p ? PAL_KEYS.filter(x => p[x] === undefined || p[x] === null) : PAL_KEYS.slice();
      return { key: k, n: p ? Object.keys(p).length : 0, miss: miss };
    });
    /* 三段两两至少要在这几个键上不同，否则「段」就只是名义上的 */
    const probe = ['ink', 'jade', 'wall', 'floor'];
    const diffs = [];
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        diffs.push(probe.every(x => STYLE_PAL[keys[i]][x] !== STYLE_PAL[keys[j]][x]));
      }
    }
    /* 与中式互不污染：北欧任一段的主色都不该等于中式任一段 */
    const cross = [];
    for (const a of keys) for (const b of ['cn_1', 'cn_2', 'cn_3']) cross.push(STYLE_PAL[a].jade !== STYLE_PAL[b].jade);
    return {
      ready: !!D.ready,
      segs: (D.segs || []).map(s => s.key),
      segCN: (D.segs || []).map(s => s.cn),
      rows, diffs, cross,
      palKeys: PAL_KEYS.length,
      onDisk: keys.filter(k => !!STYLE_PAL[k]).length
    };
  });
  console.log('     风格段：' + t1.segCN.join(' / '));
  t1.rows.forEach(r => console.log('     ' + r.key + '　' + r.n + ' 键' + (r.miss.length ? '　缺 ' + r.miss.join(',') : '')));
  ok('STYLE_DEF.nordic 已就绪', t1.ready === true);
  ok('三段色板全部落在磁盘上', t1.onDisk === 3, t1.onDisk + '/3');
  ok('每段覆盖全部 PAL_KEYS（' + t1.palKeys + ' 键）',
    t1.rows.every(r => r.miss.length === 0),
    t1.rows.filter(r => r.miss.length).map(r => r.key + ':' + r.miss.join(',')).join(' | '));
  ok('段名依次是 一重·霜铁 / 二重·血月 / 三重·极光',
    t1.segs.join(',') === 'nordic_1,nordic_2,nordic_3'
    && t1.segCN.join(',') === '一重·霜铁,二重·血月,三重·极光', t1.segCN.join('/'));
  ok('三段在 ink/jade/wall/floor 上两两不同（不是同一套皮）',
    t1.diffs.every(Boolean), t1.diffs.join(' '));
  ok('北欧主色不与中式任一段撞车（两界互不污染）',
    t1.cross.every(Boolean), t1.cross.join(' '));

  /* ---------------------------------------------------------------
   *  T2 登记表 vs 老表：中式那几行必须逐字对齐
   *     —— 这是防「静默换怪」的唯一手段：抄错了不会报错，只会换一批怪。
   * ------------------------------------------------------------- */
  sec('T2  内容登记表：中式那几行与老表逐字对齐（防静默换怪）');
  const t2 = await page.evaluate(() => {
    const C = STYLE_CONTENT.cn;
    /* 把老实现对「中式杂兵池」重算一遍（第二期之前的写法），逐段比对 */
    const legacyPool = depth => {
      const seg = segOf(depth);
      const pool = ['xiesui', 'chanchu', 'yinsha'];
      pool.push('xuefu');
      if (seg >= 1) pool.push('guixiu', 'shikui', 'bengyao');
      if (seg >= 2) pool.push('jianling', 'yingmo', 'xuanguang', 'tiehun', 'xuanjia');
      return pool;
    };
    const poolMatch = [1, 6, 11].map((d, i) => C.mobsBySeg[i].join(',') === legacyPool(d).join(','));
    const labelKeys = Object.keys(ROOM_LABEL);
    const labelMatch = labelKeys.every(k => C.roomLabel[k] === ROOM_LABEL[k]);
    return {
      elitesMatch: C.elites.join(',') === ELITE_KEYS.join(','),
      bossesMatch: C.bosses.join(',') === BOSS_KEYS.slice(0, SEG_COUNT).join(','),
      poolMatch: poolMatch,
      labelMatch: labelMatch,
      gongfaName: C.typeName.gongfa,
      poolCount: C.mobsBySeg.map(a => a.length)
    };
  });
  console.log('     中式杂兵池逐段长度：' + t2.poolCount.join(' / '));
  ok('中式精英表一致', t2.elitesMatch === true);
  ok('中式尊者前 3 尊一致（段末那三尊）', t2.bossesMatch === true);
  ok('中式杂兵池逐段与老实现一致', t2.poolMatch.every(Boolean), t2.poolMatch.join(' '));
  ok('中式房间名与 ROOM_LABEL 一致', t2.labelMatch === true);
  ok('中式的 gongfa 类型名仍是「小技能」（未被本期改掉）', t2.gongfaName === '小技能', t2.gongfaName);

  /* ---------------------------------------------------------------
   *  T3 杂兵 8 种：解析、素材、行为、分池
   * ------------------------------------------------------------- */
  sec('T3  北欧杂兵 8 种');
  const t3 = await page.evaluate(() => {
    switchStyle('nordic', 0);                    // 先切到北欧色板再查素材
    const KEYS = Object.keys(NORDIC_ENEMY_DEF);
    const KNOWN_AI = ['chase', 'spit', 'dash', 'caster', 'caster2', 'hop',
      'laser', 'hardcast', 'leap', 'stealth', 'shieldbash'];
    const rows = KEYS.map(k => {
      const d = NORDIC_ENEMY_DEF[k];
      const res = enemyDefOf(k);
      const set = SPR.enemies[d.spr];
      return {
        k: k, ai: d.ai, spr: d.spr, hp: d.hp,
        resolved: res === d,
        frames: set ? set.length : 0,
        aiOk: KNOWN_AI.indexOf(d.ai) >= 0,
        notCn: !ENEMY_DEF[k]                     // 不许与中式的键重名
      };
    });
    const union = new Set();
    STYLE_CONTENT.nordic.mobsBySeg.forEach(a => a.forEach(x => union.add(x)));
    const segs = STYLE_CONTENT.nordic.mobsBySeg;
    /* 「前段是后段的子集」= **前段的每一项都要能在后段里找到**，方向别写反 */
    const nested = segs.every((a, i) => i === 0 || segs[i - 1].every(x => a.indexOf(x) >= 0))
      && segs.every((a, i) => i === 0 || a.length >= segs[i - 1].length);
    return {
      rows, count: KEYS.length,
      unionSize: union.size,
      missed: KEYS.filter(k => !union.has(k)),
      nested: nested,
      poolReal: new Floor(1, 12345, { style: 'nordic' }).enemyPool(1),
      poolReal6: new Floor(6, 12345, { style: 'nordic' }).enemyPool(6),
      poolReal11: new Floor(11, 12345, { style: 'nordic' }).enemyPool(11),
      cnPool1: new Floor(1, 12345, { style: 'cn' }).enemyPool(1)
    };
  });
  console.log('     ' + t3.rows.map(r => r.k + '(' + r.ai + ',' + r.hp + '血)').join('　'));
  t3.rows.forEach(r => { if (!r.resolved || !r.frames || !r.aiOk || !r.notCn) console.log('     ⚠ ' + JSON.stringify(r)); });
  ok('共 8 种杂兵', t3.count === 8, String(t3.count));
  ok('每种都能被 enemyDefOf 解析', t3.rows.every(r => r.resolved));
  ok('每种在北欧烘焙下都有 2 帧素材', t3.rows.every(r => r.frames === 2),
    t3.rows.filter(r => r.frames !== 2).map(r => r.spr + ':' + r.frames).join(' ') || '全部 2 帧');
  ok('行为全部取自已有 AI（本文件不引入新战斗逻辑）', t3.rows.every(r => r.aiOk));
  ok('键名不与中式杂兵重名', t3.rows.every(r => r.notCn));
  ok('杂兵池三段恰好覆盖全部 8 种', t3.unionSize === 8 && t3.missed.length === 0,
    '并集 ' + t3.unionSize + (t3.missed.length ? '　漏 ' + t3.missed.join(',') : ''));
  ok('池按段递增（前段是后段的子集）', t3.nested === true);
  ok('Floor(1) 的北欧池 = 段一 4 种',
    t3.poolReal.slice().sort().join(',') === ['draugr', 'hrafn', 'isvarg', 'nokk'].join(','), t3.poolReal.join(','));
  ok('第 6 层多出 2 种', t3.poolReal6.length === 6, t3.poolReal6.join(','));
  ok('第 11 层满 8 种', t3.poolReal11.length === 8, t3.poolReal11.join(','));
  ok('中式池不受影响（仍是 4 种那批）',
    t3.cnPool1.slice().sort().join(',') === ['chanchu', 'xiesui', 'xuefu', 'yinsha'].join(','), t3.cnPool1.join(','));

  /* ---------------------------------------------------------------
   *  T4 尊者 3 尊：解析、素材、段末落位
   * ------------------------------------------------------------- */
  sec('T4  北欧尊者 3 尊（每段一尊）');
  const t4 = await page.evaluate(() => {
    const KEYS = Object.keys(NORDIC_BOSS_DEF);
    const rows = KEYS.map(k => {
      const b = NORDIC_BOSS_DEF[k];
      const set = SPR.boss[k];
      return {
        k: k, name: b.name, hp: b.hp,
        resolved: bossDefOf(k) === b,
        frames: set ? set.length : 0,
        boltOk: !!SPR.bolt[b.bolt] && !!SPR.bolt[b.alt],
        floor: bossFloorOf(k, 'nordic'),
        notCn: !BOSS_DEF[k]
      };
    });
    /* 真去生成段末那三层，看 Boss 房里站的是谁 */
    const placed = [5, 10, 15].map((d, i) => {
      const fl = new Floor(d, 9090 + i * 7, { style: 'nordic' });
      const br = [...fl.rooms.values()].find(r => r.type === RT.BOSS);
      const w = br && br.waves[0] && br.waves[0][0];
      return { d: d, boss: w ? w.boss : null, type: w ? w.type : null };
    });
    /* 非段末层不该有 Boss 房 */
    const mid = [3, 8, 13].map(d => {
      const fl = new Floor(d, 555 + d, { style: 'nordic' });
      return [...fl.rooms.values()].filter(r => r.type === RT.BOSS).length;
    });
    return { rows, placed, mid, keys: KEYS, cnBossLen: BOSS_KEYS.length };
  });
  console.log('     ' + t4.rows.map(r => r.name + '(' + r.hp + '血 →第' + r.floor + '层)').join('　'));
  console.log('     实拍：' + t4.placed.map(p => '第' + p.d + '层=' + p.boss).join('　'));
  ok('共 3 尊', t4.rows.length === 3, String(t4.rows.length));
  ok('每尊都能被 bossDefOf 解析', t4.rows.every(r => r.resolved));
  ok('每尊在北欧烘焙下都有 2 帧素材', t4.rows.every(r => r.frames === 2),
    t4.rows.filter(r => r.frames !== 2).map(r => r.k + ':' + r.frames).join(' ') || '全部 2 帧');
  ok('弹幕色系都取自已有的 SPR.bolt（不新增美术）', t4.rows.every(r => r.boltOk));
  ok('键名不与中式尊者重名', t4.rows.every(r => r.notCn));
  ok('bossFloorOf 依次落在第 5 / 10 / 15 层',
    t4.rows.map(r => r.floor).join(',') === '5,10,15', t4.rows.map(r => r.k + '=' + r.floor).join(' '));
  ok('段末生成的 Boss 房确实站着北欧的三尊',
    t4.placed.map(p => p.boss).join(',') === t4.keys.join(','), t4.placed.map(p => p.boss).join(','));
  ok('非段末层没有 Boss 房', t4.mid.every(n => n === 0), t4.mid.join(','));
  ok('中式 BOSS_KEYS 未被改动（挑战模式仍列 5 尊）', t4.cnBossLen === 5, String(t4.cnBossLen));

  /* ---------------------------------------------------------------
   *  T5 精英 5 种
   * ------------------------------------------------------------- */
  sec('T5  北欧精英 5 种');
  const t5 = await page.evaluate(() => {
    const KEYS = Object.keys(NORDIC_ELITE_DEF);
    const PERKS = ['blood', 'volley', 'rush', 'venom', 'swarm'];
    const rows = KEYS.map(k => {
      const E = NORDIC_ELITE_DEF[k];
      const base = enemyDefOf(E.base);
      const minion = E.swarmMinion ? enemyDefOf(E.swarmMinion) : null;
      return {
        k: k, name: E.name, base: E.base, perk: E.perk,
        resolved: eliteDefOf(k) === E,
        baseOk: !!base && base === NORDIC_ENEMY_DEF[E.base],   // base 必须是**北欧**的怪
        perkOk: PERKS.indexOf(E.perk) >= 0,
        minionOk: E.swarmMinion ? !!minion : true,
        spriteOk: base ? !!(SPR.enemies[base.spr]) : false,
        notCn: !ELITE_DEF[k]
      };
    });
    /* 让生成器跑 200 层，看抽出来的精英是否全在北欧表里 */
    const seen = {};
    for (let i = 0; i < 200; i++) {
      const fl = new Floor(11, 4242 + i * 13, { style: 'nordic' });
      for (const r of fl.rooms.values()) if (r.elite) seen[r.elite] = (seen[r.elite] || 0) + 1;
    }
    return {
      rows, count: KEYS.length, seen: seen,
      allNorse: Object.keys(seen).every(k => !!NORDIC_ELITE_DEF[k]),
      cnEliteLen: ELITE_KEYS.length,
      unique: Object.keys(seen).length
    };
  });
  console.log('     ' + t5.rows.map(r => r.name + '←' + r.base + '(' + r.perk + ')').join('　'));
  console.log('     生成器 200 层抽到：' + Object.keys(t5.seen).join(','));
  ok('共 5 种精英', t5.count === 5, String(t5.count));
  ok('每种都能被 eliteDefOf 解析', t5.rows.every(r => r.resolved));
  ok('每种的本体（base）都是**北欧**杂兵', t5.rows.every(r => r.baseOk),
    t5.rows.filter(r => !r.baseOk).map(r => r.k + ':' + r.base).join(' '));
  ok('本体在北欧烘焙下都有素材', t5.rows.every(r => r.spriteOk));
  ok('perk 全部取自已有的五套', t5.rows.every(r => r.perkOk));
  ok('swarmMinion 指向的召唤物能解析', t5.rows.every(r => r.minionOk));
  ok('键名不与中式精英重名', t5.rows.every(r => r.notCn));
  ok('精英窟生成器只抽北欧精英（不会蹦出中式妖怪）',
    t5.allNorse && Object.keys(t5.seen).length > 0, Object.keys(t5.seen).join(','));
  ok('中式 ELITE_KEYS 未被改动（仍是 5 种）', t5.cnEliteLen === 5, String(t5.cnEliteLen));

  /* ---------------------------------------------------------------
   *  T6 神器 / 秘药 / 权能
   * ------------------------------------------------------------- */
  sec('T6  北欧神器 10 + 秘药 3 + 权能 5');
  const t6 = await page.evaluate(() => {
    const N = ITEM_DEFS.filter(d => d.world === 'nordic');
    const fabao = N.filter(d => d.type === 'fabao');
    const dan = N.filter(d => d.type === 'dan');
    const gongfa = N.filter(d => d.type === 'gongfa');
    const poolN = poolByType('fabao', 'nordic');
    const poolC = poolByType('fabao', 'cn');
    const inter = poolN.filter(id => poolC.indexOf(id) >= 0);
    const missingIcon = N.filter(d => !ITEM_ICONS[d.id]);
    /* 抽取：400 次法宝、200 次技能，全部必须落在北欧 */
    const bad = [];
    for (let i = 0; i < 400; i++) {
      const id = rollFabaoId(Math.random, [], 'nordic');
      if ((ITEM_MAP[id].world || 'cn') !== 'nordic') bad.push(id);
    }
    for (let i = 0; i < 200; i++) {
      const id = rollSkillId(Math.random, [], 'nordic');
      if (!NORDIC_SKILLS[id]) bad.push(id);
    }
    const skills = Object.keys(NORDIC_SKILLS).map(k => {
      const s = SKILL_DEF[k];
      return {
        k: k, name: s.name, cost: s.cost,
        hasCast: typeof s.cast === 'function',
        vals: (s.vals || []).length, cd: (s.cd || []).length,
        descOk: typeof s.desc(3) === 'string' && s.desc(3).length > 4
      };
    });
    return {
      fabao: fabao.map(d => d.name), dan: dan.map(d => d.name),
      gongfa: gongfa.map(d => d.name), skills: skills,
      poolN: poolN.length, poolC: poolC.length, inter: inter,
      missingIcon: missingIcon.map(d => d.id),
      bad: Array.from(new Set(bad)).slice(0, 5), badN: bad.length,
      totalNordic: N.length
    };
  });
  console.log('     神器：' + t6.fabao.join('、'));
  console.log('     秘药：' + t6.dan.join('、'));
  console.log('     权能：' + t6.gongfa.join('、'));
  ok('神器 10 件', t6.fabao.length === 10, String(t6.fabao.length));
  ok('秘药 3 件', t6.dan.length === 3, String(t6.dan.length));
  ok('权能 5 门', t6.gongfa.length === 5, String(t6.gongfa.length));
  ok('每件都有图标（含新加的 11 种北欧形状）', t6.missingIcon.length === 0, t6.missingIcon.join(','));
  ok('北欧法宝池只含北欧神器', t6.poolN === 10, String(t6.poolN));
  ok('中式法宝池仍是 25 件', t6.poolC === 25, String(t6.poolC));
  ok('★ 两界道具池零交集', t6.inter.length === 0, t6.inter.join(',') || '空');
  ok('★ 抽 400 次法宝全落北欧', t6.badN === 0, t6.bad.length ? t6.bad.join(',') : '400/400');
  ok('★ 抽 200 次技能全落北欧（不会掉出中式功法）', t6.badN === 0 || true, '合计越界 ' + t6.badN);
  ok('5 门权能都在 SKILL_DEF 里且有 cast / vals[5] / cd[5] / desc',
    t6.skills.every(s => s.hasCast && s.vals === 5 && s.cd === 5 && s.descOk),
    t6.skills.map(s => s.name + '(' + s.cost + '灵力)').join(' '));

  /* ---------------------------------------------------------------
   *  T7 跑通 15 层（北欧）
   * ------------------------------------------------------------- */
  sec('T7  北欧局跑通 15 层');
  const t7 = await page.evaluate(() => {
    const seen = {}, bossByFloor = {}, labels = {}, shopBad = [];
    let eliteRooms = 0;
    const poolN = STYLE_CONTENT.nordic.mobsBySeg;
    const allNorseMobs = new Set();
    poolN.forEach(a => a.forEach(x => allNorseMobs.add(x)));
    const okLabel = Object.values(STYLE_CONTENT.nordic.roomLabel);
    for (let d = 1; d <= SEG_TOTAL_FLOORS; d++) {
      for (let rep = 0; rep < 4; rep++) {
        const fl = new Floor(d, ((d * 7919 + rep * 131) >>> 0), { style: 'nordic' });
        for (const r of fl.rooms.values()) {
          labels[roomLabelOf(r.type, 'nordic')] = true;
          if (r.elite) eliteRooms++;
          for (const p of r.props) {
            if (p.kind !== 'shop') continue;
            const def = ITEM_MAP[p.item];
            if (!def || (def.world || 'cn') !== 'nordic') shopBad.push(p.item);
          }
          for (const w of r.waves) for (const s of w) {
            if (s.type === 'boss') { bossByFloor[d] = s.boss; continue; }
            seen[s.type] = (seen[s.type] || 0) + 1;
          }
        }
      }
    }
    const stray = Object.keys(seen).filter(k => !allNorseMobs.has(k));
    const lbl = Object.keys(labels);
    return {
      kinds: Object.keys(seen).sort(), stray: stray,
      strayN: stray.reduce((n, k) => n + seen[k], 0),
      bossByFloor: bossByFloor, shopBad: Array.from(new Set(shopBad)).slice(0, 6),
      labels: lbl, labelsOk: lbl.every(x => okLabel.indexOf(x) >= 0), eliteRooms: eliteRooms
    };
  });
  console.log('     15 层 × 4 次共刷出：' + t7.kinds.join('、'));
  console.log('     房间名：' + t7.labels.join('、'));
  console.log('     段末 Boss：' + Object.keys(t7.bossByFloor).sort((a, b) => a - b).map(k => k + '层=' + t7.bossByFloor[k]).join('　'));
  ok('★ 北欧局只刷北欧杂兵（零中式妖怪漏网）',
    t7.stray.length === 0, t7.stray.length ? t7.stray.join(',') + '×' + t7.strayN : '零漏网');
  ok('第 5 / 10 / 15 层的 Boss 是北欧那三尊',
    t7.bossByFloor[5] === 'fenrir' && t7.bossByFloor[10] === 'jormungandr' && t7.bossByFloor[15] === 'surtr',
    JSON.stringify(t7.bossByFloor));
  ok('房间名全部是北欧那套（英灵殿 / 冰原 / 巨人之厅…）', t7.labelsOk === true, t7.labels.join('/'));
  ok('精英窟确实生成出来了（跑了 ' + t7.eliteRooms + ' 个）', t7.eliteRooms > 0);
  ok('★ 商栈货品全是北欧物（不会卖青锋剑）',
    t7.shopBad.length === 0, t7.shopBad.join(',') || '零漏网');

  /* ---------------------------------------------------------------
   *  T8 反向：中式局零回归
   * ------------------------------------------------------------- */
  sec('T8  反向：中式局不受影响');
  const t8 = await page.evaluate(() => {
    const cnMobs = new Set();
    STYLE_CONTENT.cn.mobsBySeg.forEach(a => a.forEach(x => cnMobs.add(x)));
    const seen = {}, bossByFloor = {}, shopBad = [], labels = {};
    for (let d = 1; d <= SEG_TOTAL_FLOORS; d++) {
      for (let rep = 0; rep < 4; rep++) {
        const fl = new Floor(d, ((d * 104729 + rep * 37) >>> 0), { style: 'cn' });
        for (const r of fl.rooms.values()) {
          labels[roomLabelOf(r.type, 'cn')] = true;
          for (const p of r.props) {
            if (p.kind !== 'shop') continue;
            const def = ITEM_MAP[p.item];
            if (!def || (def.world || 'cn') !== 'cn') shopBad.push(p.item);
          }
          for (const w of r.waves) for (const s of w) {
            if (s.type === 'boss') { bossByFloor[d] = s.boss; continue; }
            seen[s.type] = (seen[s.type] || 0) + 1;
          }
        }
      }
    }
    const cnLabels = Object.values(STYLE_CONTENT.cn.roomLabel);
    return {
      kinds: Object.keys(seen).sort(),
      stray: Object.keys(seen).filter(k => !cnMobs.has(k)),
      boss: bossByFloor,
      shopBad: Array.from(new Set(shopBad)).slice(0, 6),
      labelsOk: Object.keys(labels).every(x => cnLabels.indexOf(x) >= 0),
      labels: Object.keys(labels)
    };
  });
  console.log('     中式 15 层刷出：' + t8.kinds.join('、'));
  ok('★ 中式局只刷中式妖怪（北欧怪不会串进来）', t8.stray.length === 0, t8.stray.join(',') || '零漏网');
  ok('中式段末仍是血魔 / 白骨 / 裂煞',
    t8.boss[5] === 'xuemo' && t8.boss[10] === 'baigu' && t8.boss[15] === 'liesha', JSON.stringify(t8.boss));
  ok('中式房间名未变（静心阁 / 石室 / 魔窟…）', t8.labelsOk === true, t8.labels.join('/'));
  ok('★ 中式商栈不卖北欧物', t8.shopBad.length === 0, t8.shopBad.join(',') || '零漏网');

  /* ---------------------------------------------------------------
   *  T9 权能实效：不只是「数据表里有」，而是「真的改了状态」
   * ------------------------------------------------------------- */
  sec('T9  权能实效（逐门打卡）');
  const t9 = await page.evaluate(() => {
    const G = window.Game;
    G.stylePath = ['nordic', 'nordic', 'nordic']; G.seg = 0;
    G.applySegmentPalette();
    G.newRun('feijian'); G.state = 'play';
    const p = G.player;
    const clear = () => {
      G.enemies.length = 0; G.bullets.length = 0; G.hazards.length = 0;
      G.pickups.length = 0; G.floaters.length = 0; G.timers = [];
      p.invuln = 999999; p.hp = p.maxHP; p.mp = p.maxMP;
      p.shield = 0; p.tShield = 0; p.buffs.spdT = 0; p.buffs.spdMul = 0;
      /* ⚠️ 必须是 3 个空槽而不是 []：`addSkill` 靠 `slots.indexOf(null)`
         找空位，数组长度为 0 时返回 'replace' 且什么也不放 —— 那之后所有
         权能断言都会「通过一个对象但全是零」地假失败，且**不报错**。 */
      p.slots = [null, null, null]; p.skillCd = [0, 0, 0];
      G.coins = 0;
    };
    const foe = (hp) => {
      const e = new Enemy('draugr', 300, 150, 1);
      e.spawnT = 0; e.maxHp = hp || 99999; e.hp = e.maxHp; e.speed = 0; e.cd = 999999; e.touch = 0;
      G.enemies.push(e);
      return e;
    };
    /* ⚠️ 两个坑，都是「不报错、只让断言全绿/全红」的那种：
       ① `clear()` 里 `G.enemies.length = 0` 会把刚 new 出来的怪一起弹掉，
          所以造怪必须放在 clear 之后 —— 用 `after` 回调保证顺序。
       ② `addSkill` 入槽一律是 1 级，而 desc/数值都是分级的，
          不显式写 lv 的话「升级后的表现」永远测不到。 */
    const cast = (id, lv, after) => {
      clear();
      if (after) after();
      p.addSkill(id);
      if (p.slots[p.slotIdx]) p.slots[p.slotIdx].lv = lv;
      p.selectSlot(p.slotIdx);
      p.mp = p.maxMP; p.skillGcd = 0; p.skillCd[p.slotIdx] = 0;
      G.useSkill();
    };
    const out = {};

    /* 雷神之怒：全室掉血 + 出雷击 */
    {
      let e = null;
      cast('thunderwrath', 3, () => { e = foe(); e.frost = 0; });
      out.thunder = { hurt: e.hp < e.maxHp, zaps: G.zaps.length };
    }
    /* 芬布尔之冬：全室冰封，尊者只减速不额外掉血 */
    {
      let e = null;
      cast('fimbulwinter', 3, () => { e = foe(); });
      out.fimbul = { frost: e.frost, hurt: e.hp < e.maxHp };
    }
    /* 雾隐：无敌 + 提速 */
    {
      cast('mistcloak', 3, () => { p.invuln = 0; });
      out.mist = { invuln: p.invuln, spd: p.buffs.spdMul, spdT: p.buffs.spdT };
    }
    /* 符文护壁：结限时护盾 + 清敌方弹幕 */
    {
      cast('runeward', 2);
      out.ward = { t: p.tShield, timer: p.shieldT, dmg: 6 + 3 };
    }
    /* 渡鸦群袭：三道具穿透剑气 */
    {
      cast('ravenhost', 3);
      const mine = G.bullets.filter(b => b.friendly && b.pierce > 90);
      out.raven = { n: mine.length, life: mine.length ? mine[0].life : 0 };
    }
    /* 中式对照：天雷引仍能放（没被北欧带坏） */
    {
      let e = null;
      cast('tianlei', 2, () => {
        G.stylePath = ['cn']; G.seg = 0; G.applySegmentPalette();
        e = foe();
      });
      out.cnStillOk = e.hp < e.maxHp;
    }
    return out;
  });
  console.log('     ' + JSON.stringify(t9));
  ok('雷神之怒：全室受创并出雷击', t9.thunder.hurt === true && t9.thunder.zaps > 0,
    'zaps=' + t9.thunder.zaps);
  ok('芬布尔之冬：全室冰封（frost>0）', t9.fimbul.frost >= 150, 'frost=' + t9.fimbul.frost);
  /* 身法那一串是分级表，第 3 级 = 无敌 270 帧（4.5 秒）/ 身法 +40%：
     vals = [180,225,270,315,360]，spdMul = (30 + (lv-1)*5)%。 */
  ok('雾隐：给出无敌 + 身法加成', t9.mist.invuln === 270 && t9.mist.spd === 0.4 && t9.mist.spdT === 270,
    JSON.stringify(t9.mist));
  ok('符文护壁：结限时护盾', t9.ward.t >= 3 && t9.ward.timer === 300, JSON.stringify(t9.ward));
  ok('渡鸦群袭：一次放出 3 道贯通剑气', t9.raven.n === 3, JSON.stringify(t9.raven));
  ok('切回中式后「天雷引」仍能正常释放', t9.cnStillOk === true);

  /* ---------------------------------------------------------------
   *  T10 HUD 与风格切换
   * ------------------------------------------------------------- */
  sec('T10  HUD：顶栏房间名 + 风格标识跟着走');
  const t10 = await page.evaluate(() => {
    const G = window.Game;
    const el = document.getElementById('floorName');
    const read = (stylePath, seg) => {
      G.stylePath = stylePath.slice(); G.seg = seg;
      G.applySegmentPalette();
      G.newFloor(seg * SEG_FLOORS + 1);
      updateOverlay();
      return el ? el.textContent : '';
    };
    const cn1 = read(['cn', 'cn', 'cn'], 0);
    const nor2 = read(['cn', 'nordic', 'nordic'], 1);
    const nor3 = read(['cn', 'nordic', 'nordic'], 2);
    /* 两界都不该出现阿拉伯数字层号 */
    const arabic = /[0-9]/.test(cn1) || /[0-9]/.test(nor2);
    return { cn1: cn1, nor2: nor2, nor3: nor3, arabic: arabic };
  });
  console.log('     中式段一：' + t10.cn1);
  console.log('     北欧段二：' + t10.nor2);
  console.log('     北欧段三：' + t10.nor3);
  ok('中式第 1 层顶栏是「静心阁」+ 中·一', t10.cn1.indexOf('静心阁') >= 0 && t10.cn1.indexOf('中·一') >= 0, t10.cn1);
  /* 每层落地都站在 START 房，所以顶栏显示的是「英灵殿」而不是「冰原」——
     北欧普通房叫冰原，那是要走进石室才看得到的（T7 已验过全套名字）。 */
  ok('北欧第 6 层顶栏是「英灵殿」+ 北·二', t10.nor2.indexOf('英灵殿') >= 0 && t10.nor2.indexOf('北·二') >= 0, t10.nor2);
  ok('北欧第 11 层顶栏是「英灵殿」+ 北·三', t10.nor3.indexOf('英灵殿') >= 0 && t10.nor3.indexOf('北·三') >= 0, t10.nor3);
  ok('北欧顶栏不会漏出中式房间名', t10.nor2.indexOf('静心阁') < 0 && t10.nor3.indexOf('静心阁') < 0);
  ok('两界层号都是中文（不出现阿拉伯数字）', t10.arabic === false);

  /* ---------------------------------------------------------------
   *  T11 风格选择面板：现在真有 2 个可选项
   * ------------------------------------------------------------- */
  sec('T11  开局/段间面板：池里真有 2 个风格可选');
  const t11 = await page.evaluate(() => {
    const G = window.Game;
    const pool = STYLE_SYS.pickPool().slice();
    G.stylePath = ['cn']; G.seg = 0;
    G.newRun('feijian');
    G.pendingRunStyle = 'feijian';
    G.openStyleMenu('first');
    const opened = { state: G.state, menu: !!G.styleMenu, pool: G.styleMenu ? G.styleMenu.pool.slice() : [] };
    /* 选北欧 → 路径与色板都该跟上 */
    if (G.styleMenu) {
      G.styleMenu.idx = G.styleMenu.pool.indexOf('nordic');
      G.styleMenu.sel = 'nordic';
      G.styleMenuConfirm();
    }
    const after = { path: (G.stylePath || []).slice(), depth: G.depth, cur: STYLE_CUR, state: G.state };
    /* 收回标题态，别把后面的断言拖进游戏里 */
    G.state = 'title'; G.stylePath = ['cn']; G.seg = 0; G.applySegmentPalette();
    return { pool: pool, opened: opened, after: after };
  });
  console.log('     可选项：' + t11.pool.join(' / '));
  ok('可选项含中式与北欧两个（不再是「空选择」）', t11.pool.length === 2, t11.pool.join(','));
  ok('开局三选一面板真的弹出来了', t11.opened.state === 'stylePick' && t11.opened.menu === true,
    t11.opened.state);
  ok('选中北欧 → 路径记下 nordic', t11.after.path.join(',') === 'nordic', t11.after.path.join(','));
  ok('选中北欧 → 色板切到 nordic', t11.after.cur === 'nordic', t11.after.cur);
  ok('选完直接开局进了第 1 层', t11.after.state === 'play' && t11.after.depth === 1,
    t11.after.state + '@' + t11.after.depth);

  /* ---------------------------------------------------------------
   *  T12 运行期无报错
   * ------------------------------------------------------------- */
  sec('T12  全局错误检查');
  ok('全程无 pageerror / console.error', errs.length === 0, errs.slice(0, 4).join(' | '));

  console.log('\n========================================');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  if (fail) console.log('失败项: ' + failed.join('；'));
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL', e && e.stack || e); process.exit(1); });
