/* ============================================================
 *  _shot_icons.js —— 全道具图标总览
 *
 *  用途：一眼看出「哪些道具长得一样」。同形状的排在一起，
 *  并且把「同 icon 且同配色」的组标红 —— 那种情况画出来是同一个位图，
 *  玩家只能靠位置猜，是 2026-09-21「灵力丹看起来占用了法宝格」的真因。
 *
 *  加新道具后跑一次这个脚本即可自查，不必逐个回忆配色。
 *  跑法：node dev/shot/_shot_icons.js
 * ============================================================ */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });

  const res = await page.evaluate(() => {
    const S = 4, N = 16 * S, CW = N + 18, CH = N + 36, COLS = 8;
    const groups = {};
    for (const d of Object.values(ITEM_MAP)) (groups[d.icon] = groups[d.icon] || []).push(d);

    // 多成员组排前面（撞车风险集中在那里），组内按类型名排
    const keys = Object.keys(groups).sort((a, b) =>
      groups[b].length - groups[a].length || a.localeCompare(b));
    const list = [];
    const dupGroups = [];
    for (const k of keys) {
      const g = groups[k];
      const c12 = new Set(g.map(d => d.c1 + '|' + d.c2));
      const clash = g.length > 1 && c12.size < g.length;   // 有道具配色重复
      if (clash) dupGroups.push({ icon: k, items: g.map(d => d.name) });
      for (const d of g) list.push({ d, k, n: g.length, clash });
    }

    const rows = Math.ceil(list.length / COLS);
    const cv = document.createElement('canvas');
    cv.width = COLS * CW + 16;
    cv.height = rows * CH + 46;
    const c = cv.getContext('2d');
    c.fillStyle = '#141024';
    c.fillRect(0, 0, cv.width, cv.height);
    c.textAlign = 'center';

    // 标题
    c.fillStyle = '#f2c761';
    c.font = '500 20px "Microsoft YaHei", sans-serif';
    c.fillText('道具图标总览 · ' + list.length + ' 项', cv.width / 2, 30);

    list.forEach((it, i) => {
      const col = i % COLS, row = (i / COLS) | 0;
      const x = 8 + col * CW, y = 44 + row * CH;
      // 同形状的组共用一层底色；配色也撞了的整格描红边
      if (it.n > 1) {
        c.fillStyle = it.clash ? 'rgba(224,90,98,.13)' : 'rgba(87,214,176,.07)';
        c.fillRect(x + 2, y + 2, CW - 4, CH - 4);
      }
      if (it.clash) { c.strokeStyle = '#e05a62'; c.lineWidth = 1.5; c.strokeRect(x + 2.5, y + 2.5, CW - 5, CH - 5); }
      else if (it.n > 1) { c.strokeStyle = '#3a3358'; c.lineWidth = 1; c.strokeRect(x + 2.5, y + 2.5, CW - 5, CH - 5); }

      const ic = ITEM_ICONS[it.d.id];
      if (ic) c.drawImage(ic, x + 9, y + 10, N, N);

      c.font = '13px "Microsoft YaHei", sans-serif';
      c.fillStyle = '#d8d5e6';
      c.fillText(it.d.name, x + CW / 2, y + N + 24);
      c.font = '11px sans-serif';
      c.fillStyle = '#8f8ba8';
      c.fillText(it.k, x + CW / 2, y + N + 38);
    });

    return {
      url: cv.toDataURL('image/png'),
      total: list.length,
      clashes: dupGroups,
      shared: keys.filter(k => groups[k].length > 1).map(k => k + '×' + groups[k].length)
    };
  });

  fs.writeFileSync(path.join(OUT, '_preview_icons.png'),
    Buffer.from(res.url.split(',')[1], 'base64'));
  console.log('道具总数      : ' + res.total);
  console.log('共用形状的组  : ' + (res.shared.join('  ') || '无'));
  console.log('');
  if (res.clashes.length) {
    console.log('⚠ 配色也重复的（画出来是同一个位图）:');
    res.clashes.forEach(g => console.log('   [' + g.icon + '] ' + g.items.join(' / ')));
  } else {
    console.log('✓ 没有「同形状 + 同配色」的组合');
  }
  console.log('');
  console.log('已出图: _preview_icons.png');

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 2000))]);
  process.exit(0);
})();
