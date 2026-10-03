// Pooled sprite particles in world units: sparkles, glows, confetti, coins, glass shards, debris and
// the bricks that tumble out of the bottom of the board.
import { Container, Sprite, Texture } from 'pixi.js';
import type { Art } from './art';

const CONFETTI = [0xff3b4f, 0xffc928, 0x2f8bff, 0x9b4dff, 0x3ddc6b, 0xff5fb8, 0xffffff];
const BRICK_TINTS = [0xffffff, 0xf3d9c9, 0xffe4d2, 0xe9c6b2];

interface P {
  s: Sprite;
  alive: boolean;
  vx: number;
  vy: number;
  g: number;
  drag: number;
  spin: number;
  life: number;
  max: number;
  s0: number;
  s1: number;
  fade: 'out' | 'inout' | 'late';
  peak: number;
  flip: number;
  w: number;
  h: number;
}

export class Fx {
  readonly layer = new Container();
  private pool: P[] = [];
  private cursor = 0;

  constructor(private art: Art, count = 420) {
    for (let i = 0; i < count; i++) {
      const s = new Sprite(Texture.WHITE);
      s.anchor.set(0.5);
      s.visible = false;
      this.layer.addChild(s);
      this.pool.push({ s, alive: false, vx: 0, vy: 0, g: 0, drag: 0, spin: 0, life: 0, max: 1, s0: 1, s1: 1, fade: 'out', peak: 1, flip: 0, w: 0, h: 0 });
    }
  }

  private spawn(tex: Texture, x: number, y: number, tint = 0xffffff, add = false): P {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    Object.assign(p, { alive: true, life: 0, vx: 0, vy: 0, g: 0, drag: 0, spin: 0, max: 1, s0: 1, s1: 1, fade: 'out', peak: 1, flip: 0, w: 0, h: 0 });
    p.s.texture = tex;
    p.s.position.set(x, y);
    p.s.tint = tint;
    p.s.rotation = 0;
    p.s.alpha = 1;
    p.s.blendMode = add ? 'add' : 'normal';
    p.s.visible = true;
    p.s.scale.set(1);
    return p;
  }

  sparkle(x: number, y: number, n: number, color = 0xfff2a8, spread = 120): void {
    for (let i = 0; i < n; i++) {
      const p = this.spawn(this.art.star, x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 20, color, true);
      const a = Math.random() * Math.PI * 2;
      const v = spread * (0.35 + Math.random() * 0.9);
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v - 40;
      p.g = 60;
      p.drag = 2.4;
      p.spin = (Math.random() - 0.5) * 6;
      p.max = 0.55 + Math.random() * 0.45;
      p.s0 = 0.14 + Math.random() * 0.2;
      p.s1 = 0;
      p.fade = 'inout';
    }
  }

  /** A soft flash of light. */
  glow(x: number, y: number, color: number, size = 1, max = 0.45): void {
    const p = this.spawn(this.art.glow, x, y, color, true);
    p.max = max;
    p.s0 = 0.5 * size;
    p.s1 = 1.8 * size;
    p.fade = 'inout';
    p.peak = 0.75;
  }

  confetti(x: number, y: number, n: number, power = 1): void {
    for (let i = 0; i < n; i++) {
      const p = this.spawn(Texture.WHITE, x, y, CONFETTI[(Math.random() * CONFETTI.length) | 0]);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const v = (300 + Math.random() * 420) * power;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.g = 900;
      p.drag = 1.5;
      p.spin = (Math.random() - 0.5) * 14;
      p.max = 1.6 + Math.random() * 0.9;
      p.flip = 6 + Math.random() * 10;
      p.w = 7;
      p.h = 11;
      p.fade = 'late';
    }
  }

  /** Coins burst out and rain down. */
  coins(x: number, y: number, n: number, power = 1): void {
    for (let i = 0; i < n; i++) {
      const p = this.spawn(this.art.coin, x, y);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
      const v = (220 + Math.random() * 360) * power;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.g = 820;
      p.drag = 0.8;
      p.max = 1.4 + Math.random() * 0.8;
      p.flip = 5 + Math.random() * 8;
      p.w = 26;
      p.h = 26;
      p.s0 = 0.7 + Math.random() * 0.4;
      p.fade = 'late';
    }
  }

  /** Glass shards when the tank bursts. */
  shards(x0: number, x1: number, y0: number, y1: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const p = this.spawn(Texture.WHITE, x0 + Math.random() * (x1 - x0), y0 + Math.random() * (y1 - y0), 0xdff4ff);
      p.s.alpha = 0.8;
      p.vx = (Math.random() - 0.5) * 520;
      p.vy = -120 - Math.random() * 360;
      p.g = 1100;
      p.spin = (Math.random() - 0.5) * 18;
      p.max = 0.9 + Math.random() * 0.6;
      p.w = 4 + Math.random() * 7;
      p.h = 8 + Math.random() * 12;
      p.flip = 0.01;
      p.fade = 'late';
    }
  }

  /** Crane debris: yellow bars and grey bolts tumbling. */
  debris(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const p = this.spawn(Texture.WHITE, x, y, Math.random() < 0.6 ? 0xffc21a : 0x6d7987);
      const a = Math.random() * Math.PI * 2;
      const v = 160 + Math.random() * 380;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v - 160;
      p.g = 980;
      p.spin = (Math.random() - 0.5) * 16;
      p.max = 1.1 + Math.random() * 0.6;
      p.w = 6 + Math.random() * 14;
      p.h = 4 + Math.random() * 3;
      p.flip = 0.01;
      p.fade = 'late';
    }
  }

  /** Smoke puffs for explosions and landings. */
  smoke(x: number, y: number, n: number, size = 1, color = 0x4b3a7a): void {
    for (let i = 0; i < n; i++) {
      const p = this.spawn(this.art.glow, x + (Math.random() - 0.5) * 30 * size, y + (Math.random() - 0.5) * 30 * size, color);
      const a = Math.random() * Math.PI * 2;
      p.vx = Math.cos(a) * 80 * size;
      p.vy = Math.sin(a) * 60 * size - 40;
      p.drag = 2.2;
      p.max = 0.8 + Math.random() * 0.6;
      p.s0 = 0.35 * size;
      p.s1 = 0.9 * size;
      p.fade = 'inout';
      p.peak = 0.85;
    }
  }

  /** A brick leaving the bottom of the board keeps falling, spinning, out of sight. */
  brick(x: number, y: number, seed: number): void {
    const p = this.spawn(this.art.brick, x, y, BRICK_TINTS[Math.floor(seed * 4)]);
    p.vx = (seed - 0.5) * 60;
    p.vy = 160 + seed * 120;
    p.g = 1400;
    p.spin = (seed - 0.5) * 10;
    p.s.rotation = seed * 6;
    p.max = 0.7;
    p.s0 = p.s1 = 0.38;
    p.fade = 'late';
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life += dt;
      const t = p.life / p.max;
      if (t >= 1) {
        p.alive = false;
        p.s.visible = false;
        continue;
      }
      p.vy += p.g * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.rotation += p.spin * dt;
      if (p.flip) {
        const k = p.s0;
        p.s.width = p.w * k;
        p.s.height = p.h * k * (p.flip > 0.02 ? Math.abs(Math.cos(p.life * p.flip)) : 1);
      } else p.s.scale.set(p.s0 + (p.s1 - p.s0) * t);
      p.s.alpha = p.peak * (p.fade === 'inout' ? Math.sin(Math.PI * t) : p.fade === 'late' ? (t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25) : 1 - t);
    }
  }
}
