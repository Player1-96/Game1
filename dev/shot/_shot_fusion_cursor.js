'use strict';
/* 出图：融合面板里，方向键的落点对比（修前 = 整池都能停 / 修后 = 只停能融的）。
   数据不写死 —— 跑一遍真实的 fusionPool / fusionCursor 再画。 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 820, height: 420 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(FILE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const dataURL = await p.evaluate(() => {
    const G = window.Game;
    const nameOf = id => (ITEM_MAP[id] || {}).name || id;

    /* 手牌：从配方表取 10 件，保证池子够大 */
    const mats = [];
    for (const rec of FUSION_DEF) {
      if (mats.indexOf(rec.a) < 0) mats.push(rec.a);
      if (mats.indexOf(rec.b) < 0) mats.push(rec.b);
      if (mats.length >= 10) break;
    }
    G.newRun('feijian'); G.state = 'play';
    const pl = G.player;
    pl.items.length = 0; pl.recomputeStats('feijian');
    for (const id of mats) pl.give(id, G);
    G.itemPopup = null;
    G.room.obstacles.length = 0;
    const spot = G.spotForProp(ROOM_W / 2, ROOM_H / 2, 16);
    const prop = new Prop('forge', spot.x, spot.y, { kind: 'forge' });
    G.props.push(prop);
    pl.x = prop.x; pl.y = prop.y;
    G.openFusion(prop);

    const pool = G.fusion.pool, N = pool.length;
    /* 第一槽选「伙伴最多的枢纽件」——那正是最容易按到手酸的情形 */
    const partners = id => pool.filter(x => x !== id && !!fusionRecipeOf(id, x)).length;
    let pickAt = -1, best = -1;
    pool.forEach((id, i) => { const n = partners(id); if (n > best) { best = n; pickAt = i; } });
    const pickId = pool[pickAt];
    G.fusion.idx = pickAt;
    G.fusionTake();
    const cand = G.fusionCursor();
    /* 口径用「绕一圈要按几下」——最没争议：修前整池 N 步，修后候选数步 */
    const worstBefore = N;
    const worstAfter = cand.length;

    return {
      cells: pool.map((id, i) => ({
        name: nameOf(id),
        can: !!fusionRecipeOf(pickId, pool[i]),
        picked: id === pickId
      })),
      poolN: N, candN: cand.length, worstBefore: worstBefore, worstAfter: worstAfter,
      firstPick: nameOf(pickId)
    };
  });

  /* ---- 用 canvas 自己画一张图（比截游戏画面清楚） ---- */
  const png = await p.evaluate((d) => {
    const W = 780, BG = '#0e0a1a', TXT = '#e8e6f5', DIM = '#5a5476',
          JADE = '#8fd8c4', GOLD = '#f2c761', GREY = '#211c36', RED = '#e0525f';
    const CW = 68, CH2 = 46, GAP = 6, PAD = 24;
    const rows = 2;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = 132 + rows * (CH2 + 46) + 96;
    const g = c.getContext('2d');
    g.fillStyle = BG; g.fillRect(0, 0, c.width, c.height);

    g.font = 'bold 17px sans-serif'; g.fillStyle = JADE;
    g.fillText('融合阵 · 方向键的落点', PAD, 34);
    g.font = '12px sans-serif'; g.fillStyle = DIM;
    g.fillText('手里 ' + d.poolN + ' 件法宝，第一槽已放入「' + d.firstPick + '」', PAD, 54);

    const drawRow = (y, title, showAll, note, noteCol) => {
      g.font = 'bold 13px sans-serif'; g.fillStyle = '#c9c4e0';
      g.fillText(title, PAD, y - 10);

      const x0 = PAD;
      d.cells.forEach((cell, i) => {
        const x = x0 + i * (CW + GAP);
        const isCand = showAll || cell.can;
        /* 底 */
        g.fillStyle = isCand ? (cell.picked ? 'rgba(242,199,97,.24)' : 'rgba(80,220,190,.22)') : GREY;
        g.fillRect(x, y, CW, CH2);
        g.lineWidth = cell.picked ? 2 : (isCand ? 2 : 1);
        g.strokeStyle = cell.picked ? GOLD : (isCand ? JADE : '#332d52');
        g.strokeRect(x + 0.5, y + 0.5, CW - 1, CH2 - 1);
        /* 名字（两行截断） */
        g.font = '11px sans-serif';
        g.fillStyle = isCand ? (cell.picked ? GOLD : TXT) : DIM;
        const nm = cell.name;
        if (nm.length > 5) {
          g.fillText(nm.slice(0, 5), x + 6, y + 19);
          g.fillText(nm.slice(5, 10), x + 6, y + 33);
        } else {
          g.fillText(nm, x + 6, y + 26);
        }
        if (cell.picked) {
          g.font = '9px sans-serif'; g.fillStyle = GOLD;
          g.fillText('已放入', x + CW - 34, y + CH2 - 5);
        }
        /* 光标可停的标记：实心块（比字符更不容易被缩放吃掉） */
        if (isCand) {
          g.fillStyle = cell.picked ? GOLD : JADE;
          g.fillRect(x + CW - 12, y + 6, 7, 7);
        }
        /* 灰格右上角画一道短斜杠：一眼看出「这里走不上去」。
           ⚠️ 已经放进槽位的那件要排除 —— 它同样不在候选里，但它是「已放入」，
              再画个「走不上去」的斜杠会让人以为它废了。 */
        if (!isCand && !cell.picked) {
          g.strokeStyle = '#4a4270'; g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(x + CW - 13, y + 6); g.lineTo(x + CW - 6, y + 13);
          g.stroke();
        }
      });

      /* 串起落点的箭头（看图就知道要按几下） */
      const stops = d.cells.map((cell, i) => (showAll || cell.can) ? i : -1).filter(i => i >= 0);
      g.strokeStyle = noteCol; g.lineWidth = 2; g.setLineDash([]);
      g.beginPath();
      stops.forEach((idx, k) => {
        const cx = x0 + idx * (CW + GAP) + CW / 2;
        const yy = y + CH2 + 16;
        if (k === 0) g.moveTo(cx, yy); else g.lineTo(cx, yy);
      });
      g.stroke();
      stops.forEach(idx => {
        const cx = x0 + idx * (CW + GAP) + CW / 2;
        g.fillStyle = noteCol;
        g.beginPath(); g.arc(cx, y + CH2 + 16, 3, 0, Math.PI * 2); g.fill();
      });

      g.font = 'bold 12px sans-serif'; g.fillStyle = noteCol;
      g.fillText(note, PAD, y + CH2 + 40);
    };

    drawRow(84,
      '① 之前：整池 ' + d.poolN + ' 格，灰的也能停',
      true,
      '想找遍所有组合得在一整圈里按 ' + d.worstBefore + ' 次方向键', RED);
    drawRow(84 + CH2 + 46 + 34,
      '② 现在：只停在能融的 ' + d.candN + ' 格上',
      false,
      '灰格直接跳过 —— 绕一圈只要 ' + d.worstAfter + ' 次，灰格命中 0 次', JADE);

    g.font = '12px sans-serif'; g.fillStyle = DIM;
    g.fillText('■ = 方向键能停的位置　·　灰格右上角的斜杠 = 光标走不上去（仍然画出来，可融性看得见）', PAD, c.height - 34);
    g.fillStyle = GOLD;
    g.fillText('放完第一件后光标会自动吸附到最近的可融项，不用先空按一次', PAD, c.height - 14);

    return c.toDataURL('image/png');
  }, dataURL);

  fs.writeFileSync(path.join(OUT, '_preview_fusion_cursor.png'),
    Buffer.from(png.split(',')[1], 'base64'));
  console.log('saved _preview_fusion_cursor.png');
  console.log('  候选明细: ' + dataURL.cells.map(c => c.name + (c.picked ? '(已放入)' : c.can ? '◆' : '·灰')).join('  '));
  console.log('  池 ' + dataURL.poolN + ' 件 / 第一槽 ' + dataURL.firstPick
    + ' / 候选 ' + dataURL.candN + ' 件 / 最坏按键 ' + dataURL.worstBefore + ' -> ' + dataURL.worstAfter);
  await b.close();
})();
