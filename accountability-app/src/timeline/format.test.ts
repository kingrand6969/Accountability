import { describe, it, expect } from '@jest/globals';
import { formatHourLabel } from './format';

describe('formatHourLabel', () => {
  it('formats midnight and noon', () => {
    expect(formatHourLabel(0)).toBe('12 AM');
    expect(formatHourLabel(12)).toBe('12 PM');
  });
  it('formats morning and evening hours', () => {
    expect(formatHourLabel(9)).toBe('9 AM');
    expect(formatHourLabel(13)).toBe('1 PM');
    expect(formatHourLabel(23)).toBe('11 PM');
  });
});
