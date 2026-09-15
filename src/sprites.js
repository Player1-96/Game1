'use strict';
/* ============================================================
 *  sprites.js —— 修仙像素素材库（全部由代码绘制）
 * ============================================================ */

const SPR = {};

/* ------------------------------------------------------------
 *  主角：青云宗外门弟子（16x16）
 * ---------------------------------------------------------- */
function drawTaoist(dir, frame) {
  const p = new Px(16, 17);
  const bob = frame === 1 ? -1 : 0;
  const H = PAL.hair, HL = PAL.hairL, SK = PAL.skin, SD = PAL.skinD;
  const RL = PAL.white, RD = PAL.grey, TR = PAL.jade, TRD = PAL.jadeD;
  const y0 = bob;

  // 腿 / 鞋
  if (dir === 'side') {
    if (frame === 0) { p.rect(6, 14 + y0, 2, 2, PAL.greyD); p.rect(9, 14 + y0, 2, 2, PAL.ink2); }
    else { p.rect(5, 14 + y0, 2, 2, PAL.greyD); p.rect(10, 14 + y0, 2, 2, PAL.ink2); }
  } else {
    if (frame === 0) { p.rect(5, 14 + y0, 2, 2, PAL.greyD); p.rect(9, 14 + y0, 2, 2, PAL.greyD); }
    else { p.rect(4, 14 + y0, 2, 2, PAL.greyD); p.rect(10, 14 + y0, 2, 2, PAL.greyD); }
  }

  if (dir === 'up') {
    // 背面：发髻 + 后脑
    p.rect(6, 0 + y0, 4, 3, H); p.set(5, 1 + y0, HL); p.set(10, 1 + y0, HL);
    p.rect(4, 1 + y0, 8, 7, H);
    p.rect(5, 3 + y0, 6, 3, HL);          // 发丝层次
    p.rect(3, 3 + y0, 1, 4, H); p.rect(12, 3 + y0, 1, 4, H); // 鬓发
    p.rect(4, 8 + y0, 8, 1, TRD);
    p.rect(4, 8 + y0, 8, 6, RL);
    p.rect(3, 9 + y0, 1, 4, RL); p.rect(12, 9 + y0, 1, 4, RL);
    p.rect(7, 9 + y0, 2, 5, TRD);         // 背脊中缝
    p.rect(4, 12 + y0, 8, 1, PAL.gold);   // 腰带
    p.rect(5, 13 + y0, 6, 1, RD);
  } else if (dir === 'side') {
    // 侧面（朝右）
    p.rect(6, 0 + y0, 4, 2, H); p.set(10, 1 + y0, HL);
    p.rect(5, 2 + y0, 7, 6, SK);
    p.rect(4, 2 + y0, 6, 3, H); p.rect(4, 5 + y0, 2, 2, H); // 后脑
    p.set(10, 5 + y0, PAL.ink);           // 侧眼
    p.rect(9, 7 + y0, 2, 1, SD);          // 鼻
    p.rect(4, 8 + y0, 7, 1, TR);
    p.rect(4, 8 + y0, 7, 6, RL);
    p.rect(3, 9 + y0, 1, 4, RL);
    p.rect(10, 9 + y0, 3, 2, RL);         // 前伸手臂
    p.rect(5, 9 + y0, 1, 5, TRD);         // 交襟
    p.rect(4, 12 + y0, 8, 1, PAL.gold);
    p.rect(4, 13 + y0, 8, 1, RD);
  } else {
    // 正面
    p.rect(6, 0, 4, 2, H); p.set(5, 1, HL); p.set(10, 1, HL);
    p.rect(4, 2, 1, 1, PAL.gold); p.rect(11, 2, 1, 1, PAL.gold); // 玉簪
    p.rect(4, 2, 8, 6, SK);
    p.rect(4, 2, 8, 2, H); p.rect(4, 4, 1, 3, H); p.rect(11, 4, 1, 3, H);
    p.set(6, 5, PAL.ink); p.set(9, 5, PAL.ink);     // 眼
    p.rect(6, 4, 1, 1, H); p.rect(9, 4, 1, 1, H);   // 眉
    p.rect(7, 7, 2, 1, SD);                          // 嘴
    p.rect(3, 8, 10, 1, TR);
    p.rect(4, 8, 8, 6, RL);
    p.rect(3, 9, 1, 4, RL); p.rect(12, 9, 1, 4, RL); // 袖
    p.rect(7, 9, 2, 5, TRD);                         // 交襟
    p.rect(4, 12, 8, 1, PAL.gold);                   // 腰带
    p.rect(5, 13, 6, 1, RD);
    p.set(7, 12, PAL.jadeL); p.set(8, 12, PAL.jadeL); // 玉扣
  }
  return p.outline(PAL.ink).done();
}

/* ------------------------------------------------------------
 *  主角 · 蓄势姿态（舞剑流专属）
 *  沉肩坐胯、双掌按剑于腹前 —— 与行走姿态共用配色，只把重心压低、
 *  双手收拢，一眼就能看出「正在憋一剑」。frame 只改掌心的一点亮色，
 *  蓄力的脉动交给运行时的光晕去表现。
 * ---------------------------------------------------------- */
function drawTaoistCharge(dir, frame) {
  const p = new Px(16, 17);
  const H = PAL.hair, HL = PAL.hairL, SK = PAL.skin, SD = PAL.skinD;
  const RL = PAL.white, RD = PAL.grey, TR = PAL.jade, TRD = PAL.jadeD;

  // 马步：双脚外撇、比行走时更开，重心明显下沉
  p.rect(2, 14, 3, 3, PAL.greyD);
  p.rect(11, 14, 3, 3, PAL.greyD);
  p.rect(1, 16, 4, 1, PAL.ink2);
  p.rect(11, 16, 4, 1, PAL.ink2);

  if (dir === 'up') {
    // 背面：蓄势时双手收在身前，只能从背后看到收紧的两肘
    p.rect(6, 0, 4, 3, H); p.set(5, 1, HL); p.set(10, 1, HL);
    p.rect(4, 1, 8, 7, H);
    p.rect(5, 3, 6, 3, HL);
    p.rect(3, 3, 1, 4, H); p.rect(12, 3, 1, 4, H);
    p.rect(4, 8, 8, 1, TRD);
    p.rect(4, 8, 8, 6, RL);
    p.rect(3, 9, 1, 4, RL); p.rect(12, 9, 1, 4, RL);
    p.rect(7, 9, 2, 5, TRD);
    p.rect(4, 12, 8, 1, PAL.gold);
    // 双肘内收
    p.rect(3, 10, 2, 2, RD); p.rect(11, 10, 2, 2, RD);
    p.set(8, 13, frame ? PAL.goldL : PAL.jadeL);
  } else if (dir === 'side') {
    // 侧面（朝右）：前倾按剑，双掌叠在身前
    p.rect(6, 0, 4, 2, H); p.set(10, 1, HL);
    p.rect(5, 2, 7, 6, SK);
    p.rect(4, 2, 6, 3, H); p.rect(4, 5, 2, 2, H);
    p.set(10, 5, PAL.ink);
    p.rect(9, 7, 2, 1, SD);
    p.rect(4, 8, 7, 1, TR);
    p.rect(4, 8, 7, 6, RL);
    p.rect(3, 9, 1, 4, RL);
    p.rect(5, 9, 1, 5, TRD);
    p.rect(10, 9, 3, 2, RD);          // 前探的两肘
    p.rect(12, 11, 3, 3, SK);         // 叠掌
    p.rect(4, 12, 8, 1, PAL.gold);
    p.rect(12, 11, 3, 1, frame ? PAL.goldL : PAL.jadeL);
  } else {
    // 正面
    p.rect(6, 0, 4, 2, H); p.set(5, 1, HL); p.set(10, 1, HL);
    p.rect(4, 2, 1, 1, PAL.gold); p.rect(11, 2, 1, 1, PAL.gold);
    p.rect(4, 2, 8, 6, SK);
    p.rect(4, 2, 8, 2, H); p.rect(4, 4, 1, 3, H); p.rect(11, 4, 1, 3, H);
    p.set(6, 5, PAL.ink); p.set(9, 5, PAL.ink);
    p.rect(6, 4, 1, 1, H); p.rect(9, 4, 1, 1, H);
    p.rect(7, 7, 2, 1, SD);
    p.rect(3, 8, 10, 1, TR);
    p.rect(4, 8, 8, 6, RL);
    p.rect(3, 9, 1, 4, RL); p.rect(12, 9, 1, 4, RL);
    p.rect(7, 9, 2, 4, TRD);
    p.rect(4, 12, 8, 1, PAL.gold);
    // 双掌按剑于腹前，掌心透着聚气的光
    p.rect(5, 12, 2, 2, RD); p.rect(9, 12, 2, 2, RD);
    p.rect(6, 13, 4, 2, SK);
    p.rect(6, 13, 4, 1, frame ? PAL.goldL : PAL.jadeL);
  }
  return p.outline(PAL.ink).done();
}

/* ------------------------------------------------------------
 *  主角 · 挥剑姿态（舞剑流平A专属）
 *  三帧一套：起手举剑 → 力劈过身 → 收势沉肘，剑的落点分别在
 *  上 / 前 / 下，连起来就是一道劈砍弧。
 *  剑只用 1 px 白线加剑尖一点青光 —— 16 px 的格子里想让「挥」读得出来，
 *  只能靠帧与帧之间把剑的位置拉开，速度感交给运行时的 Slash 弧光。
 * ---------------------------------------------------------- */
function drawTaoistSwing(dir, frame) {
  const p = new Px(16, 17);
  const H = PAL.hair, HL = PAL.hairL, SK = PAL.skin, SD = PAL.skinD;
  const RL = PAL.white, RD = PAL.grey, TR = PAL.jade, TRD = PAL.jadeD;
  const BL = PAL.white, GL = PAL.jadeL;
  /* 剑：2 px 宽的白刃（末尾统一描黑边，压在白袍上也分得出来），
     剑尖两点青光、剑根一点金。帧间落点必须拉开，才读得出「挥」。 */
  const sword = (x0, y0, x1, y1) => {
    p.line(x0, y0, x1, y1, BL, 2);
    p.set(x1, y1, GL); p.set(x1 - 1, y1, GL); p.set(x1, y1 - 1, GL);
    p.set(x0, y0, PAL.gold); p.set(x0, y0 + 1, PAL.gold);
  };
  /* 剑锋带起的风：沿剑根往后甩两三个亮点，补一点速度感 */
  const wind = (x, y, dx, dy) => {
    p.set(x - dx, y - dy, GL);
    p.set(x - dx * 2, y - dy * 2, TR);
  };

  if (dir === 'up') {
    // 背面：剑自右肩后扬起、横扫过顶、再落到左腰
    if (frame === 0) { sword(12, 10, 14, 1); wind(12, 10, 1, 2); }
    else if (frame === 1) { sword(13, 3, 1, 2); wind(13, 3, 2, 0); }
    else { sword(11, 1, 2, 9); wind(11, 1, 1, -2); }
    p.rect(6, 0, 4, 3, H); p.set(5, 1, HL); p.set(10, 1, HL);
    p.rect(4, 1, 8, 7, H);
    p.rect(5, 3, 6, 3, HL);
    p.rect(3, 3, 1, 4, H); p.rect(12, 3, 1, 4, H);
    p.rect(4, 8, 8, 1, TRD);
    p.rect(4, 8, 8, 6, RL);
    p.rect(3, 9, 1, 4, RL); p.rect(12, 9, 1, 4, RL);
    p.rect(7, 9, 2, 5, TRD);
    p.rect(4, 12, 8, 1, PAL.gold);
    p.rect(5, 13, 6, 1, RD);
    // 握剑的手随剑换边，免得看着像剑自己飞
    if (frame === 0) p.rect(11, 8, 2, 2, RD);
    else if (frame === 1) p.rect(2, 7, 2, 2, RD);
    else p.rect(2, 7, 2, 2, RD);
  } else if (dir === 'side') {
    // 侧面（朝右）：由右上方举起 → 平挥向前 → 斜垂到右下
    if (frame === 0) {
      p.rect(6, 14, 2, 2, PAL.greyD); p.rect(9, 14, 2, 2, PAL.ink2);
      p.line(9, 10, 10, 8, RD); sword(10, 8, 15, 1);
    } else if (frame === 1) {
      p.rect(4, 14, 2, 2, PAL.greyD); p.rect(11, 14, 2, 2, PAL.ink2);   // 前腿探出、重心前压
      p.rect(9, 9, 3, 2, RD); sword(9, 10, 15, 9); wind(9, 10, 1, 0);
    } else {
      p.rect(6, 14, 2, 2, PAL.greyD); p.rect(9, 14, 2, 2, PAL.ink2);
      p.line(9, 10, 10, 11, RD); sword(10, 11, 15, 16);
    }
    p.rect(6, 0, 4, 2, H); p.set(10, 1, HL);
    p.rect(5, 2, 7, 6, SK);
    p.rect(4, 2, 6, 3, H); p.rect(4, 5, 2, 2, H);
    p.set(10, 5, PAL.ink);
    p.rect(9, 7, 2, 1, SD);
    p.rect(4, 8, 7, 1, TR);
    p.rect(4, 8, 7, 6, RL);
    p.rect(3, 9, 1, 4, RL);
    p.rect(5, 9, 1, 5, TRD);
    p.rect(4, 12, 8, 1, PAL.gold);
    p.rect(4, 13, 8, 1, RD);
  } else {
    // 正面：剑举在右肩外 → 一整条横切过身前 → 斜沉到左下
    if (frame === 0) {
      p.rect(5, 14, 2, 2, PAL.greyD); p.rect(9, 14, 2, 2, PAL.greyD);
      p.rect(12, 9, 2, 2, RD); sword(12, 11, 14, 1);
    } else if (frame === 1) {
      p.rect(4, 14, 2, 2, PAL.greyD); p.rect(10, 14, 2, 2, PAL.greyD);
      p.rect(11, 9, 3, 2, RD); sword(14, 10, 1, 11); wind(14, 10, 2, 0);
    } else {
      p.rect(5, 14, 2, 2, PAL.greyD); p.rect(9, 14, 2, 2, PAL.greyD);
      p.line(6, 10, 4, 11, RD); sword(11, 11, 2, 16);
    }
    p.rect(6, 0, 4, 2, H); p.set(5, 1, HL); p.set(10, 1, HL);
    p.rect(4, 2, 1, 1, PAL.gold); p.rect(11, 2, 1, 1, PAL.gold);
    p.rect(4, 2, 8, 6, SK);
    p.rect(4, 2, 8, 2, H); p.rect(4, 4, 1, 3, H); p.rect(11, 4, 1, 3, H);
    p.set(6, 5, PAL.ink); p.set(9, 5, PAL.ink);
    p.rect(6, 4, 1, 1, H); p.rect(9, 4, 1, 1, H);
    p.rect(7, 7, 2, 1, SD);
    p.rect(3, 8, 10, 1, TR);
    p.rect(4, 8, 8, 6, RL);
    p.rect(3, 9, 1, 4, RL); p.rect(12, 9, 1, 4, RL);
    p.rect(7, 9, 2, 5, TRD);
    p.rect(4, 12, 8, 1, PAL.gold);
    p.set(7, 12, PAL.jadeL); p.set(8, 12, PAL.jadeL);
  }
  return p.outline(PAL.ink).done();
}

/* ------------------------------------------------------------
 *  弯刀：舞剑流的流派标识（单刃外弧、刀背厚，与笔直的飞剑区分）
 * ---------------------------------------------------------- */
function drawSaber() {
  const p = new Px(20, 9);
  p.rect(0, 3, 5, 3, PAL.purpleD);        // 缠绳刀柄
  p.rect(0, 3, 5, 1, PAL.purple);
  p.set(1, 5, PAL.goldD); p.set(3, 5, PAL.goldD);
  p.rect(5, 2, 2, 5, PAL.gold);           // 护手
  p.rect(5, 2, 2, 1, PAL.goldL);
  p.rect(7, 3, 6, 3, PAL.greyL);          // 刀身
  p.rect(7, 3, 6, 1, PAL.white);
  p.rect(7, 5, 6, 1, PAL.greyD);
  p.line(13, 3, 16, 2, PAL.greyL);        // 刀尖上翘
  p.line(13, 5, 16, 4, PAL.greyD);
  p.line(16, 2, 19, 1, PAL.white);
  p.rect(9, 4, 5, 1, PAL.jadeD);          // 血槽
  p.set(10, 4, PAL.jadeL); p.set(12, 4, PAL.jadeL);
  return p.outline(PAL.ink).done();
}

/* ------------------------------------------------------------
 *  妖物
 * ---------------------------------------------------------- */

/* 邪祟：紫色小鬼，近战追击 */
function drawXieSui(frame) {
  const p = new Px(14, 14);
  const b = frame ? 0 : 1, C = PAL.purple, CD = PAL.purpleD, CL = PAL.purpleL;
  const yb = b;
  p.ell(7, 8 + yb, 5, 4.2, C);
  p.rect(2, 3 + yb, 2, 4, CD); p.set(2, 2 + yb, C);      // 左耳
  p.rect(10, 3 + yb, 2, 4, CD); p.set(11, 2 + yb, C);    // 右耳
  p.rect(3, 4 + yb, 8, 1, CL);                            // 头顶高光
  p.disc(5, 7 + yb, 2, PAL.white); p.disc(9, 7 + yb, 2, PAL.white);
  p.set(5, 7 + yb, PAL.red); p.set(9, 7 + yb, PAL.red);
  p.set(4, 10 + yb, PAL.white); p.set(9, 10 + yb, PAL.white);  // 獠牙
  p.rect(3, 12 + yb, 2, 1, CD); p.rect(9, 12 + yb, 2, 1, CD);  // 爪
  return p.outline(PAL.ink).done();
}

/* 蟾蜍妖：定点吐弹 */
function drawChanChu(frame) {
  const p = new Px(18, 14);
  const yb = frame ? 0 : 0, C = PAL.green, CD = PAL.greenD;
  p.ell(9, 9, 7.5, 4.5, C);
  p.ell(9, 8, 6, 3, PAL.green);
  p.set(5, 6, CD); p.set(9, 5, CD); p.set(13, 6, CD);     // 疙瘩
  p.disc(5, 5, 2.4, PAL.white); p.disc(13, 5, 2.4, PAL.white);
  p.set(5, 5, PAL.ink); p.set(13, 5, PAL.ink);
  p.rect(5, 10, 8, 1, CD);                                 // 嘴
  if (frame) { p.rect(7, 10, 4, 2, PAL.redD); }            // 鼓腮
  p.rect(1, 12, 4, 2, CD); p.rect(13, 12, 4, 2, CD);       // 蹼
  return p.outline(PAL.ink).done();
}

/* 血蝠：蓄力冲刺 */
function drawXueFu(frame) {
  const p = new Px(18, 14);
  const C = PAL.red, CD = PAL.redD;
  const up = frame === 0;
  // 翅膀
  for (let i = 0; i < 4; i++) {
    const y = (up ? 1 : 4) + i;
    p.line(7, 6, 1 + i * 0.2, y, CD);
    p.line(10, 6, 16 - i * 0.2, y, CD);
  }
  p.rect(1, up ? 2 : 5, 3, 1, C); p.rect(14, up ? 2 : 5, 3, 1, C);
  p.ell(8.5, 7, 3, 3.6, CD);                 // 身
  p.rect(6, 3, 2, 2, CD); p.rect(10, 3, 2, 2, CD);  // 耳
  p.set(7, 7, PAL.gold); p.set(10, 7, PAL.gold);    // 眼
  p.set(6, 9, PAL.white); p.set(11, 9, PAL.white);  // 牙
  return p.outline(PAL.ink).done();
}

/* 鬼修：远程施法 */
function drawGuiXiu(frame) {
  const p = new Px(16, 18);
  const yb = frame ? 0 : 1, R = PAL.ink2, RD = '#2c2340';
  p.rect(3, 2 + yb, 10, 3, R);                       // 兜帽顶
  p.rect(2, 4 + yb, 12, 9, R);
  p.rect(4, 1 + yb, 8, 2, RD);
  p.rect(5, 5 + yb, 6, 5, PAL.bone);                 // 骷髅脸
  p.set(6, 7 + yb, PAL.ink); p.set(9, 7 + yb, PAL.ink);
  p.rect(6, 9 + yb, 4, 1, PAL.ink2);
  p.rect(1, 8 + yb, 2, 4, R); p.rect(13, 8 + yb, 2, 4, R);   // 袖
  p.rect(0, 7 + yb, 2, 2, PAL.bone); p.rect(14, 7 + yb, 2, 2, PAL.bone); // 手
  p.rect(3, 13 + yb, 10, 4, R);
  p.rect(4, 16 + yb, 2, 1, RD); p.rect(10, 16 + yb, 2, 1, RD);
  p.set(7, 15 + yb, PAL.purple); p.set(8, 15 + yb, PAL.purple);  // 符光
  return p.outline('#07050f').done();
}

/* 阴煞：跳跃，死亡分裂 */
function drawYinSha(frame, small) {
  const s = small ? 0.65 : 1;
  const p = new Px(16, 14);
  const C = '#3b2c5c', CL = '#6d52a8', CD = '#241a3c';
  const squash = frame ? 1 : 0;
  const rx = 6.5 * s, ry = (squash ? 4.6 : 3.6) * s, cy = (squash ? 9.5 : 8.5);
  p.ell(8, cy, rx, ry, C);
  p.ell(8, cy - 1.2 * s, rx * 0.8, ry * 0.7, CL);
  p.set(6, cy - 1, PAL.red); p.set(10, cy - 1, PAL.red);
  p.rect(5, cy + 1, 6, 1, CD);                 // 嘴
  p.ell(8, cy + ry - 0.5, rx * 0.7, 0.8, CD);  // 触地阴影
  return p.outline(PAL.ink).done();
}

/* 尸傀：高血慢速 */
function drawShiKui(frame) {
  const p = new Px(16, 18);
  const S = '#7fa06a', SD = '#4d6b3f', CL = '#b9c9a8';
  p.rect(4, 1, 8, 6, S);                        // 头
  p.rect(4, 1, 8, 2, SD);
  p.set(6, 4, PAL.ink); p.set(9, 4, PAL.ink);
  p.rect(6, 6, 4, 1, PAL.ink2);
  p.rect(3, 7, 10, 8, CL);                      // 破布寿衣
  p.rect(3, 7, 10, 1, SD);
  p.rect(6, 8, 4, 5, SD);                       // 破洞
  p.rect(0, 8 + (frame ? 1 : 0), 4, 2, S);      // 前伸双臂
  p.rect(12, 8 + (frame ? 0 : 1), 4, 2, S);
  p.rect(4, 15, 3, 2, SD); p.rect(9, 15, 3, 2, SD);
  p.set(8, 10, PAL.gold);                       // 镇魂铜钱
  return p.outline(PAL.ink).done();
}

/* 剑灵：远程追踪弹 */
function drawJianLing(frame) {
  const p = new Px(16, 16);
  const C = PAL.cyan, CD = PAL.cyanD, CL = '#bfeaff';
  const yb = frame ? 0 : 1;
  p.rect(6, 1 + yb, 4, 8, CD);                  // 剑身魂体
  p.rect(7, 1 + yb, 2, 7, C);
  p.set(6, 0 + yb, CL); p.set(7, 0 + yb, CL); p.set(8, 0 + yb, CL); p.set(9, 0 + yb, CL);
  p.rect(4, 8 + yb, 8, 1, C);                   // 剑格
  p.rect(7, 9 + yb, 2, 3, PAL.goldD);           // 柄
  p.disc(8, 12 + yb, 1.4, PAL.gold);
  p.set(6, 4 + yb, CL); p.set(9, 4 + yb, CL);
  return p.outline(PAL.ink).done();
}

/* ------------------------------------------------------------
 *  BOSS
 * ---------------------------------------------------------- */
function drawBossXueMo(frame) {
  const p = new Px(48, 52);
  const R = '#3a1220', RD = '#250a14', RL = '#5e1f30';
  const yb = frame ? 0 : 1;
  // 血气披风
  p.ell(24, 34 + yb, 20, 17, R);
  p.ell(24, 30 + yb, 14, 12, RL);
  // 头
  p.rect(16, 4 + yb, 16, 14, '#e8d9c8');
  p.rect(16, 4 + yb, 16, 3, RD);
  p.set(20, 10 + yb, PAL.red); p.set(27, 10 + yb, PAL.red);
  p.rect(22, 15 + yb, 4, 2, RD);
  p.set(21, 17 + yb, PAL.white); p.set(26, 17 + yb, PAL.white);
  // 角
  p.line(16, 6 + yb, 9, 0 + yb, PAL.bone); p.line(17, 6 + yb, 11, 1 + yb, PAL.bone);
  p.line(31, 6 + yb, 38, 0 + yb, PAL.bone); p.line(30, 6 + yb, 36, 1 + yb, PAL.bone);
  // 肩甲
  p.rect(6, 20 + yb, 10, 6, RD); p.rect(32, 20 + yb, 10, 6, RD);
  p.set(8, 21 + yb, PAL.gold); p.set(34, 21 + yb, PAL.gold);
  // 手臂与血刃
  p.rect(2, 26 + yb, 8, 4, R); p.rect(38, 26 + yb, 8, 4, R);
  p.line(8, 28 + yb, 2, 40 + yb, PAL.bone); p.line(7, 28 + yb, 3, 40 + yb, PAL.redL);
  // 胸纹
  p.rect(20, 26 + yb, 8, 8, PAL.red);
  p.set(24, 29 + yb, PAL.gold); p.set(24, 30 + yb, PAL.gold);
  return p.outline('#0a0308').done();
}

function drawBossBaiGu(frame) {
  const p = new Px(48, 52);
  const B = PAL.bone, BD = '#b8ae90', H = '#1a1526';
  const yb = frame ? 0 : 1;
  // 长发
  p.ell(24, 26 + yb, 19, 20, H);
  p.rect(6, 14 + yb, 36, 26, H);
  // 白骨身躯
  p.rect(17, 10 + yb, 14, 12, B);
  p.set(20, 15 + yb, PAL.red); p.set(27, 15 + yb, PAL.red);   // 眼窝幽火
  p.rect(21, 19 + yb, 6, 1, BD);
  p.rect(14, 22 + yb, 20, 16, B);
  for (let i = 0; i < 4; i++) p.rect(16 + i * 5, 24 + yb, 2, 12, BD);  // 肋骨
  p.rect(18, 22 + yb, 12, 2, BD);
  // 骨爪
  p.line(14, 26 + yb, 2, 34 + yb, B); p.line(14, 28 + yb, 3, 38 + yb, B);
  p.line(34, 26 + yb, 46, 34 + yb, B); p.line(34, 28 + yb, 45, 38 + yb, B);
  // 头顶骨冠
  p.line(18, 10 + yb, 14, 2 + yb, B); p.line(24, 9 + yb, 24, 1 + yb, B); p.line(30, 10 + yb, 34, 2 + yb, B);
  p.set(24, 4 + yb, PAL.purple);
  return p.outline('#0a0812').done();
}

/* ------------------------------------------------------------
 *  弹药
 * ---------------------------------------------------------- */
function drawFeiJian() {
  const p = new Px(20, 8);
  p.rect(2, 3, 12, 2, PAL.greyL);
  p.rect(2, 3, 12, 1, PAL.white);
  p.line(14, 4, 19, 4, PAL.white);
  p.rect(0, 2, 2, 4, PAL.jade);          // 剑格
  p.rect(0, 0, 1, 8, PAL.jadeD);
  p.set(3, 2, PAL.jadeL); p.set(3, 5, PAL.jadeL);
  return p.outline(PAL.ink).done();
}
function drawBolt(col, colD, kind) {
  const p = new Px(12, 12);
  if (kind === 'talisman') {                 // 符箓
    p.rect(3, 1, 6, 10, col);
    p.rect(4, 2, 4, 8, colD);
    p.rect(4, 3, 4, 1, PAL.red); p.rect(4, 6, 4, 1, PAL.red);
    p.set(5, 8, PAL.red); p.set(6, 8, PAL.red);
  } else if (kind === 'flame') {             // 幽火
    p.ell(6, 6, 4.4, 4.8, col);
    p.ell(6, 5, 2.6, 2.8, colD);
    p.set(5, 3, PAL.white); p.set(7, 4, PAL.white);
  } else if (kind === 'ice') {               // 冰锥
    p.line(6, 0, 6, 11, col); p.line(5, 1, 5, 10, colD); p.line(7, 1, 7, 10, colD);
    p.set(6, 0, PAL.white);
  } else {                                   // 血珠/气弹
    p.disc(6, 6, 4, col);
    p.disc(5, 5, 1.8, colD);
    p.set(4, 4, PAL.white);
  }
  return p.outline(PAL.ink).done();
}

/* ------------------------------------------------------------
 *  巨剑：蓄力凝聚的重剑。剑身开血槽、嵌符纹，比飞剑更宽更长
 * ---------------------------------------------------------- */
function drawJuJian() {
  const p = new Px(30, 14);
  // 剑柄（缠绳质感）
  p.rect(0, 5, 6, 5, PAL.purpleD);
  p.rect(0, 5, 6, 1, PAL.purple);
  p.rect(1, 6, 1, 1, PAL.purpleL); p.rect(3, 8, 1, 1, PAL.purpleL);
  // 柄尾配重
  p.rect(0, 4, 2, 7, PAL.goldD);
  p.set(0, 4, PAL.gold); p.set(1, 4, PAL.gold); p.set(0, 12, PAL.gold);
  // 剑格（宽厚护手，两端上翘）
  p.rect(6, 2, 3, 11, PAL.gold);
  p.rect(6, 2, 3, 1, PAL.goldL);
  p.rect(6, 12, 3, 1, PAL.goldD);
  p.set(5, 3, PAL.gold); p.set(9, 3, PAL.gold);
  p.set(5, 11, PAL.goldD); p.set(9, 11, PAL.goldD);
  // 剑身
  p.rect(9, 4, 16, 7, PAL.greyL);
  p.rect(9, 4, 16, 2, PAL.white);           // 上刃高光
  p.rect(9, 9, 16, 2, PAL.greyD);           // 下刃暗部
  // 血槽（青玉灵光）
  p.rect(11, 6, 12, 3, PAL.jadeD);
  p.rect(11, 6, 12, 1, PAL.jade);
  // 符纹
  p.set(13, 6, PAL.goldL); p.set(16, 6, PAL.goldL); p.set(19, 6, PAL.goldL);
  p.set(14, 7, PAL.jadeL); p.set(17, 7, PAL.jadeL);
  // 剑尖
  p.line(25, 4, 29, 7, PAL.white);
  p.line(25, 11, 29, 7, PAL.greyL);
  p.line(25, 5, 28, 7, PAL.white);
  p.line(25, 10, 28, 7, PAL.greyD);
  return p.outline(PAL.ink).done();
}

/* ------------------------------------------------------------
 *  剑气斩击波（裂空斩）：一道横向的月牙刃光
 * ---------------------------------------------------------- */
function drawRiftWave() {
  const p = new Px(24, 18);
  const cols = [PAL.cyanD, PAL.cyan, '#bfeaff'];
  for (let i = 0; i < 3; i++) {                 // 三层弧线叠出厚刃
    const c = cols[i];
    p.line(2 + i * 2, 1 + i * 2, 13 + i, 9, c);
    p.line(13 + i, 9, 2 + i * 2, 17 - i * 2, c);
  }
  p.rect(14, 6, 6, 6, PAL.cyanD);
  p.rect(15, 7, 5, 4, PAL.cyan);
  p.line(20, 6, 23, 3, PAL.white);
  p.line(20, 12, 23, 15, PAL.white);
  return p.outline(PAL.ink).done();
}

/* ------------------------------------------------------------
 *  场景：地板 / 墙 / 门
 * ---------------------------------------------------------- */
function makeFloorTile(seed) {
  const rng = mulberry32(seed);
  const p = new Px(32, 32);
  p.rect(0, 0, 32, 32, PAL.floor);
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(rng() * 32), y = Math.floor(rng() * 32);
    p.set(x, y, rng() < 0.5 ? PAL.floor2 : PAL.floor3);
  }
  // 石板缝
  p.rect(0, 0, 32, 1, PAL.floorLine); p.rect(0, 0, 1, 32, PAL.floorLine);
  p.set(30, 4, PAL.floorLine); p.set(6, 27, PAL.floorLine);
  if (rng() < 0.35) { // 偶发符文点
    p.set(4 + Math.floor(rng() * 20), 4 + Math.floor(rng() * 20), PAL.stone);
  }
  return p.done();
}
function makeFloorRune(seed) {
  const p = new Px(32, 32);
  p.rect(0, 0, 32, 32, PAL.floor);
  for (let i = 0; i < 40; i++) {
    p.set(Math.floor(mulberry32(seed + i)() * 32), Math.floor(mulberry32(seed + i * 7)() * 32), PAL.floor2);
  }
  p.ring(16, 16, 9, PAL.stone2);
  p.ring(16, 16, 5, PAL.stone);
  p.set(16, 8, PAL.jadeD); p.set(16, 24, PAL.jadeD); p.set(8, 16, PAL.jadeD); p.set(24, 16, PAL.jadeD);
  p.rect(0, 0, 32, 1, PAL.floorLine); p.rect(0, 0, 1, 32, PAL.floorLine);
  return p.done();
}
function makeWallTile(seed) {
  const rng = mulberry32(seed);
  const p = new Px(32, 32);
  p.rect(0, 0, 32, 32, PAL.stone);
  // 砖纹
  for (let r = 0; r < 4; r++) {
    const y = r * 8, off = (r % 2) * 8;
    for (let c = -1; c < 3; c++) {
      const x = c * 16 + off;
      p.rect(x + 1, y + 1, 14, 6, rng() < 0.5 ? PAL.stone2 : '#443e60');
    }
  }
  p.rect(0, 0, 32, 1, PAL.stoneHi);
  p.rect(0, 30, 32, 2, PAL.stoneLo);
  p.rect(0, 0, 32, 32, null);
  // 底部阴影
  const g = p.g; g.globalAlpha = 0.35; g.fillStyle = PAL.ink; g.fillRect(0, 26, 32, 6); g.globalAlpha = 1;
  return p.done();
}
function makeWallTop(seed) {
  const p = new Px(32, 32);
  p.rect(0, 0, 32, 32, PAL.stone2);
  const rng = mulberry32(seed);
  for (let i = 0; i < 30; i++) p.set(Math.floor(rng() * 32), Math.floor(rng() * 32), PAL.stoneHi);
  p.rect(0, 0, 32, 2, PAL.stoneHi);
  // 瓦当纹
  for (let x = 2; x < 32; x += 8) { p.set(x, 6, PAL.stoneLo); p.set(x + 1, 7, PAL.stoneLo); }
  return p.done();
}

/* 门：horizontal = 上下方向的门（横条） */
function makeDoor(open, vertical) {
  const W = vertical ? 24 : 32, H = vertical ? 32 : 24;
  const p = new Px(W, H);
  if (open) {
    // 门洞：地面延伸 + 门槛
    p.rect(0, 0, W, H, PAL.floor2);
    p.rect(0, 0, W, 2, PAL.stoneLo);
    p.rect(0, H - 2, W, 2, PAL.stoneLo);
    if (vertical) { p.rect(0, 0, 2, H, PAL.stoneLo); p.rect(W - 2, 0, 2, H, PAL.stoneLo); }
    else { p.rect(0, 0, 2, H, PAL.stoneLo); p.rect(W - 2, 0, 2, H, PAL.stoneLo); }
  } else {
    p.rect(0, 0, W, H, '#5a3f28');
    p.rect(2, 2, W - 4, H - 4, '#6d4c30');
    // 木纹
    for (let i = 4; i < (vertical ? H : W) - 4; i += 5) {
      if (vertical) p.rect(4, i, W - 8, 1, '#553a24'); else p.rect(i, 4, 1, H - 8, '#553a24');
    }
    // 门环 + 镇门符
    p.disc(W / 2, H / 2, 3, PAL.goldD); p.ring(W / 2, H / 2, 3, PAL.gold);
    p.rect(W / 2 - 3, H / 2 - 8, 6, 7, PAL.gold);
    p.rect(W / 2 - 2, H / 2 - 7, 4, 5, PAL.red);
    p.rect(0, 0, W, 1, '#8a6440'); p.rect(0, H - 1, W, 1, '#33210f');
  }
  return p.done();
}
/* 隐藏房：符文墙（有裂缝） */
function makeCrack(vertical) {
  const W = vertical ? 24 : 32, H = vertical ? 32 : 24;
  const p = new Px(W, H);
  p.rect(0, 0, W, H, PAL.stone);
  for (let r = 0; r < 4; r++) for (let c = -1; c < 3; c++) {
    const y = r * (H / 4), x = c * 16 + (r % 2) * 8;
    p.rect(x + 1, y + 1, 14, H / 4 - 2, PAL.stone2);
  }
  p.rect(0, 0, W, 1, PAL.stoneHi);
  // 裂缝
  if (vertical) {
    p.line(12, 6, 9, 18, PAL.ink); p.line(9, 18, 14, 28, PAL.ink); p.line(14, 28, 10, 36, PAL.ink);
    p.line(13, 6, 15, 18, '#5d5578');
  } else {
    p.line(6, 12, 18, 9, PAL.ink); p.line(18, 9, 28, 14, PAL.ink); p.line(28, 14, 36, 10, PAL.ink);
  }
  p.rect(0, 0, W, H, null);
  const g = p.g; g.globalAlpha = 0.18; g.fillStyle = PAL.jade; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
  return p.done();
}

/* ------------------------------------------------------------
 *  交互物件
 * ---------------------------------------------------------- */
function makeChest(open) {
  const p = new Px(24, 22);
  p.rect(2, 8, 20, 12, '#6b4a2a');
  p.rect(2, 8, 20, 2, '#8a6440');
  p.rect(2, 18, 20, 2, '#4a3018');
  p.rect(11, 8, 2, 12, PAL.goldD);
  if (open) {
    p.rect(3, 2, 18, 7, '#54381f');
    p.rect(4, 3, 16, 5, PAL.goldD);
    p.disc(12, 5, 2, PAL.gold);
  } else {
    p.rect(2, 2, 20, 7, '#7b5630');
    p.rect(2, 2, 20, 2, '#9a7448');
    p.disc(12, 6, 2.4, PAL.gold);
    p.rect(10, 8, 4, 4, PAL.goldD);
  }
  return p.outline(PAL.ink).done();
}
function makePedestal() {
  const p = new Px(24, 30);
  p.rect(4, 24, 16, 5, PAL.stone2);
  p.rect(3, 27, 18, 2, PAL.stoneLo);
  p.rect(7, 12, 10, 12, PAL.stone);
  p.rect(8, 13, 8, 10, PAL.stone2);
  p.ell(12, 11, 7, 4, PAL.jadeD);
  p.ell(12, 10, 5.5, 3, PAL.jade);
  return p.outline(PAL.ink).done();
}
function makeAltar() {
  const p = new Px(30, 26);
  p.rect(2, 16, 26, 8, PAL.stone);
  p.rect(1, 21, 28, 4, PAL.stone2);
  p.rect(4, 8, 22, 8, PAL.stoneLo);
  p.rect(5, 9, 20, 6, PAL.stone);
  p.disc(15, 11, 4, PAL.redD);
  p.ring(15, 11, 4, PAL.red);
  p.set(13, 10, PAL.gold); p.set(17, 10, PAL.gold);
  p.rect(6, 24, 18, 1, PAL.stoneLo);
  return p.outline(PAL.ink).done();
}
function makeShopKeeper() {
  const p = new Px(20, 24);
  p.rect(4, 2, 12, 4, '#7a4a2a');           // 斗笠
  p.rect(2, 4, 16, 2, '#8f5a33');
  p.rect(5, 6, 10, 8, PAL.skin);
  p.set(8, 9, PAL.ink); p.set(11, 9, PAL.ink);
  p.rect(4, 14, 12, 8, '#5d3f6e');          // 长袍
  p.rect(4, 14, 12, 1, PAL.goldD);
  p.rect(1, 15, 4, 2, PAL.skin); p.rect(15, 15, 4, 2, PAL.skin);
  p.rect(6, 22, 3, 2, PAL.stoneLo); p.rect(11, 22, 3, 2, PAL.stoneLo);
  return p.outline(PAL.ink).done();
}
function makeLantern() {
  const p = new Px(14, 20);
  p.rect(6, 0, 2, 4, PAL.stoneLo);
  p.ell(7, 10, 5, 7, PAL.red);
  p.ell(7, 10, 3.4, 5.4, '#ff8a6a');
  p.rect(3, 6, 8, 1, PAL.gold); p.rect(3, 14, 8, 1, PAL.gold);
  p.rect(5, 17, 4, 2, PAL.gold);
  return p.outline(PAL.ink).done();
}
function makeIncense() {
  const p = new Px(16, 16);
  p.rect(4, 10, 8, 5, '#4a4048');
  p.rect(3, 9, 10, 2, '#6a5c64');
  p.rect(5, 5, 6, 5, '#3a3038');
  p.line(8, 5, 8, 0, PAL.purpleL);
  p.disc(8, 3, 1, PAL.purpleL);
  return p.outline(PAL.ink).done();
}

/* ------------------------------------------------------------
 *  UI 图标
 * ---------------------------------------------------------- */
function makeHeart(state) {   // 2 full, 1 half, 0 empty
  const p = new Px(12, 11);
  const draw = (col) => {
    p.rect(3, 1, 2, 1, col); p.rect(7, 1, 2, 1, col);
    p.rect(1, 2, 10, 3, col);
    p.rect(1, 5, 10, 1, col);
    p.rect(2, 6, 8, 1, col);
    p.rect(3, 7, 6, 1, col);
    p.rect(4, 8, 4, 1, col);
    p.rect(5, 9, 2, 1, col);
  };
  if (state === 2) { draw(PAL.red); p.rect(3, 2, 2, 2, PAL.redL); }
  else if (state === 1) { draw('#4a2a38'); p.rect(1, 2, 5, 3, PAL.red); p.rect(1, 5, 5, 1, PAL.red); p.rect(2, 6, 4, 1, PAL.red); p.rect(3, 7, 3, 1, PAL.red); p.rect(4, 8, 2, 1, PAL.red); p.rect(5, 9, 1, 1, PAL.red); }
  else { draw('#3a2634'); }
  return p.outline(PAL.ink).done();
}
function makeShieldHeart(state) {  // 灵力护盾
  const p = new Px(12, 11);
  const col = state ? PAL.jade : '#2c4a48';
  p.rect(4, 1, 4, 1, col); p.rect(2, 2, 8, 3, col); p.rect(1, 5, 10, 2, col);
  p.rect(2, 7, 8, 1, col); p.rect(4, 8, 4, 1, col); p.rect(5, 9, 2, 1, col);
  if (state) { p.rect(4, 3, 2, 2, PAL.jadeL); }
  return p.outline(PAL.ink).done();
}
function makeCoin() {
  const p = new Px(10, 10);
  p.rect(4, 1, 2, 1, PAL.jadeL); p.rect(3, 2, 4, 1, PAL.jade);
  p.rect(1, 3, 8, 4, PAL.jadeD); p.rect(2, 4, 6, 3, PAL.jade);
  p.rect(2, 7, 6, 1, PAL.jadeD); p.rect(4, 8, 2, 1, PAL.jadeD);
  p.set(3, 4, PAL.white);
  return p.outline(PAL.ink).done();
}
/* 灵力珠：靛蓝菱形宝珠，和金色方孔的灵石一眼可分 */
function makeMana() {
  const p = new Px(11, 11);
  p.rect(4, 1, 2, 1, PAL.cyan);
  p.rect(3, 2, 4, 1, PAL.cyan);
  p.rect(2, 3, 6, 1, PAL.cyan);
  p.rect(1, 4, 8, 3, PAL.cyan);
  p.rect(2, 7, 6, 2, PAL.cyanD);
  p.rect(4, 9, 2, 1, PAL.cyanD);
  p.set(3, 4, PAL.white); p.set(4, 4, PAL.white); p.set(3, 5, PAL.white);
  p.set(6, 6, PAL.cyanD);
  return p.outline(PAL.ink).done();
}
function makeKey() {
  const p = new Px(11, 12);
  p.ring(4, 3, 3.0, PAL.gold);          // 大弓环，中间留孔（与雷符的圆身区分）
  p.disc(4, 3, 1.2, PAL.ink);
  p.rect(4, 6, 2, 5, PAL.gold);         // 钥杆
  p.rect(6, 7, 3, 1, PAL.gold);         // 齿一
  p.rect(6, 9, 3, 1, PAL.gold);         // 齿二
  p.set(2, 2, PAL.white);               // 高光
  return p.outline(PAL.ink).done();
}
function makeBomb() {
  const p = new Px(12, 12);
  p.disc(6, 7, 4.6, PAL.ink2);
  p.disc(5, 6, 1.6, PAL.grey);
  p.rect(6, 1, 2, 3, PAL.gold);
  p.set(7, 0, PAL.fire); p.set(8, 1, PAL.orange);
  return p.outline(PAL.ink).done();
}

/* 法宝图标：kind 决定形状，c1/c2 决定配色 */
const ICON_BG = '#221d38';
function makeItemIcon(kind, c1, c2) {
  const p = new Px(16, 16);
  p.rect(1, 1, 14, 14, ICON_BG);
  p.box(0, 0, 16, 16, '#3c3560');
  p.box(1, 1, 14, 14, '#4d4478');
  const g = p.g;
  switch (kind) {
    case 'sword':   // 飞剑
      p.line(4, 12, 12, 3, c1, 2); p.line(4, 12, 12, 3, c2, 1);
      p.line(9, 3, 13, 3, c1); p.line(3, 11, 5, 13, c1); break;
    case 'gourd':   // 葫芦丹药
      p.disc(6, 6, 3, c1); p.disc(11, 10, 3.4, c1);
      p.rect(6, 4, 4, 4, c1); p.disc(11, 10, 2, c2);
      p.rect(5, 2, 3, 2, c2); break;
    case 'jade':    // 玉佩
      p.ring(8, 8, 5, c1); p.ring(8, 8, 3, c2); p.disc(8, 8, 1.6, c1); break;
    case 'talisman':// 符箓
      p.rect(5, 2, 6, 12, c1); p.rect(6, 3, 4, 10, c2);
      p.rect(6, 4, 4, 1, PAL.red); p.rect(6, 7, 4, 1, PAL.red); p.rect(7, 10, 2, 2, PAL.red); break;
    case 'book':    // 功法秘籍
      p.rect(3, 3, 10, 11, c1); p.rect(4, 4, 8, 9, c2);
      p.rect(7, 4, 1, 9, c1); p.rect(4, 7, 3, 1, PAL.gold); p.rect(9, 7, 3, 1, PAL.gold); break;
    case 'boot':    // 靴
      p.rect(4, 3, 5, 8, c1); p.rect(4, 9, 9, 3, c1); p.rect(4, 12, 9, 1, c2); break;
    case 'orb':     // 灵珠
      p.disc(8, 8, 5, c1); p.disc(7, 7, 3, c2); p.set(6, 6, PAL.white); break;
    case 'mirror':  // 宝镜
      p.ring(8, 7, 5, c1); p.disc(8, 7, 4, c2); p.rect(7, 12, 2, 3, c1); break;
    case 'ring':    // 戒指
      p.ring(8, 9, 4.6, c1); p.disc(8, 4, 2, c2); break;
    case 'fan':     // 宝扇
      p.ell(8, 10, 6, 3, c1); p.line(8, 10, 3, 4, c2); p.line(8, 10, 8, 3, c2); p.line(8, 10, 13, 4, c2); break;
    case 'bell':    // 镇魂铃
      p.ell(8, 8, 5, 5, c1); p.rect(6, 12, 4, 2, c2); p.disc(8, 13, 1.4, c2); break;
    case 'cauldron':// 丹炉
      p.rect(3, 5, 10, 8, c1); p.rect(4, 4, 8, 2, c2);
      p.rect(2, 13, 12, 1, c2); p.line(6, 2, 5, 0, PAL.purpleL); break;
    case 'feather': // 羽衣
      p.line(4, 13, 12, 3, c1); p.line(5, 13, 13, 4, c1);
      p.line(6, 12, 11, 6, c2); p.line(3, 12, 8, 6, c2); break;
    case 'lotus':   // 莲花
      p.disc(8, 9, 4, c1); p.disc(5, 6, 2, c2); p.disc(11, 6, 2, c2); p.disc(8, 5, 2, c2); break;
    case 'thunder': // 雷符
      p.line(9, 2, 5, 8, c1, 2); p.line(5, 8, 8, 8, c1, 2); p.line(8, 8, 6, 14, c1, 2); break;
    case 'flame':   // 火
      p.ell(8, 9, 4.6, 5.4, c1); p.ell(8, 8, 2.6, 3, c2); p.set(7, 5, PAL.white); break;
    case 'skull':   // 骷髅
      p.disc(8, 7, 5, c1); p.rect(5, 10, 6, 3, c1);
      p.set(6, 7, PAL.ink); p.set(10, 7, PAL.ink); p.rect(7, 10, 2, 3, PAL.ink); break;
    case 'eye':     // 天眼
      p.ell(8, 8, 6, 4, c1); p.disc(8, 8, 2.6, c2); p.set(8, 8, PAL.ink); break;
    case 'bag':     // 乾坤袋
      p.rect(3, 5, 10, 9, c1); p.rect(4, 3, 8, 2, c2); p.line(5, 3, 5, 1, c2); p.line(11, 3, 11, 1, c2); break;
    case 'cloud':   // 祥云
      p.disc(6, 9, 3, c1); p.disc(10, 9, 3, c1); p.disc(8, 7, 3, c1); p.rect(5, 10, 7, 2, c2); break;
    case 'needle':  // 针
      p.line(3, 13, 13, 3, c1); p.disc(3, 13, 1.4, c2); break;
    case 'banner':  // 幡
      p.rect(4, 2, 1, 14, c2); p.rect(5, 2, 8, 8, c1); p.rect(6, 3, 6, 6, c2);
      p.rect(6, 4, 6, 1, PAL.red); break;
    case 'coin':    // 灵石
      p.rect(5, 2, 6, 12, c1); p.rect(3, 5, 10, 6, c1); p.rect(6, 4, 4, 8, c2); break;
    case 'heart':   // 心法
      p.disc(6, 6, 3, c1); p.disc(10, 6, 3, c1); p.rect(3, 6, 10, 3, c1); p.disc(8, 11, 3, c1); break;
    case 'hand':    // 擒龙手：探出的利爪
      p.line(3, 2, 6, 9, c1); p.line(6, 1, 7, 9, c2);
      p.line(10, 1, 9, 9, c2); p.line(13, 2, 10, 9, c1);
      p.rect(5, 9, 6, 4, c1); p.rect(6, 11, 4, 3, c2);
      p.set(6, 10, PAL.white); break;
    case 'rift':    // 裂空斩：劈开的一道裂隙
      p.line(8, 1, 8, 14, c1, 2);
      p.line(4, 4, 4, 12, c2); p.line(12, 4, 12, 12, c2);
      p.set(6, 2, PAL.white); p.set(10, 13, PAL.white); break;
    default:
      p.disc(8, 8, 5, c1);
  }
  return p.done();
}

/* 全屏提示用的大字（像素点阵，5x7 字模） —— 仅用于标题 */
const FONT5 = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10011', '01111'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000']
};
function drawPixelText(g, text, x, y, scale, col) {
  g.fillStyle = col;
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const f = FONT5[ch];
    if (f) {
      for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++)
        if (f[r][c] === '1') g.fillRect(cx + c * scale, y + r * scale, scale, scale);
    }
    cx += 6 * scale;
  }
  return cx;
}

/* 初始化：把所有素材烘焙成 canvas 缓存 */
function buildSprites() {
  SPR.player = {
    down: [drawTaoist('down', 0), drawTaoist('down', 1)],
    up: [drawTaoist('up', 0), drawTaoist('up', 1)],
    side: [drawTaoist('side', 0), drawTaoist('side', 1)]
  };
  SPR.playerSideL = SPR.player.side.map(c => { const o = mkCanvas(c.width, c.height); o.g.translate(c.width, 0); o.g.scale(-1, 1); o.g.drawImage(c, 0, 0); return o.c; });
  // 蓄势姿态：只有舞剑流会用到，尺寸与行走姿态一致，脚下的落点才对得上
  SPR.playerCharge = {
    down: [drawTaoistCharge('down', 0), drawTaoistCharge('down', 1)],
    up: [drawTaoistCharge('up', 0), drawTaoistCharge('up', 1)],
    side: [drawTaoistCharge('side', 0), drawTaoistCharge('side', 1)]
  };
  SPR.playerChargeSideL = SPR.playerCharge.side.map(c => { const o = mkCanvas(c.width, c.height); o.g.translate(c.width, 0); o.g.scale(-1, 1); o.g.drawImage(c, 0, 0); return o.c; });
  // 挥剑姿态：同样只有舞剑流用得到，尺寸与行走姿态一致
  SPR.playerSwing = {
    down: [drawTaoistSwing('down', 0), drawTaoistSwing('down', 1), drawTaoistSwing('down', 2)],
    up: [drawTaoistSwing('up', 0), drawTaoistSwing('up', 1), drawTaoistSwing('up', 2)],
    side: [drawTaoistSwing('side', 0), drawTaoistSwing('side', 1), drawTaoistSwing('side', 2)]
  };
  SPR.playerSwingSideL = SPR.playerSwing.side.map(c => { const o = mkCanvas(c.width, c.height); o.g.translate(c.width, 0); o.g.scale(-1, 1); o.g.drawImage(c, 0, 0); return o.c; });

  SPR.enemies = {
    xiesui: [drawXieSui(0), drawXieSui(1)],
    chanchu: [drawChanChu(0), drawChanChu(1)],
    xuefu: [drawXueFu(0), drawXueFu(1)],
    guixiu: [drawGuiXiu(0), drawGuiXiu(1)],
    yinsha: [drawYinSha(0, false), drawYinSha(1, false)],
    yinsha_s: [drawYinSha(0, true), drawYinSha(1, true)],
    shikui: [drawShiKui(0), drawShiKui(1)],
    jianling: [drawJianLing(0), drawJianLing(1)]
  };
  SPR.boss = { xuemo: [drawBossXueMo(0), drawBossXueMo(1)], baigu: [drawBossBaiGu(0), drawBossBaiGu(1)] };

  SPR.sword = drawFeiJian();
  SPR.jujian = drawJuJian();
  SPR.saber = drawSaber();
  SPR.riftwave = drawRiftWave();
  SPR.bolt = {
    blood: drawBolt(PAL.red, PAL.redD, 'orb'),
    talisman: drawBolt(PAL.gold, '#e8d9a8', 'talisman'),
    flame: drawBolt(PAL.purple, PAL.fire, 'flame'),
    ice: drawBolt(PAL.cyan, '#bfeaff', 'ice'),
    orb: drawBolt(PAL.green, PAL.greenD, 'orb')
  };
  SPR.floor = [];
  for (let i = 0; i < 5; i++) SPR.floor.push(makeFloorTile(1000 + i * 37));
  SPR.floorRune = makeFloorRune(77);
  SPR.wall = [makeWallTile(5), makeWallTile(9)];
  SPR.wallTop = makeWallTop(3);
  SPR.door = { v: [makeDoor(false, true), makeDoor(true, true)], h: [makeDoor(false, false), makeDoor(true, false)] };
  SPR.crack = { v: makeCrack(true), h: makeCrack(false) };
  SPR.chest = [makeChest(false), makeChest(true)];
  SPR.pedestal = makePedestal();
  SPR.altar = makeAltar();
  SPR.keeper = makeShopKeeper();
  SPR.lantern = makeLantern();
  SPR.incense = makeIncense();
  SPR.heart = [makeHeart(0), makeHeart(1), makeHeart(2)];
  SPR.shield = [makeShieldHeart(0), makeShieldHeart(1)];
  SPR.coin = makeCoin();
  SPR.mana = makeMana();
  SPR.key = makeKey();
  SPR.bomb = makeBomb();
}
