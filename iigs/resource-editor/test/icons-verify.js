#!/usr/bin/env node
/* icons-verify.js FORK [SHOT.rgb ...] -- checks what the Icons card wrote (icons.hts) with the
 * project's own libraries, and what it showed on the IIGS screen.
 *   FORK: Test.Icons' resource fork, extracted from the disk after the run.
 *   SHOT: 640x200 RGB captures (png2rgb.ps1) taken while icon 210 was on the Icons card.
 * Resource checks: IDs and names, sorted index, icon 200 untouched, 210 = 200 with the test's
 * edits (pixel for pixel through SHR.iconToPixels, byte for byte against SHR.iconFromPixels),
 * 211 = the small black-and-white icon drawn from scratch, 212 deleted with its name.
 * Screen checks: the DrawIcon preview and the editing grid, pixel for pixel, against the
 * System color set (SHR.SETS.system, SHR.GROUP). */
'use strict';
const fs = require('fs'), path = require('path');
require(path.join(__dirname, '../../../lib/shr.js'));
require(path.join(__dirname, '../../../lib/rsrc.js'));
const { sample } = require('./icons-make.js');
const SHR = globalThis.SHR, RSRC = globalThis.RSRC;
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fails++; };

const [forkFile, ...shots] = process.argv.slice(2);
const k = new RSRC.Fork(fs.readFileSync(forkFile));
const icons = k.list(0x8001), names = k.names(0x8001);
check(icons.map(r => r.id).join() === '200,201,210,211', 'icon IDs are 200,201,210,211: ' + icons.map(r => r.id).join());
const idx = k.list(); let sorted = true;
for (let i = 1; i < idx.length; i++) if (idx[i].type < idx[i - 1].type || (idx[i].type === idx[i - 1].type && idx[i].id <= idx[i - 1].id)) sorted = false;
check(sorted, 'resource index sorted by type, then ID');
check(names.get(200) === 'Sample' && names.get(201) === 'Mono' && names.get(210) === 'Edited' && names.get(211) === 'Tiny', 'names: ' + [...names].map(([i, n]) => i + '=' + n).join(' '));
check(!names.has(212), 'deleted icon 212 left no name');

// 200 untouched
const s = sample();
const orig = SHR.iconFromPixels(s.val, s.mask, s.w, s.h, 0x8000);
check(Buffer.from(k.get(0x8001, 200)).equals(Buffer.from(orig)), 'icon 200 unchanged, byte for byte');

// 210 = 200 + edits (the grid stores no value under a clear pixel: 0 there)
const want = { val: Uint8Array.from(s.val), mask: Uint8Array.from(s.mask) };
const set = (c, r, v) => { const i = r * s.w + c; if (v === '.') { want.mask[i] = 0; want.val[i] = 0; } else { want.mask[i] = 1; want.val[i] = v; } };
for (let i = 0; i < want.val.length; i++) if (!want.mask[i]) want.val[i] = 0;
set(3, 2, 2); set(5, 1, '.'); set(19, 7, 3); set(0, 0, 0); set(10, 4, 1);
const got = SHR.iconToPixels(k.get(0x8001, 210));
let diff = 0;
for (let i = 0; i < want.val.length; i++) if (got.mask[i] !== want.mask[i] || (want.mask[i] && got.val[i] !== want.val[i])) diff++;
check(got.w === 20 && got.h === 8 && got.type === 0x8000, `icon 210 is 20x8 screen pixels, color (got ${got.w}x${got.h} $${got.type.toString(16)})`);
check(diff === 0, `icon 210: ${want.val.length - diff} of ${want.val.length} pixels as edited`);
check(Buffer.from(k.get(0x8001, 210)).equals(Buffer.from(SHR.iconFromPixels(want.val, want.mask, 20, 8, 0x8000))), 'icon 210 equals lib/shr.js iconFromPixels of the same pixels, byte for byte');

// 211: 3 x 2 icon pixels, black and white, drawn from a clear grid
const t = SHR.iconToPixels(k.get(0x8001, 211));
const tv = new Uint8Array(12), tm = new Uint8Array(12);
tv[0] = 3; tm[0] = 1; tv[5 + 6] = 3; tm[5 + 6] = 1; tv[2] = 1; tm[2] = 1;
check(t.w === 6 && t.h === 2 && t.type === 0, `icon 211 is 6x2, black and white (got ${t.w}x${t.h} $${t.type.toString(16)})`);
check(Buffer.from(k.get(0x8001, 211)).equals(Buffer.from(SHR.iconFromPixels(tv, tm, 6, 2, 0))), 'icon 211 equals iconFromPixels, byte for byte');

// screen
if (shots.length) {
  const pal = SHR.SETS.system.map(SHR.word2rgb);
  const COLPAT = [0x00, 0x44, 0x88, 0xFF, 0x00, 0x11, 0x22, 0xFF];
  const colorOf = (x, byte) => pal[SHR.GROUP[x & 3] + ((byte >> (6 - 2 * (x & 3))) & 3)];
  const WHITE = pal[SHR.GROUP[0] + 3], BLACK = pal[SHR.GROUP[0]];
  let best = null;
  for (const f of shots) {
    const px = fs.readFileSync(f), at = (x, y) => { const i = (y * 640 + x) * 3; return [px[i], px[i + 1], px[i + 2]]; };
    const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
    // preview: white frame interior 452..570 x 34..80, icon 210 by DrawIcon at 460,40
    let pOk = 0, pBad = 0;
    for (let y = 34; y <= 80; y++) for (let x = 452; x <= 570; x++) {
      let e = WHITE; const c = x - 460, r = y - 40;
      if (c >= 0 && c < 20 && r >= 0 && r < 8 && want.mask[r * 20 + c]) e = pal[SHR.GROUP[x & 3] + want.val[r * 20 + c]];
      if (same(at(x, y), e)) pOk++; else pBad++;
    }
    // grid: 12 x 6 cells from 12,36; interiors 11 x 5, the last column and row of a cell black
    let gOk = 0, gBad = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 20; c++) {
      const i = r * 20 + c; if (!want.mask[i]) continue;      // clear cells use a dot pattern
      const byte = COLPAT[(c & 1) * 4 + want.val[i]];
      for (let dy = 0; dy < 6; dy++) for (let dx = 0; dx < 12; dx++) {
        const x = 12 + c * 12 + dx, y = 36 + r * 6 + dy;
        const e = (dx === 11 || dy === 5) ? BLACK : colorOf(x, byte);
        if (same(at(x, y), e)) gOk++; else gBad++;
      }
    }
    const r = { f: path.basename(f), pOk, pBad, gOk, gBad };
    if (!best || pBad + gBad < best.pBad + best.gBad) best = r;
  }
  console.log(`best capture ${best.f}`);
  check(best.pBad === 0, `IIGS preview (DrawIcon) matches lib/shr.js: ${best.pOk} of ${best.pOk + best.pBad} pixels`);
  check(best.gBad === 0, `IIGS editing grid shows the predicted colors: ${best.gOk} of ${best.gOk + best.gBad} pixels`);
}
console.log(fails ? `${fails} check(s) failed` : 'all checks passed');
process.exit(fails ? 1 : 0);
