// Rescue Game: ties the bricks, the board, the dice, the slingshot, the HUD and the ad director together.
import { Application } from 'pixi.js';
import { AudioKit, MusicLoop } from '@kit/audio';
import { Director } from '@kit/director';
import { notifyEnd, openStore } from '@kit/network';
import { ease, kill, lerp, tween, updateTweens, wait } from '@kit/tween';
import { UI } from '@kit/ui';
import { Hud } from './hud';
import { makeArt, type Art } from './art';
import { AttackView, REST, TARGETS, type Target } from './attackview';
import { HEADLINES, type Config } from './config';
import { Fx } from './fx';
import { BOARD, BOARD_H, CELL, DICE, GUIDE, TANK, type Pos } from './level';
import { RescueView } from './rescueview';
import { Rescue } from './rig';
import { RollView } from './rollview';
import { Scene } from './scene';
import { Sfx } from './sfx';

type Stage = 'rescue' | 'roll' | 'attack' | 'payoff';
type Hand = { kind: 'tap'; at: () => Pos2 } | { kind: 'swipe'; a: () => Pos2; b: () => Pos2; t: number };
interface Pos2 {
  x: number;
  y: number;
}

const GHOST = Symbol('ghost');
const PRAISE = ['NICE!', 'GREAT!', 'AWESOME!'];
const COLORS: Record<string, number> = { a: 0xff4a5a, p: 0x3ddc6b, l: 0xffc93c, b: 0x2f8bff };

export class Game {
  private app = new Application();
  private art!: Art;
  private scene!: Scene;
  private fx!: Fx;
  private view!: RescueView;
  private rollView!: RollView;
  private attack!: AttackView;
  private rig = new Rescue();
  private ui: UI;
  private hud: Hud;
  private audio = new AudioKit();
  private sfx = new Sfx(this.audio);
  private music = new MusicLoop(this.audio);
  private director: Director;

  private stage: Stage = 'rescue';
  private busy = false;
  private ended = false;
  private rolling = false;
  private musicOn = false;
  private dice = 0;
  private misses = 0;
  private hit = false;
  private time = 0;
  private autoT = 0;
  private laughIn = 2.2;
  private drained = 0;
  private drainRate = 0;
  private drag: { cell: Pos; x: number; y: number; moved: boolean } | null = null;
  private selected: Pos | null = null;
  private hand: Hand | null = null;
  private handGlide = 1;
  private pt = { x: 0, y: 0 };

  constructor(private canvas: HTMLCanvasElement, private uiRoot: HTMLElement, private cfg: Config) {
    this.ui = new UI(uiRoot, { goalIcon: '', logo: ['RESCUE', 'GAME'] });
    this.hud = new Hud(uiRoot);
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
      background: 0x2a1066,
      preference: 'webgl',
      autoStart: false,
      sharedTicker: false,
    });
    this.app.ticker.stop();
    this.art = await makeArt();
    this.scene = new Scene(this.art);
    this.fx = new Fx(this.art);
    this.view = new RescueView(this.art, this.rig, this.fx);
    this.rollView = new RollView(this.art, this.fx);
    this.attack = new AttackView(this.art, this.fx);
    this.scene.rescue.addChild(this.view.root);
    this.scene.roll.addChild(this.rollView.root);
    this.scene.attack.addChild(this.attack.root);
    this.scene.fxLayer.addChild(this.fx.layer);
    this.app.stage.addChild(this.scene.stage);

    this.bindInput();
    this.ui.setHeadline(HEADLINES[this.cfg.headline]);
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
      this.onDown(e.clientX, e.clientY);
    });
    window.addEventListener('pointermove', (e) => this.onMove(e.clientX, e.clientY));
    window.addEventListener('pointerup', () => this.onUp());
    window.addEventListener('pointercancel', () => this.onUp());
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    for (const type of ['pointerup', 'touchend', 'click'] as const) window.addEventListener(type, unlock, { passive: true });
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!w || !h) return;
    this.app.renderer.resize(w, h);
    this.scene.resize(w, h);
    this.placeToast();
  }

  /** Toasts land in the empty sky of the tank, never on the board. */
  private placeToast(): void {
    const c = this.stage === 'attack' ? this.scene.attack : this.stage === 'roll' ? this.scene.roll : this.scene.rescue;
    const y = this.stage === 'attack' ? 380 : this.stage === 'roll' ? 270 : TANK.y0 + 40;
    this.scene.toScreen(c, 195, y, this.pt);
    this.uiRoot.style.setProperty('--toast-top', `${Math.round(this.pt.y)}px`);
  }

  // ---------------------------------------------------------------- flow

  start(): void {
    this.director.start();
    this.director.setPhase('ghost');
    this.director.setTension(this.rig.tension);
    // A beat to take in the danger: Mary laughs, the bucket pours, then the hand shows the first move.
    void wait(0.9, GHOST).then(() => this.laugh());
    void wait(1.6, GHOST).then(() => {
      if (this.ended) return;
      this.director.setPhase('guide');
      this.ui.toast('Dig a way out!', 'info', 1100);
      this.showHint();
    });
  }

  private laugh(): void {
    if (this.stage !== 'rescue' || this.ended) return;
    this.sfx.laugh();
    this.scene.toScreen(this.scene.rescue, 344, 110, this.pt);
    this.ui.floater('Ha-ha!', this.pt.x - 50, this.pt.y, '#ff8fd0');
  }

  private world(x: number, y: number): Pos2 {
    const c = this.stage === 'attack' ? this.scene.attack : this.stage === 'roll' ? this.scene.roll : this.scene.rescue;
    this.scene.toWorld(c, x, y, this.pt);
    return { x: this.pt.x, y: this.pt.y };
  }

  private onDown(x: number, y: number): void {
    this.director.touch();
    if (this.ended) return;
    const w = this.world(x, y);
    const phase = this.director.phase;
    if (this.stage === 'rescue') {
      if (phase === 'ghost') return;
      if (phase !== 'guide' && phase !== 'free') return;
      const cell = this.view.cellAt(w.x, w.y);
      if (!cell || !this.rig.board.at(cell) || this.busy) return;
      // Tap one tile, then a neighbour: also a swap.
      if (this.selected && Math.abs(this.selected.r - cell.r) + Math.abs(this.selected.c - cell.c) === 1) {
        const a = this.selected;
        this.selected = null;
        this.view.lift(null);
        void this.trySwap(a, cell, 'user');
        return;
      }
      this.drag = { cell, x: w.x, y: w.y, moved: false };
      this.view.lift(cell);
      this.sfx.grab();
    } else if (this.stage === 'roll') {
      if (this.rollView.hits(w.x, w.y)) void this.doRoll();
    } else if (this.stage === 'attack' && !this.attack.flying && this.attack.ammo.visible) {
      this.attack.pulling = true;
      this.hideHand();
      this.attack.pull(REST.x + (w.x - REST.x) * 0.3, Math.max(REST.y, w.y));
    }
  }

  private onMove(x: number, y: number): void {
    if (this.ended) return;
    if (this.stage === 'attack' && this.attack.pulling) {
      const w = this.world(x, y);
      this.attack.pull(w.x, w.y);
      return;
    }
    const d = this.drag;
    if (!d || this.stage !== 'rescue') return;
    const w = this.world(x, y);
    const dx = w.x - d.x;
    const dy = w.y - d.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < CELL * 0.32) return;
    const to = Math.abs(dx) > Math.abs(dy) ? { r: d.cell.r, c: d.cell.c + Math.sign(dx) } : { r: d.cell.r + Math.sign(dy), c: d.cell.c };
    this.drag = null;
    this.selected = null;
    this.view.lift(null);
    void this.trySwap(d.cell, to, 'user');
  }

  private onUp(): void {
    if (this.stage === 'attack' && this.attack.pulling) {
      void this.shoot('user');
      return;
    }
    if (this.drag) {
      // No swipe: keep the tile selected for a tap-tap swap.
      this.selected = this.drag.cell;
      this.drag = null;
    }
  }

  // ---------------------------------------------------------------- the board

  private async trySwap(a: Pos, b: Pos, by: 'user' | 'auto'): Promise<void> {
    if (this.busy || this.ended || this.stage !== 'rescue') return;
    if (!this.rig.board.at(b)) return;
    this.busy = true;
    this.hideHand();
    const board = this.rig.board;
    if (!board.canSwap(a, b)) {
      this.sfx.swap();
      await this.view.swapTiles(a, b, true);
      this.sfx.nope();
      this.ui.toast('No match!', 'bad', 700);
      this.busy = false;
      return;
    }
    this.sfx.swap();
    await this.view.swapTiles(a, b);
    const kind = board.at(b) ?? board.at(a) ?? 'a';
    const res = this.rig.swap(a, b)!;
    this.view.pop(res.cells, COLORS[kind]);
    this.sfx.match(this.dice, res.cells.length);
    this.director.log('match', { by, cells: res.cells.length, opened: res.opened, tension: Math.round(this.rig.tension * 100) / 100 });
    if (this.director.phase === 'guide') this.director.setPhase('free');

    // The die this match earned flies to the meter.
    const cx = res.cells.reduce((s, p) => s + p.c, 0) / res.cells.length;
    const cy = res.cells.reduce((s, p) => s + p.r, 0) / res.cells.length;
    this.scene.toScreen(this.scene.rescue, BOARD.x + (cx + 0.5) * CELL, BOARD.y + (cy + 0.5) * CELL, this.pt);
    const i = this.dice;
    this.dice++;
    this.hud.flyDie({ ...this.pt }, i, () => {
      this.hud.setDice(i + 1);
      this.sfx.die(i);
    });
    if (res.opened) {
      this.sfx.gush();
      this.scene.shake = 0.35;
      this.ui.toast('GREAT! THEY DRAIN!', 'good', 1100);
    } else this.ui.floater(PRAISE[Math.min(i, PRAISE.length - 1)], this.pt.x, this.pt.y - 30);

    await wait(0.3);
    this.busy = false;
    if (this.dice >= DICE) void this.toRoll();
  }

  // ---------------------------------------------------------------- dice

  private async toRoll(): Promise<void> {
    await wait(0.9);
    if (this.ended) return;
    this.stage = 'roll';
    this.hideHand();
    this.selected = null;
    this.drag = null;
    this.director.setPhase('squeeze');
    this.ui.setHeadline('Roll for revenge!');
    this.ui.toast('DICE FULL!', 'good', 900);
    this.scene.roll.visible = true;
    this.scene.roll.alpha = 0;
    this.scene.active = this.scene.roll;
    void tween({ dur: 0.4, ease: ease.outCubic, update: (k) => (this.scene.setDim(0.86 * k), (this.scene.roll.alpha = k)) });
    this.placeToast();
    await wait(0.6);
    this.showHint();
  }

  private async doRoll(): Promise<void> {
    if (this.rolling || this.stage !== 'roll') return;
    this.rolling = true;
    this.hideHand();
    this.director.log('roll');
    await this.rollView.roll(this.sfx);
    this.sfx.attackTime();
    this.ui.flash();
    this.ui.toast('ATTACK TIME!', 'good', 1300);
    this.scene.shake = 0.3;
    await wait(1.2);
    void this.toAttack();
  }

  // ---------------------------------------------------------------- the attack

  private async toAttack(): Promise<void> {
    if (this.ended) return;
    this.hideHand();
    this.stage = 'attack';
    this.director.setPhase('squeeze');
    this.ui.setHeadline("Hit Mary's crane!");
    this.scene.attack.visible = true;
    this.scene.attack.alpha = 0;
    this.scene.active = this.scene.attack;
    await tween({
      dur: 0.45,
      ease: ease.inOutCubic,
      update: (k) => {
        this.scene.roll.alpha = 1 - k;
        this.scene.attack.alpha = k;
        this.scene.setDim(0.86 * (1 - k));
      },
    });
    this.scene.roll.visible = false;
    this.scene.rescue.visible = false;
    this.placeToast();
    this.ui.toast('PULL BACK!', 'info', 1200);
    await wait(0.4);
    this.showHint();
  }

  private async shoot(by: 'user' | 'auto'): Promise<void> {
    const shot = this.attack.aim(this.misses >= 2 || by === 'auto');
    if (!shot) {
      // Not pulled far enough: the bands just relax.
      this.attack.pulling = false;
      this.attack.reload();
      return;
    }
    this.hideHand();
    this.sfx.launch();
    this.director.log('shot', { by, target: shot.target?.name ?? null });
    const blocked = this.cfg.ending === 'shield' && !!shot.target;
    const res = await this.attack.fly(shot, blocked);
    if (res === 'miss') {
      this.misses++;
      this.sfx.miss();
      this.ui.toast('MISSED!', 'bad', 800);
      await wait(0.5);
      this.attack.reload();
      return;
    }
    const t = shot.target!;
    if (res === 'blocked') {
      this.sfx.block();
      this.ui.toast('BLOCKED!', 'bad', 1200);
      await wait(0.4);
      this.sfx.laugh();
      this.scene.toScreen(this.scene.attack, t.x, t.y - 60, this.pt);
      this.ui.floater('Ha-ha!', this.pt.x, this.pt.y, '#ff8fd0');
      this.director.log('blocked', { target: t.name });
      await wait(1.4);
      this.sfx.sad();
      this.finish('shield');
      return;
    }
    this.hit = true;
    this.hideHand();
    this.explode(t);
    await wait(1.5);
    void this.payoff();
  }

  private explode(t: Target): void {
    this.sfx.boom();
    this.scene.shake = 1;
    this.ui.flash();
    this.fx.glow(t.x, t.y, 0xffb21a, 3.2, 0.6);
    this.fx.glow(t.x, t.y, 0xffffff, 1.6, 0.3);
    this.fx.smoke(t.x, t.y, 10, 1.6);
    this.fx.debris(t.x, t.y, 26);
    this.fx.sparkle(t.x, t.y, 22, 0xffe066, 260);
    this.fx.coins(t.x, t.y, 22, 1.2);
    this.attack.collapse();
    this.ui.toast('DIRECT HIT!', 'good', 1200);
    this.director.log('hit', { target: t.name });
  }

  private async payoff(): Promise<void> {
    if (this.ended) return;
    this.stage = 'payoff';
    this.hideHand();
    this.director.setPhase('ending');
    this.director.setTension(0);
    this.rig.pouring = false;
    // Back at the tank, the crane is wrecked: no cab, no bucket, the jib hanging.
    this.view.cab.visible = false;
    this.view.bucket.visible = false;
    this.view.jib.rotation = 0.22;
    this.scene.rescue.visible = true;
    this.scene.active = this.scene.rescue;
    await tween({ dur: 0.4, ease: ease.inOutCubic, update: (k) => ((this.scene.attack.alpha = 1 - k), (this.scene.rescue.alpha = k)) });
    this.scene.attack.visible = false;
    this.placeToast();
    this.ui.setHeadline('Your pig is free!');
    this.sfx.glass();
    this.view.free();
    this.fx.confetti(195, TANK.y0 + 60, 70, 1.1);
    this.fx.coins(195, 120, 28, 0.9);
    await wait(0.35);
    this.sfx.fanfare();
    this.ui.toast('REVENGE!', 'good', 1800);
    let shown = 0;
    void tween({ dur: 1.3, ease: ease.outCubic, update: (k) => {
      const n = Math.round(2500 * k);
      if (n !== shown) {
        shown = n;
        this.hud.setCoins(n);
        this.sfx.counting(1 / 60);
      }
    } });
    await wait(2.4);
    this.finish('win');
  }

  private finish(kind: 'win' | 'shield' | 'idle'): void {
    if (this.director.phase === 'endcard') return;
    this.ended = true;
    kill(GHOST);
    this.hideHand();
    this.attack.pulling = false;
    this.director.setPhase('endcard');
    this.director.log('end', { outcome: kind === 'win' ? 'win' : kind === 'shield' ? 'fail' : 'idle', reason: kind, seconds: Math.round(this.director.time * 10) / 10, dice: this.dice, misses: this.misses, firstTouch: this.director.firstTouchAt });
    this.director.stop();
    this.sfx.rubble.stop();
    notifyEnd();
    this.hud.hide();
    const copy = {
      win: { title: 'REVENGE!', sub: 'Your pig is free. Roll again and build your town!', cta: 'PLAY FREE' },
      shield: { title: 'SO CLOSE!', sub: "Mary's shield blocked you. Your next roll breaks it.", cta: 'ROLL AGAIN' },
      idle: { title: 'YOUR TURN!', sub: 'Save the pig, then get your revenge.', cta: 'PLAY NOW' },
    }[kind];
    this.ui.showEndCard(kind === 'shield' ? 'fail' : kind, copy);
  }

  private cta(where: 'button' | 'endcard'): void {
    this.director.log('cta', { where, phase: this.director.phase, seconds: Math.round(this.director.time * 10) / 10 });
    openStore(this.cfg.storeUrl);
  }

  // ---------------------------------------------------------------- hints and the ad playing itself

  private cellScreen(p: Pos): Pos2 {
    const c = this.view.cellCenter(p);
    this.scene.toScreen(this.scene.rescue, c.x, c.y, this.pt);
    return { x: this.pt.x, y: this.pt.y };
  }

  private showHint(): void {
    if (this.ended || this.busy) return;
    if (this.stage === 'rescue') {
      const m = this.director.phase === 'guide' || this.rig.board.matches === 0 ? { a: GUIDE[0], b: GUIDE[1] } : this.rig.board.bestMove();
      if (!m) return;
      this.setHand({ kind: 'swipe', a: () => this.cellScreen(m.b), b: () => this.cellScreen(m.a), t: 0 });
    } else if (this.stage === 'roll' && !this.rolling) {
      this.setHand({ kind: 'tap', at: () => (this.scene.toScreen(this.scene.roll, 195, 616, this.pt), { ...this.pt }) });
    } else if (this.stage === 'attack' && !this.attack.flying && !this.hit && this.attack.ammo.visible) {
      const s = this.scene.attack;
      this.setHand({ kind: 'swipe', a: () => (this.scene.toScreen(s, REST.x, REST.y - 10, this.pt), { ...this.pt }), b: () => (this.scene.toScreen(s, REST.x - 26, REST.y + 104, this.pt), { ...this.pt }), t: 0 });
    }
  }

  private setHand(h: Hand): void {
    if (!this.ui.handVisible) this.handGlide = 0;
    this.hand = h;
    this.ui.showHand(h.kind === 'tap' ? 'loop' : 'still');
  }

  private hideHand(): void {
    this.hand = null;
    this.ui.hideHand();
  }

  private autoMove(): void {
    if (this.ended) return;
    if (this.stage === 'rescue' && !this.busy) {
      const m = this.rig.board.matches === 0 ? { a: GUIDE[0], b: GUIDE[1] } : this.rig.board.bestMove();
      if (m) void this.trySwap(m.a, m.b, 'auto');
    } else if (this.stage === 'roll') void this.doRoll();
    else if (this.stage === 'attack' && !this.attack.flying && this.attack.ammo.visible) {
      // Pull straight away from the cab and let go.
      const cab = TARGETS[0];
      const d = Math.hypot(cab.x - REST.x, cab.y - REST.y);
      this.attack.pulling = true;
      this.attack.pull(REST.x - ((cab.x - REST.x) / d) * 110, REST.y - ((cab.y - REST.y) / d) * 110);
      void wait(0.35).then(() => {
        if (this.attack.pulling) void this.shoot('auto');
      });
    }
  }

  private placeHand(dt: number): void {
    const h = this.hand;
    if (!h) return;
    let target: Pos2;
    if (h.kind === 'tap') target = h.at();
    else {
      h.t = (h.t + dt / 1.3) % 1;
      const a = h.a();
      const b = h.b();
      const k = ease.inOutCubic(Math.min(1, Math.max(0, (h.t - 0.2) / 0.5)));
      target = { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) };
      if (h.t < dt / 1.3) this.ui.tapHandOnce();
    }
    if (this.handGlide < 1) {
      this.handGlide = Math.min(1, this.handGlide + dt / 0.4);
      const k = ease.outCubic(this.handGlide);
      target = { x: lerp(window.innerWidth * 0.86, target.x, k), y: lerp(window.innerHeight * 0.92, target.y, k) };
    }
    this.ui.placeHand(target.x, target.y);
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

    if (this.stage === 'rescue') {
      this.rig.update(dt);
      this.view.update(dt);
      this.director.setTension(this.rig.tension);
      const out = this.rig.sand.drained - this.drained;
      this.drained = this.rig.sand.drained;
      this.drainRate += (out / Math.max(dt, 1e-3) - this.drainRate) * (1 - Math.exp(-dt * 4));
      this.sfx.rubble.set(Math.min(1, this.rig.pourRate() / 260 + this.drainRate / 420), dt);
      this.laughIn -= dt;
      if (this.laughIn <= 0) {
        this.laughIn = 4.5;
        if (this.rig.pourRate() > 1) this.laugh();
      }
    } else if (this.stage === 'payoff') {
      this.rig.update(dt);
      this.view.update(dt);
      this.sfx.rubble.set(Math.min(1, this.drainRate / 420), dt);
    } else this.sfx.rubble.set(0, dt);
    if (this.stage === 'roll') this.rollView.update(dt, this.time);
    if (this.stage === 'attack') {
      this.attack.update(dt);
      if (this.attack.pulling) this.sfx.stretch(dt, this.attack.stretch);
    }

    // Mary's tag rides along with her cab.
    if (this.stage === 'rescue') {
      this.scene.toScreen(this.scene.rescue, 352, 112, this.pt);
      this.hud.placeTag(this.pt.x, this.pt.y, true);
    } else if (this.stage === 'attack' && !this.ended) {
      this.scene.toScreen(this.scene.attack, this.attack.cab.x + 34, this.attack.cab.y - 16, this.pt);
      this.hud.placeTag(this.pt.x, this.pt.y, this.attack.cab.y < 300);
    } else this.hud.placeTag(0, 0, false);

    if (this.cfg.autoplay && !this.ended) this.autoplay(dt);
    if (this.director.phase !== 'endcard') this.sfx.heartbeat(dt, this.director.tension);
    this.placeHand(dt);
    this.scene.update(dt);
    this.fx.update(dt);
    this.app.renderer.render(this.app.stage);
  }

  private autoplay(dt: number): void {
    this.autoT += dt;
    const phase = this.director.phase;
    const gap = this.stage === 'rescue' ? 1.4 : this.stage === 'roll' ? 0.9 : 1.1;
    if (this.autoT < gap || this.busy || (this.stage === 'roll' && this.rolling) || this.attack.flying || phase === 'ghost') return;
    if (this.stage === 'payoff') return;
    this.autoT = 0;
    this.director.touch();
    this.autoMove();
  }

  /** Test hook: lets the automated tests read state and find things on screen. */
  get debug() {
    return {
      phase: this.director.phase,
      events: this.director.events,
      stage: this.stage,
      busy: this.busy,
      ended: this.ended,
      dice: this.dice,
      misses: this.misses,
      canSwap: (a: Pos, b: Pos) => this.rig.board.canSwap(a, b),
      tension: this.rig.tension,
      peak: this.rig.peak,
      drained: this.rig.sand.drained,
      grains: this.rig.sand.alive,
      board: this.rig.board.show(),
      guide: GUIDE,
      next: () => this.rig.board.bestMove(),
      cellScreen: (r: number, c: number) => this.cellScreen({ r, c }),
      cellPx: () => CELL * this.scene.rescue.scale.x,
      rollScreen: () => (this.scene.toScreen(this.scene.roll, 195, 616, this.pt), { ...this.pt }),
      pouchScreen: () => (this.scene.toScreen(this.scene.attack, REST.x, REST.y, this.pt), { ...this.pt }),
      attackScale: () => this.scene.attack.scale.x,
      boardBottom: BOARD.y + BOARD_H,
    };
  }
}
