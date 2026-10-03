// The game's own HTML on top of the shared kit UI: the pig king, the ball counter and the "+3 balls" offer.
import './theme.css';

export type Mood = 'happy' | 'wow' | 'meh' | 'worried' | 'sad';

/** An original pig king: crown, moustache, royal collar. Each mood is a group the CSS shows or hides. */
export const KING = `
<svg viewBox="0 0 140 140" aria-hidden="true">
  <path d="M30 128c6-22 22-32 40-32s34 10 40 32z" fill="#7a34e0" stroke="#2a1066" stroke-width="5" stroke-linejoin="round"/>
  <path d="M46 110l24-12 24 12-24 14z" fill="#ff2f4a" stroke="#2a1066" stroke-width="4" stroke-linejoin="round"/>
  <path d="M27 40l-3-24 22 13zM113 40l3-24-22 13z" fill="#ff9db4" stroke="#2a1066" stroke-width="5" stroke-linejoin="round"/>
  <circle cx="70" cy="66" r="40" fill="#ffb3c4" stroke="#2a1066" stroke-width="5"/>
  <circle cx="44" cy="78" r="7" fill="#ff7f9f" opacity=".7"/><circle cx="96" cy="78" r="7" fill="#ff7f9f" opacity=".7"/>
  <path d="M42 22l8-16 12 12 8-14 8 14 12-12 8 16-4 14H46z" fill="#ffc23a" stroke="#2a1066" stroke-width="5" stroke-linejoin="round"/>
  <circle cx="70" cy="26" r="4.5" fill="#ff2f4a"/><circle cx="54" cy="29" r="3.5" fill="#2f8bff"/><circle cx="86" cy="29" r="3.5" fill="#2f8bff"/>
  <g class="k-eyes">
    <ellipse cx="55" cy="58" rx="8" ry="10" fill="#fff" stroke="#2a1066" stroke-width="3.5"/><ellipse cx="85" cy="58" rx="8" ry="10" fill="#fff" stroke="#2a1066" stroke-width="3.5"/>
    <circle class="k-pupil" cx="56" cy="60" r="4.2" fill="#2a1066"/><circle class="k-pupil" cx="84" cy="60" r="4.2" fill="#2a1066"/>
  </g>
  <g class="k-brows k-worried"><path d="M45 44l16 6M95 44l-16 6" stroke="#2a1066" stroke-width="4.5" stroke-linecap="round"/></g>
  <g class="k-brows k-meh"><path d="M46 47h15M79 47h15" stroke="#2a1066" stroke-width="4.5" stroke-linecap="round"/></g>
  <ellipse cx="70" cy="78" rx="15" ry="11" fill="#ff8fab" stroke="#2a1066" stroke-width="4"/>
  <ellipse cx="64" cy="78" rx="2.8" ry="4" fill="#2a1066"/><ellipse cx="76" cy="78" rx="2.8" ry="4" fill="#2a1066"/>
  <path d="M70 90c-8-3-18-2-24 6 8 0 16-1 24-4 8 3 16 4 24 4-6-8-16-9-24-6z" fill="#8b4a24" stroke="#2a1066" stroke-width="3" stroke-linejoin="round"/>
  <path class="k-mouth k-happy" d="M58 98q12 10 24 0" fill="none" stroke="#2a1066" stroke-width="4.5" stroke-linecap="round"/>
  <ellipse class="k-mouth k-wow" cx="70" cy="100" rx="6" ry="7" fill="#7a1033" stroke="#2a1066" stroke-width="3.5"/>
  <path class="k-mouth k-meh" d="M60 100h20" stroke="#2a1066" stroke-width="4.5" stroke-linecap="round"/>
  <path class="k-mouth k-sad" d="M58 103q12-9 24 0" fill="none" stroke="#2a1066" stroke-width="4.5" stroke-linecap="round"/>
  <path class="k-sweat" d="M106 40c4 6 6 10 3 13s-8 0-7-4z" fill="#8fd8ff" stroke="#2a1066" stroke-width="2.5"/>
</svg>`;

const BALL = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="#ff2b3d" stroke="#2a1066" stroke-width="3.5"/><path d="M4 21l5-4 5 4 5-4 5 4 5-4 5 4 3-2" fill="none" stroke="#ffd23a" stroke-width="4.5" stroke-linejoin="round"/><ellipse cx="14" cy="11" rx="5" ry="3" fill="#fff" opacity=".55"/></svg>';
const GIANT = BALL.replace('#ff2b3d', '#ffc23a').replace('#ffd23a', '#ff2b3d');

export class Hud {
  private king: HTMLElement;
  private balls: HTMLElement;
  private ballsN: HTMLElement;
  private offer: HTMLElement;
  private moodTimer = 0;

  constructor(root: HTMLElement) {
    const extra = document.createElement('div');
    extra.className = 'cc-hud';
    extra.innerHTML = `
      <div class="king mood-happy">${KING}</div>
      <div class="balls"><span class="balls-ico">${BALL}</span><b>×0</b></div>
      <div class="offer" hidden>
        <div class="offer-title outlined">OUT OF BALLS!</div>
        <div class="offer-row"><span>${BALL}</span><span>${BALL}</span><span>${BALL}</span><b class="outlined">+3</b></div>
        <div class="offer-sub"></div>
      </div>`;
    // Under the kit's end card, so the card still covers everything when it shows.
    root.insertBefore(extra, root.querySelector('.endcard'));
    this.king = extra.querySelector('.king')!;
    this.balls = extra.querySelector('.balls')!;
    this.ballsN = this.balls.querySelector('b')!;
    this.offer = extra.querySelector('.offer')!;
    // The pig king also presides over the end card.
    const logo = root.querySelector('.ec-logo');
    if (logo) {
      const k = document.createElement('div');
      k.className = 'ec-king';
      k.innerHTML = KING;
      logo.prepend(k);
    }
  }

  mood(m: Mood, ms = 0): void {
    window.clearTimeout(this.moodTimer);
    this.king.className = `king mood-${m}`;
    void this.king.offsetWidth;
    this.king.classList.add('bump');
    if (ms) this.moodTimer = window.setTimeout(() => this.mood('happy'), ms);
  }

  setBalls(n: number, pop = false): void {
    this.ballsN.textContent = `×${n}`;
    this.balls.classList.toggle('low', n <= 2);
    this.balls.classList.toggle('empty', n === 0);
    if (pop) {
      this.balls.classList.remove('pop');
      void this.balls.offsetWidth;
      this.balls.classList.add('pop');
    }
  }

  giantLoaded(on: boolean): void {
    this.balls.querySelector('.balls-ico')!.innerHTML = on ? GIANT : BALL;
    this.balls.classList.toggle('giant', on);
    if (on) this.ballsN.textContent = '×1';
  }

  showOffer(left: number, onTap: () => void): void {
    this.offer.querySelector('.offer-sub')!.textContent = left === 1 ? 'Just 1 jar left!' : `Only ${left} jars left!`;
    this.offer.hidden = false;
    this.offer.addEventListener('click', onTap);
    this.balls.hidden = true;
  }

  hideOffer(): void {
    this.offer.hidden = true;
  }

  hide(): void {
    this.hideOffer();
    this.balls.hidden = true;
    this.king.hidden = true;
  }
}
