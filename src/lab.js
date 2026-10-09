'use strict';
/* ============================================================================
 *  设计调试台 —— 打开 index.html?lab=1（或 ?dev=1）才出现
 *
 *  为什么要有它：试一条「弹道类」融合法宝，正常玩法要开局、配装、走到融合阵、
 *  凑齐两件材料、再找怪试 —— 成本极高，所以机制类改动根本没人愿意验。
 *  这里把「配装 + 摆靶 + 放慢 + 读数」压成一次点击。
 *
 *  2026-10-09 扩成「法宝 / 怪物设计台」：加了**法宝总表**（63 件全列，左键 +1 件
 *  右键 −1 件、带搜索）与**怪物总表**（38 种：中式杂兵 / 北欧杂兵 / 精英 / 尊者，
 *  带搜索、站位、血量倍率、AI 开关、碰撞圈）。清单**现取源码那几张表**，
 *  不另抄名单 —— 换世界漏了哪张表，面板里会立刻少一批（缺素材的还会标红）。
 *
 *  ⚠️ 只在带 ?lab / ?dev 时初始化，正式游玩零影响（页面里连 DOM 都不会出现）。
 * ========================================================================== */
(function () {
  if (!/[?&](lab|dev)(=|&|$)/.test(location.search)) return;

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
  /* 一行控件：从「靠 inline 自然换行」改成 flex —— 面板里控件变密之后，
     靠 inline 的基线对齐会出现按钮压到下一行文字上的观感（2026-10-09 出图发现） */
  #lab .row{ display:flex; flex-wrap:wrap; align-items:center; gap:4px 5px; margin-bottom:2px; }
  #lab .row > .note{ margin-top:0; }
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
  /* —— 法宝 / 怪物总表（2026-10-09 加）—— */
  #lab input.q{
    background:#191430; color:#d8d5e6; border:1px solid #38305a; border-radius:4px;
    padding:3px 6px; font-size:11px; width:100%; box-sizing:border-box; font-family:inherit;
  }
  #lab .list{
    display:flex; flex-wrap:wrap; gap:3px; align-content:flex-start;
    max-height:214px; overflow-y:auto; border:1px solid #1d1832; border-radius:4px;
    padding:4px; margin-top:4px;
  }
  #lab .list button{ padding:2px 5px; margin:0; }
  #lab .list button .cnt{ color:#f2c761; margin-left:3px; }
  #lab .list button.miss{ border-color:#e0525f; }        /* 图集里没素材的，标红 —— 换世界最容易漏这里 */
  #lab .sep{ color:#6d6889; font-size:11px; width:100%; margin:3px 0 1px; }
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
      <h2>设计调试台</h2>
      <div class="note" id="labHint">?lab=1 / ?dev=1 打开；正式游玩时这一栏根本不会出现。</div>

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
        <div class="hd">法宝总表（左键 +1 件，右键 −1 件）</div>
        <div class="row"><input class="q" id="labItemQ" type="text" placeholder="搜名字 / id，例如 剑、leifu、苹果…"></div>
        <div class="row">
          <select id="labItemGrp">
            <option value="all">全部</option>
            <option value="cn">中式法宝 / 丹药</option>
            <option value="nordic">北欧神器 / 秘药</option>
            <option value="fusion">融合产物</option>
            <option value="use">丹药 / 功法（点一下当场生效）</option>
          </select>
          <button data-a="itemall">每样装一件</button>
          <button data-a="itemrand">随机 5 件</button>
          <button data-a="strip">清空法宝</button>
        </div>
        <div class="list" id="labAllItems"></div>
        <div class="note">法宝：左键 +1 件 / 右键 −1 件（重复 id 就是阶位）；
          丹药与功法不进背包，点一下当场生效。<span id="labItemCount">—</span></div>
      </div>

      <div class="sec">
        <div class="hd">融合法宝（只看可融那批，点一下就装上）</div>
        <div class="row">阶位 <select id="labTier">
          <option value="1">Lv1</option><option value="2">Lv2</option><option value="3">Lv3</option>
        </select>
          <button data-a="trio">试这三条</button>
          <button data-a="forge" title="直接打开融合阵面板（手里没有可融组合时，会先替你补一对材料）">开融合阵</button>
        </div>
        <div class="items" id="labItems"></div>
      </div>

      <div class="sec">
        <div class="hd">怪物总表（点一下就刷出来）</div>
        <div class="row"><input class="q" id="labFoeQ" type="text" placeholder="搜名字 / id，例如 霜狼、芬里尔、rimtroll…"></div>
        <div class="row">
          <select id="labFoeGrp">
            <option value="all">全部</option>
            <option value="cn">中式杂兵</option>
            <option value="nordic">北欧杂兵</option>
            <option value="elite">精英妖物</option>
            <option value="boss">尊者</option>
          </select>
          <select id="labFoePlace">
            <option value="single">刷一只</option>
            <option value="row">一排 ×5</option>
            <option value="ring">一圈 ×8</option>
          </select>
        </div>
        <div class="row">血量
          <select id="labFoeHp">
            <option value="depth">按当前层（默认）</option>
            <option value="0.3">0.3×（脆）</option>
            <option value="3">3×（耐打）</option>
            <option value="99999">不死（看弹道）</option>
          </select>
          <button data-a="ai">AI：开</button>
          <button data-a="hitbox">碰撞圈：关</button>
          <button data-a="foeclear">清场</button>
          <span class="note" id="labFoeCount">—</span>
        </div>
        <div class="list" id="labFoes"></div>
        <div class="note">「AI：关」= 站着不动的靶子（看造型与受击反馈）；精英带自己的神通，
          尊者按第 1 阶段出场。一排 / 一圈会先清场再摆。</div>
      </div>

      <div class="sec">
        <div class="hd">靶子（不打人、不动，专看弹道）</div>
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
      </div>

      <div class="sec">
        <div class="hd">时间（看弹道最关键）</div>
        <div class="row" id="labSpeed"></div>
        <div class="note">弹道类的机制在 1× 下常常一眨眼就过去了；用 1/4 速或单步看。</div>
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
      else if (a === 'itemall') { ITEM_DEFS.forEach(d => equip(d.id)); }
      else if (a === 'itemrand') {
        /* 随机 5 件更接近真一局的手感 —— 「每样装一件」是极端值，用来压测画面 */
        const pool2 = ITEM_DEFS.slice();
        for (let i = 0; i < 5 && pool2.length; i++) {
          equip(pool2.splice(Math.floor(Math.random() * pool2.length), 1)[0].id);
        }
      }
      else if (a === 'ai') {
        foeIdle = !foeIdle;
        ev.target.textContent = 'AI：' + (foeIdle ? '关' : '开');
        ev.target.classList.toggle('on', foeIdle);
      }
      else if (a === 'hitbox') {
        showHit = !showHit;
        ev.target.textContent = '碰撞圈：' + (showHit ? '开' : '关');
        ev.target.classList.toggle('on', showHit);
      }
      else if (a === 'foeclear') { game.enemies.length = 0; game.bossRef = null; }
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
      refreshCounts();
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

    /* ---------------- 法宝总表（2026-10-09 加） ----------------
       设计期最常做的两件事：① 把某一件装上、看数值与表现；② 顺手叠几件看 combo。
       所以：**左键 +1 件 / 右键 −1 件**（重复 id 就是阶数，与游戏内一致），
       再配一个搜索框 —— 63 件法宝靠眼睛找太慢。 */
    const allBox = $('#labAllItems');
    const itemQ = $('#labItemQ');
    const itemGrp = $('#labItemGrp');
    const itemCount = $('#labItemCount');
    /* ⚠️ 丹药 / 功法**不进背包**（点一下当场生效、用完即走），所以它们不会有 ×N 计数。
       分组里单列一项，免得在「全部」里点了半天以为按钮坏了。 */
    const isUsable = d => d.type !== 'fabao';
    const itemWorldOf = d => (isUsable(d) ? 'use' : (d.fusion ? 'fusion' : (d.world === 'nordic' ? 'nordic' : 'cn')));

    const allBtns = ITEM_DEFS.map(d => {
      const b = document.createElement('button');
      b.dataset.id = d.id;
      b.dataset.world = itemWorldOf(d);
      b.dataset.hay = (d.name + ' ' + d.id + ' ' + (d.desc || '')).toLowerCase();
      b.title = d.name + '（' + d.id + '，' + b.dataset.world + '）\n'
        + (d.desc || '') + '\n'
        + (isUsable(d) ? '点一下就当场生效（丹药 / 功法不进背包）' : '左键 +1 件　右键 −1 件');
      b.onclick = () => { equip(d.id); blur(); };
      b.oncontextmenu = ev2 => { ev2.preventDefault(); unequip(d.id); blur(); };
      allBox.appendChild(b);
      return b;
    });
    function itemFilter() {
      const q = itemQ.value.trim().toLowerCase();
      const g = itemGrp.value;
      let shown = 0;
      allBtns.forEach(b => {
        const vis = (g === 'all' || b.dataset.world === g)
          && (!q || b.dataset.hay.indexOf(q) >= 0);
        b.style.display = vis ? '' : 'none';
        if (vis) shown++;
      });
      itemCount.textContent = '显示 ' + shown + ' / ' + allBtns.length + ' 件';
    }
    itemQ.addEventListener('input', itemFilter);
    itemGrp.addEventListener('change', itemFilter);
    itemFilter();

    function unequip(id) {
      const pl = ensureRun();
      const i = pl.items.lastIndexOf(id);
      if (i < 0) return;
      pl.items.splice(i, 1);
      /* 产物只有一件、阶位另存在 fusionMem 里 —— 拿掉了就得一起忘掉，
         否则再装回来会带着上次的阶位。 */
      if (pl.fusionMem) delete pl.fusionMem[id];
      pl.recomputeStats(game.style);
      if (game.orbits) game.orbits.length = 0;
      game.itemPopup = null;
      refreshItems();
      refreshCounts();
    }

    /* 已装件数直接写在按钮上（×3 = 三件 = 三阶），一眼看得出当前配装 */
    function refreshCounts() {
      const pl = game.player;
      const have = {};
      if (pl) (pl.items || []).forEach(i => { have[i] = (have[i] || 0) + 1; });
      allBtns.forEach(b => {
        const d = ITEM_MAP[b.dataset.id];
        const n = have[b.dataset.id] || 0;
        b.classList.toggle('on', n > 0);
        b.textContent = d ? d.name : b.dataset.id;
        if (n > 0) {
          const sp2 = document.createElement('span');
          sp2.className = 'cnt';
          sp2.textContent = '×' + n;
          b.appendChild(sp2);
        }
      });
    }

    /* ---------------- 怪物总表（2026-10-09 加） ----------------
       怪物设计要的是「立刻看到它在场上长什么样、怎么动」——
       所以点一下就刷，并且能选站位 / 血量 / AI 开关。
       ⚠️ 清单**现取三张表**（中式 / 北欧 / 精英 / 尊者），不另抄一份名单：
          换世界时漏了哪张表，这里会立刻少一批怪，比看代码快。 */
    const foeBox = $('#labFoes');
    const foeQ = $('#labFoeQ');
    const foeGrp = $('#labFoeGrp');
    const foePlace = $('#labFoePlace');
    const foeHp = $('#labFoeHp');
    let foeIdle = false, showHit = false;

    const FOE_LIST = [];
    const pushFoe = (id, kind, world, def, d) => FOE_LIST.push({
      id: id, kind: kind, world: world, def: def, d: d,
      name: (def && def.name) || id
    });
    Object.keys(ENEMY_DEF).forEach(k => pushFoe(k, 'mob', 'cn', ENEMY_DEF[k], ENEMY_DEF[k]));
    Object.keys(NORDIC_ENEMY_DEF).forEach(k => pushFoe(k, 'mob', 'nordic', NORDIC_ENEMY_DEF[k], NORDIC_ENEMY_DEF[k]));
    Object.keys(ELITE_DEF).forEach(k => pushFoe(k, 'elite', 'cn', ELITE_DEF[k], ENEMY_DEF[ELITE_DEF[k].base]));
    Object.keys(NORDIC_ELITE_DEF).forEach(k => pushFoe(k, 'elite', 'nordic', NORDIC_ELITE_DEF[k], NORDIC_ENEMY_DEF[NORDIC_ELITE_DEF[k].base]));
    Object.keys(BOSS_DEF).forEach(k => pushFoe(k, 'boss', 'cn', BOSS_DEF[k], BOSS_DEF[k]));
    Object.keys(NORDIC_BOSS_DEF).forEach(k => pushFoe(k, 'boss', 'nordic', NORDIC_BOSS_DEF[k], NORDIC_BOSS_DEF[k]));
    const FOE_MAP = {};
    FOE_LIST.forEach(e => { FOE_MAP[e.id] = e; });

    const foeBtns = [];
    let lastGroup = null;
    FOE_LIST.forEach(entry => {
      const grp = entry.kind === 'boss' ? 'boss' : (entry.kind === 'elite' ? 'elite' : entry.world);
      const grpName = { cn: '中式杂兵', nordic: '北欧杂兵', elite: '精英妖物', boss: '尊者' }[grp];
      if (grp !== lastGroup) {
        const sep = document.createElement('div');
        sep.className = 'sep';
        sep.dataset.grp = grp;
        sep.textContent = grpName;
        foeBox.appendChild(sep);
        lastGroup = grp;
      }
      const b = document.createElement('button');
      b.dataset.id = entry.id;
      b.dataset.grp = grp;
      b.dataset.kind = entry.kind;
      b.dataset.hay = (entry.name + ' ' + entry.id + ' ' + ((entry.d && entry.d.desc) || '')).toLowerCase();
      b.textContent = entry.name;
      const st = entry.kind === 'boss'
        ? '血量 ' + entry.d.hp + '　弹幕 ' + entry.d.bolt + '/' + entry.d.alt + '　冲刺 ' + (entry.d.dash || '无')
        : '血量 ' + entry.d.hp + '　AI ' + entry.d.ai + '　半径 ' + entry.d.r
        + (entry.kind === 'elite' ? '　神通 ' + entry.d.perk : '');
      b.title = entry.name + '（' + entry.id + '，' + grpName + '）\n' + st
        + (entry.kind !== 'mob' && entry.d.desc ? '\n' + entry.d.desc : '')
        + '\n标红 = 当前色板下没烤这套素材（会整屏黑），换到它自己的世界再刷';
      b.onclick = () => { spawnFoe(entry); blur(); };
      foeBox.appendChild(b);
      foeBtns.push(b);
    });

    /* 素材是按**当前色板**烘焙的：在北欧段里刷中式怪就是没有图（会整屏黑）。
       所以标红必须跟着色板走 —— 它回答的是「现在刷它安全吗」。
       由读数定时器周期调用（换段 / 跳层后自动跟上），而不是在初始化时算一次。 */
    function refreshFoeArt() {
      foeBtns.forEach(b => {
        const e = FOE_MAP[b.dataset.id];
        const has = e.kind === 'boss'
          ? !!(SPR.boss && SPR.boss[e.id])
          : !!(SPR.enemies && SPR.enemies[(e.d && e.d.spr) || '']);
        b.classList.toggle('miss', !has);
      });
    }

    const foeCount = $('#labFoeCount');
    function foeFilter() {
      const q = foeQ.value.trim().toLowerCase();
      const g = foeGrp.value;
      let shown = 0;
      foeBtns.forEach(b => {
        const vis = (g === 'all' || b.dataset.grp === g)
          && (!q || b.dataset.hay.indexOf(q) >= 0);
        b.style.display = vis ? '' : 'none';
        if (vis) shown++;
      });
      /* 分组标题跟着过滤走，别留一堆空标题 */
      Array.from(foeBox.querySelectorAll('.sep')).forEach(s => {
        const anyVisible = foeBtns.some(b => b.dataset.grp === s.dataset.grp && b.style.display !== 'none');
        s.style.display = anyVisible ? '' : 'none';
      });
      foeCount.textContent = '显示 ' + shown + ' / ' + foeBtns.length + ' 种';
    }
    foeQ.addEventListener('input', foeFilter);
    foeGrp.addEventListener('change', foeFilter);
    refreshCounts();
    foeFilter();

    function hpScaleNow() {
      const v = foeHp.value;
      return v === 'depth' ? (game.depth || 1) : +v;
    }
    function spawnOne(entry, x, y) {
      ensureRun();
      let e;
      if (entry.kind === 'boss') {
        e = new Boss(entry.id, x, y, hpScaleNow());
        game.bossRef = e;                       // 血条要跟着出来，否则看不出阶段
      } else if (entry.kind === 'elite') {
        e = new Enemy(entry.def.base, x, y, hpScaleNow(), entry.id);
      } else {
        e = new Enemy(entry.id, x, y, hpScaleNow());
      }
      e.spawnT = 0;                             // 跳过登场凝形，立刻能打
      if (foeIdle) {                            // 靶子模式：不打人、不动、不放技能
        e.speed = 0; e.touch = 0;
        e.cd = 999999; e.cd2 = 999999; e.cd3 = 999999;
        e.dummy = true;
      }
      game.enemies.push(e);
      return e;
    }
    function spawnFoe(entry) {
      const pl = ensureRun();
      const mode = foePlace.value;
      if (mode === 'single') {
        const sp = game.safeSpawn(pl.x, pl.y - 70, 12);
        spawnOne(entry, sp.x, sp.y);
      } else {
        /* 一排 / 一圈：先清场再摆，否则连点两次会叠在一起分不清谁是谁 */
        game.enemies.length = 0; game.bossRef = null;
        const n = mode === 'row' ? 5 : 8;
        for (let i = 0; i < n; i++) {
          if (mode === 'row') spawnOne(entry, 100 + i * 70, ROOM_H / 2);
          else {
            const a = i * Math.PI * 2 / n;
            spawnOne(entry, ROOM_W / 2 + Math.cos(a) * 80, ROOM_H / 2 + Math.sin(a) * 80);
          }
        }
      }
    }

    /* 碰撞圈：怪物设计最需要看的「实际判定有多大」——
       把 r 与贴图的对应关系盖出来，比读数字快得多 */
    const origDraw = game.draw.bind(game);
    game.draw = function () {
      origDraw();
      if (!showHit) return;
      const g = game.g;
      g.save();
      g.translate(0, 32);
      g.lineWidth = 1;
      for (const e of game.enemies) {
        g.strokeStyle = e.isBoss ? 'rgba(224,82,95,.95)'
          : (e.elite ? 'rgba(242,199,97,.9)' : 'rgba(224,82,95,.7)');
        g.beginPath(); g.arc(e.x, e.y, e.r, 0, Math.PI * 2); g.stroke();
      }
      if (game.player) {
        g.strokeStyle = 'rgba(87,214,176,.95)';
        g.beginPath(); g.arc(game.player.x, game.player.y, game.player.r, 0, Math.PI * 2); g.stroke();
      }
      g.restore();
    };

    /* ---------------- 读数 ---------------- */
    const rd = $('#labRead');
    let tick = 0;
    setInterval(() => {
      tick++;
      if (!game.player) { rd.textContent = '（还没开局 —— 点上面任意按钮会自动开一局）'; return; }
      if (godOn) game.player.invuln = Math.max(game.player.invuln, 120);
      /* 帧计数节流：读数没必要 60fps 刷 */
      if (tick % 5 !== 0) return;
      /* 标红跟着色板走（换段 / 跳层后 SPR 会重烤），每 16 拍重算一次就够 */
      if (tick % 16 === 0) refreshFoeArt();
      const pl = game.player;
      const fus = Object.keys(pl.stats.fus || {});
      const bl = game.bullets.map(b => {
        const tag = b.boom ? '去' : (b.boomBack ? '回' : (b.reflected ? '返' : '·'));
        return tag + (b.bounce ? '弹' + b.bounce : '') + '/' + Math.round(b.dmg * 10) / 10;
      });
      /* 场上怪物清单 —— 刷了三只同款却分不清谁是谁时，看这一行 */
      const tally = {};
      game.enemies.forEach(e => { const k = e.type + (e.elite ? '·精英' : ''); tally[k] = (tally[k] || 0) + 1; });
      const tl = Object.keys(tally).map(k => k + '×' + tally[k]);
      rd.innerHTML =
        '流派 <b>' + game.style + '</b>　第 <b>' + (game.depth || '-') + '</b> 层　'
        + '状态 ' + game.state + (godOn ? '　无敌' : '') + '\n'
        + '机制 <b>' + (fus.length ? fus.join(' / ') : '（无）') + '</b>\n'
        + '数值 dmg ' + pl.stats.damage.toFixed(1) + '　射速 ' + pl.stats.fireRate.toFixed(2)
        + '　穿透 ' + pl.stats.pierce + '　散射 ' + pl.stats.spread + '\n'
        + '剑影环 <b>' + game.orbits.length + '/' + ORBIT_MAX + '</b>　充能 '
        + (pl.orbitChg || 0) + '/' + ORBIT_NEED + '\n'
        + '法宝 <b>' + pl.items.length + '</b> 件\n'
        + '场上 <b>' + game.enemies.length + '</b> 只　'
        + (tl.length ? tl.slice(0, 8).join('  ') : '—') + '\n'
        + '在飞 ' + game.bullets.length + ' 发　' + (bl.length ? bl.slice(0, 8).join('  ') : '—');
    }, 16);

    window.Lab = {
      game: game, equip: equip, unequip: unequip,
      spawnDummy: spawnDummy, spawnFoe: spawnFoe, foeList: FOE_LIST,
      refreshFoeArt: refreshFoeArt, refreshCounts: refreshCounts,
      foeIdle: () => foeIdle, showHit: () => showHit
    };
    console.log('[lab] 设计调试台已就绪：?lab=1 或 ?dev=1　'
      + '法宝 ' + allBtns.length + ' 件 / 怪物 ' + foeBtns.length + ' 种');
  }

  window.addEventListener('load', function () {
    let tries = 0;
    const t = setInterval(function () {
      if (window.Game) { clearInterval(t); try { init(window.Game); } catch (e) { console.error('[lab]', e); } }
      else if (++tries > 150) clearInterval(t);
    }, 20);
  });
})();
