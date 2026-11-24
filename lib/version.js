/* version.js — Apple IIGS version resources ($8029 rVersion), for the browser and Node.
 *
 * Layout (Apple IIGS Technical Note #76; long version from Technical Note #100; checked on 71 real resources,
 * every one of which ends exactly after its two strings):
 *   +0 long version, least significant byte first:
 *        byte 0 = non-final release number (BCD)   byte 1 = stage: $20 development, $40 alpha, $60 beta,
 *        $80 final, $A0 release   byte 2 = minor (high nibble, BCD) | bug (low nibble, BCD)   byte 3 = major (BCD)
 *   +4 country/region code word (0 = US)
 *   +6 Pascal string: the name ("short version" in the template, e.g. "HyperCard IIGS")
 *   then a Pascal string: more information (the copyright line)
 * Files show the resource with ID 1 (e.g. in the Finder); other IDs are reserved by Apple.
 * Classic script: sets globalThis.VERSION.
 */
(function (root) {
  'use strict';
  const STAGES = { 0x20: 'development', 0x40: 'alpha', 0x60: 'beta', 0x80: 'final', 0xA0: 'release' };
  const STAGE_LETTER = { 0x20: 'd', 0x40: 'a', 0x60: 'b', 0x80: 'f', 0xA0: '' };
  const COUNTRIES = ['US', 'France', 'Britain', 'Germany', 'Italy', 'Netherlands', 'Belgium/Luxembourg', 'Sweden', 'Spain', 'Denmark', 'Portugal',
    'French Canada', 'Norway', 'Israel', 'Japan', 'Australia', 'Arabia', 'Finland', 'French Swiss', 'German Swiss', 'Greece', 'Iceland', 'Malta',
    'Cyprus', 'Turkey', 'Yugoslavia'];
  const bcd = b => (b >> 4) * 10 + (b & 15), toBcd = n => ((Math.floor(n / 10) % 10) << 4) | (n % 10);
  const pstr = (b, o) => { const n = b[o]; return { s: String.fromCharCode(...b.subarray(o + 1, o + 1 + n)), next: o + 1 + n }; };

  function parse(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b.length < 8) throw new Error('Not a version resource (too short).');
    const a = pstr(b, 6), c = pstr(b, a.next);
    if (c.next > b.length) throw new Error('Not a version resource (strings run past the end).');
    return { major: bcd(b[3]), minor: b[2] >> 4, bug: b[2] & 15, stage: b[1], release: bcd(b[0]), country: b[4] | b[5] << 8,
      name: a.s, info: c.s, extra: b.slice(c.next) };
  }
  function write(v) {
    const enc = s => { const t = String(s).slice(0, 255); return [t.length, ...[...t].map(ch => ch.charCodeAt(0) & 255)]; };
    const head = [toBcd(v.stage === 0xA0 ? 0 : v.release || 0), v.stage, ((v.minor & 15) << 4) | (v.bug & 15), toBcd(v.major), v.country & 255, (v.country >> 8) & 255];
    return new Uint8Array([...head, ...enc(v.name || ''), ...enc(v.info || ''), ...(v.extra || [])]);
  }
  // how version numbers are usually written: 6.0.4, 2.0d1, 1.0.7b1 (bug digit only when not 0)
  const format = v => v.major + '.' + v.minor + (v.bug ? '.' + v.bug : '') + STAGE_LETTER[v.stage] + (v.stage !== 0xA0 && v.release ? v.release : '');
  root.VERSION = { parse, write, format, STAGES, COUNTRIES };
})(typeof window !== 'undefined' ? window : globalThis);
