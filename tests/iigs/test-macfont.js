// node test-macfont.js <Mac font files...>  -- every FONT/NFNT in each file (MacBinary, AppleSingle/Double or a raw
// resource fork) is converted to a IIGS font and checked:
//   1. the IIGS file's strike bytes are byte-identical to the Mac resource's strike;
//   2. every character's pixels, as lib/font.js reads them from the IIGS file, equal the Mac strike decoded
//      directly as big-endian words (leftmost pixel = most significant bit), with the same offset and advance;
//   3. the converted font writes back and reads again unchanged (FONT.write -> FONT.parse).
const fs = require('fs'), path = require('path');
const LIB = path.join(__dirname, '..', '..', 'lib');
require(path.join(LIB, 'font.js')); require(path.join(LIB, 'macfont.js'));
let fails = 0, count = 0;
for (const file of process.argv.slice(2)) {
  const u = MACFONT.unwrap(fs.readFileSync(file), file), fonts = MACFONT.listFonts(MACFONT.readFork(u.fork));
  console.log(`${path.basename(file)}: ${u.container}, "${u.name}", ${fonts.length} bitmap fonts`);
  for (const e of fonts) {
    count++; const tag = `  ${e.type} ${e.id} ${e.name} ${e.size} ${MACFONT.styleText(e.style)}`;
    try {
      const c = MACFONT.convert(e), m = e.bytes, f = c.font, be = o => m[o] << 8 | m[o + 1];
      const first = be(2), last = be(4), fh = be(14), rw = be(24), n = last - first + 3, strike = 26 + rw * 2 * fh;
      const sameStrike = Buffer.from(c.bytes.subarray(c.strikeAt, c.strikeAt + c.strikeLen)).equals(Buffer.from(m.subarray(26, strike)));
      let bad = 0;
      for (let code = first; code <= last + 1; code++) {
        const i = code - first, loc = be(strike + 2 * i), w = be(strike + 2 * i + 2) - loc, ow = be(strike + 2 * n + 2 * i);
        const g = code === last + 1 ? f.missing : f.glyphs[code];
        if (ow === 0xFFFF) { if (g && code <= last) bad++; continue; }
        if (!g || g.w !== w || g.adv !== (ow & 255) || g.left !== (ow >> 8) + s16(be(8))) { bad++; continue; }
        for (let y = 0; y < fh; y++) for (let x = 0; x < w; x++) if (g.bits[y * w + x] !== MACFONT.macPixel(m, loc + x, y)) bad++;
      }
      const again = FONT.parse(FONT.write(f)), round = JSON.stringify(again.glyphs) === JSON.stringify(f.glyphs);
      const ok = sameStrike && !bad && round; if (!ok) fails++;
      console.log(`${ok ? 'ok  ' : 'FAIL'}${tag}: family ${f.family}, ascent ${f.ascent}, descent ${f.descent}, strike ${sameStrike ? 'identical' : 'DIFFERS'}, ${bad} pixel/metric mismatches, rewrite ${round ? 'same' : 'DIFFERS'}`);
    } catch (err) { fails++; console.log(`FAIL${tag}: ${err.message}`); }
  }
}
function s16(v) { return v << 16 >> 16; }
console.log(fails ? `${fails} of ${count} failed` : `all ${count} passed`);
process.exit(fails ? 1 : 0);
