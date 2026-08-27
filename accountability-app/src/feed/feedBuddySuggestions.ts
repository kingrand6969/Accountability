import type { Candidate } from '../buddy/api';

function normalized(value: string | null) {
  return value?.trim().toLocaleLowerCase() ?? '';
}

export function rankFeedBuddySuggestions(
  candidates: readonly Candidate[],
  viewerArea: string | null,
  limit = 4,
): Candidate[] {
  const area = normalized(viewerArea);
  return [...candidates]
    .sort((left, right) => {
      const leftNearby = area !== '' && normalized(left.area) === area ? 0 : 1;
      const rightNearby = area !== '' && normalized(right.area) === area ? 0 : 1;
      const leftUnnamed = normalized(left.display_name) === '' ? 1 : 0;
      const rightUnnamed = normalized(right.display_name) === '' ? 1 : 0;
      return leftNearby - rightNearby
        || leftUnnamed - rightUnnamed
        || normalized(left.display_name).localeCompare(normalized(right.display_name))
        || left.id.localeCompare(right.id);
    })
    .slice(0, Math.max(0, limit));
}
