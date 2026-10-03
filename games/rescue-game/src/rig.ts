// The rescue stage as one simulation: the board, the bricks, and the bucket that keeps pouring.
// Shared by the game and the tests, so the danger the tests measure is the danger the viewer sees.
import { BOARD_ROW0, BUCKET, COLS, DANGER_Y, GRID, LEDGE, PER_CELL, ROWS, SAND, START, TANK } from './level';
import { Board, type MatchResult } from './logic';
import { Sand } from './sand';

export const STEP = 1 / 60;
const SUBSTEPS = 2;
/** Bricks per second at full pour. */
const POUR = 210;
/** The tank opens already part full: the danger is there from the first frame. */
const PREFILL_Y = 404;

const col = (x: number) => Math.round((x - GRID.x) / SAND);
const row = (y: number) => Math.round((y - GRID.y) / SAND);

export const LEDGE_COLS: [number, number] = [col(LEDGE.x0), GRID.cols];
export const LEDGE_ROW = row(LEDGE.y);
const DANGER_ROW = row(DANGER_Y);
const TANK_ROW = row(TANK.y0);

export class Rescue {
  readonly board = new Board(START);
  readonly sand: Sand;
  pouring = true;
  time = 0;
  tension = 0;
  /** Highest tension reached: the tests check the squeeze really happens. */
  peak = 0;
  private acc = 0;
  private spawnAcc = 0;
  /** Called for every brick that leaves the bottom of the board (the view turns it into a falling brick). */
  onExit: ((col: number, seed: number) => void) | null = null;

  constructor(rng: () => number = Math.random) {
    this.sand = new Sand(GRID.cols, GRID.rows, rng);
    // The pig's stone pedestal is solid, top to tank floor.
    this.sand.setSolid(LEDGE_COLS[0], LEDGE_ROW, LEDGE_COLS[1], BOARD_ROW0, true);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) this.setCell(r, c, true);
    // A heap that leans towards the bucket, as if it had been pouring for a while.
    const mouth = col(BUCKET.mouth);
    for (let c = 0; c < LEDGE_COLS[0]; c++) {
      const top = row(PREFILL_Y) - Math.round(Math.max(0, 9 - Math.abs(c - mouth) * 0.35));
      for (let r = BOARD_ROW0 - 1; r >= top; r--) this.sand.spawn(c, r);
    }
  }

  private setCell(r: number, c: number, solid: boolean): void {
    this.sand.setSolid(c * PER_CELL, BOARD_ROW0 + r * PER_CELL, (c + 1) * PER_CELL, BOARD_ROW0 + (r + 1) * PER_CELL, solid);
  }

  swap(a: { r: number; c: number }, b: { r: number; c: number }): MatchResult | null {
    const res = this.board.swap(a, b);
    if (res) for (const p of res.cells) this.setCell(p.r, p.c, false);
    return res;
  }

  /**
   * The rubber band: the bucket pours hard while the tank is low and eases off near the danger line,
   * so the squeeze always comes and the pig is never actually buried.
   */
  pourRate(): number {
    // Past 0.88 the bucket stops: Mary tilts it back to gloat, and the bricks in the air settle short of the pig.
    if (!this.pouring || this.tension > 0.88) return 0;
    return POUR * Math.min(1, Math.max(0.05, (0.86 - this.tension) * 2.6));
  }

  update(dt: number): void {
    this.acc += dt;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.time += STEP;
      this.spawnAcc += this.pourRate() * STEP;
      const mouth = col(BUCKET.mouth);
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        this.sand.spawn(mouth + Math.floor(Math.random() * 4) - 2, 0);
      }
      for (let s = 0; s < SUBSTEPS; s++) {
        this.sand.step();
        if (this.onExit) for (const e of this.sand.exits) this.onExit(e.col, this.sand.seed[e.id]);
      }
      this.measure();
    }
  }

  private measure(): void {
    // How high the bricks stand over the pedestal, against the pig's chest.
    const s = this.sand.surface(LEDGE_COLS[0] - 6, LEDGE_COLS[1], TANK_ROW - 4);
    this.tension = Math.max(0, Math.min(1.2, (LEDGE_ROW - s) / (LEDGE_ROW - DANGER_ROW)));
    this.peak = Math.max(this.peak, this.tension);
  }

  /** Grains currently inside the tank (above the board). */
  get inTank(): number {
    return this.sand.count(TANK_ROW, BOARD_ROW0);
  }
}
