'use strict';
/* 放大对比：血量图标的各个状态（满 / 半 / 空 / 护盾），以及半心的两种画法 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 900, height: 300 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(FILE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const dataURL = await p.evaluate(() => {
    /* 按 game.js 的 HUD 逻辑拼一行心血 —— 只画，不猜 */
    const row = (maxHP, hp) => {
      const out = [];
      const total = Math.ceil(maxHP / 2);
      for (let i = 0; i < total; i++) {
        const left = hp - i * 2;
        out.push(SPR.heart[left >= 2 ? 2 : (left === 1 ? 1 : 0)]);
      }
      return out;
    };
    const rows = [
      ['① 修复前 · maxHP=7（世界树之种 +1）· 满血 7/7', row(7, 7), '最后一颗只有半颗容量，却永远显示成半心'],
      ['② 修复前 · maxHP=8 · 真的掉了半颗 7/8', row(8, 7), '和 ① 画得一模一样 —— 玩家分不清自己掉没掉血'],
      ['③ 修复后 · maxHP=8 整颗容器 · 满血 8/8', row(8, 8), '四颗整心，一眼就是满的'],
      ['④ 修复后 · 真的掉了半颗 7/8', row(8, 7), '半心从此只有一个含义：少了半颗血']
    ];
    const S = 7, CW = 62, RH = 132;
    const c = document.createElement('canvas');
    c.width = 660; c.height = RH * rows.length + 30;
    const g = c.getContext('2d');
    g.fillStyle = '#0a0812'; g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = false;
    rows.forEach((r, ri) => {
      const y = 22 + ri * RH;
      g.font = '13px sans-serif'; g.fillStyle = '#8fd8c4';
      g.fillText(r[0], 12, y - 6);
      r[1].forEach((spr, i) => g.drawImage(spr, 14 + i * CW, y, spr.width * S, spr.height * S));
      g.font = '12px sans-serif'; g.fillStyle = '#9a94b8';
      g.fillText('　' + r[2], 14, y + spr0H(r[1]) + 22);
    });
    function spr0H(arr) { return arr[0].height * S; }
    return c.toDataURL('image/png');
  });
  fs.writeFileSync(path.join(OUT, '_preview_heart_states.png'),
    Buffer.from(dataURL.split(',')[1], 'base64'));
  console.log('saved _preview_heart_states.png');
  await b.close();
})();
