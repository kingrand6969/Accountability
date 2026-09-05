export const MOBILE_FEED_SHARING_NOTICE = 'Feed sharing is available in the mobile app';

export type FeedShareAvailability = Readonly<
  | { available: true; reason: null }
  | { available: false; reason: typeof MOBILE_FEED_SHARING_NOTICE }
>;

export function feedShareAvailability(platform: string): FeedShareAvailability {
  return platform === 'web'
    ? { available: false, reason: MOBILE_FEED_SHARING_NOTICE }
    : { available: true, reason: null };
}
