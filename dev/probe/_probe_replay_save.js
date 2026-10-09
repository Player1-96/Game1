'use strict';
/* 「黑屏复现」探针：把用户机子上捞出来的存档（dev/data/_browser_save.json）灌回游戏，
   看第 10 层那一把到底会不会抛异常 / 画面是不是黑的。

   ⚠️ 用法有前提：先跑 `node dev/probe/_probe_browser_save.js` 把存档捞下来，
      而且要在用户**刷新之前**捞（刷新后存档会被下一次进房覆盖）。

   探针会依次做：读档 → draw() → 走 20 帧真实 frame()（连带 update）→
   数画布上的非背景像素（判断是不是真黑）→ 打印所有捕获到的异常与堆栈。
   跑法：node dev/probe/_probe_replay_save.js
*/
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const SAVE = path.resolve(__dirname, '..', 'data', '_browser_save.json');
const KEY = 'xiuxian-isaac.save.v1';

(async () => {
  if (!fs.existsSync(SAVE)) { console.log('先跑 _probe_browser_save.js 捞存档：缺 ' + SAVE); process.exit(1); }
  const save = JSON.parse(fs.readFileSync(SAVE, 'utf-8'));
  console.log('存档：' + save.depth + ' 层 seed=' + save.seed + ' 房=' + save.roomKey
    + ' 流派=' + save.style + ' 法宝=' + (save.player.items || []).length + ' 件');

  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1019, height: 752 } });
  const pageErrs = [];
  p.on('pageerror', e => pageErrs.push(String(e.message)));

  await p.goto(FILE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 20000 });
  await p.evaluate(s => {
    window.requestAnimationFrame = () => 0;
    localStorage.setItem('xiuxian-isaac.save.v1', JSON.stringify(s));
  }, save);
  await p.reload();
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 20000 });

  const STEPS = Math.max(0, parseInt(process.argv[2] || '0', 10) || 0);
  const r = await p.evaluate((steps) => {
    const G = window.Game;
    window.requestAnimationFrame = () => 0;
    const logs = [];
    const keepErr = console.error;
    console.error = function () { logs.push(Array.prototype.map.call(arguments, a => (a && a.stack) || String(a)).join(' ')); };
    const out = {};
    try { G.continueGame(); } catch (e) { out.continueErr = (e && e.stack) || String(e); }
    out.state = G.state; out.depth = G.depth; out.style = G.style;
    out.room = G.room ? { key: G.room.key, type: G.room.type, bg: !!G.room.bg } : null;
    out.player = G.player ? { hp: G.player.hp, maxHP: G.player.maxHP, shield: G.player.shield, items: G.player.items.length } : null;
    const px = () => {
      const d = document.getElementById('game').getContext('2d').getImageData(0, 0, 480, 320).data;
      let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 26 || d[i + 1] > 24 || d[i + 2] > 36) n++;
      return n;
    };
    /* ① 直接 draw() */
    try { G.draw(); out.draw = 'ok'; } catch (e) { out.draw = 'throw'; out.drawErr = e.message; out.drawStack = String(e.stack || '').split('\n').slice(0, 6).join(' | '); }
    out.pxAfterDraw = px();
    /* ② 走真实 frame（带 update） */
    const t0 = window.performance.now();
    for (let i = 0; i < 40; i++) G.frame(t0 + i * 17);
    out.pxAfterFrames = px();
    out.drawErrN = G.drawErrN || 0;
    out.banner = !!document.getElementById('crashBanner');

    /* ③ 长跑压力：这把是在**Boss 房**里黑屏的，而存档只存「进房那一刻」——
       机制/特效的异常都发生在战斗途中。所以这里把玩家钉成不死，让 Boss 打满
       几千帧（阶段切换、召唤、激光、鳞罩循环全会走到），专抓过程中的第一条异常。 */
    if (steps > 0) {
      /* 顺带把**肇事者**抓出来：Enemy.draw 抛的是什么怪、它的素材在不在当前色板的图集里 */
      const culprits = [];
      const keepED = Enemy.prototype.draw;
      Enemy.prototype.draw = function (g2) {
        try { return keepED.call(this, g2); } catch (e) {
          if (culprits.length < 4) culprits.push({
            type: this.type, small: !!this.small, elite: !!this.elite,
            spr: this.def && this.def.spr, sprBig: !!(this.def && SPR.enemies[this.def.spr]),
            sprSmall: !!(this.def && SPR.enemies[this.def.spr + '_s']),
            yinsha: !!SPR.enemies.yinsha, yinsha_s: !!SPR.enemies.yinsha_s,
            world: (this.def && this.def.world) || 'cn',
            atlasKeys: Object.keys(SPR.enemies).length
          });
          throw e;
        }
      };
      G.player.invuln = 999999;
      const t1 = window.performance.now();
      const n0 = logs.length;
      for (let i = 0; i < steps; i++) {
        G.frame(t1 + i * 17);
        if (G.player && G.player.dead) { G.player.dead = false; G.player.hp = G.player.maxHP; }
      }
      Enemy.prototype.draw = keepED;
      out.stress = {
        steps: steps, newErrs: logs.length - n0, first: logs[n0] || null,
        px: px(), drawErrN: G.drawErrN || 0, banner: !!document.getElementById('crashBanner'),
        boss: G.bossRef ? { type: G.bossRef.type, phase: G.bossRef.phase, dead: G.bossRef.dead } : null,
        enemies: G.enemies.length, kills: G.kills,
        culprits: culprits, tl: (G.stylePath || []).join('>') + ' seg=' + G.seg
      };
    }
    out.logs = logs.slice(0, 6);
    console.error = keepErr;
    return out;
  }, STEPS);

  console.log('\n--- 结果 ---');
  console.log('continueGame     : ' + (r.continueErr ? '抛错 ' + r.continueErr : 'ok'));
  console.log('state/depth/style: ' + r.state + ' / ' + r.depth + ' / ' + r.style);
  console.log('room             : ' + JSON.stringify(r.room));
  console.log('player           : ' + JSON.stringify(r.player));
  console.log('手动 draw()      : ' + r.draw + (r.drawErr ? ' :: ' + r.drawErr : ''));
  if (r.drawStack) console.log('  堆栈           : ' + r.drawStack);
  console.log('非背景像素       : draw 后 ' + r.pxAfterDraw + ' → 40 帧后 ' + r.pxAfterFrames);
  console.log('drawErrN / 提示条: ' + r.drawErrN + ' / ' + r.banner);
  if (r.stress) {
    console.log('压力长跑         : ' + r.stress.steps + ' 帧　新异常 ' + r.stress.newErrs
      + '　drawErrN ' + r.stress.drawErrN + '　提示条 ' + r.stress.banner);
    console.log('  Boss/场上       : ' + JSON.stringify(r.stress.boss) + ' 敌人 ' + r.stress.enemies + ' 击杀 ' + r.stress.kills);
    console.log('  末了非背景像素   : ' + r.stress.px);
    if (r.stress.first) console.log('  第一条异常       : ' + String(r.stress.first).slice(0, 400));
    console.log('  色板路线         : ' + r.stress.tl);
    if (r.stress.culprits && r.stress.culprits.length) {
      console.log('  ★ 肇事怪:');
      r.stress.culprits.forEach(c => console.log('     ' + JSON.stringify(c)));
    }
  }
  if (r.logs && r.logs.length) { console.log('捕获到的错误     :'); r.logs.forEach(l => console.log('  · ' + l.slice(0, 300))); }
  if (pageErrs.length) { console.log('页面级错误       :'); pageErrs.slice(0, 4).forEach(l => console.log('  · ' + l.slice(0, 300))); }
  console.log(r.pxAfterFrames > 60000 ? '\n结论: 画面正常，这一把没复现黑屏' : '\n结论: ★ 复现黑屏（画布上几乎没有内容）');

  await Promise.race([b.close(), new Promise(r2 => setTimeout(r2, 3000))]);
  process.exit(0);
})().catch(e => { console.log('FATAL', (e && e.stack) || e); process.exit(1); });
