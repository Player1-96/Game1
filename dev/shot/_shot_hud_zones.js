'use strict';
/* 出图：顶栏分区修复验收。
   ① 完整顶栏（最长楼层名 + 极限血量）放大后铺满图宽，标出「资源区右界 / 楼层名范围 / 消耗品起点」
      与两条间距 —— 修复前楼层名会压到右侧消耗品。
   ② 三个流派的专属技格子并排放大 —— 修复前「流派图标」会压住「L5 / 段位数字」。
   ⚠️ 截图拿到的是**页面像素**（已经是 canvas 的 ~1.93 倍），再乘倍数很容易超宽被裁 ——
      所以这里统一用「图上宽度 ÷ 480」当作 canvas→图的换算比。 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1019, height: 752 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(FILE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const geom = await p.evaluate(() => {
    const G = window.Game;
    G.newRun('wujian');
    G.stylePath = ['cn', 'cn', 'nordic'];
    G.seg = 2;
    G.applySegmentPalette();
    G.newFloor(11);
    G.state = 'play';
    const pl = G.player;
    pl.maxHP = 40; pl.hp = 40; pl.shield = 12; pl.tShield = 0; pl.mp = 100; pl.maxMP = 100;
    pl.ult = { style: 'wujian', lv: 5 };
    pl.ultCd = 0; pl.wjStage = 0; pl.wjChainT = 0;
    G.itemPopup = null;
    updateOverlay();
    G.draw();
    const cv = document.getElementById('game');
    const r = cv.getBoundingClientRect();
    const scale = r.width / 480;
    const fn = document.getElementById('floorName').getBoundingClientRect();
    return { stageLeft: r.left, stageTop: r.top, stageW: r.width, scale: scale,
             floor: { x0: +((fn.left - r.left) / scale).toFixed(1), x1: +((fn.right - r.left) / scale).toFixed(1) } };
  });

  const barH = Math.round(34 * geom.scale);
  const barShot = await p.screenshot({
    clip: { x: geom.stageLeft, y: geom.stageTop, width: geom.stageW, height: barH }
  });

  const cells = [];
  for (const st of ['feijian', 'jujian', 'wujian']) {
    await p.evaluate((st2) => {
      const G = window.Game;
      G.newRun(st2);
      G.newFloor(1);
      G.state = 'play';
      const pl = G.player;
      pl.ult = { style: st2, lv: 5 };
      pl.ultCd = 0; pl.wjStage = 0; pl.wjChainT = 0;
      G.itemPopup = null;
      updateOverlay();
      G.draw();
    }, st);
    const shot = await p.screenshot({
      clip: { x: geom.stageLeft + 444 * geom.scale, y: geom.stageTop,
              width: 36 * geom.scale, height: 34 * geom.scale }
    });
    cells.push({ style: st, b64: shot.toString('base64') });
  }

  const png = await p.evaluate(({ bar, cells, geom }) => {
    const load = (b64) => new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.src = 'data:image/png;base64,' + b64;
    });
    return Promise.all([load(bar)].concat(cells.map(c => load(c.b64)))).then((imgs) => {
      const barImg = imgs[0], cellImgs = imgs.slice(1);
      const W = 880, PAD = 20;
      const barDrawW = W - PAD * 2;
      const barDrawH = Math.round(barDrawW * barImg.height / barImg.width);
      const K = barDrawW / 480;                       // canvas x → 图上 x
      const px = (cx) => PAD + cx * K;

      /* 三格并排：每格占 (W - 2*PAD - 2*gap) / 3 */
      const gap = 26;
      const cellW = Math.round((barDrawW - gap * 2) / 3);
      const cellH = Math.round(cellW * cellImgs[0].height / cellImgs[0].width);

      const H = 34 + barDrawH + 92 + 26 + cellH + 40;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#0e0a1a'; g.fillRect(0, 0, W, H);

      g.font = 'bold 16px sans-serif'; g.fillStyle = '#8fd8c4';
      g.fillText('顶栏分区 · 楼层名不再挤进两侧', PAD, 26);

      /* ---- ① 顶栏 ---- */
      const by = 38;
      g.drawImage(barImg, PAD, by, barDrawW, barDrawH);
      g.strokeStyle = '#f2c761'; g.lineWidth = 2;
      g.strokeRect(px(geom.floor.x0), by - 3, px(geom.floor.x1) - px(geom.floor.x0), barDrawH + 6);
      g.strokeStyle = '#e0525f'; g.setLineDash([5, 4]);
      g.beginPath(); g.moveTo(px(161), by - 3); g.lineTo(px(161), by + barDrawH + 6); g.stroke();
      g.beginPath(); g.moveTo(px(345), by - 3); g.lineTo(px(345), by + barDrawH + 6); g.stroke();
      g.setLineDash([]);
      g.font = '11px sans-serif';
      g.fillStyle = '#e0525f';
      g.fillText('资源区右界 161', px(161) - 44, by - 7);
      g.fillText('消耗品起点 345', px(345) - 44, by - 7);
      g.fillStyle = '#f2c761';
      g.fillText('楼层名 ' + geom.floor.x0 + '~' + geom.floor.x1, px(geom.floor.x0), by + barDrawH + 22);
      g.fillStyle = '#8fd8c4';
      g.fillText('← 30.8px →', px(161) + 8, by + barDrawH + 22);
      g.fillText('← 18.4px →', px(geom.floor.x1) + 8, by + barDrawH + 22);
      g.fillStyle = '#9a94b8';
      g.fillText('（20 颗心 / 12 格护盾压缩显示；「第十一层 · 英灵殿　北·三」—— 两侧都顶到极限）',
        PAD, by + barDrawH + 42);

      /* ---- ② 专属技格子 ---- */
      const cy = by + barDrawH + 66;
      g.font = 'bold 14px sans-serif'; g.fillStyle = '#c9c4e0';
      g.fillText('专属技格子：流派图标不再压住「L5 / 段位数字」', PAD, cy - 8);
      const label = { feijian: '飞剑流', jujian: '巨剑流', wujian: '舞剑流' };
      const sizes = ['图标 20x8', '图标 30x14', '图标 20x9'];
      const notes = ['图标 y8.8~15.2 / 文字 y19 → 余 3.8px',
                     '图标 y6.4~17.6 / 文字 y19 → 余 1.4px',
                     '图标 y8.4~15.6 / 文字 y19 → 余 3.4px'];
      const cyy = cy + 8;
      cellImgs.forEach((im, i) => {
        const x = PAD + i * (cellW + gap);
        g.drawImage(im, x, cyy, cellW, cellH);
        g.strokeStyle = '#2e2748'; g.lineWidth = 1; g.strokeRect(x, cyy, cellW, cellH);
        g.font = '12px sans-serif'; g.fillStyle = '#8fd8c4';
        g.fillText(label[cells[i].style] + '　' + sizes[i], x, cyy + cellH + 18);
        g.font = '10px sans-serif'; g.fillStyle = '#9a94b8';
        g.fillText(notes[i], x, cyy + cellH + 32);
      });

      g.font = '12px sans-serif'; g.fillStyle = '#6b6486';
      g.fillText('修复前：楼层名按「画面」居中（left:50%）会压到右侧消耗品（重叠 77×16px）；专属技格子里图标居中，', PAD, H - 26);
      g.fillText('三个流派都压住下半格的文字（巨剑流 2.6px / 舞剑流 0.6px / 飞剑流 0.2px）。', PAD, H - 10);
      return c.toDataURL('image/png');
    });
  }, { bar: barShot.toString('base64'), cells: cells, geom: geom });

  fs.writeFileSync(path.join(OUT, '_preview_hud_zones_fix.png'), Buffer.from(png.split(',')[1], 'base64'));
  console.log('saved _preview_hud_zones_fix.png');
  console.log('  楼层名 canvas x ' + geom.floor.x0 + '~' + geom.floor.x1);
  await b.close();
})();
