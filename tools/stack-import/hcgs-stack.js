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
      Object.assign(part, {
        textAlign: s16(d, p + 24), textFont: s16(d, p + 26) & 0xFFFF, textSize: u16(d, p + 28), textStyle: u16(d, p + 30), textHeight: u16(d, p + 32),
        hidden: !!(d[p + 5] & 0x80), family: t >> 4,
        // colors as 640-mode nibbles (even pixel value << 2 | odd pixel value): +34 frame, +35 text (fields ✅: Notes,
        // StoryBook, Whats.New), buttons +36 fore and +37 back (icon black/white, $0F default ✅ Addresses' arrows)
        frameColor: d[p + 34] & 15, textColor: d[p + 35] & 15, foreColor: d[p + 36] & 15, backColor: d[p + 37] & 15,
      });
      // fields, byte +15 (measured with probe.hts: one flag set per field): $80 autoTab, $40 showLines, $20 wideMargins,
      // $10 lockText. Byte +5 bits other than $80 hidden are still the Mac guesses (🔶).
      if (part.kind === 'field') Object.assign(part, {
        autoTab: !!(d[p + 15] & 0x80), showLines: !!(d[p + 15] & 0x40), wideMargins: !!(d[p + 15] & 0x20), lockText: !!(d[p + 15] & 0x10),
        fixedLineHeight: !(d[p + 5] & 4), sharedText: !!(d[p + 5] & 8), dontSearch: !!(d[p + 5] & 0x10), dontWrap: !!(d[p + 5] & 0x20) });
      else part.enabled = !(d[p + 5] & 1);
      // name (C string), one zero byte, a long (always 4 so far: script format?), then the script (C string)
      const nm = cstr(d, p + 42); part.name = nm.s; part.scriptTag = u32(d, nm.next + 1);
      part.script = cstr(d, nm.next + 5).s.replace(/\r/g, '\n');
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

  /* Full picture-plane decoder (HyperCard IIGS BMAP mask or image data). Returns Uint8Array(rb * n) of
   * 2-bit pixel bytes. Ops inside a row: $00-$7F (b&7) zeros then (b>>3) data bytes; $80-$9F (b&31)*8
   * zeros; $A0-$BF (b&31)*8 data bytes; $C0-$DF one byte repeated (b&31)*4 times; $E0-$FF a 4-byte
   * pattern repeated (b&31) times. Row header byte:
   *   $00 raw row (rb bytes)            $01 fill row with a 2-byte pattern (2 bytes follow)
   *   $03 ops, values as-is             $04/$05/$06 ops, XOR with the row 1/2/3 above
   *   $10/$11/$12 copy the row 1/2/3 above (no data)
   *   $20-$7F repeat the next row command (b - $20) times
   * Rows above the top edge count as white ($FF). Unknown headers throw. */
  let COPY_TOP = 0x00;
  function decodePlane(src, rb, n) {
    const out = new Uint8Array(rb * n); let i = 0, y = 0;
    const above = (k, dy) => (y - dy >= 0 ? out[(y - dy) * rb + k] : 0xFF);
    const ops = () => { const row = []; while (row.length < rb) {
      const b = src[i++]; if (b === undefined) throw new Error('picture data ended early');
      if (b < 0x80) { for (let k = 0; k < (b & 7); k++) row.push(0); for (let k = 0; k < b >> 3; k++) row.push(src[i++]); }
      else if (b < 0xA0) { for (let k = 0; k < (b & 31) * 8; k++) row.push(0); }
      else if (b < 0xC0) { for (let k = 0; k < (b & 31) * 8; k++) row.push(src[i++]); }
      else if (b < 0xE0) { const v = src[i++]; for (let k = 0; k < (b & 31) * 4; k++) row.push(v); }
      else { const p = src.subarray(i, i + 4); i += 4; for (let k = 0; k < (b & 31) * 4; k++) row.push(p[k & 3]); } }
      if (row.length !== rb) throw new Error('row overflow at y=' + y); return row; };
    const command = () => {
      const m = src[i++], at = y * rb;
      if (m === 0x00) { for (let k = 0; k < rb; k++) out[at + k] = src[i++]; }
      else if (m === 0x01) { const a = src[i++], b = src[i++]; for (let k = 0; k < rb; k++) out[at + k] = k & 1 ? b : a; }
      else if (m === 0x03) { ops().forEach((v, k) => out[at + k] = v); }
      else if (m >= 0x04 && m <= 0x06) { const dy = m - 3; ops().forEach((v, k) => out[at + k] = v ^ above(k, dy)); }
      else if (m >= 0x10 && m <= 0x12) { const dy = m - 0x0F; for (let k = 0; k < rb; k++) out[at + k] = y - dy >= 0 ? out[(y - dy) * rb + k] : COPY_TOP; }
      else throw new Error('unknown row header $' + m.toString(16) + ' at y=' + y);
      y++;
    };
    while (y < n) {
      const b = src[i];
      if (b >= 0x20 && b < 0x80) { i++; const count = b - 0x20, start = i; let end = i; for (let r = 0; r < count && y < n; r++) { i = start; command(); end = i; } i = end; }
      else command();
    }
    return { out, used: i };
  }

  /* Decode a BMAP block into a full 640x200 screen: { pixels: Uint8Array(32000) 640-mode bytes (white
   * outside the image), mask: Uint8Array(32000) ($FF = opaque per 2-bit pixel), rects }. */
  function decodePicture(d, b) {
    const o = b.o, r = k => [0, 2, 4, 6].map(j => (d[o + k + j] | d[o + k + j + 1] << 8) << 16 >> 16);
    const maskRect = r(0x1C), imgRect = r(0x24), ms = u32(d, o + 0x34), is = u32(d, o + 0x38);
    const pixels = new Uint8Array(32000).fill(0xFF), mask = new Uint8Array(32000);
    const geo = rc => { const L = Math.floor(rc[1] / 8) * 8, R = Math.ceil(rc[3] / 8) * 8; return { L, rb: (R - L) / 4, n: rc[2] - rc[0], top: rc[0] }; };
    const blit = (dst, plane, g) => { for (let y = 0; y < g.n; y++) for (let k = 0; k < g.rb; k++) { const sy = g.top + y, sx = g.L / 4 + k; if (sy >= 0 && sy < 200 && sx >= 0 && sx < 160) dst[sy * 160 + sx] = plane[y * g.rb + k]; } };
    const gi = geo(imgRect);
    if (is) blit(pixels, decodePlane(d.subarray(o + 0x3C + ms, o + 0x3C + ms + is), gi.rb, gi.n).out, gi);
    else if (gi.n > 0) { // image size 0: solid black over the image rect
      for (let y = imgRect[0]; y < imgRect[2]; y++) for (let x = imgRect[1]; x < imgRect[3]; x++) pixels[y * 160 + (x >> 2)] &= ~(3 << (6 - 2 * (x & 3)));
    }
    if (ms) { const gm = geo(maskRect); blit(mask, decodePlane(d.subarray(o + 0x3C, o + 0x3C + ms), gm.rb, gm.n).out, gm); }
    else if (maskRect[2] > maskRect[0]) { for (let y = maskRect[0]; y < maskRect[2]; y++) for (let x = maskRect[1]; x < maskRect[3]; x++) mask[y * 160 + (x >> 2)] |= 3 << (6 - 2 * (x & 3)); }
    else { for (let k = 0; k < 32000; k++) { const v = pixels[k]; let m = 0; for (let p = 0; p < 4; p++) if (((v >> (6 - 2 * p)) & 3) !== 3) m |= 3 << (6 - 2 * p); mask[k] = m; } } // no mask: non-white pixels are opaque (assumption)
    return { pixels, mask, maskRect, imgRect };
  }

  function read(bytes) {
    const d = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const bl = blocks(d), byId = (type, id) => bl.find(x => x.type === type && x.id === id);
    const stak = bl.find(x => x.type === 'STAK'); if (!stak) throw new Error('No STAK block: not a HyperCard stack.');
    const colors = Array.from({ length: 16 }, (_, i) => u16(d, stak.o + 0x60 + 2 * i) & 0xFFF);
    const list = bl.find(x => x.type === 'LIST');
    // LIST: +$0C page count, +$10 page size, +$14 card count, +$18 card-entry size (word: 8, 12, 16, 28, 68 seen),
    // then from +$28 one 6-byte entry per page: PAGE id (4), cards in that page (2). Each PAGE lists its cards
    // from +$18: card id (4) then flags and the search hash, to the entry size.
    const order = [];
    const esize = u16(d, list.o + 0x18), npages = u32(d, list.o + 0x0C);
    for (let k = 0; k < npages; k++) {
      const pg = byId('PAGE', s32(d, list.o + 0x28 + 6 * k)), n = u16(d, list.o + 0x2C + 6 * k);
      if (pg) for (let j = 0; j < n; j++) order.push(s32(d, pg.o + 0x18 + j * esize));
    }
    const obj = (b, kind) => {
      const ps = parts(d, b), cc = u16(d, b.o + 0x2C), cs = u32(d, b.o + 0x2E);
      const o = { kind, id: b.id, picture: s32(d, b.o + 0x0C), flags: u16(d, b.o + 0x10), parts: ps.parts, raw: { contentsCount: cc, contentsSize: cs, contentsAt: ps.end } };
      // contents: per entry a part id (2, signed: positive = background part, negative = this card's own part),
      // then a C string. A lone byte $80/$81 is a button's per-card state (bit 0 = hilite 🔶), not text.
      o.contents = []; let q = ps.end;
      for (let i = 0; i < cc; i++) {
        const id = s16(d, q); const t = cstr(d, q + 2); q = t.next;
        if (t.s.length === 1 && t.s.charCodeAt(0) >= 0x80 && t.s.charCodeAt(0) < 0x84) o.contents.push({ id, state: t.s.charCodeAt(0) });
        else o.contents.push({ id, text: t.s.replace(/\r/g, '\n') });
      }
      // then the object's name (C string), a long (4), and its script
      const nm = cstr(d, ps.end + cs); o.name = nm.s; o.script = cstr(d, nm.next + 4).s.replace(/\r/g, '\n');
      // flags (Mac bits): $4000 cantDelete, $2000 picture hidden, $0800 dontSearch
      Object.assign(o, { cantDelete: !!(o.flags & 0x4000), showPict: !(o.flags & 0x2000), dontSearch: !!(o.flags & 0x0800) });
      if (kind === 'card') o.background = s32(d, b.o + 0x20); else o.cardCount = u32(d, b.o + 0x14);
      return o;
    };
    const backgrounds = bl.filter(x => x.type === 'BKGD').map(b => obj(b, 'background'));
    const cards = order.map(id => byId('CARD', id)).filter(Boolean).map(b => obj(b, 'card'));
    // stack script: STAK +$600 holds a long (4), then the script as a C string
    const script = cstr(d, stak.o + 0x604).s.replace(/\r/g, '\n');
    return { colors, cards, backgrounds, script, blocks: bl, bytes: d, bmap: id => byId('BMAP', id) };
  }

  root.HCGS = { read, blocks, woba, hcgsRows, decodePlane, decodePicture, STYLES };
})(typeof window !== 'undefined' ? window : globalThis);
