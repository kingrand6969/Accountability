import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as Crypto from 'expo-crypto';
import {
  createActivityId,
  MAX_ACTIVITY_DISTANCE_M,
  MAX_ACTIVITY_DURATION_S,
  MAX_LAST_ERROR_MESSAGE_LENGTH,
  MAX_ROUTE_POINTS,
  parseQueuedActivity,
  type QueuedActivity,
} from './offlineQueueTypes';

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(),
}));

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const mockedRandomUUID = Crypto.randomUUID as jest.MockedFunction<
  typeof Crypto.randomUUID
>;

function validEntry(): QueuedActivity {
  return {
    schema: 1,
    id: '12345678-1234-4123-8123-123456789abc',
    ownerId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    activity: {
      type: 'run',
      distance_m: 1501,
      duration_s: 420,
      route: [
        { lat: -31.9523, lon: 115.8613 },
        { lat: -31.953, lon: 115.862 },
      ],
      started_at: '2026-07-26T01:02:03.000Z',
    },
    createdAt: '2026-07-26T01:02:04.000Z',
    status: 'waiting_network',
    attemptCount: 2,
    nextAttemptAt: 1_753_491_724_000,
    lastError: { category: 'network', message: 'Offline' },
  };
}

describe('createActivityId', () => {
  beforeEach(() => {
    mockedRandomUUID.mockReset();
  });

  it('uses the platform CSPRNG by default', () => {
    const secureId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    mockedRandomUUID.mockReturnValue(secureId);

    expect(createActivityId()).toBe(secureId);
    expect(mockedRandomUUID).toHaveBeenCalledTimes(1);
  });

  it('accepts an injected deterministic UUID provider', () => {
    const deterministicId = '12345678-1234-4123-8123-123456789abc';

    expect(createActivityId(() => deterministicId)).toBe(deterministicId);
    expect(deterministicId).toMatch(UUID_V4);
  });

  it('validates UUID output from the platform provider', () => {
    mockedRandomUUID.mockReturnValue('not-a-uuid');

    expect(() => createActivityId()).toThrow('Invalid activity UUID');
    expect(mockedRandomUUID).toHaveBeenCalledTimes(1);
  });

  it.each([
    'not-a-uuid',
    '12345678-1234-1123-8123-123456789abc',
    '12345678-1234-4123-7123-123456789abc',
    '12345678-1234-4123-8123-123456789ABC',
    '',
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
    1,
  ])(
    'throws when a UUID provider returns %p',
    (value) => {
      expect(() =>
        createActivityId(() => value as never),
      ).toThrow('Invalid activity UUID');
    },
  );
});

describe('parseQueuedActivity', () => {
  it('returns a fully validated queue entry and preserves its route payload', () => {
    const entry = validEntry();

    expect(parseQueuedActivity(entry)).toEqual(entry);
  });

  it('rejects a queue entry with no owner', () => {
    expect(() =>
      parseQueuedActivity({ ...validEntry(), ownerId: '' }),
    ).toThrow('Invalid queued activity');
  });

  it('rejects a queue entry with a whitespace-only owner', () => {
    expect(() =>
      parseQueuedActivity({ ...validEntry(), ownerId: ' \t\n ' }),
    ).toThrow('Invalid queued activity');
  });

  it.each([
    '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    '6ba7b810-9dad-51d1-80b4-00c04fd430c8',
    '018f78d2-a4d7-7b10-8a9b-123456789abc',
  ])('accepts canonical Supabase-compatible owner UUID %s', (ownerId) => {
    expect(parseQueuedActivity({ ...validEntry(), ownerId }).ownerId).toBe(
      ownerId,
    );
  });

  it.each([
    'owner-123',
    ' AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE ',
    'aaaaaaaa-bbbb-4ccc-7ddd-eeeeeeeeeeee-extra',
  ])('rejects non-canonical owner ID %s', (ownerId) => {
    expect(() =>
      parseQueuedActivity({ ...validEntry(), ownerId }),
    ).toThrow('Invalid queued activity');
  });

  it('accepts null as an explicit no-error state', () => {
    expect(
      parseQueuedActivity({ ...validEntry(), lastError: null }),
    ).toMatchObject({ lastError: null });
  });

  it.each([
    ['schema', { schema: 2 }],
    ['UUID', { id: 'not-a-uuid' }],
    ['created date', { createdAt: 'yesterday' }],
    ['non-ISO created date', { createdAt: '1' }],
    ['status', { status: 'pending' }],
    ['attempt count', { attemptCount: -1 }],
    ['fractional attempt count', { attemptCount: 1.5 }],
    ['unsafe attempt count', { attemptCount: Number.MAX_SAFE_INTEGER + 1 }],
    ['next attempt', { nextAttemptAt: Number.NaN }],
    ['negative next attempt', { nextAttemptAt: -1 }],
    ['fractional next attempt', { nextAttemptAt: 1.5 }],
    [
      'unsafe next attempt',
      { nextAttemptAt: Number.MAX_SAFE_INTEGER + 1 },
    ],
  ])('rejects an invalid %s', (_label, patch) => {
    expect(() => parseQueuedActivity({ ...validEntry(), ...patch })).toThrow(
      'Invalid queued activity',
    );
  });

  it.each([
    ['unknown category', { category: 'timeout', message: 'No response' }],
    ['missing message', { category: 'network' }],
    ['blank message', { category: 'network', message: '' }],
  ])('rejects lastError with an %s', (_label, lastError) => {
    expect(() =>
      parseQueuedActivity({ ...validEntry(), lastError }),
    ).toThrow('Invalid queued activity');
  });

  it.each([
    ['unknown type', { type: 'swim' }],
    ['negative distance', { distance_m: -1 }],
    ['fractional distance', { distance_m: 1.5 }],
    ['excessive distance', { distance_m: MAX_ACTIVITY_DISTANCE_M + 1 }],
    ['fractional duration', { duration_s: 1.5 }],
    ['excessive duration', { duration_s: MAX_ACTIVITY_DURATION_S + 1 }],
    ['non-finite duration', { duration_s: Number.POSITIVE_INFINITY }],
    ['invalid start date', { started_at: 'soon' }],
    ['non-array route', { route: {} }],
    ['invalid route point', { route: [{ lat: Number.NaN, lon: 115 }] }],
  ])('rejects activity with an %s', (_label, activityPatch) => {
    expect(() =>
      parseQueuedActivity({
        ...validEntry(),
        activity: { ...validEntry().activity, ...activityPatch },
      }),
    ).toThrow('Invalid queued activity');
  });

  it('caps route point count for durable queue entries', () => {
    const route = Array.from(
      { length: MAX_ROUTE_POINTS + 1 },
      () => ({ lat: 0, lon: 0 }),
    );

    expect(() =>
      parseQueuedActivity({
        ...validEntry(),
        activity: { ...validEntry().activity, route },
      }),
    ).toThrow('Invalid queued activity');
  });

  it('caps persisted error messages', () => {
    expect(() =>
      parseQueuedActivity({
        ...validEntry(),
        lastError: {
          category: 'network',
          message: 'x'.repeat(MAX_LAST_ERROR_MESSAGE_LENGTH + 1),
        },
      }),
    ).toThrow('Invalid queued activity');
  });

  it.each([
    ['latitude above 90', { lat: 90.0001, lon: 0 }],
    ['latitude below -90', { lat: -90.0001, lon: 0 }],
    ['longitude above 180', { lat: 0, lon: 180.0001 }],
    ['longitude below -180', { lat: 0, lon: -180.0001 }],
    ['non-finite latitude', { lat: Number.POSITIVE_INFINITY, lon: 0 }],
    ['non-finite longitude', { lat: 0, lon: Number.NEGATIVE_INFINITY }],
  ])('rejects a route point with %s', (_label, point) => {
    expect(() =>
      parseQueuedActivity({
        ...validEntry(),
        activity: { ...validEntry().activity, route: [point] },
      }),
    ).toThrow('Invalid queued activity');
  });

  it('accepts route coordinates at the geographic boundaries', () => {
    const route = [
      { lat: 90, lon: 180 },
      { lat: -90, lon: -180 },
    ];

    expect(
      parseQueuedActivity({
        ...validEntry(),
        activity: { ...validEntry().activity, route },
      }).activity.route,
    ).toEqual(route);
  });

  it('strips unknown top-level and nested properties from parsed data', () => {
    const parsed = parseQueuedActivity({
      ...validEntry(),
      unexpectedTopLevel: 'discard me',
      activity: {
        ...validEntry().activity,
        unexpectedActivityField: 'discard me',
        route: [
          {
            lat: -31.9523,
            lon: 115.8613,
            unexpectedPointField: 'discard me',
          },
        ],
      },
      lastError: {
        category: 'network',
        message: 'Offline',
        unexpectedErrorField: 'discard me',
      },
    });

    expect(parsed).not.toHaveProperty('unexpectedTopLevel');
    expect(parsed.activity).not.toHaveProperty('unexpectedActivityField');
    expect(parsed.activity.route[0]).toEqual({
      lat: -31.9523,
      lon: 115.8613,
    });
    expect(parsed.lastError).toEqual({
      category: 'network',
      message: 'Offline',
    });
  });

  it('returns a deep non-aliased copy of mutable input data', () => {
    const input = {
      ...validEntry(),
      activity: {
        ...validEntry().activity,
        route: [{ lat: -31.9523, lon: 115.8613 }],
      },
      lastError: { category: 'network', message: 'Offline' },
    };

    const parsed = parseQueuedActivity(input);

    expect(parsed).not.toBe(input);
    expect(parsed.activity).not.toBe(input.activity);
    expect(parsed.activity.route).not.toBe(input.activity.route);
    expect(parsed.activity.route[0]).not.toBe(input.activity.route[0]);
    expect(parsed.lastError).not.toBe(input.lastError);

    input.activity.route[0].lat = 0;
    input.lastError.message = 'Changed';
    expect(parsed.activity.route[0].lat).toBe(-31.9523);
    expect(parsed.lastError?.message).toBe('Offline');
  });

  it('accepts every supported status and error category', () => {
    const statuses = [
      'saved',
      'uploading',
      'waiting_network',
      'needs_sign_in',
      'needs_attention',
    ] as const;
    const categories = [
      'network',
      'auth',
      'server',
      'validation',
      'storage',
    ] as const;

    for (const status of statuses) {
      for (const category of categories) {
        expect(
          parseQueuedActivity({
            ...validEntry(),
            status,
            lastError: { category, message: 'Upload failed' },
          }),
        ).toMatchObject({ status, lastError: { category } });
      }
    }
  });
});
