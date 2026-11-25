#!/usr/bin/env node
/* import.js — turn a HyperCard IIGS stack into an HC Browser site folder.
 *
 *   node tools/stack-import/import.js <stack data fork> [<resource fork>] <out folder> [--name main]
 *
 * The stack is read with hcgs-stack.js. Writes:
 *   <out>/main.hc        the stack as text (MAIN-HC-SPEC.md), scripts and field text verbatim
 *   <out>/pict/Pnnnn.shr every card and background picture as a Super Hi-Res screen, + Pnnnn.msk mask
 *   <out>/icons/Innnn.ico every icon in the resource fork ($8001), byte for byte
 * Stack files from CiderPress II (`cp2 extract --preserve=naps`) are `Name#550001` and `Name#550001r`.
 * The output is a copy of somebody's stack: keep it out of this repository unless the stack is yours.
 */
'use strict';
const fs = require('fs'), path = require('path');
require('./hcgs-stack.js'); require('../../lib/rsrc.js');
const { HCGS, RSRC } = globalThis;

const FONTS = { 0: 'Shaston', 0xFFFE: 'Shaston', 2: 'New York', 3: 'Geneva', 4: 'Monaco', 5: 'Venice', 6: 'London', 7: 'Athens',
  8: 'San Francisco', 9: 'Toronto', 11: 'Cairo', 12: 'Los Angeles', 20: 'Times', 21: 'Helvetica', 22: 'Courier', 23: 'Symbol', 24: 'Taliesin' };
const STYLE_BITS = ['bold', 'italic', 'underline', 'outline', 'shadow', 'condense', 'extend'];

const fromMacRoman = s => s; // kept as Mac OS Roman bytes (latin1 in, latin1 out): the .hc character set

function styleText(v) { const s = STYLE_BITS.filter((_, i) => v & (1 << i)); return s.length ? s.join(',') : 'plain'; }
function align(v) { return v === 1 ? 'center' : v === -1 ? 'right' : 'left'; }
const rect = r => r.join(',');
const hex4 = w => w.toString(16).toUpperCase().padStart(4, '0');

// Lines of a #text/#bgtext/#script body: a line starting with # is written ## (spec §3.1)
const body = s => s.split('\n').map(l => (l.startsWith('#') ? '#' + l : l));

function partLines(p, bgContents) {
  const L = [`#${p.kind} ${p.id}`];
  if (p.name) L.push('name: ' + p.name);
  L.push('rect: ' + rect(p.rect), 'style: ' + p.style);
  if (!p.hidden) {} else L.push('visible: false');
  if (p.kind === 'button') {
    L.push('showName: ' + p.showName, 'autoHilite: ' + p.autoHilite);
    if (p.hilite) L.push('hilite: true');
    if (p.icon) L.push('icon: ' + p.icon);
    if (p.family) L.push('family: ' + p.family);
    if (!p.enabled) L.push('enabled: false');
    if (p.foreColor !== 0) L.push('foreColor: ' + p.foreColor);
    if (p.backColor !== 15) L.push('backColor: ' + p.backColor);
  } else {
    if (p.frameColor !== 0) L.push('frameColor: ' + p.frameColor);
    for (const k of ['lockText', 'showLines', 'wideMargins', 'autoTab', 'dontWrap', 'dontSearch', 'sharedText']) if (p[k]) L.push(k + ': true');
    if (p.fixedLineHeight) L.push('fixedLineHeight: true');
  }
  L.push('textFont: ' + (FONTS[p.textFont] || p.textFont), 'textSize: ' + p.textSize, 'textStyle: ' + styleText(p.textStyle), 'textAlign: ' + align(p.textAlign));
  if (p.kind === 'field') L.push('textHeight: ' + p.textHeight);
  if (p.script.trim()) L.push('#script', ...body(p.script.replace(/\n$/, '')));
  return L;
}

function main() {
  const args = process.argv.slice(2), opts = { icons: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name') { opts.name = args[i + 1]; args.splice(i, 2); i--; }
    else if (args[i] === '--icons') { opts.icons.push(args[i + 1]); args.splice(i, 2); i--; }
  }
  if (args.length < 2) { console.error('usage: import.js <stack data fork> [<resource fork>] <out folder> [--name main] [--icons <fork>]...'); process.exit(2); }
  const out = args.pop(), dataPath = args[0], rsrcPath = args[1] || (fs.existsSync(dataPath + 'r') ? dataPath + 'r' : null);
  const st = HCGS.read(fs.readFileSync(dataPath));
  const stackName = path.basename(dataPath).replace(/#.*$/, '');
  fs.mkdirSync(path.join(out, 'pict'), { recursive: true });

  const L = ['#hc 1', '#stack', 'name: ' + stackName, 'colors: custom ' + st.colors.map(hex4).join(' ')];
  if (st.script.trim()) L.push('#script', ...body(st.script.replace(/\n$/, '')));

  const pictures = new Set();
  const pic = id => { if (id > 0) pictures.add(id); return id; };

  for (const bg of st.backgrounds) {
    L.push(`#background ${bg.id}`);
    if (bg.name) L.push('name: ' + bg.name);
    if (pic(bg.picture) > 0) L.push('picture: ' + bg.picture);
    if (!bg.showPict) L.push('showPict: false');
    if (bg.cantDelete) L.push('cantDelete: true');
    if (bg.dontSearch) L.push('dontSearch: true');
    if (bg.script.trim()) L.push('#script', ...body(bg.script.replace(/\n$/, '')));
    const shared = new Map(bg.contents.filter(c => c.text != null).map(c => [c.id, c.text]));
    for (const p of bg.parts) {
      L.push(...partLines(p));
      if (p.kind === 'field' && shared.has(p.id) && shared.get(p.id) !== '') L.push('#text', ...body(shared.get(p.id)));
    }
  }
  for (const cd of st.cards) {
    L.push(`#card ${cd.id}`, 'background: ' + cd.background);
    if (cd.name) L.push('name: ' + cd.name);
    if (pic(cd.picture) > 0) L.push('picture: ' + cd.picture);
    if (!cd.showPict) L.push('showPict: false');
    if (cd.cantDelete) L.push('cantDelete: true');
    if (cd.dontSearch) L.push('dontSearch: true');
    if (cd.script.trim()) L.push('#script', ...body(cd.script.replace(/\n$/, '')));
    const own = new Map(), hil = [];
    for (const c of cd.contents) {
      if (c.id > 0 && c.text != null && c.text !== '') L.push(`#bgtext ${c.id}`, ...body(c.text));
      else if (c.id > 0 && c.state != null && (c.state & 1)) hil.push(c.id);
      else if (c.id < 0) own.set(-c.id, c);
    }
    if (hil.length) L.push('#bghilite', hil.join(','));
    for (const p of cd.parts) {
      L.push(...partLines(p));
      const c = own.get(p.id);
      if (p.kind === 'field' && c && c.text) L.push('#text', ...body(c.text));
    }
  }

  // pictures
  for (const id of pictures) {
    const b = st.bmap(id); if (!b) { console.warn('missing BMAP', id); continue; }
    const pctr = HCGS.decodePicture(st.bytes, b);
    const shr = new Uint8Array(32768); shr.set(pctr.pixels, 0); shr.fill(0x80, 32000, 32200);
    for (let i = 0; i < 16; i++) { shr[32256 + 2 * i] = st.colors[i] & 255; shr[32257 + 2 * i] = st.colors[i] >> 8; }
    const msk = new Uint8Array(16000);
    for (let k = 0; k < 32000; k++) for (let p = 0; p < 4; p++) if ((pctr.mask[k] >> (6 - 2 * p)) & 3) { const x = (k % 160) * 4 + p, y = (k / 160) | 0; msk[y * 80 + (x >> 3)] |= 0x80 >> (x & 7); }
    fs.writeFileSync(path.join(out, 'pict', `P${id}.shr`), shr);
    fs.writeFileSync(path.join(out, 'pict', `P${id}.msk`), msk);
    L.push(`#resource picture ${id}`, `file: pict/P${id}.shr`, `mask: pict/P${id}.msk`);
  }
  // icons
  let icons = 0;
  if (rsrcPath) {
    fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
    let fork = null; try { fork = new RSRC.Fork(fs.readFileSync(rsrcPath)); } catch (e) { console.warn('resource fork skipped:', e.message); }
    if (fork) for (const r of fork.list(RSRC.T_ICON)) {
      fs.writeFileSync(path.join(out, 'icons', `I${r.id}.ico`), fork.get(RSRC.T_ICON, r.id));
      L.push(`#resource icon ${r.id}`, `file: icons/I${r.id}.ico`); icons++;
    }
  }
  // icons the buttons use that the stack itself lacks: HyperCard looks in Home and in HyperCard too (--icons, in order)
  const have = new Set(L.filter(l => l.startsWith('#resource icon ')).map(l => +l.split(' ')[2]));
  const used = new Set([...st.backgrounds, ...st.cards].flatMap(o => o.parts).filter(p => p.kind === 'button' && p.icon > 0).map(p => p.icon));
  for (const f of opts.icons) {
    const fork = new RSRC.Fork(fs.readFileSync(f));
    for (const id of used) if (!have.has(id) && fork.find(RSRC.T_ICON, id)) {
      fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
      fs.writeFileSync(path.join(out, 'icons', `I${id}.ico`), fork.get(RSRC.T_ICON, id));
      L.push(`#resource icon ${id}`, `file: icons/I${id}.ico`); have.add(id); icons++;
    }
  }
  const missing = [...used].filter(id => !have.has(id));
  if (missing.length) console.warn('icons not found:', missing.join(' '));
  L.push('#end', '');
  const name = (opts.name || 'main') + '.hc';
  fs.writeFileSync(path.join(out, name), Buffer.from(L.join('\r'), 'latin1'));
  console.log(`${name}: ${st.backgrounds.length} backgrounds, ${st.cards.length} cards, ${pictures.size} pictures, ${icons} icons`);
}
main();
