// The game's own HTML on top of the kit's: the dice meter, Mary's name tag and the coin counter.
import './theme.css';

const DIE =
  '<svg viewBox="0 0 100 106" aria-hidden="true"><rect x="4" y="10" width="92" height="92" rx="20" fill="#b9a6ff"/><rect x="2" y="2" width="92" height="92" rx="20" fill="#fff" stroke="#5b3fd1" stroke-width="5"/><g transform="translate(15 15) scale(0.66)"><path d="M46 40 L58 40 L62 94 L42 94 Z" fill="#b0723a" stroke="#3a1240" stroke-width="5" stroke-linejoin="round"/><rect x="14" y="14" width="72" height="32" rx="8" fill="#5a6170" stroke="#3a1240" stroke-width="5"/><path d="M62 2 L44 30 L56 30 L46 52 L72 22 L60 22 L70 2 Z" fill="#ffe14d" stroke="#a36a00" stroke-width="3.5" stroke-linejoin="round"/></g></svg>';
const COIN = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#ffc93c" stroke="#8a5600" stroke-width="2.5"/><circle cx="16" cy="16" r="9" fill="none" stroke="#d38c00" stroke-width="2"/><ellipse cx="11" cy="11" rx="4" ry="2.6" fill="#fff" opacity=".8"/></svg>';

export class Hud {
  private dice: HTMLElement;
  private slots: HTMLElement[];
  private tag: HTMLElement;
  private coins: HTMLElement;
  private coinN: HTMLElement;
  private tagW = 0;
  private tagH = 0;

  constructor(root: HTMLElement) {
    const el = document.createElement('div');
    el.className = 'rg-hud';
    el.innerHTML = `
      <div class="rg-dice"><b>DICE</b><span class="rg-slot">${DIE}</span><span class="rg-slot">${DIE}</span><span class="rg-slot">${DIE}</span></div>
      <div class="rg-tag">MARY</div>
      <div class="rg-coins" hidden>${COIN}<b>0</b></div>`;
    root.insertBefore(el, root.querySelector('.endcard'));
    this.dice = el.querySelector('.rg-dice')!;
    this.slots = [...el.querySelectorAll<HTMLElement>('.rg-slot')];
    this.tag = el.querySelector('.rg-tag')!;
    this.coins = el.querySelector('.rg-coins')!;
    this.coinN = this.coins.querySelector('b')!;
    // The real game's end-card promises, under the button.
    const inner = root.querySelector('.ec-inner');
    if (inner) {
      const chips = document.createElement('div');
      chips.className = 'ec-chips';
      chips.innerHTML = '<span>NO ADS</span><span>NO WI-FI</span>';
      inner.appendChild(chips);
    }
  }

  /** Screen position of slot i, for the die that flies into it. */
  slotAt(i: number): { x: number; y: number } {
    const r = this.slots[Math.min(i, 2)].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /** A die flies from where the match was into its slot, then the slot pops. */
  flyDie(from: { x: number; y: number }, i: number, done: () => void): void {
    const to = this.slotAt(i);
    const d = document.createElement('div');
    d.className = 'rg-fly';
    d.innerHTML = DIE;
    this.dice.parentElement!.appendChild(d);
    const anim = d.animate(
      [
        { transform: `translate(${from.x}px, ${from.y}px) translate(-50%, -50%) scale(0.6) rotate(0deg)` },
        { transform: `translate(${(from.x + to.x) / 2}px, ${Math.min(from.y, to.y) - 60}px) translate(-50%, -50%) scale(1.3) rotate(200deg)`, offset: 0.45 },
        { transform: `translate(${to.x}px, ${to.y}px) translate(-50%, -50%) scale(0.8) rotate(360deg)` },
      ],
      { duration: 620, easing: 'cubic-bezier(0.4, 0, 0.6, 1)' },
    );
    anim.onfinish = () => {
      d.remove();
      done();
    };
  }

  setDice(n: number): void {
    this.slots.forEach((s, i) => {
      const on = i < n;
      if (on && !s.classList.contains('on')) {
        s.classList.add('on');
        s.classList.remove('pop');
        void s.offsetWidth;
        s.classList.add('pop');
      }
    });
    this.dice.classList.toggle('full', n >= 3);
  }

  placeTag(x: number, y: number, show: boolean): void {
    this.tag.hidden = !show;
    if (!show) return;
    if (!this.tagW) {
      this.tagW = this.tag.offsetWidth;
      this.tagH = this.tag.offsetHeight;
    }
    this.tag.style.transform = `translate(${Math.round(x - this.tagW / 2)}px, ${Math.round(y - this.tagH / 2)}px)`;
  }

  setCoins(n: number): void {
    this.coins.hidden = false;
    this.coinN.textContent = n.toLocaleString('en-US');
  }

  hideMeter(): void {
    this.dice.hidden = true;
  }

  hide(): void {
    this.dice.hidden = true;
    this.tag.hidden = true;
    this.coins.hidden = true;
  }
}
