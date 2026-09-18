// Pour Decisions: ties the rules, the Pixi scene, the HUD and the ad director together.
import { Application } from 'pixi.js';
import { AudioKit, MusicLoop, SONG_MYSTIC } from '@kit/audio';
import { Director } from '@kit/director';
import { notifyEnd, openStore } from '@kit/network';
import { clamp, ease, kill, lerp, tween, updateTweens, wait } from '@kit/tween';
import { UI } from '@kit/ui';
import { BottleView, INSET, LIP_Y, NECK_HALF, UNIT_H, tiltFor } from './bottle';
import { HEADLINES, type Config } from './config';
import { Fx, makeTextures, type Textures } from './fx';
import { LEVEL, Logic, type ColorId, type PourResult } from './logic';
import { LIQUID } from './palette';
import { BOTTLE_TOP, Scene } from './scene';
import { Sfx } from './sfx';

const GHOST = Symbol('ghost');
const LIFT = 40;
const PRAISE = ['NICE!', 'LOVELY!', 'SMOOTH!', 'PERFECT!', 'MAGIC!'];
const BOTTLE_ICON =
  '<svg viewBox="0 0 40 56" aria-hidden="true"><path d="M14 3h12v12c7 3 10 8 10 15v14c0 6-4 9-9 9H13c-5 0-9-3-9-9V30c0-7 3-12 10-15z" fill="#cfe3ff" fill-opacity=".35" stroke="#e6f0ff" stroke-width="3" stroke-linejoin="round"/><path d="M6 32h28v12c0 5-3 7-7 7H13c-4 0-7-2-7-7z" fill="#3ddc6b"/><rect x="12" y="0" width="16" height="7" rx="3" fill="#d9aa72"/></svg>';

interface Stream {
  x: number;
  y0: number;
  y1: number;
  color: number;
  light: number;
  width: number;
}

export class Game {
  private app = new Application();
  private tex!: Textures;
  private scene!: Scene;
  private fx!: Fx;
  private ui: UI;
  private audio = new AudioKit();
  private sfx = new Sfx(this.audio);
  private music = new MusicLoop(this.audio, SONG_MYSTIC);
  private director: Director;
  private logic: Logic;

  private views: BottleView[] = [];
  private rescue: BottleView | null = null;
  private selected = -1;
  private queued: number | null = null;
  private streams = new Set<Stream>();
  private pouring = 0;
  private ended = false;
  private hurry = false;
  private musicOn = false;
  private corked = 0;
  private time = 0;
  private moteIn = 0;
  private autoTimer = 0;
  private shiver = 0;
  private twinkleIn = 1;

  private handBottle: BottleView | null = null;
  private handFrom = { x: 0, y: 0, k: 1 };
  private pt = { x: 0, y: 0 };

  constructor(private canvas: HTMLCanvasElement, uiRoot: HTMLElement, private cfg: Config) {
    this.ui = new UI(uiRoot, { goalIcon: BOTTLE_ICON, logo: ['POUR', 'DECISIONS'] });
    uiRoot.style.setProperty('--toast-top', '20.5%');
    this.logic = new Logic(LEVEL, cfg.ending);
    this.director = new Director(cfg.timings, {
      onHint: () => this.showHint(),
      onAuto: () => this.autoMove(),
      onGiveUp: () => this.finish('idle'),
    });
  }

  async init(): Promise<void> {
    await this.app.init({
      canvas: this.canvas,
      width: window.innerWidth,
      height: window.innerHeight,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      background: 0x150d33,
      preference: 'webgl',
      autoStart: false,
      sharedTicker: false,
    });
    this.app.ticker.stop();
    this.tex = makeTextures();
    this.scene = new Scene(this.tex);
    this.fx = new Fx(this.tex);
    this.scene.fxLayer.addChild(this.fx.layer);
    this.app.stage.addChild(this.scene.stage);

    this.logic.bottles.forEach((units, i) => {
      const v = new BottleView(i, this.tex.glow);
      v.setUnits(units);
      if (this.logic.isComplete(i)) {
        v.complete = true;
        v.cork = 1;
        v.aura = 1;
        v.setAuraColor(LIQUID[units[0].color!].base);
      }
      this.views.push(v);
      this.scene.bottles.addChild(v.root);
    });
    this.corked = this.logic.doneCount;

    this.bindInput();
    this.ui.setHeadline(HEADLINES[this.cfg.headline]);
    this.ui.setGoal(this.corked, this.logic.totalSets);
    this.ui.onCta((where) => this.cta(where));
    if (this.cfg.showReplay) this.ui.onReplay(() => location.reload());
    this.audio.setMuted(this.cfg.muted);
    this.director.onTension((t) => {
      this.ui.setTension(t);
      this.music.setTension(t);
    });

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => window.setTimeout(() => this.resize(), 120));
  }

  // ---------------------------------------------------------------- setup

  private bindInput(): void {
    const unlock = () => {
      this.audio.unlock();
      if (!this.musicOn && this.audio.ctx) {
        this.musicOn = true;
        this.music.start();
      }
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      unlock();
      this.onPointer(e.clientX, e.clientY);
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    for (const type of ['pointerup', 'touchend', 'click'] as const) window.addEventListener(type, unlock, { passive: true });
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!w || !h) return;
    this.app.renderer.resize(w, h);
    this.scene.resize(w, h);
    this.relayout(false);
  }

  /** Puts every bottle on its shelf slot. Bottles that are mid-pour keep flying and land on the new slot. */
  private relayout(animate: boolean): void {
    const all = this.rescue ? [...this.views, this.rescue] : this.views;
    const slots = this.scene.layout(all.length);
    all.forEach((v, i) => {
      const s = slots[i];
      if (animate && !v.busy && v !== this.rescue) {
        const fx = v.home.x;
        const fy = v.home.y;
        void tween({ dur: 0.45, ease: ease.outBack, update: (k) => this.place(v, lerp(fx, s.x, k), lerp(fy, s.y, k)) });
      } else this.place(v, s.x, s.y);
    });
  }

  private place(v: BottleView, x: number, y: number): void {
    v.home.x = x;
    v.home.y = y;
    if (!v.busy) v.root.position.set(x, y - v.lift);
  }

  // ---------------------------------------------------------------- flow

  start(): void {
    this.director.start();
    this.views.forEach((v, i) => {
      v.root.scale.set(0.7);
      v.slosh(7);
      void tween({ dur: 0.6, delay: 0.04 * i, ease: ease.outElastic, update: (k) => v.root.scale.set(0.7 + 0.3 * k) });
    });
    if (this.cfg.botchedOpening) void this.botchedOpening();
    else void this.beginGuide();
  }

  /** The ad tries a pour the rules refuse. It teaches select-then-pour and the matching rule in two seconds. */
  private async botchedOpening(): Promise<void> {
    this.director.setPhase('ghost');
    const w = (s: number) => wait(this.hurry ? s * 0.3 : s, GHOST);
    const [a, b] = LEVEL.botch;
    const src = this.views[a];
    const dst = this.views[b];
    await w(0.75);
    this.pointHandAt(src, 'still', true);
    await w(0.5);
    this.ui.tapHandOnce();
    await w(0.15);
    this.select(a);
    await w(0.4);
    this.pointHandAt(dst, 'still', false, true);
    await w(0.45);
    this.ui.tapHandOnce();
    await w(0.15);
    this.ui.hideHand();
    this.handBottle = null;
    this.director.log('ghost_bad_move', { from: a, to: b });

    // Fly half way, get refused, go home.
    src.busy = true;
    this.selected = -1;
    src.glow = 0;
    const sx = src.root.x;
    const sy = src.root.y;
    const side = this.pourSide(src, dst);
    const tx = dst.home.x - side * 78;
    const ty = dst.home.y - BOTTLE_TOP - 58;
    this.sfx.whoosh();
    await tween({ dur: 0.3, ease: ease.outCubic, tag: GHOST, update: (k) => (src.root.position.set(lerp(sx, tx, k), lerp(sy, ty, k)), (src.root.rotation = side * 0.5 * k)) });
    src.slosh(9);
    this.sfx.nope();
    this.scene.toScreen(dst.home.x, dst.home.y - BOTTLE_TOP - 30, this.pt);
    this.ui.floater('✗', this.pt.x, this.pt.y, '#ff5a6e');
    this.ui.toast('Colors must match!', 'bad', 1100);
    void tween({ dur: 0.45, ease: ease.linear, update: (_k, t) => (dst.root.rotation = Math.sin(t * 28) * 0.07 * (1 - t)) });
    await tween({ dur: 0.4, ease: ease.linear, tag: GHOST, update: (_k, t) => (src.root.rotation = side * 0.5 + Math.sin(t * 30) * 0.12 * (1 - t)) });
    await tween({ dur: 0.34, ease: ease.inOutCubic, tag: GHOST, update: (k) => (src.root.position.set(lerp(tx, src.home.x, k), lerp(ty, src.home.y, k)), (src.root.rotation = side * 0.5 * (1 - k))) });
    src.lift = 0;
    src.busy = false;
    src.slosh(6);
    this.sfx.setDown();
    await w(0.35);
    void this.beginGuide();
  }

  private async beginGuide(): Promise<void> {
    if (this.ended) return;
    this.director.setPhase('guide');
    this.ui.toast('YOUR TURN!', 'good', 900);
    this.showHint();
  }

  private onPointer(x: number, y: number): void {
    if (this.ended && !this.rescue) return;
    this.director.touch();
    if (this.rescue) {
      // Once the "+1 bottle" is on the table, it and the button are the only things that respond.
      this.scene.toWorld(x, y, this.pt);
      if (Math.abs(this.pt.x - this.rescue.home.x) < 90 && this.pt.y < this.rescue.home.y + 40 && this.pt.y > this.rescue.home.y - 290) this.cta('rescue');
      return;
    }
    if (this.director.phase === 'ghost' || this.director.phase === 'boot') {
      this.hurry = true;
      return;
    }
    this.userTap(this.pick(x, y));
  }

  private pick(x: number, y: number): number {
    this.scene.toWorld(x, y, this.pt);
    let best = -1;
    let bestD = 78;
    this.views.forEach((v, i) => {
      if (this.pt.y > v.home.y + 46 || this.pt.y < v.home.y - BOTTLE_TOP - 70) return;
      const d = Math.abs(this.pt.x - v.home.x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  /** One tap from the player (or from the ad playing itself). i = -1 means "tapped the background". */
  private userTap(i: number): void {
    if (this.ended || this.logic.stuck || this.logic.won) return;
    if (i < 0) {
      if (this.selected >= 0) this.deselect();
      return;
    }
    const v = this.views[i];
    if (v.busy) {
      this.queued = i;
      return;
    }
    const guiding = this.director.phase === 'guide';
    const [ga, gb] = LEVEL.guide;

    if (this.selected < 0) {
      if (guiding && i !== ga) return this.refuse(v, this.views[ga]);
      if (v.complete) {
        this.fx.sparkle(v.home.x, v.home.y - 120, 5, 0xfff2a8, 70);
        this.sfx.tick();
        return;
      }
      if (this.logic.bottles[i].length === 0) return this.refuse(v);
      this.select(i);
      return;
    }

    if (i === this.selected) {
      if (guiding) return;
      this.deselect();
      return;
    }
    if (guiding && i !== gb) return this.refuse(v, this.views[gb]);

    if (this.logic.pourable(this.selected, i) > 0) {
      this.pour(this.selected, i, 'user');
    } else {
      // Not a legal target. If it holds liquid, the player probably meant to pick it up instead.
      this.refuse(v);
      if (!v.complete && this.logic.bottles[i].length > 0) {
        this.deselect(true);
        this.select(i);
      }
    }
  }

  private refuse(v: BottleView, want?: BottleView): void {
    this.sfx.nope();
    void tween({ dur: 0.34, ease: ease.linear, update: (_k, t) => (v.root.rotation = v.busy ? v.root.rotation : Math.sin(t * Math.PI * 5) * 0.09 * (1 - t)) });
    if (want) void tween({ dur: 0.4, ease: ease.yoyo, update: (k) => want.root.scale.set(1 + 0.1 * k) });
  }

  private select(i: number): void {
    const v = this.views[i];
    this.selected = i;
    this.sfx.clink();
    v.slosh(7);
    this.fx.pulse(v.home.x, v.home.y - 110, 0x9fd0ff, 0.8);
    this.scene.bottles.addChild(v.root);
    const from = v.lift;
    void tween({ dur: 0.24, ease: ease.outBack, tag: v, update: (k) => this.setLift(v, lerp(from, LIFT, k), k) });
    this.director.log('select', { bottle: i });
    this.refreshHand();
  }

  private deselect(quiet = false): void {
    if (this.selected < 0) return;
    const v = this.views[this.selected];
    this.selected = -1;
    if (!quiet) this.sfx.setDown();
    kill(v);
    const from = v.lift;
    const g0 = v.glow;
    void tween({ dur: 0.2, ease: ease.outCubic, tag: v, update: (k) => this.setLift(v, lerp(from, 0, k), g0 * (1 - k)) });
    v.slosh(5);
    this.refreshHand();
  }

  private setLift(v: BottleView, lift: number, glow: number): void {
    v.lift = lift;
    v.glow = glow;
    if (!v.busy) v.root.position.set(v.home.x, v.home.y - lift);
  }

  // ---------------------------------------------------------------- the pour

  private pour(a: number, b: number, by: 'user' | 'auto'): void {
    const res = this.logic.pour(a, b);
    if (!res) return;
    const guided = this.director.phase === 'guide';
    this.selected = -1;
    this.ui.hideHand();
    this.handBottle = null;
    if (by === 'user') this.director.log('pour', { from: a, to: b, color: res.color, units: res.amount, legalNext: this.logic.legalMoves().length });
    if (guided) this.director.setPhase('free');
    if (res.won || res.stuck) this.director.setPhase('ending');
    else if (this.cfg.ending === 'stuck' && this.logic.moves >= 4 && this.director.phase === 'free') {
      // The dead end is a few pours away. The music tightens a little; the player cannot tell why yet.
      this.director.setPhase('squeeze');
      this.director.setTension(0.5);
    }
    void this.animatePour(res, guided);
  }

  private async animatePour(res: PourResult, guided: boolean): Promise<void> {
    const src = this.views[res.from];
    const dst = this.views[res.to];
    src.busy = dst.busy = true;
    this.pouring++;
    kill(src);
    src.glow = 0;
    this.scene.bottles.addChild(src.root);

    const side = this.pourSide(src, dst);
    const lipTarget = { x: dst.home.x - side * 3, y: dst.home.y - BOTTLE_TOP - 16 };
    const posFor = (rot: number) => {
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      const lx = side * NECK_HALF;
      const ly = -LIP_Y;
      return { x: lipTarget.x - (lx * c - ly * s), y: lipTarget.y - (lx * s + ly * c) };
    };

    // 1. Fly over and tip until the liquid reaches the lip.
    const start = { x: src.root.x, y: src.root.y };
    const rot0 = side * (tiltFor(src.height) - 0.02);
    this.sfx.whoosh();
    await tween({
      dur: 0.3,
      ease: ease.inOutCubic,
      update: (k) => {
        const rot = rot0 * k;
        const p = posFor(rot);
        src.root.rotation = rot;
        src.root.position.set(lerp(start.x, p.x, k), lerp(start.y, p.y, k));
      },
    });

    // 2. Pour. The source drains from the top while the target fills, unit by unit.
    const pal = LIQUID[res.color];
    const srcTop = src.layers.length - 1;
    const dstBase = dst.layers.length;
    for (let i = 0; i < res.amount; i++) dst.layers.push({ color: res.color, hidden: false, amount: 0, flash: 0 });
    const stream: Stream = { x: lipTarget.x, y0: lipTarget.y, y1: lipTarget.y, color: pal.base, light: pal.light, width: 0 };
    this.streams.add(stream);
    const lip = { x: 0, y: 0 };
    const surfaceY = () => dst.home.y - dst.height;
    this.sfx.pourStart((dst.height - INSET) / (UNIT_H * 4));
    // The stream falls first...
    await tween({ dur: 0.1, ease: ease.inQuad, update: (k) => ((stream.width = 9 * k), (stream.y1 = lerp(lipTarget.y, surfaceY(), k))) });
    let splashIn = 0;
    await tween({
      dur: 0.2 + 0.24 * res.amount,
      ease: ease.inOutSine,
      update: (k) => {
        const moved = k * res.amount;
        for (let i = 0; i < res.amount; i++) {
          const part = clamp(moved - i, 0, 1);
          src.layers[srcTop - i].amount = 1 - part;
          dst.layers[dstBase + i].amount = part;
        }
        const rot = side * (tiltFor(src.height) - 0.02);
        const p = posFor(rot);
        src.root.rotation = rot;
        src.root.position.set(p.x, p.y);
        src.lipWorld(side, lip);
        stream.x = lip.x;
        stream.y0 = lip.y;
        stream.y1 = surfaceY();
        stream.width = 8 + Math.sin(this.time * 40) * 1.2;
        dst.slosh(5);
        dst.bubble(0.5);
        this.sfx.pouring(1 / 60, (dst.height - INSET) / (UNIT_H * 4));
        if (--splashIn <= 0) {
          splashIn = 3;
          this.fx.droplets(stream.x, stream.y1 + 2, pal.light, 1, 0.55);
        }
      },
    });
    src.layers.length = srcTop - res.amount + 1;
    this.sfx.pourStop();
    // ...and the tail of the stream drops away.
    void tween({ dur: 0.12, ease: ease.inQuad, update: (k) => (stream.y0 = lerp(lipTarget.y, surfaceY(), k)) }).then(() => this.streams.delete(stream));
    this.fx.droplets(lipTarget.x, surfaceY(), pal.light, 5, 0.8);
    dst.slosh(9);
    dst.busy = false;

    if (res.completed >= 0) this.corkIt(dst, res.color, guided);

    // 3. Swing back upright and return to the shelf.
    const from = { x: src.root.x, y: src.root.y, rot: src.root.rotation };
    await tween({
      dur: 0.3,
      ease: ease.inOutCubic,
      update: (k) => {
        src.root.rotation = from.rot * (1 - k);
        src.root.position.set(lerp(from.x, src.home.x, k), lerp(from.y, src.home.y, k));
      },
    });
    src.lift = 0;
    src.busy = false;
    src.root.rotation = 0;
    src.slosh(8);
    this.sfx.setDown();
    this.pouring--;

    if (res.revealed) this.reveal(src, res.revealed.index, res.revealed.color, res.stuck);

    if (res.won) void this.winSequence();
    else if (res.stuck) void this.stuckSequence();
    else this.flushQueue();
  }

  /**
   * +1 = the source hangs to the left of the target and tips clockwise. A tipped bottle is long, so it
   * always hangs over the middle of the shelf, never off the edge of the screen.
   */
  private pourSide(src: BottleView, dst: BottleView): number {
    if (Math.abs(dst.home.x) > 40) return dst.home.x > 0 ? 1 : -1;
    return src.home.x <= dst.home.x ? 1 : -1;
  }

  private corkIt(v: BottleView, color: ColorId, big: boolean): void {
    v.complete = true;
    this.corked++;
    v.setAuraColor(LIQUID[color].base);
    const x = v.home.x;
    const y = v.home.y;
    void tween({ dur: 0.3, ease: ease.inQuad, update: (k) => (v.cork = k) }).then(() => {
      this.sfx.corkPop(this.logic.earned - 1);
      this.fx.pulse(x, y - BOTTLE_TOP + 6, 0xfff2a8, 1.1);
      this.fx.pulse(x, y - 110, LIQUID[color].light, 1.7);
      this.fx.sparkle(x, y - 130, big ? 26 : 16, 0xfff2a8, 190);
      if (big) this.fx.confetti(x, y - BOTTLE_TOP, 46, 0.9);
      void tween({ dur: 0.5, ease: ease.outElastic, update: (k) => v.root.scale.set(1.16 - 0.16 * k, 0.86 + 0.14 * k) });
      void tween({ dur: 0.6, ease: ease.outCubic, update: (k) => (v.aura = k) });
      this.ui.setGoal(this.corked, this.logic.totalSets, true);
      this.scene.toScreen(x, y - BOTTLE_TOP - 46, this.pt);
      this.ui.floater(PRAISE[Math.min(this.logic.earned - 1, PRAISE.length - 1)], this.pt.x, this.pt.y);
      this.director.log('cork', { n: this.corked, of: this.logic.totalSets, color });
    });
  }

  /** `fatal` is the reveal that leaves no legal pour: same sparkle, but it lands on a sour chord. */
  private reveal(v: BottleView, index: number, color: ColorId, fatal: boolean): void {
    const l = v.layers[index];
    if (!l) return;
    const decoy = fatal;
    l.hidden = false;
    l.color = color;
    l.flash = 1;
    const y = v.home.y - INSET - (index + 0.5) * UNIT_H;
    this.fx.pulse(v.home.x, y, decoy ? LIQUID[color].base : 0xffffff, 1);
    this.fx.sparkle(v.home.x, y, 9, decoy ? LIQUID[color].light : 0xffffff, 90);
    if (decoy) this.sfx.revealBad();
    else this.sfx.reveal();
    v.slosh(6);
    this.director.log('reveal', { bottle: v.index, color, fatal });
  }

  private flushQueue(): void {
    if (this.queued === null) return;
    const i = this.queued;
    this.queued = null;
    this.userTap(i);
  }

  // ---------------------------------------------------------------- hints and the ad playing itself

  private pointHandAt(v: BottleView, mode: 'loop' | 'still', glide: boolean, slide = false): void {
    if (slide && this.handBottle) {
      this.scene.toScreen(this.handBottle.root.x, this.handBottle.root.y - 118, this.pt);
      this.handFrom = { x: this.pt.x, y: this.pt.y, k: 0 };
      void tween({ dur: 0.32, ease: ease.inOutCubic, tag: GHOST, update: (k) => (this.handFrom.k = k) });
    } else if (glide) {
      this.handFrom = { x: window.innerWidth * 0.86, y: window.innerHeight * 0.92, k: 0 };
      void tween({ dur: 0.45, ease: ease.outCubic, tag: GHOST, update: (k) => (this.handFrom.k = k) });
    } else this.handFrom.k = 1;
    this.handBottle = v;
    this.ui.showHand(mode);
  }

  private nextStep(): number {
    if (this.director.phase === 'guide') return this.selected === LEVEL.guide[0] ? LEVEL.guide[1] : LEVEL.guide[0];
    if (this.selected >= 0) {
      // Something is already in hand: finish that thought if it leads anywhere, otherwise put it down.
      const from = this.logic.bestMove(this.selected);
      return from ? from[1] : this.selected;
    }
    const move = this.logic.bestMove();
    return move ? move[0] : -1;
  }

  private showHint(): void {
    if (this.ended || this.logic.stuck || this.logic.won || this.rescue) return;
    const i = this.nextStep();
    if (i >= 0) this.pointHandAt(this.views[i], 'loop', !this.ui.handVisible, this.ui.handVisible);
  }

  /** After a selection the hand moves on to the target, but only if it was already helping. */
  private refreshHand(): void {
    if (this.director.phase === 'ghost' || this.director.phase === 'boot') return;
    if (this.ui.handVisible || this.director.phase === 'guide') this.showHint();
  }

  /** The viewer is not touching: the ad plays one whole move itself, pick-up and pour. */
  private autoMove(): void {
    if (this.ended || this.pouring > 0) return;
    const i = this.nextStep();
    if (i < 0) return;
    const touches = this.director.interactions;
    this.userTap(i);
    if (this.selected !== i) return;
    void wait(0.55).then(() => {
      if (this.ended || this.selected !== i || this.director.interactions !== touches) return;
      const j = this.nextStep();
      if (j >= 0) this.userTap(j);
    });
  }

  // ---------------------------------------------------------------- endings

  /** No legal pour is left. The rescue the real game sells at this moment becomes our install button. */
  private async stuckSequence(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    kill(GHOST);
    this.ui.hideHand();
    this.handBottle = null;
    await wait(0.45);
    this.director.setTension(1);
    this.sfx.stuck();
    this.ui.flash();
    // Either nothing can be poured at all, or the only pours left just go back and forth.
    this.ui.toast(this.logic.legalMoves().length === 0 ? 'NO MOVES LEFT!' : "YOU'RE STUCK!", 'bad', 1500);
    this.shiver = 1;
    void tween({ dur: 0.6, ease: ease.outCubic, update: (k) => this.scene.setGloom(k) });
    this.director.log('stuck', { corked: this.corked, of: this.logic.totalSets, moves: this.logic.moves });
    await wait(1.35);

    // The "+1 bottle" materialises on the shelf.
    const r = new BottleView(this.views.length, this.tex.glow);
    r.makeGhost();
    r.root.alpha = 0;
    this.rescue = r;
    this.scene.bottles.addChild(r.root);
    this.relayout(true);
    this.sfx.rescue();
    await wait(0.2);
    this.fx.pulse(r.home.x, r.home.y - 110, 0x5dff9d, 2.2);
    this.fx.sparkle(r.home.x, r.home.y - 120, 22, 0xaaffd0, 200);
    void tween({ dur: 0.5, ease: ease.outBack, update: (k) => ((r.root.alpha = Math.min(1, k * 1.4)), r.root.scale.set(0.5 + 0.5 * k)) });
    r.glow = 1;
    this.shiver = 0.35;
    this.ui.toast('One more bottle would do it…', 'info', 2200);
    this.ui.setCta('GET +1 BOTTLE', true);
    this.director.log('rescue_offer');
    await wait(0.6);
    this.pointHandAt(r, 'loop', true);
    await wait(4.2);
    this.finish('fail');
  }

  private async winSequence(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    kill(GHOST);
    this.ui.hideHud();
    this.director.setTension(0);
    await wait(0.5);
    this.sfx.win();
    this.ui.toast('LEVEL COMPLETE!', 'good', 1600);
    this.views.forEach((v, i) => {
      void tween({ dur: 0.5, delay: i * 0.07, ease: ease.yoyo, update: (k) => (v.root.y = v.home.y - 46 * k) });
      void wait(i * 0.07).then(() => (this.sfx.pop(i), this.fx.sparkle(v.home.x, v.home.y - 130, 6, 0xfff2a8, 120)));
    });
    const half = this.scene.w / this.scene.scale / 2;
    for (let i = 0; i < 3; i++) void wait(0.15 + i * 0.3).then(() => (this.fx.confetti(-half * 0.8, 300, 46, 1.25), this.fx.confetti(half * 0.8, 300, 46, 1.25)));
    await wait(1.5);
    await this.teaser();
    this.finish('win');
  }

  /** The curiosity gap: the solved shelf slides away and a far bigger, far more mysterious level drops in. */
  private async teaser(): Promise<void> {
    this.views.forEach((v, i) => void tween({ dur: 0.4, delay: i * 0.03, ease: ease.inBack, update: (k) => ((v.root.y = v.home.y + 1500 * k * k), (v.root.alpha = 1 - k)) }));
    await wait(0.45);
    const colors: ColorId[] = ['red', 'cyan', 'green', 'yellow', 'purple', 'orange', 'pink', 'teal', 'lime'];
    const count = this.scene.portrait ? 10 : 12;
    const slots = this.scene.layout(count);
    const fresh: BottleView[] = [];
    for (let i = 0; i < count; i++) {
      const v = new BottleView(100 + i, this.tex.glow);
      const n = i >= count - 2 ? 0 : 4;
      v.setUnits(Array.from({ length: n }, (_u, k) => ({ color: colors[(i * 3 + k * 5 + ((i * k) % 4)) % colors.length], hidden: k < 3 && (i + k) % 3 !== 0 })));
      v.home.x = slots[i].x;
      v.home.y = slots[i].y;
      v.root.position.set(slots[i].x, slots[i].y - 1400);
      this.scene.bottles.addChild(v.root);
      fresh.push(v);
      void tween({ dur: 0.55, delay: i * 0.06, ease: ease.outBounce, update: (k) => (v.root.y = lerp(slots[i].y - 1400, slots[i].y, k)) }).then(() => (v.slosh(8), this.sfx.clink(i % 2 === 0)));
    }
    this.views.push(...fresh);
    await wait(0.06 * count + 0.75);
  }

  private finish(kind: 'win' | 'fail' | 'idle'): void {
    if (this.director.phase === 'endcard') return;
    this.ended = true;
    kill(GHOST);
    this.director.setPhase('endcard');
    this.director.log('end', {
      outcome: kind,
      seconds: Math.round(this.director.time * 10) / 10,
      pours: this.logic.moves,
      corked: this.corked,
      firstTouch: this.director.firstTouchAt,
    });
    this.director.stop();
    notifyEnd();
    const copy = {
      win: { title: 'LEVEL COMPLETE!', sub: 'Level 2 is full of mystery potions. Ready?', cta: 'NEXT LEVEL' },
      fail: { title: 'SO CLOSE!', sub: 'One more bottle and you had it.', cta: 'GET +1 BOTTLE' },
      idle: { title: 'YOUR TURN!', sub: 'Can you sort every potion?', cta: 'PLAY NOW' },
    }[kind];
    this.ui.showEndCard(kind, copy);
  }

  private cta(where: 'button' | 'endcard' | 'rescue'): void {
    this.director.log('cta', { where, phase: this.director.phase, seconds: Math.round(this.director.time * 10) / 10 });
    openStore(this.cfg.storeUrl);
    if (this.rescue && this.director.phase !== 'endcard') this.finish('fail');
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

    if (this.cfg.autoplay && !this.ended && this.director.phase !== 'ghost' && this.director.phase !== 'boot') {
      this.autoTimer += dt;
      if (this.autoTimer > 0.55 && this.pouring === 0) {
        this.autoTimer = 0;
        this.director.touch();
        const i = this.nextStep();
        if (i >= 0) this.userTap(i);
      }
    }

    this.moteIn -= dt;
    if (this.moteIn <= 0) {
      this.moteIn = 0.16;
      const hw = this.scene.w / this.scene.scale / 2;
      const hh = this.scene.h / this.scene.scale / 2;
      this.fx.mote((Math.random() * 2 - 1) * hw, (Math.random() * 2 - 1) * hh + 200);
    }

    // Finished potions twinkle now and then.
    this.twinkleIn -= dt;
    if (this.twinkleIn <= 0) {
      this.twinkleIn = 0.35 + Math.random() * 0.4;
      const done = this.views.filter((v) => v.complete && !v.busy);
      const v = done[(Math.random() * done.length) | 0];
      if (v && this.director.phase !== 'endcard') this.fx.sparkle(v.home.x + (Math.random() - 0.5) * 50, v.home.y - 60 - Math.random() * 150, 1, 0xfff2a8, 20);
    }

    const all = this.rescue ? [...this.views, this.rescue] : this.views;
    for (const v of all) {
      if (this.shiver > 0 && !v.busy && v !== this.rescue && !v.complete) v.root.rotation = Math.sin(this.time * 34 + v.index * 1.7) * 0.022 * this.shiver;
      v.update(dt, this.time);
    }
    if (this.rescue) this.rescue.glow = 0.75 + 0.25 * Math.sin(this.time * 6);
    if (this.director.phase !== 'endcard') this.sfx.heartbeat(dt, this.director.tension);

    // Pour streams
    const g = this.scene.streams;
    g.clear();
    for (const s of this.streams) {
      if (s.y1 - s.y0 < 1) continue;
      g.roundRect(s.x - s.width / 2, s.y0, s.width, s.y1 - s.y0, s.width / 2).fill(s.color);
      g.roundRect(s.x - s.width / 2 + 1.5, s.y0, s.width * 0.3, s.y1 - s.y0, 1.5).fill({ color: s.light, alpha: 0.85 });
    }

    if (this.handBottle) {
      const b = this.handBottle;
      this.scene.toScreen(b.root.x, b.root.y - 118, this.pt);
      const f = this.handFrom;
      this.ui.placeHand(lerp(f.x, this.pt.x, f.k), lerp(f.y, this.pt.y, f.k));
    }

    this.scene.update(this.time);
    this.fx.update(dt);
    this.app.renderer.render(this.app.stage);
  }

  /** Test hook: lets the automated tests read state and find bottles on screen. */
  get debug() {
    return {
      phase: this.director.phase,
      events: this.director.events,
      corked: this.corked,
      moves: this.logic.moves,
      won: this.logic.won,
      stuck: this.logic.stuck,
      pouring: this.pouring,
      selected: this.selected,
      guide: LEVEL.guide,
      rescue: !!this.rescue,
      next: () => this.nextStep(),
      bottleScreen: (i: number) => {
        const v = i === -2 ? this.rescue : this.views[i];
        if (!v) return null;
        this.scene.toScreen(v.home.x, v.home.y - 110, this.pt);
        return { x: this.pt.x, y: this.pt.y };
      },
    };
  }
}
