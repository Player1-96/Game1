'use strict';
/* 扫源码里所有「画到 canvas 点阵字体上」的字符串，挑出 FONT5 画不出来的字符。
   ⚠️ drawPixelText 遇到没有字形的字符会**静默跳过**（但仍推进 6px），
      所以「灵力 100/100」会渲染成「100  100」（中间那个空档就是被跳掉的中文和斜杠），
      「空格」则整串消失 —— 而这两处都不报错。这类问题只能靠扫出来。
   跑法：node dev/tools/_check_glyphs.js */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

/* 字形集合从源码里抽，避免手抄漏掉（sprites.js 给 A-Z + 空格，game.js 补数字与标点） */
function glyphSet() {
  const spr = fs.readFileSync(path.join(ROOT, 'src', 'sprites.js'), 'utf8');
  const i = spr.indexOf('const FONT5 = {');
  const j = spr.indexOf('\n};', i);
  const seg = spr.slice(i, j);
  const set = new Set();
  for (const m of seg.matchAll(/^\s*(?:'((?:[^'\\]|\\.)*)'|"([^"]*)"|([A-Za-z0-9]))\s*:/gm)) {
    set.add((m[1] ?? m[2] ?? m[3]));
  }
  const g = fs.readFileSync(path.join(ROOT, 'src', 'game.js'), 'utf8');
  for (const m of g.matchAll(/FONT5\['(.)'\]\s*=/g)) set.add(m[1]);
  return set;
}

const FILES = ['src/game.js', 'src/entities.js', 'src/fusion.js', 'src/nordic.js', 'src/dungeon.js'];
const CALLS = /\b(?:drawPixelText|Floater)\s*\(/g;

function literalsAround(src, openIdx) {
  /* 从调用左括号起，收集到匹配的右括号为止；把其中的字符串字面量都取出来 */
  let depth = 0, i = openIdx;
  const out = [];
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (!depth) break; }
    else if (c === "'" || c === '"') {
      const q = c; let s = ''; i++;
      for (; i < src.length && src[i] !== q; i++) {
        if (src[i] === '\\') { i++; s += src[i]; } else s += src[i];
      }
      out.push(s);
    }
  }
  return out;
}

const bad = [];
const glyphs = glyphSet();
for (const rel of FILES) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const lines = src.slice(0, src.length).split('\n');
  const lineOf = idx => src.slice(0, idx).split('\n').length;
  CALLS.lastIndex = 0;
  let m;
  while ((m = CALLS.exec(src))) {
    const openIdx = m.index + m[0].length - 1;
    for (const lit of literalsAround(src, openIdx)) {
      for (const ch of lit) {
        if (!glyphs.has(ch.toUpperCase()) && ch !== ' ') {
          bad.push({ file: rel, line: lineOf(m.index), text: lit, ch: ch });
          break;
        }
      }
    }
  }
}

console.log('字形集合：' + [...glyphs].sort().join(''));
if (!bad.length) {
  console.log('\n✅ 所有画到画布上的字符串都能被点阵字体渲染');
} else {
  console.log('\n❌ 有 ' + bad.length + ' 处会画不出来（或被静默吞掉）：');
  for (const b of bad) {
    console.log('  ' + b.file + ':' + b.line + '  「' + b.text + '」  卡在字符 ' + JSON.stringify(b.ch));
  }
}
process.exit(bad.length ? 1 : 0);
