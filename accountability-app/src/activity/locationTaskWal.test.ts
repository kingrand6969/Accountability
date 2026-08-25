import { describe, expect, it, jest } from '@jest/globals';
import {
  createLocationRecordingStore,
  createLocationTaskHandler,
  createLocationTaskLifecycle,
  type LocationRecordingStorage,
} from './locationTask';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    getAllKeys: jest.fn(),
  },
}));

const WAL_PREFIX = 'activity:location-batch:v1:';

function memoryStorage(seed: Record<string, string> = {}):
  LocationRecordingStorage & {
    data: Map<string, string>;
    calls: string[];
  } {
  const data = new Map(Object.entries(seed));
  const calls: string[] = [];
  return {
    data,
    calls,
    async getItem(key) {
      calls.push(`get:${key}`);
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      calls.push(`set:${key}`);
      data.set(key, value);
    },
    async removeItem(key) {
      calls.push(`remove:${key}`);
      data.delete(key);
    },
    async getAllKeys() {
      calls.push('keys');
      return [...data.keys()];
    },
  };
}

describe('immutable raw location WAL', () => {
  it('makes the immutable global batch write its first awaited storage action', async () => {
    const storage = memoryStorage();
    const store = createLocationRecordingStore({
      storage,
      createChunkId: () => 'batch-1',
      nowMs: () => 1_500,
    });

    await expect(store.appendTaskSamples([
      { lat: -31.95, lon: 115.86, capturedAt: 1_000 },
    ])).resolves.toBe(true);

    expect(storage.calls[0]).toBe(`set:${WAL_PREFIX}batch-1`);
    expect(storage.calls).toEqual([`set:${WAL_PREFIX}batch-1`]);
    const raw = storage.data.get(`${WAL_PREFIX}batch-1`);
    expect(raw).toBeDefined();
    expect(JSON.parse(raw!)).toEqual({
      schema: 1,
      batchId: 'batch-1',
      receivedAt: 1_500,
      samples: [{ lat: -31.95, lon: 115.86, capturedAt: 1_000 }],
    });
    expect(raw).not.toMatch(/owner|activity|session|lease/i);
  });

  it('drops invalid native coordinates without reading authoritative state', async () => {
    const storage = memoryStorage();
    const store = createLocationRecordingStore({
      storage,
      createChunkId: () => 'unused',
    });

    await expect(store.appendTaskSamples([
      { lat: 91, lon: 115.86, capturedAt: 1_000 },
      { lat: -31.95, lon: Number.NaN, capturedAt: 1_001 },
    ])).resolves.toBe(false);

    expect(storage.calls).toEqual([]);
  });

  it('rejects implausibly future capture times before the WAL write', async () => {
    const storage = memoryStorage();
    const store = createLocationRecordingStore({
      storage,
      createChunkId: () => 'unused',
      nowMs: () => 1_000,
    });

    await expect(store.appendTaskSamples([
      { lat: 1, lon: 1, capturedAt: 601_001 },
    ])).resolves.toBe(false);

    expect(storage.calls).toEqual([]);
  });

  it('never mutates authoritative bytes when an immutable batch write fails', async () => {
    const storage = memoryStorage({
      'activity:points': 'authoritative-bytes',
    });
    storage.setItem = async (key) => {
      storage.calls.push(`set:${key}`);
      throw new Error('WAL unavailable');
    };
    const store = createLocationRecordingStore({
      storage,
      createChunkId: () => 'failed-batch',
    });

    await expect(store.appendTaskSamples([
      { lat: 1, lon: 1, capturedAt: 1_000 },
    ])).rejects.toThrow('WAL unavailable');

    expect(storage.data.get('activity:points')).toBe('authoritative-bytes');
    expect(storage.calls).toEqual([`set:${WAL_PREFIX}failed-batch`]);
  });

  it('assigns by capture windows and deduplicates identical and overlapping replay', async () => {
    const storage = memoryStorage();
    let batch = 0;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-a',
      createSessionId: () => 'session-a',
      createChunkId: () => `batch-${++batch}`,
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => 1_000,
    });
    const identity = await store.begin('owner-a', 'run');
    await store.acquireTaskLease(identity, 'lease-1', 1_000);

    await store.appendTaskSamples([
      { lat: 1, lon: 1, capturedAt: 1_100 },
      { lat: 2, lon: 2, capturedAt: 1_200 },
    ]);
    await store.appendTaskSamples([
      { lat: 2, lon: 2, capturedAt: 1_200 },
      { lat: 3, lon: 3, capturedAt: 1_300 },
    ]);
    await store.appendTaskSamples([
      { lat: 1, lon: 1, capturedAt: 1_100 },
      { lat: 2, lon: 2, capturedAt: 1_200 },
    ]);

    await store.suspendTaskLeaseFor(identity, 1_250);
    await store.acquireTaskLease(identity, 'lease-2', 1_400);
    await store.appendTaskSamples([
      { lat: 9, lon: 9, capturedAt: 1_250 },
      { lat: 8, lon: 8, capturedAt: 1_350 },
      { lat: 4, lon: 4, capturedAt: 1_450 },
    ]);

    await expect(store.readRecording('owner-a')).resolves.toMatchObject({
      ...identity,
      points: [
        { lat: 1, lon: 1 },
        { lat: 2, lon: 2 },
        { lat: 4, lon: 4 },
      ],
    });
    expect([...storage.data.keys()].filter((key) => key.startsWith(WAL_PREFIX)))
      .toHaveLength(4);
  });

  it('clamps resumed lease activation so historical windows never overlap', async () => {
    const storage = memoryStorage();
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-a',
      createSessionId: () => 'session-a',
      createChunkId: () => 'batch-a',
      nowIso: () => '2026-08-25T00:00:00.000Z',
    });
    const identity = await store.begin('owner-a', 'run');
    await store.acquireTaskLease(identity, 'lease-1', 1_000);
    await store.suspendTaskLeaseFor(identity, 2_000);
    await store.acquireTaskLease(identity, 'lease-2', 1_500);
    await store.appendTaskSamples([
      { lat: 1, lon: 1, capturedAt: 1_750 },
      { lat: 2, lon: 2, capturedAt: 2_100 },
    ]);

    expect(JSON.parse(storage.data.get('activity:points')!)).toMatchObject({
      locationLeases: [
        { id: 'lease-1', activatedAt: 1_000, revokedAtExclusive: 2_000 },
        { id: 'lease-2', activatedAt: 2_000, revokedAtExclusive: null },
      ],
    });
  });
});

function nativeRuntime(initiallyStarted = false) {
  let started = initiallyStarted;
  return {
    hasStarted: jest.fn(async () => started),
    getForegroundPermission: jest.fn(async () => ({ granted: true })),
    getBackgroundPermission: jest.fn(async () => ({ granted: true })),
    start: jest.fn(async () => {
      started = true;
    }),
    stop: jest.fn(async () => {
      started = false;
    }),
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('deep track finalization', () => {
  it('seals one canonical capture-time snapshot and single-flights concurrent finish', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    let clock = 1_000;
    let id = 0;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-a',
      createSessionId: () => 'session-a',
      createChunkId: () => `batch-${++id}`,
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => clock,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-a',
      createFinishId: () => 'finish-a',
      createSnapshotId: () => 'snapshot-a',
      nowMs: () => clock,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);
    clock = 1_500;
    await store.appendTaskSamples([
      { lat: 1, lon: 1, capturedAt: 1_100 },
      { lat: 2, lon: 2, capturedAt: 1_200 },
    ]);
    clock = 2_000;

    const first = lifecycle.finalizeFor(identity, {
      type: 'run',
      durationS: 60,
    });
    const second = lifecycle.finalizeFor(identity, {
      type: 'run',
      durationS: 60,
    });
    const [left, right] = await Promise.all([first, second]);

    expect(left).toEqual(right);
    expect(left).toEqual({
      kind: 'sealed',
      finalized: {
        identity,
        finishId: 'finish-a',
        snapshotId: 'snapshot-a',
        recording: {
          activityId: 'activity-a',
          ownerId: 'owner-a',
          activity: {
            type: 'run',
            distance_m: expect.any(Number),
            duration_s: 60,
            route: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }],
            started_at: '2026-08-25T00:00:00.000Z',
          },
        },
      },
    });
    expect(runtime.stop).toHaveBeenCalledTimes(1);
    await expect(store.recover('owner-a')).resolves.toEqual({
      kind: 'completed',
      finalized: (left as Extract<typeof left, { kind: 'sealed' }>).finalized,
    });
  });

  it('stays closing when an eligible batch appears between stable scans, then retries with the same IDs', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    let clock = 1_000;
    let batchId = 0;
    let walEnumeration = 0;
    let injectLate = false;
    const baseGetAllKeys = storage.getAllKeys!.bind(storage);
    storage.getAllKeys = async () => {
      const keys = await baseGetAllKeys();
      walEnumeration += 1;
      if (injectLate && walEnumeration === 1) {
        storage.data.set(`${WAL_PREFIX}late`, JSON.stringify({
          schema: 1,
          batchId: 'late',
          receivedAt: 2_000,
          samples: [{ lat: 2, lon: 2, capturedAt: 1_200 }],
        }));
      }
      return keys;
    };
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-a',
      createSessionId: () => 'session-a',
      createChunkId: () => `batch-${++batchId}`,
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => clock,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-a',
      createFinishId: () => 'finish-stable',
      createSnapshotId: () => 'snapshot-stable',
      nowMs: () => clock,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);
    await store.appendTaskSamples([
      { lat: 1, lon: 1, capturedAt: 1_100 },
    ]);
    walEnumeration = 0;
    injectLate = true;
    clock = 2_000;

    await expect(lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 60,
    })).resolves.toEqual({
      kind: 'closing',
      finishId: 'finish-stable',
      reason: 'journal_unstable',
    });
    const restarted = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'never-used',
      createFinishId: () => 'wrong-finish',
      createSnapshotId: () => 'wrong-snapshot',
      nowMs: () => clock,
    });
    const sealed = await restarted.finalizeFor(identity, {
      type: 'run', durationS: 60,
    });
    expect(sealed).toMatchObject({
      kind: 'sealed',
      finalized: {
        finishId: 'finish-stable',
        snapshotId: 'snapshot-stable',
        recording: {
          activity: { route: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }] },
        },
      },
    });
  });

  it('does not seal while a selected TaskManager callback is paused before its first WAL write', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    const writeGate = deferred<void>();
    let blockWal = false;
    const baseSet = storage.setItem.bind(storage);
    storage.setItem = async (key, value) => {
      if (blockWal && key.startsWith(WAL_PREFIX)) await writeGate.promise;
      await baseSet(key, value);
    };
    let clock = 1_000;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-a',
      createSessionId: () => 'session-a',
      createChunkId: () => 'deferred-batch',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => clock,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-a',
      createFinishId: () => 'finish-a',
      createSnapshotId: () => 'snapshot-a',
      nowMs: () => clock,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);
    blockWal = true;
    const handler = createLocationTaskHandler(store);
    const selectedCallback = handler({
      data: {
        locations: [{
          coords: { latitude: 1, longitude: 1 },
          timestamp: 1_100,
        }],
      },
    });
    clock = 2_000;

    await expect(lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 60,
    })).resolves.toEqual({
      kind: 'closing',
      finishId: 'finish-a',
      reason: 'callback_quiescence_unconfirmed',
    });
    writeGate.resolve();
    await selectedCallback;
    await expect(lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 60,
    })).resolves.toMatchObject({
      kind: 'sealed',
      finalized: {
        finishId: 'finish-a',
        snapshotId: 'snapshot-a',
        recording: { activity: { route: [{ lat: 1, lon: 1 }] } },
      },
    });
  });

  it('blocks sealing on corrupt WAL and never deletes it', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    let clock = 1_000;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-a',
      createSessionId: () => 'session-a',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => clock,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-a',
      createFinishId: () => 'finish-a',
      createSnapshotId: () => 'snapshot-a',
      nowMs: () => clock,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);
    storage.data.set(`${WAL_PREFIX}corrupt`, '{not-json');
    clock = 2_000;

    await expect(lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 60,
    })).resolves.toEqual({
      kind: 'closing',
      finishId: 'finish-a',
      reason: 'corrupt_journal',
    });
    expect(storage.data.has(`${WAL_PREFIX}corrupt`)).toBe(true);
    expect(storage.calls).not.toContain(`remove:${WAL_PREFIX}corrupt`);
  });

  it('acknowledges by exact identity and snapshot and removes only fully consumed keys', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    let clock = 1_000;
    let batchId = 0;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-a',
      createSessionId: () => 'session-a',
      createChunkId: () => `batch-${++batchId}`,
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => clock,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-a',
      createFinishId: () => 'finish-a',
      createSnapshotId: () => 'snapshot-a',
      nowMs: () => clock,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);
    await store.appendTaskSamples([
      { lat: 1, lon: 1, capturedAt: 1_100 },
    ]);
    await store.appendTaskSamples([
      { lat: 2, lon: 2, capturedAt: 1_200 },
      { lat: 9, lon: 9, capturedAt: 2_500 },
    ]);
    clock = 2_000;
    const result = await lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 60,
    });
    expect(result).toMatchObject({ kind: 'sealed' });

    await expect(lifecycle.acknowledgeFinalizedFor(
      { ...identity, activityId: 'newer-activity' },
      'snapshot-a',
    )).resolves.toBe('stale');
    await expect(lifecycle.acknowledgeFinalizedFor(
      identity,
      'wrong-snapshot',
    )).resolves.toBe('stale');
    await expect(lifecycle.acknowledgeFinalizedFor(
      identity,
      'snapshot-a',
    )).resolves.toBe('acknowledged');

    expect(storage.data.has(`${WAL_PREFIX}batch-1`)).toBe(false);
    expect(storage.data.has(`${WAL_PREFIX}batch-2`)).toBe(true);
    await expect(store.recover('owner-a')).resolves.toEqual({ kind: 'none' });
  });

  it('keeps closing across journal and candidate persistence failures with stable terminal IDs', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    let clock = 1_000;
    let failEnumeration = false;
    let failCandidateWrite = true;
    const baseKeys = storage.getAllKeys!.bind(storage);
    storage.getAllKeys = async () => {
      if (failEnumeration) {
        failEnumeration = false;
        throw new Error('enumeration unavailable');
      }
      return baseKeys();
    };
    const baseSet = storage.setItem.bind(storage);
    storage.setItem = async (key, value) => {
      const parsed = key === 'activity:points' ? JSON.parse(value) : null;
      if (failCandidateWrite && parsed?.terminal?.candidate) {
        failCandidateWrite = false;
        throw new Error('candidate write failed');
      }
      return baseSet(key, value);
    };
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-a',
      createSessionId: () => 'session-a',
      createChunkId: () => 'batch-a',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => clock,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-a',
      createFinishId: () => 'finish-stable',
      createSnapshotId: () => 'snapshot-stable',
      nowMs: () => clock,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);
    await store.appendTaskSamples([
      { lat: 1, lon: 1, capturedAt: 1_100 },
    ]);
    failEnumeration = true;
    clock = 2_000;

    await expect(lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 60,
    })).resolves.toEqual({
      kind: 'closing',
      finishId: 'finish-stable',
      reason: 'journal_unavailable',
    });
    await expect(lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 60,
    })).resolves.toEqual({
      kind: 'closing',
      finishId: 'finish-stable',
      reason: 'persistence_unconfirmed',
    });
    await expect(lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 60,
    })).resolves.toMatchObject({
      kind: 'sealed',
      finalized: {
        finishId: 'finish-stable',
        snapshotId: 'snapshot-stable',
      },
    });
  });

  it('persists exact cleanup work across an acknowledgement crash without blocking a new run', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    let clock = 1_000;
    let activity = 0;
    let failBatchRemoval = true;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => `activity-${++activity}`,
      createSessionId: () => `session-${activity}`,
      createChunkId: () => 'batch-a',
      nowIso: () => `2026-08-25T00:00:0${activity}.000Z`,
      nowMs: () => clock,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-a',
      createFinishId: () => 'finish-a',
      createSnapshotId: () => 'snapshot-a',
      nowMs: () => clock,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);
    await store.appendTaskSamples([
      { lat: 1, lon: 1, capturedAt: 1_100 },
    ]);
    clock = 2_000;
    await lifecycle.finalizeFor(identity, { type: 'run', durationS: 60 });
    const baseRemove = storage.removeItem.bind(storage);
    storage.removeItem = async (key) => {
      if (key === `${WAL_PREFIX}batch-a` && failBatchRemoval) {
        throw new Error('crashed during cleanup');
      }
      return baseRemove(key);
    };

    await expect(lifecycle.acknowledgeFinalizedFor(
      identity,
      'snapshot-a',
    )).resolves.toBe('acknowledged');
    expect(storage.data.has(`${WAL_PREFIX}batch-a`)).toBe(true);
    expect([...storage.data.keys()]).toContain(
      'activity:location-cleanup:v1:snapshot-a',
    );
    await expect(store.recover('owner-a')).resolves.toEqual({ kind: 'none' });

    failBatchRemoval = false;
    const newer = await store.begin('owner-b', 'walk');
    expect(newer.activityId).toBe('activity-2');
    expect(storage.data.has(`${WAL_PREFIX}batch-a`)).toBe(false);
    expect([...storage.data.keys()]).not.toContain(
      'activity:location-cleanup:v1:snapshot-a',
    );
  });

  it('returns too_short only after stable exact cleanup and never exposes a save candidate', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    let clock = 1_000;
    let failCleanup = true;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-short',
      createSessionId: () => 'session-short',
      createChunkId: () => 'batch-short',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => clock,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-short',
      createFinishId: () => 'finish-short',
      createSnapshotId: () => 'snapshot-short',
      nowMs: () => clock,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);
    await store.appendTaskSamples([
      { lat: 1, lon: 1, capturedAt: 1_100 },
    ]);
    const baseRemove = storage.removeItem.bind(storage);
    storage.removeItem = async (key) => {
      if (key === `${WAL_PREFIX}batch-short` && failCleanup) {
        throw new Error('cleanup unavailable');
      }
      return baseRemove(key);
    };
    clock = 2_000;

    await expect(lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 2,
    })).resolves.toEqual({
      kind: 'closing',
      finishId: 'finish-short',
      reason: 'persistence_unconfirmed',
    });
    await expect(store.recover('owner-a')).resolves.toMatchObject({
      kind: 'closing',
      identity,
      finishId: 'finish-short',
    });

    failCleanup = false;
    await expect(lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 2,
    })).resolves.toEqual({ kind: 'too_short' });
    await expect(store.recover('owner-a')).resolves.toEqual({ kind: 'none' });
    expect(storage.data.has(`${WAL_PREFIX}batch-short`)).toBe(false);
  });

  it('never assigns a delayed A sample to a newer B recording', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    let clock = 1_000;
    let activity = 0;
    let batch = 0;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => `activity-${++activity}`,
      createSessionId: () => `session-${activity}`,
      createChunkId: () => `batch-${++batch}`,
      nowIso: () => `2026-08-25T00:00:0${activity}.000Z`,
      nowMs: () => clock,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => `lease-${activity}`,
      createFinishId: () => 'finish-a',
      createSnapshotId: () => 'snapshot-a',
      nowMs: () => clock,
    });
    const a = await store.begin('owner-a', 'run');
    await lifecycle.startFor(a);
    clock = 2_000;
    const finalizedA = await lifecycle.finalizeFor(a, {
      type: 'run', durationS: 60,
    });
    expect(finalizedA).toMatchObject({ kind: 'sealed' });
    await lifecycle.acknowledgeFinalizedFor(a, 'snapshot-a');

    clock = 3_000;
    const b = await store.begin('owner-b', 'walk');
    await lifecycle.startFor(b);
    await store.appendTaskSamples([
      { lat: 1, lon: 1, capturedAt: 1_500 },
      { lat: 2, lon: 2, capturedAt: 3_100 },
    ]);

    await expect(store.readRecording('owner-b')).resolves.toMatchObject({
      ...b,
      points: [{ lat: 2, lon: 2 }],
    });
  });

  it('never lets a stale exact discard remove a newer recording', async () => {
    const storage = memoryStorage();
    let activity = 0;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => `activity-${++activity}`,
      createSessionId: () => `session-${activity}`,
      nowIso: () => `2026-08-25T00:00:0${activity}.000Z`,
    });
    const a = await store.begin('owner-a', 'run');
    await expect(store.discard(a)).resolves.toBe('discarded');
    const b = await store.begin('owner-b', 'walk');

    await expect(store.discard(a)).resolves.toBe('stale');
    await expect(store.recover('owner-b')).resolves.toMatchObject({
      kind: 'active',
      ...b,
      type: 'walk',
    });
  });
});

describe('shared native task coordinator', () => {
  it('lets a newer same-recording intent from another lifecycle supersede a stalled start', async () => {
    const storage = memoryStorage();
    let nativeStarted = false;
    const firstStatus = deferred<boolean>();
    let statusCalls = 0;
    const runtime = {
      hasStarted: jest.fn(async () => {
        statusCalls += 1;
        return statusCalls === 1 ? firstStatus.promise : nativeStarted;
      }),
      getForegroundPermission: jest.fn(async () => ({ granted: true })),
      getBackgroundPermission: jest.fn(async () => ({ granted: true })),
      start: jest.fn(async () => {
        nativeStarted = true;
      }),
      stop: jest.fn(async () => {
        nativeStarted = false;
      }),
    };
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-a',
      createSessionId: () => 'session-a',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => 1_000,
    });
    const firstLifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-a',
      nowMs: () => 1_000,
    });
    const secondLifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'unused-lease',
      nowMs: () => 1_001,
    });
    const identity = await store.begin('owner-a', 'run');

    const older = firstLifecycle.startFor(identity);
    await Promise.resolve();
    await Promise.resolve();
    const newer = secondLifecycle.startFor(identity);
    firstStatus.resolve(false);

    await expect(older).resolves.toBe('stale');
    await expect(newer).resolves.toBe('restarted');
    expect(runtime.start).toHaveBeenCalledTimes(1);
    expect(nativeStarted).toBe(true);
  });

  it('stops a partially-effectful stale start after authority was cleared', async () => {
    const storage = memoryStorage();
    let nativeStarted = false;
    const startGate = deferred<void>();
    const startEntered = deferred<void>();
    const runtime = {
      hasStarted: jest.fn(async () => nativeStarted),
      getForegroundPermission: jest.fn(async () => ({ granted: true })),
      getBackgroundPermission: jest.fn(async () => ({ granted: true })),
      start: jest.fn(async () => {
        nativeStarted = true;
        startEntered.resolve();
        await startGate.promise;
      }),
      stop: jest.fn(async () => {
        nativeStarted = false;
      }),
    };
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-a',
      createSessionId: () => 'session-a',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => 1_000,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-a',
      nowMs: () => 1_000,
    });
    const identity = await store.begin('owner-a', 'run');

    const starting = lifecycle.startFor(identity);
    await startEntered.promise;
    await store.discard(identity);
    startGate.resolve();

    await expect(starting).resolves.toBe('stale');
    expect(runtime.stop).toHaveBeenCalledTimes(1);
    expect(nativeStarted).toBe(false);
  });

  it('adopts a stale A start for a newer B lease without stopping B', async () => {
    const storage = memoryStorage();
    let nativeStarted = false;
    const startGate = deferred<void>();
    const startEntered = deferred<void>();
    let activity = 0;
    const runtime = {
      hasStarted: jest.fn(async () => nativeStarted),
      getForegroundPermission: jest.fn(async () => ({ granted: true })),
      getBackgroundPermission: jest.fn(async () => ({ granted: true })),
      start: jest.fn(async () => {
        nativeStarted = true;
        if (runtime.start.mock.calls.length === 1) {
          startEntered.resolve();
          await startGate.promise;
        }
      }),
      stop: jest.fn(async () => {
        nativeStarted = false;
      }),
    };
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => `activity-${++activity}`,
      createSessionId: () => `session-${activity}`,
      nowIso: () => `2026-08-25T00:00:0${activity}.000Z`,
      nowMs: () => activity * 1_000,
    });
    const lifecycleA = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-a',
      nowMs: () => 1_000,
    });
    const lifecycleB = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-b',
      nowMs: () => 2_000,
    });
    const a = await store.begin('owner-a', 'run');
    const startingA = lifecycleA.startFor(a);
    await startEntered.promise;
    await store.discard(a);
    const b = await store.begin('owner-b', 'run');
    const startingB = lifecycleB.startFor(b);
    startGate.resolve();

    await expect(startingA).resolves.toBe('stale');
    await expect(startingB).resolves.toBe('running');
    expect(runtime.stop).not.toHaveBeenCalled();
    expect(nativeStarted).toBe(true);
  });

  it('restarts B after a stale A stop completes', async () => {
    const storage = memoryStorage();
    let nativeStarted = false;
    const stopGate = deferred<void>();
    const stopEntered = deferred<void>();
    let activity = 0;
    const runtime = {
      hasStarted: jest.fn(async () => nativeStarted),
      getForegroundPermission: jest.fn(async () => ({ granted: true })),
      getBackgroundPermission: jest.fn(async () => ({ granted: true })),
      start: jest.fn(async () => {
        nativeStarted = true;
      }),
      stop: jest.fn(async () => {
        stopEntered.resolve();
        await stopGate.promise;
        nativeStarted = false;
      }),
    };
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => `activity-${++activity}`,
      createSessionId: () => `session-${activity}`,
      nowIso: () => `2026-08-25T00:00:0${activity}.000Z`,
      nowMs: () => activity * 1_000,
    });
    const lifecycleA = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-a',
      nowMs: () => 1_500,
    });
    const lifecycleB = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-b',
      nowMs: () => 2_000,
    });
    const a = await store.begin('owner-a', 'run');
    await lifecycleA.startFor(a);
    const pausingA = lifecycleA.pauseFor(a);
    await stopEntered.promise;
    await store.discard(a);
    const b = await store.begin('owner-b', 'run');
    const startingB = lifecycleB.startFor(b);
    stopGate.resolve();

    await expect(pausingA).resolves.toBe('paused');
    await expect(startingB).resolves.toBe('running');
    expect(runtime.start).toHaveBeenCalledTimes(2);
    expect(nativeStarted).toBe(true);
  });

  it('stops a legacy registered native task when no durable lease exists', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime(true);
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'unused',
    });

    await expect(lifecycle.reconcile()).resolves.toBe('paused');

    expect(runtime.stop).toHaveBeenCalledTimes(1);
    await expect(runtime.hasStarted()).resolves.toBe(false);
  });

  it('keeps a durable pause retryable when native stop rejects without taking effect', async () => {
    const storage = memoryStorage();
    let started = false;
    let rejectStop = true;
    const runtime = {
      hasStarted: jest.fn(async () => started),
      getForegroundPermission: jest.fn(async () => ({ granted: true })),
      getBackgroundPermission: jest.fn(async () => ({ granted: true })),
      start: jest.fn(async () => {
        started = true;
      }),
      stop: jest.fn(async () => {
        if (rejectStop) throw new Error('native stop failed');
        started = false;
      }),
    };
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-a',
      createSessionId: () => 'session-a',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => 1_000,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-a',
      nowMs: () => 2_000,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);

    await expect(lifecycle.pauseFor(identity)).rejects.toThrow(
      'native stop failed',
    );
    expect(started).toBe(true);
    rejectStop = false;
    await expect(lifecycle.pauseFor(identity)).resolves.toBe('already_paused');
    expect(started).toBe(false);
  });
});
