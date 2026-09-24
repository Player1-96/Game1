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
  return p.outline(PAL.edge).done();
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

/* 剑灵（小体型）：精英「剑灵·断念」殒命时召出的小剑灵。
   必须单独画一套 —— 通用小体型素材是阴煞（yinsha_s），复用它会让玩家
   以为精英分裂出了两只阴煞（用户 2026-09-17 的反馈，现象属实）。 */
function drawJianLingS(frame) {
  const p = new Px(10, 10);
  const C = PAL.cyan, CD = PAL.cyanD, CL = '#bfeaff';
  const yb = frame ? 0 : 1;
  p.rect(4, 0 + yb, 2, 5, CD);                  // 剑身魂体
  p.rect(4, 0 + yb, 1, 4, C);
  p.set(3, 0 + yb, CL); p.set(4, 0 + yb, CL); p.set(5, 0 + yb, CL);
  p.rect(2, 5 + yb, 6, 1, C);                   // 剑格
  p.rect(4, 6 + yb, 2, 2, PAL.goldD);           // 柄
  p.disc(5, 8 + yb, 1, PAL.gold);
  return p.outline(PAL.ink).done();
}

/* 玄光瞳：悬浮的独眼，蓄力后射出贯穿一道的玄光 */
function drawXuanGuang(frame) {
  const p = new Px(20, 20);
  const yb = frame ? 0 : 1;
  const C = PAL.cyan, CD = PAL.cyanD, CL = '#d6f4ff';
  // 下摆的两条符幡
  p.rect(6, 15 + yb, 2, 4, CD); p.rect(12, 15 + yb, 2, 4, CD);
  p.set(7, 18 + yb, C); p.set(13, 18 + yb, C);
  // 眼身
  p.disc(10, 10 + yb, 7, CD);
  p.disc(10, 10 + yb, 6, CL);
  // 竖瞳
  p.ell(10, 10 + yb, 2.4, 4.4, PAL.redD);
  p.ell(10, 10 + yb, 1.2, 2.8, PAL.red);
  p.set(10, 6 + yb, PAL.redL);
  // 环状符阵（四面各一颗符钉）
  p.ring(10, 10 + yb, 8, C);
  p.set(10, 1 + yb, C); p.set(10, 19, C); p.set(1, 10 + yb, C); p.set(19, 10 + yb, C);
  return p.outline(PAL.edge).done();
}

/* 铁魄妖：玄铁铸的傀儡，射出的弹丸击不碎也反射不掉 */
function drawTieHun(frame) {
  const p = new Px(18, 18);
  const yb = frame ? 0 : 1;
  const S = PAL.greyD, SL = PAL.grey, SD = '#3a3550';
  p.rect(4, 1 + yb, 10, 7, SL);                  // 头
  p.rect(4, 1 + yb, 10, 2, SD);
  p.rect(6, 4 + yb, 6, 2, SD);                   // 眼槽
  p.set(7, 4 + yb, PAL.orange); p.set(10, 4 + yb, PAL.orange);
  p.rect(3, 8 + yb, 12, 8, S);                   // 躯干
  p.rect(3, 8 + yb, 12, 1, SL);
  p.set(4, 9 + yb, SL); p.set(13, 9 + yb, SL);
  p.set(4, 14 + yb, SL); p.set(13, 14 + yb, SL);
  p.rect(6, 10 + yb, 6, 4, SD);                  // 胸甲铆钉
  p.set(8, 11 + yb, PAL.orange); p.set(9, 12 + yb, PAL.orange);
  p.rect(0, 9 + yb, 3, 5, S); p.rect(15, 9 + yb, 3, 5, S);
  p.rect(5, 16 + yb, 3, 2, SD); p.rect(10, 16 + yb, 3, 2, SD);
  return p.outline(PAL.edge).done();
}

/* 蹦山魈：一蹦一跳，落点先亮圈 */
function drawBengYao(frame) {
  const p = new Px(18, 16);
  const yb = frame ? 0 : 1;                      // frame=0 蜷身蓄势
  const C = '#c98a4b', CD = '#87552a', CL = '#e8b678';
  p.rect(4, (frame ? 12 : 11), 3, frame ? 3 : 2, CD);
  p.rect(11, (frame ? 12 : 11), 3, frame ? 3 : 2, CD);
  p.ell(9, 9 + yb, 6, 4.4, C);
  p.ell(9, 8 + yb, 4.6, 3, CL);
  p.line(5, 6 + yb, 2, 2 + yb, CD);              // 角
  p.line(13, 6 + yb, 16, 2 + yb, CD);
  p.set(7, 7 + yb, PAL.red); p.set(11, 7 + yb, PAL.red);
  p.set(7, 10 + yb, PAL.white); p.set(11, 10 + yb, PAL.white);   // 獠牙
  return p.outline(PAL.ink).done();
}

/* 玄甲卫：甲片加身，两片护盾绕身慢转（护盾由代码画，精灵本体不带盾） */
function drawXuanJia(frame) {
  const p = new Px(18, 18);
  const yb = frame ? 0 : 1;
  const A = '#4a6f9c', AD = '#2b4463', AL = '#7fa6cf';
  p.rect(5, 1 + yb, 8, 5, AD);                   // 盔
  p.rect(4, 3 + yb, 10, 3, AD);
  p.rect(6, 4 + yb, 6, 2, AL);                   // 面甲
  p.set(7, 5 + yb, PAL.cyan); p.set(10, 5 + yb, PAL.cyan);
  p.rect(1, 2 + yb, 2, 5, AL); p.rect(15, 2 + yb, 2, 5, AL);     // 盔羽
  p.rect(3, 7 + yb, 12, 8, A);                   // 甲身
  p.rect(3, 7 + yb, 12, 1, AL);
  for (let i = 0; i < 3; i++) p.rect(4, 9 + i * 2 + yb, 10, 1, AD);
  p.rect(0, 8 + yb, 3, 5, A); p.rect(15, 8 + yb, 3, 5, A);
  p.rect(5, 15 + yb, 3, 3, AD); p.rect(10, 15 + yb, 3, 3, AD);
  return p.outline(PAL.edge).done();
}

/* 影魅：平时只剩一道影，贴近才现形 */
function drawYingMo(frame) {
  const p = new Px(16, 18);
  const yb = frame ? 0 : 1;
  const C = '#2a2140', CL = '#4b3c72', F = PAL.purpleL;
  p.ell(8, 12 + yb, 6, 5, C);                    // 影身
  p.ell(8, 6 + yb, 4.4, 4.4, C);                 // 兜帽
  p.rect(3, 8 + yb, 10, 8, C);
  p.ell(8, 10 + yb, 4, 3, CL);
  p.set(6, 6 + yb, F); p.set(9, 6 + yb, F);      // 幽火眼
  p.set(6, 13 + yb, CL); p.set(9, 13 + yb, CL);
  p.set(4, 16 + yb, C); p.set(11, 16 + yb, C);   // 飘散的影尾
  return p.outline(PAL.edge).done();
}

/* ============================================================
 *  北欧 · 杂兵 8 种
 *
 *  配色判据（见 px.js 顶部的「色板分层的判据」）：
 *  妖物的**固有色写死**（`const C = '#...'`），不走 PAL —— 霜狼在极光段
 *  也该是霜白的，跟着色板变会让「换个段就认不出这是哪只怪」。
 *  只有环境性的配色（描边、盔甲上的符文光、眼睛的高光）跟 PAL 走。
 *
 *  ⚠️ 每一只都对应 entities.js 里**已有的**一种 AI（见 nordic.js 的行为对照表）。
 *     这里只负责「长什么样」，不引入任何战斗逻辑。
 * ============================================================ */

/* 尸鬼武士：坟丘里爬起来的旧日战士 —— 装备还在身上（铁盔 + 锁甲 + 斧），
   眼睛是冰光而不是血红，一眼与中式的「邪祟 / 尸傀」分开。 */
function drawNordDraugr(frame) {
  const p = new Px(16, 18);
  const yb = frame ? 0 : 1;
  const C = '#6d7f8c', CD = '#41505a', CL = '#a4b7c3', IR = '#8a6234';
  p.rect(5, 2 + yb, 6, 4, CD);                       // 铁盔
  p.rect(4, 4 + yb, 8, 2, CD);
  p.rect(7, 3 + yb, 2, 1, CL);
  p.rect(6, 5 + yb, 4, 2, '#252c33');                // 面甲下的暗
  p.set(6, 6 + yb, PAL.cyan); p.set(9, 6 + yb, PAL.cyan);
  p.rect(4, 7 + yb, 8, 8, C);                        // 锁甲
  for (let i = 0; i < 3; i++) p.rect(5, 8 + i * 2 + yb, 6, 1, CD);
  p.rect(4, 7 + yb, 8, 1, CL);
  p.rect(2, 8 + yb + (frame ? 1 : 0), 2, 5, C);      // 双臂
  p.rect(12, 8 + yb + (frame ? 0 : 1), 2, 5, C);
  p.line(12, 9 + yb, 13, 3 + yb, IR);                // 斧
  p.rect(12, 2 + yb, 3, 3, PAL.greyL);
  p.set(13, 3 + yb, PAL.cyan);
  p.rect(5, 15 + yb, 3, 2, CD); p.rect(9, 15 + yb, 3, 2, CD);
  return p.outline(PAL.edge).done();
}

/* 血鸦：奥丁的鸟。双翼一上一下就是全部动画 —— 盘旋 → 俯冲（dash）。 */
function drawNordHrafn(frame) {
  const p = new Px(18, 14);
  const C = '#2c3140', CD = '#171b25', CL = '#59637c';
  const up = frame === 0;
  for (let i = 0; i < 4; i++) {                      // 展开的双翼
    const y = (up ? 1 : 4) + i;
    const w = 5 - i;
    p.rect(2 + i, y, w + (i ? 0 : 1), 1, i < 2 ? CD : C);
    p.rect(15 - i, y, w + (i ? 0 : 1), 1, i < 2 ? CD : C);
  }
  p.ell(9, 8, 3, 3.4, C);                            // 身体
  p.ell(9, 7, 2.4, 2.4, CL);
  p.set(8, 6, PAL.red); p.set(10, 6, PAL.red);       // 血红眼
  p.rect(9, 9, 2, 3, PAL.greyD);                     // 喙
  p.set(9, 10, PAL.ink);
  p.rect(7, 11, 5, 1, CD);
  p.set(6, 12, C); p.set(12, 12, C);
  return p.outline(PAL.edge).done();
}

/* 溺灵：水里的妖，永远在滴水。缓慢游走 + 三连水弹（spit）。 */
function drawNordNokk(frame) {
  const p = new Px(18, 16);
  const yb = frame ? 0 : 1;
  const C = '#3a6b66', CD = '#1e423e', CL = '#6fb8a8';
  p.ell(9, 9 + yb, 6, 5, C);                         // 水做的身躯
  p.ell(9, 7 + yb, 4.4, 3.4, CL);
  p.set(7, 7 + yb, PAL.cyan); p.set(11, 7 + yb, PAL.cyan);
  p.rect(7, 10 + yb, 4, 1, CD);
  p.rect(3, 12 + yb, 2, 3 - (frame ? 1 : 0), CD);    // 垂下的水须
  p.rect(13, 12 + yb, 2, 2 + (frame ? 1 : 0), CD);
  p.set(4, 15 + yb, PAL.cyanD); p.set(14, 14 + yb, PAL.cyanD);
  p.rect(6, 14 + yb, 6, 1, CD);
  return p.outline(PAL.edge).done();
}

/* 霜狼：一跳一跳地压上来（hop）。帧间前身抬起、后腿蹬直，蹦跳的读法就出来了。 */
function drawNordIsvarg(frame) {
  const p = new Px(18, 14);
  const C = '#9db6cc', CD = '#5d7690', CL = '#dcefff';
  const up = frame === 1;
  const yb = up ? 0 : 1;
  p.ell(9, 8 + yb, 6.4, 3.4, C);                     // 躯干
  p.ell(9, 7 + yb, 4.6, 2.4, CL);
  p.rect(11, 3 + yb - (up ? 1 : 0), 4, 4, C);        // 头
  p.rect(12, 4 + yb, 3, 2, CL);
  p.set(14, 5 + yb, PAL.cyan);
  p.set(15, 6 + yb, PAL.white);                      // 獠牙
  p.rect(10, 1 + yb - (up ? 1 : 0), 2, 2, CD);       // 耳
  p.rect(14, 1 + yb - (up ? 1 : 0), 2, 2, CD);
  p.rect(2, 6 + yb, 3, 2, CD);                       // 尾
  p.rect(3, 9 + yb, 2, up ? 2 : 4, CD);              // 前腿
  p.rect(7, 9 + yb, 2, up ? 2 : 4, CD);
  p.rect(12, 9 + yb, 2, up ? 4 : 3, CD);             // 后腿（蹬地那条更长）
  p.rect(15, 10 + yb, 2, 3, CD);
  return p.outline(PAL.edge).done();
}

/* 先知：北欧的女巫（völva）。权杖 + 兜帽 + 环绕的符文，保持中距放三连符文弹。 */
function drawNordVolva(frame) {
  const p = new Px(16, 18);
  const yb = frame ? 0 : 1;
  const R = '#3a3450', RD = '#242038', CL = '#7a6ea8';
  p.ell(8, 8 + yb, 4.6, 5, R);                       // 兜帽
  p.rect(3, 8 + yb, 10, 9, R);                       // 斗篷
  p.ell(8, 9 + yb, 3.2, 3.4, RD);                    // 兜帽里的暗
  p.set(6, 9 + yb, PAL.purpleL); p.set(9, 9 + yb, PAL.purpleL);
  p.rect(3, 8 + yb, 10, 1, CL);
  p.rect(1, 10 + yb, 2, 6, R); p.rect(13, 10 + yb, 2, 6, R);
  p.line(13, 11 + yb, 14, 3 + yb, PAL.greyD);        // 权杖
  p.disc(13, 2 + yb, 2, PAL.purple);
  p.set(13, 1 + yb, PAL.purpleL);
  p.rect(5, 16 + yb, 6, 1, RD);
  return p.outline(PAL.edge).done();
}

/* 影灵：一团没有实体的影（stealth）。与中式「影魅」的差别是**没有轮廓** ——
   只剩两点幽光与一截散开的尾。 */
function drawNordSkuggi(frame) {
  const p = new Px(16, 18);
  const yb = frame ? 0 : 1;
  const C = '#1c2230', CL = '#3c4a63', F = '#8ce0ff';
  p.ell(8, 8 + yb, 5, 5.4, C);                       // 影团
  p.ell(8, 7 + yb, 3.6, 3.6, CL);
  p.set(6, 7 + yb, F); p.set(9, 7 + yb, F);          // 两点幽光
  p.rect(4, 12 + yb, 8, 2, C);
  p.rect(5, 14 + yb, 2, 3, C); p.rect(9, 14 + yb, 2, 2, C);
  p.set(3, 13 + yb, CL); p.set(12, 13 + yb, CL);
  return p.outline(PAL.edge).done();
}

/* 霜巨魔：扛长柄战锤的重装（shieldbash）。全套里体型最大的杂兵，
   所以解法是「绕到侧后」而不是站着对砍 —— 行为与外观必须互相说明。
   ⚠️ 手里不画盾：旋盾由 entities.js 的盾系统按弧线单独绘制，
      这里再画一个静态盾就是两个盾。 */
function drawNordRimtroll(frame) {
  const p = new Px(20, 20);
  const yb = frame ? 0 : 1;
  const S = '#5e7a8c', SD = '#374c5a', SL = '#93b0c0', IR = '#8a6234';
  p.ell(10, 6 + yb, 5, 4.6, S);                      // 头
  p.ell(10, 5 + yb, 3.4, 3, SL);
  p.set(8, 6 + yb, PAL.cyan); p.set(12, 6 + yb, PAL.cyan);
  p.rect(8, 8 + yb, 4, 1, SD);
  p.set(8, 9 + yb, PAL.bone); p.set(11, 9 + yb, PAL.bone);   // 獠牙
  p.rect(4, 10 + yb, 12, 7, S);                      // 躯干
  p.rect(4, 10 + yb, 12, 1, SL);
  for (let i = 0; i < 3; i++) p.rect(6, 12 + i * 2 + yb, 8, 1, SD);
  p.rect(1, 11 + yb, 3, 6, S); p.rect(16, 11 + yb, 3, 6, S);
  p.line(17, 12 + yb, 18, 3 + yb, IR);               // 战锤
  p.rect(16, 2 + yb, 4, 4, IR);
  p.rect(16, 3 + yb, 4, 1, PAL.greyL);
  p.rect(5, 17 + yb, 4, 3, SD); p.rect(11, 17 + yb, 4, 3, SD);
  return p.outline(PAL.edge).done();
}

/* 符文石人：立起来的符文石自己走动的守卫。慢、硬、弹丸斩不落 ——
   它逼你把「击落弹幕」这条解法收回去，只剩走位。 */
function drawNordRunestone(frame) {
  const p = new Px(18, 18);
  const yb = frame ? 0 : 1;
  const S = '#5a6670', SD = '#3a444c', SL = '#8698a6';
  p.rect(5, 1 + yb, 8, 13, S);                       // 石身
  p.rect(5, 1 + yb, 8, 1, SL);
  p.rect(4, 1 + yb, 1, 13, SD); p.rect(13, 1 + yb, 1, 13, SD);
  p.rect(6, 14 + yb, 6, 2, SD);
  p.disc(9, 7 + yb, 3.2, PAL.ink);                   // 符文槽
  if (frame) { p.line(9, 4 + yb, 9, 10 + yb, PAL.rune); p.line(7, 7 + yb, 11, 7 + yb, PAL.rune); }
  else { p.line(7, 4 + yb, 11, 10 + yb, PAL.rune); p.line(11, 4 + yb, 7, 10 + yb, PAL.rune); }
  p.rect(2, 5 + yb, 3, 5, S); p.rect(13, 5 + yb, 3, 5, S);   // 双臂
  p.rect(2, 5 + yb, 3, 1, SL);
  p.rect(5, 16 + yb, 3, 2, SD); p.rect(10, 16 + yb, 3, 2, SD);
  return p.outline(PAL.edge).done();
}

/* ------------------------------------------------------------
 *  BOSS  ── 中式的五位尊者
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
  return p.outline(PAL.edgeSoft).done();
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
  return p.outline(PAL.edgeWarm).done();
}

/* 裂煞魔尊：躯干自顶裂到腰，裂隙里透出红光 —— 它的术法也一样，会一分为二 */
function drawBossLieSha(frame) {
  const p = new Px(48, 52);
  const yb = frame ? 0 : 1;
  const C = '#3a2038', CD = '#241228', CL = '#5e3556', CR = PAL.red, CRL = PAL.redL;
  p.ell(24, 36 + yb, 20, 16, C);                 // 披风
  p.ell(24, 32 + yb, 14, 11, CL);
  p.rect(16, 4 + yb, 16, 12, '#d8cfc4');         // 头
  p.rect(16, 4 + yb, 16, 3, CD);
  p.set(20, 10 + yb, CR); p.set(27, 10 + yb, CR);
  p.line(24, 5 + yb, 22, 15 + yb, CRL);          // 面部裂缝
  p.rect(22, 14 + yb, 5, 1, CD);
  p.line(17, 5 + yb, 11, 0 + yb, PAL.bone);      // 角
  p.line(31, 5 + yb, 37, 0 + yb, PAL.bone);
  p.rect(5, 19 + yb, 11, 6, CD);                 // 肩甲
  p.rect(32, 19 + yb, 11, 6, CD);
  p.set(7, 20 + yb, CR); p.set(41, 20 + yb, CR);
  p.rect(18, 20 + yb, 12, 16, CD);               // 躯干
  p.line(24, 18 + yb, 22, 38 + yb, CR, 2);       // 主裂隙
  p.set(20, 25 + yb, CRL); p.set(26, 28 + yb, CRL);
  p.set(21, 33 + yb, CRL); p.set(25, 36 + yb, CRL);
  p.rect(2, 25 + yb, 8, 4, C); p.rect(38, 25 + yb, 8, 4, C);
  p.line(8, 27 + yb, 2, 40 + yb, PAL.bone);      // 骨爪
  p.line(40, 27 + yb, 46, 40 + yb, PAL.bone);
  return p.outline(PAL.edgeSoft).done();
}

/* 轮回法王：背悬一座八辐法轮，前进不止、轮转不息 */
function drawBossLunHui(frame) {
  const p = new Px(48, 52);
  const yb = frame ? 0 : 1;
  const C = '#2a2a4a', CD = '#171732';
  const G = PAL.gold, GD = PAL.goldD, GL = PAL.goldL;
  p.ring(24, 22 + yb, 19, GD);                   // 法轮外圈
  p.ring(24, 22 + yb, 18, GD);
  for (let i = 0; i < 8; i++) {                  // 八辐
    const a = i * Math.PI / 4 + 0.2;
    p.line(24, 22 + yb, 24 + Math.cos(a) * 19, 22 + yb + Math.sin(a) * 19, GD);
  }
  p.ring(24, 22 + yb, 8, G);
  p.rect(17, 22 + yb, 14, 6, CD);                // 肩
  p.rect(16, 14 + yb, 16, 9, C);                 // 头
  p.set(20, 19 + yb, G); p.set(27, 19 + yb, G);
  p.rect(19, 25 + yb, 10, 14, CD);               // 躯干
  p.set(24, 30 + yb, G); p.set(24, 32 + yb, GL);
  p.rect(4, 24 + yb, 13, 4, C); p.rect(31, 24 + yb, 13, 4, C);
  p.set(4, 25 + yb, G); p.set(43, 25 + yb, G);
  p.ell(24, 42 + yb, 15, 7, CD);                 // 下摆
  return p.outline(PAL.edgeWarm).done();
}

/* 烛龙：独眼竖瞳，闭眼时结出一层符文鳞罩，睁眼便横扫一道玄光 */
function drawBossZhuLong(frame) {
  const p = new Px(48, 52);
  const yb = frame ? 0 : 1;
  const C = '#5a2418', CD = '#341209', CL = '#8a3a22';
  const F = PAL.fire, FL = PAL.goldL;
  p.ell(24, 38 + yb, 19, 12, CD);                // 盘身
  p.ell(24, 34 + yb, 15, 9, CL);
  p.rect(6, 34 + yb, 36, 4, CD);
  p.ell(24, 18 + yb, 15, 12, C);                 // 头
  p.ell(24, 16 + yb, 11, 8, CL);
  p.rect(18, 24 + yb, 12, 6, CD);                // 长吻
  p.rect(19, 25 + yb, 10, 2, CL);
  p.set(21, 28 + yb, PAL.white); p.set(26, 28 + yb, PAL.white);
  p.disc(24, 15 + yb, 6, PAL.ink);               // 独眼
  p.disc(24, 15 + yb, 5, F);
  p.ell(24, 15 + yb, 1.4, 4.6, PAL.ink);         // 竖瞳
  p.set(23, 11 + yb, FL); p.set(25, 11 + yb, FL);
  p.line(14, 9 + yb, 5, 0 + yb, PAL.bone);       // 角
  p.line(15, 10 + yb, 8, 1 + yb, PAL.bone);
  p.line(34, 9 + yb, 43, 0 + yb, PAL.bone);
  p.line(33, 10 + yb, 40, 1 + yb, PAL.bone);
  p.line(10, 22 + yb, 2, 18 + yb, F);            // 焰须
  p.line(38, 22 + yb, 46, 18 + yb, F);
  p.line(8, 42 + yb, 2, 48 + yb, PAL.bone);      // 爪
  p.line(40, 42 + yb, 46, 48 + yb, PAL.bone);
  return p.outline(PAL.edgeSoft).done();
}

/* ============================================================
 *  北欧 · 尊者 3 尊（每段一尊）
 *
 *  3 尊对应第 5 / 10 / 15 层。与中式同一个骨架（游走 + 冲刺 + 三阶段），
 *  所以这里只要能一眼认出「这是谁」就够了 —— 题面的差别在数值与弹幕色系。
 * ============================================================ */

/* 芬里尔：巨狼。低伏、张口、铁链缠身（它本该被 Gleipnir 拴住）。 */
function drawBossFenrir(frame) {
  const p = new Px(48, 52);
  const C = '#4a5464', CD = '#2a3240', CL = '#7d8ca0';
  const yb = frame ? 0 : 1;
  p.ell(26, 38 + yb, 18, 12, CD);                    // 蜷起的后身
  p.ell(26, 34 + yb, 14, 9, C);
  p.ell(16, 22 + yb, 12, 10, C);                     // 头
  p.ell(15, 20 + yb, 9, 7, CL);
  p.rect(3, 22 + yb, 14, 8, C);                      // 长吻
  p.rect(4, 24 + yb, 12, 3, CL);
  p.set(6, 27 + yb, PAL.white); p.set(11, 27 + yb, PAL.white);      // 獠牙
  p.set(8, 28 + yb, PAL.white); p.set(10, 28 + yb, PAL.white);
  p.set(13, 17 + yb, PAL.goldL); p.set(18, 17 + yb, PAL.goldL);     // 金瞳
  p.rect(10, 13 + yb, 2, 4, CD); p.rect(19, 13 + yb, 2, 4, CD);     // 耳
  p.rect(28, 12 + yb, 3, 4, CD); p.rect(32, 11 + yb, 3, 4, CD);     // 背鬃
  p.rect(36, 13 + yb, 3, 4, CD);
  /* 铁链：一段一段地搭在背脊上 —— Klépnir 的痕迹，也是「它挣脱过」的说明 */
  for (let i = 0; i < 6; i++) p.ring(20 + i * 4, 38 + (i % 2) * 3 + yb, 2, PAL.greyL);
  p.line(12, 44 + yb, 5, 50 + yb, PAL.bone);         // 前爪
  p.line(20, 46 + yb, 15, 51 + yb, PAL.bone);
  p.line(34, 44 + yb, 41, 50 + yb, PAL.bone);        // 后爪
  p.line(28, 46 + yb, 33, 51 + yb, PAL.bone);
  p.line(40, 34 + yb, 47, 26 + yb, CD);              // 尾
  return p.outline(PAL.edgeSoft).done();
}

/* 耶梦加得：尘世巨蟒。三圈盘身把厅堂坐满，以毒环封路，不冲刺。 */
function drawBossJormungandr(frame) {
  const p = new Px(48, 52);
  const C = '#2f6b56', CD = '#1b4436', CL = '#57a882';
  const yb = frame ? 0 : 1;
  for (let i = 0; i < 3; i++) {                      // 盘绕的蛇身
    p.ell(24, 30 + i * 7 + yb, 20 - i * 2, 6, i % 2 ? CL : C);
    if (i < 2) p.rect(5 - i, 30 + i * 7 + yb, 38 + i * 2, 1, CD);
  }
  p.ell(24, 16 + yb, 13, 10, C);                     // 头
  p.ell(24, 14 + yb, 10, 7, CL);
  p.rect(16, 22 + yb, 16, 6, CD);                    // 吻部
  p.rect(17, 23 + yb, 14, 2, CL);
  p.set(19, 25 + yb, PAL.white); p.set(28, 25 + yb, PAL.white);     // 毒牙
  p.set(20, 17 + yb, PAL.green); p.set(28, 17 + yb, PAL.green);     // 双眼
  p.line(12, 10 + yb, 3, 3 + yb, PAL.bone);          // 角
  p.line(13, 11 + yb, 6, 5 + yb, PAL.bone);
  p.line(36, 10 + yb, 45, 3 + yb, PAL.bone);
  p.line(35, 11 + yb, 42, 5 + yb, PAL.bone);
  for (let i = 0; i < 5; i++) p.set(10 + i * 6, 33 + yb, CD);       // 鳞纹
  p.line(20, 28 + yb, 20, 34 + yb, PAL.green);       // 毒涎
  p.line(28, 28 + yb, 28, 32 + yb, PAL.green);
  return p.outline(PAL.edgeSoft).done();
}

/* 苏尔特：火巨人。气势全在那一笔「斜举的烈焰之剑」上 ——
   剑身占满画面三分之一，玩家一进场就知道这一局要躲的是什么。 */
function drawBossSurtr(frame) {
  const p = new Px(48, 52);
  const yb = frame ? 0 : 1;
  const C = '#6b2a1c', CD = '#3d150c', CL = '#a84a28';
  const F = PAL.fire, FL = PAL.goldL;
  p.ell(24, 36 + yb, 20, 16, CD);                    // 熔岩披风
  p.ell(24, 32 + yb, 15, 11, CL);
  p.rect(18, 6 + yb, 12, 12, C);                     // 头
  p.rect(18, 6 + yb, 12, 3, CD);
  p.set(21, 12 + yb, FL); p.set(26, 12 + yb, FL);    // 火眼
  p.rect(21, 16 + yb, 6, 1, PAL.ink);
  for (let i = 0; i < 5; i++) {                      // 头上烧出来的焰冠
    const h = 3 + ((i % 3) + (frame ? 1 : 0)) * 2;
    p.line(19 + i * 2.4, 6 + yb, 19 + i * 2.4, 6 + yb - h, i % 2 ? F : FL);
  }
  p.rect(6, 20 + yb, 10, 6, CD); p.rect(32, 20 + yb, 10, 6, CD);    // 肩甲
  p.rect(20, 24 + yb, 8, 10, C);                     // 胸
  p.rect(21, 26 + yb, 6, 6, F);                      // 胸口的熔核
  p.set(24, 28 + yb, FL);
  p.rect(2, 26 + yb, 8, 5, CD); p.rect(38, 26 + yb, 8, 5, CD);      // 手臂
  p.line(40, 30 + yb, 46, 4 + yb, PAL.greyD, 3);     // 烈焰之剑
  p.line(40, 30 + yb, 46, 4 + yb, F, 1);
  p.set(45, 7 + yb, FL); p.set(44, 11 + yb, FL); p.set(43, 15 + yb, FL);
  p.rect(38, 30 + yb, 6, 2, PAL.goldD);              // 护手
  return p.outline(PAL.edgeSoft).done();
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
  } else if (kind === 'iron') {              // 玄铁弹：方芯铁块，击不碎也反射不掉
    p.rect(2, 2, 8, 8, col);
    p.rect(3, 3, 6, 6, colD);
    p.rect(2, 2, 8, 1, PAL.greyL);           // 上缘受光
    p.set(4, 4, PAL.greyL); p.set(7, 7, PAL.greyL);
    p.set(6, 3, PAL.orange);                 // 一点炼火
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
  const cols = [PAL.cyanD, PAL.cyan, PAL.cyan];
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
      p.rect(x + 1, y + 1, 14, 6, rng() < 0.5 ? PAL.stone2 : PAL.wallHi);
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
    p.rect(0, 0, W, H, PAL.moss);
    p.rect(2, 2, W - 4, H - 4, PAL.rune);
    // 木纹
    for (let i = 4; i < (vertical ? H : W) - 4; i += 5) {
      if (vertical) p.rect(4, i, W - 8, 1, PAL.wallLo); else p.rect(i, 4, 1, H - 8, PAL.wallLo);
    }
    // 门环 + 镇门符
    p.disc(W / 2, H / 2, 3, PAL.goldD); p.ring(W / 2, H / 2, 3, PAL.gold);
    p.rect(W / 2 - 3, H / 2 - 8, 6, 7, PAL.gold);
    p.rect(W / 2 - 2, H / 2 - 7, 4, 5, PAL.red);
    p.rect(0, 0, W, 1, PAL.wallHi); p.rect(0, H - 1, W, 1, PAL.wallLo);
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
    p.line(13, 6, 15, 18, PAL.rune);
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
  p.rect(2, 8, 20, 12, PAL.moss);
  p.rect(2, 8, 20, 2, PAL.wallHi);
  p.rect(2, 18, 20, 2, PAL.wallLo);
  p.rect(11, 8, 2, 12, PAL.goldD);
  if (open) {
    p.rect(3, 2, 18, 7, PAL.rune);
    p.rect(4, 3, 16, 5, PAL.goldD);
    p.disc(12, 5, 2, PAL.gold);
  } else {
    p.rect(2, 2, 20, 7, PAL.goldD);
    p.rect(2, 2, 20, 2, PAL.gold);
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
  p.rect(4, 2, 12, 4, PAL.moss);           // 斗笠
  p.rect(2, 4, 16, 2, PAL.wallHi);
  p.rect(5, 6, 10, 8, PAL.skin);
  p.set(8, 9, PAL.ink); p.set(11, 9, PAL.ink);
  p.rect(4, 14, 12, 8, PAL.purpleD);          // 长袍
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
  p.rect(4, 10, 8, 5, PAL.stoneLo);
  p.rect(3, 9, 10, 2, PAL.stoneHi);
  p.rect(5, 5, 6, 5, PAL.stone);
  p.line(8, 5, 8, 0, PAL.purpleL);
  p.disc(8, 3, 1, PAL.purpleL);
  return p.outline(PAL.ink).done();
}

/* ---------- 北欧摆件 ----------
   不新增「摆件种类」，而是在 buildSprites 里**顶掉同名键** ——
   于是 Prop 的绘制、房间生成、存档都不用改一行。 */
function makeNordBrazier() {                  // 顶替 lantern
  const p = new Px(14, 20);
  p.rect(6, 14, 2, 6, PAL.stoneLo);           // 柱脚
  p.rect(3, 12, 8, 3, PAL.stoneHi);           // 铁盆
  p.ell(7, 12, 4.4, 1.4, PAL.stoneLo);
  p.ell(7, 8, 3.4, 4.6, PAL.fire);            // 火
  p.ell(7, 9, 2, 2.6, PAL.goldL);
  p.set(6, 6, PAL.white); p.set(8, 5, PAL.goldL);
  return p.outline(PAL.ink).done();
}
function makeNordBlotStone() {                // 顶替 altar：血祭石
  const p = new Px(30, 26);
  p.rect(3, 20, 24, 4, PAL.stone2);           // 基座
  p.rect(6, 2, 18, 20, PAL.stone);            // 立石
  p.rect(6, 2, 18, 2, PAL.stoneHi);
  p.rect(5, 2, 2, 20, PAL.stoneLo); p.rect(23, 2, 2, 20, PAL.stoneLo);
  p.rect(11, 8, 8, 2, PAL.redD);              // 血槽
  p.rect(12, 10, 6, 1, PAL.red);
  p.line(15, 12, 15, 17, PAL.rune);           // 符文
  p.line(12, 14, 18, 14, PAL.rune);
  p.set(15, 20, PAL.red);
  return p.outline(PAL.ink).done();
}
function makeNordRunePillar() {               // 顶替 incense
  const p = new Px(16, 22);
  p.rect(4, 2, 8, 18, PAL.stone);             // 石柱
  p.rect(3, 1, 10, 2, PAL.stoneHi);
  p.rect(3, 19, 10, 3, PAL.stoneLo);
  p.line(8, 5, 8, 16, PAL.rune);
  p.line(5, 9, 11, 9, PAL.rune);
  p.line(6, 13, 10, 13, PAL.rune);
  p.disc(8, 16, 1.4, PAL.rune);
  return p.outline(PAL.ink).done();
}
function makeNordFloorRune(seed) {            // 顶替 floorRune：起手房与龙巢的符文地砖
  const p = new Px(32, 32);
  p.rect(0, 0, 32, 32, PAL.floor);
  for (let i = 0; i < 40; i++) {
    p.set(Math.floor(mulberry32(seed + i)() * 32), Math.floor(mulberry32(seed + i * 7)() * 32), PAL.floor2);
  }
  p.ring(16, 16, 9, PAL.rune);
  p.ring(16, 16, 5, PAL.stone2);
  p.rect(16, 6, 1, 20, PAL.rune);
  p.rect(8, 15, 16, 1, PAL.rune);
  p.rect(0, 0, 32, 1, PAL.floorLine); p.rect(0, 0, 1, 32, PAL.floorLine);
  return p.done();
}

/* ============================================================
 *  按世界风格取素材
 *
 *  ⚠️ 每一项都是**惰性构造器**（`() => [...]`），不是烤好的 canvas。
 *     写成立刻求值的话，顶层会在 px.js 的初值色板（cn_1）下把北欧的怪
 *     烤成中式配色 —— 而且**不报错**，只在切到北欧时才看出来。
 *     （融合产物当初踩过同型的坑：说明里引 items.js 的 TAIXU 直接白屏。）
 *
 *  ⚠️ 键名必须与 nordic.js 的 `NORDIC_ENEMY_DEF[*].spr` / `NORDIC_BOSS_DEF` 键
 *     完全一致。写错的后果是 `SPR.enemies[undefined]` → Enemy.draw 里
 *     `set[frame]` 抛异常，整局直接断在刷怪那一刻。`_t_nordic.js` T3/T5 逐个核。
 *
 *  中式的表不放在这里 —— 它继续写在 buildSprites 里（14 种 + 5 尊，原文照旧）。
 * ============================================================ */
const STYLE_ART = {
  nordic: {
    /* 杂兵：8 种（行为对照见 nordic.js） */
    enemy: {
      draugr: () => [drawNordDraugr(0), drawNordDraugr(1)],
      hrafn: () => [drawNordHrafn(0), drawNordHrafn(1)],
      nokk: () => [drawNordNokk(0), drawNordNokk(1)],
      isvarg: () => [drawNordIsvarg(0), drawNordIsvarg(1)],
      volva: () => [drawNordVolva(0), drawNordVolva(1)],
      skuggi: () => [drawNordSkuggi(0), drawNordSkuggi(1)],
      rimtroll: () => [drawNordRimtroll(0), drawNordRimtroll(1)],
      runestone: () => [drawNordRunestone(0), drawNordRunestone(1)]
    },
    /* 尊者：3 尊，分别镇守第 5 / 10 / 15 层 */
    boss: {
      fenrir: () => [drawBossFenrir(0), drawBossFenrir(1)],
      jormungandr: () => [drawBossJormungandr(0), drawBossJormungandr(1)],
      surtr: () => [drawBossSurtr(0), drawBossSurtr(1)]
    },
    /* 摆件：**顶掉同名键** —— 于是 Prop 绘制 / 房间生成 / 存档一行都不用改 */
    prop: {
      lantern: makeNordBrazier,
      altar: makeNordBlotStone,
      incense: makeNordRunePillar,
      floorRune: () => makeNordFloorRune(77)
    }
  }
};

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
  else if (state === 1) { draw(PAL.redD); p.rect(1, 2, 5, 3, PAL.red); p.rect(1, 5, 5, 1, PAL.red); p.rect(2, 6, 4, 1, PAL.red); p.rect(3, 7, 3, 1, PAL.red); p.rect(4, 8, 2, 1, PAL.red); p.rect(5, 9, 1, 1, PAL.red); }
  else { draw(PAL.greyD); }
  return p.outline(PAL.ink).done();
}
function makeShieldHeart(state) {  // 灵力护盾
  const p = new Px(12, 11);
  const col = state ? PAL.jade : PAL.stoneLo;
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
function iconBG() { return PAL.wallLo; }   /* 图标底随色板走：换风格时图标要一起重建（见 game.js 的 applySegmentPalette） */
function makeItemIcon(kind, c1, c2) {
  const p = new Px(16, 16);
  p.rect(1, 1, 14, 14, iconBG());
  p.box(0, 0, 16, 16, PAL.wall);
  p.box(1, 1, 14, 14, PAL.wallHi);
  const g = p.g;
  switch (kind) {
    case 'sword':   // 飞剑
      p.line(4, 12, 12, 3, c1, 2); p.line(4, 12, 12, 3, c2, 1);
      p.line(9, 3, 13, 3, c1); p.line(3, 11, 5, 13, c1); break;
    case 'gourd':   // 葫芦丹药
      p.disc(6, 6, 3, c1); p.disc(11, 10, 3.4, c1);
      p.rect(6, 4, 4, 4, c1); p.disc(11, 10, 2, c2);
      p.rect(5, 2, 3, 2, c2); break;
    /* 丹丸：丹药专属形状 —— 一颗主丹 + 一颗小丹。
       原先丹药用的就是上面的 gourd，而法宝「琉璃盏」也用了 gourd + 同配色，
       两者画出来是同一个位图，玩家会以为「丹药跑进法宝格里了」（2026-09-21 反馈）。
       改成丸状后就与法宝（葫芦 / 剑 / 镜 / 符…）在形状上直接分开。 */
    case 'pill':
      p.disc(8, 8, 5, c1); p.disc(7, 6.5, 2.6, c2);
      p.set(6, 5, PAL.white);
      p.disc(13, 3, 1.6, c1); break;
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
    case 'thunder': // 雷符：一道折线闪电
      p.line(9, 2, 5, 8, c1, 2); p.line(5, 8, 8, 8, c1, 2); p.line(8, 8, 6, 14, c1, 2); break;
    /* 连锁雷：主雷 + 两道分叉。
       「引雷符」（法宝，加连锁）与「天雷引」（功法）原本共用 thunder，
       而 thunder 只用到 c1 —— 两者画出来是同一个位图，在坊市里并排摆着没法区分。
       分叉既是形状上的差异，也正好说明「连锁」这件事。 */
    case 'chain':
      p.line(9, 2, 5, 8, c1, 2); p.line(5, 8, 8, 8, c1, 2); p.line(8, 8, 6, 14, c1, 2);
      p.line(5, 8, 2, 6, c2, 1); p.line(8, 8, 11, 11, c2, 1); break;
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
    /* ---------- 北欧专属形状 ----------
       刻意**不复用**中式形状（剑 / 符 / 葫芦 / 幡…）：形状就是「这个世界的语言」，
       跨界复用会让北欧的商栈里摆的东西看起来还是中式那一套。
       ⚠️ 同一形状下的配色必须两两不同（`_t_audit.js` ⑫ 守着）。 */
    case 'hammer':  // 妙尔尼尔：方头战锤
      p.rect(7, 3, 2, 11, c2); p.rect(5, 11, 6, 1, c2);
      p.rect(4, 2, 8, 6, c1); p.rect(5, 3, 6, 2, c2);
      p.set(8, 4, PAL.white); break;
    case 'spear':   // 冈格尼尔：长枪
      p.line(4, 14, 10, 6, c2); p.rect(9, 4, 4, 4, c1);
      p.line(12, 1, 12, 6, c1); p.line(10, 4, 14, 4, c1);
      p.set(12, 2, PAL.white); break;
    case 'apple':   // 伊登之苹果
      p.disc(8, 9, 5, c1); p.disc(6, 7, 2.4, c2);
      p.rect(8, 2, 1, 3, PAL.moss); p.line(9, 3, 12, 2, PAL.moss);
      p.set(6, 6, PAL.white); break;
    case 'rune':    // 卢恩石：刻了符文的石
      p.rect(4, 3, 8, 11, c1); p.rect(5, 4, 6, 9, c2);
      p.line(8, 5, 8, 11, PAL.ink); p.line(6, 7, 10, 7, PAL.ink);
      p.set(8, 9, PAL.white); break;
    case 'wolf':    // 芬里尔之牙：狼首
      p.rect(5, 3, 7, 7, c1); p.rect(4, 8, 9, 4, c1);
      p.rect(10, 1, 2, 3, c1); p.rect(4, 1, 2, 3, c1);
      p.set(6, 6, PAL.ink); p.set(10, 6, PAL.ink);
      p.rect(6, 8, 5, 1, c2);
      p.set(6, 10, PAL.white); p.set(9, 10, PAL.white); break;
    case 'raven':   // 渡鸦
      p.ell(8, 9, 4.4, 3.4, c1); p.disc(8, 5, 3, c1);
      p.line(4, 7, 1, 4, c1); p.line(12, 7, 15, 4, c1);
      p.set(7, 5, PAL.red); p.set(9, 5, PAL.red);
      p.line(8, 6, 11, 8, c2); p.rect(6, 12, 4, 2, c1); break;
    case 'helm':    // 约顿海姆之铠：带角的头盔
      p.ell(8, 8, 5, 4.4, c1); p.rect(4, 8, 9, 4, c1);
      p.rect(7, 8, 2, 5, c2);
      p.line(4, 6, 1, 3, c2); p.line(12, 6, 15, 3, c2);
      p.rect(6, 4, 4, 1, c2); break;
    case 'tree':    // 世界树
      p.rect(7, 9, 2, 6, c2); p.rect(5, 13, 6, 1, c2);
      p.disc(8, 6, 4, c1); p.disc(5, 8, 2.4, c1); p.disc(11, 8, 2.4, c1);
      p.set(8, 4, PAL.goldL); p.set(5, 7, PAL.goldL); break;
    case 'horn':    // 蜜酒角
      p.rect(3, 4, 4, 4, c1); p.rect(3, 4, 4, 1, c2);
      p.line(6, 5, 13, 11, c1, 2); p.line(7, 6, 13, 10, c2);
      p.disc(13, 12, 1.6, c2); p.set(4, 3, PAL.white); break;
    case 'frost':   // 霜结：六出冰花
      p.line(8, 2, 8, 14, c1); p.line(3, 5, 13, 11, c1); p.line(13, 5, 3, 11, c1);
      p.rect(7, 7, 3, 3, c2);
      p.set(8, 4, PAL.white); p.set(8, 12, PAL.white);
      p.set(5, 7, PAL.white); p.set(11, 7, PAL.white);
      p.set(5, 10, PAL.white); p.set(11, 10, PAL.white); break;
    case 'knot':    // 符文结：两个交叠的三角
      p.line(8, 3, 13, 12, c1); p.line(13, 12, 3, 12, c1); p.line(3, 12, 8, 3, c1);
      p.line(8, 7, 11, 11, c2); p.line(11, 11, 5, 11, c2); p.line(5, 11, 8, 7, c2);
      p.set(8, 2, PAL.white); break;
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

/* 初始化：把所有素材烘焙成 canvas 缓存
 *
 * 风格可插拔：素材是**读 PAL 现画**的位图，所以换风格必须重建。
 * 实测重建全部素材约 **122 ms**（7 帧多，见 `dev/probe/_probe_pal.js`）——
 * 直接实时换会卡一下。但因为
 *   ① 同种子重复绘制结果一致（探针⑤已验证）→ 缓存安全
 *   ② 单份素材只有 107 张 canvas / 0.23 MB → 缓存极便宜
 *   ③ 27 条路径最多出现 3 种风格
 * 所以采用「**按风格 key 缓存烘焙结果**」：每个风格只烤一次，换回来直接命中。
 *
 * ⚠️ `buildSprites()` 不带参数时烤的是**当前激活色板**（`STYLE_CUR` / `STYLE_SEG`），
 * 保持旧调用点（`boot()`）不用改。带 style 参数则先切色板再烤。
 *
 * ⚠️ **两条分支都必须走 `setStyle`**（2026-09-23 探针 P7 撞出来的）：
 * 无参分支若直接读 `STYLE_CUR`/`STYLE_SEG` 去查缓存而不调 `setStyle`，
 * 一旦外部（比如上一次 `buildSprites('cn', 2)`）已经把 `PAL_ACTIVE` 换成别的色板，
 * 就会出现「缓存的键是 cn_2、实际画的是 cn_1 的色板」这种错位 —— 而它**不报错**，
 * 只在画面上表现为「有的素材没跟着换色」。
 * 让 `setStyle` 成为**唯一**改 `PAL_ACTIVE` 的入口，两边就不会再分叉。
 */
const SPR_CACHE = new Map();

function buildSprites(style, seg) {
  const st = style || STYLE_CUR;
  const sg = style ? (seg | 0) : STYLE_SEG;
  const key = st + '_' + sg;
  setStyle(st, sg);                     // 先保证色板与 key 一致，再查缓存
  const hit = SPR_CACHE.get(key);
  if (hit) {
    for (const k of Object.keys(SPR)) delete SPR[k];
    Object.assign(SPR, hit);
    return key;
  }

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

  /* 妖物 / 尊者 / 摆件的素材**按世界风格换**（见上面的 STYLE_ART）。
     中式是「默认那一套」，原文照旧；北欧那套惰性构建，
     然后顶掉摆件的同名键 —— 于是 Prop 的绘制、房间生成、存档都不用改。 */
  const ART = STYLE_ART[st] || null;
  SPR.enemies = ART ? {} : {
    xiesui: [drawXieSui(0), drawXieSui(1)],
    chanchu: [drawChanChu(0), drawChanChu(1)],
    xuefu: [drawXueFu(0), drawXueFu(1)],
    guixiu: [drawGuiXiu(0), drawGuiXiu(1)],
    yinsha: [drawYinSha(0, false), drawYinSha(1, false)],
    yinsha_s: [drawYinSha(0, true), drawYinSha(1, true)],
    shikui: [drawShiKui(0), drawShiKui(1)],
    jianling: [drawJianLing(0), drawJianLing(1)],
    jianling_s: [drawJianLingS(0), drawJianLingS(1)],
    xuanguang: [drawXuanGuang(0), drawXuanGuang(1)],
    tiehun: [drawTieHun(0), drawTieHun(1)],
    bengyao: [drawBengYao(0), drawBengYao(1)],
    xuanjia: [drawXuanJia(0), drawXuanJia(1)],
    yingmo: [drawYingMo(0), drawYingMo(1)]
  };
  if (ART) for (const k in ART.enemy) SPR.enemies[k] = ART.enemy[k]();
  SPR.boss = ART ? {} : {
    xuemo: [drawBossXueMo(0), drawBossXueMo(1)],
    baigu: [drawBossBaiGu(0), drawBossBaiGu(1)],
    liesha: [drawBossLieSha(0), drawBossLieSha(1)],
    lunhui: [drawBossLunHui(0), drawBossLunHui(1)],
    zhulong: [drawBossZhuLong(0), drawBossZhuLong(1)]
  };
  if (ART) for (const k in ART.boss) SPR.boss[k] = ART.boss[k]();

  SPR.sword = drawFeiJian();
  SPR.jujian = drawJuJian();
  SPR.saber = drawSaber();
  SPR.riftwave = drawRiftWave();
  SPR.bolt = {
    blood: drawBolt(PAL.red, PAL.redD, 'orb'),
    talisman: drawBolt(PAL.gold, PAL.goldL, 'talisman'),
    flame: drawBolt(PAL.purple, PAL.fire, 'flame'),
    ice: drawBolt(PAL.cyan, PAL.cyanD, 'ice'),
    orb: drawBolt(PAL.green, PAL.greenD, 'orb'),
    iron: drawBolt(PAL.greyD, PAL.stoneLo, 'iron')
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

  /* 摆件：北欧那些在**标准摆件全部烤完之后**才顶掉同名键 ——
     顶早了会被上面的赋值覆盖回去（而且不报错，只是「换了风格摆件没变」）。 */
  if (ART && ART.prop) for (const k in ART.prop) SPR[k] = ART.prop[k]();

  /* 烤完入缓存。存的是 SPR 引用的一份深拷贝（数组也复制，避免外部改动串味） */
  const snap = {};
  for (const k of Object.keys(SPR)) {
    const v = SPR[k];
    snap[k] = Array.isArray(v) ? v.slice() : (v && typeof v === 'object' && !(v instanceof HTMLCanvasElement))
      ? Object.fromEntries(Object.entries(v).map(([kk, vv]) => [kk, Array.isArray(vv) ? vv.slice() : vv]))
      : v;
  }
  SPR_CACHE.set(key, snap);
  return key;
}

/* 换风格：切色板 + 命中/重建烘焙。返回是否为缓存命中（用于断言与性能观测） */
function switchStyle(style, seg) {
  const key = style + '_' + (seg | 0);
  const hit = SPR_CACHE.has(key);
  buildSprites(style, seg);
  return hit;
}
