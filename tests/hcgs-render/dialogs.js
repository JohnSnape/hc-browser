// dialogs.js FONT CAPDIR [name ...] -- draw HyperCard's answer/ask dialogs with lib/hcdialog.js and compare them,
// pixel for pixel, with captures of HyperCard IIGS 1.1 (CAPDIR/<name>/1.rgb and last.rgb, made by dialogs.sh: the
// first and the final shot of the same waiting dialog; either can catch GSport mid-redraw, so the best one counts).
// FONT = your Shaston 8 file. Neither the captures nor the font enter the repo.
'use strict';
const fs = require('fs'), path = require('path');
for (const f of ['shr', 'font', 'hcfile', 'card', 'hcdialog']) require(`../../lib/${f}.js`);
const CASES = require('./dialogs.json');
const [fontFile, dir, ...only] = process.argv.slice(2);
const font = FONT.parse(fs.readFileSync(fontFile));
let bad = 0;
for (const c of CASES) {
  if (only.length && !only.includes(c.name)) continue;
  const shots = ['1.rgb', 'last.rgb'].map(f => path.join(dir, c.name, f)).filter(f => fs.existsSync(f));
  if (!shots.length) { console.log(`${c.name}: no capture`); continue; }
  const d = c.kind === 'ask' ? HCDIALOG.ask(c.text, c.default, font, c.password) : HCDIALOG.answer(c.text, c.buttons || ['OK'], font);
  const f = new CARD.Frame(SHR.parseSet('system')); HCDIALOG.draw(f, d);
  const rgba = CARD.toRGBA(f);
  const r = shots.map(truth => compare(fs.readFileSync(truth), rgba, d)).sort((a, b) => a.n - b.n)[0];
  if (r.msg) bad++;
  console.log(`${c.name}: ${r.msg || 'identical'}${r.pointer ? ' (pointer ignored)' : ''}`);
}
function compare(A, rgba, d) {
  // differences outside the dialog in a box no bigger than 12 x 14 are the mouse pointer (wherever it was left)
  const out = { n: 0, box: [640, 200, -1, -1] }, inn = { n: 0, box: [640, 200, -1, -1] };
  const D = [118, 35, 522, d.bottom + 5];
  for (let y = 0; y < 200; y++) for (let x = 0; x < 640; x++) {
    const i = 3 * (y * 640 + x), q = 4 * (y * 640 + x);
    if (A[i] === rgba[q] && A[i + 1] === rgba[q + 1] && A[i + 2] === rgba[q + 2]) continue;
    const s = x >= D[0] && x < D[2] && y >= D[1] && y < D[3] ? inn : out, b = s.box;
    s.n++; b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
  }
  const pointer = out.n && out.box[2] - out.box[0] < 12 && out.box[3] - out.box[1] < 14;
  const all = pointer ? [inn] : [inn, out].filter(s => s.n);
  const msg = all.filter(s => s.n).map(s => `${s.n} pixels differ, box x ${s.box[0]}-${s.box[2]}, y ${s.box[1]}-${s.box[3]}`).join('; ');
  return { n: all.reduce((k, s) => k + s.n, 0), msg, pointer };
}
process.exitCode = bad ? 1 : 0;
