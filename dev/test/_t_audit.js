'use strict';
/* 玩家报障 8 条的修复验收 —— 自动化测试
 * ① 飞剑流按住不动不再停火
 * ② 清房掉落（灵石/钥匙）离开房间不丢失
 * ③ 藏珍阁等特殊房只落在死胡同
 * ④ 精英死亡地面危险给足预警
 * ⑤ 精英环形技有前摇
 * ⑥ Boss 转阶段清弹幕/无敌 + 燃烧触发阶段
 * ⑦ 局内长按 R 可重开换流派
 * ⑧ 运行时摆件写回房间数据，先出门不消失
 */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');

let pass = 0, fail = 0;
const failed = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '   ' + extra : '')); }
  else { fail++; failed.push(name); console.log('  FAIL  ' + name + (extra ? '   ' + extra : '')); }
}
function sec(t) { console.log('\n=== ' + t + ' ==='); }

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 820 } });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console.error] ' + m.text()); });

  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(250);

  await page.evaluate(() => {
    const G = window.Game;
    // 干净场景：清空房间、无敌、给足资源
    window.__clean = function (style) {
      G.newRun(style || 'feijian');
      G.state = 'play';
      G.enemies.length = 0; G.bullets.length = 0; G.hazards.length = 0;
      G.props.length = 0; G.pickups.length = 0; G.floaters.length = 0;
      G.floor.rooms.forEach(r => { r.cleared = true; r.waves = []; });
      const pl = G.player;
      pl.x = 240; pl.y = 170; pl.invuln = 999999; pl.hp = pl.maxHP;
      pl.skillGcd = 0; pl.mp = pl.maxMP;
      G.coins = 200; G.keys = 3; G.bombs = 3;
      return pl;
    };
    window.__otherRoom = function () {
      for (const r of G.floor.rooms.values()) if (r !== G.room) return r;
      return null;
    };
  });

  /* ---------------- ① 按住不动不停火 ---------------- */
  sec('①  飞剑流按住鼠标不动不再自动停火');
  {
    const r = await page.evaluate(() => {
      window.__clean('feijian');
      const G = window.Game;
      G.input.mouseDown = true;
      G.input.mouseT = -99999;                 // 陈旧时间戳：旧逻辑会因此判为已松手
      const start = G.bullets.length;
      let shots = 0, lastShots = 0;
      for (let i = 0; i < 330; i++) {
        const before = G.bullets.length;
        G.update();
        if (G.bullets.length > before) { shots++; G.bullets.length = 0; }
        if (i === 229) lastShots = shots;
      }
      return { shooting: G.input.shooting, shots, tailShots: shots - lastShots };
    });
    ok('按住 5.5 秒仍判定为射击中', r.shooting === true, `shooting=${r.shooting}`);
    ok('末段 100 帧仍在出剑', r.tailShots > 0, `总出剑 ${r.shots}，末段 ${r.tailShots}`);
  }

  /* ---------------- ② 清房掉落不因出门丢失 ---------------- */
  sec('②  清房灵石/钥匙离开房间不丢失');
  {
    const r = await page.evaluate(() => {
      window.__clean('feijian');
      const G = window.Game;
      const room = G.room;
      room.cleared = false; room.keyDrop = true; room.keyTaken = false;
      room.waves = []; room.coinPool = 12;
      G.enemies.length = 0;
      G.clearRoom();                                  // 钥匙/灵石落到房中央
      const droppedInRoom = room.drops.filter(d => d.kind === 'key').length;
      const afterClear = G.pickups.length;
      // 没走到房中央就出门
      const other = window.__otherRoom();
      G.enterRoom(other, null);
      const leftPickups = G.pickups.filter(k => k.kind === 'key').length;
      // 回来
      G.enterRoom(room, null);
      const backKeys = G.pickups.filter(k => k.kind === 'key').length;
      return { droppedInRoom, afterClear, leftPickups, backKeys };
    });
    ok('清房确实掉了钥匙', r.droppedInRoom > 0 && r.afterClear > 0, `记录 ${r.droppedInRoom}`);
    ok('出门后本房不再有该钥匙', r.leftPickups === 0, `left=${r.leftPickups}`);
    ok('回到房间钥匙仍在（不再永久丢失）', r.backKeys > 0, `back=${r.backKeys}`);
  }

  /* ---------------- ③ 特殊房只落在死胡同 ---------------- */
  sec('③  藏珍阁/坊市/祭坛只落在死胡同');
  {
    const r = await page.evaluate(() => {
      const deg = rr => rr.doors.reduce((s, d) => s + (d ? 1 : 0), 0);
      let floors = 0, bad = 0, badShop = 0, badAltar = 0, noTreasure = 0;
      for (let i = 0; i < 160; i++) {
        const depth = 1 + (i % 5);
        const fl = new Floor(depth, (Math.random() * 0xffffffff) >>> 0);
        floors++;
        const rooms = [...fl.rooms.values()];
        const tre = rooms.find(x => x.type === RT.TREASURE);
        const shop = rooms.find(x => x.type === RT.SHOP);
        const alt = rooms.find(x => x.type === RT.SACRIFICE);
        if (!tre) { noTreasure++; continue; }
        if (deg(tre) !== 1) bad++;
        if (shop && deg(shop) !== 1) badShop++;
        if (alt && deg(alt) !== 1) badAltar++;
      }
      return { floors, bad, badShop, badAltar, noTreasure };
    });
    ok('藏珍阁全部在死胡同', r.bad === 0, `非死胡同 ${r.bad}/${r.floors}`);
    ok('坊市全部在死胡同', r.badShop === 0, `非死胡同 ${r.badShop}`);
    ok('祭坛全部在死胡同', r.badAltar === 0, `非死胡同 ${r.badAltar}`);
    ok('每层都有藏珍阁', r.noTreasure === 0, `缺失 ${r.noTreasure} 层`);
  }

  /* ---------------- ④ 精英死亡危险预警 ---------------- */
  sec('④  精英死亡地面危险给足预警（≥45 帧）');
  {
    const r = await page.evaluate(() => {
      window.__clean('feijian');
      const G = window.Game;
      const out = [];
      for (const key of ELITE_KEYS) {
        const E = ELITE_DEF[key];
        G.hazards.length = 0; G.bullets.length = 0; G.timers = []; G.enemies.length = 0;
        const e = new Enemy(E.base, 240, 150, 1, key);
        e.eliteDeath(G);
        const warn = G.hazards.length ? G.hazards[G.hazards.length - 1].warn : null;
        out.push({ key, warn, immediateBullets: G.bullets.length, timers: G.timers.length });
      }
      return out;
    });
    const withHaz = r.filter(x => x.warn != null);
    ok('有地面危险的精英 warn 全部 ≥45', withHaz.every(x => x.warn >= 45),
      withHaz.map(x => x.key + ':' + x.warn).join(' '));
    const ring = r.filter(x => x.key === 'xiesha' || x.key === 'jiying');
    ok('血煞/疾影的死亡弹幕改为延迟释放', ring.every(x => x.timers > 0 && x.immediateBullets === 0),
      ring.map(x => x.key + ' timers=' + x.timers + ' 即时弹=' + x.immediateBullets).join(' '));
  }

  /* ---------------- ⑤ 精英环形技前摇 ---------------- */
  sec('⑤  精英环形技有前摇（贴身也能躲）');
  {
    const r = await page.evaluate(() => {
      window.__clean('feijian');
      const G = window.Game;
      const e = new Enemy('shikui', 240, 150, 1, 'xiesha');   // 血煞厉鬼
      e.spawnT = 0; e.eCd = 1; e.perkT = 0;
      G.enemies.length = 0; G.enemies.push(e);
      G.bullets.length = 0;
      // 触发一次神通
      let triggered = 0;
      for (let i = 0; i < 3; i++) {
        G.player.invuln = 999999;
        e.update(G);
        if (e.perkT > 0) triggered++;
      }
      const windStart = e.perkT, bulletsDuring = G.bullets.length;
      // 前摇结束前不应出环弹
      let fired = 0;
      for (let i = 0; i < 40; i++) {
        G.player.invuln = 999999;
        const before = G.bullets.length;
        e.update(G);
        if (G.bullets.length > before) fired += G.bullets.length - before;
      }
      return { triggered, windStart, bulletsDuring, fired, perkT: e.perkT };
    });
    ok('触发后进入前摇（perkT>0）', r.triggered > 0 && r.windStart > 0, `perkT=${r.windStart}`);
    ok('前摇期间不出环弹', r.bulletsDuring === 0, `期间弹数=${r.bulletsDuring}`);
    ok('前摇结束后正常放出环弹', r.fired >= 8, `放出 ${r.fired} 发`);
  }

  /* ---------------- ⑥ Boss 转阶段 ---------------- */
  sec('⑥  Boss 转阶段清弹幕/无敌 + 燃烧触发阶段');
  {
    const r = await page.evaluate(() => {
      window.__clean('feijian');
      const G = window.Game;
      // 直接造成伤害跨过 66% 阈值
      const b = new Boss('xuemo', 240, 120, 1);
      G.bullets = [{ friendly: false, dead: false }, { friendly: true, dead: false }];
      b.hurt(b.maxHp * 0.35, G);
      const afterHurt = { phase: b.phase, invuln: b.invuln, hostileLeft: G.bullets.filter(x => !x.friendly).length, friendlyLeft: G.bullets.filter(x => x.friendly).length };
      // 燃烧掉血也要能触发阶段切换
      const b2 = new Boss('baigu', 240, 120, 1);
      b2.hp = b2.maxHp * 0.68; b2.burn = 21; b2.burnDmg = b2.maxHp * 0.3;
      const before = b2.phase;
      for (let i = 0; i < 3; i++) b2.update(G);
      return { afterHurt, burn: { before, after: b2.phase } };
    });
    ok('转阶段清掉敌方弹幕、保留己方弹幕',
      r.afterHurt.hostileLeft === 0 && r.afterHurt.friendlyLeft === 1,
      `敌 ${r.afterHurt.hostileLeft} / 友 ${r.afterHurt.friendlyLeft}`);
    ok('转阶段给 Boss 短暂无敌', r.afterHurt.invuln > 0, `invuln=${r.afterHurt.invuln}`);
    ok('转阶段切换到更高阶段', r.afterHurt.phase >= 2, `phase=${r.afterHurt.phase}`);
    ok('纯燃烧掉血也能触发阶段切换', r.burn.after > r.burn.before, `phase ${r.burn.before}->${r.burn.after}`);
  }

  /* ---------------- ⑦ 局内长按 R 重开 ---------------- */
  sec('⑦  局内长按 R 回到流派选择');
  {
    const r = await page.evaluate(() => {
      window.__clean('jujian');
      const G = window.Game;
      G.input.restart = true;
      let chooseAt = -1;
      for (let i = 0; i < 80; i++) {
        G.update();
        if (G.state === 'choose' && chooseAt < 0) { chooseAt = i + 1; break; }
      }
      return { state: G.state, chooseAt, styleIdx: G.styleIdx };
    });
    ok('长按 R 进入流派选择', r.state === 'choose', `state=${r.state} @${r.chooseAt} 帧`);
    ok('选择高亮停在当前流派（巨剑流）', r.styleIdx === 1, `styleIdx=${r.styleIdx}`);
  }

  /* ---------------- ⑧ 摆件回写房间 ---------------- */
  sec('⑧  运行时摆件写回房间数据，先出门不消失');
  {
    const r = await page.evaluate(() => {
      window.__clean('feijian');
      const G = window.Game;
      const room = G.room;
      const other = window.__otherRoom();
      // 精英死亡不再额外掉法器（回报改在墙内密室）
      const e = new Enemy('shikui', 200, 150, 1, 'xiesha');
      e.eliteDeath(G);
      const eliteRec = room.props.filter(p => p.kind === 'item' && !p.taken).length;
      // Boss：两件法宝构成「二选一」
      G.onBossDead();
      const bossRecs = room.props.filter(p => p.kind === 'item' && !p.taken);
      const grouped = bossRecs.length > 0 && bossRecs.every(p => p.group && p.group === bossRecs[0].group);
      // 出门再回来
      G.enterRoom(other, null);
      G.enterRoom(room, null);
      const itemProps = G.props.filter(p => p.kind === 'item').length;
      // 站在摆件上还不算拿到 —— 二选一必须按 E 认领（否则走过去就误拿）
      const first = G.props.find(p => p.kind === 'item');
      G.player.x = first.x; G.player.y = first.y + 4;
      const itemsBefore = G.player.items.length;
      G.input.interact = false;
      for (let i = 0; i < 3; i++) G.update();
      const gotWithoutE = G.player.items.length - itemsBefore;
      const hintShown = !!G.pickHint;
      G.input.interact = true;
      for (let i = 0; i < 3; i++) G.update();
      G.input.interact = false;
      const leftAfterPick = G.props.filter(p => p.kind === 'item' && !p.dead).length;
      return {
        eliteRec, bossCount: bossRecs.length, grouped, itemProps, gotWithoutE, hintShown,
        got: G.player.items.length - itemsBefore, leftAfterPick
      };
    });
    ok('精英不再额外掉法器', r.eliteRec === 0, `rec=${r.eliteRec}`);
    ok('Boss 摆出两件法器', r.bossCount === 2, `rec=${r.bossCount}`);
    ok('两件法器同属一个二选一组', r.grouped === true);
    ok('出门再回来摆件仍在', r.itemProps === 2, `重建 ${r.itemProps} 件`);
    ok('站上去不自动拿走（要按 E）', r.gotWithoutE === 0, `到手 ${r.gotWithoutE} 件`);
    ok('站上去给出选取提示', r.hintShown === true);
    ok('按 E 后一件即入手', r.got === 1, `到手 ${r.got} 件`);
    ok('取走其一后另一件消散（法器二选一）', r.leftAfterPick === 0, `残留 ${r.leftAfterPick} 件`);
  }

  /* ---------------- ⑨ 护盾分池 ---------------- */
  sec('⑨  护盾：常驻不限时、只有护体金光限时、受击先扣限时');
  {
    const r = await page.evaluate(() => {
      const G = window.Game;
      const p = window.__clean('feijian');
      // 常驻护盾的四种来源：太虚护盾 / 羽衣 / 灵力丹 / 地上拾取的护盾
      p.shield = 0; p.tShield = 0; p.shieldT = 0;
      p.give('taixu', G); p.give('yuyi', G); p.give('lingdan', G);
      const k = new Pickup('shield', p.x, p.y, 1); k.collect(G);
      const perm0 = p.shield;                       // 2 + 1 + 2 + 1
      // 时间流逝：常驻护盾不该被时间带走
      for (let i = 0; i < 900; i++) { p.invuln = 9999; G.update(); }
      const permAfter = p.shield;
      // 护体金光：唯一的限时来源
      p.addSkill('huti'); p.selectSlot(0);
      p.mp = p.maxMP; p.skillGcd = 0; p.skillCd[0] = 0;
      G.useSkill();
      const cast = { total: p.shieldTotal, t: p.tShield, timer: p.shieldT };
      for (let i = 0; i < 320; i++) { p.invuln = 9999; G.update(); }
      const afterExpire = { total: p.shieldTotal, t: p.tShield, perm: p.shield };
      // 受击顺序：先限时、后常驻
      p.shield = 2; p.tShield = 1; p.shieldT = 600; p.invuln = 0;
      p.takeDamage(1, G);
      const first = [p.tShield, p.shield];
      p.invuln = 0; p.takeDamage(1, G);
      const second = [p.tShield, p.shield];
      return { perm0, permAfter, cast, afterExpire, first, second };
    });
    ok('常驻护盾来源累计 2+1+2+1', r.perm0 === 6, '常驻 ' + r.perm0 + ' 层');
    ok('常驻护盾不随时间消散', r.permAfter === r.perm0, '15 秒后仍 ' + r.permAfter + ' 层');
    ok('护体金光结的是限时护盾', r.cast.t === 2 && r.cast.timer === 300 && r.cast.total === 8, JSON.stringify(r.cast));
    ok('限时护盾到点散去、常驻留下', r.afterExpire.t === 0 && r.afterExpire.perm === r.perm0, JSON.stringify(r.afterExpire));
    ok('受击先扣限时护盾', r.first[0] === 0 && r.first[1] === 2, JSON.stringify(r.first));
    ok('限时扣完才动常驻', r.second[0] === 0 && r.second[1] === 1, JSON.stringify(r.second));
  }
  /* 太虚护盾：由「一次性 +2 格」改成「受创后稳住补回」（逐帧细节见 _probe_taixu.js） */
  {
    const r = await page.evaluate(() => {
      const G = window.Game;
      const p = window.__clean('feijian');
      G.enemies.length = 0; G.bullets.length = 0;
      const foe = () => {                     // 不动、不还手的靶子，只为满足「房内还有敌人」
        const e = new Enemy('xiesui', 430, 60, 1);
        e.spawnT = 0; e.maxHp = 99999; e.hp = 99999;
        e.speed = 0; e.cd = 999999; e.touch = 0;
        G.enemies.push(e);
      };
      const run = n => { for (let i = 0; i < n; i++) { p.invuln = Math.max(p.invuln, 1); G.update(); } };
      p.shield = 0; p.tShield = 0;
      foe();
      p.give('taixu', G);
      const onGet = { s: p.shield, cap: p.shieldCap, gap: p.shieldGap, t: p.shieldReviveT };
      run(900);                                        // 15 秒不挨打
      const noHurt = p.shield;
      p.shield = 0;
      p.invuln = 0; p.takeDamage(1, G);                // 受创 → 启动计时
      const t0 = p.shieldReviveT;
      run(p.shieldGap);
      const oneBack = p.shield;
      run(p.shieldGap * 2);                            // 给足时间，看会不会溢出上限
      const capped = p.shield;
      p.shield = 0; p.shieldReviveT = -1;
      p.invuln = 0; p.takeDamage(1, G);
      G.enemies.length = 0;                            // 清房
      run(1200);
      const empty = { s: p.shield, t: p.shieldReviveT };
      p.items.length = 0; p.shieldCap = 0; p.shieldGap = 0; p.shield = 0;
      const tiers = [];
      for (let i = 0; i < 3; i++) { p.give('taixu', G); tiers.push([p.shieldCap, p.shieldGap]); }
      return { onGet, noHurt, t0, oneBack, capped, empty, tiers };
    });
    ok('太虚护盾到手即补满、计时未启动',
      r.onGet.s === r.onGet.cap && r.onGet.t === -1,
      r.onGet.s + '/' + r.onGet.cap + ' 格，间隔 ' + r.onGet.gap + ' 帧');
    ok('没受过伤就不给盾', r.noHurt === r.onGet.cap, '15 秒后仍 ' + r.noHurt + ' 格');
    ok('受创后数满即补回一格', r.t0 === 0 && r.oneBack === 1,
      '计时归零后补回 ' + r.oneBack + ' 格');
    ok('补到上限就停', r.capped === r.onGet.cap, r.capped + ' 格');
    ok('清房后不回盾（防干等）', r.empty.s === 0 && r.empty.t === 0,
      '空房 20 秒后护盾 ' + r.empty.s + '、计时 ' + r.empty.t);
    ok('三阶上限递增、间隔递减',
      r.tiers[0][0] === 2 && r.tiers[2][0] === 4 && r.tiers[0][1] > r.tiers[1][1]
      && r.tiers[1][1] > r.tiers[2][1],
      r.tiers.map(t => t[0] + '格/' + t[1] + '帧').join(' → '));
  }

  /* ---------------- ⑩ 血量恒为整数 ---------------- */
  sec('⑩  气血取整：小数伤害不再让血条「空着却还活着」');
  {
    const r = await page.evaluate(() => {
      const G = window.Game;
      const p = window.__clean('feijian');
      p.hp = p.maxHP; p.shield = 0; p.tShield = 0;
      const steps = [];
      for (let i = 0; i < 10 && !p.dead; i++) {
        p.invuln = 0;
        p.takeDamage(1.3, G);                       // 精英余祸（毒沼 / 火圈）的小数伤害
        steps.push(p.hp);
      }
      // 再用真正的地面危险走一遍（warn 0 帧，立刻生效）
      const p2 = window.__clean('feijian');
      p2.hp = p2.maxHP; p2.shield = 0; p2.tShield = 0;
      G.hazards.length = 0;
      G.hazards.push(new Hazard(p2.x, p2.y, 40, 0, 900, 1.3, PAL.red, false));
      const haz = [];
      for (let i = 0; i < 400; i++) { p2.invuln = 0; G.update(); haz.push(p2.hp); }
      // 「血条整条空」= hp < 1；整数化之后只可能是真的阵亡
      const blankAlive = steps.some(h => h <= 0 && !p.dead) || haz.some(h => h <= 0 && !p2.dead);
      return {
        steps, dead: p.dead, allInt: steps.every(h => Number.isInteger(h)),
        hazAllInt: haz.every(h => Number.isInteger(h)), hazDead: p2.dead,
        hazMin: Math.min.apply(null, haz), blankAlive
      };
    });
    ok('小数伤害只出整数气血', r.allInt, JSON.stringify(r.steps));
    ok('血量归零即阵亡', r.dead === true && r.steps[r.steps.length - 1] === 0, JSON.stringify(r.steps));
    ok('地面危险同样只出整数气血', r.hazAllInt, '最低 ' + r.hazMin);
    ok('不会出现「血条空着却还活着」', r.blankAlive === false);
  }

  /* ---------------- ⑪ 灵力自然回复改为法宝 ---------------- */
  sec('⑪  灵力自然回复：开局 0，法宝「回灵符」每份 +1/秒');
  {
    const r = await page.evaluate(() => {
      const G = window.Game;
      const p = window.__clean('feijian');
      const base = p.stats.mpRegen;
      p.mp = 0;
      for (let i = 0; i < 180; i++) G.update();          // 3 秒
      const noFu = p.mp;
      p.give('huiling', G);
      const oneFu = p.stats.mpRegen;
      p.mp = 0;
      for (let i = 0; i < 60; i++) G.update();           // 1 秒
      const gain1 = p.mp;
      p.give('huiling', G);
      const twoFu = p.stats.mpRegen;
      p.mp = 0;
      for (let i = 0; i < 60; i++) G.update();
      const gain2 = p.mp;
      return { base, noFu, oneFu, gain1, twoFu, gain2,
               inDefs: !!ITEM_MAP.huiling,
               tally: ITEM_TALLY.huiling ? ITEM_TALLY.huiling(2) : '' };
    });
    ok('法宝表里有「回灵符」', r.inDefs === true);
    ok('开局自然回复为 0', r.base === 0 && r.noFu === 0, '3 秒后仍 ' + r.noFu + ' 点');
    ok('一份回灵符 = ≈1 点/秒', r.oneFu === 1 && Math.abs(r.gain1 - 1) <= 0.5, '1 秒 +' + r.gain1);
    ok('两份可叠加 = ≈2 点/秒', r.twoFu === 2 && Math.abs(r.gain2 - 2) <= 0.6, '1 秒 +' + r.gain2);
    ok('叠加文案合计正确', r.tally === '灵力自然回复 +2/秒', r.tally);
  }

  /* ---------------- ⑫ 图标唯一性 ---------------- */
  /* 同形状本身没问题（丹药都该是丸状），但「同形状 + 同配色」＝生成同一个位图，
     玩家只能靠位置猜它是什么。2026-09-21「灵力丹看起来占用了法宝格」就是这么来的。 */
  sec('⑫  图标不撞车（同形状 + 同配色 = 同一个位图）');
  {
    const r = await page.evaluate(() => {
      const groups = {};
      for (const d of Object.values(ITEM_MAP)) (groups[d.icon] = groups[d.icon] || []).push(d);
      const clash = [];
      for (const [icon, g] of Object.entries(groups)) {
        if (g.length < 2) continue;
        const seen = {};
        for (const d of g) {
          const key = d.c1 + '|' + d.c2;
          if (seen[key]) clash.push(icon + '（' + seen[key] + ' / ' + d.name + '）');
          seen[key] = d.name;
        }
      }
      return {
        total: Object.keys(ITEM_MAP).length,
        shared: Object.entries(groups).filter(([, g]) => g.length > 1).length,
        clash: clash
      };
    });
    ok('没有「同形状 + 同配色」的道具', r.clash.length === 0,
      r.clash.length ? r.clash.join('；')
        : r.total + ' 项道具，' + r.shared + ' 组共用形状、配色互不相同');
  }

  /* ---------------- ⑬ 小地图不再遮住右上角 ---------------- */
  sec('⑬  小地图：缩小 + 半透明，不再盖住走到右上角的妖物');
  const t13 = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian'); G.state = 'play';
    const size = G.floor.size;
    // 房间可行区（含一点半径余量）
    const walk = { x0: WALL_L + 8, x1: WALL_R - 8, y0: WALL_T + 8, y1: WALL_B - 8 };
    // 按参数算出小地图覆盖的世界区（画布 y 要减掉顶部 32px 的 HUD）
    const coverArea = (cell, gap) => {
      const w = size * (cell + gap) - gap + 4, h = size * (cell + gap) - gap + 8;
      const ox = 480 - w - 5, oy = 36;
      const x0 = ox - 2, x1 = ox + w + 2, y0 = oy - 2 - 32, y1 = oy + h - 32;
      const ow = Math.max(0, Math.min(x1, walk.x1) - Math.max(x0, walk.x0));
      const oh = Math.max(0, Math.min(y1, walk.y1) - Math.max(y0, walk.y0));
      return ow * oh;
    };
    const now = coverArea(7, 1);          // 现值
    const before = coverArea(9, 2);       // 改造前（2026-09-23 之前）
    const walkArea = (walk.x1 - walk.x0) * (walk.y1 - walk.y0);
    // 高亮计时：换房那一刻是满的，跑过之后要归零（否则等于一直不透明）
    const t0 = G.minimapT;
    for (let i = 0; i < 160; i++) G.update();
    return { size, now, before, ratio: now / walkArea, t0, tAfter: G.minimapT };
  });
  ok('压住的可玩区比改造前小得多',
    t13.now < t13.before * 0.55,
    `${Math.round(t13.before)} → ${Math.round(t13.now)} px²（旧版的 ${(t13.now / t13.before * 100).toFixed(0)}%）`);
  ok('残留遮挡不到可行区的 3%', t13.ratio < 0.03,
    `${(t13.ratio * 100).toFixed(1)}%（层网格 ${t13.size}×${t13.size}）`);
  ok('换房时短暂提亮、随后淡出',
    t13.t0 === 150 && t13.tAfter === 0, `${t13.t0} → ${t13.tAfter} 帧`);

  /* ---------------- ⑭ 血上限必须是整颗心 ----------------
     2026-09-24 用户试玩发现「第四滴血和前三滴不一样」。
     根因：「世界树之种」`maxHP += 1`（半颗心）→ 血上限变奇数 →
     HUD 按 ceil(maxHP/2) 画整颗心，最后一颗只有一半容量，**永远显示成半心**。
     满血时看起来像掉了一半血，而且与「真的掉了半颗血」完全同形 ——
     玩家根本分不清自己掉没掉血。所以：**血上限的增量必须是偶数**。 */
  sec('⑭  气血上限必须是整颗心（半心单位下必须为偶数）');
  const t14 = await page.evaluate(() => {
    const odd = [];
    const rows = [];
    /* ⚠️ 只遍历法宝 / 丹药：`gongfa`（小技能）的 apply 其实是 `cast(g, lv)` 签名，
       传 Player 进去必抛错，混在一起只会刷一屏「apply 抛错」的噪音。 */
    for (const def of ITEM_DEFS.filter(d => d.type === 'fabao' || d.type === 'dan')) {
      let gained = 0;
      try {
        const p = new Player(0, 0);
        const m0 = p.maxHP;
        def.apply(p, 1, 'feijian');        // rank=1：功能型走第一阶
        gained = p.maxHP - m0;
      } catch (e) { rows.push(def.id + ':apply 抛错'); continue; }
      if (gained !== 0) {
        rows.push(def.name + ' +' + gained + '（' + (gained / 2) + ' 颗心）');
        if (gained % 2 !== 0) odd.push(def.name + ' ' + gained);
      }
    }
    /* 世界树之种这类 `hp += n` 同步加的，也顺带量一次 hp 增量是否与 maxHP 一致 */
    let seedSync = null;
    const sd = ITEM_MAP['yggdrasil_seed'];
    if (sd) {
      const p2 = new Player(0, 0);
      const m1 = p2.maxHP, h1 = p2.hp;
      sd.apply(p2, 1, 'feijian');
      seedSync = { dMax: p2.maxHP - m1, dHp: p2.hp - h1 };
    }
    /* 读档兜底：奇数 maxHP 进档时应被归正 */
    let norm = null;
    try {
      const p3 = new Player(0, 0);
      p3.maxHP = 7; p3.hp = 7;
      if (p3.maxHP % 2 === 1) { p3.maxHP += 1; p3.hp = Math.min(p3.maxHP, p3.hp + 1); }
      norm = p3.maxHP;
    } catch (e) { norm = 'err'; }
    return { odd: odd, rows: rows, seedSync: seedSync, norm: norm };
  });
  console.log('     会改血上限的道具：' + (t14.rows.join('　') || '（无）'));
  ok('★ 没有任何道具把气血上限加成奇数（会做出半颗容器）',
    t14.odd.length === 0, t14.odd.length ? t14.odd.join('、') : '全部偶数');
  ok('★ 世界树之种：maxHP 与 hp 增量一致且为偶数',
    t14.seedSync && t14.seedSync.dMax % 2 === 0 && t14.seedSync.dHp === t14.seedSync.dMax,
    JSON.stringify(t14.seedSync));
  ok('老存档的奇数血上限被归正为偶数（补 1 并同步回血）', t14.norm === 8, String(t14.norm));

  /* ---------------- ⑮ 全局错误 ---------------- */
  /* ---------------- ⑮ 用户 2026-09-28 报的 4 个问题 ----------------
     ① 融合界面缺光标（选中/未选无区别）② 传送门被石柱埋住踩不到
     ③ 血条太长与右上角重合 ④ 满血满盾被 Boss 贴身磨死却毫无读数 */
  sec('⑮  2026-09-28 四项反馈：光标 / 传送阵 / 血条长度 / 贴身读数');
  const t15 = await page.evaluate(() => {
    const G = window.Game;
    const out = {};

    /* ① 融合面板必须给「光标」一个独立的 class —— 以前渲染压根没用 f.idx，
       玩家按方向键屏幕毫无反应，只能靠按 E 之后哪个格子变了来反推。 */
    try {
      const pool = G.fusionPool ? G.fusionPool() : [];
      G.fusion = { forge: null, pool: pool.length ? pool : ['qingfeng'], idx: 0, slots: [null, null], msg: '' };
      G.state = 'fusion';
      renderFusionPanel();
      const html = document.getElementById('fusion').innerHTML;
      out.fusionHasCur = html.indexOf('fusItem cur') >= 0;
      /* 光标移动后 cur 应该跟着换位置 */
      if (pool.length > 1) {
        G.fusionMove(1);
        const html2 = document.getElementById('fusion').innerHTML;
        const i1 = html.indexOf('fusItem cur');
        const i2 = html2.indexOf('fusItem cur');
        out.moveShiftsCur = i1 !== i2;
      } else out.moveShiftsCur = null;
      G.fusion = null; G.state = 'play'; renderFusionPanel();
    } catch (e) { out.fusionErr = String(e.message).slice(0, 60); }

    /* ② 传送阵必须落在不被石柱压住的地方（房中央立一根柱子来逼它让位） */
    try {
      G.newRun('feijian');
      G.stylePath = ['cn']; G.seg = 0; G.applySegmentPalette();
      G.newFloor(1); G.state = 'play';
      G.enemies.length = 0;
      /* 把房间正中央塞满石柱 —— 原实现写死 (240, 154) 会正好压在上面 */
      G.room.obstacles.length = 0;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          G.room.obstacles.push({ x: 240 + i * 30 - 14, y: 154 + j * 30 - 14, w: 28, h: 28, kind: 'rock' });
        }
      }
      const sp = G.spotForProp(240, 154, 16);
      const hit = G.room.obstacles.some(o =>
        sp.x + 16 > o.x && sp.x - 16 < o.x + o.w && sp.y + 16 > o.y && sp.y - 16 < o.y + o.h);
      out.portal = { x: Math.round(sp.x), y: Math.round(sp.y), inRock: hit,
                     moved: Math.hypot(sp.x - 240, sp.y - 154) > 1 };
    } catch (e) { out.portalErr = String(e.message).slice(0, 60); }

    /* ③ 血条长度：monkey-patch drawImage 量 HUD 那颗血/盾图标的最大 x */
    try {
      G.newRun('feijian');
      G.stylePath = ['cn']; G.seg = 0; G.applySegmentPalette();
      G.newFloor(1); G.state = 'play';
      G.enemies.length = 0; G.room.obstacles.length = 0;
      const measure = (maxHP, shield) => {
        G.player.maxHP = maxHP; G.player.hp = maxHP; G.player.shield = shield;
        const xs = [];
        const proto = CanvasRenderingContext2D.prototype;
        const orig = proto.drawImage;
        proto.drawImage = function (img, x, y) {
          if (y === 8 && x < 460) xs.push(x);       // HUD 心血 / 护盾都在 y=8
          return orig.apply(this, arguments);
        };
        G.draw();
        proto.drawImage = orig;
        return xs.length ? Math.max.apply(null, xs) : 0;
      };
      out.hud = { normal: measure(8, 3), huge: measure(40, 5), absurd: measure(80, 8) };
    } catch (e) { out.hudErr = String(e.message).slice(0, 60); }

    /* ④ Boss 贴身必须有持续读数（contactHurtT），否则「无声磨死」 */
    try {
      G.newRun('feijian');
      G.stylePath = ['nordic', 'nordic', 'nordic']; G.seg = 1;
      G.newFloor(10); G.state = 'play';
      const pl = G.player;
      pl.maxHP = 8; pl.hp = 8; pl.shield = 0; pl.invuln = 0;
      G.enemies.length = 0; G.bullets.length = 0; G.room.obstacles.length = 0;
      const br = [...G.floor.rooms.values()].find(x => x.type === RT.BOSS);
      G.enterRoom(br, null); G.state = 'play';
      pl.invuln = 0; G.contactHurtT = 0;
      /* 把玩家按在 Boss 身上 */
      if (G.bossRef) {
        const b0 = G.bossRef;
        /* ⚠️ Boss 有「登场凝形期」：`spawnT > 0` 时 update 直接 return，
           连接触判定都不跑（那段是免费输出窗口）。测贴身读数必须先把凝形跳过去，
           否则只会量到 0 —— 第一次写这条断言就是这么假失败的。 */
        b0.spawnT = 0;
        let maxT = 0;
        for (let f = 0; f < 20; f++) {
          pl.x = b0.x; pl.y = b0.y; pl.invuln = 0;      // 每帧按回去（否则被我加的推力弹开）
          G.update();
          if (G.contactHurtT > maxT) maxT = G.contactHurtT;
        }
        out.contact = { t: maxT, hasBoss: true, tNow: G.contactHurtT,
                        inEnemies: G.enemies.indexOf(b0) >= 0,
                        dist: +Math.hypot(pl.x - b0.x, pl.y - b0.y).toFixed(1),
                        br: +b0.r.toFixed(1), pr: +pl.r.toFixed(1), dead: b0.dead };
      } else out.contact = { hasBoss: false };
    } catch (e) { out.contactErr = String(e.message).slice(0, 60); }

    return out;
  });
  console.log('     血条图标最右 x：常态 ' + t15.hud.normal + '　20 颗心+5 盾 ' + t15.hud.huge
    + '　40 颗心+8 盾 ' + t15.hud.absurd + '（右上角计数在 x=344）');
  console.log('     传送阵落点：' + JSON.stringify(t15.portal));
  console.log('     贴身读数 contactHurtT = ' + (t15.contact ? t15.contact.t : 'n/a'));

  ok('① 融合面板渲染出独立的「光标」class（不再靠按 E 反推）',
    t15.fusionHasCur === true, String(t15.fusionHasCur) + (t15.fusionErr ? ' err:' + t15.fusionErr : ''));
  ok('① 光标会跟着方向键走（渲染位置真的变了）',
    t15.moveShiftsCur !== false, String(t15.moveShiftsCur));
  ok('② 房中央全是石柱时，传送阵自动让位到空地',
    t15.portal && t15.portal.inRock === false && t15.portal.moved === true,
    JSON.stringify(t15.portal));
  ok('③ 血条再长也不会越过 x=200（右上角计数在 344）',
    t15.hud.huge < 200 && t15.hud.absurd < 200,
    'huge=' + t15.hud.huge + ' absurd=' + t15.hud.absurd);
  ok('③ 血条没被压缩得太狠（常态照旧逐颗画）',
    t15.hud.normal <= 8 + 12 * 8, 'normal=' + t15.hud.normal);
  ok('④ Boss 贴身时给出持续读数（contactHurtT > 0）',
    t15.contact && t15.contact.hasBoss && t15.contact.t > 0,
    JSON.stringify(t15.contact));

  /* ----------------------------------------------------------------
   *  ⑯  2026-09-29：顶栏布局 + 点阵字体的可读性 + 乱披风的乱弧接线
   * ------------------------------------------------------------- */
  sec('⑯  顶栏：道具不压血条 / 字模画得出来 / 乱披风对舞剑流真的有效');
  const t16 = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('wujian');
    G.newFloor(1);
    G.state = 'play';
    const pl = G.player;
    pl.maxHP = 14; pl.hp = 14; pl.shield = 4; pl.mp = 100; pl.maxMP = 100;
    const cv = document.getElementById('game');
    const ctx = cv.getContext('2d');

    /* ① 抓 drawHUD 里画的字符串，验每个字符都有字模 ——
       缺字模时 drawPixelText 会**静默跳过**（还照推 6px），
       「灵力 100/100」就是这么变成「100  100」的。 */
    const texts = [];
    const origText = drawPixelText;
    window.drawPixelText = function (g, text, x, y, sc, c) { texts.push(String(text)); return origText(g, text, x, y, sc, c); };
    /* ② 抓气血/护盾的落点，验它们不和灵力条抢同一块地方 */
    const icons = [];
    const origImg = ctx.drawImage.bind(ctx);
    ctx.drawImage = function (img, ...a) {
      if (img === SPR.heart[0] || img === SPR.heart[1] || img === SPR.heart[2] || img === SPR.shield[1]) {
        icons.push(a.length >= 4 ? { x: a[0], y: a[1], h: a[3] } : { x: a[0], y: a[1], h: img.height });
      }
      return origImg(img, ...a);
    };
    G.drawHUD(ctx);
    ctx.drawImage = origImg;
    window.drawPixelText = origText;

    /* 灵力条几何：与源码保持一致，改了哪边另一边都会红 */
    const MP_X = 22, MP_Y = 19, MP_W = 76, MP_H = 11;
    const badGlyph = [], overlap = [];
    for (const t of texts) {
      for (const ch of t.toUpperCase()) {
        if (!FONT5[ch]) { badGlyph.push(t + ' ← ' + JSON.stringify(ch)); break; }
      }
    }
    for (const ic of icons) {
      const hit = ic.y + ic.h > MP_Y && ic.y < MP_Y + MP_H && ic.x + 12 > MP_X && ic.x < MP_X + MP_W;
      if (hit) overlap.push('x' + ic.x + ' y' + ic.y);
    }
    const mpLabel = texts.filter(t => t.indexOf('MP') === 0)[0] || null;
    return { texts: texts.slice(0, 6), badGlyph: badGlyph.slice(0, 4), badN: badGlyph.length,
             iconN: icons.length, overlap: overlap.slice(0, 4), overlapN: overlap.length, mpLabel: mpLabel };
  });
  ok('顶栏画出的每个字符都有字模（缺字模会被静默吞掉）', t16.badN === 0, t16.badGlyph.join('；'));
  ok('★ 气血/护盾图标不再压到灵力条上', t16.overlapN === 0,
    t16.iconN + ' 个图标，重叠 ' + t16.overlapN + ' 处 ' + t16.overlap.join('；'));
  ok('灵力条标签是画得出来的「MP x/y」', /^MP \d+\/\d+$/.test(String(t16.mpLabel)), String(t16.mpLabel));

  const t16b = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('wujian');
    G.newFloor(1);
    G.state = 'play';
    const pl = G.player;
    pl.items.length = 0; pl.recomputeStats('wujian');
    G.enemies.length = 0;
    if (G.room && G.room.obstacles) G.room.obstacles.length = 0;
    let calls = 0;
    const orig = Fusion.spreadArcOf;
    Fusion.spreadArcOf = function (F, base) { calls++; return orig.apply(this, arguments); };
    const swing = () => { pl.shootCd = 0; STYLES.wujian.attack(pl, G, { shooting: true, aiming: true, aimAngle: 0 }); };
    swing();
    const plain = calls;
    pl.give('luanpifeng', G); G.itemPopup = null;
    calls = 0;
    swing();
    Fusion.spreadArcOf = orig;
    return { plain: plain, withItem: calls, wildArc: !!(pl.stats.fus && pl.stats.fus.wildArc) };
  });
  ok('★ 乱披风之后，舞剑流的挥砍也会走「乱弧」', t16b.withItem > 0,
    '带法宝时调用 ' + t16b.withItem + ' 次（未接线时是 0）');
  ok('乱披风确实置上了 wildArc 标记', t16b.wildArc === true, String(t16b.wildArc));

  /* ----------------------------------------------------------------
   *  ⑰  2026-09-29：乱披风的「乱弧」要有视觉 —— 机制看不见等于没做
   *
   *      上一节验的是「乱弧接上了」；但接上之后玩家只会看到弧宽忽大忽小，
   *      如果刃光还是一整条平滑的弧，只会被当成 bug。所以这一节验**画法**：
   *      乱弧必须是**分段的**（由 arc() 调用数间接代表），且阶位 ≥2 多一层金边。
   *      用假 ctx 直接量 Slash.draw()，不碰真画布也不依赖截图。
   * ------------------------------------------------------------- */
  sec('⑰  乱弧的画法：碎段 / 金边 / 两侧流派的反馈');
  const t17 = await page.evaluate(() => {
    const mkCtx = () => {
      const c = { arc: 0, stroke: 0, fillRect: 0, strokeColors: [], fillColors: [] };
      return {
        calls: c, save() {}, restore() {}, beginPath() {}, stroke() { c.stroke++; },
        arc() { c.arc++; }, fill() {}, fillRect() { c.fillRect++; },
        set strokeStyle(v) { c.strokeColors.push(v); }, get strokeStyle() { return ''; },
        set fillStyle(v) { c.fillColors.push(v); }, get fillStyle() { return ''; },
        set lineWidth(v) {}, set globalAlpha(v) {}, set lineCap(v) {}
      };
    };
    /* 刃光刚生成时 k=0（还没扫出去），要 update 几帧才有可画的弧 */
    const make = (opt) => {
      const sl = new Slash(240, 150, 0, 1.6, 46, Object.assign({ col: PAL.jadeL, life: 12, sweep: true }, opt));
      for (let i = 0; i < 5; i++) sl.update();
      return sl;
    };
    const plain = mkCtx(), wild = mkCtx(), wild3 = mkCtx();
    make({}).draw(plain);
    make({ wild: true }).draw(wild);
    make({ wild: true, tier: 3 }).draw(wild3);

    /* 飞剑流那一侧：乱弧的「散剑」靠**角度**自证（剑飞出去的方向看得见），
       补的是枪口碎星 + 破空声。
       ⚠️ 别断言「出手数不变」—— 乱披风本身带 spread +2，散剑数量本来就会涨；
          要验的是**角度间隔从固定变成随机**：这才是「乱弧」的定义。 */
    const G = window.Game;
    G.newRun('feijian'); G.newFloor(1); G.state = 'play';
    const pl = G.player;
    G.enemies.length = 0;
    if (G.room && G.room.obstacles) G.room.obstacles.length = 0;
    let wildSounds = 0;
    const origWild = SFX.wildSlash;
    SFX.wildSlash = function () { wildSounds++; };
    const shootAngles = () => {
      G.bullets.length = 0; pl.shootCd = 0;
      STYLES.feijian.attack(pl, G, { shooting: true, aiming: true, aimAngle: 0 });
      return G.bullets.map(b => +Math.atan2(b.vy, b.vx).toFixed(4)).sort((x, y) => x - y);
    };
    const plainA1 = shootAngles(), plainA2 = shootAngles(), plainSounds = wildSounds;
    pl.give('luanpifeng', G); G.itemPopup = null;
    const wildA1 = shootAngles(), wildA2 = shootAngles(), wildSoundsAfter = wildSounds;
    SFX.wildSlash = origWild;

    /* 舞剑流那一侧：Slash 真的带上了标记 */
    G.newRun('wujian'); G.newFloor(1); G.state = 'play';
    const pl2 = G.player; G.enemies.length = 0; G.slashes.length = 0;
    if (G.room && G.room.obstacles) G.room.obstacles.length = 0;
    pl2.shootCd = 0;
    STYLES.wujian.attack(pl2, G, { shooting: true, aiming: true, aimAngle: 0 });
    const plainSlash = G.slashes[0] ? { wild: G.slashes[0].wild, tier: G.slashes[0].tier } : null;
    G.slashes.length = 0;
    pl2.give('luanpifeng', G); G.itemPopup = null;
    pl2.fusionMem.luanpifeng = { a: 3, b: 3 }; pl2.recomputeStats('wujian');
    pl2.shootCd = 0;
    STYLES.wujian.attack(pl2, G, { shooting: true, aiming: true, aimAngle: 0 });
    const wildSlash = G.slashes[0] ? { wild: G.slashes[0].wild, tier: G.slashes[0].tier } : null;

    return {
      plainArc: plain.calls.arc, wildArc: wild.calls.arc, wild3Arc: wild3.calls.arc,
      wild3Gold: wild3.calls.strokeColors.indexOf(PAL.goldL) >= 0,
      wildGold: wild.calls.strokeColors.indexOf(PAL.goldL) >= 0,
      wildRect: wild.calls.fillRect, plainRect: plain.calls.fillRect,
      plainFanSame: JSON.stringify(plainA1) === JSON.stringify(plainA2),
      wildFanSame: JSON.stringify(wildA1) === JSON.stringify(wildA2),
      plainFanN: plainA1.length, wildFanN: wildA1.length,
      plainSounds: plainSounds, wildSounds: wildSoundsAfter,
      plainSlash: plainSlash, wildSlash: wildSlash
    };
  });
  ok('★ 乱弧的刃光是**分段**画的（同一片刃光，arc 调用数 ≥ 平砍的 3 倍）',
    t17.wildArc >= t17.plainArc * 3, '平砍 ' + t17.plainArc + ' 段 vs 乱弧 ' + t17.wildArc + ' 段');
  ok('乱弧沿弧溅碎星（fillRect 明显多于平砍）',
    t17.wildRect > t17.plainRect + 4, '平砍 ' + t17.plainRect + ' vs 乱弧 ' + t17.wildRect);
  ok('Lv3 的乱弧多一层金边（阶位 ≥2）',
    t17.wild3Gold === true && t17.wildGold === false && t17.wild3Arc > t17.wildArc,
    'Lv1 有金边=' + t17.wildGold + ' / Lv3 有金边=' + t17.wild3Gold);
  ok('舞剑流：平砍不带乱弧标记，有乱披风后带上（并带上阶位）',
    !!t17.plainSlash && t17.plainSlash.wild === false
    && !!t17.wildSlash && t17.wildSlash.wild === true && t17.wildSlash.tier === 3,
    JSON.stringify(t17.plainSlash) + ' → ' + JSON.stringify(t17.wildSlash));
  ok('★ 飞剑流：散剑的角度间隔从「固定扇形」变成「每发都不同」',
    t17.plainFanSame === true && t17.wildFanSame === false,
    '平砍两发一致=' + t17.plainFanSame + ' / 乱披风两发一致=' + t17.wildFanSame);
  ok('飞剑流：乱披风的散剑多一声「乱」的破空（平砍时没有）',
    t17.plainSounds === 0 && t17.wildSounds > 0,
    '声音 ' + t17.plainSounds + '→' + t17.wildSounds);

  /* ----------------------------------------------------------------
   *  ⑱  顶栏分区不重叠（2026-10-09 用户第二次报「遮挡」）
   *
   *      顶栏第一行同时住着三户人家：左侧资源（心/护甲/灵力条）、
   *      中间楼层名（DOM）、右侧消耗品计数（灵石/钥匙/雷符）。
   *      楼层名原先按**画面**居中（left:50%），画面中线并不等于「三户之间的中线」，
   *      楼名一长就往左挤进资源区。改成按「安全区」居中（left:54%）。
   *
   *      ⭐ 断言口径必须是**实测像素/几何**，不能是「CSS 里写了 54%」——
   *         写死百分比的断言遇到布局变化会一起错。
   * ------------------------------------------------------------- */
  sec('⑱  顶栏分区：楼层名不挤资源区 / 专属技格子里图标不压文字');
  const t18 = await page.evaluate(() => {
    const G = window.Game;
    const out = {};

    /* ---- ① 用**最长**的楼层名 + 最多血量（两边都顶到极限才叫边界测试）---- */
    G.newRun('wujian');
    G.stylePath = ['cn', 'cn', 'nordic'];
    G.seg = 2;
    G.applySegmentPalette();
    G.newFloor(11);                       // 第十一层（两位数）
    G.state = 'play';
    const pl = G.player;
    pl.maxHP = 40; pl.hp = 40;            // 20 颗心 → 压缩成 7 颗 + 两位余数
    pl.shield = 12; pl.tShield = 0;       // 12 格盾 → 压缩成 4 个 + 两位余数
    pl.mp = 100; pl.maxMP = 100;
    G.itemPopup = null;
    updateOverlay();

    const cv = document.getElementById('game');
    const ctx = cv.getContext('2d');
    const cwRect = cv.getBoundingClientRect();
    const scale = cwRect.width / 480;

    /* 左侧资源区 + 右侧消耗品区：扫 canvas 顶栏的像素（左右各扫一半） */
    const img = ctx.getImageData(0, 0, 480, 30).data;
    const isBg = (r2, g2, b2) => r2 < 46 && g2 < 40 && b2 < 62;
    const colHas = (x) => {
      for (let y = 0; y < 30; y++) {
        const i2 = (y * 480 + x) * 4;
        if (!isBg(img[i2], img[i2 + 1], img[i2 + 2])) return true;
      }
      return false;
    };
    let resRight = -1;                    // 左侧资源区最右
    for (let x = 0; x < 340; x++) if (colHas(x)) resRight = x;
    let consLeft = 9999;                  // 右侧消耗品最左（只认 x>340 之后的起点）
    for (let x = 344; x < 480; x++) if (colHas(x)) { consLeft = x; break; }

    /* 楼层名（DOM）换算到 canvas 坐标 */
    const fn = document.getElementById('floorName');
    const fr = fn.getBoundingClientRect();
    const fl = { x0: +((fr.left - cwRect.left) / scale).toFixed(1),
                 x1: +((fr.right - cwRect.left) / scale).toFixed(1), text: fn.textContent };

    out.floor = { text: fl.text, x0: fl.x0, x1: fl.x1, resRight: resRight, consLeft: consLeft,
                  gapL: +(fl.x0 - resRight).toFixed(1), gapR: +(consLeft - fl.x1).toFixed(1) };

    /* ---- ② 专属技格子：三个流派的「图标 vs 等级/段位文字」---- */
    const cells = [];
    for (const st of ['feijian', 'jujian', 'wujian']) {
      G.newRun(st);
      G.newFloor(1);
      G.state = 'play';
      const pl2 = G.player;
      pl2.ult = { style: st, lv: 5 };
      pl2.ultCd = 0; pl2.wjStage = 0; pl2.wjChainT = 0;
      const ic = styleIcon(st);
      let icon = null; const texts = [];
      const orig = ctx.drawImage.bind(ctx);
      ctx.drawImage = function (im) {
        if (im === ic) {
          const a = Array.prototype.slice.call(arguments, 1);
          const m = ctx.getTransform();
          icon = { y: +(m.b * a[0] + m.d * a[1] + m.f).toFixed(1), h: +(m.d * ic.height).toFixed(1) };
        }
        return orig.apply(ctx, arguments);
      };
      const origText = window.drawPixelText;
      window.drawPixelText = function (g, t, x, y, sc, c) {
        /* ⚠️ 必须限定在格子内（x>=452）：顶栏的消耗品数字是单个数字，
           不加条件会被误当成段位数字（探针第一版就是这么假报的）。 */
        if (x >= 452 && /^\d$|^L\d$/.test(String(t))) texts.push({ t: String(t), y: y });
        return origText(g, t, x, y, sc, c);
      };
      G.draw();
      ctx.drawImage = orig;
      window.drawPixelText = origText;
      const texTop = texts.length ? Math.min.apply(null, texts.map(t => t.y)) : null;
      const ov = (icon && texTop !== null)
        ? +(Math.min(icon.y + icon.h, texTop + 7) - Math.max(icon.y, texTop)).toFixed(2) : null;
      cells.push({ style: st, ic: ic.width + 'x' + ic.height, icon: icon,
                   texTop: texTop, overlap: ov });
    }
    out.cells = cells;
    return out;
  });
  ok('① 用最长楼层名 + 极限血量：「' + t18.floor.text + '」',
    t18.floor.text.length >= 10, t18.floor.text);
  ok('★ 楼层名**不与左侧资源区重叠**（心/护甲/灵力条）',
    t18.floor.gapL >= 6,
    '资源区右边界 x=' + t18.floor.resRight + '　楼层名左边界 x=' + t18.floor.x0 + '　间距 ' + t18.floor.gapL + 'px');
  ok('★ 楼层名**不与右侧消耗品计数重叠**',
    t18.floor.gapR >= 6,
    '楼层名右边界 x=' + t18.floor.x1 + '　消耗品起点 x=' + t18.floor.consLeft + '　间距 ' + t18.floor.gapR + 'px');
  const badCell = t18.cells.filter(c => !(c.overlap !== null && c.overlap <= 0));
  ok('★ 专属技格子：三个流派的「流派图标」都不压「L5 / 段位数字」',
    badCell.length === 0,
    t18.cells.map(c => c.style + ' ' + c.ic + ' 图标y' + (c.icon ? c.icon.y + '~' + (c.icon.y + c.icon.h).toFixed(1) : '?')
      + ' 文字y' + c.texTop + ' 重叠' + c.overlap).join('；'));

  /* ----------------------------------------------------------------
   *  ⑲  黑屏兜底（2026-10-09 用户「打到第十层直接黑屏」）
   *
   *      机制：draw() 第一步就是 drawImage(room.bg)。它一旦是 undefined，
   *      drawImage 抛异常 → 这一帧只剩底色（纯黑）；而**每帧都抛** → 持续黑屏。
   *      用户那张图正是「canvas 全黑 + 连 HUD 都没有，但顶栏 DOM 还在」。
   *
   *      两道兜底（都在这节钉住）：
   *        ① draw 里发现 bg 缺失就**当场重建**（1ms 的事，玩家察觉不到）
   *        ② 万一重建也失败：连续 20 帧出错就弹提示条 + 把错误画在画布上
   *           —— 黑屏是零信息故障，必须变成一条**能被转发的报错**
   * ------------------------------------------------------------- */
  sec('⑲  黑屏兜底：背景自愈 + 渲染错误可见');
  const t19 = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    const nonBgPx = () => {
      const d = document.getElementById('game').getContext('2d').getImageData(0, 0, 480, 320).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 26 || d[i + 1] > 24 || d[i + 2] > 36) n++;
      return n;
    };

    /* ---- ① 背景失效 → draw 自愈 ---- */
    G.newRun('wujian');
    G.stylePath = ['cn', 'nordic', 'nordic'];
    G.seg = 1; G.applySegmentPalette();
    G.newFloor(10); G.state = 'play';
    G.room.bg = null;
    let err1 = null;
    try { G.draw(); } catch (e) { err1 = e.message; }
    out.heal = { bgBack: !!G.room.bg, err: err1, nonBg: nonBgPx() };

    /* ---- ② 重建也失败时：连续失败要看得见（走真实 frame） ----
       ⚠️ 这一段是**故意制造渲染异常**的，而 frame 会 console.error 上报 ——
          不屏蔽的话会污染最后那条「全程无 console.error」的检查（第一版就是这么假失败的）。
          所以这里临时把 console.error 静音，测完立刻还原。 */
    const keepRender = G.floor.renderBG;
    const keepConsoleErr = console.error;
    console.error = function () {};
    try {
      G.floor.renderBG = function () { return undefined; };
      G.room.bg = null;
      G.drawErrN = 0;
      const t0 = window.performance.now();
      for (let i = 0; i < 26; i++) G.frame(t0 + i * 17);
      const banner = document.getElementById('crashBanner');
      out.banner = { shown: !!banner, text: banner ? banner.textContent : '' };

      /* ---- ③ 恢复之后提示条要自己消失 ---- */
      G.floor.renderBG = keepRender;
      G.room.bg = null;
      for (let i = 0; i < 4; i++) G.frame(t0 + 2000 + i * 17);
      out.recovered = { bannerGone: !document.getElementById('crashBanner'), bgBack: !!G.room.bg };
    } finally {
      console.error = keepConsoleErr;
      G.floor.renderBG = keepRender;
    }

    /* 收尾：别把坏状态留给后面的用例 */
    if (typeof hideCrashBanner === 'function') hideCrashBanner();
    G.drawErrN = 0;
    return out;
  });
  ok('背景图失效时 draw **当场重建**（不再每帧抛异常）',
    t19.heal.err === null && t19.heal.bgBack === true,
    '异常=' + (t19.heal.err || '无') + '　bg 已重建=' + t19.heal.bgBack);
  ok('★ 重建之后画面上确实有内容（不是一片黑）',
    t19.heal.nonBg > 60000, '非背景像素 ' + t19.heal.nonBg);
  ok('★ 渲染连续失败会弹提示条（把零信息的黑屏变成可转发的报错）',
    t19.banner.shown === true, String(t19.banner.text).slice(0, 60).replace(/\n/g, ' / '));
  ok('恢复之后提示条自动消失（不赖在屏幕上）',
    t19.recovered.bannerGone === true && t19.recovered.bgBack === true,
    '提示条已收=' + t19.recovered.bannerGone + '　bg=' + t19.recovered.bgBack);

  sec('⑳  渲染故障取证（黑匣子）：带堆栈 + 现场快照，且能回传');
  const t20 = await page.evaluate(() => {
    const G = window.Game;
    const KEY = 'xiuxian-isaac.diag.v1';
    const ls = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return null; } };
    const out = {};
    try { localStorage.removeItem(KEY); } catch (e) { }
    window.__diag = { n: 0, last: '', lastAt: 0 };
    window.__lastDiag = null;

    /* ---- ① 真造一次渲染异常，取证里必须有堆栈**和**现场 ----
       ⚠️ 与 ⑲ 一样要静音 console.error，否则污染最后那条「全程无 console.error」 */
    const keepRender = G.floor.renderBG, keepConsoleErr = console.error;
    console.error = function () { };
    try {
      G.room.bg = null;
      /* renderBG 返回 undefined → room.bg 补不上 → 下一行 drawImage 抛 ——
         这正是「第十层黑屏」那条链路 */
      G.floor.renderBG = function () { return undefined; };
      G.drawErrN = 0;
      const t0 = window.performance.now();
      for (let i = 0; i < 3; i++) G.frame(t0 + i * 17);
    } finally {
      console.error = keepConsoleErr;
      G.floor.renderBG = keepRender;
      if (typeof hideCrashBanner === 'function') hideCrashBanner();
      G.drawErrN = 0;
    }
    const rec = window.__lastDiag;
    out.rec = rec ? {
      kind: rec.kind, hasMsg: !!rec.msg, stackLen: (rec.stack || '').length,
      depth: rec.snap && rec.snap.depth,
      style: rec.snap && rec.snap.style,
      roomType: rec.snap && rec.snap.room && rec.snap.room.type,
      bgFlag: rec.snap && rec.snap.room ? rec.snap.room.bg : null,
      enemyArr: !!(rec.snap && Array.isArray(rec.snap.enemies))
    } : null;
    out.saved = (ls() || []).length;

    /* ---- ② 同一条错连着刷（黑屏每帧抛一次）只该记一条 ---- */
    const n1 = window.__diag.n, len1 = (ls() || []).length;
    recordDiag('draw', new Error(window.__diag.last));
    out.throttle = { nSame: window.__diag.n === n1, lenSame: (ls() || []).length === len1 };

    /* ---- ③ 上限 5 条：连记 8 条不同的错，落盘不该超过 5 ---- */
    for (let i = 0; i < 8; i++) recordDiag('draw', new Error('boom-' + i));
    out.cap = { n: window.__diag.n, len: (ls() || []).length };

    /* ---- ④ 回传：payload 必须是**完整记录**（堆栈 + 快照），而且打到 /__diag ---- */
    const calls = [];
    const keepFetch = window.fetch;
    window.fetch = function (url, opt) { calls.push({ url: url, body: opt && opt.body }); return { catch: function () { } }; };
    let postOk = false;
    try { postOk = diagPost({ kind: 'x', msg: 'm', stack: 's', snap: { depth: 3 } }) === true; }
    finally { window.fetch = keepFetch; }
    let parsed = null;
    try { parsed = JSON.parse(calls[0] && calls[0].body); } catch (e) { }
    out.post = {
      ok: postOk, url: calls[0] && calls[0].url,
      /* 测试页是 file:// 打开的 —— 这时应当退到本机开发服务器的绝对地址，
         而不是同源的 /__diag（file:// 下没有同源服务端） */
      proto: location.protocol,
      snapOk: !!(parsed && parsed.snap && parsed.snap.depth === 3), stackOk: !!(parsed && parsed.stack === 's')
    };

    try { localStorage.removeItem(KEY); } catch (e) { }
    return out;
  });
  ok('★ 渲染出错留下的诊断带堆栈 + 现场快照（不再只有一句 message）',
    !!t20.rec && t20.rec.hasMsg && t20.rec.stackLen > 10 && t20.rec.roomType != null
    && t20.rec.bgFlag === false && t20.rec.enemyArr === true,
    JSON.stringify(t20.rec));
  ok('诊断同步落 localStorage（刷新后还能回传）', t20.saved === 1, '落盘 ' + t20.saved + ' 条');
  ok('同一条错连刷只记一次（黑屏 1 秒 60 帧不会写 60 条）',
    t20.throttle.nSame === true && t20.throttle.lenSame === true, JSON.stringify(t20.throttle));
  ok('诊断上限 5 条', t20.cap.n === 5 && t20.cap.len === 5, JSON.stringify(t20.cap));
  ok('★ 回传的是完整诊断（含快照），且打到 /__diag —— file:// 下退到本机开发服务器',
    t20.post.ok === true && String(t20.post.url).indexOf('/__diag') >= 0
    && t20.post.snapOk === true && t20.post.stackOk === true,
    JSON.stringify(t20.post));

  sec('㉑  全局错误检查');
  ok('全程无 pageerror / console.error', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\n========================================');
  console.log('PASS ' + pass + ' / FAIL ' + fail);
  if (fail) console.log('失败项: ' + failed.join('；'));
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL', e && e.stack || e); process.exit(1); });
