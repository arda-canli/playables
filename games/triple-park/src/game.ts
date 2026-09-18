// Triple Park: ties the rules, the 3D scene, the HUD and the ad director together.
import * as THREE from 'three';
import { AudioKit, MusicLoop } from '@kit/audio';
import { Director } from '@kit/director';
import { notifyEnd, openStore } from '@kit/network';
import { clamp, damp, ease, kill, tween, updateTweens, wait } from '@kit/tween';
import { CameraRig } from './camera';
import { Car, initCarAssets, type MatchGroup } from './car';
import { HEADLINES, type Config } from './config';
import { Fx } from './fx';
import { CAPACITY, HOLDER, HOLDER_Z, LANE_X, TRUCK_Z, rowZ, slotX } from './layout';
import { LEVEL, Logic } from './logic';
import { Sfx } from './sfx';
import { BED_SLOTS, BED_Y, Truck } from './truck';
import { UI } from '@kit/ui';
import { World } from './world';

type TapSource = 'user' | 'ghost' | 'auto';
const GHOST = Symbol('ghost');
const TRUCK_ICON =
  '<svg viewBox="0 0 64 40" aria-hidden="true"><rect x="2" y="16" width="38" height="12" rx="3" fill="#cfd6e6"/><rect x="40" y="6" width="20" height="22" rx="5" fill="#fff"/><rect x="46" y="10" width="11" height="8" rx="2" fill="#1d2b45"/><circle cx="14" cy="31" r="6" fill="#252a36"/><circle cx="14" cy="31" r="2.5" fill="#e9edf5"/><circle cx="50" cy="31" r="6" fill="#252a36"/><circle cx="50" cy="31" r="2.5" fill="#e9edf5"/></svg>';
const PRAISE = ['NICE!', 'GREAT!', 'SWEET!', 'AWESOME!', 'PERFECT!'];

export class Game {
  private renderer: THREE.WebGLRenderer;
  private world: World;
  private rig = new CameraRig();
  private fx: Fx;
  private ui: UI;
  private audio = new AudioKit();
  private sfx = new Sfx(this.audio);
  private music = new MusicLoop(this.audio);
  private director: Director;
  private logic: Logic;

  private cars: Car[] = [];
  private laneCars: Car[][] = [];
  /** Holder order as drawn. Includes matched cars until they hop onto their truck. */
  private visual: Car[] = [];
  private truckChain: Promise<void> = Promise.resolve();
  private queuedLane: number | null = null;
  private failingCar: Car | null = null;
  private ended = false;
  private hurry = false;
  private musicOn = false;

  private handTarget: Car | null = null;
  private handFrom = { x: 0, y: 0, k: 1 };
  private autoTimer = 0;
  private time = 0;
  private dustIn = 0;
  private holderFlash = 0;

  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private tmp = new THREE.Vector3();
  private scr = { x: 0, y: 0 };
  private white = new THREE.Color(0xffffff);
  private red = new THREE.Color(0xff2e4d);

  constructor(private canvas: HTMLCanvasElement, uiRoot: HTMLElement, private cfg: Config) {
    const coarse = matchMedia('(pointer: coarse)').matches;
    const lowPower = coarse && (navigator.hardwareConcurrency ?? 8) <= 4;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // No tone mapping: casual-game colours should stay fully saturated.
    this.renderer.toneMapping = THREE.NoToneMapping;

    initCarAssets();
    this.world = new World(this.renderer, lowPower);
    this.fx = new Fx(this.world.scene);
    this.ui = new UI(uiRoot, { goalIcon: TRUCK_ICON, logo: ['TRIPLE', 'PARK'] });
    this.logic = new Logic(LEVEL, cfg.ending);
    this.director = new Director(cfg.timings, {
      onHint: () => this.showHint(),
      onAuto: () => this.autoMove(),
      onGiveUp: () => this.finish('idle'),
    });

    this.buildCars();
    this.bindInput();
    this.ui.setHeadline(HEADLINES[cfg.headline]);
    this.ui.setGoal(0, this.logic.goal);
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

  private buildCars(): void {
    this.logic.lanes.forEach((lane, li) => {
      this.laneCars[li] = lane.map((spec, row) => {
        const car = new Car(spec);
        car.row = row;
        car.group.position.set(LANE_X[li], 0, rowZ(row));
        this.addCar(car);
        return car;
      });
    });
    this.logic.waiting.forEach((spec, i) => {
      const car = new Car(spec);
      car.state = 'parked';
      car.group.position.set(slotX(i), 0, HOLDER_Z);
      this.addCar(car);
      this.visual.push(car);
    });
  }

  private addCar(car: Car): void {
    this.cars.push(car);
    this.world.scene.add(car.group);
  }

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.audio.unlock();
      if (!this.musicOn && this.audio.ctx) {
        this.musicOn = true;
        this.music.start();
      }
      this.onPointer(e.clientX, e.clientY);
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    // iOS only lets audio start from the end of a gesture, so unlock there as well.
    for (const type of ['pointerup', 'touchend', 'click'] as const) {
      window.addEventListener(type, () => {
        this.audio.unlock();
        if (!this.musicOn && this.audio.ctx) {
          this.musicOn = true;
          this.music.start();
        }
      }, { passive: true });
    }
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.rig.resize(w, h);
  }

  // ---------------------------------------------------------------- flow

  start(): void {
    this.director.start();
    // Cars settle with a quick staggered bounce. They are visible from the very first frame.
    this.cars.forEach((car) => {
      const delay = car.state === 'parked' ? 0.05 : 0.04 * car.row + 0.03 * car.spec.lane;
      car.body.scale.setScalar(0.72);
      void tween({ dur: 0.5, delay, ease: ease.outElastic, update: (v) => car.body.scale.setScalar(0.72 + 0.28 * v) });
    });
    if (this.cfg.ghostOpening) void this.ghostOpening();
    else void this.beginGuide();
  }

  /** The botched opening: the ad makes one obviously poor move, then hands over. */
  private async ghostOpening(): Promise<void> {
    this.director.setPhase('ghost');
    const w = (s: number) => wait(this.hurry ? s * 0.3 : s, GHOST);
    await w(0.7);
    const car = this.laneCars[LEVEL.ghostLane][0];
    this.pointHandAt(car, 'still', true);
    await w(0.5);
    this.ui.tapHandOnce();
    await w(0.16);
    this.tapLane(LEVEL.ghostLane, 'ghost');
    this.director.log('ghost_bad_move', { color: car.color });
    await w(0.62);
    this.ui.hideHand();
    this.handTarget = null;
    this.ui.toast('Oops!', 'bad', 750);
    this.sfx.oops();
    car.worry = 1;
    void tween({ dur: 0.5, ease: ease.linear, update: (_v, t) => (car.body.rotation.z = Math.sin(t * 22) * 0.07 * (1 - t)) });
    void tween({ dur: 0.7, ease: ease.yoyo, update: (v) => (this.holderFlash = v) });
    await w(0.9);
    car.worry = 0;
    void this.beginGuide();
  }

  /** The free first win: the hand points at the one car that completes a set. */
  private async beginGuide(): Promise<void> {
    this.director.setPhase('guide');
    this.ui.toast('YOUR TURN!', 'good', 900);
    const car = this.laneCars[LEVEL.guideLane][0];
    if (car) this.pointHandAt(car, 'loop', true);
  }

  private onPointer(x: number, y: number): void {
    if (this.ended) return;
    this.director.touch();
    if (this.director.phase === 'ghost' || this.director.phase === 'boot') {
      this.hurry = true;
      return;
    }
    const lane = this.pickLane(x, y);
    if (lane === null) return;
    if (lane.blocked) {
      this.nope(lane.car);
      return;
    }
    this.userTap(lane.index);
  }

  private userTap(lane: number): void {
    if (this.director.phase === 'guide' && lane !== LEVEL.guideLane) {
      const front = this.laneCars[lane][0];
      if (front) this.nope(front);
      const want = this.laneCars[LEVEL.guideLane][0];
      if (want) void tween({ dur: 0.4, ease: ease.yoyo, update: (v) => want.body.scale.setScalar(1 + 0.16 * v) });
      return;
    }
    this.tapLane(lane, 'user');
  }

  /** Which lane did the pointer hit? Forgiving: a near miss still selects the closest front car. */
  private pickLane(x: number, y: number): { index: number; car: Car; blocked: boolean } | null {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.ndc.set((x / w) * 2 - 1, -(y / h) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.rig.camera);
    const targets = this.laneCars.flat().map((c) => c.pick);
    const hit = this.ray.intersectObjects(targets, false)[0];
    if (hit) {
      const car = hit.object.userData.car as Car;
      const index = car.spec.lane;
      return { index, car, blocked: this.laneCars[index][0] !== car };
    }
    let best: { index: number; car: Car; blocked: boolean } | null = null;
    let bestD = Math.min(w, h) * 0.11;
    this.laneCars.forEach((laneCars, index) => {
      const car = laneCars[0];
      if (!car) return;
      this.rig.toScreen(this.tmp.copy(car.group.position).setY(0.5), this.scr);
      const d = Math.hypot(this.scr.x - x, this.scr.y - y);
      if (d < bestD) {
        bestD = d;
        best = { index, car, blocked: false };
      }
    });
    return best;
  }

  private nope(car: Car): void {
    this.sfx.nope();
    void tween({ dur: 0.32, ease: ease.linear, update: (_v, t) => (car.body.rotation.y = Math.sin(t * Math.PI * 5) * 0.16 * (1 - t)) });
  }

  // ---------------------------------------------------------------- the move

  private tapLane(lane: number, by: TapSource): void {
    if (this.ended || this.logic.over) return;
    const car = this.laneCars[lane][0];
    if (!car || car.state !== 'lane') return;
    // Every slot is visibly taken (a matched set is still waiting for its truck): hold the tap for a moment.
    if (this.visual.length >= CAPACITY) {
      this.queuedLane = lane;
      return;
    }
    const res = this.logic.tap(lane);
    if (!res) return;

    this.ui.hideHand();
    this.handTarget = null;
    this.laneCars[lane].shift();
    if (car.covered) this.uncover(car);

    // Same colours park side by side.
    let idx = this.visual.length;
    for (let i = this.visual.length - 1; i >= 0; i--) {
      if (this.visual[i].color === car.color && !this.visual[i].matchGroup) {
        idx = i + 1;
        break;
      }
    }
    this.visual.splice(idx, 0, car);

    if (res.matched) {
      let markReady!: () => void;
      const ready = new Promise<void>((r) => (markReady = r));
      const ids = new Set(res.matched.map((m) => m.id));
      const cars = this.visual.filter((c) => ids.has(c.spec.id));
      const group: MatchGroup = { cars, arrived: cars.filter((c) => c.state === 'parked').length, ready, markReady };
      cars.forEach((c) => (c.matchGroup = group));
      this.truckChain = this.truckChain.then(() => this.runTruck(group));
    }
    if (res.failed) this.failingCar = car;
    if (res.won) this.director.setPhase('ending');

    this.sfx.tap();
    this.sfx.vroom();
    this.advanceLane(lane);
    void this.driveToHolder(car);

    if (by === 'user') {
      this.director.log('tap', { lane, color: car.color, waiting: this.logic.waiting.length, matched: !!res.matched });
      if (this.director.phase === 'guide') {
        this.director.setPhase('free');
        // Keep the momentum: point straight at the next easy match instead of waiting for idle.
        void wait(1.0).then(() => !this.ended && this.director.phase === 'free' && !this.ui.handVisible && this.showHint());
      }
    }
    this.refreshTension();
  }

  private refreshTension(): void {
    const t = this.logic.over && this.logic.won ? 0 : this.logic.tension;
    const before = this.director.tension;
    this.director.setTension(t);
    const free = this.logic.capacity - this.logic.waiting.length;
    if (this.logic.won || free > 2) this.ui.setBanner(null);
    else if (free === 2) this.ui.setBanner('2 SLOTS LEFT', 1);
    else if (free === 1) this.ui.setBanner('1 SLOT LEFT!', 2);
    else this.ui.setBanner('HOLDER FULL!', 2);
    if (t >= 0.66 && before < 0.66) this.sfx.warn();
    if (!this.logic.over) {
      if (t >= 0.66 && this.director.phase === 'free') this.director.setPhase('squeeze');
      else if (t < 0.66 && this.director.phase === 'squeeze') this.director.setPhase('free');
    }
  }

  /** Cars behind the one that left roll forward one bay. A mystery car that reaches the front is unveiled. */
  private advanceLane(lane: number): void {
    this.laneCars[lane].forEach((car, row) => {
      car.row = row;
      const from = car.group.position.z;
      const to = rowZ(row);
      void tween({
        dur: 0.36,
        delay: 0.1 + row * 0.07,
        ease: ease.outBack,
        update: (v, t) => {
          car.group.position.z = from + (to - from) * v;
          car.body.rotation.x = Math.sin(t * Math.PI) * 0.05;
        },
      }).then(() => {
        if (row === 0 && car.covered && car.state === 'lane') this.uncover(car);
      });
    });
  }

  private uncover(car: Car): void {
    if (!car.covered) return;
    this.sfx.reveal();
    this.fx.sparkle(car.group.position, 10, 0.8);
    this.director.log('reveal', { color: car.color, waiting: this.logic.waiting.length, ending: this.cfg.ending });
    void car.uncover((run) => tween({ dur: 0.3, ease: ease.outBack, update: run }));
  }

  private async driveToHolder(car: Car): Promise<void> {
    car.state = 'driving';
    const p0 = car.group.position.clone();
    const end = new THREE.Vector3();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const dist = Math.abs(slotX(this.visual.indexOf(car)) - p0.x);
    void tween({ dur: 0.22, ease: ease.yoyo, update: (v) => car.body.scale.set(1 + 0.1 * v, 1 - 0.12 * v, 1 + 0.16 * v) });

    await tween({
      dur: 0.46 + dist * 0.03,
      ease: ease.inOutQuad,
      update: (v, t) => {
        end.set(slotX(Math.max(0, this.visual.indexOf(car))), 0, HOLDER_Z);
        a.set(p0.x, 0, p0.z + 2.1);
        b.set(end.x, 0, end.z - 1.9);
        const u = 1 - v;
        const pos = car.group.position;
        pos.x = u * u * u * p0.x + 3 * u * u * v * a.x + 3 * u * v * v * b.x + v * v * v * end.x;
        pos.z = u * u * u * p0.z + 3 * u * u * v * a.z + 3 * u * v * v * b.z + v * v * v * end.z;
        const dx = 3 * u * u * (a.x - p0.x) + 6 * u * v * (b.x - a.x) + 3 * v * v * (end.x - b.x);
        const dz = 3 * u * u * (a.z - p0.z) + 6 * u * v * (b.z - a.z) + 3 * v * v * (end.z - b.z);
        const heading = Math.atan2(dx, Math.max(0.001, dz));
        car.group.rotation.y = heading;
        car.body.rotation.z = -heading * 0.22;
        if (t > 0.08 && t < 0.85) {
          this.dustIn -= 1;
          if (this.dustIn <= 0) {
            this.dustIn = 3;
            this.fx.puff(this.tmp.set(pos.x - Math.sin(heading) * 0.8, 0, pos.z - Math.cos(heading) * 0.8), 1, 0.15, 0.32);
          }
        }
      },
    });
    this.onArrive(car);
  }

  private onArrive(car: Car): void {
    car.state = 'parked';
    car.group.rotation.y = 0;
    car.body.rotation.z = 0;
    this.sfx.park();
    this.fx.puff(car.group.position, 3, 0.7, 0.34);
    void tween({ dur: 0.45, ease: ease.outElastic, update: (v) => car.body.scale.set(1.14 - 0.14 * v, 0.8 + 0.2 * v, 1.08 - 0.08 * v) });

    const g = car.matchGroup;
    if (g) {
      g.arrived++;
      if (g.arrived >= 3) g.markReady();
    } else if (car === this.failingCar) {
      void this.failSequence();
    } else if (this.visual.filter((c) => c.color === car.color && !c.matchGroup).length === 2) {
      this.sfx.pair();
    }
  }

  // ---------------------------------------------------------------- trucks

  private async runTruck(group: MatchGroup): Promise<void> {
    const truck = new Truck();
    const tg = truck.group;
    const scene = this.world.scene;
    scene.add(tg);
    const centre = () => group.cars.reduce((s, c) => s + slotX(Math.max(0, this.visual.indexOf(c))), 0) / 3;
    const stopX = clamp(centre(), -2.4, 1.1);
    tg.position.set(-19, 0, TRUCK_Z);
    this.sfx.truckIn();

    let lastX = tg.position.x;
    const enter = tween({
      dur: 0.6,
      ease: ease.outCubic,
      update: (v, t) => {
        tg.position.x = -19 + (stopX + 19) * v;
        truck.roll(tg.position.x - lastX);
        lastX = tg.position.x;
        truck.chassis.rotation.z = -Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.035;
      },
    });
    await Promise.all([enter, group.ready]);
    // The set celebrates, then hops aboard.
    this.sfx.match(this.sentShown);
    group.cars.forEach((c) => {
      this.fx.sparkle(c.group.position, 5, 0.6);
      void tween({ dur: 0.24, ease: ease.yoyo, update: (v) => c.body.scale.set(1 + 0.1 * v, 1 + 0.3 * v, 1 + 0.1 * v) });
    });
    await wait(0.2);

    const ordered = [...group.cars].sort((c1, c2) => c1.group.position.x - c2.group.position.x);
    for (const c of ordered) {
      c.state = 'leaving';
      this.visual.splice(this.visual.indexOf(c), 1);
    }
    this.flushQueue();

    await Promise.all(
      ordered.map((c, i) => {
        const from = c.group.position.clone();
        let hopped = false;
        return tween({
          dur: 0.36,
          delay: i * 0.075,
          ease: ease.inOutSine,
          update: (v) => {
            if (!hopped) {
              hopped = true;
              this.sfx.hop(i);
            }
            const tx = tg.position.x + BED_SLOTS[i];
            c.group.position.set(from.x + (tx - from.x) * v, BED_Y * v + Math.sin(v * Math.PI) * 1.7, from.z + (TRUCK_Z - from.z) * v);
            c.group.rotation.y = v * Math.PI * 2;
          },
        }).then(() => {
          c.group.rotation.y = 0;
          truck.chassis.attach(c.group);
          this.sfx.land();
          void tween({ dur: 0.3, ease: ease.yoyo, update: (v) => (truck.chassis.position.y = -0.07 * v) });
          void tween({ dur: 0.35, ease: ease.outElastic, update: (v) => c.body.scale.set(1.12 - 0.12 * v, 0.82 + 0.18 * v, 1) });
        });
      }),
    );

    // Off it goes.
    this.sentShown++;
    this.ui.setGoal(this.sentShown, this.logic.goal, true);
    this.sfx.honk();
    this.sfx.truckOut();
    this.rig.punch();
    const mid = this.tmp.set(tg.position.x, 1.2, TRUCK_Z).clone();
    this.fx.burstConfetti(mid, this.sentShown === 1 ? 70 : 42);
    this.rig.toScreen(mid.setY(2.2), this.scr);
    this.ui.floater(PRAISE[Math.min(this.sentShown - 1, PRAISE.length - 1)], this.scr.x, this.scr.y);
    this.director.log('truck', { n: this.sentShown, of: this.logic.goal });
    this.refreshTension();
    const last = this.sentShown >= this.logic.goal;

    const fromX = tg.position.x;
    lastX = fromX;
    let puffIn = 0;
    const leave = tween({
      dur: 0.85,
      ease: ease.inCubic,
      update: (v) => {
        tg.position.x = fromX + (21 - fromX) * v;
        truck.roll(tg.position.x - lastX);
        lastX = tg.position.x;
        truck.chassis.rotation.z = Math.min(0.05, v * 0.4);
        if (--puffIn <= 0 && v < 0.7) {
          puffIn = 2;
          this.fx.puff(this.tmp.set(tg.position.x - 2, 0, TRUCK_Z + 0.2), 1, 0.4, 0.45);
        }
      },
    }).then(() => {
      scene.remove(tg);
      truck.dispose();
      group.cars.forEach((c) => this.cars.splice(this.cars.indexOf(c), 1));
    });

    if (last) {
      await wait(0.45);
      void this.winSequence();
      await leave;
    } else {
      // Free the road for the next truck as soon as this one is clearly on its way.
      await wait(0.4);
    }
  }

  private sentShown = 0;

  private flushQueue(): void {
    if (this.queuedLane === null) return;
    const lane = this.queuedLane;
    this.queuedLane = null;
    this.tapLane(lane, 'user');
  }

  // ---------------------------------------------------------------- hints and the ad playing itself

  private pointHandAt(car: Car, mode: 'loop' | 'still', glide: boolean): void {
    this.handTarget = car;
    if (glide) {
      this.handFrom = { x: window.innerWidth * 0.85, y: window.innerHeight * 0.9, k: 0 };
      void tween({ dur: 0.45, ease: ease.outCubic, tag: GHOST, update: (v) => (this.handFrom.k = v) });
    } else this.handFrom.k = 1;
    this.ui.showHand(mode);
  }

  private showHint(): void {
    if (this.ended || this.logic.over) return;
    const phase = this.director.phase;
    const lane = phase === 'guide' ? LEVEL.guideLane : this.logic.bestLane();
    const car = this.laneCars[lane]?.[0];
    if (car) this.pointHandAt(car, 'loop', !this.ui.handVisible);
  }

  private autoMove(): void {
    if (this.ended || this.logic.over) return;
    const guiding = this.director.phase === 'guide';
    const lane = guiding ? LEVEL.guideLane : this.logic.bestLane();
    if (lane < 0) return;
    this.tapLane(lane, 'auto');
    if (guiding) this.director.setPhase('free');
  }

  // ---------------------------------------------------------------- endings

  private async winSequence(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    this.director.setPhase('ending');
    this.ui.hideHud();
    this.sfx.win();
    this.ui.toast('LOT CLEARED!', 'good', 1500);
    for (const x of [-2.6, 0, 2.6]) this.fx.burstConfetti(this.tmp.set(x, 0.6, 0.5), 50, 1.15);
    await wait(0.55);
    // The curiosity gap: a lot many times the size rolls out behind the one just cleared.
    this.sfx.whoosh();
    void this.world.revealBigLot();
    void this.rig.toReveal(1.7);
    for (let i = 0; i < 8; i++) void wait(0.25 + i * 0.16).then(() => this.sfx.pop(i));
    await wait(1.55);
    this.finish('win');
  }

  private async failSequence(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    this.director.setPhase('ending');
    kill(GHOST);
    this.ui.hideHand();
    this.ui.flash();
    this.sfx.fail();
    this.rig.shake(0.22);
    this.ui.setBanner('HOLDER FULL!', 2);
    this.world.holderLine.color.copy(this.red);
    this.visual.forEach((c, i) => {
      c.worry = 1;
      void tween({ dur: 0.7, delay: i * 0.03, ease: ease.linear, update: (_v, t) => (c.body.rotation.z = Math.sin(t * 30) * 0.12 * (1 - t)) });
    });
    await wait(1.25);
    this.finish('fail');
  }

  private finish(kind: 'win' | 'fail' | 'idle'): void {
    if (this.director.phase === 'endcard') return;
    this.ended = true;
    kill(GHOST);
    const left = this.logic.goal - this.sentShown;
    this.director.setPhase('endcard');
    this.director.log('end', {
      outcome: kind,
      seconds: Math.round(this.director.time * 10) / 10,
      taps: this.logic.taps,
      trucks: this.sentShown,
      peakHolder: this.logic.peakWaiting,
      firstTouch: this.director.firstTouchAt,
    });
    this.director.stop();
    notifyEnd();
    this.music.setTension(kind === 'fail' ? 0.8 : 0);
    const copy = {
      win: { title: 'LOT CLEARED!', sub: 'Level 2 is ten times bigger. Ready?', cta: 'NEXT LEVEL' },
      fail: { title: left <= 2 ? 'SO CLOSE!' : 'HOLDER FULL!', sub: 'You needed just 1 more slot.', cta: 'TRY AGAIN' },
      idle: { title: 'YOUR TURN!', sub: 'Can you clear the lot?', cta: 'PLAY NOW' },
    }[kind];
    this.ui.showEndCard(kind, copy);
  }

  private cta(where: 'button' | 'endcard'): void {
    this.director.log('cta', { where, phase: this.director.phase, seconds: Math.round(this.director.time * 10) / 10 });
    openStore(this.cfg.storeUrl);
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

    if (this.cfg.autoplay && !this.ended && !this.logic.over && this.director.phase !== 'ghost' && this.director.phase !== 'boot') {
      this.autoTimer += dt;
      if (this.autoTimer > 0.7) {
        this.autoTimer = 0;
        this.director.touch();
        const lane = this.director.phase === 'guide' ? LEVEL.guideLane : this.logic.bestLane();
        if (lane >= 0) this.userTap(lane);
      }
    }

    const tension = this.ended ? 0 : this.director.tension;
    const k = damp(15, dt);
    this.visual.forEach((car, i) => {
      if (car.state !== 'parked') return;
      car.group.position.x += (slotX(i) - car.group.position.x) * k;
      if (!car.matchGroup && !this.ended) car.worry += (tension - car.worry) * damp(6, dt);
    });
    for (const car of this.cars) car.update(dt, this.time);

    if (!this.ended) {
      const pulse = tension >= 1 ? 0.55 + 0.45 * Math.sin(this.time * 11) : tension;
      this.world.holderLine.color.copy(this.white).lerp(this.red, Math.max(this.holderFlash, tension > 0.3 ? clamp(pulse, 0, 1) : 0));
      this.sfx.heartbeat(dt, tension);
    } else if (this.director.phase === 'endcard') this.rig.drift(dt);

    // Cars in the lanes glance at whatever the hand is pointing to.
    if (this.handTarget && this.ui.handVisible) {
      const t = this.handTarget.group.position;
      for (const lane of this.laneCars) for (const car of lane) if (car !== this.handTarget) car.lookAt(clamp((t.x - car.group.position.x) / 2.5, -1, 1), clamp((car.group.position.z - t.z) / 3, -1, 1));
    }
    if (this.handTarget) {
      this.rig.toScreen(this.tmp.copy(this.handTarget.group.position).setY(0.75), this.scr);
      const f = this.handFrom;
      this.ui.placeHand(f.x + (this.scr.x - f.x) * f.k, f.y + (this.scr.y - f.y) * f.k);
    }
    this.rig.toScreen(this.tmp.set(0, 0, HOLDER.z0 - 0.25), this.scr);
    this.ui.placeBanner(this.scr.x, this.scr.y);

    this.rig.update(dt);
    this.fx.update(dt, this.rig.camera.quaternion);
    this.renderer.render(this.world.scene, this.rig.camera);
  }

  /** Test hook: lets the smoke test read state and find cars on screen without poking at internals. */
  get debug() {
    return {
      phase: this.director.phase,
      events: this.director.events,
      sent: this.sentShown,
      waiting: this.logic.waiting.length,
      won: this.logic.won,
      failed: this.logic.failed,
      guideLane: LEVEL.guideLane,
      bestLane: () => this.logic.bestLane(),
      laneScreen: (lane: number, row = 0) => {
        const car = this.laneCars[lane]?.[row];
        if (!car) return null;
        this.rig.toScreen(this.tmp.copy(car.group.position).setY(0.6), this.scr);
        return { x: this.scr.x, y: this.scr.y };
      },
    };
  }
}
