// Plays Pour Decisions with real touch events, the way a viewer would: including a wrong tap during the
// guided move, a tap on a corked bottle, an illegal pour, and taps made while a pour is still running.
import puppeteer from 'puppeteer-core';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [query = 'mute=1', size = '390x844', label = 'pdtouch', pace = '250'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const page = await browser.newPage();
await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const problems = [];
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && problems.push('console: ' + m.text()));
await page.goto(`file://${resolve(root, 'dist/pour-decisions/index.html')}?${query}`);

const dbg = (fn) => page.evaluate(fn);
const state = () => dbg(() => { const d = window.__game.debug; return { phase: d.phase, moves: d.moves, selected: d.selected, pouring: d.pouring, rescue: d.rescue, next: d.next(), corked: d.corked }; });
const shot = (n) => page.screenshot({ path: resolve(root, 'shots', `${label}-${n}.png`) });
const tap = async (i) => { const p = await page.evaluate((k) => window.__game.debug.bottleScreen(k), i); if (p) await page.touchscreen.tap(p.x, p.y); };

while ((await state()).phase !== 'guide') await sleep(100);
await sleep(600);
await shot('1-guide');
const [ga, gb] = await dbg(() => window.__game.debug.guide);
await tap(6); await sleep(200);
let s = await state();
if (s.selected !== -1) problems.push('a wrong bottle could be picked up during the guided move');
await tap(0); await sleep(200); // corked bottle
await tap(ga); await sleep(350);
s = await state();
if (s.selected !== ga) problems.push('guided source was not selected');
await shot('2-selected');
await tap(5); await sleep(250); // wrong target
if ((await state()).moves !== 0) problems.push('wrong target accepted during guide');
await tap(gb); await sleep(520);
await shot('3-pouring');
if ((await state()).moves !== 1) problems.push('guided pour did not happen');
await sleep(900);
await shot('4-corked');

// An illegal pour in free play must be refused and must not break anything.
await tap(6); await sleep(250); await tap(1); await sleep(300); await tap(6); await sleep(250);
if ((await state()).selected !== -1) problems.push('tapping the held bottle again did not put it down');
let shots = 0;
for (let n = 0; n < 60; n++) {
  s = await state();
  if (s.phase === 'ending' || s.phase === 'endcard' || s.rescue) break;
  if (s.next >= 0) await tap(s.next);
  if (s.moves >= 3 && shots < 2 && s.pouring > 0) { await sleep(330); await shot(`5-pour${shots++}`); }
  await sleep(Number(pace));
}
for (let i = 0; i < 100; i++) { s = await state(); if (s.rescue || s.phase === 'endcard') break; await sleep(100); }
if (s.rescue) { await sleep(1300); await shot('6-rescue'); }
for (let i = 0; i < 120 && (await state()).phase !== 'endcard'; i++) await sleep(100);
await sleep(1600);
await shot('7-end');
const final = await dbg(() => ({ phase: window.__game.debug.phase, corked: window.__game.debug.corked, won: window.__game.debug.won, stuck: window.__game.debug.stuck, end: window.__game.debug.events.find((e) => e.name === 'end')?.data }));
await browser.close();
console.log(label, size, '?' + query, JSON.stringify(final));
if (final.phase !== 'endcard') problems.push('never reached the end card');
const expect = /ending=win/.test(query) ? 'win' : 'fail';
if (final.end?.outcome !== expect) problems.push(`expected outcome ${expect}, got ${final.end?.outcome}`);
console.log(problems.length ? 'TOUCH TEST FAILED\n  ' + problems.join('\n  ') : 'TOUCH TEST OK');
process.exit(problems.length ? 1 : 0);
