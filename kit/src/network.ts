// One place that knows how each ad network wants to be talked to.
// On a normal web page (the portfolio) every branch falls through to plain browser behaviour.

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    mraid?: any;
    FbPlayableAd?: { onCTAClick: () => void };
    ExitApi?: { exit: () => void };
    install?: () => void; // Mintegral
    gameReady?: () => void; // Mintegral
    gameEnd?: () => void; // Mintegral
    playableSDK?: { openAppStore: () => void }; // TikTok / Pangle
  }
}

export type NetworkName = 'meta' | 'google' | 'mintegral' | 'tiktok' | 'mraid' | 'web';

export function detectNetwork(): NetworkName {
  if (window.FbPlayableAd) return 'meta';
  if (window.ExitApi) return 'google';
  if (window.playableSDK) return 'tiktok';
  if (typeof window.install === 'function') return 'mintegral';
  if (window.mraid) return 'mraid';
  return 'web';
}

/**
 * The install button. Must only ever be called from a real user gesture.
 * `ended`: the ad is over (its end card, or the last offer before it).
 */
export function openStore(url: string, ended = false): void {
  switch (detectNetwork()) {
    case 'meta':
      window.FbPlayableAd!.onCTAClick();
      return;
    case 'google':
      window.ExitApi!.exit();
      return;
    case 'tiktok':
      window.playableSDK!.openAppStore();
      return;
    case 'mintegral':
      window.install!();
      return;
    case 'mraid':
      window.mraid.open(url);
      return;
    default:
      // The open web, i.e. the portfolio. Mid-ad inside its phone frame, the button opens the ad full screen;
      // once the ad is over, or when it is already full screen, it goes to the link like a real install button.
      if (!ended && window.top !== window.self) openFullScreen();
      else if (url) window.open(url, '_blank', 'noopener');
  }
}

/** From the portfolio's phone frame to the same ad, full screen. */
function openFullScreen(): void {
  const u = new URL(location.href);
  u.searchParams.delete('replay');
  window.open(u.href, '_top');
}

/** Calls start() once the ad container says it is ready. Immediately on the open web. */
export function whenAdReady(start: () => void): void {
  const mraid = window.mraid;
  if (!mraid) {
    start();
    return;
  }
  const go = () => {
    if (mraid.isViewable && !mraid.isViewable()) {
      const onViewable = (v: boolean) => {
        if (!v) return;
        mraid.removeEventListener('viewableChange', onViewable);
        start();
      };
      mraid.addEventListener('viewableChange', onViewable);
    } else start();
  };
  if (mraid.getState && mraid.getState() === 'loading') mraid.addEventListener('ready', go);
  else go();
}

/** Fires with false when the ad or tab is hidden, true when it comes back. Used to pause the loop and mute audio. */
export function onVisibility(cb: (visible: boolean) => void): void {
  document.addEventListener('visibilitychange', () => cb(document.visibilityState === 'visible'));
  window.addEventListener('pagehide', () => cb(false));
  window.addEventListener('pageshow', () => cb(true));
  const mraid = window.mraid;
  if (mraid?.addEventListener) mraid.addEventListener('viewableChange', (v: boolean) => cb(!!v));
}

export function notifyReady(): void {
  try {
    window.gameReady?.();
  } catch {
    /* network hook missing: fine */
  }
}

export function notifyEnd(): void {
  try {
    window.gameEnd?.();
  } catch {
    /* network hook missing: fine */
  }
}
