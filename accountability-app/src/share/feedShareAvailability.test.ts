import { describe, expect, test } from '@jest/globals';

import { feedShareAvailability, MOBILE_FEED_SHARING_NOTICE } from './feedShareAvailability';

describe('Feed Share Studio platform availability', () => {
  test('explicitly gates web with the mobile-app notice', () => {
    expect(feedShareAvailability('web')).toEqual({
      available: false,
      reason: MOBILE_FEED_SHARING_NOTICE,
    });
  });

  test.each(['ios', 'android'])('keeps %s Feed sharing available', (platform) => {
    expect(feedShareAvailability(platform)).toEqual({ available: true, reason: null });
  });
});
