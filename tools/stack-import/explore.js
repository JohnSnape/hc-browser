// explore.js <stack data fork> [blockType] [n]  -- list blocks; or hex/ascii dump the n-th block of a type
const fs = require('fs'); const d = fs.readFileSync(process.argv[2]); const want = process.argv[3], n = +(process.argv[4] || 0);
let o = 0, k = {}; const blocks = [];
while (o + 12 <= d.length) {
  const size = d.readUInt32LE(o), type = d.toString('latin1', o + 4, o + 8), id = d.readInt32LE(o + 8);
  if (size < 12 || o + size > d.length) { console.log('bad block at', o, size, type); break; }
  blocks.push({ o, size, type, id }); o += size; if (type === 'TAIL') break;
}
if (!want) { const c = {}; blocks.forEach(b => c[b.type] = (c[b.type] || 0) + 1); console.log(c); blocks.filter(b => b.type !== 'FREE').forEach(b => console.log(b.type, 'id', b.id, 'size', b.size, '@', b.o)); }
else {
  const b = blocks.filter(x => x.type === want)[n]; console.log(want, 'id', b.id, 'size', b.size);
  for (let i = 0; i < b.size; i += 16) {
    const row = d.subarray(b.o + i, b.o + Math.min(b.size, i + 16));
    console.log(i.toString(16).padStart(4, '0'), [...row].map(x => x.toString(16).padStart(2, '0')).join(' ').padEnd(48), [...row].map(x => x >= 32 && x < 127 ? String.fromCharCode(x) : '.').join(''));
  }
}
