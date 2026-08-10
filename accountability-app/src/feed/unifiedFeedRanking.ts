export type UnifiedFeedSource =
  | 'self'
  | 'buddy'
  | 'followed_person'
  | 'joined_group'
  | 'followed_page'
  | 'suggested';

export type RankedFeedCandidate = {
  id: string;
  source: UnifiedFeedSource;
  createdAt: string;
  score: number;
};

const SOURCE_PRIORITY: Record<Exclude<UnifiedFeedSource, 'suggested'>, number> = {
  self: 0,
  buddy: 1,
  followed_person: 2,
  joined_group: 3,
  followed_page: 4,
};

type InterleaveUnifiedFeedInput<T extends RankedFeedCandidate> = {
  connections: readonly T[];
  suggestions: readonly T[];
  limit: number;
};

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function comparableScore(value: number): number {
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function compareId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareWithinTier(left: RankedFeedCandidate, right: RankedFeedCandidate): number {
  return timestamp(right.createdAt) - timestamp(left.createdAt)
    || comparableScore(right.score) - comparableScore(left.score)
    || compareId(left.id, right.id);
}

function compareConnections(left: RankedFeedCandidate, right: RankedFeedCandidate): number {
  const leftPriority = left.source === 'suggested'
    ? Number.POSITIVE_INFINITY
    : SOURCE_PRIORITY[left.source];
  const rightPriority = right.source === 'suggested'
    ? Number.POSITIVE_INFINITY
    : SOURCE_PRIORITY[right.source];
  return leftPriority - rightPriority || compareWithinTier(left, right);
}

function uniqueById<T extends RankedFeedCandidate>(candidates: readonly T[]): T[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  });
}

export function interleaveUnifiedFeed<T extends RankedFeedCandidate>({
  connections,
  suggestions,
  limit,
}: InterleaveUnifiedFeedInput<T>): T[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const boundedLimit = Math.floor(limit);
  const rankedConnections = uniqueById(connections).sort(compareConnections);
  if (rankedConnections.length === 0) return [];

  const connectionIds = new Set(rankedConnections.map(({ id }) => id));
  const rankedSuggestions = uniqueById(
    suggestions.filter(({ id }) => !connectionIds.has(id)),
  ).sort(compareWithinTier);

  const result: T[] = [];
  let suggestionIndex = 0;
  for (let connectionIndex = 0;
    connectionIndex < rankedConnections.length && result.length < boundedLimit;
    connectionIndex += 1) {
    result.push(rankedConnections[connectionIndex]);
    const completedBlock = (connectionIndex + 1) % 4 === 0;
    if (completedBlock
      && suggestionIndex < rankedSuggestions.length
      && result.length < boundedLimit) {
      result.push(rankedSuggestions[suggestionIndex]);
      suggestionIndex += 1;
    }
  }
  return result;
}
