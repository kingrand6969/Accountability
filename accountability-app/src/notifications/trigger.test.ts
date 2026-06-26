import { describe, it, expect } from '@jest/globals';
import { reminderTriggerDate } from './trigger';

describe('reminderTriggerDate', () => {
  const now = new Date('2026-06-26T12:00:00Z').getTime();

  it('returns a Date for a future time', () => {
    const d = reminderTriggerDate('2026-06-26T15:00:00Z', now);
    expect(d).not.toBeNull();
    expect(d?.getTime()).toBe(new Date('2026-06-26T15:00:00Z').getTime());
  });

  it('returns null for a past time', () => {
    expect(reminderTriggerDate('2026-06-26T09:00:00Z', now)).toBeNull();
  });

  it('returns null for the exact current time', () => {
    expect(reminderTriggerDate('2026-06-26T12:00:00Z', now)).toBeNull();
  });

  it('returns null for an invalid date string', () => {
    expect(reminderTriggerDate('not-a-date', now)).toBeNull();
  });
});
