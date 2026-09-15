'use strict';
/* 交互与按键边界 —— 自动化测试
 * 1) 空格（发动功法）不得顺带触发宝箱 / 坊市 / 祭坛交互
 * 2) E 仍能正常交互
 * 3) 空格仍能正常发动功法
 * 4) 坊市货品在可交互时应给出效果预览
 */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

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

  // 在页面里装一个通用的场景搭建器
  await page.evaluate(() => {
    const G = window.Game;
    const p = () => G.player;
    window.__scene = function (kind, opt) {
      G.newRun('feijian');
      G.state = 'play';
      G.room.cleared = true;
      G.enemies.length = 0; G.bullets.length = 0; G.hazards.length = 0;
      G.props.length = 0; G.pickups.length = 0; G.floaters.length = 0;
      G.floor.rooms.forEach(r => { r.cleared = true; r.waves = []; });
      const pl = p();
      pl.x = 240; pl.y = 170; pl.invuln = 9999;
      pl.hp = pl.maxHP;
      // 小技能（Q 释放、扣灵力）与专属技能（空格释放、进冷却）
      pl.addSkill('huti'); pl.selectSlot(0); pl.skillGcd = 0; pl.mp = pl.maxMP;
      pl.giveUlt(window.Game.style); pl.ultCd = 0;
      G.coins = 100; G.keys = 2; G.bombs = 2;
      let prop = null;
      if (kind === 'chest') prop = new Prop('chest', 240, 170, { item: 'tianlei', locked: !!opt.locked, gold: !!opt.locked });
      if (kind === 'shop') prop = new Prop('shop', 240, 170, { item: 'tianlei', price: opt.price == null ? 30 : opt.price, sold: false });
      if (kind === 'altar') prop = new Prop('altar', 240, 170, {});
      if (prop) G.props.push(prop);
      window.__prop = prop;
      return prop;
    };
    // 模拟一次按键 + 一帧更新（action 在 update 末尾清零）
    window.__press = function (key) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true }));
      G.update();
      window.dispatchEvent(new KeyboardEvent('keyup', { key: key, bubbles: true }));
    };
    window.__snap = function () {
      const pl = G.player, pr = window.__prop;
      return {
        coins: G.coins, keys: G.keys, hp: pl.hp,
        ultCd: pl.ultCd, skillGcd: pl.skillGcd, mp: pl.mp,
        opened: !!(pr && pr.opened), sold: !!(pr && pr.sold), used: !!(pr && pr.used),
        items: pl.items.length
      };
    };
  });

  /* ---------------- T1  空格不得触发交互 ---------------- */
  sec('T1  空格（功法）不得顺带触发交互');
  for (const [kind, opt] of [['chest', { locked: true }], ['shop', {}], ['altar', {}]]) {
    const r = await page.evaluate(([k, o]) => {
      window.__scene(k, o);
      const before = window.__snap();
      window.__press(' ');
      const after = window.__snap();
      return { before, after };
    }, [kind, opt]);
    const b = r.before, a = r.after;
    if (kind === 'chest') {
      ok('空格不开启金匣', !a.opened && a.keys === b.keys && a.items === b.items,
        `opened=${a.opened} keys ${b.keys}->${a.keys}`);
    } else if (kind === 'shop') {
      ok('空格不购买货品', !a.sold && a.coins === b.coins, `sold=${a.sold} coins ${b.coins}->${a.coins}`);
    } else {
      ok('空格不发动祭坛', !a.used && a.hp === b.hp, `used=${a.used} hp ${b.hp}->${a.hp}`);
    }
    ok(`空格仍成功发动专属技能（${kind} 场景）`, a.ultCd > 0, `ultCd=${a.ultCd}`);
  }

  /* ---------------- T2  E 正常交互 ---------------- */
  sec('T2  E 仍能正常交互');
  {
    const r = await page.evaluate(() => {
      window.__scene('chest', { locked: true });
      const before = window.__snap();
      window.__press('e');
      const after = window.__snap();
      return { before, after };
    });
    ok('E 用钥匙开启金匣', r.after.opened && r.after.keys === r.before.keys - 1,
      `opened=${r.after.opened} keys ${r.before.keys}->${r.after.keys}`);
  }
  {
    const r = await page.evaluate(() => {
      window.__scene('shop', { price: 30 });
      const before = window.__snap();
      window.__press('e');
      const after = window.__snap();
      return { before, after };
    });
    ok('E 花钱购买货品', r.after.sold && r.after.coins === r.before.coins - 30,
      `coins ${r.before.coins}->${r.after.coins}`);
  }
  {
    const r = await page.evaluate(() => {
      window.__scene('altar', {});
      const before = window.__snap();
      window.__press('e');
      const after = window.__snap();
      return { before, after };
    });
    ok('E 在祭坛献祭', r.after.used, `used=${r.after.used}`);
  }
  {
    // 无钥匙时 E 不能开锁箱，也不应报错
    const r = await page.evaluate(() => {
      window.__scene('chest', { locked: true });
      window.Game.keys = 0;
      const before = window.__snap();
      window.__press('e');
      const after = window.__snap();
      return { before, after };
    });
    ok('无钥匙时 E 开不了金匣', !r.after.opened && r.after.keys === 0, `opened=${r.after.opened}`);
  }

  /* ---------------- T3  空格发动专属技能 / Q 发动小技能 ---------------- */
  sec('T3  空格发动专属技能 · Q 发动小技能');
  {
    const r = await page.evaluate(() => {
      window.__scene('chest', { locked: true });
      const before = window.__snap();
      window.__press(' ');
      const after = window.__snap();
      return { before, after };
    });
    ok('空格置专属技能冷却', r.after.ultCd > 0, `ultCd=${r.after.ultCd}`);
  }
  {
    // 专属冷却中：空格不应重新发动（冷却不会被打回满值），也不应开箱
    const r = await page.evaluate(() => {
      window.__scene('chest', { locked: true });
      const G = window.Game;
      G.player.ultCd = 0;
      window.__press(' ');                       // 发动
      const after = G.player.ultCd;
      window.__press(' ');                       // 冷却期内再按
      const after2 = G.player.ultCd;
      return { after, after2, full: ultCdOf(G.player.ult, G.player.ult.style), opened: window.__snap().opened };
    });
    ok('冷却期内空格不重新发动、也不开箱',
      r.after2 === r.after - 1 && r.after2 < r.full && !r.opened,
      `cd ${r.after}->${r.after2}（满值 ${r.full}）`);
  }
  {
    // Q：只放小技能，不触发交互
    const r = await page.evaluate(() => {
      window.__scene('chest', { locked: true });
      const G = window.Game;
      G.player.skillGcd = 0; G.player.mp = 100;
      const before = window.__snap();
      window.__press('q');
      const after = window.__snap();
      return { before, after, cost: SKILL_DEF.huti.cost };
    });
    ok('Q 扣灵力发动小技能', r.after.mp === r.before.mp - r.cost,
      `mp ${r.before.mp}->${r.after.mp}（护体金光 ${r.cost}）`);
    ok('Q 不触发交互（金匣未开）', !r.after.opened, `opened=${r.after.opened}`);
  }
  {
    // 直接核对按键语义：空格只发功法、E 才是交互
    const r = await page.evaluate(() => {
      window.__scene('shop', { price: 30 });
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
      const afterSpace = input.interact;
      input.interact = false;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }));
      const afterE = input.interact;
      input.interact = false;
      return { afterSpace, afterE };
    });
    ok('空格不置交互标志', r.afterSpace === false);
    ok('E 置交互标志', r.afterE === true);
  }
  {
    // 灵石不足时按空格：不该走购买分支（不会扣钱、不会标已售）
    const r = await page.evaluate(() => {
      window.__scene('shop', { price: 30 });
      const G = window.Game;
      G.coins = 5; G.floaters.length = 0;
      window.__press(' ');
      // 空格只会留技能自身的提示，绝不该出现坊市的 NO COIN
      const noCoin = G.floaters.some(f => f.text === 'NO COIN');
      return { noCoin: noCoin, coins: G.coins, sold: window.__snap().sold };
    });
    ok('灵石不足时空格也不购买、不提示', r.coins === 5 && !r.sold && !r.noCoin,
      `coins=${r.coins} sold=${r.sold} noCoin=${r.noCoin}`);
  }
  {
    // 封印门：没钥匙时只有 E（配雷符）能炸开，空格不行
    const r = await page.evaluate(() => {
      const G = window.Game;
      G.newRun('feijian');
      G.state = 'play';
      G.enemies.length = 0;
      const rm = G.room;
      let d = -1;
      for (let i = 0; i < 4; i++) if (rm.doors[i] && rm.neighbors[i]) { d = i; break; }
      const nb = G.floor.rooms.get(rm.neighbors[d]);
      nb.type = RT.TREASURE; nb.unlocked = false; nb.waves = []; nb.cleared = true;
      rm.doorOpen[d] = true; rm.doorHidden[d] = false;
      const z = G.floor.exitZone(d);
      G.player.x = z.x + z.w / 2; G.player.y = z.y + z.h / 2;
      G.bombs = 2; G.keys = 0; G.doorLock = 0;

      G.checkDoors();                       // 无交互键：应只给提示
      const roomBefore = G.room;
      const keep = { bombs: G.bombs, hint: G.lockedHint };
      input.interact = true;
      G.checkDoors();                       // 带交互键：炸开并进房
      input.interact = false;
      return { keep, bombs: G.bombs, moved: G.room !== roomBefore, unlocked: nb.unlocked };
    });
    ok('封印门前无交互键不炸符', r.keep.bombs === 2 && r.keep.hint,
      `bombs=${r.keep.bombs} hint=${r.keep.hint}`);
    ok('E + 雷符可炸开封印门', r.bombs === 1 && r.moved && r.unlocked,
      `bombs=${r.bombs} moved=${r.moved}`);
  }

  /* ---------------- T4  坊市效果预览 ---------------- */
  sec('T4  坊市货品交互时给出效果预览');
  {
    const r = await page.evaluate(() => {
      window.__scene('shop', { price: 30 });
      const G = window.Game;
      for (let i = 0; i < 3; i++) { G.update(); }
      G.updateShopTip();
      const el = document.getElementById('shopTip');
      const shop = window.__prop;
      const view = itemView(ITEM_MAP[shop.item], G.style);
      return {
        shown: el.style.display === 'block',
        text: el.innerText,
        name: view.name, desc: view.desc, price: shop.price
      };
    });
    ok('站到货品前弹出预览', r.shown);
    ok('预览含名称', r.text.indexOf(r.name) >= 0, r.name);
    ok('预览含效果说明', r.text.indexOf(r.desc) >= 0, r.desc);
    ok('预览含价格', r.text.indexOf(String(r.price)) >= 0, '价 ' + r.price);
    ok('预览说明按键', /按 E 购买/.test(r.text));
  }
  {
    // 灵石不足时预览要给出差额提示，而不是照样说「按 E 购买」
    const r = await page.evaluate(() => {
      window.__scene('shop', { price: 30 });
      window.Game.coins = 5;
      for (let i = 0; i < 3; i++) window.Game.update();
      window.Game.updateShopTip();
      const el = document.getElementById('shopTip');
      return { shown: el.style.display === 'block', text: el.innerText };
    });
    ok('灵石不足时预览提示差额', r.shown && /灵石不足/.test(r.text), r.text.split('\n').pop());
  }
  {
    // 买下之后预览应立即收起
    const r = await page.evaluate(() => {
      window.__scene('shop', { price: 30 });
      for (let i = 0; i < 3; i++) window.Game.update();
      window.__press('e');
      window.Game.updateShopTip();
      return { sold: window.__prop.sold, shown: document.getElementById('shopTip').style.display === 'block' };
    });
    ok('购得后预览收起', r.sold && !r.shown, `sold=${r.sold} shown=${r.shown}`);
  }
  {
    // 走开之后预览与底部提示都要消失
    const r = await page.evaluate(() => {
      window.__scene('shop', { price: 30 });
      for (let i = 0; i < 3; i++) window.Game.update();
      const nearHint = window.Game.shopHint === window.__prop;
      window.Game.player.x = 60; window.Game.player.y = 60;
      for (let i = 0; i < 3; i++) window.Game.update();
      window.Game.updateShopTip();
      return {
        nearHint,
        farHint: window.Game.shopHint,
        shown: document.getElementById('shopTip').style.display === 'block'
      };
    });
    ok('走近才认领货品提示', r.nearHint);
    ok('走开后提示与预览一并消失', r.farHint === null && !r.shown, `hint=${r.farHint} shown=${r.shown}`);
  }
  {
    // 多件货品同时进射程：只提示最近的一件
    const r = await page.evaluate(() => {
      window.__scene('shop', { price: 30 });
      const G = window.Game;
      G.props.length = 0;
      const far = new Prop('shop', 300, 170, { item: 'tianlei', price: 30, sold: false });
      const near = new Prop('shop', 246, 170, { item: 'jinchuang', price: 30, sold: false });
      G.props.push(far, near);
      G.player.x = 240; G.player.y = 170;
      G.update();
      return { picked: G.shopHint && G.shopHint.item, near: 'jinchuang' };
    });
    ok('多件货品进射程时提示最近的一件', r.picked === r.near, `picked=${r.picked}`);
  }
  {
    // 所见即所买：两件同时在射程内，E 只买下正在预览（最近）的那一件
    const r = await page.evaluate(() => {
      window.__scene('shop', { price: 30 });
      const G = window.Game;
      G.props.length = 0;
      const near = new Prop('shop', 240, 170, { item: 'tianlei', price: 30, sold: false });
      const far = new Prop('shop', 250, 170, { item: 'jinchuang', price: 30, sold: false });
      G.props.push(near, far);
      G.player.x = 240; G.player.y = 170; G.coins = 100;
      input.interact = true;
      G.props.forEach(p => p.update(G));
      input.interact = false;
      return { near: near.sold, far: far.sold, coins: G.coins };
    });
    ok('两件同时在射程内只买最近的一件', r.near && !r.far && r.coins === 70,
      `near=${r.near} far=${r.far} coins=${r.coins}`);
  }

  /* ---------------- T5  非游戏状态 ---------------- */
  sec('T5  身死 / 飞升后不得再交互');
  {
    const r = await page.evaluate(() => {
      const G = window.Game;
      window.__scene('shop', { price: 30 });
      for (let i = 0; i < 3; i++) G.update();     // 先认领提示
      G.state = 'dead';
      const coins = G.coins;
      window.__press(' ');
      window.__press('e');
      G.updateShopTip();
      return {
        coins, now: G.coins, sold: window.__snap().sold,
        shown: document.getElementById('shopTip').style.display === 'block'
      };
    });
    ok('身死后空格/E 都不买东西', !r.sold && r.now === r.coins, `coins ${r.coins}->${r.now}`);
    ok('身死后坊市预览收起', !r.shown);
  }

  /* ---------------- T6  全局错误 ---------------- */
  sec('T6  全局错误检查');
  ok('全程无 pageerror / console.error', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\n=== 汇总 ===');
  console.log(`  PASS ${pass} / FAIL ${fail}`);
  if (failed.length) console.log('  失败：' + failed.join('、'));
  // browser.close() 在本机常挂死，限时收尾即可
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(fail ? 1 : 0);
})();
