import type { StandingRow } from './api';

export function hasVerifiedChallengeWin(
  userId: string | null,
  participantCount: number,
  standings: readonly StandingRow[],
): boolean {
  if (!userId || participantCount < 2) return false;
  const mine = standings.find((row) => row.user_id === userId);
  return !!mine && mine.rnk === 1 && mine.score > 0;
}
