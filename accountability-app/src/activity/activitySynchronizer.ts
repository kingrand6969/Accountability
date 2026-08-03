import {
  ActivityUploadError,
  uploadQueuedActivity,
} from './activityUpload';
import {
  listQueuedActivities,
  patchQueuedActivity,
  removeQueuedActivity,
} from './offlineQueueStore';
import type {
  QueuedActivity,
  UploadErrorCategory,
} from './offlineQueueTypes';

const MAX_RETRY_DELAY_MS = 30 * 60_000;
const MAX_ERROR_MESSAGE_LENGTH = 4_096;
const OWNER_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PERSISTED_ERROR_MESSAGES: Record<UploadErrorCategory, string> = {
  network: 'Check your internet connection and try again.',
  auth: 'Sign in to upload this activity.',
  server: 'The activity service is temporarily unavailable.',
  validation: 'This activity needs review before it can upload.',
  storage: 'Offline activity storage failed.',
};

type QueuePatch = Partial<
  Pick<
    QueuedActivity,
    'status' | 'attemptCount' | 'nextAttemptAt' | 'lastError'
  >
>;

export type ActivitySynchronizerDependencies = {
  list: (ownerId: string) => Promise<QueuedActivity[]>;
  patch: (
    ownerId: string,
    id: string,
    patch: QueuePatch,
  ) => Promise<QueuedActivity>;
  remove: (ownerId: string, id: string) => Promise<void>;
  upload: (entry: QueuedActivity) => Promise<string>;
  now: () => number;
  random: () => number;
};

const defaultDependencies: ActivitySynchronizerDependencies = {
  list: listQueuedActivities,
  patch: patchQueuedActivity,
  remove: removeQueuedActivity,
  upload: uploadQueuedActivity,
  now: Date.now,
  random: Math.random,
};

export function retryDelayMs(
  attempt: number,
  random: () => number = Math.random,
): number {
  const safeAttempt =
    Number.isNaN(attempt) || attempt < 0
      ? 0
      : Number.isFinite(attempt)
        ? Math.floor(attempt)
        : Number.MAX_SAFE_INTEGER;
  const randomValue = random();
  const safeRandom = Number.isFinite(randomValue)
    ? Math.min(1, Math.max(0, randomValue))
    : 0.5;
  const base = Math.min(
    MAX_RETRY_DELAY_MS,
    2 ** Math.min(safeAttempt, 11) * 1_000,
  );

  return Math.min(
    MAX_RETRY_DELAY_MS,
    Math.round(base * (0.8 + safeRandom * 0.4)),
  );
}

export function createActivitySynchronizer(
  overrides: Partial<ActivitySynchronizerDependencies> = {},
) {
  const dependencies: ActivitySynchronizerDependencies = {
    ...defaultDependencies,
    ...overrides,
  };
  type OwnerDrainState = {
    promise: Promise<void>;
    resolve: () => void;
    reject: (cause: unknown) => void;
    queued: boolean;
    running: boolean;
    rerunRequested: boolean;
    forceRequested: boolean;
  };

  const activeByOwner = new Map<string, OwnerDrainState>();
  let operationTail: Promise<void> = Promise.resolve();

  const finish = (
    ownerId: string,
    state: OwnerDrainState,
    result:
      | { success: true }
      | { success: false; cause: unknown },
  ) => {
    if (activeByOwner.get(ownerId) !== state) return;
    activeByOwner.delete(ownerId);
    if (result.success) {
      state.resolve();
    } else {
      state.reject(result.cause);
    }
  };

  const enqueuePass = (
    ownerId: string,
    state: OwnerDrainState,
  ): void => {
    state.queued = true;
    const pass = operationTail.then(async () => {
      state.queued = false;
      state.running = true;
      const force = state.forceRequested;
      state.forceRequested = false;
      await drainOnce(ownerId, force, dependencies);
    });

    operationTail = pass.catch(() => undefined);
    void pass.then(
      () => {
        state.running = false;
        if (state.rerunRequested) {
          state.rerunRequested = false;
          enqueuePass(ownerId, state);
        } else {
          finish(ownerId, state, { success: true });
        }
      },
      (cause) => {
        state.running = false;
        finish(ownerId, state, { success: false, cause });
      },
    );
  };

  return {
    drain(ownerId: string, force = false): Promise<void> {
      if (!OWNER_UUID.test(ownerId)) {
        return Promise.reject(
          new ActivityUploadError(
            'auth',
            'A canonical activity owner is required.',
            false,
            undefined,
            'invalid_owner',
          ),
        );
      }

      const active = activeByOwner.get(ownerId);
      if (active) {
        if (active.running) active.rerunRequested = true;
        active.forceRequested ||= force;
        return active.promise;
      }

      let resolve!: () => void;
      let reject!: (cause: unknown) => void;
      const promise = new Promise<void>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      const state: OwnerDrainState = {
        promise,
        resolve,
        reject,
        queued: false,
        running: false,
        rerunRequested: false,
        forceRequested: force,
      };
      activeByOwner.set(ownerId, state);
      enqueuePass(ownerId, state);
      return promise;
    },
  };
}

async function drainOnce(
  ownerId: string,
  force: boolean,
  dependencies: ActivitySynchronizerDependencies,
): Promise<void> {
  let listed: QueuedActivity[];
  try {
    listed = await dependencies.list(ownerId);
  } catch (cause) {
    throw classifyQueueError(cause);
  }

  for (const entry of listed) {
    if (entry.ownerId !== ownerId) {
      throw new ActivityUploadError(
        'auth',
        'The queued activity belongs to another account.',
        false,
        undefined,
        'queue_owner_mismatch',
      );
    }
  }

  const entries = listed
    .map((entry, index) => ({ entry, index }))
    .sort(
      (left, right) =>
        Date.parse(left.entry.createdAt) -
          Date.parse(right.entry.createdAt) ||
        left.index - right.index,
    )
    .map(({ entry }) => entry);

  for (const storedEntry of entries) {
    const now = safeNow(dependencies.now);
    if (!force) {
      if (storedEntry.status === 'needs_attention') continue;
      if (storedEntry.nextAttemptAt > now) break;
    }

    let uploading: QueuedActivity;
    try {
      uploading = await dependencies.patch(
        ownerId,
        storedEntry.id,
        {
          status: 'uploading',
          lastError: null,
        },
      );
    } catch (cause) {
      throw classifyQueueError(cause);
    }

    let confirmedId: string;
    try {
      confirmedId = await dependencies.upload(uploading);
    } catch (cause) {
      const shouldStop = await recordUploadFailure(
        ownerId,
        uploading,
        classifyUploadError(cause),
        dependencies,
      );
      if (shouldStop) return;
      continue;
    }

    if (confirmedId !== uploading.id) {
      const shouldStop = await recordUploadFailure(
        ownerId,
        uploading,
        new ActivityUploadError(
          'validation',
          'Activity upload confirmation did not match the queued activity.',
          false,
          undefined,
          'confirmation_id_mismatch',
        ),
        dependencies,
      );
      if (shouldStop) return;
      continue;
    }

    try {
      await dependencies.remove(ownerId, uploading.id);
    } catch (cause) {
      throw classifyQueueError(cause);
    }
  }
}

async function recordUploadFailure(
  ownerId: string,
  uploading: QueuedActivity,
  error: ActivityUploadError,
  dependencies: ActivitySynchronizerDependencies,
): Promise<boolean> {
  const attemptCount = incrementAttempt(uploading.attemptCount);
  const errorAt = safeNow(dependencies.now);

  if (
    error.category === 'network' ||
    (error.category === 'server' && error.transient)
  ) {
    await patchFailure(
      ownerId,
      uploading.id,
      {
        status: 'waiting_network',
        attemptCount,
        nextAttemptAt: addDelay(
          errorAt,
          retryDelayMs(attemptCount, dependencies.random),
        ),
        lastError: queueError(error),
      },
      dependencies,
    );
    return true;
  }

  if (error.category === 'auth') {
    await patchFailure(
      ownerId,
      uploading.id,
      {
        status: 'needs_sign_in',
        attemptCount,
        nextAttemptAt: errorAt,
        lastError: queueError(error),
      },
      dependencies,
    );
    return true;
  }

  await patchFailure(
    ownerId,
    uploading.id,
    {
      status: 'needs_attention',
      attemptCount,
      nextAttemptAt: errorAt,
      lastError: queueError(error),
    },
    dependencies,
  );
  return false;
}

async function patchFailure(
  ownerId: string,
  id: string,
  patch: QueuePatch,
  dependencies: ActivitySynchronizerDependencies,
): Promise<void> {
  try {
    await dependencies.patch(ownerId, id, patch);
  } catch (cause) {
    throw classifyQueueError(cause);
  }
}

function classifyUploadError(cause: unknown): ActivityUploadError {
  if (cause instanceof ActivityUploadError) return cause;
  if (isRecord(cause) && isErrorCategory(cause.category)) {
    return new ActivityUploadError(
      cause.category,
      safeMessage(cause, 'Activity upload failed.'),
      cause.transient === true,
      cause,
      typeof cause.code === 'string' ? cause.code : undefined,
    );
  }
  return new ActivityUploadError(
    'server',
    safeMessage(cause, 'Activity upload failed.'),
    true,
    cause,
    'unexpected_upload_failure',
  );
}

function classifyQueueError(cause: unknown): ActivityUploadError {
  if (cause instanceof ActivityUploadError) {
    if (cause.category === 'storage') return cause;
    if (cause.category === 'auth') {
      return new ActivityUploadError(
        'auth',
        'Offline activity storage authorization failed.',
        false,
        cause,
        'queue_auth_error',
      );
    }
  }
  const message = safeMessage(cause, 'Offline activity storage failed.');
  const isOwnerMismatch =
    /owner mismatch|another account|not authorized|unauthori[sz]ed/i.test(
      message,
    );
  return new ActivityUploadError(
    isOwnerMismatch ? 'auth' : 'storage',
    isOwnerMismatch
      ? 'The queued activity belongs to another account.'
      : 'Offline activity storage failed.',
    false,
    cause,
    isOwnerMismatch ? 'queue_owner_mismatch' : 'queue_storage_error',
  );
}

function queueError(
  error: ActivityUploadError,
): QueuedActivity['lastError'] {
  return {
    category: error.category,
    message: PERSISTED_ERROR_MESSAGES[error.category].slice(
      0,
      MAX_ERROR_MESSAGE_LENGTH,
    ),
  };
}

function safeMessage(cause: unknown, fallback: string): string {
  const value =
    isRecord(cause) && typeof cause.message === 'string'
      ? cause.message.trim()
      : '';
  return (value || fallback).slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

function incrementAttempt(attemptCount: number): number {
  if (!Number.isSafeInteger(attemptCount) || attemptCount < 0) return 1;
  return Math.min(Number.MAX_SAFE_INTEGER, attemptCount + 1);
}

function safeNow(now: () => number): number {
  const value = now();
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function addDelay(now: number, delay: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, now + delay);
}

function isErrorCategory(value: unknown): value is UploadErrorCategory {
  return (
    value === 'network' ||
    value === 'auth' ||
    value === 'server' ||
    value === 'validation' ||
    value === 'storage'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
