import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NewActivity } from './api';
import type { Pt } from './geo';
import { createActivityId as secureCreateActivityId } from './offlineQueueTypes';
import type { PendingRecordedActivity } from './runCompletion';

export const LOCATION_TASK_NAME = 'accountability-location-task';
const POINTS_KEY = 'activity:points';
const SESSION_KEY = 'activity:session';
let recordingMutationTail: Promise<void> = Promise.resolve();

function serializeRecordingMutation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const result = recordingMutationTail.then(operation, operation);
  recordingMutationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

type LegacyPointsBlob = { session: string; points: Pt[] };

type LocationTaskLease = {
  schema: 1;
  id: string;
  session: string;
  activityId: string;
  ownerId: string;
  startedAt: string;
  appendEnabled: boolean;
};

type RecordingBlob = {
  schema: 2;
  session: string;
  activityId: string;
  ownerId: string;
  startedAt: string;
  type: NewActivity['type'];
  points: Pt[];
  completed: NewActivity | null;
  locationLease: LocationTaskLease | null;
};

export type TrackRecordingIdentity = Pick<
  RecordingBlob,
  'activityId' | 'ownerId' | 'startedAt'
>;

export type TrackRecordingRecovery =
  | { kind: 'none' }
  | { kind: 'needs_owner' }
  | { kind: 'legacy_unclaimed' }
  | {
      kind: 'owner_mismatch';
      activityId: string;
      ownerId: string;
    }
  | (TrackRecordingIdentity & {
      kind: 'active';
      type: NewActivity['type'];
      points: Pt[];
    })
  | {
      kind: 'completed';
      recording: PendingRecordedActivity;
    };

export type LocationRecordingStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

type LocationRecordingStoreOptions = {
  storage: LocationRecordingStorage;
  createActivityId: () => string;
  createSessionId: () => string;
  nowIso: () => string;
};

type LocationRecordingStoreOverrides = Partial<LocationRecordingStoreOptions> &
  Pick<LocationRecordingStoreOptions, 'storage'>;

const defaultStoreOptions: LocationRecordingStoreOptions = {
  storage: AsyncStorage,
  createActivityId: secureCreateActivityId,
  createSessionId: () =>
    `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  nowIso: () => new Date().toISOString(),
};

/**
 * Storage adapter used by both the UI and tests. The stable owner/ID lives
 * beside raw GPS, so a process restart cannot change either before enqueue.
 */
export function createLocationRecordingStore(
  overrides: LocationRecordingStoreOverrides,
) {
  const options: LocationRecordingStoreOptions = {
    ...defaultStoreOptions,
    ...overrides,
  };

  function begin(
    ownerId: string,
    type: NewActivity['type'] = 'run',
  ): Promise<TrackRecordingIdentity> {
    return serializeRecordingMutation(async () => {
      if (!ownerId.trim()) throw new Error('A signed-in owner is required');
      const [storedSession, storedPoints] = await Promise.all([
        options.storage.getItem(SESSION_KEY),
        options.storage.getItem(POINTS_KEY),
      ]);
      if (storedSession !== null || storedPoints !== null) {
        throw new Error('A saved recording already exists');
      }
      const blob: RecordingBlob = {
        schema: 2,
        session: options.createSessionId(),
        activityId: options.createActivityId(),
        ownerId,
        startedAt: options.nowIso(),
        type,
        points: [],
        completed: null,
        locationLease: null,
      };

      await options.storage.setItem(POINTS_KEY, JSON.stringify(blob));
      await options.storage.setItem(SESSION_KEY, blob.session);
      return identityOf(blob);
    });
  }

  async function readRecording(
    _legacyOwnerId?: string,
    _legacyType: NewActivity['type'] = 'run',
  ): Promise<(TrackRecordingIdentity & { points: Pt[] }) | null> {
    const raw = await options.storage.getItem(POINTS_KEY);
    const parsed = parseStoredBlob(raw);
    if (!parsed) return null;

    if (parsed.kind === 'current') {
      return { ...identityOf(parsed.blob), points: parsed.blob.points };
    }
    return null;
  }

  function recover(
    currentOwnerId: string | null,
    legacyType: NewActivity['type'] = 'run',
  ): Promise<TrackRecordingRecovery> {
    return serializeRecordingMutation(async () => {
      const raw = await options.storage.getItem(POINTS_KEY);
      const parsed = parseStoredBlob(raw);
      if (!parsed) return { kind: 'none' };

      if (parsed.kind === 'legacy') {
        return { kind: 'legacy_unclaimed' };
      }

      await options.storage.setItem(POINTS_KEY, JSON.stringify(parsed.blob));
      const storedSession = await options.storage.getItem(SESSION_KEY);
      if (storedSession !== parsed.blob.session) {
        await options.storage.setItem(SESSION_KEY, parsed.blob.session);
      }
      if (!currentOwnerId || parsed.blob.ownerId !== currentOwnerId) {
        return {
          kind: 'owner_mismatch',
          activityId: parsed.blob.activityId,
          ownerId: parsed.blob.ownerId,
        };
      }
      if (parsed.blob.completed) {
        return {
          kind: 'completed',
          recording: {
            activityId: parsed.blob.activityId,
            ownerId: parsed.blob.ownerId,
            activity: parsed.blob.completed,
          },
        };
      }
      return {
        kind: 'active',
        ...identityOf(parsed.blob),
        type: parsed.blob.type,
        points: parsed.blob.points,
      };
    });
  }

  function claimLegacy(
    ownerId: string,
    type: NewActivity['type'] = 'run',
  ): Promise<TrackRecordingRecovery> {
    return serializeRecordingMutation(async () => {
      if (!ownerId.trim()) throw new Error('A signed-in owner is required');
      const [storedSession, raw] = await Promise.all([
        options.storage.getItem(SESSION_KEY),
        options.storage.getItem(POINTS_KEY),
      ]);
      const parsed = parseStoredBlob(raw);
      if (!parsed) throw new Error('Legacy recording was not found');

      if (parsed.kind === 'current') {
        if (parsed.blob.ownerId !== ownerId) {
          return {
            kind: 'owner_mismatch',
            activityId: parsed.blob.activityId,
            ownerId: parsed.blob.ownerId,
          };
        }
        return parsed.blob.completed
          ? {
              kind: 'completed',
              recording: {
                activityId: parsed.blob.activityId,
                ownerId: parsed.blob.ownerId,
                activity: parsed.blob.completed,
              },
            }
          : {
              kind: 'active',
              ...identityOf(parsed.blob),
              type: parsed.blob.type,
              points: parsed.blob.points,
            };
      }

      const session =
        parsed.session || storedSession || options.createSessionId();
      const claimed: RecordingBlob = {
        schema: 2,
        session,
        activityId: options.createActivityId(),
        ownerId,
        startedAt: options.nowIso(),
        type,
        points: parsed.points,
        completed: null,
        locationLease: null,
      };
      await options.storage.setItem(POINTS_KEY, JSON.stringify(claimed));
      if (storedSession !== session) {
        await options.storage.setItem(SESSION_KEY, session);
      }
      return {
        kind: 'active',
        ...identityOf(claimed),
        type: claimed.type,
        points: claimed.points,
      };
    });
  }

  async function readPoints(): Promise<Pt[]> {
    const [session, raw] = await Promise.all([
      options.storage.getItem(SESSION_KEY),
      options.storage.getItem(POINTS_KEY),
    ]);
    if (!session) return [];
    const parsed = parseStoredBlob(raw);
    if (!parsed) return [];
    if (parsed.kind === 'current') {
      return parsed.blob.session === session ? parsed.blob.points : [];
    }
    return !parsed.session || parsed.session === session ? parsed.points : [];
  }

  function persistCompleted(
    recording: PendingRecordedActivity,
  ): Promise<void> {
    return serializeRecordingMutation(async () => {
      const raw = await options.storage.getItem(POINTS_KEY);
      const parsed = parseStoredBlob(raw);
      if (
        !parsed ||
        parsed.kind !== 'current' ||
        parsed.blob.activityId !== recording.activityId ||
        parsed.blob.ownerId !== recording.ownerId
      ) {
        throw new Error('Recorded activity identity does not match raw GPS');
      }

      const completed: RecordingBlob = {
        ...parsed.blob,
        type: recording.activity.type,
        points: recording.activity.route,
        completed: recording.activity,
      };
      await options.storage.setItem(POINTS_KEY, JSON.stringify(completed));
    });
  }

  async function readPendingCompleted(): Promise<PendingRecordedActivity | null> {
    const raw = await options.storage.getItem(POINTS_KEY);
    const parsed = parseStoredBlob(raw);
    if (
      !parsed ||
      parsed.kind !== 'current' ||
      !parsed.blob.completed
    ) {
      return null;
    }
    return {
      activityId: parsed.blob.activityId,
      ownerId: parsed.blob.ownerId,
      activity: parsed.blob.completed,
    };
  }

  function appendPoints(session: string, nextPoints: Pt[]): Promise<void> {
    return serializeRecordingMutation(async () => {
      const raw = await options.storage.getItem(POINTS_KEY);
      const parsed = parseStoredBlob(raw);
      if (!parsed) return;
      if (parsed.kind === 'current') {
        if (parsed.blob.session !== session || parsed.blob.completed) return;
        await options.storage.setItem(
          POINTS_KEY,
          JSON.stringify({
            ...parsed.blob,
            points: [...parsed.blob.points, ...nextPoints],
          }),
        );
        return;
      }
      if (parsed.session && parsed.session !== session) return;
      const legacy: LegacyPointsBlob = {
        session,
        points: [...parsed.points, ...nextPoints],
      };
      await options.storage.setItem(POINTS_KEY, JSON.stringify(legacy));
    });
  }

  function acquireTaskLease(
    identity: TrackRecordingIdentity,
    leaseId: string,
  ): Promise<LocationTaskLease | null> {
    return serializeRecordingMutation(async () => {
      const [storedSession, raw] = await Promise.all([
        options.storage.getItem(SESSION_KEY),
        options.storage.getItem(POINTS_KEY),
      ]);
      const parsed = parseStoredBlob(raw);
      if (
        !parsed ||
        parsed.kind !== 'current' ||
        parsed.blob.completed ||
        storedSession !== parsed.blob.session ||
        !recordingMatchesIdentity(parsed.blob, identity)
      ) {
        return null;
      }

      const current = parsed.blob.locationLease;
      if (
        current?.appendEnabled &&
        leaseMatchesRecording(current, parsed.blob)
      ) {
        return current;
      }

      const lease: LocationTaskLease = {
        schema: 1,
        id: leaseId,
        session: parsed.blob.session,
        activityId: parsed.blob.activityId,
        ownerId: parsed.blob.ownerId,
        startedAt: parsed.blob.startedAt,
        appendEnabled: true,
      };
      await options.storage.setItem(
        POINTS_KEY,
        JSON.stringify({ ...parsed.blob, locationLease: lease }),
      );
      return lease;
    });
  }

  function recordingIdentityIsCurrent(
    identity: TrackRecordingIdentity,
  ): Promise<boolean> {
    return serializeRecordingMutation(async () => {
      const [storedSession, raw] = await Promise.all([
        options.storage.getItem(SESSION_KEY),
        options.storage.getItem(POINTS_KEY),
      ]);
      const parsed = parseStoredBlob(raw);
      return Boolean(
        parsed?.kind === 'current' &&
          !parsed.blob.completed &&
          storedSession === parsed.blob.session &&
          recordingMatchesIdentity(parsed.blob, identity),
      );
    });
  }

  function suspendTaskLeaseFor(
    identity: TrackRecordingIdentity,
  ): Promise<
    | { kind: 'stale' }
    | { kind: 'already_paused'; lease: LocationTaskLease | null }
    | { kind: 'suspended'; lease: LocationTaskLease }
  > {
    return serializeRecordingMutation(async () => {
      const [storedSession, raw] = await Promise.all([
        options.storage.getItem(SESSION_KEY),
        options.storage.getItem(POINTS_KEY),
      ]);
      const parsed = parseStoredBlob(raw);
      if (
        !parsed ||
        parsed.kind !== 'current' ||
        parsed.blob.completed ||
        storedSession !== parsed.blob.session ||
        !recordingMatchesIdentity(parsed.blob, identity)
      ) {
        return { kind: 'stale' };
      }

      const current = parsed.blob.locationLease;
      if (!current?.appendEnabled) {
        return { kind: 'already_paused', lease: current ?? null };
      }
      if (!leaseMatchesRecording(current, parsed.blob)) {
        return { kind: 'stale' };
      }

      const lease = { ...current, appendEnabled: false };
      await options.storage.setItem(
        POINTS_KEY,
        JSON.stringify({ ...parsed.blob, locationLease: lease }),
      );
      return { kind: 'suspended', lease };
    });
  }

  function taskLeaseIsCurrent(
    lease: LocationTaskLease,
    appendEnabled: boolean,
  ): Promise<boolean> {
    return serializeRecordingMutation(async () => {
      const [storedSession, raw] = await Promise.all([
        options.storage.getItem(SESSION_KEY),
        options.storage.getItem(POINTS_KEY),
      ]);
      const parsed = parseStoredBlob(raw);
      return Boolean(
        parsed?.kind === 'current' &&
          !parsed.blob.completed &&
          storedSession === parsed.blob.session &&
          parsed.blob.locationLease?.id === lease.id &&
          parsed.blob.locationLease.appendEnabled === appendEnabled &&
          leaseMatchesRecording(parsed.blob.locationLease, parsed.blob),
      );
    });
  }

  function readActiveTaskLease(): Promise<LocationTaskLease | null> {
    return serializeRecordingMutation(async () => {
      const [storedSession, raw] = await Promise.all([
        options.storage.getItem(SESSION_KEY),
        options.storage.getItem(POINTS_KEY),
      ]);
      const parsed = parseStoredBlob(raw);
      if (
        !parsed ||
        parsed.kind !== 'current' ||
        parsed.blob.completed ||
        storedSession !== parsed.blob.session ||
        !parsed.blob.locationLease?.appendEnabled ||
        !leaseMatchesRecording(parsed.blob.locationLease, parsed.blob)
      ) {
        return null;
      }
      return parsed.blob.locationLease;
    });
  }

  function appendTaskPoints(nextPoints: Pt[]): Promise<boolean> {
    return serializeRecordingMutation(async () => {
      const [storedSession, raw] = await Promise.all([
        options.storage.getItem(SESSION_KEY),
        options.storage.getItem(POINTS_KEY),
      ]);
      const parsed = parseStoredBlob(raw);
      if (
        !parsed ||
        parsed.kind !== 'current' ||
        parsed.blob.completed ||
        storedSession !== parsed.blob.session ||
        !parsed.blob.locationLease?.appendEnabled ||
        !leaseMatchesRecording(parsed.blob.locationLease, parsed.blob)
      ) {
        return false;
      }
      await options.storage.setItem(
        POINTS_KEY,
        JSON.stringify({
          ...parsed.blob,
          points: [...parsed.blob.points, ...nextPoints],
        }),
      );
      return true;
    });
  }

  function clear(activityId?: string): Promise<void> {
    return serializeRecordingMutation(async () => {
      if (activityId) {
        const raw = await options.storage.getItem(POINTS_KEY);
        const parsed = parseStoredBlob(raw);
        if (
          parsed?.kind === 'current' &&
          parsed.blob.activityId !== activityId
        ) {
          throw new Error('Recorded activity identity does not match raw GPS');
        }
      }

      await options.storage.removeItem(SESSION_KEY);
      await options.storage.removeItem(POINTS_KEY);
    });
  }

  return {
    begin,
    claimLegacy,
    recover,
    appendPoints,
    appendTaskPoints,
    acquireTaskLease,
    recordingIdentityIsCurrent,
    suspendTaskLeaseFor,
    taskLeaseIsCurrent,
    readActiveTaskLease,
    readRecording,
    readPoints,
    persistCompleted,
    readPendingCompleted,
    clear,
  };
}

const defaultRecordingStore = createLocationRecordingStore({
  storage: AsyncStorage,
});

// The task runs in a separate context (including background), so it shares the
// versioned blob with the UI. A stale session is ignored, never resurrected.
if (Platform.OS !== 'web') {
  TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
    if (error) return;
    const locations = data?.locations ?? [];
    if (locations.length === 0) return;
    try {
      await defaultRecordingStore.appendTaskPoints(locations.map(locationPoint));
    } catch {
      // Best effort: a dropped sample is preferable to corrupting identity.
    }
  });
}

const LOCATION_UPDATE_OPTIONS = {
  accuracy: Location.Accuracy.High,
  distanceInterval: 5,
  pausesUpdatesAutomatically: false,
  showsBackgroundLocationIndicator: true,
  foregroundService: {
    notificationTitle: 'Tracking your activity',
    notificationBody: 'Recording distance & pace — tap to return.',
    notificationColor: '#6F9F00',
  },
} satisfies Location.LocationTaskOptions;

export type LocationTaskRuntime = {
  hasStarted(): Promise<boolean>;
  getForegroundPermission(): Promise<{ granted: boolean }>;
  getBackgroundPermission(): Promise<{ granted: boolean }>;
  start(): Promise<void>;
};

export type LocationTaskLeaseRuntime = LocationTaskRuntime & {
  stop(): Promise<void>;
};

type LocationTaskLifecycleOptions = {
  storage: LocationRecordingStorage;
  runtime: LocationTaskLeaseRuntime;
  createLeaseId: () => string;
};

export type TrackLocationTaskStatus =
  | 'running'
  | 'restarted'
  | 'paused'
  | 'stale';

export type PauseTrackLocationTaskStatus =
  | 'paused'
  | 'already_paused'
  | 'stale';

export function createLocationTaskLifecycle(
  options: LocationTaskLifecycleOptions,
) {
  const store = createLocationRecordingStore({ storage: options.storage });
  let taskMutationTail: Promise<void> = Promise.resolve();
  const identityIntents = new Map<string, number>();

  function issueIdentityIntent(identity: TrackRecordingIdentity): number {
    const key = recordingIdentityKey(identity);
    const intent = (identityIntents.get(key) ?? 0) + 1;
    identityIntents.set(key, intent);
    return intent;
  }

  function identityIntentIsCurrent(
    identity: TrackRecordingIdentity,
    intent: number,
  ): boolean {
    return identityIntents.get(recordingIdentityKey(identity)) === intent;
  }

  function serializeTaskMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = taskMutationTail.then(operation, operation);
    taskMutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function stopIfLeaseStillPaused(
    lease: LocationTaskLease | null,
  ): Promise<void> {
    if (!lease || !(await store.taskLeaseIsCurrent(lease, false))) return;
    let started = false;
    try {
      started = await options.runtime.hasStarted();
    } catch {
      return;
    }
    if (!started) return;
    if (!(await store.taskLeaseIsCurrent(lease, false))) return;
    try {
      await options.runtime.stop();
    } catch {
      // Appends are already suspended in durable storage.
      return;
    }
    if (!(await store.taskLeaseIsCurrent(lease, false))) {
      await restartCurrentLeaseIfNeeded();
    }
  }

  async function restartCurrentLeaseIfNeeded(): Promise<void> {
    const activeLease = await store.readActiveTaskLease();
    if (!activeLease) return;
    if (!(await store.taskLeaseIsCurrent(activeLease, true))) return;

    let started: boolean;
    try {
      started = await options.runtime.hasStarted();
    } catch {
      return;
    }
    if (!(await store.taskLeaseIsCurrent(activeLease, true)) || started) return;
    if (!(await store.taskLeaseIsCurrent(activeLease, true))) return;
    try {
      await options.runtime.start();
    } catch {
      return;
    }
    await store.taskLeaseIsCurrent(activeLease, true);
  }

  async function pauseAfterReconciliationFailure(
    identity: TrackRecordingIdentity,
  ): Promise<'paused'> {
    const suspended = await store.suspendTaskLeaseFor(identity);
    if (suspended.kind !== 'stale') {
      await stopIfLeaseStillPaused(suspended.lease);
    }
    return 'paused';
  }

  async function startForUnlocked(
    identity: TrackRecordingIdentity,
    intent: number,
  ): Promise<TrackLocationTaskStatus> {
    if (!identityIntentIsCurrent(identity, intent)) return 'stale';
    const lease = await store.acquireTaskLease(
      identity,
      options.createLeaseId(),
    );
    if (!lease) return 'stale';
    if (!identityIntentIsCurrent(identity, intent)) {
      await store.suspendTaskLeaseFor(identity);
      return 'stale';
    }
    if (!(await store.taskLeaseIsCurrent(lease, true))) return 'stale';

    let started: boolean;
    try {
      started = await options.runtime.hasStarted();
    } catch {
      await store.suspendTaskLeaseFor(identity);
      return 'paused';
    }
    if (!identityIntentIsCurrent(identity, intent)) return 'stale';
    if (!(await store.taskLeaseIsCurrent(lease, true))) {
      return 'stale';
    }
    if (started) return 'running';

    if (!(await store.taskLeaseIsCurrent(lease, true))) return 'stale';
    try {
      await options.runtime.start();
    } catch {
      const suspended = await store.suspendTaskLeaseFor(identity);
      await stopIfLeaseStillPaused(
        suspended.kind === 'stale' ? null : suspended.lease,
      );
      return 'paused';
    }
    if (!identityIntentIsCurrent(identity, intent)) return 'stale';
    if (!(await store.taskLeaseIsCurrent(lease, true))) {
      return 'stale';
    }
    return 'restarted';
  }

  function startFor(
    identity: TrackRecordingIdentity,
  ): Promise<TrackLocationTaskStatus> {
    const intent = issueIdentityIntent(identity);
    return serializeTaskMutation(() => startForUnlocked(identity, intent));
  }

  function ensureFor(
    identity: TrackRecordingIdentity,
  ): Promise<TrackLocationTaskStatus> {
    const intent = issueIdentityIntent(identity);
    return serializeTaskMutation(async () => {
      if (!identityIntentIsCurrent(identity, intent)) return 'stale';
      if (!(await store.recordingIdentityIsCurrent(identity))) return 'stale';
      let foreground: { granted: boolean };
      try {
        foreground = await options.runtime.getForegroundPermission();
      } catch {
        return pauseAfterReconciliationFailure(identity);
      }
      if (!identityIntentIsCurrent(identity, intent)) return 'stale';
      if (!(await store.recordingIdentityIsCurrent(identity))) return 'stale';

      let background: { granted: boolean };
      try {
        background = await options.runtime.getBackgroundPermission();
      } catch {
        return pauseAfterReconciliationFailure(identity);
      }
      if (!identityIntentIsCurrent(identity, intent)) return 'stale';
      if (!(await store.recordingIdentityIsCurrent(identity))) return 'stale';
      if (!foreground.granted || !background.granted) {
        const suspended = await store.suspendTaskLeaseFor(identity);
        if (suspended.kind !== 'stale') {
          await stopIfLeaseStillPaused(suspended.lease);
        }
        return 'paused';
      }
      return startForUnlocked(identity, intent);
    });
  }

  function pauseFor(
    identity: TrackRecordingIdentity,
  ): Promise<PauseTrackLocationTaskStatus> {
    issueIdentityIntent(identity);
    const suspension = store.suspendTaskLeaseFor(identity);
    return suspension.then((suspended) =>
      serializeTaskMutation(async () => {
        if (suspended.kind === 'stale') return 'stale';
        await stopIfLeaseStillPaused(suspended.lease);
        return suspended.kind === 'already_paused'
          ? 'already_paused'
          : 'paused';
      }),
    );
  }

  return {
    startFor,
    ensureFor,
    pauseFor,
  };
}

const defaultLocationTaskLifecycle = createLocationTaskLifecycle({
  storage: AsyncStorage,
  createLeaseId: secureCreateActivityId,
  runtime: {
    hasStarted: () =>
      Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME),
    getForegroundPermission: () => Location.getForegroundPermissionsAsync(),
    getBackgroundPermission: () => Location.getBackgroundPermissionsAsync(),
    start: () =>
      Location.startLocationUpdatesAsync(
        LOCATION_TASK_NAME,
        LOCATION_UPDATE_OPTIONS,
      ),
    stop: () => Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME),
  },
});

export async function startTrackLocationTaskFor(
  identity: TrackRecordingIdentity,
): Promise<TrackLocationTaskStatus> {
  if (Platform.OS === 'web') return 'paused';
  return defaultLocationTaskLifecycle.startFor(identity);
}

export async function ensureTrackLocationTaskFor(
  identity: TrackRecordingIdentity,
): Promise<TrackLocationTaskStatus> {
  if (Platform.OS === 'web') return 'paused';
  return defaultLocationTaskLifecycle.ensureFor(identity);
}

export async function pauseTrackLocationTaskFor(
  identity: TrackRecordingIdentity,
): Promise<PauseTrackLocationTaskStatus> {
  if (Platform.OS === 'web') return 'already_paused';
  return defaultLocationTaskLifecycle.pauseFor(identity);
}

export async function reconcileLocationTask(
  runtime: LocationTaskRuntime,
): Promise<'running' | 'restarted' | 'paused'> {
  try {
    if (await runtime.hasStarted()) return 'running';
    const [foreground, background] = await Promise.all([
      runtime.getForegroundPermission(),
      runtime.getBackgroundPermission(),
    ]);
    if (!foreground.granted || !background.granted) return 'paused';
    await runtime.start();
    return 'restarted';
  } catch {
    return 'paused';
  }
}

export async function ensureTrackLocationTask(): Promise<
  'running' | 'restarted' | 'paused'
> {
  if (Platform.OS === 'web') return 'paused';
  return reconcileLocationTask({
    hasStarted: () =>
      Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME),
    getForegroundPermission: () =>
      Location.getForegroundPermissionsAsync(),
    getBackgroundPermission: () =>
      Location.getBackgroundPermissionsAsync(),
    start: () =>
      Location.startLocationUpdatesAsync(
        LOCATION_TASK_NAME,
        LOCATION_UPDATE_OPTIONS,
      ),
  });
}

export async function startTrackLocationTask(): Promise<void> {
  await Location.startLocationUpdatesAsync(
    LOCATION_TASK_NAME,
    LOCATION_UPDATE_OPTIONS,
  );
}

export async function beginTrackRecording(
  ownerId: string,
  type: NewActivity['type'] = 'run',
): Promise<TrackRecordingIdentity> {
  return defaultRecordingStore.begin(ownerId, type);
}

export async function recoverTrackRecording(
  currentOwnerId: string | null,
  legacyType: NewActivity['type'] = 'run',
): Promise<TrackRecordingRecovery> {
  return defaultRecordingStore.recover(currentOwnerId, legacyType);
}

export async function claimLegacyTrackRecording(
  ownerId: string,
  type: NewActivity['type'] = 'run',
): Promise<TrackRecordingRecovery> {
  return defaultRecordingStore.claimLegacy(ownerId, type);
}

export async function readTrackRecording(
  legacyOwnerId?: string,
  legacyType: NewActivity['type'] = 'run',
): Promise<(TrackRecordingIdentity & { points: Pt[] }) | null> {
  return defaultRecordingStore.readRecording(legacyOwnerId, legacyType);
}

export async function persistCompletedTrackRecording(
  recording: PendingRecordedActivity,
): Promise<void> {
  return defaultRecordingStore.persistCompleted(recording);
}

export async function readPendingCompletedTrackRecording(): Promise<PendingRecordedActivity | null> {
  return defaultRecordingStore.readPendingCompleted();
}

export async function clearTrackRecording(activityId: string): Promise<void> {
  return defaultRecordingStore.clear(activityId);
}

/** Explicit discard/too-short cleanup. Never use for successful completion. */
export async function resetTrackPoints(): Promise<void> {
  return defaultRecordingStore.clear();
}

export async function readTrackPoints(): Promise<Pt[]> {
  return defaultRecordingStore.readPoints();
}

function identityOf(blob: RecordingBlob): TrackRecordingIdentity {
  return {
    activityId: blob.activityId,
    ownerId: blob.ownerId,
    startedAt: blob.startedAt,
  };
}

function parseStoredBlob(
  raw: string | null,
):
  | { kind: 'current'; blob: RecordingBlob }
  | { kind: 'legacy'; session: string; points: Pt[] }
  | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (Array.isArray(value)) {
      const points = value.filter(isPoint);
      return points.length === value.length
        ? { kind: 'legacy', session: '', points }
        : null;
    }
    if (!isRecord(value) || !Array.isArray(value.points)) return null;
    const points = value.points.filter(isPoint);
    if (points.length !== value.points.length) return null;

    if (
      value.schema === 2 &&
      typeof value.session === 'string' &&
      typeof value.activityId === 'string' &&
      typeof value.ownerId === 'string' &&
      typeof value.startedAt === 'string' &&
      (value.completed === null || isNewActivity(value.completed))
    ) {
      return {
        kind: 'current',
        blob: {
          schema: 2,
          session: value.session,
          activityId: value.activityId,
          ownerId: value.ownerId,
          startedAt: value.startedAt,
          type:
            value.type === 'run' ||
            value.type === 'walk' ||
            value.type === 'ride'
              ? value.type
              : value.completed && isNewActivity(value.completed)
                ? value.completed.type
                : 'run',
          points,
          completed: value.completed,
          locationLease: parseLocationTaskLease(value.locationLease),
        },
      };
    }

    if (typeof value.session === 'string') {
      return { kind: 'legacy', session: value.session, points };
    }
    return null;
  } catch {
    return null;
  }
}

function isNewActivity(value: unknown): value is NewActivity {
  return (
    isRecord(value) &&
    (value.type === 'run' || value.type === 'walk' || value.type === 'ride') &&
    typeof value.distance_m === 'number' &&
    Number.isFinite(value.distance_m) &&
    typeof value.duration_s === 'number' &&
    Number.isFinite(value.duration_s) &&
    Array.isArray(value.route) &&
    value.route.every(isPoint) &&
    typeof value.started_at === 'string'
  );
}

function isPoint(value: unknown): value is Pt {
  return (
    isRecord(value) &&
    typeof value.lat === 'number' &&
    Number.isFinite(value.lat) &&
    typeof value.lon === 'number' &&
    Number.isFinite(value.lon)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordingMatchesIdentity(
  blob: RecordingBlob,
  identity: TrackRecordingIdentity,
): boolean {
  return (
    blob.activityId === identity.activityId &&
    blob.ownerId === identity.ownerId &&
    blob.startedAt === identity.startedAt
  );
}

function recordingIdentityKey(identity: TrackRecordingIdentity): string {
  return `${identity.ownerId}\u0000${identity.activityId}\u0000${identity.startedAt}`;
}

function leaseMatchesRecording(
  lease: LocationTaskLease,
  blob: RecordingBlob,
): boolean {
  return (
    lease.session === blob.session &&
    lease.activityId === blob.activityId &&
    lease.ownerId === blob.ownerId &&
    lease.startedAt === blob.startedAt
  );
}

function parseLocationTaskLease(value: unknown): LocationTaskLease | null {
  if (!isRecord(value)) return null;
  if (
    value.schema !== 1 ||
    typeof value.id !== 'string' ||
    typeof value.session !== 'string' ||
    typeof value.activityId !== 'string' ||
    typeof value.ownerId !== 'string' ||
    typeof value.startedAt !== 'string' ||
    typeof value.appendEnabled !== 'boolean'
  ) {
    return null;
  }
  return {
    schema: 1,
    id: value.id,
    session: value.session,
    activityId: value.activityId,
    ownerId: value.ownerId,
    startedAt: value.startedAt,
    appendEnabled: value.appendEnabled,
  };
}

function locationPoint(location: any): Pt {
  return {
    lat: location.coords.latitude,
    lon: location.coords.longitude,
  };
}
