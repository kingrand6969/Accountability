export type Cadence = 'daily' | 'weekly' | 'monthly';

/** Stable period number: same all day/week/month, then advances by one. */
export function periodNumber(cadence: Cadence, now: Date): number {
  const days = Math.floor(now.getTime() / 86400000);
  if (cadence === 'daily') return days;
  if (cadence === 'weekly') return Math.floor(days / 7);
  return now.getFullYear() * 12 + now.getMonth();
}

/** Deterministic pick: everyone with the same prefs sees the same rotation,
 *  and it only changes when the period rolls over. */
export function pickIndex(cadence: Cadence, now: Date, length: number): number {
  if (length <= 0) return 0;
  return periodNumber(cadence, now) % length;
}
