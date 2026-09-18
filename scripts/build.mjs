// Builds every playable in games/ to a single HTML file and enforces the size budget.
import { readdirSync, statSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET = 2 * 1024 * 1024; // our target; ad networks cap at 5 MB
const only = process.argv[2];
const games = readdirSync(resolve(root, 'games')).filter(
  (g) => existsSync(resolve(root, 'games', g, 'index.html')) && (!only || g === only),
);

let failed = false;
const rows = [];
for (const game of games) {
  execSync('npx vite build --logLevel warn', { cwd: root, stdio: 'inherit', env: { ...process.env, GAME: game } });
  const file = resolve(root, 'dist', game, 'index.html');
  const size = statSync(file).size;
  const gz = gzipSync(readFileSync(file)).length;
  const ok = size <= BUDGET;
  if (!ok) failed = true;
  rows.push({ game, 'size (KB)': Math.round(size / 1024), 'gzip (KB)': Math.round(gz / 1024), budget: ok ? 'ok' : 'OVER 2 MB' });
}
console.table(rows);
if (failed) process.exit(1);
