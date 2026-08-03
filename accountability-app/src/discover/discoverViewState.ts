export type DiscoverViewState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'empty'; message: string }
  | { status: 'offline'; message: string }
  | { status: 'permission-denied'; message: string }
  | { status: 'error'; message: string };

export type DiscoverPermission = 'unasked' | 'granted' | 'denied' | 'blocked';

export type DiscoverViewStateInput = {
  loading: boolean;
  error: string | null;
  network: 'online' | 'offline';
  permission: DiscoverPermission;
  nearby: boolean;
  privacySafeNearbyQuery: boolean;
  dataCount: number;
};

/** Pure presentation-state mapper. It never requests location or reads private coordinates. */
export function mapDiscoverViewState(input: DiscoverViewStateInput): DiscoverViewState {
  if (input.loading) return { status: 'loading' };
  if (input.network === 'offline') {
    return {
      status: 'offline',
      message: 'Discovery is offline. Check your connection and retry.',
    };
  }
  if (
    input.nearby &&
    (!input.privacySafeNearbyQuery ||
      input.permission === 'unasked' ||
      input.permission === 'denied' ||
      input.permission === 'blocked')
  ) {
    return {
      status: 'permission-denied',
      message: 'Nearby stays off until location permission and a privacy-safe query are available.',
    };
  }
  if (input.error) return { status: 'error', message: input.error };
  if (input.dataCount === 0) {
    return { status: 'empty', message: 'No public recommendations are available yet.' };
  }
  return { status: 'ready' };
}

export type DiscoverLoadTicket = Readonly<{ ownerId: string; generation: number }>;

/** Exact-owner, monotonic commit guard for account switches, ABA loads, retries and unmounts. */
export function createDiscoverLoadGuard() {
  let generation = 0;
  let mounted = true;
  return {
    mount(): void {
      mounted = true;
    },
    begin(ownerId: string): DiscoverLoadTicket {
      generation += 1;
      return { ownerId, generation };
    },
    canCommit(ticket: DiscoverLoadTicket, currentOwnerId: string | null): boolean {
      return (
        mounted &&
        !!currentOwnerId &&
        ticket.ownerId === currentOwnerId &&
        ticket.generation === generation
      );
    },
    invalidate(): void {
      generation += 1;
    },
    unmount(): void {
      mounted = false;
      generation += 1;
    },
  };
}

export type DiscoverOperationTicket = Readonly<{
  key: string;
  ownerId: string;
  generation: number;
  epoch: number;
}>;

/** Per-entity async completion guard used for success/error UI and toasts. */
export function createDiscoverOperationGuard() {
  let mounted = true;
  let epoch = 0;
  const generations = new Map<string, number>();
  return {
    mount(): void {
      mounted = true;
    },
    begin(key: string, ownerId: string): DiscoverOperationTicket {
      const generation = (generations.get(key) ?? 0) + 1;
      generations.set(key, generation);
      return { key, ownerId, generation, epoch };
    },
    canCommit(ticket: DiscoverOperationTicket, currentOwnerId: string | null): boolean {
      return (
        mounted &&
        ticket.epoch === epoch &&
        ticket.ownerId === currentOwnerId &&
        generations.get(ticket.key) === ticket.generation
      );
    },
    invalidate(): void {
      epoch += 1;
      generations.clear();
    },
    unmount(): void {
      mounted = false;
      epoch += 1;
      generations.clear();
    },
  };
}

/** Ref-backed synchronous lock; unlike render state it closes same-tick double taps. */
export function createDiscoverActionLock() {
  let epoch = 0;
  let sequence = 0;
  const locked = new Map<string, { key: string; epoch: number; sequence: number }>();
  return {
    acquire(key: string): { key: string; epoch: number; sequence: number } | null {
      if (locked.has(key)) return null;
      const token = { key, epoch, sequence: ++sequence };
      locked.set(key, token);
      return token;
    },
    release(token: { key: string; epoch: number; sequence: number }): void {
      if (locked.get(token.key) === token) locked.delete(token.key);
    },
    clear(): void {
      epoch += 1;
      locked.clear();
    },
  };
}

export type DiscoverFixtureConfig = {
  personId: string;
  groupId: string;
  challengeId: string;
  groupMediaUrl: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Comparison content is opt-in and ID-bound. Names/titles never activate it,
 * and missing/invalid configuration returns null rather than fabricating data.
 */
export function readDiscoverFixtureConfig(
  env: Record<string, string | undefined>,
): DiscoverFixtureConfig | null {
  if (env.EXPO_PUBLIC_APP_VARIANT !== 'staging') return null;
  if (env.EXPO_PUBLIC_DISCOVER_FIXTURE_ENABLED !== 'true') return null;
  const personId = env.EXPO_PUBLIC_DISCOVER_FIXTURE_PERSON_ID?.trim() ?? '';
  const groupId = env.EXPO_PUBLIC_DISCOVER_FIXTURE_GROUP_ID?.trim() ?? '';
  const challengeId = env.EXPO_PUBLIC_DISCOVER_FIXTURE_CHALLENGE_ID?.trim() ?? '';
  const groupMediaUrl = env.EXPO_PUBLIC_DISCOVER_FIXTURE_GROUP_MEDIA_URL?.trim() ?? '';
  if (
    !UUID_RE.test(personId) ||
    !UUID_RE.test(groupId) ||
    !UUID_RE.test(challengeId) ||
    !/^https:\/\//i.test(groupMediaUrl)
  ) {
    return null;
  }
  return { personId, groupId, challengeId, groupMediaUrl };
}

/** Defense in depth for discovery APIs: explicitly private rows never reach presentation. */
export function keepPublicDiscoveryRows<T>(rows: readonly T[]): T[] {
  return rows.filter(
    (row) => {
      const visibility = row as { visibility?: string; privacy?: string };
      return visibility.visibility !== 'private' && visibility.privacy !== 'private';
    },
  );
}

export type PublicCandidatePreparation<T extends { id: string }> = {
  candidates: T[];
  allowedIds: Set<string>;
};

/** Makes the public_profiles provenance explicit before any card-ID request. */
export function preparePublicCandidates<T extends { id: string }>(
  rows: readonly T[],
  source: 'public_profiles',
): PublicCandidatePreparation<T> {
  if (source !== 'public_profiles') return { candidates: [], allowedIds: new Set() };
  const candidates = keepPublicDiscoveryRows(rows);
  return { candidates, allowedIds: new Set(candidates.map((candidate) => candidate.id)) };
}

export function retainAllowedCards<T>(
  cards: ReadonlyMap<string, T>,
  allowedIds: ReadonlySet<string>,
): Map<string, T> {
  return new Map([...cards].filter(([id]) => allowedIds.has(id)));
}

export async function requestAllowedCardsIfCurrent<T>(
  allowedIds: ReadonlySet<string>,
  isCurrent: () => boolean,
  loadCards: (ids: string[]) => Promise<ReadonlyMap<string, T>>,
): Promise<Map<string, T> | null> {
  if (!isCurrent()) return null;
  const cards = await loadCards([...allowedIds]);
  if (!isCurrent()) return null;
  return retainAllowedCards(cards, allowedIds);
}

export const DISCOVER_GEOMETRY = {
  search: 44,
  filters: 32,
  nearbyExplanation: 12,
  personHeader: 20,
  personHero: 100,
  connect: 44,
  personCardSpacing: 8,
  groupHeader: 20,
  group: 56,
  challengeHeader: 20,
  challenge: 56,
  gaps: 24,
} as const;

export const DISCOVER_FIRST_VIEWPORT_HEIGHT = Object.values(DISCOVER_GEOMETRY).reduce(
  (sum, height) => sum + height,
  0,
);
