// Match-3 Game: ties the match-3 rules, the dice, the vault, the HUD and the ad director together.
import { Application, Container, Graphics, Sprite } from 'pixi.js';
import { AudioKit, MusicLoop, SONG_SUNNY } from '@kit/audio';
import { Director } from '@kit/director';
import { notifyEnd, openStore } from '@kit/network';
import { ease, kill, lerp, tween, updateTweens, wait } from '@kit/tween';
import { UI } from '@kit/ui';
import './theme.css';
import { makeArt, type Art } from './art';
import { BoardView, CELL } from './board';
import { HEADLINES, type Config } from './config';
import { Fx, makeFxTextures, type FxTextures } from './fx';
import { RollView, VaultView, label } from './heist';
import { Hud } from './hud';
import { HEIST_PICKS, Heist, LEVEL, Logic, isBooster, type Cleared, type GoalId, type Kind, type Move, type Pos } from './logic';
import { Scene } from './scene';
import { Sfx } from './sfx';

const GHOST = Symbol('ghost');
const PRAISE = ['NICE!', 'SWEET!', 'AWESOME!', 'AMAZING!', 'INCREDIBLE!'];
/** Safes the hint and the idle autoplay suggest, in order: middle first, then corners. */
const SAFE_ORDER = [4, 0, 8, 2, 6, 1, 3, 5, 7];

type Stage = 'board' | 'roll' | 'vault';
type HandMode = { kind: 'tap'; at: () => Pos2 } | { kind: 'swipe'; a: () => Pos2; b: () => Pos2; t: number };
interface Pos2 {
  x: number;
  y: number;
}

const same = (a: Pos, b: Pos) => a.r === b.r && a.c === b.c;
const adjacent = (a: Pos, b: Pos) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;

export class Game {
  private app = new Application();
  private art!: Art;
  private fxTex!: FxTextures;
  private scene!: Scene;
  private fx!: Fx;
  private ui: UI;
  private hud: Hud;
  private audio = new AudioKit();
  private sfx = new Sfx(this.audio);
  private music = new MusicLoop(this.audio, SONG_SUNNY);
  private director: Director;
  private logic = new Logic(LEVEL);
  private heist: Heist;

  private board!: BoardView;
  private rollView!: RollView;
  private vault!: VaultView;
  private rescueBadge: Container | null = null;

  private stage: Stage = 'board';
  private busy = false;
  private queued: Move | null = null;
  /** 0: build the TNT, 1: fire it, 2: free play. */
  private guideStep = 0;
  private ended = false;
  private hurry = false;
  private musicOn = false;
  private streak = 0;
  private time = 0;
  private autoTimer = 0;
  private selected: Pos | null = null;
  private drag: { x: number; y: number; cell: Pos; moved: boolean } | null = null;
  private hand: HandMode | null = null;
  /** 0 → 1 while the hand glides in from the corner. */
  private handGlide = 1;
  private pt = { x: 0, y: 0 };
  private loot = { shown: 0, target: 0 };
  private outcome: 'win' | 'heist' | 'moves' | null = null;
  private lastCta = -1;

  constructor(private canvas: HTMLCanvasElement, private uiRoot: HTMLElement, private cfg: Config) {
    this.ui = new UI(uiRoot, { goalIcon: '', logo: ['MATCH-3', 'GAME'] });
    this.hud = new Hud(uiRoot);
    this.heist = new Heist(cfg.ending);
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
      background: 0x1a0a4a,
      preference: 'webgl',
      autoStart: false,
      sharedTicker: false,
    });
    this.app.ticker.stop();
    this.art = makeArt();
    this.fxTex = makeFxTextures();
    this.scene = new Scene(this.fxTex);
    this.fx = new Fx(this.fxTex, this.art);
    this.scene.fxLayer.addChild(this.fx.layer);
    this.app.stage.addChild(this.scene.stage);

    this.board = new BoardView(this.art, this.fxTex, this.fx, this.logic.rows, this.logic.cols);
    this.board.build(this.logic);
    this.scene.board.addChild(this.board.root);
    this.rollView = new RollView(this.art, this.fxTex, this.fx);
    this.scene.roll.addChild(this.rollView.root);
    this.vault = new VaultView(this.art, this.fxTex, this.fx);
    this.scene.vault.addChild(this.vault.root);

    // The pig sits on top of the end card's logo.
    const pig = document.createElement('img');
    pig.className = 'ec-pig';
    pig.alt = '';
    pig.src = (this.art.hero.source.resource as HTMLCanvasElement).toDataURL();
    this.uiRoot.querySelector('.ec-logo')?.prepend(pig);

    this.bindInput();
    this.ui.setHeadline(HEADLINES[this.cfg.headline]);
    this.hud.setGoal('leaf', this.logic.goals.leaf);
    this.hud.setGoal('crate', this.logic.goals.crate);
    this.hud.setMoves(this.logic.movesLeft);
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
    window.addEventListener('pointercancel', () => (this.drag = null));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    for (const type of ['pointerup', 'touchend', 'click'] as const) window.addEventListener(type, unlock, { passive: true });
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!w || !h) return;
    this.app.renderer.resize(w, h);
    const s = this.scene;
    s.resize(w, h);
    const k = s.fit(s.board, this.board.width + 56, this.board.height + 56);
    s.fit(s.roll, this.rollView.width, this.rollView.height, s.metaArea);
    s.fit(s.vault, this.vault.width, this.vault.height, s.metaArea);
    // Headline sits just above the board; toasts land on the board's upper third.
    const boardTop = s.board.y - (this.board.height / 2 + 22) * k;
    const headTop = s.portrait ? Math.max(s.u * 30, boardTop - s.u * 11.5) : s.u * 2.5;
    this.uiRoot.style.setProperty('--head-top', `${headTop}px`);
    this.placeToast();
  }

  /** Toasts sit on the board's upper third, and on the truck's bumper in the vault so they never cover a safe. */
  private placeToast(): void {
    const s = this.scene;
    const y = this.stage === 'vault' ? s.vault.y + 300 * s.vault.scale.y : s.board.y - this.board.height * 0.18 * s.board.scale.y;
    this.uiRoot.style.setProperty('--toast-top', `${Math.round(y)}px`);
  }

  // ---------------------------------------------------------------- flow

  start(): void {
    this.director.start();
    void this.board.intro().then(() => (this.cfg.botchedOpening ? this.botchedOpening() : this.beginGuide()));
  }

  /** The ad tries a swap that makes nothing. Two seconds that teach "swipe" and "you need a line". */
  private async botchedOpening(): Promise<void> {
    if (this.ended) return;
    this.director.setPhase('ghost');
    const w = (s: number) => wait(this.hurry ? s * 0.3 : s, GHOST);
    const [a, b] = LEVEL.botch;
    await w(0.35);
    this.hand = { kind: 'swipe', a: () => this.cellScreen(a), b: () => this.cellScreen(b), t: 0 };
    this.ui.showHand('still');
    await w(0.75);
    this.sfx.swap();
    await this.board.swap(this.logic, a, b, false);
    this.sfx.nope();
    this.hideHint();
    this.director.log('ghost_bad_move', { a, b });
    const p = this.cellScreen({ r: a.r, c: a.c });
    this.ui.floater('✗', p.x + CELL * this.scene.board.scale.x * 0.5, p.y, '#ff5a6e');
    this.ui.toast('No match!', 'bad', 1100);
    await w(0.9);
    void this.beginGuide();
  }

  private beginGuide(): void {
    if (this.ended) return;
    this.director.setPhase('guide');
    this.guideStep = 0;
    this.ui.toast('YOUR TURN!', 'good', 900);
    this.showHint();
  }

  // ---------------------------------------------------------------- input

  private onDown(x: number, y: number): void {
    this.director.touch();
    if (this.rescueBadge) return this.cta('rescue');
    if (this.ended) return;
    const phase = this.director.phase;
    if (phase === 'ghost' || phase === 'boot') {
      this.hurry = true;
      return;
    }
    if (this.stage === 'roll') {
      this.scene.toLocal(this.scene.roll, x, y, this.pt);
      if (this.rollView.hitButton(this.pt.x, this.pt.y)) void this.doRoll();
      return;
    }
    if (this.stage === 'vault') {
      this.scene.toLocal(this.scene.vault, x, y, this.pt);
      const i = this.vault.safeAt(this.pt.x, this.pt.y);
      if (i >= 0) void this.pickSafe(i);
      return;
    }
    this.scene.toLocal(this.scene.board, x, y, this.pt);
    const cell = this.board.cellAt(this.pt.x, this.pt.y);
    this.drag = cell ? { x, y, cell, moved: false } : null;
    if (!cell) this.deselect();
  }

  private onMove(x: number, y: number): void {
    const d = this.drag;
    if (!d || d.moved) return;
    const dx = x - d.x;
    const dy = y - d.y;
    // A third of a tile is enough to read the direction; less than that is a tap.
    if (Math.hypot(dx, dy) < CELL * this.scene.board.scale.x * 0.32) return;
    d.moved = true;
    const b = Math.abs(dx) > Math.abs(dy) ? { r: d.cell.r, c: d.cell.c + Math.sign(dx) } : { r: d.cell.r + Math.sign(dy), c: d.cell.c };
    this.deselect();
    this.tryMove({ a: d.cell, b });
  }

  private onUp(): void {
    const d = this.drag;
    this.drag = null;
    if (!d || d.moved || this.ended || this.stage !== 'board') return;
    const cell = d.cell;
    // Tap a booster to fire it; tap two neighbours to swap them.
    if (isBooster(this.logic.at(cell)?.kind)) {
      this.deselect();
      this.tryMove({ a: cell });
    } else if (this.selected && adjacent(this.selected, cell)) {
      const a = this.selected;
      this.deselect();
      this.tryMove({ a, b: cell });
    } else if (this.selected && same(this.selected, cell)) this.deselect();
    else {
      this.selected = cell;
      this.board.select(this.logic, cell);
      this.sfx.goalTick(0);
    }
  }

  private deselect(): void {
    if (!this.selected) return;
    this.selected = null;
    this.board.select(this.logic, null);
  }

  // ---------------------------------------------------------------- moves

  /** The move the hand shows next. During the guide it is scripted, after that it is the logic's best move. */
  private hintMove(): Move | null {
    if (this.guideStep === 0) return { a: LEVEL.guide[0], b: LEVEL.guide[1] };
    if (this.guideStep === 1) {
      const t = this.logic.find('tnt');
      if (t) return { a: t };
    }
    return this.logic.bestMove();
  }

  private allowedInGuide(m: Move): boolean {
    if (this.director.phase !== 'guide') return true;
    if (this.guideStep === 0) {
      const [g0, g1] = LEVEL.guide;
      return !!m.b && ((same(m.a, g0) && same(m.b, g1)) || (same(m.a, g1) && same(m.b, g0)));
    }
    return isBooster(this.logic.at(m.a)?.kind) || (!!m.b && isBooster(this.logic.at(m.b)?.kind));
  }

  private tryMove(m: Move, by: 'user' | 'auto' = 'user'): void {
    if (this.ended || this.stage !== 'board') return;
    if (this.busy) {
      this.queued = m;
      return;
    }
    if (!this.allowedInGuide(m)) return void this.refuse(m, true);
    if (m.b ? !this.logic.canSwap(m.a, m.b) : !isBooster(this.logic.at(m.a)?.kind)) return void this.refuse(m, false);
    void this.execute(m, by);
  }

  /** A swap the rules (or the guide) do not take: the tiles bump and slide back. */
  private async refuse(m: Move, guide: boolean): Promise<void> {
    if (!m.b || !this.logic.canTry(m.a, m.b)) return;
    this.busy = true;
    this.sfx.swap();
    await this.board.swap(this.logic, m.a, m.b, false);
    this.sfx.nope();
    this.busy = false;
    if (guide) this.showHint();
    this.flushQueue();
  }

  private async execute(m: Move, by: 'user' | 'auto'): Promise<void> {
    this.busy = true;
    this.hideHint();
    this.deselect();
    if (m.b) {
      this.sfx.swap();
      await this.board.swap(this.logic, m.a, m.b, true);
    }
    const leavesBefore = this.logic.goals.leaf;
    const res = this.logic.play(m);
    this.hud.setMoves(this.logic.movesLeft);
    this.director.log(m.b ? 'swap' : 'fire', { by, a: m.a, b: m.b, waves: res.waves.length, movesLeft: this.logic.movesLeft });
    const guided = this.director.phase === 'guide';
    if (guided) this.guideStep++;
    if (guided && this.guideStep >= 2) this.director.setPhase('free');

    let cleared = 0;
    for (let i = 0; i < res.waves.length; i++) {
      const wv = res.waves[i];
      const matched = wv.cleared.filter((c) => c.depth === 0 && !isBooster(c.kind) && c.kind !== 'crate').length;
      if (matched) this.sfx.match(i, matched);
      if (wv.made.length) void wait(0.2).then(() => this.sfx.made());
      cleared += wv.cleared.length;
      await this.board.wave(wv, { cleared: (c, x, y) => this.onCleared(c, x, y), blast: (k, x, y, big) => this.onBlast(k, x, y, big) });
      if (i >= 1) this.praise(i >= 2 ? 3 : 1);
      if (wv.shuffled) await this.board.reshuffle(this.logic);
    }
    if (guided && this.guideStep === 1) {
      this.ui.toast('TNT!', 'good', 900);
    } else if (cleared >= 8 || leavesBefore - this.logic.goals.leaf >= 5) this.praise(2);

    if (this.logic.movesLeft <= 3 && !this.logic.goalsDone) {
      this.director.setTension(0.5);
      this.hud.worried(true);
    }
    this.busy = false;
    if (this.logic.goalsDone) return void this.levelComplete();
    if (this.logic.outOfMoves) return void this.outOfMoves();
    if (this.director.phase === 'guide') this.showHint();
    this.flushQueue();
  }

  private flushQueue(): void {
    const m = this.queued;
    this.queued = null;
    if (m) this.tryMove(m);
  }

  private praise(boost: number): void {
    const word = PRAISE[Math.min(this.streak + boost - 1, PRAISE.length - 1)];
    this.streak++;
    const p = this.boardScreen(0, -this.board.height * 0.18);
    this.ui.floater(word, p.x, p.y);
  }

  private onCleared(c: Cleared, x: number, y: number): void {
    if (c.kind === 'leaf' || c.kind === 'crate') this.flyToGoal(c.kind, c.kind, x, y);
    if (c.kind === 'crate') this.sfx.crate();
  }

  private onBlast(kind: Kind, x: number, y: number, big: boolean): void {
    if (kind === 'tnt') {
      this.fx.pulse(x, y, 0xffc060, big ? 3.4 : 2.6);
      this.fx.smoke(x, y, big ? 18 : 12, CELL * 3, 0xffd9a0);
      this.fx.sparkle(x, y, 24, 0xfff2a8, 380);
      this.fx.shards(x, y, 0xff6a2a, 14);
      this.scene.shake = big ? 1.3 : 1;
      this.sfx.boom(big);
    } else {
      const v = 2600;
      if (kind === 'rocketH' || big) (this.fx.streak(x, y, v, 0), this.fx.streak(x, y, -v, 0));
      if (kind === 'rocketV' || big) (this.fx.streak(x, y, 0, v), this.fx.streak(x, y, 0, -v));
      this.fx.pulse(x, y, 0x9fd8ff, 1.2);
      this.scene.shake = Math.max(this.scene.shake, 0.4);
      this.sfx.zip();
    }
  }

  /** A cleared goal tile flies up to its counter; the counter only ticks when it lands. */
  private flyToGoal(goal: GoalId, kind: Kind, x: number, y: number): void {
    const from = this.boardScreen(x, y);
    const to = this.hud.goalPoint(goal);
    const s = new Sprite(this.art.tiles[kind]);
    s.anchor.set(0.5);
    const size = CELL * this.scene.board.scale.x * 0.9;
    s.width = s.height = size;
    s.position.set(from.x, from.y);
    this.scene.overlay.addChild(s);
    const mid = { x: lerp(from.x, to.x, 0.3) + (Math.random() - 0.5) * 80, y: Math.min(from.y, to.y) - 40 };
    const end = Math.max(16, size * 0.45);
    void tween({
      dur: 0.55 + Math.random() * 0.2,
      ease: ease.inOutCubic,
      update: (k) => {
        const a = lerp(lerp(from.x, mid.x, k), lerp(mid.x, to.x, k), k);
        const b = lerp(lerp(from.y, mid.y, k), lerp(mid.y, to.y, k), k);
        s.position.set(a, b);
        s.width = s.height = lerp(size * 1.1, end, k);
        s.rotation = k * 0.8;
      },
    }).then(() => {
      s.destroy();
      const n = Math.max(this.logic.goals[goal], this.hud.shownGoal(goal) - 1);
      this.hud.setGoal(goal, n, true);
      this.sfx.goalTick(n);
      if (n === 0 && this.hud.shownGoal(goal) === 0) {
        this.sfx.goalDone();
        this.ui.floater('✓', to.x, to.y + 30, '#7dff9e');
      }
    });
  }

  // ---------------------------------------------------------------- hints and the ad playing itself

  private cellScreen(p: Pos): Pos2 {
    const c = this.board.center(p);
    return this.boardScreen(c.x, c.y);
  }

  private boardScreen(x: number, y: number): Pos2 {
    const out = { x: 0, y: 0 };
    this.scene.toScreen(this.scene.board, x, y, out);
    return out;
  }

  private nextSafe(): number {
    return SAFE_ORDER.find((i) => !this.vault.safes[i].open) ?? -1;
  }

  private showHint(): void {
    if (this.ended || this.busy) return;
    const glide = !this.ui.handVisible;
    if (this.stage === 'roll') {
      if (this.rollView.rolled) return;
      this.hand = { kind: 'tap', at: () => this.stageScreen(this.scene.roll, this.rollView.button.x, this.rollView.button.y) };
    } else if (this.stage === 'vault') {
      const i = this.nextSafe();
      if (i < 0 || this.heist.done) return;
      this.hand = { kind: 'tap', at: () => this.stageScreen(this.scene.vault, this.vault.center(i).x, this.vault.center(i).y) };
    } else {
      const m = this.hintMove();
      if (!m) return;
      this.board.setHint(this.logic, m.b ? [m.a, m.b] : [m.a]);
      const a = m.a;
      const b = m.b;
      this.hand = b ? { kind: 'swipe', a: () => this.cellScreen(a), b: () => this.cellScreen(b), t: 0 } : { kind: 'tap', at: () => this.cellScreen(a) };
    }
    this.ui.showHand(this.hand.kind === 'tap' ? 'loop' : 'still');
    if (glide) this.handGlide = 0;
  }

  private stageScreen(c: Container, x: number, y: number): Pos2 {
    const out = { x: 0, y: 0 };
    this.scene.toScreen(c, x, y, out);
    return out;
  }

  private hideHint(): void {
    this.hand = null;
    this.ui.hideHand();
    this.board.resetWiggle();
  }

  /** The viewer is not touching: the ad makes the next move itself. */
  private autoMove(): void {
    if (this.ended || this.busy) return;
    if (this.stage === 'roll') return void this.doRoll();
    if (this.stage === 'vault') return void this.pickSafe(this.nextSafe());
    const m = this.hintMove();
    if (m) this.tryMove(m, 'auto');
  }

  // ---------------------------------------------------------------- level won: the dice

  private async levelComplete(): Promise<void> {
    this.director.setPhase('ending');
    this.director.setTension(0);
    this.hud.worried(false);
    this.hideHint();
    this.director.log('level_complete', { moves: this.logic.movesMade, movesLeft: this.logic.movesLeft });
    await wait(0.35);
    this.sfx.levelWin();
    this.ui.toast('LEVEL COMPLETE!', 'good', 1500);
    const half = this.board.width / 2;
    for (let i = 0; i < 2; i++) void wait(i * 0.25).then(() => (this.fx.confetti(-half, this.board.height / 2, 40, 1.1), this.fx.confetti(half, this.board.height / 2, 40, 1.1)));

    // The reward the level paid for flies into the dice meter.
    const die = new Sprite(this.art.dice.heist);
    die.anchor.set(0.5);
    const from = this.boardScreen(0, 0);
    const to = this.hud.dicePoint();
    die.position.set(from.x, from.y);
    this.scene.overlay.addChild(die);
    await tween({ dur: 0.4, ease: ease.outBack, update: (k) => (die.width = die.height = 140 * k) });
    this.ui.floater('+1 ROLL', from.x, from.y - 90, '#7dff9e');
    await wait(0.35);
    await tween({ dur: 0.55, ease: ease.inOutCubic, update: (k) => (die.position.set(lerp(from.x, to.x, k), lerp(from.y, to.y, k) - Math.sin(k * Math.PI) * 120), (die.width = die.height = lerp(140, 30, k)), (die.rotation = k * 6)) });
    die.destroy();
    this.hud.fillDice();
    this.sfx.goalDone();

    await this.board.clearAway();
    await tween({ dur: 0.3, ease: ease.inCubic, update: (k) => (this.scene.board.alpha = 1 - k) });
    this.scene.board.visible = false;
    this.stage = 'roll';
    this.scene.active = this.scene.roll;
    this.scene.roll.visible = true;
    // Each meta stage carries its own title in the canvas.
    this.ui.setHeadline('');
    await this.rollView.enter();
    this.director.setPhase('squeeze');
    this.director.autoMoved();
    this.showHint();
  }

  private async doRoll(): Promise<void> {
    if (this.stage !== 'roll' || this.busy || this.rollView.rolled) return;
    this.busy = true;
    this.hideHint();
    this.director.log('roll');
    await this.rollView.roll(this.sfx);
    this.sfx.siren();
    this.ui.toast('HEIST TIME!', 'good', 1500);
    this.fx.confetti(0, -130, 50, 1);
    this.scene.shake = 0.5;
    await wait(1.1);
    await this.rollView.leave();
    this.scene.roll.visible = false;
    this.stage = 'vault';
    this.scene.active = this.scene.vault;
    this.scene.vault.visible = true;
    this.placeToast();
    this.hud.showLoot();
    this.hud.setLoot(0);
    this.hud.setPicks(HEIST_PICKS);
    await this.vault.enter();
    this.busy = false;
    this.director.autoMoved();
    this.showHint();
  }

  // ---------------------------------------------------------------- the heist

  private async pickSafe(i: number): Promise<void> {
    if (this.stage !== 'vault' || this.busy || this.heist.done || i < 0 || this.vault.safes[i].open) return;
    this.busy = true;
    this.hideHint();
    const last = this.heist.picks.length === HEIST_PICKS - 1;
    if (last) {
      // The last safe: hold the moment. Drumroll, heartbeat, the safe trembles.
      this.ui.toast('Last pick…', 'info', 1100);
      this.director.setTension(0.95);
      this.sfx.drumroll(1.2);
      const s = this.vault.safes[i];
      await tween({ dur: 1.2, ease: ease.linear, update: (_k, t) => (s.root.rotation = Math.sin(t * 70) * 0.05 * t) });
      s.root.rotation = 0;
    }
    const loot = this.heist.pick(i)!;
    this.director.log('pick', { safe: i, loot: loot.kind, n: this.heist.picks.length });
    await this.vault.open(i, loot, loot.kind === 'jackpot', this.sfx);
    this.director.setTension(0);
    const c = this.vault.center(i);
    const p = this.stageScreen(this.scene.vault, c.x, c.y - 60);
    if (loot.kind === 'cash') {
      this.sfx.cash();
      this.ui.floater(`+${loot.amount.toLocaleString('en-US')}`, p.x, p.y, '#7dff9e');
    } else if (loot.kind === 'mult') {
      this.sfx.mult();
      this.ui.toast(`LOOT ×${loot.times}!`, 'good', 1100);
    } else if (loot.kind === 'jackpot') {
      this.sfx.jackpot();
      this.ui.toast('JACKPOT!!', 'good', 1800);
      this.scene.shake = 1;
      for (let k = 0; k < 3; k++) void wait(k * 0.3).then(() => this.fx.confetti(c.x, c.y, 50, 1.3));
    } else {
      this.sfx.sadTrombone();
      this.ui.toast('NO LUCK…', 'bad', 1400);
    }
    this.loot.target = this.heist.total;
    this.hud.setPicks(HEIST_PICKS - this.heist.picks.length);
    this.busy = false;
    if (this.heist.done) void this.endHeist();
  }

  private async endHeist(): Promise<void> {
    this.ended = true;
    this.director.setPhase('ending');
    if (this.cfg.ending === 'win') {
      this.outcome = 'win';
      await wait(2.2);
      return this.finish('win');
    }
    this.outcome = 'heist';
    await wait(1.0);
    this.ui.toast("Let's see what you missed…", 'info', 1300);
    await wait(0.6);
    const rest = this.heist.revealRest();
    await this.vault.openRest(rest, this.sfx, (i) => {
      this.vault.highlight(i);
      this.sfx.regret();
      const c = this.vault.center(i);
      const p = this.stageScreen(this.scene.vault, c.x, c.y - 70);
      this.ui.floater('+50,000', p.x, p.y, '#ffe066');
    });
    this.director.log('near_miss', { missed: this.heist.missed });
    this.ui.toast('The JACKPOT was right there!', 'bad', 2200);
    this.ui.setCta('ROLL AGAIN', true);
    await wait(2.1);
    this.finish('fail');
  }

  // ---------------------------------------------------------------- out of moves

  /** The goals are not done and the moves are gone: the "+5 moves" the real genre sells becomes the install. */
  private async outOfMoves(): Promise<void> {
    this.ended = true;
    this.outcome = 'moves';
    this.hideHint();
    this.director.setPhase('ending');
    await wait(0.3);
    this.director.setTension(1);
    this.sfx.outOfMoves();
    this.ui.flash();
    this.ui.toast('OUT OF MOVES!', 'bad', 1500);
    void tween({ dur: 0.6, ease: ease.outCubic, update: (k) => this.scene.setGloom(k) });
    const left = this.logic.goals.leaf + this.logic.goals.crate;
    this.director.log('stuck', { goalsLeft: left });
    await wait(1.3);

    const b = new Container();
    const glow = new Sprite(this.fxTex.glow);
    glow.anchor.set(0.5);
    glow.tint = 0x5dff9d;
    glow.blendMode = 'add';
    glow.scale.set(4.5, 2.4);
    const pill = new Graphics().roundRect(-170, -62, 340, 124, 62).fill(0x1a7a3a).roundRect(-170, -70, 340, 124, 62).fill(0x34d058).stroke({ color: 0xffffff, width: 8 });
    const t = label('+5 MOVES', 66, '#ffffff', '#0b5a24');
    t.y = -8;
    b.addChild(glow, pill, t);
    b.scale.set(0);
    this.scene.board.addChild(b);
    this.rescueBadge = b;
    this.sfx.rescue();
    void tween({ dur: 0.5, ease: ease.outBack, update: (k) => b.scale.set(k) });
    this.ui.toast(`Only ${left} left to go!`, 'info', 2200);
    this.ui.setCta('GET +5 MOVES', true);
    this.director.log('rescue_offer');
    this.hand = { kind: 'tap', at: () => this.boardScreen(0, 0) };
    this.ui.showHand('loop');
    this.handGlide = 0;
    await wait(4.2);
    this.finish('fail');
  }

  // ---------------------------------------------------------------- end

  private finish(kind: 'win' | 'fail' | 'idle'): void {
    if (this.director.phase === 'endcard') return;
    this.ended = true;
    kill(GHOST);
    this.hideHint();
    this.director.setPhase('endcard');
    this.director.log('end', {
      outcome: kind,
      reason: this.outcome,
      seconds: Math.round(this.director.time * 10) / 10,
      moves: this.logic.movesMade,
      loot: this.heist.total,
      firstTouch: this.director.firstTouchAt,
    });
    this.director.stop();
    notifyEnd();
    this.hud.hide();
    const copy =
      kind === 'win'
        ? { title: 'YOU ROBBED THE BANK!', sub: `${this.heist.total.toLocaleString('en-US')} coins in one heist. Your town is waiting.`, cta: 'PLAY FREE' }
        : kind === 'fail' && this.outcome === 'moves'
          ? { title: 'SO CLOSE!', sub: 'Five more moves and the dice were yours.', cta: 'GET +5 MOVES' }
          : kind === 'fail'
            ? { title: 'SO CLOSE!', sub: 'The jackpot was one safe away. Your next roll could be the one.', cta: 'ROLL AGAIN' }
            : { title: 'YOUR TURN!', sub: 'Match tiles, roll the dice, rob the bank!', cta: 'PLAY NOW' };
    this.ui.showEndCard(kind, copy);
  }

  private cta(where: 'button' | 'endcard' | 'rescue'): void {
    // One tap on the "+5" offer also lands on the end card it brings up: open the store once.
    if (this.time - this.lastCta < 0.6) return;
    this.lastCta = this.time;
    this.director.log('cta', { where, phase: this.director.phase, seconds: Math.round(this.director.time * 10) / 10 });
    openStore(this.cfg.storeUrl);
    if (this.rescueBadge && this.director.phase !== 'endcard') this.finish('fail');
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

    const phase = this.director.phase;
    if (this.cfg.autoplay && !this.ended && !this.busy && (phase === 'guide' || phase === 'free' || phase === 'squeeze')) {
      this.autoTimer += dt;
      if (this.autoTimer > 0.6) {
        this.autoTimer = 0;
        this.director.touch();
        this.autoMove();
      }
    }

    // The coin counter rolls towards its target, ticking like a slot machine.
    if (this.loot.shown < this.loot.target) {
      const step = Math.max(37, (this.loot.target - this.loot.shown) * dt * 3.2);
      this.loot.shown = Math.min(this.loot.target, this.loot.shown + step);
      this.hud.setLoot(this.loot.shown, this.loot.shown === this.loot.target);
      this.sfx.counting(dt);
    }

    this.board.update(dt);
    if (this.stage === 'roll') this.rollView.update(dt);
    if (this.stage === 'vault') this.vault.update(dt);
    if (this.rescueBadge) this.rescueBadge.scale.set(1 + 0.06 * Math.sin(this.time * 8));
    if (phase !== 'endcard') this.sfx.heartbeat(dt, this.director.tension);

    this.placeHand(dt);
    this.scene.update(dt);
    this.fx.update(dt);
    this.app.renderer.render(this.app.stage);
  }

  /** Moves the hint hand: glides in from the corner, then taps in place or loops a swipe from a to b. */
  private placeHand(dt: number): void {
    const h = this.hand;
    if (!h) return;
    let target: Pos2;
    if (h.kind === 'tap') target = h.at();
    else {
      h.t = (h.t + dt / 1.35) % 1;
      const a = h.a();
      const b = h.b();
      const k = ease.inOutCubic(Math.min(1, Math.max(0, (h.t - 0.22) / 0.45)));
      target = { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) };
      if (h.t < dt / 1.35) this.ui.tapHandOnce();
    }
    if (this.handGlide < 1) {
      this.handGlide = Math.min(1, this.handGlide + dt / 0.4);
      const k = ease.outCubic(this.handGlide);
      target = { x: lerp(window.innerWidth * 0.86, target.x, k), y: lerp(window.innerHeight * 0.92, target.y, k) };
    }
    this.ui.placeHand(target.x, target.y);
  }

  /** Test hook: lets the automated tests read state and find things on screen. */
  get debug() {
    return {
      phase: this.director.phase,
      events: this.director.events,
      stage: this.stage,
      busy: this.busy,
      ended: this.ended,
      guideStep: this.guideStep,
      movesLeft: this.logic.movesLeft,
      goals: { ...this.logic.goals },
      picks: this.heist.picks.length,
      rescue: !!this.rescueBadge,
      guide: LEVEL.guide,
      botch: LEVEL.botch,
      board: this.logic.show(),
      next: () => this.hintMove(),
      cellScreen: (r: number, c: number) => this.cellScreen({ r, c }),
      cellPx: () => CELL * this.scene.board.scale.x,
      rollScreen: () => this.stageScreen(this.scene.roll, this.rollView.button.x, this.rollView.button.y),
      safeScreen: (i: number) => this.stageScreen(this.scene.vault, this.vault.center(i).x, this.vault.center(i).y),
      nextSafe: () => this.nextSafe(),
      canSwap: (a: Pos, b: Pos) => this.logic.canSwap(a, b),
      canTry: (a: Pos, b: Pos) => this.logic.canTry(a, b),
      /** Lets the touch test reach the out-of-moves rescue without wasting moves by hand. */
      forceMoves: (n: number) => ((this.logic.movesLeft = n), this.hud.setMoves(n)),
    };
  }
}
