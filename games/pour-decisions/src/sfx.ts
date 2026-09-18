// Every sound in the ad, synthesised. Glass, liquid, cork and bells.
import { AudioKit, PourVoice, midi } from '@kit/audio';

const BELLS = [69, 72, 76, 79, 81, 84, 88]; // A minor pentatonic, rising with every bottle corked

export class Sfx {
  private pourVoice: PourVoice;
  private glugIn = 0;
  private heartIn = 0;

  constructor(private a: AudioKit) {
    this.pourVoice = new PourVoice(a);
  }

  /** Glass being picked up: a few inharmonic partials with a quick decay. */
  clink(high = false): void {
    const f = high ? 2600 : 2100;
    this.a.tone({ freq: f, type: 'sine', dur: 0.28, vol: 0.1 });
    this.a.tone({ freq: f * 1.52, type: 'sine', dur: 0.18, vol: 0.05 });
    this.a.tone({ freq: f * 2.43, type: 'sine', dur: 0.1, vol: 0.03 });
    this.a.noise({ dur: 0.03, vol: 0.05, freq: 6000, filter: 'highpass' });
  }

  setDown(): void {
    this.a.tone({ freq: 190, to: 120, type: 'sine', dur: 0.09, vol: 0.2 });
    this.a.tone({ freq: 1700, type: 'sine', dur: 0.12, vol: 0.04 });
  }

  whoosh(): void {
    this.a.noise({ dur: 0.26, vol: 0.06, freq: 500, to: 2400, filter: 'bandpass', q: 0.8, attack: 0.08 });
  }

  pourStart(fill: number): void {
    this.pourVoice.start(fill);
    this.glugIn = 0.05;
  }

  /** Call every frame while pouring. */
  pouring(dt: number, fill: number): void {
    this.pourVoice.set(fill);
    this.glugIn -= dt;
    if (this.glugIn <= 0) {
      this.glugIn = 0.07 + Math.random() * 0.08;
      const f = 260 + fill * 520 + Math.random() * 160;
      this.a.tone({ freq: f, to: f * 0.55, type: 'sine', dur: 0.07, vol: 0.13 });
    }
  }

  pourStop(): void {
    this.pourVoice.stop();
    this.a.tone({ freq: 900, to: 1500, type: 'sine', dur: 0.06, vol: 0.06 });
  }

  nope(): void {
    this.a.tone({ freq: 210, to: 140, type: 'square', dur: 0.13, vol: 0.07 });
    this.a.tone({ freq: 185, to: 120, type: 'square', dur: 0.16, vol: 0.07, when: 0.1 });
    this.a.tone({ freq: 2300, type: 'sine', dur: 0.08, vol: 0.03 });
  }

  corkPop(n: number): void {
    this.a.noise({ dur: 0.05, vol: 0.3, freq: 1800, filter: 'bandpass', q: 1.5 });
    this.a.tone({ freq: 520, to: 140, type: 'sine', dur: 0.12, vol: 0.34 });
    // A bell chord that climbs with each bottle the player finishes.
    const base = Math.min(n, BELLS.length - 3);
    [0, 1, 2].forEach((k) => {
      const f = midi(BELLS[base + k] + 12);
      this.a.tone({ freq: f, type: 'sine', dur: 1.1, vol: 0.16, when: 0.06 + k * 0.08 });
      this.a.tone({ freq: f * 2.76, type: 'sine', dur: 0.4, vol: 0.035, when: 0.06 + k * 0.08 });
    });
  }

  reveal(): void {
    [88, 93, 96, 100].forEach((n, k) => this.a.tone({ freq: midi(n), type: 'sine', dur: 0.3, vol: 0.08, when: k * 0.045 }));
    this.a.noise({ dur: 0.25, vol: 0.04, freq: 7000, filter: 'highpass', attack: 0.05 });
  }

  /** The reveal that ruins everything: same shimmer, but it lands on a sour interval. */
  revealBad(): void {
    [88, 93].forEach((n, k) => this.a.tone({ freq: midi(n), type: 'sine', dur: 0.25, vol: 0.08, when: k * 0.045 }));
    this.a.tone({ freq: midi(70), type: 'triangle', dur: 0.6, vol: 0.14, when: 0.12 });
    this.a.tone({ freq: midi(64), type: 'triangle', dur: 0.6, vol: 0.14, when: 0.12 });
  }

  stuck(): void {
    [69, 65, 62, 57].forEach((n, k) => this.a.tone({ freq: midi(n), type: 'triangle', dur: 0.4, vol: 0.13, when: k * 0.16 }));
    this.a.tone({ freq: 70, to: 40, type: 'sine', dur: 0.5, vol: 0.5, when: 0.6 });
  }

  /** The "+1 bottle" materialising: a rising glissando with sparkle on top. */
  rescue(): void {
    this.a.tone({ freq: 300, to: 1500, type: 'sine', dur: 0.55, vol: 0.12, attack: 0.05 });
    this.a.tone({ freq: 450, to: 2250, type: 'sine', dur: 0.55, vol: 0.06, attack: 0.05 });
    [84, 88, 91, 96, 100].forEach((n, k) => this.a.tone({ freq: midi(n), type: 'sine', dur: 0.5, vol: 0.09, when: 0.35 + k * 0.06 }));
  }

  win(): void {
    [69, 72, 76, 81, 84, 88, 93].forEach((n, k) => {
      this.a.tone({ freq: midi(n), type: 'triangle', dur: 0.5, vol: 0.17, when: k * 0.085 });
      this.a.tone({ freq: midi(n + 12), type: 'sine', dur: 0.7, vol: 0.07, when: k * 0.085 });
    });
  }

  pop(i = 0): void {
    this.a.tone({ freq: 500 + i * 45, to: 1000 + i * 45, type: 'sine', dur: 0.07, vol: 0.1 });
  }

  tick(): void {
    this.a.tone({ freq: 1200, type: 'sine', dur: 0.04, vol: 0.05 });
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
