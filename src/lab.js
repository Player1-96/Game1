'use strict';
/* ============================================================================
 *  融合实验室（试玩页）——  打开 index.html?lab=1 才出现
 *
 *  为什么要有它：试一条「弹道类」融合法宝，正常玩法要开局、配装、走到融合阵、
 *  凑齐两件材料、再找怪试 —— 成本极高，所以机制类改动根本没人愿意验。
 *  这里把「配装 + 摆靶 + 放慢 + 读数」压成一次点击。
 *
 *  ⚠️ 只在带 ?lab 时初始化，正式游玩零影响（页面里连 DOM 都不会出现）。
 * ========================================================================== */
(function () {
  if (!/[?&]lab(=|&|$)/.test(location.search)) return;

  const CSS = `
  body.lab-on{ padding-right:344px; }
  #lab{
    position:fixed; right:0; top:0; bottom:0; width:334px; overflow-y:auto;
    background:#0d0a19; border-left:1px solid #2e2748; padding:10px 12px 40px;
    font-size:12px; line-height:1.5; color:#c9c4e0; z-index:50;
  }
  #lab h2{ font-size:13px; margin:0 0 8px; color:#f2c761; letter-spacing:.12em; }
  #lab .sec{ border:1px solid #241f3a; border-radius:6px; padding:8px; margin-bottom:8px; }
  #lab .hd{ color:#57d6b0; margin-bottom:6px; letter-spacing:.08em; }
  #lab button{
    background:#191430; color:#d8d5e6; border:1px solid #38305a; border-radius:4px;
    padding:3px 7px; margin:0 4px 4px 0; cursor:pointer; font-size:11px; font-family:inherit;
  }
  #lab button:hover{ border-color:#57d6b0; color:#e9f7f2; }
  #lab button.on{ background:#123a30; border-color:#57d6b0; color:#a9f2dd; }
  #lab select{ background:#191430; color:#d8d5e6; border:1px solid #38305a; border-radius:4px; padding:2px 4px; font-size:11px; }
  #lab .items{ display:flex; flex-wrap:wrap; gap:2px; }
  #lab .rd{ font-family:ui-monospace,Consolas,monospace; font-size:11px; white-space:pre-wrap; color:#9a94b8; }
  #lab .rd b{ color:#f2c761; font-weight:400; }
  #lab .note{ color:#6d6889; font-size:11px; margin-top:4px; }
  #lab .tier{ color:#f2c761; }
  `;

  function init(G) {
    document.body.classList.add('lab-on');
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    const el = document.createElement('div');
    el.id = 'lab';
    el.setAttribute('tabindex', '-1');
    el.innerHTML = `
      <h2>融合实验室</h2>
      <div class="sec">
        <div class="hd">流派 / 场景</div>
        <div class="row" id="labStyle"></div>
        <div class="row">
          <button data-a="reset">重开本层</button>
          <button data-a="clear">清场</button>
          <button data-a="god">无敌：关</button>
          <button data-a="mp">满灵</button>
        </div>
        <div class="row">
          跳到第 <select id="labDepth"><option>1</option><option>5</option><option>10</option><option>15</option></select> 层
          <button data-a="jump">跳层</button>
          <button data-a="jumpboss">直达 Boss 房</button>
        </div>
        <div class="note">跳层会重铺整层，已装的法宝不会掉（读档级别不会发生）。</div>
      </div>

      <div class="sec">
        <div class="hd">靶子</div>
        <div class="row">
          <button data-a="dummy1">木桩 ×1</button>
          <button data-a="row">一排 ×5</button>
          <button data-a="ring">一圈 ×8</button>
          <button data-a="cleart">清靶</button>
        </div>
        <div class="row">木桩血量
          <select id="labHp">
            <option value="99999">不死（看弹道）</option>
            <option value="120">120（看得见掉血）</option>
            <option value="30">30（几刀就死）</option>
          </select>
        </div>
        <div class="note">靶子不打人、不移动，专门用来看清「剑怎么飞」。</div>
      </div>

      <div class="sec">
        <div class="hd">时间（看弹道最关键）</div>
        <div class="row" id="labSpeed"></div>
        <div class="note">弹道类的机制在 1× 下常常一眨眼就过去了；用 1/4 速或单步看。</div>
      </div>

      <div class="sec">
        <div class="hd">融合法宝（点一下就装上）</div>
        <div class="row">阶位 <select id="labTier">
          <option value="1">Lv1</option><option value="2">Lv2</option><option value="3">Lv3</option>
        </select>
          <button data-a="trio">试这三条</button>
          <button data-a="strip">清空法宝</button>
          <button data-a="forge" title="直接打开融合阵面板（手里没有可融组合时，会先替你补一对材料）">开融合阵</button>
        </div>
        <div class="items" id="labItems"></div>
      </div>

      <div class="sec">
        <div class="hd">读数</div>
        <div class="rd" id="labRead"></div>
      </div>`;
    document.body.appendChild(el);

    /* 面板按键不许漏给游戏：否则按空格出招会顺手点一次「上一次按过的按钮」 */
    el.addEventListener('keydown', e => e.stopPropagation());
    const blur = () => { el.setAttribute('tabindex', '-1'); if (document.activeElement) document.activeElement.blur(); };

    const $ = q => el.querySelector(q);
    const game = G;

    /* ---------------- 时间控制 ---------------- */
    let slowSkip = 0;      // 每 N+1 帧放行 1 帧
    let frozen = false;
    const origUpdate = game.update.bind(game);
    let skipAcc = 0;
    game.update = function () {
      if (frozen) return;
      if (slowSkip > 0) { skipAcc++; if (skipAcc % (slowSkip + 1) !== 0) return; }
      origUpdate();
    };
    const speedBtns = [
      { k: '1×', v: 0 }, { k: '半速', v: 1 }, { k: '1/4', v: 3 }, { k: '1/10', v: 9 }
    ];
    const sp = $('#labSpeed');
    speedBtns.forEach(s => {
      const b = document.createElement('button');
      b.textContent = s.k;
      b.onclick = () => {
        slowSkip = s.v; frozen = false;
        Array.from(sp.children).forEach(c => c.classList.remove('on'));
        b.classList.add('on');
        $('#labStep').textContent = '单步';
        blur();
      };
      if (s.v === 0) b.classList.add('on');
      sp.appendChild(b);
    });
    const stepBtn = document.createElement('button');
    stepBtn.id = 'labStep';
    stepBtn.textContent = '单步';
    stepBtn.onclick = () => {
      frozen = !frozen;
      stepBtn.textContent = frozen ? '▶ 推进一帧' : '单步';
      stepBtn.classList.toggle('on', frozen);
      if (frozen) { /* 停住，等用户一帧一帧看 */ }
      blur();
    };
    /* 冻结状态下点「推进一帧」：直接叫一次真正的 update */
    const adv = document.createElement('button');
    adv.textContent = '▶ 推进一帧';
    adv.onclick = () => { origUpdate(); game.draw(); blur(); };
    sp.appendChild(stepBtn);
    sp.appendChild(adv);

    /* ---------------- 流派 ---------------- */
    const styleBtns = [
      { k: 'feijian', n: '飞剑流' }, { k: 'jujian', n: '巨剑流' }, { k: 'wujian', n: '舞剑流' }
    ];
    const sb = $('#labStyle');
    styleBtns.forEach(s => {
      const b = document.createElement('button');
      b.textContent = s.n;
      b.onclick = () => { game.newRun(s.k); syncStyle(); refreshItems(); blur(); };
      b.dataset.s = s.k;
      sb.appendChild(b);
    });
    function syncStyle() {
      Array.from(sb.children).forEach(c => c.classList.toggle('on', c.dataset.s === game.style));
    }
    syncStyle();

    /* ---------------- 场景 ---------------- */
    let godOn = false;
    /* 实验室允许在标题页就操作：点任何需要玩家的按钮，先替用户开一局（默认飞剑流）。
       不这么做的话，第一次进实验室点「装法宝」会静默报错（player 还是 null）。 */
    function ensureRun() {
      if (!game.player || game.state === 'title') {
        game.newRun(game.style || 'feijian');
        game.state = 'play';
        syncStyle();
      }
      return game.player;
    }
    el.addEventListener('click', ev => {
      const a = ev.target.getAttribute && ev.target.getAttribute('data-a');
      if (!a) return;
      const pl = ensureRun();
      const hp = +$('#labHp').value;
      if (a === 'reset') { game.newRun(game.style); }
      else if (a === 'clear') { game.enemies.length = 0; game.bullets.length = 0; }
      else if (a === 'god') { godOn = !godOn; ev.target.textContent = '无敌：' + (godOn ? '开' : '关'); ev.target.classList.toggle('on', godOn); }
      else if (a === 'mp') { pl.mp = pl.maxMP; }
      else if (a === 'jump') {
        const d = +$('#labDepth').value;
        game.newFloor(d); game.state = 'play';
        pl.x = ROOM_W / 2; pl.y = ROOM_H / 2 + 20;
      }
      else if (a === 'jumpboss') {
        const d = +$('#labDepth').value;
        game.newFloor(d); game.state = 'play';
        const boss = Array.from(game.floor.rooms.values()).filter(r => r.type === RT.BOSS)[0];
        const jb = el.querySelector('[data-a="jumpboss"]');
        if (boss) game.enterRoom(boss, null);
        else { jb.textContent = '（本层无 Boss）'; setTimeout(() => { jb.textContent = '直达 Boss 房'; }, 1400); }
      }
      else if (a === 'dummy1') { spawnDummy(ROOM_W / 2, ROOM_H / 2 - 60, hp); }
      else if (a === 'row') {
        game.enemies.length = 0;
        for (let i = 0; i < 5; i++) spawnDummy(120 + i * 60, ROOM_H / 2, hp);
      }
      else if (a === 'ring') {
        game.enemies.length = 0;
        for (let i = 0; i < 8; i++) {
          const ang = i * Math.PI / 4;
          spawnDummy(ROOM_W / 2 + Math.cos(ang) * 70, ROOM_H / 2 + Math.sin(ang) * 70, hp);
        }
      }
      else if (a === 'cleart') { game.enemies.length = 0; }
      else if (a === 'trio') { ['wangfu', 'jianying', 'huiming'].forEach(id => equip(id)); }
      else if (a === 'forge') {
        /* 融合面板（验光标跳不跳灰格、试不同材料组合都从这里进）。
           ⚠️ 手里凑不出可融组合时 openFusion 会直接不弹（设计如此，免得白丢一次机会），
              在实验室里那只会让人以为按钮坏了 —— 于是先替用户补一对材料。 */
        if (!FUSION_DEF.some(r => fusionReady(r, pl.items))) {
          equip('qingfeng'); equip('leifu');
        }
        pl.x = ROOM_W / 2; pl.y = ROOM_H / 2;
        game.openFusion(null);
      }
      else if (a === 'strip') {
        pl.items.length = 0; pl.fusionMem = {}; if (pl.usedMats) pl.usedMats = {};
        pl.recomputeStats(game.style); game.orbits.length = 0;
      }
      blur();
    });

    /* 木桩：不打人、不移动、不刷技能 —— 纯粹是「看清弹道」用的靶 */
    function spawnDummy(x, y, hp) {
      const e = new Enemy('xiesui', x, y, game.depth || 1);
      e.spawnT = 0; e.speed = 0; e.touch = 0; e.cd = 999999;
      e.maxHp = hp; e.hp = hp; e.dummy = true;
      game.enemies.push(e);
      return e;
    }

    /* ---------------- 一键装备 ---------------- */
    function equip(id) {
      const pl = ensureRun();
      const tier = +$('#labTier').value;
      pl.give(id, game);
      game.itemPopup = null;
      if (tier > 1) {
        pl.fusionMem = pl.fusionMem || {};
        pl.fusionMem[id] = { a: tier, b: tier };
        pl.recomputeStats(game.style);
      }
      if (game.orbits) game.orbits.length = 0;
      refreshItems();
    }

    const items = ITEM_DEFS.filter(d => d.fusion);
    const box = $('#labItems');
    function refreshItems() {
      const pl = game.player;
      if (!pl) { Array.from(box.querySelectorAll('button')).forEach(b => b.classList.remove('on')); return; }
      const have = {};
      (pl.items || []).forEach(i => { have[i] = (have[i] || 0) + 1; });
      Array.from(box.querySelectorAll('button')).forEach(b => {
        b.classList.toggle('on', !!have[b.dataset.id]);
      });
    }
    items.forEach(d => {
      const b = document.createElement('button');
      b.dataset.id = d.id;
      b.textContent = d.name;
      b.title = d.desc + '\n（' + d.id + '）';
      b.onclick = () => { equip(d.id); blur(); };
      box.appendChild(b);
    });
    refreshItems();

    /* 阶位改动后要把已有的产物重算一遍 —— 否则「先装 Lv1 再切 Lv2」不会生效 */
    $('#labTier').addEventListener('change', () => {
      const pl = game.player;
      if (!pl) return;
      const tier = +$('#labTier').value;
      pl.fusionMem = pl.fusionMem || {};
      Object.keys(pl.fusionMem).forEach(id => { pl.fusionMem[id] = { a: tier, b: tier }; });
      pl.recomputeStats(game.style);
      blur();
    });

    /* ---------------- 读数 ---------------- */
    const rd = $('#labRead');
    let tick = 0;
    setInterval(() => {
      tick++;
      if (!game.player) { rd.textContent = '（还没开局 —— 点上面任意按钮会自动开一局）'; return; }
      if (godOn) game.player.invuln = Math.max(game.player.invuln, 120);
      /* 帧计数节流：读数没必要 60fps 刷 */
      if (tick % 5 !== 0) return;
      const pl = game.player;
      const fus = Object.keys(pl.stats.fus || {});
      const bl = game.bullets.map(b => {
        const tag = b.boom ? '去' : (b.boomBack ? '回' : (b.reflected ? '返' : '·'));
        return tag + (b.bounce ? '弹' + b.bounce : '') + '/' + Math.round(b.dmg * 10) / 10;
      });
      rd.innerHTML =
        '流派 <b>' + game.style + '</b>　第 <b>' + (game.depth || '-') + '</b> 层　'
        + '状态 ' + game.state + (godOn ? '　无敌' : '') + '\n'
        + '机制 <b>' + (fus.length ? fus.join(' / ') : '（无）') + '</b>\n'
        + '数值 dmg ' + pl.stats.damage.toFixed(1) + '　射速 ' + pl.stats.fireRate.toFixed(2)
        + '　穿透 ' + pl.stats.pierce + '　散射 ' + pl.stats.spread + '\n'
        + '剑影环 <b>' + game.orbits.length + '/' + ORBIT_MAX + '</b>　充能 '
        + (pl.orbitChg || 0) + '/' + ORBIT_NEED + '\n'
        + '在飞 ' + game.bullets.length + ' 发　' + (bl.length ? bl.slice(0, 8).join('  ') : '—');
    }, 16);

    window.Lab = { game: game, equip: equip, spawnDummy: spawnDummy };
    console.log('[lab] 融合实验室已就绪：?lab=1');
  }

  window.addEventListener('load', function () {
    let tries = 0;
    const t = setInterval(function () {
      if (window.Game) { clearInterval(t); try { init(window.Game); } catch (e) { console.error('[lab]', e); } }
      else if (++tries > 150) clearInterval(t);
    }, 20);
  });
})();
