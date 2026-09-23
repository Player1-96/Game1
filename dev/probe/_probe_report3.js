/* ============================================================
 *  _probe_report3.js —— 2026-09-23 三条反馈的逐帧实测
 *
 *  ① 绝难度烛龙「打到二阶段后无限切换二阶段」
 *  ② 「只能用飞剑流，没有流派选择环节」
 *  ③ 「怪走到右上角会被地图挡住行动」
 *
 *  跑法：node dev/probe/_probe_report3.js
 * ============================================================ */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 820 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(200);

  /* ================= ① 烛龙 · 绝难度 ================= */
  const zl = await page.evaluate(() => {
    const G = window.Game;
    const out = { phases: [], spawns: [], samples: [] };
    G.openChallMenu();
    G.challMenu.step = 'diff'; G.challMenu.bossId = 'zhulong'; G.challMenu.idx = 2;
    G.challConfirm();
    G.chall.upgrades = 0; G.pick = null;        // 跳过进境面板
    const b = G.bossRef;
    out.setup = { name: b.name, maxHp: b.maxHp, diffMul: G.chall.d.bossMul, hpScale: null };
    b.spawnT = 0;                                // 跳过凝形
    // hook setPhase
    const origSP = b.setPhase.bind(b);
    b.setPhase = function (np, g) { out.phases.push({ t: b.t, np: np, from: b.phase, hpPct: +(b.hp / b.maxHp).toFixed(3) }); return origSP(np, g); };
    // hook spawnWave
    const origSW = G.spawnWave.bind(G);
    G.spawnWave = function (i) { out.spawns.push({ t: b.t, wave: i, roomType: this.room ? this.room.type : null }); return origSW(i); };
    // 打掉 40% 血 → 应进入 phase 2
    b.hp = b.maxHp * 0.6;
    b.invuln = 0;
    b.hurt(1, G, null, false);
    out.afterFirstHit = { phase: b.phase, state: b.state, hpPct: +(b.hp / b.maxHp).toFixed(3) };
    // 往下跑 90 秒，每 30 帧采一次
    for (let i = 0; i < 5400; i++) {
      G.update();
      if (i % 30 === 0) out.samples.push([i, b.phase, b.state, b.guard, +(b.hp / b.maxHp).toFixed(2)]);
    }
    out.final = { phase: b.phase, hp: Math.round(b.hp), maxHp: b.maxHp, enemies: G.enemies.length, dead: b.dead };
    out.phaseStates = [...new Set(out.samples.map(s => s[1]))].join(',');
    out.stateSet = [...new Set(out.samples.map(s => s[2]))].join(',');
    return out;
  });
  console.log('=== ① 烛龙 · 绝难度 ===');
  console.log('  配装: ' + JSON.stringify(zl.setup));
  console.log('  首次受伤后: ' + JSON.stringify(zl.afterFirstHit));
  console.log('  setPhase 调用次数: ' + zl.phases.length);
  zl.phases.slice(0, 12).forEach(c => console.log('     t=' + c.t + '  ' + c.from + ' -> ' + c.np + '  (hp ' + (c.hpPct * 100).toFixed(1) + '%)'));
  console.log('  spawnWave 调用次数: ' + zl.spawns.length + '  ' + JSON.stringify(zl.spawns.slice(0, 6)));
  console.log('  出现过的 phase: [' + zl.phaseStates + ']   state 集合: [' + zl.stateSet + ']');
  console.log('  结束: ' + JSON.stringify(zl.final));
  console.log('  采样（每 30 帧：t / phase / state / guard / hp%）:');
  for (let i = 0; i < Math.min(zl.samples.length, 40); i++) {
    console.log('     ' + zl.samples[i].join('  '));
  }
  if (zl.samples.length > 40) console.log('     ...共 ' + zl.samples.length + ' 个采样');

  /* ================= ② 流派选择 ================= */
  const choose = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    G.state = 'title'; G.paused = false; G.settingsOpen = false; G.pick = null;
    updateOverlay();
    out.titleVisible = getComputedStyle(document.getElementById('title')).display;
    // 模拟按一个普通键（非 c / b）
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    out.stateAfterKey = G.state;
    out.chooseDisplay = getComputedStyle(document.getElementById('choose')).display;
    out.titleDisplay = getComputedStyle(document.getElementById('title')).display;
    const cards = [...document.querySelectorAll('#choose .pickCard')];
    out.cardCount = cards.length;
    out.cardNames = cards.map(c => (c.querySelector('.nm') || {}).textContent);
    out.styleIdx = G.styleIdx;
    // 直接看 newRun 在没有 style 时会用什么
    out.currentStyle = G.style;
    out.playable = null;
    return out;
  });
  console.log('\n=== ② 流派选择 ===');
  console.log('  标题可见: ' + choose.titleVisible);
  console.log('  按普通键后 state: ' + choose.stateAfterKey + '  #choose.display: ' + choose.chooseDisplay + '  #title.display: ' + choose.titleDisplay);
  console.log('  卡片数: ' + choose.cardCount + '  ' + JSON.stringify(choose.cardNames));

  /* ================= ③ 右上角/小地图 ================= */
  const corner = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    // 回到普通局（房间有怪）
    G.newRun('feijian');
    G.state = 'play';
    const p = G.player;
    p.invuln = 999999;
    // 屏幕上的小地图矩形（画布坐标）
    const f = G.floor;
    const cell = 9, gap = 2, size = f.size;
    const w = size * (cell + gap) - gap + 4;
    out.minimap = { x: 480 - w - 6, y: 38, w: w, h: size * (cell + gap) - gap + 8, size: size };
    out.worldToCanvas = '+32 (y)';
    out.minimapWorld = {
      x0: 480 - w - 8, x1: 480,
      y0: 38 - 2 - 32, y1: 38 + out.minimap.h - 32
    };
    // 房间可行区（玩家/敌人）
    out.walk = { L: 18, R: 462, T: 18, B: 270 };
    // 放一只怪，命令它一路往右上角跑
    G.enemies.length = 0; G.bullets.length = 0;
    const e = new Enemy('xiesui', 240, 144, 1);
    e.spawnT = 0; e.hp = e.maxHp = 99999; e.touch = 0; e.speed = 1;
    G.enemies.push(e);
    let maxX = -1, minY = 999;
    for (let i = 0; i < 400; i++) {
      e.x += 3; e.y -= 3; e.kbx = 0; e.kby = 0;
      G.update();
      e.x += 3; e.y -= 3;   // 再推一把（抵消 chase AI 把怪拉回玩家）
      maxX = Math.max(maxX, e.x); minY = Math.min(minY, e.y);
    }
    out.enemyMax = { x: Math.round(maxX), y: Math.round(minY), r: e.r };
    out.insideMinimap = (maxX >= out.minimapWorld.x0 && minY <= out.minimapWorld.y1);
    return out;
  });
  console.log('\n=== ③ 右上角 / 小地图遮挡 ===');
  console.log('  小地图（画布坐标）: ' + JSON.stringify(corner.minimap));
  console.log('  小地图覆盖的世界区: x [' + corner.minimapWorld.x0.toFixed(0) + ', ' + corner.minimapWorld.x1.toFixed(0) +
    ']  y [' + corner.minimapWorld.y0.toFixed(0) + ', ' + corner.minimapWorld.y1.toFixed(0) + ']');
  console.log('  可行区: ' + JSON.stringify(corner.walk));
  console.log('  敌人能到达的右上极限: ' + corner.enemyMax.x + ', ' + corner.enemyMax.y);
  console.log('  该处是否落在小地图覆盖区内: ' + corner.insideMinimap);

  /* 出图：把敌人摆到右上角，看被遮成什么样 */
  await page.evaluate(() => {
    const G = window.Game;
    G.enemies.length = 0; G.bullets.length = 0; G.pickups.length = 0;
    const p = G.player;
    p.x = 120; p.y = 200; p.invuln = 999999;
    const e = new Enemy('xiesui', 430, 60, 1);
    e.spawnT = 0; e.hp = e.maxHp = 99999; e.speed = 0; e.cd = 99999; e.touch = 0;
    G.enemies.push(e);
    G.draw();
    window.requestAnimationFrame = () => 0;
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, '_preview_corner.png') });

  console.log('\n  页面错误: ' + (errs.length ? errs.join(' | ') : '无'));
  console.log('  已出图: _preview_corner.png');

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
