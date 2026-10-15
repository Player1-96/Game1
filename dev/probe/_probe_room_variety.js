'use strict';
/* 「题面重复度」探针 —— 把"同质化严重"变成一个可对比的数字。
 *
 * 思路：每只妖物按其**当前 AI** 归到一个「招式原型」（即：玩家要对它做什么）。
 * 一个房间里**不同原型的数量**，就等于「这一房要求玩家做几个不同的决定」。
 *   1 个 → 无论几只怪，都只是"同一道题做久一点"（这就是同质化）
 *   2~3 个 → 有取舍、有优先级，才是"难"
 *
 * 改招式 / 改编队之前跑一次留基线，改完再跑一次对比。
 * 用法：node dev/probe/_probe_room_variety.js [房间数]
 */
const { chromium } = require('playwright');
const path = require('path');
const BASE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const N = parseInt(process.argv[2] || '400', 10);

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(BASE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const r = await p.evaluate(({ N }) => {
    /* ⚠️ 这张表是**现状的口径**（按 entities.js 里的 AI 分支人工归类），
       不是从代码里自动推出来的 —— 改完 AI 后这张表必须跟着改，
       否则测的是旧结论。（同 `_t_nordic` T4 的"内容登记表"是一个道理。） */
    const ARCH = {
      xiesui: '近战贴脸', chanchu: '远程吐弹', xuefu: '冲锋突进', guixiu: '远程吐弹',
      yinsha: '跳跃贴近', shikui: '近战贴脸', jianling: '远程吐弹', xuanguang: '强制位移',
      bengyao: '强制位移', yingmo: '伏击', tiehun: '远程吐弹', xuanjia: '冲锋突进'
    };
    /* ⭐ 第二个口径（更能解释"难度不够"）：**能不能隔空打到你**。
       近战怪再多也可以无限风筝 —— 只有"隔空威胁"才真的逼你做决定。
       · none = 完全没有主动技（只靠接触伤害）：站着不动都打不到你
       · melee = 必须贴到近身才成立（可风筝）
       · ranged = 隔空造成威胁（真正的压力源） */
    const REACH = {
      xiesui: 'none', shikui: 'none',
      xuefu: 'melee', yinsha: 'melee', bengyao: 'melee', xuanjia: 'melee',
      chanchu: 'ranged', guixiu: 'ranged', jianling: 'ranged', tiehun: 'ranged',
      xuanguang: 'ranged', yingmo: 'ranged'
    };
    const bySeg = { 0: [], 1: [], 2: [] };
    const archCount = {};
    const reachBySeg = { 0: [], 1: [], 2: [] };
    const noneWave = { 0: [], 1: [], 2: [] };
    let rooms = 0;

    /* 用固定种子序列扫，跨层跨段都采到 */
    for (let i = 0; i < N; i++) {
      const depth = 1 + (i % 15);
      const seg = Math.min(2, Math.floor((depth - 1) / 5));
      const fl = new Floor(depth, 9000 + i * 17, { style: 'cn' });
      for (const room of fl.rooms.values()) {
        if (room.type !== 'normal' && room.type !== 'elite') continue;
        /* 一波一波看：玩家实际面对的"同时存在的威胁集合"是一波 */
        for (const wv of room.waves) {
          const kinds = new Set();
          let rangedN = 0;
          wv.forEach(sp => {
            const a = ARCH[sp.type];
            if (a) kinds.add(a);
            if (a) archCount[a] = (archCount[a] || 0) + 1;
            if (REACH[sp.type] === 'ranged') rangedN++;
          });
          if (!kinds.size) continue;
          rooms++;
          bySeg[seg].push(kinds.size);
          reachBySeg[seg].push(rangedN);
          /* 「这一波完全没有隔空威胁」= 熟练玩家可以整波风筝掉 */
          noneWave[seg].push(rangedN === 0 ? 1 : 0);
        }
      }
    }
    const stat = arr => arr.length
      ? {
        n: arr.length,
        avg: +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2),
        one: +(arr.filter(v => v === 1).length / arr.length * 100).toFixed(1),
        max: Math.max(...arr)
      }
      : { n: 0 };
    const statR = arr => arr.length
      ? {
        n: arr.length,
        avg: +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2),
        zero: +(arr.filter(v => v === 0).length / arr.length * 100).toFixed(1),
        max: Math.max(...arr)
      }
      : { n: 0 };
    const all = [].concat(bySeg[0], bySeg[1], bySeg[2]);
    const allR = [].concat(reachBySeg[0], reachBySeg[1], reachBySeg[2]);
    return {
      all: stat(all), seg0: stat(bySeg[0]), seg1: stat(bySeg[1]), seg2: stat(bySeg[2]),
      archCount: archCount,
      allR: statR(allR), r0: statR(reachBySeg[0]), r1: statR(reachBySeg[1]), r2: statR(reachBySeg[2])
    };
  }, { N });

  const line = (name, s) => console.log('  ' + name.padEnd(8)
    + '样本 ' + String(s.n).padStart(4)
    + '　平均不同原型 ' + s.avg
    + '　单一原型房间 ' + s.one + '%'
    + '　最多 ' + s.max + ' 种');
  const lineR = (name, s) => console.log('  ' + name.padEnd(8)
    + '样本 ' + String(s.n).padStart(4)
    + '　平均隔空威胁 ' + s.avg
    + '　**完全没有隔空威胁的波** ' + s.zero + '%'
    + '　最多 ' + s.max + ' 个');

  console.log('=== 口径 A：题面重复度（每个房间有几种不同原型）· ' + N + ' 层采样 ===');
  line('全部', r.all);
  line('段一', r.seg0);
  line('段二', r.seg1);
  line('段三', r.seg2);
  console.log('  原型出现次数：' + JSON.stringify(r.archCount));
  const kinds = Object.keys(r.archCount).length;

  console.log('');
  console.log('=== 口径 B：隔空威胁（能不能被风筝掉）· 同一批样本 ===');
  lineR('全部', r.allR);
  lineR('段一', r.r0);
  lineR('段二', r.r1);
  lineR('段三', r.r2);

  console.log('');
  console.log('结论：');
  console.log('  · 全 12 只杂兵 = ' + kinds + ' 种原型；房间层面平均 ' + r.all.avg + ' 种，'
    + '单一原型房间只占 ' + r.all.one + '% —— **房间并不单调**');
  console.log('  · 但平均每波只有 ' + r.allR.avg + ' 个隔空威胁，'
    + '**完全没有隔空威胁的波占 ' + r.allR.zero + '%** —— 这些波熟练玩家可以整波风筝掉');
  await b.close();
  process.exit(0);
})().catch(e => { console.log('FATAL', (e && e.stack) || e); process.exit(1); });
