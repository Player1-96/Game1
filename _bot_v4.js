'use strict';
/* ============================================================
 *  _bot_smart.js —— 聪明版 bot：完整体验道具 + 采集难度曲线
 *
 *  相比上一版的升级：
 *   1) 躲避：8 方向「风险最小化」。对每个方向预测未来 12 帧的落点，
 *      逐帧检查所有敌弹在那一时刻与落点的距离，取总风险最低的方向。
 *      （上一版是力场斥力，躲不了环形/密集弹幕）
 *   2) 选宝：用「克隆玩家 + 套用道具 → 算实力分」的方式，
 *      在法器二选一 / 坊市里挑真正提升最大的那件。
 *   3) 技能：低血时自动切到保命技能（缩地/五行/护体）再放；
 *      健康时放输出技能（天雷引）。
 *   4) 雷符：密室裂缝墙用雷符炸（比射击三下稳），妖群聚集时也炸。
 *   5) 逐层遥测：每层的帧数 / 受伤 / 击杀 / 实力分 / 剩余血量 → 难度曲线数据
 *
 *  唯一的非战斗辅助：走位卡住 1200 帧时直接 enterRoom（报告里会统计次数）
 * ============================================================ */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const FILE = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
const SHOTDIR = path.join(__dirname, '_shots_smart');

(async () => {
  if (!fs.existsSync(SHOTDIR)) fs.mkdirSync(SHOTDIR);
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(200);
  if (process.env.SOFT1) {
    await page.evaluate(() => {
      const G2 = window.Game.constructor;
      const orig = G2.prototype.spawnWave;
      G2.prototype.spawnWave = function (i) {
        orig.call(this, i);
        if (this.depth === 1) for (const e of this.enemies) { if (!e.dead) { e.maxHp = Math.max(1, Math.round(e.maxHp * 0.75)); e.hp = Math.min(e.hp, e.maxHp); } }
      };
    });
    console.log('  [SOFT1] 一层妖物血量 x0.75 已启用');
  }
  if (process.env.SKILL1) { await page.evaluate(() => { window.__cfgSkill1 = true; }); console.log('  [SKILL1] 开局送一个 Lv1 小技能'); }

  await page.evaluate(() => {
    /* ---------------- 射击：飞剑流按住，巨剑流必须"松手一帧"才放剑 ---------------- */
    function makeShooter(style) {
      let phase = 'charge', hold = 0;
      return function (G, txx, tyy, firing) {
        const inp = G.input, pl = G.player;
        inp.mx = txx; inp.my = tyy; inp.mouseT = performance.now();
        if (!firing) { inp.mouseDown = false; return; }
        if (style !== 'jujian') { inp.mouseDown = true; return; }
        // 关键：用真实 chargeT 判断，而不是自己数的 hold —— 受伤会把 chargeT 清零，
        // 旧写法自以为蓄满、实际放出去的是点射。近身要快（一段 30），远/多目标才蓄满二段（66）。
        const ct = pl.chargeT || 0;
        const dist = Math.hypot(txx - pl.x, tyy - pl.y);
        const need = (dist < 55 || pl.hp <= 2) ? 30 : 66;
        if (phase === 'charge') {
          inp.mouseDown = true;
          if (ct >= need) {
            const tier = ct >= 66 ? 2 : (ct >= 30 ? 1 : 0);
            window.__tiers[tier]++;
            phase = 'release';
          }
        }
        else if (phase === 'release') { inp.mouseDown = false; phase = 'wait'; }
        else { inp.mouseDown = false; if (pl.shootCd <= 0) phase = 'charge'; }
      };
    }

    /* ---------------- 实力分（与 game.js powerScore 同式，用于评估道具收益） ---------------- */
    function powerOf(s, p) {
      const dps = s.damage * s.fireRate * (1 + s.spread * 0.8) * (1 + s.crit * 0.8);
      return dps / (3.5 * 2.6)
        + s.pierce * 0.18 + s.homing * 3.0 + ((s.homingRange || 220) - 220) * 0.002
        + s.burn * 0.25 + s.frost * 0.2 + s.chain * 0.35 + s.poison * 0.3 + s.soul * 0.3
        + (p.maxHP / 6 - 1) * 0.6 + p.shield * 0.08
        + (s.speed / 2.35 - 1) * 0.8 + s.luck * 0.06 + s.regen * 0.15;
    }
    /* 克隆玩家 → 套用道具 → 算出「拿到它之后实力分涨多少」 */
    window.__gainOf = function (G, id) {
      const p = G.player, def = ITEM_MAP[id];
      if (!def) return 0;
      const clone = Object.create(Object.getPrototypeOf(p));
      Object.assign(clone, p);
      clone.stats = Object.assign({}, p.stats);
      clone.items = p.items.slice();
      clone.slots = (p.slots || []).slice();
      clone.addShield = function (n) { this.shield += n; };
      clone.heal = function () { };
      clone.learnPath = function () { };
      clone.give = function () { };
      try { def.apply(clone); } catch (e) { return 0; }
      return powerOf(clone.stats, clone) - powerOf(p.stats, p);
    };

    /* ---------------- 专属技升级路线偏好（输出向优先） ---------------- */
    const ULT_PREF = {
      feijian: ['more', 'element', 'homing', 'pierce', 'haste', 'swift'],
      jujian: ['might', 'radius', 'power', 'aftershock', 'charge', 'shatter']
    };

    /* ---------------- 8 方向风险最小化移动 ---------------- */
    const D8 = [[1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071], [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071]];
    function smartMove(G, aimX, aimY, navigating, wantDist) {
      const p = G.player;
      const sp = Math.max(1.2, p.stats.speed);
      const H = 12;
      // 最近敌人：用于「保持理想间距」，否则没弹幕时它会一路贴到敌人身上被摸死
      let ne = null, nd = Infinity;
      for (const e of G.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < nd) { nd = d; ne = e; } }
      const WANT = wantDist || 88;          // 理想交战距离（僵持时会压到很近，逼出视线）
      let bx = 0, by = 0, best = -1e18;
      for (let di = 0; di < 8; di++) {
        const dx = D8[di][0], dy = D8[di][1];
        let risk = 0;
        // 墙惩罚：导航时必须关掉 —— 门就在墙里，惩罚会让它拒绝走向门（老 bug 的同类）
        const ex = p.x + dx * sp * H, ey = p.y + dy * sp * H;
        if (!navigating) {
          if (ex < WALL_L + 14 || ex > WALL_R - 14) risk += 7;
          if (ey < WALL_T + 14 || ey > WALL_B - 14) risk += 7;
        }
        // 敌弹：沿预测轨迹逐点比对
        for (const b of G.bullets) {
          if (b.friendly || b.dead) continue;
          const bvx = b.vx || 0, bvy = b.vy || 0;
          for (let t = 0; t <= H; t += 3) {
            const qx = b.x + bvx * t, qy = b.y + bvy * t;
            const d = Math.hypot(qx - (p.x + dx * sp * t), qy - (p.y + dy * sp * t));
            if (d < 17) risk += (17 - d) * 0.6;
          }
          const d0 = Math.hypot(b.x - p.x, b.y - p.y);
          if (d0 < 28) risk += (28 - d0) * 0.4;
        }
        // 敌人接触伤害
        for (const e of G.enemies) {
          if (e.dead) continue;
          const d = Math.hypot(e.x - ex, e.y - ey);
          const mel = (G.style === 'wujian');
          const safe = (e.r || 8) + (mel ? 4 : 18);
          if (d < safe) risk += (safe - d) * (mel ? 0.28 : 0.55);
          const d0 = Math.hypot(e.x - p.x, e.y - p.y);
          if (d0 < (e.r || 8) + 24) risk += 1.2;
        }
        // 保持理想间距（关键：太近重罚，太远轻罚）
        if (ne) {
          const dEn = Math.hypot(ne.x - ex, ne.y - ey);
          const floor = (ne.r || 8) + 30;
          if (dEn < floor) risk += (floor - dEn) * 0.16;
          else if (dEn < WANT) risk += (WANT - dEn) * 0.010;
          else risk += Math.min(1.2, (dEn - WANT) * 0.006);
        }
        // 地面危险区
        for (const h of G.hazards || []) {
          if (h.dead || h.friendly) continue;
          if (Math.hypot(h.x - ex, h.y - ey) < (h.r || 0) + 6) risk += 6;
        }
        // 石柱：smartMove 原来完全不知道石柱的存在，会一头顶上去，
        //       而妖物在石柱另一边 → 子弹全被石柱吃掉、房间永远清不掉。
        //       这就是之前所有"满血妖物打不动"的成因。
        const obs = G.room && G.room.obstacles;
        if (obs) {
          for (const o of obs) {
            const pad = 14;   // 玩家半径 + 余量
            if (ex > o.x - pad && ex < o.x + o.w + pad && ey > o.y - pad && ey < o.y + o.h + pad) { risk += 9; break; }
            // 当前位置也贴着石柱 → 罚，逼它主动绕开而不是原地卡住
            if (p.x > o.x - pad && p.x < o.x + o.w + pad && p.y > o.y - pad && p.y < o.y + o.h + pad) risk += 1.5;
          }
        }
        const da = Math.hypot(aimX - ex, aimY - ey);
        // 抖动打破平局：否则无威胁时 8 方向同分，它会永远按数组顺序往东走
        const jitter = Math.random() * 0.02;
        const score = -risk - da * (navigating ? 0.30 : 0.005) + jitter;
        if (score > best) { best = score; bx = dx; by = dy; }
      }
      return { dx: bx, dy: by };
    }

    /* ---------------- 网格寻路 ---------------- */
    function buildGrid(G, room) {
      const probe = { x: 0, y: 0, r: 7, vx: 0, vy: 0 };
      const g = [];
      for (let gy = 0; gy < 9; gy++) {
        const row = [];
        for (let gx = 0; gx < 15; gx++) {
          const cx = gx * 32 + 16, cy = gy * 32 + 16;
          probe.x = cx; probe.y = cy; probe.vx = 0; probe.vy = 0;
          let free = true;
          try { G.collideRoom(probe, 7, true); } catch (e) { }
          if (Math.hypot(probe.x - cx, probe.y - cy) > 0.6) free = false;
          if (free && room.obstacles) for (const o of room.obstacles) {
            if (cx + 8 > o.x && cx - 8 < o.x + o.w && cy + 8 > o.y && cy - 8 < o.y + o.h) { free = false; break; }
          }
          row.push(free);
        }
        g.push(row);
      }
      return g;
    }
    const k2 = (a, b) => a + ',' + b;
    function gridNext(G, S, txx, tyy) {
      const grid = S.grid;
      if (!grid) return { x: txx, y: tyy };
      const cl = (v, hi) => Math.max(0, Math.min(hi, v));
      const sx = cl(Math.floor(G.player.x / 32), 14), sy = cl(Math.floor(G.player.y / 32), 8);
      const tx0 = cl(Math.floor(txx / 32), 14), ty0 = cl(Math.floor(tyy / 32), 8);
      if (sx === tx0 && sy === ty0) return { x: txx, y: tyy };
      grid[sy][sx] = true;
      const seen = new Set([k2(sx, sy)]), prev = new Map(), q = [[sx, sy]];
      while (q.length) {
        const c = q.shift();
        for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = c[0] + d[0], ny = c[1] + d[1];
          if (nx < 0 || ny < 0 || nx > 14 || ny > 8) continue;
          if (seen.has(k2(nx, ny)) || !grid[ny][nx]) continue;
          seen.add(k2(nx, ny)); prev.set(k2(nx, ny), c);
          if (nx === tx0 && ny === ty0) {
            let k = k2(nx, ny); const pth = [];
            while (k !== k2(sx, sy)) { pth.unshift(k); const pv = prev.get(k); k = k2(pv[0], pv[1]); }
            const nx2 = pth[Math.min(1, pth.length - 1)].split(',');
            return { x: (+nx2[0]) * 32 + 16, y: (+nx2[1]) * 32 + 16 };
          }
          q.push([nx, ny]);
        }
      }
      return { x: txx, y: tyy };
    }
    /* 房间图 BFS：修好了「回溯取第一跳方向」的老 bug */
    function bfsNext(G, from) {
      if (!from.cleared) return { same: true };
      const prev = new Map(), seen = new Set([from.key]), q = [from];
      while (q.length) {
        const c = q.shift();
        for (let d = 0; d < 4; d++) {
          const nk = c.neighbors[d]; if (!nk || seen.has(nk)) continue;
          if (c.doorHidden && c.doorHidden[d]) continue;
          const nb = G.floor.rooms.get(nk); if (!nb) continue;
          if (nb.doorHidden && nb.doorHidden[(d + 2) % 4]) continue;
          if (nb.type === 'treasure' && !nb.unlocked && G.keys <= 0) continue;
          seen.add(nk); prev.set(nk, { room: c, dir: d });
          if ((!nb.cleared || !nb.visited) && nb.type !== 'secret') {
            let k = nk, dir = d;
            for (let gd = 0; gd < 500; gd++) {
              const st = prev.get(k);
              if (!st) break;
              dir = st.dir;
              if (st.room === from) break;
              k = st.room.key;
            }
            return { dir, goal: nk };
          }
          q.push(nb);
        }
      }
      return null;
    }
    /* 选目标门：优先没去过的特殊房（藏珍阁/坊市/祭坛），其次未清房间 */
    function pickTarget(G, room) {
      const special = [];
      for (const r of G.floor.rooms.values()) {
        if (r.key === room.key) continue;
        if (r.type === 'shop' || r.type === 'treasure' || r.type === 'sacrifice') {
          if (!r.visited && (r.type !== 'treasure' || r.unlocked || G.keys > 0)) special.push(r);
        }
      }
      if (special.length) {
        for (const target of special) {
          const res = bfsTo(G, room, target.key);
          if (res) return res;
        }
      }
      return bfsNext(G, room);
    }
    function bfsTo(G, from, goalKey) {
      if (from.key === goalKey) return { same: true };
      const prev = new Map(), seen = new Set([from.key]), q = [from];
      while (q.length) {
        const c = q.shift();
        for (let d = 0; d < 4; d++) {
          const nk = c.neighbors[d]; if (!nk || seen.has(nk)) continue;
          if (c.doorHidden && c.doorHidden[d]) continue;
          const nb = G.floor.rooms.get(nk); if (!nb) continue;
          if (nb.doorHidden && nb.doorHidden[(d + 2) % 4]) continue;
          if (nb.type === 'treasure' && !nb.unlocked && G.keys <= 0) continue;
          seen.add(nk); prev.set(nk, { room: c, dir: d });
          if (nk === goalKey) {
            let k = nk, dir = d;
            for (let gd = 0; gd < 500; gd++) {
              const st = prev.get(k);
              if (!st) break;
              dir = st.dir;
              if (st.room === from) break;
              k = st.room.key;
            }
            return { dir, goal: nk };
          }
          q.push(nb);
        }
      }
      return null;
    }

    /* ---------------- 初始化 ---------------- */
    window.__init = function (style, god, nomana, opskill, noskill, lowkill) {
      const G = window.Game;
      G.newRun(style);
      if (window.__cfgSkill1 && !opskill) { const ids = Object.keys(SKILL_DEF); G.player.slots[0] = { id: ids[Math.floor(Math.random() * ids.length)], lv: 1 }; G.player.slotIdx = 0; }
      // —— 实验臂：开局白送满级天雷引，配合原版灵力自动回复（测"专精一技 + 无限灵力"的上限）——
      if (opskill) {
        G.player.slots[0] = { id: 'tianlei', lv: 5 };
        G.player.slotIdx = 0;
      }
      if (!window.__hooked) {
        window.__hooked = true;
        const P = G.player.constructor;
        const orig = P.prototype.takeDamage;
        P.prototype.takeDamage = function (n, g, sx, sy) {
          if (this.invuln <= 0 && !this.dead) {
            window.__dmg.push({ depth: g.depth, room: g.room.key, roomType: g.room.type, hpBefore: this.hp, dmg: n });
          }
          return orig.call(this, n, g, sx, sy);
        };
        // 统计获得护盾总量（护体金光 / 灵力丹 / 太虚护盾）
        const oSh = P.prototype.addShield;
        P.prototype.addShield = function (n) { window.__shields += n; return oSh.call(this, n); };
      }
      // —— A/B 实验：去掉灵力自然回复，只保留击杀回灵（lowkill 再叠加 MP_KILL 3→1）——
      if ((nomana || lowkill) && !window.__manaPatched) {
        window.__manaPatched = true;
        const P = G.player.constructor;
        const origU = P.prototype.update;
        const perKill = lowkill ? 1 : 3;
        P.prototype.update = function (g, input) {
          const mp0 = this.mp, k0 = g.kills;
          origU.call(this, g, input);
          const dk = g.kills - k0;
          this.mp = Math.min(this.maxMP, mp0 + dk * perKill);   // 只留击杀回灵
        };
      }
      window.__dmg = []; window.__shields = 0; window.__tiers = [0, 0, 0];
      window.__st = {
        style, god, nomana: !!nomana, opskill: !!opskill, noskill: !!noskill, lowkill: !!lowkill, shoot: makeShooter(style), frames: 0, roomFrames: 0, lastKey: G.room.key, entered: 0,
        seenTypes: {}, stuckFor: 0, idle: 0, navFrames: 0, wantDoor: null, grid: buildGrid(G, G.room),
        floors: [], floorFrames: 0, floorDmg0: 0, floorKill0: 0, floorHp0: G.player.hp,
        floorPower0: G.powerScore(), curDepth: G.depth, picks: 0, ultPicks: [], assists: 0,
        bombbed: 0, bombed: 0, secretsOpened: 0, bought: 0, deaths: 0, fatal: null, triggersDone: {}
      };
      return { ok: true };
    };

    /* ---------------- 单帧 ---------------- */
    window.__step = function (n) {
      const G = window.Game, S = window.__st, p = G.player;
      let trigger = null;
      for (let f = 0; f < n; f++) {
        // ---- 选择界面：冻结世界，必须处理 ----
        if (G.pick) {
          const pk = G.pick, pl = G.player;
          let idx = 0;
          if (pk.kind === 'ult') {
            const pref = ULT_PREF[pl.ult.style] || [];
            let bestRank = 999;
            for (let i = 0; i < pk.list.length; i++) {
              const rank = pref.indexOf(pk.list[i].id);
              if (rank >= 0 && rank < bestRank) { bestRank = rank; idx = i; }
            }
            S.ultPicks.push(pk.list[idx] ? pk.list[idx].name : '?');
          } else {
            // 槽满 → 换掉等级最低的
            let lo = 99;
            for (let i = 0; i < pl.slots.length; i++) {
              const sl = pl.slots[i];
              if ((sl ? sl.lv : -1) < lo) { lo = sl ? sl.lv : -1; idx = i; }
            }
          }
          G.pickPick(idx); G.pickConfirm();
          S.picks++;
          continue;
        }
        if (G.state !== 'play') {
          if (!S.triggersDone[G.state]) { S.triggersDone[G.state] = 1; trigger = G.state; }
          return { done: true, state: G.state, trigger, hp: p.hp, depth: G.depth };
        }
        if (S.god) p.invuln = 9999;
        const room = G.room;

        if (room.key !== S.lastKey) {
          S.lastKey = room.key; S.entered++; S.roomFrames = 0; S.stuckFor = 0; S.idle = 0; S.navFrames = 0; S.wantDoor = null;
          S.skip = {}; S.chaseKey = null; S.chaseF = 0; S.combatF = 0; S.chargeIn = false;
          S.grid = buildGrid(G, room);
          const tk = room.type;
          if (!S.seenTypes[tk]) {
            S.seenTypes[tk] = 1;
            if (!S.triggersDone['room_' + tk]) { S.triggersDone['room_' + tk] = 1; trigger = 'room_' + tk; }
          }
        }

        const enemies = G.enemies.filter(e => !e.dead);
        let tx, ty, navigating = false;
        // 僵持检测：同一房间持续有敌人却清不掉 → 压近到贴身找视线
        if (enemies.length > 0) {
          S.combatF = (S.combatF || 0) + 1;
          if (S.combatF > 900) S.chargeIn = true;
        } else S.combatF = 0;

        if (enemies.length > 0) {
          // 瞄最近的敌人（射击方向和移动方向独立，这是双摇杆游戏）
          let t = enemies[0], bd = Infinity;
          for (const e of enemies) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; t = e; } }
          S.shoot(G, t.x, t.y, true);
          if (t.isBoss && !S.triggersDone.boss) { S.triggersDone.boss = 1; trigger = 'boss'; }
          if (t.elite && !S.triggersDone.elite) { S.triggersDone.elite = 1; trigger = 'elite'; }

          // ---- 技能：低血先切保命技，否则放输出技 ----
          const DEFENSIVE = ['suodi', 'wuxing', 'huti'];
          const OFFENSIVE = ['tianlei'];
          const findSlot = ids => {
            for (let i = 0; i < (p.slots || []).length; i++) {
              const sl = p.slots[i];
              if (sl && ids.indexOf(sl.id) >= 0 && p.mp >= SKILL_DEF[sl.id].cost) return i;
            }
            return -1;
          };
          const castAndCount = () => {
            if (S.noskill) return;          // 实验臂：完全不使用小技能
            const before = p.mp; G.useSkill();
            if (p.mp < before) { S.skillCasts = (S.skillCasts || 0) + 1; S.mpSpent = (S.mpSpent || 0) + (before - p.mp); }
          };
          // 灵力饥荒计数：局面需要技能、但灵力不够 —— 直接量化"灵力是否成为真约束"
          const cantCast = ids => {
            for (let i = 0; i < (p.slots || []).length; i++) {
              const sl = p.slots[i];
              if (sl && ids.indexOf(sl.id) >= 0 && p.mp < SKILL_DEF[sl.id].cost) return true;
            }
            return false;
          };
          const ALL_SK = Object.keys(SKILL_DEF);
          if (p.hp <= 3 && cantCast(DEFENSIVE)) S.starve = (S.starve || 0) + 1;
          else if (enemies.length >= 2 && cantCast(ALL_SK)) S.starve = (S.starve || 0) + 1;
          if (p.hp <= 3) {
            const i = findSlot(DEFENSIVE);
            if (i >= 0 && p.skillGcd <= 0) { G.slotKey(i); castAndCount(); }
          } else if (enemies.length >= (S.opskill ? 1 : 2)) {
            const i = findSlot(OFFENSIVE);
            if (i >= 0 && p.skillGcd <= 0) { G.slotKey(i); castAndCount(); }
            else if (p.mp >= 40 && p.skillGcd <= 0) { castAndCount(); }
          }
          // 健康时也主动上护盾（灵力无限的话这是最强续航）
          if (p.hp > 3 && p.shield < 2 && p.skillGcd <= 0 && p.mp >= 40) {
            const i = findSlot(['huti']);
            if (i >= 0) { G.slotKey(i); castAndCount(); }
          }
          if (p.ult && S.style === 'wujian') {
            // 舞剑流：按住空格蓄势 → 松手突进。只调 useUlt() 不放 ultUp() 的话剑势白蓄。
            if (p.wjCharging) {
              S.wjHold = (S.wjHold || 0) + 1;
              if (S.wjHold >= 30) { try { G.ultUp(); } catch (e) { } }
            } else {
              S.wjHold = 0;
              if (p.ultCd <= 0 && enemies.length >= 1) { try { G.useUlt(); } catch (e) { } }
            }
          } else if (p.ult && p.ultCd <= 0 && enemies.length >= 1) { try { G.useUlt(); } catch (e) { } }

          // ---- 雷符：妖群聚集就炸；僵持太久也炸（范围伤害不吃视线遮挡，真人也是这么破局的）----
          if (G.bombs > 0 && !S.god) {
            const near = enemies.filter(e => Math.hypot(e.x - p.x, e.y - p.y) < 70).length;
            const stall = (S.combatF || 0) > 1200;
            if ((enemies.length >= 3 && near >= 2 && Math.random() < 0.02) || (stall && near >= 1)) {
              G.placeBomb(); S.bombed = (S.bombed || 0) + 1;
            }
          }
          tx = p.x; ty = p.y;
          // 新版：灵力全靠地上捡 —— 战斗中也要去捡灵力珠，否则永远回不上蓝
          {
            let orb = null, od = Infinity;
            for (const k of G.pickups) { if (k.dead || k.kind !== 'mp') continue; const ddo = Math.hypot(k.x - p.x, k.y - p.y); if (ddo < od) { od = ddo; orb = k; } }
            if (orb && p.mp < p.maxMP * 0.7 && od < 190) { tx = orb.x; ty = orb.y; }
          }   // 战斗时纯靠风险最小化走位
        } else {
          S.shoot(G, p.x, p.y, false);
          navigating = true;
          const props = G.props.filter(pr => !pr.dead);

          // ---- 法器二选一：按「模拟实力分」挑收益最大的 ----
          const itemProps = props.filter(pr => pr.kind === 'item');
          let bestItem = null;
          if (itemProps.length) {
            // 同组（二选一）只挑一件最优的
            const groups = {};
            for (const ip of itemProps) {
              const gid = ip.group || ('solo' + ip.x);
              if (!groups[gid] || window.__gainOf(G, ip.item) > window.__gainOf(G, groups[gid].item)) groups[gid] = ip;
            }
            bestItem = Object.values(groups)[0];
          }
          let pk = null, pkd = Infinity;
          for (const k of G.pickups) { if (k.dead) continue; const d = Math.hypot(k.x - p.x, k.y - p.y); if (d < pkd) { pkd = d; pk = k; } }
          const chest = props.find(pr => pr.kind === 'chest' && !pr.opened);
          // 坊市：买得起里挑收益最高的
          const afford = props.filter(pr => pr.kind === 'shop' && !pr.sold && G.coins >= pr.price);
          let bestShop = null;
          for (const sp of afford) if (!bestShop || window.__gainOf(G, sp.item) > window.__gainOf(G, bestShop.item)) bestShop = sp;
          const altar = props.find(pr => pr.kind === 'altar' && !pr.used);
          const portal = props.find(pr => pr.kind === 'portal');

          // 密室裂缝墙：优先用雷符炸，没雷符就射击三下
          let hd = -1;
          for (let d = 0; d < 4; d++) if (room.doors[d] && room.doorHidden[d] && !room.doorOpen[d]) { hd = d; break; }
          let wall = null;
          if (hd >= 0) {
            const rect = G.floor.doorRect(hd);
            const wx = rect.x + rect.w / 2, wy = rect.y + rect.h / 2;
            if (hd === 0) wall = { sx: wx, sy: WALL_T + 50, ax: wx, ay: 6 };
            else if (hd === 2) wall = { sx: wx, sy: WALL_B - 50, ax: wx, ay: ROOM_H - 6 };
            else if (hd === 3) wall = { sx: WALL_L + 50, sy: wy, ax: 6, ay: wy };
            else wall = { sx: WALL_R - 50, sy: wy, ax: ROOM_W - 6, ay: wy };
          }

          let goal = null, pressE = false, goalKey = null;
          const skip = S.skip || (S.skip = {});
          const gkOf = o => Math.round(o.x) + ',' + Math.round(o.y);
          const cands = [];
          if (bestItem) cands.push([bestItem, !!bestItem.group]);   // 新版二选一必须按 E 认领
          if (pk) cands.push([pk, false]);
          if (chest) cands.push([chest, (!chest.locked || G.keys > 0)]);
          if (bestShop) cands.push([bestShop, true]);
          if (altar && p.hp >= p.maxHP && p.hp > 3) cands.push([altar, true]);
          if (wall) cands.push([{ x: wall.sx, y: wall.sy }, false]);
          if (portal) cands.push([portal, false]);
          for (const c of cands) {
            const key = gkOf(c[0]);
            if (skip[key]) continue;
            goal = c[0]; pressE = c[1]; goalKey = key; break;
          }
          // 追不到就放弃该目标：奖励可能落在石柱里 / 在走不到的位置，
          // 不放弃就会一直顶着障碍推（这就是"单房超时"的死因）
          if (goalKey === S.chaseKey) S.chaseF = (S.chaseF || 0) + 1;
          else { S.chaseKey = goalKey; S.chaseF = 0; }
          if (goal && S.chaseF > 500) { skip[goalKey] = 1; S.skipped = (S.skipped || 0) + 1; goal = null; pressE = false; S.chaseKey = null; S.chaseF = 0; }

          if (goal) {
            S.idle = 0;
            tx = goal.x; ty = goal.y; navigating = false;
            const gd = Math.hypot(goal.x - p.x, goal.y - p.y);
            if (pressE && gd < 34) {
              G.input.interact = true;
              if (bestShop) S.bought++;
            }
            if (wall && gd < 46) {
              if (G.bombs > 0) { G.placeBomb(); S.bombed++; }
              else S.shoot(G, wall.ax, wall.ay, true);
            }
          } else {
            const t = pickTarget(G, room);
            if (t && !t.same && t.dir !== undefined) {
              const z = G.floor.exitZone(t.dir);
              tx = z.cx; ty = z.cy;
              S.wantDoor = { dir: t.dir, room: room.key };
              S.navFrames++;
            } else {
              S.wantDoor = null;
              S.idle++;
              if (S.idle > 1500) { S.fatal = { why: '无目标可去', room: room.key, type: room.type }; break; }
              tx = 240; ty = 150;
            }
          }
        }

        // ---- 移动：导航时先取网格路点，再用风险最小化转向 ----
        let aimX = tx, aimY = ty;
        if (navigating && !(G.enemies.length)) {
          const wp = gridNext(G, S, tx, ty);
          aimX = wp.x; aimY = wp.y;
        }
        const mv = smartMove(G, aimX, aimY, navigating && G.enemies.length === 0, S.chargeIn ? 24 : (S.style === "jujian" ? 132 : (S.style === "wujian" ? 26 : 88)));
        const i2 = G.input;
        i2.up = i2.down = i2.left = i2.right = false;
        if (mv.dx > 0.3) i2.right = true; else if (mv.dx < -0.3) i2.left = true;
        if (mv.dy > 0.3) i2.down = true; else if (mv.dy < -0.3) i2.up = true;

        const hpBefore = p.hp;
        // ---- 导航辅助（唯一非战斗作弊，计入 assists）----
        if (G.enemies.length === 0 && S.wantDoor && S.wantDoor.room === room.key &&
            S.navFrames > 1200 && room.doorOpen[S.wantDoor.dir]) {
          const nb = G.floor.rooms.get(room.neighbors[S.wantDoor.dir]);
          if (nb) { G.enterRoom(nb, S.wantDoor.dir); S.assists++; S.navFrames = 0; S.wantDoor = null; continue; }
        }
        G.update();

        S.frames++; S.roomFrames++; S.floorFrames++;
        if (S.roomFrames > 20000) {
          S.fatal = { why: '单房超时', room: room.key, type: room.type, enemies: G.enemies.length,
            mobs: G.enemies.slice(0, 6).map(e => ({ t: e.type, x: Math.round(e.x), y: Math.round(e.y), hp: +(+e.hp).toFixed(1), max: e.maxHp, r: e.r, boss: !!e.isBoss, elite: !!e.elite })),
            obstacles: (room.obstacles || []).map(o => [Math.round(o.x), Math.round(o.y), o.w, o.h]) };
          break;
        }

        // ---- 逐层遥测 ----
        if (G.depth !== S.curDepth) {
          S.floors.push({
            depth: S.curDepth, frames: S.floorFrames,
            dmg: window.__dmg.filter(d => d.depth === S.curDepth).reduce((a, b) => a + b.dmg, 0),
            hits: window.__dmg.filter(d => d.depth === S.curDepth).length,
            kills: G.kills - S.floorKill0,
            powerStart: +S.floorPower0.toFixed(2), powerEnd: +G.powerScore().toFixed(2),
            hpEnd: p.hp, maxHP: p.maxHP, items: p.items.length,
            cleared: G.state === 'play'
          });
          S.curDepth = G.depth; S.floorFrames = 0; S.floorKill0 = G.kills; S.floorPower0 = G.powerScore();
          if (!S.triggersDone['floor' + G.depth]) { S.triggersDone['floor' + G.depth] = 1; trigger = 'floor' + G.depth; }
        }
      }
      return { done: G.state !== 'play', state: G.state, trigger, hp: p.hp, depth: G.depth };
    };

    window.__report = function () {
      const G = window.Game, S = window.__st, p = G.player;
      return {
        style: S.style, god: S.god, state: G.state, depth: G.depth, frames: S.frames,
        roomsEntered: S.entered, kills: G.kills, coins: G.coins, keys: G.keys, bombs: G.bombs,
        items: p.items.slice(), itemNames: p.items.map(id => (ITEM_MAP[id] || {}).name || id),
        maxHP: p.maxHP, hp: p.hp, damage: p.stats.damage, fireRate: +p.stats.fireRate.toFixed(2),
        spread: p.stats.spread, pierce: p.stats.pierce, speed: +p.stats.speed.toFixed(2),
        power: +G.powerScore().toFixed(2),
        mp: Math.round(p.mp), maxMP: p.maxMP,
        skills: (p.slots || []).map(s => s ? (SKILL_DEF[s.id] ? SKILL_DEF[s.id].name : s.id) + 'Lv' + s.lv : '-'),
        ult: p.ult ? (ULT_DEF[p.ult.style] ? ULT_DEF[p.ult.style].name : p.ult.style) : null,
        ultLv: p.ult ? ultLevel(p.ult) : 0, ultPicks: S.ultPicks, picks: S.picks,
        assists: S.assists, bombed: S.bombed || 0, bought: S.bought, skipped: S.skipped || 0,
        nomana: !!S.nomana, skillCasts: S.skillCasts || 0, mpSpent: S.mpSpent || 0, shields: window.__shields || 0,
        starve: S.starve || 0, tiers: window.__tiers || [0,0,0],
        hits: window.__dmg.length, dmgTotal: +window.__dmg.reduce((a, b) => a + b.dmg, 0).toFixed(1),
        dmgByDepth: window.__dmg.reduce((m, d) => { m[d.depth] = +((m[d.depth] || 0) + d.dmg).toFixed(1); return m; }, {}),
        seenTypes: Object.keys(S.seenTypes), floors: S.floors, fatal: S.fatal,
        dbg: { room: G.room.key, type: G.room.type, cleared: G.room.cleared, enemies: G.enemies.length, doors: G.room.doors.map(v => v ? 1 : 0).join(''), open: G.room.doorOpen.map(v => v ? 1 : 0).join(''), nbr: G.room.neighbors.map(v => v || '-').join('|'), want: S.wantDoor ? S.wantDoor.dir : '-', navF: S.navFrames, idle: S.idle, roomF: S.roomFrames, visited: [...G.floor.rooms.values()].filter(r => r.visited).length, total: G.floor.rooms.size, uncleared: [...G.floor.rooms.values()].filter(r => !r.cleared).length }
      };
    };
  });

  // ---------------- 计划（ARM=base / nomana 做 A/B）----------------
  const ARM = process.env.ARM || 'full';
  const N = +(process.env.RUNS_PER_ARM || 10);
  const planAll = [];
  if (ARM === 'wujian') { for (let i = 0; i < N; i++) planAll.push(['wujian', false, false, false, false, false]); }
  else if (ARM === 'jujian') { for (let i = 0; i < N; i++) planAll.push(['jujian', false, false, false, false, false]); }
  else if (ARM === 'base') { for (let i = 0; i < N; i++) planAll.push(['feijian', false, false, false, false]); }
  else if (ARM === 'nomana') { for (let i = 0; i < N; i++) planAll.push(['feijian', false, true, false, false]); }
  else if (ARM === 'opskill') { for (let i = 0; i < N; i++) planAll.push(['feijian', false, false, true, false]); }
  else if (ARM === 'lowkill') {
    for (let i = 0; i < N; i++) planAll.push(['feijian', false, false, false, false, true]);
  }
  else if (ARM === 'noskill') {
    for (let i = 0; i < N; i++) planAll.push(['feijian', false, false, false, true, false]);
    for (let i = 0; i < N; i++) planAll.push(['jujian', false, false, false, true, false]);
  }
  else {
    for (let i = 0; i < 8; i++) planAll.push(['feijian', false, false, false, false, false]);
    for (let i = 0; i < 8; i++) planAll.push(['jujian', false, false, false, false, false]);
    for (let i = 0; i < 2; i++) planAll.push(['feijian', true, false, false, false, false]);
  }
  const plan = process.env.PLAY_RUNS ? planAll.slice(0, +process.env.PLAY_RUNS) : planAll;

  const runs = [];
  for (let ri = 0; ri < plan.length; ri++) {
    const [style, god, nomana, opskill, noskill, lowkill] = plan[ri];
    await page.evaluate(([s, g, n, o, k, l]) => window.__init(s, g, n, o, k, l), [style, god, !!nomana, !!opskill, !!noskill, !!lowkill]);
    let done = false, guard = 0;
    while (!done && guard++ < 1200) {
      const r = await page.evaluate(() => window.__step(200));
      if (r.trigger && (r.trigger === 'boss' || r.trigger === 'win' || r.trigger === 'dead' || r.trigger === 'lowhp' || String(r.trigger).indexOf('room_') === 0)) {
        try {
          await page.evaluate(() => { try { window.Game.draw(); } catch (e) { } });
          const cv = await page.$('#game');
          await cv.screenshot({ path: path.join(SHOTDIR, `r${ri + 1}_${style}${god ? 'G' : ''}_${r.trigger}_D${r.depth}.png`) });
        } catch (e) { }
      }
      if (r.done) done = true;
    }
    const rep = await page.evaluate(() => window.__report());
    runs.push(rep);
    const fl = rep.floors.map(x => `L${x.depth}:${x.frames}f/${x.dmg}dmg/pow${x.powerStart}->${x.powerEnd}`).join('  ');
    console.log(`[${ri + 1}/${plan.length}] ${style}${god ? '(无敌)' : ''}${nomana ? '(无自然回灵)' : ''} ${rep.state} 第${rep.depth}层 击杀${rep.kills} 法宝${rep.items.length} 实力${rep.power} 受伤${rep.dmgTotal} 辅助${rep.assists}${rep.fatal ? ' | 卡:' + JSON.stringify(rep.fatal) : ''}`);
    console.log(`      灵力消耗 ${rep.mpSpent} / 放技能 ${rep.skillCasts} 次 / 获得护盾 ${rep.shields} 层 / 灵力饥荒 ${rep.starve} 帧  (终局灵力 ${rep.mp}/${rep.maxMP})  档位[点射${rep.tiers[0]}/一段${rep.tiers[1]}/二段${rep.tiers[2]}]`);
    if (rep.dbg) console.log(`      末态: ${JSON.stringify(rep.dbg)}`);
    console.log(`      法宝: ${rep.itemNames.join('、') || '(无)'}`);
    console.log(`      专属: ${rep.ult ? rep.ult + ' Lv' + rep.ultLv : '-'} | 技能: ${rep.skills.join('/')} | 升级: ${rep.ultPicks.join('、') || '-'} | 买${rep.bought} 雷符${rep.bombed}`);
    if (fl) console.log(`      各层: ${fl}`);
  }

  // ---------------- 汇总 ----------------
  console.log('\n' + '='.repeat(78));
  console.log('  汇总');
  console.log('='.repeat(78));
  const byStyle = {};
  for (const r of runs) {
    const k = r.style;
    byStyle[k] = byStyle[k] || { n: 0, win: 0, depth: [], items: [], power: [], dmg: [] };
    const b = byStyle[k];
    b.n++; if (r.state === 'win') b.win++;
    b.depth.push(r.depth); b.items.push(r.items.length); b.power.push(r.power); b.dmg.push(r.dmgTotal);
  }
  const avg = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : 0;
  for (const k of Object.keys(byStyle)) {
    const b = byStyle[k];
    console.log(`  ${k}: ${b.n} 局 通关 ${b.win}  | 平均到第 ${avg(b.depth)} 层 | 平均法宝 ${avg(b.items)} 件 | 平均实力 ${avg(b.power)} | 平均受伤 ${avg(b.dmg)}`);
  }
  // 逐层曲线（只统计真的打到该层的局）
  const maxD = Math.max(...runs.map(r => r.depth), 1);
  console.log('\n  逐层曲线（只算打到该层的局）:');
  console.log('  层  样本  平均帧数  平均受伤  平均受伤/帧*1000  层首实力  层末实力  平均宝物数');
  for (let d = 1; d <= maxD; d++) {
    const rows = [];
    for (const r of runs) { const fl = r.floors.find(x => x.depth === d); if (fl) rows.push(fl); }
    if (!rows.length) continue;
    const f = avg(rows.map(x => x.frames)), dm = avg(rows.map(x => x.dmg));
    const per = avg(rows.map(x => x.frames > 0 ? x.dmg / x.frames * 1000 : 0));
    console.log(`  ${String(d).padEnd(3)} ${String(rows.length).padEnd(6)} ${String(f).padEnd(9)} ${String(dm).padEnd(9)} ${String(per).padEnd(18)} ${String(avg(rows.map(x => x.powerStart))).padEnd(9)} ${String(avg(rows.map(x => x.powerEnd))).padEnd(9)} ${avg(rows.map(x => x.items))}`);
  }
  console.log(`\n  pageerror: ${errs.length}`);
  errs.slice(0, 5).forEach(e => console.log('    - ' + e));
  console.log(`  截图: ${fs.readdirSync(SHOTDIR).length} 张`);
  fs.writeFileSync(path.join(__dirname, `_bot_smart_result_${ARM}.json`), JSON.stringify({ arm: ARM, runs, errs }, null, 2));
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 4000))]);
  process.exit(0);
})();
