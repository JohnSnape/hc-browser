// node check-windows.js <Shaston.08> <program fork> <dump folder> <window IDs in CTLTEST order...>
// Draws each window's frame with lib/dialog.js and compares the frame ring (the window's box minus its content
// rectangle; the content's controls are checked by check-controls.js) with CTLTEST's dumps. Pixels outside the
// screen's desktop area (lines 0-12, kept for the menu bar) are not compared.
const fs = require('fs'), path = require('path');
const LIB = path.join(__dirname, '..', '..', '..', 'lib');
for (const m of ['shr.js', 'font.js', 'rsrc.js', 'menu.js', 'control.js', 'dialog.js']) require(path.join(LIB, m));
const { pixels } = require('./shr2png.js');
const [fontFile, forkFile, dir, ...ids] = process.argv.slice(2);
const font = FONT.parse(new Uint8Array(fs.readFileSync(fontFile))), fork = new RSRC.Fork(new Uint8Array(fs.readFileSync(forkFile)));
const wins = CONTROL.windows(fork); let all = 0, allOk = 0;
ids.map(x => parseInt(x, 16)).forEach((id, i) => {
  const w = wins.find(x => x.resID === id); if (!w) return;
  const scr = pixels(fs.readFileSync(path.join(dir, 'SHR' + String.fromCharCode(65 + i) + '.bin')));
  const cv = MENU.canvas(640, 200), r = DIALOG.drawWindow(cv, w, null, font), [T, L, B, R] = r.box, c = r.layout;
  let n = 0, ok = 0, first = null;
  for (let y = Math.max(13, T); y < Math.min(200, B); y++) for (let x = Math.max(0, L); x < Math.min(640, R); x++) {
    if (y >= c.T && y < c.B && x >= c.L && x < c.R) continue;
    n++; if (cv.px[y * 640 + x] === scr[y * 640 + x]) ok++; else if (!first) first = x + ',' + y;
  }
  all += n; allOk += ok;
  console.log(`window ${id.toString(16)} frame $${w.frame.toString(16)}${w.title ? ' ' + JSON.stringify(w.title) : ''}: ${ok} of ${n} frame pixels match` + (first ? ' (first difference at ' + first + ')' : ''));
});
console.log(`all: ${allOk} of ${all}`); process.exit(all === allOk ? 0 : 1);
