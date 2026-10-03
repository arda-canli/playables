// Everything a UA team would want to vary lives here. One build, many variants.
import type { DirectorTimings } from '@kit/director';

export type Ending = 'win' | 'shield';
export type Headline = 'calm' | 'challenge' | 'dare';

export interface Config {
  /** 'win': the shot lands and the crane comes down. 'shield': Mary's shield blocks it, one roll short. */
  ending: Ending;
  headline: Headline;
  storeUrl: string;
  showReplay: boolean;
  muted: boolean;
  autoplay: boolean;
  timings: DirectorTimings;
}

export const HEADLINES: Record<Headline, string> = {
  calm: 'Save your pig!',
  challenge: 'Mary trapped your pig!',
  dare: 'Can you get revenge?',
};

const DEFAULTS: Config = {
  ending: 'win',
  headline: 'challenge',
  // No store by default: on the portfolio the install button opens the ad full screen. Ad builds pass ?store=.
  storeUrl: '',
  showReplay: true,
  muted: false,
  autoplay: false,
  timings: { hintAfter: 2.5, autoAfter: 6, giveUpAfter: 17, hardCap: 75 },
};

/** Variants can be picked from the URL: ?ending=shield&headline=dare */
export function loadConfig(): Config {
  const q = new URLSearchParams(location.search);
  const cfg: Config = { ...DEFAULTS, timings: { ...DEFAULTS.timings } };
  const ending = q.get('ending');
  if (ending === 'win' || ending === 'shield') cfg.ending = ending;
  const headline = q.get('headline');
  if (headline === 'calm' || headline === 'challenge' || headline === 'dare') cfg.headline = headline;
  if (q.get('replay') === '0') cfg.showReplay = false;
  if (q.get('mute') === '1') cfg.muted = true;
  if (q.get('autoplay') === '1') cfg.autoplay = true;
  const store = q.get('store');
  if (store && /^https:\/\//.test(store)) cfg.storeUrl = store;
  return cfg;
}
