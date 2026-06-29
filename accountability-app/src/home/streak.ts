/** Previous calendar day for a 'YYYY-MM-DD' string (local). */
export function prevDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * Consecutive-day streak ending today (or yesterday, so it doesn't reset to 0
 * the moment a new day starts before you've logged anything).
 */
export function computeStreak(days: Set<string>, today: string): number {
  let cursor = today;
  if (!days.has(cursor)) {
    cursor = prevDay(today);
    if (!days.has(cursor)) return 0;
  }
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = prevDay(cursor);
  }
  return streak;
}
