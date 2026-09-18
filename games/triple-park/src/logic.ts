// Pure game rules for Triple Park. No rendering, no DOM: this file is unit-tested by brute force.
//
// Rules (mirroring the lane-based car match genre):
//   - Cars queue in lanes. Only the front car of a lane can be tapped.
//   - A tapped car drives to the holder. The holder has `capacity` slots.
//   - Three cars of one colour in the holder leave on a truck.
//   - A full holder with no match loses. `goal` trucks wins.
//
// The rig: cars marked '?' are mystery cars. Their colour is decided only when they reach the
// front of their lane, by `pickReveal`, based on the holder at that moment. In the 'win' ending
// the policy builds pressure up to one free slot and then always offers a way out. In the
// 'lose' ending the missing third car never arrives.

export type ColorId = 'red' | 'yellow' | 'green' | 'blue' | 'purple' | 'orange' | 'teal' | 'pink';
export type Ending = 'win' | 'lose';

export interface LevelDef {
  /** Front of the lane first. '?' is a mystery car. */
  lanes: (ColorId | '?')[][];
  holderStart: ColorId[];
  /** Lane the ghost hand taps during the botched opening. */
  ghostLane: number;
  /** Lane the hint hand points to for the guaranteed first win. */
  guideLane: number;
  capacity: number;
  goal: number;
  decoys: ColorId[];
}

export const LEVEL: LevelDef = {
  lanes: [
    ['red', 'purple', '?'],
    ['blue', 'blue'],
    ['yellow', 'red', '?'],
    ['green', 'blue'],
    ['purple', 'yellow', '?'],
  ],
  holderStart: ['green', 'green'],
  ghostLane: 1,
  guideLane: 3,
  capacity: 7,
  goal: 5,
  decoys: ['orange', 'teal', 'pink'],
};

export interface CarSpec {
  id: number;
  color: ColorId | null;
  mystery: boolean;
  lane: number;
}

export interface TapResult {
  car: CarSpec;
  /** The three cars that now leave together, if this tap completed a set. */
  matched: CarSpec[] | null;
  /** The mystery car that just reached the front of this lane and got its colour. */
  revealed: CarSpec | null;
  failed: boolean;
  won: boolean;
}

export class Logic {
  readonly lanes: CarSpec[][];
  readonly waiting: CarSpec[] = [];
  readonly capacity: number;
  readonly goal: number;
  sent = 0;
  failed = false;
  won = false;
  taps = 0;
  /** Most cars left sitting in the holder after a tap resolved. */
  peakWaiting = 0;
  /** Most slots in use at any instant, counting the arriving car before its set leaves. */
  peakOccupied = 0;

  private pool: ColorId[];
  private decoys: ColorId[];

  constructor(level: LevelDef, readonly ending: Ending) {
    let id = 0;
    this.capacity = level.capacity;
    this.goal = level.goal;
    this.decoys = [...level.decoys];
    this.lanes = level.lanes.map((lane, li) =>
      lane.map((c) => ({ id: id++, color: c === '?' ? null : c, mystery: c === '?', lane: li })),
    );
    for (const c of level.holderStart) this.waiting.push({ id: id++, color: c, mystery: false, lane: -1 });

    // The colours still owed to complete every started set become the mystery pool.
    const counts = new Map<ColorId, number>();
    for (const c of [...level.lanes.flat(), ...level.holderStart]) if (c !== '?') counts.set(c, (counts.get(c) ?? 0) + 1);
    this.pool = [];
    for (const [c, n] of counts) for (let i = 0; i < (3 - (n % 3)) % 3; i++) this.pool.push(c);

    for (const lane of this.lanes) this.revealFront(lane);
    this.peakWaiting = this.waiting.length;
  }

  front(lane: number): CarSpec | undefined {
    return this.lanes[lane]?.[0];
  }

  get carsLeft(): number {
    return this.lanes.reduce((n, l) => n + l.length, 0);
  }

  get over(): boolean {
    return this.failed || this.won;
  }

  countWaiting(color: ColorId | null): number {
    return this.waiting.filter((c) => c.color === color).length;
  }

  /** 0 = relaxed, 1 = one slot left. */
  get tension(): number {
    const free = this.capacity - this.waiting.length;
    return Math.min(1, Math.max(0, (4 - free) / 3));
  }

  tap(laneIndex: number): TapResult | null {
    const lane = this.lanes[laneIndex];
    if (this.over || !lane || lane.length === 0) return null;
    const car = lane.shift()!;
    this.taps++;

    // Same colours park next to each other, like every tile-holder game.
    let idx = this.waiting.length;
    for (let i = this.waiting.length - 1; i >= 0; i--) {
      if (this.waiting[i].color === car.color) {
        idx = i + 1;
        break;
      }
    }
    this.waiting.splice(idx, 0, car);
    this.peakOccupied = Math.max(this.peakOccupied, this.waiting.length);

    let matched: CarSpec[] | null = null;
    if (this.countWaiting(car.color) >= 3) {
      matched = this.waiting.filter((c) => c.color === car.color);
      for (const m of matched) this.waiting.splice(this.waiting.indexOf(m), 1);
      this.sent++;
      if (this.sent >= this.goal) this.won = true;
    }
    this.peakWaiting = Math.max(this.peakWaiting, this.waiting.length);
    if (!matched && this.waiting.length >= this.capacity) this.failed = true;

    const revealed = this.over ? null : this.revealFront(lane);
    return { car, matched, revealed, failed: this.failed, won: this.won };
  }

  /** Best lane for hints and for the ad's own moves. -1 when nothing can be tapped. */
  bestLane(): number {
    let best = -1;
    let bestScore = -Infinity;
    const free = this.capacity - this.waiting.length;
    this.lanes.forEach((lane, i) => {
      const car = lane[0];
      if (!car) return;
      const have = this.countWaiting(car.color);
      // Completing a set beats building a pair beats starting a new colour.
      let score = have === 2 ? 100 : have === 1 ? 10 : 0;
      // A pair is only worth starting if its partner is reachable soon.
      const partners = this.lanes.filter((l, j) => j !== i && l[0]?.color === car.color).length;
      score += partners * 3;
      if (this.decoys.includes(car.color!) && have === 0) score -= 50;
      if (free <= 1 && have < 2) score -= 40;
      score -= i * 0.01; // stable tie-break
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return best;
  }

  private revealFront(lane: CarSpec[]): CarSpec | null {
    const car = lane[0];
    if (!car || !car.mystery || car.color) return null;
    car.color = this.pickReveal();
    return car;
  }

  private pickReveal(): ColorId {
    if (this.ending === 'lose') {
      // The third car never comes. Distinct decoys so they cannot match each other either.
      return this.decoys.shift() ?? 'orange';
    }
    if (this.pool.length === 0) return this.decoys.shift() ?? 'orange';
    const free = this.capacity - this.waiting.length;
    const byCount = [...this.pool].sort((a, b) => this.countWaiting(a) - this.countWaiting(b));
    // With room to spare, reveal the least helpful colour so the holder keeps filling.
    // With one slot left (or none), reveal the colour that completes a set: the rescue.
    const pick = free <= 1 ? byCount[byCount.length - 1] : byCount[0];
    this.pool.splice(this.pool.indexOf(pick), 1);
    return pick;
  }
}
