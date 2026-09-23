'use strict';
/* 探针：无尽试炼（无限模式）的逐帧实测。

   用户需求（2026-09-23）：
     「无限刷怪的意思，就用带出来 build，然后不断刷新更强的怪，
       然后直到打不过，看下杀了多少只怪还有存活了多久」

   这里把每一条都量出来：
     1 三条曲线的形状（数量 / 血量 / 种类池 / 词缀）逐波递增且不封顶
     2 竞技场确实封闭（没有门、没有邻房）
     3 刷怪循环真的在跑（推够帧数就会出怪、且波次在涨）
     4 HUD / 结算界面拿得到分数
     5 存档隔离：无尽不写档、被打死也不销档、也不切死亡界面
     6 破纪录才写回
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

  /* ============ 1  三条曲线的形状 ============ */
  const curve = await page.evaluate(() => {
    const G = window.Game;
    G.startEndless('feijian');
    const out = { rows: [] };
    for (let w = 0; w <= 40; w += 4) {
      const mods = G.endlessModsFor(w);
      out.rows.push({
        w: w,
        count: G.endlessCount(w),
        hp: +G.endlessHpScale(w).toFixed(3),
        pool: G.endlessPool(w).length,
        mods: mods.length,
        modNames: mods
      });
    }
    out.hpAt60 = +G.endlessHpScale(60).toFixed(1);
    out.hpAt100 = +G.endlessHpScale(100).toFixed(1);
    out.countMax = G.endlessCount(999);
    out.modMax = ENDLESS.modMax;
    out.modTable = ENDLESS_MODS.map(m => m.id);
    return out;
  });

  console.log('=== 1  三条曲线（数量 / 血量 / 种类池 / 词缀）===');
  console.log('  波次   数量   血量倍率   种类池   词缀');
  for (const r of curve.rows) {
    console.log('  ' + String(r.w).padStart(3) + '    ' + String(r.count).padStart(3)
      + '    ' + String(r.hp).padStart(7) + '    ' + String(r.pool).padStart(3) + '     '
      + r.mods + (r.modNames.length ? '  [' + r.modNames.join(',') + ']' : ''));
  }
  console.log('  第 60 波血量 ×' + curve.hpAt60 + '　第 100 波 ×' + curve.hpAt100
    + '（DIFF_MAX 只到 3.0 —— 所以必须另起曲线）');
  console.log('  数量上限 ' + curve.countMax + '　词缀表 ' + curve.modTable.join(' / '));
  console.log('');

  /* ============ 2  竞技场是封闭的 ============ */
  const arena = await page.evaluate(() => {
    const G = window.Game;
    G.startEndless('feijian');
    const r = G.room;
    return {
      type: r.type,
      doors: r.doors.filter(Boolean).length,
      neighbors: r.neighbors.filter(Boolean).length,
      props: r.props.length,
      enemiesAtStart: G.enemies.length,   // enterRoom 自带的一波应被清掉
      state: G.state,
      wave: G.endless.wave,
      hasBest: !!G.endless.best,
      hp: G.player.hp, maxHP: G.player.maxHP,
      items: G.player.items.length,
      slots: G.player.slots.filter(Boolean).length,
      hasUlt: !!G.player.ult,
      saveRejected: G.saveGame()
    };
  });
  console.log('=== 2  竞技场与进场状态 ===');
  console.log('  房间类型            : ' + arena.type + '（正常石室，不是静心阁）');
  console.log('  门的数量            : ' + arena.doors + '（0 = 封闭擂台 ✓）');
  console.log('  相邻房间            : ' + arena.neighbors + '（0 = 走不出去 ✓）');
  console.log('  进场残留的妖物      : ' + arena.enemiesAtStart + '（0 = 已清干净 ✓）');
  console.log('  兜底配装            : 法宝 ' + arena.items + ' / 功法 ' + arena.slots
    + ' / 专属技 ' + arena.hasUlt);
  console.log('  开局存档被守卫挡下  : ' + arena.saveRejected + '（false = 被拒 ✓）');
  console.log('');

  /* ============ 3  刷怪循环真的在跑 ============ */
  const loop = await page.evaluate(() => {
    const G = window.Game;
    G.startEndless('feijian');
    const p = G.player;
    p.invuln = 999999;                     // 别让人被打死，专测刷怪
    const out = { trace: [], maxAlive: 0, killTotal: 0 };
    for (let f = 0; f < 1800; f++) {
      G.update();
      // 无敌状态杀不掉怪，手动清场以推动波次（模拟玩家打光）
      if (f % 45 === 0) {
        for (const e of G.enemies) if (!e.dead) { e.dead = true; G.endless.kills++; }
      }
      out.maxAlive = Math.max(out.maxAlive, G.enemies.filter(e => !e.dead).length);
      if (out.trace.length < 12 && G.endless.wave > out.trace.length) {
        out.trace.push({
          wave: G.endless.wave,
          n: G.endlessCount(G.endless.wave),
          hp: +G.endlessHpScale(G.endless.wave).toFixed(2),
          mods: G.endless.mods.slice(),
          enemies: G.enemies.length
        });
      }
    }
    out.wave = G.endless.wave;
    out.frames = G.endless.frames;
    out.kills = G.endless.kills;
    out.state = G.state;
    out.hudHasEndless = !!(G.endless);
    return out;
  });
  console.log('=== 3  刷怪循环（1800 帧 ≈ 30 秒）===');
  console.log('  波次 / 数量 / 血量   ：');
  for (const t of loop.trace) {
    console.log('    第 ' + String(t.wave).padStart(2) + ' 波　' + String(t.n).padStart(2)
      + ' 只　×' + t.hp + (t.mods.length ? '　词缀 ' + t.mods.join(',') : ''));
  }
  console.log('  推完后：波次 ' + loop.wave + '　存活帧 ' + loop.frames + '　击杀 ' + loop.kills);
  console.log('  同屏最多同时存在    : ' + loop.maxAlive + ' 只');
  console.log('  状态仍是 play       : ' + (loop.state === 'play'));
  console.log('');

  /* ============ 4  结算界面与分数 ============ */
  const result = await page.evaluate(() => {
    const G = window.Game;
    G.startEndless('feijian');
    G.endless.wave = 7;
    G.endless.kills = 42;
    G.endless.frames = 60 * 83;             // 1 分 23 秒
    const before = localStorage.getItem(SAVE_KEY);
    const p = G.player;
    p.invuln = 0; p.shield = 0; p.tShield = 0; p.hp = 1;
    p.takeDamage(99, G, 0, 0);
    if (!p.dead) p.takeDamage(99, G, 0, 0);
    const out = {
      playerDead: p.dead,
      state: G.state,
      secs: G.endless ? G.endless.secs : -1,
      bestPending: G.endless ? G.endless.bestPending : null,
      panelVisible: (document.getElementById('endless') || {}).style.display,
      panelText: (document.getElementById('endless') || {}).textContent || '',
      saveIntact: localStorage.getItem(SAVE_KEY) === before,
      best: G.endless ? G.endless.best : null
    };
    G.update();                              // 让 overlay 重新渲染一次
    out.panelText2 = (document.getElementById('endless') || {}).textContent || '';
    return out;
  });
  console.log('=== 4  结算界面 ===');
  console.log('  玩家死亡            : ' + result.playerDead);
  console.log('  状态                : ' + result.state + '（endlessEnd ✓）');
  console.log('  结算秒数            : ' + result.secs + ' 秒（期望 83）');
  console.log('  破纪录标记          : ' + result.bestPending);
  console.log('  历史最好成绩        : ' + JSON.stringify(result.best));
  console.log('  面板已显示          : ' + result.panelVisible);
  console.log('  面板文案            : ' + result.panelText2.replace(/\s+/g, ' ').trim().slice(0, 90));
  console.log('  存档未被改写        : ' + result.saveIntact);
  console.log('');

  /* ============ 5  不破纪录就不写回 ============ */
  const best = await page.evaluate(() => {
    const G = window.Game;
    localStorage.removeItem(ENDLESS_BEST_KEY);
    const beat1 = G.saveEndlessBest(3, 10, 30);      // 首次 → 破
    const s1 = G.loadEndlessBest();
    const beat2 = G.saveEndlessBest(1, 5, 10);       // 更差 → 不破
    const s2 = G.loadEndlessBest();
    const beat3 = G.saveEndlessBest(9, 10, 90);      // 击杀相同、存活更久 → 破
    const s3 = G.loadEndlessBest();
    G.saveEndlessBest(999, 999, 999);                // 留一个大纪录，避免污染后续
    return { beat1: beat1, s1: s1, beat2: beat2, s2: s2, beat3: beat3, s3: s3 };
  });
  console.log('=== 5  纪录写入规则（只有更好才写回）===');
  console.log('  首存 击杀10/30s      : 破=' + best.beat1 + ' → ' + JSON.stringify(best.s1));
  console.log('  再存 击杀5/10s       : 破=' + best.beat2 + ' → ' + JSON.stringify(best.s2) + '（应保持原值）');
  console.log('  再存 击杀10/90s      : 破=' + best.beat3 + ' → ' + JSON.stringify(best.s3) + '（同击杀比存活）');
  console.log('');

  /* ============ 6  回标题 + 从标题直接进 ============ */
  const nav = await page.evaluate(() => {
    const G = window.Game;
    G.startEndless('feijian');
    G.endless.wave = 4;
    G.exitEndless();
    const ended = G.state;
    G.leaveEndless();
    const back = G.state;
    const cleared = G.endless === null;
    // 从标题按 K 起一局（模拟键位）
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    const started = G.state;
    const hasEndless = !!G.endless;
    const arena0 = G.room ? G.room.doors.filter(Boolean).length : -1;
    // 新局必须清掉上局的无尽标记，否则存档会被守卫永久挡住
    G.newRun('feijian');
    return { ended: ended, back: back, cleared: cleared, started: started, hasEndless: hasEndless, arena0: arena0, afterNewRun: G.endless };
  });
  console.log('=== 6  导航与标记清理 ===');
  console.log('  结算后 state        : ' + nav.ended);
  console.log('  回标题后 state      : ' + nav.back + '　endless 已清 = ' + nav.cleared);
  console.log('  标题按 K 起一局     : ' + nav.started + '　endless 已建 = ' + nav.hasEndless
    + '　门数 ' + nav.arena0);
  console.log('  newRun 后 endless   : ' + nav.afterNewRun + '（null = 不会挡存档 ✓）');
  console.log('');

  console.log('页面错误: ' + (errs.length ? errs.join(' | ') : '无'));
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
