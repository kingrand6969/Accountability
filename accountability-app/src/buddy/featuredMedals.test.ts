import { describe, expect, test } from '@jest/globals';

import {
  MAX_FEATURED_MEDALS,
  normalizeFeaturedMedalIds,
} from './featuredMedals';

describe('featured Buddy Card medals', () => {
  const earnedIds = ['distance', 'streak', 'community', 'consistency', 'early_bird'];

  test('preserves the owner-selected order', () => {
    expect(
      normalizeFeaturedMedalIds(['community', 'distance', 'streak'], earnedIds),
    ).toEqual(['community', 'distance', 'streak']);
  });

  test('deduplicates selections and caps them at the exported maximum', () => {
    expect(MAX_FEATURED_MEDALS).toBe(4);
    expect(
      normalizeFeaturedMedalIds(
        ['distance', 'distance', 'streak', 'community', 'consistency', 'early_bird'],
        earnedIds,
      ),
    ).toEqual(['distance', 'streak', 'community', 'consistency']);
  });

  test('rejects unknown or unearned medal ids', () => {
    expect(
      normalizeFeaturedMedalIds(
        ['unknown', 'community', 'locked_medal', 'distance'],
        earnedIds,
      ),
    ).toEqual(['community', 'distance']);
  });

  test.each([null, undefined])(
    'uses the first four earned medals for legacy data without a selection (%p)',
    (requested) => {
      expect(normalizeFeaturedMedalIds(requested, earnedIds)).toEqual([
        'distance',
        'streak',
        'community',
        'consistency',
      ]);
    },
  );
});
