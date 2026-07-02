import { describe, it, expect } from '@jest/globals';
import {
  periodRange,
  chartBuckets,
  sumInBucket,
  distinctDays,
  formatHours,
} from './compute';

const NOW = new Date('2026-07-02T15:30:00');

describe('periodRange', () => {
  it('day starts at local midnight today', () => {
    const { start, end } = periodRange('day', NOW);
    expect(start.getDate()).toBe(2);
    expect(start.getHours()).toBe(0);
    expect(end.getTime()).toBe(NOW.getTime());
  });
  it('week spans 7 calendar days', () => {
    const { start } = periodRange('week', NOW);
    expect(start.getDate()).toBe(26); // Jun 26
    expect(start.getMonth()).toBe(5);
  });
  it('month spans 30 calendar days', () => {
    const { start } = periodRange('month', NOW);
    expect(start.getMonth()).toBe(5); // June
    expect(start.getDate()).toBe(3);
  });
});

describe('chartBuckets', () => {
  it('week has 7 daily buckets ending today', () => {
    const b = chartBuckets('week', NOW);
    expect(b).toHaveLength(7);
    expect(b[6].start.getDate()).toBe(2); // today
    expect(b[0].start.getDate()).toBe(26);
  });
  it('month has 4 weekly buckets', () => {
    const b = chartBuckets('month', NOW);
    expect(b).toHaveLength(4);
    expect(b[3].label).toBe('This wk');
    // buckets tile without overlap
    expect(b[0].end.getTime()).toBe(b[1].start.getTime());
  });
});

describe('sumInBucket', () => {
  it('sums only items inside the bucket', () => {
    const bucket = {
      label: 'x',
      start: new Date('2026-07-01T00:00:00'),
      end: new Date('2026-07-02T00:00:00'),
    };
    const items = [
      { d: new Date('2026-07-01T10:00:00'), v: 5 },
      { d: new Date('2026-07-01T23:59:00'), v: 2 },
      { d: new Date('2026-07-02T00:00:00'), v: 100 }, // exclusive end
    ];
    expect(sumInBucket(items, bucket, (i) => i.d, (i) => i.v)).toBe(7);
  });
});

describe('distinctDays', () => {
  it('counts unique local days', () => {
    expect(
      distinctDays([
        new Date('2026-07-01T08:00:00'),
        new Date('2026-07-01T20:00:00'),
        new Date('2026-07-02T09:00:00'),
      ]),
    ).toBe(2);
  });
});

describe('formatHours', () => {
  it('formats minutes only under an hour', () => {
    expect(formatHours(32 * 60)).toBe('32m');
  });
  it('formats hours and minutes', () => {
    expect(formatHours(4 * 3600 + 32 * 60)).toBe('4h 32m');
  });
});
