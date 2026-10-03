// Backdrop and staging. Three stages share one 390 x 844 design space (rescue, roll, attack); each is
// fitted into the screen area the HUD and the install button leave free.
import { Container, Graphics, Sprite } from 'pixi.js';
import type { Art } from './art';
import { WORLD } from './level';

type Box = { x0: number; y0: number; x1: number; y1: number };

export class Scene {
  readonly stage = new Container();
  readonly rescue = new Container();
  readonly roll = new Container();
  readonly attack = new Container();
  /** Particles follow whichever stage is active, shake included. */
  readonly fxLayer = new Container();
  private bg: Sprite;
  private dim = new Graphics();
  active: Container = this.rescue;
  w = 1;
  h = 1;
  u = 4;
  portrait = true;
  shake = 0;

  constructor(art: Art) {
    this.bg = new Sprite(art.sky);
    this.bg.anchor.set(0.5, 1);
    this.dim.alpha = 0;
    this.roll.visible = false;
    this.attack.visible = false;
    this.stage.addChild(this.bg, this.rescue, this.dim, this.roll, this.attack, this.fxLayer);
  }

  /** Darkens everything behind the roll stage. */
  setDim(v: number): void {
    this.dim.alpha = v;
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.portrait = h >= w;
    this.u = this.portrait ? Math.min(w * 0.01, h * 0.0056, 6) : Math.min(w * 0.0062, h * 0.01, 6);
    // Cover-fit the town, anchored at the bottom so the skyline stays in view.
    const s = Math.max(w / 1400, h / 980);
    this.bg.scale.set(s);
    this.bg.position.set(w / 2, h);
    this.dim.clear().rect(-40, -40, w + 80, h + 80).fill(0x0c0428);
    // In landscape the crane's top is cropped a little so the board gets bigger.
    this.fit(this.rescue, this.portrait ? WORLD.rescue : { ...WORLD.rescue, y0: 120 });
    this.fit(this.roll, WORLD.roll);
    this.fit(this.attack, this.portrait ? WORLD.attack : { ...WORLD.attack, y0: 120 });
  }

  /** Room left for the world: below the headline, above the install button. */
  private area() {
    const u = this.u;
    if (this.portrait) return { x: u * 2, y: u * 25, w: this.w - u * 4, h: this.h - u * 25 - u * 21 };
    // Landscape: the HUD sits in the corners, so the world can use nearly the full height.
    return { x: u * 46, y: u * 2, w: this.w - u * 92, h: this.h - u * 4 };
  }

  private fit(c: Container, box: Box): void {
    const a = this.area();
    const bw = box.x1 - box.x0;
    const bh = box.y1 - box.y0;
    const k = Math.min(a.w / bw, a.h / bh, 2.2);
    c.scale.set(k);
    c.position.set(a.x + a.w / 2 - (box.x0 + bw / 2) * k, a.y + a.h / 2 - (box.y0 + bh / 2) * k);
  }

  toScreen(c: Container, x: number, y: number, out: { x: number; y: number }): void {
    out.x = c.x + x * c.scale.x + this.stage.x;
    out.y = c.y + y * c.scale.y + this.stage.y;
  }

  toWorld(c: Container, x: number, y: number, out: { x: number; y: number }): void {
    out.x = (x - c.x) / c.scale.x;
    out.y = (y - c.y) / c.scale.y;
  }

  update(dt: number): void {
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 16 : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 16 : 0;
    this.shake = Math.max(0, this.shake - dt * 2.4);
    this.stage.position.set(sx, sy);
    this.fxLayer.position.copyFrom(this.active.position);
    this.fxLayer.scale.copyFrom(this.active.scale);
  }
}
