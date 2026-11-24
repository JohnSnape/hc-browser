// node check-font.js Shaston.08 SHR0  -- compare MENUTEST's eight character rows (codes 0-255, 32 per row,
// pen at x 10, baselines 104 + 12*row, black on white) with lib/font.js drawing the same codes.
// Every pixel in each row's box (pen start to pen end, top of the font to the bottom) is compared.
const fs = require('fs'), path = require('path');
require(path.join(__dirname, '..', '..', '..', 'lib', 'font.js'));
const { pixels } = require('./shr2png.js');
const [fontFile, dump] = process.argv.slice(2);
const f = FONT.parse(new Uint8Array(fs.readFileSync(fontFile))), scr = pixels(fs.readFileSync(dump)), h = FONT.height(f);
let total = 0, ok = 0, bad = [];
for (let row = 0; row < 8; row++) {
  const codes = []; for (let i = 0; i < 32; i++) codes.push(row * 32 + i);
  const base = 104 + 12 * row, want = new Set();
  const width = FONT.draw(f, codes, 10, (x, y) => want.add((base + y) * 640 + x));
  for (let y = base - f.ascent; y < base - f.ascent + h; y++) for (let x = 10; x < 10 + width; x++) {
    const ink = scr[y * 640 + x] === 0, exp = want.has(y * 640 + x); total++;
    if (ink === exp) ok++; else if (bad.length < 10) bad.push(`row ${row} x ${x} y ${y}: screen ${ink ? 'black' : 'white'}`);
  }
}
console.log(`${f.name} ${f.size}: ${ok} of ${total} pixels match`); if (bad.length) console.log(bad.join('\n'));
process.exit(ok === total ? 0 : 1);
