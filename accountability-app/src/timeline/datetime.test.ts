import { describe, it, expect } from '@jest/globals';
import {
  validateDateString,
  validateTimeString,
  toIsoFromLocal,
  toLocalDateString,
} from './datetime';

describe('validateDateString', () => {
  it('accepts a valid date', () => {
    expect(validateDateString('2026-06-26')).toBeNull();
  });
  it('rejects the wrong format', () => {
    expect(validateDateString('26-06-2026')).toBe('Use the format YYYY-MM-DD.');
  });
  it('rejects an impossible date', () => {
    expect(validateDateString('2026-02-30')).toBe('That date is not valid.');
  });
  it('requires a value', () => {
    expect(validateDateString('')).toBe('Date is required.');
  });
});

describe('validateTimeString', () => {
  it('accepts 24-hour times', () => {
    expect(validateTimeString('00:00')).toBeNull();
    expect(validateTimeString('14:30')).toBeNull();
    expect(validateTimeString('23:59')).toBeNull();
  });
  it('rejects out-of-range or malformed times', () => {
    expect(validateTimeString('24:00')).toBe('Use 24-hour time, e.g. 14:30.');
    expect(validateTimeString('9:5')).toBe('Use 24-hour time, e.g. 14:30.');
  });
});

describe('toIsoFromLocal / toLocalDateString round-trip', () => {
  it('preserves the local date and time components', () => {
    const iso = toIsoFromLocal('2026-06-26', '14:30');
    const back = new Date(iso);
    expect(toLocalDateString(back)).toBe('2026-06-26');
    expect(back.getHours()).toBe(14);
    expect(back.getMinutes()).toBe(30);
  });
});
