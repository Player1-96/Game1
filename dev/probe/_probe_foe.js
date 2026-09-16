'use strict';
/* 探针：后四层新增的 5 种小怪 + 3 位头目的机制实测。
   纸面上「应该」如何是一回事，逐帧跑出来是另一回事 —— 这个脚本只信后者。

   小怪
     1 玄光瞳 · 蓄力期零伤害 → 发射期按射线判定 → 移开就躲掉
     2 铁魄妖 · 玄铁弹斩不落、反不掉；普通弹照旧斩得落
     3 蹦山魈 · 落点圈随蓄势收紧；腾空期无接触伤害；落地砸中范围内掉血
     4 玄甲卫 · 从护盾那一侧打 → 伤害被吃掉；从缺口那一侧打 → 满额
     5 影魅   · 隐身 → 靠近现形并扑击；受创即现形
   头目
     6 裂煞魔尊 · 母弹 1 分 2、中弹 1 分 3，最后满屏 9 枚
     7 轮回法王 · 环上有缺口，且缺口处确实不放弹
     8 烛龙     · 鳞罩期免疫伤害；扫射光束按扇面推进
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

  /* ---------------- 1 玄光瞳 ---------------- */
  const laser = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    G.state = 'play';
    const p = G.player;
    p.x = 240; p.y = 200; p.invuln = 0; p.hp = p.maxHP;
    G.enemies.length = 0; G.beams.length = 0; G.bullets.length = 0;
    const e = new Enemy('xuanguang', 240, 80, 1);
    e.spawnT = 0; e.cd = 1; e.speed = 0;
    G.enemies.push(e);
    const out = { warnFrames: 0, fireFrames: 0, dmgDuringWarn: 0, hpAfterFire: null, beams: 0 };
    // 阶段一：蓄力期原地不动，看会不会被白打
    for (let i = 0; i < 60; i++) {
      G.update();
      if (G.beams.length) out.beams = 1;
      if (e.state === 1) out.warnFrames++;
    }
    out.dmgDuringWarn = p.maxHP - p.hp;
    // 阶段二：等它射出来，玩家站着不动，必被命中
    for (let i = 0; i < 120; i++) G.update();
    out.hpAfterFire = p.hp;
    out.standHp = p.maxHP - p.hp;
    // 阶段三：重来一次，但蓄力一结束就横移出射线
    G.newRun('feijian'); G.state = 'play';
    const q = G.player; q.x = 240; q.y = 200; q.invuln = 0; q.hp = q.maxHP;
    G.enemies.length = 0; G.beams.length = 0; G.bullets.length = 0;
    const e2 = new Enemy('xuanguang', 240, 80, 1);
    e2.spawnT = 0; e2.cd = 1; e2.speed = 0;
    G.enemies.push(e2);
    let fired = false, moved = false;
    for (let i = 0; i < 240; i++) {
      G.update();
      const bm = G.beams[0];
      if (!bm) continue;
      // 方向钉死之后（lock 窗口）才挪窝 —— 这正是设计留给玩家的那 0.4 秒
      if (!bm.firing && !moved && bm.t > bm.warn - bm.lock) { moved = true; q.x = 240 + 60; }
      if (bm.firing) fired = true;
    }
    out.dodgeHp = q.hp;
    out.dodged = q.hp === q.maxHP;
    out.fired = fired;
    out.movedAt = moved;
    return out;
  });
  console.log('\n1 玄光瞳：蓄力 ' + laser.warnFrames + ' 帧（预告期掉血 ' + laser.dmgDuringWarn + '）'
    + ' | 站桩挨打 ' + laser.standHp + ' | 锁定后横移躲开=' + laser.dodged
    + '（出光=' + laser.fired + '，锁定窗口内已移动=' + laser.movedAt + '）');

  /* ---------------- 2 铁魄妖的玄铁弹 ---------------- */
  const iron = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    /* A 舞剑流剑罡（照影镜满阶）：应斩不落、也反射不了 */
    G.newRun('wujian'); G.state = 'play';
    const p = G.player;
    p.stats.reflect = 3; p.stats.damage = 5;
    p.x = 240; p.y = 200; p.invuln = 9999;
    G.enemies.length = 0; G.bullets.length = 0; G.beams.length = 0;
    const hard = G.spawnEnemyBullet(286, 200, -2.2, 0, 'iron', { hard: true, r: 7, life: 300 });
    const soft = G.spawnEnemyBullet(286, 232, -2.2, 0, 'blood', { r: 5, life: 300 });
    for (let i = 0; i < 6; i++) {
      G.update();
      STYLES.wujian.attack(p, G, { shooting: true, aiming: true, aimAngle: 0 });
    }
    out.hardAlive = !hard.dead;
    out.notReflected = !hard.friendly;
    out.softHandled = soft.dead || soft.friendly;
    /* B 飞剑流挂玄元镜：击落判定挂在「玩家子弹」上，玄铁弹照样活着 */
    G.newRun('feijian'); G.state = 'play';
    const q = G.player;
    q.x = 60; q.y = 280; q.invuln = 9999;      // 远远躲开，别让弹丸撞到玩家身上
    G.enemies.length = 0; G.bullets.length = 0;
    const h2 = G.spawnEnemyBullet(360, 240, 0, 0, 'iron', { hard: true, r: 7, life: 300 });
    const s2 = G.spawnEnemyBullet(360, 220, 0, 0, 'blood', { r: 5, life: 300 });
    G.bullets.push(new Bullet(360, 230, 0, 0, {
      friendly: true, deflect: 2, r: 5, life: 300, kind: 'sword', sprite: SPR.sword
    }));
    for (let i = 0; i < 3; i++) G.update();
    out.hardSurvivesDeflect = !h2.dead;
    out.softKilledByDeflect = s2.dead;
    return out;
  });
  console.log('2 铁魄妖：玄铁弹挨满剑罡 ' + (iron.hardAlive ? '仍在飞 ✓' : '被斩落 ✗')
    + '，也没被回敬=' + iron.notReflected
    + ' | 同场普通弹已被处理=' + iron.softHandled
    + ' | 玄元镜击落：玄铁弹存活=' + iron.hardSurvivesDeflect
    + '，普通弹被击落=' + iron.softKilledByDeflect);

  /* ---------------- 3 蹦山魈 ---------------- */
  const leap = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian'); G.state = 'play';
    const p = G.player;
    p.x = 240; p.y = 200; p.invuln = 0; p.hp = p.maxHP;
    G.enemies.length = 0; G.bullets.length = 0; G.beams.length = 0; G.hazards.length = 0;
    const e = new Enemy('bengyao', 120, 100, 1);
    e.spawnT = 0; e.cd = 1;
    G.enemies.push(e);
    const out = { sawWind: false, sawAir: false, airDmg: 0, landDmg: 0, airContact: 0 };
    let wasAir = false;
    for (let i = 0; i < 200; i++) {
      const hp0 = p.hp;
      G.update();
      if (e.state === 1) out.sawWind = true;
      if (e.air > 0) {
        out.sawAir = true;
        wasAir = true;
        // 腾空期把玩家挪到它正下方：不该有接触伤害
        p.x = e.x; p.y = e.y;
        if (p.hp < hp0) out.airContact++;
      } else if (wasAir) {
        wasAir = false;
        if (p.hp < hp0) out.landDmg = hp0 - p.hp;
        break;
      }
    }
    out.leapDist = Math.round(Math.hypot(e.x - 120, e.y - 100));
    return out;
  });
  console.log('3 蹦山魈：蓄力圈=' + leap.sawWind + ' 腾空=' + leap.sawAir
    + ' 腾空期贴脸掉血 ' + leap.airContact + ' 次（期望 0）'
    + ' | 落地砸中掉 ' + leap.landDmg + ' | 跃距 ' + leap.leapDist + 'px');

  /* ---------------- 4 玄甲卫的旋盾 ---------------- */
  const shield = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    const setup = (srcAngle) => {
      G.newRun('feijian'); G.state = 'play';
      G.enemies.length = 0; G.bullets.length = 0;
      const e = new Enemy('xuanjia', 240, 160, 1);
      e.spawnT = 0; e.shieldA = 0;        // 盾心固定在 0 与 π
      G.enemies.push(e);
      const src = { x: e.x + Math.cos(srcAngle) * 40, y: e.y + Math.sin(srcAngle) * 40 };
      const hp0 = e.hp;
      e.hurt(10, G, src, false);
      return hp0 - e.hp;
    };
    out.front = setup(0);                  // 正对盾心
    out.gap = setup(Math.PI / 2);          // 正对缺口
    out.dot = (() => {                     // 没有来源位置的伤害（DoT / 技能）绕过护盾
      G.newRun('feijian'); G.state = 'play';
      G.enemies.length = 0;
      const e = new Enemy('xuanjia', 240, 160, 1);
      e.spawnT = 0; e.shieldA = 0;
      G.enemies.push(e);
      const hp0 = e.hp; e.hurt(10, G, 'dot'); return hp0 - e.hp;
    })();
    out.rotPerSec = +(0.012 * 60).toFixed(3);
    return out;
  });
  console.log('4 玄甲卫：正面吃 ' + shield.front + ' 伤害 / 缺口吃 ' + shield.gap
    + ' / DoT 吃 ' + shield.dot + '（期望 10） | 盾速 ' + shield.rotPerSec + ' 弧度/秒');

  /* ---------------- 5 影魅 ---------------- */
  const stealth = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    G.newRun('feijian'); G.state = 'play';
    const p = G.player;
    p.x = 240; p.y = 200; p.invuln = 9999;
    G.enemies.length = 0;
    const e = new Enemy('yingmo', 400, 200, 1);
    e.spawnT = 0;
    G.enemies.push(e);
    out.hiddenAtBirth = e.hidden;
    for (let i = 0; i < 8; i++) G.update();
    out.hiddenFar = e.hidden;                       // 离得远 → 仍隐身
    // 拉近
    e.x = p.x + 100;
    for (let i = 0; i < 3; i++) G.update();
    out.revealedNear = !e.hidden;
    out.revealT = e.revealT;
    // 受创即现形
    const f = new Enemy('yingmo', 400, 200, 1);
    f.spawnT = 0; G.enemies.push(f);
    f.hurt(1, G, 'dot');
    out.revealedOnHit = !f.hidden;
    return out;
  });
  console.log('5 影魅：出生隐身=' + stealth.hiddenAtBirth + ' 远处仍隐身=' + stealth.hiddenFar
    + ' 靠近现形=' + stealth.revealedNear + '（维持 ' + stealth.revealT + ' 帧）'
    + ' 受创现形=' + stealth.revealedOnHit);

  /* ---------------- 6 裂煞魔尊的裂变弹 ---------------- */
  const fractal = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian'); G.state = 'play';
    const p = G.player;
    // 把玩家放到对角外，别让弹丸撞在玩家身上被提前吃掉 —— 这里量的是弹幕形状，不是伤害
    p.x = 430; p.y = 275; p.invuln = 9999;
    G.enemies.length = 0; G.bullets.length = 0; G.beams.length = 0;
    const made = { 3: 0, 2: 0, 1: 0 };
    const orig = G.spawnEnemyBullet.bind(G);
    G.spawnEnemyBullet = function (x, y, vx, vy, kind, opt) {
      const b = orig(x, y, vx, vy, kind, opt);
      const t = (opt && opt.splitTier) || 1;
      made[t] = (made[t] || 0) + 1;
      return b;
    };
    const b = new Boss('liesha', 60, 60, 1);
    b.spawnT = 0; b.cd = 1; b.cd3 = 99999; b.spd = 0;
    b.bd = Object.assign({}, b.bd, { dash: null });
    G.enemies.push(b);
    const trace = [];
    for (let i = 0; i < 130; i++) {
      G.update();
      if (i % 10 === 0) trace.push(G.bullets.filter(x => !x.friendly).length);
    }
    return { trace, made, name: b.name };
  });
  console.log('6 ' + fractal.name + '：一轮生成 母弹 ' + fractal.made[3] + ' → 中弹 ' + fractal.made[2]
    + ' → 小弹 ' + fractal.made[1] + '（期望 2 → 4 → 12）'
    + ' | 场上弹幕数随时间 ' + fractal.trace.join(','));

  /* ---------------- 7 轮回法王的缺口环 ---------------- */
  const ring = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian'); G.state = 'play';
    const p = G.player;
    p.x = 240; p.y = 260; p.invuln = 9999;
    G.enemies.length = 0; G.bullets.length = 0; G.beams.length = 0;
    const b = new Boss('lunhui', 240, 80, 1);
    b.spawnT = 0; b.cd = 1; b.cd3 = 99999; b.spd = 0; b.phase = 1;
    G.enemies.push(b);
    const gapC = b.spiral + 0.42;                // 这一轮缺口中心（volley 里先自增）
    G.update();
    const ring = G.bullets.filter(x => !x.friendly);
    // 统计各角度是否有弹，以及缺口附近是否为空
    const n = 18, gap = 1.05;
    let inGapBalls = 0;
    for (const x of ring) {
      const a = Math.atan2(x.y - b.y, x.x - b.x);
      let da = a - gapC;
      da = Math.abs(((da % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      if (da < gap / 2) inGapBalls++;
    }
    return { total: ring.length, xian: inGapBalls, missing: n - ring.length,
             maxMissing: 6, name: b.name, advSpd: b.bd.spd };
  });
  console.log('7 ' + ring.name + '：一轮 ' + ring.total + ' 枚（满圈 18，缺口吃掉 ' + ring.missing
    + ' 枚，落在缺口里的弹 ' + ring.xian + '，期望 0）'
    + ' | 移速 ' + ring.advSpd + '（不冲刺，只一味前进）');

  /* ---------------- 8 烛龙的鳞罩与横扫 ---------------- */
  const zhulong = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian'); G.state = 'play';
    const p = G.player;
    p.x = 240; p.y = 250; p.invuln = 9999;
    G.enemies.length = 0; G.bullets.length = 0; G.beams.length = 0;
    const b = new Boss('zhulong', 240, 80, 1);
    b.spawnT = 0; b.cd = 99999; b.cd3 = 99999; b.spd = 0;
    b.guardCd = 1;                                // 立刻结罩，把这一段完整量出来
    G.enemies.push(b);
    const out = { guardFrames: 0, immune: null, after: null, swing: null, cd: null, uptime: 0 };
    let sawGuard = false, guardEnd = -1;
    for (let i = 0; i < 420; i++) {
      G.update();
      if (b.guard > 0) { out.guardFrames++; sawGuard = true; }
      if (sawGuard && b.guard <= 0 && out.after === null) {
        const hp0 = b.hp;
        b.hurt(20, G, null, false);
        out.after = hp0 - b.hp;                   // 罩碎的下一刻必须打得动
        guardEnd = i;
        out.cd = b.guardCd;
      }
      const bm = G.beams[0];
      if (bm && bm.swing && out.swing === null) out.swing = +bm.swing.toFixed(2);
    }
    out.immune = out.guardFrames > 0;
    return out;
  });
  // 单独量一次「罩内免疫」
  const zImmune = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian'); G.state = 'play';
    G.enemies.length = 0; G.bullets.length = 0; G.beams.length = 0;
    const p = G.player; p.x = 60; p.y = 280; p.invuln = 9999;
    const b = new Boss('zhulong', 240, 80, 1);
    b.spawnT = 0; b.cd = 99999; b.cd3 = 99999; b.spd = 0; b.guardCd = 1;
    G.enemies.push(b);
    G.update(); G.update();                       // 等罩升起来
    const hp0 = b.hp;
    for (let i = 0; i < 5; i++) b.hurt(20, G, null, false);
    return { guard: b.guard, lost: hp0 - b.hp };
  });
  console.log('8 ' + '烛龙：鳞罩持续 ' + zhulong.guardFrames + ' 帧'
    + '（罩内挨 100 伤害掉血 ' + zImmune.lost + '，期望 0）'
    + ' | 罩碎后同一下掉 ' + zhulong.after + '（期望 20）'
    + ' | 扫地冷却 ' + zhulong.cd + ' 帧 | 横扫扇面 ' + zhulong.swing + ' rad');

  console.log('\n' + (errs.length ? '⚠ 页面报错：\n' + errs.join('\n') : '无页面报错'));
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
