'use strict';
/* 道具悬停说明 —— 截图验证（截 #stage，含 HTML overlay） */
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(250);
  const stage = await page.$('#stage');

  // 巨剑流：悬停「灵犀玉佩」（跨流派差异最大的一件）
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('jujian');
    ['yujian', 'lingxi', 'xuantie', 'qingfeng', 'chuanyun', 'fenying'].forEach(id => G.player.items.push(id));
    G.player.addSkill('tianlei');
    G.draw();
    const hit = G.itemHits.find(h => h.id === 'lingxi');
    G.input.hx = hit.x + 8; G.input.hy = hit.y + 8;
    G.updateItemTip();
    G.draw();
  });
  await stage.screenshot({ path: '_tip_jujian.png' });
  console.log('saved _tip_jujian.png');

  // 飞剑流：同一个「御剑术·三重」，文案应不同
  await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    ['yujian', 'lingxi', 'xuantie', 'qingfeng', 'chuanyun', 'fenying'].forEach(id => G.player.items.push(id));
    G.player.addSkill('tianlei');
    G.draw();
    const hit = G.itemHits.find(h => h.id === 'yujian');
    G.input.hx = hit.x + 8; G.input.hy = hit.y + 8;
    G.updateItemTip();
    G.draw();
  });
  await stage.screenshot({ path: '_tip_feijian.png' });
  console.log('saved _tip_feijian.png');

  // 右上角功法格悬停
  await page.evaluate(() => {
    const G = window.Game;
    G.draw();
    const hit = G.itemHits.find(h => h.id === 'tianlei');
    G.input.hx = hit.x + 12; G.input.hy = hit.y + 12;
    G.updateItemTip();
    G.draw();
  });
  await stage.screenshot({ path: '_tip_gongfa.png' });
  console.log('saved _tip_gongfa.png');

  // browser.close() 在本机常挂死，限时收尾即可
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
