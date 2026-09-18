import { notifyReady, onVisibility, whenAdReady } from '@kit/network';
import { loadConfig } from './config';
import { Game } from './game';

async function boot(): Promise<void> {
  // Canvas textures use the display font, so give it a moment to decode (it is inlined, so this is fast).
  try {
    await Promise.race([document.fonts.load('600 32px Fredoka'), new Promise((r) => setTimeout(r, 400))]);
  } catch {
    /* fall back to system font */
  }

  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const game = new Game(canvas, ui, loadConfig());
  (window as unknown as { __game: Game }).__game = game;

  let paused = document.visibilityState !== 'visible';
  onVisibility((visible) => {
    paused = !visible;
    game.setPaused(paused);
    last = performance.now();
  });

  let last = performance.now();
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    if (paused) return;
    // Clamp so a stalled tab never produces a giant step.
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    game.frame(dt);
  };

  whenAdReady(() => {
    notifyReady();
    game.start();
    requestAnimationFrame(loop);
  });
}

void boot();
