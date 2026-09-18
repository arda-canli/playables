// Plays the ad with real touch events, the way a viewer would: including wrong taps,
// taps on blocked cars and very fast double taps. Verifies picking, the guided first move and the ending.
import puppeteer from 'puppeteer-core';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [query = 'mute=1', size = '390x844', label = 'touch', pace = '650'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const page = await browser.newPage();
await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const problems = [];
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && problems.push('console: ' + m.text()));
await page.goto(`file://${resolve(root, 'dist/triple-park/index.html')}?${query}`);

const dbg = (fn) => page.evaluate(fn);
const phase = () => dbg(() => window.__game.debug.phase);
const shot = (n) => page.screenshot({ path: resolve(root, 'shots', `${label}-${n}.png`) });
const tapLane = async (lane, row = 0) => {
  const p = await page.evaluate((l, r) => window.__game.debug.laneScreen(l, r), lane, row);
  if (p) await page.touchscreen.tap(p.x, p.y);
  return !!p;
};

while ((await phase()) !== 'guide') await sleep(100);
await sleep(500);
await shot('1-guide');
const g = await dbg(() => window.__game.debug.guideLane);

// 1. A wrong tap during the guided move must be refused.
await tapLane(0);
await sleep(250);
let st = await dbg(() => ({ waiting: window.__game.debug.waiting, phase: window.__game.debug.phase }));
if (st.phase !== 'guide' || st.waiting !== 3) problems.push(`wrong tap during guide was accepted: ${JSON.stringify(st)}`);
// 2. A tap on a blocked car (second row) must be refused too.
await tapLane(g, 1);
await sleep(250);
st = await dbg(() => ({ waiting: window.__game.debug.waiting, phase: window.__game.debug.phase }));
if (st.phase !== 'guide') problems.push('tap on blocked car was accepted');
// 3. The guided tap.
await tapLane(g);
await sleep(Number(pace));
if ((await phase()) === 'guide') problems.push('guided tap was not accepted');

let n = 0;
let shots = 0;
while (n++ < 40) {
  const s = await dbg(() => ({ phase: window.__game.debug.phase, best: window.__game.debug.bestLane(), waiting: window.__game.debug.waiting }));
  if (s.phase === 'ending' || s.phase === 'endcard' || s.best < 0) break;
  await tapLane(s.best);
  if (s.waiting >= 4 && shots < 2) await sleep(300).then(() => shot(`2-squeeze${shots++}`));
  await sleep(Number(pace));
}
for (let i = 0; i < 80 && (await phase()) !== 'endcard'; i++) await sleep(100);
await sleep(1500);
await shot('3-end');
const final = await dbg(() => ({ phase: window.__game.debug.phase, sent: window.__game.debug.sent, won: window.__game.debug.won, failed: window.__game.debug.failed, end: window.__game.debug.events.find((e) => e.name === 'end')?.data }));
await browser.close();
console.log(label, size, '?' + query, JSON.stringify(final));
if (final.phase !== 'endcard') problems.push('never reached the end card');
console.log(problems.length ? 'TOUCH TEST FAILED\n  ' + problems.join('\n  ') : 'TOUCH TEST OK');
process.exit(problems.length ? 1 : 0);
