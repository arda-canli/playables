// Board rules. Nothing falls: a match leaves holes, and the holes are what the bricks drain through.
// Pure data, no rendering, so the tests can play every order of moves.
import { COLS, ROWS, type Kind, type Pos } from './level';

export type Cell = Kind | null;

export interface Move {
  a: Pos;
  b: Pos;
}

export interface MatchResult {
  cells: Pos[];
  /** True when this match connected the top row to the bottom row through holes. */
  opened: boolean;
}

export class Board {
  cells: Cell[][];
  matches = 0;

  constructor(rows: string[]) {
    this.cells = rows.map((row) => [...row].map((ch) => (ch === '.' ? null : (ch as Kind))));
  }

  clone(): Board {
    const b = new Board([]);
    b.cells = this.cells.map((row) => row.slice());
    b.matches = this.matches;
    return b;
  }

  at(p: Pos): Cell {
    return this.cells[p.r]?.[p.c] ?? null;
  }

  static adjacent(a: Pos, b: Pos): boolean {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  /** Every cell that is part of a line of three or more. Holes break lines. */
  findMatches(): Pos[] {
    const hit = new Set<number>();
    const scan = (len: number, get: (i: number) => Pos) => {
      let start = 0;
      for (let i = 1; i <= len; i++) {
        const prev = this.at(get(i - 1));
        const cur = i < len ? this.at(get(i)) : null;
        if (cur !== null && cur === prev) continue;
        if (prev !== null && i - start >= 3) for (let k = start; k < i; k++) hit.add(get(k).r * COLS + get(k).c);
        start = i;
      }
    };
    for (let r = 0; r < ROWS; r++) scan(COLS, (i) => ({ r, c: i }));
    for (let c = 0; c < COLS; c++) scan(ROWS, (i) => ({ r: i, c }));
    return [...hit].map((k) => ({ r: Math.floor(k / COLS), c: k % COLS }));
  }

  private exchange(a: Pos, b: Pos): void {
    const t = this.cells[a.r][a.c];
    this.cells[a.r][a.c] = this.cells[b.r][b.c];
    this.cells[b.r][b.c] = t;
  }

  /** A legal move swaps two neighbouring tiles and makes at least one line. */
  canSwap(a: Pos, b: Pos): boolean {
    if (!Board.adjacent(a, b) || this.at(a) === null || this.at(b) === null || this.at(a) === this.at(b)) return false;
    this.exchange(a, b);
    const ok = this.findMatches().length > 0;
    this.exchange(a, b);
    return ok;
  }

  swap(a: Pos, b: Pos): MatchResult | null {
    if (!this.canSwap(a, b)) return null;
    const before = this.drainOpen();
    this.exchange(a, b);
    const cells = this.findMatches();
    for (const p of cells) this.cells[p.r][p.c] = null;
    this.matches++;
    return { cells, opened: !before && this.drainOpen() };
  }

  legalMoves(): Move[] {
    const out: Move[] = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        if (c + 1 < COLS && this.canSwap({ r, c }, { r, c: c + 1 })) out.push({ a: { r, c }, b: { r, c: c + 1 } });
        if (r + 1 < ROWS && this.canSwap({ r, c }, { r: r + 1, c })) out.push({ a: { r, c }, b: { r: r + 1, c } });
      }
    return out;
  }

  /** Holes reachable from the top row, walking through holes only. That is where bricks can get to. */
  reachable(): boolean[][] {
    const seen = this.cells.map((row) => row.map(() => false));
    const q: Pos[] = [];
    for (let c = 0; c < COLS; c++) if (this.cells[0][c] === null) (seen[0][c] = true), q.push({ r: 0, c });
    while (q.length) {
      const p = q.pop()!;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const r = p.r + dr;
        const c = p.c + dc;
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS || seen[r][c] || this.cells[r][c] !== null) continue;
        seen[r][c] = true;
        q.push({ r, c });
      }
    }
    return seen;
  }

  /** A path of holes from the top row to the bottom row: the bricks can leave the board. */
  drainOpen(): boolean {
    return this.reachable()[ROWS - 1].some(Boolean);
  }

  /**
   * The move a helpful player would make: first anything that opens a drain, then anything that
   * digs deeper from holes the bricks can already reach, then the biggest match.
   */
  bestMove(): Move | null {
    let best: Move | null = null;
    let bestScore = -1;
    const open = this.drainOpen();
    for (const m of this.legalMoves()) {
      const b = this.clone();
      const res = b.swap(m.a, m.b)!;
      const reach = b.reachable();
      let depth = 0;
      for (let r = 0; r < ROWS; r++) if (reach[r].some(Boolean)) depth = r + 1;
      const score = (res.opened ? 100 : 0) + (open ? 0 : depth * 6) + res.cells.length + (m.a.r + m.b.r) * 0.01;
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return best;
  }

  show(): string[] {
    return this.cells.map((row) => row.map((k) => k ?? '.').join(''));
  }
}
