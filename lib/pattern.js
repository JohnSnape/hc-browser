/* pattern.js — HyperCard IIGS paint patterns, for the browser and Node.
 *
 * A QuickDraw II pattern is 32 bytes: 8 rows x 4 bytes. In 640 mode those are screen-format pixels, 4 two-bit
 * pixels per byte (leftmost in bits 7-6), so one tile is 16 x 8 screen pixels and it is aligned to the screen.
 * HyperCard IIGS keeps a stack's 16 editable paint patterns in the STAK block at +$200 (16 x 32 bytes), right
 * after the stack's color set at +$60. HyperTalk numbers the Patterns palette down its columns: 1-16 are the 16
 * colors, 17-32 are patterns 0-15. (Measured; see docs/HYPERCARD-IIGS-FORMATS.md.)
 * Classic script: sets globalThis.PATTERN.
 */
(function (root) {
  'use strict';
  const PAT_OFF = 0x200, COLORS_OFF = 0x60, COUNT = 16, SIZE = 32;
  const u32 = (d, o) => (d[o] | d[o + 1] << 8 | d[o + 2] << 16 | d[o + 3] << 24) >>> 0;
  function stakAt(d) {
    if (String.fromCharCode(d[4], d[5], d[6], d[7]) !== 'STAK') throw new Error('Not a HyperCard IIGS stack (no STAK block at the start).');
    if (u32(d, 0) < PAT_OFF + COUNT * SIZE) throw new Error('STAK block too small for a pattern table.');
    return 0;
  }
  // read the 16 patterns and the 16-color set from a stack's data fork
  function readStack(bytes) {
    const d = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), s = stakAt(d);
    const patterns = []; for (let i = 0; i < COUNT; i++) patterns.push(d.slice(s + PAT_OFF + i * SIZE, s + PAT_OFF + (i + 1) * SIZE));
    const colors = []; for (let i = 0; i < 16; i++) colors.push(d[s + COLORS_OFF + 2 * i] | (d[s + COLORS_OFF + 2 * i + 1] & 15) << 8);
    return { patterns, colors };
  }
  // The STAK block's first $600 bytes, read as little-endian longs, must sum to 0; the long at +$0C balances
  // it (the Mac HyperCard rule, byte-swapped). If the sum is off, HyperCard IIGS says "That password was
  // incorrect." when the stack opens. (Measured on Home; see docs/HYPERCARD-IIGS-FORMATS.md.)
  const CHECK_LEN = 0x600, CHECK_AT = 0x0C;
  function stakSum(d, s) { let t = 0; for (let i = 0; i < CHECK_LEN; i += 4) t = (t + u32(d, s + i)) >>> 0; return t; }
  function fixChecksum(d, s) {
    const cur = u32(d, s + CHECK_AT), v = (cur - stakSum(d, s)) >>> 0;
    d[s + CHECK_AT] = v & 255; d[s + CHECK_AT + 1] = v >>> 8 & 255; d[s + CHECK_AT + 2] = v >>> 16 & 255; d[s + CHECK_AT + 3] = v >>> 24 & 255;
  }
  // write patterns (array of 16 x 32 bytes, or a {index: bytes} map) back into a copy of the stack
  function writeStack(bytes, patterns) {
    const d = new Uint8Array(bytes), s = stakAt(d);
    for (const [i, p] of Object.entries(patterns)) { if (p.length !== SIZE) throw new Error('A pattern is 32 bytes.'); d.set(p, s + PAT_OFF + (+i) * SIZE); }
    fixChecksum(d, s);
    return d;
  }
  const get = (p, x, y) => (p[(y & 7) * 4 + ((x & 15) >> 2)] >> (6 - 2 * (x & 3))) & 3;
  function set(p, x, y, v) { const o = (y & 7) * 4 + ((x & 15) >> 2), sh = 6 - 2 * (x & 3); p[o] = (p[o] & ~(3 << sh)) | ((v & 3) << sh); }
  const hyperTalkNumber = i => 17 + i; // set pattern to N
  root.PATTERN = { readStack, writeStack, get, set, hyperTalkNumber, stakSum: d => stakSum(d, stakAt(d)), fixChecksum: d => fixChecksum(d, stakAt(d)), PAT_OFF, COLORS_OFF, COUNT, SIZE, W: 16, H: 8 };
})(typeof window !== 'undefined' ? window : globalThis);
