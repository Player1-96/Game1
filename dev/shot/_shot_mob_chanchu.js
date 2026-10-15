'use strict';
/* 样板怪（蟾蜍妖）的验收图：
   ① 造型**改前 vs 改后**（2 帧 → 7 帧）+ 剪影对比 —— 剪影是唯一客观的造型判据
   ② 三招的**动作分解**（wind / fire / back 各取一帧并排）—— 本方案特有的验收物
   产物：dev/preview/_preview_mob_chanchu.png */
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const BASE = 'file:///' + path.join(REPO, 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(REPO, 'dev', 'preview', '_preview_mob_chanchu.png');

/* 从 HEAD 里取出**改之前**的那个 drawChanChu，用来做真实的 before/after
   （不是"凭记忆画一个旧的"，那样对比没有意义）。 */
function oldDrawerSource() {
  const src = execSync('git show HEAD:src/sprites.js', { cwd: REPO, maxBuffer: 8 << 20 }).toString('utf8');
  const i = src.indexOf('function drawChanChu(');
  if (i < 0) throw new Error('HEAD 里找不到 drawChanChu');
  let depth = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(i, k + 1); }
  }
  throw new Error('函数体没闭合');
}

(async () => {
  const OLD = oldDrawerSource();
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1180, height: 900 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(BASE);
  await p.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await p.waitForTimeout(200);

  const info = await p.evaluate(({ OLD }) => {
    /* eslint-disable no-eval */
    const oldFn = eval('(' + OLD + ')');                 // 页面上下文里跑，Px/PAL 都是现成的
    const SCALE = 6;
    const host = document.createElement('div');
    host.id = 'sheet';
    host.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;background:#efeae2;padding:16px 18px;'
      + 'font:13px/1.5 "Microsoft YaHei",sans-serif;color:#211c2e';
    const title = (txt, sz) => {
      const d = document.createElement('div');
      d.textContent = txt;
      d.style.cssText = 'font-size:' + (sz || 12) + 'px;font-weight:700;margin:12px 0 5px;color:#3b3350';
      host.appendChild(d);
    };
    const group = () => {
      const d = document.createElement('div');
      d.style.cssText = 'display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end';
      host.appendChild(d);
      return d;
    };
    const cell = (parent, src, label, sil) => {
      const box = document.createElement('div');
      box.style.cssText = 'text-align:center';
      const c = document.createElement('canvas');
      c.width = src.width * SCALE; c.height = src.height * SCALE;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      const off = document.createElement('canvas');
      off.width = src.width; off.height = src.height;
      off.getContext('2d').drawImage(src, 0, 0);
      if (sil) {
        const g0 = off.getContext('2d');
        const dd = g0.getImageData(0, 0, off.width, off.height);
        for (let i = 0; i < dd.data.length; i += 4) {
          if (dd.data[i + 3] > 90) { dd.data[i] = 0; dd.data[i + 1] = 0; dd.data[i + 2] = 0; dd.data[i + 3] = 255; }
          else dd.data[i + 3] = 0;
        }
        g0.putImageData(dd, 0, 0);
      }
      g.drawImage(off, 0, 0, c.width, c.height);
      c.style.cssText = 'display:block;image-rendering:pixelated;background:#efeae2';
      box.appendChild(c);
      const lb = document.createElement('div');
      lb.textContent = label;
      lb.style.cssText = 'font-size:11px;color:#5a5270;margin-top:4px';
      box.appendChild(lb);
      parent.appendChild(box);
      return box;
    };

    /* ---------- ① 改前 / 改后 造型 + 剪影 ---------- */
    title('① 造型：改前 → 改后（上排彩色，下排剪影）', 14);
    const r1 = group(), r1s = group();
    [0, 1].forEach(f => cell(r1, oldFn(f), '旧 帧' + f, false));
    [0, 1].forEach(f => cell(r1s, oldFn(f), '旧剪影', true));
    title('', 2);
    const r2 = group(), r2s = group();
    const NEW = SPR.enemies.chanchu;
    NEW.forEach((c, i) => cell(r2, c, '新 帧' + i, false));
    NEW.forEach((c, i) => cell(r2s, c, '新剪影', true));

    /* ---------- ② 三招的动作分解 ---------- */
    title('② 三招动作分解（wind 预备 → fire 出手 → back 收势）', 14);
    const T = MOB_ACT.chanchu;
    const moves = [
      ['spit3', '三连弹（段一）'], ['venom', '毒沼·封退路（段二）'], ['tongue', '黏舌·拽回来（段三）']
    ];
    const out = {};
    moves.forEach(([name, cn]) => {
      const a = T[name];
      const line = group();
      const pick = seg => {
        const s = a[seg];
        return { f: s.f[0], sy: seg === 'fire' ? (s.sy ? s.sy[0] : 1) : (s.sy ? s.sy[s.sy.length - 1] : 1), seg: seg };
      };
      [['wind', a.wind.t], ['fire', a.fire.t], ['back', a.back.t]].forEach(([seg, t]) => {
        const q = pick(seg);
        const src = NEW[Math.min(NEW.length - 1, q.f)];
        const box = document.createElement('div');
        box.style.cssText = 'text-align:center;padding:4px 6px;border:1px solid rgba(0,0,0,.12);border-radius:4px';
        const c = document.createElement('canvas');
        c.width = 18 * SCALE; c.height = 14 * SCALE;
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = false;
        /* 形变在"脚底"为支点 —— 与游戏里 Enemy.draw 的做法一致 */
        g.save();
        g.translate(9 * SCALE, 14 * SCALE);
        g.scale(1 / q.sy, q.sy);
        g.translate(-9 * SCALE, -14 * SCALE);
        g.drawImage(src, 0, 0, c.width, c.height);
        g.restore();
        /* 黏舌的**舌头本体**是 Enemy.draw 画的实体覆盖层（不在素材里）——
           出图要把它补上，否则「黏舌」和「三连弹」在这张图上看不出区别。 */
        if (name === 'tongue' && seg === 'fire') {
          const mx = 9 * SCALE + 4 * SCALE, my = 8 * SCALE;
          const ex = mx + 9 * SCALE, ey = my;
          g.lineCap = 'round';
          g.strokeStyle = '#3d7a29'; g.lineWidth = 3 * SCALE * 0.5;
          g.beginPath(); g.moveTo(mx, my); g.lineTo(ex, ey); g.stroke();
          g.strokeStyle = '#6cc24a'; g.lineWidth = 1.4 * SCALE * 0.5;
          g.beginPath(); g.moveTo(mx, my - 1 * SCALE * 0.5); g.lineTo(ex, ey - 1 * SCALE * 0.5); g.stroke();
          g.fillStyle = '#6cc24a';
          g.beginPath(); g.arc(ex, ey, 2.6 * SCALE * 0.5, 0, Math.PI * 2); g.fill();
        }
        c.style.cssText = 'display:block;image-rendering:pixelated';
        box.appendChild(c);
        const lb = document.createElement('div');
        lb.textContent = seg + ' ' + t + '帧' + (seg === 'fire' ? ' ← 生效' : '') + '  sy ' + q.sy;
        lb.style.cssText = 'font-size:10.5px;color:#5a5270;margin-top:3px';
        box.appendChild(lb);
        line.appendChild(box);
      });
      const nm = document.createElement('div');
      nm.textContent = cn;
      nm.style.cssText = 'font-size:12px;font-weight:700;color:#3b3350;width:100%;margin-bottom:2px';
      line.insertBefore(nm, line.firstChild);
      out[name] = { wind: a.wind.t, fire: a.fire.t, back: a.back.t, seg: a.seg };
    });

    document.body.appendChild(host);
    return { newFrames: NEW.length, oldFrames: 2, moves: out };
  }, { OLD });

  console.log('改前 2 帧 → 改后 ' + info.newFrames + ' 帧');
  console.log('三招时序：' + Object.keys(info.moves).map(k => k + ' w/f/b=' + info.moves[k].wind + '/' + info.moves[k].fire + '/' + info.moves[k].back).join('　'));
  await p.waitForTimeout(400);
  const el = await p.$('#sheet');
  await el.screenshot({ path: OUT });
  console.log('已出图 → ' + OUT);
  await Promise.race([b.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})().catch(e => { console.log('FATAL', (e && e.stack) || e); process.exit(1); });
