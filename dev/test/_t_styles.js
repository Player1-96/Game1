'use strict';
/* 流派表重构 —— 自动化测试
 * 覆盖：属性契约（死属性检查）/ 攻击分派 / 射速折算蓄力速度 /
 *       道具流派化文案 / 鼠标悬停说明 / 三流派回归 /
 *       舞剑流近战挥砍与蓄势折算
 */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');

let pass = 0, fail = 0;
const failed = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '   ' + extra : '')); }
  else { fail++; failed.push(name); console.log('  FAIL  ' + name + (extra ? '   ' + extra : '')); }
}
function sec(t) { console.log('\n=== ' + t + ' ==='); }

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

  sec('T1  流派表结构与属性契约');
  const tbl = await page.evaluate(() => {
    const ids = Object.keys(STYLES);
    return {
      ids,
      ready: ids.filter(k => STYLES[k].ready),
      miss: auditStyleCoverage(),
      hasAttack: ids.filter(k => STYLES[k].ready).every(k => typeof STYLES[k].attack === 'function'),
      keys: ids.map(k => k + ':' + Object.keys(STYLES[k].use).length)
    };
  });
  ok('四个流派均已登记', tbl.ids.length === 4, tbl.ids.join('/'));
  ok('已开放的流派都实现了 attack', tbl.hasAttack);
  ok('死属性检查无遗漏', tbl.miss.length === 0, tbl.miss.join(','));
  ok('每个流派都声明了完整契约', tbl.keys.every(k => +k.split(':')[1] >= 12), tbl.keys.join(' '));

  sec('T2  攻击分派：各流派行为不同');
  const disp = await page.evaluate(() => {
    const G = window.Game, inp = G.input;
    const fire = style => {
      G.newRun(style);
      G.player.x = 240; G.player.y = 160;
      inp.mouseDown = true; inp.mouseT = performance.now(); inp.mx = 430; inp.my = 160;
      inp.keyShoot = false;
      let made = 0, sawCharge = false;
      for (let i = 0; i < 70; i++) {
        G.update();
        made = Math.max(made, G.bullets.length);
        if (G.player.charging) sawCharge = true;
      }
      inp.mouseDown = false;
      const before = G.bullets.length;
      G.update();                       // 松手
      const released = G.bullets.length > before;
      return { made, sawCharge, released, kind: G.bullets.length ? G.bullets[G.bullets.length - 1].kind : null };
    };
    return { fj: fire('feijian'), jj: fire('jujian') };
  });
  ok('飞剑流按住即连发', disp.fj.made > 1, 'bullets=' + disp.fj.made);
  ok('飞剑流不进入蓄力', !disp.fj.sawCharge);
  ok('巨剑流按住是蓄力而非连发', disp.jj.sawCharge && disp.jj.made === 0, 'made=' + disp.jj.made);
  ok('巨剑流松手才放出巨剑', disp.jj.released && disp.jj.kind === 'jujian', 'kind=' + disp.jj.kind);

  sec('T3  射速在巨剑流折算为蓄力速度（原死属性）');
  const rate = await page.evaluate(() => {
    const G = window.Game, inp = G.input;
    const measure = mut => {
      G.newRun('jujian');
      if (mut) mut(G.player);
      inp.mouseDown = true; inp.mouseT = performance.now(); inp.mx = 430; inp.my = 160;
      inp.keyShoot = false;
      let f = 0;
      while (G.player.chargeT < 66 && f < 400) { G.update(); f++; }
      inp.mouseDown = false;
      return f;
    };
    return {
      base: measure(null),
      fast: measure(p => { p.stats.fireRate *= 1.35; }),   // 灵犀玉佩
      slow: measure(p => { p.stats.fireRate *= 0.8; })     // 玄铁重剑
    };
  });
  ok('基准蓄满二段约 66 帧', Math.abs(rate.base - 66) <= 3, rate.base + ' 帧');
  ok('灵犀玉佩确实加快蓄力', rate.fast < rate.base - 8, `${rate.base} → ${rate.fast} 帧`);
  ok('玄铁重剑确实拖慢蓄力', rate.slow > rate.base + 8, `${rate.base} → ${rate.slow} 帧`);
  ok('快慢比例符合射速折算', Math.abs(rate.base / rate.fast - 1.35) < 0.12 &&
     Math.abs(rate.slow / rate.base - 1.25) < 0.12,
     `fast×${(rate.base / rate.fast).toFixed(2)} slow×${(rate.slow / rate.base).toFixed(2)}`);

  sec('T4  道具流派化文案');
  const txt = await page.evaluate(() => {
    const pick = id => ({
      fj: itemView(ITEM_MAP[id], 'feijian'),
      jj: itemView(ITEM_MAP[id], 'jujian')
    });
    return {
      spread: pick('yujian'), rate: pick('lingxi'), tie: pick('xuantie'),
      same: pick('jindan'), other: itemOtherStyles(ITEM_MAP['yujian'], 'feijian')
    };
  });
  ok('分裂法宝在两流派下不同名', txt.spread.fj.name === '御剑术·三重' && txt.spread.jj.name === '重剑诀·三重',
     txt.spread.fj.name + ' / ' + txt.spread.jj.name);
  ok('分裂法宝描述体现「不分剑」', /不分剑/.test(txt.spread.jj.desc), txt.spread.jj.desc);
  ok('灵犀玉佩在巨剑流改为聚灵玉佩', txt.rate.jj.name === '聚灵玉佩' && /蓄力速度/.test(txt.rate.jj.desc),
     txt.rate.jj.name + '：' + txt.rate.jj.desc);
  ok('玄铁重剑在巨剑流惩罚成立', /蓄力.*-20%/.test(txt.tie.jj.desc), txt.tie.jj.desc);
  ok('差异道具标记 differs', txt.spread.fj.differs === true);
  ok('可列出其它流派的效果', txt.other.length === 2 &&
     /重剑诀/.test(txt.other[0].name) && /回风拂柳/.test(txt.other[1].name),
     JSON.stringify(txt.other.map(o => o.style + '：' + o.name)));

  sec('T5  道具悬停说明');
  const TIP_NAME = { feijian: /御剑术·三重/, jujian: /重剑诀·三重/, wujian: /回风拂柳/ };
  for (const style of ['feijian', 'jujian', 'wujian']) {
    const tip = await page.evaluate(st => {
      const G = window.Game;
      G.newRun(st);
      G.player.items.push('yujian');
      G.draw();                                  // 生成 itemHits
      const hit = (G.itemHits || []).find(h => h.id === 'yujian');
      if (!hit) return { err: '未找到该道具的命中区' };
      G.input.hx = hit.x + 8; G.input.hy = hit.y + 8;
      G.updateItemTip();
      const el = document.getElementById('tip');
      const r = { disp: el.style.display, html: el.innerHTML, left: el.style.left, top: el.style.top };
      // 移开鼠标应隐藏
      G.input.hx = -99; G.input.hy = -99;
      G.updateItemTip();
      r.hidden = el.style.display === 'none';
      return r;
    }, style);
    ok(`${style} 悬停弹出说明`, tip.disp === 'block', tip.err || 'left=' + tip.left + ' top=' + tip.top);
    ok(`${style} 说明含流派化名称`, TIP_NAME[style].test(tip.html), (tip.html || '').slice(0, 60));
    ok(`${style} 移开鼠标后隐藏`, tip.hidden === true);
    if (style === 'feijian') ok('说明里给出巨剑流对照', /巨剑流/.test(tip.html), '');
  }

  sec('T6  三流派完整回归');
  for (const style of ['feijian', 'jujian', 'wujian']) {
    const r = await page.evaluate(st => {
      const G = window.Game;
      let bad = null, frames = 0, maxDepth = 1, total = 0;
      try {
        G.newRun(st);
        /* 推进节奏由层数决定：每 480 帧跳一层，总帧数必须够跳完全程
           （15 层 → 至少 15×480 = 7200 帧；给 3 倍余量，免得卡在某层重试）。 */
        const need = STYLE_SYS.totalFloors * 480;
        for (let i = 0; i < need; i++) {
          const inp = G.input;
          inp.up = Math.random() < 0.25; inp.down = Math.random() < 0.25;
          inp.left = Math.random() < 0.25; inp.right = Math.random() < 0.25;
          inp.keyShoot = Math.random() < 0.5; inp.keyAngle = Math.random() * Math.PI * 2;
          inp.mouseDown = false;
          if (i % 90 === 0) G.enemies.length = 0;
          /* 推进到最后一层（层数由 STYLE_SYS 决定，别写死 5）。
             每到一段首层会弹「择风格」面板 —— 替玩家点掉默认项，否则循环卡住。 */
          if (i > 0 && i % 480 === 0 && G.depth < STYLE_SYS.totalFloors && G.state === 'play') {
            G.nextFloor();
            if (G.state === 'stylePick' && G.styleMenu) G.styleMenuConfirm();
          }
          G.update(); frames++;
          if (i % 5 === 0) G.draw();
          maxDepth = Math.max(maxDepth, G.depth);
          if (G.state === 'win' || G.state === 'dead') break;
        }
        total = STYLE_SYS.totalFloors;      // 从页面上下文带出来（Node 侧拿不到）
      } catch (e) { bad = e.message; }
      return { bad, frames, maxDepth, state: G.state, total };
    }, style);
    ok(`${style} 流程无异常`, r.bad === null, r.bad || `${r.frames} 帧 / ${r.maxDepth} 层 / ${r.state}`);
    ok(`${style} 可推进到最后一层`, r.maxDepth >= r.total || r.state === 'win',
       'maxDepth=' + r.maxDepth + ' 目标=' + r.total);
  }

  sec('T7  舞剑流：近战挥砍 / 命中上限 / 蓄势折算');
  const wj = await page.evaluate(() => {
    const G = window.Game, inp = G.input, out = {};
    const dummy = (p, dx, dy) => {
      const e = new Enemy('xiesui', p.x + dx, p.y + (dy || 0), 1);
      e.spawnT = 0; e.maxHp = 99999; e.hp = 99999;
      e.speed = 0; e.cd = 99999; e.touch = 0;      // 固定靶：别让它自己撞上来打断蓄势
      G.enemies.push(e);
      return e;
    };
    out.ids = PLAYABLE_STYLES.slice();
    out.saber = !!SPR.saber;
    out.chargeSprite = !!(SPR.playerCharge && SPR.playerCharge.down && SPR.playerCharge.down.length === 2);
    out.riftwave = !!SPR.riftwave;
    // 挥剑姿态：三帧一套（起手 / 力劈 / 收势），三种朝向都得有，侧向还要镜像
    out.swingSprite = !!(SPR.playerSwing && SPR.playerSwing.down && SPR.playerSwing.down.length === 3);
    out.swingSpriteSide = !!(SPR.playerSwingSideL && SPR.playerSwingSideL.length === 3);
    out.consts = {
      reach: STYLES.wujian.consts.reach,
      dmgScale: STYLES.wujian.consts.dmgScale,
      baseHits: STYLES.wujian.consts.baseHits
    };

    // 单个固定靶：一刀的伤害应等于 damage × 近战系数
    G.newRun('wujian');
    const p = G.player; p.x = 240; p.y = 160;
    G.enemies.length = 0;
    const e1 = dummy(p, 20);
    const hp0 = e1.hp;
    inp.mouseDown = true; inp.mouseSeen = true; inp.mx = 300; inp.my = 160; inp.keyShoot = false;
    G.update();
    out.swingDmg = +(hp0 - e1.hp).toFixed(3);
    out.expect = +(p.stats.damage * STYLES.wujian.consts.dmgScale).toFixed(3);
    out.swingCd = p.shootCd;
    out.slashes = G.slashes.length;
    out.swingT = p.swingT;                       // 出刀当帧应进入挥剑动作
    out.swingAnim = SWING_ANIM;

    // 触及：46px 的剑锋够得到 40px 外的靶子（近战不再必须贴脸）
    G.newRun('wujian');
    const p3 = G.player; p3.x = 240; p3.y = 160;
    G.enemies.length = 0;
    const far = dummy(p3, 40);
    inp.mouseDown = true; inp.mouseSeen = true; inp.mx = 300; inp.my = 160;
    G.update();
    out.reachHit = far.hp < 99999;

    // 体质自带的斩落：不放任何法宝（deflect = 0）也要能扫掉贴脸的术法
    G.newRun('wujian');
    const p4 = G.player; p4.x = 240; p4.y = 160;
    G.enemies.length = 0;
    p4.stats.deflect = 0;
    const shellA = new Bullet(p4.x + 22, p4.y, 0, 0, { friendly: false, r: 3 });
    const shellB = new Bullet(p4.x + 150, p4.y, 0, 0, { friendly: false, r: 3 });
    G.bullets.push(shellA, shellB);
    inp.mouseDown = true; inp.mouseSeen = true; inp.mx = 300; inp.my = 160;
    G.update();
    out.shellNear = shellA.dead;                 // 22px：在斩落圈内
    out.shellFar = shellB.dead;                  // 300px：够不着，应留着
    out.deflectR = STYLES.wujian.consts.deflectR;
    inp.mouseDown = false;

    // 命中上限：一次挥砍基础最多扫到 3 只（再多要靠 pierce）
    G.newRun('wujian');
    const p2 = G.player; p2.x = 240; p2.y = 160;
    G.enemies.length = 0;
    const ring = [-0.30, -0.10, 0.10, 0.30].map(a => {
      const e = new Enemy('xiesui', p2.x + Math.cos(a) * 22, p2.y + Math.sin(a) * 22, 1);
      e.spawnT = 0; e.maxHp = 99999; e.hp = 99999; e.speed = 0; e.cd = 99999; e.touch = 0;
      G.enemies.push(e); return e;
    });
    inp.mouseDown = true; inp.mouseSeen = true; inp.mx = 300; inp.my = 160;
    G.update();
    out.hitCount = ring.filter(e => e.hp < 99999).length;
    out.pierce = p2.stats.pierce;
    inp.mouseDown = false;

    // 蓄势速度与巨剑流同口径：射速法宝同样缩短舞剑流的蓄势
    const charge = mut => {
      G.newRun('wujian');
      const q = G.player; q.giveUlt('wujian'); q.ultCd = 0; q.invuln = 9999;
      if (mut) mut(q);
      G.enemies.length = 0;
      inp.mouseSeen = true; inp.mx = 400; inp.my = 160;
      G.useUlt();
      let f = 0;
      while (q.wjChargeT < WJ.charge && f < 400) { G.update(); f++; }
      G.ultUp();
      return f;
    };
    out.chargeBase = charge(null);
    out.chargeFast = charge(q => { q.stats.fireRate *= 1.35; });

    // ---- 玄元镜在舞剑流下转为「照影」：斩中的术法掉头打回去 ----
    G.newRun('wujian');
    const mr = G.player; mr.x = 240; mr.y = 160; mr.invuln = 9999;
    G.enemies.length = 0;
    const foe = new Enemy('xiesui', 240, 60, 1);     // 上方留个靶子，当反弹目标
    foe.spawnT = 0; foe.maxHp = 99999; foe.hp = 99999; foe.speed = 0; foe.cd = 99999; foe.touch = 0;
    G.enemies.push(foe);
    mr.give('xuanyuan', G);                          // 拿到玄元镜
    out.baseDmg = mr.stats.damage;
    out.mirrorReflect = mr.stats.reflect;
    out.mirrorDeflect = mr.stats.deflect;
    const shell = new Bullet(240, 120, 0, 2, { friendly: false, r: 3, dmg: 2, life: 300 });
    G.bullets.push(shell);                           // 自上方朝玩家飞来的敌方术法
    inp.mouseDown = true; inp.mouseSeen = true; inp.mx = 300; inp.my = 160;
    G.update();
    out.shellAlive = !shell.dead;
    out.shellReflected = shell.reflected === true && shell.friendly === true;
    out.shellBack = shell.vy < 0;                    // 掉头朝上，打回那个靶子
    out.shellDmg = +shell.dmg.toFixed(3);
    inp.mouseDown = false;

    // 对照 A：没拿镜子 → 斩中即湮灭（舞剑流本来就斩得落）
    G.newRun('wujian');
    const m2 = G.player; m2.x = 240; m2.y = 160; m2.invuln = 9999;
    G.enemies.length = 0;
    const shell2 = new Bullet(240, 120, 0, 2, { friendly: false, r: 3, dmg: 2, life: 300 });
    G.bullets.push(shell2);
    inp.mouseDown = true; inp.mouseSeen = true; inp.mx = 300; inp.my = 160;
    G.update();
    out.plainSlash = shell2.dead === true;
    inp.mouseDown = false;

    // 对照 B：飞剑流拿玄元镜仍是击落，不该变成反弹
    G.newRun('feijian');
    G.player.give('xuanyuan', G);
    out.fjDeflect = G.player.stats.deflect;
    out.fjReflect = G.player.stats.reflect;

    // ---- 追敌是满阶专属：一、二阶只是 180° 原路回敬 ----
    // 靶子摆在侧上方，与术法原路（正上）不在一条线上，于是「追不追敌」一眼可辨
    const seekCase = rank => {
      G.newRun('wujian');
      const p3 = G.player; p3.x = 240; p3.y = 160; p3.invuln = 9999;
      G.enemies.length = 0; G.bullets.length = 0;
      const tg = new Enemy('xiesui', 330, 96, 1);
      tg.spawnT = 0; tg.maxHp = 99999; tg.hp = 99999;
      tg.speed = 0; tg.cd = 99999; tg.touch = 0;
      G.enemies.push(tg);
      for (let i = 0; i < rank; i++) p3.give('xuanyuan', G);
      const sh = new Bullet(240, 120, 0, 2, { friendly: false, r: 3, dmg: 2, life: 300 });
      G.bullets.push(sh);
      inp.mouseDown = true; inp.mouseSeen = true; inp.mx = 300; inp.my = 160;
      G.update();
      const dir = { vx: +sh.vx.toFixed(2), vy: +sh.vy.toFixed(2) };
      inp.mouseDown = false;
      const hp0 = tg.hp;
      for (let i = 0; i < 90; i++) { G.player.invuln = 9999; G.update(); }
      return { dir, hit: tg.hp < hp0, reflect: p3.stats.reflect };
    };
    out.seek1 = seekCase(1);
    out.seek2 = seekCase(2);
    out.seek3 = seekCase(3);
    return out;
  });
  ok('舞剑流已开放且位列可选流派', wj.ids.indexOf('wujian') >= 0, wj.ids.join('/'));
  ok('舞剑流有专属流派图标（弯刀）', wj.saber === true);
  ok('新增了蓄势姿态精灵', wj.chargeSprite === true);
  ok('裂空斩的剑气精灵已就绪', wj.riftwave === true);
  ok('新增挥剑姿态（每朝向三帧，侧向有镜像）',
     wj.swingSprite === true && wj.swingSpriteSide === true);
  ok('平A 是一刀横扫（伤害 = 伤害 × 近战系数）',
     Math.abs(wj.swingDmg - wj.expect) < 0.01, `${wj.swingDmg} vs ${wj.expect}`);
  ok('近战系数高于飞剑单发（贴脸的风险溢价）',
     wj.consts.dmgScale >= 1.0 && wj.consts.dmgScale <= 1.3, 'dmgScale=' + wj.consts.dmgScale);
  ok('出刀当帧就切进挥剑动作', wj.swingT === wj.swingAnim, `swingT=${wj.swingT}/${wj.swingAnim}`);
  ok('挥砍留下刃光特效', wj.slashes > 0, 'slashes=' + wj.slashes);
  ok('挥砍间隔由射速折算（2.6 → 23 帧）', wj.swingCd === 23, 'cd=' + wj.swingCd);
  ok('剑锋触及够得到 40px 外的妖物（不必贴脸）',
     wj.reachHit === true && wj.consts.reach >= 44, `reach=${wj.consts.reach}`);
  ok('不放法宝也斩得落贴脸的术法', wj.shellNear === true, '斩落半径=' + wj.deflectR);
  ok('斩落有范围上限（远处术法不受影响）', wj.shellFar === false);
  ok('一次挥砍基础最多扫到 3 只',
     wj.hitCount === wj.consts.baseHits, `命中 ${wj.hitCount} 只 / pierce=${wj.pierce}`);
  ok('蓄满约 24 帧（0.4 秒）', Math.abs(wj.chargeBase - 24) <= 3, wj.chargeBase + ' 帧');
  ok('射速法宝同时缩短舞剑流蓄势', wj.chargeFast < wj.chargeBase - 3,
     `${wj.chargeBase} → ${wj.chargeFast} 帧`);
  ok('舞剑流下玄元镜转为「照影」（走 reflect，不再叠斩落半径）',
     wj.mirrorReflect === 1 && wj.mirrorDeflect === 0,
     `reflect=${wj.mirrorReflect} deflect=${wj.mirrorDeflect}`);
  ok('斩中的术法不再湮灭，而是掉头打回去',
     wj.shellAlive === true && wj.shellReflected === true && wj.shellBack === true,
     `存活=${wj.shellAlive} 标记=${wj.shellReflected} 掉头=${wj.shellBack}`);
  ok('打回去的术法按玩家伤害结算（×1.3）',
     Math.abs(wj.shellDmg - wj.baseDmg * 1.3) < 0.01,
     `${wj.shellDmg} 伤害（基础 ${wj.baseDmg}）`);
  ok('对照：没拿镜子时斩中即湮灭', wj.plainSlash === true);
  ok('对照：飞剑流拿玄元镜仍是击落，不变成反弹',
     wj.fjDeflect === 1 && wj.fjReflect === 0,
     `deflect=${wj.fjDeflect} reflect=${wj.fjReflect}`);
  // 追敌是满阶专属（此前一阶就自寻最近妖物 —— 太强，且三阶就没卖点了）
  ok('一阶照影只做 180° 原路回敬（不追敌）',
     wj.seek1.reflect === 1 && Math.abs(wj.seek1.dir.vx) < 0.5 && wj.seek1.dir.vy < 0,
     `vx=${wj.seek1.dir.vx} vy=${wj.seek1.dir.vy}`);
  ok('二阶照影同样不追敌',
     wj.seek2.reflect === 2 && Math.abs(wj.seek2.dir.vx) < 0.5 && wj.seek2.dir.vy < 0,
     `vx=${wj.seek2.dir.vx} vy=${wj.seek2.dir.vy}`);
  ok('三阶照影才自寻最近的妖物（满阶卖点）',
     wj.seek3.reflect === 3 && wj.seek3.dir.vx > 0.5 && wj.seek3.dir.vy < 0,
     `vx=${wj.seek3.dir.vx} vy=${wj.seek3.dir.vy}`);
  ok('强度对照：侧边靶子只有满阶打得到（一阶原路飞走）',
     wj.seek1.hit === false && wj.seek3.hit === true,
     `一阶命中=${wj.seek1.hit} / 三阶命中=${wj.seek3.hit}`);

  sec('T8  运行期无报错');
  ok('无 pageerror / console.error', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\n──────────────────────────────');
  console.log(`  通过 ${pass} / ${pass + fail}`);
  if (fail) { console.log('  失败项：'); failed.forEach(f => console.log('   - ' + f)); }
  else console.log('  全部通过 ✅');
  console.log('──────────────────────────────');
  // browser.close() 在本机常挂死，限时收尾即可
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
