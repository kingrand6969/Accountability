/* eslint-disable @typescript-eslint/no-require-imports -- API loads after Supabase mock */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockGetUser = jest.fn<() => Promise<any>>();
const mockFrom = jest.fn<(...args: unknown[]) => any>();

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: (...args: unknown[]) => mockFrom(...args),
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
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('account switch while the fresh card read is pending never starts a write', async () => {
    const pendingRead = deferred<{ data: { buddy_card: Record<string, unknown> }; error: null }>();
    mockGetUser
      .mockResolvedValueOnce(authUser('owner-a'))
      .mockResolvedValueOnce(authUser('owner-b'));
    const read = {
      select: jest.fn(() => read),
      eq: jest.fn(() => read),
      maybeSingle: jest.fn(() => pendingRead.promise),
    };
    mockFrom.mockReturnValue(read);

    const saving = snapshotRankToCardForOwner('owner-a', 'Elite', 1, [{ id: 'streak', tier: 0 }]);
    pendingRead.resolve({ data: { buddy_card: { palette_key: 'power_violet' } }, error: null });
    await expect(saving).rejects.toThrow('Account changed. Rank was not saved.');
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(read.eq).toHaveBeenCalledWith('id', 'owner-a');
  });

  test('after validation the mutation remains scoped to owner A and stale success is rejected', async () => {
    mockGetUser
      .mockResolvedValueOnce(authUser('owner-a'))
      .mockResolvedValueOnce(authUser('owner-a'))
      .mockResolvedValueOnce(authUser('owner-b'));
    const read = {
      select: jest.fn(() => read),
      eq: jest.fn(() => read),
      maybeSingle: jest.fn(async () => ({
        data: { buddy_card: { palette_key: 'power_violet', private_future_key: true } },
        error: null,
      })),
    };
    const writes: unknown[] = [];
    const update = {
      update: jest.fn((value: unknown) => { writes.push(value); return update; }),
      eq: jest.fn(() => update),
      select: jest.fn(() => update),
      maybeSingle: jest.fn(async () => ({ data: { id: 'owner-a' }, error: null })),
    };
    mockFrom.mockReturnValueOnce(read).mockReturnValueOnce(update);

    await expect(
      snapshotRankToCardForOwner('owner-a', 'Elite', 1, [{ id: 'streak', tier: 0 }]),
    ).rejects.toThrow('Account changed. Rank was not saved.');
    expect(update.eq).toHaveBeenCalledWith('id', 'owner-a');
    expect(update.eq).not.toHaveBeenCalledWith('id', 'owner-b');
    expect(writes).toEqual([{ buddy_card: {
      palette_key: 'power_violet',
      private_future_key: true,
      rank_name: 'Elite',
      medals: 1,
      medals_list: [{ id: 'streak', tier: 0 }],
    } }]);
  });
});
