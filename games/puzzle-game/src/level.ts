// The level as data: where every piece stands, and the shots the ad script relies on.
// Pure numbers, no physics and no rendering, so the tests and the scene read the same source.

export type Kind = 'jar' | 'column' | 'plank' | 'gold';
export type JarColor = 'red' | 'orange' | 'yellow' | 'blue' | 'purple' | 'pink';
export type V3 = [number, number, number];

export interface PieceSpec {
  kind: Kind;
  pos: V3;
  color?: JarColor;
}

/** Centre of the table top (z) and the height of its upper surface (y). */
export const TZ = -14;
export const TABLE_Y = 2.2;
export const TABLE_HALF = { x: 3.9, z: 1.3 };
export const TABLE_THICK = 0.3;

/** Half extents of each piece's collision box. The meshes are drawn to match. */
export const HALF: Record<Kind, V3> = {
  jar: [0.25, 0.29, 0.25],
  column: [0.17, 0.62, 0.17],
  plank: [1.1, 0.11, 0.42],
  gold: [0.28, 0.28, 0.28],
};

export const MASS: Record<Kind, number> = { jar: 1, column: 1.6, plank: 2.2, gold: 3.2 };

/** Where the ball leaves the cannon in the simulation. The drawn cannon follows the camera; see game.ts. */
export const MUZZLE: V3 = [0, 2.4, 0];
export const BALL_SPEED = 30;
export const BALL_R = 0.33;
export const GRAVITY = 18;

const JAR = HALF.jar[1] * 2;
const STEP = 0.57; // jar spacing in a row

function tower(cx: number, colors: JarColor[]): PieceSpec[] {
  const y = TABLE_Y;
  const colTop = y + HALF.column[1] * 2;
  const plankTop = colTop + HALF.plank[1] * 2;
  const out: PieceSpec[] = [
    { kind: 'column', pos: [cx - 0.78, y + HALF.column[1], TZ] },
    { kind: 'column', pos: [cx + 0.78, y + HALF.column[1], TZ] },
    // Two jars sheltered between the columns, under the plank
    { kind: 'jar', pos: [cx, y + JAR / 2, TZ], color: colors[0] },
    { kind: 'jar', pos: [cx, y + JAR * 1.5, TZ], color: colors[1] },
    { kind: 'plank', pos: [cx, colTop + HALF.plank[1], TZ] },
  ];
  // A 3-2-1 pyramid on the plank
  let c = 2;
  [3, 2, 1].forEach((n, row) => {
    for (let i = 0; i < n; i++) {
      const x = cx + (i - (n - 1) / 2) * STEP;
      out.push({ kind: 'jar', pos: [x, plankTop + JAR * (row + 0.5), TZ], color: colors[c++ % colors.length] });
    }
  });
  return out;
}

function vault(colors: JarColor[]): PieceSpec[] {
  const out: PieceSpec[] = [];
  const g = HALF.gold[0] * 2 + 0.02;
  for (let row = 0; row < 2; row++) for (let i = -1; i <= 1; i++) out.push({ kind: 'gold', pos: [i * g, TABLE_Y + g * (row + 0.5), TZ] });
  const top = TABLE_Y + g * 2;
  let c = 0;
  [3, 2, 1].forEach((n, row) => {
    for (let i = 0; i < n; i++) out.push({ kind: 'jar', pos: [(i - (n - 1) / 2) * STEP, top + JAR * (row + 0.5), TZ], color: colors[c++ % colors.length] });
  });
  // The stubborn three: hiding behind the gold wall. These are what a near miss is usually made of.
  for (let i = -1; i <= 1; i++) out.push({ kind: 'jar', pos: [i * STEP, TABLE_Y + JAR / 2, TZ - 0.72], color: colors[(c++ + 2) % colors.length] });
  return out;
}

export interface Level {
  pieces: PieceSpec[];
  /** Jars smashed "before" the ad starts: the head start shown in the goal pill. */
  alreadySmashed: number;
  /** The botched opening: a weak shot that only clips the top of the right tower. */
  ghostTarget: V3;
  ghostPower: number;
  /** The guided first shot: the inner column of the left tower. The whole tower comes down. */
  keystone: V3;
  balls: { stuck: number; win: number };
}

export const LEVEL: Level = {
  pieces: [
    ...tower(-2.35, ['blue', 'pink', 'red', 'yellow', 'purple', 'orange', 'blue', 'red']),
    ...vault(['orange', 'purple', 'pink', 'yellow', 'red', 'blue']),
    ...tower(2.35, ['yellow', 'red', 'purple', 'blue', 'orange', 'pink', 'yellow', 'purple']),
  ],
  alreadySmashed: 8,
  ghostTarget: [2.35, TABLE_Y + 3.35, TZ],
  ghostPower: 0.12,
  keystone: [-1.57, TABLE_Y + 0.42, TZ],
  balls: { stuck: 5, win: 7 },
};

export const JAR_COLORS: Record<JarColor, number> = {
  red: 0xff3b4f,
  orange: 0xff8a1f,
  yellow: 0xffc928,
  blue: 0x2f8bff,
  purple: 0x9b4dff,
  pink: 0xff5fb8,
};
