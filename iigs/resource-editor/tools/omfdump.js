// omfdump.js <file> -- prints an OMF v2 file's segment header and record counts
const fs = require('fs');
const d = fs.readFileSync(process.argv[2]);
let p = 0;
while (p < d.length) {
  const bytecnt = d.readUInt32LE(p), length = d.readUInt32LE(p + 8), kind = d.readUInt16LE(p + 20);
  const banksize = d.readUInt32LE(p + 16), dispname = d.readUInt16LE(p + 40), dispdata = d.readUInt16LE(p + 42);
  const lablen = d[p + 13], numlen = d[p + 14], ver = d[p + 15];
  let n = p + dispname + 10, segname;
  if (lablen) { segname = d.slice(n, n + lablen).toString('latin1'); } else { segname = d.slice(n + 1, n + 1 + d[n]).toString('latin1'); }
  console.log({ bytecnt, length, kind: kind.toString(16), banksize: banksize.toString(16), lablen, numlen, ver, dispname, dispdata, segname, entry: d.readUInt32LE(p + 36), org: d.readUInt32LE(p + 24), align: d.readUInt32LE(p + 28) });
  let q = p + dispdata; const counts = {};
  while (q < p + bytecnt) {
    const op = d[q];
    counts[op.toString(16)] = (counts[op.toString(16)] || 0) + 1;
    if (op === 0) break;
    if (op === 0xF2) { const l = d.readUInt32LE(q + 1); q += 5 + l; }
    else if (op === 0xE2) q += 11;
    else if (op === 0xF5) q += 7;
    else if (op >= 1 && op <= 0xDF) q += 1 + op;
    else { console.log('unknown op', op.toString(16), 'at', q); break; }
  }
  console.log('records', counts);
  p += bytecnt;
}
