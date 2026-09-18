// Everything a UA team would want to vary lives here. One build, many variants.
import type { DirectorTimings } from '@kit/director';
import type { Ending } from './logic';

export type Headline = 'calm' | 'challenge' | 'dare';

export interface Config {
  ending: Ending;
  headline: Headline;
  /** The botched opening: a ghost hand plays one bad move before handing over. */
  ghostOpening: boolean;
  storeUrl: string;
  /** Portfolio only. Ad builds set this to false. */
  showReplay: boolean;
  muted: boolean;
  /** Debug: the ad plays itself. Used by the smoke test. */
  autoplay: boolean;
  timings: DirectorTimings;
}

export const HEADLINES: Record<Headline, string> = {
  calm: 'Match 3 cars!',
  challenge: 'Harder than it looks!',
  dare: 'Can you clear the lot?',
};

const DEFAULTS: Config = {
  ending: 'win',
  headline: 'calm',
  ghostOpening: true,
  storeUrl: 'https://www.linkedin.com/in/muhammed-arda-canli/',
  showReplay: true,
  muted: false,
  autoplay: false,
  timings: { hintAfter: 2.5, autoAfter: 6, giveUpAfter: 16, hardCap: 75 },
};

/** Variants can be picked from the URL: ?ending=lose&headline=dare&ghost=0 */
export function loadConfig(): Config {
  const q = new URLSearchParams(location.search);
  const cfg: Config = { ...DEFAULTS, timings: { ...DEFAULTS.timings } };
  const ending = q.get('ending');
  if (ending === 'win' || ending === 'lose') cfg.ending = ending;
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
