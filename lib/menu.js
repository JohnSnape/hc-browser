/* menu.js — Apple IIGS menu resources, for the browser and Node.
 *
 * Layouts (Apple IIGS Toolbox Reference vol. 3, Appendix E; every field checked on 7 menu bars, 90 menus and
 * 338 items from the System 6.0.4 disks, all version 0, all items 14 bytes):
 *   rMenuBar  $8008: +0 version 0, +2 menuBarFlag (bits 15-14 = how menuRefArray refers to menus:
 *                    0 pointer, 1 handle, 2 resource ID), +4 longs, ending with 0
 *   rMenu     $8009: +0 version 0, +2 menuID, +4 menuFlag, +6 menuTitleRef (long), +10 item refs (longs), ending with 0
 *                    menuFlag: bits 15-14 title ref type, 13-12 item ref type, bit 8 alwaysCallmChoose,
 *                    bit 7 disabled, bit 5 XOR highlight, bit 4 custom, bit 3 allowCache
 *   rMenuItem $800A: +0 version 0, +2 itemID, +4 itemChar, +5 itemAltChar (key equivalents), +6 itemCheck (mark
 *                    character when checked, 0 none), +8 itemFlag, +10 itemTitleRef (long)
 *                    itemFlag: bits 15-14 title ref type, bit 12 shadow, bit 11 outline, bit 7 disabled,
 *                    bit 6 divider below, bit 5 XOR highlight, bit 2 underline, bit 1 italic, bit 0 bold
 *   Titles referred to by resource ID are rPString ($8006) resources. A title of "@" alone is the Apple
 *   (desk accessory) menu; an item titled "-" is a dividing line.
 * Classic script: sets globalThis.MENU.
 */
(function (root) {
  'use strict';
  const T_BAR = 0x8008, T_MENU = 0x8009, T_ITEM = 0x800A, T_PSTR = 0x8006;
  const REF = ['pointer', 'handle', 'resource', 'invalid'];
  const w = (b, o) => b[o] | b[o + 1] << 8, l = (b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0;
  const u8 = x => x instanceof Uint8Array ? x : new Uint8Array(x);
  function refs(b, o) { const a = []; for (; o + 4 <= b.length; o += 4) { const r = l(b, o); if (!r) break; a.push(r); } return a; }

  function parseBar(bytes) {
    const b = u8(bytes); if (b.length < 8) throw new Error('Not a menu bar resource (too short).');
    const flags = w(b, 2);
    return { version: w(b, 0), flags, refType: REF[flags >> 14], menus: refs(b, 4) };
  }
  function parseMenu(bytes) {
    const b = u8(bytes); if (b.length < 14) throw new Error('Not a menu resource (too short).');
    const flags = w(b, 4);
    return { version: w(b, 0), id: w(b, 2), flags, titleRefType: REF[flags >> 14], itemRefType: REF[(flags >> 12) & 3],
      disabled: !!(flags & 0x80), xor: !!(flags & 0x20), custom: !!(flags & 0x10), allowCache: !!(flags & 8), alwaysCallmChoose: !!(flags & 0x100),
      titleRef: l(b, 6), items: refs(b, 10) };
  }
  function parseItem(bytes) {
    const b = u8(bytes); if (b.length < 14) throw new Error('Not a menu item resource (too short).');
    const flags = w(b, 8);
    return { version: w(b, 0), id: w(b, 2), char: b[4], altChar: b[5], check: w(b, 6), flags, titleRefType: REF[flags >> 14],
      disabled: !!(flags & 0x80), divider: !!(flags & 0x40), xor: !!(flags & 0x20),
      style: (flags & 7) | (flags & 0x0800 ? 8 : 0) | (flags & 0x1000 ? 16 : 0), // QuickDraw text style bits
      titleRef: l(b, 10) };
  }
  const STYLE = ['bold', 'italic', 'underline', 'outline', 'shadow'];
  const styleNames = s => STYLE.filter((_, i) => s & (1 << i));
  const pstr = b => b && b.length ? String.fromCharCode(...b.subarray(1, 1 + b[0])) : null;

  // Resolve a whole menu (and its items) from a resource fork (an RSRC.Fork). Refs that are not resource IDs
  // cannot be followed in a file and come back as null titles.
  function readMenu(fork, menuResID) {
    const m = parseMenu(fork.get(T_MENU, menuResID));
    const str = (type, id) => type === 'resource' ? pstr(fork.get(T_PSTR, id)) : null;
    m.resID = menuResID; m.title = str(m.titleRefType, m.titleRef);
    m.items = m.items.map(ref => {
      if (m.itemRefType !== 'resource') return { ref, title: null };
      const raw = fork.get(T_ITEM, ref); if (!raw) return { ref, missing: true, title: null };
      const it = parseItem(raw); it.resID = ref; it.title = str(it.titleRefType, it.titleRef); return it;
    });
    return m;
  }
  function readBar(fork, barResID) {
    const bar = parseBar(fork.get(T_BAR, barResID)); bar.resID = barResID;
    bar.menus = bar.refType === 'resource' ? bar.menus.map(id => fork.get(T_MENU, id) ? readMenu(fork, id) : { resID: id, missing: true, items: [] }) : [];
    return bar;
  }
  // printable form of a key equivalent / mark character (Shaston has its own glyphs below $20)
  const keyText = (c, a) => !c ? '' : String.fromCharCode(c) + (a && a !== c ? '/' + String.fromCharCode(a) : '');

  // ---------- drawing, as System 6.0.4's Menu Manager draws in 640 mode ----------
  // A canvas is { w, h, px: Uint8Array of 2-bit screen values (0 black ... 3 white), line: per-line palette
  // number (0 = QuickDraw's standard 640 palette; 1-6 = the Apple-logo stripes, see APPLE_PALETTES) }.
  // Geometry measured on screen dumps of real menus drawn by the Menu Manager (tests/iigs/menutest: Teach's bar
  // and six menus, then Archiver's bar and four menus as an independent check; every compared pixel matches):
  // the bar is 13 lines (black top and bottom line, 2-pixel black sides, white inside); titles start at x 12; a
  // title is as wide as its text, the Apple title 24; title text baseline at y 10; a selected title is inverted
  // on lines 1-11 (the Apple title instead gets black behind its logo). A menu's box hangs from the bar's bottom
  // line at its title's x: 2-pixel sides, 1-line bottom; shadow 4 pixels wide on the right from 3 lines down, and
  // 1 line below from 5 pixels in; items are 12 lines, baseline 9 lines down, text 15 pixels in; box width =
  // widest item + 27, where an item with an Apple-key equivalent counts 22 more (whatever the letter), and the
  // key equivalent (open-apple, $11 in Shaston, then the letter) starts 20 pixels from the right edge. A "-"
  // item is a dimmed line 6 lines down. Disabled items and titles keep only pixels with (x + y) even (the rest
  // turn to the background), applied after any inversion. NOT measured: the check-mark column (markX) and
  // the divider-below flag, which no captured menu used.
  const G = {
    barH: 13, titleX0: 12, appleW: 24, titleBase: 10, itemH: 12, itemBase: 9, textX: 15, extraW: 27,
    keyW: 22, keyCol: 20, markX: 4, shadowW: 4, shadowTop: 3, shadowLeft: 5, dimPhase: 1,
  };
  // Menu bar line palettes the Menu Manager installs (InitPalette): value 1 on lines 2-9 paints the Apple logo
  // green, green, green, yellow, orange, red, purple, blue (measured from the SCBs and palettes of a dump).
  const APPLE_LINES = [0, 0, 1, 1, 1, 2, 3, 4, 5, 6, 0, 0, 0];
  const STD = [0x000, 0xF00, 0x0F0, 0xFFF, 0x000, 0x00F, 0xFF0, 0xFFF, 0x000, 0xF00, 0x0F0, 0xFFF, 0x000, 0x00F, 0xFF0, 0xFFF];
  const stripe = c => STD.map((v, i) => (i & 3) === 1 ? c : v);
  const APPLE_PALETTES = [STD, stripe(0x0C0), stripe(0xFF0), stripe(0xF80), stripe(0xF00), stripe(0xF0F), stripe(0x004)];
  // 640 mode: a pixel's value v at column x shows palette color [8, 12, 0, 4][x & 3] + v
  const colorAt = (cv, x, y) => { const p = APPLE_PALETTES[cv.line[y] || 0] || STD, v = cv.px[y * cv.w + x]; return p[[8, 12, 0, 4][x & 3] + v]; };

  function canvas(w, h) { return { w, h, px: new Uint8Array(w * h).fill(3), line: new Uint8Array(h) }; }
  const set = (cv, x, y, v) => { if (x >= 0 && y >= 0 && x < cv.w && y < cv.h) cv.px[y * cv.w + x] = v; };
  function rect(cv, x, y, w, h, v) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(cv, i, j, v); }
  function invert(cv, x, y, w, h) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < cv.w && j < cv.h) cv.px[j * cv.w + i] ^= 3; }
  const codes = s => Array.from(s || '', c => c.charCodeAt(0) & 255);
  const width = (font, s) => root.FONT.measure(font, codes(s));
  // Styled menu-item text, character by character, as measured in Teach's Style menu (System 6.0.4, Shaston 8;
  // the menu was disabled, so only the half of the pixels the dim pattern leaves was compared, all matching):
  //   bold: the glyph again 1 pixel right, +1 advance;  italic: rows shifted right by floor(-y / 4), y from the
  //   baseline (up is negative), no extra advance;  outline: the 8 neighbours of the glyph minus the glyph,
  //   +1 advance;  shadow: offsets -1..+2 in x and y minus the glyph, +2 advance;  underline: nothing visible
  //   was drawn, so it is not drawn here.
  function textBits(font, s, style) {
    const F = root.FONT, out = new Set(); let pen = 0;
    for (const c of codes(s)) {
      const g = F.glyphFor(font, c), px = [];
      for (let y = 0; y < g.bits.length / Math.max(1, g.w); y++) for (let i = 0; i < g.w; i++) if (g.bits[y * g.w + i]) {
        const yy = y - font.ascent; px.push([pen + g.left + i + (style & 2 ? Math.floor(-yy / 4) : 0), yy]);
      }
      let pts = px; if (style & 1) pts = px.concat(px.map(([x, y]) => [x + 1, y]));
      if (style & (8 | 16)) {
        const on = new Set(pts.map(p => p + '')), hi = style & 16 ? 2 : 1, ring = [];
        for (const [x, y] of pts) for (let dy = -1; dy <= hi; dy++) for (let dx = -1; dx <= hi; dx++) if (!on.has([x + dx, y + dy] + '')) ring.push([x + dx, y + dy]);
        pts = ring;
      }
      for (const p of pts) out.add(p + '');
      pen += g.adv + (style & 1 ? 1 : 0) + (style & 16 ? 2 : style & 8 ? 1 : 0);
    }
    return { pix: [...out].map(k => k.split(',').map(Number)), adv: pen };
  }
  function text(cv, font, s, x, base, v, style) { const t = textBits(font, s, style || 0); for (const [i, j] of t.pix) set(cv, x + i, base + j, v); return t.adv; }
  // gray out a rectangle the way disabled items and titles look: every other pixel, alternating by line,
  // turned to the background
  function dim(cv, x, y, w, h, bg) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (((i + j + G.dimPhase) & 1) === 0) set(cv, i, j, bg); }

  function titleLayout(bar, font) {
    let x = G.titleX0;
    return bar.menus.map(m => { const w = m.title === '@' ? G.appleW : width(font, m.title || ''); const t = { menu: m, x, w }; x += w; return t; });
  }
  function drawApple(cv, x, y, apple, hilite) {
    if (!apple) return;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 16; c++) {
      const sh = 6 - 2 * (c & 3), b = (r * 4) + (c >> 2), m = (apple.mask[b] >> sh) & 3, im = (apple.image[b] >> sh) & 3, i = (y + r) * cv.w + x + c;
      if (x + c < cv.w && y + r < cv.h) cv.px[i] = (cv.px[i] & m) | im;
    }
  }
  // the menu bar; hilite = index of a title drawn selected
  function drawBar(cv, bar, font, opt) {
    opt = opt || {};
    rect(cv, 0, 0, cv.w, G.barH, 3); rect(cv, 0, 0, cv.w, 1, 0); rect(cv, 0, G.barH - 1, cv.w, 1, 0); rect(cv, 0, 0, 2, G.barH, 0); rect(cv, cv.w - 2, 0, 2, G.barH, 0);
    for (let y = 0; y < G.barH; y++) cv.line[y] = APPLE_LINES[y];
    titleLayout(bar, font).forEach((t, i) => {
      const on = i === opt.hilite;
      if (t.menu.title === '@') { if (on) rect(cv, t.x, 1, t.w, G.barH - 2, 0); drawApple(cv, t.x + 4, 2, opt.apple); return; } // selected: black behind the logo
      text(cv, font, t.menu.title || '', t.x, G.titleBase, 0);
      if (on) invert(cv, t.x, 1, t.w, G.barH - 2);
      if (t.menu.disabled) dim(cv, t.x, 1, t.w, G.barH - 2, on ? 0 : 3);
    });
    return cv;
  }
  function itemWidth(font, it) {
    if (it.title === '-') return 0;
    const k = it.char ? G.keyW : 0; // a key equivalent adds 22 whatever its letter (Replace Same's E and Underline's U alike)
    return textBits(font, it.title || '', it.style || 0).adv + k;
  }
  function menuSize(menu, font) {
    const w = Math.max(0, ...menu.items.map(it => itemWidth(font, it))) + G.extraW;
    return { w, h: menu.items.length * G.itemH };
  }
  // a pulled-down menu whose box's top-left corner is (x, top); hiliteItem = index of an item drawn selected
  function drawMenu(cv, menu, font, x, top, opt) {
    opt = opt || {};
    const { w, h } = menuSize(menu, font), y0 = top + 1;
    rect(cv, x, y0, w, h, 3); rect(cv, x, y0, 2, h + 1, 0); rect(cv, x + w - 2, y0, 2, h + 1, 0); rect(cv, x, y0 + h, w, 1, 0);
    rect(cv, x + w, y0 + G.shadowTop, G.shadowW, h + 2 - G.shadowTop, 0); rect(cv, x + G.shadowLeft, y0 + h + 1, w - G.shadowLeft, 1, 0);
    menu.items.forEach((it, i) => {
      const iy = y0 + i * G.itemH, base = iy + G.itemBase, off = menu.disabled || it.disabled;
      if (it.title === '-') { rect(cv, x + 2, iy + 6, w - 4, 1, 0); dim(cv, x + 2, iy + 6, w - 4, 1, 3); return; }
      if (it.checked && it.check) text(cv, font, String.fromCharCode(it.check), x + G.markX, base, 0);
      text(cv, font, it.title || '', x + G.textX, base, 0, it.style || 0);
      if (it.char) text(cv, font, '\x11' + String.fromCharCode(it.char), x + w - G.keyCol, base, 0); // a fixed column, not right-aligned
      if (it.divider) rect(cv, x + 2, iy + G.itemH - 1, w - 4, 1, 0);
      if (i === opt.hilite) invert(cv, x + 2, iy, w - 4, G.itemH);
      if (off) dim(cv, x + 2, iy, w - 4, G.itemH, i === opt.hilite ? 0 : 3);
    });
    return { w, h: h + 2 };
  }

  root.MENU = { T_BAR, T_MENU, T_ITEM, T_PSTR, parseBar, parseMenu, parseItem, readMenu, readBar, styleNames, keyText,
    G, APPLE_PALETTES, canvas, colorAt, titleLayout, drawBar, drawMenu, menuSize };
})(typeof window !== 'undefined' ? window : globalThis);
