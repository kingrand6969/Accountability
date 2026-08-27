import { describe, expect, test } from '@jest/globals';
import { rankFeedBuddySuggestions } from './feedBuddySuggestions';

const candidate = (
  id: string,
  display_name: string | null,
  area: string | null,
) => ({ id, display_name, area, avatar_url: null });

describe('rankFeedBuddySuggestions', () => {
  test('ranks same-area candidates first, then uses normalized names and IDs deterministically', () => {
    const candidates = [
      candidate('zara', 'Zara', 'Other'),
      candidate('bravo', 'bravo', ' Perth '),
      candidate('alpha', ' Alpha ', 'PERTH'),
      candidate('a-tie', 'Same', 'Perth'),
      candidate('b-tie', ' same ', 'Perth'),
    ];

    expect(rankFeedBuddySuggestions(candidates, ' perth ', 5).map(({ id }) => id))
      .toEqual(['alpha', 'bravo', 'a-tie', 'b-tie', 'zara']);
  });

  test('places unnamed candidates after named candidates and caps results at four by default', () => {
    const candidates = [
      candidate('unnamed-null', null, 'Perth'),
      candidate('named-b', 'Beta', 'Elsewhere'),
      candidate('unnamed-space', '   ', 'Perth'),
      candidate('named-a', 'Alpha', 'Elsewhere'),
      candidate('named-c', 'Charlie', 'Elsewhere'),
    ];

    expect(rankFeedBuddySuggestions(candidates, null).map(({ id }) => id))
      .toEqual(['named-a', 'named-b', 'named-c', 'unnamed-null']);
  });

  test('does not mutate frozen API results and returns no rows for a negative limit', () => {
    const candidates = Object.freeze([
      Object.freeze(candidate('b', 'Beta', null)),
      Object.freeze(candidate('a', 'Alpha', null)),
    ]);

    expect(() => rankFeedBuddySuggestions(candidates, null)).not.toThrow();
    expect(rankFeedBuddySuggestions(candidates, null, -1)).toEqual([]);
    expect(candidates.map(({ id }) => id)).toEqual(['b', 'a']);
  });
});
