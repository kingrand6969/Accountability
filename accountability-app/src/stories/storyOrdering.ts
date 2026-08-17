export type OrderableStoryGroup = {
  user_id: string;
  isMe: boolean;
  viewed: boolean;
  latestCreatedAt: string;
};

function classRank(group: OrderableStoryGroup): number {
  if (group.isMe) return 0;
  return group.viewed ? 2 : 1;
}

export function orderStoryGroups<T extends OrderableStoryGroup>(
  groups: readonly T[],
): T[] {
  return [...groups].sort((a, b) => {
    const rankOrder = classRank(a) - classRank(b);
    if (rankOrder !== 0) return rankOrder;

    const aTimestamp = Date.parse(a.latestCreatedAt);
    const bTimestamp = Date.parse(b.latestCreatedAt);
    const aValid = !Number.isNaN(aTimestamp);
    const bValid = !Number.isNaN(bTimestamp);

    if (aValid !== bValid) return aValid ? -1 : 1;
    if (aValid && bValid && aTimestamp !== bTimestamp) {
      return aTimestamp > bTimestamp ? -1 : 1;
    }

    return a.user_id.localeCompare(b.user_id);
  });
}
