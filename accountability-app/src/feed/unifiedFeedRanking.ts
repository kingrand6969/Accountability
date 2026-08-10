export type UnifiedFeedSource =
  | 'self'
  | 'buddy'
  | 'followed_person'
  | 'joined_group'
  | 'followed_page'
  | 'suggested';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

type JsonObject = { readonly [key: string]: JsonValue };

export type RankedFeedCandidate = Readonly<{
  id: string;
  source: UnifiedFeedSource;
  createdAt: string;
  score: number;
}> & JsonObject;

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

const CONNECTION_SOURCES = new Set<ConnectionCandidate['source']>([
  'self',
  'buddy',
  'followed_person',
  'joined_group',
  'followed_page',
]);

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

function canonicalJson(value: JsonValue): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return `boolean:${value ? '1' : '0'}`;
  if (typeof value === 'number') {
    const normalized = Object.is(value, -0) ? 0 : value;
    return `number:${String(normalized)}`;
  }
  if (typeof value === 'string') return `string:${JSON.stringify(value)}`;
  if (Array.isArray(value)) {
    return `array:${JSON.stringify(value.map(canonicalJson))}`;
  }
  const objectValue = value as JsonObject;
  const entries = Object.keys(objectValue).sort()
    .map((key) => [key, canonicalJson(objectValue[key])]);
  return `object:${JSON.stringify(entries)}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isPlainObject(value) && Object.values(value).every(isJsonValue);
}

function isCandidateRecord(value: unknown): value is RankedFeedCandidate {
  if (!isPlainObject(value)) return false;
  if (!Object.hasOwn(value, 'id')
    || !Object.hasOwn(value, 'source')
    || !Object.hasOwn(value, 'createdAt')
    || !Object.hasOwn(value, 'score')
    || typeof value.id !== 'string'
    || typeof value.source !== 'string'
    || typeof value.createdAt !== 'string'
    || typeof value.score !== 'number') return false;
  return Object.entries(value).every(([key, entry]) => key === 'score' || isJsonValue(entry));
}

function canonicalCandidate(candidate: RankedFeedCandidate): string {
  const entries = Object.keys(candidate).sort().map((key) => {
    const value = candidate[key];
    if (key === 'score' && typeof value === 'number' && !Number.isFinite(value)) {
      return [key, `number:${String(value)}`];
    }
    return [key, canonicalJson(value)];
  });
  return `candidate:${JSON.stringify(entries)}`;
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
    || compareId(canonicalCandidate(left), canonicalCandidate(right));
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
      isCandidateRecord(candidate)
        && CONNECTION_SOURCES.has(candidate.source as ConnectionCandidate['source']))
      .sort(compareConnections),
  );
  if (rankedConnections.length === 0) return [];

  const connectionIds = new Set(rankedConnections.map(({ id }) => id));
  const rankedSuggestions = uniqueById(
    suggestions.filter((candidate): candidate is S =>
      isCandidateRecord(candidate)
        && candidate.source === 'suggested'
        && !connectionIds.has(candidate.id))
      .sort((left, right) => compareWithinTier(left, right)
        || compareId(canonicalCandidate(left), canonicalCandidate(right))),
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
