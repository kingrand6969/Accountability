import { describe, it, expect } from '@jest/globals';
import { validateBirthday } from './validation';

describe('validateBirthday', () => {
  it('accepts an empty value (birthday is optional)', () => {
    expect(validateBirthday('')).toBeNull();
    expect(validateBirthday('   ')).toBeNull();
  });
  it('accepts a well-formed valid date', () => {
    expect(validateBirthday('1995-07-21')).toBeNull();
  });
  it('rejects the wrong format', () => {
    expect(validateBirthday('21/07/1995')).toBe('Use the format YYYY-MM-DD.');
  });
  it('rejects an impossible calendar date', () => {
    expect(validateBirthday('2025-02-30')).toBe('That date is not valid.');
  });
});
