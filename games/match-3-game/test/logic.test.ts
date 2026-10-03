// Checks the board rules, the scripted opening and the rig, then plays thousands of whole ads:
//   rules   : lines, L/T shapes, rockets, TNT, crates, gravity, cascades.
//   opening : the ghost's swap makes nothing, the guided swap builds TNT, the TNT reaches the crates.
//   rig     : random players never meet a board without a legal move, and the hint always finishes the level.
//   heist   : the picks pay out in the scripted order, and the near miss puts a jackpot next to the last pick.
import { HEIST_PICKS, Heist, LEVEL, Logic, isBooster, type LevelDef, type Move } from '../src/logic';

let bad = 0;
const check = (ok: boolean, what: string) => {
  if (!ok) {
    bad++;
    console.log('  FAIL ' + what);
  }
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const level = (rows: string[], extra: Partial<LevelDef> = {}): Logic => new Logic({ ...LEVEL, rows, ...extra });

console.log('=== rules ===');
{
  // Horizontal 3
  const l = level(['GRBYG', 'RRYRG', 'BGBGB', '#####'], { goals: { leaf: 0, crate: 9 } });
  check(l.canSwap({ r: 1, c: 2 }, { r: 0, c: 2 }) === false, 'a swap that makes nothing is refused');
  check(l.canSwap({ r: 1, c: 2 }, { r: 1, c: 3 }), 'R R Y R: swapping Y and R makes a line');
  const res = l.play({ a: { r: 1, c: 2 }, b: { r: 1, c: 3 } });
  check(res.ok && res.waves[0].cleared.filter((x) => x.kind === 'apple').length === 3, 'three apples cleared');
  check(res.waves[0].cleared.filter((x) => x.kind === 'crate').length === 0, 'crates not touching the line stay');
}
{
  // Five in a row makes TNT on the moved tile; the crate under the line cracks
  const l = level(['BGRYB', 'RRYRR', 'GB#BG', 'BGYBG'], { goals: { leaf: 0, crate: 1 } });
  const res = l.play({ a: { r: 0, c: 2 }, b: { r: 1, c: 2 } });
  check(res.ok && res.waves[0].made[0]?.kind === 'tnt' && res.waves[0].made[0].r === 1 && res.waves[0].made[0].c === 2, 'five in a row makes TNT where the tile was moved to');
  check(res.waves[0].cleared.some((x) => x.kind === 'crate'), 'a crate touching the line cracks');
}
{
  // Exactly four in a row -> rocket
  const l = level(['BGRYB', 'RRYRG', 'GBGBG', 'BGYBG'], { goals: { leaf: 0, crate: 0 } });
  l.goals.crate = 1;
  const res = l.play({ a: { r: 0, c: 2 }, b: { r: 1, c: 2 } });
  check(res.ok && res.waves[0].made[0]?.kind === 'rocketH', 'four in a row makes a row rocket');
}
{
  // L shape -> TNT
  const l = level(['RGBGY', 'RBYBG', 'GRRBY', 'YBGYB'], { goals: { leaf: 0, crate: 1 } });
  // col 0 has R R (rows 0,1), row 2 has R R at c1,c2; swapping (2,0)G with (3,0)Y? Build an L by moving R into (2,0).
  const l2 = level(['RGBGY', 'RBYBG', 'GRRBY', 'RBGYB'], { goals: { leaf: 0, crate: 1 } });
  const res = l2.play({ a: { r: 2, c: 0 }, b: { r: 3, c: 0 } });
  check(res.ok && res.waves[0].made[0]?.kind === 'tnt', 'an L of five makes TNT');
  check(!l.canSwap({ r: 0, c: 0 }, { r: 0, c: 0 }), 'a tile cannot swap with itself');
}
{
  // Boosters: tapping fires, swapping fires, a blast sets off the next booster
  const l = level(['BGRYB', 'GYBRG', 'RBGBR', '#####'], { goals: { leaf: 0, crate: 5 } });
  l.grid[1][2] = { id: 900, kind: 'tnt' };
  const res = l.play({ a: { r: 1, c: 2 } });
  check(res.ok && res.waves[0].blasts.length === 1, 'tapping TNT fires it');
  check(l.goals.crate === 0, 'a 5x5 blast on a 5-wide board breaks every crate below it');
  const l2 = level(['BGRYB', 'GYBRG', 'RBGBR', 'YGYGY'], { goals: { leaf: 0, crate: 1 } });
  l2.grid[0][0] = { id: 901, kind: 'rocketV' };
  l2.grid[3][0] = { id: 902, kind: 'rocketH' };
  const r2 = l2.play({ a: { r: 0, c: 0 } });
  check(r2.waves[0].blasts.length === 2 && r2.waves[0].blasts[1].depth === 1, 'a rocket sets off the rocket in its path');
  check(isBooster('tnt') && !isBooster('leaf'), 'isBooster');
}
{
  // Gravity: tiles fall past nothing, stop on crates, new tiles come from above
  const l = level(['BGYYB', 'GYRBG', 'RRGRR', '#####'], { goals: { leaf: 0, crate: 9 } });
  const res = l.play({ a: { r: 1, c: 2 }, b: { r: 2, c: 2 } });
  const w = res.waves[0];
  check(res.ok && w.falls.some((f) => f.r0 < 0), 'new tiles drop in from above the board');
  check(l.grid.every((row) => row.every((t) => t !== null)), 'no holes after gravity');
  check(l.grid.slice(0, 3).every((row) => row.every((t) => t?.kind !== 'crate')), 'crates do not fall');
}

console.log('=== the scripted opening ===');
const start = new Logic(LEVEL);
check(start.legalMoves().length > 0, 'the opening board has moves');
check(start['findGroups']().length === 0, 'nothing matches before the first move');
check(start.grid.slice(0, -1).every((row) => row.every((t) => t?.kind !== 'crate')), 'crates sit only on the bottom row');
check(start.grid.flat().filter((t) => t?.kind === 'crate').length === LEVEL.goals.crate, 'the crate goal is every crate on the board');
check(start.canTry(...LEVEL.botch) && !start.canSwap(...LEVEL.botch), "the ghost's swap is a real swap that makes nothing");
const g = start.copy();
const g1 = g.play({ a: LEVEL.guide[0], b: LEVEL.guide[1] });
check(g1.ok && g1.waves[0].made[0]?.kind === 'tnt', 'the guided swap builds TNT');
check(g1.waves[0].cleared.filter((x) => x.kind === 'leaf').length === 5, 'the guided swap clears five leaves');
const tnt = g.find('tnt');
check(!!tnt, 'the TNT is still on the board for the second guided move');
const leavesBefore = g.goals.leaf;
const cratesBefore = g.goals.crate;
const g2 = g.play({ a: tnt! });
check(g2.ok && g2.waves[0].blasts[0]?.kind === 'tnt', 'tapping the TNT fires it');
console.log(`  after the guide: leaves ${leavesBefore} -> ${g.goals.leaf}, crates ${cratesBefore} -> ${g.goals.crate}, moves left ${g.movesLeft}`);
check(cratesBefore - g.goals.crate >= 4, 'the TNT breaks at least four crates');
check(!g.goalsDone, 'the guide alone does not finish the level: the player still has work to do');
console.log(g.show().split('\n').map((s) => '    ' + s).join('\n'));

console.log('=== the rig: whole ads ===');
{
  // The hint player, which is also what the ad plays when the viewer is idle.
  const h = g.copy();
  let n = 0;
  while (!h.goalsDone && !h.outOfMoves) {
    const m = h.bestMove();
    if (!m) break;
    h.play(m);
    n++;
  }
  console.log(`  hint player: done=${h.goalsDone} in ${n} free moves, ${h.movesLeft} left, shuffles ${h.shuffles}`);
  check(h.goalsDone, 'following the hints finishes the level');
  check(h.movesLeft >= 2, 'following the hints leaves moves to spare');
}
{
  // Random players: they swap anything legal, a little at random.
  const RUNS = 1500;
  let wins = 0;
  let shuffles = 0;
  let dead = 0;
  let movesUsed = 0;
  let hintRescued = 0;
  let hintTried = 0;
  const left = new Map<number, number>();
  for (let s = 1; s <= RUNS; s++) {
    const r = rng(s * 7919);
    const l = g.copy();
    while (!l.goalsDone && !l.outOfMoves) {
      const moves = l.legalMoves();
      if (!moves.length) {
        dead++;
        break;
      }
      // Half the time the hint's move, else anything. Viewers follow the hand a lot.
      const m: Move = r() < 0.4 ? l.bestMove()! : moves[Math.floor(r() * moves.length)];
      l.play(m);
      // From any state mid-way, the hints must still be able to finish if moves allow.
      if (s % 10 === 0 && !l.goalsDone && l.movesLeft >= 3) {
        hintTried++;
        const h = l.copy();
        while (!h.goalsDone && !h.outOfMoves) h.play(h.bestMove()!);
        if (h.goalsDone) hintRescued++;
      }
    }
    shuffles += l.shuffles;
    if (l.goalsDone) {
      wins++;
      movesUsed += l.movesMade - 2;
    } else {
      const k = l.goals.leaf + l.goals.crate;
      left.set(k, (left.get(k) ?? 0) + 1);
    }
  }
  console.log(`  ${RUNS} viewers: finished ${((wins / RUNS) * 100).toFixed(1)}%  (avg ${(movesUsed / Math.max(1, wins)).toFixed(1)} free moves)  shuffles ${shuffles}  dead boards ${dead}`);
  console.log(`  short by (goals left: runs): ${[...left.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join('  ') || '-'}`);
  console.log(`  hints finish from a random mid-level state with 3+ moves left: ${hintRescued}/${hintTried}`);
  check(dead === 0 && shuffles === 0, 'no viewer ever meets a board without a legal move');
  check(wins / RUNS > 0.8, 'most viewers finish the goals (the out-of-moves rescue is for the rest)');
  check(hintRescued / Math.max(1, hintTried) > 0.9, 'the hints finish from almost anywhere');
}

console.log('=== the heist ===');
for (const ending of ['win', 'lose'] as const) {
  const h = new Heist(ending);
  const a = h.pick(4);
  const b = h.pick(4);
  check(a?.kind === 'cash' && b === null, `${ending}: first pick pays cash; an open safe cannot be picked twice`);
  const m = h.pick(0);
  check(m?.kind === 'mult', `${ending}: second pick is the multiplier`);
  const last = h.pick(5);
  check(h.picks.length === HEIST_PICKS && h.done && h.pick(1) === null, `${ending}: three picks and done`);
  const rest = h.revealRest();
  const jackpots = rest.filter((x) => x.loot.kind === 'jackpot');
  if (ending === 'win') {
    check(last?.kind === 'jackpot' && h.total === 157500, 'win: the third safe is the jackpot, 157,500 in all');
  } else {
    check(last?.kind === 'noluck' && h.total === 7500, 'lose: the third safe is empty, 7,500 in all');
    check(jackpots.length === 2, 'lose: two jackpots were in the safes left closed');
    const near = jackpots.some((j) => Math.abs((j.i % 3) - 2) + Math.abs(Math.floor(j.i / 3) - 1) === 1);
    check(near, 'lose: one jackpot sat right next to the last pick');
    check(h.missed === 150000, 'lose: the jackpot would have paid 150,000 more');
  }
  check(rest.length === 6 && h.contents.every((x) => x !== null), `${ending}: every safe opens in the end`);
}

console.log(bad ? `\n${bad} CHECK(S) FAILED` : '\nall checks pass: rules, opening, rig and heist');
process.exit(bad ? 1 : 0);
