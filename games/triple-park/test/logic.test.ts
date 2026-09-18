// Brute-force check of the rig: plays EVERY possible order of taps and reports what can happen.
import { LEVEL, Logic, type Ending } from '../src/logic';

interface Stats {
  games: number;
  wins: number;
  fails: number;
  stuck: number;
  peak: Map<number, number>;
  failTaps: Map<number, number>;
  earliestFail: number;
  winTaps: Set<number>;
}

function clone(l: Logic): Logic {
  const c = Object.create(Logic.prototype) as Logic;
  Object.assign(c, l, {
    lanes: l.lanes.map((lane) => lane.map((car) => ({ ...car }))),
    waiting: l.waiting.map((car) => ({ ...car })),
    pool: [...(l as unknown as { pool: string[] }).pool],
    decoys: [...(l as unknown as { decoys: string[] }).decoys],
  });
  return c;
}

function explore(l: Logic, s: Stats, onlySensible: boolean): void {
  if (l.over) {
    s.games++;
    if (l.won) {
      s.wins++;
      s.winTaps.add(l.taps);
      s.peak.set(l.peakWaiting, (s.peak.get(l.peakWaiting) ?? 0) + 1);
    } else {
      s.fails++;
      s.failTaps.set(l.taps, (s.failTaps.get(l.taps) ?? 0) + 1);
      s.earliestFail = Math.min(s.earliestFail, l.taps);
    }
    return;
  }
  let moved = false;
  for (let i = 0; i < l.lanes.length; i++) {
    const car = l.front(i);
    if (!car) continue;
    // "Sensible" players take a car that completes a set if there is one,
    // otherwise a car whose colour is already waiting, otherwise anything.
    if (onlySensible) {
      const best = Math.max(...l.lanes.map((lane) => (lane[0] ? l.countWaiting(lane[0].color) : -1)));
      if (l.countWaiting(car.color) !== best) continue;
    }
    moved = true;
    const c = clone(l);
    c.tap(i);
    explore(c, s, onlySensible);
  }
  if (!moved) {
    s.games++;
    s.stuck++;
  }
}

function run(ending: Ending, onlySensible: boolean): Stats {
  const l = new Logic(LEVEL, ending);
  l.tap(LEVEL.ghostLane); // botched opening
  l.tap(LEVEL.guideLane); // guaranteed first win
  const s: Stats = { games: 0, wins: 0, fails: 0, stuck: 0, peak: new Map(), failTaps: new Map(), earliestFail: Infinity, winTaps: new Set() };
  explore(l, s, onlySensible);
  return s;
}

const fmt = (m: Map<number, number>) => [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join('  ');
let bad = false;

for (const ending of ['win', 'lose'] as Ending[]) {
  for (const sensible of [false, true]) {
    const s = run(ending, sensible);
    console.log(`\n=== ending=${ending}  players=${sensible ? 'sensible (prefer cars that match the holder)' : 'ALL possible tap orders'} ===`);
    console.log(`games ${s.games}   wins ${s.wins} (${((100 * s.wins) / s.games).toFixed(1)}%)   fails ${s.fails}   stuck ${s.stuck}`);
    if (s.wins) console.log(`peak cars waiting in winning games  ${fmt(s.peak)}   taps to win: ${[...s.winTaps].join(',')}`);
    if (s.fails) console.log(`fails by tap number (incl. 2 scripted)  ${fmt(s.failTaps)}   earliest: ${s.earliestFail}`);
    if (s.stuck) bad = true;
    if (ending === 'win' && sensible && s.fails) bad = true;
    if (ending === 'lose' && s.wins) bad = true;
  }
}
console.log(bad ? '\nRIG BROKEN' : '\nrig ok');
process.exit(bad ? 1 : 0);
