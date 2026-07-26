import type { NewActivity } from './api';

export type UploadStatus =
  | 'saved'
  | 'uploading'
  | 'waiting_network'
  | 'needs_sign_in'
  | 'needs_attention';

export type UploadErrorCategory =
  | 'network'
  | 'auth'
  | 'server'
  | 'validation'
  | 'storage';

export type QueuedActivity = {
  schema: 1;
  id: string;
  ownerId: string;
  activity: NewActivity;
  createdAt: string;
  status: UploadStatus;
  attemptCount: number;
  nextAttemptAt: number;
  lastError: { category: UploadErrorCategory; message: string } | null;
};

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UPLOAD_STATUSES: readonly UploadStatus[] = [
  'saved',
  'uploading',
  'waiting_network',
  'needs_sign_in',
  'needs_attention',
];

const ERROR_CATEGORIES: readonly UploadErrorCategory[] = [
  'network',
  'auth',
  'server',
  'validation',
  'storage',
];

/**
 * Math.random is the cross-platform fallback currently available in this app.
 * Replace it with a platform-secure random source when one is added; injection
 * keeps generation deterministic in tests and allows callers to supply one.
 */
export function createActivityId(random: () => number = Math.random): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const sample = random();
    const bounded = Number.isFinite(sample)
      ? Math.min(Math.max(sample, 0), 1 - Number.EPSILON)
      : 0;
    const nibble = Math.floor(bounded * 16);
    const value = token === 'x' ? nibble : (nibble & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function parseQueuedActivity(value: unknown): QueuedActivity {
  if (!isRecord(value)) invalid();

  const {
    schema,
    id,
    ownerId,
    activity,
    createdAt,
    status,
    attemptCount,
    nextAttemptAt,
    lastError,
  } = value;

  if (
    schema !== 1 ||
    typeof id !== 'string' ||
    !UUID_V4.test(id) ||
    typeof ownerId !== 'string' ||
    ownerId.trim().length === 0 ||
    !isValidDate(createdAt) ||
    !isUploadStatus(status) ||
    typeof attemptCount !== 'number' ||
    !Number.isInteger(attemptCount) ||
    attemptCount < 0 ||
    typeof nextAttemptAt !== 'number' ||
    !Number.isFinite(nextAttemptAt) ||
    nextAttemptAt < 0
  ) {
    invalid();
  }

  const parsedActivity = parseActivity(activity);
  const parsedError = parseLastError(lastError);

  return {
    schema: 1,
    id,
    ownerId,
    activity: parsedActivity,
    createdAt,
    status,
    attemptCount,
    nextAttemptAt,
    lastError: parsedError,
  };
}

function parseActivity(value: unknown): NewActivity {
  if (!isRecord(value)) invalid();

  const { type, distance_m, duration_s, route, started_at } = value;
  if (
    (type !== 'run' && type !== 'walk' && type !== 'ride') ||
    !isNonNegativeFiniteNumber(distance_m) ||
    !isNonNegativeFiniteNumber(duration_s) ||
    !Array.isArray(route) ||
    !isValidDate(started_at)
  ) {
    invalid();
  }

  const parsedRoute = route.map((point) => {
    if (!isRecord(point)) invalid();
    const { lat, lon } = point;
    if (
      typeof lat !== 'number' ||
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      typeof lon !== 'number' ||
      !Number.isFinite(lon) ||
      lon < -180 ||
      lon > 180
    ) {
      invalid();
    }
    return { lat, lon };
  });

  return {
    type,
    distance_m,
    duration_s,
    route: parsedRoute,
    started_at,
  };
}

function parseLastError(
  value: unknown,
): QueuedActivity['lastError'] {
  if (value === null) return null;
  if (!isRecord(value)) invalid();

  const { category, message } = value;
  if (
    !isErrorCategory(category) ||
    typeof message !== 'string' ||
    message.trim().length === 0
  ) {
    invalid();
  }
  return { category, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isUploadStatus(value: unknown): value is UploadStatus {
  return (
    typeof value === 'string' &&
    (UPLOAD_STATUSES as readonly string[]).includes(value)
  );
}

function isErrorCategory(value: unknown): value is UploadErrorCategory {
  return (
    typeof value === 'string' &&
    (ERROR_CATEGORIES as readonly string[]).includes(value)
  );
}

function invalid(): never {
  throw new Error('Invalid queued activity');
}
