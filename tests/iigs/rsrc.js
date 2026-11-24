// rsrc.js -- command-line wrapper over lib/rsrc.js for Apple IIGS resource forks.
//   node rsrc.js list <fork>                      list resources (type, id, size, offset; icon sizes)
//   node rsrc.js get  <fork> <type> <id> <out>    save one resource's data
//   node rsrc.js add  <fork> <type> <id> <file>   add a resource (index entry inserted in sorted order)
//   node rsrc.js set  <fork> <type> <id> <file>   replace a resource's data, any size
//   node rsrc.js put  <fork> <type> <id> <file>   same as set (kept for old scripts)
//   node rsrc.js rm   <fork> <type> <id>          delete a resource
//   node rsrc.js name <fork> <type> <id> [name]   set or clear its rResName entry
// <type> and <id> are hex. The fork file is rewritten in place.
require('../../lib/rsrc.js');
const { Fork } = globalThis.RSRC, fs = require('fs');
const [cmd, file, t, id, arg] = process.argv.slice(2);
const f = new Fork(fs.readFileSync(file)), T = parseInt(t, 16), ID = parseInt(id, 16);
const h = (n, w) => '$' + n.toString(16).toUpperCase().padStart(w, '0');
const save = msg => { fs.writeFileSync(file, f.bytes()); console.log(msg); };
if (cmd === 'list') {
  for (const r of f.list()) {
    let extra = '';
    if (r.type === 0x8001) { const b = f.get(r.type, r.id); extra = `  icon type ${h(b[0] | b[1] << 8, 4)} size ${b[2] | b[3] << 8} ${b[6] | b[7] << 8}w x ${b[4] | b[5] << 8}h`; }
    console.log(`${h(r.type, 4)} ${h(r.id, 8)} size ${String(r.size).padStart(6)} @${h(r.offset, 6)}${extra}`);
  }
} else if (cmd === 'get') { const b = f.get(T, ID); if (!b) throw new Error('no such resource'); fs.writeFileSync(arg, b); console.log('saved', b.length, 'bytes'); }
else if (cmd === 'add') { f.add(T, ID, new Uint8Array(fs.readFileSync(arg))); save(`added ${h(T, 4)} ${h(ID, 8)}`); }
else if (cmd === 'set' || cmd === 'put') { f.set(T, ID, new Uint8Array(fs.readFileSync(arg))); save(`set ${h(T, 4)} ${h(ID, 8)}`); }
else if (cmd === 'rm') { f.remove(T, ID); save(`removed ${h(T, 4)} ${h(ID, 8)}`); }
else if (cmd === 'name') { f.setName(T, ID, arg || ''); save(`named ${h(T, 4)} ${h(ID, 8)} ${JSON.stringify(arg || '')}`); }
else console.log('commands: list get add set put rm name');
