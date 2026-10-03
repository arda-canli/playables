// The level as data, in one 390 x 844 design space (portrait phone). The tank sits on the board:
// bricks pour into the tank, and the holes the player's matches leave are the only way down and out.

export type Kind = 'a' | 'p' | 'l' | 'b';
export interface Pos {
  r: number;
  c: number;
}

export const COLS = 7;
export const ROWS = 6;
export const CELL = 45;
export const BOARD = { x: 37.5, y: 470 };
export const BOARD_W = COLS * CELL;
export const BOARD_H = ROWS * CELL;

/** Bricks live on a grid of SAND-sized cells that covers the stream, the tank and the board. */
export const SAND = 5;
export const PER_CELL = CELL / SAND;
export const GRID = { x: BOARD.x, y: 200, cols: BOARD_W / SAND, rows: (BOARD.y + BOARD_H - 200) / SAND };
export const BOARD_ROW0 = (BOARD.y - GRID.y) / SAND;

export const TANK = { x0: BOARD.x, x1: BOARD.x + BOARD_W, y0: 250, y1: BOARD.y };
/** The pig stands on a stone pedestal at the right of the tank. */
export const LEDGE = { x0: 262.5, x1: TANK.x1, y: 420 };
export const PIG = { x: 312, y: 420, scale: 0.42 };
/** Bricks above this line (the pig's chest) mean he is about to be buried. */
export const DANGER_Y = 352;
export const BUCKET = { x: 168, y: 192, mouth: 166 };

/**
 * Hand-made board. No three in a line to start with, and two moves that line up in column 3:
 * the top half first (the guided move), the bottom half next. Together they open a channel to the bottom.
 */
export const START = ['apblabp', 'baplbpa', 'pbaplab', 'apbapba', 'blpablp', 'paabapl'];
export const GUIDE: [Pos, Pos] = [
  { r: 2, c: 3 },
  { r: 2, c: 4 },
];
/** Matches needed to fill the dice meter. */
export const DICE = 3;

export const WORLD = {
  rescue: { x0: 0, y0: 84, x1: 390, y1: BOARD.y + BOARD_H + 20 },
  roll: { x0: 0, y0: 190, x1: 390, y1: 720 },
  attack: { x0: 0, y0: 70, x1: 390, y1: 820 },
};
