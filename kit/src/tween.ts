// Tiny promise-based tween system driven by game time, so everything pauses together.

export type Ease = (t: number) => number;

const c1 = 1.70158;
const c3 = c1 + 1;

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  inBack: (t: number) => c3 * t * t * t - c1 * t * t,
  outBack: (t: number) => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  outBounce: (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  /** 0 → 1 → 0, for pops and pulses. */
  yoyo: (t: number) => Math.sin(Math.PI * t),
};

interface Tw {
  elapsed: number;
  dur: number;
  ease: Ease;
  update: (v: number, t: number) => void;
  resolve: () => void;
  tag?: unknown;
}

const active = new Set<Tw>();

export interface TweenOpts {
  dur: number;
  delay?: number;
  ease?: Ease;
  /** Anything; pass the same value to kill() to cancel a family of tweens. */
  tag?: unknown;
  update: (v: number, t: number) => void;
}

/** Runs update(easedValue, rawT) every frame for dur seconds. Resolves when finished; never resolves if killed. */
export function tween(o: TweenOpts): Promise<void> {
  return new Promise<void>((resolve) => {
    active.add({ elapsed: -(o.delay ?? 0), dur: Math.max(o.dur, 1e-4), ease: o.ease ?? ease.outCubic, update: o.update, resolve, tag: o.tag });
  });
}

export function wait(sec: number, tag?: unknown): Promise<void> {
  return tween({ dur: sec, tag, ease: ease.linear, update: () => {} });
}

/** Cancels tweens with this tag. Their promises never settle, which abandons any sequence awaiting them. */
export function kill(tag: unknown): void {
  for (const tw of active) if (tw.tag === tag) active.delete(tw);
}

export function killAll(): void {
  active.clear();
}

export function updateTweens(dt: number): void {
  for (const tw of active) {
    tw.elapsed += dt;
    if (tw.elapsed < 0) continue;
    const t = Math.min(1, tw.elapsed / tw.dur);
    tw.update(tw.ease(t), t);
    if (t >= 1) {
      active.delete(tw);
      tw.resolve();
    }
  }
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Frame-rate independent smoothing factor. */
export const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/** Small seeded RNG so every variant is reproducible. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
