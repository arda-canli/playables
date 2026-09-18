// Every sound in the ad, synthesised. Pitches rise with each truck so success literally sounds like progress.
import { AudioKit, midi } from '@kit/audio';

const SCALE = [60, 62, 64, 67, 69, 72, 74, 76, 79]; // C major pentatonic

export class Sfx {
  private heartIn = 0;

  constructor(private a: AudioKit) {}

  tap(): void {
    this.a.tone({ freq: 520, to: 880, type: 'sine', dur: 0.09, vol: 0.22 });
    this.a.noise({ dur: 0.05, vol: 0.08, freq: 3500, filter: 'highpass' });
  }

  nope(): void {
    this.a.tone({ freq: 220, to: 150, type: 'square', dur: 0.12, vol: 0.07 });
    this.a.tone({ freq: 196, to: 130, type: 'square', dur: 0.14, vol: 0.07, when: 0.09 });
  }

  vroom(): void {
    this.a.tone({ freq: 90, to: 210, type: 'sawtooth', dur: 0.34, vol: 0.07, attack: 0.03 });
    this.a.noise({ dur: 0.32, vol: 0.06, freq: 500, to: 1800, filter: 'bandpass', q: 1.2, attack: 0.04 });
  }

  park(): void {
    this.a.tone({ freq: 150, to: 70, type: 'sine', dur: 0.13, vol: 0.3 });
    this.a.noise({ dur: 0.06, vol: 0.09, freq: 900 });
  }

  pair(): void {
    this.a.tone({ freq: midi(76), type: 'triangle', dur: 0.16, vol: 0.13 });
  }

  /** A three-note arpeggio that starts one scale step higher for every truck sent. */
  match(n: number): void {
    const base = Math.min(n, SCALE.length - 3);
    [0, 1, 2].forEach((k) => {
      const f = midi(SCALE[base + k] + 12);
      this.a.tone({ freq: f, type: 'triangle', dur: 0.32, vol: 0.2, when: k * 0.075 });
      this.a.tone({ freq: f * 2, type: 'sine', dur: 0.22, vol: 0.07, when: k * 0.075 });
    });
  }

  hop(i: number): void {
    this.a.tone({ freq: 380 + i * 90, to: 760 + i * 90, type: 'sine', dur: 0.16, vol: 0.13 });
  }

  land(): void {
    this.a.tone({ freq: 120, to: 60, type: 'sine', dur: 0.1, vol: 0.22 });
  }

  honk(): void {
    for (const f of [392, 494]) {
      this.a.tone({ freq: f, type: 'square', dur: 0.12, vol: 0.06, attack: 0.01 });
      this.a.tone({ freq: f, type: 'square', dur: 0.2, vol: 0.06, attack: 0.01, when: 0.16 });
    }
  }

  truckIn(): void {
    this.a.noise({ dur: 0.5, vol: 0.09, freq: 300, to: 900, filter: 'bandpass', q: 0.8, attack: 0.1 });
    this.a.tone({ freq: 70, to: 110, type: 'sawtooth', dur: 0.5, vol: 0.06, attack: 0.08 });
  }

  truckOut(): void {
    this.a.noise({ dur: 0.7, vol: 0.1, freq: 500, to: 2200, filter: 'bandpass', q: 0.8, attack: 0.05 });
    this.a.tone({ freq: 80, to: 240, type: 'sawtooth', dur: 0.7, vol: 0.07, attack: 0.05 });
  }

  reveal(): void {
    [84, 88, 91, 96].forEach((n, k) => this.a.tone({ freq: midi(n), type: 'sine', dur: 0.25, vol: 0.1, when: k * 0.04 }));
    this.a.noise({ dur: 0.2, vol: 0.06, freq: 5000, filter: 'highpass' });
  }

  warn(): void {
    this.a.tone({ freq: 660, type: 'square', dur: 0.09, vol: 0.06 });
    this.a.tone({ freq: 660, type: 'square', dur: 0.09, vol: 0.06, when: 0.13 });
  }

  oops(): void {
    this.a.tone({ freq: 330, to: 196, type: 'triangle', dur: 0.3, vol: 0.18 });
  }

  fail(): void {
    [64, 60, 57, 52].forEach((n, k) => this.a.tone({ freq: midi(n), type: 'sawtooth', dur: 0.32, vol: 0.09, when: k * 0.17 }));
    this.a.noise({ dur: 0.4, vol: 0.14, freq: 400, to: 80 });
  }

  win(): void {
    [72, 76, 79, 84, 79, 84, 88].forEach((n, k) => {
      this.a.tone({ freq: midi(n), type: 'triangle', dur: 0.35, vol: 0.2, when: k * 0.09 });
      this.a.tone({ freq: midi(n - 12), type: 'sine', dur: 0.35, vol: 0.1, when: k * 0.09 });
    });
  }

  whoosh(): void {
    this.a.noise({ dur: 0.9, vol: 0.12, freq: 300, to: 3000, filter: 'bandpass', q: 0.6, attack: 0.3 });
  }

  pop(i = 0): void {
    this.a.tone({ freq: 600 + i * 60, to: 1100 + i * 60, type: 'sine', dur: 0.07, vol: 0.12 });
  }

  /** Call every frame. Plays a heartbeat whose rate follows the tension. */
  heartbeat(dt: number, tension: number): void {
    if (tension < 0.6) {
      this.heartIn = 0;
      return;
    }
    this.heartIn -= dt;
    if (this.heartIn > 0) return;
    this.heartIn = tension >= 1 ? 0.52 : 0.78;
    this.a.tone({ freq: 62, to: 40, type: 'sine', dur: 0.16, vol: 0.5 });
    this.a.tone({ freq: 56, to: 38, type: 'sine', dur: 0.14, vol: 0.35, when: 0.17 });
  }
}
