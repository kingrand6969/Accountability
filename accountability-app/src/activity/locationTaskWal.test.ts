import { describe, expect, it, jest } from '@jest/globals';
import {
  createLocationRecordingStore,
  createLocationTaskHandler,
  createLocationTaskLifecycle,
  reconcileLocationCollectorForOwner,
  reconcileLocationTask,
  type LocationRecordingStorage,
} from './locationTask';
import { MAX_QUEUED_ACTIVITY_BYTES } from './offlineQueueStore';
import {
  MAX_LAST_ERROR_MESSAGE_LENGTH,
  MAX_ROUTE_POINTS,
} from './offlineQueueTypes';

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
const LEGACY_QUARANTINE_KEY = 'activity:legacy-location-quarantine:v1';
let latestHelperNativeSequence = 0;
const helperSequences = new WeakMap<
  object,
  Map<number, { next: number; bySample: Map<string, number> }>
>();

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
      createActivityId: () => 'activity-first-write',
      createSessionId: () => 'session-first-write',
      createChunkId: () => 'batch-1',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => 1_500,
    });
    const identity = await store.begin('owner-a', 'run');
    await store.acquireTaskLease(identity, 'lease-first-write', 1_000, 7);
    storage.calls.length = 0;

    await expect(store.appendTaskSamples([
      {
        lat: -31.95,
        lon: 115.86,
        capturedAt: 1_000,
        nativeSequence: 4,
      },
    ], 7)).resolves.toBe(true);

    expect(storage.calls[0]).toBe(`set:${WAL_PREFIX}batch-1`);
    const raw = storage.data.get(`${WAL_PREFIX}batch-1`);
    expect(raw).toBeDefined();
    expect(JSON.parse(raw!)).toEqual({
      schema: 1,
      batchId: 'batch-1',
      collectorGeneration: 7,
      receivedAt: 1_500,
      samples: [{
        lat: -31.95,
        lon: 115.86,
        capturedAt: 1_000,
        nativeSequence: 4,
      }],
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

  it('acknowledges a native batch only after its immutable WAL write succeeds', async () => {
    const storage = memoryStorage();
    const order: string[] = [];
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-native-ack',
      createSessionId: () => 'session-native-ack',
      createChunkId: () => 'native-batch',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => 1_500,
    });
    const identity = await store.begin('owner-a', 'run');
    await store.acquireTaskLease(identity, 'lease-native-ack', 1_000, 7);
    const baseSet = storage.setItem.bind(storage);
    storage.setItem = async (key, value) => {
      await baseSet(key, value);
      order.push('wal');
    };
    const acknowledgeBatch = jest.fn(async () => {
      order.push('ack');
    });
    const handler = createLocationTaskHandler(store, { acknowledgeBatch });

    await handler({
      data: {
        collectorGeneration: 7,
        collectorBatchId: '123e4567-e89b-12d3-a456-426614174000',
        collectorThroughSequence: 4,
        locations: [{
          coords: { latitude: -31.95, longitude: 115.86 },
          timestamp: 1_000,
          nativeSequence: 4,
        }],
      },
    });

    expect(order).toEqual(['wal', 'ack']);
    expect(acknowledgeBatch).toHaveBeenCalledWith(
      7,
      '123e4567-e89b-12d3-a456-426614174000',
      4,
    );
  });

  it('stores one byte-identical WAL entry when an unacknowledged native batch replays', async () => {
    const storage = memoryStorage();
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-native-replay',
      createSessionId: () => 'session-native-replay',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => 9_999,
    });
    const identity = await store.begin('owner-a', 'run');
    await store.acquireTaskLease(identity, 'lease-native-replay', 1_000, 7);
    let attempts = 0;
    const acknowledgeBatch = jest.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('native ACK unavailable');
    });
    const handler = createLocationTaskHandler(store, { acknowledgeBatch });
    const callback = {
      data: {
        collectorGeneration: 7,
        collectorBatchId: '123e4567-e89b-12d3-a456-426614174004',
        collectorThroughSequence: 1,
        locations: [{
          coords: { latitude: -31.95, longitude: 115.86 },
          timestamp: 1_100,
          nativeSequence: 1,
        }],
      },
    };

    await handler(callback);
    const firstKeys = [...storage.data.keys()].filter((key) =>
      key.startsWith(WAL_PREFIX),
    );
    expect(firstKeys).toHaveLength(1);
    const firstRaw = storage.data.get(firstKeys[0]);
    await handler(callback);

    const replayKeys = [...storage.data.keys()].filter((key) =>
      key.startsWith(WAL_PREFIX),
    );
    expect(replayKeys).toEqual(firstKeys);
    expect(storage.data.get(firstKeys[0])).toBe(firstRaw);
    expect(acknowledgeBatch).toHaveBeenCalledTimes(2);
  });

  it('removes a rejected native replay while native retains the unacknowledged source', async () => {
    const storage = memoryStorage({
      'activity:points': '{corrupt-authority',
    });
    const store = createLocationRecordingStore({
      storage,
      nowMs: () => 99_999,
    });
    const acknowledgeBatch = jest.fn(async () => undefined);
    const handler = createLocationTaskHandler(store, { acknowledgeBatch });
    const callback = {
      data: {
        collectorGeneration: 77,
        collectorBatchId: '123e4567-e89b-12d3-a456-426614174005',
        collectorThroughSequence: 1,
        locations: [{
          coords: { latitude: -31.95, longitude: 115.86 },
          timestamp: 1_100,
          nativeSequence: 1,
        }],
      },
    };

    await handler(callback);
    await handler(callback);

    expect([...storage.data.keys()].filter((key) =>
      key.startsWith(WAL_PREFIX),
    )).toHaveLength(0);
    expect(acknowledgeBatch).not.toHaveBeenCalled();
  });

  it('bounds conflicting same-ID native replays and quarantines disjoint sequences', async () => {
    const storage = memoryStorage();
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-native-conflict',
      createSessionId: () => 'session-native-conflict',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => 9_999,
    });
    const identity = await store.begin('owner-a', 'run');
    await store.acquireTaskLease(identity, 'lease-native-conflict', 1_000, 7);
    const acknowledgeBatch = jest.fn(async () => undefined);
    const taintAndAcknowledgeBatch = jest.fn(async () => undefined);
    const handler = createLocationTaskHandler(store, {
      acknowledgeBatch,
      taintAndAcknowledgeBatch,
    });
    const batchId = '123e4567-e89b-12d3-a456-426614174007';
    await handler({
      data: {
        collectorGeneration: 7,
        collectorBatchId: batchId,
        collectorThroughSequence: 1,
        locations: [{
          coords: { latitude: -31.95, longitude: 115.86 },
          timestamp: 1_100,
          nativeSequence: 1,
        }],
      },
    });
    const key = [...storage.data.keys()].find((candidate) =>
      candidate.startsWith(WAL_PREFIX) && candidate.includes(batchId),
    );
    expect(key).toBeDefined();
    const original = storage.data.get(key!);
    const conflictingReplay = {
      data: {
        collectorGeneration: 7,
        collectorBatchId: batchId,
        collectorThroughSequence: 2,
        locations: [{
          coords: { latitude: -31.951, longitude: 115.861 },
          timestamp: 1_200,
          nativeSequence: 2,
        }],
      },
    };
    await handler(conflictingReplay);
    await handler(conflictingReplay);

    expect([...storage.data.keys()].filter((candidate) =>
      candidate.startsWith(WAL_PREFIX),
    )).toEqual([key]);
    expect(storage.data.get(key!)).toBe(original);
    expect(taintAndAcknowledgeBatch).toHaveBeenCalledTimes(2);
    await expect(store.recover('owner-a')).resolves.toMatchObject({
      kind: 'closing',
      quarantineReason: 'tracking_incomplete',
    });
  });

  it('does not acknowledge a native batch when its WAL write fails', async () => {
    const storage = memoryStorage();
    storage.setItem = async () => {
      throw new Error('disk unavailable');
    };
    const store = createLocationRecordingStore({
      storage,
      createChunkId: () => 'failed-native-batch',
      nowMs: () => 1_500,
    });
    const acknowledgeBatch = jest.fn(async () => undefined);
    const handler = createLocationTaskHandler(store, { acknowledgeBatch });

    await expect(handler({
      data: {
        collectorGeneration: 7,
        collectorBatchId: '123e4567-e89b-12d3-a456-426614174000',
        collectorThroughSequence: 4,
        locations: [{
          coords: { latitude: -31.95, longitude: 115.86 },
          timestamp: 1_000,
          nativeSequence: 4,
        }],
      },
    })).resolves.toBeUndefined();

    expect(acknowledgeBatch).not.toHaveBeenCalled();
  });

  it('fail-stops into discard-only quarantine when the global WAL budget is exceeded', async () => {
    const storage = memoryStorage();
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-wal-budget',
      createSessionId: () => 'session-wal-budget',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => 2_000,
    });
    const identity = await store.begin('owner-a', 'run');
    await store.acquireTaskLease(identity, 'lease-wal-budget', 1_000, 1);
    const paddedBatch = (index: number) => {
      const value = {
        schema: 1,
        batchId: `padded-${index}`,
        collectorGeneration: 1,
        receivedAt: 1_500,
        samples: [{
          lat: -31.95,
          lon: 115.86,
          capturedAt: 1_000 + index,
          nativeSequence: index,
        }],
        padding: '',
      };
      const base = JSON.stringify(value);
      return JSON.stringify({
        ...value,
        padding: 'x'.repeat(262_000 - base.length),
      });
    };
    for (let index = 1; index <= 16; index += 1) {
      const raw = paddedBatch(index);
      expect(raw.length).toBe(262_000);
      storage.data.set(`${WAL_PREFIX}padded-${index}`, raw);
    }
    const acknowledgeBatch = jest.fn(async () => undefined);
    const taintAndAcknowledgeBatch = jest.fn(async () => undefined);
    const handler = createLocationTaskHandler(store, {
      acknowledgeBatch,
      taintAndAcknowledgeBatch,
    });

    await handler({
      data: {
        collectorGeneration: 1,
        collectorBatchId: '123e4567-e89b-12d3-a456-426614174001',
        collectorThroughSequence: 17,
        locations: [{
          coords: { latitude: -31.951, longitude: 115.861 },
          timestamp: 1_500,
          nativeSequence: 17,
        }],
      },
    });
    expect(acknowledgeBatch).toHaveBeenCalledTimes(1);
    expect(taintAndAcknowledgeBatch).not.toHaveBeenCalled();

    const overflowCallback = (
      batchId: string,
      firstSequence: number,
    ) => ({
      data: {
        collectorGeneration: 1,
        collectorBatchId: batchId,
        collectorThroughSequence: firstSequence + 63,
        locations: Array.from({ length: 64 }, (_, offset) => ({
          coords: {
            latitude: -31.952 + offset / 100_000,
            longitude: 115.862 + offset / 100_000,
          },
          timestamp: 1_600 + offset,
          nativeSequence: firstSequence + offset,
        })),
      },
    });
    await Promise.all([
      handler(overflowCallback(
        '123e4567-e89b-12d3-a456-426614174002',
        18,
      )),
      handler(overflowCallback(
        '123e4567-e89b-12d3-a456-426614174003',
        82,
      )),
    ]);

    expect(taintAndAcknowledgeBatch).toHaveBeenCalledWith(
      1,
      '123e4567-e89b-12d3-a456-426614174002',
      81,
    );
    const journalEntries = [...storage.data.entries()].filter(([key]) =>
      key.startsWith(WAL_PREFIX),
    );
    expect(journalEntries.some(([key]) =>
      key.includes('123e4567-e89b-12d3-a456-426614174002') ||
      key.includes('123e4567-e89b-12d3-a456-426614174003'),
    )).toBe(false);
    expect(journalEntries.reduce((sum, [, raw]) => sum + raw.length, 0))
      .toBeLessThanOrEqual(4 * 1024 * 1024);
    await expect(store.recover('owner-a')).resolves.toMatchObject({
      kind: 'closing',
      quarantineReason: 'tracking_incomplete',
    });
    await expect(store.readPendingCompleted()).resolves.toBeNull();
  });

  it('assigns by immutable generation and deduplicates overlapping native replay', async () => {
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

    await appendForActiveLease(store, [
      { lat: 1, lon: 1, capturedAt: 1_100 },
      { lat: 2, lon: 2, capturedAt: 1_200 },
    ]);
    await appendForActiveLease(store, [
      { lat: 2, lon: 2, capturedAt: 1_200 },
      { lat: 3, lon: 3, capturedAt: 1_300 },
    ]);
    await appendForActiveLease(store, [
      { lat: 1, lon: 1, capturedAt: 1_100 },
      { lat: 2, lon: 2, capturedAt: 1_200 },
    ]);

    await store.suspendTaskLeaseFor(identity, 1_250);
    await store.acquireTaskLease(identity, 'lease-2', 1_400);
    await appendForActiveLease(store, [
      { lat: 9, lon: 9, capturedAt: 1_250 },
      { lat: 8, lon: 8, capturedAt: 1_350 },
      { lat: 4, lon: 4, capturedAt: 1_450 },
    ]);

    await expect(store.readRecording('owner-a')).resolves.toMatchObject({
      ...identity,
      points: [
        { lat: 1, lon: 1 },
        { lat: 2, lon: 2 },
        { lat: 3, lon: 3 },
        { lat: 9, lon: 9 },
        { lat: 8, lon: 8 },
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
    await appendForActiveLease(store, [
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

  it('clamps pause and terminal cutoffs when the device clock moves backwards', async () => {
    const pausedStorage = memoryStorage();
    const pausedStore = createLocationRecordingStore({
      storage: pausedStorage,
      createActivityId: () => 'activity-paused',
      createSessionId: () => 'session-paused',
      nowIso: () => '2026-08-25T00:00:00.000Z',
    });
    const pausedIdentity = await pausedStore.begin('owner-a', 'run');
    await pausedStore.acquireTaskLease(pausedIdentity, 'lease-1', 2_000);
    await pausedStore.suspendTaskLeaseFor(pausedIdentity, 1_500);
    await pausedStore.acquireTaskLease(pausedIdentity, 'lease-2', 1_600);

    expect(JSON.parse(pausedStorage.data.get('activity:points')!)).toMatchObject({
      locationLeases: [
        { id: 'lease-1', activatedAt: 2_000, revokedAtExclusive: 2_000 },
        { id: 'lease-2', activatedAt: 2_000, revokedAtExclusive: null },
      ],
    });

    const closingStorage = memoryStorage();
    const closingStore = createLocationRecordingStore({
      storage: closingStorage,
      createActivityId: () => 'activity-closing',
      createSessionId: () => 'session-closing',
      nowIso: () => '2026-08-25T00:00:00.000Z',
    });
    const closingIdentity = await closingStore.begin('owner-a', 'run');
    await closingStore.acquireTaskLease(closingIdentity, 'lease-final', 3_000);
    await closingStore.beginClosing(
      closingIdentity,
      { type: 'run', durationS: 10 },
      'finish-1',
      'snapshot-1',
      2_500,
    );

    expect(JSON.parse(closingStorage.data.get('activity:points')!)).toMatchObject({
      locationLeases: [
        {
          id: 'lease-final',
          activatedAt: 3_000,
          revokedAtExclusive: 3_000,
        },
      ],
      terminal: { cutoffExclusive: 3_000 },
    });
  });

  it('allocates monotonic collector generations in durable global lineage', async () => {
    const storage = memoryStorage();
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-a',
      createSessionId: () => 'session-a',
      nowIso: () => '2026-08-25T00:00:00.000Z',
    });
    const identity = await store.begin('owner-a', 'run');
    const first = await store.acquireTaskLease(identity, 'lease-1', 1_000);
    await store.suspendTaskLeaseFor(identity, 2_000);
    const second = await store.acquireTaskLease(identity, 'lease-2', 2_100);

    expect(first).toMatchObject({ collectorGeneration: 1 });
    expect(second).toMatchObject({ collectorGeneration: 2 });
    expect(JSON.parse(storage.data.get('activity:location-lineage:v1')!))
      .toMatchObject({
        schema: 1,
        nextGeneration: 3,
        collectors: [
          { generation: 1, activityId: 'activity-a' },
          { generation: 2, activityId: 'activity-a' },
        ],
      });
  });

  it('advances a missing lineage clock past every stale positive WAL generation', async () => {
    const storage = memoryStorage({
      [`${WAL_PREFIX}stale-owner-a`]: JSON.stringify({
        schema: 1,
        batchId: 'stale-owner-a',
        collectorGeneration: 1,
        receivedAt: 1_000,
        samples: [{
          lat: 1,
          lon: 1,
          capturedAt: 1_000,
          nativeSequence: 1,
        }],
      }),
    });
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-owner-b',
      createSessionId: () => 'session-owner-b',
      createChunkId: () => 'owner-b-batch',
      nowIso: () => '2026-08-25T00:00:02.000Z',
      nowMs: () => 2_000,
    });
    const runtime = nativeRuntime();
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-owner-b',
      nowMs: () => 2_000,
    });
    const ownerB = await store.begin('owner-b', 'run');

    await expect(lifecycle.startFor(ownerB)).resolves.toBe('restarted');
    expect(runtime.start).toHaveBeenCalledWith(2);
    expect(runtime.stopAndDrain).not.toHaveBeenCalledWith(1);
    await store.appendTaskSamples([{
      lat: 2,
      lon: 2,
      capturedAt: 2_100,
      nativeSequence: 1,
    }], 2);

    await expect(store.readRecording('owner-b')).resolves.toMatchObject({
      ...ownerB,
      points: [{ lat: 2, lon: 2 }],
    });
    expect(JSON.parse(storage.data.get('activity:location-lineage:v1')!))
      .toMatchObject({
        nextGeneration: 3,
        collectors: [{ generation: 2, ownerId: 'owner-b' }],
      });
  });

  it('advances a reset lineage past current leases and pending cleanup receipts', async () => {
    const storage = memoryStorage();
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-owner-a',
      createSessionId: () => 'session-owner-a',
      nowIso: () => '2026-08-25T00:00:00.000Z',
    });
    const identity = await store.begin('owner-a', 'run');
    await store.acquireTaskLease(identity, 'lease-1', 1_000);
    await store.suspendTaskLeaseFor(identity, 1_500);
    storage.data.delete('activity:location-lineage:v1');
    storage.data.set('activity:location-cleanup:v1:pending', JSON.stringify({
      schema: 1,
      snapshotId: 'pending',
      entries: [],
      collectorGenerations: [4],
    }));

    await expect(store.acquireTaskLease(identity, 'lease-5', 2_000))
      .resolves.toMatchObject({ collectorGeneration: 5 });
    expect(JSON.parse(storage.data.get('activity:location-lineage:v1')!))
      .toMatchObject({
        nextGeneration: 6,
        collectors: [{ generation: 5, leaseId: 'lease-5' }],
      });
  });

  it('fails closed when malformed WAL could hide the generation high-water mark', async () => {
    const storage = memoryStorage({
      [`${WAL_PREFIX}corrupt-high-water`]: '{corrupt',
    });
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-owner-b',
      createSessionId: () => 'session-owner-b',
      nowIso: () => '2026-08-25T00:00:00.000Z',
    });
    const identity = await store.begin('owner-b', 'run');

    await expect(store.acquireTaskLease(identity, 'lease-owner-b', 1_000))
      .rejects.toThrow('Location generation evidence is corrupt');
    expect(storage.data.has('activity:location-lineage:v1')).toBe(false);
    expect(JSON.parse(storage.data.get('activity:points')!))
      .toMatchObject({ locationLeases: [] });
  });

  it('burns and redacts an orphan collector generation when lease persistence crashes', async () => {
    const storage = memoryStorage();
    let failLeasePersistence = true;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-a',
      createSessionId: () => 'session-a',
      nowIso: () => '2026-08-25T00:00:00.000Z',
    });
    const identity = await store.begin('owner-a', 'run');
    const baseSet = storage.setItem.bind(storage);
    storage.setItem = async (key, value) => {
      if (
        key === 'activity:points' &&
        JSON.parse(value).locationLeases?.length === 1 &&
        failLeasePersistence
      ) {
        failLeasePersistence = false;
        throw new Error('process stopped before lease persistence');
      }
      return baseSet(key, value);
    };

    await expect(store.acquireTaskLease(identity, 'lease-lost', 1_000))
      .rejects.toThrow('process stopped before lease persistence');
    const runtime = nativeRuntime();
    const restarted = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'unused-during-boot',
      nowMs: () => 1_050,
    });

    await expect(restarted.reconcileAtBoot()).resolves.toBe('paused');
    expect(runtime.start).not.toHaveBeenCalled();
    expect(runtime.stopAndDrain).not.toHaveBeenCalled();
    expect(JSON.parse(storage.data.get('activity:location-lineage:v1')!))
      .toEqual({ schema: 1, nextGeneration: 2, collectors: [] });

    await expect(store.acquireTaskLease(identity, 'lease-retry', 1_100))
      .resolves.toMatchObject({ collectorGeneration: 2 });

    expect(JSON.parse(storage.data.get('activity:location-lineage:v1')!))
      .toMatchObject({
        nextGeneration: 3,
        collectors: [
          { generation: 2, leaseId: 'lease-retry' },
        ],
      });
  });

  it.each([
    {
      name: 'a regressed generation clock',
      lineage: {
        schema: 1,
        nextGeneration: 4,
        collectors: [{
          generation: 4,
          leaseId: 'old-lease',
          session: 'old-session',
          activityId: 'old-activity',
          ownerId: 'old-owner',
          startedAt: '2026-08-24T00:00:00.000Z',
          activatedAt: 1,
          revokedAtExclusive: 2,
          drainedThroughSequence: 1,
          resolution: 'discarded',
        }],
      },
    },
    {
      name: 'duplicate generations',
      lineage: {
        schema: 1,
        nextGeneration: 5,
        collectors: [
          {
            generation: 4,
            leaseId: 'old-lease-a',
            session: 'old-session-a',
            activityId: 'old-activity-a',
            ownerId: 'old-owner-a',
            startedAt: '2026-08-24T00:00:00.000Z',
            activatedAt: 1,
            revokedAtExclusive: 2,
            drainedThroughSequence: 1,
            resolution: 'discarded',
          },
          {
            generation: 4,
            leaseId: 'old-lease-b',
            session: 'old-session-b',
            activityId: 'old-activity-b',
            ownerId: 'old-owner-b',
            startedAt: '2026-08-24T01:00:00.000Z',
            activatedAt: 3,
            revokedAtExclusive: 4,
            drainedThroughSequence: 1,
            resolution: 'discarded',
          },
        ],
      },
    },
  ])('fails closed for $name instead of reusing collector ownership', async ({
    lineage,
  }) => {
    const storage = memoryStorage({
      'activity:location-lineage:v1': JSON.stringify(lineage),
    });
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-new',
      createSessionId: () => 'session-new',
      nowIso: () => '2026-08-25T00:00:00.000Z',
    });
    const identity = await store.begin('owner-new', 'run');

    await expect(store.acquireTaskLease(identity, 'lease-new', 10))
      .rejects.toThrow('Collector lineage is corrupt');
    expect(JSON.parse(storage.data.get('activity:points')!))
      .toMatchObject({ locationLeases: [] });
  });

  it('never assigns a late closed-generation batch to B after clock rollback', async () => {
    const storage = memoryStorage();
    const activityIds = ['activity-a', 'activity-b'];
    const sessionIds = ['session-a', 'session-b'];
    let batch = 0;
    let clock = 1_000;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => activityIds.shift()!,
      createSessionId: () => sessionIds.shift()!,
      createChunkId: () => `batch-${++batch}`,
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => clock,
    });
    const identityA = await store.begin('owner-a', 'run');
    const leaseA = await store.acquireTaskLease(identityA, 'lease-a', 1_000);
    await store.suspendTaskLeaseFor(identityA, 2_000);
    storage.data.delete('activity:points');

    clock = 500;
    const identityB = await store.begin('owner-b', 'run');
    const leaseB = await store.acquireTaskLease(identityB, 'lease-b', 500);
    await store.appendTaskSamples([
      { lat: 1, lon: 1, capturedAt: 600, nativeSequence: 1 },
    ], leaseA!.collectorGeneration);
    await store.appendTaskSamples([
      { lat: 2, lon: 2, capturedAt: 700, nativeSequence: 1 },
    ], leaseB!.collectorGeneration);

    await expect(store.readRecording('owner-b')).resolves.toMatchObject({
      ...identityB,
      points: [{ lat: 2, lon: 2 }],
    });
    expect(JSON.parse(storage.data.get('activity:location-lineage:v1')!))
      .toMatchObject({
        nextGeneration: 3,
        collectors: [
          { generation: 1, activityId: 'activity-a' },
          { generation: 2, activityId: 'activity-b' },
        ],
      });
  });

  it('uses native generation sequence when wall time jumps forward then backward', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    let clock = 1_000;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-clock',
      createSessionId: () => 'session-clock',
      createChunkId: () => 'batch-clock',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => clock,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-clock',
      createFinishId: () => 'finish-clock',
      createSnapshotId: () => 'snapshot-clock',
      nowMs: () => clock,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);

    await expect(store.appendTaskSamples([
      {
        lat: 1,
        lon: 1,
        capturedAt: 10_000_000,
        nativeSequence: 1,
      },
      {
        lat: 2,
        lon: 2,
        capturedAt: 500,
        nativeSequence: 2,
      },
    ], 1)).resolves.toBe(true);
    const originalDrain = runtime.stopAndDrain.getMockImplementation()!;
    runtime.stopAndDrain.mockImplementation(async (generation: number) => {
      await originalDrain(generation);
      return {
        generation,
        drained: true as const,
        throughSequence: 2,
        outcome: 'exact' as const,
      };
    });
    clock = 2_000;

    await expect(lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 60,
    })).resolves.toMatchObject({
      kind: 'sealed',
      finalized: {
        recording: {
          activity: {
            route: [
              { lat: 1, lon: 1 },
              { lat: 2, lon: 2 },
            ],
          },
        },
      },
    });
  });

  it('removes a late replay from a burned generation without touching the current owner', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    let activity = 0;
    let chunk = 0;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => `activity-${++activity}`,
      createSessionId: () => `session-${activity}`,
      createChunkId: () => `late-replay-${++chunk}`,
      nowIso: () => `2026-08-25T00:00:0${activity}.000Z`,
      nowMs: () => 2_000,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => `lease-${activity}`,
      createFinishId: () => `finish-${activity}`,
      createSnapshotId: () => `snapshot-${activity}`,
      nowMs: () => 2_000,
    });
    const first = await store.begin('owner-a', 'run');
    await lifecycle.startFor(first);
    await appendForActiveLease(store, [
      { lat: 1, lon: 1, capturedAt: 1_100 },
    ]);
    const finalized = await lifecycle.finalizeFor(first, {
      type: 'run', durationS: 60,
    });
    expect(finalized).toMatchObject({ kind: 'sealed' });
    await lifecycle.claimFinalizedEnqueueFor(first, 'snapshot-1');
    await lifecycle.acknowledgeFinalizedFor(first, 'snapshot-1');

    const second = await store.begin('owner-b', 'run');
    await lifecycle.startFor(second);
    const handler = createLocationTaskHandler(store, runtime);
    await handler({
      data: {
        collectorGeneration: 1,
        collectorBatchId: '123e4567-e89b-12d3-a456-426614174003',
        collectorThroughSequence: 1,
        locations: [{
          coords: { latitude: 9, longitude: 9 },
          timestamp: 1_100,
          nativeSequence: 1,
        }],
      },
    });

    expect(storage.data.has(`${WAL_PREFIX}late-replay-2`)).toBe(false);
    await expect(store.recover('owner-b')).resolves.toMatchObject({
      kind: 'active',
      ownerId: 'owner-b',
      points: [],
    });
    await expect(runtime.getCollectorState()).resolves.toEqual({
      running: true,
      generation: 2,
      highWater: 2,
    });
  });
});

function nativeRuntime(initiallyStarted = false) {
  latestHelperNativeSequence = 0;
  let generation: number | null = initiallyStarted ? 1 : null;
  let highWater = initiallyStarted ? 1 : 0;
  let tainted = false;
  return {
    hasStarted: jest.fn(async () => generation !== null),
    getCollectorState: jest.fn(async () => ({
      running: generation !== null,
      generation,
      highWater,
    })),
    getForegroundPermission: jest.fn(async () => ({ granted: true })),
    getBackgroundPermission: jest.fn(async () => ({ granted: true })),
    reserveGeneration: jest.fn(async (minimumGeneration: number) => {
      if (generation !== null) {
        throw new Error('another collector generation is active');
      }
      const reserved = Math.max(minimumGeneration, highWater + 1);
      generation = reserved;
      highWater = reserved;
      tainted = false;
      return reserved;
    }),
    start: jest.fn(async (nextGeneration?: number) => {
      if (nextGeneration === undefined) {
        generation ??= Math.max(1, highWater + 1);
        highWater = Math.max(highWater, generation);
        return;
      }
      if (generation !== nextGeneration) {
        throw new Error('collector generation was not reserved');
      }
    }),
    stop: jest.fn(async () => {
      generation = null;
    }),
    taintAndAcknowledgeBatch: jest.fn(async (taintedGeneration: number) => {
      if (generation !== taintedGeneration) {
        throw new Error('collector generation does not match active claim');
      }
      tainted = true;
    }),
    stopAndDrain: jest.fn(async (stoppedGeneration: number) => {
      if (generation === stoppedGeneration) generation = null;
      highWater = Math.max(highWater, stoppedGeneration);
      const outcome = tainted ? 'discard-only' as const : 'exact' as const;
      tainted = false;
      return {
        generation: stoppedGeneration,
        drained: true as const,
        throughSequence: latestHelperNativeSequence,
        outcome,
      };
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

async function appendForActiveLease(
  store: ReturnType<typeof createLocationRecordingStore>,
  samples: { lat: number; lon: number; capturedAt: number }[],
) {
  const lease = await store.readActiveTaskLease();
  if (!lease) throw new Error('Expected an active collector lease');
  let byGeneration = helperSequences.get(store);
  if (!byGeneration) {
    byGeneration = new Map();
    helperSequences.set(store, byGeneration);
  }
  const state = byGeneration.get(lease.collectorGeneration) ?? {
    next: 0,
    bySample: new Map<string, number>(),
  };
  const sequenced = samples.map((sample) => {
    const key = JSON.stringify(sample);
    let nativeSequence = state.bySample.get(key);
    if (nativeSequence === undefined) {
      nativeSequence = ++state.next;
      state.bySample.set(key, nativeSequence);
    }
    return { ...sample, nativeSequence };
  });
  byGeneration.set(lease.collectorGeneration, state);
  latestHelperNativeSequence = state.next;
  return store.appendTaskSamples(
    sequenced,
    lease.collectorGeneration,
  );
}

describe('deep track finalization', () => {
  it('keeps ownerless legacy GPS discard-only and never assigns it to B', async () => {
    const rawLegacy = JSON.stringify({
      session: 'legacy-session',
      points: [
        { lat: -31.95, lon: 115.86 },
        { lat: -31.951, lon: 115.861 },
      ],
    });
    const storage = memoryStorage({
      'activity:points': rawLegacy,
      'activity:session': 'legacy-session',
    });
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'must-not-be-created',
      createSessionId: () => 'must-not-be-created',
      createChunkId: () => 'late-ownerless-legacy',
    });

    const recovery = await store.recover('owner-b');
    expect(recovery).toMatchObject({ kind: 'legacy_unprovable' });
    if (recovery.kind !== 'legacy_unprovable') {
      throw new Error('Expected ownerless legacy quarantine');
    }
    await expect(store.claimLegacy('owner-b', 'run')).resolves.toEqual(
      recovery,
    );
    await expect(store.readPoints()).resolves.toEqual([]);
    expect(storage.data.get('activity:points')).toBe(rawLegacy);
    await expect(store.acquireTaskLease({
      activityId: 'made-up-b',
      ownerId: 'owner-b',
      startedAt: '2026-08-25T00:00:00.000Z',
    }, 'must-not-exist')).resolves.toBeNull();
    await expect(store.discardLegacyUnprovable('wrong-token'))
      .resolves.toBe('stale');
    await expect(store.discardLegacyUnprovable(recovery.discardToken))
      .resolves.toBe('discarded');
    expect(storage.data.has('activity:points')).toBe(false);
    expect(storage.data.has('activity:session')).toBe(false);

    await store.appendTaskSamples([{
      lat: -31.952,
      lon: 115.862,
      capturedAt: 1_000,
    }]);
    const runtime = nativeRuntime();
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'owner-b-lease',
    });
    await expect(lifecycle.reconcileForOwner('owner-b'))
      .resolves.toBe('paused');
    expect(storage.data.has(`${WAL_PREFIX}late-ownerless-legacy`)).toBe(false);
  });

  it('sweeps a generation-zero callback committed immediately before legacy discard', async () => {
    const rawLegacy = JSON.stringify({
      session: 'legacy-race-session',
      points: [{ lat: -31.95, lon: 115.86 }],
    });
    const storage = memoryStorage({
      'activity:points': rawLegacy,
      'activity:session': 'legacy-race-session',
    });
    const walCommitted = deferred<void>();
    const releaseWal = deferred<void>();
    const baseSet = storage.setItem.bind(storage);
    storage.setItem = async (key, value) => {
      await baseSet(key, value);
      if (key === `${WAL_PREFIX}legacy-race-batch`) {
        walCommitted.resolve();
        await releaseWal.promise;
      }
    };
    const store = createLocationRecordingStore({
      storage,
      createChunkId: () => 'legacy-race-batch',
    });
    const recovery = await store.recover('owner-b');
    if (recovery.kind !== 'legacy_unprovable') {
      throw new Error('Expected legacy discard token');
    }

    const callback = store.appendTaskSamples([{
      lat: -31.951,
      lon: 115.861,
      capturedAt: 1_100,
    }]);
    await walCommitted.promise;
    const discard = store.discardLegacyUnprovable(recovery.discardToken);
    releaseWal.resolve();

    await expect(callback).resolves.toBe(true);
    await expect(discard).resolves.toBe('discarded');
    expect(storage.data.has(`${WAL_PREFIX}legacy-race-batch`)).toBe(false);
    expect(storage.data.has('activity:points')).toBe(false);
  });

  it('migrates an already-completed schema-2 generation-zero run to discard-only quarantine', async () => {
    const startedAt = '2026-08-25T00:00:00.000Z';
    const completed = {
      type: 'run' as const,
      distance_m: 500,
      duration_s: 120,
      route: [
        { lat: -31.95, lon: 115.86 },
        { lat: -31.951, lon: 115.861 },
      ],
      started_at: startedAt,
    };
    const storage = memoryStorage({
      'activity:points': JSON.stringify({
        schema: 2,
        session: 'legacy-completed-session',
        activityId: 'legacy-completed-activity',
        ownerId: 'owner-a',
        startedAt,
        type: 'run',
        points: completed.route,
        completed,
        locationLease: {
          schema: 1,
          id: 'legacy-completed-lease',
          session: 'legacy-completed-session',
          activityId: 'legacy-completed-activity',
          ownerId: 'owner-a',
          startedAt,
          appendEnabled: false,
        },
      }),
    });
    const store = createLocationRecordingStore({ storage });
    const identity = {
      activityId: 'legacy-completed-activity',
      ownerId: 'owner-a',
      startedAt,
    };

    await expect(store.recover('owner-a')).resolves.toMatchObject({
      kind: 'closing',
      identity,
      quarantineReason: 'legacy_unprovable',
    });
    await expect(store.readPendingCompleted()).resolves.toBeNull();
    await expect(store.claimFinalizedEnqueue(
      identity,
      'legacy-unprovable-snapshot:legacy-completed-activity',
    )).resolves.toEqual({ kind: 'stale' });
    await expect(store.acquireTaskLease(identity, 'new-positive-lease'))
      .resolves.toBeNull();
    expect(JSON.parse(storage.data.get('activity:points')!)).toMatchObject({
      completed: null,
      state: 'closing',
      locationLeases: [{ collectorGeneration: 0 }],
      terminal: {
        phase: 'closing',
        quarantineReason: 'legacy_unprovable',
        finalized: null,
      },
    });
  });

  it('quarantines a completed schema-2 route even when lease metadata is absent', async () => {
    const startedAt = '2026-08-25T00:00:00.000Z';
    const storage = memoryStorage({
      'activity:points': JSON.stringify({
        schema: 2,
        session: 'schema-two-no-lease-session',
        activityId: 'schema-two-no-lease-activity',
        ownerId: 'owner-a',
        startedAt,
        type: 'run',
        points: [{ lat: -31.95, lon: 115.86 }],
        completed: {
          type: 'run',
          distance_m: 50,
          duration_s: 30,
          route: [{ lat: -31.95, lon: 115.86 }],
          started_at: startedAt,
        },
      }),
    });
    const store = createLocationRecordingStore({ storage });

    await expect(store.recover('owner-a')).resolves.toMatchObject({
      kind: 'closing',
      quarantineReason: 'legacy_unprovable',
    });
    await expect(store.readPendingCompleted()).resolves.toBeNull();
    expect(JSON.parse(storage.data.get('activity:points')!)).toMatchObject({
      completed: null,
      locationLeases: [{ collectorGeneration: 0 }],
      terminal: { quarantineReason: 'legacy_unprovable' },
    });
  });

  it('quarantines a completed schema-3 recording that contains generation-zero evidence', async () => {
    const storage = memoryStorage();
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'schema-three-zero-activity',
      createSessionId: () => 'schema-three-zero-session',
      nowIso: () => '2026-08-25T00:00:00.000Z',
    });
    const identity = await store.begin('owner-a', 'run');
    await store.persistCompleted({
      activityId: identity.activityId,
      ownerId: identity.ownerId,
      activity: {
        type: 'run',
        distance_m: 50,
        duration_s: 30,
        route: [{ lat: -31.95, lon: 115.86 }],
        started_at: identity.startedAt,
      },
    });
    const durable = JSON.parse(storage.data.get('activity:points')!);
    durable.locationLeases = [{
      schema: 1,
      id: 'legacy-zero-proof',
      ordinal: 1,
      session: 'schema-three-zero-session',
      activityId: 'schema-three-zero-activity',
      ownerId: 'owner-a',
      startedAt: identity.startedAt,
      activatedAt: 1_000,
      revokedAtExclusive: 2_000,
      collectorGeneration: 0,
      drainedThroughSequence: null,
    }];
    storage.data.set('activity:points', JSON.stringify(durable));

    await expect(store.recover('owner-a')).resolves.toMatchObject({
      kind: 'closing',
      quarantineReason: 'legacy_unprovable',
    });
    await expect(store.readPendingCompleted()).resolves.toBeNull();
  });

  it('quarantines completed schema-3 data when lease evidence is malformed', async () => {
    const startedAt = '2026-08-25T00:00:00.000Z';
    const completed = {
      type: 'walk' as const,
      distance_m: 250,
      duration_s: 90,
      route: [{ lat: -31.95, lon: 115.86 }],
      started_at: startedAt,
    };
    const storage = memoryStorage({
      'activity:points': JSON.stringify({
        schema: 3,
        revision: 4,
        session: 'malformed-session',
        activityId: 'malformed-activity',
        ownerId: 'owner-a',
        startedAt,
        type: 'walk',
        points: completed.route,
        completed,
        locationLeases: [{ schema: 1, id: 'missing-owner-evidence' }],
        consumedLocationChunkIds: [],
        resumeAfterOwnerCheck: false,
        state: 'sealed',
        terminal: null,
      }),
    });
    const store = createLocationRecordingStore({ storage });

    await expect(store.recover('owner-a')).resolves.toMatchObject({
      kind: 'closing',
      quarantineReason: 'legacy_unprovable',
    });
    await expect(store.readPendingCompleted()).resolves.toBeNull();
    const durable = JSON.parse(storage.data.get('activity:points')!);
    expect(durable).toMatchObject({
      completed: null,
      state: 'closing',
      terminal: { quarantineReason: 'legacy_unprovable' },
    });
    expect(durable.locationLeases).toEqual([
      expect.objectContaining({ collectorGeneration: 0 }),
    ]);
  });

  it.each(['ownerId', 'activityId', 'startedAt'] as const)(
    'quarantines a valid-shaped lease whose %s differs from its recording',
    async (field) => {
      const startedAt = '2026-08-25T00:00:00.000Z';
      const outer = {
        session: 'bound-session',
        activityId: 'bound-activity',
        ownerId: 'owner-a',
        startedAt,
      };
      const lease = {
        schema: 1,
        id: 'mismatched-lease',
        ordinal: 1,
        ...outer,
        activatedAt: 1_000,
        revokedAtExclusive: 2_000,
        collectorGeneration: 7,
        drainedThroughSequence: 1,
        [field]: `different-${field}`,
      };
      const storage = memoryStorage({
        'activity:points': JSON.stringify({
          schema: 3,
          revision: 1,
          ...outer,
          type: 'run',
          points: [{ lat: -31.95, lon: 115.86 }],
          completed: null,
          locationLeases: [lease],
          consumedLocationChunkIds: [],
          resumeAfterOwnerCheck: false,
          state: 'paused',
          terminal: null,
        }),
      });
      const store = createLocationRecordingStore({ storage });

      await expect(store.recover('owner-a')).resolves.toMatchObject({
        kind: 'closing',
        quarantineReason: 'legacy_unprovable',
      });
      expect(JSON.parse(storage.data.get('activity:points')!))
        .toMatchObject({
          completed: null,
          locationLeases: [{ collectorGeneration: 0 }],
        });
    },
  );

  it.each(['owner', 'activity', 'startedAt', 'snapshot'] as const)(
    'quarantines sealed terminal authority with tampered %s identity',
    async (field) => {
      const storage = memoryStorage();
      const store = createLocationRecordingStore({
        storage,
        createActivityId: () => 'sealed-authority-activity',
        createSessionId: () => 'sealed-authority-session',
        nowIso: () => '2026-08-25T00:00:00.000Z',
      });
      const identity = await store.begin('owner-a', 'run');
      await store.appendPoints('sealed-authority-session', [
        { lat: -31.95, lon: 115.86 },
      ]);
      await store.persistCompleted({
        activityId: identity.activityId,
        ownerId: identity.ownerId,
        activity: {
          type: 'run',
          distance_m: 0,
          duration_s: 30,
          route: [{ lat: -31.95, lon: 115.86 }],
          started_at: identity.startedAt,
        },
      });
      const durable = JSON.parse(storage.data.get('activity:points')!);
      if (field === 'owner') {
        durable.terminal.finalized.identity.ownerId = 'owner-b';
      } else if (field === 'activity') {
        durable.terminal.finalized.recording.activityId = 'other-activity';
      } else if (field === 'startedAt') {
        durable.terminal.finalized.identity.startedAt =
          '2026-08-24T00:00:00.000Z';
      } else {
        durable.terminal.finalized.snapshotId = 'other-snapshot';
      }
      storage.data.set('activity:points', JSON.stringify(durable));

      await expect(store.recover('owner-a')).resolves.toMatchObject({
        kind: 'closing',
        quarantineReason: 'legacy_unprovable',
      });
      await expect(store.readPendingCompleted()).resolves.toBeNull();
    },
  );

  it('quarantines a generation-zero recording instead of ever sealing it', async () => {
    const startedAt = '2026-08-25T00:00:00.000Z';
    const storage = memoryStorage({
      'activity:points': JSON.stringify({
        schema: 3,
        revision: 1,
        session: 'session-legacy-zero',
        activityId: 'activity-legacy-zero',
        ownerId: 'owner-a',
        startedAt,
        type: 'run',
        points: [
          { lat: -31.9500, lon: 115.8600 },
          { lat: -31.9510, lon: 115.8610 },
        ],
        completed: null,
        locationLeases: [{
          schema: 1,
          id: 'lease-legacy-zero',
          ordinal: 1,
          session: 'session-legacy-zero',
          activityId: 'activity-legacy-zero',
          ownerId: 'owner-a',
          startedAt,
          activatedAt: 1_000,
          revokedAtExclusive: null,
          collectorGeneration: 0,
          drainedThroughSequence: null,
        }],
        consumedLocationChunkIds: [],
        resumeAfterOwnerCheck: false,
        state: 'recording',
        terminal: null,
      }),
    });
    const legacyRuntime = nativeRuntime(true);
    const store = createLocationRecordingStore({
      storage,
      createChunkId: () => 'late-legacy-batch',
      nowMs: () => 2_000,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime: {
        hasStarted: legacyRuntime.hasStarted,
        getForegroundPermission: legacyRuntime.getForegroundPermission,
        getBackgroundPermission: legacyRuntime.getBackgroundPermission,
        start: legacyRuntime.start,
        stop: legacyRuntime.stop,
      },
      createLeaseId: () => 'unused',
      createFinishId: () => 'finish-legacy-zero',
      createSnapshotId: () => 'snapshot-legacy-zero',
      nowMs: () => 2_000,
    });
    const identity = {
      activityId: 'activity-legacy-zero',
      ownerId: 'owner-a',
      startedAt,
    };

    await expect(lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 60,
    })).resolves.toEqual({
      kind: 'closing',
      finishId: 'legacy-unprovable-finish:activity-legacy-zero',
      reason: 'legacy_unprovable',
    });
    expect(legacyRuntime.stop).toHaveBeenCalled();
    expect(JSON.parse(storage.data.get('activity:points')!)).toMatchObject({
      completed: null,
      state: 'closing',
      terminal: {
        phase: 'closing',
        quarantineReason: 'legacy_unprovable',
      },
    });

    await store.appendTaskSamples([{
      lat: -31.952,
      lon: 115.862,
      capturedAt: 1_500,
    }]);
    const restarted = createLocationTaskLifecycle({
      storage,
      runtime: {
        hasStarted: legacyRuntime.hasStarted,
        getForegroundPermission: legacyRuntime.getForegroundPermission,
        getBackgroundPermission: legacyRuntime.getBackgroundPermission,
        start: legacyRuntime.start,
        stop: legacyRuntime.stop,
      },
      createLeaseId: () => 'unused-after-restart',
      createFinishId: () => 'must-not-replace-finish',
      createSnapshotId: () => 'must-not-replace-snapshot',
      nowMs: () => 2_001,
    });
    await expect(restarted.finalizeFor(identity, {
      type: 'run', durationS: 60,
    })).resolves.toMatchObject({
      kind: 'closing',
      reason: 'legacy_unprovable',
    });
    expect(JSON.parse(storage.data.get('activity:points')!)).toMatchObject({
      completed: null,
      terminal: { phase: 'closing' },
    });
    await expect(restarted.discardFor(identity)).resolves.toBe('discarded');
    expect(storage.data.has(`${WAL_PREFIX}late-legacy-batch`)).toBe(false);
    expect(storage.data.has('activity:points')).toBe(false);

    const quarantine = storage.data.get(LEGACY_QUARANTINE_KEY);
    expect(quarantine).toBeDefined();
    expect(quarantine).not.toMatch(/owner-a|activity-legacy-zero|session-legacy-zero/);

    // A queued legacy TaskManager callback can land after the exact discard.
    // The handler writes first, observes the durable tombstone, then removes
    // the exact new batch without waiting for another auth/boot cycle.
    await store.appendTaskSamples([{
      lat: -31.953,
      lon: 115.863,
      capturedAt: 1_600,
    }]);
    expect(storage.data.has(`${WAL_PREFIX}late-legacy-batch`)).toBe(false);
    const ownerBStore = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-owner-b',
      createSessionId: () => 'session-owner-b',
      nowIso: () => '2026-08-25T01:00:00.000Z',
    });
    const ownerB = await ownerBStore.begin('owner-b', 'walk');
    await expect(ownerBStore.readRecording('owner-b')).resolves.toMatchObject({
      ...ownerB,
      points: [],
    });
  });

  it('drains a proven generation but quarantines a mixed legacy recording', async () => {
    const startedAt = '2026-08-25T00:00:00.000Z';
    const storage = memoryStorage({
      'activity:points': JSON.stringify({
        schema: 3,
        revision: 1,
        session: 'session-mixed',
        activityId: 'activity-mixed',
        ownerId: 'owner-a',
        startedAt,
        type: 'run',
        points: [{ lat: -31.95, lon: 115.86 }],
        completed: null,
        locationLeases: [
          {
            schema: 1,
            id: 'lease-legacy',
            ordinal: 1,
            session: 'session-mixed',
            activityId: 'activity-mixed',
            ownerId: 'owner-a',
            startedAt,
            activatedAt: 1_000,
            revokedAtExclusive: 1_500,
            collectorGeneration: 0,
            drainedThroughSequence: null,
          },
          {
            schema: 1,
            id: 'lease-generation-one',
            ordinal: 2,
            session: 'session-mixed',
            activityId: 'activity-mixed',
            ownerId: 'owner-a',
            startedAt,
            activatedAt: 1_600,
            revokedAtExclusive: null,
            collectorGeneration: 1,
            drainedThroughSequence: null,
          },
        ],
        consumedLocationChunkIds: [],
        resumeAfterOwnerCheck: false,
        state: 'paused',
        terminal: null,
      }),
      'activity:location-lineage:v1': JSON.stringify({
        schema: 1,
        nextGeneration: 2,
        collectors: [{
          generation: 1,
          leaseId: 'lease-generation-one',
          session: 'session-mixed',
          activityId: 'activity-mixed',
          ownerId: 'owner-a',
          startedAt,
          activatedAt: 1_600,
          revokedAtExclusive: null,
          drainedThroughSequence: null,
          resolution: 'active',
        }],
      }),
    });
    const runtime = nativeRuntime();
    const identity = {
      activityId: 'activity-mixed',
      ownerId: 'owner-a',
      startedAt,
    };
    await runtime.reserveGeneration(1);
    await runtime.start(1);
    runtime.start.mockClear();
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'unused',
      createFinishId: () => 'finish-mixed',
      createSnapshotId: () => 'snapshot-mixed',
      nowMs: () => 2_000,
    });

    await expect(lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 60,
    })).resolves.toEqual({
      kind: 'closing',
      finishId: 'legacy-unprovable-finish:activity-mixed',
      reason: 'legacy_unprovable',
    });
    expect(runtime.stopAndDrain).toHaveBeenCalledWith(1);
    expect(JSON.parse(storage.data.get('activity:points')!)).toMatchObject({
      completed: null,
      terminal: { quarantineReason: 'legacy_unprovable' },
      locationLeases: [
        { collectorGeneration: 0 },
        { collectorGeneration: 1, drainedThroughSequence: 0 },
      ],
    });
  });

  it('stays closing when the runtime cannot prove generation drain', async () => {
    const storage = memoryStorage();
    const legacyRuntime = nativeRuntime();
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-legacy',
      createSessionId: () => 'session-legacy',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => 2_000,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime: {
        hasStarted: legacyRuntime.hasStarted,
        getForegroundPermission: legacyRuntime.getForegroundPermission,
        getBackgroundPermission: legacyRuntime.getBackgroundPermission,
        start: legacyRuntime.start,
        stop: legacyRuntime.stop,
      },
      createLeaseId: () => 'lease-legacy',
      createFinishId: () => 'finish-legacy',
      createSnapshotId: () => 'snapshot-legacy',
      nowMs: () => 2_000,
    });
    const identity = await store.begin('owner-a', 'run');
    await store.acquireTaskLease(identity, 'lease-legacy', 1_000);

    await expect(lifecycle.finalizeFor(identity, {
      type: 'run',
      durationS: 60,
    })).resolves.toEqual({
      kind: 'closing',
      finishId: 'finish-legacy',
      reason: 'drain_unavailable',
    });
  });

  it('persists an exact durable drain proof before sealing', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    let clock = 1_000;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-drained',
      createSessionId: () => 'session-drained',
      createChunkId: () => 'batch-drained',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => clock,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-drained',
      createFinishId: () => 'finish-drained',
      createSnapshotId: () => 'snapshot-drained',
      nowMs: () => clock,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);
    clock = 2_000;

    await expect(lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 60,
    })).resolves.toMatchObject({ kind: 'sealed' });

    expect(runtime.stopAndDrain).toHaveBeenCalledWith(1);
    expect(JSON.parse(storage.data.get('activity:points')!)).toMatchObject({
      locationLeases: [{
        collectorGeneration: 1,
        drainedThroughSequence: 0,
      }],
    });
    expect(JSON.parse(storage.data.get('activity:location-lineage:v1')!))
      .toMatchObject({
        collectors: [{
          generation: 1,
          drainedThroughSequence: 0,
          resolution: 'sealed',
        }],
      });
  });

  it('keeps closing when native drain proof does not match the lease generation', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    runtime.stopAndDrain.mockImplementation(async () => ({
      generation: 999,
      drained: true as const,
      throughSequence: 1,
      outcome: 'exact' as const,
    }));
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
      createFinishId: () => 'finish-a',
      createSnapshotId: () => 'snapshot-a',
      nowMs: () => 2_000,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);

    await expect(lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 60,
    })).resolves.toEqual({
      kind: 'closing',
      finishId: 'finish-a',
      reason: 'drain_unconfirmed',
    });
    expect(JSON.parse(storage.data.get('activity:points')!)).toMatchObject({
      state: 'closing',
      locationLeases: [{ drainedThroughSequence: null }],
    });
  });

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
    await appendForActiveLease(store, [
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
    expect(runtime.stopAndDrain).toHaveBeenCalledWith(1);
    await expect(store.recover('owner-a')).resolves.toEqual({
      kind: 'completed',
      finalized: (left as Extract<typeof left, { kind: 'sealed' }>).finalized,
    });
  });

  it('refuses an above-proof batch even when it appears during a stable scan', async () => {
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
          collectorGeneration: 1,
          receivedAt: 2_000,
          samples: [{
            lat: 2,
            lon: 2,
            capturedAt: 1_200,
            nativeSequence: 12_000,
          }],
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
    await appendForActiveLease(store, [
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
        reason: 'tracking_incomplete',
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
    expect(sealed).toEqual({
      kind: 'closing',
      finishId: 'finish-stable',
        reason: 'tracking_incomplete',
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
    const originalDrain = runtime.stopAndDrain.getMockImplementation()!;
    runtime.stopAndDrain.mockImplementation(async (generation: number) => {
      await originalDrain(generation);
      return {
        generation,
        drained: true as const,
        throughSequence: 1,
        outcome: 'exact' as const,
      };
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);
    blockWal = true;
    const handler = createLocationTaskHandler(store);
    const selectedCallback = handler({
      data: {
        collectorGeneration: 1,
        collectorBatchId: '123e4567-e89b-12d3-a456-426614174006',
        collectorThroughSequence: 1,
        locations: [{
          coords: { latitude: 1, longitude: 1 },
          timestamp: 1_100,
          nativeSequence: 1,
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
      reason: 'tracking_incomplete',
    });
    expect(storage.data.has(`${WAL_PREFIX}corrupt`)).toBe(true);
    expect(storage.calls).not.toContain(`remove:${WAL_PREFIX}corrupt`);
  });

  it('acknowledges by exact identity and removes every exact closed-generation key', async () => {
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
    await appendForActiveLease(store, [
      { lat: 1, lon: 1, capturedAt: 1_100 },
    ]);
    await appendForActiveLease(store, [
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
    )).resolves.toBe('stale');
    await expect(lifecycle.claimFinalizedEnqueueFor(
      identity,
      'wrong-snapshot',
    )).resolves.toEqual({ kind: 'stale' });
    await expect(lifecycle.claimFinalizedEnqueueFor(
      identity,
      'snapshot-a',
    )).resolves.toEqual({ kind: 'claimed' });
    await expect(lifecycle.claimFinalizedEnqueueFor(
      identity,
      'snapshot-a',
    )).resolves.toEqual({ kind: 'already_claimed' });
    await expect(lifecycle.discardFor(identity))
      .resolves.toBe('completion_in_progress');
    await expect(lifecycle.acknowledgeFinalizedFor(
      identity,
      'snapshot-a',
    )).resolves.toBe('acknowledged');

    expect(storage.data.has(`${WAL_PREFIX}batch-1`)).toBe(false);
    expect(storage.data.has(`${WAL_PREFIX}batch-2`)).toBe(false);
    await expect(store.recover('owner-a')).resolves.toEqual({ kind: 'none' });
  });

  it('never seals or consumes samples above the native drain proof', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    const originalDrain = runtime.stopAndDrain.getMockImplementation()!;
    runtime.stopAndDrain.mockImplementation(async (generation: number) => {
      await originalDrain(generation);
      return {
        generation,
        drained: true as const,
        throughSequence: 1,
        outcome: 'exact' as const,
      };
    });
    let clock = 1_000;
    let batch = 0;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-proof',
      createSessionId: () => 'session-proof',
      createChunkId: () => `proof-batch-${++batch}`,
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => clock,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-proof',
      createFinishId: () => 'finish-proof',
      createSnapshotId: () => 'snapshot-proof',
      nowMs: () => clock,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);
    await store.appendTaskSamples([
      { lat: 1, lon: 1, capturedAt: 1_100, nativeSequence: 1 },
      { lat: 2, lon: 2, capturedAt: 1_200, nativeSequence: 2 },
    ], 1);
    await store.appendTaskSamples([
      { lat: 3, lon: 3, capturedAt: 1_300, nativeSequence: 3 },
    ], 1);
    clock = 2_000;

    const result = await lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 60,
    });
    expect(result).toEqual({
      kind: 'closing',
      finishId: 'finish-proof',
      reason: 'tracking_incomplete',
    });
    expect(storage.data.has(`${WAL_PREFIX}proof-batch-1`)).toBe(true);
    expect(storage.data.has(`${WAL_PREFIX}proof-batch-2`)).toBe(true);
  });

  it('quarantines an exact generation when WAL sequence coverage has a gap', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    const originalDrain = runtime.stopAndDrain.getMockImplementation()!;
    runtime.stopAndDrain.mockImplementation(async (generation: number) => {
      await originalDrain(generation);
      return {
        generation,
        drained: true as const,
        throughSequence: 3,
        outcome: 'exact' as const,
      };
    });
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-sequence-gap',
      createSessionId: () => 'session-sequence-gap',
      createChunkId: () => 'sequence-gap',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => 2_000,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-sequence-gap',
      createFinishId: () => 'finish-sequence-gap',
      createSnapshotId: () => 'snapshot-sequence-gap',
      nowMs: () => 2_000,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);
    await store.appendTaskSamples([
      { lat: 1, lon: 1, capturedAt: 1_100, nativeSequence: 1 },
      { lat: 3, lon: 3, capturedAt: 1_300, nativeSequence: 3 },
    ], 1);

    await expect(lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 60,
    })).resolves.toEqual({
      kind: 'closing',
      finishId: 'finish-sequence-gap',
      reason: 'tracking_incomplete',
    });
  });

  it('quarantines conflicting payloads for one exact native sequence', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    const originalDrain = runtime.stopAndDrain.getMockImplementation()!;
    runtime.stopAndDrain.mockImplementation(async (generation: number) => {
      await originalDrain(generation);
      return {
        generation,
        drained: true as const,
        throughSequence: 1,
        outcome: 'exact' as const,
      };
    });
    let batch = 0;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-sequence-conflict',
      createSessionId: () => 'session-sequence-conflict',
      createChunkId: () => `sequence-conflict-${++batch}`,
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => 2_000,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-sequence-conflict',
      createFinishId: () => 'finish-sequence-conflict',
      createSnapshotId: () => 'snapshot-sequence-conflict',
      nowMs: () => 2_000,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);
    await store.appendTaskSamples([
      { lat: 1, lon: 1, capturedAt: 1_100, nativeSequence: 1 },
    ], 1);
    await store.appendTaskSamples([
      { lat: 2, lon: 2, capturedAt: 1_100, nativeSequence: 1 },
    ], 1);

    await expect(lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 60,
    })).resolves.toMatchObject({
      kind: 'closing',
      reason: 'tracking_incomplete',
    });
  });

  it('accepts byte-identical replay for one exact native sequence once', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    const originalDrain = runtime.stopAndDrain.getMockImplementation()!;
    runtime.stopAndDrain.mockImplementation(async (generation: number) => {
      await originalDrain(generation);
      return {
        generation,
        drained: true as const,
        throughSequence: 1,
        outcome: 'exact' as const,
      };
    });
    let batch = 0;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-sequence-replay',
      createSessionId: () => 'session-sequence-replay',
      createChunkId: () => `sequence-replay-${++batch}`,
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => 2_000,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-sequence-replay',
      createFinishId: () => 'finish-sequence-replay',
      createSnapshotId: () => 'snapshot-sequence-replay',
      nowMs: () => 2_000,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);
    const sample = {
      lat: 1,
      lon: 1,
      capturedAt: 1_100,
      nativeSequence: 1,
    };
    await store.appendTaskSamples([sample], 1);
    await store.appendTaskSamples([sample], 1);

    await expect(lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 60,
    })).resolves.toMatchObject({
      kind: 'sealed',
      finalized: {
        recording: { activity: { route: [{ lat: 1, lon: 1 }] } },
      },
    });
  });

  it('keeps a native discard-only proof permanently non-shareable', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    const originalDrain = runtime.stopAndDrain.getMockImplementation()!;
    runtime.stopAndDrain.mockImplementation(async (generation: number) => {
      await originalDrain(generation);
      return {
        generation,
        drained: true as const,
        throughSequence: 1,
        outcome: 'discard-only' as const,
      };
    });
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-native-taint',
      createSessionId: () => 'session-native-taint',
      createChunkId: () => 'native-taint-batch',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => 2_000,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-native-taint',
      createFinishId: () => 'finish-native-taint',
      createSnapshotId: () => 'snapshot-native-taint',
      nowMs: () => 2_000,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);
    await store.appendTaskSamples([{
      lat: 1,
      lon: 1,
      capturedAt: 1_100,
      nativeSequence: 1,
    }], 1);

    await expect(lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 60,
    })).resolves.toEqual({
      kind: 'closing',
      finishId: 'finish-native-taint',
      reason: 'tracking_incomplete',
    });
    await expect(store.recover('owner-a')).resolves.toMatchObject({
      kind: 'closing',
      quarantineReason: 'tracking_incomplete',
    });
    await expect(store.readPendingCompleted()).resolves.toBeNull();
    await expect(lifecycle.discardFor(identity)).resolves.toBe('discarded');
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
    await appendForActiveLease(store, [
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
    await appendForActiveLease(store, [
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

    await lifecycle.claimFinalizedEnqueueFor(identity, 'snapshot-a');
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

  it('persists partial too-short cleanup and resumes its exact receipt after restart', async () => {
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
    await appendForActiveLease(store, [
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
    expect(storage.data.has(
      'activity:location-cleanup:v1:snapshot-short',
    )).toBe(true);
    expect(JSON.parse(storage.data.get('activity:points')!)).toMatchObject({
      terminal: {
        resolution: 'discarding',
        snapshotId: 'snapshot-short',
      },
    });

    failCleanup = false;
    const restartedLifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'unused-after-restart',
      createFinishId: () => 'must-not-replace-finish',
      createSnapshotId: () => 'must-not-replace-snapshot',
      nowMs: () => clock,
    });
    await expect(restartedLifecycle.reconcileAtBoot())
      .resolves.toBe('paused');
    await expect(store.recover('owner-a')).resolves.toEqual({ kind: 'none' });
    expect(storage.data.has(`${WAL_PREFIX}batch-short`)).toBe(false);
    expect(storage.data.has(
      'activity:location-cleanup:v1:snapshot-short',
    )).toBe(false);
  });

  it('keeps lineage recoverable until authoritative too-short removal commits', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    let clock = 1_000;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-short-atomic',
      createSessionId: () => 'session-short-atomic',
      createChunkId: () => 'batch-short-atomic',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => clock,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-short-atomic',
      createFinishId: () => 'finish-short-atomic',
      createSnapshotId: () => 'snapshot-short-atomic',
      nowMs: () => clock,
    });
    const identity = await store.begin('owner-private', 'run');
    await lifecycle.startFor(identity);
    await appendForActiveLease(store, [
      { lat: 1, lon: 1, capturedAt: 1_100 },
    ]);
    clock = 2_000;
    const baseRemove = storage.removeItem.bind(storage);
    let failAuthoritativeRemove = true;
    storage.removeItem = async (key) => {
      if (key === 'activity:points' && failAuthoritativeRemove) {
        failAuthoritativeRemove = false;
        throw new Error('process terminated before authoritative removal');
      }
      return baseRemove(key);
    };

    await expect(lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 2,
    })).resolves.toMatchObject({
      kind: 'closing',
      reason: 'persistence_unconfirmed',
    });
    expect(JSON.parse(storage.data.get('activity:location-lineage:v1')!))
      .toMatchObject({
        collectors: [{
          generation: 1,
          ownerId: 'owner-private',
          resolution: 'discarded',
        }],
      });
    expect(storage.data.has('activity:points')).toBe(true);
    expect(storage.data.has(
      'activity:location-cleanup:v1:snapshot-short-atomic',
    )).toBe(true);

    const restarted = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'unused',
      nowMs: () => clock,
    });
    await expect(restarted.reconcileAtBoot()).resolves.toBe('paused');
    expect(storage.data.has('activity:points')).toBe(false);
    expect(JSON.parse(storage.data.get('activity:location-lineage:v1')!))
      .toEqual({ schema: 1, nextGeneration: 2, collectors: [] });
    expect(storage.data.has(
      'activity:location-cleanup:v1:snapshot-short-atomic',
    )).toBe(false);
  });

  it('returns too_short after stable exact cleanup without exposing a save candidate', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    let clock = 1_000;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-short-clean',
      createSessionId: () => 'session-short-clean',
      createChunkId: () => 'batch-short-clean',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => clock,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-short-clean',
      createFinishId: () => 'finish-short-clean',
      createSnapshotId: () => 'snapshot-short-clean',
      nowMs: () => clock,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);
    await appendForActiveLease(store, [
      { lat: 1, lon: 1, capturedAt: 1_100 },
    ]);
    clock = 2_000;

    await expect(lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 2,
    })).resolves.toEqual({ kind: 'too_short' });
    await expect(store.recover('owner-a')).resolves.toEqual({ kind: 'none' });
    expect(storage.data.has(`${WAL_PREFIX}batch-short-clean`)).toBe(false);
    expect([...storage.data.keys()].some((key) =>
      key.startsWith('activity:location-cleanup:v1:'),
    )).toBe(false);
  });

  it('uses B generation ownership even when B capture wall time regresses', async () => {
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
    await lifecycle.claimFinalizedEnqueueFor(a, 'snapshot-a');
    await lifecycle.acknowledgeFinalizedFor(a, 'snapshot-a');

    clock = 3_000;
    const b = await store.begin('owner-b', 'walk');
    await lifecycle.startFor(b);
    await appendForActiveLease(store, [
      { lat: 1, lon: 1, capturedAt: 1_500 },
      { lat: 2, lon: 2, capturedAt: 3_100 },
    ]);

    await expect(store.readRecording('owner-b')).resolves.toMatchObject({
      ...b,
      points: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }],
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

  it('deep-discards an active recording and removes its entire exact generation', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    let clock = 1_000;
    let batch = 0;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-a',
      createSessionId: () => 'session-a',
      createChunkId: () => `batch-${++batch}`,
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => clock,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-a',
      createFinishId: () => 'discard-finish',
      createSnapshotId: () => 'discard-snapshot',
      nowMs: () => clock,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);
    await appendForActiveLease(store, [
      { lat: 1, lon: 1, capturedAt: 1_100 },
    ]);
    await appendForActiveLease(store, [
      { lat: 2, lon: 2, capturedAt: 1_200 },
      { lat: 9, lon: 9, capturedAt: 2_500 },
    ]);
    storage.data.set(`${WAL_PREFIX}corrupt`, '{not-json');
    clock = 2_000;

    await expect(lifecycle.discardFor(identity)).resolves.toBe('discarded');

    expect(runtime.stopAndDrain).toHaveBeenCalledWith(1);
    expect(storage.data.has('activity:points')).toBe(false);
    expect(storage.data.has(`${WAL_PREFIX}batch-1`)).toBe(false);
    expect(storage.data.has(`${WAL_PREFIX}batch-2`)).toBe(false);
    expect(storage.data.has(`${WAL_PREFIX}corrupt`)).toBe(false);
    expect(JSON.parse(storage.data.get('activity:location-lineage:v1')!))
      .toMatchObject({ collectors: [] });
  });

  it('deep-discard cleans every batch of the exact drained generation', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    const originalDrain = runtime.stopAndDrain.getMockImplementation()!;
    runtime.stopAndDrain.mockImplementation(async (generation: number) => {
      await originalDrain(generation);
      return {
        generation,
        drained: true as const,
        throughSequence: 1,
        outcome: 'exact' as const,
      };
    });
    let clock = 1_000;
    let batch = 0;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-discard-proof',
      createSessionId: () => 'session-discard-proof',
      createChunkId: () => `discard-proof-batch-${++batch}`,
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => clock,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-discard-proof',
      createFinishId: () => 'finish-discard-proof',
      createSnapshotId: () => 'snapshot-discard-proof',
      nowMs: () => clock,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);
    await store.appendTaskSamples([
      { lat: 1, lon: 1, capturedAt: 1_100, nativeSequence: 1 },
      { lat: 2, lon: 2, capturedAt: 1_200, nativeSequence: 2 },
    ], 1);
    await store.appendTaskSamples([
      { lat: 3, lon: 3, capturedAt: 1_300, nativeSequence: 3 },
    ], 1);
    clock = 2_000;

    await expect(lifecycle.discardFor(identity)).resolves.toBe('discarded');
    expect(storage.data.has(`${WAL_PREFIX}discard-proof-batch-1`)).toBe(false);
    expect(storage.data.has(`${WAL_PREFIX}discard-proof-batch-2`)).toBe(false);
  });

  it('keeps only a monotonic high-water mark after repeated exact cleanup', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    let clock = 1_000;
    let run = 0;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => `activity-${run + 1}`,
      createSessionId: () => `session-${run + 1}`,
      nowIso: () => `2026-08-25T00:00:0${run}.000Z`,
      nowMs: () => clock,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => `lease-${run + 1}`,
      createFinishId: () => `finish-${run + 1}`,
      createSnapshotId: () => `snapshot-${run + 1}`,
      nowMs: () => clock,
    });

    for (run = 0; run < 5; run += 1) {
      const identity = await store.begin(`owner-private-${run}`, 'run');
      await lifecycle.startFor(identity);
      clock += 1_000;
      await expect(lifecycle.discardFor(identity)).resolves.toBe('discarded');
      clock += 1;
    }

    const lineageRaw = storage.data.get('activity:location-lineage:v1')!;
    expect(JSON.parse(lineageRaw)).toEqual({
      schema: 1,
      nextGeneration: 6,
      collectors: [],
    });
    expect(lineageRaw).not.toContain('owner-private');
    expect(lineageRaw).not.toContain('activity-');
    expect(lineageRaw).not.toContain('session-');
  });

  it('seals a byte-stable canonical route that always fits queue limits', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    const activityId = '11111111-1111-4111-8111-111111111111';
    const ownerId = '22222222-2222-4222-8222-222222222222';
    const session = 'session-queue-boundary';
    const startedAt = '2026-08-25T00:00:00.000Z';
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => activityId,
      createSessionId: () => session,
      nowIso: () => startedAt,
      nowMs: () => 2_000,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'unused',
      createFinishId: () => 'finish-queue-boundary',
      createSnapshotId: () => 'snapshot-queue-boundary',
      nowMs: () => 2_000,
    });
    const identity = await store.begin(ownerId, 'run');
    const rawRoute = Array.from({ length: MAX_ROUTE_POINTS + 1 }, (_, index) => ({
      lat: -31.95 + (index % 1_000) * 0.0000001234567,
      lon: 115.86 + Math.floor(index / 1_000) * 0.0000001234567,
    }));
    await store.appendPoints(session, rawRoute);

    const sealedAttempts: string[] = [];
    let failFirstSeal = true;
    const baseSet = storage.setItem.bind(storage);
    storage.setItem = async (key, value) => {
      if (key === 'activity:points' && value.includes('"phase":"sealed"')) {
        const parsed = JSON.parse(value);
        sealedAttempts.push(JSON.stringify(
          parsed.terminal.finalized.recording.activity,
        ));
        if (failFirstSeal) {
          failFirstSeal = false;
          throw new Error('simulated process loss during sealed write');
        }
      }
      return baseSet(key, value);
    };

    await expect(lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 3_600,
    })).resolves.toMatchObject({
      kind: 'closing',
      reason: 'persistence_unconfirmed',
    });
    const finalized = await lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 3_600,
    });
    expect(finalized).toMatchObject({ kind: 'sealed' });
    if (finalized.kind !== 'sealed') throw new Error('Expected sealed route');
    const canonical = finalized.finalized.recording.activity.route;
    expect(canonical.length).toBeLessThanOrEqual(MAX_ROUTE_POINTS);
    expect(canonical[0]).toEqual(rawRoute[0]);
    expect(canonical[canonical.length - 1]).toEqual(rawRoute[rawRoute.length - 1]);

    const queueEnvelope = JSON.stringify({
      schema: 1,
      id: activityId,
      ownerId,
      activity: finalized.finalized.recording.activity,
      createdAt: '9999-12-31T23:59:59.999Z',
      status: 'needs_attention',
      attemptCount: Number.MAX_SAFE_INTEGER,
      nextAttemptAt: Number.MAX_SAFE_INTEGER,
      lastError: {
        category: 'validation',
        message: '\u0000'.repeat(MAX_LAST_ERROR_MESSAGE_LENGTH),
      },
    });
    expect(new TextEncoder().encode(queueEnvelope).byteLength)
      .toBeLessThanOrEqual(MAX_QUEUED_ACTIVITY_BYTES);
    expect(sealedAttempts).toHaveLength(2);
    expect(sealedAttempts[1]).toBe(sealedAttempts[0]);

    const durable = JSON.parse(storage.data.get('activity:points')!);
    expect(durable.points).toHaveLength(rawRoute.length);
    expect(durable.terminal.candidate.route).toHaveLength(rawRoute.length);
    expect(durable.completed.route).toEqual(canonical);
  }, 30_000);

  it('lets a durable discard claim invalidate every pending finalize write', async () => {
    const storage = memoryStorage();
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-cas-discard',
      createSessionId: () => 'session-cas-discard',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => 2_000,
    });
    const identity = await store.begin('owner-a', 'run');
    await store.appendPoints('session-cas-discard', [
      { lat: -31.9500, lon: 115.8600 },
      { lat: -31.9510, lon: 115.8610 },
    ]);
    const closing = await store.beginClosing(
      identity,
      { type: 'run', durationS: 60 },
      'finish-cas',
      'snapshot-cas',
      2_000,
    );
    expect(closing.kind).toBe('closing');
    if (closing.kind !== 'closing') throw new Error('Expected closing');
    const scan = await store.scanTerminalJournal(closing.blob);
    expect(scan.kind).toBe('ok');
    if (scan.kind !== 'ok') throw new Error('Expected journal snapshot');

    await expect(store.beginDiscard(
      identity,
      'discard-finish',
      'discard-snapshot',
      2_001,
    )).resolves.toMatchObject({ kind: 'discarding' });

    await expect(store.persistTerminalCandidate(
      identity,
      'finish-cas',
      closing.blob.terminal!.resolutionId,
      scan.snapshot,
    )).resolves.toBe(false);
    await expect(store.sealTerminalCandidate(
      identity,
      'finish-cas',
      closing.blob.terminal!.resolutionId,
      scan.snapshot,
    )).resolves.toBeNull();
    expect(JSON.parse(storage.data.get('activity:points')!)).toMatchObject({
      terminal: { resolution: 'discarding' },
    });
  });

  it('never lets finalize adopt a terminal already claimed for discard', async () => {
    const storage = memoryStorage();
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-discard-first',
      createSessionId: () => 'session-discard-first',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => 2_000,
    });
    const identity = await store.begin('owner-a', 'run');
    await store.beginDiscard(
      identity,
      'discard-finish',
      'discard-snapshot',
      2_000,
    );

    await expect(store.beginClosing(
      identity,
      { type: 'run', durationS: 60 },
      'later-finish',
      'later-snapshot',
      2_001,
    )).resolves.toEqual({ kind: 'stale' });
    expect(JSON.parse(storage.data.get('activity:points')!)).toMatchObject({
      terminal: {
        finishId: 'discard-finish',
        snapshotId: 'discard-snapshot',
        resolution: 'discarding',
      },
    });
  });

  it('keeps a restarted finalize stale after a durable discard decision', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-restart-discard',
      createSessionId: () => 'session-restart-discard',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => 2_000,
    });
    const identity = await store.begin('owner-a', 'run');
    await store.beginDiscard(
      identity,
      'discard-finish',
      'discard-snapshot',
      2_000,
    );
    const restarted = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'unused',
      createFinishId: () => 'must-not-replace-finish',
      createSnapshotId: () => 'must-not-replace-snapshot',
      nowMs: () => 2_001,
    });

    await expect(restarted.finalizeFor(identity, {
      type: 'run', durationS: 60,
    })).resolves.toEqual({ kind: 'stale' });
    expect(JSON.parse(storage.data.get('activity:points')!)).toMatchObject({
      terminal: {
        finishId: 'discard-finish',
        resolution: 'discarding',
      },
    });
  });

  it('leaves exact discard cleanup recoverable after a remove failure and allows B', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    let clock = 1_000;
    let activity = 0;
    let failRemove = true;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => `activity-${++activity}`,
      createSessionId: () => `session-${activity}`,
      createChunkId: () => 'discard-batch',
      nowIso: () => `2026-08-25T00:00:0${activity}.000Z`,
      nowMs: () => clock,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => `lease-${activity}`,
      createFinishId: () => 'discard-finish',
      createSnapshotId: () => 'discard-snapshot',
      nowMs: () => clock,
    });
    const identityA = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identityA);
    await appendForActiveLease(store, [
      { lat: 1, lon: 1, capturedAt: 1_100 },
    ]);
    const baseRemove = storage.removeItem.bind(storage);
    storage.removeItem = async (key) => {
      if (key === `${WAL_PREFIX}discard-batch` && failRemove) {
        throw new Error('remove failed');
      }
      return baseRemove(key);
    };
    clock = 2_000;

    await expect(lifecycle.discardFor(identityA)).resolves.toBe('discarded');
    expect(storage.data.has(`${WAL_PREFIX}discard-batch`)).toBe(true);
    expect([...storage.data.keys()].some((key) =>
      key.startsWith('activity:location-cleanup:v1:'),
    )).toBe(true);

    failRemove = false;
    const identityB = await store.begin('owner-b', 'walk');
    expect(identityB.activityId).toBe('activity-2');
    expect(storage.data.has(`${WAL_PREFIX}discard-batch`)).toBe(false);
  });

  it('refuses to discard a sealed recording once its enqueue is durably claimed', async () => {
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
    clock = 2_000;
    await lifecycle.finalizeFor(identity, { type: 'run', durationS: 60 });
    await lifecycle.claimFinalizedEnqueueFor(identity, 'snapshot-a');

    await expect(lifecycle.discardFor(identity))
      .resolves.toBe('completion_in_progress');
    await expect(store.recover('owner-a')).resolves.toMatchObject({
      kind: 'completed',
      finalized: { snapshotId: 'snapshot-a' },
    });
  });

  it('never exposes a sealed payload after durable discard wins', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-sealed-discard',
      createSessionId: () => 'session-sealed-discard',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => 2_000,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-sealed-discard',
      createFinishId: () => 'finish-sealed-discard',
      createSnapshotId: () => 'snapshot-sealed-discard',
      nowMs: () => 2_000,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);
    await expect(lifecycle.finalizeFor(identity, {
      type: 'run', durationS: 60,
    })).resolves.toMatchObject({ kind: 'sealed' });
    await expect(store.beginDiscard(
      identity,
      'discard-resolution',
      'unused-discard-snapshot',
      2_001,
    )).resolves.toMatchObject({ kind: 'discarding' });

    await expect(store.recover('owner-a')).resolves.toMatchObject({
      kind: 'closing',
    });
    await expect(store.claimLegacy('owner-a')).resolves.toMatchObject({
      kind: 'closing',
    });
    await expect(store.readPendingCompleted()).resolves.toBeNull();
    await expect(store.claimFinalizedEnqueue(
      identity,
      'snapshot-sealed-discard',
    )).resolves.toEqual({ kind: 'discarding' });

    await expect(lifecycle.discardFor(identity)).resolves.toBe('discarded');
    await expect(store.recover('owner-a')).resolves.toEqual({ kind: 'none' });
  });

  it('auto-resumes a durable discarding resolution after a process restart', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    let clock = 1_000;
    let failEnumeration = true;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-discard-restart',
      createSessionId: () => 'session-discard-restart',
      createChunkId: () => 'batch-discard-restart',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => clock,
    });
    const firstLifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-discard-restart',
      createFinishId: () => 'finish-discard-restart',
      createSnapshotId: () => 'snapshot-discard-restart',
      nowMs: () => clock,
    });
    const identity = await store.begin('owner-a', 'run');
    await firstLifecycle.startFor(identity);
    await appendForActiveLease(store, [
      { lat: 1, lon: 1, capturedAt: 1_100 },
    ]);
    clock = 2_000;
    const baseGetAllKeys = storage.getAllKeys!.bind(storage);
    storage.getAllKeys = async () => {
      if (failEnumeration) throw new Error('process terminated before scan');
      return baseGetAllKeys();
    };

    await expect(firstLifecycle.discardFor(identity))
      .rejects.toThrow('process terminated before scan');
    expect(JSON.parse(storage.data.get('activity:points')!)).toMatchObject({
      terminal: {
        resolution: 'discarding',
        finishId: 'finish-discard-restart',
        snapshotId: 'snapshot-discard-restart',
      },
    });

    failEnumeration = false;
    const restartedLifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'must-not-create-a-new-lease',
      createFinishId: () => 'must-not-replace-finish',
      createSnapshotId: () => 'must-not-replace-snapshot',
      nowMs: () => clock,
    });

    await expect(restartedLifecycle.reconcileAtBoot())
      .resolves.toBe('paused');
    expect(storage.data.has('activity:points')).toBe(false);
    expect(storage.data.has(`${WAL_PREFIX}batch-discard-restart`)).toBe(false);
    expect(JSON.parse(storage.data.get('activity:location-lineage:v1')!))
      .toMatchObject({ collectors: [] });
  });

  it('auto-resumes when a crash occurs after the discard receipt is durable', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    let clock = 1_000;
    let failAuthoritativeRemoval = true;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-discard-receipt',
      createSessionId: () => 'session-discard-receipt',
      createChunkId: () => 'batch-discard-receipt',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => clock,
    });
    const firstLifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-discard-receipt',
      createFinishId: () => 'finish-discard-receipt',
      createSnapshotId: () => 'snapshot-discard-receipt',
      nowMs: () => clock,
    });
    const identity = await store.begin('owner-a', 'run');
    await firstLifecycle.startFor(identity);
    await appendForActiveLease(store, [
      { lat: 1, lon: 1, capturedAt: 1_100 },
    ]);
    storage.data.set(
      `${WAL_PREFIX}malformed-discard-receipt`,
      '{"samples":[{"lat":-31.95',
    );
    clock = 2_000;
    const baseRemove = storage.removeItem.bind(storage);
    storage.removeItem = async (key) => {
      if (key === 'activity:points' && failAuthoritativeRemoval) {
        failAuthoritativeRemoval = false;
        throw new Error('process stopped after receipt');
      }
      return baseRemove(key);
    };

    await expect(firstLifecycle.discardFor(identity))
      .rejects.toThrow('process stopped after receipt');
    expect(storage.data.has(
      'activity:location-cleanup:v1:snapshot-discard-receipt',
    )).toBe(true);
    expect(storage.data.has('activity:points')).toBe(true);
    storage.data.set(
      'activity:location-cleanup:v1:snapshot-discard-receipt',
      '{corrupt-after-crash',
    );

    const restartedLifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'unused',
      nowMs: () => clock,
    });
    await expect(restartedLifecycle.reconcileAtBoot())
      .resolves.toBe('paused');
    expect(storage.data.has('activity:points')).toBe(false);
    expect(storage.data.has(`${WAL_PREFIX}batch-discard-receipt`)).toBe(false);
    expect(storage.data.has(`${WAL_PREFIX}malformed-discard-receipt`))
      .toBe(false);
    expect(storage.data.has(
      'activity:location-cleanup:v1:snapshot-discard-receipt',
    )).toBe(false);
  });
});

describe('shared native task coordinator', () => {
  it('exports the real owner reconciliation module contract', () => {
    expect(typeof reconcileLocationCollectorForOwner).toBe('function');
  });
  it('keeps the exact signed-in owner collector running during owner reconciliation', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
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
    runtime.stopAndDrain.mockClear();

    await expect((lifecycle as any).reconcileForOwner('owner-a'))
      .resolves.toBe('running');
    expect(runtime.stopAndDrain).not.toHaveBeenCalled();
    expect(JSON.parse(storage.data.get('activity:points')!)).toMatchObject({
      ownerId: 'owner-a',
      state: 'recording',
      locationLeases: [{ revokedAtExclusive: null }],
    });
  });

  it.each([
    ['another owner', 'owner-b'] as const,
    ['a signed-out session', null] as const,
  ])('durably pauses A and drains its collector for %s', async (...args) => {
    const [, currentOwnerId] = args as readonly [
      'another owner' | 'a signed-out session',
      'owner-b' | null,
    ];
    const storage = memoryStorage();
    const runtime = nativeRuntime();
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
    runtime.stopAndDrain.mockClear();

    await expect((lifecycle as any).reconcileForOwner(currentOwnerId))
      .resolves.toBe('paused');

    expect(runtime.stopAndDrain).toHaveBeenCalledWith(1);
    expect(JSON.parse(storage.data.get('activity:points')!)).toMatchObject({
      ownerId: 'owner-a',
      state: 'paused',
      locationLeases: [{
        revokedAtExclusive: 2_000,
        drainedThroughSequence: 0,
      }],
    });
  });

  it('keeps a mismatched owner durably paused when native drain rejects', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
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
    runtime.stopAndDrain.mockRejectedValue(new Error('native drain failed'));

    await expect((lifecycle as any).reconcileForOwner('owner-b'))
      .resolves.toBe('uncertain');
    expect(JSON.parse(storage.data.get('activity:points')!)).toMatchObject({
      ownerId: 'owner-a',
      state: 'paused',
      locationLeases: [{
        revokedAtExclusive: 2_000,
        drainedThroughSequence: null,
      }],
    });
  });

  it.each([
    [false] as const,
    [true] as const,
  ])('always reaches a paused collector at owner-free boot (active=%s)', async (
    ...args
  ) => {
    const [active] = args as readonly [boolean];
    const storage = memoryStorage();
    const runtime = nativeRuntime();
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
    if (active) await store.acquireTaskLease(identity, 'lease-a', 1_000);

    await expect(lifecycle.reconcileAtBoot()).resolves.toBe('paused');
    if (active) {
      expect(runtime.stopAndDrain).toHaveBeenCalledWith(1);
      expect(runtime.start).toHaveBeenCalledTimes(0);
      expect(JSON.parse(storage.data.get('activity:points')!)).toMatchObject({
        ownerId: 'owner-a',
        state: 'paused',
        resumeAfterOwnerCheck: true,
        locationLeases: [{
          collectorGeneration: 1,
          revokedAtExclusive: 1_000,
          drainedThroughSequence: 0,
        }],
      });
    }
  });

  it('removes ownerless WAL before auth when native is inactive and no recording exists', async () => {
    const storage = memoryStorage({
      [`${WAL_PREFIX}orphan-77`]: JSON.stringify({
        schema: 1,
        batchId: 'orphan-77',
        collectorGeneration: 77,
        receivedAt: 1_500,
        samples: [{
          lat: -31.95,
          lon: 115.86,
          capturedAt: 1_100,
          nativeSequence: 1,
        }],
      }),
      [`${WAL_PREFIX}orphan-malformed`]: '{partial-gps-bytes',
    });
    const runtime = nativeRuntime();
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'must-not-be-created',
    });

    await expect(lifecycle.reconcileAtBoot()).resolves.toBe('paused');
    expect([...storage.data.keys()].filter((key) =>
      key.startsWith(WAL_PREFIX),
    )).toEqual([]);
    expect(runtime.start).not.toHaveBeenCalled();
    expect(runtime.stopAndDrain).not.toHaveBeenCalled();
    expect(JSON.parse(
      storage.data.get('activity:location-lineage:v1')!,
    )).toMatchObject({
      nextGeneration: 78,
      collectors: [],
    });
  });

  it('resumes cold-launch A only after owner proof and uses a new generation', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    let clock = 1_000;
    let lease = 0;
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
      createLeaseId: () => `lease-${++lease}`,
      nowMs: () => clock,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);
    runtime.start.mockClear();
    clock = 2_000;

    await expect(lifecycle.reconcileAtBoot()).resolves.toBe('paused');
    expect(runtime.stopAndDrain).toHaveBeenCalledWith(1);
    expect(runtime.start).not.toHaveBeenCalled();

    clock = 2_100;
    await expect((lifecycle as any).reconcileForOwner('owner-a'))
      .resolves.toBe('running');
    expect(runtime.start).toHaveBeenCalledWith(2);
    expect(JSON.parse(storage.data.get('activity:points')!)).toMatchObject({
      ownerId: 'owner-a',
      state: 'recording',
      resumeAfterOwnerCheck: false,
      locationLeases: [
        {
          collectorGeneration: 1,
          revokedAtExclusive: 2_000,
          drainedThroughSequence: 0,
        },
        {
          collectorGeneration: 2,
          activatedAt: 2_100,
          revokedAtExclusive: null,
        },
      ],
    });
  });

  it('never starts stale A after a newer B owner intent is issued', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    let clock = 1_000;
    let lease = 0;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-owner-race',
      createSessionId: () => 'session-owner-race',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => clock,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => `lease-${++lease}`,
      nowMs: () => clock,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);
    clock = 2_000;
    await lifecycle.reconcileAtBoot();
    runtime.start.mockClear();

    const enteredStateRead = deferred<void>();
    const releaseStateRead = deferred<void>();
    const originalGetState = runtime.getCollectorState.getMockImplementation()!;
    const originalStart = runtime.start.getMockImplementation()!;
    let blockNextStateRead = true;
    let bIntentIssued = false;
    const startsAfterB: number[] = [];
    runtime.getCollectorState.mockImplementation(async () => {
      if (blockNextStateRead) {
        blockNextStateRead = false;
        enteredStateRead.resolve();
        await releaseStateRead.promise;
      }
      return originalGetState();
    });
    runtime.start.mockImplementation(async (generation?: number) => {
      if (bIntentIssued && generation !== undefined) {
        startsAfterB.push(generation);
      }
      await originalStart(generation);
    });

    const staleA = (lifecycle as any).reconcileForOwner('owner-a');
    await enteredStateRead.promise;
    bIntentIssued = true;
    const currentB = (lifecycle as any).reconcileForOwner('owner-b');
    releaseStateRead.resolve();
    await Promise.all([staleA, currentB]);

    expect(startsAfterB).toEqual([]);
    await expect(runtime.getCollectorState()).resolves.toEqual({
      running: false,
      generation: null,
      highWater: 1,
    });
    expect(JSON.parse(storage.data.get('activity:points')!)).toMatchObject({
      ownerId: 'owner-a',
      state: 'paused',
      resumeAfterOwnerCheck: true,
      locationLeases: [{ collectorGeneration: 1 }],
    });
  });

  it('lets only the newest A intent start across an A to B to A race', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    let clock = 1_000;
    let lease = 0;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-owner-aba',
      createSessionId: () => 'session-owner-aba',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => clock,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => `lease-${++lease}`,
      nowMs: () => clock,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);
    clock = 2_000;
    await lifecycle.reconcileAtBoot();
    runtime.start.mockClear();
    runtime.stopAndDrain.mockClear();

    const enteredStateRead = deferred<void>();
    const releaseStateRead = deferred<void>();
    const originalGetState = runtime.getCollectorState.getMockImplementation()!;
    let blockNextStateRead = true;
    runtime.getCollectorState.mockImplementation(async () => {
      if (blockNextStateRead) {
        blockNextStateRead = false;
        enteredStateRead.resolve();
        await releaseStateRead.promise;
      }
      return originalGetState();
    });

    const staleA = (lifecycle as any).reconcileForOwner('owner-a');
    await enteredStateRead.promise;
    const staleB = (lifecycle as any).reconcileForOwner('owner-b');
    const currentA = (lifecycle as any).reconcileForOwner('owner-a');
    releaseStateRead.resolve();
    await Promise.all([staleA, staleB, currentA]);

    expect(runtime.start.mock.calls.map(([generation]) => generation))
      .toEqual([2]);
    expect(runtime.stopAndDrain).not.toHaveBeenCalledWith(2);
    await expect(runtime.getCollectorState()).resolves.toEqual({
      running: true,
      generation: 2,
      highWater: 2,
    });
    expect(JSON.parse(storage.data.get('activity:points')!)).toMatchObject({
      ownerId: 'owner-a',
      state: 'recording',
      resumeAfterOwnerCheck: false,
      locationLeases: [
        { collectorGeneration: 1, revokedAtExclusive: 2_000 },
        { collectorGeneration: 2, revokedAtExclusive: null },
      ],
    });
  });

  it('drains an inactive historical generation without starting sensors before auth', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    const order: string[] = [];
    let nativeGeneration: number | null = null;
    runtime.getCollectorState.mockImplementation(async () => ({
      running: nativeGeneration !== null,
      generation: nativeGeneration,
      highWater: 1,
    }));
    runtime.start.mockImplementation(async (generation?: number) => {
      order.push(`start:${generation}`);
      nativeGeneration = generation ?? 1;
    });
    runtime.stopAndDrain.mockImplementation(async (generation: number) => {
      order.push(`drain:${generation}`);
      if (nativeGeneration === generation) nativeGeneration = null;
      return {
        generation,
        drained: true as const,
        throughSequence: 9,
        outcome: 'exact' as const,
      };
    });
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
    await store.acquireTaskLease(identity, 'lease-a', 1_000);

    await expect(lifecycle.reconcileAtBoot()).resolves.toBe('paused');
    expect(order).toEqual(['drain:1']);
    expect(JSON.parse(storage.data.get('activity:points')!)).toMatchObject({
      locationLeases: [{
        collectorGeneration: 1,
        drainedThroughSequence: 9,
      }],
    });
  });

  it.each([
    ['owner-b'] as const,
    [null] as const,
  ])('never resumes A after cold launch for session %s', async (...args) => {
    const [currentOwnerId] = args as readonly ['owner-b' | null];
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
      createLeaseId: () => 'lease-must-not-be-created',
      nowMs: () => clock,
    });
    const identity = await store.begin('owner-a', 'run');
    await lifecycle.startFor(identity);
    runtime.start.mockClear();
    clock = 2_000;

    await expect(lifecycle.reconcileAtBoot()).resolves.toBe('paused');
    await expect((lifecycle as any).reconcileForOwner(currentOwnerId))
      .resolves.toBe('paused');

    expect(runtime.start).not.toHaveBeenCalled();
    await expect(runtime.getCollectorState()).resolves.toEqual({
      running: false,
      generation: null,
      highWater: 1,
    });
    expect(JSON.parse(storage.data.get('activity:points')!)).toMatchObject({
      ownerId: 'owner-a',
      state: 'paused',
      resumeAfterOwnerCheck: true,
      locationLeases: [{ collectorGeneration: 1 }],
    });
    await expect(store.recover(currentOwnerId)).resolves.toMatchObject(
      currentOwnerId === null
        ? { kind: 'owner_mismatch' }
        : { kind: 'owner_mismatch' },
    );
  });

  it('drains but never resumes a process-death closing recording', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    let clock = 1_000;
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-closing',
      createSessionId: () => 'session-closing',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => clock,
    });
    const beforeRestart = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-closing',
      nowMs: () => clock,
    });
    const identity = await store.begin('owner-a', 'run');
    await beforeRestart.startFor(identity);
    clock = 2_000;
    await store.beginClosing(
      identity,
      { type: 'run', durationS: 60 },
      'finish-closing',
      'snapshot-closing',
      clock,
    );
    runtime.start.mockClear();
    const afterRestart = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-must-not-resume',
      nowMs: () => clock,
    });

    await expect(afterRestart.reconcileAtBoot()).resolves.toBe('closing');
    await expect((afterRestart as any).reconcileForOwner('owner-a'))
      .resolves.toBe('closing');
    expect(runtime.stopAndDrain).toHaveBeenCalledWith(1);
    expect(runtime.start).not.toHaveBeenCalled();
    expect(JSON.parse(storage.data.get('activity:points')!)).toMatchObject({
      state: 'closing',
      terminal: { finishId: 'finish-closing' },
      resumeAfterOwnerCheck: false,
    });
  });

  it('fails boot closed when the generation drain capability is absent', async () => {
    const storage = memoryStorage();
    const legacy = nativeRuntime(true);
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime: {
        hasStarted: legacy.hasStarted,
        getForegroundPermission: legacy.getForegroundPermission,
        getBackgroundPermission: legacy.getBackgroundPermission,
        start: legacy.start,
        stop: legacy.stop,
      },
      createLeaseId: () => 'unused',
    });

    await expect(lifecycle.reconcileAtBoot())
      .resolves.toBe('capability_unavailable');
    expect(legacy.stop).toHaveBeenCalledTimes(1);
    await expect(legacy.hasStarted()).resolves.toBe(false);
  });

  it('still attempts to stop an old-binary collector when legacy stop rejects', async () => {
    const storage = memoryStorage();
    const legacy = nativeRuntime(true);
    legacy.stop.mockRejectedValue(new Error('old binary stop failed'));
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime: {
        hasStarted: legacy.hasStarted,
        getForegroundPermission: legacy.getForegroundPermission,
        getBackgroundPermission: legacy.getBackgroundPermission,
        start: legacy.start,
        stop: legacy.stop,
      },
      createLeaseId: () => 'unused',
    });

    await expect(lifecycle.reconcileAtBoot())
      .resolves.toBe('capability_unavailable');
    expect(legacy.stop).toHaveBeenCalledTimes(1);
    await expect(legacy.hasStarted()).resolves.toBe(true);
  });

  it('attempts the legacy collector migration stop before uncertain boot returns', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    runtime.getCollectorState.mockRejectedValue(new Error('legacy state'));
    const stopLegacyCollector = jest.fn(async () => undefined);
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime: { ...runtime, stopLegacyCollector },
      createLeaseId: () => 'unused',
    });

    await expect(lifecycle.reconcileAtBoot()).resolves.toBe('uncertain');
    expect(stopLegacyCollector).toHaveBeenCalledTimes(1);
  });

  it('begins an exact emergency drain without waiting when storage fails at boot', async () => {
    const storage = memoryStorage();
    const baseGet = storage.getItem.bind(storage);
    storage.getItem = async (key) => {
      if (key === 'activity:points') throw new Error('storage unavailable');
      return baseGet(key);
    };
    const runtime = nativeRuntime();
    await runtime.reserveGeneration(7);
    await runtime.start(7);
    runtime.start.mockClear();
    const drain = deferred<{
      generation: number;
      drained: true;
      throughSequence: number;
      outcome: 'exact';
    }>();
    runtime.stopAndDrain.mockImplementation(() => drain.promise);
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'unused',
    });

    await expect(lifecycle.reconcileAtBoot()).resolves.toBe('uncertain');
    expect(runtime.stopAndDrain).toHaveBeenCalledWith(7);
    expect(runtime.start).not.toHaveBeenCalled();

    drain.reject(new Error('WAL acknowledgement is still unavailable'));
    await Promise.resolve();
  });

  it('exact-drains an orphan native generation when authoritative points are missing', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    await runtime.reserveGeneration(77);
    await runtime.start(77);
    storage.data.set(`${WAL_PREFIX}orphan-generation-77`, JSON.stringify({
      schema: 1,
      batchId: 'orphan-generation-77',
      collectorGeneration: 77,
      receivedAt: 1_000,
      samples: [{
        lat: -31.95,
        lon: 115.86,
        capturedAt: 1_000,
        nativeSequence: 1,
      }],
    }));
    storage.data.set(`${WAL_PREFIX}orphan-malformed`, '{partial-coordinate');
    runtime.start.mockClear();
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'unused',
    });

    await expect(lifecycle.reconcileAtBoot()).resolves.toBe('paused');
    expect(runtime.stopAndDrain).toHaveBeenCalledWith(77);
    expect(runtime.start).not.toHaveBeenCalled();
    expect(storage.data.has(`${WAL_PREFIX}orphan-generation-77`)).toBe(false);
    expect(storage.data.has(`${WAL_PREFIX}orphan-malformed`)).toBe(false);
    expect([...storage.data.keys()].some((key) =>
      key.startsWith('activity:location-cleanup:v1:orphan-generation-77'),
    )).toBe(false);
    expect(JSON.parse(storage.data.get('activity:location-lineage:v1')!))
      .toEqual({ schema: 1, nextGeneration: 78, collectors: [] });
  });

  it('retries a crash-safe orphan generation receipt before owner screens open', async () => {
    const batchKey = `${WAL_PREFIX}orphan-retry-77`;
    const storage = memoryStorage({
      [batchKey]: JSON.stringify({
        schema: 1,
        batchId: 'orphan-retry-77',
        collectorGeneration: 77,
        receivedAt: 1_000,
        samples: [{
          lat: -31.95,
          lon: 115.86,
          capturedAt: 1_000,
          nativeSequence: 1,
        }],
      }),
    });
    const runtime = nativeRuntime();
    await runtime.reserveGeneration(77);
    await runtime.start(77);
    const originalRemove = storage.removeItem.bind(storage);
    let failExactRemoval = true;
    storage.removeItem = async (key) => {
      if (key === batchKey && failExactRemoval) {
        failExactRemoval = false;
        throw new Error('process stopped during orphan cleanup');
      }
      await originalRemove(key);
    };
    const firstBoot = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'unused-first-orphan-boot',
    });

    await expect(firstBoot.reconcileAtBoot()).resolves.toBe('uncertain');
    const receiptKey =
      'activity:location-cleanup:v1:orphan-generation-77';
    expect(JSON.parse(storage.data.get(receiptKey)!)).toMatchObject({
      orphaned: true,
      collectorGenerations: [77],
      entries: [{ key: batchKey, rawFingerprint: expect.any(String) }],
    });
    expect(storage.data.has(batchKey)).toBe(true);

    const restarted = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'unused-restarted-orphan-boot',
    });
    await expect(restarted.reconcileAtBoot()).resolves.toBe('paused');
    expect(storage.data.has(batchKey)).toBe(false);
    expect(storage.data.has(receiptKey)).toBe(false);
  });

  it('replaces a corrupt orphan cleanup receipt and removes all unowned WAL', async () => {
    const validKey = `${WAL_PREFIX}unowned-valid`;
    const malformedKey = `${WAL_PREFIX}unowned-malformed`;
    const receiptKey = 'activity:location-cleanup:v1:corrupt-orphan';
    const storage = memoryStorage({
      [validKey]: JSON.stringify({
        schema: 1,
        batchId: 'unowned-valid',
        collectorGeneration: 12,
        receivedAt: 1_000,
        samples: [{
          lat: -31.95,
          lon: 115.86,
          capturedAt: 1_000,
          nativeSequence: 1,
        }],
      }),
      [malformedKey]: '{"samples":[{"lat":-31.95',
      [receiptKey]: '{corrupt-receipt',
      'activity:location-lineage:v1': JSON.stringify({
        schema: 1,
        nextGeneration: 13,
        collectors: [{
          generation: 12,
          leaseId: 'old-private-lease',
          session: 'old-private-session',
          activityId: 'old-private-activity',
          ownerId: 'old-private-owner',
          startedAt: '2026-08-24T00:00:00.000Z',
          activatedAt: 1,
          revokedAtExclusive: 2,
          drainedThroughSequence: 1,
          resolution: 'discarded',
        }],
      }),
    });
    const runtime = nativeRuntime();
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'unused-corrupt-receipt',
    });

    await expect(lifecycle.reconcileAtBoot()).resolves.toBe('paused');
    expect(storage.data.has(validKey)).toBe(false);
    expect(storage.data.has(malformedKey)).toBe(false);
    expect(storage.data.has(receiptKey)).toBe(false);
    const lineage = storage.data.get('activity:location-lineage:v1')!;
    expect(JSON.parse(lineage)).toEqual({
      schema: 1,
      nextGeneration: 13,
      collectors: [],
    });
    expect(lineage).not.toMatch(/old-private/);
  });

  it('allocates above native-only high-water after every JS store is reset', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    await runtime.reserveGeneration(41);
    await runtime.start(41);
    await runtime.stopAndDrain(41);
    runtime.start.mockClear();
    runtime.stopAndDrain.mockClear();
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-owner-b-native-floor',
      createSessionId: () => 'session-owner-b-native-floor',
      createChunkId: () => 'batch-owner-b-native-floor',
      nowIso: () => '2026-08-25T01:00:00.000Z',
      nowMs: () => 2_000,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-owner-b-native-floor',
      nowMs: () => 2_000,
    });
    const ownerB = await store.begin('owner-b', 'run');

    await expect(lifecycle.startFor(ownerB)).resolves.toBe('restarted');
    expect(runtime.start).toHaveBeenCalledWith(42);
    expect(runtime.stopAndDrain).not.toHaveBeenCalledWith(41);
    await store.appendTaskSamples([{
      lat: -31.95,
      lon: 115.86,
      capturedAt: 2_100,
      nativeSequence: 1,
    }], 42);
    await expect(store.readRecording('owner-b')).resolves.toMatchObject({
      ...ownerB,
      points: [{ lat: -31.95, lon: 115.86 }],
    });
    expect(JSON.parse(storage.data.get('activity:location-lineage:v1')!))
      .toMatchObject({
        nextGeneration: 43,
        collectors: [{ generation: 42, ownerId: 'owner-b' }],
      });
  });

  it('reserves natively before persisting and starting an exact generation', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    const order: string[] = [];
    const originalReserve = runtime.reserveGeneration.getMockImplementation()!;
    const originalStart = runtime.start.getMockImplementation()!;
    runtime.reserveGeneration.mockImplementation(async (minimum) => {
      const reserved = await originalReserve(minimum);
      order.push(`reserve:${reserved}`);
      return reserved;
    });
    runtime.start.mockImplementation(async (generation) => {
      order.push(`start:${generation}`);
      await originalStart(generation);
    });
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-reserved',
      createSessionId: () => 'session-reserved',
      nowIso: () => '2026-08-25T01:00:00.000Z',
      nowMs: () => 2_000,
    });
    const identity = await store.begin('owner-a', 'run');
    const originalSet = storage.setItem.bind(storage);
    storage.setItem = async (key, value) => {
      if (
        key === 'activity:points' &&
        JSON.parse(value).locationLeases?.length === 1
      ) {
        order.push(`persist:${JSON.parse(value).locationLeases[0]
          .collectorGeneration}`);
      }
      await originalSet(key, value);
    };
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-reserved',
      nowMs: () => 2_000,
    });

    await expect(lifecycle.startFor(identity)).resolves.toBe('restarted');
    expect(order).toEqual(['reserve:1', 'persist:1', 'start:1']);
    expect(runtime.reserveGeneration).toHaveBeenCalledWith(1);
  });

  it('exact-drains a native reservation when lease persistence fails', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-reserve-crash',
      createSessionId: () => 'session-reserve-crash',
      nowIso: () => '2026-08-25T01:00:00.000Z',
    });
    const identity = await store.begin('owner-a', 'run');
    const originalSet = storage.setItem.bind(storage);
    storage.setItem = async (key, value) => {
      if (
        key === 'activity:points' &&
        JSON.parse(value).locationLeases?.length === 1
      ) {
        throw new Error('lease persistence failed');
      }
      await originalSet(key, value);
    };
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-reserve-crash',
    });

    await expect(lifecycle.startFor(identity))
      .rejects.toThrow('lease persistence failed');
    expect(runtime.reserveGeneration).toHaveBeenCalledWith(1);
    expect(runtime.start).not.toHaveBeenCalled();
    expect(runtime.stopAndDrain).toHaveBeenCalledWith(1);
    await expect(runtime.getCollectorState()).resolves.toEqual({
      running: false,
      generation: null,
      highWater: 1,
    });
    expect(JSON.parse(storage.data.get('activity:points')!))
      .toMatchObject({ locationLeases: [] });
    expect(JSON.parse(storage.data.get('activity:location-lineage:v1')!))
      .toEqual({ schema: 1, nextGeneration: 2, collectors: [] });
  });

  it('rechecks JS evidence after reservation and aborts a stale generation', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    const originalReserve = runtime.reserveGeneration.getMockImplementation()!;
    runtime.reserveGeneration.mockImplementation(async (minimum) => {
      const reserved = await originalReserve(minimum);
      storage.data.set(`${WAL_PREFIX}arrived-after-reserve`, JSON.stringify({
        schema: 1,
        batchId: 'arrived-after-reserve',
        collectorGeneration: reserved + 5,
        receivedAt: 2_000,
        samples: [{
          lat: -31.95,
          lon: 115.86,
          capturedAt: 2_000,
          nativeSequence: 1,
        }],
      }));
      return reserved;
    });
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-stale-reserve',
      createSessionId: () => 'session-stale-reserve',
      nowIso: () => '2026-08-25T01:00:00.000Z',
    });
    const identity = await store.begin('owner-a', 'run');
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-stale-reserve',
    });

    await expect(lifecycle.startFor(identity))
      .rejects.toThrow('Reserved collector generation is stale');
    expect(runtime.start).not.toHaveBeenCalled();
    expect(runtime.stopAndDrain).toHaveBeenCalledWith(1);
    expect(JSON.parse(storage.data.get('activity:points')!))
      .toMatchObject({ locationLeases: [] });
  });

  it('serializes concurrent starts and drains the superseded reservation', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    const reserveEntered = deferred<void>();
    const releaseReserve = deferred<void>();
    const originalReserve = runtime.reserveGeneration.getMockImplementation()!;
    runtime.reserveGeneration.mockImplementation(async (minimum) => {
      reserveEntered.resolve();
      await releaseReserve.promise;
      return originalReserve(minimum);
    });
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-concurrent-reserve',
      createSessionId: () => 'session-concurrent-reserve',
      nowIso: () => '2026-08-25T01:00:00.000Z',
    });
    const identity = await store.begin('owner-a', 'run');
    const first = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-first-reserve',
    });
    const second = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-second-reserve',
    });

    const firstStart = first.startFor(identity);
    await reserveEntered.promise;
    const secondStart = second.startFor(identity);
    expect(runtime.reserveGeneration).toHaveBeenCalledTimes(1);
    releaseReserve.resolve();

    await expect(firstStart).resolves.toBe('stale');
    await expect(secondStart).resolves.toBe('restarted');
    expect(runtime.reserveGeneration).toHaveBeenCalledTimes(2);
    expect(runtime.stopAndDrain).toHaveBeenCalledWith(1);
    expect(runtime.start).toHaveBeenCalledTimes(1);
    expect(runtime.start).toHaveBeenCalledWith(2);
  });

  it('drains a reservation when pause wins after lease persistence', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    const leaseCheckEntered = deferred<void>();
    const releaseLeaseCheck = deferred<void>();
    const originalGet = storage.getItem.bind(storage);
    let blockPersistedLeaseCheck = true;
    storage.getItem = async (key) => {
      if (
        key === 'activity:points' &&
        blockPersistedLeaseCheck &&
        JSON.parse(storage.data.get(key) ?? 'null')?.locationLeases?.length === 1
      ) {
        blockPersistedLeaseCheck = false;
        leaseCheckEntered.resolve();
        await releaseLeaseCheck.promise;
      }
      return originalGet(key);
    };
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-post-persist-race',
      createSessionId: () => 'session-post-persist-race',
      nowIso: () => '2026-08-25T01:00:00.000Z',
    });
    const identity = await store.begin('owner-a', 'run');
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-post-persist-race',
    });

    const starting = lifecycle.startFor(identity);
    await leaseCheckEntered.promise;
    const pausing = lifecycle.pauseFor(identity);
    releaseLeaseCheck.resolve();

    await expect(starting).resolves.toBe('stale');
    await expect(pausing).resolves.toBe('paused');
    expect(runtime.start).not.toHaveBeenCalled();
    expect(runtime.stopAndDrain).toHaveBeenCalledWith(1);
    await expect(runtime.getCollectorState()).resolves.toEqual({
      running: false,
      generation: null,
      highWater: 1,
    });
  });

  it('rejects a malformed native reservation without creating a lease', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    runtime.reserveGeneration.mockResolvedValue(0);
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-invalid-reserve',
      createSessionId: () => 'session-invalid-reserve',
      nowIso: () => '2026-08-25T01:00:00.000Z',
    });
    const identity = await store.begin('owner-a', 'run');
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-invalid-reserve',
    });

    await expect(lifecycle.startFor(identity))
      .rejects.toThrow('Native collector generation reservation is invalid');
    expect(runtime.start).not.toHaveBeenCalled();
    expect(JSON.parse(storage.data.get('activity:points')!))
      .toMatchObject({ locationLeases: [] });
  });

  it('drains but stays fail-closed when authoritative points are corrupt', async () => {
    const storage = memoryStorage({ 'activity:points': '{corrupt' });
    const runtime = nativeRuntime();
    await runtime.reserveGeneration(8);
    await runtime.start(8);
    runtime.start.mockClear();
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'unused',
    });

    await expect(lifecycle.reconcileAtBoot()).resolves.toBe('uncertain');
    expect(runtime.stopAndDrain).toHaveBeenCalledWith(8);
    expect(runtime.start).not.toHaveBeenCalled();
    expect(storage.data.get('activity:points')).toBe('{corrupt');
  });

  it('best-effort stops a legacy collector without waiting when storage fails at boot', async () => {
    const storage = memoryStorage();
    storage.getItem = async (key) => {
      if (key === 'activity:points') throw new Error('storage unavailable');
      return null;
    };
    const legacy = nativeRuntime(true);
    const stop = deferred<void>();
    legacy.stop.mockImplementation(() => stop.promise);
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime: {
        hasStarted: legacy.hasStarted,
        getForegroundPermission: legacy.getForegroundPermission,
        getBackgroundPermission: legacy.getBackgroundPermission,
        start: legacy.start,
        stop: legacy.stop,
      },
      createLeaseId: () => 'unused',
    });

    await expect(lifecycle.reconcileAtBoot()).resolves.toBe('uncertain');
    expect(legacy.stop).toHaveBeenCalledTimes(1);
    expect(legacy.start).not.toHaveBeenCalled();

    stop.reject(new Error('legacy stop remains retryable'));
    await Promise.resolve();
  });

  it('drains a wrong native generation before starting the durable generation', async () => {
    const storage = memoryStorage();
    const runtime = nativeRuntime();
    await runtime.reserveGeneration(77);
    await runtime.start(77);
    runtime.start.mockClear();
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-b',
      createSessionId: () => 'session-b',
      nowIso: () => '2026-08-25T00:00:00.000Z',
      nowMs: () => 1_000,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-b',
      nowMs: () => 1_000,
    });
    const identity = await store.begin('owner-b', 'run');

    await expect(lifecycle.startFor(identity)).resolves.toBe('restarted');

    expect(runtime.stopAndDrain).toHaveBeenCalledWith(77);
    expect(runtime.start).toHaveBeenCalledWith(78);
    await expect(runtime.getCollectorState()).resolves.toEqual({
      running: true,
      generation: 78,
      highWater: 78,
    });
  });

  it('serializes boot reconciliation with a concurrent owner-bound start', async () => {
    const storage = memoryStorage();
    const firstStatusRead = deferred<void>();
    const releaseFirstStatus = deferred<void>();
    let statusReads = 0;
    let started = true;
    const runtime = {
      hasStarted: jest.fn(async () => {
        statusReads += 1;
        if (statusReads === 1) {
          firstStatusRead.resolve();
          await releaseFirstStatus.promise;
        }
        return started;
      }),
      getForegroundPermission: jest.fn(async () => ({ granted: true })),
      getBackgroundPermission: jest.fn(async () => ({ granted: true })),
      start: jest.fn(async () => {
        started = true;
      }),
      stop: jest.fn(async () => {
        started = false;
      }),
    };
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-a',
      createSessionId: () => 'session-a',
      nowIso: () => '2026-08-25T00:00:00.000Z',
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      runtime,
      createLeaseId: () => 'lease-a',
      nowMs: () => 1_000,
    });
    const identity = await store.begin('owner-a', 'run');

    const reconciliation = reconcileLocationTask(runtime, storage);
    await firstStatusRead.promise;
    const starting = lifecycle.startFor(identity);
    expect(await store.readActiveTaskLease()).toBeNull();
    releaseFirstStatus.resolve();

    await expect(reconciliation).resolves.toBe('paused');
    await expect(starting).resolves.toBe('restarted');
    expect(started).toBe(true);
    expect(runtime.stop).toHaveBeenCalledTimes(1);
  });

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
    storage.data.delete('activity:points');
    startGate.resolve();

    await expect(starting).resolves.toBe('stale');
    expect(runtime.stop).toHaveBeenCalledTimes(1);
    expect(nativeStarted).toBe(false);
  });

  it('stops a stale A start before starting the newer B lease', async () => {
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
    storage.data.delete('activity:points');
    const b = await store.begin('owner-b', 'run');
    const startingB = lifecycleB.startFor(b);
    startGate.resolve();

    await expect(startingA).resolves.toBe('stale');
    await expect(startingB).resolves.toBe('restarted');
    expect(runtime.stop).toHaveBeenCalledTimes(1);
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
    storage.data.delete('activity:points');
    const b = await store.begin('owner-b', 'run');
    const startingB = lifecycleB.startFor(b);
    stopGate.resolve();

    await expect(pausingA).resolves.toBe('paused');
    await expect(startingB).resolves.toBe('restarted');
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

    expect(runtime.stopAndDrain).toHaveBeenCalledWith(1);
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
