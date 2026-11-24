// find-cursor.js screen.rgb cursor-record -- find a cursor's opaque pixels (mask 3) in a 640x200 RGB capture.
// Each opaque pixel shows value (3 XOR image) in the System palette at its screen column's palette group.
// Reports where the cursor's top-left and hot spot are; see-through and invert pixels are not checked.
require('../../lib/shr.js'); require('../../lib/cursor.js');
const { SHR, CURSOR } = globalThis, fs = require('fs');
const [rgbFile, curFile] = process.argv.slice(2);
const px = fs.readFileSync(rgbFile), c = CURSOR.parse(new Uint8Array(fs.readFileSync(curFile)));
const pal = SHR.SETS.system.map(SHR.word2rgb), opaque = [];
for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) { const k = y * c.w + x; if (c.mask[k] === 3) opaque.push([x, y, 3 ^ c.img[k]]); }
const near = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 40;
let best = null;
for (let y = -c.h + 1; y < 200; y++) for (let x = -c.w + 1; x < 640; x++) {
  let good = 0, bad = 0, seen = 0;
  for (const [cx, cy, v] of opaque) {
    const sx = x + cx, sy = y + cy; if (sx < 0 || sy < 0 || sx >= 640 || sy >= 200) continue; seen++;
    const i = (sy * 640 + sx) * 3; if (near(pal[SHR.GROUP[sx & 3] + v], [px[i], px[i + 1], px[i + 2]])) good++; else if (++bad > 2) break;
  }
  if (bad === 0 && seen >= opaque.length * 0.5 && (!best || good > best.good)) best = { x, y, good, seen };
}
console.log(best ? `cursor found: top-left ${best.x},${best.y}, hot spot at ${best.x + c.hotX},${best.y + c.hotY}; ${best.good} of ${opaque.length} opaque pixels on screen match, 0 differ`
  : 'cursor not found');
process.exit(best ? 0 : 1);
