// node decode.js SHRDUMP -- print the 640-mode pixel values (0-3) around each test icon ICONTEST.S drew.
// Background is 3 (white). '.' marks a 3 so the icon stands out.
const fs = require('fs');
const shr = fs.readFileSync(process.argv[2]);
const px = (x, y) => (shr[y * 160 + (x >> 2)] >> (6 - 2 * (x & 3))) & 3;
const shots = [['A opaque', 100, 20], ['A opaque', 101, 30], ['A opaque', 102, 40], ['A opaque', 103, 50],
  ['B checker mask', 100, 70], ['C black&white', 100, 90], ['A selected', 100, 110]];
console.log('SCB line 20 = $' + shr[32000 + 20].toString(16), ' palette 0 =', [...Array(16)].map((_, i) => (shr[32256 + 2 * i] | shr[32257 + 2 * i] << 8).toString(16).padStart(3, '0')).join(' '));
for (const [name, x0, y0] of shots) {
  console.log(`\n${name} at ${x0},${y0}   (columns ${x0 - 4}..${x0 + 39}; | marks x0)`);
  for (let y = y0 - 1; y < y0 + 5; y++) {
    let s = '';
    for (let x = x0 - 4; x < x0 + 40; x++) { if (x === x0) s += '|'; const v = px(x, y); s += v === 3 ? '.' : v; }
    console.log(String(y).padStart(4) + ' ' + s);
  }
}
