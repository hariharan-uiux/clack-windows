import type { Settings, SoundFile, SoundPacks } from './types';
import { keyPosition } from './keymap';

type Kind = 'down' | 'up';
type Pack = { down: AudioBuffer[]; up: AudioBuffer[] };

/**
 * Web Audio playback engine.
 *
 * Signal path: sample -> per-voice gain -> stereo panner -> (dry + reverb send) -> master -> limiter.
 * Buffers are decoded once at startup and reused, so a keystroke only costs one
 * AudioBufferSourceNode allocation (~1 ms) instead of a disk read.
 */
export class ClackEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private meterBuffer: Uint8Array<ArrayBuffer> | null = null;
  private packs: Record<string, Pack> = {};
  private settings: Settings;
  private lastPick: Record<string, number> = {};
  private loadError: string | null = null;

  constructor(settings: Settings) {
    this.settings = settings;
  }

  get error() {
    return this.loadError;
  }

  get sampleCount() {
    return Object.values(this.packs).reduce((sum, pack) => sum + pack.down.length + pack.up.length, 0);
  }

  setSettings(settings: Settings) {
    this.settings = settings;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(settings.volume, this.ctx.currentTime, 0.01);
    }
  }

  async load(files: SoundPacks) {
    try {
      this.ensureContext();
      const ctx = this.ctx!;
      const decoded: Record<string, Pack> = {};

      for (const [profileId, list] of Object.entries(files)) {
        const pack: Pack = { down: [], up: [] };
        for (const file of list as SoundFile[]) {
          try {
            // decodeAudioData detaches the buffer, so hand it a copy.
            const buffer = await ctx.decodeAudioData(file.bytes.slice(0));
            pack[file.kind].push(buffer);
          } catch (error) {
            console.warn('[clack] could not decode', file.name, error);
          }
        }
        if (pack.down.length || pack.up.length) decoded[profileId] = pack;
      }

      this.packs = decoded;
      if (!Object.keys(decoded).length) this.loadError = 'No sound packs found next to the app.';
    } catch (error) {
      this.loadError = String(error);
    }
  }

  async resume() {
    this.ensureContext();
    if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume();
  }

  play(kind: Kind, keycode: number) {
    const ctx = this.ctx;
    const pack = this.packs[this.settings.profile];
    if (!ctx || !pack || !this.master) return;
    if (ctx.state === 'suspended') void ctx.resume();

    const pool = kind === 'up' ? pack.up : pack.down;
    if (!pool.length) return;

    const pickKey = `${this.settings.profile}:${kind}`;
    let index = 0;
    if (this.settings.randomize && pool.length > 1) {
      const previous = this.lastPick[pickKey] ?? -1;
      do {
        index = Math.floor(Math.random() * pool.length);
      } while (index === previous);
    }
    this.lastPick[pickKey] = index;

    const buffer = pool[index];
    const pitch = 1 + (Math.random() * 2 - 1) * (this.settings.pitchRange / 100);
    const pan = (keyPosition(keycode) * 2 - 1) * this.settings.stereoWidth;
    const trim = kind === 'up' ? 0.72 : 1;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = pitch;

    const voice = ctx.createGain();
    voice.gain.value = trim * (0.94 + Math.random() * 0.06);

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));

    source.connect(voice);
    voice.connect(panner);
    panner.connect(this.dry!);
    panner.connect(this.wet!);
    source.start();
  }

  /** Play one sample from a specific profile without switching to it. */
  preview(profileId: string) {
    const pack = this.packs[profileId];
    if (!pack || !this.ctx) return;
    const ctx = this.ctx;
    const pool = pack.down;
    if (!pool.length) return;

    const buffer = pool[Math.floor(Math.random() * pool.length)];
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * (this.settings.pitchRange / 100);
    const voice = ctx.createGain();
    voice.gain.value = 1;
    const panner = ctx.createStereoPanner();
    panner.pan.value = 0;
    source.connect(voice).connect(panner);
    panner.connect(this.dry!);
    panner.connect(this.wet!);
    source.start();
  }

  /** Peak level 0..1 for the UI meter. */
  level(): number {
    if (!this.analyser || !this.meterBuffer) return 0;
    this.analyser.getByteTimeDomainData(this.meterBuffer);
    let peak = 0;
    for (let i = 0; i < this.meterBuffer.length; i += 1) {
      const value = Math.abs(this.meterBuffer[i] - 128) / 128;
      if (value > peak) peak = value;
    }
    return Math.min(1, peak * 1.6);
  }

  private ensureContext() {
    if (this.ctx) return;
    const ctx = new AudioContext({ latencyHint: 'interactive' });

    const master = ctx.createGain();
    master.gain.value = this.settings.volume;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;

    const dry = ctx.createGain();
    dry.gain.value = 1;

    const wet = ctx.createGain();
    wet.gain.value = 0.18;

    const reverb = ctx.createConvolver();
    reverb.buffer = this.impulse(ctx, 0.42, 2.6);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;

    dry.connect(master);
    wet.connect(reverb);
    reverb.connect(master);
    master.connect(limiter);
    limiter.connect(analyser);
    analyser.connect(ctx.destination);

    this.ctx = ctx;
    this.master = master;
    this.dry = dry;
    this.wet = wet;
    this.analyser = analyser;
    this.meterBuffer = new Uint8Array(analyser.fftSize);
  }

  /** Short synthetic room impulse so the clack sits in a space, not on a dry bus. */
  private impulse(ctx: AudioContext, seconds: number, decay: number) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        const t = i / length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * 0.6;
      }
    }
    return buffer;
  }
}
