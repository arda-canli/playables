// Plays EVERY legal order of pours (after the guided first move) in both endings and checks the rig is honest:
//   both  : every dead end IS solvable with one extra bottle, and the hints never go round in circles.
//   win   : following the hints completes the level from any table that can still be completed.
//   stuck : no order can win.
import { LEVEL, Logic, type Ending } from '../src/logic';

const key = (l: Logic) => l.bottles.map((b) => b.map((u) => (u.hidden ? '?' : u.color![0] + u.color![1])).join('')).join('|');
const show = (l: Logic) => l.bottles.map((b) => b.map((u) => (u.hidden ? '?' : u.color![0].toUpperCase())).join('') || '-').join(' ');

interface Stats { hintFails: string[]; wins: Map<number, number>; stucks: Map<number, number>; loops: number; states: number; deadEnds: Map<string, { empty: boolean; honest: boolean; done: number }> }

function run(ending: Ending): Stats {
  const s: Stats = { hintFails: [], wins: new Map(), stucks: new Map(), loops: 0, states: 0, deadEnds: new Map() };
  const start = new Logic(LEVEL, ending);
  if (start.pourable(...LEVEL.botch) !== 0) throw new Error('the botched pour must be an illegal move');
  const first = start.pour(...LEVEL.guide);
  if (!first || first.completed < 0) throw new Error('the guided first pour must cork a bottle');
  const seen = new Set<string>();
  const walk = (l: Logic, path: Set<string>) => {
    if (l.won) return void s.wins.set(l.moves, (s.wins.get(l.moves) ?? 0) + 1);
    if (l.stuck) {
      s.stucks.set(l.moves, (s.stucks.get(l.moves) ?? 0) + 1);
      if (!s.deadEnds.has(show(l))) s.deadEnds.set(show(l), { empty: l.bottles.some((b) => b.length === 0), honest: l.solvableWithExtraBottle(), done: l.doneCount });
      return;
    }
    const k = key(l);
    // From here, do the hints finish the level without ever repeating a table?
    const h = l.copy();
    const hs = new Set<string>();
    const mustWin = ending === 'win' && l.finishable();
    while (!h.won && !h.stuck) {
      if (hs.has(key(h)) || hs.size > 40) { s.hintFails.push(show(l)); break; }
      hs.add(key(h));
      const m = h.bestMove();
      if (!m) break;
      h.pour(...m);
    }
    if (mustWin && h.stuck) s.hintFails.push(show(l));
    if (path.has(k)) return void s.loops++;
    if (seen.has(k) || l.moves > 24) return;
    seen.add(k);
    s.states++;
    path.add(k);
    for (const [a, b] of l.legalMoves()) {
      const c = l.copy();
      c.pour(a, b);
      walk(c, path);
    }
    path.delete(k);
  };
  walk(start, new Set());
  return s;
}

const fmt = (m: Map<number, number>) => [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join('  ') || '-';
let bad = false;
for (const ending of ['win', 'stuck'] as Ending[]) {
  const s = run(ending);
  console.log(`\n=== ending=${ending}, ALL legal orders of pours ===`);
  console.log(`states ${s.states}   wins by pour count: ${fmt(s.wins)}   dead ends by pour count: ${fmt(s.stucks)}   loops cut: ${s.loops}`);
  for (const [state, d] of s.deadEnds) {
    console.log(`  dead end: ${state}   corked ${d.done}   empty bottle on shelf: ${d.empty}   +1 bottle solves it: ${d.honest}`);
    if (!d.honest) bad = true;
  }
  console.log(`  hints that loop or fail: ${s.hintFails.length}${s.hintFails.length ? ' -> ' + s.hintFails.slice(0, 3).join(' ; ') : ''}`);
  if (s.hintFails.length) bad = true;
  if (ending === 'win' && !s.wins.size) bad = true;
  if (ending === 'stuck' && (s.wins.size || !s.stucks.size)) bad = true;
}
console.log(bad ? '\nRIG BROKEN' : '\nrig ok: no invented colours, hints never loop, every dead end is genuinely one bottle short');
process.exit(bad ? 1 : 0);
