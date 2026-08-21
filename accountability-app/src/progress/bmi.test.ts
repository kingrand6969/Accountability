import { describe, expect, test } from '@jest/globals';

import { calculateBmi } from './bmi';

describe('calculateBmi', () => {
  test('returns metric BMI rounded to one decimal without a category', () => {
    expect(calculateBmi(70, 175)).toBe(22.9);
  });

  test.each([
    [Number.NaN, 175],
    [Number.POSITIVE_INFINITY, 175],
    [19.99, 175],
    [500.01, 175],
    [70, Number.NaN],
    [70, Number.NEGATIVE_INFINITY],
    [70, 79.99],
    [70, 250.01],
  ])('rejects invalid weight %s or height %s with safe copy', (weightKg, heightCm) => {
    expect(() => calculateBmi(weightKg, heightCm)).toThrow(
      'Enter valid weight and height values.',
    );
  });

  test.each([
    [20, 80],
    [500, 250],
  ])('accepts inclusive boundary values', (weightKg, heightCm) => {
    expect(calculateBmi(weightKg, heightCm)).toBe(
      Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10,
    );
  });
});
