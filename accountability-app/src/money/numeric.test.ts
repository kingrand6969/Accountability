import { describe, expect, it } from '@jest/globals';
import { finiteNumber, positiveFiniteNumber } from './numeric';

describe('finance numeric normalization', () => {
  it('accepts finite database numbers and numeric strings', () => {
    expect(finiteNumber('12.50', 'amount')).toBe(12.5);
    expect(finiteNumber(0, 'amount')).toBe(0);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 'Infinity', 'not-a-number'])(
    'rejects corrupt values instead of showing a believable zero: %p',
    (value) => {
      expect(() => finiteNumber(value, 'amount')).toThrow('Invalid amount');
    },
  );

  it('requires positive payment amounts', () => {
    expect(() => positiveFiniteNumber(0, 'Payment amount')).toThrow(
      'Payment amount must be greater than zero.',
    );
  });
});
