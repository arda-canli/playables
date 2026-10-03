// Every sound in the ad, synthesised: cannon, glass, jam, wood, stone, gold and the royal fanfares.
import { AudioKit, midi } from '@kit/audio';
import type { Kind } from './level';

// C major pentatonic, climbing one step with every jar of a combo
const COMBO = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96];

export class Sfx {
  private heartIn = 0;
  private lastKnock = 0;

  constructor(private a: AudioKit) {}

  fire(big = false): void {
    // A deep thump, a bright crack and a puff of air.
    this.a.tone({ freq: big ? 110 : 150, to: 38, type: 'sine', dur: big ? 0.6 : 0.35, vol: 0.6 });
    this.a.noise({ dur: 0.18, vol: 0.32, freq: 2400, to: 300, filter: 'lowpass' });
    this.a.noise({ dur: 0.05, vol: 0.18, freq: 5000, filter: 'highpass' });
    this.a.noise({ dur: 0.35, vol: 0.08, freq: 700, to: 2600, filter: 'bandpass', q: 0.8, attack: 0.05, when: 0.04 });
  }

  /** Glass breaking. n is the place in the combo, so a big chain plays a rising run. */
  shatter(n: number): void {
    const base = midi(COMBO[Math.min(n, COMBO.length - 1)]);
    this.a.noise({ dur: 0.16, vol: 0.2, freq: 5200, q: 1.2, filter: 'bandpass' });
    this.a.noise({ dur: 0.09, vol: 0.12, freq: 2600, filter: 'highpass' });
    for (let k = 0; k < 3; k++) this.a.tone({ freq: 2400 + Math.random() * 3400, type: 'sine', dur: 0.08 + Math.random() * 0.12, vol: 0.04, when: 0.02 + k * 0.03 });
    // The musical part that makes chains feel rewarding.
    this.a.tone({ freq: base, type: 'triangle', dur: 0.24, vol: 0.12, when: 0.02 });
    this.a.tone({ freq: base * 2, type: 'sine', dur: 0.16, vol: 0.05, when: 0.02 });
  }

  /** The wet part of a jar bursting. */
  splat(): void {
    this.a.noise({ dur: 0.14, vol: 0.2, freq: 900, to: 240, filter: 'lowpass', q: 2 });
    this.a.tone({ freq: 240, to: 90, type: 'sine', dur: 0.1, vol: 0.18 });
  }

  /** Pieces knocking into things, by what they are made of. Throttled so a collapse does not turn into noise. */
  knock(kind: Kind, speed: number, now: number): void {
    if (now - this.lastKnock < 0.045) return;
    this.lastKnock = now;
    const v = Math.min(1, speed / 9);
    if (kind === 'gold') {
      // Heavy metal block: a few inharmonic partials
      for (const [f, d] of [[420, 0.4], [1130, 0.25], [2010, 0.15]]) this.a.tone({ freq: f * (0.95 + Math.random() * 0.1), type: 'sine', dur: d, vol: 0.09 * v });
      this.a.noise({ dur: 0.05, vol: 0.12 * v, freq: 1800, filter: 'bandpass' });
    } else if (kind === 'column') {
      this.a.tone({ freq: 180 + Math.random() * 40, to: 120, type: 'triangle', dur: 0.12, vol: 0.22 * v });
      this.a.noise({ dur: 0.08, vol: 0.14 * v, freq: 1400, filter: 'lowpass' });
    } else if (kind === 'plank') {
      this.a.tone({ freq: 230 + Math.random() * 50, to: 160, type: 'triangle', dur: 0.1, vol: 0.2 * v });
      this.a.noise({ dur: 0.06, vol: 0.1 * v, freq: 900, filter: 'bandpass', q: 1.5 });
    } else {
      this.a.tone({ freq: 1900 + Math.random() * 600, type: 'sine', dur: 0.06, vol: 0.06 * v });
    }
  }

  thud(): void {
    this.a.tone({ freq: 90, to: 45, type: 'sine', dur: 0.22, vol: 0.35 });
    this.a.noise({ dur: 0.12, vol: 0.12, freq: 500, filter: 'lowpass' });
  }

  whiff(): void {
    this.a.noise({ dur: 0.3, vol: 0.07, freq: 1500, to: 500, filter: 'bandpass', q: 1 });
  }

  /** The botched opening landing on a single jar: a deflating little "meh". */
  meh(): void {
    this.a.tone({ freq: midi(67), to: midi(62), type: 'triangle', dur: 0.3, vol: 0.14, when: 0.15 });
    this.a.tone({ freq: midi(62), to: midi(55), type: 'triangle', dur: 0.4, vol: 0.14, when: 0.42 });
  }

  /** A big combo: a sparkly run on top of everything else. */
  combo(n: number): void {
    const top = Math.min(n, 8);
    for (let k = 0; k < top; k++) this.a.tone({ freq: midi(84 + [0, 2, 4, 7, 9, 12, 14, 16][k]), type: 'sine', dur: 0.25, vol: 0.07, when: 0.05 + k * 0.045 });
  }

  ballTick(): void {
    this.a.tone({ freq: 880, to: 660, type: 'square', dur: 0.06, vol: 0.05 });
  }

  lastBall(): void {
    [76, 76].forEach((n, k) => this.a.tone({ freq: midi(n), type: 'square', dur: 0.12, vol: 0.06, when: k * 0.16 }));
  }

  outOfBalls(): void {
    [72, 67, 64, 60].forEach((n, k) => this.a.tone({ freq: midi(n), type: 'triangle', dur: 0.36, vol: 0.14, when: k * 0.15 }));
    this.a.tone({ freq: 70, to: 40, type: 'sine', dur: 0.5, vol: 0.5, when: 0.6 });
  }

  /** The "+3 balls" offer arriving: three bright pops and a rising shimmer. */
  offer(): void {
    [0, 1, 2].forEach((k) => this.a.tone({ freq: 500 + k * 120, to: 1100 + k * 160, type: 'sine', dur: 0.1, vol: 0.14, when: k * 0.12 }));
    [84, 88, 91, 96].forEach((n, k) => this.a.tone({ freq: midi(n), type: 'sine', dur: 0.45, vol: 0.08, when: 0.4 + k * 0.06 }));
  }

  /** The free giant ball being loaded. */
  powerUp(): void {
    this.a.tone({ freq: 220, to: 880, type: 'sawtooth', dur: 0.6, vol: 0.05, attack: 0.1 });
    this.a.tone({ freq: 330, to: 1320, type: 'sine', dur: 0.6, vol: 0.1, attack: 0.1 });
    [79, 84, 88, 91].forEach((n, k) => this.a.tone({ freq: midi(n), type: 'triangle', dur: 0.3, vol: 0.09, when: 0.45 + k * 0.07 }));
  }

  win(): void {
    // A royal fanfare: two pickup notes and a held major chord.
    [[67, 0], [72, 0.12], [76, 0.24], [79, 0.36]].forEach(([n, w]) => this.a.tone({ freq: midi(n), type: 'square', dur: 0.14, vol: 0.06, when: w }));
    [72, 76, 79, 84].forEach((n) => {
      this.a.tone({ freq: midi(n), type: 'triangle', dur: 1.3, vol: 0.1, when: 0.5 });
      this.a.tone({ freq: midi(n + 12), type: 'sine', dur: 1, vol: 0.04, when: 0.5 });
    });
  }

  thump(i: number): void {
    this.a.tone({ freq: 160 - i * 3, to: 80, type: 'sine', dur: 0.09, vol: 0.12 });
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
