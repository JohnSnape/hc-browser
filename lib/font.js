/* font.js — Apple IIGS QuickDraw II fonts (ProDOS file type $C8), for the browser and Node.
 *
 * File layout (Toolbox Ref. vol. 2 ch. 16 "Font definition"; checked byte for byte on System 6.0.4's
 * Symbol.09 and HyperCard's Monostrike.09): all integers little-endian.
 *   Pascal string: family name
 *   IIGS header:   offseToMF(=6 words) family style size version($0101) fbrExtent
 *   Mac font (MF): fontType firstChar lastChar widMax kernMax nDescent fRectWidth fRectHeight
 *                  owTLoc ascent descent leading rowWords
 *                  bitImage   rowWords*2 bytes x fRectHeight rows, 1 bit per pixel, bit 7 = leftmost
 *                  locTable   (lastChar-firstChar+3) words: strike column where each image starts
 *                  owTable    same count: $FFFF = missing, else low byte = advance width,
 *                             high byte = offset (image left edge = kernMax + offset from the pen)
 *   Code lastChar+1 is the "missing symbol", drawn for any undefined character. The file ends at owTable.
 * Model used here: { name, family, style, size, ascent, descent, leading, fontType, version,
 *   glyphs[0..255] (null = undefined), missing }, each glyph { adv, left, w, bits } where bits is
 *   w*height bytes (0/1), left = image left edge relative to the pen (negative = kerns left).
 *   Set f.edited = true after changing a font read from a file (it then gets fully recomputed metrics).
 * Classic script: sets globalThis.FONT.
 */
(function (root) {
  'use strict';
  // Mac OS Roman, codes $80-$FF (the IIGS character set). $F0 is the Apple logo (private use U+F8FF).
  const MACROMAN_HI = 'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ';
  const charOf = c => c < 32 ? '' : c < 127 ? String.fromCharCode(c) : c === 127 ? '' : MACROMAN_HI[c - 128] || '';
  const codeOf = ch => { const u = ch.charCodeAt(0); if (u < 128) return u; const i = MACROMAN_HI.indexOf(ch); return i >= 0 ? 128 + i : -1; };

  const height = f => f.ascent + f.descent;

  function parse(bytes) {
    const d = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
    const n = d[0], name = String.fromCharCode(...d.subarray(1, 1 + n));
    const h0 = 1 + n, w = i => dv.getUint16(h0 + 2 * i, true);
    const offseToMF = w(0);
    if (offseToMF < 6 || h0 + 2 * offseToMF + 26 > d.length) throw new Error('Not an IIGS font (bad header).');
    const mf = h0 + 2 * offseToMF, m = i => dv.getInt16(mf + 2 * i, true);
    const f = {
      name, family: w(1), style: w(2), size: w(3), version: w(4), fbrExtent: w(5),
      fontType: m(0) & 0xFFFF, ascent: m(9), descent: m(10), leading: m(11), glyphs: new Array(256).fill(null), missing: null,
    };
    // Big fonts (e.g. Helvetica.96) have a 7-word header, version $0105: word 6 is the HIGH word of owTLoc,
    // because the distance to owTable no longer fits in 16 bits.
    const hdr = []; for (let i = 0; i < offseToMF; i++) hdr.push(w(i));
    const first = m(1), last = m(2), kernMax = m(4), fh = m(7), rowWords = m(12) & 0xFFFF;
    const owTLoc = (dv.getUint16(mf + 16, true)) + (offseToMF >= 7 ? w(6) * 65536 : 0);
    if (fh !== f.ascent + f.descent) f.descent = fh - f.ascent; // trust the strike height
    const strike = mf + 26, nc = last - first + 3, loc = strike + rowWords * 2 * fh, ow = mf + 16 + owTLoc * 2;
    if (ow + 2 * nc > d.length || loc + 2 * nc > d.length) throw new Error('Not an IIGS font (tables outside the file).');
    const bit = (x, y) => (d[strike + y * rowWords * 2 + (x >> 3)] >> (7 - (x & 7))) & 1;
    for (let i = 0; i < nc - 1; i++) {
      const code = first + i, e = dv.getUint16(ow + 2 * i, true);
      if (e === 0xFFFF) continue;
      const a = dv.getUint16(loc + 2 * i, true), b = dv.getUint16(loc + 2 * i + 2, true), gw = Math.max(0, b - a);
      const bits = new Uint8Array(gw * fh);
      for (let y = 0; y < fh; y++) for (let x = 0; x < gw; x++) bits[y * gw + x] = bit(a + x, y);
      const g = { adv: e & 255, left: kernMax + (e >> 8), w: gw, bits };
      if (code === last + 1) f.missing = g; else if (code < 256) f.glyphs[code] = g;
    }
    if (!f.missing) f.missing = blankGlyph(f, 0);
    f._orig = { first, last, kernMax, widMax: m(3), fRectWidth: m(6), rowWords, fbrExtent: f.fbrExtent, nDescent: m(5), hdr };
    return f;
  }

  function blankGlyph(f, adv) { return { adv: adv || 0, left: 0, w: 0, bits: new Uint8Array(0) }; }

  // a new font: every printable code defined as an empty glyph, missing symbol = hollow box
  function create(name, size, ascent, descent) {
    const f = { name: name || 'Untitled', family: familyFor(name || 'Untitled'), style: 0, size: size || 12, version: 0x0101, fontType: 0x9000,
      ascent: ascent || 9, descent: descent || 3, leading: 1, glyphs: new Array(256).fill(null), missing: null };
    const h = height(f), sp = Math.max(2, Math.round(f.size / 3));
    for (let c = 32; c < 127; c++) f.glyphs[c] = { adv: c === 32 ? sp : Math.max(3, Math.round(f.size / 2)), left: 0, w: 0, bits: new Uint8Array(0) };
    const bw = Math.max(3, Math.round(f.size / 2) - 1), bh = Math.min(h, f.ascent), bits = new Uint8Array(bw * h);
    for (let y = f.ascent - bh; y < f.ascent; y++) for (let x = 0; x < bw; x++) if (y === f.ascent - bh || y === f.ascent - 1 || x === 0 || x === bw - 1) bits[y * bw + x] = 1;
    f.missing = { adv: bw + 1, left: 0, w: bw, bits };
    return f;
  }
  // a family number for a user font: stable per name, kept clear of Apple's small numbers and $FFxx
  function familyFor(name) { let h = 5381; for (const ch of name) h = (h * 33 + ch.charCodeAt(0)) >>> 0; return 1024 + (h % 30000); }

  // Font metrics the writer derives from the glyphs
  function metrics(f) {
    const all = f.glyphs.map((g, c) => g && { c, g }).filter(Boolean).concat([{ c: -1, g: f.missing }]);
    let kernMax = Infinity, right = -Infinity, widMax = 0;
    for (const { g } of all) { if (g.w) { kernMax = Math.min(kernMax, g.left); right = Math.max(right, g.left + g.w); } widMax = Math.max(widMax, g.adv); }
    if (kernMax === Infinity) { kernMax = 0; right = 0; }
    kernMax = Math.min(kernMax, 0); // the font rectangle starts at the pen or to its left
    let fbrExtent = Math.max(right, -kernMax, widMax);
    // A font read from a file keeps its stored values when they are at least as safe (Apple's are often
    // wider than needed: Symbol.09 has kernMax -2 and fbrExtent 253), so untouched fonts round-trip exactly.
    const o = f._orig;
    if (o) { if (o.kernMax < kernMax) kernMax = o.kernMax; if (o.fbrExtent > fbrExtent) fbrExtent = o.fbrExtent; }
    // fRectWidth is informational (QuickDraw sizes buffers from fbrExtent); an unedited font keeps Apple's value
    const fRectWidth = o && o.kernMax === kernMax && (!f.edited || o.fRectWidth >= right - kernMax) ? o.fRectWidth : Math.max(0, right - kernMax);
    return { kernMax, widMax, fRectWidth, fbrExtent };
  }

  function write(f) {
    const h = height(f), defined = f.glyphs.map((g, c) => (g ? c : -1)).filter(c => c >= 0);
    if (!defined.length) throw new Error('The font has no characters.');
    const first = defined[0], last = defined[defined.length - 1], nc = last - first + 3;
    const { kernMax, widMax, fRectWidth, fbrExtent } = metrics(f);
    const order = []; for (let c = first; c <= last + 1; c++) order.push(c === last + 1 ? f.missing : f.glyphs[c]);
    const o = !f.edited && f._orig; // an unedited font keeps Apple's padding and fields exactly
    const total = order.reduce((s, g) => s + (g ? g.w : 0), 0), need = Math.max(1, Math.ceil(total / 16));
    const rowWords = o && o.rowWords >= need ? o.rowWords : need;
    const strikeBytes = rowWords * 2 * h;
    const owWords = (26 - 16 + strikeBytes + 2 * nc) / 2; // from the owTLoc field to owTable
    const hdr = (f._orig && f._orig.hdr ? f._orig.hdr.slice() : [6, 0, 0, 0, 0x0101, 0]);
    if (owWords > 0xFFFF && hdr.length < 7) { while (hdr.length < 7) hdr.push(0); }
    hdr[0] = hdr.length; hdr[1] = f.family & 0xFFFF; hdr[2] = f.style || 0; hdr[3] = f.size; hdr[5] = fbrExtent;
    hdr[4] = f.version || 0x0101; if (hdr.length >= 7) { hdr[6] = Math.floor(owWords / 65536); if (hdr[4] < 0x0105) hdr[4] = 0x0105; }
    const name = (f.name || 'Untitled').slice(0, 255);
    const size = 1 + name.length + 2 * hdr.length + 26 + strikeBytes + 4 * nc;
    const d = new Uint8Array(size), dv = new DataView(d.buffer);
    d[0] = name.length; for (let i = 0; i < name.length; i++) d[1 + i] = name.charCodeAt(i) & 255;
    const h0 = 1 + name.length, mf = h0 + 2 * hdr.length;
    hdr.forEach((v, i) => dv.setUint16(h0 + 2 * i, v & 0xFFFF, true));
    const strike = mf + 26, loc = strike + strikeBytes, ow = loc + 2 * nc;
    [f.fontType || 0x9000, first, last, widMax, kernMax, o ? o.nDescent : -f.descent, fRectWidth, h, owWords & 0xFFFF, f.ascent, f.descent, f.leading || 0, rowWords]
      .forEach((v, i) => dv.setInt16(mf + 2 * i, v << 16 >> 16, true));
    let pos = 0;
    order.forEach((g, i) => {
      dv.setUint16(loc + 2 * i, pos, true);
      if (!g) { dv.setUint16(ow + 2 * i, 0xFFFF, true); return; }
      // a glyph with no image (space, dead keys) has no real left edge: keep its offset in range
      const off = g.w ? g.left - kernMax : Math.max(0, Math.min(254, g.left - kernMax));
      if (off < 0 || off > 254 || g.adv < 0 || g.adv > 254) throw new Error('Character ' + (first + i) + ' is too wide or kerns too far.');
      dv.setUint16(ow + 2 * i, (off << 8) | g.adv, true);
      for (let y = 0; y < h; y++) for (let x = 0; x < g.w; x++) if (g.bits[y * g.w + x]) { const X = pos + x; d[strike + y * rowWords * 2 + (X >> 3)] |= 0x80 >> (X & 7); }
      pos += g.w;
    });
    dv.setUint16(loc + 2 * (nc - 1), pos, true); // locTable[lastChar+2] = strike length
    dv.setUint16(ow + 2 * (nc - 1), 0xFFFF, true);
    return d;
  }

  const glyphFor = (f, code) => (code >= 0 && code < 256 && f.glyphs[code]) || f.missing;
  // Draw a Mac OS Roman byte string the QuickDraw way: each glyph's image at pen + left, then pen += adv.
  // plot(x, y) is called for every foreground pixel; y is relative to the baseline (negative = above).
  function draw(f, codes, x, plot) {
    let pen = x;
    for (const c of codes) {
      const g = glyphFor(f, c);
      for (let y = 0; y < height(f); y++) for (let i = 0; i < g.w; i++) if (g.bits[y * g.w + i]) plot(pen + g.left + i, y - f.ascent);
      pen += g.adv;
    }
    return pen - x;
  }
  const measure = (f, codes) => codes.reduce((s, c) => s + glyphFor(f, c).adv, 0);
  const encode = str => [...str].map(ch => { const c = codeOf(ch); return c < 0 ? 0xFFFF : c; });

  root.FONT = { parse, write, create, metrics, draw, measure, encode, charOf, codeOf, familyFor, height, glyphFor, blankGlyph, MACROMAN_HI };
})(typeof window !== 'undefined' ? window : globalThis);
