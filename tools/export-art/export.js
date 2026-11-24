// export.js -- export the artwork on Apple IIGS disk images (icons, cursors, sounds, patterns, menus, fonts) as
// PNG/WAV/text files, plus index.html and a CSV.
//
//   node tools/export-art/export.js <output folder> <disk image> [disk image ...]
//   A disk image given as  image::Folder:File  contributes only that file's cursors, sounds and (for HyperCard)
//   its built-in pattern table, e.g. HyperCard.hdv::HyperCardIIGS. Given as  image::stacks  it contributes only
//   the paint patterns of every HyperCard IIGS stack on it. A ROM 03 image given as  Rom.03::rom  adds the
//   system font (Shaston 8, built into ROM, no file on any disk) and is needed for the menus (their font and
//   the color Apple logo).
// Patterns: each stack's 16 paint patterns (STAK +$200), drawn in the stack's own color set, as a 4 x 4 tiled
//   swatch at double size, plus one sheet per stack in Patterns-palette order. HyperCard's built-in table is
//   found in HyperCard's data fork as 16 consecutive 32-byte entries at least 14 of which equal patterns seen in
//   the stacks (process the stacks first).
//
// Cursors: every rCursor ($8027) resource, drawn as on screen (screen = (screen OR mask) XOR image): solid pixels
//   in their color, invert pixels as half-transparent black (they flip whatever is under them), see-through
//   pixels transparent; at double size, plus a copy with the hot spot outlined in red (<name>_hot.png).
// Sounds: every rSoundSample ($8024) resource, including System:Sounds files (type $D8 aux $0003 = "Sampled
//   Sound Resource": empty data fork, the sound in the resource fork), as an 8-bit mono WAV at the rate in its
//   header, plus a waveform PNG. ($D8 aux $0004 wave banks are not decoded: no File Type Note describes them.)
//
// Icons: every rIcon ($8001) resource in every resource fork, and every icon (large and small) in Finder icon
//   files (file type $CA, layout from File Type Note $CA). Drawn as DrawIcon does in 640 mode (one icon pixel =
//   two screen pixels, mask per screen pixel) in the System palette, at double size (each screen pixel 2 x 2),
//   transparent where the mask is off.
// Fonts: every QuickDraw II font file (type $C8) as a labeled glyph grid at double size; from the ROM, Shaston 8
//   as Fonts/Shaston.8 (ROM).png plus the font file Shaston.08 (ROM).fon (byte-identical to the ROM's record).
// Menus: every rMenuBar ($8008) with its rMenu ($8009) and rMenuItem ($800A) resources, drawn at double size as
//   System 6.0.4's Menu Manager draws them (lib/menu.js, matched pixel for pixel against emulator screen dumps):
//   the bar, then each menu pulled down under its selected title; menus in no bar drawn on their own. Each bar
//   and loose menu also gets a .txt listing and a .json file.
// Needs CiderPress II's cp2 (set CP2 to its path, or it looks in D:\cp2_1.2.0_win-x64_sc). The output is the
// disk images' own artwork: keep it out of this repository.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib'), { execFileSync } = require('child_process');
const LIB = path.join(__dirname, '..', '..', 'lib');
require(path.join(LIB, 'shr.js')); require(path.join(LIB, 'rsrc.js')); require(path.join(LIB, 'font.js')); require(path.join(LIB, 'cursor.js')); require(path.join(LIB, 'sound.js')); require(path.join(LIB, 'pattern.js')); require(path.join(LIB, 'menu.js'));
const { SHR, RSRC, FONT, CURSOR, SOUND, PATTERN, MENU } = globalThis;
const CP2 = process.env.CP2 || 'D:\\cp2_1.2.0_win-x64_sc\\cp2.exe';

// ---------- PNG ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function png(w, h, rgba) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// ---------- tiny 3x5 label font (hex digits, a few letters) ----------
// each character: 5 rows of 3 bits, leftmost pixel = bit 2
const FONT3x5 = {
  '0': [7, 5, 5, 5, 7], '1': [2, 6, 2, 2, 7], '2': [7, 1, 7, 4, 7], '3': [7, 1, 7, 1, 7], '4': [5, 5, 7, 1, 1], '5': [7, 4, 7, 1, 7], '6': [7, 4, 7, 5, 7], '7': [7, 1, 1, 1, 1],
  '8': [7, 5, 7, 5, 7], '9': [7, 5, 7, 1, 7], 'A': [2, 5, 7, 5, 5], 'B': [6, 5, 6, 5, 6], 'C': [7, 4, 4, 4, 7], 'D': [6, 5, 5, 5, 6], 'E': [7, 4, 6, 4, 7], 'F': [7, 4, 6, 4, 4],
  '$': [3, 6, 2, 3, 6], '-': [0, 0, 7, 0, 0], 'M': [5, 7, 7, 5, 5], 'S': [7, 4, 7, 1, 7], ' ': [0, 0, 0, 0, 0] };
function drawLabel(img, W, x0, y0, text, s, rgb) {
  let x = x0;
  for (const ch of text) { const g = FONT3x5[ch] || FONT3x5['-']; for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r] >> (2 - c) & 1) fillRect(img, W, x + c * s, y0 + r * s, s, s, rgb); x += 4 * s; }
}
function fillRect(img, W, x, y, w, h, rgb, a) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { if (xx < 0 || xx >= W) continue; const q = (yy * W + xx) * 4; if (q < 0 || q >= img.length) continue; img[q] = rgb[0]; img[q + 1] = rgb[1]; img[q + 2] = rgb[2]; img[q + 3] = a == null ? 255 : a; } }

// ---------- icons ----------
const PAL = SHR.SETS.system.map(SHR.word2rgb);
function iconPNG(rec, scale) {
  const p = SHR.iconToPixels(rec), W = p.w * scale, H = p.h * scale, img = new Uint8Array(W * H * 4);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { const k = y * p.w + x; if (p.mask[k]) fillRect(img, W, x * scale, y * scale, scale, scale, PAL[SHR.GROUP[x & 3] + p.val[k]]); }
  return { buf: png(W, H, img), w: p.w, h: p.h, type: p.type };
}
// sounds: a standard WAV (8-bit unsigned mono) at the rate in the resource header (26,320 Hz if it says 0),
// with trailing $00 end marks removed; and a waveform picture
function wav(data, rate) {
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate, 28); h.writeUInt16LE(1, 32); h.writeUInt16LE(8, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40); return Buffer.concat([h, Buffer.from(data)]);
}
function wavePNG(data, W, H) {
  const img = new Uint8Array(W * H * 4); fillRect(img, W, 0, 0, W, H, [248, 247, 244]); fillRect(img, W, 0, H >> 1, W, 1, [200, 200, 200]);
  for (let x = 0; x < W && data.length; x++) {
    const a = Math.floor(x / W * data.length), b = Math.max(a + 1, Math.floor((x + 1) / W * data.length)); let lo = 255, hi = 0;
    for (let i = a; i < b && i < data.length; i++) { lo = Math.min(lo, data[i]); hi = Math.max(hi, data[i]); }
    const y0 = Math.round(H - hi / 255 * H), y1 = Math.round(H - lo / 255 * H); fillRect(img, W, x, y0, 1, Math.max(1, y1 - y0), [47, 95, 208]);
  }
  return png(W, H, img);
}
// patterns: a tiled swatch (tx x ty tiles of 16 x 8 screen pixels) in a 16-color set, each pixel s x s
function patternRGBA(p, colors, tx, ty, s, img, W, ox, oy) {
  const pal = colors.map(SHR.word2rgb);
  for (let y = 0; y < 8 * ty; y++) for (let x = 0; x < 16 * tx; x++) fillRect(img, W, ox + x * s, oy + y * s, s, s, pal[SHR.GROUP[x & 3] + PATTERN.get(p, x, y)]);
}
function patternPNG(p, colors) { const W = 16 * 4 * 2, H = 8 * 4 * 2, img = new Uint8Array(W * H * 4); patternRGBA(p, colors, 4, 4, 2, img, W, 0, 0); return png(W, H, img); }
// a sheet in Patterns-palette order: column 3 = patterns 0-7, column 4 = 8-15, labeled with set pattern numbers
function patternSheet(pats, colors) {
  const sw = 16 * 2 * 2, sh = 8 * 2 * 2, pad = 6, labelH = 14, cellW = sw + pad * 2, cellH = sh + labelH + pad, W = cellW * 2, H = cellH * 8, img = new Uint8Array(W * H * 4);
  fillRect(img, W, 0, 0, W, H, [255, 255, 255]);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 2; c++) {
    const i = r + c * 8, x = c * cellW + pad, y = r * cellH + pad; patternRGBA(pats[i], colors, 2, 2, 2, img, W, x, y);
    drawLabel(img, W, x, y + sh + 3, String(PATTERN.hyperTalkNumber(i)), 2, [90, 90, 90]);
  }
  return png(W, H, img);
}
function cursorPNG(rec, scale, markHot) {
  const c = CURSOR.parse(rec), W = c.w * scale, H = c.h * scale, img = new Uint8Array(W * H * 4);
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const k = y * c.w + x, kind = CURSOR.kindOf(c, k);
    if (kind === 'clear') continue;
    if (kind === 'invert' || kind === 'mix') fillRect(img, W, x * scale, y * scale, scale, scale, [0, 0, 0], 128);
    else fillRect(img, W, x * scale, y * scale, scale, scale, PAL[SHR.GROUP[x & 3] + +kind[1]]);
  }
  if (markHot) { // a red outline around the hot-spot pixel
    const hx = c.hotX * scale, hy = c.hotY * scale, red = [230, 30, 30];
    fillRect(img, W, hx - 1, hy - 1, scale + 2, 1, red); fillRect(img, W, hx - 1, hy + scale, scale + 2, 1, red);
    fillRect(img, W, hx - 1, hy - 1, 1, scale + 2, red); fillRect(img, W, hx + scale, hy - 1, 1, scale + 2, red);
  }
  return { buf: png(W, H, img), c };
}
// Finder icon file ($CA), File Type Note $CA: header 26 bytes (+4 iBlkID must be 1, +10 16-byte name), then
// Icon Data records: iDataLen (0 ends), 64-byte owner path, 16-byte name, type, aux, big icon, small icon.
function readIconFile(d) {
  if (d.length < 26 || (d[4] | d[5] << 8) !== 1) throw new Error('not a Finder icon file (iBlkID != 1)');
  const out = []; let o = 26;
  const iconLen = at => { const size = d[at + 2] | d[at + 3] << 8; return 8 + 2 * size; };
  while (o + 2 <= d.length) {
    const len = d[o] | d[o + 1] << 8; if (!len) break;
    const pstr = (at, max) => { const n = Math.min(d[at], max - 1); return Buffer.from(d.subarray(at + 1, at + 1 + n)).toString('latin1'); };
    const owner = pstr(o + 2, 64), name = pstr(o + 66, 16), type = d[o + 82] | d[o + 83] << 8, aux = d[o + 84] | d[o + 85] << 8;
    const big = d.subarray(o + 86, o + 86 + iconLen(o + 86)), sOff = o + 86 + big.length, small = d.subarray(sOff, sOff + iconLen(sOff));
    if (86 + big.length + small.length !== len) throw new Error(`icon record ${out.length}: length ${len} != ${86 + big.length + small.length}`);
    out.push({ owner, name, type, aux, big, small }); o += len;
  }
  return out;
}
// ---------- font glyph grid ----------
function fontPNG(f, s) {
  const h = FONT.height(f), codes = []; for (let c = 0; c < 256; c++) if (f.glyphs[c]) codes.push(c); codes.push('missing');
  const span = g => [Math.min(0, g.left), Math.max(g.adv, g.left + g.w)];
  const gw = Math.max(4, ...codes.map(c => { const g = c === 'missing' ? f.missing : f.glyphs[c], [a, b] = span(g); return b - a; }));
  const cellW = Math.max(gw * s + 6, 4 * 3 * s + 6), labelH = 5 * s + 4, cellH = h * s + labelH + 6, cols = 16, rows = Math.ceil(codes.length / cols);
  const W = cols * cellW + 1, H = rows * cellH + 1, img = new Uint8Array(W * H * 4); fillRect(img, W, 0, 0, W, H, [255, 255, 255]);
  codes.forEach((code, i) => {
    const cx = (i % cols) * cellW, cy = ((i / cols) | 0) * cellH, g = code === 'missing' ? f.missing : f.glyphs[code], [a, b] = span(g);
    fillRect(img, W, cx, cy, cellW, 1, [200, 200, 200]); fillRect(img, W, cx, cy, 1, cellH, [200, 200, 200]);
    fillRect(img, W, cx + 1, cy + 2 + f.ascent * s, cellW - 1, 1, [235, 210, 210]); // baseline
    const ox = cx + Math.round((cellW - (b - a) * s) / 2) - a * s, oy = cy + 2;
    for (let y = 0; y < h; y++) for (let x = 0; x < g.w; x++) if (g.bits[y * g.w + x]) fillRect(img, W, ox + (g.left + x) * s, oy + y * s, s, s, [0, 0, 0]);
    const label = code === 'missing' ? 'MS' : code.toString(16).toUpperCase().padStart(2, '0');
    drawLabel(img, W, cx + Math.round((cellW - label.length * 4 * s) / 2), cy + cellH - labelH, label, s, [90, 90, 90]);
  });
  fillRect(img, W, W - 1, 0, 1, H, [200, 200, 200]); fillRect(img, W, 0, H - 1, W, 1, [200, 200, 200]);
  return { buf: png(W, H, img), w: W, h: H, glyphs: codes.length - 1 };
}

// ---------- ROM 03: the system font and the menu bar's Apple logo ----------
// QuickDraw II's GetFont, run in the emulator (tests/iigs/menutest), returns the handle $FC/DD1B, a master
// pointer in ROM to $FC/DD21: the system font record (7-word IIGS header, family $FFFE, Shaston 8), 2,176 bytes.
// The color Apple the Menu Manager draws is a 32-byte mask then a 32-byte 640-mode image (16 x 8), at
// ROM +$181EE and identically in System 6.0.4's System:Tools:Tool015 at +$33B4. Both are read from the user's
// own ROM file and checked, so none of Apple's bitmaps live in this repository.
function readRom(file) {
  const r = fs.readFileSync(file);
  if (r.length !== 262144) throw new Error(file + ': not a 256K ROM 03 image');
  if (r.readUInt32LE(0xDD1B) !== 0xFCDD21) throw new Error(file + ': the system font handle is not at $FC/DD1B (not ROM 03?)');
  const rec = r.subarray(0xDD21, 0xDD21 + 0x1000);
  if (rec.readUInt16LE(2) !== 0xFFFE || rec.readUInt16LE(6) !== 8) throw new Error(file + ': no Shaston 8 at $FC/DD21');
  const font = FONT.parse(new Uint8Array(Buffer.concat([Buffer.from('\x07Shaston', 'latin1'), rec])));
  const fontFile = Buffer.from(FONT.write(font)); // name + the record; byte-identical to the ROM's 2,176 bytes
  const logo = r.subarray(0x181EE, 0x1822E);
  const apple = crc32(logo) === 0xD0C4B60B ? { mask: logo.subarray(0, 32), image: logo.subarray(32, 64) } : null;
  return { font, fontFile, apple };
}
// ---------- menus ----------
function canvasPNG(cv, s, crop) {
  const c = crop || { x: 0, y: 0, w: cv.w, h: cv.h }, W = c.w * s, H = c.h * s, img = new Uint8Array(W * H * 4);
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const v = MENU.colorAt(cv, c.x + x, c.y + y);
    fillRect(img, W, x * s, y * s, s, s, [((v >> 8) & 15) * 17, ((v >> 4) & 15) * 17, (v & 15) * 17]);
  }
  return png(W, H, img);
}
const hex4 = n => '$' + (n >>> 0).toString(16).toUpperCase().padStart(4, '0');
function menuText(m, indent) {
  const p = indent || '', flags = [m.disabled && 'disabled', m.xor && 'XOR highlight', m.custom && 'custom'].filter(Boolean);
  const lines = [`${p}Menu ${JSON.stringify(m.title)}  (rMenu ${hex4(m.resID)}, menuID ${hex4(m.id)}, flags ${hex4(m.flags)}${flags.length ? ': ' + flags.join(', ') : ''})`];
  if (m.itemRefType && m.itemRefType !== 'resource') lines.push(`${p}  (items are set by the program: item refs by ${m.itemRefType})`);
  for (const it of m.items) {
    if (it.title == null) { lines.push(`${p}  ? item ref ${hex4(it.ref)}${it.missing ? ' (missing)' : ''}`); continue; }
    if (it.title === '-') { lines.push(`${p}  ----------------  (rMenuItem ${hex4(it.resID)})`); continue; }
    const extra = [it.char && `Apple-${MENU.keyText(it.char, it.altChar)}`, it.check && `mark ${hex4(it.check)}`, it.disabled && 'disabled', it.divider && 'divider below',
      it.xor && 'XOR highlight', ...MENU.styleNames(it.style)].filter(Boolean);
    lines.push(`${p}  ${it.title.padEnd(24)} ${extra.join(', ')}  (rMenuItem ${hex4(it.resID)}, itemID ${hex4(it.id)}, flags ${hex4(it.flags)})`);
  }
  return lines.join('\r\n');
}

// ---------- main ----------
const safe =s => String(s).replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 60) || 'unnamed';
function main() {
  const [outDir, ...images] = process.argv.slice(2);
  if (!outDir || !images.length) { console.log('usage: node export.js <output folder> <disk image> [...]'); process.exit(1); }
  const iconDir = path.join(outDir, 'Icons'), fontDir = path.join(outDir, 'Fonts'), curDir = path.join(outDir, 'Cursors'), sndDir = path.join(outDir, 'Sounds'), patDir = path.join(outDir, 'Patterns'), menuDir = path.join(outDir, 'Menus');
  for (const d of [iconDir, fontDir, curDir, sndDir, patDir, menuDir, path.join(menuDir, 'Items')]) fs.mkdirSync(d, { recursive: true });
  const knownPatterns = new Set();
  function writePatterns(stem, pats, colors, row) {
    pats.forEach((p, i) => {
      knownPatterns.add(Buffer.from(p).toString('hex'));
      fs.writeFileSync(path.join(patDir, `${stem}_${i}.png`), patternPNG(p, colors));
      add('pattern', `${stem}_${i}.png`, { ...row, id: i, name: `set pattern to ${PATTERN.hyperTalkNumber(i)}`, size: '16x8', png: '128x64', note: row.note + `, bytes ${Buffer.from(p).toString('hex')}` });
    });
    fs.writeFileSync(path.join(patDir, `${stem}_sheet.png`), patternSheet(pats, colors));
  }
  const rows = [], seen = new Set(), errors = [];
  const add = (kind, file, row) => { rows.push({ kind, file, ...row }); };
  // a ROM 03 image (given as  file::rom) first: the system font, and the Menu Manager's Apple logo
  let sys = null; const menuNames = new Map();
  for (const arg of images.filter(a => a.endsWith('::rom'))) {
    const file = arg.slice(0, -5); sys = readRom(file);
    const out = 'Shaston.8 (ROM).png', p = fontPNG(sys.font, 2), fo = sys.font;
    fs.writeFileSync(path.join(fontDir, out), p.buf); fs.writeFileSync(path.join(fontDir, 'Shaston.08 (ROM).fon'), sys.fontFile);
    add('font', out, { disk: path.basename(file), source: 'ROM 03 $FC/DD21 (built in, no file on any disk)', id: fo.family, name: fo.name, size: String(fo.size), png: `${p.w}x${p.h}`,
      note: `${p.glyphs} characters, ascent ${fo.ascent}, descent ${fo.descent}; the IIGS system font, from ROM; font file Shaston.08 (ROM).fon` });
    if (!sys.apple) errors.push(file + ': the Apple logo at +$181EE did not match; menu bars are drawn without it');
  }
  function exportMenus(k, src, disk) {
    if (!sys) { if (k.list(MENU.T_BAR).length || k.list(MENU.T_MENU).length) errors.push(src + ': menus skipped (give a ROM 03 image as  ROM::rom  for the system font)'); return; }
    const stem = safe(src.replace(/:/g, '-')), inBar = new Set(), font = sys.font, G = MENU.G;
    // null = an identical copy was already written (the same program on several disks); a different one with
    // the same name gets the disk's name added
    const nameFor = (base, txt) => { if (!menuNames.has(base)) { menuNames.set(base, txt); return base; } if (menuNames.get(base) === txt) return null; const b2 = base + '_' + safe(disk); menuNames.set(b2, txt); return b2; };
    const writeMenu = (file, m, cv, crop, row) => { fs.writeFileSync(path.join(menuDir, file), canvasPNG(cv, 2, crop)); add('menu', file, row); };
    for (const r of k.list(MENU.T_BAR)) {
      const bar = MENU.readBar(k, r.id);
      MENU.parseBar(k.get(MENU.T_BAR, r.id)).menus.forEach(id => inBar.add(id));
      const txt = [`menu bar rMenuBar ${hex4(r.id)} (flags ${hex4(bar.flags)})`, ...bar.menus.map(m => menuText(m, '  '))].join('\r\n\r\n') + '\r\n';
      const base = nameFor(`${stem}_bar${r.id}`, txt); if (!base) continue;
      const cv = MENU.drawBar(MENU.canvas(640, G.barH), bar, font, { apple: sys.apple });
      fs.writeFileSync(path.join(menuDir, base + '.png'), canvasPNG(cv, 2));
      fs.writeFileSync(path.join(menuDir, base + '.txt'), `${src} (${disk}): ` + txt);
      fs.writeFileSync(path.join(menuDir, base + '.json'), JSON.stringify(bar, null, 1));
      const titles = MENU.titleLayout(bar, font);
      add('menubar', base + '.png', { disk, source: src, id: r.id, name: bar.menus.map(m => m.title === '@' ? 'Apple' : (m.title || '').trim()).join(' | '), size: '640x13', png: '1280x26', note: `${bar.menus.length} menus; text in ${base}.txt, data in ${base}.json` });
      titles.forEach((t, i) => {
        if (t.menu.missing) return;
        const sz = MENU.menuSize(t.menu, font), H = Math.min(200, G.barH + sz.h + 3), mcv = MENU.drawBar(MENU.canvas(640, H), bar, font, { apple: sys.apple, hilite: i });
        MENU.drawMenu(mcv, t.menu, font, t.x, G.barH - 1);
        const file = `${base}_${t.menu.resID}_${safe(t.menu.title === '@' ? 'Apple' : t.menu.title)}.png`;
        writeMenu(file, t.menu, mcv, null, { disk, source: src, id: t.menu.resID, name: t.menu.title === '@' ? 'Apple menu' : (t.menu.title || '').trim(), size: `${sz.w}x${sz.h}`, png: `1280x${H * 2}`,
          note: `menu bar ${r.id}, menu ${i + 1}: ${t.menu.items.length} items${t.menu.disabled ? ', disabled' : ''}` });
      });
    }
    for (const r of k.list(MENU.T_MENU)) {
      if (inBar.has(r.id)) continue;
      const m = MENU.readMenu(k, r.id), sz = MENU.menuSize(m, font), base = nameFor(`${stem}_menu${r.id}`, menuText(m)); if (!base) continue;
      fs.writeFileSync(path.join(menuDir, base + '.txt'), `${src}: menu not in any menu bar (a pop-up menu, or one the program adds itself)\r\n\r\n` + menuText(m) + '\r\n');
      fs.writeFileSync(path.join(menuDir, base + '.json'), JSON.stringify(m, null, 1));
      // drawn as a pulled-down menu hanging from a 1-line top edge, 4 pixels in
      const W = Math.min(640, sz.w + 12), H = Math.min(200, sz.h + 4), cv = MENU.canvas(W, H);
      for (let x = 4; x < 4 + sz.w; x++) cv.px[x] = 0;
      MENU.drawMenu(cv, m, font, 4, 0);
      writeMenu(base + '.png', m, cv, null, { disk, source: src, id: r.id, name: (m.title || '').trim() || '(no title)', size: `${sz.w}x${sz.h}`, png: `${W * 2}x${H * 2}`,
        note: `not in a menu bar (pop-up, or added by the program); ${m.items.length} items${m.itemRefType !== 'resource' ? ', items set by the program' : ''}` });
    }
    // every rMenuItem on its own, with the menus that refer to it
    const users = new Map();
    for (const r of k.list(MENU.T_MENU)) {
      const m = MENU.parseMenu(k.get(MENU.T_MENU, r.id)), t = m.titleRefType === 'resource' ? k.get(MENU.T_PSTR, m.titleRef) : null;
      const label = `rMenu ${hex4(r.id)}` + (t && t.length ? ` "${String.fromCharCode(...t.subarray(1, 1 + t[0])).trim()}"` : '');
      if (m.itemRefType === 'resource') for (const id of m.items) { if (!users.has(id)) users.set(id, []); users.get(id).push(label); }
    }
    for (const r of k.list(MENU.T_ITEM)) {
      const it = MENU.parseItem(k.get(MENU.T_ITEM, r.id)), t = it.titleRefType === 'resource' ? k.get(MENU.T_PSTR, it.titleRef) : null;
      it.resID = r.id; it.title = t && t.length ? String.fromCharCode(...t.subarray(1, 1 + t[0])) : null;
      const rec = { source: src, disk, resourceID: r.id, itemID: it.id, text: it.title, titleRef: `${it.titleRefType} ${hex4(it.titleRef)}`,
        key: it.char ? MENU.keyText(it.char, it.altChar) : '', mark: it.check ? hex4(it.check) : '', style: MENU.styleNames(it.style).join(' ') || 'plain',
        flags: hex4(it.flags), disabled: it.disabled, divider: it.title === '-' ? 'dividing line' : it.divider ? 'divider below' : '', xor: it.xor,
        usedBy: users.get(r.id) || ['unreferenced'] };
      const content = JSON.stringify({ ...rec, source: '', disk: '' }), base = nameFor(`Items/${stem}_item${r.id}`, content); if (!base) continue;
      const pic = MENU.itemPicture(it, font);
      fs.writeFileSync(path.join(menuDir, base + '.png'), canvasPNG(pic.cv, 2));
      fs.writeFileSync(path.join(menuDir, base + '.json'), JSON.stringify(rec, null, 1));
      fs.writeFileSync(path.join(menuDir, base + '.txt'), Object.entries(rec).map(([a, b]) => a.padEnd(12) + (Array.isArray(b) ? b.join('; ') : b)).join('\r\n') + '\r\n');
      add('menuitem', base.replace(/^Items\//, '') + '.png', { disk, source: src, id: r.id, name: it.title == null ? '(set by the program)' : it.title, size: `${pic.w}x${pic.h}`, png: `${pic.w * 2}x${pic.h * 2}`,
        note: [rec.key && 'Apple-' + rec.key, rec.mark && 'mark ' + rec.mark, rec.style !== 'plain' && rec.style, rec.disabled && 'disabled', rec.divider, 'flags ' + rec.flags, 'used by ' + rec.usedBy.join('; ')].filter(Boolean).join(', '), rec });
    }
  }
  for (const arg of images) {
    if (arg.endsWith('::rom')) continue;
    const [img, onlyFile] = arg.split('::'), stacksOnly = onlyFile === 'stacks', cursorsOnly = !!onlyFile && !stacksOnly;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hcart-')), disk = path.basename(img).replace(/\.[^.]+$/, '');
    try {
      execFileSync(CP2, ['extract', '--preserve=naps', img, ...(cursorsOnly ? [onlyFile] : [])], { cwd: tmp, stdio: 'ignore' });
      const files = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(p); } })(tmp);
      for (const f of files) {
        const m = /^(.*)#([0-9a-f]{2})([0-9a-f]{4})(r?)$/i.exec(path.basename(f)); if (!m) continue;
        const name = m[1], ftype = parseInt(m[2], 16), isFork = m[4].toLowerCase() === 'r', rel = path.relative(tmp, path.dirname(f)).replace(/\\/g, ':');
        if (stacksOnly && (isFork || ftype !== 0x55)) continue; // before marking it seen: another pass may want it
        const src = (rel ? rel + ':' : '') + name, data = fs.readFileSync(f);
        const key = src + '|' + (isFork ? 'r' : 'd') + '|' + crc32(data);
        if (seen.has(key)) continue; seen.add(key); // the same file on several disks
        try {
          // stack paint patterns (type $55 data fork starting with a STAK block)
          if (!isFork && ftype === 0x55 && data.length > 8 && data.toString('latin1', 4, 8) === 'STAK') {
            const r = PATTERN.readStack(new Uint8Array(data));
            writePatterns(safe(src.replace(/:/g, '-')), r.patterns, r.colors, { disk, source: src, note: `stack color set ${r.colors.map(SHR.hex).join(' ')}` });
            continue;
          }
          if (stacksOnly) continue;
          // HyperCard's built-in pattern table: 16 consecutive entries, at least 14 seen in the stacks
          if (!isFork && cursorsOnly && knownPatterns.size) {
            for (let o = 0; o + 512 <= data.length; o++) {
              if (!knownPatterns.has(data.toString('hex', o, o + 32))) continue;
              let hits = 0; for (let i = 0; i < 16; i++) if (knownPatterns.has(data.toString('hex', o + 32 * i, o + 32 * i + 32))) hits++;
              if (hits >= 14) {
                const pats = []; for (let i = 0; i < 16; i++) pats.push(new Uint8Array(data.subarray(o + 32 * i, o + 32 * i + 32)));
                writePatterns(safe(src.replace(/:/g, '-')) + '_builtin', pats, SHR.SETS.system, { disk, source: src + ` (data fork +$${o.toString(16).toUpperCase()})`, note: `HyperCard's default table, ${hits}/16 seen in stacks, System palette` });
                break;
              }
            }
          }
          if (isFork) {
            const k = new RSRC.Fork(data), names = k.names(0x8001), cnames = k.names(0x8027);
            for (const r of k.list(0x8027)) {
              const nm = cnames.get(r.id) || '', stem = safe(src.replace(/:/g, '-')) + '_' + r.id + (nm ? '_' + safe(nm) : '');
              const p = cursorPNG(k.get(r.type, r.id), 2, false); fs.writeFileSync(path.join(curDir, stem + '.png'), p.buf);
              fs.writeFileSync(path.join(curDir, stem + '_hot.png'), cursorPNG(k.get(r.type, r.id), 2, true).buf);
              add('cursor', stem + '.png', { disk, source: src, id: r.id, name: nm, size: `${p.c.w}x${p.c.h}`, png: `${p.c.w * 2}x${p.c.h * 2}`,
                note: `hot spot ${p.c.hotX},${p.c.hotY}; flags $${((p.c.tail[0] | p.c.tail[1] << 8) || 0).toString(16).toUpperCase()}` });
            }
            const snames = k.names(0x8024);
            for (const r of k.list(0x8024)) {
              const nm = snames.get(r.id) || '', stem = safe(src.replace(/:/g, '-')) + '_' + r.id + (nm ? '_' + safe(nm) : '');
              const s = SOUND.parse(k.get(r.type, r.id)); let n = s.data.length; while (n && s.data[n - 1] === 0) n--;
              const data = s.data.subarray(0, n), rate = s.rate || SOUND.BASE;
              fs.writeFileSync(path.join(sndDir, stem + '.wav'), wav(data, rate)); fs.writeFileSync(path.join(sndDir, stem + '.png'), wavePNG(data, 600, 120));
              add('sound', stem + '.wav', { disk, source: src, id: r.id, name: nm, size: `${data.length} bytes`, png: '600x120',
                note: `rate ${rate} Hz${s.rate ? '' : ' (header 0)'}, ${(data.length / rate).toFixed(2)} s, relative pitch $${s.pitch.toString(16).toUpperCase().padStart(4, '0')} (${(SOUND.signed(s.pitch) / 256).toFixed(2)} semitones; HyperCard middle C at ${Math.round(SOUND.playRate(s.pitch))} samples/s), ${s.pages} pages` });
            }
            if (cursorsOnly) continue;
            exportMenus(k, src, disk);
            for (const r of k.list(0x8001)) {
              const nm = names.get(r.id) || '', out = safe(src.replace(/:/g, '-')) + '_' + r.id + (nm ? '_' + safe(nm) : '') + '.png';
              const p = iconPNG(k.get(r.type, r.id), 2); fs.writeFileSync(path.join(iconDir, out), p.buf);
              add('icon', out, { disk, source: src, id: r.id, name: nm, size: `${p.w}x${p.h}`, png: `${p.w * 2}x${p.h * 2}`, note: p.type & 0x8000 ? 'color' : 'b&w' });
            }
          } else if (cursorsOnly) {
            continue;
          } else if (ftype === 0xCA) {
            readIconFile(data).forEach((e, i) => {
              for (const [which, rec] of [['large', e.big], ['small', e.small]]) {
                const out = safe(src.replace(/:/g, '-')) + '_' + i + '_' + safe(e.name || 'icon') + '_' + which + '.png', p = iconPNG(rec, 2);
                fs.writeFileSync(path.join(iconDir, out), p.buf);
                add('icon', out, { disk, source: src, id: i, name: e.name, size: `${p.w}x${p.h}`, png: `${p.w * 2}x${p.h * 2}`, note: `${which}, matches type $${e.type.toString(16).toUpperCase()} aux $${e.aux.toString(16).toUpperCase()}` + (e.owner ? `, owner ${e.owner}` : '') });
              }
            });
          } else if (ftype === 0xC8) {
            const fo = FONT.parse(data), out = safe(fo.name) + '.' + fo.size + '.png', p = fontPNG(fo, 2);
            fs.writeFileSync(path.join(fontDir, out), p.buf);
            add('font', out, { disk, source: src, id: fo.family, name: fo.name, size: String(fo.size), png: `${p.w}x${p.h}`, note: `${p.glyphs} characters, ascent ${fo.ascent}, descent ${fo.descent}` });
          }
        } catch (e) { errors.push(`${disk} ${src}: ${e.message}`); }
      }
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  // CSV and index.html
  const csvq = s => '"' + String(s).replace(/"/g, '""') + '"';
  fs.writeFileSync(path.join(outDir, 'index.csv'), 'kind,file,disk,source,id,name,size,png,note\r\n' + rows.map(r => [r.kind, r.file, r.disk, r.source, r.id, r.name, r.size, r.png, r.note].map(csvq).join(',')).join('\r\n') + '\r\n');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icons = rows.filter(r => r.kind === 'icon'), fonts = rows.filter(r => r.kind === 'font'), cursors = rows.filter(r => r.kind === 'cursor'), sounds = rows.filter(r => r.kind === 'sound');
  const bars = rows.filter(r => r.kind === 'menubar'), menus = rows.filter(r => r.kind === 'menu'), items = rows.filter(r => r.kind === 'menuitem');
  fs.writeFileSync(path.join(menuDir, 'Items', 'items.csv'), 'source,disk,resource ID,item ID,text,key,mark,style,flags,disabled,divider,XOR,used by,png\r\n' +
    items.map(i => { const x = i.rec; return [x.source, x.disk, hex4(x.resourceID), hex4(x.itemID), x.text == null ? '' : x.text, x.key, x.mark, x.style, x.flags, x.disabled, x.divider, x.xor, x.usedBy.join('; '), i.file].map(csvq).join(','); }).join('\r\n') + '\r\n');
  const patterns = rows.filter(r => r.kind === 'pattern'), patSources = [...new Set(patterns.map(r => r.file.replace(/_\d+\.png$/, '')))];
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>IIGS art</title>
<style>:root{--bg:#f4f2ee;--ink:#1d1d1f;--muted:#666;--card:#fff;--line:#ddd}@media (prefers-color-scheme:dark){:root{--bg:#17181b;--ink:#ececef;--muted:#999;--card:#222327;--line:#34353b}}
body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:14px system-ui,sans-serif}h1{font-size:20px}h2{font-size:16px;margin-top:28px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px;font-size:11px;word-break:break-word}
.card img{display:block;margin:4px auto;image-rendering:pixelated;background:repeating-conic-gradient(#ccc 0 25%,#eee 0 50%) 0 0/12px 12px;max-width:100%}.fonts .card img{background:#fff}.fonts{grid-template-columns:1fr}.menubar{margin:10px 0}.menubar img{margin:6px 0;background:none}.muted{color:var(--muted)}</style></head><body>
<h1>Apple IIGS art</h1><p class="muted">${icons.length} icons, ${cursors.length} cursors, ${sounds.length} sounds, ${patterns.length} patterns, ${bars.length} menu bars with ${menus.length} menus, and ${fonts.length} fonts from ${images.map(i => esc(path.basename(i))).join(', ')}. Icons at double size in the System palette (each 640-mode screen pixel 2 &times; 2); fonts as glyph grids at double size, labeled with each character's hex code (MS = missing symbol). Apple's copyrighted artwork: for reference only.</p>
<h2>Icons</h2><div class="grid">${icons.map(r => `<div class="card"><img src="Icons/${encodeURIComponent(r.file)}" alt=""><b>${esc(r.name || '(no name)')}</b><br>${esc(r.source)} #${esc(r.id)}<br><span class="muted">${esc(r.size)} screen px, ${esc(r.note)}</span></div>`).join('')}</div>
<h2>Cursors</h2><p class="muted">Solid pixels in color; half-transparent black pixels invert whatever is under them; the second image outlines the hot spot in red.</p><div class="grid">${cursors.map(r => `<div class="card"><img src="Cursors/${encodeURIComponent(r.file)}" alt=""><img src="Cursors/${encodeURIComponent(r.file.replace(/\.png$/, '_hot.png'))}" alt=""><b>${esc(r.name || '(no name)')}</b><br>${esc(r.source)} #${esc(r.id)}<br><span class="muted">${esc(r.size)} px, ${esc(r.note)}</span></div>`).join('')}</div>
<h2>Sounds</h2><p class="muted">Each sound as a standard WAV at the sample rate stored in it (HyperCard itself plays at middle C, adjusted by the relative pitch).</p><div class="grid">${sounds.map(r => `<div class="card"><img src="Sounds/${encodeURIComponent(r.file.replace(/\.wav$/, '.png'))}" alt="" style="width:100%;background:none"><audio controls preload="none" src="Sounds/${encodeURIComponent(r.file)}" style="width:100%"></audio><b>${esc(r.name || '(no name)')}</b><br>${esc(r.source)} #${esc(r.id)}<br><span class="muted">${esc(r.size)}, ${esc(r.note)}</span></div>`).join('')}</div>
<h2>Patterns</h2><p class="muted">${patterns.length} paint patterns from ${patSources.length} sources: each HyperCard IIGS stack's 16 editable patterns (in the stack's own color set) and HyperCard's built-in default table. One sheet per source, in Patterns-palette order (left column 17–24, right 25–32); the single 4 &times; 4 tiles are in the folder.</p><div class="grid">${patSources.map(s => `<div class="card"><img src="Patterns/${encodeURIComponent(s + '_sheet.png')}" alt=""><b>${esc(s)}</b></div>`).join('')}</div>
<h2>Menus</h2><p class="muted">Every menu bar (rMenuBar $8008) and menu (rMenu $8009, rMenuItem $800A) in the resource forks, drawn at double size the way System 6.0.4's Menu Manager draws them in 640 mode, in Shaston 8 from ROM: each bar, then each menu pulled down under its selected title. Menus that are in no bar (pop-up menus, or ones a program adds itself) follow. Each bar and menu also has a .txt listing (titles, items, Apple-key equivalents, marks, flags, IDs) and a .json file.</p>
${[...new Set(bars.map(b => b.file))].map(f => { const b = bars.find(x => x.file === f), base = f.replace(/\.png$/, ''); return `<div class="card menubar"><b>${esc(b.source)}</b> menu bar ${esc(b.id)} <a href="Menus/${encodeURIComponent(base + '.txt')}">text</a> <a href="Menus/${encodeURIComponent(base + '.json')}">json</a><img src="Menus/${encodeURIComponent(f)}" alt="">${menus.filter(m => m.file.startsWith(base + '_')).map(m => `<img src="Menus/${encodeURIComponent(m.file)}" alt="${esc(m.name)}">`).join('')}</div>`; }).join('')}
<div class="grid">${menus.filter(m => /_menu\d+\.png$/.test(m.file)).map(m => `<div class="card"><img src="Menus/${encodeURIComponent(m.file)}" alt=""><b>${esc(m.name)}</b><br>${esc(m.source)} #${esc(m.id)} <a href="Menus/${encodeURIComponent(m.file.replace(/\.png$/, '.txt'))}">text</a><br><span class="muted">${esc(m.note)}</span></div>`).join('')}</div>
<h2>Menu items</h2><p class="muted">${items.length} menu items (rMenuItem $800A), each drawn as one row of a menu just wide enough for it; Menus/Items has a .json and .txt per item and items.csv, which says which menus use each item.</p><div class="grid">${items.map(i => `<div class="card"><img src="Menus/Items/${encodeURIComponent(i.file)}" alt="" style="background:none"><b>${esc(i.name)}</b><br>${esc(i.source)} #${esc(i.id)}<br><span class="muted">${esc(i.note)}</span></div>`).join('')}</div>
<h2>Fonts</h2><div class="grid fonts">${fonts.map(r => `<div class="card"><b>${esc(r.name)} ${esc(r.size)}</b> <span class="muted">family ${esc(r.id)}, ${esc(r.note)}, ${esc(r.source)}</span><img src="Fonts/${encodeURIComponent(r.file)}" alt=""></div>`).join('')}</div></body></html>`;
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  console.log(`icons: ${icons.length} PNGs (${icons.filter(r => !/large|small/.test(r.note)).length} from rIcon resources, ${icons.filter(r => /large|small/.test(r.note)).length} from Finder icon files); cursors: ${cursors.length} (each with a _hot copy); sounds: ${sounds.length} WAVs; patterns: ${patterns.length} from ${patSources.length} sources; menus: ${bars.length} bars, ${menus.length} menus, ${items.length} items; fonts: ${fonts.length} PNGs`);
  if (errors.length) console.log('skipped:\n  ' + errors.join('\n  '));
}
main();
