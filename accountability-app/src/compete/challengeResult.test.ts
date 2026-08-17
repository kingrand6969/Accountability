import { describe, expect, test } from '@jest/globals';
import { hasVerifiedChallengeWin } from './challengeResult';

const row = (user_id: string, rnk: number, score: number) => ({
  user_id, rnk, score, display_name: null, avatar_url: null,
});

describe('hasVerifiedChallengeWin', () => {
  test('requires an ended challenge caller to be a positive-scoring rank-one participant', () => {
    expect(hasVerifiedChallengeWin('me', 2, [row('me', 1, 5), row('them', 2, 3)])).toBe(true);
    expect(hasVerifiedChallengeWin('me', 2, [row('me', 2, 3), row('them', 1, 5)])).toBe(false);
    expect(hasVerifiedChallengeWin('me', 2, [row('me', 1, 0), row('them', 1, 0)])).toBe(false);
    expect(hasVerifiedChallengeWin('me', 1, [row('me', 1, 5)])).toBe(false);
  });
});
