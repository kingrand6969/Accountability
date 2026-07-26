import { describe, expect, it } from '@jest/globals';
import {
  createActivityId,
  parseQueuedActivity,
  type QueuedActivity,
} from './offlineQueueTypes';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function validEntry(): QueuedActivity {
  return {
    schema: 1,
    id: '12345678-1234-4123-8123-123456789abc',
    ownerId: 'owner-123',
    activity: {
      type: 'run',
      distance_m: 1500.5,
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
  it('creates RFC 4122 version-4 IDs with the correct variant', () => {
    expect(createActivityId(() => 0.5)).toMatch(UUID_V4);
  });

  it('creates distinct IDs from distinct deterministic random streams', () => {
    let first = 0;
    let second = 0;

    const firstId = createActivityId(() => ((first++ * 17 + 3) % 256) / 256);
    const secondId = createActivityId(
      () => ((second++ * 29 + 11) % 256) / 256,
    );

    expect(firstId).toMatch(UUID_V4);
    expect(secondId).toMatch(UUID_V4);
    expect(firstId).not.toBe(secondId);
  });

  it.each([1, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'defensively handles a random value of %p',
    (value) => {
      expect(createActivityId(() => value)).toMatch(UUID_V4);
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
    ['next attempt', { nextAttemptAt: Number.NaN }],
    ['negative next attempt', { nextAttemptAt: -1 }],
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
