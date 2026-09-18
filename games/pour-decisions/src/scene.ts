// Backdrop and staging: a night-time potion shelf. Everything is drawn in code.
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Textures } from './fx';

export const SPACING = 122;
export const BOTTLE_TOP = 236; // height of a bottle above its base
const POUR_ROOM = 126; // clear space needed above a row for the pouring bottle

export interface Slot {
  x: number;
  y: number;
}

export class Scene {
  readonly stage = new Container();
  /** Scaled play space. Origin is the centre of the play area. */
  readonly world = new Container();
  readonly shelves = new Graphics();
  readonly shadows = new Container();
  readonly bottles = new Container();
  readonly streams = new Graphics();
  readonly fxLayer = new Container();

  private bg: Sprite;
  private halo: Sprite;
  private halo2: Sprite;
  private stars: { s: Sprite; phase: number; base: number }[] = [];
  private starLayer = new Container();
  private dark: Sprite;
  private vignette: Sprite;
  scale = 1;
  w = 1;
  h = 1;
  portrait = true;

  constructor(tex: Textures) {
    // Vertical gradient baked into a tiny texture and stretched.
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#1d1147');
    grad.addColorStop(0.45, '#3a1f86');
    grad.addColorStop(0.8, '#2a1563');
    grad.addColorStop(1, '#120a2e');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    this.bg = new Sprite(Texture.from(c));

    this.halo = new Sprite(tex.glow);
    this.halo.anchor.set(0.5);
    this.halo.tint = 0xb45cff;
    this.halo.alpha = 0.5;
    this.halo.blendMode = 'add';
    this.halo2 = new Sprite(tex.glow);
    this.halo2.anchor.set(0.5);
    this.halo2.tint = 0x3fd0ff;
    this.halo2.alpha = 0.22;
    this.halo2.blendMode = 'add';

    for (let i = 0; i < 70; i++) {
      const s = new Sprite(i % 9 === 0 ? tex.star : tex.dot);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      const base = i % 9 === 0 ? 0.12 + Math.random() * 0.12 : 0.04 + Math.random() * 0.07;
      s.scale.set(base);
      s.tint = [0xffffff, 0xcdb8ff, 0xfff0b8][i % 3];
      this.stars.push({ s, phase: Math.random() * 10, base });
      this.starLayer.addChild(s);
    }

    // Darkened corners give the flat backdrop some depth.
    const vc = document.createElement('canvas');
    vc.width = vc.height = 128;
    const vg = vc.getContext('2d')!;
    const vr = vg.createRadialGradient(64, 64, 26, 64, 64, 90);
    vr.addColorStop(0, 'rgba(8,4,28,0)');
    vr.addColorStop(1, 'rgba(8,4,28,0.62)');
    vg.fillStyle = vr;
    vg.fillRect(0, 0, 128, 128);
    this.vignette = new Sprite(Texture.from(vc));

    this.dark = new Sprite(Texture.WHITE);
    this.dark.tint = 0x0a0620;
    this.dark.alpha = 0;

    this.world.addChild(this.shelves, this.shadows, this.bottles, this.streams, this.fxLayer);
    this.stage.addChild(this.bg, this.halo2, this.halo, this.starLayer, this.vignette, this.dark, this.world);
  }

  /** Dims the backdrop (used when the player gets stuck). 0..1 */
  setGloom(v: number): void {
    this.dark.alpha = v * 0.45;
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.portrait = h >= w;
    this.bg.width = w;
    this.bg.height = h;
    this.dark.width = w;
    this.dark.height = h;
    this.vignette.width = w;
    this.vignette.height = h;
    const m = Math.max(w, h);
    this.halo.position.set(w * 0.5, h * 0.46);
    this.halo.scale.set((m * 1.25) / 128);
    this.halo2.position.set(w * 0.2, h * 0.12);
    this.halo2.scale.set((m * 0.9) / 128);
    this.stars.forEach((st, i) => {
      // Deterministic scatter, denser towards the top.
      const rx = ((i * 7919) % 1000) / 1000;
      const ry = ((i * 104729) % 1000) / 1000;
      st.s.position.set(rx * w, ry * ry * h * 0.95);
    });
  }

  /**
   * Slot positions for `count` bottles. Portrait uses two rows, landscape one.
   * Also fits and centres the world inside the area left free by the HUD and the CTA.
   */
  layout(count: number): Slot[] {
    const rows: number[] = this.portrait ? [Math.ceil(count / 2), Math.floor(count / 2)] : [count];
    const rowGap = BOTTLE_TOP + POUR_ROOM + 8;
    const slots: Slot[] = [];
    rows.forEach((n, r) => {
      for (let i = 0; i < n; i++) slots.push({ x: (i - (n - 1) / 2) * SPACING, y: r * rowGap });
    });
    const widest = Math.max(...rows);
    const contentW = widest * SPACING + 30;
    const top = -(BOTTLE_TOP + POUR_ROOM);
    const bottom = (rows.length - 1) * rowGap + 46;
    const safeTop = this.h * (this.portrait ? 0.165 : 0.16);
    // Landscape keeps the bottom strip free for the install button, which sits bottom-right there.
    const safeBottom = this.h * (this.portrait ? 0.865 : 0.8);
    this.scale = Math.min((this.w * 0.96) / contentW, (safeBottom - safeTop) / (bottom - top), 1.6);
    this.world.scale.set(this.scale);
    this.world.position.set(this.w / 2, safeTop + (safeBottom - safeTop) / 2 - ((top + bottom) / 2) * this.scale);

    // Shelves
    const g = this.shelves;
    g.clear();
    rows.forEach((n, r) => {
      const y = r * rowGap;
      const half = (Math.max(n, widest - (this.portrait ? 1 : 0)) * SPACING) / 2 + 26;
      g.roundRect(-half, y + 3, half * 2, 30, 10).fill(0x3d2312);
      g.roundRect(-half, y, half * 2, 24, 9).fill(0x8a5630);
      g.roundRect(-half, y, half * 2, 9, 5).fill(0xb67a45);
      g.roundRect(-half + 8, y + 2, half * 2 - 16, 2.5, 1.2).fill({ color: 0xffffff, alpha: 0.22 });
      for (const sx of [-1, 1]) g.roundRect(sx * (half - 58) - 9, y + 24, 18, 22, 5).fill(0x5a3519);
      // The shelf's own shadow on the wall
      g.roundRect(-half + 10, y + 34, half * 2 - 20, 16, 8).fill({ color: 0x000000, alpha: 0.18 });
    });
    // Contact shadows where the bottles stand
    for (const s of slots) g.ellipse(s.x, s.y + 3, 38, 7).fill({ color: 0x1a0d05, alpha: 0.4 });
    return slots;
  }

  toWorld(px: number, py: number, out: { x: number; y: number }): void {
    out.x = (px - this.world.x) / this.scale;
    out.y = (py - this.world.y) / this.scale;
  }

  toScreen(wx: number, wy: number, out: { x: number; y: number }): void {
    out.x = this.world.x + wx * this.scale;
    out.y = this.world.y + wy * this.scale;
  }

  update(time: number): void {
    for (const st of this.stars) st.s.scale.set(st.base * (0.65 + 0.35 * Math.sin(time * 1.8 + st.phase)));
    this.halo.alpha = 0.46 + 0.06 * Math.sin(time * 0.7);
  }
}
