import { describe, expect, test } from '@jest/globals';
import {
  chooseAchievementDestination,
  confirmAchievementShare,
  initialAchievementShareDecision,
  resetAchievementShareDecision,
} from './achievementShareDecision';

describe('achievement share decision', () => {
  test('starts without a destination and unconfirmed', () => {
    expect(initialAchievementShareDecision()).toEqual({ destination: null, confirmed: false });
  });

  test.each(['feed', 'story', 'private'] as const)('choosing %s selects it without confirming', (destination) => {
    const original = initialAchievementShareDecision();
    const selected = chooseAchievementDestination(original, destination);

    expect(selected).toEqual({ destination, confirmed: false });
    expect(original).toEqual({ destination: null, confirmed: false });
  });

  test('confirm does nothing until a destination is selected', () => {
    const original = initialAchievementShareDecision();
    expect(confirmAchievementShare(original)).toBe(original);
    expect(original).toEqual({ destination: null, confirmed: false });
  });

  test('confirm marks a selected destination confirmed without mutation', () => {
    const selected = chooseAchievementDestination(initialAchievementShareDecision(), 'feed');
    expect(confirmAchievementShare(selected)).toEqual({ destination: 'feed', confirmed: true });
    expect(selected).toEqual({ destination: 'feed', confirmed: false });
  });

  test('reset returns a fresh initial decision', () => {
    const selected = confirmAchievementShare(
      chooseAchievementDestination(initialAchievementShareDecision(), 'story'),
    );
    expect(resetAchievementShareDecision(selected)).toEqual({ destination: null, confirmed: false });
  });
});
