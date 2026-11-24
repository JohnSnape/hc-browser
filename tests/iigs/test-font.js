// node test-font.js <font file>...  -- round-trip IIGS fonts through lib/font.js.
// For each font: parse, write, parse again; every character must keep its advance, left edge and pixels
// (compared as ink relative to the pen, so blank image columns don't matter), and the header and metrics must
// survive. Also prints the bytes that differ from the original file, if any, and draws a sample string.
require('../../lib/font.js');
const F = globalThis.FONT, fs = require('fs');
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const ink = (f, g) => { const s = new Set(); for (let y = 0; y < F.height(f); y++) for (let x = 0; x < g.w; x++) if (g.bits[y * g.w + x]) s.add((g.left + x) + ',' + y); return [...s].sort().join(' '); };
for (const file of process.argv.slice(2)) {
  const orig = new Uint8Array(fs.readFileSync(file)), a = F.parse(orig), out = F.write(a), b = F.parse(out);
  const name = file.split(/[\\/]/).pop();
  ok(a.name === b.name && a.family === b.family && a.size === b.size && a.ascent === b.ascent && a.descent === b.descent && a.leading === b.leading, `${name}: header kept (${a.name}, family ${a.family}, size ${a.size}, ascent ${a.ascent}, descent ${a.descent})`);
  let bad = 0, n = 0;
  for (let c = 0; c < 256; c++) { const g = a.glyphs[c], h = b.glyphs[c]; if (!g && !h) continue; n++; if (!g || !h || g.adv !== h.adv || ink(a, g) !== ink(b, h)) bad++; }
  if (ink(a, a.missing) !== ink(b, b.missing) || a.missing.adv !== b.missing.adv) bad++;
  ok(bad === 0, `${name}: ${n} characters + missing symbol identical after write/parse`);
  const m = F.metrics(a);
  ok(m.kernMax === a._orig.kernMax && m.widMax === a._orig.widMax, `${name}: kernMax ${m.kernMax} / widMax ${m.widMax} as Apple stored them (${a._orig.kernMax} / ${a._orig.widMax})`);
  // bytes QuickDraw never reads: strike padding past the last image column, and the terminator owTable entry
  const dvo = new DataView(orig.buffer, orig.byteOffset), mf = 1 + orig[0] + 2 * dvo.getUint16(1 + orig[0], true);
  const rw = dvo.getUint16(mf + 24, true), fh = dvo.getInt16(mf + 14, true), nc = a._orig.last - a._orig.first + 3;
  const strike = mf + 26, loc = strike + rw * 2 * fh, ow = loc + 2 * nc, used = dvo.getUint16(loc + 2 * (nc - 1), true);
  const unused = i => (i >= strike && i < loc && ((i - strike) % (rw * 2)) * 8 + 8 > used) // byte holds padding columns
    || (i >= ow + 2 * (nc - 1) && i < ow + 2 * nc);                                          // terminator entry
  let diff = 0, real = 0; for (let i = 0; i < Math.max(orig.length, out.length); i++) if (orig[i] !== out[i]) { diff++; if (!unused(i)) real++; }
  ok(real === 0, `${name}: untouched font writes back byte for byte` + (diff ? ` (except ${diff} bytes QuickDraw never reads: strike padding / terminator entry)` : ''));
  console.log(`     bytes: original ${orig.length}, written ${out.length}, ${diff} differ` + (a._orig.fRectWidth !== m.fRectWidth ? ` (fRectWidth ${a._orig.fRectWidth} -> ${m.fRectWidth})` : '') + (a._orig.fbrExtent !== m.fbrExtent ? ` (fbrExtent ${a._orig.fbrExtent} -> ${m.fbrExtent})` : ''));
  // sample text
  const rows = []; for (let y = 0; y < F.height(a); y++) rows.push(new Array(60).fill('.'));
  F.draw(a, F.encode('Agy!'), 1, (x, y) => { if (x >= 0 && x < 60) rows[y + a.ascent][x] = '#'; });
  console.log(rows.map(r => '     ' + r.join('')).join('\n'));
}
const nf = F.create('Test', 12, 9, 3); nf.glyphs[65] = { adv: 6, left: 0, w: 5, bits: new Uint8Array(5 * 12).fill(1) };
const rt = F.parse(F.write(nf));
ok(rt.glyphs[65].adv === 6 && rt.glyphs[65].w === 5 && rt.glyphs[66].adv === nf.glyphs[66].adv && rt.missing.w === nf.missing.w, 'a new font from scratch writes and reads back');
console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
