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

/** The install button. Must only ever be called from a real user gesture. */
export function openStore(url: string): void {
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
      // On the open web a store link means a UA test page: open it. Without one this is the portfolio,
      // where there is no store, so the button plays the ad properly instead.
      if (url) window.open(url, '_blank', 'noopener');
      else playFullScreen();
  }
}

/** Inside the portfolio's phone frame: open the ad full screen. Already full screen: play it again from the start. */
function playFullScreen(): void {
  if (window.top !== window.self) {
    const u = new URL(location.href);
    u.searchParams.delete('replay');
    window.open(u.href, '_top');
  } else location.reload();
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
