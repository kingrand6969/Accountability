import { describe, expect, jest, test } from '@jest/globals';
import {
  createFeedBuddySuggestionCoordinator,
  rankFeedBuddySuggestions,
} from './feedBuddySuggestions';

const candidate = (
  id: string,
  display_name: string | null,
  area: string | null,
) => ({ id, display_name, area, avatar_url: null });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe('rankFeedBuddySuggestions', () => {
  test('ranks same-area candidates first, then uses normalized names and IDs deterministically', () => {
    const candidates = [
      candidate('zara', 'Zara', 'Other'),
      candidate('bravo', 'bravo', ' Perth '),
      candidate('alpha', ' Alpha ', 'PERTH'),
      candidate('a-tie', 'Same', 'Perth'),
      candidate('b-tie', ' same ', 'Perth'),
    ];

    expect(rankFeedBuddySuggestions(candidates, ' perth ', 5).map(({ id }) => id))
      .toEqual(['alpha', 'bravo', 'a-tie', 'b-tie', 'zara']);
  });

  test('places unnamed candidates after named candidates and caps results at four by default', () => {
    const candidates = [
      candidate('unnamed-null', null, 'Perth'),
      candidate('named-b', 'Beta', 'Elsewhere'),
      candidate('unnamed-space', '   ', 'Perth'),
      candidate('named-a', 'Alpha', 'Elsewhere'),
      candidate('named-c', 'Charlie', 'Elsewhere'),
    ];

    expect(rankFeedBuddySuggestions(candidates, null).map(({ id }) => id))
      .toEqual(['named-a', 'named-b', 'named-c', 'unnamed-null']);
  });

  test('does not mutate frozen API results and returns no rows for a negative limit', () => {
    const candidates = Object.freeze([
      Object.freeze(candidate('b', 'Beta', null)),
      Object.freeze(candidate('a', 'Alpha', null)),
    ]);

    expect(() => rankFeedBuddySuggestions(candidates, null)).not.toThrow();
    expect(rankFeedBuddySuggestions(candidates, null, -1)).toEqual([]);
    expect(candidates.map(({ id }) => id)).toEqual(['b', 'a']);
  });
});

describe('feed buddy suggestion coordinator', () => {
  test('drops a discovery completion after A switches to B', async () => {
    const coordinator = createFeedBuddySuggestionCoordinator();
    const pendingA = deferred<{ owner: string }>();
    const ownerA = coordinator.activateOwner('account-a');
    expect(ownerA).not.toBeNull();
    const discoveryA = coordinator.runDiscovery(ownerA!, () => pendingA.promise);

    coordinator.activateOwner('account-b');
    pendingA.resolve({ owner: 'account-a' });

    await expect(discoveryA).resolves.toEqual({ status: 'stale' });
  });

  test('drops an old A discovery after A to B to A while accepting the new A generation', async () => {
    const coordinator = createFeedBuddySuggestionCoordinator();
    const pendingOldA = deferred<{ generation: string }>();
    const pendingNewA = deferred<{ generation: string }>();
    const oldA = coordinator.activateOwner('account-a')!;
    const oldDiscovery = coordinator.runDiscovery(oldA, () => pendingOldA.promise);

    coordinator.activateOwner('account-b');
    const newA = coordinator.activateOwner('account-a')!;
    const newDiscovery = coordinator.runDiscovery(newA, () => pendingNewA.promise);
    pendingNewA.resolve({ generation: 'new-a' });
    pendingOldA.resolve({ generation: 'old-a' });

    await expect(newDiscovery).resolves.toEqual({
      status: 'loaded',
      value: { generation: 'new-a' },
    });
    await expect(oldDiscovery).resolves.toEqual({ status: 'stale' });
  });

  test('invalidates pending discovery and request work on logout', async () => {
    const coordinator = createFeedBuddySuggestionCoordinator();
    const pendingDiscovery = deferred<{ owner: string }>();
    const pendingRequest = deferred<void>();
    const ownerA = coordinator.activateOwner('account-a')!;
    const discovery = coordinator.runDiscovery(ownerA, () => pendingDiscovery.promise);
    const request = coordinator.startRequest(
      'account-a',
      'candidate-1',
      () => pendingRequest.promise,
    );
    expect(request.started).toBe(true);

    expect(coordinator.activateOwner(null)).toBeNull();
    pendingDiscovery.resolve({ owner: 'account-a' });
    pendingRequest.resolve();

    await expect(discovery).resolves.toEqual({ status: 'stale' });
    if (!request.started) throw new Error('request should have started');
    await expect(request.completion).resolves.toEqual({ status: 'stale' });
    expect(coordinator.startRequest('account-a', 'candidate-2', jest.fn(async () => undefined))).toEqual({
      started: false,
      reason: 'stale',
    });
  });

  test('drops stale request success after A to B to A generation changes', async () => {
    const coordinator = createFeedBuddySuggestionCoordinator();
    const pending = deferred<void>();
    coordinator.activateOwner('account-a');
    const request = coordinator.startRequest('account-a', 'candidate-1', () => pending.promise);
    expect(request.started).toBe(true);

    coordinator.activateOwner('account-b');
    coordinator.activateOwner('account-a');
    pending.resolve();

    if (!request.started) throw new Error('request should have started');
    await expect(request.completion).resolves.toEqual({ status: 'stale' });
  });

  test('drops stale request failure after an owner change', async () => {
    const coordinator = createFeedBuddySuggestionCoordinator();
    const pending = deferred<void>();
    coordinator.activateOwner('account-a');
    const request = coordinator.startRequest('account-a', 'candidate-1', () => pending.promise);
    expect(request.started).toBe(true);

    coordinator.activateOwner('account-b');
    pending.reject(new Error('offline'));

    if (!request.started) throw new Error('request should have started');
    await expect(request.completion).resolves.toEqual({ status: 'stale' });
  });

  test('suppresses rapid duplicates synchronously and allows a retry after settlement', async () => {
    const coordinator = createFeedBuddySuggestionCoordinator();
    const pending = deferred<void>();
    const send = jest.fn(() => pending.promise);
    coordinator.activateOwner('account-a');

    const first = coordinator.startRequest('account-a', 'candidate-1', send);
    const duplicate = coordinator.startRequest('account-a', 'candidate-1', send);

    expect(first).toEqual(expect.objectContaining({
      started: true,
      inFlightIds: new Set(['candidate-1']),
    }));
    expect(duplicate).toEqual({ started: false, reason: 'duplicate' });
    expect(send).toHaveBeenCalledTimes(1);

    pending.resolve();
    if (!first.started) throw new Error('request should have started');
    await expect(first.completion).resolves.toEqual({
      status: 'succeeded',
      candidateId: 'candidate-1',
      inFlightIds: new Set(),
    });

    const retry = coordinator.startRequest(
      'account-a',
      'candidate-1',
      async () => undefined,
    );
    expect(retry.started).toBe(true);
    if (!retry.started) throw new Error('retry should have started');
    await expect(retry.completion).resolves.toEqual(expect.objectContaining({
      status: 'succeeded',
    }));
  });

  test('returns a current request failure for the Feed error path and clears busy state', async () => {
    const coordinator = createFeedBuddySuggestionCoordinator();
    const error = new Error('offline');
    coordinator.activateOwner('account-a');
    const request = coordinator.startRequest(
      'account-a',
      'candidate-1',
      async () => { throw error; },
    );

    if (!request.started) throw new Error('request should have started');
    await expect(request.completion).resolves.toEqual({
      status: 'failed',
      candidateId: 'candidate-1',
      error,
      inFlightIds: new Set(),
    });
  });
});
