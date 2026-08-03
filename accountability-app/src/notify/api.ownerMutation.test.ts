/* eslint-disable @typescript-eslint/no-require-imports -- API loads after Supabase mock */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockFrom = jest.fn();
jest.mock('../lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));
jest.mock('../profiles/publicProfiles', () => ({ getPublicProfiles: jest.fn() }));

const { markAllRead } = require('./api') as typeof import('./api');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('notification mutation ownership', () => {
  test.each([
    ['A-to-B', ['owner-a', 'owner-b']],
    ['A-to-B-to-A', ['owner-a', 'owner-b', 'owner-a']],
  ])('keeps mark-all-read constrained to captured owner during %s', async (_label, owners) => {
    const pending = deferred<{ error: null }>();
    const filters: [string, unknown][] = [];
    const builder = {
      update: jest.fn(() => builder),
      eq: jest.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return builder;
      }),
      is: jest.fn(() => pending.promise),
    };
    mockFrom.mockReturnValue(builder);

    let currentOwner = owners[0];
    const mutation = markAllRead(currentOwner);
    for (const owner of owners.slice(1)) currentOwner = owner;
    pending.resolve({ error: null });
    await mutation;

    expect(mockFrom).toHaveBeenCalledWith('notifications');
    expect(filters).toContainEqual(['user_id', 'owner-a']);
    expect(filters).not.toContainEqual(['user_id', 'owner-b']);
    expect(builder.is).toHaveBeenCalledWith('read_at', null);
    expect(currentOwner).toBe(owners.at(-1));
  });
});
