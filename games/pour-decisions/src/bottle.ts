// A glass potion bottle drawn with Pixi Graphics. The liquid is re-drawn every frame so that its
// surface stays level with the world while the bottle tilts, sloshes when it moves, and can be
// poured out or filled unit by unit.
import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { ColorId, Unit } from './logic';
import { HIDDEN, LIQUID } from './palette';

export const UNIT_H = 38;
export const INSET = 5;
export const NECK_HALF = 17;
export const LIP_Y = 228; // distance from the bottle's base up to the pouring lip
const BODY_HALF = 34;
const FAR = 700;

export interface Layer {
  color: ColorId | null;
  hidden: boolean;
  /** 0..1 of one unit. Fractions exist only while a pour is in progress. */
  amount: number;
  /** 1 → 0 white flash used when a mystery layer is revealed. */
  flash: number;
}

interface Bubble {
  x: number;
  y: number;
  r: number;
  v: number;
  wob: number;
}

function outline(g: Graphics, inset: number): Graphics {
  const hw = BODY_HALF - inset;
  const nh = NECK_HALF - inset * 0.6;
  const r = 24 - inset;
  const b = -inset;
  return g
    .moveTo(-nh, -230)
    .lineTo(-nh, -202)
    .bezierCurveTo(-nh, -186, -hw, -192, -hw, -170)
    .lineTo(-hw, b - r)
    .quadraticCurveTo(-hw, b, -hw + r, b)
    .lineTo(hw - r, b)
    .quadraticCurveTo(hw, b, hw, b - r)
    .lineTo(hw, -170)
    .bezierCurveTo(hw, -192, nh, -186, nh, -202)
    .lineTo(nh, -230)
    .closePath();
}

/** The tilt at which a liquid column of this height just reaches the lip. */
export function tiltFor(height: number): number {
  return Math.atan2(LIP_Y - height, NECK_HALF);
}

export class BottleView {
  readonly root = new Container();
  readonly home = { x: 0, y: 0 };
  layers: Layer[] = [];
  /** Surface wave amplitude in pixels. Decays by itself. */
  wave = 0;
  /** 0..1 selection glow. */
  glow = 0;
  /** 0..1 how far the cork is pushed in. */
  cork = 0;
  /** 0..1 golden "complete" aura. */
  aura = 0;
  lift = 0;
  busy = false;
  complete = false;
  /** Ghost bottles (the "+1" offer) are drawn as a dashed outline only. */
  ghost = false;

  private liquid = new Graphics();
  private maskG = new Graphics();
  private back = new Graphics();
  private front = new Graphics();
  private corkG = new Graphics();
  private auraS: Sprite;
  private glowS: Sprite;
  private marks: Text[] = [];
  private bubbles: Bubble[] = [];
  private phase = Math.random() * 10;
  private fizz = 0;

  constructor(readonly index: number, glowTex: Texture) {
    this.auraS = new Sprite(glowTex);
    this.auraS.anchor.set(0.5);
    this.auraS.position.set(0, -110);
    this.auraS.scale.set(2.3, 3.2);
    this.auraS.blendMode = 'add';
    this.auraS.alpha = 0;
    this.glowS = new Sprite(glowTex);
    this.glowS.anchor.set(0.5);
    this.glowS.position.set(0, -110);
    this.glowS.scale.set(1.9, 2.9);
    this.glowS.blendMode = 'add';
    this.glowS.tint = 0x9fd0ff;
    this.glowS.alpha = 0;

    outline(this.back, 0).fill({ color: 0xcfe3ff, alpha: 0.1 });
    outline(this.maskG, INSET).fill(0xffffff);
    this.liquid.mask = this.maskG;

    // Glass: outline, lip ring and the highlights that make it read as a cylinder.
    const f = this.front;
    outline(f, 0).stroke({ width: 3.2, color: 0xcfe6ff, alpha: 0.8, join: 'round' });
    f.roundRect(-27, -166, 7, 124, 3.5).fill({ color: 0xffffff, alpha: 0.3 });
    f.roundRect(-16, -150, 3.5, 64, 1.75).fill({ color: 0xffffff, alpha: 0.18 });
    f.roundRect(24, -160, 3, 104, 1.5).fill({ color: 0xffffff, alpha: 0.13 });
    f.ellipse(0, -14, 20, 5).fill({ color: 0xffffff, alpha: 0.1 });
    f.roundRect(-22, -236, 44, 11, 5.5).fill({ color: 0xe3efff, alpha: 0.5 }).stroke({ width: 2.4, color: 0xd8eaff, alpha: 0.85 });

    const c = this.corkG;
    c.roundRect(-13, -250, 26, 30, 6).fill(0xb58150);
    c.roundRect(-13, -250, 9, 30, 4).fill({ color: 0x000000, alpha: 0.12 });
    c.roundRect(-16, -258, 32, 13, 6).fill(0xd9aa72).stroke({ width: 2, color: 0x8a5a30, alpha: 0.7 });
    c.roundRect(-10, -255, 14, 3, 1.5).fill({ color: 0xffffff, alpha: 0.35 });
    c.visible = false;

    this.root.addChild(this.auraS, this.glowS, this.back, this.liquid, this.maskG, this.front, this.corkG);
  }

  setUnits(units: Unit[]): void {
    this.layers = units.map((u) => ({ color: u.color, hidden: u.hidden, amount: 1, flash: 0 }));
  }

  /** Total liquid height in pixels, measured from the base. */
  get height(): number {
    return INSET + this.layers.reduce((s, l) => s + l.amount, 0) * UNIT_H;
  }

  get topColor(): number {
    const t = this.layers[this.layers.length - 1];
    return t ? (t.hidden || !t.color ? HIDDEN.base : LIQUID[t.color].base) : 0xffffff;
  }

  /** World position of the pouring lip for the current transform. side = +1 pours to the right. */
  lipWorld(side: number, out: { x: number; y: number }): void {
    const c = Math.cos(this.root.rotation);
    const s = Math.sin(this.root.rotation);
    const lx = side * NECK_HALF;
    const ly = -LIP_Y;
    out.x = this.root.x + lx * c - ly * s;
    out.y = this.root.y + lx * s + ly * c;
  }

  slosh(amount: number): void {
    this.wave = Math.max(this.wave, amount);
  }

  bubble(n: number): void {
    this.fizz += n;
  }

  update(dt: number, time: number): void {
    this.wave *= Math.exp(-2.6 * dt);
    const h = this.height;
    // Ambient bubbles plus a burst while the bottle is being filled.
    const upright = Math.abs(this.root.rotation) < 0.2 && !this.ghost;
    if (upright && h > INSET + 8) {
      this.fizz += dt * 1.1;
      while (this.fizz >= 1) {
        this.fizz -= 1;
        if (this.bubbles.length < 14) this.bubbles.push({ x: (Math.random() * 2 - 1) * 22, y: -INSET - Math.random() * 6, r: 1.6 + Math.random() * 2.6, v: 26 + Math.random() * 34, wob: Math.random() * 6 });
      }
    } else if (!upright) this.bubbles.length = 0;
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.y -= b.v * dt;
      b.x += Math.sin(time * 5 + b.wob) * 9 * dt;
      if (b.y < -h + 3) this.bubbles.splice(i, 1);
    }
    for (const l of this.layers) if (l.flash > 0) l.flash = Math.max(0, l.flash - dt * 2.2);

    this.draw(time);
    this.glowS.alpha = this.glow * 0.55;
    this.auraS.alpha = this.aura * (0.34 + 0.08 * Math.sin(time * 3 + this.phase));
    this.corkG.visible = this.cork > 0.001;
    if (this.corkG.visible) {
      this.corkG.y = -(1 - this.cork) * 90;
      this.corkG.alpha = Math.min(1, this.cork * 3);
    }
  }

  setAuraColor(color: number): void {
    this.auraS.tint = color;
  }

  private draw(time: number): void {
    const g = this.liquid;
    g.clear();
    if (this.ghost) return;
    const rot = this.root.rotation;
    const tan = Math.tan(rot);
    const cos = Math.cos(rot);
    // World-down expressed in the bottle's own coordinates.
    const dx = Math.sin(rot) * FAR;
    const dy = Math.cos(rot) * FAR;

    // Heights of every layer top, bottom layer first.
    const tops: number[] = [];
    let acc = INSET;
    for (const l of this.layers) {
      acc += l.amount * UNIT_H;
      tops.push(acc);
    }

    const amp = this.wave * Math.max(0.15, cos);
    for (let k = this.layers.length - 1; k >= 0; k--) {
      const l = this.layers[k];
      if (l.amount <= 0.001) continue;
      const pal = l.hidden || !l.color ? HIDDEN : LIQUID[l.color];
      const isTop = k === this.layers.length - 1 || this.layers.slice(k + 1).every((u) => u.amount <= 0.001);
      const y0 = -tops[k];
      const pts: number[] = [];
      for (let x = -44; x <= 44; x += 8) {
        const w = isTop ? amp * Math.sin(x * 0.085 + time * 7 + this.phase) : 0;
        pts.push(x, y0 - x * tan + w);
      }
      const n = pts.length;
      const poly = [...pts, pts[n - 2] + dx, pts[n - 1] + dy, pts[0] + dx, pts[1] + dy];
      g.poly(poly).fill(pal.base);
      if (isTop) {
        // Bright meniscus along the surface
        const band: number[] = [...pts];
        for (let i = n - 2; i >= 0; i -= 2) band.push(pts[i] + (dx / FAR) * 6, pts[i + 1] + (dy / FAR) * 6);
        g.poly(band).fill({ color: pal.light, alpha: 0.9 });
      } else if (this.layers[k + 1] && (this.layers[k + 1].color !== l.color || this.layers[k + 1].hidden !== l.hidden)) {
        // A soft edge only where two different potions meet, so one colour reads as one body of liquid.
        const band: number[] = [...pts];
        for (let i = n - 2; i >= 0; i -= 2) band.push(pts[i] + (dx / FAR) * 3, pts[i + 1] + (dy / FAR) * 3);
        g.poly(band).fill({ color: pal.deep, alpha: 0.35 });
      }
      if (l.flash > 0) g.poly(poly).fill({ color: 0xffffff, alpha: l.flash * 0.85 });
    }

    // Cylinder shading over all liquid, then bubbles.
    g.rect(8, -240, 30, 250).fill({ color: 0x000000, alpha: 0.1 });
    g.rect(22, -240, 16, 250).fill({ color: 0x000000, alpha: 0.1 });
    g.rect(-34, -240, 12, 250).fill({ color: 0xffffff, alpha: 0.1 });
    for (const b of this.bubbles) g.circle(b.x, b.y, b.r).fill({ color: 0xffffff, alpha: 0.38 });

    // "?" marks sit on hidden layers.
    let mi = 0;
    if (Math.abs(rot) < 0.02) {
      this.layers.forEach((l, k) => {
        if (!l.hidden) return;
        let m = this.marks[mi];
        if (!m) {
          m = new Text({ text: '?', style: { fontFamily: 'Fredoka, Arial Rounded MT Bold, Arial, sans-serif', fontSize: 27, fontWeight: '600', fill: 0xb9bfe6 } });
          m.anchor.set(0.5);
          this.marks[mi] = m;
          this.root.addChildAt(m, this.root.getChildIndex(this.front));
        }
        m.visible = true;
        m.position.set(0, -(tops[k] - UNIT_H / 2));
        m.scale.set(1 + 0.07 * Math.sin(time * 3.2 + k * 1.3 + this.phase));
        mi++;
      });
    }
    for (let i = mi; i < this.marks.length; i++) this.marks[i].visible = false;
  }

  /** Turns this view into the dashed "+1" offer. */
  makeGhost(): void {
    this.ghost = true;
    this.back.clear();
    outline(this.back, 0).fill({ color: 0x7dffb0, alpha: 0.14 });
    this.front.clear();
    const dash = new Graphics();
    outline(dash, 0).stroke({ width: 3.4, color: 0x7dffb0, alpha: 0.95, join: 'round' });
    this.front.addChild(dash);
    this.glowS.tint = 0x5dff9d;
    const plus = new Text({ text: '+1', style: { fontFamily: 'Fredoka, Arial Rounded MT Bold, Arial, sans-serif', fontSize: 40, fontWeight: '600', fill: 0x9dffc4 } });
    plus.anchor.set(0.5);
    plus.position.set(0, -104);
    this.root.addChild(plus);
  }
}
