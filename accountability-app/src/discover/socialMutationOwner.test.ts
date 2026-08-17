/* eslint-disable @typescript-eslint/no-require-imports -- APIs load after Supabase mock */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockGetUser = jest.fn<() => Promise<{ data: { user: { id: string } | null } }>>();
const mockFrom = jest.fn();
const mockRpc = jest.fn<(
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: null; error: Error | null }>>();
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (name: string, args: Record<string, unknown>) => mockRpc(name, args),
  },
}));
jest.mock('../profiles/publicProfiles', () => ({ getPublicProfiles: jest.fn() }));

const { sendRequest } = require('../buddy/api') as typeof import('../buddy/api');
const { joinGroup } = require('../groups/api') as typeof import('../groups/api');
const { followPage } = require('../pages/api') as typeof import('../pages/api');
const { joinChallenge } = require('../compete/api') as typeof import('../compete/api');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

beforeEach(() => { jest.clearAllMocks(); });

const mutationCases: [string, (owner: string) => Promise<void>, string][] = [
  ['buddy request', (owner: string) => sendRequest('target', owner), 'buddy_requests'],
  ['group join', (owner: string) => joinGroup('target', owner), 'group_members'],
  ['page follow', (owner: string) => followPage('target', owner), 'page_follows'],
  ['challenge join', (owner: string) => joinChallenge('target', owner), 'challenge_participants'],
];

describe.each(mutationCases)('%s mutation ownership', (_label, mutate, table) => {
  test('does not write when auth changes while identity lookup is pending', async () => {
    const pending = deferred<{ data: { user: { id: string } } }>();
    mockGetUser.mockReturnValueOnce(pending.promise);
    const mutation = mutate('owner-a');
    pending.resolve({ data: { user: { id: 'owner-b' } } });
    await expect(mutation).rejects.toThrow('Account changed');
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test('writes using the validated initiating owner', async () => {
    const inserts: unknown[] = [];
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'owner-a' } } });
    if (table === 'challenge_participants') {
      mockRpc.mockResolvedValueOnce({ data: null, error: null });
      await expect(mutate('owner-a')).resolves.toBeUndefined();
      expect(mockRpc).toHaveBeenCalledWith('join_challenge', expect.objectContaining({
        p_expected_owner: 'owner-a',
      }));
      expect(mockFrom).not.toHaveBeenCalled();
      return;
    }
    mockFrom.mockReturnValueOnce({
      insert: jest.fn((value: unknown) => {
        inserts.push(value);
        return Promise.resolve({ error: null });
      }),
    });
    await expect(mutate('owner-a')).resolves.toBeUndefined();
    expect(mockFrom).toHaveBeenCalledWith(table);
    expect(JSON.stringify(inserts)).toContain('owner-a');
  });
});
