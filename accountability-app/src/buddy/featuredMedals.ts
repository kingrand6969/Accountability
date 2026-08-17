export const MAX_FEATURED_MEDALS = 4;

export function normalizeFeaturedMedalIds(
  requested: readonly string[] | null | undefined,
  earnedIds: readonly string[],
): string[] {
  const earned = new Set(earnedIds);
  const selected = new Set<string>();

  for (const id of requested ?? earnedIds) {
    if (earned.has(id)) selected.add(id);
    if (selected.size === MAX_FEATURED_MEDALS) break;
  }

  return [...selected];
}
