// Pure rules for Pour Decisions (water sort). No rendering, no DOM: brute-force tested.
//
// Rules (the water sort genre):
//   - A bottle holds up to `capacity` units. You pour the top run of one colour onto a bottle
//     that is empty or whose top is the same colour, as much as fits.
//   - A full bottle of one colour is complete and gets corked.
//   - Every bottle complete or empty = win.
//   - Stuck = no legal pour is left, OR the level can no longer be finished however lucky the hidden
//     layers turn out (checked exactly, see solver.ts) and every pour that is still legal only leads
//     back to a table the player has already seen. The second case is the soft-lock where two bottles
//     can be poured back and forth for ever; the player gets to try it before the ad calls it.
//
// The rig: '?' units are hidden. A hidden unit gets its colour only when it becomes the top of
// its bottle, decided by `pickReveal` from what is on the table at that moment. The colours always
// come from the level's real pool: every colour has exactly `capacity` units, so the level is honest.
//   ending 'win'   : every reveal is the most helpful colour available. The level always completes.
//   ending 'stuck' : the director looks ahead (solver.ts). Among the colours after which the player can
//                    no longer force a win, it reveals the one that LOOKS most helpful. The player runs
//                    into a genuine dead end: no legal pour, no empty bottle, and one extra bottle
//                    really would solve it. That is the moment the real genre sells "+1 bottle".

import { playerCanForceWin, solvableWithLuck, type Table } from './solver';

export type ColorId = 'red' | 'cyan' | 'green' | 'yellow' | 'purple' | 'orange' | 'pink' | 'teal' | 'lime';
export type Policy = 'helpful' | 'hostile';
export type Ending = 'win' | 'stuck';

export interface Unit {
  color: ColorId | null;
  hidden: boolean;
}

export interface LevelDef {
  capacity: number;
  /** Bottom first. '?' is a hidden unit. */
  bottles: (ColorId | '?')[][];
  /** In the 'stuck' ending, the director starts looking ahead once the player has corked this many bottles. */
  helpUntil: number;
  /** Scripted opening: the rejected pour the ghost hand attempts, and the guided first move. */
  botch: [number, number];
  guide: [number, number];
}

export const LEVEL: LevelDef = {
  capacity: 4,
  // Found by computer search (see test/logic.test.ts). With this layout:
  //   'win'   : EVERY legal order of pours completes the level.
  //   'stuck' : EVERY order ends in a genuine dead end (no legal pour, no empty bottle) that one
  //             extra bottle would solve. No colour is ever invented: all six sets are real.
  bottles: [
    ['red', 'red', 'red', 'red'],
    ['cyan', 'cyan', 'cyan', 'cyan'],
    ['green', 'green', 'green'],
    ['?', 'orange', 'yellow', 'green'],
    ['yellow'],
    ['?', '?', '?', 'orange'],
    ['purple', 'purple', 'purple', 'yellow'],
  ],
  helpUntil: 1,
  botch: [6, 2],
  guide: [3, 2],
};

export interface PourResult {
  from: number;
  to: number;
  color: ColorId;
  amount: number;
  /** Bottle that became complete because of this pour (always `to`), or -1. */
  completed: number;
  /** The hidden unit that was just exposed in `from` and got its colour. */
  revealed: { bottle: number; index: number; color: ColorId; policy: Policy } | null;
  stuck: boolean;
  won: boolean;
}

export class Logic {
  readonly bottles: Unit[][];
  readonly capacity: number;
  readonly startDone: number;
  moves = 0;
  stuck = false;
  won = false;

  private pool: ColorId[];
  private helpUntil: number;
  private visited = new Set<string>();

  constructor(level: LevelDef, readonly ending: Ending) {
    this.capacity = level.capacity;
    this.helpUntil = level.helpUntil;
    this.bottles = level.bottles.map((b) => b.map((c) => ({ color: c === '?' ? null : c, hidden: c === '?' })));
    const counts = new Map<ColorId, number>();
    for (const c of level.bottles.flat()) if (c !== '?') counts.set(c, (counts.get(c) ?? 0) + 1);
    this.pool = [];
    for (const [c, n] of counts) for (let i = 0; i < (this.capacity - (n % this.capacity)) % this.capacity; i++) this.pool.push(c);
    const hidden = level.bottles.flat().filter((c) => c === '?').length;
    if (hidden !== this.pool.length) throw new Error(`level is inconsistent: ${hidden} hidden units but ${this.pool.length} units missing from the visible sets`);
    this.startDone = this.doneCount;
    this.visited.add(this.id());
  }

  isComplete(i: number): boolean {
    const b = this.bottles[i];
    return b.length === this.capacity && b.every((u) => !u.hidden && u.color === b[0].color);
  }

  get doneCount(): number {
    return this.bottles.filter((_, i) => this.isComplete(i)).length;
  }

  /** Bottles the player corked themselves. */
  get earned(): number {
    return this.doneCount - this.startDone;
  }

  /** Total sets in the level, for the progress bar. */
  get totalSets(): number {
    return Math.round(this.bottles.reduce((n, b) => n + b.length, 0) / this.capacity);
  }

  top(i: number): Unit | undefined {
    const b = this.bottles[i];
    return b[b.length - 1];
  }

  /** How many units would move, 0 if the pour is not allowed. */
  pourable(from: number, to: number): number {
    if (from === to) return 0;
    const src = this.bottles[from];
    const dst = this.bottles[to];
    if (!src || !dst || src.length === 0 || this.isComplete(from) || this.isComplete(to)) return 0;
    const t = src[src.length - 1];
    if (t.hidden || !t.color) return 0;
    const free = this.capacity - dst.length;
    if (free === 0) return 0;
    if (dst.length > 0) {
      const d = dst[dst.length - 1];
      if (d.hidden || d.color !== t.color) return 0;
    }
    let run = 0;
    for (let k = src.length - 1; k >= 0 && !src[k].hidden && src[k].color === t.color; k--) run++;
    // Moving a whole single-colour bottle into an empty one changes nothing: not a move.
    if (dst.length === 0 && run === src.length) return 0;
    return Math.min(run, free);
  }

  legalMoves(): [number, number][] {
    const out: [number, number][] = [];
    for (let a = 0; a < this.bottles.length; a++) for (let b = 0; b < this.bottles.length; b++) if (this.pourable(a, b) > 0) out.push([a, b]);
    return out;
  }

  pour(from: number, to: number): PourResult | null {
    const amount = this.pourable(from, to);
    if (this.stuck || this.won || amount === 0) return null;
    const src = this.bottles[from];
    const dst = this.bottles[to];
    const color = src[src.length - 1].color!;
    for (let i = 0; i < amount; i++) dst.push(src.pop()!);
    this.moves++;
    const completed = this.isComplete(to) ? to : -1;

    let revealed: PourResult['revealed'] = null;
    const t = src[src.length - 1];
    if (t && t.hidden) {
      const policy: Policy = this.ending === 'win' || this.earned < this.helpUntil ? 'helpful' : 'hostile';
      t.color = this.pickReveal(from, policy);
      t.hidden = false;
      revealed = { bottle: from, index: src.length - 1, color: t.color, policy };
    }

    this.won = this.bottles.every((b, i) => b.length === 0 || this.isComplete(i));
    this.visited.add(this.id());
    this.stuck = !this.won && this.deadEnd();
    return { from, to, color, amount, completed, revealed, stuck: this.stuck, won: this.won };
  }

  /**
   * Best move for hints and for the ad's own moves: the first pour of the shortest line that finishes
   * the level (or, in the 'stuck' ending, reaches its dead end). Searching real copies of the game means
   * a hint can never walk the player round in circles, whatever detour they took to get here.
   */
  bestMove(from?: number): [number, number] | null {
    const first = this.legalMoves()
      .filter(([a]) => from === undefined || a === from)
      .sort((x, y) => this.score(y) - this.score(x));
    if (first.length === 0) return null;
    const id = (l: Logic) => l.id();
    // If the level cannot be finished any more, the honest hint is the shortest way to find that out.
    const wantEnd = this.ending === 'stuck' || !this.finishable();
    const seen = new Set<string>([id(this)]);
    let frontier: { l: Logic; first: [number, number] }[] = [];
    for (const m of first) {
      const c = this.copy();
      c.pour(m[0], m[1]);
      frontier.push({ l: c, first: m });
    }
    for (let depth = 0; depth < 18 && frontier.length > 0 && seen.size < 4000; depth++) {
      const next: typeof frontier = [];
      for (const node of frontier) {
        if (node.l.won || (wantEnd && node.l.stuck)) return node.first;
        if (node.l.stuck) continue;
        const k = id(node.l);
        if (seen.has(k)) continue;
        seen.add(k);
        for (const m of node.l.legalMoves().sort((x, y) => node.l.score(y) - node.l.score(x))) {
          const c = node.l.copy();
          c.pour(m[0], m[1]);
          next.push({ l: c, first: node.first });
        }
      }
      frontier = next;
    }
    return first[0];
  }

  /** How natural a pour looks to a player. Only used to order otherwise equal choices. */
  private score([a, b]: [number, number]): number {
    const amount = this.pourable(a, b);
    const dst = this.bottles[b];
    const src = this.bottles[a];
    let score = 0;
    if (dst.length + amount === this.capacity && dst.every((u) => u.color === this.top(a)!.color)) score += 100; // completes a bottle
    if (dst.length > 0) score += 20 + dst.length * 2; // stacking onto the same colour beats using an empty bottle
    if (amount === src.length) score += 8; // empties the source
    if (src[src.length - 1 - amount]?.hidden) score += 6; // uncovers a mystery
    return score + amount - a * 0.01 - b * 0.001;
  }

  private pickReveal(bottle: number, policy: Policy): ColorId {
    const unit = this.bottles[bottle][this.bottles[bottle].length - 1];
    const options = [...new Set(this.pool)];
    // How useful a colour is right now: can it be poured away at once, and how much of it is still to come.
    const welcome = (c: ColorId) => {
      let s = 0;
      this.bottles.forEach((b, i) => {
        if (i === bottle || b.length === 0 || b.length >= this.capacity) return;
        const t = b[b.length - 1];
        if (!t.hidden && t.color === c) s += 10 + b.length;
      });
      return s + this.pool.filter((p) => p === c).length;
    };
    options.sort((a, b) => welcome(b) - welcome(a));
    const tableWith = (c: ColorId, test: (t: Table, cap: number) => boolean) => {
      unit.color = c;
      unit.hidden = false;
      const pool = this.pool.slice();
      pool.splice(pool.indexOf(c), 1);
      const r = test(this.table(pool), this.capacity);
      unit.color = null;
      unit.hidden = true;
      return r;
    };
    // Helpful: the friendliest-looking colour that keeps the level finishable.
    let pick = options.find((c) => tableWith(c, solvableWithLuck)) ?? options[0];
    if (policy === 'hostile') {
      // Hostile: the friendliest-looking colour after which the player can no longer force a win.
      pick = options.find((c) => !tableWith(c, playerCanForceWin)) ?? pick;
    }
    this.pool.splice(this.pool.indexOf(pick), 1);
    return pick;
  }

  /** Can the level still be completed if the hidden layers turn out as kindly as possible? */
  finishable(): boolean {
    return solvableWithLuck(this.table(), this.capacity);
  }

  id(): string {
    return this.bottles.map((b) => b.map((u) => (u.hidden ? '?' : u.color)).join(',')).join('|');
  }

  private deadEnd(): boolean {
    const legal = this.legalMoves();
    if (legal.length === 0) return true;
    if (solvableWithLuck(this.table(), this.capacity)) return false;
    // Unfinishable. It is only called once the player has nothing new left to try.
    return legal.every(([a, b]) => {
      const c = this.copy();
      c.visited = new Set(); // keep this probe from recursing into the same question
      c.bottles[b].push(...c.bottles[a].splice(c.bottles[a].length - this.pourable(a, b)));
      const t = c.bottles[a][c.bottles[a].length - 1];
      return !(t && t.hidden) && this.visited.has(c.id());
    });
  }

  /** The table in the solver's plain format. */
  table(pool: ColorId[] = this.pool, extraBottles = 0): Table {
    const bottles = this.bottles.map((b) => b.map((u) => (u.hidden ? '?' : u.color!)));
    for (let i = 0; i < extraBottles; i++) bottles.push([]);
    return { bottles, pool: [...pool] };
  }

  /** Is the "+1 bottle" pitch true for this table? */
  solvableWithExtraBottle(): boolean {
    return solvableWithLuck(this.table(this.pool, 1), this.capacity);
  }

  /** Test helper: the same table with one more empty bottle and only helpful reveals from here on. */
  withExtraBottle(): Logic {
    const c = Object.create(Logic.prototype) as Logic;
    Object.assign(c, this, { bottles: [...this.bottles.map((b) => b.map((u) => ({ ...u }))), []], pool: [...this.pool], ending: 'win', stuck: false });
    return c;
  }

  copy(): Logic {
    const c = Object.create(Logic.prototype) as Logic;
    Object.assign(c, this, { bottles: this.bottles.map((b) => b.map((u) => ({ ...u }))), pool: [...this.pool], visited: new Set(this.visited) });
    return c;
  }
}
