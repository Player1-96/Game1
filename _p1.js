const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const pg = await b.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type()==='error') errs.push('C:' + m.text().slice(0,120)); });
  await pg.goto('file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g,'/'));
  await pg.waitForTimeout(700);
  const res = await pg.evaluate(function () {
    const g = window.Game; g.newRun();
    const out = {};
    // 每种掉落物画出来的尺寸/像素是否互不相同
    ['coin','heart','shield','key','bomb'].forEach(function (kind) {
      g.pickups.length = 0;
      g.dropPickup(kind, 240, 150, 1);
      const pk = g.pickups[0];
      const c = document.createElement('canvas'); c.width = 24; c.height = 24;
      const gg = c.getContext('2d'); gg.imageSmoothingEnabled = false;
      pk.t = 0;
      // 只取中心区域签名
      gg.translate(-pk.x + 12, -pk.y + 12);
      pk.draw(gg);
      const d = gg.getImageData(0, 0, 24, 24).data;
      let sig = 0, opaque = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i+3] > 40) { opaque++; sig = (sig * 31 + d[i] + d[i+1]*3 + d[i+2]*7) % 1000003; } }
      out[kind] = { opaque: opaque, sig: sig };
    });
    out.keyDiffersFromBomb = out.key.sig !== out.bomb.sig;
    out.allDistinct = new Set(['coin','heart','shield','key','bomb'].map(function(k){ return out[k].sig; })).size === 5;
    // 拾取钥匙是否正确 +1
    g.keys = 0; g.pickups.length = 0;
    g.dropPickup('key', g.player.x, g.player.y, 1);
    const pk = g.pickups[0]; pk.life = 20; pk.x = g.player.x + 4; pk.y = g.player.y;
    pk.collect(g);
    out.keysAfterPickup = g.keys;
    return out;
  });
  console.log(JSON.stringify(res, null, 1));
  console.log('errors:', errs);
  await b.close();
})();
