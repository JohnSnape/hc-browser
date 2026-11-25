#!/usr/bin/env node
/* cards-verify.js DIR OUT.txt [SHOT.rgb ...] -- checks what cards.hts did, with the project's libraries.
 *   DIR: the files extracted from the disk after the run (CiderPress II NAPS names)
 *   OUT.txt: the run's log (LF line ends); SHOT: 640x200 RGB captures (png2rgb.ps1)
 * Every edited resource is compared byte for byte with what lib/cursor.js, lib/version.js, lib/sound.js,
 * lib/font.js and lib/pattern.js write for the same edit; the pattern also on the IIGS screen. */
'use strict';
const fs = require('fs'), path = require('path');
for (const l of ['rsrc', 'cursor', 'version', 'sound', 'font', 'pattern', 'shr']) require(path.join(__dirname, '../../../lib', l + '.js'));
const { RSRC, CURSOR, VERSION, SOUND, FONT, PATTERN, SHR } = globalThis;
const M = require('./cards-make.js');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fails++; };
const same = (a, b) => a && b && Buffer.from(a).equals(Buffer.from(b));
const [dir, outFile, ...shots] = process.argv.slice(2);
const file = n => fs.readFileSync(path.join(dir, n));
const log = fs.readFileSync(outFile, 'latin1');

check(/editor version=RSRC 1\.0/.test(log), "the editor's scripts reach the XFCN in its own fork (RSRC 1.0, not Home's RSRC H.0)");

// ---- cursors
{
  const k = new RSRC.Fork(file('Test.Cursors#060000r')), names = k.names(0x8027);
  check(k.list(0x8027).map(r => r.id).join() === '300,310,311', 'cursor IDs 300,310,311: ' + k.list(0x8027).map(r => r.id).join());
  check(names.get(300) === 'Arrow' && names.get(310) === 'Edited' && names.get(311) === 'Small', 'cursor names: ' + [...names].map(([i, n]) => i + '=' + n).join(' '));
  check(same(k.get(0x8027, 300), CURSOR.write(M.arrow())), 'cursor 300 unchanged, byte for byte');
  const e = M.arrow(), at = (c, x, y, kind) => CURSOR.setKind(c, y * c.w + x, kind);
  at(e, 2, 1, 'v1'); at(e, 5, 3, 'invert'); at(e, 0, 0, 'clear'); at(e, 15, 7, 'v3'); e.hotX = 7; e.hotY = 2;
  check(same(k.get(0x8027, 310), CURSOR.write(e)), 'cursor 310 (four pixels and the hot spot edited) equals lib/cursor.js, byte for byte');
  const p = CURSOR.parse(k.get(0x8027, 310));
  check(p.hotX === 7 && p.hotY === 2 && CURSOR.kindOf(p, 1 * 16 + 2) === 'v1' && CURSOR.kindOf(p, 3 * 16 + 5) === 'invert', 'cursor 310 reads back: hot spot 7,2, pixel kinds as edited');
  const s = CURSOR.blank(8, 4); at(s, 0, 0, 'v0'); at(s, 7, 3, 'v0'); at(s, 3, 1, 'invert'); s.hotX = 3; s.hotY = 1;
  check(same(k.get(0x8027, 311), CURSOR.write(s)), 'cursor 311 (new, 8 x 4) equals lib/cursor.js, byte for byte');
}
// ---- version
{
  const k = new RSRC.Fork(file('Test.Version#060000r'));
  const e = Object.assign(M.version1(), { major: 2, bug: 7, stage: 0x40, country: 1, name: 'Changed on the IIGS' });
  const v1 = k.get(0x8029, 1);
  check(same(v1, VERSION.write(e)), 'version 1 (major, bug, stage, region, name edited) equals lib/version.js, byte for byte');
  check(v1 && VERSION.format(VERSION.parse(v1)) === '2.2.7a4', 'version 1 reads ' + (v1 && VERSION.format(VERSION.parse(v1))));
  check(same(k.get(0x8029, 2), v1), 'version 2 (Save As) is the same record');
  check(/version fields=1\.2\.3 beta 4 0 Test\/made by lib\/version\.js/.test(log), 'the card showed 1.2.3 beta 4, region 0, and both strings');
}
// ---- sounds
{
  const k = new RSRC.Fork(file('Test.Sounds#060000r'));
  const m = /pitch for note=(-?\d+)/.exec(log), P = m ? +m[1] : NaN;
  const want = Math.round(3072 * Math.log2(22050 / 26320));
  check(P === want, `"Pitch for Note" for a 22,050 Hz sound at middle C: ${P} (formula: ${want})`);
  const e = Buffer.from(SOUND.write(M.sine()));
  e.writeUInt16LE(P < 0 ? 0x8000 - P : P, 4); e.writeUInt16LE(22050, 8);
  check(same(k.get(0x8024, 400), e), 'sound 400 (rate and pitch edited) equals lib/sound.js with that header, byte for byte');
  const s = SOUND.parse(k.get(0x8024, 400));
  check(s.rate === 22050 && SOUND.signed(s.pitch) === P, `sound 400 reads back: rate ${s.rate}, pitch ${SOUND.signed(s.pitch)}`);
  check(same(k.get(0x8024, 410), SOUND.write(M.beep())) && k.names(0x8024).get(410) === 'Beep', 'sound 410, imported from Test.Snd2, is byte for byte the original, named Beep');
}
// ---- fonts
{
  const nb = file('TestFont.12#C80000'), f = FONT.parse(nb), o = FONT.parse(FONT.write(M.testFont()));
  let others = true;
  for (let c = 0; c < 256; c++) {
    if (c === 65) continue;
    const a = f.glyphs[c], b = o.glyphs[c];
    if (!a !== !b || (a && (a.adv !== b.adv || a.left !== b.left || a.w !== b.w || !same(a.bits, b.bits)))) others = false;
  }
  check(others, 'font: every glyph but A unchanged');
  const A = o.glyphs[65], bits = Uint8Array.from(A.bits);
  bits[2 * 5 + 0] = 1; bits[2 * 5 + 2] = 0; bits[10 * 5 + 2] = 1;
  check(f.glyphs[65].w === 5 && same(f.glyphs[65].bits, bits), 'font: glyph A has the three edited pixels and nothing else changed');
  check(f.glyphs[65].adv === A.adv + 1, `font: glyph A advance ${A.adv} -> ${f.glyphs[65].adv}`);
  check(same(FONT.write(f), nb), 'font: the edited file round-trips through lib/font.js byte for byte');
}
// ---- patterns
let p4 = null;
{
  const d = new Uint8Array(file('Test.Stack#550001'));
  const m = /patterns before=([0-9A-F]{1024})/.exec(log);
  check(!!m, 'the log has the 16 patterns read before editing');
  const st = PATTERN.readStack(d);
  check(PATTERN.stakSum(d) === 0, 'Test.Stack: the STAK checksum sums to 0');
  if (m) {
    const before = []; for (let i = 0; i < 16; i++) before.push(Uint8Array.from(Buffer.from(m[1].slice(64 * i, 64 * i + 64), 'hex')));
    const e = Uint8Array.from(before[4]);
    PATTERN.set(e, 0, 0, 1); PATTERN.set(e, 1, 0, 2); PATTERN.set(e, 2, 1, 3); PATTERN.set(e, 15, 7, 0);
    check(same(st.patterns[4], e), 'pattern 4 has the four edited pixels (lib/pattern.js)');
    let rest = true; for (let i = 0; i < 16; i++) if (i !== 4 && !same(st.patterns[i], before[i])) rest = false;
    check(rest, 'the other 15 patterns unchanged');
    p4 = e;
  }
  check(/opened stack ":HyperCard:Test\.Stack"/.test(log) && /painted/.test(log), 'HyperCard opened the patched stack (no "password" stop) and painted with pattern 4');
}
if (shots.length && p4) {
  const pal = SHR.SETS.system.map(SHR.word2rgb);
  let best = null;
  for (const f of shots) {
    const px = fs.readFileSync(f); let ok = 0, bad = 0;
    for (let y = 62; y <= 117; y++) for (let x = 202; x <= 397; x++) {
      const v = PATTERN.get(p4, x, y), e = pal[SHR.GROUP[x & 3] + v], i = (y * 640 + x) * 3;
      if (px[i] === e[0] && px[i + 1] === e[1] && px[i + 2] === e[2]) ok++; else bad++;
    }
    if (!best || bad < best.bad) best = { f: path.basename(f), ok, bad };
  }
  check(best.bad === 0, `HyperCard painted with the edited pattern: ${best.ok} of ${best.ok + best.bad} pixels as lib/pattern.js predicts (${best.f})`);
}
console.log(fails ? `${fails} check(s) failed` : 'all checks passed');
process.exit(fails ? 1 : 0);
