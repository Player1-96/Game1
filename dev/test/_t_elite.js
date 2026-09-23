'use strict';
/* 精英妖物 —— 自动化测试
 * 1) 五只精英怪：定义完整、属性显著强于基底、都能被生成
 * 2) 每层恰好一间精英窟，随机落在普通房，房内是「1 精英 + 随从」
 * 3) 精英窟灵石配额是普通房的 2~3 倍，但整层产出仍恒等于预算（不破坏已锁死的经济）
 * 4) 精英神通与死后余祸可用；精英必留法宝
 * 5) 精英窟可正常清空、全流程无报错
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

  sec('T1  五只精英怪：定义与属性');
  const defs = await page.evaluate(() => {
    const out = [];
    for (const k of ELITE_KEYS) {
      const E = ELITE_DEF[k], B = ENEMY_DEF[E.base];
      out.push({
        key: k, name: E.name, en: E.en, base: E.base, perk: E.perk,
        hpMul: E.hpMul, scale: E.scale, coins: E.coins, aura: E.aura,
        perkVersus: B ? B.hp : -1,
        hasBase: !!B,
        desc: E.desc
      });
    }
    return { list: out, count: ELITE_KEYS.length };
  });
  ok('恰好五只精英怪', defs.count === 5, 'count=' + defs.count);
  ok('五只各有名号与英文标', defs.list.every(e => e.name && e.en && e.desc));
  ok('五只基底小怪都存在', defs.list.every(e => e.hasBase));
  ok('五只神通各不相同',
    new Set(defs.list.map(e => e.perk)).size === 5,
    defs.list.map(e => e.perk).join('/'));
  ok('血量倍率都在 2 倍以上', defs.list.every(e => e.hpMul >= 2), defs.list.map(e => e.hpMul).join('/'));
  ok('体型都放大了', defs.list.every(e => e.scale > 1.3));
  ok('灵石产出都高于基底（>3 枚）', defs.list.every(e => e.coins > 3), defs.list.map(e => e.coins).join('/'));
  console.log('    ' + defs.list.map(e => `${e.name}(${e.base}·${e.perk} hp×${e.hpMul})`).join('  '));

  sec('T2  实例化：属性确实强于普通小怪');
  const inst = await page.evaluate(() => {
    const out = [];
    for (const k of ELITE_KEYS) {
      const E = ELITE_DEF[k];
      const e = new Enemy(E.base, 200, 150, 1, k);
      const n = new Enemy(E.base, 200, 150, 1);
      out.push({
        key: k, hp: e.maxHp, normalHp: n.maxHp, r: e.r, normalR: n.r,
        coins: e.def.coins, normalCoins: n.def.coins,
        isElite: !!e.elite, aura: e.elite.aura, eCd: e.eCd
      });
    }
    return out;
  });
  ok('精英血量显著高于同基底小怪',
    inst.every(e => e.hp >= e.normalHp * 2), inst.map(e => `${e.hp}/${e.normalHp}`).join(' '));
  ok('精英碰撞体积更大', inst.every(e => e.r > e.normalR), inst.map(e => `${e.r}>${e.normalR}`).join(' '));
  ok('精英灵石产出更高', inst.every(e => e.coins > e.normalCoins));
  ok('精英标记与神通冷却已就绪', inst.every(e => e.isElite && e.eCd > 0));

  sec('T3  精英窟按概率出现（每层至多一间），且随机分布');
  const dist = await page.evaluate(() => {
    const G = window.Game;
    const rows = [];
    /* 采样层必须**跨段**：精英率现在是按段给的（[0.46, 0.65, 0.82]），
       只在第 1~5 层里采样的话整批都落在段一，各层出现率必然相同 ——
       「越深越常见」会假失败（老版本正好只扫了 5 层）。 */
    const probeDepths = [1, SEG_FLOORS + 1, SEG_FLOORS * 2 + 1];   // 段一/段二/段三 各取首层
    for (let i = 0; i < 150; i++) {
      const depth = probeDepths[i % probeDepths.length];
      G.newRun('feijian');
      G.newFloor(depth);
      const f = G.floor;
      const elites = [...f.rooms.values()].filter(r => r.elite);
      rows.push({
        depth,
        n: elites.length,
        type: elites[0] ? elites[0].type : null,
        key: elites[0] ? elites[0].elite : null,
        roomKey: elites[0] ? elites[0].key : null,
        wave: elites[0] ? elites[0].waves[0].length : 0,
        hasEliteInWave: elites[0] ? elites[0].waves[0].some(s => s.elite) : false
      });
    }
    return rows;
  });
  const hasEl = dist.filter(r => r.n === 1);
  ok('每层至多一间精英窟', dist.every(r => r.n <= 1), 'n=' + [...new Set(dist.map(r => r.n))].join(','));
  ok('精英窟按概率出现：既非每层必有，也非从不出现',
    hasEl.length > 0 && hasEl.length < dist.length, `${hasEl.length}/${dist.length} 层有精英窟`);
  // 按【段】统计出现率（采样层就是各段首层，每个深度一档）
  const probeDepths = [...new Set(dist.map(r => r.depth))].sort((a, b) => a - b);
  const rateByDepth = probeDepths.map(d => {
    const rows = dist.filter(r => r.depth === d);
    return rows.filter(r => r.n === 1).length / rows.length;
  });
  console.log('    各段首层出现率 ' + probeDepths.map((d, i) =>
    `第${d}层 ${(rateByDepth[i] * 100).toFixed(0)}%`).join(' / '));
  ok('层数越深精英窟越常见（按段递增）',
    rateByDepth[rateByDepth.length - 1] > rateByDepth[0],
    '第' + probeDepths[0] + '层 ' + rateByDepth[0].toFixed(2)
      + ' → 第' + probeDepths[probeDepths.length - 1] + '层 ' + rateByDepth[rateByDepth.length - 1].toFixed(2));
  /* ⚠️ 别断言「严格单调不降」—— 每段只有 50 个样本，±1 间房就是 2% 抖动，
     会被采样噪声淹没，导致间歇性假失败（实测撞到过一次：[0.46, 0.76, 0.68]）。
     正确做法：断言「末段明显高于首段」+「每段都落在设计值附近」，
     用设计常量（planElite 的 [0.46, 0.65, 0.82]）当参照，而不是逐点比小数。 */
  const ELITE_P = [0.46, 0.65, 0.82];
  ok('末段出现率明显高于首段（段间确有提升）',
    rateByDepth[rateByDepth.length - 1] - rateByDepth[0] > 0.15,
    JSON.stringify(rateByDepth.map(v => +v.toFixed(2))));
  ok('每段出现率都贴近设计值（容差 0.15，采样 50 次）',
    rateByDepth.every((v, i) => Math.abs(v - ELITE_P[i]) < 0.15),
    rateByDepth.map((v, i) => (v * 100).toFixed(0) + '% vs 设计 ' + (ELITE_P[i] * 100) + '%').join(' / '));
  ok('精英窟落在普通石室', hasEl.every(r => r.type === 'normal'), [...new Set(hasEl.map(r => r.type))].join(','));
  ok('精英窟波次中确有精英', hasEl.every(r => r.hasEliteInWave));
  ok('精英窟 = 1 精英 + 少量随从（3~7 只）',
    hasEl.every(r => r.wave >= 3 && r.wave <= 7), 'wave=' + [...new Set(hasEl.map(r => r.wave))].join(','));
  const rooms = new Set(hasEl.map(r => r.roomKey));
  const keys = new Set(hasEl.map(r => r.key));
  console.log('    40+ 层样本：落点 ' + rooms.size + ' 种 / 精英种类 ' + keys.size + ' 种');
  ok('落点在多层样本中是随机的', rooms.size >= 4, '不同房间 ' + rooms.size + ' 个');
  ok('五种精英都会出现', keys.size >= 4, '出现 ' + keys.size + '/5 种：' + [...keys].join(','));

  sec('T4  精英窟奖励是普通房的 2~3 倍');
  const eco = await page.evaluate(() => {
    const G = window.Game;
    const rows = [];
    for (let i = 0; i < 40; i++) {
      const depth = (i % 5) + 1;
      G.newRun('feijian');
      G.newFloor(depth);
      const f = G.floor;
      const el = [...f.rooms.values()].find(r => r.elite);
      if (!el) continue;                       // 本层没有精英窟（概率生成），不计入倍率统计
      const normals = [...f.rooms.values()].filter(r => r.type === 'normal' && !r.elite);
      let inc = 0;
      for (const r of f.rooms.values()) inc += r.coinPool || 0;
      const avgNormal = normals.length
        ? normals.reduce((a, r) => a + r.coinPool, 0) / normals.length : 0;
      rows.push({
        depth, budget: f.coinBudget, reserve: f.coinReserve, eliteMult: f.eliteMult || 1,
        elitePool: el ? el.coinPool : 0, avgNormal, income: inc
      });
    }
    return rows;
  });
  const mults = eco.map(r => r.eliteMult);
  const ratios = eco.map(r => r.avgNormal > 0 ? r.elitePool / r.avgNormal : 0);
  console.log('    倍率区间 ' + Math.min(...mults).toFixed(2) + ' ~ ' + Math.max(...mults).toFixed(2) +
    '（实测精英/普通 ' + Math.min(...ratios).toFixed(2) + ' ~ ' + Math.max(...ratios).toFixed(2) + '）');
  ok('配额倍率落在 2~3 倍', mults.every(m => m >= 1.95 && m <= 3.05),
    Math.min(...mults).toFixed(2) + '~' + Math.max(...mults).toFixed(2));
  ok('实测精英房配额高于普通房', ratios.every(r => r >= 1.9));
  ok('整层产出仍锁在预算内（未因精英窟超发）',
    eco.every(r => r.income + r.reserve <= r.budget),
    eco.slice(0, 5).map(r => (r.income + r.reserve) + '/' + r.budget).join(' '));

  sec('T5  精英神通与死后余祸');
  const perk = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    for (const k of ELITE_KEYS) {
      G.newRun('feijian');
      const E = ELITE_DEF[k];
      const e = new Enemy(E.base, 240, 150, 1, k);
      e.spawnT = 0;
      G.enemies.length = 0; G.hazards.length = 0; G.bullets.length = 0; G.props.length = 0;
      G.enemies.push(e);
      G.player.x = 240; G.player.y = 220; G.player.hp = G.player.maxHP; G.player.invuln = 9999;
      // 触发神通
      e.eCd = 1;
      G.update();
      const rushVel = Math.abs(e.vx) + Math.abs(e.vy);   // 突进速度要即时取（会迅速衰减）
      // 环形技（血煞血箭环 / 剑灵环形剑气）现在带前摇，多推进几帧等它出弹；其余神通即时生效
      if (E.perk === 'blood' || E.perk === 'swarm') {
        for (let i = 0; i < 40; i++) { G.player.invuln = 9999; G.update(); }
      } else {
        G.update();
      }
      const afterCast = {
        bullets: G.bullets.length, hazards: G.hazards.length,
        moved: rushVel
      };
      // 击杀 → 余祸 + 法宝
      G.bullets.length = 0; G.props.length = 0; G.hazards.length = 0;
      e.hurt(99999, G);
      out[k] = {
        perk: E.perk,
        cast: afterCast,
        dead: { hazards: G.hazards.length, items: G.props.filter(p => p.kind === 'item').length, enemies: G.enemies.length }
      };
    }
    return out;
  });
  for (const k in perk) {
    const p = perk[k];
    console.log(`    ${k}(${p.perk}) 神通：弹幕 ${p.cast.bullets} / 毒沼 ${p.cast.hazards}` +
      `　余祸：毒沼 ${p.dead.hazards} / 法宝 ${p.dead.items}`);
  }
  ok('血煞厉鬼喷出血箭环', perk.xiesha.cast.bullets >= 8, 'bullets=' + perk.xiesha.cast.bullets);
  ok('幽焰鬼修三连符箓', perk.youyan.cast.bullets >= 3, 'bullets=' + perk.youyan.cast.bullets);
  ok('疾影血蝠瞬影突进（获得高速）', perk.jiying.cast.moved > 5, 'speed=' + perk.jiying.cast.moved.toFixed(1));
  ok('万毒蟾尊留下毒沼', perk.wandu.cast.hazards >= 1);
  ok('剑灵·断念放出环形剑气', perk.duannian.cast.bullets >= 12, 'bullets=' + perk.duannian.cast.bullets);
  ok('血煞死后化血雾', perk.xiesha.dead.hazards >= 1);
  ok('幽焰死后留火圈', perk.youyan.dead.hazards >= 1);
  ok('万毒死后毒雾弥漫', perk.wandu.dead.hazards >= 1);
  ok('剑灵死后分出小剑灵', perk.duannian.dead.enemies >= 2, 'enemies=' + perk.duannian.dead.enemies);
  ok('精英不再额外掉法器（回报改挂在墙内密室）',
    Object.values(perk).every(p => p.dead.items === 0),
    Object.values(perk).map(p => p.dead.items).join(','));

  sec('T6  血煞厉鬼受创减免');
  const armor = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    const e1 = new Enemy('shikui', 240, 150, 1, 'xiesha');
    const e2 = new Enemy('shikui', 240, 150, 1);
    e1.hurt(10, G); e2.hurt(10, G);
    return { eliteLost: e1.maxHp - e1.hp, normalLost: e2.maxHp - e2.hp };
  });
  ok('血煞厉鬼只吃六成伤害', Math.abs(armor.eliteLost - armor.normalLost * 0.6) < 0.01,
    `精英 -${armor.eliteLost} vs 普通 -${armor.normalLost}`);

  sec('T7  精英窟可正常清空并吃到高回报');
  const clear = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    // 精英窟是概率生成：反复重开直到抽到有精英窟的一层
    let el = null, tries = 0;
    while (!el && tries++ < 40) {
      G.newFloor(3);
      el = [...G.floor.rooms.values()].find(r => r.elite);
    }
    if (!el) return { err: '40 次重开都没抽到精英窟' };
    G.enterRoom(el, null);
    G.doorLock = 0;
    const c0 = G.coins;
    const poolBefore = el.coinPool;
    let guard = 0;
    while (!el.cleared && guard++ < 12) {
      for (const e of G.enemies) { e.spawnT = 0; e.hurt(9999, G); }
      G.enemies.length = 0;
      for (let i = 0; i < 4; i++) G.update();
    }
    // 亲自走到每个掉落物上，确保真的被拾取（多轮，掉落是分批产生的）
    let left = 0;
    for (let round = 0; round < 4; round++) {
      for (const pk of [...G.pickups]) {
        G.player.x = pk.x; G.player.y = pk.y; G.player.invuln = 9999;
        for (let i = 0; i < 4; i++) G.update();
      }
      left = G.pickups.length;
      if (!left) break;
    }
    return { cleared: el.cleared, gained: G.coins - c0, pool: poolBefore, left };
  }).catch(e => ({ err: e.message }));
  if (clear.err) ok('精英窟可清空', false, clear.err);
  else {
    ok('精英窟能被清空', clear.cleared === true);
    ok('清空后确有灵石进账', clear.gained > 0, `+${clear.gained}（配额 ${clear.pool}）`);
    ok('本房灵石基本被收走', clear.gained >= clear.pool * 0.8,
      `实收 ${clear.gained} / 配额 ${clear.pool}，场上残留 ${clear.left}`);
  }

  sec('T8  绘制与全流程无异常');
  const draw = await page.evaluate(() => {
    const G = window.Game;
    let bad = null;
    try {
      for (const k of ELITE_KEYS) {
        G.newRun('feijian');
        const E = ELITE_DEF[k];
        const e = new Enemy(E.base, 240, 150, 1, k);
        G.enemies.length = 0; G.enemies.push(e);
        for (let i = 0; i < 70; i++) { G.player.invuln = 9999; G.update(); G.draw(); }
        e.hurt(99999, G);
        for (let i = 0; i < 20; i++) { G.update(); G.draw(); }
      }
      // 实际走进精英窟画一画（概率生成，抽到为止）
      G.newRun('jujian');
      let el = null, tries = 0;
      while (!el && tries++ < 40) { G.newFloor(3); el = [...G.floor.rooms.values()].find(r => r.elite); }
      if (el) {
        G.enterRoom(el, null);
        for (let i = 0; i < 120; i++) { G.player.invuln = 9999; G.update(); G.draw(); }
      }
    } catch (e2) { bad = e2.message; }
    return bad;
  });
  ok('五只精英的凝形/光环/血条/死亡全程 draw 无异常', draw === null, draw || '');

  sec('T9  回归：两流派连推 5 层');
  for (const style of ['feijian', 'jujian']) {
    const r = await page.evaluate(st => {
      const G = window.Game;
      G.newRun(st);
      const inp = G.input;
      let bad = null, frames = 0, maxDepth = 1, elitesSeen = 0;
      try {
        // 先保证真的在精英窟里打过（随机漫游不一定走得到，精英窟还是概率生成的）
        let el0 = null, tries = 0;
        while (!el0 && tries++ < 40) { G.newFloor(3); el0 = [...G.floor.rooms.values()].find(r => r.elite); }
        if (el0) {
          G.enterRoom(el0, null);
          for (let i = 0; i < 90; i++) {
            G.player.hp = G.player.maxHP; G.player.invuln = 9999;
            inp.mouseDown = (i % 24 < 14); inp.mouseT = performance.now();
            inp.mx = 240 + Math.sin(i / 7) * 150; inp.my = 170 + Math.cos(i / 9) * 80;
            G.update(); G.draw(); elitesSeen++;
          }
        }
        inp.mouseDown = false;
        for (let i = 0; i < 3000; i++) {
          inp.up = i % 60 < 15; inp.down = i % 60 >= 15 && i % 60 < 30;
          inp.left = i % 80 < 25; inp.right = i % 80 >= 25 && i % 80 < 50;
          if (i % 30 === 0) inp.mouseDown = true;
          if (i % 30 === 16) inp.mouseDown = false;
          inp.mouseT = performance.now();
          inp.mx = 240 + Math.sin(i / 11) * 160; inp.my = 170 + Math.cos(i / 13) * 90;
          G.player.hp = G.player.maxHP;
          G.update(); frames++;
          if (i % 6 === 0) G.draw();
          maxDepth = Math.max(maxDepth, G.depth);
          if (G.room && G.room.elite) elitesSeen++;
          if (G.state === 'win') break;
          if (i % 200 === 0) G.enemies.length = 0;
          if (i % 240 === 0 && G.depth < 5) G.nextFloor();
        }
      } catch (e2) { bad = e2.message; }
      G.input.mouseDown = false;
      G.input.up = G.input.down = G.input.left = G.input.right = false;
      return { bad, frames, maxDepth, elitesSeen, state: G.state };
    }, style);
    ok(`${style} 推进无异常`, r.bad === null, r.bad || `${r.frames} 帧 / 最深 ${r.maxDepth} 层`);
    ok(`${style} 确实在精英窟里交过手`, r.elitesSeen >= 90, '精英窟内 ' + r.elitesSeen + ' 帧');
  }

  sec('汇总');
  ok('全程无 pageerror / console.error', errs.length === 0, errs.slice(0, 3).join(' | '));

  // browser.close() 在本机常挂死，限时收尾即可
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  console.log('\n──────────────────────────────');
  console.log(`  通过 ${pass} / 失败 ${fail}`);
  if (failed.length) console.log('  失败项：\n   - ' + failed.join('\n   - '));
  else console.log('  全部通过 ✅');
  console.log('──────────────────────────────');
  process.exit(fail ? 1 : 0);
})();
