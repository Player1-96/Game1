'use strict';
/* 技能系统（重大版本）—— 自动化测试
 * T1 灵力：初值 / 开局不回蓝 / 回灵符涓流 / 斩妖掉珠 / 满值不溢出
 * T2 小技能槽：入槽 / 升级 / 满级 / 槽满触发替换
 * T3 1/2/3 切换与 Q 释放：扣灵力、公共冷却、灵力不足不放
 * T4 等级缩放：同一技能 1 级与 5 级数值确有差异
 * T5 专属技能：首杀精英获得，之后每次三选一精进
 * T6 万剑归宗：30 柄、三列、十轮
 * T7 天崩剑狱：预警圈 + 范围伤害，圈外不吃伤害
 * T8 升级路线确实生效（剑数 / 冷却 / 范围 / 清弹幕）
 * T9 选择界面期间世界冻结
 */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

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

  /* ---------------- T1 灵力 ---------------- */
  sec('T1  灵力：初值 40 / 上限 100 / 开局不回蓝 / 回灵符 +1 每秒 / 斩妖掉灵力珠');
  {
    const r = await page.evaluate(() => {
      const G = window.Game;
      G.newRun('feijian');
      const p = G.player;
      const start = { mp: p.mp, max: p.maxMP, regen: p.stats.mpRegen };
      p.mp = 0;
      for (let i = 0; i < 60; i++) G.update();          // 1 秒
      const after1s = p.mp;
      p.mp = 0;
      for (let i = 0; i < 300; i++) G.update();         // 5 秒
      const after5s = p.mp;
      // 捡一张回灵符后应当开始涓流回蓝
      p.give('huiling', G);
      p.mp = 0;
      for (let i = 0; i < 60; i++) G.update();          // 1 秒
      const withFu = p.mp;
      p.mp = 50;                                        // 连斩若干只（掉率是概率事件，样本太小会偶发扑空）
      G.enemies.length = 0; G.pickups.length = 0;
      let mana = [];
      for (let n = 0; n < 14 && mana.length === 0; n++) {
        const e = new Enemy('xiesui', 200, 150, 1);
        e.spawnT = 0; G.enemies.push(e);
        G.update();
        e.hurt(9999, G);
        mana = G.pickups.filter(k => k.kind === 'mp').map(k => k.value);
      }
      const afterKill = p.mp;
      // 捡起来应当真的入账
      const before = p.mp; let got = 0;
      if (mana.length) { G.pickups.filter(k => k.kind === 'mp')[0].collect(G); got = p.mp - before; }
      p.mp = 200;                                        // 不该溢出
      for (let i = 0; i < 5; i++) G.update();
      return { start, after1s, after5s, withFu, afterKill, capped: p.mp, max: p.maxMP,
               mana, manaDropped: mana.length > 0, picked: got };
    });
    ok('初始灵力 40 / 上限 100', r.start.mp === 40 && r.start.max === 100, JSON.stringify(r.start));
    ok('开局无自然回复（0 点/秒）', r.start.regen === 0 && r.after1s === 0, '1 秒后 +' + r.after1s.toFixed(2));
    ok('5 秒也不回', r.after5s === 0, '+' + r.after5s.toFixed(2));
    ok('回灵符提供 ≈1 点/秒', Math.abs(r.withFu - 1) <= 0.5, '1 秒后 +' + r.withFu.toFixed(2));
    ok('斩妖不再自动回灵力', r.afterKill <= 51, '50 → ' + r.afterKill.toFixed(1));
    ok('斩妖改为掉落灵力珠', r.manaDropped === true, JSON.stringify(r.mana));
    ok('捡起灵力珠才真正入账', r.picked === r.mana[0], '入账 ' + r.picked + ' / 珠值 ' + r.mana[0]);
    ok('灵力不会超过上限', r.capped <= r.max, r.capped + '/' + r.max);
  }

  /* ---------------- T2 技能槽 ---------------- */
  sec('T2  小技能槽：入槽 / 升级 / 满级 / 槽满替换');
  {
    const r = await page.evaluate(() => {
      const G = window.Game;
      G.newRun('feijian');
      const p = G.player;
      const a = p.addSkill('tianlei');          // new
      const b = p.addSkill('tianlei');          // level
      const lv2 = p.slots[0].lv;
      // 堆到满级
      for (let i = 0; i < 10; i++) p.addSkill('tianlei');
      const maxed = p.addSkill('tianlei');      // maxed
      const lvAtMax = p.slots[0].lv;
      p.addSkill('suodi'); p.addSkill('wuxing');
      const fourth = p.addSkill('huti');        // replace
      const slotCount = p.slots.filter(Boolean).length;
      // 走一遍替换流程
      G.openSkillReplace('huti');
      const pickKind = G.pick && G.pick.kind;
      G.pickPick(1);
      G.pickConfirm();
      const after = p.slots.map(s => (s ? s.id + ':' + s.lv : null));
      // 满级再拾 → 灵力上限补偿
      const before = p.maxMP;
      p.give('tianlei', G);
      return { a, b, lv2, maxed, lvAtMax, fourth, slotCount, pickKind, after, mpUp: p.maxMP - before };
    });
    ok('首次习得 → new', r.a === 'new', r.a);
    ok('重复拾得 → level（升到 2 级）', r.b === 'level' && r.lv2 === 2, r.b + ' Lv.' + r.lv2);
    ok('等级封顶 5 级', r.lvAtMax === 5 && r.maxed === 'maxed', 'Lv.' + r.lvAtMax + ' / ' + r.maxed);
    ok('槽位最多 3 个', r.slotCount === 3, String(r.slotCount));
    ok('槽满再拾 → replace', r.fourth === 'replace', r.fourth);
    ok('替换界面为 skill 类型', r.pickKind === 'skill', String(r.pickKind));
    ok('替换后换上的技能从 1 级起算', r.after[1] === 'huti:1', JSON.stringify(r.after));
    ok('被换下的技能不再残留', !r.after.some(s => s && s.startsWith('suodi')), JSON.stringify(r.after));
    ok('满级重复拾得 → 灵力上限 +5', r.mpUp === 5, '+' + r.mpUp);
  }

  /* ---------------- T3 切换与释放 ---------------- */
  sec('T3  1/2/3 切换 · Q 释放：扣灵力 / 公共冷却 / 灵力不足不放');
  {
    const r = await page.evaluate(() => {
      const G = window.Game;
      G.newRun('feijian');
      const p = G.player;
      p.addSkill('tianlei'); p.addSkill('suodi');
      const sel2 = p.selectSlot(1);
      const selEmpty = p.selectSlot(2);        // 空槽，不该切过去
      p.mp = 100; p.skillGcd = 0;
      G.useSkill();
      const afterCast = { mp: p.mp, gcd: p.skillGcd };
      // 公共冷却期间再按无效
      G.useSkill();
      const duringGcd = p.mp;
      // 灵力不足
      p.skillGcd = 0; p.mp = 3;
      G.useSkill();
      const poor = p.mp;
      // 换到另一个技能（消耗不同）
      p.selectSlot(0); p.mp = 100; p.skillGcd = 0;
      G.useSkill();
      const tianleiCost = 100 - p.mp;
      p.selectSlot(1); p.mp = 100; p.skillGcd = 0;
      G.useSkill();
      const suodiCost = 100 - p.mp;
      return { sel2, selEmpty, afterCast, duringGcd, poor, tianleiCost, suodiCost,
               defCost: [SKILL_DEF.tianlei.cost, SKILL_DEF.suodi.cost] };
    });
    ok('切到有技能的槽位成功', r.sel2 === true);
    ok('空槽不切换', r.selEmpty === false);
    ok('释放扣灵力', r.afterCast.mp === 100 - r.defCost[1], r.afterCast.mp + '（缩地成寸 ' + r.defCost[1] + '）');
    ok('释放后进入公共冷却', r.afterCast.gcd > 0, 'gcd=' + r.afterCast.gcd);
    ok('冷却期间再按不扣灵力', r.duringGcd === r.afterCast.mp, String(r.duringGcd));
    ok('灵力不足不释放', r.poor === 3, String(r.poor));
    ok('不同技能灵力消耗不同', r.tianleiCost !== r.suodiCost,
      '天雷引 ' + r.tianleiCost + ' / 缩地成寸 ' + r.suodiCost);
  }

  /* ---------------- T4 等级缩放 ---------------- */
  sec('T4  同一技能 1 级与 5 级数值确有差异');
  {
    const r = await page.evaluate(() => {
      const out = {};
      for (const id of Object.keys(SKILL_DEF)) {
        out[id] = { d1: skillDesc(id, 1), d5: skillDesc(id, 5), v1: SKILL_DEF[id].vals[0], v5: SKILL_DEF[id].vals[4] };
      }
      return out;
    });
    for (const id of Object.keys(r)) {
      ok(SKILL_DEF_NAME(id) + ' 1 级与 5 级数值不同', r[id].v1 !== r[id].v5,
        r[id].v1 + ' → ' + r[id].v5);
      ok(SKILL_DEF_NAME(id) + ' 说明文案随等级变化', r[id].d1 !== r[id].d5);
    }
  }

  /* ---------------- T5 专属技能获取与精进 ---------------- */
  sec('T5  专属技能：首杀精英获得 · 之后三选一精进');
  {
    const r = await page.evaluate(() => {
      const G = window.Game;
      G.newRun('feijian');
      const p = G.player;
      const before = p.ult;
      // 造一只精英并斩杀
      G.enemies.length = 0;
      const e = new Enemy('shikui', 240, 150, 1, 'xiesha');
      e.spawnT = 0; G.enemies.push(e);
      e.hurt(99999, G);
      const got = p.ult ? p.ult.style : null;
      // 第二只精英 → 三选一
      const e2 = new Enemy('shikui', 240, 150, 1, 'youyan');
      e2.spawnT = 0; G.enemies.push(e2);
      e2.hurt(99999, G);
      for (let i = 0; i < 40; i++) G.update();      // 等 schedule(30) 触发
      const pick = G.pick ? { kind: G.pick.kind, n: G.pick.list.length } : null;
      G.pickPick(0); G.pickConfirm();
      const paths = JSON.parse(JSON.stringify(p.ult.paths));
      const lv = ultLevel(p.ult);
      // 巨剑流拿到的应是另一个专属
      G.newRun('jujian');
      const p2 = G.player;
      const e3 = new Enemy('guixiu', 240, 150, 1, 'jiying');
      e3.spawnT = 0; G.enemies.push(e3);
      e3.hurt(99999, G);
      return { before, got, pick, paths, lv, jj: p2.ult ? p2.ult.style : null,
               jjName: p2.ult ? ULT_DEF[p2.ult.style].name : null };
    });
    ok('开局没有专属技能', r.before === null, String(r.before));
    ok('首杀精英获得本流派专属（飞剑流）', r.got === 'feijian', String(r.got));
    ok('再杀精英 → 弹出三选一', r.pick && r.pick.kind === 'ult' && r.pick.n === 3, JSON.stringify(r.pick));
    ok('选定后写入升级路线', Object.keys(r.paths).length === 1, JSON.stringify(r.paths));
    ok('专属等级随路线提升', r.lv === 2, 'Lv.' + r.lv);
    ok('巨剑流拿到的是自己的专属', r.jj === 'jujian' && r.jjName === '天崩剑狱', r.jjName);
  }

  /* ---------------- T6 万剑归宗 ---------------- */
  sec('T6  万剑归宗：30 柄、三柄并列、十轮');
  {
    const r = await page.evaluate(() => {
      const G = window.Game;
      G.newRun('feijian');
      const p = G.player;
      p.giveUlt('feijian');
      p.ultCd = 0;
      input.aiming = true; input.aimAngle = 0;
      G.bullets.length = 0;
      // 飞剑存活只有 26 帧，边飞边消失 —— 用集合累计「曾经出现过」的剑才数得准
      const seen = new Set();
      const cum = [];
      G.useUlt();
      for (let i = 0; i < 60; i++) {
        G.update();
        for (const b of G.bullets) if (b.friendly) seen.add(b);
        cum.push(seen.size);          // 累计发射数，单调不减，不受飞剑消失干扰
      }
      const cd = p.ultCd;
      const deltas = [];
      let prev = 0;                            // 第 0 帧就发了第一轮，别漏掉
      for (let i = 0; i < cum.length; i++) if (cum[i] > prev) { deltas.push(cum[i] - prev); prev = cum[i]; }
      return { total: seen.size, deltas: deltas, max: Math.max(...cum), cd };
    });
    ok('总计射出 30 柄飞剑', r.total === 30, String(r.total));
    ok('每轮固定 3 柄（三柄并列）', r.deltas.length > 0 && r.deltas.every(d => d === 3), JSON.stringify(r.deltas));
    ok('共十轮', r.deltas.length === 10, r.deltas.length + ' 轮');
    ok('释放后进入 30 秒冷却', r.cd > 1700, r.cd + ' 帧 ≈ ' + (r.cd / 60).toFixed(1) + ' 秒');
  }

  /* ---------------- T7 天崩剑狱 ---------------- */
  sec('T7  天崩剑狱：预警圈后落地，圈内吃伤害、圈外不吃');
  {
    const r = await page.evaluate(() => {
      const G = window.Game;
      G.newRun('jujian');
      const p = G.player;
      p.giveUlt('jujian');
      p.ultCd = 0;
      p.x = 60; p.y = 250; p.invuln = 99999;
      input.aiming = true; input.mouseSeen = true;
      input.mx = 240; input.my = 150;
      G.enemies.length = 0;
      const inside = new Enemy('shikui', 250, 150, 1); inside.spawnT = 0;
      const outside = new Enemy('shikui', 420, 150, 1); outside.spawnT = 0;
      G.enemies.push(inside, outside);
      const hp0 = { i: inside.hp, o: outside.hp };
      G.useUlt();
      const warn = G.ultWarn ? { r: G.ultWarn.r, t: G.ultWarn.t } : null;
      const hpMid = { i: inside.hp, o: outside.hp };   // 预警期间还没落地
      for (let i = 0; i < 40; i++) G.update();
      const hp1 = { i: inside.hp, o: outside.hp };
      return { warn, hp0, hpMid, hp1, warnGone: G.ultWarn === null };
    });
    ok('落地前出现预警圈', r.warn && r.warn.r > 0, JSON.stringify(r.warn));
    ok('预警期间尚未造成伤害', r.hpMid.i === r.hp0.i, r.hp0.i + ' → ' + r.hpMid.i);
    ok('圈内妖物受伤', r.hp1.i < r.hp0.i, r.hp0.i + ' → ' + r.hp1.i);
    ok('圈外妖物安然无恙', r.hp1.o === r.hp0.o, r.hp0.o + ' → ' + r.hp1.o);
    ok('落地后预警圈清除', r.warnGone);
  }

  /* ---------------- T8 升级路线生效 ---------------- */
  sec('T8  升级路线确实改变数值与效果');
  {
    const r = await page.evaluate(() => {
      const G = window.Game;
      const out = {};
      // 剑意不绝 → 冷却缩短
      G.newRun('feijian');
      const p = G.player;
      p.giveUlt('feijian');
      const cd0 = ultCdOf(p.ult, 'feijian');
      p.learnPath('haste'); p.learnPath('haste'); p.learnPath('haste');
      const cd3 = ultCdOf(p.ult, 'feijian');
      out.haste = { cd0, cd3 };

      // 万剑盈空 → 剑数增加
      G.newRun('feijian');
      const p2 = G.player;
      p2.giveUlt('feijian');
      p2.learnPath('more'); p2.learnPath('more'); p2.learnPath('more');
      p2.ultCd = 0;
      input.aiming = true; input.aimAngle = 0;
      G.bullets.length = 0;
      const seen = new Set();
      G.useUlt();
      for (let i = 0; i < 90; i++) { G.update(); for (const b of G.bullets) if (b.friendly) seen.add(b); }
      out.more = seen.size;

      // 山崩地裂 → 范围扩大
      G.newRun('jujian');
      const p3 = G.player;
      p3.giveUlt('jujian');
      const r0 = ULT_DEF.jujian.base.radius;
      p3.learnPath('radius'); p3.learnPath('radius'); p3.learnPath('radius');
      const r3 = ULT_DEF.jujian.base.radius + ultPathVal(p3.ult, 'jujian', 'radius');
      out.radius = { r0, r3 };

      // 碎魔罡风 → 清弹幕
      G.newRun('jujian');
      const p4 = G.player;
      p4.giveUlt('jujian');
      p4.learnPath('shatter');
      p4.ultCd = 0;
      p4.x = 60; p4.y = 250; p4.invuln = 99999;
      input.aiming = true; input.mouseSeen = true; input.mx = 240; input.my = 150;
      for (let i = 0; i < 6; i++) G.spawnEnemyBullet(240, 120, 0, 2, 'blood');
      const b0 = G.bullets.filter(b => !b.friendly).length;
      G.useUlt();
      for (let i = 0; i < 40; i++) G.update();
      out.shatter = { b0, b1: G.bullets.filter(b => !b.friendly && !b.dead).length };

      // 御风而行 → 移速提升
      G.newRun('feijian');
      const p5 = G.player;
      p5.giveUlt('feijian');
      p5.learnPath('swift');
      const spd0 = p5.stats.speed;
      p5.ultCd = 0;
      input.aiming = true; input.aimAngle = 0;
      G.useUlt();
      for (let i = 0; i < 3; i++) G.update();
      out.swift = { spd0, mul: p5.buffs.spdMul, t: p5.buffs.spdT };
      return out;
    });
    ok('剑意不绝满级 → 冷却 30 秒降到 18 秒',
      r.haste.cd0 === 1800 && r.haste.cd3 === 1080, r.haste.cd0 + ' → ' + r.haste.cd3);
    ok('万剑盈空满级 → 30 柄变 48 柄', r.more === 48, String(r.more));
    ok('山崩地裂满级 → 范围 90 变 180', r.radius.r0 === 90 && r.radius.r3 === 180,
      r.radius.r0 + ' → ' + r.radius.r3);
    ok('碎魔罡风 → 落地清空敌方弹幕', r.shatter.b0 > 0 && r.shatter.b1 === 0, JSON.stringify(r.shatter));
    ok('御风而行 → 移速临时提升', r.swift.mul > 0 && r.swift.t > 0,
      '×' + (1 + r.swift.mul).toFixed(2) + ' / ' + r.swift.t + ' 帧');
  }

  /* ---------------- T9 选择界面冻结 ---------------- */
  sec('T9  选择界面期间世界冻结');
  {
    const r = await page.evaluate(() => {
      const G = window.Game;
      G.newRun('feijian');
      const p = G.player;
      p.addSkill('tianlei'); p.addSkill('suodi'); p.addSkill('wuxing');
      G.enemies.length = 0;
      const e = new Enemy('xiesui', 200, 150, 1); e.spawnT = 0; G.enemies.push(e);
      const x0 = e.x, t0 = G.tick;
      G.openSkillReplace('huti');
      for (let i = 0; i < 30; i++) G.update();
      const frozen = { moved: e.x !== x0, ticked: G.tick !== t0, hasPick: !!G.pick };
      G.pickConfirm();
      for (let i = 0; i < 10; i++) G.update();
      return { frozen, resumed: G.tick > t0, hasPickAfter: !!G.pick };
    });
    ok('界面打开时敌人不动', !r.frozen.moved);
    ok('界面打开时主循环不推进', !r.frozen.ticked);
    ok('界面打开时 pick 存在', r.frozen.hasPick);
    ok('确认后世界恢复推进', r.resumed && !r.hasPickAfter);
  }

  /* ---------------- T10 绘制与长跑不报错 ---------------- */
  sec('T10  三大流派各跑 300 帧并绘制');
  {
    const r = await page.evaluate(() => {
      const G = window.Game;
      const out = {};
      const PATHS = {
        feijian: ['homing', 'element', 'swift'],
        jujian: ['might', 'radius', 'aftershock'],
        wujian: ['power', 'reach', 'chain']
      };
      for (const st of ['feijian', 'jujian', 'wujian']) {
        G.newRun(st);
        const p = G.player;
        p.giveUlt(st);
        for (const pid of PATHS[st]) p.learnPath(pid);
        p.addSkill('tianlei'); p.addSkill('huti');
        input.aiming = true; input.aimAngle = 0;
        input.mouseSeen = true; input.mx = 340; input.my = 160;
        for (let i = 0; i < 300; i++) {
          p.invuln = 9999;
          if (i % 60 === 0) { p.ultCd = 0; G.useUlt(); }
          if (st === 'wujian' && i % 60 === 14) G.ultUp();   // 舞剑流要松手才突进
          if (i % 37 === 0) { p.skillGcd = 0; p.mp = 100; G.useSkill(); }
          G.update(); G.draw();
        }
        out[st] = { tick: G.tick, mp: Math.round(p.mp), ultLv: ultLevel(p.ult) };
      }
      return out;
    });
    ok('飞剑流长跑无异常', r.feijian.tick >= 300, JSON.stringify(r.feijian));
    ok('巨剑流长跑无异常', r.jujian.tick >= 300, JSON.stringify(r.jujian));
    ok('舞剑流长跑无异常（含蓄势突进与连段）', r.wujian.tick >= 300, JSON.stringify(r.wujian));
  }

  /* ---------------- T11 小技能独立冷却 ---------------- */
  sec('T11  小技能独立冷却：不能连放，切槽也绕不过去');
  {
    const r = await page.evaluate(() => {
      const G = window.Game; G.newRun('feijian');
      const p = G.player;
      p.invuln = 9999;
      p.addSkill('tianlei'); p.selectSlot(0);
      const base = skillCd('tianlei', 1);
      p.mp = p.maxMP; p.skillGcd = 0; p.skillCd[0] = 0;
      G.useSkill();
      const afterFirst = p.skillCd[0];
      // 冷却里再按：既不生效也不扣灵力
      p.skillGcd = 0; p.mp = p.maxMP;
      G.useSkill();
      const blocked = p.skillCd[0] > 0 && p.mp === p.maxMP;
      // 别的槽位不受牵连
      p.addSkill('suodi');
      const otherFree = p.skillCd[1] === 0;
      p.selectSlot(1);
      p.skillGcd = 0; p.mp = p.maxMP;
      G.useSkill();                     // 缩地成寸应当放得出来
      const otherCast = p.skillCd[1] > 0;
      p.selectSlot(0);
      const cdKept = p.skillCd[0] > 0;  // 切走再切回，天雷引的冷却没被清掉
      // 各自冷却不一样长
      const cds = ['tianlei', 'suodi', 'wuxing', 'huti'].map(id => skillCd(id, 1));
      // 走完冷却就能再放
      for (let i = 0; i < base + 2; i++) { p.invuln = 9999; G.update(); }
      const cdZero = p.skillCd[0] === 0;
      p.skillGcd = 0; p.mp = p.maxMP;
      G.useSkill();
      const castAgain = p.skillCd[0] > 0;
      // 升级应当缩短冷却（护体金光除外，它是固定 10 秒）
      const t1 = skillCd('tianlei', 1), t5 = skillCd('tianlei', 5);
      return { base, afterFirst, blocked, otherFree, otherCast, cdKept, cdZero, castAgain, cds, t1, t5 };
    });
    ok('释放后该槽位进入冷却', r.afterFirst === r.base, 'cd=' + r.afterFirst + '（' + (r.base / 60) + ' 秒）');
    ok('冷却中再按不生效也不扣灵力', r.blocked === true);
    ok('其它槽位不受牵连', r.otherFree === true && r.otherCast === true);
    ok('切走再切回冷却仍在', r.cdKept === true);
    ok('冷却走完归零且可再放', r.cdZero === true && r.castAgain === true);
    ok('四个技能冷却各不相同', new Set(r.cds).size === 4, JSON.stringify(r.cds.map(c => +(c / 60).toFixed(1))));
    ok('升级缩短冷却', r.t5 < r.t1, r.t1 + ' → ' + r.t5);
  }

  /* ---------------- T12 护体金光 ---------------- */
  sec('T12  护体金光：2 层限时护盾 / 5 秒后消散 / 冷却 10 秒 / 常驻护盾不受影响');
  {
    const r = await page.evaluate(() => {
      const G = window.Game; G.newRun('feijian');
      const p = G.player;
      p.addSkill('huti'); p.selectSlot(0);
      p.shield = 0; p.tShield = 0; p.shieldT = 0;
      p.mp = p.maxMP; p.skillGcd = 0; p.skillCd[0] = 0;
      G.useSkill();
      const tShield = p.tShield, shieldT = p.shieldT, cd = p.skillCd[0];
      // 全程每帧推进：周期性尝试重开，记录限时护盾散去与首次重开成功发生在第几帧
      let gone = -1, firstRecast = -1;
      for (let i = 0; i < 900; i++) {
        p.invuln = 9999;
        if (i > 0 && i % 15 === 0) {
          p.skillGcd = 0; p.mp = p.maxMP;
          const before = p.skillCd[0];
          G.useSkill();
          if (p.skillCd[0] > before && firstRecast < 0) firstRecast = i + 1;  // 冷却被重置 = 放出去了
        }
        G.update();
        if (p.tShield === 0 && gone < 0) gone = i + 1;
      }
      // 常驻护盾不该被限时护盾到点带走
      p.shield = 0; p.tShield = 0; p.shieldT = 0;
      p.addShield(3);                     // 常驻（不传 dur）
      p.addShield(2, 60);                 // 限时
      const keepShield = p.shield, keepTotal = p.shieldTotal;
      for (let i = 0; i < 80; i++) { p.invuln = 9999; G.update(); }
      const afterExpire = { shield: p.shield, tShield: p.tShield, total: p.shieldTotal };
      // 受击时先扣限时护盾，再扣常驻护盾
      p.shield = 1; p.tShield = 1; p.shieldT = 600; p.invuln = 0;
      p.takeDamage(1, G);
      const order = [p.tShield, p.shield];
      const dur = SKILL_DEF.huti.dur;
      return { tShield, shieldT, cd, gone, firstRecast, dur,
               keepShield, keepTotal, afterExpire, order,
               cds: SKILL_DEF.huti.cd, vals: SKILL_DEF.huti.vals };
    });
    ok('一层结 2 层限时护盾', r.tShield === 2, '实际 ' + r.tShield + ' 层');
    ok('限时护盾 5 秒', r.shieldT === r.dur && r.dur === 300, 'shieldT=' + r.shieldT);
    ok('限时护盾到点自动散去', r.gone >= 295 && r.gone <= 312, '第 ' + r.gone + ' 帧散去（约 ' + (r.gone / 60).toFixed(1) + ' 秒）');
    ok('常驻护盾不受时限影响', r.keepTotal === 5 && r.afterExpire.shield === r.keepShield
      && r.afterExpire.tShield === 0, '常驻 ' + r.afterExpire.shield + ' 层仍在');
    ok('受击先扣限时护盾', r.order[0] === 0 && r.order[1] === 1, '限时/常驻 = ' + JSON.stringify(r.order));
    ok('技能冷却 10 秒', r.cd === 600, '实际 ' + (r.cd / 60) + ' 秒');
    ok('10 秒内放不出第二发', r.firstRecast >= 600 && r.firstRecast <= 640,
       '第 ' + r.firstRecast + ' 帧（' + (r.firstRecast / 60).toFixed(1) + ' 秒）才重开成功');
    ok('冷却结束后确实能再开', r.firstRecast > 0);
    ok('护盾层数不再随等级膨胀', r.vals[0] === 2 && r.vals[4] <= 4, JSON.stringify(r.vals));
  }

  /* ---------------- T13 天崩剑狱落剑 ---------------- */
  sec('T13  天崩剑狱：预警倒计时推进，落地后巨剑插地');
  {
    const r = await page.evaluate(() => {
      const G = window.Game; G.newRun('jujian');
      const p = G.player;
      p.invuln = 9999;
      p.giveUlt('jujian'); p.ultCd = 0;
      input.aiming = true; input.mouseSeen = true; input.mx = 240; input.my = 150;
      G.useUlt();
      const w0 = G.ultWarn ? G.ultWarn.t : -1;
      const seq = [];
      let swordAt = -1, swordY = -1;
      for (let i = 0; i < 40; i++) {
        p.invuln = 9999;
        G.update();
        if (G.ultWarn) seq.push(G.ultWarn.t);
        if (G.ultSword && swordAt < 0) { swordAt = i + 1; swordY = G.ultSword.y; }
      }
      // 插地一小会儿后自行消散
      let swordGone = -1;
      for (let i = 0; i < 100; i++) {
        p.invuln = 9999;
        G.update();
        if (!G.ultSword && swordGone < 0) swordGone = i + 1;
      }
      let mono = true;
      for (let i = 1; i < seq.length; i++) if (seq[i] >= seq[i - 1]) mono = false;
      return { w0, seq, mono, swordAt, swordY, swordGone };
    });
    ok('预警圈有倒计时', r.w0 === 30, 't=' + r.w0);
    ok('倒计时逐帧递减（以往恒为 30，动画是静止的）', r.mono === true && r.seq.length > 0, JSON.stringify(r.seq));
    ok('落地后巨剑插在原地', r.swordAt === 30 && Math.abs(r.swordY - 150) < 2, '第 ' + r.swordAt + ' 帧插地 y=' + r.swordY);
    ok('插地的巨剑会自行消散', r.swordGone >= 40 && r.swordGone <= 70, '第 ' + r.swordGone + ' 帧后消散');
  }

  /* ---------------- T14 专属技能朝鼠标方向 ---------------- */
  sec('T14  专属技能朝指针：飞剑流 / 巨剑流（舞剑流见 T17）');
  {
    const r = await page.evaluate(() => {
      const out = {};
      // 飞剑流：人物朝右（dir/face 固定），鼠标指向左上，飞剑应朝左上
      const G = window.Game; G.newRun('feijian');
      const p = G.player; p.giveUlt('feijian'); p.ultCd = 0; p.invuln = 99999;
      p.dir = 'side'; p.face = 1;
      p.x = 240; p.y = 160;
      input.aiming = false; input.mouseSeen = true; input.lastAim = null;
      input.mx = 60; input.my = 60;                   // 左上
      G.enemies.length = 0; G.bullets.length = 0; G.update();
      G.useUlt();
      const seen = new Set(), angs = [];
      for (let i = 0; i < 34; i++) {
        p.invuln = 99999; G.update();
        for (const b of G.bullets) if (!seen.has(b)) { seen.add(b); angs.push(Math.atan2(b.vy, b.vx)); }
      }
      const want = Math.atan2(60 - 160, 60 - 240);
      out.fj = { n: angs.length, uniq: new Set(angs.map(a => a.toFixed(3))).size,
                 dev: Math.max(...angs.map(a => Math.abs(a - want))) };

      // 巨剑流：鼠标指右下，落点应落在右下而不是人物正前方
      const G2 = window.Game; G2.newRun('jujian');
      const q = G2.player; q.giveUlt('jujian'); q.ultCd = 0; q.invuln = 99999;
      q.dir = 'side'; q.face = -1; q.x = 240; q.y = 160;
      input.mouseSeen = true; input.mx = 380; input.my = 220;
      G2.enemies.length = 0; G2.update();
      G2.useUlt();
      out.jj = G2.ultWarn ? { x: Math.round(G2.ultWarn.x), y: Math.round(G2.ultWarn.y) } : null;
      return out;
    });
    ok('飞剑流朝指针方向射出', r.fj.n === 30 && r.fj.dev < 0.02,
      '共 ' + r.fj.n + ' 柄，最大偏差 ' + r.fj.dev.toFixed(3) + ' rad');
    ok('飞剑并列不发散（角度全同）', r.fj.uniq === 1, r.fj.uniq + ' 种角度');
    ok('巨剑流落在指针处', !!r.jj && Math.abs(r.jj.x - 380) < 2 && Math.abs(r.jj.y - 220) < 2,
      JSON.stringify(r.jj));
  }

  /* ---------------- T15 法宝堆叠 ---------------- */
  sec('T15  同种法宝堆叠：HUD 只占一格并标 Lv，说明里数值加总');
  {
    const r = await page.evaluate(() => {
      const G = window.Game; G.newRun('feijian');
      const p = G.player;
      G.draw();
      const slots0 = (G.itemHits || []).length;
      p.give('qingfeng', G); p.give('qingfeng', G); p.give('qingfeng', G);
      p.give('fengxing', G);
      G.draw();
      const uniq = G.itemHits.filter(h => h.id === 'qingfeng');
      // 说明面板
      const hit = uniq[0];
      const def = ITEM_MAP[hit.id];
      const html = itemTipHTML(def, G.style, null, hit.rank);
      return {
        slots0, total: p.items.length, cells: (G.itemHits || []).length,
        qf: uniq.length, rank: hit.rank,
        name: itemView(def, G.style, hit.rank).name,
        hasSum: /合计/.test(html), sumLine: (html.match(/合计：[^<]*/) || [''])[0],
        tally3: ITEM_TALLY.qingfeng(3)
      };
    });
    ok('背包按种类合并成格', r.cells === 2, r.total + ' 件占 ' + r.cells + ' 格');
    ok('同种只占一格', r.qf === 1, r.qf + ' 格');
    ok('名称带等级后缀', r.name === '青锋剑 Lv3', r.name);
    ok('说明里给出加总数值', r.hasSum && r.sumLine.indexOf('+3') >= 0, r.sumLine);
  }

  /* ---------------- T16 产出平衡 ---------------- */
  sec('T16  平衡：心血按血量掉率、产出逐层衰减、Boss 转阶段外溢灵力');
  {
    const r = await page.evaluate(() => {
      const G = window.Game; G.newRun('feijian');
      const p = G.player;
      p.hp = 6; const full = G.heartRate();      // 满血
      p.hp = 4; const two = G.heartRate();       // 剩两格
      p.hp = 2; const one = G.heartRate();       // 只剩一格
      p.hp = 6;

      // 心血抽样：满血 vs 濒死，各刷 600 只妖看掉几颗心
      function sample(hpSet) {
        let hearts = 0;
        for (let i = 0; i < 600; i++) {
          G.pickups.length = 0;
          p.hp = hpSet;
          const e = new Enemy('xiesui', 200, 150, 1); e.spawnT = 0; e.maxHp = 10; e.hp = 10;
          e.die(G);
          hearts += G.pickups.filter(k => k.kind === 'heart').length;
        }
        return hearts;
      }
      const nFull = sample(6), nLow = sample(2);
      p.hp = 6;

      // 产出逐层衰减：不拾取任何加气运的法宝（luck = 0）时，期望必须严格递减
      p.stats.luck = 0;
      const scale = [], rateFull = [], rateLow = [];
      for (let d = 1; d <= 6; d++) {
        G.depth = d;
        scale.push(lootScale(d));
        p.hp = 6; rateFull.push(G.heartRate());
        p.hp = 2; rateLow.push(G.heartRate());
      }
      // 灵力珠抽样：同一只 40 血的妖，一层 vs 五层，各刷 600 只看总产出
      function mpSample(depth) {
        G.depth = depth;
        let total = 0, drops = 0;
        for (let i = 0; i < 600; i++) {
          G.pickups.length = 0;
          const e = new Enemy('xiesui', 200, 150, 1); e.spawnT = 0; e.maxHp = 40; e.hp = 40;
          e.die(G);
          const orbs = G.pickups.filter(k => k.kind === 'mp');
          if (orbs.length) { drops++; total += orbs[0].value; }
        }
        return { drops: drops, total: total };
      }
      const mp1 = mpSample(1), mp5 = mpSample(5);
      G.depth = 1; p.hp = 6;

      // Boss 转阶段外溢
      G.pickups.length = 0;
      const b = new Boss('xuemo', 240, 120, 1);
      b.maxHp = 100; b.hp = 100; b.phase = 1;
      b.hurt(40, G);                              // 掉到 60% → 转二阶段
      const phase = b.phase;
      const bossMana = G.pickups.filter(k => k.kind === 'mp');
      return { full, two, one, nFull, nLow, phase,
               bossMana: bossMana.length, bossAmt: bossMana.map(k => k.value),
               scale, rateFull, rateLow, mp1, mp5 };
    });
    ok('满血时心血掉率很低', r.full <= 0.03, (r.full * 100).toFixed(1) + '%');
    ok('只剩一格血时明显放水', r.one >= 0.2 && r.one > r.full * 8,
      (r.one * 100).toFixed(1) + '% vs 满血 ' + (r.full * 100).toFixed(1) + '%');
    ok('实测：600 只妖，濒死掉的心远多于满血',
      r.nLow > r.nFull * 5, '满血 ' + r.nFull + ' 颗 / 濒死 ' + r.nLow + ' 颗');
    const fmt = a => JSON.stringify(a.map(v => +v.toFixed(3)));
    ok('产出衰减逐层递减（一层为基准 1.0）',
      r.scale[0] === 1 && r.scale.every((v, i) => i === 0 || v < r.scale[i - 1]), fmt(r.scale));
    ok('无气运时心血掉率（满血）逐层递减',
      r.rateFull.every((v, i) => i === 0 || v < r.rateFull[i - 1]), fmt(r.rateFull));
    ok('无气运时心血掉率（濒死）逐层递减',
      r.rateLow.every((v, i) => i === 0 || v < r.rateLow[i - 1]), fmt(r.rateLow));
    ok('五层心血掉率约为一层的一半以下',
      r.rateFull[4] <= r.rateFull[0] * 0.5, (r.rateFull[4] * 100).toFixed(2) + '% vs ' + (r.rateFull[0] * 100).toFixed(2) + '%');
    ok('灵力珠总产出随层数明显下降',
      r.mp5.total < r.mp1.total * 0.45 && r.mp5.drops < r.mp1.drops,
      '一层 ' + r.mp1.total + ' 点/' + r.mp1.drops + ' 颗 → 五层 ' + r.mp5.total + ' 点/' + r.mp5.drops + ' 颗');
    ok('Boss 转阶段会掉出灵力', r.phase === 2 && r.bossMana === 3,
      'phase=' + r.phase + ' 灵力珠 ' + r.bossMana + ' 颗 ' + JSON.stringify(r.bossAmt));
  }

  /* ---------------- T17 剑影三叠 ---------------- */
  sec('T17  剑影三叠：蓄势突进 / 实际三段连招 / 突进无敌 / 蓄势被打断立刻进 CD');
  {
    const r = await page.evaluate(() => {
      const G = window.Game, inp = G.input, out = {};
      /* 固定靶：不走动、不还手，免得它自己撞上来打断蓄势（那属于 T17 后半段专门测的） */
      const dummy = (p, dx) => {
        const e = new Enemy('xiesui', p.x + dx, p.y, 1);
        e.spawnT = 0; e.maxHp = 99999; e.hp = 99999;
        e.speed = 0; e.cd = 99999; e.touch = 0;
        G.enemies.push(e);
        return e;
      };
      const field = (p, dx) => { p.x = 240; p.y = 160; G.enemies.length = 0; return dummy(p, dx); };

      // ---- 一段：蓄满 → 突进 ----
      G.newRun('wujian');
      const p = G.player; p.giveUlt('wujian'); p.ultCd = 0;
      const t = field(p, 46);
      const x0 = p.x;
      inp.mouseSeen = true; inp.mx = t.x; inp.my = t.y;
      G.useUlt();
      out.charging = p.wjCharging;
      let invulnOk = true;
      for (let i = 0; i < 30; i++) { G.update(); if (p.dashing && p.invuln <= 0) invulnOk = false; }
      out.chargeFull = p.wjChargeT;
      const hp0 = t.hp;
      G.ultUp();
      out.dashing = p.dashing;
      for (let i = 0; i < 16; i++) { G.update(); if (p.dashing && p.invuln <= 0) invulnOk = false; }
      for (let i = 0; i < 20; i++) G.update();
      out.invulnOk = invulnOk;
      out.dashMoved = Math.round(p.x - x0);
      out.stage1Dmg = +(hp0 - t.hp).toFixed(2);
      out.afterStage1 = p.wjStage;
      out.cdAfterHit = p.ultCd;

      // ---- 二段：应在一段基础上 +20% ----
      const t2 = field(p, 46);
      inp.mx = t2.x; inp.my = t2.y;
      G.useUlt();
      for (let i = 0; i < 30; i++) G.update();
      G.ultUp();
      const hpB = t2.hp;
      for (let i = 0; i < 36; i++) G.update();
      out.stage2Dmg = +(hpB - t2.hp).toFixed(2);
      out.afterStage2 = p.wjStage;

      // ---- 三段：五连斩且必定暴击 ----
      const t3 = field(p, 46);
      inp.mx = t3.x; inp.my = t3.y;
      out.flurryHits = 0;
      G.useUlt();
      for (let i = 0; i < 30; i++) G.update();
      G.ultUp();
      const hpC = t3.hp;
      let prev = hpC;
      for (let i = 0; i < 60; i++) {
        t3.x = p.x - 8; t3.y = p.y;        // 钉在身前：击退推不走，才数得清到底打了几段
        G.update();
        if (t3.hp < prev) { out.flurryHits++; prev = t3.hp; }
      }
      out.stage3Dmg = +(hpC - t3.hp).toFixed(2);
      out.afterStage3 = p.wjStage;

      // ---- 落空：不加段位，冷却照走 ----
      G.newRun('wujian');
      const q = G.player; q.giveUlt('wujian'); q.ultCd = 0;
      G.enemies.length = 0;                        // 场上无妖，必定落空
      inp.mouseSeen = true; inp.mx = 460; inp.my = 160;
      G.useUlt();
      for (let i = 0; i < 30; i++) G.update();
      G.ultUp();
      for (let i = 0; i < 40; i++) G.update();
      out.missCd = Math.round(q.ultCd);
      out.missStage = q.wjStage;

      // ---- 命中却不接招：连段窗口过期 → 段位归零、冷却回满 ----
      G.newRun('wujian');
      const c = G.player; c.giveUlt('wujian'); c.ultCd = 0;
      const tc = field(c, 46);
      inp.mx = tc.x; inp.my = tc.y;
      G.useUlt();
      for (let i = 0; i < 30; i++) G.update();
      G.ultUp();
      for (let i = 0; i < 40; i++) G.update();      // 蓄满突进要跑满 24 帧才结算
      const litStage = c.wjStage, litCd = c.ultCd;
      G.enemies.length = 0;
      for (let i = 0; i < WJ.chain + 4; i++) G.update();
      out.litStage = litStage;
      out.litCd = litCd;
      out.expiredStage = c.wjStage;
      out.expiredCd = Math.round(c.ultCd);

      // ---- 蓄势中挨打：剑势溃散，技能立刻进冷却 ----
      G.newRun('wujian');
      const k = G.player; k.giveUlt('wujian'); k.ultCd = 0; k.invuln = 0;
      G.enemies.length = 0;
      G.useUlt();
      const wasCharging = k.wjCharging;
      k.takeDamage(1, G);
      out.interrupted = wasCharging && !k.wjCharging;
      out.cdAfterInterrupt = Math.round(k.ultCd);

      // ---- 蓄势越久，突进越远：同一起点、只改松手时机 ----
      const dashAt = (frames) => {
        G.newRun('wujian');
        const a = G.player; a.giveUlt('wujian'); a.ultCd = 0; a.invuln = 9999;
        G.enemies.length = 0;
        a.x = 200; a.y = 160;
        inp.mouseSeen = true; inp.mx = 460; inp.my = 160;          // 一律朝正右，避开墙体
        G.useUlt();
        const lim = Math.min(frames, WJ.charge);                   // 蓄满即止，别空转
        for (let i = 0; i < 120 && a.wjCharging && a.wjChargeT < lim; i++) G.update();
        const sx = a.x, charge = Math.round(a.wjChargeT * 10) / 10;
        G.ultUp();
        const cast = a.dashing, dur = a.dashT;
        for (let i = 0; i < dur + 3; i++) G.update();
        return { moved: Math.round(a.x - sx), dur: dur, charge: charge, cast: cast };
      };
      out.dashShort = dashAt(3);          // 刚够下限就松手
      out.dashMid = dashAt(12);           // 半蓄
      out.dashFull = dashAt(30);          // 蓄满（会被 clamp 到 24）
      out.wjDash = WJ.dash; out.wjDashMin = WJ.dashMin;
      out.wjDur = WJ.dur; out.wjDurMin = WJ.durMin;

      // ---- 突进撞墙：被墙截断就当场收势，不贴着墙滑完整个无敌时长 ----
      G.newRun('wujian');
      const w = G.player; w.giveUlt('wujian'); w.ultCd = 0; w.invuln = 9999;
      const tW = new Enemy('xiesui', 240, 60, 1);   // 留一只不动的妖：房间不清空，门就不会开
      tW.spawnT = 0; tW.maxHp = 99999; tW.hp = 99999; tW.speed = 0; tW.cd = 99999; tW.touch = 0;
      G.enemies.length = 0; G.enemies.push(tW);
      w.x = 300; w.y = 60;                          // 距右墙只有 139 px，185 px 的突进必然撞上
      inp.mouseSeen = true; inp.mx = 480; inp.my = 60;
      G.useUlt();
      for (let i = 0; i < 30; i++) G.update();
      G.ultUp();
      out.wallFullT = w.dashT;
      out.wallFrames = 0;
      for (let i = 0; i < 40; i++) { G.update(); if (w.dashing) out.wallFrames++; }
      out.wallX = Math.round(w.x);

      // ---- 极短点击（低于 chargeMin）：算误触，收势且不消耗冷却 ----
      G.newRun('wujian');
      const s = G.player; s.giveUlt('wujian'); s.ultCd = 0; s.invuln = 9999;
      G.enemies.length = 0;
      G.useUlt();
      s.wjChargeT = WJ.chargeMin - 1;              // 差一点点才够
      G.ultUp();
      out.tapCd = s.ultCd;
      out.tapCharging = s.wjCharging;
      out.tapDashing = s.dashing;
      out.chargeMin = WJ.chargeMin;

      // ---- 开局自带：舞剑流直接给专属技，其它流派仍是首杀精英才得 ----
      G.newRun('wujian');
      out.bootUlt = !!G.player.ult;
      out.bootName = G.player.ult ? ULT_DEF.wujian.name : '';
      out.bootCd0 = G.player.ultCd;               // 开局不转冷却，马上能用
      const bu = G.player;
      bu.invuln = 9999; G.enemies.length = 0;
      inp.mouseSeen = true; inp.mx = 240; inp.my = 60;
      G.useUlt();
      bu.wjChargeT = WJ.charge;                   // 直接按蓄满处理，不跑帧
      G.ultUp();
      out.bootCastCd = Math.round(bu.ultCd);      // 释放那一刻就计的冷却
      out.wjCdBase = ultCdOf(bu.ult, 'wujian');
      out.feijianCdBase = ULT_CD_BASE;
      G.newRun('feijian');
      out.feijianBootUlt = !!G.player.ult;
      G.newRun('jujian');
      out.jujianBootUlt = !!G.player.ult;
      return out;
    });
    ok('按下空格先起势而非直接突进', r.charging === true);
    ok('蓄满 24 帧', r.chargeFull >= 24, r.chargeFull + ' 帧');
    ok('松手后确实突进', r.dashing === true);
    ok('突进全程无敌', r.invulnOk === true);
    ok('突进确实拉开距离', r.dashMoved > 50, r.dashMoved + ' px');
    ok('一段命中造成伤害', r.stage1Dmg > 0, r.stage1Dmg + ' 点');
    ok('一段命中后点亮第二段', r.afterStage1 === 1, 'stage=' + r.afterStage1);
    ok('一段命中后退还冷却（可立即接段）', r.cdAfterHit === 0, 'cd=' + r.cdAfterHit);
    ok('二段伤害比一段高约 20%',
       Math.abs(r.stage2Dmg / r.stage1Dmg - 1.2) < 0.02,
       `${r.stage1Dmg} → ${r.stage2Dmg}（×${(r.stage2Dmg / r.stage1Dmg).toFixed(3)}）`);
    ok('二段命中后点亮第三段', r.afterStage2 === 2, 'stage=' + r.afterStage2);
    ok('三段化作五连斩（正好五段伤害）', r.flurryHits === 5, r.flurryHits + ' 段');
    ok('三段在二段基础上必定暴击（单段 ×2、总计约 ×10）',
       Math.abs(r.stage3Dmg / r.stage2Dmg - 10) < 0.6,
       `二段单段 ${r.stage2Dmg} → 五连斩合计 ${r.stage3Dmg}（×${(r.stage3Dmg / r.stage2Dmg).toFixed(2)}）`);
    ok('打完三段后段位归零', r.afterStage3 === 0, 'stage=' + r.afterStage3);
    ok('落空不加段位', r.missStage === 0, 'stage=' + r.missStage);
    ok('落空照走完整冷却', r.missCd > 850, r.missCd + ' 帧 ≈ ' + (r.missCd / 60).toFixed(1) + ' 秒');
    ok('命中后确实点亮了连段窗口', r.litStage === 1 && r.litCd === 0, `${r.litStage} / cd=${r.litCd}`);
    ok('窗口内不接招 → 连招中断、冷却回满',
       r.expiredStage === 0 && r.expiredCd > 850,
       `stage=${r.expiredStage} cd=${r.expiredCd}`);
    ok('蓄势中挨打 → 剑势溃散', r.interrupted === true);
    ok('被打断后技能立刻进冷却', r.cdAfterInterrupt === 900, r.cdAfterInterrupt + ' 帧 = 15 秒');
    ok('极短点击（< chargeMin）算误触：收势、不动、不收冷却',
       r.tapCd === 0 && r.tapCharging === false && r.tapDashing === false,
       `cd=${r.tapCd} charging=${r.tapCharging} dashing=${r.tapDashing}（chargeMin=${r.chargeMin}）`);
    ok('短蓄势也放得出（不再要求蓄满）', r.dashShort.cast === true, JSON.stringify(r.dashShort));
    ok('短蓄势的突进距离明显更短',
       r.dashShort.moved <= r.dashFull.moved * 0.6,
       `${r.dashShort.moved} px vs 满蓄 ${r.dashFull.moved} px`);
    ok('蓄势越久突进越远（短 < 半 < 满）',
       r.dashShort.moved < r.dashMid.moved && r.dashMid.moved < r.dashFull.moved,
       `${r.dashShort.moved} < ${r.dashMid.moved} < ${r.dashFull.moved} px`);
    ok('最短档与满蓄档的差距够大（≥25px）',
       r.dashFull.moved - r.dashShort.moved >= 25,
       `差 ${r.dashFull.moved - r.dashShort.moved} px`);
    ok('满蓄的突进距离 = WJ.dash', Math.abs(r.dashFull.moved - r.wjDash) <= 3,
       `${r.dashFull.moved} px（定义 ${r.wjDash}）`);
    ok('短蓄档恰好是 WJ.dashMin', Math.abs(r.dashShort.moved - r.wjDashMin) <= 3,
       `${r.dashShort.moved} px（定义 ${r.wjDashMin}）`);
    ok('突进帧数随蓄势同比缩短（无敌帧也短）',
       r.dashShort.dur < r.dashFull.dur && r.dashFull.dur === r.wjDur,
       `${r.dashShort.dur} 帧 → ${r.dashFull.dur} 帧（定义 ${r.wjDur} / 最短 ${r.wjDurMin}）`);
    ok('突进撞墙会提前收势（不贴墙滑完无敌时长）',
       r.wallFrames < r.wallFullT && r.wallX >= 435,
       `撞墙只突进 ${r.wallFrames} 帧（满蓄本应 ${r.wallFullT} 帧），停在 x=${r.wallX}`);
    ok('舞剑流开局即自带专属技', r.bootUlt === true && r.bootName === '剑影三叠',
       `${r.bootName}（开局冷却 ${r.bootCd0}）`);
    ok('开局即可施展，专属冷却压到 15 秒（900 帧）',
       r.bootCastCd === 900 && r.wjCdBase === 900,
       `释放时 cd=${r.bootCastCd} 帧，基准=${r.wjCdBase} 帧`);
    ok('其它流派开局仍无专属技（首杀精英才得）',
       r.feijianBootUlt === false && r.jujianBootUlt === false,
       `feijian=${r.feijianBootUlt} jujian=${r.jujianBootUlt}（飞剑基准 ${r.feijianCdBase} 帧）`);
  }

  /* ---------------- T18 舞剑流向的两门功法 ---------------- */
  sec('T18  擒龙手 / 裂空斩：一件把场面拉近，一件把剑送远');
  {
    const r = await page.evaluate(() => {
      const G = window.Game, inp = G.input, out = {};
      const mk = (x, y, hp) => {
        const e = new Enemy('xiesui', x, y, 1);
        e.spawnT = 0; e.maxHp = hp; e.hp = hp;
        e.speed = 0; e.cd = 99999; e.touch = 0;
        G.enemies.push(e);
        return e;
      };

      // ---- 擒龙手：摄拿小妖、摄不动尊者、顺便拍开身前术法 ----
      G.newRun('wujian');
      const p = G.player; p.x = 240; p.y = 160;
      G.enemies.length = 0; G.bullets.length = 0;
      const near = mk(p.x + 100, p.y, 99999);
      const far = mk(p.x + 400, p.y, 99999);          // 超出 120 的摄拿半径
      const boss = new Boss('xuemo', p.x, p.y + 100, 1);
      boss.maxHp = 99999; boss.hp = 99999; boss.speed = 0; boss.cd = 99999;
      G.enemies.push(boss);
      G.bullets.push(new Bullet(p.x + 50, p.y, 0, 0, { friendly: false, dmg: 1, r: 4, life: 60 }));
      p.addSkill('qinlong'); p.selectSlot(0);
      p.mp = p.maxMP; p.skillGcd = 0; p.skillCd[0] = 0;
      const mp0 = p.mp, near0 = near.hp, far0 = far.hp, bossX = boss.x, bossY = boss.y;
      out.qCostDef = SKILL_DEF.qinlong.cost;
      G.useSkill();
      out.qCost = mp0 - p.mp;
      out.pulled = +Math.hypot(near.x - p.x, near.y - p.y).toFixed(1);
      out.nearHurt = near0 - near.hp;
      out.farMoved = +Math.hypot(far.x - (p.x + 400), far.y - p.y).toFixed(1);
      out.farHurt = far0 - far.hp;
      out.bossMoved = +Math.hypot(boss.x - bossX, boss.y - bossY).toFixed(1);
      out.qBall = G.bullets.filter(b => !b.friendly && !b.dead).length;

      // ---- 裂空斩：朝指针劈出贯通剑气，一条线上两只都吃 ----
      G.newRun('wujian');
      const q = G.player; q.x = 240; q.y = 160;
      G.enemies.length = 0; G.bullets.length = 0;
      const e1 = mk(q.x + 70, q.y - 2, 99999);
      const e2 = mk(q.x + 140, q.y - 2, 99999);
      inp.mouseSeen = true; inp.mx = q.x + 400; inp.my = q.y;
      q.addSkill('liekong'); q.selectSlot(0);
      q.mp = q.maxMP; q.skillGcd = 0; q.skillCd[0] = 0;
      const mp1 = q.mp;
      out.lCostDef = SKILL_DEF.liekong.cost;
      G.useSkill();
      out.lCost = mp1 - q.mp;
      const rift = G.bullets.find(b => b.kind === 'rift');
      out.rift = !!rift;
      out.riftPierce = rift ? rift.pierce : -1;
      const h1 = e1.hp, h2 = e2.hp;
      for (let i = 0; i < 30; i++) G.update();
      out.rifthit1 = h1 - e1.hp;
      out.rifthit2 = h2 - e2.hp;
      return out;
    });
    ok('擒龙手消耗灵力', r.qCost === r.qCostDef, '扣 ' + r.qCost + '（定义 ' + r.qCostDef + '）');
    ok('把射程内的妖物扯到身前 20px', Math.abs(r.pulled - 20) < 2, '拉后距离 ' + r.pulled + ' px');
    ok('摄拿时造成伤害', r.nearHurt === 5, r.nearHurt + ' 点');
    ok('摄拿半径外的妖物不动', r.farMoved < 0.5 && r.farHurt === 0,
       `位移 ${r.farMoved} px / 伤害 ${r.farHurt}`);
    ok('尊者太重，摄拿不动', r.bossMoved < 0.5, '位移 ' + r.bossMoved + ' px');
    ok('顺手拍开身前术法', r.qBall === 0, '残留弹幕 ' + r.qBall + ' 颗');
    ok('裂空斩消耗灵力', r.lCost === r.lCostDef, '扣 ' + r.lCost + '（定义 ' + r.lCostDef + '）');
    ok('劈出的是裂空剑气', r.rift === true);
    ok('剑气贯通（pierce 拉满）', r.riftPierce === 99, 'pierce=' + r.riftPierce);
    ok('一条线上的两只妖物都被扫到', r.rifthit1 > 0 && r.rifthit2 > 0,
       `伤害 ${r.rifthit1.toFixed(1)} / ${r.rifthit2.toFixed(1)}`);
  }

  console.log('\n页面报错：' + (errs.length ? '\n  ' + errs.join('\n  ') : '无'));
  if (errs.length) fail += errs.length;
  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  if (failed.length) console.log('失败项：\n  - ' + failed.join('\n  - '));
  await Promise.race([browser.close(), new Promise(x => setTimeout(x, 3000))]);
  process.exit(0);
})();

/* 技能 id → 中文名（测试输出用） */
function SKILL_DEF_NAME(id) {
  return {
    tianlei: '天雷引', suodi: '缩地成寸', wuxing: '五行遁术', huti: '护体金光',
    qinlong: '擒龙手', liekong: '裂空斩'
  }[id] || id;
}
