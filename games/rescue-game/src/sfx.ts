// Every sound in the ad, synthesised: bricks, matches, Mary, dice, the slingshot, the crash and the payoff.
import { AudioKit, midi } from '@kit/audio';

const POPS = [72, 74, 76, 79, 81, 84, 86];

/** The bricks: a low rumble whose loudness follows how much is moving, plus random knocks on top. */
class Rubble {
  private src: AudioBufferSourceNode | null = null;
  private band: BiquadFilterNode | null = null;
  private gain: GainNode | null = null;
  private knockIn = 0;

  constructor(private a: AudioKit) {}

  set(level: number, dt: number): void {
    const ctx = this.a.ctx;
    if (!this.a.ready || !ctx) return;
    if (!this.src) {
      this.src = ctx.createBufferSource();
      this.src.buffer = this.a.noiseBuf;
      this.src.loop = true;
      this.band = ctx.createBiquadFilter();
      this.band.type = 'bandpass';
      this.band.Q.value = 0.9;
      this.gain = ctx.createGain();
      this.gain.gain.value = 0;
      this.src.connect(this.band).connect(this.gain).connect(this.a.sfxBus);
      this.src.start();
    }
    this.gain!.gain.setTargetAtTime(Math.min(0.2, level * 0.2), ctx.currentTime, 0.08);
    this.band!.frequency.setTargetAtTime(380 + level * 520, ctx.currentTime, 0.1);
    this.knockIn -= dt;
    if (level > 0.05 && this.knockIn <= 0) {
      this.knockIn = 0.02 + (1 - level) * 0.09 + Math.random() * 0.03;
      const f = 260 + Math.random() * 700;
      this.a.tone({ freq: f, to: f * 0.7, type: 'triangle', dur: 0.04, vol: 0.03 + level * 0.04 });
    }
  }

  stop(): void {
    const ctx = this.a.ctx;
    if (!ctx || !this.gain) return;
    this.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
  }
}

export class Sfx {
  readonly rubble: Rubble;
  private heartIn = 0;
  private creakIn = 0;
  private tickIn = 0;

  constructor(private a: AudioKit) {
    this.rubble = new Rubble(a);
  }

  grab(): void {
    this.a.tone({ freq: 640, to: 820, type: 'sine', dur: 0.06, vol: 0.05 });
  }

  swap(): void {
    this.a.noise({ dur: 0.16, vol: 0.07, freq: 700, to: 2600, filter: 'bandpass', q: 0.9, attack: 0.03 });
    this.a.tone({ freq: 520, to: 780, type: 'sine', dur: 0.09, vol: 0.06 });
  }

  nope(): void {
    this.a.tone({ freq: 210, to: 140, type: 'square', dur: 0.12, vol: 0.06 });
    this.a.tone({ freq: 180, to: 120, type: 'square', dur: 0.15, vol: 0.06, when: 0.09 });
  }

  match(step: number, size: number): void {
    const n = POPS[Math.min(step, POPS.length - 1)];
    [0, 4, 7].forEach((d, k) => this.a.tone({ freq: midi(n + d), type: 'triangle', dur: 0.2, vol: 0.12, when: k * 0.045 }));
    this.a.tone({ freq: midi(n + 12), type: 'sine', dur: 0.32, vol: 0.06, when: 0.12 });
    if (size > 3) this.a.tone({ freq: midi(n + 19), type: 'sine', dur: 0.4, vol: 0.07, when: 0.16 });
    this.a.noise({ dur: 0.07, vol: 0.09, freq: 3600, filter: 'highpass' });
  }

  /** A channel opens and the bricks gush out: a falling whoosh and a deep rumble. */
  gush(): void {
    this.a.noise({ dur: 1.1, vol: 0.22, freq: 2400, to: 300, filter: 'lowpass', q: 0.7, attack: 0.05 });
    this.a.tone({ freq: 120, to: 50, type: 'sine', dur: 0.9, vol: 0.35 });
    [72, 76, 79, 84].forEach((m, k) => this.a.tone({ freq: midi(m), type: 'triangle', dur: 0.3, vol: 0.1, when: 0.1 + k * 0.07 }));
  }

  /** A die lands in the meter. */
  die(i: number): void {
    [84, 88, 91].forEach((m, k) => this.a.tone({ freq: midi(m + i * 2), type: 'sine', dur: 0.18, vol: 0.09, when: k * 0.05 }));
    this.a.noise({ dur: 0.04, vol: 0.1, freq: 2800, filter: 'bandpass', q: 2 });
  }

  /** Mary's cackle: two short vowel-ish "ha"s. */
  laugh(): void {
    [0, 0.17, 0.34].forEach((w, k) => {
      const f = 360 - k * 30;
      this.a.tone({ freq: f, to: f * 0.8, type: 'sawtooth', dur: 0.12, vol: 0.05, when: w });
      this.a.tone({ freq: f * 2.6, to: f * 2.1, type: 'sine', dur: 0.1, vol: 0.04, when: w });
      this.a.noise({ dur: 0.05, vol: 0.05, freq: 1800, filter: 'bandpass', q: 3, when: w });
    });
  }

  press(): void {
    this.a.tone({ freq: 180, to: 90, type: 'sine', dur: 0.12, vol: 0.4 });
    this.a.noise({ dur: 0.05, vol: 0.12, freq: 1500, filter: 'bandpass' });
  }

  /** Dice clatter that slows as they settle. */
  dice(dur: number): void {
    let t = 0;
    let gap = 0.045;
    while (t < dur) {
      this.a.noise({ dur: 0.035, vol: 0.16 * (1 - (t / dur) * 0.6), freq: 1800 + Math.random() * 1600, filter: 'bandpass', q: 3, when: t });
      this.a.tone({ freq: 700 + Math.random() * 500, type: 'sine', dur: 0.03, vol: 0.05, when: t });
      t += gap;
      gap *= 1.09;
    }
  }

  clack(i: number): void {
    this.a.tone({ freq: 900 + i * 120, to: 500, type: 'triangle', dur: 0.08, vol: 0.16 });
    this.a.tone({ freq: midi(79 + i * 4), type: 'sine', dur: 0.25, vol: 0.08, when: 0.03 });
  }

  /** Three hammers: a brassy stab and a drum hit. */
  attackTime(): void {
    [55, 62, 67, 71, 74].forEach((m) => this.a.tone({ freq: midi(m), type: 'sawtooth', dur: 0.55, vol: 0.045, attack: 0.02 }));
    [67, 71, 74, 79].forEach((m, k) => this.a.tone({ freq: midi(m + 12), type: 'square', dur: 0.12, vol: 0.04, when: 0.5 + k * 0.08 }));
    this.a.tone({ freq: 90, to: 45, type: 'sine', dur: 0.35, vol: 0.5 });
  }

  /** The bands stretching: a creak whose pitch rises with the pull. */
  stretch(dt: number, k: number): void {
    this.creakIn -= dt;
    if (k < 0.08 || this.creakIn > 0) return;
    this.creakIn = 0.07;
    this.a.tone({ freq: 140 + k * 260, to: 150 + k * 280, type: 'sawtooth', dur: 0.06, vol: 0.025 });
  }

  launch(): void {
    this.a.tone({ freq: 120, to: 420, type: 'triangle', dur: 0.14, vol: 0.25 });
    this.a.noise({ dur: 0.5, vol: 0.12, freq: 600, to: 3200, filter: 'bandpass', q: 0.8, attack: 0.04 });
  }

  boom(): void {
    this.a.tone({ freq: 110, to: 30, type: 'sine', dur: 1.1, vol: 0.65 });
    this.a.noise({ dur: 1.1, vol: 0.45, freq: 2400, to: 140, filter: 'lowpass', q: 0.8 });
    this.a.noise({ dur: 0.1, vol: 0.28, freq: 5200, filter: 'highpass' });
    // Metal bending and clanging as the crane comes apart.
    [0.25, 0.48, 0.7, 0.95].forEach((w, k) => [420, 1130, 2010].forEach((f) => this.a.tone({ freq: f * (0.9 + k * 0.07), type: 'sine', dur: 0.35, vol: 0.05, when: w })));
  }

  /** Mary's shield: a hollow bell, and the attacker bounces off. */
  block(): void {
    [523, 1310, 2093].forEach((f) => this.a.tone({ freq: f, type: 'sine', dur: 0.9, vol: 0.08 }));
    this.a.tone({ freq: 300, to: 160, type: 'triangle', dur: 0.25, vol: 0.18 });
  }

  miss(): void {
    this.a.tone({ freq: midi(67), to: midi(60), type: 'triangle', dur: 0.4, vol: 0.12 });
  }

  glass(): void {
    this.a.noise({ dur: 0.5, vol: 0.25, freq: 5200, q: 1, filter: 'bandpass' });
    for (let k = 0; k < 8; k++) this.a.tone({ freq: 2400 + Math.random() * 4200, type: 'sine', dur: 0.15 + Math.random() * 0.2, vol: 0.04, when: Math.random() * 0.35 });
  }

  /** Coins counting up. Called every frame while the counter rolls. */
  counting(dt: number): void {
    this.tickIn -= dt;
    if (this.tickIn > 0) return;
    this.tickIn = 0.045;
    const f = 2400 + Math.random() * 900;
    this.a.tone({ freq: f, type: 'sine', dur: 0.05, vol: 0.05 });
  }

  fanfare(): void {
    [[67, 0], [72, 0.12], [76, 0.24], [79, 0.36]].forEach(([n, w]) => this.a.tone({ freq: midi(n), type: 'square', dur: 0.14, vol: 0.06, when: w }));
    [72, 76, 79, 84].forEach((n) => {
      this.a.tone({ freq: midi(n), type: 'triangle', dur: 1.4, vol: 0.1, when: 0.5 });
      this.a.tone({ freq: midi(n + 12), type: 'sine', dur: 1.1, vol: 0.04, when: 0.5 });
    });
  }

  sad(): void {
    [[63, 0, 0.3], [62, 0.32, 0.3], [61, 0.64, 0.3], [60, 0.96, 0.9]].forEach(([m, when, dur]) => this.a.tone({ freq: midi(m), to: midi(m - 0.4), type: 'triangle', dur, vol: 0.1, when, attack: 0.04 }));
  }

  heartbeat(dt: number, tension: number): void {
    if (tension < 0.8) {
      this.heartIn = 0;
      return;
    }
    this.heartIn -= dt;
    if (this.heartIn > 0) return;
    this.heartIn = 0.62;
    this.a.tone({ freq: 62, to: 40, type: 'sine', dur: 0.16, vol: 0.45 });
    this.a.tone({ freq: 56, to: 38, type: 'sine', dur: 0.14, vol: 0.32, when: 0.17 });
  }
}
