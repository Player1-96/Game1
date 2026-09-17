'use strict';
/* 探针：存档 / 读档。
   用同一个 BrowserContext 开两个页面模拟「关掉网页再打开」——
   file:// 下 localStorage 是跨页面共享的（实测过），所以这是有效模拟。

   验证点：
   1) 关页面后重开，hasSave() 为真、标题界面挂出续档入口
   2) continueGame() 能把层数 / 种子 / 血量 / 灵石 / 法宝 / 当前房间原样还原
   3) 法宝效果不会因读档被重复叠加（stats 与存档一致）
   4) 死亡后存档被销掉
*/
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');

const SNAP = `(() => {
  const G = window.Game;
  const rooms = [...G.floor.rooms.values()];
  return {
    state: G.state, style: G.style, depth: G.depth, seed: G.floor.seed,
    hp: G.player.hp, maxHP: G.player.maxHP, mp: G.player.mp, maxMP: G.player.maxMP,
    coins: G.coins, keys: G.keys, bombs: G.bombs, kills: G.kills, time: G.time,
    items: G.player.items.slice(),
    slots: G.player.slots.map(s => s ? s.id + ':' + s.lv : null),
    ult: G.player.ult ? G.player.ult.style : null,
    stats: { damage: +G.player.stats.damage.toFixed(3), fireRate: +G.player.stats.fireRate.toFixed(3) },
    roomKey: G.room ? G.room.key : null,
    roomCount: rooms.length,
    clearedCount: rooms.filter(r => r.cleared).length,
    visitedCount: rooms.filter(r => r.visited).length,
    doorsOpen: G.room ? G.room.doorOpen.map(v => v ? 1 : 0).join('') : null,
    enemies: G.enemies.length
  };
})()`;

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext();
  const errs = [];

  /* ---------- 第一次打开：打一会儿并进过几间房 ---------- */
  const p1 = await ctx.newPage();
  p1.on('pageerror', e => errs.push('[p1] ' + e.message));
  await p1.goto(FILE);
  await p1.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p1.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await p1.waitForTimeout(200);

  const before = await p1.evaluate((snapSrc) => {
    const G = window.Game;
    // 先清掉旧档，用来验证「开局第一间房就会自动存档」
    try { localStorage.removeItem('xiuxian-isaac.save.v1'); } catch (e) { }
    G._hasSave = null;
    G.newRun('wujian');
    const autoSavedOnNewRun = G.hasSave();   // 立刻查：newRun → newFloor → enterRoom 就该把档写好
    G.state = 'play';
    let ts = 1000;
    for (let i = 0; i < 40; i++) { ts += 17; G.frame(ts); }
    // 造一点「玩过」的痕迹
    G.player.hp = 4; G.player.maxHP = 8;
    G.player.mp = 88; G.player.maxMP = 120;
    G.coins = 37; G.keys = 2; G.bombs = 1; G.kills = 9; G.time = 1234;
    G.player.give('qingfeng', G);
    G.player.give('qingfeng', G);     // 重复即进阶，用来验证阶数也能还原
    G.player.give('hunyuan', G);
    G.player.slots[0] = { id: 'tianlei', lv: 2 };
    G.player.giveUlt('wujian');
    G.player.ult.paths = { power: 2 };
    G.saveGame();
    return Object.assign(eval(snapSrc), { __autoSavedOnNewRun: autoSavedOnNewRun });
  }, SNAP);
  const rawLen = await p1.evaluate(() => (localStorage.getItem('xiuxian-isaac.save.v1') || '').length);
  await p1.close();                    // 关掉网页

  /* ---------- 第二次打开：续档 ---------- */
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => errs.push('[p2] ' + e.message));
  await p2.goto(FILE);
  await p2.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p2.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await p2.waitForTimeout(300);

  const hasSave = await p2.evaluate(() => window.Game.hasSave());
  const tipShown = await p2.evaluate(() => {
    updateOverlay();
    const el = document.getElementById('saveTip');
    return el ? getComputedStyle(el).display : null;
  });
  const after = await p2.evaluate((snapSrc) => {
    const G = window.Game;
    const ok = G.continueGame();
    return Object.assign(eval(snapSrc), { __continued: ok });
  }, SNAP);

  /* ---------- 死亡销档 ---------- */
  const clearedAfterDeath = await p2.evaluate(() => {
    const G = window.Game;
    G.player.invuln = 0;             // 进房会给 30 帧无敌，不清掉这一步 takeDamage 会直接 return
    G.player.hp = 1;
    G.player.takeDamage(99, G, 0, 0);
    return { state: G.state, hasSave: G.hasSave(), dead: !!G.player.dead };
  });

  /* ---------- 结果 ---------- */
  const cmp = [
    ['state', before.state, after.state],
    ['style', before.style, after.style],
    ['depth', before.depth, after.depth],
    ['seed', before.seed, after.seed],
    ['hp / maxHP', before.hp + '/' + before.maxHP, after.hp + '/' + after.maxHP],
    ['mp / maxMP', before.mp + '/' + before.maxMP, after.mp + '/' + after.maxMP],
    ['coins / keys / bombs', before.coins + '/' + before.keys + '/' + before.bombs, after.coins + '/' + after.keys + '/' + after.bombs],
    ['kills / time', before.kills + '/' + before.time, after.kills + '/' + after.time],
    ['items', JSON.stringify(before.items), JSON.stringify(after.items)],
    ['slots', JSON.stringify(before.slots), JSON.stringify(after.slots)],
    ['ult', before.ult, after.ult],
    ['stats.damage', before.stats.damage, after.stats.damage],
    ['roomKey', before.roomKey, after.roomKey],
    ['房间总数', before.roomCount, after.roomCount],
    ['已清房间', before.clearedCount, after.clearedCount],
    ['已访问房间', before.visitedCount, after.visitedCount]
  ];

  console.log('================ 存档探针 ================');
  console.log('存档体积            : ' + rawLen + ' 字节');
  console.log('开局自动存档        : ' + before.__autoSavedOnNewRun + (before.__autoSavedOnNewRun ? '  ✓ 进第一间房就写档了' : '  ✗ 没写'));
  console.log('重开后 hasSave()    : ' + hasSave);
  console.log('标题界面续档入口    : display = ' + tipShown + (tipShown === 'block' ? '  ✓ 已挂出' : '  ✗ 没显示'));
  console.log('continueGame()      : ' + after.__continued);
  console.log();
  console.log('字段                   存前                 读后                 结果');
  let bad = 0;
  for (const [k, a, b] of cmp) {
    const same = String(a) === String(b);
    if (!same) bad++;
    console.log('  ' + k.padEnd(20) + String(a).padEnd(20) + String(b).padEnd(20) + (same ? '✓' : '✗ 不一致'));
  }
  console.log();
  console.log('死亡后（应销档）    : state=' + clearedAfterDeath.state + '  hasSave=' + clearedAfterDeath.hasSave +
    (clearedAfterDeath.hasSave === false ? '  ✓ 已销' : '  ✗ 还在'));
  console.log('敌人已按波次重排    : ' + after.enemies + ' 只（存档只存种子，敌人由 waves 重建）');
  console.log('页面错误            : ' + (errs.length ? errs.join(' | ') : '无'));
  console.log();
  console.log(bad === 0 ? '全部字段一致 ✅' : (bad + ' 个字段不一致 ❌'));

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
