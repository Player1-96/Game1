'use strict';
/* 探针：第十层 Boss 房，玩家满血满盾站桩，逐次记录受到的每一击。
   用户报「我有很多血和护甲然后突然死了」——
   先看清「打死玩家的到底是哪一击、伤害多少、无敌帧有没有生效」。 */
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
    G.newRun('feijian');
    G.stylePath = ['nordic', 'nordic', 'nordic']; G.seg = 1;
    G.newFloor(10);
    G.state = 'play';
    const pl = G.player;
    pl.maxHP = 8; pl.hp = 8; pl.shield = 5; pl.invuln = 0;
    pl.x = 240; pl.y = 200;
    const bossRoom = [...G.floor.rooms.values()].find(x => x.type === RT.BOSS);
    G.enterRoom(bossRoom, null);
    G.state = 'play';
    pl.x = 240; pl.y = 200;

    const log = [];
    const proto = Object.getPrototypeOf(pl);
    const orig = proto.takeDamage;
    proto.takeDamage = function (n, g2, sx, sy) {
      const before = { f: 0, n: n, hp: this.hp, sh: this.shieldTotal, inv: this.invuln };
      const ret = orig.call(this, n, g2, sx, sy);
      before.hpAfter = this.hp;
      before.shAfter = this.shieldTotal;
      before.invAfter = this.invuln;
      before.dead = this.dead;
      log.push(before);
      return ret;
    };

    let f = 0;
    while (!pl.dead && f < 4000) { f++; G.update(); log.forEach(x => { if (!x.f) x.f = f; }); }
    proto.takeDamage = orig;                       // 还原，免得影响后续
    return {
      frames: f, dead: pl.dead, hp: pl.hp, shield: pl.shieldTotal,
      boss: G.bossRef ? G.bossRef.def.name : '(无)',
      hits: log.length,
      /* 只回前 40 击 + 最后 12 击，中间的是重复过程 */
      head: log.slice(0, 40),
      tail: log.slice(-12)
    };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
