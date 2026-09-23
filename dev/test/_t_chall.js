'use strict';
/* Boss 挑战模式的回归测试。

   覆盖（对应 2026-09-22 的需求）：
     T1 菜单：两级导航、头目表来自 BOSS_KEYS、Esc 退一层
     T2 配装：法宝 3d / 功法 d / 专属技 Lv d，且三档递增
     T3 头目血量按难度倍数放大
     T4 进境：固定 3 次、每次三选一、手选立即生效
     T5 存档隔离：挑战中不写档、不动既有档、死亡不销档
     T6 收场：胜（斩杀）与负（阵亡）都回菜单，并留下战果
     T7 收尾状态：不残留传送阵 / 战利品 / 挑战标记
     T8 运行期无报错
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

  /* 进挑战的快捷方式：指定头目与难度档 */
  await page.evaluate(() => {
    window.__start = function (bossId, diffIdx) {
      const G = window.Game;
      G.openChallMenu();
      G.challMenu.step = 'diff';
      G.challMenu.bossId = bossId;
      G.challMenu.idx = diffIdx;
      G.challConfirm();
      return G;
    };
    // 进境面板会把 update 整条卡住（pick 非 null 时早退），推帧时要顺手选掉
    window.__advance = function (n, pickIdx) {
      const G = window.Game;
      for (let i = 0; i < n; i++) {
        G.update();
        if (G.pick) { G.pickPick(pickIdx || 0); G.pickConfirm(); }
      }
      return G;
    };
  });

  /* ================= T1  菜单 ================= */
  sec('T1  两级菜单：择魔头 → 择难度');
  const t1 = await page.evaluate(() => {
    const G = window.Game;
    G.challResult = null;
    G.openChallMenu();
    const out = {
      state: G.state,
      step: G.challMenu.step,
      bossKeys: BOSS_KEYS.length,
      bossCards: document.querySelectorAll('#chall .pickCard').length,
      bossNames: [...document.querySelectorAll('#chall .pickCard .nm')].map(e => e.textContent),
      expectNames: BOSS_KEYS.map(k => BOSS_DEF[k].name)
    };
    G.challPick(BOSS_KEYS.length - 1);
    out.lastIdx = G.challMenu.idx;
    G.challConfirm();
    out.step2 = G.challMenu.step;
    out.bossId = G.challMenu.bossId;
    out.diffCards = document.querySelectorAll('#chall .pickCard').length;
    out.diffNames = [...document.querySelectorAll('#chall .pickCard .nm')].map(e => e.textContent);
    G.challBack();
    out.backStep = G.challMenu.step;
    out.backIdx = G.challMenu.idx;
    G.challBack();
    out.backToTitle = G.state;
    return out;
  });
  ok('从标题能进挑战菜单', t1.state === 'chall' && t1.step === 'boss', t1.state + '/' + t1.step);
  ok('头目卡与 BOSS_KEYS 一一对应',
    t1.bossCards === t1.bossKeys && t1.bossNames.join() === t1.expectNames.join(),
    t1.bossNames.join(' / '));
  ok('选到末位也能正确确认', t1.lastIdx === t1.bossKeys - 1 && t1.step2 === 'diff', 'bossId=' + t1.bossId);
  ok('难度恰好三档：险 / 危 / 绝',
    t1.diffCards === 3 && t1.diffNames.join('') === '险危绝', t1.diffNames.join(' / '));
  ok('Esc 从难度退回头目、且光标停在原处',
    t1.backStep === 'boss' && t1.backIdx === t1.bossKeys - 1, '停在第 ' + (t1.backIdx + 1) + ' 位');
  ok('再按 Esc 回标题', t1.backToTitle === 'title');

  /* ================= T2  配装 ================= */
  sec('T2  三档配装：法宝 3d / 功法 d / 专属技 Lv d');
  const t2 = await page.evaluate(() => {
    const G = window.Game;
    const rows = [];
    for (let i = 0; i < CHALLENGE_DIFF.length; i++) {
      window.__start('xuemo', i);
      const p = G.player, d = CHALLENGE_DIFF[i];
      rows.push({
        i: i, name: d.name, items: p.items.length, wantItems: d.items,
        skills: p.slots.filter(Boolean).length, wantSkills: d.skills,
        ultLv: ultLevel(p.ult), wantUltLv: d.ultLv,
        pathSum: Object.values(p.ult.paths).reduce((a, b) => a + b, 0),
        upgrades: G.chall.upgrades,
        hasUlt: !!p.ult,
        inBossRoom: G.room.type === 'boss',
        state: G.state
      });
    }
    return { rows: rows, upgradeConst: CHALL_UPGRADES, tiers: CHALLENGE_DIFF.length };
  });
  console.log('  档位  法宝      功法      专属技           进境');
  for (const r of t2.rows) {
    console.log('  ' + r.name + '    ' + r.items + '/' + r.wantItems + '      '
      + r.skills + '/' + r.wantSkills + '      Lv' + r.ultLv + '/Lv' + r.wantUltLv
      + '（路线和 ' + r.pathSum + '）   ' + r.upgrades + ' 次');
  }
  ok('难度恰好三档', t2.tiers === 3);
  ok('法宝件数 = 3 × 难度系数',
    t2.rows.every(r => r.items === r.wantItems), t2.rows.map(r => r.items).join(' / '));
  ok('功法个数 = 1 × 难度系数',
    t2.rows.every(r => r.skills === r.wantSkills), t2.rows.map(r => r.skills).join(' / '));
  ok('专属技等级 = 1 × 难度系数（等级和 = 等级 - 1）',
    t2.rows.every(r => r.ultLv === r.wantUltLv && r.pathSum === r.ultLv - 1),
    t2.rows.map(r => 'Lv' + r.ultLv).join(' / '));
  ok('专属技一定拿到手（否则进境面板开不出来）', t2.rows.every(r => r.hasUlt));
  ok('三档都排 3 次手选进境',
    t2.rows.every(r => r.upgrades === t2.upgradeConst), 'CHALL_UPGRADES=' + t2.upgradeConst);
  ok('开战即身处魔窟房、state 为 play',
    t2.rows.every(r => r.inBossRoom && r.state === 'play'));

  /* ================= T3  头目血量 ================= */
  sec('T3  头目血量 = 基础血 × 层数系数 × 难度倍数');
  const t3 = await page.evaluate(() => {
    const G = window.Game;
    const out = { rows: [] };
    for (let i = 0; i < CHALLENGE_DIFF.length; i++) {
      window.__start('xuemo', i);
      const b = G.bossRef;
      const w = G.room.waves[0][0];
      out.rows.push({
        i: i, name: CHALLENGE_DIFF[i].name, mul: CHALLENGE_DIFF[i].bossMul,
        hp: b ? b.maxHp : 0, base: BOSS_DEF.xuemo.hp, scale: w.hpScale,
        name2: b ? b.name : null
      });
    }
    // 同档不同头目：血量应随各自的基础血与层数变化
    window.__start('zhulong', 1);
    out.zl = { hp: G.bossRef.maxHp, base: BOSS_DEF.zhulong.hp, name: G.bossRef.name };
    window.__start('xuemo', 1);
    out.xm = { hp: G.bossRef.maxHp, base: BOSS_DEF.xuemo.hp, name: G.bossRef.name };
    out.expectZL = BOSS_DEF.zhulong.name;
    out.expectXM = BOSS_DEF.xuemo.name;
    return out;
  });
  for (const r of t3.rows) {
    console.log('  ' + r.name + '：' + r.hp + ' 血（' + r.base + ' × '
      + r.scale.toFixed(2) + ' × ' + r.mul + '）');
  }
  ok('难度倍数确实乘了上去（逐档递增）',
    t3.rows.every((r, i, a) => i === 0 || r.hp > a[i - 1].hp),
    t3.rows.map(r => r.hp).join(' / '));
  ok('血量符合「基础 × 层数系数 × 难度倍数」',
    t3.rows.every(r => Math.abs(r.hp - Math.round(r.base * r.scale * r.mul)) <= 2),
    t3.rows.map(r => r.hp).join(' / '));
  ok('同档换头目会换成对应那一位',
    t3.zl.name === t3.expectZL && t3.xm.name === t3.expectXM,
    t3.xm.name + ' ' + t3.xm.hp + ' 血 / ' + t3.zl.name + ' ' + t3.zl.hp + ' 血');

  /* ================= T4  进境 ================= */
  sec('T4  专属技进境：固定 3 次、每次三选一、手选生效');
  const t4 = await page.evaluate(() => {
    const G = window.Game;
    const out = { asks: [], trace: [] };
    window.__start('xuemo', 1);
    out.lv0 = ultLevel(G.player.ult);
    out.up0 = G.chall.upgrades;
    for (let i = 0; i < 500 && out.asks.length < 6; i++) {
      G.update();
      if (G.pick && G.pick.kind === 'ult') {
        out.asks.push(G.pick.list.length);
        out.names = out.names || G.pick.list.map(p => p.name);
        G.pickPick(i % 3);                 // 依次换一条，验证选的是不是真的那一条
        out.picked = (out.picked || []).concat(G.pick.list[i % 3].id);
        G.pickConfirm();
        out.trace.push({ lv: ultLevel(G.player.ult), paths: { ...G.player.ult.paths } });
      }
    }
    out.asksCount = out.asks.length;
    out.upLeft = G.chall.upgrades;
    out.lvEnd = ultLevel(G.player.ult);
    out.pathsEnd = { ...G.player.ult.paths };
    out.cleared = G.pick === null;
    // 每次选的路线都应在最终 paths 里有等级
    out.allPickedApplied = out.picked.every(id => out.pathsEnd[id] > 0);
    return out;
  });
  console.log('  开局 Lv' + t4.lv0 + '（排队 ' + t4.up0 + ' 次）→ 弹出 ' + t4.asksCount
    + ' 次，每次 ' + (t4.asks[0] || 0) + ' 条候选');
  console.log('  等级轨迹 ' + t4.lv0 + ' → ' + t4.trace.map(t => t.lv).join(' → ')
    + '　路线 ' + JSON.stringify(t4.pathsEnd));
  ok('恰好弹出 3 次', t4.asksCount === 3, t4.asksCount + ' 次');
  ok('每次都给 3 条路线供选', t4.asks.every(n => n === 3), t4.asks.join('/'));
  ok('每次都真的手选生效（等级逐次 +1）',
    t4.trace.length === 3 && t4.trace[0].lv === t4.lv0 + 1
    && t4.trace[1].lv === t4.lv0 + 2 && t4.trace[2].lv === t4.lv0 + 3,
    t4.trace.map(t => t.lv).join(' → '));
  ok('选中的路线确实记在专属技上', t4.allPickedApplied, JSON.stringify(t4.pathsEnd));
  ok('次数用完后不再弹、面板已收起', t4.upLeft === 0 && t4.cleared);

  /* ================= T5  存档隔离 ================= */
  sec('T5  存档隔离：挑战模式不碰真实进度');
  const t5 = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    G.newRun('feijian');                 // 会顺带清掉挑战状态，留一份真档
    G.state = 'play';
    window.__advance(30, 0);
    const before = localStorage.getItem(SAVE_KEY);
    out.hadSave = !!before;

    window.__start('baigu', 1);
    out.saveRejected = G.saveGame();     // 应被守卫挡下
    G.player.invuln = 999999;            // 推帧期间别让头目把玩家打死，那会提前触发结算
    window.__advance(300, 0);
    out.upLeft = G.chall.upgrades;
    out.saveUntouched = localStorage.getItem(SAVE_KEY) === before;
    out.deadDuringAdvance = G.player.dead;
    out.stateBeforeKill = G.state;

    // 直接打血。注意：挑战配装可能带护盾法宝，而护盾是「每层完全挡下一次」，
    // 不清掉的话 99 点伤害会被盾整个吃掉、玩家一点事没有。
    const p = G.player;
    p.invuln = 0; p.shield = 0; p.tShield = 0; p.hp = 1;
    p.takeDamage(99, G, 0, 0);
    out.playerDead = p.dead;
    if (!p.dead) p.takeDamage(99, G, 0, 0);      // 保险：万一还有一层没清干净
    out.playerDead2 = p.dead;
    out.deadState = G.state;             // 挑战模式不切 'dead'（否则会提示「重入轮回」）
    out.endTSet = G.chall ? G.chall.endT : -1;
    window.__advance(CHALL_RESULT_T + 12, 0);
    out.stateAfter = G.state;
    out.saveIntact = localStorage.getItem(SAVE_KEY) === before;
    out.hasSaveStill = G.hasSave();
    out.challCleared = G.chall === null;
    return out;
  });
  ok('挑战前确有真档（对照成立）', t5.hadSave === true);
  ok('挑战中调 saveGame 被拒', t5.saveRejected === false);
  ok('挑战全程没改写存档', t5.saveUntouched === true);
  ok('挑战中阵亡不销档', t5.saveIntact === true && t5.hasSaveStill === true);
  ok('挑战中阵亡不切死亡界面', t5.deadState === 'play', 'state=' + t5.deadState);
  ok('阵亡后启动结算倒计时', t5.endTSet > 0,
    t5.endTSet + ' 帧（玩家 dead=' + t5.playerDead + '，推帧前 state=' + t5.stateBeforeKill
    + '，期间已被打死=' + t5.deadDuringAdvance + '）');
  ok('阵亡后回到挑战菜单', t5.stateAfter === 'chall' && t5.challCleared === true);

  /* ================= T6  斩杀收场 ================= */
  sec('T6  斩杀头目后直接回菜单');
  const t6 = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    G.newRun('feijian'); G.state = 'play';
    window.__advance(20, 0);
    const before = localStorage.getItem(SAVE_KEY);
    window.__start('liesha', 2);
    G.chall.upgrades = 0;                // 跳过进境，专测收场
    G.player.invuln = 999999;
    const b = G.bossRef;
    out.bossName = b.name;
    out.mul = CHALLENGE_DIFF[2].bossMul;
    const hp0 = b.maxHp;
    b.hurt(9999999, G, null, false);
    out.bossDead = b.dead;
    out.cleared = G.room.cleared;
    out.noPortal = !G.room.portal;                 // 挑战模式不开传送阵
    out.noPedestal = G.props.filter(p => p.kind === 'item').length === 0;   // 也不发战利品
    out.endT = G.chall.endT;
    window.__advance(CHALL_RESULT_T + 12, 0);
    out.state = G.state;
    out.step = G.challMenu ? G.challMenu.step : null;
    out.result = G.challResult ? { win: G.challResult.win, boss: G.challResult.bossId, diff: G.challResult.diffIdx } : null;
    out.saveIntact = localStorage.getItem(SAVE_KEY) === before;
    out.hp0 = hp0;
    return out;
  });
  console.log('  目标 ' + t6.bossName + '（' + t6.hp0 + ' 血，×' + t6.mul + '）×');
  ok('斩杀后房间清空', t6.bossDead === true && t6.cleared === true);
  ok('挑战模式不开传送阵', t6.noPortal === true);
  ok('挑战模式不发战利品', t6.noPedestal === true);
  ok('斩杀后回到挑战菜单', t6.state === 'chall' && t6.step === 'boss', t6.state + '/' + t6.step);
  ok('战果被记住（胜）',
    !!t6.result && t6.result.win === true && t6.result.boss === 'liesha' && t6.result.diff === 2,
    JSON.stringify(t6.result));
  ok('斩杀也不碰存档', t6.saveIntact === true);

  /* ================= T7  收尾状态 ================= */
  sec('T7  收尾：不残留挑战标记与战场');
  const t7 = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    G.state = 'play';
    const out = {};
    out.challCleared = G.chall === null;
    out.saveWorks = G.saveGame();        // 脱离挑战后存档应恢复正常
    // 挑战中「长按 R 重开」应回挑战菜单，而不是掉进普通开局的流派选择
    window.__start('xuemo', 0);
    /* 先跳完进境：面板开着时 update 会早退并把 restartHold 清零（那是故意的 ——
       面板里该用 ←→/Enter），所以要在面板结束之后再试长按 */
    G.chall.upgrades = 0;
    G.restartHold = 0;
    G.state = 'play';
    for (let i = 0; i < 70 && G.state === 'play'; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
      G.update();
    }
    out.afterRestart = G.state;
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'r' }));
    return out;
  });
  ok('开局后挑战标记被清掉', t7.challCleared === true);
  ok('脱离挑战后存档恢复正常', t7.saveWorks === true);
  ok('挑战中长按 R 回挑战菜单（不是掉进流派选择）',
    t7.afterRestart === 'chall', t7.afterRestart);

  /* ================= T8  全局错误 ================= */
  sec('T8  运行期无报错');
  ok('没有页面错误', errs.length === 0, errs.join(' | '));

  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  if (failed.length) console.log('失败项：\n  - ' + failed.join('\n  - '));
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(fail ? 1 : 0);
})();
