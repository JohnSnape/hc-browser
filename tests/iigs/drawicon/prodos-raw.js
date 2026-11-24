// node prodos-raw.js image.po NAME out.bin [bytes]
// Read a file's data blocks straight from a ProDOS-order image (root directory only), ignoring its EOF.
// For when the directory entry's EOF was never written (e.g. the emulator hadn't flushed it).
const fs = require('fs');
const [img, name, out, want] = process.argv.slice(2);
const d = fs.readFileSync(img), B = n => d.subarray(n * 512, n * 512 + 512);
let blk = 2, ent = null;
while (blk && !ent) {
  const b = B(blk);
  for (let i = 0; i < 13; i++) {
    const e = b.subarray(4 + i * 39, 4 + i * 39 + 39), len = e[0] & 15, st = e[0] >> 4;
    if (st && st < 0xE && e.subarray(1, 1 + len).toString('latin1') === name.toUpperCase()) { ent = e; break; }
  }
  blk = b[2] | b[3] << 8;
}
if (!ent) throw new Error(name + ' not found');
const st = ent[0] >> 4, key = ent[17] | ent[18] << 8, eof = ent[21] | ent[22] << 8 | ent[23] << 16;
let blocks = [];
if (st === 1) blocks = [key];
else if (st === 2) { const ix = B(key); for (let i = 0; i < 256; i++) blocks.push(ix[i] | ix[256 + i] << 8); }
else throw new Error('storage type ' + st + ' not handled');
const n = +want || eof || blocks.filter(Boolean).length * 512;
const buf = Buffer.alloc(n);
blocks.forEach((b, i) => { if (b && i * 512 < n) B(b).copy(buf, i * 512, 0, Math.min(512, n - i * 512)); });
fs.writeFileSync(out, buf);
console.log(`${name}: storage ${st}, key ${key}, dir EOF ${eof}, wrote ${n} bytes`);
