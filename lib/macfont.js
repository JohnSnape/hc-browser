/* macfont.js — import Macintosh bitmap fonts ('FONT' / 'NFNT' resources) as Apple IIGS QuickDraw II fonts.
 * For the browser and Node. Needs lib/font.js (FONT). Classic script: sets globalThis.MACFONT.
 *
 * A IIGS font file is a Pascal name, a small IIGS header, then the Macintosh font record (Toolbox Reference
 * vol. 2, ch. 16; docs/HYPERCARD-IIGS-FORMATS.md §5). A Mac font resource IS that record, big-endian:
 *   13 header words: fontType firstChar lastChar widMax kernMax nDescent fRectWidth fRectHeight owTLoc ascent
 *   descent leading rowWords; then the strike (rowWords * 2 * fRectHeight bytes), locTable and owTable
 *   (lastChar - firstChar + 3 words each); NFNTs may add a glyph-width and an image-height table after it.
 * Conversion: the 13 header words and both tables are byte-swapped; the STRIKE IS COPIED UNCHANGED: on both
 * machines it is a stream of bytes with the leftmost pixel in bit 7 (the Mac reads it as big-endian words, whose
 * first byte holds the leftmost 8 pixels). The optional width/height tables are dropped (the IIGS has no use for
 * them) and fontType bits 0-1, which announce them, are cleared. owTLoc is recomputed (NFNTs over 64K words keep
 * its high word in nDescent; the IIGS keeps it in a 7th header word), and nDescent is set to -descent.
 *
 * Containers accepted (what Windows users get): a raw Mac resource fork (.rsrc, CiderPress II "#...r" files),
 * MacBinary I/II/III (.bin), AppleSingle (.as) and AppleDouble ("._name") files. Font suitcases (type FFIL) and
 * System files are just files whose resource forks hold FONT, NFNT and FOND resources.
 */
(function (root) {
  'use strict';
  const u8 = x => x instanceof Uint8Array ? x : new Uint8Array(x);
  const be16 = (b, o) => b[o] << 8 | b[o + 1], be32 = (b, o) => (b[o] << 24 | b[o + 1] << 16 | b[o + 2] << 8 | b[o + 3]) >>> 0;
  const s16 = v => v << 16 >> 16;
  const str = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));
  const pstr = (b, o) => str(b, o + 1, b[o]);

  function isResFork(b) {
    if (b.length < 286) return false;
    const dOff = be32(b, 0), mOff = be32(b, 4), dLen = be32(b, 8), mLen = be32(b, 12);
    return dOff >= 16 && mLen >= 30 && dOff + dLen <= b.length && mOff + mLen <= b.length && mOff >= dOff;
  }
  // Find the resource fork inside whatever the user gave us. Returns { fork, name, container } or throws.
  function unwrap(bytes, fileName) {
    const b = u8(bytes), base = (fileName || '').replace(/^.*[\\/]/, '');
    const magic = b.length >= 26 ? be32(b, 0) : 0;
    if (magic === 0x00051600 || magic === 0x00051607) { // AppleSingle / AppleDouble
      const n = be16(b, 24); let fork = null, name = '';
      for (let i = 0; i < n; i++) {
        const e = 26 + 12 * i, id = be32(b, e), off = be32(b, e + 4), len = be32(b, e + 8);
        if (id === 2) fork = b.subarray(off, off + len); if (id === 3) name = str(b, off, len);
      }
      if (!fork || !fork.length) throw new Error((magic === 0x00051607 ? 'AppleDouble' : 'AppleSingle') + ' file with no resource fork.');
      return { fork, name: name || base.replace(/^\._/, '').replace(/\.as$/i, ''), container: magic === 0x00051607 ? 'AppleDouble' : 'AppleSingle' };
    }
    if (b.length >= 128 && b[0] === 0 && b[1] >= 1 && b[1] <= 63 && b[74] === 0 && b[82] === 0) { // MacBinary
      const dLen = be32(b, 83), rLen = be32(b, 87), rOff = 128 + Math.ceil(dLen / 128) * 128;
      if (dLen < 0x1000000 && rLen && rOff + rLen <= b.length) {
        const fork = b.subarray(rOff, rOff + rLen);
        if (isResFork(fork)) return { fork, name: str(b, 2, b[1]), container: 'MacBinary', type: str(b, 65, 4), creator: str(b, 69, 4) };
      }
    }
    if (isResFork(b)) return { fork: b, name: base.replace(/#[0-9a-f]+r$/i, '').replace(/\.rsrc$/i, ''), container: 'resource fork' };
    throw new Error('No Macintosh resource fork found: give a MacBinary (.bin), AppleSingle (.as), AppleDouble (._ file) or raw resource fork.');
  }

  // A Macintosh resource fork (Inside Macintosh: More Toolbox, ch. 1): all big-endian.
  function readFork(bytes) {
    const b = u8(bytes); if (!isResFork(b)) throw new Error('Not a Macintosh resource fork.');
    const dOff = be32(b, 0), mOff = be32(b, 4), tl = mOff + be16(b, mOff + 24), nl = mOff + be16(b, mOff + 26);
    const out = [], nTypes = s16(be16(b, tl)) + 1;
    for (let t = 0; t < nTypes; t++) {
      const e = tl + 2 + 8 * t, type = str(b, e, 4), count = be16(b, e + 4) + 1, refs = tl + be16(b, e + 6);
      for (let i = 0; i < count; i++) {
        const r = refs + 12 * i, id = s16(be16(b, r)), nOff = be16(b, r + 2), dataAt = dOff + (be32(b, r + 4) & 0xFFFFFF);
        const len = be32(b, dataAt);
        out.push({ type, id, name: nOff === 0xFFFF ? '' : pstr(b, nl + nOff), data: b.subarray(dataAt + 4, dataAt + 4 + len) });
      }
    }
    return out;
  }

  const STYLES = ['bold', 'italic', 'underline', 'outline', 'shadow', 'condense', 'extend'];
  // Every bitmap font in a fork: [{ type, id, name, family, size, style, bytes }], with names and sizes from the
  // FOND (family) resources when present, else from the old 'FONT' numbering (id = family * 128 + size, and the
  // size-0 'FONT' carries the family name).
  function listFonts(res) {
    const fonts = [], byKey = new Map(res.map(r => [r.type + ' ' + r.id, r]));
    const famName = new Map(), used = new Set();
    for (const r of res) if (r.type === 'FONT' && (r.id & 127) === 0 && r.name) famName.set(r.id >> 7, r.name);
    for (const r of res.filter(x => x.type === 'FOND')) {
      const d = r.data; if (d.length < 54) continue;
      const fam = be16(d, 2), n = s16(be16(d, 52)) + 1;
      if (r.name) famName.set(fam, r.name);
      for (let i = 0; i < n; i++) {
        const o = 54 + 6 * i, size = be16(d, o), style = be16(d, o + 2), id = s16(be16(d, o + 4));
        const f = byKey.get('NFNT ' + id) || byKey.get('FONT ' + id); if (!f || f.data.length < 26 || used.has(f.type + ' ' + f.id)) continue;
        used.add(f.type + ' ' + f.id); fonts.push({ type: f.type, id: f.id, name: r.name || famName.get(fam) || 'Font ' + fam, family: fam, size, style, bytes: f.data });
      }
    }
    for (const f of res) {
      if ((f.type !== 'FONT' && f.type !== 'NFNT') || used.has(f.type + ' ' + f.id) || f.data.length < 26) continue;
      const fam = f.type === 'FONT' ? f.id >> 7 : -1;
      fonts.push({ type: f.type, id: f.id, name: famName.get(fam) || f.name || (f.type + ' ' + f.id), family: fam, size: f.type === 'FONT' ? f.id & 127 : be16(f.data, 18), style: 0, bytes: f.data });
    }
    return fonts.sort((a, b) => a.name.localeCompare(b.name) || a.size - b.size || a.style - b.style);
  }

  // The IIGS's own families (System 6.0.4 disks and ROM): a Mac family number is kept only when it is free
  // or names the same family; otherwise (and for Chicago's 0, the Mac's system font) the number comes from the
  // name, like any other new font, so every size of one family still shares it.
  const IIGS_FAMILIES = { 3: 'Geneva', 5: 'Venice', 20: 'Times', 21: 'Helvetica', 22: 'Courier', 23: 'Symbol', 0xFFFE: 'Shaston' };
  function familyNumber(macFam, name) {
    const own = IIGS_FAMILIES[macFam];
    if (macFam >= 1 && macFam < 0xFFFE && (!own || own.toLowerCase() === String(name).toLowerCase())) return macFam;
    return root.FONT.familyFor(name);
  }

  // Mac record -> IIGS $C8 font file bytes. Returns { bytes, strikeAt, strikeLen } (strikeAt: offset in the file).
  function toIIGS(mac, opts) {
    const m = u8(mac), w = i => s16(be16(m, 2 * i));
    const fontType = be16(m, 0), first = w(1), last = w(2), fh = w(7), rowWords = be16(m, 24);
    if (fontType & 0x000C) throw new Error('This is a color (more than 1 bit per pixel) font; only black-and-white fonts convert.');
    const n = last - first + 3, strikeLen = rowWords * 2 * fh, need = 26 + strikeLen + 4 * n;
    // Apple's own NFNTs often end 2 bytes early: the owTable's final entry (the $FFFF terminator after the
    // missing symbol, never read) is left off. Supply it.
    if (first < 0 || last > 255 || last < first || m.length < need - 2) throw new Error('Damaged font record (' + m.length + ' bytes, ' + need + ' needed).');
    const owWords = (26 - 16 + strikeLen + 2 * n) / 2, hdrN = owWords > 0xFFFF ? 7 : 6;
    const name = String(opts.name || 'Untitled').slice(0, 255), h0 = 1 + name.length, mf = h0 + 2 * hdrN;
    const d = new Uint8Array(mf + need), dv = new DataView(d.buffer);
    d[0] = name.length; for (let i = 0; i < name.length; i++) d[1 + i] = name.charCodeAt(i) & 255;
    const hdr = [hdrN, opts.family & 0xFFFF, opts.style || 0, opts.size || fh, 0x0101, Math.max(w(3), w(6), -w(4))];
    if (hdrN === 7) hdr.push(Math.floor(owWords / 65536));
    hdr.forEach((v, i) => dv.setUint16(h0 + 2 * i, v & 0xFFFF, true));
    const head = [fontType & ~3, first, last, w(3), w(4), -w(10), w(6), fh, owWords & 0xFFFF, w(9), w(10), w(11), rowWords];
    head.forEach((v, i) => dv.setUint16(mf + 2 * i, v & 0xFFFF, true));
    d.set(m.subarray(26, 26 + strikeLen), mf + 26); // the strike: same bytes on both machines
    for (let i = 0; i < 2 * n; i++) { const o = 26 + strikeLen + 2 * i; dv.setUint16(mf + o, o + 2 <= m.length ? be16(m, o) : 0xFFFF, true); }
    return { bytes: d, strikeAt: mf + 26, strikeLen };
  }
  // A ready IIGS font object (FONT.parse) for one entry from listFonts, with fbrExtent from the glyphs.
  function convert(entry, opts) {
    opts = opts || {};
    const name = opts.name || entry.name, family = opts.family != null ? opts.family : familyNumber(entry.family, name);
    const r = toIIGS(entry.bytes, { name, family, size: entry.size || undefined, style: entry.style });
    const f = root.FONT.parse(r.bytes);
    const ext = root.FONT.metrics(f).fbrExtent; if (ext > f.fbrExtent) f.fbrExtent = ext;
    return { font: f, bytes: r.bytes, strikeAt: r.strikeAt, strikeLen: r.strikeLen };
  }
  // Decode a Mac strike directly (big-endian words, most significant bit leftmost), for checking conversions.
  function macPixel(mac, x, y) { const m = u8(mac), rw = be16(m, 24), word = be16(m, 26 + y * rw * 2 + 2 * (x >> 4)); return (word >> (15 - (x & 15))) & 1; }
  const styleText = s => STYLES.filter((_, i) => s & (1 << i)).join(' ') || 'plain';

  root.MACFONT = { unwrap, readFork, listFonts, familyNumber, toIIGS, convert, macPixel, styleText, IIGS_FAMILIES };
})(typeof window !== 'undefined' ? window : globalThis);
