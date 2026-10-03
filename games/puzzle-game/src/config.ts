// Everything a UA team would want to vary lives here. One build, many variants.
import type { DirectorTimings } from '@kit/director';
import type { Ending } from './sim';

export type Headline = 'calm' | 'challenge' | 'dare';

export interface Config {
  /** 'stuck' runs out of balls a few jars short and offers "+3 balls"; 'win' clears the table and teases level 2. */
  ending: Ending;
  headline: Headline;
  /** The botched opening: the ad fires one feeble shot of its own before handing over. */
  ghostOpening: boolean;
  storeUrl: string;
  /** Portfolio only. Ad builds set this to false. */
  showReplay: boolean;
  muted: boolean;
  /** Debug: the ad plays itself. Used by the smoke test. */
  autoplay: boolean;
  timings: DirectorTimings;
}

// The challenge lines are the ones the real game's store page already uses, so they are proven hooks, not invented claims.
export const HEADLINES: Record<Headline, string> = {
  calm: 'Smash every jar!',
  challenge: 'One shot, max damage!',
  dare: 'Too hard for you?',
};

const DEFAULTS: Config = {
  ending: 'stuck',
  headline: 'dare',
  ghostOpening: true,
  // No store by default: on the portfolio the install button opens the ad full screen. Ad builds pass ?store=.
  storeUrl: '',
  showReplay: true,
  muted: false,
  autoplay: false,
  timings: { hintAfter: 2.5, autoAfter: 6, giveUpAfter: 17, hardCap: 70 },
};

/** Variants can be picked from the URL: ?ending=win&headline=calm&ghost=0 */
export function loadConfig(): Config {
  const q = new URLSearchParams(location.search);
  const cfg: Config = { ...DEFAULTS, timings: { ...DEFAULTS.timings } };
  const ending = q.get('ending');
  if (ending === 'win' || ending === 'stuck') cfg.ending = ending;
  const headline = q.get('headline');
  if (headline === 'calm' || headline === 'challenge' || headline === 'dare') cfg.headline = headline;
  if (q.get('ghost') === '0') cfg.ghostOpening = false;
  if (q.get('replay') === '0') cfg.showReplay = false;
  if (q.get('mute') === '1') cfg.muted = true;
  if (q.get('autoplay') === '1') cfg.autoplay = true;
  const store = q.get('store');
  if (store && /^https:\/\//.test(store)) cfg.storeUrl = store;
  return cfg;
}
