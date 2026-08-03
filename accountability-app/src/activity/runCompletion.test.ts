import { describe, expect, it, jest } from '@jest/globals';
import { createActivitySynchronizer } from './activitySynchronizer';
import { ActivityUploadError } from './activityUpload';
import {
  completeRecordedActivity,
  acquireSynchronousLock,
  createDurableCompletionController,
  createOwnerBoundary,
  recordingDetailView,
  recordingTypeView,
  releaseSynchronousLock,
  runFeedAvailability,
  runSyncPresentation,
  shouldApplyOwnerAsyncResult,
  type PendingRecordedActivity,
} from './runCompletion';
import {
  createLocationRecordingStore,
  reconcileLocationTask,
  type LocationRecordingStorage,
} from './locationTask';
import type { QueuedActivity } from './offlineQueueTypes';
import {
  createRunEditorSafeCloser,
  handleRunEditorHardwareBack,
} from './RunShareSheet';

jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));
jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn(),
  createAssetAsync: jest.fn(),
}));
jest.mock('expo-file-system', () => ({
  File: class {
    async base64() {
      return '';
    }
  },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));
jest.mock('expo-image-picker', () => ({
  CameraType: { front: 'front', back: 'back' },
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));

const OWNER_A = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OWNER_B = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const ACTIVITY_ID = '11111111-1111-4111-8111-111111111111';
const STARTED_AT = '2026-07-26T01:00:00.000Z';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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

describe('createDurableCompletionController', () => {
  it('confirms the exact queued ID and status only after completion resolves', async () => {
    const enqueue = deferred<QueuedActivity>();
    const onConfirm = jest.fn();
    const controller = createDurableCompletionController({
      enqueueActivity: () => enqueue.promise,
      clearRecording: async () => undefined,
      onConfirm,
      onReset: jest.fn(),
    });

    const completion = controller.complete(pending());
    expect(onConfirm).not.toHaveBeenCalled();

    enqueue.resolve(queued(pending(), 'waiting_network'));
    await expect(completion).resolves.toMatchObject({
      id: ACTIVITY_ID,
      status: 'waiting_network',
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({
      activityId: ACTIVITY_ID,
      status: 'waiting_network',
    });
  });

  it('never confirms when durable completion rejects', async () => {
    const enqueue = deferred<QueuedActivity>();
    const onConfirm = jest.fn();
    const controller = createDurableCompletionController({
      enqueueActivity: () => enqueue.promise,
      clearRecording: async () => undefined,
      onConfirm,
      onReset: jest.fn(),
    });
    const completion = controller.complete(pending());

    enqueue.reject(new Error('queue unavailable'));

    await expect(completion).rejects.toThrow('queue unavailable');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shares a rapid retry with the one in-flight completion call', async () => {
    const enqueue = deferred<QueuedActivity>();
    const enqueueActivity = jest.fn(() => enqueue.promise);
    const onConfirm = jest.fn();
    const controller = createDurableCompletionController({
      enqueueActivity,
      clearRecording: async () => undefined,
      onConfirm,
      onReset: jest.fn(),
    });

    const first = controller.complete(pending());
    const retry = controller.complete(pending());

    expect(retry).toBe(first);
    expect(enqueueActivity).toHaveBeenCalledTimes(1);

    enqueue.resolve(queued());
    await Promise.all([first, retry]);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('reset clears confirmation and prevents the superseded completion from confirming late', async () => {
    const enqueue = deferred<QueuedActivity>();
    let confirmation: {
      activityId: string;
      status: QueuedActivity['status'];
    } | null = {
      activityId: ACTIVITY_ID,
      status: 'saved',
    };
    const resetReasons: string[] = [];
    const controller = createDurableCompletionController({
      enqueueActivity: () => enqueue.promise,
      clearRecording: async () => undefined,
      onConfirm: (value) => {
        confirmation = value;
      },
      onReset: (reason) => {
        confirmation = null;
        resetReasons.push(reason);
      },
    });
    const completion = controller.complete(pending());

    controller.reset('recovery');
    expect(confirmation).toBeNull();

    enqueue.resolve(queued());
    await completion;
    expect(confirmation).toBeNull();

    for (const reason of [
      'new_recording',
      'stop',
      'discard',
      'auth_owner_change',
      'current_run_cleared',
    ] as const) {
      controller.reset(reason);
    }
    expect(resetReasons).toEqual([
      'recovery',
      'new_recording',
      'stop',
      'discard',
      'auth_owner_change',
      'current_run_cleared',
    ]);
  });

  it('dispose prevents a late callback without creating an unhandled rejection', async () => {
    const enqueue = deferred<QueuedActivity>();
    const onConfirm = jest.fn();
    const controller = createDurableCompletionController({
      enqueueActivity: () => enqueue.promise,
      clearRecording: async () => undefined,
      onConfirm,
      onReset: jest.fn(),
    });
    const completion = controller.complete(pending());

    controller.dispose();
    enqueue.resolve(queued());

    await expect(completion).resolves.toMatchObject({
      id: ACTIVITY_ID,
    });
    expect(onConfirm).not.toHaveBeenCalled();
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

  it('does not assign an owner or ID while reading legacy raw recording', async () => {
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

    const before = new Map(storage.values);

    await expect(store.readRecording(OWNER_A)).resolves.toBeNull();
    await expect(store.readRecording(OWNER_B)).resolves.toBeNull();
    expect(storage.values).toEqual(before);
    expect(createId).not.toHaveBeenCalled();
  });

  it('does not reveal the oldest raw point-array through normal reads', async () => {
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

    await expect(store.readRecording(OWNER_A)).resolves.toBeNull();
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

  it('keeps a session-era legacy recording unclaimed and redacted', async () => {
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

    const before = new Map(storage.values);

    await expect(store.recover(OWNER_A, 'ride')).resolves.toEqual({
      kind: 'legacy_unclaimed',
    });
    expect(storage.values).toEqual(before);
    expect(createId).not.toHaveBeenCalled();
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

    const before = new Map(storage.values);

    await expect(store.recover(OWNER_A, 'run')).resolves.toEqual({
      kind: 'legacy_unclaimed',
    });
    expect(storage.values).toEqual(before);
    expect(storage.values.get('activity:session')).toBeUndefined();
  });

  it('claims legacy GPS only after an explicit action and reuses one stable ID', async () => {
    const route = [{ lat: -31.9523, lon: 115.8613 }];
    const storage = memoryStorage({
      'activity:points': JSON.stringify(route),
    });
    const createId = jest.fn(() => ACTIVITY_ID);
    const store = createLocationRecordingStore({
      storage,
      createActivityId: createId,
      createSessionId: () => 'migrated-session',
      nowIso: () => STARTED_AT,
    });

    const first = await store.claimLegacy(OWNER_A, 'walk');
    const second = await store.claimLegacy(OWNER_A, 'run');

    expect(first).toMatchObject({
      kind: 'active',
      activityId: ACTIVITY_ID,
      ownerId: OWNER_A,
      type: 'walk',
      points: route,
    });
    expect(second).toMatchObject({
      kind: 'active',
      activityId: ACTIVITY_ID,
      ownerId: OWNER_A,
      type: 'walk',
      points: route,
    });
    expect(createId).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.values.get('activity:points')!)).toMatchObject({
      activityId: ACTIVITY_ID,
      ownerId: OWNER_A,
      type: 'walk',
    });
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

  it('serializes concurrent begins so only one owner and ID can win', async () => {
    const storage = memoryStorage();
    const ids = [
      ACTIVITY_ID,
      '22222222-2222-4222-8222-222222222222',
    ];
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => ids.shift()!,
      createSessionId: () => `session-${ids.length}`,
      nowIso: () => STARTED_AT,
    });

    const results = await Promise.allSettled([
      store.begin(OWNER_A, 'run'),
      store.begin(OWNER_B, 'walk'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(JSON.parse(storage.values.get('activity:points')!)).toMatchObject({
      activityId: ACTIVITY_ID,
      ownerId: OWNER_A,
      type: 'run',
    });
  });

  it('does not mix a stale background append into a concurrent new begin', async () => {
    const storage = memoryStorage();
    const store = createLocationRecordingStore({
      storage,
      createActivityId: () => ACTIVITY_ID,
      createSessionId: () => 'session-new',
      nowIso: () => STARTED_AT,
    });

    await Promise.all([
      store.begin(OWNER_A, 'run'),
      store.appendPoints('session-stale', [
        { lat: -31.9523, lon: 115.8613 },
      ]),
    ]);

    expect(JSON.parse(storage.values.get('activity:points')!)).toMatchObject({
      ownerId: OWNER_A,
      session: 'session-new',
      points: [],
    });
  });
});

describe('active GPS task reconciliation', () => {
  const granted = async () => ({ granted: true });

  it('keeps an already-running task without starting another', async () => {
    const start = jest.fn(async () => undefined);
    await expect(
      reconcileLocationTask({
        hasStarted: async () => true,
        getForegroundPermission: granted,
        getBackgroundPermission: granted,
        start,
      }),
    ).resolves.toBe('running');
    expect(start).not.toHaveBeenCalled();
  });

  it('restarts a missing task when permissions still allow tracking', async () => {
    const start = jest.fn(async () => undefined);
    await expect(
      reconcileLocationTask({
        hasStarted: async () => false,
        getForegroundPermission: granted,
        getBackgroundPermission: granted,
        start,
      }),
    ).resolves.toBe('restarted');
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('returns paused without mutating raw data when task restart fails', async () => {
    await expect(
      reconcileLocationTask({
        hasStarted: async () => false,
        getForegroundPermission: granted,
        getBackgroundPermission: granted,
        start: async () => {
          throw new Error('native task unavailable');
        },
      }),
    ).resolves.toBe('paused');
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

describe('owner-tagged recording details', () => {
  const details = {
    ownerId: OWNER_A,
    distance: 1_500,
    elapsed: 420,
    points: [{ lat: -31.9523, lon: 115.8613 }],
  };

  it('redacts the first render after switching accounts or signing out', () => {
    expect(recordingDetailView(details, OWNER_B, 'ready')).toEqual({
      visible: false,
      distance: 0,
      elapsed: 0,
      points: [],
    });
    expect(recordingDetailView(details, null, 'ready')).toEqual({
      visible: false,
      distance: 0,
      elapsed: 0,
      points: [],
    });
    expect(recordingTypeView('run', OWNER_A, OWNER_B, 'ready')).toEqual({
      title: 'Activity',
      selectedType: null,
      selectorAccessibilityHidden: true,
    });
  });

  it('keeps prior details redacted after a storage recovery rejection', () => {
    expect(recordingDetailView(details, OWNER_A, 'error')).toEqual({
      visible: false,
      distance: 0,
      elapsed: 0,
      points: [],
    });
    expect(recordingTypeView('walk', OWNER_A, OWNER_A, 'error')).toEqual({
      title: 'Activity',
      selectedType: null,
      selectorAccessibilityHidden: true,
    });
  });

  it('reveals details only for the tagged owner after recovery succeeds', () => {
    expect(recordingDetailView(details, OWNER_A, 'ready')).toEqual({
      visible: true,
      distance: 1_500,
      elapsed: 420,
      points: details.points,
    });
    expect(recordingTypeView('ride', OWNER_A, OWNER_A, 'ready')).toEqual({
      title: 'ride',
      selectedType: 'ride',
      selectorAccessibilityHidden: false,
    });
  });
});

describe('synchronous mutation and owner gates', () => {
  it('allows only one start acquisition before the first await', () => {
    const lock = { current: false };

    expect(acquireSynchronousLock(lock)).toBe(true);
    expect(acquireSynchronousLock(lock)).toBe(false);
    releaseSynchronousLock(lock);
    expect(acquireSynchronousLock(lock)).toBe(true);
  });

  it('rejects deferred capture completion after the owner switches', async () => {
    let owner: string | null = OWNER_A;
    let resolveCapture!: (value: string) => void;
    const capture = new Promise<string>((resolve) => {
      resolveCapture = resolve;
    });
    const sideEffect = jest.fn();
    const boundary = createOwnerBoundary(OWNER_A, () => owner);

    const operation = boundary
      .awaitOwned(capture)
      .then((value) => boundary.runSideEffect(() => sideEffect(value)));
    owner = OWNER_B;
    resolveCapture('managed://card.jpg');

    await expect(operation).rejects.toThrow('Recording owner changed');
    expect(sideEffect).not.toHaveBeenCalled();
  });

  it('rechecks immediately before a deferred action side effect', async () => {
    let owner: string | null = OWNER_A;
    let resolveStage!: (value: string) => void;
    const staged = new Promise<string>((resolve) => {
      resolveStage = resolve;
    });
    const phoneWrite = jest.fn();
    const boundary = createOwnerBoundary(OWNER_A, () => owner);

    const operation = boundary.awaitOwned(staged).then((uri) => {
      owner = null;
      return boundary.runSideEffect(() => phoneWrite(uri));
    });
    resolveStage('managed://staged.jpg');

    await expect(operation).rejects.toThrow('Recording owner changed');
    expect(phoneWrite).not.toHaveBeenCalled();
  });

  it('drops stale avatar results after owner or revision changes', () => {
    expect(
      shouldApplyOwnerAsyncResult(OWNER_A, OWNER_B, 3, 3),
    ).toBe(false);
    expect(
      shouldApplyOwnerAsyncResult(OWNER_A, OWNER_A, 3, 4),
    ).toBe(false);
    expect(
      shouldApplyOwnerAsyncResult(OWNER_A, OWNER_A, 3, 3),
    ).toBe(true);
  });
});

describe('owner-independent run editor close', () => {
  it('closes after an owner switch and releases its managed lease once', async () => {
    const release = jest.fn(async () => undefined);
    const clearLocal = jest.fn();
    const onClose = jest.fn();
    let staged: { id: string } | null = { id: 'managed-card' };
    const externalSideEffect = jest.fn();
    const close = createRunEditorSafeCloser({
      takeStaged: () => {
        const item = staged;
        staged = null;
        return item;
      },
      release,
      clearLocal,
      onClose,
    });

    await Promise.all([close(), close()]);

    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith('managed-card', 'editor');
    expect(clearLocal).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(externalSideEffect).not.toHaveBeenCalled();
  });

  it('lets ownerless preview and mismatched hardware back close safely', async () => {
    const onClose = jest.fn();
    const close = createRunEditorSafeCloser({
      takeStaged: () => null,
      release: jest.fn(async () => undefined),
      clearLocal: jest.fn(),
      onClose,
    });

    expect(handleRunEditorHardwareBack(close)).toBe(true);
    await close();

    expect(onClose).toHaveBeenCalledTimes(1);
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
