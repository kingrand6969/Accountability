import { toLocalDateString } from '../timeline/datetime';

export type Period = 'day' | 'week' | 'month';

export type Bucket = { label: string; start: Date; end: Date };

/** Inclusive local start / exclusive end for a stats period ending now. */
export function periodRange(period: Period, now: Date): { start: Date; end: Date } {
  const end = new Date(now);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === 'week') start.setDate(start.getDate() - 6); // this day + 6 back
  if (period === 'month') start.setDate(start.getDate() - 29);
  return { start, end };
}

/** Chart buckets: 7 daily bars for a week, 4 weekly bars for a month. */
export function chartBuckets(period: Period, now: Date): Bucket[] {
  if (period === 'week') {
    return Array.from({ length: 7 }, (_, i) => {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - (6 - i));
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const label = start.toLocaleDateString(undefined, { weekday: 'narrow' });
      return { label, start, end };
    });
  }
  // month: 4 weekly buckets, oldest first
  return Array.from({ length: 4 }, (_, i) => {
    const end = new Date(now);
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() - (3 - i) * 7 + 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    const label = i === 3 ? 'This wk' : `${3 - i}w ago`;
    return { label, start, end };
  });
}

/** Sum a numeric field for items whose date falls inside the bucket. */
export function sumInBucket<T>(
  items: T[],
  bucket: Bucket,
  getDate: (t: T) => Date,
  getValue: (t: T) => number,
): number {
  let sum = 0;
  for (const it of items) {
    const d = getDate(it);
    if (d >= bucket.start && d < bucket.end) sum += getValue(it);
  }
  return sum;
}

/** Distinct local days that have at least one item — "days you showed up". */
export function distinctDays(dates: Date[]): number {
  return new Set(dates.map((d) => toLocalDateString(d))).size;
}

/** Seconds -> friendly '4h 32m' / '32m'. */
export function formatHours(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}
