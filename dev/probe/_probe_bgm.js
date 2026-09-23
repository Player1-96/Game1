/* ============================================================
 *  _probe_bgm.js —— 背景音乐逐项实测
 *
 *  重点不是「代码跑通了」，而是**真的出了声**：
 *  在 master 后面挂一个 AnalyserNode，读时域波形的 RMS。
 *  RMS > 0 才算数 —— Web Audio 是「调度成功」与「出声」两件事。
 *
 *  跑法：node dev/probe/_probe_bgm.js
 * ============================================================ */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  await page.goto(FILE);
  await page.waitForFunction(() => window.Game && window.Game.state === 'title', null, { timeout: 15000 });
  // 冻住主循环，音频调度器（setInterval）照跑，互不干扰
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.mouse.click(400, 300);          // 真实交互：唤醒 AudioContext
  await page.waitForTimeout(200);

  /* ---------- 1. 音频上下文与三层总线 ---------- */
  const ctxInfo = await page.evaluate(() => {
    SFX.ensure();
    const an = SFX.ctx.createAnalyser();
    an.fftSize = 2048;
    SFX.master.disconnect();
    SFX.master.connect(an);
    an.connect(SFX.ctx.destination);
    window.__an = an;
    return {
      state: SFX.ctx.state,
      hasMaster: !!SFX.master,
      hasSfxBus: !!SFX.sfxBus,
      sampleRate: SFX.ctx.sampleRate
    };
  });
  console.log('=== 1  音频上下文 ===');
  console.log('  AudioContext 状态   : ' + ctxInfo.state + (ctxInfo.state === 'running' ? ' ✓ 已唤醒' : ' ✗ 未唤醒'));
  console.log('  三层总线            : master=' + ctxInfo.hasMaster + ' sfxBus=' + ctxInfo.hasSfxBus);
  console.log('  采样率              : ' + ctxInfo.sampleRate + ' Hz');
  console.log('');

  /* ---------- 2. 曲谱结构 ---------- */
  const tracks = await page.evaluate(() => {
    const out = {};
    for (const [k, T] of Object.entries(BGM_TRACKS)) {
      out[k] = {
        bpm: T.bpm,
        bass: T.bass.length,
        lead: T.lead.length,
        perc: T.perc.length,
        leadBad: T.lead.filter(x => x !== '.' && x !== '-' && !/^[a-g]#?\d$/.test(x)),
        bassBad: T.bass.filter(x => !/^[a-g]#?\d$/.test(x)),
        bars: T.lead.length / 4,
        // 谱面里实际发声的音符数（用于判断「是不是空曲子」）
        sounding: T.lead.filter(x => x !== '.' && x !== '-').length
      };
    }
    return out;
  });
  console.log('=== 2  曲谱结构 ===');
  for (const [k, t] of Object.entries(tracks)) {
    const okLead = t.lead % 4 === 0 && t.leadBad.length === 0;
    const okPerc = t.perc === 0 || t.perc === 8;
    const okBass = t.bassBad.length === 0 && t.bass >= 4;
    console.log('  %s  %s bpm  %d 小节  lead %d 音（%d 个发声音）  bass %d  perc %d  %s',
      k.padEnd(8), String(t.bpm).padStart(3), t.bars, t.lead, t.sounding, t.bass, t.perc,
      (okLead && okPerc && okBass) ? '✓' : '✗ 结构异常');
  }
  console.log('');

  /* ---------- 3. 选曲逻辑 ---------- */
  const pick = await page.evaluate(() => {
    const G = window.Game;
    const out = {};
    const probe = () => {
      G.updateBgm();
      return BGM.track;
    };
    G.state = 'title'; out.title = probe();
    G.state = 'choose'; out.choose = probe();
    G.state = 'chall'; out.chall = probe();
    // 开一局，进普通房
    G.newRun('feijian');
    G.state = 'play';
    out.playNormal = probe();
    // 把当前房改成魔窟并放一只头目
    G.room.type = 'boss';
    const b = new Boss('xuemo', 240, 150, 1);
    b.spawnT = 0;
    G.bossRef = b;
    out.playBoss = probe();
    // 头目死掉 → 回到探索曲
    b.dead = true;
    out.bossDead = probe();
    // 阵亡 → 停曲
    G.state = 'dead';
    out.dead = probe();
    out.trackAfterDead = BGM.track;
    return out;
  });
  console.log('=== 3  选曲 ===');
  console.log('  标题界面        : ' + pick.title);
  console.log('  流派选择        : ' + pick.choose);
  console.log('  Boss 挑战菜单   : ' + pick.chall);
  console.log('  普通石室        : ' + pick.playNormal);
  console.log('  魔窟（头目在）  : ' + pick.playBoss);
  console.log('  头目已斩        : ' + pick.bossDead);
  console.log('  阵亡后          : ' + JSON.stringify(pick.trackAfterDead) + '（null = 已静场）');
  const pickOk = pick.title === 'title' && pick.choose === 'title' && pick.chall === 'title'
    && pick.playNormal === 'explore' && pick.playBoss === 'boss'
    && pick.bossDead === 'explore' && pick.trackAfterDead === null;
  console.log('  判定            : ' + (pickOk ? '✓ 全部符合' : '✗ 有偏差'));
  console.log('');

  /* ---------- 4. 音量三层与暂停压低 ---------- */
  const vol = await page.evaluate(async () => {
    const G = window.Game;
    // 音乐走 setTargetAtTime（刻意平滑，避免「咔」声），所以读值前要等它收敛
    const wait = () => new Promise(r => setTimeout(r, 420));
    const read = () => ({
      master: +SFX.master.gain.value.toFixed(4),
      sfx: +SFX.sfxBus.gain.value.toFixed(4),
      bgm: +BGM.bus.gain.value.toFixed(4),
      duck: BGM.duck
    });
    G.state = 'play'; G.paused = false;
    G.updateBgm(); await wait();
    const running = read();
    G.paused = true;
    G.updateBgm(); await wait();
    const paused = read();
    G.paused = false;
    G.updateBgm(); await wait();
    // 总静音
    SFX.on = false; applyVolumes();
    const muted = read();
    SFX.on = true; applyVolumes();
    // 关掉背景音乐开关
    SETTINGS.bgm = false; BGM.setGain(); await wait();
    const bgmOff = read();
    SETTINGS.bgm = true; BGM.setGain(); await wait();
    return { running, paused, muted, bgmOff };
  });
  console.log('=== 4  音量 ===');
  console.log('  正常     master %s  sfx %s  bgm %s', vol.running.master, vol.running.sfx, vol.running.bgm);
  console.log('  暂停     duck=%s  bgm %s（应从 %s 压到约 22%%）',
    vol.paused.duck, vol.paused.bgm, vol.running.bgm);
  console.log('  静音(M)  master %s（应为 0）', vol.muted.master);
  console.log('  BGM 关闭 bgm %s（应为 0）', vol.bgmOff.bgm);
  const duckOk = vol.paused.bgm < vol.running.bgm * 0.35;
  const volOk = vol.running.master > 0 && vol.muted.master === 0
    && vol.bgmOff.bgm < 0.01 && duckOk;
  console.log('  判定     : ' + (volOk ? '✓ 三层音量与暂停压低各自生效' : '✗ 有偏差'));
  console.log('');

  /* ---------- 5. 真的出声了吗（RMS） ---------- */
  await page.evaluate(() => {
    const G = window.Game;
    G.state = 'play'; G.paused = false; G.chall = null;
    G.newRun('feijian'); G.state = 'play';
    SETTINGS.bgm = true; SETTINGS.music = 1; SETTINGS.master = 1;
    applyVolumes();
    BGM.track = null;                       // 强制重播，从头开始
    G.updateBgm();
  });
  const measure = async () => page.evaluate(() => {
    const an = window.__an;
    const buf = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(buf);
    let sum = 0, peak = 0;
    for (const v of buf) { sum += v * v; if (Math.abs(v) > peak) peak = Math.abs(v); }
    return { rms: Math.sqrt(sum / buf.length), peak };
  });

  console.log('=== 5  实际输出（AnalyserNode 读时域波形）===');
  const samples = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(500);
    samples.push(await measure());
  }
  const maxRms = Math.max(...samples.map(s => s.rms));
  const maxPeak = Math.max(...samples.map(s => s.peak));
  console.log('  6 次采样（每 0.5 秒一次）:');
  samples.forEach((s, i) => console.log('    #' + (i + 1) + '  rms ' + s.rms.toFixed(5)
    + '  peak ' + s.peak.toFixed(5) + '  ' + (s.rms > 0.0005 ? '有声' : '（静）')));
  console.log('  最大 rms %s / peak %s  → %s',
    maxRms.toFixed(5), maxPeak.toFixed(5),
    maxRms > 0.0005 ? '✓ 确实有音频输出' : '✗ 全程无声');
  console.log('');

  /* ---------- 6. 换曲不打断 / 停曲能停 ---------- */
  const swap = await page.evaluate(() => {
    const out = {};
    BGM.play('explore');
    const t1 = BGM.step;
    BGM.play('explore');                    // 同名：不该重置
    out.sameNoReset = BGM.step === t1;
    BGM.play('boss');                       // 换曲：步数归零
    out.switchResets = BGM.step === 0 && BGM.track === 'boss';
    out.hasTimer = !!BGM.timer;
    BGM.stop();
    out.stoppedClears = BGM.track === null && BGM.timer === null;
    return out;
  });
  console.log('=== 6  切曲状态机 ===');
  console.log('  同名不重置   : ' + swap.sameNoReset);
  console.log('  换曲步数归零 : ' + swap.switchResets);
  console.log('  stop 清干净  : ' + swap.stoppedClears);
  console.log('');

  console.log('=== 运行期报错 ===');
  console.log('  ' + (errs.length ? errs.join('\n  ') : '无 ✓'));

  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 2000))]);
  process.exit(0);
})();
