/* eslint-disable @typescript-eslint/no-require-imports -- module loads after mutable Supabase mocks */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

let mockOwnerId: string | null = 'owner-a';
const mockGetUser = jest.fn(async () => ({ data: { user: mockOwnerId ? { id: mockOwnerId } : null }, error: null }));
const mockActivities = jest.fn<() => Promise<{ data: unknown[]; error: unknown }>>();
const mockItems = jest.fn<() => Promise<{ data: unknown[]; error: unknown }>>();

function mockQueryFor(table: string) {
  const result = table === 'activities' ? mockActivities() : mockItems();
  const chain = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    limit: () => chain,
    then: result.then.bind(result),
  };
  return chain;
}

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: (table: string) => mockQueryFor(table),
  },
}));

const { getInsights } = require('./api') as typeof import('./api');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

describe('owner-bound insights', () => {
  beforeEach(() => {
    mockOwnerId = 'owner-a';
    mockGetUser.mockClear();
    mockActivities.mockReset().mockResolvedValue({ data: [], error: null });
    mockItems.mockReset().mockResolvedValue({ data: [], error: null });
  });

  test('re-authenticates after deferred queries and rejects account-switched results', async () => {
    const activities = deferred<{ data: unknown[]; error: unknown }>();
    const items = deferred<{ data: unknown[]; error: unknown }>();
    mockActivities.mockReturnValueOnce(activities.promise);
    mockItems.mockReturnValueOnce(items.promise);

    const pending = getInsights('week', 'owner-a');
    await Promise.resolve();
    mockOwnerId = 'owner-b';
    activities.resolve({ data: [{ distance_m: 1000, duration_s: 300, started_at: new Date().toISOString() }], error: null });
    items.resolve({ data: [], error: null });

    await expect(pending).rejects.toThrow('Account changed.');
    expect(mockGetUser).toHaveBeenCalledTimes(2);
  });

  test('gives account change precedence over a completed query error', async () => {
    const activities = deferred<{ data: unknown[]; error: unknown }>();
    const items = deferred<{ data: unknown[]; error: unknown }>();
    mockActivities.mockReturnValueOnce(activities.promise);
    mockItems.mockReturnValueOnce(items.promise);
    const pending = getInsights('week', 'owner-a');
    await Promise.resolve();
    mockOwnerId = 'owner-b';
    activities.resolve({ data: [], error: new Error('query failed') });
    items.resolve({ data: [], error: null });
    await expect(pending).rejects.toThrow('Account changed.');
  });

  test('preserves the existing optional-owner caller behavior', async () => {
    await expect(getInsights('week')).resolves.toMatchObject({ period: 'week', workouts: 0 });
  });
});
