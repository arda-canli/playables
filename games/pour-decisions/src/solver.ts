// A tiny exact solver for water sort with hidden layers, used by the ad director.
//
// It answers one question: from this table, can the player force a win if every hidden layer that
// surfaces is given the WORST possible colour from the real pool? It is a minimax search: the player
// picks pours, the director picks reveals. Tables are small, so with memoisation this takes milliseconds.

export type Cell = string; // a colour id, or '?' for a hidden unit
export interface Table {
  bottles: Cell[][];
  /** Colours still owed to the hidden units. Always real colours of this level. */
  pool: string[];
}

export function isDone(b: Cell[], cap: number): boolean {
  return b.length === cap && b[0] !== '?' && b.every((c) => c === b[0]);
}

export function amount(t: Table, from: number, to: number, cap: number): number {
  if (from === to) return 0;
  const src = t.bottles[from];
  const dst = t.bottles[to];
  if (src.length === 0 || isDone(src, cap) || isDone(dst, cap)) return 0;
  const top = src[src.length - 1];
  if (top === '?') return 0;
  const free = cap - dst.length;
  if (free === 0) return 0;
  if (dst.length > 0 && dst[dst.length - 1] !== top) return 0;
  let run = 0;
  for (let k = src.length - 1; k >= 0 && src[k] === top; k--) run++;
  if (dst.length === 0 && run === src.length) return 0; // moving a whole single-colour bottle changes nothing
  return Math.min(run, free);
}

export function moves(t: Table, cap: number): [number, number][] {
  const out: [number, number][] = [];
  for (let a = 0; a < t.bottles.length; a++) for (let b = 0; b < t.bottles.length; b++) if (amount(t, a, b, cap) > 0) out.push([a, b]);
  return out;
}

const keyOf = (t: Table) => t.bottles.map((b) => b.join(',')).sort().join('|') + '#' + [...t.pool].sort().join(',');

function won(t: Table, cap: number): boolean {
  return t.bottles.every((b) => b.length === 0 || isDone(b, cap));
}

/** After a pour, the tables that can follow: one per colour the director could reveal (or just one if nothing surfaced). */
function after(t: Table, a: number, b: number, n: number): Table[] {
  const bottles = t.bottles.map((x) => x.slice());
  for (let i = 0; i < n; i++) bottles[b].push(bottles[a].pop()!);
  const src = bottles[a];
  if (src.length === 0 || src[src.length - 1] !== '?') return [{ bottles, pool: t.pool }];
  return [...new Set(t.pool)].map((c) => {
    const bs = bottles.map((x) => x.slice());
    bs[a][bs[a].length - 1] = c;
    const pool = t.pool.slice();
    pool.splice(pool.indexOf(c), 1);
    return { bottles: bs, pool };
  });
}

/** True if the player can win no matter which colours the director reveals. */
export function playerCanForceWin(t: Table, cap: number, memo = new Map<string, boolean>()): boolean {
  if (won(t, cap)) return true;
  const k = keyOf(t);
  const hit = memo.get(k);
  if (hit !== undefined) return hit;
  memo.set(k, false); // a position that only loops back on itself is not a win
  for (const [a, b] of moves(t, cap)) {
    const outcomes = after(t, a, b, amount(t, a, b, cap));
    if (outcomes.every((o) => playerCanForceWin(o, cap, memo))) {
      memo.set(k, true);
      return true;
    }
  }
  return false;
}

/** True if the table can be finished when every reveal is the player's choice (the friendliest possible director). */
export function solvableWithLuck(t: Table, cap: number, memo = new Map<string, boolean>()): boolean {
  if (won(t, cap)) return true;
  const k = keyOf(t);
  const hit = memo.get(k);
  if (hit !== undefined) return hit;
  memo.set(k, false);
  for (const [a, b] of moves(t, cap)) {
    if (after(t, a, b, amount(t, a, b, cap)).some((o) => solvableWithLuck(o, cap, memo))) {
      memo.set(k, true);
      return true;
    }
  }
  return false;
}
