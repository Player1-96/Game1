'use strict';
/* ============================================================
 *  items.js —— 法宝 / 丹药 / 功法
 * 被动法宝改变属性；丹药即时生效；功法为主动技（空格释放，有冷却）
 *
 * 法宝分两类：
 *   数值型（默认）—— 可无限叠加，重复拿到就是数值再涨一次。
 *   功能型（func:true）—— 同一门神通只开一次，重复拿到则「进阶」：
 *                          apply(p, rank) 收到已持有件数，up[] 给出进阶后的描述，
 *                          名称自动加「·二重 / ·三重」后缀。
 * ============================================================ */

const ITEM_DEFS = [
  /* ---------- 法宝（被动） ---------- */
  { id: 'qingfeng', name: '青锋剑', type: 'fabao', icon: 'sword', c1: PAL.greyL, c2: PAL.jade,
    desc: '飞剑锋利，伤害 +1', apply: p => { p.stats.damage += 1; },
    byStyle: {
      feijian: { name: '青锋剑', desc: '飞剑锋利，每发伤害 +1' },
      jujian: { name: '青锋重剑', desc: '伤害 +1，且随段位倍率放大（二段实为 +2.8）' },
      wujian: { name: '青锋剑', desc: '剑锋锋利，每次挥砍伤害 +1（突进连段同样吃到）' }
    } },
  { id: 'yujian', name: '御剑术·三重', type: 'fabao', icon: 'needle', c1: PAL.jadeL, c2: PAL.jade,
    desc: '每击额外射出 2 柄飞剑（扇形）', apply: p => { p.stats.spread += 2; p.stats.damage -= 0.6; },
    byStyle: {
      feijian: { name: '御剑术·三重', desc: '每击射出 3 柄飞剑（扇形），单发伤害 -0.6' },
      jujian: { name: '重剑诀·三重', desc: '不分剑：剑身大幅增宽，威力 ×1.7（需扣 0.6 基础伤害）' },
      wujian: { name: '回风拂柳', desc: '不分剑：挥砍弧度大幅加宽（+2 段弧度），单次伤害 -0.6' }
    } },
  { id: 'chuanyun', name: '穿云梭', type: 'fabao', icon: 'needle', c1: PAL.cyan, c2: PAL.white,
    desc: '飞剑可穿透 2 个敌人', apply: p => { p.stats.pierce += 2; },
    byStyle: {
      feijian: { name: '穿云梭', desc: '飞剑可额外穿透 2 个妖物' },
      jujian: { name: '破云梭', desc: '巨剑额外穿透 2 个（叠加在段位自带的 1 / 3 / 8 之上）' },
      wujian: { name: '穿云梭', desc: '一次挥砍可多命中 2 个妖物（基础 3 个 → 5 个）' }
    } },
  { id: 'hunyuan', name: '混元珠', rare: true, type: 'fabao', icon: 'orb', c1: PAL.gold, c2: PAL.goldL,
    desc: '飞剑自动追敌', func: true,
    apply: (p, rank) => { p.stats.homing += (rank > 0 ? 0.10 : 0.14); if (rank >= 2) p.stats.homingRange += 60; },
    up: ['追敌更疾：转向速度 +71%（累计 0.24 rad/帧）',
         '追敌如影：转向 +171%（累计 0.34），追敌范围 +60'],
    byStyle: {
      feijian: { name: '混元珠', desc: '飞剑自动追敌' },
      jujian: { name: '引路珠', desc: '巨剑自动追敌（转向较迟钝，宜配合预判）' },
      wujian: { name: '缠丝珠', desc: '突进的剑锋自行缠向近旁妖物（触及范围 +12，突进方向仍由指针决定）' }
    },
    upByStyle: {
      wujian: ['缠丝更紧：突进剑锋的触及范围累计 +17',
               '缠丝如网：触及范围累计 +21，擦着剑风也能斩中']
    } },
  { id: 'taixu', name: '太虚护盾', type: 'fabao', icon: 'shield2', c1: PAL.jade, c2: PAL.jadeL,
    desc: '获得 2 点常驻灵力护盾（不设时限，受击才扣）', apply: p => { p.addShield(2); } },
  { id: 'lingxi', name: '灵犀玉佩', type: 'fabao', icon: 'jade', c1: PAL.jade, c2: PAL.jadeL,
    desc: '御剑速度 +35%', apply: p => { p.stats.fireRate *= 1.35; },
    byStyle: {
      feijian: { name: '灵犀玉佩', desc: '御剑出手速度 +35%' },
      jujian: { name: '聚灵玉佩', desc: '蓄力速度 +35%，出剑后摇同步缩短（二段由 1.1 秒缩至约 0.8 秒）' },
      wujian: { name: '灵犀玉佩', desc: '挥砍速度 +35%，蓄势速度同步 +35%（一刀更快、蓄势更短）' }
    } },
  { id: 'fengxing', name: '风行靴', type: 'fabao', icon: 'boot', c1: PAL.cyan, c2: PAL.white,
    desc: '身法 +25%', apply: p => { p.stats.speed *= 1.25; } },
  { id: 'xuantie', name: '玄铁重剑', rare: true, type: 'fabao', icon: 'sword', c1: PAL.grey, c2: PAL.greyD,
    desc: '伤害 +3.5，御剑速度 -20%', apply: p => { p.stats.damage += 3.5; p.stats.fireRate *= 0.8; },
    byStyle: {
      feijian: { name: '玄铁重剑', desc: '伤害 +3.5，但出手速度 -20%' },
      jujian: { name: '玄铁巨剑', desc: '伤害 +3.5（受段位倍率放大），但蓄力与出剑后摇 -20%' },
      wujian: { name: '玄铁重剑', desc: '伤害 +3.5（挥砍与突进连段都吃到），但挥砍与蓄势 -20%' }
    } },
  { id: 'chiyan', name: '赤焰符', type: 'fabao', icon: 'flame', c1: PAL.fire, c2: PAL.gold,
    desc: '命中灼烧，持续掉血', apply: p => { p.stats.burn += 2; } },
  { id: 'hanbing', name: '玄冰符', rare: true, type: 'fabao', icon: 'ice', c1: PAL.cyan, c2: '#bfeaff',
    desc: '命中冰封，妖物行动迟缓', func: true,
    apply: (p) => { p.stats.frost += 1; },
    up: ['寒气更盛：减速 55% → 62%，冰封持续 +35 帧',
         '寒气彻骨：减速 62% → 69%，冰封持续再 +35 帧'] },
  { id: 'leifu', name: '引雷符', type: 'fabao', icon: 'thunder', c1: PAL.gold, c2: PAL.cyan,
    desc: '命中引动雷法，连锁伤害', apply: p => { p.stats.chain += 1; } },
  { id: 'jingang', name: '金刚不坏', type: 'fabao', icon: 'banner', c1: PAL.gold, c2: PAL.orange,
    desc: '受创后无敌时间延长', apply: p => { p.stats.iframe += 40; } },
  { id: 'juling', name: '聚灵阵', type: 'fabao', icon: 'coin', c1: PAL.jade, c2: PAL.jadeL,
    desc: '灵石掉落大幅增加', apply: p => { p.stats.greed += 2; } },
  { id: 'qiankun', name: '乾坤袋', type: 'fabao', icon: 'bag', c1: '#a0754a', c2: PAL.gold,
    desc: '气运 +3，开箱更易得好物', apply: p => { p.stats.luck += 3; } },
  { id: 'zhenhun', name: '镇魂铃', type: 'fabao', icon: 'bell', c1: PAL.gold, c2: PAL.goldD,
    desc: '飞剑击退大幅增强', apply: p => { p.stats.knockback += 2.2; },
    byStyle: {
      feijian: { name: '镇魂铃', desc: '飞剑击退大幅增强' },
      jujian: { name: '震岳铃', desc: '巨剑击退大幅增强，且随段位进一步加重' },
      wujian: { name: '震岳铃', desc: '挥砍击退大幅增强（基础击退 1.6，近战一刀推出半间屋）' }
    } },
  { id: 'tianyan', name: '天眼通', rare: true, type: 'fabao', icon: 'eye', c1: PAL.purpleL, c2: PAL.gold,
    desc: '窥破弱点，20% 概率双倍伤害', func: true,
    apply: (p, rank) => { p.stats.crit += (rank > 0 ? 0.15 : 0.2); },
    up: ['天眼更明：暴击率 20% → 35%（双倍伤害）',
         '天眼通玄：暴击率 35% → 50%（双倍伤害）'] },
  { id: 'xiangyun', name: '祥云履', rare: true, type: 'fabao', icon: 'cloud', c1: PAL.white, c2: PAL.cyan,
    desc: '踏云而行，移速 +15% 且免疫地面秽气', func: true,
    apply: (p, rank) => { p.stats.speed *= (rank > 0 ? 1.10 : 1.15); p.stats.fly = true; },
    up: ['云气更厚：身法再 +10%（累计 +27%），免疫地面秽气',
         '踏云无迹：身法再 +10%（累计 +40%），免疫地面秽气'] },
  { id: 'fenying', name: '分影诀', type: 'fabao', icon: 'cloud', c1: PAL.purpleL, c2: PAL.purple,
    desc: '额外射出 1 柄散剑，伤害 -0.3', apply: p => { p.stats.spread += 1; p.stats.damage -= 0.3; },
    byStyle: {
      feijian: { name: '分影诀', desc: '额外射出 1 柄散剑，单发伤害 -0.3' },
      jujian: { name: '阔刃诀', desc: '不分剑：剑身增宽，威力 ×1.35（需扣 0.3 基础伤害）' },
      wujian: { name: '分影诀', desc: '挥砍弧度更宽（+1 段弧度），单次伤害 -0.3' }
    } },
  { id: 'xuanyuan', name: '玄元镜', rare: true, type: 'fabao', icon: 'mirror', c1: PAL.cyan, c2: PAL.white,
    desc: '飞剑可击落敌方术法', func: true,
    // 舞剑流自带斩落，再给「扩大斩落半径」是废牌，故改走 reflect：斩中的术法掉头打回去
    apply: (p, rank, style) => {
      if (style === 'wujian') p.stats.reflect += 1;
      else p.stats.deflect += 1;
    },
    up: ['镜光扩大：击落范围 +4，可同时湮灭更多术法',
         '镜光如幕：击落范围再 +4，术法近身即散'],
    upByStyle: {
      wujian: ['照影更疾：打回去的术法伤害 ×1.8，并可多穿透 1 个妖物',
               '照影如潮：伤害 ×2.3，可多穿透 2 个妖物，且回敬的术法会自行追敌']
    },
    byStyle: {
      feijian: { name: '玄元镜', desc: '飞剑可击落敌方术法（范围随镜阶扩大）' },
      jujian: { name: '玄元镜', desc: '巨剑扫过可击落敌方术法（范围随镜阶扩大）' },
      wujian: { name: '照影镜', desc: '斩中的术法原路打回去（伤害 ×1.3）；满阶起自行追敌' }
    } },
  { id: 'shidu', name: '尸毒珠', rare: true, type: 'fabao', icon: 'orb', c1: PAL.green, c2: PAL.greenD,
    desc: '被击杀的妖物炸出毒雾（半径 26）', func: true,
    apply: (p) => { p.stats.poison += 1; },
    up: ['毒雾更浓：半径 26 → 34，持续 +40 帧，伤害 +0.5',
         '毒雾弥天：半径 34 → 42，持续 +40 帧，伤害再 +0.5'] },
  { id: 'jindan', name: '金丹', rare: true, type: 'fabao', icon: 'orb', c1: PAL.goldL, c2: PAL.gold,
    desc: '全属性小幅提升', apply: p => { p.stats.damage += 0.8; p.stats.fireRate *= 1.1; p.stats.speed *= 1.08; p.stats.luck += 1; },
    byStyle: {
      feijian: { name: '金丹', desc: '伤害 +0.8、出手速度 +10%、身法 +8%、气运 +1' },
      jujian: { name: '金丹', desc: '伤害 +0.8（受段位倍率放大）、蓄力与后摇 +10%、身法 +8%、气运 +1' },
      wujian: { name: '金丹', desc: '伤害 +0.8（挥砍与突进连段都吃到）、挥砍 +10%、身法 +8%、气运 +1' }
    } },
  { id: 'liuli', name: '琉璃盏', type: 'fabao', icon: 'gourd', c1: PAL.jade, c2: PAL.white,
    desc: '每清一室回复半点气血', apply: p => { p.stats.regen += 0.5; } },
  { id: 'shehun', name: '摄魂幡', rare: true, type: 'fabao', icon: 'banner', c1: PAL.purple, c2: PAL.red,
    desc: '斩杀妖物后短暂提升伤害 +1.2（5 秒）', func: true,
    apply: (p) => { p.stats.soul += 1; },
    up: ['幡影更盛：斩杀后伤害 +2.1，持续延长 1 秒',
         '幡影遮天：斩杀后伤害 +3.0，持续再延 1 秒'] },
  { id: 'yuyi', name: '羽衣', type: 'fabao', icon: 'feather', c1: PAL.white, c2: PAL.jadeL,
    desc: '常驻护盾 +1（受击才扣），受击不易踉跄', apply: p => { p.addShield(1); p.stats.speed *= 1.05; } },
  { id: 'huiling', name: '回灵符', type: 'fabao', icon: 'talisman', c1: PAL.cyan, c2: PAL.jadeL,
    desc: '灵力自然回复 +1/秒（开局为 0，全靠此符）', apply: p => { p.stats.mpRegen += 1; } },

  /* ---------- 丹药（即时生效） ---------- */
  { id: 'huichun', name: '回春丹', type: 'dan', icon: 'pill', c1: PAL.red, c2: PAL.gold,
    desc: '立即回复 2 点气血', apply: p => { p.heal(4); } },
  /* 灵力丹原本是 gourd + jade/white —— 与法宝「琉璃盏」的图标和配色**完全一致**，
     画出来是同一个位图，玩家会以为「丹药跑进法宝格里了」（2026-09-21 反馈）。
     现改用丹药专属的 pill 形状，并取灵力珠同款的青色调，双重区分。 */
  { id: 'lingdan', name: '灵力丹', type: 'dan', icon: 'pill', c1: PAL.cyan, c2: PAL.jadeL,
    desc: '立即获得 2 点常驻护盾', apply: p => { p.addShield(2); } },
  { id: 'xisui', name: '洗髓丹', type: 'dan', icon: 'pill', c1: PAL.gold, c2: PAL.goldL,
    desc: '气血上限 +2，并回满', apply: p => { p.maxHP += 4; p.hp = p.maxHP; } },
  { id: 'jinchuang', name: '金疮药', type: 'dan', icon: 'pill', c1: PAL.orange, c2: PAL.white,
    desc: '回复 1 点气血', apply: p => { p.heal(2); } },
  { id: 'jingyuan', name: '精元散', type: 'dan', icon: 'pill', c1: PAL.gold, c2: PAL.goldL,
    desc: '获得 15 枚灵石', apply: p => { Game.addCoins(15); } },

  /* ---------- 小技能（原功法，Q 释放、消耗灵力） ----------
     数值与释放效果全部收在 skills.js 的 SKILL_DEF，这里只留展示用的壳。
     等级文案走 itemView() 的 gongfa 分支，按当前等级实时生成。 */
  { id: 'tianlei', name: '天雷引', type: 'gongfa', icon: 'thunder', c1: PAL.gold, c2: PAL.cyan,
    desc: SKILL_DEF.tianlei.desc(1) },
  { id: 'suodi', name: '缩地成寸', type: 'gongfa', icon: 'cloud', c1: PAL.jade, c2: PAL.white,
    desc: SKILL_DEF.suodi.desc(1) },
  { id: 'wuxing', name: '五行遁术', type: 'gongfa', icon: 'lotus', c1: PAL.purpleL, c2: PAL.gold,
    desc: SKILL_DEF.wuxing.desc(1) },
  { id: 'huti', name: '护体金光', type: 'gongfa', icon: 'shield2', c1: PAL.gold, c2: PAL.goldL,
    desc: SKILL_DEF.huti.desc(1) },
  /* 近战向：一门负责「把妖物拉过来」，一门负责「在原地也够得着」。
     两者都不限定流派，只是舞剑流最缺这两件事，用起来最顺手。 */
  { id: 'qinlong', name: '擒龙手', type: 'gongfa', icon: 'hand', c1: PAL.jade, c2: PAL.white,
    desc: SKILL_DEF.qinlong.desc(1) },
  { id: 'liekong', name: '裂空斩', type: 'gongfa', icon: 'rift', c1: PAL.cyan, c2: PAL.white,
    desc: SKILL_DEF.liekong.desc(1) }
];

const ITEM_MAP = {};
ITEM_DEFS.forEach(d => { ITEM_MAP[d.id] = d; });

/* ------------------------------------------------------------
 *  数值型法宝的「合计」口径
 *  同一件法宝叠到第 n 层时，把各条数值按份数加起来展示（实际效果本就是叠加的）。
 *  功能型法宝走 up[] 的进阶文案，不在此列。
 * ---------------------------------------------------------- */
/* 合计口径按流派分岔：同一条数值在三个流派下的叫法不同
   （分剑数 → 剑身宽度 → 挥砍弧度），不分开写就会在悬停说明里
   读到别的流派的词。style 缺省按飞剑流，导出资源表时也用它。 */
const ITEM_TALLY = {
  qingfeng: (n, st) => (st === 'wujian' ? '每次挥砍伤害 +' : '每发伤害 +') + n,
  yujian: (n, st) => st === 'wujian'
    ? '挥砍弧度 +' + (2 * n) + ' 段　单次伤害 -' + (0.6 * n).toFixed(1)
    : st === 'jujian'
      ? '剑身增宽（威力 ×' + Math.pow(1.7, n).toFixed(2) + '）　基础伤害 -' + (0.6 * n).toFixed(1)
      : '额外飞剑 +' + (2 * n) + ' 柄　单发伤害 -' + (0.6 * n).toFixed(1),
  fenying: (n, st) => st === 'wujian'
    ? '挥砍弧度 +' + n + ' 段　单次伤害 -' + (0.3 * n).toFixed(1)
    : st === 'jujian'
      ? '剑身增宽（威力 ×' + Math.pow(1.35, n).toFixed(2) + '）　基础伤害 -' + (0.3 * n).toFixed(1)
      : '额外散剑 +' + n + ' 柄　单发伤害 -' + (0.3 * n).toFixed(1),
  chuanyun: (n, st) => (st === 'wujian' ? '一次挥砍可多命中 ' : '额外穿透 ') + (2 * n) + ' 个',
  taixu: n => '常驻灵力护盾 +' + (2 * n),
  yuyi: n => '常驻护盾 +' + n + '　身法 ×' + Math.pow(1.05, n).toFixed(2),
  huiling: n => '灵力自然回复 +' + n + '/秒',
  lingxi: (n, st) => (st === 'wujian' ? '挥砍速度 ×' : '御剑出手速度 ×') + Math.pow(1.35, n).toFixed(2),
  fengxing: n => '身法 ×' + Math.pow(1.25, n).toFixed(2),
  xuantie: (n, st) => '伤害 +' + (3.5 * n).toFixed(1) + '　'
    + (st === 'wujian' ? '挥砍速度 ×' : '出手速度 ×') + Math.pow(0.8, n).toFixed(2),
  chiyan: n => '灼烧层数 +' + (2 * n),
  leifu: n => '连锁 +' + n,
  jingang: n => '受创无敌 +' + (40 * n) + ' 帧',
  juling: n => '灵石掉落 +' + (2 * n),
  qiankun: n => '气运 +' + (3 * n),
  zhenhun: n => '击退 +' + (2.2 * n).toFixed(1),
  jindan: (n, st) => '伤害 +' + (0.8 * n).toFixed(1) + '　'
    + (st === 'wujian' ? '挥砍 ×' : '出手 ×') + Math.pow(1.1, n).toFixed(2)
    + '　身法 ×' + Math.pow(1.08, n).toFixed(2) + '　气运 +' + n,
  liuli: n => '每清一室回 ' + (0.5 * n).toFixed(1) + ' 点气血'
};

/* ------------------------------------------------------------
 *  流派化文案：同一件法宝在不同流派下效果不同时，名称与说明各异
 *  用法：所有展示点一律走 itemView(def, Game.style, rank)，不要直接用 def.name
 *  rank = 已持有件数（0 = 首次拿到）—— 功能型法宝据此换成进阶文案
 * ---------------------------------------------------------- */
const TIER_CN = ['', '·二重', '·三重', '·四重', '·五重'];
function itemTierSuffix(n) { return TIER_CN[n] || ('·' + (n + 1) + '重'); }

function itemView(def, style, rank) {
  const v = def && def.byStyle ? def.byStyle[style] : null;
  const name = (v && v.name) || (def ? def.name : '');
  const desc = (v && v.desc) || (def ? def.desc : '');
  const n = rank | 0;
  // 小技能：文案按当前等级实时生成（1~5 级的数值各不相同）
  if (def && def.type === 'gongfa') {
    return { name: name, desc: skillDesc(def.id, Math.max(1, n + 1)), differs: false };
  }
  if (def && def.func && n > 0) {
    // 进阶：名称加「·二重」，说明换成该阶的数值提升（个别法宝的进阶效果也分流派）
    const ups = (def.upByStyle && def.upByStyle[style]) || def.up;
    if (ups && ups[n - 1]) return { name: name + itemTierSuffix(n), desc: ups[n - 1], differs: true };
    return { name: name + '·圆满', desc: desc + '（已臻圆满，再得亦是此效）', differs: true };
  }
  // 数值型：重复即堆叠，名称后缀 LvN
  if (def && def.type === 'fabao' && !def.func && n > 0) {
    return { name: name + ' Lv' + (n + 1), desc: desc, differs: false };
  }
  return { name, desc, differs: !!(def && def.byStyle && Object.keys(def.byStyle).length > 1) };
}
/* 该法宝在「其它已开放流派」下的效果，供悬停说明对照 */
function itemOtherStyles(def, style) {
  if (!def || !def.byStyle) return [];
  return Object.keys(def.byStyle)
    .filter(k => k !== style && STYLES[k] && STYLES[k].ready)
    .map(k => ({ style: STYLES[k].name, name: def.byStyle[k].name, desc: def.byStyle[k].desc }));
}
/* 说明浮层的 HTML —— 背包悬停与坊市预览共用，保证两处读到的效果一致 */
function itemTipHTML(def, style, extraHTML, rank) {
  const v = itemView(def, style, rank);
  const typeName = { fabao: '法宝', dan: '丹药', gongfa: '小技能', ult: '专属技能' }[def.type] || '';
  let html = '<div class="tn">' + v.name + '<span class="tt">' + typeName + '</span></div>'
           + '<div class="td">' + v.desc + '</div>';
  // 数值型法宝叠层：把各条数值按份数加总，一眼看出手里到底叠了多少
  if (def.type === 'fabao' && !def.func && rank > 0) {
    const n = rank + 1;
    html += '<div class="twarn">已叠 ' + n + ' 层（Lv' + n + '）'
      + (ITEM_TALLY[def.id] ? '　合计：' + ITEM_TALLY[def.id](n, style) : '') + '</div>';
  }
  if (def.type === 'gongfa') html += '<div class="twarn">[Q] 施展　灵力 ' + skillCost(def.id)
    + '　冷却 ' + (skillCd(def.id, rank + 1) / 60).toFixed(1) + ' 秒'
    + '　等级 ' + (rank + 1) + '/' + SKILL_MAX_LV + '</div>';
  if (def.type === 'ult') html += '<div class="twarn">[空格] 施展　冷却 ' + Math.round((def.cd || 1800) / 60) + ' 秒</div>';
  const alt = itemOtherStyles(def, style);
  if (alt.length) html += '<div class="talt">' +
    alt.map(a => '<b>' + a.style + '</b>称「' + a.name + '」：' + a.desc).join('<br>') + '</div>';
  return html + (extraHTML || '');
}

/* 图标缓存 */
const ITEM_ICONS = {};
function buildItemIcons() {
  for (const d of ITEM_DEFS) {
    if (d.icon === 'shield2') {
      // 护盾类图标单独绘制
      const p = new Px(16, 16);
      p.rect(1, 1, 14, 14, ICON_BG); p.box(0, 0, 16, 16, '#3c3560'); p.box(1, 1, 14, 14, '#4d4478');
      p.rect(5, 2, 6, 1, d.c1); p.rect(3, 3, 10, 4, d.c1);
      p.rect(2, 7, 12, 3, d.c1); p.rect(4, 10, 8, 1, d.c1); p.rect(6, 11, 4, 1, d.c1);
      p.rect(4, 4, 2, 3, d.c2);
      ITEM_ICONS[d.id] = p.done();
    } else if (d.icon === 'ice') {
      const p = new Px(16, 16);
      p.rect(1, 1, 14, 14, ICON_BG); p.box(0, 0, 16, 16, '#3c3560'); p.box(1, 1, 14, 14, '#4d4478');
      p.line(8, 2, 8, 14, d.c1, 2); p.line(3, 5, 13, 11, d.c2); p.line(13, 5, 3, 11, d.c2);
      p.set(7, 3, PAL.white); p.set(9, 13, PAL.white);
      ITEM_ICONS[d.id] = p.done();
    } else {
      ITEM_ICONS[d.id] = makeItemIcon(d.icon, d.c1, d.c2);
    }
  }
}

/* 按类型抽取（不重复） */
function rollItem(rng, pool, taken) {
  const avail = pool.filter(id => !taken.has(id));
  if (!avail.length) return null;
  return avail[Math.floor(rng() * avail.length) % avail.length];
}
function poolByType(type) {
  return ITEM_DEFS.filter(d => d.type === type).map(d => d.id);
}

/* ------------------------------------------------------------
 *  法宝抽取
 *  数值型可以重复（重复即数值再涨）；功能型只在还能进阶时才可能再出。
 *  owned = 玩家已持有的 id 列表（可含重复项，重复次数即当前阶数）。
 * ---------------------------------------------------------- */
function fabaoRank(owned, id) {
  let n = 0;
  for (const i of (owned || [])) if (i === id) n++;
  return n;
}
/* 功能型最多拿到 up.length + 1 件，之后再抽就是浪费 */
function fabaoMaxRank(def) {
  if (!def) return 1;
  return def.func ? (def.up ? def.up.length : 0) + 1 : 99;
}
/* 金匣（需钥匙）专用：只出一件，但必定是珍稀法宝。
   珍稀池里挑不出（都拿过了）时才退回常规抽取。 */
function rollRareFabaoId(rng, owned) {
  const own = owned || [];
  const pool = poolByType('fabao');
  const rare = pool.filter(id => ITEM_MAP[id].rare && fabaoRank(own, id) < fabaoMaxRank(ITEM_MAP[id]));
  if (rare.length) return rare[Math.floor(rng() * rare.length) % rare.length];
  const avail = pool.filter(id => fabaoRank(own, id) < fabaoMaxRank(ITEM_MAP[id]));
  return rollFabaoId(rng, own) || (avail[0] || pool[0]);
}
function rollFabaoId(rng, owned) {
  const pool = poolByType('fabao');
  const own = owned || [];
  const fresh = pool.filter(id => !own.includes(id));
  const avail = pool.filter(id => fabaoRank(own, id) < fabaoMaxRank(ITEM_MAP[id]));
  // 七成概率先补没见过的，剩下的三成允许重复（数值型叠、功能型进阶）
  const src = (fresh.length && rng() < 0.72) ? fresh : (avail.length ? avail : pool);
  return src[Math.floor(rng() * src.length) % src.length];
}
