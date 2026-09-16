'use strict';
/* 技能系统视觉验证：HUD（灵力条 / 三槽 / 专属格）、替换界面、三选一精进、
   万剑归宗、天崩剑狱预警圈 */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'preview');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(250);
  const stage = await page.$('#stage');
  const shot = async f => { await stage.screenshot({ path: path.join(OUT, f) }); console.log('saved', f); };

  /* 1) HUD：三个技能槽 + 灵力条 + 专属格（满级技能 + 已学路线） */
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    const p = G.player;
    p.addSkill('tianlei'); p.addSkill('suodi'); p.addSkill('huti');
    p.slots[0].lv = 3; p.slots[1].lv = 5;
    p.selectSlot(0);
    p.giveUlt('feijian');
    p.learnPath('homing'); p.learnPath('element');
    p.mp = 72; p.ultCd = 0;
    p.skillCd[2] = 420;                       // 护体金光正在冷却，好把冷却遮罩拍进去
    // 护盾分池：前 3 层常驻（不闪），后 2 层是护体金光的限时护盾，快散了会闪
    p.addShield(3);
    p.addShield(2, 300);
    p.shield = 3; p.tShield = 2; p.shieldT = 60;
    // 放几只妖物，画面不至于太空
    G.enemies.length = 0;
    for (let i = 0; i < 4; i++) {
      const e = new Enemy('xiesui', 120 + i * 70, 120 + (i % 2) * 60, 1);
      e.spawnT = 0; e.speed = 0; G.enemies.push(e);
    }
    p.items.push('qingfeng', 'yujian', 'chiyan', 'lingxi');
    for (let i = 0; i < 20; i++) { p.invuln = 999; G.update(); }
    G.draw();
  });
  await shot('_preview_skill_hud.png');

  /* 2) 技能替换界面：槽位已满再拾到新的 */
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    const p = G.player;
    p.addSkill('tianlei'); p.addSkill('suodi'); p.addSkill('wuxing');
    p.slots[0].lv = 4;
    G.openSkillReplace('huti');
    G.pickPick(0);
    G.draw();
  });
  await shot('_preview_skill_replace.png');

  /* 3) 专属三选一精进 */
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('jujian');
    const p = G.player;
    p.giveUlt('jujian');
    p.learnPath('shatter'); p.learnPath('might');
    G.openUltUpgrade();
    G.pickPick(1);
    G.draw();
  });
  await shot('_preview_skill_upgrade.png');

  /* 4) 万剑归宗：三柄并列、连绵十轮 */
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    const p = G.player;
    p.giveUlt('feijian');
    p.learnPath('more'); p.learnPath('element');
    p.ultCd = 0; p.x = 120; p.y = 160; p.invuln = 9999;
    input.aiming = true; input.aimAngle = 0.15;
    G.enemies.length = 0;
    for (let i = 0; i < 3; i++) {
      const e = new Enemy('shikui', 330 + (i % 2) * 40, 110 + i * 60, 1);
      e.spawnT = 0; e.speed = 0; e.maxHp = 9999; e.hp = 9999; G.enemies.push(e);
    }
    G.useUlt();
    for (let i = 0; i < 14; i++) { G.update(); }
    G.draw();
  });
  await shot('_preview_skill_myriad.png');

  /* 5) 天崩剑狱：落地前的预警圈 */
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('jujian');
    const p = G.player;
    p.giveUlt('jujian');
    p.learnPath('radius'); p.learnPath('radius');
    p.ultCd = 0; p.x = 90; p.y = 230; p.invuln = 9999;
    input.aiming = true; input.mx = 250; input.my = 150;
    G.enemies.length = 0;
    for (let i = 0; i < 4; i++) {
      const e = new Enemy('shikui', 210 + i * 40, 120 + (i % 2) * 55, 1);
      e.spawnT = 0; e.speed = 0; G.enemies.push(e);
    }
    for (let i = 0; i < 3; i++) G.spawnEnemyBullet(250, 90, 0, 2.2, 'blood');
    G.useUlt();
    for (let i = 0; i < 18; i++) G.update();
    G.draw();
  });
  await shot('_preview_skill_heavenfall.png');

  /* 6) 天崩剑狱：巨剑落地、钉进地面 */
  await page.evaluate(() => {
    for (let i = 0; i < 16; i++) { window.Game.player.invuln = 9999; window.Game.update(); }
    window.Game.draw();
  });
  await shot('_preview_skill_heavenfall_stuck.png');

  /* 7) 灵力珠：砍翻几只妖后地上散落的灵力（青）与灵石（碧）对比 */
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    const p = G.player;
    p.mp = 18; p.invuln = 99999;
    p.x = 60; p.y = 240;                      // 站远点，别把掉落吸走
    G.enemies.length = 0; G.pickups.length = 0;
    for (let i = 0; i < 5; i++) {
      G.dropPickup('mp', 150 + i * 42, 120 + (i % 2) * 46, [4, 6, 3, 8, 5][i]);
      G.dropPickup('coin', 168 + i * 42, 150 + (i % 2) * 40, 2);
    }
    for (let i = 0; i < 6; i++) { p.invuln = 99999; G.update(); }
    G.draw();
  });
  await shot('_preview_mana_orbs.png');

  await Promise.race([browser.close(), new Promise(x => setTimeout(x, 3000))]);
  process.exit(0);
})();
