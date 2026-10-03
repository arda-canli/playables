// Runs the real physics headless and checks the promises the ad script makes.
//   npx tsx games/puzzle-game/test/sim.test.ts
import { LEVEL, TABLE_Y, type V3 } from '../src/level';
import { Sim, TICK, type Ending } from '../src/sim';
import { makeRng } from '../../../kit/src/tween';

let failed = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? '  ok ' : 'FAIL '} ${msg}`);
  if (!ok) failed++;
};

const run = (sim: Sim, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / TICK); i++) sim.step();
};

/** Waits until the level stops moving (or a timeout), the way the game decides that a shot is over. */
const settle = (sim: Sim, max = 4) => {
  let quiet = 0;
  for (let t = 0; t < max; t += TICK) {
    sim.step();
    quiet = sim.motion < 0.3 && sim.inFlight === 0 ? quiet + TICK : 0;
    if (quiet > 0.4) return;
  }
};

/** Plays the ad the way autoplay does: botched opening, the guided shot, then the best shot until the balls run out. */
function playThrough(ending: Ending, jitter = 0, seed = 1): { left: number; shots: number; keystone: number; afterGiant: number } {
  const sim = new Sim(LEVEL, ending);
  const rng = makeRng(seed);
  sim.fire(LEVEL.ghostTarget, { free: true, power: LEVEL.ghostPower });
  // The game hands over only once the level is fully asleep (or 3 s have passed), so do the same.
  while (!sim.asleep && sim.time - sim.lastShotAt < 3) sim.step();
  const before = sim.smashed;
  sim.fire(LEVEL.keystone);
  settle(sim);
  const keystone = sim.smashed - before;
  while (sim.ballsLeft > 0 && sim.jarsLeft > 0) {
    const t = sim.bestTarget();
    if (!t) break;
    if (t[1] < TABLE_Y + 0.1) lowAims++;
    const aim: V3 = [t[0] + (rng() - 0.5) * jitter, t[1] + (rng() - 0.5) * jitter, t[2]];
    sim.fire(aim);
    run(sim, 0.9);
  }
  settle(sim);
  const left = sim.jarsLeft;
  // In 'win' the game hands out a free giant ball when the balls run out.
  if (left > 0) {
    sim.fire(sim.bestTarget() ?? [0, 3, -14], { giant: true });
    settle(sim, 5);
  }
  return { left, shots: sim.shots, keystone, afterGiant: sim.jarsLeft };
}

console.log('Puzzle Game sim');
let lowAims = 0;

{
  const sim = new Sim(LEVEL, 'stuck');
  const start = LEVEL.pieces.map((_s, i) => sim.where(i));
  run(sim, 10);
  const drift = Math.max(...start.map((p, i) => Math.hypot(...(sim.where(i).map((v, k) => v - p[k]) as V3))));
  check(sim.jarsLeft === sim.jarsTotal, `untouched level loses nothing in 10 s (${sim.jarsLeft}/${sim.jarsTotal})`);
  check(drift < 0.02, `untouched stacks stay put (max drift ${drift.toFixed(4)})`);
}

{
  const sim = new Sim(LEVEL, 'stuck');
  sim.fire(LEVEL.ghostTarget, { free: true, power: LEVEL.ghostPower });
  settle(sim);
  const ghost = sim.smashed - LEVEL.alreadySmashed;
  check(ghost >= 1 && ghost <= 2, `the botched opening only clips the top (${ghost} jar)`);
  check(sim.ballsLeft === LEVEL.balls.stuck, 'the botched opening costs the viewer no ball');
}

for (const ending of ['stuck', 'win'] as Ending[]) {
  const a = playThrough(ending);
  const b = playThrough(ending);
  check(a.left === b.left && a.shots === b.shots, `${ending}: deterministic (${a.left} left after ${a.shots} shots, twice)`);
  check(a.keystone >= 6, `${ending}: the guided shot brings a tower down (${a.keystone} jars)`);
}

const hist = (ending: Ending, n: number, jitter: number) => {
  const h: Record<number, number> = {};
  for (let s = 1; s <= n; s++) {
    const r = playThrough(ending, jitter, s);
    h[r.left] = (h[r.left] ?? 0) + 1;
  }
  return h;
};
const stuck = hist('stuck', 24, 0.9);
console.log('  stuck, jars left over 24 sloppy runs:', JSON.stringify(stuck));
const clean = playThrough('stuck');
check(clean.left >= 1 && clean.left <= 4, `stuck: autoplay ends a near miss (${clean.left} jars left)`);
const giants = [1, 2, 3, 4, 5, 6].map((s) => playThrough('win', 0.9, s).afterGiant);
check(giants.every((n) => n === 0), `win: the giant ball always clears what is left (${giants.join(',')})`);
const win = hist('win', 12, 0.9);
console.log('  win, jars left over 12 sloppy runs (the giant ball clears the rest):', JSON.stringify(win));

check(lowAims === 0, `the hint never aims into the table (${lowAims} low aims over every run)`);

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall sim checks passed');
