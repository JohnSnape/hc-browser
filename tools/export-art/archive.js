// archive.js -- export the IIGS artwork inside CD images (and the disk images and archives inside them).
//
//   node tools/export-art/archive.js <output root> <ROM 03 file> <image> [image ...]
//
// Each image (a CD .iso/.img, a .zip, a disk image...) is unpacked recursively into a scratch folder (SCRATCH, or
// the system temp folder) with CiderPress II: its partitions (Apple partition map: image:N), then its files, then
// any file in there that cp2 can open in turn (disk images .po .2mg .dsk .do .hdv .img .iso .dc .image .nib .woz,
// ShrinkIt .shk .bxy .sea (cp2 finds the archive behind the GS/OS self-extractor), Binary II, .zip, .gz, MacBinary,
// or ProDOS file type $E0), down to MAXDEPTH levels. The images are only read; everything else goes in scratch, and
// each image's folder is removed when it is done.
// Then export.js's run() exports every resource type it knows into <output root>/<image name>/<type>/, sharing one
// content-hash table across all images: a resource exported once is not exported again; the CSV's "also found in"
// column lists every other place it was found. Set SYSRES to a System 6 Sys.Resources resource fork for the alert
// icons when an image has no System folder of its own. summary.csv in the output root gives counts per image and type.
// The output is other people's copyrighted work: for local reference only, never commit it.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const { run } = require('./export.js');
const CP2 = process.env.CP2 || 'D:\\cp2_1.2.0_win-x64_sc\\cp2.exe';
const MAXDEPTH = +(process.env.MAXDEPTH || 4);
const CONTAINER = /\.(po|2mg|2img|dsk|do|hdv|img|iso|dc|dc42|dc6|image|nib|woz|sdk|shk|bxy|sea|bny|bqy|bin|zip|gz|hfv|dmg)$/i;

function cp2(args, cwd) {
  try { return execFileSync(CP2, args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 600000, maxBuffer: 1 << 28 }).toString(); }
  catch (e) { return null; }
}
function walk(d, out) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else out.push(p); } return out; }
const isEmpty = d => !fs.existsSync(d) || walk(d, []).length === 0;
let stats = { containers: 0, opened: 0 };
// unpack container into dir; returns true if anything came out
function unpack(container, dir, depth, log) {
  fs.mkdirSync(dir, { recursive: true });
  cp2(['extract', '--preserve=naps', '--overwrite', container], dir);
  if (isEmpty(dir)) {
    // a partitioned image (Apple partition map): extract each filesystem partition
    const cat = cp2(['catalog', '--depth=shallow', container], dir) || '';
    if (/multi-partition/.test(cat)) {
      for (const line of cat.split(/\r?\n/)) {
        const m = /^\s*(\d+)\s+\d+\s+\d+\s+.*\s(Apple_\w+)\s*$/.exec(line); if (!m || /partition_map|Driver|Free|Patches|Void/i.test(m[2])) continue;
        const sub = path.join(dir, 'partition' + m[1]); fs.mkdirSync(sub, { recursive: true });
        cp2(['extract', '--preserve=naps', '--overwrite', container + ':' + m[1]], sub);
      }
    }
  }
  if (isEmpty(dir)) { fs.rmSync(dir, { recursive: true, force: true }); return false; }
  stats.opened++;
  if (depth >= MAXDEPTH) return true;
  for (const f of walk(dir, [])) {
    const base = path.basename(f);
    if (/r$/i.test(base) && /#[0-9a-f]{6}r$|#[0-9a-f]{16}r$/i.test(base)) continue; // resource forks
    const plain = base.replace(/#[0-9a-f]{6}$|#[0-9a-f]{16}$/i, ''), m = /#([0-9a-f]{2})([0-9a-f]{4})$/i.exec(base);
    const lbr = m && m[1].toLowerCase() === 'e0';
    if (!CONTAINER.test(plain) && !lbr) continue;
    if (fs.statSync(f).size < 1024) continue;
    stats.containers++;
    const sub = f + '.x';
    if (unpack(f, sub, depth + 1, log) && log) log(`${'  '.repeat(depth)}opened ${path.relative(dir, f)}`);
  }
  return true;
}

function main() {
  const [outRoot, romFile, ...images] = process.argv.slice(2);
  if (!outRoot || !romFile || !images.length) { console.log('usage: node archive.js <output root> <ROM 03 file> <image> [...]'); process.exit(1); }
  const scratch = process.env.SCRATCH || os.tmpdir(), shared = new Map(), summary = [];
  fs.mkdirSync(outRoot, { recursive: true });
  for (const img of images) {
    const name = path.basename(img).replace(/\.(iso|img|zip|dmg|toast|cdr)$/i, ''), work = path.join(scratch, 'arch-' + name.replace(/[^A-Za-z0-9.]+/g, '_'));
    const t0 = Date.now(); stats = { containers: 0, opened: 0 };
    fs.rmSync(work, { recursive: true, force: true });
    console.log(`== ${name}: unpacking`);
    unpack(img, work, 0, null);
    const files = fs.existsSync(work) ? walk(work, []).length : 0;
    console.log(`   ${files} files, ${stats.opened} containers opened (${stats.containers} tried), ${Math.round((Date.now() - t0) / 1000)} s; exporting`);
    const res = fs.existsSync(work) ? run(path.join(outRoot, safeName(name)), [romFile + '::rom', ...(process.env.SYSRES ? [process.env.SYSRES + '::sysres'] : []), { tree: work, disk: name }], { shared, quiet: true }) : { rows: [], errors: ['nothing could be unpacked'], dups: {}, macForks: 0 };
    const counts = {}; for (const r of res.rows) if (r.kind !== 'pattern' || /_0\.png$/.test(r.file)) counts[r.kind] = (counts[r.kind] || 0) + 1;
    counts['pattern (stacks)'] = counts.pattern || 0; delete counts.pattern;
    summary.push({ name, files, opened: stats.opened, counts, dups: res.dups, errors: res.errors.length, macForks: res.macForks });
    fs.writeFileSync(path.join(outRoot, safeName(name), 'errors.txt'), res.errors.join('\r\n') + '\r\n');
    console.log(`   ${JSON.stringify(counts)}; already exported elsewhere: ${JSON.stringify(res.dups)}; ${res.errors.length} unreadable; ${Math.round((Date.now() - t0) / 1000)} s`);
    fs.rmSync(work, { recursive: true, force: true });
    writeSummary(outRoot, summary);
  }
}
const safeName = s => s.replace(/[\\/:*?"<>|]+/g, '_').trim();
function writeSummary(outRoot, summary) {
  const kinds = [...new Set(summary.flatMap(s => Object.keys(s.counts)))].sort();
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  const lines = [['image', 'files unpacked', 'containers opened', ...kinds.map(k => k + ' (new)'), 'duplicates of earlier finds', 'unreadable', 'Mac forks skipped'].map(q).join(',')];
  for (const s of summary) lines.push([s.name, s.files, s.opened, ...kinds.map(k => s.counts[k] || 0), Object.values(s.dups).reduce((a, b) => a + b, 0), s.errors, s.macForks].map(q).join(','));
  fs.writeFileSync(path.join(outRoot, 'summary.csv'), lines.join('\r\n') + '\r\n');
}
main();
