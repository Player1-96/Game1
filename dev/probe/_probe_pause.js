'use strict';
/* 探针 + 出图：暂停功能。
   1) 按 P 后世界是否真的停住（tick 不再推进）
   2) 暂停期间画面是否照画（不黑屏）
   3) 恢复后是否接着走、且不会一次补跑好几帧
*/
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 820 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console.error] ' + m.text()); });
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(250);

  const r = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('wujian');
    G.state = 'play';
    const out = {};
    let ts = 1000;
    /* 用整数毫秒模拟真实 rAF 时间戳：浮点累加会让 dt 恰好卡在 step 边界上，
       出现「这一帧没推进」的假象 —— 那是测试的问题，不是暂停的问题。 */
    const run = (n) => { for (let i = 0; i < n; i++) { ts += 17; G.frame(ts); } };

    run(30);
    out.tickBeforePause = G.tick;
    out.pausedInit = G.paused;

    G.togglePause();                       // 暂停
    out.pausedAfterToggle = G.paused;
    out.mouseDownCleared = G.input.mouseDown === false;
    run(60);                               // 暂停期间推进 1 秒
    out.tickWhilePaused = G.tick;
    out.frozen = (G.tick === out.tickBeforePause);

    G.togglePause();                       // 恢复
    out.pausedAfterResume = G.paused;
    out.accAfterResume = +G.acc.toFixed(3);   // 应为 0 附近（没攒帧）
    run(1);
    out.tickAfterOneFrame = G.tick;        // 应 +1（或 +2），不能一次补跑一大堆
    out.deltaOneFrame = G.tick - out.tickWhilePaused;

    // 暂停时不该能重开、也不能推进 time
    const timeBefore = G.time;
    G.togglePause(); run(30);
    out.timeFrozen = (G.time === timeBefore);
    G.togglePause();

    // 非 play 状态下按 P 应无效
    G.state = 'choose';
    G.togglePause();
    out.noPauseOutsidePlay = (G.paused === false);
    G.state = 'play';

    return out;
  });

  console.log('=== 暂停功能实测 ===');
  console.log('  初始 paused            :', r.pausedInit);
  console.log('  按 P 后 paused         :', r.pausedAfterToggle, '（鼠标状态已清空:', r.mouseDownCleared, '）');
  console.log('  暂停期间推进 60 帧     : tick', r.tickBeforePause, '->', r.tickWhilePaused, r.frozen ? '✓ 完全静止' : '✗ 仍在推进');
  console.log('  恢复后 paused          :', r.pausedAfterResume, ' acc =', r.accAfterResume, r.accAfterResume < 1 ? '✓ 没攒帧' : '✗ 攒了帧');
  console.log('  恢复后推进 1 帧        : tick ' + r.tickWhilePaused + ' -> ' + r.tickAfterOneFrame + '（+' + r.deltaOneFrame + '）', (r.deltaOneFrame >= 1 && r.deltaOneFrame <= 2) ? '✓ 正常续跑、没补跑' : '✗ 异常');
  console.log('  暂停期间 time 不增长   :', r.timeFrozen ? '✓' : '✗');
  console.log('  非局内（选流派）按 P   :', r.noPauseOutsidePlay ? '✓ 无效' : '✗ 会暂停');
  console.log('  页面错误               :', errs.length ? errs.join(' | ') : '无');

  // 出一张暂停画面
  await page.evaluate(() => {
    const G = window.Game;
    if (!G.paused) G.togglePause();
    G.draw();
  });
  const cv = await page.$('#game');
  await cv.screenshot({ path: path.join(OUT, '_preview_paused.png') });
  console.log('  已出图: _preview_paused.png');

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
