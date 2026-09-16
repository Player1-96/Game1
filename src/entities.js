'use strict';
/* ============================================================
 *  entities.js —— 玩家 / 妖物 / BOSS / 飞剑 / 拾取物 / 特效
 * ============================================================ */

const WALL_L = TILE + 2, WALL_T = TILE + 2;
const WALL_R = ROOM_W - TILE - 2, WALL_B = ROOM_H - TILE - 2;

/* ------------------------------------------------------------
 *  出生保护：妖物现身后有一段「凝形」时间，
 *  期间从地面浮现、不造成接触伤害，避免刷新瞬间贴脸扣血
 * ---------------------------------------------------------- */
const SPAWN_GRACE = 42;        // 普通妖物
const SPAWN_GRACE_BOSS = 75;   // 头目（出场更从容）
const SPAWN_SAFE_DIST = 88;    // 出生点与玩家的最小安全距离
const PERK_WINDUP = 34;        // 精英环形技的前摇帧数（贴身时也留出躲位时间）
/* 头目一阶段的软时限：45 秒还没打掉三分之一血就强制转入二阶段。
   一阶段的爪牙是按 280 帧一批无限召唤的，没有这条线，玩家可以不打 Boss、
   赖在召唤阶段里刷爪牙 —— 而爪牙既掉灵力珠，又吃「剑意不绝」的击杀返还冷却，
   于是变成一个「我不想输就不会输」的龟缩洞。时限从凝形结束才开始计。 */
const BOSS_P1_LIMIT = 45 * 60;

/* 凝形法阵：出生保护期内在脚下旋转的召唤阵 */
/* 精英光环：脚下常驻的旋转符阵，颜色随精英种类 */
function drawEliteAura(g, x, y, r, col, t) {
  g.save();
  g.globalAlpha = 0.32 + Math.sin(t * 0.09) * 0.1;
  g.strokeStyle = col; g.lineWidth = 1;
  const rad = r * 1.45;
  g.beginPath(); g.ellipse(x, y, rad, rad * 0.42, 0, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.ellipse(x, y, rad * 0.6, rad * 0.25, 0, 0, Math.PI * 2); g.stroke();
  g.globalAlpha = 0.78; g.fillStyle = col;
  const a0 = t * 0.032;
  for (let i = 0; i < 6; i++) {
    const a = a0 + i * Math.PI / 3;
    g.fillRect((x + Math.cos(a) * rad) | 0, (y + Math.sin(a) * rad * 0.42) | 0, 2, 2);
  }
  g.restore();
}

function drawSpawnRune(g, x, y, r, t, total, col) {
  const k = clamp(t / total, 0, 1);          // 1 → 0
  g.save();
  g.globalAlpha = 0.85 * k;
  g.strokeStyle = col; g.lineWidth = 1;
  const rad = r * (1.35 - 0.35 * k);
  g.beginPath(); g.ellipse(x, y + r * 0.85, rad, rad * 0.42, 0, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.ellipse(x, y + r * 0.85, rad * 0.6, rad * 0.26, 0, 0, Math.PI * 2); g.stroke();
  // 四枚旋转的符点
  const a0 = (1 - k) * Math.PI * 1.6;
  for (let i = 0; i < 4; i++) {
    const a = a0 + i * Math.PI / 2;
    g.fillStyle = col;
    g.fillRect((x + Math.cos(a) * rad) | 0, (y + r * 0.85 + Math.sin(a) * rad * 0.42) | 0, 2, 2);
  }
  g.restore();
}

/* ------------------------------------------------------------
 *  工具
 * ---------------------------------------------------------- */
function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
function circleHit(ax, ay, ar, bx, by, br) {
  return dist2(ax, ay, bx, by) < (ar + br) * (ar + br);
}

/* ------------------------------------------------------------
 *  巨剑流 · 蓄力参数（60fps 下的帧数）
 *  t1 = 一段蓄力阈值，t2 = 二段蓄力阈值，max = 蓄力上限
 *  每提高一段：穿透数 ↑、剑身宽度 ↑、飞行距离 ↑
 * ---------------------------------------------------------- */
const CHARGE = { t1: 30, t2: 66, max: 104 };
const CHARGE_TIER = [
  // pierce = 可穿透的妖物数；r = 碰撞半径（视觉宽度亦随之放大）；life = 飞行帧数（即飞行距离）
  // cd = 出剑后摇帧数。段位越高后摇越短（蓄力时间已付出），点射后摇最重以杜绝连点刷特效
  { pierce: 1, r: 7, life: 34, scale: 0.85, dmgMul: 1.0, cd: 30, name: '点射' },
  { pierce: 3, r: 11, life: 54, scale: 1.35, dmgMul: 1.7, cd: 20, name: '一段' },
  { pierce: 8, r: 16, life: 78, scale: 2.0, dmgMul: 2.8, cd: 10, name: '二段' }
];
/* 根据蓄力帧数返回当前段位 0 / 1 / 2 */
function chargeTier(t) { return t >= CHARGE.t2 ? 2 : (t >= CHARGE.t1 ? 1 : 0); }

/* ------------------------------------------------------------
 *  剑影三叠的伤害口径
 *  stage：0 一段 / 1 二段 / 2 三段
 *  · 二段在一段基础上 +20%
 *  · 三段在二段基础上「必定暴击」（×2），由 guaranteed 传入
 *  · 升级路线「剑锋凌厉」再乘一层（+20% / +40% / +60%）
 * ---------------------------------------------------------- */
function wjDamage(pl, stage, guaranteed) {
  const s = pl.stats;
  const soul = pl.soulBuff > 0 ? 1.2 + Math.max(0, s.soul - 1) * 0.9 : 0;
  let d = (s.damage + soul) * WJ.dmgMul * (1 + (pl.buffs.dmgMul || 0))
        * (1 + ultPathVal(pl.ult, 'wujian', 'power'));
  if (stage >= 1) d *= WJ.s2Mul;
  const crit = !!guaranteed || Math.random() < (s.crit || 0);
  if (crit) d *= 2;
  return { dmg: d, crit: crit };
}

/* ------------------------------------------------------------
 *  照影（玄元镜在舞剑流下的形态）
 *  被剑罡斩中的术法不再湮灭，而是掉头打回去 —— 弹幕越密，回敬越狠。
 *  · 一、二阶只是一记 180° 的原路回敬：术法从哪来就回哪去，敌人挪了位就打空
 *  · 三阶「照影如潮」才补上自导，方向改取最近的妖物（这是三阶的卖点）
 *  · 伤害按玩家伤害折算，镜阶越高回得越重（1 阶 ×1.3 → 3 阶 ×2.3）
 * ---------------------------------------------------------- */
function reflectBullet(b, pl, g) {
  const s = pl.stats;
  const seek = s.reflect >= 3;                    // 只有满阶才追敌
  const t = seek ? g.nearestEnemy(b.x, b.y, 320, null) : null;
  const a = t ? Math.atan2(t.y - b.y, t.x - b.x) : Math.atan2(-b.vy, -b.vx);
  const sp = Math.max(6, Math.hypot(b.vx, b.vy) * 1.5);
  b.friendly = true;
  b.reflected = true;
  b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
  b.dmg = s.damage * (0.8 + 0.5 * s.reflect);
  b.crit = Math.random() < (s.crit || 0);
  b.pierce = Math.max(b.pierce, s.reflect - 1);   // 镜阶越高，回敬的术法穿得越多
  b.knockback = Math.max(b.knockback, 2.5);
  if (seek) b.homing = Math.max(b.homing, 0.05);
  b.hit.clear();
  b.life = Math.max(b.life, 100);
  g.burst(b.x, b.y, 8, PAL.cyan);
}

/* ------------------------------------------------------------
 *  粒子
 * ---------------------------------------------------------- */
class Particle {
  constructor(x, y, vx, vy, life, col, size, grav) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.max = life; this.col = col;
    this.size = size || 2; this.grav = grav || 0;
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    this.vy += this.grav; this.vx *= 0.96; this.vy *= 0.96;
    if (--this.life <= 0) this.dead = true;
  }
  draw(g) {
    const t = this.life / this.max;
    g.globalAlpha = clamp(t * 1.4, 0, 1);
    g.fillStyle = this.col;
    const s = Math.max(1, Math.round(this.size * (0.4 + t * 0.6)));
    g.fillRect(this.x | 0, this.y | 0, s, s);
    g.globalAlpha = 1;
  }
}
class Floater {
  constructor(x, y, text, col) { this.x = x; this.y = y; this.text = text; this.col = col || PAL.gold; this.life = 50; }
  update() { this.y -= 0.5; if (--this.life <= 0) this.dead = true; }
  draw(g) {
    g.globalAlpha = clamp(this.life / 25, 0, 1);
    drawPixelText(g, this.text, this.x - this.text.length * 3, this.y, 1, this.col);
    g.globalAlpha = 1;
  }
}

/* ------------------------------------------------------------
 *  伤害数字
 *  · 普通命中：一枚清色小字，短促上浮 —— 只报数，不抢戏
 *  · 暴击：朱红大字（2 倍点阵）+ 八向黑描边 + 命中环 + 出场白光 +
 *    开头几帧的高频抖动，最后缀一个「!」。
 *    满屏弹幕里一眼就能认出「这一下打实了」，爽感全押在这几帧上。
 *  位移与缩放全取整，缩放在点阵 scale 上跳变，不做平滑插值 ——
 *  这个引擎是真像素风，半像素的软边比不够丝滑更容易看出来。
 * ---------------------------------------------------------- */
class DamageNum {
  constructor(x, y, val, crit) {
    this.crit = !!crit;
    this.text = String(Math.max(1, Math.round(val))) + (this.crit ? '!' : '');
    this.x = x + (Math.random() - 0.5) * (this.crit ? 6 : 5);
    this.y = y - (this.crit ? 10 : 5);
    this.vx = (Math.random() - 0.5) * (this.crit ? 1.9 : 0.9);
    this.vy = this.crit ? -2.3 : -1.2;
    this.grav = this.crit ? 0.10 : 0.055;
    this.life = this.crit ? 44 : 26;
    this.max = this.life;
    this.seed = Math.random() * Math.PI * 2;
    this.dead = false;
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    this.vy += this.grav; this.vx *= 0.9;
    if (--this.life <= 0) this.dead = true;
  }
  draw(g) {
    const t = 1 - this.life / this.max;            // 0 → 1
    const s = this.crit ? 2 : 1;
    const tw = this.text.length * 6 * s - s;       // 整串字的像素宽，用于居中
    const a = this.life < 7 ? this.life / 7 : 1;
    // 抖动：只有暴击有，且只在前几帧；整数量化，像素不会糊
    const jt = this.crit ? Math.max(0, 1 - t * 3.2) : 0;
    const jx = jt ? Math.round(Math.sin(this.life * 1.9 + this.seed) * 1.6 * jt) : 0;
    const jy = jt ? Math.round(Math.cos(this.life * 2.3 + this.seed) * 1.1 * jt) : 0;
    const px = Math.round(this.x) - (tw >> 1) + jx;
    const py = Math.round(this.y) + jy;
    g.save();
    g.globalAlpha = a;
    if (this.crit) {
      // 命中环：收得比数字快，像是被这一击震出来的
      const k = Math.min(1, t / 0.3);
      g.globalAlpha = a * (1 - k) * 0.9;
      g.strokeStyle = PAL.redL; g.lineWidth = Math.max(1, 3 * (1 - k));
      g.beginPath(); g.arc(this.x, Math.round(this.y) + 3.5 * s, 5 + k * 24, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = a;
    }
    // 描边：暴击八向加粗，普通只压一道底边 —— 压在艳色弹幕上也读得出
    if (this.crit) {
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        if (!ox && !oy) continue;
        drawPixelText(g, this.text, px + ox, py + oy, s, PAL.ink);
      }
    } else {
      drawPixelText(g, this.text, px, py + 1, s, PAL.ink);
    }
    // 主体：暴击头几帧先闪一道白光，再落成朱红
    const flash = this.crit && this.life > this.max - 4;
    drawPixelText(g, this.text, px, py, s, flash ? PAL.white : (this.crit ? PAL.red : PAL.jadeL));
    g.restore();
  }
}

/* ------------------------------------------------------------
 *  飞剑 / 术法
 * ---------------------------------------------------------- */
class Bullet {
  constructor(x, y, vx, vy, opt) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.friendly = !!opt.friendly;
    this.dmg = opt.dmg || 1;
    this.r = opt.r || 5;
    this.life = opt.life || 150;
    this.pierce = opt.pierce || 0;
    this.homing = opt.homing || 0;
    this.knockback = opt.knockback || 0;
    this.burn = opt.burn || 0;
    this.frost = opt.frost || 0;
    this.chain = opt.chain || 0;
    this.crit = opt.crit || false;
    this.deflect = opt.deflect || 0;
    this.kind = opt.kind || 'sword';
    this.sprite = opt.sprite || SPR.sword;
    this.reflected = false;      // 被「照影」打回去的术法：加一圈青光以便和敌弹区分
    this.hit = new Set();
    this.dead = false;
    this.spin = 0;
    this.scale = opt.scale || 1;
    this.trail = [];
  }
  update(g) {
    if (this.homing > 0 && this.friendly) {
      // 只追「还没打过」的目标：否则飞剑会绕着已命中的妖物打转，看着像空转却不掉血
      const R = (g.player && g.player.stats.homingRange) || 220;
      const t = g.nearestEnemy(this.x, this.y, R, this.hit);
      if (t) {
        const a = Math.atan2(t.y - this.y, t.x - this.x);
        const cur = Math.atan2(this.vy, this.vx);
        let d = a - cur;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const na = cur + clamp(d, -this.homing, this.homing);
        const sp = Math.hypot(this.vx, this.vy);
        this.vx = Math.cos(na) * sp; this.vy = Math.sin(na) * sp;
      }
    }
    this.x += this.vx; this.y += this.vy;
    this.spin += 0.4;
    this.trail.push(this.x, this.y);
    if (this.trail.length > 8) this.trail.splice(0, 2);
    if (--this.life <= 0) this.dead = true;
    // 撞墙（裂缝墙例外：飞剑要能打到裂缝判定区）
    if (this.x < WALL_L || this.x > WALL_R || this.y < WALL_T || this.y > WALL_B) {
      if (!this.friendly || g.crackHitDir(this) < 0) { this.dead = true; g.burst(this.x, this.y, 4, this.friendly ? PAL.jade : PAL.red); }
    }
    // 撞障碍
    for (const o of g.room.obstacles) {
      if (aabb(this.x - 2, this.y - 2, 4, 4, o.x, o.y, o.w, o.h)) {
        this.dead = true; g.burst(this.x, this.y, 5, PAL.stoneHi); return;
      }
    }
    if (this.friendly) {
      for (const e of g.enemies) {
        if (e.dead || this.hit.has(e)) continue;
        if (!circleHit(this.x, this.y, this.r, e.x, e.y, e.r)) continue;
        this.hit.add(e);
        let dmg = this.dmg * (this.crit ? 2 : 1);
        e.hurt(dmg, g, this);
        if (this.knockback) {
          const a = Math.atan2(e.y - this.y, e.x - this.x);
          e.kbx += Math.cos(a) * this.knockback; e.kby += Math.sin(a) * this.knockback;
        }
        // 玄冰符可进阶：阶数越高冻得越久
        if (this.frost) e.frost = Math.max(e.frost, 70 + this.frost * 35);
        if (this.burn) e.burn = Math.max(e.burn, 120), e.burnDmg = this.burn;
        if (this.chain) g.chainLightning(e, this.dmg * 0.6, this.chain);
        g.burst(this.x, this.y, 6, this.crit ? PAL.gold : PAL.jadeL);
        if (this.pierce-- <= 0) { this.dead = true; return; }
      }
      if (this.deflect) {
        // 玄元镜可进阶：阶数越高，击落范围越大
        const dr = this.r + 2 + this.deflect * 4;
        for (const b of g.bullets) {
          if (b.friendly || b.dead) continue;
          if (circleHit(this.x, this.y, dr, b.x, b.y, b.r)) { b.dead = true; g.burst(b.x, b.y, 6, PAL.cyan); }
        }
      }
    } else {
      const p = g.player;
      if (!p.dead && circleHit(this.x, this.y, this.r, p.x, p.y, p.r)) {
        this.dead = true;
        p.takeDamage(1, g);
        g.burst(this.x, this.y, 8, PAL.red);
      }
    }
  }
  draw(g2) {
    const s = this.sprite;
    if (this.reflected) {
      // 照影：被打回去的术法裹一圈脉动青光，免得跟敌弹看混
      const k = 1 + Math.sin(this.spin * 0.8) * 0.18;
      g2.save();
      g2.globalAlpha = 0.30;
      g2.fillStyle = PAL.cyan;
      g2.beginPath(); g2.arc(this.x, this.y, this.r * 1.15 * k, 0, Math.PI * 2); g2.fill();
      g2.globalAlpha = 0.65;
      g2.strokeStyle = PAL.cyan; g2.lineWidth = 1;
      g2.beginPath(); g2.arc(this.x, this.y, this.r * 1.6 * k, 0, Math.PI * 2); g2.stroke();
      g2.restore();
    }
    if (this.kind === 'sword' || this.kind === 'jujian' || this.kind === 'rift') {
      const hw = s.width / 2, hh = s.height / 2;
      const ang = Math.atan2(this.vy, this.vx);
      if (this.kind === 'rift') {
        // 剑气斩击波：身后拖一道青色残迹，看着像劈开的空气
        const len = 16;
        const bx = this.x - Math.cos(ang) * len, by = this.y - Math.sin(ang) * len;
        g2.save();
        g2.globalAlpha = 0.4;
        g2.strokeStyle = PAL.cyan; g2.lineWidth = 2;
        g2.beginPath(); g2.moveTo(bx, by); g2.lineTo(this.x, this.y); g2.stroke();
        g2.restore();
      }
      if (this.kind === 'jujian') {
        // 巨剑：身后拖一抹青玉剑气，段位越高越浓
        const len = 20 * this.scale;
        const bx = this.x - Math.cos(ang) * len, by = this.y - Math.sin(ang) * len;
        const nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
        const w = 2.5 * this.scale;
        g2.save();
        g2.globalAlpha = 0.42;
        g2.fillStyle = PAL.jade;
        g2.beginPath();
        g2.moveTo(this.x + nx * w, this.y + ny * w);
        g2.lineTo(bx, by);
        g2.lineTo(this.x - nx * w, this.y - ny * w);
        g2.closePath(); g2.fill();
        g2.globalAlpha = 0.7;
        g2.strokeStyle = PAL.jadeL; g2.lineWidth = 1;
        g2.beginPath(); g2.moveTo(this.x, this.y); g2.lineTo(bx, by); g2.stroke();
        g2.restore();
      }
      g2.save();
      g2.translate(this.x, this.y);
      g2.rotate(ang);
      g2.scale(this.scale, this.scale);
      g2.drawImage(s, -hw, -hh);
      g2.restore();
    } else {
      const k = 1 + Math.sin(this.spin * 0.6) * 0.08;
      g2.drawImage(s, this.x - s.width * k / 2, this.y - s.height * k / 2, s.width * k, s.height * k);
    }
  }
}

/* ------------------------------------------------------------
 *  雷符（可放置的爆破物）
 * ---------------------------------------------------------- */
class Bomb {
  constructor(x, y) {
    this.x = x; this.y = y; this.r = 7;
    this.fuse = 84;                    // 1.4 秒引信
    this.t = 0; this.dead = false;
  }
  update(g) {
    this.t++;
    if (--this.fuse <= 0) { this.dead = true; g.detonate(this.x, this.y); }
  }
  draw(g2) {
    const k = 1 - this.fuse / 84;
    g2.save();
    // 引信光环：越接近爆炸收缩越快
    g2.globalAlpha = 0.2 + Math.sin(this.t * 0.35) * 0.12;
    g2.strokeStyle = PAL.red; g2.lineWidth = 1;
    g2.beginPath(); g2.arc(this.x, this.y, 10 - k * 5, 0, Math.PI * 2); g2.stroke();
    g2.globalAlpha = 1;
    g2.drawImage(SPR.bomb, this.x - 7, this.y - 7, 14, 14);
    if (this.fuse < 30 && Math.floor(this.fuse / 4) % 2 === 0) {
      g2.globalAlpha = 0.55; g2.fillStyle = PAL.white;
      g2.fillRect(this.x - 7, this.y - 7, 14, 14);
      g2.globalAlpha = 1;
    }
    g2.restore();
  }
}

/* ------------------------------------------------------------
 *  地面危险（毒雾 / 骨雨预警 / 地刺）
 * ---------------------------------------------------------- */
class Hazard {
  constructor(x, y, r, warn, life, dmg, col, friendly) {
    this.x = x; this.y = y; this.r = r; this.warn = warn; this.life = life;
    this.dmg = dmg; this.col = col || PAL.red; this.friendly = !!friendly;
    this.t = 0; this.dead = false; this.hitCd = 0;
  }
  update(g) {
    this.t++;
    if (this.hitCd > 0) this.hitCd--;
    if (this.t > this.warn + this.life) { this.dead = true; return; }
    if (this.t > this.warn && this.hitCd <= 0) {
      if (this.friendly) {
        for (const e of g.enemies) {
          if (!e.dead && circleHit(this.x, this.y, this.r, e.x, e.y, e.r)) { e.hurt(this.dmg / 12, g, 'dot'); }
        }
      } else {
        const p = g.player;
        if (!p.dead && circleHit(this.x, this.y, this.r * 0.8, p.x, p.y, p.r)) { p.takeDamage(this.dmg, g); this.hitCd = 20; }
      }
    }
  }
  draw(g2) {
    const t = this.t;
    if (t <= this.warn) {
      const k = t / this.warn;
      g2.save();
      g2.globalAlpha = 0.35 + 0.35 * Math.sin(t * 0.35);
      g2.strokeStyle = this.col; g2.lineWidth = 2;
      g2.beginPath(); g2.arc(this.x, this.y, this.r * (0.4 + 0.6 * k), 0, Math.PI * 2); g2.stroke();
      g2.globalAlpha = 0.18; g2.fillStyle = this.col; g2.fill();
      g2.restore();
    } else {
      const k = (t - this.warn) / this.life;
      g2.save();
      g2.globalAlpha = (1 - k) * 0.75;
      g2.fillStyle = this.col;
      g2.beginPath(); g2.arc(this.x, this.y, this.r * (0.5 + 0.6 * Math.min(1, k * 3)), 0, Math.PI * 2); g2.fill();
      g2.globalAlpha = (1 - k) * 0.9; g2.strokeStyle = '#fff'; g2.lineWidth = 1;
      g2.beginPath(); g2.arc(this.x, this.y, this.r * (0.5 + 0.6 * Math.min(1, k * 3)), 0, Math.PI * 2); g2.stroke();
      g2.restore();
    }
  }
}

/* ------------------------------------------------------------
 *  斩击刃光（舞剑流的近战表现）
 *  伤害在挥砍那一帧即时结算，这个对象只负责把「剑扫过去的弧」
 *  画出来：弧线由窄变宽、由亮转淡，扫完即散。
 * ---------------------------------------------------------- */
class Slash {
  constructor(x, y, a, arc, reach, opt) {
    const o = opt || {};
    this.x = x; this.y = y; this.a = a;
    this.arc = arc; this.reach = reach;
    this.col = o.col || PAL.jadeL;
    this.life = o.life || 11; this.max = this.life;
    this.wide = o.wide || (o.crit ? 3 : 2);
    this.crit = !!o.crit;
    this.spin = o.spin || 0;          // >0 时刃光自身旋转（五连斩用）
    this.sweep = !!o.sweep;           // true = 刃光沿瞄准方向扫出（平A 用），否则整条弧一起亮
    this.dead = false;
  }
  update() { if (--this.life <= 0) this.dead = true; }
  draw(g2) {
    const k = 1 - this.life / this.max;              // 0 起手 → 1 将散
    const R = this.reach * (0.82 + 0.22 * k);
    g2.save();
    g2.globalAlpha = (1 - k) * 0.9;
    g2.strokeStyle = this.col; g2.lineWidth = this.wide;
    if (this.sweep) {
      /* 剑扫出来的轨迹：刃光只画「已经扫过」的那一段，
         前 3/4 的时间由起手角扫到收势角，尾巴跟着剑尖走，最后淡掉。
         这样挥剑的像素动作和刃光才对得上，而不是凭空炸开一圈光。 */
      const a0 = this.a - this.arc / 2, a1 = this.a + this.arc / 2;
      const p = Math.min(1, k * 1.35);
      const head = a0 + (a1 - a0) * p;
      const tail = a0 + (a1 - a0) * Math.max(0, p - 0.55);
      g2.beginPath(); g2.arc(this.x, this.y - 2, R, tail, head); g2.stroke();
      g2.globalAlpha = (1 - k) * 0.55; g2.lineWidth = 1;
      g2.strokeStyle = this.crit ? PAL.goldL : PAL.white;
      g2.beginPath(); g2.arc(this.x, this.y - 2, R * 0.88, tail, head); g2.stroke();
    } else {
      const arc = this.arc * (0.55 + 0.45 * k);      // 刃光由窄变宽
      const a = this.a + this.spin * k;
      const a0 = a - arc / 2, a1 = a + arc / 2;
      g2.beginPath(); g2.arc(this.x, this.y - 2, R, a0, a1); g2.stroke();
      g2.globalAlpha = (1 - k) * 0.55; g2.lineWidth = 1;
      g2.strokeStyle = this.crit ? PAL.goldL : PAL.white;
      g2.beginPath(); g2.arc(this.x, this.y - 2, R * 0.8, a0, a1); g2.stroke();
    }
    g2.restore();
  }
}

/* ------------------------------------------------------------
 *  妖物
 * ---------------------------------------------------------- */
const ENEMY_DEF = {
  xiesui: { hp: 12, speed: 1.35, r: 7, touch: 1, coins: 1, spr: 'xiesui', ai: 'chase', size: 14, score: 10 },
  chanchu: { hp: 18, speed: 0.45, r: 8, touch: 1, coins: 2, spr: 'chanchu', ai: 'spit', size: 18, score: 14 },
  xuefu: { hp: 10, speed: 1.1, r: 7, touch: 1, coins: 1, spr: 'xuefu', ai: 'dash', size: 18, score: 12 },
  guixiu: { hp: 16, speed: 0.8, r: 7, touch: 1, coins: 2, spr: 'guixiu', ai: 'caster', size: 16, score: 18 },
  yinsha: { hp: 10, speed: 1.0, r: 7, touch: 1, coins: 1, spr: 'yinsha', ai: 'hop', size: 16, score: 10, split: true },
  shikui: { hp: 34, speed: 0.62, r: 8, touch: 2, coins: 3, spr: 'shikui', ai: 'chase', size: 16, score: 24 },
  jianling: { hp: 14, speed: 1.0, r: 7, touch: 1, coins: 2, spr: 'jianling', ai: 'caster2', size: 16, score: 20 }
};

/* ------------------------------------------------------------
 *  精英妖物：以小怪为基底强化，各带一门专属神通与死后余祸。
 *  每层随机挑一间石室作为精英窟，灵石产出是普通石室的 2~3 倍。
 *  base   = 基底小怪（决定外形与常规 AI）
 *  hpMul  = 血量倍率；spdMul = 移速倍率；scale = 视觉放大
 *  perk   = 专属神通；perkCd = 神通冷却帧数
 * ---------------------------------------------------------- */
const ELITE_DEF = {
  xiesha: {
    name: '血煞厉鬼', en: 'BLOOD', base: 'shikui', perk: 'blood',
    hpMul: 3.0, spdMul: 0.85, scale: 1.5, rMul: 1.5, coins: 9, score: 70,
    aura: PAL.red, perkCd: 150, desc: '受创减免四成；周身喷薄血箭，死后化血雾'
  },
  youyan: {
    name: '幽焰鬼修', en: 'FLAME', base: 'guixiu', perk: 'volley',
    hpMul: 2.5, spdMul: 1.0, scale: 1.45, rMul: 1.45, coins: 10, score: 75,
    aura: PAL.fire, perkCd: 120, desc: '符箓三连发并附带灼烧，死后留下火圈'
  },
  jiying: {
    name: '疾影血蝠', en: 'RUSH', base: 'xuefu', perk: 'rush',
    hpMul: 2.2, spdMul: 1.4, scale: 1.45, rMul: 1.45, coins: 9, score: 72,
    aura: PAL.purpleL, perkCd: 80, desc: '瞬影突进，来去无踪'
  },
  wandu: {
    name: '万毒蟾尊', en: 'VENOM', base: 'chanchu', perk: 'venom',
    hpMul: 3.4, spdMul: 0.8, scale: 1.6, rMul: 1.6, coins: 11, score: 80,
    aura: PAL.green, perkCd: 135, desc: '毒弹落地成沼，死后毒雾弥漫'
  },
  duannian: {
    name: '剑灵·断念', en: 'SWORD', base: 'jianling', perk: 'swarm',
    hpMul: 2.7, spdMul: 1.05, scale: 1.5, rMul: 1.5, coins: 12, score: 85,
    aura: PAL.gold, perkCd: 145, desc: '环形剑气，并召小剑灵助战'
  }
};
const ELITE_KEYS = Object.keys(ELITE_DEF);

class Enemy {
  constructor(type, x, y, hpScale, eliteKey) {
    const d = ENEMY_DEF[type];
    this.type = type;
    const E = eliteKey ? ELITE_DEF[eliteKey] : null;
    this.eliteKey = E ? eliteKey : null;
    this.elite = E;
    // 精英：复制一份 def 再改，绝不污染共享的 ENEMY_DEF
    this.def = E ? Object.assign({}, d, { coins: E.coins, score: E.score, touch: d.touch }) : d;
    this.x = x; this.y = y;
    this.r = E ? Math.round(d.r * E.rMul) : d.r;
    this.maxHp = Math.round(d.hp * (hpScale || 1) * (E ? E.hpMul : 1));
    this.hp = this.maxHp;
    this.eCd = E ? SPAWN_GRACE + 60 : 0;      // 神通冷却，同样要晚于凝形
    this.perkT = 0;                           // 环形技前摇倒计时（>0 时正在蓄势）
    this.speed = d.speed * (E ? E.spdMul : 1) * (0.9 + Math.random() * 0.25);
    this.vx = 0; this.vy = 0; this.kbx = 0; this.kby = 0;
    this.t = Math.floor(Math.random() * 100);
    // 首次出手必须晚于凝形结束，避免刚现身就开火
    this.cd = SPAWN_GRACE + 40 + Math.floor(Math.random() * 60);
    this.spawnT = SPAWN_GRACE;   // 凝形倒计时
    this.state = 0; this.stateT = 0;
    this.dead = false; this.frost = 0; this.burn = 0; this.burnDmg = 0;
    this.flash = 0; this.frame = 0;
    this.shadow = true;
    this.facing = 1;
  }
  hurt(dmg, g, src, crit) {
    if (this.dead) return;
    // 血煞厉鬼：受创减免四成
    if (this.elite && this.elite.perk === 'blood') dmg *= 0.6;
    this.hp -= dmg;
    this.flash = 6;
    // 持续伤害（尸毒 / 燃烧）每数帧触发一次，若照样报数会糊满屏幕，故整类跳过。
    // 暴击与否：优先用调用方显式给的，其次认来源对象上的 crit 标记。
    if (dmg > 0 && src !== 'dot') {
      g.addDamageNum(this.x, this.y - this.r - 4, dmg,
        crit != null ? crit : !!(src && src.crit));
    }
    if (this.hp <= 0) this.die(g);
  }
  die(g) {
    if (this.dead) return;
    this.dead = true;
    g.burst(this.x, this.y, 16, PAL.purpleL);
    g.burst(this.x, this.y, 8, PAL.red);
    g.shake(3);
    SFX.hit(1);
    g.kills++;
    /* 剑意不绝（舞剑流的击杀返还）：斩杀即把专属冷却往回退一截。
       钩在 die() 出口而不是各个伤害来源，飞剑／平A／突进连斩／照影反弹全都自动覆盖。
       Boss 房召唤出来的爪牙同样算 —— 一阶段已有 45 秒软时限兜住刷新率，
       这里不必再单独豁免（真豁免了，这条线在最需要它的 Boss 战里反而失效）。 */
    if (g.player && g.player.ult) {
      const pl = g.player;
      const back = ultKillRefund(pl.ult, pl.ult.style);
      if (back > 0 && pl.ultCd > 0) {
        pl.ultCd = Math.max(0, pl.ultCd - back);
        pl.ultCdFlash = 12;         // 让 HUD 冷却条「缩掉一截」，否则秒级减免玩家感知不到
        pl.ultCdFlashAmt = back;
      }
    }
    // 斩妖回灵：让「打得起技能」与「敢不敢打」正相关，而不是纯靠站桩回蓝
    // 灵力不再击杀自动入账，而是掉一颗灵力珠 —— 要跑过去捡，这才构成取舍
    // 掉率与单颗量都乘 lootScale：深层的怪更厚（maxHp 大 → 珠子本来就更大），
    // 若不压一压，后半程就会变成满地灵力、技能随便放
    if (g.player && !this.small) {
      const ls = lootScale(g.depth);
      const amt = this.elite ? Math.max(1, Math.round(MP_ELITE_DROP * ls))
                             : clamp(Math.round(this.maxHp / 6 * ls), 1, 8);
      if (Math.random() < (this.elite ? 1 : MP_DROP_RATE * ls)) {
        g.dropPickup('mp', this.x + 7, this.y + 3, amt);
      }
    }
    if (this.elite) this.eliteDeath(g);
    if (this.def.split && !this.small) {
      for (let i = 0; i < 2; i++) {
        const sp = g.safeSpawn(this.x + (i ? 14 : -14), this.y + 6, 10);
        const e = new Enemy('yinsha', sp.x, sp.y, 0.6);
        e.small = true; e.maxHp = 5; e.hp = 5;
        g.enemies.push(e);
      }
    }
    // 掉落
    const p = g.player;
    /* Boss 房的小怪是尊者按阶段无限召唤出来的：若照样掉灵石，这一层就多出
       一个刷不完的口子，planEconomy 锁死的预算立刻失效。这里整段掐掉。
       Boss 房的灵石配额不受影响 —— 那部分留在 onBossDead 一次性发放。 */
    const bossRoom = !!(g.room && g.room.type === RT.BOSS);
    // 灵石走本房配额（整层产出由 planEconomy 锁死）；钥匙/雷符不再由小怪乱掉
    if (!bossRoom) {
      let n = this.def.coins + Math.floor(Math.random() * 2) + Math.floor((p.stats.greed || 0) * 0.6);
      g.takeCoins(this.x, this.y, Math.min(6, n));
    }
    // 心血：平时几乎不掉，只剩一格血时才放水，让血量危机真的会咬人
    if (Math.random() < g.heartRate()) g.dropPickup('heart', this.x, this.y, 1);
    // 贪心：额外产出不计入本层预算，否则这条属性会变成废属性
    // （Boss 房同样封掉，否则无限召唤的小怪会把「贪心」变成印钞机）
    if (!bossRoom && p.stats.greed && Math.random() < p.stats.greed * 0.12) g.dropPickup('coin', this.x + 8, this.y, 1);
    // 尸毒珠 / 摄魂幡可进阶： poison、soul 的阶数直接换算成范围与增益
    if (p.stats.poison) {
      const k = p.stats.poison - 1;
      g.hazards.push(new Hazard(this.x, this.y, 26 + k * 8, 0, 150 + k * 40, 1.2 + k * 0.5, PAL.green, true));
    }
    if (p.stats.soul) { p.soulBuff = 300 + (p.stats.soul - 1) * 60; }
  }
  /* 精英神通：独立于常规 AI 的专属技，凝形结束后才启用 */
  castPerk(g, p) {
    const dx = p.x - this.x, dy = p.y - this.y;
    const base = Math.atan2(dy, dx);
    switch (this.elite.perk) {
      case 'blood':                                   // 周身喷薄血箭
        for (let i = 0; i < 8; i++) {
          const a = base + i / 8 * Math.PI * 2;
          g.spawnEnemyBullet(this.x, this.y - 2, Math.cos(a) * 2.8, Math.sin(a) * 2.8, 'blood');
        }
        SFX.spit();
        break;
      case 'volley':                                  // 符箓三连
        for (let i = -1; i <= 1; i++) {
          g.spawnEnemyBullet(this.x, this.y, Math.cos(base + i * 0.28) * 3.4, Math.sin(base + i * 0.28) * 3.4, 'talisman');
        }
        SFX.cast();
        break;
      case 'rush':                                    // 瞬影突进
        this.vx = Math.cos(base) * 9; this.vy = Math.sin(base) * 9;
        SFX.dash();
        g.burst(this.x, this.y, 10, PAL.purpleL);
        break;
      case 'venom': {                                 // 毒弹 + 前方毒沼（有预警，可躲）
        for (let i = -1; i <= 1; i++) {
          g.spawnEnemyBullet(this.x, this.y - 2, Math.cos(base + i * 0.3) * 2.7, Math.sin(base + i * 0.3) * 2.7, 'orb');
        }
        g.hazards.push(new Hazard(this.x + Math.cos(base) * 62, this.y + Math.sin(base) * 62,
          30, 26, 200, 1.2, PAL.green, false));
        SFX.spit();
        break;
      }
      case 'swarm':                                   // 环形剑气
        for (let i = 0; i < 12; i++) {
          const a = i / 12 * Math.PI * 2 + this.t * 0.01;
          g.spawnEnemyBullet(this.x, this.y, Math.cos(a) * 2.6, Math.sin(a) * 2.6, 'ice');
        }
        SFX.cast();
        break;
    }
    g.burst(this.x, this.y - 4, 8, this.elite.aura);
  }

  /* 精英殒命：各留一道余祸，并必留一件法宝。
     余祸都先给一段预警（warn 45~50 帧，对齐 Boss），环形弹幕也延后 45 帧才出，
     否则「站在死亡点必吃且无法走位」。 */
  eliteDeath(g) {
    const P = this.elite;
    const ex = this.x, ey = this.y;
    const ring = (n, spd) => g.schedule(45, () => {
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        g.spawnEnemyBullet(ex, ey, Math.cos(a) * spd, Math.sin(a) * spd, 'blood');
      }
    });
    switch (P.perk) {
      case 'blood':
        g.hazards.push(new Hazard(ex, ey, 34, 45, 150, 1.0, PAL.red, false));
        ring(8, 2.4);
        break;
      case 'volley':
        g.hazards.push(new Hazard(ex, ey, 40, 45, 180, 1.1, PAL.fire, false));
        break;
      case 'rush':
        g.schedule(45, () => {
          for (let i = 0; i < 12; i++) {
            const a = Math.random() * Math.PI * 2;
            g.spawnEnemyBullet(ex, ey, Math.cos(a) * 3.2, Math.sin(a) * 3.2, 'blood');
          }
        });
        break;
      case 'venom':
        g.hazards.push(new Hazard(ex, ey, 52, 50, 240, 1.3, PAL.green, false));
        break;
      case 'swarm':
        for (let i = 0; i < 2; i++) {
          const sp = g.safeSpawn(this.x + (i ? 22 : -22), this.y + 8, 8);
          const e = new Enemy('jianling', sp.x, sp.y, 0.5);
          e.small = true;
          g.enemies.push(e);
        }
        break;
    }
    g.burst(ex, ey, 22, P.aura);
    g.shake(5);
    // 精英本身不再额外掉法器 —— 回报改挂在精英窟墙上的密室里（见 Floor.planSecret）
    this.grantUlt(g, ex, ey);
  }
  /* 斩却精英：首杀得本流派专属技能，之后每次给一次三选一精进 */
  grantUlt(g, ex, ey) {
    const p = g.player;
    if (!p || p.dead) return;
    const UD = ULT_DEF[g.style] || ULT_DEF.feijian;
    if (!p.ult) {
      p.giveUlt(g.style);
      p.ultCd = 0;
      g.floaters.push(new Floater(ex, ey - 40, '得 ' + UD.name, PAL.gold));
      g.floaters.push(new Floater(ex, ey - 58, '空格 施展', PAL.goldL));
      g.itemPopup = { def: { id: 'ult_' + g.style, type: 'ult', name: UD.name, desc: UD.desc, cd: ultCdOf(p.ult, g.style) }, t: 240, rank: 0 };
      g.shake(10);
      SFX.levelup();
    } else {
      // 不挂 schedule —— schedule 绑房间，玩家清完场立刻出门就会把升级界面吞掉
      g.ultUpgradeT = 30;
    }
  }

  update(g) {
    this.t++;
    if (this.flash > 0) this.flash--;
    if (this.frost > 0) this.frost--;
    if (this.burn > 0) {
      this.burn--;
      if (this.burn % 24 === 0) { this.hp -= this.burnDmg * 0.5; g.burst(this.x, this.y - 6, 2, PAL.fire); if (this.hp <= 0) this.die(g); }
    }
    const p = g.player;
    if (this.spawnT > 0) this.spawnT--;
    // 凝形期：尚未成形，行动迟缓
    const gk = this.spawnT > 0 ? 0.25 + 0.75 * (1 - this.spawnT / SPAWN_GRACE) : 1;
    // 冰封减速随玄冰符阶数加深（1 阶 0.45 → 2 阶 0.38 → 3 阶 0.31）
    const fz = this.frost > 0 ? Math.max(0.24, 0.52 - (g.player ? g.player.stats.frost : 0) * 0.07) : 1;
    const spd = this.speed * fz * gk;
    const dx = p.x - this.x, dy = p.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    let ax = 0, ay = 0;

    switch (this.def.ai) {
      case 'chase': {
        ax = dx / d * spd; ay = dy / d * spd;
        // 简单避让同类
        for (const o of g.enemies) {
          if (o === this || o.dead) continue;
          const ox = this.x - o.x, oy = this.y - o.y, od = Math.hypot(ox, oy);
          if (od < 22 && od > 0) { ax += ox / od * 0.5; ay += oy / od * 0.5; }
        }
        break;
      }
      case 'spit': {
        // 缓慢游走，周期吐弹
        ax = Math.cos(this.t * 0.02) * spd; ay = Math.sin(this.t * 0.017) * spd * 0.6;
        if (--this.cd <= 0) {
          this.cd = 95 + Math.floor(Math.random() * 40);
          this.frame = 1;
          const base = Math.atan2(dy, dx);
          for (let i = -1; i <= 1; i++) {
            const a = base + i * 0.34;
            g.spawnEnemyBullet(this.x, this.y - 2, Math.cos(a) * 2.6, Math.sin(a) * 2.6, 'orb');
          }
          SFX.spit();
        } else if (this.cd % 20 === 0) this.frame = 0;
        break;
      }
      case 'dash': {
        if (this.state === 0) {
          ax = dx / d * spd * 0.6; ay = dy / d * spd * 0.6;
          if (--this.cd <= 0) { this.state = 1; this.stateT = 34; }
        } else if (this.state === 1) {
          this.stateT--;
          ax = 0; ay = 0;
          if (this.stateT === 20) { this.dvx = dx / d * 6.2; this.dvy = dy / d * 6.2; SFX.dash(); }
          if (this.stateT < 20) { ax = this.dvx; ay = this.dvy; this.dvx *= 0.97; this.dvy *= 0.97; }
          if (this.stateT <= 0) { this.state = 0; this.cd = 70 + Math.floor(Math.random() * 50); }
          if (this.stateT > 20) { this.x += Math.sin(this.t) * 0.3; }
        }
        break;
      }
      case 'caster': {
        const want = 130;
        if (d > want + 20) { ax = dx / d * spd; ay = dy / d * spd; }
        else if (d < want - 30) { ax = -dx / d * spd; ay = -dy / d * spd; }
        else { ax = -dy / d * spd * 0.7; ay = dx / d * spd * 0.7; }
        if (--this.cd <= 0) {
          this.cd = 100 + Math.floor(Math.random() * 50);
          const base = Math.atan2(dy, dx);
          for (let k = 0; k < 3; k++) {
            setTimeout(() => { }, 0);
            const a = base + (Math.random() - 0.5) * 0.2;
            g.spawnEnemyBullet(this.x, this.y, Math.cos(a) * 3.1, Math.sin(a) * 3.1, 'talisman');
          }
          SFX.cast();
        }
        break;
      }
      case 'caster2': {
        const want = 150;
        if (d > want) { ax = dx / d * spd; ay = dy / d * spd; }
        else if (d < want - 40) { ax = -dx / d * spd; ay = -dy / d * spd; }
        if (--this.cd <= 0) {
          this.cd = 80 + Math.floor(Math.random() * 40);
          for (let i = 0; i < 2; i++) {
            const a = Math.atan2(dy, dx) + (i ? 0.4 : -0.4);
            const b = g.spawnEnemyBullet(this.x, this.y, Math.cos(a) * 2.4, Math.sin(a) * 2.4, 'ice');
            b.homing = 0.05;
          }
          SFX.cast();
        }
        break;
      }
      case 'hop': {
        if (this.stateT > 0) {
          this.stateT--;
          ax = this.hvx; ay = this.hvy;
          this.hvx *= 0.9; this.hvy *= 0.9;
        } else if (--this.cd <= 0) {
          this.cd = 55 + Math.floor(Math.random() * 40);
          this.hvx = dx / d * 4.4; this.hvy = dy / d * 4.4;
          this.stateT = 22; this.frame = 1;
        }
        break;
      }
    }

    // 精英神通：凝形结束后按各自冷却释放；环形技（血箭环 / 环形剑气）先走前摇
    if (this.elite && this.spawnT <= 0 && !p.dead) {
      if (this.perkT > 0) {
        if (--this.perkT <= 0) this.castPerk(g, p);
      } else if (--this.eCd <= 0) {
        this.eCd = this.elite.perkCd;
        const W = (this.elite.perk === 'blood' || this.elite.perk === 'swarm') ? PERK_WINDUP : 0;
        if (W > 0) this.perkT = W;
        else this.castPerk(g, p);
      }
    }

    this.vx = lerp(this.vx, ax, 0.22);
    this.vy = lerp(this.vy, ay, 0.22);
    this.x += this.vx + this.kbx;
    this.y += this.vy + this.kby;
    this.kbx *= 0.82; this.kby *= 0.82;
    g.collideRoom(this, this.r);
    if (this.x !== p.x) this.facing = dx > 0 ? 1 : -1;

    // 接触伤害（凝形期不伤人）
    if (this.spawnT <= 0 && !p.dead && circleHit(this.x, this.y, this.r, p.x, p.y, p.r)) {
      p.takeDamage(this.def.touch, g, this.x, this.y);
    }
    if (this.t % 16 === 0) this.frame = this.frame ? 0 : 1;
  }
  draw(g2) {
    const set = this.small ? SPR.enemies.yinsha_s : SPR.enemies[this.def.spr];
    const s = set[this.frame % set.length];
    const bobY = (this.def.ai === 'hop' && this.stateT > 0) ? -4 : 0;
    const shaping = this.spawnT > 0;
    const k = shaping ? 1 - this.spawnT / SPAWN_GRACE : 1;
    const esc = this.elite ? this.elite.scale : 1;      // 精英体型放大
    // 光环画在缩放之外，尺寸才可控
    if (this.elite && !shaping) drawEliteAura(g2, this.x, this.y + this.r + 2, this.r, this.elite.aura, this.t);
    // 环形技前摇：扩圈预警（此时尚未出弹，玩家还有时间拉开距离）
    if (this.elite && this.perkT > 0) {
      const kk = 1 - this.perkT / PERK_WINDUP;
      g2.save();
      g2.globalAlpha = 0.35 + 0.45 * kk;
      g2.strokeStyle = this.elite.aura; g2.lineWidth = 2;
      g2.beginPath(); g2.arc(this.x, this.y, 14 + kk * 36, 0, Math.PI * 2); g2.stroke();
      g2.globalAlpha = 0.14;
      g2.fillStyle = this.elite.aura;
      g2.beginPath(); g2.arc(this.x, this.y, 14 + kk * 36, 0, Math.PI * 2); g2.fill();
      g2.restore();
    }
    g2.save();
    if (shaping || esc !== 1) {
      // 凝形：自地面「长」出来并淡入（精英再叠加体型放大）
      if (shaping) g2.globalAlpha = clamp(0.2 + k * 0.8, 0, 1);
      const sc = esc * (shaping ? 0.5 + 0.5 * k : 1);
      g2.translate(this.x, this.y + this.r);
      g2.scale(sc, sc);
      g2.translate(-this.x, -(this.y + this.r));
    }
    if (this.shadow) {
      g2.globalAlpha = shaping ? 0.16 : 0.28; g2.fillStyle = '#000';
      g2.beginPath(); g2.ellipse(this.x, this.y + this.r + 2, this.r * 0.9, this.r * 0.42, 0, 0, Math.PI * 2); g2.fill();
      g2.globalAlpha = shaping ? clamp(0.2 + k * 0.8, 0, 1) : 1;
    }
    const x = this.x - s.width / 2, y = this.y - s.height + this.r + 2 + bobY;
    if (this.frost > 0) {
      g2.globalAlpha = 1;
      g2.drawImage(s, x, y);
      g2.globalCompositeOperation = 'source-atop';
      g2.fillStyle = 'rgba(120,200,255,0.55)';
      g2.globalCompositeOperation = 'source-over';
      g2.globalAlpha = 0.35; g2.fillStyle = PAL.cyan;
      g2.fillRect(x, y, s.width, s.height);
      g2.globalAlpha = 1;
    } else if (this.flash > 0) {
      g2.drawImage(s, x, y);
      g2.globalAlpha = 0.75; g2.fillStyle = '#fff';
      g2.globalCompositeOperation = 'source-atop';
      g2.fillRect(x, y, s.width, s.height);
      g2.globalCompositeOperation = 'source-over';
      g2.globalAlpha = 1;
    } else {
      g2.drawImage(s, x, y);
    }
    g2.restore();
    if (shaping) drawSpawnRune(g2, this.x, this.y, this.r, this.spawnT, SPAWN_GRACE, PAL.jadeL);
    // 血条：小怪受伤后显示，精英常驻一条更宽的、带名号的
    const isEl = !!this.elite;
    if (!this.small && (isEl || this.hp < this.maxHp)) {
      const w = isEl ? 30 : 20, h = isEl ? 4 : 3;
      // 放大后精灵顶边上移，血条要跟着走
      const anchor = this.y + this.r;
      const by = anchor - (anchor - y) * esc - (isEl ? 7 : 5);
      g2.fillStyle = '#000'; g2.fillRect(this.x - w / 2 - 1, by - 1, w + 2, h + 2);
      g2.fillStyle = PAL.redD; g2.fillRect(this.x - w / 2, by, w, h);
      g2.fillStyle = isEl ? this.elite.aura : PAL.red;
      g2.fillRect(this.x - w / 2, by, w * Math.max(0, this.hp / this.maxHp), h);
      if (isEl) {
        // 名号：先描一圈墨边，猩红/煞白等色压在血色地面上也读得清
        const tx = this.x - w / 2, ty = by - 9;
        for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          drawPixelText(g2, this.elite.en, tx + ox, ty + oy, 1, '#140619');
        }
        drawPixelText(g2, this.elite.en, tx, ty, 1, this.elite.aura);
      }
    }
  }
}

/* ------------------------------------------------------------
 *  BOSS
 * ---------------------------------------------------------- */
class Boss {
  constructor(kind, x, y, hpScale) {
    this.kind = kind;
    this.x = x; this.y = y; this.r = 22;
    this.maxHp = Math.round((kind === 'xuemo' ? 260 : 300) * (hpScale || 1));
    this.hp = this.maxHp;
    this.isBoss = true;
    this.def = { touch: 1, coins: 0, score: 200 };
    this.t = 0; this.cd = 90; this.cd2 = 160; this.cd3 = 260;
    this.spawnT = SPAWN_GRACE_BOSS;   // 登场凝形
    this.state = 'idle'; this.stateT = 0;
    this.vx = 0; this.vy = 0; this.kbx = 0; this.kby = 0;
    this.flash = 0; this.frost = 0; this.burn = 0; this.burnDmg = 0;
    this.phase = 1; this.dead = false; this.frame = 0;
    this.age = 0;                    // 战斗计时（凝形结束后才走），用于一阶段软时限
    this.invuln = 0;                 // 转阶段的短暂无敌
    this.name = kind === 'xuemo' ? '血魔尊者' : '白骨夫人';
    this.spiral = 0;
  }
  get frozenMul() { return this.frost > 0 ? 0.6 : 1; }
  /* 转阶段：咆哮登场 + 清弹幕 + 短暂无敌 + 外溢灵力。
     两个入口共用 —— hurt() 按血量阈值，update() 按一阶段软时限。 */
  setPhase(np, g) {
    this.phase = np; this.state = 'roar'; this.stateT = 60; this.invuln = 40;
    // 转阶段清掉场上敌方弹幕，并给 Boss 短暂无敌，否则瞬间变强 + 旧弹幕齐飞 = 必吃
    g.bullets = g.bullets.filter(b => b.friendly);
    g.shake(10); g.burst(this.x, this.y, 40, this.kind === 'xuemo' ? PAL.red : PAL.bone);
    // 转阶段外溢灵力：三颗散落，逼玩家在 Boss 变强的当口跑位去捡。
    // 单颗量同样吃层数衰减 —— Boss 只有一只，若这里是唯一不衰减的口子，
    // 深层的 Boss 反而成了最肥的补给点。
    const bossAmt = Math.max(1, Math.round(MP_BOSS_PHASE * lootScale(g.depth)));
    for (let i = 0; i < 3; i++) {
      const a = Math.PI * 2 * i / 3 + Math.random() * 0.6;
      g.dropPickup('mp', this.x + Math.cos(a) * 30, this.y + Math.sin(a) * 26, bossAmt);
    }
    g.floaters.push(new Floater(this.x, this.y - 44, '灵力外溢', PAL.cyan));
    SFX.roar();
  }
  hurt(dmg, g, src, crit) {
    if (this.dead || this.invuln > 0) return;
    this.hp -= dmg; this.flash = 5;
    if (dmg > 0 && src !== 'dot') {
      g.addDamageNum(this.x, this.y - this.r - 6, dmg,
        crit != null ? crit : !!(src && src.crit));
    }
    const pct = this.hp / this.maxHp;
    const np = pct > 0.66 ? 1 : (pct > 0.33 ? 2 : 3);
    if (np !== this.phase) this.setPhase(np, g);
    if (this.hp <= 0) this.die(g);
  }
  die(g) {
    this.dead = true;
    g.shake(16);
    for (let i = 0; i < 60; i++) g.particles.push(new Particle(this.x, this.y, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, 40 + Math.random() * 30, Math.random() < 0.5 ? PAL.red : PAL.gold, 3, 0.05));
    SFX.bossDie();
    g.onBossDead();
  }
  update(g) {
    this.t++;
    if (this.flash > 0) this.flash--;
    if (this.frost > 0) this.frost--;
    if (this.invuln > 0) this.invuln--;
    // 燃烧走 hurt()：这样燃烧掉血同样能触发阶段切换（过去直接扣 hp，绕过了阶段判定）
    if (this.burn > 0) { this.burn--; if (this.burn % 20 === 0) { this.hurt(this.burnDmg * 0.8, g, 'dot'); g.burst(this.x, this.y, 2, PAL.fire); } }
    const p = g.player;
    if (this.spawnT > 0) this.spawnT--;
    const dx = p.x - this.x, dy = p.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const spd = (this.kind === 'xuemo' ? 1.0 : 0.85) * this.frozenMul * (this.phase === 3 ? 1.5 : this.phase === 2 ? 1.2 : 1)
      * (this.spawnT > 0 ? 0.3 : 1);      // 登场凝形期行动迟缓

    if (this.spawnT > 0) {                // 登场仪式：只缓缓显形，不出手
      this.vx *= 0.85; this.vy *= 0.85;
      this.x += this.vx + this.kbx; this.y += this.vy + this.kby;
      this.kbx *= 0.8; this.kby *= 0.8;
      g.collideRoom(this, this.r);
      if (this.spawnT % 12 === 0) g.burst(this.x, this.y, 3, this.kind === 'xuemo' ? PAL.red : PAL.bone);
      return;
    }
    /* 一阶段软时限（BOSS_P1_LIMIT）：到点还没打掉三分之一血就强制转二阶段。
       凝形结束后才开始计，所以「45 秒」是实打实的战斗时间。 */
    this.age++;
    if (this.age >= BOSS_P1_LIMIT && this.phase === 1) this.setPhase(2, g);
    if (this.state === 'roar') {
      this.stateT--; this.vx *= 0.8; this.vy *= 0.8;
      if (this.stateT <= 0) this.state = 'idle';
    } else if (this.state === 'dash') {
      this.stateT--;
      this.vx *= 0.965; this.vy *= 0.965;
      if (this.stateT % 4 === 0) g.burst(this.x, this.y, 3, this.kind === 'xuemo' ? PAL.red : PAL.bone);
      if (this.stateT <= 0) { this.state = 'idle'; this.cd2 = 200; }
    } else {
      // 游走接近
      this.vx = lerp(this.vx, dx / d * spd, 0.05);
      this.vy = lerp(this.vy, dy / d * spd, 0.05);
      if (d < 60) { this.vx *= 0.9; this.vy *= 0.9; }
      // 冲刺
      if (--this.cd2 <= 0) {
        this.cd2 = this.phase === 3 ? 150 : 240;
        this.vx = dx / d * 8; this.vy = dy / d * 8;
        this.state = 'dash'; this.stateT = 40; SFX.dash();
      }
    }

    this.x += this.vx + this.kbx; this.y += this.vy + this.kby;
    this.kbx *= 0.8; this.kby *= 0.8;
    g.collideRoom(this, this.r);

    // 弹幕
    if (this.state !== 'roar') {
      if (--this.cd <= 0) {
        this.cd = this.phase === 3 ? 70 : this.phase === 2 ? 100 : 140;
        this.volley(g, dx, dy);
      }
      if (--this.cd3 <= 0) {
        this.cd3 = this.phase === 3 ? 170 : 280;
        this.special(g);
      }
    }

    if (!p.dead && circleHit(this.x, this.y, this.r, p.x, p.y, p.r)) p.takeDamage(1, g, this.x, this.y);
    if (this.t % 20 === 0) this.frame = this.frame ? 0 : 1;
  }
  volley(g, dx, dy) {
    const base = Math.atan2(dy, dx);
    if (this.phase === 1) {
      const n = this.kind === 'xuemo' ? 14 : 12;
      for (let i = 0; i < n; i++) {
        const a = base + i * (Math.PI * 2 / n);
        g.spawnEnemyBullet(this.x, this.y, Math.cos(a) * 2.7, Math.sin(a) * 2.7, this.kind === 'xuemo' ? 'blood' : 'ice');
      }
      SFX.cast();
    } else if (this.phase === 2) {
      this.spiral += 0.5;
      for (let k = 0; k < 3; k++) {
        const a = this.spiral + k * (Math.PI * 2 / 3) + base * 0.15;
        g.spawnEnemyBullet(this.x, this.y, Math.cos(a) * 3.0, Math.sin(a) * 3.0, this.kind === 'xuemo' ? 'flame' : 'talisman');
      }
      SFX.cast();
    } else {
      for (let i = -1; i <= 1; i++) {
        const a = base + i * 0.22;
        const b = g.spawnEnemyBullet(this.x, this.y, Math.cos(a) * 3.4, Math.sin(a) * 3.4, this.kind === 'xuemo' ? 'blood' : 'ice');
        b.homing = 0.035;
      }
      for (let i = 0; i < 8; i++) {
        const a = i * (Math.PI * 2 / 8) + this.t * 0.02;
        g.spawnEnemyBullet(this.x, this.y, Math.cos(a) * 2.2, Math.sin(a) * 2.2, 'flame');
      }
      SFX.cast();
    }
  }
  special(g) {
    const p = g.player;
    if (this.phase === 1) {
      // 召唤
      for (let i = 0; i < 2; i++) {
        const sp = g.safeSpawn(this.x + (i ? 40 : -40), this.y + 30, 12);
        const e = new Enemy(this.kind === 'xuemo' ? 'xiesui' : 'yinsha', sp.x, sp.y, 1);
        g.enemies.push(e);
      }
      SFX.summon();
    } else if (this.phase === 2) {
      for (let i = 0; i < 3; i++) {
        const ang = Math.random() * Math.PI * 2, rr = 40 + Math.random() * 120;
        const hx = clamp(this.x + Math.cos(ang) * rr, WALL_L + 20, WALL_R - 20);
        const hy = clamp(this.y + Math.sin(ang) * rr, WALL_T + 20, WALL_B - 20);
        g.hazards.push(new Hazard(hx, hy, 30, 45, 30, 1, PAL.red, false));
      }
    } else {
      // 天罚：玩家位置预警 + 十字弹幕
      g.hazards.push(new Hazard(p.x, p.y, 40, 50, 35, 1, this.kind === 'xuemo' ? PAL.red : PAL.purple, false));
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.random() * 0.2;
        for (let k = 0; k < 5; k++) {
          g.spawnEnemyBullet(this.x, this.y, Math.cos(a) * (2 + k * 0.3), Math.sin(a) * (2 + k * 0.3), 'blood');
        }
      }
      SFX.roar();
    }
  }
  draw(g2) {
    const s = SPR.boss[this.kind][this.frame];
    const shaping = this.spawnT > 0;
    const k = shaping ? 1 - this.spawnT / SPAWN_GRACE_BOSS : 1;
    g2.save();
    if (shaping) {
      g2.globalAlpha = clamp(0.15 + k * 0.85, 0, 1);
      const sc = 0.45 + 0.55 * k;
      g2.translate(this.x, this.y + 20);
      g2.scale(sc, sc);
      g2.translate(-this.x, -(this.y + 20));
    }
    g2.globalAlpha = shaping ? 0.15 : 0.3; g2.fillStyle = '#000';
    g2.beginPath(); g2.ellipse(this.x, this.y + 20, 24, 9, 0, 0, Math.PI * 2); g2.fill();
    g2.globalAlpha = shaping ? clamp(0.15 + k * 0.85, 0, 1) : 1;
    const x = this.x - s.width / 2, y = this.y - s.height + 24;
    g2.drawImage(s, x, y);
    if (this.flash > 0) {
      g2.globalAlpha = 0.7; g2.fillStyle = '#fff';
      g2.globalCompositeOperation = 'source-atop';
      g2.fillRect(x, y, s.width, s.height);
      g2.globalCompositeOperation = 'source-over'; g2.globalAlpha = 1;
    }
    if (this.state === 'roar') {
      g2.globalAlpha = 0.5;
      g2.strokeStyle = this.kind === 'xuemo' ? PAL.red : PAL.purpleL; g2.lineWidth = 2;
      for (let i = 1; i <= 3; i++) {
        g2.beginPath(); g2.arc(this.x, this.y, 30 + i * 22 + Math.sin(this.t * 0.4) * 4, 0, Math.PI * 2); g2.stroke();
      }
      g2.globalAlpha = 1;
    }
    g2.restore();
    if (shaping) drawSpawnRune(g2, this.x, this.y, 24, this.spawnT, SPAWN_GRACE_BOSS, this.kind === 'xuemo' ? PAL.red : PAL.purpleL);
  }
}

/* ------------------------------------------------------------
 *  拾取物
 * ---------------------------------------------------------- */
class Pickup {
  constructor(kind, x, y, value) {
    this.kind = kind; this.x = x; this.y = y; this.value = value || 1;
    this.vx = (Math.random() - 0.5) * 3; this.vy = (Math.random() - 0.5) * 3;
    this.t = Math.random() * 60; this.dead = false; this.r = 8;
    this.life = 0;
  }
  update(g) {
    this.t++; this.life++;
    this.x += this.vx; this.y += this.vy;
    this.vx *= 0.9; this.vy *= 0.9;
    g.collideRoom(this, 6);
    const p = g.player;
    // 磁吸范围放大一些：清房奖励落在房中央，路过就能吸走，不必精确踩点
    if (this.life > 12 && circleHit(this.x, this.y, 21, p.x, p.y, p.r)) {
      const d = Math.hypot(p.x - this.x, p.y - this.y) || 1;
      this.x += (p.x - this.x) / d * 2.6; this.y += (p.y - this.y) / d * 2.6;
      if (d < 14) { this.collect(g); }
    }
  }
  collect(g) {
    this.dead = true;
    if (this.rec) this.rec.taken = true;   // 回写房间数据，换房后不再重建
    const p = g.player;
    if (this.kind === 'coin') { Game.addCoins(this.value); SFX.coin(); }
    else if (this.kind === 'heart') { p.heal(2); SFX.pickup(); }
    else if (this.kind === 'shield') { p.addShield(1); SFX.pickup(); }
    else if (this.kind === 'bomb') { g.bombs++; SFX.pickup(); }
    else if (this.kind === 'key') { g.keys++; SFX.pickup(); }
    else if (this.kind === 'mp') {
      // 灵力：不入背包的资源，走单独的音效与青色反馈，和金色的灵石区分开
      const before = p.mp;
      p.mp = Math.min(p.maxMP, p.mp + this.value);
      SFX.tone(720, 0.13, 'triangle', 0.13, 1180);
      g.floaters.push(new Floater(this.x, this.y - 14, '灵力 +' + Math.round(p.mp - before), PAL.cyan));
    }
    g.burst(this.x, this.y, 6, this.kind === 'mp' ? PAL.cyan : PAL.gold);
  }
  draw(g2) {
    const bob = Math.sin(this.t * 0.12) * 2;
    const spr = this.kind === 'coin' ? SPR.coin : this.kind === 'heart' ? SPR.heart[2]
      : this.kind === 'shield' ? SPR.shield[1] : this.kind === 'key' ? SPR.key
      : this.kind === 'mp' ? SPR.mana : SPR.bomb;
    g2.save();
    g2.globalAlpha = 0.25; g2.fillStyle = '#000';
    g2.beginPath(); g2.ellipse(this.x, this.y + 8, 6, 2.5, 0, 0, Math.PI * 2); g2.fill();
    g2.globalAlpha = 1;
    // 灵力珠额外带一圈脉动的青晕，远远就能认出「这是灵力不是钱」
    if (this.kind === 'mp') {
      g2.globalAlpha = 0.28 + Math.sin(this.t * 0.09) * 0.12;
      g2.fillStyle = PAL.cyan;
      g2.beginPath(); g2.arc(this.x, this.y + bob, 8 + Math.sin(this.t * 0.09) * 1.5, 0, Math.PI * 2); g2.fill();
      g2.globalAlpha = 1;
    }
    g2.drawImage(spr, this.x - spr.width / 2, this.y - spr.height / 2 + bob);
    g2.restore();
  }
}

/* ------------------------------------------------------------
 *  玩家
 * ---------------------------------------------------------- */
class Player {
  constructor(x, y) {
    this.x = x; this.y = y; this.r = 7;
    this.vx = 0; this.vy = 0;
    this.maxHP = 6; this.hp = 6;      // 单位 = 半颗心
    this.shield = 0;                  // 常驻护盾：不设时限，只被受击逐层扣掉
    this.tShield = 0;                 // 限时护盾：目前只有护体金光会结
    this.shieldT = 0;                 // 限时护盾剩余帧数：到点整层散去
    this.dir = 'down'; this.face = 1;
    this.anim = 0; this.animT = 0;
    this.shootCd = 0;
    this.invuln = 0;
    this.dead = false;
    this.soulBuff = 0;
    this.charging = false;        // 巨剑流：是否正在蓄力
    this.chargeT = 0;             // 巨剑流：已蓄力帧数
    this.chargeCdMax = 0;         // 巨剑流：本次出剑后摇的总帧数（供 UI 画回气条）
    this.chargeFlash = 0;         // 巨剑流：段位跃升时的闪光计时
    this.chargeAim = null;        // 巨剑流：蓄力期间锁存的瞄准方向
    /* 舞剑流专属「剑影三叠」的状态机（按空格蓄势 → 松手突进） */
    this.wjCharging = false;      // 是否正在蓄势
    this.wjChargeT = 0;           // 已蓄势帧数
    this.wjFull = false;          // 本次蓄势是否已满（满蓄只响一次提示）
    this.wjStage = 0;             // 下一段的段数：0 一段 / 1 二段 / 2 三段
    this.wjChainT = 0;            // 连段窗口剩余帧数，归零则连招作废
    this.dashing = false;         // 突进中（全程无敌）
    this.dashT = 0;               // 突进剩余帧数
    this.dashStage = 0;           // 本次突进的段数
    this.dashA = 0;               // 突进方向
    this.dashSpeed = 0;           // 每帧位移像素
    this.dashHit = null;          // 本次突进已命中的妖物（同一目标不重复吃伤害）
    this.dashFlurry = 0;          // 三段五连斩剩余段数
    this.dashFlurryT = 0;         // 下一段五连斩的倒计时
    this.dashTrail = [];          // 突进残影（纯表现）
    this.swingT = 0;              // 挥剑动作剩余帧数（舞剑流平A的姿态切换）
    this.items = [];
    /* 小技能：最多 SLOT_COUNT 个，按 1/2/3 切换、Q 释放，消耗灵力 */
    this.mp = MP_START; this.maxMP = MP_MAX;
    this.slots = [null, null, null];     // 每项 { id, lv }
    this.slotIdx = 0;                    // 当前选中的槽位
    this.skillGcd = 0;                   // 公共冷却，只防连点
    this.skillCd = [0, 0, 0];            // 每个槽位各自的冷却，切槽绕不过去
    /* 专属技能：首次斩精英获得，空格释放；paths 记录各升级路线已学级数 */
    this.ult = null;                     // { style, paths: { pathId: lv } }
    this.ultCd = 0;
    this.ultCdFlash = 0;                 // 击杀返还时的 HUD 高亮倒计时
    this.ultCdFlashAmt = 0;              // 刚返还了多少帧（供 HUD 标出「−N 秒」）
    /* 专属升级带来的临时增益（移速 / 蓄力 / 伤害），单位是帧 */
    this.buffs = { spdT: 0, spdMul: 0, chargeT: 0, chargeMul: 0, dmgT: 0, dmgMul: 0 };
    this.stats = {
      damage: 3.5, fireRate: 2.6, speed: 2.35, shotSpeed: 6.4, range: 210,
      pierce: 0, spread: 0, homing: 0, homingRange: 220, knockback: 0.8, luck: 0,
      burn: 0, frost: 0, chain: 0, iframe: 62, greed: 0, crit: 0,
      poison: 0, regen: 0, soul: 0, deflect: 0, reflect: 0, fly: false, mpRegen: MP_REGEN
    };
  }
  heal(n) { this.hp = Math.min(this.maxHP, this.hp + n); }
  /* 护盾分两种：
     常驻护盾（不传 dur）—— 太虚护盾 / 羽衣 / 灵力丹 / 地上拾取的护盾都走这条，
                           不设时限，只被受击逐层扣掉，可以一直囤着；
     限时护盾（传 dur）  —— 只有护体金光走这条，到点整层散去，
                           重复获得只刷新时长，不叠加计时。 */
  addShield(n, dur) {
    if (dur == null) { this.shield += n; return; }
    this.tShield += n;
    if (this.shieldT < dur) this.shieldT = dur;
  }
  /* 总护盾：HUD 与实力评估只看总数 */
  get shieldTotal() { return this.shield + this.tShield; }
  takeDamage(n, g, sx, sy) {
    if (this.invuln > 0 || this.dead) return;
    if (this.charging) this.chargeT = 0;      // 受伤打断蓄力进度（需重新蓄）
    /* 舞剑流：蓄势中挨打 → 剑势溃散，专属技能立刻进冷却。
       突进本身无敌（上面的 invuln 提前返回），所以真正的软肋
       只是「蓄势的那半秒」，这套连招的赌注就压在这里。 */
    if (this.wjCharging) this.wjInterrupt(g);
    if (this.shieldTotal > 0) {
      // 先消耗限时护盾（横竖要散），再扣常驻护盾
      if (this.tShield > 0) this.tShield--;
      else this.shield--;
      this.invuln = this.stats.iframe;
      SFX.hurt(); g.shake(4);
      g.burst(this.x, this.y, 10, PAL.jade);
      return;
    }
    // 气血单位是「半颗心」，必须是整数：精英余祸之类的小数伤害（1.1 / 1.2）若直接累加，
    // 会得到 hp = 0.8 这种「血条整条空、人却还活着」的假死相。这里取整兜底。
    this.hp -= Math.max(1, Math.round(n));
    this.invuln = this.stats.iframe;
    SFX.hurt(); g.shake(7); g.hurtFlash = 12;
    if (sx !== undefined) {
      const a = Math.atan2(this.y - sy, this.x - sx);
      this.vx += Math.cos(a) * 3; this.vy += Math.sin(a) * 3;
    }
    if (this.hp <= 0) { this.hp = 0; this.dead = true; g.onPlayerDead(); }
  }
  /* 舞剑流：蓄势被打断 —— 剑势溃散，连招归零，技能立刻进入完整冷却 */
  wjInterrupt(g) {
    if (!this.wjCharging) return;
    this.wjCharging = false; this.wjChargeT = 0; this.wjFull = false;
    this.wjStage = 0; this.wjChainT = 0;
    if (this.ult) this.ultCd = ultCdOf(this.ult, 'wujian');
    if (g) {
      g.burst(this.x, this.y, 16, PAL.red);
      g.floaters.push(new Floater(this.x, this.y - 28, '剑势溃散', PAL.redL));
    }
  }
  give(id, g) {
    const def = ITEM_MAP[id];
    if (!def) return;
    if (def.type === 'fabao') {
      const rank = this.items.filter(i => i === id).length;   // 已持有几件 = 当前阶数
      this.items.push(id);
      if (def.func) {
        // 功能型：重复拿到即进阶，数值与文案都随阶数变化
        def.apply(this, rank, g.style);
        if (rank > 0) g.floaters.push(new Floater(this.x, this.y - 20, 'UPGRADE', PAL.goldL));
      } else {
        // 数值型：可以重复，效果直接叠加，另给一点精炼补偿
        if (rank > 0) { this.stats.damage += 0.5; g.floaters.push(new Floater(this.x, this.y - 20, 'REFINED', PAL.jade)); }
        def.apply(this, rank, g.style);
      }
      g.itemPopup = { def, t: 160, rank: rank };
      SFX.pickup();
    } else if (def.type === 'dan') {
      def.apply(this);
      g.itemPopup = { def, t: 110 };
      g.floaters.push(new Floater(this.x, this.y - 20, itemView(def, g.style).name, PAL.gold));
      SFX.pickup();
    } else {
      // 小技能（原功法）：入槽 / 升级 / 槽满则弹替换界面
      const r = this.addSkill(id);
      if (r === 'replace') { g.openSkillReplace(id); return; }
      if (r === 'maxed') {
        // 已满级：折成灵力上限 + 一点即时灵力，免得白捡
        this.maxMP += 5; this.mp = Math.min(this.maxMP, this.mp + 25);
        g.floaters.push(new Floater(this.x, this.y - 20, '灵力上限 +5', PAL.cyan));
        SFX.pickup();
        return;
      }
      const s = this.slots.find(v => v && v.id === id);
      g.itemPopup = { def, t: 140, rank: (s ? s.lv - 1 : 0) };
      g.floaters.push(new Floater(this.x, this.y - 20,
        r === 'level' ? ('技能 Lv.' + s.lv) : '习得 ' + def.name, PAL.cyan));
      SFX.pickup();
    }
  }
  /* ---------------- 小技能槽 ---------------- */
  /* 返回：new = 新入槽 / level = 升级 / maxed = 已满级 / replace = 槽满需替换 */
  addSkill(id) {
    for (const s of this.slots) {
      if (s && s.id === id) {
        if (s.lv >= SKILL_MAX_LV) return 'maxed';
        s.lv++;
        return 'level';
      }
    }
    const i = this.slots.indexOf(null);
    if (i >= 0) { this.slots[i] = { id: id, lv: 1 }; this.skillCd[i] = 0; this.slotIdx = i; return 'new'; }
    return 'replace';
  }
  /* 替换槽位：换上的技能从 1 级重新起算，冷却也一并清零 */
  replaceSkill(idx, id) {
    if (idx < 0 || idx >= this.slots.length) return;
    this.slots[idx] = { id: id, lv: 1 };
    this.skillCd[idx] = 0;
    this.slotIdx = idx;
  }
  /* 当前选中的小技能（可能为空） */
  curSkill() { return this.slots[this.slotIdx] || null; }
  /* 切到有技能的槽位；空槽不切换 */
  selectSlot(i) {
    if (i < 0 || i >= this.slots.length) return false;
    if (!this.slots[i]) return false;
    this.slotIdx = i; return true;
  }
  /* ---------------- 专属技能 ---------------- */
  giveUlt(style) {
    if (this.ult) return false;
    this.ult = { style: style, paths: {} };
    return true;
  }
  learnPath(pathId) {
    if (!this.ult) return;
    this.ult.paths[pathId] = (this.ult.paths[pathId] || 0) + 1;
  }
  update(g, input) {
    if (this.dead) return;
    if (this.invuln > 0) this.invuln--;
    if (this.soulBuff > 0) this.soulBuff--;
    if (this.shootCd > 0) this.shootCd--;
    // 灵力：自然回复走 stats.mpRegen（开局为 0，全靠「回灵符」法宝堆）。
    // 用整数计数而不是累加浮点 —— 累加 4/60 会因浮点误差拖成每 16 帧才回 1 点。
    if (this.mp > this.maxMP) this.mp = this.maxMP;
    const mpr = this.stats.mpRegen || 0;
    if (this.mp < this.maxMP && mpr > 0) {
      this.mpTick = (this.mpTick || 0) + 1;
      const every = Math.max(1, Math.round(60 / mpr));
      if (this.mpTick >= every) { this.mpTick = 0; this.mp = Math.min(this.maxMP, this.mp + 1); }
    } else {
      this.mpTick = 0;
    }
    if (this.skillGcd > 0) this.skillGcd--;
    if (this.ultCd > 0) this.ultCd--;
    if (this.ultCdFlash > 0) this.ultCdFlash--;
    // 各槽位独立冷却（挂在槽位上而不是技能上，切槽不能重置）
    for (let i = 0; i < this.skillCd.length; i++) if (this.skillCd[i] > 0) this.skillCd[i]--;
    // 限时护盾（护体金光）：到点整层散去；常驻护盾不受影响
    if (this.shieldT > 0 && --this.shieldT === 0 && this.tShield > 0) {
      this.tShield = 0;
      g.burst(this.x, this.y, 10, PAL.jade);
      g.floaters.push(new Floater(this.x, this.y - 26, '护盾消散', PAL.grey));
    }
    const B = this.buffs;
    if (B.spdT > 0) B.spdT--; else B.spdMul = 0;
    if (B.chargeT > 0) B.chargeT--; else B.chargeMul = 0;
    if (B.dmgT > 0) B.dmgT--; else B.dmgMul = 0;
    for (let i = this.dashTrail.length - 1; i >= 0; i--) {
      if (--this.dashTrail[i].t <= 0) this.dashTrail.splice(i, 1);
    }
    /* 流派特有的每帧逻辑：舞剑流的蓄势 / 突进 / 五连斩都由它推进。
       放在位移之前 —— 突进要接管本帧的位移，之后再走常规移动就重复了。 */
    const stx = STYLES[g.style];
    if (stx && stx.tick) stx.tick(this, g, input);

    let mx = 0, my = 0;
    if (input.up) my -= 1;
    if (input.down) my += 1;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    const m = Math.hypot(mx, my);
    if (m > 0) { mx /= m; my /= m; }
    if (this.dashing || this.dashFlurry > 0) {
      // 突进与五连斩期间位移由技能接管，常规移动让位（避免两股速度叠加）
      this.vx = 0; this.vy = 0;
    } else {
      const sp = this.stats.speed * (1 + (B.spdMul || 0));
      this.vx = lerp(this.vx, mx * sp, 0.28);
      this.vy = lerp(this.vy, my * sp, 0.28);
      this.x += this.vx; this.y += this.vy;
      g.collideRoom(this, this.r, true);
    }

    // 朝向
    if (m > 0) {
      if (Math.abs(mx) > Math.abs(my)) { this.dir = 'side'; this.face = mx > 0 ? 1 : -1; }
      else this.dir = my > 0 ? 'down' : 'up';
    } else if (input.aiming) {
      const a = input.aimAngle;
      const amx = Math.cos(a), amy = Math.sin(a);
      if (Math.abs(amx) > Math.abs(amy)) { this.dir = 'side'; this.face = amx > 0 ? 1 : -1; }
      else this.dir = amy > 0 ? 'down' : 'up';
    }
    if (m > 0) { this.animT++; if (this.animT % 9 === 0) this.anim = this.anim ? 0 : 1; }
    else { this.anim = 0; this.animT = 0; }

    if (this.swingT > 0) this.swingT--;      // 挥剑动作（舞剑流平A）

    // 攻击：全部分派给当前流派（见文件末尾的 STYLES）
    this.attack(g, input);
  }

  attack(g, input) {
    const st = STYLES[g.style] || STYLES.feijian;
    if (st.attack) st.attack(this, g, input);
  }

  draw(g2) {
    // 突进残影：由近及远淡出，把「一瞬位移」的轨迹补出来
    if (this.dashTrail.length) {
      g2.save();
      for (const t of this.dashTrail) {
        const k = t.t / 10;
        let ts = (this.dir === 'side') ? (this.face > 0 ? SPR.playerCharge.side[0] : SPR.playerChargeSideL[0])
                                       : SPR.playerCharge[this.dir][0];
        if (ts) {
          g2.globalAlpha = 0.30 * k;
          g2.drawImage(ts, t.x - ts.width / 2, t.y - ts.height + 8);
        }
      }
      g2.restore();
    }
    // 蓄势 / 突进时换成坐胯按剑的蓄力姿态；出刀的那几帧换成挥剑姿态
    const pressed = this.wjCharging || this.dashing || this.dashFlurry > 0;
    const swinging = !pressed && this.swingT > 0;
    let s;
    if (pressed) {
      const fr = this.wjFull ? (Math.floor(this.wjChargeT / 3) % 2) : (Math.floor(this.wjChargeT / 8) % 2);
      s = (this.dir === 'side') ? (this.face > 0 ? SPR.playerCharge.side : SPR.playerChargeSideL)[fr]
                                : SPR.playerCharge[this.dir][fr];
    } else if (swinging) {
      // 三帧均分挥剑时长：起手 → 力劈 → 收势
      const fr = Math.min(2, Math.floor((SWING_ANIM - this.swingT) / (SWING_ANIM / 3)));
      s = (this.dir === 'side') ? (this.face > 0 ? SPR.playerSwing.side : SPR.playerSwingSideL)[fr]
                                : SPR.playerSwing[this.dir][fr];
    } else if (this.dir === 'side') s = (this.face > 0 ? SPR.player.side : SPR.playerSideL)[this.anim];
    else s = SPR.player[this.dir][this.anim];
    g2.save();
    g2.globalAlpha = 0.3; g2.fillStyle = '#000';
    g2.beginPath(); g2.ellipse(this.x, this.y + 8, 7, 3, 0, 0, Math.PI * 2); g2.fill();
    g2.globalAlpha = 1;
    if (this.invuln > 0 && Math.floor(this.invuln / 4) % 2 === 0) g2.globalAlpha = 0.45;
    if (this.wjCharging || this.dashing) {
      // 蓄势光晕：随蓄力涨大，蓄满转金
      const k = Math.min(1, this.wjChargeT / WJ.charge);
      g2.globalAlpha = 0.18 + 0.30 * k;
      g2.fillStyle = this.wjFull ? PAL.goldL : PAL.jade;
      g2.beginPath(); g2.arc(this.x, this.y - 2, 12 + k * 6 + Math.sin(this.wjChargeT * 0.4) * 1.5, 0, Math.PI * 2); g2.fill();
      g2.globalAlpha = 1;
    }
    g2.drawImage(s, this.x - s.width / 2, this.y - s.height + 8);
    g2.globalAlpha = 1;
    // 护盾光环
    if (this.shieldTotal > 0) {
      g2.strokeStyle = PAL.jade; g2.globalAlpha = 0.5 + Math.sin(Date.now() / 200) * 0.2;
      g2.lineWidth = 1;
      g2.beginPath(); g2.arc(this.x, this.y - 2, 12, 0, Math.PI * 2); g2.stroke();
      g2.globalAlpha = 1;
    }
    if (this.soulBuff > 0) {
      g2.globalAlpha = 0.4; g2.fillStyle = PAL.purpleL;
      g2.beginPath(); g2.arc(this.x, this.y, 14, 0, Math.PI * 2); g2.fill(); g2.globalAlpha = 1;
    }
    g2.restore();
  }
}

/* ------------------------------------------------------------
 *  场景交互物（宝箱 / 坊市商品 / 祭坛 / 传送阵）
 * ---------------------------------------------------------- */
class Prop {
  constructor(kind, x, y, opt) {
    Object.assign(this, { kind, x, y, r: 12 }, opt || {});
    if (kind === 'portal') this.delay = 70;
    this.t = Math.random() * 100;
    this.dead = false;
  }
  update(g) {
    this.t++;
    if (this.kind === 'chest' && !this.opened) {
      const p = g.player;
      if (circleHit(this.x, this.y, 14, p.x, p.y, p.r)) {
        if (this.locked) {                       // 金匣：需 1 把钥匙
          g.chestHint = this;
          if (g.input.interact && (this._msgCd || 0) <= 0) {
            this._msgCd = 30;
            if (g.keys > 0) {
              g.keys--; g.chestHint = null;
              g.floaters.push(new Floater(this.x, this.y - 22, 'KEY', PAL.gold));
              this.open(g);
            } else {
              g.floaters.push(new Floater(this.x, this.y - 22, 'NEED KEY', PAL.red));
            }
          }
          if (this._msgCd > 0) this._msgCd--;
        } else this.open(g);
      }
    }
    if (this.kind === 'shop' && !this.sold) {
      const p = g.player;
      if (circleHit(this.x, this.y + 6, 18, p.x, p.y, p.r)) {
        // 货架挨得近，可能同时进射程：只把最近的一件挂成提示，预览才不会来回跳
        const dd = dist2(this.x, this.y + 6, p.x, p.y);
        if (dd < g.input.shopDist) { g.input.shopDist = dd; g.shopHint = this; }
        // 所见即所买：只卖正在预览的那一件
        if (g.shopHint === this && g.input.interact) {
          if (g.coins >= this.price) {
            g.coins -= this.price; this.sold = true; if (this.src) this.src.sold = true; g.shopHint = null;
            g.addItemPedestal(this.x, this.y - 4, this.item);
            SFX.pickup();
          } else {
            g.floaters.push(new Floater(this.x, this.y - 20, 'NO COIN', PAL.red));
          }
        }
      }
    }
    if (this.kind === 'item') {
      const p = g.player;
      if (circleHit(this.x, this.y + 4, 14, p.x, p.y, p.r)) {
        // 二选一（Boss 奖励）：必须按 E 确认，并把效果摊开给玩家看，
        // 走过去就自动吞掉的话根本来不及比较，也容易误拿。
        if (this.group) {
          g.pickHint = this;
          if (!g.input.interact) return;
          g.pickHint = null;
        }
        p.give(this.item, g); this.dead = true;
        if (this.src) this.src.taken = true;
        this.consumeGroup(g);
        g.burst(this.x, this.y, 18, PAL.gold);
      }
    }
    if (this.kind === 'altar') {
      const p = g.player;
      if (circleHit(this.x, this.y + 4, 20, p.x, p.y, p.r)) {
        g.altarHint = this;
        if (g.input.interact && !this.used && p.hp > 2) {
          this.used = true; if (this.src) this.src.used = true; g.altarHint = null;
          p.hp -= 2;
          g.burst(this.x, this.y - 10, 26, PAL.red);
          g.shake(6);
          if (Math.random() < 0.65 + p.stats.luck * 0.03) {
            // 三成机缘是功法传承（小技能），其余仍是法宝
            g.addItemPedestal(this.x, this.y - 4, Math.random() < 0.3 ? g.rollSkill() : g.rollFabao());
            SFX.pickup();
          } else {
            g.takeReserve(this.x, this.y - 10, 8);
            g.floaters.push(new Floater(this.x, this.y - 30, 'FAILED', PAL.grey));
          }
        }
      }
    }
    if (this.kind === 'portal') {
      if (this.delay > 0) { this.delay--; return; }
      const p = g.player;
      if (circleHit(this.x, this.y, 16, p.x, p.y, p.r)) g.portalHint = true;
    }
  }
  /* 法器二选一：同组摆件在取走一件后全部消散（写回房间数据，出门再回来也不会复活） */
  consumeGroup(g) {
    if (!this.group) return;
    for (const pr of g.props) {
      if (pr === this || pr.kind !== 'item' || pr.group !== this.group || pr.dead) continue;
      pr.dead = true;
      if (pr.src) pr.src.taken = true;
      g.burst(pr.x, pr.y, 10, PAL.purpleL);
    }
  }
  open(g) {
    this.opened = true;
    if (this.src) this.src.opened = true;
    SFX.chest();
    g.burst(this.x, this.y, 20, PAL.gold);
    // 金匣花掉一把钥匙，回报改成「一件珍稀法宝」（原先是两件普通法宝，与一把钥匙不匹配）
    if (this.gold) {
      g.addItemPedestal(this.x, this.y + 8, g.rollRareFabao());
      if (Math.random() < 0.35) g.addItemPedestal(this.x + 16, this.y + 20, g.rollSkill());
    } else {
      g.addItemPedestal(this.x - 12, this.y + 6, g.rollFabao());
    }
    if (Math.random() < 0.5) g.takeReserve(this.x - 12, this.y + 8, 3);
    // 开箱给不给心血，同样看当前血量（越危险越容易给）
    if (Math.random() < g.heartRate() * 2.2) g.dropPickup('heart', this.x + 12, this.y + 8, 1);
  }
  draw(g2, g) {
    const bob = Math.sin(this.t * 0.06) * 1.5;
    switch (this.kind) {
      case 'chest': {
        const s = SPR.chest[this.opened ? 1 : 0];
        g2.save(); g2.globalAlpha = 0.28; g2.fillStyle = '#000';
        g2.beginPath(); g2.ellipse(this.x, this.y + 10, 12, 4, 0, 0, Math.PI * 2); g2.fill(); g2.restore();
        g2.drawImage(s, this.x - s.width / 2, this.y - s.height + 10);
        if (this.locked && !this.opened) {
          // 金匣：鎏金光晕 + 悬一把钥匙提示
          g2.save(); g2.globalAlpha = 0.22 + Math.sin(this.t * 0.08) * 0.1;
          g2.fillStyle = PAL.gold;
          g2.beginPath(); g2.arc(this.x, this.y - 4, 13, 0, Math.PI * 2); g2.fill(); g2.restore();
          const k = SPR.key;
          if (k) g2.drawImage(k, this.x - k.width / 2, this.y - 30 + bob);
        }
        break;
      }
      case 'item': {
        const ped = SPR.pedestal, ic = ITEM_ICONS[this.item];
        g2.drawImage(ped, this.x - ped.width / 2, this.y - ped.height + 14);
        if (ic) g2.drawImage(ic, this.x - 8, this.y - 34 + bob);
        g2.save(); g2.globalAlpha = 0.25 + Math.sin(this.t * 0.1) * 0.12;
        g2.fillStyle = this.group ? PAL.goldL : PAL.gold;
        g2.beginPath(); g2.arc(this.x, this.y - 18 + bob, 12, 0, Math.PI * 2); g2.fill(); g2.restore();
        // 二选一：标出「择其一」，取走一件另一件即散
        if (this.group) {
          g2.save(); g2.globalAlpha = 0.75 + Math.sin(this.t * 0.12) * 0.2;
          drawPixelText(g2, 'PICK 1', this.x - 18, this.y - 48 + bob, 1, PAL.goldL); g2.restore();
        }
        break;
      }
      case 'shop': {
        const ped = SPR.pedestal, ic = ITEM_ICONS[this.item];
        if (this.sold) {
          g2.drawImage(ped, this.x - ped.width / 2, this.y - ped.height + 14);
        } else {
          g2.drawImage(ped, this.x - ped.width / 2, this.y - ped.height + 14);
          if (ic) g2.drawImage(ic, this.x - 8, this.y - 34 + bob);
          drawPixelText(g2, String(this.price), this.x - 4, this.y + 4, 1, g && g.coins >= this.price ? PAL.gold : PAL.grey);
        }
        break;
      }
      case 'keeper':
        g2.drawImage(SPR.keeper, this.x - 10, this.y - 24);
        break;
      case 'altar': {
        g2.drawImage(SPR.altar, this.x - 15, this.y - 18);
        if (!this.used) {
          g2.save(); g2.globalAlpha = 0.3 + Math.sin(this.t * 0.08) * 0.15;
          g2.fillStyle = PAL.red; g2.beginPath(); g2.arc(this.x, this.y - 4, 14, 0, Math.PI * 2); g2.fill(); g2.restore();
        }
        break;
      }
      case 'lantern':
        g2.drawImage(SPR.lantern, this.x - 7, this.y - 20);
        g2.save(); g2.globalAlpha = 0.12 + Math.sin(this.t * 0.05) * 0.05;
        g2.fillStyle = PAL.orange; g2.beginPath(); g2.arc(this.x, this.y - 10, 16, 0, Math.PI * 2); g2.fill(); g2.restore();
        break;
      case 'incense':
        g2.drawImage(SPR.incense, this.x - 8, this.y - 16);
        break;
      case 'rune': {
        g2.save();
        g2.globalAlpha = 0.18 + Math.sin(this.t * 0.02) * 0.06;
        g2.strokeStyle = PAL.jade; g2.lineWidth = 1;
        const r = 24 + Math.sin(this.t * 0.03) * 3;
        g2.beginPath(); g2.arc(this.x, this.y, r, 0, Math.PI * 2); g2.stroke();
        g2.beginPath(); g2.arc(this.x, this.y, r * 0.6, 0, Math.PI * 2); g2.stroke();
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4 + this.t * 0.006;
          g2.beginPath(); g2.moveTo(this.x + Math.cos(a) * r * 0.6, this.y + Math.sin(a) * r * 0.6);
          g2.lineTo(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r); g2.stroke();
        }
        g2.restore();
        break;
      }
      case 'portal': {
        g2.save();
        g2.translate(this.x, this.y);
        g2.globalAlpha = 0.9;
        for (let k = 0; k < 3; k++) {
          const r = 20 + k * 7 + Math.sin(this.t * 0.05 + k) * 2;
          g2.strokeStyle = [PAL.jade, PAL.gold, PAL.purpleL][k];
          g2.lineWidth = 1;
          g2.beginPath(); g2.arc(0, 0, r, this.t * 0.02 * (k % 2 ? -1 : 1), this.t * 0.02 * (k % 2 ? -1 : 1) + Math.PI * 1.4); g2.stroke();
        }
        // 八卦
        g2.globalAlpha = 0.5;
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4 + this.t * 0.01;
          g2.strokeStyle = PAL.jadeL;
          g2.beginPath();
          g2.arc(Math.cos(a) * 14, Math.sin(a) * 14, 3, 0, Math.PI * 2); g2.stroke();
        }
        g2.globalAlpha = 0.25 + Math.sin(this.t * 0.07) * 0.1;
        g2.fillStyle = PAL.jade;
        g2.beginPath(); g2.arc(0, 0, 14, 0, Math.PI * 2); g2.fill();
        g2.restore();
        if (Math.random() < 0.4) {
          g2.fillStyle = PAL.jadeL;
          const a = Math.random() * Math.PI * 2, rr = 18 + Math.random() * 10;
          g2.fillRect(this.x + Math.cos(a) * rr, this.y + Math.sin(a) * rr * 0.6, 1, 1);
        }
        break;
      }
      case 'coin': {
        const s = SPR.coin;
        g2.drawImage(s, this.x - 5, this.y - 5 + Math.sin(this.t * 0.1) * 2);
        break;
      }
    }
  }
}

/* ============================================================
 *  流派表（STYLES）—— 新增流派只需在此登记一项
 *
 *  设计约定：
 *   1) consts  = 机制固有参数（不来自法宝），各流派私有
 *   2) use     = 属性契约：声明本流派如何消费 p.stats 的每一项。
 *                加流派时若漏了某项，死属性检查会报出来，
 *                不会出现「拿了没用」或「数值爆炸」的暗坑。
 *   3) attack  = 每帧唯一的攻击入口，Player.update 只做一次分派
 *   4) ready   = false 的流派仅登记契约，不出现在选择界面
 * ============================================================ */

/* 射速基准：把 fireRate 折算成非射击流派的「速度系数」时的分母 */
const BASE_FIRE_RATE = 2.6;

/* 舞剑流挥剑动作的总帧数：姿态三帧（起手 / 力劈 / 收势）均分这段时间，
   与单次挥砍的间隔（约 23 帧）之比决定了「挥」占多少比重 */
const SWING_ANIM = 12;

/* 取共同的瞄准角：鼠标 / 方向键 / 人物朝向 */
function aimAngleOf(pl, input) {
  if (input.aiming) return input.aimAngle;
  const d = { down: Math.PI / 2, up: -Math.PI / 2, side: pl.face > 0 ? 0 : Math.PI };
  return d[pl.dir] || Math.PI / 2;
}

const STYLES = {
  feijian: {
    id: 'feijian', name: '飞剑流', en: 'FEIJIAN', tag: '御剑 · 连发', ready: true,
    consts: { r: 6, spreadArc: 0.16, recoil: 0.35 },
    use: {
      damage: '每发飞剑的伤害',
      fireRate: '御剑出手的快慢',
      spread: '同时射出的飞剑数',
      range: '飞剑的飞行距离',
      pierce: '可穿透的妖物数',
      knockback: '命中击退',
      homing: '飞剑自动追敌',
      burn: '灼烧', frost: '冰封', chain: '引雷连锁',
      crit: '暴击几率', deflect: '击落敌方术法', reflect: null
    },
    attack(pl, g, input) {
      if (!input.shooting || pl.shootCd > 0) return;
      pl.shootCd = Math.max(6, Math.round(60 / pl.stats.fireRate));
      const a = aimAngleOf(pl, input);
      const s = pl.stats;
      const count = 1 + s.spread;
      const dmgBonus = pl.soulBuff > 0 ? 1.2 + Math.max(0, s.soul - 1) * 0.9 : 0;
      for (let i = 0; i < count; i++) {
        const ang = a + (i - (count - 1) / 2) * STYLES.feijian.consts.spreadArc;
        g.bullets.push(new Bullet(
          pl.x + Math.cos(ang) * 10, pl.y + Math.sin(ang) * 6,
          Math.cos(ang) * s.shotSpeed, Math.sin(ang) * s.shotSpeed,
          {
            friendly: true, dmg: (s.damage + dmgBonus) * (1 + (pl.buffs.dmgMul || 0)), r: STYLES.feijian.consts.r,
            life: Math.round(s.range / s.shotSpeed),
            pierce: s.pierce, homing: s.homing, knockback: s.knockback,
            burn: s.burn, frost: s.frost, chain: s.chain,
            crit: Math.random() < s.crit, deflect: s.deflect,
            kind: 'sword', sprite: SPR.sword,
            scale: 0.8 + Math.min(0.6, s.damage * 0.03)
          }
        ));
      }
      pl.vx -= Math.cos(a) * STYLES.feijian.consts.recoil;
      pl.vy -= Math.sin(a) * STYLES.feijian.consts.recoil;
      SFX.shoot();
      g.burst(pl.x + Math.cos(a) * 12, pl.y + Math.sin(a) * 8, 3, PAL.jadeL);
    }
  },

  jujian: {
    id: 'jujian', name: '巨剑流', en: 'JUJIAN', tag: '蓄力 · 两段', ready: true,
    consts: { T1: CHARGE.t1, T2: CHARGE.t2, MAX: CHARGE.max, tiers: CHARGE_TIER, minRate: 0.35 },
    use: {
      damage: '每击伤害 × 段位倍率（最高 ×2.8）',
      fireRate: '蓄力速度与出剑后摇（越快越早满蓄、连击越顺）',
      spread: '折算为剑身宽度与威力（不分剑）',
      range: '飞行距离系数',
      pierce: '额外穿透数（段位本身已带穿透）',
      knockback: '击退（随段位加重）',
      homing: '巨剑自动追敌',
      burn: '灼烧', frost: '冰封', chain: '引雷连锁',
      crit: '暴击几率', deflect: '击落敌方术法', reflect: null
    },
    /* 蓄力速度：射速按基准折算，灵犀玉佩蓄得更快、玄铁重剑蓄得更慢 */
    chargeRate(s, pl) {
      // 「蓄势待发」的临时加成直接乘在这里，蓄力与出剑后摇同步变快
      return Math.max(STYLES.jujian.consts.minRate, s.fireRate / BASE_FIRE_RATE) * (1 + (pl && pl.buffs ? pl.buffs.chargeMul : 0));
    },
    attack(pl, g, input) {
      if (pl.chargeFlash > 0) pl.chargeFlash--;
      /* 出剑后摇：期间凝不住剑，按住无效。
         没有这道限制时，玩家可以「按一帧、松一帧」疯狂点射，
         约 30 发/秒 —— 远快过飞剑流的 2.6 发/秒，附魔特效会刷屏。 */
      if (pl.shootCd > 0) {
        pl.charging = false; pl.chargeT = 0;
        return;
      }
      if (input.shooting) {
        pl.charging = true;
        /* 方向必须在按住期间锁存：松手那一帧 computeAim() 已把 aiming 置否，
           届时再取 aimAngle 会拿不到，巨剑就会退化成按人物朝向飞出去。 */
        if (input.aiming) pl.chargeAim = input.aimAngle;
        const before = chargeTier(pl.chargeT);
        pl.chargeT = Math.min(pl.chargeT + STYLES.jujian.chargeRate(pl.stats, pl), CHARGE.max);
        const after = chargeTier(pl.chargeT);
        if (after > before) {                       // 跨段：闪光 + 提频音
          pl.chargeFlash = 14;
          SFX.chargeUp(after);
          g.burst(pl.x, pl.y - 6, 12, after === 2 ? PAL.gold : PAL.jadeL);
        }
        if (pl.chargeT > 0 && Math.floor(pl.chargeT) % 6 === 0) {
          const a = Math.random() * Math.PI * 2, rr = 17 + Math.random() * 7;
          g.particles.push(new Particle(
            pl.x + Math.cos(a) * rr, pl.y - 2 + Math.sin(a) * rr,
            -Math.cos(a) * 1.0, -Math.sin(a) * 1.0, 15,
            after === 2 ? PAL.gold : PAL.jade, 1, 0
          ));
        }
        return;
      }
      if (pl.charging) { STYLES.jujian.release(pl, g, input); pl.charging = false; pl.chargeT = 0; }
    },
    /* 放出巨剑：段位决定穿透数 / 剑身宽度 / 飞行距离 */
    release(pl, g, input) {
      const a = (pl.chargeAim !== null && pl.chargeAim !== undefined) ? pl.chargeAim : aimAngleOf(pl, input);
      const tier = chargeTier(pl.chargeT);
      const T = CHARGE_TIER[tier];
      const s = pl.stats;
      const dmgBonus = pl.soulBuff > 0 ? 1.2 + Math.max(0, s.soul - 1) * 0.9 : 0;
      const wideBonus = s.spread * 0.35;          // 分裂法宝折算成剑宽与威力
      g.bullets.push(new Bullet(
        pl.x + Math.cos(a) * 12, pl.y + Math.sin(a) * 8,
        Math.cos(a) * s.shotSpeed * 1.15, Math.sin(a) * s.shotSpeed * 1.15,
        {
          friendly: true,
          dmg: (s.damage + dmgBonus) * T.dmgMul * (1 + wideBonus) * (1 + (pl.buffs.dmgMul || 0)),
          r: T.r + wideBonus * 4,
          life: Math.round(T.life * (0.8 + s.range / 700)),
          pierce: T.pierce + s.pierce,
          homing: s.homing, knockback: s.knockback + tier * 1.2,
          burn: s.burn, frost: s.frost, chain: s.chain,
          crit: Math.random() < s.crit, deflect: s.deflect,
          kind: 'jujian', sprite: SPR.jujian, scale: T.scale
        }
      ));
      pl.vx -= Math.cos(a) * (0.8 + tier * 0.5);
      pl.vy -= Math.sin(a) * (0.8 + tier * 0.5);
      g.shake(2 + tier * 3);
      SFX.chargeShot(tier);
      g.burst(pl.x + Math.cos(a) * 14, pl.y + Math.sin(a) * 10,
              6 + tier * 6, tier === 2 ? PAL.gold : PAL.jadeL);
      // 出剑后摇：与蓄力同样受 fireRate 折算，射速法宝两头都吃到
      const cd = Math.max(4, Math.round(T.cd / STYLES.jujian.chargeRate(pl.stats, pl)));
      pl.shootCd = cd; pl.chargeCdMax = cd;
    }
  },

  /* ---------- 舞剑流：贴脸挥砍 + 蓄势突进连段 ---------- */
  wujian: {
    id: 'wujian', name: '舞剑流', en: 'WUJIAN', tag: '近战 · 连斩', ready: true,
    consts: {
      arc: 1.36,        // 基础挥砍弧度（rad，约 78°）
      reach: 46,        // 基础剑锋触及半径（近战要贴脸，但总得够到枪尖之外）
      dmgScale: 1.10,   // 近战系数：贴脸挨撞的风险溢价，单刀高于飞剑的单发
      spreadArc: 0.24,  // 每份 spread 折算的额外弧度
      rangePer: 0.07,   // 每点 range 折算的额外触及
      baseHits: 3,      // 基础可命中的妖物数（再加 pierce）
      step: 0.8,        // 挥砍时的小幅前冲
      swingMin: 10,     // 挥砍的最短间隔（帧），防止极端射速刷特效
      lungeKnock: 1.6,  // 击退基数（再加 knockback）
      deflectR: 6       // 体质自带：挥砍顺带斩落周边术法的额外半径
    },
    use: {
      damage: '每次挥砍的伤害（近战系数 1.10 折算）',
      fireRate: '挥砍速度',
      spread: '挥砍弧度',
      range: '剑锋触及范围',
      pierce: '同一次挥砍可多命中的妖物数（基础 3 个）',
      knockback: '击退',
      homing: '突进时自动偏转追向最近的妖物',
      burn: '灼烧', frost: '冰封', chain: '引雷连锁',
      crit: '暴击几率',
      deflect: null,   // 玄元镜在本流派下改走 reflect，不再叠加斩落半径
      reflect: '玄元镜化名「照影镜」：斩中的术法原路打回去，满阶起自行追敌'
    },
    /* 蓄势速度：与巨剑流同一口径（fireRate / 基准），
       升级路线「凝神聚气」再乘一层，故射速法宝在舞剑流同样两头都吃到 */
    chargeRate(s, pl) {
      const base = Math.max(0.5, s.fireRate / BASE_FIRE_RATE);
      const path = (pl && pl.ult) ? (1 + ultPathVal(pl.ult, 'wujian', 'charge')) : 1;
      return base * path;
    },
    /* 平A：朝瞄准方向横扫一弧。命中数受 pierce 限制（基础 2 个），
       所以在妖群里要靠走位把握「一刀扫到几只」 */
    attack(pl, g, input) {
      if (!input.shooting || pl.shootCd > 0) return;
      const s = pl.stats;
      const C = STYLES.wujian.consts;
      const a = aimAngleOf(pl, input);
      const arc = C.arc + s.spread * C.spreadArc;
      const reach = C.reach + (s.range - 210) * C.rangePer;
      const maxHits = C.baseHits + s.pierce;
      pl.shootCd = Math.max(C.swingMin, Math.round(60 / s.fireRate));
      const dmgBonus = pl.soulBuff > 0 ? 1.2 + Math.max(0, s.soul - 1) * 0.9 : 0;
      const base = (s.damage + dmgBonus) * C.dmgScale * (1 + (pl.buffs.dmgMul || 0));
      const col = pl.soulBuff > 0 ? PAL.purpleL : PAL.jadeL;

      // 弧内候选：按距离由近及远，先扫到离剑锋最近的那几只
      const cand = [];
      for (const e of g.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - pl.x, e.y - pl.y);
        if (d > reach + e.r) continue;
        let da = Math.atan2(e.y - pl.y, e.x - pl.x) - a;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        // 妖物体型也算进判定：贴脸的大妖不该因为圆心偏出弧外就劈不中
        if (Math.abs(da) > arc / 2 + Math.atan2(e.r, Math.max(10, d))) continue;
        cand.push({ e: e, d: d });
      }
      cand.sort((x, y) => x.d - y.d);
      const hit = cand.slice(0, maxHits);
      for (const it of hit) {
        const e = it.e;
        const crit = Math.random() < s.crit;
        const dmg = base * (crit ? 2 : 1);
        e.hurt(dmg, g, null, crit);
        const ang = Math.atan2(e.y - pl.y, e.x - pl.x);
        const kb = C.lungeKnock + s.knockback;
        e.kbx += Math.cos(ang) * kb; e.kby += Math.sin(ang) * kb;
        if (s.frost) e.frost = Math.max(e.frost, 70 + s.frost * 35);
        if (s.burn) { e.burn = Math.max(e.burn, 120); e.burnDmg = s.burn; }
        if (s.chain) g.chainLightning(e, dmg * 0.6, s.chain);
        g.burst(e.x, e.y, 6, crit ? PAL.gold : col);
      }
      // 剑罡：近战体质本身就斩得落周身的术法，不必等法宝 ——
      // 这是舞剑流对弹幕的正面答案，也是它敢贴脸的底气。
      // 拿到「玄元镜」（本流派化名「照影镜」）后，斩中的术法不再就地湮灭，
      // 而是掉头打回去；没拿到则只是斩落。
      const dr = reach + C.deflectR;
      for (const b of g.bullets) {
        if (b.friendly || b.dead) continue;
        if (!circleHit(pl.x, pl.y - 2, dr, b.x, b.y, b.r)) continue;
        if (s.reflect > 0) { reflectBullet(b, pl, g); continue; }
        b.dead = true; g.burst(b.x, b.y, 9, PAL.cyan);
      }
      g.slashes.push(new Slash(pl.x, pl.y, a, arc, reach,
        { col: col, life: SWING_ANIM, sweep: true }));
      if (pl.soulBuff > 0) g.slashes.push(new Slash(pl.x, pl.y, a, arc * 0.7, reach * 1.12,
        { col: PAL.purpleL, life: 8 }));
      if (!pl.dashing) { pl.vx += Math.cos(a) * C.step; pl.vy += Math.sin(a) * C.step; }
      pl.swingT = SWING_ANIM;
      SFX.slash(0);
    },

    /* ---------------- 专属技能 · 剑影三叠 ---------------- */
    /* 按下空格：开始蓄势（可在连段窗口内无视冷却再接一段） */
    ultDown(pl, g) {
      if (pl.dead) return 'dead';
      if (pl.dashing || pl.dashFlurry > 0) return 'busy';
      if (pl.wjCharging) return 'charging';
      if (pl.ultCd > 0 && pl.wjChainT <= 0) return 'cd';
      pl.wjCharging = true; pl.wjChargeT = 0; pl.wjFull = false;
      SFX.tone(300, 0.12, 'triangle', 0.10, 560);
      return 'charge';
    },
    /* 松开空格：朝鼠标方向突进。突进距离随蓄势线性增长 ——
       刚够下限就松手是一记 74 px 的中等突进，蓄满则是 185 px、够穿过尊者；
       帧数同步插值，所以短突进的位移小、无敌帧也短
       （「剑势绵长」在蓄满那一端再乘一层，蓄得越久收益越大）。
       只有短于 chargeMin（防误触）才收势，且不消耗冷却 */
    ultUp(pl, g) {
      if (!pl.wjCharging) return false;
      pl.wjCharging = false;
      const charged = pl.wjChargeT;
      pl.wjChargeT = 0; pl.wjFull = false;
      if (charged < WJ.chargeMin) {
        g.floaters.push(new Floater(pl.x, pl.y - 26, '蓄势未足', PAL.grey));
        return false;
      }
      const U = pl.ult;
      const k = wjDashK(charged);
      const len = wjDashLen(pl, charged);
      const dur = Math.round(WJ.durMin + (WJ.dur - WJ.durMin) * k);
      pl.dashing = true;
      pl.dashStage = pl.wjStage;
      pl.dashT = dur;
      pl.dashSpeed = len / dur;
      pl.dashA = ultAimAngle(pl);            // 一律朝鼠标指针，鼠标没动过才退回朝向
      pl.dashHit = new Set();
      pl.dashFlurry = 0; pl.dashFlurryT = 0;
      // 冷却自「第一段」释放那一刻起算；后续段一律不重置 —— 重置等于把前面
      // 突进里斩获的击杀返还整个抹掉。能不能接下一段由 ultDown 的 wjChainT 豁免决定，
      // 与 ultCd 无关，所以这里停手不影响连招。
      if (pl.dashStage === 0) pl.ultCd = ultCdOf(U, 'wujian');
      pl.wjStage = 0; pl.wjChainT = 0;       // 本段已消耗，命中后再点亮连段窗口
      SFX.dash();
      g.burst(pl.x, pl.y, k >= 1 ? 14 : 8, PAL.jadeL);
      g.shake(k >= 1 ? 3 : 2);
      return true;
    },
    /* 每帧推进：连段窗口 / 蓄势 / 突进 / 五连斩 */
    tick(pl, g, input) {
      if (pl.wjChainT > 0 && --pl.wjChainT === 0 && pl.wjStage > 0) {
        // 命中却不接招：连招作废，冷却回满 —— 「用进废退」是这套连招的赌注
        pl.wjStage = 0;
        if (pl.ult) pl.ultCd = ultCdOf(pl.ult, 'wujian');
        if (g) g.floaters.push(new Floater(pl.x, pl.y - 26, '连招中断', PAL.grey));
      }
      if (pl.wjCharging) { STYLES.wujian.tickCharge(pl, g); return; }
      if (pl.dashing) { STYLES.wujian.tickDash(pl, g); return; }
      if (pl.dashFlurry > 0) STYLES.wujian.tickFlurry(pl, g);
    },
    tickCharge(pl, g) {
      /* 接招期的蓄势不再被打断：一段命中之后玩家已经贴在怪堆里了，接下来那半秒
         只要被杂兵摸一下就「剑势溃散 + 技能进完整冷却」，第三段的五连斩根本砍不出来。
         起手那一记仍保留这条赌注（wjStage === 0 时不给无敌）—— 「敢不敢贴上去」
         才是这套流派的性格所在，连上之后该让它连完。 */
      if (pl.wjStage > 0) pl.invuln = Math.max(pl.invuln, 2);
      const rate = STYLES.wujian.chargeRate(pl.stats, pl);
      pl.wjChargeT = Math.min(WJ.charge, pl.wjChargeT + rate);
      if (!pl.wjFull && pl.wjChargeT >= WJ.charge) {
        pl.wjFull = true;
        SFX.chargeUp(1);
        g.burst(pl.x, pl.y - 4, 12, PAL.jadeL);
      }
      if (Math.floor(pl.wjChargeT) % 5 === 0) {
        const a = Math.random() * Math.PI * 2, rr = 15 + Math.random() * 8;
        g.particles.push(new Particle(
          pl.x + Math.cos(a) * rr, pl.y - 2 + Math.sin(a) * rr * 0.7,
          -Math.cos(a) * 1.1, -Math.sin(a) * 1.1, 16,
          pl.wjFull ? PAL.gold : PAL.jade, 1, 0
        ));
      }
    },
    tickDash(pl, g) {
      pl.invuln = Math.max(pl.invuln, 2);            // 突进全程无敌
      // 「混元珠」这类追踪法宝在舞剑流下改为让突进偏向最近的妖物
      if (pl.stats.homing > 0) {
        const t = g.nearestEnemy(pl.x, pl.y, pl.stats.homingRange || 220, null);
        if (t) {
          const want = Math.atan2(t.y - pl.y, t.x - pl.x);
          let d = want - pl.dashA;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          pl.dashA += clamp(d, -pl.stats.homing, pl.stats.homing);
        }
      }
      const px0 = pl.x, py0 = pl.y;
      pl.x += Math.cos(pl.dashA) * pl.dashSpeed;
      pl.y += Math.sin(pl.dashA) * pl.dashSpeed;
      g.collideRoom(pl, pl.r, true);
      // 被墙挡住就当场收势：蓄满的突进有 185 px，贴墙滑完整个无敌时长会很难受
      if (Math.hypot(pl.x - px0, pl.y - py0) < pl.dashSpeed * 0.45) {
        pl.dashT = Math.min(pl.dashT, 1);
      }
      const ca = Math.cos(pl.dashA), sa = Math.sin(pl.dashA);
      if (Math.abs(ca) > Math.abs(sa)) { pl.dir = 'side'; pl.face = ca > 0 ? 1 : -1; }
      else pl.dir = sa > 0 ? 'down' : 'up';
      pl.dashTrail.push({ x: pl.x, y: pl.y, t: 10 });
      if (pl.dashTrail.length > 6) pl.dashTrail.shift();
      /* 剑锋触及：同一目标一次突进只吃一次伤害。
         三段的伤害全部交给收尾的五连斩（严格五段），突进这一段不再叠加，
         否则「三段 = 五连斩」的实际段数就说不清了。 */
      if (pl.dashStage < 2) {
        const res = wjDamage(pl, pl.dashStage);
        for (const e of g.enemies) {
          if (e.dead || pl.dashHit.has(e)) continue;
          if (!circleHit(pl.x, pl.y + 2, WJ.reach, e.x, e.y, e.r)) continue;
          pl.dashHit.add(e);
          e.hurt(res.dmg, g, null, res.crit);
          const a = Math.atan2(e.y - pl.y, e.x - pl.x);
          e.kbx += Math.cos(a) * (3 + pl.stats.knockback);
          e.kby += Math.sin(a) * (3 + pl.stats.knockback);
          if (pl.stats.frost) e.frost = Math.max(e.frost, 70 + pl.stats.frost * 35);
          if (pl.stats.burn) { e.burn = Math.max(e.burn, 120); e.burnDmg = pl.stats.burn; }
          if (pl.stats.chain) g.chainLightning(e, res.dmg * 0.6, pl.stats.chain);
          g.burst(e.x, e.y, 8, res.crit ? PAL.gold : PAL.jadeL);
          SFX.hit();
        }
      }
      g.slashes.push(new Slash(pl.x, pl.y, pl.dashA, 1.0, WJ.reach + 4,
        { col: pl.dashStage >= 1 ? PAL.goldL : PAL.jadeL, life: 7,
          crit: pl.dashStage >= 2, wide: 3 }));
      if (--pl.dashT > 0) return;
      // 突进结束
      pl.dashing = false;
      const hitN = pl.dashHit ? pl.dashHit.size : 0;
      pl.dashHit = null;
      const gd = ultPathVal(pl.ult, 'wujian', 'guard');
      if (gd) pl.invuln = Math.max(pl.invuln, gd);   // 剑罡护体：落地后一段无敌
      if (pl.dashStage >= 2) {
        // 三段：突进落脚即五连乱舞（这是技能的主体，不是额外奖励）
        pl.dashFlurry = WJ.s3Hits; pl.dashFlurryT = 2;
        g.floaters.push(new Floater(pl.x, pl.y - 30, '剑影三叠', PAL.goldL));
        g.shake(6); SFX.chargeShot(2);
      } else if (hitN > 0) {
        pl.wjStage = pl.dashStage + 1;               // 命中 → 立即接续下一段
        pl.wjChainT = WJ.chain + ultPathVal(pl.ult, 'wujian', 'chain');
        // 这里刻意不再把 ultCd 清零。旧写法靠「清零 = 表示可接段」，但那会连带
        // 抹掉本段突进斩获的击杀返还（一二段白打）；接段其实由 ultDown 里
        // 「ultCd > 0 && wjChainT <= 0」的 wjChainT 豁免放行，用不着清零。
        g.floaters.push(new Floater(pl.x, pl.y - 30,
          (pl.wjStage + 1) + ' 段 · 可续', PAL.jadeL));
      } else {
        pl.wjStage = 0;                              // 落空：连招归零，冷却照旧
      }
    },
    /* 三段收尾：站在原地五连乱舞，每轮全向刃光并附带一次必暴伤害 */
    tickFlurry(pl, g) {
      pl.invuln = Math.max(pl.invuln, 2);
      if (--pl.dashFlurryT > 0) return;
      pl.dashFlurryT = WJ.flurryGap;
      const res = wjDamage(pl, 2, true);             // 三段在二段基础上必定暴击
      const R = WJ.flurryR;
      for (const e of g.enemies) {
        if (e.dead) continue;
        if (!circleHit(pl.x, pl.y + 2, R, e.x, e.y, e.r)) continue;
        const a = Math.atan2(e.y - pl.y, e.x - pl.x);
        e.kbx += Math.cos(a) * (2 + pl.stats.knockback * 0.6);
        e.kby += Math.sin(a) * (2 + pl.stats.knockback * 0.6);
        e.hurt(res.dmg, g, null, res.crit);
        if (pl.stats.frost) e.frost = Math.max(e.frost, 70 + pl.stats.frost * 35);
        if (pl.stats.burn) { e.burn = Math.max(e.burn, 120); e.burnDmg = pl.stats.burn; }
        if (pl.stats.chain) g.chainLightning(e, res.dmg * 0.5, pl.stats.chain);
      }
      const n = 8, off = Math.random() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        g.slashes.push(new Slash(pl.x, pl.y, off + i / n * Math.PI * 2,
          Math.PI / 3, R * (0.55 + Math.random() * 0.3),
          { col: PAL.goldL, crit: true, life: 9, wide: 3, spin: 0.5 }));
      }
      g.shake(5); SFX.slash(2);
      g.burst(pl.x, pl.y, 14, PAL.gold);
      if (--pl.dashFlurry <= 0) {
        pl.dashFlurry = 0;
        pl.wjStage = 0;
        // 收招余韵：五刀砍完时人还在怪堆正中，一点缓冲都不给会当场被围殴按死
        pl.invuln = Math.max(pl.invuln, WJ.flurryGrace);
        g.floaters.push(new Floater(pl.x, pl.y - 32, '五连斩', PAL.goldL));
      }
    }
  },
  yujian: {
    id: 'yujian', name: '御剑流', en: 'YUJIAN', tag: '环绕 · 随指', ready: false,
    consts: { count: 1, radius: 46, follow: 0.12, rehitCd: 40 },
    use: {
      damage: '飞剑每次掠过的伤害',
      fireRate: '飞剑跟随指针的速度',
      spread: '同时御使的飞剑数',
      range: '环绕半径',
      pierce: null,
      knockback: '击退',
      homing: null, burn: '灼烧', frost: '冰封', chain: '引雷连锁',
      crit: '暴击几率', deflect: '击落敌方术法', reflect: null
    },
    attack: null
  }
};

/* 死属性检查：某个 stats 在本流派下既没写进 use、也没写 null，就说明漏了 */
const STAT_KEYS = ['damage', 'fireRate', 'spread', 'range', 'pierce', 'knockback',
  'homing', 'burn', 'frost', 'chain', 'crit', 'deflect', 'reflect'];
function auditStyleCoverage() {
  const miss = [];
  for (const id in STYLES) {
    const st = STYLES[id];
    for (const k of STAT_KEYS) if (!(k in st.use)) miss.push(id + '.' + k);
  }
  return miss;
}
