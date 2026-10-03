// The dice stage: a pink tray, three dice and the big red ROLL button. The dice always land on hammers.
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { ease, lerp, tween, wait } from '@kit/tween';
import type { Art } from './art';
import type { Fx } from './fx';

const FACES = ['coin', 'shield', 'question', 'jackpot', 'hammer'];
const DIE = 70;
const SLOTS = [
  { x: 120, y: 402, rot: -0.24 },
  { x: 196, y: 384, rot: 0.1 },
  { x: 272, y: 406, rot: 0.3 },
];
const FONT = "'Lilita One', 'Arial Rounded MT Bold', sans-serif";

export class RollView {
  readonly root = new Container();
  readonly button: Container;
  private dice: Sprite[] = [];
  private pressed = false;
  private glow: Sprite;

  constructor(private art: Art, private fx: Fx) {
    const tray = new Sprite(art.tray);
    tray.anchor.set(0.5);
    tray.position.set(195, 396);
    this.glow = new Sprite(art.glow);
    this.glow.anchor.set(0.5);
    this.glow.position.set(195, 396);
    this.glow.scale.set(4.2);
    this.glow.tint = 0xffd6f0;
    this.glow.alpha = 0.35;
    this.glow.blendMode = 'add';
    this.root.addChild(this.glow, tray);
    SLOTS.forEach((s, i) => {
      const d = new Sprite(art.faces[FACES[i]]);
      d.anchor.set(0.5);
      d.width = DIE;
      d.height = DIE * 1.06;
      d.position.set(s.x, s.y);
      d.rotation = s.rot;
      this.dice.push(d);
      this.root.addChild(d);
    });
    this.button = new Container();
    const btn = new Sprite(art.roll);
    btn.anchor.set(0.5, 0.45);
    const label = new Text({ text: 'ROLL', style: { fontFamily: FONT, fontSize: 38, fill: 0xffffff, stroke: { color: 0x5a0410, width: 7, join: 'round' }, dropShadow: { color: 0x2a1066, distance: 3, angle: Math.PI / 2, blur: 0, alpha: 0.6 } } });
    label.anchor.set(0.5);
    label.y = -6;
    const badge = new Graphics().circle(0, 0, 21).fill(0x16a94b).stroke({ width: 3, color: 0x0a6a2a });
    badge.position.set(52, -52);
    const x2 = new Text({ text: 'x2', style: { fontFamily: FONT, fontSize: 19, fill: 0xffffff } });
    x2.anchor.set(0.5);
    x2.position.copyFrom(badge.position);
    this.button.addChild(btn, label, badge, x2);
    this.button.position.set(195, 616);
    this.root.addChild(this.button);
  }

  /** Is this world point on the ROLL button? */
  hits(x: number, y: number): boolean {
    return Math.hypot(x - this.button.x, y - this.button.y) < 74;
  }

  /** Press, tumble, land: three hammers. Resolves when the last die has settled. */
  async roll(sfx: { press(): void; dice(d: number): void; clack(i: number): void }): Promise<void> {
    if (this.pressed) return;
    this.pressed = true;
    sfx.press();
    void tween({ dur: 0.22, ease: ease.yoyo, update: (k) => this.button.scale.set(1 - 0.12 * k, 1 - 0.18 * k) });
    sfx.dice(1.5);
    await Promise.all(
      this.dice.map(async (d, i) => {
        const s = SLOTS[i];
        const dur = 0.95 + i * 0.22;
        let swapIn = 0;
        let face = i;
        await tween({
          dur,
          ease: ease.linear,
          update: (_k, t) => {
            // A hop with two bounces, a fast spin that slows, and faces flickering until it lands.
            const hop = t < 0.55 ? Math.sin((t / 0.55) * Math.PI) * 110 : t < 0.8 ? Math.sin(((t - 0.55) / 0.25) * Math.PI) * 26 : Math.sin(((t - 0.8) / 0.2) * Math.PI) * 7;
            d.position.set(s.x + Math.sin(t * 9 + i) * 10 * (1 - t), s.y - hop);
            d.rotation = s.rot + (1 - ease.outCubic(t)) * (i % 2 ? -9 : 9);
            swapIn -= 1;
            if (swapIn <= 0 && t < 0.9) {
              swapIn = 2 + t * 10;
              face = (face + 1 + ((Math.random() * 3) | 0)) % 4;
              d.texture = this.art.faces[FACES[face]];
            }
          },
        });
        d.texture = this.art.faces.hammer;
        d.position.set(s.x, s.y);
        d.rotation = s.rot;
        sfx.clack(i);
        this.fx.glow(s.x, s.y, 0xffe066, 0.9, 0.5);
        this.fx.sparkle(s.x, s.y - 20, 8, 0xfff2a8, 110);
        void tween({ dur: 0.3, ease: ease.outBack, update: (k) => d.scale.set((DIE / 100) * lerp(1.25, 1, k), ((DIE * 1.06) / 106) * lerp(0.8, 1, k)) });
      }),
    );
    await wait(0.25);
  }

  update(dt: number, time: number): void {
    if (!this.pressed) this.button.scale.set(1 + 0.05 * Math.sin(time * 6));
    this.glow.alpha = 0.3 + 0.08 * Math.sin(time * 2);
    void dt;
  }
}
