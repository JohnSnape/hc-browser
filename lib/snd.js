/* snd.js — sound conversion for HyperCard IIGS.
 *
 * .snd = raw 8-bit unsigned samples (128 = silence) at 26,320 Hz, mono.
 *  - 26.32 kHz and middle C (261.63 Hz) are what HyperCard IIGS assumes for a sampled sound (TN.HCGS.003).
 *  - Sample value $00 is the Ensoniq DOC's end-of-sample marker, so it never appears in sound data; it is
 *    clamped to $01.
 * Classic script; uses the browser's Web Audio API for decoding and resampling.
 */
(function (root) {
  'use strict';
  const RATE = 26320;

  // Decode any format the browser understands (WAV, AIFF, MP3, OGG, M4A...) and resample to 26,320 Hz mono.
  async function toMono26k(arrayBuffer) {
    const AC = root.AudioContext || root.webkitAudioContext;
    const ac = new AC();
    let decoded;
    try { decoded = await ac.decodeAudioData(arrayBuffer.slice(0)); } finally { ac.close && ac.close(); }
    const frames = Math.max(1, Math.ceil(decoded.duration * RATE));
    const off = new OfflineAudioContext(1, frames, RATE); // one output channel: Web Audio down-mixes to mono
    const src = off.createBufferSource();
    src.buffer = decoded; src.connect(off.destination); src.start();
    const out = await off.startRendering();
    return { samples: out.getChannelData(0), sourceRate: decoded.sampleRate, sourceChannels: decoded.numberOfChannels, duration: decoded.duration };
  }

  /* to8bit(float32, opts) -> Uint8Array. opts.normalize: scale so the loudest peak is near full scale.
   * opts.trim: drop leading/trailing near-silence. */
  function to8bit(f, opts) {
    opts = opts || {};
    let a = 0, b = f.length;
    if (opts.trim) {
      const th = 0.01;
      while (a < b && Math.abs(f[a]) < th) a++;
      while (b > a && Math.abs(f[b - 1]) < th) b--;
    }
    let peak = 0;
    for (let i = a; i < b; i++) peak = Math.max(peak, Math.abs(f[i]));
    const gain = opts.normalize && peak > 0 ? 0.98 / peak : 1;
    const out = new Uint8Array(Math.max(0, b - a));
    for (let i = a; i < b; i++) {
      let v = Math.round(128 + f[i] * gain * 127);
      out[i - a] = v < 1 ? 1 : v > 255 ? 255 : v; // 0 is reserved (end of sample)
    }
    return out;
  }

  // Play 8-bit .snd data in the browser, as it would sound at the IIGS's base rate.
  function play(bytes) {
    const AC = root.AudioContext || root.webkitAudioContext;
    const ac = new AC();
    const buf = ac.createBuffer(1, Math.max(1, bytes.length), RATE);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < bytes.length; i++) ch[i] = (bytes[i] - 128) / 128;
    const s = ac.createBufferSource(); s.buffer = buf; s.connect(ac.destination); s.start();
    s.onended = () => ac.close && ac.close();
    return s;
  }

  root.SND = { RATE, toMono26k, to8bit, play };
})(typeof window !== 'undefined' ? window : globalThis);
