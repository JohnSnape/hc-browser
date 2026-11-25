#!/usr/bin/env node
/* forktool.js -- small host-side helpers for the IIGS resource editor build and tests.
 *
 *   node forktool.js add <fork|-> <out> <type> <id> <name> <datafile> [attr]
 *        add (or replace) one resource; "-" starts from an empty fork
 *   node forktool.js list <fork> [type]
 *   node forktool.js get <fork> <type> <id> <out>
 *   node forktool.js boot <HomeDataFork> <out> <bootPath>
 *        rewrite Home's startUp..resume handlers, at the same length, so startUp
 *        loads the HyperTalk in <bootPath> into this card's script and sends it "boot"
 *
 * Types and IDs: decimal or $hex. Uses lib/rsrc.js (sorted index, rResName names).
 */
'use strict';
const fs = require('fs'), path = require('path');
require(path.join(__dirname, '../../../lib/rsrc.js'));
const { Fork } = globalThis.RSRC;

const CR = String.fromCharCode(13);
const num = s => (String(s).startsWith('$') ? parseInt(s.slice(1), 16) : parseInt(s, 10)) >>> 0;

/* an empty resource fork: 140-byte header, map with 10 free-list slots and 32 index entries.
 * The index starts 4 bytes after the free list (map + 36 + 8 x slots), as in forks the Resource
 * Manager makes (CreateResourceFile: map + 116 for 10 slots) and in Apple's Home. At map + 112
 * HyperCard IIGS could not use the fork at all. */
function emptyFork() {
  const F = 10, N = 32, toIndex = 36 + F * 8, mapSize = toIndex + N * 20, map = 140, eof = map + mapSize;
  const d = Buffer.alloc(eof);
  d.writeUInt32LE(0, 0); d.writeUInt32LE(map, 4); d.writeUInt32LE(mapSize, 8);
  d.writeUInt32LE(map, map + 6); d.writeUInt32LE(mapSize, map + 10); d.writeUInt16LE(toIndex, map + 14);
  d.writeUInt32LE(N, map + 20); d.writeUInt32LE(0, map + 24); d.writeUInt16LE(F, map + 28); d.writeUInt16LE(1, map + 30);
  d.writeUInt32LE(eof, map + 32); d.writeUInt32LE((0x100000000 - eof - 1) >>> 0, map + 36);
  return new Uint8Array(d);
}

/* The startUp handler: user level 5 (scripting), then the boot file becomes this card's script and
 * gets "boot". Run from Git Bash with MSYS2_ARG_CONV_EXCL set, or the ProDOS path argument gets
 * rewritten into a Windows path. */
function bootHandler(bootPath, body) {
  if (!bootPath.startsWith('/')) throw new Error('boot path must be a full ProDOS path, got ' + bootPath);
  const lines = body ? body.split(/\\r|\r|\n/) : [
    'set userLevel to 5',
    'get rsrc("readtext","' + bootPath + '")',
    'set script of this card to it',
    'send "boot" to this card'];
  return ['on startUp', 'getHomeInfo', ...lines, 'end startUp'].join(CR) + CR;
}

if (require.main === module) {
  const [cmd, ...a] = process.argv.slice(2);
  if (cmd === 'add') {
    const [src, out, type, id, name, file, attr] = a;
    const k = new Fork(src === '-' ? emptyFork() : fs.readFileSync(src));
    const t = num(type), i = num(id), data = new Uint8Array(fs.readFileSync(file));
    if (k.find(t, i)) k.remove(t, i);
    k.add(t, i, data, attr != null ? num(attr) : 0);
    if (name) k.setName(t, i, name);
    fs.writeFileSync(out, k.bytes());
    console.log(`added $${t.toString(16)}/${i} (${data.length} bytes${name ? ', "' + name + '"' : ''}) -> ${out}`);
  } else if (cmd === 'list') {
    const k = new Fork(fs.readFileSync(a[0]));
    const t = a[1] != null ? num(a[1]) : null;
    const names = {};
    for (const r of k.list(t)) {
      if (!names[r.type]) names[r.type] = k.names(r.type);
      console.log(`$${r.type.toString(16)} ${r.id} attr $${r.attr.toString(16)} size ${r.size} ${names[r.type].get(r.id) || ''}`);
    }
  } else if (cmd === 'get') {
    const k = new Fork(fs.readFileSync(a[0]));
    const b = k.get(num(a[1]), num(a[2]));
    if (!b) { console.error('not found'); process.exit(1); }
    fs.writeFileSync(a[3], b);
  } else if (cmd === 'boot') {
    const [src, out, bootPath] = a;
    const d = fs.readFileSync(src);
    const s = d.toString('latin1');
    const from = s.indexOf('on startUp' + CR), endTag = 'end resume' + CR, to = s.indexOf(endTag, from) + endTag.length;
    if (from < 0 || to < endTag.length) throw new Error('startUp..resume handlers not found');
    const old = to - from;
    let neu = bootHandler(bootPath, process.env.BOOT_BODY); // BOOT_BODY: diagnostics only
    if (neu.length + 3 > old) throw new Error(`boot handler too long (${neu.length} > ${old})`);
    neu += '--' + ' '.repeat(old - neu.length - 3) + CR;
    d.write(neu, from, 'latin1');
    fs.writeFileSync(out, d);
    console.log(`startUp rewritten in place (${old} bytes)`);
  } else {
    console.error('usage: forktool.js add|list|get|boot ...'); process.exit(2);
  }
}
module.exports = { emptyFork, num };
