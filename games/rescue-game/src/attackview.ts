// The attack stage: Mary's crane with crosshairs, and a slingshot with the squad's attacker in it.
// Pull back, aim along the dotted arc, let go. A generous aim assist snaps a near shot onto a target.
import { Container, Graphics, Sprite } from 'pixi.js';
import { clamp, ease, lerp, tween } from '@kit/tween';
import type { Art } from './art';
import type { Fx } from './fx';

export interface Target {
  name: 'cab' | 'bucket' | 'tower';
  x: number;
  y: number;
}

export const TARGETS: Target[] = [
  { name: 'cab', x: 270, y: 197 },
  { name: 'bucket', x: 112, y: 252 },
  { name: 'tower', x: 313, y: 500 },
];
export const REST = { x: 195, y: 668 };
const TIPS = [
  { x: 136, y: 650 },
  { x: 254, y: 650 },
];
const MAX_PULL = 125;
const GRAV = 380;
const POWER = 7.4;

export interface Shot {
  from: { x: number; y: number };
  v: { x: number; y: number };
  /** Time to the target, or the whole flight for a miss. */
  T: number;
  target: Target | null;
}

export class AttackView {
  readonly root = new Container();
  readonly mary: Sprite;
  readonly cab = new Container();
  readonly jibPivot = new Container();
  private bucket: Sprite;
  private cable = new Graphics();
  private crosses: Sprite[] = [];
  private bandBack = new Graphics();
  private bandFront = new Graphics();
  private dots = new Graphics();
  private shield = new Graphics();
  readonly ammo: Sprite;
  pouch = { ...REST };
  pulling = false;
  flying = false;
  private time = 0;

  constructor(private art: Art, private fx: Fx) {
    const r = this.root;
    const ground = new Graphics().rect(-600, 560, 1600, 900).fill(0x1b0b4d).rect(-600, 556, 1600, 7).fill(0xffc93c);
    const tower = new Sprite(art.tower);
    tower.position.set(300, 118);
    tower.height = 444;
    // The jib hangs off a pivot at the top of the tower, so it can swing down when the crane breaks.
    this.jibPivot.position.set(313, 150);
    const jib = new Sprite(art.jib);
    jib.position.set(-273, 0);
    jib.width = 380;
    this.jibPivot.addChild(jib);
    const cabArt = new Sprite(art.cab);
    this.mary = new Sprite(art.mary);
    this.mary.anchor.set(0.5, 0.54);
    this.mary.position.set(34, 28);
    this.cab.addChild(cabArt, this.mary);
    this.cab.position.set(236, 168);
    this.bucket = new Sprite(art.bucket);
    this.bucket.anchor.set(0.5, 0.15);
    this.bucket.position.set(112, 232);
    // Far away, bottom left: the tank with your pig in it. The reason for all this.
    const tank = new Graphics()
      .rect(40, 452, 110, 106)
      .fill({ color: 0xbfe6ff, alpha: 0.1 })
      .stroke({ width: 3, color: 0xd5f1ff, alpha: 0.8 })
      .roundRect(34, 446, 122, 9, 4)
      .fill(0xffc93c);
    const pile = new Graphics();
    for (let i = 0; i < 90; i++) {
      const x = 44 + Math.random() * 102;
      const y = 556 - Math.random() * (30 + (x < 100 ? 26 : 0));
      pile.roundRect(x, y, 7, 4.5, 1).fill([0xc9643c, 0xd9774c, 0xb4532e, 0xe48c5c][i % 4]);
    }
    const pig = new Sprite(art.pig.scared);
    pig.anchor.set(0.5, 118 / 120);
    pig.scale.set(0.5);
    pig.position.set(118, 530);
    r.addChild(ground, tower, this.cable, this.bucket, this.jibPivot, this.cab, tank, pig, pile);

    for (const t of TARGETS) {
      const c = new Sprite(art.cross);
      c.anchor.set(0.5);
      c.position.set(t.x, t.y);
      c.scale.set(t.name === 'cab' ? 1 : 0.8);
      this.crosses.push(c);
      r.addChild(c);
    }
    r.addChild(this.shield, this.dots);
    const sling = new Sprite(art.sling);
    const k = (TIPS[1].x - TIPS[0].x) / 112;
    sling.scale.set(k);
    sling.position.set(TIPS[0].x - 14 * k, TIPS[0].y - 16 * k);
    this.ammo = new Sprite(art.attacker);
    this.ammo.anchor.set(0.5, 118 / 124);
    r.addChild(sling, this.bandBack, this.ammo, this.bandFront);
    this.place();
  }

  /** Drag the pouch towards a world point, clamped to the slingshot's reach. */
  pull(x: number, y: number): void {
    let dx = x - REST.x;
    let dy = Math.max(-20, y - REST.y);
    const d = Math.hypot(dx, dy);
    if (d > MAX_PULL) {
      dx *= MAX_PULL / d;
      dy *= MAX_PULL / d;
    }
    this.pouch = { x: REST.x + dx, y: REST.y + dy };
    this.place();
  }

  get stretch(): number {
    return Math.hypot(this.pouch.x - REST.x, this.pouch.y - REST.y) / MAX_PULL;
  }

  /** Where the shot would go from the current pull, with the assist applied. */
  aim(assistAll = false): Shot | null {
    const from = { x: this.pouch.x, y: this.pouch.y - 50 };
    const v = { x: (REST.x - this.pouch.x) * POWER, y: (REST.y - this.pouch.y) * POWER };
    if (Math.hypot(v.x, v.y) < 140) return null;
    let best: Target | null = null;
    let bestD = assistAll ? Infinity : 105;
    let bestT = 1.6;
    for (const t of TARGETS) {
      for (let s = 0.04; s < 1.6; s += 0.02) {
        const px = from.x + v.x * s;
        const py = from.y + v.y * s + 0.5 * GRAV * s * s;
        const d = Math.hypot(px - t.x, py - t.y) * (t.name === 'cab' ? 0.8 : 1);
        if (d < bestD) {
          bestD = d;
          best = t;
          bestT = s;
        }
      }
    }
    if (!best) return { from, v, T: 1.6, target: null };
    // Same flight time, but exactly onto the target.
    const T = clamp(bestT, 0.35, 1.3);
    return { from, v: { x: (best.x - from.x) / T, y: (best.y - from.y - 0.5 * GRAV * T * T) / T }, T, target: best };
  }

  /** The dotted arc while pulling. */
  drawAim(): void {
    const g = this.dots.clear();
    if (!this.pulling) return;
    const from = { x: this.pouch.x, y: this.pouch.y - 50 };
    const v = { x: (REST.x - this.pouch.x) * POWER, y: (REST.y - this.pouch.y) * POWER };
    if (Math.hypot(v.x, v.y) < 140) return;
    for (let i = 1; i < 22; i++) {
      const s = i * 0.055;
      const x = from.x + v.x * s;
      const y = from.y + v.y * s + 0.5 * GRAV * s * s;
      if (y < 60 || x < -20 || x > 410) break;
      g.circle(x, y, 6 - i * 0.18).fill({ color: 0xffffff, alpha: 0.95 - i * 0.035 });
    }
  }

  private place(): void {
    this.ammo.position.set(this.pouch.x, this.pouch.y + 8);
    this.ammo.rotation = (this.pouch.x - REST.x) * -0.004;
    const draw = (g: Graphics, tip: { x: number; y: number }, side: number) => {
      const end = { x: this.pouch.x + side * 22, y: this.pouch.y + 4 };
      g.clear().moveTo(tip.x, tip.y).lineTo(end.x, end.y).stroke({ width: 10, color: 0x3a1d08, cap: 'round' }).moveTo(tip.x, tip.y).lineTo(end.x, end.y).stroke({ width: 6, color: 0x8a4a22, cap: 'round' });
    };
    draw(this.bandBack, TIPS[0], -1);
    draw(this.bandFront, TIPS[1], 1);
    this.bandFront.moveTo(this.pouch.x - 26, this.pouch.y + 2).quadraticCurveTo(this.pouch.x, this.pouch.y + 20, this.pouch.x + 26, this.pouch.y + 2).stroke({ width: 12, color: 0x3a1d08, cap: 'round' });
    this.bandFront.moveTo(this.pouch.x - 26, this.pouch.y + 2).quadraticCurveTo(this.pouch.x, this.pouch.y + 20, this.pouch.x + 26, this.pouch.y + 2).stroke({ width: 7, color: 0x9a5a28, cap: 'round' });
  }

  /** Fly the shot. Resolves at the target (or when a miss has flown off). */
  async fly(shot: Shot, blocked: boolean): Promise<'hit' | 'miss' | 'blocked'> {
    this.flying = true;
    this.pulling = false;
    this.dots.clear();
    // The bands snap back to rest while the attacker leaves.
    const snapFrom = { ...this.pouch };
    void tween({ dur: 0.18, ease: ease.outBack, update: (k) => ((this.pouch = { x: lerp(snapFrom.x, REST.x, k), y: lerp(snapFrom.y, REST.y, k) }), this.placeBands()) });
    const a = this.ammo;
    const T = blocked && shot.target ? shot.T * 0.86 : shot.T;
    await tween({
      dur: T,
      ease: ease.linear,
      update: (_k, t) => {
        const s = t * T;
        a.position.set(shot.from.x + shot.v.x * s, shot.from.y + 50 * lerp(1, 0.45, t) + shot.v.y * s + 0.5 * GRAV * s * s);
        a.scale.set(lerp(1, 0.45, t));
        a.rotation += 0.25;
        if (Math.random() < 0.5) this.fx.sparkle(a.x, a.y - 20, 1, 0xfff2a8, 20);
      },
    });
    if (!shot.target) {
      a.visible = false;
      this.flying = false;
      return 'miss';
    }
    if (blocked) {
      // Mary's shield: a dome flashes up and the attacker bounces off it.
      const t = shot.target;
      void tween({ dur: 0.9, ease: ease.linear, update: (k, raw) => this.drawShield(t.x, t.y, raw) });
      const from = { x: a.x, y: a.y };
      await tween({ dur: 0.9, ease: ease.linear, update: (_k, s) => (a.position.set(from.x - 120 * s, from.y - 80 * s + 520 * s * s), (a.rotation -= 0.3), (a.alpha = 1 - s * 0.6)) });
      a.visible = false;
      this.flying = false;
      return 'blocked';
    }
    a.visible = false;
    this.flying = false;
    return 'hit';
  }

  private placeBands(): void {
    this.place();
    this.ammo.position.set(-999, -999);
  }

  private drawShield(x: number, y: number, t: number): void {
    const g = this.shield.clear();
    if (t >= 1) return;
    const a = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
    g.circle(x, y, 62 + t * 10).fill({ color: 0x4f7dff, alpha: 0.28 * a }).stroke({ width: 5, color: 0xbfe0ff, alpha: 0.9 * a });
    g.circle(x - 18, y - 22, 14).fill({ color: 0xffffff, alpha: 0.35 * a });
  }

  /** Back in the pouch for another try. */
  reload(): void {
    this.pouch = { ...REST };
    this.place();
    this.ammo.visible = true;
    this.ammo.alpha = 1;
    this.ammo.scale.set(0.2);
    void tween({ dur: 0.35, ease: ease.outBack, update: (k) => this.ammo.scale.set(lerp(0.2, 1, k)) });
  }

  /** The crane comes down: the jib swings, the cab tumbles, the bucket drops. */
  collapse(): void {
    this.mary.texture = this.art.maryShock;
    for (const c of this.crosses) c.visible = false;
    void tween({ dur: 1.1, ease: ease.inQuad, update: (k) => (this.jibPivot.rotation = -0.62 * k) });
    void tween({ dur: 1.2, ease: ease.inQuad, update: (k) => ((this.cab.y = 168 + 420 * k * k), (this.cab.rotation = 1.2 * k), (this.cab.x = 236 - 40 * k)) });
    void tween({ dur: 0.9, ease: ease.inQuad, update: (k) => ((this.bucket.y = 232 + 360 * k * k), (this.bucket.rotation = 2 * k)) });
  }

  update(dt: number): void {
    this.time += dt;
    this.crosses.forEach((c, i) => (c.alpha = 0.75 + 0.25 * Math.sin(this.time * 5 + i)));
    this.crosses.forEach((c, i) => c.scale.set((i === 0 ? 1 : 0.8) * (1 + 0.06 * Math.sin(this.time * 5 + i))));
    const g = this.cable.clear();
    g.moveTo(112, 168).lineTo(this.bucket.x, this.bucket.y).stroke({ width: 2.5, color: 0xd9dde5 });
    if (!this.flying && !this.pulling) this.mary.y = 28 - Math.abs(Math.sin(this.time * 5)) * 2;
    this.drawAim();
  }
}
