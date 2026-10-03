// Plays Match-3 Game with real touch events, the way a viewer would: a swipe the guide does not want, a swipe
// that makes nothing, swipes fired while a cascade is still falling, the dice, a safe tapped twice, and
// (second run) the out-of-moves rescue tapped as the install button.
//   node scripts/touch-m3.mjs [query] [WxH] [label] [mode: heist|moves]
import puppeteer from 'puppeteer-core';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [query = 'mute=1', size = '390x844', label = 'm3touch', mode = 'heist'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const page = await browser.newPage();
await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const problems = [];
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && problems.push('console: ' + m.text()));
// The install opens the store in a new tab, which would leave this tab in the background with no frames.
await page.evaluateOnNewDocument(() => (window.open = (url) => ((window.__opened = url), null)));
await page.goto(`file://${resolve(root, 'dist/match-3-game/index.html')}?${query}`);

const dbg = (fn, ...args) => page.evaluate(fn, ...args);
const state = () => dbg(() => { const d = window.__game.debug; return { phase: d.phase, stage: d.stage, busy: d.busy, ended: d.ended, guideStep: d.guideStep, movesLeft: d.movesLeft, goals: d.goals, picks: d.picks, rescue: d.rescue, next: d.next() }; });
const shot = (n) => page.screenshot({ path: resolve(root, 'shots', `${label}-${n}.png`) });
const cell = (p) => dbg((r, c) => window.__game.debug.cellScreen(r, c), p.r, p.c);
const tapAt = (p) => page.touchscreen.tap(p.x, p.y);
/** A real finger swipe: down, a few moves, up. */
async function swipe(a, b) {
  const p = await cell(a);
  const q = await cell(b);
  await page.touchscreen.touchStart(p.x, p.y);
  for (let k = 1; k <= 4; k++) await page.touchscreen.touchMove(p.x + ((q.x - p.x) * k) / 4, p.y + ((q.y - p.y) * k) / 4);
  await page.touchscreen.touchEnd();
}
async function play(m) {
  if (m.b) await swipe(m.a, m.b);
  else await tapAt(await cell(m.a));
}
const until = async (pred, ms = 15000) => {
  for (let t = 0; t < ms; t += 100) {
    const s = await state();
    if (pred(s)) return s;
    await sleep(100);
  }
  problems.push('timed out waiting');
  return state();
};

let s = await until((s) => s.phase === 'guide');
await sleep(500);
await shot('1-guide');

// A swipe the guide does not want, then one that makes nothing: both bounce back, no move is spent.
await swipe({ r: 0, c: 0 }, { r: 0, c: 1 });
await sleep(600);
s = await state();
if (s.movesLeft !== 9 || s.guideStep !== 0) problems.push('a swipe off the guide was accepted');
const [g0, g1] = await dbg(() => window.__game.debug.guide);
await swipe(g0, g1);
await sleep(250);
await shot('2-tnt-made');
s = await until((s) => !s.busy && s.guideStep === 1);
if (s.movesLeft !== 8) problems.push('the guided swipe did not spend exactly one move');
if (!s.next || s.next.b) problems.push('after the guided swipe the hint should point at the TNT (a tap)');
await sleep(300);
await play(s.next);
await sleep(350);
await shot('3-boom');
s = await until((s) => !s.busy);
if (s.phase !== 'free') problems.push(`after the TNT the ad should be in free play, got ${s.phase}`);
if (s.goals.crate !== 0) problems.push(`the TNT should break every crate, ${s.goals.crate} left`);

// A swap that makes nothing, found from the rules, must bounce and cost nothing.
const bad = await dbg(() => {
  const d = window.__game.debug;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 6; c++) if (d.canTry({ r, c }, { r, c: c + 1 }) && !d.canSwap({ r, c }, { r, c: c + 1 })) return [{ r, c }, { r, c: c + 1 }];
  return null;
});
if (bad) {
  const before = (await state()).movesLeft;
  await swipe(bad[0], bad[1]);
  await sleep(600);
  if ((await state()).movesLeft !== before) problems.push('a swap that makes nothing spent a move');
}

if (mode === 'moves') {
  // Leave one move, spend it on something that does not finish the goals: the rescue must appear.
  await dbg(() => window.__game.debug.forceMoves(1));
  s = await until((s) => !s.busy && !!s.next);
  await play(s.next);
  s = await until((s) => s.rescue || s.stage === 'roll');
  if (!s.rescue) problems.push('no rescue offer after the last move');
  await sleep(1600);
  await shot('4-rescue');
  await tapAt({ x: w / 2, y: h / 2 });
  await sleep(400);
} else {
  // Free play, with an extra swipe fired straight into each cascade.
  for (let n = 0; n < 12; n++) {
    s = await state();
    if (s.stage !== 'board' || s.phase === 'ending') break;
    if (s.busy || !s.next) {
      await sleep(150);
      continue;
    }
    await play(s.next);
    await sleep(120);
    await swipe({ r: 7, c: 0 }, { r: 7, c: 1 });
    await sleep(200);
    if (n === 0) await shot('4-cascade');
    await until((s) => !s.busy || s.phase === 'ending');
  }
  s = await until((s) => s.stage === 'roll' && s.phase === 'squeeze');
  await sleep(500);
  await shot('5-roll');
  await tapAt(await dbg(() => window.__game.debug.rollScreen()));
  s = await until((s) => s.stage === 'vault' && !s.busy);
  await sleep(300);
  const safe = (i) => dbg((k) => window.__game.debug.safeScreen(k), i);
  await tapAt(await safe(4));
  await sleep(150);
  await tapAt(await safe(4)); // the same safe again, and while it is opening
  s = await until((s) => !s.busy);
  if (s.picks !== 1) problems.push(`a safe tapped twice counted twice (${s.picks} picks)`);
  await tapAt(await safe(4)); // an open safe
  await sleep(200);
  if ((await state()).picks !== 1) problems.push('an open safe could be picked again');
  await tapAt(await safe(0));
  await sleep(100);
  await tapAt(await safe(2)); // fired while safe 0 is still opening: ignored
  s = await until((s) => !s.busy);
  await shot('6-heist');
  if (s.picks !== 2) problems.push(`expected 2 picks, got ${s.picks}`);
  await tapAt(await safe(8));
  await sleep(1300);
  await shot('7-last');
}
await until((s) => s.phase === 'endcard', 20000);
await sleep(1600);
await shot('8-end');
const final = await dbg(() => {
  const d = window.__game.debug;
  return { phase: d.phase, picks: d.picks, end: d.events.find((e) => e.name === 'end')?.data, cta: d.events.filter((e) => e.name === 'cta').map((e) => e.data.where), opened: window.__opened ?? null };
});
await browser.close();
console.log(label, size, '?' + query, mode, JSON.stringify(final));
if (final.phase !== 'endcard') problems.push('never reached the end card');
const expect = mode === 'moves' ? 'fail' : /ending=win/.test(query) ? 'win' : 'fail';
if (final.end?.outcome !== expect) problems.push(`expected outcome ${expect}, got ${final.end?.outcome}`);
if (mode === 'moves' && (!final.cta.includes('rescue') || !final.opened)) problems.push('tapping the +5 moves offer did not open the store');
if (mode === 'moves' && final.end?.reason !== 'moves') problems.push(`expected the moves ending, got ${final.end?.reason}`);
console.log(problems.length ? 'TOUCH TEST FAILED\n  ' + problems.join('\n  ') : 'TOUCH TEST OK');
process.exit(problems.length ? 1 : 0);
