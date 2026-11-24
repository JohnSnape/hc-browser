// node check-controls.js <Shaston.08> <program resource fork> <dump folder> <window IDs in CTLTEST order...>
// Draws each window's controls with lib/control.js and compares every visible control's box (plus 5 pixels
// covered pixels: the box plus the pop-up shadow or the default-button ring) with CTLTEST's screen dump of the same window (SHRA, SHRB, ...).
const fs = require('fs'), path = require('path');
const LIB = path.join(__dirname, '..', '..', '..', 'lib');
for (const m of ['shr.js', 'font.js', 'rsrc.js', 'menu.js', 'control.js']) require(path.join(LIB, m));
const { pixels } = require('./shr2png.js');
const [fontFile, forkFile, dir, ...ids] = process.argv.slice(2);
const font = FONT.parse(new Uint8Array(fs.readFileSync(fontFile))), fork = new RSRC.Fork(new Uint8Array(fs.readFileSync(forkFile)));
const wins = CONTROL.windows(fork), byType = {};
ids.map(x => parseInt(x, 16)).forEach((id, i) => {
  const w = wins.find(x => x.resID === id); if (!w || w.controlDesc !== 9) return;
  const list = CONTROL.readList(fork, w.controlRef), scr = pixels(fs.readFileSync(path.join(dir, 'SHR' + String.fromCharCode(65 + i) + '.bin')));
  const cv = MENU.canvas(640, 200), res = CONTROL.drawList(cv, list, font, w.position[1], w.position[0]);
  res.forEach((r, k) => {
    if (!r.box) return; const c = list.controls[k], [T, L, B, R] = r.box; let n = 0, ok = 0;
    for (let y = Math.max(0, T); y < Math.min(200, B); y++) for (let x = Math.max(0, L); x < Math.min(640, R); x++) { n++; if (cv.px[y * 640 + x] === scr[y * 640 + x]) ok++; }
    if (c.type === 'static text' && c.substitute) { const b = byType['static text with run-time substitution (*n): not comparable'] || (byType['static text with run-time substitution (*n): not comparable'] = { n: 1, ok: 0, controls: 0, perfect: 0, skip: true }); b.controls++; return; }
    const key = c.type + (c.type === 'simple button' ? ['', ' (default)', ' square', ' square shadow'][c.flag & 3] : '') + (c.hilite === 255 && c.type !== 'static text' ? ', inactive' : '') + (r.inferred ? ' [inferred]' : '');
    const b = byType[key] || (byType[key] = { n: 0, ok: 0, controls: 0, perfect: 0 }); b.n += n; b.ok += ok; b.controls++; if (ok === n) b.perfect++;
    if (process.env.VERBOSE && ok !== n) console.log(`  window ${id.toString(16)} ${c.type} #${c.resID.toString(16)} ${JSON.stringify(c.title || c.text || '')}: ${ok}/${n}`);
  });
});
for (const [k, b] of Object.entries(byType).sort()) if (b.skip) console.log(k + ': ' + b.controls); else console.log(`${k}: ${b.perfect}/${b.controls} controls exact, ${b.ok} of ${b.n} pixels (${(100 * b.ok / b.n).toFixed(2)}%)`);
