// Every picture in the ad, written as SVG in code and rasterised into textures at start-up.
// The same drawings as the concept mocks: glossy tiles, the pigs, the crane, dice and the slingshot.
import { CanvasSource, Texture } from 'pixi.js';

const INK = '#3a1240';
type A = Record<string, string | number | undefined>;

const attrs = (a: A) =>
  Object.entries(a)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k.replace(/_/g, '-')}="${v}"`)
    .join(' ');
const el = (tag: string, a: A, inner = '') => `<${tag} ${attrs(a)}>${inner}</${tag}>`;
const g = (inner: string[], a: A = {}) => el('g', a, inner.join(''));
const path = (d: string, a: A) => el('path', { d, ...a });
const rect = (x: number, y: number, w: number, h: number, a: A) => el('rect', { x, y, width: w, height: h, ...a });
const circle = (cx: number, cy: number, r: number, a: A) => el('circle', { cx, cy, r, ...a });
const ellipse = (cx: number, cy: number, rx: number, ry: number, a: A) => el('ellipse', { cx, cy, rx, ry, ...a });
const poly = (pts: [number, number][], a: A) => el('polygon', { points: pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '), ...a });

const stops = (s: [number, string, number?][]) => s.map(([o, c, op]) => el('stop', { offset: o, stop_color: c, stop_opacity: op })).join('');
const lin = (id: string, s: [number, string, number?][], x2 = 0, y2 = 1) => el('linearGradient', { id, x1: 0, y1: 0, x2, y2 }, stops(s));
const rad = (id: string, s: [number, string, number?][], cx = 0.5, cy = 0.5, r = 0.5) => el('radialGradient', { id, cx, cy, r }, stops(s));

const DEFS = el(
  'defs',
  {},
  [
    lin('gApple', [[0, '#ff8a8a'], [0.5, '#ec2433'], [1, '#9c0a19']]),
    lin('gPack', [[0, '#97f784'], [0.5, '#32c149'], [1, '#127a2a']]),
    lin('gLant', [[0, '#fff29a'], [0.5, '#ffc21a'], [1, '#de8600']]),
    lin('gBolt', [[0, '#b3e2ff'], [0.5, '#2f8bff'], [1, '#1243aa']]),
    lin('gGold', [[0, '#fff3ae'], [0.45, '#ffc93c'], [1, '#d38c00']]),
    lin('gGoldH', [[0, '#d38c00'], [0.5, '#ffe27a'], [1, '#d38c00']], 1, 0),
    lin('gHat', [[0, '#5d88ff'], [1, '#1d3cbc']]),
    lin('gCoat', [[0, '#4a72ff'], [1, '#1c34a6']]),
    lin('gCape', [[0, '#ff5a6c'], [1, '#b3122a']]),
    lin('gHelmet', [[0, '#ff7a6a'], [1, '#c4122a']]),
    rad('gSkin', [[0, '#ffd6e0'], [0.75, '#ffadc2'], [1, '#ff94ae']], 0.45, 0.4, 0.6),
    lin('gWoodH', [[0, '#9a5a28'], [0.5, '#e0a463'], [1, '#9a5a28']], 1, 0),
    lin('gPink', [[0, '#ffb1dc'], [1, '#ff5fb2']]),
    lin('gRed', [[0, '#ff6a6a'], [0.5, '#e8202f'], [1, '#9a0a18']]),
    lin('gGreen', [[0, '#7df08e'], [1, '#16a94b']]),
    lin('gPanel', [[0, '#6d2fe0'], [1, '#3a1190']]),
    lin('gStone', [[0, '#8c86b8'], [1, '#4e4880']]),
    lin('gGlass', [[0, '#d8f2ff', 0.22], [1, '#a8dcff', 0.06]]),
    lin('gSky', [[0, '#160845'], [0.55, '#3f169a'], [1, '#6c2fd0']]),
    rad('gMoon', [[0, '#fffbe6'], [1, '#ffe7a3']]),
    rad('gHalo', [[0, '#fff6c8', 0.7], [1, '#fff6c8', 0]]),
    el('filter', { id: 'fDrop', x: '-20%', y: '-20%', width: '140%', height: '150%' }, el('feDropShadow', { dx: 0, dy: 3, stdDeviation: 2.2, flood_color: '#14062e', flood_opacity: 0.5 })),
  ].join(''),
);

const svg = (w: number, h: number, inner: string, vb = `0 0 ${w} ${h}`) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}">${DEFS}${inner}</svg>`;

// ---------------------------------------------------------------- tiles

const TILE: Record<string, string[]> = {
  a: [
    path('M50 30 C34 16 6 22 7 52 C8 80 30 96 42 93 C46 92 48 90 50 90 C52 90 54 92 58 93 C70 96 92 80 93 52 C94 22 66 16 50 30 Z', { fill: 'url(#gApple)', stroke: '#6e0410', stroke_width: 4 }),
    path('M50 30 C50 21 52 13 57 7', { stroke: '#5b2e10', stroke_width: 6, fill: 'none', stroke_linecap: 'round' }),
    path('M55 19 C63 6 82 6 87 12 C79 23 63 25 55 19 Z', { fill: '#55d143', stroke: '#1c6612', stroke_width: 3 }),
    ellipse(30, 46, 9, 15, { fill: '#fff', opacity: 0.75, transform: 'rotate(-25 30 46)' }),
    circle(42, 32, 3.5, { fill: '#fff', opacity: 0.8 }),
  ],
  p: [
    path('M38 22 Q50 4 62 22', { stroke: '#0b5a1a', stroke_width: 7, fill: 'none', stroke_linecap: 'round' }),
    rect(12, 20, 76, 74, { rx: 20, fill: 'url(#gPack)', stroke: '#0b5a1a', stroke_width: 4 }),
    path('M12 44 Q12 20 50 20 Q88 20 88 44 L88 50 Q50 60 12 50 Z', { fill: '#5fe06c', stroke: '#0b5a1a', stroke_width: 4 }),
    rect(29, 60, 42, 24, { rx: 9, fill: '#2bb444', stroke: '#0b5a1a', stroke_width: 3.5 }),
    rect(44, 50, 12, 14, { rx: 3, fill: 'url(#gGold)', stroke: '#7a4b00', stroke_width: 2.5 }),
    ellipse(26, 33, 7, 5, { fill: '#fff', opacity: 0.75 }),
  ],
  l: [
    rect(34, 6, 32, 12, { rx: 4, fill: '#d6331f', stroke: '#7a1a0d', stroke_width: 3.5 }),
    rect(34, 84, 32, 12, { rx: 4, fill: '#d6331f', stroke: '#7a1a0d', stroke_width: 3.5 }),
    path('M50 15 C82 15 94 34 94 51 C94 69 82 87 50 87 C18 87 6 69 6 51 C6 34 18 15 50 15 Z', { fill: 'url(#gLant)', stroke: '#9a5400', stroke_width: 4 }),
    path('M30 17 Q18 51 30 86 M70 17 Q82 51 70 86 M50 15 L50 87', { stroke: '#d98200', stroke_width: 3.5, fill: 'none' }),
    ellipse(27, 40, 7, 13, { fill: '#fff', opacity: 0.7, transform: 'rotate(-15 27 40)' }),
  ],
  b: [
    path('M60 4 L18 56 L45 56 L34 96 L82 38 L55 38 L68 4 Z', { fill: 'url(#gBolt)', stroke: '#0a2f7a', stroke_width: 4.5, stroke_linejoin: 'round' }),
    path('M58 12 L30 48', { stroke: '#fff', stroke_width: 5, stroke_linecap: 'round', opacity: 0.65 }),
  ],
};

// ---------------------------------------------------------------- characters

type Mood = 'scared' | 'happy' | 'neutral';
type Pose = 'stand' | 'cheeks' | 'arms_up';

function arm(sx: number, sy: number, ex: number, ey: number): string {
  const d = `M${sx} ${sy} Q${(sx + ex) / 2 + (ex > 0 ? 8 : -8)} ${(sy + ey) / 2} ${ex} ${ey}`;
  return path(d, { stroke: INK, stroke_width: 22, fill: 'none', stroke_linecap: 'round' }) + path(d, { stroke: '#2b4fe0', stroke_width: 15, fill: 'none', stroke_linecap: 'round' });
}

/** The hero pig, front view, feet at (0, 0), about 270 units tall. */
function pig(mood: Mood, pose: Pose): string {
  const o: string[] = [
    path('M-44 -104 L-74 -6 Q0 14 74 -6 L44 -104 Z', { fill: 'url(#gCape)', stroke: INK, stroke_width: 4, stroke_linejoin: 'round' }),
    rect(-28, -42, 20, 36, { rx: 8, fill: '#1d2a6b', stroke: INK, stroke_width: 3.5 }),
    rect(8, -42, 20, 36, { rx: 8, fill: '#1d2a6b', stroke: INK, stroke_width: 3.5 }),
    ellipse(-20, -6, 18, 9, { fill: '#2a1a1a', stroke: INK, stroke_width: 3 }),
    ellipse(20, -6, 18, 9, { fill: '#2a1a1a', stroke: INK, stroke_width: 3 }),
    path('M-46 -112 Q-54 -44 -42 -34 L42 -34 Q54 -44 46 -112 Q0 -126 -46 -112 Z', { fill: 'url(#gCoat)', stroke: INK, stroke_width: 4, stroke_linejoin: 'round' }),
    path('M-14 -116 L0 -84 L14 -116 Z', { fill: '#fff', stroke: INK, stroke_width: 3, stroke_linejoin: 'round' }),
    path('M-12 -112 L0 -104 L12 -112 L12 -100 L0 -104 L-12 -100 Z', { fill: '#e8203a', stroke: INK, stroke_width: 2.5, stroke_linejoin: 'round' }),
    ...[-80, -60].flatMap((y) => [circle(-10, y, 4, { fill: 'url(#gGold)', stroke: '#7a4b00', stroke_width: 1.5 }), circle(10, y, 4, { fill: 'url(#gGold)', stroke: '#7a4b00', stroke_width: 1.5 })]),
  ];
  let hands: [number, number][];
  if (pose === 'cheeks') {
    hands = [[-50, -150], [50, -150]];
    o.push(arm(-40, -104, -52, -132), arm(40, -104, 52, -132));
  } else if (pose === 'arms_up') {
    hands = [[-82, -228], [82, -228]];
    o.push(arm(-40, -104, -76, -210), arm(40, -104, 76, -210));
  } else {
    hands = [[-56, -58], [56, -58]];
    o.push(arm(-40, -104, -54, -66), arm(40, -104, 54, -66));
  }
  o.push(
    path('M-50 -196 L-66 -236 L-22 -208 Z', { fill: '#ffadc2', stroke: INK, stroke_width: 4, stroke_linejoin: 'round' }),
    path('M50 -196 L66 -236 L22 -208 Z', { fill: '#ffadc2', stroke: INK, stroke_width: 4, stroke_linejoin: 'round' }),
    ellipse(0, -160, 60, 54, { fill: 'url(#gSkin)', stroke: INK, stroke_width: 4.5 }),
    circle(-38, -146, 9, { fill: '#ff7f9f', opacity: 0.55 }),
    circle(38, -146, 9, { fill: '#ff7f9f', opacity: 0.55 }),
  );
  if (mood === 'scared') {
    for (const ex of [-21, 21]) o.push(ellipse(ex, -170, 13, 17, { fill: '#fff', stroke: INK, stroke_width: 3.5 }), circle(ex, -168, 4.5, { fill: INK }));
    o.push(path('M-36 -196 Q-24 -206 -10 -198 M36 -196 Q24 -206 10 -198', { stroke: INK, stroke_width: 4, fill: 'none', stroke_linecap: 'round' }));
    o.push(ellipse(0, -114, 9, 11, { fill: '#7a1033', stroke: INK, stroke_width: 3 }));
    o.push(path('M70 -190 C76 -180 78 -172 73 -167 C68 -163 62 -168 64 -175 Z', { fill: '#8fd8ff', stroke: INK, stroke_width: 2.5 }));
  } else if (mood === 'happy') {
    o.push(path('M-32 -168 Q-21 -182 -10 -168 M10 -168 Q21 -182 32 -168', { stroke: INK, stroke_width: 5, fill: 'none', stroke_linecap: 'round' }));
    o.push(path('M-18 -122 Q0 -98 18 -122 Z', { fill: '#7a1033', stroke: INK, stroke_width: 3, stroke_linejoin: 'round' }));
  } else {
    for (const ex of [-21, 21]) o.push(ellipse(ex, -170, 12, 15, { fill: '#fff', stroke: INK, stroke_width: 3.5 }), circle(ex + 2, -167, 7, { fill: INK }), circle(ex + 4, -170, 2.4, { fill: '#fff' }));
    o.push(path('M-14 -120 Q0 -110 14 -120', { stroke: INK, stroke_width: 4, fill: 'none', stroke_linecap: 'round' }));
  }
  o.push(
    ellipse(0, -140, 23, 17, { fill: '#ff8fab', stroke: INK, stroke_width: 3.5 }),
    ellipse(-8, -140, 3.5, 5.5, { fill: INK }),
    ellipse(8, -140, 3.5, 5.5, { fill: INK }),
    g(
      [
        ellipse(0, -204, 54, 11, { fill: 'url(#gHat)', stroke: INK, stroke_width: 4 }),
        rect(-35, -262, 70, 60, { rx: 9, fill: 'url(#gHat)', stroke: INK, stroke_width: 4 }),
        rect(-35, -226, 70, 14, { fill: 'url(#gGold)', stroke: INK, stroke_width: 3 }),
        rect(-26, -256, 10, 26, { rx: 5, fill: '#fff', opacity: 0.35 }),
      ],
      { transform: 'rotate(-8 0 -210)' },
    ),
    ...hands.map(([x, y]) => circle(x, y, 15, { fill: '#fff', stroke: INK, stroke_width: 3.5 })),
  );
  return g(o);
}

/** The squad's attacker, seen from behind in the slingshot: red helmet, cape. */
function attackerBack(): string {
  return g([
    path('M-60 -20 Q-70 -120 0 -130 Q70 -120 60 -20 Q0 4 -60 -20 Z', { fill: 'url(#gCape)', stroke: INK, stroke_width: 4.5 }),
    path('M-50 -196 L-70 -236 L-22 -208 Z', { fill: '#ffadc2', stroke: INK, stroke_width: 4, stroke_linejoin: 'round' }),
    path('M50 -196 L70 -236 L22 -208 Z', { fill: '#ffadc2', stroke: INK, stroke_width: 4, stroke_linejoin: 'round' }),
    ellipse(0, -160, 62, 56, { fill: 'url(#gSkin)', stroke: INK, stroke_width: 4.5 }),
    path('M-62 -170 Q-60 -232 0 -234 Q60 -232 62 -170 Q0 -186 -62 -170 Z', { fill: 'url(#gHelmet)', stroke: INK, stroke_width: 4.5 }),
    rect(-8, -232, 16, 52, { rx: 6, fill: 'url(#gGold)', stroke: INK, stroke_width: 3 }),
    path('M-40 -222 Q-20 -230 -6 -228', { stroke: '#fff', stroke_width: 6, opacity: 0.45, fill: 'none', stroke_linecap: 'round' }),
    path('M8 -40 q16 -8 10 8 q-6 12 8 6', { stroke: '#ff8fab', stroke_width: 6, fill: 'none', stroke_linecap: 'round' }),
    circle(-64, -70, 16, { fill: '#fff', stroke: INK, stroke_width: 3.5 }),
    circle(64, -70, 16, { fill: '#fff', stroke: INK, stroke_width: 3.5 }),
  ]);
}

/** Mary, the rival: bandit mask, pink bow. Centred on her face. */
function mary(shocked: boolean): string {
  const o = [
    path('M-50 -36 L-66 -76 L-22 -48 Z', { fill: '#ffadc2', stroke: INK, stroke_width: 4, stroke_linejoin: 'round' }),
    path('M50 -36 L66 -76 L22 -48 Z', { fill: '#ffadc2', stroke: INK, stroke_width: 4, stroke_linejoin: 'round' }),
    ellipse(0, 0, 60, 54, { fill: 'url(#gSkin)', stroke: INK, stroke_width: 4.5 }),
    path('M-58 -22 Q0 -40 58 -22 L56 0 Q0 -14 -56 0 Z', { fill: '#2a1240', stroke: INK, stroke_width: 3 }),
    ellipse(-21, -11, 10, shocked ? 10 : 8, { fill: '#fff' }),
    ellipse(21, -11, 10, shocked ? 10 : 8, { fill: '#fff' }),
    circle(-18, -10, shocked ? 3 : 4.5, { fill: INK }),
    circle(24, -10, shocked ? 3 : 4.5, { fill: INK }),
    ellipse(0, 20, 23, 17, { fill: '#ff8fab', stroke: INK, stroke_width: 3.5 }),
    ellipse(-8, 20, 3.5, 5.5, { fill: INK }),
    ellipse(8, 20, 3.5, 5.5, { fill: INK }),
    shocked ? ellipse(0, 42, 10, 9, { fill: '#7a1033', stroke: INK, stroke_width: 3 }) : path('M-22 38 Q4 54 26 34', { stroke: INK, stroke_width: 4.5, fill: 'none', stroke_linecap: 'round' }),
    path('M-30 -54 L-6 -44 L-30 -32 Z M14 -54 L-10 -44 L14 -32 Z', { fill: '#ff4fa3', stroke: INK, stroke_width: 3, stroke_linejoin: 'round' }),
    circle(-8, -44, 6, { fill: '#ff4fa3', stroke: INK, stroke_width: 3 }),
  ];
  return g(o);
}

// ---------------------------------------------------------------- props

function jib(len: number): string {
  const o = [rect(2, 2, len - 4, 18, { fill: 'none', stroke: '#ffc21a', stroke_width: 5 })];
  for (let x = 2; x < len - 4; x += 18) o.push(path(`M${x} 20 L${x + 9} 2 L${x + 18} 20`, { stroke: '#ffc21a', stroke_width: 3, fill: 'none' }));
  return g(o);
}

function tower(h: number): string {
  const o = [rect(2, 2, 22, h - 4, { fill: 'none', stroke: '#ffc21a', stroke_width: 5 })];
  for (let y = 2; y < h - 22; y += 22) o.push(path(`M2 ${y} L24 ${y + 22}`, { stroke: '#ffc21a', stroke_width: 3.5 }));
  return g(o);
}

function cab(): string {
  return g([
    rect(2, 2, 64, 54, { rx: 6, fill: 'url(#gGold)', stroke: '#7a4b00', stroke_width: 3.5 }),
    rect(9, 9, 50, 34, { rx: 4, fill: '#bfe6ff', stroke: '#7a4b00', stroke_width: 2.5 }),
  ]);
}

function bucket(): string {
  return g(
    [
      poly([[-30, -18], [30, -18], [22, 22], [-22, 22]], { fill: '#8794a8', stroke: '#2f3540', stroke_width: 3.5, stroke_linejoin: 'round' }),
      rect(-32, -22, 64, 8, { rx: 3, fill: '#b8c3d3', stroke: '#2f3540', stroke_width: 3 }),
      path('M-18 -10 L-14 14 M0 -10 L0 14 M18 -10 L14 14', { stroke: '#5d6878', stroke_width: 3 }),
    ],
    { transform: 'translate(36 26)' },
  );
}

const HAMMER = [
  path('M46 40 L58 40 L62 94 L42 94 Z', { fill: '#b0723a', stroke: INK, stroke_width: 5, stroke_linejoin: 'round' }),
  rect(14, 14, 72, 32, { rx: 8, fill: '#5a6170', stroke: INK, stroke_width: 5 }),
  rect(18, 18, 64, 8, { rx: 4, fill: '#fff', opacity: 0.35 }),
  path('M62 2 L44 30 L56 30 L46 52 L72 22 L60 22 L70 2 Z', { fill: '#ffe14d', stroke: '#a36a00', stroke_width: 3.5, stroke_linejoin: 'round' }),
];
const FACES: Record<string, string[]> = {
  hammer: HAMMER,
  coin: [circle(50, 50, 36, { fill: 'url(#gGold)', stroke: '#8a5600', stroke_width: 5 }), circle(50, 50, 24, { fill: 'none', stroke: '#d38c00', stroke_width: 4 }), ellipse(38, 36, 9, 6, { fill: '#fff', opacity: 0.8 })],
  shield: [path('M50 8 L86 22 Q86 70 50 92 Q14 70 14 22 Z', { fill: '#4f7dff', stroke: INK, stroke_width: 5, stroke_linejoin: 'round' }), path('M50 20 L74 30 Q72 64 50 80 Z', { fill: '#ffffff', opacity: 0.35 })],
  question: [circle(50, 50, 38, { fill: '#a566ff', stroke: INK, stroke_width: 5 }), path('M38 38 Q38 22 52 22 Q66 22 66 36 Q66 46 54 50 L54 60', { stroke: '#fff', stroke_width: 9, fill: 'none', stroke_linecap: 'round' }), circle(54, 76, 6, { fill: '#fff' })],
  jackpot: [path('M14 70 L22 30 L38 48 L50 18 L62 48 L78 30 L86 70 Z', { fill: 'url(#gGold)', stroke: '#8a5600', stroke_width: 5, stroke_linejoin: 'round' }), rect(14, 70, 72, 14, { rx: 4, fill: 'url(#gGold)', stroke: '#8a5600', stroke_width: 5 }), circle(50, 50, 6, { fill: '#ff3b4f' })],
};

function die(face: string): string {
  return g([
    rect(4, 10, 92, 92, { rx: 20, fill: '#b9a6ff' }),
    rect(2, 2, 92, 92, { rx: 20, fill: '#fff', stroke: '#5b3fd1', stroke_width: 4 }),
    rect(10, 8, 76, 14, { rx: 7, fill: '#efeaff' }),
    g(FACES[face], { transform: 'translate(15 15) scale(0.66)' }),
  ]);
}

function crosshair(): string {
  const r = 26;
  const c = 34;
  return g([
    circle(c, c, r, { fill: '#fff', opacity: 0.18 }),
    circle(c, c, r, { fill: 'none', stroke: '#ff2f4a', stroke_width: 5 }),
    circle(c, c, r * 0.55, { fill: 'none', stroke: '#fff', stroke_width: 4 }),
    circle(c, c, r * 0.18, { fill: '#ff2f4a' }),
    path(`M${c - r - 7} ${c}H${c - r * 0.62}M${c + r * 0.62} ${c}H${c + r + 7}M${c} ${c - r - 7}V${c - r * 0.62}M${c} ${c + r * 0.62}V${c + r + 7}`, { stroke: '#ff2f4a', stroke_width: 5, stroke_linecap: 'round' }),
  ]);
}

function sling(): string {
  const d = 'M70 230 L70 104 M70 104 L14 18 M70 104 L126 18';
  return g([
    path(d, { stroke: '#3a1d08', stroke_width: 32, fill: 'none', stroke_linecap: 'round', stroke_linejoin: 'round' }),
    path(d, { stroke: 'url(#gWoodH)', stroke_width: 22, fill: 'none', stroke_linecap: 'round', stroke_linejoin: 'round' }),
    circle(14, 16, 11, { fill: 'url(#gGold)', stroke: '#7a4b00', stroke_width: 2 }),
    circle(126, 16, 11, { fill: 'url(#gGold)', stroke: '#7a4b00', stroke_width: 2 }),
  ]);
}

function rollButton(): string {
  return g([
    ellipse(70, 132, 62, 13, { fill: '#000', opacity: 0.35 }),
    circle(70, 74, 62, { fill: '#7a0612' }),
    circle(70, 66, 62, { fill: 'url(#gRed)', stroke: '#5a0410', stroke_width: 4 }),
    ellipse(54, 38, 34, 15, { fill: '#fff', opacity: 0.45 }),
  ]);
}

function tray(): string {
  return g([
    rect(2, 2, 302, 210, { rx: 34, fill: 'url(#gGold)', stroke: '#7a4b00', stroke_width: 3 }),
    rect(14, 14, 278, 186, { rx: 26, fill: 'url(#gPink)', stroke: '#c2207f', stroke_width: 3 }),
    rect(28, 24, 250, 10, { rx: 5, fill: '#fff', opacity: 0.35 }),
  ]);
}

function pedestal(w: number, h: number): string {
  return g([
    rect(0, 6, w, h - 6, { fill: 'url(#gStone)', stroke: '#2a1f5a', stroke_width: 3 }),
    path(`M0 ${h * 0.55} H${w} M${w * 0.3} 6 V${h * 0.55} M${w * 0.7} ${h * 0.55} V${h}`, { stroke: '#2a1f5a', stroke_width: 2.5, opacity: 0.6 }),
    rect(0, 0, w, 10, { rx: 3, fill: 'url(#gGold)', stroke: '#7a4b00', stroke_width: 2 }),
  ]);
}

function coin(): string {
  return g([ellipse(16, 16, 14, 14, { fill: 'url(#gGold)', stroke: '#8a5600', stroke_width: 2.5 }), ellipse(16, 16, 9, 9, { fill: 'none', stroke: '#d38c00', stroke_width: 2 }), ellipse(11, 11, 4, 2.6, { fill: '#fff', opacity: 0.8 })]);
}

/** The night town: sky, moon, stars and two layers of skyline with lit windows. Wide, so landscape covers too. */
function sky(w: number, h: number): string {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const o = [rect(0, 0, w, h, { fill: 'url(#gSky)' })];
  for (let i = 0; i < 160; i++) o.push(circle(rnd() * w, rnd() * h * 0.6, 0.8 + rnd() * 1.6, { fill: '#fff', opacity: (0.3 + rnd() * 0.6).toFixed(2) }));
  const mx = w * 0.72;
  o.push(circle(mx, 120, 90, { fill: 'url(#gHalo)', opacity: 0.6 }), circle(mx, 120, 36, { fill: 'url(#gMoon)' }), circle(mx - 12, 110, 7, { fill: '#f2d98a', opacity: 0.6 }), circle(mx + 10, 132, 5, { fill: '#f2d98a', opacity: 0.6 }));
  for (const [col, base, hmin, hmax, lit] of [['#2b1170', h * 0.62, 50, 170, 0.25], ['#1d0b52', h * 0.7, 40, 120, 0.38]] as [string, number, number, number, number][]) {
    let x = -10;
    while (x < w + 10) {
      const bw = 30 + rnd() * 40;
      const bh = hmin + rnd() * (hmax - hmin);
      o.push(rect(x, base - bh, bw, h - base + bh, { fill: col }));
      for (let wy = base - bh + 9; wy < base + 80; wy += 14) for (let wx = x + 6; wx < x + bw - 7; wx += 11) if (rnd() < lit) o.push(rect(wx, wy, 5, 6, { fill: '#ffd65a', opacity: (0.5 + rnd() * 0.5).toFixed(2) }));
      x += bw + rnd() * 5 - 1;
    }
  }
  return g(o);
}

// ---------------------------------------------------------------- rasterising

async function raster(markup: string, w: number, h: number, res: number): Promise<Texture> {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
  await img.decode();
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * res);
  c.height = Math.ceil(h * res);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return new Texture({ source: new CanvasSource({ resource: c, resolution: res }) });
}

/** One brick for the falling sand: drawn once, tinted per grain. */
function brickTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = 28;
  c.height = 18;
  const x = c.getContext('2d')!;
  x.fillStyle = '#6e2e16';
  x.beginPath();
  x.roundRect(1, 1, 26, 16, 4);
  x.fill();
  const grad = x.createLinearGradient(0, 0, 0, 18);
  grad.addColorStop(0, '#f09a6a');
  grad.addColorStop(1, '#c4582f');
  x.fillStyle = grad;
  x.beginPath();
  x.roundRect(3, 3, 22, 12, 3);
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.35)';
  x.fillRect(5, 4, 15, 3);
  return new Texture({ source: new CanvasSource({ resource: c, resolution: 2 }) });
}

function glowTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const r = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = r;
  x.fillRect(0, 0, 128, 128);
  return Texture.from(c);
}

function starTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  x.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? 6 : 31;
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  x.fill();
  return Texture.from(c);
}

export async function makeArt() {
  const R = Math.min(3, Math.max(2, Math.ceil(window.devicePixelRatio || 1)));
  const t = (markup: string, w: number, h: number, res = R) => raster(svg(w, h, markup), w, h, res);
  const tile = (k: string) => t(g(TILE[k]), 100, 100, R * 0.5);
  // Character art is drawn around a (0, 0) foot point; wrap it so the whole figure is on the canvas.
  const fig = (inner: string, w: number, h: number, ox: number, oy: number, k: number) => t(g([inner], { transform: `translate(${ox} ${oy}) scale(${k})` }), w, h);
  const [skyTex, a, p, l, b, pigScared, pigHappy, pigCheer, attacker, maryTex, maryShock, jibTex, towerTex, cabTex, bucketTex, crossTex, slingTex, rollTex, trayTex, pedestalTex, coinTex] = await Promise.all([
    raster(svg(1400, 980, sky(1400, 980)), 1400, 980, 1),
    tile('a'), tile('p'), tile('l'), tile('b'),
    fig(pig('scared', 'cheeks'), 110, 120, 55, 118, 0.42),
    fig(pig('neutral', 'stand'), 110, 120, 55, 118, 0.42),
    fig(pig('happy', 'arms_up'), 150, 156, 75, 152, 0.56),
    fig(attackerBack(), 88, 124, 44, 118, 0.44),
    fig(mary(false), 48, 48, 24, 26, 0.3),
    fig(mary(true), 48, 48, 24, 26, 0.3),
    t(jib(300), 300, 22),
    t(tower(400), 26, 400),
    t(cab(), 68, 58),
    t(bucket(), 72, 52),
    t(crosshair(), 68, 68),
    t(sling(), 140, 236),
    t(rollButton(), 140, 146),
    t(tray(), 306, 214),
    t(pedestal(90, 50), 90, 50),
    t(coin(), 32, 32),
  ]);
  const faces = Object.fromEntries(await Promise.all(Object.keys(FACES).map(async (f) => [f, await t(die(f), 100, 106)] as const))) as Record<string, Texture>;
  return {
    sky: skyTex,
    tiles: { a, p, l, b } as Record<string, Texture>,
    pig: { scared: pigScared, neutral: pigHappy, cheer: pigCheer },
    attacker,
    mary: maryTex,
    maryShock,
    jib: jibTex,
    tower: towerTex,
    cab: cabTex,
    bucket: bucketTex,
    cross: crossTex,
    sling: slingTex,
    roll: rollTex,
    tray: trayTex,
    pedestal: pedestalTex,
    coin: coinTex,
    faces,
    brick: brickTexture(),
    glow: glowTexture(),
    star: starTexture(),
  };
}

export type Art = Awaited<ReturnType<typeof makeArt>>;
