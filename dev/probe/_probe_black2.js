'use strict';
/* 扫「黑屏」：对每个可能的状态，检查 draw() 之后的画面到底是不是一片黑，
   以及 room 为空时会不会直接抛异常。
   用户 2026-10-09 打到第 10 层黑屏（canvas 全黑 + HUD 全无，但顶栏 DOM 还在）。 */
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');

const isAllBlack = `(() => {
  const cv = document.getElementById('game');
  const d = cv.getContext('2d').getImageData(0, 0, 480, 320).data;
  let nonBg = 0, sample = null;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 26 || d[i+1] > 24 || d[i+2] > 36) { nonBg++; if (!sample) sample = [d[i], d[i+1], d[i+2]]; }
  }
  return { nonBgPx: nonBg, sample: sample, total: d.length / 4 };
})()`;

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await p.goto(FILE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const r = await p.evaluate(({ isAllBlack }) => {
    const G = window.Game;
    const ink = (code) => new Function('return ' + code)();

    /* 先建一个正常的第 10 层 */
    G.newRun('wujian');
    G.stylePath = ['cn', 'nordic', 'nordic'];
    G.seg = 1; G.applySegmentPalette();
    G.newFloor(10);
    G.state = 'play';

    const rows = [];
    const STATES = ['play', 'dead', 'win', 'stylePick', 'choose', 'chall', 'endlessEnd', 'fusion', 'title'];
    for (const st of STATES) {
      G.state = st;
      let err = null;
      try { G.draw(); } catch (e) { err = e.message; }
      const px = ink(isAllBlack);
      rows.push({ state: st, err: err,
                  black: px.nonBgPx < 400, nonBg: px.nonBgPx, room: !!G.room,
                  floorName: document.getElementById('floorName').textContent });
    }
    G.state = 'play';

    /* 极端：room 为空时 draw 会怎样 */
    const keepRoom = G.room;
    G.room = null;
    let errNoRoom = null;
    try { G.draw(); } catch (e) { errNoRoom = e.message; }
    const px2 = ink(isAllBlack);
    G.room = keepRoom;

    /* 极端：bg 精灵缺失（buildSprites 半途失败的样子） */
    const keepBg = G.room.bg;
    G.room.bg = undefined;
    let errNoBg = null;
    try { G.draw(); } catch (e) { errNoBg = e.message; }
    G.room.bg = keepBg;

    return { rows: rows, errNoRoom: errNoRoom, errNoBg: errNoBg,
             blackNoRoom: px2.nonBgPx < 400, nonBgNoRoom: px2.nonBgPx };
  }, { isAllBlack: isAllBlack });

  console.log('--- 各状态下的 draw() 结果 ---');
  console.log('  ' + '状态'.padEnd(12) + '异常'.padEnd(30) + '画面');
  r.rows.forEach(x => {
    console.log('  ' + x.state.padEnd(12)
      + String(x.err || '—').slice(0, 28).padEnd(30)
      + (x.black ? '❌ 一片黑' : '✅ 有内容') + '（非背景像素 ' + x.nonBg + '）');
  });
  console.log('\n--- 极端情形 ---');
  console.log('  room = null    → ' + (r.errNoRoom ? '抛出「' + r.errNoRoom + '」' : '没抛异常')
    + '，画面' + (r.blackNoRoom ? '❌ 一片黑' : '✅ 有内容'));
  console.log('  room.bg = 缺失 → ' + (r.errNoBg ? '抛出「' + r.errNoBg + '」' : '没抛异常'));
  if (errs.length) console.log('\n页面错误: ' + errs.slice(0, 3).join(' | '));
  await b.close();
})();
