/* hcfile.js — read and write .hc stack text (MAIN-HC-SPEC.md §3), for the browser and Node.
 *
 * parse(text) -> { stack, backgrounds: [], cards: [], resources: { picture: {id: {...}}, icon: {...}, ... } }
 * Every object keeps its properties as written (strings), plus `script`, and for parts `text`.
 * Backgrounds and cards keep `parts` (buttons and fields, back to front). A card keeps `bgtext`
 * ({fieldId: text}) and `bghilite` (a Set of background button ids hilited on this card).
 * Classic script: sets globalThis.HCFILE.
 */
(function (root) {
  'use strict';
  function parse(text) {
    const lines = String(text).split(/\r\n|\r|\n/);
    if (!/^#hc\s+1\b/.test(lines[0] || '')) throw new Error('Not an .hc file (first line must be "#hc 1").');
    const st = { stack: { props: {}, script: '' }, backgrounds: [], cards: [], resources: {} };
    let obj = null, part = null, mode = null, buf = null, target = null;
    const flush = () => {
      if (buf && target) target.fn(buf.join('\n'));
      buf = null; target = null;
    };
    const owner = () => part || obj;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('#') && !line.startsWith('##')) {
        flush();
        const [sec, ...rest] = line.slice(1).trim().split(/\s+/), arg = rest.join(' ');
        const s = sec.toLowerCase();
        if (s === 'end') break;
        if (s === 'stack') { obj = st.stack; part = null; mode = 'props'; }
        else if (s === 'background' || s === 'card') {
          obj = { kind: s, id: +arg, props: {}, script: '', parts: [] };
          if (s === 'card') { obj.bgtext = {}; obj.bghilite = new Set(); st.cards.push(obj); } else st.backgrounds.push(obj);
          part = null; mode = 'props';
        } else if (s === 'button' || s === 'field') {
          part = { kind: s, id: +arg, props: {}, script: '', text: '' }; obj.parts.push(part); mode = 'props';
        } else if (s === 'script') { const o = owner(); buf = []; target = { fn: t => { o.script = t; } }; mode = 'body'; }
        else if (s === 'text') { const o = part; buf = []; target = { fn: t => { o.text = t; } }; mode = 'body'; }
        else if (s === 'bgtext') { const o = obj, id = +arg; part = null; buf = []; target = { fn: t => { o.bgtext[id] = t; } }; mode = 'body'; }
        else if (s === 'bghilite') { const o = obj; part = null; buf = []; target = { fn: t => t.split(/[\s,]+/).filter(Boolean).forEach(x => o.bghilite.add(+x)) }; mode = 'body'; }
        else if (s === 'resource') {
          const [type, id] = rest; const r = { type, id: +id, props: {} };
          (st.resources[type] = st.resources[type] || {})[+id] = r; obj = null; part = { props: r.props, resource: true }; mode = 'props';
        } else { mode = 'skip'; }
        continue;
      }
      if (mode === 'body') { buf.push(line.startsWith('##') ? line.slice(1) : line); continue; }
      if (mode !== 'props' || !line.trim() || line.startsWith('--')) continue;
      const m = /^\s*([A-Za-z]+)\s*:\s?(.*)$/.exec(line);
      if (m) owner().props[m[1].toLowerCase()] = m[2];
    }
    flush();
    return st;
  }
  const bool = (v, d) => (v == null ? d : String(v).trim().toLowerCase() === 'true');
  const rect = v => (v ? v.split(',').map(Number) : [0, 0, 0, 0]);
  root.HCFILE = { parse, bool, rect };
})(typeof window !== 'undefined' ? window : globalThis);
