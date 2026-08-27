import { describe, expect, test } from '@jest/globals';

import { buildQuietFeedRows } from './quietFeedRows';

const posts = Array.from({ length: 6 }, (_, index) => ({
  id: `post-${index + 1}`,
  created_at: `2026-08-${String(20 - index).padStart(2, '0')}T00:00:00Z`,
}));

describe('buildQuietFeedRows', () => {
  test('places one buddy rail after the first post', () => {
    expect(buildQuietFeedRows({
      posts,
      showBuddyRail: true,
      showAds: false,
      generation: 'owner-a:owner-a',
    }).map((row) => row.kind)).toEqual([
      'post', 'buddies', 'post', 'post', 'post', 'post', 'post',
    ]);
  });

  test('omits the rail when no candidates are available', () => {
    expect(buildQuietFeedRows({
      posts: posts.slice(0, 2),
      showBuddyRail: false,
      showAds: false,
      generation: 'owner-a:owner-a',
    }).map((row) => row.kind)).toEqual(['post', 'post']);
  });

  test('preserves the existing five-post ad cadence', () => {
    expect(buildQuietFeedRows({
      posts,
      showBuddyRail: true,
      showAds: true,
      generation: 'owner-a:owner-a',
    }).map((row) => row.kind)).toEqual([
      'post', 'buddies', 'post', 'post', 'post', 'post', 'ad', 'post',
    ]);
  });
});
