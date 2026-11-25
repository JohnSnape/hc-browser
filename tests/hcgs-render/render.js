// render.js <site folder> <card number> <out.png|out.rgb> [fonts folder]
//   Draw one card of <site>/main.hc with lib/card.js. .png: 640 x 400 (lines doubled, like GSport shows
//   them); .rgb: 640 x 200, 3 bytes a pixel (for compare.js). Fonts: every IIGS font file ($C8) under the
//   fonts folder, plus Shaston 8 (a .fon of the ROM's system font) if one is there.
'use strict';
const fs = require('fs'), path = require('path');
for (const m of ['shr', 'font', 'hcfile', 'card']) require(path.join(__dirname, '../../lib', m + '.js'));
const { png } = require('../iigs/menutest/shr2png.js');
const { HCFILE, CARD, FONT } = globalThis;

function loadFonts(dir) {
  const fonts = [];
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (!/\.(png|txt|json|csv)$/i.test(e.name)) { try { const f = FONT.parse(fs.readFileSync(p)); if (f.size) fonts.push(f); } catch (_) { /* not a font */ } }
  } };
  if (dir && fs.existsSync(dir)) walk(dir);
  return (name, size) => fonts.find(f => f.name.toLowerCase() === String(name).toLowerCase() && f.size === size) || null;
}

function resources(site, st, fontsDir) {
  const rp = (type, id) => { const r = st.resources[type] && st.resources[type][id]; return r ? r.props : null; };
  const read = rel => { const p = path.join(site, rel); return fs.existsSync(p) ? new Uint8Array(fs.readFileSync(p)) : null; };
  return {
    picture: id => { const r = rp('picture', id); return r ? { shr: read(r.file), msk: r.mask ? read(r.mask) : null } : null; },
    icon: id => { const r = rp('icon', id); return r ? read(r.file) : null; },
    font: loadFonts(fontsDir),
  };
}

function main() {
  const [site, n, out, fontsDir] = process.argv.slice(2);
  const st = HCFILE.parse(fs.readFileSync(path.join(site, 'main.hc'), 'latin1'));
  const f = CARD.render(st, +n - 1, resources(site, st, fontsDir));
  const rgba = CARD.toRGBA(f);
  if (out.endsWith('.rgb')) { const rgb = Buffer.alloc(640 * 200 * 3); for (let i = 0; i < 640 * 200; i++) rgb.set(rgba.subarray(4 * i, 4 * i + 3), 3 * i); fs.writeFileSync(out, rgb); }
  else { const rgb = new Uint8Array(640 * 400 * 3); for (let y = 0; y < 400; y++) for (let x = 0; x < 640; x++) rgb.set(rgba.subarray(4 * ((y >> 1) * 640 + x), 4 * ((y >> 1) * 640 + x) + 3), (y * 640 + x) * 3); fs.writeFileSync(out, png(640, 400, rgb)); }
}
if (require.main === module) main();
module.exports = { resources, loadFonts };
