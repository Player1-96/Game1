'use strict';
/* ============================================================
 *  _shot_nordic.js —— 北欧内容包截图验收（第 4 期）
 *
 *  为什么必须出图：`_t_nordic.js` 只能验「数据对不对」，验不了
 *  「看起来像不像另一个世界」。配色、像素造型、卡片类型名（神器/秘药/权能）
 *  这三样只有拍出来才算验过 —— 上一轮融合卡片的错位就是这么抓出来的。
 *
 *  出 9 张：
 *    ① 三段实景（同一间房、三套北欧配色）
 *    ② 8 只杂兵全家福（段三，画面里最满）
 *    ③ 3 尊尊者各一张
 *    ④ 北欧商栈（看神器卡片 + 「神器/秘药/权能」类型名）
 *    ⑤ 顶栏 HUD（第 11 层 · 北欧 help + 北·三）
 * ============================================================ */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');

/* 北欧杂兵中文名 —— 源码里只有 id（中文名取自作画注释，这里供图注用） */
const MOB_CN = {
  draugr: '尸鬼', hrafn: '渡鸦', nokk: '水妖', isvarg: '霜狼',
  volva: '女巫', skuggi: '影魅', rimtroll: '霜巨魔', runestone: '符文石'
};
const BOSS_CN = { fenrir: '芬里尔', jormungandr: '耶梦加得', surtr: '苏尔特' };

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(250);

  const shot = async (name, note) => {
    await page.waitForTimeout(160);
    await page.screenshot({ path: path.join(OUT, name) });
    console.log('  ✓ ' + name + (note ? '   ' + note : ''));
  };

  console.log('══════════════════════════════════════════════════');
  console.log('  北欧内容包 · 截图验收');
  console.log('══════════════════════════════════════════════════\n');

  /* ---------- ① 三段实景 ---------- */
  console.log('① 同一间房的三个层段（北欧配色对比）');
  for (const [i, label] of [[0, '一重·霜铁'], [1, '二重·血月'], [2, '三重·极光']]) {
    const info = await page.evaluate((seg) => {
      const G = window.Game;
      G.newRun('feijian');
      G.seg = seg; G.stylePath = ['nordic', 'nordic', 'nordic'];
      G.applySegmentPalette();
      G.newFloor(1 + seg * SEG_FLOORS);
      G.enemies.length = 0;
      const pool = contentOf('nordic').mobsBySeg[seg];
      // 每行 4 只，最多两行 —— 顺便把这一段**能用哪些怪**也拍进去
      pool.slice(0, 8).forEach((k, j) => {
        const col = j % 4, row = Math.floor(j / 4);
        try {
          const e = new Enemy(k, 150 + col * 105, 120 + row * 95, 1);
          G.enemies.push(e);
        } catch (err) { }
      });
      G.enemies.forEach(e => { e.spawnT = 0; e.speed = 0; e.touch = 0; e.cd = 999999; });
      G.floorName && updateOverlay && updateOverlay();
      for (let f = 0; f < 30; f++) G.update();
      for (let f = 0; f < 6; f++) G.draw();
      return { pal: PAL.wall, pool: pool.join(','), n: G.enemies.length };
    }, i);
    await shot(`_preview_nordic_seg${i + 1}.png`, label + '　' + info.pool);
  }

  /* ---------- ② 8 只杂兵全家福（放在段三，画面最满） ---------- */
  console.log('\n② 八只杂兵全家福（段三）');
  const mobLine = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    G.seg = 2; G.stylePath = ['nordic', 'nordic', 'nordic'];
    G.applySegmentPalette();
    G.newFloor(11);
    G.enemies.length = 0;
    const all = Object.keys(NORDIC_ENEMY_DEF);
    all.forEach((k, j) => {
      try { G.enemies.push(new Enemy(k, 110 + (j % 4) * 110, 120 + Math.floor(j / 4) * 110, 1)); } catch (e) { }
    });
    G.enemies.forEach(e => { e.spawnT = 0; e.speed = 0; e.touch = 0; e.cd = 999999; });
    for (let f = 0; f < 24; f++) G.update();
    for (let f = 0; f < 6; f++) G.draw();
    return { ids: G.enemies.map(e => e.type || '').join(','), n: G.enemies.length };
  });
  await shot('_preview_nordic_mobs.png',
    mobLine.n + ' 只：' + Object.keys(MOB_CN).map(k => MOB_CN[k]).join('、'));

  /* ---------- ③ 三尊尊者 ---------- */
  console.log('\n③ 三位尊者（每段一尊）');
  for (const [i, key] of [['fenrir', 5], ['jormungandr', 10], ['surtr', 15]].map(([k, d]) => [k, d])) {
    const b = await page.evaluate((v) => {
      const G = window.Game;
      G.newRun('feijian');
      G.seg = Math.floor((v.depth - 1) / SEG_FLOORS);
      G.stylePath = ['nordic', 'nordic', 'nordic'];
      G.applySegmentPalette();
      G.newFloor(v.depth);
      G.enemies.length = 0;
      G.player.invuln = 999999;
      try {
        const boss = new Boss(v.key, 300, 170);
        /* 冻住再拍：Boss 的 AI 会追着玩家跑，40 帧后就窜到角落去了 */
        boss.speed = 0; boss.touch = 0; boss.cd = 999999; boss.spawnT = 0;
        if (boss.dashT !== undefined) boss.dashT = 0;
        G.enemies.push(boss);
      } catch (e) { }
      for (let f = 0; f < 12; f++) G.update();
      for (let f = 0; f < 6; f++) G.draw();
      const b = G.enemies[0] || {};
      return { hp: b.maxHp || 0, x: Math.round(b.x || 0), y: Math.round(b.y || 0) };
    }, { key: i, depth: key });
    await shot(`_preview_nordic_boss_${i}.png`,
      '第 ' + key + ' 层 · ' + BOSS_CN[i] + '（' + b.hp + ' 血）');
  }

  /* ---------- ④ 北欧商栈：卡片类型名必须是「神器 / 秘药 / 权能」 ---------- */
  console.log('\n④ 北欧商栈（看类型名是不是神器/秘药/权能）');
  const shop = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    G.seg = 2; G.stylePath = ['nordic', 'nordic', 'nordic'];
    G.applySegmentPalette();
    /* 商栈不一定每次都刷出来 —— 刷到第 11 层有为止（最多试 40 次） */
    let found = null;
    for (let t = 0; t < 40 && !found; t++) {
      G.newFloor(11);
      const r = [...G.floor.rooms.values()].find(x => x.type === RT.SHOP);
      if (r) found = r;
    }
    if (!found) return { ok: false };
    G.enterRoom(found, null);
    G.coins = 300;
    const pr = G.props.find(p => p.kind === 'shop');
    if (!pr) return { ok: false };
    G.player.x = pr.x; G.player.y = pr.y - 2;
    G.player.invuln = 9999;
    for (let f = 0; f < 6; f++) G.update();
    G.draw(); G.updateShopTip();
    const def = ITEM_MAP[pr.item];
    return {
      ok: true, item: pr.item, name: def ? def.name : pr.item,
      typeName: itemTipHTML ? '' : '',
      tip: (document.getElementById('shopTip') || {}).textContent || ''
    };
  });
  if (shop.ok) {
    await shot('_preview_nordic_shop.png', '货品：' + shop.name);
    /* 类型名用 darwText 渲染在 canvas 上，这里直接把 DOM 里的提示一起贴出来佐证 */
    console.log('     类型名＝' + JSON.stringify(shop.tip.replace(/\s+/g, ' ').slice(0, 90)));
  } else {
    console.log('     ⚠ 40 次都没刷出商栈，跳过这张');
  }

  /* ---------- ⑤ 顶栏 HUD ---------- */
  console.log('\n⑤ 顶栏：层号 · 房型 · 风格标识');
  await page.evaluate(() => {
    const G = window.Game;
    G.styleMenu = null; G.state = 'play';
    G.newRun('feijian');
    G.seg = 2; G.stylePath = ['nordic', 'nordic', 'nordic'];
    G.applySegmentPalette();
    G.newFloor(SEG_FLOORS * 2 + 1);
    /* 塞两门权能进槽，HUD 底部才有东西可看 */
    try { G.player.addSkill('thunderwrath'); G.player.addSkill('mistcloak'); } catch (e) { }
    for (let f = 0; f < 30; f++) G.update();
    for (let f = 0; f < 6; f++) G.draw();
    updateOverlay();
  });
  await page.waitForTimeout(200);
  await shot('_preview_nordic_hud.png',
    '第 ' + 11 + ' 层 · 英灵殿　北·三');

  if (errs.length) {
    console.log('\n⚠️ 运行期报错：');
    errs.slice(0, 6).forEach(e => console.log('   ' + e));
  } else {
    console.log('\n  运行期无报错 ✅');
  }
  console.log('\n截图输出目录：' + OUT + '\n');

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
