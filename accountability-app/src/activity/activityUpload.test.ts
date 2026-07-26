import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';
import { saveActivity } from './api';
import {
  ActivityUploadError,
  uploadQueuedActivity,
} from './activityUpload';
import type { QueuedActivity } from './offlineQueueTypes';

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(),
}));

const OWNER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_OWNER_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const ACTIVITY_ID = '12345678-1234-4123-8123-123456789abc';

type AuthResult = {
  data: { user: { id: string } | null };
  error: unknown;
};

const mockedSupabase = supabase as unknown as {
  auth: { getUser: jest.Mock<() => Promise<AuthResult>> };
  from: jest.Mock;
};
const mockedRandomUUID = Crypto.randomUUID as jest.MockedFunction<
  typeof Crypto.randomUUID
>;

type DatabaseResult = {
  data: unknown;
  error: unknown;
  status: number;
};

type DatabaseResultInput = Omit<DatabaseResult, 'status'> & {
  status?: number;
};

function queuedActivity(
  patch: Partial<QueuedActivity['activity']> = {},
): QueuedActivity {
  return {
    schema: 1,
    id: ACTIVITY_ID,
    ownerId: OWNER_ID,
    activity: {
      type: 'run',
      distance_m: 1500.6,
      duration_s: 420,
      route: [
        { lat: -31.9523, lon: 115.8613 },
        { lat: -31.953, lon: 115.862 },
      ],
      started_at: '2026-07-26T01:02:03.000Z',
      ...patch,
    },
    createdAt: '2026-07-26T01:02:04.000Z',
    status: 'waiting_network',
    attemptCount: 1,
    nextAttemptAt: 0,
    lastError: null,
  };
}

function storedActivity(
  patch: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: ACTIVITY_ID,
    user_id: OWNER_ID,
    type: 'run',
    distance_m: 1501,
    duration_s: 420,
    route: [
      { lat: -31.9523, lon: 115.8613 },
      { lat: -31.953, lon: 115.862 },
    ],
    started_at: '2026-07-26T01:02:03+00:00',
    ...patch,
  };
}

function queryResult(result: DatabaseResultInput) {
  const response: DatabaseResult = {
    ...result,
    status: result.status ?? (result.error ? 400 : 200),
  };
  const maybeSingle = jest.fn(async () => response);
  const eq = jest.fn(() => ({ maybeSingle }));
  const select = jest.fn(() => ({ eq }));
  return { builder: { select }, select, eq, maybeSingle };
}

function insertResult(result: DatabaseResultInput) {
  const response: DatabaseResult = {
    ...result,
    status: result.status ?? (result.error ? 400 : 201),
  };
  const single = jest.fn(async () => response);
  const select = jest.fn(() => ({ single }));
  const insert = jest.fn(() => ({ select }));
  return { builder: { insert }, insert, select, single };
}

function arrangeDatabase(
  ...builders: Array<Record<string, unknown>>
): void {
  mockedSupabase.from.mockImplementation(() => builders.shift());
}

function expectUploadError(
  category: ActivityUploadError['category'],
  transient: boolean,
  code?: string,
) {
  return expect.objectContaining({
    name: 'ActivityUploadError',
    category,
    transient,
    ...(code === undefined ? {} : { code }),
  });
}

describe('uploadQueuedActivity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRandomUUID.mockReturnValue(ACTIVITY_ID);
    mockedSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: OWNER_ID } },
      error: null,
    });
  });

  it('binds the authenticated owner and client activity ID on insert', async () => {
    const missing = queryResult({ data: null, error: null });
    const inserted = insertResult({
      data: storedActivity(),
      error: null,
    });
    arrangeDatabase(missing.builder, inserted.builder);

    await expect(uploadQueuedActivity(queuedActivity())).resolves.toBe(
      ACTIVITY_ID,
    );

    expect(inserted.insert).toHaveBeenCalledWith({
      id: ACTIVITY_ID,
      user_id: OWNER_ID,
      type: 'run',
      distance_m: 1501,
      duration_s: 420,
      route: [
        { lat: -31.9523, lon: 115.8613 },
        { lat: -31.953, lon: 115.862 },
      ],
      started_at: '2026-07-26T01:02:03.000Z',
    });
  });

  it('never queries or inserts an activity owned by another account', async () => {
    mockedSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: OTHER_OWNER_ID } },
      error: null,
    });

    await expect(uploadQueuedActivity(queuedActivity())).rejects.toEqual(
      expectUploadError('auth', false, 'owner_mismatch'),
    );
    expect(mockedSupabase.from).not.toHaveBeenCalled();
  });

  it('classifies a missing session as a non-transient sign-in error', async () => {
    mockedSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await expect(uploadQueuedActivity(queuedActivity())).rejects.toEqual(
      expectUploadError('auth', false, 'needs_sign_in'),
    );
    expect(mockedSupabase.from).not.toHaveBeenCalled();
  });

  it('preserves a network failure from the authenticated user lookup', async () => {
    const cause = Object.assign(new TypeError('Network request failed'), {
      code: 'NETWORK_ERROR',
    });
    mockedSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: cause,
    });

    await expect(uploadQueuedActivity(queuedActivity())).rejects.toEqual(
      expect.objectContaining({
        category: 'network',
        transient: true,
        cause,
        code: 'NETWORK_ERROR',
      }),
    );
    expect(mockedSupabase.from).not.toHaveBeenCalled();
  });

  it('classifies a non-network user lookup failure as authentication', async () => {
    const cause = Object.assign(new Error('Invalid refresh token'), {
      code: 'refresh_token_not_found',
      status: 400,
    });
    mockedSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: cause,
    });

    await expect(uploadQueuedActivity(queuedActivity())).rejects.toEqual(
      expect.objectContaining({
        category: 'auth',
        transient: false,
        cause,
        code: 'refresh_token_not_found',
      }),
    );
  });

  it.each([
    [
      'rate-limit status',
      { status: 429, code: 'over_request_rate_limit', message: 'Too many requests' },
      'over_request_rate_limit',
    ],
    [
      'service status',
      { status: 503, code: 'unexpected_failure', message: 'Unavailable' },
      'unexpected_failure',
    ],
    [
      'rate-limit code',
      { code: 'over_request_rate_limit', message: 'Request rejected' },
      'over_request_rate_limit',
    ],
    [
      'service-unavailable code',
      { code: 'service_unavailable', message: 'Request rejected' },
      'service_unavailable',
    ],
    [
      'HTTP code',
      { code: '503', message: 'Service unavailable' },
      '503',
    ],
  ])(
    'classifies a getUser %s as a transient server failure',
    async (_label, cause, code) => {
      mockedSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: cause,
      });

      await expect(uploadQueuedActivity(queuedActivity())).rejects.toEqual(
        expect.objectContaining({
          category: 'server',
          transient: true,
          cause,
          code,
        }),
      );
    },
  );

  it.each(['session_expired', 'invalid_token', 'bad_jwt'])(
    'keeps getUser code %s as a non-transient authentication failure',
    async (code) => {
      const cause = { code, status: 401, message: 'Session is invalid' };
      mockedSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: cause,
      });

      await expect(uploadQueuedActivity(queuedActivity())).rejects.toEqual(
        expect.objectContaining({
          category: 'auth',
          transient: false,
          cause,
          code,
        }),
      );
    },
  );

  it('returns success from a matching preflight row without retry traffic', async () => {
    const existing = queryResult({
      data: storedActivity(),
      error: null,
    });
    arrangeDatabase(existing.builder);

    await expect(uploadQueuedActivity(queuedActivity())).resolves.toBe(
      ACTIVITY_ID,
    );
    expect(mockedSupabase.from).toHaveBeenCalledTimes(1);
  });

  it('treats a PGRST116 no-row result as definitively absent and inserts', async () => {
    const missing = queryResult({
      data: null,
      status: 406,
      error: {
        code: 'PGRST116',
        message: 'JSON object requested, multiple (or no) rows returned',
      },
    });
    const inserted = insertResult({
      data: storedActivity(),
      error: null,
    });
    arrangeDatabase(missing.builder, inserted.builder);

    await expect(uploadQueuedActivity(queuedActivity())).resolves.toBe(
      ACTIVITY_ID,
    );
    expect(inserted.insert).toHaveBeenCalledTimes(1);
  });

  it('confirms a matching row after a duplicate-key response', async () => {
    const missing = queryResult({ data: null, error: null });
    const duplicate = insertResult({
      data: null,
      status: 409,
      error: { code: '23505', message: 'duplicate key value' },
    });
    const confirmation = queryResult({
      data: storedActivity(),
      error: null,
    });
    arrangeDatabase(missing.builder, duplicate.builder, confirmation.builder);

    await expect(uploadQueuedActivity(queuedActivity())).resolves.toBe(
      ACTIVITY_ID,
    );
  });

  it('rejects a duplicate row whose immutable activity payload differs', async () => {
    const missing = queryResult({ data: null, error: null });
    const duplicate = insertResult({
      data: null,
      status: 409,
      error: { code: '23505', message: 'duplicate key value' },
    });
    const confirmation = queryResult({
      data: storedActivity({ distance_m: 9999 }),
      error: null,
    });
    arrangeDatabase(missing.builder, duplicate.builder, confirmation.builder);

    await expect(uploadQueuedActivity(queuedActivity())).rejects.toEqual(
      expectUploadError('validation', false, 'activity_mismatch'),
    );
  });

  it('confirms a committed insert when its response is lost', async () => {
    const missing = queryResult({ data: null, error: null });
    const responseLost = insertResult({
      data: null,
      status: 0,
      error: new TypeError('Failed to fetch'),
    });
    const confirmation = queryResult({
      data: storedActivity(),
      error: null,
    });
    arrangeDatabase(
      missing.builder,
      responseLost.builder,
      confirmation.builder,
    );

    await expect(uploadQueuedActivity(queuedActivity())).resolves.toBe(
      ACTIVITY_ID,
    );
  });

  it('keeps an ambiguous network insert failure transient when unconfirmed', async () => {
    const missing = queryResult({ data: null, error: null });
    const responseLost = insertResult({
      data: null,
      status: 0,
      error: Object.assign(new Error('Request timed out'), {
        code: 'ETIMEDOUT',
      }),
    });
    const unavailable = queryResult({
      data: null,
      status: 503,
      error: { code: 'PGRST002', message: 'Service unavailable' },
    });
    arrangeDatabase(
      missing.builder,
      responseLost.builder,
      unavailable.builder,
    );

    await expect(uploadQueuedActivity(queuedActivity())).rejects.toEqual(
      expectUploadError('network', true, 'ETIMEDOUT'),
    );
  });

  it('classifies an unconfirmed 5xx insert as a transient server failure', async () => {
    const missing = queryResult({ data: null, error: null });
    const failed = insertResult({
      data: null,
      status: 503,
      error: { code: 'PGRST002', message: 'Unavailable' },
    });
    const absent = queryResult({ data: null, error: null });
    arrangeDatabase(missing.builder, failed.builder, absent.builder);

    await expect(uploadQueuedActivity(queuedActivity())).rejects.toEqual(
      expectUploadError('server', true, 'PGRST002'),
    );
  });

  it('classifies a permanent database 4xx without confirmation traffic', async () => {
    const missing = queryResult({ data: null, error: null });
    const invalid = insertResult({
      data: null,
      status: 400,
      error: { code: '23514', message: 'check violation' },
    });
    arrangeDatabase(missing.builder, invalid.builder);

    await expect(uploadQueuedActivity(queuedActivity())).rejects.toEqual(
      expectUploadError('validation', false, '23514'),
    );
    expect(mockedSupabase.from).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['invalid JWT', 401, 'PGRST301'],
    ['missing bearer authentication', 401, 'PGRST302'],
    ['insufficient database privilege', 403, '42501'],
  ])(
    'classifies a response-level %s failure as non-transient auth',
    async (_label, status, code) => {
      const failed = queryResult({
        data: null,
        status,
        error: { code, message: 'Request not authorized' },
      });
      arrangeDatabase(failed.builder);

      await expect(uploadQueuedActivity(queuedActivity())).rejects.toEqual(
        expectUploadError('auth', false, code),
      );
      expect(mockedSupabase.from).toHaveBeenCalledTimes(1);
    },
  );

  it('classifies PGRST300 with its response-level 500 as transient server', async () => {
    const failed = queryResult({
      data: null,
      status: 500,
      error: { code: 'PGRST300', message: 'JWT secret unavailable' },
    });
    arrangeDatabase(failed.builder);

    await expect(uploadQueuedActivity(queuedActivity())).rejects.toEqual(
      expectUploadError('server', true, 'PGRST300'),
    );
  });

  it('uses response-level 401 for an unrecognized auth response body', async () => {
    const failed = queryResult({
      data: null,
      status: 401,
      error: { code: 'upstream_auth', message: 'Authorization failed' },
    });
    arrangeDatabase(failed.builder);

    await expect(uploadQueuedActivity(queuedActivity())).rejects.toEqual(
      expectUploadError('auth', false, 'upstream_auth'),
    );
  });

  it('classifies response-level 429 as transient server and confirms the insert', async () => {
    const missing = queryResult({ data: null, error: null });
    const limited = insertResult({
      data: null,
      status: 429,
      error: { code: '23514', message: 'Rate limited' },
    });
    const absent = queryResult({ data: null, error: null });
    arrangeDatabase(missing.builder, limited.builder, absent.builder);

    await expect(uploadQueuedActivity(queuedActivity())).rejects.toEqual(
      expectUploadError('server', true, '23514'),
    );
    expect(mockedSupabase.from).toHaveBeenCalledTimes(3);
  });

  it('does not confirm a synchronously thrown permanent insert failure', async () => {
    const missing = queryResult({ data: null, error: null });
    const invalid = {
      builder: {
        insert: jest.fn(() => {
          throw { status: 422, code: '22003', message: 'out of range' };
        }),
      },
    };
    arrangeDatabase(missing.builder, invalid.builder);

    await expect(uploadQueuedActivity(queuedActivity())).rejects.toEqual(
      expectUploadError('validation', false, '22003'),
    );
    expect(mockedSupabase.from).toHaveBeenCalledTimes(2);
  });

  it('classifies a preflight fetch failure as transient network', async () => {
    const failed = queryResult({
      data: null,
      error: new TypeError('Network request failed'),
    });
    arrangeDatabase(failed.builder);

    await expect(uploadQueuedActivity(queuedActivity())).rejects.toEqual(
      expectUploadError('network', true),
    );
  });

  it('matches rounded integer fields and canonical timestamps', async () => {
    const entry = queuedActivity({
      distance_m: 1500.49,
      started_at: '2026-07-26T01:02:03.000Z',
    });
    const existing = queryResult({
      data: storedActivity({
        distance_m: '1500',
        started_at: '2026-07-26T09:02:03.000+08:00',
      }),
      error: null,
    });
    arrangeDatabase(existing.builder);

    await expect(uploadQueuedActivity(entry)).resolves.toBe(ACTIVITY_ID);
  });

  it('does not coerce missing stored numeric fields into a matching zero', async () => {
    const entry = queuedActivity({ distance_m: 0 });
    const existing = queryResult({
      data: storedActivity({ distance_m: null }),
      error: null,
    });
    arrangeDatabase(existing.builder);

    await expect(uploadQueuedActivity(entry)).rejects.toEqual(
      expectUploadError('validation', false, 'activity_mismatch'),
    );
  });

  it('rejects a different stored route without exposing route data in the error', async () => {
    const existing = queryResult({
      data: storedActivity({ route: [{ lat: 0, lon: 0 }] }),
      error: null,
    });
    arrangeDatabase(existing.builder);

    const rejection = uploadQueuedActivity(queuedActivity());
    await expect(rejection).rejects.toEqual(
      expectUploadError('validation', false, 'activity_mismatch'),
    );
    await expect(rejection).rejects.not.toThrow(/31\.9523|115\.8613/);
  });

  it('rejects null stored route data instead of claiming idempotent success', async () => {
    const existing = queryResult({
      data: storedActivity({ route: null }),
      error: null,
    });
    arrangeDatabase(existing.builder);

    await expect(uploadQueuedActivity(queuedActivity())).rejects.toEqual(
      expectUploadError('validation', false, 'activity_mismatch'),
    );
  });

  it('rejects missing stored route data', async () => {
    const row = storedActivity();
    delete row.route;
    const existing = queryResult({ data: row, error: null });
    arrangeDatabase(existing.builder);

    await expect(uploadQueuedActivity(queuedActivity())).rejects.toEqual(
      expectUploadError('validation', false, 'activity_mismatch'),
    );
  });

  it('requires an inserted empty route to be confirmed as an empty route', async () => {
    const existing = queryResult({
      data: storedActivity({ route: null }),
      error: null,
    });
    arrangeDatabase(existing.builder);

    await expect(
      uploadQueuedActivity(queuedActivity({ route: [] })),
    ).rejects.toEqual(
      expectUploadError('validation', false, 'activity_mismatch'),
    );
  });

  it('rejects a stored route with the expected points in a different order', async () => {
    const existing = queryResult({
      data: storedActivity({
        route: [
          { lat: -31.953, lon: 115.862 },
          { lat: -31.9523, lon: 115.8613 },
        ],
      }),
      error: null,
    });
    arrangeDatabase(existing.builder);

    await expect(uploadQueuedActivity(queuedActivity())).rejects.toEqual(
      expectUploadError('validation', false, 'activity_mismatch'),
    );
  });

  it('rejects type-coerced route coordinates rather than treating them as exact', async () => {
    const existing = queryResult({
      data: storedActivity({
        route: [
          { lat: '-31.9523', lon: '115.8613' },
          { lat: '-31.953', lon: '115.862' },
        ],
      }),
      error: null,
    });
    arrangeDatabase(existing.builder);

    await expect(uploadQueuedActivity(queuedActivity())).rejects.toEqual(
      expectUploadError('validation', false, 'activity_mismatch'),
    );
  });

  it('rejects unexpected stored route-point fields', async () => {
    const existing = queryResult({
      data: storedActivity({
        route: [
          { lat: -31.9523, lon: 115.8613, altitude: 7 },
          { lat: -31.953, lon: 115.862 },
        ],
      }),
      error: null,
    });
    arrangeDatabase(existing.builder);

    await expect(uploadQueuedActivity(queuedActivity())).rejects.toEqual(
      expectUploadError('validation', false, 'activity_mismatch'),
    );
  });
});

describe('saveActivity compatibility wrapper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRandomUUID.mockReturnValue(ACTIVITY_ID);
    mockedSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: OWNER_ID } },
      error: null,
    });
  });

  it('uses a secure client ID and returns that ID through the queued uploader', async () => {
    const missing = queryResult({ data: null, error: null });
    const inserted = insertResult({
      data: storedActivity(),
      error: null,
    });
    arrangeDatabase(missing.builder, inserted.builder);

    await expect(
      saveActivity(queuedActivity().activity),
    ).resolves.toBe(ACTIVITY_ID);

    expect(mockedRandomUUID).toHaveBeenCalledTimes(1);
    expect(inserted.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: ACTIVITY_ID,
        user_id: OWNER_ID,
      }),
    );
  });

  it('rounds legacy fractional duration and distance before queuing', async () => {
    const missing = queryResult({ data: null, error: null });
    const inserted = insertResult({
      data: storedActivity({ duration_s: 421 }),
      error: null,
    });
    arrangeDatabase(missing.builder, inserted.builder);

    await expect(
      saveActivity({
        ...queuedActivity().activity,
        distance_m: 1500.6,
        duration_s: 420.6,
      }),
    ).resolves.toBe(ACTIVITY_ID);

    expect(inserted.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: ACTIVITY_ID,
        distance_m: 1501,
        duration_s: 421,
      }),
    );
  });
});
