'use strict';
/* 出生保护 —— 自动化测试
 * 1) 进房 / 第二波刷新时，妖物不得与玩家重合（安全距离）
 * 2) 凝形期不造成接触伤害，凝形结束后恢复
 */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const SAFE_MIN = 74;          // 断言用：推开后仍应远大于「贴脸」距离（接触约 22）

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

  sec('T1  进房落点：妖物不得与玩家重合');
  const enter = await page.evaluate(SAFE => {
    let worst = 1e9, worstInfo = null, rooms = 0, enemies = 0;
    let rawOverlap = 0, rawTotal = 0;         // 若不做避让，会有多少贴脸生成
    for (let seed = 0; seed < 6; seed++) {
      window.Game.newRun('feijian');
      const G = window.Game;
      for (const rr of G.floor.rooms.values()) {
        if (!rr.waves || !rr.waves.length) continue;
        rooms++;
        G.enterRoom(rr, null);
        const p = G.player;
        // 原始生成点（未避让）与玩家落点的距离分布
        for (const s of rr.waves[0]) {
          rawTotal++;
          if (Math.hypot(s.x - p.x, s.y - p.y) < 40) rawOverlap++;
        }
        for (const e of G.enemies) {
          enemies++;
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d < worst) { worst = d; worstInfo = { d: +d.toFixed(1), type: rr.type, px: Math.round(p.x), py: Math.round(p.y) }; }
        }
      }
    }
    return { worst: +worst.toFixed(1), worstInfo, rooms, enemies, rawOverlap, rawTotal };
  }, SAFE_MIN);
  console.log('  参考：若不避让，' + enter.rawOverlap + '/' + enter.rawTotal + ' 个生成点距玩家 < 40px（贴脸）');
  ok('遍历房间数足够', enter.rooms >= 40, 'rooms=' + enter.rooms + ' enemies=' + enter.enemies);
  ok('进房时最小间距达标', enter.worst >= SAFE_MIN,
    '最小 ' + enter.worst + 'px（阈值 ' + SAFE_MIN + '）' + JSON.stringify(enter.worstInfo));

  sec('T2  第二波刷新：妖物不得刷在玩家脚下');
  const wave2 = await page.evaluate(SAFE => {
    let worst = 1e9, cases = 0, rawWorst = 1e9;
    for (let seed = 0; seed < 10; seed++) {
      window.Game.newRun('jujian');
      const G = window.Game;
      for (const rr of G.floor.rooms.values()) {
        if (!rr.waves || rr.waves.length < 2) continue;
        G.enterRoom(rr, null);
        const w1 = rr.waves[1];
        // 把玩家挪到第二波「原定生成点」上，制造最坏情况
        const s = w1.find(v => v.type !== 'boss') || w1[0];
        G.player.x = s.x; G.player.y = s.y; G.player.vx = G.player.vy = 0;
        G.enemies.length = 0;                 // 清掉第一波 → 触发第二波
        G.update();
        if (!G.enemies.length) continue;
        cases++;
        const p = G.player;
        for (const e of G.enemies) {
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d < worst) worst = d;
        }
        rawWorst = Math.min(rawWorst, Math.hypot(s.x - p.x, s.y - p.y));
      }
    }
    return { worst: +worst.toFixed(1), cases, rawWorst: +rawWorst.toFixed(1) };
  }, SAFE_MIN);
  ok('构造出足够多的第二波场景', wave2.cases >= 8, 'cases=' + wave2.cases);
  ok('玩家站在生成点上仍被推开', wave2.worst >= SAFE_MIN,
    '最小 ' + wave2.worst + 'px（未避让时 ' + wave2.rawWorst + 'px）');

  sec('T3  凝形期不伤人，成形后恢复正常');
  const grace = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    let target = null;
    for (const rr of G.floor.rooms.values()) if (rr.waves && rr.waves.length) { target = rr; break; }
    G.enterRoom(target, null);
    const protoE = G.enemies[0] ? Object.getPrototypeOf(G.enemies[0]).constructor : null;
    if (!protoE) return null;

    const setup = () => {
      G.enemies.length = 0; G.bullets.length = 0; G.hazards.length = 0;
      G.room.cleared = true;
      const p = G.player;
      p.x = 240; p.y = 150; p.vx = p.vy = 0; p.invuln = 0; p.shield = 0; p.hp = p.maxHP;
      const e = new protoE('xiesui', p.x, p.y, 1);   // 强制重合
      G.enemies.push(e);
      return { p, e };
    };

    // —— 凝形中：贴脸也不该掉血
    let { p, e } = setup();
    const grace0 = e.spawnT;
    G.update();
    const hpGrace = p.hp, maxHp = p.maxHP;

    // —— 凝形结束：应立刻能造成伤害
    setup();
    const e2 = G.enemies[0], p2 = G.player;
    e2.spawnT = 1;
    G.update();                  // spawnT → 0，同帧即恢复接触判定
    const hpAfter = p2.hp;

    // —— 凝形期不开火
    setup();
    const e3 = G.enemies[0];
    const cd0 = e3.cd;
    let fired = 0;
    for (let i = 0; i < 30; i++) { G.update(); fired += G.bullets.filter(b => !b.friendly).length; }

    return { grace0, hpGrace, maxHp, hpAfter, cd0, fired, spawnT_now: G.enemies[0] ? G.enemies[0].spawnT : -1 };
  });
  if (grace) {
    ok('妖物出生即带凝形倒计时', grace.grace0 > 0, 'spawnT=' + grace.grace0);
    ok('凝形期贴脸不扣血', grace.hpGrace === grace.maxHp, `hp ${grace.hpGrace}/${grace.maxHp}`);
    ok('凝形结束后可正常扣血', grace.hpAfter < grace.maxHp, `hp ${grace.hpAfter}/${grace.maxHp}`);
    ok('凝形期不主动出手', grace.cd0 > grace.grace0, `cd=${grace.cd0} > grace=${grace.grace0}, 30帧内弹幕=${grace.fired}`);
  } else {
    ok('凝形测试（未构造出敌人）', false);
  }

  sec('T4  完整流程回归（两流派各推 5 层，含绘制）');
  for (const style of ['feijian', 'jujian']) {
    const r = await page.evaluate(st => {
      const G = window.Game;
      let bad = null, frames = 0, maxDepth = 1, spawnHits = 0;
      try {
        G.newRun(st);
        const inp = window.input || (window.input = {});
        for (let i = 0; i < 5000; i++) {
          // 随机移动 + 射击
          if (window.input) {
            window.input.up = Math.random() < 0.25;
            window.input.down = Math.random() < 0.25;
            window.input.left = Math.random() < 0.25;
            window.input.right = Math.random() < 0.25;
            window.input.keyShoot = Math.random() < 0.5;
            window.input.keyAngle = Math.random() * Math.PI * 2;
            window.input.mouseDown = false;
          }
          // 推进楼层：先尝试走传送阵，走不动就直接下层，保证覆盖到第 5 层与 Boss
          if (i % 90 === 0) G.enemies.length = 0;
          if (i > 0 && i % 700 === 0 && G.depth < 5 && G.state === 'play') G.nextFloor();
          if (G.room && G.room.cleared) {
            const pt = G.props.find(v => v.kind === 'portal');
            if (pt) { G.player.x = pt.x; G.player.y = pt.y; }
          }
          G.update(); frames++;
          if (i % 5 === 0) G.draw();
          maxDepth = Math.max(maxDepth, G.depth);
          if (G.state === 'win' || G.state === 'dead') break;
        }
      } catch (e) { bad = e.message; }
      return { bad, frames, maxDepth, spawnHits, state: G.state };
    }, style);
    ok(`${style} 流程无异常`, r.bad === null, r.bad || `${r.frames} 帧 / 最深 ${r.maxDepth} 层 / state=${r.state}`);
    ok(`${style} 可推进到第 5 层`, r.maxDepth >= 5 || r.state === 'win', 'maxDepth=' + r.maxDepth + ' state=' + r.state);
  }

  sec('T5  运行期无报错');
  ok('无 pageerror / console.error', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\n──────────────────────────────');
  console.log(`  通过 ${pass} / ${pass + fail}`);
  if (fail) { console.log('  失败项：'); failed.forEach(f => console.log('   - ' + f)); }
  else console.log('  全部通过 ✅');
  console.log('──────────────────────────────');
  // browser.close() 在本机常挂死，限时收尾即可
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
