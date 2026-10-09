'use strict';
/* 复现「第十层黑屏」：用户 2026-10-09 打到第 10 层（北欧二段 · 巨人之厅）时画面全黑，
   连 HUD 都没了。黑屏通常 = draw() 抛异常（canvas 清过一次之后什么都没画）。
   这个探针跑完整路径（换层 → 进 Boss 房 → 打 Boss），把异常堆栈抓出来。 */
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage();
  const pageErrs = [];
  p.on('pageerror', e => pageErrs.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '')));
  p.on('console', m => { if (m.type() === 'error') pageErrs.push('CONSOLE: ' + m.text()); });
  await p.goto(FILE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const r = await p.evaluate(() => {
    const G = window.Game;
    const out = { steps: [] };

    const tryRun = (label, fn) => {
      try { fn(); out.steps.push(label + ' OK'); }
      catch (e) { out.steps.push(label + ' ❌ ' + e.message); out.crash = label + ': ' + e.message + '\n' + (e.stack || ''); }
    };

    /* ---- 用户画像是舞剑流、第 10 层、北欧二段 ---- */
    tryRun('newRun(wujian)', () => G.newRun('wujian'));
    tryRun('stylePath cn/nordic/nordic seg=1', () => {
      G.stylePath = ['cn', 'nordic', 'nordic'];
      G.seg = 1;
      G.applySegmentPalette();
    });

    /* ---- 路径 A：直接 newFloor(10) ---- */
    tryRun('newFloor(10)', () => G.newFloor(10));
    tryRun('state=play', () => { G.state = 'play'; });
    tryRun('draw@10层', () => G.draw());
    tryRun('update x60 @10层', () => { for (let i = 0; i < 60; i++) { G.update(); G.draw(); } });

    out.floor10 = { rooms: G.floor ? G.floor.rooms.size : -1, hasBossRoom: G.floor ? [...G.floor.rooms.values()].some(x => x.type === RT.BOSS) : false };
    if (out.crash) return out;

    /* ---- 路径 B：进 Boss 房 + 打 Boss ---- */
    const bossRoom = [...G.floor.rooms.values()].find(x => x.type === RT.BOSS);
    out.bossRoom = !!bossRoom;
    if (bossRoom) {
      tryRun('enterRoom(bossRoom)', () => G.enterRoom(bossRoom, null));
      tryRun('draw@Boss房', () => G.draw());
      tryRun('update x120 @Boss房', () => { for (let i = 0; i < 120; i++) { G.update(); G.draw(); } });
      out.boss = G.bossRef ? { id: G.bossRef.id || G.bossRef.name, hp: G.bossRef.hp, phase: G.bossRef.phase } : null;
    }
    if (out.crash) return out;

    /* ---- 路径 C：从第 9 层正常换层到第 10 层（走 portal，最贴近玩家路径）---- */
    tryRun('回到第9层', () => { G.newFloor(9); G.state = 'play'; });
    tryRun('第9层跑 90 帧', () => { for (let i = 0; i < 90; i++) { G.update(); G.draw(); } });
    tryRun('清完普通房', () => {
      for (const room of [...G.floor.rooms.values()].filter(x => x.type === RT.NORMAL)) {
        G.enterRoom(room, null);
        for (let f = 0; f < 16; f++) { G.enemies.length = 0; G.update(); G.draw(); }
      }
    });
    out.portal9 = G.props.filter(x => x.kind === 'portal').length;
    tryRun('踩传送阵 → 第10层', () => {
      const pr = G.props.filter(x => x.kind === 'portal')[0];
      if (!pr) throw new Error('第9层没有传送阵');
      G.player.x = pr.x; G.player.y = pr.y; pr.delay = 0;
      for (let f = 0; f < 10; f++) { G.update(); G.draw(); }
    });
    out.afterPortal = { depth: G.depth, state: G.state };
    tryRun('第10层跑 120 帧', () => { for (let i = 0; i < 120; i++) { G.update(); G.draw(); } });

    return out;
  });

  console.log('--- 步骤 ---');
  r.steps.forEach(s => console.log('  ' + s));
  console.log('\n--- 状态 ---');
  console.log('  第10层房间数 ' + (r.floor10 ? r.floor10.rooms : '?') + '，有 Boss 房: ' + (r.floor10 ? r.floor10.hasBossRoom : '?'));
  if (r.boss) console.log('  Boss: ' + JSON.stringify(r.boss));
  if (r.portal9 !== undefined) console.log('  第9层传送阵 ' + r.portal9 + ' 个，踩完到第 ' + (r.afterPortal ? r.afterPortal.depth : '?') + ' 层（state=' + (r.afterPortal ? r.afterPortal.state : '?') + '）');
  if (r.crash) {
    console.log('\n❌ 崩溃点：\n' + r.crash.split('\n').slice(0, 12).join('\n'));
  } else {
    console.log('\n✅ 全路径没崩');
  }
  if (pageErrs.length) {
    console.log('\n--- 页面错误 (' + pageErrs.length + ') ---');
    pageErrs.slice(0, 5).forEach(e => console.log('  ' + e.split('\n').slice(0, 6).join('\n  ')));
  } else {
    console.log('\n（无页面级错误）');
  }
  await b.close();
})();
