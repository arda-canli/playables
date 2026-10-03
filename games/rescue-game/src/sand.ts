// Falling bricks on a grid: each brick drops, slides off slopes, spreads a little, and leaves through
// the bottom of any open column. Pure data, so the tests can pour thousands of bricks without a screen.

const MAX = 3200;

export class Sand {
  readonly grid: Int32Array;
  readonly solid: Uint8Array;
  /** Cell of each grain, -1 when the slot is free. */
  readonly cellOf = new Int32Array(MAX).fill(-1);
  /** Each grain's random look (the view picks a tint and an angle from it). */
  readonly seed = new Float32Array(MAX);
  private stamp = new Int32Array(MAX);
  private free: number[] = [];
  private tick = 0;
  alive = 0;
  drained = 0;
  /** Grains that left the bottom during the last step: the view turns them into a falling stream. */
  readonly exits: { id: number; col: number }[] = [];

  constructor(
    readonly cols: number,
    readonly rows: number,
    private rng: () => number = Math.random,
  ) {
    this.grid = new Int32Array(cols * rows);
    this.solid = new Uint8Array(cols * rows);
    for (let i = MAX - 1; i >= 0; i--) this.free.push(i);
  }

  setSolid(c0: number, r0: number, c1: number, r1: number, v: boolean): void {
    for (let r = Math.max(0, r0); r < Math.min(this.rows, r1); r++)
      for (let c = Math.max(0, c0); c < Math.min(this.cols, c1); c++) this.solid[r * this.cols + c] = v ? 1 : 0;
  }

  spawn(col: number, row = 0): boolean {
    const i = row * this.cols + col;
    if (col < 0 || col >= this.cols || this.grid[i] || this.solid[i] || !this.free.length) return false;
    const id = this.free.pop()!;
    this.cellOf[id] = i;
    this.seed[id] = this.rng();
    this.grid[i] = id + 1;
    this.alive++;
    return true;
  }

  private open(r: number, c: number): boolean {
    if (c < 0 || c >= this.cols || r < 0) return false;
    const i = r * this.cols + c;
    return !this.grid[i] && !this.solid[i];
  }

  private move(id: number, from: number, to: number): void {
    this.grid[from] = 0;
    this.grid[to] = id + 1;
    this.cellOf[id] = to;
    this.stamp[id] = this.tick;
  }

  step(): void {
    this.tick++;
    this.exits.length = 0;
    const { cols, rows } = this;
    for (let r = rows - 1; r >= 0; r--) {
      // Alternate the sweep so piles do not lean one way.
      const ltr = (r + this.tick) % 2 === 0;
      for (let k = 0; k < cols; k++) {
        const c = ltr ? k : cols - 1 - k;
        const i = r * cols + c;
        const g = this.grid[i];
        if (!g) continue;
        const id = g - 1;
        if (this.stamp[id] === this.tick) continue;
        if (r === rows - 1) {
          // Out of the bottom of an open column: drained.
          this.grid[i] = 0;
          this.cellOf[id] = -1;
          this.free.push(id);
          this.alive--;
          this.drained++;
          this.exits.push({ id, col: c });
          continue;
        }
        if (this.open(r + 1, c)) {
          this.move(id, i, i + cols);
          continue;
        }
        const d = this.rng() < 0.5 ? -1 : 1;
        // Diagonal slides need the side cell clear too, so bricks never squeeze between two tile corners.
        if (this.open(r + 1, c + d) && !this.solid[r * cols + c + d]) {
          this.move(id, i, i + cols + d);
          continue;
        }
        if (this.open(r + 1, c - d) && !this.solid[r * cols + c - d]) {
          this.move(id, i, i + cols - d);
          continue;
        }
        // Spread: step sideways towards a drop two cells away. Flattens slopes without making the surface boil.
        if (this.open(r, c + d) && this.open(r + 1, c + 2 * d)) {
          this.move(id, i, i + d);
          continue;
        }
        if (this.open(r, c - d) && this.open(r + 1, c - 2 * d)) this.move(id, i, i - d);
      }
    }
  }

  /** Highest occupied row in a column range (rows count down from the top), or `rows` when empty. */
  surface(c0: number, c1: number, below = 0): number {
    for (let r = below; r < this.rows; r++) for (let c = c0; c < c1; c++) if (this.grid[r * this.cols + c]) return r;
    return this.rows;
  }

  /** Grains inside a row range: how full the tank is. */
  count(r0: number, r1: number): number {
    let n = 0;
    for (let i = r0 * this.cols; i < r1 * this.cols; i++) if (this.grid[i]) n++;
    return n;
  }

  /** Bricks that fell into a hole the board just opened keep falling: nothing to do, the grid handles it. */
  clearRect(c0: number, r0: number, c1: number, r1: number): void {
    this.setSolid(c0, r0, c1, r1, false);
  }
}
