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

    /* 开融合阵：这是验「光标只停在能融项上」的入口。
       ⚠️ 清空法宝后手里凑不出可融组合 —— 按钮要能自己补一对材料，
          否则 openFusion 直接不弹（设计如此），在实验室里会被当成「按钮坏了」。 */
    await p.click('[data-a="strip"]');
    await p.waitForTimeout(150);
    const beforeForge = await p.evaluate(() => window.Game.player.items.length);
    await p.click('[data-a="forge"]');
    await p.waitForTimeout(200);
    const fr = await p.evaluate(() => ({
      state: window.Game.state,
      hasPanel: !!window.Game.fusion,
      items: window.Game.player.items.slice(),
      poolN: window.Game.fusion ? window.Game.fusion.pool.length : 0,
      cursorN: window.Game.fusion ? window.Game.fusionCursor().length : 0
    }));
    ok('「开融合阵」能直接打开面板（没材料时自动补一对，不是静默失败）',
      beforeForge === 0 && fr.state === 'fusion' && fr.hasPanel === true,
      '开前 ' + beforeForge + ' 件 → ' + fr.items.join(',') + ' / state=' + fr.state);
    ok('面板打开后池子与光标候选都就绪（第一槽空 → 全可选）',
      fr.poolN >= 2 && fr.cursorN === fr.poolN, '池 ' + fr.poolN + ' / 候选 ' + fr.cursorN);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(200);

    /* ================= ③ 法宝总表 / 怪物总表（2026-10-09 加） ================= */
    console.log('=== ③ 法宝总表 / 怪物总表 ===');
    const r6 = await p.evaluate(() => ({
      itemN: document.querySelectorAll('#labAllItems button').length,
      defN: ITEM_DEFS.length,
      foeN: document.querySelectorAll('#labFoes button').length,
      defs: Object.keys(ENEMY_DEF).length + Object.keys(NORDIC_ENEMY_DEF).length
        + Object.keys(ELITE_DEF).length + Object.keys(NORDIC_ELITE_DEF).length
        + Object.keys(BOSS_DEF).length + Object.keys(NORDIC_BOSS_DEF).length,
      seps: Array.from(document.querySelectorAll('#labFoes .sep')).map(s => s.textContent)
    }));
    ok('★ 法宝总表列出全部法宝（现取 ITEM_DEFS，不另抄名单）', r6.itemN === r6.defN && r6.itemN > 60,
      r6.itemN + ' / ' + r6.defN);
    ok('★ 怪物总表列出全部怪物（杂兵 + 精英 + 尊者）', r6.foeN === r6.defs && r6.foeN > 30,
      r6.foeN + ' / ' + r6.defs);
    ok('怪物总表按世界/类别分了组', r6.seps.join(',') === '中式杂兵,北欧杂兵,精英妖物,尊者', r6.seps.join(','));

    /* 搜索：输入「剑」应能筛掉大半，且仍然剩几件 */
    await p.fill('#labItemQ', '剑');
    await p.waitForTimeout(120);
    const r7 = await p.evaluate(() => {
      const bs = Array.from(document.querySelectorAll('#labAllItems button'));
      return {
        shown: bs.filter(b => b.style.display !== 'none').map(b => b.dataset.id),
        cnt: document.getElementById('labItemCount').textContent
      };
    });
    ok('法宝搜索生效（「剑」能筛出一批且不是全部）',
      r7.shown.length > 0 && r7.shown.length < r6.itemN, r7.shown.length + ' 件：' + r7.shown.slice(0, 6).join(','));
    ok('筛选计数跟着动', /显示 \d+ \/ \d+/.test(r7.cnt), r7.cnt);
    await p.fill('#labItemQ', '');
    await p.waitForTimeout(120);

    /* 怪物的搜索 + 分组过滤 */
    await p.selectOption('#labFoeGrp', 'boss');
    await p.waitForTimeout(120);
    const r8 = await p.evaluate(() => {
      const bs = Array.from(document.querySelectorAll('#labFoes button'));
      return {
        shown: bs.filter(b => b.style.display !== 'none').map(b => b.dataset.id),
        seps: Array.from(document.querySelectorAll('#labFoes .sep')).filter(s => s.style.display !== 'none').map(s => s.textContent)
      };
    });
    ok('怪物分组过滤：只看尊者时正好 8 尊（中 5 + 北 3）',
      r8.shown.length === 8 && r8.seps.join(',') === '尊者', r8.shown.join(','));
    await p.selectOption('#labFoeGrp', 'all');
    await p.waitForTimeout(120);

    /* 左键 +1 件 / 右键 −1 件 */
    await p.click('[data-a="strip"]');
    await p.waitForTimeout(150);
    await p.click('#labAllItems button[data-id="hanbing"]');
    await p.click('#labAllItems button[data-id="hanbing"]');
    await p.waitForTimeout(150);
    const r9 = await p.evaluate(() => {
      const b = document.querySelector('#labAllItems button[data-id="hanbing"]');
      return { n: window.Game.player.items.filter(i => i === 'hanbing').length, txt: b.textContent, on: b.classList.contains('on'), cnt: b.querySelector('.cnt') ? b.querySelector('.cnt').textContent : '' };
    });
    ok('★ 左键点两次 = 装 2 件（重复 id 就是阶数）', r9.n === 2 && r9.cnt === '×2', JSON.stringify(r9));
    await p.click('#labAllItems button[data-id="hanbing"]', { button: 'right' });
    await p.waitForTimeout(150);
    const r10 = await p.evaluate(() => {
      const b = document.querySelector('#labAllItems button[data-id="hanbing"]');
      return { n: window.Game.player.items.filter(i => i === 'hanbing').length, cnt: b.querySelector('.cnt') ? b.querySelector('.cnt').textContent : '', on: b.classList.contains('on') };
    });
    ok('右键 = 减 1 件（计数与高亮都退回去）', r10.n === 1 && r10.cnt === '×1' && r10.on === true, JSON.stringify(r10));

    /* 每样装一件：极端配装，用来压测数值/画面。
       ⚠️ 只有 `type === 'fabao'` 的才进背包 —— 丹药 / 功法是**当场生效**的
          （探针 _probe_lab_items.js 问出来的），所以不能拿 ITEM_DEFS.length 当期望。 */
    await p.click('[data-a="itemall"]');
    await p.waitForTimeout(250);
    const r11 = await p.evaluate(() => {
      const G = window.Game;
      const want = ITEM_DEFS.filter(d => d.type === 'fabao').map(d => d.id);
      const have = {};
      G.player.items.forEach(i => { have[i] = 1; });
      return {
        items: G.player.items.length, want: want.length,
        missing: want.filter(id => !have[id]),
        usable: ITEM_DEFS.filter(d => d.type !== 'fabao').length
      };
    });
    ok('★「每样装一件」把全部法宝类都装上（丹药 / 功法当场生效、不进背包）',
      r11.missing.length === 0 && r11.items >= r11.want,
      r11.items + ' 件（含先前留的 1 件）= 法宝 ' + r11.want + '　另 ' + r11.usable + ' 件消耗/功法不进背包');

    /* ---- 刷怪：杂兵 / 精英 / 尊者 ---- */
    await p.click('[data-a="foeclear"]');
    await p.evaluate(() => {
      /* 切到北欧段：专门验「素材标红跟着色板走」这件事 */
      Game.stylePath = ['cn', 'nordic', 'nordic']; Game.seg = 1; Game.applySegmentPalette();
      window.Lab.refreshFoeArt();
    });
    await p.waitForTimeout(120);
    const r12 = await p.evaluate(() => {
      const miss = Array.from(document.querySelectorAll('#labFoes button.miss')).map(b => b.dataset.id);
      const nord = ['draugr', 'isvarg', 'nokk', 'runestone'];
      return { missN: miss.length, nordSafe: nord.filter(id => miss.indexOf(id) < 0), cnMarked: miss.indexOf('xiesui') >= 0 };
    });
    ok('★ 北欧段里北欧杂兵不标红、中式杂兵标红（换世界漏素材会被这里一眼抓到）',
      r12.nordSafe.length === 4 && r12.cnMarked === true, JSON.stringify(r12));

    await p.click('#labFoes button[data-id="isvarg"]');
    await p.waitForTimeout(150);
    const r13 = await p.evaluate(() => {
      const e = Game.enemies[Game.enemies.length - 1];
      return { n: Game.enemies.length, type: e.type, spawnT: e.spawnT, hp: e.hp };
    });
    ok('★ 点一下刷出该怪（跳过了登场凝形，立刻能打）',
      r13.n === 1 && r13.type === 'isvarg' && r13.spawnT === 0, JSON.stringify(r13));

    await p.click('[data-a="foeclear"]');
    await p.click('#labFoes button[data-id="frost_jarl"]');
    await p.waitForTimeout(150);
    const r14 = await p.evaluate(() => {
      const e = Game.enemies[Game.enemies.length - 1];
      return { n: Game.enemies.length, type: e.type, eliteKey: e.eliteKey, perk: e.elite && e.elite.perk, hp: e.hp };
    });
    ok('★ 点精英刷出的是「基底怪 + 精英身份 + 神通」（不是只有一只普通怪）',
      r14.n === 1 && r14.eliteKey === 'frost_jarl' && r14.perk === 'swarm', JSON.stringify(r14));

    await p.click('[data-a="foeclear"]');
    await p.click('#labFoes button[data-id="jormungandr"]');
    await p.waitForTimeout(150);
    const r15 = await p.evaluate(() => {
      const e = Game.enemies[Game.enemies.length - 1];
      return {
        n: Game.enemies.length, kind: e.kind, isBoss: !!e.isBoss, phase: e.phase,
        bossRef: !!(Game.bossRef && Game.bossRef === e), name: e.name, hp: e.hp
      };
    });
    ok('★ 点尊者刷出 Boss 并挂上 bossRef（血条跟着出来，阶段可见）',
      r15.n === 1 && r15.isBoss && r15.bossRef && r15.phase === 1 && r15.kind === 'jormungandr',
      JSON.stringify(r15));

    /* AI 开关 */
    await p.click('[data-a="ai"]');
    await p.waitForTimeout(120);
    await p.click('[data-a="foeclear"]');
    await p.click('#labFoes button[data-id="draugr"]');
    await p.waitForTimeout(150);
    const r16 = await p.evaluate(() => {
      const e = Game.enemies[Game.enemies.length - 1];
      const btn = document.querySelector('[data-a="ai"]');
      return { idle: window.Lab.foeIdle(), speed: e.speed, touch: e.touch, dummy: !!e.dummy, label: btn.textContent };
    });
    ok('「AI：关」刷出来的是站着不动的靶子（不打人、不移动）',
      r16.idle === true && r16.speed === 0 && r16.touch === 0 && r16.dummy === true && /关/.test(r16.label),
      JSON.stringify(r16));
    await p.click('[data-a="ai"]');
    await p.waitForTimeout(120);

    /* 碰撞圈：开着的时候能画出来（不报错），并且真的多画了圈。
       ⚠️ 不能用「非背景像素」当指标 —— 石室底图本来就占了 92% 的画布，
          在亮地上叠一圈 1px 描边的判定圈，像素总数可以**一个都不变**（第一版就这么假失败）。
          改成**逐像素比对两帧**，并且刷 8 只怪把信号量拉大：
          关闭时的差异 = draw 里残留的随机（约 85 像素），开启后 = 随机 + 8 个判定圈。
          所以断言的是「差值」，不是绝对值。 */
    await p.evaluate(() => { document.querySelector('#labFoePlace').value = 'ring'; });
    await p.click('[data-a="foeclear"]');
    await p.click('#labFoes button[data-id="draugr"]');
    await p.waitForTimeout(150);
    await p.click('#labStep');                       // 冻住
    await p.waitForTimeout(150);
    const r17 = await p.evaluate(() => {
      const G = window.Game;
      const ctx = document.getElementById('game').getContext('2d');
      G.bullets.length = 0; G.hazards.length = 0;
      G.particles.length = 0; G.floaters.length = 0; G.zaps.length = 0;
      G.shakeAmt = 0;                                // 抖动是 draw 里最大的随机源
      const snap = () => ctx.getImageData(0, 0, 480, 320).data;
      const diff = (a, b) => {
        let n = 0;
        for (let i = 0; i < a.length; i += 4) {
          if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++;
        }
        return n;
      };
      const btn = () => document.querySelector('[data-a="hitbox"]');
      if (window.Lab.showHit()) btn().click();       // 从「关」开始
      G.draw(); const a1 = snap();
      G.draw(); const a2 = snap();
      const stable = diff(a1, a2);                   // 关着时：只剩 draw 自身的随机
      btn().click();
      G.draw(); const b1 = snap();
      const drawn = diff(a2, b1);                    // 开着时：随机 + 9 个判定圈（8 怪 + 玩家）
      const flag = window.Lab.showHit();
      btn().click();
      return { stable: stable, drawn: drawn, flag: flag, foes: G.enemies.length };
    });
    await p.click('#labStep');                       // 恢复
    await p.waitForTimeout(150);
    ok('★「碰撞圈」开关生效（打开后画面上确实多出判定圈）',
      r17.flag === true && r17.drawn > r17.stable + 100,
      r17.foes + ' 只在场：关闭时帧间差 ' + r17.stable + ' 像素 → 开启后 ' + r17.drawn + ' 像素');

    await p.close();
  }

  /* ---- ④ ?dev=1 也是同一个调试台 ---- */
  {
    const p = await b.newPage();
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '?dev=1');
    await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => ({
      lab: !!document.getElementById('lab'),
      title: (document.querySelector('#lab h2') || {}).textContent,
      foes: document.querySelectorAll('#labFoes button').length
    }));
    console.log('=== ④ ?dev=1 ===');
    ok('?dev=1 打开的是同一个「设计调试台」', r.lab && r.title === '设计调试台' && r.foes > 30,
      r.title + ' / ' + r.foes + ' 种怪');
    await p.close();
  }

  ok('全程无 pageerror', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
