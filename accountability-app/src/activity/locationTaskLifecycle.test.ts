import { describe, expect, it, jest } from '@jest/globals';
import {
  createLocationRecordingStore,
  createLocationTaskLifecycle,
  startTrackLocationTask,
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

function memoryStorage(): LocationRecordingStorage & {
  values: Map<string, string>;
} {
  const values = new Map<string, string>();
  return {
    values,
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
    async getAllKeys() {
      return [...values.keys()];
    },
  };
}

describe('owner-bound location task lifecycle contract', () => {
  it('redacts a current recording from a mismatched owner', async () => {
    const storage = memoryStorage();
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => 'activity-a',
      createSessionId: () => 'session-a',
      nowIso: () => '2026-08-25T00:00:00.000Z',
    });
    await store.begin('owner-a', 'run');

    await expect(store.readRecording('owner-b')).resolves.toBeNull();
    await expect(store.recover('owner-b')).resolves.toEqual({
      kind: 'owner_mismatch',
      activityId: 'activity-a',
      ownerId: 'owner-a',
    });
  });

  it('stops a registered native task when permission denial leaves no active lease', async () => {
    const storage = memoryStorage();
    let started = true;
    const runtime = {
      hasStarted: jest.fn(async () => started),
      getForegroundPermission: jest.fn(async () => ({ granted: false })),
      getBackgroundPermission: jest.fn(async () => ({ granted: false })),
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
      createLeaseId: () => 'unused',
    });
    const identity = await store.begin('owner-a', 'run');

    await expect(lifecycle.ensureFor(identity)).resolves.toBe('paused');
    expect(runtime.start).not.toHaveBeenCalled();
    expect(runtime.stop).toHaveBeenCalledTimes(1);
    expect(started).toBe(false);
  });

  it('keeps a denied recording durably paused across recovery', async () => {
    const storage = memoryStorage();
    const runtime = {
      hasStarted: jest.fn(async () => false),
      getForegroundPermission: jest.fn(async () => ({ granted: true })),
      getBackgroundPermission: jest.fn(async () => ({ granted: false })),
      start: jest.fn(async () => undefined),
      stop: jest.fn(async () => undefined),
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
    });
    const identity = await store.begin('owner-a', 'run');

    await expect(lifecycle.ensureFor(identity)).resolves.toBe('paused');
    await expect(store.recover('owner-a')).resolves.toMatchObject({
      kind: 'active',
      ...identity,
      points: [],
    });
  });

  it('refuses to start a closing recording', async () => {
    const storage = memoryStorage();
    const runtime = {
      hasStarted: jest.fn(async () => false),
      getForegroundPermission: jest.fn(async () => ({ granted: true })),
      getBackgroundPermission: jest.fn(async () => ({ granted: true })),
      start: jest.fn(async () => undefined),
      stop: jest.fn(async () => undefined),
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
      createFinishId: () => 'finish-a',
      createSnapshotId: () => 'snapshot-a',
    });
    const identity = await store.begin('owner-a', 'run');
    await store.beginClosing(
      identity,
      { type: 'run', durationS: 60 },
      'finish-a',
      'snapshot-a',
    );

    expect(JSON.parse(storage.values.get('activity:points')!)).toMatchObject({
      state: 'closing',
      terminal: { phase: 'closing', finishId: 'finish-a' },
    });
    await expect(store.recover('owner-a')).resolves.toMatchObject({
      kind: 'closing',
      identity,
    });

    await expect(lifecycle.startFor(identity)).resolves.toBe('stale');
    expect(runtime.start).not.toHaveBeenCalled();
  });

  it('keeps the identity-less legacy start API incapable of activation', async () => {
    await expect(startTrackLocationTask()).rejects.toThrow(
      'Owner-bound recording identity required',
    );
  });
});
