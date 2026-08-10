export type OrderableStoryGroup = {
  user_id: string;
  isMe: boolean;
  viewed: boolean;
  latestCreatedAt: string;
};

function timestampOrZero(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function orderStoryGroups<T extends OrderableStoryGroup>(
  groups: readonly T[],
): T[] {
  return [...groups].sort((a, b) => {
    const meOrder = Number(b.isMe) - Number(a.isMe);
    if (meOrder !== 0) return meOrder;

    const viewedOrder = Number(a.viewed) - Number(b.viewed);
    if (viewedOrder !== 0) return viewedOrder;

    const recencyOrder =
      timestampOrZero(b.latestCreatedAt) - timestampOrZero(a.latestCreatedAt);
    if (recencyOrder !== 0) return recencyOrder;

    return a.user_id.localeCompare(b.user_id);
  });
}
