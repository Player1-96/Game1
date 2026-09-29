'use strict';
/* 探针：第四批三条「弹道形状」到底成不成立？
   ① 往复梭 —— 飞出去会不会**原路折返**，回程能不能把同一只妖物**再穿一遍**
   ② 回鸣镜 —— 撞墙会不会弹开、每弹一次更重、裂缝墙优先（不能把「打裂缝」堵死）
   ③ 剑影环 —— 是不是**靠命中充能**（8 次一柄）、封顶 3 柄、圈外有充能读数
   ④ 顺手验：近战走 Fusion.onHit 之后，「雷火焚天」对舞剑流是否真的点得着（既有 bug） */
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(FILE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const r = await p.evaluate(() => {
    const G = window.Game;
    const out = {};

    const setup = (style, items) => {
      G.newRun(style);
      G.newFloor(1); G.state = 'play';
      const pl = G.player;
      G.enemies.length = 0; G.bullets.length = 0; G.orbits.length = 0;
      G.hazards.length = 0; G.slashes.length = 0;
      if (G.room && G.room.obstacles) G.room.obstacles.length = 0;
      (items || []).forEach(id => { pl.give(id, G); G.itemPopup = null; });
      G.orbits.length = 0;                      // give 不生成环剑，保险起见
      pl.x = 240; pl.y = 150; pl.shootCd = 0;
      return pl;
    };

    /* ---------- ① 往复梭 ---------- */
    {
      const pl = setup('feijian', ['wangfu']);
      const e = new Enemy('xiesui', 240, 150 - 70, 1);
      e.spawnT = 0; e.speed = 0; e.maxHp = 9999; e.hp = 9999; e.touch = 0; e.cd = 999999;
      G.enemies.push(e);
      pl.shootCd = 0;
      STYLES.feijian.attack(pl, G, { shooting: true, aiming: true, aimAngle: -Math.PI / 2 });
      const bl = G.bullets[0];
      if (!bl) { out.boom = { err: '没射出子弹' }; }
      else {
        const y0 = bl.y, vy0 = bl.vy;
        let turnedAt = -1, turnedY = 0;
        let hitCount = 0, prevHp = e.hp;
        for (let f = 0; f < 120; f++) {
          G.update();
          if (e.hp < prevHp - 0.01) { hitCount++; prevHp = e.hp; }
          if (turnedAt < 0 && bl.vy * vy0 < 0) { turnedAt = f; turnedY = bl.y; }
          if (bl.dead) break;
        }
        out.boom = {
          起始vy: +vy0.toFixed(2), 折返帧: turnedAt, 折返时y: +turnedY.toFixed(1),
          折返后vy: +bl.vy.toFixed(2), 累计命中同一妖物次数: hitCount,
          飞得最远y: +y0.toFixed(1), 回落y: +bl.y.toFixed(1)
        };
      }
    }

    /* ---------- ② 回鸣镜 ---------- */
    {
      const pl = setup('feijian', ['huiming']);
      /* 朝右墙打：从 x=400 往右飞，很快就会撞到 WALL_R */
      const bl = new Bullet(400, 150, 8, 0, {
        friendly: true, dmg: 3, r: 5, life: 120, pierce: 0, fus: pl.stats.fus, kind: 'sword', sprite: SPR.sword
      });
      G.bullets.push(bl);
      const dmg0 = bl.dmg, b0 = bl.bounce;
      let flippedAt = -1;
      for (let f = 0; f < 60; f++) {
        G.update();
        if (flippedAt < 0 && bl.vx < 0) { flippedAt = f; break; }
        if (bl.dead) break;
      }
      out.bounce = {
        初始弹数: b0, 反弹帧: flippedAt, 反弹后vx: +bl.vx.toFixed(2),
        伤害: +dmg0.toFixed(2) + ' → ' + +bl.dmg.toFixed(2),
        剩余弹数: bl.bounce, 还活着: !bl.dead
      };
      /* 再验一次「石柱也会弹」 */
      const pl2 = setup('feijian', ['huiming']);
      G.room.obstacles.push({ x: 300, y: 140, w: 20, h: 20 });
      const bl2 = new Bullet(250, 150, 6, 0, {
        friendly: true, dmg: 2, r: 5, life: 120, fus: pl2.stats.fus, kind: 'sword', sprite: SPR.sword
      });
      G.bullets.push(bl2);
      let obFlip = -1;
      for (let f = 0; f < 40; f++) {
        G.update();
        if (bl2.vx < 0) { obFlip = f; break; }
        if (bl2.dead) break;
      }
      out.bounce.石柱反弹帧 = obFlip;
      out.bounce.石柱反弹后vx = +bl2.vx.toFixed(2);
    }

    /* ---------- ③ 剑影环（充能） ---------- */
    {
      const pl = setup('feijian', ['jianying']);
      const need = ORBIT_NEED;
      const log = [];
      /* 打 3 倍充能所需的命中数，看生成节奏与封顶 */
      let hits = 0;
      const dummy = () => {
        const e = new Enemy('xiesui', pl.x, pl.y - 40, 1);
        e.spawnT = 0; e.speed = 0; e.maxHp = 99999; e.hp = 99999; e.touch = 0; e.cd = 999999;
        G.enemies.push(e); return e;
      };
      for (let n = 0; n < need * 5; n++) {
        const e = dummy();
        Fusion.onHit(e, { fus: pl.stats.fus, dmg: 3, chain: 0, crit: false }, G);
        hits++;
        e.dead = true; G.enemies.length = 0;
        log.push(G.orbits.length);
      }
      out.orbit = {
        每柄需要命中: need, 封顶: ORBIT_MAX,
        命中数对应柄数: log.filter((v, i) => i === 0 || v !== log[i - 1]).map((v, i) => v).join('→'),
        第need次: log[need - 1], 第need乘2次: log[need * 2 - 1],
        第need乘3次: log[need * 3 - 1], 第need乘5次: log[need * 5 - 1],
        满柄后剩余充能: pl.orbitChg
      };
      /* 环剑真的会砍人吗：把一只妖物放在环上，跑几帧看掉血 */
      const e2 = new Enemy('xiesui', pl.x + ORBIT_R, pl.y, 1);
      e2.spawnT = 0; e2.speed = 0; e2.maxHp = 9999; e2.hp = 9999; e2.touch = 0; e2.cd = 999999;
      G.enemies.push(e2);
      const hp0 = e2.hp;
      for (let f = 0; f < 200; f++) G.update();
      out.orbit.环剑砍人掉血 = +(hp0 - e2.hp).toFixed(2);
      out.orbit.环剑会在到期后消失 = G.orbits.length + ' 柄（跑了 ' + 200 + ' 帧）';
    }

    /* ---------- ④ 近战 onHit（既有 bug 修复后） ---------- */
    {
      /* 雷火焚天 = 引雷符 + 赤焰符（命中即点燃） */
      const pl = setup('wujian', ['leihuo']);
      const e = new Enemy('xiesui', pl.x + 40, pl.y, 1);
      e.spawnT = 0; e.speed = 0; e.maxHp = 9999; e.hp = 9999; e.touch = 0; e.cd = 999999;
      G.enemies.push(e);
      pl.shootCd = 0;
      STYLES.wujian.attack(pl, G, { shooting: true, aiming: true, aimAngle: 0 });
      out.meleeOnHit = { 命中后burn: e.burn, burnDmg: +(e.burnDmg || 0).toFixed(2), 掉血: +(9999 - e.hp).toFixed(2) };
    }

    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
