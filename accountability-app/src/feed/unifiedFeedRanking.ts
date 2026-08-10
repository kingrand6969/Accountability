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

export type ConnectionCandidate = RankedFeedCandidate & {
  source: Exclude<UnifiedFeedSource, 'suggested'>;
};

export type SuggestionCandidate = RankedFeedCandidate & {
  source: 'suggested';
};

const SOURCE_PRIORITY: Record<Exclude<UnifiedFeedSource, 'suggested'>, number> = {
  self: 0,
  buddy: 1,
  followed_person: 2,
  joined_group: 3,
  followed_page: 4,
};

type InterleaveUnifiedFeedInput<
  C extends ConnectionCandidate,
  S extends SuggestionCandidate,
> = {
  connections: readonly C[];
  suggestions: readonly S[];
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

function stableRepresentation(value: unknown, ancestors = new Set<object>()): string {
  if (value === null || typeof value !== 'object') {
    return `${typeof value}:${String(value)}`;
  }
  if (ancestors.has(value)) return '[circular]';
  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableRepresentation(entry, nextAncestors)).join(',')}]`;
  }
  return `{${Object.keys(value).sort().map((key) =>
    `${key}:${stableRepresentation((value as Record<string, unknown>)[key], nextAncestors)}`
  ).join(',')}}`;
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
  return leftPriority - rightPriority
    || compareWithinTier(left, right)
    || compareId(stableRepresentation(left), stableRepresentation(right));
}

function uniqueById<T extends RankedFeedCandidate>(candidates: readonly T[]): T[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  });
}

export function interleaveUnifiedFeed<
  C extends ConnectionCandidate,
  S extends SuggestionCandidate,
>({
  connections,
  suggestions,
  limit,
}: InterleaveUnifiedFeedInput<C, S>): (C | S)[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const boundedLimit = Math.floor(limit);
  const rankedConnections = uniqueById(
    connections.filter((candidate): candidate is C =>
      (candidate as RankedFeedCandidate).source !== 'suggested')
      .sort(compareConnections),
  );
  if (rankedConnections.length === 0) return [];

  const connectionIds = new Set(rankedConnections.map(({ id }) => id));
  const rankedSuggestions = uniqueById(
    suggestions.filter((candidate): candidate is S =>
      (candidate as RankedFeedCandidate).source === 'suggested'
        && !connectionIds.has(candidate.id))
      .sort((left, right) => compareWithinTier(left, right)
        || compareId(stableRepresentation(left), stableRepresentation(right))),
  );

  const result: (C | S)[] = [];
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
