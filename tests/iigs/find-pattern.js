// find-pattern.js screen.rgb pattern-hex x0 y0 x1 y1 -- check that a screen rectangle (640x200 RGB capture,
// screen pixels) is filled with a 32-byte QuickDraw II pattern, read as 640-mode pixels: 8 rows x 4 bytes,
// 4 two-bit pixels per byte (16 x 8 pixels), tiled over the screen. Tries every alignment and reports the best.
require('../../lib/shr.js');
const SHR = globalThis.SHR, fs = require('fs');
const [rgbFile, hex, ...r] = process.argv.slice(2);
const [x0, y0, x1, y1] = r.map(Number), px = fs.readFileSync(rgbFile), pat = Buffer.from(hex, 'hex');
const pal = SHR.SETS.system.map(SHR.word2rgb);
const near = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 40;
let best = null;
for (let dy = 0; dy < 8; dy++) for (let dx = 0; dx < 16; dx++) {
  let good = 0, bad = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const pr = (y + dy) & 7, pc = (x + dx) & 15, v = (pat[pr * 4 + (pc >> 2)] >> (6 - 2 * (pc & 3))) & 3;
    const i = (y * 640 + x) * 3; if (near(pal[SHR.GROUP[x & 3] + v], [px[i], px[i + 1], px[i + 2]])) good++; else bad++;
  }
  if (!best || good > best.good) best = { dx, dy, good, bad };
}
const n = (x1 - x0) * (y1 - y0);
console.log(`pattern check ${x0},${y0}-${x1},${y1}: best alignment dx=${best.dx} dy=${best.dy}: ${best.good} of ${n} pixels match, ${best.bad} differ`);
process.exit(best.bad === 0 ? 0 : 1);
