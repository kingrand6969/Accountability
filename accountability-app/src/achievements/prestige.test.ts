import { describe, expect, test } from '@jest/globals';

import { MEDALS, prestigeState } from './catalog';

describe('post-Diamond prestige progression', () => {
  const distance = MEDALS.find((medal) => medal.id === 'distance')!;

  test('extends Diamond to 2x, 5x and 10x targets', () => {
    expect(prestigeState(distance, 500)).toEqual({
      rings: 0,
      next: { ring: 1, at: 1000 },
      progress: 0,
    });
    expect(prestigeState(distance, 1000).rings).toBe(1);
    expect(prestigeState(distance, 2500).rings).toBe(2);
    expect(prestigeState(distance, 5000)).toEqual({
      rings: 3,
      next: null,
      progress: 1,
    });
  });

  test('measures progress inside the current prestige interval', () => {
    expect(prestigeState(distance, 1750).progress).toBeCloseTo(0.5);
  });
});
