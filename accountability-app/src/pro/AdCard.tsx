import { renderFeedAd } from './adAdapter';

/**
 * Quiet, scrollable in-feed ad slot for both Free and Pro. It renders nothing
 * until a configured native provider adapter is ready, so staging never shows
 * a fake sponsored card or requests an ad without provider credentials.
 */
export function AdCard() {
  return renderFeedAd();
}
