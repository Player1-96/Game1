'use strict';
/* ============================================================
 *  game.js —— 主循环 / 房间管理 / HUD / 音效
 * ============================================================ */

/* ---------------- 音效（WebAudio 合成） ---------------- */
const SFX = {
  ctx: null, master: null, on: true,
  ensure() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.28;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  },
  tone(freq, dur, type, vol, slideTo) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol || 0.3, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol, filterFreq) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime, sr = this.ctx.sampleRate;
    const len = Math.floor(sr * dur);
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq || 2000;
    const g = this.ctx.createGain(); g.gain.value = vol || 0.25;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  },
  shoot() { this.tone(880, 0.06, 'square', 0.10, 420); },
  hit() { this.noise(0.08, 0.14, 3000); },
  hurt() { this.tone(220, 0.22, 'sawtooth', 0.28, 70); },
  coin() { this.tone(1320, 0.05, 'square', 0.10); setTimeout(() => this.tone(1760, 0.07, 'square', 0.09), 45); },
  pickup() { this.tone(660, 0.07, 'triangle', 0.16); setTimeout(() => this.tone(990, 0.09, 'triangle', 0.14), 60); setTimeout(() => this.tone(1320, 0.11, 'triangle', 0.12), 120); },
  chest() { this.tone(392, 0.10, 'triangle', 0.2); setTimeout(() => this.tone(523, 0.14, 'triangle', 0.18), 90); setTimeout(() => this.tone(784, 0.18, 'triangle', 0.16), 180); },
  cast() { this.tone(520, 0.14, 'sine', 0.12, 260); },
  summon() { this.tone(160, 0.28, 'square', 0.14, 380); this.noise(0.28, 0.12, 600); },
  spit() { this.tone(300, 0.10, 'sawtooth', 0.10, 160); },
  dash() { this.noise(0.18, 0.16, 900); },
  roar() { this.tone(120, 0.5, 'sawtooth', 0.3, 55); this.noise(0.5, 0.2, 500); },
  bossDie() { this.tone(180, 0.9, 'sawtooth', 0.32, 40); this.noise(0.9, 0.3, 700); },
  door() { this.tone(160, 0.16, 'square', 0.14, 90); },
  secret() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.12, 'triangle', 0.15), i * 70)); },
  thunder() { this.noise(0.5, 0.35, 400); this.tone(90, 0.4, 'sawtooth', 0.2, 40); },
  blink() { this.tone(1200, 0.16, 'sine', 0.16, 2400); },
  levelup() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.tone(f, 0.14, 'square', 0.14), i * 90)); },
  /* 巨剑流：蓄力跨段提示 */
  chargeUp(tier) {
    if (tier === 1) this.tone(660, 0.10, 'triangle', 0.13, 990);
    else { this.tone(880, 0.14, 'square', 0.15, 1320); this.noise(0.12, 0.10, 2600); }
  },
  /* 巨剑流：释放巨剑，段位越高越低沉厚重 */
  chargeShot(tier) {
    if (tier === 0) this.tone(760, 0.07, 'square', 0.11, 380);
    else if (tier === 1) { this.tone(520, 0.16, 'sawtooth', 0.16, 240); this.noise(0.14, 0.12, 1800); }
    else { this.tone(200, 0.34, 'sawtooth', 0.22, 620); this.noise(0.34, 0.20, 900); }
  },
  /* 舞剑流：挥砍的破空声，段位越高越凌厉 */
  slash(tier) {
    if (tier >= 2) { this.tone(900, 0.09, 'square', 0.13, 260); this.noise(0.10, 0.16, 3600); }
    else if (tier === 1) { this.tone(760, 0.08, 'square', 0.12, 320); this.noise(0.09, 0.13, 3200); }
    else this.noise(0.07, 0.11, 3000);
  }
};

/* ---------------- 数字字模（补充） ---------------- */
FONT5['0'] = ['01110', '10001', '10011', '10101', '11001', '10001', '01110'];
FONT5['1'] = ['00100', '01100', '00100', '00100', '00100', '00100', '01110'];
FONT5['2'] = ['01110', '10001', '00001', '00110', '01000', '10000', '11111'];
FONT5['3'] = ['11111', '00010', '00100', '00010', '00001', '10001', '01110'];
FONT5['4'] = ['00010', '00110', '01010', '10010', '11111', '00010', '00010'];
FONT5['5'] = ['11111', '10000', '11110', '00001', '00001', '10001', '01110'];
FONT5['6'] = ['00110', '01000', '10000', '11110', '10001', '10001', '01110'];
FONT5['7'] = ['11111', '00001', '00010', '00100', '01000', '01000', '01000'];
FONT5['8'] = ['01110', '10001', '10001', '01110', '10001', '10001', '01110'];
FONT5['9'] = ['01110', '10001', '10001', '01111', '00001', '00010', '01100'];
FONT5[':'] = ['00000', '00100', '00100', '00000', '00100', '00100', '00000'];
FONT5['!'] = ['00100', '00100', '00100', '00100', '00100', '00000', '00100'];
// 减号：击杀返还的「−N 秒」要用，此前 FONT5 里没有这个字模（整串会被静默跳过）
FONT5['-'] = ['00000', '00000', '00000', '11111', '00000', '00000', '00000'];

/* ---------------- 输入 ---------------- */
const input = {
  up: false, down: false, left: false, right: false,
  sUp: false, sDown: false, sLeft: false, sRight: false,
  shooting: false, aiming: false, aimAngle: Math.PI / 2,
  mouseDown: false, mx: 240, my: 160, mouseT: -999, hx: -99, hy: -99,
  mouseSeen: false,   // 鼠标是否动过：专属技能一律朝指针放，没动过才退回朝向
  lastAim: null,      // 最近一次有效的瞄准角（纯键盘操作时兜底）
  interact: false,   // E 键：开启金匣 / 购买货品 / 献祭 / 炸封印门（与发功法的空格分开）
  restart: false,    // R 键按住状态：局内长按重开（与 dead/win 的秒重开区分）
  shopDist: 1e9      // 帧内最近可交互货品的距离，用于提示取最近的一件
};

/* 可选流派：按 STYLES 的登记顺序，只取已开放的（ready:true）。
   流派选择界面、重开换流派、HUD 三处都读这一份，新增流派不必改多处。 */
const PLAYABLE_STYLES = Object.keys(STYLES).filter(k => STYLES[k].ready);
/* 选中卡片的三套配色（对应 index.html 的 .selA / .selB / .selC） */
const PICK_SEL = ['selA', 'selB', 'selC'];

/* 流派图标与主题色：HUD 的流派标识与专属技能格共用 */
function styleIcon(style) {
  if (style === 'jujian') return SPR.jujian;
  if (style === 'wujian') return SPR.saber;
  return SPR.sword;
}
function styleColor(style) {
  if (style === 'jujian') return PAL.gold;
  if (style === 'wujian') return PAL.jadeL;
  return PAL.jade;
}

/* ---------------- 游戏主体 ---------------- */
class GameCore {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.g.imageSmoothingEnabled = false;
    this.state = 'title';
    this.style = 'feijian';          // 流派：feijian（飞剑流）| jujian（巨剑流）| wujian（舞剑流）
    this.styleIdx = 0;               // 流派选择界面的高亮项
    this.input = input;
    this.acc = 0; this.last = 0;
    this.shakeAmt = 0; this.hurtFlash = 0;
    this.tick = 0;
    this.msg = '';
    this.placedBombs = []; this.bombs = 0; this.keys = 0; this.coins = 0;
    this.slashes = [];               // 舞剑流的斩击刃光（纯表现，伤害即时结算）
    this.beams = [];                 // 玄光（激光束）：蓄力预告 + 扫射，见 Beam
    this.dnums = [];                 // 伤害数字（暴击为朱红大字，见 DamageNum）
    this.restartHold = 0;            // 局内长按 R 的累计帧数
    this.timers = [];                // 延迟效果 { t, fn, room }
    this.ultWarn = null;             // 巨剑专属落地前的预警圈
    this.ultSword = null;            // 落地后插在地上的巨剑（纯表现）
    this.pick = null;                // 选择界面：{ kind:'skill'|'ult', ... }，非 null 时暂停
    this.ultUpgradeT = 0;            // 斩精英后延迟弹出三选一的倒计时（帧）
  }

  /* ---------------- 生命周期 ---------------- */
  newRun(style) {
    this.style = style || this.style || 'feijian';
    this.depth = 1;
    this.coins = 0; this.keys = 0; this.bombs = 0; this.kills = 0;
    this.time = 0;
    this.player = new Player(ROOM_W / 2, ROOM_H / 2 + 20);
    this.newFloor(1);
    this.state = 'play';
    this.itemPopup = null;
    this.pick = null; this.ultWarn = null; this.ultSword = null; this.ultUpgradeT = 0;
    // 舞剑流是纯近战，开局就得靠「剑影三叠」的突进贴身，故直接给上
    // （基础冷却也相应压到 15 秒，见 ULT_DEF.wujian.cd）。其余流派仍是首杀精英才得。
    // 提示走 itemPopup（DOM 浮层）而非飘字 —— 像素字体 FONT5 只有英文点阵，中文飘字画不出来。
    if (this.style === 'wujian') {
      const p = this.player;
      p.giveUlt('wujian');
      const UD = ULT_DEF.wujian;
      this.itemPopup = {
        def: { id: 'ult_wujian', type: 'ult', name: UD.name, desc: UD.desc, cd: ultCdOf(p.ult, 'wujian') },
        t: 240, rank: 0
      };
      this.floaters.push(new Floater(p.x, p.y - 32, 'TRIPLE GLEAM', PAL.goldL));
    }
    renderPickPanel();
    updateOverlay();   // 立刻切 overlay，否则标题会盖在画面上滞留最多 100ms
  }
  /* 实力分：折算成「相对裸装的倍数」，裸装恒为 1.0（见 POWER_BASE）。
     攻击端按乘性估算 —— 伤害 × 出手速度 × 剑数 × 暴击期望，
     否则线性求和会严重低估「伤害 + 射速 + 分裂」三者叠加的真实输出。 */
  powerScore() {
    const p = this.player;
    if (!p) return POWER_BASE;
    const s = p.stats;
    const dps = s.damage * s.fireRate * (1 + s.spread * 0.8) * (1 + s.crit * 0.8);
    const v = dps / (3.5 * 2.6)                                     // 攻击：裸装 ≈ 1.0
      + s.pierce * 0.18 + s.homing * 3.0 + (s.homingRange - 220) * 0.002
      + s.burn * 0.25 + s.frost * 0.2 + s.chain * 0.35 + s.poison * 0.3 + s.soul * 0.3
      + (p.maxHP / 6 - 1) * 0.6 + p.shieldTotal * 0.08               // 生存
      + (s.speed / 2.35 - 1) * 0.8 + s.luck * 0.06 + s.regen * 0.15
      + (s.mpRegen || 0) * 0.25;
    return Math.max(0.2, v);
  }
  newFloor(depth) {
    this.depth = depth;
    this.floor = new Floor(depth, (Math.random() * 0xffffffff) >>> 0, {
      power: this.powerScore(),
      owned: this.player ? this.player.items.slice() : [],
      slots: this.player ? this.player.slots.map(s => (s ? { id: s.id, lv: s.lv } : null)) : []
    });
    // 本层备用灵石（宝箱、祭坛失手时的小额产出，已计入预算）
    this.coinReserve = this.floor.coinReserve || 0;
    this.eliteMult = this.floor.eliteMult || 1;   // 本层精英窟的灵石倍率，清房时展示给玩家
    this.bullets = []; this.enemies = []; this.pickups = []; this.hazards = [];
    this.beams = [];
    this.particles = []; this.floaters = []; this.zaps = []; this.props = [];
    this.dnums = [];
    this.placedBombs = []; this.slashes = [];
    this.ultWarn = null; this.ultSword = null;   // 换层即作废，避免预警圈/巨剑残留到下一层
    this.bossRef = null; this.doorLock = 0;   // 清掉上一层的 Boss 引用，否则血条会残留到重开后
    this.timers = [];                         // 跨层的延迟效果作废
    const start = this.floorStart();
    this.enterRoom(start, null);
    SFX.levelup();
  }
  floorStart() {
    for (const r of this.floor.rooms.values()) if (r.type === RT.START) return r;
    return [...this.floor.rooms.values()][0];
  }

  enterRoom(r, fromDir) {
    this.room = r;
    if (!r.bg) r.bg = this.floor.renderBG(r);
    r.visited = true; r.seen = true;
    for (let d = 0; d < 4; d++) if (r.neighbors[d]) {
      const n = this.floor.rooms.get(r.neighbors[d]);
      // 密室不在地图上预告（否则一进相邻房间就暴露了裂缝墙的位置），破墙后才点亮
      if (n && !(n.type === RT.SECRET && !n.secretFound)) n.seen = true;
    }
    this.bullets = []; this.enemies = []; this.pickups = []; this.hazards = [];
    this.props = []; this.particles = []; this.zaps = []; this.slashes = [];
    this.beams = [];                 // 玄光不跨房残留（蓄力到一半出门会白赚一次闪身）
    this.dnums = [];   // 换房即清：上一间的伤害数字不该飘到新房间里
    this.shopHint = null; this.altarHint = null; this.portalHint = false; this.chestHint = null;
    this.pickHint = null;

    // 重建本房此前没被拾取的掉落物（灵石/钥匙/雷符/心/盾）—— 走开再回来仍在
    for (const rec of (r.drops || [])) {
      if (rec.taken) continue;
      const k = new Pickup(rec.kind, rec.x, rec.y, rec.v);
      k.rec = rec;
      this.pickups.push(k);
    }

    // 摆放交互物（保持已开/已售状态）
    for (const p of r.props) {
      if (p.kind === 'coin') {
        if (!p.taken) { p.taken = true; this.dropPickup('coin', p.x, p.y, p.value); }
        continue;
      }
      if (p.kind === 'item' && p.taken) continue;
      const prop = new Prop(p.kind, p.x, p.y, p);
      prop.src = p;
      this.props.push(prop);
    }
    if (r.portal) this.props.push(new Prop('portal', ROOM_W / 2, ROOM_H / 2 + 10, {}));

    // 玩家落点
    if (fromDir !== null && fromDir !== undefined) {
      const ep = this.floor.entryPoint(DIRS[fromDir].opp);
      this.player.x = ep.x; this.player.y = ep.y;
      this.player.vx = this.player.vy = 0;
    } else {
      this.player.x = ROOM_W / 2; this.player.y = ROOM_H / 2 + 20;
    }
    this.doorLock = 8;
    // 换房间必须清掉巨剑流的蓄力状态，否则蓄力进度会跨房残留
    if (this.player) {
      this.player.charging = false; this.player.chargeT = 0; this.player.chargeFlash = 0; this.player.chargeAim = null;
      // 出剑后摇也一并清掉，否则换房后凭空被锁住不出剑
      this.player.shootCd = 0; this.player.chargeCdMax = 0;
      // 舞剑流的蓄势与连段同样不能跨房残留（否则可以在这个房间蓄好、下个房间再突进）
      this.player.wjCharging = false; this.player.wjChargeT = 0; this.player.wjFull = false;
      this.player.wjStage = 0; this.player.wjChainT = 0;
      this.player.dashing = false; this.player.dashT = 0;
      this.player.dashFlurry = 0; this.player.dashHit = null; this.player.dashTrail.length = 0;
      // 落地短暂无敌，避免刚进门就被贴脸的东西蹭到血
      this.player.invuln = Math.max(this.player.invuln, 30);
    }

    // 敌人
    if (!r.cleared) {
      r.waveIdx = 0;
      if (r.type === RT.BOSS) {
        for (let d = 0; d < 4; d++) r.doorOpen[d] = false;
        this.bossRef = null;
      }
      this.spawnWave(0);
      if (r.type === RT.BOSS && this.bossRef) {
        this.floaters.push(new Floater(ROOM_W / 2, 130, 'BOSS', PAL.red));
        this.itemPopup = { def: { name: this.bossRef.name + ' · 现身', desc: '斩妖除魔，守护道心' }, t: 170 };
      }
    } else {
      for (let d = 0; d < 4; d++) if (r.doors[d] && !r.doorHidden[d]) r.doorOpen[d] = true;
    }
    r.visited = true;
  }

  /* 合成瞄准输入：鼠标优先，其次方向键 */
  computeAim() {
    // 按住鼠标 = 持续射击。过去用「mouseT 新鲜度窗口」判断，导致鼠标停住不动
    // 超过窗口（飞剑流 1.5 秒）就被判成已松手、输出无声归零。改为只看 mouseDown；
    // 窗口丢失焦点 / 页面隐藏时（见 bindInput 的 blur / visibilitychange）主动清掉
    // mouseDown，避免松手事件丢失后一直空放。
    if (input.mouseDown) {
      input.aiming = true; input.shooting = true;
      input.aimAngle = Math.atan2(input.my - this.player.y, input.mx - this.player.x);
      input.lastAim = input.aimAngle;
    } else if (input.keyShoot) {
      input.aiming = true; input.shooting = true; input.aimAngle = input.keyAngle;
      input.lastAim = input.aimAngle;
    } else {
      input.aiming = false; input.shooting = false;
    }
  }
  /* 把出生点推到离玩家足够远处，杜绝「刷新即贴脸扣血」 */
  safeSpawn(x, y, r) {
    const p = this.player;
    if (!p) return { x, y };
    const need = SPAWN_SAFE_DIST + (r || 12);
    let dx = x - p.x, dy = y - p.y;
    const dd = Math.hypot(dx, dy);
    if (dd >= need) return { x, y };
    if (dd < 0.01) { const a = Math.random() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); }
    else { dx /= dd; dy /= dd; }
    // 由远及近找一个既在房间内、又离玩家够远的位置
    for (let k = need; k >= need * 0.5; k -= 10) {
      const nx = clamp(p.x + dx * k, WALL_L + 16, WALL_R - 16);
      const ny = clamp(p.y + dy * k, WALL_T + 16, WALL_B - 16);
      if (Math.hypot(nx - p.x, ny - p.y) >= need * 0.8) return { x: nx, y: ny };
    }
    // 实在放不下，退到离玩家最远的角落
    const cands = [[WALL_L + 22, WALL_T + 22], [WALL_R - 22, WALL_T + 22], [WALL_L + 22, WALL_B - 22], [WALL_R - 22, WALL_B - 22]];
    let best = cands[0], bd = -1;
    for (const c of cands) { const q = Math.hypot(c[0] - p.x, c[1] - p.y); if (q > bd) { bd = q; best = c; } }
    return { x: best[0], y: best[1] };
  }
  spawnWave(i) {
    const w = this.room.waves[i];
    if (!w) return;
    for (const s of w) {
      if (s.type === 'boss') {
        const bp = this.safeSpawn(s.x, s.y, 22);
        const b = new Boss(s.boss, bp.x, bp.y, s.hpScale);
        this.enemies.push(b); this.bossRef = b;
      } else {
        const ep = this.safeSpawn(s.x, s.y, s.elite ? 18 : 12);
        this.enemies.push(new Enemy(s.type, ep.x, ep.y, s.hpScale, s.elite));
      }
    }
    if (this.room.type !== RT.BOSS && this.enemies.length) {
      for (let d = 0; d < 4; d++) if (this.room.doors[d] && !this.room.doorHidden[d]) this.room.doorOpen[d] = false;
      SFX.door();
    }
  }
  clearRoom() {
    const r = this.room;
    if (r.cleared) return;
    r.cleared = true;
    for (let d = 0; d < 4; d++) if (r.doors[d] && !r.doorHidden[d]) r.doorOpen[d] = true;
    SFX.door();
    const p = this.player;
    if (p.stats.regen) p.heal(Math.round(p.stats.regen * 2));
    // 本房配额没被敌人掉落吃干净的部分，清房时一次性补发 → 整层产出恒等于预算
    if (r.coinPool > 0) this.takeCoins(ROOM_W / 2, ROOM_H / 2, r.coinPool);
    // 本层规划好的钥匙 / 雷符，落在随机房间里
    if (r.keyDrop && !r.keyTaken) { r.keyTaken = true; this.dropPickup('key', ROOM_W / 2 - 16, ROOM_H / 2 + 12, 1); }
    if (r.bombDrop && !r.bombTaken) { r.bombTaken = true; this.dropPickup('bomb', ROOM_W / 2 + 16, ROOM_H / 2 + 12, 1); }
    if (r.elite) {
      this.floaters.push(new Floater(ROOM_W / 2, ROOM_H / 2 - 30, 'ELITE CLEAR', PAL.gold));
      this.floaters.push(new Floater(ROOM_W / 2, ROOM_H / 2 - 46, '灵石 ×' + this.eliteMult.toFixed(1), PAL.goldL));
    } else {
      this.floaters.push(new Floater(ROOM_W / 2, ROOM_H / 2 - 30, 'CLEAR', PAL.jade));
    }
  }
  onBossDead() {
    const r = this.room;
    for (const e of this.enemies) if (!e.dead && !e.isBoss) { e.dead = true; this.burst(e.x, e.y, 12, PAL.purpleL); }
    r.cleared = true; r.portal = true;
    for (let d = 0; d < 4; d++) if (r.doors[d] && !r.doorHidden[d]) r.doorOpen[d] = true;
    this.props.push(new Prop('portal', ROOM_W / 2, ROOM_H / 2 + 10, {}));
    if (r.coinPool > 0) this.takeCoins(ROOM_W / 2, ROOM_H / 2, r.coinPool);
    // 法器二选一：只取其一，另一件随之消散（不再堆一地的法宝）
    this.chooseSeq = (this.chooseSeq || 0) + 1;
    const gid = 'pick' + this.chooseSeq;
    this.addItemPedestal(ROOM_W / 2 - 46, ROOM_H / 2 + 30, this.rollFabao(), gid);
    this.addItemPedestal(ROOM_W / 2 + 46, ROOM_H / 2 + 30, this.rollFabao(), gid);
    this.bossRef = null;
    this.floaters.push(new Floater(ROOM_W / 2, ROOM_H / 2 - 40, 'VICTORY', PAL.gold));
    this.floaters.push(new Floater(ROOM_W / 2, ROOM_H / 2 - 56, '法器二选一 · 按 E', PAL.goldL));
  }
  onPlayerDead() {
    this.state = 'dead';
    this.burst(this.player.x, this.player.y, 50, PAL.red);
    SFX.bossDie();
    updateOverlay();
  }
  nextFloor() {
    this.depth++;
    if (this.depth > 5) { this.state = 'win'; this.msg = '历经五重劫难，道心通明 —— 飞升成仙！'; updateOverlay(); return; }
    this.player.hp = Math.min(this.player.maxHP, this.player.hp + 2);
    this.newFloor(this.depth);
  }

  /* ---------------- 工具 ---------------- */
  addCoins(n) { this.coins += n; }
  burst(x, y, n, col) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.5 + Math.random() * 2.6;
      this.particles.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s, 18 + Math.random() * 18, col, 1 + Math.random() * 2, 0.03));
    }
  }
  shake(n) { this.shakeAmt = Math.min(14, this.shakeAmt + n); }
  /* 掉落物登记进房间数据：离开房间时不会被清空，回来仍在（未拾取的才重建） */
  dropPickup(kind, x, y, v) {
    const rec = { kind: kind, x: x, y: y, v: v || 1, taken: false };
    if (this.room) {
      if (!this.room.drops) this.room.drops = [];
      this.room.drops.push(rec);
    }
    const k = new Pickup(kind, x, y, v);
    k.rec = rec;
    this.pickups.push(k);
    return k;
  }
  /* 延迟效果：delta 帧后在「同一房间」内执行 fn（换房即作废，防止跨房误触发） */
  schedule(delay, fn) {
    if (!this.timers) this.timers = [];
    this.timers.push({ t: delay, fn: fn, room: this.room });
  }
  /* 法宝摆件：运行时生成的摆件同样写回房间数据，先出门/先踏传送阵也不会永久消失
     group —— 传入同一串标识即构成「二选一」，取走其一则同组其它摆件消散 */
  addItemPedestal(x, y, item, group) {
    const rec = { kind: 'item', x: x, y: y, item: item, group: group || null };
    if (this.room) {
      if (!this.room.props) this.room.props = [];
      this.room.props.push(rec);
    }
    const ped = new Prop('item', x, y, { item: item, group: group || null });
    ped.src = rec;
    this.props.push(ped);
    return ped;
  }

  /* 灵石产出统一出口：从「本房配额」里扣，扣完为止。
     这样一层的总产出被 planEconomy 锁死，不会出现灵石溢出。 */
  takeCoins(x, y, n) {
    const pool = this.room.coinPool || 0;
    const amt = Math.min(Math.max(0, n | 0), pool);
    if (amt <= 0) return 0;
    this.room.coinPool = pool - amt;
    let left = amt;
    while (left > 0) {
      const v = Math.min(3, left); left -= v;
      this.dropPickup('coin', x + (Math.random() - 0.5) * 16, y + (Math.random() - 0.5) * 10, v);
    }
    return amt;
  }
  /* 备用配额：宝箱、祭坛失手等零星产出，同样计入本层预算 */
  /* 心血掉率：平时压到很低，只剩一格血时才明显放水。
     hp 的单位是半颗心，所以 2 = 一格。气运只做小幅修正，不能盖过血量本身的影响。
     整条掉率再乘 lootScale(depth)：越深补给越薄，否则后期一路满血碾过去。 */
  heartRate() {
    const p = this.player;
    if (!p) return 0;
    const luck = p.stats.luck || 0;
    const hearts = p.hp / 2;
    const s = lootScale(this.depth);
    if (hearts <= 1) return (0.24 + luck * 0.025) * s;   // 濒死：约四分之一的概率见到一颗心
    if (hearts <= 2) return (0.07 + luck * 0.010) * s;
    return (0.02 + luck * 0.004) * s;                    // 平时几乎不掉
  }
  takeReserve(x, y, n) {
    const amt = Math.min(Math.max(0, n | 0), this.coinReserve || 0);
    if (amt <= 0) return 0;
    this.coinReserve -= amt;
    this.dropPickup('coin', x, y, amt);
    return amt;
  }
  /* 伤害数字统一出口。
     闸在 48 枚：链电、万剑归宗这类一次打一片的伤害叠加极快，
     不设上限就会糊满屏、还拖慢绘制。满了优先保暴击，普通数字直接省掉。 */
  addDamageNum(x, y, dmg, crit) {
    if (this.dnums.length >= 48) {
      if (!crit) return;
      this.dnums.shift();
    }
    /* 挨得太近的两枚数字会叠成一坨，两下的数值就都看不清了。
       把新来的沿横向推开几档 —— 一次挥砍打中三只贴脸的妖时尤其明显。 */
    let ox = 0;
    for (const d of this.dnums) {
      if (Math.abs(d.y - y) > 18) continue;
      if (Math.abs(d.x - (x + ox)) < 22) ox += 13;
    }
    this.dnums.push(new DamageNum(x + ox, y, dmg, crit));
    // 暴击再补一点震屏：数字是眼睛看到的，这一下是手上感觉到的
    if (crit) this.shake(2);
  }
  /* 敌方弹幕的统一出口。opt 供特殊弹幕用：
     hard   —— 斩不落也反射不了（铁魄妖的玄铁弹）
     r/scale/dmg/life —— 体量、大小、伤害、寿命（裂变弹的三档全靠它拉出层次）
     splitN/splitTier/splitT —— 裂变：飞够 splitT 帧炸成 splitN 枚低一阶的弹 */
  spawnEnemyBullet(x, y, vx, vy, kind, opt) {
    const sprMap = { blood: SPR.bolt.blood, talisman: SPR.bolt.talisman, flame: SPR.bolt.flame, ice: SPR.bolt.ice, orb: SPR.bolt.orb, iron: SPR.bolt.iron };
    const o = opt || {};
    const b = new Bullet(x, y, vx, vy, {
      friendly: false, dmg: o.dmg || 1, r: o.r || 5, life: o.life || 260,
      kind: kind, sprite: sprMap[kind] || SPR.bolt.blood,
      scale: o.scale, hard: o.hard,
      splitN: o.splitN, splitTier: o.splitTier, splitT: o.splitT, splitKind: o.splitKind
    });
    this.bullets.push(b);
    return b;
  }
  /* 裂变弹炸开：三阶（母）→ 2 枚二阶（中）→ 每枚再 3 枚一阶（小）。
     一发的账最后是 1+2+6 = 9 枚，母弹慢而大、越裂越快越小 ——
     玩家要做的是「先看大的」，而不是去追每一枚小的。 */
  splitBullet(b) {
    const tier = b.splitTier;                      // 当前阶数（3 / 2）
    if (tier < 2) return;
    const n = tier === 3 ? 2 : 3;
    const nextTier = tier - 1;
    const kind = nextTier === 2 ? 'blood' : 'orb';
    const r = nextTier === 2 ? 6 : 4;
    const spd = Math.max(1.6, Math.hypot(b.vx, b.vy) * 1.3);
    const base = Math.atan2(b.vy, b.vx);
    this.burst(b.x, b.y, 8, nextTier === 2 ? PAL.redL : PAL.green);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.44;
      this.spawnEnemyBullet(b.x, b.y, Math.cos(a) * spd, Math.sin(a) * spd, kind, {
        r: r, scale: r / 5, life: Math.max(90, b.life - 40),
        splitN: nextTier > 1 ? 3 : 0,
        splitTier: nextTier > 1 ? nextTier : 0,
        splitT: nextTier > 1 ? 42 : 0,
        hard: b.hard
      });
    }
    this.shake(2);
  }
  nearestEnemy(x, y, range, exclude) {
    let best = null, bd = range * range;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (exclude && exclude.has(e)) continue;   // 已命中过的目标不再回头追
      const d = dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  chainLightning(target, dmg, jumps) {
    let from = target;
    const hit = new Set([target]);
    for (let i = 0; i < jumps; i++) {
      let best = null, bd = 150 * 150;
      for (const e of this.enemies) {
        if (e.dead || hit.has(e)) continue;
        const d = dist2(from.x, from.y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) break;
      this.zaps.push({ x1: from.x, y1: from.y, x2: best.x, y2: best.y, life: 12 });
      best.hurt(dmg, this);
      this.burst(best.x, best.y, 6, PAL.cyan);
      hit.add(best); from = best;
    }
    this.zaps.push({ x1: this.player.x, y1: this.player.y, x2: target.x, y2: target.y, life: 12 });
  }
  collideRoom(ent, r, isPlayer) {
    let L = WALL_L + r, R = WALL_R - r, T = WALL_T + r, B = WALL_B - r;
    // 门开着时，允许玩家走进门洞（否则会被墙挡住，看起来"出不去"）
    if (isPlayer && this.room) {
      const rm = this.room;
      const open = d => rm.doors[d] && rm.doorOpen[d] && rm.neighbors[d];
      const spanHit = d => {
        const z = this.floor.exitZone(d);
        return (d === 0 || d === 2) ? (ent.x > z.x && ent.x < z.x + z.w)
                                    : (ent.y > z.y && ent.y < z.y + z.h);
      };
      if (open(0) && spanHit(0)) T = 16 + r * 0.5;
      if (open(2) && spanHit(2)) B = ROOM_H - 16 - r * 0.5;
      if (open(3) && spanHit(3)) L = 16 + r * 0.5;
      if (open(1) && spanHit(1)) R = ROOM_W - 16 - r * 0.5;
    }
    if (ent.x < L) ent.x = L; if (ent.x > R) ent.x = R;
    if (ent.y < T) ent.y = T; if (ent.y > B) ent.y = B;
    if (!this.room) return;
    for (const o of this.room.obstacles) {
      const cx = clamp(ent.x, o.x, o.x + o.w), cy = clamp(ent.y, o.y, o.y + o.h);
      const dx = ent.x - cx, dy = ent.y - cy;
      const d = Math.hypot(dx, dy);
      if (d < r) {
        if (d === 0) { ent.x += r; }
        else { ent.x = cx + dx / d * r; ent.y = cy + dy / d * r; }
      }
    }
  }
  /* 随机一个小技能：优先没学过的，其次没满级的 */
  rollSkill() {
    return rollSkillId(Math.random, this.player ? this.player.slots : []);
  }
  rollFabao() {
    return rollFabaoId(Math.random, this.player ? this.player.items : []);
  }
  /* 金匣专用：单件珍稀法宝 */
  rollRareFabao() {
    return rollRareFabaoId(Math.random, this.player ? this.player.items : []);
  }

  /* ---------------- 功法（主动技） ---------------- */
  /* ---------------- 雷符 ---------------- */
  placeBomb() {
    const p = this.player;
    if (this.bombs <= 0 || p.dead) return;
    this.bombs--;
    const x = clamp(p.x, WALL_L + 8, WALL_R - 8), y = clamp(p.y, WALL_T + 8, WALL_B - 8);
    this.placedBombs.push(new Bomb(x, y));
    SFX.door();
  }
  detonate(x, y) {
    const R = 52;
    this.shake(11);
    SFX.thunder();
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 4;
      this.particles.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s, 18 + Math.random() * 18, Math.random() < 0.6 ? PAL.fire : PAL.gold, 3, 0.05));
    }
    this.burst(x, y, 22, PAL.orange);

    // 伤敌 + 击退
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d > R + e.r) continue;
      const a = Math.atan2(e.y - y, e.x - x);
      e.kbx += Math.cos(a) * 9; e.kby += Math.sin(a) * 9;
      e.hurt(14, this);
    }
    // 清弹幕
    for (const b of this.bullets) {
      if (b.friendly) continue;
      if (Math.hypot(b.x - x, b.y - y) < R) b.dead = true;
    }
    // 自伤（贴脸引爆会掉半颗心）
    const p = this.player;
    if (!p.dead && Math.hypot(p.x - x, p.y - y) < R * 0.75) p.takeDamage(1, this, x, y);
    // 炸碎障碍
    if (this.room) {
      this.room.obstacles = this.room.obstacles.filter(o => {
        const cx = clamp(x, o.x, o.x + o.w), cy = clamp(y, o.y, o.y + o.h);
        if (Math.hypot(x - cx, y - cy) < R) { this.burst(o.x + o.w / 2, o.y + o.h / 2, 14, PAL.stoneHi); return false; }
        return true;
      });
    }
    // 炸开裂缝墙（密室）
    const r = this.room;
    if (r) {
      for (let d = 0; d < 4; d++) {
        if (!r.doors[d] || !r.doorHidden[d] || r.doorOpen[d]) continue;
        const rect = this.floor.doorRect(d);
        if (Math.hypot(rect.x + rect.w / 2 - x, rect.y + rect.h / 2 - y) > R + 24) continue;
        r.doorHp[d] = 0; r.doorHidden[d] = false; r.doorOpen[d] = true; r.secretFound = true;
        const nb = this.floor.rooms.get(r.neighbors[d]);
        if (nb) { nb.doorOpen[DIRS[d].opp] = true; nb.doorHidden[DIRS[d].opp] = false; }
        SFX.secret();
        this.floaters.push(new Floater(ROOM_W / 2, ROOM_H / 2 - 20, 'SECRET', PAL.jade));
      }
    }
    // 炸开宝箱
    for (const pr of this.props) {
      if (pr.kind !== 'chest' || pr.opened) continue;
      if (Math.hypot(pr.x - x, pr.y - y) < R) pr.open(this);
    }
  }
  /* Q —— 释放当前选中的小技能，消耗灵力（不再有长冷却，只受灵力限制） */
  useSkill() {
    const p = this.player;
    if (!p || p.dead || this.state !== 'play') return;
    if (p.skillGcd > 0) return;
    const s = p.curSkill();
    if (!s) { this.floaters.push(new Floater(p.x, p.y - 26, '尚无技能', PAL.grey)); return; }
    const def = SKILL_DEF[s.id];
    if (!def) return;
    // 每个技能一份独立冷却（挂在槽位上），光靠公共 GCD + 灵力拦不住连放
    if (p.skillCd[p.slotIdx] > 0) {
      this.floaters.push(new Floater(p.x, p.y - 26, '冷却 ' + Math.ceil(p.skillCd[p.slotIdx] / 60) + 's', PAL.grey));
      return;
    }
    if (p.mp < def.cost) {
      this.floaters.push(new Floater(p.x, p.y - 26, '灵力不足', PAL.cyan));
      SFX.tone(180, 0.08, 'square', 0.08);
      return;
    }
    p.mp -= def.cost;
    p.skillGcd = SKILL_GCD;
    p.skillCd[p.slotIdx] = skillCd(s.id, s.lv);
    def.cast(this, s.lv);
  }
  /* 空格按下 —— 专属技能 */
  useUlt() {
    const p = this.player;
    if (!p || p.dead || this.state !== 'play' || this.pick) return;
    // 舞剑流是「按住蓄势」，按下只起势，松手才突进（见 ultUp）
    if (this.style === 'wujian') { this.wjCharge(); return; }
    if (!p.ult) { this.floaters.push(new Floater(p.x, p.y - 26, '未得专属技', PAL.grey)); return; }
    if (p.ultCd > 0) {
      this.floaters.push(new Floater(p.x, p.y - 26, '冷却 ' + Math.ceil(p.ultCd / 60) + 's', PAL.grey));
      return;
    }
    p.ultCd = ultCdOf(p.ult, p.ult.style);
    if (p.ult.style === 'jujian') this.castHeavenfall(); else this.castMyriad();
  }
  /* 空格松开 —— 舞剑流：朝指针突进（其余流派松手无事发生） */
  ultUp() {
    const p = this.player;
    if (!p || p.dead || this.state !== 'play' || this.pick || this.style !== 'wujian') return;
    if (p.wjCharging) STYLES.wujian.ultUp(p, this);
  }
  /* 舞剑流：起手蓄势。连段窗口内可无视冷却直接接招 —— 这是「接得上就打得顺」的来源 */
  wjCharge() {
    const p = this.player;
    if (!p) return;
    if (!p.ult) { this.floaters.push(new Floater(p.x, p.y - 26, '未得专属技', PAL.grey)); return; }
    const r = STYLES.wujian.ultDown(p, this);
    if (r === 'cd') this.floaters.push(new Floater(p.x, p.y - 26, '冷却 ' + Math.ceil(p.ultCd / 60) + 's', PAL.grey));
    else if (r === 'busy') this.floaters.push(new Floater(p.x, p.y - 26, '剑势未尽', PAL.grey));
  }

  /* 飞剑流专属 —— 万剑归宗：朝指针方向倾泻飞剑，三柄并列、连绵十轮 */
  castMyriad() {
    const p = this.player, U = p.ult, B = ULT_DEF.feijian.base, s = p.stats;
    const lvHoming = ultPathLv(U, 'homing');
    const swords = B.swords + ultPathVal(U, 'feijian', 'more');
    const homing = ultPathVal(U, 'feijian', 'homing');
    const el = ultPathVal(U, 'feijian', 'element');        // 1 灼烧 / 2 +冰封 / 3 +引雷
    const pierce = s.pierce + ultPathVal(U, 'feijian', 'pierce');
    const dmg = s.damage * B.dmgMul;
    const a0 = ultAimAngle(p);
    const perVolley = B.perVolley;
    const volleys = Math.max(B.volleys, Math.ceil(swords / perVolley));
    const ca = Math.cos(a0), sa = Math.sin(a0);
    SFX.summon(); this.shake(6);
    for (let v = 0; v < volleys; v++) {
      this.schedule(v * B.gap, () => {
        for (let i = 0; i < perVolley; i++) {
          // 并列：同一轮沿法线排开，三柄朝同一方向齐射（不再扇形发散）
          const off = (i - (perVolley - 1) / 2) * B.lane;
          const ox = p.x + ca * 10 - sa * off, oy = p.y + sa * 10 + ca * off;
          this.bullets.push(new Bullet(
            ox, oy,
            ca * s.shotSpeed * 1.25, sa * s.shotSpeed * 1.25,
            {
              friendly: true, dmg: dmg, r: STYLES.feijian.consts.r,
              life: Math.round(s.range / (s.shotSpeed * 1.25)),
              pierce: pierce, homing: homing,
              homingRange: 220 + (lvHoming >= 3 ? 80 : 0),
              knockback: s.knockback, crit: Math.random() < s.crit,
              burn: el >= 1 ? 2 : 0, frost: el >= 2 ? 1 : 0, chain: el >= 3 ? 1 : 0,
              kind: 'sword', sprite: SPR.sword, deflect: s.deflect
            }
          ));
        }
        SFX.shoot();
      });
    }
    // 御风而行：释放后一段时间内身法大增
    const sw = ultPathLv(U, 'swift');
    if (sw) {
      const P = ULT_PATH.feijian.find(x => x.id === 'swift');
      p.buffs.spdT = P.dur[sw - 1]; p.buffs.spdMul = P.val[sw - 1];
    }
    this.floaters.push(new Floater(p.x, p.y - 30, '万剑归宗', PAL.jadeL));
  }

  /* 天崩剑狱预警期：巨剑自天顶加速坠向落点（k = 预警进度 0→1），剑尖朝下、拖一道剑气 */
  drawFallingSword(g, x, y, k) {
    const jj = SPR.jujian;
    if (!jj) return;
    const y0 = WALL_T - 46;
    const sy = y0 + (y - y0) * (k * k);          // 二次曲线，越接近落点越快
    g.save();
    const grd = g.createLinearGradient(0, y0, 0, sy);
    grd.addColorStop(0, 'rgba(255,214,140,0)');
    grd.addColorStop(1, 'rgba(255,214,140,0.5)');
    g.fillStyle = grd;
    g.fillRect(x - 3, y0, 6, Math.max(0, sy - y0));
    g.translate(x, sy - 12);
    g.rotate(Math.PI / 2);
    g.scale(1.3, 1.3);
    g.drawImage(jj, -jj.width / 2, -jj.height / 2);
    g.restore();
  }

  /* 巨剑流专属 —— 天崩剑狱：巨剑自天而降，先画预警圈再落地 */
  castHeavenfall() {
    const p = this.player, U = p.ult, B = ULT_DEF.jujian.base;
    const R = B.radius + ultPathVal(U, 'jujian', 'radius');
    const mul = B.dmgMul * (1 + ultPathVal(U, 'jujian', 'might'));
    // 落点取指针位置，指针没动过就退到朝向前方
    const aim = ultAimPoint(p);
    const tx = clamp(aim.x, WALL_L + 20, WALL_R - 20);
    const ty = clamp(aim.y, WALL_T + 20, WALL_B - 20);
    this.ultWarn = { x: tx, y: ty, r: R, t: B.warn, max: B.warn };
    SFX.summon();
    this.schedule(B.warn, () => {
      this.ultWarn = null;
      // 巨剑钉进地面，留一小会儿再消散（纯表现，不参与伤害）
      this.ultSword = { x: tx, y: ty, t: 54, max: 54 };
      const dmg = p.stats.damage * mul;
      this.shake(12); SFX.thunder();
      this.burst(tx, ty, 40, PAL.gold);
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 4;
        this.particles.push(new Particle(tx, ty, Math.cos(a) * sp, Math.sin(a) * sp, 26, PAL.goldL, 3, 0.08));
      }
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (dist2(e.x, e.y, tx, ty) > R * R) continue;
        e.hurt(dmg, this);
        const a = Math.atan2(e.y - ty, e.x - tx);
        e.kbx += Math.cos(a) * B.knock; e.kby += Math.sin(a) * B.knock;
      }
      // 碎魔罡风：1 级清弹幕 / 2 级再清地面秽气 / 3 级把术法反化为己方飞剑
      const sh = ultPathLv(U, 'shatter');
      if (sh >= 1) {
        for (const b of this.bullets) {
          if (b.friendly || b.dead) continue;
          if (sh >= 3) {
            const a = Math.atan2(b.vy, b.vx);
            b.friendly = true; b.vx = Math.cos(a) * p.stats.shotSpeed; b.vy = Math.sin(a) * p.stats.shotSpeed;
            b.kind = 'sword'; b.sprite = SPR.sword; b.dmg = p.stats.damage * 0.8;
          } else b.dead = true;
          this.burst(b.x, b.y, 5, PAL.cyan);
        }
      }
      if (sh >= 2) for (const h of this.hazards) if (!h.friendly) h.dead = true;
      // 余震不绝：落点留下持续伤害的剑气
      const ec = ultPathVal(U, 'jujian', 'aftershock');
      if (ec) this.hazards.push(new Hazard(tx, ty, Math.round(R * 0.7), 0, ec, p.stats.damage * 0.35, PAL.goldL, true));
      // 蓄势待发 / 剑气纵横：落地后的短时增益
      const P = ULT_PATH.jujian;
      const cl = ultPathLv(U, 'charge');
      if (cl) { const d = P.find(x => x.id === 'charge'); p.buffs.chargeT = d.dur[cl - 1]; p.buffs.chargeMul = d.val[cl - 1]; }
      const pl2 = ultPathLv(U, 'power');
      if (pl2) { const d = P.find(x => x.id === 'power'); p.buffs.dmgT = d.dur[pl2 - 1]; p.buffs.dmgMul = d.val[pl2 - 1]; }
      this.floaters.push(new Floater(tx, ty - 20, '天崩剑狱', PAL.goldL));
    });
  }

  /* ---------------- 技能选择界面 ----------------
   * 两类：槽位已满时替换小技能、斩精英后升级专属技能。
   * 面板用 DOM 渲染（画布像素字体画不了中文），期间世界冻结。
   * ------------------------------------------------ */
  openSkillReplace(id) {
    this.pick = { kind: 'skill', newId: id, idx: 0 };
    renderPickPanel();
    SFX.levelup();
  }
  openUltUpgrade() {
    const p = this.player;
    if (!p || !p.ult) return;
    const rng = mulberry32(((this.tick + 1) * 7919 + this.depth * 131 + this.kills * 17) >>> 0);
    const list = rollUltPaths(rng, p.ult.style, p.ult, 3);
    if (!list.length) {                       // 路线全满：折成灵力上限，免得白打
      p.maxMP += 10; p.mp = p.maxMP;
      this.floaters.push(new Floater(p.x, p.y - 30, '灵力上限 +10', PAL.cyan));
      SFX.levelup();
      return;
    }
    this.pick = { kind: 'ult', list: list, idx: 0 };
    renderPickPanel();
    SFX.levelup();
  }
  /* 1/2/3 切换当前小技能槽位 */
  slotKey(i) {
    const p = this.player;
    if (!p) return;
    if (!p.selectSlot(i)) {
      this.floaters.push(new Floater(p.x, p.y - 26, '空 槽', PAL.grey));
      return;
    }
    const s = p.curSkill();
    this.floaters.push(new Floater(p.x, p.y - 26, SKILL_DEF[s.id].name + ' Lv.' + s.lv, PAL.cyan));
    SFX.tone(880, 0.05, 'square', 0.07);
  }
  pickMove(d) {
    if (!this.pick) return;
    const n = this.pick.kind === 'ult' ? this.pick.list.length : SLOT_COUNT;
    this.pick.idx = (this.pick.idx + d + n) % n;
    renderPickPanel();
  }
  pickPick(i) {
    if (!this.pick) return;
    const n = this.pick.kind === 'ult' ? this.pick.list.length : SLOT_COUNT;
    if (i >= 0 && i < n) this.pick.idx = i;
    renderPickPanel();
  }
  pickConfirm() {
    const pk = this.pick;
    if (!pk) return;
    const p = this.player;
    if (pk.kind === 'skill') {
      p.replaceSkill(pk.idx, pk.newId);
      this.floaters.push(new Floater(p.x, p.y - 30, '习得 ' + SKILL_DEF[pk.newId].name, PAL.cyan));
      this.itemPopup = { def: ITEM_MAP[pk.newId], t: 140, rank: 0 };
    } else {
      const path = pk.list[pk.idx];
      p.learnPath(path.id);
      this.floaters.push(new Floater(p.x, p.y - 30, path.name + ' Lv.' + ultPathLv(p.ult, path.id), PAL.gold));
    }
    this.pick = null;
    renderPickPanel();
    SFX.pickup();
  }

  /* ---------------- 更新 ---------------- */
  update() {
    // 选择界面：先于 tick 拦截，整个世界（含动画计时）完全静止
    if (this.pick) { input.interact = false; this.restartHold = 0; return; }
    // 斩精英后稍缓一拍再弹三选一，先让死亡特效演完
    if (this.ultUpgradeT > 0 && --this.ultUpgradeT === 0) { this.openUltUpgrade(); return; }
    this.tick++;
    if (this.shakeAmt > 0) this.shakeAmt *= 0.86;
    if (this.hurtFlash > 0) this.hurtFlash--;
    if (this.itemPopup) { this.itemPopup.t--; if (this.itemPopup.t <= 0) this.itemPopup = null; }
    if (this.doorLock > 0) this.doorLock--;

    if (this.state !== 'play') { input.interact = false; this.restartHold = 0; return; }
    // 局内长按 R（60 帧）重开：回到流派选择界面，可换流派 —— 免得卡局只能刷新浏览器
    if (input.restart) {
      this.restartHold++;
      if (this.restartHold >= 60) {
        this.restartHold = 0; input.restart = false;
        this.state = 'choose';
        this.styleIdx = Math.max(0, PLAYABLE_STYLES.indexOf(this.style));
        updateOverlay();
        return;
      }
    } else this.restartHold = 0;
    this.time++;
    this.computeAim();

    // 延时效果（精英死亡余祸等）：只在同一房间内生效，换房即作废
    if (this.timers && this.timers.length) {
      const keep = [];
      for (const tm of this.timers) {
        tm.t--;
        if (tm.room !== this.room) continue;
        if (tm.t <= 0) { try { tm.fn(); } catch (e) { console.error('[timer]', e); } }
        else keep.push(tm);
      }
      this.timers = keep;
    }

    // 交互提示每帧重算（走开就该消失），由场景物在射程内重新认领
    this.shopHint = null; this.altarHint = null; this.portalHint = false; this.chestHint = null;
    this.pickHint = null;                       // 二选一摆件：站在旁边才认领
    input.shopDist = 1e9;

    const p = this.player;
    p.update(this, input);

    for (const e of this.enemies) if (!e.dead) e.update(this);
    // 天崩剑狱：预警倒计时（内圈收紧 / 落剑下坠都靠它），以及插地巨剑的余留
    if (this.ultWarn && this.ultWarn.t > 0) this.ultWarn.t--;
    if (this.ultSword && --this.ultSword.t <= 0) this.ultSword = null;

    for (const b of this.bullets) if (!b.dead) b.update(this);
    for (const sl of this.slashes) if (!sl.dead) sl.update();
    for (const k of this.pickups) if (!k.dead) k.update(this);
    for (const h of this.hazards) if (!h.dead) h.update(this);
    for (const bm of this.beams) if (!bm.dead) bm.update(this);
    for (const pr of this.props) if (!pr.dead) pr.update(this);
    for (const bm of this.placedBombs) if (!bm.dead) bm.update(this);
    for (const pt of this.particles) pt.update();
    for (const f of this.floaters) f.update();
    for (const d of this.dnums) d.update();
    for (const z of this.zaps) z.life--;

    this.enemies = this.enemies.filter(e => !e.dead);
    this.bullets = this.bullets.filter(b => !b.dead);
    this.slashes = this.slashes.filter(s => !s.dead);
    this.pickups = this.pickups.filter(k => !k.dead);
    this.hazards = this.hazards.filter(h => !h.dead);
    this.beams = this.beams.filter(bm => !bm.dead);
    this.props = this.props.filter(pr => !pr.dead);
    this.placedBombs = this.placedBombs.filter(bm => !bm.dead);
    this.particles = this.particles.filter(pt => !pt.dead);
    this.floaters = this.floaters.filter(f => !f.dead);
    this.dnums = this.dnums.filter(d => !d.dead);
    this.zaps = this.zaps.filter(z => z.life > 0);

    // 隐藏门：被飞剑击中
    this.checkSecretWalls();
    // 房间通行
    this.checkDoors();
    // 清房
    if (!this.room.cleared) {
      if (this.enemies.length === 0) {
        if (this.room.waveIdx < this.room.waves.length - 1) {
          this.room.waveIdx++;
          this.spawnWave(this.room.waveIdx);
        } else this.clearRoom();
      }
    }
    input.interact = false;
  }

  /* 飞剑是否打中裂缝墙，返回方向 d 或 -1。
     判定区向室内延伸 10px：否则飞剑在 y<WALL_T 就被判撞墙销毁，
     且一帧步进 ~6px 会跳过墙体里的窄判定带，导致永远打不开。 */
  crackHitDir(b) {
    const r = this.room;
    if (!r) return -1;
    const e = 10;
    for (let d = 0; d < 4; d++) {
      if (!r.doors[d] || !r.doorHidden[d] || r.doorOpen[d]) continue;
      const rect = this.floor.doorRect(d);
      let x0 = rect.x - 2, y0 = rect.y - 2, x1 = rect.x + rect.w + 2, y1 = rect.y + rect.h + 2;
      if (d === 0) y1 = WALL_T + e;
      if (d === 2) y0 = WALL_B - e;
      if (d === 3) x1 = WALL_L + e;
      if (d === 1) x0 = WALL_R - e;
      if (b.x > x0 && b.x < x1 && b.y > y0 && b.y < y1) return d;
    }
    return -1;
  }

  /* 裂缝墙被打掉一层：扣血、同步邻房、血尽开门。
     飞剑（checkSecretWalls 的子弹）与舞剑流的近战剑锋共用这一处副作用，
     免得「开门条件」在两边各写一份、日后漂移。 */
  crackWallHurt(d) {
    const r = this.room;
    if (!r || d < 0) return false;
    if (!r.doors[d] || !r.doorHidden[d] || r.doorOpen[d]) return false;
    r.doorHp[d]--;
    const rect = this.floor.doorRect(d);
    this.burst(rect.x + rect.w / 2, rect.y + rect.h / 2, 8, PAL.stoneHi);
    const nb = this.floor.rooms.get(r.neighbors[d]);
    if (nb) nb.doorHp[DIRS[d].opp] = r.doorHp[d];
    SFX.hit();
    if (r.doorHp[d] <= 0) {
      r.doorOpen[d] = true; r.doorHidden[d] = false; r.secretFound = true;
      if (nb) { nb.doorOpen[DIRS[d].opp] = true; nb.doorHidden[DIRS[d].opp] = false; }
      this.shake(8); SFX.secret();
      this.floaters.push(new Floater(ROOM_W / 2, ROOM_H / 2 - 20, 'SECRET', PAL.jade));
    }
    return true;
  }

  /* 近战剑锋扫到哪面裂缝墙：门矩形离 (x,y) 最近的那一点落在「半径 rad、朝 a、
     张角 arc」的扇形内即算。子弹走 crackHitDir 的点判定（一帧步进 ~6px，
     靠判定带内缩 10px 兜住），近战是一记瞬时的弧扫，用扇形判定更贴合手感。
     贴脸时不看角度 —— 站在墙根劈，门就是脚下那面。 */
  crackHitSwing(x, y, rad, a, arc) {
    const r = this.room;
    if (!r) return -1;
    let best = -1, bestD = Infinity;
    for (let d = 0; d < 4; d++) {
      if (!r.doors[d] || !r.doorHidden[d] || r.doorOpen[d]) continue;
      const rect = this.floor.doorRect(d);
      const cx = clamp(x, rect.x, rect.x + rect.w), cy = clamp(y, rect.y, rect.y + rect.h);
      const dist = Math.hypot(x - cx, y - cy);
      if (dist > rad) continue;
      if (dist > 4) {
        let da = Math.atan2(cy - y, cx - x) - a;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) > arc / 2) continue;
      }
      if (dist < bestD) { bestD = dist; best = d; }
    }
    return best;
  }

  checkSecretWalls() {
    const r = this.room;
    for (const b of this.bullets) {
      if (!b.friendly || b.dead) continue;
      const d = this.crackHitDir(b);
      if (d < 0) continue;
      b.dead = true;
      this.crackWallHurt(d);
    }
  }

  checkDoors() {
    const r = this.room, p = this.player;
    this.lockedHint = false;
    if (this.enemies.length > 0) return;   // 未清空不能离房
    let onDoor = -1;
    for (let d = 0; d < 4; d++) {
      if (!r.doors[d] || !r.doorOpen[d] || !r.neighbors[d]) continue;
      const z = this.floor.exitZone(d);
      if (p.x > z.x && p.x < z.x + z.w && p.y > z.y && p.y < z.y + z.h) { onDoor = d; break; }
    }
    // 刚进门的几帧不判定，避免来回弹
    if (this.doorLock > 0) {
      /* 跳过 */
    } else if (onDoor >= 0) {
      const nb = this.floor.rooms.get(r.neighbors[onDoor]);
      // 藏珍阁封印门：1 把钥匙开启；没钥匙时可用 1 颗雷符炸开（按 E）
      if (nb.type === RT.TREASURE && !nb.unlocked) {
        if (this.keys > 0) {
          this.keys--; nb.unlocked = true;
          SFX.door();
          this.floaters.push(new Floater(p.x, p.y - 22, 'KEY', PAL.gold));
        } else if (this.bombs > 0 && this.input.interact) {
          this.bombs--; nb.unlocked = true;
          SFX.thunder(); this.shake(7);
          this.burst(p.x, p.y, 18, PAL.orange);
          this.floaters.push(new Floater(p.x, p.y - 22, 'BOOM', PAL.orange));
        } else {
          this.lockedHint = true;
          return;
        }
      }
      if (nb.type === RT.SECRET && !r.secretFound) { r.secretFound = true; nb.secretFound = true; SFX.secret(); }
      this.enterRoom(nb, onDoor);
      return;
    }
    // 传送阵
    for (const pr of this.props) {
      if (pr.kind === 'portal' && (!pr.delay || pr.delay <= 0) && circleHit(pr.x, pr.y, 14, p.x, p.y, p.r)) {
        SFX.levelup();
        this.nextFloor();
        return;
      }
    }
  }

  /* ---------------- 绘制 ---------------- */
  draw() {
    const g = this.g;
    g.clearRect(0, 0, 480, 320);
    g.fillStyle = '#0a0812'; g.fillRect(0, 0, 480, 320);
    if (this.state === 'title' || this.state === 'choose') { this.drawTitle(g); return; }

    const sx = (Math.random() - 0.5) * this.shakeAmt, sy = (Math.random() - 0.5) * this.shakeAmt;
    g.save();
    g.translate(sx, 32 + sy);
    g.beginPath(); g.rect(-8, -32, 496, 320); g.clip();

    // 地板与墙
    g.drawImage(this.room.bg, 0, 0);

    // 门
    this.drawDoors(g);

    // 障碍（石柱）
    for (const o of this.room.obstacles) {
      g.save();
      g.globalAlpha = 0.28; g.fillStyle = '#000';
      g.beginPath(); g.ellipse(o.x + o.w / 2, o.y + o.h - 2, o.w / 2, 5, 0, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      g.fillStyle = PAL.stone2;
      g.beginPath(); g.ellipse(o.x + o.w / 2, o.y + 6, o.w / 2, 10, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = PAL.stone;
      g.fillRect(o.x + 2, o.y + 6, o.w - 4, o.h - 10);
      g.fillStyle = PAL.stoneHi;
      g.fillRect(o.x + 3, o.y + 7, o.w - 8, 4);
      g.fillStyle = PAL.ink;
      g.fillRect(o.x + 1, o.y + o.h - 5, o.w - 2, 3);
      g.restore();
    }

    // 地面危险
    for (const h of this.hazards) h.draw(g);

    // 天崩剑狱：落地前的预警圈（内圈随倒计时收紧，外圈标出实际杀伤范围）
    if (this.ultWarn) {
      const w = this.ultWarn, k = 1 - w.t / w.max;
      g.save();
      // 范围圈：只描边 + 极淡填充，别糊住整个房间
      g.strokeStyle = PAL.gold; g.lineWidth = 2; g.globalAlpha = 0.4 + 0.45 * k;
      g.beginPath(); g.arc(w.x, w.y, w.r, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 0.05 + 0.09 * k; g.fillStyle = PAL.gold;
      g.beginPath(); g.arc(w.x, w.y, w.r, 0, Math.PI * 2); g.fill();
      // 收紧的内圈 = 落地倒计时
      g.globalAlpha = 0.75; g.lineWidth = 1; g.strokeStyle = PAL.goldL;
      g.beginPath(); g.arc(w.x, w.y, w.r * (1 - k), 0, Math.PI * 2); g.stroke();
      g.restore();
      // 天外飞剑：自天顶加速坠向落点，剑尖朝下、拖一道剑气
      this.drawFallingSword(g, w.x, w.y, k);
    }

    /* 插在地上的巨剑（落地后短暂驻留） */
    if (this.ultSword) {
      const s = this.ultSword, jj = SPR.jujian;
      const age = 1 - s.t / s.max;                    // 0 刚落地 → 1 即将消散
      // 落地头 8 帧剑身继续下压，做出「钉进去」的顿挫，之后缓缓回正
      const sink = s.t > s.max - 8 ? (s.max - s.t) * 0.7 : 0;
      g.save();
      g.globalAlpha = s.t > 14 ? 1 : s.t / 14;        // 末尾淡出
      g.translate(s.x, s.y - 12 + sink);
      g.rotate(Math.PI / 2);                          // 剑尖朝下
      g.scale(1.3, 1.3);
      g.drawImage(jj, -jj.width / 2, -jj.height / 2);
      g.restore();
      // 钉入处的裂纹与罡风
      g.save();
      g.globalAlpha = s.t > 14 ? 0.5 * (1 - age) : 0.5 * (s.t / 14);
      g.strokeStyle = PAL.goldL; g.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        g.beginPath(); g.moveTo(s.x, s.y);
        g.lineTo(s.x + Math.cos(a) * (14 + age * 10), s.y + Math.sin(a) * (7 + age * 5));
        g.stroke();
      }
      g.globalAlpha *= 0.6; g.fillStyle = PAL.gold;
      g.beginPath(); g.ellipse(s.x, s.y + 2, 12 + age * 8, 5 + age * 3, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    // 交互物（地面层）
    for (const pr of this.props) if (pr.kind === 'rune' || pr.kind === 'portal' || pr.kind === 'altar') pr.draw(g, this);

    // 雷符
    for (const bm of this.placedBombs) bm.draw(g);

    // 实体按 y 排序
    const drawables = [];
    for (const k of this.pickups) drawables.push(k);
    for (const pr of this.props) if (pr.kind === 'chest' || pr.kind === 'item' || pr.kind === 'shop' || pr.kind === 'keeper' || pr.kind === 'lantern' || pr.kind === 'incense') drawables.push(pr);
    for (const e of this.enemies) drawables.push(e);
    if (!this.player.dead) drawables.push(this.player);
    for (const b of this.bullets) drawables.push(b);
    drawables.sort((a, b) => (a.y - b.y));
    for (const d of drawables) d.draw(g, this);

    // 斩击刃光（舞剑流）：压在人物之上，扫过去的那道弧才看得清
    for (const sl of this.slashes) sl.draw(g);
    // 玄光：压在人物与妖物之上 —— 它是光，被谁挡住都说不过去，
    // 而且「能不能站得住」全靠这条线读得清不清楚
    for (const bm of this.beams) bm.draw(g);

    // 闪电
    for (const z of this.zaps) {
      g.strokeStyle = PAL.cyan; g.lineWidth = 2; g.globalAlpha = z.life / 12;
      g.beginPath(); g.moveTo(z.x1, z.y1);
      const mx = (z.x1 + z.x2) / 2 + (Math.random() - 0.5) * 20, my = (z.y1 + z.y2) / 2 + (Math.random() - 0.5) * 20;
      g.lineTo(mx, my); g.lineTo(z.x2, z.y2); g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke();
      g.globalAlpha = 1;
    }
    // 粒子
    for (const pt of this.particles) pt.draw(g);
    for (const f of this.floaters) f.draw(g);
    // 伤害数字压在浮字之上：暴击那一下是全场最该被看见的东西
    for (const d of this.dnums) d.draw(g);
    // 巨剑流蓄力特效（在房间坐标系内，随画面抖动）
    this.drawChargeFX(g);

    g.restore();

    // 受伤红闪
    if (this.hurtFlash > 0) {
      g.fillStyle = 'rgba(220,40,60,' + (this.hurtFlash / 12 * 0.35) + ')';
      g.fillRect(0, 0, 480, 320);
    }
    // 房间未清时门上红光提示
    this.drawHUD(g);
    // 局内长按 R 重开：底部进度条
    if (this.state === 'play' && this.restartHold > 0) {
      const w = 120, x = 240 - w / 2, y = 300;
      const k = Math.min(1, this.restartHold / 60);
      g.fillStyle = 'rgba(0,0,0,0.62)'; g.fillRect(x - 2, y - 2, w + 4, 10);
      g.fillStyle = PAL.gold; g.fillRect(x, y, w * k, 6);
      drawPixelText(g, 'RESTART', 240 - 7 * 6, y - 14, 1, PAL.goldL);
    }
    this.drawMinimap(g);
    if (this.bossRef && !this.bossRef.dead) this.drawBossBar(g);
    if (this.state === 'dead') this.drawDead(g);
    if (this.state === 'win') this.drawWin(g);
  }

  drawDoors(g) {
    const r = this.room;
    for (let d = 0; d < 4; d++) {
      if (!r.doors[d]) continue;
      const rect = this.floor.doorRect(d);
      const nb = this.floor.rooms.get(r.neighbors[d]);
      const locked = nb && nb.type === RT.TREASURE && !nb.unlocked;
      if (r.doorHidden[d]) {
        g.drawImage(rect.vertical ? SPR.crack.v : SPR.crack.h, rect.x, rect.y);
        if (r.doorHp[d] < 3) {
          g.globalAlpha = 0.5; g.strokeStyle = PAL.jade; g.lineWidth = 1;
          g.strokeRect(rect.x, rect.y, rect.w, rect.h); g.globalAlpha = 1;
        }
      } else if (locked) {
        const s = rect.vertical ? SPR.door.v[0] : SPR.door.h[0];
        g.drawImage(s, rect.x, rect.y);
        g.drawImage(SPR.key, rect.x + rect.w / 2 - 4, rect.y + rect.h / 2 - 4 + Math.sin(this.tick * 0.08) * 1.5);
      } else if (r.doorOpen[d]) {
        const s = rect.vertical ? SPR.door.v[1] : SPR.door.h[1];
        g.drawImage(s, rect.x, rect.y);
        // 通路指示
        g.save(); g.globalAlpha = 0.25 + Math.sin(this.tick * 0.06) * 0.1;
        g.fillStyle = PAL.jade;
        if (d === 0) g.fillRect(rect.x + 6, rect.y + rect.h - 3, rect.w - 12, 3);
        if (d === 2) g.fillRect(rect.x + 6, rect.y, rect.w - 12, 3);
        if (d === 1) g.fillRect(rect.x, rect.y + 6, 3, rect.h - 12);
        if (d === 3) g.fillRect(rect.x + rect.w - 3, rect.y + 6, 3, rect.h - 12);
        g.restore();
      } else {
        const s = rect.vertical ? SPR.door.v[0] : SPR.door.h[0];
        g.drawImage(s, rect.x, rect.y);
      }
    }
  }

  drawHUD(g) {
    // 顶栏
    g.fillStyle = '#120e20'; g.fillRect(0, 0, 480, 32);
    g.fillStyle = '#2a2340'; g.fillRect(0, 31, 480, 1);
    g.fillStyle = PAL.gold; g.globalAlpha = 0.35; g.fillRect(0, 30, 480, 1); g.globalAlpha = 1;

    const p = this.player;
    // 流派标识：放在资源行右侧，避开居中的楼层名
    const stl = STYLES[this.style] || STYLES.feijian;
    const isJu = this.style === 'jujian';
    const ic = styleIcon(this.style);
    g.save();
    g.translate(130, 12);
    g.scale(isJu ? 0.8 : 0.85, isJu ? 0.8 : 0.85);
    g.drawImage(ic, -ic.width / 2, -ic.height / 2);
    g.restore();
    drawPixelText(g, stl.en, 148, 9, 1, styleColor(this.style));

    // 气血（半心单位）
    let hx = 8;
    const total = Math.ceil(p.maxHP / 2);
    for (let i = 0; i < total; i++) {
      const left = p.hp - i * 2;
      const st = left >= 2 ? 2 : (left === 1 ? 1 : 0);
      g.drawImage(SPR.heart[st], hx, 8);
      hx += 12;
    }
    // 护盾：常驻护盾（不闪）+ 限时护盾（护体金光，将散时闪一下提醒）
    const shBlink = p.tShield > 0 && p.shieldT > 0 && p.shieldT <= 90 && (this.tick % 20 < 10);
    for (let i = 0; i < Math.min(8, p.shield + p.tShield); i++) {
      const timed = i < p.tShield;               // 限时护盾画在前，与「先消耗它」一致
      if (!(timed && shBlink)) g.drawImage(SPR.shield[1], hx, 8);
      hx += 12;
    }

    /* 灵力条：紧贴心血下方，跟血量一起构成需要实时盯的资源区 */
    const mx0 = 8, my0 = 20, mw = 88, mh = 10;
    g.fillStyle = '#161030'; g.fillRect(mx0, my0, mw, mh);
    const mpk = clamp(p.mp / p.maxMP, 0, 1);
    g.fillStyle = mpk >= 1 ? PAL.cyan : '#3f8fd0';
    g.fillRect(mx0, my0, mw * mpk, mh);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(mx0, my0, mw * mpk, 2);
    // 每 10 点一道刻度，余光里也能估算够不够放一发
    g.fillStyle = 'rgba(8,6,18,0.4)';
    for (let i = 1; i < 10; i++) g.fillRect(mx0 + mw * i / 10 - 0.5, my0, 1, mh);
    g.strokeStyle = '#4d4478'; g.lineWidth = 1; g.strokeRect(mx0 + 0.5, my0 + 0.5, mw - 1, mh - 1);
    // 条内嵌一颗灵力珠：和地上掉的那种是同一个精灵，一眼对上号
    if (SPR.mana) g.drawImage(SPR.mana, mx0 + 1, my0 + 1, 8, 8);
    drawPixelText(g, '灵力 ' + Math.floor(p.mp) + '/' + p.maxMP, mx0 + mw + 5, my0 + 1, 1, PAL.cyan);

    this.itemHits = [];                       // 供鼠标悬停说明做命中判定
    this.ultHit = null;

    /* 灵石 / 钥匙 / 雷符（右上）：消耗品计数不必实时盯，让位给灵力 */
    let ix = 344;
    g.drawImage(SPR.coin, ix, 5); ix += 11;
    drawPixelText(g, String(this.coins), ix, 5, 1, PAL.jadeL); ix += String(this.coins).length * 6 + 8;
    g.drawImage(SPR.key, ix, 3); ix += 11;
    drawPixelText(g, String(this.keys), ix, 5, 1, PAL.gold); ix += String(this.keys).length * 6 + 8;
    g.drawImage(SPR.bomb, ix, 3); ix += 13;
    drawPixelText(g, String(this.bombs), ix, 5, 1, PAL.redL);

    /* 专属技能（右上）：空格释放 */
    const ux = 452, uy = 4;
    /* 舞剑流在连段窗口内可以无视冷却直接接招，所以这时候不能把格子画成「冷却中」——
       玩家盯着「14 秒」会以为接不上，而实际上完全接得上。窗口优先于冷却显示。 */
    const chainOpen = !!(p.ult && p.ult.style === 'wujian' && p.wjStage > 0 && p.wjChainT > 0);
    g.fillStyle = '#1d1832'; g.fillRect(ux, uy, 24, 24);
    g.strokeStyle = p.ult ? (chainOpen ? PAL.cyan : PAL.gold) : '#4d4478';
    g.lineWidth = 1; g.strokeRect(ux + 0.5, uy + 0.5, 23, 23);
    if (p.ult) {
      const UD = ULT_DEF[p.ult.style] || ULT_DEF.feijian;
      const ic = styleIcon(p.ult.style);
      g.save(); g.translate(ux + 12, uy + 12); g.scale(0.8, 0.8);
      g.drawImage(ic, -ic.width / 2, -ic.height / 2); g.restore();
      this.ultHit = { x: ux, y: uy, w: 24, h: 24 };
      if (p.ultCd > 0 && !chainOpen) {
        const k = p.ultCd / ultCdOf(p.ult, p.ult.style);
        g.fillStyle = 'rgba(8,6,18,0.72)';
        g.fillRect(ux + 1, uy + 1, 22, 22 * k);
        drawPixelText(g, String(Math.ceil(p.ultCd / 60)), ux + 8, uy + 8, 1, PAL.white);
      } else {
        drawPixelText(g, 'L' + ultLevel(p.ult), ux + 3, uy + 15, 1, PAL.goldL);
        // 舞剑流：右下角标出「下一段是第几段」，连招进行中一眼可辨
        if (p.ult.style === 'wujian') {
          drawPixelText(g, String(p.wjStage + 1), ux + 16, uy + 15, 1,
            p.wjStage > 0 ? PAL.cyan : '#6b6490');
        }
      }
      /* 击杀返还的瞬时反馈：冷却条缩掉一截的那一刻，用一道亮线 + 「−N 秒」标出来。
         没有这个，玩家只会觉得「CD 好像有点怪」，而不会归因到「剑意不绝」这条线上。 */
      if (p.ultCdFlash > 0) {
        g.globalAlpha = Math.min(1, p.ultCdFlash / 9);
        const kf = clamp(p.ultCd / Math.max(1, ultCdOf(p.ult, p.ult.style)), 0, 1);
        const ly = uy + 1 + 22 * kf;      // 冷却条的边界，返还时会上移一截
        g.strokeStyle = PAL.cyan; g.lineWidth = 2;
        g.beginPath(); g.moveTo(ux + 1, ly); g.lineTo(ux + 23, ly); g.stroke();
        g.lineWidth = 1; g.strokeRect(ux + 0.5, uy + 0.5, 23, 23);
        if (p.ultCdFlashAmt > 0) {
          // 垫一层暗底：数字落在石室的砖缝上会看不清，而这行小字的意义就是「让你看见」
          g.fillStyle = 'rgba(8,6,18,0.78)';
          g.fillRect(ux, uy + 24, 24, 9);
          drawPixelText(g, '-' + Math.round(p.ultCdFlashAmt / 60), ux + 3, uy + 25, 1, PAL.cyan);
        }
        g.globalAlpha = 1;
      }
    } else {
      drawPixelText(g, '空格', ux + 2, uy + 9, 1, '#4d4478');
    }

    /* 小技能槽（右下）：1/2/3 切换、Q 释放 */
    const sx0 = 398, sy0 = 320 - 24;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const s = p.slots[i];
      const x = sx0 + i * 24, y = sy0, w = 21, h = 21;
      g.fillStyle = '#1d1832'; g.fillRect(x, y, w, h);
      g.strokeStyle = (i === p.slotIdx) ? PAL.gold : '#4d4478';
      g.lineWidth = (i === p.slotIdx) ? 2 : 1;
      g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      g.lineWidth = 1;
      if (!s) { drawPixelText(g, String(i + 1), x + 7, y + 7, 1, '#4d4478'); continue; }
      const ic = ITEM_ICONS[s.id];
      if (ic) g.drawImage(ic, x + 3, y + 3);
      drawPixelText(g, String(s.lv), x + w - 6, y + h - 7, 1, PAL.goldL);
      // 独立冷却：自上而下退去的遮罩 + 剩余秒数
      const cd = p.skillCd[i] || 0;
      if (cd > 0) {
        const k = cd / skillCd(s.id, s.lv);
        g.fillStyle = 'rgba(8,6,18,0.74)';
        g.fillRect(x + 1, y + 1, w - 2, (h - 2) * Math.min(1, k));
        const sec = Math.ceil(cd / 60);
        drawPixelText(g, String(sec), x + (sec > 9 ? 4 : 7), y + 7, 1, PAL.white);
      } else if (p.mp < SKILL_DEF[s.id].cost) {
        // 灵力不够：整体压暗，一眼看出放不出来
        g.fillStyle = 'rgba(8,6,18,0.6)'; g.fillRect(x + 1, y + 1, w - 2, h - 2);
      }
      this.itemHits.push({ id: s.id, x: x, y: y, w: w, h: h, rank: s.lv - 1 });
    }
    drawPixelText(g, 'Q', sx0 - 9, sy0 + 7, 1, '#6b6490');

    // 已获法宝（左下角）：同种堆叠成一层，右下角标 LvN
    let bx = 6, by = 320 - 22;
    const order = [], cnt = {};
    for (const id of p.items) { if (!(id in cnt)) { cnt[id] = 0; order.push(id); } cnt[id]++; }
    const show = order.slice(-12);
    for (const id of show) {
      const ic = ITEM_ICONS[id];
      if (ic) {
        g.globalAlpha = 0.9; g.drawImage(ic, bx, by); g.globalAlpha = 1;
        const n = cnt[id];
        if (n > 1) {
          const lab = 'Lv' + n;
          g.fillStyle = 'rgba(8,6,18,0.8)'; g.fillRect(bx, by + 10, 17, 6);
          drawPixelText(g, lab, bx + 1, by + 11, 1, PAL.goldL);
        }
        this.itemHits.push({ id, x: bx, y: by, w: 16, h: 16, rank: n - 1 });
      }
      bx += 19;
      if (bx > 228) { bx = 6; by -= 19; }
    }
    // 悬停高亮
    if (this.hoverItem) {
      const hv = this.itemHits.find(h => h.id === this.hoverItem);
      if (hv) {
        g.strokeStyle = PAL.gold; g.lineWidth = 1;
        g.strokeRect(hv.x - 1.5, hv.y - 1.5, hv.w + 3, hv.h + 3);
      }
    }
  }

  /* 鼠标悬停道具 → HTML 说明浮层（画布像素字体画不了中文） */
  updateItemTip() {
    const el = document.getElementById('tip');
    if (!el) return;
    const shopEl = document.getElementById('shopTip');
    if (this.state !== 'play' || !this.itemHits) { el.style.display = 'none'; this.hoverItem = null; return; }
    const inBox = b => b && input.hx >= b.x && input.hx <= b.x + b.w && input.hy >= b.y && input.hy <= b.y + b.h;
    // 专属技能：优先于背包，右上角那个格子
    const p0 = this.player;
    if (inBox(this.ultHit) && p0 && p0.ult) {
      const UD = ULT_DEF[p0.ult.style] || ULT_DEF.feijian;
      let h = '<div class="tn">' + UD.name + '<span class="tt">专属技能</span></div>'
            + '<div class="td">' + UD.desc + '</div>'
            + '<div class="twarn">[空格] 施展　冷却 ' + Math.round(ultCdOf(p0.ult, p0.ult.style) / 60) + ' 秒</div>';
      const learned = (ULT_PATH[p0.ult.style] || []).filter(x => ultPathLv(p0.ult, x.id) > 0);
      if (learned.length) {
        h += '<div class="talt">' + learned.map(x => '<b>' + x.name + '</b> Lv.' + ultPathLv(p0.ult, x.id)).join('<br>') + '</div>';
      }
      if (el._html !== h) { el.innerHTML = h; el._html = h; }
      el.style.display = 'block';
      this.hoverItem = null;
      const lx = this.ultHit.x / 9, ly = this.ultHit.y / 9;
      el.style.left = lx + 'em'; el.style.top = ly + 'em';
      el.style.transform = 'translateX(-100%)';
      return;
    }
    const hit = this.itemHits.find(inBox);
    if (!hit) { el.style.display = 'none'; this.hoverItem = null; return; }
    // 坊市预览已经占着同一块地方时不重复弹，免得两层说明叠在一起
    if (shopEl && shopEl.style.display === 'block') { el.style.display = 'none'; this.hoverItem = hit.id; return; }
    this.hoverItem = hit.id;
    const def = ITEM_MAP[hit.id];
    if (!def) { el.style.display = 'none'; return; }
    // 小技能槽带自己的等级；背包里的法宝则按持有件数算阶数
    const rank = hit.rank !== undefined ? hit.rank
      : Math.max(0, this.player.items.filter(i => i === hit.id).length - 1);
    let html = itemTipHTML(def, this.style, null, rank);
    if (def.type === 'gongfa' && this.player) {
      const sl = this.player.slots.find(v => v && v.id === hit.id);
      if (sl) html += '<div class="talt">已置于槽位 ' + (this.player.slots.indexOf(sl) + 1)
        + '　按 <b>Q</b> 施展　灵力 ' + SKILL_DEF[sl.id].cost + '</div>';
    }
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
    el.style.display = 'block';
    // 画布坐标 → em（stage 的 1em = 画布 9px）
    const lx = hit.x / 9, ly = hit.y / 9;
    const flipY = ly > 17;                       // 靠底部 → 向上翻
    const flipX = lx > 53.3 - 16;                // 靠右侧 → 向左翻（避免溢出画布）
    el.style.left = lx + 'em';
    el.style.top = ly + 'em';
    el.style.transform = (flipY ? 'translateY(-100%)' : '') + (flipX ? ' translateX(-100%)' : '');
  }

  /* 站在坊市货品 / Boss 二选一摆件前 → 悬出效果预览（拿之前先看清是什么） */
  updateShopTip() {
    const el = document.getElementById('shopTip');
    if (!el) return;
    const pr = this.state === 'play' ? (this.shopHint || this.pickHint) : null;
    const def = pr && ITEM_MAP[pr.item];
    if (!def) { el.style.display = 'none'; el._html = null; return; }
    // 坊市要花钱，Boss 奖励只要按 E 认领
    const buy = pr.price != null
      ? (this.coins >= pr.price
        ? '<div class="tbuy">按 E 购买（' + pr.price + ' 灵石）</div>'
        : '<div class="tbuy">灵石不足 —— 需 ' + pr.price + '，现有 ' + this.coins + '</div>')
      : '<div class="tbuy">按 E 选取（取走一件，另一件随之消散）</div>';
    // 买下之后是第几件 → 功能型法宝 / 小技能直接预览到手后的效果
    let rank = 0;
    if (this.player) {
      if (def.type === 'gongfa') {
        const sl = this.player.slots.find(v => v && v.id === pr.item);
        rank = sl ? sl.lv : 0;              // itemView 内部再 +1，正好是买下后的等级
      } else rank = this.player.items.filter(i => i === pr.item).length;
    }
    const html = itemTipHTML(def, this.style, buy, rank);
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
    el.style.display = 'block';
    // 画布像素 → 屏幕像素（stage 缩放随窗口而变，用固定 em 会在窄窗口下飘出画面）
    const box = el.parentElement;
    const bw = box.clientWidth, bh = box.clientHeight;
    const sx = bw / ROOM_W, sy = bh / ROOM_H;
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = (pr.x - 30) * sx;
    let top = (pr.y - 18) * sy - h;              // 默认挂在货品正上方
    if (top < 4) top = pr.y * sy + 12;           // 顶上放不下 → 改挂下方
    if (top + h > bh - 4) top = Math.max(4, bh - 4 - h);
    if (left + w > bw - 4) left = bw - 4 - w;
    if (left < 4) left = 4;
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.transform = '';
  }

  drawMinimap(g) {
    const f = this.floor;
    const cell = 9, gap = 2, size = f.size;
    const w = size * (cell + gap) - gap + 4;
    const ox = 480 - w - 6, oy = 38;
    g.save();
    g.globalAlpha = 0.92;
    g.fillStyle = '#0d0a18';
    g.fillRect(ox - 2, oy - 2, w + 4, size * (cell + gap) - gap + 8);
    g.globalAlpha = 1;
    for (const r of f.rooms.values()) {
      if (!r.visited && !r.seen) continue;
      if (r.type === RT.SECRET && !r.secretFound && !r.visited) continue;
      const x = ox + r.gx * (cell + gap), y = oy + r.gy * (cell + gap);
      const col = {
        start: PAL.jade, normal: '#5a5478', boss: PAL.red, treasure: PAL.gold,
        shop: PAL.purple, secret: '#3fd68a', sacrifice: PAL.orange
      }[r.type] || '#5a5478';
      g.fillStyle = r.visited ? col : '#332e4a';
      g.fillRect(x, y, cell, cell);
      if (r.cleared && r.type !== RT.NORMAL) { g.fillStyle = '#0d0a18'; g.fillRect(x + 2, y + 2, cell - 4, cell - 4); }
      // 门
      g.fillStyle = r.visited ? '#8a83b0' : '#3a3550';
      for (let d = 0; d < 4; d++) {
        if (!r.doors[d]) continue;
        if (r.doorHidden[d] && !r.doorOpen[d]) continue;
        if (d === 0) g.fillRect(x + 3, y - 2, 3, 2);
        if (d === 2) g.fillRect(x + 3, y + cell, 3, 2);
        if (d === 3) g.fillRect(x - 2, y + 3, 2, 3);
        if (d === 1) g.fillRect(x + cell, y + 3, 2, 3);
      }
      if (r === this.room) {
        g.strokeStyle = '#fff'; g.lineWidth = 1;
        g.strokeRect(x - 1.5, y - 1.5, cell + 3, cell + 3);
      }
    }
    g.restore();
  }

  drawBossBar(g) {
    const b = this.bossRef;
    const w = 260, x = (480 - w) / 2, y = 320 - 12;
    g.fillStyle = '#0d0a18'; g.fillRect(x - 2, y - 2, w + 4, 10);
    g.fillStyle = '#3a1220'; g.fillRect(x, y, w, 6);
    g.fillStyle = PAL.red; g.fillRect(x, y, w * (b.hp / b.maxHp), 6);
    g.fillStyle = PAL.redL; g.fillRect(x, y, w * (b.hp / b.maxHp), 2);
    g.strokeStyle = PAL.gold; g.lineWidth = 1; g.strokeRect(x - 0.5, y - 0.5, w + 1, 7);
  }

  /* ---------------- 巨剑流 · 蓄力表现 ---------------- */
  /* 蓄力进度归一：t=0 起手 → 1 一段 → 2 二段（封顶） */
  chargeNorm(t) {
    if (t < CHARGE.t1) return t / CHARGE.t1;
    if (t < CHARGE.t2) return 1 + (t - CHARGE.t1) / (CHARGE.t2 - CHARGE.t1);
    return 2;
  }

  /* 舞剑流 · 蓄势槽：左端是蓄力进度，右端标出「下一段是第几段」；
     槽上那道竖刻度是能放出的下限（不到线就松手会收势）。
     不在蓄势但连段窗口还亮着时，槽内画一条退去的青条当倒计时。
     蓄势时还会沿指针方向点出一串落点刻度 —— 蓄势越久点得越远，
     短蓄势的小碎步与蓄满的全力一突一眼可辨。
     蓄势光晕与突进残影在 Player.draw 里画，这里只管头顶这条槽。 */
  drawWujianFX(g, p) {
    if (!p.wjCharging && p.wjChainT <= 0 && p.dashFlurry <= 0) return;
    const w = 28, h = 4;
    const x = Math.round(p.x - w / 2), y = Math.round(p.y - 27);
    const k = clamp(p.wjChargeT / WJ.charge, 0, 1);
    const col = p.wjFull ? PAL.gold : (p.wjStage > 0 ? PAL.cyan : PAL.jadeL);
    g.save();
    g.fillStyle = '#0d0a18'; g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle = '#2a2340'; g.fillRect(x, y, w, h);
    if (p.wjCharging) {
      g.fillStyle = p.wjChargeT >= WJ.chargeMin ? col : '#3a3358';
      g.fillRect(x, y, Math.round(w * k), h);
      g.fillStyle = PAL.white; g.fillRect(x, y, Math.round(w * k), 1);
      g.fillStyle = '#6b6390';
      g.fillRect(x + Math.round(w * (WJ.chargeMin / WJ.charge)), y - 2, 1, h + 4);
      if (p.wjFull && Math.floor(this.tick / 5) % 2 === 0) {
        g.strokeStyle = PAL.goldL; g.lineWidth = 1;
        g.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
      }
    } else if (p.wjChainT > 0) {
      const total = Math.max(1, WJ.chain + ultPathVal(p.ult, 'wujian', 'chain'));
      g.fillStyle = PAL.cyan;
      g.globalAlpha = 0.75;
      g.fillRect(x, y, Math.round(w * clamp(p.wjChainT / total, 0, 1)), h);
      g.globalAlpha = 1;
    }
    g.restore();
    drawPixelText(g, 'S' + (p.wjStage + 1), x + w + 3, y - 2, 1, col);

    if (!p.wjCharging) return;
    // 落点预览：末端那一点就是这一下会落到的位置（与实际突进共用 wjDashLen）
    const a = ultAimAngle(p);
    const ca = Math.cos(a), sa = Math.sin(a);
    const len = wjDashLen(p, p.wjChargeT);
    g.fillStyle = p.wjFull ? PAL.goldL : PAL.jade;
    g.globalAlpha = 0.4;
    for (let d = 12; d < len; d += 7) {
      g.fillRect(Math.round(p.x + ca * d), Math.round(p.y + 2 + sa * d), 1, 1);
    }
    g.globalAlpha = 0.75;
    g.fillRect(Math.round(p.x + ca * len) - 1, Math.round(p.y + 2 + sa * len) - 1, 2, 2);
    g.globalAlpha = 1;
  }

  /* 两把小剑自两侧收拢，与中心剑合成一柄巨剑 */
  drawChargeFX(g) {
    const p = this.player;
    if (!p || p.dead) return;
    if (this.style === 'wujian') { this.drawWujianFX(g, p); return; }
    if (this.style !== 'jujian') return;
    if (!p.charging || p.chargeT <= 0) {
      if (p.shootCd > 0) this.drawRecoverBar(g, p);   // 出剑后摇：画回气条
      return;
    }
    const tier = chargeTier(p.chargeT);
    const t = this.chargeNorm(p.chargeT);
    // 与实际发射方向保持一致：优先用蓄力时锁存的瞄准角
    const a = (p.chargeAim !== null && p.chargeAim !== undefined)
      ? p.chargeAim : (input.aiming ? input.aimAngle : Math.PI / 2);

    // 合体中心：取玩家身前，像是剑在身前凝形
    const cx = p.x + Math.cos(a) * 15, cy = p.y - 4 + Math.sin(a) * 15;

    // 收拢：t→1.7 时两剑完全并拢；倾斜角同步归零，由「外八字」转成正对
    const close = clamp(t / 1.7, 0, 1);
    const off = 20 * (1 - close);
    const tilt = 0.55 * (1 - close);
    // 并拢后小剑淡出（已融入主剑）
    const smallA = 1 - clamp((t - 1.15) / 0.55, 0, 1);
    const mainScale = lerp(0.45, CHARGE_TIER[tier].scale, clamp(t / 2, 0, 1));

    g.save();

    // 蓄力光晕：一段青玉，二段鎏金
    const glow = tier === 2 ? PAL.gold : PAL.jade;
    g.globalAlpha = 0.16 + tier * 0.07 + Math.sin(this.tick * 0.22) * 0.08;
    g.fillStyle = glow;
    g.beginPath();
    g.arc(cx, cy, 11 + tier * 4 + Math.sin(this.tick * 0.18) * 1.6, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;

    // 左右两把小剑（复用飞剑精灵 —— 御剑化巨剑）
    if (smallA > 0.02) {
      const perp = a + Math.PI / 2;
      const sx = Math.cos(perp), sy = Math.sin(perp);
      for (const sgn of [-1, 1]) {
        g.save();
        g.globalAlpha = smallA;
        g.translate(cx + sx * off * sgn, cy + sy * off * sgn);
        g.rotate(a + tilt * sgn);
        g.scale(0.72, 0.72);
        g.drawImage(SPR.sword, -SPR.sword.width / 2, -SPR.sword.height / 2);
        g.restore();
      }
    }

    // 中心主剑：随蓄力膨胀，跨段瞬间抖一下
    const flick = p.chargeFlash > 0 ? (1 + Math.sin(this.tick * 1.1) * 0.14) : 1;
    g.save();
    g.translate(cx, cy);
    g.rotate(a);
    g.scale(mainScale * flick, mainScale * flick);
    g.drawImage(SPR.jujian, -SPR.jujian.width / 2, -SPR.jujian.height / 2);
    g.restore();

    g.restore();

    this.drawChargeBar(g, p, tier);
  }

  /* 蓄力槽：整条对应 0~max，两道刻度划分为「点射 / 一段 / 二段」 */
  drawChargeBar(g, p, tier) {
    const w = 28, h = 4;
    const x = Math.round(p.x - w / 2), y = Math.round(p.y - 27);
    const main = tier === 2 ? PAL.gold : (tier === 1 ? PAL.jade : PAL.grey);
    const hi = tier === 2 ? PAL.goldL : (tier === 1 ? PAL.jadeL : PAL.greyL);
    g.save();
    g.fillStyle = '#0d0a18'; g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle = '#2a2340'; g.fillRect(x, y, w, h);
    const fw = Math.round(w * clamp(p.chargeT / CHARGE.max, 0, 1));
    g.fillStyle = main; g.fillRect(x, y, fw, h);
    g.fillStyle = hi; g.fillRect(x, y, fw, 1);
    // 段位刻度
    g.fillStyle = '#100c1c';
    g.fillRect(x + Math.round(w * CHARGE.t1 / CHARGE.max), y, 1, h);
    g.fillRect(x + Math.round(w * CHARGE.t2 / CHARGE.max), y, 1, h);
    // 满蓄：边框闪烁
    if (tier === 2 && Math.floor(this.tick / 5) % 2 === 0) {
      g.strokeStyle = PAL.goldL; g.lineWidth = 1;
      g.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
    }
    g.restore();
    drawPixelText(g, 'LV' + tier, x + w + 3, y - 2, 1, hi);
  }

  /* 出剑后摇：力竭回气条，充满方可再次凝剑 */
  drawRecoverBar(g, p) {
    const w = 28, h = 4;
    const x = Math.round(p.x - w / 2), y = Math.round(p.y - 27);
    const k = p.chargeCdMax > 0 ? clamp(1 - p.shootCd / p.chargeCdMax, 0, 1) : 0;
    g.save();
    g.fillStyle = '#0d0a18'; g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle = '#2a2340'; g.fillRect(x, y, w, h);
    g.fillStyle = PAL.purpleD; g.fillRect(x, y, Math.round(w * k), h);
    g.fillStyle = PAL.purpleL; g.fillRect(x, y, Math.round(w * k), 1);
    g.restore();
  }

  drawTitle(g) {
    // 背景：法阵
    g.fillStyle = '#0a0812'; g.fillRect(0, 0, 480, 320);
    g.save();
    g.translate(240, 160);
    for (let k = 0; k < 3; k++) {
      g.strokeStyle = [PAL.jadeD, PAL.goldD, PAL.purpleD][k];
      g.lineWidth = 1;
      const r = 60 + k * 22;
      g.beginPath(); g.arc(0, 0, r, this.tick * 0.006 * (k % 2 ? -1 : 1), this.tick * 0.006 * (k % 2 ? -1 : 1) + Math.PI * 1.6); g.stroke();
    }
    g.globalAlpha = 0.5;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + this.tick * 0.004;
      g.strokeStyle = PAL.jadeD;
      g.beginPath(); g.arc(Math.cos(a) * 46, Math.sin(a) * 46, 5, 0, Math.PI * 2); g.stroke();
    }
    g.restore();
  }

  drawDead(g) {
    g.fillStyle = 'rgba(8,5,16,0.78)'; g.fillRect(0, 0, 480, 320);
    drawPixelText(g, 'DAO XIAO', 240 - 8 * 6 * 2, 130, 2, PAL.red);
    drawPixelText(g, 'PRESS R', 240 - 7 * 6, 168, 1, PAL.grey);
  }
  drawWin(g) {
    g.fillStyle = 'rgba(8,5,16,0.82)'; g.fillRect(0, 0, 480, 320);
    drawPixelText(g, 'FEI SHENG', 240 - 9 * 6 * 2, 130, 2, PAL.gold);
    drawPixelText(g, 'PRESS R', 240 - 7 * 6, 168, 1, PAL.jadeL);
  }

  /* ---------------- 主循环 ---------------- */
  frame(ts) {
    if (!this.last) this.last = ts;
    let dt = ts - this.last; this.last = ts;
    if (dt > 100) dt = 100;
    this.acc += dt;
    const step = 1000 / 60;
    let n = 0;
    while (this.acc >= step && n < 5) {
      try { this.update(); } catch (e) { console.error('[update]', e); }
      this.acc -= step; n++;
    }
    try { this.draw(); } catch (e) { console.error('[draw]', e); }
    try { this.updateItemTip(); } catch (e) { console.error('[tip]', e); }
    try { this.updateShopTip(); } catch (e) { console.error('[tip]', e); }
    requestAnimationFrame(t => this.frame(t));
  }
}

/* ---------------- 启动 ---------------- */
let Game = null;
function boot() {
  buildSprites();
  buildItemIcons();
  const canvas = document.getElementById('game');
  Game = new GameCore(canvas);
  window.Game = Game;
  bindInput(canvas, Game);
  requestAnimationFrame(t => Game.frame(t));
  updateOverlay();
  setInterval(updateOverlay, 100);
}

function bindInput(canvas, game) {
    const setKey = (e, down) => {
    const k = e.key.toLowerCase();
    switch (k) {
      case 'w': input.up = down; break;
      case 's': input.down = down; break;
      case 'a': input.left = down; break;
      case 'd': input.right = down; break;
      case 'arrowup': input.sUp = down; break;
      case 'arrowdown': input.sDown = down; break;
      case 'arrowleft': input.sLeft = down; break;
      case 'arrowright': input.sRight = down; break;
      case ' ':
        // 空格 = 专属技能，绝不兼作交互键。
        // 舞剑流靠「松手」触发突进，故按下与松开各走一个入口
        if (down) game.useUlt(); else game.ultUp();
        break;
      case 'q': if (down) game.useSkill(); break;
      case '1': case '2': case '3':
        if (!down) break;
        if (game.pick) game.pickPick(+k - 1);       // 选择界面：择卡片
        else if (game.state === 'play') game.slotKey(+k - 1);
        break;
      case 'e': if (down) input.interact = true; break;
      case 'f': if (down && game.state === 'play') game.placeBomb(); break;
      case 'r':
        input.restart = down;
        if (down && (game.state === 'dead' || game.state === 'win')) game.newRun();
        break;
      case 'm': if (down) { SFX.on = !SFX.on; } break;
    }
    // 射击方向合成
    const smx = (input.sRight ? 1 : 0) - (input.sLeft ? 1 : 0);
    const smy = (input.sDown ? 1 : 0) - (input.sUp ? 1 : 0);
    input.mouseShoot = input.mouseDown;
    if (smx || smy) { input.keyShoot = true; input.keyAngle = Math.atan2(smy, smx); }
    else input.keyShoot = false;
    if (down) SFX.ensure();
  };
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if ([' ', 'enter', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    if (!e.repeat) setKey(e, true);
    if (e.repeat) return;
    // 技能替换 / 专属升级面板：优先吃掉方向键与回车
    if (game.pick) {
      if (k === 'arrowleft') game.pickMove(-1);
      else if (k === 'arrowright') game.pickMove(1);
      else if (k === 'enter' || k === ' ' || k === 'q') game.pickConfirm();
      return;
    }
    if (game.state === 'title') {
      game.styleIdx = 0;
      game.state = 'choose';
      SFX.ensure();
    } else if (game.state === 'choose') {
      const n = Math.max(1, PLAYABLE_STYLES.length);
      if (k === 'arrowleft') { game.styleIdx = (game.styleIdx + n - 1) % n; SFX.tone(660, 0.05, 'square', 0.09); }
      else if (k === 'arrowright') { game.styleIdx = (game.styleIdx + 1) % n; SFX.tone(880, 0.05, 'square', 0.09); }
      else if (k === '1' || k === '2' || k === '3') {
        const i = +k - 1;
        if (i < n) { game.styleIdx = i; SFX.tone(660 + i * 110, 0.05, 'square', 0.09); }
      } else if (k === 'enter' || k === ' ') {
        SFX.levelup();
        game.newRun(PLAYABLE_STYLES[game.styleIdx] || PLAYABLE_STYLES[0]);
      }
    }
  });
  window.addEventListener('keyup', e => setKey(e, false));

  canvas.addEventListener('mousedown', e => { SFX.ensure(); input.mouseDown = true; updateMouse(e, canvas); });
  window.addEventListener('mouseup', () => { input.mouseDown = false; });
  canvas.addEventListener('mousemove', e => updateMouse(e, canvas));
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  // 窗口失焦 / 页面隐藏时松手事件可能收不到：主动放开，避免「一直按住」的假象
  window.addEventListener('blur', () => { input.mouseDown = false; input.restart = false; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { input.mouseDown = false; input.restart = false; }
  });
}

function updateMouse(e, canvas) {
  const r = canvas.getBoundingClientRect();
  input.mx = (e.clientX - r.left) / r.width * 480;
  input.my = (e.clientY - r.top) / r.height * 320 - 32;
  // HUD 用的是未偏移的画布坐标，供道具悬停命中判定
  input.hx = (e.clientX - r.left) / r.width * 480;
  input.hy = (e.clientY - r.top) / r.height * 320;
  input.mouseT = performance.now();
  input.mouseSeen = true;
}
/* 专属技能的指向：一律看鼠标指针，鼠标没动过才依次退回「最近瞄准方向」和「人物朝向」 */
function ultAimAngle(p) {
  if (input.mouseSeen) return Math.atan2(input.my - p.y, input.mx - p.x);
  if (input.lastAim !== null) return input.lastAim;
  // 最后兜底：人物朝向（dir = down/up/side，face = ±1）
  if (p.dir === 'up') return -Math.PI / 2;
  if (p.dir === 'down') return Math.PI / 2;
  return p.face > 0 ? 0 : Math.PI;
}
/* 专属技能的落点：鼠标动过就是指针位置，否则取朝向前方 70 像素 */
function ultAimPoint(p) {
  if (input.mouseSeen) return { x: input.mx, y: input.my };
  const a = ultAimAngle(p);
  return { x: p.x + Math.cos(a) * 70, y: p.y + Math.sin(a) * 70 };
}

/* 技能替换 / 专属升级面板：DOM 渲染，画布像素字体画不了中文 */
function renderPickPanel() {
  const el = document.getElementById('pick');
  if (!el) return;
  const pk = Game && Game.pick;
  if (!pk || !Game.player) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'flex';
  let h = '';
  if (pk.kind === 'skill') {
    const nd = SKILL_DEF[pk.newId];
    h += '<div class="pickTitle">技 能 已 满</div>'
      + '<div class="pickSub">拾得 <b>' + nd.name + '</b>（灵力 ' + nd.cost + '）　—— 择一槽位替换，换上者自一阶重修</div>'
      + '<div class="pickRow">';
    for (let i = 0; i < SLOT_COUNT; i++) {
      const s = Game.player.slots[i];
      const d = s ? SKILL_DEF[s.id] : null;
      h += '<div class="pickCard' + (i === pk.idx ? ' selA' : '') + '" data-i="' + i + '">'
        + '<div class="nm">' + (d ? d.name : '空 槽') + '</div>'
        + '<div class="tag">槽位 ' + (i + 1) + (d ? '　灵力 ' + d.cost : '') + '</div>'
        + (d ? '<div class="lv">Lv.' + s.lv + '</div><div class="dsc">' + skillDesc(s.id, s.lv) + '</div>'
             : '<div class="dsc">尚未习得</div>')
        + '</div>';
    }
    h += '</div><div class="pickTip"><span class="kbd">←</span><span class="kbd">→</span> 或 '
      + '<span class="kbd">1</span><span class="kbd">2</span><span class="kbd">3</span> 择槽位　<span class="kbd">Enter</span> 替换</div>';
  } else {
    const U = Game.player.ult;
    const UD = ULT_DEF[U.style];
    h += '<div class="pickTitle">专 属 · 精 进</div>'
      + '<div class="pickSub"><b>' + UD.name + '</b> Lv.' + ultLevel(U) + '　—— 斩却精英，择一条进境</div>'
      + '<div class="pickRow">';
    pk.list.forEach((p, i) => {
      const lv = ultPathLv(U, p.id);
      h += '<div class="pickCard' + (i === pk.idx ? ' selB' : '') + '" data-i="' + i + '">'
        + '<div class="nm">' + p.name + '</div>'
        + '<div class="lv">' + (lv === 0 ? '未 学' : 'Lv.' + lv + ' → ' + (lv + 1)) + '</div>'
        + '<div class="dsc">' + ultPathNextDesc(U.style, p.id, lv) + '</div>'
        + '</div>';
    });
    h += '</div><div class="pickTip"><span class="kbd">←</span><span class="kbd">→</span> 或 '
      + '<span class="kbd">1</span><span class="kbd">2</span><span class="kbd">3</span> 择进境　<span class="kbd">Enter</span> 悟道</div>';
  }
  el.innerHTML = h;
  el.querySelectorAll('.pickCard').forEach(c => {
    c.addEventListener('click', () => {
      Game.pickPick(+c.getAttribute('data-i'));
      Game.pickConfirm();                 // 点卡片即选定，省一步
    });
  });
}

function updateOverlay() {
  if (!Game) return;
  const floorName = document.getElementById('floorName');
  const hint = document.getElementById('hint');
  const card = document.getElementById('card');
  const title = document.getElementById('title');
  const choose = document.getElementById('choose');
  const st = document.getElementById('stats');
  if (Game.state === 'title') {
    title.style.display = 'flex';
    if (choose) choose.style.display = 'none';
    floorName.textContent = ''; hint.textContent = ''; card.style.display = 'none';
    st.textContent = '';
    return;
  }
  if (Game.state === 'choose') {
    title.style.display = 'none';
    if (choose) {
      choose.style.display = 'flex';
      // 卡片数量随 PLAYABLE_STYLES 走：卡片的名字与说明写在 index.html 里，
      // 新增流派时补一张静态卡片即可，这里只负责高亮与显隐
      for (let i = 0; i < 4; i++) {
        const c = document.getElementById('pickCard' + i);
        if (!c) continue;
        if (i >= PLAYABLE_STYLES.length) { c.style.display = 'none'; continue; }
        c.style.display = 'block';
        c.className = 'pickCard' + (Game.styleIdx === i ? ' ' + (PICK_SEL[i] || 'selA') : '');
      }
    }
    floorName.textContent = ''; hint.textContent = ''; card.style.display = 'none';
    st.textContent = '';
    return;
  }
  title.style.display = 'none';
  if (choose) choose.style.display = 'none';
  const depthCN = ['一', '二', '三', '四', '五', '六', '七'][Game.depth - 1] || Game.depth;
  const elKey = Game.room && Game.room.elite;
  floorName.textContent = '第' + depthCN + '层 · ' + (ROOM_LABEL[Game.room.type] || '石室')
    + (elKey ? ' · 精英' : '');
  floorName.style.color = elKey ? '#ff9d8a' : '';

  let h = '';
  if (Game.shopHint) h = Game.coins >= Game.shopHint.price
    ? '按 E 购买（' + Game.shopHint.price + ' 灵石）'
    : '灵石不足 —— 需 ' + Game.shopHint.price + '，现有 ' + Game.coins;
  else if (Game.pickHint) h = '按 E 选取这件法宝（另一件随之消散）';
  else if (Game.altarHint) h = '按 E 献祭 1 点气血，换取机缘';
  else if (Game.lockedHint) h = Game.bombs > 0
    ? '石门封印 —— 需要 1 把钥匙，或按 E 用 1 颗雷符炸开'
    : '石门封印 —— 需要 1 把钥匙（钥匙散落在本层某间石室）';
  else if (Game.chestHint) h = Game.keys > 0 ? '按 E 用 1 把钥匙开启金匣' : '金匣上锁 —— 需要 1 把钥匙';
  else if (Game.portalHint) h = '踏入传送阵，前往下一层';
  else if (Game.state === 'dead') h = '道消身殒 —— 按 R 重入轮回';
  else if (Game.state === 'win') h = '飞升成仙 —— 按 R 再入凡尘';
  if (Game.restartHold > 0) h = '松开取消 —— 长按 R 重开本局（可换流派）';
  hint.textContent = h;

  if (Game.itemPopup) {
    const def = Game.itemPopup.def;
    const v = itemView(def, Game.style, Game.itemPopup.rank || 0);
    card.style.display = 'block';
    card.innerHTML = '<b>' + v.name + '</b><span>' + v.desc + '</span>';
  } else card.style.display = 'none';

  const df = Game.floor && Game.floor.diff;
  st.textContent = (STYLES[Game.style] ? STYLES[Game.style].name : '飞剑流') + '　灵石 ' + Game.coins
    + '　斩妖 ' + Game.kills + (df ? '　劫数 ' + df.tag : '');
}
