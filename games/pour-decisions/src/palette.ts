import type { ColorId } from './logic';

/** Liquid colours: base, a lighter tone for the surface and a deeper tone for the body shading. */
export const LIQUID: Record<ColorId, { base: number; light: number; deep: number }> = {
  red: { base: 0xff4560, light: 0xff8a9b, deep: 0xc81d3e },
  cyan: { base: 0x25c8ff, light: 0x8be4ff, deep: 0x0a8fd6 },
  green: { base: 0x3ddc6b, light: 0x98f5b0, deep: 0x179f45 },
  yellow: { base: 0xffcf33, light: 0xffeb99, deep: 0xe39a00 },
  purple: { base: 0xa566ff, light: 0xd3b3ff, deep: 0x7034d6 },
  orange: { base: 0xff8a2a, light: 0xffc08a, deep: 0xd65a00 },
  pink: { base: 0xff6fc3, light: 0xffb5e0, deep: 0xd63a97 },
  teal: { base: 0x1fd6b5, light: 0x8ff2df, deep: 0x0a9c83 },
  lime: { base: 0xb6e82e, light: 0xdcf78f, deep: 0x7fae0c },
};

export const HIDDEN = { base: 0x3b3f63, light: 0x565b86, deep: 0x2a2d4a };

export const CONFETTI = [0xff4560, 0x25c8ff, 0x3ddc6b, 0xffcf33, 0xa566ff, 0xff8a2a, 0xffffff];
