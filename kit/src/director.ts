// The "ad director": the part of a playable that is about the ad, not the game.
// It owns the phase, the idle timers, the tension value and the event log, so every game gets them for free.

export type Phase = 'boot' | 'ghost' | 'guide' | 'free' | 'squeeze' | 'ending' | 'endcard';

export interface DirectorTimings {
  /** Seconds without input before the hint hand comes back. */
  hintAfter: number;
  /** Seconds without input before the ad plays a move for the viewer. */
  autoAfter: number;
  /** Seconds with no interaction at all before the end card is shown. */
  giveUpAfter: number;
  /** Absolute cap on the whole experience. */
  hardCap: number;
}

export interface DirectorEvent {
  t: number;
  name: string;
  data?: Record<string, unknown>;
}

export interface DirectorHooks {
  onHint(): void;
  onAuto(): void;
  onGiveUp(reason: 'idle' | 'cap'): void;
}

export class Director {
  phase: Phase = 'boot';
  tension = 0;
  time = 0;
  readonly events: DirectorEvent[] = [];
  interactions = 0;
  firstTouchAt: number | null = null;

  private idle = 0;
  private hinted = false;
  private autoCount = 0;
  private running = false;
  private tensionListeners: ((t: number) => void)[] = [];

  constructor(private timings: DirectorTimings, private hooks: DirectorHooks) {}

  start(): void {
    this.running = true;
    this.log('start');
  }

  stop(): void {
    this.running = false;
  }

  setPhase(p: Phase): void {
    if (p === this.phase) return;
    this.phase = p;
    this.idle = 0;
    this.hinted = false;
    this.log('phase', { phase: p });
  }

  /** Every real user input goes through here. */
  touch(): void {
    this.interactions++;
    if (this.firstTouchAt === null) {
      this.firstTouchAt = this.time;
      this.log('first_touch', { seconds: round(this.time) });
    }
    this.idle = 0;
    this.hinted = false;
    this.autoCount = 0;
  }

  /** A move the ad made for the viewer still resets the hint, but does not count as engagement. */
  autoMoved(): void {
    this.idle = 0;
    this.hinted = false;
  }

  setTension(t: number): void {
    if (Math.abs(t - this.tension) < 1e-3) return;
    const crossed = (this.tension < 0.66 && t >= 0.66) || (this.tension < 1 && t >= 1);
    this.tension = t;
    if (crossed) this.log('tension', { level: round(t) });
    for (const l of this.tensionListeners) l(t);
  }

  onTension(cb: (t: number) => void): void {
    this.tensionListeners.push(cb);
  }

  update(dt: number): void {
    if (!this.running) return;
    this.time += dt;
    const playing = this.phase === 'guide' || this.phase === 'free' || this.phase === 'squeeze';
    if (!playing) return;

    this.idle += dt;
    // Let the viewer sweat a little longer when the pressure is on.
    const hintAfter = this.timings.hintAfter * (this.tension >= 0.66 ? 1.6 : 1);
    if (!this.hinted && this.idle >= hintAfter) {
      this.hinted = true;
      this.log('hint');
      this.hooks.onHint();
    }
    if (this.idle >= this.timings.autoAfter) {
      this.autoCount++;
      this.log('auto_move', { n: this.autoCount });
      this.hooks.onAuto();
      this.autoMoved();
    }
    if (this.interactions === 0 && this.time >= this.timings.giveUpAfter) this.hooks.onGiveUp('idle');
    else if (this.time >= this.timings.hardCap) this.hooks.onGiveUp('cap');
  }

  log(name: string, data?: Record<string, unknown>): void {
    const e: DirectorEvent = { t: round(this.time), name, data };
    this.events.push(e);
    // The portfolio page listens for these to drive its "show the hooks" captions.
    try {
      if (window.parent !== window) window.parent.postMessage({ source: 'playable', ...e }, '*');
    } catch {
      /* cross-origin parent: ignore */
    }
    if (DEBUG) console.debug('[director]', e.t.toFixed(2), name, data ?? '');
  }
}

const DEBUG = /[?&]debug=1/.test(location.search);
const round = (n: number) => Math.round(n * 100) / 100;
