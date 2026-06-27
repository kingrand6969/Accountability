import { describe, it, expect } from '@jest/globals';
import { scaleNutrient, scaleMacro } from './compute';

describe('scaleNutrient', () => {
  it('scales per-100g calories to a serving', () => {
    expect(scaleNutrient(89, 100)).toBe(89);
    expect(scaleNutrient(89, 150)).toBe(134); // 89 * 1.5 = 133.5 -> 134
    expect(scaleNutrient(200, 50)).toBe(100);
  });
  it('returns 0 for invalid input', () => {
    expect(scaleNutrient(NaN, 100)).toBe(0);
    expect(scaleNutrient(100, NaN)).toBe(0);
  });
});

describe('scaleMacro', () => {
  it('keeps one decimal place', () => {
    expect(scaleMacro(1.1, 150)).toBe(1.7); // 1.65 -> 1.7
    expect(scaleMacro(12, 100)).toBe(12);
  });
});
