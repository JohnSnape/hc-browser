// Smoke test: open a stack, then click every visible, enabled button on every card (each in a fresh copy of
// the stack) and list the script errors. Dialogs answer with their first button; ask returns empty.
//   node tests/hypertalk/click-all.js path/to/site/main.hc [...]
'use strict';
const fs = require('fs'), path = require('path');
require('../../lib/hcfile.js'); require('../../lib/hypertalk.js');

(async () => {
  for (const f of process.argv.slice(2)) {
    const text = fs.readFileSync(f, 'latin1'), site = path.basename(path.dirname(f));
    const errors = new Map();
    const fresh = () => {
      const st = HCFILE.parse(text), seen = [];
      const host = { error: t => seen.push(t), answer: (t, b) => b[0], ask: () => '', answerFile: () => '', askFile: () => '', readFile: () => null };
      return { st, seen, it: new HYPERTALK.Interp(st, host) };
    };
    const note = (where, seen) => { for (const e of seen) { const k = e.split('\n')[0]; if (!errors.has(k)) errors.set(k, where + ': ' + e.replace(/\n/g, ' ')); } };
    { const { it, seen } = fresh(); const timer = setTimeout(() => { it.abort = true; seen.push('(stopped after 3 s: a loop that does not end)'); }, 3000); await it.start(); clearTimeout(timer); note('open', seen); }
    const st0 = HCFILE.parse(text); let clicks = 0;
    for (let ci = 0; ci < st0.cards.length; ci++) {
      const card = st0.cards[ci], bg = st0.backgrounds.find(b => b.id === +card.props.background);
      const btns = [...(bg ? bg.parts : []), ...card.parts].filter(p => p.kind === 'button' && HCFILE.bool(p.props.visible, true) && HCFILE.bool(p.props.enabled, true));
      for (const b of btns) {
        const { it, seen } = fresh(); it.cur = ci; // no openStack: each click starts from a quiet card
        const [l, t, r, bt] = HCFILE.rect(b.props.rect), h = (l + r) >> 1, v = (t + bt) >> 1;
        const timer = setTimeout(() => { it.abort = true; seen.push('(stopped after 3 s: a loop that does not end)'); }, 3000);
        await it.mouseDown(h, v); await it.mouseUp(h, v); clearTimeout(timer);
        clicks++; note(`card ${ci + 1} button "${b.props.name || b.id}"`, seen);
      }
    }
    console.log(`${site}: ${clicks} clicks, ${errors.size} distinct errors`);
    for (const e of errors.values()) console.log('   ' + e);
  }
})();
