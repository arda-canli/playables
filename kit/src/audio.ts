// All sound is synthesised with WebAudio: no audio files, so nothing to download or inline.
// The context is created on the first user gesture, as browsers and ad networks require.

export interface ToneOpts {
  freq: number;
  /** Glide to this frequency over the duration. */
  to?: number;
  type?: OscillatorType;
  dur: number;
  vol?: number;
  attack?: number;
  /** Seconds from now. */
  when?: number;
  bus?: 'sfx' | 'music';
}

export interface NoiseOpts {
  dur: number;
  vol?: number;
  freq?: number;
  to?: number;
  q?: number;
  filter?: BiquadFilterType;
  attack?: number;
  when?: number;
}

export class AudioKit {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  musicFilter!: BiquadFilterNode;
  noiseBuf!: AudioBuffer;
  private wantMuted = false;

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Call from a pointer/touch handler. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.wantMuted ? 0 : 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicFilter = ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 9000;
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0.5;
      this.musicBus.connect(this.musicFilter).connect(this.master);
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended' && !this.wantMuted) void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.wantMuted = m;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.03);
    if (m) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  tone(o: ToneOpts): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + (o.when ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + o.dur);
    const vol = o.vol ?? 0.2;
    const att = o.attack ?? 0.005;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g).connect(o.bus === 'music' ? this.musicBus : this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.02);
  }

  noise(o: NoiseOpts): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + (o.when ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter ?? 'lowpass';
    f.frequency.setValueAtTime(o.freq ?? 1200, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
    f.Q.value = o.q ?? 0.7;
    const g = ctx.createGain();
    const vol = o.vol ?? 0.2;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + (o.attack ?? 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + o.dur + 0.02);
  }
}

/** A sustained liquid sound. Its pitch follows how full the receiving bottle is, like a real bottle filling up. */
export class PourVoice {
  private src: AudioBufferSourceNode | null = null;
  private band: BiquadFilterNode | null = null;
  private gain: GainNode | null = null;

  constructor(private kit: AudioKit) {}

  start(fill: number): void {
    const ctx = this.kit.ctx;
    if (!this.kit.ready || !ctx || this.src) return;
    const k = this.kit;
    this.src = ctx.createBufferSource();
    this.src.buffer = k.noiseBuf;
    this.src.loop = true;
    this.band = ctx.createBiquadFilter();
    this.band.type = 'bandpass';
    this.band.Q.value = 2.2;
    this.gain = ctx.createGain();
    this.gain.gain.setValueAtTime(0, ctx.currentTime);
    this.gain.gain.linearRampToValueAtTime(0.34, ctx.currentTime + 0.07);
    this.src.connect(this.band).connect(this.gain).connect(k.sfxBus);
    this.src.start();
    this.set(fill);
  }

  /** fill 0..1 */
  set(fill: number): void {
    const ctx = this.kit.ctx;
    if (!ctx || !this.band) return;
    this.band.frequency.setTargetAtTime(420 + fill * fill * 2400, ctx.currentTime, 0.04);
  }

  stop(): void {
    const ctx = this.kit.ctx;
    if (!ctx || !this.src || !this.gain) return;
    this.gain.gain.cancelScheduledValues(ctx.currentTime);
    this.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
    this.src.stop(ctx.currentTime + 0.25);
    this.src = this.band = this.gain = null;
  }
}

/** note number (MIDI) → Hz */
export const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/**
 * A small generative loop: plucky pentatonic melody over a soft bass.
 * setTension(0..1) closes a filter and thins the melody, so the music itself tightens during the squeeze.
 */
export interface Song {
  bpm: number;
  /** Eighth-note steps, MIDI notes, 0 = rest. */
  melody: number[];
  bass: number[];
  /** 'pluck' is bouncy and short, 'bell' rings with a soft overtone. */
  voice: 'pluck' | 'bell';
}

/** C major pentatonic, bouncy. */
export const SONG_SUNNY: Song = {
  bpm: 108,
  melody: [72, 0, 76, 79, 0, 76, 72, 0, 74, 0, 79, 81, 0, 79, 76, 0, 72, 0, 76, 79, 0, 84, 81, 0, 79, 0, 76, 74, 0, 72, 69, 0],
  bass: [48, 0, 0, 0, 55, 0, 0, 0, 45, 0, 0, 0, 53, 0, 55, 0],
  voice: 'pluck',
};

/** A minor, music-box arpeggios: calm and a little mysterious. */
export const SONG_MYSTIC: Song = {
  bpm: 92,
  melody: [69, 72, 76, 81, 76, 72, 76, 0, 67, 71, 74, 79, 74, 71, 74, 0, 65, 69, 72, 77, 72, 69, 72, 0, 64, 68, 71, 76, 80, 76, 71, 0],
  bass: [45, 0, 0, 0, 0, 0, 52, 0, 43, 0, 0, 0, 0, 0, 50, 0, 41, 0, 0, 0, 0, 0, 48, 0, 40, 0, 0, 0, 0, 0, 47, 0],
  voice: 'bell',
};

export class MusicLoop {
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private tension = 0;
  private readonly bpm: number;
  private readonly melody: number[];
  private readonly bass: number[];
  private readonly voice: Song['voice'];

  constructor(private kit: AudioKit, song: Song = SONG_SUNNY) {
    this.bpm = song.bpm;
    this.melody = song.melody;
    this.bass = song.bass;
    this.voice = song.voice;
  }

  start(): void {
    if (this.timer !== null || !this.kit.ctx) return;
    this.nextTime = this.kit.ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.schedule(), 40);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  setTension(t: number): void {
    this.tension = t;
    const ctx = this.kit.ctx;
    if (!ctx) return;
    this.kit.musicFilter.frequency.setTargetAtTime(9000 - 8200 * t, ctx.currentTime, 0.25);
  }

  private schedule(): void {
    const ctx = this.kit.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const stepDur = 60 / this.bpm / 2;
    while (this.nextTime < ctx.currentTime + 0.15) {
      const when = Math.max(0, this.nextTime - ctx.currentTime);
      const m = this.melody[this.step % this.melody.length];
      const b = this.bass[this.step % this.bass.length];
      // Under tension every other melody note drops out.
      const thin = this.tension > 0.6 && this.step % 4 !== 0;
      if (m && !thin) {
        if (this.voice === 'bell') {
          this.kit.tone({ freq: midi(m), type: 'sine', dur: 0.9, vol: 0.11, when, bus: 'music' });
          this.kit.tone({ freq: midi(m) * 3.01, type: 'sine', dur: 0.35, vol: 0.025, when, bus: 'music' });
        } else {
          this.kit.tone({ freq: midi(m), type: 'triangle', dur: 0.22, vol: 0.12, when, bus: 'music' });
          this.kit.tone({ freq: midi(m) * 2, type: 'sine', dur: 0.12, vol: 0.04, when, bus: 'music' });
        }
      }
      if (b) this.kit.tone({ freq: midi(b), type: 'sine', dur: this.voice === 'bell' ? 1.4 : 0.32, vol: this.voice === 'bell' ? 0.16 : 0.2, attack: this.voice === 'bell' ? 0.04 : 0.005, when, bus: 'music' });
      this.nextTime += stepDur;
      this.step++;
    }
  }
}
