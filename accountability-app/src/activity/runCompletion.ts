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
