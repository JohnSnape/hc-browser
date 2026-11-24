// rsrc.js -- read / patch Apple IIGS resource forks (Resource Manager format, System 5+).
//   node rsrc.js list <fork>                     list resources (type, id, size, offset)
//   node rsrc.js get <fork> <type> <id> <out>    save one resource's data
//   node rsrc.js put <fork> <type> <id> <file>   overwrite one resource IN PLACE (new data must be the same size)
// Layout: header = rFileVersion(4) rFileToMap(4) rFileMapSize(4) memo(128); the map holds
// mapNext(4) mapFlag(2) mapOffset(4) mapSize(4) mapToIndex(2) mapFileNum(2) mapID(2) mapIndexSize(4)
// mapIndexUsed(4) mapFreeListSize(2) mapFreeListUsed(2), then the free list, then at mapToIndex the
// index: 20-byte entries resType(2) resID(4) resOffset(4) resAttr(2) resSize(4) resHandle(4). All little-endian.
const fs = require('fs');
const [cmd, file, ...a] = process.argv.slice(2);
const d = fs.readFileSync(file);
const mapAt = d.readUInt32LE(4);
// offsets measured on real forks: mapToIndex at +14, mapIndexUsed at +24
const toIndex = d.readUInt16LE(mapAt + 14), used = d.readUInt32LE(mapAt + 24);
const items = [];
for (let i = 0; i < used; i++) {
  const e = mapAt + toIndex + i * 20;
  const type = d.readUInt16LE(e); if (!type) continue;
  items.push({ type, id: d.readUInt32LE(e + 2), off: d.readUInt32LE(e + 6), attr: d.readUInt16LE(e + 10), size: d.readUInt32LE(e + 12) });
}
const h = (n, w) => '$' + n.toString(16).toUpperCase().padStart(w, '0');
const find = (t, id) => items.find(r => r.type === parseInt(t, 16) && r.id === parseInt(id, 16));
if (cmd === 'list') {
  for (const r of items) {
    let extra = '';
    if (r.type === 0x8001) { // rIcon: show the icon record header
      const p = r.off; extra = `  icon type ${h(d.readUInt16LE(p), 4)} size ${d.readUInt16LE(p + 2)} ${d.readUInt16LE(p + 6)}w x ${d.readUInt16LE(p + 4)}h`;
    }
    console.log(`${h(r.type, 4)} ${h(r.id, 8)} size ${String(r.size).padStart(6)} @${h(r.off, 6)}${extra}`);
  }
} else if (cmd === 'get') {
  const r = find(a[0], a[1]); fs.writeFileSync(a[2], d.subarray(r.off, r.off + r.size)); console.log('saved', r.size, 'bytes');
} else if (cmd === 'put') {
  const r = find(a[0], a[1]), nd = fs.readFileSync(a[2]);
  if (nd.length !== r.size) throw new Error(`size mismatch: resource ${r.size}, new ${nd.length}`);
  nd.copy(d, r.off); fs.writeFileSync(file, d); console.log('patched', h(r.type, 4), h(r.id, 8), nd.length, 'bytes');
}
