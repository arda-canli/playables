// Backdrop and staging. The ad has three stages (board, dice, vault); each is a container in its own
// units that gets fitted into the area the HUD and the install button leave free.
import { Container, Sprite, Texture } from 'pixi.js';
import { backdrop } from './art';
import type { FxTextures } from './fx';

export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Scene {
  readonly stage = new Container();
  readonly board = new Container();
  readonly roll = new Container();
  readonly vault = new Container();
  /** Particles live here; it copies the transform of whichever stage is active. */
  readonly fxLayer = new Container();
  /** Free-flying sprites in screen pixels (tiles flying to the goals, the die flying to the meter). */
  readonly overlay = new Container();

  private bg: Sprite;
  private halo: Sprite;
  private dark: Sprite;
  private bgRatio: number;
  active: Container = this.board;
  w = 1;
  h = 1;
  /** The HUD's CSS unit in pixels, mirrored from ui.css so canvas and HTML agree. */
  u = 4;
  portrait = true;
  area: Area = { x: 0, y: 0, w: 1, h: 1 };
  /** The dice and the vault have no headline above them, so they get a taller area. */
  metaArea: Area = { x: 0, y: 0, w: 1, h: 1 };
  /** Screen shake, decays by itself. */
  shake = 0;
  private time = 0;

  constructor(tex: FxTextures) {
    const c = backdrop();
    this.bgRatio = c.width / c.height;
    this.bg = new Sprite(Texture.from(c));
    this.bg.anchor.set(0.5);
    this.halo = new Sprite(tex.glow);
    this.halo.anchor.set(0.5);
    this.halo.tint = 0xc77dff;
    this.halo.alpha = 0.35;
    this.halo.blendMode = 'add';
    this.dark = new Sprite(Texture.WHITE);
    this.dark.tint = 0x0a0420;
    this.dark.alpha = 0;
    this.roll.visible = false;
    this.vault.visible = false;
    this.stage.addChild(this.bg, this.halo, this.dark, this.board, this.roll, this.vault, this.fxLayer, this.overlay);
  }

  setGloom(v: number): void {
    this.dark.alpha = v * 0.45;
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.portrait = h >= w;
    this.u = this.portrait ? Math.min(w * 0.01, h * 0.0056, 6) : Math.min(w * 0.0062, h * 0.01, 6);
    // Cover-fit the painted backdrop, anchored low so the rooftops stay in view.
    const s = Math.max(w / (this.bgRatio * 960), h / 960);
    this.bg.scale.set(s);
    this.bg.position.set(w / 2, h - (960 * s) / 2);
    this.dark.width = w;
    this.dark.height = h;
    this.halo.position.set(w * 0.5, h * 0.5);
    this.halo.scale.set((Math.max(w, h) * 1.1) / 128);
    const u = this.u;
    if (this.portrait) {
      // Below the HUD and headline, above the install button.
      const top = u * 44;
      const bottom = h - u * 23;
      this.area = { x: u * 2, y: top, w: w - u * 4, h: Math.max(80, bottom - top) };
      this.metaArea = { x: u * 2, y: u * 33, w: w - u * 4, h: Math.max(80, bottom - u * 33) };
    } else {
      // The HUD is a column on the left; the install button sits bottom right.
      const left = u * 50;
      this.area = { x: left, y: u * 13, w: Math.max(80, w - left - u * 50), h: h - u * 15 };
      this.metaArea = { x: left, y: u * 3, w: Math.max(80, w - left - u * 50), h: h - u * 6 };
    }
  }

  /** Scales a stage so a cw×ch box centred on its origin fills the free area. Returns the scale. */
  fit(c: Container, cw: number, ch: number, a: Area = this.area, max = 1.5): number {
    const k = Math.min(a.w / cw, a.h / ch, max);
    c.scale.set(k);
    c.position.set(a.x + a.w / 2, a.y + a.h / 2);
    return k;
  }

  toLocal(c: Container, px: number, py: number, out: { x: number; y: number }): void {
    out.x = (px - c.x) / c.scale.x;
    out.y = (py - c.y) / c.scale.y;
  }

  toScreen(c: Container, x: number, y: number, out: { x: number; y: number }): void {
    out.x = c.x + x * c.scale.x;
    out.y = c.y + y * c.scale.y;
  }

  update(dt: number): void {
    this.time += dt;
    this.halo.alpha = 0.3 + 0.06 * Math.sin(this.time * 0.8);
    // The particle layer follows the active stage, shake included.
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 18 : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 18 : 0;
    this.shake = Math.max(0, this.shake - dt * 2.6);
    this.stage.position.set(sx, sy);
    this.fxLayer.position.copyFrom(this.active.position);
    this.fxLayer.scale.copyFrom(this.active.scale);
  }
}
