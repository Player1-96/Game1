'use strict';
/* ============================================================
 *  _export_resources.js —— 把游戏内全部资源数值导出成 dev/data/_resources.json
 *
 *  用途：供 _sync_sheet.py 上传到腾讯文档《九劫录·资源表》。
 *  改完 src/ 下的数值后（在仓库根目录执行），先跑
 *      node dev/tools/_export_resources.js
 *  再跑
 *      python dev/tools/_sync_sheet.py
 *  云端表格即同步。
 *
 *  做法：用 Playwright 打开 index.html，在真实运行环境里读取
 *  ITEM_DEFS / ENEMY_DEF / ELITE_DEF 等全局表，避免用正则去猜。
 * ============================================================ */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'data', '_resources.json');

/* 妖物中文名 —— 源码里只有 id，中文名取自 sprites.js 的作画注释 */
const ENEMY_CN = {
  xiesui: '邪祟', chanchu: '蟾蜍妖', xuefu: '血蝠', guixiu: '鬼修',
  yinsha: '阴煞', shikui: '尸傀', jianling: '剑灵',
  xuanguang: '玄光瞳', bengyao: '蹦山魈', yingmo: '影魅',
  tiehun: '铁魄妖', xuanjia: '玄甲卫'
};
const AI_CN = {
  chase: '近战追击', spit: '定点吐弹', dash: '蓄力冲刺',
  caster: '远程施法', hop: '跳跃（死亡分裂）', caster2: '远程追踪弹',
  laser: '蓄力激光（贯穿光柱）', hardcast: '玄铁硬弹（不可击落/反射）',
  leap: '弹跳砸地（落点预警）', stealth: '隐身突袭（逼近现形）',
  shieldbash: '持盾冲撞（起手时盾收正面）'
};
/* 妖物的「特殊」列 —— 只写机制本身，数值一律留在游戏源码里当唯一真相 */
const ENEMY_NOTE = {
  chanchu: '死亡分裂成 2 只小阴煞',
  xuanguang: '蓄力 1.3 秒，先亮范围提示；方向钉死后仍可横移躲开，锁定前移动无效',
  tiehun: '玄铁弹斩不落、反射不了、也照不穿，只有走位一条路',
  bengyao: '落点先出预警圈再落地砸击；腾空期间不咬人，可以贴身穿过',
  xuanjia: '慢速追近，进 138px 起手盾冲：蓄力 0.67 秒（地面画出冲程带），冲撞 0.4 秒后硬直 0.5 秒。'
    + '起手到硬直结束，两片旋盾并成一片收拢到正面（伤害减免 75%）—— 正面硬打是白打，绕到侧后才是 4 倍收益；'
    + '无来源位置的伤害（DoT / 技能）绕盾',
  yingmo: '常驻隐身，逼近 110px 才现形扑击，受创即现形'
};
/* 弹种中文名 —— 头目的主副弹幕 */
const BOLT_CN = {
  blood: '血珠', talisman: '符箓', flame: '炼火', ice: '寒冰', orb: '灵珠', iron: '玄铁'
};
/* 头目打法要点 —— 题面各不相同，玩家每层都要重学一次走位 */
const BOSS_GIMMICK = {
  xuemo: '整圈血弹 + 无限爪牙，最基础的一课：绕着圈子走，别站在他对面。'
    + '冲刺前会先站定蓄势 0.67 秒、在地上画出冲程带；带子变亮并浮出推进光点就是要撞了，当场横移就能躲',
  baigu: '定点冰符 + 蓄力冲刺，考验拉扯距离：贴脸会被冲，站远会被符箓封角',
  liesha: '母弹裂成 2 枚中弹、每枚再裂成 3 枚小弹（一轮 9 枚），越躲越密，要提前找空当而不是追着弹缝钻',
  lunhui: '18~20 枚缓速环弹，环上固定留一道缺口；不冲刺，纯考站位 —— 缺口每轮换位但不追人',
  zhulong: '鳞罩期间免疫全部伤害、同时架起横扫激光（蓄力 1.3 秒，扇面亮度与进度弧随倒计时推进），'
    + '罩碎才可反击：打不动的两秒就是必须走位的两秒'
};
const PERK_CN = {
  blood: '血箭（受创减免四成）', volley: '符箓三连发+灼烧',
  rush: '瞬影突进', venom: '毒弹落地成沼', swarm: '环形剑气+召小剑灵'
};

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title');
  // 停掉主循环，避免后台 update 干扰采样
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const data = await page.evaluate(({ ENEMY_CN, AI_CN, PERK_CN, ENEMY_NOTE, BOLT_CN, BOSS_GIMMICK }) => {
    const G = window.Game;

    /* ---------- 1. 玩家基础 ---------- */
    const p0 = new Player(0, 0);
    const player = {
      maxHP: p0.maxHP, hp: p0.hp, r: p0.r,
      stats: JSON.parse(JSON.stringify(p0.stats)),
      note: 'maxHP 单位为半心（6 = 3 颗心）'
    };

    /* ---------- 2. 物品（法宝 / 丹药 / 功法） ---------- */
    const cleanApply = (fn) => {
      if (!fn) return '';
      let s = fn.toString();
      const m = s.match(/=>\s*\{([\s\S]*)\}\s*$/) || s.match(/\(([^)]*)\)\s*=>\s*(.+)$/);
      s = m ? (m[1] || m[2]) : s;
      return s.replace(/\bp\./g, '').replace(/\bg\./g, '').replace(/\bGame\./g, '')
        .replace(/^[\s{;]+/, '').replace(/[\s;}]+$/, '')
        .replace(/\s+/g, ' ').trim();
    };
    const items = ITEM_DEFS.map(d => ({
      id: d.id, name: d.name, type: d.type, icon: d.icon,
      desc: d.desc, func: !!d.func,
      up: d.up ? d.up.slice() : [],
      cd: d.cd || 0,
      apply: cleanApply(d.apply),
      rare: !!d.rare,
      // 数值型堆叠到 n 层时的合计口径（功能型走 up[] 进阶文案）
      tally2: ITEM_TALLY[d.id] ? ITEM_TALLY[d.id](2) : '',
      tally3: ITEM_TALLY[d.id] ? ITEM_TALLY[d.id](3) : '',
      byStyle: d.byStyle ? JSON.parse(JSON.stringify(d.byStyle)) : null,
      // 个别法宝连「进阶效果」都分流派（如玄元镜在舞剑流下改走照影）
      upByStyle: d.upByStyle ? JSON.parse(JSON.stringify(d.upByStyle)) : null
    }));

    /* ---------- 3. 妖物 ---------- */
    const enemies = Object.keys(ENEMY_DEF).map(k => {
      const d = ENEMY_DEF[k];
      return {
        id: k, cn: ENEMY_CN[k] || k, hp: d.hp, speed: d.speed, r: d.r,
        touch: d.touch, coins: d.coins, ai: d.ai, aiCn: AI_CN[d.ai] || d.ai,
        size: d.size, score: d.score, split: !!d.split, shield: !!d.shield,
        note: ENEMY_NOTE[k] || ''
      };
    });

    /* ---------- 4. 精英 ---------- */
    const elites = Object.keys(ELITE_DEF).map(k => {
      const E = ELITE_DEF[k];
      const base = ENEMY_DEF[E.base];
      return {
        id: k, cn: E.name, en: E.en, base: E.base, baseCn: ENEMY_CN[E.base] || E.base,
        hpMul: E.hpMul, spdMul: E.spdMul, scale: E.scale, rMul: E.rMul,
        coins: E.coins, score: E.score, perk: E.perk, perkCn: PERK_CN[E.perk] || E.perk,
        perkCd: E.perkCd, desc: E.desc,
        hpAtD1: Math.round(base.hp * E.hpMul)   // 一层裸装（hpScale=1）时的血量
      };
    });

    /* ---------- 5. Boss ----------
       一层一位、固定不轮换（dungeon.js 的 RT.BOSS 直接取 BOSS_KEYS[层-1]），
       所以这里的顺序就是出现顺序，改 BOSS_DEF 的键序等于改每层打谁。 */
    const bosses = Object.keys(BOSS_DEF).map((k, i) => {
      const d = BOSS_DEF[k];
      return {
        id: k, cn: d.name, en: d.en, hp: d.hp, spd: d.spd,
        bolt: d.bolt, boltCn: BOLT_CN[d.bolt] || d.bolt,
        alt: d.alt || null, altCn: d.alt ? (BOLT_CN[d.alt] || d.alt) : '',
        dash: d.dash || 0,
        appear: '第 ' + (i + 1) + ' 层',
        gimmick: BOSS_GIMMICK[k] || ''
      };
    });

    /* ---------- 6. Boss 挑战模式 ----------
       难度系数同时决定「玩家拿到什么」与「头目有多厚」，所以这张表既是
       玩法说明、也是调参入口：三档的每一格都在 CHALLENGE_DIFF 里改。 */
    const challenge = {
      upgrades: CHALL_UPGRADES,
      tiers: CHALLENGE_DIFF.map(x => ({
        key: x.key, name: x.name, en: x.en,
        items: x.items, skills: x.skills, ultLv: x.ultLv, bossMul: x.bossMul
      })),
      // 菜单里每位头目挂的那句题面（取自 CHALL_BOSS_NOTE）
      bosses: BOSS_KEYS.map(k => ({ id: k, cn: BOSS_DEF[k].name, note: CHALL_BOSS_NOTE[k] || '' }))
    };

    /* ---------- 7. 流派与蓄力段位 ---------- */
    const styles = Object.keys(STYLES).map(k => ({
      id: k, name: STYLES[k].name, en: STYLES[k].en, tag: STYLES[k].tag, ready: !!STYLES[k].ready,
      // 机制固有参数一并导出：资源表的说明文案直接引用它们，改数值时不会两边漂移
      consts: STYLES[k].consts || null
    }));
    const charge = {
      t1: CHARGE.t1, t2: CHARGE.t2, max: CHARGE.max,
      tiers: CHARGE_TIER.map(t => ({ name: t.name, pierce: t.pierce, r: t.r, life: t.life, scale: t.scale, dmgMul: t.dmgMul, cd: t.cd }))
    };

    /* ---------- 7. 坊市价格（按深度） ---------- */
    const shopPrices = [];
    for (let d = 1; d <= 6; d++) {
      const rng = mulberry32(20260911 + d);
      const gs = Floor.prototype.shopGoods.call({ owned: [] }, rng, d);
      shopPrices.push({
        depth: d,
        slots: gs.map((g, i) => ({
          idx: i + 1,
          type: ITEM_MAP[g.item].type,
          price: g.price
        })),
        sink: gs.reduce((a, g) => a + g.price, 0)
      });
    }

    /* ---------- 8. 妖物池（按深度） ---------- */
    const pools = [];
    for (let d = 1; d <= 6; d++) {
      const f = Object.create(Floor.prototype);
      const pool = f.enemyPool(d);
      pools.push({ depth: d, pool: pool.map(id => ({ id, cn: ENEMY_CN[id] || id, p: +(1 / pool.length * 100).toFixed(1) })) });
    }

    /* ---------- 9. 各层实测（房间数 / 精英 / 密室 / 经济 / 难度） ---------- */
    const SAMPLES = 40;
    const floors = [];
    for (let depth = 1; depth <= 6; depth++) {
      const acc = {
        rooms: 0, normal: 0, elite: 0, secret: 0, treasure: 0, shop: 0, sacrifice: 0,
        budget: 0, sink: 0, reserve: 0, eliteMult: 0, eliteMultN: 0,
        lock: 0, bomb: 0, enemies: 0, normalRooms: 0, hpScale: 0, n: 0,
        diff: null, power: 0
      };
      for (let s = 0; s < SAMPLES; s++) {
        G.newRun('feijian');
        // 模拟「打到第 depth 层」：前几层每层约 3 件法宝（清房 + 藏珍阁 + Boss）
        for (let i = 0; i < Math.max(0, (depth - 1) * 3); i++) G.player.give(G.rollFabao(), G);
        const power = G.powerScore();
        G.newFloor(depth);
        const f = G.floor;
        let enemies = 0, normalRooms = 0, hp = 0, hpN = 0;
        for (const r of f.rooms.values()) {
          if (r.type === 'normal' && !r.elite) normalRooms++;
          if (r.elite) acc.elite++;
          for (const wv of r.waves) for (const sp of wv) {
            enemies++; hp += sp.hpScale || 1; hpN++;
          }
        }
        acc.n++;
        acc.rooms += f.rooms.size;
        acc.normal += normalRooms;
        for (const r of f.rooms.values()) {
          if (r.type === 'secret') acc.secret++;
          if (r.type === 'treasure') acc.treasure++;
          if (r.type === 'shop') acc.shop++;
          if (r.type === 'sacrifice') acc.sacrifice++;
        }
        acc.budget += f.coinBudget; acc.sink += f.coinSink; acc.reserve += f.coinReserve;
        acc.lock += f.lockCount; acc.bomb += f.bombPlan;
        if (f.eliteMult > 1) { acc.eliteMult += f.eliteMult; acc.eliteMultN++; }
        acc.enemies += enemies; acc.normalRooms += normalRooms;
        acc.hpScale += hpN ? hp / hpN : 0;
        acc.power += power;
        acc.diff = f.diff;
      }
      const N = acc.n;
      floors.push({
        depth,
        rooms: +(acc.rooms / N).toFixed(1),
        normalRooms: +(acc.normal / N).toFixed(1),
        eliteRate: +(acc.elite / N * 100).toFixed(0),
        secretRate: +(acc.secret / N * 100).toFixed(0),
        treasureRate: +(acc.treasure / N * 100).toFixed(0),
        shopRate: +(acc.shop / N * 100).toFixed(0),
        sacrificeRate: +(acc.sacrifice / N * 100).toFixed(0),
        budget: Math.round(acc.budget / N),
        sink: Math.round(acc.sink / N),
        reserve: Math.round(acc.reserve / N),
        eliteMult: acc.eliteMultN ? +(acc.eliteMult / acc.eliteMultN).toFixed(2) : 0,
        locks: +(acc.lock / N).toFixed(1),
        bombs: +(acc.bomb / N).toFixed(1),
        enemies: +(acc.enemies / N).toFixed(1),
        enemiesPerRoom: acc.normalRooms ? +(acc.enemies / acc.normalRooms).toFixed(1) : 0,
        hpScale: +(acc.hpScale / N).toFixed(2),
        power: +(acc.power / N).toFixed(2),
        threat: acc.diff.threat, mult: acc.diff.mult, count: acc.diff.count, tag: acc.diff.tag
      });
    }

    /* ---------- 10. 难度公式与节流参数 ---------- */
    const diffParams = {
      POWER_BASE: POWER_BASE, DIFF_POW: DIFF_POW, DIFF_CNT_POW: DIFF_CNT_POW,
      DIFF_MAX: DIFF_MAX, DIFF_MIN: DIFF_MIN,
      countMin: 0.85, countMax: 1.5,
      formula: 'threat = power / POWER_BASE；血量 mult = clamp(threat^DIFF_POW, DIFF_MIN, DIFF_MAX)；数量 count = clamp(threat^DIFF_CNT_POW, 0.85, 1.5)',
      powerFormula: (G.powerScore.toString().match(/const v = ([\s\S]*?);\s*return/) || [, ''])[1].replace(/\s+/g, ' ').trim(),
      tags: 'mult ≤0.95 缓 / ≤1.15 平 / ≤1.5 险 / ≤2.0 危 / >2.0 绝',
      LOOT_DECAY: LOOT_DECAY,
      lootFormula: 'scale = LOOT_DECAY^(层-1)；心血掉率、灵力珠掉率与单颗量、精英必掉量、Boss 转阶段单颗量 全部 × scale'
    };
    // 难度对照：给定实力分，各档 mult / count
    const curve = [1.0, 1.5, 2, 3, 4, 6, 8, 12, 20].map(pw => {
      const d = difficultyOf(1, pw);
      return { power: pw, threat: d.threat, mult: d.mult, count: d.count, tag: d.tag };
    });
    // 产出衰减对照：各层的 scale，以及心血（满血 / 濒死）与普通灵力珠的期望
    const lootCurve = [1, 2, 3, 4, 5, 6].map(d => {
      const s = lootScale(d);
      const enemyHp = 40;                                 // 取一只中层妖物作样本
      return {
        depth: d, scale: +s.toFixed(3),
        heartFull: +(0.02 * s).toFixed(4),
        heartCritical: +(0.24 * s).toFixed(4),
        mpRate: +(MP_DROP_RATE * s).toFixed(4),
        mpAmt: Math.max(1, Math.min(8, Math.round(enemyHp / 6 * s))),
        mpElite: Math.max(1, Math.round(MP_ELITE_DROP * s)),
        mpBoss: Math.max(1, Math.round(MP_BOSS_PHASE * s))
      };
    });

    /* ---------- 11. 技能（小技能 / 专属 / 升级路线） ---------- */
    const skills = Object.keys(SKILL_DEF).map(id => {
      const d = SKILL_DEF[id];
      return {
        id: id, name: d.name, en: d.en, cost: d.cost, maxLv: SKILL_MAX_LV,
        vals: d.vals.slice(),
        // 各等级的独立冷却（帧）
        cd: d.cd ? d.cd.slice() : null,
        dur: d.dur || null,                 // 护体金光：护盾持续帧数
        // 1~5 级各自的说明文案
        descs: d.vals.map((_, i) => d.desc(i + 1)),
        shopSlot: 4
      };
    });
    const ults = Object.keys(ULT_DEF).map(k => {
      const U = ULT_DEF[k];
      return { id: U.id, style: U.style, name: U.name, en: U.en, desc: U.desc, cd: U.cd || ULT_CD_BASE, base: U.base };
    });
    const ultPaths = [];
    for (const st of Object.keys(ULT_PATH)) {
      for (const p of ULT_PATH[st]) {
        ultPaths.push({
          style: st, id: p.id, name: p.name, en: p.en, maxLv: ULT_PATH_MAX,
          // mode:'kill' = 击杀返还（不在释放时扣减）；null = 释放时固定扣减
          mode: p.mode || null,
          vals: p.val.slice(), dur: p.dur ? p.dur.slice() : null, descs: p.descs.slice()
        });
      }
    }
    const skillConst = {
      MP_MAX: MP_MAX, MP_REGEN: MP_REGEN, MP_START: MP_START,
      MP_DROP_RATE: MP_DROP_RATE, MP_ELITE_DROP: MP_ELITE_DROP, MP_BOSS_PHASE: MP_BOSS_PHASE,
      SLOT_COUNT: SLOT_COUNT, SKILL_MAX_LV: SKILL_MAX_LV, SKILL_GCD: SKILL_GCD,
      ULT_CD_BASE: ULT_CD_BASE, ULT_CD_MIN: ULT_CD_MIN, ULT_PATH_MAX: ULT_PATH_MAX,
      BOSS_P1_LIMIT: BOSS_P1_LIMIT,               // 头目一阶段软时限（帧）
      WJ: WJ,                                     // 舞剑「剑影三叠」的机制常量（蓄势 / 突进 / 连段 / 五连斩）
      // 开局自然回复为 0，涓流全靠「回灵符」法宝（每份 +1/秒）；为 0 时不给帧数，免得导出成 Infinity
      mpRegenPerCopy: 1,
      mpTickFrames: MP_REGEN > 0 ? Math.round(60 / MP_REGEN) : 0,
      SHIELD_DUR: SKILL_DEF.huti.dur             // 限时护盾（仅护体金光）的持续帧数
    };

    return { player, items, enemies, elites, bosses, challenge, styles, charge, shopPrices, pools, floors,
             diffParams, curve, lootCurve, skills, ults, ultPaths, skillConst };
  }, { ENEMY_CN, AI_CN, PERK_CN, ENEMY_NOTE, BOLT_CN, BOSS_GIMMICK });

  data.exportedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
  data.errs = errs;
  fs.writeFileSync(OUT, JSON.stringify(data, null, 1), 'utf8');
  console.log('已导出 ' + OUT);
  console.log('  法宝 ' + data.items.filter(i => i.type === 'fabao').length
    + ' / 丹药 ' + data.items.filter(i => i.type === 'dan').length
    + ' / 功法 ' + data.items.filter(i => i.type === 'gongfa').length
    + ' / 妖物 ' + data.enemies.length
    + ' / 精英 ' + data.elites.length);
  if (errs.length) console.log('  ⚠ 页面报错：' + errs.join(' | '));
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
