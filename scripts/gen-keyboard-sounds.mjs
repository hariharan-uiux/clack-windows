'use strict';

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sounds');
const RATE = 44100;

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

const SWITCH_PROFILES = {
  'holy-panda': {
    body: 520,
    q: 2.4,
    tick: 0.008,
    thump: 115,
    thumpDecay: 0.038,
    level: 0.95,
    release: 0.68,
    pingFreq: 0,
  },
  'cherry-blue': {
    body: 3200,
    q: 5.2,
    tick: 0.004,
    thump: 160,
    thumpDecay: 0.022,
    level: 0.96,
    release: 0.72,
    pingFreq: 4200,
  },
  'buckling-spring': {
    body: 420,
    q: 3.5,
    tick: 0.012,
    thump: 90,
    thumpDecay: 0.055,
    level: 0.98,
    release: 0.75,
    pingFreq: 3450,
  },
  'topre': {
    body: 360,
    q: 1.8,
    tick: 0.014,
    thump: 78,
    thumpDecay: 0.048,
    level: 0.88,
    release: 0.60,
    pingFreq: 0,
  },
};

function renderKey(pack, kind, take) {
  const isUp = kind === 'up';
  const random = mulberry32(take * 19937 + (isUp ? 29989 : 0) + pack.body);
  const seconds = isUp ? 0.08 : 0.11;
  const length = Math.floor(RATE * seconds);

  const pitch = 1 + (random() * 2 - 1) * 0.08;
  const bodyFreq = pack.body * pitch * (isUp ? 1.06 : 1);
  const thumpFreq = pack.thump * pitch;
  const level = pack.level * (isUp ? pack.release : 1) * (0.94 + random() * 0.12);
  const tickDecay = pack.tick * (0.9 + random() * 0.2) * (isUp ? 0.85 : 1);

  // Transient: white noise through resonant band-pass
  const noise = new Float64Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / RATE;
    noise[i] = (random() * 2 - 1) * Math.exp(-t / tickDecay);
  }
  const tick = bandpass(noise, bodyFreq, pack.q, RATE);

  // Body: low sine downward bend for bottom-out thock
  const thump = new Float64Array(length);
  let phase = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / RATE;
    const freq = thumpFreq * (1 + 0.4 * Math.exp(-t / 0.008));
    phase += (2 * Math.PI * freq) / RATE;
    thump[i] = Math.sin(phase) * Math.exp(-t / pack.thumpDecay);
  }

  // Metallic spring resonance if configured
  const ping = new Float64Array(length);
  if (pack.pingFreq > 0) {
    let pingPhase = 0;
    const pFreq = pack.pingFreq * pitch;
    for (let i = 0; i < length; i += 1) {
      const t = i / RATE;
      pingPhase += (2 * Math.PI * pFreq) / RATE;
      ping[i] = Math.sin(pingPhase) * Math.exp(-t / 0.035);
    }
  }

  const mix = new Float64Array(length);
  let peak = 0;
  for (let i = 0; i < length; i += 1) {
    mix[i] = tick[i] * 1.5 + thump[i] * 0.7 + (pack.pingFreq > 0 ? ping[i] * 0.35 : 0);
    peak = Math.max(peak, Math.abs(mix[i]));
  }

  const scale = peak > 0 ? Math.min(level, 0.92) / peak : 0;
  const fade = Math.floor(RATE * 0.005);
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

const TAKES = { down: 8, up: 6 };

for (const [id, pack] of Object.entries(SWITCH_PROFILES)) {
  const dir = path.join(ROOT, id);
  mkdirSync(dir, { recursive: true });
  for (let i = 1; i <= TAKES.down; i += 1) {
    const data = renderKey(pack, 'down', i);
    writeFileSync(path.join(dir, `${i}-down.wav`), wav(data));
  }
  for (let i = 1; i <= TAKES.up; i += 1) {
    const data = renderKey(pack, 'up', i);
    writeFileSync(path.join(dir, `${i}-up.wav`), wav(data));
  }
  console.log(`Generated ${TAKES.down + TAKES.up} takes for switch: ${id}`);
}
