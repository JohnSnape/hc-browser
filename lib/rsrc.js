/* rsrc.js — Apple IIGS resource forks (Resource Manager files), for the browser and Node.
 *
 * Layout (offsets measured on Apple's own forks, see tests/iigs):
 *   header: rFileVersion(4) rFileToMap(4) rFileMapSize(4) memo(128)
 *   map:    mapNext(4) mapFlag(2) mapOffset(4) mapSize(4) mapToIndex(2) mapFileNum(2) mapID(2)
 *           mapIndexSize(4) mapIndexUsed(4) mapFreeListSize(2) mapFreeListUsed(2) freeList[size] (8 bytes each:
 *           offset(4) size(4)) ... index at mapToIndex: entries of 20 bytes
 *           resType(2) resID(4) resOffset(4) resAttr(2) resSize(4) resHandle(4). All little-endian.
 * Rules learned in HyperCard IIGS 1.1 (emulated):
 *   - the index must stay SORTED by type, then ID; an entry out of order is never found;
 *   - rResName ($8014) entries are optional for using a resource by ID (names are for pickers).
 * New data is appended at end of file, taken from the open-ended free block that starts there.
 * Space a resource gives up (replace with a different size, delete) goes back on the free list if it has room.
 * Classic script: sets globalThis.RSRC.
 */
(function (root) {
  'use strict';
  const T_ICON = 0x8001, T_RESNAME = 0x8014;

  function u16(d, o) { return d[o] | d[o + 1] << 8; }
  function u32(d, o) { return (d[o] | d[o + 1] << 8 | d[o + 2] << 16 | d[o + 3] << 24) >>> 0; }
  function w16(d, o, v) { d[o] = v & 255; d[o + 1] = v >> 8 & 255; }
  function w32(d, o, v) { d[o] = v & 255; d[o + 1] = v >>> 8 & 255; d[o + 2] = v >>> 16 & 255; d[o + 3] = v >>> 24 & 255; }

  class Fork {
    constructor(bytes) {
      this.d = bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes);
      if (this.d.length < 140 || u32(this.d, 0) !== 0) throw new Error('Not an IIGS resource fork (bad header).');
      this.map = u32(this.d, 4);
      if (this.map + 32 > this.d.length) throw new Error('Not an IIGS resource fork (map outside the file).');
    }
    get toIndex() { return this.map + u16(this.d, this.map + 14); }
    get indexSize() { return u32(this.d, this.map + 20); }
    get used() { return u32(this.d, this.map + 24); }
    set used(v) { w32(this.d, this.map + 24, v); }
    get freeSize() { return u16(this.d, this.map + 28); }
    get freeUsed() { return u16(this.d, this.map + 30); }
    set freeUsed(v) { w16(this.d, this.map + 30, v); }

    entry(i) { const e = this.toIndex + i * 20, d = this.d; return { i, e, type: u16(d, e), id: u32(d, e + 2), offset: u32(d, e + 6), attr: u16(d, e + 10), size: u32(d, e + 12) }; }
    list(type) { const out = []; for (let i = 0; i < this.used; i++) { const r = this.entry(i); if (r.type && (type == null || r.type === type)) out.push(r); } return out; }
    find(type, id) { return this.list(type).find(r => r.id === id) || null; }
    get(type, id) { const r = this.find(type, id); return r ? this.d.slice(r.offset, r.offset + r.size) : null; }

    // take n bytes at end of file from the open-ended free block; returns the offset
    _alloc(n) {
      const eof = this.d.length;
      for (let i = 0; i < this.freeUsed; i++) {
        const f = this.map + 32 + i * 8;
        if (u32(this.d, f) === eof) { w32(this.d, f, eof + n); w32(this.d, f + 4, u32(this.d, f + 4) - n); const g = new Uint8Array(eof + n); g.set(this.d); this.d = g; return eof; }
      }
      throw new Error('This fork has no free space at its end; it cannot grow.');
    }
    // give a block back to the free list if there is a spare slot (otherwise it just stays unused)
    _free(offset, size) {
      if (!size || this.freeUsed >= this.freeSize) return;
      // keep the open-ended end-of-file block last, as Apple's forks have it
      const n = this.freeUsed, slot = k => this.map + 32 + k * 8;
      let j = -1; for (let k = 0; k < n; k++) if (u32(this.d, slot(k)) === this.d.length) j = k;
      if (j >= 0) {
        const eo = u32(this.d, slot(j)), es = u32(this.d, slot(j) + 4);
        w32(this.d, slot(j), offset); w32(this.d, slot(j) + 4, size);
        w32(this.d, slot(n), eo); w32(this.d, slot(n) + 4, es);
      } else { w32(this.d, slot(n), offset); w32(this.d, slot(n) + 4, size); }
      this.freeUsed = n + 1;
      this.d.fill(0, offset, offset + size);
    }

    /* add a new resource, its index entry inserted in sorted position */
    add(type, id, data, attr) {
      if (this.find(type, id)) throw new Error('Resource $' + type.toString(16) + '/' + id + ' already exists.');
      if (this.used >= this.indexSize) throw new Error('The fork index is full (' + this.indexSize + ' entries).');
      const off = this._alloc(data.length); this.d.set(data, off);
      const like = this.list(type)[0];
      let pos = 0;
      while (pos < this.used) { const q = this.entry(pos); if (q.type > type || (q.type === type && q.id > id)) break; pos++; }
      const base = this.toIndex;
      this.d.copyWithin(base + (pos + 1) * 20, base + pos * 20, base + this.used * 20);
      const e = base + pos * 20;
      w16(this.d, e, type); w32(this.d, e + 2, id); w32(this.d, e + 6, off);
      w16(this.d, e + 10, attr != null ? attr : like ? like.attr : 0); w32(this.d, e + 12, data.length); w32(this.d, e + 16, 0);
      this.used = this.used + 1;
    }
    /* replace a resource's data (any size) */
    set(type, id, data) {
      const r = this.find(type, id);
      if (!r) return this.add(type, id, data);
      if (data.length === r.size) { this.d.set(data, r.offset); return; }
      if (data.length < r.size) { this.d.set(data, r.offset); w32(this.d, r.e + 12, data.length); this._free(r.offset + data.length, r.size - data.length); return; }
      const off = this._alloc(data.length); this.d.set(data, off);
      const e = this.find(type, id).e; // index position unchanged by _alloc
      w32(this.d, e + 6, off); w32(this.d, e + 12, data.length);
      this._free(r.offset, r.size);
    }
    remove(type, id) {
      const r = this.find(type, id); if (!r) return;
      const base = this.toIndex;
      this.d.copyWithin(base + r.i * 20, base + (r.i + 1) * 20, base + this.used * 20);
      this.d.fill(0, base + (this.used - 1) * 20, base + this.used * 20);
      this.used = this.used - 1;
      this._free(r.offset, r.size);
    }

    /* rResName: names for one resource type, kept in resource $8014 / ID $0001xxxx */
    names(type) {
      const b = this.get(T_RESNAME, 0x10000 | type), m = new Map();
      if (!b) return m;
      let o = 6; const n = u32(b, 2);
      for (let i = 0; i < n && o + 5 <= b.length; i++) { const id = u32(b, o), len = b[o + 4]; m.set(id, String.fromCharCode(...b.subarray(o + 5, o + 5 + len))); o += 5 + len; }
      return m;
    }
    setNames(type, m) {
      // keep the table's existing order (Apple's isn't sorted) and append new names at the end
      const ents = [...m.entries()].filter(([, s]) => s);
      let n = 6; for (const [, s] of ents) n += 5 + Math.min(255, s.length);
      const b = new Uint8Array(n); w16(b, 0, 1); w32(b, 2, ents.length);
      let o = 6;
      for (const [id, s] of ents) { const t = s.slice(0, 255); w32(b, o, id); b[o + 4] = t.length; for (let k = 0; k < t.length; k++) b[o + 5 + k] = t.charCodeAt(k) & 255; o += 5 + t.length; }
      if (ents.length) this.set(T_RESNAME, 0x10000 | type, b); else this.remove(T_RESNAME, 0x10000 | type);
    }
    setName(type, id, name) { const m = this.names(type); if (name) m.set(id, name); else m.delete(id); this.setNames(type, m); }

    bytes() { return this.d; }
  }

  root.RSRC = { Fork, T_ICON, T_RESNAME };
})(typeof window !== 'undefined' ? window : globalThis);
