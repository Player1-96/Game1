/* ============================================================
 *  _probe_taixu.js —— 太虚护盾「受创后补回」机制逐帧实测
 *
 *  要验的六件事：
 *    1. 到手 / 升阶即补满
 *    2. 没受过伤就一格都不给（计时未启动）
 *    3. 受创后数够 N 帧补回一格，且补完接着数下一格
 *    4. 到上限就停，不会溢出
 *    5. 受创会重置计时（差一点就补上时被打断）
 *    6. 清房后不回盾（「还有敌人」这个前置条件真的生效）
 *  外加：被盾挡下也算受创、无敌帧内挨打不算、没这件法宝时整条逻辑不跑。
 *
 *  跑法：node dev/probe/_probe_taixu.js
 * ============================================================ */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(150);

  const r = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    G.newRun('feijian');
    G.state = 'play';
    const p = G.player;

    // 清场，放一只「不动、不还手、打不死」的靶子 —— 只用来满足「房内还有敌人」
    const stage = () => {
      G.enemies.length = 0; G.bullets.length = 0; G.hazards.length = 0;
      const e = new Enemy('xiesui', 430, 60, 1);
      e.spawnT = 0; e.maxHp = 99999; e.hp = 99999;
      e.speed = 0; e.cd = 999999; e.touch = 0;
      G.enemies.push(e);
      return e;
    };
    const run = n => { for (let i = 0; i < n; i++) { p.invuln = Math.max(p.invuln, 1); G.update(); } };
    stage();

    /* ---------- 1. 到手即补满 ---------- */
    p.shield = 0; p.tShield = 0;
    p.give('taixu', G);
    out.onGet = { shield: p.shield, cap: p.shieldCap, gap: p.shieldGap, timer: p.shieldReviveT };

    /* ---------- 2. 没受过伤：不给盾 ---------- */
    for (let i = 0; i < 900; i++) { p.invuln = 999999; G.update(); }   // 15 秒
    out.noHurt = { shield: p.shield, timer: p.shieldReviveT };

    /* ---------- 3. 受创 → 数够 N 帧补回一格 ---------- */
    p.shield = 0;                                  // 把盾打空，好观察补回
    p.invuln = 0;
    p.takeDamage(1, G);                            // 这一下没有盾了，真扣血
    out.afterHurt = { shield: p.shield, timer: p.shieldReviveT, hp: p.hp };
    run(p.shieldGap - 1);
    out.beforeTick = { shield: p.shield, timer: p.shieldReviveT };
    p.invuln = 999999; G.update();
    out.atTick = { shield: p.shield, timer: p.shieldReviveT };

    /* ---------- 4. 连续数第二个：到上限就停 ---------- */
    run(p.shieldGap * 2);                          // 足够补满还有富余
    out.afterLong = { shield: p.shield, timer: p.shieldReviveT, cap: p.shieldCap };

    /* ---------- 5. 受创重置计时 ---------- */
    p.shield = 0; p.shieldReviveT = -1;
    p.invuln = 0; p.takeDamage(1, G);
    run(p.shieldGap - 30);                         // 差 30 帧就补上
    const nearly = p.shieldReviveT;
    p.invuln = 0; p.takeDamage(1, G);              // 挨一下
    out.resetOnHurt = { before: nearly, after: p.shieldReviveT, shield: p.shield };
    run(p.shieldGap);                              // 重新数满一格（计时从 0 起，要满 N 帧）
    out.afterResetOneMore = p.shield;

    /* ---------- 6. 清房后不回盾 ---------- */
    p.shield = 0; p.shieldReviveT = -1;
    p.invuln = 0; p.takeDamage(1, G);              // 启动计时
    G.enemies.length = 0;                          // 清房
    run(1200);                                     // 20 秒
    out.emptyRoom = { shield: p.shield, timer: p.shieldReviveT };
    stage();                                       // 换个房（重新有敌人）
    run(p.shieldGap);
    out.roomWithFoes = { shield: p.shield, timer: p.shieldReviveT };

    /* ---------- 7. 被盾挡下也算受创 ---------- */
    p.shield = 2; p.shieldReviveT = -1;
    p.invuln = 0;
    p.takeDamage(1, G);                            // 被盾吃掉（shield 2 → 1）
    out.blockedCounts = { shield: p.shield, timer: p.shieldReviveT };

    /* ---------- 8. 无敌帧内挨打不算受创 ---------- */
    p.shieldReviveT = 100;
    p.invuln = 60;
    p.takeDamage(1, G);
    out.invulnIgnored = p.shieldReviveT;           // 应仍是 100

    /* ---------- 9. 三阶的上限与间隔 ---------- */
    p.items.length = 0;
    p.shieldCap = 0; p.shieldGap = 0; p.shieldReviveT = -1; p.shield = 0;
    const tiers = [];
    for (let i = 0; i < 3; i++) {
      p.give('taixu', G);
      tiers.push({ n: i + 1, cap: p.shieldCap, gap: p.shieldGap, gapSec: +(p.shieldGap / 60).toFixed(1), shield: p.shield });
    }
    out.tiers = tiers;

    /* ---------- 10. 没有这件法宝时整条逻辑不跑 ---------- */
    p.items.length = 0;
    p.shieldCap = 0; p.shieldGap = 0; p.shieldReviveT = -1; p.shield = 0;
    p.invuln = 0; p.takeDamage(1, G);
    run(1200);
    out.noItem = { shield: p.shield, timer: p.shieldReviveT, cap: p.shieldCap };

    return out;
  });

  const ok = (b) => b ? '✓' : '✗';

  console.log('=== 1  到手即补满 ===');
  console.log('  give 后   护盾 %d / 上限 %d / 间隔 %d 帧 / 计时 %d（-1 = 未启动）  %s',
    r.onGet.shield, r.onGet.cap, r.onGet.gap, r.onGet.timer,
    ok(r.onGet.shield === r.onGet.cap && r.onGet.timer === -1));
  console.log('');

  console.log('=== 2  没受过伤 → 一格都不给（15 秒空跑）===');
  console.log('  护盾 %d（应仍为 %d）/ 计时 %d  %s',
    r.noHurt.shield, r.onGet.cap, r.noHurt.timer, ok(r.noHurt.shield === r.onGet.cap));
  console.log('');

  console.log('=== 3  受创后数够 N 帧补回一格 ===');
  console.log('  挨打瞬间   护盾 %d / 计时 %d（已启动）', r.afterHurt.shield, r.afterHurt.timer);
  console.log('  差 1 帧时  护盾 %d / 计时 %d', r.beforeTick.shield, r.beforeTick.timer);
  console.log('  数满那一帧 护盾 %d / 计时 %d  %s',
    r.atTick.shield, r.atTick.timer,
    ok(r.beforeTick.shield === 0 && r.atTick.shield === 1 && r.atTick.timer === 0));
  console.log('');

  console.log('=== 4  连数到上限就停 ===');
  console.log('  再跑 %d 帧后 护盾 %d / 上限 %d  %s',
    r.onGet.gap * 2, r.afterLong.shield, r.afterLong.cap,
    ok(r.afterLong.shield === r.afterLong.cap));
  console.log('');

  console.log('=== 5  受创会重置计时 ===');
  console.log('  差 30 帧时被再打一下：计时 %d → %d，护盾 %d  %s',
    r.resetOnHurt.before, r.resetOnHurt.after, r.resetOnHurt.shield,
    ok(r.resetOnHurt.before >= r.onGet.gap - 40 && r.resetOnHurt.after === 0 && r.resetOnHurt.shield === 0));
  console.log('  重置后再数满一格 → 护盾 %d  %s', r.afterResetOneMore, ok(r.afterResetOneMore === 1));
  console.log('');

  console.log('=== 6  清房后不回盾（「还有敌人」前置条件）===');
  console.log('  空房跑 20 秒  护盾 %d / 计时 %d  %s（计时不该推进）',
    r.emptyRoom.shield, r.emptyRoom.timer, ok(r.emptyRoom.shield === 0 && r.emptyRoom.timer === 0));
  console.log('  有敌人的房跑满一格 → 护盾 %d  %s', r.roomWithFoes.shield, ok(r.roomWithFoes.shield === 1));
  console.log('');

  console.log('=== 7~8  受创的判定边界 ===');
  console.log('  被盾挡下也算受创：护盾 2 → %d，计时归零 %s',
    r.blockedCounts.shield, ok(r.blockedCounts.shield === 1 && r.blockedCounts.timer === 0));
  console.log('  无敌帧内挨打不算：计时仍为 %d  %s', r.invulnIgnored, ok(r.invulnIgnored === 100));
  console.log('');

  console.log('=== 9  三阶的上限与间隔 ===');
  r.tiers.forEach(t => console.log('  第 %d 件（%d 重）：上限 %d 格　间隔 %d 帧（%s 秒）　到手护盾 %d',
    t.n, t.n, t.cap, t.gap, t.gapSec, t.shield));
  const tOk = r.tiers[0].cap === 2 && r.tiers[1].cap === 3 && r.tiers[2].cap === 4
    && r.tiers[0].gap > r.tiers[1].gap && r.tiers[1].gap > r.tiers[2].gap
    && r.tiers.every(t => t.shield === t.cap);
  console.log('  判定：上限递增且间隔递减、每次到手即满  %s', ok(tOk));
  console.log('');

  console.log('=== 10  没有这件法宝 ===');
  console.log('  跑 20 秒  护盾 %d / 计时 %d / 上限 %d  %s',
    r.noItem.shield, r.noItem.timer, r.noItem.cap,
    ok(r.noItem.cap === 0 && r.noItem.shield === 0 && r.noItem.timer === -1));
  console.log('');

  console.log('=== 运行期报错 ===');
  console.log('  ' + (errs.length ? errs.join('\n  ') : '无 ✓'));

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 2000))]);
  process.exit(0);
})();
