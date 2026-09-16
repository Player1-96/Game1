'use strict';
/* 难度梯度改造 —— 自动化测试
 * T1 动态难度：一层不受影响；法宝越多妖物越硬；校正有上限
 * T2 精英窟 / 密室按概率生成，且密室藏在精英窟里
 * T3 Boss 法器二选一
 * T4 功能型法宝重复即进阶（文案 + 数值），数值型可叠加
 * T5 追踪剑命中后不再绕着目标打转
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

  /* ---------------- T1 动态难度 ---------------- */
  sec('T1  动态难度：随法宝积累提升，且一层保持原样');
  {
    const r = await page.evaluate(() => {
      const G = window.Game;
      G.newRun('feijian');
      const p = G.player;
      const base1 = G.floor.diff.mult;
      const basePower = G.powerScore();

      // 堆一圈法宝再进第二层
      for (let i = 0; i < 10; i++) p.give(G.rollFabao(), G);
      const power2 = G.powerScore();
      G.newFloor(2);
      const mult2 = G.floor.diff.mult;
      let hp2 = 0, n2 = 0;
      for (const room of G.floor.rooms.values())
        for (const w of room.waves) for (const s of w) { hp2 += s.hpScale || 1; n2++; }

      // 再堆一大圈 → 更硬，但有上限
      for (let i = 0; i < 40; i++) p.give(G.rollFabao(), G);
      G.newFloor(3);
      const mult3 = G.floor.diff.mult;

      // 一层的血量系数应当就是 1.0（裸装进一层）
      G.newRun('feijian');
      const multF1 = G.floor.diff.mult;
      let hp1 = 0, n1 = 0;
      for (const room of G.floor.rooms.values())
        for (const w of room.waves) for (const s of w) { hp1 += s.hpScale || 1; n1++; }

      return {
        base1, basePower, power2, mult2, mult3, multF1,
        hp1: n1 ? hp1 / n1 : 0, hp2: n2 ? hp2 / n2 : 0,
        max: DIFF_MAX, min: DIFF_MIN
      };
    });
    ok('裸装实力分 = 1.0（基准）', Math.abs(r.basePower - 1) < 0.01, 'power=' + r.basePower.toFixed(2));
    ok('第一层不做任何校正（难度保持适中）', Math.abs(r.multF1 - 1) < 0.001, 'mult=' + r.multF1);
    ok('第一层妖物血量系数 = 1.0', Math.abs(r.hp1 - 1) < 0.001, 'hpScale=' + r.hp1.toFixed(3));
    ok('拿到法宝后实力分上升', r.power2 > r.basePower * 1.5,
      r.basePower.toFixed(2) + ' → ' + r.power2.toFixed(2));
    ok('第二层难度被抬起来（不再是白给）', r.mult2 > 1.05, 'mult=' + r.mult2);
    ok('第二层妖物血量系数明显高于一层', r.hp2 > r.hp1 * 1.15,
      r.hp1.toFixed(2) + ' → ' + r.hp2.toFixed(2));
    ok('法宝越多越硬', r.mult3 > r.mult2, r.mult2 + ' → ' + r.mult3);
    ok('校正有上限（不会变成加血墙）', r.mult3 <= r.max + 0.001, r.mult3 + ' ≤ ' + r.max);
  }

  /* ---------------- T2 精英窟 / 密室 ---------------- */
  sec('T2  精英窟与密室按概率生成，密室藏在精英窟里');
  {
    const r = await page.evaluate(() => {
      let floors = 0, withElite = 0, withSecret = 0, both = 0, secretNoElite = 0;
      let attached = 0, checked = 0, multiDoor = 0, hiddenOk = 0, touchesSpecial = 0;
      for (let i = 0; i < 240; i++) {
        const f = new Floor((i % 5) + 1, (Math.random() * 0xffffffff) >>> 0);
        floors++;
        const rooms = [...f.rooms.values()];
        const el = f.eliteRoom;
        const sec = rooms.find(x => x.type === RT.SECRET);
        if (el) withElite++;
        if (sec) withSecret++;
        if (el && sec) both++;
        if (sec && !el) secretNoElite++;
        if (!el || !sec) continue;
        checked++;
        const conns = [];
        for (let d = 0; d < 4; d++) {
          if (!sec.doors[d]) continue;
          conns.push(sec.neighbors[d]);
          if (sec.doorHidden[d]) hiddenOk++;
          const nb = f.rooms.get(sec.neighbors[d]);
          if (nb && nb.isSpecial) touchesSpecial++;
        }
        if (conns.length > 1) multiDoor++;
        if (conns.length === 1 && conns[0] === el.key) attached++;
      }
      return { floors, withElite, withSecret, both, secretNoElite, attached, checked, multiDoor, hiddenOk, touchesSpecial };
    });
    ok('精英窟不是每层都有', r.withElite > 0 && r.withElite < r.floors, `${r.withElite}/${r.floors} 层`);
    ok('密室也不是每层都有', r.withSecret > 0 && r.withSecret < r.floors, `${r.withSecret}/${r.floors} 层`);
    ok('有精英窟的层，密室大概率藏在其中', r.attached >= r.checked * 0.8,
      `${r.attached}/${r.checked} 间密室唯一通路指向精英窟`);
    ok('密室只开一道裂缝墙', r.multiDoor === 0 && r.hiddenOk === r.checked,
      `多门 ${r.multiDoor} / 裂缝墙 ${r.hiddenOk} vs 检查 ${r.checked}`);
    ok('密室不会接上其它特殊房', r.touchesSpecial === 0, 'touches=' + r.touchesSpecial);

    // 进精英窟不该让密室提前上小地图（否则裂缝位置白送）
    const leak = await page.evaluate(() => {
      const G = window.Game;
      for (let i = 0; i < 80; i++) {
        G.newRun('jujian'); G.newFloor(3);
        const el = [...G.floor.rooms.values()].find(x => x.elite);
        const sec = [...G.floor.rooms.values()].find(x => x.type === RT.SECRET);
        if (!el || !sec) continue;
        G.enterRoom(el, null);
        return { seen: sec.seen, visited: sec.visited, found: sec.secretFound };
      }
      return null;
    });
    ok('进入精英窟不会提前暴露密室（小地图不预告）',
      leak && !leak.seen && !leak.visited && !leak.found, JSON.stringify(leak));
  }

  /* ---------------- T3 Boss 二选一 ---------------- */
  sec('T3  Boss 通关：法器二选一');
  {
    const r = await page.evaluate(() => {
      const G = window.Game;
      G.newRun('feijian');
      G.enemies.length = 0; G.props.length = 0;
      G.onBossDead();
      const recs = G.room.props.filter(p => p.kind === 'item' && !p.taken);
      const groups = new Set(recs.map(p => p.group));
      const itemsBefore = G.player.items.length;
      // 二选一要按 E 认领：先站上去确认不会误拿
      const first = G.props.find(p => p.kind === 'item');
      G.player.x = first.x; G.player.y = first.y + 4; G.player.invuln = 9999;
      G.input.interact = false;
      for (let i = 0; i < 3; i++) G.update();
      const gotWithoutE = G.player.items.length - itemsBefore;
      G.input.interact = true;
      for (let i = 0; i < 3; i++) G.update();
      G.input.interact = false;
      const left = G.props.filter(p => p.kind === 'item' && !p.dead).length;
      const stillInRoom = G.room.props.filter(p => p.kind === 'item' && !p.taken).length;
      return { count: recs.length, groups: groups.size, gotWithoutE, got: G.player.items.length - itemsBefore, left, stillInRoom };
    });
    ok('只摆出两件法器', r.count === 2, 'rec=' + r.count);
    ok('两件同属一个二选一组', r.groups === 1, 'groups=' + r.groups);
    ok('站上去不自动拿走（要按 E）', r.gotWithoutE === 0, '到手 ' + r.gotWithoutE);
    ok('按 E 取走一件即入手', r.got === 1, '到手 ' + r.got);
    ok('另一件当场消散', r.left === 0, '残留 ' + r.left);
    ok('未取的那件写回房间数据（不会复活）', r.stillInRoom === 0, 'rec=' + r.stillInRoom);
  }

  /* ---------------- T4 法宝阶数 ---------------- */
  sec('T4  功能型法宝重复即进阶，数值型可叠加');
  {
    const r = await page.evaluate(() => {
      const G = window.Game;
      G.newRun('feijian');
      const p = G.player;
      const out = { func: {}, num: {}, roll: {} };

      // —— 功能型：混元珠（追踪）
      const h0 = p.stats.homing, r0 = p.stats.homingRange;
      p.give('hunyuan', G);
      const h1 = p.stats.homing;
      p.give('hunyuan', G);
      const h2 = p.stats.homing;
      p.give('hunyuan', G);
      const h3 = p.stats.homing, r3 = p.stats.homingRange;
      out.func = {
        h0, h1, h2, h3, r0, r3,
        v0: itemView(ITEM_MAP.hunyuan, 'feijian', 0),
        v1: itemView(ITEM_MAP.hunyuan, 'feijian', 1),
        v2: itemView(ITEM_MAP.hunyuan, 'feijian', 2),
        v3: itemView(ITEM_MAP.hunyuan, 'feijian', 3)
      };

      // —— 数值型：青锋剑可以重复
      const d0 = p.stats.damage;
      p.give('qingfeng', G);
      const d1 = p.stats.damage;
      p.give('qingfeng', G);
      const d2 = p.stats.damage;
      out.num = { d0, d1, d2 };

      // —— 抽取：功能型满阶后不再出现，数值型仍可出现
      const owned = [];
      for (const id of poolByType('fabao')) {
        const def = ITEM_MAP[id];
        // 功能型给到满阶（再抽就是浪费），数值型各持有一件
        const n = def.func ? fabaoMaxRank(def) : 1;
        for (let i = 0; i < n; i++) owned.push(id);
      }
      const seen = {};
      for (let i = 0; i < 400; i++) {
        const id = rollFabaoId(Math.random, owned);
        seen[id] = (seen[id] || 0) + 1;
      }
      const funcOver = Object.keys(seen).filter(id => ITEM_MAP[id].func);
      out.roll = { kinds: Object.keys(seen).length, funcOver: funcOver.length, numKinds: Object.keys(seen).length - funcOver.length };

      // —— 满阶文案：明确写成「已臻圆满」
      out.cap = itemView(ITEM_MAP.hunyuan, 'feijian', 9).name;
      return out;
    });
    ok('功能型首次给出基础效果', r.func.h1 > r.func.h0, `homing ${r.func.h0} → ${r.func.h1.toFixed(2)}`);
    ok('功能型二次进阶：数值继续提升', r.func.h2 > r.func.h1,
      `${r.func.h1.toFixed(2)} → ${r.func.h2.toFixed(2)}`);
    ok('功能型三次进阶：再提升并扩大追敌范围', r.func.h3 > r.func.h2 && r.func.r3 > r.func.r0,
      `homing ${r.func.h3.toFixed(2)} / range ${r.func.r0} → ${r.func.r3}`);
    ok('二阶名称带「·二重」', r.func.v1.name.indexOf('二重') >= 0, r.func.v1.name);
    ok('三阶名称带「·三重」', r.func.v2.name.indexOf('三重') >= 0, r.func.v2.name);
    ok('进阶描述与首阶不同（体现数值提升）',
      r.func.v1.desc !== r.func.v0.desc && r.func.v2.desc !== r.func.v1.desc,
      '「' + r.func.v1.desc + '」');
    ok('满阶后再拿写作「圆满」', r.func.v3.name.indexOf('圆满') >= 0, r.func.v3.name);
    ok('数值型可重复且效果叠加', r.num.d2 > r.num.d1 && r.num.d1 > r.num.d0,
      `damage ${r.num.d0} → ${r.num.d1.toFixed(1)} → ${r.num.d2.toFixed(1)}`);
    ok('功能型满阶后不再被抽到', r.roll.funcOver === 0, '越界 ' + r.roll.funcOver + ' 种');
    ok('数值型仍会被抽到（不浪费抽取）', r.roll.numKinds > 0, r.roll.numKinds + ' 种');
  }

  /* ---------------- T5 追踪剑 ---------------- */
  sec('T5  追踪剑命中后不再绕着目标打转');
  {
    const r = await page.evaluate(() => {
      const G = window.Game;
      G.newRun('feijian');
      const p = G.player;
      p.stats.homing = 0.25; p.stats.pierce = 3; p.stats.damage = 1;
      p.invuln = 999999;
      G.enemies.length = 0; G.bullets.length = 0;
      const e = new Enemy('shikui', 240, 150, 1);
      e.spawnT = 0; e.speed = 0; e.maxHp = 99999; e.hp = 99999;
      G.enemies.push(e);
      // 一发高穿透追踪剑，从左侧平飞掠过敌人
      const b = new Bullet(200, 150, 6, 0, {
        friendly: true, dmg: 1, r: 6, life: 60, pierce: 3, homing: 0.25,
        kind: 'sword', sprite: SPR.sword
      });
      G.bullets.push(b);
      const ang0 = Math.atan2(b.vy, b.vx);
      let hitAt = -1;
      for (let i = 0; i < 60; i++) {
        G.update();
        if (b.dead) break;
        if (b.hit.size > 0) { hitAt = i; break; }   // 命中那一帧就停，留帧观察后续
      }
      // 命中之后：逐帧记录转角，若还在追这个目标就会大幅回头
      const after = [];
      if (hitAt >= 0 && !b.dead) {
        for (let i = 0; i < 8 && !b.dead; i++) {
          const a0 = Math.atan2(b.vy, b.vx);
          G.update();
          if (b.dead) break;
          const a1 = Math.atan2(b.vy, b.vx);
          let d = a1 - a0;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          after.push(Math.abs(d));
        }
      }
      return { hitAt, hits: b.hit.size, turned: Math.max(0, ...after), samples: after.length };
    });
    ok('追踪剑确实命中了目标', r.hitAt >= 0 && r.hits === 1, `第 ${r.hitAt} 帧命中`);
    ok('命中后不再回头追同一个目标', r.turned < 0.02,
      `命中后最大转角 ${r.turned.toFixed(4)} rad（${r.samples} 帧采样）`);
  }

  sec('汇总');
  ok('全程无 pageerror / console.error', errs.length === 0, errs.slice(0, 3).join(' | '));

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  console.log('\n──────────────────────────────');
  console.log(`  通过 ${pass} / 失败 ${fail}`);
  if (failed.length) console.log('  失败项：\n   - ' + failed.join('\n   - '));
  else console.log('  全部通过 ✅');
  console.log('──────────────────────────────');
  process.exit(fail ? 1 : 0);
})();
