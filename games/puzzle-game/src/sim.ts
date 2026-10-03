// The rules and the rig, on top of a real rigid-body world (cannon-es). No rendering here, so the tests run it headless.
// Everything advances in fixed ticks, so the same shots at the same ticks always produce the same level.
import * as CANNON from 'cannon-es';
import { BALL_R, BALL_SPEED, GRAVITY, HALF, LEVEL, MASS, MUZZLE, TABLE_HALF, TABLE_THICK, TABLE_Y, TZ, type JarColor, type Kind, type Level, type V3 } from './level';

export type Ending = 'stuck' | 'win';

export const TICK = 1 / 60;
const SUBSTEPS = 2; // at 30 m/s the ball moves 0.25 per substep, less than its radius, so it cannot tunnel
const CRASH_SPEED = 7.5; // a jar hit this hard by anything shatters: the chain reaction
const BLAST_R = 1.55;
const BLAST_POWER = 9;
const GIANT_R = 0.95;

export interface Piece {
  id: number;
  kind: Kind;
  color?: JarColor;
  body: CANNON.Body;
  alive: boolean;
  /** Seconds this piece has spent below the table top. */
  fallen: number;
  /** Giant ball: seconds until this jar bursts. */
  doom: number;
}

export interface Ball {
  id: number;
  body: CANNON.Body;
  giant: boolean;
  hit: boolean;
  alive: boolean;
  age: number;
  power: number;
  /** Shots the ad fires for itself (the botched opening) cost the viewer nothing. */
  free: boolean;
}

export type SimEvent =
  | { type: 'impact'; ball: Ball; at: V3; giant: boolean }
  | { type: 'burst'; piece: Piece; at: V3; cause: 'ball' | 'crash' | 'fall'; combo: number }
  | { type: 'knock'; piece: Piece; at: V3; speed: number }
  | { type: 'ballGone'; ball: Ball };

export interface FireOpts {
  free?: boolean;
  /** Overrides the rig's blast strength. The botched opening uses a feeble one. */
  power?: number;
  giant?: boolean;
}

export class Sim {
  readonly world: CANNON.World;
  readonly pieces: Piece[] = [];
  readonly balls: Ball[] = [];
  readonly jarsTotal: number;
  ballsLeft: number;
  smashed: number;
  shots = 0;
  time = 0;
  /** Bursts since the last shot was fired: the combo. */
  combo = 0;
  lastShotAt = -99;

  private events: SimEvent[] = [];
  private crashed = new Set<Piece>();
  private byBody = new Map<CANNON.Body, Piece>();
  private nextBall = 0;
  private knockBudget = 0;

  constructor(
    readonly level: Level = LEVEL,
    readonly ending: Ending = 'stuck',
  ) {
    const w = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0), allowSleep: true });
    (w.solver as CANNON.GSSolver).iterations = 14;
    w.defaultContactMaterial.friction = 0.55;
    w.defaultContactMaterial.restitution = 0.06;
    w.broadphase = new CANNON.SAPBroadphase(w);
    this.world = w;

    const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    w.addBody(ground);
    const table = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(TABLE_HALF.x, TABLE_THICK / 2, TABLE_HALF.z)) });
    table.position.set(0, TABLE_Y - TABLE_THICK / 2, TZ);
    w.addBody(table);
    const pillar = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(0.42, (TABLE_Y - TABLE_THICK) / 2, 0.42)) });
    pillar.position.set(0, (TABLE_Y - TABLE_THICK) / 2, TZ);
    w.addBody(pillar);

    level.pieces.forEach((spec, id) => {
      const h = HALF[spec.kind];
      const body = new CANNON.Body({ mass: MASS[spec.kind], shape: new CANNON.Box(new CANNON.Vec3(h[0], h[1], h[2])) });
      body.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
      body.linearDamping = 0.05;
      body.angularDamping = 0.12;
      body.sleepSpeedLimit = 0.22;
      body.sleepTimeLimit = 0.45;
      const p: Piece = { id, kind: spec.kind, color: spec.color, body, alive: true, fallen: 0, doom: -1 };
      if (spec.kind === 'jar') {
        // Jars are glass: anything that hits one hard enough shatters it. That is what makes chain reactions.
        body.addEventListener('collide', (e: { contact: CANNON.ContactEquation }) => {
          if (p.alive && Math.abs(e.contact.getImpactVelocityAlongNormal()) > CRASH_SPEED) this.crashed.add(p);
        });
      }
      body.addEventListener('collide', (e: { contact: CANNON.ContactEquation }) => {
        const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
        if (v > 2.2 && this.knockBudget > 0) {
          this.knockBudget--;
          this.events.push({ type: 'knock', piece: p, at: [body.position.x, body.position.y, body.position.z], speed: v });
        }
      });
      w.addBody(body);
      this.pieces.push(p);
      this.byBody.set(body, p);
    });
    this.jarsTotal = this.pieces.filter((p) => p.kind === 'jar').length;
    this.smashed = level.alreadySmashed;
    this.ballsLeft = level.balls[ending];
    this.settle();
  }

  /** Lets the stacks find their rest before anyone sees them, then puts every piece to sleep. */
  private settle(): void {
    this.world.allowSleep = false;
    for (let i = 0; i < 90; i++) this.world.step(TICK);
    this.world.allowSleep = true;
    for (const p of this.pieces) {
      p.body.velocity.setZero();
      p.body.angularVelocity.setZero();
      p.body.sleep();
    }
  }

  get goal(): number {
    return this.jarsTotal + this.level.alreadySmashed;
  }

  get jarsLeft(): number {
    let n = 0;
    for (const p of this.pieces) if (p.alive && p.kind === 'jar') n++;
    return n;
  }

  get inFlight(): number {
    let n = 0;
    for (const b of this.balls) if (b.alive && !b.hit) n++;
    return n;
  }

  /** Every piece asleep: from here a shot plays out the same whatever tick it is fired on. */
  get asleep(): boolean {
    for (const p of this.pieces) if (p.alive && p.body.sleepState !== CANNON.Body.SLEEPING) return false;
    return true;
  }

  /** Fastest-moving piece: the level is "settled" once this drops near zero. */
  get motion(): number {
    let m = 0;
    for (const p of this.pieces) if (p.alive && p.body.sleepState !== CANNON.Body.SLEEPING) m = Math.max(m, p.body.velocity.length());
    return m;
  }

  /**
   * The rubber band. In 'stuck' the blast is strong while the table is full and weakens as it empties, so a typical
   * run ends a few jars short and a perfect one can still clear it. In 'win' it is the other way round.
   */
  rig(): { power: number; reach: number } {
    const f = this.jarsLeft / this.jarsTotal;
    if (this.ending === 'stuck') return { power: 0.5 + 0.75 * f, reach: 0.06 + 0.26 * f };
    return { power: 1 + 0.45 * (1 - f), reach: 0.34 };
  }

  fire(target: V3, opts: FireOpts = {}): Ball | null {
    if (!opts.free && !opts.giant && this.ballsLeft <= 0) return null;
    const r = opts.giant ? GIANT_R : BALL_R;
    const body = new CANNON.Body({ mass: opts.giant ? 40 : 8, shape: new CANNON.Sphere(r) });
    body.position.set(MUZZLE[0], MUZZLE[1], MUZZLE[2]);
    body.linearDamping = 0;
    body.allowSleep = false;
    // Aim so the arc lands exactly on the target: v = d/T + g*T/2.
    const dx = target[0] - MUZZLE[0];
    const dy = target[1] - MUZZLE[1];
    const dz = target[2] - MUZZLE[2];
    const T = Math.hypot(dx, dy, dz) / (opts.giant ? BALL_SPEED * 0.7 : BALL_SPEED);
    body.velocity.set(dx / T, dy / T + (GRAVITY * T) / 2, dz / T);
    this.world.addBody(body);
    const ball: Ball = { id: this.nextBall++, body, giant: !!opts.giant, hit: false, alive: true, age: 0, power: opts.power ?? this.rig().power, free: !!opts.free };
    this.balls.push(ball);
    if (!opts.free && !opts.giant) this.ballsLeft--;
    this.shots++;
    this.combo = 0;
    this.lastShotAt = this.time;
    return ball;
  }

  /** One fixed tick. Returns what happened, for the scene and the sound to react to. */
  step(): SimEvent[] {
    this.events = [];
    this.knockBudget = 6;
    for (let s = 0; s < SUBSTEPS; s++) {
      this.world.step(TICK / SUBSTEPS);
      this.checkBalls();
    }
    this.time += TICK;
    for (const p of this.crashed) this.burst(p, 'crash');
    this.crashed.clear();

    for (const p of this.pieces) {
      if (!p.alive) continue;
      const y = p.body.position.y;
      if (p.doom > 0) {
        p.doom -= TICK;
        if (p.doom <= 0) this.burst(p, 'ball');
        continue;
      }
      if (y < TABLE_Y - 0.35) {
        // Off the table. Jars burst when they reach the grass; everything else just lies there.
        p.fallen += TICK;
        if (p.kind === 'jar' && (y < HALF.jar[1] + 0.12 || p.fallen > 0.7)) this.burst(p, 'fall');
      }
    }
    for (const b of this.balls) {
      if (!b.alive) continue;
      b.age += TICK;
      const pos = b.body.position;
      if (b.age > 2.4 || pos.y < -2 || pos.z < TZ - 14) {
        b.alive = false;
        this.world.removeBody(b.body);
        this.events.push({ type: 'ballGone', ball: b });
      }
    }
    return this.events;
  }

  private checkBalls(): void {
    for (const b of this.balls) {
      if (!b.alive) continue;
      const pos = b.body.position;
      const speed = b.body.velocity.length();
      const r = b.giant ? GIANT_R : BALL_R;
      const reach = this.rig().reach;
      for (const p of this.pieces) {
        if (!p.alive) continue;
        const d = boxDistance(p, pos);
        if (!b.hit && d <= r + 0.02) this.impact(b, p);
        // A ball that is still moving fast bursts every jar it touches.
        if (b.hit && p.kind === 'jar' && speed > 8 && d <= r + reach) this.burst(p, 'ball');
      }
    }
  }

  private impact(b: Ball, first: Piece): void {
    b.hit = true;
    const at: V3 = [b.body.position.x, b.body.position.y, b.body.position.z];
    this.events.push({ type: 'impact', ball: b, at, giant: b.giant });
    const reach = this.rig().reach;
    const radius = b.giant ? 99 : BLAST_R;
    const tmp = new CANNON.Vec3();
    for (const p of this.pieces) {
      if (!p.alive) continue;
      p.body.wakeUp();
      const c = p.body.position;
      tmp.set(c.x - at[0], c.y - at[1] + 0.25, c.z - at[2]);
      const d = tmp.length();
      if (d > radius) continue;
      tmp.normalize();
      // The ball carries on into the stack, so the push leans forward (away from the cannon).
      tmp.z -= 0.6;
      tmp.normalize();
      const k = b.giant ? 1.4 : 1 - d / radius;
      tmp.scale(BLAST_POWER * b.power * k * Math.sqrt(p.body.mass), tmp);
      p.body.applyImpulse(tmp);
      if (p.kind !== 'jar') continue;
      if (b.giant) p.doom = 0.05 + d * 0.09;
      else if (p === first || boxDistance(p, b.body.position) <= BALL_R + reach) this.burst(p, 'ball');
    }
    b.body.velocity.scale(b.giant ? 0.85 : 0.55, b.body.velocity);
  }

  private burst(p: Piece, cause: 'ball' | 'crash' | 'fall'): void {
    if (!p.alive || p.kind !== 'jar') return;
    p.alive = false;
    const c = p.body.position;
    const at: V3 = [c.x, c.y, c.z];
    this.world.removeBody(p.body);
    this.smashed++;
    this.combo++;
    this.events.push({ type: 'burst', piece: p, at, cause, combo: this.combo });
    // Whatever rested on it must notice it is gone.
    for (const q of this.pieces) if (q.alive) q.body.wakeUp();
  }

  /**
   * Where a sensible player would shoot next: the point whose blast, and whatever collapses above it, takes the most jars.
   * Used by the hint hand, the ad's own moves and autoplay.
   */
  bestTarget(): V3 | null {
    let best: V3 | null = null;
    let bestScore = 0;
    for (const c of this.pieces) {
      if (!c.alive || c.body.position.y < TABLE_Y - 0.2) continue;
      // Hit standing columns low, everything else dead centre. Never aim into the table itself.
      const upright = c.kind === 'column' && Math.abs(c.body.quaternion.vmult(UP, AXIS).y) > 0.8;
      const cy = Math.max(TABLE_Y + 0.15, upright ? c.body.position.y - 0.25 : c.body.position.y);
      const cx = c.body.position.x;
      const cz = c.body.position.z + HALF[c.kind][2];
      let score = 0;
      for (const j of this.pieces) {
        if (!j.alive || j.kind !== 'jar') continue;
        const p = j.body.position;
        const d = Math.hypot(p.x - cx, p.y - cy, p.z - cz);
        if (d < 1.25) score += 1;
        else if (p.y > cy && Math.abs(p.x - cx) < 1.0 && c.kind !== 'jar') score += 0.7;
      }
      if (score > bestScore + 1e-6) {
        bestScore = score;
        best = [cx, cy, cz];
      }
    }
    return best;
  }

  /** Test hook: the position of a piece, for checking that nothing drifts while asleep. */
  where(id: number): V3 {
    const c = this.pieces[id].body.position;
    return [c.x, c.y, c.z];
  }

  pieceOf(body: CANNON.Body): Piece | undefined {
    return this.byBody.get(body);
  }
}

const LOCAL = new CANNON.Vec3();
const UP = new CANNON.Vec3(0, 1, 0);
const AXIS = new CANNON.Vec3();
const INV = new CANNON.Quaternion();

/** Distance from a point to a piece's (rotated) box. 0 inside. */
export function boxDistance(p: Piece, point: CANNON.Vec3): number {
  const b = p.body;
  point.vsub(b.position, LOCAL);
  b.quaternion.conjugate(INV);
  INV.vmult(LOCAL, LOCAL);
  const h = HALF[p.kind];
  const dx = Math.max(Math.abs(LOCAL.x) - h[0], 0);
  const dy = Math.max(Math.abs(LOCAL.y) - h[1], 0);
  const dz = Math.max(Math.abs(LOCAL.z) - h[2], 0);
  return Math.hypot(dx, dy, dz);
}
