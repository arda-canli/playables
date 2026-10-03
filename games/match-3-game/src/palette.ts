import type { Color } from './logic';

/** Tile colours: a light top, the base, a deep bottom and the outline. Saturated and candy-like on purpose. */
export const TILE: Record<Color, { light: string; base: string; deep: string; line: string; fx: number }> = {
  leaf: { light: '#ffc2e4', base: '#ff5fb4', deep: '#d81b7d', line: '#8f0c50', fx: 0xff6fbf },
  lantern: { light: '#fff3a0', base: '#ffc928', deep: '#f08d00', line: '#9a5200', fx: 0xffd23f },
  pack: { light: '#b8f7a0', base: '#41d65a', deep: '#16963c', line: '#0b5a24', fx: 0x52e06a },
  apple: { light: '#ffb0a0', base: '#ff3d3d', deep: '#c4121f', line: '#7a0812', fx: 0xff4a4a },
  bolt: { light: '#b0dcff', base: '#3c95ff', deep: '#1655d6', line: '#0a2f8a', fx: 0x4aa0ff },
};

export const GOLD = { light: '#fff1a6', base: '#ffc93c', deep: '#d68a10', line: '#8a5200' };
export const VIOLET = { panel: 0x3a1d8a, deep: 0x220f5c, line: 0x15073a };
export const CONFETTI = [0xff5fb4, 0xffc928, 0x41d65a, 0x3c95ff, 0xff3d3d, 0xffffff, 0xb07bff];
