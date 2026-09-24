/* ============================================================
 *  法宝融合（第 3 期）
 *
 *  设计要点（与用户 2026-09-24 拍板一致）：
 *  1) **发现自动、执行手动**。发现是白送的：手里同时持有 A、B 且 (A,B) 有配方，
 *     HUD 的法宝图标行会给这一对描上共鸣光晕，悬停即见产物名。
 *     执行必须走到「融合阵」前按 E —— 复用本作既有的交互词法（祭坛/金匣/坊市同款）。
 *     ⚠️ 边界：「能不能融」永远可见，「融出来是什么」才隐藏。25 件法宝 = 300 种组合，
 *        若连可融性都不显示，玩家就是在盲选 —— 功能等于不存在。
 *  2) **首次融合隐藏产物**：名字、数值、效果全显示为 ？？？，合成过一次之后
 *     跨局永久解锁（图鉴 localStorage），之后每次都完整显示。
 *     这让同一个配方产生两种体验：首次是 discovery，之后是 building block。
 *  3) **锁得住**：融合不可逆、没有拆分；产物是新 id，不能再融进别的配方（一阶）。
 *  4) ⚠️ **材料被吃掉，它加过的 stats 必须能撤销** —— 见 Player.recomputeStats()。
 *     这是本次唯一的架构级改动：`give()` 是即时生效且不可逆的，
 *     所以融合前必须按「持有列表」把 stats 整体重算一遍。
 *
 *  扩展位（**接口已留好，内容都还没做**）：
 *  - 二阶（A+B→C，C+D→E）：把某条产物的 id 写进另一条的 a / b 即可，无需改代码。
 *  - 催化剂（第三样材料）：配方加 `cat: '某id'` 字段；面板与消耗逻辑读法已预留，
 *    但当前没有配方用它，所以界面上不会出现第三格。
 * ============================================================ */

/* ---------- 融合产物 ----------
   与普通法宝同构（type:'fabao'），但带 fusion:true。
   poolByType() 会把它排除在随机池外 —— 只能靠融合得到，掉落/商店/金匣都抽不到。 */
const FUSION_ITEMS = [
  { id: 'leiji', name: '雷殛剑', type: 'fabao', fusion: true, icon: 'fused',
    c1: PAL.cyan, c2: PAL.gold,
    desc: '飞剑命中处留下一道雷池，持续电击范围内的妖物',
    apply: p => {
      p.stats.damage += 1; p.stats.chain += 1;
      p.stats.fus.leichi = 1.2;
    } },

  { id: 'binghuo', name: '冰火两仪', type: 'fabao', fusion: true, icon: 'fused',
    c1: PAL.fire, c2: PAL.cyan,
    desc: '命中「既已冰封、又已点燃」的妖物时引爆，向四周迸发冲击',
    apply: p => {
      p.stats.frost += 1; p.stats.burn += 2;
      p.stats.fus.detonate = 12;
    } },

  { id: 'taixu_yuyi', name: '太虚羽衣', type: 'fabao', fusion: true, icon: 'shield2',
    c1: PAL.jade, c2: PAL.white,
    desc: '护盾替你挡下一击而破时，把这份冲击化作环形剑气还回去',
    apply: p => {
      p.shield += 2;
      p.stats.speed *= 1.05;
      p.stats.fus.shieldBreak = 1;
    } },

  { id: 'wangui', name: '万剑归宗', type: 'fabao', fusion: true, icon: 'fused',
    c1: PAL.purpleL, c2: PAL.jadeL,
    desc: '一次射出的散剑各自锁定不同的妖物，不再挤在同一条线上',
    apply: p => {
      p.stats.spread += 6; p.stats.homing += 0.10;
      p.stats.fus.splitAim = 1;
    } },

  { id: 'shehunting', name: '摄魂铃', type: 'fabao', fusion: true, icon: 'bell',
    c1: PAL.purple, c2: PAL.gold,
    desc: '击杀妖物时，其魂魄化为一枚追敌的魂弹自动射出',
    apply: p => {
      p.stats.knockback += 2.2; p.stats.soul += 1;
      p.stats.fus.soulShot = 1;
    } },

  { id: 'guanling', name: '贯灵梭', type: 'fabao', fusion: true, icon: 'needle',
    c1: PAL.cyan, c2: PAL.jadeL,
    desc: '每多穿透一个妖物，这一击就更重一分 —— 排成一列时最痛',
    apply: p => {
      p.stats.pierce += 2; p.stats.fireRate *= 1.35;
      p.stats.fus.ramp = 0.35;
    } },

  /* ---------- 第二批：让每件法宝都有 2~3 条路可选 ----------
     用户 2026-09-24：「一个只能对应一个太可惜了」。
     一件法宝只有一条配方 = 没有选择（凑齐即唯一解）；有了 2~3 条，
     「融哪个」才成为真正的决策。下面这些刻意让 引雷符 / 赤焰符 / 太虚护盾
     等成为**枢纽**（degree 3），其余多为 2。 */

  /* 金刚不坏 + 玄元镜：两件都是「挨打时才生效」的防御件 → 把防御变成反击 */
  { id: 'jingangjing', name: '金刚玄镜', type: 'fabao', fusion: true, icon: 'fused',
    c1: PAL.gold, c2: PAL.cyan,
    desc: '受创即迸发一圈罡气，把近旁的妖物震开并震伤',
    apply: p => {
      p.stats.iframe += 40; p.stats.deflect += 1;
      p.stats.fus.revenge = 1;
    } },

  /* 天眼通 + 尸毒珠：看清弱点 + 死后放毒 → 让暴击点燃目标 */
  { id: 'dongming', name: '洞冥珠', type: 'fabao', fusion: true, icon: 'eye',
    c1: PAL.purpleL, c2: PAL.green,
    desc: '暴击命中会点燃目标，且火势比寻常灼烧更旺',
    apply: p => {
      p.stats.crit += 0.12; p.stats.poison += 1;
      p.stats.fus.critBurn = 1;
    } },

  /* 风行靴 + 祥云履：两件位移件 → 让「移动」本身变成一种可积攒的资源 */
  { id: 'yufeng', name: '御风踏云', type: 'fabao', fusion: true, icon: 'cloud',
    c1: PAL.cyan, c2: PAL.white,
    desc: '奔走时积攒风势，攒满后下一次出手甩出一道风刃',
    apply: p => {
      p.stats.speed *= 1.44;
      p.stats.fus.wind = 1;
    } },

  /* 回灵符 + 聚灵阵：一个管灵力、一个管灵石 → 把经济系统接到技能系统上 */
  { id: 'lingmai', name: '灵脉', type: 'fabao', fusion: true, icon: 'coin',
    c1: PAL.jade, c2: PAL.cyan,
    desc: '每拾取一颗灵石，同时回复 1 点灵力 —— 捡钱就是回蓝',
    apply: p => {
      p.stats.regen += 1; p.stats.greed += 2;
      p.stats.fus.coinMp = 1;
    } },

  /* 引雷符 + 玄冰符：雷与冰同源（都是「天象」），交会处冻结 */
  { id: 'shuanglei', name: '霜雷', type: 'fabao', fusion: true, icon: 'fused',
    c1: PAL.cyan, c2: PAL.jadeL,
    desc: '雷击的同时冻住目标及其周围的妖物',
    apply: p => {
      p.stats.chain += 1; p.stats.frost += 1;
      p.stats.fus.frostBolt = 1;
    } },

  /* 引雷符 + 赤焰符：雷落处起火
     ⚠️ 配色别和「赤焰符」一致（flame + fire/gold 是它本人）——
        审计里有一条「同形状 + 同配色 = 同一位图」的断言，撞了会被拦下。
        这里雷在前、火在后，和赤焰符的「火 + 金」明确区分。 */
  { id: 'leihuo', name: '雷火焚天', type: 'fabao', fusion: true, icon: 'flame',
    c1: PAL.cyan, c2: PAL.fire,
    desc: '被雷击中的目标会同时被点燃',
    apply: p => {
      p.stats.chain += 1; p.stats.burn += 2;
      p.stats.fus.boltBurn = 1;
    } },

  /* 赤焰符 + 尸毒珠：击杀时毒雾被点着，炸成一片火海 */
  { id: 'fendu', name: '焚毒', type: 'fabao', fusion: true, icon: 'orb',
    c1: PAL.fire, c2: PAL.green,
    desc: '击杀时毒雾与火海同时炸开，火海范围更广',
    apply: p => {
      p.stats.burn += 2; p.stats.poison += 1;
      p.stats.fus.ignitePoison = 1;
    } },

  /* 太虚护盾 + 玄元镜：击落的敌方术法被护盾吸收，化为护盾本身 */
  { id: 'taixujing', name: '太虚镜', type: 'fabao', fusion: true, icon: 'mirror',
    c1: PAL.jade, c2: PAL.cyan,
    desc: '击落的敌方法术被护盾吸收，化为 1 格护盾',
    apply: p => {
      p.stats.deflect += 1; p.shield += 1;
      p.stats.fus.deflectShield = 1;
    } },

  /* 乾坤袋 + 聚灵阵：气运 + 财气 → 灵石有机会变成钥匙 */
  { id: 'jubaopen', name: '聚宝盆', type: 'fabao', fusion: true, icon: 'bag',
    c1: PAL.gold, c2: PAL.jade,
    desc: '灵石掉落大幅增加，且每颗灵石有小半概率变成一把钥匙',
    apply: p => {
      p.stats.greed += 4; p.stats.luck += 3;
      p.stats.fus.coinKey = 1;
    } },

  /* 御剑术·三重 + 灵犀玉佩：散剑不再列成固定扇形 —— 把「可预判」换成「难躲」 */
  { id: 'luanpifeng', name: '乱披风', type: 'fabao', fusion: true, icon: 'needle',
    c1: PAL.jadeL, c2: PAL.cyan,
    desc: '散剑不再列成固定扇形 —— 每次出手的弧度都不同，近身难躲全中',
    apply: p => {
      p.stats.spread += 2; p.stats.fireRate *= 1.35;
      p.stats.fus.wildArc = 1;
    } }
];

/* ---------- 配方表 ----------
   a / b 是材料 id（各需 1 件；a === b 时表示需要两件同一法宝）。
   out 是产物 id。每条都必须是**真融合**：产生新机制 / 打破原有约束 / 改变行为方式。
   判据（写进 ROADMAP）：**如果说明能用「伤害 +X%」写完，它就是假的。** */
const FUSION_DEF = [
  { id: 'leiji',      a: 'qingfeng', b: 'leifu'    },
  { id: 'binghuo',    a: 'hanbing',  b: 'chiyan'   },
  { id: 'taixu_yuyi', a: 'taixu',    b: 'yuyi'     },
  { id: 'wangui',     a: 'hunyuan',  b: 'fenying'  },
  { id: 'shehunting', a: 'zhenhun',  b: 'shehun'   },
  { id: 'guanling',   a: 'chuanyun', b: 'lingxi'   },

  /* ---------- 第二批（2026-09-24）：把「一对一」扩成「一对 2~3」 ----------
     一件法宝只有一条配方 = 凑齐即唯一解 = 没有决策。
     这批刻意让 引雷符 / 赤焰符（degree 3）、太虚护盾 / 玄元镜 / 尸毒珠 /
     玄冰符 / 灵犀玉佩 / 聚灵阵（degree 2）成为枢纽 ——
     「我手里这对，融还是留给下一对」这才成立。
     ⚠️ 每条仍然必须产出新机制（判据：能用「伤害 +X%」写完的就是伪融合）。 */
  { id: 'jingangjing', a: 'jingang',  b: 'xuanyuan' },   // 防御帧 → 反击
  { id: 'dongming',    a: 'tianyan',  b: 'shidu'    },   // 暴击 → 点燃
  { id: 'yufeng',      a: 'fengxing', b: 'xiangyun' },   // 移动 → 攻击资源
  { id: 'lingmai',     a: 'huiling',  b: 'juling'   },   // 经济 → 灵力
  { id: 'shuanglei',   a: 'leifu',    b: 'hanbing'  },   // 雷 → 冻结
  { id: 'leihuo',      a: 'leifu',    b: 'chiyan'   },   // 雷 → 点燃
  { id: 'fendu',       a: 'chiyan',   b: 'shidu'    },   // 毒 → 火海
  { id: 'taixujing',   a: 'taixu',    b: 'xuanyuan' },   // 击落 → 补盾
  { id: 'jubaopen',    a: 'qiankun',  b: 'juling'   },   // 灵石 → 钥匙
  { id: 'luanpifeng',  a: 'yujian',   b: 'lingxi'   }    // 固定扇形 → 乱弧
];

/* ---------- 图鉴（跨局永久解锁）----------
   存取照 ENDLESS_BEST_KEY 的写法（loadEndlessBest / saveEndlessBest）。
   ⚠️ 只有**融合阵里的显式确认**才写这里 —— 挑战模式与无尽模式的初始配装
      都是随机 give() 一堆法宝，那些绝不能解锁图鉴，否则玩家啥也没融图鉴就开了。 */
const FUSION_KEY = 'xiuxian-isaac.fusion.v1';
const FusionCodex = {
  _c: null,
  all() {
    if (this._c) return this._c;
    let a = [];
    try { a = JSON.parse(localStorage.getItem(FUSION_KEY) || '[]'); } catch (e) { a = []; }
    if (!Array.isArray(a)) a = [];
    this._c = a;
    return a;
  },
  has(id) { return this.all().indexOf(id) >= 0; },
  /* 收录一条配方，返回「是不是首次」（首次 = 演出要揭示 + 播收录提示） */
  unlock(id) {
    const a = this.all();
    if (a.indexOf(id) >= 0) return false;
    a.push(id);                                   // all() 返回的就是缓存数组本身
    try { localStorage.setItem(FUSION_KEY, JSON.stringify(a)); } catch (e) { }
    return true;
  },
  count() { return this.all().length; },
  /* 测试与「清档」用 */
  reset() {
    this._c = [];
    try { localStorage.removeItem(FUSION_KEY); } catch (e) { }
  }
};

/* ---------- 查表 ---------- */

/* 两件法宝能不能融？顺序无关。返回配方或 null。 */
function fusionRecipeOf(a, b) {
  if (!a || !b) return null;
  for (const r of FUSION_DEF) {
    if ((r.a === a && r.b === b) || (r.a === b && r.b === a)) return r;
  }
  return null;
}

/* 这件法宝能与哪些法宝相融（用于面板画「谁亮谁灰」与 HUD 的共鸣光晕） */
function fusionsWith(id) {
  const out = [];
  for (const r of FUSION_DEF) {
    if (r.a === id) out.push({ recipe: r, other: r.b });
    else if (r.b === id) out.push({ recipe: r, other: r.a });
  }
  return out;
}

/* 产物 id → 配方（图鉴页要按配方列，而不是按产物列） */
function fusionDefOf(outId) {
  for (const r of FUSION_DEF) if (r.id === outId) return r;
  return null;
}

/* 单件配方需要的材料数（a === b 时要两件） */
function fusionNeed(recipe, id) {
  return (recipe.a === id ? 1 : 0) + (recipe.b === id ? 1 : 0);
}

/* 玩家现在能不能凑出这条配方（数量够不够） */
function fusionReady(recipe, items) {
  const cnt = {};
  for (const i of items) cnt[i] = (cnt[i] || 0) + 1;
  return (cnt[recipe.a] || 0) >= fusionNeed(recipe, recipe.a)
      && (cnt[recipe.b] || 0) >= fusionNeed(recipe, recipe.b);
}

/* ---------- 执行 ---------- */

/* 把两件材料换成产物。返回 { ok, first, out, recipe } ——
   first 为 true 表示这是该配方的首次合成（演出要揭示 + 收录图鉴）。
   调用方负责演出与提示；这里只做「判定 + 扣材料 + 给产物 + 写图鉴」。 */
function fusionExecute(g, idA, idB) {
  const r = fusionRecipeOf(idA, idB);
  if (!r) return { ok: false, why: '这两件之间没有机缘' };
  const pl = g.player;
  if (!fusionReady(r, pl.items)) return { ok: false, why: '材料不足' };

  /* 先扣材料，再重算 —— 顺序不能反：重算是按 items 列表推的 */
  const drop = (id, n) => {
    for (let k = 0; k < n; k++) {
      const i = pl.items.indexOf(id);
      if (i >= 0) pl.items.splice(i, 1);
    }
  };
  drop(r.a, fusionNeed(r, r.a));
  drop(r.b, fusionNeed(r, r.b));
  pl.recomputeStats(g.style);

  const first = FusionCodex.unlock(r.id);
  /* ⚠️ 产物 id 就是 r.id（配方以产物命名），不是 r.out —— 
     这里曾写成 r.out，结果是 give(undefined) 静默返回：材料照扣、产物不给了。 */
  pl.give(r.id, g);                  // 产物走正常通道：图标、弹窗、进阶文案全都自动生效
  return { ok: true, first: first, out: r.id, recipe: r };
}

/* 「风势」蓄满所需的移动距离（像素）。御风踏云用。
   260px 约等于横穿大半间石室 —— 只要在走就会攒满，但站着不动永远攒不出，
   所以它奖励的是「边走边打」，而不是站桩。 */
const WIND_MAX = 260;

/* ---------- 战斗钩子 ----------
   全部集中在这里，entities.js 只留几处一行调用 ——
   融合玩法的新机制不该散进战斗代码里。每加一个机制，先问
   「能不能落到已有的钩子上」，落不下才新开一个（现有：
   命中 / 穿透递增 / 受创 / 破盾 / 击杀 / 拾取灵石 / 移动 / 击落 / 发射时）。 */

const Fusion = {
  /* 每帧的限流计时。由 Player.update 的逐帧计时区调用。 */
  tick(pl) {
    if (pl._deflectShieldCd > 0) pl._deflectShieldCd--;
  },
  /* 飞剑命中一个妖物。在 e.hurt() 之后调用（此时 b.hit 已含本目标）。
     b.fus 是发射时从 stats.fus 抄到弹上的机制表。 */
  onHit(e, b, g) {
    const F = b && b.fus;
    if (!F) return;

    /* 雷殛剑：命中处留一道雷池（friendly Hazard 打敌人）。
       伤害口径：friendly Hazard 每帧结算 dmg/12，所以 life×dmg/12 = 总伤。
       life 60 帧（1 秒）、dmg 1.2 → 总伤 6。 */
    if (F.leichi) {
      g.hazards.push(new Hazard(e.x, e.y, 26, 0, 60, F.leichi * (b.dmg / 4), PAL.cyan, true));
    }

    /* 冰火两仪：目标「既冰且燃」时引爆 —— 本件自带冰与灼烧，
       所以对同一个目标的第二下就会引爆，形成「点着→炸」的短循环。
       引爆会清掉状态，避免每帧连爆。 */
    if (F.detonate && e.frost > 0 && e.burn > 0) {
      e.frost = 0; e.burn = 0; e.burnDmg = 0;
      g.hazards.push(new Hazard(e.x, e.y, 46, 0, 14, F.detonate * (b.dmg / 4), PAL.fire, true));
      g.burst(e.x, e.y, 24, PAL.orange);
      g.shake(4);
      SFX.thunder();
    }

    /* 雷火焚天：命中即点燃（不需要暴击） */
    if (F.boltBurn) {
      e.burn = Math.max(e.burn, 150);
      e.burnDmg = Math.max(e.burnDmg || 0, F.boltBurn * 1.5);
    }

    /* 洞冥珠：暴击命中的灼烧格外旺 —— 火势按这一发的伤害折算 */
    if (F.critBurn && b.crit) {
      e.burn = Math.max(e.burn, 190);
      e.burnDmg = Math.max(e.burnDmg || 0, b.dmg * 0.9);
    }

    /* 霜雷：雷击的同时把目标**连同它周围**一起冻住。
       ⚠️ 别把主目标排除在外（跳过 o === e 的那种写法）——
          被直接打中的那只反而不冻，读起来毫无道理。测试撞到过这一条。 */
    if (F.frostBolt) {
      for (const o of g.enemies) {
        if (o.dead) continue;
        if (Math.hypot(o.x - e.x, o.y - e.y) < 56) o.frost = Math.max(o.frost, 90);
      }
      g.burst(e.x, e.y, 10, PAL.cyan);
    }
  },

  /* 受创即反震（金刚玄镜）：挂一圈罡气在玩家身上，持续到无敌帧结束。
     用 Hazard 而不是逐妖判定 —— Hazard 已经有「每帧结算、打敌人」的现成逻辑，
     半径给到 52 就够把贴上来的妖物推开。 */
  onHurt(pl, g) {
    const F = pl.stats.fus;
    if (!F || !F.revenge) return;
    g.hazards.push(new Hazard(pl.x, pl.y, 52, 0, 18, 10, PAL.goldL, true));
    g.burst(pl.x, pl.y, 22, PAL.goldL);
    g.shake(5);
  },

  /* 拾取灵石（灵脉 / 聚宝盆）。n = 这一颗的面值 */
  onCoin(g, n) {
    const pl = g.player;
    if (!pl || !pl.stats.fus) return;
    const F = pl.stats.fus;
    /* 灵脉：捡钱就是回蓝 —— 把经济系统接到技能系统上 */
    if (F.coinMp) {
      pl.mp = Math.min(pl.maxMP, pl.mp + n);
      g.floaters.push(new Floater(pl.x, pl.y - 26, 'MP +' + n, PAL.cyan));
    }
    /* 聚宝盆：每颗灵石有四成概率变成一把钥匙 */
    if (F.coinKey && Math.random() < 0.4) {
      g.keys++;
      g.floaters.push(new Floater(pl.x, pl.y - 36, 'KEY', PAL.gold));
      SFX.pickup();
    }
  },

  /* 风势（御风踏云）：移动时按位移积攒，攒满后由 takeWind 取走 */
  onMove(pl, moved) {
    const F = pl.stats.fus;
    if (!F || !F.wind) return;
    pl.windT = Math.min(WIND_MAX, (pl.windT || 0) + moved);
  },
  /* 取用风势：满了就消耗掉并返回 true（调用方负责甩风刃） */
  takeWind(pl) {
    const F = pl.stats.fus;
    if (!F || !F.wind) return false;
    if ((pl.windT || 0) < WIND_MAX) return false;
    pl.windT = 0;
    return true;
  },
  windRatio(pl) {
    return Math.min(1, (pl && pl.windT || 0) / WIND_MAX);
  },

  /* 击落敌弹（太虚镜）：化为 1 格护盾。
     限流：一拍内击落多枚只补 1 格，否则弹幕房会变成刷盾机。 */
  onDeflect(pl, g) {
    const F = pl.stats.fus;
    if (!F || !F.deflectShield) return;
    if ((pl._deflectShieldCd || 0) > 0) return;
    pl._deflectShieldCd = 20;
    pl.addShield(1);
    g.floaters.push(new Floater(pl.x, pl.y - 26, 'SHIELD', PAL.jadeL));
  },

  /* 每次出手的扇形弧度（乱披风）：固定扇形 → 随机乱弧 */
  spreadArcOf(F, base) {
    if (!F || !F.wildArc) return base;
    return base * (0.4 + Math.random() * 1.8);
  },

  /* 飞剑被「穿透递增」加权：第 n 个目标吃 ×(1 + (n-1)×ramp)。
     在伤害结算前调用，n 从 1 起（本目标就是第 n 个）。 */
  rampMul(b, n) {
    const F = b && b.fus;
    if (!F || !F.ramp) return 1;
    return 1 + Math.max(0, n - 1) * F.ramp;
  },

  /* 护盾被击破的那一下（盾从 0→破）。把这份冲击还回去。 */
  onShieldBreak(pl, g) {
    const F = pl.stats.fus;
    if (!F || !F.shieldBreak) return;
    const r = 74;
    g.hazards.push(new Hazard(pl.x, pl.y, r, 0, 12, 12, PAL.jadeL, true));
    g.burst(pl.x, pl.y, 28, PAL.jadeL);
    g.shake(6);
    SFX.thunder();
  },

  /* 妖物被击杀。摄魂铃：魂魄化为一枚追敌的魂弹。
     焚毒：毒雾（尸毒珠的效果）与火海在同一处炸开 —— 毒被点着了。 */
  onKill(e, g) {
    const pl = g.player;
    if (!pl || !pl.stats.fus) return;
    const F = pl.stats.fus;

    /* 焚毒：范围比尸毒珠自己那圈更大，颜色用火色以便和绿雾分开 */
    if (F.ignitePoison && pl.stats.poison > 0) {
      const k = Math.max(0, pl.stats.poison - 1);
      g.hazards.push(new Hazard(e.x, e.y, 40 + k * 8, 0, 120 + k * 30, 1.6 + k * 0.5, PAL.fire, true));
      g.burst(e.x, e.y, 16, PAL.orange);
    }

    if (!F.soulShot) return;
    if (e.small) return;                          // 随从/魂火之类的小杂兵不触发，免得刷屏
    const a = Math.random() * Math.PI * 2;
    const sp = 4.2;
    g.bullets.push(new Bullet(
      e.x + Math.cos(a) * 8, e.y + Math.sin(a) * 8,
      Math.cos(a) * sp, Math.sin(a) * sp,
      {
        friendly: true, dmg: pl.stats.damage * 0.8, r: 4, life: 90,
        homing: 0.16, homingRange: 240, pierce: 1,
        kind: 'sword', sprite: SPR.sword, scale: 0.7, soul: true
      }
    ));
    g.burst(e.x, e.y, 8, PAL.purpleL);
  }
};
