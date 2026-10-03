// The rescue stage on screen: Mary's crane and bucket, the glass tank, the pig on his pedestal,
// the board and the bricks. It draws what the Rescue simulation says and animates the moves.
import { Container, Graphics, Particle, ParticleContainer, Sprite } from 'pixi.js';
import { clamp, ease, lerp, tween } from '@kit/tween';
import type { Art } from './art';
import type { Fx } from './fx';
import { BOARD, BOARD_H, BOARD_W, BUCKET, CELL, COLS, DANGER_Y, GRID, LEDGE, PIG, ROWS, SAND, TANK, type Pos } from './level';
import type { Rescue } from './rig';

const BRICK_TINTS = [0xffffff, 0xf3d9c9, 0xffe4d2, 0xe9c6b2];
const TILE = CELL * 0.98;

export class RescueView {
  readonly root = new Container();
  readonly tiles: (Sprite | null)[][] = [];
  readonly pig: Sprite;
  readonly mary: Sprite;
  readonly bucket: Sprite;
  readonly jib: Sprite;
  readonly cab: Container;
  private cable = new Graphics();
  private cells = new Graphics();
  private danger = new Graphics();
  private glass = new Graphics();
  private bricks: ParticleContainer;
  private parts: Particle[] = [];
  private tension = 0;
  private time = 0;
  /** Bucket tilt: 1 pouring, 0 held level while Mary gloats. */
  pourTilt = 1;
  freed = false;

  constructor(private art: Art, private rig: Rescue, private fx: Fx) {
    const r = this.root;
    // Crane behind everything: tower on the right, jib across the top, the cab with Mary in it.
    const tower = new Sprite(art.tower);
    tower.position.set(354, 92);
    tower.height = 390;
    this.jib = new Sprite(art.jib);
    this.jib.position.set(110, 106);
    this.jib.width = 300;
    this.cab = new Container();
    const cab = new Sprite(art.cab);
    this.mary = new Sprite(art.mary);
    this.mary.anchor.set(0.5, 0.54);
    this.mary.position.set(34, 28);
    this.cab.addChild(cab, this.mary);
    this.cab.position.set(318, 126);
    this.bucket = new Sprite(art.bucket);
    this.bucket.anchor.set(0.5, 0.15);
    this.bucket.position.set(BUCKET.x, BUCKET.y - 20);
    r.addChild(tower, this.jib, this.cab, this.cable, this.bucket);

    // Tank: a faint back panel, the pedestal, the pig.
    const back = new Graphics().rect(TANK.x0, TANK.y0, TANK.x1 - TANK.x0, TANK.y1 - TANK.y0).fill({ color: 0x0c0630, alpha: 0.42 });
    const ped = new Sprite(art.pedestal);
    ped.position.set(LEDGE.x0, LEDGE.y);
    ped.width = LEDGE.x1 - LEDGE.x0;
    ped.height = TANK.y1 - LEDGE.y;
    this.pig = new Sprite(art.pig.scared);
    this.pig.anchor.set(0.5, 118 / 120);
    this.pig.position.set(PIG.x, PIG.y);
    r.addChild(back, ped, this.pig);

    // Board frame and cells; holes show as dark wells the bricks fall into.
    const frame = new Graphics()
      .roundRect(BOARD.x - 9, BOARD.y - 4, BOARD_W + 18, BOARD_H + 14, 12)
      .fill(0xd38c00)
      .roundRect(BOARD.x - 9, BOARD.y - 4, BOARD_W + 18, BOARD_H + 14, 12)
      .stroke({ width: 3, color: 0x7a4b00 })
      .roundRect(BOARD.x - 5, BOARD.y, BOARD_W + 10, BOARD_H + 6, 9)
      .stroke({ width: 3, color: 0xffe27a })
      .roundRect(BOARD.x - 2, BOARD.y, BOARD_W + 4, BOARD_H + 3, 7)
      .fill(0x22105a);
    r.addChild(frame, this.cells);

    // Bricks: one particle per grain, all sharing one texture. Drawn over the pig so he gets buried.
    this.bricks = new ParticleContainer({ dynamicProperties: { position: true, color: true, rotation: false, vertex: false, uvs: false } });
    r.addChild(this.bricks);

    for (let row = 0; row < ROWS; row++) {
      this.tiles.push([]);
      for (let c = 0; c < COLS; c++) {
        const k = rig.board.cells[row][c];
        if (!k) {
          this.tiles[row].push(null);
          continue;
        }
        const s = new Sprite(art.tiles[k]);
        s.anchor.set(0.5);
        s.width = s.height = TILE;
        const p = this.cellCenter({ r: row, c });
        s.position.set(p.x, p.y);
        r.addChild(s);
        this.tiles[row].push(s);
      }
    }
    // Glass in front: walls, a highlight, the gold rim, and the danger line painted on it.
    r.addChild(this.glass, this.danger);
    this.drawCells();
    this.drawGlass();
    rig.onExit = (col, seed) => this.fx.brick(GRID.x + (col + 0.5) * SAND, BOARD.y + BOARD_H + 2, seed);
  }

  cellCenter(p: Pos): { x: number; y: number } {
    return { x: BOARD.x + (p.c + 0.5) * CELL, y: BOARD.y + (p.r + 0.5) * CELL };
  }

  /** Board cell under a world point, or null. */
  cellAt(x: number, y: number): Pos | null {
    const c = Math.floor((x - BOARD.x) / CELL);
    const r = Math.floor((y - BOARD.y) / CELL);
    return r >= 0 && r < ROWS && c >= 0 && c < COLS ? { r, c } : null;
  }

  drawCells(): void {
    const g = this.cells.clear();
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const hole = this.rig.board.cells[r][c] === null;
        g.roundRect(BOARD.x + c * CELL + 1.5, BOARD.y + r * CELL + 1.5, CELL - 3, CELL - 3, 6).fill(hole ? 0x0d0626 : (r + c) % 2 ? 0x33207a : 0x3c2486);
      }
  }

  private drawGlass(): void {
    const g = this.glass;
    const { x0, x1, y0, y1 } = TANK;
    g.rect(x0, y0, x1 - x0, y1 - y0).fill({ color: 0xbfe6ff, alpha: 0.06 });
    g.moveTo(x0 + 2, y0).lineTo(x0 + 2, y1).moveTo(x1 - 2, y0).lineTo(x1 - 2, y1).stroke({ width: 4, color: 0xd5f1ff, alpha: 0.85 });
    g.moveTo(x0 + 16, y0 + 40).lineTo(x0 + 46, y0 + 10).moveTo(x0 + 16, y0 + 84).lineTo(x0 + 92, y0 + 10).stroke({ width: 5, color: 0xffffff, alpha: 0.3, cap: 'round' });
    g.moveTo(x1 - 16, y1 - 70).lineTo(x1 - 16, y0 + 40).stroke({ width: 4, color: 0xffffff, alpha: 0.25, cap: 'round' });
    g.roundRect(x0 - 8, y0 - 10, x1 - x0 + 16, 14, 5).fill(0xffc93c).stroke({ width: 2.5, color: 0x7a4b00 });
  }

  private drawDanger(): void {
    const g = this.danger.clear();
    if (this.freed) return;
    const hot = clamp((this.tension - 0.45) / 0.45, 0, 1);
    const pulse = hot > 0.6 ? 0.55 + 0.45 * Math.abs(Math.sin(this.time * 7)) : 1;
    const a = (0.35 + hot * 0.65) * pulse;
    for (let x = TANK.x0 + 26; x < TANK.x1 - 6; x += 21) g.moveTo(x, DANGER_Y).lineTo(Math.min(x + 12, TANK.x1 - 6), DANGER_Y);
    g.stroke({ width: 4, color: 0xff3b4f, alpha: a, cap: 'round' });
    g.circle(TANK.x0 + 14, DANGER_Y, 12).fill({ color: 0xff3b4f, alpha: Math.min(1, a + 0.3) }).stroke({ width: 3, color: 0xffffff, alpha: Math.min(1, a + 0.3) });
    g.roundRect(TANK.x0 + 12.3, DANGER_Y - 7, 3.4, 8, 1.5).fill(0xffffff);
    g.circle(TANK.x0 + 14, DANGER_Y + 5, 1.9).fill(0xffffff);
  }

  /** Two tiles trade places. Resolves when they have arrived. */
  swapTiles(a: Pos, b: Pos, back = false): Promise<void> {
    const sa = this.tiles[a.r][a.c]!;
    const sb = this.tiles[b.r][b.c]!;
    const pa = this.cellCenter(a);
    const pb = this.cellCenter(b);
    const done = tween({
      dur: 0.17,
      ease: ease.inOutCubic,
      update: (k) => {
        sa.position.set(lerp(pa.x, pb.x, k), lerp(pa.y, pb.y, k));
        sb.position.set(lerp(pb.x, pa.x, k), lerp(pb.y, pa.y, k));
        sa.scale.set((TILE / 100) * (1 + 0.12 * Math.sin(Math.PI * k)));
      },
    });
    if (back) return done.then(() => this.swapTiles(b, a)).then(() => this.restore(a, b, sa, sb));
    return done.then(() => {
      this.tiles[a.r][a.c] = sb;
      this.tiles[b.r][b.c] = sa;
    });
  }

  private restore(a: Pos, b: Pos, sa: Sprite, sb: Sprite): void {
    this.tiles[a.r][a.c] = sa;
    this.tiles[b.r][b.c] = sb;
    const pa = this.cellCenter(a);
    const pb = this.cellCenter(b);
    sa.position.set(pa.x, pa.y);
    sb.position.set(pb.x, pb.y);
  }

  /** Matched tiles swell, flash and vanish, leaving holes. */
  pop(cells: Pos[], color: number): void {
    cells.forEach((p, i) => {
      const s = this.tiles[p.r][p.c];
      if (!s) return;
      this.tiles[p.r][p.c] = null;
      const c = this.cellCenter(p);
      void tween({
        dur: 0.26,
        delay: i * 0.03,
        ease: ease.linear,
        update: (k) => {
          const sc = (TILE / 100) * (k < 0.4 ? 1 + k * 0.7 : 1.28 * (1 - (k - 0.4) / 0.6));
          s.scale.set(Math.max(0.001, sc));
          s.alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
        },
      }).then(() => {
        s.destroy();
        this.fx.sparkle(c.x, c.y, 5, 0xfff2a8, 90);
      });
      this.fx.glow(c.x, c.y, color, 0.5, 0.35);
    });
    this.drawCells();
  }

  /** The tile under the finger lifts a little. */
  lift(p: Pos | null): void {
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const s = this.tiles[r][c];
        if (s) s.scale.set((TILE / 100) * (p && p.r === r && p.c === c ? 1.12 : 1));
      }
  }

  /** The tank bursts: the glass flies, the pig cheers. */
  free(): void {
    this.freed = true;
    this.glass.clear();
    this.fx.shards(TANK.x0, TANK.x1, TANK.y0, TANK.y1, 40);
    this.pig.texture = this.art.pig.cheer;
    this.pig.anchor.set(0.5, 152 / 156);
    this.pig.scale.set(1);
    void tween({ dur: 0.6, ease: ease.outBack, update: (k) => (this.pig.y = PIG.y - 30 * k) });
  }

  update(dt: number): void {
    this.time += dt;
    this.tension = this.rig.tension;
    // Bricks: glide each particle towards its cell, so the flow looks continuous.
    const sand = this.rig.sand;
    const k = 1 - Math.exp(-dt * 26);
    const n = Math.max(this.parts.length, sand.cellOf.length);
    for (let id = 0; id < n; id++) {
      const cell = sand.cellOf[id];
      let p = this.parts[id];
      if (cell < 0) {
        if (p && p.alpha !== 0) p.alpha = 0;
        continue;
      }
      const tx = GRID.x + ((cell % sand.cols) + 0.5) * SAND;
      const ty = GRID.y + (Math.floor(cell / sand.cols) + 0.5) * SAND;
      const seed = sand.seed[id];
      if (!p) {
        p = new Particle({ texture: this.art.brick, x: tx, y: ty, anchorX: 0.5, anchorY: 0.5, scaleX: 0.66, scaleY: 0.66, rotation: (seed - 0.5) * 1.6, tint: BRICK_TINTS[Math.floor(seed * 4)], alpha: 1 });
        this.parts[id] = p;
        this.bricks.addParticle(p);
      } else if (p.alpha === 0) {
        // A recycled grain: appear where it is, do not slide in from where the last one died.
        p.x = tx;
        p.y = ty;
        p.alpha = 1;
        p.tint = BRICK_TINTS[Math.floor(seed * 4)];
      } else {
        p.x += (tx - p.x) * k;
        p.y += (ty - p.y) * k;
      }
    }

    // The pig shivers as the bricks climb; the bucket tilts while it pours.
    if (!this.freed) {
      const sh = clamp((this.tension - 0.35) * 1.6, 0, 1);
      this.pig.rotation = Math.sin(this.time * 32) * 0.03 * sh;
      this.pig.x = PIG.x + Math.sin(this.time * 41) * 1.4 * sh;
      this.pig.texture = this.tension > 0.3 ? this.art.pig.scared : this.art.pig.neutral;
    }
    const want = this.rig.pourRate() > 1 ? 1 : 0;
    this.pourTilt += (want - this.pourTilt) * (1 - Math.exp(-dt * 5));
    this.bucket.rotation = (-0.15 + this.pourTilt * 0.75) + Math.sin(this.time * 3) * 0.04;
    this.mary.y = 28 + Math.abs(Math.sin(this.time * (this.pourTilt > 0.5 ? 9 : 4))) * -2.5;
    const g = this.cable.clear();
    if (this.bucket.visible) g.moveTo(BUCKET.x, 124).lineTo(this.bucket.x, this.bucket.y).stroke({ width: 2.5, color: 0xd9dde5 });
    this.drawDanger();
  }
}
