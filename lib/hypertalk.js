/* hypertalk.js — a HyperTalk interpreter for HC Browser: HyperCard IIGS 1.1's language, run over a stack
 * from HCFILE.parse (MAIN-HC-SPEC.md §6.2). Works in the browser and in Node.
 *
 *   const it = new HYPERTALK.Interp(stack, host)
 *   await it.start()                 // openStack, openBackground, openCard
 *   it.mouseDown(h, v) / it.mouseMove(h, v) / it.mouseUp(h, v)   // card coordinates (1 unit = 2 screen pixels across)
 *   it.key(name)                     // 'left', 'right', 'up', 'down'
 *   it.idle()                        // call every few ticks
 *   it.cur                           // index of the current card
 *
 * Every host method is optional (and may return a Promise):
 *   redraw()                          the card changed; draw it (coalesce)
 *   show(effects)                     a go finished: draw the new card, with the visual effects queued (strings)
 *   answer(text, buttons) -> label    ask(prompt, default, password) -> text | null (Cancel)
 *   answerFile(prompt) -> name | ''   askFile(prompt, default) -> name | ''
 *   readFile(name) -> text | null     writeFile(name, text)          (the per-site folder, spec §9.1)
 *   message(text)  showMessage(bool)  beep(n)  play(name, tempo, notes)  playStop()  cursor(c)
 *   loadStack(name, home) -> a parsed stack, or null    ("go to stack", "go home"; the interpreter swaps stacks itself,
 *                                                         so the script goes on in the new stack and globals stay)
 *   error(text)
 * Text is Mac OS Roman kept one byte per char (as in .hc files); `return` is "\n".
 * The grammar follows the Mac HyperCard 1.2.5 language with the IIGS 1.1 additions from the
 * HyperCard IIGS 1.1 ERS (itemDelimiter, comma/colon, ask's "Cancel" result, backColor, clickLine/clickChunk).
 * Classic script: sets globalThis.HYPERTALK.
 */
(function (root) {
  'use strict';
  const CR = '\n';

  class HTError extends Error { constructor(msg, line) { super(msg); this.line = line; } }
  class Abort { }

  // ------------------------------------------------------------------ words
  const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, last: 'last', middle: 'middle', mid: 'middle', any: 'any' };
  const CHUNK = { char: 'char', chars: 'char', character: 'char', characters: 'char', word: 'word', words: 'word', item: 'item', items: 'item', line: 'line', lines: 'line' };
  const PARTW = { button: 'button', btn: 'button', buttons: 'button', btns: 'button', field: 'field', fld: 'field', fields: 'field', flds: 'field' };
  const PLURALPART = new Set(['buttons', 'btns', 'fields', 'flds']);
  const LAYERW = { card: 'card', cd: 'card', background: 'bg', bkgnd: 'bg', bg: 'bg' };
  const CARDW = new Set(['card', 'cd']);
  const BGW = new Set(['background', 'bkgnd', 'bg']);
  const REL = { next: 'next', prev: 'prev', previous: 'prev', this: 'this', recent: 'recent' };
  const CONST = { empty: '', return: CR, tab: '\t', space: ' ', quote: '"', comma: ',', colon: ':', formfeed: '\f', linefeed: '\n', true: 'true', false: 'false',
    zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', pi: '3.14159265358979323846', up: 'up', down: 'down' };
  // words that end an expression rather than start one
  const STOPW = new Set(['then', 'else', 'into', 'after', 'before', 'to', 'of', 'in', 'from', 'by', 'with', 'at', 'end', 'for', 'times', 'until', 'while', 'and', 'or', 'is', 'contains', 'div', 'mod', 'tempo', 'without']);
  const FN1 = new Set(['abs', 'atan', 'chartonum', 'cos', 'exp', 'exp1', 'exp2', 'length', 'ln', 'ln1', 'log2', 'numtochar', 'random', 'round', 'sin', 'sqrt', 'tan', 'trunc', 'value', 'param']);

  // ------------------------------------------------------------------ lexer
  // Mac OS Roman: ≠ $AD, ≤ $B2, ≥ $B3, ¬ $C2 (continues the line), “ ” $D2 $D3, non-breaking space $CA
  const OPCH = { '\xAD': '<>', '\xB2': '<=', '\xB3': '>=' };
  const idStart = c => /[A-Za-z_]/.test(c) || (c >= '\x80' && !'\xAD\xB2\xB3\xC2\xCA\xD2\xD3'.includes(c));
  const idChar = c => idStart(c) || /[0-9]/.test(c);
  function lexLine(s) {
    const t = []; let i = 0, cont = false;
    while (i < s.length) {
      const c = s[i];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\xCA') { i++; continue; }
      if (c === '-' && s[i + 1] === '-') break;
      if (c === '\xC2') { cont = true; i++; continue; }
      cont = false;
      if (c === '"' || c === '\xD2') {
        let j = s.indexOf(c === '"' ? '"' : '\xD3', i + 1); if (j < 0) j = s.length;
        t.push({ t: 's', v: s.slice(i + 1, j) }); i = j + 1; continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
        const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i)); t.push({ t: 'n', v: m[0] }); i += m[0].length; continue;
      }
      if (idStart(c)) { let j = i + 1; while (j < s.length && idChar(s[j])) j++; const raw = s.slice(i, j); t.push({ t: 'w', v: raw.toLowerCase(), raw }); i = j; continue; }
      const two = s.substr(i, 2);
      if (two === '&&' || two === '<=' || two === '>=' || two === '<>') { t.push({ t: 'o', v: two }); i += 2; continue; }
      t.push({ t: 'o', v: OPCH[c] || c }); i++;
    }
    return { toks: t, cont };
  }
  function lexScript(src) {
    const out = [], raw = String(src || '').split(/\r\n|\r|\n/);
    for (let i = 0; i < raw.length; i++) {
      const n = i + 1; let { toks, cont } = lexLine(raw[i]);
      while (cont && i + 1 < raw.length) { const r = lexLine(raw[++i]); toks = toks.concat(r.toks); cont = r.cont; }
      if (toks.length) out.push({ n, toks });
    }
    return out;
  }

  // ------------------------------------------------------------------ parser
  class Parser {
    constructor(lines) { this.L = lines; this.li = 0; this.load(); }
    load() { const l = this.L[this.li]; this.toks = l ? l.toks : []; this.ti = 0; this.n = l ? l.n : 0; }
    nextLine() { this.li++; this.load(); }
    peek(k = 0) { return this.toks[this.ti + k]; }
    w(k = 0) { const t = this.peek(k); return t && t.t === 'w' ? t.v : null; }
    isW(...ws) { const v = this.w(); return v != null && ws.includes(v); }
    eat(...ws) { if (this.isW(...ws)) { this.ti++; return true; } return false; }
    op(v, k = 0) { const t = this.peek(k); return !!t && t.t === 'o' && t.v === v; }
    eatOp(v) { if (this.op(v)) { this.ti++; return true; } return false; }
    end() { return this.ti >= this.toks.length; }
    endish() { return this.end() || this.isW('else'); }
    txt() { const t = this.peek(); return t ? (t.t === 'w' ? t.raw : t.t === 's' ? '"' + t.v + '"' : t.v) : ''; }
    err(m) { throw new HTError(m, this.n); }
    need(w) { if (!this.eat(w)) this.err(`Expected "${w}"` + (this.end() ? ' at the end of the line.' : ` but found "${this.txt()}".`)); }
    skipRest() { while (!this.endish()) this.ti++; }
    firstIs(toks, a, b) { const t0 = toks[0], t1 = toks[1]; return !!t0 && t0.t === 'w' && t0.v === a && (b == null || (!!t1 && t1.t === 'w' && t1.v === b)); }

    // handlers: { 'm:mouseup': {...}, 'f:myfunc': {...} }; text outside handlers is ignored, as in HyperCard
    script() {
      const H = {};
      for (; this.li < this.L.length; this.nextLine()) {
        if (!this.isW('on', 'function')) continue;
        const kind = this.w() === 'on' ? 'm' : 'f'; this.ti++;
        const t = this.peek(); if (!t || t.t !== 'w') continue;
        const name = t.v; this.ti++;
        const params = []; while (!this.end()) { const p = this.peek(); if (p.t === 'w') params.push(p.v); this.ti++; }
        const h = { kind, name, raw: t.raw, params, line: this.n, body: [] };
        this.nextLine();
        try { h.body = this.block(toks => this.firstIs(toks, 'end', name), `end ${name}`); }
        catch (e) {
          if (!(e instanceof HTError)) throw e;
          h.err = e; // a handler that fails to compile reports its error when it is called
          while (this.li < this.L.length && !this.firstIs(this.toks, 'end', name)) this.nextLine();
        }
        if (!H[kind + ':' + name]) H[kind + ':' + name] = h;
      }
      return H;
    }
    // statements up to a line that `stop` accepts; leaves the parser on that line
    block(stop, what) {
      const body = [];
      for (;;) {
        if (this.li >= this.L.length) { if (what) this.err(`Expected "${what}".`); return body; }
        if (stop(this.toks)) return body;
        body.push(this.stmt());
        if (!this.end()) this.err(`Didn't understand "${this.txt()}".`);
        this.nextLine();
      }
    }
    stmt() {
      const t = this.peek(), n = this.n;
      if (t.t !== 'w') this.err(`Didn't understand "${this.txt()}".`);
      this.ti++;
      const s = this.cmd(t.v, t.raw); s.line = n; return s;
    }

    cmd(w, raw) {
      switch (w) {
        case 'if': return this.ifStmt();
        case 'repeat': return this.repeatStmt();
        case 'exit':
          if (this.eat('repeat')) return { k: 'exitrep' };
          if (this.eat('to')) { this.skipRest(); return { k: 'exitall' }; }
          this.skipRest(); return { k: 'exit' };
        case 'pass': this.skipRest(); return { k: 'pass' };
        case 'return': return { k: 'return', e: this.endish() ? null : this.expr() };
        case 'next': this.need('repeat'); return { k: 'nextrep' };
        case 'global': { const names = []; while (!this.endish()) { const p = this.peek(); if (p.t === 'w') names.push(p.v); this.ti++; } return { k: 'global', names }; }
        case 'put': {
          const e = this.expr(); let prep = null, c = null;
          if (this.isW('into', 'after', 'before')) { prep = this.w(); this.ti++; c = this.container(); }
          return { k: 'put', e, prep, c };
        }
        case 'get': return { k: 'get', e: this.expr() };
        case 'set': {
          this.eat('the'); const p = this.peek(); if (!p || p.t !== 'w') this.err('Expected a property name after "set".');
          this.ti++; let o = null; if (this.eat('of')) o = this.factor();
          this.need('to'); return { k: 'set', p: p.v, o, vals: this.list() };
        }
        case 'go': { this.eat('to'); const d = this.dest(); this.skipRest(); return { k: 'go', d }; }
        case 'answer': {
          if (this.eat('file')) { const e = this.endish() ? null : this.expr(); this.skipRest(); return { k: 'answerfile', e }; }
          const e = this.expr(), b = [];
          if (this.eat('with')) { do b.push(this.andE()); while (this.eat('or')); }
          return { k: 'answer', e, b };
        }
        case 'ask': {
          const file = this.eat('file'), pw = !file && this.eat('password');
          const e = this.expr(); let d = null; if (this.eat('with')) d = this.expr();
          return { k: 'ask', e, d, pw, file };
        }
        case 'add': { const e = this.expr(); this.need('to'); return { k: 'arith', op: '+', e, c: this.container() }; }
        case 'subtract': { const e = this.expr(); this.need('from'); return { k: 'arith', op: '-', e, c: this.container() }; }
        case 'multiply': { const c = this.container(); this.need('by'); return { k: 'arith', op: '*', e: this.expr(), c }; }
        case 'divide': { const c = this.container(); this.need('by'); return { k: 'arith', op: '/', e: this.expr(), c }; }
        case 'hide': case 'show': return this.showStmt(w === 'show');
        case 'visual': { this.eat('effect'); const words = []; while (!this.endish()) { const t = this.peek(); words.push(t.t === 'w' ? t.v : t.v); this.ti++; } return { k: 'visual', words }; }
        case 'lock': case 'unlock': {
          const what = this.w(); this.ti++; const words = [];
          if (this.eat('with')) { this.eat('visual'); this.eat('effect'); while (!this.endish()) { words.push(this.peek().v); this.ti++; } }
          return { k: 'lock', on: w === 'lock', what, words };
        }
        case 'beep': return { k: 'beep', e: this.endish() ? null : this.expr() };
        case 'wait': {
          if (this.eat('until')) return { k: 'waitc', until: true, e: this.expr() };
          if (this.eat('while')) return { k: 'waitc', until: false, e: this.expr() };
          this.eat('for'); const e = this.expr(); let u = 'ticks';
          if (this.eat('seconds', 'second', 'secs', 'sec')) u = 'seconds'; else this.eat('ticks', 'tick');
          return { k: 'wait', e, u };
        }
        case 'play': {
          if (this.eat('stop')) return { k: 'playstop' };
          const e = this.factor(); let tempo = null, notes = null;
          if (this.eat('tempo')) tempo = this.factor();
          if (!this.endish()) notes = this.expr();
          return { k: 'play', e, tempo, notes };
        }
        case 'choose': this.skipRest(); return { k: 'nop' };
        case 'domenu': { const e = this.expr(); this.skipRest(); return { k: 'domenu', e }; }
        case 'push': return { k: 'push', o: this.endish() ? null : this.factor() };
        case 'pop': {
          this.eat('card', 'cd'); let prep = null, c = null;
          if (this.isW('into', 'after', 'before')) { prep = this.w(); this.ti++; c = this.container(); }
          return { k: 'pop', prep, c };
        }
        case 'find': {
          let mode = 'normal'; if (this.isW('whole', 'string', 'chars', 'word', 'words', 'normal')) { mode = this.w(); this.ti++; }
          const e = this.expr(); let f = null; if (this.eat('in')) f = this.factor(); this.skipRest();
          return { k: 'find', mode, e, f };
        }
        case 'send': { const e = this.expr(); let o = null; if (this.eat('to')) o = this.factor(); return { k: 'send', e, o }; }
        case 'do': return { k: 'do', e: this.expr() };
        case 'delete': return { k: 'delete', c: this.container() };
        case 'select': {
          if (this.eat('empty')) return { k: 'select', c: null };
          const where = this.eat('before') ? 'before' : this.eat('after') ? 'after' : 'all';
          this.eat('text'); this.eat('of'); return { k: 'select', c: this.factor(), where };
        }
        case 'click': { this.need('at'); const pt = this.list(); this.skipRest(); return { k: 'click', pt }; }
        case 'type': { const e = this.expr(); this.skipRest(); return { k: 'type', e }; }
        case 'sort': {
          let dir = 'ascending', typ = 'text';
          for (;;) { if (this.isW('ascending', 'descending')) { dir = this.w(); this.ti++; } else if (this.isW('text', 'numeric', 'international', 'datetime')) { typ = this.w(); this.ti++; } else break; }
          if (this.eat('cards', 'cds')) { if (this.eat('of', 'in')) this.factor(); }
          this.need('by'); return { k: 'sort', dir, typ, e: this.expr() };
        }
        case 'convert': {
          const c = this.container(); if (this.eat('from')) { while (!this.isW('to') && !this.endish()) this.ti++; }
          this.need('to'); const words = []; while (!this.endish()) { words.push(this.w() || this.peek().v); this.ti++; }
          return { k: 'convert', c, fmt: words.join(' ') };
        }
        case 'open': if (this.eat('file')) return { k: 'openfile', e: this.expr() }; this.skipRest(); return { k: 'nop' };
        case 'close': if (this.eat('file')) return { k: 'closefile', e: this.expr() }; this.skipRest(); return { k: 'nop' };
        case 'read': {
          this.need('from'); this.need('file'); const f = this.factor(); let until = null, count = null;
          if (this.eat('until')) until = this.expr(); else if (this.eat('for')) count = this.expr();
          return { k: 'read', f, until, count };
        }
        case 'write': { const e = this.expr(); this.need('to'); this.need('file'); return { k: 'write', e, f: this.factor() }; }
        case 'mark': case 'unmark': { const o = this.endish() ? null : this.factor(); return { k: 'mark', on: w === 'mark', o }; }
        case 'end': case 'else': case 'then': case 'on': case 'function': this.err(`Didn't expect "${raw}" here.`);
      }
      // anything else is a message: its parameters are expressions separated by commas
      let args = [];
      const save = this.ti;
      try { args = this.list(); if (!this.endish()) throw new HTError('', this.n); }
      catch (e) { if (!(e instanceof HTError)) throw e; this.ti = save; args = []; this.skipRest(); }
      return { k: 'msg', name: w, raw, args };
    }

    ifStmt() {
      const cond = this.expr();
      if (this.end()) { this.nextLine(); if (!this.isW('then')) this.err('Expected "then".'); }
      this.need('then');
      const node = { k: 'if', cond, then: [], else: null };
      if (!this.end()) {
        node.then = [this.stmt()];
        if (this.eat('else')) { node.else = this.elseBranch(); return node; }
        if (!this.end()) this.err(`Didn't understand "${this.txt()}".`);
        const nl = this.L[this.li + 1];
        if (nl && this.firstIs(nl.toks, 'else')) { this.nextLine(); this.ti = 1; node.else = this.elseBranch(); }
        return node;
      }
      this.nextLine();
      node.then = this.block(toks => this.firstIs(toks, 'else') || this.firstIs(toks, 'end', 'if'), 'end if');
      if (this.firstIs(this.toks, 'end')) { this.ti = 2; return node; }
      this.ti = 1; node.else = this.elseBranch(); return node;
    }
    elseBranch() {
      if (!this.end()) return [this.stmt()]; // "else if ..." chains share one "end if"
      this.nextLine();
      const b = this.block(toks => this.firstIs(toks, 'end', 'if'), 'end if'); this.ti = 2; return b;
    }
    repeatStmt() {
      let node;
      if (this.end() || this.eat('forever')) node = { k: 'repeat', how: 'forever' };
      else if (this.eat('while')) node = { k: 'repeat', how: 'while', e: this.expr() };
      else if (this.eat('until')) node = { k: 'repeat', how: 'until', e: this.expr() };
      else if (this.eat('with')) {
        const v = this.peek(); if (!v || v.t !== 'w') this.err('Expected a variable name.'); this.ti++;
        if (!this.eatOp('=')) this.err('Expected "=".');
        const a = this.expr(), down = this.eat('down'); this.need('to');
        node = { k: 'repeat', how: 'with', v: v.v, a, b: this.expr(), down };
      } else { this.eat('for'); node = { k: 'repeat', how: 'times', e: this.expr() }; this.eat('times'); }
      if (!this.end()) this.err(`Didn't understand "${this.txt()}".`);
      this.nextLine();
      node.body = this.block(toks => this.firstIs(toks, 'end', 'repeat'), 'end repeat'); this.ti = 2;
      return node;
    }
    showStmt(show) {
      if (this.eat('menubar', 'titlebar', 'groups')) return { k: 'nop' };
      if (this.isW('msg', 'message', 'tool', 'pattern', 'pat', 'window')) { const m = this.isW('msg', 'message'); this.skipRest(); return m ? { k: 'showmsg', show } : { k: 'nop' }; }
      if (LAYERW[this.w()] && (this.w(1) === 'picture' || this.w(1) === 'pict')) { const layer = LAYERW[this.w()]; this.ti += 2; return { k: 'showpict', show, layer }; }
      if (this.eat('picture', 'pict')) { this.need('of'); return { k: 'showpict', show, o: this.factor() }; }
      if (this.isW('all', 'marked', 'cards') || this.w(1) === 'cards') { this.skipRest(); return { k: 'nop' }; }
      const o = this.factor(); let at = null; if (this.eat('at')) at = this.list();
      return { k: 'vis', show, o, at };
    }
    dest() {
      if (this.isW('back', 'forth', 'home', 'help')) { const v = this.w(); this.ti++; return { k: 'kw', v }; }
      if (this.isW('recent') && CARDW.has(this.w(1))) { this.ti += 2; return { k: 'kw', v: 'back' }; }
      if ((ORD[this.w()] !== undefined || REL[this.w()]) && !CARDW.has(this.w(1)) && !BGW.has(this.w(1)) && !PARTW[this.w(1)]) {
        const w = this.w(); this.ti++; return { k: 'obj', o: { k: 'obj', type: 'card', by: ORD[w] !== undefined ? 'ord' : 'rel', v: ORD[w] !== undefined ? ORD[w] : REL[w] } };
      }
      if (this.eat('stack')) return { k: 'stack', e: this.factor() };
      const o = this.objRef(); if (o) return { k: 'obj', o };
      return { k: 'expr', e: this.expr() };
    }
    container() {
      const n = this.factor(); let b = n; while (b.k === 'chunk') b = b.of;
      if (!['var', 'msg', 'sel', 'obj', 'target'].includes(b.k)) this.err('Expected a container (a variable, a field or the message box).');
      return n;
    }
    list() { const a = []; if (this.endish()) return a; do a.push(this.expr()); while (this.eatOp(',')); return a; }

    // expressions, lowest precedence first
    expr() { return this.orE(); }
    orE() { let a = this.andE(); while (this.eat('or')) a = { k: 'bin', op: 'or', a, b: this.andE() }; return a; }
    andE() { let a = this.eqE(); while (this.eat('and')) a = { k: 'bin', op: 'and', a, b: this.eqE() }; return a; }
    isInForm() { let k = 1; if (this.w(k) === 'not') k++; return ['in', 'within', 'a', 'an'].includes(this.w(k)); }
    eqE() {
      let a = this.relE();
      for (;;) {
        if (this.eatOp('=')) a = { k: 'bin', op: '=', a, b: this.relE() };
        else if (this.eatOp('<>')) a = { k: 'bin', op: '<>', a, b: this.relE() };
        else if (this.isW('is') && !this.isInForm()) { this.ti++; const neg = this.eat('not'); a = { k: 'bin', op: neg ? '<>' : '=', a, b: this.relE() }; }
        else return a;
      }
    }
    relE() {
      let a = this.catE();
      for (;;) {
        const t = this.peek();
        if (t && t.t === 'o' && ['<', '>', '<=', '>='].includes(t.v)) { this.ti++; a = { k: 'bin', op: t.v, a, b: this.catE() }; }
        else if (this.eat('contains')) a = { k: 'bin', op: 'contains', a, b: this.catE() };
        else if (this.isW('is') && this.isInForm()) {
          this.ti++; const neg = this.eat('not');
          if (this.eat('in')) a = { k: 'bin', op: neg ? 'notin' : 'in', a, b: this.catE() };
          else if (this.eat('within')) a = { k: 'bin', op: neg ? 'notwithin' : 'within', a, b: this.catE() };
          else { this.eat('a', 'an'); const ty = this.w() || ''; this.ti++; a = { k: 'isa', neg, a, ty }; }
        } else return a;
      }
    }
    catE() { let a = this.addE(); for (;;) { if (this.eatOp('&&')) a = { k: 'bin', op: '&&', a, b: this.addE() }; else if (this.eatOp('&')) a = { k: 'bin', op: '&', a, b: this.addE() }; else return a; } }
    addE() { let a = this.mulE(); for (;;) { if (this.eatOp('+')) a = { k: 'bin', op: '+', a, b: this.mulE() }; else if (this.eatOp('-')) a = { k: 'bin', op: '-', a, b: this.mulE() }; else return a; } }
    mulE() {
      let a = this.powE();
      for (;;) {
        if (this.eatOp('*')) a = { k: 'bin', op: '*', a, b: this.powE() };
        else if (this.eatOp('/')) a = { k: 'bin', op: '/', a, b: this.powE() };
        else if (this.eat('div')) a = { k: 'bin', op: 'div', a, b: this.powE() };
        else if (this.eat('mod')) a = { k: 'bin', op: 'mod', a, b: this.powE() };
        else return a;
      }
    }
    powE() { let a = this.unE(); while (this.eatOp('^')) a = { k: 'bin', op: '^', a, b: this.unE() }; return a; }
    unE() {
      if (this.eatOp('-')) return { k: 'neg', a: this.unE() };
      if (this.eat('not')) return { k: 'not', a: this.unE() };
      return this.factor();
    }
    startsFactor() {
      const t = this.peek(); if (!t) return false;
      if (t.t === 's' || t.t === 'n') return true;
      if (t.t === 'o') return t.v === '(' || t.v === '-';
      return !STOPW.has(t.v);
    }
    factor() {
      const t = this.peek();
      if (!t) this.err('Expected an expression at the end of the line.');
      if (t.t === 'n') { this.ti++; return { k: 'lit', v: t.v }; }
      if (t.t === 's') { this.ti++; return { k: 'lit', v: t.v, str: true }; }
      if (t.t === 'o') {
        if (t.v === '(') { this.ti++; const e = this.expr(); if (!this.eatOp(')')) this.err('Expected ")".'); return { k: 'paren', e }; }
        if (t.v === '-') { this.ti++; return { k: 'neg', a: this.factor() }; }
        this.err(`Didn't understand "${t.v}".`);
      }
      const w = t.v;
      if (STOPW.has(w)) this.err(`Expected an expression but found "${t.raw}".`);
      if (w === 'the') return this.theE();
      if (w === 'not') { this.ti++; return { k: 'not', a: this.factor() }; }
      if (CONST[w] !== undefined && !this.op('(', 1)) { this.ti++; return { k: 'lit', v: CONST[w] }; }
      if (w === 'me') { this.ti++; return { k: 'obj', type: 'me' }; }
      if (w === 'target') { this.ti++; return { k: 'target', the: false }; }
      if (w === 'it') { this.ti++; return { k: 'var', name: 'it', raw: 'it' }; }
      if (w === 'msg' || (w === 'message' && ['box', 'window'].includes(this.w(1)))) { this.ti++; this.eat('box', 'window'); return { k: 'msg' }; }
      if (w === 'selection') { this.ti++; return { k: 'sel' }; }
      if (w === 'number' && this.w(1) === 'of') { this.ti += 2; return this.count(); }
      if (w === 'there' && this.w(1) === 'is') {
        this.ti += 2; let neg = false;
        if (this.eat('no')) neg = true; else { if (this.eat('not')) neg = true; this.eat('a', 'an'); }
        const o = this.objRef(); if (!o) this.err('Expected an object after "there is".');
        return { k: 'there', neg, o };
      }
      const co = this.chunkOrObj(); if (co) return co;
      if (this.w(1) === 'of' && !this.inIndex) { // "the" may be left out: top of target, length of x
        this.ti += 2; if (FN1.has(w)) return { k: 'call', f: w, args: [this.factor()] };
        return { k: 'prop', p: w, mod: null, o: this.factor() };
      }
      if (this.op('(', 1)) {
        this.ti += 2; const args = [];
        if (!this.op(')')) { do args.push(this.expr()); while (this.eatOp(',')); }
        if (!this.eatOp(')')) this.err('Expected ")".');
        return { k: 'call', f: w, raw: t.raw, args, user: true };
      }
      this.ti++; return { k: 'var', name: w, raw: t.raw };
    }
    theE() {
      this.ti++;
      const w = this.w();
      if (w == null) this.err('Expected a word after "the".');
      if (['long', 'short', 'abbr', 'abbrev', 'abbreviated', 'english'].includes(w) && ['name', 'id', 'date', 'time', 'version'].includes(this.w(1))) {
        const mod = w.startsWith('abbr') ? 'abbr' : w; this.ti++; const p = this.w(); this.ti++;
        if (this.eat('of')) return { k: 'prop', p, mod, o: this.factor() };
        return { k: 'the', f: p, mod };
      }
      if (w === 'number' && this.w(1) === 'of') { this.ti += 2; return this.count(); }
      if (w === 'target') { this.ti++; return { k: 'target', the: true }; }
      if (w === 'message' || w === 'msg') { this.ti++; this.eat('box', 'window'); return { k: 'msg' }; }
      if (w === 'selection') { this.ti++; return { k: 'sel' }; }
      if (ORD[w] !== undefined || REL[w]) { const c = this.chunkOrObj(); if (c) return c; }
      this.ti++;
      if (this.eat('of')) { if (FN1.has(w)) return { k: 'call', f: w, args: [this.factor()] }; return { k: 'prop', p: w, mod: null, o: this.factor() }; }
      return { k: 'the', f: w, mod: null };
    }
    count() {
      const w = this.w(), w1 = this.w(1);
      if (CHUNK[w] && (w1 === 'in' || w1 === 'of')) {
        const type = CHUNK[w]; this.ti++; if (!this.eat('in', 'of')) this.err('Expected "in" or "of".');
        return { k: 'count', what: 'chunk', type, of: this.factor() };
      }
      let layer = null;
      if (LAYERW[w] && PLURALPART.has(w1)) { layer = LAYERW[w]; this.ti++; }
      if (PLURALPART.has(this.w())) {
        const what = PARTW[this.w()]; this.ti++; let of = null;
        if (this.eat('of', 'in')) of = this.objRef();
        return { k: 'count', what, layer, of };
      }
      if (this.isW('cards', 'cds')) { this.ti++; let of = null; if (this.eat('of', 'in')) of = this.objRef(); return { k: 'count', what: 'card', of }; }
      if (this.isW('marked') && ['cards', 'cds'].includes(w1)) { this.ti += 2; return { k: 'count', what: 'marked' }; }
      if (this.isW('backgrounds', 'bkgnds', 'bgs')) { this.ti++; if (this.eat('of', 'in')) this.factor(); return { k: 'count', what: 'bg' }; }
      if (this.isW('windows')) { this.ti++; return { k: 'lit', v: '1' }; }
      return { k: 'objnum', o: this.factor() };
    }
    chunkOrObj() {
      const w = this.w(), w1 = this.w(1);
      if (CHUNK[w] && !['chars', 'characters', 'words', 'items', 'lines'].includes(w)) return this.chunk();
      if (ORD[w] !== undefined && CHUNK[w1]) return this.chunk();
      return this.objRef();
    }
    chunk() {
      let a, b = null, type;
      if (ORD[this.w()] !== undefined) { a = { k: 'ord', v: ORD[this.w()] }; this.ti++; type = CHUNK[this.w()]; this.ti++; }
      else { type = CHUNK[this.w()]; this.ti++; this.inIndex = (this.inIndex || 0) + 1; try { a = this.expr(); if (this.eat('to')) b = this.expr(); } finally { this.inIndex--; } }
      if (!this.eat('of', 'in')) this.err(`Expected "of" after the ${type} number.`);
      return { k: 'chunk', type, a, b, of: this.factor() };
    }
    objAhead(k) {
      const w = this.w(k), w1 = this.w(k + 1);
      if (w == null) return false;
      if (ORD[w] !== undefined || REL[w]) return CARDW.has(w1) || BGW.has(w1) || w1 === 'stack' || !!PARTW[w1];
      return CARDW.has(w) || BGW.has(w) || !!PARTW[w] || w === 'stack' || w === 'family';
    }
    objRef() {
      const save = this.ti; let ord = null, rel = null;
      if (ORD[this.w()] !== undefined) { ord = ORD[this.w()]; this.ti++; }
      else if (REL[this.w()]) { rel = REL[this.w()]; this.ti++; }
      let layer = null;
      if (LAYERW[this.w()] && PARTW[this.w(1)]) { layer = LAYERW[this.w()]; this.ti++; }
      const w = this.w();
      if (PARTW[w] && !PLURALPART.has(w)) {
        this.ti++; const r = { k: 'obj', type: PARTW[w], layer }; this.ident(r, ord, rel, false);
        if (this.isW('of') && this.objAhead(1)) { this.ti++; r.of = this.objRef(); }
        return r;
      }
      if (CARDW.has(w) && !layer) {
        this.ti++; const r = { k: 'obj', type: 'card' }; this.ident(r, ord, rel, true);
        if (this.isW('of') && (BGW.has(this.w(1)) || this.w(1) === 'stack' || ((REL[this.w(1)] || ORD[this.w(1)] !== undefined) && (BGW.has(this.w(2)) || this.w(2) === 'stack')))) { this.ti++; r.of = this.objRef(); }
        return r;
      }
      if (BGW.has(w) && !layer) {
        this.ti++; const r = { k: 'obj', type: 'bg' }; this.ident(r, ord, rel, true);
        if (this.isW('of') && (this.w(1) === 'stack' || (this.w(1) === 'this' && this.w(2) === 'stack'))) { this.ti++; r.of = this.objRef(); }
        return r;
      }
      if (w === 'stack') {
        this.ti++; const r = { k: 'obj', type: 'stack' };
        if (rel === 'this' || !this.startsFactor()) { r.by = 'rel'; r.v = 'this'; } else { r.by = 'nn'; r.v = this.factor(); }
        return r;
      }
      if (w === 'family' && !ord && !rel) {
        this.ti++; const r = { k: 'obj', type: 'family', v: this.factor() };
        if (this.isW('of') && this.objAhead(1)) { this.ti++; r.of = this.objRef(); }
        return r;
      }
      this.ti = save; return null;
    }
    ident(r, ord, rel, bareIsThis) {
      if (ord !== null) { r.by = 'ord'; r.v = ord; return; }
      if (rel) { r.by = 'rel'; r.v = rel; return; }
      if (this.eat('id')) { r.by = 'id'; r.v = this.factor(); return; }
      if (this.startsFactor()) { r.by = 'nn'; r.v = this.factor(); return; }
      if (bareIsThis) { r.by = 'rel'; r.v = 'this'; return; }
      this.err(`Expected a number, name or id after "${r.type}".`);
    }
  }

  function compile(src) { return new Parser(lexScript(src)).script(); }
  function compileBody(src) { const p = new Parser(lexScript(src)); return p.block(() => false, null); }

  // ------------------------------------------------------------------ values
  const isNum = v => typeof v === 'number' ? isFinite(v) : /^\s*[-+]?(\d+\.?\d*|\.\d+)\s*$/.test(String(v));
  const isInt = v => /^\s*[-+]?\d+\s*$/.test(String(v));
  function fmtNum(n, fmt) {
    if (!isFinite(n)) return isNaN(n) ? 'NAN' : n > 0 ? 'INF' : '-INF';
    if (Number.isInteger(n)) return String(n);
    const m = /^(0*)\.?(0*)(#*)$/.exec(fmt || '0.######') || [0, '0', '', '######'];
    const minD = m[2].length, maxD = minD + m[3].length;
    let s = n.toFixed(maxD);
    if (s.includes('.')) { while (s.endsWith('0') && s.length - s.indexOf('.') - 1 > minD) s = s.slice(0, -1); if (s.endsWith('.')) s = s.slice(0, -1); }
    if (s === '-0') s = '0';
    return s;
  }
  class ObjVal { constructor(d) { this.d = d; } }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const EPOCH1904 = new Date(1904, 0, 1).getTime();
  function fmtDate(d, mod) {
    if (mod === 'long') return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    if (mod === 'abbr') return `${DAYS[d.getDay()].slice(0, 3)}, ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
    return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear() % 100).padStart(2, '0')}`;
  }
  function fmtTime(d, mod) {
    const h = d.getHours() % 12 || 12, mm = String(d.getMinutes()).padStart(2, '0'), ss = String(d.getSeconds()).padStart(2, '0');
    return `${h}:${mm}${mod === 'long' ? ':' + ss : ''} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
  }

  // messages HyperCard itself sends; reaching the end of the path with one of these is not an error
  const SYSMSG = new Set(['mousedown', 'mouseup', 'mousestilldown', 'mouseenter', 'mouseleave', 'mousewithin', 'openstack', 'closestack', 'openbackground', 'closebackground',
    'opencard', 'closecard', 'newcard', 'deletecard', 'newbackground', 'deletebackground', 'newbutton', 'deletebutton', 'newfield', 'deletefield', 'openfield', 'closefield',
    'exitfield', 'idle', 'startup', 'quit', 'resume', 'suspend', 'keydown', 'enterkey', 'returnkey', 'tabkey', 'enterinfield', 'returninfield', 'help', 'newstack', 'deletestack',
    // commands with nothing to do in a web browser
    'print', 'edit', 'dial', 'reset', 'create', 'flash', 'drag', 'debug', 'start', 'stop', 'functionkey', 'controlkey', 'commandkeydown', 'savestack', 'paint']);
  const BOOLP = new Set(['visible', 'enabled', 'hilite', 'autohilite', 'showname', 'locktext', 'showlines', 'widemargins', 'dontwrap', 'dontsearch', 'autotab', 'fixedlineheight',
    'sharedtext', 'sharedhilite', 'marked', 'showpict', 'cantdelete', 'cantmodify', 'cantpeek', 'lockscreen', 'lockmessages', 'blindtyping', 'powerkeys', 'textarrows', 'editbkgnd', 'lockrecent']);
  const BTN_STYLES = ['transparent', 'opaque', 'rectangle', 'shadow', 'roundrect', 'checkbox', 'radiobutton'];
  const FLD_STYLES = ['transparent', 'opaque', 'rectangle', 'shadow', 'scrolling'];
  const PROP_CASE = { roundrect: 'roundRect', checkbox: 'checkBox', radiobutton: 'radioButton' };

  // ------------------------------------------------------------------ interpreter
  const EXIT = { s: 'exit' }, PASS = { s: 'pass' }, EXITREP = { s: 'exitrep' }, NEXTREP = { s: 'nextrep' };
  const bool = (v, d) => (v == null || v === '' ? d : String(v).trim().toLowerCase() === 'true');
  const rectOf = p => (p.props.rect ? p.props.rect.split(',').map(Number) : [0, 0, 0, 0]);

  class Interp {
    constructor(stack, host) {
      this.st = stack; this.host = host || {}; this.cur = 0;
      this.globals = new Map(); this.cache = new Map();
      this.gp = { lockscreen: false, lockmessages: false, numberformat: '0.######', itemdelimiter: ',', cursor: 'hand', userlevel: '2', textarrows: 'false', blindtyping: 'false', powerkeys: 'false', dragspeed: '0', editbkgnd: 'false', language: 'English' };
      this.result = ''; this.msgText = ''; this.selText = ''; this.sel = null; this.recent = []; this.forth = []; this.pushed = [];
      this.visualQ = []; this.files = new Map(); this.found = null; this.busy = 0; this.depth = 0; this.abort = false;
      this.mouse = { h: 0, v: 0, down: false, ch: 0, cv: 0, clicked: false }; this.mods = { shift: false, cmd: false, option: false };
      this.t0 = Date.now(); this.lastYield = Date.now(); this.down = null; this.queue = []; this.draining = false;
    }
    // ---- host glue
    call(name, ...a) { const f = this.host[name]; return typeof f === 'function' ? f.apply(this.host, a) : undefined; }
    dirty() { if (!this.gp.lockscreen) this.call('redraw'); }
    card() { return this.st.cards[this.cur]; }
    bgOf(card) { return card ? this.st.backgrounds.find(b => b.id === +card.props.background) || null : null; }

    // ---- values
    s(v) {
      if (typeof v === 'string') return v;
      if (typeof v === 'number') return fmtNum(v, this.gp.numberformat);
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      if (v instanceof ObjVal) return this.nameOf(v.d, null);
      return v == null ? '' : String(v);
    }
    num(v) {
      if (typeof v === 'number') return v;
      const t = this.s(v).trim();
      if (t === '') return 0;
      if (isNum(t)) return parseFloat(t);
      if (/^-?inf$/i.test(t)) return t[0] === '-' ? -Infinity : Infinity;
      throw new HTError(`Expected a number here but found "${t.length > 30 ? t.slice(0, 30) + '…' : t}".`);
    }
    bool(v) {
      if (typeof v === 'boolean') return v;
      const t = this.s(v).trim().toLowerCase();
      if (t === 'true') return true; if (t === 'false') return false;
      throw new HTError(`Expected true or false here but found "${t.length > 30 ? t.slice(0, 30) + '…' : t}".`);
    }
    eq(a, b) { if (isNum(a) && isNum(b)) return this.num(a) === this.num(b); return this.s(a).toLowerCase() === this.s(b).toLowerCase(); }
    cmp(a, b) { if (isNum(a) && isNum(b)) return this.num(a) - this.num(b); const x = this.s(a).toLowerCase(), y = this.s(b).toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
    ints(v, n) { const p = this.s(v).split(','); if (p.length !== n || !p.every(isNum)) return null; return p.map(x => Math.round(parseFloat(x))); }

    // ---- scripts and the message path
    holder(d) { return d.type === 'stack' ? this.st.stack : d.type === 'bg' ? d.bg : d.type === 'card' ? d.card : d.part; }
    handlers(d) {
      const h = this.holder(d); if (!h) return {};
      let e = this.cache.get(h);
      if (!e || e.src !== h.script) { e = { src: h.script, H: compile(h.script) }; this.cache.set(h, e); }
      return e.H;
    }
    path(d) {
      const st = { type: 'stack' };
      if (d.type === 'stack') return [st];
      if (d.type === 'bg') return [d, st];
      if (d.type === 'card') { const bg = this.bgOf(d.card); return bg ? [d, { type: 'bg', bg }, st] : [d, st]; }
      if (d.type === 'family') return this.path({ type: 'card', card: d.card });
      return [d, ...this.path({ type: 'card', card: d.card || this.card() })];
    }
    // send a message (kind 'm') or call a function (kind 'f') along the path from `target`
    async send(name, args, target, kind = 'm', from = null) {
      name = name.toLowerCase();
      for (const d of from || this.path(target)) {
        const h = this.handlers(d)[kind + ':' + name];
        if (!h) continue;
        const r = await this.run(h, d, target, args);
        if (r === PASS) continue;
        return { done: true, v: r && r.s === 'return' ? r.v : '' };
      }
      if (kind === 'm') return { done: await this.builtinMsg(name, args, target), v: '' };
      return { done: false };
    }
    async run(h, me, target, args) {
      if (h.err) { const e = new HTError(h.err.message, h.err.line); e.where = this.nameOf(me, null); throw e; }
      if (this.depth >= 64) throw new HTError('Too much recursion.');
      this.depth++;
      const c = { me, target, vars: new Map(), g: new Set(), args, h };
      h.params.forEach((p, i) => c.vars.set(p, args[i] !== undefined ? args[i] : ''));
      try { return await this.block(h.body, c); }
      finally { this.depth--; }
    }
    async block(list, c) { for (const s of list) { const r = await this.exec(s, c); if (r) return r; } return null; }
    async tick() {
      if (this.abort) { this.abort = false; throw new Abort(); }
      const now = Date.now(); if (now - this.lastYield > 30) { this.lastYield = now; await sleep(0); }
    }

    // ---- variables and containers
    getVar(c, n, raw) { if (c.g.has(n)) return this.globals.has(n) ? this.globals.get(n) : ''; if (c.vars.has(n)) return c.vars.get(n); return n === 'it' ? '' : (raw || n); }
    setVar(c, n, v) { if (c.g.has(n)) this.globals.set(n, v); else c.vars.set(n, v); }
    getText(d) {
      if (d.type === 'field' && d.layer === 'bg' && !bool(d.part.props.sharedtext, false)) { const t = (d.card || this.card()).bgtext[d.part.id]; return t == null ? '' : t; }
      if (d.type === 'field' || d.type === 'button') return d.part.text || '';
      return this.nameOf(d, null);
    }
    setText(d, v) {
      if (d.type === 'field' && d.layer === 'bg' && !bool(d.part.props.sharedtext, false)) (d.card || this.card()).bgtext[d.part.id] = v;
      else if (d.type === 'field' || d.type === 'button') d.part.text = v;
      else throw new HTError("Can't put text into that.");
      this.dirty();
    }
    async readC(n, c) {
      switch (n.k) {
        case 'var': return this.s(c.g.has(n.name) ? (this.globals.has(n.name) ? this.globals.get(n.name) : '') : c.vars.has(n.name) ? c.vars.get(n.name) : ''); // an unset container is empty
        case 'msg': return this.msgText;
        case 'sel': return this.selText;
        case 'target': return this.getText(c.target);
        default: return this.getText(await this.objOf(n, c));
      }
    }
    async writeC(n, c, v) {
      switch (n.k) {
        case 'var': return this.setVar(c, n.name, v);
        case 'msg': this.msgText = v; this.call('message', v); return;
        case 'sel': if (this.sel) { await this.putInto(this.sel.node, this.sel.c, v, 'into'); } this.selText = v; return;
        case 'target': return this.setText(c.target, v);
        default: return this.setText(await this.objOf(n, c), v);
      }
    }
    delim(type) { return type === 'line' ? CR : this.gp.itemdelimiter; }
    chunkCount(str, type) {
      if (type === 'char') return str.length;
      if (type === 'word') return (str.match(/[^ \t\n]+/g) || []).length;
      if (str === '') return 0;
      const n = str.split(this.delim(type)).length; return str.endsWith(this.delim(type)) ? n - 1 : n;
    }
    ordIndex(v, count) { if (typeof v === 'number') return v; if (v === 'last') return count; if (v === 'middle') return Math.floor(count / 2) + 1; return 1 + Math.floor(Math.random() * Math.max(count, 1)); }
    async idx(node, c, count) { return node.k === 'ord' ? this.ordIndex(node.v, count) : Math.trunc(this.num(await this.ev(node, c))); }
    // [s, e) of a chunk inside str; with `write`, items and lines past the end are added (pad goes after str)
    async range(str, ch, c, write) {
      const count = this.chunkCount(str, ch.type);
      let a = await this.idx(ch.a, c, count), b = ch.b ? await this.idx(ch.b, c, count) : a;
      if (ch.type === 'char') { const s = Math.min(Math.max(a - 1, 0), str.length); return { s, e: Math.min(Math.max(b, s), str.length), pad: '' }; }
      if (ch.type === 'word') {
        const ws = []; const re = /[^ \t\n]+/g; let m; while ((m = re.exec(str))) ws.push([m.index, m.index + m[0].length]);
        if (a < 1) a = 1; if (a > ws.length) return { s: str.length, e: str.length, pad: '' };
        b = Math.min(Math.max(b, a), ws.length); return { s: ws[a - 1][0], e: ws[b - 1][1], pad: '' };
      }
      const d = this.delim(ch.type); let pad = '';
      let parts = str.split(d);
      if (a < 1) a = 1;
      if (a > parts.length) { if (!write) return { s: str.length, e: str.length, pad: '' }; pad = d.repeat(a - parts.length); parts = (str + pad).split(d); }
      b = Math.min(Math.max(b, a), parts.length);
      let s = 0; for (let i = 0; i < a - 1; i++) s += parts[i].length + d.length;
      let e = s; for (let i = a - 1; i < b; i++) e += parts[i].length + (i < b - 1 ? d.length : 0);
      return { s, e, pad };
    }
    async putInto(node, c, val, prep, del) {
      const chain = []; let base = node; while (base.k === 'chunk') { chain.push(base); base = base.of; } chain.reverse();
      let S = await this.readC(base, c), s = 0, e = S.length;
      for (const ch of chain) {
        const r = await this.range(S.slice(s, e), ch, c, !del);
        if (r.pad) { S = S.slice(0, e) + r.pad + S.slice(e); e += r.pad.length; }
        [s, e] = [s + r.s, s + r.e];
      }
      if (del) {
        const last = chain[chain.length - 1];
        if (last && (last.type === 'item' || last.type === 'line')) { const d = this.delim(last.type); if (S.substr(e, d.length) === d) e += d.length; else if (s >= d.length && S.substr(s - d.length, d.length) === d) s -= d.length; }
        else if (last && last.type === 'word') { while (e < S.length && /[ \t]/.test(S[e])) e++; }
        S = S.slice(0, s) + S.slice(e);
      } else {
        const v = this.s(val);
        S = prep === 'before' ? S.slice(0, s) + v + S.slice(s) : prep === 'after' ? S.slice(0, e) + v + S.slice(e) : S.slice(0, s) + v + S.slice(e);
      }
      await this.writeC(base, c, S);
    }

    // ---- objects
    async objOf(n, c) {
      if (n.k === 'obj') return this.resolve(n, c);
      if (n.k === 'target') return c.target;
      const v = await this.ev(n, c);
      if (v instanceof ObjVal) return v.d;
      const str = this.s(v), p = new Parser([{ n: 0, toks: lexLine(str).toks }]);
      let r = null; try { r = p.objRef(); } catch (_) { r = null; }
      if (!r || !p.end()) throw new HTError(`No such object: "${str}".`);
      return this.resolve(r, c);
    }
    async pick(list, r, c, nameOf) {
      if (r.by === 'ord') return list[this.ordIndex(r.v, list.length) - 1] || null;
      if (r.by === 'id') { const id = this.num(await this.ev(r.v, c)); return list.find(x => x.id === id) || null; }
      const sv = this.s(await this.ev(r.v, c)).trim();
      if (!r.v.str && isInt(sv)) return list[+sv - 1] || null;
      const byName = list.find(x => (nameOf(x) || '').toLowerCase() === sv.toLowerCase());
      if (byName) return byName;
      return isInt(sv) ? list[+sv - 1] || null : null;
    }
    async resolve(r, c) {
      switch (r.type) {
        case 'me': return c.me;
        case 'button': case 'field': {
          let card = this.card();
          if (r.of) { const o = await this.resolve(r.of, c); if (o.type !== 'card') throw new HTError(`Expected a card after "of".`); card = o.card; }
          const layer = r.layer || (r.type === 'button' ? 'card' : 'bg'), bg = this.bgOf(card);
          const list = (layer === 'card' ? card.parts : bg ? bg.parts : []).filter(p => p.kind === r.type);
          if (r.by === 'rel') throw new HTError(`Can't use "${r.v}" with a ${r.type}.`);
          const p = await this.pick(list, r, c, x => x.props.name);
          if (!p) throw new HTError(`No such ${layer === 'card' ? 'card' : 'bkgnd'} ${r.type}.`);
          return { type: r.type, part: p, layer, card };
        }
        case 'card': {
          let list = this.st.cards;
          if (r.of) {
            const o = await this.resolve(r.of, c);
            if (o.type === 'stack' && o.ext) return { type: 'xcard', stack: o.ext, by: r.by, v: r.by === 'nn' || r.by === 'id' ? this.s(await this.ev(r.v, c)) : r.v };
            if (o.type === 'bg') list = list.filter(x => +x.props.background === o.bg.id);
          }
          let card = null;
          if (r.by === 'rel') {
            const i = this.cur, n = this.st.cards.length;
            card = r.v === 'this' ? this.card() : r.v === 'next' ? this.st.cards[(i + 1) % n] : r.v === 'prev' ? this.st.cards[(i - 1 + n) % n] : this.recent[this.recent.length - 1] || this.card();
          } else card = await this.pick(list, r, c, x => x.props.name);
          if (!card) throw new HTError('No such card.');
          return { type: 'card', card };
        }
        case 'bg': {
          const list = this.st.backgrounds; let bg = null;
          if (r.by === 'rel') {
            const i = list.indexOf(this.bgOf(this.card())), n = list.length;
            bg = r.v === 'next' ? list[(i + 1) % n] : r.v === 'prev' ? list[(i - 1 + n) % n] : list[i];
          } else bg = await this.pick(list, r, c, x => x.props.name);
          if (!bg) throw new HTError('No such background.');
          return { type: 'bg', bg };
        }
        case 'stack': {
          if (r.by === 'rel') return { type: 'stack' };
          const name = this.s(await this.ev(r.v, c)), mine = (this.st.stack.props.name || '').toLowerCase();
          return name.toLowerCase() === mine ? { type: 'stack' } : { type: 'stack', ext: name };
        }
        case 'family': {
          const card = r.of ? (await this.resolve(r.of, c)).card : this.card();
          return { type: 'family', n: Math.trunc(this.num(await this.ev(r.v, c))), card };
        }
      }
      throw new HTError('No such object.');
    }
    numberOf(d) {
      if (d.type === 'card') return this.st.cards.indexOf(d.card) + 1;
      if (d.type === 'bg') return this.st.backgrounds.indexOf(d.bg) + 1;
      if (d.type === 'button' || d.type === 'field') {
        const card = d.card || this.card(), owner = d.layer === 'card' ? card : this.bgOf(card);
        return owner.parts.filter(p => p.kind === d.type).indexOf(d.part) + 1;
      }
      return 1;
    }
    nameOf(d, mod) {
      if (d.type === 'stack') { const n = this.st.stack.props.name || 'Untitled'; return mod === 'short' ? n : `stack "${n}"`; }
      if (d.type === 'family') return `family ${d.n}`;
      const h = this.holder(d), name = h.props.name || '';
      const word = d.type === 'card' ? 'card' : d.type === 'bg' ? 'bkgnd' : `${d.layer === 'card' ? 'card' : 'bkgnd'} ${d.type}`;
      if (mod === 'short') return name || `${word} id ${h.id}`;
      let s = name ? `${word} "${name}"` : `${word} id ${h.id}`;
      if (mod === 'long') {
        if (d.type === 'button' || d.type === 'field') s += ' of ' + this.nameOf({ type: 'card', card: d.card || this.card() }, 'long');
        else s += ' of ' + this.nameOf({ type: 'stack' }, null);
      }
      return s;
    }
    hilite(d) {
      if (d.type === 'button' && d.layer === 'bg' && !bool(d.part.props.sharedhilite, true)) return (d.card || this.card()).bghilite.has(d.part.id);
      return bool(d.part.props.hilite, false);
    }
    setHilite(d, on) {
      if (d.type === 'button' && d.layer === 'bg' && !bool(d.part.props.sharedhilite, true)) { const s = (d.card || this.card()).bghilite; if (on) s.add(d.part.id); else s.delete(d.part.id); }
      else d.part.props.hilite = on ? 'true' : 'false';
      this.dirty();
    }
    familyButtons(card, n) {
      const out = [], bg = this.bgOf(card);
      if (bg) for (const p of bg.parts) if (p.kind === 'button' && +(p.props.family || 0) === n) out.push({ type: 'button', part: p, layer: 'bg', card });
      for (const p of card.parts) if (p.kind === 'button' && +(p.props.family || 0) === n) out.push({ type: 'button', part: p, layer: 'card', card });
      return out;
    }
    getProp(d, p, mod) {
      p = p.toLowerCase();
      if (p === 'name') return this.nameOf(d, mod);
      if (p === 'id') return d.type === 'stack' || d.type === 'family' ? '' : String(this.holder(d).id);
      if (p === 'number') return this.numberOf(d);
      if (d.type === 'family') {
        if (p === 'hilitedbutton' || p === 'hilitedbtn') { const b = this.familyButtons(d.card, d.n).find(x => this.hilite(x)); return b ? new ObjVal(b) : ''; }
        throw new HTError(`A family has no "${p}" property.`);
      }
      const h = this.holder(d), P = h.props;
      if (p === 'script') return h.script || '';
      if (d.type === 'stack') {
        if (p === 'cantmodify') return P.cantmodify != null ? P.cantmodify : 'true';
        if (p === 'userlevel') return P.userlevel || this.gp.userlevel;
        if (p === 'freesize') return '0';
        if (p === 'size') return '0';
      }
      if (d.type === 'card' || d.type === 'bg') {
        if (p === 'rect') return '0,0,320,200';
        if (p === 'showpict') return bool(P.showpict, true) ? 'true' : 'false';
      }
      if (d.type === 'button' || d.type === 'field') {
        const [l, t, r, b] = rectOf(h);
        switch (p) {
          case 'rect': case 'rectangle': return `${l},${t},${r},${b}`;
          case 'left': return l; case 'top': return t; case 'right': return r; case 'bottom': return b;
          case 'width': return r - l; case 'height': return b - t;
          case 'loc': case 'location': return `${Math.trunc((l + r) / 2)},${Math.trunc((t + b) / 2)}`;
          case 'topleft': return `${l},${t}`; case 'bottomright': case 'botright': return `${r},${b}`;
          case 'hilite': case 'highlight': case 'hilight': case 'highlite': return this.hilite(d) ? 'true' : 'false';
          case 'visible': case 'enabled': return bool(P[p], true) ? 'true' : 'false';
          case 'style': return P.style || 'transparent';
          case 'textfont': return P.textfont || 'Shaston';
          case 'textsize': return P.textsize || '8';
          case 'textstyle': return P.textstyle || 'plain';
          case 'textalign': return P.textalign || (d.type === 'button' ? 'center' : 'left');
          case 'textheight': return P.textheight || String(this.host.lineHeight ? this.host.lineHeight(P) : +(P.textsize || 8) + 1);
          case 'icon': case 'family': case 'scroll': case 'framecolor': case 'textcolor': case 'forecolor': return P[p] || '0';
          case 'backcolor': return P.backcolor || '15';
        }
      }
      if (BOOLP.has(p)) return bool(P[p], false) ? 'true' : 'false';
      if (P[p] != null) return P[p];
      throw new HTError(`Can't get the ${p} of that object.`);
    }
    setProp(d, p, vals) {
      p = p.toLowerCase();
      const v = vals.map(x => this.s(x)).join(',');
      if (d.type === 'family' || (d.type === 'stack' && ['name', 'cantmodify'].includes(p))) throw new HTError(`Can't set the ${p} of that object.`);
      const h = this.holder(d), P = h.props;
      if (p === 'script') { h.script = v; return; }
      if (p === 'name') { P.name = v; this.dirty(); return; }
      if (d.type === 'button' || d.type === 'field') {
        let [l, t, r, b] = rectOf(h);
        const two = () => { const q = this.ints(v, 2); if (!q) throw new HTError(`Expected a point (h,v) but found "${v}".`); return q; };
        const one = () => { if (!isNum(v)) throw new HTError(`Expected a number but found "${v}".`); return Math.round(+v); };
        switch (p) {
          case 'rect': case 'rectangle': { const q = this.ints(v, 4); if (!q) throw new HTError(`Expected a rectangle (left,top,right,bottom) but found "${v}".`); [l, t, r, b] = q; break; }
          case 'loc': case 'location': { const [x, y] = two(), w = r - l, hh = b - t; l = x - Math.trunc(w / 2); t = y - Math.trunc(hh / 2); r = l + w; b = t + hh; break; }
          case 'topleft': { const [x, y] = two(); r += x - l; b += y - t; l = x; t = y; break; }
          case 'bottomright': case 'botright': { const [x, y] = two(); l += x - r; t += y - b; r = x; b = y; break; }
          case 'left': { const x = one(); r += x - l; l = x; break; }
          case 'top': { const y = one(); b += y - t; t = y; break; }
          case 'right': { const x = one(); l += x - r; r = x; break; }
          case 'bottom': { const y = one(); t += y - b; b = y; break; }
          case 'width': { const w = one(), cx = (l + r) / 2; l = Math.trunc(cx - w / 2); r = l + w; break; }
          case 'height': { const hh = one(), cy = (t + b) / 2; t = Math.trunc(cy - hh / 2); b = t + hh; break; }
          case 'hilite': case 'highlight': case 'hilight': case 'highlite': this.setHilite(d, this.bool(v)); return;
          case 'style': {
            const st = v.trim().toLowerCase(), ok = d.type === 'button' ? BTN_STYLES : FLD_STYLES;
            if (!ok.includes(st)) throw new HTError(`"${v}" is not a ${d.type} style.`);
            P.style = PROP_CASE[st] || st; this.dirty(); return;
          }
          case 'icon': {
            let id = v.trim();
            if (!isInt(id)) { const icons = (this.st.resources && this.st.resources.icon) || {}; const hit = Object.values(icons).find(x => (x.props.name || '').toLowerCase() === id.toLowerCase()); id = hit ? String(hit.id) : '0'; }
            P.icon = String(+id); this.dirty(); return;
          }
          case 'textfont': case 'textsize': P[p] = v; delete P.textheight; this.dirty(); return; // HyperCard resets textHeight to the font's own
          default: {
            if (BOOLP.has(p)) { P[p] = this.bool(v) ? 'true' : 'false'; this.dirty(); return; }
            P[p] = v; this.dirty(); return;
          }
        }
        P.rect = `${l},${t},${r},${b}`; this.dirty(); return;
      }
      P[p] = BOOLP.has(p) ? (this.bool(v) ? 'true' : 'false') : v; this.dirty();
    }
    setGlobal(p, vals) {
      const v = vals.map(x => this.s(x)).join(',');
      switch (p) {
        case 'lockscreen': this.gp.lockscreen = this.bool(v); if (!this.gp.lockscreen) this.call('redraw'); return;
        case 'itemdelimiter': if (v.length < 1) throw new HTError('The itemDelimiter must be one character.'); this.gp.itemdelimiter = v[0]; return;
        case 'cursor': this.gp.cursor = v; this.call('cursor', v); return;
        case 'numberformat': this.gp.numberformat = v; return;
        case 'userlevel': { const n = Math.trunc(this.num(v)); if (n < 1 || n > 5) throw new HTError('The userLevel must be 1 to 5.'); this.gp.userlevel = String(n); return; }
        default: this.gp[p] = BOOLP.has(p) ? (this.bool(v) ? 'true' : 'false') : v;
      }
    }

    // ---- expressions
    async ev(n, c) {
      switch (n.k) {
        case 'lit': return n.v;
        case 'paren': return this.ev(n.e, c);
        case 'var': return this.getVar(c, n.name, n.raw);
        case 'neg': return -this.num(await this.ev(n.a, c));
        case 'not': return !this.bool(await this.ev(n.a, c));
        case 'bin': return this.binop(n, c);
        case 'isa': {
          const v = this.s(await this.ev(n.a, c)), ty = n.ty; let r;
          if (ty === 'number') r = isNum(v); else if (ty === 'integer') r = isInt(v);
          else if (ty === 'point') r = !!this.ints(v, 2); else if (ty === 'rect') r = !!this.ints(v, 4);
          else if (ty === 'logical' || ty === 'boolean') r = ['true', 'false'].includes(v.trim().toLowerCase());
          else if (ty === 'date') r = !isNaN(this.parseDate(v));
          else throw new HTError(`"${ty}" is not a type HyperTalk knows.`);
          return n.neg ? !r : r;
        }
        case 'call': return this.callFn(n, c);
        case 'the': return this.theFn(n.f, n.mod, c);
        case 'prop': return this.getProp(await this.objOf(n.o, c), n.p, n.mod);
        case 'chunk': { const str = this.s(await this.ev(n.of, c)), r = await this.range(str, n, c, false); return str.slice(r.s, r.e); }
        case 'obj': { const d = await this.resolve(n, c); return d.type === 'field' || d.type === 'button' ? this.getText(d) : new ObjVal(d); }
        case 'target': return n.the ? new ObjVal(c.target) : (c.target.type === 'field' ? this.getText(c.target) : new ObjVal(c.target));
        case 'msg': return this.msgText;
        case 'sel': return this.selText;
        case 'count': return this.countOf(n, c);
        case 'objnum': return this.numberOf(await this.objOf(n.o, c));
        case 'there': { let ok = true; try { const d = await this.resolve(n.o, c); if (d.ext) ok = false; } catch (e) { if (!(e instanceof HTError)) throw e; ok = false; } return n.neg ? !ok : ok; }
      }
      throw new HTError('Unknown expression.');
    }
    async binop(n, c) {
      if (n.op === 'and') return this.bool(await this.ev(n.a, c)) && this.bool(await this.ev(n.b, c));
      if (n.op === 'or') return this.bool(await this.ev(n.a, c)) || this.bool(await this.ev(n.b, c));
      const a = await this.ev(n.a, c), b = await this.ev(n.b, c);
      switch (n.op) {
        case '&': return this.s(a) + this.s(b);
        case '&&': return this.s(a) + ' ' + this.s(b);
        case '+': return this.num(a) + this.num(b);
        case '-': return this.num(a) - this.num(b);
        case '*': return this.num(a) * this.num(b);
        case '/': return this.num(a) / this.num(b);
        case 'div': { const q = this.num(a) / this.num(b); return isFinite(q) ? Math.trunc(q) : q; }
        case 'mod': return this.num(a) % this.num(b);
        case '^': return Math.pow(this.num(a), this.num(b));
        case '=': return this.eq(a, b);
        case '<>': return !this.eq(a, b);
        case '<': return this.cmp(a, b) < 0;
        case '>': return this.cmp(a, b) > 0;
        case '<=': return this.cmp(a, b) <= 0;
        case '>=': return this.cmp(a, b) >= 0;
        case 'contains': return this.s(a).toLowerCase().includes(this.s(b).toLowerCase());
        case 'in': return this.s(b).toLowerCase().includes(this.s(a).toLowerCase());
        case 'notin': return !this.s(b).toLowerCase().includes(this.s(a).toLowerCase());
        case 'within': case 'notwithin': {
          const pt = this.ints(a, 2), r = this.ints(b, 4); if (!pt || !r) throw new HTError('"is within" needs a point and a rectangle.');
          const inside = pt[0] >= r[0] && pt[0] < r[2] && pt[1] >= r[1] && pt[1] < r[3]; return n.op === 'within' ? inside : !inside;
        }
      }
      throw new HTError(`Unknown operator ${n.op}.`);
    }
    async countOf(n, c) {
      if (n.what === 'chunk') return this.chunkCount(this.s(await this.ev(n.of, c)), n.type);
      if (n.what === 'card') { if (n.of) { const o = await this.resolve(n.of, c); if (o.type === 'bg') return this.st.cards.filter(x => +x.props.background === o.bg.id).length; } return this.st.cards.length; }
      if (n.what === 'marked') return this.st.cards.filter(x => bool(x.props.marked, false)).length;
      if (n.what === 'bg') return this.st.backgrounds.length;
      const card = n.of ? (await this.resolve(n.of, c)).card || this.card() : this.card();
      const layer = n.layer || (n.what === 'button' ? 'card' : 'bg'), owner = layer === 'card' ? card : this.bgOf(card);
      return owner ? owner.parts.filter(p => p.kind === n.what).length : 0;
    }
    parseDate(v) {
      const s = this.s(v).trim();
      if (isNum(s)) return EPOCH1904 + parseFloat(s) * 1000;
      const di = s.split(',');
      if (di.length === 7 && di.every(isNum)) return new Date(+di[0], +di[1] - 1, +di[2], +di[3], +di[4], +di[5]).getTime();
      let t = Date.parse(s);
      if (isNaN(t)) t = Date.parse(new Date().toDateString() + ' ' + s);
      return t;
    }
    theFn(f, mod, c) {
      const now = new Date();
      switch (f) {
        case 'date': return fmtDate(now, mod);
        case 'time': return fmtTime(now, mod);
        case 'ticks': return Math.floor((Date.now() - this.t0) * 60 / 1000);
        case 'seconds': case 'secs': return Math.floor((Date.now() - EPOCH1904) / 1000);
        case 'mouse': return this.mouse.down ? 'down' : 'up';
        case 'mouseclick': { const r = this.mouse.clicked; this.mouse.clicked = false; return r; }
        case 'mouseloc': return `${this.mouse.h},${this.mouse.v}`;
        case 'mouseh': return this.mouse.h; case 'mousev': return this.mouse.v;
        case 'clickloc': return `${this.mouse.ch},${this.mouse.cv}`;
        case 'clickh': return this.mouse.ch; case 'clickv': return this.mouse.cv;
        case 'clickline': case 'clickchunk': return this.clickText ? this.clickText[f] : '';
        case 'commandkey': case 'cmdkey': return this.mods.cmd ? 'down' : 'up';
        case 'optionkey': return this.mods.option ? 'down' : 'up';
        case 'shiftkey': return this.mods.shift ? 'down' : 'up';
        case 'result': return this.result;
        case 'target': return new ObjVal(c.target);
        case 'tool': return 'browse tool';
        case 'sound': return 'done';
        case 'version': return mod === 'long' ? '01108000' : '1.1';
        case 'diskspace': case 'heapspace': case 'stackspace': return 1048576;
        case 'screenrect': return '0,0,320,200';
        case 'menus': return '';
        case 'windows': return 'Message' + CR + (this.st.stack.props.name || '');
        case 'params': return c.h ? c.h.name + (c.args.length ? ' ' + c.args.map(a => '"' + this.s(a) + '"').join(',') : '') : '';
        case 'paramcount': return c.args ? c.args.length : 0;
        case 'foundtext': case 'foundfield': case 'foundline': case 'foundchunk': return this.found ? this.found[f] : '';
        case 'selectedtext': return this.selText;
        case 'selectedfield': case 'selectedline': case 'selectedchunk': return this.sel ? this.sel[f] || '' : '';
        case 'hcbversion': return '0.1';
      }
      if (this.gp[f] !== undefined) return this.gp[f];
      throw new HTError(`Can't understand "the ${f}".`);
    }
    async callFn(n, c) {
      const args = []; for (const a of n.args) args.push(await this.ev(a, c));
      // a function call or message from a script starts at me but keeps the target (the entry point); ShowMe relies on it
      if (n.user) { const r = await this.send(n.f, args, c.target, 'f', this.path(c.me)); if (r.done) return r.v; }
      return this.builtinFn(n.f.toLowerCase(), args, c, n.raw);
    }
    async builtinFn(f, a, c, raw) {
      const N = i => this.num(a[i]);
      const list = () => (a.length === 1 ? this.s(a[0]).split(',') : a).map(x => this.num(x));
      switch (f) {
        case 'abs': return Math.abs(N(0));
        case 'round': { const x = N(0), r = Math.round(x); return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r; } // SANE rounds halves to even 🔶
        case 'trunc': return Math.trunc(N(0));
        case 'sqrt': return Math.sqrt(N(0));
        case 'sin': return Math.sin(N(0)); case 'cos': return Math.cos(N(0)); case 'tan': return Math.tan(N(0)); case 'atan': return Math.atan(N(0));
        case 'exp': return Math.exp(N(0)); case 'exp1': return Math.expm1(N(0)); case 'exp2': return Math.pow(2, N(0));
        case 'ln': return Math.log(N(0)); case 'ln1': return Math.log1p(N(0)); case 'log2': return Math.log2(N(0));
        case 'random': { const n = Math.trunc(N(0)); return n < 1 ? 0 : 1 + Math.floor(Math.random() * n); }
        case 'max': return Math.max(...list()); case 'min': return Math.min(...list());
        case 'average': { const l = list(); return l.reduce((x, y) => x + y, 0) / l.length; }
        case 'annuity': { const r = N(0), p = N(1); return r === 0 ? p : (1 - Math.pow(1 + r, -p)) / r; }
        case 'compound': return Math.pow(1 + N(0), N(1));
        case 'length': return this.s(a[0]).length;
        case 'offset': { const i = this.s(a[1]).toLowerCase().indexOf(this.s(a[0]).toLowerCase()); return i + 1; }
        case 'chartonum': { const s = this.s(a[0]); return s ? (s[0] === '\n' ? 13 : s.charCodeAt(0)) : 0; }
        case 'numtochar': { const n = Math.trunc(N(0)) & 255; return n === 13 ? CR : String.fromCharCode(n); }
        case 'value': { const p = new Parser([{ n: 0, toks: lexLine(this.s(a[0])).toks }]); if (p.end()) return ''; const e = p.expr(); if (!p.end()) throw new HTError(`Can't understand "${this.s(a[0])}" as an expression.`); return this.ev(e, c); }
        case 'param': { const i = Math.trunc(N(0)); return i === 0 ? (c.h ? c.h.name : '') : (c.args[i - 1] !== undefined ? c.args[i - 1] : ''); }
      }
      try { return this.theFn(f, null, c); } catch (e) { if (!(e instanceof HTError)) throw e; }
      throw new HTError(`Can't understand the function "${raw || f}".`);
    }

    // ---- statements
    async exec(s, c) {
      try { return await this.execStmt(s, c); }
      catch (e) {
        if (e instanceof HTError) { if (e.line == null) e.line = s.line; if (!e.where) e.where = this.nameOf(c.me, null) + (c.h ? `, handler ${c.h.raw || c.h.name}` : ''); }
        throw e;
      }
    }
    async execStmt(s, c) {
      switch (s.k) {
        case 'nop': return null;
        case 'put': { const v = await this.ev(s.e, c); if (!s.c) { this.msgText = this.s(v); this.call('message', this.msgText); return null; } await this.putInto(s.c, c, v, s.prep); return null; }
        case 'get': this.setVar(c, 'it', await this.ev(s.e, c)); return null;
        case 'set': {
          const vals = []; for (const e of s.vals) vals.push(await this.ev(e, c));
          if (s.o) this.setProp(await this.objOf(s.o, c), s.p, vals); else this.setGlobal(s.p, vals);
          return null;
        }
        case 'if': {
          if (this.bool(await this.ev(s.cond, c))) return this.block(s.then, c);
          return s.else ? this.block(s.else, c) : null;
        }
        case 'repeat': return this.repeat(s, c);
        case 'exit': return EXIT;
        case 'exitrep': return EXITREP;
        case 'nextrep': return NEXTREP;
        case 'exitall': throw new Abort();
        case 'pass': return PASS;
        case 'return': return { s: 'return', v: s.e ? await this.ev(s.e, c) : '' };
        case 'global': for (const n of s.names) c.g.add(n); return null;
        case 'go': this.result = ''; await this.goDest(s.d, c); return null;
        case 'answer': {
          const btns = []; for (const b of s.b) btns.push(this.s(await this.ev(b, c)));
          const text = this.s(await this.ev(s.e, c));
          this.call('redraw');
          const r = await this.call('answer', text, btns.length ? btns : ['OK']);
          this.setVar(c, 'it', r == null ? (btns[0] || 'OK') : r); return null;
        }
        case 'answerfile': { const r = await this.call('answerFile', s.e ? this.s(await this.ev(s.e, c)) : ''); this.setVar(c, 'it', r || ''); this.result = r ? '' : 'Cancel'; return null; }
        case 'ask': {
          const prompt = this.s(await this.ev(s.e, c)), def = s.d ? this.s(await this.ev(s.d, c)) : '';
          this.call('redraw');
          const r = await this.call(s.file ? 'askFile' : 'ask', prompt, def, s.pw);
          if (r == null) { this.setVar(c, 'it', ''); this.result = 'Cancel'; } else { this.setVar(c, 'it', r); this.result = ''; }
          return null;
        }
        case 'arith': {
          const by = this.num(await this.ev(s.e, c));
          const x = this.num(s.c.k === 'chunk' ? await this.ev(s.c, c) : await this.readC(s.c, c));
          const v = s.op === '+' ? x + by : s.op === '-' ? x - by : s.op === '*' ? x * by : x / by;
          await this.putInto(s.c, c, v, 'into'); return null;
        }
        case 'vis': {
          const d = await this.objOf(s.o, c);
          if (d.type !== 'button' && d.type !== 'field') throw new HTError(`Can't ${s.show ? 'show' : 'hide'} that.`);
          if (s.at) { const vals = []; for (const e of s.at) vals.push(await this.ev(e, c)); this.setProp(d, 'loc', vals); }
          this.setProp(d, 'visible', [s.show]); return null;
        }
        case 'showpict': {
          let h; if (s.o) { const d = await this.objOf(s.o, c); h = this.holder(d); } else h = s.layer === 'card' ? this.card() : this.bgOf(this.card());
          if (h) { h.props.showpict = s.show ? 'true' : 'false'; this.dirty(); } return null;
        }
        case 'showmsg': this.call('showMessage', s.show); return null;
        case 'visual': this.visualQ.push(s.words.join(' ')); return null;
        case 'lock': case 'unlock': {
          if (s.what !== 'screen') return null; // lock messages is a property in 1.x; ignore other forms
          if (s.on) { this.gp.lockscreen = true; return null; }
          this.gp.lockscreen = false;
          if (s.words.length) await this.call('show', [s.words.join(' ')]); else this.call('redraw');
          return null;
        }
        case 'beep': this.call('beep', s.e ? Math.max(1, Math.trunc(this.num(await this.ev(s.e, c)))) : 1); return null;
        case 'wait': {
          const n = this.num(await this.ev(s.e, c)), ms = s.u === 'seconds' ? n * 1000 : n * 1000 / 60;
          this.call('redraw'); const end = Date.now() + ms;
          while (Date.now() < end) { if (this.abort) { this.abort = false; throw new Abort(); } await sleep(Math.min(50, end - Date.now())); }
          return null;
        }
        case 'waitc': {
          this.call('redraw');
          for (;;) { const v = this.bool(await this.ev(s.e, c)); if (s.until ? v : !v) return null; if (this.abort) { this.abort = false; throw new Abort(); } await sleep(16); }
        }
        case 'play': {
          const name = this.s(await this.ev(s.e, c)), tempo = s.tempo ? this.num(await this.ev(s.tempo, c)) : 120, notes = s.notes ? this.s(await this.ev(s.notes, c)) : '';
          this.call('play', name, tempo, notes); return null;
        }
        case 'playstop': this.call('playStop'); return null;
        case 'domenu': {
          const item = this.s(await this.ev(s.e, c)); this.result = '';
          await this.send('doMenu', [item], { type: 'card', card: this.card() }); return null;
        }
        case 'push': { const d = s.o ? await this.objOf(s.o, c) : { type: 'card', card: this.card() }; this.pushed.push(d.card || this.card()); return null; }
        case 'pop': {
          const card = this.pushed.pop(); if (!card) return null;
          if (s.c) { await this.putInto(s.c, c, this.nameOf({ type: 'card', card }, 'long'), s.prep); return null; }
          await this.goCard(card); return null;
        }
        case 'find': this.result = ''; await this.find(s.mode, this.s(await this.ev(s.e, c)), s.f ? await this.objOf(s.f, c) : null); return null;
        case 'send': {
          const msg = this.s(await this.ev(s.e, c)), to = s.o ? await this.objOf(s.o, c) : c.me;
          let body; try { body = compileBody(msg); } catch (e) { throw new HTError(e.message); }
          const c2 = Object.assign({}, c, { me: to, target: to, sendTo: to });
          return this.blockSent(body, c2);
        }
        case 'do': {
          let body; try { body = compileBody(this.s(await this.ev(s.e, c))); } catch (e) { throw new HTError(e.message); }
          return this.block(body, c);
        }
        case 'delete': await this.putInto(s.c, c, '', 'into', true); return null;
        case 'select': {
          if (!s.c) { this.sel = null; this.selText = ''; return null; }
          const d = s.c.k === 'chunk' ? null : await this.objOf(s.c, c).catch(() => null);
          const text = s.where === 'all' ? this.s(await this.ev(s.c, c)) : '';
          this.sel = { node: s.c, c, selectedfield: d ? this.nameOf(d, null) : '', selectedchunk: '', selectedline: '' }; this.selText = text; return null;
        }
        case 'click': { const v = []; for (const e of s.pt) v.push(this.s(await this.ev(e, c))); const p = this.ints(v.join(','), 2); if (!p) throw new HTError('Expected a point after "click at".'); await this.clickAt(p[0], p[1]); return null; }
        case 'type': return null;
        case 'sort': await this.sortCards(s, c); return null;
        case 'convert': {
          const t = this.parseDate(s.c.k === 'chunk' ? await this.ev(s.c, c) : await this.readC(s.c, c));
          if (isNaN(t)) throw new HTError('Invalid date.');
          const d = new Date(t), out = [];
          for (const part of s.fmt.toLowerCase().split(/\s+and\s+/)) {
            const w = part.split(/\s+/), mod = ['long', 'short', 'abbr', 'abbrev', 'abbreviated'].includes(w[0]) ? (w[0].startsWith('abbr') ? 'abbr' : w[0]) : null, k = w[w.length - 1];
            if (k === 'seconds' || k === 'secs') out.push(String(Math.floor((t - EPOCH1904) / 1000)));
            else if (k === 'dateitems') out.push([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getDay() + 1].join(','));
            else if (k === 'date') out.push(fmtDate(d, mod)); else if (k === 'time') out.push(fmtTime(d, mod));
            else throw new HTError(`Can't convert to "${part}".`);
          }
          await this.putInto(s.c, c, out.join(' '), 'into'); return null;
        }
        case 'openfile': {
          const name = this.fileName(this.s(await this.ev(s.e, c)));
          if (!this.files.has(name.toLowerCase())) { const data = await this.call('readFile', name); this.files.set(name.toLowerCase(), { name, data: data == null ? '' : data, pos: 0, dirty: false }); }
          this.result = ''; return null;
        }
        case 'closefile': {
          const name = this.s(await this.ev(s.e, c)), f = this.files.get(name.toLowerCase());
          if (f) { this.files.delete(name.toLowerCase()); if (f.dirty) await this.call('writeFile', f.name, f.data); }
          return null;
        }
        case 'read': {
          const name = this.s(await this.ev(s.f, c)), f = this.files.get(name.toLowerCase());
          if (!f) throw new HTError(`File "${name}" is not open.`);
          let out;
          if (s.count) { const n = Math.max(0, Math.trunc(this.num(await this.ev(s.count, c)))); out = f.data.substr(f.pos, n); }
          else {
            const u = s.until ? this.s(await this.ev(s.until, c)) : '';
            const ch = u === '' || u.toLowerCase() === 'eof' ? '' : u[0];
            const j = ch ? f.data.indexOf(ch, f.pos) : -1; out = j < 0 ? f.data.slice(f.pos) : f.data.slice(f.pos, j + 1);
          }
          f.pos += out.length; this.setVar(c, 'it', out); this.result = f.pos >= f.data.length && !out ? 'eof' : ''; return null;
        }
        case 'write': {
          const v = this.s(await this.ev(s.e, c)), name = this.s(await this.ev(s.f, c)), f = this.files.get(name.toLowerCase());
          if (!f) throw new HTError(`File "${name}" is not open.`);
          f.data = f.data.slice(0, f.pos) + v; f.pos += v.length; f.dirty = true; return null;
        }
        case 'mark': { const d = s.o ? await this.objOf(s.o, c) : { type: 'card', card: this.card() }; if (d.type !== 'card') throw new HTError('Only cards can be marked.'); d.card.props.marked = s.on ? 'true' : 'false'; return null; }
        case 'msg': {
          const args = []; for (const a of s.args) args.push(await this.ev(a, c));
          const r = await this.send(s.name, args, c.target, 'm', this.path(c.sendTo || c.me));
          if (!r.done) throw new HTError(`Can't understand "${s.raw}".`);
          this.result = r.v == null ? '' : r.v; return null;
        }
      }
      throw new HTError(`Can't run "${s.k}" yet.`);
    }
    async blockSent(body, c) { const r = await this.block(body, c); return r === PASS || r === EXIT ? null : r; }
    async repeat(s, c) {
      const once = async () => { const r = await this.block(s.body, c); await this.tick(); return r; };
      const handle = r => (r === EXITREP ? 'break' : r === NEXTREP || !r ? null : r);
      if (s.how === 'forever') { for (;;) { const r = handle(await once()); if (r === 'break') return null; if (r) return r; } }
      if (s.how === 'times') { const n = this.num(await this.ev(s.e, c)); for (let i = 0; i < n; i++) { const r = handle(await once()); if (r === 'break') return null; if (r) return r; } return null; }
      if (s.how === 'while' || s.how === 'until') {
        for (;;) { const v = this.bool(await this.ev(s.e, c)); if (s.how === 'while' ? !v : v) return null; const r = handle(await once()); if (r === 'break') return null; if (r) return r; }
      }
      const a = Math.trunc(this.num(await this.ev(s.a, c))), b = Math.trunc(this.num(await this.ev(s.b, c)));
      for (let i = a; s.down ? i >= b : i <= b; i += s.down ? -1 : 1) {
        this.setVar(c, s.v, i);
        const r = handle(await once()); if (r === 'break') return null; if (r) return r;
        const iv = this.getVar(c, s.v); if (isNum(iv)) i = Math.trunc(this.num(iv));
      }
      return null;
    }
    fileName(name) {
      if (/(^|[\/\\:])\.\.([\/\\:]|$)/.test(name) || /^[\/\\]/.test(name) || /^[A-Za-z]:/.test(name)) throw new HTError(`Can't open "${name}": web stacks can only use files in their own folder (or ones the user picks).`);
      return name;
    }

    // ---- going places
    async goDest(d, c) {
      if (d.k === 'kw') {
        if (d.v === 'home') { await this.goStack(null, null, true); return; }
        if (d.v === 'help') return;
        if (d.v === 'back') { const card = this.recent.pop(); if (card && this.st.cards.includes(card)) { this.forth.push(this.card()); await this.goCard(card, true); } return; }
        if (d.v === 'forth') { const card = this.forth.pop(); if (card && this.st.cards.includes(card)) await this.goCard(card); return; }
      }
      if (d.k === 'stack') { const name = this.s(await this.ev(d.e, c)); if (name.toLowerCase() !== (this.st.stack.props.name || '').toLowerCase()) await this.goStack(name, null); return; }
      if (d.k === 'expr') {
        const v = this.s(await this.ev(d.e, c)).trim();
        if (isInt(v)) { const card = this.st.cards[+v - 1]; if (card) await this.goCard(card); else this.result = 'No such card.'; return; }
        const p = new Parser([{ n: 0, toks: lexLine(v).toks }]); p.eat('to');
        let dd; try { dd = p.dest(); } catch (_) { dd = null; }
        if (!dd || dd.k === 'expr') { this.result = 'No such card.'; return; }
        return this.goDest(dd, c);
      }
      let t;
      try { t = await this.resolve(d.o, c); } catch (e) { if (!(e instanceof HTError)) throw e; this.result = d.o.type === 'bg' ? 'No such background.' : 'No such card.'; return; }
      if (t.type === 'xcard') { await this.goStack(t.stack, { by: t.by, v: t.v }); return; }
      if (t.type === 'stack') { if (t.ext) await this.goStack(t.ext, null); return; }
      if (t.type === 'bg') { const card = this.st.cards.find(x => +x.props.background === t.bg.id); if (card) await this.goCard(card); return; }
      if (t.type === 'card') { await this.goCard(t.card); return; }
      throw new HTError("Can't go to that.");
    }
    // another stack (spec §8): the host fetches and parses it; closeCard, closeBackground, closeStack go to the old
    // stack and openStack, openBackground, openCard to the new one. A missing stack sets the result.
    async goStack(name, spec, home) {
      const st = await this.call('loadStack', name, !!home);
      if (!st) { this.result = home ? 'No home stack.' : `Can't find stack "${name}".`; return; }
      const from = this.card();
      await this.msgTo('closeCard', from); await this.msgTo('closeBackground', from); await this.send('closeStack', [], { type: 'card', card: from });
      this.st = st; this.cache = new Map(); this.recent = []; this.forth = []; this.pushed = []; this.found = null; this.sel = null;
      this.cur = 0;
      if (spec) {
        const L = st.cards, v = spec.v; let i = -1;
        if (spec.by === 'id') i = L.findIndex(x => x.id === +v);
        else if (spec.by === 'ord') i = this.ordIndex(v, L.length) - 1;
        else if (spec.by === 'nn') { i = L.findIndex(x => (x.props.name || '').toLowerCase() === String(v).toLowerCase()); if (i < 0 && isInt(v)) i = +v - 1; }
        if (i >= 0 && i < L.length) this.cur = i; else this.result = 'No such card.';
      }
      await this.showCard();
      const card = { type: 'card', card: this.card() };
      await this.send('openStack', [], card); await this.send('openBackground', [], card); await this.send('openCard', [], card);
    }
    goHome() { return this.top(() => this.goStack(null, null, true)); }
    async msgTo(name, card) { if (this.gp.lockmessages !== true && this.gp.lockmessages !== 'true') await this.send(name, [], { type: 'card', card }); }
    async goCard(card, noHist) {
      const from = this.card(); if (card === from) { this.visualQ = []; return; }
      const fbg = this.bgOf(from), tbg = this.bgOf(card);
      await this.msgTo('closeCard', from);
      if (fbg !== tbg) await this.msgTo('closeBackground', from);
      const i = this.st.cards.indexOf(card); if (i < 0) return;
      if (!noHist) { this.recent.push(from); if (this.recent.length > 100) this.recent.shift(); }
      this.cur = i; await this.showCard();
      if (fbg !== tbg) await this.msgTo('openBackground', card);
      await this.msgTo('openCard', card);
    }
    async showCard() {
      const fx = this.visualQ; this.visualQ = [];
      if (this.gp.lockscreen) return;
      if (this.host.show) await this.call('show', fx); else this.call('redraw');
    }
    async builtinMsg(name, args, target) {
      if (name === 'domenu') { await this.menu(this.s(args[0])); return true; }
      if (name === 'arrowkey') {
        const k = this.s(args[0]).toLowerCase(), n = this.st.cards.length;
        if (k === 'left') await this.goCard(this.st.cards[(this.cur - 1 + n) % n]);
        else if (k === 'right') await this.goCard(this.st.cards[(this.cur + 1) % n]);
        else if (k === 'down') await this.goDest({ k: 'kw', v: 'back' }, null);
        else if (k === 'up') await this.goDest({ k: 'kw', v: 'forth' }, null);
        return true;
      }
      return SYSMSG.has(name);
    }
    async menu(item) {
      const k = item.replace(/(\xC9|\.\.\.)$/, '').trim().toLowerCase(), n = this.st.cards.length;
      switch (k) {
        case 'next': return this.goCard(this.st.cards[(this.cur + 1) % n]);
        case 'prev': case 'previous': return this.goCard(this.st.cards[(this.cur - 1 + n) % n]);
        case 'first': return this.goCard(this.st.cards[0]);
        case 'last': return this.goCard(this.st.cards[n - 1]);
        case 'back': return this.goDest({ k: 'kw', v: 'back' }, null);
        case 'home': return this.goStack(null, null, true);
        case 'new card': return this.newCard();
        case 'delete card': return this.deleteCard();
        case 'new button': case 'new field': return this.newPart(k === 'new button' ? 'button' : 'field');
      }
      this.result = `Can't use the menu item "${item}" in a web stack.`;
    }
    async newCard() {
      const from = this.card(), bg = this.bgOf(from), id = Math.max(0, ...this.st.cards.map(x => x.id)) + 1;
      const card = { kind: 'card', id, props: { background: String(bg ? bg.id : 0) }, script: '', parts: [], bgtext: {}, bghilite: new Set() };
      await this.msgTo('closeCard', from);
      this.st.cards.splice(this.cur + 1, 0, card); this.recent.push(from); this.cur++;
      await this.showCard();
      await this.msgTo('newCard', card); await this.msgTo('openCard', card);
    }
    // Ref: New Button makes a button named "New Button", New Field a transparent field, both in the center of the
    // card window. 🔶 The default sizes are not measured; these are guesses in HyperCard units.
    async newPart(kind) {
      const card = this.card(), owner = bool(this.gp.editbkgnd, false) ? this.bgOf(card) || card : card;
      const id = Math.max(0, ...owner.parts.map(p => p.id)) + 1;
      const p = kind === 'button'
        ? { kind, id, props: { name: 'New Button', rect: '130,92,190,108', style: 'roundRect', showname: 'true', autohilite: 'true' }, script: '', text: '' }
        : { kind, id, props: { rect: '110,70,210,130', style: 'transparent' }, script: '', text: '' };
      owner.parts.push(p); this.dirty();
      await this.send(kind === 'button' ? 'newButton' : 'newField', [], { type: kind, part: p, layer: owner === card ? 'card' : 'bg', card });
    }
    async deleteCard() {
      const card = this.card();
      if (this.st.cards.length < 2 || bool(card.props.cantdelete, false)) { this.result = "Can't delete that card."; return; }
      await this.msgTo('deleteCard', card); await this.msgTo('closeCard', card);
      const i = this.st.cards.indexOf(card); this.st.cards.splice(i, 1);
      this.cur = Math.min(i, this.st.cards.length - 1);
      await this.showCard(); await this.msgTo('openCard', this.card());
    }
    cardFields(card) {
      const out = [], bg = this.bgOf(card);
      if (bg) for (const p of bg.parts) if (p.kind === 'field') out.push({ type: 'field', part: p, layer: 'bg', card });
      for (const p of card.parts) if (p.kind === 'field') out.push({ type: 'field', part: p, layer: 'card', card });
      return out;
    }
    async find(mode, text, only) {
      const q = text.toLowerCase().trim(); if (!q) return;
      const words = q.split(/\s+/), n = this.st.cards.length;
      const again = this.found && this.found.q === q && this.found.card === this.card();
      for (let k = again ? 1 : 0; k <= n; k++) {
        const card = this.st.cards[(this.cur + k) % n];
        if (bool(card.props.dontsearch, false) || bool((this.bgOf(card) || { props: {} }).props.dontsearch, false)) continue;
        const flds = this.cardFields(card).filter(d => !bool(d.part.props.dontsearch, false) && (!only || d.part === only.part));
        let hit = null;
        for (const d of flds) {
          const t = this.getText(d), tl = t.toLowerCase(); let at = -1, len = 0;
          if (mode === 'string' || mode === 'chars') { at = tl.indexOf(q); len = q.length; }
          else if (mode === 'whole') { const m = new RegExp('(^|[^a-z0-9])(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![a-z0-9])').exec(tl); if (m) { at = m.index + m[1].length; len = q.length; } }
          else {
            const all = mode === 'normal' ? words.every(w => new RegExp('(^|\\s)' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(this.cardFields(card).map(x => this.getText(x).toLowerCase()).join('\n')))
              : words.every(w => new RegExp('(^|\\s)' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=\\s|$)').test(tl));
            if (all) { const m = new RegExp('(^|\\s)' + words[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).exec(tl); if (m) { at = m.index + m[1].length; len = words[0].length; } }
          }
          if (at >= 0) { hit = { d, at, len, t }; break; }
        }
        if (hit) {
          const line = hit.t.slice(0, hit.at).split(CR).length, fname = this.nameOf(hit.d, null);
          this.found = { q, card, foundtext: hit.t.substr(hit.at, hit.len), foundfield: fname, foundline: `line ${line} of ${fname}`, foundchunk: `char ${hit.at + 1} to ${hit.at + hit.len} of ${fname}` };
          if (card !== this.card()) await this.goCard(card);
          return;
        }
      }
      this.found = null; this.result = 'Not found';
    }
    async sortCards(s, c) {
      const cards = this.st.cards, here = this.card(), keyed = [];
      try {
        for (let i = 0; i < cards.length; i++) { this.cur = i; keyed.push({ card: cards[i], i, k: this.s(await this.ev(s.e, c)) }); }
      } finally { this.cur = cards.indexOf(here); }
      const key = x => s.typ === 'numeric' ? (isNum(x.k) ? this.num(x.k) : Infinity) : s.typ === 'datetime' ? (this.parseDate(x.k) || 0) : x.k.toLowerCase();
      keyed.sort((a, b) => { const ka = key(a), kb = key(b); const r = s.typ === 'international' ? a.k.localeCompare(b.k) : ka < kb ? -1 : ka > kb ? 1 : 0; return (s.dir === 'descending' ? -r : r) || a.i - b.i; });
      cards.splice(0, cards.length, ...keyed.map(x => x.card)); this.cur = cards.indexOf(here); this.dirty();
    }

    // ---- events from the host (card coordinates)
    async top(fn) {
      if (this.busy) return;
      this.busy++;
      try { await fn(); }
      catch (e) {
        if (!(e instanceof Abort)) {
          if (e instanceof HTError) this.call('error', `${e.message}` + (e.where ? `\n(${e.where}${e.line ? ', script line ' + e.line : ''})` : ''));
          else { this.call('error', 'Internal error: ' + (e && e.message)); if (typeof console !== 'undefined') console.error(e); }
        }
      } finally {
        this.busy--; this.depth = 0;
        // at idle HyperCard unlocks the screen and resets the itemDelimiter (ERS) and lockMessages
        this.gp.lockscreen = false; this.gp.lockmessages = false; this.gp.itemdelimiter = ',';
        this.call('redraw');
        if (this.queue.length && !this.draining) setTimeout(() => this.drain(), 0);
      }
    }
    async drain() {
      this.draining = true;
      try { while (this.queue.length && !this.busy) { const [t, h, v] = this.queue.shift(); if (t === 'down') await this.mouseDown(h, v); else await this.mouseUp(h, v); } }
      finally { this.draining = false; }
    }
    start() { return this.top(async () => { const card = { type: 'card', card: this.card() }; await this.send('openStack', [], card); await this.send('openBackground', [], card); await this.send('openCard', [], card); }); }
    stop() { return this.top(async () => { const card = { type: 'card', card: this.card() }; await this.send('closeCard', [], card); await this.send('closeBackground', [], card); await this.send('closeStack', [], card); for (const f of this.files.values()) if (f.dirty) await this.call('writeFile', f.name, f.data); this.files.clear(); }); }
    goIndex(i) { return this.top(() => this.goCard(this.st.cards[((i % this.st.cards.length) + this.st.cards.length) % this.st.cards.length])); }
    partAt(h, v) {
      const card = this.card(), bg = this.bgOf(card);
      const hit = p => { if (!bool(p.props.visible, true)) return false; const [l, t, r, b] = rectOf(p); return h >= l && h < r && v >= t && v < b; };
      for (let i = card.parts.length - 1; i >= 0; i--) if (hit(card.parts[i])) return { type: card.parts[i].kind, part: card.parts[i], layer: 'card', card };
      if (bg) for (let i = bg.parts.length - 1; i >= 0; i--) if (hit(bg.parts[i])) return { type: bg.parts[i].kind, part: bg.parts[i], layer: 'bg', card };
      return { type: 'card', card };
    }
    isPlainAuto(d) { if (d.type !== 'button') return false; const st = String(d.part.props.style || '').toLowerCase(); return d.type === 'button' && bool(d.part.props.autohilite, false) && st !== 'checkbox' && st !== 'radiobutton' && !(+(d.part.props.family || 0)); }
    mouseMove(h, v) {
      this.mouse.h = h; this.mouse.v = v;
      const d = this.down; if (!d || !this.isPlainAuto(d)) return;
      const inside = this.same(this.partAt(h, v), d); if (inside !== this.hilite(d)) this.setHilite(d, inside);
    }
    same(a, b) { return a.type === b.type && (a.part ? a.part === b.part : a.card === b.card); }
    mouseDown(h, v) {
      this.mouse.h = h; this.mouse.v = v; this.mouse.down = true; this.mouse.ch = h; this.mouse.cv = v; this.mouse.clicked = true;
      if (this.busy) { if (this.queue.length < 20) this.queue.push(['down', h, v]); return; } // HyperCard keeps clicks made while a script runs
      const d = this.partAt(h, v);
      if (d.type === 'button' && !bool(d.part.props.enabled, true)) return;
      if (d.type === 'field' && !bool(d.part.props.locktext, false)) return; // typing into fields is not done yet
      this.down = d; this.clickText = d.type === 'field' ? this.clickInField(d, v) : null;
      if (this.isPlainAuto(d)) this.setHilite(d, true);
      return this.top(() => this.send('mouseDown', [], d));
    }
    async mouseUp(h, v) {
      this.mouse.h = h; this.mouse.v = v; this.mouse.down = false;
      if (this.busy) { if (this.queue.length < 20) this.queue.push(['up', h, v]); return; }
      const d = this.down; this.down = null; if (!d) return;
      const inside = this.same(this.partAt(h, v), d);
      if (d.type === 'button' && bool(d.part.props.autohilite, false)) {
        const st = String(d.part.props.style || '').toLowerCase(), fam = +(d.part.props.family || 0);
        if (fam && inside) { for (const b of this.familyButtons(d.card, fam)) this.setHilite(b, this.same(b, d)); }
        else if (st === 'checkbox') { if (inside) this.setHilite(d, !this.hilite(d)); }
        else if (st === 'radiobutton') { if (inside) this.setHilite(d, true); }
        else this.setHilite(d, false);
        this.call('redraw', true); // the button is drawn released before its script runs
      }
      if (inside) await this.top(() => this.send('mouseUp', [], d));
    }
    // clickLine / clickChunk by text line (wrapping not counted, as the ERS says) 🔶 lines are found by row height only
    clickInField(d, v) {
      const [, t] = rectOf(d.part), lh = +(d.part.props.textheight || 9), wide = bool(d.part.props.widemargins, false);
      const n = Math.max(1, Math.floor((v - t - (wide ? 3 : 0) + +(d.part.props.scroll || 0)) / lh) + 1), name = this.nameOf(d, null);
      return { clickline: `line ${n} of ${name}`, clickchunk: '' };
    }
    clickAt(h, v) {
      const d = this.partAt(h, v); this.mouse.ch = h; this.mouse.cv = v;
      if (d.type === 'button' && bool(d.part.props.autohilite, false)) {
        const st = String(d.part.props.style || '').toLowerCase(), fam = +(d.part.props.family || 0);
        if (fam) for (const b of this.familyButtons(d.card, fam)) this.setHilite(b, this.same(b, d));
        else if (st === 'checkbox') this.setHilite(d, !this.hilite(d)); else if (st === 'radiobutton') this.setHilite(d, true);
      }
      return (async () => { await this.send('mouseDown', [], d); await this.send('mouseUp', [], d); })();
    }
    key(name) {
      if (name === 'abort') { if (this.busy) this.abort = true; return; }
      if (this.busy) return;
      if (['left', 'right', 'up', 'down'].includes(name)) return this.top(() => this.send('arrowKey', [name], { type: 'card', card: this.card() }));
    }
    idle() {
      if (this.busy) return;
      const card = { type: 'card', card: this.card() };
      if (this.path(card).some(d => this.handlers(d)['m:idle'])) return this.top(() => this.send('idle', [], card));
    }
  }

  root.HYPERTALK = { Interp, compile, compileBody, lexScript, lexLine, Parser, HTError, fmtNum };
})(typeof window !== 'undefined' ? window : globalThis);
