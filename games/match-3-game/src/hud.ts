// The game's own HTML HUD on top of the kit's: hero badge, goals, moves and the dice meter on the board,
// then the banker's loot plate during the heist. HTML keeps the type crisp at any size.
import { hudImages } from './art';
import type { GoalId } from './logic';

const q = <T extends HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

export class Hud {
  readonly el: HTMLElement;
  private moves: HTMLElement;
  private movesBox: HTMLElement;
  private goals: Record<GoalId, HTMLElement>;
  private dice: HTMLElement;
  private loot: HTMLElement;
  private lootN: HTMLElement;
  private picks: HTMLElement;
  private hero: HTMLImageElement;
  private img = hudImages();
  private shown: Record<GoalId, number> = { leaf: 0, crate: 0 };

  constructor(root: HTMLElement) {
    const i = this.img;
    this.el = document.createElement('div');
    this.el.className = 'hh';
    this.el.innerHTML = `
      <div class="hh-board">
        <div class="hh-hero"><img alt="" src="${i.hero}"></div>
        <div class="hh-panel hh-goals"><span class="hh-tab">Goals</span>
          <div class="hh-goal" data-g="leaf"><img alt="" src="${i.leaf}"><b class="outlined"></b><i>✓</i></div>
          <div class="hh-goal" data-g="crate"><img alt="" src="${i.crate}"><b class="outlined"></b><i>✓</i></div>
        </div>
        <div class="hh-panel hh-moves"><span class="hh-tab">Moves</span><b class="outlined"></b></div>
        <div class="hh-dice"><img alt="" src="${i.die}"><span class="hh-pips"><em class="on"></em><em class="on"></em><em></em></span></div>
      </div>
      <div class="hh-loot" hidden>
        <div class="hh-hero hh-banker"><img alt="" src="${i.banker}"></div>
        <div class="hh-plate"><span class="hh-vault">Banker Bacon's Vault</span>
          <span class="hh-cash"><img alt="" src="${i.coin}"><b class="outlined">0</b></span>
          <span class="hh-picks outlined"></span>
        </div>
      </div>`;
    root.appendChild(this.el);
    this.hero = q<HTMLImageElement>(this.el, '.hh-board .hh-hero img');
    this.moves = q(this.el, '.hh-moves b');
    this.movesBox = q(this.el, '.hh-moves');
    this.goals = { leaf: q(this.el, '[data-g="leaf"]'), crate: q(this.el, '[data-g="crate"]') };
    this.dice = q(this.el, '.hh-dice');
    this.loot = q(this.el, '.hh-loot');
    this.lootN = q(this.el, '.hh-cash b');
    this.picks = q(this.el, '.hh-picks');
  }

  setMoves(n: number): void {
    this.moves.textContent = String(n);
    this.movesBox.classList.toggle('low', n <= 3);
    restart(this.movesBox, 'tick');
  }

  setGoal(g: GoalId, n: number, pop = false): void {
    this.shown[g] = n;
    const el = this.goals[g];
    q(el, 'b').textContent = String(n);
    el.classList.toggle('done', n <= 0);
    if (pop) restart(el, 'pop');
  }

  shownGoal(g: GoalId): number {
    return this.shown[g];
  }

  /** Screen position of a goal icon, where flying tiles land. */
  goalPoint(g: GoalId): { x: number; y: number } {
    const r = q(this.goals[g], 'img').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  dicePoint(): { x: number; y: number } {
    const r = this.dice.getBoundingClientRect();
    return { x: r.left + r.width * 0.3, y: r.top + r.height / 2 };
  }

  fillDice(): void {
    this.dice.querySelectorAll('em').forEach((e) => e.classList.add('on'));
    restart(this.dice, 'pop');
  }

  worried(on: boolean): void {
    this.hero.src = on ? this.img.heroWorried : this.img.hero;
  }

  showLoot(): void {
    q(this.el, '.hh-board').hidden = true;
    this.loot.hidden = false;
    restart(this.loot, 'in');
  }

  setLoot(n: number, pop = false): void {
    this.lootN.textContent = Math.round(n).toLocaleString('en-US');
    if (pop) restart(q(this.el, '.hh-cash'), 'pop');
  }

  setPicks(left: number): void {
    this.picks.textContent = left > 0 ? `${left} ${left === 1 ? 'PICK' : 'PICKS'} LEFT` : 'NO PICKS LEFT';
    restart(this.picks, 'pop');
  }

  hide(): void {
    this.el.hidden = true;
  }
}

function restart(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
