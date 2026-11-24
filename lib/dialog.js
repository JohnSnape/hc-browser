/* dialog.js — Apple IIGS alerts (rAlertString $8015, AlertWindow) and window templates (rWindParam1 $800E,
 * rWindColor $8010), for the browser and Node. Classic script: sets globalThis.DIALOG. Uses MENU (drawing
 * primitives), CONTROL (buttons, the controls of a window), FONT and SHR (icons).
 *
 * Alert strings (Toolbox Reference vol. 3, ch. 52): size digit ('0' = custom, followed by a 4-word rectangle),
 * icon digit ('1' = custom, followed by a pointer, width and height), a separator character, the message, then
 * button titles split by the separator, then $00. '^' marks the default button; '#0'..'#6' are the standard
 * strings OK, Cancel, Yes, No, Try Again, Quit, Continue; '*0'..'*9' are filled in by the program at run time.
 *
 * Drawing, MEASURED on the IIGS (tests/iigs/menutest/ALRTEST: AlertWindow with nine strings covering sizes 1-9 and
 * icons 0, 2-6, captured by a heartbeat task; check-dialogs.js): see drawAlert.
 */
(function (root) {
  'use strict';
  const STANDARD = ['OK', 'Cancel', 'Yes', 'No', 'Try Again', 'Quit', 'Continue'];
  // 640-mode content sizes (width, height) for size codes 1-9: vol. 3 Table 52-1, confirmed exactly by the captures
  const SIZES = [null, [200, 46], [228, 54], [300, 62], [352, 72], [400, 46], [452, 54], [500, 62], [552, 72], [600, 80]];
  const ICONS = ['none', 'custom', 'stop', 'note', 'caution', 'disk', 'disk swap'];
  const w16 = (s, i) => s.charCodeAt(i) | s.charCodeAt(i + 1) << 8;
  const sub = s => s.replace(/##|\^\^|\*\*|#([0-6])/g, (m, n) => n != null ? STANDARD[+n] : m[0]);

  function parseAlert(bytes) {
    const raw = typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes);
    let i = 0; const a = { raw };
    a.sizeCode = raw.charCodeAt(i++) - 48;
    if (a.sizeCode === 0) { a.rect = [w16(raw, i), w16(raw, i + 2), w16(raw, i + 4), w16(raw, i + 6)].map(v => (v << 16) >> 16); i += 8; }
    a.iconCode = raw.charCodeAt(i++) - 48; a.icon = ICONS[a.iconCode] || 'reserved ' + a.iconCode;
    if (a.iconCode === 1) i += 8; // custom icon: imagePtr (long), width, height: a pointer, unusable from a file
    a.separator = raw[i++];
    const end = raw.indexOf('\0', i), body = raw.slice(i, end < 0 ? raw.length : end).split(a.separator);
    a.message = body.shift() || '';
    a.buttons = body.map(b => { const def = /^\^(?!\^)/.test(b); return { title: sub(def ? b.slice(1) : b), raw: b, isDefault: def }; });
    a.text = sub(a.message).replace(/\^(?!\^)/g, '');
    a.substitutions = [...new Set((raw.match(/\*[0-9]/g) || []))];
    if (a.sizeCode >= 1 && a.sizeCode <= 9) { a.width = SIZES[a.sizeCode][0]; a.height = SIZES[a.sizeCode][1]; }
    else if (a.rect) { a.width = a.rect[3] - a.rect[1]; a.height = a.rect[2] - a.rect[0]; }
    return a;
  }

  // Alert geometry (measured, 640 mode): the frame is the content plus 12 pixels at each side and 5 lines above and
  // below, centred on the 640 x 200 screen. Frame: a 1-line outer edge with 2-pixel sides, 2 lines/pixels apart from
  // an inner border 2 lines tall and 5 pixels wide at the sides. Icon at content + (8, 4); text by LETextBox2
  // from content left + 20 + the icon's width (40-56; 0 without one), first baseline content top + 11, 9 lines apart, wrapped 16 pixels short of the
  // content's right edge (any of 13 to 19 fits all nine captures). Buttons: all max(60, longest title + 20) wide and 13 tall, ending 5 lines
  // above the content's bottom, spaced evenly: gap = (content width - n * width) / (n + 1); the default one ringed.
  const G = { iconX: 8, iconY: 4, textX: 20, textTop: 3, textRight: 16 };
  function alertLayout(a) {
    const W = a.width || 300, H = a.height || 62, OW = W + 24, OH = H + 10;
    const OL = a.rect ? a.rect[1] - 12 : Math.floor((640 - OW) / 2), OT = a.rect ? a.rect[0] - 5 : Math.floor((200 - OH) / 2);
    return { OL, OT, OW, OH, CL: OL + 12, CT: OT + 5, W, H };
  }
  function drawAlert(cv, a, font, icons) {
    const d = root.MENU.draw, L = alertLayout(a), { OL, OT, OW, OH, CL, CT, W, H } = L;
    d.rect(cv, OL, OT, OW, OH, 3);
    d.rect(cv, OL, OT, OW, 1, 0); d.rect(cv, OL, OT + OH - 1, OW, 1, 0); d.rect(cv, OL, OT, 2, OH, 0); d.rect(cv, OL + OW - 2, OT, 2, OH, 0);
    d.rect(cv, OL + 7, OT + 3, OW - 14, 2, 0); d.rect(cv, OL + 7, OT + OH - 5, OW - 14, 2, 0); d.rect(cv, OL + 7, OT + 3, 5, OH - 6, 0); d.rect(cv, OL + OW - 12, OT + 3, 5, OH - 6, 0);
    const icon = icons && icons[a.iconCode];
    let inferred = a.iconCode >= 2 && !icon;
    if (icon && root.SHR) { const p = root.SHR.iconToPixels(icon); for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.mask[y * p.w + x]) d.set(cv, CL + G.iconX + x, CT + G.iconY + y, p.val[y * p.w + x] & 3); }
    const tx = CL + G.textX + (icon && root.SHR ? root.SHR.iconToPixels(icon).w : 0);
    const st = { type: 'static text', rect: [G.textTop, 0, H, CL + W - G.textRight - tx], runs: [{ text: a.text, style: 0, just: 0 }], hilite: 255, flag: 0, moreFlags: 0 };
    root.CONTROL.drawControl(cv, st, font, tx, CT);
    const n = a.buttons.length, tw = s => d.textBits(font, s, 0).adv;
    if (n) {
      const bw = Math.max(60, ...a.buttons.map(b => tw(b.title) + 20)), gap = Math.floor((W - n * bw) / (n + 1)), bt = CT + H - 5 - 13;
      a.buttons.forEach((b, i) => root.CONTROL.drawControl(cv, { type: 'simple button', rect: [0, 0, 13, bw], title: b.title, flag: b.isDefault ? 1 : 0, hilite: 0, moreFlags: 0 }, font, CL + gap + i * (bw + gap), bt));
    }
    return { box: [OT, OL, OT + OH, OL + OW], inferred, layout: L };
  }

  // ---------- windows from rWindParam1 templates ----------
  // MEASURED (CTLTEST captures of Archiver's 12 windows): an fAlert ($2000) frame is the alert frame above (outer
  // edge 12 pixels / 5 lines outside the content); a plain frame is 2-pixel sides just outside the content, a
  // bottom line on the line below it and a top line on the line above; fTitle ($8000) adds a 13-line title bar
  // directly above the content, black with the title in white, centred, baseline 10 lines down (the frontmost,
  // highlighted window; others are not drawn here). INFERRED: close box, zoom box, size box, scroll bars,
  // information bar, and rWindColor colours (the frame is drawn black and white).
  const FRAME = { title: 0x8000, close: 0x4000, alert: 0x2000, rScroll: 0x1000, bScroll: 0x0800, grow: 0x0400, zoom: 0x0100, info: 0x0010, vis: 0x0020 };
  function frameBits(f) { const o = {}; for (const k in FRAME) if (f & FRAME[k]) o[k] = true; return o; }
  function windowLayout(win) {
    const [T, L, B, R] = win.position, f = win.frame;
    if (f & FRAME.alert) return { T, L, B, R, box: [T - 5, L - 12, B + 5, R + 12] };
    return { T, L, B, R, box: [T - (f & FRAME.title ? 13 : 1), L - 2, B + 1, R + 2] };
  }
  function drawWindow(cv, win, list, font, opt) {
    opt = opt || {};
    const d = root.MENU.draw, ly = windowLayout(win), { T, L, B, R } = ly, f = win.frame, tw = s => d.textBits(font, s, 0).adv;
    const inferred = [];
    if (f & FRAME.alert) {
      const OL = L - 12, OT = T - 5, OW = R - L + 24, OH = B - T + 10;
      d.rect(cv, OL, OT, OW, OH, 3);
      d.rect(cv, OL, OT, OW, 1, 0); d.rect(cv, OL, OT + OH - 1, OW, 1, 0); d.rect(cv, OL, OT, 2, OH, 0); d.rect(cv, OL + OW - 2, OT, 2, OH, 0);
      d.rect(cv, OL + 7, OT + 3, OW - 14, 2, 0); d.rect(cv, OL + 7, OT + OH - 5, OW - 14, 2, 0); d.rect(cv, OL + 7, OT + 3, 5, OH - 6, 0); d.rect(cv, OL + OW - 12, OT + 3, 5, OH - 6, 0);
    } else {
      d.rect(cv, L, T, R - L, B - T, 3);
      d.rect(cv, L - 2, T, 2, B - T + 1, 0); d.rect(cv, R, T, 2, B - T + 1, 0); d.rect(cv, L - 2, B, R - L + 4, 1, 0);
      if (f & FRAME.title) {
        d.rect(cv, L - 2, T - 13, R - L + 4, 13, 0);
        const title = (win.title || '').trim() ? win.title : '';
        if (title) d.text(cv, font, title, L - 2 + Math.floor((R - L + 4 - tw(title)) / 2), T - 3, 3);
        if (f & FRAME.close) { inferred.push('close box'); d.rect(cv, L + 6, T - 10, 14, 7, 3); d.rect(cv, L + 7, T - 9, 12, 5, 0); }
        if (f & FRAME.zoom) { inferred.push('zoom box'); d.rect(cv, R - 20, T - 10, 14, 7, 3); d.rect(cv, R - 19, T - 9, 12, 5, 0); }
      } else d.rect(cv, L - 2, T - 1, R - L + 4, 1, 0);
      if (f & (FRAME.rScroll | FRAME.bScroll | FRAME.grow | FRAME.info)) inferred.push('scroll bars / size box / information bar');
      if (f & FRAME.rScroll) { d.rect(cv, R - 26, T, 2, B - T, 0); }
      if (f & FRAME.bScroll) { d.rect(cv, L, B - 10, R - L, 1, 0); }
    }
    let ctl = [];
    if (list) ctl = root.CONTROL.drawList(cv, list, font, L, T);
    return { box: ly.box, layout: ly, inferred, controls: ctl };
  }

  root.DIALOG = { STANDARD, SIZES, ICONS, G, FRAME, parseAlert, alertLayout, drawAlert, frameBits, windowLayout, drawWindow };
})(typeof window !== 'undefined' ? window : globalThis);
