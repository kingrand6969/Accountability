import type { NewActivity } from './api';
import type {
  QueuedActivity,
  UploadStatus,
} from './offlineQueueTypes';

export type PendingRecordedActivity = {
  activityId: string;
  ownerId: string;
  activity: NewActivity;
};

export type FinalizedRecordedActivityEnvelope = {
  recording: PendingRecordedActivity;
};

export type RunCompletionDependencies<
  TFinalized extends FinalizedRecordedActivityEnvelope,
> = {
  claimFinalized: (finalized: TFinalized) => Promise<void>;
  enqueueActivity: (
    ownerId: string,
    activity: NewActivity,
    id: string,
  ) => Promise<QueuedActivity>;
  acknowledgeFinalized: (finalized: TFinalized) => Promise<void>;
};

/**
 * Claims exact completion authority before the offline queue handoff. Raw GPS
 * is retained unless and until that stable activity ID is confirmed queued.
 */
export async function completeRecordedActivity<
  TFinalized extends FinalizedRecordedActivityEnvelope,
>(
  finalized: TFinalized,
  dependencies: RunCompletionDependencies<TFinalized>,
): Promise<QueuedActivity> {
  const { recording } = finalized;
  await dependencies.claimFinalized(finalized);
  const queued = await dependencies.enqueueActivity(
    recording.ownerId,
    recording.activity,
    recording.activityId,
  );
  await dependencies.acknowledgeFinalized(finalized);
  return queued;
}

export type DurableQueueConfirmation = {
  activityId: string;
  status: UploadStatus;
};

export type DurableCompletionResetReason =
  | 'recovery'
  | 'new_recording'
  | 'stop'
  | 'discard'
  | 'auth_owner_change'
  | 'current_run_cleared';

export type DurableCompletionController<
  TFinalized extends FinalizedRecordedActivityEnvelope,
> = {
  complete: (
    finalized: TFinalized,
  ) => Promise<QueuedActivity>;
  isCompleting: (activityId?: string) => boolean;
  reset: (reason: DurableCompletionResetReason) => void;
  dispose: () => void;
};

export function createDurableCompletionController<
  TFinalized extends FinalizedRecordedActivityEnvelope,
>(
  dependencies: RunCompletionDependencies<TFinalized> & {
    onConfirm: (confirmation: DurableQueueConfirmation) => void;
    onReset: (reason: DurableCompletionResetReason) => void;
  },
): DurableCompletionController<TFinalized> {
  let disposed = false;
  let revision = 0;
  let inFlight: {
    activityId: string;
    promise: Promise<QueuedActivity>;
  } | null = null;

  const complete = (
    finalized: TFinalized,
  ): Promise<QueuedActivity> => {
    const { recording } = finalized;
    if (disposed) {
      return Promise.reject(
        new Error('Durable completion controller is disposed.'),
      );
    }
    if (inFlight) {
      if (inFlight.activityId === recording.activityId) {
        return inFlight.promise;
      }
      return Promise.reject(
        new Error('Another activity completion is already in progress.'),
      );
    }

    const expectedRevision = revision;
    const promise = completeRecordedActivity(finalized, dependencies)
      .then((queued) => {
        if (!disposed && revision === expectedRevision) {
          dependencies.onConfirm({
            activityId: queued.id,
            status: queued.status,
          });
        }
        return queued;
      })
      .finally(() => {
        if (inFlight?.promise === promise) {
          inFlight = null;
        }
      });
    inFlight = {
      activityId: recording.activityId,
      promise,
    };
    return promise;
  };

  return {
    complete,
    isCompleting: (activityId) =>
      inFlight !== null &&
      (activityId === undefined || inFlight.activityId === activityId),
    reset: (reason) => {
      if (disposed) return;
      revision += 1;
      dependencies.onReset(reason);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      revision += 1;
    },
  };
}

export type RunSyncPresentation = {
  queued: boolean;
  status: UploadStatus | null;
  title: 'Run saved';
  detail: string;
  feedDisabledReason: string | null;
};

function detailFor(status: UploadStatus): string {
  switch (status) {
    case 'uploading':
      return 'Syncing to your account';
    case 'needs_sign_in':
      return 'Sign in to sync this run';
    case 'needs_attention':
      return 'Sync needs attention';
    case 'saved':
    case 'waiting_network':
      return 'Syncs automatically when online';
  }
}

export function runSyncPresentation(
  activityId: string,
  initialStatus: UploadStatus,
  queuedActivities: readonly QueuedActivity[],
): RunSyncPresentation {
  const queued = queuedActivities.find((entry) => entry.id === activityId);
  if (queued) {
    const detail = detailFor(queued.status);
    return {
      queued: true,
      status: queued.status,
      title: 'Run saved',
      detail,
      feedDisabledReason: detail,
    };
  }

  return {
    queued: false,
    status: null,
    title: 'Run saved',
    detail:
      initialStatus === 'waiting_network'
        ? detailFor(initialStatus)
        : 'Synced to your account',
    feedDisabledReason: null,
  };
}

export type RunFeedAvailabilityInput = {
  queueChecked: boolean;
  syncStatus: 'recovering' | 'idle' | 'syncing' | 'error';
  syncError: string | null;
  queuedActivities: readonly QueuedActivity[];
};

export type RunFeedAvailability =
  | { enabled: true; reason: null }
  | { enabled: false; reason: string };

export function runFeedAvailability(
  activityId: string,
  recordingOwnerId: string,
  currentOwnerId: string | null,
  input: RunFeedAvailabilityInput,
): RunFeedAvailability {
  if (!currentOwnerId || currentOwnerId !== recordingOwnerId) {
    return {
      enabled: false,
      reason: 'Sign in as the recording owner to post',
    };
  }
  if (input.syncStatus === 'error' || input.syncError) {
    return {
      enabled: false,
      reason: 'Uploads unavailable—retry sync',
    };
  }
  if (!input.queueChecked || input.syncStatus === 'recovering') {
    return {
      enabled: false,
      reason: 'Checking saved activity',
    };
  }

  const matching = input.queuedActivities.find(
    (entry) =>
      entry.id === activityId &&
      entry.ownerId === recordingOwnerId,
  );
  if (matching) {
    return {
      enabled: false,
      reason: detailFor(matching.status),
    };
  }
  return { enabled: true, reason: null };
}

export type RecordingRecoveryReadState = 'checking' | 'ready' | 'error';

export type OwnerTaggedRecordingDetails = {
  ownerId: string;
  distance: number;
  elapsed: number;
  points: NewActivity['route'];
};

export function recordingDetailView(
  details: OwnerTaggedRecordingDetails,
  currentOwnerId: string | null,
  recoveryState: RecordingRecoveryReadState,
):
  | (Omit<OwnerTaggedRecordingDetails, 'ownerId'> & { visible: true })
  | {
      visible: false;
      distance: 0;
      elapsed: 0;
      points: [];
    } {
  if (
    recoveryState !== 'ready' ||
    !currentOwnerId ||
    currentOwnerId !== details.ownerId
  ) {
    return {
      visible: false,
      distance: 0,
      elapsed: 0,
      points: [],
    };
  }
  return {
    visible: true,
    distance: details.distance,
    elapsed: details.elapsed,
    points: details.points,
  };
}

export function recordingTypeView(
  type: NewActivity['type'],
  recordingOwnerId: string | null,
  currentOwnerId: string | null,
  recoveryState: RecordingRecoveryReadState,
): {
  title: string;
  selectedType: NewActivity['type'] | null;
  selectorAccessibilityHidden: boolean;
} {
  const visible =
    recoveryState === 'ready' &&
    !!recordingOwnerId &&
    recordingOwnerId === currentOwnerId;
  return visible
    ? {
        title: type,
        selectedType: type,
        selectorAccessibilityHidden: false,
      }
    : {
        title: 'Activity',
        selectedType: null,
        selectorAccessibilityHidden: true,
      };
}

type BooleanLock = { current: boolean };

export function acquireSynchronousLock(lock: BooleanLock): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releaseSynchronousLock(lock: BooleanLock): void {
  lock.current = false;
}

export function createOwnerBoundary(
  expectedOwnerId: string,
  currentOwnerId: () => string | null,
) {
  const assertOwned = () => {
    if (currentOwnerId() !== expectedOwnerId) {
      throw new Error('Recording owner changed');
    }
  };
  return {
    assertOwned,
    async awaitOwned<T>(operation: Promise<T>): Promise<T> {
      assertOwned();
      const result = await operation;
      assertOwned();
      return result;
    },
    runSideEffect<T>(effect: () => T): T {
      assertOwned();
      return effect();
    },
  };
}

export function shouldApplyOwnerAsyncResult(
  requestedOwnerId: string,
  currentOwnerId: string | null,
  requestedRevision: number,
  currentRevision: number,
): boolean {
  return (
    requestedOwnerId === currentOwnerId &&
    requestedRevision === currentRevision
  );
}
