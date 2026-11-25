// compare.js <truth.rgb> <render.rgb> [diff.png]  -- pixel-for-pixel comparison of two 640 x 200 RGB frames.
// Prints the number of differing pixels and their bounding box; diff.png shows the truth in gray with
// differences in red (truth dark, render light) or blue (truth light, render dark), lines doubled.
'use strict';
const fs = require('fs');
const { png } = require('../iigs/menutest/shr2png.js');
const [a, b, out] = process.argv.slice(2), A = fs.readFileSync(a), B = fs.readFileSync(b);
let n = 0, x0 = 640, y0 = 200, x1 = -1, y1 = -1; const rows = {};
const img = new Uint8Array(640 * 400 * 3);
for (let y = 0; y < 200; y++) for (let x = 0; x < 640; x++) {
  const i = 3 * (y * 640 + x), la = A[i] + A[i + 1] + A[i + 2], lb = B[i] + B[i + 1] + B[i + 2];
  const same = A[i] === B[i] && A[i + 1] === B[i + 1] && A[i + 2] === B[i + 2];
  let c = same ? [Math.round(la / 3 * 0.5 + 100), Math.round(la / 3 * 0.5 + 100), Math.round(la / 3 * 0.5 + 100)] : la < lb ? [255, 0, 0] : [0, 0, 255];
  if (!same) { n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); rows[y] = (rows[y] || 0) + 1; }
  for (const yy of [2 * y, 2 * y + 1]) img.set(c, (yy * 640 + x) * 3);
}
console.log(n ? `${n} pixels differ, box x ${x0}-${x1}, y ${y0}-${y1}` : 'identical');
if (n) console.log('rows:', Object.entries(rows).slice(0, 40).map(([y, c]) => `${y}:${c}`).join(' '));
if (out) fs.writeFileSync(out, png(640, 400, img));
