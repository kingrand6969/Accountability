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
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('owner-bound location task lifecycle', () => {
  it('routes native samples through the active owner lease instead of a session-only append', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/activity/locationTask.ts'),
      'utf8',
    );
    const taskBody = source.match(
      /TaskManager\.defineTask\(LOCATION_TASK_NAME,[\s\S]*?\n\s*}\);/,
    )?.[0];

    expect(taskBody).toContain('defaultRecordingStore.appendTaskPoints(');
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

  it('revokes A start before it can acquire a lease when pause wins the first microtask', async () => {
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
    await expect(pause).resolves.toBe('already_paused');
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

  it('restarts B when an in-flight stale A stop finishes after B takes the lease', async () => {
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
    await expect(lifecycleB.startFor(identityB)).resolves.toBe('running');

    stopGate.resolve();
    await expect(pauseA).resolves.toBe('paused');
    expect(start).toHaveBeenCalledTimes(1);
    expect(running).toBe(true);
    await expect(
      recordingStore.appendTaskPoints([{ lat: -31.93, lon: 115.88 }]),
    ).resolves.toBe(true);
  });
});
