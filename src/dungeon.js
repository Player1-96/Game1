'use strict';
/* ============================================================
 *  dungeon.js —— 以撒式地宫生成
 *  房间拓扑：网格随机扩展 + BFS 距离 + 特殊房间规则
 * ============================================================ */

const TILE = 32;
const ROOM_COLS = 15, ROOM_ROWS = 9;
const ROOM_W = ROOM_COLS * TILE;   // 480
const ROOM_H = ROOM_ROWS * TILE;   // 288

/* 0=北 1=东 2=南 3=西 */
const DIRS = [
  { dx: 0, dy: -1, opp: 2, name: 'n' },
  { dx: 1, dy: 0, opp: 3, name: 'e' },
  { dx: 0, dy: 1, opp: 0, name: 's' },
  { dx: -1, dy: 0, opp: 1, name: 'w' }
];

const RT = { START: 'start', NORMAL: 'normal', BOSS: 'boss', TREASURE: 'treasure', SHOP: 'shop', SECRET: 'secret', SACRIFICE: 'sacrifice' };

const ROOM_LABEL = {
  start: '静心阁', normal: '石室', boss: '魔窟', treasure: '藏珍阁',
  shop: '坊市', secret: '密室', sacrifice: '祭坛'
};

/* ------------------------------------------------------------
 *  动态难度
 *  powerScore() 把玩家的法宝与属性折算成一个「相对裸装」的倍数（裸装 = 1.0）。
 *  层数只提供一条很缓的基础曲线，真正的强度来自校正项：法宝越多越杂，
 *  妖物就越硬 —— 修掉「一层尚可、二层之后毫无压力」的断崖。
 *
 *  校正走凹曲线（threat^0.45）：既让二层之后明显吃紧，又保证后期不会
 *  变成纯粹的加血墙，玩家始终能感到自己在变强。三个旋钮都在这一处，便于调。
 * ---------------------------------------------------------- */
const POWER_BASE = 1.0;          // 裸装实力分（powerScore 的基准）
const DIFF_POW = 0.45;           // 血量校正指数：越大越硬
const DIFF_CNT_POW = 0.12;       // 数量校正指数：比血量温和得多，免得糊屏

/* ------------------------------------------------------------
 *  层段系统（一局切成 3 段，每段 SEG_FLOORS 层）
 *
 *  ⚠️ 这套常量放在 dungeon.js 而不是 game.js —— 因为脚本加载顺序是
 *     dungeon.js → entities.js → game.js，而 dungeon.js 在生成房间时
 *     （new Floor()）就要用到「这一层属于第几段」。放在 game.js 里会形成
 *     「下层依赖上层」的倒挂，且一旦将来有人在模块顶层调用就会 TDZ 崩。
 *     game.js 通过 STYLE_SYS 再引用这几个值（见那边注释）。
 *
 *  段是**所有跨层节奏的统一单位**：
 *    · Boss      → 每段一个（段末）
 *    · 产出衰减  → 每段降一档（不再是每层）
 *    · 难度封顶  → 按段放宽
 *    · 风格选择  → 每段开头弹一次
 *  「一段 = 一个完整小章节」—— 不管这段是 3 层还是 5 层，段落节奏不变。
 * ---------------------------------------------------------- */
const SEG_COUNT = 3;             // 一局固定 3 段
const SEG_FLOORS = 5;            // 每段 5 层 → 15 层（主玩法）
const SEG_TOTAL_FLOORS = SEG_FLOORS * SEG_COUNT;   // 15

/* 某一层属于第几段（0-based）。1~5 层 → 0 段；6~10 → 1 段；11~15 → 2 段 */
function segOf(depth) {
  return clamp(Math.floor((Math.max(1, depth) - 1) / SEG_FLOORS), 0, SEG_COUNT - 1);
}
/* 这一层是不是「段末」（该出 Boss / 该结算这一段） */
function isSegLastFloor(depth) {
  return Math.max(1, depth) % SEG_FLOORS === 0;
}
/* 这一层是不是「段首」（该弹选风格），第一层除外（开局已经选过了） */
function isSegFirstFloor(depth) {
  return depth > 1 && (depth - 1) % SEG_FLOORS === 0;
}
/* 段内进度：0 → 1 之间（本段第 1 层 = 0，最后 1 层 = 1 - 1/FLOORS）。
   跨层曲线用它而不是 depth，才能在「每段 5 层 / 每段 3 层」下都保持同样的爬升形状。
   --- 这一条是 15 层化的关键：原先所有曲线都写 `depth * k`，在 5 层制下正好爬满；
       拉到 15 层要么早早在第 4~5 层撞顶、之后十层不动，要么爬得太慢显得没变化。 */
function segProgress(depth) {
  const d = Math.max(1, depth);
  return ((d - 1) % SEG_FLOORS) / SEG_FLOORS;
}
/* 全局进度：0 → 1（第 1 层 = 0，最后一层 = 1）。用于「整局尺度」的曲线。 */
function runProgress(depth) {
  return clamp((Math.max(1, depth) - 1) / (SEG_TOTAL_FLOORS - 1), 0, 1);
}

/* 难度封顶：随段放宽的三档。
   原先固定 DIFF_MAX = 3.0 —— 那是给 5 层制定的，实测战力到 12 就撞顶，
   15 层制下后 5 层难度**完全不动**。改成段末逐段放宽，让后期仍有压力。 */
const DIFF_MAX_BY_SEG = [3.0, 3.8, 4.6];
/* 兼容别名：第一段的封顶值。老的探针 / 导出脚本 / 文档都在引用 DIFF_MAX，
   语义仍是「一段的封顶」，只是现在它会随段放宽。新代码请用 diffMaxOfSeg()。 */
const DIFF_MAX = DIFF_MAX_BY_SEG[0];
const DIFF_MIN = 0.8;
/* 段末 Boss 的额外厚度：它是一段的收束，要比同层杂兵更有一道坎的分量。
   只作用于 Boss（见 genRoom 的 RT.BOSS 分支），不抬高普通妖物。 */
const BOSS_SEG_MUL = [1.00, 1.18, 1.36];

function diffMaxOfSeg(seg) {
  return DIFF_MAX_BY_SEG[clamp(seg | 0, 0, DIFF_MAX_BY_SEG.length - 1)];
}

/* 某一位尊者「镇守」的层数 —— 也就是它所属那一段的段末（第 5 / 10 / 15 层）。
   ⚠️ 不要再用 `BOSS_KEYS.indexOf(id) + 1`：那是「按层取人」时代的换算，
      现在 Boss 只在段末出现，索引 0 会算出第 1 层 —— 而第 1 层根本没有 Boss 房，
      挑战模式会开成一张没有头目的普通图（选了血魔却打空气）。
   `bossSlotOf` 反过来用：先由 id 求段，再由段求段末层。 */
function bossFloorOf(id) {
  const idx = Math.max(0, BOSS_KEYS.indexOf(id));
  return (Math.min(idx, SEG_COUNT - 1) + 1) * SEG_FLOORS;
}
function bossOrdinalOf(id) {           // 该尊者是第几个（0 起），非 BOSS_KEYS 里的一律 0
  return Math.max(0, Math.min(BOSS_KEYS.length - 1, BOSS_KEYS.indexOf(id)));
}

function difficultyOf(depth, power) {
  const threat = clamp((power || POWER_BASE) / POWER_BASE, 0.5, 40);
  const mult = clamp(Math.pow(threat, DIFF_POW), DIFF_MIN, diffMaxOfSeg(segOf(depth)));
  const count = clamp(Math.pow(threat, DIFF_CNT_POW), 0.85, 1.5);
  const tag = mult <= 0.95 ? '缓' : (mult <= 1.15 ? '平' : (mult <= 1.5 ? '险' : (mult <= 2.0 ? '危' : '绝')));
  return { threat: +threat.toFixed(2), mult: +mult.toFixed(3), count: +count.toFixed(3), tag };
}

/* ------------------------------------------------------------
 *  产出的衰减（心血 / 灵力珠）—— 按【段】而不是按【层】
 *
 *  难度并不是被「敌人变强」拉平的，而是被「补给变多」拉平的：
 *  后期 build 成型 → 清怪更快、怪数量也上来了（count 最多 ×1.5），
 *  气运又被乾坤袋 / 金丹抬起来 —— 三者一叠加，杀一只妖的补给期望反而比一层更高，
 *  于是越到后面越不缺，难度直线下降。
 *
 *  ⚠️ 关键改动：衰减单位从「每层」改成「每段」。
 *     按层算的话，原来的 5 层制 `0.82^4 ≈ 0.45`、6 层 `0.37`，手感正好；
 *     但拉到 15 层就是 `0.82^14 ≈ 0.060` —— 血量与灵力掉率只剩 6%，
 *     玩家会陷入「血包几乎不掉、怪却越来越厚」的绝境，那不是难度是死局。
 *     改成每段降一档（15 层只降 2 次）：`0.82^2 ≈ 0.67`，与原来 5~6 层的手感对齐。
 *
 *  气运仍在这条下降的基线上加成（加完再乘衰减），不会抵消衰减本身。
 *  注意只压血量与灵力两条命脉，灵石另有 planEconomy 的整层配额管着，不在此列。
 * ---------------------------------------------------------- */
const LOOT_DECAY = 0.82;         // 每深【一段】，心血 / 灵力珠的产出期望 ×0.82
function lootScale(depth) {
  return Math.pow(LOOT_DECAY, segOf(depth));
}

class Room {
  constructor(gx, gy) {
    this.gx = gx; this.gy = gy;
    this.key = gx + ',' + gy;
    this.type = RT.NORMAL;
    this.doors = [false, false, false, false];   // 是否有门
    this.doorOpen = [false, false, false, false]; // 门是否已开
    this.doorHidden = [false, false, false, false]; // 隐藏通道（符文墙）
    this.doorHp = [0, 0, 0, 0];
    this.neighbors = [null, null, null, null];
    this.dist = 0;
    this.visited = false;
    this.seen = false;
    this.cleared = false;
    this.spawns = [];        // 待实例化的敌人
    this.waves = [];         // 波次：[[spawnIdx...]]
    this.waveIdx = 0;
    this.props = [];         // 装饰 / 交互物
    this.obstacles = [];     // 障碍 {x,y,w,h}
    this.bg = null;          // 预渲染背景
    this.secretFound = false;
    /* 经济：由 Floor.planEconomy 按层分配 */
    this.coinPool = 0;       // 本房灵石配额，敌人掉落与清房奖励都从里出
    this.drops = [];         // 本房落地未拾取的掉落物记录（离开房间不丢失）
    this.keyDrop = false;    // 本层规划的钥匙是否掉在这里
    this.elite = null;       // 本层若被选为精英窟，记录精英种类（ELITE_DEF 的 key）
    this.bombDrop = false;   // 本层规划的雷符是否掉在这里
  }
  get isSpecial() { return this.type !== RT.NORMAL && this.type !== RT.START; }
}

class Floor {
  /* opts: { power —— 进入本层时玩家的实力分，owned —— 已持有法宝 id 列表 } */
  constructor(depth, seed, opts) {
    this.depth = depth;
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.rooms = new Map();
    this.size = depth >= 4 ? 8 : 7;
    this.opts = opts || {};
    this.owned = this.opts.owned || [];
    this.slots = this.opts.slots || [];      // 玩家的小技能槽，供坊市挑货时避开已满级的
    /* Boss 覆写：挑战模式要能单挑任意一位尊者，而正常流程是「按段取人」。
       没有这个口子的话，选了烛龙（索引 4）会算出 depth=5 → 段 0，
       结果打的还是血魔尊者 —— 挑战模式静默失效。 */
    this.bossOverride = this.opts.boss || null;
    this.diff = difficultyOf(depth, this.opts.power || POWER_BASE);
    this.hasElite = false;
    this.hasSecret = false;
    this.generate();
  }
  key(gx, gy) { return gx + ',' + gy; }
  get(gx, gy) { return this.rooms.get(this.key(gx, gy)) || null; }
  inBounds(gx, gy) { return gx >= 0 && gy >= 0 && gx < this.size && gy < this.size; }

  addRoom(gx, gy) {
    const r = new Room(gx, gy);
    this.rooms.set(r.key, r);
    return r;
  }
  link(a, dir) {
    const b = this.get(a.gx + DIRS[dir].dx, a.gy + DIRS[dir].dy);
    if (!b) return false;
    a.doors[dir] = true; b.doors[DIRS[dir].opp] = true;
    a.neighbors[dir] = b.key; b.neighbors[DIRS[dir].opp] = a.key;
    return true;
  }
  degree(r) { return r.doors.reduce((s, d) => s + (d ? 1 : 0), 0); }

  generate() {
    const rng = this.rng;
    const target = Math.min(20, 11 + Math.floor(rng() * 4) + Math.min(3, this.depth));
    const cx = Math.floor(this.size / 2), cy = Math.floor(this.size / 2);
    const start = this.addRoom(cx, cy);
    start.type = RT.START;

    /* 1) 随机扩展：反复挑一个已有房间向空位生长（以撒的紧凑型拓扑） */
    let guard = 0;
    const list = [start];
    while (this.rooms.size < target && guard++ < 4000) {
      const base = list[Math.floor(rng() * list.length)];
      const dir = Math.floor(rng() * 4);
      const nx = base.gx + DIRS[dir].dx, ny = base.gy + DIRS[dir].dy;
      if (!this.inBounds(nx, ny) || this.get(nx, ny)) continue;
      // 限制分叉：相邻已有房间过多则不生成（避免糊成一团）
      let around = 0;
      for (const d of DIRS) if (this.get(nx + d.dx, ny + d.dy)) around++;
      if (around > 2 && rng() < 0.7) continue;
      const r = this.addRoom(nx, ny);
      this.link(base, dir);
      list.push(r);
    }

    /* 2) BFS 距离 */
    for (const r of this.rooms.values()) r.dist = -1;
    start.dist = 0;
    const q = [start];
    while (q.length) {
      const r = q.shift();
      for (let d = 0; d < 4; d++) {
        const n = r.neighbors[d] && this.rooms.get(r.neighbors[d]);
        if (n && n.dist < 0) { n.dist = r.dist + 1; q.push(n); }
      }
    }

    /* 3) 特殊房间分配（以撒规则：死胡同优先） */

    /* Boss 房只在【段末】出现 —— 一局 15 层只有 3 个 Boss（第 5 / 10 / 15 层）。
       原先每层都有 Boss 房、且头目按 BOSS_KEYS[depth-1] 取，
       于是 5 位尊者撑不起 15 层：第 6~15 层会连着打 10 次烛龙（实测确认）。
       改成按段之后，层数与 Boss 数量彻底解耦 —— 每段仍是一个完整章节。 */
    const hasBoss = isSegLastFloor(this.depth);
    this.hasBoss = hasBoss;
    const all = [...this.rooms.values()];
    const deadEnds = all.filter(r => r.type === RT.NORMAL && this.degree(r) === 1)
      .sort((a, b) => b.dist - a.dist);
    const far = all.filter(r => r.type === RT.NORMAL).sort((a, b) => b.dist - a.dist);

    // Boss：距离最远的死胡同（只在该出 Boss 的层占位，其余层的死胡同留给别的特殊房）
    let boss = null;
    if (hasBoss) {
      boss = deadEnds.shift() || far[0];
      if (!boss) boss = all[all.length - 1];
      boss.type = RT.BOSS;
    }
    this.bossRoom = boss;

    // 藏珍阁 / 坊市 / 祭坛：其余死胡同（回退也必须落在死胡同，否则会挡住一条支路）
    const take = (arr) => { const r = arr.shift(); return r || null; };
    const leaf = r => r.type === RT.NORMAL && this.degree(r) === 1 && r.dist >= 2;
    const t1 = take(deadEnds) || take(far.filter(leaf));
    if (t1) t1.type = RT.TREASURE;
    const s1 = take(deadEnds) || take(far.filter(leaf));
    if (s1) s1.type = RT.SHOP;
    /* 祭坛在无 Boss 层要占一个额外死胡同 —— 非 Boss 层的房间池多一个名额。
       若真拿不到死胡同（房间太少），宁可不出祭坛也不占用通路。 */
    const a1 = take(deadEnds) || (hasBoss ? null : take(far.filter(leaf)));
    if (a1 && a1 !== boss) a1.type = RT.SACRIFICE;

    /* 4) 精英窟 + 密室（都按概率，且密室优先藏进精英窟） */
    const cells = this.collectSecretCells();
    this.planElite(cells);
    this.planSecret(cells);

    /* 5) 门初始状态 */
    for (const r of this.rooms.values()) {
      for (let d = 0; d < 4; d++) {
        r.doorOpen[d] = !r.doors[d] ? false : (r.type === RT.START ? true : false);
      }
    }

    /* 6) 生成房间内容 */
    for (const r of this.rooms.values()) this.populate(r);

    /* 7) 经济规划：产出按层锁死，钥匙/雷符按锁数配给 */
    this.planEconomy();
  }

  /* 可放密室的空位：只接普通房/起始房。若接上已分配的特殊房（藏珍阁/坊市/祭坛/Boss），
     会给它多开一扇门，把它从死胡同顶成走廊 —— 这正是特殊房不在死胡同的真凶。 */
  collectSecretCells() {
    const cands = [];
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
      if (this.get(x, y)) continue;
      const connects = [];
      for (let d = 0; d < 4; d++) {
        const n = this.get(x + DIRS[d].dx, y + DIRS[d].dy);
        if (n) connects.push({ n, d });
      }
      if (!connects.length) continue;
      if (connects.some(c => c.n.isSpecial)) continue;
      cands.push({ x, y, connects });
    }
    return cands;
  }

  /* 精英窟：并非每层必有，越深越常见（起始房之外的普通房）。
     优先挑「旁边还有空位」的房间 —— 密室要塞进它墙里，四面被占就换一间。 */
  planElite(cells) {
    const rng = this.rng;
    this.eliteRoom = null;
    this.hasElite = false;
    /* ⚠️ 这一条也是按【段】铺开的。
       原先 `0.38 + (depth-1)*0.11` 在 5 层制下正好从 38% 爬到 85%；
       拉到 15 层就会在第 6 层撞顶、之后 10 层恒为 85% —— 「每层都有精英窟」等于没有节奏。
       改成按段：段一 42% → 段二 60% → 段三 80%，每段一档，爬满 15 层。 */
    /* 拉满三段：42% / 65% / 82%（实测成效率约 38 / 68 / 81 —— 起始房与 dist=0 的房
       不能放精英窟，所以设定值要略高于期望值）。 */
    const p = [0.46, 0.65, 0.82][segOf(this.depth)];
    if (rng() > p) return;
    const pool = [...this.rooms.values()].filter(r => r.type === RT.NORMAL && r.dist > 0);
    if (!pool.length) return;
    const far = pool.filter(r => r.dist >= 2);
    let src = far.length ? far : pool;
    const roomy = src.filter(r => (cells || []).some(c => c.connects.some(k => k.n === r)));
    if (roomy.length) src = roomy;
    const r = src[Math.floor(rng() * src.length)];
    r.elite = ELITE_KEYS[Math.floor(rng() * ELITE_KEYS.length)];
    this.eliteRoom = r;
    this.hasElite = true;
  }

  /* 密室：优先藏进精英窟 —— 只在精英窟那面墙上开一道符文裂缝。
     没有精英窟的层，密室出现率大幅降低，退化为普通位置。 */
  planSecret(cells) {
    const rng = this.rng;
    const el = this.eliteRoom;
    // 同 planElite：按段铺开（密室跟着精英窟走，精英率按段变了，这里也按段）
    const seg = segOf(this.depth);
    const p = el ? [0.62, 0.72, 0.82][seg] : 0.20;
    if (rng() > p) return;
    if (!cells || !cells.length) return;

    let c = null;
    if (el) {
      const near = cells.filter(v => v.connects.some(k => k.n === el));
      if (near.length) {
        c = near[Math.floor(rng() * near.length)];
        c.connects = c.connects.filter(k => k.n === el);   // 入口只开在精英窟
      }
    }
    if (!c) {
      const multi = cells.filter(v => v.connects.length >= 2);
      if (!multi.length) return;
      c = multi[Math.floor(rng() * multi.length)];
    }

    const sr = this.addRoom(c.x, c.y);
    sr.type = RT.SECRET;
    this.hasSecret = true;
    // 只开一条通道（符文墙）
    const c0 = c.connects[Math.floor(rng() * c.connects.length)];
    const dir = DIRS[c0.d].opp;            // 从相邻房间指回密室的方向
    // c0.d = 密室 → 相邻房间；dir = 相邻房间 → 密室（方向搞反会覆盖真实通路，可能把 Boss 分支切断）
    sr.doors[c0.d] = true; sr.neighbors[c0.d] = c0.n.key;
    c0.n.doors[dir] = true; c0.n.neighbors[dir] = sr.key;
    c0.n.doorHidden[dir] = true; sr.doorHidden[c0.d] = true;
    c0.n.doorHp[dir] = 3; sr.doorHp[c0.d] = 3;
  }

  /* ------------------------------------------------------------
   *  经济规划
   *  原则：本层灵石产出 = 本层可消耗总额 × 0.85（略低于消耗），
   *        钥匙产出 = 本层锁的数量，掉在随机房间里（要探索才拿得到）。
   * ---------------------------------------------------------- */
  planEconomy() {
    const rng = this.rng;
    const rooms = [...this.rooms.values()];

    // —— 消耗端：坊市货品总价（当前唯一的灵石去处）
    let sink = 0;
    for (const r of rooms) for (const p of r.props) if (p.kind === 'shop') sink += p.price;
    const budget = Math.max(14, Math.round(sink * 0.85));

    const normals = rooms.filter(r => r.type === RT.NORMAL);
    const boss = rooms.find(r => r.type === RT.BOSS);
    const secret = rooms.find(r => r.type === RT.SECRET);
    const nN = Math.max(1, normals.length);

    /* 配额：普通房 62%，Boss 18%，密室 12%，余数留作宝箱/祭坛备用。
       ⚠️ Boss 只在段末出现（15 层里 3 次），所以无 Boss 层的 18% 不能凭空蒸发 ——
       否则那些层的灵石总产出会掉两成，玩家在段中会明显觉得「钱变少了」。
       这里把 Boss 那份并进普通房配额，保证「整层总量恒等于预算」这条不变量成立。 */
    const normalShare = boss ? 0.62 : 0.80;
    const per = Math.max(1, Math.floor(budget * normalShare / nN));
    const el = rooms.find(r => r.elite);
    this.eliteRoom = el || null;
    this.eliteMult = 1;
    if (el && nN >= 2) {
      /* 直接按倍率解方程：设普通房 x、精英房 m·x，则 (nN-1)·x + m·x = S。
         这样倍率只受取整影响，不会在普通房数量少的时候失控。
         因 target = round(x·m) 且 m∈[2,3]，实测倍率恒在 2~3 之间。 */
      const S = budget * normalShare;
      const mult = 2 + rng();                       // 2~3 倍
      let x = Math.max(1, Math.floor(S / (nN - 1 + mult)));
      let target = Math.max(x, Math.round(x * mult));
      if (target + x * (nN - 1) > S) {              // 取整溢出就退一档
        x = Math.max(1, x - 1);
        target = Math.max(x, Math.round(x * mult));
      }
      el.coinPool = target;
      for (const r of normals) if (r !== el) r.coinPool = x;
      this.eliteMult = target / x;
    } else {
      for (const r of normals) r.coinPool = per;
    }
    const bossShare = boss ? Math.max(3, Math.round(budget * 0.18)) : 0;
    const secretShare = secret ? Math.max(2, Math.round(budget * 0.12)) : 0;
    if (boss) boss.coinPool = bossShare;
    if (secret) secret.coinPool = secretShare;

    this.coinBudget = budget;
    this.coinSink = sink;
    // 备用配额按实际分配结算（精英窟分摊后均分值会变），保证整层产出仍恒等于预算
    let normalTotal = 0;
    for (const r of normals) normalTotal += r.coinPool;
    this.coinReserve = Math.max(0, budget - normalTotal - bossShare - secretShare);

    // 密室的散落灵石改为按配额发，避免固定 15 枚冲垮预算
    if (secret) {
      const coins = secret.props.filter(p => p.kind === 'coin');
      if (coins.length) {
        const v = Math.max(1, Math.floor(secretShare / coins.length));
        coins.forEach((p, i) => { p.value = (i === coins.length - 1) ? Math.max(1, secretShare - v * (coins.length - 1)) : v; });
      }
    }

    // —— 钥匙：本层有几把锁，就掉几把
    let locks = 0;
    for (const r of rooms) {
      if (r.type === RT.TREASURE) locks++;                                  // 封印门
      for (const p of r.props) if (p.kind === 'chest' && p.locked) locks++;  // 金匣
    }
    this.lockCount = locks;

    // —— 雷符：每层 1~2 颗
    this.bombPlan = 1 + (rng() < 0.5 ? 1 : 0);

    // 随机撒进普通房（起始房之外的普通房），逼着玩家真的去清房
    const pool = normals.filter(r => r.dist > 0);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    const src = pool.length ? pool : normals;
    for (let i = 0; i < locks && i < src.length; i++) src[i].keyDrop = true;
    for (let i = 0; i < this.bombPlan; i++) {
      const r = src[(locks + i) % src.length];
      if (r) r.bombDrop = true;
    }
  }

  /* ---------------- 房间内容 ---------------- */
  populate(r) {
    const rng = mulberry32(this.seed * 7919 + r.gx * 131 + r.gy * 977 + this.depth * 31);
    const depth = this.depth;
    const dm = this.diff.mult;                 // 血量校正（动态难度）
    const dc = this.diff.count;                // 数量校正（比血量温和）
    /* 血量基数：**按段**爬，而不是按层。
       原 `1 + (depth-1)*0.18` 在 5 层制下是 1.0 → 1.72；直接套到 15 层会到 3.52，
       再乘上 dm（难度校正，段三封顶已抬到 4.6）就是十几倍 —— 纯粹的血包墙。
       改成「段内爬升 + 段间台阶」：每段内 1.0 → 1.24，段间再叠 1.35 的台阶，
       与 dm 的分段放宽配合，保证后期是「更凶」而不是「更肉」。 */
    const hpBase = (1 + segProgress(depth) * 0.24 + segOf(depth) * 0.35) * dm;
    r.props = []; r.obstacles = []; r.spawns = []; r.waves = [];

    // 可放置的安全坐标（避开门口通道）
    const safeSpot = () => {
      for (let i = 0; i < 40; i++) {
        const x = 2 * TILE + rng() * (ROOM_W - 4 * TILE);
        const y = 2.2 * TILE + rng() * (ROOM_H - 4.4 * TILE);
        if (this.blockedIn(r, x, y, 14)) continue;
        return { x, y };
      }
      return { x: ROOM_W / 2 + (rng() - 0.5) * 60, y: ROOM_H / 2 + (rng() - 0.5) * 40 };
    };
    const centerish = () => ({
      x: ROOM_W / 2 + (rng() - 0.5) * 90,
      y: ROOM_H / 2 + (rng() - 0.5) * 60
    });

    switch (r.type) {
      case RT.START: {
        r.cleared = true;
        r.props.push({ kind: 'incense', x: 60, y: 96 });
        r.props.push({ kind: 'lantern', x: ROOM_W - 76, y: 120 });
        r.props.push({ kind: 'rune', x: ROOM_W / 2, y: ROOM_H / 2 });
        break;
      }
      case RT.NORMAL: {
        // 精英窟：一只精英 + 少量随从，怪少而凶
        if (r.elite) {
          const E = ELITE_DEF[r.elite];
          const wv = [{ type: E.base, x: ROOM_W / 2, y: 112, hpScale: hpBase, elite: r.elite }];
          const pool = this.enemyPool(depth);
          /* 随从数按【整局进度】而不是层数：原 `2 + floor(depth/2)` 在 15 层下会长到 9 只，
             精英窟变成「一只精英 + 一堆随从」的糊屏；改成整局 2 → 5 只，节奏可控。 */
          const minions = 2 + Math.round(runProgress(depth) * 3) + (dm > 1.2 ? 1 : 0);
          for (let i = 0; i < minions; i++) {
            const s = safeSpot();
            wv.push({ type: pool[Math.floor(rng() * pool.length)], x: s.x, y: s.y, hpScale: hpBase });
          }
          r.waves.push(wv);
          r.props.push({ kind: 'lantern', x: 60 + rng() * (ROOM_W - 120), y: 70 });
          break;
        }
        /* 密度：房间距离（同层内的探索深度）+ 段内进度（本段的推进感）。
           原先 `depth * 1.6` 被 Math.min(9,…) 在第 4~5 层就削平 —— 15 层下后十层毫无变化。
           改成 dist + 段内进度后，每一段都重新经历一次「由松到紧」，而段与段之间靠
           dc（难度数量校正）整体上台阶。 */
        const budget = (4 + Math.min(9, Math.floor(r.dist * 0.9 + segProgress(depth) * 8 + segOf(depth) * 1.6))) * dc;
        const pool = this.enemyPool(depth);
        const n = Math.max(3, Math.floor(budget / 2.2) + Math.floor(rng() * 3));
        const waves = (rng() < 0.35 + segProgress(depth) * 0.25) ? 2 : 1;
        for (let w = 0; w < waves; w++) {
          const cnt = Math.max(1, Math.round(Math.ceil(n / waves)));
          const wv = [];
          for (let i = 0; i < cnt; i++) {
            const t = pool[Math.floor(rng() * pool.length)];
            const s = safeSpot();
            wv.push({ type: t, x: s.x, y: s.y, hpScale: hpBase });
          }
          r.waves.push(wv);
        }
        // 障碍：石柱
        const oc = rng() < 0.55 ? 1 + Math.floor(rng() * 2) : 0;
        for (let i = 0; i < oc; i++) {
          const p = centerish();
          r.obstacles.push({ x: p.x, y: p.y, w: 28, h: 28, kind: 'rock' });
        }
        if (rng() < 0.3) r.props.push({ kind: 'lantern', x: 60 + rng() * (ROOM_W - 120), y: 70 });
        break;
      }
      case RT.TREASURE: {
        r.cleared = true;
        // 木箱免费，金匣需 1 把钥匙（双倍法宝）—— 与封印门争夺同一批钥匙
        r.props.push({ kind: 'chest', x: ROOM_W / 2 - 34, y: ROOM_H / 2 - 6, item: null });
        r.props.push({ kind: 'chest', x: ROOM_W / 2 + 34, y: ROOM_H / 2 - 6, item: null, locked: true, gold: true });
        r.props.push({ kind: 'lantern', x: ROOM_W / 2 - 60, y: 80 });
        r.props.push({ kind: 'lantern', x: ROOM_W / 2 + 60, y: 80 });
        break;
      }
      case RT.SHOP: {
        r.cleared = true;
        r.props.push({ kind: 'keeper', x: ROOM_W / 2, y: 96 });
        const goods = this.shopGoods(rng, depth);
        goods.forEach((g, i) => {
          r.props.push({ kind: 'shop', x: ROOM_W / 2 - 70 + i * 70, y: ROOM_H / 2 + 26, item: g.item, price: g.price, sold: false });
        });
        break;
      }
      case RT.SECRET: {
        r.cleared = true;
        r.props.push({ kind: 'chest', x: ROOM_W / 2 - 40, y: ROOM_H / 2, item: null });
        r.props.push({ kind: 'chest', x: ROOM_W / 2 + 40, y: ROOM_H / 2, item: null });
        for (let i = 0; i < 5; i++) {
          r.props.push({ kind: 'coin', x: ROOM_W / 2 + (rng() - 0.5) * 150, y: ROOM_H / 2 + (rng() - 0.5) * 90, value: 3 });
        }
        break;
      }
      case RT.SACRIFICE: {
        r.cleared = true;
        r.props.push({ kind: 'altar', x: ROOM_W / 2, y: ROOM_H / 2 - 8 });
        break;
      }
      case RT.BOSS: {
        /* 按【段】取尊者，不再按层：第 1 / 2 / 3 段分别对上 1 / 2 / 3 号位，
           由浅入深依次是「整圈弹幕 → 白骨三阶段 → 弹幕裂变」——
           每段一套新题面，玩家每进一段要重学一次怎么走位。
           ⚠️ 段数（3）与头目数（5）不是一回事：多出来的 裂煞·轮回·烛龙
              留给 Boss 挑战模式，以及将来「北欧/克苏鲁」接入时按风格各配一套。
           段末 Boss 再叠一道 BOSS_SEG_MUL：它是一段的收束，要比同层杂兵更有一道坎，
           但**只作用于 Boss**，不抬高普通妖物（否则那一段整体变硬，手感错位）。 */
        const seg = segOf(depth);
        r.waves.push([{ type: 'boss', x: ROOM_W / 2, y: 96,
          /* bossOverride 优先：挑战模式点谁打谁（见 Floor 构造函数的注释） */
          boss: this.bossOverride || BOSS_KEYS[Math.min(BOSS_KEYS.length - 1, seg)],
          hpScale: (1 + (segProgress(depth) + seg * 1) * 0.45 * (SEG_FLOORS / 5))
            * (1 + (dm - 1) * 0.6) * BOSS_SEG_MUL[seg] }]);
        break;
      }
    }
  }

  /* 妖物池：池内等概率，所以「加一种」等于「稀释全部」。
     因此新妖物一律按层解锁、一次只放一两种进来 ——
     既让后四层每层都有新面孔，又不至于把一层的池子冲淡到看不出性格。 */
  /* 妖物池：池内等概率，所以「加一种」等于「稀释全部」。
     因此新妖物一律按【段】解锁、一次只放两三种进来 ——
     既让每一段都有新面孔，又不至于把一段的池子冲淡到看不出性格。

     ⚠️ 解锁点按段算，不按层：原来的 `depth >= 4` 在 15 层制下会让
        第 4~15 层共 12 层的池子完全不变（新面孔早早就全出来了），
        玩家在段二段三会遇到「同一批妖物打十层」。改成按段之后，
        段一 5 种、段二 +3、段三 +4，每段都有一批新的要学。 */
  enemyPool(depth) {
    const seg = segOf(depth);
    const pool = ['xiesui', 'chanchu'];
    pool.push('yinsha');
    if (seg >= 0) pool.push('xuefu');
    if (seg >= 1) { pool.push('guixiu'); pool.push('shikui'); pool.push('bengyao'); }
    if (seg >= 2) { pool.push('jianling'); pool.push('yingmo'); pool.push('xuanguang'); pool.push('tiehun'); pool.push('xuanjia'); }
    return pool;
  }

  /* 坊市：4 件货，价格随深度递增 —— 这是本层灵石唯一的去处，
     也是灵石预算的基准。买得起两三件、买不全，取舍才成立。 */
  shopGoods(rng, depth) {
    const dan = poolByType('dan');
    const gong = poolByType('gongfa');
    const pick = a => a[Math.floor(rng() * a.length)] || a[0];
    const P = base => Math.round(base + depth * 2);
    // 法宝走统一抽取：优先没见过的，也允许数值型重复 / 功能型进阶
    const own = this.owned;
    const fabao = () => rollFabaoId(rng, own);
    return [
      { item: fabao(), price: P(13) },
      { item: pick(dan), price: Math.round(6 + depth * 1.5) },
      { item: fabao(), price: P(15) },
      // 4 号位多数时候卖小技能：这是技能最稳定的来源
      { item: rng() < 0.6 ? rollSkillId(rng, this.slots) : fabao(), price: Math.round(17 + depth * 2.5) }
    ];
  }

  blockedIn(r, x, y, r2) {
    for (const o of r.obstacles) {
      if (x + r2 > o.x && x - r2 < o.x + o.w && y + r2 > o.y && y - r2 < o.y + o.h) return true;
    }
    return false;
  }

  /* 房间预渲染背景（含地板、墙、门） */
  renderBG(r) {
    const o = mkCanvas(ROOM_W, ROOM_H);
    const g = o.g;
    const rng = mulberry32(this.seed + r.gx * 61 + r.gy * 17);
    // 地板
    for (let y = 0; y < ROOM_ROWS; y++) for (let x = 0; x < ROOM_COLS; x++) {
      const tile = (r.type === RT.START || r.type === RT.TREASURE) && x === 7 && y === 4
        ? SPR.floorRune : SPR.floor[Math.floor(rng() * SPR.floor.length)];
      g.drawImage(tile, x * TILE, y * TILE);
    }
    // 房间色调（精英窟单独一层猩红，一眼能认出来）
    const tintCol = r.elite ? 'rgba(200,50,80,0.14)' : ({
      start: 'rgba(80,180,160,0.06)', normal: 'rgba(0,0,0,0)', boss: 'rgba(180,30,60,0.10)',
      treasure: 'rgba(240,200,90,0.09)', shop: 'rgba(120,90,200,0.10)',
      secret: 'rgba(90,220,180,0.13)', sacrifice: 'rgba(220,80,80,0.10)'
    }[r.type] || 'rgba(0,0,0,0)');
    if (tintCol !== 'rgba(0,0,0,0)') { g.fillStyle = tintCol; g.fillRect(0, 0, ROOM_W, ROOM_H); }

    // 精英窟：地面上刻一圈血色符阵，预告此处镇着厉物
    if (r.elite) {
      g.save();
      g.globalAlpha = 0.3; g.strokeStyle = PAL.red; g.lineWidth = 1;
      g.beginPath(); g.ellipse(ROOM_W / 2, ROOM_H / 2 + 8, 62, 30, 0, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.ellipse(ROOM_W / 2, ROOM_H / 2 + 8, 40, 19, 0, 0, Math.PI * 2); g.stroke();
      g.restore();
    }

    // 墙
    for (let y = 0; y < ROOM_ROWS; y++) for (let x = 0; x < ROOM_COLS; x++) {
      const border = x === 0 || y === 0 || x === ROOM_COLS - 1 || y === ROOM_ROWS - 1;
      if (!border) continue;
      const top = (y === 0);
      g.drawImage(top ? SPR.wallTop : SPR.wall[((x + y) % 2)], x * TILE, y * TILE);
    }
    // 门（在渲染时动态叠加，这里只画门框）
    for (let d = 0; d < 4; d++) {
      if (!r.doors[d]) continue;
      const pos = this.doorRect(d);
      g.fillStyle = PAL.edge;
      g.fillRect(pos.x, pos.y, pos.w, pos.h);
    }
    // 墙内阴影
    g.save();
    const grd = g.createRadialGradient(ROOM_W / 2, ROOM_H / 2, 40, ROOM_W / 2, ROOM_H / 2, 300);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(6,4,14,0.45)');
    g.fillStyle = grd; g.fillRect(0, 0, ROOM_W, ROOM_H);
    g.restore();
    return o.c;
  }

  /* 门所在的矩形（上下墙的门横置，左右墙的门竖置） */
  doorRect(d) {
    if (d === 0) return { x: 7 * TILE, y: 4, w: TILE, h: 24, vertical: false };
    if (d === 2) return { x: 7 * TILE, y: ROOM_H - 28, w: TILE, h: 24, vertical: false };
    if (d === 3) return { x: 4, y: 4 * TILE, w: 24, h: TILE, vertical: true };
    return { x: ROOM_W - 28, y: 4 * TILE, w: 24, h: TILE, vertical: true };
  }

  /* 玩家穿越门的落点 */
  entryPoint(d) {
    const L = TILE + 2, T = TILE + 2, R = ROOM_W - TILE - 2, B = ROOM_H - TILE - 2;
    const m = 26;
    if (d === 0) return { x: ROOM_W / 2, y: T + m };           // 从北门进入 → 出现在上方
    if (d === 2) return { x: ROOM_W / 2, y: B - m };
    if (d === 3) return { x: L + m, y: ROOM_H / 2 + 4 };
    return { x: R - m, y: ROOM_H / 2 + 4 };
  }

  /* 触发穿越的判定区：必须落在玩家可走范围内（WALL_xx 之内），否则永远够不到 */
  exitZone(d) {
    const span = TILE + 8, deep = 22;            // 门口宽度 / 门洞厚度
    const L = 6, T = 6, R = ROOM_W - deep - 2, B = ROOM_H - deep - 2;
    if (d === 0) return { x: 7 * TILE - 4, y: T, w: span, h: deep, cx: ROOM_W / 2, cy: T };
    if (d === 2) return { x: 7 * TILE - 4, y: B, w: span, h: deep, cx: ROOM_W / 2, cy: ROOM_H - T };
    if (d === 3) return { x: L, y: 4 * TILE - 4, w: deep, h: span, cx: L, cy: ROOM_H / 2 + 4 };
    return { x: R, y: 4 * TILE - 4, w: deep, h: span, cx: ROOM_W - L, cy: ROOM_H / 2 + 4 };
  }
}
