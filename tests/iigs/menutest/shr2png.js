// node shr2png.js SHRDUMP out.png [scale] -- a 32K Super Hi-Res dump (640 mode) to a PNG, real QuickDraw palette.
// Also exports pixels(dump) -> Uint8Array(640*200) of 2-bit values for comparisons.
const fs = require('fs'), zlib = require('zlib');
const PAL = [[0, 0, 0], [255, 0, 0], [0, 255, 0], [255, 255, 255]]; // values 0..3 at even columns; good enough for black/white checks
function pixels(d) {
  const p = new Uint8Array(640 * 200);
  for (let y = 0; y < 200; y++) for (let x = 0; x < 640; x++) { const b = d[y * 160 + (x >> 2)]; p[y * 640 + x] = (b >> (6 - 2 * (x & 3))) & 3; }
  return p;
}
function png(w, h, rgb) {
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = b => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (~c) >>> 0; };
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, 'latin1'); d.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) Buffer.from(rgb.subarray(y * w * 3, (y + 1) * w * 3)).copy(raw, y * (w * 3 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
module.exports = { pixels, png };
if (require.main === module) {
  const [inp, out, sc] = process.argv.slice(2), s = +sc || 2, p = pixels(fs.readFileSync(inp));
  const W = 640, H = 200 * s, rgb = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = PAL[p[Math.floor(y / s) * 640 + x]]; rgb.set(c, (y * W + x) * 3); }
  fs.writeFileSync(out, png(W, H, rgb));
}
