// node check-menus.js <Shaston.08> <Teach resource fork> <dump folder> [ROM]
// Draws Teach's menu bar and each of its six menus pulled down with lib/menu.js and compares them, pixel for
// pixel, with MENUTEST's screen dumps SHR0 (the bar) and SHR1..SHR6 (each menu down, its title selected).
// Compared: the whole bar (lines 0-12; the Apple logo only when the ROM is given), and the menu's box and
// shadow. MENUTEST's pointer sat over the Apple menu's first item, so SHR1 shows that item selected.
const fs = require('fs'), path = require('path');
const LIB = path.join(__dirname, '..', '..', '..', 'lib');
for (const m of ['font.js', 'rsrc.js', 'menu.js']) require(path.join(LIB, m));
const { pixels } = require('./shr2png.js');
const [fontFile, forkFile, dir, romFile] = process.argv.slice(2);
const font = FONT.parse(new Uint8Array(fs.readFileSync(fontFile)));
const bar = MENU.readBar(new RSRC.Fork(new Uint8Array(fs.readFileSync(forkFile))), 1);
let apple = null;
if (romFile) { const r = fs.readFileSync(romFile); apple = { mask: r.subarray(0x181EE, 0x1820E), image: r.subarray(0x1820E, 0x1822E) }; }
const titles = MENU.titleLayout(bar, font);
let allOk = true;
function compare(name, dump, region) {
  const scr = pixels(fs.readFileSync(path.join(dir, dump)));
  const cv = MENU.canvas(640, 200); region.draw(cv);
  let n = 0, ok = 0; const bad = [];
  for (const [x, y] of region.pts()) { n++; if (cv.px[y * 640 + x] === scr[y * 640 + x]) ok++; else if (bad.length < 8) bad.push(`${x},${y} drew ${cv.px[y * 640 + x]} screen ${scr[y * 640 + x]}`); }
  console.log(`${name}: ${ok} of ${n} pixels match` + (bad.length ? '\n    ' + bad.join('\n    ') : ''));
  if (ok !== n) allOk = false;
}
const barPts = function* (skipApple) { for (let y = 0; y < 13; y++) for (let x = 0; x < 640; x++) { if (skipApple && x >= titles[0].x && x < titles[0].x + titles[0].w && titles[0].menu.title === '@') continue; yield [x, y]; } };
compare('bar', 'SHR0.bin', { draw: cv => MENU.drawBar(cv, bar, font, { apple }), pts: () => barPts(!apple) });
titles.forEach((t, i) => {
  const { w, h } = MENU.menuSize(t.menu, font), G = MENU.G;
  const opt = i === 0 ? { hilite: 0 } : {};
  compare(`menu ${i + 1} ${JSON.stringify(t.menu.title)}`, `SHR${i + 1}.bin`, {
    draw: cv => { MENU.drawBar(cv, bar, font, { apple, hilite: i }); MENU.drawMenu(cv, t.menu, font, t.x, 12, opt); },
    pts: function* () {
      yield* barPts(!apple);
      for (let y = 13; y <= 13 + h; y++) for (let x = t.x; x < t.x + w; x++) yield [x, y];          // box
      for (let y = 13 + G.shadowTop; y <= 14 + h; y++) for (let x = t.x + w; x < t.x + w + G.shadowW; x++) yield [x, y]; // right shadow
      for (let x = t.x + G.shadowLeft; x < t.x + w; x++) yield [x, 14 + h];                         // bottom shadow
    },
  });
});
process.exit(allOk ? 0 : 1);
