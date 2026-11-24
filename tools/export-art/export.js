// export.js -- export every icon and font on Apple IIGS disk images as PNG files, plus index.html and a CSV.
//
//   node tools/export-art/export.js <output folder> <disk image> [disk image ...]
//   A disk image given as  image::Folder:File  contributes only that file's cursors (e.g. HyperCard's own four:
//   HyperCard.hdv::System:Start).
//
// Cursors: every rCursor ($8027) resource, drawn as on screen (screen = (screen OR mask) XOR image): solid pixels
//   in their color, invert pixels as half-transparent black (they flip whatever is under them), see-through
//   pixels transparent; at double size, plus a copy with the hot spot outlined in red (<name>_hot.png).
//
// Icons: every rIcon ($8001) resource in every resource fork, and every icon (large and small) in Finder icon
//   files (file type $CA, layout from File Type Note $CA). Drawn as DrawIcon does in 640 mode (one icon pixel =
//   two screen pixels, mask per screen pixel) in the System palette, at double size (each screen pixel 2 x 2),
//   transparent where the mask is off.
// Fonts: every QuickDraw II font file (type $C8) as a labeled glyph grid at double size.
// Needs CiderPress II's cp2 (set CP2 to its path, or it looks in D:\cp2_1.2.0_win-x64_sc). The output is the
// disk images' own artwork: keep it out of this repository.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib'), { execFileSync } = require('child_process');
const LIB = path.join(__dirname, '..', '..', 'lib');
require(path.join(LIB, 'shr.js')); require(path.join(LIB, 'rsrc.js')); require(path.join(LIB, 'font.js')); require(path.join(LIB, 'cursor.js'));
const { SHR, RSRC, FONT, CURSOR } = globalThis;
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

// ---------- main ----------
const safe = s => String(s).replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 60) || 'unnamed';
function main() {
  const [outDir, ...images] = process.argv.slice(2);
  if (!outDir || !images.length) { console.log('usage: node export.js <output folder> <disk image> [...]'); process.exit(1); }
  const iconDir = path.join(outDir, 'Icons'), fontDir = path.join(outDir, 'Fonts'), curDir = path.join(outDir, 'Cursors');
  for (const d of [iconDir, fontDir, curDir]) fs.mkdirSync(d, { recursive: true });
  const rows = [], seen = new Set(), errors = [];
  const add = (kind, file, row) => { rows.push({ kind, file, ...row }); };
  for (const arg of images) {
    const [img, onlyFile] = arg.split('::'), cursorsOnly = !!onlyFile;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hcart-')), disk = path.basename(img).replace(/\.[^.]+$/, '');
    try {
      execFileSync(CP2, ['extract', '--preserve=naps', img, ...(onlyFile ? [onlyFile] : [])], { cwd: tmp, stdio: 'ignore' });
      const files = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(p); } })(tmp);
      for (const f of files) {
        const m = /^(.*)#([0-9a-f]{2})([0-9a-f]{4})(r?)$/i.exec(path.basename(f)); if (!m) continue;
        const name = m[1], ftype = parseInt(m[2], 16), isFork = m[4].toLowerCase() === 'r', rel = path.relative(tmp, path.dirname(f)).replace(/\\/g, ':');
        const src = (rel ? rel + ':' : '') + name, data = fs.readFileSync(f);
        const key = src + '|' + (isFork ? 'r' : 'd') + '|' + crc32(data);
        if (seen.has(key)) continue; seen.add(key); // the same file on several disks
        try {
          if (isFork) {
            const k = new RSRC.Fork(data), names = k.names(0x8001), cnames = k.names(0x8027);
            for (const r of k.list(0x8027)) {
              const nm = cnames.get(r.id) || '', stem = safe(src.replace(/:/g, '-')) + '_' + r.id + (nm ? '_' + safe(nm) : '');
              const p = cursorPNG(k.get(r.type, r.id), 2, false); fs.writeFileSync(path.join(curDir, stem + '.png'), p.buf);
              fs.writeFileSync(path.join(curDir, stem + '_hot.png'), cursorPNG(k.get(r.type, r.id), 2, true).buf);
              add('cursor', stem + '.png', { disk, source: src, id: r.id, name: nm, size: `${p.c.w}x${p.c.h}`, png: `${p.c.w * 2}x${p.c.h * 2}`,
                note: `hot spot ${p.c.hotX},${p.c.hotY}; flags $${((p.c.tail[0] | p.c.tail[1] << 8) || 0).toString(16).toUpperCase()}` });
            }
            if (cursorsOnly) continue;
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
  const icons = rows.filter(r => r.kind === 'icon'), fonts = rows.filter(r => r.kind === 'font'), cursors = rows.filter(r => r.kind === 'cursor');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>IIGS art</title>
<style>:root{--bg:#f4f2ee;--ink:#1d1d1f;--muted:#666;--card:#fff;--line:#ddd}@media (prefers-color-scheme:dark){:root{--bg:#17181b;--ink:#ececef;--muted:#999;--card:#222327;--line:#34353b}}
body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:14px system-ui,sans-serif}h1{font-size:20px}h2{font-size:16px;margin-top:28px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px;font-size:11px;word-break:break-word}
.card img{display:block;margin:4px auto;image-rendering:pixelated;background:repeating-conic-gradient(#ccc 0 25%,#eee 0 50%) 0 0/12px 12px;max-width:100%}.fonts .card img{background:#fff}.fonts{grid-template-columns:1fr}.muted{color:var(--muted)}</style></head><body>
<h1>Apple IIGS art</h1><p class="muted">${icons.length} icons, ${cursors.length} cursors and ${fonts.length} fonts from ${images.map(i => esc(path.basename(i))).join(', ')}. Icons at double size in the System palette (each 640-mode screen pixel 2 &times; 2); fonts as glyph grids at double size, labeled with each character's hex code (MS = missing symbol). Apple's copyrighted artwork: for reference only.</p>
<h2>Icons</h2><div class="grid">${icons.map(r => `<div class="card"><img src="Icons/${encodeURIComponent(r.file)}" alt=""><b>${esc(r.name || '(no name)')}</b><br>${esc(r.source)} #${esc(r.id)}<br><span class="muted">${esc(r.size)} screen px, ${esc(r.note)}</span></div>`).join('')}</div>
<h2>Cursors</h2><p class="muted">Solid pixels in color; half-transparent black pixels invert whatever is under them; the second image outlines the hot spot in red.</p><div class="grid">${cursors.map(r => `<div class="card"><img src="Cursors/${encodeURIComponent(r.file)}" alt=""><img src="Cursors/${encodeURIComponent(r.file.replace(/\.png$/, '_hot.png'))}" alt=""><b>${esc(r.name || '(no name)')}</b><br>${esc(r.source)} #${esc(r.id)}<br><span class="muted">${esc(r.size)} px, ${esc(r.note)}</span></div>`).join('')}</div>
<h2>Fonts</h2><div class="grid fonts">${fonts.map(r => `<div class="card"><b>${esc(r.name)} ${esc(r.size)}</b> <span class="muted">family ${esc(r.id)}, ${esc(r.note)}, ${esc(r.source)}</span><img src="Fonts/${encodeURIComponent(r.file)}" alt=""></div>`).join('')}</div></body></html>`;
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  console.log(`icons: ${icons.length} PNGs (${icons.filter(r => !/large|small/.test(r.note)).length} from rIcon resources, ${icons.filter(r => /large|small/.test(r.note)).length} from Finder icon files); cursors: ${cursors.length} (each with a _hot copy); fonts: ${fonts.length} PNGs`);
  if (errors.length) console.log('skipped:\n  ' + errors.join('\n  '));
}
main();
