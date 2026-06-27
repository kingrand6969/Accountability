import { describe, it, expect } from '@jest/globals';
import {
  haversineMeters,
  totalDistanceMeters,
  paceMinPerKm,
  formatDuration,
  formatPace,
} from './geo';

describe('haversineMeters', () => {
  it('is ~111 km for 1° of longitude at the equator', () => {
    const d = haversineMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    expect(d).toBeGreaterThan(111000);
    expect(d).toBeLessThan(111400);
  });
  it('is ~0 for the same point', () => {
    expect(haversineMeters({ lat: 14.6, lon: 121 }, { lat: 14.6, lon: 121 })).toBeCloseTo(0, 5);
  });
});

describe('totalDistanceMeters', () => {
  it('sums consecutive legs', () => {
    const pts = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 1 },
      { lat: 0, lon: 2 },
    ];
    const d = totalDistanceMeters(pts);
    expect(d).toBeGreaterThan(222000);
    expect(d).toBeLessThan(222800);
  });
  it('is 0 for fewer than two points', () => {
    expect(totalDistanceMeters([{ lat: 1, lon: 1 }])).toBe(0);
  });
});

describe('paceMinPerKm / formatPace', () => {
  it('computes 5:00 /km for 1km in 5 min', () => {
    expect(paceMinPerKm(1000, 300)).toBeCloseTo(5, 5);
    expect(formatPace(1000, 300)).toBe('5:00');
  });
  it('returns null/placeholder for negligible distance', () => {
    expect(paceMinPerKm(0, 300)).toBeNull();
    expect(formatPace(0, 300)).toBe('--:--');
  });
});

describe('formatDuration', () => {
  it('formats mm:ss and h:mm:ss', () => {
    expect(formatDuration(90)).toBe('01:30');
    expect(formatDuration(3661)).toBe('1:01:01');
  });
});
