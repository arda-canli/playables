// The two meta stages: rolling the dice, and the vault truck with nine safes.
import { Container, Graphics, Sprite, Text, type TextStyleOptions } from 'pixi.js';
import { ease, lerp, tween, wait } from '@kit/tween';
import { DIE_FACES, type Art, type DieFace } from './art';
import type { Fx, FxTextures } from './fx';
import type { Loot } from './logic';

export const FONT = '"Lilita One", "Arial Rounded MT Bold", Impact, sans-serif';

export const label = (text: string, size: number, fill: string, stroke = '#2a0f6b', extra: TextStyleOptions = {}) => {
  const t = new Text({
    text,
    style: { fontFamily: FONT, fontSize: size, fill, stroke: { color: stroke, width: size * 0.18, join: 'round' }, dropShadow: { color: '#12052e', alpha: 0.55, distance: size * 0.08, angle: Math.PI / 2, blur: 0 }, align: 'center', ...extra },
  });
  t.anchor.set(0.5);
  return t;
};

// ------------------------------------------------------------------ dice

export class RollView {
  readonly root = new Container();
  readonly width = 600;
  readonly height = 760;
  readonly button = new Container();
  private dice: Sprite[] = [];
  private shadows: Graphics[] = [];
  private title: Text;
  private rolling = false;
  private time = 0;
  rolled = false;

  constructor(private art: Art, fxTex: FxTextures, private fx: Fx) {
    const pad = new Graphics();
    // A pink felt pad with a white border, seen a little from above.
    pad.roundRect(-250, -300, 500, 380, 46).fill({ color: 0x12052e, alpha: 0.45 });
    pad.roundRect(-250, -312, 500, 380, 46).fill(0xffe3f1);
    pad.roundRect(-232, -294, 464, 344, 36).fill(0xff5fa8);
    pad.roundRect(-214, -276, 428, 308, 28).fill(0xff7dbb);
    pad.roundRect(-214, -276, 428, 30, 14).fill({ color: 0xffffff, alpha: 0.18 });
    this.title = label('ROLL THE DICE!', 54, '#ffffff');
    this.title.position.set(0, -370);
    this.root.addChild(pad, this.title);
    for (let i = 0; i < 2; i++) {
      const sh = new Graphics().ellipse(0, 0, 62, 18).fill({ color: 0x5a0a3a, alpha: 0.45 });
      const d = new Sprite(art.dice[i ? 'jackpot' : 'cash']);
      d.anchor.set(0.5);
      d.width = d.height = 150;
      this.shadows.push(sh);
      this.dice.push(d);
      this.root.addChild(sh, d);
    }
    this.placeDice(0);


    const glow = new Sprite(fxTex.glow);
    glow.anchor.set(0.5);
    glow.tint = 0xff4060;
    glow.blendMode = 'add';
    glow.scale.set(3.2);
    glow.alpha = 0.5;
    const btn = new Sprite(art.roll);
    btn.anchor.set(0.5);
    btn.width = btn.height = 230;
    const txt = label('ROLL', 70, '#ffffff', '#6a0012');
    txt.y = -6;
    const badge = new Graphics().roundRect(-44, -28, 88, 56, 28).fill(0x2fc14f).stroke({ color: 0xffffff, width: 6 });
    badge.position.set(92, -78);
    const bt = label('x2', 38, '#ffffff', '#0b5a24');
    bt.position.copyFrom(badge.position);
    this.button.addChild(glow, btn, txt, badge, bt);
    this.button.position.set(0, 240);
    this.root.addChild(this.button);
  }

  private placeDice(k: number): void {
    this.dice.forEach((d, i) => {
      d.position.set(i ? 95 : -95, -130 + k);
      this.shadows[i].position.set(d.x, -60);
    });
  }

  /** Board units of the button, for hit tests and the hand. */
  hitButton(x: number, y: number): boolean {
    return !this.rolling && !this.rolled && Math.hypot(x - this.button.x, y - this.button.y) < 135;
  }

  async enter(): Promise<void> {
    this.root.visible = true;
    this.root.alpha = 0;
    await tween({ dur: 0.45, ease: ease.outBack, update: (k) => ((this.root.alpha = Math.min(1, k * 1.5)), this.button.scale.set(0.4 + 0.6 * k)) });
  }

  /** The dice tumble across the pad and land on the heist mask, twice. */
  async roll(sfx: { press(): void; dice(d: number): void }): Promise<void> {
    if (this.rolling || this.rolled) return;
    this.rolling = true;
    sfx.press();
    await tween({ dur: 0.12, ease: ease.yoyo, update: (k) => this.button.scale.set(1 - 0.12 * k) });
    const dur = 1.35;
    sfx.dice(dur);
    const starts = [
      { x: -170, y: 60 },
      { x: 170, y: 40 },
    ];
    const ends = [
      { x: -95, y: -130 },
      { x: 95, y: -130 },
    ];
    let swapIn = [0, 0];
    await tween({
      dur,
      ease: ease.linear,
      update: (_k, t) => {
        this.dice.forEach((d, i) => {
          const e = ease.outCubic(t);
          // Three bounces that shrink as the dice settle.
          const hop = Math.abs(Math.sin(t * Math.PI * 3.2)) * 160 * Math.pow(1 - t, 1.6);
          d.x = lerp(starts[i].x, ends[i].x, e);
          d.y = lerp(starts[i].y, ends[i].y, e) - hop;
          d.rotation = (1 - e) * (i ? -9 : 9);
          const k = 1 + 0.25 * (hop / 160);
          d.width = d.height = 150 * k;
          this.shadows[i].position.set(d.x, ends[i].y + 70);
          this.shadows[i].scale.set(1 - hop / 400);
          swapIn[i] -= 1 / 60;
          if (t < 0.92 && swapIn[i] <= 0) {
            swapIn[i] = 0.05 + t * 0.12;
            d.texture = this.art.dice[DIE_FACES[(Math.random() * DIE_FACES.length) | 0] as DieFace];
          }
        });
      },
    });
    for (const d of this.dice) {
      d.texture = this.art.dice.heist;
      d.rotation = 0;
      this.fx.pulse(d.x, d.y, 0xfff2a8, 1.3);
      this.fx.sparkle(d.x, d.y, 16, 0xfff2a8, 200);
    }
    await tween({ dur: 0.35, ease: ease.outElastic, update: (k) => this.dice.forEach((d) => (d.width = d.height = 150 * (1.3 - 0.3 * k))) });
    swapIn = [0, 0];
    this.rolling = false;
    this.rolled = true;
  }

  async leave(): Promise<void> {
    await tween({ dur: 0.35, ease: ease.inBack, update: (k) => ((this.root.alpha = 1 - k), (this.root.y = -200 * k)) });
    this.root.visible = false;
  }

  update(dt: number): void {
    this.time += dt;
    if (!this.rolling && !this.rolled) this.button.scale.set(1 + 0.05 * Math.sin(this.time * 7));
    this.title.scale.set(1 + 0.03 * Math.sin(this.time * 4));
  }
}

// ------------------------------------------------------------------ the vault truck

interface SafeView {
  root: Container;
  door: Container;
  spokes: Sprite;
  inside: Container;
  glow: Sprite;
  open: boolean;
  x: number;
  y: number;
}

export const SAFE = 170;
const GAP = 18;

export class VaultView {
  readonly root = new Container();
  readonly width = 680;
  readonly height = 940;
  readonly safes: SafeView[] = [];
  private time = 0;
  private lights: Graphics[] = [];

  constructor(private art: Art, fxTex: FxTextures, private fx: Fx) {
    const g = new Graphics();
    const W = 640;
    // Truck body seen from behind, back doors open
    g.roundRect(-W / 2 - 10, -360, W + 20, 760, 40).fill({ color: 0x0b0326, alpha: 0.5 });
    g.roundRect(-W / 2, -380, W, 750, 36).fill(0x4659c4);
    g.roundRect(-W / 2, -380, W, 750, 36).stroke({ color: 0x1b2466, width: 8 });
    g.roundRect(-W / 2 + 10, -372, W - 20, 18, 9).fill({ color: 0xffffff, alpha: 0.18 });
    g.roundRect(-W / 2 + 26, -350, W - 52, 620, 22).fill(0x111745);
    g.roundRect(-W / 2 + 26, -350, W - 52, 620, 22).stroke({ color: 0x2a3590, width: 6 });
    // Roof light strip
    g.roundRect(-160, -346, 320, 10, 5).fill({ color: 0xbfe6ff, alpha: 0.65 });
    // Money sacks and cash at the bottom of the cargo bay
    for (const [x, w] of [[-230, 120], [-90, 130], [60, 120], [200, 110]]) {
      g.ellipse(x, 228, w / 2, 40).fill(0xe8d3a8);
      g.ellipse(x, 220, w / 2 - 10, 28).fill(0xf5e6c4);
      g.roundRect(x - 14, 180, 28, 16, 6).fill(0xb08a50);
    }
    for (const x of [-160, -20, 130, 250]) {
      g.roundRect(x - 34, 236, 68, 26, 6).fill(0x1ea04f);
      g.roundRect(x - 34, 228, 68, 22, 6).fill(0x38d06a);
    }
    // Bumper, lights and the plate
    g.roundRect(-W / 2 - 16, 330, W + 32, 70, 22).fill(0x2b3378);
    g.roundRect(-W / 2 - 16, 330, W + 32, 14, 7).fill({ color: 0xffffff, alpha: 0.15 });
    g.roundRect(-70, 342, 140, 46, 8).fill(0xf2e6c8).stroke({ color: 0x6b5a30, width: 4 });
    this.root.addChild(g);
    for (const sx of [-1, 1]) {
      const l = new Graphics().roundRect(-55, -16, 110, 32, 14).fill(0xff2d3d);
      l.position.set(sx * 220, 300);
      const lg = new Sprite(fxTex.glow);
      lg.anchor.set(0.5);
      lg.tint = 0xff2040;
      lg.blendMode = 'add';
      lg.scale.set(2.2, 1);
      lg.position.copyFrom(l.position);
      this.lights.push(l);
      this.root.addChild(lg, l);
    }
    const plate = label('BANK 2026', 28, '#3a3020', '#f2e6c8', { dropShadow: false });
    plate.position.set(0, 366);
    const title = label('PICK 3 SAFES!', 58, '#ffffff');
    title.position.set(0, -430);
    this.root.addChild(plate, title);

    for (let i = 0; i < 9; i++) {
      const x = ((i % 3) - 1) * (SAFE + GAP);
      const y = (Math.floor(i / 3) - 1) * (SAFE + GAP) - 70;
      const root = new Container();
      root.position.set(x, y);
      const glow = new Sprite(fxTex.glow);
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      glow.scale.set(2.3);
      glow.alpha = 0;
      const back = new Sprite(art.safeOpen);
      back.anchor.set(0.5);
      back.width = back.height = SAFE;
      const inside = new Container();
      inside.visible = false;
      const door = new Container();
      const closed = new Sprite(art.safe);
      closed.anchor.set(0.5);
      closed.width = closed.height = SAFE;
      const spokes = new Sprite(art.spokes);
      spokes.anchor.set(0.5);
      spokes.width = spokes.height = SAFE * 0.58;
      spokes.y = -2;
      door.addChild(closed, spokes);
      root.addChild(glow, back, inside, door);
      this.root.addChild(root);
      this.safes.push({ root, door, spokes, inside, glow, open: false, x, y });
    }
  }

  safeAt(x: number, y: number): number {
    return this.safes.findIndex((s) => Math.abs(x - s.x) < SAFE / 2 + GAP / 2 && Math.abs(y - s.y) < SAFE / 2 + GAP / 2);
  }

  async enter(): Promise<void> {
    this.root.visible = true;
    await tween({ dur: 0.55, ease: ease.outBack, update: (k) => ((this.root.y = 900 * (1 - k)), (this.root.alpha = 1)) });
  }

  /** The handle spins, the door swings open and the loot pops out. */
  async open(i: number, loot: Loot, big: boolean, sfx: { safeOpen(): void }): Promise<void> {
    const s = this.safes[i];
    if (s.open) return;
    s.open = true;
    sfx.safeOpen();
    await tween({ dur: 0.28, ease: ease.linear, update: (_k, t) => ((s.root.rotation = Math.sin(t * 40) * 0.05 * (1 - t)), (s.spokes.rotation = t * Math.PI * 1.5)) });
    s.root.rotation = 0;
    this.fill(s, loot);
    s.inside.visible = true;
    s.inside.scale.set(0.2);
    const good = loot.kind !== 'noluck';
    s.glow.tint = loot.kind === 'jackpot' ? 0xffd23f : loot.kind === 'noluck' ? 0x5060a0 : 0x6dff9a;
    await tween({
      dur: 0.24,
      ease: ease.inQuad,
      update: (k) => {
        // The door swings towards the viewer: it narrows and slides to its hinge.
        s.door.scale.x = 1 - k;
        s.door.x = -SAFE * 0.5 * k;
        s.door.skew.y = -0.3 * k;
      },
    });
    s.door.visible = false;
    if (good) {
      this.fx.pulse(s.x, s.y, s.glow.tint, big ? 2 : 1.2);
      this.fx.sparkle(s.x, s.y, big ? 30 : 14, 0xfff2a8, big ? 260 : 160);
      this.fx.loot(s.x, s.y - 20, big ? 46 : 14, big ? 1.2 : 0.8, loot.kind === 'cash' ? 0.5 : 0.25);
    } else this.fx.smoke(s.x, s.y, 4, 50, 0x8890c0);
    void tween({ dur: 0.5, ease: ease.outCubic, update: (k) => (s.glow.alpha = (good ? 0.85 : 0.35) * k) });
    await tween({ dur: 0.45, ease: ease.outElastic, update: (k) => s.inside.scale.set(0.2 + 0.8 * k) });
  }

  private fill(s: SafeView, loot: Loot): void {
    s.inside.removeChildren();
    if (loot.kind === 'cash') {
      const c = new Sprite(this.art.cash);
      c.anchor.set(0.5);
      c.width = c.height = 120;
      c.y = -16;
      const t = label(loot.amount.toLocaleString('en-US'), 40, '#ffffff', '#0b5a24');
      t.y = 48;
      s.inside.addChild(c, t);
    } else if (loot.kind === 'jackpot') {
      const c = new Sprite(this.art.jackpot);
      c.anchor.set(0.5);
      c.width = c.height = 130;
      c.y = -18;
      const t = label('JACKPOT', 34, '#ffe066', '#7a3a00');
      t.y = 52;
      s.inside.addChild(c, t);
    } else if (loot.kind === 'mult') {
      const t = label(`×${loot.times}`, 92, '#ffe066', '#7a3a00');
      const sub = label('LOOT', 30, '#ffffff');
      sub.y = 52;
      s.inside.addChild(t, sub);
    } else {
      const t = label('NO\nLUCK', 46, '#ff4a5a', '#3a0010', { lineHeight: 44 });
      s.inside.addChild(t);
    }
  }

  /** Board units of a safe's centre. */
  center(i: number): { x: number; y: number } {
    return { x: this.safes[i].x, y: this.safes[i].y };
  }

  /** The jackpot that was there all along pulses so nobody misses it. */
  highlight(i: number): void {
    const s = this.safes[i];
    void tween({ dur: 0.6, ease: ease.yoyo, update: (k) => s.root.scale.set(1 + 0.12 * k) });
  }

  update(dt: number): void {
    this.time += dt;
    for (const l of this.lights) l.alpha = 0.75 + 0.25 * Math.sin(this.time * 6);
    this.safes.forEach((s, i) => {
      if (!s.open) s.spokes.rotation = Math.sin(this.time * 1.5 + i) * 0.06;
      else if (s.glow.alpha > 0.5) s.glow.scale.set(2.3 + 0.15 * Math.sin(this.time * 5 + i));
    });
  }

  /** For the "it was right there" beat: closed safes open on their own, one after another. */
  async openRest(items: { i: number; loot: Loot }[], sfx: { safeOpen(): void }, onJackpot: (i: number) => void): Promise<void> {
    for (const it of items) {
      void this.open(it.i, it.loot, false, sfx).then(() => it.loot.kind === 'jackpot' && onJackpot(it.i));
      await wait(0.22);
    }
    await wait(0.8);
  }
}
