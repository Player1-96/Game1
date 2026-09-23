'use strict';
/* 探针：Boss 挑战模式的逐帧实测。

   用户需求（2026-09-22）：
     1 选择 boss 后进入挑战，自带「3 × 难度系数」件随机法宝
       + 「1 × 难度系数」个随机功法 + Lv「1 × 难度系数」的专属技；
       专属技的三级进境全部由玩家手选
     2 难度系数三档：险 / 危 / 绝
     3 打完（无论胜负）直接回 boss 选择菜单
     还隐含一条：不能碰真实存档 —— 否则调试会毁掉正常进度

   这里逐条量出来：配装数量、头目血量、进境次数、菜单往返、存档隔离。
*/
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');

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

  /* ============ 1  菜单：两级导航 + 头目表 ============ */
  const menu = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    G.openChallMenu();
    out.state = G.state;
    out.step1 = G.challMenu.step;
    out.bossCount = BOSS_KEYS.length;
    out.cardCount = document.querySelectorAll('#chall .pickCard').length;
    out.bossNames = BOSS_KEYS.map(k => BOSS_DEF[k].name);
    out.cardsText = [...document.querySelectorAll('#chall .pickCard .nm')].map(e => e.textContent);

    G.challPick(2);                       // ←→ / 数字切换
    out.pickIdx = G.challMenu.idx;
    G.challConfirm();                      // 确认头目 → 进难度
    out.step2 = G.challMenu.step;
    out.bossId = G.challMenu.bossId;
    out.diffCards = document.querySelectorAll('#chall .pickCard').length;
    out.diffNames = [...document.querySelectorAll('#chall .pickCard .nm')].map(e => e.textContent);
    G.challBack();                         // Esc 退一层
    out.backStep = G.challMenu.step;
    out.backIdx = G.challMenu.idx;         // 应回到刚才选的那位
    return out;
  });

  console.log('=== 1  挑战菜单 ===');
  console.log('  进入后 state        : ' + menu.state + '（菜单步进 ' + menu.step1 + '）');
  console.log('  头目卡              : ' + menu.cardCount + ' 张 / BOSS_KEYS ' + menu.bossCount + ' 位');
  console.log('  头目表              : ' + menu.bossNames.join(' / '));
  console.log('  卡片文案            : ' + menu.cardsText.join(' | '));
  console.log('  选第 3 位 → 确认     : 步进 ' + menu.step2 + '，bossId=' + menu.bossId);
  console.log('  难度卡              : ' + menu.diffCards + ' 张　' + menu.diffNames.join(' / '));
  console.log('  Esc 退回            : 步进 ' + menu.backStep + '，光标仍在第 ' + (menu.backIdx + 1) + ' 位');
  console.log('');

  /* ============ 2  三档配装 + 头目血量 ============ */
  const loadout = await page.evaluate(() => {
    const G = window.Game;
    const out = { rows: [] };
    for (let di = 0; di < CHALLENGE_DIFF.length; di++) {
      G.openChallMenu();
      G.challMenu.step = 'diff';
      G.challMenu.bossId = 'xuemo';
      G.challMenu.idx = di;
      G.challConfirm();                    // 开战
      const p = G.player;
      const d = CHALLENGE_DIFF[di];
      out.rows.push({
        name: d.name, key: d.key, mul: d.bossMul,
        wantItems: d.items, gotItems: p.items.length,
        wantSkills: d.skills, gotSkills: p.slots.filter(Boolean).length,
        wantUltLv: d.ultLv, gotUltLv: ultLevel(p.ult),
        pathSum: Object.values(p.ult.paths).reduce((a, b) => a + b, 0),
        upgrades: G.chall.upgrades,
        bossMaxHp: G.bossRef ? G.bossRef.maxHp : null,
        baseHp: BOSS_DEF.xuemo.hp,
        hpScale: G.floor.rooms.get(G.room.key).waves[0][0].hpScale,
        inBossRoom: G.room.type === 'boss',
        state: G.state
      });
    }
    out.diffCount = CHALLENGE_DIFF.length;
    out.upgradeConst = CHALL_UPGRADES;
    return out;
  });

  console.log('=== 2  三档配装与头目血量（目标：血魔尊者）===');
  console.log('  档位    法宝      功法      专属技         进境次数  头目血量');
  for (const r of loadout.rows) {
    console.log('  ' + r.name + '      ' + r.gotItems + '/' + r.wantItems + '     '
      + r.gotSkills + '/' + r.wantSkills + '     Lv' + r.gotUltLv + '/' + r.wantUltLv
      + '（路线和 ' + r.pathSum + '）   ' + r.upgrades + ' 次      '
      + r.bossMaxHp + '（' + r.baseHp + '×' + r.hpScale.toFixed(2) + '×' + r.mul + '）');
  }
  console.log('  进入的确实是魔窟房  : ' + loadout.rows.every(r => r.inBossRoom) + '　state = ' + loadout.rows[0].state);
  console.log('');

  /* ============ 3  进境：排队三次、全部手选 ============ */
  const upg = await page.evaluate(() => {
    const G = window.Game;
    const out = { asks: [], lvTrace: [] };
    G.openChallMenu();
    G.challMenu.step = 'diff'; G.challMenu.bossId = 'xuemo'; G.challMenu.idx = 1;
    G.challConfirm();
    out.lvAtStart = ultLevel(G.player.ult);
    out.upgradesAtStart = G.chall.upgrades;
    // 一路推帧，每次 pick 出现就选第一条路线
    for (let i = 0; i < 400 && out.asks.length < 6; i++) {
      G.update();
      if (G.pick && G.pick.kind === 'ult') {
        out.asks.push({ n: G.pick.list.length, names: G.pick.list.map(p => p.name) });
        G.pickPick(0);
        G.pickConfirm();
        out.lvTrace.push(ultLevel(G.player.ult));
      }
    }
    out.asksCount = out.asks.length;
    out.upgradesLeft = G.chall.upgrades;
    out.lvEnd = ultLevel(G.player.ult);
    out.pathsEnd = { ...G.player.ult.paths };
    out.pickCleared = G.pick === null;
    return out;
  });

  console.log('=== 3  专属技进境（三档都排 3 次，由玩家手选）===');
  console.log('  开局等级            : Lv' + upg.lvAtStart + '，排队 ' + upg.upgradesAtStart + ' 次');
  console.log('  实际弹出次数        : ' + upg.asksCount + ' 次（每次给 ' + (upg.asks[0] ? upg.asks[0].n : 0) + ' 条路线供选）');
  console.log('  每次都手选第一条    : 等级轨迹 ' + upg.lvTrace.join(' → '));
  console.log('  收尾等级            : Lv' + upg.lvEnd + '　剩余次数 ' + upg.upgradesLeft);
  console.log('  路线明细            : ' + JSON.stringify(upg.pathsEnd));
  console.log('  面板已收起          : ' + upg.pickCleared);
  console.log('');

  /* ============ 4  存档隔离 ============ */
  const iso = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    // newRun 自己会清掉挑战状态，所以直接开一局就有一份真档
    G.newRun('feijian');
    G.state = 'play';
    for (let i = 0; i < 30; i++) G.update();
    const before = localStorage.getItem(SAVE_KEY);
    out.hadSaveBefore = !!before;
    out.styleBefore = G.style;

    // 进挑战、打一阵、再打死玩家。
    // 进境面板会把 update 卡住（pick 非 null 时整条链路早退），所以要顺手选掉。
    G.openChallMenu();
    G.challMenu.step = 'diff'; G.challMenu.bossId = 'baigu'; G.challMenu.idx = 1;
    G.challConfirm();
    out.saveInsideChall = G.saveGame();          // 应被守卫挡下
    const settle = n => { for (let i = 0; i < n; i++) { G.update(); if (G.pick) { G.pickPick(0); G.pickConfirm(); } } };
    settle(260);
    out.upgradesLeft = G.chall.upgrades;
    out.midSave = localStorage.getItem(SAVE_KEY) === before;
    const p = G.player;
    p.invuln = 0; p.hp = 1;
    p.takeDamage(99, G, 0, 0);
    out.deadState = G.state;                     // 挑战模式不切 'dead'
    out.playerDead = p.dead;
    out.endTSet = G.chall.endT;
    settle(CHALL_RESULT_T + 10);
    out.stateAfterDeath = G.state;
    out.saveIntactAfterDeath = localStorage.getItem(SAVE_KEY) === before;
    out.result = G.challResult ? { win: G.challResult.win, boss: G.challResult.bossId, secs: G.challResult.secs } : null;
    out.challCleared = G.chall === null;
    return out;
  });

  console.log('=== 4  存档隔离（挑战模式不能碰真进度）===');
  console.log('  挑战前已有真档      : ' + iso.hadSaveBefore);
  console.log('  挑战中手动存档      : ' + iso.saveInsideChall + '（false = 被守卫挡下 ✓）');
  console.log('  挑战中档未被改写    : ' + iso.midSave + '　（期间进境剩 ' + iso.upgradesLeft + ' 次）');
  console.log('  玩家死后的 state    : ' + iso.deadState + '（不切 dead，避免出现「重入轮回」提示）');
  console.log('  结算倒计时已启动    : ' + iso.endTSet + ' 帧');
  console.log('  死后回菜单          : ' + iso.stateAfterDeath + '，chall 已清空 = ' + iso.challCleared);
  console.log('  真档完好            : ' + iso.saveIntactAfterDeath);
  console.log('  战果记录            : ' + JSON.stringify(iso.result));
  console.log('');

  /* ============ 5  斩杀后也回菜单 ============ */
  const win = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    G.openChallMenu();
    G.challMenu.step = 'diff'; G.challMenu.bossId = 'xuemo'; G.challMenu.idx = 0;
    G.challConfirm();
    G.chall.upgrades = 0;                        // 先跳过进境，专测结算
    G.player.invuln = 99999;
    const b = G.bossRef;
    out.bossName = b ? b.name : null;
    const hp0 = out.hp0 = b.maxHp;
    b.hurt(9999999, G, null, false);             // 一击必杀
    out.bossDead = b.dead;
    out.roomCleared = G.room.cleared;
    out.portalExists = !!G.room.portal;          // 挑战模式不该开传送阵
    out.pedestals = G.props.filter(p => p.kind === 'item').length;   // 也不该发战利品
    out.endT = G.chall.endT;
    out.stateRightAfter = G.state;
    for (let i = 0; i < CHALL_RESULT_T + 10; i++) G.update();
    out.stateAfter = G.state;
    out.stepAfter = G.challMenu ? G.challMenu.step : null;
    out.resultWin = G.challResult ? G.challResult.win : null;
    out.hp0 = hp0;
    return out;
  });

  console.log('=== 5  斩杀后直接回菜单 ===');
  console.log('  目标                : ' + win.bossName + '（' + win.hp0 + ' 血）');
  console.log('  击杀 → 房间清空     : ' + win.roomCleared);
  console.log('  未开传送阵          : ' + (win.portalExists === false));
  console.log('  未发战利品          : ' + (win.pedestals === 0) + '（法器台 ' + win.pedestals + ' 座）');
  console.log('  结算倒计时          : ' + win.endT + ' 帧后 ');
  console.log('  状态                : ' + win.stateRightAfter + ' → ' + win.stateAfter
    + '（菜单步进 ' + win.stepAfter + '）');
  console.log('  战果                : ' + (win.resultWin ? '胜 ✓' : '负 ✗'));
  console.log('');

  console.log('页面错误: ' + (errs.length ? errs.join(' | ') : '无'));
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
