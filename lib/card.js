/* card.js — draw a HyperCard IIGS card the way HyperCard IIGS 1.1 does, into a 640 x 200 Super Hi-Res
 * frame (640 mode: 2-bit pixel values, colors from the stack's color set by pixel phase, lib/shr.js).
 *
 *   const f = CARD.render(stack, cardIndex, res)   // stack from HCFILE.parse
 *   f.val    Uint8Array(640*200), values 0-3      f.pal  16 color words
 *   CARD.toRGBA(f) -> Uint8ClampedArray(640*200*4)
 *
 * res supplies the resources: res.picture(id) -> { shr: Uint8Array(32768), msk: Uint8Array(16000) | null },
 * res.icon(id) -> icon record bytes, res.font(name, size) -> a FONT (lib/font.js) or null.
 * HyperCard units: 1 unit = 2 screen pixels across, 1 down (measured). Drawing rules are measured against
 * HyperCard IIGS in GSport (tests/hcgs-render); the ones not yet confirmed are marked 🔶.
 * Classic script: sets globalThis.CARD.
 */
(function (root) {
  'use strict';
  const W = 640, H = 200, BLACK = 0, WHITE = 3;
  const HCF = root.HCFILE, SHR = root.SHR, FONT = root.FONT;

  function Frame(pal) { this.val = new Uint8Array(W * H).fill(WHITE); this.pal = pal; }
  // v is a pixel value 0-3, or 16 + a 640-mode color nibble (even pixel value << 2 | odd pixel value), the way
  // HyperCard IIGS stores part colors: $F white, 0 black, $E white/yellow, 1 black/blue in the System set.
  const nib = n => 16 + (n & 15);
  const pv = (x, v) => (v < 16 ? v : (x & 1 ? v & 3 : (v >> 2) & 3));
  Frame.prototype.set = function (x, y, v) { if (x >= 0 && y >= 0 && x < W && y < H) this.val[y * W + x] = pv(x, v); };
  Frame.prototype.fill = function (x0, y0, x1, y1, v) { for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) this.val[y * W + x] = pv(x, v); };
  Frame.prototype.invert = function (x0, y0, x1, y1) { for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) this.val[y * W + x] ^= 3; };
  // frame with a pen 2 pixels wide (1 HyperCard unit) and 1 tall 🔶
  Frame.prototype.frame = function (x0, y0, x1, y1, v, pw) {
    pw = pw || 2; this.fill(x0, y0, x1, y0 + 1, v); this.fill(x0, y1 - 1, x1, y1, v); this.fill(x0, y0, x0 + pw, y1, v); this.fill(x1 - pw, y0, x1, y1, v);
  };

  function toRGBA(f) {
    const out = new Uint8ClampedArray(W * H * 4), cols = f.pal.map(SHR.word2rgb);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = cols[SHR.GROUP[x & 3] + f.val[y * W + x]], q = (y * W + x) * 4; out[q] = c[0]; out[q + 1] = c[1]; out[q + 2] = c[2]; out[q + 3] = 255; }
    return out;
  }

  function drawPicture(f, p) {
    if (!p) return;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (p.msk && !((p.msk[y * 80 + (x >> 3)] >> (7 - (x & 7))) & 1)) continue;
      f.val[y * W + x] = (p.shr[y * 160 + (x >> 2)] >> (6 - 2 * (x & 3))) & 3;
    }
  }

  // text helpers
  const enc = s => [...s].map(ch => { const c = ch.charCodeAt(0); return c < 256 ? c : 63; }); // .hc text is Mac OS Roman bytes as latin1
  // A font the machine lacks: QuickDraw II falls back to the system font (Shaston 8) and scales it to the size
  // asked for. ✅ Times 24 with no Times installed drew Shaston 8 three times as wide and tall (Whats.New).
  const scaled = new Map();
  function scaleFont(f, k) {
    if (k === 1) return f;
    const key = f.name + f.size + 'x' + k; if (scaled.has(key)) return scaled.get(key);
    const sg = g => { if (!g) return g; const h = FONT.height(f), w = g.w * k, bits = new Uint8Array(w * h * k);
      for (let y = 0; y < h * k; y++) for (let x = 0; x < w; x++) bits[y * w + x] = g.bits[Math.floor(y / k) * g.w + Math.floor(x / k)];
      return { adv: g.adv * k, left: g.left * k, w, bits }; };
    const out = Object.assign({}, f, { size: f.size * k, ascent: f.ascent * k, descent: f.descent * k, leading: f.leading * k, glyphs: f.glyphs.map(sg), missing: sg(f.missing) });
    scaled.set(key, out); return out;
  }
  function getFont(res, props) {
    const name = props.textfont || 'Shaston', size = +(props.textsize || 8);
    if (!res.font) return null;
    const exact = res.font(name, size); if (exact) return exact;
    const sys = res.font('Shaston', 8); if (!sys) return null;
    return scaleFont(sys, Math.max(1, Math.round(size / 8))); // 🔶 non-multiples of 8 rounded
  }
  function textStyle(props) { return String(props.textstyle || 'plain').toLowerCase(); }
  // bold (measured): each glyph's ink is smeared 1 pixel right and every character advances 1 pixel more ✅
  function drawString(f, font, codes, x, base, v, style, clip) {
    if (!font) return 0;
    const bold = style.includes('bold'); let pen = x;
    for (const c of codes) {
      const w = FONT.draw(font, [c], pen, (px, py) => {
        const Y = base + py;
        for (const X of bold ? [px, px + 1] : [px]) if (!clip || (X >= clip[0] && X < clip[2] && Y >= clip[1] && Y < clip[3])) f.set(X, Y, v);
      });
      pen += w + (bold ? 1 : 0);
    }
    return pen - x;
  }
  const advance = (font, codes, style) => FONT.measure(font, codes) + (style.includes('bold') ? codes.length : 0);

  // word-wrap one paragraph to width (pixels), the way TextEdit-style fields break lines 🔶
  function wrap(font, codes, width, style) {
    const lines = []; let start = 0;
    while (start <= codes.length) {
      let w = 0, i = start, lastBreak = -1;
      while (i < codes.length) {
        const cw = advance(font, [codes[i]], style);
        if (w + cw > width && i > start) break;
        w += cw; if (codes[i] === 32) lastBreak = i; i++;
      }
      if (i >= codes.length) { lines.push(codes.slice(start)); break; }
      const end = lastBreak >= start ? lastBreak + 1 : i;
      lines.push(codes.slice(start, end)); start = end;
    }
    return lines;
  }

  // Check boxes and radio buttons, measured in HyperCard IIGS 1.1 (probe.hts): the box is 24 x 9 pixels at the
  // button's left + 2, centered down the button; the name starts 3 pixels after it. '#' = black, '.' = white.
  const CHECKBOX = ['########################', '##....................##'], CHECKX = [
    '########################', '####................####', '##..###..........###..##', '##.....###....###.....##', '##........####........##',
    '##......###..###......##', '##...###........###...##', '#####..............#####', '########################'];
  const RADIO = ['.....##########.....', '..####........####..', '.##..............##.', '##................##', '##................##',
    '##................##', '.##..............##.', '..####........####..', '.....##########.....'];
  function bitmap(f, rows, x, y) { rows.forEach((r, k) => { for (let i = 0; i < r.length; i++) f.set(x + i, y + k, r[i] === '#' ? BLACK : WHITE); }); }

  function drawButton(f, p, res, hilite) {
    const P = p.props, [l, t, r, b] = HCF.rect(P.rect), X0 = 2 * l, X1 = 2 * r, style = (P.style || 'transparent').toLowerCase();
    if (HCF.bool(P.visible, true) === false) return;
    const clip = [X0, t, X1, b];
    const BLACK = P.framecolor ? nib(+P.framecolor) : 0, TEXT = P.textcolor ? nib(+P.textcolor) : 0; // part colors (frame, name)
    if (style === 'opaque') f.fill(X0, t, X1, b, WHITE);
    else if (style === 'rectangle') { f.fill(X0, t, X1, b, WHITE); f.frame(X0, t, X1, b, BLACK); }
    else if (style === 'shadow') { f.fill(X0, t, X1 - 2, b - 1, WHITE); f.frame(X0, t, X1 - 2, b - 1, BLACK); f.fill(X1 - 2, t + 2, X1, b, BLACK); f.fill(X0 + 4, b - 1, X1, b, BLACK); }
    else if (style === 'roundrect') roundRect(f, X0, t, X1, b, BLACK);
    const font = getFont(res, P), ts = textStyle(P), name = P.name || '', showName = HCF.bool(P.showname, false);
    const icon = +(P.icon || 0), ico = icon && res.icon ? res.icon(icon) : null;
    let textBase;
    if (style === 'checkbox' || style === 'radiobutton') {
      const by = t + Math.floor((b - t - 9) / 2), radio = style === 'radiobutton';
      if (radio) bitmap(f, RADIO, X0 + 2, by); // 🔶 the hilited radio dot is not measured yet
      else bitmap(f, hilite ? CHECKX : [CHECKBOX[0], ...Array(7).fill(CHECKBOX[1]), CHECKBOX[0]], X0 + 2, by);
      if (radio && hilite) f.fill(X0 + 8, by + 3, X0 + 16, by + 6, BLACK);
      if (showName && font) drawString(f, font, enc(name), X0 + 30, t + Math.ceil((b - t - FONT.height(font)) / 2) + font.ascent, TEXT, ts, clip);
      return;
    }
    if (ico) {
      const dv = new DataView(ico.buffer, ico.byteOffset), ih = dv.getUint16(4, true), iw = dv.getUint16(6, true) * 2;
      const nameH = showName && font ? FONT.height(font) + 4 : 0; // ✅ one sample: StoryBook's Home (17-row icon, 27-row button)
      const ix = X0 + 2 * Math.floor(((X1 - X0) / 2 - iw / 2) / 2), iy = t + Math.floor((b - t - ih - nameH) / 2);
      drawIconClipped(f, ico, ix, iy, clip, nib(+(P.forecolor || 0)), nib(P.backcolor == null ? 15 : +P.backcolor));
      textBase = iy + ih + (font ? font.ascent : 0) + 1;
    }
    if (showName && name && font) {
      const codes = enc(name), w = advance(font, codes, ts);
      const align = (P.textalign || 'center').toLowerCase();
      const x = align === 'left' ? X0 + 6 : align === 'right' ? X1 - 6 - w : X0 + Math.floor((X1 - X0 - w) / 2);
      if (textBase == null) textBase = t + Math.ceil((b - t - FONT.height(font)) / 2) + font.ascent;
      drawString(f, font, codes, x, textBase, TEXT, ts, clip);
    }
    // hilite inverts what is inside the frame; the frame itself stays black ✅ (rectangle, roundRect)
    if (hilite) {
      if (style === 'rectangle') f.invert(X0 + 2, t + 1, X1 - 2, b - 1);
      else if (style === 'shadow') f.invert(X0 + 2, t + 1, X1 - 4, b - 2);
      else if (style === 'roundrect') {
        for (let k = 1; k < b - t - 1; k++) { const row = Math.min(k, b - t - 1 - k), run = RRECT[row] || [0, 2]; if (run[1] !== null) f.invert(X0 + run[1], t + k, X1 - run[1], t + k + 1); }
      } else f.invert(X0, t, X1, b);
    }
  }

  // roundRect buttons: the frame's black runs per row from the top (and mirrored at the bottom and right),
  // as [from, to) pixel offsets from the left edge; rows below the table are [0, 2). ✅ measured, 14-row buttons
  const RRECT = [[9, null], [6, 10], [3, 6], [2, 4], [1, 3]];
  function roundRect(f, x0, y0, x1, y1, BLACK) {
    const h = y1 - y0, w = x1 - x0;
    for (let k = 0; k < h; k++) {
      const row = Math.min(k, h - 1 - k), run = RRECT[row] || [0, 2], y = y0 + k;
      if (run[1] === null) { f.fill(x0 + run[0], y, x1 - run[0], y + 1, BLACK); continue; }
      f.fill(x0 + run[1], y, x1 - run[1], y + 1, WHITE);
      f.fill(x0 + run[0], y, x0 + run[1], y + 1, BLACK); f.fill(x1 - run[1], y, x1 - run[0], y + 1, BLACK);
    }
  }

  // A black-and-white icon record (type bit 15 clear, Apple's own icons) is drawn with the button's colors:
  // each black screen pixel takes foreColor, each white one backColor. ✅ Addresses' arrows, backColor $E
  function drawIconClipped(f, ico, x, y, clip, fore, back) {
    const p = SHR.iconToPixels(ico), bw = !(p.type & 0x8000);
    for (let r = 0; r < p.h; r++) for (let c = 0; c < p.w; c++) {
      const X = x + c, Y = y + r; if (!p.mask[r * p.w + c] || X < clip[0] || X >= clip[2] || Y < clip[1] || Y >= clip[3]) continue;
      let v = p.val[r * p.w + c];
      if (bw) v = v === 0 ? fore : v === 3 ? back : v; // per screen pixel: black -> foreColor, white -> backColor
      f.set(X, Y, v);
    }
  }

  // Scroll bar arrows (inactive scroll bar, measured on Phone.Book and ToDo): 2-pixel strokes, offsets from
  // the bar's left edge, rows from the top of the arrow box.
  const UP_ARROW = [[1, [[12, 14]]], [2, [[10, 12], [14, 16]]], [3, [[8, 10], [16, 18]]], [4, [[6, 8], [18, 20]]],
    [5, [[4, 10], [16, 22]]], [6, [[8, 10], [16, 18]]], [7, [[8, 10], [16, 18]]], [8, [[8, 10], [16, 18]]], [9, [[8, 18]]]];
  const SB = 26; // scroll bar width in pixels (13 units) ✅

  // thumb: null = nothing to scroll (white track); else { size } in rows, at the top (scroll 0). When the text is
  // longer than the field, the track between the thumb and the arrows is a 2 x 1 checkerboard, and the thumb is
  // ceil(track * fieldHeight / textHeight) rows: 57 of 130 for Notes' 40 lines of 9 in 156 rows (🔶 one sample).
  function drawScrollBar(f, x0, y0, x1, y1, c, thumb) {
    const BLACK = c == null ? 0 : c;
    f.frame(x0, y0, x1, y1, BLACK);
    const top = y0 + 12, bot = y1 - 13; // separator rows under the up box and over the down box
    f.fill(x0, top, x1, top + 1, BLACK); f.fill(x0, bot, x1, bot + 1, BLACK);
    if (thumb) {
      const t0 = top + 1, t1 = Math.min(bot, t0 + thumb.size); // thumb rows [t0, t1)
      f.fill(x0, t0, x1, t0 + 1, BLACK); f.fill(x0, t1 - 1, x1, t1, BLACK); f.fill(x0, t0, x0 + 4, t1, BLACK); f.fill(x1 - 4, t0, x1, t1, BLACK);
      for (let y = t1; y < bot; y++) for (let x = x0 + 2; x < x1 - 2; x++) if (((x >> 1) + y) & 1) f.set(x, y, BLACK);
    }
    for (const [r, runs] of UP_ARROW) for (const [a, b] of runs) {
      f.fill(x0 + a, y0 + r + 1, x0 + b, y0 + r + 2, BLACK);   // up arrow (box rows y0+1 ..)
      f.fill(x0 + a, y1 - r - 2, x0 + b, y1 - r - 1, BLACK);   // down arrow, mirrored
    }
  }

  // Field text: lines wrap inside [left + 6, right - 6) pixels; line n's baseline is top + n * textHeight
  // (n from 1), whatever the style. wideMargins: 6 more pixels each side and 3 rows lower. showLines draws a dotted line one row under
  // each baseline across the text area, dots where x mod 4 is 2 or 3. ✅ measured on Addresses, Phone.Book, Notes
  function drawField(f, p, text, res) {
    const P = p.props, [l, t, r, b] = HCF.rect(P.rect), X0 = 2 * l, X1 = 2 * r, style = (P.style || 'transparent').toLowerCase();
    if (HCF.bool(P.visible, true) === false) return;
    let right = X1, clip = [X0, t, X1, b];
    const BLACK = P.framecolor ? nib(+P.framecolor) : 0; // the frame and scroll bar color (text stays black)
    if (style === 'opaque') f.fill(X0, t, X1, b, WHITE);
    else if (style === 'rectangle') { f.fill(X0, t, X1, b, WHITE); f.frame(X0, t, X1, b, BLACK); clip = [X0 + 2, t + 1, X1 - 2, b - 1]; }
    else if (style === 'shadow') { f.fill(X0, t, X1 - 2, b - 1, WHITE); f.frame(X0, t, X1 - 2, b - 1, BLACK); f.fill(X1 - 2, t + 2, X1, b, BLACK); f.fill(X0 + 4, b - 1, X1, b, BLACK); right = X1 - 2; clip = [X0 + 2, t + 1, X1 - 4, b - 2]; }
    else if (style === 'scrolling') {
      f.fill(X0, t, X1, b, WHITE); f.frame(X0, t, X1, b, BLACK);
      right = X1 - SB + 2; clip = [X0 + 2, t + 1, X1 - SB, b - 1];
    }
    const font = getFont(res, P);
    if (style === 'scrolling') {
      let thumb = null;
      if (font && text) {
        const lh0 = +(P.textheight || FONT.height(font) + 1), wide0 = HCF.bool(P.widemargins, false), m0 = wide0 ? 12 : 6, w0 = right - m0 - (X0 + m0);
        const n = text.split('\n').reduce((k, para) => k + (HCF.bool(P.dontwrap, false) ? 1 : wrap(font, enc(para), w0, textStyle(P)).length), 0);
        const track = b - t - 26; if (n * lh0 > b - t) thumb = { size: Math.ceil(track * (b - t) / (n * lh0)) };
      }
      drawScrollBar(f, X1 - SB, t, X1, b, BLACK, thumb);
    }
    if (!font) return;
    const ts = textStyle(P), lh = +(P.textheight || FONT.height(font) + 1);
    const wide = HCF.bool(P.widemargins, false), m = wide ? 12 : 6, top = t + (wide ? 3 : 0);
    const L = X0 + m, R = right - m, width = R - L, align = (P.textalign || 'left').toLowerCase(), dontWrap = HCF.bool(P.dontwrap, false);
    if (HCF.bool(P.showlines, false) && style !== 'scrolling') { // 🔶 an empty scrolling field with showLines drew no lines (Phone.Book)
      for (let y = top + lh + 1; y < clip[3]; y += lh) for (let x = L; x < R - (wide ? 0 : 2); x++) if ((x & 3) >= 2) f.set(x, y, 0);
    }
    if (!text) return;
    let y = top + lh;
    for (const para of text.split('\n')) {
      const lines = dontWrap ? [enc(para)] : wrap(font, enc(para), width, ts);
      for (const ln of lines) {
        if (y - font.ascent >= clip[3]) return;
        const w = advance(font, ln, ts), x = align === 'center' ? L + Math.floor((width - 2 - w) / 2) : align === 'right' ? R - 2 - w : L; // centered in [L, R - 2), like showLines ✅ 3 fields
        drawString(f, font, ln, x, y, P.textcolor ? nib(+P.textcolor) : 0, ts, clip);
        y += lh;
      }
    }
  }

  function render(stack, index, res) {
    const card = stack.cards[index]; if (!card) throw new Error('No card ' + (index + 1));
    const bg = stack.backgrounds.find(x => x.id === +card.props.background);
    const set = card.props.colors || (bg && bg.props.colors) || stack.stack.props.colors || 'system';
    const f = new Frame(SHR.parseSet(set));
    const pic = o => { const id = +(o.props.picture || 0); return id && HCF.bool(o.props.showpict, true) && res.picture ? res.picture(id) : null; };
    if (bg) {
      drawPicture(f, pic(bg));
      for (const p of bg.parts) {
        if (p.kind === 'button') drawButton(f, p, res, HCF.bool(p.props.sharedhilite, true) ? HCF.bool(p.props.hilite, false) : card.bghilite.has(p.id));
        else drawField(f, p, HCF.bool(p.props.sharedtext, false) ? p.text : (card.bgtext[p.id] != null ? card.bgtext[p.id] : ''), res);
      }
    }
    drawPicture(f, pic(card));
    for (const p of card.parts) {
      if (p.kind === 'button') drawButton(f, p, res, HCF.bool(p.props.hilite, false));
      else drawField(f, p, p.text, res);
    }
    return f;
  }

  root.CARD = { render, toRGBA, Frame, W, H };
})(typeof window !== 'undefined' ? window : globalThis);
