'use strict';
/* 剪影测试：把中式 12 只杂兵各画一份「彩色 + 纯黑剪影」并排印成两行。
   目的：**唯一客观的造型验收** —— 认不出的那一只才是真要重画的。
   （ROADMAP 四之二 ② 的第一条要求；本文件同时是方案里第 0 步的产物）
   产物：dev/preview/_preview_silhouette_cn.png */
const { chromium } = require('playwright');
const path = require('path');
const BASE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
/* 用法：node _shot_silhouette.js [cn|nordic]（默认 cn） */
const WORLD = (process.argv[2] === 'nordic') ? 'nordic' : 'cn';
const OUT = path.resolve(__dirname, '..', 'preview', '_preview_silhouette_' + WORLD + '.png');
const LABEL = WORLD === 'nordic' ? '北欧' : '中式';

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1180, height: 720 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(BASE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.waitForTimeout(200);

  const info = await p.evaluate(({ WORLD, LABEL }) => {
    /* 北欧得先把图集切过去（素材是按世界整表替换的） */
    if (WORLD === 'nordic') { setStyle('nordic', 0); buildSprites('nordic', 0); }
    const DEF = WORLD === 'nordic' ? NORDIC_ENEMY_DEF : ENEMY_DEF;
    const IDS = Object.keys(DEF);
    const SCALE = 7;
    const GAP = 18;
    const host = document.createElement('div');
    host.id = 'sil';
    host.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;background:#efeae2;padding:16px 18px;'
      + 'font:13px/1.4 "Microsoft YaHei",sans-serif;color:#211c2e';
    const h = document.createElement('div');
    h.textContent = LABEL + ' ' + IDS.length + ' 只杂兵 · 彩色 / 剪影（建议隔两米看能不能两两区分）';
    h.style.cssText = 'font-size:15px;font-weight:700;margin-bottom:10px';
    host.appendChild(h);

    const row = (list, title) => {
      const t = document.createElement('div');
      t.textContent = title;
      t.style.cssText = 'font-size:12px;color:#6b6280;margin:8px 0 4px';
      host.appendChild(t);
      const line = document.createElement('div');
      line.style.cssText = 'display:flex;flex-wrap:wrap;gap:' + GAP + 'px;align-items:flex-end';
      list.forEach(id => {
        const frames = SPR.enemies[DEF[id].spr];
        const src = frames && frames[0];
        const cell = document.createElement('div');
        cell.style.cssText = 'text-align:center';
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;gap:6px;align-items:flex-end;'
          + 'background:rgba(0,0,0,.03);padding:4px;border-radius:4px';
        if (!src) { wrap.textContent = '（无素材）'; }
        else {
          const mk = (sil) => {
            const c = document.createElement('canvas');
            c.width = src.width * SCALE; c.height = src.height * SCALE;
            const g = c.getContext('2d');
            g.imageSmoothingEnabled = false;
            /* 剪影要在「同尺寸、同位置」上比，所以两张都用同一个 canvas 尺寸 */
            const off = document.createElement('canvas');
            off.width = src.width; off.height = src.height;
            off.getContext('2d').drawImage(src, 0, 0);
            if (sil) {
              const g0 = off.getContext('2d');
              const d = g0.getImageData(0, 0, off.width, off.height);
              for (let i = 0; i < d.data.length; i += 4) {
                if (d.data[i + 3] > 90) { d.data[i] = 0; d.data[i + 1] = 0; d.data[i + 2] = 0; d.data[i + 3] = 255; }
                else d.data[i + 3] = 0;
              }
              g0.putImageData(d, 0, 0);
            }
            g.drawImage(off, 0, 0, c.width, c.height);
            c.style.cssText = 'display:block;image-rendering:pixelated';
            return c;
          };
          wrap.appendChild(mk(false));
          wrap.appendChild(mk(true));
        }
        cell.appendChild(wrap);
        const lb = document.createElement('div');
        lb.textContent = DEF[id].name + '（' + id + '）';
        lb.style.cssText = 'font-size:11px;color:#3b3350;margin-top:5px';
        cell.appendChild(lb);
        line.appendChild(cell);
      });
      host.appendChild(line);
    };

    row(IDS.slice(0, Math.ceil(IDS.length / 2)), WORLD === 'nordic' ? '按段解锁的前几只' : '第 1~3 层常见的 6 只（玩家第一印象区）');
    row(IDS.slice(Math.ceil(IDS.length / 2)), WORLD === 'nordic' ? '后半段才出现的' : '第 2~4 层起出现的 6 只');
    document.body.appendChild(host);
    return { n: IDS.length, ids: IDS };
  }, { WORLD, LABEL });
  console.log('共 ' + info.n + ' 只：' + info.ids.join(' '));
  await p.waitForTimeout(400);
  const el = await p.$('#sil');
  await el.screenshot({ path: OUT });
  console.log('已出图 → ' + OUT);
  await Promise.race([b.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})().catch(e => { console.log('FATAL', (e && e.stack) || e); process.exit(1); });
