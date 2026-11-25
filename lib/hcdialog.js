/* hcdialog.js — HyperCard IIGS 1.1's answer and ask dialogs, drawn into a Super Hi-Res frame (lib/card.js).
 *
 *   const d = HCDIALOG.answer(text, ['Cancel', 'OK'], font)   // or HCDIALOG.ask(prompt, default, font, password)
 *   HCDIALOG.draw(frame, d)              draw it over the card (d.pressed = button index held down)
 *   HCDIALOG.buttonAt(d, x, y)           index of the button under a screen pixel, or -1
 *   HCDIALOG.key(d, key, ch)             edit the ask field: 'left' 'right' 'backspace' 'delete' 'home' 'end' or a
 *                                      character code; returns true when the field changed
 *   HCDIALOG.clickField(d, x, y)         place the insertion point; true if (x, y) is in the field
 *   d.default                          the button Return and Enter press
 *   d.cancel                           the button Escape and Command-period press (-1: none)
 *
 * All geometry is measured in HyperCard IIGS 1.1 under GSport (tests/hcgs-render/dialogs.sh, docs §6), with
 * Shaston 8 as the system font. Screen pixels: 640 across, 200 down. Rules not yet confirmed are marked 🔶.
 * Classic script: sets globalThis.HCDIALOG. Needs CARD (lib/card.js) and FONT (lib/font.js).
 */
(function (root) {
  'use strict';
  const BLACK = 0, WHITE = 3;
  const T = () => root.CARD.text;

  // The window: content area x 130..510 (centered on the 640 screen), top 40; a 1-row / 2-pixel outer line
  // 12 pixels outside it, white, then a 2-row / 5-pixel black band just outside the content. ✅
  const CX0 = 130, CX1 = 510, CY0 = 40;
  // Message text: wrapped to 340 pixels (TextEdit-style, at spaces) from pen x 150; line n's baseline is
  // 58 + 9 * (n - 1) (Shaston 8: 8 rows + 1 leading). ✅ 340 lies in the measured range 333-347 and equals the ask field width.
  const TX = 150, TW = 340, BASE0 = 58, LH = 9;
  // Buttons 15 rows tall. answer: 90 wide, 125 apart, the last one's right edge at 490, the last is the default.
  // ask: OK 330-400 (default), Cancel 420-490. ✅
  const BH = 15;

  // Word wrap the way the dialog's TextEdit does it: a line breaks after the last space that keeps it within the
  // width, and the spaces at the end of a line do not count. ✅ (a 338-pixel line followed by a space stays whole;
  // wrapping that counts the space would move its last word down). A word longer than a line breaks where it fills it. 🔶
  function wrapTE(font, codes, width) {
    const adv = c => T().advance(font, [c], 'plain'), out = [];
    let start = 0;
    while (start < codes.length) {
      let w = 0, i = start, brk = -1;
      for (; i < codes.length; i++) {
        if (codes[i] === 32) { brk = i; w += adv(32); continue; }
        if (w + adv(codes[i]) > width) break;
        w += adv(codes[i]);
      }
      if (i >= codes.length) { out.push(codes.slice(start)); break; }
      let end = brk >= start ? brk + 1 : Math.max(i, start + 1);
      while (end < codes.length && codes[end] === 32) end++;
      out.push(codes.slice(start, end)); start = end;
    }
    return out.length ? out : [[]];
  }
  function lines(text, font) {
    const out = [];
    for (const para of String(text).split('\n')) for (const ln of wrapTE(font, T().enc(para), TW)) out.push(ln);
    return out.length ? out : [[]];
  }

  // Vertical layout: the message box runs from row 50, 9 rows a line, and is at least 10 rows tall (bottom >= 60).
  // answer's buttons start 10 rows under it, ask's field 7 rows under it. ✅ 1-4 lines (answer), 1 and 3 (ask).
  // The dialog stops at the bottom of the screen: its outer line on row 199, so the buttons start at row 175 or
  // above, and the message is cut off 10 rows above the buttons. ✅ 18 lines
  const textBottom = n => Math.max(60, 50 + LH * n);
  const BTN_MAX = 175;

  function answer(text, buttons, font) {
    const L = lines(text, font), n = L.length;
    const top = Math.min(BTN_MAX, textBottom(n) + 10);
    const N = buttons.length;
    const btns = buttons.map((name, i) => { const x1 = 490 - 125 * (N - 1 - i); return { name, x0: x1 - 90, y0: top, x1, y1: top + BH }; });
    return finish({ kind: 'answer', lines: L, textClip: top - 10, font, btns, default: N - 1, cancel: buttons.findIndex(b => /^cancel$/i.test(b)) });
  }

  function ask(prompt, def, font, password) {
    const L = lines(prompt, font), n = L.length;
    const ft = Math.min(BTN_MAX - 22, textBottom(n) + 7);
    const field = { x0: 150, y0: ft, x1: 490, y1: ft + 13 };
    const top = field.y1 + 9;
    const btns = [{ name: 'OK', x0: 330, y0: top, x1: 400, y1: top + BH }, { name: 'Cancel', x0: 420, y0: top, x1: 490, y1: top + BH }];
    const codes = T().enc(def == null ? '' : String(def));
    return finish({ kind: 'ask', lines: L, textClip: ft - 7, font, btns, default: 0, cancel: 1, field, text: codes, selStart: 0, selEnd: codes.length, scroll: 0, password: !!password });
  }

  function finish(d) {
    d.bottom = Math.max(...d.btns.map(b => b.y1)) + 5; // content bottom; the black band is the 2 rows under it ✅
    d.pressed = -1; d.caretOn = true;
    return d;
  }

  // ---- drawing
  // a 15-row button's frame: black runs per row from the top as [from, to) offsets from the left edge, mirrored
  // right and bottom; rows past the table are [0, 3). ✅
  const BTN = [[[6, null]], [[3, 7]], [[1, 4]]];
  // the default button's ring, 4 pixels / 2 rows outside the button, 19 rows: ✅
  const RING = [[[11, null]], [[6, 11]], [[3, 7]], [[2, 5]], [[1, 4]]];
  function rounded(f, x0, y0, x1, y1, table, side) {
    const h = y1 - y0;
    for (let k = 0; k < h; k++) {
      const row = Math.min(k, h - 1 - k), runs = table[row] || [[0, side]], y = y0 + k;
      for (const [a, b] of runs) {
        if (b === null) { f.fill(x0 + a, y, x1 - a, y + 1, BLACK); continue; }
        f.fill(x0 + a, y, x0 + b, y + 1, BLACK); f.fill(x1 - b, y, x1 - a, y + 1, BLACK);
      }
    }
  }
  // the inside of a button, row by row (what a press inverts) 🔶 the pressed look is not measured
  function inside(f, b, fn) {
    const h = b.y1 - b.y0;
    for (let k = 1; k < h - 1; k++) {
      const row = Math.min(k, h - 1 - k), r = BTN[row], from = r ? (r[0][1] === null ? null : r[0][1]) : 3;
      if (from !== null) fn(b.x0 + from, b.y0 + k, b.x1 - from, b.y0 + k + 1);
    }
  }
  function drawButton(f, b, font, isDefault, pressed) {
    inside(f, b, (a, y, c, z) => f.fill(a, y, c, z, WHITE));
    rounded(f, b.x0, b.y0, b.x1, b.y1, BTN, 3);
    if (isDefault) rounded(f, b.x0 - 4, b.y0 - 2, b.x1 + 4, b.y1 + 2, RING, 3);
    const codes = T().enc(b.name), w = font ? T().advance(font, codes, 'plain') : 0;
    // a name wider than the button is not drawn at all ✅ (185 pixels in a 90-pixel button); 🔶 the exact limit
    if (font && w <= b.x1 - b.x0 - 6) {
      T().drawString(f, font, codes, b.x0 + Math.floor((b.x1 - b.x0 - w) / 2), b.y0 + 11, BLACK, 'plain', [b.x0 + 3, b.y0 + 1, b.x1 - 3, b.y1 - 1]);
    }
    if (pressed) inside(f, b, (a, y, c, z) => f.invert(a, y, c, z));
  }

  const BULLET = 0xA5; // 🔶 how ask password shows what is typed is not measured
  const shown = d => d.password ? d.text.map(() => BULLET) : d.text;
  const xOf = (d, i) => d.field.x0 + 6 + T().advance(d.font, shown(d).slice(0, i), 'plain') - d.scroll;

  function draw(f, d) {
    const top = CY0, bot = d.bottom;
    // outer white margin and line, black band, white content
    f.fill(CX0 - 12, top - 5, CX1 + 12, bot + 5, WHITE);
    f.fill(CX0 - 12, top - 5, CX1 + 12, top - 4, BLACK); f.fill(CX0 - 12, bot + 4, CX1 + 12, bot + 5, BLACK);
    f.fill(CX0 - 12, top - 5, CX0 - 10, bot + 5, BLACK); f.fill(CX1 + 10, top - 5, CX1 + 12, bot + 5, BLACK);
    f.fill(CX0 - 5, top - 2, CX1 + 5, top, BLACK); f.fill(CX0 - 5, bot, CX1 + 5, bot + 2, BLACK);
    f.fill(CX0 - 5, top - 2, CX0, bot + 2, BLACK); f.fill(CX1, top - 2, CX1 + 5, bot + 2, BLACK);
    const font = d.font;
    if (font) d.lines.forEach((ln, k) => T().drawString(f, font, ln, TX, BASE0 + LH * k, BLACK, 'plain', [CX0, top, CX1, d.textClip]));
    if (d.field) {
      const F = d.field, clip = [F.x0 + 2, F.y0 + 1, F.x1 - 2, F.y1 - 1];
      f.fill(F.x0, F.y0, F.x1, F.y1, WHITE); f.frame(F.x0, F.y0, F.x1, F.y1, BLACK);
      // the text line: top 2 rows inside the frame, baseline 8 rows lower; text from x + 6 ✅
      if (font) T().drawString(f, font, shown(d), F.x0 + 6 - d.scroll, F.y0 + 10, BLACK, 'plain', clip);
      const lo = Math.min(d.selStart, d.selEnd), hi = Math.max(d.selStart, d.selEnd);
      if (font && hi > lo) f.invert(Math.max(clip[0], xOf(d, lo)), F.y0 + 2, Math.min(clip[2], xOf(d, hi)), F.y0 + 11);
      else if (font && d.caretOn) { const x = xOf(d, lo); if (x >= clip[0] && x < clip[2]) f.fill(x, F.y0 + 2, x + 1, F.y0 + 11, BLACK); }
    }
    d.btns.forEach((b, i) => drawButton(f, b, font, i === d.default, i === d.pressed));
  }

  const buttonAt = (d, x, y) => d.btns.findIndex(b => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1);

  // ---- the ask field (one line; it scrolls sideways to keep the insertion point in view 🔶)
  function keepVisible(d) {
    const F = d.field, w = F.x1 - F.x0 - 14, x = T().advance(d.font, shown(d).slice(0, d.selEnd), 'plain');
    if (x - d.scroll > w) d.scroll = x - w; if (x < d.scroll) d.scroll = Math.max(0, x - 20);
  }
  function key(d, k, ch) {
    if (!d.field) return false;
    const lo = Math.min(d.selStart, d.selEnd), hi = Math.max(d.selStart, d.selEnd), n = d.text.length;
    const put = (a, b, ins) => { d.text = d.text.slice(0, a).concat(ins, d.text.slice(b)); d.selStart = d.selEnd = a + ins.length; };
    if (k === 'left') d.selStart = d.selEnd = hi > lo ? lo : Math.max(0, lo - 1);
    else if (k === 'right') d.selStart = d.selEnd = hi > lo ? hi : Math.min(n, hi + 1);
    else if (k === 'home') d.selStart = d.selEnd = 0;
    else if (k === 'end') d.selStart = d.selEnd = n;
    else if (k === 'backspace') { if (hi > lo) put(lo, hi, []); else if (lo > 0) put(lo - 1, lo, []); }
    else if (k === 'delete') { if (hi > lo) put(lo, hi, []); else if (lo < n) put(lo, lo + 1, []); }
    else if (k === 'selectAll') { d.selStart = 0; d.selEnd = n; }
    else if (typeof ch === 'number' && ch >= 32 && ch !== 127) put(lo, hi, [ch]);
    else return false;
    d.caretOn = true; keepVisible(d); return true;
  }
  function indexAt(d, x) {
    const s = shown(d); let best = 0, bd = Infinity;
    for (let i = 0; i <= s.length; i++) { const dx = Math.abs(xOf(d, i) - x); if (dx < bd) { bd = dx; best = i; } }
    return best;
  }
  function clickField(d, x, y, extend) {
    const F = d.field; if (!F || x < F.x0 || x >= F.x1 || y < F.y0 || y >= F.y1) return false;
    const i = indexAt(d, x); if (extend) d.selEnd = i; else d.selStart = d.selEnd = i; d.caretOn = true; return true;
  }

  root.HCDIALOG = { answer, ask, draw, buttonAt, key, clickField, indexAt };
})(typeof globalThis !== 'undefined' ? globalThis : this);
