// The HTML layer shared by every playable: HUD, hint hand, tension banner, toasts and the end card.
// It knows nothing about the game's renderer; the game hands it screen positions.
import './ui.css';

export type EndKind = 'win' | 'fail' | 'idle';

export interface UIOptions {
  /** Inline SVG shown in the goal pill. */
  goalIcon: string;
  /** The logo on the end card, one entry per line. */
  logo: [string, string];
}

const q = <T extends HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

const STAR = '<svg viewBox="0 0 48 46"><path d="M24 2l6.6 14.2 15.4 1.9-11.4 10.7 3 15.3L24 36.4 10.4 44.1l3-15.3L2 18.1l15.4-1.9z"/></svg>';
const HAND =
  '<svg viewBox="0 0 100 124" aria-hidden="true"><path d="M38 8c7 0 12 5 12 12v34l22 5c10 2 16 10 15 20l-3 22c-1 9-9 15-18 15H44c-8 0-14-4-18-10L10 79c-3-6 0-12 5-14s10 0 13 5l-2-50c0-7 5-12 12-12z" fill="#fff" stroke="#1b2350" stroke-width="7" stroke-linejoin="round"/><path d="M50 58v16M64 62v14M77 67v12" stroke="#c9d0e3" stroke-width="4" stroke-linecap="round" fill="none"/></svg>';

function template(o: UIOptions): string {
  return `
    <div class="vignette"></div>
    <div class="flash"></div>
    <div class="goal">${o.goalIcon}<span class="goal-n"></span></div>
    <div class="headline"></div>
    <div class="banner" hidden></div>
    <div class="toast" hidden></div>
    <div class="floaters"></div>
    <div class="hand" hidden><div class="hand-ring"></div>${HAND}</div>
    <button class="cta" type="button">PLAY NOW</button>
    <div class="endcard" hidden>
      <div class="ec-rays"></div>
      <div class="ec-inner">
        <div class="ec-logo"><span>${o.logo[0]}</span><span>${o.logo[1]}</span></div>
        <div class="ec-stars" hidden>${STAR}${STAR}${STAR}</div>
        <div class="ec-title"></div>
        <div class="ec-sub"></div>
        <button class="ec-cta" type="button">PLAY NOW</button>
        <button class="ec-replay" type="button" hidden>↻ replay</button>
      </div>
    </div>`;
}

export class UI {
  private goal: HTMLElement;
  private goalN: HTMLElement;
  private headline: HTMLElement;
  private banner: HTMLElement;
  private toastEl: HTMLElement;
  private floaters: HTMLElement;
  private hand: HTMLElement;
  private vignette: HTMLElement;
  private flashEl: HTMLElement;
  private cta: HTMLButtonElement;
  private endcard: HTMLElement;
  private toastTimer = 0;
  private bannerText = '';
  private bannerW = 0;
  private bannerH = 0;
  private handW = 0;
  private handH = 0;

  constructor(private root: HTMLElement, options: UIOptions) {
    root.innerHTML = template(options);
    this.goal = q(root, '.goal');
    this.goalN = q(root, '.goal-n');
    this.headline = q(root, '.headline');
    this.banner = q(root, '.banner');
    this.toastEl = q(root, '.toast');
    this.floaters = q(root, '.floaters');
    this.hand = q(root, '.hand');
    this.vignette = q(root, '.vignette');
    this.flashEl = q(root, '.flash');
    this.cta = q<HTMLButtonElement>(root, '.cta');
    this.endcard = q(root, '.endcard');
    this.headline.classList.add('outlined');
    this.toastEl.classList.add('outlined');
    q(this.root, '.ec-title').classList.add('outlined');
    window.addEventListener('resize', () => {
      this.handW = 0;
      this.bannerW = 0;
      if (!this.endcard.hidden) this.fitLogo();
    });
  }

  onCta(cb: (where: 'button' | 'endcard') => void): void {
    this.cta.addEventListener('click', (e) => {
      e.stopPropagation();
      cb('button');
    });
    this.endcard.addEventListener('click', () => cb('endcard'));
  }

  onReplay(cb: () => void): void {
    const b = q<HTMLButtonElement>(this.root, '.ec-replay');
    b.hidden = false;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      cb();
    });
  }

  /** The persistent button can change its pitch mid-ad, e.g. "GET +1 BOTTLE". */
  setCta(text: string, urgent = false): void {
    this.cta.textContent = text;
    this.cta.classList.toggle('urgent', urgent);
    this.cta.hidden = false;
  }

  setHeadline(text: string): void {
    this.headline.textContent = text;
  }

  setGoal(done: number, goal: number, pop = false): void {
    this.goalN.textContent = `${done}/${goal}`;
    if (pop) restart(this.goal, 'pop');
  }

  toast(text: string, kind: 'good' | 'bad' | 'info', ms = 1100): void {
    window.clearTimeout(this.toastTimer);
    const el = this.toastEl;
    el.textContent = text;
    el.className = `toast outlined ${kind}`;
    el.hidden = false;
    restart(el, '');
    this.toastTimer = window.setTimeout(() => {
      el.classList.add('out');
      this.toastTimer = window.setTimeout(() => (el.hidden = true), 260);
    }, ms);
  }

  /** level 1 = getting tight, 2 = one slot left */
  setBanner(text: string | null, level: 1 | 2 = 1): void {
    if (!text) {
      this.banner.hidden = true;
      this.bannerText = '';
      return;
    }
    if (text !== this.bannerText) {
      this.bannerText = text;
      this.banner.innerHTML = '';
      const s = document.createElement('span');
      s.textContent = text;
      this.banner.appendChild(s);
      this.bannerW = 0;
    }
    this.banner.classList.toggle('hot', level === 2);
    this.banner.hidden = false;
  }

  placeBanner(x: number, y: number): void {
    if (this.banner.hidden) return;
    if (!this.bannerW) {
      this.bannerW = this.banner.offsetWidth;
      this.bannerH = this.banner.offsetHeight;
    }
    this.banner.style.transform = `translate(${Math.round(x - this.bannerW / 2)}px, ${Math.round(y - this.bannerH)}px)`;
  }

  showHand(mode: 'loop' | 'still'): void {
    this.hand.hidden = false;
    this.hand.classList.toggle('tapping', mode === 'loop');
    this.hand.classList.remove('once');
  }

  tapHandOnce(): void {
    this.hand.classList.remove('tapping');
    restart(this.hand, 'once');
  }

  hideHand(): void {
    this.hand.hidden = true;
  }

  get handVisible(): boolean {
    return !this.hand.hidden;
  }

  /** x, y is where the fingertip should touch. */
  placeHand(x: number, y: number): void {
    if (this.hand.hidden) return;
    if (!this.handW) {
      this.handW = this.hand.offsetWidth;
      this.handH = this.hand.offsetHeight;
    }
    this.hand.style.transform = `translate(${(x - this.handW * 0.3).toFixed(1)}px, ${(y - this.handH * 0.02).toFixed(1)}px)`;
  }

  floater(text: string, x: number, y: number, color = '#ffe066'): void {
    const el = document.createElement('div');
    el.className = 'outlined';
    el.textContent = text;
    el.style.color = color;
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)`;
    this.floaters.appendChild(el);
    window.setTimeout(() => el.remove(), 1000);
  }

  setTension(t: number): void {
    this.vignette.style.opacity = t >= 1 ? '' : String(Math.max(0, (t - 0.45) * 0.9));
    this.vignette.classList.toggle('pulse', t >= 1);
  }

  flash(): void {
    restart(this.flashEl, 'go');
  }

  hideHud(): void {
    this.setBanner(null);
    this.hideHand();
    this.setTension(0);
    this.cta.hidden = true;
    this.headline.hidden = true;
  }

  showEndCard(kind: EndKind, o: { title: string; sub: string; cta: string; stars?: boolean }): void {
    this.hideHud();
    this.goal.hidden = true;
    this.toastEl.hidden = true;
    q(this.root, '.ec-title').textContent = o.title;
    q(this.root, '.ec-sub').textContent = o.sub;
    const ctaEl = q(this.root, '.ec-cta');
    ctaEl.textContent = o.cta;
    ctaEl.classList.toggle('long', o.cta.length > 10);
    q(this.root, '.ec-stars').hidden = !(o.stars ?? kind === 'win');
    q(this.root, '.ec-rays').hidden = kind === 'fail';
    this.endcard.hidden = false;
    this.fitLogo();
  }

  /** Long game names must never run off a narrow screen. */
  private fitLogo(): void {
    const logo = q(this.root, '.ec-logo');
    logo.style.fontSize = '';
    const max = this.root.clientWidth * 0.86;
    const w = logo.scrollWidth;
    if (w > max) logo.style.fontSize = `${(parseFloat(getComputedStyle(logo).fontSize) * max) / w}px`;
  }
}

function restart(el: HTMLElement, cls: string): void {
  if (cls) el.classList.remove(cls);
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  if (cls) el.classList.add(cls);
}
