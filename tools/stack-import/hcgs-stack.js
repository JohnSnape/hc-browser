/* hcgs-stack.js — read HyperCard IIGS stack files (data fork).
 *
 * Reverse-engineered from Apple's own stacks; the structure is the Macintosh HyperCard block chain stored
 * little-endian, with IIGS changes. Everything marked "?" is still unconfirmed.
 *
 * Block: size(4) type(4 ASCII) id(4) ... ; chain runs STAK ... TAIL, padded with FREE blocks.
 *   STAK +$60: the stack's color set, 16 IIGS color words (Home: 000 F00 0F0 FFF 000 00F FF0 FFF x2).
 *   LIST +$28: first PAGE id;  PAGE +$18: card entries, 20 bytes each: card id(4) + flags/search hash(16).
 *   CARD +$0C picture BMAP id, +$10 flags, +$1C page id, +$20 background id,
 *   BKGD +$0C picture BMAP id, +$10 flags, +$14 card count, +$18 next bkgd, +$1C previous bkgd;
 *   both: +$24 part count, +$26 next part id, +$28 part list size, +$2C content count, +$2E content size,
 *         parts from +$32, then part contents, then the object's name and script.
 *   Part: +0 size(2) +2 id(2) +4 type(1: low nibble 1 = button, 2 = field)? +5 flags(1)? +6 rect top,left,
 *         bottom,right (2 each, HyperCard units: 2 screen px across) +14 style(1, Mac numbering)
 *         +15 flags(1: $80 showName, $40 hilite, $20 autoHilite) +16 icon id(4) +20..+41 text settings (?)
 *         +42 name (C string) then script (C string, CR line ends).
 * Classic script for browser + Node: sets globalThis.HCGS.
 */
(function (root) {
  'use strict';
  const u16 = (d, o) => d[o] | d[o + 1] << 8;
  const s16 = (d, o) => (u16(d, o) << 16) >> 16;
  const u32 = (d, o) => (d[o] | d[o + 1] << 8 | d[o + 2] << 16 | d[o + 3] << 24) >>> 0;
  const s32 = (d, o) => u32(d, o) | 0;
  const cstr = (d, o) => { let e = o; while (e < d.length && d[e]) e++; return { s: String.fromCharCode(...d.subarray(o, e)), next: e + 1 }; };
  const STYLES = ['transparent', 'opaque', 'rectangle', 'roundRect', 'shadow', 'checkBox', 'radioButton', 'scrolling', 'standard', 'default', 'oval', 'popup'];

  function blocks(d) {
    const out = []; let o = 0;
    while (o + 12 <= d.length) {
      const size = u32(d, o), type = String.fromCharCode(...d.subarray(o + 4, o + 8)), id = s32(d, o + 8);
      if (size < 12 || o + size > d.length) throw new Error('Broken block chain at ' + o);
      out.push({ o, size, type, id }); o += size; if (type === 'TAIL') break;
    }
    return out;
  }

  function parts(d, b) {
    const o = b.o, n = u16(d, o + 0x24), list = [];
    let p = o + 0x32;
    for (let i = 0; i < n; i++) {
      const size = u16(d, p);
      const t = d[p + 4];
      const part = {
        id: u16(d, p + 2), kind: (t & 15) === 2 ? 'field' : 'button', typeByte: t, flags: d[p + 5],
        rect: [s16(d, p + 8), s16(d, p + 6), s16(d, p + 12), s16(d, p + 10)], // left, top, right, bottom (HyperTalk order)
        styleNum: d[p + 14], style: STYLES[d[p + 14]] || 'style' + d[p + 14], flags2: d[p + 15],
        showName: !!(d[p + 15] & 0x80), hilite: !!(d[p + 15] & 0x40), autoHilite: !!(d[p + 15] & 0x20),
        icon: s32(d, p + 16), raw: [...d.subarray(p + 20, p + 42)],
      };
      const nm = cstr(d, p + 42); part.name = nm.s; part.script = cstr(d, nm.next).s.replace(/\r/g, '\n');
      list.push(part); p += size;
    }
    return { parts: list, end: p };
  }

  /* WOBA ("Wrath of Bill Atkinson") picture decompression, as documented for Mac HyperCard by Rebecca
   * Bettencourt. Decodes `rows` rows of `rb` bytes; returns { out, used } (used = bytes of src consumed). */
  function woba(src, rb, rows) {
    const out = new Uint8Array(rb * rows), pat = [0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55];
    let i = 0, y = 0, dh = 0, dv = 0, repeat = 1;
    let row = new Uint8Array(rb), x = 0;
    const finishRow = (multi) => {
      if (multi && (dh || dv)) {
        const orig = row.slice(), copy = row.slice();
        if (dh) { // repeatedly shift the copy right dh bits and xor with the original
          for (let s = dh; s < rb * 8; s += dh) {
            for (let k = rb - 1; k >= 0; k--) { const bitShift = s, bi = (k * 8 - bitShift); let v = 0; for (let b = 0; b < 8; b++) { const src = bi + b; if (src >= 0) v |= ((orig[src >> 3] >> (7 - (src & 7))) & 1) << (7 - b); } copy[k] ^= v; }
          }
        }
        if (dv && y - dv >= 0) for (let k = 0; k < rb; k++) copy[k] ^= out[(y - dv) * rb + k];
        row = copy;
      }
      out.set(row, y * rb); y++; row = new Uint8Array(rb); x = 0;
    };
    const put = b => { row[x++] = b; if (x === rb) finishRow(true); };
    while (y < rows && i < src.length) {
      const op = src[i++];
      if (op >= 0xA0 && op <= 0xBF) { repeat = op & 31; continue; }
      const n = repeat; repeat = 1;
      for (let r = 0; r < n && y < rows; r++) {
        let j = i;
        if (op < 0x80) { const d = op >> 4, z = op & 15; for (let k = 0; k < z && y < rows; k++) put(0); for (let k = 0; k < d && y < rows; k++) put(src[j++]); }
        else if (op === 0x80) { for (let k = 0; k < rb; k++) row[k] = src[j++]; finishRow(false); }
        else if (op === 0x81) { finishRow(false); }
        else if (op === 0x82) { row.fill(0xFF); finishRow(false); }
        else if (op === 0x83) { const b = src[j++]; pat[y & 7] = b; row.fill(b); finishRow(false); }
        else if (op === 0x84) { row.fill(pat[y & 7]); finishRow(false); }
        else if (op >= 0x85 && op <= 0x87) { const back = op - 0x84; if (y - back >= 0) row.set(out.subarray((y - back) * rb, (y - back + 1) * rb)); finishRow(false); }
        else if (op >= 0x88 && op <= 0x8F) { [dh, dv] = [[16, 0], [0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [2, 2], [8, 0]][op - 0x88]; }
        else if (op >= 0xC0 && op <= 0xDF) { for (let k = 0; k < (op & 31) * 8 && y < rows; k++) put(src[j++]); }
        else if (op >= 0xE0) { for (let k = 0; k < (op & 31) * 16 && y < rows; k++) put(0); }
        if (r === n - 1) i = j; // repeated instructions reuse the same operand bytes
      }
    }
    return { out, used: i, rows: y };
  }

  /* HyperCard IIGS picture rows (reverse-engineered; see tools/stack-import/README.md).
   * Rows span the bounding rect with left rounded down / right rounded up to 8 pixels, 2 bits per pixel.
   * Each row: a mode byte, then (except mode 0) ops until the row is full:
   *   $00-$7F  z = b & 7 zero bytes, then d = b >> 3 data bytes
   *   $80-$9F  (b & 31) * 8 zero bytes        $A0-$BF  (b & 31) * 8 data bytes
   *   $C0-$FF  next byte repeated (b & 63) * 4 times
   * Modes: 0 = raw pixel bytes; 4/5/6 = the row (pixels inverted, white = 0) XORed with the row 1/2/3
   * above (also inverted). Others: see decodeRows' `modes` table. Returns { rows: [{mode, bytes}], used }. */
  function hcgsRows(src, rb, n) {
    const rows = []; let i = 0;
    for (let y = 0; y < n && i < src.length; y++) {
      const mode = src[i++], out = [];
      if (mode === 0) { for (let k = 0; k < rb; k++) out.push(src[i++]); }
      else while (out.length < rb && i < src.length) {
        const b = src[i++];
        if (b < 0x80) { for (let k = 0; k < (b & 7); k++) out.push(0); for (let k = 0; k < b >> 3; k++) out.push(src[i++]); }
        else if (b < 0xA0) { for (let k = 0; k < (b & 31) * 8; k++) out.push(0); }
        else if (b < 0xC0) { for (let k = 0; k < (b & 31) * 8; k++) out.push(src[i++]); }
        else { const v = src[i++]; for (let k = 0; k < (b & 63) * 4; k++) out.push(v); }
      }
      rows.push({ mode, bytes: out });
    }
    return { rows, used: i };
  }

  function read(bytes) {
    const d = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const bl = blocks(d), byId = (type, id) => bl.find(x => x.type === type && x.id === id);
    const stak = bl.find(x => x.type === 'STAK'); if (!stak) throw new Error('No STAK block: not a HyperCard stack.');
    const colors = Array.from({ length: 16 }, (_, i) => u16(d, stak.o + 0x60 + 2 * i) & 0xFFF);
    const list = bl.find(x => x.type === 'LIST');
    const pages = bl.filter(x => x.type === 'PAGE');
    const order = [];
    for (const pg of pages) for (let e = pg.o + 0x18; e + 4 <= pg.o + pg.size; e += 20) { const id = u32(d, e); if (!id) break; order.push(id); }
    const obj = (b, kind) => {
      const ps = parts(d, b);
      const o = { kind, id: b.id, picture: s32(d, b.o + 0x0C), flags: u16(d, b.o + 0x10), parts: ps.parts, raw: { contentsCount: u16(d, b.o + 0x2C), contentsSize: u32(d, b.o + 0x2E), contentsAt: ps.end } };
      if (kind === 'card') o.background = s32(d, b.o + 0x20); else o.cardCount = u32(d, b.o + 0x14);
      return o;
    };
    const backgrounds = bl.filter(x => x.type === 'BKGD').map(b => obj(b, 'background'));
    const cards = order.map(id => byId('CARD', id)).filter(Boolean).map(b => obj(b, 'card'));
    return { colors, cards, backgrounds, blocks: bl, bytes: d, bmap: id => byId('BMAP', id) };
  }

  root.HCGS = { read, blocks, woba, hcgsRows, STYLES };
})(typeof window !== 'undefined' ? window : globalThis);
