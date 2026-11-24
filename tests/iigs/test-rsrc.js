// node test-rsrc.js <original-fork> <proven-fork> <icon.ico>
// <proven-fork> is the fork HyperCard IIGS accepted (icons 30001/30002 added, 30001 named), built by rsrc.js.
// Rebuild the same changes with lib/rsrc.js and compare every resource; then stress add/set/remove.
require('../../lib/rsrc.js');
const { Fork, T_ICON } = globalThis.RSRC, fs = require('fs');
const [origF, provenF, icoF] = process.argv.slice(2);
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const ico = new Uint8Array(fs.readFileSync(icoF));

const f = new Fork(fs.readFileSync(origF));
const before = f.list().map(r => [r.type, r.id, Buffer.from(f.get(r.type, r.id)).toString('hex')]);
f.add(T_ICON, 30001, ico); f.add(T_ICON, 30002, ico); f.setName(T_ICON, 30001, 'Converter Test');
const p = new Fork(fs.readFileSync(provenF));
const key = r => r.type + '/' + r.id;
ok(f.list().map(key).join() === p.list().map(key).join(), 'same resources, same (sorted) order as the proven fork');
ok(f.list().every(r => Buffer.from(f.get(r.type, r.id)).equals(Buffer.from(p.get(r.type, r.id)))), 'every resource\'s data identical to the proven fork');
ok(f.names(T_ICON).get(30001) === 'Converter Test' && f.names(T_ICON).size === 16, 'name table: 16 names incl. Converter Test');

const sorted = x => x.list().every((r, i, a) => !i || a[i - 1].type < r.type || (a[i - 1].type === r.type && a[i - 1].id < r.id));
// stress: remove, shrink, grow, re-add; untouched resources must keep their bytes
const g = new Fork(f.bytes());
g.remove(T_ICON, 30002);
g.set(T_ICON, 0x76C, ico.slice(0, 200));          // shrink an existing icon's data
g.set(T_ICON, 0x770, new Uint8Array(900).fill(7)); // grow another
g.add(T_ICON, 5, ico);                             // insert at the front of the icons
g.setName(T_ICON, 5, 'First'); g.setName(T_ICON, 30001, '');
ok(sorted(g), 'index still sorted after remove / shrink / grow / add');
ok(!g.find(T_ICON, 30002) && g.find(T_ICON, 5), 'remove and add took effect');
ok(Buffer.from(g.get(T_ICON, 0x770)).equals(Buffer.alloc(900, 7)) && g.get(T_ICON, 0x76C).length === 200, 'grown and shrunk data read back');
const untouched = before.filter(([t, id]) => !(t === T_ICON && (id === 0x76C || id === 0x770)) && t !== 0x8014);
ok(untouched.every(([t, id, hex]) => Buffer.from(g.get(t, id)).toString('hex') === hex), 'all other original resources unchanged');
ok(g.names(T_ICON).get(5) === 'First' && !g.names(T_ICON).has(30001), 'names updated');
const h = new Fork(g.bytes()); // re-parse from bytes
ok(h.list().length === g.list().length && sorted(h), 're-parsed fork is consistent');
console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
