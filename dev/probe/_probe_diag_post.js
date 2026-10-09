'use strict';
/* 「黑匣子回传」端到端探针：**从 file:// 打开的页面**把诊断 POST 到本机开发服务器。

   为什么单独验这一条：本项目的实际用法是**双击 index.html（file://）**——
   Chrome 的 Local Storage 里 xiuxian-isaac.* 全挂在 file:// 这个 origin 下。
   file:// 没有同源服务端，所以游戏走的是 `no-cors + text/plain` 的绝对地址回传，
   而这条路**必须实测**（私网访问策略 / 混合内容都可能把它静默掐掉，且不报错）。

   前置：`python dev/tools/_devserver.py` 已在 8848 上跑着。
   跑法：node dev/probe/_probe_diag_post.js
*/
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const LOG = path.resolve(__dirname, '..', 'data', '_crashlog.jsonl');
const TAG = 'probe-diag-post-' + Date.now();

(async () => {
  const before = fs.existsSync(LOG) ? fs.statSync(LOG).size : 0;
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(FILE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });

  const sent = await p.evaluate(tag => {
    window.requestAnimationFrame = () => 0;
    const rec = recordDiag('selftest', new Error(tag));
    return { hasRec: !!rec, msg: rec && rec.msg, kind: rec && rec.kind, depth: rec && rec.snap && rec.snap.depth };
  }, TAG);

  await p.waitForTimeout(1200);
  const tail = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf-8') : '';
  const got = tail.split('\n').filter(l => l.indexOf(TAG) >= 0);

  console.log('页面侧 recordDiag 返回值 :', JSON.stringify(sent));
  console.log('日志文件                 :', LOG, fs.existsSync(LOG) ? fs.statSync(LOG).size + ' B' : '(不存在)');
  console.log('这次上报落盘条数         :', got.length);
  if (got.length) console.log('落盘原文                 :', got[0].slice(0, 200));
  console.log(got.length ? '\n结果: 通过 —— file:// 页面能把诊断送到 8848' : '\n结果: 失败 —— 上报没到（查 _devserver.py 是否在跑 / 是否被浏览器策略掐掉）');

  await Promise.race([b.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(got.length ? 0 : 1);
})().catch(e => { console.log('FATAL', (e && e.stack) || e); process.exit(1); });
