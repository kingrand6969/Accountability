import { describe, expect, it, jest } from '@jest/globals';
import {
  appendPendingProofAction,
  buildProofFingerprint,
  clearPendingProofAction,
  createPendingProofAction,
  dispatchPendingProofAction,
  loadPendingProofActions,
  normalizeProofHeadline,
  pendingProofActionsKey,
  reconcilePendingProofAction,
  remainingPendingForAction,
  type PendingProofStorage,
} from './pendingProofActions';

function memoryStorage(events: string[] = []): PendingProofStorage {
  const map = new Map<string, string>();
  return {
    async getItem(key) { events.push(`get:${key}`); return map.get(key) ?? null; },
    async setItem(key, value) { events.push(`set:${key}`); map.set(key, value); },
    async removeItem(key) { events.push(`remove:${key}`); map.delete(key); },
  };
}

const base = {
  operationId: 'op-1',
  ownerId: 'owner-a',
  action: 'post-feed' as const,
  fingerprint: 'fingerprint-a',
  imageSha256: 'image-a',
  headline: ' I   showed up today. ',
  now: new Date('2026-07-29T10:00:00.000Z'),
};

describe('pending proof journal', () => {
  it('uses an exact per-user key and normalizes Unicode whitespace', () => {
    expect(pendingProofActionsKey('owner-a')).toBe('pending-proof-actions:v1:owner-a');
    expect(normalizeProofHeadline('  I \n showed\u0301  ')).toBe('I showed́');
  });

  it('builds the specified fingerprint input', async () => {
    const hash = jest.fn(async (value: string) => `hash:${value}`);
    const result = await buildProofFingerprint(base, hash);
    expect(hash).toHaveBeenCalledWith('1|owner-a|post-feed|image-a|I showed up today.');
    expect(result.fingerprint).toContain('post-feed');
  });

  it('appends durably before a caller dispatches and reuses an exact pending operation', async () => {
    const events: string[] = [];
    const storage = memoryStorage(events);
    const entry = createPendingProofAction(base);
    const first = await appendPendingProofAction(entry, storage, base.now);
    events.push('dispatch');
    const duplicate = await appendPendingProofAction(
      { ...entry, operationId: 'op-2' },
      storage,
      new Date('2026-07-29T10:01:00.000Z'),
    );
    expect(first.operationId).toBe('op-1');
    expect(duplicate.operationId).toBe('op-1');
    expect(events.findIndex((event) => event.startsWith('set:'))).toBeLessThan(events.indexOf('dispatch'));
  });

  it('keeps different headlines, actions, and expired fingerprints distinct', async () => {
    const storage = memoryStorage();
    const entry = createPendingProofAction(base);
    await appendPendingProofAction(entry, storage, base.now);
    await appendPendingProofAction(
      createPendingProofAction({ ...base, operationId: 'headline', headline: 'Different' }),
      storage,
      base.now,
    );
    await appendPendingProofAction(
      createPendingProofAction({
        ...base,
        operationId: 'memory',
        action: 'save-memories',
      }),
      storage,
      base.now,
    );
    await appendPendingProofAction(
      createPendingProofAction({
        ...base,
        operationId: 'expired',
        now: new Date('2026-07-29T10:20:00.000Z'),
      }),
      storage,
      new Date('2026-07-29T10:20:00.000Z'),
    );
    const loaded = await loadPendingProofActions('owner-a', storage);
    expect(loaded).toHaveLength(4);
    expect(loaded[0].fingerprint).toBe(loaded[1].fingerprint);
    expect(loaded[0].match.imageSha256).toBe(loaded[1].match.imageSha256);
    expect(loaded[0].match.normalizedHeadline).not.toBe(
      loaded[1].match.normalizedHeadline,
    );
  });

  it('clears only a confirmed or explicitly discarded operation', async () => {
    const storage = memoryStorage();
    await appendPendingProofAction(createPendingProofAction(base), storage, base.now);
    await clearPendingProofAction('owner-a', 'op-1', storage);
    expect(await loadPendingProofActions('owner-a', storage)).toEqual([]);
  });

  it('isolates accounts and rejects corrupt or foreign entries', async () => {
    const storage = memoryStorage();
    await storage.setItem(pendingProofActionsKey('owner-a'), '{bad');
    expect(await loadPendingProofActions('owner-a', storage)).toEqual([]);
    await storage.setItem(pendingProofActionsKey('owner-b'), JSON.stringify([
      createPendingProofAction({ ...base, ownerId: 'owner-a' }),
    ]));
    expect(await loadPendingProofActions('owner-b', storage)).toEqual([]);
  });

  it('matches Feed only on exact fields inside the window', () => {
    const entry = createPendingProofAction(base);
    const exact = {
      destination: 'posts' as const,
      imageSha256: 'image-a',
      headline: 'I showed up today.',
      createdAt: '2026-07-29T10:05:00.000Z',
    };
    expect(reconcilePendingProofAction(entry, exact, new Date('2026-07-29T10:06:00Z')).status)
      .toBe('matched');
    expect(reconcilePendingProofAction(entry, { ...exact, headline: 'Other' }).status)
      .toBe('unresolved');
    expect(reconcilePendingProofAction(entry, exact, new Date('2026-07-29T10:16:00Z')).status)
      .toBe('unresolved');
  });

  it('never infers a Memories match or absence and keeps retry disabled by contract', () => {
    const entry = createPendingProofAction({ ...base, action: 'save-memories' });
    expect(reconcilePendingProofAction(entry, {
      destination: 'memories',
      imageSha256: 'image-a',
      headline: 'I showed up today.',
      createdAt: '2026-07-29T10:01:00Z',
    }).status).toBe('unresolved');
    expect(reconcilePendingProofAction(entry, null, new Date('2026-07-29T11:00:00Z')))
      .toMatchObject({ status: 'unresolved', expired: true });
  });

  it('writes before dispatch and clears only after confirmed success', async () => {
    const events: string[] = [];
    const storage = memoryStorage(events);
    const result = await dispatchPendingProofAction(
      createPendingProofAction(base),
      storage,
      async () => { events.push('dispatch'); },
      base.now,
    );
    expect(result.status).toBe('success');
    expect(events.findIndex((event) => event.startsWith('set:'))).toBeLessThan(
      events.indexOf('dispatch'),
    );
    expect(events.some((event) => event.startsWith('remove:'))).toBe(true);
  });

  it('retains the journal when a dispatched result is ambiguous', async () => {
    const storage = memoryStorage();
    const result = await dispatchPendingProofAction(
      createPendingProofAction(base),
      storage,
      async () => { throw new Error('response lost'); },
      base.now,
    );
    expect(result.status).toBe('ambiguous');
    expect(await loadPendingProofActions('owner-a', storage)).toHaveLength(1);
  });

  it('does not dispatch when the atomic append fails', async () => {
    const dispatch = jest.fn(async () => {});
    const storage: PendingProofStorage = {
      async getItem() { return null; },
      async setItem() { throw new Error('disk unavailable'); },
      async removeItem() {},
    };
    await expect(dispatchPendingProofAction(
      createPendingProofAction(base),
      storage,
      dispatch,
      base.now,
    )).rejects.toThrow('disk unavailable');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('uses exactly a fifteen-minute reconciliation window', () => {
    const entry = createPendingProofAction(base);
    expect(Date.parse(entry.expiresAt) - Date.parse(entry.dispatchedAt))
      .toBe(15 * 60 * 1000);
    expect(reconcilePendingProofAction(entry, null, new Date(entry.expiresAt)))
      .toMatchObject({ status: 'unresolved', expired: false });
    expect(reconcilePendingProofAction(
      entry,
      null,
      new Date(Date.parse(entry.expiresAt) + 1),
    )).toMatchObject({ status: 'unresolved', expired: true });
  });

  it('models crash/relaunch before and after dispatch without clearing uncertainty', async () => {
    const storage = memoryStorage();
    const entry = createPendingProofAction(base);
    // Crash after append and before dispatch: a new runtime reloads the entry.
    await appendPendingProofAction(entry, storage, base.now);
    const relaunchedBeforeDispatch = await loadPendingProofActions('owner-a', storage);
    expect(relaunchedBeforeDispatch).toEqual([entry]);

    // Crash/lost response after dispatch: the durable coordinator retains it.
    const result = await dispatchPendingProofAction(
      entry,
      storage,
      async () => { throw new Error('process interrupted'); },
      base.now,
    );
    expect(result.status).toBe('ambiguous');
    const relaunchedAfterDispatch = await loadPendingProofActions('owner-a', storage);
    expect(reconcilePendingProofAction(
      relaunchedAfterDispatch[0],
      null,
      new Date('2026-07-29T10:10:00Z'),
    )).toMatchObject({ status: 'unresolved', expired: false });
    expect(reconcilePendingProofAction(
      relaunchedAfterDispatch[0],
      null,
      new Date('2026-07-29T10:16:00Z'),
    )).toMatchObject({ status: 'unresolved', expired: true });
  });

  it('loads only the active account journal after an account switch', async () => {
    const storage = memoryStorage();
    await appendPendingProofAction(createPendingProofAction(base), storage, base.now);
    await appendPendingProofAction(createPendingProofAction({
      ...base,
      ownerId: 'owner-b',
      operationId: 'op-b',
      fingerprint: 'fingerprint-b',
    }), storage, base.now);
    expect((await loadPendingProofActions('owner-a', storage)).map((entry) => entry.operationId))
      .toEqual(['op-1']);
    expect((await loadPendingProofActions('owner-b', storage)).map((entry) => entry.operationId))
      .toEqual(['op-b']);
  });

  it('keeps an action unresolved when one of two pending entries is discarded', () => {
    const first = createPendingProofAction(base);
    const second = createPendingProofAction({
      ...base,
      operationId: 'op-2',
      fingerprint: 'different',
      headline: 'Different proof',
    });
    expect(remainingPendingForAction([first, second], 'op-1', 'post-feed'))
      .toEqual(second);
    expect(remainingPendingForAction([first], 'op-1', 'post-feed')).toBeNull();
  });
});
