import { describe, expect, test } from '@jest/globals';
import { challengeEnded, daysLeft } from './challengeTime';

describe('challenge expiry clock', () => {
  const now = Date.parse('2026-08-03T12:00:00.000Z');

  test('marks challenges ended at the exact expiry boundary', () => {
    expect(challengeEnded('2026-08-03T12:00:00.000Z', now)).toBe(true);
    expect(challengeEnded('2026-08-03T12:00:00.001Z', now)).toBe(false);
  });

  test('reports remaining days from the supplied render timestamp', () => {
    expect(daysLeft('2026-08-03T12:00:00.000Z', now)).toBe('Ended');
    expect(daysLeft('2026-08-04T11:59:59.000Z', now)).toBe('1 day left');
    expect(daysLeft('2026-08-05T12:00:00.000Z', now)).toBe('2 days left');
  });
});
