'use strict';

/**
 * Generates the mouse-click sample packs in `sounds/mouse/<pack>/`.
 *
 * The keyboard packs are real recordings; there is no equivalent free set of
 * mouse recordings, so these clicks are synthesised: a short filtered noise
 * transient (the plastic tick) plus a damped low sine (the button body).
 * Output matches the keyboard packs: 16-bit stereo WAV, 44.1 kHz.
 *
 *   node scripts/gen-mouse-sounds.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sounds', 'mouse');
const RATE = 44100;

/** pack -> character of the click. */
const PACKS = {
  tactile: {
    // crisp plastic click
    body: 2400, q: 3.2, tick: 0.006, thump: 190, thumpDecay: 0.016, level: 0.92, release: 0.7,
  },
  soft: {
    // damped office mouse
    body: 1250, q: 2.1, tick: 0.009, thump: 145, thumpDecay: 0.028, level: 0.78, release: 0.62,
  },
  heavy: {
    // deep, weighty button
    body: 900, q: 2.6, tick: 0.013, thump: 100, thumpDecay: 0.042, level: 0.95, release: 0.66,
  },
  silent: {
    // barely there
    body: 1900, q: 4, tick: 0.003, thump: 160, thumpDecay: 0.012, level: 0.4, release: 0.5,
  },
};

const TAKES = { down: 4, up: 3 };

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RBJ band-pass biquad, run over the whole buffer. */
function bandpass(signal, freq, q, rate) {
  const w0 = (2 * Math.PI * freq) / rate;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const b2 = -alpha / a0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;

  const out = new Float64Array(signal.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < signal.length; i += 1) {
    const x0 = signal[i];
    const y0 = b0 * x0 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    out[i] = y0;
  }
  return out;
}

function render(pack, kind, take) {
  const random = mulberry32(take * 7919 + (kind === 'up' ? 104729 : 0) + pack.body);
  const isUp = kind === 'up';
  const seconds = isUp ? 0.055 : 0.075;
  const length = Math.floor(RATE * seconds);

  // A take drifts a little in pitch and level, like repeated real clicks.
  const pitch = 1 + (random() * 2 - 1) * 0.09;
  const bodyFreq = pack.body * pitch * (isUp ? 1.08 : 1);
  const thumpFreq = pack.thump * pitch;
  const level = pack.level * (isUp ? pack.release : 1) * (0.92 + random() * 0.16);
  const tickDecay = pack.tick * (0.85 + random() * 0.3) * (isUp ? 0.85 : 1);

  // Transient: white noise through a resonant band-pass, exponential decay.
  const noise = new Float64Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / RATE;
    noise[i] = (random() * 2 - 1) * Math.exp(-t / tickDecay);
  }
  const tick = bandpass(noise, bodyFreq, pack.q, RATE);

  // Body: low sine with a fast downward pitch bend, gives the "thock".
  const thump = new Float64Array(length);
  let phase = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / RATE;
    const freq = thumpFreq * (1 + 0.35 * Math.exp(-t / 0.006));
    phase += (2 * Math.PI * freq) / RATE;
    thump[i] = Math.sin(phase) * Math.exp(-t / pack.thumpDecay);
  }

  const mix = new Float64Array(length);
  let peak = 0;
  for (let i = 0; i < length; i += 1) {
    mix[i] = tick[i] * 1.6 + thump[i] * 0.55;
    peak = Math.max(peak, Math.abs(mix[i]));
  }

  const scale = peak > 0 ? Math.min(level, 0.9) / peak : 0;
  const fade = Math.floor(RATE * 0.004);
  const data = new Float64Array(length);
  for (let i = 0; i < length; i += 1) {
    const tail = Math.min(1, (length - i) / fade);
    data[i] = mix[i] * scale * tail;
  }
  return data;
}

function wav(samples) {
  const channels = 2;
  const bytes = samples.length * channels * 2;
  const buffer = Buffer.alloc(44 + bytes);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + bytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(RATE, 24);
  buffer.writeUInt32LE(RATE * channels * 2, 28);
  buffer.writeUInt16LE(channels * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(bytes, 40);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    const pcm = Math.round(value * 32767);
    buffer.writeInt16LE(pcm, offset);
    buffer.writeInt16LE(pcm, offset + 2);
    offset += 4;
  }
  return buffer;
}

let files = 0;
for (const [name, pack] of Object.entries(PACKS)) {
  const dir = path.join(ROOT, name);
  mkdirSync(dir, { recursive: true });
  for (const [kind, count] of Object.entries(TAKES)) {
    for (let take = 1; take <= count; take += 1) {
      const samples = render(pack, kind, take);
      writeFileSync(path.join(dir, `${kind}-${take}.wav`), wav(samples));
      files += 1;
    }
  }
}

console.log(`wrote ${files} mouse samples to ${ROOT}`);
