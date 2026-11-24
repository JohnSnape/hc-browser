// find-text.js screen.rgb font-file "text" -- find a line of text drawn by HyperCard IIGS in a 640x200 RGB
// capture (see png2raw.ps1 in the emulator rig) and check it pixel for pixel against lib/font.js.
// Every predicted ink pixel must be black and every other pixel in the text's box must be white.
require('../../lib/font.js');
const F = globalThis.FONT, fs = require('fs');
const [rgbFile, fontFile, text] = process.argv.slice(2);
const px = fs.readFileSync(rgbFile), f = F.parse(new Uint8Array(fs.readFileSync(fontFile)));
const ink = new Set(); let minX = Infinity, maxX = -Infinity;
F.draw(f, F.encode(text), 0, (x, y) => { ink.add(x + ',' + y); minX = Math.min(minX, x); maxX = Math.max(maxX, x); });
const top = -f.ascent, bot = f.descent - 1; // rows relative to the baseline
const black = (x, y) => { const i = (y * 640 + x) * 3; return px[i] < 60 && px[i + 1] < 60 && px[i + 2] < 60; };
const white = (x, y) => { const i = (y * 640 + x) * 3; return px[i] > 200 && px[i + 1] > 200 && px[i + 2] > 200; };
let best = null;
for (let by = -top; by + bot < 200; by++) for (let px0 = -minX; px0 + maxX < 640; px0++) {
  let good = 0, bad = 0;
  for (let y = top; y <= bot && bad < 3; y++) for (let x = minX; x <= maxX && bad < 3; x++) {
    const want = ink.has(x + ',' + y), X = px0 + x, Y = by + y;
    if (want ? black(X, Y) : white(X, Y)) good++; else bad++;
  }
  if (bad === 0 && (!best || good > best.good)) best = { x: px0, y: by, good };
}
const total = (maxX - minX + 1) * (bot - top + 1);
console.log(best ? `"${text}" found with the pen at ${best.x},${best.y} (baseline): ${best.good} of ${total} pixels match, 0 differ (${ink.size} ink pixels)`
  : `"${text}": no exact match on screen`);
process.exit(best ? 0 : 1);
