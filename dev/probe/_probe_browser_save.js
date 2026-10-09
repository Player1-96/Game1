'use strict';
/* 从本机 Chrome 的 Local Storage 里把**游戏自己的存档**捞出来（只读 xiuxian-isaac.* 这几个键）。

   为什么需要它：用户实际是**双击 index.html（file://）**在玩（Chrome 的 Local Storage 里
   xiuxian-isaac.* 全挂在 file:// 这个 origin 下），页面没有调试端口、挂不上调试器。
   而他黑屏时那把进度的存档就躺在本机 Chrome 的 localStorage 里 ——
   捞出来 → 用同一个 seed 在本地重开那一层 → 复现黑屏。
   ⚠️ 页面还活着时跑（他一旦刷新/重开，存档会被下一次进房覆盖）。

   做法：把 Local Storage 的 leveldb **复制**到临时 profile，用该 profile 打开 index.html，
   只读游戏自己的键。**不写、不动用户正在用的那份。** 其它站点的数据一概不取、不打印。
   跑法：node dev/probe/_probe_browser_save.js
*/
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SRC = path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome',
  'User Data', 'Default', 'Local Storage', 'leveldb');
const TMP = path.join(os.tmpdir(), 'wb-xian-profile');
const KEYS = ['xiuxian-isaac.save.v1', 'xiuxian-isaac.diag.v1',
  'xiuxian-isaac.settings.v1', 'xiuxian-isaac.endless.v1'];
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'data', '_browser_save.json');

(async () => {
  if (!fs.existsSync(SRC)) { console.log('找不到 Chrome Local Storage：' + SRC); process.exit(1); }
  const dst = path.join(TMP, 'Default', 'Local Storage', 'leveldb');
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(dst, { recursive: true });
  let n = 0;
  for (const f of fs.readdirSync(SRC)) {
    if (f === 'LOCK') continue;                      // 锁文件不复制，让新实例自己建
    try { fs.copyFileSync(path.join(SRC, f), path.join(dst, f)); n++; }
    catch (e) { console.log('  跳过 ' + f + ' (' + e.code + ')'); }
  }
  console.log('已复制 ' + n + ' 个文件 → ' + dst);

  const ctx = await chromium.launchPersistentContext(TMP, { channel: 'chrome' });
  const p = ctx.pages()[0] || await ctx.newPage();
  p.on('pageerror', () => { });
  await p.goto(FILE);
  await p.waitForFunction(() => window.Game, null, { timeout: 20000 });
  const got = await p.evaluate(keys => {
    const o = {};
    for (const k of keys) { try { o[k] = localStorage.getItem(k); } catch (e) { o[k] = null; } }
    return o;
  }, KEYS);

  for (const k of KEYS) {
    const v = got[k];
    console.log((v ? '有 ' : '无 ') + k + (v ? '  (' + v.length + ' 字符)' : ''));
  }
  const raw = got['xiuxian-isaac.save.v1'];
  if (raw) {
    const d = JSON.parse(raw);
    fs.writeFileSync(OUT, JSON.stringify(d, null, 1), 'utf-8');
    const pl = d.player || {};
    console.log('\n--- 存档摘要 ---');
    console.log('时间   : ' + new Date(d.at).toLocaleString());
    console.log('层数   : ' + d.depth + ' 段 ' + d.seg + ' 流派 ' + d.style + ' 路线 ' + JSON.stringify(d.stylePath));
    console.log('seed   : ' + d.seed + ' 当前房 ' + d.roomKey);
    console.log('玩家   : hp ' + pl.hp + '/' + pl.maxHP + ' 盾 ' + pl.shield + ' 灵 ' + pl.mp + '/' + pl.maxMP);
    console.log('法宝   : ' + JSON.stringify(pl.items));
    console.log('融合   : ' + JSON.stringify(pl.fusionMem) + ' 已喂 ' + JSON.stringify(pl.usedMats));
    console.log('房间数 : ' + Object.keys(d.rooms || {}).length);
    console.log('\n已存 → ' + OUT);
  }
  const diag = got['xiuxian-isaac.diag.v1'];
  if (diag) { console.log('\n--- 黑匣子诊断 ---'); console.log(diag.slice(0, 4000)); }

  await Promise.race([ctx.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})().catch(e => { console.log('FATAL', (e && e.stack) || e); process.exit(1); });
