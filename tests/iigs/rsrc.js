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
} else if (cmd === 'add') {
  // add <fork> <type> <id> <file> [attrFromType attrFromId]: append the data at end of file, take it from
  // the open-ended free block that starts there, and use the next spare index slot.
  const [t, id, src] = a, nd = fs.readFileSync(src);
  if (find(t, id)) throw new Error('resource already exists');
  const indexSize = d.readUInt32LE(mapAt + 20), freeUsed = d.readUInt16LE(mapAt + 30);
  if (used >= indexSize) throw new Error('no spare index slot');
  const eof = d.length; let fb = -1;
  for (let i = 0; i < freeUsed; i++) { const e = mapAt + 32 + i * 8; if (d.readUInt32LE(e) === eof) fb = e; }
  if (fb < 0) throw new Error('no free block at end of file');
  d.writeUInt32LE(eof + nd.length, fb); d.writeUInt32LE(d.readUInt32LE(fb + 4) - nd.length, fb + 4);
  // The index is kept sorted by type, then ID (true of every fork seen; the Resource Manager relies on it:
  // an entry appended out of order is never found). Insert in order, shifting later entries down.
  const T = parseInt(t, 16), ID = parseInt(id, 16), base = mapAt + toIndex;
  let pos = 0;
  while (pos < used) { const q = base + pos * 20, qt = d.readUInt16LE(q), qi = d.readUInt32LE(q + 2); if (qt > T || (qt === T && qi > ID)) break; pos++; }
  d.copy(d, base + (pos + 1) * 20, base + pos * 20, base + used * 20);
  const like = items.find(r => r.type === T), e = base + pos * 20;
  d.writeUInt16LE(T, e); d.writeUInt32LE(ID, e + 2); d.writeUInt32LE(eof, e + 6);
  d.writeUInt16LE(like ? like.attr : 0, e + 10); d.writeUInt32LE(nd.length, e + 12); d.writeUInt32LE(0, e + 16);
  d.writeUInt32LE(used + 1, mapAt + 24);
  fs.writeFileSync(file, Buffer.concat([d, nd]));
  console.log('added', h(parseInt(t, 16), 4), h(parseInt(id, 16), 8), nd.length, 'bytes at', eof, 'attr', h(like ? like.attr : 0, 4));
} else if (cmd === 'set') {
  // set <fork> <type> <id> <file>: replace a resource with data of ANY size. The new copy is appended at
  // end of file (taken from the open-ended free block there) and the index entry repointed; the old
  // space is left unused.
  const [t, id, src] = a, nd = fs.readFileSync(src), r = find(t, id);
  if (!r) throw new Error('no such resource');
  const freeUsed = d.readUInt16LE(mapAt + 30), eof = d.length; let fb = -1;
  for (let i = 0; i < freeUsed; i++) { const e = mapAt + 32 + i * 8; if (d.readUInt32LE(e) === eof) fb = e; }
  if (fb < 0) throw new Error('no free block at end of file');
  d.writeUInt32LE(eof + nd.length, fb); d.writeUInt32LE(d.readUInt32LE(fb + 4) - nd.length, fb + 4);
  for (let i = 0; i < used; i++) {
    const e = mapAt + toIndex + i * 20;
    if (d.readUInt16LE(e) === r.type && d.readUInt32LE(e + 2) === r.id) { d.writeUInt32LE(eof, e + 6); d.writeUInt32LE(nd.length, e + 12); }
  }
  fs.writeFileSync(file, Buffer.concat([d, nd]));
  console.log('replaced', h(r.type, 4), h(r.id, 8), r.size, '->', nd.length, 'bytes, now at', eof);
} else if (cmd === 'put') {
  const r = find(a[0], a[1]), nd = fs.readFileSync(a[2]);
  if (nd.length !== r.size) throw new Error(`size mismatch: resource ${r.size}, new ${nd.length}`);
  nd.copy(d, r.off); fs.writeFileSync(file, d); console.log('patched', h(r.type, 4), h(r.id, 8), nd.length, 'bytes');
}
