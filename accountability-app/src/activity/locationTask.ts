import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NewActivity } from './api';
import { totalDistanceMeters, type Pt } from './geo';
import { createActivityId as secureCreateActivityId } from './offlineQueueTypes';
import type { PendingRecordedActivity } from './runCompletion';

export const LOCATION_TASK_NAME = 'accountability-location-task';
const POINTS_KEY = 'activity:points';
const SESSION_KEY = 'activity:session';
const LOCATION_BATCH_PREFIX = 'activity:location-batch:v1:';
const LOCATION_CLEANUP_PREFIX = 'activity:location-cleanup:v1:';
const MAX_LOCATION_BATCH_SAMPLES = 512;
const MAX_LOCATION_BATCH_BYTES = 256 * 1024;
const MAX_LOCATION_FUTURE_DRIFT_MS = 5 * 60 * 1000;
let authoritativeMutationTail: Promise<void> = Promise.resolve();
let nativeTaskMutationTail: Promise<void> = Promise.resolve();
// Expo provides task unregistration, not a cross-runtime callback drain barrier.
// This counter closes the same-runtime race; immutable WAL writes plus repeated
// stable scans/preflight make other-runtime late batches inert until a retry.
let locationTaskWritesInFlight = 0;
let locationTaskIntentClock = 0;
const locationTaskIdentityIntents = new Map<string, number>();
const finalizationFlights = new Map<
  string,
  Promise<FinalizeTrackRecordingResult>
>();

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
  ordinal: number;
  session: string;
  activityId: string;
  ownerId: string;
  startedAt: string;
  activatedAt: number;
  revokedAtExclusive: number | null;
};

export type LocationTaskSample = Pt & { capturedAt: number };

type LocationTaskBatch = {
  schema: 1;
  batchId: string;
  receivedAt: number;
  samples: LocationTaskSample[];
};

type ConsumedJournalEntry = {
  key: string;
  batchFingerprint: string;
};

type ExactCleanupReceipt = {
  schema: 1;
  snapshotId: string;
  entries: ConsumedJournalEntry[];
};

type JournalSnapshot = {
  journalFingerprint: string;
  route: Pt[];
  sampleFingerprints: string[];
  consumedJournalEntries: ConsumedJournalEntry[];
};

type RecordingTerminal = {
  phase: 'closing' | 'sealed';
  finishId: string;
  snapshotId: string;
  cutoffExclusive: number;
  summary: {
    type: NewActivity['type'];
    durationS: number;
  };
  candidate: JournalSnapshot | null;
  finalized: FinalizedTrackRecording | null;
};

type RecordingBlob = {
  schema: 3;
  revision: number;
  session: string;
  activityId: string;
  ownerId: string;
  startedAt: string;
  type: NewActivity['type'];
  points: Pt[];
  completed: NewActivity | null;
  locationLeases: LocationTaskLease[];
  consumedLocationChunkIds: string[] | null;
  state: 'paused' | 'recording' | 'closing' | 'sealed';
  terminal: RecordingTerminal | null;
};

export type TrackRecordingIdentity = Pick<
  RecordingBlob,
  'activityId' | 'ownerId' | 'startedAt'
>;

export type FinalizedTrackRecording = {
  identity: TrackRecordingIdentity;
  finishId: string;
  snapshotId: string;
  recording: PendingRecordedActivity;
};

export type TrackFinalizationClosingReason =
  | 'native_unconfirmed'
  | 'journal_unstable'
  | 'journal_unavailable'
  | 'persistence_unconfirmed'
  | 'callback_quiescence_unconfirmed'
  | 'corrupt_journal';

export type FinalizeTrackRecordingResult =
  | { kind: 'sealed'; finalized: FinalizedTrackRecording }
  | { kind: 'too_short' }
  | {
      kind: 'closing';
      finishId: string;
      reason: TrackFinalizationClosingReason;
    }
  | { kind: 'stale' };

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
      kind: 'closing';
      identity: TrackRecordingIdentity;
      finishId: string;
      type: NewActivity['type'];
      durationS: number;
    }
  | {
      kind: 'completed';
      finalized: FinalizedTrackRecording;
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
  fingerprint: (value: string) => string;
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
  fingerprint: stableFingerprint,
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
      const storedPoints = await options.storage.getItem(POINTS_KEY);
      if (storedPoints !== null) {
        throw new Error('A saved recording already exists');
      }
      const blob: RecordingBlob = {
        schema: 3,
        revision: 1,
        session: options.createSessionId(),
        activityId: options.createActivityId(),
        ownerId,
        startedAt: options.nowIso(),
        type,
        points: [],
        completed: null,
        locationLeases: [],
        consumedLocationChunkIds: [],
        state: 'paused',
        terminal: null,
      };

      await options.storage.setItem(POINTS_KEY, JSON.stringify(blob));
      await options.storage.removeItem(SESSION_KEY).catch(() => undefined);
      await retryPendingExactCleanup().catch(() => undefined);
      return identityOf(blob);
    });
  }

  async function readRecording(
    requestedOwnerId?: string,
    _legacyType: NewActivity['type'] = 'run',
  ): Promise<(TrackRecordingIdentity & { points: Pt[] }) | null> {
    const raw = await options.storage.getItem(POINTS_KEY);
    const parsed = parseStoredBlob(raw);
    if (!parsed) return null;

    if (
      parsed.kind === 'current' &&
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
      if (!currentOwnerId || parsed.blob.ownerId !== currentOwnerId) {
        return {
          kind: 'owner_mismatch',
          activityId: parsed.blob.activityId,
          ownerId: parsed.blob.ownerId,
        };
      }
      if (parsed.blob.terminal?.phase === 'closing') {
        return {
          kind: 'closing',
          identity: identityOf(parsed.blob),
          finishId: parsed.blob.terminal.finishId,
          type: parsed.blob.terminal.summary.type,
          durationS: parsed.blob.terminal.summary.durationS,
        };
      }
      if (parsed.blob.completed) {
        const finalized = finalizedFromBlob(parsed.blob);
        if (!finalized) return { kind: 'none' };
        return {
          kind: 'completed',
          finalized,
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
              finalized: finalizedFromBlob(parsed.blob)!,
            }
          : parsed.blob.terminal?.phase === 'closing'
            ? {
                kind: 'closing',
                identity: identityOf(parsed.blob),
                finishId: parsed.blob.terminal.finishId,
                type: parsed.blob.terminal.summary.type,
                durationS: parsed.blob.terminal.summary.durationS,
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
        schema: 3,
        revision: 1,
        session,
        activityId: options.createActivityId(),
        ownerId,
        startedAt: options.nowIso(),
        type,
        points: parsed.points,
        completed: null,
        locationLeases: [],
        consumedLocationChunkIds: [],
        state: 'paused',
        terminal: null,
      };
      await options.storage.setItem(POINTS_KEY, JSON.stringify(claimed));
      await options.storage.removeItem(SESSION_KEY).catch(() => undefined);
      return {
        kind: 'active',
        ...identityOf(claimed),
        type: claimed.type,
        points: claimed.points,
      };
    });
  }

  async function readPoints(): Promise<Pt[]> {
    const raw = await options.storage.getItem(POINTS_KEY);
    const parsed = parseStoredBlob(raw);
    if (!parsed) return [];
    if (parsed.kind === 'current') {
      return mergedPointsFor(parsed.blob);
    }
    const session = await options.storage.getItem(SESSION_KEY);
    if (!session) return parsed.session ? [] : parsed.points;
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
      if (parsed.blob.locationLeases.length > 0) {
        throw new Error(
          'Owner-bound GPS recordings require deep finalization',
        );
      }

      const merged = await mergedPointsAndChunkIdsFor(parsed.blob);
      const mergedPoints = merged.points;
      const points = parsed.blob.locationLeases.length > 0
        ? mergedPoints
        : mergedPoints.length > 0
          ? mergedPoints
          : recording.activity.route;
      const activity = { ...recording.activity, route: points };
      const finishId = `legacy-finish:${parsed.blob.activityId}`;
      const snapshotId = `legacy-snapshot:${parsed.blob.activityId}`;
      const finalized: FinalizedTrackRecording = {
        identity: identityOf(parsed.blob),
        finishId,
        snapshotId,
        recording: {
          activityId: parsed.blob.activityId,
          ownerId: parsed.blob.ownerId,
          activity,
        },
      };

      const completed: RecordingBlob = {
        ...parsed.blob,
        revision: parsed.blob.revision + 1,
        type: activity.type,
        points,
        completed: activity,
        state: 'sealed',
        terminal: {
          phase: 'sealed',
          finishId,
          snapshotId,
          cutoffExclusive: Number.MAX_SAFE_INTEGER,
          summary: { type: activity.type, durationS: activity.duration_s },
          candidate: {
            journalFingerprint: stableFingerprint(JSON.stringify(points)),
            route: points,
            sampleFingerprints: [],
            consumedJournalEntries: [],
          },
          finalized,
        },
        consumedLocationChunkIds: [
          ...(parsed.blob.consumedLocationChunkIds ?? []),
          ...merged.chunkIds,
        ],
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
    if (parsed.blob.terminal?.phase === 'sealed') {
      return parsed.blob.terminal.finalized!.recording;
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
      const raw = await options.storage.getItem(POINTS_KEY);
      const parsed = parseStoredBlob(raw);
      if (
        !parsed ||
        parsed.kind !== 'current' ||
        parsed.blob.completed ||
        parsed.blob.terminal !== null ||
        !recordingMatchesIdentity(parsed.blob, identity)
      ) {
        return null;
      }

      const current = activeLeaseOf(parsed.blob);
      if (current) return current;
      const latest = latestLeaseOf(parsed.blob);
      const nonOverlappingActivatedAt = latest?.revokedAtExclusive === null ||
        latest?.revokedAtExclusive === undefined
        ? activatedAt
        : Math.max(activatedAt, latest.revokedAtExclusive);

      const lease: LocationTaskLease = {
        schema: 1,
        id: leaseId,
        ordinal: parsed.blob.locationLeases.length + 1,
        session: parsed.blob.session,
        activityId: parsed.blob.activityId,
        ownerId: parsed.blob.ownerId,
        startedAt: parsed.blob.startedAt,
        activatedAt: nonOverlappingActivatedAt,
        revokedAtExclusive: null,
      };
      await options.storage.setItem(
        POINTS_KEY,
        JSON.stringify({
          ...parsed.blob,
          revision: parsed.blob.revision + 1,
          state: 'recording',
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
      const raw = await options.storage.getItem(POINTS_KEY);
      const parsed = parseStoredBlob(raw);
      return Boolean(
        parsed?.kind === 'current' &&
          !parsed.blob.completed &&
          parsed.blob.terminal === null &&
          recordingMatchesIdentity(parsed.blob, identity),
      );
    });
  }

  function suspendTaskLeaseFor(
    identity: TrackRecordingIdentity,
    revokedAtExclusive = options.nowMs(),
  ): Promise<
    | { kind: 'stale' }
    | { kind: 'already_paused'; lease: LocationTaskLease | null }
    | { kind: 'suspended'; lease: LocationTaskLease }
  > {
    return serializeAuthoritativeMutation(async () => {
      const raw = await options.storage.getItem(POINTS_KEY);
      const parsed = parseStoredBlob(raw);
      if (
        !parsed ||
        parsed.kind !== 'current' ||
        parsed.blob.completed ||
        parsed.blob.terminal !== null ||
        !recordingMatchesIdentity(parsed.blob, identity)
      ) {
        return { kind: 'stale' };
      }

      const current = activeLeaseOf(parsed.blob);
      if (!current) {
        const latest = latestLeaseOf(parsed.blob);
        return {
          kind: 'already_paused',
          lease: latest?.revokedAtExclusive !== null ? latest : null,
        };
      }

      const lease = { ...current, revokedAtExclusive };
      await options.storage.setItem(
        POINTS_KEY,
        JSON.stringify({
          ...parsed.blob,
          revision: parsed.blob.revision + 1,
          state: 'paused',
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
      const raw = await options.storage.getItem(POINTS_KEY);
      const parsed = parseStoredBlob(raw);
      if (
        parsed?.kind !== 'current' ||
        parsed.blob.completed
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
            : activeLease === null && storedLease.revokedAtExclusive !== null),
      );
    });
  }

  function readActiveTaskLease(): Promise<LocationTaskLease | null> {
    return serializeAuthoritativeMutation(async () => {
      const raw = await options.storage.getItem(POINTS_KEY);
      const parsed = parseStoredBlob(raw);
      if (
        !parsed ||
        parsed.kind !== 'current' ||
        parsed.blob.completed ||
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
    const receivedAt = options.nowMs();
    const validSamples = samples
      .slice(0, MAX_LOCATION_BATCH_SAMPLES)
      .filter((sample) =>
        isValidRawLocationTaskSample(sample) &&
        sample.capturedAt <= receivedAt + MAX_LOCATION_FUTURE_DRIFT_MS,
      );
    if (validSamples.length === 0) return false;
    const batchId = options.createChunkId();
    const batch: LocationTaskBatch = {
      schema: 1,
      batchId,
      receivedAt,
      samples: validSamples,
    };
    const serialized = JSON.stringify(batch);
    if (serialized.length > MAX_LOCATION_BATCH_BYTES) return false;
    await options.storage.setItem(
      `${LOCATION_BATCH_PREFIX}${batchId}`,
      serialized,
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
    if (blob.locationLeases.length === 0) {
      return { points: blob.points, chunkIds: [] };
    }
    requireJournalEnumeration(options.storage);
    const leases = blob.locationLeases.filter((lease) =>
      leaseMatchesRecording(lease, blob),
    );
    const keys = (await options.storage.getAllKeys())
      .filter((key) => key.startsWith(LOCATION_BATCH_PREFIX))
      .sort();
    const batches = await Promise.all(keys.map(async (key) => ({
      key,
      batch: parseLocationTaskBatch(await options.storage.getItem(key)),
    })));
    const consumedChunkIds = new Set(
      blob.consumedLocationChunkIds ?? [],
    );
    const includedChunkIds: string[] = [];
    const seenSamples = new Set<string>();
    const journalSamples = batches.flatMap(({ key, batch }) => {
      if (!batch || consumedChunkIds.has(batch.batchId)) return [];
      const eligible = batch.samples.filter((sample) =>
        leases.some((lease) =>
          sample.capturedAt >= lease.activatedAt &&
          (lease.revokedAtExclusive === null ||
            sample.capturedAt < lease.revokedAtExclusive),
        ),
      );
      if (eligible.length === 0) return [];
      includedChunkIds.push(batch.batchId);
      return eligible.flatMap((sample) => {
        const fingerprint = locationSampleFingerprint(
          sample,
          options.fingerprint,
        );
        if (seenSamples.has(fingerprint)) return [];
        seenSamples.add(fingerprint);
        return [{ ...sample, fingerprint, key }];
      });
    });
    journalSamples.sort((left, right) =>
      left.capturedAt - right.capturedAt ||
      left.fingerprint.localeCompare(right.fingerprint) ||
      left.key.localeCompare(right.key),
    );
    return {
      points: [
        ...blob.points,
        ...journalSamples.map(({ lat, lon }) => ({ lat, lon })),
      ],
      chunkIds: includedChunkIds,
    };
  }

  function beginClosing(
    identity: TrackRecordingIdentity,
    summary: { type: NewActivity['type']; durationS: number },
    finishId: string,
    snapshotId: string,
    cutoffExclusive = options.nowMs(),
  ): Promise<
    | { kind: 'stale' }
    | { kind: 'closing'; blob: RecordingBlob }
    | { kind: 'sealed'; finalized: FinalizedTrackRecording }
  > {
    return serializeAuthoritativeMutation(async () => {
      const raw = await options.storage.getItem(POINTS_KEY);
      const parsed = parseStoredBlob(raw);
      if (
        parsed?.kind !== 'current' ||
        !recordingMatchesIdentity(parsed.blob, identity)
      ) {
        return { kind: 'stale' };
      }
      if (parsed.blob.terminal?.phase === 'sealed') {
        return {
          kind: 'sealed',
          finalized: parsed.blob.terminal.finalized!,
        };
      }
      if (parsed.blob.terminal?.phase === 'closing') {
        return { kind: 'closing', blob: parsed.blob };
      }

      const activeLease = activeLeaseOf(parsed.blob);
      const locationLeases = activeLease
        ? parsed.blob.locationLeases.map((lease) =>
            lease.id === activeLease.id
              ? { ...lease, revokedAtExclusive: cutoffExclusive }
              : lease,
          )
        : parsed.blob.locationLeases;
      const terminal: RecordingTerminal = {
        phase: 'closing',
        finishId,
        snapshotId,
        cutoffExclusive,
        summary: {
          type: summary.type,
          durationS: Math.max(0, Math.round(summary.durationS)),
        },
        candidate: null,
        finalized: null,
      };
      const closing: RecordingBlob = {
        ...parsed.blob,
        revision: parsed.blob.revision + 1,
        state: 'closing',
        locationLeases,
        terminal,
      };
      await options.storage.setItem(POINTS_KEY, JSON.stringify(closing));
      return { kind: 'closing', blob: closing };
    });
  }

  async function scanTerminalJournal(
    blob: RecordingBlob,
  ): Promise<
    | { kind: 'ok'; snapshot: JournalSnapshot }
    | { kind: 'corrupt' }
  > {
    requireJournalEnumeration(options.storage);
    const keys = (await options.storage.getAllKeys())
      .filter((key) => key.startsWith(LOCATION_BATCH_PREFIX))
      .sort();
    const leases = blob.locationLeases.filter((lease) =>
      leaseMatchesRecording(lease, blob),
    );
    const terminalCutoff = blob.terminal?.cutoffExclusive ?? Number.MAX_VALUE;
    const seenSamples = new Set<string>();
    const samples: (LocationTaskSample & {
      fingerprint: string;
      key: string;
    })[] = [];
    const consumedJournalEntries: ConsumedJournalEntry[] = [];
    const contributingBatches: string[] = [];

    const sampleIsEligible = (sample: LocationTaskSample) =>
      sample.capturedAt < terminalCutoff &&
      leases.some((lease) =>
        sample.capturedAt >= lease.activatedAt &&
        (lease.revokedAtExclusive === null ||
          sample.capturedAt < lease.revokedAtExclusive),
      );

    for (const key of keys) {
      const batch = parseLocationTaskBatch(
        await options.storage.getItem(key),
      );
      if (!batch) return { kind: 'corrupt' };
      const sampleFingerprints = batch.samples
        .map((sample) =>
          locationSampleFingerprint(sample, options.fingerprint),
        )
        .sort();
      const batchFingerprint = options.fingerprint(
        sampleFingerprints.join('\n'),
      );
      const eligible = batch.samples.filter(sampleIsEligible);
      if (eligible.length > 0) {
        contributingBatches.push(`${key}\u0000${batchFingerprint}`);
      }
      if (
        batch.samples.length > 0 &&
        batch.samples.every(sampleIsEligible)
      ) {
        consumedJournalEntries.push({ key, batchFingerprint });
      }
      for (const sample of eligible) {
        const fingerprint = locationSampleFingerprint(
          sample,
          options.fingerprint,
        );
        if (seenSamples.has(fingerprint)) continue;
        seenSamples.add(fingerprint);
        samples.push({ ...sample, fingerprint, key });
      }
    }

    samples.sort((left, right) =>
      left.capturedAt - right.capturedAt ||
      left.fingerprint.localeCompare(right.fingerprint) ||
      left.key.localeCompare(right.key),
    );
    const sampleFingerprints = samples.map((sample) => sample.fingerprint);
    const route = [
      ...blob.points,
      ...samples.map(({ lat, lon }) => ({ lat, lon })),
    ];
    return {
      kind: 'ok',
      snapshot: {
        journalFingerprint: options.fingerprint(JSON.stringify({
          contributingBatches,
          sampleFingerprints,
        })),
        route,
        sampleFingerprints,
        consumedJournalEntries,
      },
    };
  }

  function persistTerminalCandidate(
    identity: TrackRecordingIdentity,
    finishId: string,
    snapshot: JournalSnapshot,
  ): Promise<boolean> {
    return serializeAuthoritativeMutation(async () => {
      const parsed = parseStoredBlob(
        await options.storage.getItem(POINTS_KEY),
      );
      if (
        parsed?.kind !== 'current' ||
        !recordingMatchesIdentity(parsed.blob, identity) ||
        parsed.blob.terminal?.phase !== 'closing' ||
        parsed.blob.terminal.finishId !== finishId
      ) {
        return false;
      }
      await options.storage.setItem(POINTS_KEY, JSON.stringify({
        ...parsed.blob,
        revision: parsed.blob.revision + 1,
        terminal: {
          ...parsed.blob.terminal,
          candidate: snapshot,
        },
      } satisfies RecordingBlob));
      return true;
    });
  }

  function sealTerminalCandidate(
    identity: TrackRecordingIdentity,
    finishId: string,
    expected: JournalSnapshot,
  ): Promise<FinalizedTrackRecording | null> {
    return serializeAuthoritativeMutation(async () => {
      const parsed = parseStoredBlob(
        await options.storage.getItem(POINTS_KEY),
      );
      if (
        parsed?.kind !== 'current' ||
        !recordingMatchesIdentity(parsed.blob, identity) ||
        parsed.blob.terminal?.phase !== 'closing' ||
        parsed.blob.terminal.finishId !== finishId ||
        JSON.stringify(parsed.blob.terminal.candidate) !== JSON.stringify(expected)
      ) {
        return null;
      }
      const terminal = parsed.blob.terminal;
      const activity: NewActivity = {
        type: terminal.summary.type,
        duration_s: terminal.summary.durationS,
        distance_m: totalDistanceMeters(expected.route),
        route: expected.route,
        started_at: parsed.blob.startedAt,
      };
      const finalized: FinalizedTrackRecording = {
        identity: identityOf(parsed.blob),
        finishId,
        snapshotId: terminal.snapshotId,
        recording: {
          activityId: parsed.blob.activityId,
          ownerId: parsed.blob.ownerId,
          activity,
        },
      };
      const sealed: RecordingBlob = {
        ...parsed.blob,
        revision: parsed.blob.revision + 1,
        state: 'sealed',
        points: expected.route,
        completed: activity,
        terminal: {
          ...terminal,
          phase: 'sealed',
          finalized,
        },
      };
      await options.storage.setItem(POINTS_KEY, JSON.stringify(sealed));
      return finalized;
    });
  }

  function acknowledgeFinalized(
    identity: TrackRecordingIdentity,
    snapshotId: string,
  ): Promise<'acknowledged' | 'stale'> {
    return serializeAuthoritativeMutation(async () => {
      const parsed = parseStoredBlob(
        await options.storage.getItem(POINTS_KEY),
      );
      if (
        parsed?.kind !== 'current' ||
        !recordingMatchesIdentity(parsed.blob, identity) ||
        parsed.blob.terminal?.phase !== 'sealed' ||
        parsed.blob.terminal.snapshotId !== snapshotId ||
        !parsed.blob.terminal.candidate
      ) {
        return 'stale';
      }
      const entries = parsed.blob.terminal.candidate.consumedJournalEntries;
      const receiptKey = `${LOCATION_CLEANUP_PREFIX}${snapshotId}`;
      const receipt: ExactCleanupReceipt = {
        schema: 1,
        snapshotId,
        entries,
      };
      await options.storage.setItem(receiptKey, JSON.stringify(receipt));
      await options.storage.removeItem(POINTS_KEY);
      await options.storage.removeItem(SESSION_KEY).catch(() => undefined);
      if (await cleanupExactEntries(entries)) {
        await options.storage.removeItem(receiptKey);
      }
      return 'acknowledged';
    });
  }

  async function cleanupExactEntries(
    entries: readonly ConsumedJournalEntry[],
  ): Promise<boolean> {
    let complete = true;
    for (const entry of entries) {
      try {
        const raw = await options.storage.getItem(entry.key);
        if (raw === null) continue;
        const batch = parseLocationTaskBatch(raw);
        if (!batch) {
          complete = false;
          continue;
        }
        const fingerprint = options.fingerprint(
          batch.samples
            .map((sample) =>
              locationSampleFingerprint(sample, options.fingerprint),
            )
            .sort()
            .join('\n'),
        );
        if (fingerprint !== entry.batchFingerprint) {
          complete = false;
          continue;
        }
        await options.storage.removeItem(entry.key);
      } catch {
        complete = false;
      }
    }
    return complete;
  }

  async function retryPendingExactCleanup(): Promise<void> {
    if (!options.storage.getAllKeys) return;
    const receiptKeys = (await options.storage.getAllKeys())
      .filter((key) => key.startsWith(LOCATION_CLEANUP_PREFIX))
      .sort();
    for (const receiptKey of receiptKeys) {
      const receipt = parseExactCleanupReceipt(
        await options.storage.getItem(receiptKey),
      );
      if (!receipt) continue;
      if (await cleanupExactEntries(receipt.entries)) {
        await options.storage.removeItem(receiptKey);
      }
    }
  }

  function discardClosingTooShort(
    identity: TrackRecordingIdentity,
    finishId: string,
    snapshot: JournalSnapshot,
  ): Promise<boolean> {
    return serializeAuthoritativeMutation(async () => {
      const parsed = parseStoredBlob(
        await options.storage.getItem(POINTS_KEY),
      );
      if (
        parsed?.kind !== 'current' ||
        !recordingMatchesIdentity(parsed.blob, identity) ||
        parsed.blob.terminal?.phase !== 'closing' ||
        parsed.blob.terminal.finishId !== finishId
      ) {
        return false;
      }
      if (!(await cleanupExactEntries(snapshot.consumedJournalEntries))) {
        throw new Error('Exact location cleanup remains pending');
      }
      const latest = parseStoredBlob(
        await options.storage.getItem(POINTS_KEY),
      );
      if (
        latest?.kind !== 'current' ||
        !recordingMatchesIdentity(latest.blob, identity) ||
        latest.blob.terminal?.phase !== 'closing' ||
        latest.blob.terminal.finishId !== finishId
      ) {
        return false;
      }
      await options.storage.removeItem(POINTS_KEY);
      await options.storage.removeItem(SESSION_KEY).catch(() => undefined);
      return true;
    });
  }

  function clear(activityId?: string): Promise<void> {
    return serializeAuthoritativeMutation(async () => {
      const parsed = parseStoredBlob(
        await options.storage.getItem(POINTS_KEY),
      );
      if (
        activityId &&
        parsed?.kind === 'current' &&
        parsed.blob.activityId !== activityId
      ) {
        throw new Error('Recorded activity identity does not match raw GPS');
      }
      if (
        parsed?.kind === 'current' &&
        parsed.blob.locationLeases.length > 0
      ) {
        throw new Error('Owner-bound recording identity required for discard');
      }

      await options.storage.removeItem(SESSION_KEY).catch(() => undefined);
      await options.storage.removeItem(POINTS_KEY);
    });
  }

  function discard(
    identity: TrackRecordingIdentity,
  ): Promise<'discarded' | 'stale'> {
    return serializeAuthoritativeMutation(async () => {
      const parsed = parseStoredBlob(
        await options.storage.getItem(POINTS_KEY),
      );
      if (
        parsed?.kind !== 'current' ||
        !recordingMatchesIdentity(parsed.blob, identity)
      ) {
        return 'stale';
      }
      await options.storage.removeItem(POINTS_KEY);
      await options.storage.removeItem(SESSION_KEY).catch(() => undefined);
      return 'discarded';
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
    beginClosing,
    scanTerminalJournal,
    persistTerminalCandidate,
    sealTerminalCandidate,
    acknowledgeFinalized,
    discardClosingTooShort,
    discard,
    clear,
  };
}

const defaultRecordingStore = createLocationRecordingStore({
  storage: AsyncStorage,
});

export function createLocationTaskHandler(
  store: Pick<
    ReturnType<typeof createLocationRecordingStore>,
    'appendTaskSamples'
  >,
) {
  return async ({ data, error }: any): Promise<void> => {
    locationTaskWritesInFlight += 1;
    try {
      if (error) return;
      const locations = data?.locations ?? [];
      if (!Array.isArray(locations) || locations.length === 0) return;
      const samples = locations.map(locationPoint);
      await store.appendTaskSamples(samples);
    } catch {
      // The immutable WAL write is best effort; authority is never mutated.
    } finally {
      locationTaskWritesInFlight -= 1;
    }
  };
}

const defaultLocationTaskHandler = createLocationTaskHandler(
  defaultRecordingStore,
);

// The task runs in a separate context (including background). Its first
// awaited storage action is the ownerless immutable WAL write.
if (Platform.OS !== 'web') {
  TaskManager.defineTask(LOCATION_TASK_NAME, defaultLocationTaskHandler);
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
  stop(): Promise<void>;
};

export type LocationTaskLeaseRuntime = LocationTaskRuntime;

type LocationTaskLifecycleOptions = {
  storage: LocationRecordingStorage;
  runtime: LocationTaskLeaseRuntime;
  createLeaseId: () => string;
  createFinishId?: () => string;
  createSnapshotId?: () => string;
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

  function issueIdentityIntent(identity: TrackRecordingIdentity): number {
    const key = recordingIdentityKey(identity);
    const intent = ++locationTaskIntentClock;
    locationTaskIdentityIntents.set(key, intent);
    return intent;
  }

  function identityIntentIsCurrent(
    identity: TrackRecordingIdentity,
    intent: number,
  ): boolean {
    return locationTaskIdentityIntents.get(recordingIdentityKey(identity)) === intent;
  }

  async function reconcileNativeToDurableState(): Promise<
    'running' | 'paused' | 'uncertain'
  > {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const desiredLease = await store.readActiveTaskLease();
      let started: boolean | null = null;
      try {
        started = await options.runtime.hasStarted();
      } catch {
        if (!desiredLease) {
          try {
            await options.runtime.stop();
          } catch {
            return 'uncertain';
          }
          continue;
        }
        return 'uncertain';
      }

      const currentLease = await store.readActiveTaskLease();
      if (currentLease) {
        if (started) return 'running';
        try {
          await options.runtime.start();
        } catch {
          // A native call may take effect before rejecting. Re-read status.
        }
        continue;
      }
      if (!started) return 'paused';
      try {
        await options.runtime.stop();
      } catch {
        // A native call may take effect before rejecting. Re-read status.
      }
    }

    const desiredLease = await store.readActiveTaskLease();
    try {
      const started = await options.runtime.hasStarted();
      if (desiredLease && started) return 'running';
      if (!desiredLease && !started) return 'paused';
    } catch {
      // No status proof means the lifecycle remains recoverable.
    }
    return 'uncertain';
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
    if ((await reconcileNativeToDurableState()) === 'uncertain') {
      throw new Error('Native location task state remains uncertain');
    }
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
        await reconcileNativeToDurableState();
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
        await reconcileNativeToDurableState();
        return 'stale';
      }
      if (!identityIntentIsCurrent(identity, intent)) return 'stale';
      const suspended = await store.suspendTaskLeaseFor(identity);
      if (suspended.kind === 'stale') return 'stale';
      await stopIfLeaseStillPaused(suspended.lease);
      return 'paused';
    }
    if (!identityIntentIsCurrent(identity, intent)) {
      await reconcileNativeToDurableState();
      return 'stale';
    }
    if (!(await store.taskLeaseIsCurrent(lease, true))) {
      await reconcileNativeToDurableState();
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
        if ((await reconcileNativeToDurableState()) === 'uncertain') {
          throw new Error('Native location task state remains uncertain');
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
      serializeNativeTaskMutation(async () => {
        if (suspended.kind === 'stale') return 'stale';
        await stopIfLeaseStillPaused(suspended.lease);
        if ((await reconcileNativeToDurableState()) === 'uncertain') {
          throw new Error('Native location task state remains uncertain');
        }
        return suspended.kind === 'already_paused'
          ? 'already_paused'
          : 'paused';
      }),
    );
  }

  async function confirmNativeStopped(): Promise<boolean> {
    let started: boolean | null = null;
    try {
      started = await options.runtime.hasStarted();
    } catch {
      // Unknown registration state is treated as potentially running.
    }
    if (started !== false) {
      try {
        await options.runtime.stop();
      } catch {
        // A partially-effectful stop is resolved by the status confirmation.
      }
    }
    try {
      return (await options.runtime.hasStarted()) === false;
    } catch {
      return false;
    }
  }

  async function finalizeForUnlocked(
    identity: TrackRecordingIdentity,
    summary: { type: NewActivity['type']; durationS: number },
  ): Promise<FinalizeTrackRecordingResult> {
    issueIdentityIntent(identity);
    let closing:
      | Awaited<ReturnType<typeof store.beginClosing>>
      | null = null;
    try {
      closing = await store.beginClosing(
        identity,
        summary,
        options.createFinishId?.() ?? secureCreateActivityId(),
        options.createSnapshotId?.() ?? secureCreateActivityId(),
      );
    } catch {
      throw new Error('Could not durably begin track finalization');
    }
    if (closing.kind === 'stale') return { kind: 'stale' };
    if (closing.kind === 'sealed') {
      return { kind: 'sealed', finalized: closing.finalized };
    }
    const { blob } = closing;
    const finishId = blob.terminal!.finishId;

    const stopped = await serializeNativeTaskMutation(confirmNativeStopped);
    if (!stopped) {
      return { kind: 'closing', finishId, reason: 'native_unconfirmed' };
    }
    if (locationTaskWritesInFlight > 0) {
      return {
        kind: 'closing',
        finishId,
        reason: 'callback_quiescence_unconfirmed',
      };
    }

    let first: Awaited<ReturnType<typeof store.scanTerminalJournal>>;
    try {
      first = await store.scanTerminalJournal(blob);
    } catch {
      return { kind: 'closing', finishId, reason: 'journal_unavailable' };
    }
    if (first.kind === 'corrupt') {
      return { kind: 'closing', finishId, reason: 'corrupt_journal' };
    }
    try {
      if (!(await store.persistTerminalCandidate(
        identity,
        finishId,
        first.snapshot,
      ))) {
        return { kind: 'stale' };
      }
    } catch {
      return {
        kind: 'closing',
        finishId,
        reason: 'persistence_unconfirmed',
      };
    }

    let second: Awaited<ReturnType<typeof store.scanTerminalJournal>>;
    try {
      second = await store.scanTerminalJournal(blob);
    } catch {
      return { kind: 'closing', finishId, reason: 'journal_unavailable' };
    }
    if (second.kind === 'corrupt') {
      return { kind: 'closing', finishId, reason: 'corrupt_journal' };
    }
    if (!journalSnapshotsEqual(first.snapshot, second.snapshot)) {
      return { kind: 'closing', finishId, reason: 'journal_unstable' };
    }
    if (locationTaskWritesInFlight > 0) {
      return {
        kind: 'closing',
        finishId,
        reason: 'callback_quiescence_unconfirmed',
      };
    }

    let preflight: Awaited<ReturnType<typeof store.scanTerminalJournal>>;
    try {
      preflight = await store.scanTerminalJournal(blob);
    } catch {
      return { kind: 'closing', finishId, reason: 'journal_unavailable' };
    }
    if (preflight.kind === 'corrupt') {
      return { kind: 'closing', finishId, reason: 'corrupt_journal' };
    }
    if (!journalSnapshotsEqual(second.snapshot, preflight.snapshot)) {
      return { kind: 'closing', finishId, reason: 'journal_unstable' };
    }
    if (locationTaskWritesInFlight > 0) {
      return {
        kind: 'closing',
        finishId,
        reason: 'callback_quiescence_unconfirmed',
      };
    }

    if (
      blob.terminal!.summary.durationS < 3 &&
      totalDistanceMeters(preflight.snapshot.route) < 5
    ) {
      try {
        return (await store.discardClosingTooShort(
          identity,
          finishId,
          preflight.snapshot,
        ))
          ? { kind: 'too_short' }
          : { kind: 'stale' };
      } catch {
        return {
          kind: 'closing',
          finishId,
          reason: 'persistence_unconfirmed',
        };
      }
    }

    try {
      const finalized = await store.sealTerminalCandidate(
        identity,
        finishId,
        preflight.snapshot,
      );
      return finalized
        ? { kind: 'sealed', finalized }
        : { kind: 'stale' };
    } catch {
      return {
        kind: 'closing',
        finishId,
        reason: 'persistence_unconfirmed',
      };
    }
  }

  function finalizeFor(
    identity: TrackRecordingIdentity,
    summary: { type: NewActivity['type']; durationS: number },
  ): Promise<FinalizeTrackRecordingResult> {
    const key = recordingIdentityKey(identity);
    const existing = finalizationFlights.get(key);
    if (existing) return existing;
    const promise = finalizeForUnlocked(identity, summary).finally(() => {
      if (finalizationFlights.get(key) === promise) {
        finalizationFlights.delete(key);
      }
    });
    finalizationFlights.set(key, promise);
    return promise;
  }

  function acknowledgeFinalizedFor(
    identity: TrackRecordingIdentity,
    snapshotId: string,
  ): Promise<'acknowledged' | 'stale'> {
    return store.acknowledgeFinalized(identity, snapshotId);
  }

  function discardFor(
    identity: TrackRecordingIdentity,
  ): Promise<'discarded' | 'stale'> {
    issueIdentityIntent(identity);
    const suspension = store.suspendTaskLeaseFor(identity);
    return suspension.then((suspended) =>
      serializeNativeTaskMutation(async () => {
        if (suspended.kind !== 'stale') {
          await stopIfLeaseStillPaused(suspended.lease);
        }
        if ((await reconcileNativeToDurableState()) === 'uncertain') {
          throw new Error('Native location task state remains uncertain');
        }
        return store.discard(identity);
      }),
    );
  }

  function reconcile(): Promise<'running' | 'paused' | 'uncertain'> {
    return serializeNativeTaskMutation(reconcileNativeToDurableState);
  }

  return {
    startFor,
    ensureFor,
    pauseFor,
    finalizeFor,
    acknowledgeFinalizedFor,
    discardFor,
    reconcile,
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

export async function finalizeTrackRecordingFor(
  identity: TrackRecordingIdentity,
  summary: { type: NewActivity['type']; durationS: number },
): Promise<FinalizeTrackRecordingResult> {
  return defaultLocationTaskLifecycle.finalizeFor(identity, summary);
}

export async function acknowledgeFinalizedTrackRecordingFor(
  identity: TrackRecordingIdentity,
  snapshotId: string,
): Promise<'acknowledged' | 'stale'> {
  return defaultLocationTaskLifecycle.acknowledgeFinalizedFor(
    identity,
    snapshotId,
  );
}

export async function discardTrackRecordingFor(
  identity: TrackRecordingIdentity,
): Promise<'discarded' | 'stale'> {
  return defaultLocationTaskLifecycle.discardFor(identity);
}

export async function reconcileLocationTask(
  runtime: LocationTaskRuntime,
): Promise<'paused' | 'uncertain'> {
  let started: boolean | null = null;
  try {
    started = await runtime.hasStarted();
  } catch {
    // Unknown native state is treated as potentially registered.
  }
  if (started === false) return 'paused';
  try {
    await runtime.stop();
  } catch {
    return 'uncertain';
  }
  try {
    return (await runtime.hasStarted()) === false ? 'paused' : 'uncertain';
  } catch {
    return 'uncertain';
  }
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
      (value.schema === 2 || value.schema === 3) &&
      typeof value.session === 'string' &&
      typeof value.activityId === 'string' &&
      typeof value.ownerId === 'string' &&
      typeof value.startedAt === 'string' &&
      (value.completed === null || isNewActivity(value.completed))
    ) {
      const completed = value.completed as NewActivity | null;
      const base = {
        schema: 3 as const,
        revision:
          value.schema === 3 &&
          typeof value.revision === 'number' &&
          Number.isSafeInteger(value.revision) &&
          value.revision >= 1
            ? value.revision
            : 1,
        session: value.session,
        activityId: value.activityId,
        ownerId: value.ownerId,
        startedAt: value.startedAt,
        type:
          value.type === 'run' ||
          value.type === 'walk' ||
          value.type === 'ride'
            ? value.type
            : completed
              ? completed.type
              : 'run' as const,
        points,
        completed,
        locationLeases: parseLocationTaskLeases(
          value.locationLeases,
          value.locationLease,
          value.startedAt,
        ),
        consumedLocationChunkIds: parseConsumedLocationChunkIds(
          value.consumedLocationChunkIds,
          completed !== null,
        ),
      };
      const terminal = value.schema === 3
        ? parseRecordingTerminal(value.terminal)
        : completed
          ? legacySealedTerminal(base, completed)
          : null;
      if (value.schema === 3 && value.terminal !== null && !terminal) {
        return null;
      }
      const state = terminal?.phase === 'sealed'
        ? 'sealed'
        : terminal?.phase === 'closing'
          ? 'closing'
          : activeLeaseFromParts(base.locationLeases, base)
            ? 'recording'
            : 'paused';
      return {
        kind: 'current',
        blob: {
          ...base,
          state,
          terminal,
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

function isTrackRecordingIdentity(
  value: unknown,
): value is TrackRecordingIdentity {
  return (
    isRecord(value) &&
    typeof value.activityId === 'string' &&
    typeof value.ownerId === 'string' &&
    typeof value.startedAt === 'string'
  );
}

function isPendingRecordedActivity(
  value: unknown,
): value is PendingRecordedActivity {
  return (
    isRecord(value) &&
    typeof value.activityId === 'string' &&
    typeof value.ownerId === 'string' &&
    isNewActivity(value.activity)
  );
}

function isFinalizedTrackRecording(
  value: unknown,
): value is FinalizedTrackRecording {
  return (
    isRecord(value) &&
    isTrackRecordingIdentity(value.identity) &&
    typeof value.finishId === 'string' &&
    typeof value.snapshotId === 'string' &&
    isPendingRecordedActivity(value.recording)
  );
}

function parseJournalSnapshot(value: unknown): JournalSnapshot | null {
  if (
    !isRecord(value) ||
    typeof value.journalFingerprint !== 'string' ||
    !Array.isArray(value.route) ||
    !value.route.every(isPoint) ||
    !Array.isArray(value.sampleFingerprints) ||
    !value.sampleFingerprints.every((item) => typeof item === 'string') ||
    !Array.isArray(value.consumedJournalEntries)
  ) {
    return null;
  }
  const consumedJournalEntries = value.consumedJournalEntries.flatMap(
    (entry): ConsumedJournalEntry[] =>
      isRecord(entry) &&
      typeof entry.key === 'string' &&
      entry.key.startsWith(LOCATION_BATCH_PREFIX) &&
      typeof entry.batchFingerprint === 'string'
        ? [{
            key: entry.key,
            batchFingerprint: entry.batchFingerprint,
          }]
        : [],
  );
  if (consumedJournalEntries.length !== value.consumedJournalEntries.length) {
    return null;
  }
  return {
    journalFingerprint: value.journalFingerprint,
    route: value.route,
    sampleFingerprints: value.sampleFingerprints,
    consumedJournalEntries,
  };
}

function parseRecordingTerminal(value: unknown): RecordingTerminal | null {
  if (
    !isRecord(value) ||
    (value.phase !== 'closing' && value.phase !== 'sealed') ||
    typeof value.finishId !== 'string' ||
    typeof value.snapshotId !== 'string' ||
    typeof value.cutoffExclusive !== 'number' ||
    !Number.isFinite(value.cutoffExclusive) ||
    !isRecord(value.summary) ||
    (value.summary.type !== 'run' &&
      value.summary.type !== 'walk' &&
      value.summary.type !== 'ride') ||
    typeof value.summary.durationS !== 'number' ||
    !Number.isFinite(value.summary.durationS)
  ) {
    return null;
  }
  const candidate = value.candidate === null
    ? null
    : parseJournalSnapshot(value.candidate);
  if (value.candidate !== null && !candidate) return null;
  const finalized = value.finalized === null
    ? null
    : isFinalizedTrackRecording(value.finalized)
      ? value.finalized
      : null;
  if (value.finalized !== null && !finalized) return null;
  if (value.phase === 'sealed' && !finalized) return null;
  return {
    phase: value.phase,
    finishId: value.finishId,
    snapshotId: value.snapshotId,
    cutoffExclusive: value.cutoffExclusive,
    summary: {
      type: value.summary.type,
      durationS: value.summary.durationS,
    },
    candidate,
    finalized,
  };
}

function legacySealedTerminal(
  blob: Pick<
    RecordingBlob,
    'activityId' | 'ownerId' | 'startedAt' | 'points'
  >,
  completed: NewActivity,
): RecordingTerminal {
  const identity = identityOf(blob as RecordingBlob);
  const finishId = `legacy-finish:${blob.activityId}`;
  const snapshotId = `legacy-snapshot:${blob.activityId}`;
  return {
    phase: 'sealed',
    finishId,
    snapshotId,
    cutoffExclusive: Number.MAX_SAFE_INTEGER,
    summary: { type: completed.type, durationS: completed.duration_s },
    candidate: {
      journalFingerprint: stableFingerprint(JSON.stringify(completed.route)),
      route: completed.route,
      sampleFingerprints: [],
      consumedJournalEntries: [],
    },
    finalized: {
      identity,
      finishId,
      snapshotId,
      recording: {
        activityId: blob.activityId,
        ownerId: blob.ownerId,
        activity: completed,
      },
    },
  };
}

function finalizedFromBlob(
  blob: RecordingBlob,
): FinalizedTrackRecording | null {
  return blob.terminal?.phase === 'sealed'
    ? blob.terminal.finalized
    : null;
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
    if (
      lease.revokedAtExclusive === null &&
      leaseMatchesRecording(lease, blob)
    ) {
      return lease;
    }
  }
  return null;
}

function activeLeaseFromParts(
  leases: LocationTaskLease[],
  identity: Pick<
    RecordingBlob,
    'session' | 'activityId' | 'ownerId' | 'startedAt'
  >,
): LocationTaskLease | null {
  for (let index = leases.length - 1; index >= 0; index -= 1) {
    const lease = leases[index];
    if (
      lease.revokedAtExclusive === null &&
      lease.session === identity.session &&
      lease.activityId === identity.activityId &&
      lease.ownerId === identity.ownerId &&
      lease.startedAt === identity.startedAt
    ) {
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
    ordinal: 1,
    session: legacyValue.session,
    activityId: legacyValue.activityId,
    ownerId: legacyValue.ownerId,
    startedAt: legacyValue.startedAt,
    activatedAt: Number.isFinite(legacyActivatedAt) ? legacyActivatedAt : 0,
    revokedAtExclusive: legacyValue.appendEnabled ? null : 0,
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
      value.revokedAtExclusive === null ||
      (typeof value.revokedAtExclusive === 'number' &&
        Number.isFinite(value.revokedAtExclusive)) ||
      value.revokedAt === null ||
      (typeof value.revokedAt === 'number' && Number.isFinite(value.revokedAt))
    )
  ) {
    return null;
  }
  return {
    schema: 1,
    id: value.id,
    ordinal:
      typeof value.ordinal === 'number' && Number.isSafeInteger(value.ordinal)
        ? value.ordinal
        : 1,
    session: value.session,
    activityId: value.activityId,
    ownerId: value.ownerId,
    startedAt: value.startedAt,
    activatedAt: value.activatedAt,
    revokedAtExclusive:
      value.revokedAtExclusive === null ||
      typeof value.revokedAtExclusive === 'number'
        ? value.revokedAtExclusive as number | null
        : value.revokedAt as number | null,
  };
}

function isLocationTaskSample(value: unknown): value is LocationTaskSample {
  if (!isRecord(value) || !isPoint(value)) return false;
  const capturedAt: unknown = (value as Record<string, unknown>).capturedAt;
  return typeof capturedAt === 'number' && Number.isFinite(capturedAt);
}

function isValidRawLocationTaskSample(
  value: unknown,
): value is LocationTaskSample {
  return (
    isLocationTaskSample(value) &&
    value.lat >= -90 &&
    value.lat <= 90 &&
    value.lon >= -180 &&
    value.lon <= 180 &&
    value.capturedAt >= 0
  );
}

function locationSampleFingerprint(
  sample: LocationTaskSample,
  fingerprint: (value: string) => string = stableFingerprint,
): string {
  return fingerprint(
    `${sample.capturedAt}\u0000${sample.lat.toPrecision(15)}\u0000${sample.lon.toPrecision(15)}`,
  );
}

function stableFingerprint(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return `${first.toString(16).padStart(8, '0')}${second
    .toString(16)
    .padStart(8, '0')}`;
}

function journalSnapshotsEqual(
  left: JournalSnapshot,
  right: JournalSnapshot,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parseLocationTaskBatch(raw: string | null): LocationTaskBatch | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.schema !== 1 ||
      typeof value.batchId !== 'string' ||
      typeof value.receivedAt !== 'number' ||
      !Number.isFinite(value.receivedAt) ||
      !Array.isArray(value.samples) ||
      value.samples.length > MAX_LOCATION_BATCH_SAMPLES ||
      !value.samples.every((sample) =>
        isValidRawLocationTaskSample(sample) &&
        sample.capturedAt <=
          (value.receivedAt as number) + MAX_LOCATION_FUTURE_DRIFT_MS,
      )
    ) {
      return null;
    }
    return {
      schema: 1,
      batchId: value.batchId,
      receivedAt: value.receivedAt,
      samples: value.samples,
    };
  } catch {
    return null;
  }
}

function parseExactCleanupReceipt(
  raw: string | null,
): ExactCleanupReceipt | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.schema !== 1 ||
      typeof value.snapshotId !== 'string' ||
      !Array.isArray(value.entries)
    ) {
      return null;
    }
    const entries = value.entries.flatMap(
      (entry): ConsumedJournalEntry[] =>
        isRecord(entry) &&
        typeof entry.key === 'string' &&
        entry.key.startsWith(LOCATION_BATCH_PREFIX) &&
        typeof entry.batchFingerprint === 'string'
          ? [{
              key: entry.key,
              batchFingerprint: entry.batchFingerprint,
            }]
          : [],
    );
    if (entries.length !== value.entries.length) return null;
    return { schema: 1, snapshotId: value.snapshotId, entries };
  } catch {
    return null;
  }
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
    capturedAt: location.timestamp,
  };
}
