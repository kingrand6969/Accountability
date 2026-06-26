/**
 * Returns the Date a reminder should fire, or null if the time is invalid or
 * already in the past (you can't schedule a past notification).
 */
export function reminderTriggerDate(
  startsAtIso: string,
  nowMs: number = Date.now(),
): Date | null {
  const t = new Date(startsAtIso).getTime();
  if (Number.isNaN(t) || t <= nowMs) return null;
  return new Date(t);
}
