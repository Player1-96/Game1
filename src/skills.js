'use strict';
/* ============================================================
 *  skills.js —— 小技能 / 专属技能 / 升级路线
 *
 *  小技能（原「功法」）：最多存 3 个，按 1/2/3 切换、Q 释放，消耗灵力。
 *                       重复拾到同一个 → 升 1 级（上限 5 级，仅增强不涨价）。
 *                       槽位已满又拾到新的 → 弹出替换界面，换上的从 1 级起算。
 *  专属技能：空格释放。飞剑 / 巨剑流首次斩杀精英自动获得（基础冷却 30 秒）；
 *            舞剑流是纯近战，开局即自带（基础冷却 15 秒，见 ULT_DEF.wujian.cd）。
 *            之后再斩精英 → 三选一升级（每条路线 3 级）。
 *
 *  本文件只放数据与纯逻辑，具体释放效果写在 cast() 里，
 *  需要的全局（SPR / Bullet / PAL …）在运行时才求值，故加载顺序无关紧要。
 * ============================================================ */

/* ---------------- 常量 ---------------- */
const MP_MAX = 100;        // 灵力上限
// 开局自然回复为 0：灵力是一份「要跑去拿」的资源，不是自动回的计时器。
// 想要涓流回蓝，得去捡法宝「回灵符」——每份 +1 点/秒，可叠加。
const MP_REGEN = 0;        // 开局每秒自然回复
const MP_DROP_RATE = 0.62; // 斩杀普通妖物掉落灵力珠的概率
const MP_ELITE_DROP = 18;  // 精英必掉，且给一大颗
const MP_BOSS_PHASE = 10;  // Boss 每次转阶段外溢的灵力（分 3 颗散落）
const MP_START = 40;       // 开局灵力
const SLOT_COUNT = 3;      // 小技能槽位数
const SKILL_MAX_LV = 5;    // 小技能满级
const SKILL_GCD = 30;      // 小技能公共冷却（帧）——只防连点，不限制节奏
const ULT_CD_BASE = 1800;  // 专属技能基础冷却 30 秒（单个流派可在 ULT_DEF 里用 cd 覆盖）
const ULT_CD_MIN = 480;    // 冷却下限 8 秒：升级路线怎么叠都不许短过这条线
const ULT_PATH_MAX = 3;    // 每条升级路线的上限等级

/* ------------------------------------------------------------
 *  舞剑流 · 蓄力突进（专属技能「剑影三叠」的机制参数）
 *  按住空格蓄势 → 松手朝指针突进斩击。突进全程无敌；
 *  蓄势期间被击中则剑势溃散，技能立刻进入冷却（最痛的一环）。
 *  命中后连段窗口内可立即接下一段：二段伤害 = 一段 ×1.2，
 *  三段在二段基础上必定暴击（×2）并化作五连斩。
 * ---------------------------------------------------------- */
const WJ = {
  charge: 24,        // 蓄满所需帧数（0.4 秒）
  chargeMin: 3,      // 只挡误触：再短就不算一次出招（低于 50ms 的点击）
  dash: 185,         // 蓄满时的突进距离（像素）：够横穿大半间石室、穿过尊者
  dashMin: 74,       // 刚够 chargeMin 就松手的突进距离：一记中等步幅的突进
  dur: 24,           // 蓄满时的突进帧数（0.4 秒）
  durMin: 11,        // 最短突进帧数 —— 与 dashMin 配出来的速度略慢于蓄满，冲刺感一致
  reach: 30,         // 突进途中剑锋的触及半径
  dmgMul: 2.0,       // 一段伤害 = 伤害 × 该倍率（约合平A 的 1.8 刀）
  s2Mul: 1.2,        // 二段在一段基础上 +20%
  s3Hits: 5,         // 三段化作五连斩
  s3Crit: 2,         // 三段必定暴击的倍率
  chain: 84,         // 连段窗口（帧）：命中后必须在此之内接下一段，否则连招归零
  flurryR: 62,       // 五连斩的收尾攻击半径
  flurryGap: 4,      // 五连斩每段之间的间隔帧数
  flurryGrace: 15    // 五连斩收招后的余韵无敌（帧）：砍完不至于当场被围殴按死
};

/* 舞剑流突进：蓄势时长 → 蓄势比例（0 = 刚够下限，1 = 蓄满）。
   两端分别是 dashMin 与 dash ×（1 + 剑势绵长），距离与帧数都按它插值。
   归一化的起点是 chargeMin 而非 0，这样「刚够下限就松手」恰好是 dashMin 那一档。
   落点预览（game.js 的 drawWujianFX）与实际突进共用这两个函数，避免两处公式漂移。 */
function wjDashK(charged) {
  return clamp((charged - WJ.chargeMin) / (WJ.charge - WJ.chargeMin), 0, 1);
}
function wjDashLen(pl, charged) {
  const mul = 1 + ((pl && pl.ult) ? ultPathVal(pl.ult, 'wujian', 'reach') : 0);
  return WJ.dashMin + (WJ.dash * mul - WJ.dashMin) * wjDashK(charged);
}

/* ------------------------------------------------------------
 *  小技能
 *  cost —— 灵力消耗（固定，不随等级上涨，保证升级是纯正反馈）
 *  cd   —— 各等级的独立冷却（帧，60 = 1 秒）。每个技能各有一份，互不共享，
 *          只靠 0.5 秒公共 GCD + 灵力是拦不住连放的（尤其无敌类会直接无敌通关）。
 *  vals —— 1~5 级的主数值，索引 = 等级-1
 *  cast(g, lv) —— 释放效果
 * ---------------------------------------------------------- */
const SKILL_DEF = {
  tianlei: {
    id: 'tianlei', name: '天雷引', en: 'THUNDER', icon: 'thunder',
    c1: PAL.gold, c2: PAL.cyan, cost: 35,
    vals: [14, 20, 26, 32, 38],
    cd: [360, 330, 300, 270, 240],          // 6.0 → 4.0 秒
    desc: lv => '召九霄神雷，重创全室妖物　伤害 ' + (SKILL_DEF.tianlei.vals[lv - 1] + 14) + '（另加伤害 ×2）'
      + '　冷却 ' + (SKILL_DEF.tianlei.cd[lv - 1] / 60).toFixed(1) + ' 秒',
    cast(g, lv) {
      const dmg = SKILL_DEF.tianlei.vals[lv - 1] + g.player.stats.damage * 2;
      SFX.thunder(); g.shake(12);
      for (const e of g.enemies) {
        if (e.dead) continue;
        e.hurt(dmg, g);
        g.zaps.push({ x1: e.x, y1: 0, x2: e.x, y2: e.y, life: 16 });
        g.burst(e.x, e.y, 12, PAL.cyan);
      }
      for (let i = 0; i < 40; i++) g.particles.push(new Particle(Math.random() * ROOM_W, 0, 0, 4 + Math.random() * 4, 30, PAL.cyan, 2, 0));
    }
  },
  suodi: {
    id: 'suodi', name: '缩地成寸', en: 'BLINK', icon: 'cloud',
    c1: PAL.jade, c2: PAL.white, cost: 18,
    vals: [60, 75, 90, 105, 120],      // 无敌帧数
    cd: [240, 222, 204, 186, 168],     // 4.0 → 2.8 秒
    desc: lv => '瞬移至灵气最盛处，短暂无敌 ' + (SKILL_DEF.suodi.vals[lv - 1] / 60).toFixed(1) + ' 秒'
      + (lv >= 3 ? '　落地震伤周身妖物' : '')
      + '　冷却 ' + (SKILL_DEF.suodi.cd[lv - 1] / 60).toFixed(1) + ' 秒',
    cast(g, lv) {
      const p = g.player;
      SFX.blink();
      g.burst(p.x, p.y, 20, PAL.jade);
      let bx = p.x, by = p.y, bd = -1;
      for (let i = 0; i < 60; i++) {
        const x = WALL_L + 20 + Math.random() * (WALL_R - WALL_L - 40);
        const y = WALL_T + 20 + Math.random() * (WALL_B - WALL_T - 40);
        let m = 9999;
        for (const e of g.enemies) if (!e.dead) m = Math.min(m, dist2(x, y, e.x, e.y));
        if (m > bd) { bd = m; bx = x; by = y; }
      }
      p.x = bx; p.y = by;
      p.invuln = Math.max(p.invuln, SKILL_DEF.suodi.vals[lv - 1]);
      g.burst(p.x, p.y, 20, PAL.jade);
      if (lv >= 3) {                    // 三阶起：落地震出一道冲击
        const dmg = 8 * (lv - 2);
        g.shake(6);
        for (const e of g.enemies) {
          if (e.dead) continue;
          if (dist2(e.x, e.y, p.x, p.y) < 110 * 110) {
            e.hurt(dmg, g);
            const a = Math.atan2(e.y - p.y, e.x - p.x);
            e.kbx += Math.cos(a) * 8; e.kby += Math.sin(a) * 8;
          }
        }
      }
    }
  },
  wuxing: {
    id: 'wuxing', name: '五行遁术', en: 'PHASE', icon: 'lotus',
    c1: PAL.purpleL, c2: PAL.gold, cost: 28,
    vals: [180, 225, 270, 315, 360],   // 无敌帧数
    cd: [540, 504, 468, 432, 396],     // 9.0 → 6.6 秒：无敌最久，冷却也最长
    desc: lv => '遁入五行，' + (SKILL_DEF.wuxing.vals[lv - 1] / 60).toFixed(1) + ' 秒内不染尘劫'
      + '　冷却 ' + (SKILL_DEF.wuxing.cd[lv - 1] / 60).toFixed(1) + ' 秒',
    cast(g, lv) {
      g.player.invuln = Math.max(g.player.invuln, SKILL_DEF.wuxing.vals[lv - 1]);
      g.floaters.push(new Floater(g.player.x, g.player.y - 24, 'WUXING', PAL.purpleL));
      g.burst(g.player.x, g.player.y, 24, PAL.purpleL);
      SFX.pickup();
    }
  },
  huti: {
    id: 'huti', name: '护体金光', en: 'AEGIS', icon: 'shield2',
    c1: PAL.gold, c2: PAL.goldL, cost: 24,
    vals: [2, 3, 3, 4, 4],             // 护盾层数（以往能一直叠到 6 层且不清空，等于不死）
    cd:   [600, 600, 600, 600, 600],   // 固定 10 秒：护盾再强也不能连开
    dur: 300,                          // 唯一的限时护盾：只维持 5 秒，到点自动散去
    desc: lv => '震退周身妖物并结 ' + SKILL_DEF.huti.vals[lv - 1] + ' 层护盾，'
      + (SKILL_DEF.huti.dur / 60) + ' 秒后消散'
      + '　范围 ' + (140 + (lv - 1) * 20) + '　伤害 ' + (6 + (lv - 1) * 3)
      + '　冷却 ' + (SKILL_DEF.huti.cd[lv - 1] / 60) + ' 秒',
    cast(g, lv) {
      const p = g.player, R = 140 + (lv - 1) * 20, dmg = 6 + (lv - 1) * 3;
      p.addShield(SKILL_DEF.huti.vals[lv - 1], SKILL_DEF.huti.dur);
      g.shake(8);
      for (const e of g.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < R) {
          const a = Math.atan2(e.y - p.y, e.x - p.x);
          e.kbx += Math.cos(a) * 12; e.kby += Math.sin(a) * 12;
          e.hurt(dmg, g);
        }
      }
      for (const b of g.bullets) if (!b.friendly) b.dead = true;
      g.burst(p.x, p.y, 30, PAL.gold);
      SFX.pickup();
    }
  },

  /* ---------------- 近战向：把场面拉到自己身上，或让剑够得更远 ---------------- */
  qinlong: {
    id: 'qinlong', name: '擒龙手', en: 'DRAGON', icon: 'hand',
    c1: PAL.jade, c2: PAL.white, cost: 20,
    vals: [120, 145, 170, 195, 220],        // 摄拿半径
    cd: [300, 276, 252, 228, 204],          // 5.0 → 3.4 秒
    desc: lv => '探掌摄拿，把 ' + SKILL_DEF.qinlong.vals[lv - 1] + ' 内的妖物扯到身前，'
      + '并造成 ' + (5 + (lv - 1) * 3) + ' 点伤害'
      + '　冷却 ' + (SKILL_DEF.qinlong.cd[lv - 1] / 60).toFixed(1) + ' 秒',
    cast(g, lv) {
      const p = g.player, R = SKILL_DEF.qinlong.vals[lv - 1], dmg = 5 + (lv - 1) * 3;
      SFX.summon(); g.shake(4);
      for (const e of g.enemies) {
        if (e.dead || e.isBoss) continue;          // 尊者太重，摄拿不动
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d > R) continue;
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        // 落在身前 20px 处：不糊在脸上，正好是挥砍与突进起手的距离
        const pull = Math.max(0, d - 20);
        e.x -= Math.cos(a) * pull; e.y -= Math.sin(a) * pull;
        e.hurt(dmg, g);
        g.zaps.push({ x1: p.x, y1: p.y, x2: e.x, y2: e.y, life: 8 });
        g.burst(e.x, e.y, 5, PAL.jadeL);
      }
      // 顺手拍开身前术法：拉人的同时给自己留出出刀的空档
      for (const b of g.bullets) {
        if (b.friendly || b.dead) continue;
        if (Math.hypot(b.x - p.x, b.y - p.y) < R * 0.8) { b.dead = true; g.burst(b.x, b.y, 5, PAL.cyan); }
      }
      g.burst(p.x, p.y, 20, PAL.jade);
      g.floaters.push(new Floater(p.x, p.y - 26, '擒龙手', PAL.jadeL));
    }
  },
  liekong: {
    id: 'liekong', name: '裂空斩', en: 'RIFT', icon: 'rift',
    c1: PAL.cyan, c2: PAL.white, cost: 30,
    vals: [12, 16, 20, 24, 28],             // 剑气基础伤害（另加伤害 ×1.5）
    cd: [330, 300, 270, 240, 210],          // 5.5 → 3.5 秒
    desc: lv => '朝指针劈出一道贯通剑气，穿透妖物　伤害 '
      + (SKILL_DEF.liekong.vals[lv - 1] + 4) + '（另加伤害 ×1.5）'
      + '　冷却 ' + (SKILL_DEF.liekong.cd[lv - 1] / 60).toFixed(1) + ' 秒',
    cast(g, lv) {
      const p = g.player;
      const a = ultAimAngle(p);
      const dmg = SKILL_DEF.liekong.vals[lv - 1] + p.stats.damage * 1.5;
      SFX.slash(1); g.shake(5);
      g.bullets.push(new Bullet(
        p.x + Math.cos(a) * 12, p.y - 2 + Math.sin(a) * 8,
        Math.cos(a) * 7.2, Math.sin(a) * 7.2,
        {
          friendly: true, dmg: dmg, r: 9, life: 44, pierce: 99,
          knockback: 1.6, crit: Math.random() < p.stats.crit,
          burn: p.stats.burn, frost: p.stats.frost, chain: p.stats.chain,
          deflect: p.stats.deflect,
          kind: 'rift', sprite: SPR.riftwave, scale: 1
        }
      ));
    }
  }
};
const SKILL_KEYS = Object.keys(SKILL_DEF);

/* ------------------------------------------------------------
 *  专属技能（按流派）
 *  base —— 1 级时的基准数值，实际值再叠加升级路线
 * ---------------------------------------------------------- */
const ULT_DEF = {
  feijian: {
    id: 'feijian', style: 'feijian', name: '万剑归宗', en: 'MYRIAD SWORDS',
    icon: 'sword', c1: PAL.jadeL, c2: PAL.jade,
    desc: '朝指针方向倾泻飞剑，三柄并列、连绵不绝',
    // lane —— 并列飞剑的横向间距：同一轮的三柄齐头并进、互不发散
    base: { swords: 30, perVolley: 3, volleys: 10, dmgMul: 0.6, gap: 3, lane: 11 }
  },
  jujian: {
    id: 'jujian', style: 'jujian', name: '天崩剑狱', en: 'HEAVENFALL',
    icon: 'jujian', c1: PAL.gold, c2: PAL.goldL,
    desc: '巨剑自天而降，重创指针周遭妖物',
    /* 房间只有 480×288，半径给太大就变成无脑全屏，落点感会消失 */
    base: { radius: 90, dmgMul: 4, warn: 30, knock: 14 }
  },
  wujian: {
    id: 'wujian', style: 'wujian', name: '剑影三叠', en: 'TRIPLE GLEAM',
    icon: 'sword', c1: PAL.jadeL, c2: PAL.cyan,
    cd: 900,                 // 开局即自带，冷却压到 15 秒（其余流派仍是 ULT_CD_BASE）
    desc: '按住蓄势、松手朝指针突进斩击；蓄势越久突进越远，突进无敌，命中即可接续下一段',
    /* 一段突进斩 → 二段伤害 +20% → 三段五连斩且必定暴击。
       蓄势期间被打断则剑势溃散，技能立刻进冷却 —— 这是本流派唯一的赌注。 */
    base: {
      dash: WJ.dash, dashMin: WJ.dashMin, dur: WJ.dur, durMin: WJ.durMin,
      reach: WJ.reach, charge: WJ.charge, chargeMin: WJ.chargeMin, chain: WJ.chain,
      dmgMul: WJ.dmgMul, s2Mul: WJ.s2Mul, hits: WJ.s3Hits, crit: WJ.s3Crit
    }
  }
};

/* ------------------------------------------------------------
 *  专属技能升级路线
 *  每条 3 级，descs[i] 是升到 i+1 级时的说明
 *  val —— 各等级对应的数值，cast 时按 ultPathLv 查表
 * ---------------------------------------------------------- */
const ULT_PATH = {
  feijian: [
    { id: 'homing', name: '剑心通明', en: 'SEEK', val: [0.08, 0.14, 0.20], bonusRange: [0, 0, 80],
      descs: ['飞剑自行追敌（转向 0.08）', '追敌更疾（转向 0.14）', '如影随形（转向 0.20，索敌范围 +80）'] },
    { id: 'element', name: '五行剑气', en: 'ELEMENT', val: [1, 2, 3],
      descs: ['飞剑附带灼烧', '再附冰封，妖物行动迟缓', '再引雷法，命中连锁伤害'] },
    { id: 'swift', name: '御风而行', en: 'SWIFT', val: [0.35, 0.50, 0.70], dur: [180, 240, 300],
      descs: ['释放后身法 +35%，持续 3 秒', '身法 +50%，持续 4 秒', '身法 +70%，持续 5 秒'] },
    { id: 'more', name: '万剑盈空', en: 'VOLUME', val: [6, 12, 18],
      descs: ['飞剑 +6 柄', '飞剑再 +6 柄（共 42）', '飞剑再 +6 柄（共 48）'] },
    { id: 'haste', name: '剑意不绝', en: 'HASTE', val: [240, 480, 720],
      descs: ['专属冷却 −4 秒', '再 −4 秒（共 22 秒）', '再 −4 秒（共 18 秒）'] },
    { id: 'pierce', name: '破魔剑罡', en: 'PIERCE', val: [1, 2, 3],
      descs: ['飞剑额外穿透 1 个', '再 +1（共 2）', '再 +1（共 3）'] }
  ],
  jujian: [
    { id: 'shatter', name: '碎魔罡风', en: 'SHATTER', val: [1, 2, 3],
      descs: ['击碎屏内全部敌方术法', '一并涤荡地面秽气', '每道术法化作一柄己方飞剑'] },
    { id: 'charge', name: '蓄势待发', en: 'PREPARE', val: [0.35, 0.60, 0.90], dur: [480, 600, 720],
      descs: ['此后 8 秒蓄力速度 +35%', '10 秒内 +60%', '12 秒内 +90%'] },
    { id: 'power', name: '剑气纵横', en: 'POWER', val: [0.30, 0.50, 0.75], dur: [480, 600, 720],
      descs: ['此后 8 秒伤害 +30%', '10 秒内 +50%', '12 秒内 +75%'] },
    { id: 'radius', name: '山崩地裂', en: 'QUAKE', val: [30, 60, 90],
      descs: ['落剑范围 +30', '再 +30（共 150）', '再 +30（共 180）'] },
    { id: 'might', name: '天崩一击', en: 'MIGHT', val: [0.45, 0.95, 1.50],
      descs: ['落剑伤害 +45%', '再 +50%（共 95%）', '再 +55%（共 150%）'] },
    { id: 'aftershock', name: '余震不绝', en: 'ECHO', val: [180, 270, 360],
      descs: ['落点留下 3 秒剑气', '延长至 4.5 秒', '延长至 6 秒'] }
  ],
  wujian: [
    { id: 'power', name: '剑锋凌厉', en: 'POWER', val: [0.20, 0.40, 0.60],
      descs: ['突进斩伤害 +20%', '再 +20%（共 +40%）', '再 +20%（共 +60%）'] },
    { id: 'reach', name: '剑势绵长', en: 'REACH', val: [0.17, 0.33, 0.50],
      descs: ['突进距离 +17%（蓄满 216 px）', '突进距离 +33%（蓄满 246 px）',
              '突进距离 +50%（蓄满 277 px，够横穿整间石室）'] },
    { id: 'charge', name: '凝神聚气', en: 'FOCUS', val: [0.40, 0.70, 1.00],
      descs: ['蓄势速度 +40%', '蓄势速度 +70%', '蓄势速度 +100%（蓄满只需 12 帧）'] },
    { id: 'chain', name: '心剑相随', en: 'CHAIN', val: [30, 60, 90],
      descs: ['连段窗口 +30 帧（约 1.4 秒）', '连段窗口 +60 帧（共约 2.4 秒）',
              '连段窗口 +90 帧（共约 2.9 秒）'] },
    { id: 'guard', name: '剑罡护体', en: 'GUARD', val: [30, 60, 90],
      descs: ['突进结束后无敌 0.5 秒', '突进结束后无敌 1 秒', '突进结束后无敌 1.5 秒'] },
    /* 剑意不绝：不走「释放那一刻固定扣减」，而是击杀返还（mode:'kill'）。
       这是一条有条件的 CDR —— 蓄势被打断、人没杀掉，就一分不返。
       溢价正来自这个条件：无条件的剑意不绝（飞剑流那条）满级只 −6 秒，
       这里满级每杀返 4 秒，在一间五只妖物的石室里就能把 15 秒冷却压掉四分之一。
       2/3/4 是「越杀越顺」的斜坡，每级落差一致，不做陡增。 */
    { id: 'haste', name: '剑意不绝', en: 'HASTE', mode: 'kill', val: [120, 180, 240],
      descs: ['每击杀一只妖物返还 2 秒冷却', '每击杀一只妖物返还 3 秒',
              '每击杀一只妖物返还 4 秒'] }
  ]
};
const ULT_PATH_KEYS = {};
for (const st in ULT_PATH) ULT_PATH_KEYS[st] = ULT_PATH[st].map(p => p.id);

/* 查某条路线当前等级（0 = 未学） */
function ultPathLv(ult, pathId) {
  return (ult && ult.paths && ult.paths[pathId]) || 0;
}
/* 取该路线在当前等级下的数值（未学则返回 0） */
function ultPathVal(ult, style, pathId) {
  const lv = ultPathLv(ult, pathId);
  if (!lv) return 0;
  const def = (ULT_PATH[style] || []).find(p => p.id === pathId);
  return def ? def.val[lv - 1] : 0;
}
/* 取某流派「冷却类」的那条路线（目前只有剑意不绝）。两种模式：
   缺省 = 释放时固定扣减（飞剑流）；mode:'kill' = 击杀返还（舞剑流）。 */
function ultCdPath(style) {
  return (ULT_PATH[style] || []).find(p => p.id === 'haste') || null;
}
/* 专属技能的名义冷却（帧）：基础冷却减去「固定扣减」型路线的缩减。
   击杀返还型不计在这里 —— 那是释放之后才一笔笔赚回来的，见 ultKillRefund()。
   下限 ULT_CD_MIN 只约束这个名义值，返还本身不受它管。 */
function ultCdOf(ult, style) {
  const D = ULT_DEF[style];
  const base = (D && D.cd) || ULT_CD_BASE;      // 舞剑流开局即自带，基础冷却压到 15 秒
  const h = ultCdPath(style);
  const cut = (h && h.mode === 'kill') ? 0 : ultPathVal(ult, style, 'haste');
  return Math.max(ULT_CD_MIN, base - cut);
}
/* 击杀一只妖物返还的冷却（帧）：只有「击杀返还」型路线有值，未学返回 0 */
function ultKillRefund(ult, style) {
  const h = ultCdPath(style);
  if (!h || h.mode !== 'kill') return 0;
  return ultPathVal(ult, style, 'haste');
}
/* 专属显示等级 = 1 + 已学路线总级数 */
function ultLevel(ult) {
  if (!ult) return 0;
  let n = 1;
  for (const k in ult.paths) n += ult.paths[k];
  return n;
}
/* 从未满级的路线里随机抽 n 条（不足则全给） */
function rollUltPaths(rng, style, ult, n) {
  const all = ULT_PATH[style] || [];
  const pool = all.filter(p => ultPathLv(ult, p.id) < ULT_PATH_MAX);
  const out = [];
  const src = pool.slice();
  while (out.length < n && src.length) {
    out.push(src.splice(Math.floor(rng() * src.length) % src.length, 1)[0]);
  }
  return out;
}
/* 一条路线的下一级说明（供升级卡片展示） */
function ultPathNextDesc(style, pathId, lv) {
  const def = (ULT_PATH[style] || []).find(p => p.id === pathId);
  if (!def) return '';
  if (lv >= ULT_PATH_MAX) return def.descs[ULT_PATH_MAX - 1] + '（已圆满）';
  return def.descs[lv];
}

/* ------------------------------------------------------------
 *  小技能等级缩放：vals 查表 + 说明文案
 * ---------------------------------------------------------- */
function skillDesc(id, lv) {
  const d = SKILL_DEF[id];
  return d ? d.desc(Math.max(1, Math.min(SKILL_MAX_LV, lv))) : '';
}
function skillCost(id) {
  const d = SKILL_DEF[id];
  return d ? d.cost : 0;
}
/* 小技能冷却（帧）：按等级查表；没配 cd 的退回公共 GCD */
function skillCd(id, lv) {
  const d = SKILL_DEF[id];
  if (!d || !d.cd) return SKILL_GCD;
  return d.cd[Math.max(1, Math.min(SKILL_MAX_LV, lv)) - 1];
}
/* 从池子里抽一个没满级的技能（拾取掉落用）；全满则退化为整池随机 */
function rollSkillId(rng, slots) {
  const owned = slots || [];
  const fresh = SKILL_KEYS.filter(id => !owned.some(s => s && s.id === id));
  if (fresh.length) return fresh[Math.floor(rng() * fresh.length) % fresh.length];
  const up = SKILL_KEYS.filter(id => owned.some(s => s && s.id === id && s.lv < SKILL_MAX_LV));
  const src = up.length ? up : SKILL_KEYS;
  return src[Math.floor(rng() * src.length) % src.length];
}
