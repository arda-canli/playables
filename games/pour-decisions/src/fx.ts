// Pooled sprite particles. Every texture is generated on a canvas at start-up: no image files.
import { Container, Sprite, Texture } from 'pixi.js';
import { CONFETTI } from './palette';

function canvasTex(size: number, paint: (g: CanvasRenderingContext2D, s: number) => void): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d')!, size);
  return Texture.from(c);
}

export function makeTextures() {
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
  };
}
export type Textures = ReturnType<typeof makeTextures>;

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
  fade: 'out' | 'inout';
  flipRate: number;
  /** Highest alpha this particle reaches. */
  peak: number;
}

export class Fx {
  readonly layer = new Container();
  private pool: P[] = [];
  private cursor = 0;

  constructor(private tex: Textures, count = 260) {
    for (let i = 0; i < count; i++) {
      const s = new Sprite(tex.dot);
      s.anchor.set(0.5);
      s.visible = false;
      this.layer.addChild(s);
      this.pool.push({ s, alive: false, vx: 0, vy: 0, g: 0, drag: 0, spin: 0, life: 0, max: 1, s0: 1, s1: 1, fade: 'out', flipRate: 0, peak: 1 });
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
    p.s.texture = texture;
    p.s.position.set(x, y);
    p.s.tint = tint;
    p.s.rotation = 0;
    p.s.alpha = 1;
    p.s.blendMode = add ? 'add' : 'normal';
    p.s.visible = true;
    return p;
  }

  droplets(x: number, y: number, color: number, n: number, power = 1): void {
    for (let i = 0; i < n; i++) {
      const p = this.spawn(this.tex.dot, x + (Math.random() - 0.5) * 10, y, color);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
      const v = (90 + Math.random() * 190) * power;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.g = 900;
      p.drag = 0.6;
      p.spin = 0;
      p.max = 0.35 + Math.random() * 0.3;
      p.s0 = 0.16 + Math.random() * 0.2;
      p.s1 = 0.04;
    }
  }

  sparkle(x: number, y: number, n: number, color = 0xfff2a8, spread = 120): void {
    for (let i = 0; i < n; i++) {
      const p = this.spawn(this.tex.star, x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30, color, true);
      const a = Math.random() * Math.PI * 2;
      const v = spread * (0.35 + Math.random() * 0.9);
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v - 40;
      p.g = 60;
      p.drag = 2.4;
      p.spin = (Math.random() - 0.5) * 6;
      p.max = 0.55 + Math.random() * 0.45;
      p.s0 = 0.18 + Math.random() * 0.3;
      p.s1 = 0;
      p.fade = 'inout';
    }
  }

  /** A soft expanding ring of light: used for corks, reveals and taps. */
  pulse(x: number, y: number, color: number, size = 1): void {
    const r = this.spawn(this.tex.ring, x, y, color, true);
    r.vx = r.vy = r.g = r.drag = r.spin = 0;
    r.max = 0.5;
    r.s0 = 0.25 * size;
    r.s1 = 1.9 * size;
    const gl = this.spawn(this.tex.glow, x, y, color, true);
    gl.vx = gl.vy = gl.g = gl.drag = gl.spin = 0;
    gl.max = 0.4;
    gl.s0 = 0.7 * size;
    gl.s1 = 1.9 * size;
    gl.fade = 'inout';
    gl.peak = 0.55;
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
      p.s.width = 10;
      p.s.height = 16;
    }
  }

  /** One drifting mote of magic dust for the background. */
  mote(x: number, y: number): void {
    const p = this.spawn(this.tex.glow, x, y, Math.random() < 0.5 ? 0xffe9a8 : 0xc4a8ff, true);
    p.vx = (Math.random() - 0.5) * 16;
    p.vy = -(10 + Math.random() * 26);
    p.g = 0;
    p.drag = 0;
    p.spin = 0;
    p.max = 3.5 + Math.random() * 3;
    p.s0 = 0.05 + Math.random() * 0.09;
    p.s1 = p.s0;
    p.fade = 'inout';
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
        p.s.width = 10 * p.s0;
        p.s.height = 16 * p.s0 * Math.abs(Math.cos(p.life * p.flipRate));
      } else p.s.scale.set(p.s0 + (p.s1 - p.s0) * t);
      p.s.alpha = p.peak * (p.fade === 'inout' ? Math.sin(Math.PI * t) : t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4);
    }
  }
}
