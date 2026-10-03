// Every picture in the ad is painted here on a canvas at start-up: tiles, boosters, the two pigs, dice,
// safes, loot and the backdrop. No image files, so nothing to download or inline.
import { Texture } from 'pixi.js';
import type { Booster, Color } from './logic';
import { GOLD, TILE } from './palette';

type G = CanvasRenderingContext2D;

export function paint(w: number, h: number, draw: (g: G) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  return c;
}

const tex = (size: number, draw: (g: G, s: number) => void) => Texture.from(paint(size, size, (g) => draw(g, size)));

/** The glossy candy look shared by every tile: soft drop shadow, top-lit gradient, dark outline, specular streak. */
function glossy(g: G, s: number, path: (g: G) => void, c: { light: string; base: string; deep: string; line: string }, shine = { x: 0.36, y: 0.3, rx: 0.17, ry: 0.075, a: -0.6 }): void {
  g.save();
  g.translate(0, s * 0.035);
  path(g);
  g.fillStyle = 'rgba(28, 8, 70, 0.35)';
  g.fill();
  g.restore();
  path(g);
  const grad = g.createLinearGradient(0, s * 0.08, 0, s * 0.92);
  grad.addColorStop(0, c.light);
  grad.addColorStop(0.42, c.base);
  grad.addColorStop(1, c.deep);
  g.fillStyle = grad;
  g.fill();
  g.lineJoin = 'round';
  g.lineWidth = s * 0.045;
  g.strokeStyle = c.line;
  g.stroke();
  g.save();
  path(g);
  g.clip();
  // A darker band along the bottom makes the shape read as round.
  const rim = g.createLinearGradient(0, s * 0.55, 0, s);
  rim.addColorStop(0, 'rgba(0,0,0,0)');
  rim.addColorStop(1, 'rgba(40,0,60,0.28)');
  g.fillStyle = rim;
  g.fillRect(0, 0, s, s);
  g.fillStyle = 'rgba(255,255,255,0.62)';
  g.beginPath();
  g.ellipse(s * shine.x, s * shine.y, s * shine.rx, s * shine.ry, shine.a, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.arc(s * (shine.x + 0.15), s * (shine.y - 0.04), s * 0.025, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

const P = (s: number) => (x: number) => x * s;

// ------------------------------------------------------------------ tiles

const TILE_PAINT: Record<Color, (g: G, s: number) => void> = {
  leaf(g, s) {
    const p = P(s);
    const path = (g: G) => {
      g.beginPath();
      g.moveTo(p(0.2), p(0.86));
      g.bezierCurveTo(p(0.04), p(0.48), p(0.4), p(0.1), p(0.86), p(0.12));
      g.bezierCurveTo(p(0.92), p(0.58), p(0.58), p(0.92), p(0.2), p(0.86));
      g.closePath();
    };
    glossy(g, s, path, TILE.leaf, { x: 0.4, y: 0.3, rx: 0.16, ry: 0.06, a: -0.75 });
    g.strokeStyle = TILE.leaf.line;
    g.globalAlpha = 0.55;
    g.lineCap = 'round';
    g.lineWidth = p(0.035);
    g.beginPath();
    g.moveTo(p(0.24), p(0.82));
    g.quadraticCurveTo(p(0.5), p(0.52), p(0.78), p(0.2));
    g.stroke();
    g.lineWidth = p(0.022);
    for (const [x, y, dx, dy] of [[0.42, 0.6, -0.08, -0.12], [0.55, 0.45, -0.08, -0.12], [0.45, 0.58, 0.12, 0.06], [0.58, 0.43, 0.12, 0.06]]) {
      g.beginPath();
      g.moveTo(p(x), p(y));
      g.lineTo(p(x + dx), p(y + dy));
      g.stroke();
    }
    g.globalAlpha = 1;
  },
  lantern(g, s) {
    const p = P(s);
    const caps = (g: G) => {
      g.beginPath();
      g.roundRect(p(0.33), p(0.11), p(0.34), p(0.15), p(0.05));
      g.roundRect(p(0.33), p(0.76), p(0.34), p(0.14), p(0.05));
    };
    caps(g);
    g.fillStyle = '#b55e00';
    g.fill();
    g.lineWidth = p(0.04);
    g.strokeStyle = TILE.lantern.line;
    g.stroke();
    const body = (g: G) => {
      g.beginPath();
      g.roundRect(p(0.13), p(0.21), p(0.74), p(0.6), p(0.27));
    };
    glossy(g, s, body, TILE.lantern, { x: 0.34, y: 0.33, rx: 0.13, ry: 0.07, a: -0.5 });
    g.save();
    body(g);
    g.clip();
    g.strokeStyle = 'rgba(176, 90, 0, 0.55)';
    g.lineWidth = p(0.03);
    for (const k of [-0.2, 0, 0.2]) {
      g.beginPath();
      g.ellipse(p(0.5), p(0.51), p(Math.abs(k) * 1.4 + 0.04), p(0.32), 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
    g.fillStyle = '#d43b2a';
    g.fillRect(p(0.47), p(0.88), p(0.06), p(0.08));
  },
  pack(g, s) {
    const p = P(s);
    g.lineWidth = p(0.07);
    g.strokeStyle = TILE.pack.line;
    g.beginPath();
    g.arc(p(0.5), p(0.27), p(0.14), Math.PI * 1.05, Math.PI * 1.95);
    g.stroke();
    g.lineWidth = p(0.035);
    g.strokeStyle = TILE.pack.deep;
    g.stroke();
    const body = (g: G) => {
      g.beginPath();
      g.roundRect(p(0.17), p(0.22), p(0.66), p(0.68), p(0.2));
    };
    glossy(g, s, body, TILE.pack, { x: 0.34, y: 0.33, rx: 0.12, ry: 0.06, a: -0.5 });
    // Flap
    g.beginPath();
    g.moveTo(p(0.2), p(0.42));
    g.quadraticCurveTo(p(0.5), p(0.56), p(0.8), p(0.42));
    g.lineWidth = p(0.035);
    g.strokeStyle = TILE.pack.line;
    g.stroke();
    // Front pocket
    g.beginPath();
    g.roundRect(p(0.3), p(0.58), p(0.4), p(0.24), p(0.08));
    g.fillStyle = TILE.pack.deep;
    g.fill();
    g.stroke();
    g.fillStyle = GOLD.base;
    g.beginPath();
    g.roundRect(p(0.45), p(0.47), p(0.1), p(0.12), p(0.025));
    g.fill();
    g.lineWidth = p(0.02);
    g.strokeStyle = GOLD.line;
    g.stroke();
  },
  apple(g, s) {
    const p = P(s);
    const path = (g: G) => {
      g.beginPath();
      g.moveTo(p(0.5), p(0.3));
      g.bezierCurveTo(p(0.64), p(0.17), p(0.94), p(0.22), p(0.89), p(0.53));
      g.bezierCurveTo(p(0.86), p(0.8), p(0.66), p(0.93), p(0.5), p(0.85));
      g.bezierCurveTo(p(0.34), p(0.93), p(0.14), p(0.8), p(0.11), p(0.53));
      g.bezierCurveTo(p(0.06), p(0.22), p(0.36), p(0.17), p(0.5), p(0.3));
      g.closePath();
    };
    glossy(g, s, path, TILE.apple, { x: 0.32, y: 0.4, rx: 0.1, ry: 0.06, a: -0.9 });
    g.lineCap = 'round';
    g.strokeStyle = '#6b3a12';
    g.lineWidth = p(0.05);
    g.beginPath();
    g.moveTo(p(0.5), p(0.32));
    g.quadraticCurveTo(p(0.5), p(0.18), p(0.56), p(0.1));
    g.stroke();
    g.fillStyle = '#3fcf4e';
    g.strokeStyle = '#13702a';
    g.lineWidth = p(0.025);
    g.beginPath();
    g.ellipse(p(0.68), p(0.16), p(0.11), p(0.05), -0.4, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  },
  bolt(g, s) {
    const p = P(s);
    const pts = [[0.6, 0.06], [0.2, 0.55], [0.45, 0.55], [0.33, 0.94], [0.82, 0.4], [0.56, 0.4], [0.7, 0.06]];
    const path = (g: G) => {
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(p(x), p(y)) : g.moveTo(p(x), p(y))));
      g.closePath();
    };
    glossy(g, s, path, TILE.bolt, { x: 0.52, y: 0.22, rx: 0.08, ry: 0.035, a: -0.9 });
  },
};

function crate(g: G, s: number): void {
  const p = P(s);
  g.fillStyle = 'rgba(40,10,60,0.35)';
  g.beginPath();
  g.roundRect(p(0.05), p(0.09), p(0.9), p(0.88), p(0.12));
  g.fill();
  g.beginPath();
  g.roundRect(p(0.05), p(0.05), p(0.9), p(0.88), p(0.12));
  g.fillStyle = '#b8571a';
  g.fill();
  g.lineWidth = p(0.04);
  g.strokeStyle = '#5e2508';
  g.stroke();
  const inner = g.createLinearGradient(0, p(0.15), 0, p(0.85));
  inner.addColorStop(0, '#ffbf6b');
  inner.addColorStop(1, '#e57a22');
  g.fillStyle = inner;
  g.beginPath();
  g.roundRect(p(0.15), p(0.15), p(0.7), p(0.68), p(0.06));
  g.fill();
  g.strokeStyle = '#9c4510';
  g.lineWidth = p(0.03);
  g.stroke();
  g.lineWidth = p(0.025);
  for (const y of [0.38, 0.6]) {
    g.beginPath();
    g.moveTo(p(0.17), p(y));
    g.lineTo(p(0.83), p(y));
    g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(p(0.18), p(0.17), p(0.64), p(0.04));
  g.fillStyle = '#6b2f0c';
  for (const [x, y] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.88], [0.9, 0.88]]) {
    g.beginPath();
    g.arc(p(x), p(y), p(0.03), 0, Math.PI * 2);
    g.fill();
  }
}

function tnt(g: G, s: number): void {
  const p = P(s);
  // A fat red barrel with gold hoops: it has to read as "the big one" at a glance.
  const body = (g: G) => {
    g.beginPath();
    g.moveTo(p(0.24), p(0.16));
    g.lineTo(p(0.76), p(0.16));
    g.quadraticCurveTo(p(0.98), p(0.53), p(0.76), p(0.92));
    g.lineTo(p(0.24), p(0.92));
    g.quadraticCurveTo(p(0.02), p(0.53), p(0.24), p(0.16));
    g.closePath();
  };
  glossy(g, s, body, { light: '#ffa08a', base: '#f2382c', deep: '#a3101a', line: '#4a050c' }, { x: 0.3, y: 0.4, rx: 0.05, ry: 0.16, a: 0.15 });
  g.save();
  body(g);
  g.clip();
  for (const y of [0.25, 0.8]) {
    const hoop = g.createLinearGradient(0, p(y - 0.04), 0, p(y + 0.04));
    hoop.addColorStop(0, '#fff1a6');
    hoop.addColorStop(1, '#c98410');
    g.fillStyle = hoop;
    g.fillRect(0, p(y - 0.04), s, p(0.08));
  }
  g.restore();
  g.beginPath();
  g.roundRect(p(0.16), p(0.41), p(0.68), p(0.26), p(0.07));
  g.fillStyle = '#fff2c4';
  g.fill();
  g.lineWidth = p(0.035);
  g.strokeStyle = '#4a050c';
  g.stroke();
  g.fillStyle = '#c4121f';
  g.font = `${p(0.25)}px "Lilita One", Impact, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('TNT', p(0.5), p(0.55));
  // Fuse and spark
  g.strokeStyle = '#3a2a1a';
  g.lineWidth = p(0.04);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(p(0.5), p(0.17));
  g.quadraticCurveTo(p(0.5), p(0.05), p(0.66), p(0.06));
  g.stroke();
  star(g, p(0.71), p(0.07), p(0.085), p(0.03), '#fff3a0', '#ff9a1a');
}

function rocket(g: G, s: number): void {
  const p = P(s);
  // Drawn pointing right; the vertical rocket is the same texture turned.
  g.fillStyle = '#ffb02e';
  g.beginPath();
  g.moveTo(p(0.2), p(0.42));
  g.lineTo(p(0.04), p(0.5));
  g.lineTo(p(0.2), p(0.58));
  g.fill();
  const fins = (g: G) => {
    g.beginPath();
    g.moveTo(p(0.2), p(0.38));
    g.lineTo(p(0.12), p(0.2));
    g.lineTo(p(0.34), p(0.36));
    g.moveTo(p(0.2), p(0.62));
    g.lineTo(p(0.12), p(0.8));
    g.lineTo(p(0.34), p(0.64));
  };
  fins(g);
  g.fillStyle = '#e8263a';
  g.fill();
  g.lineWidth = p(0.03);
  g.strokeStyle = '#6a0614';
  g.stroke();
  const body = (g: G) => {
    g.beginPath();
    g.moveTo(p(0.18), p(0.34));
    g.lineTo(p(0.66), p(0.32));
    g.quadraticCurveTo(p(0.94), p(0.36), p(0.96), p(0.5));
    g.quadraticCurveTo(p(0.94), p(0.64), p(0.66), p(0.68));
    g.lineTo(p(0.18), p(0.66));
    g.closePath();
  };
  glossy(g, s, body, { light: '#ffffff', base: '#e6ecff', deep: '#9fb0e8', line: '#1d2d7a' }, { x: 0.45, y: 0.4, rx: 0.2, ry: 0.035, a: 0 });
  g.save();
  body(g);
  g.clip();
  g.fillStyle = '#2f6cf0';
  g.fillRect(p(0.3), 0, p(0.08), s);
  g.fillRect(p(0.48), 0, p(0.08), s);
  g.fillStyle = '#e8263a';
  g.fillRect(p(0.76), 0, p(0.3), s);
  g.restore();
  body(g);
  g.lineWidth = p(0.035);
  g.strokeStyle = '#1d2d7a';
  g.stroke();
}

function star(g: G, x: number, y: number, ro: number, ri: number, fill: string, line: string): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? ri : ro;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = ro * 0.18;
  g.strokeStyle = line;
  g.stroke();
}

// ------------------------------------------------------------------ the pigs

export interface PigLook {
  hat: 'top' | 'bowler' | 'none';
  monocle?: boolean;
  mask?: boolean;
  mood?: 'happy' | 'worried' | 'smug';
}

/** A cute pig head filling an s×s square. */
export function pig(g: G, s: number, look: PigLook): void {
  const p = P(s);
  const skin = '#f7a1ad';
  const line = '#b04a60';
  // Ears behind the head
  for (const k of [-1, 1]) {
    g.beginPath();
    g.moveTo(p(0.5 + k * 0.17), p(0.36));
    g.quadraticCurveTo(p(0.5 + k * 0.36), p(0.16), p(0.5 + k * 0.38), p(0.42));
    g.closePath();
    g.fillStyle = skin;
    g.fill();
    g.lineWidth = p(0.02);
    g.strokeStyle = line;
    g.stroke();
    g.beginPath();
    g.moveTo(p(0.5 + k * 0.22), p(0.37));
    g.quadraticCurveTo(p(0.5 + k * 0.33), p(0.24), p(0.5 + k * 0.34), p(0.4));
    g.closePath();
    g.fillStyle = '#ff7f93';
    g.fill();
  }
  const head = g.createRadialGradient(p(0.42), p(0.48), p(0.04), p(0.5), p(0.6), p(0.4));
  head.addColorStop(0, '#ffe0e4');
  head.addColorStop(0.55, '#ffb4bf');
  head.addColorStop(1, '#ea8496');
  g.beginPath();
  g.ellipse(p(0.5), p(0.6), p(0.35), p(0.31), 0, 0, Math.PI * 2);
  g.fillStyle = head;
  g.fill();
  g.lineWidth = p(0.022);
  g.strokeStyle = line;
  g.stroke();
  // Blush
  g.fillStyle = 'rgba(255, 90, 120, 0.3)';
  for (const k of [-1, 1]) {
    g.beginPath();
    g.ellipse(p(0.5 + k * 0.24), p(0.69), p(0.07), p(0.045), 0, 0, Math.PI * 2);
    g.fill();
  }
  // Eyes
  const look2 = look.mood ?? 'happy';
  for (const k of [-1, 1]) {
    const ex = p(0.5 + k * 0.12);
    const ey = p(0.52);
    g.beginPath();
    g.ellipse(ex, ey, p(0.068), p(0.085), 0, 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
    g.lineWidth = p(0.014);
    g.strokeStyle = '#5b2a35';
    g.stroke();
    g.beginPath();
    g.arc(ex + k * p(-0.012), ey + p(0.012), p(0.042), 0, Math.PI * 2);
    g.fillStyle = '#2a1a1e';
    g.fill();
    g.beginPath();
    g.arc(ex + k * p(-0.012) - p(0.014), ey - p(0.004), p(0.014), 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
    // Brows
    g.beginPath();
    const tilt = look2 === 'worried' ? -0.05 : look2 === 'smug' ? 0.04 : 0;
    g.moveTo(ex - p(0.06), ey - p(0.11) + k * p(tilt));
    g.quadraticCurveTo(ex, ey - p(0.15), ex + p(0.06), ey - p(0.11) - k * p(tilt));
    g.lineWidth = p(0.022);
    g.lineCap = 'round';
    g.strokeStyle = '#7a3a44';
    g.stroke();
  }
  if (look.mask) {
    g.beginPath();
    g.roundRect(p(0.22), p(0.44), p(0.56), p(0.14), p(0.07));
    g.fillStyle = '#1d1430';
    g.fill();
    for (const k of [-1, 1]) {
      g.beginPath();
      g.ellipse(p(0.5 + k * 0.12), p(0.51), p(0.05), p(0.04), 0, 0, Math.PI * 2);
      g.fillStyle = '#fff';
      g.fill();
      g.beginPath();
      g.arc(p(0.5 + k * 0.12), p(0.515), p(0.025), 0, Math.PI * 2);
      g.fillStyle = '#2a1a1e';
      g.fill();
    }
  }
  if (look.monocle) {
    g.beginPath();
    g.arc(p(0.62), p(0.52), p(0.1), 0, Math.PI * 2);
    g.lineWidth = p(0.025);
    g.strokeStyle = GOLD.base;
    g.stroke();
    g.beginPath();
    g.moveTo(p(0.71), p(0.57));
    g.quadraticCurveTo(p(0.78), p(0.75), p(0.74), p(0.86));
    g.lineWidth = p(0.01);
    g.stroke();
  }
  // Snout
  const sn = g.createLinearGradient(0, p(0.6), 0, p(0.78));
  sn.addColorStop(0, '#ffc4cd');
  sn.addColorStop(1, '#f07f93');
  g.beginPath();
  g.ellipse(p(0.5), p(0.69), p(0.135), p(0.09), 0, 0, Math.PI * 2);
  g.fillStyle = sn;
  g.fill();
  g.lineWidth = p(0.02);
  g.strokeStyle = line;
  g.stroke();
  for (const k of [-1, 1]) {
    g.beginPath();
    g.ellipse(p(0.5 + k * 0.045), p(0.69), p(0.022), p(0.036), 0, 0, Math.PI * 2);
    g.fillStyle = '#8a2f45';
    g.fill();
  }
  if (look.monocle) {
    // A banker's moustache
    g.fillStyle = '#5a3426';
    for (const k of [-1, 1]) {
      g.beginPath();
      g.ellipse(p(0.5 + k * 0.08), p(0.795), p(0.085), p(0.03), k * -0.25, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    g.beginPath();
    if (look2 === 'worried') g.arc(p(0.5), p(0.86), p(0.05), Math.PI * 1.15, Math.PI * 1.85);
    else g.arc(p(0.5), p(0.77), p(0.07), Math.PI * 0.2, Math.PI * 0.8);
    g.lineWidth = p(0.022);
    g.strokeStyle = '#7a2a3a';
    g.stroke();
  }
  // Hats
  if (look.hat === 'top') {
    g.save();
    g.translate(p(0.52), p(0.3));
    g.rotate(-0.14);
    const crown = g.createLinearGradient(-p(0.2), 0, p(0.2), 0);
    crown.addColorStop(0, '#5b9bff');
    crown.addColorStop(0.5, '#2c6ee8');
    crown.addColorStop(1, '#1a46b0');
    g.beginPath();
    g.ellipse(0, p(0.02), p(0.32), p(0.07), 0, 0, Math.PI * 2);
    g.fillStyle = '#2459cc';
    g.fill();
    g.lineWidth = p(0.02);
    g.strokeStyle = '#0d2470';
    g.stroke();
    g.beginPath();
    g.roundRect(-p(0.18), -p(0.24), p(0.36), p(0.27), p(0.04));
    g.fillStyle = crown;
    g.fill();
    g.stroke();
    g.fillStyle = GOLD.base;
    g.fillRect(-p(0.18), -p(0.06), p(0.36), p(0.06));
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.fillRect(-p(0.13), -p(0.21), p(0.04), p(0.13));
    g.restore();
  } else if (look.hat === 'bowler') {
    g.save();
    g.translate(p(0.5), p(0.3));
    g.beginPath();
    g.ellipse(0, p(0.03), p(0.3), p(0.06), 0, 0, Math.PI * 2);
    g.fillStyle = '#26232f';
    g.fill();
    g.beginPath();
    g.ellipse(0, 0, p(0.19), p(0.17), 0, Math.PI, Math.PI * 2);
    g.fill();
    g.fillStyle = '#7a1f2c';
    g.fillRect(-p(0.19), -p(0.035), p(0.38), p(0.04));
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.beginPath();
    g.ellipse(-p(0.07), -p(0.1), p(0.04), p(0.025), -0.5, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

// ------------------------------------------------------------------ dice, safes, loot

export type DieFace = 'cash' | 'energy' | 'heist' | 'jackpot' | 'attack' | 'mystery';
export const DIE_FACES: DieFace[] = ['cash', 'energy', 'heist', 'jackpot', 'attack', 'mystery'];

function die(g: G, s: number, face: DieFace): void {
  const p = P(s);
  g.beginPath();
  g.roundRect(p(0.06), p(0.1), p(0.88), p(0.86), p(0.2));
  g.fillStyle = '#9a8fd8';
  g.fill();
  const top = g.createLinearGradient(0, p(0.04), 0, p(0.88));
  top.addColorStop(0, '#ffffff');
  top.addColorStop(1, '#e3defc');
  g.beginPath();
  g.roundRect(p(0.06), p(0.04), p(0.88), p(0.84), p(0.2));
  g.fillStyle = top;
  g.fill();
  g.lineWidth = p(0.03);
  g.strokeStyle = '#4a3a9a';
  g.stroke();
  g.save();
  g.translate(p(0.5), p(0.46));
  const k = 0.62;
  g.translate(-p(k / 2), -p(k / 2));
  const fs = s * k;
  if (face === 'cash') cash(g, fs, false);
  else if (face === 'energy') TILE_PAINT.bolt(g, fs);
  else if (face === 'heist') pig(g, fs, { hat: 'none', mask: true });
  else if (face === 'jackpot') coinPile(g, fs);
  else if (face === 'attack') {
    const q = P(fs);
    g.strokeStyle = '#e8263a';
    g.lineWidth = q(0.1);
    g.beginPath();
    g.arc(q(0.5), q(0.5), q(0.3), 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = q(0.08);
    for (const [x0, y0, x1, y1] of [[0.5, 0.05, 0.5, 0.32], [0.5, 0.68, 0.5, 0.95], [0.05, 0.5, 0.32, 0.5], [0.68, 0.5, 0.95, 0.5]]) {
      g.beginPath();
      g.moveTo(q(x0), q(y0));
      g.lineTo(q(x1), q(y1));
      g.stroke();
    }
  } else {
    const q = P(fs);
    g.font = `${q(0.9)}px "Lilita One", Impact, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = q(0.08);
    g.strokeStyle = '#3a1d8a';
    g.strokeText('?', q(0.5), q(0.55));
    g.fillStyle = '#a66bff';
    g.fillText('?', q(0.5), q(0.55));
  }
  g.restore();
}

function cash(g: G, s: number, stack: boolean): void {
  const p = P(s);
  const n = stack ? 3 : 1;
  for (let i = n - 1; i >= 0; i--) {
    g.save();
    g.translate(p(0.5), p(0.55) - i * p(0.08));
    g.rotate(-0.12 + i * 0.05);
    g.beginPath();
    g.roundRect(-p(0.42), -p(0.24), p(0.84), p(0.48), p(0.06));
    const gr = g.createLinearGradient(0, -p(0.24), 0, p(0.24));
    gr.addColorStop(0, '#7dff9e');
    gr.addColorStop(1, '#19b04a');
    g.fillStyle = gr;
    g.fill();
    g.lineWidth = p(0.035);
    g.strokeStyle = '#0a5a26';
    g.stroke();
    g.beginPath();
    g.roundRect(-p(0.34), -p(0.17), p(0.68), p(0.34), p(0.04));
    g.lineWidth = p(0.02);
    g.strokeStyle = 'rgba(10,90,38,0.6)';
    g.stroke();
    g.beginPath();
    g.ellipse(0, 0, p(0.13), p(0.12), 0, 0, Math.PI * 2);
    g.fillStyle = '#c8ffd4';
    g.fill();
    g.beginPath();
    g.ellipse(0, p(0.01), p(0.07), p(0.05), 0, 0, Math.PI * 2);
    g.fillStyle = '#19b04a';
    g.fill();
    g.restore();
  }
}

function coin(g: G, x: number, y: number, r: number): void {
  g.beginPath();
  g.ellipse(x, y + r * 0.18, r, r * 0.92, 0, 0, Math.PI * 2);
  g.fillStyle = '#b8700a';
  g.fill();
  const gr = g.createLinearGradient(x, y - r, x, y + r);
  gr.addColorStop(0, '#fff3a6');
  gr.addColorStop(0.5, '#ffc93c');
  gr.addColorStop(1, '#e09312');
  g.beginPath();
  g.ellipse(x, y, r, r * 0.92, 0, 0, Math.PI * 2);
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = r * 0.12;
  g.strokeStyle = '#8a5200';
  g.stroke();
  g.beginPath();
  g.ellipse(x, y, r * 0.66, r * 0.6, 0, 0, Math.PI * 2);
  g.lineWidth = r * 0.08;
  g.strokeStyle = 'rgba(160, 90, 0, 0.6)';
  g.stroke();
  star(g, x, y, r * 0.36, r * 0.16, '#fff1a6', '#c27a0a');
}

function coinPile(g: G, s: number): void {
  const p = P(s);
  for (const [x, y, r] of [[0.3, 0.72, 0.17], [0.7, 0.72, 0.17], [0.5, 0.78, 0.18], [0.4, 0.56, 0.16], [0.62, 0.56, 0.16], [0.5, 0.4, 0.17]]) coin(g, p(x), p(y), p(r));
  // A crown on top
  g.save();
  g.translate(p(0.5), p(0.18));
  g.beginPath();
  g.moveTo(-p(0.2), p(0.1));
  g.lineTo(-p(0.24), -p(0.1));
  g.lineTo(-p(0.1), 0);
  g.lineTo(0, -p(0.14));
  g.lineTo(p(0.1), 0);
  g.lineTo(p(0.24), -p(0.1));
  g.lineTo(p(0.2), p(0.1));
  g.closePath();
  g.fillStyle = GOLD.base;
  g.fill();
  g.lineWidth = p(0.025);
  g.strokeStyle = GOLD.line;
  g.stroke();
  g.fillStyle = '#ff3d6e';
  g.beginPath();
  g.arc(0, p(0.03), p(0.035), 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function safe(g: G, s: number, open: boolean): void {
  const p = P(s);
  g.fillStyle = 'rgba(0,0,20,0.45)';
  g.beginPath();
  g.roundRect(p(0.04), p(0.08), p(0.92), p(0.9), p(0.14));
  g.fill();
  const rim = g.createLinearGradient(0, 0, 0, s);
  rim.addColorStop(0, '#fff0a0');
  rim.addColorStop(0.5, '#f2b52e');
  rim.addColorStop(1, '#b77410');
  g.beginPath();
  g.roundRect(p(0.04), p(0.04), p(0.92), p(0.9), p(0.14));
  g.fillStyle = rim;
  g.fill();
  g.lineWidth = p(0.02);
  g.strokeStyle = '#6a4006';
  g.stroke();
  const panel = g.createLinearGradient(0, p(0.1), 0, p(0.9));
  panel.addColorStop(0, open ? '#0c1036' : '#3446a8');
  panel.addColorStop(1, open ? '#1a2160' : '#1b2563');
  g.beginPath();
  g.roundRect(p(0.11), p(0.11), p(0.78), p(0.76), p(0.1));
  g.fillStyle = panel;
  g.fill();
  if (open) {
    // Inner shadow so the safe looks deep
    const sh = g.createRadialGradient(p(0.5), p(0.55), p(0.1), p(0.5), p(0.5), p(0.5));
    sh.addColorStop(0, 'rgba(70,90,200,0.35)');
    sh.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = sh;
    g.fill();
    return;
  }
  // The round door with four gold spokes
  const d = g.createRadialGradient(p(0.42), p(0.4), p(0.05), p(0.5), p(0.5), p(0.34));
  d.addColorStop(0, '#5a6fd8');
  d.addColorStop(1, '#1e2a78');
  g.beginPath();
  g.arc(p(0.5), p(0.49), p(0.3), 0, Math.PI * 2);
  g.fillStyle = d;
  g.fill();
  g.lineWidth = p(0.03);
  g.strokeStyle = '#121a52';
  g.stroke();
  g.beginPath();
  g.arc(p(0.5), p(0.49), p(0.24), 0, Math.PI * 2);
  g.lineWidth = p(0.015);
  g.strokeStyle = 'rgba(160,180,255,0.5)';
  g.stroke();
}

/** The four gold spokes and hub, kept separate so the handle can spin when a safe is opened. */
function spokes(g: G, s: number): void {
  const p = P(s);
  g.translate(p(0.5), p(0.5));
  for (let i = 0; i < 4; i++) {
    g.save();
    g.rotate(Math.PI / 4 + (i * Math.PI) / 2);
    g.beginPath();
    g.roundRect(-p(0.05), -p(0.44), p(0.1), p(0.36), p(0.05));
    const gr = g.createLinearGradient(-p(0.05), 0, p(0.05), 0);
    gr.addColorStop(0, '#fff1a6');
    gr.addColorStop(1, '#d68a10');
    g.fillStyle = gr;
    g.fill();
    g.lineWidth = p(0.02);
    g.strokeStyle = '#7a4a06';
    g.stroke();
    g.restore();
  }
  g.beginPath();
  g.arc(0, 0, p(0.13), 0, Math.PI * 2);
  const hub = g.createRadialGradient(-p(0.04), -p(0.04), p(0.01), 0, 0, p(0.13));
  hub.addColorStop(0, '#fff6c0');
  hub.addColorStop(1, '#e09312');
  g.fillStyle = hub;
  g.fill();
  g.lineWidth = p(0.02);
  g.strokeStyle = '#7a4a06';
  g.stroke();
}

function rollButton(g: G, s: number): void {
  const p = P(s);
  g.beginPath();
  g.arc(p(0.5), p(0.54), p(0.45), 0, Math.PI * 2);
  g.fillStyle = '#5a0712';
  g.fill();
  const gr = g.createRadialGradient(p(0.42), p(0.36), p(0.05), p(0.5), p(0.5), p(0.46));
  gr.addColorStop(0, '#ff8a8a');
  gr.addColorStop(0.55, '#ef1f35');
  gr.addColorStop(1, '#a10a1f');
  g.beginPath();
  g.arc(p(0.5), p(0.49), p(0.44), 0, Math.PI * 2);
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = p(0.025);
  g.strokeStyle = '#ffd0d0';
  g.globalAlpha = 0.5;
  g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.beginPath();
  g.ellipse(p(0.4), p(0.23), p(0.2), p(0.07), -0.25, 0, Math.PI * 2);
  g.fill();
}

// ------------------------------------------------------------------ backdrop

/** A painterly night city in purples: glow, moon, rooftops with lit windows. */
export function backdrop(): HTMLCanvasElement {
  const W = 540;
  const H = 960;
  return paint(W, H, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1a0a4a');
    sky.addColorStop(0.4, '#4b23a8');
    sky.addColorStop(0.75, '#36188a');
    sky.addColorStop(1, '#140838');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    const glow = (x: number, y: number, r: number, c: string) => {
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, c);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    glow(400, 170, 260, 'rgba(255, 200, 255, 0.25)');
    glow(110, 620, 300, 'rgba(255, 90, 200, 0.18)');
    glow(430, 760, 260, 'rgba(60, 160, 255, 0.16)');
    // Moon
    g.fillStyle = '#fff6e0';
    g.beginPath();
    g.arc(420, 150, 54, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(230, 210, 255, 0.5)';
    for (const [x, y, r] of [[402, 136, 10], [436, 168, 7], [430, 128, 5]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    // Stars
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.fillStyle = '#fff';
    for (let i = 0; i < 60; i++) {
      g.globalAlpha = 0.25 + rnd() * 0.6;
      g.beginPath();
      g.arc(rnd() * W, rnd() * H * 0.5, 0.6 + rnd() * 1.6, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    // Two layers of rooftops with lit windows
    const skyline = (base: number, color: string, win: string, n: number) => {
      let x = -20;
      while (x < W + 20) {
        const w = 50 + rnd() * 70;
        const h = 80 + rnd() * 200 * n;
        g.fillStyle = color;
        g.fillRect(x, base - h, w, h + 400);
        if (rnd() < 0.4) {
          g.beginPath();
          g.moveTo(x - 6, base - h);
          g.lineTo(x + w / 2, base - h - 30 - rnd() * 30);
          g.lineTo(x + w + 6, base - h);
          g.fill();
        }
        g.fillStyle = win;
        for (let wy = base - h + 16; wy < base + 300; wy += 22)
          for (let wx = x + 8; wx < x + w - 10; wx += 16) if (rnd() < 0.35) g.fillRect(wx, wy, 7, 10);
        x += w + 4;
      }
    };
    skyline(520, '#2a1470', 'rgba(255, 214, 120, 0.35)', 1);
    skyline(700, '#1c0c52', 'rgba(255, 200, 110, 0.55)', 0.8);
    const fade = g.createLinearGradient(0, 640, 0, H);
    fade.addColorStop(0, 'rgba(18, 8, 50, 0)');
    fade.addColorStop(1, 'rgba(18, 8, 50, 0.9)');
    g.fillStyle = fade;
    g.fillRect(0, 640, W, H - 640);
  });
}

// ------------------------------------------------------------------ the set

export function makeArt() {
  const T = 160;
  const tiles = {} as Record<Color | Booster | 'crate', Texture>;
  for (const k of Object.keys(TILE_PAINT) as Color[]) tiles[k] = tex(T, TILE_PAINT[k]);
  tiles.crate = tex(T, crate);
  tiles.tnt = tex(T, tnt);
  tiles.rocketH = tex(T, rocket);
  tiles.rocketV = tiles.rocketH;
  const dice = {} as Record<DieFace, Texture>;
  for (const f of DIE_FACES) dice[f] = tex(160, (g, s) => die(g, s, f));
  return {
    tiles,
    dice,
    safe: tex(200, (g, s) => safe(g, s, false)),
    safeOpen: tex(200, (g, s) => safe(g, s, true)),
    spokes: tex(200, (g, s) => spokes(g, s)),
    cash: tex(160, (g, s) => cash(g, s, true)),
    jackpot: tex(160, coinPile),
    coin: tex(64, (g, s) => coin(g, s / 2, s / 2 - 2, s * 0.42)),
    bill: tex(64, (g, s) => cash(g, s, false)),
    roll: tex(256, rollButton),
    hero: tex(256, (g, s) => pig(g, s, { hat: 'top' })),
  };
}
export type Art = ReturnType<typeof makeArt>;

/** Data URLs for the HTML HUD: the hero and banker portraits and the goal icons. */
export function hudImages() {
  const url = (s: number, draw: (g: G, s: number) => void) => paint(s, s, (g) => draw(g, s)).toDataURL();
  return {
    hero: url(192, (g, s) => pig(g, s, { hat: 'top' })),
    heroWorried: url(192, (g, s) => pig(g, s, { hat: 'top', mood: 'worried' })),
    banker: url(192, (g, s) => pig(g, s, { hat: 'bowler', monocle: true, mood: 'smug' })),
    leaf: url(96, TILE_PAINT.leaf),
    crate: url(96, crate),
    die: url(96, (g, s) => die(g, s, 'heist')),
    coin: url(64, (g, s) => coin(g, s / 2, s / 2 - 2, s * 0.42)),
  };
}
