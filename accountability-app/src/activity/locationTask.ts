import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NewActivity } from './api';
import { totalDistanceMeters, type Pt } from './geo';
import {
  createActivityId as secureCreateActivityId,
  MAX_ACTIVITY_DISTANCE_M,
  MAX_ACTIVITY_DURATION_S,
  MAX_LAST_ERROR_MESSAGE_LENGTH,
  MAX_ROUTE_POINTS,
} from './offlineQueueTypes';
import { MAX_QUEUED_ACTIVITY_BYTES } from './offlineQueueStore';
import type { PendingRecordedActivity } from './runCompletion';
import { createNativeLocationDrainRuntime } from './locationDrainBridge';

export const LOCATION_TASK_NAME = 'accountability-location-task';
const POINTS_KEY = 'activity:points';
const SESSION_KEY = 'activity:session';
const LOCATION_LINEAGE_KEY = 'activity:location-lineage:v1';
const LOCATION_BATCH_PREFIX = 'activity:location-batch:v1:';
const LOCATION_CLEANUP_PREFIX = 'activity:location-cleanup:v1:';
const LEGACY_LOCATION_QUARANTINE_KEY =
  'activity:legacy-location-quarantine:v1';
const LEGACY_LOCATION_QUARANTINE_VALUE = JSON.stringify({
  schema: 1,
  sweepGenerationZero: true,
});
const MAX_LOCATION_BATCH_SAMPLES = 512;
const MAX_LOCATION_BATCH_BYTES = 256 * 1024;
const MAX_LOCATION_JOURNAL_SAMPLES = 50_000;
const MAX_LOCATION_JOURNAL_BYTES = 4 * 1024 * 1024;
const MAX_LOCATION_FUTURE_DRIFT_MS = 5 * 60 * 1000;
let authoritativeMutationTail: Promise<void> = Promise.resolve();
let nativeTaskMutationTail: Promise<void> = Promise.resolve();
let locationJournalMutationTail: Promise<void> = Promise.resolve();
// Expo provides task unregistration, not a cross-runtime callback drain barrier.
// This counter closes the same-runtime race; immutable WAL writes plus repeated
// stable scans/preflight make other-runtime late batches inert until a retry.
let locationTaskWritesInFlight = 0;
let locationTaskIntentClock = 0;
let ownerReconciliationIntentClock = 0;
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

function serializeLocationJournalMutation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const result = locationJournalMutationTail.then(operation, operation);
  locationJournalMutationTail = result.then(
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
  collectorGeneration: number;
  drainedThroughSequence: number | null;
};

export type LocationTaskSample = Pt & {
  capturedAt: number;
  nativeSequence?: number | null;
};

type LocationTaskBatch = {
  schema: 1;
  batchId: string;
  collectorGeneration: number | null;
  receivedAt: number;
  samples: LocationTaskSample[];
};

type CollectorLineageEntry = {
  generation: number;
  leaseId: string;
  session: string;
  activityId: string;
  ownerId: string;
  startedAt: string;
  activatedAt: number;
  revokedAtExclusive: number | null;
  drainedThroughSequence: number | null;
  resolution: 'active' | 'paused' | 'closing' | 'sealed' | 'discarded';
};

type CollectorLineage = {
  schema: 1;
  nextGeneration: number;
  collectors: CollectorLineageEntry[];
};

type ConsumedJournalEntry = {
  key: string;
  batchFingerprint: string;
  rawFingerprint?: string;
};

type ExactCleanupReceipt = {
  schema: 1;
  snapshotId: string;
  entries: ConsumedJournalEntry[];
  collectorGenerations: number[];
  orphaned?: boolean;
};

type JournalSnapshot = {
  journalFingerprint: string;
  route: Pt[];
  sampleFingerprints: string[];
  consumedJournalEntries: ConsumedJournalEntry[];
};

type RecordingTerminal = {
  phase: 'closing' | 'sealed';
  resolution: 'closing' | 'sealed' | 'enqueueing' | 'discarding';
  resolutionId: string;
  quarantineReason: TrackRecordingQuarantineReason | null;
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
  resumeAfterOwnerCheck: boolean;
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
  | 'drain_unavailable'
  | 'drain_unconfirmed'
  | 'legacy_unprovable'
  | 'tracking_incomplete'
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

export type ClaimFinalizedEnqueueResult =
  | { kind: 'claimed' }
  | { kind: 'already_claimed' }
  | { kind: 'discarding' }
  | { kind: 'stale' };

export type DiscardTrackRecordingResult =
  | 'discarded'
  | 'completion_in_progress'
  | 'stale';

export type BootLocationReconciliationStatus =
  | 'running'
  | 'paused'
  | 'closing'
  | 'capability_unavailable'
  | 'uncertain';

export type TrackRecordingRecovery =
  | { kind: 'none' }
  | { kind: 'needs_owner' }
  | { kind: 'legacy_unprovable'; discardToken: string }
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
      quarantineReason?: TrackRecordingQuarantineReason;
    }
  | {
      kind: 'completed';
      finalized: FinalizedTrackRecording;
    };

export type TrackRecordingQuarantineReason =
  | 'legacy_unprovable'
  | 'tracking_incomplete';

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

  async function updateCollectorLineageEntry(
    lease: LocationTaskLease,
    changes: Partial<Pick<
      CollectorLineageEntry,
      'revokedAtExclusive' | 'drainedThroughSequence' | 'resolution'
    >>,
  ): Promise<void> {
    if (lease.collectorGeneration <= 0) return;
    const lineage = parseCollectorLineage(
      await options.storage.getItem(LOCATION_LINEAGE_KEY),
    );
    let matched = false;
    const collectors = lineage.collectors.map((entry) => {
      if (
        entry.generation !== lease.collectorGeneration ||
        entry.leaseId !== lease.id ||
        entry.session !== lease.session ||
        entry.activityId !== lease.activityId ||
        entry.ownerId !== lease.ownerId ||
        entry.startedAt !== lease.startedAt
      ) {
        return entry;
      }
      matched = true;
      return { ...entry, ...changes };
    });
    if (!matched) throw new Error('Collector lineage lease is missing');
    await options.storage.setItem(
      LOCATION_LINEAGE_KEY,
      JSON.stringify({ ...lineage, collectors } satisfies CollectorLineage),
    );
  }

  async function compactCollectorLineage(
    generations: readonly number[],
  ): Promise<boolean> {
    const requested = new Set(generations.filter(isPositiveSequence));
    if (requested.size === 0) return true;
    const lineage = parseCollectorLineage(
      await options.storage.getItem(LOCATION_LINEAGE_KEY),
    );
    const blocked = lineage.collectors.some((entry) =>
      requested.has(entry.generation) &&
      (entry.drainedThroughSequence === null ||
        (entry.resolution !== 'sealed' && entry.resolution !== 'discarded')),
    );
    if (blocked) return false;
    await options.storage.setItem(LOCATION_LINEAGE_KEY, JSON.stringify({
      ...lineage,
      collectors: lineage.collectors.filter(
        (entry) => !requested.has(entry.generation),
      ),
    } satisfies CollectorLineage));
    return true;
  }

  function compactOrphanCollectorLineage(): Promise<void> {
    return serializeAuthoritativeMutation(async () => {
      const rawPoints = await options.storage.getItem(POINTS_KEY);
      const parsed = parseStoredBlob(rawPoints);
      if (rawPoints !== null && !parsed) {
        throw new Error('Authoritative location recording is corrupt');
      }
      const lineage = parseCollectorLineage(
        await options.storage.getItem(LOCATION_LINEAGE_KEY),
      );
      const referencedLeases = parsed?.kind === 'current'
        ? parsed.blob.locationLeases.filter((lease) =>
            lease.collectorGeneration > 0 &&
            leaseMatchesRecording(lease, parsed.blob),
          )
        : [];
      const collectors = lineage.collectors.filter((entry) =>
        referencedLeases.some((lease) =>
          entry.generation === lease.collectorGeneration &&
          entry.leaseId === lease.id &&
          entry.session === lease.session &&
          entry.activityId === lease.activityId &&
          entry.ownerId === lease.ownerId &&
          entry.startedAt === lease.startedAt &&
          entry.activatedAt === lease.activatedAt,
        ),
      );
      if (collectors.length === lineage.collectors.length) return;
      // The monotonic high-water mark is the owner-redacted tombstone for
      // every burned generation. Orphan owner/session/activity bytes are no
      // longer needed once no authoritative lease references them.
      await options.storage.setItem(LOCATION_LINEAGE_KEY, JSON.stringify({
        ...lineage,
        collectors,
      } satisfies CollectorLineage));
    });
  }

  async function sweepLegacyQuarantineBatchesUnlocked(
    removeUnprovable = false,
  ): Promise<void> {
    const rawQuarantine = await options.storage.getItem(
      LEGACY_LOCATION_QUARANTINE_KEY,
    );
    if (rawQuarantine === null) return;
    if (!isLegacyLocationQuarantine(rawQuarantine)) {
      throw new Error('Legacy location quarantine is corrupt');
    }
    requireJournalEnumeration(options.storage);
    const keys = (await options.storage.getAllKeys()).filter((key) =>
      key.startsWith(LOCATION_BATCH_PREFIX),
    );
    for (const key of keys) {
      const raw = await options.storage.getItem(key);
      if (raw === null) continue;
      const batch = parseLocationTaskBatch(raw);
      // A normal boot only removes proven generation-zero callbacks. During
      // explicit legacy discard, malformed bytes are also conservatively
      // attributable because no positive-generation recording can own them.
      if (
        batch?.collectorGeneration === null ||
        (removeUnprovable && batch === null)
      ) {
        await options.storage.removeItem(key);
      }
    }
  }

  function sweepLegacyQuarantineBatches(): Promise<void> {
    return serializeLocationJournalMutation(() =>
      sweepLegacyQuarantineBatchesUnlocked(),
    );
  }

  async function persistLegacyQuarantineFor(
    blob: RecordingBlob,
  ): Promise<void> {
    if (!blob.locationLeases.some((lease) =>
      leaseMatchesRecording(lease, blob) && lease.collectorGeneration === 0,
    )) {
      return;
    }
    // This permanent, owner-redacted high-water tombstone is intentionally
    // tiny. Modern collectors always use positive immutable generations, so
    // every later generation-zero callback is stale legacy data.
    await options.storage.setItem(
      LEGACY_LOCATION_QUARANTINE_KEY,
      LEGACY_LOCATION_QUARANTINE_VALUE,
    );
  }

  function collectorGenerationsFor(blob: RecordingBlob): number[] {
    return [...new Set(blob.locationLeases
      .filter((lease) =>
        leaseMatchesRecording(lease, blob) &&
        lease.collectorGeneration > 0,
      )
      .map((lease) => lease.collectorGeneration))];
  }

  async function nextSafeCollectorGeneration(
    blob: RecordingBlob,
    lineage: CollectorLineage,
  ): Promise<number> {
    requireJournalEnumeration(options.storage);
    let maximumObserved = Math.max(
      lineage.nextGeneration - 1,
      ...blob.locationLeases
        .filter((lease) =>
          leaseMatchesRecording(lease, blob) &&
          isPositiveSequence(lease.collectorGeneration),
        )
        .map((lease) => lease.collectorGeneration),
    );
    const evidenceKeys = (await options.storage.getAllKeys()).filter((key) =>
      key.startsWith(LOCATION_BATCH_PREFIX) ||
      key.startsWith(LOCATION_CLEANUP_PREFIX),
    ).sort();
    for (const key of evidenceKeys) {
      const raw = await options.storage.getItem(key);
      if (key.startsWith(LOCATION_BATCH_PREFIX)) {
        const batch = parseLocationTaskBatch(raw);
        if (!batch) throw new Error('Location generation evidence is corrupt');
        if (isPositiveSequence(batch.collectorGeneration)) {
          maximumObserved = Math.max(
            maximumObserved,
            batch.collectorGeneration,
          );
        }
        continue;
      }
      const receipt = parseExactCleanupReceipt(raw);
      if (!receipt) throw new Error('Location generation evidence is corrupt');
      for (const generation of receipt.collectorGenerations) {
        maximumObserved = Math.max(maximumObserved, generation);
      }
    }
    if (maximumObserved >= Number.MAX_SAFE_INTEGER - 1) {
      throw new Error('Collector generation space is exhausted');
    }
    return maximumObserved + 1;
  }

  function begin(
    ownerId: string,
    type: NewActivity['type'] = 'run',
  ): Promise<TrackRecordingIdentity> {
    return retryPendingExactCleanup().then(() =>
      serializeAuthoritativeMutation(async () => {
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
        resumeAfterOwnerCheck: false,
        state: 'paused',
        terminal: null,
      };

      await options.storage.setItem(POINTS_KEY, JSON.stringify(blob));
      await options.storage.removeItem(SESSION_KEY).catch(() => undefined);
      return identityOf(blob);
      }),
    );
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
        return {
          kind: 'legacy_unprovable',
          discardToken: legacyDiscardToken(raw!, options.fingerprint),
        };
      }

      await options.storage.setItem(POINTS_KEY, JSON.stringify(parsed.blob));
      if (!currentOwnerId || parsed.blob.ownerId !== currentOwnerId) {
        return {
          kind: 'owner_mismatch',
          activityId: parsed.blob.activityId,
          ownerId: parsed.blob.ownerId,
        };
      }
      if (
        parsed.blob.terminal?.phase === 'closing' ||
        parsed.blob.terminal?.resolution === 'discarding'
      ) {
        return {
          kind: 'closing',
          identity: identityOf(parsed.blob),
          finishId: parsed.blob.terminal.finishId,
          type: parsed.blob.terminal.summary.type,
          durationS: parsed.blob.terminal.summary.durationS,
          ...(parsed.blob.terminal.quarantineReason
            ? { quarantineReason: parsed.blob.terminal.quarantineReason }
            : {}),
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
    _type: NewActivity['type'] = 'run',
  ): Promise<TrackRecordingRecovery> {
    return serializeAuthoritativeMutation(async () => {
      if (!ownerId.trim()) throw new Error('A signed-in owner is required');
      const raw = await options.storage.getItem(POINTS_KEY);
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
        return parsed.blob.terminal?.phase === 'closing' ||
          parsed.blob.terminal?.resolution === 'discarding'
          ? {
                kind: 'closing',
                identity: identityOf(parsed.blob),
                finishId: parsed.blob.terminal.finishId,
                type: parsed.blob.terminal.summary.type,
                durationS: parsed.blob.terminal.summary.durationS,
                ...(parsed.blob.terminal.quarantineReason
                  ? {
                      quarantineReason:
                        parsed.blob.terminal.quarantineReason,
                    }
                  : {}),
              }
          : parsed.blob.completed
            ? {
                kind: 'completed',
                finalized: finalizedFromBlob(parsed.blob)!,
              }
            : {
              kind: 'active',
              ...identityOf(parsed.blob),
              type: parsed.blob.type,
              points: await mergedPointsFor(parsed.blob),
            };
      }

      return {
        kind: 'legacy_unprovable',
        discardToken: legacyDiscardToken(raw!, options.fingerprint),
      };
    });
  }

  function discardLegacyUnprovable(
    discardToken: string,
  ): Promise<'discarded' | 'stale'> {
    return serializeAuthoritativeMutation(async () => {
      const raw = await options.storage.getItem(POINTS_KEY);
      if (
        raw === null ||
        parseStoredBlob(raw)?.kind !== 'legacy' ||
        legacyDiscardToken(raw, options.fingerprint) !== discardToken
      ) {
        return 'stale';
      }
      // Persist the owner-redacted sweep tombstone first. A queued callback
      // from the legacy TaskManager can arrive after these exact bytes are
      // removed and must still be deleted before any future owner is shown.
      await serializeLocationJournalMutation(async () => {
        await options.storage.setItem(
          LEGACY_LOCATION_QUARANTINE_KEY,
          LEGACY_LOCATION_QUARANTINE_VALUE,
        );
        await sweepLegacyQuarantineBatchesUnlocked(true);
      });
      await options.storage.removeItem(SESSION_KEY);
      await options.storage.removeItem(POINTS_KEY);
      return 'discarded';
    });
  }

  async function readPoints(): Promise<Pt[]> {
    const raw = await options.storage.getItem(POINTS_KEY);
    const parsed = parseStoredBlob(raw);
    if (!parsed) return [];
    if (parsed.kind === 'current') {
      return mergedPointsFor(parsed.blob);
    }
    return [];
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
          resolution: 'sealed',
          resolutionId: finishId,
          quarantineReason: null,
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
      !parsed.blob.completed ||
      parsed.blob.terminal?.resolution === 'discarding'
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
    reservedCollectorGeneration?: number,
  ): Promise<LocationTaskLease | null> {
    return serializeAuthoritativeMutation(async () => {
      requireJournalEnumeration(options.storage);
      if (
        reservedCollectorGeneration !== undefined &&
        (!isPositiveSequence(reservedCollectorGeneration) ||
          reservedCollectorGeneration >= Number.MAX_SAFE_INTEGER)
      ) {
        throw new Error('Reserved collector generation is invalid');
      }
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
      const lineage = parseCollectorLineage(
        await options.storage.getItem(LOCATION_LINEAGE_KEY),
      );
      const minimumGeneration = await nextSafeCollectorGeneration(
        parsed.blob,
        lineage,
      );
      if (
        reservedCollectorGeneration !== undefined &&
        reservedCollectorGeneration < minimumGeneration
      ) {
        throw new Error('Reserved collector generation is stale');
      }
      const collectorGeneration =
        reservedCollectorGeneration ?? minimumGeneration;

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
        collectorGeneration,
        drainedThroughSequence: null,
      };
      const lineageEntry: CollectorLineageEntry = {
        generation: collectorGeneration,
        leaseId,
        session: parsed.blob.session,
        activityId: parsed.blob.activityId,
        ownerId: parsed.blob.ownerId,
        startedAt: parsed.blob.startedAt,
        activatedAt: nonOverlappingActivatedAt,
        revokedAtExclusive: null,
        drainedThroughSequence: null,
        resolution: 'active',
      };
      await options.storage.setItem(
        LOCATION_LINEAGE_KEY,
        JSON.stringify({
          ...lineage,
          nextGeneration: Math.max(
            lineage.nextGeneration,
            collectorGeneration + 1,
          ),
          collectors: [...lineage.collectors, lineageEntry],
        } satisfies CollectorLineage),
      );
      await options.storage.setItem(
        POINTS_KEY,
        JSON.stringify({
          ...parsed.blob,
          revision: parsed.blob.revision + 1,
          resumeAfterOwnerCheck: false,
          state: 'recording',
          locationLeases: [...parsed.blob.locationLeases, lease],
        }),
      );
      return lease;
    });
  }

  function prepareTaskLeaseGeneration(
    identity: TrackRecordingIdentity,
  ): Promise<
    | { kind: 'stale' }
    | { kind: 'active'; lease: LocationTaskLease }
    | { kind: 'reserve'; minimumGeneration: number }
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
      const active = activeLeaseOf(parsed.blob);
      if (active) return { kind: 'active', lease: active };
      const lineage = parseCollectorLineage(
        await options.storage.getItem(LOCATION_LINEAGE_KEY),
      );
      return {
        kind: 'reserve',
        minimumGeneration: await nextSafeCollectorGeneration(
          parsed.blob,
          lineage,
        ),
      };
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
        if (latest && latest.revokedAtExclusive !== null) {
          await updateCollectorLineageEntry(latest, {
            revokedAtExclusive: latest.revokedAtExclusive,
            resolution: 'paused',
          });
        }
        return {
          kind: 'already_paused',
          lease: latest?.revokedAtExclusive !== null ? latest : null,
        };
      }

      const safeRevokedAtExclusive = Math.max(
        revokedAtExclusive,
        current.activatedAt,
      );
      const lease = {
        ...current,
        revokedAtExclusive: safeRevokedAtExclusive,
      };
      await options.storage.setItem(
        POINTS_KEY,
        JSON.stringify({
          ...parsed.blob,
          revision: parsed.blob.revision + 1,
          resumeAfterOwnerCheck: false,
          state: 'paused',
          locationLeases: parsed.blob.locationLeases.map((candidate) =>
            candidate.id === lease.id ? lease : candidate,
          ),
        }),
      );
      await updateCollectorLineageEntry(lease, {
        revokedAtExclusive: safeRevokedAtExclusive,
        resolution: 'paused',
      });
      return { kind: 'suspended', lease };
    });
  }

  function prepareCollectorForOwner(
    currentOwnerId: string | null,
    revokedAtExclusive = options.nowMs(),
  ): Promise<
    | { kind: 'exact_owner' | 'paused' | 'none' }
    | { kind: 'resume'; identity: TrackRecordingIdentity }
  > {
    return serializeAuthoritativeMutation(async () => {
      const raw = await options.storage.getItem(POINTS_KEY);
      const parsed = parseStoredBlob(raw);
      if (raw !== null && !parsed) {
        throw new Error('Authoritative location recording is corrupt');
      }
      if (parsed?.kind !== 'current') return { kind: 'none' };
      const current = activeLeaseOf(parsed.blob);
      if (!current) {
        if (
          parsed.blob.resumeAfterOwnerCheck &&
          parsed.blob.terminal === null &&
          parsed.blob.completed === null &&
          typeof currentOwnerId === 'string' &&
          currentOwnerId.length > 0 &&
          parsed.blob.ownerId === currentOwnerId
        ) {
          return { kind: 'resume', identity: identityOf(parsed.blob) };
        }
        return { kind: 'none' };
      }
      if (
        typeof currentOwnerId === 'string' &&
        currentOwnerId.length > 0 &&
        parsed.blob.ownerId === currentOwnerId
      ) {
        return { kind: 'exact_owner' };
      }

      const safeRevokedAtExclusive = Math.max(
        revokedAtExclusive,
        current.activatedAt,
      );
      const lease: LocationTaskLease = {
        ...current,
        revokedAtExclusive: safeRevokedAtExclusive,
      };
      await options.storage.setItem(POINTS_KEY, JSON.stringify({
        ...parsed.blob,
        revision: parsed.blob.revision + 1,
        resumeAfterOwnerCheck: parsed.blob.terminal === null,
        state: parsed.blob.terminal ? parsed.blob.state : 'paused',
        locationLeases: parsed.blob.locationLeases.map((candidate) =>
          candidate.id === lease.id ? lease : candidate,
        ),
      } satisfies RecordingBlob));
      await updateCollectorLineageEntry(lease, {
        revokedAtExclusive: safeRevokedAtExclusive,
        resolution: parsed.blob.terminal ? 'closing' : 'paused',
      });
      return { kind: 'paused' };
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

  function readCollectorDirective(): Promise<{
    activeLease: LocationTaskLease | null;
    undrainedLeases: LocationTaskLease[];
    recordingStatus: 'active' | 'paused' | 'closing';
  }> {
    return serializeAuthoritativeMutation(async () => {
      const parsed = parseStoredBlob(
        await options.storage.getItem(POINTS_KEY),
      );
      if (parsed?.kind !== 'current') {
        return {
          activeLease: null,
          undrainedLeases: [],
          recordingStatus: 'paused',
        };
      }
      const leases = parsed.blob.locationLeases.filter((lease) =>
        leaseMatchesRecording(lease, parsed.blob),
      );
      return {
        activeLease: activeLeaseOf(parsed.blob),
        undrainedLeases: leases.filter((lease) =>
          lease.collectorGeneration > 0 &&
          lease.drainedThroughSequence === null,
        ),
        recordingStatus: parsed.blob.terminal?.phase === 'closing'
          ? 'closing'
          : activeLeaseOf(parsed.blob)
            ? 'active'
            : 'paused',
      };
    });
  }

  function markTrackingIncompleteForGeneration(
    generation: number,
  ): Promise<'marked' | 'burned' | 'unavailable'> {
    return serializeAuthoritativeMutation(async () => {
      const raw = await options.storage.getItem(POINTS_KEY);
      const parsed = parseStoredBlob(raw);
      if (raw !== null && parsed?.kind !== 'current') return 'unavailable';
      if (parsed?.kind !== 'current') return 'burned';
      const matching = parsed.blob.locationLeases.find((lease) =>
        leaseMatchesRecording(lease, parsed.blob) &&
        lease.collectorGeneration === generation,
      );
      if (!matching) return 'burned';
      if (
        parsed.blob.terminal?.phase === 'sealed' &&
        parsed.blob.terminal.resolution !== 'discarding'
      ) {
        return 'burned';
      }
      const cutoff = Math.max(matching.activatedAt, options.nowMs());
      const locationLeases = parsed.blob.locationLeases.map((lease) =>
        lease.id === matching.id && lease.revokedAtExclusive === null
          ? { ...lease, revokedAtExclusive: cutoff }
          : lease,
      );
      const terminal = trackingIncompleteTerminal(
        parsed.blob,
        parsed.blob.terminal,
      );
      await options.storage.setItem(POINTS_KEY, JSON.stringify({
        ...parsed.blob,
        revision: parsed.blob.revision + 1,
        completed: null,
        locationLeases,
        resumeAfterOwnerCheck: false,
        state: 'closing',
        terminal,
      } satisfies RecordingBlob));
      await updateCollectorLineageEntry({
        ...matching,
        revokedAtExclusive: matching.revokedAtExclusive ?? cutoff,
      }, {
        revokedAtExclusive: matching.revokedAtExclusive ?? cutoff,
        resolution: 'closing',
      }).catch(() => undefined);
      return 'marked';
    });
  }

  function markClosingTrackingIncomplete(
    identity: TrackRecordingIdentity,
    finishId: string,
    resolutionId: string,
  ): Promise<boolean> {
    return serializeAuthoritativeMutation(async () => {
      const parsed = parseStoredBlob(
        await options.storage.getItem(POINTS_KEY),
      );
      if (
        parsed?.kind !== 'current' ||
        !recordingMatchesIdentity(parsed.blob, identity) ||
        parsed.blob.terminal?.phase !== 'closing' ||
        parsed.blob.terminal.resolution !== 'closing' ||
        parsed.blob.terminal.finishId !== finishId ||
        parsed.blob.terminal.resolutionId !== resolutionId
      ) {
        return false;
      }
      await options.storage.setItem(POINTS_KEY, JSON.stringify({
        ...parsed.blob,
        revision: parsed.blob.revision + 1,
        completed: null,
        state: 'closing',
        terminal: trackingIncompleteTerminal(
          parsed.blob,
          parsed.blob.terminal,
        ),
      } satisfies RecordingBlob));
      return true;
    });
  }

  function persistCollectorDrainProof(
    generation: number,
    throughSequence: number,
    outcome: 'exact' | 'discard-only' = 'exact',
  ): Promise<'persisted' | 'orphan'> {
    return serializeAuthoritativeMutation(async () => {
      if (
        !Number.isSafeInteger(generation) || generation <= 0 ||
        generation >= Number.MAX_SAFE_INTEGER ||
        !Number.isSafeInteger(throughSequence) || throughSequence < 0
      ) {
        throw new Error('Invalid collector drain proof');
      }
      const lineage = parseCollectorLineage(
        await options.storage.getItem(LOCATION_LINEAGE_KEY),
      );
      const lineageEntry = lineage.collectors.find(
        (entry) => entry.generation === generation,
      );
      if (lineageEntry) {
        await updateCollectorLineageEntry({
          schema: 1,
          id: lineageEntry.leaseId,
          ordinal: 0,
          session: lineageEntry.session,
          activityId: lineageEntry.activityId,
          ownerId: lineageEntry.ownerId,
          startedAt: lineageEntry.startedAt,
          activatedAt: lineageEntry.activatedAt,
          revokedAtExclusive: lineageEntry.revokedAtExclusive,
          collectorGeneration: lineageEntry.generation,
          drainedThroughSequence: lineageEntry.drainedThroughSequence,
        }, {
          drainedThroughSequence: throughSequence,
        });
      } else if (lineage.nextGeneration <= generation) {
        // An orphan can come from an older install whose authoritative bytes
        // are gone. Advancing the durable clock is its tombstone: this exact
        // generation can never later be leased to another owner.
        await options.storage.setItem(
          LOCATION_LINEAGE_KEY,
          JSON.stringify({
            ...lineage,
            nextGeneration: generation + 1,
          } satisfies CollectorLineage),
        );
      }

      const rawPoints = await options.storage.getItem(POINTS_KEY);
      const parsed = parseStoredBlob(rawPoints);
      if (rawPoints !== null && !parsed) {
        throw new Error('Authoritative location recording is corrupt');
      }
      if (parsed?.kind !== 'current') {
        if (parsed?.kind === 'legacy') {
          throw new Error('Ownerless legacy recording cannot adopt generation');
        }
        return 'orphan';
      }
      let matched = false;
      const locationLeases = parsed.blob.locationLeases.map((lease) => {
        if (
          lease.collectorGeneration !== generation ||
          (lineageEntry && (
            lease.id !== lineageEntry.leaseId ||
            !leaseMatchesRecording(lease, parsed.blob)
          ))
        ) {
          return lease;
        }
        matched = true;
        return { ...lease, drainedThroughSequence: throughSequence };
      });
      if (matched) {
        const nextBlob = outcome === 'discard-only'
          ? {
              ...parsed.blob,
              completed: null,
              resumeAfterOwnerCheck: false,
              state: 'closing' as const,
              terminal: trackingIncompleteTerminal(
                parsed.blob,
                parsed.blob.terminal,
              ),
            }
          : parsed.blob;
        await options.storage.setItem(POINTS_KEY, JSON.stringify({
          ...nextBlob,
          revision: parsed.blob.revision + 1,
          locationLeases,
        } satisfies RecordingBlob));
      }
      return matched ? 'persisted' : 'orphan';
    });
  }

  function readBlobForIdentity(
    identity: TrackRecordingIdentity,
  ): Promise<RecordingBlob | null> {
    return serializeAuthoritativeMutation(async () => {
      const parsed = parseStoredBlob(
        await options.storage.getItem(POINTS_KEY),
      );
      return parsed?.kind === 'current' &&
        recordingMatchesIdentity(parsed.blob, identity)
        ? parsed.blob
        : null;
    });
  }

  function readDiscardingResolution(): Promise<{
    identity: TrackRecordingIdentity;
    blob: RecordingBlob;
  } | null> {
    return serializeAuthoritativeMutation(async () => {
      const parsed = parseStoredBlob(
        await options.storage.getItem(POINTS_KEY),
      );
      if (
        parsed?.kind !== 'current' ||
        parsed.blob.terminal?.resolution !== 'discarding'
      ) {
        return null;
      }
      return { identity: identityOf(parsed.blob), blob: parsed.blob };
    });
  }

  async function classifyPersistedNativeBatch(
    generation: number,
  ): Promise<'persisted' | 'discard-only' | 'rejected'> {
    const rawPoints = await options.storage.getItem(POINTS_KEY);
    const parsed = parseStoredBlob(rawPoints);
    if (rawPoints !== null && parsed?.kind !== 'current') return 'rejected';
    if (parsed?.kind !== 'current') return 'discard-only';
    const matchingLease = parsed.blob.locationLeases.find((lease) =>
      leaseMatchesRecording(lease, parsed.blob) &&
      lease.collectorGeneration === generation,
    );
    if (
      !matchingLease ||
      (parsed.blob.terminal?.phase === 'sealed' &&
        parsed.blob.terminal.resolution !== 'discarding')
    ) {
      return 'discard-only';
    }
    if (parsed.blob.terminal?.quarantineReason === 'tracking_incomplete') {
      return 'discard-only';
    }
    if (!options.storage.getAllKeys) {
      return (await markTrackingIncompleteForGeneration(generation)) === 'marked'
        ? 'discard-only'
        : 'rejected';
    }
    let totalBytes = 0;
    let totalSamples = 0;
    let malformed = false;
    const keys = (await options.storage.getAllKeys()).filter((key) =>
      key.startsWith(LOCATION_BATCH_PREFIX),
    );
    for (const key of keys) {
      const raw = await options.storage.getItem(key);
      if (raw === null) continue;
      totalBytes += utf8ByteLength(raw);
      const batch = parseLocationTaskBatch(raw);
      if (!batch) {
        malformed = true;
      } else {
        totalSamples += batch.samples.length;
      }
      if (
        totalBytes > MAX_LOCATION_JOURNAL_BYTES ||
        totalSamples > MAX_LOCATION_JOURNAL_SAMPLES
      ) {
        break;
      }
    }
    if (
      !malformed &&
      totalBytes <= MAX_LOCATION_JOURNAL_BYTES &&
      totalSamples <= MAX_LOCATION_JOURNAL_SAMPLES
    ) {
      return 'persisted';
    }
    return (await markTrackingIncompleteForGeneration(generation)) === 'marked'
      ? 'discard-only'
      : 'rejected';
  }

  async function appendNativeTaskSamples(
    samples: LocationTaskSample[],
    collectorGeneration: number | null = null,
    nativeBatchId?: string,
  ): Promise<'persisted' | 'discard-only' | 'rejected'> {
    const receivedAt = options.nowMs();
    const normalizedGeneration =
      typeof collectorGeneration === 'number' &&
      Number.isSafeInteger(collectorGeneration) &&
      collectorGeneration > 0
        ? collectorGeneration
        : null;
    const exactNativeBatchId = normalizedGeneration !== null &&
        isNativeCollectorBatchId(nativeBatchId)
      ? nativeBatchId
      : null;
    const boundedSamples = samples.slice(0, MAX_LOCATION_BATCH_SAMPLES);
    if (
      normalizedGeneration !== null &&
      (samples.length > MAX_LOCATION_BATCH_SAMPLES ||
        boundedSamples.some((sample) =>
          !isValidRawLocationTaskSample(sample) ||
          !isPositiveSequence(sample.nativeSequence)
        ))
    ) {
      return 'rejected';
    }
    const validSamples = boundedSamples
      .filter((sample) =>
        isValidRawLocationTaskSample(sample) &&
        (normalizedGeneration !== null ||
          sample.capturedAt <= receivedAt + MAX_LOCATION_FUTURE_DRIFT_MS) &&
        (normalizedGeneration === null || isPositiveSequence(
          sample.nativeSequence,
        )),
      )
      .map((sample) => ({
        ...sample,
        nativeSequence: isPositiveSequence(sample.nativeSequence)
          ? sample.nativeSequence
          : null,
      }));
    if (validSamples.length === 0) return 'rejected';
    const batchId = exactNativeBatchId ?? options.createChunkId();
    const batch: LocationTaskBatch = {
      schema: 1,
      batchId,
      collectorGeneration: normalizedGeneration,
      // Exact native replays must serialize identically even after a process
      // restart or wall-clock correction. Positive generations use sequence,
      // not wall time, as their ordering/ownership authority.
      receivedAt: exactNativeBatchId
        ? Math.max(...validSamples.map((sample) => sample.capturedAt))
        : receivedAt,
      samples: validSamples,
    };
    const serialized = JSON.stringify(batch);
    if (utf8ByteLength(serialized) > MAX_LOCATION_BATCH_BYTES) {
      return 'rejected';
    }
    const batchKey = exactNativeBatchId
      ? `${LOCATION_BATCH_PREFIX}native:${normalizedGeneration}:` +
        exactNativeBatchId
      : `${LOCATION_BATCH_PREFIX}${batchId}`;
    return serializeLocationJournalMutation(async () => {
      if (exactNativeBatchId) {
        const existing = await options.storage.getItem(batchKey);
        if (existing !== null && existing !== serialized) {
          // A native batch ID is immutable within its exact generation. Keep
          // the first durable bytes, bound every conflicting replay to this
          // one key, and make the whole generation discard-only.
          const marked = await markTrackingIncompleteForGeneration(
            normalizedGeneration!,
          );
          if (marked === 'burned') {
            await options.storage.removeItem(batchKey);
            return 'discard-only';
          }
          return marked === 'marked' ? 'discard-only' : 'rejected';
        }
        if (existing === null) {
          await options.storage.setItem(batchKey, serialized);
        }
      } else {
      // This must remain the first awaited storage action: owner/session reads
      // before the immutable write can cross-account-assign a background batch.
        await options.storage.setItem(batchKey, serialized);
      }
      if (normalizedGeneration === null) {
        const quarantine = await options.storage.getItem(
          LEGACY_LOCATION_QUARANTINE_KEY,
        );
        if (quarantine !== null && isLegacyLocationQuarantine(quarantine)) {
          await options.storage.removeItem(batchKey);
        }
        return 'persisted';
      }
      const disposition = await classifyPersistedNativeBatch(
        normalizedGeneration,
      );
      if (disposition === 'discard-only') {
        await options.storage.removeItem(batchKey);
      } else if (disposition === 'rejected' && exactNativeBatchId) {
        // Native still owns the unacknowledged source batch and will replay it
        // after authority recovers. Do not retain an unassignable JS copy.
        await options.storage.removeItem(batchKey);
      }
      return disposition;
    });
  }

  async function appendTaskSamples(
    samples: LocationTaskSample[],
    collectorGeneration: number | null = null,
  ): Promise<boolean> {
    return (await appendNativeTaskSamples(samples, collectorGeneration)) !==
      'rejected';
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
          (batch.collectorGeneration ?? 0) === lease.collectorGeneration &&
          (lease.collectorGeneration > 0
            ? isPositiveSequence(sample.nativeSequence) &&
              (lease.drainedThroughSequence === null ||
                sample.nativeSequence <= lease.drainedThroughSequence)
            : sample.capturedAt >= lease.activatedAt &&
              (lease.revokedAtExclusive === null ||
                sample.capturedAt < lease.revokedAtExclusive)),
        ),
      );
      if (eligible.length === 0) return [];
      includedChunkIds.push(batch.batchId);
      return eligible.flatMap((sample) => {
        const fingerprint = locationSampleFingerprint(
          sample,
          options.fingerprint,
          batch.collectorGeneration,
        );
        if (seenSamples.has(fingerprint)) return [];
        seenSamples.add(fingerprint);
        return [{
          ...sample,
          collectorGeneration: batch.collectorGeneration,
          fingerprint,
          key,
        }];
      });
    });
    journalSamples.sort((left, right) =>
      compareLocationTaskSamples(left, right) ||
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
      if (
        parsed.blob.terminal?.phase === 'sealed' &&
        parsed.blob.terminal.resolution !== 'discarding'
      ) {
        return {
          kind: 'sealed',
          finalized: parsed.blob.terminal.finalized!,
        };
      }
      if (parsed.blob.terminal?.resolution === 'discarding') {
        return { kind: 'stale' };
      }
      if (
        parsed.blob.terminal?.phase === 'closing' &&
        parsed.blob.terminal.resolution === 'closing'
      ) {
        // Parsing can upgrade legacy or malformed evidence into a durable
        // discard-only terminal. Persist that normalization before returning
        // so a process death cannot expose the old active/shareable shape.
        await options.storage.setItem(POINTS_KEY, JSON.stringify(parsed.blob));
        const latest = latestLeaseOf(parsed.blob);
        if (latest) {
          await updateCollectorLineageEntry(latest, {
            revokedAtExclusive: latest.revokedAtExclusive,
            drainedThroughSequence: latest.drainedThroughSequence,
            resolution: 'closing',
          });
        }
        return { kind: 'closing', blob: parsed.blob };
      }

      const activeLease = activeLeaseOf(parsed.blob);
      const latestLease = latestLeaseOf(parsed.blob);
      const minimumCutoff = activeLease?.activatedAt ??
        latestLease?.revokedAtExclusive ??
        cutoffExclusive;
      const safeCutoffExclusive = Math.max(
        cutoffExclusive,
        minimumCutoff,
      );
      const locationLeases = activeLease
        ? parsed.blob.locationLeases.map((lease) =>
            lease.id === activeLease.id
              ? { ...lease, revokedAtExclusive: safeCutoffExclusive }
              : lease,
          )
        : parsed.blob.locationLeases;
      const terminal: RecordingTerminal = {
        phase: 'closing',
        resolution: 'closing',
        resolutionId: finishId,
        quarantineReason: locationLeases.some(
          (lease) => lease.collectorGeneration === 0,
        )
          ? 'legacy_unprovable'
          : null,
        finishId,
        snapshotId,
        cutoffExclusive: safeCutoffExclusive,
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
        resumeAfterOwnerCheck: false,
        state: 'closing',
        locationLeases,
        terminal,
      };
      await options.storage.setItem(POINTS_KEY, JSON.stringify(closing));
      const closingLease = activeLease
        ? locationLeases.find((lease) => lease.id === activeLease.id) ?? null
        : latestLease;
      if (closingLease) {
        await updateCollectorLineageEntry(closingLease, {
          revokedAtExclusive: closingLease.revokedAtExclusive,
          resolution: 'closing',
        });
      }
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
      collectorGeneration: number | null;
      fingerprint: string;
      key: string;
    })[] = [];
    const consumedJournalEntries: ConsumedJournalEntry[] = [];
    const contributingBatches: string[] = [];
    const sequenceFingerprints = new Map<number, Map<number, string>>();
    const positiveLeases = leases.filter((lease) =>
      lease.collectorGeneration > 0,
    );
    if (
      new Set(positiveLeases.map((lease) => lease.collectorGeneration)).size !==
      positiveLeases.length
    ) {
      return { kind: 'corrupt' };
    }
    for (const lease of positiveLeases) {
      sequenceFingerprints.set(lease.collectorGeneration, new Map());
    }

    const sampleIsEligible = (
      sample: LocationTaskSample,
      collectorGeneration: number | null,
    ) =>
      leases.some((lease) =>
        (collectorGeneration ?? 0) === lease.collectorGeneration &&
        (lease.collectorGeneration > 0
          ? isPositiveSequence(sample.nativeSequence) &&
            lease.drainedThroughSequence !== null &&
            sample.nativeSequence <= lease.drainedThroughSequence
          : sample.capturedAt < terminalCutoff &&
            sample.capturedAt >= lease.activatedAt &&
            (lease.revokedAtExclusive === null ||
              sample.capturedAt < lease.revokedAtExclusive)),
      );

    for (const key of keys) {
      const batch = parseLocationTaskBatch(
        await options.storage.getItem(key),
      );
      if (!batch) return { kind: 'corrupt' };
      const sampleFingerprints = batch.samples
        .map((sample) =>
          locationSampleFingerprint(
            sample,
            options.fingerprint,
            batch.collectorGeneration,
          ),
        )
        .sort();
      const batchFingerprint = options.fingerprint(JSON.stringify({
        collectorGeneration: batch.collectorGeneration,
        sampleFingerprints,
      }));
      const exactLease = positiveLeases.find((lease) =>
        lease.collectorGeneration === batch.collectorGeneration,
      );
      if (exactLease) {
        if (exactLease.drainedThroughSequence === null) {
          return { kind: 'corrupt' };
        }
        const bySequence = sequenceFingerprints.get(
          exactLease.collectorGeneration,
        )!;
        for (const sample of batch.samples) {
          if (
            !isPositiveSequence(sample.nativeSequence) ||
            sample.nativeSequence > exactLease.drainedThroughSequence
          ) {
            return { kind: 'corrupt' };
          }
          const fingerprint = locationSampleFingerprint(
            sample,
            options.fingerprint,
            batch.collectorGeneration,
          );
          const existing = bySequence.get(sample.nativeSequence);
          if (existing !== undefined && existing !== fingerprint) {
            return { kind: 'corrupt' };
          }
          bySequence.set(sample.nativeSequence, fingerprint);
        }
      }
      const eligible = batch.samples.filter((sample) =>
        sampleIsEligible(sample, batch.collectorGeneration),
      );
      if (eligible.length > 0) {
        contributingBatches.push(`${key}\u0000${batchFingerprint}`);
      }
      const exactClosedGeneration = leases.some((lease) =>
        lease.collectorGeneration > 0 &&
        lease.collectorGeneration === batch.collectorGeneration &&
        lease.drainedThroughSequence !== null,
      );
      if (
        exactClosedGeneration ||
        (batch.samples.length > 0 && batch.samples.every((sample) =>
          sampleIsEligible(sample, batch.collectorGeneration),
        ))
      ) {
        consumedJournalEntries.push({ key, batchFingerprint });
      }
      for (const sample of eligible) {
        const fingerprint = locationSampleFingerprint(
          sample,
          options.fingerprint,
          batch.collectorGeneration,
        );
        if (seenSamples.has(fingerprint)) continue;
        seenSamples.add(fingerprint);
        samples.push({
          ...sample,
          collectorGeneration: batch.collectorGeneration,
          fingerprint,
          key,
        });
      }
    }

    for (const lease of positiveLeases) {
      if (
        lease.drainedThroughSequence === null ||
        sequenceFingerprints.get(lease.collectorGeneration)!.size !==
          lease.drainedThroughSequence
      ) {
        return { kind: 'corrupt' };
      }
    }

    samples.sort((left, right) =>
      compareLocationTaskSamples(left, right) ||
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
    resolutionId: string,
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
        parsed.blob.terminal.resolution !== 'closing' ||
        parsed.blob.terminal.quarantineReason !== null ||
        parsed.blob.terminal.finishId !== finishId ||
        parsed.blob.terminal.resolutionId !== resolutionId
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
    resolutionId: string,
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
        parsed.blob.terminal.resolution !== 'closing' ||
        parsed.blob.terminal.quarantineReason !== null ||
        parsed.blob.terminal.finishId !== finishId ||
        parsed.blob.terminal.resolutionId !== resolutionId ||
        JSON.stringify(parsed.blob.terminal.candidate) !== JSON.stringify(expected)
      ) {
        return null;
      }
      const terminal = parsed.blob.terminal;
      const fullDistanceM = Math.min(
        MAX_ACTIVITY_DISTANCE_M,
        totalDistanceMeters(expected.route),
      );
      const durationS = Math.min(
        MAX_ACTIVITY_DURATION_S,
        Math.max(0, Math.round(terminal.summary.durationS)),
      );
      const canonicalRoute = canonicalizeRouteForQueue(expected.route, {
        activityId: parsed.blob.activityId,
        ownerId: parsed.blob.ownerId,
        type: terminal.summary.type,
        durationS,
        distanceM: fullDistanceM,
        startedAt: parsed.blob.startedAt,
      });
      const activity: NewActivity = {
        type: terminal.summary.type,
        duration_s: durationS,
        distance_m: fullDistanceM,
        route: canonicalRoute,
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
        resumeAfterOwnerCheck: false,
        state: 'sealed',
        points: expected.route,
        completed: activity,
        terminal: {
          ...terminal,
          phase: 'sealed',
          resolution: 'sealed',
          finalized,
        },
      };
      for (const lease of sealed.locationLeases) {
        if (leaseMatchesRecording(lease, sealed)) {
          await updateCollectorLineageEntry(lease, {
            revokedAtExclusive: lease.revokedAtExclusive,
            drainedThroughSequence: lease.drainedThroughSequence,
            resolution: 'sealed',
          });
        }
      }
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
        parsed.blob.terminal.resolution !== 'enqueueing' ||
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
        collectorGenerations: collectorGenerationsFor(parsed.blob),
      };
      await options.storage.setItem(receiptKey, JSON.stringify(receipt));
      await options.storage.removeItem(POINTS_KEY);
      await options.storage.removeItem(SESSION_KEY).catch(() => undefined);
      if (
        await cleanupExactEntries(entries) &&
        await compactCollectorLineage(receipt.collectorGenerations)
          .catch(() => false)
      ) {
        await options.storage.removeItem(receiptKey);
      }
      return 'acknowledged';
    });
  }

  function claimFinalizedEnqueue(
    identity: TrackRecordingIdentity,
    snapshotId: string,
  ): Promise<ClaimFinalizedEnqueueResult> {
    return serializeAuthoritativeMutation(async () => {
      const parsed = parseStoredBlob(
        await options.storage.getItem(POINTS_KEY),
      );
      if (
        parsed?.kind !== 'current' ||
        !recordingMatchesIdentity(parsed.blob, identity) ||
        parsed.blob.terminal?.phase !== 'sealed' ||
        parsed.blob.terminal.snapshotId !== snapshotId
      ) {
        return { kind: 'stale' };
      }
      if (parsed.blob.terminal.resolution === 'discarding') {
        return { kind: 'discarding' };
      }
      if (parsed.blob.terminal.resolution === 'enqueueing') {
        return { kind: 'already_claimed' };
      }
      await options.storage.setItem(POINTS_KEY, JSON.stringify({
        ...parsed.blob,
        revision: parsed.blob.revision + 1,
        terminal: {
          ...parsed.blob.terminal,
          resolution: 'enqueueing',
          resolutionId: `enqueue:${parsed.blob.terminal.resolutionId}`,
        },
      } satisfies RecordingBlob));
      return { kind: 'claimed' };
    });
  }

  function beginDiscard(
    identity: TrackRecordingIdentity,
    finishId: string,
    snapshotId: string,
    cutoffExclusive = options.nowMs(),
  ): Promise<
    | { kind: 'stale' }
    | { kind: 'completion_in_progress' }
    | { kind: 'discarding'; blob: RecordingBlob }
  > {
    return serializeAuthoritativeMutation(async () => {
      const parsed = parseStoredBlob(
        await options.storage.getItem(POINTS_KEY),
      );
      if (
        parsed?.kind !== 'current' ||
        !recordingMatchesIdentity(parsed.blob, identity)
      ) {
        return { kind: 'stale' };
      }
      if (parsed.blob.terminal?.resolution === 'enqueueing') {
        return { kind: 'completion_in_progress' };
      }
      if (parsed.blob.terminal?.resolution === 'discarding') {
        return { kind: 'discarding', blob: parsed.blob };
      }

      const activeLease = activeLeaseOf(parsed.blob);
      const latestLease = latestLeaseOf(parsed.blob);
      const safeCutoffExclusive = Math.max(
        cutoffExclusive,
        activeLease?.activatedAt ??
          latestLease?.revokedAtExclusive ??
          cutoffExclusive,
      );
      const locationLeases = activeLease
        ? parsed.blob.locationLeases.map((lease) =>
            lease.id === activeLease.id
              ? { ...lease, revokedAtExclusive: safeCutoffExclusive }
              : lease,
          )
        : parsed.blob.locationLeases;
      const existingTerminal = parsed.blob.terminal;
      const terminal: RecordingTerminal = existingTerminal
        ? {
            ...existingTerminal,
            resolution: 'discarding',
            resolutionId: finishId,
          }
        : {
            phase: 'closing',
            resolution: 'discarding',
            resolutionId: finishId,
            quarantineReason: null,
            finishId,
            snapshotId,
            cutoffExclusive: safeCutoffExclusive,
            summary: { type: parsed.blob.type, durationS: 0 },
            candidate: null,
            finalized: null,
          };
      const discarding: RecordingBlob = {
        ...parsed.blob,
        revision: parsed.blob.revision + 1,
        resumeAfterOwnerCheck: false,
        state: existingTerminal?.phase === 'sealed' ? 'sealed' : 'closing',
        locationLeases,
        terminal,
      };
      await options.storage.setItem(POINTS_KEY, JSON.stringify(discarding));
      await persistLegacyQuarantineFor(discarding);
      const closingLease = activeLease
        ? locationLeases.find((lease) => lease.id === activeLease.id) ?? null
        : latestLease;
      if (closingLease) {
        await updateCollectorLineageEntry(closingLease, {
          revokedAtExclusive: closingLease.revokedAtExclusive,
          resolution: 'closing',
        });
      }
      return { kind: 'discarding', blob: discarding };
    });
  }

  async function scanDiscardJournal(blob: RecordingBlob): Promise<JournalSnapshot> {
    requireJournalEnumeration(options.storage);
    const keys = (await options.storage.getAllKeys())
      .filter((key) => key.startsWith(LOCATION_BATCH_PREFIX))
      .sort();
    const leases = blob.locationLeases.filter((lease) =>
      leaseMatchesRecording(lease, blob),
    );
    const terminalCutoff = blob.terminal?.cutoffExclusive ?? Number.MAX_VALUE;
    const consumedJournalEntries: ConsumedJournalEntry[] = [];
    const observed: string[] = [];
    for (const key of keys) {
      const raw = await options.storage.getItem(key);
      observed.push(`${key}\u0000${options.fingerprint(raw ?? '')}`);
      const batch = parseLocationTaskBatch(raw);
      if (!batch) {
        if (raw !== null) {
          consumedJournalEntries.push({
            key,
            batchFingerprint: 'malformed',
            rawFingerprint: options.fingerprint(raw),
          });
        }
        continue;
      }
      const eligibleFor = (sample: LocationTaskSample) =>
        sample.capturedAt < terminalCutoff &&
        leases.some((lease) =>
          (batch.collectorGeneration ?? 0) === lease.collectorGeneration &&
          (lease.collectorGeneration > 0
            ? isPositiveSequence(sample.nativeSequence) &&
              lease.drainedThroughSequence !== null &&
              sample.nativeSequence <= lease.drainedThroughSequence
            : sample.capturedAt >= lease.activatedAt &&
              lease.revokedAtExclusive !== null &&
              sample.capturedAt < lease.revokedAtExclusive),
        );
      const exactClosedGeneration = leases.some((lease) =>
        lease.collectorGeneration > 0 &&
        lease.collectorGeneration === batch.collectorGeneration &&
        lease.drainedThroughSequence !== null,
      );
      const legacyDiscardGeneration =
        batch.collectorGeneration === null &&
        leases.some((lease) => lease.collectorGeneration === 0);
      if (
        batch.samples.length === 0 ||
        (!exactClosedGeneration &&
          !legacyDiscardGeneration &&
          !batch.samples.every(eligibleFor))
      ) {
        continue;
      }
      consumedJournalEntries.push({
        key,
        batchFingerprint: options.fingerprint(JSON.stringify({
          collectorGeneration: batch.collectorGeneration,
          sampleFingerprints: batch.samples
            .map((sample) =>
              locationSampleFingerprint(
                sample,
                options.fingerprint,
                batch.collectorGeneration,
              ),
            )
            .sort(),
        })),
      });
    }
    return {
      journalFingerprint: options.fingerprint(JSON.stringify(observed)),
      route: [],
      sampleFingerprints: [],
      consumedJournalEntries,
    };
  }

  function persistDiscardCandidate(
    identity: TrackRecordingIdentity,
    finishId: string,
    resolutionId: string,
    snapshot: JournalSnapshot,
  ): Promise<boolean> {
    return serializeAuthoritativeMutation(async () => {
      const parsed = parseStoredBlob(
        await options.storage.getItem(POINTS_KEY),
      );
      if (
        parsed?.kind !== 'current' ||
        !recordingMatchesIdentity(parsed.blob, identity) ||
        parsed.blob.terminal?.resolution !== 'discarding' ||
        parsed.blob.terminal.finishId !== finishId ||
        parsed.blob.terminal.resolutionId !== resolutionId
      ) {
        return false;
      }
      await options.storage.setItem(POINTS_KEY, JSON.stringify({
        ...parsed.blob,
        revision: parsed.blob.revision + 1,
        terminal: { ...parsed.blob.terminal, candidate: snapshot },
      } satisfies RecordingBlob));
      return true;
    });
  }

  function completeDiscard(
    identity: TrackRecordingIdentity,
    finishId: string,
    resolutionId: string,
    snapshot: JournalSnapshot,
  ): Promise<boolean> {
    return serializeAuthoritativeMutation(async () => {
      const parsed = parseStoredBlob(
        await options.storage.getItem(POINTS_KEY),
      );
      if (
        parsed?.kind !== 'current' ||
        !recordingMatchesIdentity(parsed.blob, identity) ||
        parsed.blob.terminal?.resolution !== 'discarding' ||
        parsed.blob.terminal.finishId !== finishId ||
        parsed.blob.terminal.resolutionId !== resolutionId ||
        JSON.stringify(parsed.blob.terminal.candidate) !== JSON.stringify(snapshot)
      ) {
        return false;
      }
      const receiptKey = `${LOCATION_CLEANUP_PREFIX}${parsed.blob.terminal.snapshotId}`;
      const receipt: ExactCleanupReceipt = {
        schema: 1,
        snapshotId: parsed.blob.terminal.snapshotId,
        entries: snapshot.consumedJournalEntries,
        collectorGenerations: collectorGenerationsFor(parsed.blob),
        orphaned: false,
      };
      await persistLegacyQuarantineFor(parsed.blob);
      await options.storage.setItem(receiptKey, JSON.stringify(receipt));
      for (const lease of parsed.blob.locationLeases) {
        if (leaseMatchesRecording(lease, parsed.blob)) {
          await updateCollectorLineageEntry(lease, {
            revokedAtExclusive: lease.revokedAtExclusive,
            drainedThroughSequence: lease.drainedThroughSequence,
            resolution: 'discarded',
          });
        }
      }
      await options.storage.removeItem(POINTS_KEY);
      await options.storage.removeItem(SESSION_KEY).catch(() => undefined);
      if (
        await cleanupExactEntries(snapshot.consumedJournalEntries) &&
        await compactCollectorLineage(receipt.collectorGenerations)
          .catch(() => false)
      ) {
        await options.storage.removeItem(receiptKey);
      }
      return true;
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
        if (entry.rawFingerprint !== undefined) {
          if (options.fingerprint(raw) !== entry.rawFingerprint) {
            complete = false;
            continue;
          }
          await options.storage.removeItem(entry.key);
          continue;
        }
        const batch = parseLocationTaskBatch(raw);
        if (!batch) {
          complete = false;
          continue;
        }
        const fingerprint = options.fingerprint(JSON.stringify({
          collectorGeneration: batch.collectorGeneration,
          sampleFingerprints: batch.samples
            .map((sample) =>
              locationSampleFingerprint(
                sample,
                options.fingerprint,
                batch.collectorGeneration,
              ),
            )
            .sort(),
        }));
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

  async function compactAndBurnOrphanLineage(
    generations: readonly number[],
  ): Promise<boolean> {
    const rawPoints = await options.storage.getItem(POINTS_KEY);
    const parsed = parseStoredBlob(rawPoints);
    if (rawPoints !== null && parsed?.kind !== 'current') return false;
    const currentLeases = parsed?.kind === 'current'
      ? parsed.blob.locationLeases.filter((lease) =>
          leaseMatchesRecording(lease, parsed.blob) &&
          isPositiveSequence(lease.collectorGeneration),
        )
      : [];
    const burned = new Set(generations.filter(isPositiveSequence));
    if (currentLeases.some((lease) => burned.has(lease.collectorGeneration))) {
      return false;
    }
    const lineage = parseCollectorLineage(
      await options.storage.getItem(LOCATION_LINEAGE_KEY),
    );
    const maximumGeneration = Math.max(
      0,
      ...generations.filter(isPositiveSequence),
    );
    await options.storage.setItem(LOCATION_LINEAGE_KEY, JSON.stringify({
      ...lineage,
      nextGeneration: Math.max(
        lineage.nextGeneration,
        maximumGeneration + 1,
      ),
      collectors: lineage.collectors.filter((entry) =>
        currentLeases.some((lease) =>
          lease.collectorGeneration === entry.generation &&
          lease.id === entry.leaseId &&
          lease.session === entry.session &&
          lease.activityId === entry.activityId &&
          lease.ownerId === entry.ownerId &&
          lease.startedAt === entry.startedAt,
        ),
      ),
    } satisfies CollectorLineage));
    return true;
  }

  async function quarantineOrphanJournal(
    receiptKey: string,
  ): Promise<ExactCleanupReceipt> {
    if ((await options.storage.getItem(POINTS_KEY)) !== null) {
      throw new Error('Corrupt cleanup receipt still has authoritative owner');
    }
    requireJournalEnumeration(options.storage);
    const entries: ConsumedJournalEntry[] = [];
    const generations = new Set<number>();
    const keys = (await options.storage.getAllKeys())
      .filter((key) => key.startsWith(LOCATION_BATCH_PREFIX))
      .sort();
    for (const key of keys) {
      const raw = await options.storage.getItem(key);
      if (raw === null) continue;
      const batch = parseLocationTaskBatch(raw);
      if (isPositiveSequence(batch?.collectorGeneration)) {
        generations.add(batch.collectorGeneration);
      }
      // With no authoritative recording, no batch can ever be assigned to a
      // future owner. Exact raw fingerprints make even malformed coordinates
      // crash-retryable without deleting a later replacement at the same key.
      entries.push({
        key,
        batchFingerprint: batch ? 'orphan' : 'malformed',
        rawFingerprint: options.fingerprint(raw),
      });
    }
    const snapshotId = receiptKey.slice(LOCATION_CLEANUP_PREFIX.length) ||
      `orphan-${options.fingerprint(receiptKey)}`;
    const receipt: ExactCleanupReceipt = {
      schema: 1,
      snapshotId,
      entries,
      collectorGenerations: [...generations].sort((a, b) => a - b),
      orphaned: true,
    };
    await options.storage.setItem(receiptKey, JSON.stringify(receipt));
    return receipt;
  }

  async function cleanupOrphanCollectorGeneration(
    generation: number,
  ): Promise<boolean> {
    const rawPoints = await options.storage.getItem(POINTS_KEY);
    const parsed = parseStoredBlob(rawPoints);
    if (rawPoints !== null && parsed?.kind !== 'current') return false;
    if (
      parsed?.kind === 'current' &&
      parsed.blob.locationLeases.some((lease) =>
        leaseMatchesRecording(lease, parsed.blob) &&
        lease.collectorGeneration === generation,
      )
    ) {
      return false;
    }
    requireJournalEnumeration(options.storage);
    const entries: ConsumedJournalEntry[] = [];
    const keys = (await options.storage.getAllKeys())
      .filter((key) => key.startsWith(LOCATION_BATCH_PREFIX))
      .sort();
    for (const key of keys) {
      const raw = await options.storage.getItem(key);
      if (raw === null) continue;
      const batch = parseLocationTaskBatch(raw);
      if (batch) {
        if (batch.collectorGeneration !== generation) continue;
      } else if (parsed?.kind === 'current') {
        // With another authoritative recording present, malformed bytes cannot
        // be attributed to this orphan generation. Keep them fail-closed.
        continue;
      }
      entries.push({
        key,
        batchFingerprint: batch ? 'orphan' : 'malformed',
        rawFingerprint: options.fingerprint(raw),
      });
    }
    const snapshotId = `orphan-generation-${generation}`;
    const receiptKey = `${LOCATION_CLEANUP_PREFIX}${snapshotId}`;
    const receipt: ExactCleanupReceipt = {
      schema: 1,
      snapshotId,
      entries,
      collectorGenerations: [generation],
      orphaned: true,
    };
    await options.storage.setItem(receiptKey, JSON.stringify(receipt));
    const cleaned = await cleanupExactEntries(entries);
    const compacted = await compactAndBurnOrphanLineage([generation])
      .catch(() => false);
    if (cleaned && compacted) {
      await options.storage.removeItem(receiptKey);
      return true;
    }
    return false;
  }

  function cleanupOwnerlessJournal(): Promise<boolean> {
    return serializeLocationJournalMutation(async () => {
      if ((await options.storage.getItem(POINTS_KEY)) !== null) return true;
      requireJournalEnumeration(options.storage);
      const hasJournal = (await options.storage.getAllKeys()).some((key) =>
        key.startsWith(LOCATION_BATCH_PREFIX),
      );
      if (!hasJournal) return true;
      const receiptKey =
        `${LOCATION_CLEANUP_PREFIX}ownerless-orphan-journal`;
      const receipt = await quarantineOrphanJournal(receiptKey);
      const cleaned = await cleanupExactEntries(receipt.entries);
      const compacted = await compactAndBurnOrphanLineage(
        receipt.collectorGenerations,
      ).catch(() => false);
      if (!cleaned || !compacted) return false;
      await options.storage.removeItem(receiptKey);
      return true;
    });
  }

  async function retryPendingExactCleanup(): Promise<void> {
    if (!options.storage.getAllKeys) return;
    let incomplete = false;
    const receiptKeys = (await options.storage.getAllKeys())
      .filter((key) => key.startsWith(LOCATION_CLEANUP_PREFIX))
      .sort();
    for (const receiptKey of receiptKeys) {
      const rawReceipt = await options.storage.getItem(receiptKey);
      let receipt = parseExactCleanupReceipt(rawReceipt);
      if (!receipt) {
        receipt = await quarantineOrphanJournal(receiptKey);
      }
      const cleaned = await cleanupExactEntries(receipt.entries);
      const compacted = receipt.orphaned
        ? await compactAndBurnOrphanLineage(receipt.collectorGenerations)
          .catch(() => false)
        : await compactCollectorLineage(receipt.collectorGenerations)
          .catch(() => false);
      if (cleaned && compacted) {
        await options.storage.removeItem(receiptKey);
      } else {
        incomplete = true;
      }
    }
    if (incomplete) {
      throw new Error('Location cleanup remains incomplete');
    }
  }

  function resumeDiscardingExactCleanup(
    identity: TrackRecordingIdentity,
    finishId: string,
    resolutionId: string,
  ): Promise<'none' | 'discarded' | 'pending' | 'stale'> {
    return serializeAuthoritativeMutation(async () => {
      const parsed = parseStoredBlob(
        await options.storage.getItem(POINTS_KEY),
      );
      if (
        parsed?.kind !== 'current' ||
        !recordingMatchesIdentity(parsed.blob, identity) ||
        parsed.blob.terminal?.resolution !== 'discarding' ||
        parsed.blob.terminal.finishId !== finishId ||
        parsed.blob.terminal.resolutionId !== resolutionId
      ) {
        return 'stale';
      }
      const terminal = parsed.blob.terminal;
      const receiptKey = `${LOCATION_CLEANUP_PREFIX}${terminal.snapshotId}`;
      const rawReceipt = await options.storage.getItem(receiptKey);
      if (rawReceipt === null) return 'none';
      let receipt = parseExactCleanupReceipt(rawReceipt);
      if (!receipt && terminal.candidate) {
        receipt = {
          schema: 1,
          snapshotId: terminal.snapshotId,
          entries: terminal.candidate.consumedJournalEntries,
          collectorGenerations: collectorGenerationsFor(parsed.blob),
          orphaned: false,
        };
        await options.storage.setItem(receiptKey, JSON.stringify(receipt));
      }
      if (
        !receipt ||
        receipt.snapshotId !== terminal.snapshotId ||
        !terminal.candidate ||
        JSON.stringify(receipt.entries) !==
          JSON.stringify(terminal.candidate.consumedJournalEntries)
      ) {
        return 'pending';
      }
      if (!(await cleanupExactEntries(receipt.entries))) return 'pending';

      await persistLegacyQuarantineFor(parsed.blob);

      for (const lease of parsed.blob.locationLeases) {
        if (leaseMatchesRecording(lease, parsed.blob)) {
          await updateCollectorLineageEntry(lease, {
            revokedAtExclusive: lease.revokedAtExclusive,
            drainedThroughSequence: lease.drainedThroughSequence,
            resolution: 'discarded',
          });
        }
      }
      await options.storage.removeItem(POINTS_KEY);
      await options.storage.removeItem(SESSION_KEY).catch(() => undefined);
      if (
        await compactCollectorLineage(receipt.collectorGenerations)
          .catch(() => false)
      ) {
        await options.storage.removeItem(receiptKey).catch(() => undefined);
      }
      return 'discarded';
    });
  }

  function discardClosingTooShort(
    identity: TrackRecordingIdentity,
    finishId: string,
    resolutionId: string,
    snapshot: JournalSnapshot,
  ): Promise<'discarded' | 'pending' | 'stale'> {
    return serializeAuthoritativeMutation(async () => {
      const parsed = parseStoredBlob(
        await options.storage.getItem(POINTS_KEY),
      );
      if (
        parsed?.kind !== 'current' ||
        !recordingMatchesIdentity(parsed.blob, identity) ||
        parsed.blob.terminal?.phase !== 'closing' ||
        parsed.blob.terminal.resolution !== 'closing' ||
        parsed.blob.terminal.finishId !== finishId ||
        parsed.blob.terminal.resolutionId !== resolutionId ||
        JSON.stringify(parsed.blob.terminal.candidate) !==
          JSON.stringify(snapshot)
      ) {
        return 'stale';
      }

      const receiptKey =
        `${LOCATION_CLEANUP_PREFIX}${parsed.blob.terminal.snapshotId}`;
      const receipt: ExactCleanupReceipt = {
        schema: 1,
        snapshotId: parsed.blob.terminal.snapshotId,
        entries: snapshot.consumedJournalEntries,
        collectorGenerations: collectorGenerationsFor(parsed.blob),
      };
      const discarding: RecordingBlob = {
        ...parsed.blob,
        revision: parsed.blob.revision + 1,
        resumeAfterOwnerCheck: false,
        terminal: {
          ...parsed.blob.terminal,
          resolution: 'discarding',
          resolutionId: `too-short:${resolutionId}`,
        },
      };
      // Mark the terminal resolution before cleanup begins. If the process is
      // terminated at any later await, owner-free boot reconciliation can
      // resume this exact receipt without reclassifying the recording.
      await options.storage.setItem(POINTS_KEY, JSON.stringify(discarding));
      await persistLegacyQuarantineFor(discarding);
      await options.storage.setItem(receiptKey, JSON.stringify(receipt));
      if (!(await cleanupExactEntries(snapshot.consumedJournalEntries))) {
        return 'pending';
      }
      for (const lease of discarding.locationLeases) {
        if (leaseMatchesRecording(lease, discarding)) {
          await updateCollectorLineageEntry(lease, {
            revokedAtExclusive: lease.revokedAtExclusive,
            drainedThroughSequence: lease.drainedThroughSequence,
            resolution: 'discarded',
          });
        }
      }
      const latest = parseStoredBlob(
        await options.storage.getItem(POINTS_KEY),
      );
      if (
        latest?.kind !== 'current' ||
        !recordingMatchesIdentity(latest.blob, identity) ||
        latest.blob.terminal?.phase !== 'closing' ||
        latest.blob.terminal.resolution !== 'discarding' ||
        latest.blob.terminal.resolutionId !== `too-short:${resolutionId}` ||
        latest.blob.terminal.finishId !== finishId ||
        latest.blob.terminal.snapshotId !== receipt.snapshotId
      ) {
        return 'stale';
      }
      await options.storage.removeItem(POINTS_KEY);
      await options.storage.removeItem(SESSION_KEY).catch(() => undefined);
      if (
        await compactCollectorLineage(receipt.collectorGenerations)
          .catch(() => false)
      ) {
        await options.storage.removeItem(receiptKey).catch(() => undefined);
      }
      return 'discarded';
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
  ): Promise<DiscardTrackRecordingResult> {
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
      if (parsed.blob.terminal?.resolution === 'enqueueing') {
        return 'completion_in_progress';
      }
      if (parsed.blob.locationLeases.length > 0) {
        throw new Error('Owner-bound GPS recordings require deep discard');
      }
      await options.storage.removeItem(POINTS_KEY);
      await options.storage.removeItem(SESSION_KEY).catch(() => undefined);
      return 'discarded';
    });
  }

  return {
    begin,
    claimLegacy,
    discardLegacyUnprovable,
    recover,
    appendPoints,
    appendTaskPoints,
    appendTaskSamples,
    appendNativeTaskSamples,
    acquireTaskLease,
    prepareTaskLeaseGeneration,
    recordingIdentityIsCurrent,
    suspendTaskLeaseFor,
    taskLeaseIsCurrent,
    readActiveTaskLease,
    prepareCollectorForOwner,
    compactOrphanCollectorLineage,
    sweepLegacyQuarantineBatches,
    readCollectorDirective,
    markTrackingIncompleteForGeneration,
    markClosingTrackingIncomplete,
    persistCollectorDrainProof,
    readBlobForIdentity,
    readDiscardingResolution,
    readRecording,
    readPoints,
    persistCompleted,
    readPendingCompleted,
    beginClosing,
    scanTerminalJournal,
    persistTerminalCandidate,
    sealTerminalCandidate,
    claimFinalizedEnqueue,
    beginDiscard,
    scanDiscardJournal,
    persistDiscardCandidate,
    completeDiscard,
    acknowledgeFinalized,
    discardClosingTooShort,
    resumeDiscardingExactCleanup,
    retryPendingExactCleanup,
    cleanupOrphanCollectorGeneration,
    cleanupOwnerlessJournal,
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
    'appendNativeTaskSamples'
  >,
  acknowledger?: Pick<
    LocationTaskRuntime,
    'acknowledgeBatch' | 'taintAndAcknowledgeBatch'
  >,
) {
  return async ({ data, error }: any): Promise<void> => {
    locationTaskWritesInFlight += 1;
    try {
      if (error) return;
      const locations = data?.locations ?? [];
      if (!Array.isArray(locations) || locations.length === 0) return;
      const samples = locations.map(locationPoint);
      const collectorGeneration =
        typeof data?.collectorGeneration === 'number' &&
        Number.isSafeInteger(data.collectorGeneration) &&
        data.collectorGeneration > 0
          ? data.collectorGeneration
          : null;
      const collectorBatchId = isNativeCollectorBatchId(
        data?.collectorBatchId,
      )
        ? data.collectorBatchId
        : null;
      const collectorThroughSequence = isPositiveSequence(
        data?.collectorThroughSequence,
      )
        ? data.collectorThroughSequence
        : null;
      const maxNativeSequence = samples.reduce(
        (maximum, sample) => isPositiveSequence(sample.nativeSequence)
          ? Math.max(maximum, sample.nativeSequence)
          : Number.MAX_SAFE_INTEGER,
        0,
      );
      if (
        collectorGeneration !== null &&
        (collectorBatchId === null ||
          collectorThroughSequence === null ||
          collectorThroughSequence < maxNativeSequence)
      ) {
        return;
      }
      const disposition = await store.appendNativeTaskSamples(
        samples,
        collectorGeneration,
        collectorBatchId ?? undefined,
      );
      if (
        disposition !== 'rejected' &&
        collectorGeneration !== null &&
        collectorBatchId !== null &&
        collectorThroughSequence !== null &&
        collectorThroughSequence >= maxNativeSequence &&
        (disposition === 'discard-only'
          ? acknowledger?.taintAndAcknowledgeBatch
          : acknowledger?.acknowledgeBatch)
      ) {
        if (disposition === 'discard-only') {
          await acknowledger!.taintAndAcknowledgeBatch!(
            collectorGeneration,
            collectorBatchId,
            collectorThroughSequence,
          );
        } else {
          await acknowledger!.acknowledgeBatch!(
            collectorGeneration,
            collectorBatchId,
            collectorThroughSequence,
          );
        }
      }
    } catch {
      // The immutable WAL write is best effort; authority is never mutated.
    } finally {
      locationTaskWritesInFlight -= 1;
    }
  };
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
  getCollectorState?(): Promise<{
    running: boolean;
    generation: number | null;
    highWater: number;
  }>;
  reserveGeneration?(minimumGeneration: number): Promise<number>;
  getForegroundPermission(): Promise<{ granted: boolean }>;
  getBackgroundPermission(): Promise<{ granted: boolean }>;
  start(generation?: number): Promise<void>;
  stop(): Promise<void>;
  stopAndDrain?(generation: number): Promise<{
    generation: number;
    drained: true;
    throughSequence: number;
    outcome: 'exact' | 'discard-only';
  }>;
  stopLegacyCollector?(): Promise<void>;
  acknowledgeBatch?(
    generation: number,
    batchId: string,
    throughSequence: number,
  ): Promise<void>;
  taintAndAcknowledgeBatch?(
    generation: number,
    batchId: string,
    throughSequence: number,
  ): Promise<void>;
};

export type LocationTaskLeaseRuntime = LocationTaskRuntime;

type GenerationDrainRuntime = LocationTaskRuntime & {
  getCollectorState(): Promise<{
    running: boolean;
    generation: number | null;
    highWater: number;
  }>;
  reserveGeneration(minimumGeneration: number): Promise<number>;
  stopAndDrain(generation: number): Promise<{
    generation: number;
    drained: true;
    throughSequence: number;
    outcome: 'exact' | 'discard-only';
  }>;
  taintAndAcknowledgeBatch(
    generation: number,
    batchId: string,
    throughSequence: number,
  ): Promise<void>;
};

function supportsGenerationDrain(
  runtime: LocationTaskRuntime,
): runtime is GenerationDrainRuntime {
  return (
    typeof runtime.getCollectorState === 'function' &&
    typeof runtime.reserveGeneration === 'function' &&
    typeof runtime.stopAndDrain === 'function' &&
    typeof runtime.taintAndAcknowledgeBatch === 'function'
  );
}

async function readGenerationCollectorState(
  runtime: GenerationDrainRuntime,
): Promise<{ running: boolean; generation: number | null; highWater: number }> {
  const state: unknown = await runtime.getCollectorState();
  if (
    !isRecord(state) ||
    typeof state.running !== 'boolean' ||
    !Number.isSafeInteger(state.highWater) ||
    Number(state.highWater) < 0 ||
    (state.running
      ? !isPositiveSequence(state.generation) ||
        Number(state.generation) > Number(state.highWater)
      : state.generation !== null)
  ) {
    throw new Error('Native collector state is invalid');
  }
  return {
    running: state.running,
    generation: state.generation as number | null,
    highWater: Number(state.highWater),
  };
}

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
  const emergencyStopFlights = new Set<Promise<void>>();

  function trackEmergencyStop(promise: Promise<void>): void {
    emergencyStopFlights.add(promise);
    void promise.finally(() => {
      emergencyStopFlights.delete(promise);
    });
  }

  function invokeEmergencyLegacyStop(): void {
    try {
      const pending = supportsGenerationDrain(options.runtime) &&
          options.runtime.stopLegacyCollector
        ? options.runtime.stopLegacyCollector()
        : options.runtime.stop();
      trackEmergencyStop(Promise.resolve(pending).catch(() => undefined));
    } catch {
      // A synchronous bridge failure is still fail-closed at the caller.
    }
  }

  async function emergencyStopAfterStorageFailure(): Promise<void> {
    if (!supportsGenerationDrain(options.runtime)) {
      invokeEmergencyLegacyStop();
      return;
    }
    const runtime = options.runtime;
    let state: Awaited<ReturnType<typeof runtime.getCollectorState>>;
    try {
      state = await readGenerationCollectorState(runtime);
    } catch {
      invokeEmergencyLegacyStop();
      return;
    }
    if (!isPositiveSequence(state.generation)) {
      // A generation-less task can only be a legacy collector. Do not wait for
      // confirmation while the authoritative store is unavailable.
      invokeEmergencyLegacyStop();
      return;
    }
    try {
      // Calling the native method begins exact source removal immediately, but
      // awaiting its proof can deadlock boot while the WAL is unavailable and
      // native waits for a JS acknowledgement. Track it in the background and
      // keep the UI fail-closed so a later retry can finish reconciliation.
      const pending = runtime.stopAndDrain(state.generation).then(
        async (proof) => {
          if (
            proof.generation !== state.generation ||
            proof.drained !== true ||
            !Number.isSafeInteger(proof.throughSequence) ||
            proof.throughSequence < 0 ||
            (proof.outcome !== 'exact' && proof.outcome !== 'discard-only')
          ) {
            return;
          }
          const persisted = await store.persistCollectorDrainProof(
            proof.generation,
            proof.throughSequence,
            proof.outcome,
          ).catch(() => undefined);
          if (persisted === 'orphan') {
            await store.cleanupOrphanCollectorGeneration(proof.generation)
              .catch(() => undefined);
          }
        },
        () => undefined,
      );
      trackEmergencyStop(pending);
    } catch {
      // A synchronous bridge failure is still fail-closed at the caller.
    }
  }

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

  async function reconcileLegacyNativeToDurableState(): Promise<
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
        // A native call may take effect before rejecting. If no newer lease
        // appeared, one confirmed status read is enough to remain recoverable
        // without repeatedly issuing the same failed stop.
        if (await store.readActiveTaskLease()) continue;
        try {
          if (!(await options.runtime.hasStarted())) return 'paused';
        } catch {
          // Unknown status cannot prove privacy-safe suspension.
        }
        return 'uncertain';
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

  async function persistExactDrainProof(
    runtime: GenerationDrainRuntime,
    generation: number,
  ): Promise<boolean> {
    try {
      const proof = await runtime.stopAndDrain(generation);
      if (
        proof.generation !== generation ||
        proof.drained !== true ||
        !Number.isSafeInteger(proof.throughSequence) ||
        proof.throughSequence < 0 ||
        (proof.outcome !== 'exact' && proof.outcome !== 'discard-only')
      ) {
        return false;
      }
      const persisted = await store.persistCollectorDrainProof(
        generation,
        proof.throughSequence,
        proof.outcome,
      );
      if (
        persisted === 'orphan' &&
        !(await store.cleanupOrphanCollectorGeneration(generation))
      ) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  async function reconcileGenerationCollector(
    intentIsCurrent: () => boolean = () => true,
  ): Promise<
    BootLocationReconciliationStatus
  > {
    if (!supportsGenerationDrain(options.runtime)) {
      return 'capability_unavailable';
    }
    const runtime = options.runtime;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (!intentIsCurrent()) return 'uncertain';
      let directive: Awaited<ReturnType<typeof store.readCollectorDirective>>;
      let state: Awaited<ReturnType<typeof runtime.getCollectorState>>;
      try {
        directive = await store.readCollectorDirective();
        state = await readGenerationCollectorState(runtime);
      } catch {
        return 'uncertain';
      }
      if (!intentIsCurrent()) return 'uncertain';

      const active = directive.activeLease;
      if (state.running && (!active || state.generation !== active.collectorGeneration)) {
        if (!isPositiveSequence(state.generation)) return 'uncertain';
        if (!(await persistExactDrainProof(runtime, state.generation))) {
          return 'uncertain';
        }
        if (!intentIsCurrent()) return 'uncertain';
        continue;
      }

      const historicalUndrained = directive.undrainedLeases.filter(
        (lease) => lease.id !== active?.id,
      );
      if (historicalUndrained.length > 0) {
        const historical = historicalUndrained[0];
        if (!(await persistExactDrainProof(
          runtime,
          historical.collectorGeneration,
        ))) {
          return 'uncertain';
        }
        if (!intentIsCurrent()) return 'uncertain';
        continue;
      }

      const latestDirective = await store.readCollectorDirective();
      if (active) {
        if (
          latestDirective.activeLease?.id !== active.id ||
          latestDirective.activeLease.collectorGeneration !==
            active.collectorGeneration
        ) {
          continue;
        }
        if (state.running && state.generation === active.collectorGeneration) {
          return intentIsCurrent() ? 'running' : 'uncertain';
        }
        if (!intentIsCurrent()) return 'uncertain';
        try {
          await runtime.start(active.collectorGeneration);
        } catch {
          // A start can take effect before rejection; loop and adopt only the
          // exact durable generation after re-reading native state.
        }
        if (!intentIsCurrent()) return 'uncertain';
        continue;
      }

      if (latestDirective.undrainedLeases.length > 0) continue;
      if (state.running) continue;
      return latestDirective.recordingStatus === 'closing'
        ? 'closing'
        : 'paused';
    }
    return 'uncertain';
  }

  async function reconcileNativeToDurableState(): Promise<
    'running' | 'paused' | 'closing' | 'uncertain'
  > {
    if (supportsGenerationDrain(options.runtime)) {
      const status = await reconcileGenerationCollector();
      return status === 'capability_unavailable' ? 'uncertain' : status;
    }
    return reconcileLegacyNativeToDurableState();
  }

  async function stopIfLeaseStillPaused(
    lease: LocationTaskLease | null,
  ): Promise<void> {
    if (!lease || !(await store.taskLeaseIsCurrent(lease, false))) return;
    if (supportsGenerationDrain(options.runtime)) {
      const status = await reconcileGenerationCollector();
      if (status === 'uncertain' || status === 'capability_unavailable') {
        throw new Error('Native location collector drain remains uncertain');
      }
      return;
    }
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

  async function abortReservedGeneration(
    runtime: GenerationDrainRuntime,
    generation: number,
  ): Promise<boolean> {
    const drained = await persistExactDrainProof(runtime, generation);
    await store.compactOrphanCollectorLineage().catch(() => undefined);
    return drained;
  }

  async function prepareTaskLeaseForNativeFloor(
    identity: TrackRecordingIdentity,
    leaseId: string,
    intentIsCurrent: () => boolean,
  ): Promise<{
    lease: LocationTaskLease;
    reservedGeneration: number | null;
  } | null> {
    let preparation = await store.prepareTaskLeaseGeneration(identity);
    if (!intentIsCurrent() || preparation.kind === 'stale') return null;
    if (preparation.kind === 'active') {
      return { lease: preparation.lease, reservedGeneration: null };
    }

    if (!supportsGenerationDrain(options.runtime)) {
      const lease = await store.acquireTaskLease(identity, leaseId);
      return lease ? { lease, reservedGeneration: null } : null;
    }
    const runtime = options.runtime;

    // A native claim is exclusive. Drain any surfaced historical claim before
    // asking native to atomically reserve a new generation.
    const reconciled = await reconcileGenerationCollector(intentIsCurrent);
    if (!intentIsCurrent()) return null;
    if (reconciled === 'uncertain' || reconciled === 'capability_unavailable') {
      throw new Error('Native location collector state remains uncertain');
    }

    preparation = await store.prepareTaskLeaseGeneration(identity);
    if (!intentIsCurrent() || preparation.kind === 'stale') return null;
    if (preparation.kind === 'active') {
      return { lease: preparation.lease, reservedGeneration: null };
    }

    let reservedGeneration: number;
    try {
      reservedGeneration = await runtime.reserveGeneration(
        preparation.minimumGeneration,
      );
      if (
        !isPositiveSequence(reservedGeneration) ||
        reservedGeneration < preparation.minimumGeneration ||
        reservedGeneration >= Number.MAX_SAFE_INTEGER
      ) {
        throw new Error('Native collector generation reservation is invalid');
      }
    } catch (error) {
      // Reservation may have taken effect before a bridge rejection. With no
      // durable JS lease, reconcile can only drain/quarantine what native now
      // surfaces; it can never start it.
      await reconcileGenerationCollector().catch(() => undefined);
      throw error;
    }

    if (!intentIsCurrent()) {
      await abortReservedGeneration(runtime, reservedGeneration);
      return null;
    }

    let lease: LocationTaskLease | null;
    try {
      lease = await store.acquireTaskLease(
        identity,
        leaseId,
        undefined,
        reservedGeneration,
      );
    } catch (error) {
      await abortReservedGeneration(runtime, reservedGeneration);
      throw error;
    }
    if (!lease || lease.collectorGeneration !== reservedGeneration) {
      await abortReservedGeneration(runtime, reservedGeneration);
      return null;
    }
    if (!intentIsCurrent()) {
      await store.suspendTaskLeaseFor(identity).catch(() => undefined);
      await abortReservedGeneration(runtime, reservedGeneration);
      return null;
    }
    return { lease, reservedGeneration };
  }

  async function abandonPreparedReservation(
    identity: TrackRecordingIdentity,
    prepared: {
      lease: LocationTaskLease;
      reservedGeneration: number | null;
    },
  ): Promise<void> {
    if (
      prepared.reservedGeneration === null ||
      !supportsGenerationDrain(options.runtime)
    ) {
      return;
    }
    await store.suspendTaskLeaseFor(identity).catch(() => undefined);
    await abortReservedGeneration(
      options.runtime,
      prepared.reservedGeneration,
    );
  }

  async function startForUnlocked(
    identity: TrackRecordingIdentity,
    intent: number,
  ): Promise<TrackLocationTaskStatus> {
    if (!identityIntentIsCurrent(identity, intent)) return 'stale';
    const prepared = await prepareTaskLeaseForNativeFloor(
      identity,
      options.createLeaseId(),
      () => identityIntentIsCurrent(identity, intent),
    );
    if (!prepared) return 'stale';
    const { lease, reservedGeneration } = prepared;
    if (!identityIntentIsCurrent(identity, intent)) {
      await abandonPreparedReservation(identity, prepared);
      return 'stale';
    }
    const leaseIsCurrent = await store.taskLeaseIsCurrent(lease, true);
    if (!identityIntentIsCurrent(identity, intent) || !leaseIsCurrent) {
      await abandonPreparedReservation(identity, prepared);
      return 'stale';
    }

    if (supportsGenerationDrain(options.runtime)) {
      if (reservedGeneration !== null) {
        try {
          await options.runtime.start(reservedGeneration);
        } catch {
          const suspended = await store.suspendTaskLeaseFor(identity);
          if (suspended.kind === 'stale') return 'stale';
          if (!(await abortReservedGeneration(
            options.runtime,
            reservedGeneration,
          ))) {
            throw new Error('Native location collector drain remains uncertain');
          }
          return 'paused';
        }
        if (
          !identityIntentIsCurrent(identity, intent) ||
          !(await store.taskLeaseIsCurrent(lease, true))
        ) {
          await store.suspendTaskLeaseFor(identity).catch(() => undefined);
          await reconcileGenerationCollector();
          return 'stale';
        }
        return 'restarted';
      }
      let alreadyRunningExact = false;
      try {
        const state = await readGenerationCollectorState(options.runtime);
        alreadyRunningExact = state.running &&
          state.generation === lease.collectorGeneration;
      } catch {
        return pauseAfterReconciliationFailure(identity, intent);
      }
      const reconciled = await reconcileGenerationCollector();
      if (
        !identityIntentIsCurrent(identity, intent) ||
        !(await store.taskLeaseIsCurrent(lease, true))
      ) {
        await reconcileGenerationCollector();
        return 'stale';
      }
      if (reconciled === 'running') {
        return alreadyRunningExact ? 'running' : 'restarted';
      }
      const suspended = await store.suspendTaskLeaseFor(identity);
      if (suspended.kind === 'stale') return 'stale';
      if ((await reconcileGenerationCollector()) === 'uncertain') {
        throw new Error('Native location collector state remains uncertain');
      }
      return 'paused';
    }

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
    return serializeNativeTaskMutation(() =>
      startForUnlocked(identity, intent),
    );
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

  async function stopLegacyCollectorBestEffort(): Promise<void> {
    try {
      if (
        supportsGenerationDrain(options.runtime) &&
        options.runtime.stopLegacyCollector
      ) {
        await options.runtime.stopLegacyCollector();
      } else {
        await options.runtime.stop();
      }
    } catch {
      // A generation-zero lease has no exact callback barrier. The terminal is
      // quarantined regardless, so a failed unregister remains discard-only.
    }
    try {
      await options.runtime.hasStarted();
    } catch {
      // Status cannot promote a legacy lease to a provable recording.
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
    let { blob } = closing;
    const finishId = blob.terminal!.finishId;
    const resolutionId = blob.terminal!.resolutionId;

    const hasGenerationLease = blob.locationLeases.some(
      (lease) => lease.collectorGeneration > 0,
    );
    const hasLegacyLease = blob.locationLeases.some(
      (lease) => lease.collectorGeneration === 0,
    );
    const trackingIncomplete =
      blob.terminal!.quarantineReason === 'tracking_incomplete';
    if (hasLegacyLease || trackingIncomplete) {
      await serializeNativeTaskMutation(async () => {
        if (hasLegacyLease) await stopLegacyCollectorBestEffort();
        if (hasGenerationLease && supportsGenerationDrain(options.runtime)) {
          await reconcileGenerationCollector();
        }
      });
      return {
        kind: 'closing',
        finishId,
        reason: trackingIncomplete
          ? 'tracking_incomplete'
          : 'legacy_unprovable',
      };
    }
    if (hasGenerationLease && !supportsGenerationDrain(options.runtime)) {
      return { kind: 'closing', finishId, reason: 'drain_unavailable' };
    }

    if (supportsGenerationDrain(options.runtime)) {
      const reconciled = await serializeNativeTaskMutation(
        reconcileGenerationCollector,
      );
      if (reconciled === 'uncertain') {
        return { kind: 'closing', finishId, reason: 'drain_unconfirmed' };
      }
      const refreshed = await store.readBlobForIdentity(identity);
      if (
        !refreshed ||
        refreshed.terminal?.finishId !== finishId ||
        refreshed.terminal.resolution !== 'closing' ||
        refreshed.terminal.resolutionId !== resolutionId ||
        refreshed.locationLeases.some((lease) =>
          lease.collectorGeneration > 0 &&
          lease.drainedThroughSequence === null,
        )
      ) {
        return { kind: 'closing', finishId, reason: 'drain_unconfirmed' };
      }
      blob = refreshed;
      if (blob.terminal?.quarantineReason === 'tracking_incomplete') {
        return {
          kind: 'closing',
          finishId,
          reason: 'tracking_incomplete',
        };
      }
    } else {
      const stopped = await serializeNativeTaskMutation(confirmNativeStopped);
      if (!stopped) {
        return { kind: 'closing', finishId, reason: 'native_unconfirmed' };
      }
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
      const marked = await store.markClosingTrackingIncomplete(
        identity,
        finishId,
        resolutionId,
      ).catch(() => false);
      return {
        kind: 'closing',
        finishId,
        reason: marked ? 'tracking_incomplete' : 'corrupt_journal',
      };
    }
    try {
      if (!(await store.persistTerminalCandidate(
        identity,
        finishId,
        resolutionId,
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
      const marked = await store.markClosingTrackingIncomplete(
        identity,
        finishId,
        resolutionId,
      ).catch(() => false);
      return {
        kind: 'closing',
        finishId,
        reason: marked ? 'tracking_incomplete' : 'corrupt_journal',
      };
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
      const marked = await store.markClosingTrackingIncomplete(
        identity,
        finishId,
        resolutionId,
      ).catch(() => false);
      return {
        kind: 'closing',
        finishId,
        reason: marked ? 'tracking_incomplete' : 'corrupt_journal',
      };
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
        const discarded = await store.discardClosingTooShort(
          identity,
          finishId,
          resolutionId,
          preflight.snapshot,
        );
        if (discarded === 'discarded') return { kind: 'too_short' };
        if (discarded === 'stale') return { kind: 'stale' };
        return {
          kind: 'closing',
          finishId,
          reason: 'persistence_unconfirmed',
        };
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
        resolutionId,
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

  function claimFinalizedEnqueueFor(
    identity: TrackRecordingIdentity,
    snapshotId: string,
  ): Promise<ClaimFinalizedEnqueueResult> {
    return store.claimFinalizedEnqueue(identity, snapshotId);
  }

  async function discardFor(
    identity: TrackRecordingIdentity,
  ): Promise<DiscardTrackRecordingResult> {
    issueIdentityIntent(identity);
    const discarding = await store.beginDiscard(
      identity,
      options.createFinishId?.() ?? secureCreateActivityId(),
      options.createSnapshotId?.() ?? secureCreateActivityId(),
    );
    if (discarding.kind === 'stale') return 'stale';
    if (discarding.kind === 'completion_in_progress') {
      return 'completion_in_progress';
    }
    let blob = discarding.blob;
    if (blob.locationLeases.some((lease) =>
      leaseMatchesRecording(lease, blob) && lease.collectorGeneration === 0,
    )) {
      // The tombstone was persisted by beginDiscard. Cross the same journal
      // barrier used by callbacks so every generation-zero write that began
      // before it is swept before discard can report success.
      await store.sweepLegacyQuarantineBatches();
    }
    const resolutionId = blob.terminal!.resolutionId;
    if (
      blob.locationLeases.some((lease) => lease.collectorGeneration > 0) &&
      !supportsGenerationDrain(options.runtime)
    ) {
      throw new Error('Native location collector drain is unavailable');
    }
    const reconciled = await serializeNativeTaskMutation(
      reconcileNativeToDurableState,
    );
    if (reconciled === 'uncertain') {
      throw new Error('Native location task state remains uncertain');
    }
    const refreshed = await store.readBlobForIdentity(identity);
    if (
      !refreshed ||
      refreshed.terminal?.resolution !== 'discarding' ||
      refreshed.terminal.resolutionId !== resolutionId
    ) {
      return 'stale';
    }
    if (refreshed.locationLeases.some((lease) =>
      lease.collectorGeneration > 0 &&
      lease.drainedThroughSequence === null,
    )) {
      throw new Error('Native location collector drain remains uncertain');
    }
    blob = refreshed;

    const first = await store.scanDiscardJournal(blob);
    if (!(await store.persistDiscardCandidate(
      identity,
      blob.terminal!.finishId,
      resolutionId,
      first,
    ))) {
      return 'stale';
    }
    const second = await store.scanDiscardJournal(blob);
    if (!journalSnapshotsEqual(first, second)) {
      throw new Error('Location journal changed during discard');
    }
    const preflight = await store.scanDiscardJournal(blob);
    if (!journalSnapshotsEqual(second, preflight)) {
      throw new Error('Location journal changed during discard');
    }
    return (await store.completeDiscard(
      identity,
      blob.terminal!.finishId,
      resolutionId,
      preflight,
    ))
      ? 'discarded'
      : 'stale';
  }

  async function resumeDiscardingResolutionUnlocked(): Promise<
    'none' | 'discarded' | 'pending'
  > {
    const pending = await store.readDiscardingResolution();
    if (!pending) {
      await store.retryPendingExactCleanup().catch(() => undefined);
      return 'none';
    }
    const { identity } = pending;
    let blob = pending.blob;
    const resolutionId = blob.terminal!.resolutionId;
    if (blob.locationLeases.some((lease) =>
      lease.collectorGeneration > 0 &&
      lease.drainedThroughSequence === null,
    )) {
      return 'pending';
    }

    const exactCleanup = await store.resumeDiscardingExactCleanup(
      identity,
      blob.terminal!.finishId,
      resolutionId,
    );
    if (exactCleanup === 'discarded') return 'discarded';
    if (exactCleanup === 'pending') return 'pending';
    if (exactCleanup === 'stale') return 'none';

    // No receipt means the process stopped before cleanup began. Rebuild and
    // persist the exact discard candidate using the same terminal IDs.
    const first = await store.scanDiscardJournal(blob);
    if (!(await store.persistDiscardCandidate(
      identity,
      blob.terminal!.finishId,
      resolutionId,
      first,
    ))) {
      return 'none';
    }
    const second = await store.scanDiscardJournal(blob);
    if (!journalSnapshotsEqual(first, second)) return 'pending';
    const preflight = await store.scanDiscardJournal(blob);
    if (!journalSnapshotsEqual(second, preflight)) return 'pending';
    blob = (await store.readBlobForIdentity(identity)) ?? blob;
    return (await store.completeDiscard(
      identity,
      blob.terminal!.finishId,
      resolutionId,
      preflight,
    ))
      ? 'discarded'
      : 'none';
  }

  async function reconcileAtBootUnlocked(
    intentIsCurrent: () => boolean = () => true,
  ): Promise<
    BootLocationReconciliationStatus
  > {
    if (!supportsGenerationDrain(options.runtime)) {
      // An OTA can run on a pre-generation binary whose legacy Expo task is
      // still registered. A blocked safety gate is not a substitute for
      // actually stopping that collector, so always attempt the old contract
      // before returning fail-closed.
      try {
        await options.runtime.stop();
      } catch {
        // Confirmation below is deliberately best-effort. Without generation
        // drain proof the gate remains blocked regardless of stop outcome.
      }
      try {
        await options.runtime.hasStarted();
      } catch {
        // Unknown registration state remains capability_unavailable.
      }
      return 'capability_unavailable';
    }
    const status = await reconcileGenerationCollector(intentIsCurrent);
    if (!intentIsCurrent()) return 'uncertain';
    if (
      status === 'uncertain' &&
      supportsGenerationDrain(options.runtime) &&
      options.runtime.stopLegacyCollector
    ) {
      try {
        await options.runtime.stopLegacyCollector();
      } catch {
        // Boot remains fail-closed. This call can only unregister a
        // generation-less pre-bridge collector and cannot affect a leased
        // generation.
      }
    }
    if (status === 'uncertain' || status === 'capability_unavailable') {
      return status;
    }
    try {
      await store.sweepLegacyQuarantineBatches();
    } catch {
      return 'uncertain';
    }
    try {
      const resumed = await resumeDiscardingResolutionUnlocked();
      if (!intentIsCurrent()) return 'uncertain';
      if (resumed === 'pending') return 'closing';
      if (resumed === 'discarded') {
        try {
          await store.retryPendingExactCleanup();
        } catch {
          return 'uncertain';
        }
        const settled = await reconcileGenerationCollector(intentIsCurrent);
        return settled === 'closing' ? 'paused' : settled;
      }
    } catch {
      return 'closing';
    }
    try {
      await store.retryPendingExactCleanup();
    } catch {
      return 'uncertain';
    }
    try {
      if (!(await store.cleanupOwnerlessJournal())) return 'uncertain';
    } catch {
      return 'uncertain';
    }
    return status;
  }

  function reconcile(): Promise<'running' | 'paused' | 'uncertain'> {
    return serializeNativeTaskMutation(async () => {
      const status = await reconcileNativeToDurableState();
      return status === 'closing' ? 'paused' : status;
    });
  }

  function reconcileAtBoot(): Promise<BootLocationReconciliationStatus> {
    return serializeNativeTaskMutation(async () => {
      try {
        // Auth is intentionally unavailable here. Revoke first so an A
        // collector can never remain live while the eventual session is B.
        await store.prepareCollectorForOwner(null);
        await store.compactOrphanCollectorLineage();
      } catch {
        await emergencyStopAfterStorageFailure();
        return 'uncertain';
      }
      return reconcileAtBootUnlocked();
    });
  }

  function reconcileForOwner(
    currentOwnerId: string | null,
  ): Promise<BootLocationReconciliationStatus> {
    // This epoch advances before the operation is queued. Auth changes can
    // therefore cancel an older owner reconciliation even while it is blocked
    // inside a native promise.
    const ownerIntent = ++ownerReconciliationIntentClock;
    const intentIsCurrent = () =>
      ownerReconciliationIntentClock === ownerIntent;

    const settleStaleIntent = async (): Promise<
      BootLocationReconciliationStatus
    > => {
      try {
        await store.prepareCollectorForOwner(null);
        await store.compactOrphanCollectorLineage();
      } catch {
        await emergencyStopAfterStorageFailure();
        return 'uncertain';
      }
      return reconcileAtBootUnlocked();
    };

    return serializeNativeTaskMutation(async () => {
      if (!intentIsCurrent()) return 'paused';
      let prepared: Awaited<ReturnType<typeof store.prepareCollectorForOwner>>;
      try {
        prepared = await store.prepareCollectorForOwner(currentOwnerId);
        await store.compactOrphanCollectorLineage();
        if (!intentIsCurrent()) return settleStaleIntent();
        if (prepared.kind === 'resume') {
          if (!intentIsCurrent()) return settleStaleIntent();
          const reserved = await prepareTaskLeaseForNativeFloor(
            prepared.identity,
            options.createLeaseId(),
            intentIsCurrent,
          );
          if (!reserved) return settleStaleIntent();
          if (
            reserved.reservedGeneration !== null &&
            supportsGenerationDrain(options.runtime)
          ) {
            try {
              await options.runtime.start(reserved.reservedGeneration);
            } catch {
              await store.suspendTaskLeaseFor(prepared.identity)
                .catch(() => undefined);
              await abortReservedGeneration(
                options.runtime,
                reserved.reservedGeneration,
              );
              return 'uncertain';
            }
          }
          if (!intentIsCurrent()) return settleStaleIntent();
        }
      } catch {
        await emergencyStopAfterStorageFailure();
        return 'uncertain';
      }
      const status = await reconcileAtBootUnlocked(intentIsCurrent);
      return intentIsCurrent() ? status : settleStaleIntent();
    });
  }

  return {
    startFor,
    ensureFor,
    pauseFor,
    finalizeFor,
    claimFinalizedEnqueueFor,
    acknowledgeFinalizedFor,
    discardFor,
    reconcile,
    reconcileAtBoot,
    reconcileForOwner,
  };
}

const defaultNativeDrainRuntime = createNativeLocationDrainRuntime({
  taskName: LOCATION_TASK_NAME,
  options: LOCATION_UPDATE_OPTIONS,
});

const defaultLocationTaskRuntime: LocationTaskRuntime = {
  hasStarted: async () => defaultNativeDrainRuntime
    ? (await defaultNativeDrainRuntime.getCollectorState()).running
    : Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME),
  getForegroundPermission: () => Location.getForegroundPermissionsAsync(),
  getBackgroundPermission: () => Location.getBackgroundPermissionsAsync(),
  start: (generation?: number) => {
    if (defaultNativeDrainRuntime && isPositiveSequence(generation)) {
      return defaultNativeDrainRuntime.start(generation);
    }
    return Location.startLocationUpdatesAsync(
      LOCATION_TASK_NAME,
      LOCATION_UPDATE_OPTIONS,
    );
  },
  stop: async () => {
    if (defaultNativeDrainRuntime) {
      const state = await defaultNativeDrainRuntime.getCollectorState();
      if (state.running && state.generation !== null) {
        await defaultNativeDrainRuntime.stopAndDrain(state.generation);
      } else {
        await defaultNativeDrainRuntime.stopLegacyCollector();
      }
      return;
    }
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  },
  ...(defaultNativeDrainRuntime
    ? {
        getCollectorState: () =>
          defaultNativeDrainRuntime.getCollectorState(),
        reserveGeneration: (minimumGeneration: number) =>
          defaultNativeDrainRuntime.reserveGeneration(minimumGeneration),
        stopAndDrain: (generation: number) =>
          defaultNativeDrainRuntime.stopAndDrain(generation),
        stopLegacyCollector: () =>
          defaultNativeDrainRuntime.stopLegacyCollector(),
        acknowledgeBatch: (
          generation: number,
          batchId: string,
          throughSequence: number,
        ) => defaultNativeDrainRuntime.acknowledgeBatch(
          generation,
          batchId,
          throughSequence,
        ),
        taintAndAcknowledgeBatch: (
          generation: number,
          batchId: string,
          throughSequence: number,
        ) => defaultNativeDrainRuntime.taintAndAcknowledgeBatch(
          generation,
          batchId,
          throughSequence,
        ),
      }
    : {}),
};

const defaultLocationTaskHandler = createLocationTaskHandler(
  defaultRecordingStore,
  defaultLocationTaskRuntime,
);

// The task runs in a separate context (including background). Its first
// awaited storage action is the ownerless immutable WAL write. The native
// batch is acknowledged only after that write durably succeeds.
if (Platform.OS !== 'web') {
  TaskManager.defineTask(LOCATION_TASK_NAME, defaultLocationTaskHandler);
}

const defaultLocationTaskLifecycle = createLocationTaskLifecycle({
  storage: AsyncStorage,
  createLeaseId: secureCreateActivityId,
  runtime: defaultLocationTaskRuntime,
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

export async function claimFinalizedEnqueueFor(
  identity: TrackRecordingIdentity,
  snapshotId: string,
): Promise<ClaimFinalizedEnqueueResult> {
  return defaultLocationTaskLifecycle.claimFinalizedEnqueueFor(
    identity,
    snapshotId,
  );
}

export async function discardTrackRecordingFor(
  identity: TrackRecordingIdentity,
): Promise<DiscardTrackRecordingResult> {
  return defaultLocationTaskLifecycle.discardFor(identity);
}

export async function reconcileLocationTask(
  runtime: LocationTaskRuntime,
  storage: LocationRecordingStorage = AsyncStorage,
): Promise<'running' | 'paused' | 'uncertain'> {
  // Boot reconciliation participates in the same native coordinator as every
  // owner-bound start/pause. It may adopt only an already-durable lease; it
  // never creates one from identity-less permission or native state.
  return createLocationTaskLifecycle({
    storage,
    runtime,
    createLeaseId: secureCreateActivityId,
  }).reconcile();
}

export async function reconcileLocationCollectorAtBoot(): Promise<
  BootLocationReconciliationStatus
> {
  if (Platform.OS === 'web') return 'paused';
  return defaultLocationTaskLifecycle.reconcileAtBoot();
}

export async function reconcileLocationCollectorForOwner(
  ownerId: string | null,
): Promise<BootLocationReconciliationStatus> {
  if (Platform.OS === 'web') return 'paused';
  return defaultLocationTaskLifecycle.reconcileForOwner(ownerId);
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

export async function discardLegacyUnprovableTrackRecording(
  discardToken: string,
): Promise<'discarded' | 'stale'> {
  return defaultRecordingStore.discardLegacyUnprovable(discardToken);
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
      const parsedLeases = parseLocationTaskLeases(
        value.locationLeases,
        value.locationLease,
        {
          session: value.session,
          activityId: value.activityId,
          ownerId: value.ownerId,
          startedAt: value.startedAt,
        },
      );
      const locationLeases = parsedLeases.malformed
        ? [
            ...parsedLeases.leases,
            legacyUnprovableLease({
              session: value.session,
              activityId: value.activityId,
              ownerId: value.ownerId,
              startedAt: value.startedAt,
            }, parsedLeases.leases.length + 1),
          ]
        : parsedLeases.leases;
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
        locationLeases,
        consumedLocationChunkIds: parseConsumedLocationChunkIds(
          value.consumedLocationChunkIds,
          completed !== null,
        ),
        resumeAfterOwnerCheck:
          value.schema === 3 && value.resumeAfterOwnerCheck === true,
      };
      const terminal = value.schema === 3
        ? parseRecordingTerminal(value.terminal)
        : completed
          ? legacySealedTerminal(base, completed)
          : null;
      if (value.schema === 3 && value.terminal !== null && !terminal) {
        return null;
      }
      const terminalAuthorityMalformed = Boolean(
        terminal?.phase === 'sealed' &&
        !sealedTerminalMatchesRecording(terminal, base, completed),
      );
      const mustQuarantine =
        parsedLeases.malformed ||
        locationLeases.some((lease) => lease.collectorGeneration === 0) ||
        (value.schema === 2 && completed !== null) ||
        terminalAuthorityMalformed;
      if (
        mustQuarantine &&
        !locationLeases.some((lease) => lease.collectorGeneration === 0)
      ) {
        locationLeases.push(legacyUnprovableLease({
          session: base.session,
          activityId: base.activityId,
          ownerId: base.ownerId,
          startedAt: base.startedAt,
        }, locationLeases.length + 1));
      }
      if (mustQuarantine) {
        for (let index = 0; index < locationLeases.length; index += 1) {
          const lease = locationLeases[index];
          if (lease.revokedAtExclusive === null) {
            locationLeases[index] = {
              ...lease,
              revokedAtExclusive: lease.activatedAt,
            };
          }
        }
      }
      const safeTerminal = mustQuarantine
        ? legacyUnprovableTerminal(base, completed, terminal)
        : terminal;
      const safeCompleted = mustQuarantine ? null : completed;
      const state = safeTerminal?.phase === 'sealed'
        ? 'sealed'
        : safeTerminal?.phase === 'closing'
          ? 'closing'
          : activeLeaseFromParts(base.locationLeases, base)
            ? 'recording'
            : 'paused';
      return {
        kind: 'current',
        blob: {
          ...base,
          completed: safeCompleted,
          resumeAfterOwnerCheck: safeTerminal
            ? false
            : base.resumeAfterOwnerCheck,
          state,
          terminal: safeTerminal,
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

function legacyDiscardToken(
  raw: string,
  fingerprint: (value: string) => string,
): string {
  return `${utf8ByteLength(raw)}:${fingerprint(raw)}`;
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
      typeof entry.batchFingerprint === 'string' &&
      (entry.rawFingerprint === undefined ||
        typeof entry.rawFingerprint === 'string')
        ? [{
            key: entry.key,
            batchFingerprint: entry.batchFingerprint,
            ...(typeof entry.rawFingerprint === 'string'
              ? { rawFingerprint: entry.rawFingerprint }
              : {}),
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
  if (
    value.phase === 'sealed' &&
    (value.quarantineReason === 'legacy_unprovable' ||
      value.quarantineReason === 'tracking_incomplete')
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
  const resolution =
    value.resolution === 'closing' ||
    value.resolution === 'sealed' ||
    value.resolution === 'enqueueing' ||
    value.resolution === 'discarding'
      ? value.resolution
      : value.phase === 'sealed'
        ? 'sealed'
        : 'closing';
  if (
    (value.phase === 'closing' &&
      resolution !== 'closing' &&
      resolution !== 'discarding') ||
    (value.phase === 'sealed' && resolution === 'closing')
  ) {
    return null;
  }
  return {
    phase: value.phase,
    resolution,
    resolutionId:
      typeof value.resolutionId === 'string' && value.resolutionId.length > 0
        ? value.resolutionId
        : value.finishId,
    quarantineReason:
      value.quarantineReason === 'legacy_unprovable' ||
        value.quarantineReason === 'tracking_incomplete'
        ? value.quarantineReason
        : null,
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
    resolution: 'sealed',
    resolutionId: finishId,
    quarantineReason: null,
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

function legacyUnprovableTerminal(
  blob: Pick<
    RecordingBlob,
    'activityId' | 'ownerId' | 'startedAt' | 'points' | 'type'
  >,
  completed: NewActivity | null,
  existing: RecordingTerminal | null,
): RecordingTerminal {
  if (existing?.resolution === 'discarding') {
    return {
      ...existing,
      phase: 'closing',
      quarantineReason: 'legacy_unprovable',
      finalized: null,
    };
  }
  const finishId = existing?.finishId ??
    `legacy-unprovable-finish:${blob.activityId}`;
  const snapshotId = existing?.snapshotId ??
    `legacy-unprovable-snapshot:${blob.activityId}`;
  return {
    phase: 'closing',
    resolution: 'closing',
    resolutionId: existing?.resolutionId ?? finishId,
    quarantineReason: 'legacy_unprovable',
    finishId,
    snapshotId,
    cutoffExclusive: existing?.cutoffExclusive ?? Number.MAX_SAFE_INTEGER,
    summary: existing?.summary ?? {
      type: completed?.type ?? blob.type,
      durationS: completed?.duration_s ?? 0,
    },
    candidate: null,
    finalized: null,
  };
}

function trackingIncompleteTerminal(
  blob: Pick<
    RecordingBlob,
    'activityId' | 'ownerId' | 'startedAt' | 'points' | 'type'
  >,
  existing: RecordingTerminal | null,
): RecordingTerminal {
  if (existing?.resolution === 'discarding') {
    return {
      ...existing,
      phase: 'closing',
      quarantineReason: 'tracking_incomplete',
      finalized: null,
    };
  }
  const finishId = existing?.finishId ??
    `tracking-incomplete-finish:${blob.activityId}`;
  const snapshotId = existing?.snapshotId ??
    `tracking-incomplete-snapshot:${blob.activityId}`;
  return {
    phase: 'closing',
    resolution: 'closing',
    resolutionId: existing?.resolutionId ?? finishId,
    quarantineReason: 'tracking_incomplete',
    finishId,
    snapshotId,
    cutoffExclusive: existing?.cutoffExclusive ?? Number.MAX_SAFE_INTEGER,
    summary: existing?.summary ?? { type: blob.type, durationS: 0 },
    candidate: null,
    finalized: null,
  };
}

function sealedTerminalMatchesRecording(
  terminal: RecordingTerminal,
  blob: Pick<
    RecordingBlob,
    'activityId' | 'ownerId' | 'startedAt' | 'type'
  >,
  completed: NewActivity | null,
): boolean {
  const finalized = terminal.finalized;
  if (!finalized || !completed) return false;
  return (
    finalized.finishId === terminal.finishId &&
    finalized.snapshotId === terminal.snapshotId &&
    finalized.identity.activityId === blob.activityId &&
    finalized.identity.ownerId === blob.ownerId &&
    finalized.identity.startedAt === blob.startedAt &&
    finalized.recording.activityId === blob.activityId &&
    finalized.recording.ownerId === blob.ownerId &&
    finalized.recording.activity.started_at === blob.startedAt &&
    finalized.recording.activity.type === blob.type &&
    terminal.summary.type === finalized.recording.activity.type &&
    terminal.summary.durationS === finalized.recording.activity.duration_s &&
    JSON.stringify(finalized.recording.activity) === JSON.stringify(completed)
  );
}

function finalizedFromBlob(
  blob: RecordingBlob,
): FinalizedTrackRecording | null {
  return blob.terminal?.phase === 'sealed' &&
    blob.terminal.resolution !== 'discarding'
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
  identity: Pick<
    RecordingBlob,
    'session' | 'activityId' | 'ownerId' | 'startedAt'
  >,
): { leases: LocationTaskLease[]; malformed: boolean } {
  const leases: LocationTaskLease[] = [];
  let malformed = false;
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const lease = parseLocationTaskLease(candidate);
      if (
        lease &&
        lease.session === identity.session &&
        lease.activityId === identity.activityId &&
        lease.ownerId === identity.ownerId &&
        lease.startedAt === identity.startedAt
      ) {
        leases.push(lease);
      } else {
        malformed = true;
      }
    }
  } else if (value !== null && value !== undefined) {
    malformed = true;
  }
  if (legacyValue === null || legacyValue === undefined) {
    return { leases, malformed };
  }
  if (!isRecord(legacyValue)) {
    return { leases, malformed: true };
  }
  const legacyActivatedAt = Date.parse(identity.startedAt);
  if (
    legacyValue.schema !== 1 ||
    typeof legacyValue.id !== 'string' ||
    typeof legacyValue.session !== 'string' ||
    typeof legacyValue.activityId !== 'string' ||
    typeof legacyValue.ownerId !== 'string' ||
    typeof legacyValue.startedAt !== 'string' ||
    typeof legacyValue.appendEnabled !== 'boolean'
  ) {
    return { leases, malformed: true };
  }
  const legacyLease: LocationTaskLease = {
    schema: 1,
    id: legacyValue.id,
    ordinal: 1,
    session: legacyValue.session,
    activityId: legacyValue.activityId,
    ownerId: legacyValue.ownerId,
    startedAt: legacyValue.startedAt,
    activatedAt: Number.isFinite(legacyActivatedAt) ? legacyActivatedAt : 0,
    revokedAtExclusive: legacyValue.appendEnabled ? null : 0,
    collectorGeneration: 0,
    drainedThroughSequence: null,
  };
  if (
    legacyLease.session !== identity.session ||
    legacyLease.activityId !== identity.activityId ||
    legacyLease.ownerId !== identity.ownerId ||
    legacyLease.startedAt !== identity.startedAt
  ) {
    return { leases, malformed: true };
  }
  leases.push(legacyLease);
  return { leases, malformed };
}

function legacyUnprovableLease(
  identity: Pick<
    RecordingBlob,
    'session' | 'activityId' | 'ownerId' | 'startedAt'
  >,
  ordinal: number,
): LocationTaskLease {
  const activatedAt = Date.parse(identity.startedAt);
  const safeActivatedAt = Number.isFinite(activatedAt) ? activatedAt : 0;
  return {
    schema: 1,
    id: `legacy-unprovable:${identity.activityId}:${ordinal}`,
    ordinal,
    ...identity,
    activatedAt: safeActivatedAt,
    revokedAtExclusive: safeActivatedAt,
    collectorGeneration: 0,
    drainedThroughSequence: null,
  };
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
    collectorGeneration:
      typeof value.collectorGeneration === 'number' &&
      Number.isSafeInteger(value.collectorGeneration) &&
      value.collectorGeneration > 0
        ? value.collectorGeneration
        : 0,
    drainedThroughSequence:
      typeof value.drainedThroughSequence === 'number' &&
      Number.isSafeInteger(value.drainedThroughSequence) &&
      value.drainedThroughSequence >= 0
        ? value.drainedThroughSequence
        : null,
  };
}

function parseCollectorLineage(raw: string | null): CollectorLineage {
  if (!raw) return { schema: 1, nextGeneration: 1, collectors: [] };
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.schema !== 1 ||
      typeof value.nextGeneration !== 'number' ||
      !Number.isSafeInteger(value.nextGeneration) ||
      value.nextGeneration < 1 ||
      !Array.isArray(value.collectors)
    ) {
      throw new Error('Invalid collector lineage');
    }
    const nextGeneration = value.nextGeneration;
    const collectors = value.collectors.flatMap(
      (entry): CollectorLineageEntry[] => {
        if (
          !isRecord(entry) ||
          typeof entry.generation !== 'number' ||
          !Number.isSafeInteger(entry.generation) ||
          entry.generation < 1 ||
          typeof entry.leaseId !== 'string' ||
          typeof entry.session !== 'string' ||
          typeof entry.activityId !== 'string' ||
          typeof entry.ownerId !== 'string' ||
          typeof entry.startedAt !== 'string' ||
          typeof entry.activatedAt !== 'number' ||
          !Number.isFinite(entry.activatedAt) ||
          !(
            entry.revokedAtExclusive === null ||
            (typeof entry.revokedAtExclusive === 'number' &&
              Number.isFinite(entry.revokedAtExclusive))
          ) ||
          !(
            entry.drainedThroughSequence === null ||
            (typeof entry.drainedThroughSequence === 'number' &&
              Number.isSafeInteger(entry.drainedThroughSequence) &&
              entry.drainedThroughSequence >= 0)
          ) ||
          (entry.resolution !== 'active' &&
            entry.resolution !== 'paused' &&
            entry.resolution !== 'closing' &&
            entry.resolution !== 'sealed' &&
            entry.resolution !== 'discarded')
        ) {
          return [];
        }
        return [{
          generation: entry.generation,
          leaseId: entry.leaseId,
          session: entry.session,
          activityId: entry.activityId,
          ownerId: entry.ownerId,
          startedAt: entry.startedAt,
          activatedAt: entry.activatedAt,
          revokedAtExclusive: entry.revokedAtExclusive,
          drainedThroughSequence: entry.drainedThroughSequence,
          resolution: entry.resolution,
        }];
      },
    );
    if (collectors.length !== value.collectors.length) {
      throw new Error('Invalid collector lineage');
    }
    const generations = collectors.map((entry) => entry.generation);
    if (
      new Set(generations).size !== generations.length ||
      generations.some((generation) => generation >= nextGeneration)
    ) {
      throw new Error('Invalid collector lineage');
    }
    return {
      schema: 1,
      nextGeneration,
      collectors,
    };
  } catch {
    throw new Error('Collector lineage is corrupt');
  }
}

function isLegacyLocationQuarantine(raw: string): boolean {
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) &&
      value.schema === 1 &&
      value.sweepGenerationZero === true;
  } catch {
    return false;
  }
}

function isLocationTaskSample(value: unknown): value is LocationTaskSample {
  if (!isRecord(value) || !isPoint(value)) return false;
  const capturedAt: unknown = (value as Record<string, unknown>).capturedAt;
  const nativeSequence: unknown =
    (value as Record<string, unknown>).nativeSequence;
  return typeof capturedAt === 'number' && Number.isFinite(capturedAt) &&
    (nativeSequence === undefined || nativeSequence === null ||
      isPositiveSequence(nativeSequence));
}

function isPositiveSequence(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isNativeCollectorBatchId(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value);
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
  collectorGeneration: number | null = null,
): string {
  return fingerprint(
    `${collectorGeneration ?? 0}\u0000${sample.nativeSequence ?? 0}\u0000${sample.capturedAt}\u0000${sample.lat.toPrecision(15)}\u0000${sample.lon.toPrecision(15)}`,
  );
}

function compareLocationTaskSamples(
  left: LocationTaskSample & { collectorGeneration: number | null },
  right: LocationTaskSample & { collectorGeneration: number | null },
): number {
  const leftGeneration = left.collectorGeneration ?? 0;
  const rightGeneration = right.collectorGeneration ?? 0;
  if (
    leftGeneration > 0 &&
    rightGeneration > 0 &&
    isPositiveSequence(left.nativeSequence) &&
    isPositiveSequence(right.nativeSequence)
  ) {
    return leftGeneration - rightGeneration ||
      left.nativeSequence - right.nativeSequence;
  }
  return left.capturedAt - right.capturedAt;
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

type QueueRouteEnvelope = {
  activityId: string;
  ownerId: string;
  type: NewActivity['type'];
  durationS: number;
  distanceM: number;
  startedAt: string;
};

/**
 * Produces a deterministic private-route projection that is safe for every
 * valid persisted queue state. The immutable candidate and raw points remain
 * intact until exact acknowledgement; only the upload/share payload is
 * sampled. First/last points and the distance calculated from the full route
 * are always retained.
 */
function canonicalizeRouteForQueue(
  route: readonly Pt[],
  envelope: QueueRouteEnvelope,
): Pt[] {
  let targetSize = Math.min(route.length, MAX_ROUTE_POINTS);
  let canonical = sampleRouteAtEvenIntervals(route, targetSize);
  let byteLength = worstCaseQueuedActivityBytes(canonical, envelope);

  while (byteLength > MAX_QUEUED_ACTIVITY_BYTES && canonical.length > 2) {
    const proportionalSize = Math.floor(
      canonical.length * MAX_QUEUED_ACTIVITY_BYTES / byteLength * 0.98,
    );
    targetSize = Math.max(
      2,
      Math.min(canonical.length - 1, proportionalSize),
    );
    canonical = sampleRouteAtEvenIntervals(route, targetSize);
    byteLength = worstCaseQueuedActivityBytes(canonical, envelope);
  }

  if (byteLength > MAX_QUEUED_ACTIVITY_BYTES) {
    throw new Error('Finalized route cannot fit the offline queue');
  }
  return canonical;
}

function sampleRouteAtEvenIntervals(
  route: readonly Pt[],
  targetSize: number,
): Pt[] {
  if (targetSize >= route.length) return route.map((point) => ({ ...point }));
  if (targetSize <= 0 || route.length === 0) return [];
  if (targetSize === 1 || route.length === 1) return [{ ...route[0] }];
  const lastIndex = route.length - 1;
  return Array.from({ length: targetSize }, (_, index) => {
    const sourceIndex = index === targetSize - 1
      ? lastIndex
      : Math.floor(index * lastIndex / (targetSize - 1));
    return { ...route[sourceIndex] };
  });
}

function worstCaseQueuedActivityBytes(
  route: readonly Pt[],
  envelope: QueueRouteEnvelope,
): number {
  const serialized = JSON.stringify({
    schema: 1,
    id: envelope.activityId,
    ownerId: envelope.ownerId,
    activity: {
      type: envelope.type,
      distance_m: envelope.distanceM,
      duration_s: envelope.durationS,
      route,
      started_at: envelope.startedAt,
    },
    createdAt: '9999-12-31T23:59:59.999Z',
    status: 'needs_attention',
    attemptCount: Number.MAX_SAFE_INTEGER,
    nextAttemptAt: Number.MAX_SAFE_INTEGER,
    lastError: {
      category: 'validation',
      // A control code expands to a six-byte JSON escape, the largest valid
      // serialization per JavaScript code unit accepted by queue validation.
      message: '\u0000'.repeat(MAX_LAST_ERROR_MESSAGE_LENGTH),
    },
  });
  return utf8ByteLength(serialized);
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 0xdc00 &&
      value.charCodeAt(index + 1) <= 0xdfff
    ) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function journalSnapshotsEqual(
  left: JournalSnapshot,
  right: JournalSnapshot,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parseLocationTaskBatch(raw: string | null): LocationTaskBatch | null {
  if (!raw || utf8ByteLength(raw) > MAX_LOCATION_BATCH_BYTES) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.schema !== 1 ||
      typeof value.batchId !== 'string' ||
      !(
        value.collectorGeneration === null ||
        value.collectorGeneration === undefined ||
        (typeof value.collectorGeneration === 'number' &&
          Number.isSafeInteger(value.collectorGeneration) &&
          value.collectorGeneration > 0)
      ) ||
      typeof value.receivedAt !== 'number' ||
      !Number.isFinite(value.receivedAt) ||
      !Array.isArray(value.samples) ||
      value.samples.length > MAX_LOCATION_BATCH_SAMPLES ||
      !value.samples.every((sample) =>
        isValidRawLocationTaskSample(sample) &&
        (typeof value.collectorGeneration === 'number' ||
          sample.capturedAt <=
            (value.receivedAt as number) + MAX_LOCATION_FUTURE_DRIFT_MS),
      )
    ) {
      return null;
    }
    return {
      schema: 1,
      batchId: value.batchId,
      collectorGeneration:
        typeof value.collectorGeneration === 'number'
          ? value.collectorGeneration
          : null,
      receivedAt: value.receivedAt,
      samples: value.samples.map((sample) => ({
        ...sample,
        nativeSequence: isPositiveSequence(sample.nativeSequence)
          ? sample.nativeSequence
          : null,
      })),
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
        typeof entry.batchFingerprint === 'string' &&
        (entry.rawFingerprint === undefined ||
          typeof entry.rawFingerprint === 'string')
          ? [{
              key: entry.key,
              batchFingerprint: entry.batchFingerprint,
              ...(typeof entry.rawFingerprint === 'string'
                ? { rawFingerprint: entry.rawFingerprint }
                : {}),
            }]
          : [],
    );
    if (entries.length !== value.entries.length) return null;
    const collectorGenerations = value.collectorGenerations === undefined
      ? []
      : Array.isArray(value.collectorGenerations) &&
          value.collectorGenerations.every(isPositiveSequence)
        ? [...new Set(value.collectorGenerations)]
        : null;
    if (!collectorGenerations) return null;
    if (
      value.orphaned !== undefined &&
      typeof value.orphaned !== 'boolean'
    ) {
      return null;
    }
    return {
      schema: 1,
      snapshotId: value.snapshotId,
      entries,
      collectorGenerations,
      ...(value.orphaned === true ? { orphaned: true } : {}),
    };
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
    nativeSequence: isPositiveSequence(location.nativeSequence)
      ? location.nativeSequence
      : null,
  };
}
