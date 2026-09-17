'use strict';
/* 探针：SWORD（精英「剑灵·断念」）死亡时到底生成什么？
   用户反馈「死了之后会分裂两只阴煞出来，有点莫名其妙」。

   代码上精英的 perk 是 swarm，eliteDeath 里写的是生成 2 只 jianling；
   而 Enemy.die 里另有一段「def.split 且非 small → 分裂 2 只小阴煞」。
   两段都能产出「2 只」，所以必须实测分辨，别照字面改。

   A. 精英 SWORD 死亡 → 看生成物的 type / spr / ai
   B. 普通剑灵死亡 → 对照（应无生成）
   C. 普通阴煞死亡 → 对照（应分裂 2 只小阴煞）
   D. 小阴煞再死   → 看会不会递归分裂
*/
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 820 } });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console.error] ' + m.text()); });
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(250);

  const out = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    G.state = 'play';
    const p = G.player;
    p.x = 240; p.y = 210; p.invuln = 9999;

    const snap = () => G.enemies.filter(e => !e.dead).map(e => ({
      type: e.type, spr: e.def.spr, ai: e.def.ai, small: !!e.small,
      elite: e.eliteKey || null, hp: e.hp, maxHp: e.maxHp, r: e.r
    }));
    const clear = () => {
      G.enemies.length = 0; G.bullets.length = 0;
      G.hazards.length = 0; if (G.timers) G.timers.length = 0;
    };

    const res = {};

    /* A. 精英 SWORD */
    clear();
    const A = new Enemy('jianling', 240, 150, 1, 'duannian');
    A.spawnT = 0;
    G.enemies.push(A);
    res.beforeElite = snap();
    res.eliteDefSplit = !!A.def.split;
    res.eliteDefSpr = A.def.spr;
    res.eliteDefAi = A.def.ai;
    A.hurt(99999, G, null, false);
    res.afterEliteDie = snap();
    res.eliteHazards = G.hazards.filter(h => !h.dead).length;
    for (let i = 0; i < 60; i++) G.update();
    res.afterElite60f = snap();

    /* B. 普通剑灵 */
    clear();
    const B = new Enemy('jianling', 240, 150, 1);
    B.spawnT = 0; G.enemies.push(B);
    res.jlDefSplit = !!B.def.split;
    B.hurt(99999, G, null, false);
    res.afterJlDie = snap();

    /* C. 普通阴煞 */
    clear();
    const C = new Enemy('yinsha', 240, 150, 1);
    C.spawnT = 0; G.enemies.push(C);
    res.ysDefSplit = !!C.def.split;
    C.hurt(99999, G, null, false);
    res.afterYsDie = snap();

    /* D. 小阴煞再死 */
    clear();
    const D = new Enemy('yinsha', 240, 150, 0.6);
    D.spawnT = 0; D.small = true; D.maxHp = 5; D.hp = 5;
    G.enemies.push(D);
    D.hurt(99999, G, null, false);
    res.afterSmallYsDie = snap();

    return res;
  });

  const fmt = a => a.length
    ? a.map(e => `${e.type}(spr=${e.spr} ai=${e.ai} small=${e.small} elite=${e.elite} hp=${e.hp}/${e.maxHp} r=${e.r})`).join('\n' + ' '.repeat(26))
    : '（无）';

  console.log('================ 实测 ================');
  console.log('[A] 精英 SWORD 出场      : ' + fmt(out.beforeElite));
  console.log('    精英 def: split=' + out.eliteDefSplit + '  spr=' + out.eliteDefSpr + '  ai=' + out.eliteDefAi);
  console.log('[A] 击杀瞬间            : ' + fmt(out.afterEliteDie));
  console.log('[A] 再过 60 帧          : ' + fmt(out.afterElite60f));
  console.log('    残留地面危险区: ' + out.eliteHazards);
  console.log();
  console.log('[B] 普通剑灵死亡        : ' + fmt(out.afterJlDie) + '   (def.split=' + out.jlDefSplit + ')');
  console.log('[C] 普通阴煞死亡        : ' + fmt(out.afterYsDie) + '   (def.split=' + out.ysDefSplit + ')');
  console.log('[D] 小阴煞再死          : ' + fmt(out.afterSmallYsDie));
  console.log();
  console.log('页面错误: ' + (errs.length ? '\n  ' + errs.join('\n  ') : '无'));

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
