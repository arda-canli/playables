// Pure rules for Match-3 Game: a match-3 board and the bank heist it pays for. No rendering, no DOM: tested.
//
// Board rules (the Royal Match family):
//   - Swap two neighbours. The swap stands if it makes a line of 3+ of one colour, or if either tile is a booster.
//   - 4 in a line makes a rocket that clears its row (or column). 5 in a line, or an L or T, makes TNT (5x5 blast).
//   - Tapping a booster fires it too. Boosters caught in a blast go off as well.
//   - A crate breaks when a match touches it or a blast reaches it. Crates do not fall.
//   - Tiles fall, new ones drop in from the top, and new lines clear by themselves (cascades).
//
// The rig: tiles that drop in are decided on the spot by `refill`, from a seeded stream, so every
// run of the ad is reproducible and the tests can replay it:
//   - leaves (a goal) come a little more often while the leaf goal is open,
//   - a cascade is let through now and then, never more than two deep,
//   - a fill that would leave the board without a legal move is drawn again. Nothing is ever forced.
//
// The heist rig is in `Heist`: what a safe holds is decided when it is opened, by how many safes the
// player has opened so far and by the ending. It is the slot-machine half of the genre.

export type Color = 'leaf' | 'lantern' | 'pack' | 'apple' | 'bolt';
export type Booster = 'rocketH' | 'rocketV' | 'tnt';
export type Kind = Color | Booster | 'crate';
export type Ending = 'win' | 'lose';
export type GoalId = 'leaf' | 'crate';

export const COLORS: readonly Color[] = ['leaf', 'lantern', 'pack', 'apple', 'bolt'];

export interface Tile {
  readonly id: number;
  readonly kind: Kind;
}

export interface Pos {
  r: number;
  c: number;
}

/** b = undefined means "tap the booster at a". */
export interface Move {
  a: Pos;
  b?: Pos;
}

export interface Cleared {
  id: number;
  kind: Kind;
  r: number;
  c: number;
  /** 0 = matched or hit directly, 1+ = how many boosters deep in a chain it went. Used to stagger the effects. */
  depth: number;
}

export interface Made {
  id: number;
  kind: Booster;
  r: number;
  c: number;
  from: Color;
}

export interface Blast {
  kind: Booster;
  r: number;
  c: number;
  depth: number;
  /** A booster set off by another booster's swap partner: bigger reach. */
  big: boolean;
}

export interface Fall {
  id: number;
  kind: Kind;
  c: number;
  /** Negative rows start above the board: those tiles are new. */
  r0: number;
  r: number;
}

/** One round of clearing, then gravity. A move is one or more waves; the second one on are cascades. */
export interface Wave {
  cleared: Cleared[];
  made: Made[];
  blasts: Blast[];
  falls: Fall[];
  /** The board ran out of moves and was reshuffled (should never happen; the tests count it). */
  shuffled: boolean;
}

export interface MoveResult {
  ok: boolean;
  move: Move;
  waves: Wave[];
  goalsDone: boolean;
  outOfMoves: boolean;
}

export interface LevelDef {
  /** Top row first. L lantern... see KEY. '#' is a crate. */
  rows: string[];
  goals: Record<GoalId, number>;
  moves: number;
  seed: number;
  /** The scripted opening: a swap that makes nothing (ghost), and the swap that builds the first TNT. */
  botch: [Pos, Pos];
  guide: [Pos, Pos];
}

const KEY: Record<string, Kind> = { P: 'leaf', Y: 'lantern', G: 'pack', R: 'apple', B: 'bolt', '#': 'crate', T: 'tnt' };

export const LEVEL: LevelDef = {
  // Mid-level: the five pink leaves in row 5 are one swap from a line of five (that makes TNT),
  // and the TNT then lands right on the crate row. Rows are authored so nothing matches at the start.
  rows: [
    'BGRYBGR',
    'YRBGPBY',
    'GBYRGYB',
    'RYGBYRG',
    'BRGPRBY',
    'GPPYPPR',
    'YBRGBYP',
    'G##R##B',
  ],
  goals: { leaf: 30, crate: 4 },
  moves: 9,
  seed: 20261003,
  botch: [
    { r: 2, c: 1 },
    { r: 2, c: 2 },
  ],
  guide: [
    { r: 4, c: 3 },
    { r: 5, c: 3 },
  ],
};

export const isColor = (k: Kind | undefined): k is Color => k === 'leaf' || k === 'lantern' || k === 'pack' || k === 'apple' || k === 'bolt';
export const isBooster = (k: Kind | undefined): k is Booster => k === 'rocketH' || k === 'rocketV' || k === 'tnt';
const adjacent = (a: Pos, b: Pos) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;

/** Small seeded RNG (mulberry32), kept here so the rules have no imports. */
function next(state: { s: number }): number {
  state.s = (state.s + 0x6d2b79f5) >>> 0;
  let t = state.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

interface Group {
  cells: Pos[];
  longest: number;
  /** Direction of the longest run. */
  dir: 'h' | 'v';
  bent: boolean;
}

export class Logic {
  readonly rows: number;
  readonly cols: number;
  grid: (Tile | null)[][];
  goals: Record<GoalId, number>;
  movesLeft: number;
  movesMade = 0;
  shuffles = 0;
  private rng: { s: number };
  private nextId = 1;
  private cascadeDepth = 0;

  constructor(level: LevelDef) {
    this.rows = level.rows.length;
    this.cols = level.rows[0].length;
    this.grid = level.rows.map((row) => [...row].map((ch) => ({ id: this.nextId++, kind: KEY[ch] })));
    this.goals = { ...level.goals };
    this.movesLeft = level.moves;
    this.rng = { s: level.seed };
  }

  copy(): Logic {
    const l = Object.create(Logic.prototype) as Logic;
    Object.assign(l, this);
    l.grid = this.grid.map((row) => row.slice());
    l.goals = { ...this.goals };
    l.rng = { s: this.rng.s };
    return l;
  }

  at(p: Pos): Tile | null {
    return this.grid[p.r]?.[p.c] ?? null;
  }

  inside(p: Pos): boolean {
    return p.r >= 0 && p.r < this.rows && p.c >= 0 && p.c < this.cols;
  }

  get goalsDone(): boolean {
    return this.goals.leaf <= 0 && this.goals.crate <= 0;
  }

  get outOfMoves(): boolean {
    return this.movesLeft <= 0 && !this.goalsDone;
  }

  find(kind: Kind): Pos | null {
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (this.grid[r][c]?.kind === kind) return { r, c };
    return null;
  }

  // ------------------------------------------------------------------ moves

  /** Would this swap stand? (It needs a match, or a booster on either side.) */
  canSwap(a: Pos, b: Pos): boolean {
    if (!this.inside(a) || !this.inside(b) || !adjacent(a, b)) return false;
    const ta = this.at(a);
    const tb = this.at(b);
    if (!ta || !tb || ta.kind === 'crate' || tb.kind === 'crate') return false;
    if (isBooster(ta.kind) || isBooster(tb.kind)) return true;
    if (ta.kind === tb.kind) return false;
    this.swapCells(a, b);
    const ok = this.lineThrough(a) || this.lineThrough(b);
    this.swapCells(a, b);
    return ok;
  }

  /** Is the swap physically possible at all (neighbours, nothing fixed)? Used for the "bounce back" animation. */
  canTry(a: Pos, b: Pos): boolean {
    if (!this.inside(a) || !this.inside(b) || !adjacent(a, b)) return false;
    const ta = this.at(a);
    const tb = this.at(b);
    return !!ta && !!tb && ta.kind !== 'crate' && tb.kind !== 'crate';
  }

  legalMoves(): Move[] {
    const out: Move[] = [];
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        const a = { r, c };
        if (isBooster(this.at(a)?.kind)) out.push({ a });
        for (const b of [{ r, c: c + 1 }, { r: r + 1, c }]) if (this.canSwap(a, b)) out.push({ a, b });
      }
    return out;
  }

  play(move: Move): MoveResult {
    const res: MoveResult = { ok: false, move, waves: [], goalsDone: this.goalsDone, outOfMoves: this.outOfMoves };
    if (this.goalsDone || this.movesLeft <= 0) return res;
    const { a, b } = move;
    const fire: Pos[] = [];
    let big = false;
    if (!b) {
      if (!isBooster(this.at(a)?.kind)) return res;
      fire.push(a);
    } else {
      if (!this.canSwap(a, b)) return res;
      this.swapCells(a, b);
      const ka = this.at(a)!.kind;
      const kb = this.at(b)!.kind;
      // After the swap, a booster is wherever it was dragged to. Two boosters swapped together go off big.
      if (isBooster(ka)) fire.push(a);
      if (isBooster(kb)) fire.push(b);
      big = fire.length === 2;
    }
    res.ok = true;
    this.movesLeft--;
    this.movesMade++;
    this.cascadeDepth = 0;
    res.waves = this.resolve(b ? [a, b] : [a], fire, big);
    res.goalsDone = this.goalsDone;
    res.outOfMoves = this.outOfMoves;
    return res;
  }

  /** The move the hint hand shows, and the one the ad plays when the viewer is idle. */
  bestMove(): Move | null {
    let best: Move | null = null;
    let bestScore = -Infinity;
    for (const m of this.legalMoves()) {
      const sim = this.copy();
      const before = sim.goals.leaf + sim.goals.crate;
      const r = sim.play(m);
      let score = (before - sim.goals.leaf - sim.goals.crate) * 10;
      for (const w of r.waves) score += w.cleared.length * 0.4 + w.made.length * 6 + w.blasts.length * 2;
      if (sim.goalsDone) score += 1000;
      // Prefer moves near the bottom: they stir the board and read well on screen.
      score += (m.a.r + (m.b?.r ?? m.a.r)) * 0.05;
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ resolution

  private resolve(swapped: Pos[], fire: Pos[], big: boolean): Wave[] {
    const waves: Wave[] = [];
    for (let guard = 0; guard < 20; guard++) {
      const wave: Wave = { cleared: [], made: [], blasts: [], falls: [], shuffled: false };
      const groups = this.findGroups();
      if (!groups.length && !fire.length) break;
      const gone = new Set<number>();
      const keep = new Set<number>(); // boosters made this wave are safe from this wave's blasts
      const queue: { p: Pos; depth: number }[] = fire.map((p) => ({ p, depth: 0 }));
      const born: { p: Pos; t: Tile }[] = [];
      const clear = (p: Pos, depth: number) => {
        const t = this.at(p);
        if (!t || gone.has(t.id) || keep.has(t.id)) return;
        if (isBooster(t.kind)) {
          // A booster that gets hit fires instead of just vanishing.
          if (!queue.some((q) => q.p.r === p.r && q.p.c === p.c)) queue.push({ p, depth: depth + 1 });
          return;
        }
        gone.add(t.id);
        wave.cleared.push({ id: t.id, kind: t.kind, r: p.r, c: p.c, depth });
      };

      for (const g of groups) {
        const spawnAt = this.spawnCell(g, swapped);
        const kind: Booster | null = g.longest >= 5 || g.bent ? 'tnt' : g.longest === 4 ? (g.dir === 'h' ? 'rocketH' : 'rocketV') : null;
        for (const p of g.cells) {
          clear(p, 0);
          // Crates next to a match crack.
          for (const n of [{ r: p.r - 1, c: p.c }, { r: p.r + 1, c: p.c }, { r: p.r, c: p.c - 1 }, { r: p.r, c: p.c + 1 }]) if (this.at(n)?.kind === 'crate') clear(n, 0);
        }
        if (kind) {
          const from = this.at(spawnAt)!.kind as Color;
          const t: Tile = { id: this.nextId++, kind };
          wave.made.push({ id: t.id, kind, r: spawnAt.r, c: spawnAt.c, from });
          keep.add(t.id);
          // Placed once the clearing below has emptied its cell.
          born.push({ p: spawnAt, t });
        }
      }

      // Boosters go off one after another; each can set off more.
      for (let i = 0; i < queue.length; i++) {
        const { p, depth } = queue[i];
        const t = this.at(p);
        if (!t || !isBooster(t.kind) || gone.has(t.id)) continue;
        gone.add(t.id);
        wave.cleared.push({ id: t.id, kind: t.kind, r: p.r, c: p.c, depth });
        const isBig = big && depth === 0;
        wave.blasts.push({ kind: t.kind, r: p.r, c: p.c, depth, big: isBig });
        for (const q of this.reach(t.kind, p, isBig)) clear(q, depth);
      }
      fire = [];
      big = false;

      for (const cl of wave.cleared) {
        this.grid[cl.r][cl.c] = null;
        if (cl.kind === 'leaf') this.goals.leaf = Math.max(0, this.goals.leaf - 1);
        if (cl.kind === 'crate') this.goals.crate = Math.max(0, this.goals.crate - 1);
      }
      for (const { p, t } of born) this.grid[p.r][p.c] = t;

      wave.falls = this.gravity();
      waves.push(wave);
      swapped = [];
      this.cascadeDepth++;
    }
    if (!this.legalMoves().length) {
      // Never expected (the fill is redrawn when it would leave no move), but a stuck board must not freeze the ad.
      this.shuffle();
      const last = waves[waves.length - 1];
      if (last) last.shuffled = true;
    }
    return waves;
  }

  /** Every cell a booster reaches. */
  private reach(kind: Booster, p: Pos, big: boolean): Pos[] {
    const out: Pos[] = [];
    const add = (r: number, c: number) => {
      if (r >= 0 && r < this.rows && c >= 0 && c < this.cols && !(r === p.r && c === p.c)) out.push({ r, c });
    };
    if (kind === 'tnt') {
      const k = big ? 3 : 2;
      for (let r = p.r - k; r <= p.r + k; r++) for (let c = p.c - k; c <= p.c + k; c++) add(r, c);
    } else {
      const thick = big ? 1 : 0;
      for (let d = -thick; d <= thick; d++) {
        if (kind === 'rocketH' || big) for (let c = 0; c < this.cols; c++) add(p.r + d, c);
        if (kind === 'rocketV' || big) for (let r = 0; r < this.rows; r++) add(r, p.c + d);
      }
    }
    return out;
  }

  /** Where a new booster appears: on the tile the player moved, if it is part of the group, else mid-line. */
  private spawnCell(g: Group, swapped: Pos[]): Pos {
    for (const s of swapped) if (g.cells.some((p) => p.r === s.r && p.c === s.c)) return s;
    return g.cells[Math.floor(g.cells.length / 2)];
  }

  private findGroups(): Group[] {
    type Run = { cells: Pos[]; dir: 'h' | 'v' };
    const runs: Run[] = [];
    const color = (r: number, c: number) => {
      const k = this.grid[r]?.[c]?.kind;
      return isColor(k) ? k : null;
    };
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; ) {
        const k = color(r, c);
        let e = c + 1;
        while (k && e < this.cols && color(r, e) === k) e++;
        if (k && e - c >= 3) runs.push({ dir: 'h', cells: Array.from({ length: e - c }, (_, i) => ({ r, c: c + i })) });
        c = e;
      }
    for (let c = 0; c < this.cols; c++)
      for (let r = 0; r < this.rows; ) {
        const k = color(r, c);
        let e = r + 1;
        while (k && e < this.rows && color(e, c) === k) e++;
        if (k && e - r >= 3) runs.push({ dir: 'v', cells: Array.from({ length: e - r }, (_, i) => ({ r: r + i, c })) });
        r = e;
      }
    // Runs that share a cell form one group (that is how L and T shapes are found).
    const parent = runs.map((_, i) => i);
    const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
    for (let i = 0; i < runs.length; i++)
      for (let j = i + 1; j < runs.length; j++)
        if (runs[i].cells.some((p) => runs[j].cells.some((q) => p.r === q.r && p.c === q.c))) parent[root(j)] = root(i);
    const byRoot = new Map<number, Run[]>();
    runs.forEach((run, i) => byRoot.set(root(i), [...(byRoot.get(root(i)) ?? []), run]));
    const groups: Group[] = [];
    for (const rs of byRoot.values()) {
      const seen = new Set<string>();
      const cells: Pos[] = [];
      for (const run of rs) for (const p of run.cells) if (!seen.has(`${p.r},${p.c}`)) (seen.add(`${p.r},${p.c}`), cells.push(p));
      const longest = rs.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
      groups.push({ cells, longest: longest.cells.length, dir: longest.dir, bent: rs.some((x) => x.dir === 'h') && rs.some((x) => x.dir === 'v') });
    }
    return groups;
  }

  private lineThrough(p: Pos): boolean {
    const k = this.at(p)?.kind;
    if (!isColor(k)) return false;
    const same = (r: number, c: number) => this.grid[r]?.[c]?.kind === k;
    let h = 1;
    for (let c = p.c - 1; same(p.r, c); c--) h++;
    for (let c = p.c + 1; same(p.r, c); c++) h++;
    let v = 1;
    for (let r = p.r - 1; same(r, p.c); r--) v++;
    for (let r = p.r + 1; same(r, p.c); r++) v++;
    return h >= 3 || v >= 3;
  }

  private swapCells(a: Pos, b: Pos): void {
    const t = this.grid[a.r][a.c];
    this.grid[a.r][a.c] = this.grid[b.r][b.c];
    this.grid[b.r][b.c] = t;
  }

  /** Tiles fall, crates stay put, new tiles drop in from the top. */
  private gravity(): Fall[] {
    const falls: Fall[] = [];
    const empties: number[] = [];
    for (let c = 0; c < this.cols; c++) {
      let write = this.rows - 1;
      for (let r = this.rows - 1; r >= 0; r--) {
        const t = this.grid[r][c];
        if (!t) continue;
        if (t.kind === 'crate') {
          write = r - 1;
          continue;
        }
        if (r !== write) {
          this.grid[write][c] = t;
          this.grid[r][c] = null;
          falls.push({ id: t.id, kind: t.kind, c, r0: r, r: write });
        }
        write--;
      }
      empties.push(write + 1);
    }
    this.refill(empties, falls);
    return falls;
  }

  /** The rig: picks the colour of every tile that drops in. `empties[c]` = how many cells column c needs. */
  private refill(empties: number[], falls: Fall[]): void {
    const allowCascade = this.cascadeDepth < 2;
    for (let attempt = 0; attempt < 24; attempt++) {
      const placed: Pos[] = [];
      for (let c = 0; c < this.cols; c++)
        for (let r = empties[c] - 1; r >= 0; r--) {
          const kind = this.pickColor(r, c, allowCascade && attempt < 12);
          this.grid[r][c] = { id: 0, kind };
          placed.push({ r, c });
        }
      // Keep the fill only if the board it settles into can still be played.
      if (attempt === 23 || this.legalMoves().length > 0) {
        for (const p of placed) {
          const t: Tile = { id: this.nextId++, kind: this.grid[p.r][p.c]!.kind };
          this.grid[p.r][p.c] = t;
          falls.push({ id: t.id, kind: t.kind, c: p.c, r0: p.r - empties[p.c], r: p.r });
        }
        return;
      }
      for (const p of placed) this.grid[p.r][p.c] = null;
    }
  }

  private pickColor(r: number, c: number, cascade: boolean): Color {
    const weights: number[] = COLORS.map((k) => (k === 'leaf' && this.goals.leaf > 0 ? 1.25 : 1));
    const makes = COLORS.map((k) => this.wouldLine(r, c, k));
    const wantLine = cascade && next(this.rng) < 0.22;
    let pool = COLORS.map((_, i) => (makes[i] === wantLine ? weights[i] : 0));
    if (pool.every((w) => w === 0)) pool = weights;
    const total = pool.reduce((a, b) => a + b, 0);
    let x = next(this.rng) * total;
    for (let i = 0; i < COLORS.length; i++) {
      x -= pool[i];
      if (x < 0) return COLORS[i];
    }
    return COLORS[COLORS.length - 1];
  }

  private wouldLine(r: number, c: number, k: Color): boolean {
    const same = (rr: number, cc: number) => this.grid[rr]?.[cc]?.kind === k;
    let h = 1;
    for (let x = c - 1; same(r, x); x--) h++;
    for (let x = c + 1; same(r, x); x++) h++;
    let v = 1;
    for (let y = r + 1; same(y, c); y++) v++;
    return h >= 3 || v >= 3;
  }

  private shuffle(): void {
    this.shuffles++;
    for (let tries = 0; tries < 50; tries++) {
      const cells: Pos[] = [];
      for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (isColor(this.grid[r][c]?.kind)) cells.push({ r, c });
      for (const p of cells) this.grid[p.r][p.c] = { id: this.nextId++, kind: COLORS[Math.floor(next(this.rng) * COLORS.length)] };
      if (!this.findGroups().length && this.legalMoves().length) return;
    }
  }

  /** Text picture of the board, for tests and debugging. */
  show(): string {
    const ch: Record<Kind, string> = { leaf: 'P', lantern: 'Y', pack: 'G', apple: 'R', bolt: 'B', crate: '#', tnt: 'T', rocketH: '-', rocketV: '|' };
    return this.grid.map((row) => row.map((t) => (t ? ch[t.kind] : '.')).join('')).join('\n');
  }
}

// ------------------------------------------------------------------ the heist

export type Loot = { kind: 'cash'; amount: number } | { kind: 'mult'; times: number } | { kind: 'jackpot'; amount: number } | { kind: 'noluck' };

export const HEIST_PICKS = 3;
export const SAFES = 9;

/**
 * Nine safes, three picks. What a safe holds is decided when it opens:
 *   1st pick: cash, 2nd: a multiplier (the number jumps), 3rd: the jackpot ('win') or nothing ('lose').
 * In 'lose' the safes the player did not pick then open by themselves and two of them hold the jackpot,
 * one of them right next to the last pick: the near miss the whole ad has been building up to.
 */
export class Heist {
  readonly contents: (Loot | null)[] = Array(SAFES).fill(null);
  readonly picks: number[] = [];
  cash = 0;
  mult = 1;

  constructor(readonly ending: Ending) {}

  get total(): number {
    return this.cash * this.mult;
  }

  get done(): boolean {
    return this.picks.length >= HEIST_PICKS;
  }

  pick(i: number): Loot | null {
    if (this.done || this.contents[i] || i < 0 || i >= SAFES) return null;
    const n = this.picks.length;
    const loot: Loot = n === 0 ? { kind: 'cash', amount: 2500 } : n === 1 ? { kind: 'mult', times: 3 } : this.ending === 'win' ? { kind: 'jackpot', amount: 50000 } : { kind: 'noluck' };
    this.contents[i] = loot;
    this.picks.push(i);
    if (loot.kind === 'cash' || loot.kind === 'jackpot') this.cash += loot.amount;
    if (loot.kind === 'mult') this.mult *= loot.times;
    return loot;
  }

  /** What the unopened safes held. Jackpots go next to the last pick in 'lose'. */
  revealRest(): { i: number; loot: Loot }[] {
    const rest = this.contents.map((l, i) => (l ? -1 : i)).filter((i) => i >= 0);
    const last = this.picks[this.picks.length - 1] ?? 4;
    const dist = (i: number) => Math.abs((i % 3) - (last % 3)) + Math.abs(Math.floor(i / 3) - Math.floor(last / 3));
    rest.sort((a, b) => dist(a) - dist(b) || a - b);
    const pool: Loot[] =
      this.ending === 'lose'
        ? [{ kind: 'jackpot', amount: 50000 }, { kind: 'cash', amount: 1500 }, { kind: 'jackpot', amount: 50000 }, { kind: 'noluck' }, { kind: 'mult', times: 2 }, { kind: 'cash', amount: 500 }]
        : [{ kind: 'noluck' }, { kind: 'cash', amount: 1000 }, { kind: 'noluck' }, { kind: 'mult', times: 2 }, { kind: 'cash', amount: 500 }, { kind: 'noluck' }];
    return rest.map((i, k) => {
      this.contents[i] = pool[k % pool.length];
      return { i, loot: pool[k % pool.length] };
    });
  }

  /** What the jackpot would have paid on top of what the player got. */
  get missed(): number {
    return (this.cash + 50000) * this.mult - this.total;
  }
}
