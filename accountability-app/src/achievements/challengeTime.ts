const DAY_MS = 86_400_000;

export function daysLeft(ends: string, now: number): string {
  const remainingMs = new Date(ends).getTime() - now;
  if (remainingMs <= 0) return 'Ended';
  const remainingDays = Math.ceil(remainingMs / DAY_MS);
  return remainingDays === 1 ? '1 day left' : `${remainingDays} days left`;
}

export function challengeEnded(ends: string, now: number): boolean {
  return new Date(ends).getTime() <= now;
}
