// The match-3 board on screen: tile sprites keyed by the logic's tile ids, and the animations for a swap
// and for each wave of a move (pop, blasts, new boosters, falling tiles). It only animates what logic.ts decided.
import { Container, Graphics, Sprite } from 'pixi.js';
import { ease, lerp, tween, wait } from '@kit/tween';
import type { Art } from './art';
import type { Fx, FxTextures } from './fx';
import { isBooster, isColor, type Cleared, type Kind, type Logic, type Pos, type Tile, type Wave } from './logic';
import { TILE } from './palette';

export const CELL = 80;
const TILE_SIZE = CELL * 0.94;

interface TileView {
  id: number;
  kind: Kind;
  s: Sprite;
  /** Resting place in board units. */
  x: number;
  y: number;
  /** Extra scale on top of the base size, for pops and squash. */
  sx: number;
  sy: number;
  glow: Sprite | null;
}

export interface WaveHooks {
  /** A tile left the board here (board units). */
  cleared(c: Cleared, x: number, y: number): void;
  blast(kind: Kind, x: number, y: number, big: boolean): void;
}

export class BoardView {
  readonly root = new Container();
  readonly width: number;
  readonly height: number;
  private frame = new Graphics();
  private tilesLayer = new Container();
  private maskG = new Graphics();
  private views = new Map<number, TileView>();
  private time = 0;
  private wiggle: number[] = [];
  private selectedId = -1;

  constructor(private art: Art, private fxTex: FxTextures, private fx: Fx, private rows: number, private cols: number) {
    this.width = cols * CELL;
    this.height = rows * CELL;
    this.drawFrame();
    this.maskG.rect(-this.width / 2 - 4, -this.height / 2 - 4, this.width + 8, this.height + 8).fill(0xffffff);
    this.tilesLayer.mask = this.maskG;
    this.root.addChild(this.frame, this.maskG, this.tilesLayer);
  }

  private drawFrame(): void {
    const g = this.frame;
    const w = this.width;
    const h = this.height;
    const x0 = -w / 2;
    const y0 = -h / 2;
    // Gold rim, violet frame, then the lavender cells, like the real game's board
    g.roundRect(x0 - 22, y0 - 18, w + 44, h + 44, 30).fill({ color: 0x0c0430, alpha: 0.45 });
    g.roundRect(x0 - 22, y0 - 22, w + 44, h + 44, 30).fill(0xc98a12);
    g.roundRect(x0 - 19, y0 - 19, w + 38, h + 38, 27).fill(0xffd25a);
    g.roundRect(x0 - 14, y0 - 14, w + 28, h + 28, 22).fill(0x3a1d8a);
    g.roundRect(x0 - 6, y0 - 6, w + 12, h + 12, 16).fill(0x26106a);
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        const odd = (r + c) % 2 === 1;
        g.roundRect(x0 + c * CELL + 2, y0 + r * CELL + 2, CELL - 4, CELL - 4, 12).fill({ color: odd ? 0xb9b1f0 : 0xcbc5f7, alpha: 0.92 });
      }
    g.roundRect(x0 - 6, y0 - 6, w + 12, 10, 5).fill({ color: 0xffffff, alpha: 0.12 });
  }

  pos(r: number, c: number): { x: number; y: number } {
    return { x: (c - (this.cols - 1) / 2) * CELL, y: (r - (this.rows - 1) / 2) * CELL };
  }

  cellAt(x: number, y: number): Pos | null {
    const c = Math.floor((x + this.width / 2) / CELL);
    const r = Math.floor((y + this.height / 2) / CELL);
    return r >= 0 && r < this.rows && c >= 0 && c < this.cols ? { r, c } : null;
  }

  build(logic: Logic): void {
    for (const v of this.views.values()) v.s.destroy();
    this.views.clear();
    logic.grid.forEach((row, r) => row.forEach((t, c) => t && this.add(t, r, c)));
  }

  private add(t: Tile, r: number, c: number): TileView {
    const s = new Sprite(this.art.tiles[t.kind]);
    s.anchor.set(0.5);
    const p = this.pos(r, c);
    s.position.set(p.x, p.y);
    if (t.kind === 'rocketV') s.rotation = -Math.PI / 2;
    let glow: Sprite | null = null;
    if (isBooster(t.kind)) {
      glow = new Sprite(this.fxTex.glow);
      glow.anchor.set(0.5);
      glow.tint = t.kind === 'tnt' ? 0xffa040 : 0x8fd0ff;
      glow.blendMode = 'add';
      glow.position.copyFrom(s.position);
      this.tilesLayer.addChild(glow);
    }
    this.tilesLayer.addChild(s);
    const v: TileView = { id: t.id, kind: t.kind, s, x: p.x, y: p.y, sx: 1, sy: 1, glow };
    this.views.set(t.id, v);
    this.applyScale(v);
    return v;
  }

  private remove(v: TileView): void {
    this.views.delete(v.id);
    v.s.destroy();
    v.glow?.destroy();
  }

  private applyScale(v: TileView): void {
    // Boosters are drawn a touch larger than plain tiles so they stand out.
    const k = (TILE_SIZE / v.s.texture.width) * (isBooster(v.kind) ? 1.1 : 1);
    v.s.scale.set(k * v.sx, k * v.sy);
  }

  private viewAt(logic: Logic, p: Pos): TileView | undefined {
    const t = logic.at(p);
    return t ? this.views.get(t.id) : undefined;
  }

  /** Every tile drops in from above, column by column, as the ad opens. */
  async intro(): Promise<void> {
    const all = [...this.views.values()];
    await Promise.all(
      all.map((v) => {
        const col = Math.round(v.x / CELL + (this.cols - 1) / 2);
        const row = Math.round(v.y / CELL + (this.rows - 1) / 2);
        const from = v.y - this.height - 40;
        v.s.y = from;
        return tween({ dur: 0.42, delay: col * 0.035 + (this.rows - row) * 0.025, ease: ease.outBounce, update: (k) => (v.s.y = lerp(from, v.y, k)) });
      }),
    );
  }

  select(logic: Logic, p: Pos | null): void {
    const prev = this.views.get(this.selectedId);
    if (prev) {
      prev.sx = prev.sy = 1;
      this.applyScale(prev);
    }
    this.selectedId = p ? (logic.at(p)?.id ?? -1) : -1;
  }

  /** Tiles named here wobble to show the hint. */
  setHint(logic: Logic, cells: Pos[]): void {
    this.wiggle = cells.map((p) => logic.at(p)?.id ?? -1);
  }

  /** Before the logic swaps: animate the two tiles trading places, and back again if the swap is refused. */
  async swap(logic: Logic, a: Pos, b: Pos, ok: boolean): Promise<void> {
    const va = this.viewAt(logic, a);
    const vb = this.viewAt(logic, b);
    if (!va || !vb) return;
    this.tilesLayer.addChild(va.s);
    const pa = { x: va.x, y: va.y };
    const pb = { x: vb.x, y: vb.y };
    const go = (k: number) => {
      va.s.position.set(lerp(pa.x, pb.x, k), lerp(pa.y, pb.y, k));
      vb.s.position.set(lerp(pb.x, pa.x, k), lerp(pb.y, pa.y, k));
      // The moved tile swells a little on the way, the other ducks under it.
      const bulge = Math.sin(Math.PI * Math.min(1, Math.max(0, k)));
      va.sx = va.sy = 1 + 0.16 * bulge;
      vb.sx = vb.sy = 1 - 0.12 * bulge;
      this.applyScale(va);
      this.applyScale(vb);
    };
    if (ok) {
      await tween({ dur: 0.17, ease: ease.inOutQuad, update: go });
      va.x = pb.x;
      va.y = pb.y;
      vb.x = pa.x;
      vb.y = pa.y;
    } else {
      await tween({ dur: 0.15, ease: ease.inOutQuad, update: (k) => go(k * 0.78) });
      await tween({ dur: 0.22, ease: ease.outBack, update: (k) => go(0.78 * (1 - k)) });
    }
    va.sx = va.sy = vb.sx = vb.sy = 1;
    this.applyScale(va);
    this.applyScale(vb);
  }

  /** Plays one wave. `logic` is already past this wave; the board catches up. */
  async wave(w: Wave, hooks: WaveHooks): Promise<void> {
    const delays = new Map<number, number>();
    // Blasts spread outwards from their booster; chains go off one after another.
    const blastAt = (depth: number) => depth * 0.16;
    for (const b of w.blasts) {
      const p = this.pos(b.r, b.c);
      void wait(blastAt(b.depth)).then(() => hooks.blast(b.kind, p.x, p.y, b.big));
    }
    let last = 0;
    for (const cl of w.cleared) {
      let d = 0;
      if (cl.depth > 0 || w.blasts.length) {
        const src = w.blasts.filter((b) => b.depth <= cl.depth).reduce<{ d: number } | null>((best, b) => {
          const dd = Math.abs(b.r - cl.r) + Math.abs(b.c - cl.c);
          return !best || dd < best.d ? { d: dd } : best;
        }, null);
        d = (w.blasts.length ? blastAt(cl.depth) : 0) + (src ? src.d * 0.035 : 0);
      }
      delays.set(cl.id, d);
      last = Math.max(last, d);
    }

    // Tiles that merge into a new booster slide into its cell first.
    const merging = new Set<number>();
    for (const m of w.made) {
      const target = this.pos(m.r, m.c);
      for (const cl of w.cleared)
        if (cl.kind === m.from && cl.depth === 0 && (cl.r === m.r || cl.c === m.c) && Math.abs(cl.r - m.r) + Math.abs(cl.c - m.c) <= 4) {
          const v = this.views.get(cl.id);
          if (!v) continue;
          merging.add(cl.id);
          const fx = v.s.x;
          const fy = v.s.y;
          void tween({ dur: 0.2, ease: ease.inBack, update: (k) => v.s.position.set(lerp(fx, target.x, k), lerp(fy, target.y, k)) });
        }
    }

    const pops = w.cleared.map(async (cl) => {
      const v = this.views.get(cl.id);
      if (!v) return;
      await wait(merging.has(cl.id) ? 0.2 : delays.get(cl.id) ?? 0);
      const x = merging.has(cl.id) ? v.s.x : v.x;
      const y = merging.has(cl.id) ? v.s.y : v.y;
      if (isColor(cl.kind) && !merging.has(cl.id)) this.fx.shards(x, y, TILE[cl.kind].fx, 6);
      if (cl.kind === 'crate') {
        this.fx.splinters(x, y, 12);
        this.fx.smoke(x, y, 2, 30, 0xffd8a8);
      }
      hooks.cleared(cl, x, y);
      if (isBooster(cl.kind)) v.glow?.destroy(), (v.glow = null);
      await tween({
        dur: 0.16,
        ease: ease.linear,
        update: (k) => {
          v.sx = v.sy = k < 0.35 ? 1 + 0.35 * (k / 0.35) : 1.35 * (1 - (k - 0.35) / 0.65);
          this.applyScale(v);
          v.s.alpha = 1 - Math.max(0, k - 0.5) * 2;
        },
      });
      this.remove(v);
    });

    // New boosters appear where their match was.
    const made = w.made.map(async (m) => {
      await wait(0.2);
      const v = this.add({ id: m.id, kind: m.kind }, m.r, m.c);
      this.fx.pulse(v.x, v.y, 0xfff2a8, 0.9);
      this.fx.sparkle(v.x, v.y, 12, 0xfff2a8, 140);
      await tween({ dur: 0.38, ease: ease.outElastic, update: (k) => ((v.sx = v.sy = 0.2 + 0.8 * k), this.applyScale(v)) });
    });

    await Promise.all([...pops, ...made, wait(last + 0.16)]);

    // Gravity: everything falls at once, new tiles from above the board, with a little bounce on landing.
    const falls = w.falls.map(async (f) => {
      let v = this.views.get(f.id);
      const to = this.pos(f.r, f.c);
      if (!v) {
        v = this.add({ id: f.id, kind: f.kind }, f.r, f.c);
        v.s.y = this.pos(f.r0, f.c).y;
      }
      const view = v;
      const fromY = view.s.y;
      const dist = Math.max(0.5, (to.y - fromY) / CELL);
      view.x = to.x;
      view.y = to.y;
      await tween({ dur: 0.1 + Math.sqrt(dist) * 0.11, delay: (this.rows - f.r) * 0.012, ease: ease.inQuad, update: (k) => (view.s.y = lerp(fromY, to.y, k)) });
      view.s.x = to.x;
      if (view.glow) view.glow.position.set(to.x, to.y);
      await tween({ dur: 0.18, ease: ease.linear, update: (_k, t) => ((view.sy = 1 - 0.14 * Math.sin(Math.PI * t) * (1 - t)), (view.sx = 1 + 0.1 * Math.sin(Math.PI * t) * (1 - t)), this.applyScale(view)) });
    });
    await Promise.all(falls);
  }

  /** The board was reshuffled: every tile is swapped for the logic's new one with a pop. */
  async reshuffle(logic: Logic): Promise<void> {
    this.build(logic);
    for (const v of this.views.values()) {
      v.sx = v.sy = 0;
      this.applyScale(v);
    }
    await Promise.all([...this.views.values()].map((v, i) => tween({ dur: 0.3, delay: i * 0.008, ease: ease.outBack, update: (k) => ((v.sx = v.sy = k), this.applyScale(v)) })));
  }

  /** Everything flies off the board, used when the level is won and the dice come in. */
  async clearAway(): Promise<void> {
    const all = [...this.views.values()];
    await Promise.all(
      all.map((v, i) => {
        const x0 = v.s.x;
        const y0 = v.s.y;
        const vx = (Math.random() - 0.5) * 500;
        return tween({ dur: 0.6, delay: i * 0.006, ease: ease.linear, update: (_k, t) => (v.s.position.set(x0 + vx * t, y0 - 420 * t + 1600 * t * t), (v.s.rotation += 0.15), (v.s.alpha = 1 - t * 0.5)) });
      }),
    );
  }

  update(dt: number): void {
    this.time += dt;
    for (const v of this.views.values()) {
      // Boosters glow and breathe so they read as "tap me".
      if (v.glow) {
        v.glow.position.set(v.s.x, v.s.y);
        v.glow.scale.set(0.95 + 0.12 * Math.sin(this.time * 5 + v.id));
        v.glow.alpha = 0.6;
      }
    }
    for (const id of [this.selectedId, ...this.wiggle]) {
      const v = this.views.get(id);
      if (!v) continue;
      if (id === this.selectedId) {
        v.sx = v.sy = 1.12 + 0.03 * Math.sin(this.time * 10);
        this.applyScale(v);
      }
    }
    this.wiggle.forEach((id, i) => {
      const v = this.views.get(id);
      if (v) v.s.rotation = (v.kind === 'rocketV' ? -Math.PI / 2 : 0) + Math.sin(this.time * 14 + i * 1.3) * 0.12 * Math.max(0, Math.sin(this.time * 3.2));
    });
  }

  /** Board units of a cell's centre, for the hint hand and tests. */
  center(p: Pos): { x: number; y: number } {
    return this.pos(p.r, p.c);
  }

  resetWiggle(): void {
    for (const id of this.wiggle) {
      const v = this.views.get(id);
      if (v) v.s.rotation = v.kind === 'rocketV' ? -Math.PI / 2 : 0;
    }
    this.wiggle = [];
  }
}
