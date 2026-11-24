/* cursor.js — Apple IIGS QuickDraw II cursors (resource type $8027 rCursor), for the browser and Node.
 *
 * Record (Toolbox Ref. vol. 2, Figure 16-24; checked on HyperCard IIGS's own four cursors):
 *   cursorHeight (rows), cursorWidth (WORDS per row),
 *   cursorImage  height x width words, screen-format pixels (640 mode: 8 two-bit pixels per word,
 *                leftmost in the high bits of the first byte); the last word of every row must be 0,
 *   cursorMask   the same size, same rule,
 *   hotSpotY, hotSpotX.
 * The rCursor resources in HyperCard IIGS add 10 more bytes after the hot spot: $00FF then 8 zero
 *   bytes (probably cursorFlags, bit 7 = 640 mode, and reserved). They are kept and written.
 * Drawing: screen = (screen OR mask) XOR image, per bit. So for a 640-mode pixel:
 *   mask 0, image 0 = see-through; mask 0, image 3 = invert; mask 3, image 3^v = solid value v.
 * Model: { w (screen pixels, a multiple of 8, NOT counting the zero word), h, hotX, hotY,
 *          img: Uint8Array(w*h) 0-3, mask: Uint8Array(w*h) 0-3, tail: Uint8Array }.
 * Classic script: sets globalThis.CURSOR.
 */
(function (root) {
  'use strict';
  const TAIL = new Uint8Array([0xFF, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

  function parse(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const h = dv.getUint16(0, true), ww = dv.getUint16(2, true), n = h * ww * 2;
    if (!h || !ww || b.length < 4 + 2 * n + 4) throw new Error('Not an IIGS cursor record.');
    const W = ww * 8, w = Math.max(8, (ww - 1) * 8); // the last word of each row is the required zero word
    const img = new Uint8Array(w * h), mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = y * ww * 2 + (x >> 2), sh = 6 - 2 * (x & 3);
      img[y * w + x] = (b[4 + o] >> sh) & 3; mask[y * w + x] = (b[4 + n + o] >> sh) & 3;
    }
    return { w, h, hotY: dv.getInt16(4 + 2 * n, true), hotX: dv.getInt16(6 + 2 * n, true), img, mask,
      tail: b.slice(8 + 2 * n), fullWidth: W };
  }

  function write(c) {
    const ww = c.w / 8 + 1, h = c.h, n = h * ww * 2, tail = c.tail && c.tail.length ? c.tail : TAIL;
    if (c.w % 8) throw new Error('Cursor width must be a multiple of 8 pixels.');
    const b = new Uint8Array(8 + 2 * n + tail.length), dv = new DataView(b.buffer);
    dv.setUint16(0, h, true); dv.setUint16(2, ww, true);
    for (let y = 0; y < h; y++) for (let x = 0; x < c.w; x++) {
      const o = y * ww * 2 + (x >> 2), sh = 6 - 2 * (x & 3), k = y * c.w + x;
      b[4 + o] |= (c.img[k] & 3) << sh; b[4 + n + o] |= (c.mask[k] & 3) << sh;
    }
    dv.setInt16(4 + 2 * n, c.hotY, true); dv.setInt16(6 + 2 * n, c.hotX, true);
    b.set(tail, 8 + 2 * n);
    return b;
  }

  // the three kinds of cursor pixel, plus solid values
  const kindOf = (c, k) => c.mask[k] === 3 ? 'v' + (3 ^ c.img[k]) : c.mask[k] === 0 ? (c.img[k] === 0 ? 'clear' : c.img[k] === 3 ? 'invert' : 'mix') : 'mix';
  function setKind(c, k, kind) {
    if (kind === 'clear') { c.mask[k] = 0; c.img[k] = 0; }
    else if (kind === 'invert') { c.mask[k] = 0; c.img[k] = 3; }
    else { const v = +kind.slice(1); c.mask[k] = 3; c.img[k] = 3 ^ v; }
  }
  // the 2-bit value QuickDraw puts on screen over a background value
  const over = (c, k, bg) => ((bg | c.mask[k]) ^ c.img[k]) & 3;
  function blank(w, h) { return { w, h, hotX: 0, hotY: 0, img: new Uint8Array(w * h), mask: new Uint8Array(w * h), tail: TAIL.slice() }; }

  root.CURSOR = { parse, write, kindOf, setKind, over, blank, TAIL };
})(typeof window !== 'undefined' ? window : globalThis);
