import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createLocationRecordingStore,
  createLocationTaskLifecycle,
  type LocationRecordingStorage,
} from './locationTask';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const OWNER_A = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OWNER_B = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const ACTIVITY_A = '11111111-1111-4111-8111-111111111111';
const ACTIVITY_B = '22222222-2222-4222-8222-222222222222';
const STARTED_A = '2026-08-25T01:00:00.000Z';
const STARTED_B = '2026-08-25T02:00:00.000Z';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function memoryStorage(): LocationRecordingStorage & {
  values: Map<string, string>;
  getAllKeys(): Promise<string[]>;
} {
  const values = new Map<string, string>();
  return {
    values,
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
    getAllKeys: async () => [...values.keys()],
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('owner-bound location task lifecycle', () => {
  it('redacts a current recording from a mismatched read owner', async () => {
    const storage = memoryStorage();
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_A,
      createSessionId: () => 'session-a',
      nowIso: () => STARTED_A,
    });
    await store.begin(OWNER_A, 'run');

    await expect(store.readRecording(OWNER_B)).resolves.toBeNull();
    await expect(store.readRecording(OWNER_A)).resolves.toMatchObject({
      activityId: ACTIVITY_A,
      ownerId: OWNER_A,
      startedAt: STARTED_A,
    });
  });

  it('serializes authoritative A revocation with B clear and begin across store instances', async () => {
    const base = memoryStorage();
    const revocationWriteEntered = deferred<void>();
    const releaseRevocationWrite = deferred<void>();
    let holdRevocation = true;
    const storage = {
      ...base,
      setItem: async (key: string, value: string) => {
        if (holdRevocation && key === 'activity:points') {
          const blob = JSON.parse(value);
          if (
            blob.ownerId === OWNER_A &&
            blob.locationLeases?.some(
              (lease: { revokedAt: number | null }) =>
                lease.revokedAt !== null,
            )
          ) {
            holdRevocation = false;
            revocationWriteEntered.resolve();
            await releaseRevocationWrite.promise;
          }
        }
        base.values.set(key, value);
      },
    };
    const storeA = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_A,
      createSessionId: () => 'session-a',
      nowIso: () => STARTED_A,
      nowMs: () => 1_000,
    });
    const storeB = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_B,
      createSessionId: () => 'session-b',
      nowIso: () => STARTED_B,
    });
    const identityA = await storeA.begin(OWNER_A, 'run');
    await storeA.acquireTaskLease(identityA, 'lease-a');

    const revokeA = storeA.suspendTaskLeaseFor(identityA);
    await revocationWriteEntered.promise;
    const switchToB = storeB.clear(identityA.activityId).then(() =>
      storeB.begin(OWNER_B, 'walk'),
    );
    await flush();
    releaseRevocationWrite.resolve();

    await expect(revokeA).resolves.toMatchObject({ kind: 'suspended' });
    const identityB = await switchToB;
    expect(identityB).toMatchObject({
      activityId: ACTIVITY_B,
      ownerId: OWNER_B,
      startedAt: STARTED_B,
    });
    expect(JSON.parse(base.values.get('activity:points')!)).toMatchObject({
      session: 'session-b',
      activityId: ACTIVITY_B,
      ownerId: OWNER_B,
    });
    expect(base.values.get('activity:session')).toBe('session-b');
  });

  it('isolates a late A journal write after A is revoked and B begins in another context', async () => {
    const base = memoryStorage();
    const chunkWriteEntered = deferred<void>();
    const releaseChunkWrite = deferred<void>();
    let holdNextChunk = true;
    const storage = {
      ...base,
      setItem: async (key: string, value: string) => {
        if (holdNextChunk && key.startsWith('activity:location-chunk:')) {
          holdNextChunk = false;
          chunkWriteEntered.resolve();
          await releaseChunkWrite.promise;
        }
        base.values.set(key, value);
      },
    };
    const activityIds = [ACTIVITY_A, ACTIVITY_B];
    const sessions = ['session-a', 'session-b'];
    const startTimes = [STARTED_A, STARTED_B];
    const uiStore = createLocationRecordingStore({
      storage,
      createActivityId: () => activityIds.shift()!,
      createSessionId: () => sessions.shift()!,
      nowIso: () => startTimes.shift()!,
    });
    const taskContext = createLocationRecordingStore({
      storage,
      createChunkId: () => 'late-a-chunk',
    });
    let running = true;
    const lifecycle = createLocationTaskLifecycle({
      storage,
      createLeaseId: (() => {
        const ids = ['lease-a', 'lease-b'];
        return () => ids.shift()!;
      })(),
      nowMs: (() => {
        const values = [1_000, 2_000, 3_000];
        return () => values.shift() ?? 4_000;
      })(),
      runtime: {
        hasStarted: async () => running,
        getForegroundPermission: async () => ({ granted: true }),
        getBackgroundPermission: async () => ({ granted: true }),
        start: async () => {
          running = true;
        },
        stop: async () => {
          running = false;
        },
      },
    });

    const identityA = await uiStore.begin(OWNER_A, 'run');
    await lifecycle.startFor(identityA);
    const lateAWrite = taskContext.appendTaskSamples([
      { lat: -31.9523, lon: 115.8613, capturedAt: 2_500 },
    ]);
    await chunkWriteEntered.promise;

    await lifecycle.pauseFor(identityA);
    await uiStore.clear(identityA.activityId);
    const identityB = await uiStore.begin(OWNER_B, 'walk');
    await lifecycle.startFor(identityB);

    releaseChunkWrite.resolve();
    await expect(lateAWrite).resolves.toBe(true);
    await expect(uiStore.readPoints()).resolves.toEqual([]);
    await expect(uiStore.recover(OWNER_B)).resolves.toMatchObject({
      kind: 'active',
      activityId: ACTIVITY_B,
      ownerId: OWNER_B,
      points: [],
    });
    expect(JSON.parse(base.values.get('activity:points')!)).toMatchObject({
      activityId: ACTIVITY_B,
      ownerId: OWNER_B,
      session: 'session-b',
    });
  });

  it('merges only exact lease samples captured inside each activation window', async () => {
    const storage = memoryStorage();
    const uiStore = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_A,
      createSessionId: () => 'session-a',
      nowIso: () => STARTED_A,
    });
    const taskStore = createLocationRecordingStore({
      storage,
      createChunkId: (() => {
        const ids = ['chunk-1', 'chunk-2'];
        return () => ids.shift()!;
      })(),
    });
    let running = false;
    const lifecycle = createLocationTaskLifecycle({
      storage,
      createLeaseId: (() => {
        const ids = ['lease-1', 'lease-2'];
        return () => ids.shift()!;
      })(),
      nowMs: (() => {
        const values = [1_000, 2_000, 3_000];
        return () => values.shift()!;
      })(),
      runtime: {
        hasStarted: async () => running,
        getForegroundPermission: async () => ({ granted: true }),
        getBackgroundPermission: async () => ({ granted: true }),
        start: async () => {
          running = true;
        },
        stop: async () => {
          running = false;
        },
      },
    });
    const identity = await uiStore.begin(OWNER_A, 'run');
    await lifecycle.startFor(identity);
    await taskStore.appendTaskSamples([
      { lat: -31.95, lon: 115.86, capturedAt: 1_500 },
      { lat: -31.94, lon: 115.87, capturedAt: 2_500 },
    ]);
    await lifecycle.pauseFor(identity);

    await expect(uiStore.readPoints()).resolves.toEqual([
      { lat: -31.95, lon: 115.86 },
    ]);
    await expect(uiStore.recover(OWNER_A)).resolves.toMatchObject({
      kind: 'active',
      points: [{ lat: -31.95, lon: 115.86 }],
    });

    await lifecycle.startFor(identity);
    await taskStore.appendTaskSamples([
      { lat: -31.93, lon: 115.88, capturedAt: 3_500 },
    ]);
    await expect(uiStore.readPoints()).resolves.toEqual([
      { lat: -31.95, lon: 115.86 },
      { lat: -31.93, lon: 115.88 },
    ]);
  });

  it('persists exact journal points into completion before best-effort chunk cleanup', async () => {
    const storage = memoryStorage();
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_A,
      createSessionId: () => 'session-a',
      createChunkId: () => 'chunk-a',
      nowIso: () => STARTED_A,
      nowMs: (() => {
        const values = [1_000, 2_000];
        return () => values.shift()!;
      })(),
    });
    const identity = await store.begin(OWNER_A, 'run');
    const lifecycle = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-a',
      nowMs: (() => {
        const values = [1_000, 2_000];
        return () => values.shift()!;
      })(),
      runtime: {
        hasStarted: async () => true,
        getForegroundPermission: async () => ({ granted: true }),
        getBackgroundPermission: async () => ({ granted: true }),
        start: async () => undefined,
        stop: async () => undefined,
      },
    });
    await lifecycle.startFor(identity);
    await store.appendTaskSamples([
      { lat: -31.95, lon: 115.86, capturedAt: 1_500 },
    ]);
    await lifecycle.pauseFor(identity);

    await store.persistCompleted({
      activityId: ACTIVITY_A,
      ownerId: OWNER_A,
      activity: {
        type: 'run',
        distance_m: 0,
        duration_s: 60,
        route: [],
        started_at: STARTED_A,
      },
    });

    await expect(store.readPendingCompleted()).resolves.toMatchObject({
      activity: {
        route: [{ lat: -31.95, lon: 115.86 }],
      },
    });
    expect(
      [...storage.values.keys()].filter((key) =>
        key.startsWith('activity:location-chunk:'),
      ),
    ).toEqual([]);
  });

  it('does not merge an orphaned journal chunk into an already completed route', async () => {
    const base = memoryStorage();
    const storage = {
      ...base,
      removeItem: async (key: string) => {
        if (key.startsWith('activity:location-chunk:')) {
          throw new Error('simulated cleanup crash');
        }
        base.values.delete(key);
      },
    };
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_A,
      createSessionId: () => 'session-a',
      createChunkId: () => 'chunk-a',
      nowIso: () => STARTED_A,
      nowMs: () => 1_000,
    });
    const identity = await store.begin(OWNER_A, 'run');
    const lifecycle = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-a',
      nowMs: (() => {
        const values = [1_000, 2_000];
        return () => values.shift()!;
      })(),
      runtime: {
        hasStarted: async () => true,
        getForegroundPermission: async () => ({ granted: true }),
        getBackgroundPermission: async () => ({ granted: true }),
        start: async () => undefined,
        stop: async () => undefined,
      },
    });
    await lifecycle.startFor(identity);
    await store.appendTaskSamples([
      { lat: -31.95, lon: 115.86, capturedAt: 1_500 },
    ]);
    await lifecycle.pauseFor(identity);
    await store.persistCompleted({
      activityId: ACTIVITY_A,
      ownerId: OWNER_A,
      activity: {
        type: 'run',
        distance_m: 0,
        duration_s: 60,
        route: [],
        started_at: STARTED_A,
      },
    });

    expect(
      [...base.values.keys()].some((key) =>
        key.startsWith('activity:location-chunk:'),
      ),
    ).toBe(true);
    await expect(store.readRecording()).resolves.toMatchObject({
      points: [{ lat: -31.95, lon: 115.86 }],
    });
  });

  it('includes a delayed in-window journal chunk after completion exactly once', async () => {
    const base = memoryStorage();
    const chunkWriteEntered = deferred<void>();
    const releaseChunkWrite = deferred<void>();
    let delayChunk = true;
    const storage = {
      ...base,
      setItem: async (key: string, value: string) => {
        if (delayChunk && key.startsWith('activity:location-chunk:')) {
          delayChunk = false;
          chunkWriteEntered.resolve();
          await releaseChunkWrite.promise;
        }
        base.values.set(key, value);
      },
    };
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_A,
      createSessionId: () => 'session-a',
      createChunkId: () => 'late-chunk',
      nowIso: () => STARTED_A,
      nowMs: () => 1_000,
    });
    const identity = await store.begin(OWNER_A, 'run');
    const lifecycle = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-a',
      nowMs: (() => {
        const values = [1_000, 2_000];
        return () => values.shift()!;
      })(),
      runtime: {
        hasStarted: async () => true,
        getForegroundPermission: async () => ({ granted: true }),
        getBackgroundPermission: async () => ({ granted: true }),
        start: async () => undefined,
        stop: async () => undefined,
      },
    });
    await lifecycle.startFor(identity);
    const lateWrite = store.appendTaskSamples([
      { lat: -31.95, lon: 115.86, capturedAt: 1_500 },
    ]);
    await chunkWriteEntered.promise;
    await lifecycle.pauseFor(identity);
    await store.persistCompleted({
      activityId: ACTIVITY_A,
      ownerId: OWNER_A,
      activity: {
        type: 'run',
        distance_m: 0,
        duration_s: 60,
        route: [],
        started_at: STARTED_A,
      },
    });

    releaseChunkWrite.resolve();
    await expect(lateWrite).resolves.toBe(true);
    await expect(store.readPendingCompleted()).resolves.toMatchObject({
      activity: { route: [{ lat: -31.95, lon: 115.86 }] },
    });
    await expect(store.readPendingCompleted()).resolves.toMatchObject({
      activity: { route: [{ lat: -31.95, lon: 115.86 }] },
    });
  });

  it('keeps clear authoritative when chunk removal fails and cleans the orphan before B begins', async () => {
    const base = memoryStorage();
    let failChunkRemoval = true;
    const storage = {
      ...base,
      removeItem: async (key: string) => {
        if (
          failChunkRemoval &&
          key.startsWith('activity:location-chunk:')
        ) {
          failChunkRemoval = false;
          throw new Error('simulated cleanup crash');
        }
        base.values.delete(key);
      },
    };
    const activityIds = [ACTIVITY_A, ACTIVITY_B];
    const sessions = ['session-a', 'session-b'];
    const startTimes = [STARTED_A, STARTED_B];
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => activityIds.shift()!,
      createSessionId: () => sessions.shift()!,
      createChunkId: () => 'chunk-a',
      nowIso: () => startTimes.shift()!,
      nowMs: () => 1_000,
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-a',
      nowMs: () => 1_000,
      runtime: {
        hasStarted: async () => true,
        getForegroundPermission: async () => ({ granted: true }),
        getBackgroundPermission: async () => ({ granted: true }),
        start: async () => undefined,
        stop: async () => undefined,
      },
    });
    const identityA = await store.begin(OWNER_A, 'run');
    await lifecycle.startFor(identityA);
    await store.appendTaskSamples([
      { lat: -31.95, lon: 115.86, capturedAt: 1_100 },
    ]);

    await expect(store.clear(identityA.activityId)).resolves.toBeUndefined();
    expect(base.values.has('activity:session')).toBe(false);
    expect(base.values.has('activity:points')).toBe(false);
    expect(
      [...base.values.keys()].some((key) =>
        key.startsWith('activity:location-chunk:'),
      ),
    ).toBe(true);

    await store.begin(OWNER_B, 'walk');
    expect(
      [...base.values.keys()].some((key) =>
        key.startsWith('activity:location-chunk:'),
      ),
    ).toBe(false);
    await expect(store.readPoints()).resolves.toEqual([]);
  });

  it('does not mutate the authoritative recording when immutable chunk storage fails', async () => {
    const base = memoryStorage();
    let rejectChunk = true;
    const storage = {
      ...base,
      setItem: async (key: string, value: string) => {
        if (rejectChunk && key.startsWith('activity:location-chunk:')) {
          rejectChunk = false;
          throw new Error('chunk storage full');
        }
        base.values.set(key, value);
      },
    };
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_A,
      createSessionId: () => 'session-a',
      createChunkId: () => 'chunk-a',
      nowIso: () => STARTED_A,
    });
    const identity = await store.begin(OWNER_A, 'run');
    const lifecycle = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-a',
      runtime: {
        hasStarted: async () => true,
        getForegroundPermission: async () => ({ granted: true }),
        getBackgroundPermission: async () => ({ granted: true }),
        start: async () => undefined,
        stop: async () => undefined,
      },
    });
    await lifecycle.startFor(identity);
    const authoritativeBefore = base.values.get('activity:points');
    const sessionBefore = base.values.get('activity:session');

    await expect(store.appendTaskSamples([
      { lat: -31.95, lon: 115.86, capturedAt: Date.now() },
    ])).rejects.toThrow('chunk storage full');
    expect(base.values.get('activity:points')).toBe(authoritativeBefore);
    expect(base.values.get('activity:session')).toBe(sessionBefore);
  });

  it('fails a task-context read without creating a partial journal chunk', async () => {
    const base = memoryStorage();
    const uiStore = createLocationRecordingStore({
      storage: base,
      createActivityId: () => ACTIVITY_A,
      createSessionId: () => 'session-a',
      nowIso: () => STARTED_A,
    });
    const identity = await uiStore.begin(OWNER_A, 'run');
    const lifecycle = createLocationTaskLifecycle({
      storage: base,
      createLeaseId: () => 'lease-a',
      runtime: {
        hasStarted: async () => true,
        getForegroundPermission: async () => ({ granted: true }),
        getBackgroundPermission: async () => ({ granted: true }),
        start: async () => undefined,
        stop: async () => undefined,
      },
    });
    await lifecycle.startFor(identity);
    const taskStorage = {
      ...base,
      getItem: async (key: string) => {
        if (key === 'activity:points') throw new Error('task read failed');
        return base.values.get(key) ?? null;
      },
    };
    const taskStore = createLocationRecordingStore({
      storage: taskStorage,
      createChunkId: () => 'must-not-exist',
    });

    await expect(taskStore.appendTaskSamples([
      { lat: -31.95, lon: 115.86, capturedAt: Date.now() },
    ])).rejects.toThrow('task read failed');
    expect(
      [...base.values.keys()].some((key) =>
        key.startsWith('activity:location-chunk:'),
      ),
    ).toBe(false);
  });

  it('fails before native start when journal enumeration is unavailable', async () => {
    const base = memoryStorage();
    const storage: LocationRecordingStorage = {
      getItem: base.getItem,
      setItem: base.setItem,
      removeItem: base.removeItem,
    };
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_A,
      createSessionId: () => 'session-a',
      nowIso: () => STARTED_A,
    });
    const identity = await store.begin(OWNER_A, 'run');
    const start = jest.fn(async () => undefined);
    const lifecycle = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-a',
      runtime: {
        hasStarted: async () => false,
        getForegroundPermission: async () => ({ granted: true }),
        getBackgroundPermission: async () => ({ granted: true }),
        start,
        stop: async () => undefined,
      },
    });

    await expect(lifecycle.startFor(identity)).rejects.toThrow(
      'Location journal enumeration is unavailable',
    );
    expect(start).not.toHaveBeenCalled();
  });

  it('does not stop natively when durable lease revocation fails', async () => {
    const base = memoryStorage();
    let failRevocation = false;
    const storage = {
      ...base,
      setItem: async (key: string, value: string) => {
        if (failRevocation && key === 'activity:points') {
          failRevocation = false;
          throw new Error('revocation write failed');
        }
        base.values.set(key, value);
      },
    };
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_A,
      createSessionId: () => 'session-a',
      nowIso: () => STARTED_A,
    });
    const identity = await store.begin(OWNER_A, 'run');
    const stop = jest.fn(async () => undefined);
    const lifecycle = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-a',
      runtime: {
        hasStarted: async () => true,
        getForegroundPermission: async () => ({ granted: true }),
        getBackgroundPermission: async () => ({ granted: true }),
        start: async () => undefined,
        stop,
      },
    });
    await lifecycle.startFor(identity);
    failRevocation = true;

    await expect(lifecycle.pauseFor(identity)).rejects.toThrow(
      'revocation write failed',
    );
    expect(stop).not.toHaveBeenCalled();
  });

  it('attempts a safe stop when native status lookup fails after revocation', async () => {
    const storage = memoryStorage();
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_A,
      createSessionId: () => 'session-a',
      nowIso: () => STARTED_A,
    });
    const identity = await store.begin(OWNER_A, 'run');
    let statusCalls = 0;
    let running = true;
    const stop = jest.fn(async () => {
      running = false;
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-a',
      runtime: {
        hasStarted: async () => {
          statusCalls += 1;
          if (statusCalls > 1) throw new Error('native status unavailable');
          return running;
        },
        getForegroundPermission: async () => ({ granted: true }),
        getBackgroundPermission: async () => ({ granted: true }),
        start: async () => {
          running = true;
        },
        stop,
      },
    });
    await lifecycle.startFor(identity);

    await expect(lifecycle.pauseFor(identity)).resolves.toBe('paused');
    expect(stop).toHaveBeenCalledTimes(1);
    expect(running).toBe(false);
  });

  it('rejects a failed native stop that is still running and retries the revoked lease', async () => {
    const storage = memoryStorage();
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_A,
      createSessionId: () => 'session-a',
      nowIso: () => STARTED_A,
    });
    const identity = await store.begin(OWNER_A, 'run');
    let running = true;
    let rejectStop = true;
    const stop = jest.fn(async () => {
      if (rejectStop) throw new Error('native stop did not take effect');
      running = false;
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-a',
      runtime: {
        hasStarted: async () => running,
        getForegroundPermission: async () => ({ granted: true }),
        getBackgroundPermission: async () => ({ granted: true }),
        start: async () => {
          running = true;
        },
        stop,
      },
    });
    await lifecycle.startFor(identity);

    await expect(lifecycle.pauseFor(identity)).rejects.toThrow(
      'native stop did not take effect',
    );
    expect(running).toBe(true);
    rejectStop = false;
    await expect(lifecycle.pauseFor(identity)).resolves.toBe('already_paused');
    expect(stop).toHaveBeenCalledTimes(2);
    expect(running).toBe(false);
  });

  it('recovers A when clear crashes after removing only the session key', async () => {
    const base = memoryStorage();
    let failPointsRemoval = true;
    const storage = {
      ...base,
      removeItem: async (key: string) => {
        if (failPointsRemoval && key === 'activity:points') {
          failPointsRemoval = false;
          throw new Error('crash between authoritative removals');
        }
        base.values.delete(key);
      },
    };
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_A,
      createSessionId: () => 'session-a',
      createChunkId: () => 'chunk-a',
      nowIso: () => STARTED_A,
      nowMs: () => 1_000,
    });
    const identity = await store.begin(OWNER_A, 'run');
    const lifecycle = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-a',
      nowMs: () => 1_000,
      runtime: {
        hasStarted: async () => true,
        getForegroundPermission: async () => ({ granted: true }),
        getBackgroundPermission: async () => ({ granted: true }),
        start: async () => undefined,
        stop: async () => undefined,
      },
    });
    await lifecycle.startFor(identity);
    await store.appendTaskSamples([
      { lat: -31.95, lon: 115.86, capturedAt: 1_100 },
    ]);

    await expect(store.clear(identity.activityId)).rejects.toThrow(
      'crash between authoritative removals',
    );
    expect(base.values.has('activity:session')).toBe(false);
    expect(base.values.has('activity:points')).toBe(true);
    await expect(store.recover(OWNER_A)).resolves.toMatchObject({
      kind: 'active',
      activityId: ACTIVITY_A,
      points: [{ lat: -31.95, lon: 115.86 }],
    });
    expect(base.values.get('activity:session')).toBe('session-a');
  });

  it('routes native samples through the active owner lease instead of a session-only append', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/activity/locationTask.ts'),
      'utf8',
    );
    const taskBody = source.match(
      /TaskManager\.defineTask\(LOCATION_TASK_NAME,[\s\S]*?\n\s*}\);/,
    )?.[0];

    expect(taskBody).toContain('defaultRecordingStore.appendTaskSamples(');
    expect(taskBody).not.toContain('defaultRecordingStore.appendTaskPoints(');
    expect(taskBody).not.toContain('defaultRecordingStore.appendPoints(');
  });

  it('exposes strict owner-bound start, ensure, and pause entry points to Run', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/activity/locationTask.ts'),
      'utf8',
    );

    expect(source).toMatch(/export async function startTrackLocationTaskFor\(/);
    expect(source).toMatch(/export async function ensureTrackLocationTaskFor\(/);
    expect(source).toMatch(/export async function pauseTrackLocationTaskFor\(/);
  });

  it('keeps legacy entry points from activating an unleased native task', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/activity/locationTask.ts'),
      'utf8',
    );
    const legacyEnsure = source.match(
      /export async function ensureTrackLocationTask\(\)[\s\S]*?\n}/,
    )?.[0];
    const legacyStart = source.match(
      /export async function startTrackLocationTask\(\)[\s\S]*?\n}/,
    )?.[0];

    expect(legacyEnsure).not.toContain('reconcileLocationTask(');
    expect(legacyEnsure).not.toContain('startLocationUpdatesAsync(');
    expect(legacyStart).not.toContain('startLocationUpdatesAsync(');
    expect(legacyStart).toContain('Owner-bound recording identity required');
  });

  it('suspends appends before native stop and leaves A durably recoverable', async () => {
    const storage = memoryStorage();
    const recordingStore = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_A,
      createSessionId: () => 'session-a',
      nowIso: () => STARTED_A,
    });
    const identity = await recordingStore.begin(OWNER_A, 'run');
    const stopGate = deferred<void>();
    let running = false;
    const lifecycle = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-a',
      runtime: {
        hasStarted: async () => running,
        getForegroundPermission: async () => ({ granted: true }),
        getBackgroundPermission: async () => ({ granted: true }),
        start: async () => {
          running = true;
        },
        stop: async () => {
          await stopGate.promise;
          running = false;
        },
      },
    });

    await expect(lifecycle.startFor(identity)).resolves.toBe('restarted');
    const pause = lifecycle.pauseFor(identity);
    await flush();

    await expect(
      recordingStore.appendTaskPoints([{ lat: -31.9523, lon: 115.8613 }]),
    ).resolves.toBe(false);
    await expect(recordingStore.readPoints()).resolves.toEqual([]);
    await expect(recordingStore.recover(OWNER_A)).resolves.toMatchObject({
      kind: 'active',
      activityId: ACTIVITY_A,
      ownerId: OWNER_A,
      points: [],
    });

    stopGate.resolve();
    await expect(pause).resolves.toBe('paused');
    expect(running).toBe(false);
  });

  it('keeps a recovered recording paused when background permission is unavailable', async () => {
    const storage = memoryStorage();
    const recordingStore = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_A,
      createSessionId: () => 'session-a',
      nowIso: () => STARTED_A,
    });
    const identity = await recordingStore.begin(OWNER_A, 'run');
    const start = jest.fn(async () => undefined);
    const hasStarted = jest.fn(async () => false);
    const lifecycle = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-a',
      runtime: {
        hasStarted,
        getForegroundPermission: async () => ({ granted: true }),
        getBackgroundPermission: async () => ({ granted: false }),
        start,
        stop: async () => undefined,
      },
    });

    await expect(lifecycle.ensureFor(identity)).resolves.toBe('paused');
    expect(hasStarted).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    await expect(
      recordingStore.appendTaskPoints([{ lat: -31.9523, lon: 115.8613 }]),
    ).resolves.toBe(false);
  });

  it('suspends an existing lease when permission reconciliation throws', async () => {
    const storage = memoryStorage();
    const recordingStore = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_A,
      createSessionId: () => 'session-a',
      nowIso: () => STARTED_A,
    });
    const identity = await recordingStore.begin(OWNER_A, 'run');
    let running = false;
    let permissionError = false;
    const lifecycle = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-a',
      runtime: {
        hasStarted: async () => running,
        getForegroundPermission: async () => ({ granted: true }),
        getBackgroundPermission: async () => {
          if (permissionError) throw new Error('permission service unavailable');
          return { granted: true };
        },
        start: async () => {
          running = true;
        },
        stop: async () => {
          running = false;
        },
      },
    });
    await lifecycle.startFor(identity);
    permissionError = true;

    await expect(lifecycle.ensureFor(identity)).resolves.toBe('paused');
    await expect(
      recordingStore.appendTaskPoints([{ lat: -31.9523, lon: 115.8613 }]),
    ).resolves.toBe(false);
    expect(running).toBe(false);
  });

  it('closes A append access immediately when owner pause races a pending native start', async () => {
    const storage = memoryStorage();
    const recordingStore = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_A,
      createSessionId: () => 'session-a',
      nowIso: () => STARTED_A,
    });
    const identity = await recordingStore.begin(OWNER_A, 'run');
    const startGate = deferred<void>();
    let startEntered = false;
    let running = false;
    const lifecycle = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-a',
      runtime: {
        hasStarted: async () => running,
        getForegroundPermission: async () => ({ granted: true }),
        getBackgroundPermission: async () => ({ granted: true }),
        start: async () => {
          startEntered = true;
          await startGate.promise;
          running = true;
        },
        stop: async () => {
          running = false;
        },
      },
    });

    const start = lifecycle.startFor(identity);
    while (!startEntered) await flush();
    const pause = lifecycle.pauseFor(identity);
    await flush();

    await expect(
      recordingStore.appendTaskPoints([{ lat: -31.9523, lon: 115.8613 }]),
    ).resolves.toBe(false);
    await expect(recordingStore.readPoints()).resolves.toEqual([]);

    startGate.resolve();
    await expect(start).resolves.toBe('stale');
    await expect(pause).resolves.toBe('paused');
    await expect(recordingStore.recover(OWNER_A)).resolves.toMatchObject({
      kind: 'active',
      ownerId: OWNER_A,
      activityId: ACTIVITY_A,
      points: [],
    });
  });

  it('stops a successful stale start after an independent lifecycle already paused it', async () => {
    const storage = memoryStorage();
    const recordingStore = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_A,
      createSessionId: () => 'session-a',
      nowIso: () => STARTED_A,
    });
    const identity = await recordingStore.begin(OWNER_A, 'run');
    const startGate = deferred<void>();
    let startEntered = false;
    let pauseCheckedBeforeRelease = false;
    let running = false;
    const stop = jest.fn(async () => {
      running = false;
    });
    const runtime = {
      hasStarted: async () => {
        if (startEntered && !running) pauseCheckedBeforeRelease = true;
        return running;
      },
      getForegroundPermission: async () => ({ granted: true }),
      getBackgroundPermission: async () => ({ granted: true }),
      start: async () => {
        startEntered = true;
        await startGate.promise;
        running = true;
      },
      stop,
    };
    const starter = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-a',
      runtime,
    });
    const pauser = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'unused-lease',
      runtime,
    });

    const startA = starter.startFor(identity);
    while (!startEntered) await flush();
    const pauseA = pauser.pauseFor(identity);
    await expect(recordingStore.readActiveTaskLease()).resolves.toBeNull();
    for (let index = 0; index < 10; index += 1) await flush();
    expect(pauseCheckedBeforeRelease).toBe(false);
    startGate.resolve();

    await expect(startA).resolves.toBe('stale');
    await expect(pauseA).resolves.toBe('paused');
    expect(stop).toHaveBeenCalledTimes(1);
    expect(running).toBe(false);
    await expect(recordingStore.readActiveTaskLease()).resolves.toBeNull();
  });

  it('stops a partially-effectful rejected stale start after an independent pause', async () => {
    const storage = memoryStorage();
    const recordingStore = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_A,
      createSessionId: () => 'session-a',
      nowIso: () => STARTED_A,
    });
    const identity = await recordingStore.begin(OWNER_A, 'run');
    const startGate = deferred<void>();
    let startEntered = false;
    let pauseCheckedBeforeRelease = false;
    let running = false;
    const stop = jest.fn(async () => {
      running = false;
    });
    const runtime = {
      hasStarted: async () => {
        if (startEntered && !running) pauseCheckedBeforeRelease = true;
        return running;
      },
      getForegroundPermission: async () => ({ granted: true }),
      getBackgroundPermission: async () => ({ granted: true }),
      start: async () => {
        startEntered = true;
        await startGate.promise;
        running = true;
        throw new Error('native start rejected after taking effect');
      },
      stop,
    };
    const starter = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-a',
      runtime,
    });
    const pauser = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'unused-lease',
      runtime,
    });

    const startA = starter.startFor(identity);
    while (!startEntered) await flush();
    const pauseA = pauser.pauseFor(identity);
    await expect(recordingStore.readActiveTaskLease()).resolves.toBeNull();
    for (let index = 0; index < 10; index += 1) await flush();
    expect(pauseCheckedBeforeRelease).toBe(false);
    startGate.resolve();

    await expect(startA).resolves.toBe('stale');
    await expect(pauseA).resolves.toBe('paused');
    expect(stop).toHaveBeenCalledTimes(1);
    expect(running).toBe(false);
    await expect(recordingStore.readActiveTaskLease()).resolves.toBeNull();
  });

  it('does not let a stale ensure revoke the lease shared by a newer same-recording start', async () => {
    const base = memoryStorage();
    const leaseWriteEntered = deferred<void>();
    const releaseLeaseWrite = deferred<void>();
    let delayFirstLease = true;
    const storage = {
      ...base,
      setItem: async (key: string, value: string) => {
        if (delayFirstLease && key === 'activity:points') {
          const blob = JSON.parse(value);
          if (blob.locationLeases?.length === 1) {
            delayFirstLease = false;
            leaseWriteEntered.resolve();
            await releaseLeaseWrite.promise;
          }
        }
        base.values.set(key, value);
      },
    };
    const recordingStore = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_A,
      createSessionId: () => 'session-a',
      nowIso: () => STARTED_A,
    });
    const identity = await recordingStore.begin(OWNER_A, 'run');
    let running = false;
    const start = jest.fn(async () => {
      running = true;
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      createLeaseId: (() => {
        const ids = ['lease-ensure', 'lease-start'];
        return () => ids.shift()!;
      })(),
      runtime: {
        hasStarted: async () => running,
        getForegroundPermission: async () => ({ granted: true }),
        getBackgroundPermission: async () => ({ granted: true }),
        start,
        stop: async () => {
          running = false;
        },
      },
    });

    const staleEnsure = lifecycle.ensureFor(identity);
    await leaseWriteEntered.promise;
    const latestStart = lifecycle.startFor(identity);
    releaseLeaseWrite.resolve();

    await expect(staleEnsure).resolves.toBe('stale');
    await expect(latestStart).resolves.toBe('restarted');
    expect(start).toHaveBeenCalledTimes(1);
    expect(running).toBe(true);
    await expect(recordingStore.readActiveTaskLease()).resolves.toMatchObject({
      id: 'lease-ensure',
    });
  });

  it('does not let a stale permission failure revoke a newer same-recording start', async () => {
    const storage = memoryStorage();
    const recordingStore = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_A,
      createSessionId: () => 'session-a',
      nowIso: () => STARTED_A,
    });
    const identity = await recordingStore.begin(OWNER_A, 'run');
    const foregroundPermission = deferred<{ granted: boolean }>();
    let permissionEntered = false;
    let running = false;
    const start = jest.fn(async () => {
      running = true;
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-start',
      runtime: {
        hasStarted: async () => running,
        getForegroundPermission: () => {
          permissionEntered = true;
          return foregroundPermission.promise;
        },
        getBackgroundPermission: async () => ({ granted: true }),
        start,
        stop: async () => {
          running = false;
        },
      },
    });

    const staleEnsure = lifecycle.ensureFor(identity);
    while (!permissionEntered) await flush();
    const latestStart = lifecycle.startFor(identity);
    await expect(recordingStore.readActiveTaskLease()).resolves.toMatchObject({
      id: 'lease-start',
    });
    foregroundPermission.resolve(
      Promise.reject(new Error('stale permission failure')) as never,
    );

    await expect(staleEnsure).resolves.toBe('stale');
    await expect(latestStart).resolves.toBe('restarted');
    expect(start).toHaveBeenCalledTimes(1);
    expect(running).toBe(true);
    await expect(recordingStore.readActiveTaskLease()).resolves.toMatchObject({
      id: 'lease-start',
    });
  });

  it('revokes a prepared A lease before native start when pause wins the first microtask', async () => {
    const storage = memoryStorage();
    const recordingStore = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_A,
      createSessionId: () => 'session-a',
      nowIso: () => STARTED_A,
    });
    const identity = await recordingStore.begin(OWNER_A, 'run');
    let running = false;
    const startNative = jest.fn(async () => {
      running = true;
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-a',
      runtime: {
        hasStarted: async () => running,
        getForegroundPermission: async () => ({ granted: true }),
        getBackgroundPermission: async () => ({ granted: true }),
        start: startNative,
        stop: async () => {
          running = false;
        },
      },
    });

    const start = lifecycle.startFor(identity);
    const pause = lifecycle.pauseFor(identity);

    await expect(start).resolves.toBe('stale');
    await expect(pause).resolves.toBe('paused');
    expect(startNative).not.toHaveBeenCalled();
    expect(running).toBe(false);
    await expect(
      recordingStore.appendTaskPoints([{ lat: -31.9523, lon: 115.8613 }]),
    ).resolves.toBe(false);
  });

  it('hands a pending A native start to B without stopping B valid task', async () => {
    const storage = memoryStorage();
    const activityIds = [ACTIVITY_A, ACTIVITY_B];
    const sessions = ['session-a', 'session-b'];
    const startTimes = [STARTED_A, STARTED_B];
    const recordingStore = createLocationRecordingStore({
      storage,
      createActivityId: () => activityIds.shift()!,
      createSessionId: () => sessions.shift()!,
      createChunkId: () => 'chunk-b',
      nowIso: () => startTimes.shift()!,
    });
    const identityA = await recordingStore.begin(OWNER_A, 'run');
    const startGate = deferred<void>();
    let startCalls = 0;
    let stopCalls = 0;
    let running = false;
    const lifecycle = createLocationTaskLifecycle({
      storage,
      createLeaseId: (() => {
        const ids = ['lease-a', 'lease-b'];
        return () => ids.shift()!;
      })(),
      runtime: {
        hasStarted: async () => running,
        getForegroundPermission: async () => ({ granted: true }),
        getBackgroundPermission: async () => ({ granted: true }),
        start: async () => {
          startCalls += 1;
          if (startCalls === 1) await startGate.promise;
          running = true;
        },
        stop: async () => {
          stopCalls += 1;
          running = false;
        },
      },
    });

    const startA = lifecycle.startFor(identityA);
    while (startCalls === 0) await flush();
    await recordingStore.clear(identityA.activityId);
    const identityB = await recordingStore.begin(OWNER_B, 'walk');
    const startB = lifecycle.startFor(identityB);

    startGate.resolve();
    await expect(startA).resolves.toBe('stale');
    await expect(startB).resolves.toBe('running');
    expect(stopCalls).toBe(0);
    expect(running).toBe(true);
    await expect(
      recordingStore.appendTaskPoints([{ lat: -31.95, lon: 115.86 }]),
    ).resolves.toBe(true);
    await expect(recordingStore.recover(OWNER_B)).resolves.toMatchObject({
      kind: 'active',
      activityId: ACTIVITY_B,
      ownerId: OWNER_B,
      points: [{ lat: -31.95, lon: 115.86 }],
    });
  });

  it('ignores stale A ensure and pause commands around B valid lease', async () => {
    const storage = memoryStorage();
    const activityIds = [ACTIVITY_A, ACTIVITY_B];
    const sessions = ['session-a', 'session-b'];
    const startTimes = [STARTED_A, STARTED_B];
    const recordingStore = createLocationRecordingStore({
      storage,
      createActivityId: () => activityIds.shift()!,
      createSessionId: () => sessions.shift()!,
      createChunkId: () => 'chunk-b',
      nowIso: () => startTimes.shift()!,
    });
    const identityA = await recordingStore.begin(OWNER_A, 'run');
    await recordingStore.clear(identityA.activityId);
    const identityB = await recordingStore.begin(OWNER_B, 'ride');
    let running = false;
    const start = jest.fn(async () => {
      running = true;
    });
    const stop = jest.fn(async () => {
      running = false;
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-b',
      runtime: {
        hasStarted: async () => running,
        getForegroundPermission: async () => ({ granted: true }),
        getBackgroundPermission: async () => ({ granted: true }),
        start,
        stop,
      },
    });

    await expect(lifecycle.startFor(identityB)).resolves.toBe('restarted');
    await expect(lifecycle.ensureFor(identityA)).resolves.toBe('stale');
    await expect(lifecycle.pauseFor(identityA)).resolves.toBe('stale');

    expect(start).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    expect(running).toBe(true);
    await expect(
      recordingStore.appendTaskPoints([{ lat: -31.94, lon: 115.87 }]),
    ).resolves.toBe(true);
  });

  it('restarts a newer lease when an older pause finishes on the same recording', async () => {
    const storage = memoryStorage();
    const recordingStore = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_A,
      createSessionId: () => 'session-a',
      nowIso: () => STARTED_A,
    });
    const identity = await recordingStore.begin(OWNER_A, 'run');
    const stopGate = deferred<void>();
    let stopEntered = false;
    let running = true;
    const start = jest.fn(async () => {
      running = true;
    });
    const runtime = {
      hasStarted: async () => running,
      getForegroundPermission: async () => ({ granted: true }),
      getBackgroundPermission: async () => ({ granted: true }),
      start,
      stop: async () => {
        stopEntered = true;
        await stopGate.promise;
        running = false;
      },
    };
    const lifecycleA = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-a',
      runtime,
    });
    const lifecycleB = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-b',
      runtime,
    });
    await lifecycleA.startFor(identity);
    const pauseOldLease = lifecycleA.pauseFor(identity);
    while (!stopEntered) await flush();

    const resume = lifecycleB.startFor(identity);
    await expect(recordingStore.readActiveTaskLease()).resolves.toMatchObject({
      id: 'lease-b',
    });
    stopGate.resolve();

    await expect(pauseOldLease).resolves.toBe('paused');
    await expect(resume).resolves.toBe('running');
    expect(start).toHaveBeenCalledTimes(1);
    expect(running).toBe(true);
  });

  it('restarts B when an in-flight stale A stop finishes after B takes the lease', async () => {
    const storage = memoryStorage();
    const activityIds = [ACTIVITY_A, ACTIVITY_B];
    const sessions = ['session-a', 'session-b'];
    const startTimes = [STARTED_A, STARTED_B];
    const recordingStore = createLocationRecordingStore({
      storage,
      createActivityId: () => activityIds.shift()!,
      createSessionId: () => sessions.shift()!,
      createChunkId: () => 'chunk-b',
      nowIso: () => startTimes.shift()!,
    });
    const identityA = await recordingStore.begin(OWNER_A, 'run');
    const stopGate = deferred<void>();
    let stopEntered = false;
    let running = true;
    const start = jest.fn(async () => {
      running = true;
    });
    const runtime = {
      hasStarted: async () => running,
      getForegroundPermission: async () => ({ granted: true }),
      getBackgroundPermission: async () => ({ granted: true }),
      start,
      stop: async () => {
        stopEntered = true;
        await stopGate.promise;
        running = false;
      },
    };
    const lifecycleA = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-a',
      runtime,
    });
    const lifecycleB = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-b',
      runtime,
    });

    await expect(lifecycleA.startFor(identityA)).resolves.toBe('running');
    const pauseA = lifecycleA.pauseFor(identityA);
    while (!stopEntered) await flush();

    await recordingStore.clear(identityA.activityId);
    const identityB = await recordingStore.begin(OWNER_B, 'walk');
    const startB = lifecycleB.startFor(identityB);
    await expect(recordingStore.readActiveTaskLease()).resolves.toMatchObject({
      id: 'lease-b',
    });

    stopGate.resolve();
    await expect(pauseA).resolves.toBe('paused');
    await expect(startB).resolves.toBe('running');
    expect(start).toHaveBeenCalledTimes(1);
    expect(running).toBe(true);
    await expect(
      recordingStore.appendTaskPoints([{ lat: -31.93, lon: 115.88 }]),
    ).resolves.toBe(true);
  });

  it('restarts B when a partially-effectful stale A stop rejects', async () => {
    const storage = memoryStorage();
    const activityIds = [ACTIVITY_A, ACTIVITY_B];
    const sessions = ['session-a', 'session-b'];
    const startTimes = [STARTED_A, STARTED_B];
    const recordingStore = createLocationRecordingStore({
      storage,
      createActivityId: () => activityIds.shift()!,
      createSessionId: () => sessions.shift()!,
      nowIso: () => startTimes.shift()!,
    });
    const identityA = await recordingStore.begin(OWNER_A, 'run');
    const stopGate = deferred<void>();
    let stopEntered = false;
    let running = true;
    const start = jest.fn(async () => {
      running = true;
    });
    const runtime = {
      hasStarted: async () => running,
      getForegroundPermission: async () => ({ granted: true }),
      getBackgroundPermission: async () => ({ granted: true }),
      start,
      stop: async () => {
        stopEntered = true;
        await stopGate.promise;
        running = false;
        throw new Error('native stop rejected after stopping');
      },
    };
    const lifecycleA = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-a',
      runtime,
    });
    const lifecycleB = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-b',
      runtime,
    });
    await lifecycleA.startFor(identityA);
    const pauseA = lifecycleA.pauseFor(identityA);
    while (!stopEntered) await flush();

    await recordingStore.clear(identityA.activityId);
    const identityB = await recordingStore.begin(OWNER_B, 'walk');
    const startB = lifecycleB.startFor(identityB);
    await expect(recordingStore.readActiveTaskLease()).resolves.toMatchObject({
      id: 'lease-b',
    });
    stopGate.resolve();

    await expect(pauseA).resolves.toBe('paused');
    await expect(startB).resolves.toBe('running');
    expect(start).toHaveBeenCalledTimes(1);
    expect(running).toBe(true);
  });

  it('returns stale when A start rejects after B supersedes its recording', async () => {
    const storage = memoryStorage();
    const activityIds = [ACTIVITY_A, ACTIVITY_B];
    const sessions = ['session-a', 'session-b'];
    const startTimes = [STARTED_A, STARTED_B];
    const recordingStore = createLocationRecordingStore({
      storage,
      createActivityId: () => activityIds.shift()!,
      createSessionId: () => sessions.shift()!,
      nowIso: () => startTimes.shift()!,
    });
    const identityA = await recordingStore.begin(OWNER_A, 'run');
    const firstStartGate = deferred<void>();
    let startCalls = 0;
    let running = false;
    const stop = jest.fn(async () => {
      running = false;
    });
    const runtime = {
      hasStarted: async () => running,
      getForegroundPermission: async () => ({ granted: true }),
      getBackgroundPermission: async () => ({ granted: true }),
      start: async () => {
        startCalls += 1;
        if (startCalls === 1) {
          await firstStartGate.promise;
          running = true;
          throw new Error('A start rejected after taking effect');
        }
        running = true;
      },
      stop,
    };
    const lifecycleA = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-a',
      runtime,
    });
    const lifecycleB = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-b',
      runtime,
    });
    const startA = lifecycleA.startFor(identityA);
    while (startCalls === 0) await flush();

    await recordingStore.clear(identityA.activityId);
    const identityB = await recordingStore.begin(OWNER_B, 'walk');
    const startB = lifecycleB.startFor(identityB);
    await expect(recordingStore.readActiveTaskLease()).resolves.toMatchObject({
      id: 'lease-b',
    });
    firstStartGate.resolve();

    await expect(startA).resolves.toBe('stale');
    await expect(startB).resolves.toBe('running');
    expect(stop).not.toHaveBeenCalled();
    expect(running).toBe(true);
  });

  it('revokes A and compensates when native start rejects after taking effect', async () => {
    const storage = memoryStorage();
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_A,
      createSessionId: () => 'session-a',
      createChunkId: () => 'chunk-a',
      nowIso: () => STARTED_A,
      nowMs: () => 1_000,
    });
    const identity = await store.begin(OWNER_A, 'run');
    let running = false;
    const stop = jest.fn(async () => {
      running = false;
    });
    const lifecycle = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-a',
      nowMs: (() => {
        const values = [1_000, 2_000];
        return () => values.shift()!;
      })(),
      runtime: {
        hasStarted: async () => running,
        getForegroundPermission: async () => ({ granted: true }),
        getBackgroundPermission: async () => ({ granted: true }),
        start: async () => {
          running = true;
          throw new Error('native start rejected after taking effect');
        },
        stop,
      },
    });

    await expect(lifecycle.startFor(identity)).resolves.toBe('paused');
    expect(stop).toHaveBeenCalledTimes(1);
    expect(running).toBe(false);
    await expect(store.appendTaskSamples([
      { lat: -31.95, lon: 115.86, capturedAt: 2_500 },
    ])).resolves.toBe(false);
  });

  it('returns stale when A permission check rejects after B supersedes it', async () => {
    const storage = memoryStorage();
    const activityIds = [ACTIVITY_A, ACTIVITY_B];
    const sessions = ['session-a', 'session-b'];
    const startTimes = [STARTED_A, STARTED_B];
    const recordingStore = createLocationRecordingStore({
      storage,
      createActivityId: () => activityIds.shift()!,
      createSessionId: () => sessions.shift()!,
      nowIso: () => startTimes.shift()!,
    });
    const identityA = await recordingStore.begin(OWNER_A, 'run');
    const permission = deferred<{ granted: boolean }>();
    let permissionEntered = false;
    let running = false;
    const stop = jest.fn(async () => {
      running = false;
    });
    const runtimeA = {
      hasStarted: async () => running,
      getForegroundPermission: () => {
        permissionEntered = true;
        return permission.promise;
      },
      getBackgroundPermission: async () => ({ granted: true }),
      start: async () => {
        running = true;
      },
      stop,
    };
    const runtimeB = {
      ...runtimeA,
      getForegroundPermission: async () => ({ granted: true }),
    };
    const lifecycleA = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-a',
      runtime: runtimeA,
    });
    const lifecycleB = createLocationTaskLifecycle({
      storage,
      createLeaseId: () => 'lease-b',
      runtime: runtimeB,
    });
    const ensureA = lifecycleA.ensureFor(identityA);
    while (!permissionEntered) await flush();

    await recordingStore.clear(identityA.activityId);
    const identityB = await recordingStore.begin(OWNER_B, 'walk');
    const startB = lifecycleB.startFor(identityB);
    await expect(recordingStore.readActiveTaskLease()).resolves.toMatchObject({
      id: 'lease-b',
    });
    permission.resolve(Promise.reject(new Error('stale permission result')) as never);

    await expect(ensureA).resolves.toBe('stale');
    await expect(startB).resolves.toBe('restarted');
    expect(stop).not.toHaveBeenCalled();
    expect(running).toBe(true);
  });
});
