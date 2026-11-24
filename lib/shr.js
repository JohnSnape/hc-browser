/* shr.js — Apple IIGS Super Hi-Res (640 mode) encode/decode, shared by the converter and the HC Browser.
 *
 * Facts used (Apple IIGS Hardware Reference ch. 4; Toolbox Reference vol. 2 ch. 16):
 *  - Screen image ($C1/$0000 file = bank $E1 $2000-$9FFF): 32000 bytes pixels (200 lines x 160 bytes),
 *    200 scan-line control bytes (SCBs), 56 reserved bytes, 16 palettes x 16 colors x 2 bytes = 32768 total.
 *  - SCB bit 7 = 640 mode; bits 0-3 = palette number.
 *  - 640 mode: 4 pixels per byte, 2 bits each, leftmost pixel in bits 7-6.
 *    Pixel 1 of a byte uses palette entries $8-$B, pixel 2 $C-$F, pixel 3 $0-$3, pixel 4 $4-$7 (Table 4-19).
 *  - Color word: low byte = green<<4 | blue, high byte = red (4 bits each).
 * Classic script (no modules) so the converter works when opened straight from disk.
 */
(function (root) {
  'use strict';
  const W = 640, H = 200, ROW = 160, PIX = 32000, SCB = 32000, PAL = 32256, SIZE = 32768;
  const GROUP = [8, 12, 0, 4]; // palette base for pixel (x & 3)

  // Color sets as 16 '0RGB' words.
  // 'system' = the 640-mode palette QuickDraw II actually sets up: measured in GSport (ROM 03, System 6.0.4)
  // with tests/iigs/drawicon. Toolbox Ref. vol. 2 Table 16-5 prints a different order (blue/yellow first,
  // red D00, green 0E0); the machine wins.
  const SETS = {
    system: [0x000, 0xF00, 0x0F0, 0xFFF, 0x000, 0x00F, 0xFF0, 0xFFF, 0x000, 0xF00, 0x0F0, 0xFFF, 0x000, 0x00F, 0xFF0, 0xFFF],
    // [TBC] HyperCard IIGS's own gray set; until then: black/white at full resolution plus two grays per
    // minipalette, offset between the two pixel phases so dithering gives more levels.
    gray: [0x000, 0x444, 0xAAA, 0xFFF, 0x000, 0x777, 0xCCC, 0xFFF, 0x000, 0x444, 0xAAA, 0xFFF, 0x000, 0x777, 0xCCC, 0xFFF],
  };

  const word2rgb = w => [((w >> 8) & 15) * 17, ((w >> 4) & 15) * 17, (w & 15) * 17];
  const rgb2word = (r, g, b) => (Math.round(r / 17) << 8) | (Math.round(g / 17) << 4) | Math.round(b / 17);
  const hex = w => w.toString(16).toUpperCase().padStart(4, '0');

  // Parse 'system' | 'gray' | 'custom 0000 0777 ...' | an array of 16 words.
  function parseSet(s) {
    if (Array.isArray(s)) return s.slice(0, 16);
    const t = String(s).trim().toLowerCase();
    if (SETS[t]) return SETS[t].slice();
    const words = t.replace(/^custom\s+/, '').split(/[\s,]+/).filter(Boolean).map(x => parseInt(x.replace(/^\$/, ''), 16));
    if (words.length !== 16 || words.some(x => !(x >= 0 && x <= 0xFFF))) throw new Error('A color set needs 16 hex words 0000-0FFF');
    return words;
  }
  const setLine = pal => 'colors: custom ' + pal.map(hex).join(' ');

  // Weighted RGB distance (cheap perceptual weighting).
  const dist = (r, g, b, c) => { const dr = r - c[0], dg = g - c[1], db = b - c[2]; return 2 * dr * dr + 4 * dg * dg + 3 * db * db; };

  /* encode(rgba, pal, opts) -> Uint8Array(32768)
   * rgba: Uint8ClampedArray 640*200*4 (already sized for the screen). pal: 16 color words.
   * opts.dither: 'fs' (Floyd-Steinberg, default) | 'none'. */
  function encode(rgba, pal, opts) {
    opts = opts || {};
    const cols = pal.map(word2rgb);
    const out = new Uint8Array(SIZE);
    const dither = opts.dither !== 'none';
    // working buffer with error diffusion (floats), two rows
    let cur = new Float32Array((W + 2) * 3), nxt = new Float32Array((W + 2) * 3);
    for (let y = 0; y < H; y++) {
      nxt.fill(0);
      const ltr = (y & 1) === 0; // serpentine
      for (let i = 0; i < W; i++) {
        const x = ltr ? i : W - 1 - i, p = (y * W + x) * 4, e = (x + 1) * 3;
        const cl = v => v < -64 ? -64 : v > 319 ? 319 : v; // keep accumulated error from running away
        const r = cl(rgba[p] + cur[e]), g = cl(rgba[p + 1] + cur[e + 1]), b = cl(rgba[p + 2] + cur[e + 2]);
        const base = GROUP[x & 3];
        let best = 0, bd = Infinity;
        for (let v = 0; v < 4; v++) { const d = dist(r, g, b, cols[base + v]); if (d < bd) { bd = d; best = v; } }
        out[y * ROW + (x >> 2)] |= best << (6 - 2 * (x & 3));
        if (dither) {
          const c = cols[base + best], er = r - c[0], eg = g - c[1], eb = b - c[2];
          const f = ltr ? 3 : -3; // forward direction in the error row
          const add = (buf, k, w) => { buf[k] += er * w; buf[k + 1] += eg * w; buf[k + 2] += eb * w; };
          add(cur, e + f, 7 / 16); add(nxt, e - f, 3 / 16); add(nxt, e, 5 / 16); add(nxt, e + f, 1 / 16);
        }
      }
      const t = cur; cur = nxt; nxt = t;
    }
    for (let y = 0; y < H; y++) out[SCB + y] = 0x80; // 640 mode, palette 0
    for (let i = 0; i < 16; i++) { out[PAL + 2 * i] = pal[i] & 0xFF; out[PAL + 2 * i + 1] = (pal[i] >> 8) & 0x0F; }
    return out;
  }

  /* decode(shr, palOverride?) -> Uint8ClampedArray 640*200*4, exactly as the IIGS shows it (per-line SCB/palette).
   * palOverride (16 words) replaces every palette, which is how a stack's color set is applied. */
  function decode(shr, palOverride) {
    const rgba = new Uint8ClampedArray(W * H * 4);
    const pals = [];
    for (let p = 0; p < 16; p++) {
      const ws = palOverride || Array.from({ length: 16 }, (_, i) => shr[PAL + p * 32 + 2 * i] | ((shr[PAL + p * 32 + 2 * i + 1] & 15) << 8));
      pals.push(ws.map(word2rgb));
    }
    for (let y = 0; y < H; y++) {
      const scb = shr[SCB + y], cols = pals[scb & 15], m640 = scb & 0x80;
      for (let x = 0; x < W; x++) {
        let c;
        if (m640) c = cols[GROUP[x & 3] + ((shr[y * ROW + (x >> 2)] >> (6 - 2 * (x & 3))) & 3)];
        else { const v = shr[y * ROW + (x >> 2)]; c = cols[((x >> 1) & 1) ? (v & 15) : (v >> 4)]; } // 320 mode: one pixel = 2 screen dots
        const q = (y * W + x) * 4; rgba[q] = c[0]; rgba[q + 1] = c[1]; rgba[q + 2] = c[2]; rgba[q + 3] = 255;
      }
    }
    return rgba;
  }

  // .msk: 1 bit per pixel, 80 bytes per line, leftmost pixel in bit 7, 1 = opaque.
  function encodeMask(rgba, threshold) {
    const t = threshold == null ? 128 : threshold, out = new Uint8Array(W / 8 * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rgba[(y * W + x) * 4 + 3] >= t) out[y * 80 + (x >> 3)] |= 0x80 >> (x & 7);
    return out;
  }
  const maskBit = (msk, x, y) => (msk[y * 80 + (x >> 3)] >> (7 - (x & 7))) & 1;
  const hasTransparency = (rgba, t) => { for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < (t == null ? 128 : t)) return true; return false; };

  /* autoSet(rgba, keepBW) -> 16 words chosen for this picture.
   * Pixel phases 1&3 (entries 8-11, 0-3) share minipalette A; phases 2&4 (12-15, 4-7) share B, so A/B pairs
   * dither into extra colors. keepBW keeps black at 0 and white at 3 of every minipalette (crisp text),
   * leaving 2 free colors each; otherwise 4 free each. Free colors come from k-means, alternated by brightness. */
  function autoSet(rgba, keepBW) {
    const k = keepBW ? 6 : 8, pts = []; // keepBW: 6 candidates for 2+2 free slots
    const step = Math.max(1, Math.floor(rgba.length / 4 / 20000));
    for (let i = 0; i < rgba.length / 4; i += step) {
      if (rgba[i * 4 + 3] < 128) continue;
      const p = [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]];
      // with black and white already in every minipalette, spend the free slots on everything else
      if (keepBW && (dist(p[0], p[1], p[2], [0, 0, 0]) < 3000 || dist(p[0], p[1], p[2], [255, 255, 255]) < 3000)) continue;
      pts.push(p);
    }
    if (!pts.length) pts.push([128, 128, 128]);
    // k-means++ style seeding by spread, then Lloyd iterations
    const cen = [pts[Math.floor(pts.length / 2)].slice()];
    while (cen.length < k) {
      let far = pts[0], fd = -1;
      for (const p of pts) { const d = Math.min(...cen.map(c => dist(p[0], p[1], p[2], c))); if (d > fd) { fd = d; far = p; } }
      cen.push(far.slice());
    }
    for (let it = 0; it < 12; it++) {
      const sum = cen.map(() => [0, 0, 0, 0]);
      for (const p of pts) { let bi = 0, bd = Infinity; cen.forEach((c, i) => { const d = dist(p[0], p[1], p[2], c); if (d < bd) { bd = d; bi = i; } }); const s = sum[bi]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++; }
      sum.forEach((s, i) => { if (s[3]) cen[i] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
    }
    let words = [...new Set(cen.map(c => rgb2word(c[0], c[1], c[2])))];
    // pad duplicates out with evenly spaced grays not already present
    for (let gv = 1; words.length < k && gv < 15; gv += 2) { const w = gv * 0x111; if (!words.includes(w)) words.push(w); }
    words.sort((a, b) => lum(a) - lum(b));
    // Choose which colors go in minipalette A and which in B. Neighboring pixels blend, so a pixel pair
    // shows (a+b)/2 for a in A, b in B. Score each candidate by how well those blends match the picture.
    const f = keepBW ? 2 : 4, mini = s => keepBW ? [0x000, s[0], s[1], 0xFFF] : s.slice(0, 4);
    const subsets = [];
    (function pick(start, cur) { if (cur.length === f) { subsets.push(cur.slice()); return; } for (let i = start; i < words.length; i++) { cur.push(words[i]); pick(i + 1, cur); cur.pop(); } })(0, []);
    const sample = pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / 2500)) === 0);
    const score = (A, B) => {
      const mixes = [];
      for (const a of mini(A).map(word2rgb)) for (const b of mini(B).map(word2rgb)) mixes.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
      let e = 0;
      for (const p of sample) { let bd = Infinity; for (const m of mixes) { const d = dist(p[0], p[1], p[2], m); if (d < bd) bd = d; } e += bd; }
      return e;
    };
    // keepBW: any A and any B (they may share colors). 8 colors: A and B split the 8 between them.
    let best = null, bestE = Infinity;
    for (const A of subsets) for (const B of subsets) {
      if (!keepBW && A.some(w => B.includes(w))) continue;
      const e = score(A, B); if (e < bestE) { bestE = e; best = [A, B]; }
    }
    const a = mini(best[0]), b = mini(best[1]);
    return [...a, ...b, ...a, ...b]; // entries 0-3 A, 4-7 B, 8-11 A, 12-15 B
  }
  function lum(w) { const c = word2rgb(w); return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]; }

  /* Icons: QuickDraw II Auxiliary icon records (Toolbox Ref. vol. 2 Fig. 17-1), as DrawIcon really draws
   * them in 640 mode (measured in GSport, tests/iigs/drawicon):
   *  - the image bytes ARE 640-mode screen bytes: each 4-bit "icon pixel" is two 2-bit screen pixels, so
   *    iconWidth counts pairs of screen pixels and a row is 1 + (iconWidth - 1) / 2 bytes;
   *  - the mask works per screen pixel (bits 11 = opaque, 00 = see-through);
   *  - DrawIcon copies pixel VALUES at any x, so an icon shows its intended colors only at an even x
   *    (the palette group alternates with every pixel).
   * encodeIcon(shr, msk, x, y, w, h): w in screen pixels (rounded up to even), x should be even. */
  function encodeIcon(shr, msk, x, y, w, h) {
    w += w & 1;
    const iw = w / 2, rb = 1 + ((iw - 1) >> 1), size = rb * h;
    const out = new Uint8Array(8 + 2 * size), dv = new DataView(out.buffer);
    dv.setUint16(0, 0x8000, true); dv.setUint16(2, size, true); dv.setUint16(4, h, true); dv.setUint16(6, iw, true);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const sx = x + c, sy = y + r, inside = sx < W && sy < H;
      const v = inside ? (shr[sy * ROW + (sx >> 2)] >> (6 - 2 * (sx & 3))) & 3 : 3;
      const m = inside && (!msk || maskBit(msk, sx, sy)) ? 3 : 0;
      const sh = 6 - 2 * (c & 3), o = r * rb + (c >> 2);
      out[8 + o] |= v << sh; out[8 + size + o] |= m << sh;
    }
    return out;
  }
  // Draw an icon record into a 640x200 rgba buffer at x,y the way DrawIcon does (values copied, mask per pixel).
  function drawIcon(rgba, ico, pal, x, y) {
    const dv = new DataView(ico.buffer, ico.byteOffset), size = dv.getUint16(2, true), h = dv.getUint16(4, true), iw = dv.getUint16(6, true);
    const rb = 1 + ((iw - 1) >> 1), cols = pal.map(word2rgb);
    for (let r = 0; r < h; r++) for (let c = 0; c < iw * 2; c++) {
      const sx = x + c, sy = y + r; if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
      const sh = 6 - 2 * (c & 3), o = r * rb + (c >> 2);
      if (!((ico[8 + size + o] >> sh) & 3)) continue;
      const v = (ico[8 + o] >> sh) & 3, col = cols[GROUP[sx & 3] + v], q = (sy * W + sx) * 4;
      rgba[q] = col[0]; rgba[q + 1] = col[1]; rgba[q + 2] = col[2]; rgba[q + 3] = 255;
    }
  }

  root.SHR = { W, H, SIZE, SETS, GROUP, parseSet, setLine, hex, word2rgb, rgb2word, encode, decode, encodeMask, maskBit, hasTransparency, autoSet, encodeIcon, drawIcon };
})(typeof window !== 'undefined' ? window : globalThis);
