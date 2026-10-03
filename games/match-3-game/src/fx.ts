// Pooled sprite particles: tile shards, crate splinters, blast smoke, sparkles, confetti, coins and banknotes.
import { Container, Sprite, Texture } from 'pixi.js';
import type { Art } from './art';
import { CONFETTI } from './palette';

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  return Texture.from(c);
}

export function makeFxTextures() {
  return {
    glow: canvasTex(128, (g, s) => {
      const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(0.35, 'rgba(255,255,255,0.45)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, s, s);
    }),
    dot: canvasTex(32, (g, s) => {
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2);
      g.fill();
    }),
    star: canvasTex(64, (g, s) => {
      const c = s / 2;
      g.fillStyle = '#fff';
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 ? s * 0.09 : s * 0.48;
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    }),
    ring: canvasTex(128, (g, s) => {
      g.strokeStyle = '#fff';
      g.lineWidth = 7;
      g.beginPath();
      g.arc(s / 2, s / 2, s / 2 - 6, 0, Math.PI * 2);
      g.stroke();
    }),
    puff: canvasTex(96, (g, s) => {
      // A soft lumpy cloud for blast smoke.
      for (const [x, y, r] of [[0.5, 0.5, 0.32], [0.32, 0.56, 0.2], [0.68, 0.56, 0.2], [0.5, 0.34, 0.22]]) {
        const rg = g.createRadialGradient(x * s, y * s, 0, x * s, y * s, r * s);
        rg.addColorStop(0, 'rgba(255,255,255,0.9)');
        rg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = rg;
        g.fillRect(0, 0, s, s);
      }
    }),
    shard: canvasTex(32, (g, s) => {
      g.fillStyle = '#fff';
      g.beginPath();
      g.roundRect(4, 8, s - 8, s - 16, 5);
      g.fill();
    }),
  };
}
export type FxTextures = ReturnType<typeof makeFxTextures>;

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
  flipRate: number;
  /** Highest alpha this particle reaches. */
  peak: number;
  w: number;
  h: number;
}

export class Fx {
  readonly layer = new Container();
  private pool: P[] = [];
  private cursor = 0;

  constructor(private tex: FxTextures, private art: Art, count = 420) {
    for (let i = 0; i < count; i++) {
      const s = new Sprite(tex.dot);
      s.anchor.set(0.5);
      s.visible = false;
      this.layer.addChild(s);
      this.pool.push({ s, alive: false, vx: 0, vy: 0, g: 0, drag: 0, spin: 0, life: 0, max: 1, s0: 1, s1: 1, fade: 'out', flipRate: 0, peak: 1, w: 0, h: 0 });
    }
  }

  private spawn(texture: Texture, x: number, y: number, tint: number, add = false): P {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    p.alive = true;
    p.life = 0;
    p.flipRate = 0;
    p.peak = 1;
    p.fade = 'out';
    p.spin = 0;
    p.drag = 0;
    p.g = 0;
    p.s.texture = texture;
    p.s.position.set(x, y);
    p.s.tint = tint;
    p.s.rotation = 0;
    p.s.alpha = 1;
    p.s.blendMode = add ? 'add' : 'normal';
    p.s.visible = true;
    return p;
  }

  private burst(p: P, speed: number, up = 0): void {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.35 + Math.random() * 0.8);
    p.vx = Math.cos(a) * v;
    p.vy = Math.sin(a) * v - up;
  }

  /** Bits of a cleared tile, in its colour. */
  shards(x: number, y: number, color: number, n = 7): void {
    for (let i = 0; i < n; i++) {
      const p = this.spawn(this.tex.shard, x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30, color);
      this.burst(p, 360, 160);
      p.g = 1300;
      p.drag = 1.2;
      p.spin = (Math.random() - 0.5) * 16;
      p.max = 0.45 + Math.random() * 0.3;
      p.s0 = 0.5 + Math.random() * 0.5;
      p.s1 = 0.15;
    }
    const gl = this.spawn(this.tex.glow, x, y, color, true);
    gl.max = 0.28;
    gl.s0 = 0.5;
    gl.s1 = 1.2;
    gl.peak = 0.7;
    gl.fade = 'inout';
  }

  splinters(x: number, y: number, n = 10): void {
    for (let i = 0; i < n; i++) {
      const p = this.spawn(this.tex.shard, x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40, i % 3 ? 0xe58a3a : 0x9c4510);
      this.burst(p, 420, 220);
      p.g = 1500;
      p.drag = 0.8;
      p.spin = (Math.random() - 0.5) * 22;
      p.max = 0.6 + Math.random() * 0.4;
      p.s0 = 0.7 + Math.random() * 0.6;
      p.s1 = 0.4;
      p.fade = 'late';
    }
  }

  smoke(x: number, y: number, n: number, spread: number, tint = 0xffe2b0): void {
    for (let i = 0; i < n; i++) {
      const p = this.spawn(this.tex.puff, x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread, tint);
      this.burst(p, 120, 40);
      p.drag = 2;
      p.max = 0.6 + Math.random() * 0.5;
      p.s0 = 0.8 + Math.random() * 0.8;
      p.s1 = p.s0 * 2.2;
      p.peak = 0.75;
      p.fade = 'inout';
      p.spin = (Math.random() - 0.5) * 2;
    }
  }

  sparkle(x: number, y: number, n: number, color = 0xfff2a8, spread = 120): void {
    for (let i = 0; i < n; i++) {
      const p = this.spawn(this.tex.star, x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30, color, true);
      this.burst(p, spread, 40);
      p.g = 60;
      p.drag = 2.4;
      p.spin = (Math.random() - 0.5) * 6;
      p.max = 0.55 + Math.random() * 0.45;
      p.s0 = 0.25 + Math.random() * 0.35;
      p.s1 = 0;
      p.fade = 'inout';
    }
  }

  /** A soft expanding ring of light. */
  pulse(x: number, y: number, color: number, size = 1): void {
    const r = this.spawn(this.tex.ring, x, y, color, true);
    r.max = 0.5;
    r.s0 = 0.25 * size;
    r.s1 = 1.9 * size;
    const gl = this.spawn(this.tex.glow, x, y, color, true);
    gl.max = 0.4;
    gl.s0 = 0.7 * size;
    gl.s1 = 1.9 * size;
    gl.fade = 'inout';
    gl.peak = 0.55;
  }

  /** The bright streak a rocket leaves along its row or column. */
  streak(x: number, y: number, vx: number, vy: number, color = 0xfff0b0): void {
    for (let i = 0; i < 3; i++) {
      const p = this.spawn(this.tex.glow, x, y, color, true);
      p.vx = vx * (1 - i * 0.12);
      p.vy = vy * (1 - i * 0.12);
      p.max = 0.5;
      p.s0 = 0.9 - i * 0.2;
      p.s1 = 0.3;
      p.peak = 0.9;
    }
  }

  confetti(x: number, y: number, n: number, power = 1): void {
    for (let i = 0; i < n; i++) {
      const p = this.spawn(Texture.WHITE, x, y, CONFETTI[(Math.random() * CONFETTI.length) | 0]);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const v = (420 + Math.random() * 520) * power;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.g = 1100;
      p.drag = 1.5;
      p.spin = (Math.random() - 0.5) * 14;
      p.max = 1.5 + Math.random() * 0.9;
      p.s0 = 0.9 + Math.random() * 0.7;
      p.s1 = p.s0;
      p.flipRate = 6 + Math.random() * 10;
      p.w = 10;
      p.h = 16;
    }
  }

  /** Gold coins and banknotes thrown up out of a safe. */
  loot(x: number, y: number, n: number, power = 1, bills = 0.3): void {
    for (let i = 0; i < n; i++) {
      const bill = Math.random() < bills;
      const p = this.spawn(bill ? this.art.bill : this.art.coin, x + (Math.random() - 0.5) * 40, y, 0xffffff);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const v = (520 + Math.random() * 600) * power;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.g = 1500;
      p.drag = 0.7;
      p.spin = (Math.random() - 0.5) * (bill ? 10 : 3);
      p.max = 1.1 + Math.random() * 0.6;
      p.s0 = bill ? 0.9 : 0.55 + Math.random() * 0.3;
      p.s1 = p.s0;
      p.flipRate = bill ? 0 : 7 + Math.random() * 6;
      p.w = 48 * p.s0;
      p.h = 48 * p.s0;
      p.fade = 'late';
    }
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
      if (p.flipRate) {
        // Spinning flat things: confetti and coins turn edge-on and back.
        p.s.width = p.w * (p.s.texture === Texture.WHITE ? p.s0 : 1);
        p.s.height = p.h * (p.s.texture === Texture.WHITE ? p.s0 : 1) * Math.abs(Math.cos(p.life * p.flipRate));
      } else p.s.scale.set(p.s0 + (p.s1 - p.s0) * t);
      p.s.alpha = p.peak * (p.fade === 'inout' ? Math.sin(Math.PI * t) : p.fade === 'late' ? (t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2) : t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4);
    }
  }
}
