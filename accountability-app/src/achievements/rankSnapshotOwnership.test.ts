/* eslint-disable @typescript-eslint/no-require-imports -- API loads after Supabase mock */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockGetUser = jest.fn<() => Promise<any>>();
const mockFrom = jest.fn<(...args: unknown[]) => any>();
const mockRpc = jest.fn<(...args: unknown[]) => Promise<any>>();

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));
jest.mock('../home/api', () => ({ getHomeStats: jest.fn() }));
jest.mock('../profiles/referrals', () => ({ myReferralCount: jest.fn() }));
jest.mock('../feed/api', () => ({ createPost: jest.fn() }));

const { snapshotRankToCardForOwner } = require('./api') as typeof import('./api');

function authUser(id: string | null) {
  return { data: { user: id ? { id } : null } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('rank snapshot ownership', () => {
  test('account switch after rank computation but before snapshot performs no profile query', async () => {
    mockGetUser.mockResolvedValue(authUser('owner-b'));

    await expect(
      snapshotRankToCardForOwner('owner-a', 'Elite', 1, [{ id: 'streak', tier: 0 }]),
    ).rejects.toThrow('Account changed. Rank was not saved.');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test('account switch while the atomic RPC is pending cannot show stale success', async () => {
    const pendingWrite = deferred<{ data: Record<string, unknown>; error: null }>();
    mockGetUser
      .mockResolvedValueOnce(authUser('owner-a'))
      .mockResolvedValueOnce(authUser('owner-b'));
    mockRpc.mockReturnValue(pendingWrite.promise);

    const saving = snapshotRankToCardForOwner('owner-a', 'Elite', 1, [{ id: 'streak', tier: 0 }]);
    await Promise.resolve();
    pendingWrite.resolve({ data: { palette_key: 'power_violet' }, error: null });
    await expect(saving).rejects.toThrow('Account changed. Rank was not saved.');
    expect(mockRpc).toHaveBeenCalledWith('patch_my_buddy_card', {
      p_expected_owner: 'owner-a',
      p_patch: {
        rank_name: 'Elite',
        medals: 1,
        medals_list: [{ id: 'streak', tier: 0 }],
      },
      p_patch_kind: 'rank',
    });
  });

  test('RPC/RLS rejection fails closed without a fallback whole-JSON write', async () => {
    mockGetUser
      .mockResolvedValue(authUser('owner-a'));
    mockRpc.mockResolvedValue({ data: null, error: { message: 'owner mismatch' } });

    await expect(
      snapshotRankToCardForOwner('owner-a', 'Elite', 1, [{ id: 'streak', tier: 0 }]),
    ).rejects.toThrow('owner mismatch');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
