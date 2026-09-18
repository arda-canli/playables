// Assembles the GitHub Pages site: the portfolio page plus every built playable at its own URL.
//   site-dist/index.html, site-dist/img/*, site-dist/<game>/index.html
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'site-dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(resolve(root, 'site'), out, { recursive: true });
for (const game of readdirSync(resolve(root, 'dist'))) {
  const file = resolve(root, 'dist', game, 'index.html');
  if (!existsSync(file)) continue;
  mkdirSync(resolve(out, game), { recursive: true });
  cpSync(file, resolve(out, game, 'index.html'));
}
writeFileSync(resolve(out, '.nojekyll'), '');
console.log('site-dist:', readdirSync(out).join('  '));
