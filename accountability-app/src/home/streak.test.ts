import { describe, it, expect } from '@jest/globals';
import { computeStreak, prevDay } from './streak';

describe('prevDay', () => {
  it('handles month boundaries', () => {
    expect(prevDay('2026-07-01')).toBe('2026-06-30');
    expect(prevDay('2026-06-15')).toBe('2026-06-14');
  });
});

describe('computeStreak', () => {
  const today = '2026-06-30';
  it('counts consecutive days ending today', () => {
    const days = new Set(['2026-06-30', '2026-06-29', '2026-06-28']);
    expect(computeStreak(days, today)).toBe(3);
  });
  it('stops at the first gap', () => {
    const days = new Set(['2026-06-30', '2026-06-29', '2026-06-27']);
    expect(computeStreak(days, today)).toBe(2);
  });
  it('still counts if today is empty but yesterday is active', () => {
    const days = new Set(['2026-06-29', '2026-06-28']);
    expect(computeStreak(days, today)).toBe(2);
  });
  it('is 0 with no recent activity', () => {
    expect(computeStreak(new Set(['2026-06-20']), today)).toBe(0);
    expect(computeStreak(new Set(), today)).toBe(0);
  });
});
