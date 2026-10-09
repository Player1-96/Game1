'use strict';
/* 全量量一遍用户截图顶栏：心（红）/ 护甲（橙）/ 灵力条（蓝）各自的簇与位置。
   目的：搞清楚他看到的 HUD 到底是怎么排的，以及哪两块挤在一起。
   用户 2026-10-09：「护甲的展示还是遮挡到流派的图标了」。 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const SRC = process.argv[2];
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 600, height: 300 } });
  const b64 = fs.readFileSync(SRC).toString('base64');
  await p.setContent('<canvas id="c"></canvas>');
  const r = await p.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.getElementById('c');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const W = img.width, H = img.height;
    const px = (x, y) => { const d = g.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; };

    const scan = (test, y0, y1, x0, x1) => {
      const pts = [];
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (test(px(x, y))) pts.push([x, y]);
      pts.sort((a, b2) => a[0] - b2[0]);
      const cl = [];
      for (const [x, y] of pts) {
        const last = cl[cl.length - 1];
        if (last && x - last.maxX <= 3) { last.maxX = x; last.minY = Math.min(last.minY, y); last.maxY = Math.max(last.maxY, y); last.n++; }
        else cl.push({ minX: x, maxX: x, minY: y, maxY: y, n: 1 });
      }
      return cl.filter(o => o.n > 8).map(o => ({
        x0: o.minX, x1: o.maxX, y0: o.minY, y1: o.maxY,
        w: o.maxX - o.minX + 1, h: o.maxY - o.minY + 1,
        cx: Math.round((o.minX + o.maxX) / 2), n: o.n
      }));
    };

    /* 顶栏整体：y 40~140 */
    const red = scan((q) => q[0] > 140 && q[1] < 80 && q[2] < 80, 40, 140, 0, W);
    const orange = scan((q) => q[0] > 150 && q[1] > 60 && q[1] < 175 && q[2] < 120, 40, 140, 0, W);
    const blue = scan((q) => q[2] > 150 && q[0] < 140, 40, 140, 0, W);
    return { W: W, H: H, red: red, orange: orange, blue: blue };
  }, b64);

  const fmt = (arr, label) => {
    console.log('\n--- ' + label + '（' + arr.length + ' 簇）---');
    arr.forEach(o => console.log('  x ' + String(o.x0).padStart(4) + '~' + String(o.x1).padStart(4)
      + ' (宽' + String(o.w).padStart(3) + ')  y ' + String(o.y0).padStart(3) + '~' + String(o.y1).padStart(3)
      + '  中心x=' + String(o.cx).padStart(4) + '  ' + o.n + 'px'));
    if (arr.length) {
      const xs = arr.map(o => o.cx);
      const d = xs.slice(1).map((v, i) => v - xs[i]).filter(v => v > 0 && v < 40);
      if (d.length) console.log('  → 相邻中心间距: ' + d.join('/') + '（中位 ' + d.sort((a, b2) => a - b2)[Math.floor(d.length / 2)] + '）');
      console.log('  → 整排跨度: x ' + arr[0].x0 + ' ~ ' + arr[arr.length - 1].x1);
    }
  };
  console.log('截图 ' + r.W + 'x' + r.H);
  fmt(r.red, '红色（心）');
  fmt(r.orange, '橙色（护甲）');
  fmt(r.blue, '蓝色（灵力条）');
  await b.close();
})();
