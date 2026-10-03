// Plays Puzzle Game with real touch events, the way a viewer would: taps during the ad's own opening,
// a tap far from the hint during the guided shot, rapid taps during the cooldown, a drag-to-aim, and the CTA moments.
//   node scripts/touch-pg.mjs            stuck ending: runs out of balls, taps the "+3 balls" offer
//   node scripts/touch-pg.mjs win        win ending: wastes every ball on purpose, so the free giant ball has to save it
import puppeteer from 'puppeteer-core';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [mode = 'stuck', size = '390x844'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const label = `pgtouch-${mode}`;
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
await page.goto(`file://${resolve(root, 'dist/puzzle-game/index.html')}?mute=1&ending=${mode}`);

const state = () => page.evaluate(() => { const d = window.__game.debug; return { phase: d.phase, balls: d.balls, left: d.left, smashed: d.smashed, offering: d.offering, giant: d.giant, cooldown: d.cooldown }; });
const screenOf = (p) => page.evaluate((q) => window.__game.debug.screenOf(q), p);
const best = () => page.evaluate(() => window.__game.debug.best());
const shot = (n) => page.screenshot({ path: resolve(root, 'shots', `${label}-${n}.png`) });
const events = () => page.evaluate(() => window.__game.debug.events);
const waitFor = async (pred, ms = 8000) => { for (let t = 0; t < ms; t += 100) { const s = await state(); if (pred(s)) return s; await sleep(100); } return state(); };
const settle = async () => { await sleep(400); for (let i = 0; i < 40; i++) { const s = await state(); if (s.cooldown === 0) break; await sleep(100); } await sleep(900); };

// 1. Taps during the ad's own opening must not fire anything; they only hurry it along.
await sleep(400);
await page.touchscreen.tap(w / 2, h * 0.4);
let s = await waitFor((x) => x.phase === 'guide');
if (s.phase !== 'guide') problems.push(`never reached the guided shot (phase ${s.phase})`);
if (s.balls !== (mode === 'win' ? 7 : 5)) problems.push(`a tap during the opening cost a ball (${s.balls})`);
await shot('1-guide');

// 2. The guided shot pays off wherever the finger lands: aim assist snaps it to the keystone.
const before = s.smashed;
await page.touchscreen.tap(w * 0.15, h * 0.12);
await sleep(2200);
s = await state();
if (s.smashed - before < 5) problems.push(`the guided shot only smashed ${s.smashed - before} jars`);
if (s.phase !== 'free') problems.push(`guided shot did not hand over to free play (phase ${s.phase})`);
await shot('2-after-keystone');

if (mode === 'stuck') {
  // 3. Rapid taps: one fires, one waits for the cooldown, the rest are dropped. Never more than two balls.
  const b0 = s.balls;
  const t = await best();
  const p = await screenOf(t);
  for (let i = 0; i < 4; i++) {
    await page.touchscreen.tap(p.x, p.y);
    await sleep(40);
  }
  await settle();
  s = await state();
  if (b0 - s.balls > 2 || b0 - s.balls < 1) problems.push(`rapid taps used ${b0 - s.balls} balls`);

  // 4. Drag to aim: finger down, move onto a target, release. The dotted aim line shows while held.
  const t2 = await best();
  if (t2 && s.balls > 0) {
    const q = await screenOf(t2);
    const b1 = s.balls;
    await page.touchscreen.touchStart(w * 0.5, h * 0.35);
    await sleep(120);
    await page.touchscreen.touchMove(q.x, q.y);
    await sleep(250);
    await shot('3-aiming');
    await page.touchscreen.touchEnd();
    await settle();
    s = await state();
    if (b1 - s.balls !== 1) problems.push(`drag-to-aim used ${b1 - s.balls} balls`);
  }
  // 5. Spend the rest on the best targets.
  for (let i = 0; i < 6; i++) {
    s = await state();
    if (s.balls === 0 || s.left === 0 || s.phase === 'ending' || s.phase === 'endcard') break;
    const t3 = await best();
    if (!t3) break;
    const q = await screenOf(t3);
    await page.touchscreen.tap(q.x, q.y);
    await settle();
  }
} else {
  // Waste every ball on the empty sky, so only the giant ball can save the level.
  for (let i = 0; i < 10; i++) {
    s = await state();
    if (s.balls === 0) break;
    await page.touchscreen.tap(w * 0.5, h * 0.21);
    await settle();
  }
  s = await waitFor((x) => x.giant, 6000);
  if (!s.giant) problems.push('out of balls in "win" but no giant ball was offered');
  await sleep(700);
  await shot('3-giant');
  const t3 = (await best()) ?? [0, 3.5, -14];
  const q = await screenOf(t3);
  await page.touchscreen.tap(q.x, q.y);
  await sleep(500);
  await shot('4-giant-hit');
}

s = await waitFor((x) => x.offering || x.phase === 'endcard', 9000);
if (mode === 'stuck' && s.left > 0) {
  if (!s.offering) problems.push('out of balls but no "+3 balls" offer');
  await sleep(900);
  await shot('4-offer');
  // The offer card itself is a tap target.
  const card = await page.evaluate(() => { const r = document.querySelector('.offer').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.touchscreen.tap(card.x, card.y);
  await sleep(400);
  const ev = await events();
  if (!ev.some((e) => e.name === 'cta' && e.data?.where === 'offer')) problems.push('tapping the offer did not fire the CTA');
}
s = await waitFor((x) => x.phase === 'endcard', 12000);
await sleep(1500);
await shot('5-end');
// The whole end card is the install button.
await page.touchscreen.tap(w / 2, h * 0.2);
await sleep(300);
const ev = await events();
const opened = await page.evaluate(() => window.__opened ?? 0);
if (opened < (mode === 'stuck' && s.left > 0 ? 2 : 1)) problems.push(`the store was opened ${opened} times`);
const end = ev.find((e) => e.name === 'end')?.data;
if (!ev.some((e) => e.name === 'cta' && e.data?.where === 'endcard')) problems.push('tapping the end card did not fire the CTA');
const want = mode === 'win' ? 'win' : s.left === 0 ? 'win' : 'fail';
if (end?.outcome !== want) problems.push(`expected ending "${want}", got "${end?.outcome}"`);
await browser.close();

console.log(`\n${label}: ${size}  end=${JSON.stringify(end)}`);
if (problems.length) {
  console.log('TOUCH FAILED\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('TOUCH OK');
