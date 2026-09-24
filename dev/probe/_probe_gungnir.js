'use strict';
/* 探针：冈格尼尔现在到底做了什么？三个目标挨着排，伤害递增吗？ */
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
    const shoot = (itemId) => {
      G.newRun('feijian');
      G.stylePath = ['cn']; G.seg = 0; G.applySegmentPalette();
      const pl = G.player;
      if (itemId) pl.give(itemId, G);
      G.newFloor(1); G.state = 'play';
      G.enemies.length = 0; G.bullets.length = 0;
      /* ⚠️ 两个会让「法宝看起来没生效」的坑：
         ① 石柱会挡剑 —— 房间随机生成的障碍常压在出生点上，先清掉
         ② **玩家必须站在 WALL_T/B 之内**：房间只有 480×288，可行区是 34~254，
            站到 y=290 的话剑一出生就在墙外，第一帧撞墙消失，测出来全是 0 伤害。 */
      G.room.obstacles.length = 0;
      pl.x = 240; pl.y = 240;
      /* 三个靶子竖着排成一列（冈格尼尔描述说「排成一列时最痛」） */
      const foes = [0, 1, 2].map(i => {
        const e = new Enemy('xiesui', pl.x, pl.y - 40 - i * 26, 1);
        e.spawnT = 0; e.speed = 0; e.maxHp = 99999; e.hp = 99999; e.touch = 0; e.cd = 999999;
        G.enemies.push(e); return e;
      });
      pl.shootCd = 0;
      const before = G.bullets.length;
      STYLES.feijian.attack(pl, G, { shooting: true, aiming: true, aimAngle: -Math.PI / 2 });
      const after = G.bullets.length;
      let frames = 0;
      /* ⚠️ 钉住是**按帧递减**的（射一发要飞 32 帧，而钉住只有 18 帧），
         所以必须在飞行途中取**峰值**，等子弹飞完再读就全是 0 了。 */
      const maxPin = [0, 0, 0];
      for (let f = 0; f < 80; f++) {
        if (!G.bullets[0] || G.bullets[0].dead) break;
        G.update(); frames++;
        foes.forEach((e, i) => { if (e.pin > maxPin[i]) maxPin[i] = e.pin; });
      }
      /* 单独验一次「钉住真的阻止移动」：手动给上 pin，跑 10 帧看位移。
         注意 pin 递减完就会恢复移动，所以只跑 10 帧（< 18）。 */
      foes.forEach(e => { e.speed = 1.2; e.pin = 18; });
      const q0 = foes.map(e => [+e.x.toFixed(1), +e.y.toFixed(1)]);
      for (let f = 0; f < 10; f++) G.update();
      const q1 = foes.map(e => [+e.x.toFixed(1), +e.y.toFixed(1)]);
      const pinned = foes.map((e, i) => +Math.hypot(q1[i][0] - q0[i][0], q1[i][1] - q0[i][1]).toFixed(2));
      foes.forEach(e => { e.pin = 0; });
      const r0 = foes.map(e => [+e.x.toFixed(1), +e.y.toFixed(1)]);
      for (let f = 0; f < 10; f++) G.update();
      const r1 = foes.map(e => [+e.x.toFixed(1), +e.y.toFixed(1)]);
      const freed = foes.map((e, i) => +Math.hypot(r1[i][0] - r0[i][0], r1[i][1] - r0[i][1]).toFixed(2));
      return { 射前: before, 射后: after, 跑了: frames,
               伤害: foes.map(e => +(99999 - e.hp).toFixed(2)),
               钉住峰值: maxPin, 钉住时位移: pinned, 解除后位移: freed };
    };
    const stat = (id) => {
      const q = new Player(0, 0);
      ITEM_MAP[id].apply(q, 0, 'feijian');
      return { pierce: q.stats.pierce, homing: q.stats.homing, reAim: q.stats.reAim,
               ramp: (q.stats.fus || {}).ramp || 0, pin: q.stats.pin || 0 };
    };
    return {
      裸装: shoot(null),
      冈格尼尔: shoot('gungnir'),
      gStat: stat('gungnir'),
      贯灵梭机制: 'rampMul：只有融合产物「贯灵梭」才有（第 n 个目标 ×(1+(n-1)ramp)）'
    };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
