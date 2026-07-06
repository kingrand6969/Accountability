import { describe, it, expect } from '@jest/globals';
import {
  haversineMeters,
  totalDistanceMeters,
  paceMinPerKm,
  formatDuration,
  formatDurationLong,
  formatPace,
  trimRouteEnds,
} from './geo';

// ~0.001° latitude ≈ 111 m — build a straight line of such steps
const line = (n: number) => Array.from({ length: n }, (_, i) => ({ lat: i * 0.001, lon: 0 }));

describe('trimRouteEnds', () => {
  it('drops points within the privacy zone of both ends', () => {
    const pts = line(10); // ~1 km straight, ~111 m spacing
    const trimmed = trimRouteEnds(pts, 130);
    // first ~130 m and last ~130 m removed → interior remains
    expect(trimmed.length).toBeLessThan(pts.length);
    expect(trimmed[0]).not.toEqual(pts[0]);
    expect(trimmed[trimmed.length - 1]).not.toEqual(pts[pts.length - 1]);
  });
  it('keeps the full route when too short to trim', () => {
    const pts = line(3);
    expect(trimRouteEnds(pts, 130)).toEqual(pts);
  });
});

describe('formatDurationLong', () => {
  it('formats hours and minutes', () => {
    expect(formatDurationLong(3600 + 31 * 60)).toBe('1h 31m');
    expect(formatDurationLong(31 * 60)).toBe('31m');
    expect(formatDurationLong(45)).toBe('45s');
  });
});

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
