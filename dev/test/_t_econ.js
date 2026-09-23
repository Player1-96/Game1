'use strict';
/* 资源经济 —— 自动化测试
 * 1) 灵石：每层产出 ≈ 本层消耗 × 0.85，不得溢出
 * 2) 钥匙：本层产出 == 本层锁数，且随机分布在不同房间
 * 3) 雷符：每层 1~2 颗，随机分布；可替代钥匙炸开藏珍阁门
 * 4) 金匣：需 1 把钥匙，回报双倍法宝
 * 5) 全流程回归：两流派推进无异常
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

  /* ---------- T1 灵石产出 / 消耗比 ---------- */
  sec('T1  灵石：每层产出被锁在预算内，且略低于消耗');
  const coin = await page.evaluate(() => {
    const G = window.Game;
    const rows = [];
    for (let i = 0; i < 40; i++) {
      const depth = (i % 5) + 1;
      G.newRun('feijian');
      G.newFloor(depth);
      const f = G.floor;
      let income = 0;
      for (const r of f.rooms.values()) income += r.coinPool || 0;
      income += f.coinReserve || 0;
      rows.push({ depth, sink: f.coinSink, budget: f.coinBudget, income, ratio: +(income / f.coinSink).toFixed(3) });
    }
    return rows;
  });
  const badRatio = coin.filter(r => r.ratio > 1.0 || r.ratio < 0.6);
  ok('每层实际产出 == 预算（分毫不差）', coin.every(r => r.income === r.budget),
    '样本 ' + coin.length + ' 层');
  ok('产出/消耗 落在 0.6~1.0', badRatio.length === 0,
    '实测 ' + Math.min(...coin.map(r => r.ratio)) + ' ~ ' + Math.max(...coin.map(r => r.ratio)));
  const avg = coin.reduce((s, r) => s + r.ratio, 0) / coin.length;
  ok('平均产出略低于消耗（0.75~0.92）', avg > 0.75 && avg < 0.92, 'avg=' + avg.toFixed(3));
  const d1 = coin.filter(r => r.depth === 1), d5 = coin.filter(r => r.depth === 5);
  const avgOf = a => a.reduce((s, r) => s + r.sink, 0) / a.length;
  ok('消耗端随深度递增', avgOf(d5) > avgOf(d1) * 1.3,
    '一层均价 ' + avgOf(d1).toFixed(1) + ' → 五层 ' + avgOf(d5).toFixed(1));

  /* ---------- T2 灵石配额不会超发 ---------- */
  sec('T2  敌人掉落与清房奖励都从配额里扣，不会超发');
  const cap = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    const r = G.floorStart();
    // 找一个普通房
    let target = null;
    for (const rr of G.floor.rooms.values()) if (rr.type === 'normal') { target = rr; break; }
    G.enterRoom(target, null);
    const pool0 = target.coinPool;
    // 疯狂索取
    let got = 0;
    for (let i = 0; i < 50; i++) got += G.takeCoins(240, 160, 5);
    const left = G.room.coinPool;
    const over = G.takeCoins(240, 160, 5);
    return { pool0, got, left, over };
  });
  ok('索取总额被配额截断', cap.got === cap.pool0, '配额 ' + cap.pool0 + ' → 实得 ' + cap.got);
  ok('配额耗尽后再索取为 0', cap.over === 0 && cap.left === 0);

  /* ---------- T3 钥匙 ---------- */
  sec('T3  钥匙：产出 == 本层锁数，且随机分布');
  const key = await page.evaluate(() => {
    const G = window.Game;
    const rows = [];
    for (let i = 0; i < 40; i++) {
      const depth = (i % 5) + 1;
      G.newRun('feijian');
      G.newFloor(depth);
      const f = G.floor;
      const keyRooms = [...f.rooms.values()].filter(r => r.keyDrop).map(r => r.key);
      const treasure = [...f.rooms.values()].filter(r => r.type === 'treasure').length;
      const goldChest = [...f.rooms.values()]
        .reduce((s, r) => s + r.props.filter(p => p.kind === 'chest' && p.locked).length, 0);
      rows.push({
        depth, locks: f.lockCount, keyRooms: keyRooms.length, keysArr: keyRooms, treasure, goldChest,
        distinct: new Set(keyRooms).size,
        inNormal: [...f.rooms.values()].filter(r => r.keyDrop).every(r => r.type === 'normal')
      });
    }
    return rows;
  });
  ok('锁数 == 藏珍阁门 + 金匣', key.every(r => r.locks === r.treasure + r.goldChest),
    '样本锁数 ' + [...new Set(key.map(r => r.locks))].join('/'));
  ok('钥匙产出 == 锁数', key.every(r => r.keyRooms === r.locks),
    '每层 ' + [...new Set(key.map(r => r.keyRooms))].join('/') + ' 把');
  ok('钥匙分散在不同房间', key.every(r => r.distinct === r.keyRooms));
  ok('钥匙只落在普通房（不是随手可得）', key.every(r => r.inNormal));
  const spread = new Set(key.flatMap(r => r.keysArr));
  ok('掉落房间随层随机（不是固定房）', spread.size > 8, '不同落点 ' + spread.size + ' 个');

  /* ---------- T4 雷符 ---------- */
  sec('T4  雷符：每层 1~2 颗，可替代钥匙炸门');
  const bomb = await page.evaluate(() => {
    const G = window.Game;
    const rows = [];
    for (let i = 0; i < 30; i++) {
      G.newRun('feijian');
      G.newFloor((i % 5) + 1);
      const f = G.floor;
      const bs = [...f.rooms.values()].filter(r => r.bombDrop);
      rows.push({ plan: f.bombPlan, placed: bs.length, inNormal: bs.every(r => r.type === 'normal') });
    }
    return rows;
  });
  ok('雷符产出 1~2 颗', bomb.every(r => r.plan >= 1 && r.plan <= 2));
  ok('雷符实际放置数量正确', bomb.every(r => r.placed === r.plan));
  ok('雷符只落在普通房', bomb.every(r => r.inNormal));

  const blast = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    // 造一个「玩家站在通往藏珍阁的门上、没钥匙有雷符」的局面
    let from = null, dir = -1, treasure = null;
    for (const r of G.floor.rooms.values()) {
      if (r.type !== 'treasure') continue;
      treasure = r;
      for (let d = 0; d < 4; d++) {
        const nb = r.neighbors[d] && G.floor.rooms.get(r.neighbors[d]);
        if (nb) { from = nb; dir = (d + 2) % 4; break; }
      }
      break;
    }
    if (!from) return { skip: true };
    G.enterRoom(from, null);
    const z = G.floor.exitZone(dir);
    // 用判定区中心：exitZone 的 cx/cy 对南北/东西门恰好落在严格边界的线上，取中心才稳
    G.player.x = z.x + z.w / 2; G.player.y = z.y + z.h / 2;
    G.enemies.length = 0;
    G.doorLock = 0;
    G.keys = 0; G.bombs = 1;
    for (let d = 0; d < 4; d++) G.room.doorOpen[d] = true;
    G.input.interact = false;
    G.checkDoors();
    const noKeyNoPress = { unlocked: !!treasure.unlocked, bombs: G.bombs, hint: G.lockedHint };
    G.input.interact = true;
    G.checkDoors();
    const pressed = { unlocked: !!treasure.unlocked, bombs: G.bombs, state: G.state };
    G.input.interact = false;
    return { skip: false, noKeyNoPress, pressed };
  });
  ok('没钥匙且不按 E：门不开', !blast.skip && blast.noKeyNoPress.unlocked === false && blast.noKeyNoPress.hint === true);
  ok('按 E 用雷符炸开：门开且消耗 1 颗', !blast.skip && blast.pressed.unlocked === true && blast.pressed.bombs === 0);

  /* ---------- T5 金匣 ---------- */
  sec("T5  金匣：需 1 把钥匙，回报一件珍稀法宝");
  const chest = await page.evaluate(() => {
    const G = window.Game;
    // 金匣有 35% 概率额外掉一个小技能，统计法宝时要把它排除掉
    const isFabao = p => p.kind === 'item' && !SKILL_DEF[p.item];
    G.newRun('feijian');
    let tr = null;
    for (const r of G.floor.rooms.values()) if (r.type === 'treasure') { tr = r; break; }
    if (!tr) return { skip: true };
    tr.unlocked = true;
    G.enterRoom(tr, null);
    const locked = G.props.filter(p => p.kind === 'chest' && p.locked);
    const free = G.props.filter(p => p.kind === 'chest' && !p.locked);
    if (!locked.length) return { skip: true };

    // 木箱：碰到即开
    G.player.x = free[0].x; G.player.y = free[0].y;
    G.props.forEach(p => p.update(G));
    const freeOpened = !!free[0].opened;
    const itemsAfterFree = G.props.filter(isFabao).length;

    // 金匣：无钥匙按 E 不开
    const lc = locked[0];
    G.keys = 0;
    G.player.x = lc.x; G.player.y = lc.y;
    G.input.interact = true;
    const before = G.props.filter(isFabao).length;
    G.props.forEach(p => p.update(G));
    const closedNoKey = !lc.opened && G.props.filter(isFabao).length === before;
    lc._msgCd = 0; G.input.interact = true;

    // 给钥匙再按 E
    G.keys = 1;
    G.props.forEach(p => p.update(G));
    const openedWithKey = !!lc.opened && G.keys === 0;
    const itemsAfterGold = G.props.filter(isFabao).length;
    G.input.interact = false;
    const got = G.props.filter(isFabao).slice(-(itemsAfterGold - before)).map(p => p.item);
    return {
      skip: false, freeOpened, itemsAfterFree, closedNoKey, openedWithKey,
      gained: itemsAfterGold - before,
      allRare: got.length > 0 && got.every(id => !!(ITEM_MAP[id] && ITEM_MAP[id].rare))
    };
  });
  ok('藏珍阁有木箱与金匣各一', !chest.skip);
  ok('木箱碰到即开、给 1 件法宝', !chest.skip && chest.freeOpened && chest.itemsAfterFree === 1);
  ok('金匣无钥匙按 E 不开', !chest.skip && chest.closedNoKey);
  ok('金匣有钥匙可开并扣 1 把', !chest.skip && chest.openedWithKey);
  ok('金匣只出 1 件法宝（不再双倍）', !chest.skip && chest.gained === 1, '实得 ' + (chest.gained) + ' 件');
  ok('金匣出的是珍稀法宝', !chest.skip && chest.allRare === true);

  /* ---------- T6 贪心属性仍生效 ---------- */
  sec('T6  贪心：额外产出不计入预算，属性不失效');
  const greed = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    let target = null;
    for (const rr of G.floor.rooms.values()) if (rr.type === 'normal') { target = rr; break; }
    G.enterRoom(target, null);
    G.room.coinPool = 0;                      // 配额耗尽
    G.player.stats.greed = 6;
    let extra = 0;
    for (let i = 0; i < 400; i++) {
      const n0 = G.pickups.length;
      // 复刻敌人掉落逻辑里的贪心分支
      if (Math.random() < G.player.stats.greed * 0.12) { G.dropPickup('coin', 100, 100, 1); }
      extra += G.pickups.length - n0;
    }
    return { extra };
  });
  ok('贪心在配额耗尽后仍能产出', greed.extra > 100, '额外 ' + greed.extra + ' 枚 / 400 次');

  /* ---------- T7 真实清房：整层跑通经济链路 ---------- */
  sec('T7  清房实测：走完一整层，产出与配给是否兑现');
  const run = await page.evaluate(() => {
    const G = window.Game;
    const out = [];
    for (let n = 0; n < 8; n++) {
      G.newRun('feijian');
      G.newFloor((n % 5) + 1);
      const f = G.floor;
      let coinGot = 0, keysGot = 0, bombsGot = 0, roomsCleared = 0;
      for (const r of [...f.rooms.values()]) {
        G.enterRoom(r, null);
        G.doorLock = 0;
        // 逐波斩杀（有的房间有 2 波，只清一波不算 cleared，拿不到清房奖励）
        for (let w = 0; w < 5 && !r.cleared; w++) {
          for (const e of G.enemies) { e.spawnT = 0; e.hurt(9999, G); }
          for (let k = 0; k < 4; k++) G.update();     // 让死亡 / 清房 / 下一波逻辑跑完
          G.enemies.length = 0;
          for (let k = 0; k < 2; k++) G.update();
        }
        if (r.waves && r.waves.length) roomsCleared++;
        for (const p of G.pickups) {
          if (p.kind === 'coin') coinGot += p.value;
          else if (p.kind === 'key') keysGot++;
          else if (p.kind === 'bomb') bombsGot++;
        }
      }
      out.push({
        depth: f.depth, budget: f.coinBudget, coinGot, reserve: f.coinReserve,
        locks: f.lockCount, keysGot, bombPlan: f.bombPlan, bombsGot, roomsCleared
      });
    }
    return out;
  });
  // 备用配额只留给宝箱 / 祭坛，不保证发出，因此实收 = 预算 − 备用
  ok('清完整层，灵石实收 == 预算 − 备用', run.every(r => r.coinGot === r.budget - r.reserve),
    run.map(r => r.coinGot + '/' + (r.budget - r.reserve)).join(' '));
  ok('清完整层，钥匙实收 == 锁数', run.every(r => r.keysGot === r.locks),
    run.map(r => r.keysGot + '/' + r.locks).join(' '));
  ok('清完整层，雷符实收 == 配给', run.every(r => r.bombsGot === r.bombPlan),
    run.map(r => r.bombsGot + '/' + r.bombPlan).join(' '));

  /* ---------- T8 强制推进 5 层回归 ---------- */
  sec('T8  回归：两流派连推 5 层无异常');
  for (const style of ['feijian', 'jujian']) {
    const r = await page.evaluate(st => {
      const G = window.Game;
      G.newRun(st);
      const inp = G.input;
      let frames = 0, maxDepth = 1, bad = null, peakCoins = 0;
      try {
        for (let i = 0; i < 9000; i++) {
          inp.mouseDown = (i % 7) < 4;
          inp.mouseT = performance.now();
          inp.mx = 240 + Math.sin(i / 13) * 150;
          inp.my = 170 + Math.cos(i / 17) * 90;
          inp.up = i % 40 < 12; inp.down = i % 40 >= 12 && i % 40 < 24;
          inp.left = i % 60 < 20; inp.right = i % 60 >= 20 && i % 60 < 40;
          inp.action = i % 23 === 0;
          G.update(); frames++;
          if (i % 6 === 0) G.draw();
          peakCoins = Math.max(peakCoins, G.coins);
          maxDepth = Math.max(maxDepth, G.depth);
          if (G.state === 'win') break;
          if (i % 90 === 0) {                 // 强制推进，覆盖深层内容
            G.enemies.length = 0;
            /* 推进到「最后一层」而不是写死 5 —— 层数由 SEG_TOTAL_FLOORS 决定（当前 15）。
               写死 5 会在扩层后漏测后半段的房间/经济。 */
            if (G.depth < SEG_TOTAL_FLOORS) {
              G.nextFloor();
              if (G.state === 'stylePick' && G.styleMenu) G.styleMenuConfirm();
            } else { G.state = 'win'; break; }
          }
        }
      } catch (e) { bad = e.message; }
      G.input.mouseDown = false; G.input.up = G.input.down = G.input.left = G.input.right = false;
      return { frames, maxDepth, bad, state: G.state, coins: G.coins, peakCoins };
    }, style);
    ok(`${style} 推进到最后 1 层无异常`, r.bad === null && r.maxDepth >= 5,
      r.bad || `${r.frames} 帧 / 最深 ${r.maxDepth} 层 / state=${r.state}`);
    ok(`${style} 灵石未失控溢出`, r.peakCoins < 260, '峰值 ' + r.peakCoins);
  }

  /* ---------- T9 Boss 房：无限召唤的小怪不得成为刷灵石的口子 ---------- */
  sec('T9  Boss 房小怪不掉灵石（配额留给尊者伏诛时补发）');
  const bossCoin = await page.evaluate(() => {
    const G = window.Game;
    const findRoom = t => { for (const r of G.floor.rooms.values()) if (r.type === t) return r; return null; };
    const sumCoin = () => G.pickups.filter(k => k.kind === 'coin').reduce((s, k) => s + k.value, 0);
    const spawn60 = () => {                     // 复刻尊者无限召唤的规模
      for (let i = 0; i < 60; i++) {
        const e = new Enemy('yinsha', 70 + (i % 8) * 45, 70 + ((i / 8) | 0) * 28, 1);
        e.spawnT = 0; G.enemies.push(e); e.die(G);
      }
    };
    // —— Boss 房
    /* ⚠️ Boss 房只在【段末】出现（SEG_FLOORS 的整数倍层），第 1 层是没有的。
       原先直接 newRun 后 findRoom('boss') 必然拿不到 —— 会静默 skip 掉整组断言。 */
    G.newRun('feijian');
    G.newFloor(SEG_FLOORS);
    const br = findRoom('boss');
    if (!br) return { skip: true };
    G.enterRoom(br, null);
    G.doorLock = 0;
    const pool0 = G.room.coinPool, c0 = sumCoin();
    G.player.stats.greed = 8;                   // 连「贪心」这条额外产出口一起验
    spawn60();
    const coinBoss = sumCoin() - c0, poolAfter = G.room.coinPool;
    // 尊者伏诛：本房配额应完整落到玩家手里（一点没少）
    G.enemies.length = 0;
    const boss = G.bossRef;
    for (let i = 0; i < 40 && boss && !boss.dead; i++) { boss.invuln = 0; boss.hurt(999999, G); }
    const coinFromBoss = sumCoin() - c0;
    // —— 对照组：普通房的小怪照旧掉灵石（别把口子一刀切死）
    G.newRun('feijian');
    const nr = findRoom('normal');
    G.enterRoom(nr, null);
    G.doorLock = 0;
    nr.coinPool = 60;                           // 给足配额，看这笔配额会不会真的发出去
    const n0 = sumCoin();
    spawn60();
    const coinNormal = sumCoin() - n0;
    return { skip: false, pool0, coinBoss, poolAfter, coinFromBoss, coinNormal, bossAlive: !!(boss && boss.dead) };
  });
  ok('Boss 房配额非零（口径可验）', !bossCoin.skip && bossCoin.pool0 > 0, '配额 ' + (bossCoin.pool0 || 0));
  ok('斩杀 60 只召唤小怪：灵石一枚不掉', !bossCoin.skip && bossCoin.coinBoss === 0,
    `实掉 ${bossCoin.coinBoss} 枚（贪心 8 级）`);
  ok('斩杀 60 只召唤小怪：本房配额分文未动', !bossCoin.skip && bossCoin.poolAfter === bossCoin.pool0,
    `配额 ${bossCoin.pool0} → ${bossCoin.poolAfter}`);
  ok('尊者伏诛：本房配额完整补发', !bossCoin.skip && bossCoin.bossAlive && bossCoin.coinFromBoss === bossCoin.pool0,
    `实收 ${bossCoin.coinFromBoss} / 配额 ${bossCoin.pool0}`);
  ok('对照组：普通房同样 60 只怪照旧掉灵石', !bossCoin.skip && bossCoin.coinNormal > 20,
    `实掉 ${bossCoin.coinNormal} 枚 / 配额 60`);

  ok('全程无 pageerror / console.error', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\n──────────────────────────────');
  console.log(`  通过 ${pass} / 失败 ${fail}`);
  if (fail) { console.log('  失败项：'); failed.forEach(f => console.log('   - ' + f)); }
  else console.log('  全部通过 ✅');
  console.log('──────────────────────────────');
  // browser.close() 在本机常挂死，限时收尾即可
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(fail ? 1 : 0);
})();
