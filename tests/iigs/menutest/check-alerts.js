// node check-alerts.js <Shaston.08> <Sys.Resources fork> <dump folder>  -- draws ALRTEST's nine alert strings
// with lib/dialog.js and compares every pixel of each alert's frame rectangle with its screen dump (SHRA..SHRI).
const fs = require('fs'), path = require('path');
const LIB = path.join(__dirname, '..', '..', '..', 'lib');
for (const m of ['shr.js', 'font.js', 'rsrc.js', 'menu.js', 'control.js', 'dialog.js']) require(path.join(LIB, m));
const { pixels } = require('./shr2png.js');
const [fontFile, sysFile, dir] = process.argv.slice(2);
const font = FONT.parse(new Uint8Array(fs.readFileSync(fontFile))), sys = new RSRC.Fork(new Uint8Array(fs.readFileSync(sysFile)));
const icons = {}; for (let n = 2; n <= 6; n++) icons[n] = sys.get(0x8001, 0x07FF0000 + n);
// the strings in ALRTEST.S
const src = fs.readFileSync(path.join(__dirname, 'ALRTEST.S'), 'latin1');
const strings = [...src.matchAll(/^A\d\s+asc\s+'(.*)',00/gm)].map(m => m[1] + '\0');
let all = 0, allOk = 0;
strings.forEach((s, i) => {
  const a = DIALOG.parseAlert(s), cv = MENU.canvas(640, 200), r = DIALOG.drawAlert(cv, a, font, icons);
  const scr = pixels(fs.readFileSync(path.join(dir, 'SHR' + String.fromCharCode(65 + i) + '.bin')));
  const [T, L, B, R] = r.box; let n = 0, ok = 0, first = null;
  for (let y = T; y < B; y++) for (let x = L; x < R; x++) { n++; if (cv.px[y * 640 + x] === scr[y * 640 + x]) ok++; else if (!first) first = x + ',' + y; }
  all += n; allOk += ok;
  console.log(`alert ${i + 1} (size ${a.sizeCode}, ${a.icon}, ${a.buttons.length} buttons): ${ok} of ${n} pixels match` + (first ? ' (first difference at ' + first + ')' : ''));
});
console.log(`all: ${allOk} of ${all}`);
process.exit(all === allOk ? 0 : 1);
