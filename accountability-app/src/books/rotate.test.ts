import { describe, it, expect } from '@jest/globals';
import { periodNumber, pickIndex } from './rotate';

describe('periodNumber', () => {
  it('daily changes across days but not within a day', () => {
    const a = periodNumber('daily', new Date('2026-07-02T08:00:00Z'));
    const b = periodNumber('daily', new Date('2026-07-02T22:00:00Z'));
    const c = periodNumber('daily', new Date('2026-07-03T08:00:00Z'));
    expect(a).toBe(b);
    expect(c).toBe(a + 1);
  });
  it('weekly advances once per 7 days', () => {
    const a = periodNumber('weekly', new Date('2026-07-02T12:00:00Z'));
    const b = periodNumber('weekly', new Date('2026-07-09T12:00:00Z'));
    expect(b).toBe(a + 1);
  });
  it('monthly advances once per calendar month', () => {
    const a = periodNumber('monthly', new Date('2026-07-15T12:00:00Z'));
    const b = periodNumber('monthly', new Date('2026-08-01T12:00:00Z'));
    expect(b).toBe(a + 1);
  });
});

describe('pickIndex', () => {
  it('stays within bounds and is stable for a period', () => {
    const now = new Date('2026-07-02T12:00:00Z');
    const i = pickIndex('daily', now, 10);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(10);
    expect(pickIndex('daily', new Date('2026-07-02T23:00:00Z'), 10)).toBe(i);
  });
  it('handles empty lists', () => {
    expect(pickIndex('daily', new Date(), 0)).toBe(0);
  });
});
