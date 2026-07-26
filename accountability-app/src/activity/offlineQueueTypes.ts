import * as Crypto from 'expo-crypto';
import type { NewActivity } from './api';

export const UPLOAD_STATUSES = [
  'saved',
  'uploading',
  'waiting_network',
  'needs_sign_in',
  'needs_attention',
] as const;

export type UploadStatus = (typeof UPLOAD_STATUSES)[number];

export const UPLOAD_ERROR_CATEGORIES = [
  'network',
  'auth',
  'server',
  'validation',
  'storage',
] as const;

export type UploadErrorCategory = (typeof UPLOAD_ERROR_CATEGORIES)[number];

/** PostgreSQL `integer` upper bound used by activities.duration_s. */
export const MAX_ACTIVITY_DURATION_S = 2_147_483_647;
/** Largest distance that remains an exact integer in a JSON/JavaScript number. */
export const MAX_ACTIVITY_DISTANCE_M = Number.MAX_SAFE_INTEGER;
/** More than 27 hours of one-point-per-second GPS samples. */
export const MAX_ROUTE_POINTS = 100_000;
/** Keeps a single persisted failure useful without allowing unbounded messages. */
export const MAX_LAST_ERROR_MESSAGE_LENGTH = 4_096;

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
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const OWNER_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function createActivityId(
  uuidProvider: () => unknown = Crypto.randomUUID,
): string {
  const id = uuidProvider();
  if (typeof id !== 'string' || !UUID_V4.test(id)) {
    throw new Error('Invalid activity UUID');
  }
  return id;
}

/**
 * Validates the in-memory schema. The queue storage layer must enforce its
 * serialized byte limit before calling this parser.
 */
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
    !OWNER_UUID.test(ownerId) ||
    !isValidDate(createdAt) ||
    !isUploadStatus(status) ||
    !isNonNegativeSafeInteger(attemptCount) ||
    !isNonNegativeSafeInteger(nextAttemptAt)
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
    !isBoundedNonNegativeSafeInteger(
      distance_m,
      MAX_ACTIVITY_DISTANCE_M,
    ) ||
    !isBoundedNonNegativeSafeInteger(
      duration_s,
      MAX_ACTIVITY_DURATION_S,
    ) ||
    !Array.isArray(route) ||
    route.length > MAX_ROUTE_POINTS ||
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
    message.trim().length === 0 ||
    message.length > MAX_LAST_ERROR_MESSAGE_LENGTH
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

function isNonNegativeSafeInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isBoundedNonNegativeSafeInteger(
  value: unknown,
  maximum: number,
): value is number {
  return isNonNegativeSafeInteger(value) && value <= maximum;
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
    (UPLOAD_ERROR_CATEGORIES as readonly string[]).includes(value)
  );
}

function invalid(): never {
  throw new Error('Invalid queued activity');
}
