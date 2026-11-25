#!/usr/bin/env node
/* cards-make.js OUTDIR -- test files for the Cursors, Version, Sounds and Fonts cards, made with the
 * project's libraries, as CiderPress II NAPS files:
 *   Test.Cursors  cursor 300 "Arrow": 16 x 8, every kind of pixel, hot spot 3,4
 *   Test.Version  rVersion 1: 1.2.3b4, region 0, "Test" / "made by lib/version.js"
 *   Test.Sounds   sound 400 "Sine": 600 samples, 11,025 Hz
 *   Test.Snd2     sound 500 "Beep": 300 samples, 22,050 Hz (to import from)
 *   TestFont.12   a $C8 font from FONT.create, with glyphs A (5 wide) and B (4 wide)
 * cards-verify.js rebuilds the same originals from these definitions. */
'use strict';
const fs = require('fs'), path = require('path');
for (const l of ['rsrc', 'cursor', 'version', 'sound', 'font']) require(path.join(__dirname, '../../../lib', l + '.js'));
const { emptyFork } = require('../tools/forktool.js');
const { RSRC, CURSOR, VERSION, SOUND, FONT } = globalThis;

const KINDS = ['clear', 'invert', 'v0', 'v1', 'v2', 'v3'];
function arrow() {
  const c = CURSOR.blank(16, 8); c.hotX = 3; c.hotY = 4;
  for (let r = 0; r < 8; r++) for (let x = 0; x < 16; x++) CURSOR.setKind(c, r * 16 + x, KINDS[(x + r) % 6]);
  return c;
}
const version1 = () => ({ major: 1, minor: 2, bug: 3, stage: 0x60, release: 4, country: 0, name: 'Test', info: 'made by lib/version.js' });
function sine() {
  const d = new Uint8Array(600); for (let i = 0; i < 600; i++) d[i] = Math.round(128 + 100 * Math.sin(i * 2 * Math.PI / 50));
  return { pitch: 0, stereo: 0, rate: 11025, data: d };
}
function beep() {
  const d = new Uint8Array(300); for (let i = 0; i < 300; i++) d[i] = (i >> 4) & 1 ? 200 : 56;
  return { pitch: 0x8123, stereo: 0, rate: 22050, data: d };
}
function testFont() {
  const f = FONT.create('TestFont', 12, 9, 3);
  const glyph = (w, rows) => ({ adv: w + 1, left: 0, w, bits: Uint8Array.from(rows.join('').split('').map(Number)) });
  const pad = (w, top, body) => [...Array(top).fill('0'.repeat(w)), ...body, ...Array(12 - top - body.length).fill('0'.repeat(w))];
  f.glyphs[65] = glyph(5, pad(5, 2, ['00100', '01010', '10001', '10001', '11111', '10001', '10001']));
  f.glyphs[66] = glyph(4, pad(4, 2, ['1110', '1001', '1110', '1001', '1001', '1001', '1110']));
  return f;
}
module.exports = { arrow, version1, sine, beep, testFont, KINDS };

function fork(entries) {
  const k = new RSRC.Fork(emptyFork());
  for (const [type, id, data, name] of entries) { k.add(type, id, data, 0); if (name) k.setName(type, id, name); }
  return k.bytes();
}
if (require.main === module) {
  const out = process.argv[2], put = (n, d) => fs.writeFileSync(path.join(out, n), d);
  put('Test.Cursors#060000', Buffer.alloc(0)); put('Test.Cursors#060000r', fork([[0x8027, 300, CURSOR.write(arrow()), 'Arrow']]));
  put('Test.Version#060000', Buffer.alloc(0)); put('Test.Version#060000r', fork([[0x8029, 1, VERSION.write(version1())]]));
  put('Test.Sounds#060000', Buffer.alloc(0)); put('Test.Sounds#060000r', fork([[0x8024, 400, SOUND.write(sine()), 'Sine']]));
  put('Test.Snd2#060000', Buffer.alloc(0)); put('Test.Snd2#060000r', fork([[0x8024, 500, SOUND.write(beep()), 'Beep']]));
  put('TestFont.12#C80000', FONT.write(testFont()));
  console.log('test files written');
}
