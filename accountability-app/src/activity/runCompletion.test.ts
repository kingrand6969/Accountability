import { describe, expect, it, jest } from '@jest/globals';
import { createActivitySynchronizer } from './activitySynchronizer';
import { ActivityUploadError } from './activityUpload';
import {
  completeRecordedActivity,
  runFeedAvailability,
  runSyncPresentation,
  type PendingRecordedActivity,
} from './runCompletion';
import {
  createLocationRecordingStore,
  type LocationRecordingStorage,
} from './locationTask';
import type { QueuedActivity } from './offlineQueueTypes';

jest.mock('../lib/supabase', () => ({ supabase: {} }));
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
const ACTIVITY_ID = '11111111-1111-4111-8111-111111111111';
const STARTED_AT = '2026-07-26T01:00:00.000Z';

function pending(): PendingRecordedActivity {
  return {
    activityId: ACTIVITY_ID,
    ownerId: OWNER_A,
    activity: {
      type: 'run',
      distance_m: 1_500,
      duration_s: 420,
      route: [
        { lat: -31.9523, lon: 115.8613 },
        { lat: -31.953, lon: 115.862 },
      ],
      started_at: STARTED_AT,
    },
  };
}

function queued(
  recording = pending(),
  status: QueuedActivity['status'] = 'saved',
): QueuedActivity {
  return {
    schema: 1,
    id: recording.activityId,
    ownerId: recording.ownerId,
    activity: recording.activity,
    createdAt: '2026-07-26T01:07:00.000Z',
    status,
    attemptCount: 0,
    nextAttemptAt: 0,
    lastError: null,
  };
}

function memoryStorage(
  initial: Record<string, string> = {},
): LocationRecordingStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
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

describe('completeRecordedActivity', () => {
  it('durably enqueues before clearing raw GPS', async () => {
    const order: string[] = [];
    const recording = pending();

    const result = await completeRecordedActivity(recording, {
      enqueueActivity: async (ownerId, activity, id) => {
        order.push('enqueue');
        expect([ownerId, id, activity]).toEqual([
          OWNER_A,
          ACTIVITY_ID,
          recording.activity,
        ]);
        return queued(recording);
      },
      clearRecording: async (activityId) => {
        order.push('clear');
        expect(activityId).toBe(ACTIVITY_ID);
      },
    });

    expect(result.id).toBe(ACTIVITY_ID);
    expect(order).toEqual(['enqueue', 'clear']);
  });

  it('never clears raw GPS when durable enqueue fails', async () => {
    const clearRecording = jest.fn(async () => undefined);

    await expect(
      completeRecordedActivity(pending(), {
        enqueueActivity: async () => {
          throw new Error('storage full');
        },
        clearRecording,
      }),
    ).rejects.toThrow('storage full');

    expect(clearRecording).not.toHaveBeenCalled();
  });

  it('keeps the exact same ID for an idempotent retry after clear fails', async () => {
    const ids: string[] = [];
    let clearAttempts = 0;
    const dependencies = {
      enqueueActivity: async (
        _ownerId: string,
        _activity: PendingRecordedActivity['activity'],
        id: string,
      ) => {
        ids.push(id);
        return queued();
      },
      clearRecording: async () => {
        clearAttempts += 1;
        if (clearAttempts === 1) throw new Error('clear failed');
      },
    };

    await expect(
      completeRecordedActivity(pending(), dependencies),
    ).rejects.toThrow('clear failed');
    await expect(
      completeRecordedActivity(pending(), dependencies),
    ).resolves.toMatchObject({ id: ACTIVITY_ID });

    expect(ids).toEqual([ACTIVITY_ID, ACTIVITY_ID]);
  });

  it('uses the owner captured at recording start after the signed-in account switches', async () => {
    let currentOwnerId = OWNER_A;
    const recording = pending();
    currentOwnerId = OWNER_B;
    const enqueueActivity = jest.fn(async () => queued(recording));

    await completeRecordedActivity(recording, {
      enqueueActivity,
      clearRecording: async () => undefined,
    });

    expect(currentOwnerId).toBe(OWNER_B);
    expect(enqueueActivity).toHaveBeenCalledWith(
      OWNER_A,
      recording.activity,
      ACTIVITY_ID,
    );
  });
});

describe('location recording persistence', () => {
  it('captures one stable UUID and owner when recording begins', async () => {
    const storage = memoryStorage();
    const createId = jest.fn(() => ACTIVITY_ID);
    const store = createLocationRecordingStore({
      storage,
      createActivityId: createId,
      createSessionId: () => 'session-1',
      nowIso: () => STARTED_AT,
    });

    const identity = await store.begin(OWNER_A);
    const restarted = createLocationRecordingStore({
      storage,
      createActivityId: () => {
        throw new Error('must not create a second ID');
      },
    });

    expect(identity).toEqual({
      activityId: ACTIVITY_ID,
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    });
    await expect(restarted.readRecording()).resolves.toMatchObject(identity);
    expect(createId).toHaveBeenCalledTimes(1);
  });

  it('persists a secure ID once when parsing a legacy raw recording', async () => {
    const storage = memoryStorage({
      'activity:session': 'legacy-session',
      'activity:points': JSON.stringify({
        session: 'legacy-session',
        points: [{ lat: -31.9523, lon: 115.8613 }],
      }),
    });
    const createId = jest.fn(() => ACTIVITY_ID);
    const store = createLocationRecordingStore({
      storage,
      createActivityId: createId,
      nowIso: () => STARTED_AT,
    });

    const first = await store.readRecording(OWNER_A);
    const second = await store.readRecording(OWNER_B);
    const persisted = JSON.parse(storage.values.get('activity:points')!);

    expect(first).toMatchObject({
      activityId: ACTIVITY_ID,
      ownerId: OWNER_A,
    });
    expect(second).toMatchObject({
      activityId: ACTIVITY_ID,
      ownerId: OWNER_A,
    });
    expect(persisted).toMatchObject({
      schema: 2,
      activityId: ACTIVITY_ID,
      ownerId: OWNER_A,
    });
    expect(createId).toHaveBeenCalledTimes(1);
  });

  it('migrates the oldest raw point-array format without losing its route', async () => {
    const route = [{ lat: -31.9523, lon: 115.8613 }];
    const storage = memoryStorage({
      'activity:session': 'legacy-session',
      'activity:points': JSON.stringify(route),
    });
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_ID,
      nowIso: () => STARTED_AT,
    });

    await expect(store.readRecording(OWNER_A)).resolves.toMatchObject({
      activityId: ACTIVITY_ID,
      ownerId: OWNER_A,
      points: route,
    });
  });

  it('recovers a completed run with the same ID and owner after restart', async () => {
    const storage = memoryStorage();
    const firstProcess = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_ID,
      createSessionId: () => 'session-1',
      nowIso: () => STARTED_AT,
    });
    await firstProcess.begin(OWNER_A);
    await firstProcess.persistCompleted(pending());

    const restarted = createLocationRecordingStore({ storage });

    await expect(restarted.readPendingCompleted()).resolves.toEqual(pending());
  });

  it('restores an active schema-2 recording and refuses to overwrite it', async () => {
    const storage = memoryStorage();
    const firstProcess = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_ID,
      createSessionId: () => 'session-1',
      nowIso: () => STARTED_AT,
    });
    await firstProcess.begin(OWNER_A, 'walk');

    const restarted = createLocationRecordingStore({ storage });

    await expect(restarted.recover(OWNER_A, 'run')).resolves.toMatchObject({
      kind: 'active',
      activityId: ACTIVITY_ID,
      ownerId: OWNER_A,
      type: 'walk',
      points: [],
    });
    await expect(restarted.begin(OWNER_A, 'run')).rejects.toThrow(
      'A saved recording already exists',
    );
  });

  it('migrates legacy GPS once and restores it as an active recording', async () => {
    const route = [{ lat: -31.9523, lon: 115.8613 }];
    const storage = memoryStorage({
      'activity:session': 'legacy-session',
      'activity:points': JSON.stringify(route),
    });
    const createId = jest.fn(() => ACTIVITY_ID);
    const store = createLocationRecordingStore({
      storage,
      createActivityId: createId,
      nowIso: () => STARTED_AT,
    });

    await expect(store.recover(OWNER_A, 'ride')).resolves.toMatchObject({
      kind: 'active',
      activityId: ACTIVITY_ID,
      ownerId: OWNER_A,
      type: 'ride',
      points: route,
    });
    await expect(store.recover(OWNER_A, 'run')).resolves.toMatchObject({
      kind: 'active',
      activityId: ACTIVITY_ID,
      ownerId: OWNER_A,
      type: 'ride',
      points: route,
    });
    expect(createId).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.values.get('activity:points')!)).toMatchObject({
      schema: 2,
      activityId: ACTIVITY_ID,
      ownerId: OWNER_A,
      type: 'ride',
    });
  });

  it('restores the pre-session point-array format', async () => {
    const route = [{ lat: -31.9523, lon: 115.8613 }];
    const storage = memoryStorage({
      'activity:points': JSON.stringify(route),
    });
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_ID,
      createSessionId: () => 'migrated-session',
      nowIso: () => STARTED_AT,
    });

    await expect(store.recover(OWNER_A, 'run')).resolves.toMatchObject({
      kind: 'active',
      activityId: ACTIVITY_ID,
      ownerId: OWNER_A,
      points: route,
    });
    expect(storage.values.get('activity:session')).toBe('migrated-session');
  });

  it('redacts owner-mismatched recovery and still prevents Start overwrite', async () => {
    const storage = memoryStorage();
    const firstProcess = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_ID,
      createSessionId: () => 'session-1',
      nowIso: () => STARTED_AT,
    });
    await firstProcess.begin(OWNER_A, 'run');

    const restarted = createLocationRecordingStore({ storage });
    const recovery = await restarted.recover(OWNER_B, 'walk');

    expect(recovery).toEqual({
      kind: 'owner_mismatch',
      activityId: ACTIVITY_ID,
      ownerId: OWNER_A,
    });
    expect(recovery).not.toHaveProperty('points');
    await expect(restarted.begin(OWNER_B, 'walk')).rejects.toThrow(
      'A saved recording already exists',
    );
  });
});

describe('run sync presentation', () => {
  it('keeps Feed disabled for the matching queued ID and exposes the live status', () => {
    expect(
      runSyncPresentation(ACTIVITY_ID, 'saved', [
        queued(pending(), 'waiting_network'),
      ]),
    ).toEqual({
      queued: true,
      status: 'waiting_network',
      title: 'Saved on phone',
      detail: 'Uploads automatically when online',
      feedDisabledReason: 'Uploads automatically when online',
    });
  });

  it('re-enables Feed after the matching ID leaves the queue', () => {
    expect(runSyncPresentation(ACTIVITY_ID, 'saved', [])).toEqual({
      queued: false,
      status: null,
      title: 'Saved on phone',
      detail: 'Uploaded',
      feedDisabledReason: null,
    });
  });

  it('still says Saved on phone when the network is absent', () => {
    expect(
      runSyncPresentation(ACTIVITY_ID, 'waiting_network', []),
    ).toMatchObject({
      title: 'Saved on phone',
      detail: 'Uploads automatically when online',
    });
  });
});

describe('fail-closed Feed availability', () => {
  const healthy = {
    queueChecked: true,
    syncStatus: 'idle' as const,
    syncError: null,
    queuedActivities: [] as QueuedActivity[],
  };

  it('disables Feed after signout or an account switch', () => {
    expect(
      runFeedAvailability(ACTIVITY_ID, OWNER_A, null, healthy),
    ).toEqual({
      enabled: false,
      reason: 'Sign in as the recording owner to post',
    });
    expect(
      runFeedAvailability(ACTIVITY_ID, OWNER_A, OWNER_B, healthy),
    ).toEqual({
      enabled: false,
      reason: 'Sign in as the recording owner to post',
    });
  });

  it('disables Feed while queue authority is unknown or sync has failed', () => {
    expect(
      runFeedAvailability(ACTIVITY_ID, OWNER_A, OWNER_A, {
        ...healthy,
        queueChecked: false,
      }),
    ).toEqual({
      enabled: false,
      reason: 'Checking saved activity',
    });
    expect(
      runFeedAvailability(ACTIVITY_ID, OWNER_A, OWNER_A, {
        ...healthy,
        syncStatus: 'error',
        syncError: 'Offline activity recovery failed.',
      }),
    ).toEqual({
      enabled: false,
      reason: 'Uploads unavailable—retry sync',
    });
  });

  it('enables Feed only for the exact owner with a healthy authoritative absence', () => {
    expect(
      runFeedAvailability(ACTIVITY_ID, OWNER_A, OWNER_A, healthy),
    ).toEqual({ enabled: true, reason: null });

    expect(
      runFeedAvailability(ACTIVITY_ID, OWNER_A, OWNER_A, {
        ...healthy,
        queuedActivities: [queued()],
      }),
    ).toEqual({
      enabled: false,
      reason: 'Uploads automatically when online',
    });
  });
});

describe('stable ID across an ambiguous committed upload', () => {
  it('preflights the same persisted ID on retry and removes only after confirmation', async () => {
    const recording = pending();
    const records = new Map<string, QueuedActivity>();
    const serverIds = new Set<string>();
    let inserts = 0;
    let firstUpload = true;
    const enqueueActivity = async (
      ownerId: string,
      activity: PendingRecordedActivity['activity'],
      id: string,
    ) => {
      const existing = records.get(id);
      if (existing) return existing;
      const entry = queued({ activityId: id, ownerId, activity });
      records.set(id, entry);
      return entry;
    };
    await completeRecordedActivity(recording, {
      enqueueActivity,
      clearRecording: async () => undefined,
    });

    const list = async (ownerId: string) =>
      [...records.values()].filter((entry) => entry.ownerId === ownerId);
    const patch = async (
      ownerId: string,
      id: string,
      value: Partial<QueuedActivity>,
    ) => {
      const current = records.get(id)!;
      expect(current.ownerId).toBe(ownerId);
      const updated = { ...current, ...value };
      records.set(id, updated);
      return updated;
    };
    const remove = jest.fn(async (_ownerId: string, id: string) => {
      records.delete(id);
    });
    const upload = jest.fn(async (entry: QueuedActivity) => {
      if (serverIds.has(entry.id)) return entry.id;
      serverIds.add(entry.id);
      inserts += 1;
      if (firstUpload) {
        firstUpload = false;
        throw new ActivityUploadError(
          'network',
          'response lost and confirmation unavailable',
          true,
        );
      }
      return entry.id;
    });

    const firstProvider = createActivitySynchronizer({
      list,
      patch,
      remove,
      upload,
      now: () => 1_000,
      random: () => 0.5,
    });
    await firstProvider.drain(OWNER_A);

    expect(records.has(ACTIVITY_ID)).toBe(true);
    expect(remove).not.toHaveBeenCalled();
    expect(serverIds).toEqual(new Set([ACTIVITY_ID]));

    const restartedProvider = createActivitySynchronizer({
      list,
      patch,
      remove,
      upload,
      now: () => 5_000,
      random: () => 0.5,
    });
    await restartedProvider.drain(OWNER_A, true);

    expect(upload.mock.calls.map(([entry]) => entry.id)).toEqual([
      ACTIVITY_ID,
      ACTIVITY_ID,
    ]);
    expect(inserts).toBe(1);
    expect(serverIds.size).toBe(1);
    expect(remove).toHaveBeenCalledWith(OWNER_A, ACTIVITY_ID);
    expect(records.has(ACTIVITY_ID)).toBe(false);
  });
});
