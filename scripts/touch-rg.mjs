// Plays Rescue Game with real touch events: a swipe that makes nothing, the guided swipe, a tap-tap swap,
// swipes fired while tiles are still moving, the ROLL button, a slingshot shot that misses, one that hits, and the CTA.
//   node scripts/touch-rg.mjs [query] [WxH]
import puppeteer from 'puppeteer-core';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [query = 'mute=1', size = '390x844'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const label = `rgtouch-${w > h ? 'land' : 'port'}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const page = await browser.newPage();
await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const problems = [];
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && problems.push('console: ' + m.text()));
// The CTA opens the store in a new tab. Count those calls instead, so the ad keeps focus for the rest of the test.
await page.evaluateOnNewDocument(() => {
  window.open = () => ((window.__opened = (window.__opened ?? 0) + 1), null);
});
await page.goto(`file://${resolve(root, 'dist/rescue-game/index.html')}?${query}&store=https://example.com/app`);

const dbg = (fn, ...args) => page.evaluate(fn, ...args);
const state = () => dbg(() => { const d = window.__game.debug; return { phase: d.phase, stage: d.stage, busy: d.busy, dice: d.dice, misses: d.misses, board: d.board.join('/') }; });
const cell = (r, c) => dbg((a) => window.__game.debug.cellScreen(a[0], a[1]), [r, c]);
const shot = (n) => page.screenshot({ path: resolve(root, 'shots', `${label}-${n}.png`) });
const waitFor = async (pred, ms = 8000) => { for (let t = 0; t < ms; t += 80) { const s = await state(); if (pred(s)) return s; await sleep(80); } return state(); };
async function swipe(a, b) {
  const p = await cell(a.r, a.c);
  const q = await cell(b.r, b.c);
  await page.touchscreen.touchStart(p.x, p.y);
  for (let i = 1; i <= 5; i++) {
    await page.touchscreen.touchMove(p.x + ((q.x - p.x) * i) / 5, p.y + ((q.y - p.y) * i) / 5);
    await sleep(16);
  }
  await page.touchscreen.touchEnd();
}

let s = await waitFor((x) => x.phase === 'guide', 6000);
if (s.phase !== 'guide') problems.push(`never reached the guided move (phase ${s.phase})`);
await shot('1-guide');

// 1. A swipe that makes nothing: the tiles bounce back, nothing is spent.
let bad = null;
for (let r = 0; r < 6 && !bad; r++) for (let c = 0; c < 6 && !bad; c++) if (!(await dbg((a) => window.__game.debug.canSwap(a[0], a[1]), [{ r, c }, { r, c: c + 1 }]))) bad = [{ r, c }, { r, c: c + 1 }];
const before = (await state()).board;
await swipe(bad[0], bad[1]);
await sleep(700);
s = await state();
if (s.board !== before || s.dice !== 0) problems.push('a swipe that makes nothing changed the board');

// 2. The guided swipe, as the hand shows it.
const [ga, gb] = await dbg(() => window.__game.debug.guide);
await swipe(gb, ga);
s = await waitFor((x) => x.dice === 1 && !x.busy, 3000);
if (s.dice !== 1) problems.push('the guided swipe did not make a match');
await sleep(500);
await shot('2-first-match');

// 3. Tap one tile, then its neighbour.
let m = await dbg(() => window.__game.debug.next());
let p = await cell(m.a.r, m.a.c);
let q = await cell(m.b.r, m.b.c);
await page.touchscreen.tap(p.x, p.y);
await sleep(120);
await page.touchscreen.tap(q.x, q.y);
s = await waitFor((x) => x.dice === 2 && !x.busy, 3000);
if (s.dice !== 2) problems.push('tap, tap on two neighbours did not swap');
await sleep(900);
await shot('3-draining');

// 4. Two swipes in a row while the first is still animating: only one may count.
m = await dbg(() => window.__game.debug.next());
await swipe(m.a, m.b);
await swipe(m.a, m.b);
s = await waitFor((x) => x.dice >= 3, 3000);
if (s.dice !== 3) problems.push(`rapid swipes gave ${s.dice} dice`);

// 5. ROLL.
s = await waitFor((x) => x.stage === 'roll', 5000);
await sleep(700);
await shot('4-roll');
const roll = await dbg(() => window.__game.debug.rollScreen());
await page.touchscreen.tap(roll.x, roll.y);
s = await waitFor((x) => x.stage === 'attack', 7000);
if (s.stage !== 'attack') problems.push('ROLL did not lead to the attack');
await sleep(1200);

// 6. A shot pulled sideways misses, and the attacker reloads.
const k = await dbg(() => window.__game.debug.attackScale());
const pouch = await dbg(() => window.__game.debug.pouchScreen());
await page.touchscreen.touchStart(pouch.x, pouch.y);
await page.touchscreen.touchMove(pouch.x + 60 * k, pouch.y);
await page.touchscreen.touchMove(pouch.x + 125 * k, pouch.y + 4 * k);
await page.touchscreen.touchEnd();
s = await waitFor((x) => x.misses === 1, 4000);
if (s.misses !== 1) problems.push('a sideways shot did not count as a miss');
await sleep(1100);

// 7. Pull straight back, away from the cab: a hit.
await page.touchscreen.touchStart(pouch.x, pouch.y);
for (let i = 1; i <= 6; i++) {
  await page.touchscreen.touchMove(pouch.x - (17 * k * i) / 6, pouch.y + (109 * k * i) / 6);
  await sleep(30);
}
await shot('5-aiming');
await page.touchscreen.touchEnd();
await sleep(1100);
await shot('6-hit');
s = await waitFor((x) => x.phase === 'endcard', 9000);
await sleep(1400);
await shot('7-end');
await page.touchscreen.tap(w / 2, h * 0.2);
await sleep(300);
const fin = await dbg(() => ({ events: window.__game.debug.events, opened: window.__opened ?? 0 }));
await browser.close();
const end = fin.events.find((e) => e.name === 'end')?.data;
if (end?.outcome !== 'win') problems.push(`expected a win, got ${end?.outcome}`);
if (!fin.events.some((e) => e.name === 'cta' && e.data?.where === 'endcard')) problems.push('tapping the end card did not fire the CTA');
if (fin.opened < 1) problems.push('the store was never opened');
console.log(`\n${label}: ${size}  end=${JSON.stringify(end)}`);
if (problems.length) {
  console.log('TOUCH FAILED\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('TOUCH OK');
