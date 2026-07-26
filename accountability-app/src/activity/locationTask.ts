import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NewActivity } from './api';
import type { Pt } from './geo';
import { createActivityId as secureCreateActivityId } from './offlineQueueTypes';
import type { PendingRecordedActivity } from './runCompletion';

export const LOCATION_TASK_NAME = 'accountability-location-task';
const POINTS_KEY = 'activity:points';
const SESSION_KEY = 'activity:session';

type LegacyPointsBlob = { session: string; points: Pt[] };

type RecordingBlob = {
  schema: 2;
  session: string;
  activityId: string;
  ownerId: string;
  startedAt: string;
  type: NewActivity['type'];
  points: Pt[];
  completed: NewActivity | null;
};

export type TrackRecordingIdentity = Pick<
  RecordingBlob,
  'activityId' | 'ownerId' | 'startedAt'
>;

export type TrackRecordingRecovery =
  | { kind: 'none' }
  | { kind: 'needs_owner' }
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

  async function begin(
    ownerId: string,
    type: NewActivity['type'] = 'run',
  ): Promise<TrackRecordingIdentity> {
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
    };

    // Persist identity before exposing the active session to the background
    // task. A partial write can therefore never collect ownerless points.
    await options.storage.setItem(POINTS_KEY, JSON.stringify(blob));
    await options.storage.setItem(SESSION_KEY, blob.session);
    return identityOf(blob);
  }

  async function readRecording(
    legacyOwnerId?: string,
    legacyType: NewActivity['type'] = 'run',
  ): Promise<(TrackRecordingIdentity & { points: Pt[] }) | null> {
    const [session, raw] = await Promise.all([
      options.storage.getItem(SESSION_KEY),
      options.storage.getItem(POINTS_KEY),
    ]);
    const parsed = parseStoredBlob(raw);
    if (!parsed) return null;

    if (parsed.kind === 'current') {
      return { ...identityOf(parsed.blob), points: parsed.blob.points };
    }

    if (
      (session && parsed.session && parsed.session !== session) ||
      !legacyOwnerId?.trim()
    ) {
      return null;
    }
    const migratedSession =
      parsed.session || session || options.createSessionId();
    const migrated: RecordingBlob = {
      schema: 2,
      session: migratedSession,
      activityId: options.createActivityId(),
      ownerId: legacyOwnerId,
      startedAt: options.nowIso(),
      type: legacyType,
      points: parsed.points,
      completed: null,
    };
    await options.storage.setItem(POINTS_KEY, JSON.stringify(migrated));
    if (session !== migratedSession) {
      await options.storage.setItem(SESSION_KEY, migratedSession);
    }
    return { ...identityOf(migrated), points: migrated.points };
  }

  async function recover(
    currentOwnerId: string | null,
    legacyType: NewActivity['type'] = 'run',
  ): Promise<TrackRecordingRecovery> {
    const raw = await options.storage.getItem(POINTS_KEY);
    const parsed = parseStoredBlob(raw);
    if (!parsed) return { kind: 'none' };

    if (parsed.kind === 'legacy') {
      if (!currentOwnerId) return { kind: 'needs_owner' };
      const migrated = await readRecording(currentOwnerId, legacyType);
      if (!migrated) return { kind: 'none' };
      return {
        kind: 'active',
        ...migrated,
        type: legacyType,
      };
    }

    // Persist the normalized schema (including `type`) before returning it.
    await options.storage.setItem(POINTS_KEY, JSON.stringify(parsed.blob));
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

  async function persistCompleted(
    recording: PendingRecordedActivity,
  ): Promise<void> {
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

  async function clear(activityId?: string): Promise<void> {
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

    // Stop task writes first. If either removal fails, the raw blob remains
    // available for recovery and an idempotent retry with the same ID.
    await options.storage.removeItem(SESSION_KEY);
    await options.storage.removeItem(POINTS_KEY);
  }

  return {
    begin,
    recover,
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
      const session = await AsyncStorage.getItem(SESSION_KEY);
      if (!session) return;
      const raw = await AsyncStorage.getItem(POINTS_KEY);
      const parsed = parseStoredBlob(raw);
      if (!parsed) return;

      if (parsed.kind === 'current') {
        if (parsed.blob.session !== session || parsed.blob.completed) return;
        const points = [
          ...parsed.blob.points,
          ...locations.map(locationPoint),
        ];
        await AsyncStorage.setItem(
          POINTS_KEY,
          JSON.stringify({ ...parsed.blob, points }),
        );
        return;
      }

      if (parsed.session && parsed.session !== session) return;
      const legacy: LegacyPointsBlob = {
        session,
        points: [...parsed.points, ...locations.map(locationPoint)],
      };
      await AsyncStorage.setItem(POINTS_KEY, JSON.stringify(legacy));
    } catch {
      // Best effort: a dropped sample is preferable to corrupting identity.
    }
  });
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

function locationPoint(location: any): Pt {
  return {
    lat: location.coords.latitude,
    lon: location.coords.longitude,
  };
}
