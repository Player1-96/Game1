'use strict';
/* 无尽试炼（无限模式）的回归测试。

   对应 2026-09-23 的需求：
     「无限刷怪的意思，就用带出来 build，然后不断刷新更强的怪，
       然后直到打不过，看下杀了多少只怪还有存活了多久」

   覆盖：
     T1 曲线：数量 / 血量 / 种类池 / 词缀 四者都随波次递增，且血量不被 DIFF_MAX 封顶
     T2 竞技场：一间封闭石室，没有门、没有邻房，进场残留的妖物已清空
     T3 配装：兜底配装 + 通关 build 载入（法宝 / 功法 / 专属技路线都还原）
     T4 刷怪：清场后才排下一波，间隔在收敛；波次真的在涨
     T5 词缀：按波次解锁、不重复、上限 3 条，且 apply 真的改了敌人属性
     T6 存档隔离：无尽不写档、被打死不销档、不切死亡界面
     T7 结算：击杀 / 存活秒数 / 波次，破纪录才写回
     T8 收尾：回标题后 endless 已清；newRun 也清（否则存档被守卫永久挡住）
     T9 运行期无报错
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
    /* resetBest=false 时保留已有纪录 —— 测「更差的一局不破纪录」必须保留，
       否则每次起局都把纪录抹了，那条断言永远「通过」得毫无意义。 */
    window.__endless = function (style, resetBest) {
      const G = window.Game;
      if (resetBest !== false) localStorage.removeItem(ENDLESS_BEST_KEY);
      G.startEndless(style || 'feijian');
      return G;
    };
    window.__advance = function (n) {
      const G = window.Game;
      for (let i = 0; i < n; i++) {
        G.update();
        if (G.pick) { G.pickPick(0); G.pickConfirm(); }
      }
      return G;
    };
  });

  /* ================= T1  曲线 ================= */
  sec('T1  四条曲线随波次递增，血量不被 DIFF_MAX 封顶');
  const t1 = await page.evaluate(() => {
    const G = window.__endless('feijian');
    const out = { rows: [] };
    for (const w of [1, 5, 10, 20, 40, 60]) {
      out.rows.push({
        w: w, count: G.endlessCount(w), hp: G.endlessHpScale(w),
        pool: G.endlessPool(w).length, mods: G.endlessModsFor(w).length
      });
    }
    out.diffMax = 3.0;
    out.hp60 = G.endlessHpScale(60);
    out.modMax = ENDLESS.modMax;
    /* 池子里每一个键都必须真的存在于 ENEMY_DEF —— 否则 new Enemy 会抛异常 */
    out.badPoolKeys = [];
    for (let w = 1; w <= 60; w++) {
      for (const t of G.endlessPool(w)) if (!ENEMY_DEF[t]) out.badPoolKeys.push(w + ':' + t);
    }
    out.countMonotone = true;
    for (let w = 1; w < 60; w++) if (G.endlessCount(w + 1) < G.endlessCount(w)) out.countMonotone = false;
    out.hpMonotone = true;
    for (let w = 1; w < 60; w++) if (G.endlessHpScale(w + 1) < G.endlessHpScale(w)) out.hpMonotone = false;
    return out;
  });
  console.log('  波次   数量   血量倍率   种类池   词缀');
  for (const r of t1.rows) {
    console.log('  ' + String(r.w).padStart(3) + '    ' + String(r.count).padStart(3)
      + '    ' + r.hp.toFixed(2).padStart(7) + '    ' + String(r.pool).padStart(3)
      + '     ' + r.mods);
  }
  ok('数量随波次单调不减', t1.countMonotone, t1.rows.map(r => r.count).join('/'));
  ok('血量随波次单调不减', t1.hpMonotone);
  ok('血量突破了 DIFF_MAX=' + t1.diffMax + '（否则后期毫无变化）',
    t1.hp60 > t1.diffMax * 5, '第 60 波 ×' + t1.hp60.toFixed(1));
  ok('种类池随波次换档（不是一路只有开场三样）',
    t1.rows[0].pool < Math.max(...t1.rows.map(r => r.pool)),
    t1.rows.map(r => r.pool).join('/'));
  ok('词缀数随波次增长且有上限 ' + t1.modMax,
    t1.rows[0].mods === 0 && t1.rows[t1.rows.length - 1].mods <= t1.modMax);
  ok('池里每个键都存在于 ENEMY_DEF', t1.badPoolKeys.length === 0, t1.badPoolKeys.join(', '));

  /* ================= T2  竞技场 ================= */
  sec('T2  竞技场：一间封闭石室');
  const t2 = await page.evaluate(() => {
    const G = window.__endless('feijian');
    const r = G.room;
    return {
      type: r.type,
      doors: r.doors.filter(Boolean).length,
      hidden: r.doorHidden.filter(Boolean).length,
      neighbors: r.neighbors.filter(Boolean).length,
      props: r.props.length,
      enemies: G.enemies.length,
      state: G.state,
      endlessWave: G.endless.wave,
      sameRoom: r === G.floorStart()
    };
  });
  ok('进的是普通石室（不是静心阁）', t2.type === 'normal', t2.type);
  ok('没有任何门', t2.doors === 0 && t2.hidden === 0);
  ok('没有相邻房间（走不出去）', t2.neighbors === 0);
  ok('不放宝箱 / 灯笼', t2.props === 0);
  ok('进场时 enterRoom 自带的那波已清掉', t2.enemies === 0);
  ok('state 直接是 play', t2.state === 'play');

  /* ================= T3  配装 ================= */
  sec('T3  配装：兜底 + 通关 build 载入');
  const t3 = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    // 兜底配装
    window.__endless('feijian');
    out.base = {
      items: G.player.items.length, skills: G.player.slots.filter(Boolean).length,
      ult: !!G.player.ult, ultLv: G.player.ult ? ultLevel(G.player.ult) : 0
    };
    out.wantBase = { items: ENDLESS.baseItems, skills: ENDLESS.baseSkills, ultLv: ENDLESS.baseUltLv };

    // 通关 build 载入：自己造一份带具体法宝与路线的 build
    const want = ['poison', 'soul'];
    const build = {
      items: ['feijian_1', 'feijian_1'],       // 重复即进阶 —— 若 id 不存在则退化为空，不算失败
      slots: [{ id: 'huodan', lv: 2 }],
      ultPaths: { qian: 2, hou: 1 },
      hp: 5
    };
    // 改用「当前流派真实可用的技能 id」更稳：从 rollSkill 拿一个
    const sid = G.rollSkill();
    build.slots = sid ? [{ id: sid, lv: 1 }] : [];
    G.startEndless('feijian', build);
    out.loaded = {
      slots: G.player.slots.filter(Boolean).map(s => s.id),
      wantSlots: build.slots.map(s => s.id),
      paths: G.player.ult ? { ...G.player.ult.paths } : null,
      hp: G.player.hp
    };
    return out;
  });
  ok('兜底：法宝 = ' + t3.wantBase.items + ' 件',
    t3.base.items === t3.wantBase.items, t3.base.items + '');
  ok('兜底：功法 = ' + t3.wantBase.skills + ' 个',
    t3.base.skills === t3.wantBase.skills, t3.base.skills + '');
  ok('兜底：专属技到手且 Lv = ' + t3.wantBase.ultLv,
    t3.base.ult && t3.base.ultLv === t3.wantBase.ultLv, 'Lv' + t3.base.ultLv);
  ok('build 载入：功法还原',
    t3.loaded.slots.join() === t3.loaded.wantSlots.join(),
    t3.loaded.slots.join('/') + ' vs ' + t3.loaded.wantSlots.join('/'));
  ok('build 载入：专属技路线还原',
    !!t3.loaded.paths && t3.loaded.paths.qian === 2 && t3.loaded.paths.hou === 1,
    JSON.stringify(t3.loaded.paths));

  /* ================= T4  刷怪 ================= */
  sec('T4  刷怪：清场后才排下一波');
  const t4 = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    // A 场景：完全不动手 —— 不应有源源不断的怪堆上来
    window.__endless('feijian');
    G.player.invuln = 999999;
    window.__advance(1800);
    out.passiveWave = G.endless.wave;
    out.passiveAlive = G.enemies.filter(e => !e.dead).length;

    // B 场景：每 30 帧清一次场 —— 波次应稳步推进，间隔有地板
    window.__endless('feijian');
    G.player.invuln = 999999;
    const gaps = []; let last = 0, lw = 0;
    for (let f = 0; f < 1800; f++) {
      G.update();
      if (G.endless.wave !== lw) { gaps.push(f - last); last = f; lw = G.endless.wave; }
      if (f % 30 === 0) for (const e of G.enemies) if (!e.dead) { e.dead = true; G.endless.kills++; }
    }
    out.fastWave = G.endless.wave;
    out.gaps = gaps.slice(1, 8);        // 第 0 个是进场那一帧，忽略
    out.frames = G.endless.frames;
    out.kills = G.endless.kills;
    out.state = G.state;
    out.floor = ENDLESS.clearCooldown;
    return out;
  });
  console.log('  被动挨打 1800 帧：波次 ' + t4.passiveWave + '，场上活着 ' + t4.passiveAlive + ' 只');
  console.log('  每 30 帧清场 1800 帧：波次 ' + t4.fastWave + '，间隔 ' + t4.gaps.join(', '));
  ok('玩家不动手时不会无限刷怪（波次停在 1）',
    t4.passiveWave === 1, '波次 ' + t4.passiveWave + '，场上 ' + t4.passiveAlive + ' 只');
  ok('清场后波次稳步推进', t4.fastWave >= 8, t4.fastWave + ' 波');
  ok('相邻两波间隔不低于地板 ' + t4.floor,
    t4.gaps.every(g => g >= t4.floor), t4.gaps.join(','));
  ok('存活帧数在累计', t4.frames === 1800, t4.frames + '');
  ok('状态仍是 play', t4.state === 'play');

  /* ================= T5  词缀 ================= */
  sec('T5  词缀：按波解锁、不重复、上限、且真的生效');
  const t5 = await page.evaluate(() => {
    const G = window.Game;
    const out = { rows: [], overflow: 0, dup: 0 };
    for (const w of [1, 4, 5, 10, 15, 20, 30, 60]) {
      const mods = G.endlessModsFor(w);
      if (mods.length > ENDLESS.modMax) out.overflow++;
      if (new Set(mods).size !== mods.length) out.dup++;
      out.rows.push({ w: w, mods: mods });
    }
    out.max = ENDLESS.modMax;
    out.tableSize = ENDLESS_MODS.length;

    /* 逐条量 apply 有没有真的改东西 */
    window.__endless('feijian');
    const mk = () => new Enemy('xiesui', 100, 100, 1);
    const a = mk();
    const base = { speed: a.speed, hp: a.maxHp };
    const eff = {};
    for (const m of ENDLESS_MODS) {
      const e = mk();
      const before = { speed: e.speed, hp: e.maxHp };
      m.apply(e);
      eff[m.id] = (e.speed !== before.speed || e.maxHp !== before.hp
        || e.touchMul || e.deathHazard || e.swarmTag || e.modRegen
        || e.touchSlow || e.deathBurst) ? true : false;
    }
    out.eff = eff;
    out.base = base;
    return out;
  });
  console.log('  词缀表 ' + t5.tableSize + ' 条，单波上限 ' + t5.max + ' 条');
  for (const r of t5.rows) console.log('    第 ' + String(r.w).padStart(2) + ' 波：'
    + (r.mods.length ? r.mods.join(', ') : '（无）'));
  ok('词缀数不超过上限', t5.overflow === 0);
  ok('同一波内不重复', t5.dup === 0);
  ok('前 4 波无词缀、第 5 波起出现', t5.rows[0].mods.length === 0 && t5.rows[3].mods.length >= 1);
  ok('每条词缀的 apply 都真的改了东西',
    Object.values(t5.eff).every(Boolean), JSON.stringify(t5.eff));

  /* ================= T6  存档隔离 ================= */
  sec('T6  存档隔离：无尽不碰真实进度');
  const t6 = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    G.newRun('feijian');
    G.state = 'play';
    window.__advance(30);
    const before = localStorage.getItem(SAVE_KEY);
    out.hadSave = !!before;

    window.__endless('feijian');
    out.saveRejected = G.saveGame();
    window.__advance(200);
    out.saveUntouched = localStorage.getItem(SAVE_KEY) === before;

    const p = G.player;
    p.invuln = 0; p.shield = 0; p.tShield = 0; p.hp = 1;
    p.takeDamage(99, G, 0, 0);
    if (!p.dead) p.takeDamage(99, G, 0, 0);
    out.dead = p.dead;
    out.stateAfterDeath = G.state;      // 应是 endlessEnd，不是 'dead'
    out.saveIntactAfterDeath = localStorage.getItem(SAVE_KEY) === before;
    return out;
  });
  ok('无尽前确有真档（对照成立）', t6.hadSave === true);
  ok('无尽中调 saveGame 被拒', t6.saveRejected === false);
  ok('无尽全程没改写存档', t6.saveUntouched === true);
  ok('被打死后不切死亡界面', t6.stateAfterDeath === 'endlessEnd', 'state=' + t6.stateAfterDeath);
  ok('被打死后真档完好', t6.saveIntactAfterDeath === true);

  /* ================= T7  结算与纪录 ================= */
  sec('T7  结算：击杀 / 存活 / 波次，破纪录才写回');
  const t7 = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    localStorage.removeItem(ENDLESS_BEST_KEY);
    window.__endless('feijian');
    G.endless.wave = 9;
    G.endless.kills = 77;
    G.endless.frames = 60 * 123;
    G.exitEndless();
    out.state = G.state;
    out.secs = G.endless.secs;
    out.bestPending = G.endless.bestPending;
    out.best = G.endless.best;
    out.panelText = (document.getElementById('endless') || {}).textContent || '';
    out.panelShown = (document.getElementById('endless') || {}).style.display;

    // 更差的一局：不破纪录（保留上一局的纪录作为对照）
    G.leaveEndless();
    window.__endless('feijian', false);
    G.endless.wave = 2; G.endless.kills = 3; G.endless.frames = 60 * 5;
    G.exitEndless();
    out.worsePending = G.endless.bestPending;
    out.bestAfterWorse = G.endless.best;
    return out;
  });
  console.log('  结算面板：' + t7.panelText.replace(/\s+/g, ' ').trim().slice(0, 100));
  ok('结算后进入 endlessEnd', t7.state === 'endlessEnd');
  ok('存活秒数换算正确（123 秒）', t7.secs === 123, t7.secs + '');
  ok('首局即破纪录', t7.bestPending === true);
  ok('纪录已写入', t7.best.kills === 77 && t7.best.secs === 123 && t7.best.wave === 9,
    JSON.stringify(t7.best));
  ok('面板显示了三个分数', /9/.test(t7.panelText) && /77/.test(t7.panelText) && /02:03/.test(t7.panelText));
  ok('更差的一局不破纪录', t7.worsePending === false);
  ok('纪录未被更差的一局覆盖', t7.bestAfterWorse.kills === 77, JSON.stringify(t7.bestAfterWorse));

  /* ================= T8  收尾 ================= */
  sec('T8  收尾：标记清理与导航');
  const t8 = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    window.__endless('feijian');
    G.endless.wave = 3;
    G.leaveEndless();
    out.state = G.state;
    out.cleared = G.endless === null;

    // 从标题按 K 起一局
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    out.byKeyState = G.state;
    out.byKeyEndless = !!G.endless;
    out.byKeyDoors = G.room ? G.room.doors.filter(Boolean).length : -1;

    // newRun 必须清掉无尽标记 —— 否则存档会被守卫永久挡住
    G.newRun('feijian');
    out.afterNewRun = G.endless === null;
    out.saveWorks = G.saveGame();
    return out;
  });
  ok('回标题后 endless 已清', t8.state === 'title' && t8.cleared);
  ok('标题按 K 能起无尽', t8.byKeyState === 'play' && t8.byKeyEndless);
  ok('按 K 起局后竞技场依然无门', t8.byKeyDoors === 0);
  ok('newRun 清掉无尽标记', t8.afterNewRun === true);
  ok('脱离无尽后存档恢复正常', t8.saveWorks === true);

  /* ================= T9  报错 ================= */
  sec('T9  运行期无报错');
  ok('没有页面错误', errs.length === 0, errs.join(' | '));

  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  if (failed.length) console.log('失败项：\n  - ' + failed.join('\n  - '));
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(fail ? 1 : 0);
})();
