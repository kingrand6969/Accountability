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
const LOCATION_CHUNK_PREFIX = 'activity:location-chunk:';
let authoritativeMutationTail: Promise<void> = Promise.resolve();
let nativeTaskMutationTail: Promise<void> = Promise.resolve();

function serializeAuthoritativeMutation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const result = authoritativeMutationTail.then(operation, operation);
  authoritativeMutationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function serializeNativeTaskMutation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const result = nativeTaskMutationTail.then(operation, operation);
  nativeTaskMutationTail = result.then(
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
  activatedAt: number;
  revokedAt: number | null;
};

export type LocationTaskSample = Pt & { capturedAt: number };

type LocationTaskChunk = {
  schema: 1;
  id: string;
  leaseId: string;
  session: string;
  activityId: string;
  ownerId: string;
  samples: LocationTaskSample[];
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
  locationLeases: LocationTaskLease[];
  consumedLocationChunkIds: string[] | null;
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
  getAllKeys?(): Promise<readonly string[]>;
};

type LocationRecordingStoreOptions = {
  storage: LocationRecordingStorage;
  createActivityId: () => string;
  createSessionId: () => string;
  createChunkId: () => string;
  nowIso: () => string;
  nowMs: () => number;
};

type LocationRecordingStoreOverrides = Partial<LocationRecordingStoreOptions> &
  Pick<LocationRecordingStoreOptions, 'storage'>;

const defaultStoreOptions: LocationRecordingStoreOptions = {
  storage: AsyncStorage,
  createActivityId: secureCreateActivityId,
  createSessionId: () =>
    `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  createChunkId: secureCreateActivityId,
  nowIso: () => new Date().toISOString(),
  nowMs: () => Date.now(),
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
    return serializeAuthoritativeMutation(async () => {
      if (!ownerId.trim()) throw new Error('A signed-in owner is required');
      const [storedSession, storedPoints] = await Promise.all([
        options.storage.getItem(SESSION_KEY),
        options.storage.getItem(POINTS_KEY),
      ]);
      if (storedSession !== null || storedPoints !== null) {
        throw new Error('A saved recording already exists');
      }
      await cleanupAllJournalOrphans();
      const blob: RecordingBlob = {
        schema: 2,
        session: options.createSessionId(),
        activityId: options.createActivityId(),
        ownerId,
        startedAt: options.nowIso(),
        type,
        points: [],
        completed: null,
        locationLeases: [],
        consumedLocationChunkIds: [],
      };

      await options.storage.setItem(POINTS_KEY, JSON.stringify(blob));
      await options.storage.setItem(SESSION_KEY, blob.session);
      return identityOf(blob);
    });
  }

  async function readRecording(
    requestedOwnerId?: string,
    _legacyType: NewActivity['type'] = 'run',
  ): Promise<(TrackRecordingIdentity & { points: Pt[] }) | null> {
    const [storedSession, raw] = await Promise.all([
      options.storage.getItem(SESSION_KEY),
      options.storage.getItem(POINTS_KEY),
    ]);
    const parsed = parseStoredBlob(raw);
    if (!parsed) return null;

    if (
      parsed.kind === 'current' &&
      storedSession === parsed.blob.session &&
      (!requestedOwnerId || parsed.blob.ownerId === requestedOwnerId)
    ) {
      return {
        ...identityOf(parsed.blob),
        points: await mergedPointsFor(parsed.blob),
      };
    }
    return null;
  }

  function recover(
    currentOwnerId: string | null,
    legacyType: NewActivity['type'] = 'run',
  ): Promise<TrackRecordingRecovery> {
    return serializeAuthoritativeMutation(async () => {
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
        const points = await mergedPointsFor(parsed.blob);
        return {
          kind: 'completed',
          recording: {
            activityId: parsed.blob.activityId,
            ownerId: parsed.blob.ownerId,
            activity: { ...parsed.blob.completed, route: points },
          },
        };
      }
      return {
        kind: 'active',
        ...identityOf(parsed.blob),
        type: parsed.blob.type,
        points: await mergedPointsFor(parsed.blob),
      };
    });
  }

  function claimLegacy(
    ownerId: string,
    type: NewActivity['type'] = 'run',
  ): Promise<TrackRecordingRecovery> {
    return serializeAuthoritativeMutation(async () => {
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
                activity: {
                  ...parsed.blob.completed,
                  route: await mergedPointsFor(parsed.blob),
                },
              },
            }
          : {
              kind: 'active',
              ...identityOf(parsed.blob),
              type: parsed.blob.type,
              points: await mergedPointsFor(parsed.blob),
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
        locationLeases: [],
        consumedLocationChunkIds: [],
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
      return parsed.blob.session === session
        ? mergedPointsFor(parsed.blob)
        : [];
    }
    return !parsed.session || parsed.session === session ? parsed.points : [];
  }

  function persistCompleted(
    recording: PendingRecordedActivity,
  ): Promise<void> {
    return serializeAuthoritativeMutation(async () => {
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

      const merged = await mergedPointsAndChunkIdsFor(parsed.blob);
      const mergedPoints = merged.points;
      const points = parsed.blob.locationLeases.length > 0
        ? mergedPoints
        : mergedPoints.length > 0
          ? mergedPoints
          : recording.activity.route;
      const activity = { ...recording.activity, route: points };

      const completed: RecordingBlob = {
        ...parsed.blob,
        type: activity.type,
        points,
        completed: activity,
        consumedLocationChunkIds: [
          ...(parsed.blob.consumedLocationChunkIds ?? []),
          ...merged.chunkIds,
        ],
      };
      await options.storage.setItem(POINTS_KEY, JSON.stringify(completed));
      await cleanupJournalFor(parsed.blob);
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
    const points = await mergedPointsFor(parsed.blob);
    return {
      activityId: parsed.blob.activityId,
      ownerId: parsed.blob.ownerId,
      activity: { ...parsed.blob.completed, route: points },
    };
  }

  function appendPoints(session: string, nextPoints: Pt[]): Promise<void> {
    return serializeAuthoritativeMutation(async () => {
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
    activatedAt = options.nowMs(),
  ): Promise<LocationTaskLease | null> {
    return serializeAuthoritativeMutation(async () => {
      requireJournalEnumeration(options.storage);
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

      const current = activeLeaseOf(parsed.blob);
      if (current) return current;

      const lease: LocationTaskLease = {
        schema: 1,
        id: leaseId,
        session: parsed.blob.session,
        activityId: parsed.blob.activityId,
        ownerId: parsed.blob.ownerId,
        startedAt: parsed.blob.startedAt,
        activatedAt,
        revokedAt: null,
      };
      await options.storage.setItem(
        POINTS_KEY,
        JSON.stringify({
          ...parsed.blob,
          locationLeases: [...parsed.blob.locationLeases, lease],
        }),
      );
      return lease;
    });
  }

  function recordingIdentityIsCurrent(
    identity: TrackRecordingIdentity,
  ): Promise<boolean> {
    return serializeAuthoritativeMutation(async () => {
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
    revokedAt = options.nowMs(),
  ): Promise<
    | { kind: 'stale' }
    | { kind: 'already_paused'; lease: LocationTaskLease | null }
    | { kind: 'suspended'; lease: LocationTaskLease }
  > {
    return serializeAuthoritativeMutation(async () => {
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

      const current = activeLeaseOf(parsed.blob);
      if (!current) {
        const latest = latestLeaseOf(parsed.blob);
        return {
          kind: 'already_paused',
          lease: latest?.revokedAt !== null ? latest : null,
        };
      }

      const lease = { ...current, revokedAt };
      await options.storage.setItem(
        POINTS_KEY,
        JSON.stringify({
          ...parsed.blob,
          locationLeases: parsed.blob.locationLeases.map((candidate) =>
            candidate.id === lease.id ? lease : candidate,
          ),
        }),
      );
      return { kind: 'suspended', lease };
    });
  }

  function taskLeaseIsCurrent(
    lease: LocationTaskLease,
    active: boolean,
  ): Promise<boolean> {
    return serializeAuthoritativeMutation(async () => {
      const [storedSession, raw] = await Promise.all([
        options.storage.getItem(SESSION_KEY),
        options.storage.getItem(POINTS_KEY),
      ]);
      const parsed = parseStoredBlob(raw);
      if (
        parsed?.kind !== 'current' ||
        parsed.blob.completed ||
        storedSession !== parsed.blob.session
      ) {
        return false;
      }
      const storedLease = parsed.blob.locationLeases.find(
        (candidate) => candidate.id === lease.id,
      );
      const latestLease = [...parsed.blob.locationLeases]
        .reverse()
        .find((candidate) => leaseMatchesRecording(candidate, parsed.blob));
      const activeLease = activeLeaseOf(parsed.blob);
      return Boolean(
        storedLease &&
          leaseMatchesRecording(storedLease, parsed.blob) &&
          latestLease?.id === storedLease.id &&
          (active
            ? activeLease?.id === storedLease.id
            : activeLease === null && storedLease.revokedAt !== null),
      );
    });
  }

  function readActiveTaskLease(): Promise<LocationTaskLease | null> {
    return serializeAuthoritativeMutation(async () => {
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
        !activeLeaseOf(parsed.blob)
      ) {
        return null;
      }
      return activeLeaseOf(parsed.blob);
    });
  }

  async function appendTaskSamples(
    samples: LocationTaskSample[],
  ): Promise<boolean> {
    requireJournalEnumeration(options.storage);
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
      !activeLeaseOf(parsed.blob)
    ) {
      return false;
    }
    const lease = activeLeaseOf(parsed.blob)!;
    const validSamples = samples.filter(isLocationTaskSample);
    if (validSamples.length === 0) return false;
    const chunkId = options.createChunkId();
    const chunk: LocationTaskChunk = {
      schema: 1,
      id: chunkId,
      leaseId: lease.id,
      session: lease.session,
      activityId: lease.activityId,
      ownerId: lease.ownerId,
      samples: validSamples,
    };
    await options.storage.setItem(
      locationChunkKey(lease.id, chunkId),
      JSON.stringify(chunk),
    );
    return true;
  }

  function appendTaskPoints(nextPoints: Pt[]): Promise<boolean> {
    const capturedAt = options.nowMs();
    return appendTaskSamples(
      nextPoints.map((point) => ({ ...point, capturedAt })),
    );
  }

  async function mergedPointsFor(blob: RecordingBlob): Promise<Pt[]> {
    return (await mergedPointsAndChunkIdsFor(blob)).points;
  }

  async function mergedPointsAndChunkIdsFor(
    blob: RecordingBlob,
  ): Promise<{ points: Pt[]; chunkIds: string[] }> {
    if (
      blob.locationLeases.length === 0 ||
      (blob.completed && blob.consumedLocationChunkIds === null)
    ) {
      return { points: blob.points, chunkIds: [] };
    }
    requireJournalEnumeration(options.storage);
    const leaseById = new Map(
      blob.locationLeases
        .filter((lease) => leaseMatchesRecording(lease, blob))
        .map((lease) => [lease.id, lease] as const),
    );
    const keys = (await options.storage.getAllKeys()).filter((key) =>
      [...leaseById.keys()].some((leaseId) =>
        key.startsWith(`${LOCATION_CHUNK_PREFIX}${leaseId}:`),
      ),
    );
    const chunks = await Promise.all(
      keys.map(async (key) => parseLocationTaskChunk(
        await options.storage.getItem(key),
      )),
    );
    const consumedChunkIds = new Set(
      blob.consumedLocationChunkIds ?? [],
    );
    const includedChunkIds: string[] = [];
    const seenChunkIds = new Set<string>();
    const journalSamples = chunks.flatMap((chunk) => {
      if (
        !chunk ||
        consumedChunkIds.has(chunk.id) ||
        seenChunkIds.has(chunk.id) ||
        chunk.session !== blob.session ||
        chunk.activityId !== blob.activityId ||
        chunk.ownerId !== blob.ownerId
      ) {
        return [];
      }
      const lease = leaseById.get(chunk.leaseId);
      if (!lease) return [];
      seenChunkIds.add(chunk.id);
      includedChunkIds.push(chunk.id);
      return chunk.samples.filter((sample) =>
        sample.capturedAt >= lease.activatedAt &&
        (lease.revokedAt === null || sample.capturedAt <= lease.revokedAt),
      );
    });
    journalSamples.sort((left, right) => left.capturedAt - right.capturedAt);
    return {
      points: [
        ...blob.points,
        ...journalSamples.map(({ lat, lon }) => ({ lat, lon })),
      ],
      chunkIds: includedChunkIds,
    };
  }

  async function cleanupJournalFor(blob: RecordingBlob): Promise<void> {
    if (!options.storage.getAllKeys) return;
    try {
      const leaseIds = new Set(blob.locationLeases.map((lease) => lease.id));
      const keys = (await options.storage.getAllKeys()).filter((key) =>
        [...leaseIds].some((leaseId) =>
          key.startsWith(`${LOCATION_CHUNK_PREFIX}${leaseId}:`),
        ),
      );
      await Promise.allSettled(
        keys.map((key) => options.storage.removeItem(key)),
      );
    } catch {
      // Authoritative completion/clear is already durable; orphan chunks are inert.
    }
  }

  async function cleanupAllJournalOrphans(): Promise<void> {
    if (!options.storage.getAllKeys) return;
    try {
      const keys = (await options.storage.getAllKeys()).filter((key) =>
        key.startsWith(LOCATION_CHUNK_PREFIX),
      );
      await Promise.allSettled(
        keys.map((key) => options.storage.removeItem(key)),
      );
    } catch {
      // Orphans never participate without an exact authoritative lease.
    }
  }

  function clear(activityId?: string): Promise<void> {
    return serializeAuthoritativeMutation(async () => {
      let recordingToClean: RecordingBlob | null = null;
      if (activityId) {
        const raw = await options.storage.getItem(POINTS_KEY);
        const parsed = parseStoredBlob(raw);
        if (
          parsed?.kind === 'current' &&
          parsed.blob.activityId !== activityId
        ) {
          throw new Error('Recorded activity identity does not match raw GPS');
        }
        recordingToClean = parsed?.kind === 'current' ? parsed.blob : null;
      }

      await options.storage.removeItem(SESSION_KEY);
      await options.storage.removeItem(POINTS_KEY);
      if (recordingToClean) await cleanupJournalFor(recordingToClean);
    });
  }

  return {
    begin,
    claimLegacy,
    recover,
    appendPoints,
    appendTaskPoints,
    appendTaskSamples,
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
      await defaultRecordingStore.appendTaskSamples(locations.map(locationPoint));
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
  nowMs?: () => number;
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
  const store = createLocationRecordingStore({
    storage: options.storage,
    ...(options.nowMs ? { nowMs: options.nowMs } : {}),
  });
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

  async function stopIfLeaseStillPaused(
    lease: LocationTaskLease | null,
  ): Promise<void> {
    if (!lease || !(await store.taskLeaseIsCurrent(lease, false))) return;
    let started = false;
    try {
      started = await options.runtime.hasStarted();
    } catch {
      // The exact lease is durably paused; unknown native state is treated as
      // potentially running so privacy does not depend on a status lookup.
      started = true;
    }
    if (!started) return;
    if (!(await store.taskLeaseIsCurrent(lease, false))) return;
    try {
      await options.runtime.stop();
    } catch (error) {
      if (!(await store.taskLeaseIsCurrent(lease, false))) {
        await restartCurrentLeaseIfNeeded();
        return;
      }
      let stillStarted = true;
      try {
        stillStarted = await options.runtime.hasStarted();
      } catch {
        // Unknown native state must remain retryable.
      }
      if (stillStarted) throw error;
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
    intent: number,
  ): Promise<'paused' | 'stale'> {
    if (!identityIntentIsCurrent(identity, intent)) return 'stale';
    if (!(await store.recordingIdentityIsCurrent(identity))) return 'stale';
    if (!identityIntentIsCurrent(identity, intent)) return 'stale';
    const suspended = await store.suspendTaskLeaseFor(identity);
    if (suspended.kind === 'stale') return 'stale';
    await stopIfLeaseStillPaused(suspended.lease);
    return 'paused';
  }

  async function startForUnlocked(
    identity: TrackRecordingIdentity,
    intent: number,
    preparedLease?: LocationTaskLease,
  ): Promise<TrackLocationTaskStatus> {
    if (!identityIntentIsCurrent(identity, intent)) return 'stale';
    const lease = preparedLease ?? await store.acquireTaskLease(
      identity,
      options.createLeaseId(),
    );
    if (!lease) return 'stale';
    if (!identityIntentIsCurrent(identity, intent)) return 'stale';
    if (!(await store.taskLeaseIsCurrent(lease, true))) return 'stale';

    let started: boolean;
    try {
      started = await options.runtime.hasStarted();
    } catch {
      if (
        !identityIntentIsCurrent(identity, intent) ||
        !(await store.recordingIdentityIsCurrent(identity)) ||
        !(await store.taskLeaseIsCurrent(lease, true))
      ) {
        await restartCurrentLeaseIfNeeded();
        return 'stale';
      }
      if (!identityIntentIsCurrent(identity, intent)) return 'stale';
      const suspended = await store.suspendTaskLeaseFor(identity);
      if (suspended.kind === 'stale') return 'stale';
      await stopIfLeaseStillPaused(suspended.lease);
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
      if (
        !identityIntentIsCurrent(identity, intent) ||
        !(await store.recordingIdentityIsCurrent(identity)) ||
        !(await store.taskLeaseIsCurrent(lease, true))
      ) {
        await restartCurrentLeaseIfNeeded();
        return 'stale';
      }
      if (!identityIntentIsCurrent(identity, intent)) return 'stale';
      const suspended = await store.suspendTaskLeaseFor(identity);
      if (suspended.kind === 'stale') return 'stale';
      await stopIfLeaseStillPaused(suspended.lease);
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
    const lease = store.acquireTaskLease(identity, options.createLeaseId());
    return lease.then((preparedLease) => {
      if (!preparedLease) return 'stale';
      return serializeNativeTaskMutation(() =>
        startForUnlocked(identity, intent, preparedLease),
      );
    });
  }

  function ensureFor(
    identity: TrackRecordingIdentity,
  ): Promise<TrackLocationTaskStatus> {
    const intent = issueIdentityIntent(identity);
    return serializeNativeTaskMutation(async () => {
      if (!identityIntentIsCurrent(identity, intent)) return 'stale';
      if (!(await store.recordingIdentityIsCurrent(identity))) return 'stale';
      let foreground: { granted: boolean };
      try {
        foreground = await options.runtime.getForegroundPermission();
      } catch {
        return pauseAfterReconciliationFailure(identity, intent);
      }
      if (!identityIntentIsCurrent(identity, intent)) return 'stale';
      if (!(await store.recordingIdentityIsCurrent(identity))) return 'stale';

      let background: { granted: boolean };
      try {
        background = await options.runtime.getBackgroundPermission();
      } catch {
        return pauseAfterReconciliationFailure(identity, intent);
      }
      if (!identityIntentIsCurrent(identity, intent)) return 'stale';
      if (!(await store.recordingIdentityIsCurrent(identity))) return 'stale';
      if (!foreground.granted || !background.granted) {
        if (!identityIntentIsCurrent(identity, intent)) return 'stale';
        const suspended = await store.suspendTaskLeaseFor(identity);
        if (suspended.kind === 'stale') return 'stale';
        await stopIfLeaseStillPaused(suspended.lease);
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
      serializeNativeTaskMutation(async () => {
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
  } catch {
    // Identity-less callers may observe, but never activate, native tracking.
  }
  return 'paused';
}

export async function ensureTrackLocationTask(): Promise<
  'running' | 'restarted' | 'paused'
> {
  return 'paused';
}

export async function startTrackLocationTask(): Promise<void> {
  throw new Error('Owner-bound recording identity required');
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
          locationLeases: parseLocationTaskLeases(
            value.locationLeases,
            value.locationLease,
            value.startedAt,
          ),
          consumedLocationChunkIds: parseConsumedLocationChunkIds(
            value.consumedLocationChunkIds,
            value.completed !== null,
          ),
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

function activeLeaseOf(blob: RecordingBlob): LocationTaskLease | null {
  for (let index = blob.locationLeases.length - 1; index >= 0; index -= 1) {
    const lease = blob.locationLeases[index];
    if (lease.revokedAt === null && leaseMatchesRecording(lease, blob)) {
      return lease;
    }
  }
  return null;
}

function latestLeaseOf(blob: RecordingBlob): LocationTaskLease | null {
  for (let index = blob.locationLeases.length - 1; index >= 0; index -= 1) {
    const lease = blob.locationLeases[index];
    if (leaseMatchesRecording(lease, blob)) return lease;
  }
  return null;
}

function parseLocationTaskLeases(
  value: unknown,
  legacyValue: unknown,
  startedAt: string,
): LocationTaskLease[] {
  if (Array.isArray(value)) {
    return value
      .map(parseLocationTaskLease)
      .filter((lease): lease is LocationTaskLease => lease !== null);
  }
  if (!isRecord(legacyValue)) return [];
  const legacyActivatedAt = Date.parse(startedAt);
  if (
    legacyValue.schema !== 1 ||
    typeof legacyValue.id !== 'string' ||
    typeof legacyValue.session !== 'string' ||
    typeof legacyValue.activityId !== 'string' ||
    typeof legacyValue.ownerId !== 'string' ||
    typeof legacyValue.startedAt !== 'string' ||
    typeof legacyValue.appendEnabled !== 'boolean'
  ) {
    return [];
  }
  return [{
    schema: 1,
    id: legacyValue.id,
    session: legacyValue.session,
    activityId: legacyValue.activityId,
    ownerId: legacyValue.ownerId,
    startedAt: legacyValue.startedAt,
    activatedAt: Number.isFinite(legacyActivatedAt) ? legacyActivatedAt : 0,
    revokedAt: legacyValue.appendEnabled ? null : 0,
  }];
}

function parseConsumedLocationChunkIds(
  value: unknown,
  completed: boolean,
): string[] | null {
  if (
    Array.isArray(value) &&
    value.every((chunkId) => typeof chunkId === 'string')
  ) {
    return [...new Set(value)];
  }
  return completed ? null : [];
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
    typeof value.activatedAt !== 'number' ||
    !Number.isFinite(value.activatedAt) ||
    !(
      value.revokedAt === null ||
      (typeof value.revokedAt === 'number' && Number.isFinite(value.revokedAt))
    )
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
    activatedAt: value.activatedAt,
    revokedAt: value.revokedAt as number | null,
  };
}

function isLocationTaskSample(value: unknown): value is LocationTaskSample {
  if (!isRecord(value) || !isPoint(value)) return false;
  const capturedAt: unknown = (value as Record<string, unknown>).capturedAt;
  return typeof capturedAt === 'number' && Number.isFinite(capturedAt);
}

function parseLocationTaskChunk(raw: string | null): LocationTaskChunk | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.schema !== 1 ||
      typeof value.id !== 'string' ||
      typeof value.leaseId !== 'string' ||
      typeof value.session !== 'string' ||
      typeof value.activityId !== 'string' ||
      typeof value.ownerId !== 'string' ||
      !Array.isArray(value.samples) ||
      !value.samples.every(isLocationTaskSample)
    ) {
      return null;
    }
    return {
      schema: 1,
      id: value.id,
      leaseId: value.leaseId,
      session: value.session,
      activityId: value.activityId,
      ownerId: value.ownerId,
      samples: value.samples,
    };
  } catch {
    return null;
  }
}

function locationChunkKey(leaseId: string, chunkId: string): string {
  return `${LOCATION_CHUNK_PREFIX}${leaseId}:${chunkId}`;
}

function requireJournalEnumeration(
  storage: LocationRecordingStorage,
): asserts storage is LocationRecordingStorage & {
  getAllKeys(): Promise<readonly string[]>;
} {
  if (!storage.getAllKeys) {
    throw new Error('Location journal enumeration is unavailable');
  }
}

function locationPoint(location: any): LocationTaskSample {
  return {
    lat: location.coords.latitude,
    lon: location.coords.longitude,
    capturedAt:
      typeof location.timestamp === 'number' && Number.isFinite(location.timestamp)
        ? location.timestamp
        : Date.now(),
  };
}
