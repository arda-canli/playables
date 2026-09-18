// Smoke test: loads the built single-file playable in real Chrome, lets the ad play itself,
// takes screenshots along the way and fails on any console error or a wrong ending.
//   node scripts/smoke.mjs [game] [query] [WxH] [label]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const game = process.argv[2] ?? 'triple-park';
const query = process.argv[3] ?? 'autoplay=1&mute=1';
const [w, h] = (process.argv[4] ?? '390x844').split('x').map(Number);
const label = process.argv[5] ?? 'run';
const shotsAt = (process.argv[6] ?? '0.4,2.2,4.5,7,10,13,16,19,22,25').split(',').map(Number);
const expect = process.argv[7] ?? (game === 'pour-decisions' ? (/ending=win/.test(query) ? 'win' : 'fail') : /ending=lose/.test(query) ? 'fail' : 'win');
const out = resolve(root, 'shots');
mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files'],
});
const page = await browser.newPage();
await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const t0 = Date.now();
await page.goto(`file://${resolve(root, 'dist', game, 'index.html')}?${query}`);
for (const at of shotsAt) {
  const waitMs = at * 1000 - (Date.now() - t0);
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
  await page.screenshot({ path: resolve(out, `${label}-${String(at).padStart(4, '0')}s.png`) });
}
// Whatever the screenshot schedule was, wait for the ad to reach its end card.
for (let i = 0; i < 450; i++) {
  if ((await page.evaluate(() => window.__game?.debug.phase)) === 'endcard') break;
  await new Promise((r) => setTimeout(r, 100));
}
const state = await page.evaluate(() => {
  const g = window.__game?.debug;
  return g ? { phase: g.phase, events: g.events } : null;
});
await browser.close();

console.log(`\n${label}: ${w}x${h} ?${query}`);
if (state) {
  for (const e of state.events) console.log(`  ${String(e.t.toFixed(2)).padStart(6)}s  ${e.name}  ${e.data ? JSON.stringify(e.data) : ''}`);
  console.log(`  final: phase=${state.phase}`);
}
if (errors.length) console.log('console problems:\n  ' + errors.join('\n  '));
const end = state?.events.find((e) => e.name === 'end')?.data?.outcome;
const ok = state && !errors.some((e) => e.startsWith('pageerror') || e.startsWith('error')) && end === expect;
console.log(ok ? 'SMOKE OK' : `SMOKE FAILED (expected ending "${expect}", got "${end}")`);
process.exit(ok ? 0 : 1);
