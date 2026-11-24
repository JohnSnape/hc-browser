/* sound.js — Apple IIGS sampled sounds ($8024 rSoundSample), for the browser and Node.
 *
 * Resource (Apple IIGS Technical Note #76; checked on HyperCard IIGS's own three sounds):
 *   +0 format (0)   +2 wave size in 256-byte pages   +4 relative pitch   +6 stereo channel (low nibble)
 *   +8 sample rate in Hz   +10 8-bit unsigned samples (128 = silence) to the end of the resource.
 * HyperCard's sounds: rate 22,255 Hz; the page count is the data length rounded DOWN to pages (Harpsichord:
 *   5,290 bytes, 20 pages); the data never contains $00 (the Ensoniq DOC's end-of-sample mark).
 *   We write data padded with $80 to whole pages, so both readings of the page count agree.
 * Relative pitch (HyperCard IIGS Technical Note #3): offset = 3072 x log2(r), r = (261.63 / Fw) x (Fs / 26,320),
 *   Fw = the pitch the sample sounds at, Fs = its sample rate. Negative offsets are stored as |offset| + $8000.
 *   High byte = semitones, low byte = 1/256 semitone. HyperCard plays middle C at 26,320 x 2^(offset/3072)
 *   samples per second, and a note of frequency f at that rate x f / 261.63.
 * Classic script: sets globalThis.SOUND.
 */
(function (root) {
  'use strict';
  const BASE = 26320, MIDDLE_C = 261.63;

  function parse(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b.length < 10) throw new Error('Not an IIGS sampled sound (too short).');
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { format: dv.getUint16(0, true), pages: dv.getUint16(2, true), pitch: dv.getUint16(4, true),
      stereo: dv.getUint16(6, true), rate: dv.getUint16(8, true), data: b.slice(10) };
  }
  // data: 8-bit samples. $00 is replaced by $01; the data is padded with $80 to whole 256-byte pages.
  function write(s) {
    const n = Math.max(256, Math.ceil(s.data.length / 256) * 256), out = new Uint8Array(10 + n).fill(0x80, 10);
    const dv = new DataView(out.buffer);
    dv.setUint16(0, 0, true); dv.setUint16(2, n / 256, true); dv.setUint16(4, s.pitch & 0xFFFF, true);
    dv.setUint16(6, (s.stereo || 0) & 0xFFFF, true); dv.setUint16(8, (s.rate == null ? BASE : s.rate) & 0xFFFF, true);
    for (let i = 0; i < s.data.length; i++) out[10 + i] = s.data[i] || 1;
    return out;
  }
  // write keeping the exact bytes of a sound that was read and not changed (page count, length, rate)
  function writeExact(s) {
    const out = new Uint8Array(10 + s.data.length), dv = new DataView(out.buffer);
    [s.format || 0, s.pages, s.pitch, s.stereo || 0, s.rate].forEach((v, i) => dv.setUint16(2 * i, v & 0xFFFF, true));
    out.set(s.data, 10); return out;
  }
  const signed = p => (p & 0x8000) ? -(p & 0x7FFF) : p;
  const encodePitch = off => { const o = Math.round(off); return o < 0 ? (Math.min(0x7FFF, -o) | 0x8000) : Math.min(0x7FFF, o); };
  // the relative pitch for a sample of rate fs that sounds at fw Hz (fw = 261.63 for "no definite pitch")
  const pitchFor = (fw, fs) => encodePitch(3072 * Math.log2((MIDDLE_C / fw) * (fs / BASE)));
  // samples per second HyperCard plays at for a note of frequency f (default middle C)
  const playRate = (pitch, f) => BASE * Math.pow(2, signed(pitch) / 3072) * ((f || MIDDLE_C) / MIDDLE_C);
  // note name like c, c#, eb, g5 -> Hz (octave 4 = middle C's octave)
  function noteHz(name) {
    const m = /^([a-g])([#b]?)(\d?)$/i.exec(name.trim()); if (!m) return null;
    const semis = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    const oct = m[3] ? +m[3] : 4; return MIDDLE_C * Math.pow(2, (semis + (oct - 4) * 12) / 12);
  }
  root.SOUND = { parse, write, writeExact, signed, encodePitch, pitchFor, playRate, noteHz, BASE, MIDDLE_C };
})(typeof window !== 'undefined' ? window : globalThis);
