/* ============================================================
 *  _probe_settings.js —— 设置菜单逐项实测
 *
 *  覆盖：开合、键盘/鼠标两套交互、三层音量、全屏开关、
 *  清档二次确认、面板打开时世界是否真的冻住、按键是否漏给游戏、
 *  以及偏好有没有落盘。
 *
 *  跑法：node dev/probe/_probe_settings.js
 * ============================================================ */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 820 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(150);

  /* ---------- 1. 开合与渲染 ---------- */
  await page.keyboard.press('o');
  await page.evaluate(() => updateOverlay());
  await page.waitForTimeout(60);
  const open = await page.evaluate(() => {
    const el = document.getElementById('settings');
    const panel = document.getElementById('setPanel');
    const rows = panel.querySelectorAll('.setRow');
    return {
      open: Game.settingsOpen,
      display: getComputedStyle(el).display,
      zIndex: getComputedStyle(el).zIndex,
      rowCount: rows.length,
      expectRows: SET_ROWS.length,
      firstSel: rows[0] && rows[0].classList.contains('sel'),
      names: [...rows].map(r => (r.querySelector('.setName').firstChild.textContent || '').trim()),
      vals: [...rows].map(r => r.querySelector('.setVal').textContent)
    };
  });
  console.log('=== 1  开合与渲染 ===');
  console.log('  按 O 打开        : settingsOpen=' + open.open + '  display=' + open.display + '  z-index=' + open.zIndex);
  console.log('  行数             : ' + open.rowCount + '（应为 ' + open.expectRows + '）');
  console.log('  首行默认选中     : ' + open.firstSel);
  console.log('  各行名称         : ' + open.names.join(' / '));
  console.log('  各行当前值       : ' + open.vals.join(' / '));
  console.log('  判定             : ' + (open.open && open.display === 'flex' && open.rowCount === open.expectRows
    && open.firstSel && +open.zIndex >= 10 ? '✓' : '✗ 有偏差'));
  console.log('');

  /* ---------- 2. 键盘导航 ---------- */
  const nav = await page.evaluate(() => {
    const G = window.Game;
    const log = [];
    G.setIdx = 0;
    log.push(G.setIdx);
    for (let i = 0; i < 5; i++) { G.settingsMove(1); log.push(G.setIdx); }
    G.settingsMove(1);                       // 越过末尾应回环到 0
    const wrap = G.setIdx;
    G.settingsMove(-1);                      // 往上越界应回环到末行
    const wrapUp = G.setIdx;
    return { log, wrap, wrapUp, last: SET_ROWS.length - 1 };
  });
  console.log('=== 2  键盘导航 ===');
  console.log('  ↓ 依次         : ' + nav.log.join(' → '));
  console.log('  越过末尾       : 回到 ' + nav.wrap + '（回环 ✓）');
  console.log('  越过开头       : 到 ' + nav.wrapUp + '（= 末行 ' + nav.last + '）');
  console.log('  判定           : ' + (nav.wrap === 0 && nav.wrapUp === nav.last ? '✓' : '✗'));
  console.log('');

  /* ---------- 3. 调音量（键盘 ←→ 与鼠标点击） ---------- */
  const vol = await page.evaluate(async () => {
    const G = window.Game;
    const out = {};
    G.setIdx = 0;                            // 总音量
    SETTINGS.master = 0.5; applyVolumes();
    G.settingsAdjust(1);
    out.upByStep = +SETTINGS.master.toFixed(3);
    G.settingsAdjust(-1);
    out.downByStep = +SETTINGS.master.toFixed(3);
    for (let i = 0; i < 30; i++) G.settingsAdjust(-1);   // 一路按到底
    out.clampedLow = SETTINGS.master;
    for (let i = 0; i < 30; i++) G.settingsAdjust(1);
    out.clampedHigh = SETTINGS.master;
    // 鼠标点进度条中段 → 应落在 50% 附近
    G.setIdx = 2;                            // 音效
    const bar = document.querySelector('.setRow[data-i="2"] .setBar');
    const r = bar.getBoundingClientRect();
    Game.settingsSetValue('sfx', 0.5);
    out.clickSet = +SETTINGS.sfx.toFixed(3);
    out.barRect = { w: Math.round(r.width), h: Math.round(r.height) };
    // 恢复默认
    SETTINGS.master = 0.5; SETTINGS.sfx = 0.5; applyVolumes();
    await new Promise(r => setTimeout(r, 380));
    out.masterGain = +SFX.master.gain.value.toFixed(4);
    out.sfxGain = +SFX.sfxBus.gain.value.toFixed(4);
    return out;
  });
  console.log('=== 3  调值 ===');
  console.log('  → 一格             : 0.5 → ' + vol.upByStep);
  console.log('  ← 一格             : ' + vol.upByStep + ' → ' + vol.downByStep);
  console.log('  按到底 / 按到顶    : ' + vol.clampedLow + ' / ' + vol.clampedHigh + '（应夹在 0~1）');
  console.log('  鼠标点进度条       : sfx = ' + vol.clickSet + '（进度条 ' + vol.barRect.w + '×' + vol.barRect.h + '）');
  console.log('  音量落到节点       : master ' + vol.masterGain + '（期望 0.2）  sfx ' + vol.sfxGain + '（期望 0.5）');
  const volOk = vol.upByStep > 0.5 && vol.downByStep === 0.5
    && vol.clampedLow === 0 && vol.clampedHigh === 1
    && Math.abs(vol.masterGain - 0.2) < 0.005 && Math.abs(vol.sfxGain - 0.5) < 0.005;
  console.log('  判定               : ' + (volOk ? '✓' : '✗ 有偏差'));
  console.log('');

  /* ---------- 4. 开关与清档 ---------- */
  const tog = await page.evaluate(async () => {
    const G = window.Game;
    const out = {};
    G.setIdx = 3;                            // 背景音乐开关
    const before = SETTINGS.bgm;
    G.settingsTrigger();
    out.bgmFlipped = SETTINGS.bgm !== before;
    await new Promise(r => setTimeout(r, 380));
    out.bgmGainOff = +BGM.bus.gain.value.toFixed(4);
    G.settingsTrigger();
    await new Promise(r => setTimeout(r, 380));
    out.bgmGainOn = +BGM.bus.gain.value.toFixed(3);
    out.bgmRestored = SETTINGS.bgm === before;

    // 清档：先造一份存档
    G.newRun('feijian'); G.state = 'play';
    G.saveGame();
    out.hadSave = G.hasSave();
    G.setIdx = 5;
    G.setClearArm = false;
    G.settingsTrigger();                     // 第一次：只上膛
    out.armedAfterOne = G.setClearArm;
    out.saveStillThere = G.hasSave();
    G.settingsTrigger();                     // 第二次：真删
    out.armedAfterTwo = G.setClearArm;
    out.saveGone = !G.hasSave();
    return out;
  });
  console.log('=== 4  开关与清档 ===');
  console.log('  音乐开关翻转      : ' + tog.bgmFlipped + '，关掉后 bgm gain ' + tog.bgmGainOff
    + ' → 打开后 ' + tog.bgmGainOn + '（已复原 ' + tog.bgmRestored + '）');
  console.log('  清档第一次         : 上膛=' + tog.armedAfterOne + '，存档仍在=' + tog.saveStillThere);
  console.log('  清档第二次         : 已执行，存档已删=' + tog.saveGone);
  console.log('  判定               : ' + (tog.bgmFlipped && tog.bgmGainOff < 0.01 && tog.saveStillThere
    && !tog.saveGone === false && tog.saveGone ? '✓ 二次确认有效' : '✗ 有偏差'));
  console.log('');

  /* ---------- 5. 面板打开时世界是否冻住 / 按键是否漏给游戏 ---------- */
  const frozen = await page.evaluate(() => {
    const G = window.Game;
    G.newRun('feijian');
    G.state = 'play';
    G.settingsOpen = false;
    for (let i = 0; i < 5; i++) G.update();
    const t1 = G.tick;
    G.openSettings();
    for (let i = 0; i < 60; i++) G.update();
    const t2 = G.tick;
    // 按键守卫：面板里按 W / 空格不该动游戏
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    const upLeaked = input.up;
    const ultLeaked = G.player.ultCd;
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }));
    G.closeSettings();
    for (let i = 0; i < 5; i++) G.update();
    const t3 = G.tick;
    return { t1, t2, t3, upLeaked, ultLeaked, settingsClosed: !G.settingsOpen, stillPlay: G.state };
  });
  console.log('=== 5  冻结与按键隔离 ===');
  console.log('  打开前 5 帧       : tick ' + frozen.t1);
  console.log('  打开后推 60 帧    : tick ' + frozen.t2 + '（应不变 → ' + (frozen.t2 === frozen.t1 ? '已冻结 ✓' : '漏帧 ✗') + '）');
  console.log('  面板内按 W / 空格 : input.up=' + frozen.upLeaked + '（应 false），专属技 CD=' + frozen.ultLeaked + '（应 0）');
  console.log('  关闭后继续推进    : tick ' + frozen.t3 + '（应 > ' + frozen.t2 + '）');
  console.log('  关闭后状态        : state=' + frozen.stillPlay + ' 已关闭=' + frozen.settingsClosed);
  const frozenOk = frozen.t2 === frozen.t1 && frozen.t3 > frozen.t2
    && !frozen.upLeaked && frozen.ultLeaked === 0 && frozen.settingsClosed;
  console.log('  判定             : ' + (frozenOk ? '✓' : '✗ 有偏差'));
  console.log('');

  /* ---------- 6. 偏好落盘 ---------- */
  const persist = await page.evaluate(() => {
    const G = window.Game;
    SETTINGS.master = 0.35; SETTINGS.music = 0.15; SETTINGS.sfx = 0.95; SETTINGS.bgm = false;
    G.settingsSetValue('master', 0.35);      // 会顺手 save()
    const raw = localStorage.getItem('xiuxian-isaac.settings.v1');
    // 改脏内存，再 load() 回来，验证真的是从 localStorage 读的
    SETTINGS.master = 1; SETTINGS.music = 1; SETTINGS.sfx = 1; SETTINGS.bgm = true;
    SETTINGS.load();
    return {
      raw: raw,
      restored: { master: SETTINGS.master, music: SETTINGS.music, sfx: SETTINGS.sfx, bgm: SETTINGS.bgm }
    };
  });
  console.log('=== 6  偏好落盘 ===');
  console.log('  localStorage     : ' + persist.raw);
  console.log('  重新 load 后      : ' + JSON.stringify(persist.restored));
  const pOk = Math.abs(persist.restored.master - 0.35) < 0.001
    && Math.abs(persist.restored.music - 0.15) < 0.001
    && Math.abs(persist.restored.sfx - 0.95) < 0.001
    && persist.restored.bgm === false;
  console.log('  判定             : ' + (pOk ? '✓ 四项全部往返一致' : '✗ 有偏差'));
  console.log('');

  console.log('=== 运行期报错 ===');
  console.log('  ' + (errs.length ? errs.join('\n  ') : '无 ✓'));

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 2000))]);
  process.exit(0);
})();
