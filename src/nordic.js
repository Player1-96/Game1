'use strict';
/* ============================================================
 *  nordic.js —— 北欧神话内容包（ROADMAP 第四期）
 *
 *  一个「风格」= 一套色板 + 一组杂兵 + 一批精英 + 每段一尊 Boss
 *                + 该风格专属的神器 / 秘药 / 权能
 *
 *  本文件只放**数据**，不放美术（美术在 sprites.js 的「北欧」一节）。
 *
 *  ⚠️ 加载顺序：必须在 px.js 之后（要用 PAL / STYLE_PAL / STYLE_DEF），
 *     且在 sprites.js / skills.js / items.js / dungeon.js / entities.js 之前 ——
 *     后面几个文件在**模块顶层**就要读这里的东西：
 *       skills.js  → NORDIC_SKILLS  （并进 SKILL_DEF，之后才 Object.keys）
 *       items.js   → NORDIC_ITEMS   （并进 ITEM_DEFS，之后才建 ITEM_MAP）
 *       entities.js→ NORDIC_ENEMY_DEF / NORDIC_BOSS_DEF / NORDIC_ELITE_DEF
 *       dungeon.js → STYLE_CONTENT  （按风格取杂兵池 / 精英 / 尊者）
 *
 *  ⚠️ 命名撞车提醒：本项目里「风格」有两个意思，读代码时别混：
 *    · **世界风格**（cn / nordic / cthulhu）= 本文件处理的这个，
 *      变量名是 STYLE_CUR / STYLE_DEF / STYLE_PAL。
 *    · **战斗流派**（feijian / jujian / wujian）= 剑法，变量名是 STYLES / Game.style，
 *      道具的 `byStyle` 字段指的是它。
 * ============================================================ */

/* ------------------------------------------------------------
 *  北欧固有色
 *
 *  为什么不用 PAL.xxx：**本文件在模块顶层求值**，那一刻 PAL_ACTIVE 还是
 *  中式一段（px.js 里的初值），所以 `c1: PAL.jade` 会被烤成中式的青色。
 *  （融合产物当初就踩过这个 —— 说明里引 items.js 的 TAIXU 直接白屏。）
 *  神器 / 秘药 / 权能的图标配色是**身份色**，本来就不该跟层段变，写死更好。
 *  ⚠️ 同一形状下配色必须两两不同 —— `_t_audit.js` 的「同形状 + 同配色 = 同一个位图」
 *     会把撞车的抓出来。
 * ---------------------------------------------------------- */
const NORD = {
  ice: '#9fd8ff', iceD: '#4a86b8', iceL: '#dff2ff',
  iron: '#8f97a6', ironD: '#5a6272', ironL: '#cdd6e2',
  ember: '#ff9a4a', emberD: '#b4551a', emberL: '#ffd2a0',
  blood: '#d8384a', bloodD: '#8e1626', bloodL: '#ff9aa8',
  beryl: '#5ce0c0', berylD: '#1f9078', berylL: '#c0ffee',
  runic: '#b98cff', runicD: '#6a3cc8', runicL: '#e2cdff',
  amber: '#f0c04a', amberD: '#a8821c', amberL: '#ffeeb0',
  moss: '#7ab35a', mossD: '#446b30',
  bone: '#ece4d2', boneD: '#a89c86',
  dusk: '#8f6fae', duskD: '#5a3f78'
};

/* ------------------------------------------------------------
 *  北欧 · 3 个层段
 *  与中式同一套 47 个键（`PAL_KEYS`），语义一一对应：
 *    jade 系 = 该段的「主色」（中式青玉 → 北欧冰蓝），gold 系 = 副色（青铜 / 琥珀）。
 *  三段要「一眼看出同一个世界，但天色变了」：
 *    一（1~5 层）  霜铁 —— 冰原夜色，蓝灰为骨、冰蓝点睛
 *    二（6~10 层） 血月 —— 血月当空，石板转紫、橙红点睛
 *    三（11~15 层）极光 —— 诸神黄昏，极光绿与电青在深海里烧
 * ---------------------------------------------------------- */
STYLE_PAL.nordic_1 = {
  ink: '#0a0f18', ink2: '#141d2c',
  stone: '#39465c', stone2: '#465570', stoneHi: '#66799a', stoneLo: '#242e40',
  floor: '#2b3648', floor2: '#323e52', floor3: '#3a465c', floorLine: '#1e2735',
  jade: '#6fd0e8', jadeD: '#2f7f9c', jadeL: '#c2f0ff',
  gold: '#d9a94e', goldD: '#9c7420', goldL: '#ffe6a0',
  red: '#d6574f', redD: '#96261f', redL: '#ff9c8e',
  purple: '#7f7ae0', purpleD: '#4640a8', purpleL: '#c0bcff',
  white: '#eef2f7', grey: '#9aa6b8', greyD: '#657082', greyL: '#d2dae6',
  skin: '#f0c39a', skinD: '#c98f66',
  hair: '#20283a', hairL: '#39445e',
  blood: '#b93040', bone: '#e6e2d6',
  green: '#5fb46a', greenD: '#336b3c',
  cyan: '#7ee0f0', cyanD: '#3192aa',
  orange: '#e08a3c', fire: '#f2723d',
  shadow: 'rgba(4,8,16,0.38)',
  wall: '#232c3c', wallHi: '#465470', wallLo: '#161d29',
  moss: '#4f9e86', rune: '#6fd0e8',
  edge: '#05080f', edgeSoft: '#070a12', edgeWarm: '#04070e'
};

STYLE_PAL.nordic_2 = {
  ink: '#120a14', ink2: '#221226',
  stone: '#453a52', stone2: '#554860', stoneHi: '#7a6a88', stoneLo: '#2c2436',
  floor: '#332b3e', floor2: '#3b3248', floor3: '#453a52', floorLine: '#261f2e',
  jade: '#e0674e', jadeD: '#a03323', jadeL: '#ffb096',
  gold: '#f5b04a', goldD: '#b07818', goldL: '#ffe09a',
  red: '#e03848', redD: '#98122a', redL: '#ff8a9a',
  purple: '#a05ad0', purpleD: '#5e2a8a', purpleL: '#dcb0f5',
  white: '#f4ecf0', grey: '#ab9cb2', greyD: '#75657e', greyL: '#dcd0e2',
  skin: '#f0c39a', skinD: '#c98f66',
  hair: '#1e1424', hairL: '#362843',
  blood: '#c01830', bone: '#e8dcd8',
  green: '#7ab055', greenD: '#456a2a',
  cyan: '#6fbfd8', cyanD: '#2f7a9a',
  orange: '#f08a3c', fire: '#ff5a30',
  shadow: 'rgba(12,4,16,0.44)',
  wall: '#332936', wallHi: '#6a5270', wallLo: '#201826',
  moss: '#a86ab0', rune: '#e0674e',
  edge: '#0c050f', edgeSoft: '#100612', edgeWarm: '#100610'
};

STYLE_PAL.nordic_3 = {
  ink: '#060d14', ink2: '#0e1a26',
  stone: '#2e4a55', stone2: '#3a5a66', stoneHi: '#5a8494', stoneLo: '#1d3038',
  floor: '#1f3540', floor2: '#253d4a', floor3: '#2c4854', floorLine: '#16262e',
  jade: '#5cf0c0', jadeD: '#1a9c80', jadeL: '#b8ffee',
  gold: '#e8cc5a', goldD: '#a88e18', goldL: '#fff4a8',
  red: '#ff5a7a', redD: '#a8143c', redL: '#ffa0b8',
  purple: '#b878ff', purpleD: '#6a30c8', purpleL: '#e4c8ff',
  white: '#eefaff', grey: '#93b0bc', greyD: '#5f7c88', greyL: '#cfe4ea',
  skin: '#e8c4a0', skinD: '#b88a6a',
  hair: '#101c26', hairL: '#22323f',
  blood: '#c8245a', bone: '#dceaf0',
  green: '#4ce08a', greenD: '#1a8a4e',
  cyan: '#8ceaff', cyanD: '#3f9ac8',
  orange: '#f0a04a', fire: '#ff7a4a',
  shadow: 'rgba(2,8,14,0.46)',
  wall: '#1f3540', wallHi: '#4a7080', wallLo: '#132630',
  moss: '#5cf0c0', rune: '#8ceaff',
  edge: '#03080d', edgeSoft: '#050c12', edgeWarm: '#040a10'
};

/* 填风格定义（占位 → 就绪）。segs 的顺序就是层段顺序。 */
STYLE_DEF.nordic.ready = true;
STYLE_DEF.nordic.desc = '霜与铁的世界：巨狼在冰原上嗅你的气味';
STYLE_DEF.nordic.segs = [
  { key: 'nordic_1', name: '霜铁', cn: '一重·霜铁', desc: '冰原初临，霜铁为骨' },
  { key: 'nordic_2', name: '血月', cn: '二重·血月', desc: '血月当空，战鼓未歇' },
  { key: 'nordic_3', name: '极光', cn: '三重·极光', desc: '极光裂天，诸神黄昏' }
];

/* ------------------------------------------------------------
 *  内容登记表
 *
 *  「哪个风格用哪些内容」的唯一真相。dungeon.js / entities.js / items.js
 *  都经这里的读取函数取，**不要再各自判断 STYLE_CUR**。
 *
 *  ⚠️ cn 那几行是**手工抄自各表**的（`ELITE_KEYS` / `BOSS_KEYS` / `enemyPool`）。
 *     抄错不会报错、只会静默换怪，所以 `_t_nordic.js` 有专门的「与老表对齐」
 *     断言钉着（T4/T5）—— 改 cn 的怪表时记得同步这里，测试会提醒你。
 * ---------------------------------------------------------- */
const STYLE_CONTENT = {
  cn: {
    tag: '中',
    name: '中式仙侠',
    roomLabel: {
      start: '静心阁', normal: '石室', boss: '魔窟', treasure: '藏珍阁',
      shop: '坊市', secret: '密室', sacrifice: '祭坛'
    },
    /* 杂兵池按【段】解锁：段一 4 种、段二 +2、段三 +2。
       池内等概率 → 加一种等于稀释全部，所以按段一批一批放（见 dungeon.enemyPool 原注释）。 */
    mobsBySeg: [
      ['xiesui', 'chanchu', 'yinsha', 'xuefu'],
      ['xiesui', 'chanchu', 'yinsha', 'xuefu', 'guixiu', 'shikui', 'bengyao'],
      ['xiesui', 'chanchu', 'yinsha', 'xuefu', 'guixiu', 'shikui', 'bengyao',
        'jianling', 'yingmo', 'xuanguang', 'tiehun', 'xuanjia']
    ],
    elites: ['xiesha', 'youyan', 'jiying', 'wandu', 'duannian'],
    /* 每段一尊（第 5 / 10 / 15 层）。中式共 5 尊，多出来的 裂煞·轮回·烛龙
       只出现在 Boss 挑战模式 —— 挑战菜单用的是完整 BOSS_KEYS，不是这一行。 */
    bosses: ['xuemo', 'baigu', 'liesha'],
    /* ⚠️ gongfa 在中文界面里原称「小技能」（items.js 的老文案），
       这里保持原样不改 —— 改类型名会连带改掉中式的道具卡片，属于计划外的回归。
       北欧那三种叫「神器 / 秘药 / 权能」（用户 2026-09-24 定的名字）。 */
    typeName: { fabao: '法宝', dan: '丹药', gongfa: '小技能' }
  },

  nordic: {
    tag: '北',
    name: '北欧神话',
    roomLabel: {
      start: '英灵殿', normal: '冰原', boss: '巨人之厅', treasure: '龙巢',
      shop: '商栈', secret: '秘窖', sacrifice: '血祭石'
    },
    mobsBySeg: [
      ['draugr', 'hrafn', 'nokk', 'isvarg'],
      ['draugr', 'hrafn', 'nokk', 'isvarg', 'volva', 'skuggi'],
      ['draugr', 'hrafn', 'nokk', 'isvarg', 'volva', 'skuggi', 'rimtroll', 'runestone']
    ],
    elites: ['draugr_jarl', 'frost_jarl', 'hrafn_king', 'nokk_priest', 'rune_warden'],
    bosses: ['fenrir', 'jormungandr', 'surtr'],
    typeName: { fabao: '神器', dan: '秘药', gongfa: '权能' }
  }
};

/* 取某风格的内容表（未登记的一律回落到中式，永不返回 undefined） */
function contentOf(style) {
  return STYLE_CONTENT[style] || STYLE_CONTENT.cn;
}
function styleTagOf(style) { return contentOf(style).tag; }
function roomLabelOf(type, style) { return contentOf(style).roomLabel[type] || contentOf(style).roomLabel.normal; }
function bossKeysOf(style) { return contentOf(style).bosses; }
function eliteKeysOf(style) { return contentOf(style).elites; }
function typeNameOf(type, style) { return contentOf(style).typeName[type] || ''; }

/* ------------------------------------------------------------
 *  北欧 · 杂兵 8 种
 *
 *  ⚠️ **零新战斗逻辑**：`ai` 全部复用 entities.js 里已有的 11 种行为，
 *     所以每一种都只是「一套数值 + 一张图 + 一个已有的行为」。
 *     这是把「北欧 6~8 种新敌人」的成本压下来的关键 ——
 *     ROADMAP 里说的「公式化变体」，真正省下的是行为代码，不是像素。
 *
 *  行为对照（各挑一种，保证北欧这一套自己读起来不重复）：
 *     draugr      chase        直冲近战
 *     hrafn       dash         盘旋 → 突袭
 *     nokk        spit         缓慢游走 + 三连水弹
 *     isvarg      hop          蹦跳逼近（一跳一跳地压上来）
 *     volva       caster       保持中距 + 三连符文弹
 *     skuggi      stealth      潜行，贴近才现形
 *     rimtroll    shieldbash   圆盾冲撞（盾收正面 → 绕后才是解）
 *     runestone   hardcast     慢速大弹，斩不落也回敬不了
 * ---------------------------------------------------------- */
const NORDIC_ENEMY_DEF = {
  draugr: { hp: 14, speed: 1.28, r: 7, touch: 1, coins: 1, spr: 'draugr', ai: 'chase', size: 14, score: 10 },
  hrafn: { hp: 11, speed: 1.15, r: 7, touch: 1, coins: 1, spr: 'hrafn', ai: 'dash', size: 18, score: 12 },
  nokk: { hp: 18, speed: 0.45, r: 8, touch: 1, coins: 2, spr: 'nokk', ai: 'spit', size: 18, score: 14 },
  isvarg: { hp: 12, speed: 1.05, r: 7, touch: 1, coins: 1, spr: 'isvarg', ai: 'hop', size: 16, score: 12 },
  volva: { hp: 16, speed: 0.82, r: 7, touch: 1, coins: 2, spr: 'volva', ai: 'caster', size: 16, score: 18 },
  skuggi: { hp: 14, speed: 1.05, r: 7, touch: 1, coins: 2, spr: 'skuggi', ai: 'stealth', size: 16, score: 20 },
  rimtroll: { hp: 34, speed: 0.55, r: 9, touch: 1, coins: 3, spr: 'rimtroll', ai: 'shieldbash', size: 20, score: 28, shield: true },
  runestone: { hp: 32, speed: 0.48, r: 8, touch: 1, coins: 3, spr: 'runestone', ai: 'hardcast', size: 18, score: 26 }
};

/* ------------------------------------------------------------
 *  北欧 · 尊者 3 尊（每段一尊）
 *
 *  与中式同样建立在「游走 + 冲刺 + 三阶段」的骨架上，只有看家技不同。
 *  bolt / alt 是弹幕色系，取自 sprites.js 的 SPR.bolt 键，不新增美术。
 * ---------------------------------------------------------- */
const NORDIC_BOSS_DEF = {
  fenrir: {
    name: '芬里尔', en: 'FENRIR', hp: 280, spd: 1.05,
    bolt: 'ice', alt: 'blood', aura: PAL.cyan, dash: 220,
    desc: '巨狼贴地扑咬，越到后面越急'
  },
  jormungandr: {
    name: '耶梦加得', en: 'JORMUNGANDR', hp: 320, spd: 0.72,
    bolt: 'orb', alt: 'iron', aura: PAL.green, dash: null,
    desc: '尘世巨蟒盘住整座厅堂，以毒环封路'
  },
  surtr: {
    name: '苏尔特', en: 'SURTR', hp: 350, spd: 0.80,
    bolt: 'flame', alt: 'talisman', aura: PAL.fire, dash: 250,
    desc: '火巨人挥着烈焰之剑，把厅堂烧成熔炉'
  }
};

/* ------------------------------------------------------------
 *  北欧 · 精英 5 种
 *
 *  ⚠️ `base` 必须是**北欧自己的杂兵**（不然精英窟里会蹦出一只中式妖怪）；
 *     `swarmMinion` 是「殒命召出的小怪」的 id —— entities.js 原来把它写死成
 *     `'jianling'` 了，这里改成按精英读，否则「霜巨魔战将」死后掉出两只剑灵。
 *  perk 复用中式那五套（blood / volley / rush / venom / swarm），零新逻辑。
 * ---------------------------------------------------------- */
const NORDIC_ELITE_DEF = {
  draugr_jarl: {
    name: '尸鬼首领', en: 'BARROW', base: 'draugr', perk: 'blood',
    hpMul: 3.0, spdMul: 0.85, scale: 1.5, rMul: 1.5, coins: 9, score: 70,
    aura: NORD.blood, perkCd: 150, desc: '受创减免四成；周身喷薄血箭，死后化血雾'
  },
  frost_jarl: {
    name: '霜巨魔战将', en: 'RIME', base: 'rimtroll', perk: 'swarm', swarmMinion: 'isvarg',
    hpMul: 2.7, spdMul: 1.05, scale: 1.5, rMul: 1.5, coins: 12, score: 85,
    aura: NORD.ice, perkCd: 145, desc: '环形冰针，殒命时召出两只霜狼'
  },
  hrafn_king: {
    name: '渡鸦之王', en: 'ROOK', base: 'hrafn', perk: 'rush',
    hpMul: 2.2, spdMul: 1.4, scale: 1.45, rMul: 1.45, coins: 9, score: 72,
    aura: NORD.runic, perkCd: 80, desc: '瞬影突进，来去无踪；殒命炸出十二枚血弹'
  },
  nokk_priest: {
    name: '溺灵祭司', en: 'DROWNED', base: 'nokk', perk: 'venom',
    hpMul: 3.4, spdMul: 0.8, scale: 1.6, rMul: 1.6, coins: 11, score: 80,
    aura: NORD.moss, perkCd: 135, desc: '毒弹落地成沼，死后毒雾弥漫'
  },
  rune_warden: {
    name: '符文守卫', en: 'WARDEN', base: 'runestone', perk: 'volley',
    hpMul: 3.2, spdMul: 0.9, scale: 1.45, rMul: 1.45, coins: 10, score: 78,
    aura: NORD.beryl, perkCd: 120, desc: '符文三连发并附带灼烧，死后留下火环'
  }
};

/* ------------------------------------------------------------
 *  北欧 · 神器 10 + 秘药 3
 *
 *  说明一律写成**流派中立**的（不出现「飞剑」「挥砍」这种词）——
 *  神器没有 `byStyle`，三个剑法下读的是同一句，写错就会在巨剑流里
 *  说「飞剑可穿透」。中式的 赤焰符 / 引雷符 / 聚灵阵 早就是这个写法，有先例。
 *
 *  `apply` 只用现成的 stats 字段，不引入新钩子 —— 所以这 13 件
 *  和融合产物不同，**没有** `stats.fus` 机制。
 * ---------------------------------------------------------- */
const NORDIC_ITEMS = [
  /* ---------- 神器（被动） ---------- */
  { id: 'mjolnir', name: '妙尔尼尔', type: 'fabao', world: 'nordic', icon: 'hammer',
    c1: NORD.ember, c2: NORD.ironL,
    desc: '命中之处引落雷法，连锁伤害，并将近旁妖物轰开',
    apply: p => { p.stats.chain += 1; p.stats.knockback += 1.5; } },
  { id: 'gungnir', name: '冈格尼尔', type: 'fabao', world: 'nordic', icon: 'spear',
    c1: NORD.amber, c2: NORD.iceL,
    /* ⚠️ 这一件原来只是 `pierce += 3` —— 和中式「飞剑可穿透 2 个」是同一件事，
       只是数字大一号；而且描述写着「排成一列时最痛」，实际三个目标伤害**完全一样**
       （探针 `_probe_gungnir.js` 量过：3.5 / 3.5 / 3.5），描述是假的。
       2026-09-24 用户问「效果是打中三个时伤害递增吗」—— 那其实是融合产物「贯灵梭」
       的机制，冈格尼尔照做就等于又一次换皮。
       → 改成**贯穿即钉住**：被穿过的妖物原地定住 0.3 秒。
         与贯灵梭是**两个维度**（控制 vs 伤害），互补而不是重叠，
         也贴合「永恒之枪」穿刺钉住的意象：排成一列时就是一串糖葫芦。 */
    desc: '贯穿 3 个妖物，并把穿过的都钉在原地 0.3 秒',
    apply: p => {
      p.stats.pierce += 3;
      // 数值型可叠加，但定身时间要封顶，否则拿到第三件就成了「站在原地看戏」
      p.stats.pin = Math.min((p.stats.pin || 0) + 18, 48);
    } },
  { id: 'freyr_sword', name: '弗雷之剑', rare: true, type: 'fabao', world: 'nordic', icon: 'sword',
    c1: NORD.ice, c2: NORD.berylL,
    /* ⚠️ 这一件原先是 `stats.homing += …` —— 跟中式「混元珠」几乎是同一件东西
       （数值只差 0.01），北欧玩家拿到手只会觉得「换了个名字」。
       2026-09-24 用户指出重叠并给了方向：「射出去之后可以重新转向一次」。
       → 改成 reAim：**不给 homing**。
         · 混元珠 = 一路微调、黏着目标（制导）
         · 弗雷之剑 = 直着飞出去，飞出 0.23 秒后若前方有妖物，**猛地折一次**（回身再斩）
       两者都是「不用瞄」，但**行为形状完全不同**：一条是贴着走的曲线，一条是折了一道的直线。 */
    desc: '刃光直飞而出，途中自行折向妖物一次',
    func: true,
    apply: (p, rank) => {
      // 一阶折 1 次，二阶起「回身再斩」折 2 次，三阶再折得更急
      p.stats.reAim = Math.max(p.stats.reAim, rank >= 1 ? 2 : 1);
      if (rank >= 2) p.stats.reAimArc = Math.max(p.stats.reAimArc, 0.44);
    },
    up: ['回身再斩：射出后可折返 2 次', '折得更急（转向 +47%）'] },
  { id: 'draupnir', name: '德罗普尼尔', type: 'fabao', world: 'nordic', icon: 'ring',
    c1: NORD.amber, c2: NORD.amberD,
    desc: '每九夜自生八枚 —— 灵石掉落 +2、气运 +1',
    apply: p => { p.stats.greed += 2; p.stats.luck += 1; } },
  { id: 'idunn_apple', name: '伊登之苹果', type: 'fabao', world: 'nordic', icon: 'apple',
    c1: NORD.moss, c2: NORD.berylL,
    /* ⚠️ 文案单位是「颗心」（与中式的洗髓丹同一口径：`+= 4` 写「+2」），
       不是内部的半心单位。写错单位玩家会把 1 颗心当成 2 颗。
       另：它与洗髓丹同属「加血上限 + 回满」（数值 1 颗心 vs 2 颗心，属同类不同档），
       但神话里伊登的苹果是让诸神**保持青春不老** —— 所以再给一条续航：
       每进新层自动回满。加血的是洗髓丹，不断回春的是伊登之苹果。 */
    desc: '气血上限 +1 并立刻回满；此后每进新层自动回满气血',
    apply: p => { p.maxHP += 2; p.hp = p.maxHP; p.stats.layerHeal = true; } },
  { id: 'mimir_well', name: '密米尔之泉', type: 'fabao', world: 'nordic', icon: 'rune',
    c1: NORD.ice, c2: NORD.runic,
    desc: '饮下即得智慧 —— 灵力自然回复 +1/秒，气运 +2',
    apply: p => { p.stats.mpRegen += 1; p.stats.luck += 2; } },
  { id: 'fenrir_fang', name: '芬里尔之牙', rare: true, type: 'fabao', world: 'nordic', icon: 'wolf',
    c1: NORD.iron, c2: NORD.bloodL,
    desc: '16% 概率撕出双倍伤害，且身法 +8%',
    func: true,
    apply: (p, rank) => { p.stats.crit += (rank > 0 ? 0.12 : 0.16); p.stats.speed *= (rank > 0 ? 1.03 : 1.08); },
    up: ['撕咬更狠：暴击率累计 28%（双倍伤害）', '狼性尽显：暴击率累计 40%（双倍伤害）'] },
  { id: 'raven_cloak', name: '鸦羽斗篷', rare: true, type: 'fabao', world: 'nordic', icon: 'raven',
    c1: NORD.ironD, c2: NORD.runicL,
    desc: '受创后的无敌时间延长 30 帧，身法 +12%',
    apply: p => { p.stats.iframe += 30; p.stats.speed *= 1.12; } },
  { id: 'jotun_plate', name: '约顿海姆之铠', type: 'fabao', world: 'nordic', icon: 'helm',
    c1: NORD.iron, c2: NORD.iceD,
    /* ⚠️ 两处问题：
       ① 原文案「受创不易踉跄」是**凭空写的** —— 玩家没有踉跄/被击退机制（同中式羽衣）。
       ② 它和羽衣是同一类（护盾 + 移速），且移速数值还不到羽衣的一半，等于「弱化版羽衣」。
       → 改成**厚甲**：护盾给足（+3，羽衣只有 +1）、不给移速。
         于是两件形成明确对立：羽衣 = 快而薄，约顿铠 = 厚而不快。 */
    desc: '常驻护盾 +3（受击才扣），每清一室自行补回 1 格',
    apply: p => { p.addShield(3); p.stats.shieldRegen = (p.stats.shieldRegen || 0) + 1; } },
  { id: 'yggdrasil_seed', name: '世界树之种', rare: true, type: 'fabao', world: 'nordic', icon: 'tree',
    c1: NORD.moss, c2: NORD.amberL,
    /* ⚠️ 这里原来是 `maxHP += 1` —— **半颗心的血上限**。
       血上限的内部单位是半心，而 HUD 按 `ceil(maxHP/2)` 画整颗心，
       于是「3 颗整心 + 1 颗只有一半容量的心」会**永远显示成半心**：
       满血时看起来就像掉了一半血，而且与「真的掉了半颗血」完全同形。
       2026-09-24 用户试玩就是这么发现「第四滴血和前三滴不一样」的。
       → 血上限一律给偶数（整颗容器），这条有断言钉着（`_t_audit.js`）。 */
    desc: '每清一室回复 1 点气血，气血上限 +1',
    apply: p => { p.stats.regen += 1; p.maxHP += 2; p.hp += 2; } },

  /* ---------- 秘药（即时生效） ---------- */
  { id: 'mead', name: '蜜酒', type: 'dan', world: 'nordic', icon: 'horn',
    c1: NORD.amber, c2: NORD.boneD,
    desc: '饮下回复 4 点气血',
    apply: p => { p.heal(4); } },
  { id: 'rune_stone', name: '卢恩石', type: 'dan', world: 'nordic', icon: 'rune',
    c1: NORD.runic, c2: NORD.iceL,
    /* ⚠️ 原来是 `addShield(2)` —— 与中式「太虚护盾」「灵力丹」**数值完全一样**
       （探针 `_probe_dup_audit.js` 一跑就抓出来），属于最赤裸的换皮。
       卢恩（Rune）在神话里是奥丁以自身换来的「智慧」，所以改走**灵力**这条路：
       立刻回满灵力 + 1 格护盾 —— 中式没有任何一件是「即时回灵」的
       （回灵符是每秒 +1 的持续回复，不是一口气回满，两者手感完全不同）。 */
    desc: '刻下卢恩，灵力尽复，并凝出一层护盾',
    apply: p => { p.mp = p.maxMP; p.addShield(1); } },
  { id: 'einherjar_blood', name: '英灵之血', type: 'dan', world: 'nordic', icon: 'pill',
    c1: NORD.blood, c2: NORD.ember,
    /* 「加血上限 + 回满」与中式洗髓丹同类（数值不同：1 颗心 vs 2 颗心，属同类不同档，
       本身不算换皮）。再补一条中式秘药没有的效果 —— **战意无敌 1 秒**：
       英灵战士「战死前的一搏」，喝下去有个短暂的强攻窗口。 */
    desc: '气血上限 +1，立刻回满，并燃起 1 秒战意（无敌）',
    apply: p => { p.maxHP += 2; p.hp = p.maxHP; p.invuln = Math.max(p.invuln, 60); } }
];

/* ------------------------------------------------------------
 *  北欧 · 权能 5 门（对应中式的「功法」）
 *
 *  与小技能同一套契约：`SKILL_DEF[id] = { cost, vals[1..5], cd[1..5], desc(lv), cast(g,lv) }`。
 *  五门各解决一件事，且**不与中式那六门重复**：
 *     thunderwrath 雷神之怒  —— 全室雷击（中式天雷引的北欧版，附带连锁）
 *     fimbulwinter 芬布尔之冬—— 全室冰封（中式没有任何一门是「控场」，这是新的）
 *     mistcloak    雾隐      —— 隐身无敌 + 提速（中式五行遁术只给无敌）
 *     runeward     符文护壁  —— 结盾 + 震开 + 清弹（中式护体金光同型，数值不同）
 *     ravenhost    渡鸦群袭  —— 三道具穿透剑气（中式裂空斩是单道）
 * ---------------------------------------------------------- */
const NORDIC_SKILLS = {
  thunderwrath: {
    id: 'thunderwrath', name: '雷神之怒', en: 'THUNDER WRATH', icon: 'thunder',
    c1: NORD.ice, c2: NORD.amberL, cost: 36, world: 'nordic',
    vals: [15, 21, 27, 33, 40],
    cd: [360, 330, 300, 270, 240],
    stun: [24, 30, 36, 42, 48],          // 全室钉住帧数（0.4 → 0.8 秒）
    desc: lv => '召下九道雷霆，重创全室并把妖物钉在原地 '
      + (NORDIC_SKILLS.thunderwrath.stun[lv - 1] / 60).toFixed(1) + ' 秒　伤害 '
      + (NORDIC_SKILLS.thunderwrath.vals[lv - 1] + 14) + '（另加伤害 ×1.6）'
      + '　冷却 ' + (NORDIC_SKILLS.thunderwrath.cd[lv - 1] / 60).toFixed(1) + ' 秒',
    cast(g, lv) {
      const p = g.player;
      const dmg = NORDIC_SKILLS.thunderwrath.vals[lv - 1] + p.stats.damage * 1.6;
      /* ⚠️ 原来这一段与中式「天雷引」逐行相同（伤害 + zaps + 粒子）—— 纯换皮。
         现在多一件事：**全室被雷震得钉在原地**（复用冈格尼尔的 pin）。
         天雷引 = 纯输出；雷神之怒 = 输出 + 控场。 */
      const stun = NORDIC_SKILLS.thunderwrath.stun[lv - 1];
      SFX.thunder(); g.shake(12);
      for (const e of g.enemies) {
        if (e.dead) continue;
        e.hurt(dmg, g);
        e.pin = Math.max(e.pin, stun);
        g.zaps.push({ x1: e.x, y1: 0, x2: e.x, y2: e.y, life: 16 });
        g.burst(e.x, e.y, 10, PAL.cyan);
      }
      for (let i = 0; i < 40; i++) {
        g.particles.push(new Particle(Math.random() * ROOM_W, 0, 0, 4 + Math.random() * 4, 30, PAL.cyan, 2, 0));
      }
    }
  },

  fimbulwinter: {
    id: 'fimbulwinter', name: '芬布尔之冬', en: 'FIMBULWINTER', icon: 'frost',
    c1: NORD.iceL, c2: NORD.iceD, cost: 32, world: 'nordic',
    /* vals = 冰封帧数。它不是伤害技 —— 是**买时间**的技：
       全室定住 2.5~4.5 秒，足够清掉一半、或者从被围里走出来。 */
    vals: [150, 180, 210, 240, 270],
    cd: [600, 570, 540, 510, 480],
    desc: lv => '寒冬降临，全室妖物冰封 ' + (NORDIC_SKILLS.fimbulwinter.vals[lv - 1] / 60).toFixed(1)
      + ' 秒（冰封期间行动迟缓）　冷却 ' + (NORDIC_SKILLS.fimbulwinter.cd[lv - 1] / 60).toFixed(1) + ' 秒',
    cast(g, lv) {
      const p = g.player;
      const dur = NORDIC_SKILLS.fimbulwinter.vals[lv - 1];
      const dmg = 6 + (lv - 1) * 4;
      SFX.freeze ? SFX.freeze() : SFX.cast();
      g.shake(8);
      for (const e of g.enemies) {
        if (e.dead) continue;
        e.frost = Math.max(e.frost, dur);
        if (e.isBoss) continue;                 // 尊者只减速不受额外伤害，免得变成无脑晕杀
        e.hurt(dmg, g);
        g.burst(e.x, e.y, 8, PAL.cyan);
      }
      g.burst(p.x, p.y, 30, PAL.cyan);
      g.floaters.push(new Floater(p.x, p.y - 26, 'FIMBULWINTER', PAL.cyanD));
    }
  },

  mistcloak: {
    id: 'mistcloak', name: '雾隐', en: 'MIST CLOAK', icon: 'knot',
    c1: NORD.ironL, c2: NORD.runic, cost: 28, world: 'nordic',
    vals: [180, 225, 270, 315, 360],         // 无敌帧数
    cd: [540, 504, 468, 432, 396],
    desc: lv => '化入雾中，' + (NORDIC_SKILLS.mistcloak.vals[lv - 1] / 60).toFixed(1)
      + ' 秒内不染尘劫，身法 +' + (30 + (lv - 1) * 5) + '%'
      + '　冷却 ' + (NORDIC_SKILLS.mistcloak.cd[lv - 1] / 60).toFixed(1) + ' 秒',
    cast(g, lv) {
      const p = g.player;
      p.invuln = Math.max(p.invuln, NORDIC_SKILLS.mistcloak.vals[lv - 1]);
      /* 提速取「更长的一段」而不是叠加 —— 连续两开也不该滚出离谱的移速。
         （同一门权能的 mul 只由等级决定，所以直接赋值就是「取更长的那段」。） */
      const mul = (30 + (lv - 1) * 5) / 100;
      const dur = NORDIC_SKILLS.mistcloak.vals[lv - 1];
      p.buffs.spdMul = mul;
      p.buffs.spdT = Math.max(p.buffs.spdT || 0, dur);
      g.burst(p.x, p.y, 24, PAL.greyL);
      g.floaters.push(new Floater(p.x, p.y - 26, 'MIST', PAL.greyL));
      SFX.pickup();
    }
  },

  runeward: {
    id: 'runeward', name: '符文护壁', en: 'RUNEWARD', icon: 'shield2',
    c1: NORD.ice, c2: NORD.runicL, cost: 24, world: 'nordic',
    vals: [2, 3, 3, 4, 4],
    cd: [600, 600, 600, 600, 600],
    dur: 300,
    /* ⚠️ 原来这一门与中式「护体金光」几乎一样（限时护盾 + 击退 + 范围伤害），
       差别只有「顺手清一次全屏弹幕」—— 探针 `_probe_dup_audit.js` 把两件的
       效果字段标成同一类。现在改成**定点持续 5 秒的符文壁**：
       释放点立起一个领域，期间进入范围的敌方弹幕尽数消解。
       于是两者的用途彻底分开：
         护体金光 = **冲开**（瞬发护盾 + 击退，用来突围）
         符文护壁 = **守住**（定点禁区 5 秒，用来站桩输出 / 掩护换位）
       玄铁弹照旧穿得进来 —— 它本来就「斩不落、照不穿」，壁也不例外。 */
    desc: lv => '刻下符文，震退周身妖物并结 ' + NORDIC_SKILLS.runeward.vals[lv - 1] + ' 层护盾；'
      + '原地立起符文壁 ' + (NORDIC_SKILLS.runeward.dur / 60) + ' 秒，壁内敌方弹幕尽消'
      + '　范围 ' + (140 + (lv - 1) * 20) + '　伤害 ' + (6 + (lv - 1) * 3)
      + '　冷却 ' + (NORDIC_SKILLS.runeward.cd[lv - 1] / 60) + ' 秒',
    cast(g, lv) {
      const p = g.player, R = 140 + (lv - 1) * 20, dmg = 6 + (lv - 1) * 3;
      p.addShield(NORDIC_SKILLS.runeward.vals[lv - 1], NORDIC_SKILLS.runeward.dur);
      g.shake(8);
      for (const e of g.enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) < R) {
          const a = Math.atan2(e.y - p.y, e.x - p.x);
          e.kbx += Math.cos(a) * 12; e.kby += Math.sin(a) * 12;
          e.hurt(dmg, g);
        }
      }
      g.runeWall = { x: p.x, y: p.y, r: 118 + (lv - 1) * 10, t: NORDIC_SKILLS.runeward.dur };
      g.burst(p.x, p.y, 30, PAL.cyan);
      SFX.pickup();
    }
  },

  ravenhost: {
    /* ⚠️ 配色必须与神器「鸦羽斗篷」拉开（同形状 + 同配色 = 同一个位图，
       两者都是 raven）。`_t_audit.js` ⑫ 会把撞车的抓出来。 */
    id: 'ravenhost', name: '渡鸦群袭', en: 'RAVEN HOST', icon: 'raven',
    c1: NORD.ironD, c2: NORD.iceL, cost: 30, world: 'nordic',
    vals: [11, 15, 19, 23, 27],              // 每道剑气的基础伤害（另加伤害 ×1.5）
    cd: [330, 300, 270, 240, 210],
    desc: lv => '放出三只渡鸦，各拖一道贯通剑气并自行折向妖物　伤害 '
      + (NORDIC_SKILLS.ravenhost.vals[lv - 1] + 4) + '（另加伤害 ×1.5）'
      + '　冷却 ' + (NORDIC_SKILLS.ravenhost.cd[lv - 1] / 60).toFixed(1) + ' 秒',
    cast(g, lv) {
      const p = g.player;
      const a = ultAimAngle(p);
      const dmg = NORDIC_SKILLS.ravenhost.vals[lv - 1] + p.stats.damage * 1.5;
      SFX.slash(1); g.shake(6);
      /* 三只渡鸦：中间一只直飞，两侧各偏 0.16 弧度 ——
         贴脸放会三只全中（痛），远放则铺开成一道扇形（清列）。 */
      for (let i = -1; i <= 1; i++) {
        const aa = a + i * 0.16;
        g.bullets.push(new Bullet(
          p.x + Math.cos(aa) * 12, p.y - 2 + Math.sin(aa) * 8,
          Math.cos(aa) * 7.0, Math.sin(aa) * 7.0,
          {
            friendly: true, dmg: dmg, r: 8, life: 44, pierce: 99,
            /* ⚠️ 这一门原来几乎就是中式「裂空斩」的复制品（连 dmg 公式都一样，
               只是把一道剑气摊成三道）—— 探针 `_probe_dup_audit.js` 抓出来的。
               渡鸦是**活的**：飞出 0.23 秒后各自折向附近的妖物（复用弗雷之剑的 reAim）。
               于是它和裂空斩的区别不止「数量」：裂空斩是一条直线，
               渡鸦是三条会拐弯、会各自找目标的曲线 —— 远处铺开、近处合围。 */
            reAim: 1, reAimArc: 0.26,
            knockback: 1.4, crit: Math.random() < p.stats.crit,
            burn: p.stats.burn, frost: p.stats.frost, chain: p.stats.chain,
            deflect: p.stats.deflect, fus: p.stats.fus,
            kind: 'rift', sprite: SPR.riftwave, scale: 0.9
          }
        ));
      }
    }
  }
};
