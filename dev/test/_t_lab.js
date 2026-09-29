'use strict';
/* 融合实验室的自检：?lab=1 时面板要能用；不带 lab 时一个 DOM 都不许出现。 */
const { chromium } = require('playwright');
const path = require('path');
const BASE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '   ' + extra : '')); } else { fail++; console.log('  FAIL  ' + name + '   ' + (extra || '')); } };

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const errs = [];

  /* ---- ① 不带 lab：页面里不许有实验室 ---- */
  {
    const p = await b.newPage();
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE);
    await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => ({
      lab: !!document.getElementById('lab'),
      cls: document.body.className,
      labFn: typeof window.Lab
    }));
    console.log('=== ① 正式游玩（不带 ?lab） ===');
    ok('不出现实验室面板', r.lab === false);
    ok('body 不带 lab-on（布局不变形）', !/lab-on/.test(r.cls), r.cls);
    ok('不挂 window.Lab', r.labFn === 'undefined');
    await p.close();
  }

  /* ---- ② 带 lab：面板 + 交互 ---- */
  {
    const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '?lab=1');
    await p.waitForFunction(() => window.Game && window.Game.state === 'title' && window.Lab, null, { timeout: 15000 });
    await p.waitForTimeout(300);
    console.log('=== ② 实验室（?lab=1） ===');

    const r1 = await p.evaluate(() => ({
      lab: !!document.getElementById('lab'),
      cls: document.body.className,
      items: document.querySelectorAll('#labItems button').length,
      styles: document.querySelectorAll('#labStyle button').length,
      speeds: document.querySelectorAll('#labSpeed button').length
    }));
    ok('面板出现且 body 加了 lab-on', r1.lab && /lab-on/.test(r1.cls));
    ok('融合法宝按钮 = 全部产物（28 件）', r1.items === 28, r1.items + ' 个');
    ok('流派按钮 3 个 / 速度按钮 ≥5 个', r1.styles === 3 && r1.speeds >= 5, r1.styles + ' / ' + r1.speeds);

    /* 开一局，点「试这三条」 */
    await p.evaluate(() => { window.Game.newRun('feijian'); window.Game.state = 'play'; });
    await p.waitForTimeout(200);
    await p.click('[data-a="trio"]');
    await p.waitForTimeout(200);
    const r2 = await p.evaluate(() => ({
      items: window.Game.player.items.slice(),
      fus: Object.keys(window.Game.player.stats.fus).sort().join(','),
      on: Array.from(document.querySelectorAll('#labItems button.on')).map(b => b.dataset.id).sort().join(',')
    }));
    ok('「试这三条」装上往复梭 / 剑影环 / 回鸣镜',
      r2.items.sort().join(',') === 'huiming,jianying,wangfu', r2.items.join(','));
    ok('三个融合机制都进了 stats.fus', r2.fus === 'boom,bounce,orbit', r2.fus);
    ok('按钮高亮跟着走', r2.on === 'huiming,jianying,wangfu', r2.on);

    /* 阶位切到 Lv3 → fusionMem 跟着变 */
    await p.selectOption('#labTier', '3');
    await p.waitForTimeout(150);
    const r3 = await p.evaluate(() => JSON.stringify(window.Game.player.fusionMem));
    ok('阶位选择器改到 Lv3 会重算 fusionMem', /"a":3/.test(r3), r3);

    /* 摆靶 + 开火 + 读数 */
    await p.click('[data-a="row"]');
    await p.waitForTimeout(150);
    const r4 = await p.evaluate(() => ({ n: window.Game.enemies.length, hp: window.Game.enemies[0].hp, dummy: !!window.Game.enemies[0].dummy }));
    ok('「一排 ×5」生成 5 个靶子', r4.n === 5 && r4.hp > 1000 && r4.dummy, r4.n + ' 个，血 ' + r4.hp);

    const r5 = await p.evaluate(async () => {
      const G = window.Game;
      G.player.x = 60; G.player.y = G.enemies[0].y;
      G.player.shootCd = 0;
      STYLES.feijian.attack(G.player, G, { shooting: true, aiming: true, aimAngle: 0 });
      const had = G.bullets.length;
      const hasBoom = G.bullets.filter(b => b.boom).length;
      const hasBounce = G.bullets.filter(b => b.bounce > 0).length;
      await new Promise(r => setTimeout(r, 500));
      const rd = document.getElementById('labRead').textContent;
      return { had: had, hasBoom: hasBoom, hasBounce: hasBounce, rd: rd };
    });
    ok('开火后子弹带上了折返 / 反弹标记',
      r5.had > 0 && r5.hasBoom === r5.had && r5.hasBounce === r5.had,
      r5.had + ' 发，折返 ' + r5.hasBoom + '，反弹 ' + r5.hasBounce);
    ok('读数面板有内容（含机制名）', /机制/.test(r5.rd) && /boom/.test(r5.rd), r5.rd.split('\n')[0]);

    /* 时间控制：暂停后帧数不再涨 */
    /* ⚠️ 基线要在**点完之后**读：p.click() 自己也要几十毫秒，那期间游戏还在跑，
       先读基线再点会凭空多出几帧，看着像「暂停没生效」。（第一次就是这么假失败的） */
    await p.click('#labStep');
    const before = await p.evaluate(() => window.Game.tick);
    await p.waitForTimeout(400);
    const mid = await p.evaluate(() => window.Game.tick);
    ok('「单步/暂停」之后游戏时间停住', mid === before, before + ' → ' + mid);
    await p.click('#labStep');
    await p.waitForTimeout(300);
    const after = await p.evaluate(() => window.Game.tick);
    ok('再点一次恢复推进', after > mid, mid + ' → ' + after);

    /* 慢动作：半速之后同样时间里推进的帧数明显减少 */
    const f0 = await p.evaluate(() => window.Game.tick);
    await p.waitForTimeout(600);
    const f1 = await p.evaluate(() => window.Game.tick);
    const fast = f1 - f0;
    await p.evaluate(() => {
      const btns = document.querySelectorAll('#labSpeed button');
      for (const b of btns) if (b.textContent === '1/10') { b.click(); break; }
    });
    const f2 = await p.evaluate(() => window.Game.tick);
    await p.waitForTimeout(600);
    const f3 = await p.evaluate(() => window.Game.tick);
    const slow = f3 - f2;
    ok('1/10 速下推进的帧数明显少于 1×', slow < fast * 0.5, '1× ' + fast + ' 帧 → 1/10 ' + slow + ' 帧');

    await p.close();
  }

  ok('全程无 pageerror', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
