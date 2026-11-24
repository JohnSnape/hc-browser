/* control.js — Apple IIGS control templates ($8004 rControlTemplate) and control lists ($8003 rControlList),
 * for the browser and Node. Classic script: sets globalThis.CONTROL. Uses RSRC forks and MENU (for pop-ups).
 *
 * Layouts: Apple IIGS Toolbox Reference vol. 3, ch. 28 and Appendix E (checked against all 1,045 templates and 158
 * lists on the System 6.0.4 and HyperCard IIGS disks; see docs/HYPERCARD-IIGS-FORMATS.md §12).
 *   rControlList: resource IDs (longs) of rControlTemplates, ending with 0.
 *   rControlTemplate standard header: +0 pCount (words after this one... in practice: number of parameters),
 *     +2 ID (long), +6 rect (top, left, bottom, right), +14 procRef (long), +18 flag (high byte ctlHilite,
 *     low byte ctlFlag), +20 moreFlags, +22 refCon (long); then per-type fields (pCount says how many).
 *   moreFlags low byte: bits 1-0 title/text/menu/list reference type, bits 3-2 color table reference type
 *     (0 pointer, 1 handle, 2 resource ID).
 * rWindParam1 ($800E) window templates name a control list at +$4A (kind at +$4E: 9 = rControlList resource).
 */
(function (root) {
  'use strict';
  const T_LIST = 0x8003, T_TEMPLATE = 0x8004, T_WINDOW = 0x800E, T_PSTR = 0x8006, T_LETEXT = 0x800B, T_LISTREF = 0x801C, T_ICON = 0x8001, T_PICT = 0x8002;
  const w = (b, o) => b[o] | b[o + 1] << 8, s = (b, o) => (w(b, o) << 16) >> 16;
  const l = (b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0;
  const REF = ['pointer', 'handle', 'resource', 'invalid'];
  const TYPES = {
    0x80000000: 'simple button', 0x81000000: 'static text', 0x82000000: 'check box', 0x83000000: 'LineEdit', 0x84000000: 'radio button',
    0x85000000: 'TextEdit', 0x86000000: 'scroll bar', 0x87000000: 'pop-up menu', 0x88000000: 'size box', 0x89000000: 'list',
    0x8D000000: 'picture', 0x07FF0001: 'icon button', 0x87FF0002: 'thermometer', 0x87FF0003: 'rectangle', 0x07FF0002: 'LineEdit (password?)',
  };
  // per-type fields after the 26-byte header, in order; '*' marks optional ones (present only if pCount reaches them)
  const FIELDS = {
    'simple button': [['titleRef', 'l'], ['colorTableRef', 'l'], ['keyEquivalent', 'k']],
    'check box': [['titleRef', 'l'], ['initialValue', 'w'], ['colorTableRef', 'l'], ['keyEquivalent', 'k']],
    'radio button': [['titleRef', 'l'], ['initialValue', 'w'], ['colorTableRef', 'l'], ['keyEquivalent', 'k']],
    'icon button': [['iconRef', 'l'], ['titleRef', 'l'], ['colorTableRef', 'l'], ['displayMode', 'w'], ['keyEquivalent', 'k']],
    'LineEdit': [['maxSize', 'w'], ['defaultRef', 'l']],
    'list': [['listSize', 'w'], ['listView', 'w'], ['listType', 'w'], ['listStart', 'w'], ['listDraw', 'l'], ['listMemHeight', 'w'], ['listMemSize', 'w'], ['listRef', 'l'], ['colorTableRef', 'l']],
    'picture': [['pictureRef', 'l']],
    'pop-up menu': [['titleWidth', 'w'], ['menuRef', 'l'], ['initialValue', 'w'], ['colorTableRef', 'l']],
    'scroll bar': [['maxSize', 'w'], ['viewSize', 'w'], ['initialValue', 'w'], ['colorTableRef', 'l']],
    'size box': [['colorTableRef', 'l']],
    'static text': [['textRef', 'l'], ['textSize', 'w'], ['just', 'w']],
    'TextEdit': [['textFlags', 'l'], ['indentRect', 'r'], ['vertBar', 'l'], ['vertAmount', 'w'], ['horzBar', 'l'], ['horzAmount', 'w'], ['styleRef', 'l'],
      ['textDescriptor', 'w'], ['textRef', 'l'], ['textLength', 'l'], ['maxChars', 'l'], ['maxLines', 'l'], ['maxCharsPerLine', 'w'], ['maxHeight', 'w'],
      ['colorRef', 'l'], ['drawMode', 'w'], ['filterProc', 'l']],
    'thermometer': [['value', 'w'], ['data', 'w'], ['colorTableRef', 'l']], // from data, not in vol. 3
    'rectangle': [['penHeight', 'w'], ['penWidth', 'w'], ['colorTableRef', 'l']], // from data, not in vol. 3
  };
  // count of parameters (pCount) a field occupies: words count 1... in vol. 3 pCount counts the header's 6 fields
  // plus one per extra field whatever its size (simple button: 7 = header + titleRef).
  function parseTemplate(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b.length < 26) throw new Error('Not a control template (too short).');
    const procRef = l(b, 14), moreFlags = w(b, 20), flag = w(b, 18);
    const custom = (moreFlags & 0x1000) && (procRef & 0xFFFFFF) && !TYPES[procRef];
    const t = { pCount: w(b, 0), id: l(b, 2), rect: [s(b, 6), s(b, 8), s(b, 10), s(b, 12)], procRef, flag, hilite: flag >> 8, ctlFlag: flag & 255,
      invisible: !!(flag & 0x80), moreFlags, refCon: l(b, 22), refType: REF[moreFlags & 3], colorRefType: REF[(moreFlags >> 2) & 3],
      type: TYPES[procRef] || (custom ? 'custom (control procedure resource ' + (procRef & 0xFFFFFF) + ')' : (moreFlags & 0x1000) ? 'unknown' : 'custom (procedure pointer)'), size: b.length };
    let o = 26, n = 6;
    for (const [name, kind] of FIELDS[t.type] || []) {
      if (n >= t.pCount) break;
      const len = kind === 'l' ? 4 : kind === 'w' ? 2 : kind === 'r' ? 8 : 6;
      if (o + len > b.length) break;
      t[name] = kind === 'l' ? l(b, o) : kind === 'w' ? w(b, o) : kind === 'r' ? [s(b, o), s(b, o + 2), s(b, o + 4), s(b, o + 6)]
        : { key1: b[o], key2: b[o + 1], modifiers: w(b, o + 2), careBits: w(b, o + 4) };
      o += len; n++;
    }
    if (o < b.length) t.extra = Array.from(b.subarray(o), x => x.toString(16).padStart(2, '0')).join('');
    // type-specific flag bits (vol. 3)
    if (t.type === 'simple button' || t.type === 'icon button') t.buttonType = ['round', 'bold round (default)', 'square', 'square with shadow'][flag & 3];
    if (t.type === 'icon button') t.noBorder = !!(flag & 4);
    if (t.type === 'radio button') t.family = flag & 0x7F;
    if (t.type === 'scroll bar') t.bar = { horizontal: !!(flag & 16), right: !!(flag & 8), left: !!(flag & 4), down: !!(flag & 2), up: !!(flag & 1) };
    if (t.type === 'pop-up menu') t.popup = { type2: !!(flag & 64), dontHiliteTitle: !!(flag & 32), dontDrawTitle: !!(flag & 16), dontDrawResult: !!(flag & 8),
      inWindowOnly: !!(flag & 4), rightTitle: !!(flag & 2), rightResult: !!(flag & 1), menuIsText: !!(moreFlags & 4), refType: REF[moreFlags & 3] };
    if (t.type === 'static text') t.substitute = !!(flag & 2);
    return t;
  }
  // LETextBox2 text: $01 + code + data; returns { text, runs: [{ text, style, just }] } with the codes removed
  function leText(bytes) {
    const b = bytes; let i = 0, cur = { style: 0, just: 0, text: '' }; const runs = []; let plain = '';
    const DATA = { 0x53: 2, 0x43: 2, 0x42: 2, 0x46: 4, 0x4A: 2, 0x4C: 2, 0x4D: 2, 0x58: 2 };
    while (i < b.length) {
      if (b[i] === 1 && DATA[b[i + 1]] != null) {
        const code = b[i + 1], v = w(b, i + 2);
        if (code === 0x53 || code === 0x4A) { if (cur.text) runs.push(cur); cur = { ...cur, text: '' }; if (code === 0x53) cur.style = v; else cur.just = (v << 16) >> 16; }
        i += 2 + DATA[code]; continue;
      }
      cur.text += String.fromCharCode(b[i]); plain += String.fromCharCode(b[i]); i++;
    }
    if (cur.text) runs.push(cur);
    return { text: plain, runs };
  }
  const pstr = b => b && b.length ? String.fromCharCode(...b.subarray(1, 1 + b[0])) : null;
  // a template with its references followed (resource references only; others stay as numbers)
  function readTemplate(fork, id) {
    const raw = fork.get(T_TEMPLATE, id); if (!raw) return { id, missing: true };
    const t = parseTemplate(raw); t.resID = id;
    const res = t.refType === 'resource';
    if ((t.titleRef || t.titleRef === 0) && res && t.titleRef) t.title = pstr(fork.get(T_PSTR, t.titleRef));
    if (t.type === 'icon button' && t.iconRef) { const icoType = (t.moreFlags >> 4) & 3; if (icoType === 2) t.icon = fork.get(T_ICON, t.iconRef); t.iconRefType = REF[icoType]; }
    if (t.type === 'icon button' && t.titleRef && res) t.title = pstr(fork.get(T_PSTR, t.titleRef));
    // rTextForLETextBox2: vol. 3 (Fig. E-34) shows a length word first, but Apple's own resources are just the
    // text, codes included, filling the resource; take the length word only when it matches exactly
    if (t.type === 'static text' && res && t.textRef) {
      const d = fork.get(T_LETEXT, t.textRef);
      if (d) { const lw = d.length >= 2 && w(d, 0) === d.length - 2; const x = leText(lw ? d.subarray(2) : d); t.text = x.text; t.runs = x.runs; t.textHasLength = lw; }
    }
    if (t.type === 'LineEdit' && res && t.defaultRef) t.text = pstr(fork.get(T_PSTR, t.defaultRef));
    if (t.type === 'list' && res && t.listRef) {
      const d = fork.get(T_LISTREF, t.listRef), size = t.listMemSize || 5;
      if (d) { t.items = []; for (let o = 0; o + 5 <= d.length && t.items.length < (t.listSize || 9999); o += size) { const sid = l(d, o); t.items.push({ text: pstr(fork.get(T_PSTR, sid)), flag: d[o + 4] }); } }
    }
    if (t.type === 'pop-up menu' && t.popup.refType === 'resource' && !t.popup.menuIsText && t.menuRef && root.MENU && fork.get(0x8009, t.menuRef)) t.menu = root.MENU.readMenu(fork, t.menuRef);
    if (t.type === 'picture' && res && t.pictureRef) t.pictureBytes = (fork.get(T_PICT, t.pictureRef) || []).length;
    return t;
  }
  function readList(fork, id) {
    const d = fork.get(T_LIST, id); if (!d) return null;
    const ids = []; for (let o = 0; o + 4 <= d.length; o += 4) { const v = l(d, o); if (!v) break; ids.push(v); }
    return { resID: id, controls: ids.map(c => readTemplate(fork, c)) };
  }
  // window templates that name a control list
  function windows(fork) {
    const out = [];
    for (const r of fork.list(T_WINDOW)) {
      const d = fork.get(T_WINDOW, r.id); if (!d || d.length < 0x50) continue;
      const desc = w(d, 0x4E), ref = l(d, 0x4A), titleRef = l(d, 4);
      // plInDesc: bits 9-8 title reference type, bits 7-0 NewControl2's referenceDesc for plControlList
      // (9 = resource ID of an rControlList; 2 = resource ID of a single rControlTemplate)
      const title = ((desc >> 8) & 3) === 2 && titleRef ? pstr(fork.get(T_PSTR, titleRef)) : null;
      out.push({ resID: r.id, frame: w(d, 2), position: [s(d, 0x3E), s(d, 0x40), s(d, 0x42), s(d, 0x44)], controlRef: ref, controlDesc: desc & 0xFF, title });
    }
    return out;
  }
  // ---------- drawing (640 mode, Shaston 8), as System 6.0.4's Control Manager draws in a window ----------
  // MEASURED (tests/iigs/menutest/CTLTEST: NewWindow2 + DrawControls on Archiver's windows; check-controls.js):
  // round simple buttons and the default ring, check boxes (unchecked), pop-ups (no title), LineEdit frames and
  // the insertion bar, static text (LETextBox2 first line, justification, bold), dimming of inactive controls.
  // INFERRED (no capture yet): everything else; drawControl returns { inferred: true } for those.
  const D = () => root.MENU.draw;
  // the plain round button's left edge per row: [from, to] relative to the left edge, for top rows 0-2
  const ROUND = [[6, null], [3, 6], [1, 3]];
  function roundFrame(cv, L, T, W, H, v) {
    const { rect } = D(), R = L + W - 1, B = T + H - 1;
    rect(cv, L + 6, T, W - 12, 1, v); rect(cv, L + 6, B, W - 12, 1, v);
    for (const [y, k] of [[T + 1, 1], [B - 1, 1], [T + 2, 2], [B - 2, 2]]) { const [a, b] = ROUND[k]; rect(cv, L + a, y, b - a + 1, 1, v); rect(cv, R - b, y, b - a + 1, 1, v); }
    rect(cv, L, T + 3, 3, H - 6, v); rect(cv, R - 2, T + 3, 3, H - 6, v);
  }
  // the default button's outer ring, around a button at L,T of W x H
  function defaultRing(cv, L, T, W, H, v) {
    const { rect } = D(), R = L + W - 1, B = T + H - 1;
    const rows = [[T - 2, L + 7, R - 7], [B + 2, L + 7, R - 7]];
    for (const [y, a, b] of rows) rect(cv, a, y, b - a + 1, 1, v);
    const side = [[-1, 2, 6], [0, -1, 2], [1, -2, 0], [2, -3, -1]]; // [row from top, from, to] (left side; mirrored)
    for (const [dy, a, b] of side) for (const y of [T + dy, B - dy]) { rect(cv, L + a, y, b - a + 1, 1, v); rect(cv, R - b, y, b - a + 1, 1, v); }
    rect(cv, L - 4, T + 3, 3, H - 6, v); rect(cv, R + 2, T + 3, 3, H - 6, v);
  }
  function lines(font, runs, width) {
    // LETextBox2 word wrap: returns [{ parts: [{ text, style }], w, just }]
    const out = []; let cur = { parts: [], w: 0, just: 0 };
    const push = () => { out.push(cur); cur = { parts: [], w: 0, just: cur.just }; };
    for (const run of runs) {
      cur.just = run.just;
      const words = run.text.split(/(\r| )/);
      for (const wd of words) {
        if (wd === '\r') { push(); continue; }
        if (!wd) continue;
        const ww = D().textBits(font, wd, run.style).adv;
        if (cur.w + ww > width && wd !== ' ' && cur.w > 0) { while (cur.parts.length && cur.parts[cur.parts.length - 1].text === ' ') { cur.w -= D().textBits(font, ' ', cur.parts.pop().style).adv; } push(); }
        if (wd === ' ' && cur.w === 0 && out.length) continue;
        cur.parts.push({ text: wd, style: run.style }); cur.w += ww;
      }
    }
    if (cur.parts.length) push();
    return out;
  }
  // bounding box of a control, with automatic sizes worked out (bottom/right 0 = sized by the control)
  function bounds(t, font) {
    let [T, L, B, R] = t.rect; const tw = s => D().textBits(font, s || '', 0).adv;
    if (t.type === 'simple button' && (!B || !R)) { B = T + 14; R = L + tw(t.title) + 30; }
    if ((t.type === 'check box' || t.type === 'radio button') && (!B || !R)) { B = T + 9; R = L + (t.type === 'radio button' ? 25 : 27) + tw(t.title); }
    // a pop-up's rect includes its 4-pixel shadow (rect 160 wide: box 156); with no right edge it fits its items
    if (t.type === 'pop-up menu' && R) { R -= 4; if (!B) B = T + 12; } // (the bottom shadow is below the rect)
    else if (t.type === 'pop-up menu') {
      const items = (t.menu && t.menu.items || []).map(i => tw(i.title)); B = T + 12;
      R = L + (t.titleWidth || 0) + Math.max(0, ...items) + 23;
    }
    if (!B) B = T + 12; if (!R) R = L + 40;
    return [T, L, B, R];
  }
  function drawControl(cv, t, font, ox, oy, opt) {
    opt = opt || {};
    const { rect, text, dim, invert } = D(), [T0, L0, B0, R0] = bounds(t, font), T = oy + T0, L = ox + L0, W = R0 - L0, H = B0 - T0;
    const inactive = t.hilite === 255, tw = s => D().textBits(font, s || '', 0).adv;
    let inferred = false;
    if (t.invisible) return { skipped: 'invisible' };
    switch (t.type) {
      case 'simple button': {
        rect(cv, L, T, W, H, 3);
        if ((t.flag & 3) < 2) roundFrame(cv, L, T, W, H, 0); else { inferred = true; rect(cv, L, T, W, 1, 0); rect(cv, L, T + H - 1, W, 1, 0); rect(cv, L, T, 2, H, 0); rect(cv, L + W - 2, T, 2, H, 0); if ((t.flag & 3) === 3) { rect(cv, L + W, T + 2, 2, H, 0); rect(cv, L + 2, T + H, W, 1, 0); } }
        if ((t.flag & 3) === 1) defaultRing(cv, L, T, W, H, 0);
        text(cv, font, t.title || '', L + Math.floor((W - tw(t.title)) / 2), T + Math.ceil((H - root.FONT.height(font)) / 2) + font.ascent, 0);
        if (inactive) dim(cv, L + 2, T + 3, W - 4, H - 6, 3); // frame and ring stay solid (measured on an inactive default button)
        break;
      }
      case 'check box': case 'radio button': {
        const on = !!t.initialValue;
        if (t.type === 'check box') {
          rect(cv, L, T, 23, 1, 0); rect(cv, L, T + 8, 23, 1, 0); rect(cv, L, T, 2, 9, 0); rect(cv, L + 21, T, 2, 9, 0);
          if (on) { inferred = true; for (let i = 0; i < 7; i++) { const x = L + 4 + Math.round(i * 14 / 6); rect(cv, x, T + 1 + i, 2, 1, 0); rect(cv, L + 17 - Math.round(i * 14 / 6), T + 1 + i, 2, 1, 0); } }
        } else {
          // a 21 x 9 oval: [row, from, to] for the left half (mirrored about L + 10); the dot when set
          for (const [r, a, b] of [[0, 6, 10], [1, 3, 5], [2, 1, 2], [3, 0, 1], [4, 0, 1], [5, 0, 1], [6, 1, 2], [7, 3, 5], [8, 6, 10]]) { rect(cv, L + a, T + r, b - a + 1, 1, 0); rect(cv, L + 20 - b, T + r, b - a + 1, 1, 0); }
          if (on) for (const [r, a] of [[2, 7], [3, 5], [4, 4], [5, 5], [6, 7]]) rect(cv, L + a, T + r, 21 - 2 * a, 1, 0);
        }
        text(cv, font, t.title || '', L + (t.type === 'radio button' ? 25 : 27), T + 8, 0);
        if (inactive) dim(cv, L, T, W, H, 3);
        break;
      }
      case 'pop-up menu': {
        const tWidth = t.titleWidth || 0, bx = L + tWidth, bw = W - tWidth;
        if (tWidth && !t.popup.dontDrawTitle && t.menu && t.menu.title) { inferred = true; text(cv, font, t.menu.title, L, T + 9, 0); }
        rect(cv, bx, T, bw, H, 3); rect(cv, bx, T, bw, 1, 0); rect(cv, bx, T + H - 1, bw, 1, 0); rect(cv, bx, T, 2, H, 0); rect(cv, bx + bw - 2, T, 2, H, 0);
        rect(cv, bx + bw, T + 4, 4, H - 3, 0); rect(cv, bx + 5, T + H, bw - 1, 1, 0);
        const items = t.menu ? t.menu.items : [], cur = items.find(i => i.id === t.initialValue) || items[0];
        if (cur && !t.popup.dontDrawResult) text(cv, font, cur.title || '', bx + 13, T + 9, 0, cur.style || 0);
        if (inactive) dim(cv, L, T, W, H, 3); // the shadow stays solid (measured)
        break;
      }
      case 'LineEdit': {
        rect(cv, L, T, W, H, 3); rect(cv, L, T, W, 1, 0); rect(cv, L, T + H - 1, W, 1, 0); rect(cv, L, T, 2, H, 0); rect(cv, L + W - 2, T, 2, H, 0);
        if (t.text) { inferred = true; text(cv, font, t.text, L + 6, T + 9, 0); }
        if (opt.target) rect(cv, L + 6 + (t.text ? tw(t.text) : 0), T + 2, 1, 9, 0);
        // an inactive LineEdit is NOT dimmed (measured)
        break;
      }
      case 'static text': {
        const runs = t.runs || [{ text: t.text || '', style: 0, just: 0 }];
        rect(cv, L, T, W, H, 3); // LETextBox2 erases its rectangle first (it wipes a neighbouring button's edge)
        lines(font, runs, W).forEach((ln, i) => {
          const base = T + font.ascent + 1 + i * (root.FONT.height(font) + 1);
          if (base > T + H + font.descent) return;
          let x = ln.just === 1 ? L + Math.floor((W - ln.w) / 2) : ln.just === -1 ? L + W - ln.w : L;
          for (const p of ln.parts) x += text(cv, font, p.text, x, base, 0, p.style);
        });
        if (runs.length > 1 || (runs[0] && /\r/.test(runs[0].text))) inferred = inferred || false;
        break;
      }
      default: {
        // inferred: a frame, with what the template says written inside
        inferred = true;
        const label = t.type === 'list' ? null : t.type === 'icon button' ? (t.title || '') : t.type;
        rect(cv, L, T, W, H, 3); rect(cv, L, T, W, 1, 0); rect(cv, L, T + H - 1, W, 1, 0); rect(cv, L, T, 2, H, 0); rect(cv, L + W - 2, T, 2, H, 0);
        if (t.type === 'list') {
          const mh = t.listMemHeight || 10; rect(cv, L + W - 26, T, 2, H, 0);
          (t.items || []).slice(0, Math.floor((H - 2) / mh)).forEach((it, i) => text(cv, font, it.text || '', L + 6, T + 1 + i * mh + font.ascent + 1, 0));
        } else if (t.type === 'icon button' && t.icon && root.SHR) {
          const p = root.SHR.iconToPixels(t.icon), x0 = L + Math.floor((W - p.w) / 2), y0 = T + 2;
          for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.mask[y * p.w + x]) D().set(cv, x0 + x, y0 + y, p.val[y * p.w + x] & 3);
          if (label) text(cv, font, label, L + Math.floor((W - tw(label)) / 2), T + H - 3, 0);
        } else if (label && H >= 10) text(cv, font, label.slice(0, 40), L + 4, T + Math.min(H - 2, 9), 0);
        if (inactive) dim(cv, L, T, W, H, 3);
      }
    }
    // the pixels the control covers: the pop-up shadow, the default ring and the square shadow reach outside
    const out = t.type === 'pop-up menu' ? [0, 0, 1, 4] : t.type === 'simple button' && (t.flag & 3) === 1 ? [2, 4, 3, 5] : t.type === 'simple button' && (t.flag & 3) === 3 ? [0, 0, 1, 2] : [0, 0, 0, 0];
    return { inferred, box: [T - out[0], L - out[1], T + H + out[2], L + W + out[3]] };
  }
  // draw a whole control list into a canvas with the window content's top-left at (ox, oy); the first active
  // LineEdit gets the insertion bar, as the Control Manager makes it the target
  function drawList(cv, list, font, ox, oy) {
    let target = list.controls.find(c => c.type === 'LineEdit' && c.hilite !== 255 && !c.invisible);
    // the Control Manager puts each new control at the head of its list and draws from the head, so the
    // first template ends up on top: draw in reverse
    const out = []; for (let i = list.controls.length - 1; i >= 0; i--) { const c = list.controls[i]; out[i] = c.missing ? { skipped: 'missing' } : drawControl(cv, c, font, ox, oy, { target: c === target }); }
    return out;
  }
  // the area a list's controls cover (for sizing a picture of it)
  function extent(list, font) {
    let b = 0, r = 0; for (const c of list.controls) if (!c.missing) { const [, , B, R] = bounds(c, font); b = Math.max(b, B + 4); r = Math.max(r, R + 6); }
    return { w: Math.min(640, Math.max(r, 20)), h: Math.min(200, Math.max(b, 12)) };
  }

  root.CONTROL = { T_LIST, T_TEMPLATE, T_WINDOW, TYPES, parseTemplate, readTemplate, readList, windows, leText, bounds, drawControl, drawList, extent };
})(typeof window !== 'undefined' ? window : globalThis);
