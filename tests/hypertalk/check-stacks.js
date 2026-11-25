// Compile every script in one or more main.hc files and list the handlers HyperTalk can't parse.
//   node tests/hypertalk/check-stacks.js path/to/site1/main.hc [...]
'use strict';
const fs = require('fs'), path = require('path');
require('../../lib/hcfile.js'); require('../../lib/hypertalk.js');
let handlers = 0, bad = 0;
for (const f of process.argv.slice(2)) {
  const st = HCFILE.parse(fs.readFileSync(f, 'latin1')), site = path.basename(path.dirname(f));
  const objs = [['stack', st.stack], ...st.backgrounds.map(b => ['bkgnd ' + b.id, b]), ...st.cards.map(c => ['card ' + c.id, c])];
  for (const [label, o] of objs) for (const [l2, h] of [[label, o], ...(o.parts || []).map(p => [`${label} ${p.kind} ${p.id}`, p])]) {
    if (!h.script) continue;
    let H; try { H = HYPERTALK.compile(h.script); } catch (e) { console.log(`${site}: ${l2}: ${e.message}`); bad++; continue; }
    for (const x of Object.values(H)) { handlers++; if (x.err) { bad++; console.log(`${site}: ${l2} ${x.name} line ${x.err.line}: ${x.err.message}\n    ${h.script.split(/\n/)[x.err.line - 1]}`); } }
  }
}
console.log(`${handlers} handlers, ${bad} failed to compile`);
