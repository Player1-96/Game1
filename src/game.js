'use strict';
/* ============================================================
 *  game.js —— 主循环 / 房间管理 / HUD / 音效
 * ============================================================ */

/* ---------------- 设置（与存档分开存） ----------------
   音量三层：master 是总闸，下面挂 sfxBus（音效）与 BGM.bus（音乐）。
   master 的基准取 0.32 —— 各音效的 vol 参数是按这个量级配的，
   改基准会让全部音效一起变响/变轻，别单独动。
*/
const SET_KEY = 'xiuxian-isaac.settings.v1';
const SETTINGS = {
  master: 0.8,      // 总音量 0~1（乘 0.4 后落到 master gain）
  music: 0.7,       // 背景音乐 0~1
  sfx: 0.9,         // 音效 0~1
  bgm: true,        // 背景音乐开关（与 M 键的总静音独立）
  save() {
    try {
      localStorage.setItem(SET_KEY, JSON.stringify({
        master: this.master, music: this.music, sfx: this.sfx, bgm: this.bgm
      }));
    } catch (e) { }
  },
  load() {
    try {
      const d = JSON.parse(localStorage.getItem(SET_KEY) || 'null');
      if (!d) return;
      if (typeof d.master === 'number') this.master = d.master;
      if (typeof d.music === 'number') this.music = d.music;
      if (typeof d.sfx === 'number') this.sfx = d.sfx;
      if (typeof d.bgm === 'boolean') this.bgm = d.bgm;
    } catch (e) { }
  }
};

/* ---------------- 音效（WebAudio 合成） ---------------- */
const SFX = {
  ctx: null, master: null, sfxBus: null, on: true,
  ensure() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.master.connect(this.ctx.destination);
      applyVolumes();
      BGM.attach();
      // 自动播放策略：context 可能是 suspended，用户首次交互时唤醒
      if (this.ctx.state === 'suspended') this.ctx.resume();
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
    o.connect(g); g.connect(this.sfxBus);
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
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
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
  /* 太虚护盾补回一格：上行双音，与受击的下行音区分开 */
  shield() { this.tone(620, 0.10, 'triangle', 0.13); setTimeout(() => this.tone(930, 0.14, 'triangle', 0.11), 70); },
  /* 烛龙结罩：清亮的上行三音 —— 与转阶段的 roar() 必须听起来是两回事。
     两者原先共用 roar()，玩家会把每 9 秒一次的结罩当成「又转了一次阶段」（2026-09-23 反馈）。 */
  shieldUp() { this.tone(392, 0.16, 'triangle', 0.16); setTimeout(() => this.tone(587, 0.18, 'triangle', 0.14), 90); setTimeout(() => this.tone(784, 0.22, 'sine', 0.12), 190); },
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

/* 把 SETTINGS 落到三个 gain 节点上。SFX.ensure() 之前调用是空操作。 */
function applyVolumes() {
  if (SFX.master) SFX.master.gain.value = SFX.on ? SETTINGS.master * 0.4 : 0;
  if (SFX.sfxBus) SFX.sfxBus.gain.value = SETTINGS.sfx;
  BGM.setGain();
}

/* ---------------- 背景音乐（WebAudio 程序化合成，零素材） ----------------
   曲子写在 BGM_TRACKS 里：每小节 4 拍，bass 每小节一个根音（长音铺底），
   lead 每拍一个 token（`.` / `-` 表示不发声），perc 每小节 8 个八分位。
   音高用 `c4` / `a#3` 记谱；调式取五声（宫商角徵羽）——
   五声音阶内任意两音都撞不出小二度，这是它适合当背景音的硬道理，
   也是能靠「随手写几个音」就成曲的原因。

   调度走 look-ahead：每 60ms 把未来 0.35 秒的拍排进 AudioContext 的时间轴，
   而不是到点再播 —— setInterval 本身有抖动，靠它直接卡拍会听出节奏飘。
*/
const NOTE_SEMI = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
function noteFreq(s) {
  const m = /^([a-g])(#?)(\d)$/.exec(s || '');
  if (!m) return 0;
  const midi = NOTE_SEMI[m[1]] + (m[2] ? 1 : 0) + (+m[3] + 1) * 12;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const BGM_TRACKS = {
  /* 标题 / 菜单：慢、空、留白多 */
  title: {
    bpm: 64,
    bass: ['c2', 'c2', 'a1', 'a1', 'f1', 'f1', 'g1', 'g1'],
    lead: [
      'e5', '.', 'd5', '.', 'c5', '.', '.', '.',
      'a4', '.', 'c5', '.', 'd5', '.', '.', '.',
      'e5', '.', 'g5', '.', 'a5', '.', 'g5', '.',
      'e5', '.', 'd5', '.', 'c5', '.', '.', '.'
    ],
    perc: ''
  },
  /* 探索：中速，有推进感但不吵 —— 这曲子是听最久的，克制比张扬重要 */
  explore: {
    bpm: 100,
    bass: ['c2', 'c2', 'g1', 'g1', 'a1', 'a1', 'f1', 'f1'],
    lead: [
      'g4', 'a4', 'c5', '.', 'd5', '.', 'c5', '.',
      'a4', '.', 'g4', '.', 'e4', '.', 'g4', '.',
      'c5', 'd5', 'e5', '.', 'g5', '.', 'e5', '.',
      'd5', '.', 'c5', '.', 'a4', '.', '.', '.'
    ],
    perc: 'x..x..x.'
  },
  /* 魔窟：与探索曲同一个调式，只换节奏与密度 —— 听感上「还是这个世界，但不对劲了」 */
  boss: {
    bpm: 138,
    bass: ['c2', 'c2', 'c2', 'c2', 'a1', 'a1', 'g1', 'g1'],
    lead: [
      'e5', 'e5', 'g5', 'e5', 'd5', 'e5', 'd5', 'c5',
      'e5', 'e5', 'g5', 'a5', 'g5', 'e5', 'd5', '.',
      'c5', 'c5', 'e5', 'c5', 'a4', 'c5', 'd5', 'e5',
      'e5', 'd5', 'c5', 'd5', 'c5', '.', '.', '.'
    ],
    perc: 'x.xxx.x.'
  }
};

const BGM = {
  bus: null,
  track: null,          // 当前曲名；null = 没在播
  step: 0,              // 已调度的拍数
  next: 0,              // 下一拍的绝对时间（AudioContext 时钟）
  timer: null,
  duck: 1,              // 压低倍率：暂停时降到 0.22，失焦时 0
  noiseBuf: null,

  attach() {
    if (this.bus || !SFX.ctx) return;
    this.bus = SFX.ctx.createGain();
    this.bus.connect(SFX.master);
    this.setGain();
  },
  setGain() {
    if (!this.bus || !SFX.ctx) return;
    const want = SETTINGS.bgm ? SETTINGS.music * this.duck : 0;
    const t = SFX.ctx.currentTime, g = this.bus.gain;
    g.cancelScheduledValues(t);
    if (want <= 0.001) {
      /* 要静音就别用 setTargetAtTime —— 它是指数渐近，永远差最后 3%，
         关掉音乐后仍留一点残音。线性降到 0 才是干净的收尾。 */
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + 0.25);
    } else {
      g.setTargetAtTime(want, t, 0.12);   // 改音量 / 暂停压低：平滑过渡，不出「咔」声
    }
  },
  /* 换曲。同名直接返回 —— 这个方法每帧都会被调 */
  play(name) {
    if (this.track === name) return;
    this.track = name;
    this.step = 0;
    if (!SFX.ctx || !this.bus) return;     // 还没交互过，等 ensure() 再来
    this.next = SFX.ctx.currentTime + 0.06;
    if (!this.timer) this.timer = setInterval(() => this.pump(), 60);
  },
  stop() {
    this.track = null;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  },
  pump() {
    const ctx = SFX.ctx, T = BGM_TRACKS[this.track];
    if (!ctx || !T || !this.bus) return;
    // 从后台标签页回来时 next 会落后一大截，直接对齐到当下，别把缺的拍一次补出来
    if (this.next < ctx.currentTime - 0.4) this.next = ctx.currentTime + 0.05;
    const beat = 60 / T.bpm;
    let guard = 0;                          // 兜底：单次最多排 24 拍
    while (this.next < ctx.currentTime + 0.35 && guard++ < 24) {
      this.beat(this.next, T, this.step, beat);
      this.next += beat;
      this.step++;
    }
  },
  beat(t, T, i, beat) {
    const bar = (i >> 2) % T.bass.length, b = i & 3;
    if (b === 0) {                          // 小节头拍换根音
      const f = noteFreq(T.bass[bar]);
      if (f) this.note(f, t, beat * 3.7, 0.13, 700);
    }
    const tok = T.lead[i % T.lead.length];
    if (tok && tok !== '.' && tok !== '-') {
      const f = noteFreq(tok);
      if (f) this.note(f, t, beat * 0.8, 0.075, 4200);
    }
    if (T.perc) {
      for (let s = 0; s < 2; s++) {
        if (T.perc[(b * 2 + s) % T.perc.length] === 'x') this.drum(t + s * beat / 2, s === 0);
      }
    }
  },
  note(f, t, dur, vol, lp) {
    const ctx = SFX.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    const bq = ctx.createBiquadFilter();
    bq.type = 'lowpass'; bq.frequency.value = lp || 4000;
    o.connect(g); g.connect(bq); bq.connect(this.bus);
    o.start(t); o.stop(t + dur + 0.03);
  },
  /* 打击：低音位是底鼓（低频下滑），高音位是踩镲（高通噪声） */
  drum(t, low) {
    const ctx = SFX.ctx;
    if (low) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(118, t);
      o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
      g.gain.setValueAtTime(0.20, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.15);
      o.connect(g); g.connect(this.bus);
      o.start(t); o.stop(t + 0.18);
    } else {
      if (!this.noiseBuf) {                 // 缓一份噪声，别每拍重建
        const sr = ctx.sampleRate, len = Math.floor(sr * 0.06);
        this.noiseBuf = ctx.createBuffer(1, len, sr);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      }
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6500;
      const g = ctx.createGain(); g.gain.value = 0.035;
      src.connect(f); f.connect(g); g.connect(this.bus);
      src.start(t);
    }
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

/* 层号中文化。主玩法 15 层，「十一」这类两位数必须走十位逻辑 ——
   旧实现是一个只到「九」的数组，兜底 `|| depth` 在第 10 层起直接吐阿拉伯数字，
   「第11层」比「第十一层」宽，会把顶栏的风格标识块挤歪（15 层化时暴露）。
   取 1~99 足够覆盖主玩法与将来的快速模式；再多就回落阿拉伯数字（比截断好看）。 */
const _CN_D = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
function cnNum(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n > 99) return String(n);
  if (n < 10) return _CN_D[n];
  const tens = Math.floor(n / 10), ones = n % 10;
  /* 十位是 1 时「一十」简作「十」（十 / 十一 / 十五），其余保留（二十 / 三十五） */
  return (tens === 1 ? '十' : _CN_D[tens] + '十') + (ones ? _CN_D[ones] : '');
}

/* ---------------- 风格地图（27 条路径） ----------------
 *  用户需求（原话）：「一开始肯定就是让玩家三选一先，然后后面每五层选一次二选一」
 *                   「我的意思是可以进入相同的风格，会出现中式-中式-中式的可能性」
 *
 *  于是：**每个节点都是完整三选一**（不是二选一），允许重复 → 3³ = 27 条路径。
 *  ⚠️ 「允许重复」的必然后果：中式必须备齐 1~5 / 5~10 / 10~15 三套内容，
 *     否则走「中-中-中」的玩家会在第二段遇到和第一段一模一样的层。
 *     这正是 ROADMAP 说的「9 个内容包」的由来，也是第一期只做配色变体的原因。
 *
 *  层数：**15 层（每段 5 层）**。用户定案 —— 「这个和我后面融合玩法是有联动的，
 *  层数不够的话养法器的空间就会比较小」。实测 9 层一局只拿到约 14 件法宝
 *  （25 件池只见一半），融合要「试错 + 定型」两条路，14 件不够；15 层约 24 件。
 *  快速模式（9 层）暂不做：只保留常量能力，不建面板。
 *
 *  当前范围：机制跑通 + 中式 3 段配色（零新美术）。
 *  北欧 / 克苏鲁在 STYLE_DEF 里已留位（ready:false），后两期填内容即可。
 */
const STYLE_PICK_SEL = ['selA', 'selB', 'selC'];

/* 层段划分的**唯一真相在 dungeon.js**（SEG_FLOORS / SEG_COUNT / segOf）——
   因为 new Floor() 生成房间时就要按段分 Boss，那是比这边更早的一层。
   这里只做转发与「风格系统」自己的包装，不再维护第二份常数。

   主玩法：每段 5 层 × 3 段 = **15 层**。
   ⚠️ 层数直接决定「养法器的空间」：实测 9 层一局只拿到约 14 件法宝
      （25 件池里只见一半），而融合玩法的前提是「料够多、能试错」。
      15 层约 24 件，基本能把池子看全，融合的原料才够。
      快速模式（9 层）暂不做 —— 只保留常量能力，不建面板：现在还没有
      「速通」的真实需求，等北欧/克苏鲁内容上来、重复感出现了再加才有意义。 */

/* 风格系统的全部可调参数 */
const STYLE_SYS = {
  segFloors: SEG_FLOORS,                 // 5
  segCount: SEG_COUNT,                   // 3
  totalFloors: SEG_TOTAL_FLOORS,         // 15
  /* 只在已就绪的风格里挑。未就绪的（北欧/克苏鲁）不出现，避免选中后没内容 */
  pickPool() { return Object.keys(STYLE_DEF).filter(k => STYLE_DEF[k].ready); }
};

/* 转发 dungeon.js 的段判定（保留 game.js 侧的旧名字，避免大范围改调用点）。
   ⚠️ 必须转发而不是复制一份 —— 两边各算一次迟早会算出不同的段。 */
const segOfFloor = segOf;                  // 某一层属于第几段（0-based）
const isSegPickFloor = isSegFirstFloor;    // 某一层是不是「该弹选风格」（段首，第一层除外）

/* ---------------- Boss 挑战模式 ----------------
 *  目的：单独调试某位头目的行动，不必先走完前几层。
 *
 *  d 越大，给的 build 越接近后期，头目也按同样的进度加厚 ——
 *  于是三档各自是「那个阶段的典型对局」，而不是单纯「血更多 / 更少」。
 *
 *  items  随机法宝件数（3 × d）
 *  skills 随机功法个数（1 × d，槽位正好 3 个，不会溢出）
 *  ultLv  专属技初始等级（1 × d；等级 = 1 + 各路线等级和，故先随机点亮 d-1 条路线）
 *  bossMul 头目血量倍率（乘在楼层自带的 hpScale 之上）
 *
 *  专属技的进境一律交给玩家手选：进战斗后排队 CHALL_UPGRADES 次三选一。
 */
const CHALLENGE_DIFF = [
  { key: 'xian', name: '险', en: 'PERIL', items: 3, skills: 1, ultLv: 1, bossMul: 1.0 },
  { key: 'wei', name: '危', en: 'DANGER', items: 6, skills: 2, ultLv: 2, bossMul: 1.6 },
  { key: 'jue', name: '绝', en: 'DOOM', items: 9, skills: 3, ultLv: 3, bossMul: 2.4 }
];
const CHALL_UPGRADES = 3;      // 三档都给足 3 次手选（「三级都由玩家手选」）
const CHALL_RESULT_T = 110;    // 胜负判定后停留的帧数，让爆炸演完再回菜单

/* ---------------- 无尽试炼（无限模式） ----------------
 *  目的：通关之后仍有「拿这套 build 到底能撑多久」的终局玩法。
 *  玩法一句话：把通关 build 带进场，一批批刷越来越强的妖物，
 *  直到被打死 —— 看杀了多少只、活了多久、撑到第几波。
 *
 *  三条设计硬约束（详见 docs/ROADMAP.md 「第一期」）：
 *
 *  1. 难度必须**另起一条无上限曲线**。普通楼层的 difficultyOf 被 DIFF_MAX = 3.0
 *     封了顶，拿到这里几十波之后就完全不动了 —— 那是地板，不是曲线。
 *  2. 递增要**三维度错开节奏**。只叠 hpScale 的后果是「血包墙」：
 *     妖物越来越肉、玩家却还是那些伤害，最后变成无聊的耗时间。
 *     所以数量每波涨、种类每 3~5 波换一档、词缀每 5 波加一条。
 *  3. 不写档（saveGame 有守卫）—— 无尽是一场考试的分数，不是可以续的进度。
 */
const ENDLESS = {
  /* 波次节奏（帧）。间隔只在**场面清空后**才开始计时（见 endlessTick），
     所以这里给的是「清完这一波到下一波涌上来」的喘息时间。 */
  waveGap0: 150,          // 第 1 波的等待（2.5 秒）
  waveGapMin: 84,         // 最短间隔（1.4 秒）
  waveGapDecay: 3,        // 每波减 3 帧，减到 waveGapMin 为止
  clearCooldown: 30,      // 清场后的固定地板：秒清也不能秒刷（0.5 秒）

  /* 数量：第 n 波刷多少只。开根号增长 —— 线性涨会在十几波后淹掉屏幕。 */
  countBase: 3,
  countGrow: 1.15,        // 3 + floor(1.15 * sqrt(wave))
  countMax: 16,           // 同屏上限，超过就是纯卡顿，不代表更难

  /* 血量：1.075^n。第 20 波 ≈ ×4.3、第 40 波 ≈ ×18.2、
     第 60 波 ≈ ×77。配合玩家的 build 成长正好是「越走越窄」的收口。
     上限 300 —— 再高就只是把「打不过」拖成「打不动」，那不是难度是折磨。 */
  hpBase: 1.0,
  hpGrow: 1.075,
  hpMax: 300,

  /* 种类：每 segWaves 波把「可出妖物」扩一档。
     池子按 5 档解锁 —— 与 enemyPool 的分档一致，只是把条件换成波数。 */
  segWaves: 4,

  /* 词缀：每 modWaves 波给「本波妖物」加一条词缀。
     词缀是纯逻辑（改速度 / 改接触伤害 / 死亡留毒…），零新美术 ——
     这正是 ROADMAP 里「把风格地图 130 个新绘制压到 30~40」的同一条技巧。 */
  modWaves: 5,
  modMax: 3,              // 单波最多叠 3 条，再多会变成看不懂的一锅粥

  /* 开场配装：通关 build 之外的兜底。挑战模式同款参数化先例（TAIXU.caps）。
     玩家是从「通关 build」进来的话会被覆盖成他那一套，这里只管空手进场。 */
  baseItems: 6,
  baseSkills: 3,
  baseUltLv: 3,

  /* 奖励：无尽不产出法宝（它已经是终局），只按波次回血 ——
     否则被打一下就再也回不来，长局会很难看。 */
  healPerWave: 1,
  healWaveEvery: 3,       // 每 3 波回 1 点

  /* 结算演出停留的帧数（与挑战模式对齐，让爆炸演完再看分数） */
  resultT: 120
};

/* 无尽词缀表。
 * 施加对象是「一波」而不是单只妖物 —— 所以在刷怪时把 mods 传进 Enemy。
 * 每条只改自己那一件事，别互相叠加出乘性爆炸（速度 + 接触 + 死亡毒三条同时来
 * 已经够难受了，而这三条各占一个维度、互不放大）。
 *
 * id     存档 / 日志用的键
 * name   HUD 飘字用的短名（FONT5 只有英文点阵，所以用大写英文）
 * desc   面板里给玩家看的中文说明
 * apply(e) 在 Enemy 造出来之后调一次
 */
const ENDLESS_MODS = [
  {
    id: 'swift', name: 'SWIFT', desc: '疾行：移动速度 ×1.35',
    apply(e) { e.speed *= 1.35; }
  },
  {
    id: 'brutal', name: 'BRUTAL', desc: '蛮触：接触伤害 ×1.5',
    apply(e) { e.touchMul = (e.touchMul || 1) * 1.5; }
  },
  {
    id: 'venom', name: 'VENOM', desc: '遗毒：死亡后原地留下一片毒雾',
    apply(e) { e.deathHazard = 'poison'; }
  },
  {
    id: 'tough', name: 'TOUGH', desc: '坚皮：气血 ×1.6',
    apply(e) { e.hpMul = (e.hpMul || 1) * 1.6; e.hp = e.maxHp = Math.round(e.maxHp * 1.6); }
  },
  {
    id: 'swarm', name: 'SWARM', desc: '成群：这一波额外多刷 50%',
    apply(e) { e.swarmTag = true; }        // 由刷怪方读它决定补量，故只打标记
  },
  {
    id: 'regen', name: 'REGEN', desc: '回春：每 90 帧回复 2% 气血',
    apply(e) { e.modRegen = true; }
  },
  {
    id: 'frostbite', name: 'FROST', desc: '霜附：命中时短暂迟滞身法',
    apply(e) { e.touchSlow = true; }
  },
  {
    id: 'volatile', name: 'BURST', desc: '爆散：死亡时炸出一圈弹幕',
    apply(e) { e.deathBurst = 8; }
  }
];

/* ---------------- 设置面板的行定义 ----------------
   kind 决定交互方式：range 用 ←→ 调（鼠标点进度条也行）、
   toggle 用 Enter 翻、button 用 Enter 触发。
   渲染、键位、鼠标三处都读这一份，所以加一项只改这里。
   行的 id 与 SETTINGS 的字段同名（range / toggle 直接按 id 取值），
   例外是 full 与 clear —— 那两个读的是浏览器状态和存档，不在 SETTINGS 里。
*/
const SET_ROWS = [
  { id: 'master', kind: 'range', name: '总音量', desc: '音效与音乐一起调' },
  { id: 'music', kind: 'range', name: '背景音乐', desc: '三首曲子随场景切换' },
  { id: 'sfx', kind: 'range', name: '音效' },
  { id: 'bgm', kind: 'toggle', name: '背景音乐开关', desc: '关掉后调音量也不会出声' },
  { id: 'full', kind: 'toggle', name: '全屏显示', desc: 'F11 亦可' },
  { id: 'clear', kind: 'button', name: '清空存档', desc: '删除「续前缘」的进度' }
];

/* 挑战菜单里的头目题面（一句话）—— 挑 Boss 时一眼看清「这一位考的是什么」。
   刻意压到 8 字上下：5 张卡并排时每张只有 9.6em 宽，长句会被折成三行。 */
const CHALL_BOSS_NOTE = {
  xuemo: '整圈血弹 · 无限爪牙',
  baigu: '冰符 · 蓄力冲刺',
  liesha: '母弹三段裂变',
  lunhui: '缺口环弹 · 不冲刺',
  zhulong: '鳞罩 · 横扫激光'
};
/* 挑战菜单「择流派」页的一句话（正文仍在 index.html 的流派卡片里，这里只取要点） */
const CHALL_STYLE_NOTE = {
  feijian: '远程连发 · 走位游击',
  jujian: '蓄力劈砍 · 一击破军',
  wujian: '近战贴脸 · 突进连斩'
};

/* ---------------- 存档 ----------------
 *  只存「种子 + 进度 + 玩家」，不存敌人实体。
 *  Floor 由 mulberry32(seed) 确定性生成 —— 房间布局、波次、交互物位置都能原样重建；
 *  而存档点定在「进入新房间」那一刻，敌人在进房时才按 waves 排队，两边天然对得上。
 *
 *  两个附带好处：
 *  · 不必序列化 Boss 的三阶段状态机、玄光光束、裂变弹这类瞬时实体；
 *  · 堵掉了「打一半关页面重来刷掉落」—— 玩家状态同样回滚到进房那一刻，刷不出东西。
 */
const SAVE_KEY = 'xiuxian-isaac.save.v1';
const SAVE_VER = 1;
/* 无尽试炼的最好成绩。与主存档分开：它是一行分数，不是进度，
   所以 clearSave()（销档）不该顺手把它抹掉 —— 玩家会想看到自己的纪录还在。 */
const ENDLESS_BEST_KEY = 'xiuxian-isaac.endless.v1';
/* 房间进度里需要落盘的字段（其余都能由种子重建） */
const ROOM_SAVE_KEYS = ['cleared', 'visited', 'seen', 'secretFound', 'unlocked',
                        'waveIdx', 'coinPool', 'keyDrop', 'bombDrop', 'elite'];

/* ---------------- 游戏主体 ---------------- */
class GameCore {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.g.imageSmoothingEnabled = false;
    this.state = 'title';
    this.style = 'feijian';          // 流派：feijian（飞剑流）| jujian（巨剑流）| wujian（舞剑流）
    this.styleIdx = 0;               // 流派选择界面的高亮项

    /* ---------------- 风格地图（27 条路径） ----------------
     *  需求：开局三选一 + 之后每 5 层二选一，**允许重复** → 3 × 3 × 3 = 27 条。
     *  「允许重复」不是漏洞，是用户明确要的（会出现「中-中-中」）。
     *
     *  stylePath 记录每一段选了什么风格；seg 是当前在第几段（0-based）。
     *  ⚠️ 这两个字段要进存档 —— 否则读档回来风格就丢了（见 saveGame/load）。
     *  ⚠️ 与「流派」（this.style，飞剑/巨剑/舞剑）是**两个正交维度**：
     *     流派决定你怎么打，风格决定你在哪个世界打。命名上别混。
     */
    this.stylePath = ['cn'];
    this.seg = 0;
    /* 风格选择界面：复用挑战模式的三级菜单范式（面板 #stylePick）。
     * step: 'first' 开局三选一 / 'next' 每 5 层的二选一。 */
    this.styleMenu = null;
    /* 法宝融合面板（第 3 期）。null = 未开。
       开启时 state 切到 'fusion'，内容见 openFusion()。 */
    this.fusion = null;
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
    this.paused = false;             // 主动暂停（P / Esc）：逻辑全停，画面照画
    /* 小地图高亮计时：进新房间后短暂提亮，其余时间压到半透明。
       它压在房间右上角（世界区 x>393 / y<89 那块），不透明时会整个盖住
       走到那里的妖物 —— 玩家会以为「怪被地图挡住了」（2026-09-23 反馈）。 */
    this.minimapT = 0;
    /* 设置面板（配置表见 SET_ROWS）：独立于 state —— 从标题或局内都能开，
       关掉后回到原处，所以用标记位而不是新增一个 state。
       setIdx 是当前选中行；setClearArm 是「清空存档」的二次确认。 */
    this.settingsOpen = false;
    this.setIdx = 0;
    this.setClearArm = false;
    /* Boss 挑战模式（配置见 CHALLENGE_DIFF）：
       chall       非 null = 正在挑战中（含 bossId / diff / 升级队列 / 结算倒计时）
       challMenu   菜单状态 { step:'boss'|'diff', idx, bossId }
       challResult 上一次的胜负，回菜单后挂一行结果提示 */
    this.chall = null;
    this.challMenu = null;
    this.challResult = null;
    /* 无尽试炼（配置见 ENDLESS）：与挑战模式的形状一致，
       但它是「会死、会结算分数」的正经玩法，而不是调试场。
       endless  非 null = 正在无尽中（含波次 / 击杀 / 存活帧 / 词缀 / 结算倒计时）
       endlessResult  上一局的成绩，回标题后挂一行摘要 */
    this.endless = null;
    this.endlessResult = null;
  }

  /* ---------------- 生命周期 ---------------- */
  newRun(style) {
    this.style = style || this.style || 'feijian';
    /* 开新局即脱离挑战模式 / 无尽 —— 否则 saveGame 会被那两个守卫一直挡着
       （挑战模式那次就是这么丢掉开局存档的）。 */
    this.chall = null;
    this.endless = null;
    this.depth = 1;
    /* 风格路径重置为「只有第一段、暂定中式」。真正的选择发生在
       `startStyleRun()`（开局三选一）或标题直接进时的默认值。
       ⚠️ 不要在这里弹面板 —— newRun 会被「重开」「读档」等多处调用，
          弹窗会把那些路径全打断。选择入口只在标题/重开那一处。 */
    if (!this.stylePath || !this.stylePath.length) this.stylePath = ['cn'];
    this.seg = 0;
    this.applySegmentPalette();       // 按路径把色板 + 素材对齐，再生成第 1 层
    this.coins = 0; this.keys = 0; this.bombs = 0; this.kills = 0;
    this.time = 0;
    this.player = new Player(ROOM_W / 2, ROOM_H / 2 + 20);
    // 先切到 play 再 newFloor：newFloor → enterRoom 里会写存档，
    // 此时 state 还是 'title'/'choose' 的话那次存档会被跳过（开局第一间房丢档）
    this.state = 'play';
    this.newFloor(1);
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
  /* opts.boss：只在挑战模式下传，强制这一层出指定的尊者。
     正常流程不传 → 按【段】取人（第 1/2/3 段分别对上 1/2/3 号位）。 */
  newFloor(depth, seed, opts) {
    this.depth = depth;
    // seed 可由读档传入：同一颗种子必须重建出同一层（存档的地基）
    this.floor = new Floor(depth, seed != null ? (seed >>> 0) : ((Math.random() * 0xffffffff) >>> 0), {
      power: this.powerScore(),
      owned: this.player ? this.player.items.slice() : [],
      slots: this.player ? this.player.slots.map(s => (s ? { id: s.id, lv: s.lv } : null)) : [],
      boss: (opts && opts.boss) || null
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

  /* ---------------- 存档 / 读档 ---------------- */
  saveGame() {
    /* 挑战 / 无尽一概不落盘 —— 挑战是调试场、无尽是考试成绩，
       写进去会把真实进度覆盖掉。同时这也是「存档点定在进房那一刻」
       的那次自动存档被跳过的原因。 */
    if (this.chall || this.endless) return false;
    if (!this.player || this.state !== 'play' || !this.floor) return false;
    try {
      const p = this.player;
      const rooms = {};
      for (const r of this.floor.rooms.values()) {
        rooms[r.key] = {
          cleared: r.cleared, visited: r.visited, seen: r.seen, secretFound: r.secretFound,
          unlocked: r.unlocked, waveIdx: r.waveIdx, coinPool: r.coinPool,
          keyDrop: r.keyDrop, bombDrop: r.bombDrop, elite: r.elite,
          doorOpen: r.doorOpen.slice(), doorHidden: r.doorHidden.slice(), doorHp: r.doorHp.slice(),
          // 交互物的已开/已售状态就挂在 r.props 的元素上（Prop.open 会写回 src），
          // 所以连着 taken/opened/sold 一起存，回来时宝箱不会复活
          props: r.props.map(x => ({ ...x })),
          drops: (r.drops || []).map(x => ({ ...x }))
        };
      }
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: SAVE_VER, at: Date.now(),
        style: this.style, depth: this.depth, seed: this.floor.seed,
        /* 风格路径必须一起落盘 —— 否则读档回来色板会跳回一段，
           玩家会看到「存档前后世界变了色」这种无从解释的现象。 */
        stylePath: (this.stylePath || ['cn']).slice(), seg: this.seg || 0,
        coins: this.coins, keys: this.keys, bombs: this.bombs, kills: this.kills, time: this.time,
        coinReserve: this.coinReserve, eliteMult: this.eliteMult,
        roomKey: this.room ? this.room.key : null,
        player: {
          hp: p.hp, maxHP: p.maxHP, mp: p.mp, maxMP: p.maxMP,
          shield: p.shield, tShield: p.tShield, shieldT: p.shieldT, soulBuff: p.soulBuff,
          stats: { ...p.stats },
          items: p.items.slice(),                       // 字符串 id 数组，重复即阶数
          slots: p.slots.map(s => (s ? { id: s.id, lv: s.lv } : null)),
          slotIdx: p.slotIdx, skillCd: p.skillCd.slice(),
          ult: p.ult ? { style: p.ult.style, paths: { ...p.ult.paths } } : null,
          ultCd: p.ultCd
        },
        rooms
      }));
      this._hasSave = true;
      return true;
    } catch (e) { console.warn('[save] 写入失败', e); return false; }
  }
  readSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || d.v !== SAVE_VER || !d.rooms || !d.player) return null;
      if (!PLAYABLE_STYLES.includes(d.style)) return null;
      return d;
    } catch (e) { return null; }
  }
  /* 缓存一下：updateOverlay 每 100ms 跑一次，每次都 JSON.parse 整份存档太浪费 */
  hasSave() {
    if (this._hasSave == null) this._hasSave = !!this.readSave();
    return this._hasSave;
  }
  clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } this._hasSave = false; }

  /* 读档：同一颗种子重建楼层 → 把进度套回去 → 重进存档时所在的那间房。
     注意顺序 —— 必须先 newFloor 再套进度，最后 enterRoom，
     因为 enterRoom 会清空本房实体并按 waves 重新排队。 */
  continueGame() {
    const d = this.readSave();
    if (!d) return false;
    this.style = d.style;
    this.depth = d.depth;
    /* 风格路径：老存档里没有这两个字段，回落到「只有一段中式」。
       ⚠️ 必须在 newFloor **之前**设好并换色板 —— 房间的地砖是生成时按 PAL
          画进位图的（renderBG），顺序反了会画出上一段的配色。 */
    this.stylePath = Array.isArray(d.stylePath) && d.stylePath.length ? d.stylePath.slice() : ['cn'];
    this.seg = typeof d.seg === 'number' ? d.seg : segOfFloor(d.depth);
    this.applySegmentPalette();
    this.coins = d.coins || 0; this.keys = d.keys || 0; this.bombs = d.bombs || 0;
    this.kills = d.kills || 0; this.time = d.time || 0;
    this.paused = false; this.pick = null;
    this.itemPopup = null; this.ultWarn = null; this.ultSword = null; this.ultUpgradeT = 0;
    this.player = new Player(ROOM_W / 2, ROOM_H / 2 + 20);
    this.state = 'play';       // 同上：重建期间也要处在 play，否则中途那次自动存档会被跳过
    this.newFloor(d.depth, d.seed);
    for (const key in d.rooms) {
      const r = this.floor.rooms.get(key);
      if (!r) continue;
      const o = d.rooms[key];
      for (const k of ROOM_SAVE_KEYS) if (k in o) r[k] = o[k];
      if (o.doorOpen) r.doorOpen = o.doorOpen.slice();
      if (o.doorHidden) r.doorHidden = o.doorHidden.slice();
      if (o.doorHp) r.doorHp = o.doorHp.slice();
      if (o.props) r.props = o.props.map(x => ({ ...x }));
      if (o.drops) r.drops = o.drops.map(x => ({ ...x }));
    }
    this.coinReserve = d.coinReserve || 0;
    this.eliteMult = d.eliteMult || 1;
    const p = this.player, sp = d.player;
    p.maxHP = sp.maxHP; p.hp = sp.hp;
    p.mp = sp.mp; p.maxMP = sp.maxMP;
    p.shield = sp.shield || 0; p.tShield = sp.tShield || 0; p.shieldT = sp.shieldT || 0;
    p.soulBuff = sp.soulBuff || 0;
    // 直接盖上去而不是走 give()：法宝效果早已计入 stats，再 apply 一次会重复叠加
    Object.assign(p.stats, sp.stats || {});
    p.items = (sp.items || []).slice();
    p.slots = (sp.slots || [null, null, null]).map(x => (x ? { id: x.id, lv: x.lv } : null));
    p.slotIdx = sp.slotIdx || 0;
    p.skillCd = (sp.skillCd || [0, 0, 0]).slice();
    p.ult = sp.ult ? { style: sp.ult.style, paths: { ...sp.ult.paths } } : null;
    p.ultCd = sp.ultCd || 0;
    this.state = 'play';
    this.enterRoom(this.floor.rooms.get(d.roomKey) || this.floorStart(), null);
    this.saveGame();          // 回写一次，确保存档与恢复后的实际状态一致
    renderPickPanel();
    updateOverlay();
    SFX.levelup();
    this.itemPopup = { def: { name: '续 前 缘', desc: '回到第 ' + d.depth + ' 层 · 存档时间 ' + new Date(d.at).toLocaleString() }, t: 200 };
    return true;
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
    this.forgeHint = null;
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
    this.minimapT = 150;              // 换房时小地图提亮 2.5 秒（此时玩家最需要看全图）
    // 进房即存档：此刻状态最干净（敌人刚按 waves 排队、交互物都是未开状态）
    this.saveGame();
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
        // 挑战模式再把难度倍数叠上去：三档分别对应「前期 / 中期 / 后期」那次典型对局
        const b = new Boss(s.boss, bp.x, bp.y, s.hpScale * (this.chall ? this.chall.d.bossMul : 1));
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
    /* 无尽试炼：没有「过关」这回事 —— 波与波之间场面清空是常态，
       不该弹 CLEAR、也不该补发灵石 / 钥匙 / 雷符。 */
    if (this.endless) return;
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
    r.cleared = true;
    /* 挑战模式：不发战利品、不开传送阵 —— 斩完就够，直接回选择菜单。
       留 CHALL_RESULT_T 帧让爆炸演完，否则刀刚落下菜单就糊上来。 */
    if (this.chall) {
      this.chall.win = true;
      this.chall.endT = CHALL_RESULT_T;
      this.bossRef = null;
      this.floaters.push(new Floater(ROOM_W / 2, ROOM_H / 2 - 40, 'VICTORY', PAL.gold));
      return;
    }
    r.portal = true;
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
    /* 无尽试炼：打不过就到此为止 —— 停下来把成绩亮出来，
       而不是切到「重入轮回」（那会让玩家以为进度丢了）。 */
    if (this.endless) {
      this.burst(this.player.x, this.player.y, 50, PAL.red);
      SFX.bossDie();
      this.exitEndless();
      return;
    }
    /* 挑战模式：不销档、也不切死亡界面（那是「重入轮回」的流程，会误导），
       原地留一段演出后回选择菜单。玩家已 dead，Player.update 会自停。 */
    if (this.chall) {
      this.chall.win = false;
      this.chall.endT = CHALL_RESULT_T;
      this.burst(this.player.x, this.player.y, 50, PAL.red);
      SFX.bossDie();
      return;
    }
    this.state = 'dead';
    this.clearSave();          // 死了就销档，否则下次打开还能从死亡前的进度续上
    this.burst(this.player.x, this.player.y, 50, PAL.red);
    SFX.bossDie();
    updateOverlay();
  }
  nextFloor() {
    /* 无尽试炼没有层，这个入口根本不该到达 —— 但它会推进 depth 并可能触发 win，
       所以显式拦住，免得将来某个改动意外走到这里。 */
    if (this.endless) return;
    this.depth++;
    /* 通关判定：总层数由 STYLE_SYS 决定（15 层 = 3 段 × 5 层）。
       原来是写死的 5 层，扩层后必须跟着 STYLE_SYS 走，否则后面几层进不去。 */
    if (this.depth > STYLE_SYS.totalFloors) {
      const segs = this.stylePath.map(k => (STYLE_DEF[k] || {}).cn || k);
      const tail = segs.length > 1 ? `　历遍「${segs.join('·')}」` : '';
      this.state = 'win';
      this.msg = `历尽${STYLE_SYS.totalFloors}重劫难${tail} —— 道心通明，飞升成仙！`;
      this.clearSave();
      updateOverlay();
      return;
    }
    this.player.hp = Math.min(this.player.maxHP, this.player.hp + 2);

    /* 层段推进：每到一段的首层（第 6 / 11 层），先让玩家**重选风格**再进场。
       与流派选择（#choose）走同一套「暂停 + 面板」形状：state 切到 'stylePick'，
       逻辑停住，选完再 newFloor。
       ⚠️ 顺序要紧：**先把 seg 推进到新段、换好色板与素材，再 newFloor** ——
       否则新一层的房间会按旧色板的地砖画出来（错位且不报错）。 */
    this.seg = segOfFloor(this.depth);
    if (isSegPickFloor(this.depth)) {
      this.openStyleMenu('next');
      return;
    }
    /* 非选风格层：把色板对齐到「本层所属段」的当前风格，避免读档后色板错位 */
    this.applySegmentPalette();
    this.newFloor(this.depth);
  }

  /* ---------------- 风格地图：选风格与层段推进 ----------------
   *  27 条路径的机制落点。三条注意：
   *  ① 换风格要**重建素材**（实测 122ms，见 buildSprites）。第一次遇到某风格会
   *     有一次可感的卡顿 —— 所以选完菜单后立刻重建，让卡顿落在「面板消失」那一刻，
   *     而不是落在战斗中途。
   *  ② 色板 + 素材必须**一起换**，且换在 `newFloor` 之前（房间生成要读色板）。
   *  ③ 「允许重复」→ 同一风格可能连续选三次，每次段号不同，色板也就不同。
   */

  /* 把色板与素材对齐到「当前风格 + 当前层所属段」 */
  applySegmentPalette() {
    const style = this.stylePath[this.seg] || 'cn';
    const seg = this.seg % 3;
    switchStyle(style, seg);
    return style + '_' + seg;
  }

  /* 打开风格选择面板。step: 'first'（开局三选一）| 'next'（每段首层三选一） */
  openStyleMenu(step) {
    const pool = STYLE_SYS.pickPool();
    if (!pool.length) {           // 兜底：一个都没就绪时别把玩家卡住
      this.applySegmentPalette();
      this.newFloor(this.depth);
      return;
    }
    /* ⚠️ **只有一个可选项时不弹面板，直接采用**（2026-09-23 出图才发现的）。
       第一期只有中式 ready，若照样弹「三选一」，对玩家就是每次开局 / 每段
       被一个只有一张卡的面板拦一下 —— 有交互成本、没有任何选择。
       「机制先立起来」的正确形态是：**机制在，但不给玩家制造空选择**。
       三期把北欧填进来后，这里会自动恢复成真正的三选一。 */
    if (pool.length === 1) {
      const only = pool[0];
      if (step === 'first') {
        this.stylePath = [only];
        this.seg = 0;
      } else {
        this.stylePath[this.seg] = only;
      }
      this.styleMenu = null;
      this.state = 'play';
      this.applySegmentPalette();
      if (step === 'first') this.newRun(this.pendingRunStyle || this.style);
      else this.newFloor(this.depth);
      return;
    }
    const cur = this.stylePath[this.stylePath.length - 1];
    this.styleMenu = {
      step: step,
      idx: Math.max(0, pool.indexOf(cur)),
      sel: cur,
      pool: pool,
      /* 下一次要写入的路径位置：'next' 时是当前段号（覆盖待进入的那一段） */
      slot: step === 'next' ? this.seg : 0
    };
    this.state = 'stylePick';
    updateOverlay();
  }

  /* 面板导航（←→ / WASD 都行）。与挑战菜单同款，避免两套手感 */
  styleMenuMove(d) {
    const m = this.styleMenu;
    if (!m || !m.pool.length) return;
    m.idx = (m.idx + d + m.pool.length) % m.pool.length;
    m.sel = m.pool[m.idx];
    SFX.ensure();
    updateOverlay();
  }

  /* 确认选择 */
  styleMenuConfirm() {
    const m = this.styleMenu;
    if (!m) return;
    const picked = m.sel;
    /* 写入路径。'next' 时是**覆盖当前段**（该段还没开始，所以是赋值而非追加） */
    if (m.step === 'first') {
      this.stylePath = [picked];
      this.seg = 0;
    } else {
      this.stylePath[this.seg] = picked;
    }
    this.styleMenu = null;
    this.state = 'play';
    if (m.step === 'first') {
      /* 开局：走正常开局流程（newRun 会重置一切并进入第 1 层） */
      this.newRun(this.pendingRunStyle || this.style);
    } else {
      this.applySegmentPalette();     // 先换色板 + 重建素材，再生成新楼层
      this.newFloor(this.depth);
    }
    updateOverlay();
  }

  /* 返回（Esc / Backspace）：开局那一层不允许退（否则没得玩），
     段间选择允许退回上一层重打（给「选错了」留一条路）。 */
  styleMenuBack() {
    const m = this.styleMenu;
    if (!m) return;
    if (m.step === 'first') return;      // 开局必选，不能空着走
    this.styleMenu = null;
    this.state = 'play';
    this.depth--;                        // 退回上一层（那一层的门还开着）
    this.newFloor(this.depth);
    updateOverlay();
  }

  /* ---------------- 法宝融合（第 3 期） ----------------
     与 stylePick / chall 同款「暂停 + DOM 面板」形状：state 切到 'fusion'，
     主循环在 update 入口就返回，面板由 updateOverlay → renderFusionPanel 画。
     交互沿用键盘（←→ 选、E 取件、Q 退件、Esc 退出），卡片也能点 —— 与既有面板同手感。
     规则与数据在 src/fusion.js。 */

  /* 玩家手里「参与过至少一条配方」的持有法宝（去重，按持有数降序）。
     与配方完全无关的法宝不进池 —— 摆出来只会让玩家白试一遍。 */
  fusionPool() {
    const cnt = {};
    for (const id of this.player.items) cnt[id] = (cnt[id] || 0) + 1;
    return Object.keys(cnt)
      .filter(id => fusionsWith(id).length > 0)
      .sort((a, b) => cnt[b] - cnt[a]);
  }

  openFusion(forge) {
    input.interact = false;
    if (this.state !== 'play') return;
    /* 手里凑不出任何一条配方时：**不弹面板、也不消耗这座阵** ——
       否则玩家按一下 E 就把这一层的机会丢进一个空面板里。 */
    const ready = FUSION_DEF.filter(r => fusionReady(r, this.player.items));
    if (!this.fusionPool().length || !ready.length) {
      this.forgeHint = null;
      this.floaters.push(new Floater(this.player.x, this.player.y - 26, '机缘未至', PAL.grey));
      return;
    }
    if (forge) { forge.used = true; if (forge.src) forge.src.used = true; }
    this.fusion = { forge: forge || null, pool: this.fusionPool(), idx: 0, slots: [null, null], msg: '' };
    this.state = 'fusion';
    this.forgeHint = null;
    SFX.levelup();
    updateOverlay();
  }

  fusionMove(d) {
    const f = this.fusion;
    if (!f || !f.pool.length) return;
    f.idx = (f.idx + d + f.pool.length) % f.pool.length;
    f.msg = '';
    SFX.ensure();
    updateOverlay();
  }

  /* 把光标那件放进空槽；两槽都满则顶掉第二槽（再按一次就能换掉重选） */
  fusionTake() {
    const f = this.fusion;
    if (!f || !f.pool.length) return;
    const id = f.pool[f.idx];
    if (!f.slots[0]) f.slots[0] = id;
    else f.slots[1] = id;
    f.msg = '';
    SFX.pickup();
    updateOverlay();
  }

  /* 退一件：先退第二槽再退第一槽（一次退一步，符合直觉） */
  fusionDrop() {
    const f = this.fusion;
    if (!f) return;
    if (f.slots[1]) f.slots[1] = null;
    else if (f.slots[0]) f.slots[0] = null;
    f.msg = '';
    SFX.tone(320, 0.05, 'square', 0.08);
    updateOverlay();
  }

  /* 两槽现在对应哪条配方（顺序无关） */
  fusionCurrent() {
    const f = this.fusion;
    if (!f || !f.slots[0] || !f.slots[1]) return null;
    return fusionRecipeOf(f.slots[0], f.slots[1]);
  }

  fusionConfirm() {
    const f = this.fusion;
    if (!f) return;
    /* 两槽没凑齐：先当作「取件」，让 E 一键到底（少一次按键切换） */
    if (!f.slots[0] || !f.slots[1]) { this.fusionTake(); return; }
    if (!this.fusionCurrent()) {
      f.msg = '这两件之间没有机缘'; SFX.tone(200, 0.08, 'square', 0.08); updateOverlay(); return;
    }
    const res = fusionExecute(this, f.slots[0], f.slots[1]);
    if (!res.ok) { f.msg = res.why || '融合未成'; updateOverlay(); return; }
    const fx = f.forge ? f.forge.x : this.player.x;
    const fy = f.forge ? f.forge.y : this.player.y;
    this.burst(fx, fy, 40, PAL.goldL);
    this.shake(7);
    SFX.thunder();
    this.fusion = null;
    this.state = 'play';
    /* 首次合成 = 揭示 + 收录。
       give() 已经把产物卡片推上来了（itemPopup 显示的就是真名），
       「？？？」在这里被打破 —— 这就是本次设计里最珍贵的那一瞬间。 */
    if (res.first) {
      this.floaters.push(new Floater(fx, fy - 34, '图鉴收录', PAL.goldL));
      SFX.secret();
    }
    updateOverlay();
  }

  /* Esc：有材料先退材料，没材料可退再关面板（面板开着就一定关得掉） */
  fusionBack() {
    const f = this.fusion;
    if (!f) return;
    if (f.slots[0] || f.slots[1]) { this.fusionDrop(); return; }
    this.fusion = null;
    this.state = 'play';
    updateOverlay();
  }

  /* ---------------- Boss 挑战模式 ----------------
     配置表见文件顶部的 CHALLENGE_DIFF。三条硬约束：

     1. 与真实进度**完全隔离**：不清档、不写档、死了不销档（saveGame 里有守卫）。
     2. 楼层仍走正常的 Floor 生成 —— 房间背景、门的绘制、Boss 房波次全都现成，
        生成完直接把玩家传进魔窟。小地图上还留着别的房间，那无害。
     3. 头目血量 = 楼层自带的 hpScale × 难度倍数，于是三档分别对应
        「前期 / 中期 / 后期」那次典型对局，而不是单纯的血多血少。
  */
  openChallMenu() {
    /* 三级菜单：择流派 → 择魔头 → 择难度。
       流派必须能选 —— 挑战模式原先直接用 this.style，而构造器里它是 'feijian'，
       页面刷新后第一次进挑战就只能是飞剑流（2026-09-23 反馈「只能用飞剑流」）。 */
    if (!this.challMenu) this.challMenu = { step: 'style', idx: 0, style: null, bossId: null };
    else this.challMenu.step = 'style';
    this.challMenu.style = this.style || PLAYABLE_STYLES[0];
    this.challMenu.idx = Math.max(0, PLAYABLE_STYLES.indexOf(this.challMenu.style));
    this.chall = null;
    this.player = null;
    this.pick = null;
    this.paused = false;
    this.restartHold = 0;
    this.ultUpgradeT = 0;
    this.state = 'chall';
    this.styleIdx = Math.max(0, PLAYABLE_STYLES.indexOf(this.style));
    updateOverlay();
  }
  /* 收场：无论胜负都回 Boss 选择菜单（用户要求「打完直接返回」） */
  exitChallenge(win) {
    const c = this.chall;
    if (c) {
      this.challResult = {
        win: !!win, bossId: c.bossId, diffIdx: c.diffIdx, style: c.style,
        secs: Math.round(c.frames / 60)
      };
    }
    this.openChallMenu();
  }
  /* 配装：法宝 3d 件、功法 d 个、专属技 Lv d。
     全部走正常获取通道（give / addSkill），所以「分流派文案」与
     「重复即进阶」这些规则自动生效，不必在挑战模式里另写一份。 */
  giveChallengeLoadout() {
    const p = this.player, d = this.chall.d;
    for (let i = 0; i < d.items; i++) p.give(this.rollFabao(), this);
    for (let i = 0; i < d.skills; i++) {
      const id = this.rollSkill();
      if (id) p.addSkill(id);          // 槽位共 3 个，而 d ≤ 3，不会溢出
    }
    p.giveUlt(this.style);
    if (p.ult) {
      /* 专属技等级 = 1 + 各路线等级和，所以「Lv d」要先随机点亮 d-1 条路线；
         余下的 CHALL_UPGRADES 次进境全部交给玩家手选。 */
      const pool = (ULT_PATH[this.style] || []).slice();
      for (let i = 0; i < d.ultLv - 1 && pool.length; i++) {
        const k = Math.floor(Math.random() * pool.length);
        p.ult.paths[pool.splice(k, 1)[0].id] = 1;
      }
    }
    this.itemPopup = null;             // 配装时 give 会叠一摞拾取卡片，清掉
  }
  startChallenge(bossId, diffIdx, style) {
    const d = CHALLENGE_DIFF[diffIdx] || CHALLENGE_DIFF[0];
    /* 层数取「该尊者的段末」（血魔→5 / 白骨→10 / 裂煞→15）。
       ⚠️ 不能再用 BOSS_KEYS.indexOf + 1：Boss 现在只在段末刷，
          索引 0（血魔）会算出第 1 层，而第 1 层没有 Boss 房 ——
          挑战模式会开成一张没有头目的白图（选谁都是打空气）。 */
    const depth = bossFloorOf(bossId);
    this.style = style || this.style || PLAYABLE_STYLES[0];
    this.depth = depth;
    this.coins = 0; this.keys = 0; this.bombs = 0; this.kills = 0; this.time = 0;
    this.player = new Player(ROOM_W / 2, ROOM_H / 2 + 20);
    this.itemPopup = null;
    this.pick = null; this.ultWarn = null; this.ultSword = null; this.ultUpgradeT = 0;
    this.paused = false; this.restartHold = 0;
    this.state = 'play';
    /* 先清场再配装：giveChallengeLoadout 会往 floaters 里塞飘字，
       而这几个数组原本只在 newFloor 里初始化 —— 从标题直接进挑战（还没开过局）
       时它们还是 undefined，配装第一步就炸。顺带把上一局的残留一起清掉。 */
    this.bullets = []; this.enemies = []; this.pickups = []; this.hazards = [];
    this.particles = []; this.floaters = []; this.zaps = []; this.props = [];
    this.beams = []; this.slashes = []; this.dnums = []; this.timers = [];
    this.placedBombs = [];
    this.chall = {
      bossId: bossId, diffIdx: diffIdx, d: d, depth: depth, style: this.style,
      frames: 0, upgrades: CHALL_UPGRADES, upgradeT: 24, endT: 0, win: null
    };
    this.giveChallengeLoadout();
    /* ⚠️ 必须把选中的尊者显式传进去：正常流程按【段】取人，
       而挑战模式点谁就该打谁（选烛龙时 depth 算出 5 → 段 0，会被换成血魔）。 */
    this.newFloor(depth, null, { boss: bossId });
    const br = [...this.floor.rooms.values()].find(r => r.type === RT.BOSS);
    if (br) this.enterRoom(br, null);
    this.chall.upgradeT = 24;          // 进房后隔 0.4 秒再开始问进境
    renderPickPanel();
    updateOverlay();
    SFX.levelup();
  }
  /* 挑战菜单的三级导航（←→ / 数字切换，Enter 确认，Esc 退一层） */
  challPick(i) {
    const cm = this.challMenu;
    if (!cm) return;
    const n = cm.step === 'style' ? PLAYABLE_STYLES.length
      : cm.step === 'boss' ? BOSS_KEYS.length : CHALLENGE_DIFF.length;
    const ni = Math.max(0, Math.min(n - 1, i));
    if (ni === cm.idx) return;
    cm.idx = ni;
    renderChallMenu();
    SFX.tone(660 + ni * 90, 0.05, 'square', 0.09);
  }
  challConfirm() {
    const cm = this.challMenu;
    if (!cm) return;
    if (cm.step === 'style') {
      cm.style = PLAYABLE_STYLES[cm.idx] || PLAYABLE_STYLES[0];
      cm.step = 'boss';
      cm.idx = 0;
      renderChallMenu();
      SFX.tone(880, 0.06, 'square', 0.1);
    } else if (cm.step === 'boss') {
      cm.bossId = BOSS_KEYS[cm.idx];
      cm.step = 'diff';
      cm.idx = 1;                      // 默认停在中间那档「危」
      renderChallMenu();
      SFX.tone(880, 0.06, 'square', 0.1);
    } else {
      SFX.levelup();
      this.startChallenge(cm.bossId, cm.idx, cm.style);
    }
  }
  challBack() {
    const cm = this.challMenu;
    if (!cm) return;
    if (cm.step === 'diff') {
      cm.step = 'boss';
      cm.idx = Math.max(0, BOSS_KEYS.indexOf(cm.bossId));
      renderChallMenu();
    } else if (cm.step === 'boss') {
      cm.step = 'style';
      cm.idx = Math.max(0, PLAYABLE_STYLES.indexOf(cm.style));
      renderChallMenu();
    } else {
      this.state = 'title';
      updateOverlay();
    }
    SFX.tone(392, 0.06, 'square', 0.09);
  }

  /* ---------------- 无尽试炼（无限模式） ----------------
     与挑战模式共用同一套「独立模式」骨架：不做新的 state，
     而是复用 'play' + 一个非 null 的标志位，于是房间绘制、HUD、
     输入全部照旧 —— 这是让改动量可控的关键。

     一条重要差别：无尽**会主动致死并结算**，所以 onPlayerDead 里
     要给它一条独立的收场分支（不像挑战那样原地演完就回菜单）。
  */

  /* 进场。build 可为空（从标题直接进，用兜底配装）。 */
  startEndless(style, build) {
    const E = ENDLESS;
    this.style = style || this.style || PLAYABLE_STYLES[0];
    this.depth = 1;                     // 无尽没有层数，给 1 只为让别处的读表不炸
    this.coins = 0; this.keys = 0; this.bombs = 0; this.kills = 0; this.time = 0;
    this.player = new Player(ROOM_W / 2, ROOM_H / 2 + 20);
    this.itemPopup = null;
    this.pick = null; this.ultWarn = null; this.ultSword = null; this.ultUpgradeT = 0;
    this.paused = false; this.restartHold = 0;
    this.state = 'play';

    /* 先清场再配装 —— 与挑战模式同因：give() 会往 floaters 里塞飘字，
       而这些数组只在 newFloor / enterRoom 里初始化，从标题直接进来会是 undefined。 */
    this.bullets = []; this.enemies = []; this.pickups = []; this.hazards = [];
    this.particles = []; this.floaters = []; this.zaps = []; this.props = [];
    this.beams = []; this.slashes = []; this.dnums = []; this.timers = [];
    this.placedBombs = [];

    this.endless = {
      wave: 0,            // 已刷出的波数（0 = 还没开第一波）
      kills: 0,           // 本局击杀数 —— 核心分数
      frames: 0,          // 存活帧数（结算时换算成秒）
      clearFrames: 0,     // 「场面清空」的连续帧数：清空后提前开下一波，节奏更紧凑
      mods: [],           // 本波生效的词缀 id 列表
      best: { wave: 0, kills: 0, secs: 0 },   // 历史最好成绩（localStorage）
      endT: 0,
      bestPending: false  // 结束后是否破了纪录（结算界面用）
    };
    this.endless.best = this.loadEndlessBest();

    if (build) this.applyEndlessBuild(build);
    else this.giveEndlessLoadout();

    /* 竞技场：复用一间普通石室。用 seed 造一层再挑 start 房，
       比手搓 Room 稳 —— 地板贴图、墙体、门框、障碍全是现成的。
       门全部钉死，于是这就是一个封闭擂台。 */
    this.newFloor(1);
    const arena = this.floorStart();
    arena.type = RT.NORMAL;             // 别显示成「静心阁」
    arena.props = [];                   // 竞技场不放宝箱 / 灯笼，保持场地干净
    for (let d = 0; d < 4; d++) { arena.doors[d] = false; arena.doorOpen[d] = false; arena.doorHidden[d] = false; }
    for (const n of arena.neighbors) if (n) { const r = this.floor.rooms.get(n); if (r) r.seen = false; }
    arena.neighbors = [null, null, null, null];
    arena.cleared = false;
    this.enterRoom(arena, null);
    /* enterRoom 会照常刷一波房内妖物（Floor 按 dist 排的），
       但它们不是无尽排的波 —— 清掉，让第 1 波从干净的场面开始。 */
    this.enemies.length = 0;
    this.bossRef = null;

    /* 第一波立刻开：把 t 顶到 1，于是 endlessTick 首帧（场面空）就 --t → 0 并刷怪。
       之后的间隔由 endlessTick 在每次清场时重算。 */
    this.endless.t = 1;
    renderPickPanel();
    updateOverlay();
    SFX.levelup();
  }

  /* 通关 build → 无尽。存的是「拿到过什么」而不是算完的属性，
     于是重新 give 一遍就自动走完整的进阶 / 分流派文案逻辑。 */
  applyEndlessBuild(b) {
    const p = this.player;
    for (const id of (b.items || [])) p.give(id, this);
    for (const s of (b.slots || [])) if (s) p.addSkill(s.id);
    // 专属技：先把路线等级还原，再按 style 补出专属技本身
    p.giveUlt(this.style);
    if (p.ult && b.ultPaths) for (const k in b.ultPaths) p.ult.paths[k] = b.ultPaths[k];
    if (typeof b.hp === 'number' && b.hp > 0) p.hp = Math.min(p.maxHP, b.hp);
    this.itemPopup = null;              // give 会叠一摞拾取卡片，清掉
    this.floaters.push(new Floater(ROOM_W / 2, 96, 'BUILD LOADED', PAL.cyan));
  }

  /* 空手进场的兜底配装（从标题直接试玩无尽时走这条） */
  giveEndlessLoadout() {
    const E = ENDLESS, p = this.player;
    for (let i = 0; i < E.baseItems; i++) p.give(this.rollFabao(), this);
    for (let i = 0; i < E.baseSkills; i++) { const id = this.rollSkill(); if (id) p.addSkill(id); }
    p.giveUlt(this.style);
    if (p.ult) {
      const pool = (ULT_PATH[this.style] || []).slice();
      for (let i = 0; i < E.baseUltLv - 1 && pool.length; i++) {
        const k = Math.floor(Math.random() * pool.length);
        p.ult.paths[pool.splice(k, 1)[0].id] = 1;
      }
    }
    this.itemPopup = null;
  }

  /* —— 排程：每帧调一次。
     核心规则：**下一波只在场面清空后才排**。
     若计时器在还有妖物活着时照样倒数，就变成「一边打一边不断刷新」——
     第 60 秒场上会堆到 260+ 只（实测），那不是难度是幻灯片。
     所以计时器只在清场后才开始走，而它的作用是「给玩家一口气」：
       清场 → 立刻给 healPerWave 回血 → 等 gap 帧 → 刷下一波。
     gap 再取一个「清空后至少等 cooldown 帧」的地板，防止秒清秒刷。 */
  endlessTick() {
    const S = this.endless;
    if (!S || S.endT > 0) return;
    S.frames++;
    const alive = this.enemies.some(e => !e.dead);
    if (alive) { S.clearFrames = 0; return; }        // 还有活口：不排下一波

    S.clearFrames++;
    /* 刚清空的那一帧：发回血 + 定下这一轮要等的间隔。
       wave === 0 是特例 —— 进场第一波立刻开，不等喘息。 */
    if (S.clearFrames === 1) {
      const p = this.player;
      if (p && !p.dead && S.wave > 0 && S.wave % ENDLESS.healWaveEvery === 0) p.heal(ENDLESS.healPerWave);
      if (S.wave === 0) {
        S.t = 1;                                        // 首波：这一帧就出
      } else {
        const gap = Math.max(ENDLESS.waveGapMin, ENDLESS.waveGap0 - S.wave * ENDLESS.waveGapDecay);
        S.t = gap + ENDLESS.clearCooldown;
      }
    }
    if (--S.t <= 0) this.spawnEndlessWave();
  }
  /* —— 曲线：三个 pure function，测试直接量它们就行 —— */

  /* 第 n 波刷多少只（不含词缀带来的额外量） */
  endlessCount(wave) {
    return Math.min(ENDLESS.countMax, ENDLESS.countBase + Math.floor(ENDLESS.countGrow * Math.sqrt(Math.max(0, wave))));
  }
  /* 第 n 波的妖物血量倍率 */
  endlessHpScale(wave) {
    return Math.min(ENDLESS.hpMax, ENDLESS.hpBase * Math.pow(ENDLESS.hpGrow, Math.max(0, wave)));
  }
  /* 第 n 波可出的妖物池：按 segWaves 一档档解锁。
     ⚠ 键名必须与 ENEMY_DEF 完全一致，且**不能混进 ELITE_DEF 的键**
     （xiesha / youyan / jiying / wandu 是精英，duannian 是剑灵的精英变体）——
     写错的后果是 new Enemy 直接抛异常把整局打断。ENEMY_DEF 实有 14 种。 */
  endlessPool(wave) {
    const seg = Math.floor(Math.max(0, wave - 1) / ENDLESS.segWaves);   // 0,0,0,0,1,1,1,1,2...
    const pool = ['xiesui', 'chanchu', 'yinsha'];          // 第 1 档：开场三样
    if (seg >= 1) pool.push('xuefu', 'guixiu', 'shikui', 'bengyao');
    if (seg >= 2) pool.push('jianling', 'yingmo', 'xuanguang');
    if (seg >= 3) pool.push('tiehun', 'xuanjia');
    /* 第 4 档起把前期的小怪挤出去 —— 否则池子越来越大，
       后期反而全是初始那三种软柿子，压力上不去。 */
    if (seg >= 4) pool.splice(0, 3);
    if (seg >= 6) pool.splice(0, 4);
    return pool;
  }
  /* 第 n 波生效的词缀：每 modWaves 波加一条，从表里不重复地抽 */
  endlessModsFor(wave) {
    const n = Math.min(ENDLESS.modMax, Math.floor(Math.max(0, wave - 1) / ENDLESS.modWaves));
    if (n <= 0) return [];
    const bag = ENDLESS_MODS.map(m => m.id);
    const out = [];
    for (let i = 0; i < n && bag.length; i++) {
      out.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
    }
    return out;
  }

  /* 刷下一波。返回本波实际刷出的数量（供测试断言）。 */
  spawnEndlessWave() {
    const S = this.endless;
    S.wave++;
    const wave = S.wave;
    const mods = this.endlessModsFor(wave);
    S.mods = mods;
    const defs = mods.map(id => ENDLESS_MODS.find(m => m.id === id)).filter(Boolean);

    let n = this.endlessCount(wave);
    if (mods.indexOf('swarm') >= 0) n = Math.round(n * 1.5);

    const hpScale = this.endlessHpScale(wave);
    const pool = this.endlessPool(wave);
    for (let i = 0; i < n; i++) {
      /* 出生点：沿房间内圈均匀铺开再抖动 —— 比纯随机更像「围上来」，
         而且不会几只叠在同一个点上。 */
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const rad = 92 + Math.random() * 26;
      const sx = ROOM_W / 2 + Math.cos(a) * rad * 1.35;
      const sy = ROOM_H / 2 + Math.sin(a) * rad * 0.85;
      const sp = this.safeSpawn(clamp(sx, WALL_L + 18, WALL_R - 18), clamp(sy, WALL_T + 18, WALL_B - 18), 12);
      /* 池子理论上不会空，但一旦某个 splice 把池子清光，new Enemy(undefined)
         会直接抛异常把整局打断 —— 退到阴煞兜底，别让一个数值笔误毁掉玩法。 */
      const type = pool[Math.floor(Math.random() * pool.length)] || 'yinsha';
      const e = new Enemy(type, sp.x, sp.y, hpScale);
      e.endlessMods = mods.slice();
      for (const d of defs) { try { d.apply(e); } catch (err) { console.error('[mod]', d.id, err); } }
      this.enemies.push(e);
    }
    /* 飘字报波次 —— 纯英文点阵，中文会静默不画（FONT5 只有英文） */
    this.floaters.push(new Floater(ROOM_W / 2, 108, 'WAVE ' + wave, PAL.gold));
    if (defs.length) {
      this.floaters.push(new Floater(ROOM_W / 2, 124, defs.map(d => d.name).join(' + '), PAL.purpleL));
    }
    S.clearFrames = 0;
    SFX.door();
    return n;
  }

  /* 无尽：挨打就掉血，掉光就收场 —— 但不走「重入轮回」那套销档流程，
     而是停下来把成绩亮给玩家看。 */
  exitEndless() {
    const S = this.endless;
    if (!S) return;
    S.secs = Math.floor(S.frames / 60);
    /* 先判定是否破纪录，再把最好成绩换成「含本局」的那一份 ——
       否则结算界面会显示上一局的旧纪录，而这局明明刚破了它
       （首局会显示成「历史最好 击杀 0」，看起来像 bug）。 */
    S.bestPending = this.saveEndlessBest(S.wave, S.kills, S.secs);
    S.best = this.loadEndlessBest();
    S.endT = 0;                       // 已收场，别再重复触发
    this.state = 'endlessEnd';
    /* 不销档、也不写档 —— 与挑战模式同一条纪律：无尽是拿「已通关的档」
       去考试，考砸了不该把那份档一起烧掉。所以这里既不能 saveGame，
       也不能 clearSave（曾误删过玩家的真实进度）。 */
    updateOverlay();
  }
  /* 成绩留一行在标题上（不回标题也能看到上次打到哪） */
  loadEndlessBest() {
    try {
      const d = JSON.parse(localStorage.getItem(ENDLESS_BEST_KEY) || 'null');
      if (!d) return { wave: 0, kills: 0, secs: 0 };
      return { wave: d.wave | 0, kills: d.kills | 0, secs: d.secs | 0 };
    } catch (e) { return { wave: 0, kills: 0, secs: 0 }; }
  }
  /* 破纪录才写回，返回是否破了 */
  saveEndlessBest(wave, kills, secs) {
    const b = this.loadEndlessBest();
    const beat = kills > b.kills || (kills === b.kills && secs > b.secs);
    if (!beat) return false;
    try {
      localStorage.setItem(ENDLESS_BEST_KEY, JSON.stringify({ wave: wave, kills: kills, secs: secs }));
    } catch (e) { }
    return true;
  }
  /* 回标题（结算界面按任意键走这里） */
  leaveEndless() {
    this.endless = null;
    this.state = 'title';
    updateOverlay();
  }
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
    this.itemPopup = null;    // 面板是全屏遮罩，底下那半张拾取卡片留着只会漏出来
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
    // 主动暂停：比选择界面还优先，连 tick 都不走（暂停时不希望任何计时在跑）
    if (this.paused) { input.interact = false; this.restartHold = 0; return; }
    // 设置面板：同样全停（它可能盖在三选一之上，所以排在 pick 前面）
    if (this.settingsOpen) { input.interact = false; this.restartHold = 0; return; }
    // 选择界面：先于 tick 拦截，整个世界（含动画计时）完全静止
    if (this.pick) { input.interact = false; this.restartHold = 0; return; }
    // 斩精英后稍缓一拍再弹三选一，先让死亡特效演完
    if (this.ultUpgradeT > 0 && --this.ultUpgradeT === 0) { this.openUltUpgrade(); return; }
    /* 挑战模式的结算倒计时：先于「非局内就 return」处理 ——
       玩家被打死时 state 会切成 'dead'，但这里仍要把这最后一段演完再回菜单。 */
    if (this.chall && this.chall.endT > 0 && --this.chall.endT === 0) {
      this.exitChallenge(this.chall.win);
      return;
    }
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
        // 挑战模式：放弃本次挑战、回选择菜单（而不是掉进普通开局的流派选择）
        if (this.chall) { this.openChallMenu(); return; }
        this.state = 'choose';
        this.styleIdx = Math.max(0, PLAYABLE_STYLES.indexOf(this.style));
        updateOverlay();
        return;
      }
    } else this.restartHold = 0;
    if (this.minimapT > 0) this.minimapT--;      // 小地图高亮渐隐
    this.time++;
    /* 挑战模式：累计战斗帧数（结算时报耗时），并排队弹出专属技的进境三选一。
       面板关掉之后隔 40 帧再问下一次 —— 连问三次会让玩家来不及看清路线。 */
    if (this.chall) {
      this.chall.frames++;
      // endT 一开就是结算演出（玩家已死或头目已斩），这时别再弹进境面板
      if (this.chall.upgrades > 0 && this.chall.endT === 0) {
        if (this.chall.upgradeT > 0) {
          if (--this.chall.upgradeT === 0) { this.chall.upgrades--; this.openUltUpgrade(); }
        } else {
          this.chall.upgradeT = 40;
        }
      }
    }
    /* 无尽试炼：累计存活帧数 + 排程下一波（节奏交给 endlessTick，见下） */
    if (this.endless) this.endlessTick();
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
    this.forgeHint = null;
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
    g.fillStyle = PAL.edgeWarm; g.fillRect(0, 0, 480, 320);
    if (this.state === 'title' || this.state === 'choose' || this.state === 'chall'
      || this.state === 'stylePick' || this.state === 'fusion'
      || this.state === 'endlessEnd') { this.drawTitle(g); return; }

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
    // 融合阵是印在地上的法阵，跟符阵/传送阵/祭坛一样走地面层，不掺进 y 排序
    for (const pr of this.props) if (pr.kind === 'rune' || pr.kind === 'portal' || pr.kind === 'altar' || pr.kind === 'forge') pr.draw(g, this);

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
    /* 无尽试炼：没有其它房间，小地图只会糊住右上角视线，直接不画。
       （挑战模式留着它无害，那边至少还生成了整层。） */
    if (!this.endless) this.drawMinimap(g);
    if (this.bossRef && !this.bossRef.dead) this.drawBossBar(g);
    /* 无尽试炼：成绩板 —— 波次 / 击杀 / 存活，挂在左上血条区下方。
       放这里是因为左下被法宝图标行占着（画在那儿会糊成一团）。 */
    if (this.endless) this.drawEndlessHUD(g);
    if (this.state === 'dead') this.drawDead(g);
    if (this.state === 'win') this.drawWin(g);
    if (this.paused) this.drawPaused(g);
  }

  /* 暂停 / 继续。只在局内（play）有效 —— 标题与选择界本来就不推进世界。 */
  togglePause() {
    if (this.state !== 'play') return;
    this.paused = !this.paused;
    // 暂停要把鼠标状态清掉：否则恢复时还按着上一帧的射击，手感很怪
    if (this.paused) { input.mouseDown = false; input.restart = false; SFX.tone(392, 0.09, 'square', 0.09); }
    else SFX.tone(660, 0.09, 'square', 0.09);
  }

  /* 暂停遮罩。中文画不出来（FONT5 只有英文点阵，drawPixelText 遇缺字静默跳过），
     所以这里的文案全用英文；层数 / 流派等中文信息仍由 HUD 的 DOM 浮层展示。 */
  drawPaused(g) {
    g.save();
    g.fillStyle = 'rgba(4,3,10,0.66)';
    g.fillRect(0, 0, 480, 320);
    g.fillStyle = PAL.gold; g.globalAlpha = 0.6;
    g.fillRect(240 - 62, 124, 124, 1);
    g.fillRect(240 - 62, 198, 124, 1);
    g.globalAlpha = 1;
    drawPixelText(g, 'PAUSED', 240 - 3 * 12, 138, 2, PAL.goldL);
    drawPixelText(g, 'P RESUME', 240 - 4 * 6, 170, 1, PAL.jadeL);
    drawPixelText(g, 'O OPTIONS', 240 - 4.5 * 6, 184, 1, PAL.jadeL);
    g.restore();
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
    g.fillStyle = PAL.ink; g.fillRect(0, 0, 480, 32);
    g.fillStyle = PAL.wall; g.fillRect(0, 31, 480, 1);
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
    g.fillStyle = PAL.ink2; g.fillRect(mx0, my0, mw, mh);
    const mpk = clamp(p.mp / p.maxMP, 0, 1);
    g.fillStyle = mpk >= 1 ? PAL.cyan : '#3f8fd0';
    g.fillRect(mx0, my0, mw * mpk, mh);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(mx0, my0, mw * mpk, 2);
    // 每 10 点一道刻度，余光里也能估算够不够放一发
    g.fillStyle = 'rgba(8,6,18,0.4)';
    for (let i = 1; i < 10; i++) g.fillRect(mx0 + mw * i / 10 - 0.5, my0, 1, mh);
    g.strokeStyle = PAL.wallHi; g.lineWidth = 1; g.strokeRect(mx0 + 0.5, my0 + 0.5, mw - 1, mh - 1);
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
    g.fillStyle = PAL.wallLo; g.fillRect(ux, uy, 24, 24);
    g.strokeStyle = p.ult ? (chainOpen ? PAL.cyan : PAL.gold) : PAL.wallHi;
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
            p.wjStage > 0 ? PAL.cyan : PAL.greyD);
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
      drawPixelText(g, '空格', ux + 2, uy + 9, 1, PAL.wallHi);
    }

    /* 小技能槽（右下）：1/2/3 切换、Q 释放 */
    const sx0 = 398, sy0 = 320 - 24;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const s = p.slots[i];
      const x = sx0 + i * 24, y = sy0, w = 21, h = 21;
      g.fillStyle = PAL.wallLo; g.fillRect(x, y, w, h);
      g.strokeStyle = (i === p.slotIdx) ? PAL.gold : PAL.wallHi;
      g.lineWidth = (i === p.slotIdx) ? 2 : 1;
      g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      g.lineWidth = 1;
      if (!s) { drawPixelText(g, String(i + 1), x + 7, y + 7, 1, PAL.wallHi); continue; }
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
    drawPixelText(g, 'Q', sx0 - 9, sy0 + 7, 1, PAL.greyD);

    // 已获法宝（左下角）：同种堆叠成一层，右下角标 LvN
    let bx = 6, by = 320 - 22;
    /* 御风踏云的风势读数：满了才甩得出风刃，所以必须给一条能看的进度条 ——
       否则「攒够了没」只能靠猜。放在法宝图标行正上方（图标最多两行，
       y 从 298 往上长到 279，这里取 270 正好不打架）。 */
    if (p.stats.fus && p.stats.fus.wind) {
      const k = Fusion.windRatio(p), wx = 6, wy = 320 - 50, ww = 40;
      g.fillStyle = 'rgba(8,6,18,0.78)'; g.fillRect(wx - 1, wy - 1, ww + 2, 5);
      g.fillStyle = k >= 1 ? PAL.cyan : PAL.jade;
      g.fillRect(wx, wy, Math.round(ww * k), 3);
      if (k >= 1) {
        g.globalAlpha = 0.5 + Math.sin(this.tick * 0.14) * 0.5;
        g.fillStyle = PAL.white; g.fillRect(wx + ww + 2, wy - 1, 2, 5); g.globalAlpha = 1;
      }
    }
    const order = [], cnt = {};
    for (const id of p.items) { if (!(id in cnt)) { cnt[id] = 0; order.push(id); } cnt[id]++; }
    /* 融合共鸣（第 3 期）：**设计里白送的那一半**。
       只要手里凑齐了一对可融的法宝，这两个图标就浮起光晕 ——
       发现是自动的、免费的；执行才要代价（走到融合阵按 E）。
       没有这一层，300 种组合里玩家根本不知道该试什么。 */
    const fusable = {};
    for (const r of FUSION_DEF) if (fusionReady(r, p.items)) { fusable[r.a] = true; fusable[r.b] = true; }
    const show = order.slice(-12);
    for (const id of show) {
      const ic = ITEM_ICONS[id];
      if (ic) {
        if (fusable[id]) {
          const pulse = 0.5 + Math.sin(this.tick * 0.11) * 0.5;
          g.save();
          g.globalAlpha = 0.20 + pulse * 0.30;
          g.fillStyle = PAL.purpleL;
          g.fillRect(bx - 1, by - 1, 18, 18);
          g.globalAlpha = 0.50 + pulse * 0.45;
          g.strokeStyle = PAL.goldL; g.lineWidth = 1;
          g.strokeRect(bx - 1.5, by - 1.5, 19, 19);
          g.restore();
        }
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

  /* 无尽试炼的成绩板。
     位置：左上，紧贴灵力条下方。
     不选左下 —— 那里是法宝图标行（bx 每 19px 一列、最多两行、从 y=298 往上长），
     垫在一起会互相糊住。左上往下延伸的这片区域是空的。 */
  drawEndlessHUD(g) {
    const S = this.endless;
    if (!S) return;
    const bx = 8, by = 36, w = 104, h = 40;
    g.fillStyle = 'rgba(10,8,20,0.68)'; g.fillRect(bx, by, w, h);
    g.strokeStyle = PAL.gold; g.globalAlpha = 0.5; g.lineWidth = 1;
    g.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1); g.globalAlpha = 1;

    const sec = Math.floor(S.frames / 60);
    const mm = String(Math.floor(sec / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    /* 三行压到 10 字符内 —— FONT5 是 6px 等宽点阵，x 间距按 6px 算才不重叠 */
    drawPixelText(g, 'WAVE ' + S.wave, bx + 6, by + 4, 1, PAL.gold);
    drawPixelText(g, 'KILL ' + S.kills, bx + 6, by + 15, 1, PAL.redL);
    drawPixelText(g, mm + ':' + ss, bx + 6, by + 26, 1, PAL.jadeL);

    /* 本波词缀：贴在面板右侧，让玩家立刻知道「这批怪有什么毛病」 */
    if (S.mods && S.mods.length) {
      for (let i = 0; i < S.mods.length; i++) {
        const m = ENDLESS_MODS.find(x => x.id === S.mods[i]);
        if (!m) continue;
        g.fillStyle = PAL.purpleD; g.globalAlpha = 0.88;
        g.fillRect(bx + w + 4, by + i * 12 + 2, 48, 11); g.globalAlpha = 1;
        drawPixelText(g, m.name, bx + w + 7, by + i * 12 + 4, 1, PAL.purpleL);
      }
    }
  }
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
    /* 融合机缘：告诉玩家「这件能和什么融」，但**不剧透产物内容** ——
       未解锁时只显示 ？？？。这正是本次设计的边界：
       「能不能融」永远可见，「融出来是什么」才隐藏。 */
    const fus = fusionsWith(hit.id);
    if (fus.length && this.player) {
      const rows = fus.map(pair => {
        const otherDef = ITEM_MAP[pair.other];
        const oName = otherDef ? (itemView(otherDef, this.style, 0).name || otherDef.name) : pair.other;
        const outDef = ITEM_MAP[pair.recipe.id] || {};
        const outName = FusionCodex.has(pair.recipe.id)
          ? (itemView(outDef, this.style, 0).name || outDef.name)
          : '？？？';
        const have = fusionReady(pair.recipe, this.player.items);
        return (have ? '可融　' : '缺料　') + '<b>' + oName + '</b> → ' + outName;
      });
      html += '<div class="talt">' + rows.join('<br>') + '</div>';
    }
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
    /* 格子 9→7、间隙 2→1、整体压到半透明。
       原先是 79×83 的不透明块，正好压住房间右上角（世界区 x>393 / y<89）——
       妖物走到那儿会被整个盖掉，玩家会以为「怪被地图挡住了」（2026-09-23 反馈）。
       缩小 44% 面积 + 半透明后，底下的妖物始终看得见。 */
    const cell = 7, gap = 1, size = f.size;
    const w = size * (cell + gap) - gap + 4;
    const ox = 480 - w - 5, oy = 36;
    /* 换房后 2.5 秒内提亮到接近不透明 —— 「该往哪走」的时刻（刚进门）地图要清晰，
       其余时间让路给战斗。 */
    const hot = Math.min(1, this.minimapT / 90);
    const alpha = 0.42 + 0.5 * hot;
    g.save();
    /* 底衬单独压得更淡 —— 地图网格里大部分格子是空的，真正挡住妖物的
       主要就是这层底衬，房间格本身只占少数位置。 */
    g.globalAlpha = 0.16 + 0.34 * hot;
    g.fillStyle = PAL.edgeWarm;
    g.fillRect(ox - 2, oy - 2, w + 4, size * (cell + gap) - gap + 8);
    g.globalAlpha = alpha;
    for (const r of f.rooms.values()) {
      if (!r.visited && !r.seen) continue;
      if (r.type === RT.SECRET && !r.secretFound && !r.visited) continue;
      const x = ox + r.gx * (cell + gap), y = oy + r.gy * (cell + gap);
      const col = {
        start: PAL.jade, normal: PAL.rune, boss: PAL.red, treasure: PAL.gold,
        shop: PAL.purple, secret: PAL.moss, sacrifice: PAL.orange
      }[r.type] || PAL.rune;
      g.fillStyle = r.visited ? col : '#332e4a';
      g.fillRect(x, y, cell, cell);
      if (r.cleared && r.type !== RT.NORMAL) { g.fillStyle = PAL.edgeWarm; g.fillRect(x + 2, y + 2, cell - 4, cell - 4); }
      // 门
      g.fillStyle = r.visited ? PAL.grey : PAL.stone;
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
    // 外框：把「这是浮在最上层的 HUD、不是场景的一部分」这件事说清楚
    g.globalAlpha = Math.min(1, alpha + 0.3);
    g.strokeStyle = PAL.rune; g.lineWidth = 1;
    g.strokeRect(ox - 2.5, oy - 2.5, w + 5, size * (cell + gap) - gap + 9);
    g.restore();
  }

  drawBossBar(g) {
    const b = this.bossRef;
    const w = 260, x = (480 - w) / 2, y = 320 - 12;
    const k = Math.max(0, Math.min(1, b.hp / b.maxHp));
    /* 转阶段读数：invuln 只在 Boss.setPhase 里给，所以「invuln > 0」就是正在转阶段。
       没有这个读数，玩家只能靠「它又无敌了」猜阶段 —— 而烛龙的结罩循环
       看/听起来都跟转阶段一样（2026-09-23 反馈「无限切换二阶段」）。 */
    const shifting = b.invuln > 0;
    const blink = shifting && Math.floor(b.invuln / 3) % 2 === 0;
    g.fillStyle = PAL.edgeWarm; g.fillRect(x - 2, y - 2, w + 4, 10);
    g.fillStyle = PAL.redD; g.fillRect(x, y, w, 6);
    g.fillStyle = blink ? '#ffffff' : PAL.red; g.fillRect(x, y, w * k, 6);
    g.fillStyle = blink ? '#ffffff' : PAL.redL; g.fillRect(x, y, w * k, 2);
    // 阶段刻度 66% / 33%：血条上标出两道线，「打到第几阶段」才有准确读数
    g.fillStyle = PAL.edgeWarm;
    for (const t of [0.66, 0.33]) g.fillRect(x + Math.round(w * t), y - 1, 1, 8);
    g.strokeStyle = PAL.gold; g.lineWidth = 1; g.strokeRect(x - 0.5, y - 0.5, w + 1, 7);
    if (shifting) {
      const s = 'PHASE ' + b.phase;
      drawPixelText(g, s, Math.round(x + w / 2 - s.length * 3), y - 14, 1, PAL.cyan);
    }
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
    g.fillStyle = PAL.edgeWarm; g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle = PAL.wall; g.fillRect(x, y, w, h);
    if (p.wjCharging) {
      g.fillStyle = p.wjChargeT >= WJ.chargeMin ? col : PAL.stone;
      g.fillRect(x, y, Math.round(w * k), h);
      g.fillStyle = PAL.white; g.fillRect(x, y, Math.round(w * k), 1);
      g.fillStyle = PAL.greyD;
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
    g.fillStyle = PAL.edgeWarm; g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle = PAL.wall; g.fillRect(x, y, w, h);
    const fw = Math.round(w * clamp(p.chargeT / CHARGE.max, 0, 1));
    g.fillStyle = main; g.fillRect(x, y, fw, h);
    g.fillStyle = hi; g.fillRect(x, y, fw, 1);
    // 段位刻度
    g.fillStyle = PAL.ink;
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
    g.fillStyle = PAL.edgeWarm; g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle = PAL.wall; g.fillRect(x, y, w, h);
    g.fillStyle = PAL.purpleD; g.fillRect(x, y, Math.round(w * k), h);
    g.fillStyle = PAL.purpleL; g.fillRect(x, y, Math.round(w * k), 1);
    g.restore();
  }

  drawTitle(g) {
    // 背景：法阵
    g.fillStyle = PAL.edgeWarm; g.fillRect(0, 0, 480, 320);
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
    if (this.paused) {
      // 暂停：一步都不推进，也不让 acc 攒起来（否则恢复那一瞬会连跑好几帧）
      this.acc = 0;
    } else {
      this.acc += dt;
      const step = 1000 / 60;
      let n = 0;
      while (this.acc >= step && n < 5) {
        try { this.update(); } catch (e) { console.error('[update]', e); }
        this.acc -= step; n++;
      }
    }
    try { this.draw(); } catch (e) { console.error('[draw]', e); }
    try { this.updateBgm(); } catch (e) { console.error('[bgm]', e); }
    try { this.updateItemTip(); } catch (e) { console.error('[tip]', e); }
    try { this.updateShopTip(); } catch (e) { console.error('[tip]', e); }
    requestAnimationFrame(t => this.frame(t));
  }

  /* 选曲：菜单用 title、普通石室用 explore、魔窟用 boss。
     每帧调用无妨 —— BGM.play 同名直接返回。 */
  updateBgm() {
    if (!SFX.ctx) return;
    if (this.state === 'dead' || this.state === 'win') {
      if (BGM.track) BGM.stop();          // 阵亡 / 飞升：静场，把结局留白
    } else {
      let want = 'title';
      if (this.state === 'play') {
        const inBoss = this.room && this.room.type === RT.BOSS
          && this.bossRef && !this.bossRef.dead;
        want = inBoss ? 'boss' : 'explore';
      }
      BGM.play(want);
    }
    const wantDuck = (this.paused || this.settingsOpen) ? 0.22 : 1;
    if (wantDuck !== BGM.duck) { BGM.duck = wantDuck; BGM.setGain(); }
  }

  /* ---------------- 设置菜单 ----------------
     settingsOpen 时不推进世界（见 update 开头），等价于暂停；
     但**不动 this.paused** —— 这样关掉面板能回到「原来在跑 / 原来已暂停」的状态。 */
  openSettings() {
    if (this.settingsOpen) return;
    this.settingsOpen = true;
    this.setIdx = 0;
    this.setClearArm = false;
    renderSettings();
    SFX.tone(660, 0.06, 'square', 0.10);
  }
  closeSettings() {
    if (!this.settingsOpen) return;
    this.settingsOpen = false;
    this.setClearArm = false;
    SETTINGS.save();
    renderSettings();
    SFX.tone(440, 0.06, 'square', 0.10);
  }
  settingsMove(d) {
    const n = SET_ROWS.length;
    this.setIdx = (this.setIdx + d + n) % n;
    this.setClearArm = false;
    renderSettings();
    SFX.tone(520, 0.04, 'square', 0.07);
  }
  /* ←→：range 调值；toggle 当开关使（与 Enter 等效） */
  settingsAdjust(d) {
    const row = SET_ROWS[this.setIdx];
    if (!row) return;
    if (row.kind === 'range') this.settingsSetValue(row.id, SETTINGS[row.id] + d * 0.05);
    else if (row.kind === 'toggle') this.settingsToggle(row.id);
  }
  /* 调音量时顺手用一个音高反馈当前值 —— 耳朵比百分比数字好用 */
  settingsSetValue(id, v) {
    SETTINGS[id] = Math.max(0, Math.min(1, Math.round(v * 100) / 100));
    applyVolumes();
    SETTINGS.save();
    SFX.tone(440 + SETTINGS[id] * 440, 0.04, 'square', 0.07);
    renderSettings();
  }
  settingsToggle(id) {
    if (id === 'bgm') {
      SETTINGS.bgm = !SETTINGS.bgm;
      BGM.setGain();
      SETTINGS.save();
      SFX.tone(SETTINGS.bgm ? 880 : 330, 0.07, 'square', 0.11);
    } else if (id === 'full') {
      this.toggleFullscreen();
    }
    renderSettings();
  }
  /* Enter：toggle 翻转、button 触发（清档要连按两次，避免误触） */
  settingsTrigger() {
    const row = SET_ROWS[this.setIdx];
    if (!row) return;
    if (row.kind === 'toggle') this.settingsToggle(row.id);
    else if (row.kind === 'button' && row.id === 'clear') {
      if (this.setClearArm) {
        this.clearSave();
        this.setClearArm = false;
        SFX.thunder();
      } else {
        this.setClearArm = true;
        SFX.hurt();
      }
      renderSettings();
    }
  }
  toggleFullscreen() {
    try {
      const p = document.fullscreenElement
        ? document.exitFullscreen()
        : (document.documentElement.requestFullscreen
          ? document.documentElement.requestFullscreen() : null);
      if (p && p.catch) p.catch(() => { });   // 被拒绝时静默，不弹报错
    } catch (e) { }
  }
}

/* ---------------- 启动 ---------------- */
let Game = null;
function boot() {
  SETTINGS.load();          // 音量等偏好要在建 Game 之前读进来
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
    // 设置面板开着：按键只归面板用（方向键与空格在那里另有含义），一律不喂给游戏
    if (game.settingsOpen) { if (down) SFX.ensure(); return; }
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
    /* 设置面板：优先级最高（可能盖在三选一之上）。
       O 开合、任何界面都能用；面板内 ↑↓ 选项、←→ 调值、Enter 触发。 */
    if (game.settingsOpen) {
      if (k === 'o' || k === 'escape') game.closeSettings();
      else if (k === 'arrowup') game.settingsMove(-1);
      else if (k === 'arrowdown') game.settingsMove(1);
      else if (k === 'arrowleft') game.settingsAdjust(-1);
      else if (k === 'arrowright') game.settingsAdjust(1);
      else if (k === 'enter' || k === ' ') game.settingsTrigger();
      return;
    }
    if (k === 'o') { SFX.ensure(); game.openSettings(); return; }
    // 技能替换 / 专属升级面板：优先吃掉方向键与回车
    if (game.pick) {
      if (k === 'arrowleft') game.pickMove(-1);
      else if (k === 'arrowright') game.pickMove(1);
      else if (k === 'enter' || k === ' ' || k === 'q') game.pickConfirm();
      return;
    }
    if (game.state === 'play' && (k === 'p' || k === 'escape')) { game.togglePause(); return; }
    if (game.state === 'endlessEnd') {
      /* 结算界面：任意键（除 C/O）回标题。C 在这里不该「续前缘」——
         无尽刚把手上的进度考完，续的是另一局，会让人莫名其妙。 */
      if (k === 'o') { SFX.ensure(); game.openSettings(); return; }
      game.leaveEndless();
      return;
    }
    if (game.state === 'title') {
      // 有存档时按 C 直接续档；B 进 Boss 挑战；K 进无尽试炼；其余任意键仍是开新局
      if (k === 'c' && game.hasSave()) { game.continueGame(); return; }
      if (k === 'b') { SFX.ensure(); game.openChallMenu(); return; }
      if (k === 'k') { SFX.ensure(); game.startEndless(game.style); return; }
      game.styleIdx = 0;
      game.state = 'choose';
      SFX.ensure();
    } else if (game.state === 'chall') {
      /* 挑战菜单：三级（流派 → 魔头 → 难度），←→ / 数字切换、Enter 确认、Esc 退一层
         （键位习惯与 #pick 面板保持一致） */
      const cm = game.challMenu;
      if (!cm) return;
      const n = cm.step === 'style' ? PLAYABLE_STYLES.length
        : cm.step === 'boss' ? BOSS_KEYS.length : CHALLENGE_DIFF.length;
      const cur = cm.idx || 0;
      if (k === 'escape') game.challBack();
      else if (k === 'arrowleft') game.challPick((cur + n - 1) % n);
      else if (k === 'arrowright') game.challPick((cur + 1) % n);
      else if (k >= '1' && k <= '9') { const i = +k - 1; if (i < n) game.challPick(i); }
      else if (k === 'enter' || k === ' ') game.challConfirm();
    } else if (game.state === 'stylePick') {
      /* 风格三选一：与挑战菜单同款键位（←→ / 数字切换、Enter 确认、Esc 退）
         —— 玩家不必为「选风格」再学一套操作。 */
      const sm = game.styleMenu;
      if (!sm) return;
      const n = sm.pool.length;
      let d = 0;
      if (k === 'arrowleft' || k === 'a') d = -1;
      else if (k === 'arrowright' || k === 'd') d = 1;
      if (d) game.styleMenuMove(d);
      else if (k >= '1' && k <= '3') { const i = +k - 1; if (i < n) { sm.idx = i; sm.sel = sm.pool[i]; SFX.tone(660 + i * 110, 0.05, 'square', 0.09); updateOverlay(); } }
      else if (k === 'enter' || k === ' ') { SFX.levelup(); game.styleMenuConfirm(); }
      else if (k === 'escape' || k === 'backspace') game.styleMenuBack();
    } else if (game.state === 'fusion') {
      /* 融合面板：←→ 选件、E 取件/确认、Q 退件、Esc 退出（面板开着必能关掉）。
         Esc 与 Q 刻意分开：退材料不该把整个面板也带走。 */
      const f = game.fusion;
      if (!f) return;
      if (k === 'arrowleft' || k === 'a') game.fusionMove(-1);
      else if (k === 'arrowright' || k === 'd') game.fusionMove(1);
      else if (k === 'e' || k === 'enter' || k === ' ') game.fusionConfirm();
      else if (k === 'q') game.fusionDrop();
      else if (k === 'escape' || k === 'backspace') game.fusionBack();
    } else if (game.state === 'choose') {
      const n = Math.max(1, PLAYABLE_STYLES.length);
      if (k === 'arrowleft') { game.styleIdx = (game.styleIdx + n - 1) % n; SFX.tone(660, 0.05, 'square', 0.09); }
      else if (k === 'arrowright') { game.styleIdx = (game.styleIdx + 1) % n; SFX.tone(880, 0.05, 'square', 0.09); }
      else if (k === '1' || k === '2' || k === '3') {
        const i = +k - 1;
        if (i < n) { game.styleIdx = i; SFX.tone(660 + i * 110, 0.05, 'square', 0.09); }
      } else if (k === 'enter' || k === ' ') {
        SFX.levelup();
        /* 选完流派立刻接「开局风格三选一」——27 条路径的第一段。
           把流派先存进 pendingRunStyle：风格面板确认后才会真正 newRun，
           否则 newRun 一跑就会盖掉当前 state，面板没机会显示。 */
        game.pendingRunStyle = PLAYABLE_STYLES[game.styleIdx] || PLAYABLE_STYLES[0];
        game.openStyleMenu('first');
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
    if (document.hidden) {
      input.mouseDown = false; input.restart = false;
      // 切走就挂起音频：省电，也免得后台标签页继续出声
      if (SFX.ctx && SFX.ctx.state === 'running') SFX.ctx.suspend();
    } else if (SFX.ctx && SFX.ctx.state === 'suspended') {
      SFX.ctx.resume();
    }
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
    /* 挑战模式的进境是难度白送的，跟「斩却精英」没关系 —— 文案要跟着场景换，
       否则玩家会去找那只并不存在的精英 */
    const subNote = Game.chall
      ? '挑战加成，择一条进境（还剩 ' + Game.chall.upgrades + ' 次）'
      : '斩却精英，择一条进境';
    h += '<div class="pickTitle">专 属 · 精 进</div>'
      + '<div class="pickSub"><b>' + UD.name + '</b> Lv.' + ultLevel(U) + '　—— ' + subNote + '</div>'
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

/* Boss 挑战菜单：两级 —— 先择魔头、再择难度。
   卡片动态生成（头目表取自 BOSS_KEYS），交互与 #pick 面板一致：
   ←→ / 数字切换、Enter 确认、点卡片即选定、Esc 退一层。
   玩家此时没有 Player 实例（没开局），所以这里不复用 renderPickPanel（它依赖 Game.player）。 */
/* 风格三选一面板（#stylePick）—— 27 条路径的入口。
 * 两个时机共用一套渲染：step='first'（开局）与 'next'（每段首层）。
 * 卡片显示色板色块（用该风格该段的真实地板/主色画），
 * 让玩家在选之前就看得到「这个世界长什么样」—— 这是比文字描述更有效的说明。
 */
function renderStyleMenu() {
  const el = document.getElementById('stylePick');
  if (!el) return;
  const sm = Game && Game.styleMenu;
  if (!sm) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'flex';

  const isFirst = sm.step === 'first';
  const segIdx = isFirst ? 0 : Game.seg;               // 这一段将用第几套层段色板
  const pathCN = (Game.stylePath || []).map(k => (STYLE_DEF[k] || {}).cn || k);

  let h = '';
  h += '<div class="pickTitle">' + (isFirst ? '择 一 方 天 地' : '再 择 前 路') + '</div>';
  if (isFirst) {
    h += '<div class="pickSub">共 ' + sm.pool.length + ' 种风格　—— 每 ' + STYLE_SYS.segFloors
      + ' 层可再选一次，<b>同一风格可连选</b>（共 3 段 → 27 条路径）</div>';
  } else {
    h += '<div class="pickSub">第 <b>' + (Game.depth) + '</b> 层起进入第 <b>'
      + ['一', '二', '三'][segIdx] + '</b> 段　—— 已走过「' + (pathCN.join(' · ') || '?')
      + '」　·　再选一次</div>';
  }
  h += '<div class="pickRow">';

  sm.pool.forEach((k, i) => {
    const d = STYLE_DEF[k] || { name: k, cn: k, segs: [] };
    /* 这一段实际会用到的色板（用于色块预览） */
    const segKey = (d.segs[segIdx] || d.segs[0] || {});
    const p = STYLE_PAL[segKey.key] || STYLE_PAL.cn_1;
    const segName = segKey.cn || ('第' + (segIdx + 1) + '段');
    const isCur = k === sm.sel;
    h += '<div class="pickCard' + (i === sm.idx ? ' ' + (STYLE_PICK_SEL[i] || 'selA') : '') + '" data-i="' + i + '">'
      // 色块：三格 —— 地板 / 主色 / 描边，一眼看出这一段的冷暖
      + '<div class="swatch">'
      + '<i style="background:' + p.floor + '"></i>'
      + '<i style="background:' + p.jade + '"></i>'
      + '<i style="background:' + p.gold + '"></i>'
      + '<i style="background:' + p.red + '"></i>'
      + '</div>'
      + '<div class="nm">' + d.cn + '</div>'
      + '<div class="tag">' + d.name + '</div>'
      + '<div class="lv">' + segName + '　' + (segKey.desc || '') + '</div>'
      + '<div class="dsc">' + (STYLE_NOTE[k] || '') + '</div>'
      + '</div>';
  });
  h += '</div>';

  /* 路径预览：把「选完之后会走成什么样」画出来 —— 27 条路径的心智模型
     对玩家是抽象的，不如直接显示三段格子（已定 / 当前 / 待定）。 */
  h += '<div class="pathRow">';
  for (let s = 0; s < 3; s++) {
    const fixed = isFirst ? (s === 0 ? sm.sel : null) : (Game.stylePath[s] || (s === segIdx ? sm.sel : null));
    const cur = isFirst ? (s === 0) : (s === segIdx);
    h += '<span class="pathSeg' + (cur ? ' cur' : '') + (fixed ? ' fixed' : '') + '">'
      + (fixed ? ((STYLE_DEF[fixed] || {}).cn || fixed) : '?') + '</span>';
    if (s < 2) h += '<span class="pathArr">›</span>';
  }
  h += '<span class="pathHint">已定 ' + STYLE_SYS.segFloors + ' 层 / 段</span></div>';

  h += '<div class="pickTip"><span class="kbd">←</span><span class="kbd">→</span> 或 '
    + '<span class="kbd">1</span>~<span class="kbd">3</span> 择风格　<span class="kbd">Enter</span> 定下'
    + (isFirst ? '' : '　<span class="kbd">Esc</span> 退回上一层')
    + '</div>';

  el.innerHTML = h;
  el.querySelectorAll('.pickCard').forEach(c => {
    c.addEventListener('click', () => {
      const i = +c.getAttribute('data-i');
      const m = Game.styleMenu;
      if (m) { m.idx = i; m.sel = m.pool[i]; }
      Game.styleMenuConfirm();             // 点卡片即选定，省一步
    });
  });
}

/* 法宝图标 → <img> 用的 data URL（面板里画不了 canvas，转一次缓存住）。
   图标很小（16×16），转一次的开销可以忽略，而且只对进过面板的法宝转。 */
const ITEM_ICON_URL = {};
function itemIconURL(id) {
  if (id in ITEM_ICON_URL) return ITEM_ICON_URL[id];
  let u = '';
  try { u = ITEM_ICONS[id] ? ITEM_ICONS[id].toDataURL() : ''; } catch (e) { u = ''; }
  ITEM_ICON_URL[id] = u;
  return u;
}

/* 法宝融合面板（#fusion）—— 第 3 期的执行界面。
 * 与 #stylePick 同一套视觉语言（pickTitle / pickSub / pickTip / kbd）。
 * 三个信息层，严格按「能不能融可见、融出来是什么隐藏」分：
 *   ① 材料槽 + 产物：产物在**图鉴解锁前一律 ？？？**
 *   ② 持有法宝网格：与已选材料**有配方**的才亮（can），其余的压暗（no）
 *      ——「可融性」必须永远可见，否则 300 种组合里玩家只能盲选
 *   ③ 底部键位提示
 */
function renderFusionPanel() {
  const el = document.getElementById('fusion');
  if (!el) return;
  const f = Game && Game.fusion;
  if (!f) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'flex';

  const cnt = {};
  for (const id of Game.player.items) cnt[id] = (cnt[id] || 0) + 1;
  const recipe = Game.fusionCurrent();
  const revealed = recipe ? FusionCodex.has(recipe.id) : false;

  const slotHTML = k => {
    const id = f.slots[k];
    if (!id) return '<span class="fusSlot">' + (k === 0 ? '材料 一' : '材料 二') + '</span>';
    const v = itemView(ITEM_MAP[id] || {}, Game.style, cnt[id] - 1);
    const u = itemIconURL(id);
    return '<span class="fusSlot has">' + (u ? '<img class="ic" src="' + u + '" alt="">' : '')
      + v.name + (cnt[id] > 1 ? ' ×' + cnt[id] : '') + '</span>';
  };

  let h = '';
  h += '<div class="pickTitle">融 合 阵</div>';
  h += '<div class="pickSub">已解机缘 <b>' + FusionCodex.count() + '</b> / ' + FUSION_DEF.length
    + '　·　合而<b>不可逆</b>，两件材料从此消散</div>';

  h += '<div class="fusRow">' + slotHTML(0) + '<span class="fusArrow">＋</span>' + slotHTML(1)
    + '<span class="fusArrow">→</span>';
  if (recipe && revealed) {
    const outDef = ITEM_MAP[recipe.id] || {};
    const ou = itemIconURL(recipe.id);
    h += '<span class="fusProd">' + (ou ? '<img class="ic" src="' + ou + '" alt="">' : '')
      + itemView(outDef, Game.style, 0).name + '</span>';
  } else {
    h += '<span class="fusProd unknown">？？？</span>';
  }
  h += '</div>';

  /* 产物说明：解锁了才给内容。
     未解锁时不写任何数值 —— 这就是「首次是赌博」的那一层，
     但**可融性本身照旧可见**（网格里的高亮），所以不是纯黑箱。 */
  if (recipe && revealed) {
    h += '<div class="fusDesc">' + itemView(ITEM_MAP[recipe.id] || {}, Game.style, 0).desc + '</div>';
  } else if (recipe) {
    h += '<div class="fusDesc">未解之机缘　——　首度融成，方知其名与其效</div>';
  } else {
    h += '<div class="fusDesc">' + (f.msg || '选中两件持有之物，若有缘分自会显现') + '</div>';
  }

  h += '<div class="fusGrid">';
  f.pool.forEach((id, i) => {
    const def = ITEM_MAP[id] || {};
    const v = itemView(def, Game.style, cnt[id] - 1);
    /* can：还没选第一件时全都可选；选了之后就只亮「与它有配方」的那些。
       ⚠️ 这条判断就是「可融性可见」的落点，别为了神秘感把它一起去掉。 */
    const can = !f.slots[0] || !!fusionRecipeOf(f.slots[0], id);
    const on = f.slots[0] === id || f.slots[1] === id;
    const cls = 'fusItem' + (on ? ' on' : (can ? ' can' : ' no'));
    const u = itemIconURL(id);
    h += '<span class="' + cls + '" data-i="' + i + '">'
      + (u ? '<img class="ic" src="' + u + '" alt="">' : '')
      + v.name + (cnt[id] > 1 ? '<span class="cnt">×' + cnt[id] + '</span>' : '')
      + '</span>';
  });
  h += '</div>';

  h += '<div class="pickTip"><span class="kbd">←</span><span class="kbd">→</span> 择料　'
    + '<span class="kbd">E</span> 放入 / 确认融合　<span class="kbd">Q</span> 取回　'
    + '<span class="kbd">Esc</span> 退出</div>';

  el.innerHTML = h;
  /* 点一下即放入（与 #stylePick「点卡片即选定」同款，省一步） */
  el.querySelectorAll('.fusItem').forEach(c => {
    c.addEventListener('click', () => {
      const i = +c.getAttribute('data-i');
      const fm = Game.fusion;
      if (!fm || !fm.pool[i]) return;
      if (fm.slots[0] && !fusionRecipeOf(fm.slots[0], fm.pool[i])) {
        fm.msg = '这两件之间没有机缘';
        updateOverlay();
        return;
      }
      fm.idx = i;
      Game.fusionTake();
    });
  });
}

/* 各风格的一句话说明（面板用）。北欧 / 克苏鲁在三期填内容时补这里 */
const STYLE_NOTE = {
  cn: '青玉为骨，朱金点睛 —— 符箓、剑修与丹火的故土',
  nordic: '极北冰原与诸神黄昏（待启）',
  cthulhu: '深海旧神与理智的边缘（待启）'
};

function renderChallMenu() {
  const el = document.getElementById('chall');
  if (!el) return;
  const cm = Game && Game.challMenu;
  if (!cm) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'flex';
  let h = '';
  // 上一场的战果：挂一行，免得「我上次到底赢了没有」只能靠猜
  const rr = Game.challResult;
  if (rr) {
    const rb = BOSS_DEF[rr.bossId], rd = CHALLENGE_DIFF[rr.diffIdx], rs = STYLES[rr.style];
    h += '<div class="challResult' + (rr.win ? ' win' : ' lose') + '">'
      + (rr.win ? '◈ 斩 杀 成 功' : '◇ 道 消 身 殒')
      + '　' + (rs ? rs.name + ' · ' : '') + (rb ? rb.name : rr.bossId) + ' · ' + (rd ? rd.name : '?')
      + '　费时 ' + rr.secs + ' 秒</div>';
  }
  if (cm.step === 'style') {
    h += '<div class="pickTitle">择 一 流 派</div>'
      + '<div class="pickSub">共 ' + PLAYABLE_STYLES.length + ' 派　—— 配装与专属技都按这一派给</div>'
      + '<div class="pickRow">';
    PLAYABLE_STYLES.forEach((k, i) => {
      const st = STYLES[k] || { name: k, en: '', tag: '' };
      const ud = (typeof ULT_DEF !== 'undefined' && ULT_DEF[k]) ? ULT_DEF[k] : null;
      h += '<div class="pickCard' + (i === cm.idx ? ' selA' : '') + '" data-i="' + i + '">'
        + '<div class="nm">' + st.name + '</div>'
        + '<div class="tag">' + st.tag + '</div>'
        + '<div class="lv">' + st.en + '</div>'
        // 专属技名另起一行 —— 挤进 .lv 会在窄卡里折成两行（9.6em 宽的卡片放不下）
        + '<div class="dsc">' + (CHALL_STYLE_NOTE[k] || '')
        + (ud ? '<br>专属技「' + ud.name + '」' : '') + '</div>'
        + '</div>';
    });
    h += '</div><div class="pickTip"><span class="kbd">←</span><span class="kbd">→</span> 或 '
      + '<span class="kbd">1</span>~<span class="kbd">3</span> 择流派　<span class="kbd">Enter</span> 下一步　'
      + '<span class="kbd">Esc</span> 回标题</div>';
  } else if (cm.step === 'boss') {
    h += '<div class="pickTitle">择 一 魔 头</div>'
      + '<div class="pickSub">共 ' + BOSS_KEYS.length + ' 位　—— 越过前几层，直接开打</div>'
      + '<div class="pickRow">';
    BOSS_KEYS.forEach((k, i) => {
      const b = BOSS_DEF[k];
      /* 标「段末层」而不是「第 i+1 层」 —— Boss 现在只在段末刷（第 5/10/15 层），
         写 i+1 会变成「血魔第 1 层」这样的假信息（第 1 层根本没有魔窟）。
         注意后三位都落在第 15 层（同属第三段），所以标签会重复，这是对的。 */
      h += '<div class="pickCard' + (i === cm.idx ? ' selB' : '') + '" data-i="' + i + '">'
        + '<div class="nm">' + b.name + '</div>'
        + '<div class="tag">' + b.en + '</div>'
        + '<div class="lv">第 ' + bossFloorOf(k) + ' 层　基础血 ' + b.hp + '</div>'
        + '<div class="dsc">' + (CHALL_BOSS_NOTE[k] || '') + '</div>'
        + '</div>';
    });
    h += '</div><div class="pickTip"><span class="kbd">←</span><span class="kbd">→</span> 或 '
      + '<span class="kbd">1</span>~<span class="kbd">5</span> 择魔头　<span class="kbd">Enter</span> 下一步　'
      + '<span class="kbd">Esc</span> 返回上一步</div>';
  } else {
    const b = BOSS_DEF[cm.bossId] || BOSS_DEF[BOSS_KEYS[0]];
    const st = STYLES[cm.style] || null;
    h += '<div class="pickTitle">择 难 度</div>'
      + '<div class="pickSub">' + (st ? '<b>' + st.name + '</b>　·　' : '') + '魔头 <b>' + b.name + '</b>'
      + '　—— 难度决定配装与血量　·　挑战全程不写存档</div>'
      + '<div class="pickRow wide">';
    CHALLENGE_DIFF.forEach((x, i) => {
      h += '<div class="pickCard' + (i === cm.idx ? ' selC' : '') + '" data-i="' + i + '">'
        + '<div class="nm">' + x.name + '</div>'
        + '<div class="tag">' + x.en + '</div>'
        + '<div class="lv">法宝 ' + x.items + ' 件　·　功法 ' + x.skills + ' 个</div>'
        + '<div class="dsc">专属技 <b>Lv.' + x.ultLv + '</b><br>'
        + '魔头血量 <b>×' + x.bossMul.toFixed(1) + '</b><br>'
        + '进境手选 ' + CHALL_UPGRADES + ' 次</div>'
        + '</div>';
    });
    h += '</div><div class="pickTip"><span class="kbd">←</span><span class="kbd">→</span> 或 '
      + '<span class="kbd">1</span><span class="kbd">2</span><span class="kbd">3</span> 择难度　'
      + '<span class="kbd">Enter</span> 开战　<span class="kbd">Esc</span> 返回上一步</div>';
  }
  el.innerHTML = h;
  el.querySelectorAll('.pickCard').forEach(c => {
    c.addEventListener('click', () => {
      Game.challPick(+c.getAttribute('data-i'));
      Game.challConfirm();                // 点卡片即选定，省一步
    });
  });
}

/* 设置面板。同样走 DOM —— 画布像素字体画不了中文。
   值的显示口径收在 setRowValue() 一处，键盘与鼠标共用。 */
function setRowValue(row) {
  if (row.kind === 'range') return Math.round(SETTINGS[row.id] * 100) + '%';
  if (row.id === 'bgm') return SETTINGS.bgm ? '开' : '关';
  if (row.id === 'full') return document.fullscreenElement ? '开' : '关';
  if (row.id === 'clear') {
    if (Game && Game.setClearArm) return '再按一次确认';
    return (Game && Game.hasSave()) ? '有存档' : '无存档';
  }
  return '';
}

function renderSettings() {
  const el = document.getElementById('settings');
  if (!el) return;
  if (!Game || !Game.settingsOpen) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  const panel = document.getElementById('setPanel');
  if (!panel) return;
  let h = '';
  SET_ROWS.forEach((r, i) => {
    const cls = 'setRow' + (i === Game.setIdx ? ' sel' : '')
      + (r.id === 'clear' && Game.setClearArm ? ' warn' : '');
    h += '<div class="' + cls + '" data-i="' + i + '">'
      + '<div class="setName">' + r.name
      + (r.desc ? '<small>' + r.desc + '</small>' : '') + '</div>';
    if (r.kind === 'range') {
      const v = Math.round(SETTINGS[r.id] * 100);
      h += '<div class="setBar"><i style="width:' + v + '%"></i></div>'
        + '<div class="setVal">' + v + '%</div>';
    } else {
      h += '<div class="setVal wide">' + setRowValue(r) + '</div>';
    }
    h += '</div>';
  });
  panel.innerHTML = h;
  panel.querySelectorAll('.setRow').forEach(rowEl => {
    rowEl.addEventListener('click', e => {
      const i = +rowEl.getAttribute('data-i');
      const bar = e.target.closest ? e.target.closest('.setBar') : null;
      if (bar && SET_ROWS[i].kind === 'range') {
        // 点进度条：按横向比例取值，像真的滑条一样
        const r = bar.getBoundingClientRect();
        Game.setIdx = i;
        Game.settingsSetValue(SET_ROWS[i].id, (e.clientX - r.left) / r.width);
      } else if (Game.setIdx === i) {
        Game.settingsTrigger();          // 已选中再点一次 = 确认
      } else {
        Game.setIdx = i; Game.setClearArm = false; renderSettings();
      }
    });
  });
}

/* 无尽试炼的结算面板：击杀 / 存活 / 最高波次 三个大数字 + 历史最好成绩。
   无尽是「看分数」的玩法，所以这一屏就是它的全部产出，值得单独渲染。 */
function renderEndlessResult() {
  const el = document.getElementById('endless');
  if (!el) return;
  const S = Game && Game.endless;
  if (!S || Game.state !== 'endlessEnd') { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'flex';

  const mm = String(Math.floor(S.secs / 60)).padStart(2, '0');
  const ss = String(S.secs % 60).padStart(2, '0');
  let h = '<div class="pickTitle">无 尽 试 炼</div>'
    + '<div class="bigScore">'
    + '<div class="cell"><div class="num">' + S.kills + '</div><div class="lab">击 杀</div></div>'
    + '<div class="cell"><div class="num">' + mm + ':' + ss + '</div><div class="lab">存 活</div></div>'
    + '<div class="cell"><div class="num">' + S.wave + '</div><div class="lab">波 次</div></div>'
    + '</div>';
  if (S.bestPending) {
    h += '<div class="bestNew">◆ 新 纪 录 ◆</div>';
  }
  const b = S.best || { wave: 0, kills: 0, secs: 0 };
  const bmm = String(Math.floor(b.secs / 60)).padStart(2, '0');
  const bss = String(b.secs % 60).padStart(2, '0');
  h += '<div class="bestRow">历史最好　击杀 <b>' + b.kills + '</b>　存活 <b>' + bmm + ':' + bss
    + '</b>　第 <b>' + b.wave + '</b> 波</div>'
    + '<div class="pickTip">按任意键回标题　<span class="kbd">K</span> 再来一局</div>';
  if (el._html !== h) { el.innerHTML = h; el._html = h; }
}

function updateOverlay() {
  if (!Game) return;
  renderSettings();     // 独立于 state（可能盖在三选一或暂停之上），先渲染
  const floorName = document.getElementById('floorName');
  const hint = document.getElementById('hint');
  const card = document.getElementById('card');
  const title = document.getElementById('title');
  const choose = document.getElementById('choose');
  const chall = document.getElementById('chall');
  const endless = document.getElementById('endless');
  const stylePickEl = document.getElementById('stylePick');
  const fusionEl = document.getElementById('fusion');
  const st = document.getElementById('stats');
  /* 无尽结算：底下垫的是标题背景，所以要把标题也藏掉，
     否则「九劫录」三个大字会和分数叠在一起。 */
  if (Game.state === 'endlessEnd') {
    title.style.display = 'none';
    if (choose) choose.style.display = 'none';
    if (chall) chall.style.display = 'none';
    renderEndlessResult();
    floorName.textContent = ''; hint.textContent = ''; card.style.display = 'none';
    st.textContent = '';
    return;
  }
  if (endless) endless.style.display = 'none';
  /* 风格三选一：与挑战菜单同样「垫标题背景、不画 HUD」 */
  if (Game.state === 'stylePick') {
    title.style.display = 'none';
    if (choose) choose.style.display = 'none';
    if (chall) chall.style.display = 'none';
    renderStyleMenu();
    floorName.textContent = ''; hint.textContent = ''; card.style.display = 'none';
    st.textContent = '';
    return;
  }
  if (stylePickEl) stylePickEl.style.display = 'none';
  /* 融合面板：与风格三选一同样「垫标题背景、不画 HUD」 */
  if (Game.state === 'fusion') {
    title.style.display = 'none';
    if (choose) choose.style.display = 'none';
    if (chall) chall.style.display = 'none';
    renderFusionPanel();
    floorName.textContent = ''; hint.textContent = ''; card.style.display = 'none';
    st.textContent = '';
    return;
  }
  if (fusionEl) fusionEl.style.display = 'none';
  /* 挑战菜单：不画 HUD、也不显示楼层名 —— 底下垫的是标题画面的背景 */
  if (Game.state === 'chall') {
    title.style.display = 'none';
    if (choose) choose.style.display = 'none';
    if (chall) chall.style.display = 'flex';
    renderChallMenu();
    floorName.textContent = ''; hint.textContent = ''; card.style.display = 'none';
    st.textContent = '';
    return;
  }
  if (chall) chall.style.display = 'none';
  if (Game.state === 'title') {
    title.style.display = 'flex';
    if (choose) choose.style.display = 'none';
    // 有存档才挂出「续前缘」的入口
    const saveTip = document.getElementById('saveTip');
    if (saveTip) saveTip.style.display = Game.hasSave() ? 'block' : 'none';
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
        /* 用 '' 而不是 'block' 交回 CSS —— .pickCard 是 flex 列，
           内联 block 会让描述区的 flex:1 + overflow-y:auto 全部失效，
           舞剑流那种长说明就会撑破卡片（2026-09-17 的界面问题）。 */
        c.style.display = '';
        c.className = 'pickCard' + (Game.styleIdx === i ? ' ' + (PICK_SEL[i] || 'selA') : '');
      }
    }
    floorName.textContent = ''; hint.textContent = ''; card.style.display = 'none';
    st.textContent = '';
    return;
  }
  title.style.display = 'none';
  if (choose) choose.style.display = 'none';
  /* 无尽试炼：没有楼层这回事，顶栏改报波次 —— 否则会显示「第一层 · 石室」，
     而玩家明明是在一个封闭擂台里。 */
  if (Game.endless) {
    floorName.textContent = '无尽试炼 · 第 ' + Game.endless.wave + ' 波';
    floorName.style.color = '#c9a6ff';
  } else {
    const depthCN = cnNum(Game.depth);
    const elKey = Game.room && Game.room.elite;
    /* 风格地图：顶栏挂上「当前风格 · 第几段」——27 条路径的机制对玩家是隐形的，
       不显示就等于没有。用简写（中/北/克 + 段号）避免挤占楼层名的宽度。 */
    const sKey = (Game.stylePath || [])[Game.seg] || 'cn';
    const sDef = STYLE_DEF[sKey] || {};
    const sTag = sDef.cn ? (sDef.cn.charAt(0) + '·' + ['一', '二', '三'][Game.seg]) : '';
    floorName.textContent = '第' + depthCN + '层 · ' + (ROOM_LABEL[Game.room.type] || '石室')
      + (elKey ? ' · 精英' : '') + (sTag ? '　' + sTag : '');
    floorName.style.color = elKey ? '#ff9d8a' : '';
  }

  let h = '';
  if (Game.shopHint) h = Game.coins >= Game.shopHint.price
    ? '按 E 购买（' + Game.shopHint.price + ' 灵石）'
    : '灵石不足 —— 需 ' + Game.shopHint.price + '，现有 ' + Game.coins;
  else if (Game.pickHint) h = '按 E 选取这件法宝（另一件随之消散）';
  else if (Game.altarHint) h = '按 E 献祭 1 点气血，换取机缘';
  else if (Game.forgeHint) h = '融合阵 —— 按 E 引动　两件有缘分的法宝，合而为一';
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
