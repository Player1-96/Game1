'use strict';
/* 探针：融合阵到底什么时候被「用掉」？
   用户 2026-09-30 报：走进去选了材料但没真融，退出后阵就失效了。 */
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
    G.newRun('feijian'); G.state = 'play';
    const pl = G.player;
    /* 凑一对可融的：青锋剑 + 引雷符 → 雷殛剑 */
    pl.give('qingfeng', G); pl.give('leifu', G); G.itemPopup = null;
    /* 在当前房间塞一座融合阵 */
    const fr = G.floor.rooms.get(G.room.key) || [...G.floor.rooms.values()][0];
    G.enterRoom(fr, null);
    G.room.obstacles.length = 0;
    const spot = G.spotForProp(ROOM_W / 2, ROOM_H / 2, 16);
    const prop = new Prop('forge', spot.x, spot.y, { kind: 'forge' });
    G.props.push(prop);

    const out = {};
    const standOn = () => { pl.x = prop.x; pl.y = prop.y; };

    /* ① 站上去：应该挂提示 */
    standOn(); G.forgeHint = null;
    prop.update(G);
    out['① 站上去有提示'] = !!G.forgeHint;
    out['① 阵的 used'] = prop.used;

    /* ② 按 E 开面板 */
    G.input.interact = true; prop.update(G); G.input.interact = false;
    out['② 面板是否打开'] = G.state === 'fusion';
    out['② 开了面板后 used'] = prop.used;

    /* ③ 只放两件（取不同的两件），不确认 */
    G.fusionTake();                       // 第一槽 = 光标那件
    G.fusionMove(1);                      // 挪到下一件
    G.fusionTake();                       // 第二槽 = 另一件
    out['③ 槽位'] = JSON.stringify(G.fusion.slots);
    out['③ 是否已融成'] = G.player.items.length !== 2;   // 没融：背包还是两件

    /* ④ Esc 退出（有材料时一次退一件，退完再按才关面板） */
    let guard = 0;
    while (G.state === 'fusion' && guard++ < 6) G.fusionBack();
    out['④ 退出后 state'] = G.state;
    out['④ 退出后 used'] = prop.used;

    /* ⑤ 再站上去：还能不能交互？（用户看到的症状） */
    standOn(); G.forgeHint = null;
    prop.update(G);
    out['⑤ 还能看到提示吗'] = !!G.forgeHint;
    G.input.interact = true; prop.update(G); G.input.interact = false;
    out['⑤ 按 E 能再开吗'] = G.state === 'fusion';

    /* ⑥ 真融一次之后，used 才该变成 true */
    if (G.state === 'fusion') {
      G.fusionTake(); G.fusionMove(1); G.fusionTake();
      G.fusionConfirm();
      out['⑥ 真融之后 state'] = G.state;
      out['⑥ 真融之后 used'] = prop.used;
      out['⑥ 背包'] = G.player.items.join(',');
      standOn(); G.forgeHint = null;
      prop.update(G);
      out['⑥ 融完之后还能再开吗'] = !!G.forgeHint;
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
