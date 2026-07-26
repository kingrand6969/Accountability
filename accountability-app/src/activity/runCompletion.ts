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

export type RunCompletionDependencies = {
  enqueueActivity: (
    ownerId: string,
    activity: NewActivity,
    id: string,
  ) => Promise<QueuedActivity>;
  clearRecording: (activityId: string) => Promise<void>;
};

/**
 * Makes the offline queue the durable handoff boundary. Raw GPS is retained
 * unless and until the stable activity ID has been confirmed in that queue.
 */
export async function completeRecordedActivity(
  recording: PendingRecordedActivity,
  dependencies: RunCompletionDependencies,
): Promise<QueuedActivity> {
  const queued = await dependencies.enqueueActivity(
    recording.ownerId,
    recording.activity,
    recording.activityId,
  );
  await dependencies.clearRecording(recording.activityId);
  return queued;
}

export type RunSyncPresentation = {
  queued: boolean;
  status: UploadStatus | null;
  title: 'Saved on phone';
  detail: string;
  feedDisabledReason: string | null;
};

function detailFor(status: UploadStatus): string {
  switch (status) {
    case 'uploading':
      return 'Uploading now';
    case 'needs_sign_in':
      return 'Sign in to upload automatically';
    case 'needs_attention':
      return 'Upload needs attention';
    case 'saved':
    case 'waiting_network':
      return 'Uploads automatically when online';
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
      title: 'Saved on phone',
      detail,
      feedDisabledReason: detail,
    };
  }

  return {
    queued: false,
    status: null,
    title: 'Saved on phone',
    detail:
      initialStatus === 'waiting_network'
        ? detailFor(initialStatus)
        : 'Uploaded',
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
