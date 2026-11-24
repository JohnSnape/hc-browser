// node test-sound.js <fork with $8024 sounds, e.g. HyperCard IIGS's own>
// Every sound must write back byte for byte, its stored relative pitch must come back from the Technical Note #3
// formula (using the pitch it implies), and a new sound must hold whole pages with no $00 byte.
require('../../lib/rsrc.js'); require('../../lib/sound.js');
const { RSRC, SOUND } = globalThis, fs = require('fs');
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const f = new RSRC.Fork(fs.readFileSync(process.argv[2])), names = f.names(0x8024);
for (const r of f.list(0x8024)) {
  const b = f.get(r.type, r.id), s = SOUND.parse(b), name = names.get(r.id) || r.id;
  ok(Buffer.from(SOUND.writeExact(s)).equals(Buffer.from(b)), `${name}: writes back byte for byte (${s.data.length} bytes, ${s.pages} pages, rate ${s.rate})`);
  if (s.rate) {
    const hz = SOUND.MIDDLE_C * s.rate / SOUND.playRate(s.pitch);
    ok(SOUND.pitchFor(hz, s.rate) === s.pitch, `${name}: relative pitch $${s.pitch.toString(16)} = sampled at ${hz.toFixed(1)} Hz, recomputed exactly`);
  }
}
const n = new Uint8Array(1000).fill(0); n[5] = 200;
const w = SOUND.parse(SOUND.write({ pitch: SOUND.pitchFor(392, 26320), rate: 26320, data: n }));
ok(w.data.length % 256 === 0 && w.pages * 256 === w.data.length && !w.data.includes(0) && w.pitch === 0x8700, 'a new G4 sound: whole pages, no $00, pitch $8700 (-7 semitones)');
console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
