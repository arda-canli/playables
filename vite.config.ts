import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'node:path';

// One playable is built at a time: GAME=triple-park vite build
const game = process.env.GAME ?? 'triple-park';

export default defineConfig({
  root: resolve(import.meta.dirname, 'games', game),
  base: './',
  resolve: { alias: { '@kit': resolve(import.meta.dirname, 'kit/src') } },
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    outDir: resolve(import.meta.dirname, 'dist', game),
    emptyOutDir: true,
    target: 'es2020',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
  server: { host: true, port: 5173 },
});
