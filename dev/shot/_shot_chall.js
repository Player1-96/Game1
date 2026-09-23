'use strict';
/* Boss 挑战模式的现场截图（4 张）
   图一 / 二：两级菜单 —— 择魔头、择难度
   图三：      开战瞬间的配装（危档：6 件法宝 + 2 个功法 + 专属 Lv2）
   图四：      进境三选一（专属技的三次手选）
   只负责「把状态摆好再按一帧」，不做断言 —— 判定归 _probe_chall.js / _t_chall.js。 */
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(250);
  const stage = await page.$('#stage');
  const shot = async f => { await stage.screenshot({ path: path.join(OUT, f) }); console.log('saved', f); };
  const settle = (ms) => page.waitForTimeout(ms || 260);

  /* ---------- 图零：择流派（三级菜单的第一级） ---------- */
  await page.evaluate(() => {
    const G = window.Game;
    G.challResult = null;          // 先不带战果提示，看清干净的菜单
    G.openChallMenu();
  });
  await settle();
  await shot('_preview_chall_style.png');

  /* ---------- 图一：择魔头 ---------- */
  await page.evaluate(() => {
    const G = window.Game;
    G.challPick(0);                // 先选中「飞剑流」
    G.challConfirm();              // → 进「择魔头」
    G.challPick(2);                // 停在裂煞魔尊上，看得出选中态
  });
  await settle();
  await shot('_preview_chall_boss.png');

  /* ---------- 图二：择难度 ---------- */
  await page.evaluate((i) => {
    const G = window.Game;
    G.challMenu.idx = i;           // 停在「危」
    G.challConfirm();
  }, 1);
  await settle();
  await shot('_preview_chall_diff.png');

  /* ---------- 图三：开战配装（危档：6 法宝 + 2 功法 + 专属 Lv2） ---------- */
  await page.evaluate(() => {
    const G = window.Game;
    G.challConfirm();              // 开战
    G.player.invuln = 99999;
    for (let i = 0; i < 14; i++) G.update();   // 让 Boss 凝形与 HUD 稳定下来
    G.draw();
    window.requestAnimationFrame = () => 0;
  });
  await settle(200);
  const loadout = await page.evaluate(() => {
    const G = window.Game, p = G.player;
    return {
      items: p.items.length, skills: p.slots.filter(Boolean).length,
      ultLv: ultLevel(p.ult), boss: G.bossRef ? G.bossRef.name + ' ' + G.bossRef.maxHp + '血' : '-',
      diff: G.chall.d.name
    };
  });
  console.log('  配装：' + loadout.diff + '档 → ' + loadout.items + ' 法宝 / '
    + loadout.skills + ' 功法 / 专属 Lv' + loadout.ultLv + '　对手 ' + loadout.boss);
  await shot('_preview_chall_fight.png');

  /* ---------- 图四：进境三选一 ---------- */
  await page.evaluate(() => {
    const G = window.Game;
    for (let i = 0; i < 40 && !G.pick; i++) G.update();
    G.draw();
    window.requestAnimationFrame = () => 0;
  });
  await settle(200);
  const pk = await page.evaluate(() => (window.Game.pick ? window.Game.pick.list.map(p => p.name) : null));
  console.log('  进境三选一：' + (pk ? pk.join(' / ') : '（未弹出）'));
  await shot('_preview_chall_ult.png');

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
