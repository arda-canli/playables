// Checks the promises the ad script makes, headless:
//   npx tsx games/rescue-game/test/logic.test.ts
import { DICE, GUIDE, START } from '../src/level';
import { Board } from '../src/logic';
import { Rescue } from '../src/rig';

let failed = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? '  ok ' : 'FAIL '} ${msg}`);
  if (!ok) failed++;
};

console.log('Rescue Game');

// ---------------------------------------------------------------- the board
{
  const b = new Board(START);
  check(b.findMatches().length === 0, 'the board starts with no line already made');
  const moves = b.legalMoves();
  check(moves.length >= 4, `there are plenty of first moves (${moves.length})`);
  check(b.canSwap(GUIDE[0], GUIDE[1]), 'the guided move is legal');
  const res = b.swap(GUIDE[0], GUIDE[1])!;
  check(res.cells.length >= 3 && res.cells.every((p) => p.c === 3 && p.r <= 2), 'the guided move digs the top of column 3');
  const next = b.bestMove();
  const after = b.clone();
  const r2 = next ? after.swap(next.a, next.b) : null;
  check(!!r2?.opened, 'after it, the hint opens a channel to the bottom');
}

// Every order of moves: the viewer can always reach the dice before running out of moves.
{
  let dead = 0;
  let states = 0;
  const walk = (b: Board, depth: number) => {
    if (b.matches >= DICE) return;
    const moves = b.legalMoves();
    states++;
    if (!moves.length) dead++;
    for (const m of moves) {
      const c = b.clone();
      c.swap(m.a, m.b);
      walk(c, depth + 1);
    }
  };
  walk(new Board(START), 0);
  check(dead === 0, `no dead end before ${DICE} matches over every order of moves (${states} states)`);
}

// ---------------------------------------------------------------- bricks and the squeeze
{
  // The ad plays itself: guided move at 3 s, then the hint every 2 s, until the dice meter is full.
  const rig = new Rescue();
  let t = 0;
  const at = [3, 5, 7];
  let next = 0;
  let drainedBefore = 0;
  let firstDrainAt = -1;
  while (t < 9.5) {
    rig.update(1 / 60);
    t += 1 / 60;
    if (next < at.length && t >= at[next]) {
      const m = next === 0 ? { a: GUIDE[0], b: GUIDE[1] } : rig.board.bestMove()!;
      rig.swap(m.a, m.b);
      next++;
      if (next === 2) drainedBefore = rig.sand.drained;
    }
    if (firstDrainAt < 0 && rig.sand.drained > 0) firstDrainAt = t;
  }
  console.log(`  peak tension ${rig.peak.toFixed(2)}, drained ${rig.sand.drained}, in tank ${rig.inTank}, first brick out at ${firstDrainAt.toFixed(1)} s`);
  check(rig.peak >= 0.55 && rig.peak < 1, 'the bricks climb towards the pig but never bury him');
  check(rig.sand.drained > drainedBefore + 150, 'once the channel opens, the bricks really pour out');
  check(firstDrainAt > 5 && firstDrainAt < 6.5, 'the drain starts right after the second match');
}

{
  // Nobody touches anything: the bucket still never buries the pig (the rubber band holds).
  const rig = new Rescue();
  for (let i = 0; i < 60 * 20; i++) rig.update(1 / 60);
  check(rig.peak < 1, `an idle viewer sees the squeeze peak at ${rig.peak.toFixed(2)}, short of the pig's chest`);
  check(rig.tension > 0.75, `and stay high (${rig.tension.toFixed(2)}) so it feels urgent`);
}

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
