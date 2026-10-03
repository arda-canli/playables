// Every sound in the ad, synthesised: swaps, pops that climb with each cascade, blasts, dice, safes, coins.
import { AudioKit, midi } from '@kit/audio';

const POPS = [72, 74, 76, 79, 81, 84, 86, 88, 91]; // C major pentatonic, one step up per cascade

export class Sfx {
  private heartIn = 0;
  private tickIn = 0;

  constructor(private a: AudioKit) {}

  swap(): void {
    this.a.noise({ dur: 0.16, vol: 0.07, freq: 700, to: 2600, filter: 'bandpass', q: 0.9, attack: 0.03 });
    this.a.tone({ freq: 520, to: 780, type: 'sine', dur: 0.09, vol: 0.06 });
  }

  /** The swap that makes nothing: tiles bump and slide back. */
  nope(): void {
    this.a.tone({ freq: 210, to: 140, type: 'square', dur: 0.12, vol: 0.06 });
    this.a.tone({ freq: 180, to: 120, type: 'square', dur: 0.15, vol: 0.06, when: 0.09 });
  }

  /** One line cleared. `step` counts cascades, so a chain climbs the scale. */
  match(step: number, size: number): void {
    const n = POPS[Math.min(step, POPS.length - 1)];
    this.a.tone({ freq: midi(n), type: 'triangle', dur: 0.18, vol: 0.16 });
    this.a.tone({ freq: midi(n + 7), type: 'sine', dur: 0.22, vol: 0.07, when: 0.04 });
    if (size > 3) this.a.tone({ freq: midi(n + 12), type: 'sine', dur: 0.3, vol: 0.08, when: 0.08 });
    this.a.noise({ dur: 0.06, vol: 0.08, freq: 3500, filter: 'highpass' });
  }

  crate(): void {
    this.a.noise({ dur: 0.12, vol: 0.22, freq: 900, filter: 'bandpass', q: 1.2 });
    this.a.tone({ freq: 160, to: 80, type: 'triangle', dur: 0.14, vol: 0.2 });
  }

  /** A new booster forms: a quick rising sparkle. */
  made(): void {
    [84, 88, 91, 96].forEach((m, k) => this.a.tone({ freq: midi(m), type: 'sine', dur: 0.2, vol: 0.09, when: k * 0.04 }));
  }

  boom(big = false): void {
    this.a.tone({ freq: big ? 110 : 140, to: 34, type: 'sine', dur: big ? 0.9 : 0.6, vol: 0.6 });
    this.a.noise({ dur: big ? 0.9 : 0.55, vol: 0.4, freq: 2400, to: 160, filter: 'lowpass', q: 0.8 });
    this.a.noise({ dur: 0.08, vol: 0.25, freq: 5000, filter: 'highpass' });
  }

  zip(): void {
    this.a.noise({ dur: 0.35, vol: 0.18, freq: 600, to: 5200, filter: 'bandpass', q: 2, attack: 0.02 });
    this.a.tone({ freq: 300, to: 1400, type: 'sawtooth', dur: 0.25, vol: 0.05 });
  }

  /** A tile lands after a fall. Kept very quiet: many land at once. */
  land(): void {
    this.a.tone({ freq: 240 + Math.random() * 60, to: 160, type: 'sine', dur: 0.05, vol: 0.05 });
  }

  goalTick(i: number): void {
    this.a.tone({ freq: midi(88 + (i % 5)), type: 'sine', dur: 0.08, vol: 0.05 });
  }

  goalDone(): void {
    [76, 79, 84, 88].forEach((m, k) => this.a.tone({ freq: midi(m), type: 'triangle', dur: 0.25, vol: 0.12, when: k * 0.07 }));
  }

  levelWin(): void {
    [72, 76, 79, 84, 88, 91, 96].forEach((m, k) => {
      this.a.tone({ freq: midi(m), type: 'triangle', dur: 0.45, vol: 0.16, when: k * 0.08 });
      this.a.tone({ freq: midi(m + 12), type: 'sine', dur: 0.6, vol: 0.06, when: k * 0.08 });
    });
  }

  press(): void {
    this.a.tone({ freq: 180, to: 90, type: 'sine', dur: 0.12, vol: 0.4 });
    this.a.noise({ dur: 0.05, vol: 0.12, freq: 1500, filter: 'bandpass' });
  }

  /** Dice clatter: knocks that slow down as the dice settle. */
  dice(dur: number): void {
    let t = 0;
    let gap = 0.045;
    while (t < dur) {
      this.a.noise({ dur: 0.035, vol: 0.18 * (1 - (t / dur) * 0.6), freq: 1800 + Math.random() * 1600, filter: 'bandpass', q: 3, when: t });
      this.a.tone({ freq: 700 + Math.random() * 500, type: 'sine', dur: 0.03, vol: 0.05, when: t });
      t += gap;
      gap *= 1.09;
    }
  }

  /** Two-tone siren and a stab: heist time. */
  siren(): void {
    for (let i = 0; i < 4; i++) this.a.tone({ freq: i % 2 ? 740 : 980, type: 'square', dur: 0.16, vol: 0.05, when: i * 0.17 });
    [60, 64, 67, 72].forEach((m) => this.a.tone({ freq: midi(m), type: 'sawtooth', dur: 0.5, vol: 0.05, when: 0.7 }));
  }

  /** A heavy safe door: creaky handle, then a clunk. */
  safeOpen(): void {
    this.a.noise({ dur: 0.3, vol: 0.1, freq: 400, to: 1200, filter: 'bandpass', q: 6, attack: 0.05 });
    this.a.tone({ freq: 90, to: 55, type: 'triangle', dur: 0.2, vol: 0.4, when: 0.28 });
    this.a.noise({ dur: 0.06, vol: 0.2, freq: 1800, filter: 'bandpass', q: 1, when: 0.28 });
  }

  /** Coins pouring: called every frame while a counter rolls. */
  counting(dt: number, rate = 0.045): void {
    this.tickIn -= dt;
    if (this.tickIn > 0) return;
    this.tickIn = rate;
    const f = 2400 + Math.random() * 900;
    this.a.tone({ freq: f, type: 'sine', dur: 0.05, vol: 0.05 });
    this.a.tone({ freq: f * 1.5, type: 'sine', dur: 0.03, vol: 0.02 });
  }

  cash(): void {
    [79, 84, 88].forEach((m, k) => this.a.tone({ freq: midi(m), type: 'triangle', dur: 0.3, vol: 0.13, when: k * 0.06 }));
  }

  mult(): void {
    [72, 79, 84, 91, 96].forEach((m, k) => this.a.tone({ freq: midi(m), type: 'square', dur: 0.14, vol: 0.05, when: k * 0.05 }));
    this.a.tone({ freq: 300, to: 1200, type: 'sine', dur: 0.4, vol: 0.12 });
  }

  /** Before the last safe: a snare roll that speeds up. */
  drumroll(dur: number): void {
    let t = 0;
    let gap = 0.09;
    while (t < dur) {
      this.a.noise({ dur: 0.04, vol: 0.08 + (t / dur) * 0.12, freq: 2600, filter: 'bandpass', q: 0.9, when: t });
      t += gap;
      gap = Math.max(0.035, gap * 0.92);
    }
  }

  jackpot(): void {
    [60, 64, 67, 72, 76, 79, 84].forEach((m, k) => {
      this.a.tone({ freq: midi(m), type: 'square', dur: 0.2, vol: 0.06, when: k * 0.06 });
      this.a.tone({ freq: midi(m + 12), type: 'triangle', dur: 0.5, vol: 0.12, when: k * 0.06 });
    });
    [84, 88, 91].forEach((m) => this.a.tone({ freq: midi(m), type: 'sine', dur: 1.4, vol: 0.1, when: 0.5 }));
  }

  /** "Wah wah wah waaah": the empty safe. */
  sadTrombone(): void {
    [[63, 0, 0.3], [62, 0.32, 0.3], [61, 0.64, 0.3], [60, 0.96, 0.9]].forEach(([m, when, dur]) => {
      this.a.tone({ freq: midi(m - 12), to: midi(m - 12.4), type: 'sawtooth', dur, vol: 0.08, when, attack: 0.04 });
      this.a.tone({ freq: midi(m), to: midi(m - 0.4), type: 'triangle', dur, vol: 0.1, when, attack: 0.04 });
    });
  }

  /** The jackpot that was there all along: a bright chime that lands on a minor chord. */
  regret(): void {
    [88, 91, 96].forEach((m, k) => this.a.tone({ freq: midi(m), type: 'sine', dur: 0.4, vol: 0.09, when: k * 0.05 }));
    [57, 60, 64].forEach((m) => this.a.tone({ freq: midi(m), type: 'triangle', dur: 0.9, vol: 0.09, when: 0.3 }));
  }

  outOfMoves(): void {
    [69, 65, 62, 57].forEach((m, k) => this.a.tone({ freq: midi(m), type: 'triangle', dur: 0.4, vol: 0.13, when: k * 0.16 }));
  }

  rescue(): void {
    this.a.tone({ freq: 300, to: 1500, type: 'sine', dur: 0.55, vol: 0.12, attack: 0.05 });
    [84, 88, 91, 96, 100].forEach((m, k) => this.a.tone({ freq: midi(m), type: 'sine', dur: 0.5, vol: 0.09, when: 0.35 + k * 0.06 }));
  }

  heartbeat(dt: number, tension: number): void {
    if (tension < 0.9) {
      this.heartIn = 0;
      return;
    }
    this.heartIn -= dt;
    if (this.heartIn > 0) return;
    this.heartIn = 0.6;
    this.a.tone({ freq: 62, to: 40, type: 'sine', dur: 0.16, vol: 0.5 });
    this.a.tone({ freq: 56, to: 38, type: 'sine', dur: 0.14, vol: 0.35, when: 0.17 });
  }
}
