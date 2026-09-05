import type { Candidate } from '../buddy/api';

export type FeedBuddySuggestionGeneration = Readonly<{
  ownerId: string;
  generation: number;
}>;

export type FeedBuddyDiscoveryResult<T> =
  | { status: 'loaded'; value: T }
  | { status: 'failed'; error: unknown }
  | { status: 'stale' };

export type FeedBuddyRequestCompletion =
  | { status: 'succeeded'; candidateId: string; inFlightIds: Set<string> }
  | { status: 'failed'; candidateId: string; error: unknown; inFlightIds: Set<string> }
  | { status: 'stale' };

export type FeedBuddyRequestAttempt =
  | { started: false; reason: 'duplicate' | 'stale' }
  | {
      started: true;
      inFlightIds: Set<string>;
      completion: Promise<FeedBuddyRequestCompletion>;
    };

/**
 * Owns suggestion generations and request admission outside React state so an
 * account switch or a same-account return can never revive stale async work.
 */
export function createFeedBuddySuggestionCoordinator() {
  let generation = 0;
  let ownerId: string | null = null;
  const inFlightIds = new Set<string>();

  const isCurrent = (token: FeedBuddySuggestionGeneration) =>
    ownerId === token.ownerId && generation === token.generation;

  const activateOwner = (nextOwnerId: string | null): FeedBuddySuggestionGeneration | null => {
    generation += 1;
    ownerId = nextOwnerId;
    inFlightIds.clear();
    return nextOwnerId ? { ownerId: nextOwnerId, generation } : null;
  };

  const invalidate = (token?: FeedBuddySuggestionGeneration) => {
    if (token && !isCurrent(token)) return;
    generation += 1;
    ownerId = null;
    inFlightIds.clear();
  };

  const runDiscovery = async <T>(
    token: FeedBuddySuggestionGeneration,
    load: (requestedOwnerId: string) => Promise<T>,
  ): Promise<FeedBuddyDiscoveryResult<T>> => {
    try {
      const value = await load(token.ownerId);
      return isCurrent(token) ? { status: 'loaded', value } : { status: 'stale' };
    } catch (error) {
      return isCurrent(token) ? { status: 'failed', error } : { status: 'stale' };
    }
  };

  const settleRequest = async (
    token: FeedBuddySuggestionGeneration,
    candidateId: string,
    send: (requestedOwnerId: string) => Promise<void>,
  ): Promise<FeedBuddyRequestCompletion> => {
    try {
      await send(token.ownerId);
    } catch (error) {
      if (!isCurrent(token)) return { status: 'stale' };
      inFlightIds.delete(candidateId);
      return {
        status: 'failed',
        candidateId,
        error,
        inFlightIds: new Set(inFlightIds),
      };
    }

    if (!isCurrent(token)) return { status: 'stale' };
    inFlightIds.delete(candidateId);
    return {
      status: 'succeeded',
      candidateId,
      inFlightIds: new Set(inFlightIds),
    };
  };

  const startRequest = (
    expectedOwnerId: string,
    candidateId: string,
    send: (requestedOwnerId: string) => Promise<void>,
  ): FeedBuddyRequestAttempt => {
    if (ownerId !== expectedOwnerId) return { started: false, reason: 'stale' };
    if (inFlightIds.has(candidateId)) return { started: false, reason: 'duplicate' };

    const token = { ownerId: expectedOwnerId, generation };
    inFlightIds.add(candidateId);
    const busySnapshot = new Set(inFlightIds);
    return {
      started: true,
      inFlightIds: busySnapshot,
      completion: settleRequest(token, candidateId, send),
    };
  };

  return {
    activateOwner,
    invalidate,
    runDiscovery,
    startRequest,
  };
}

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
