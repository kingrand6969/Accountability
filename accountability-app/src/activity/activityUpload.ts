import { supabase } from '../lib/supabase';
import {
  parseQueuedActivity,
  type QueuedActivity,
  type UploadErrorCategory,
} from './offlineQueueTypes';

const ACTIVITY_COLUMNS =
  'id,user_id,type,distance_m,duration_s,route,started_at';

type StoredActivity = Record<string, unknown>;

type ExistingActivity =
  | { kind: 'absent' }
  | { kind: 'found'; row: StoredActivity };

export class ActivityUploadError extends Error {
  readonly category: UploadErrorCategory;
  readonly transient: boolean;
  readonly cause?: unknown;
  readonly code?: string;

  constructor(
    category: UploadErrorCategory,
    message: string,
    transient: boolean,
    cause?: unknown,
    code?: string,
  ) {
    super(message);
    this.name = 'ActivityUploadError';
    this.category = category;
    this.transient = transient;
    this.cause = cause;
    this.code = code;
    Object.setPrototypeOf(this, ActivityUploadError.prototype);
  }
}

export async function uploadQueuedActivity(
  unsafeEntry: QueuedActivity,
): Promise<string> {
  const entry = validateQueueEntry(unsafeEntry);
  const ownerId = await getAuthenticatedOwner();
  if (ownerId !== entry.ownerId) {
    throw new ActivityUploadError(
      'auth',
      'Sign in to the account that saved this activity.',
      false,
      undefined,
      'owner_mismatch',
    );
  }
  return uploadForAuthenticatedOwner(entry);
}

export async function uploadForAuthenticatedOwner(
  entry: QueuedActivity,
): Promise<string> {
  let preflight: ExistingActivity;
  try {
    preflight = await findExistingActivity(entry.id);
  } catch (cause) {
    throw classifyDatabaseError(cause);
  }

  if (preflight.kind === 'found') {
    confirmEquivalentActivity(preflight.row, entry);
    return entry.id;
  }

  const payload = activityInsertPayload(entry);
  let result: { data: unknown; error: unknown };
  try {
    result = await supabase
      .from('activities')
      .insert(payload)
      .select(ACTIVITY_COLUMNS)
      .single();
  } catch (cause) {
    const classified = classifyDatabaseError(cause);
    if (
      getErrorCode(cause) === '23505' ||
      classified.category === 'network' ||
      classified.category === 'server'
    ) {
      return confirmAmbiguousInsert(entry, cause);
    }
    throw classified;
  }

  if (result.error) {
    const classified = classifyDatabaseError(result.error);
    if (
      getErrorCode(result.error) === '23505' ||
      classified.category === 'network' ||
      classified.category === 'server'
    ) {
      return confirmAmbiguousInsert(entry, result.error);
    }
    throw classified;
  }

  if (!isRecord(result.data)) {
    return confirmAmbiguousInsert(
      entry,
      Object.assign(new Error('Insert response was unavailable'), {
        code: 'insert_unconfirmed',
      }),
    );
  }

  confirmEquivalentActivity(result.data, entry);
  return entry.id;
}

export async function getAuthenticatedOwner(): Promise<string> {
  let response: {
    data: { user: { id?: string } | null };
    error: unknown;
  };
  try {
    response = await supabase.auth.getUser();
  } catch (cause) {
    throw classifyAuthenticationError(cause);
  }

  if (response.error) {
    throw classifyAuthenticationError(response.error);
  }
  const ownerId = response.data.user?.id;
  if (!ownerId) {
    throw new ActivityUploadError(
      'auth',
      'Sign in to upload this activity.',
      false,
      undefined,
      'needs_sign_in',
    );
  }
  return ownerId;
}

function validateQueueEntry(entry: QueuedActivity): QueuedActivity {
  try {
    return parseQueuedActivity(entry);
  } catch (cause) {
    throw new ActivityUploadError(
      'validation',
      'The saved activity is invalid.',
      false,
      cause,
      'invalid_queue_entry',
    );
  }
}

function activityInsertPayload(entry: QueuedActivity) {
  return {
    id: entry.id,
    user_id: entry.ownerId,
    type: entry.activity.type,
    distance_m: Math.round(entry.activity.distance_m),
    duration_s: Math.round(entry.activity.duration_s),
    route: entry.activity.route,
    started_at: entry.activity.started_at,
  };
}

async function findExistingActivity(
  id: string,
): Promise<ExistingActivity> {
  const { data, error } = await supabase
    .from('activities')
    .select(ACTIVITY_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error && getErrorCode(error) !== 'PGRST116') throw error;
  if (data == null || getErrorCode(error) === 'PGRST116') {
    return { kind: 'absent' };
  }
  if (!isRecord(data)) {
    throw Object.assign(new Error('Invalid activity lookup response'), {
      code: 'invalid_lookup_response',
    });
  }
  return { kind: 'found', row: data };
}

async function confirmAmbiguousInsert(
  entry: QueuedActivity,
  originalCause: unknown,
): Promise<string> {
  const original =
    getErrorCode(originalCause) === '23505'
      ? new ActivityUploadError(
          'server',
          'Activity upload could not be confirmed.',
          true,
          originalCause,
          '23505',
        )
      : classifyDatabaseError(originalCause);

  try {
    const confirmation = await findExistingActivity(entry.id);
    if (confirmation.kind === 'found') {
      confirmEquivalentActivity(confirmation.row, entry);
      return entry.id;
    }
  } catch (confirmationCause) {
    if (
      confirmationCause instanceof ActivityUploadError &&
      confirmationCause.code === 'activity_mismatch'
    ) {
      throw confirmationCause;
    }
  }

  throw original;
}

function confirmEquivalentActivity(
  row: StoredActivity,
  entry: QueuedActivity,
): void {
  const expected = activityInsertPayload(entry);
  const startedAt = canonicalDate(row.started_at);
  const distance = databaseNumber(row.distance_m);
  const duration = databaseNumber(row.duration_s);
  const routeMatches =
    row.route == null || equivalentRoute(row.route, expected.route);

  if (
    row.id !== entry.id ||
    row.user_id !== entry.ownerId ||
    row.type !== expected.type ||
    distance !== expected.distance_m ||
    duration !== expected.duration_s ||
    startedAt !== canonicalDate(expected.started_at) ||
    !routeMatches
  ) {
    throw new ActivityUploadError(
      'validation',
      'A different activity already uses this upload ID.',
      false,
      undefined,
      'activity_mismatch',
    );
  }
}

function equivalentRoute(
  storedRoute: unknown,
  expectedRoute: QueuedActivity['activity']['route'],
): boolean {
  if (!Array.isArray(storedRoute) || storedRoute.length !== expectedRoute.length) {
    return false;
  }
  return storedRoute.every((value, index) => {
    if (!isRecord(value)) return false;
    return (
      databaseNumber(value.lat) === expectedRoute[index].lat &&
      databaseNumber(value.lon) === expectedRoute[index].lon
    );
  });
}

function databaseNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function canonicalDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : null;
}

function classifyAuthenticationError(cause: unknown): ActivityUploadError {
  if (isNetworkError(cause)) {
    return new ActivityUploadError(
      'network',
      'Unable to verify your account while offline.',
      true,
      cause,
      getErrorCode(cause),
    );
  }
  return new ActivityUploadError(
    'auth',
    'Sign in again to upload this activity.',
    false,
    cause,
    getErrorCode(cause),
  );
}

function classifyDatabaseError(cause: unknown): ActivityUploadError {
  if (cause instanceof ActivityUploadError) return cause;

  const code = getErrorCode(cause);
  const status = getErrorStatus(cause);
  if (isNetworkError(cause)) {
    return new ActivityUploadError(
      'network',
      'Activity upload is temporarily unavailable.',
      true,
      cause,
      code,
    );
  }
  if (status === 401 || status === 403) {
    return new ActivityUploadError(
      'auth',
      'Sign in again to upload this activity.',
      false,
      cause,
      code,
    );
  }
  if (
    (status !== undefined && status >= 500) ||
    code === 'PGRST000' ||
    code === 'PGRST001' ||
    code === 'PGRST002' ||
    code?.startsWith('08')
  ) {
    return new ActivityUploadError(
      'server',
      'Activity upload is temporarily unavailable.',
      true,
      cause,
      code,
    );
  }
  if (
    (status !== undefined && status >= 400 && status < 500) ||
    code?.startsWith('22') ||
    code?.startsWith('23')
  ) {
    return new ActivityUploadError(
      'validation',
      'Activity could not be uploaded.',
      false,
      cause,
      code,
    );
  }
  return new ActivityUploadError(
    'server',
    'Activity upload could not be confirmed.',
    true,
    cause,
    code,
  );
}

function isNetworkError(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const code = getErrorCode(value)?.toUpperCase();
  if (
    code &&
    [
      'NETWORK_ERROR',
      'ETIMEDOUT',
      'ECONNABORTED',
      'ECONNRESET',
      'ENETDOWN',
      'ENETUNREACH',
    ].includes(code)
  ) {
    return true;
  }
  if (value.name === 'AbortError' || value.name === 'TimeoutError') {
    return true;
  }
  return (
    typeof value.message === 'string' &&
    /\b(network|fetch|offline|timed?\s*out|timeout)\b/i.test(value.message)
  );
}

function getErrorCode(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return typeof value.code === 'string'
    ? value.code
    : typeof value.statusCode === 'string'
      ? value.statusCode
      : undefined;
}

function getErrorStatus(value: unknown): number | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.status === 'number') return value.status;
  if (typeof value.statusCode === 'number') return value.statusCode;
  if (
    typeof value.statusCode === 'string' &&
    /^\d{3}$/.test(value.statusCode)
  ) {
    return Number(value.statusCode);
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
