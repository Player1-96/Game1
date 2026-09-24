'use strict';
/* ═══════════════════════════════════════════════════════════════
 *  _t_progress.js —— 「一局能不能真的走完」回归
 *
 *  为什么要有这一套：2026-09-24 用户试玩第一把就撞上**死局** ——
 *  第 1 层打完了，没有任何办法去第 2 层。
 *
 *  根因：第 2 期把 Boss 改成「按段分配」（只在第 5 / 10 / 15 层），
 *  但下层的传送阵**仍然只挂在 `onBossDead()` 上** ——
 *  于是第 1~4、6~9、11~14 这 12 层一个出口都没有。
 *
 *  ⚠️ 当时 17 套回归全绿。原因是**没有一套测过「玩家从 1 层走到 2 层」这条链路**：
 *     所有测试要么直接 `newFloor(depth)`，要么只验单间房的行为。
 *     断言能验「值对不对」，验不了「路通不通」—— 这一类必须专门测。
 *
 *  本套只验一件事：**每一层都有出口，且能一路走到通关。**
 * ═══════════════════════════════════════════════════════════════ */
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console.error] ' + m.text()); });

  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(250);

  /* 在页面里装一套「模拟玩家」的 helper —— 后面每个用例都用它 */
  await page.evaluate(() => {
    window.SIM = {
      /* 清掉当前房间：必须**每帧**清空 enemies。
         房间可能有多波，update 里「清完一波 → 刷下一波」，
         只在进房时清一次的话，第二波的怪会一直站着，房间永远清不掉。 */
      clearRoom(frames) {
        const G = window.Game;
        for (let f = 0; f < (frames || 14); f++) { G.enemies.length = 0; G.update(); }
      },
      /* 打死 Boss：必须走完整死亡流程（hurt → dead → 移出 enemies）。
         ⚠️ 不能手动 `hp = 0; onBossDead()` —— `checkDoors()` 开头有
         `if (this.enemies.length > 0) return`，Boss 还站在场上就永远踩不了传送阵。 */
      killBoss() {
        const G = window.Game;
        for (let f = 0; f < 10; f++) { if (G.bossRef) break; G.update(); }
        if (!G.bossRef) return false;
        G.bossRef.invuln = 0;
        G.bossRef.hurt(999999, G);
        for (let f = 0; f < 30; f++) G.update();
        return true;
      },
      portal() { return window.Game.props.filter(pr => pr.kind === 'portal'); },
      /* 走完一层：清所有战斗房（Boss 层还要斩 Boss），返回本层拿到的传送阵数 */
      runFloor(depth) {
        const G = window.Game;
        G.newFloor(depth);
        G.player.invuln = 999999;
        for (const room of [...G.floor.rooms.values()].filter(x => x.type === RT.NORMAL)) {
          G.enterRoom(room, null);
          this.clearRoom();
        }
        if ([...G.floor.rooms.values()].some(x => x.type === RT.BOSS)) {
          const br = [...G.floor.rooms.values()].find(x => x.type === RT.BOSS);
          G.enterRoom(br, null);
          this.killBoss();
        }
        return this.portal().length;
      },
      /* 踩上传送阵，返回是否真的下了层 */
      step() {
        const G = window.Game;
        const pr = this.portal()[0];
        if (!pr) return false;
        const d0 = G.depth;
        G.player.x = pr.x; G.player.y = pr.y; pr.delay = 0;
        for (let f = 0; f < 6; f++) G.update();
        /* 段间会弹「择风格」面板 —— 替玩家确认默认项 */
        if (G.state === 'stylePick') { G.styleMenuConfirm(); G.newFloor(G.depth); }
        return G.depth !== d0;
      }
    };
  });

  console.log('══════════════════════════════════════════════════');
  console.log('  进程推进 · 每层都有出口 · 能走到通关');
  console.log('══════════════════════════════════════════════════');

  /* ---------------------------------------------------------------
   *  T1 每一层都有出口（这是死局本尊）
   * ------------------------------------------------------------- */
  sec('T1  15 层每一层都拿得到传送阵');
  const t1 = await page.evaluate(() => {
    const G = window.Game;
    const bad = [];
    for (let d = 1; d <= STYLE_SYS.totalFloors; d++) {
      G.newRun('feijian');
      G.stylePath = ['cn', 'cn', 'cn'];
      G.seg = segOfFloor(d); G.applySegmentPalette();
      const n = window.SIM.runFloor(d);
      if (n < 1) bad.push('第' + d + '层');
    }
    return { bad: bad, total: STYLE_SYS.totalFloors };
  });
  ok('★ 15 层每层都能开出传送阵（少一层就是死局）', t1.bad.length === 0,
    t1.bad.length ? '无出口：' + t1.bad.join('、') : t1.total + '/' + t1.total + ' 层全通');

  /* ---------------------------------------------------------------
   *  T2 段末层不许绕过 Boss
   * ------------------------------------------------------------- */
  sec('T2  段末层：清完杂兵房也不能绕开 Boss');
  const t2 = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    G.stylePath = ['cn', 'cn', 'cn']; G.seg = 0; G.applySegmentPalette();
    G.newFloor(SEG_FLOORS);                       // 段末层（第 5 层）
    G.player.invuln = 999999;
    for (const room of [...G.floor.rooms.values()].filter(x => x.type === RT.NORMAL)) {
      G.enterRoom(room, null);
      window.SIM.clearRoom();
    }
    const beforeBoss = window.SIM.portal().length;
    /* 现在去斩 Boss，斩完该有传送阵 */
    const br = [...G.floor.rooms.values()].find(x => x.type === RT.BOSS);
    G.enterRoom(br, null);
    const killed = window.SIM.killBoss();
    return { beforeBoss: beforeBoss, killed: killed, after: window.SIM.portal().length };
  });
  ok('清完杂兵房、Boss 未死时**不**出传送阵', t2.beforeBoss === 0, 'portal=' + t2.beforeBoss);
  ok('斩了 Boss 才出传送阵', t2.killed === true && t2.after === 1,
    'killed=' + t2.killed + ' portal=' + t2.after);

  /* ---------------------------------------------------------------
   *  T3 端到端：从 1 层走到通关
   * ------------------------------------------------------------- */
  sec('T3  端到端：一局走到通关');
  const t3 = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    G.stylePath = ['cn', 'cn', 'cn']; G.seg = 0; G.applySegmentPalette();
    const trace = [];
    let guard = 0;
    while (G.state === 'play' && guard++ < 60) {
      const d = G.depth;
      const n = window.SIM.runFloor(d);
      if (!n) { trace.push('第' + d + '层无出口'); break; }
      if (!window.SIM.step()) { trace.push('第' + d + '层踩了没下层'); break; }
      trace.push(d + '→' + G.depth);
      if (G.state === 'win') break;
    }
    return { trace: trace, state: G.state, depth: G.depth, msg: G.msg || '' };
  });
  console.log('     轨迹：' + t3.trace.join(' '));
  ok('★ 能一路走到通关（state = win）', t3.state === 'win', t3.state);
  ok('通关文案带出走过的路径', t3.msg.indexOf('历尽') >= 0 && t3.msg.indexOf('中式') >= 0, t3.msg);

  /* ---------------------------------------------------------------
   *  T4 北欧路径同样走得完（新内容最容易漏）
   * ------------------------------------------------------------- */
  sec('T4  北欧路径：8 杂兵 + 3 尊者也能走完');
  const t4 = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    G.stylePath = ['nordic', 'nordic', 'nordic']; G.seg = 0; G.applySegmentPalette();
    const bosses = [];
    let guard = 0;
    while (G.state === 'play' && guard++ < 60) {
      const d = G.depth;
      const n = window.SIM.runFloor(d);
      if (!n) { bosses.push('第' + d + '层无出口'); break; }
      if ([...G.floor.rooms.values()].some(x => x.type === RT.BOSS)) bosses.push('第' + d + '层有尊者');
      if (!window.SIM.step()) { bosses.push('第' + d + '层踩了没下层'); break; }
      if (G.state === 'win') break;
    }
    return { state: G.state, bosses: bosses, msg: G.msg || '' };
  });
  console.log('     ' + t4.bosses.join('　'));
  ok('★ 北欧局也能走到通关', t4.state === 'win', t4.state);
  ok('北欧局段末三尊都登场（第 5 / 10 / 15 层）', t4.bosses.length === 3, t4.bosses.join(' '));
  ok('通关文案记的是北欧', t4.msg.indexOf('北欧') >= 0, t4.msg);

  /* ---------------------------------------------------------------
   *  T5 全局错误
   * ------------------------------------------------------------- */
  sec('T5  运行期无报错');
  ok('全程无 pageerror / console.error', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\n========================================');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  if (fail) console.log('失败项: ' + failed.join('；'));

  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
