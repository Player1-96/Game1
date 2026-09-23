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

  /* ---------------- ⑭ 全局错误 ---------------- */
  sec('⑭  全局错误检查');
  ok('全程无 pageerror / console.error', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\n========================================');
  console.log('PASS ' + pass + ' / FAIL ' + fail);
  if (fail) console.log('失败项: ' + failed.join('；'));
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL', e && e.stack || e); process.exit(1); });
