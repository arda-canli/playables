// World-space layout shared by everything. Units are roughly metres. +z points at the camera.
import type { ColorId } from './logic';

export const LANE_X = [-2.5, -1.25, 0, 1.25, 2.5];
export const ROW_STEP = 1.85;
export const rowZ = (row: number) => -row * ROW_STEP;

export const LOT = { x0: -3.55, x1: 3.55, z0: -5.05, z1: 1.1 };

export const HOLDER_Z = 3.35;
export const SLOT_STEP = 1.13;
export const CAPACITY = 7;
export const slotX = (i: number) => (i - (CAPACITY - 1) / 2) * SLOT_STEP;
export const HOLDER = { x0: -4.05, x1: 4.05, z0: 2.3, z1: 4.4 };

export const TRUCK_Z = 6.0;
export const ROAD = { z0: LOT.z1, z1: 7.45 };

export const CAR_COLORS: Record<ColorId, number> = {
  red: 0xff3d4f,
  yellow: 0xffc21a,
  green: 0x1fc466,
  blue: 0x2a8bff,
  purple: 0x9a5cf0,
  orange: 0xff8a1f,
  teal: 0x14c9c0,
  pink: 0xff6fb5,
};

export const CONFETTI = [0xff3d4f, 0xffc21a, 0x1fc466, 0x2a8bff, 0x9a5cf0, 0xff8a1f, 0xffffff];
