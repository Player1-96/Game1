'use strict';
/* 探针：一局能不能真的从 1 层走到 15 层通关？
   2026-09-24 这个探针是为「第 1 层没有出口」那个死局写的 ——
   17 套回归全绿、但游戏根本不能玩，就是因为没人测过这条链路。 */
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(FILE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const r = await p.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    G.stylePath = ['cn']; G.seg = 0; G.applySegmentPalette();
    G.player.god = true;
    const log = [];
    let guard = 0;
    while (G.depth <= STYLE_SYS.totalFloors && guard++ < 200) {
      const depth0 = G.depth;
      /* 段间会弹「择风格」面板 —— 替玩家确认 */
      if (G.state === 'stylePick') { G.styleMenuConfirm(); continue; }
      G.newFloor(depth0);
      G.player.invuln = 999999;
      /* 逐间房：进去 → 把怪清空 → update 触发清房 */
      /* 只清战斗房 —— 真实玩法就是这样：坊市/藏珍阁是可选的，清完普通房就该能走。
         传送阵开在「最后清完的那间」，玩家此刻正站在里面，所以遍历到此为止。 */
      for (const room of [...G.floor.rooms.values()].filter(x => x.type === RT.NORMAL)) {
        G.enterRoom(room, null);
        /* ⚠️ 必须**每帧**清空：房间可能有多波，update 里「清完一波 → 刷下一波」，
           只在进房时清一次的话，第二波的怪会一直站在那里，房间永远清不掉。 */
        for (let f = 0; f < 14; f++) { G.enemies.length = 0; G.update(); }
        if (G.state === 'stylePick') G.styleMenuConfirm();
      }
      /* Boss 层：怪清不掉（Boss 房是 RT.BOSS），手动把 Boss 打死 */
      const bossRoom = [...G.floor.rooms.values()].find(x => x.type === RT.BOSS);
      if (bossRoom) {
        G.enterRoom(bossRoom, null);
        for (let f = 0; f < 5; f++) G.update();
        /* ⚠️ 必须走**完整死亡流程**（hurt → dead → 被移出 enemies），
           不能手动 `hp=0; onBossDead()` —— `checkDoors()` 开头有
           `if (this.enemies.length > 0) return`，Boss 还站在场上就永远踩不了传送阵。 */
        if (G.bossRef) { G.bossRef.invuln = 0; G.bossRef.hurt(999999, G); }
        for (let f = 0; f < 30; f++) G.update();
      }
      const portal = G.props.filter(pr => pr.kind === 'portal');
      if (!portal.length) {
        log.push({ 层: depth0, 结果: '❌ 无传送阵，卡死' });
        break;
      }
      /* 踩上去 */
      const pr = portal[0];
      G.player.x = pr.x; G.player.y = pr.y;
      pr.delay = 0;
      for (let f = 0; f < 3; f++) G.update();
      log.push({ 层: depth0, 传送阵: portal.length, 到: G.depth, state: G.state });
      if (G.depth === depth0) { log.push({ 层: depth0, 结果: '❌ 踩了没下层' }); break; }
      if (G.state === 'win') break;
    }
    return { 日志: log, 最终层: G.depth, 状态: G.state, 通关文案: G.msg || '' };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
