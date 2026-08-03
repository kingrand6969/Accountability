import { describe, expect, test } from '@jest/globals';
import { createConfettiGeometry } from './confettiGeometry';

describe('confetti geometry', () => {
  test('creates varied one-shot particle geometry from the supplied source', () => {
    const parts = createConfettiGeometry(2, () => 0.5);

    expect(parts).toEqual([
      { angle: 0.25, dist: 155, delay: 60, duration: 1100, rot: 0, w: 9.5, h: 7 },
      { angle: Math.PI + 0.25, dist: 155, delay: 60, duration: 1100, rot: 0, w: 9.5, h: 7 },
    ]);
  });

  test('creates no particles when the requested count is zero', () => {
    expect(createConfettiGeometry(0, () => 0.5)).toEqual([]);
  });
});
