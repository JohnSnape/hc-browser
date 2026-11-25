#!/usr/bin/env node
/* icons-make.js OUTDIR -- the test file for the Icons card: OUTDIR/Test.Icons#060000 (empty data
 * fork) and OUTDIR/Test.Icons#060000r (resource fork) with two icons made by lib/shr.js:
 *   200 "Sample": color, 10 x 8 icon pixels (20 x 8 screen pixels), value (c + 2r) % 4,
 *                 clear at the top-left 4 and bottom-right 4 pixels
 *   201 "Mono":   black and white, 4 x 3 icon pixels, all value 0 (opaque)
 * The same definition is used by icons-verify.js. */
'use strict';
const fs = require('fs'), path = require('path');
require(path.join(__dirname, '../../../lib/shr.js'));
require(path.join(__dirname, '../../../lib/rsrc.js'));
const { emptyFork } = require('../tools/forktool.js');

function sample() {
  const w = 20, h = 8, val = new Uint8Array(w * h), mask = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const clear = (r === 0 && c < 4) || (r === h - 1 && c >= w - 4);
    val[r * w + c] = (c + 2 * r) % 4; mask[r * w + c] = clear ? 0 : 1;
  }
  return { w, h, val, mask };
}
module.exports = { sample };

if (require.main === module) {
  const out = process.argv[2];
  const k = new RSRC.Fork(emptyFork());
  const s = sample();
  k.add(0x8001, 200, SHR.iconFromPixels(s.val, s.mask, s.w, s.h, 0x8000), 0); k.setName(0x8001, 200, 'Sample');
  k.add(0x8001, 201, SHR.iconFromPixels(new Uint8Array(24), new Uint8Array(24).fill(1), 8, 3, 0), 0); k.setName(0x8001, 201, 'Mono');
  fs.writeFileSync(path.join(out, 'Test.Icons#060000'), Buffer.alloc(0));
  fs.writeFileSync(path.join(out, 'Test.Icons#060000r'), k.bytes());
  console.log('Test.Icons written');
}
