import { describe, it, expect } from '@jest/globals';
import { validateEmail, validatePassword } from './validation';

describe('validateEmail', () => {
  it('rejects an empty email', () => {
    expect(validateEmail('')).toBe('Email is required.');
  });
  it('rejects a malformed email', () => {
    expect(validateEmail('not-an-email')).toBe('Enter a valid email address.');
  });
  it('accepts a valid email (returns null)', () => {
    expect(validateEmail('user@example.com')).toBeNull();
  });
  it('trims surrounding whitespace before validating', () => {
    expect(validateEmail('  user@example.com  ')).toBeNull();
  });
});

describe('validatePassword', () => {
  it('rejects an empty password', () => {
    expect(validatePassword('')).toBe('Password is required.');
  });
  it('rejects a password shorter than 8 characters', () => {
    expect(validatePassword('short')).toBe(
      'Password must be at least 8 characters.',
    );
  });
  it('accepts an 8+ character password (returns null)', () => {
    expect(validatePassword('longenough')).toBeNull();
  });
});
