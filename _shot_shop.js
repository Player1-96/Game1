'use strict';
/* 坊市效果预览 视觉验证：站在货品前 → 悬出效果卡 */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname);

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1000, height: 820 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(250);
  const stage = await page.$('#stage');
  const shot = async f => {
    await page.waitForTimeout(220);      // 等 overlay 的 setInterval 刷新 HUD
    await stage.screenshot({ path: path.join(OUT, f) });
    console.log('saved', f);
  };

  // 站到第一件货品前（灵石充足）
  const info = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    const shop = [...G.floor.rooms.values()].find(r => r.type === RT.SHOP);
    if (!shop) return null;
    G.enterRoom(shop, null);
    G.coins = 60;
    const pr = G.props.find(p => p.kind === 'shop');
    G.player.x = pr.x; G.player.y = pr.y - 2;
    G.player.invuln = 9999;
    for (let i = 0; i < 4; i++) G.update();
    G.draw();
    G.updateShopTip();
    return { item: pr.item, price: pr.price, hint: G.shopHint === pr };
  });
  console.log('坊市预览：', JSON.stringify(info));
  await shot('_preview_shop_tip.png');

  // 灵石不足的提示
  await page.evaluate(() => {
    const G = window.Game;
    G.coins = 5;
    for (let i = 0; i < 2; i++) G.update();
    G.draw(); G.updateShopTip();
  });
  await shot('_preview_shop_broke.png');

  // 最右侧货品：预览要向左避让，不能顶出画面
  const edge = await page.evaluate(() => {
    const G = window.Game;
    G.coins = 60;
    const shops = G.props.filter(p => p.kind === 'shop');
    const pr = shops[shops.length - 1];
    G.player.x = pr.x; G.player.y = pr.y - 2;
    for (let i = 0; i < 4; i++) G.update();
    G.draw(); G.updateShopTip();
    const el = document.getElementById('shopTip');
    const r = el.getBoundingClientRect(), s = el.parentElement.getBoundingClientRect();
    return { item: pr.item, x: pr.x, fitsRight: r.right <= s.right + 0.5, fitsLeft: r.left >= s.left - 0.5 };
  });
  console.log('最右货品：', JSON.stringify(edge));
  await shot('_preview_shop_edge.png');

  // browser.close() 在本机常挂死，限时收尾即可
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
  process.exit(0);
})();
