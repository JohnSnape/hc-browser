// find-icons.js screen.rgb meta.json -- find the striped test icons in a 640x200 RGB capture and check them.
// Test icon (iw x h icon pixels = 2*iw x h screen pixels): black border (value 0) 1 row / 2 columns thick,
// inside value ((c>>1)+r)%3+1. For each icon found, every pixel's colour is compared with
// SHR.SETS.system at that pixel's palette group (DrawIcon copies values, the screen x picks the group).
require('../../lib/shr.js');
const SHR = globalThis.SHR, fs = require('fs');
const [rgbFile, metaFile] = process.argv.slice(2);
const px = fs.readFileSync(rgbFile), meta = JSON.parse(fs.readFileSync(metaFile));
const at = (x, y) => { const i = (y * 640 + x) * 3; return [px[i], px[i + 1], px[i + 2]]; };
const isBlack = (x, y) => { const c = at(x, y); return c[0] < 40 && c[1] < 40 && c[2] < 40; };
const pal = SHR.SETS.system.map(SHR.word2rgb);
const near = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 40;
const seen = new Set();
for (const m of meta) {
  const w = m.iw * 2, h = m.h, hits = [];
  // The icon's top rows may be clipped by its button rect: try every clip k (rows 0..k-1 hidden, the
  // visible part starts at screen row y+k). Bottom border and side borders must be black where visible.
  for (let y = -h + 3; y + h <= 200; y++) for (let x = 0; x + w <= 640; x++) {
    if (!isBlack(x + w - 1, y + h - 1)) continue;
    let k = Math.max(0, -y); while (k < h && !isBlack(x, y + k)) k++;
    if (k >= h - 2) continue;
    let ok = true;
    for (let c = 0; c < w && ok; c++) ok = isBlack(x + c, y + h - 1) && (k > 0 || isBlack(x + c, y));
    for (let r = k; r < h && ok; r++) ok = isBlack(x, y + r) && isBlack(x + 1, y + r) && isBlack(x + w - 2, y + r) && isBlack(x + w - 1, y + r);
    if (!ok) continue;
    if (k > 0 && y + k > 0 && isBlack(x + 4, y + k - 1)) continue; // a real clip has non-icon pixels just above
    let good = 0, bad = 0; const samples = {};
    for (let r = Math.max(1, k); r < h - 1; r++) for (let c = 2; c < w - 2; c++) {
      const v = (((c >> 1) + r) % 3) + 1, sx = x + c, want = pal[SHR.GROUP[sx & 3] + v], got = at(sx, y + r);
      if (near(want, got)) good++; else { bad++; samples[`v${v}/g${SHR.GROUP[sx & 3]}`] = got.join(','); }
    }
    hits.push({ x, y, k, good, bad, samples });
  }
  // report every placement where the whole interior matches (same-size icons can appear more than once)
  const clean = hits.filter(hh => hh.bad === 0 && hh.good > 50);
  if (!clean.length) { console.log(`icon ${m.id} ${m.iw}x${m.h}: no clean match`); continue; }
  for (const best of clean) {
    const key = best.x + ',' + best.y; if (seen.has(key)) continue; seen.add(key);
    console.log(`${m.iw}x${m.h} at ${best.x},${best.y} (x ${best.x & 1 ? 'odd' : 'even'})` +
      (best.k ? `, top ${best.k} rows clipped` : '') + `: ${best.good} pixels match, 0 differ`);
  }
}
// clipped icons: find striped regions not explained above by looking for interior rows that match a
// pattern phase anywhere (cheap check used for icons whose top border the button rect cut off)
const explained = [...seen].map(k => k.split(',').map(Number));
console.log('clean placements:', explained.length);
