// Everything a UA team would want to vary lives here. One build, many variants.
import type { DirectorTimings } from '@kit/director';
import type { Ending } from './logic';

export type Headline = 'calm' | 'challenge' | 'dare';

export interface Config {
  /** 'stuck' ends on the "+1 bottle" rescue, 'win' ends on a level 2 teaser. */
  ending: Ending;
  headline: Headline;
  /** The opening in which the ad itself tries a pour that the rules refuse. */
  botchedOpening: boolean;
  storeUrl: string;
  showReplay: boolean;
  muted: boolean;
  autoplay: boolean;
  timings: DirectorTimings;
}

export const HEADLINES: Record<Headline, string> = {
  calm: 'Sort the potions!',
  challenge: 'Harder than it looks!',
  dare: 'Can you sort them all?',
};

const DEFAULTS: Config = {
  ending: 'stuck',
  headline: 'calm',
  botchedOpening: true,
  storeUrl: 'https://www.linkedin.com/in/muhammed-arda-canli/',
  showReplay: true,
  muted: false,
  autoplay: false,
  timings: { hintAfter: 2.8, autoAfter: 6.5, giveUpAfter: 17, hardCap: 80 },
};

/** Variants can be picked from the URL: ?ending=win&headline=dare&ghost=0 */
export function loadConfig(): Config {
  const q = new URLSearchParams(location.search);
  const cfg: Config = { ...DEFAULTS, timings: { ...DEFAULTS.timings } };
  const ending = q.get('ending');
  if (ending === 'win' || ending === 'stuck') cfg.ending = ending;
  const headline = q.get('headline');
  if (headline === 'calm' || headline === 'challenge' || headline === 'dare') cfg.headline = headline;
  if (q.get('ghost') === '0') cfg.botchedOpening = false;
  if (q.get('replay') === '0') cfg.showReplay = false;
  if (q.get('mute') === '1') cfg.muted = true;
  if (q.get('autoplay') === '1') cfg.autoplay = true;
  const store = q.get('store');
  if (store && /^https:\/\//.test(store)) cfg.storeUrl = store;
  return cfg;
}
