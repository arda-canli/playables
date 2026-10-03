// Puzzle Game: ties the physics, the 3D scene, the HUD and the ad director together.
import * as THREE from 'three';
import { AudioKit, MusicLoop } from '@kit/audio';
import { Director } from '@kit/director';
import { notifyEnd, openStore } from '@kit/network';
import { ease, kill, makeRng, tween, updateTweens, wait } from '@kit/tween';
import { UI } from '@kit/ui';
import { Hud } from './hud';
import { AimLine, Balls, Cannon } from './cannon';
import { CameraRig } from './camera';
import { HEADLINES, type Config } from './config';
import { Fx } from './fx';
import { BALL_R, BALL_SPEED, JAR_COLORS, LEVEL, MUZZLE, TABLE_HALF, TABLE_Y, TZ, type V3 } from './level';
import { Pieces, Teaser } from './pieces';
import { Sfx } from './sfx';
import { Sim, TICK, type Ball, type SimEvent } from './sim';
import { World } from './world';

type ShotBy = 'user' | 'ghost' | 'auto';
const GHOST = Symbol('ghost');
const JAR_ICON =
  '<svg viewBox="0 0 40 46" aria-hidden="true"><path d="M8 14h24l3 6v18c0 4-3 6-7 6H12c-4 0-7-2-7-6V20z" fill="#ff3b4f" stroke="#2a1066" stroke-width="3" stroke-linejoin="round"/><rect x="7" y="4" width="26" height="10" rx="3" fill="#fff" stroke="#2a1066" stroke-width="3"/><path d="M12 5l-3 8M19 5l-3 8M26 5l-3 8M33 5l-3 8" stroke="#ff2f4a" stroke-width="3"/><ellipse cx="13" cy="25" rx="3" ry="6" fill="#fff" opacity=".5"/></svg>';
const PRAISE: [number, string][] = [
  [8, 'SMASHING!'],
  [5, 'AWESOME!'],
  [3, 'GREAT!'],
  [1, 'NICE!'],
];

export class Game {
  private renderer: THREE.WebGLRenderer;
  private world: World;
  private rig = new CameraRig();
  private fx: Fx;
  private ui: UI;
  private hud: Hud;
  private audio = new AudioKit();
  private sfx = new Sfx(this.audio);
  private music = new MusicLoop(this.audio);
  private director: Director;
  private sim: Sim;
  private pieces: Pieces;
  private teaser: Teaser;
  private cannon = new Cannon();
  private balls = new Balls();
  private aimLine = new AimLine();

  private ended = false;
  private hurry = false;
  private musicOn = false;
  private giantReady = false;
  private offering = false;
  private acc = 0;
  private time = 0;
  private timeScale = 1;
  /** Seconds of sim time before the cannon can fire again. */
  private cooldown = 0;
  private queued: V3 | null = null;
  /** Seconds the level has been still, measured in sim ticks. */
  private quiet = 0;
  private shotBy: ShotBy = 'user';
  private shotOpen = false;
  private shotHit = false;
  private lastBurstAt = 0;
  private slowmoDone = false;
  private shatterBudget = 0;
  private ballOffsets = new Map<number, THREE.Vector3>();
  private ballSpin = new Map<number, THREE.Euler>();

  private aiming = false;
  private aimId = -1;
  private aimPoint = new THREE.Vector3();
  private handTarget: THREE.Vector3 | null = null;
  private handFrom = { x: 0, y: 0, k: 1 };
  private auto = { phase: 'idle' as 'idle' | 'volley', nextAt: 0 };

  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private scr = { x: 0, y: 0 };
  private camQ = new THREE.Quaternion();

  constructor(private canvas: HTMLCanvasElement, uiRoot: HTMLElement, private cfg: Config) {
    const coarse = matchMedia('(pointer: coarse)').matches;
    const lowPower = coarse && (navigator.hardwareConcurrency ?? 8) <= 4;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // No tone mapping: casual-game colours should stay fully saturated.
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.world = new World(this.renderer, lowPower);
    this.fx = new Fx(this.world.scene);
    this.sim = new Sim(LEVEL, cfg.ending);
    this.pieces = new Pieces(this.sim.pieces);
    this.teaser = new Teaser(this.pieces, [0, TABLE_Y, TZ]);
    this.world.scene.add(this.pieces.group, this.teaser.group, this.cannon.root, this.balls.group, this.aimLine.mesh);
    this.aimLine.hide();

    this.ui = new UI(uiRoot, { goalIcon: JAR_ICON, logo: ['PUZZLE', 'GAME'] });
    this.hud = new Hud(uiRoot);
    this.director = new Director(cfg.timings, {
      onHint: () => this.showHint(),
      onAuto: () => this.autoMove(),
      onGiveUp: () => this.finish('idle'),
    });

    this.preStain();
    this.bindInput();
    this.ui.setHeadline(HEADLINES[cfg.headline]);
    this.ui.setGoal(this.sim.smashed, this.sim.goal);
    this.hud.setBalls(this.sim.ballsLeft);
    this.ui.onCta((where) => this.cta(where));
    if (cfg.showReplay) this.ui.onReplay(() => location.reload());
    this.audio.setMuted(cfg.muted);
    this.director.onTension((t) => {
      this.ui.setTension(t);
      this.music.setTension(t);
    });

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => window.setTimeout(() => this.resize(), 120));
  }

  // ---------------------------------------------------------------- setup

  /** The head start: jam on the table from the jars that were "already" smashed. */
  private preStain(): void {
    const rng = makeRng(7);
    const colors = Object.values(JAR_COLORS);
    for (let i = 0; i < LEVEL.alreadySmashed; i++) {
      const x = (rng() * 2 - 1) * (TABLE_HALF.x - 0.5);
      this.fx.preStain(x, TZ + (rng() * 2 - 1) * (TABLE_HALF.z - 0.4), colors[i % colors.length]);
    }
  }

  private bindInput(): void {
    const c = this.canvas;
    const unlock = () => {
      this.audio.unlock();
      if (!this.musicOn && this.audio.ctx) {
        this.musicOn = true;
        this.music.start();
      }
    };
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      unlock();
      this.onDown(e.pointerId, e.clientX, e.clientY);
    });
    c.addEventListener('pointermove', (e) => {
      if (this.aiming && e.pointerId === this.aimId) this.setAim(e.clientX, e.clientY);
    });
    const up = (e: PointerEvent) => {
      if (!this.aiming || e.pointerId !== this.aimId) return;
      this.aiming = false;
      this.aimLine.hide();
      this.shoot([this.aimPoint.x, this.aimPoint.y, this.aimPoint.z], 'user');
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    // iOS only lets audio start from the end of a gesture, so unlock there as well.
    for (const type of ['pointerup', 'touchend', 'click'] as const) window.addEventListener(type, unlock, { passive: true });
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.rig.resize(w, h);
    this.rig.cannonAnchor(this.cannon.root.position);
    this.cannon.aim(this.tmp.set(0, TABLE_Y + 1.2, TZ));
  }

  // ---------------------------------------------------------------- flow

  start(): void {
    this.director.start();
    const s = this.cannon.root.scale;
    void tween({ dur: 0.6, ease: ease.outBack, update: (k) => s.setScalar(0.4 + 0.6 * k) });
    if (this.cfg.ghostOpening) void this.ghostShot();
    else void this.beginGuide();
  }

  /** The ad fires one feeble shot of its own: it clips a single jar off the top. Viewers itch to do better. */
  private async ghostShot(): Promise<void> {
    this.director.setPhase('ghost');
    const w = (s: number) => wait(this.hurry ? s * 0.3 : s, GHOST);
    const target = this.tmp2.set(...LEVEL.ghostTarget).clone();
    await w(0.7);
    this.pointHand(target, 'still', true);
    await w(0.55);
    this.ui.tapHandOnce();
    await w(0.15);
    this.ui.hideHand();
    this.handTarget = null;
    this.shoot(LEVEL.ghostTarget, 'ghost');
    this.director.log('ghost_bad_move');
    await w(1.1);
    this.sfx.meh();
    this.hud.mood('meh', 1600);
    this.ui.toast('Weak shot…', 'bad', 1000);
    await w(1.0);
    void this.beginGuide();
  }

  private async beginGuide(): Promise<void> {
    if (this.ended) return;
    this.director.setPhase('guide');
    this.ui.toast('YOUR TURN!', 'good', 900);
    this.showHint();
  }

  private onDown(id: number, x: number, y: number): void {
    this.director.touch();
    if (this.offering) {
      this.cta('offer');
      return;
    }
    if (this.ended) return;
    const phase = this.director.phase;
    if (phase === 'ghost' || phase === 'boot') {
      this.hurry = true;
      return;
    }
    this.aiming = true;
    this.aimId = id;
    this.aimLine.visible = 0;
    void tween({ dur: 0.15, update: (k) => (this.aimLine.visible = this.aiming ? k : 0) });
    this.setAim(x, y);
  }

  /**
   * Finger position to aim point on the plane of the structure. The guided shot snaps to the keystone,
   * so the first touch always pays off; after that only a light pull towards the nearest jar remains.
   */
  private setAim(x: number, y: number): void {
    if (this.director.phase === 'guide') {
      this.aimPoint.set(...LEVEL.keystone);
      return;
    }
    if (!this.rig.toPlane(x, y, TZ + 0.3, this.aimPoint)) return;
    let best = 0.65;
    let jar: THREE.Vector3 | null = null;
    for (const p of this.sim.pieces) {
      if (!p.alive || p.kind !== 'jar') continue;
      const d = Math.hypot(p.body.position.x - this.aimPoint.x, p.body.position.y - this.aimPoint.y);
      if (d < best) {
        best = d;
        jar = this.tmp.set(p.body.position.x, p.body.position.y, p.body.position.z + 0.25);
      }
    }
    if (jar) this.aimPoint.lerp(jar, 0.6);
    this.aimPoint.y = Math.max(this.aimPoint.y, TABLE_Y + 0.1);
  }

  /** One cannon shot, from the viewer, the ad's own opening, or the ad playing for an idle viewer. */
  private shoot(target: V3, by: ShotBy): void {
    if (this.ended && !this.giantReady) return;
    if (this.cooldown > 0) {
      if (by === 'user') this.queued = target;
      return;
    }
    const giant = this.giantReady;
    const ball = this.sim.fire(target, by === 'ghost' ? { free: true, power: LEVEL.ghostPower } : { giant });
    if (!ball) return;
    this.cooldown = giant ? 1 : 0.45;
    this.giantReady = false;
    this.shotBy = by;
    this.shotOpen = true;
    this.shotHit = false;
    this.slowmoDone = false;
    this.ui.hideHand();
    this.handTarget = null;

    // Snap the barrel onto the target before reading where its mouth is, then kick.
    this.cannon.aim(this.tmp.set(...target));
    this.cannon.update(0.25, this.time);
    const muzzle = this.cannon.muzzle(new THREE.Vector3());
    this.cannon.kick(giant);
    this.ballOffsets.set(ball.id, muzzle.clone().sub(this.tmp2.set(...MUZZLE)));
    this.ballSpin.set(ball.id, new THREE.Euler());
    this.fx.muzzle(muzzle, this.tmp.set(...target).sub(muzzle).normalize(), giant);
    this.sfx.fire(giant);
    this.rig.shake(giant ? 0.22 : 0.07);

    if (giant) {
      this.hud.giantLoaded(false);
      void tween({ dur: 0.3, update: (k) => (this.cannon.charge = 1 - k) });
      this.director.log('giant_ball');
    } else if (by !== 'ghost') {
      this.hud.setBalls(this.sim.ballsLeft, true);
      this.sfx.ballTick();
      this.director.log('shot', { by, left: this.sim.ballsLeft });
    }
    if (this.director.phase === 'guide' && by !== 'ghost') this.director.setPhase('free');
    if (by === 'ghost' || giant) return;

    // The squeeze: there is no clock in this genre, only the ammo running out.
    const left = this.sim.ballsLeft;
    if (left <= 2 && left > 0 && this.director.phase === 'free') this.director.setPhase('squeeze');
    if (left === 2) {
      this.director.setTension(0.62);
      this.ui.setBanner('2 BALLS LEFT', 1);
    } else if (left === 1) {
      this.director.setTension(0.92);
      this.ui.setBanner('LAST BALL!', 2);
      this.sfx.lastBall();
      this.hud.mood('worried');
    } else if (left === 0) this.ui.setBanner(null);
  }

  // ---------------------------------------------------------------- the simulation tick

  private simTick(): void {
    const events = this.sim.step();
    this.cooldown = Math.max(0, this.cooldown - TICK);
    this.quiet = this.sim.motion < 0.3 && this.sim.inFlight === 0 ? this.quiet + TICK : 0;
    this.shatterBudget = 2;
    for (const e of events) this.onEvent(e);

    if (this.queued && this.cooldown <= 0) {
      const q = this.queued;
      this.queued = null;
      this.shoot(q, 'user');
    }

    // Praise the shot as soon as the breaking pauses, while the pieces are still flying: reward has to be immediate.
    const since = this.sim.time - Math.max(this.lastBurstAt, this.sim.lastShotAt);
    if (this.shotOpen && this.sim.inFlight === 0 && since > 0.8) {
      this.shotOpen = false;
      this.praise(this.sim.combo);
    }

    if (this.cfg.autoplay) this.autoplayTick();
    this.checkEnd();
  }

  private onEvent(e: SimEvent): void {
    if (e.type === 'impact') {
      this.shotHit = true;
      this.fx.impact(e.at, e.giant);
      this.sfx.thud();
      this.rig.shake(e.giant ? 0.5 : 0.13);
      if (e.giant) {
        this.rig.punch();
        this.ui.flash();
      }
    } else if (e.type === 'burst') {
      const color = JAR_COLORS[e.piece.color ?? 'red'];
      this.pieces.burst(e.piece);
      this.fx.jar(e.at, color, e.cause === 'fall' ? 0.7 : 1);
      if (this.shatterBudget-- > 0) {
        this.sfx.shatter(e.combo - 1);
        this.sfx.splat();
      }
      this.lastBurstAt = this.sim.time;
      this.ui.setGoal(this.sim.smashed, this.sim.goal, true);
      // A collapse that takes four jars in a blink gets the slow-motion replay treatment, once per shot.
      if (e.combo >= 4 && !this.slowmoDone && this.sim.time - this.sim.lastShotAt < 1.2 && this.shotBy !== 'ghost') {
        this.slowmoDone = true;
        this.slowmo();
      }
      if (e.combo >= 2 && this.shotBy !== 'ghost') {
        this.rig.toScreen(this.tmp.set(...e.at), this.scr);
        this.ui.floater(`×${e.combo}`, this.scr.x, this.scr.y - 20, '#ffe066');
      }
    } else if (e.type === 'knock') {
      this.sfx.knock(e.piece.kind, e.speed, this.time);
      if (e.piece.kind !== 'jar' && e.at[1] < 0.8) this.fx.puff([e.at[0], 0.15, e.at[2]], 0.5, 0.4);
    } else if (e.type === 'ballGone') {
      this.balls.hide(e.ball.id);
      this.ballOffsets.delete(e.ball.id);
    }
  }

  private slowmo(): void {
    this.timeScale = 0.3;
    this.hud.mood('wow', 1400);
    this.rig.punch();
    void wait(0.35).then(() => tween({ dur: 0.45, ease: ease.inQuad, update: (k) => (this.timeScale = 0.3 + 0.7 * k) }));
  }

  private praise(n: number): void {
    if (this.shotBy === 'ghost' || this.ended) return;
    if (n === 0) {
      // Only call it a miss when the ball touched nothing at all.
      if (!this.shotHit) this.ui.toast('MISSED!', 'bad', 800);
      this.hud.mood('meh', 1200);
      return;
    }
    const word = PRAISE.find(([min]) => n >= min)![1];
    this.ui.toast(n >= 3 ? `${word} ×${n}` : word, 'good', 1000);
    if (n >= 3) this.sfx.combo(n);
    if (n >= 5) this.hud.mood('wow', 1300);
    else if (this.sim.ballsLeft > 1) this.hud.mood('happy');
  }

  private checkEnd(): void {
    if (this.ended || this.giantReady) return;
    const phase = this.director.phase;
    if (phase !== 'free' && phase !== 'squeeze') return;
    if (this.sim.jarsLeft === 0) {
      void this.winSequence();
      return;
    }
    const over = this.sim.ballsLeft === 0 && this.sim.inFlight === 0 && (this.quiet > 0.6 || this.sim.time - this.sim.lastShotAt > 3.2);
    if (!over) return;
    if (this.cfg.ending === 'win') void this.offerGiant();
    else void this.stuckSequence();
  }

  // ---------------------------------------------------------------- hints and the ad playing itself

  private pointHand(target: THREE.Vector3, mode: 'loop' | 'still', glide: boolean): void {
    if (glide || !this.ui.handVisible) {
      this.handFrom = { x: window.innerWidth * 0.8, y: window.innerHeight * 0.9, k: 0 };
      void tween({ dur: 0.45, ease: ease.outCubic, tag: GHOST, update: (k) => (this.handFrom.k = k) });
    }
    this.handTarget = target;
    this.ui.showHand(mode);
  }

  private hintTarget(): V3 | null {
    if (this.director.phase === 'guide') return LEVEL.keystone;
    return this.sim.bestTarget();
  }

  private showHint(): void {
    if (this.ended && !this.giantReady) return;
    const t = this.hintTarget();
    if (t) this.pointHand(new THREE.Vector3(...t), 'loop', !this.ui.handVisible);
  }

  /** The viewer is not touching: the ad fires the best shot itself. */
  private autoMove(): void {
    if (this.ended && !this.giantReady) return;
    const t = this.hintTarget() ?? [0, TABLE_Y + 1, TZ];
    this.shoot(t, 'auto');
  }

  /** Autoplay, in sim ticks so that the same build always plays the same game (the smoke test relies on it). */
  private autoplayTick(): void {
    if (this.ended && !this.giantReady) return;
    const phase = this.director.phase;
    if (phase === 'guide') {
      if (this.sim.asleep || this.sim.time - this.sim.lastShotAt > 3) {
        this.director.touch();
        this.shoot(LEVEL.keystone, 'auto');
        this.auto = { phase: 'idle', nextAt: 0 };
      }
      return;
    }
    if (phase !== 'free' && phase !== 'squeeze') return;
    if (this.giantReady) {
      if (this.quiet > 0.4) {
        this.director.touch();
        this.shoot(this.sim.bestTarget() ?? [0, TABLE_Y + 1, TZ], 'auto');
      }
      return;
    }
    if (this.sim.ballsLeft <= 0 || this.sim.jarsLeft === 0) return;
    if (this.auto.phase === 'idle' && this.quiet > 0.4) {
      this.auto = { phase: 'volley', nextAt: this.sim.time };
    }
    if (this.auto.phase === 'volley' && this.sim.time >= this.auto.nextAt - 1e-6) {
      const t = this.sim.bestTarget();
      if (!t) return;
      this.director.touch();
      this.cooldown = 0;
      this.shoot(t, 'auto');
      this.auto.nextAt = this.sim.time + 0.9;
    }
  }

  // ---------------------------------------------------------------- endings

  /** Out of balls, a few jars short. The rescue the real game sells here becomes the install button. */
  private async stuckSequence(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    kill(GHOST);
    this.ui.hideHand();
    this.handTarget = null;
    this.ui.setBanner(null);
    const left = this.sim.pieces.filter((p) => p.alive && p.kind === 'jar');
    this.director.setPhase('ending');
    this.director.setTension(1);
    this.sfx.outOfBalls();
    this.ui.flash();
    this.ui.toast('OUT OF BALLS!', 'bad', 1400);
    this.hud.mood('sad');
    this.director.log('stuck', { left: left.length, smashed: this.sim.smashed, of: this.sim.goal });
    // Spotlight what is left: so close you can see them.
    this.pieces.markLeft(left.map((p) => p.id));
    for (const p of left) this.fx.sparkle(this.tmp.set(p.body.position.x, p.body.position.y + 0.3, p.body.position.z), 6, 0.5);
    await wait(1.3);
    this.offering = true;
    this.hud.showOffer(left.length, () => this.cta('offer'));
    this.ui.setCta('GET +3 BALLS', true);
    this.sfx.offer();
    this.director.log('rescue_offer', { left: left.length });
    await wait(4.5);
    this.finish('fail');
  }

  /** 'win' variant: the balls ran out, so the game gifts its giant ball booster. Showing a booster is a hook in itself. */
  private async offerGiant(): Promise<void> {
    this.giantReady = true;
    this.ui.setBanner(null);
    this.director.setTension(0.2);
    this.hud.giantLoaded(true);
    this.hud.mood('wow', 1500);
    this.sfx.powerUp();
    this.ui.toast('FREE GIANT BALL!', 'good', 1500);
    void tween({ dur: 0.5, update: (k) => (this.cannon.charge = k) });
    this.director.log('booster_offer');
    await wait(0.6);
    if (this.giantReady) this.showHint();
  }

  private async winSequence(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    kill(GHOST);
    this.ui.hideHand();
    this.handTarget = null;
    this.ui.setBanner(null);
    this.director.setTension(0);
    this.director.setPhase('ending');
    await wait(0.35);
    this.sfx.win();
    this.ui.toast('LEVEL COMPLETE!', 'good', 1600);
    this.hud.mood('happy');
    const top = this.tmp.set(0, TABLE_Y + 0.5, TZ).clone();
    for (let i = 0; i < 3; i++) void wait(i * 0.25).then(() => this.fx.burstConfetti(top.clone().setX((i - 1) * 2.6), 60, 1));
    const mat = this.world.tableMat;
    void tween({ dur: 0.9, ease: ease.yoyo, update: (k) => mat.emissive.setRGB(0.5 * k, 0.35 * k, 0) });
    await wait(1.5);
    await this.levelTwo();
    this.finish('win');
  }

  /** The curiosity gap: the cleared table is swept and a wall of gold with a heart of jam drops in. Level 2. */
  private async levelTwo(): Promise<void> {
    this.ui.hideHud();
    this.hud.hide();
    for (const p of this.sim.pieces) if (p.alive) this.pieces.burst(p);
    this.fx.puff([0, TABLE_Y + 0.5, TZ], 1.2, 2);
    void this.rig.toTeaser(1.1);
    await wait(0.3);
    this.teaser.t = 0;
    this.ui.toast('LEVEL 2', 'info', 1700);
    for (let i = 0; i < 8; i++) void wait(0.3 + i * 0.07).then(() => this.sfx.thump(i));
    await wait(1.9);
  }

  private finish(kind: 'win' | 'fail' | 'idle'): void {
    if (this.director.phase === 'endcard') return;
    this.ended = true;
    this.offering = false;
    kill(GHOST);
    this.director.setPhase('endcard');
    const left = this.sim.jarsLeft;
    this.director.log('end', {
      outcome: kind,
      seconds: Math.round(this.director.time * 10) / 10,
      shots: this.sim.shots,
      smashed: this.sim.smashed,
      left,
      firstTouch: this.director.firstTouchAt,
    });
    this.director.stop();
    notifyEnd();
    this.hud.hide();
    const copy = {
      win: { title: 'LEVEL COMPLETE!', sub: 'Level 2 is a wall of gold. Can you crack it?', cta: 'NEXT LEVEL' },
      fail: { title: 'SO CLOSE!', sub: `Only ${left} jar${left === 1 ? '' : 's'} left. Three more balls would do it.`, cta: 'GET +3 BALLS' },
      idle: { title: 'YOUR TURN!', sub: 'Aim, fire, destroy!', cta: 'PLAY NOW' },
    }[kind];
    this.ui.showEndCard(kind, copy);
  }

  private cta(where: 'button' | 'endcard' | 'offer'): void {
    this.director.log('cta', { where, phase: this.director.phase, seconds: Math.round(this.director.time * 10) / 10 });
    openStore(this.cfg.storeUrl, this.ended);
    if (this.offering && this.director.phase !== 'endcard') this.finish('fail');
  }

  // ---------------------------------------------------------------- frame

  setPaused(paused: boolean): void {
    this.audio.setMuted(paused || this.cfg.muted);
    if (paused) this.music.stop();
    else if (this.musicOn) this.music.start();
  }

  frame(dt: number): void {
    this.time += dt;
    updateTweens(dt);
    this.director.update(dt);

    // Fixed ticks for the simulation; slow motion only changes how many run per frame.
    this.acc += dt * this.timeScale;
    let steps = 0;
    while (this.acc >= TICK && steps++ < 4) {
      this.acc -= TICK;
      this.simTick();
    }
    if (steps >= 4) this.acc = 0;
    const simDt = dt * this.timeScale;

    this.pieces.sync(simDt, this.time);
    this.teaser.update(dt);
    this.drawBalls(simDt);
    this.cannon.update(dt, this.time);
    this.world.update(this.time);
    this.rig.update(dt);
    this.camQ.copy(this.rig.camera.quaternion);
    this.fx.update(simDt, this.camQ);
    if (this.director.phase !== 'endcard') this.sfx.heartbeat(dt, this.director.tension);

    if (this.aiming) {
      this.cannon.aim(this.aimPoint);
      this.cannon.muzzle(this.tmp);
      this.aimLine.set(this.tmp, this.aimPoint, this.time, BALL_SPEED);
    } else if (!this.ended && this.cooldown <= 0 && this.handTarget) this.cannon.aim(this.handTarget);

    // The squeeze banner floats just above the cannon, where the eye already is.
    this.rig.toScreen(this.tmp.copy(this.cannon.root.position).setY(this.cannon.root.position.y + 1.3), this.scr);
    this.ui.placeBanner(this.scr.x, this.scr.y);

    if (this.handTarget) {
      this.rig.toScreen(this.handTarget, this.scr);
      const f = this.handFrom;
      this.ui.placeHand(f.x + (this.scr.x - f.x) * f.k, f.y + (this.scr.y - f.y) * f.k);
    }
    if (!this.ui.handVisible) this.handTarget = null;

    this.renderer.render(this.world.scene, this.rig.camera);
  }

  private drawBalls(dt: number): void {
    for (const b of this.sim.balls) {
      if (!b.alive) continue;
      const mesh = this.balls.get(b.id, b.giant, b.giant ? 0.95 / BALL_R : 1);
      const p = b.body.position;
      // The drawn cannon follows the camera; the simulated one does not. Blend from one to the other in the first metres.
      const off = this.ballOffsets.get(b.id);
      const k = off ? Math.max(0, 1 - b.age / 0.22) : 0;
      mesh.position.set(p.x + (off ? off.x * k : 0), p.y + (off ? off.y * k : 0), p.z + (off ? off.z * k : 0));
      const spin = this.ballSpin.get(b.id);
      if (spin) {
        spin.x -= dt * 14;
        mesh.rotation.copy(spin);
      }
      if (!b.hit && Math.random() < 0.8) this.fx.puff(mesh.position, b.giant ? 0.55 : 0.26, 0.05);
      this.trailSparkle(b);
    }
  }

  private trailSparkle(b: Ball): void {
    if (b.giant && !b.hit && Math.random() < 0.5) this.fx.sparkle(this.balls.get(b.id, true, 0.95 / BALL_R).position, 1, 0.3);
  }

  /** Test hook: lets the automated tests read state and aim at things on screen. */
  get debug() {
    return {
      phase: this.director.phase,
      events: this.director.events,
      balls: this.sim.ballsLeft,
      left: this.sim.jarsLeft,
      smashed: this.sim.smashed,
      goal: this.sim.goal,
      offering: this.offering,
      giant: this.giantReady,
      cooldown: this.cooldown,
      best: () => this.sim.bestTarget(),
      screenOf: (p: V3) => {
        this.rig.toScreen(this.tmp.set(...p), this.scr);
        return { x: this.scr.x, y: this.scr.y };
      },
      keystone: LEVEL.keystone,
    };
  }
}
